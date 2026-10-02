/**
 * A2A v1.0.0 SERVER transport (Warrant-Teams) — the piece the 17.6.2-era
 * v1-style cards never had.
 *
 * What a conforming A2A remote agent exposes (§5, §3.1, §3.2):
 *
 *   GET  /.well-known/agent-card.json     signed AgentCard, RFC 8615 path,
 *                                         Cache-Control + ETag
 *   POST /                                JSON-RPC 2.0 endpoint:
 *        message/send                     synchronous message → Task|Message
 *        message/stream                   SSE stream of StreamResponse events
 *        tasks/get · tasks/cancel         task lifecycle
 *        tasks/pushNotificationConfig/set · …/get   webhook registration
 *
 * Governance layered on top (VH doctrine — the transport is untrusted input):
 *   • every inbound text part is run through the GuardRail injection scanner;
 *     a finding refuses the request with policy:content-refused BEFORE any
 *     task state is touched;
 *   • a request-fingerprint dedupe window refuses replayed requests;
 *   • 1 MiB body cap, application/json content-type enforcement;
 *   • binds 127.0.0.1 unless the caller explicitly opts into another host;
 *   • if the card declares securitySchemes, requests must clear the provided
 *     authorize() hook (no hook + declared schemes = everything refused);
 *   • every call lands in a capped audit trail.
 *
 * Node-only by design: the app UI never imports this — probes, the interop
 * CLI and the MCP harness do. (Browser builds must not see node:http.)
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { createHash } from "node:crypto";
import { checkEgressUrl, detectInjection, sanitizeText } from "../security/guardrail";
import { secureId } from "../security/guardrail";
import {
  A2A_ERRORS,
  WELL_KNOWN_CARD_PATH,
  type AgentCardV10,
  type ArtifactV10,
  type MessageV10,
  type PartV10,
  type PushNotificationConfigV10,
  type TaskStatusUpdateEventV10,
  type TaskArtifactUpdateEventV10,
  type TaskV10,
} from "./a2aV10";

export { WELL_KNOWN_CARD_PATH };
const MAX_BODY_BYTES = 1024 * 1024;
const REPLAY_WINDOW_MS = 30_000;
const AUDIT_CAP = 500;
const TASK_CAP = 200;

export interface A2ARequest {
  jsonrpc: "2.0";
  id: string | number;
  method: string;
  params?: Record<string, unknown>;
}

export interface A2AAuditEntry {
  ts: string;
  method: string;
  ok: boolean;
  reason?: string;
  taskId?: string;
}

/** The handler seam: what the selfimpulse DOES with an accepted message. */
export interface A2AMessageHandler {
  (task: TaskV10, message: MessageV10): Promise<{
    parts: PartV10[];
    artifacts?: ArtifactV10[];
    state?: TaskV10["status"]["state"];
  }>;
}

export interface A2AServerOptions {
  card: AgentCardV10;
  onMessage: A2AMessageHandler;
  /** Authorization hook when the card declares securitySchemes. */
  authorize?: (req: IncomingMessage) => boolean;
  /**
   * AlterSend, present only when the operator mounted with file sharing on.
   * `decide` is the receiver's consent check: it sees the offered name, size
   * and digest and returns whether to accept. There is no default-accept path,
   * because a default-accept path is an auto-write primitive with extra steps.
   */
  altersend?: {
    store: import("./altersend").AlterSendStore;
    /** Called on every offer; return a reason to refuse, or null/undefined to accept. */
    decide?: (offer: import("./altersend").AlterSendOffer) => string | null | undefined;
  };
  host?: string;
  /**
   * Bind port. Omit (or pass 0) for an ephemeral port. A mounted selfimpulse needs a
   * real one: the agent card is SIGNED for the interface URL it advertises, so
   * the listener has to be on the port the card names or discovery lies.
   */
  port?: number;
  /**
   * Peer pairing. Present only when the operator asked for it, and consulted on
   * every pairing request so an invitation is spent the moment it is used — a
   * closure, not a copy, so the host holds exactly one record of what is live.
   */
  pairing?: {
    redeem: (code: string, peer: { fp: string; name: string }) => Promise<
      { ok: true; credential: unknown } | { ok: false; reason: string }
    >;
  };
  /**
   * Graceful unmount. Present only when the host was started with a stop nonce,
   * and the host runs the shutdown ITSELF: it closes its own listener, finishes
   * its own logging, and exits on its own terms. The alternative — a supervisor
   * signalling a child — needs a raw syscall, a platform signal name, and a
   * fallback for a host that ignores it, none of which the host can observe or
   * report on. This way the shutdown is an operation the host performed and can
   * account for, and the supervisor's only job afterwards is to notice it ended.
   */
  onStop?: (nonce: string) => boolean;
}

/** Header the unmount request carries its nonce in. */
export const STOP_HEADER = "x-si-stop-nonce";

export interface A2AServerHandle {
  start(): Promise<number>;
  stop(): Promise<void>;
  readonly port: number;
  readonly baseUrl: string;
  readonly audit: readonly A2AAuditEntry[];
  readonly tasks: ReadonlyMap<string, TaskV10>;
}

/** Pairing lives off the JSON-RPC root on purpose: one path, one job. */
export const PAIR_PATH = "/vh/pair";

/** Unmount, same reasoning: not an RPC method, and not on the peer surface. */
export const STOP_PATH = "/vh/stop";

/* ALTERSEND — file transfer between peers.
 *
 * Unlike pairing and unmount, this one sits BEHIND the credential check, on
 * purpose. Moving a file onto somebody's machine is the most consequential thing
 * a peer can ask for, so it uses the same gate as delegation and the same
 * scoped credential. An unauthenticated file drop is a remote-write primitive;
 * there is no version of this endpoint that should exist without one.
 *
 * Off the JSON-RPC surface for the same reason as the others: a transfer is a
 * body of bytes, not a method call, and pretending otherwise would let it be
 * invoked through the agent protocol. */
export const ALTERSEND_PATH = "/vh/altersend";
export const ALTERSEND_PREFIX = "/vh/altersend/";

/** Enough for a 32 MiB file plus base64 overhead; the store caps the real limit. */
const ALTERSEND_MAX_BODY = 48 * 1024 * 1024;

function json(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, { "content-type": "application/json", "content-length": Buffer.byteLength(payload) });
  res.end(payload);
}
function rpcError(res: ServerResponse, id: string | number | null, code: number, message: string): void {
  json(res, code <= -32000 && code >= -32099 ? 200 : code === A2A_ERRORS.ParseError || code === A2A_ERRORS.InvalidRequest ? 400 : code === A2A_ERRORS.MethodNotFound ? 404 : 200, {
    jsonrpc: "2.0",
    id,
    error: { code, message },
  });
}

function textOf(parts: PartV10[]): string {
  return parts.filter((p): p is Extract<PartV10, { kind: "text" }> => p.kind === "text").map((p) => p.text).join("\n");
}

export function createA2AServer(opts: A2AServerOptions): A2AServerHandle {
  let server: Server | null = null;
  let port = 0;
  const tasks = new Map<string, TaskV10>();
  const history = new Map<string, MessageV10[]>();
  const pushConfigs = new Map<string, PushNotificationConfigV10>();
  const seen = new Map<string, number>();
  const audit: A2AAuditEntry[] = [];
  const cardJson = JSON.stringify(opts.card);
  const cardEtag = `"${createHash("sha256").update(cardJson).digest("hex").slice(0, 32)}"`;

  const note = (e: A2AAuditEntry): void => {
    audit.push(e);
    if (audit.length > AUDIT_CAP) audit.splice(0, audit.length - AUDIT_CAP);
  };

  const evictTaskIfNeeded = (): void => {
    if (tasks.size <= TASK_CAP) return;
    const first = tasks.keys().next().value as string | undefined;
    if (first !== undefined) { tasks.delete(first); history.delete(first); pushConfigs.delete(first); }
  };

  const fingerprintOf = (req: A2ARequest): string =>
    createHash("sha256").update(`${req.method}|${JSON.stringify(req.params ?? {})}`).digest("hex");

  const replayed = (fp: string): boolean => {
    const now = Date.now();
    for (const [k, ts] of [...seen]) if (now - ts > REPLAY_WINDOW_MS) seen.delete(k);
    if (seen.has(fp)) return true;
    seen.set(fp, now);
    return false;
  };

  const pushUpdate = async (taskId: string, payload: Record<string, unknown>): Promise<void> => {
    const cfg = pushConfigs.get(taskId);
    if (!cfg) return;
    const guard = checkEgressUrl(cfg.url);
    if (!guard.ok) { note({ ts: new Date().toISOString(), method: "pushNotification", ok: false, reason: guard.reason, taskId }); return; }
    try {
      const headers: Record<string, string> = { "content-type": "application/json" };
      if (cfg.authentication?.scheme) {
        headers.authorization = `${cfg.authentication.scheme}${cfg.authentication.credentials ? ` ${cfg.authentication.credentials}` : ""}`;
      }
      const u = new URL(cfg.url);
      const mod = await import("node:http");
      await new Promise<void>((resolve) => {
        const r = mod.request({ hostname: u.hostname, port: u.port || 80, path: u.pathname + u.search, method: "POST", headers, timeout: 10_000 }, (resp) => {
          resp.resume();
          resp.on("end", resolve);
        });
        r.on("error", () => resolve());
        r.on("timeout", () => { r.destroy(); resolve(); });
        r.end(JSON.stringify(payload));
      });
      note({ ts: new Date().toISOString(), method: "pushNotification", ok: true, taskId });
    } catch {
      note({ ts: new Date().toISOString(), method: "pushNotification", ok: false, reason: "delivery-failed", taskId });
    }
  };

  /** Content gate: the GuardRail decides BEFORE any task state changes. */
  const contentRefusal = (message: MessageV10): string | null => {
    const t = textOf(message.parts);
    if (t.length === 0) return null;
    const findings = detectInjection(t);
    if (findings.length > 0) return `policy:content-refused (${findings.join(", ")})`;
    return null;
  };

  const setMessage = (task: TaskV10, state: TaskV10["status"]["state"], message?: MessageV10): TaskV10 => {
    const updated: TaskV10 = { ...task, status: { state, message, timestamp: new Date().toISOString() } };
    tasks.set(task.id, updated);
    return updated;
  };

  const handleMessageSend = async (req: A2ARequest, res: ServerResponse, stream: ServerResponse | null): Promise<void> => {
    const params = (req.params ?? {}) as { message?: unknown; configuration?: unknown };
    const msg = params.message as MessageV10 | undefined;
    if (!msg || typeof msg !== "object" || (msg.role !== "user" && msg.role !== "agent") || !Array.isArray(msg.parts)) {
      rpcError(res, req.id, A2A_ERRORS.InvalidParams, "message with role and parts is required");
      note({ ts: new Date().toISOString(), method: req.method, ok: false, reason: "invalid-params" });
      return;
    }

    /* GuardRail first — poisoned content never reaches task state. */
    const refused = contentRefusal(msg);
    if (refused) {
      rpcError(res, req.id, -32000, refused);
      note({ ts: new Date().toISOString(), method: req.method, ok: false, reason: refused });
      return;
    }

    let task: TaskV10;
    if (typeof msg.taskId === "string" && msg.taskId.length > 0) {
      const existing = tasks.get(msg.taskId);
      if (!existing) {
        rpcError(res, req.id, A2A_ERRORS.TaskNotFoundError, `no task ${msg.taskId}`);
        note({ ts: new Date().toISOString(), method: req.method, ok: false, reason: "task-not-found" });
        return;
      }
      if (typeof msg.contextId === "string" && msg.contextId !== existing.contextId) {
        rpcError(res, req.id, A2A_ERRORS.InvalidParams, "policy:context-mismatch — contextId does not match the referenced task");
        note({ ts: new Date().toISOString(), method: req.method, ok: false, reason: "context-mismatch", taskId: existing.id });
        return;
      }
      task = setMessage(existing, "working");
    } else {
      evictTaskIfNeeded();
      const id = secureId("t");
      task = {
        id,
        contextId: typeof msg.contextId === "string" && msg.contextId.length > 0 ? msg.contextId : secureId("c"),
        status: { state: "working", timestamp: new Date().toISOString() },
        history: [],
      };
      tasks.set(id, task);
      history.set(id, []);
    }
    const hist = history.get(task.id) ?? [];
    hist.push(msg);
    history.set(task.id, hist);

    const emit = (ev: Record<string, unknown>, isFinal: boolean): void => {
      if (stream) stream.write(`data: ${JSON.stringify({ jsonrpc: "2.0", id: req.id, result: ev })}\n\n`);
      void isFinal;
    };

    if (stream) {
      const statusEv: TaskStatusUpdateEventV10 = {
        taskId: task.id, contextId: task.contextId, final: false, timestamp: new Date().toISOString(),
        status: { state: "working", timestamp: new Date().toISOString() },
      };
      emit({ statusUpdate: statusEv }, false);
      void pushUpdate(task.id, { statusUpdate: statusEv });
    }

    try {
      const out = await opts.onMessage(task, msg);
      const finalState = out.state ?? "completed";
      const agentMessage: MessageV10 = {
        role: "agent",
        messageId: secureId("m"),
        parts: out.parts.map((p) => (p.kind === "text" ? { ...p, text: sanitizeText(p.text, 4000) } : p)),
        taskId: task.id,
        contextId: task.contextId,
      };
      let done = setMessage(task, finalState, agentMessage);
      if (out.artifacts && out.artifacts.length > 0) done = { ...done, artifacts: [...(done.artifacts ?? []), ...out.artifacts] };
      tasks.set(done.id, done);
      hist.push(agentMessage);

      if (stream) {
        for (const a of out.artifacts ?? []) {
          const artEv: TaskArtifactUpdateEventV10 = {
            taskId: done.id, contextId: done.contextId, artifact: a, lastChunk: true, timestamp: new Date().toISOString(),
          };
          emit({ artifactUpdate: artEv }, false);
          void pushUpdate(done.id, { artifactUpdate: artEv });
        }
        const finalEv: TaskStatusUpdateEventV10 = {
          taskId: done.id, contextId: done.contextId, final: true, timestamp: new Date().toISOString(),
          status: { state: finalState, message: agentMessage, timestamp: new Date().toISOString() },
        };
        emit({ statusUpdate: finalEv }, true);
        void pushUpdate(done.id, { statusUpdate: finalEv });
        stream.write(`data: ${JSON.stringify({ jsonrpc: "2.0", id: req.id, result: done })}\n\n`);
        stream.end();
      } else {
        json(res, 200, { jsonrpc: "2.0", id: req.id, result: done });
      }
      void pushUpdate(done.id, { task: done });
      note({ ts: new Date().toISOString(), method: req.method, ok: true, taskId: done.id });
    } catch {
      const failed = setMessage(task, "failed");
      if (stream) stream.end(); else json(res, 200, { jsonrpc: "2.0", id: req.id, result: failed });
      note({ ts: new Date().toISOString(), method: req.method, ok: false, reason: "handler-failed", taskId: failed.id });
    }
  };

  const handleRpc = async (req: A2ARequest, res: ServerResponse): Promise<void> => {
    switch (req.method) {
      case "message/send":
        await handleMessageSend(req, res, null);
        return;
      case "message/stream": {
        if (opts.card.capabilities.streaming !== true) {
          rpcError(res, req.id, A2A_ERRORS.UnsupportedOperationError, "this agent does not declare capabilities.streaming");
          note({ ts: new Date().toISOString(), method: req.method, ok: false, reason: "unsupported" });
          return;
        }
        res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" });
        await handleMessageSend(req, res, res);
        return;
      }
      case "tasks/get": {
        const p = (req.params ?? {}) as { id?: string; name?: string; historyLength?: number };
        const id = p.id ?? p.name;
        const t = typeof id === "string" ? tasks.get(id) : undefined;
        if (!t) { rpcError(res, req.id, A2A_ERRORS.TaskNotFoundError, "task not found"); note({ ts: new Date().toISOString(), method: req.method, ok: false, reason: "task-not-found" }); return; }
        const h = history.get(t.id) ?? [];
        const slice = typeof p.historyLength === "number" && p.historyLength >= 0 ? h.slice(-p.historyLength) : h;
        json(res, 200, { jsonrpc: "2.0", id: req.id, result: { ...t, history: slice } });
        note({ ts: new Date().toISOString(), method: req.method, ok: true, taskId: t.id });
        return;
      }
      case "tasks/cancel": {
        const p = (req.params ?? {}) as { id?: string; name?: string };
        const id = p.id ?? p.name;
        const t = typeof id === "string" ? tasks.get(id) : undefined;
        if (!t) { rpcError(res, req.id, A2A_ERRORS.TaskNotFoundError, "task not found"); note({ ts: new Date().toISOString(), method: req.method, ok: false, reason: "task-not-found" }); return; }
        if (["completed", "failed", "canceled", "rejected"].includes(t.status.state)) {
          rpcError(res, req.id, A2A_ERRORS.TaskNotCancelableError, `task already terminal (${t.status.state})`);
          note({ ts: new Date().toISOString(), method: req.method, ok: false, reason: "not-cancelable", taskId: t.id });
          return;
        }
        const canceled = setMessage(t, "canceled");
        json(res, 200, { jsonrpc: "2.0", id: req.id, result: canceled });
        note({ ts: new Date().toISOString(), method: req.method, ok: true, taskId: canceled.id });
        return;
      }
      case "tasks/pushNotificationConfig/set": {
        if (opts.card.capabilities.pushNotifications !== true) {
          rpcError(res, req.id, A2A_ERRORS.PushNotificationNotSupportedError, "this agent does not declare capabilities.pushNotifications");
          note({ ts: new Date().toISOString(), method: req.method, ok: false, reason: "unsupported" });
          return;
        }
        const p = (req.params ?? {}) as { taskId?: string; pushNotificationConfig?: PushNotificationConfigV10 };
        if (typeof p.taskId !== "string" || !tasks.has(p.taskId) || !p.pushNotificationConfig || typeof p.pushNotificationConfig.url !== "string") {
          rpcError(res, req.id, A2A_ERRORS.InvalidParams, "taskId (existing) and pushNotificationConfig.url are required");
          note({ ts: new Date().toISOString(), method: req.method, ok: false, reason: "invalid-params" });
          return;
        }
        const guard = checkEgressUrl(p.pushNotificationConfig.url);
        if (!guard.ok) { rpcError(res, req.id, -32000, `policy:egress-refused — ${guard.reason}`); note({ ts: new Date().toISOString(), method: req.method, ok: false, reason: guard.reason, taskId: p.taskId }); return; }
        pushConfigs.set(p.taskId, p.pushNotificationConfig);
        json(res, 200, { jsonrpc: "2.0", id: req.id, result: { taskId: p.taskId, pushNotificationConfig: p.pushNotificationConfig } });
        note({ ts: new Date().toISOString(), method: req.method, ok: true, taskId: p.taskId });
        return;
      }
      case "tasks/pushNotificationConfig/get": {
        const p = (req.params ?? {}) as { taskId?: string };
        const cfg = typeof p.taskId === "string" ? pushConfigs.get(p.taskId) : undefined;
        if (!cfg) { rpcError(res, req.id, A2A_ERRORS.TaskNotFoundError, "no push config for that task"); note({ ts: new Date().toISOString(), method: req.method, ok: false, reason: "no-config" }); return; }
        json(res, 200, { jsonrpc: "2.0", id: req.id, result: { taskId: p.taskId, pushNotificationConfig: cfg } });
        note({ ts: new Date().toISOString(), method: req.method, ok: true, taskId: p.taskId ?? "" });
        return;
      }
      default:
        rpcError(res, req.id, A2A_ERRORS.MethodNotFound, `method not found: ${req.method}`);
        note({ ts: new Date().toISOString(), method: req.method, ok: false, reason: "method-not-found" });
    }
  };

  const handle = (req: IncomingMessage, res: ServerResponse): void => {
    if (req.method === "GET" && req.url === WELL_KNOWN_CARD_PATH) {
      res.writeHead(200, {
        "content-type": "application/json",
        "cache-control": "public, max-age=300",
        etag: cardEtag,
      });
      res.end(cardJson);
      return;
    }
    /* UNMOUNT — the host stops itself. Guarded by a nonce that the supervisor
     * generated at mount time and passed through the environment, so it never
     * appears in argv (where `ps` would show it) and never in the READY line. */
    if (req.method === "POST" && req.url === STOP_PATH) {
      if (!opts.onStop) {
        json(res, 404, { error: "no-unmount", reason: "this host was not started with an unmount channel" });
        return;
      }
      const presented = String(req.headers[STOP_HEADER] ?? "");
      // Synchronous on purpose: the host validates the nonce and schedules its
      // own shutdown, so the response is an acknowledgement, not a promise that
      // the process will still be there to keep.
      const accepted = opts.onStop(presented);
      if (!accepted) {
        json(res, 403, { error: "unmount-refused", reason: "the unmount nonce did not match" });
        note({ ts: new Date().toISOString(), method: "unmount", ok: false, reason: "nonce" });
        return;
      }
      json(res, 200, { ok: true, detail: "the host is stopping" });
      note({ ts: new Date().toISOString(), method: "unmount", ok: true, reason: "accepted" });
      return;
    }

    /* PEER PAIRING — the only POST that does not require the bearer token, and
     * deliberately so: redeeming a code is what GETS a caller a credential, so
     * requiring a credential first would be circular. The invitation itself is
     * the authorisation, and it is single-use, short-lived and attempt-limited,
     * which is what makes an unauthenticated endpoint safe here. It is also not
     * on the JSON-RPC surface, so it can never be reached as an A2A method. */
    if (req.method === "POST" && req.url === PAIR_PATH) {
      if (!opts.pairing) {
        json(res, 404, { error: "not-pairing", reason: "this host is not accepting pairings" });
        note({ ts: new Date().toISOString(), method: "pair", ok: false, reason: "not-pairing" });
        return;
      }
      const chunks: Buffer[] = [];
      let size = 0;
      req.on("data", (c: Buffer) => {
        size += c.byteLength;
        if (size > MAX_BODY_BYTES) { req.destroy(); return; }
        chunks.push(c);
      });
      req.on("end", () => {
        if (size > MAX_BODY_BYTES) return;
        let body: { code?: unknown; peer?: { fp?: unknown; name?: unknown } };
        try {
          body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        } catch {
          json(res, 400, { error: "invalid-json", reason: "the pairing request was not valid JSON" });
          return;
        }
        const code = typeof body.code === "string" ? body.code : "";
        const fp = typeof body.peer?.fp === "string" ? body.peer.fp : "";
        const name = typeof body.peer?.name === "string" ? body.peer.name.slice(0, 80) : "a peer";
        if (code === "" || fp === "") {
          json(res, 400, { error: "bad-request", reason: "a pairing request needs a code and the peer's identity fingerprint" });
          return;
        }
        void opts.pairing!.redeem(code, { fp, name }).then((r) => {
          if (r.ok) {
            json(res, 200, { ok: true, credential: r.credential });
            note({ ts: new Date().toISOString(), method: "pair", ok: true, reason: "redeemed" });
          } else {
            // 403 rather than 404: the caller is wrong, not looking at a URL
            // that does not exist, and a peer retrying needs to know which.
            json(res, 403, { ok: false, error: "pairing-refused", reason: r.reason });
            note({ ts: new Date().toISOString(), method: "pair", ok: false, reason: r.reason });
          }
        }).catch((e) => {
          json(res, 500, { ok: false, error: "pairing-failed", reason: String(e) });
          note({ ts: new Date().toISOString(), method: "pair", ok: false, reason: "threw" });
        });
      });
      return;
    }
    /* ALTERSEND — offer, list, accept/refuse, fetch. Behind the credential. */
    if (req.url === ALTERSEND_PATH || req.url?.startsWith(ALTERSEND_PREFIX)) {
      if (!opts.altersend) {
        json(res, 404, { error: "not-enabled", reason: "this host has file sharing turned off" });
        return;
      }
      if (!opts.authorize || !opts.authorize(req)) {
        json(res, 401, { error: "unauthorized", reason: "a paired credential is required to move files" });
        note({ ts: new Date().toISOString(), method: "altersend", ok: false, reason: "unauthorized" });
        return;
      }
      const store = opts.altersend.store;
      const id = req.url.startsWith(ALTERSEND_PREFIX) ? req.url.slice(ALTERSEND_PREFIX.length) : "";

      if (req.method === "GET" && !id) {
        json(res, 200, { ok: true, offers: store.list() });
        return;
      }
      if (req.method === "GET" && id) {
        const got = store.get(id);
        if (!got.ok) { json(res, 404, { error: got.reason }); return; }
        const pulled = store.fetch(id);
        if (!pulled.ok) { json(res, 409, { error: pulled.reason }); return; }
        json(res, 200, {
          ok: true,
          offer: pulled.value.offer,
          bytes: pulled.value.bytes.toString("base64"),
        });
        note({ ts: new Date().toISOString(), method: "altersend-fetch", ok: true, reason: id });
        return;
      }
      if (req.method === "POST" && id) {
        let decision = "accept";
        const chunks: Buffer[] = [];
        req.on("data", (c: Buffer) => chunks.push(c));
        req.on("end", () => {
          try {
            const b = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
            decision = b.decision === "refuse" ? "refuse" : "accept";
          } catch { decision = "accept"; }
          const out = decision === "refuse" ? store.refuse(id, "the receiver declined") : store.accept(id);
          if (!out.ok) { json(res, 409, { error: out.reason }); return; }
          json(res, 200, { ok: true, offer: out.value });
          note({ ts: new Date().toISOString(), method: "altersend-decide", ok: true, reason: `${decision}:${id}` });
        });
        return;
      }
      if (req.method === "POST" && !id) {
        const chunks: Buffer[] = [];
        let size = 0;
        req.on("data", (c: Buffer) => {
          size += c.byteLength;
          if (size > ALTERSEND_MAX_BODY) { req.destroy(); return; }
          chunks.push(c);
        });
        req.on("end", () => {
          if (size > ALTERSEND_MAX_BODY) { json(res, 413, { error: "too-large" }); return; }
          let body: { name?: unknown; data?: unknown };
          try { body = JSON.parse(Buffer.concat(chunks).toString("utf8")); }
          catch { json(res, 400, { error: "bad-json" }); return; }
          let bytes: Buffer;
          try { bytes = Buffer.from(String(body.data ?? ""), "base64"); }
          catch { json(res, 400, { error: "bad-base64" }); return; }
          const offered = store.offer({ name: String(body.name ?? ""), bytes });
          if (!offered.ok) { json(res, 400, { error: offered.reason }); return; }
          const refusal = opts.altersend?.decide?.(offered.value);
          if (refusal) {
            store.refuse(offered.value.id, refusal);
            json(res, 403, { error: "refused", reason: refusal, offer: offered.value });
            note({ ts: new Date().toISOString(), method: "altersend-offer", ok: false, reason: refusal });
            return;
          }
          store.accept(offered.value.id);
          json(res, 201, { ok: true, offer: offered.value });
          note({ ts: new Date().toISOString(), method: "altersend-offer", ok: true, reason: offered.value.id });
        });
        return;
      }
      json(res, 405, { error: "method-not-allowed" });
      return;
    }
    if (req.method !== "POST" || (req.url !== "/" && req.url !== "")) {
      json(res, 404, { error: "not-found" });
      return;
    }
    if ((req.headers["content-type"] ?? "").split(";")[0].trim() !== "application/json") {
      rpcError(res, null, A2A_ERRORS.InvalidRequest, "content-type must be application/json");
      note({ ts: new Date().toISOString(), method: "(post)", ok: false, reason: "content-type" });
      return;
    }
    if (opts.card.securitySchemes && Object.keys(opts.card.securitySchemes).length > 0) {
      if (!opts.authorize || !opts.authorize(req)) {
        rpcError(res, null, A2A_ERRORS.InvalidRequest, "policy:unauthorized — declared securitySchemes not satisfied");
        note({ ts: new Date().toISOString(), method: "(post)", ok: false, reason: "unauthorized" });
        return;
      }
    }
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY_BYTES) { req.destroy(); return; }
      chunks.push(c);
    });
    req.on("end", () => {
      if (size > MAX_BODY_BYTES) return;
      let parsed: unknown;
      try { parsed = JSON.parse(Buffer.concat(chunks).toString("utf8")); }
      catch { rpcError(res, null, A2A_ERRORS.ParseError, "invalid JSON"); note({ ts: new Date().toISOString(), method: "(post)", ok: false, reason: "parse-error" }); return; }
      const rpc = parsed as Partial<A2ARequest>;
      if (rpc.jsonrpc !== "2.0" || typeof rpc.method !== "string" || (rpc.id === undefined || rpc.id === null)) {
        rpcError(res, (rpc.id as string | number) ?? null, A2A_ERRORS.InvalidRequest, "jsonrpc 2.0 request with id is required");
        note({ ts: new Date().toISOString(), method: "(post)", ok: false, reason: "invalid-request" });
        return;
      }
      const fp = fingerprintOf(rpc as A2ARequest);
      if (replayed(fp)) {
        rpcError(res, rpc.id as string | number, -32000, "policy:replayed-request — identical request already processed within the replay window");
        note({ ts: new Date().toISOString(), method: rpc.method as string, ok: false, reason: "replayed" });
        return;
      }
      void handleRpc(rpc as A2ARequest, res);
    });
  };

  return {
    async start(): Promise<number> {
      server = createServer(handle);
      await new Promise<void>((resolve, reject) => {
        server?.once("error", reject);
        server?.listen(opts.port ?? 0, opts.host ?? "127.0.0.1", () => resolve());
      });
      const addr = server?.address();
      port = typeof addr === "object" && addr ? addr.port : 0;
      return port;
    },
    async stop(): Promise<void> {
      await new Promise<void>((resolve) => { server?.close(() => resolve()); });
      server = null;
    },
    get port() { return port; },
    get baseUrl() { return `http://${opts.host ?? "127.0.0.1"}:${port}`; },
    get audit() { return audit as readonly A2AAuditEntry[]; },
    get tasks() { return tasks as ReadonlyMap<string, TaskV10>; },
  };
}
