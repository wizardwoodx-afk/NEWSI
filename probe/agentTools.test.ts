/**
 * probe/agentTools.test.ts — the specialist tool runtime + member agent loop (19.3.0 "Vanguard").
 *
 * Pins the release's core claim: specialists are executors now, not prompt
 * personas — and execution carries the SelfImpulse identity: every tool
 * call is risk-tiered, rides the human gate, and lands a receipt. Nothing
 * here may fake an effect: a gated tool without a gate is refused, a path
 * outside the workspace is refused, and the model is told the real reason.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

if (typeof globalThis.localStorage === "undefined") {
  const map = new Map<string, string>();
  (globalThis as unknown as { localStorage: Storage }).localStorage = {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, String(v)),
    removeItem: (k: string) => void map.delete(k),
    clear: () => void map.clear(),
    key: (i: number) => Array.from(map.keys())[i] ?? null,
    get length() { return map.size; },
  } as Storage;
}

import { TOOLS, executeTool, executeToolReceipted, getTool, parseToolBlocks, resolveWorkspacePath, stripToolBlocks, toolProtocolText, toolsForCategory } from "../src/engine/tools";
import { runMemberAgent, MAX_AGENT_STEPS } from "../src/engine/agentLoop";
import { askSelfImpulse19 } from "../src/engine/generalist";
import { getSpecialist } from "../src/engine/registry";
import type { ProviderConfig } from "../src/engine/types";

const prov: ProviderConfig = { kind: "openai-compatible", baseUrl: "https://api.openai.com/v1", apiKey: "sk-test-abcdefgh123456789", model: "gpt-test" };

test("specialist tools — real execution, gated and receipted (19.3.0)", async () => {
  let pass = 0, fail = 0;
  const check = (name: string, cond: boolean, detail?: unknown) => {
    cond ? pass++ : fail++;
    console.log(`  ${cond ? "ok  " : "FAIL"} ${name}${cond || detail === undefined ? "" : ` — ${JSON.stringify(detail)}`}`);
  };

  const root = fs.mkdtempSync(path.join(os.tmpdir(), "engine-tools-"));
  fs.writeFileSync(path.join(root, "notes.txt"), "the parser is on version 3.2\n", "utf8");
  fs.mkdirSync(path.join(root, "sub"), { recursive: true });
  fs.writeFileSync(path.join(root, "sub", "deep.txt"), "deep file", "utf8");

  console.log("\n── 1. the toolset is small, tiered and honestly described ──");
  check("exactly eight tools ship — a reviewer can read them all", TOOLS.length === 8, TOOLS.map((t) => t.id));
  check("the 19.7.1 mcp.call is risky and honestly described", getTool("mcp.call")?.riskTier === "risky" && (getTool("mcp.call")?.purpose ?? "").includes("gated and receipted"));
  check("every tool states its purpose and input shape", TOOLS.every((t) => t.purpose.length > 20 && t.inputShape.includes("{")));
  check("fs.write and net.fetch are risky; readers are safe", getTool("fs.write")?.riskTier === "risky" && getTool("net.fetch")?.riskTier === "risky" && getTool("fs.read")?.riskTier === "safe" && getTool("fs.list")?.riskTier === "safe" && getTool("wiki.search")?.riskTier === "safe");
  check("every category binding stays ≤ 3 tools", ["code", "security", "testing", "review", "data", "devops", "research", "writing", "analysis", "design"].every((c) => toolsForCategory(c).length <= 3));
  check("security and review are read-only — auditors don't mutate", !toolsForCategory("security").includes("fs.write") && !toolsForCategory("review").includes("fs.write"));

  console.log("\n── 2. the workspace root is a hard boundary ──");
  check("a plain relative path resolves inside the root", resolveWorkspacePath(root, "notes.txt") === `${root}/notes.txt`);
  check("nested paths resolve", resolveWorkspacePath(root, "sub/deep.txt") === `${root}/sub/deep.txt`);
  check("a traversal escape is refused", resolveWorkspacePath(root, "../etc/passwd") === null);
  check("a disguised traversal is refused", resolveWorkspacePath(root, "sub/../../outside.txt") === null);
  check("absolute paths are refused outright", resolveWorkspacePath(root, "/etc/passwd") === null);
  check("an empty path is refused", resolveWorkspacePath(root, "") === null);

  console.log("\n── 3. safe tools really execute ──");
  const listed = await executeTool("fs.list", { path: "" }, { workspaceRoot: root });
  check("fs.list with empty path is refused, not rooted at /", listed.outcome === "refused");
  const listRoot = await executeTool("fs.list", { path: "." }, { workspaceRoot: root });
  check("fs.list returns real entries", listRoot.outcome === "ok" && listRoot.output.includes("notes.txt") && listRoot.output.includes("sub/"), listRoot);
  const read = await executeTool("fs.read", { path: "notes.txt" }, { workspaceRoot: root });
  check("fs.read returns the real file content", read.outcome === "ok" && read.output.includes("version 3.2"));
  const readMissing = await executeTool("fs.read", { path: "nope.txt" }, { workspaceRoot: root });
  check("a missing file is an honest error, not silence", readMissing.outcome === "error" && readMissing.output.length > 0);

  console.log("\n── 4. risky tools ride the human gate ──");
  const writeNoGate = await executeTool("fs.write", { path: "new.txt", content: "x" }, { workspaceRoot: root });
  check("fs.write with NO gate is refused — never auto-run", writeNoGate.outcome === "gated-out" && writeNoGate.output.includes("no human gate"));
  check("…and nothing was written", !fs.existsSync(path.join(root, "new.txt")));
  const writeApproved = await executeTool("fs.write", { path: "new.txt", content: "approved content" }, { workspaceRoot: root, gate: async () => ({ approved: true }) });
  check("an approved gate lets the write execute for real", writeApproved.outcome === "ok" && fs.readFileSync(path.join(root, "new.txt"), "utf8") === "approved content");
  const writeDenied = await executeTool("fs.write", { path: "denied.txt", content: "x" }, { workspaceRoot: root, gate: async () => ({ approved: false, reason: "not in this release" }) });
  check("a denied gate stops the write and carries the reason", writeDenied.outcome === "gated-out" && writeDenied.output.includes("not in this release") && !fs.existsSync(path.join(root, "denied.txt")));
  const fetchNoGate = await executeTool("net.fetch", { url: "https://example.org" }, { workspaceRoot: root });
  check("net.fetch is gated the same way", fetchNoGate.outcome === "gated-out");
  const fetchSsrf = await executeTool("net.fetch", { url: "http://169.254.169.254/latest/meta-data" }, { workspaceRoot: root, gate: async () => ({ approved: true }) });
  check("even an APPROVED gate cannot force an SSRF target through", fetchSsrf.outcome === "refused" && fetchSsrf.output.includes("refused"));
  const unknown = await executeTool("rm.rf", {}, { workspaceRoot: root });
  check("an unknown tool is refused with the available list", unknown.outcome === "refused" && unknown.output.includes("fs.read"));

  console.log("\n── 5. receipts are real and digest-sealed ──");
  const hasher = async (text: string) => {
    const buf = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
  };
  const rec = await executeToolReceipted("fs.read", { path: "notes.txt" }, { workspaceRoot: root, hash: hasher });
  check("a receipt carries tool, outcome, latency and a 64-hex digest", rec.outcome === "ok" && rec.latencyMs >= 0 && typeof rec.digest === "string" && /^[0-9a-f]{64}$/.test(rec.digest));
  const rec2 = await executeToolReceipted("fs.read", { path: "notes.txt" }, { workspaceRoot: root, hash: hasher });
  check("identical calls produce identical receipts (deterministic)", rec.digest === rec2.digest);
  const recGated = await executeToolReceipted("fs.write", { path: "x.txt", content: "x" }, { workspaceRoot: root, hash: hasher });
  check("a gated-out call still lands a receipt — nothing silent", recGated.outcome === "gated-out" && typeof recGated.digest === "string");

  console.log("\n── 6. the tool-block protocol parses honestly ──");
  const goodBlock = 'plan looks fine\n\u0060\u0060\u0060tool\n{"tool":"fs.read","input":{"path":"notes.txt"}}\n\u0060\u0060\u0060';
  const parsed = parseToolBlocks(goodBlock);
  check("a valid block parses", parsed.length === 1 && !("parseError" in parsed[0]) && parsed[0].tool === "fs.read");
  const badJson = '\u0060\u0060\u0060tool\n{not json}\n\u0060\u0060\u0060';
  const parsedBad = parseToolBlocks(badJson);
  check("invalid JSON becomes an explicit parse error, not a guess", parsedBad.length === 1 && "parseError" in parsedBad[0] && parsedBad[0].parseError.includes("not valid JSON"));
  const noField = '\u0060\u0060\u0060tool\n{"input":{"path":"x"}}\n\u0060\u0060\u0060';
  const parsedNoField = parseToolBlocks(noField);
  check("a block missing the tool field is reported", "parseError" in (parsedNoField[0] ?? { parseError: "" }));
  check("stripToolBlocks leaves only the prose", stripToolBlocks(goodBlock) === "plan looks fine");
  check("the protocol text names every carried tool and the one-block rule", toolProtocolText(["fs.read", "fs.write"]).includes("fs.read") && toolProtocolText(["fs.read"]).includes("one tool call per block"));

  console.log("\n── 7. the member agent loop executes tools end to end ──");
  const specialist = getSpecialist("code.typescript");
  assert.ok(specialist, "code.typescript must exist on the bench");
  // Scripted provider: step 1 asks for a real read; step 2 answers with it.
  const script = [
    'Let me look at the file.\n\u0060\u0060\u0060tool\n{"tool":"fs.read","input":{"path":"notes.txt"}}\n\u0060\u0060\u0060',
    "The parser is on version 3.2 — confirmed by reading notes.txt from the workspace.",
  ];
  let i = 0;
  const loopFetch = (async () => {
    const content = script[Math.min(i++, script.length - 1)];
    return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });
  }) as unknown as typeof fetch;
  const run = await runMemberAgent({
    provider: prov,
    specialist,
    task: "check which version the parser is on",
    systemBase: "You are the typescript specialist.",
    fetchImpl: loopFetch,
    toolCtx: { workspaceRoot: root },
    hash: hasher,
  });
  check("the loop ran 2 provider calls (tool step + answer step)", run.calls === 2, run.calls);
  check("the tool really executed — one receipt, outcome ok", run.toolReceipts.length === 1 && run.toolReceipts[0].outcome === "ok" && run.toolReceipts[0].tool === "fs.read");
  check("the receipt carries a digest", typeof run.toolReceipts[0].digest === "string" && /^[0-9a-f]{64}$/.test(run.toolReceipts[0].digest ?? ""));
  check("the final text is the clean answer, fences stripped", run.ok && run.text.includes("version 3.2") && !run.text.includes("\u0060\u0060\u0060tool"));
  check("the run reports its toolset", run.tools.includes("fs.read") && !run.truncated);

  console.log("\n── 8. gate denials travel back to the model verbatim ──");
  const gateScript = [
    '\u0060\u0060\u0060tool\n{"tool":"fs.write","input":{"path":"out.txt","content":"overwrite everything"}}\n\u0060\u0060\u0060',
    "I could not write the file: the gate declined. I will not claim it happened.",
  ];
  let g = 0;
  const gateFetch = (async () => new Response(JSON.stringify({ choices: [{ message: { content: gateScript[Math.min(g++, gateScript.length - 1)] } }] }), { status: 200 })) as unknown as typeof fetch;
  let gateAsks = 0;
  const deniedRun = await runMemberAgent({
    provider: prov,
    specialist,
    task: "rewrite out.txt",
    systemBase: "You are the typescript specialist.",
    fetchImpl: gateFetch,
    toolCtx: { workspaceRoot: root, gate: async () => { gateAsks++; return { approved: false, reason: "policy: no overwrite in probes" }; } },
    hash: hasher,
  });
  check("the risky tool hit the gate exactly once", gateAsks === 1, gateAsks);
  check("the denial is receipted as gated-out", deniedRun.toolReceipts.length === 1 && deniedRun.toolReceipts[0].outcome === "gated-out" && deniedRun.toolReceipts[0].output.includes("policy: no overwrite in probes"));
  check("the model answered honestly afterwards", deniedRun.ok && deniedRun.text.includes("gate declined"));
  check("nothing was written", !fs.existsSync(path.join(root, "out.txt")));

  console.log("\n── 9. the step limit is a hard, honest stop ──");
  const alwaysTool = (async () => new Response(JSON.stringify({ choices: [{ message: { content: '\u0060\u0060\u0060tool\n{"tool":"fs.list","input":{"path":"."}}\n\u0060\u0060\u0060' } }] }), { status: 200 })) as unknown as typeof fetch;
  const truncated = await runMemberAgent({
    provider: prov,
    specialist,
    task: "list everything forever",
    systemBase: "You are the typescript specialist.",
    fetchImpl: alwaysTool,
    toolCtx: { workspaceRoot: root },
    hash: hasher,
  });
  check(`the loop stops at MAX_AGENT_STEPS (${MAX_AGENT_STEPS})`, truncated.calls === MAX_AGENT_STEPS, truncated.calls);
  check("truncation is labelled, not dressed as done", truncated.truncated === true);
  check("every attempted step still landed a receipt", truncated.toolReceipts.length === MAX_AGENT_STEPS - 1 || truncated.toolReceipts.length === MAX_AGENT_STEPS, truncated.toolReceipts.length);

  console.log("\n── 10. toolless members keep the exact 19.2.0 path ──");
  const toolless = await runMemberAgent({
    provider: prov,
    specialist,
    task: "explain generics",
    systemBase: "You are the typescript specialist.",
    fetchImpl: (async () => new Response(JSON.stringify({ choices: [{ message: { content: "Generics parameterize types." } }] }), { status: 200 })) as unknown as typeof fetch,
    hash: hasher,
  });
  check("no toolCtx ⇒ one call, zero receipts, zero tools", toolless.calls === 1 && toolless.toolReceipts.length === 0 && toolless.tools.length === 0);

  console.log("\n── 11. end to end through the door: workspace-wired member ──");
  // Marker-driven double: works for one routed member or several. The
  // re-rank gets noise (deterministic fallback); a member's first call asks
  // for a real read; the follow-up turn (tool results attached) answers.
  const doorFetch = (async (_input: unknown, init?: unknown) => {
    const body = String(((init ?? {}) as RequestInit).body ?? "");
    let content: string;
    if (body.includes("Rank these specialist ids")) content = "re-rank noise";
    else if (body.includes("single synthesized domain result")) content = "SYNTHESIZED: the workspace notes put the parser on version 3.2.";
    else if (body.includes("[turn 1]")) content = "The notes say the parser is on version 3.2.";
    else content = 'I will read the notes first.\n\u0060\u0060\u0060tool\n{"tool":"fs.read","input":{"path":"notes.txt"}}\n\u0060\u0060\u0060';
    return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });
  }) as unknown as typeof fetch;
  const resp = await askSelfImpulse19(
    { text: "read the notes and tell me which typescript parser version we run", userId: "tools-probe" },
    // The route may include a risky specialist — the approving gate stands in
    // for the human; tool-level gating is tested separately above.
    { provider: prov, fetchImpl: doorFetch, workspaceRoot: root, gate: async () => ({ approved: true }) },
  );
  check("the door run executes", resp.executed === true && resp.outcome === "answered", resp.outcome);
  check("the run receipts its tool call(s) — note or member section says so", (resp.note ?? "").includes("tool call(s) receipted") || resp.reply.includes("tool call(s) receipted"), resp.note);
  check("the reply is the clean answer — fences never reach the user", resp.reply.includes("version 3.2") && !resp.reply.includes("\u0060\u0060\u0060tool"));
  check("the digest still seals the response", /^[0-9a-f]{64}$/.test(resp.provenanceDigest));

  fs.rmSync(root, { recursive: true, force: true });
  console.log(`\n${fail === 0 ? "✅" : "❌"} agentTools probe: ${pass} passed, ${fail} failed\n`);
  assert.equal(fail, 0, `${fail} agentTools checks failed`);
});
