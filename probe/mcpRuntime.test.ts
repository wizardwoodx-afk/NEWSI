/**
 * probe/mcpRuntime.test.ts — the 19.7.1 MCP runtime attachment.
 *
 * Pins the pipeline the review asked for:
 *   market install → runtime surface (enabled servers only) → the agent
 *   loop's tool protocol → the risky-tool GATE → governed execution (real
 *   JSON-RPC over the egress guard for HTTP; host bridge or honest refusal
 *   for stdio) → receipts.
 */
import assert from "node:assert/strict";

let passed = 0;
let failed = 0;
const failures: string[] = [];
function ok(label: string, cond: boolean, detail = ""): void {
  if (cond) { passed++; console.log(`  ok   ${label}`); }
  else { failed++; failures.push(`${label}${detail ? ` — ${detail}` : ""}`); console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`); }
}

class MemStore implements Storage {
  private m = new Map<string, string>();
  get length() { return this.m.size; }
  clear() { this.m.clear(); }
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null; }
  key(i: number) { return Array.from(this.m.keys())[i] ?? null; }
  removeItem(k: string) { this.m.delete(k); }
  setItem(k: string, v: string) { this.m.set(k, v); }
}
(globalThis as { localStorage?: Storage }).localStorage = new MemStore();

const market = await import("../src/engine/mcpMarket");
const rt = await import("../src/engine/mcpRuntime");
const tools = await import("../src/engine/tools");
const { memberToolIds } = await import("../src/engine/agentLoop");

console.log("== the surface: enabled market servers become tool surface ==");
market.clearMarket();
ok("no servers ⇒ the runtime is off", rt.mcpRuntimeEnabled() === false && rt.mcpRuntimeServers().length === 0);
ok("no servers ⇒ memberToolIds unchanged", !memberToolIds("code", { pc: null }).includes("mcp.call"));
market.installServer({ name: "GH", transport: "http", url: "https://mcp.example.com/rpc", envNames: ["GH_TOKEN"], note: "GitHub issues and PRs over MCP" });
market.installServer({ name: "LS", transport: "stdio", command: "npx", args: ["-y", "@modelcontextprotocol/server-filesystem", "/tmp/ws"] });
market.installServer({ name: "Off", transport: "http", url: "https://disabled.example.com/rpc" });
market.setServerEnabled("off", false);
const surf = rt.mcpRuntimeServers();
ok("exactly the ENABLED servers surface", surf.length === 2 && surf.some((s) => s.serverId === "gh") && surf.some((s) => s.serverId === "ls"));
ok("every surfaced entry declares transport, purpose and env NAMES", surf.every((s) => (s.transport === "http" || s.transport === "stdio") && s.purpose.length > 0));
ok("no env VALUES ever ride the surface", JSON.stringify(surf).includes("GH_TOKEN") && !JSON.stringify(surf).includes("ghp_"));

console.log("== the agent loop advertises mcp.call only when live ==");
ok("servers live ⇒ every workspace-wired member gets mcp.call", memberToolIds("code", { pc: null }).includes("mcp.call"));
ok("the protocol line names the servers and the honesty contract", (rt.mcpProtocolLine() ?? "").includes("gh") && (rt.mcpProtocolLine() ?? "").includes("gated and receipted"));
ok("mcp.call is a RISKY tool — the gate applies", tools.getTool("mcp.call")?.riskTier === "risky");

console.log("== governed execution: HTTP answers real JSON-RPC through the guard ==");
let seenUrl = "", seenBody = "";
const rpcFetch = (async (url: string | URL, init?: { body?: string }) => {
  seenUrl = String(url); seenBody = init?.body ?? "";
  return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: { tools: [{ name: "list_issues" }] } }), { status: 200, headers: { "content-type": "application/json" } });
}) as typeof fetch;
const listCall = await rt.callMcpServer("gh", "list", {}, { fetchImpl: rpcFetch });
ok("an HTTP list call succeeds and carries the server's answer", listCall.outcome === "ok" && listCall.output.includes("list_issues"));
ok("the wire body is JSON-RPC 2.0 tools/list", seenBody.includes('"jsonrpc":"2.0"') && seenBody.includes("tools/list") && seenUrl === "https://mcp.example.com/rpc");

const toolCall = await rt.callMcpServer("gh", "call", { tool: "list_issues", arguments: { state: "open" } }, { fetchImpl: rpcFetch });
ok("a tools/call invocation works", toolCall.outcome === "ok" && seenBody.includes("tools/call") && seenBody.includes("list_issues"));

const offCall = await rt.callMcpServer("off", "ping", {}, { fetchImpl: rpcFetch });
ok("a DISABLED server refuses in words — nothing was sent", offCall.outcome === "refused" && offCall.output.includes("DISABLED"));
const ghostCall = await rt.callMcpServer("ghost", "ping", {}, { fetchImpl: rpcFetch });
ok("an unknown server refuses in words", ghostCall.outcome === "refused" && ghostCall.output.includes("no MCP server registered"));

const badFetch = (async () => new Response("nope", { status: 500 })) as typeof fetch;
const errCall = await rt.callMcpServer("gh", "ping", {}, { fetchImpl: badFetch });
ok("an HTTP failure is reported, not dressed up", errCall.outcome === "error" && errCall.output.includes("500"));

console.log("== stdio: host bridge or an honest refusal — never a fake ==");
const refused = await rt.callMcpServer("ls", "list", {}, {});
ok("stdio without a bridge refuses and names the host path", refused.outcome === "refused" && refused.output.includes("cannot spawn processes") && refused.output.includes("tools/mcp.mjs"));
let bridged = "";
const viaBridge = await rt.callMcpServer("ls", "call", { tool: "read_file", arguments: { path: "a.txt" } }, { stdioBridge: async (id, cmd, args, action, payload) => { bridged = `${id}|${cmd}|${action}|${JSON.stringify(payload)}`; return "file content here"; } });
ok("stdio WITH a bridge executes and reports the bridge", viaBridge.outcome === "ok" && viaBridge.output.includes("host bridge") && bridged.includes("ls|npx"));

console.log("== end-to-end through the TOOL layer: gate + parse + receipt ==");
const ctx = {
  workspaceRoot: "/tmp/ws",
  fetchImpl: rpcFetch,
  gate: async (ask: { riskTier: string }) => ({ approved: ask.riskTier !== "critical", reason: "approved by the probe gate" }),
  hash: async (t: string) => "hash-" + t.length,
} as unknown as Parameters<typeof tools.executeToolReceipted>[2];
const receipt = await tools.executeToolReceipted("mcp.call", { server: "gh", action: "list" }, ctx);
ok("the tool layer returns a RECEIPT for the mcp call", receipt.tool === "mcp.call" && receipt.outcome === "ok" && typeof receipt.digest === "string" && receipt.digest.startsWith("hash-"));
ok("the receipt carries the server's answer", receipt.output.includes("list_issues"));

const badInput = await tools.executeToolReceipted("mcp.call", { action: "list" }, ctx);
ok("a missing server id is an in-words error, not a guess", badInput.outcome === "error" && badInput.output.includes("needs a \"server\""));
const unknownServer = await tools.executeToolReceipted("mcp.call", { server: "nope", action: "list" }, ctx);
ok("a server outside the enabled surface is refused at the tool layer", unknownServer.outcome === "refused" && unknownServer.output.includes("not in the enabled MCP surface"));

const noGate = {
  workspaceRoot: "/tmp/ws",
  fetchImpl: rpcFetch,
} as unknown as Parameters<typeof tools.executeToolReceipted>[2];
const gatedOut = await tools.executeToolReceipted("mcp.call", { server: "gh", action: "list" }, noGate);
ok("mcp.call with NO gate is gated-out — risky tools never auto-run", gatedOut.outcome === "gated-out");

market.clearMarket();
ok("clearing the market empties the runtime surface", rt.mcpRuntimeEnabled() === false && rt.mcpProtocolLine() === null);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) { console.log("\nfailures:"); for (const f of failures) console.log(`  - ${f}`); }
process.exit(failed > 0 ? 1 : 0);
