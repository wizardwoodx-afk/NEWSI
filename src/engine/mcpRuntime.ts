/**
 * SelfImpulse — the MCP runtime (19.7.1).
 *
 * The 19.7.0 review named the gap exactly: the market was a registry +
 * export layer, not a runtime — nothing consumed `listInstalled()` and
 * attached servers to SelfImpulse's capability surface. This module closes it:
 *
 *   market install (zod + SSRF at the market)
 *     ↓  policy review at RUNTIME (the same egress guard again + risk tier)
 *     ↓  mcpRuntimeServers() — every ENABLED server becomes a governed tool
 *     ↓  the agent loop advertises `mcp.call` in the tool protocol,
 *        naming the servers and what they are for
 *     ↓  the model calls it like ANY other tool —
 *        gate (risky tier, no autonomy shortcuts) → execution → RECEIPT
 *
 * Execution honesty, stated on every surface:
 *   • HTTP servers: a REAL JSON-RPC call (initialize is implied by the
 *     stateless request; ping / tools/list / tools/call), through the same
 *     SSRF egress guard, with a timeout and an output cap;
 *   • stdio servers: the BROWSER cannot spawn processes — so execution
 *     rides a host bridge when the desktop shell provides one, and refuses
 *     in words when it does not. Nothing is faked.
 */

import { checkEgressUrl } from "../security/guardrail";
import { listInstalled } from "./mcpMarket";

export const MCP_CALL_TIMEOUT_MS = 12_000;
export const MCP_OUTPUT_CAP = 2_000;

export interface McpToolSurfaceEntry {
  serverId: string;
  name: string;
  transport: "stdio" | "http";
  /** one line a reviewer can hold the integration to */
  purpose: string;
  /** env var NAMES the host must resolve — values never ride this surface */
  envNames: string[];
}

/** Every ENABLED registered server, as a governed tool-surface entry. */
export function mcpRuntimeServers(): McpToolSurfaceEntry[] {
  return listInstalled()
    .filter((s) => s.enabled)
    .map((s) => ({
      serverId: s.id,
      name: s.name,
      transport: s.transport,
      purpose: s.note?.slice(0, 160) || `${s.name} — user-registered MCP ${s.transport} server`,
      envNames: s.envNames ?? [],
    }));
}

export function mcpRuntimeEnabled(): boolean {
  return mcpRuntimeServers().length > 0;
}

export interface McpCallResult {
  outcome: "ok" | "error" | "refused";
  output: string;
}

export interface McpExecContext {
  /** Injectable fetch — probes drive a double; production uses global fetch. */
  fetchImpl?: typeof fetch;
  /**
   * The HOST BRIDGE (19.7.1). The desktop shell / MCP host may inject an
   * executor for stdio servers; the browser page never spawns processes
   * and says so. Signature: (command, args, action, payload) → text.
   */
  stdioBridge?: (serverId: string, command: string, args: string[], action: string, payload: unknown) => Promise<string>;
  now?: () => Date;
}

function jsonRpcId(now?: () => Date): number {
  return (now ? now() : new Date()).getTime() % 1_000_000;
}

/**
 * The governed execution seam for one MCP request. This is what the
 * `mcp.call` tool lands in — AFTER the generic risky-tool gate has already
 * approved it (see tools.ts), so a human decision rides every external
 * call the first time policy demands it.
 */
export async function callMcpServer(serverId: string, action: "ping" | "list" | "call", payload: unknown, exec: McpExecContext = {}): Promise<McpCallResult> {
  const server = listInstalled().find((s) => s.id === serverId);
  if (!server) return { outcome: "refused", output: `no MCP server registered under "${serverId}" — the market's registry is the only door; nothing was called` };
  if (!server.enabled) return { outcome: "refused", output: `MCP server "${server.name}" is registered but DISABLED — enable it at the market first; nothing was called` };

  if (server.transport === "http") {
    const url = server.url ?? "";
    const egress = checkEgressUrl(url);
    if (!egress.ok) return { outcome: "refused", output: `the server's URL is refused by the SAME SSRF egress guard every provider call passes: ${egress.reason} — nothing was sent` };
    const doFetch = exec.fetchImpl ?? globalThis.fetch?.bind(globalThis);
    if (!doFetch) return { outcome: "refused", output: "no fetch is available in this runtime — nothing was sent" };
    const method = action === "ping" ? "ping" : action === "list" ? "tools/list" : "tools/call";
    const body = JSON.stringify({ jsonrpc: "2.0", id: jsonRpcId(exec.now), method, params: (payload ?? {}) as Record<string, unknown> });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), MCP_CALL_TIMEOUT_MS);
    const t0 = Date.now();
    try {
      const res = await doFetch(url, { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream" }, body, signal: controller.signal });
      const latency = Date.now() - t0;
      if (!res.ok) return { outcome: "error", output: `the MCP server answered HTTP ${res.status} in ${latency}ms — the error is reported, not dressed up` };
      const text = (await res.text().catch(() => "")).slice(0, MCP_OUTPUT_CAP);
      if (!text) return { outcome: "error", output: `the MCP server returned an empty body in ${latency}ms` };
      return { outcome: "ok", output: `mcp ${method} → ${text}` };
    } catch (err) {
      const aborted = err instanceof Error && err.name === "AbortError";
      return { outcome: "error", output: aborted ? `the MCP server did not answer within ${MCP_CALL_TIMEOUT_MS}ms — timeout, reported honestly` : `the MCP call failed at the network layer: ${err instanceof Error ? err.message : String(err)}` };
    } finally {
      clearTimeout(timer);
    }
  }

  // stdio — the host bridge or an honest refusal
  if (!exec.stdioBridge) {
    return { outcome: "refused", output: `"${server.name}" is a stdio MCP server — a browser page cannot spawn processes, and SelfImpulse does not pretend to. Register it with the host (tools/mcp.mjs / the desktop shell; the market's export is the config) or run this console under the host bridge; nothing was executed here` };
  }
  try {
    const command = server.command ?? "";
    const args = server.args ?? [];
    const out = await exec.stdioBridge(server.id, command, args, action, payload);
    return { outcome: "ok", output: `mcp ${action} (via host bridge) → ${String(out).slice(0, MCP_OUTPUT_CAP)}` };
  } catch (err) {
    return { outcome: "error", output: `the host bridge failed: ${err instanceof Error ? err.message : String(err)}` };
  }
}

/** Parse + validate a `mcp.call` tool input. Refusals are in words, never guesses. */
export function parseMcpCallInput(input: Record<string, unknown>): { ok: true; serverId: string; action: "ping" | "list" | "call"; payload: Record<string, unknown> } | { ok: false; refusal: string } {
  const serverId = typeof input.server === "string" ? input.server.trim() : "";
  if (!serverId) return { ok: false, refusal: 'mcp.call needs a "server" — the id of an installed, enabled server from the market' };
  const action = input.action === "ping" || input.action === "list" || input.action === "call" ? input.action : null;
  if (!action) return { ok: false, refusal: 'mcp.call action must be "ping" | "list" | "call"' };
  const payload = (input.payload ?? {}) as Record<string, unknown>;
  if (action === "call") {
    const tool = typeof payload.tool === "string" ? payload.tool : "";
    if (!tool) return { ok: false, refusal: 'a "call" needs payload.tool — the name of the server\'s tool as tools/list reported it' };
  }
  return { ok: true, serverId, action, payload };
}

/** The one-line protocol text the agent loop appends when the runtime is live. */
export function mcpProtocolLine(): string | null {
  const servers = mcpRuntimeServers();
  if (servers.length === 0) return null;
  const list = servers.map((s) => `${s.serverId} (${s.transport}${s.envNames.length ? `, env: ${s.envNames.join("/")}` : ""})`).join("; ");
  return (
    `MCP servers installed by the owner are reachable through the mcp.call tool ` +
    `(action "list" discovers a server's tools, action "call" invokes one with payload.tool + payload.arguments). ` +
    `Installed: ${list}. Every call is gated and receipted like any other tool.`
  );
}

export function mcpRuntimeStats(): { enabled: number; total: number; http: number; stdio: number } {
  const all = listInstalled();
  const enabled = all.filter((s) => s.enabled);
  return {
    enabled: enabled.length,
    total: all.length,
    http: enabled.filter((s) => s.transport === "http").length,
    stdio: enabled.filter((s) => s.transport === "stdio").length,
  };
}
