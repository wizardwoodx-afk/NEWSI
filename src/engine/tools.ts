/**
 * SelfImpulse — the specialist tool runtime (19.3.0 "Vanguard").
 *
 * 19.2.0 made the fleet honest. 19.3.0 makes it REAL: specialists stop being
 * prompt personas and become executors with tools. This module is the
 * execution substrate, and it carries the product's identity — the exact
 * opposite of the black-box cloud agent:
 *
 *   • every tool call is RISK-TIERED and rides the SAME human gate as the
 *     rest of the pipeline — a risky tool with no gate is refused, never
 *     auto-run;
 *   • every tool call gets its own RECEIPT — canonical input, outcome,
 *     latency, digest — so a run's evidence chain includes its effects, not
 *     just its text;
 *   • filesystem tools are WORKSPACE-ROOTED: path traversal outside the
 *     root is refused before anything touches disk;
 *   • network egress reuses the product's SSRF guard; the one keyless
 *     network tool (wiki.search) is pinned to a fixed public research
 *     endpoint — arbitrary URLs stay gated behind net.fetch.
 *
 * Honest boundary: this is a deliberately small, inspectable toolset —
 * eight tools a reviewer can read in one sitting. The two pc.* tools ride
 * the 19.5.1 computer-use plane and exist ONLY when the Generalist attaches
 * it to a reach mission; the 19.7.1 mcp.call tool exists ONLY when the
 * owner has ENABLED market servers (the runtime decides); every call still
 * goes through gate + receipt.
 */
import { checkEgressUrl, scanToolCall } from "../security/guardrail";
import { pcExec, missionBrowser } from "./computerUse";
import type { ExecPolicy, BrowserTransport } from "./computerUse";
import type { GateAsk, GateDecision, RiskTier, VhFs } from "./types";

export type ToolId = "fs.list" | "fs.read" | "fs.write" | "net.fetch" | "wiki.search" | "pc.exec" | "pc.browser" | "mcp.call";

export interface ToolDef {
  id: ToolId;
  /** One sentence a reviewer can hold the tool to. */
  purpose: string;
  riskTier: RiskTier;
  /** The input schema, in words — parsed and validated before execution. */
  inputShape: string;
}

export const TOOLS: ToolDef[] = [
  { id: "fs.list", purpose: "List directory entries inside the mission workspace.", riskTier: "safe", inputShape: '{ "path": string }' },
  { id: "fs.read", purpose: "Read a UTF-8 text file inside the mission workspace.", riskTier: "safe", inputShape: '{ "path": string }' },
  { id: "fs.write", purpose: "Write a UTF-8 text file inside the mission workspace (creates parent dirs).", riskTier: "risky", inputShape: '{ "path": string, "content": string }' },
  { id: "net.fetch", purpose: "GET a single http(s) URL and return the body text (SSRF-guarded).", riskTier: "risky", inputShape: '{ "url": string }' },
  { id: "wiki.search", purpose: "Keyless Wikipedia summary search — pinned to the public REST endpoint, no arbitrary egress.", riskTier: "safe", inputShape: '{ "query": string }' },
  { id: "pc.exec", purpose: "Run an allowlisted binary under the mission's computer-use policy — bounded, injection-scanned, receipted.", riskTier: "risky", inputShape: '{ "binary": string, "args": string[] }' },
  { id: "pc.browser", purpose: "Built-in headless browser: open/navigate an HTTPS page or screenshot the loaded page under the mission profile.", riskTier: "risky", inputShape: '{ "action": "open" | "navigate" | "screenshot", "url"?: string, "outPath"?: string }' },
  { id: "mcp.call", purpose: "Reach an MCP server the owner installed at the market: ping it, list its tools, or call one — gated and receipted like every tool.", riskTier: "risky", inputShape: '{ "server": string, "action": "ping" | "list" | "call", "payload"?: { "tool"?: string, "arguments"?: object } }' },
];

export function getTool(id: string): ToolDef | null {
  return TOOLS.find((t) => t.id === id) ?? null;
}

/**
 * The deterministic category → toolset binding. Specialists earn their tools
 * by domain, never by name: a routing change cannot silently grant a new
 * capability. Every entry stays ≤ 3 tools — a bench member is a worker with
 * a toolkit, not a toolbox.
 */
export function toolsForCategory(category: string): ToolId[] {
  switch (category) {
    case "code":
    case "testing":
      return ["fs.list", "fs.read", "fs.write"];
    case "data":
    case "devops":
      return ["fs.list", "fs.read", "fs.write"];
    case "design":
      return ["fs.read", "fs.write"];
    case "security":
    case "review":
      return ["fs.list", "fs.read"]; // read-only by design: auditors don't mutate
    case "research":
      return ["wiki.search", "net.fetch"];
    case "writing":
    case "comms":
      return ["wiki.search", "fs.read", "fs.write"];
    case "analysis":
    case "product":
      return ["fs.read", "wiki.search"];
    case "business":
    case "legal":
      // read-only + research by design: advisors audit, they don't mutate
      return ["fs.read", "wiki.search"];
    case "finance":
    case "silicon":
      // These two had no case at all, so every finance and silicon specialist
      // fell through to the default and received an EMPTY toolset — 700 bench
      // members that could be routed to, gated for, and then do nothing. The
      // shape below matches the other producing categories: read the source
      // material, write the deliverable, consult a pinned reference. No
      // net.fetch, so neither category can reach an arbitrary endpoint by
      // naming one in a prompt.
      return ["fs.read", "fs.write", "wiki.search"];
    default:
      return [];
  }
}

export type ToolOutcome = "ok" | "error" | "gated-out" | "refused";

export interface ToolReceipt {
  /** The tool id — or the literal "(parse-error)" when the model's block was unparseable. Receipts never hide what happened. */
  tool: string;
  /** Canonical JSON of the validated input — what the receipt commits to. */
  inputCanonical: string;
  outcome: ToolOutcome;
  /** The result (or the failure, or the gate's reason) in words. */
  output: string;
  latencyMs: number;
  /** 64-hex digest over {v, tool, inputCanonical, outcome, output} — computed by the caller's hasher. */
  digest?: string;
}

export interface ToolContext {
  /** Every fs.* path resolves inside this root; anything outside is refused. */
  workspaceRoot: string;
  /** The human gate. Risky tools without one are refused, never auto-run. */
  gate?: (ask: GateAsk) => Promise<GateDecision>;
  /** Injectable fetch — probes drive a double; production uses global fetch. */
  fetchImpl?: typeof fetch;
  /**
   * Injectable filesystem (19.4.0). Absent → the genuine node:fs/promises
   * (Node probes, desktop host). The browser front door supplies a virtual
   * or File-System-Access adapter so specialists execute for real there
   * too — same resolver, same gate, same receipts on every surface.
   */
  fsImpl?: VhFs;
  /** Specialist identity for gate asks — provenance, not decoration. */
  specialistId?: string;
  now?: () => Date;
  /** Digest hasher injected by the pipeline so receipts share its SHA-256. */
  hash?: (text: string) => Promise<string>;
  /**
   * 19.5.1 — the computer-use plane, attached by the Generalist ONLY for
   * reach-provenance missions. Absent → pc.* tools refuse, wordedly.
   */
  pc?: { missionId: string; policy: ExecPolicy; transport?: BrowserTransport; run?: (bin: string, args: string[], timeoutMs: number) => { status: number | null; timedOut: boolean; stdout: string; stderr: string } };
  /**
   * 19.7.1 — the MCP host bridge for stdio servers. The desktop shell /
   * MCP host injects an executor; a browser page leaves it absent and
   * stdio calls refuse in words. HTTP servers never need it.
   */
  mcpStdioBridge?: (serverId: string, command: string, args: string[], action: string, payload: unknown) => Promise<string>;
}

const MAX_READ_BYTES = 64 * 1024;
const MAX_FETCH_CHARS = 16_000;
const FETCH_TIMEOUT_MS = 10_000;
/** The single endpoint wiki.search may ever touch — pinned, not configurable. */
const WIKI_ENDPOINT = "https://en.wikipedia.org/api/rest_v1/page/summary/";

/** The protocol text appended to a specialist's prompt when it carries tools. */
export function toolProtocolText(toolIds: ToolId[]): string {
  const list = toolIds
    .map((id) => {
      const t = getTool(id)!;
      return `- ${t.id} (${t.riskTier}) — ${t.purpose} Input: ${t.inputShape}`;
    })
    .join("\n");
  return (
    `You have REAL tools. To use one, emit a fenced block named tool containing ONE JSON object:\n` +
    "\u0060\u0060\u0060tool\n" +
    `{"tool": "<id>", "input": { ... }}\n` +
    "\u0060\u0060\u0060\n" +
    `Available tools:\n${list}\n` +
    `Rules: one tool call per block; wait for the RESULT before continuing; gated or failed tools report the real reason — never invent their output; when the work is done, give your final answer with NO tool blocks.`
  );
}

/** Parse fenced ```tool blocks out of a model reply. Invalid JSON is reported, not guessed. */
export function parseToolBlocks(text: string): Array<{ tool: string; input: Record<string, unknown> } | { parseError: string }> {
  const blocks: Array<{ tool: string; input: Record<string, unknown> } | { parseError: string }> = [];
  const re = /\u0060\u0060\u0060tool\s*\n([\s\S]*?)\u0060\u0060\u0060/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const raw = m[1].trim();
    try {
      const parsed = JSON.parse(raw) as { tool?: unknown; input?: unknown };
      if (typeof parsed?.tool !== "string") {
        blocks.push({ parseError: `tool block missing "tool" field: ${raw.slice(0, 120)}` });
        continue;
      }
      blocks.push({ tool: parsed.tool, input: (parsed.input ?? {}) as Record<string, unknown> });
    } catch {
      blocks.push({ parseError: `tool block is not valid JSON: ${raw.slice(0, 120)}` });
    }
  }
  return blocks;
}

/** The final answer is the reply with all tool fences removed — receipts keep them. */
export function stripToolBlocks(text: string): string {
  return text.replace(/\u0060\u0060\u0060tool\s*\n[\s\S]*?\u0060\u0060\u0060\s*/g, "").trim();
}

/** Root-escape-proof path resolution. Returns null when the path leaves the workspace. */
export function resolveWorkspacePath(root: string, p: string): string | null {
  if (typeof p !== "string" || p.length === 0 || p.includes("\0")) return null;
  // Absolute paths are refused outright — they never mean "relative to root".
  if (p.startsWith("/") || /^[A-Za-z]:[\\/]/.test(p)) return null;
  const base = root.replace(/\/+$/, "");
  // "." legitimately means the workspace root itself.
  if (p === ".") return base;
  // Normalise without node:path so the module stays runtime-agnostic; the
  // probe suite pins traversal behaviour explicitly.
  const parts = p.replace(/\\/g, "/").split("/");
  const stack: string[] = [];
  for (const part of parts) {
    if (part === "" || part === ".") continue;
    if (part === "..") {
      if (stack.length === 0) return null; // escaping the root
      stack.pop();
      continue;
    }
    stack.push(part);
  }
  const rel = stack.join("/");
  if (rel.length === 0) return null;
  return `${base}/${rel}`;
}

interface ToolExecResult {
  outcome: ToolOutcome;
  output: string;
}

/**
 * The storage seam (19.4.0). An injected adapter wins; otherwise the genuine
 * node:fs/promises, wrapped so exec* code is storage-agnostic. Behaviour with
 * no adapter is EXACTLY the 19.3.0 path — same reads, same caps, same errors.
 */
async function fsFor(ctx: ToolContext): Promise<VhFs> {
  if (ctx.fsImpl) return ctx.fsImpl;
  const fs = await import("node:fs/promises");
  const pathMod = await import("node:path");
  return {
    kind: "node",
    async readdir(p) {
      const entries = await fs.readdir(p, { withFileTypes: true });
      return entries.map((e) => ({ name: e.name, isDirectory: e.isDirectory() }));
    },
    async stat(p) {
      const st = await fs.stat(p);
      if (!st.isFile()) return { isFile: false, size: 0 };
      return { isFile: true, size: st.size };
    },
    async readText(p, maxBytes) {
      const st = await fs.stat(p);
      const fh = await fs.open(p, "r");
      try {
        const buf = Buffer.alloc(Math.min(st.size, maxBytes));
        const { bytesRead } = await fh.read(buf, 0, buf.length, 0);
        return { text: buf.subarray(0, bytesRead).toString("utf8"), truncated: st.size > maxBytes };
      } finally {
        await fh.close();
      }
    },
    async mkdir(p) {
      await fs.mkdir(p, { recursive: true });
    },
    async writeText(p, content) {
      await fs.mkdir(pathMod.dirname(p), { recursive: true });
      await fs.writeFile(p, content, "utf8");
    },
  };
}

async function execFsList(input: Record<string, unknown>, ctx: ToolContext): Promise<ToolExecResult> {
  const resolved = resolveWorkspacePath(ctx.workspaceRoot, String(input.path ?? ""));
  if (!resolved) return { outcome: "refused", output: `path refused: "${String(input.path ?? "")}" escapes the workspace root or is invalid` };
  try {
    const fs = await fsFor(ctx);
    const entries = await fs.readdir(resolved);
    const lines = entries.slice(0, 100).map((e) => (e.isDirectory ? `${e.name}/` : e.name));
    return { outcome: "ok", output: lines.length > 0 ? lines.join("\n") : "(empty directory)" };
  } catch (err) {
    return { outcome: "error", output: `fs.list failed: ${err instanceof Error ? err.message : String(err)}` };
  }
}

async function execFsRead(input: Record<string, unknown>, ctx: ToolContext): Promise<ToolExecResult> {
  const resolved = resolveWorkspacePath(ctx.workspaceRoot, String(input.path ?? ""));
  if (!resolved) return { outcome: "refused", output: `path refused: "${String(input.path ?? "")}" escapes the workspace root or is invalid` };
  try {
    const fs = await fsFor(ctx);
    const st = await fs.stat(resolved);
    if (!st.isFile) return { outcome: "error", output: "not a regular file" };
    const { text, truncated } = await fs.readText(resolved, MAX_READ_BYTES);
    const tail = truncated ? `\n[truncated — file is ${st.size} bytes, first ${MAX_READ_BYTES} returned]` : "";
    return { outcome: "ok", output: text + tail };
  } catch (err) {
    return { outcome: "error", output: `fs.read failed: ${err instanceof Error ? err.message : String(err)}` };
  }
}

async function execFsWrite(input: Record<string, unknown>, ctx: ToolContext): Promise<ToolExecResult> {
  const resolved = resolveWorkspacePath(ctx.workspaceRoot, String(input.path ?? ""));
  if (!resolved) return { outcome: "refused", output: `path refused: "${String(input.path ?? "")}" escapes the workspace root or is invalid` };
  if (typeof input.content !== "string") return { outcome: "error", output: `fs.write needs a string "content" field` };
  try {
    const fs = await fsFor(ctx);
    await fs.writeText(resolved, input.content);
    return { outcome: "ok", output: `wrote ${new TextEncoder().encode(input.content).length} bytes to ${input.path}` };
  } catch (err) {
    return { outcome: "error", output: `fs.write failed: ${err instanceof Error ? err.message : String(err)}` };
  }
}

async function execNetFetch(input: Record<string, unknown>, ctx: ToolContext): Promise<ToolExecResult> {
  const url = String(input.url ?? "");
  const egress = checkEgressUrl(url);
  if (!egress.ok) return { outcome: "refused", output: `egress refused: ${egress.reason}` };
  const doFetch = ctx.fetchImpl ?? globalThis.fetch?.bind(globalThis);
  if (!doFetch) return { outcome: "error", output: "no fetch available in this runtime" };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await doFetch(url, { signal: controller.signal, headers: { accept: "text/html,application/json;q=0.9,*/*;q=0.8", "user-agent": "SelfImpulse/19.7 (+evidence-fetch)" } });
    if (!res.ok) return { outcome: "error", output: `HTTP ${res.status} from ${url}` };
    const text = (await res.text()).slice(0, MAX_FETCH_CHARS);
    return { outcome: "ok", output: text };
  } catch (err) {
    const aborted = err instanceof Error && err.name === "AbortError";
    return { outcome: "error", output: aborted ? `fetch timed out after ${FETCH_TIMEOUT_MS}ms` : `fetch failed: ${err instanceof Error ? err.message : String(err)}` };
  } finally {
    clearTimeout(timer);
  }
}

async function execWikiSearch(input: Record<string, unknown>, ctx: ToolContext): Promise<ToolExecResult> {
  const query = String(input.query ?? "").trim();
  if (!query) return { outcome: "error", output: `wiki.search needs a "query" string` };
  const url = WIKI_ENDPOINT + encodeURIComponent(query.replace(/ /g, "_"));
  /* Egress policy applies to anything that leaves the machine. wiki.search is
     tiered "safe" (no human gate), and until now reached the network without
     ever meeting checkEgressUrl — the tier decided gating, so the URL itself
     went unchecked while net.fetch was guarded. */
  const egress = checkEgressUrl(url);
  if (!egress.ok) return { outcome: "refused", output: `egress refused: ${egress.reason}` };
  const doFetch = ctx.fetchImpl ?? globalThis.fetch?.bind(globalThis);
  if (!doFetch) return { outcome: "error", output: "no fetch available in this runtime" };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await doFetch(url, { signal: controller.signal, headers: { accept: "application/json" } });
    if (!res.ok) return { outcome: "error", output: `Wikipedia returned HTTP ${res.status} for "${query.slice(0, 60)}"` };
    const body = (await res.json()) as { title?: string; extract?: string; description?: string };
    if (!body.extract) return { outcome: "error", output: `no Wikipedia summary for "${query.slice(0, 60)}"` };
    return { outcome: "ok", output: `${body.title ?? query}${body.description ? ` — ${body.description}` : ""}\n${body.extract}` };
  } catch (err) {
    const aborted = err instanceof Error && err.name === "AbortError";
    return { outcome: "error", output: aborted ? `wiki.search timed out after ${FETCH_TIMEOUT_MS}ms` : `wiki.search failed: ${err instanceof Error ? err.message : String(err)}` };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Execute one tool call through the full governance path:
 *   validate → gate (risky/critical) → run → typed outcome.
 * Nothing here invents success: a missing gate is a refusal, a parse error
 * is an error, and the output always says what really happened.
 */
export async function executeTool(
  toolId: string,
  input: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolExecResult> {
  const def = getTool(toolId);
  if (!def) return { outcome: "refused", output: `unknown tool "${toolId}" — available: ${TOOLS.map((t) => t.id).join(", ")}` };
  if (input == null || typeof input !== "object") input = {};
  const scan = scanToolCall(toolId, input);
  if (!scan.ok) return { outcome: "refused", output: `guardrail refused: ${scan.reason}` };

  if (def.riskTier !== "safe") {
    if (!ctx.gate) {
      return { outcome: "gated-out", output: `tool ${def.id} is ${def.riskTier} and no human gate is wired into this runtime — nothing was executed` };
    }
    const decision = await ctx.gate({
      action: `tool ${def.id} — ${def.purpose}`,
      riskTier: def.riskTier,
      specialistIds: ctx.specialistId ? [ctx.specialistId] : [],
      summary: JSON.stringify(input).slice(0, 300),
    });
    if (!decision.approved) {
      return { outcome: "gated-out", output: `declined at the gate: ${decision.reason}` };
    }
  }

  switch (def.id) {
    case "fs.list":
      return execFsList(input, ctx);
    case "fs.read":
      return execFsRead(input, ctx);
    case "fs.write":
      return execFsWrite(input, ctx);
    case "net.fetch":
      return execNetFetch(input, ctx);
    case "wiki.search":
      return execWikiSearch(input, ctx);
    case "pc.exec":
      return execPcExec(input, ctx);
    case "pc.browser":
      return execPcBrowser(input, ctx);
    case "mcp.call":
      return execMcpCall(input, ctx);
  }
}

// ── 19.5.1 — the computer-use plane, live in the governed pipeline ─────────
function execPcExec(input: Record<string, unknown>, ctx: ToolContext): ToolExecResult {
  if (!ctx.pc) return { outcome: "refused", output: "computer-use plane is not attached to this mission — the Generalist attaches it only for reach missions" };
  const binary = input.binary;
  const args = Array.isArray(input.args) ? (input.args as unknown[]).map(String) : [];
  if (typeof binary !== "string" || !binary) return { outcome: "error", output: "pc.exec needs a string binary" };
  const r = pcExec(binary, args, ctx.pc.policy, "risky", ctx.pc.run ? { run: ctx.pc.run } : {});
  if (r.decision === "executed") return { outcome: "ok", output: `exit ${r.exitCode}${r.timedOut ? " (timed out)" : ""} — ${r.stdoutPreview || "(no output)"} — ${r.reason}` };
  if (r.decision === "handover") return { outcome: "gated-out", output: r.reason };
  return { outcome: "refused", output: r.reason };
}

async function execPcBrowser(input: Record<string, unknown>, ctx: ToolContext): Promise<ToolExecResult> {
  if (!ctx.pc) return { outcome: "refused", output: "computer-use plane is not attached to this mission — the Generalist attaches it only for reach missions" };
  const action = input.action;
  const browser = missionBrowser(ctx.pc.missionId, ctx.pc.transport ?? undefined);
  if (action === "open" || action === "navigate") {
    const url = typeof input.url === "string" ? input.url : "";
    if (!url) return { outcome: "error", output: "pc.browser open/navigate needs a url" };
    const r = await browser.open(url);
    if (r.decision === "executed" && r.result) return { outcome: "ok", output: `loaded ${r.result.url} (${r.result.status}) — title: ${r.result.title || "(none)"} — ${r.result.links.length} links` };
    if (r.decision === "handover") return { outcome: "gated-out", output: r.reason };
    return { outcome: "refused", output: r.reason };
  }
  if (action === "screenshot") {
    const outPath = typeof input.outPath === "string" ? input.outPath : "";
    if (!outPath) return { outcome: "error", output: "pc.browser screenshot needs an outPath" };
    if (typeof input.url === "string" && input.url) await browser.open(input.url);
    const r = browser.screenshot(outPath);
    if (r.decision === "executed") return { outcome: "ok", output: r.reason };
    if (r.decision === "handover") return { outcome: "gated-out", output: r.reason };
    return { outcome: "refused", output: r.reason };
  }
  return { outcome: "error", output: `pc.browser action must be open | navigate | screenshot, got "${String(action)}"` };
}

/** The mcp.call executor — parse, then the governed seam in mcpRuntime.ts. The lazy import follows the same seam as node:fs above: the module must stay loadable under plain Node either way. */
async function execMcpCall(input: Record<string, unknown>, ctx: ToolContext): Promise<ToolExecResult> {
  const rt = await import("./mcpRuntime");
  const parsed = rt.parseMcpCallInput(input);
  if (!parsed.ok) return { outcome: "error", output: parsed.refusal };
  const servers = rt.mcpRuntimeServers();
  if (!servers.some((s) => s.serverId === parsed.serverId)) {
    return { outcome: "refused", output: `server "${parsed.serverId}" is not in the enabled MCP surface (${servers.length ? servers.map((s) => s.serverId).join(", ") : "none enabled"}) — the market decides what exists, the gate decides what runs` };
  }
  const payloadIn = (input.payload ?? {}) as Record<string, unknown>;
  const payload = parsed.action === "call"
    ? { tool: String(payloadIn.tool ?? ""), arguments: (payloadIn.arguments ?? {}) as Record<string, unknown> }
    : payloadIn;
  const r = await rt.callMcpServer(parsed.serverId, parsed.action, payload, { fetchImpl: ctx.fetchImpl, stdioBridge: ctx.mcpStdioBridge });
  return { outcome: r.outcome, output: r.output };
}

/** Wrap executeTool with timing + a receipt. The digest is computed by the injected hasher so receipts chain into the member digest. */
export async function executeToolReceipted(
  toolId: string,
  input: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolReceipt> {
  const inputCanonical = JSON.stringify({ tool: toolId, input: input ?? {} });
  const t0 = Date.now();
  const { outcome, output } = await executeTool(toolId, input, ctx);
  const latencyMs = Date.now() - t0;
  const receipt: ToolReceipt = { tool: getTool(toolId)?.id ?? toolId, inputCanonical, outcome, output: output.slice(0, 2000), latencyMs };
  if (ctx.hash) {
    receipt.digest = await ctx.hash(JSON.stringify({ v: "engine-tool/1", tool: toolId, inputCanonical, outcome, output: receipt.output }));
  }
  return receipt;
}
