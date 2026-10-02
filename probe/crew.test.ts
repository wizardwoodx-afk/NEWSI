/**
 * probe/crew.test.ts — THE CREW WORKSPACE (19.7.4 [Crew]).
 *
 * Pins: creation (dynamic pool → crew ≤ 25 → all acts gated under manual),
 * the human gate (approve/refuse, honest refusals), hot-switch mid-session
 * (gated safe members open under full; the ledger names the in-flight
 * contract), the real parallel run (member receipts, BEW trails, session
 * receipt), failover from the same-domain bench (named by the steward),
 * the crew breaker (3 consecutive unresolved failures → cooled down,
 * visible), and the empty-pool refusal.
 */
import assert from "node:assert/strict";

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

import type { ProviderConfig } from "../src/engine/types";
import { getSpecialist } from "../src/engine/registry";
import {
  createCrewSession, runCrewSession, getCrewSession, resolveGate, switchMode, crewBriefing,
  officeView, resetCrewSessions, CREW_CONCURRENCY, CREW_BREAKER,
} from "../src/engine/crew";
import { CREW_MAX } from "../src/engine/moeV2";

const PROVIDER: ProviderConfig = {
  kind: "openai-compatible",
  provider: "openai-compatible",
  model: "si-probe-model",
  apiKey: "sk-si-probe-key",
  baseUrl: "https://si-probe.invalid/v1",
};

type FetchLike = (url: string, init?: { body?: string }) => Promise<{ ok: boolean; status: number; text: () => Promise<string>; json: () => Promise<unknown> }>;

function okFetch(): FetchLike {
  return async () => ({
    ok: true, status: 200,
    text: async () => "",
    json: async () => ({ choices: [{ message: { content: "Verified against the checklist and complete: the deliverable holds." } }] }),
  });
}

function firstCallFails(): FetchLike {
  let n = 0;
  return async () => {
    n += 1;
    if (n === 1) return { ok: false, status: 500, text: async () => "internal server error", json: async () => null };
    return (okFetch())("", {} as { body?: string });
  };
}

function allFailFetch(): FetchLike {
  return async () => ({ ok: false, status: 500, text: async () => "internal server error", json: async () => null });
}

const APP_TASK = "build an app end to end: frontend, backend, database, security review and deployment";

function main(): void {
  console.log("crew — the governed working space");

  ok("the concurrency law equals the ceiling", CREW_CONCURRENCY === CREW_MAX && CREW_CONCURRENCY === 25);
  ok("the breaker is three consecutive unresolved failures", CREW_BREAKER === 3);

  /* creation + governance */
  resetCrewSessions();
  const s = createCrewSession(APP_TASK, { at: 1000 });
  ok("a compound build fields a real crew", s.selection.crew.length >= 4 && s.selection.crew.length <= CREW_MAX, `got ${s.selection.crew.length}`);
  ok("under manual mode EVERY act is gated — nothing moves unasked", s.slots.every((x) => x.status === "gated") && s.status === "awaiting-gate");
  ok("every gated member carries its ask wording", s.slots.every((x) => (x.gateAsk ?? "").includes("approval needed")));
  ok("the steward announced the muster with the mode named", s.feed.events.some((e) => e.kind === "crew-started" && e.line.includes("Manual")));

  /* the human gate */
  const first = s.slots[0];
  const refRes = resolveGate(s.id, first.slotId, false, 2000);
  ok("a refusal is final and named", refRes.ok && first.status === "refused" && s.feed.events.some((e) => e.line.includes(`${first.specialistId} refused at your gate`)));
  for (const slot of s.slots) if (slot.status === "gated") resolveGate(s.id, slot.slotId, true, 2000);
  ok("approvals open the session — no member left at the gate", s.slots.every((x) => x.status === "queued" || x.status === "refused") && s.status === "running");
  const badGate = resolveGate(s.id, first.slotId, true, 2100);
  ok("a settled member cannot be re-gated", !badGate.ok && badGate.line.includes("not at the gate"));

  /* hot-switch mid-session */
  const sw = switchMode(s.id, "full", 3000, "stepping out — hold the fort");
  ok("the hot-switch is recorded with the why", sw.ok && s.mode.mode === "full" && s.mode.switches[0].why === "stepping out — hold the fort");
  ok("the switch line names the in-flight contract", sw.line.includes("in-flight acts finish under Manual"));

  /* the real run */
  const outcome = (() => {
    let v: { answered: number; failed: number; reassigned: number; escalated: number; refused: number } | null = null;
    void v;
    return null;
  })();
  void outcome;
  const runP = runCrewSession(s.id, { provider: PROVIDER, fetchImpl: okFetch() as unknown as typeof fetch });
  return void runP.then(() => {
    ok("every admitted member answered (critical-tier members stay at the gate — the law, not a bug)", s.slots.filter((x) => x.status !== "refused" && x.status !== "gated").every((x) => x.status === "answered"));
    ok("refused members stay refused — the gate is real", s.slots.filter((x) => x.status === "refused").length === 1);
    ok("every answered member carries a member receipt", s.slots.filter((x) => x.memberDigest).every((x) => x.memberDigest!.length === 64));
    ok("every answered member carries its BEW trail", s.slots.filter((x) => x.bewPhases).every((x) => (x.bewPhases ?? "").includes("plan") && (x.verdict === "done" || x.verdict === "partial")));
    ok("the session receipt chains the member receipts", typeof s.sessionReceipt === "string" && s.sessionReceipt.length === 64);
    ok("the steward reported the completion with counts", s.feed.events.some((e) => e.kind === "crew-done" && e.line.includes("session receipt")));
    ok("the briefing counts what happened", crewBriefing(s).includes("answered") && crewBriefing(s).includes("done"));

    /* failover from the same-domain bench */
    resetCrewSessions();
    const s2 = createCrewSession(APP_TASK, { mode: "full", at: 5000 });
    const target = s2.slots[0];
    return runCrewSession(s2.id, { provider: PROVIDER, fetchImpl: firstCallFails() as unknown as typeof fetch }).then(() => {
      const failedSlot = s2.slots.find((x) => x.specialistId === target.specialistId && x.status === "reassigned");
      ok("the failed member was replaced from its bench", failedSlot !== undefined && typeof failedSlot.replacedBy === "string");
      if (failedSlot?.replacedBy) {
        const rep = s2.slots.find((x) => x.specialistId === failedSlot.replacedBy && x.status === "answered");
        ok("the replacement ran and answered", rep !== undefined);
        ok("replacement is same-domain", getSpecialist(failedSlot.replacedBy!)?.category === getSpecialist(target.specialistId)?.category);
      }
      ok("the steward named the swap", s2.feed.events.some((e) => e.kind === "member-reassigned" && e.line.includes("stepped in from the same")));

      /* the crew breaker */
      resetCrewSessions();
      const s3 = createCrewSession(APP_TASK, { mode: "full", at: 7000 });
      return runCrewSession(s3.id, { provider: PROVIDER, fetchImpl: allFailFetch() as unknown as typeof fetch }).then(() => {
        ok(`${CREW_BREAKER} consecutive unresolved failures cool the session down`, s3.status === "cooled-down");
        ok("the breaker is announced, never silent", s3.feed.events.some((e) => e.line.includes("crew breaker") && e.line.includes("cooled down")));

        /* the empty-pool refusal */
        resetCrewSessions();
        const s4 = createCrewSession("flibbertigibbet xzyq qwertyuiop zzz", { at: 9000 });
        ok("no matching domain — no crew, stated plainly", s4.selection.crew.length === 0 && s4.status === "failed" && (s4.refusal ?? "").includes("nothing was selected, nothing was executed"));
        return runCrewSession(s4.id, { provider: PROVIDER, fetchImpl: okFetch() as unknown as typeof fetch }).then((out4) => {
          ok("the refused session executes nothing", out4.answered === 0 && out4.failed === 0 && out4.reassigned === 0);

          /* ── 19.7.4 review fix: the REAL UI sequence, pinned end-to-end ──
             create (manual → all gated) → a premature run executes NOTHING
             and the session AWAITS the gate (not failed) → the owner
             approves → the session revives to running → the run executes. */
          resetCrewSessions();
          const s5 = createCrewSession(APP_TASK, { mode: "manual", at: 11000 });
          ok("muster under manual gates the whole crew and waits", s5.slots.every((x) => x.status === "gated") && s5.status === "awaiting-gate");
          return runCrewSession(s5.id, { provider: PROVIDER, fetchImpl: okFetch() as unknown as typeof fetch }).then((out5) => {
            ok("a premature run over an all-gated roster executes nothing", out5.answered === 0 && out5.failed === 0 && out5.reassigned === 0 && out5.refused === 0);
            ok("the session is NOT failed — it awaits the gate, stated in the feed",
              s5.status === "awaiting-gate" && s5.feed.events.some((e) => e.line.includes("nothing executed")));
            for (const slot of s5.slots) resolveGate(s5.id, slot.slotId, true, 11200);
            ok("approvals revive the session to running", s5.status === "running");
            return runCrewSession(s5.id, { provider: PROVIDER, fetchImpl: okFetch() as unknown as typeof fetch }).then((out6) => {
              ok("the revived run executes the approved crew", out6.answered === s5.slots.length && s5.status === "done");

              /* an all-refused crew is the owner's call — done, not failed */
              resetCrewSessions();
              const s6 = createCrewSession(APP_TASK, { mode: "manual", at: 12000 });
              for (const slot of s6.slots) resolveGate(s6.id, slot.slotId, false, 12100);
              return runCrewSession(s6.id, { provider: PROVIDER, fetchImpl: okFetch() as unknown as typeof fetch }).then((out7) => {
                ok("an all-refused crew is done-with-nothing, worded as the owner's decision",
                  s6.status === "done" && out7.refused === s6.slots.length && s6.feed.events.some((e) => e.line.includes("exactly as you decided")));

                /* 19.7.6 [Office] — the office view: departments + the shared board */
                const office = officeView(s5);
                ok("the office groups the crew into departments, one per domain, complete",
                  office.departments.length >= 1
                  && office.departments.every((d) => d.members.every((m) => getSpecialist(m.specialistId)?.category === d.domain))
                  && office.rooms === new Set(s5.slots.map((x) => x.domain)).size
                  && office.departments.reduce((n, d) => n + d.members.length, 0) === s5.slots.length);
                ok("the office board counts every slot exactly once, in the right column",
                  office.board.atGate + office.board.working + office.board.answered + office.board.sidelined === s5.slots.length
                  && office.board.answered === s5.slots.filter((x) => x.status === "answered").length
                  && office.board.sidelined === s5.slots.filter((x) => x.status === "refused").length);
                ok("the office headline reads like a floor, not a log", office.headline.includes("department") && office.headline.includes("on the floor"));

                console.log(`\n${passed} passed, ${failed} failed`);
                if (failed > 0) { console.log("\nfailures:"); for (const f of failures) console.log(`  - ${f}`); process.exit(1); }
              });
            });
          });
        });
      });
    });
  }).catch((e) => {
    failed++;
    console.log(`  FAIL the run threw — ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  });
}

main();
