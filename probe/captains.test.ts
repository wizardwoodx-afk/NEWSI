/**
 * SelfImpulse — Captains + failure-handling probe (19.1.0 "Shipyard").
 *
 * Pins the lead layer (leads exist per domain, plans are real member plans,
 * reports are computed from real outcomes and never inflate status) and the
 * failure taxonomy (every class has meaning, advice and an honest retry
 * verdict; classification is driven by real pipeline signals).
 */
import assert from "node:assert/strict";
import { test } from "node:test";

if (typeof globalThis.localStorage === "undefined") {
  const map = new Map<string, string>();
  (globalThis as unknown as { localStorage: Storage }).localStorage = {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, String(v)),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
    key: (i: number) => Array.from(map.keys())[i] ?? null,
    get length() {
      return map.size;
    },
  } as Storage;
}
import { CAPTAINS, buildCaptainReport, getCaptain, captainForDomain, captainForRoute, planDomainWork } from "../src/engine/captains";
import { classifyFailure, shouldRetry } from "../src/engine/failures";
import { SPECIALISTS } from "../src/engine/registry";
import { askSelfImpulse19 } from "../src/engine/generalist";
import { clearTokenLedger, usageReport } from "../src/engine/tokenOptim";
import type { ProviderConfig } from "../src/engine/types";

test("captains + failures — oversight that never fabricates", async () => {
  let pass = 0, fail = 0;
  const check = (name: string, cond: boolean, detail?: unknown) => {
    cond ? pass++ : fail++;
    console.log(`  ${cond ? "ok  " : "FAIL"} ${name}${cond || detail === undefined ? "" : ` — ${JSON.stringify(detail)}`}`);
  };

  console.log("\n── 1. the lead layer ──");
  check("every domain has exactly one Consul", CAPTAINS.length === 16 && new Set(CAPTAINS.map((l) => l.domain)).size === 16);
  check("every category the fleet fields has a Consul above it — silicon (350 sub-agents) included, finance too", [...new Set(SPECIALISTS.map((s) => s.category))].every((c) => captainForDomain(c) !== null) && captainForDomain("finance") !== null && captainForDomain("silicon") !== null);
  check("a silicon-only route reaches a Consul (it used to reach none — the Captain briefed the crew directly)", captainForRoute(SPECIALISTS.filter((s) => s.category === "silicon").slice(0, 3).map((s) => s.id))?.domain === "silicon");
  check("a Consul's playbook forbids the layer skips (never the user, never a sub-agent directly)", CAPTAINS.every((l) => /report to the Captain/.test(l.systemPrompt) && /never address the user/.test(l.systemPrompt) && /never command a sub-agent directly/.test(l.systemPrompt)));
  check("captains have a mandate and their own playbook", CAPTAINS.every((l) => l.mandate.length > 10 && l.systemPrompt.includes(l.name)));
  check("captainForDomain resolves every category", ["code", "security", "design"].every((c) => captainForDomain(c as "code") !== null));
  check("captainForRoute picks the dominant domain", captainForRoute(["code.typescript", "code.debugging", "testing.unit"])?.domain === "code");
  check("captainForRoute returns null for unknown specialists only", captainForRoute(["nope.404"]) === null);

  console.log("\n── 2. the lead plans with real members ──");
  const plan = planDomainWork("captain.code", "refactor typescript types and debug the crash");
  check("the plan lists real bench members with scores", plan.length > 0 && plan.every((p) => SPECIALISTS.some((s) => s.id === p.specialistId) && p.score > 0));
  check("the plan is capped — a plan, not a wishlist", planDomainWork("captain.devops", "deploy kubernetes terraform docker ci observability").length <= 3);
  check("an unrelated task yields no plan (no invented work)", planDomainWork("captain.design", "zzz qqq xxx").length === 0);
  check("unknown captains refuse politely", planDomainWork("captain.nope", "typescript").length === 0 && getCaptain("captain.nope") === null);

  console.log("\n── 3. the report tells the truth ──");
  const done = buildCaptainReport("captain.code", [{ specialistId: "code.typescript", outcome: "answered" }])!;
  check("all-executed reads completed", done.status === "completed" && done.failures.length === 0);
  const partial = buildCaptainReport("captain.code", [{ specialistId: "code.typescript", outcome: "answered" }, { specialistId: "code.debugging", outcome: "refused", note: "denied at the gate" }])!;
  check("mixed reads partial — never completed", partial.status === "partial" && partial.failures.length === 1);
  const planned = buildCaptainReport("captain.code", [{ specialistId: "code.typescript", outcome: "planned" }])!;
  check("plan-only reads planned, with the key advice", planned.status === "planned" && planned.nextStep.includes("provider key"));
  const blocked = buildCaptainReport("captain.code", [{ specialistId: "code.typescript", outcome: "gated-out" }])!;
  check("gate-stop reads blocked with the resume step", blocked.status === "blocked" && blocked.nextStep.includes("gate"));
  check("an empty result set yields no report (nothing to report)", buildCaptainReport("captain.code", []) === null);

  console.log("\n── 4. the failure taxonomy ──");
  const auth = classifyFailure("error", "provider returned 401 unauthorized");
  check("a 401 is provider-auth, not retryable", auth.klass === "provider-auth" && auth.retryable === false && auth.severity === "error");
  check("a 429 is rate-limit and retryable", (() => { const f = classifyFailure("error", "429 too many requests"); return f.klass === "provider-rate-limit" && shouldRetry(f); })());
  check("a timeout is retryable with wait advice", (() => { const f = classifyFailure("error", "request timed out"); return f.klass === "provider-timeout" && f.retryable; })());
  check("a network failure is unreachable", classifyFailure("error", "fetch failed: ECONNREFUSED").klass === "provider-unreachable");
  check("an unclassifiable error stays honestly unknown", classifyFailure("error", "something odd happened").klass === "unknown");
  check("planned is info, not error — the plan is the product", (() => { const f = classifyFailure("planned"); return f.klass === "no-provider" && f.severity === "info" && !shouldRetry(f); })());
  check("gate-denied is final and says so", classifyFailure("gated-out").advice.includes("narrow"));
  check("injection blocks are named as guardrail work", classifyFailure("refused", "blocked by the GuardRail: injection detected").klass === "injection-blocked");
  check("every class carries meaning AND advice", ["no-provider", "gate-denied", "policy-refused", "injection-blocked", "peer-refused"].every((k) => {
    const f = classifyFailure(k === "no-provider" ? "planned" : k === "gate-denied" ? "gated-out" : "refused", k === "injection-blocked" ? "injection" : k === "peer-refused" ? "peer bridge missing" : undefined);
    return f.meaning.length > 20 && f.advice.length > 20;
  }));

  console.log("\n── 5. the generalist attaches both to every routed exit ──");
  const resp = await askSelfImpulse19({ text: "refactor the typescript types in the parser", userId: "probe-user" });
  check("a routed response carries its captain report", resp.captain != null && resp.captain.captainId.startsWith("captain.") && resp.captain.members.length > 0, resp.outcome);
  check("a non-executed response carries classified failure advice", resp.failure != null && resp.failure.meaning.length > 20 && resp.outcome !== "answered");
  check("the captain report covers EVERY routed member (19.0.0 review fix)", (resp.captain?.members.length ?? 0) === resp.specialistIds.length);
  check("the digest still seals the response", typeof resp.provenanceDigest === "string" && resp.provenanceDigest.length === 64);

  console.log("\n── multi-member execution (19.2.0 review fix) ──");
  const MULTI_TEXT = "write unit tests for the typescript parser and review the code changes";
  const prov: ProviderConfig = { kind: "openai-compatible", baseUrl: "https://api.openai.com/v1", apiKey: "sk-test-abcdefgh123456789", model: "gpt-test" };
  let callNo = 0;
  let failCallNo = -1;
  const calls: string[] = [];
  // 19.3.0: the double is marker-aware — the Captain's synthesis call is a
  // distinct provider call and gets its own distinct answer.
  const memberFetch = (async (_input: unknown, init?: unknown) => {
    const req = (init ?? {}) as RequestInit;
    const body = String(req.body ?? "");
    calls.push(body);
    callNo += 1;
    if (body.includes("single synthesized domain result")) {
      return new Response(JSON.stringify({ choices: [{ message: { content: "CAPTAIN-SYNTHESIS: the combined result of all members." } }] }), { status: 200 });
    }
    if (callNo === failCallNo) return new Response(JSON.stringify({ error: "member down" }), { status: 500 });
    return new Response(JSON.stringify({ choices: [{ message: { content: `member answer #${callNo}` } }] }), { status: 200 });
  }) as unknown as typeof fetch;

  clearTokenLedger();
  callNo = 0; calls.length = 0;
  const multi = await askSelfImpulse19({ text: MULTI_TEXT, userId: "probe-user" }, { provider: prov, fetchImpl: memberFetch });
  const nMem = multi.specialistIds.length;
  check("a multi-routed request makes ONE PROVIDER CALL PER MEMBER (+1 re-rank, +1 consul synthesis)", nMem > 1 && calls.length === nMem + 2, { routed: nMem, calls: calls.length });
  const memberAnswers = [...multi.reply.matchAll(/member answer #(\d+)/g)].map((m) => m[1]);
  check("each member's OWN distinct answer appears in the reply — no shared answer relabelled", memberAnswers.length === nMem && new Set(memberAnswers).size === nMem, memberAnswers);
  check("each member carries its own receipt digest, all distinct", (multi.captain?.members ?? []).every((m) => typeof m.memberDigest === "string" && /^[0-9a-f]{64}$/.test(m.memberDigest ?? "")) && new Set(multi.captain?.members.map((m) => m.memberDigest)).size === multi.specialistIds.length);
  check("the captain reports on N real member results — completed only when all answered", multi.captain?.status === "completed" && multi.captain?.members.every((m) => m.outcome === "answered"));
  check("the response note counts the real per-member executions", (multi.note ?? "").includes(`${multi.specialistIds.length} of ${multi.specialistIds.length} routed members executed`));
  check("every member call AND the synthesis call land in the token ledger", usageReport().calls === multi.specialistIds.length + 1, usageReport());
  check("the run ends in the captain's OWN synthesis (19.3.0)", multi.synthesis !== undefined && multi.reply.includes("CAPTAIN-SYNTHESIS") && /^[0-9a-f]{64}$/.test(multi.synthesis?.digest ?? ""), multi.synthesis?.digest);

  callNo = 0; calls.length = 0; failCallNo = 2;
  const partialRun = await askSelfImpulse19({ text: MULTI_TEXT, userId: "probe-user" }, { provider: prov, fetchImpl: memberFetch });
  failCallNo = -1;
  const failedMember = partialRun.captain?.members.find((m) => m.outcome === "error");
  check("a member whose OWN call failed is recorded as error — never relabelled answered", partialRun.captain?.status === "partial" && failedMember !== undefined && (failedMember.note ?? "").includes("http-error"));
  check("the reply shows the failed member's failure in words", partialRun.reply.includes("ERROR") && partialRun.reply.includes("member down"));
  check("a partial run is still honestly executed (some member really ran)", partialRun.executed === true && partialRun.outcome === "answered");

  const downFetch = (async () => new Response(JSON.stringify({ error: "all down" }), { status: 500 })) as unknown as typeof fetch;
  const dead = await askSelfImpulse19({ text: MULTI_TEXT, userId: "probe-user" }, { provider: prov, fetchImpl: downFetch });
  check("when NO member executes: error, executed:false, captain blocked — never a fake synthesis", dead.outcome === "error" && dead.executed === false && dead.captain?.status === "blocked");

  console.log(`\n${fail === 0 ? "✅" : "❌"} captains probe: ${pass} passed, ${fail} failed\n`);
  assert.equal(fail, 0, `${fail} captains checks failed`);
});
