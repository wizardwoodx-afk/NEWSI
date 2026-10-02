/**
 * probe/groups.test.ts — GROUPS: two owners' agents, one governed crew
 * (19.7.5 [Groups]).
 *
 * Pins: the charter law (two named owners, real capabilities, hard limits,
 * expiry), acceptance (all members, same digest, activation only when
 * complete), one-sided revocation, the rolling-window and expiry refusals,
 * the three modes over LOCAL and CROSSING items (crossings are risky by
 * nature — they gate in manual AND semi), the crossing cap, the per-item
 * human gate with the 19.7.4 revival law (a premature run over an all-gated
 * plan awaits the gate, approvals revive, the revived run executes), the
 * real execution seam (local member loops + a stubbed signed crossing),
 * the no-seam honesty (nothing was signed, nothing left this machine), and
 * the session receipt chaining item digests.
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
import {
  createCharter, acceptCharter, revokeCharter, charterDigest, checkCharter,
  createGroupSession, resolveGroupItem, switchGroupMode, runGroupSession,
  groupBriefing, resetGroupSessions, productionCross,
  type GroupCharter,
} from "../src/engine/groups";

const PROVIDER: ProviderConfig = {
  kind: "openai-compatible", provider: "openai-compatible",
  model: "si-probe-model", apiKey: "sk-si-probe-key",
  baseUrl: "https://si-probe.invalid/v1",
};

type FetchLike = (url: string, init?: { body?: string }) => Promise<{ ok: boolean; status: number; text: () => Promise<string>; json: () => Promise<unknown> }>;
const okFetch = (): FetchLike => async () => ({
  ok: true, status: 200, text: async () => "",
  json: async () => ({ choices: [{ message: { content: "Verified and complete: the slice holds." } }] }),
});

function makeCharter(at: number, over: Partial<{ mode: "manual" | "semi" | "full"; maxTasksPerDay: number; maxCrossingsPerTask: number; expiresAt: number; caps: number }> = {}): GroupCharter {
  const caps = (over.caps ?? 2) === 2 ? ["repo.read", "test.run"] as never[] : (["repo.read"] as never[]);
  const res = createCharter({
    name: "Ram ↔ Raj",
    members: [{ ownerId: "si-owner", label: "Ram" }, { ownerId: "si-owner-2", label: "Raj" }],
    capabilities: caps as never,
    limits: {
      maxTasksPerDay: over.maxTasksPerDay ?? 10,
      maxCrossingsPerTask: over.maxCrossingsPerTask ?? 3,
      expiresAt: over.expiresAt ?? at + 7 * 24 * 60 * 60 * 1000,
    },
    mode: over.mode ?? "manual",
    at,
  });
  assert.ok(res.charter);
  return res.charter;
}

const SLICES = ["design the login page", "design the payments database schema", "review the auth flow for security bugs"];

function main(): void {
  console.log("groups — two owners, one governed crew");

  /* the charter law */
  const t0 = Date.now(); // real clock — charters expire against it
  const one = createCharter({ name: "solo", members: [{ ownerId: "a", label: "A" }], capabilities: ["repo.read"] as never, limits: { maxTasksPerDay: 1, maxCrossingsPerTask: 1, expiresAt: t0 + 1000 }, at: t0 });
  ok("one owner is a crew, not a group — refused", one.charter === null && (one.error ?? "").includes("at least two"));
  const dup = createCharter({ name: "dup", members: [{ ownerId: "a", label: "A" }, { ownerId: "a", label: "A2" }], capabilities: ["repo.read"] as never, limits: { maxTasksPerDay: 1, maxCrossingsPerTask: 1, expiresAt: t0 + 1000 }, at: t0 });
  ok("duplicate owner ids are refused", dup.charter === null && (dup.error ?? "").includes("once"));
  const nocap = createCharter({ name: "x", members: [{ ownerId: "a", label: "A" }, { ownerId: "b", label: "B" }], capabilities: [], limits: { maxTasksPerDay: 1, maxCrossingsPerTask: 1, expiresAt: t0 + 1000 }, at: t0 });
  ok("a charter with no capabilities is not a charter", nocap.charter === null && (nocap.error ?? "").includes("at least one capability"));
  const badcap = createCharter({ name: "x", members: [{ ownerId: "a", label: "A" }, { ownerId: "b", label: "B" }], capabilities: ["launch_missiles" as never], limits: { maxTasksPerDay: 1, maxCrossingsPerTask: 1, expiresAt: t0 + 1000 }, at: t0 });
  ok("capabilities outside the delegation vocabulary are refused", badcap.charter === null && (badcap.error ?? "").includes("vocabulary"));
  const expired = createCharter({ name: "x", members: [{ ownerId: "a", label: "A" }, { ownerId: "b", label: "B" }], capabilities: ["repo.read"] as never, limits: { maxTasksPerDay: 1, maxCrossingsPerTask: 1, expiresAt: t0 - 1 }, at: t0 });
  ok("an expiry in the past is refused", expired.charter === null && (expired.error ?? "").includes("expires in the past"));
  const c = makeCharter(t0);
  ok("a valid charter exists as PROPOSED until accepted", c.status === "proposed" && checkCharter(c).ok);

  /* acceptance */
  const stranger = acceptCharter(c, "eve", t0 + 1);
  ok("a non-member cannot accept", !stranger.ok && stranger.line.includes("not a member"));
  const a1 = acceptCharter(c, "si-owner", t0 + 2);
  ok("first acceptance names who is still waiting", a1.ok && c.status === "proposed" && a1.line.includes("waiting for Raj"));
  const again = acceptCharter(c, "si-owner", t0 + 3);
  ok("double acceptance is an honest no-op refusal", !again.ok && again.line.includes("already accepted"));
  const a2 = acceptCharter(c, "si-owner-2", t0 + 4);
  ok("the LAST acceptance activates the group", a2.ok && c.status === "active" && a2.line.includes("ACTIVE"));
  ok("both members accepted the SAME charter digest",
    c.acceptances.length === 2 && c.acceptances[0].digest === c.acceptances[1].digest && c.acceptances[0].digest === charterDigest(c) && c.acceptances[0].digest.length === 64);

  /* limits */
  resetGroupSessions();
  const noacc = makeCharter(t0 + 10);
  const sNo = createGroupSession(noacc, "group task", SLICES, { at: t0 + 11 });
  ok("a proposed charter executes nothing", sNo.status === "failed" && (sNo.refusal ?? "").includes("every member must accept"));
  const exp = makeCharter(t0 + 20, { expiresAt: t0 + 25 });
  acceptCharter(exp, "si-owner", t0 + 21); acceptCharter(exp, "si-owner-2", t0 + 22);
  const sExp = createGroupSession(exp, "group task", SLICES, { at: t0 + 30 });
  ok("an expired charter refuses in words", sExp.status === "failed" && (sExp.refusal ?? "").includes("expired"));
  const capped = makeCharter(t0 + 40, { maxTasksPerDay: 2 });
  acceptCharter(capped, "si-owner", t0 + 41); acceptCharter(capped, "si-owner-2", t0 + 42);
  createGroupSession(capped, "task one", SLICES, { at: t0 + 43 });
  createGroupSession(capped, "task two", SLICES, { at: t0 + 44 });
  const sCap = createGroupSession(capped, "task three", SLICES, { at: t0 + 45 });
  ok("the rolling 24h task cap is the charter working, not an error", sCap.status === "failed" && (sCap.refusal ?? "").includes("per rolling 24h"));
  const fresh = makeCharter(t0 + 50);
  acceptCharter(fresh, "si-owner", t0 + 51); acceptCharter(fresh, "si-owner-2", t0 + 52);
  const sEmpty = createGroupSession(fresh, "task", [], { at: t0 + 53 });
  ok("no slices — nothing to plan", sEmpty.status === "failed" && (sEmpty.refusal ?? "").includes("at least one slice"));

  /* modes over local + crossing items */
  resetGroupSessions();
  const manual = makeCharter(t0 + 100, { mode: "manual", maxCrossingsPerTask: 1, caps: 1 });
  acceptCharter(manual, "si-owner", t0 + 101); acceptCharter(manual, "si-owner-2", t0 + 102);
  const sM = createGroupSession(manual, "build the joint draft", SLICES, { at: t0 + 103 });
  ok("manual gates EVERY item — local AND crossing", sM.items.every((i) => i.status === "gated") && sM.status === "awaiting-gate");
  ok("every gated item carries its ask wording", sM.items.every((i) => (i.gateAsk ?? "").includes("approval needed")));
  ok("the plan bounds crossings by the charter cap", sM.items.filter((i) => i.kind === "crossing").length === 1 && sM.items.filter((i) => i.kind === "local").length === SLICES.length);

  resetGroupSessions();
  const semi = makeCharter(t0 + 110, { mode: "semi", caps: 1 });
  acceptCharter(semi, "si-owner", t0 + 111); acceptCharter(semi, "si-owner-2", t0 + 112);
  const sS = createGroupSession(semi, "build the joint draft", SLICES, { at: t0 + 113 });
  ok("semi runs local safe items free — but CROSSINGS still gate (delegation is risky by nature)",
    sS.items.filter((i) => i.kind === "local").every((i) => i.status === "queued") && sS.items.filter((i) => i.kind === "crossing").every((i) => i.status === "gated"));

  /* the 19.7.4 lesson, applied from birth: premature run → awaiting-gate → approve → revived run */
  const premature = await0();
  function await0(): Promise<void> {
    resetGroupSessions();
    const s = createGroupSession(manual, "build the joint draft", SLICES, { at: t0 + 120 });
    ok("muster under manual: every item gated, session awaits", s.items.every((i) => i.status === "gated") && s.status === "awaiting-gate");
    return runGroupSession(s.id, { provider: PROVIDER, fetchImpl: okFetch() as unknown as typeof fetch }, t0 + 121).then((outP) => {
      ok("a premature run over an all-gated plan executes nothing", outP.answered === 0 && outP.failed === 0 && outP.refused === 0);
      ok("the session still awaits the gate — NOT failed", s.status === "awaiting-gate");
      const ref = resolveGroupItem(s.id, s.items[0].itemId, false, t0 + 122);
      ok("a refusal is final and named", ref.ok && s.items[0].status === "refused");
      for (const item of s.items) if (item.status === "gated") resolveGroupItem(s.id, item.itemId, true, t0 + 123);
      ok("approvals revive the session to running", s.status === "running");
      const crossCalls: string[] = [];
      return runGroupSession(s.id, {
        provider: PROVIDER, fetchImpl: okFetch() as unknown as typeof fetch,
        cross: async (item) => { crossCalls.push(item.capability ?? "?"); return { ok: true, detail: "crossed: both ledgers agree", digest: "c".repeat(64) }; },
      }, t0 + 124).then((out) => {
        ok("the revived run executes: the 2 approved locals answered via real member loops + the crossing",
          out.answered === 3 && s.items.filter((i) => i.kind === "local" && i.status === "answered").length === 2);
        ok("the crossing ran through the signed seam exactly once", crossCalls.length === 1 && crossCalls[0] === "repo.read");
        ok("every answered item carries a digest; the session receipt chains them",
          s.items.filter((i) => i.status === "answered").every((i) => (i.digest ?? "").length === 64) && (s.sessionReceipt ?? "").length === 64);
        ok("the steward closed the session with counts", s.feed.events.some((e) => e.kind === "crew-done" && e.line.includes("session receipt")));
        ok("the briefing reads like a steward, not a log", groupBriefing(s).includes("answered"));

        /* mode hot-switch mid-session */
        resetGroupSessions();
        const s2 = createGroupSession(semi, "joint work", SLICES, { at: t0 + 200 });
        const sw = switchGroupMode(s2.id, "full", t0 + 201, "stepping out");
        ok("the hot-switch opens gated crossings under full mode",
          sw.ok && s2.mode.mode === "full" && s2.items.filter((i) => i.kind === "crossing").every((i) => i.status === "queued"));
        ok("the switch line names the in-flight contract", sw.line.includes("in-flight acts finish under Semi-autonomous"));

        /* the no-seam honesty */
        resetGroupSessions();
        const s3 = createGroupSession(manual, "joint work", SLICES, { at: t0 + 210 });
        for (const item of s3.items) if (item.status === "gated") resolveGroupItem(s3.id, item.itemId, true, t0 + 211);
        return runGroupSession(s3.id, { provider: PROVIDER, fetchImpl: okFetch() as unknown as typeof fetch }, t0 + 212).then((out3) => {
          const cross = s3.items.find((i) => i.kind === "crossing");
          ok("no crossing seam — the crossing fails named, nothing was signed",
            cross !== undefined && cross.status === "failed" && (cross.note ?? "").includes("no crossing seam") && s3.feed.events.some((e) => e.line.includes("nothing left this machine")));

          /* revocation */
          const badRevoke = revokeCharter(c, "eve", "no reason", t0 + 300);
          ok("a non-member cannot revoke", !badRevoke.ok);
          const rev = revokeCharter(c, "si-owner-2", "Raj steps out", t0 + 301);
          ok("revocation is one-sided, final, and named", rev.ok && c.status === "revoked" && (c.revocation?.reason ?? "").includes("Raj steps out"));
          const sRev = createGroupSession(c, "task", SLICES, { at: t0 + 302 });
          ok("a revoked group executes nothing", sRev.status === "failed" && (sRev.refusal ?? "").includes("revoked"));
          const reAccept = acceptCharter(c, "si-owner", t0 + 303);
          ok("no acceptance revives a revoked group", !reAccept.ok && reAccept.line.includes("revoked"));

          /* the production seam exists and is wired to the real crossing */
          ok("the production crossing seam is the signed federation crossing", typeof productionCross("si-owner") === "function");

          console.log(`\n${passed} passed, ${failed} failed`);
          if (failed > 0) { console.log("\nfailures:"); for (const f of failures) console.log(`  - ${f}`); process.exit(1); }
        });
      });
    });
  }
  void premature;
}

main();
