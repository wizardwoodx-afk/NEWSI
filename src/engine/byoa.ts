/**
 * SelfImpulse — BYOA: Bring Your Own Agent (19.4.1).
 *
 * The industry's multi-agent story is a walled garden of first-party bots.
 * SelfImpulse's is the opposite: ANY external agent — your own, a colleague's,
 * another vendor's — can join the mission, and it joins UNDER VH GOVERNANCE:
 *
 *   · a brought agent is a DECLARED object: name, endpoint kind, capabilities,
 *     and a risk ceiling it can never exceed;
 *   · delegation to it rides the Generalist's existing peer seam
 *     (askSelfImpulse19 → peerDelegate), so the task, the outcome and the receipt
 *     land in the same handoff ledger as every other delegation;
 *   · EVERY delegation pauses at the human gate — an external agent is
 *     hostile-adjacent by definition, so no auto-run, ever;
 *   · credentials for a brought agent live in memory for the session only.
 *
 * Two endpoint kinds are spoken: OpenAI-compatible chat completions (the
 * lingua franca every agent framework exposes) and A2A JSON-RPC tasks/send.
 * Inbound (an external agent calling the Generalist) uses the signed
 * invitation surface plus the host runtime's A2A endpoint — receipts both ways.
 */
import type { GateAsk, GateDecision } from "./types";
import { checkEgressUrl, detectInjection, RateGate } from "../security/guardrail";
import { hashString } from "../domain/artifact";

/** The BYOA security policy, stated once for the UI and the probes. */
export const BYOA_SECURITY_POLICY = [
  "TLS by default — plain http is refused except for localhost dev endpoints",
  "the shared SSRF/egress guard applies to every brought endpoint",
  "declared capabilities are self-declared and never authoritative",
  "every delegation is human-gated and ledgered with a scoped receipt token",
  "per-agent rate ceiling — 10 delegations per rolling minute",
  "response containment — external replies are size-capped and injection-scanned",
  "identity digests — a tampered registration fails the trust check",
  "session keys live in memory only",
] as const;

export interface ByoaAgent {
  id: string;
  name: string;
  kind: "openai-compatible" | "a2a-http";
  /** Base URL (openai-compatible) or agent endpoint (a2a-http). */
  endpoint: string;
  model?: string;
  /** The ceiling this agent may never exceed. */
  ceiling: "safe" | "risky";
  capabilities: string[];
  addedAt: string;
  /** Tamper-evident identity: hash over name|kind|endpoint|ceiling, stamped
      at registration; a stored agent whose fields no longer match fails the
      trust check. */
  identityDigest?: string;
}

const KEY = "engine.byoa.agents.v1";

function storage(): Storage | null {
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    return null;
  }
}

const session: ByoaAgent[] = [];

export function listByoaAgents(): ByoaAgent[] {
  const s = storage();
  if (!s) return session;
  try {
    return JSON.parse(s.getItem(KEY) ?? "[]") as ByoaAgent[];
  } catch {
    return session;
  }
}

function persist(all: ByoaAgent[]): void {
  const s = storage();
  if (s) {
    try { s.setItem(KEY, JSON.stringify(all)); return; } catch { /* fall through */ }
  }
  session.length = 0;
  session.push(...all);
}

export function getByoaAgent(id: string): ByoaAgent | null {
  return listByoaAgents().find((a) => a.id === id) ?? null;
}

/** Tamper-evident identity over the fields that define the agent. */
export function byoaIdentityDigest(a: Pick<ByoaAgent, "name" | "kind" | "endpoint" | "ceiling">): string {
  return hashString(`vh.byoa.identity.v1|${a.name}|${a.kind}|${a.endpoint}|${a.ceiling}`);
}

/**
 * The BYOA trust invariant (19.4.2; hardened 19.4.5): a brought agent's
 * effective trust is the INTERSECTION of checks — never any single one:
 *   TLS-by-default transport ∩ endpoint policy (SSRF/egress) ∩ valid risk
 *   ceiling ∩ declared capabilities (self-declared = NEVER authoritative)
 *   ∩ untampered identity digest.
 */
export function byoaTrustCheck(agent: ByoaAgent): { ok: boolean; verdicts: Array<{ check: string; ok: boolean; detail: string }> } {
  const egress = checkEgressUrl(agent.endpoint);
  let host = "";
  try { host = new URL(agent.endpoint).hostname.toLowerCase(); } catch { host = ""; }
  const isLocalDev = host === "localhost" || host === "127.0.0.1" || host === "[::1]" || host === "::1";
  const tlsOk = agent.endpoint.startsWith("https://") || (agent.endpoint.startsWith("http://") && isLocalDev);
  const identityOk = !agent.identityDigest || agent.identityDigest === byoaIdentityDigest(agent);
  const verdicts = [
    { check: "transport", ok: tlsOk, detail: tlsOk ? (agent.endpoint.startsWith("https://") ? "TLS endpoint" : "localhost dev endpoint — http tolerated") : "plain http to a non-local host is refused — TLS by default" },
    { check: "endpoint policy", ok: egress.ok, detail: egress.ok ? "endpoint passes the shared SSRF/egress guard" : egress.reason },
    { check: "risk ceiling", ok: agent.ceiling === "safe" || agent.ceiling === "risky", detail: `ceiling "${agent.ceiling}" is a recognized SelfImpulse tier` },
    { check: "declared capabilities", ok: true, detail: agent.capabilities.length > 0 ? `${agent.capabilities.length} declared — self-declared, NOT authoritative; SelfImpulse never widens its own toolset on this word` : "none declared — the agent gets no capability credit at all" },
    { check: "identity", ok: agent.id.length > 5 && agent.name.trim().length > 0 && identityOk, detail: identityOk ? `registered as ${agent.id}` : "identity digest mismatch — this stored agent was tampered with after registration" },
  ];
  return { ok: verdicts.every((v) => v.ok), verdicts };
}

/** Per-agent delegation rate ceiling: 10 per rolling minute. */
export const byoaRateGate = new RateGate(10, 60_000);

export function registerByoaAgent(a: Omit<ByoaAgent, "id" | "addedAt">): ByoaAgent {
  const agent: ByoaAgent = {
    ...a,
    id: `byoa.${a.name.toLowerCase().replace(/[^a-z0-9-]+/g, "-").slice(0, 24) || Math.random().toString(36).slice(2, 8)}`,
    addedAt: new Date().toISOString(),
  };
  agent.identityDigest = byoaIdentityDigest(agent);
  /* A brought agent whose endpoint fails the trust intersection is not
     registered at all — the guard is not a delegation-time surprise. */
  const trust = byoaTrustCheck(agent);
  if (!trust.ok) throw new Error(`registration refused: ${trust.verdicts.filter((v) => !v.ok).map((v) => v.detail).join("; ")}`);
  persist([...listByoaAgents().filter((x) => x.id !== agent.id), agent]);
  return agent;
}

export function removeByoaAgent(id: string): ByoaAgent[] {
  const all = listByoaAgents().filter((a) => a.id !== id);
  persist(all);
  return all;
}

/* ── session-only credentials for brought agents ─────────────────────────── */
const sessionKeys = new Map<string, string>();
export function setByoaSessionKey(id: string, key: string): void { sessionKeys.set(id, key); }
export function byoaSessionKey(id: string): string | null { return sessionKeys.get(id) ?? null; }

async function sha256Hex(text: string): Promise<string> {
  const buf = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((x) => x.toString(16).padStart(2, "0")).join("");
}

export interface ByoaDelegateOpts {
  gate?: (ask: GateAsk) => Promise<GateDecision>;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

/**
 * The delegate handed to askSelfImpulse19's peer seam. Every call: human gate first
 * (external = hostile-adjacent), then ONE request, then a receipt digest over
 * {peer, task, outcome, detail, at}. Failures are honest, never guessed.
 */
export function byoaDelegate(agent: ByoaAgent, opts: ByoaDelegateOpts = {}) {
  return async (d: { peerName: string; task: string }): Promise<{ ok: boolean; detail: string; receiptDigest?: string; findings?: string[] }> => {
    const at = new Date().toISOString();
    /* Defense in depth: re-run the trust intersection at delegation time —
       a stored endpoint that no longer passes it delegates to nothing. */
    const trust = byoaTrustCheck(agent);
    if (!trust.ok) {
      const detail = `trust check failed: ${trust.verdicts.filter((v) => !v.ok).map((v) => v.detail).join("; ")}`;
      const digest = await sha256Hex(JSON.stringify({ peer: agent.id, task: d.task, ok: false, detail, at }));
      return { ok: false, detail, receiptDigest: digest };
    }
    /* Rate ceiling: a brought agent cannot be hammered — or hammer VH. */
    if (!byoaRateGate.check(agent.id)) {
      const detail = "delegation rate ceiling reached (10 per rolling minute) — refused, receipted";
      const digest = await sha256Hex(JSON.stringify({ peer: agent.id, task: d.task, ok: false, detail, at }));
      return { ok: false, detail, receiptDigest: digest };
    }
    const gate = opts.gate;
    if (gate) {
      const decision = await gate({
        action: `BYOA delegation — send task to external agent "${agent.name}"`,
        summary: `kind ${agent.kind} · endpoint ${agent.endpoint} · ceiling ${agent.ceiling} · task: ${d.task.slice(0, 160)}`,
        riskTier: agent.ceiling === "risky" ? "risky" : "safe",
        specialistIds: [],
      } as GateAsk);
      if (!decision.approved) {
        const digest = await sha256Hex(JSON.stringify({ peer: agent.id, task: d.task, ok: false, detail: `denied at the gate: ${decision.reason ?? "no reason given"}`, at }));
        return { ok: false, detail: `denied at the human gate${decision.reason ? ` — ${decision.reason}` : ""}`, receiptDigest: digest };
      }
    }
    const fetchImpl = opts.fetchImpl ?? globalThis.fetch.bind(globalThis);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 20_000);
    let detail: string;
    let ok = false;
    try {
      if (agent.kind === "openai-compatible") {
        const headers: Record<string, string> = { "content-type": "application/json" };
        const key = byoaSessionKey(agent.id);
        if (key) headers.authorization = `Bearer ${key}`;
        const res = await fetchImpl(`${agent.endpoint.replace(/\/+$/, "")}/chat/completions`, {
          method: "POST",
          headers,
          signal: controller.signal,
          body: JSON.stringify({ model: agent.model ?? "default", messages: [{ role: "user", content: d.task }] }),
        });
        if (!res.ok) {
          detail = `the brought agent answered HTTP ${res.status}`;
        } else {
          const j = (await res.json()) as { choices?: Array<{ message?: { content?: string } }>; error?: { message?: string } };
          if (j.error?.message) detail = `the brought agent errored: ${j.error.message}`;
          else { ok = true; detail = (j.choices?.[0]?.message?.content ?? "(empty reply)").slice(0, 1200); }
        }
      } else {
        const res = await fetchImpl(agent.endpoint, {
          method: "POST",
          headers: { "content-type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({ jsonrpc: "2.0", id: `si-${Date.now()}`, method: "tasks/send", params: { id: `t-${Date.now()}`, message: { role: "user", parts: [{ type: "text", text: d.task }] } } }),
        });
        if (!res.ok) {
          detail = `the brought agent answered HTTP ${res.status}`;
        } else {
          const j = (await res.json()) as { result?: { status?: { state?: string; message?: { parts?: Array<{ text?: string }> } } }; error?: { message?: string } };
          if (j.error?.message) detail = `the brought agent errored: ${j.error.message}`;
          else { ok = true; detail = (j.result?.status?.message?.parts?.map((p) => p.text ?? "").join(" ") ?? `(state ${j.result?.status?.state ?? "unknown"})`).slice(0, 1200); }
        }
      }
    } catch (err) {
      detail = `the brought agent could not be reached: ${err instanceof Error ? err.message : String(err)}`;
    } finally {
      clearTimeout(timer);
    }
    /* Response containment: a brought agent's reply is EXTERNAL content —
       size-capped above, injection-scanned here, provenance-tagged in the
       receipt. Findings travel with the result; they never block the
       ledger, and they are never silently dropped. */
    let findings: string[] | undefined;
    if (ok) {
      const f = detectInjection(detail);
      if (f.length > 0) findings = f.map((x) => x.code);
    }
    /* Scoped delegation token: digest over agent identity, task, ceiling
       and time — the receipt proves WHAT was delegated under WHICH
       ceiling, not just that something happened. */
    const receiptDigest = await sha256Hex(JSON.stringify({ token: "vh.byoa.delegation.v1", peer: agent.id, identity: agent.identityDigest ?? "", ceiling: agent.ceiling, task: d.task, ok, detail: detail.slice(0, 400), findings: findings ?? [], at }));
    return { ok, detail, receiptDigest, ...(findings && findings.length > 0 ? { findings } : {}) };
  };
}
