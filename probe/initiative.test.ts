/**
 * probe/initiative.test.ts — the INITIATIVE engine (the autonomy loop).
 *
 * Pins: the layered autonomy levels (0 = never acts), the heartbeat wake
 * decision (due follow-ups → goal resume → memory-drift briefing → the
 * vault proposal), the caps (hour/day/depth), idempotency keys (no
 * duplicate acts in a window), and the circuit breaker (3 failures →
 * cooldown, visible). The engine only ever EXECUTES safe work — risky
 * things are proposals for the human gate.
 */
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";

declare const SI_ROOT: string | undefined;
const ROOT = typeof SI_ROOT === "string" && SI_ROOT.length > 0 ? SI_ROOT : process.cwd();

let passed = 0; let failed = 0; const failures: string[] = [];
function ok(label: string, cond: boolean, detail = ""): void {
  if (cond) { passed++; console.log(`  ok   ${label}`); }
  else { failed++; failures.push(`${label}${detail ? ` — ${detail}` : ""}`); console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`); }
}

class MemStore implements Storage {
  private m = new Map<string, string>();
  get length() { return this.m.size; } clear() { this.m.clear(); }
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null; }
  key(i: number) { return Array.from(this.m.keys())[i] ?? null; }
  removeItem(k: string) { this.m.delete(k); } setItem(k: string, v: string) { this.m.set(k, v); }
}
(globalThis as { localStorage?: Storage }).localStorage = new MemStore();

import {
  loadInitiative, setLevel, evaluateWake, applyWake, scheduleFollowUp,
  breakerTripped, reportFailure, reportSuccess, executeWakeActs,
  LIMITS, AUTONOMY_LEVEL_NAMES, fnv1a, type ActExecutor,
} from "../src/engine/initiative";
import { engineExecutor, actPrompt, mapReplyToVerdict } from "../src/engine/initiativeBridge";
import type { ProviderConfig } from "../src/engine/types";

function freshState(): ReturnType<typeof loadInitiative> {
  const s = loadInitiative();
  s.followUps = []; s.acts = []; s.windowActs = []; s.recentFailures = 0; s.breakerUntil = null; s.lastBrieftAt = null;
  return s;
}

async function main(): Promise<void> {
  const T0 = 1_700_000_000_000;

  /* levels */
  ok("four autonomy levels named honestly", AUTONOMY_LEVEL_NAMES[0].startsWith("manual") && AUTONOMY_LEVEL_NAMES[2].includes("capped") && AUTONOMY_LEVEL_NAMES[3].includes("capped"));
  const s0 = freshState(); s0.level = 0;
  const wake0 = evaluateWake({ now: T0, level: 0, providerReady: true, vaultUnlocked: true, memoryOn: false }, s0, { newFacts: 99 });
  ok("level 0 NEVER acts — manual is manual", wake0.kind === "ok" && wake0.acts.length === 0);

  /* scheduled level (1): briefing from memory drift */
  const s1 = freshState(); s1.level = 1;
  const wake1 = evaluateWake({ now: T0, level: 1, providerReady: false, vaultUnlocked: false, memoryOn: true }, s1, { newFacts: 5 });
  ok("level 1 wakes on memory drift and proposes a briefing", wake1.kind === "act" && wake1.acts.some((a) => a.kind === "brief"));
  ok("briefing is throttled (lastBrieftAt set on apply)", applyWake(wake1, s1, T0).lastBrieftAt === T0);
  const wake1b = evaluateWake({ now: T0 + 1000, level: 1, providerReady: false, vaultUnlocked: false, memoryOn: true }, s1, { newFacts: 9 });
  ok("no second briefing inside the throttle window", !wake1b.acts.some((a) => a.kind === "brief"));

  /* quiet wake */
  const sQ = freshState(); sQ.level = 1;
  const wakeQ = evaluateWake({ now: T0, level: 1, providerReady: false, vaultUnlocked: true, memoryOn: false }, sQ, { newFacts: 0 });
  ok("nothing due → heartbeat ok", wakeQ.kind === "ok" && /heartbeat ok/.test(wakeQ.note));

  /* the vault proposal — a proposal, never an action */
  const sP = freshState(); sP.level = 1;
  const wakeP = evaluateWake({ now: T0, level: 1, providerReady: false, vaultUnlocked: false, memoryOn: true }, sP, { newFacts: 0 });
  const prop = wakeP.acts.find((a) => a.kind === "proposal");
  ok("memory-on-without-vault earns a PROPOSAL to create the vault (never a silent action)", !!prop && /create the vault/i.test(prop!.note));

  /* follow-ups: caps, depth, idempotency, level gate */
  setLevel(2);
  const sf = freshState(); sf.level = 2;
  const ok1 = scheduleFollowUp("verify", "regression green after the fix", T0 + 1000, 1, T0);
  ok("level 2+ may schedule a follow-up", ok1.ok === true);
  const dup = scheduleFollowUp("verify", "regression green after the fix", T0 + 1000, 1, T0);
  ok("duplicate follow-up refused by idempotency key", dup.ok === false && /duplicate/i.test(dup.why ?? ""));
  const deep = scheduleFollowUp("check", "chain too deep", T0 + 1000, LIMITS.maxFollowUpDepth + 1, T0);
  ok("depth beyond the cap refused — chains stop", deep.ok === false && /depth/i.test(deep.why ?? ""));
  const s0f = freshState(); s0f.level = 1;
  setLevel(1);
  const notYet = scheduleFollowUp("verify", "level too low", T0 + 1000, 1, T0);
  ok("self-scheduling below level 2 refused in words", notYet.ok === false && /level 2/.test(notYet.why ?? ""));

  /* due follow-up acts on a wake at level 2 */
  setLevel(2);
  const sd = freshState(); sd.level = 2;
  scheduleFollowUp("verify", "nightly build check", T0 + 500, 1, T0);
  const wakeD = evaluateWake({ now: T0 + 2000, level: 2, providerReady: false, vaultUnlocked: true, memoryOn: false }, sd, { newFacts: 0 });
  ok("due follow-up becomes an act on the wake", wakeD.kind === "act" && wakeD.acts.some((a) => a.subject.includes("nightly build check")));
  const after = applyWake(wakeD, sd, T0 + 2000);
  ok("consumed follow-up leaves the queue", !after.followUps.some((f) => f.subject.includes("nightly build check")));

  /* caps */
  const sc = freshState(); sc.level = 2;
  for (let i = 0; i < LIMITS.maxActsPerHour; i++) sc.windowActs.push({ at: T0 - 1000, key: `k${i}` });
  const wakeC = evaluateWake({ now: T0, level: 2, providerReady: true, vaultUnlocked: true, memoryOn: false }, sc, { newFacts: 12 });
  ok("hourly cap exhausts initiative — the wake goes quiet", wakeC.acts.length === 0 || wakeC.kind === "ok");

  /* circuit breaker */
  const sb = freshState(); sb.level = 2;
  for (let i = 0; i < LIMITS.breakerFailures; i++) reportFailure(sb);
  ok("three consecutive failures trip the breaker", breakerTripped(sb, Date.now()));
  const wakeB = evaluateWake({ now: Date.now(), level: 2, providerReady: true, vaultUnlocked: true, memoryOn: false }, sb, { newFacts: 5 });
  ok("a tripped breaker parks the engine and SAYS so", wakeB.breakerTripped === true && /circuit breaker open/i.test(wakeB.note));

  /* duplicate act suppression on apply */
  const sa = freshState(); sa.level = 2;
  const wakeA = evaluateWake({ now: T0, level: 2, providerReady: false, vaultUnlocked: false, memoryOn: true }, sa, { newFacts: 4 });
  applyWake(wakeA, sa, T0);
  const countAfterFirst = sa.acts.length;
  applyWake(wakeA, sa, T0 + 100);
  ok("the same act in the same window is skipped as duplicate", sa.acts.length === countAfterFirst || sa.acts.some((a) => a.outcome === "skipped-duplicate"));

  /* fnv determinism */
  ok("fnv1a is deterministic", fnv1a("initiative") === fnv1a("initiative") && fnv1a("a") !== fnv1a("b"));

  /* ── THE EXECUTION BRIDGE: decide → EXECUTE → observe → receipt → reschedule ── */
  console.log("the execution bridge — acts run the real engine, outcomes land in state");
  setLevel(2);

  // proposals never execute
  {
    const sp = freshState(); sp.level = 2;
    const w = evaluateWake({ now: T0, level: 2, providerReady: false, vaultUnlocked: false, memoryOn: true }, sp, { newFacts: 0 });
    const prop = w.acts.find((a) => a.kind === "proposal")!;
    let calls = 0;
    const spy: ActExecutor = async () => { calls += 1; return { verdict: "done", detail: "should not run" }; };
    const runs = await executeWakeActs([prop], spy);
    ok("proposals NEVER self-execute — the human gate owns them", calls === 0 && runs[0].executed === false && /human gate|your decision/.test(runs[0].whyNot ?? ""));
  }

  // done verdict → outcome done + breaker healed
  {
    const sd = freshState(); sd.level = 2;
    for (let i = 0; i < 2; i++) reportFailure(sd);
    setLevel(2);
    const act = { id: "a1", kind: "check" as const, subject: "nightly build check", at: T0, note: "", outcome: "proposed" as const };
    const runs = await executeWakeActs([act], async () => ({ verdict: "done", detail: "build green, 41 tests" }));
    ok("a done verdict lands as an executed receipt with the engine's detail",
      runs[0].executed === true && act.outcome === "done" && /build green/.test(act.note));
    ok("success heals the breaker count (three STRAIGHT failures trip it)", loadInitiative().recentFailures === 0);
  }

  // failed verdict → reportFailure → breaker trips at 3
  {
    const sf = freshState(); sf.level = 2;
    setLevel(2);
    const acts = [1, 2, 3].map((i) => ({ id: `f${i}`, kind: "verify" as const, subject: `failing check ${i}`, at: T0, note: "", outcome: "proposed" as const }));
    const runs = await executeWakeActs(acts, async () => ({ verdict: "failed", detail: "engine refused: no provider" }));
    ok("failed executions feed the circuit breaker — three trip it",
      runs.every((r) => r.act.outcome === "failed") && breakerTripped(loadInitiative()));
  }

  // blocked verdict → surfaced, never forced
  {
    setLevel(2);
    const sb = freshState(); sb.level = 2;
    const act = { id: "b1", kind: "resume" as const, subject: "gated goal step", at: T0, note: "", outcome: "proposed" as const };
    const runs = await executeWakeActs([act], async () => ({ verdict: "blocked", detail: "stopped at the human gate" }));
    ok("blocked work is surfaced for the human, never forced through",
      runs[0].executed === false && act.outcome === "proposed" && /human gate/.test(act.note));
  }

  // partial verdict → capped verify check-back at level 2+, refused at level 1
  {
    setLevel(2);
    const sp2 = freshState(); sp2.level = 2;
    const act = { id: "p1", kind: "verify" as const, subject: "partial reconciliation", at: T0, note: "", outcome: "proposed" as const };
    const runs = await executeWakeActs([act], async () => ({ verdict: "partial", detail: "3 of 5 lines matched" }));
    ok("partial work reschedules a verify check-back (depth-capped, self-set law applies)",
      act.outcome === "done" && runs[0].rescheduled?.ok === true && loadInitiative().followUps.some((f) => f.subject.startsWith("re-check:")));

    setLevel(1);
    const act2 = { id: "p2", kind: "verify" as const, subject: "another partial", at: T0, note: "", outcome: "proposed" as const };
    const runs2 = await executeWakeActs([act2], async () => ({ verdict: "partial", detail: "half done" }));
    ok("check-backs obey the level law — level 1 refuses self-scheduling in words",
      runs2[0].rescheduled?.ok === false && /level 2/.test(runs2[0].rescheduled?.why ?? ""));
    setLevel(2);
  }

  // executor throw → failed verdict, honest note
  {
    setLevel(2);
    const st2 = freshState(); st2.level = 2;
    const act = { id: "t1", kind: "brief" as const, subject: "briefing", at: T0, note: "", outcome: "proposed" as const };
    const runs = await executeWakeActs([act], async () => { throw new Error("boom"); });
    ok("an executor crash is a FAILED receipt, not silence", runs[0].act.outcome === "failed" && /boom/.test(act.note));
  }

  // ── THE TRUE INTEGRATION TEST (reviewer demand, 19.7.3): heartbeat act →
  // real askSelfImpulse19 → real routing/MoE → real member agent loop → REAL provider
  // calls (scripted fetch) → real receipt. No mocked executor — the only
  // fake is the wire, the established VH probe pattern. ──
  console.log("integration — heartbeat act through the REAL engine with a scripted provider");
  {
    const calls: Array<{ url: string; body: string }> = [];
    const impl = (async (input: unknown, init?: unknown) => {
      const req = (init ?? {}) as RequestInit;
      calls.push({ url: String(input), body: String(req.body ?? "") });
      return new Response(JSON.stringify({ choices: [{ message: { content: "Verification complete: the nightly build is green and all 41 checks pass." } }] }), { status: 200 });
    }) as unknown as typeof fetch;
    const provider: ProviderConfig = { kind: "openai-compatible", baseUrl: "https://api.openai.com/v1", apiKey: "sk-test-abcdefgh123456789", model: "gpt-test" };
    const executor = engineExecutor({
      userId: "probe-user",
      depsFactory: () => ({ provider, fetchImpl: impl }),
    });
    const act = { id: "int1", kind: "verify" as const, subject: "nightly build check", at: T0, note: "", outcome: "proposed" as const };
    const runs = await executeWakeActs([act], executor);
    ok("heartbeat act → REAL engine → REAL provider calls (route + member loop hit the wire)",
      runs[0].executed === true && calls.length >= 2 && calls.every((c) => c.url === "https://api.openai.com/v1/chat/completions"),
      `calls=${calls.length}`);
    ok("the engine's answer landed as an EXECUTED receipt carrying the engine's own accounting (members executed · member receipts)",
      act.outcome === "done" && runs[0].result?.verdict === "done" && /executed via the real engine/.test(act.note) && /member receipt|routed members executed/.test(act.note), act.note.slice(0, 120));
    ok("the member loop ran (the request carried the composed specialist prompt, not just the raw act)",
      calls.some((c) => c.body.includes("system")) && calls.some((c) => c.body.toLowerCase().includes("nightly build check")));

    // the honest no-provider degradation — planned-only says so, feeds nothing
    const planned = engineExecutor({ userId: "probe-user", depsFactory: () => ({}) });
    const act2 = { id: "int2", kind: "check" as const, subject: "budget re-check", at: T0, note: "", outcome: "proposed" as const };
    const runs2 = await executeWakeActs([act2], planned);
    ok("no provider ⇒ planned-only, stated in the receipt — never dressed as executed",
      runs2[0].result?.verdict === "partial" && /no provider connected, nothing executed/.test(act2.note));
  }

  // the mapping is defined ONCE (bridge) and the console uses the shared factory
  // 19.7.12 (UI): the production caller is the store (src/ui/store.ts), not a console view.
  const ncSrc = fs.readFileSync(path.join(ROOT, "src/ui/store.ts"), "utf8");
  ok("the store builds the SHARED production executor (engineExecutor) — no inline copy",
    ncSrc.includes("engineExecutor({") && !ncSrc.includes("const executor: ActExecutor = async (act)"));
  /* 19.8 — this pin matched the literal `userId: USER`, which was a hardcoded
     constant. The store now resolves the subject through the identity seam
     (`userId: subject`), so the literal moved. The INTENT of the pin is that the
     heartbeat path and the typed path carry the SAME dependency set — provider,
     gate, handoff recorder, evidence fetch and a resolved subject — and that
     intent is now stronger, because the assertion requires the subject to come
     from the seam rather than from a constant that would let a second person's
     run be attributed to the first. */
  ok("the executor carries the SAME dep set as a normal chat send (provider · gate · handoff · evidenceFetch · subject)",
    /depsFactory: \(\) => runDeps\(get, set, gateFn\)/.test(ncSrc) &&
    /await askSelfImpulse19\(\{ text: sentText, userId: subject \}, runDeps\(get, set, gateFn\)\)/.test(ncSrc) &&
    ncSrc.includes("gate: gateFn,") &&
    ncSrc.includes("evidenceFetch: typeof globalThis.fetch") &&
    /userId: currentSubject\(\) \?\? "unattributed"/.test(ncSrc),
    "the heartbeat path must resolve its subject through the identity seam, not a constant");
  ok("gate-blocked user runs leave a capped check-back (production scheduleFollowUp caller)",
    ncSrc.includes('scheduleFollowUp("verify"') && ncSrc.includes('resp.outcome === "gated-out"'));
  ok("the heartbeat is armed above level 0 and re-armed on every level change",
    /setInterval\(\(\) => \{ void get\(\)\.wakeNow\(\); \}, HEARTBEAT_DEFAULT_MS\)/.test(ncSrc) && /armHeartbeat\(get\)/.test(ncSrc) && /level === 0/.test(ncSrc));
  ok("run failures feed the circuit breaker (production reportFailure caller)",
    ncSrc.includes("reportFailure(loadInitiative());") && ncSrc.includes("The run failed before it could answer"));
  ok("receipts say what ran — 'executed through the real engine' renders with per-act verdicts",
    ncSrc.includes("executed through the real engine"));

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) { console.log("\nfailures:"); for (const f of failures) console.log(`  - ${f}`); process.exit(1); }
}
await main();
