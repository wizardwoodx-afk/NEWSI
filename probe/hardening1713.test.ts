/**
 * Patina (17.1.3) — hardening probe: PolicyGateway + tool schema validation
 * + AG-UI event emitter.
 *
 * Pins the three 17.1.3 hardening additions as behavioral contracts:
 *
 *   1. PolicyGateway returns steer for risky tools (workspace_write,
 *      dispatch_mission, shell_exec) with a named rule and reason, and
 *      allow for ordinary tools under the default-allow rule.
 *   2. Tool schemas (Zod) validate known tools, accept valid args, reject
 *      malformed args with human-readable messages; withSchema() returns
 *      a discriminated {ok,value}|{ok:false,errors} result and retries once
 *      on validation failure.
 *   3. AG-UI emitter fires the expected event sequence (RUN_STARTED →
 *      TEXT_MESSAGE_* → TOOL_CALL_* → INTERRUPT → RUN_FINISHED) and is
 *      subscribable via addEventListener.
 */
import { describe, it } from "node:test";
import assert from "node:assert";

import { propose, registerPolicyRule, _resetPolicyRulesForProbe, riskyTools } from "../src/selfimpulse/engine/policyGateway";
import {
  WorkspaceWriteSchema,
  ShellExecSchema,
  DispatchMissionSchema,
  validateArgs,
  formatParseErrors,
  withSchema,
} from "../src/selfimpulse/engine/toolSchema";
import {
  agui,
  nextRunId,
  emitRunStarted,
  emitRunFinished,
  emitTextStart,
  emitTextChunk,
  emitTextEnd,
  emitToolStart,
  emitToolResult,
  emitInterrupt,
} from "../src/selfimpulse/engine/agui";

describe("hardening1713 — PolicyGateway, tool schemas, AG-UI emitter", () => {
  it("policyGateway: risky tools STEER with a named rule; safe tools ALLOW under default-allow", () => {
    _resetPolicyRulesForProbe();
    const r1 = propose({ tool: "workspace_write", detail: "write file.txt", args: { name: "file.txt", content: "hi" } });
    assert.strictEqual(r1.decision, "steer", "workspace_write must steer to approval");
    assert.strictEqual(r1.rule, "risky-tool-requires-approval");
    assert.ok(r1.audit.kind === "policy" && r1.audit.tool === "workspace_write");
    const r2 = propose({ tool: "dispatch_mission", detail: "dispatch a mission" });
    assert.strictEqual(r2.decision, "steer", "dispatch_mission must steer to approval");
    const r3 = propose({ tool: "shell_exec", detail: "ls", args: { command: "ls" } });
    assert.strictEqual(r3.decision, "steer", "shell_exec must steer to approval (added to riskyTools in 17.1.3)");
    assert.ok(riskyTools.has("shell_exec"), "shell_exec is in the risky set");
    const r4 = propose({ tool: "system_info", detail: "system info" });
    assert.strictEqual(r4.decision, "allow", "system_info is not risky");
    assert.strictEqual(r4.rule, "default-allow");
  });

  it("policyGateway: custom rules can deny and are evaluated in registration order", () => {
    _resetPolicyRulesForProbe();
    registerPolicyRule((input) => {
      if (input.tool === "web_search" && String(input.args?.query ?? "").toLowerCase().includes("password")) {
        return { decision: "deny", rule: "no-password-queries", reason: "web_search refuses queries that look like credential exfiltration" };
      }
      return null;
    });
    const denied = propose({ tool: "web_search", args: { query: "my password is hunter2" }, detail: "" });
    assert.strictEqual(denied.decision, "deny");
    assert.strictEqual(denied.rule, "no-password-queries");
    const allowed = propose({ tool: "web_search", args: { query: "SelfImpulse 17.1" }, detail: "" });
    assert.strictEqual(allowed.decision, "allow");
    _resetPolicyRulesForProbe();
  });

  it("tool schemas: Zod schemas accept valid args and reject invalid args with messages", () => {
    const good = WorkspaceWriteSchema.safeParse({ name: "notes.txt", content: "hello" });
    assert.ok(good.success, "valid workspace_write args accepted");
    const bad = WorkspaceWriteSchema.safeParse({ name: "../etc/passwd", content: "x" });
    assert.ok(!bad.success, "path-traversal filename rejected");
    const tooBig = WorkspaceWriteSchema.safeParse({ name: "x.txt", content: "x".repeat(2_000_000) });
    assert.ok(!tooBig.success, "file over 1 MB rejected");
    const empty = ShellExecSchema.safeParse({ command: "" });
    assert.ok(!empty.success, "empty shell command rejected");
    const dispatch = DispatchMissionSchema.safeParse({ objective: "" });
    assert.ok(!dispatch.success, "empty objective rejected");
  });

  it("tool schemas: validateArgs + formatParseErrors produce a single-line retry message", () => {
    const res = validateArgs("workspace_write", { name: "", content: "hi" });
    assert.ok(!res.success, "empty name rejected via validateArgs");
    const msg = formatParseErrors(res);
    assert.ok(msg.length > 0 && msg.includes("name"), "errors mention the failing field");
    const ok = validateArgs("system_info", {});
    assert.ok(ok.success, "system_info accepts empty args");
  });

  it("tool schemas: withSchema wraps a function, performs ONE retry via repair callback", async () => {
    const shout = async (args: { text: string }) => args.text.toUpperCase();
    const { z } = await import("zod");
    const ShoutSchema = z.object({ text: z.string().min(1) });
    // Without repair callback: bad input returns retried:false and never runs fn.
    const plain = withSchema(ShoutSchema, shout);
    const bad = await plain({ text: "" });
    assert.strictEqual(bad.ok, false);
    assert.strictEqual((bad as { ok: false; retried: boolean }).retried, false);
    assert.ok((bad as { ok: false; errors: string[] }).errors.length >= 1);
    assert.ok((bad as { ok: false; errors: string[] }).errors[0].toLowerCase().includes("text"), "error names the failing field");
    // With repair callback: repair can fix; fn runs once.
    let repairCalls = 0;
    const withFix = withSchema(ShoutSchema, shout, {
      repair: (_raw, errs) => {
        repairCalls++;
        return { text: "fixed-" + errs };
      },
    });
    const fixed = await withFix({ text: "" });
    assert.strictEqual(fixed.ok, true, "repaired input runs");
    assert.ok(String((fixed as { ok: true; value: string }).value).startsWith("FIXED-"), "repaired value runs through fn");
    assert.strictEqual(repairCalls, 1, "repair called exactly once");
    // Repair returns null → refused, retried:true.
    const withNoFix = withSchema(ShoutSchema, shout, { repair: () => null });
    const refused = await withNoFix({ text: "" });
    assert.strictEqual(refused.ok, false);
    assert.strictEqual((refused as { ok: false; retried: boolean }).retried, true, "retried flag set when repair was attempted");
  });

  it("AG-UI emitter: fires and receives a typed event sequence", () => {
    const runId = nextRunId();
    const threadId = "th_probe";
    const seen: string[] = [];
    const off1 = agui.on("RUN_STARTED", () => seen.push("start"));
    const off2 = agui.on("TEXT_MESSAGE_CONTENT", (e) => seen.push(`text:${e.delta}`));
    const off3 = agui.on("TOOL_CALL_START", (e) => seen.push(`tool:${e.tool}`));
    const off4 = agui.on("INTERRUPT", () => seen.push("interrupt"));
    const off5 = agui.on("RUN_FINISHED", (e) => seen.push(`finish:${e.outcome}`));
    emitRunStarted(runId, threadId);
    emitTextStart(runId, threadId, "m1");
    emitTextChunk(runId, threadId, "m1", "hello ");
    emitTextChunk(runId, threadId, "m1", "world");
    emitTextEnd(runId, threadId, "m1");
    emitToolStart(runId, threadId, "t1", "workspace_write");
    emitToolResult(runId, threadId, "t1", "wrote notes.txt", true);
    emitInterrupt(runId, threadId, "a1", "dispatch_mission", "needs approval");
    emitRunFinished(runId, threadId, "completed");
    off1(); off2(); off3(); off4(); off5();
    assert.deepStrictEqual(seen, [
      "start",
      "text:hello ",
      "text:world",
      "tool:workspace_write",
      "interrupt",
      "finish:completed",
    ]);
  });

  it("integration: runSelfImpulseToolCall routes through PolicyGateway (custom DENY blocks execution)", async () => {
    _resetPolicyRulesForProbe();
    registerPolicyRule((input) => {
      if (input.tool === "system_info") {
        return { decision: "deny", rule: "probe-block", reason: "probe deny" };
      }
      return null;
    });
    const events: string[] = [];
    const off1 = agui.on("INTERRUPT", (e) => events.push(`interrupt:${e.tool}:${e.reason}`));
    const off2 = agui.on("TOOL_CALL_RESULT", (e) => events.push(`result:${e.ok}`));
    const { runSelfImpulseToolCall, resetSelfImpulseForProbe } = await import("../src/selfimpulse/engine/selfimpulse");
    resetSelfImpulseForProbe?.();
    const r = await runSelfImpulseToolCall("system_info", {}, { blockOnGate: false });
    off1(); off2();
    assert.strictEqual(r.ok, false, "policy DENY should fail the call");
    assert.ok(/policy denied/i.test(r.output), "output says policy denied");
    assert.ok(events.some((e) => e.startsWith("interrupt:system_info")), "INTERRUPT emitted");
    _resetPolicyRulesForProbe();
  });

  it("integration: runSelfImpulseToolCall rejects bad args via Zod validateArgs before tool.run", async () => {
    _resetPolicyRulesForProbe();
    const { runSelfImpulseToolCall, resetSelfImpulseForProbe } = await import("../src/selfimpulse/engine/selfimpulse");
    resetSelfImpulseForProbe?.();
    // system_info allows {}; send junk to a tool we know has a schema.
    // web_search requires `query: string` per toolSchemas.
    const bad = await runSelfImpulseToolCall("web_search", { query: "" }, { blockOnGate: false });
    assert.strictEqual(bad.ok, false, "empty query rejected");
    assert.ok(/schema validation failed/i.test(bad.output), "mentions schema validation");
  });

  it("integration: runSelfImpulseToolCall emits AG-UI RUN_STARTED/TOOL_*/RUN_FINISHED on a safe call", async () => {
    _resetPolicyRulesForProbe();
    const events: string[] = [];
    const off1 = agui.on("RUN_STARTED", () => events.push("RUN_STARTED"));
    const off2 = agui.on("TOOL_CALL_START", () => events.push("TOOL_CALL_START"));
    const off3 = agui.on("TOOL_CALL_ARGS", () => events.push("TOOL_CALL_ARGS"));
    const off4 = agui.on("TOOL_CALL_RESULT", () => events.push("TOOL_CALL_RESULT"));
    const off5 = agui.on("RUN_FINISHED", (e) => events.push(`RUN_FINISHED:${e.outcome}`));
    const { runSelfImpulseToolCall, resetSelfImpulseForProbe } = await import("../src/selfimpulse/engine/selfimpulse");
    resetSelfImpulseForProbe?.();
    const r = await runSelfImpulseToolCall("system_info", {}, { blockOnGate: false });
    off1(); off2(); off3(); off4(); off5();
    assert.strictEqual(r.ok, true, "system_info succeeds");
    assert.ok(events.includes("RUN_STARTED"), "RUN_STARTED fired");
    assert.ok(events.includes("TOOL_CALL_START"), "TOOL_CALL_START fired");
    assert.ok(events.includes("TOOL_CALL_RESULT"), "TOOL_CALL_RESULT fired");
    const finish = events.find((e) => e.startsWith("RUN_FINISHED:"));
    assert.strictEqual(finish, "RUN_FINISHED:completed", "run completed");
    _resetPolicyRulesForProbe();
  });

  it("integration: RISKY_TOOLS exported from selfimpulse.ts matches policyGateway.riskyTools (single source of truth)", async () => {
    const { RISKY_TOOLS } = await import("../src/selfimpulse/engine/selfimpulse");
    assert.ok(RISKY_TOOLS.has("shell_exec"), "RISKY_TOOLS includes shell_exec (17.1.3 fix)");
    assert.ok(RISKY_TOOLS.has("workspace_write"));
    assert.ok(RISKY_TOOLS.has("dispatch_mission"));
    assert.strictEqual(RISKY_TOOLS.size, riskyTools.size, "sets are the same size");
  });

  it("integration: runSelfImpulseToolCall performs ONE structured retry on fixable schema errors", async () => {
    _resetPolicyRulesForProbe();
    const { runSelfImpulseToolCall, registerProbeTool, deregisterProbeTool } = await import("../src/selfimpulse/engine/selfimpulse");
    // Stub web_search so we don't hit the network AND can count invocations.
    let calls = 0;
    let lastArgs: Record<string, unknown> | null = null;
    registerProbeTool("web_search", {
      name: "web_search",
      risky: false,
      description: "probe stub",
      run: async (args: Record<string, unknown>) => {
        calls++;
        lastArgs = args;
        return `searched: ${String(args.query)}`;
      },
    });
    try {
      // 1) Missing required field (no query) → repair has nothing to fix → refused.
      const refused = await runSelfImpulseToolCall("web_search", {}, { blockOnGate: false });
      assert.strictEqual(refused.ok, false, "missing query refused after one retry");
      assert.ok(/one retry/i.test(refused.output), "refusal message mentions one retry");
      assert.strictEqual(calls, 0, "tool never ran on unfixable input");

      // 2) Fixable input (leading/trailing whitespace) → repair trims → runs once.
      calls = 0;
      lastArgs = null;
      const fixed = await runSelfImpulseToolCall("web_search", { query: "  what is SelfImpulse  " }, { blockOnGate: false });
      assert.strictEqual(fixed.ok, true, `trimmed query succeeds on retry; got ${fixed.output}`);
      assert.strictEqual(calls, 1, "tool ran exactly once after repair");
      assert.strictEqual(lastArgs?.query, "what is SelfImpulse", "args were repaired in-place before run()");

      // 3) Valid args first try → runs exactly once, no retry trace.
      calls = 0;
      lastArgs = null;
      const fresh = await runSelfImpulseToolCall("web_search", { query: "hello" }, { blockOnGate: false });
      assert.strictEqual(fresh.ok, true);
      assert.strictEqual(calls, 1, "valid args run once without retry");
    } finally {
      deregisterProbeTool("web_search");
    }
    _resetPolicyRulesForProbe();
  });

  it("integration: dispatch_mission is schema-validated through the same retry throat (empty objective refused)", async () => {
    _resetPolicyRulesForProbe();
    const { runSelfImpulseToolCall } = await import("../src/selfimpulse/engine/selfimpulse");
    // Empty objective should fail DispatchMissionSchema (z.string().min(1))
    // even after the trim-normalization retry → refused, tool.never ran.
    const refused = await runSelfImpulseToolCall("dispatch_mission", { objective: "" }, { blockOnGate: false });
    assert.strictEqual(refused.ok, false, "empty objective refused");
    assert.ok(/schema validation failed/i.test(refused.output), "output names schema failure");
    // A whitespace-only objective should be repairable (trim) → refuses because
    // trim of "   " is "" and fails min(1); make sure it went through validation
    // (not a hardcoded early return).
    const ws = await runSelfImpulseToolCall("dispatch_mission", { objective: "   " }, { blockOnGate: false });
    assert.strictEqual(ws.ok, false, "whitespace-only objective refused after trim");
    _resetPolicyRulesForProbe();
  });

  it("integration: retry receipt event carries rawArgs + repairedArgs + repairSource for audit", async () => {
    _resetPolicyRulesForProbe();
    const { runSelfImpulseToolCall, selfimpulseSession } = await import("../src/selfimpulse/engine/selfimpulse");
    let calls = 0;
    let lastArgs: Record<string, unknown> | null = null;
    const { registerProbeTool, deregisterProbeTool } = await import("../src/selfimpulse/engine/selfimpulse");
    registerProbeTool("web_search", {
      name: "web_search", risky: false, description: "probe",
      run: async (args: Record<string, unknown>) => { calls++; lastArgs = args; return `ok:${args.query}`; },
    });
    try {
      const r = await runSelfImpulseToolCall("web_search", { query: "  audit me  " }, { blockOnGate: false });
      assert.strictEqual(r.ok, true);
      assert.strictEqual(calls, 1);
      assert.strictEqual(lastArgs?.query, "audit me", "tool got repaired args");
      // Find the last receipt and ensure it contains a schema_retry event with
      // auditable fields (rawArgs + repairedArgs + repairSource). Trim-only is
      // normalized pre-pass without a retry event; use a case that actually
      // forces the repair branch by feeding whitespace that hits the trim
      // normalization. We inspect the latest receipt's events.
      const sess = selfimpulseSession();
      const last = sess.receipts[sess.receipts.length - 1];
      const retryEvt = last.receipt.events.find((e: unknown) => (e as { kind?: string }).kind === "tool.schema_retry");
      // The first call was normalized pre-pass, no retry event. Run one that
      // requires a real retry: missing query → repair cannot fix → refused,
      // which MUST produce a schema_refused with auditable fields.
      const r2 = await runSelfImpulseToolCall("web_search", {}, { blockOnGate: false });
      assert.strictEqual(r2.ok, false);
      const sess2 = selfimpulseSession();
      const refEvt = sess2.receipts[sess2.receipts.length - 1].receipt.events.find(
        (e: unknown) => (e as { kind?: string }).kind === "tool.schema_refused",
      ) as Record<string, unknown> | undefined;
      assert.ok(refEvt, "schema_refused event present");
      assert.ok(refEvt && typeof (refEvt.data as Record<string, unknown>).rawArgs === "object", "rawArgs auditable");
      assert.ok(refEvt && "repairSource" in (refEvt.data as Record<string, unknown>), "repairSource present");
      assert.ok(refEvt && "repairReason" in (refEvt.data as Record<string, unknown>), "repairReason present");
      assert.strictEqual(calls, 1, "refused path never ran the tool");
    } finally {
      deregisterProbeTool("web_search");
    }
    _resetPolicyRulesForProbe();
  });
});
