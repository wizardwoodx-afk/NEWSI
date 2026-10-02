/**
 * probe/teamEvolve.test.ts — cross-user Team-Evolve (18.1.0).
 *
 * Pins the differentiator the product's vision rests on: the TEAM itself
 * learns. Joint runs are recorded with real outcomes; evolution proposals
 * are derived from verified history only; adoption requires EVERY member's
 * explicit approval (User 2's consent is structural — partial, duplicated
 * and outsider approvals all refuse); the evolved config leans on routing
 * VISIBLY; and revocation is a one-call human act.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

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

import {
  applyTeamPreference,
  approveTeamEvolution,
  autoProposeIfReady,
  evolvedConfig,
  pendingProposal,
  proposeTeamEvolution,
  recordTeamRun,
  revokeEvolvedConfig,
  teamIdFor,
  teamMemoryReport,
  teamRuns,
} from "../src/engine/teamEvolve";
import type { RouteCandidate } from "../src/engine/types";

let pass = 0;
let fail = 0;
const check = (name: string, cond: boolean, detail?: unknown): void => {
  if (cond) pass++;
  else fail++;
  console.log(`  ${cond ? "✅" : "❌"} ${name}${cond || detail === undefined ? "" : ` — ${JSON.stringify(detail)}`}`);
};

const TEAM_A = teamIdFor(["member-a", "qwen"]);

test("teamEvolve — the team itself learns, with every member's consent", async () => {
  console.log("\n── 1. team identity ──");
  check("team id is order- and case-independent", teamIdFor(["member-a", "qwen"]) === teamIdFor(["QWEN", "MEMBER-A"]));
  check("duplicate members collapse", teamIdFor(["a", "a", "b"]) === teamIdFor(["b", "a"]));

  console.log("\n── 2. the joint run ledger ──");
  check("a fresh team has no runs", teamRuns(TEAM_A).length === 0);
  recordTeamRun({ teamId: TEAM_A, members: ["member-a", "qwen"], task: "fix the parser bug", outcome: "verified", specialists: ["code.debugging", "testing.unit"] });
  recordTeamRun({ teamId: TEAM_A, members: ["member-a", "qwen"], task: "refactor auth", outcome: "failed", specialists: ["code.typescript"] });
  recordTeamRun({ teamId: TEAM_A, members: ["member-a", "qwen"], task: "review payment handler", outcome: "verified", specialists: ["review.code", "security.review"] });
  const rep = teamMemoryReport(TEAM_A);
  check("runs are counted honestly", rep.runs === 3 && rep.verified === 2 && rep.failed === 1 && rep.refused === 0, rep);
  check("success rate is computed from real outcomes", Math.abs(rep.successRate - 2 / 3) < 1e-9);
  check("top specialists are ranked by VERIFIED runs only", rep.topSpecialists[0].verifiedRuns === 1 && rep.topSpecialists.every((e) => e.verifiedRuns >= 1));
  check("other teams' runs never leak in", teamMemoryReport(teamIdFor(["solo"])).runs === 0);

  console.log("\n── 3. proposals come from real history only ──");
  const early = await proposeTeamEvolution(teamIdFor(["fresh", "team"]), ["fresh", "team"]);
  check("a team with no history cannot propose — refused in words", early.ok === false && !early.ok && early.error.includes("at least 3"));
  // a team with runs but zero verified
  const neverWon = teamIdFor(["doom", "gloom"]);
  recordTeamRun({ teamId: neverWon, members: ["doom", "gloom"], task: "t1", outcome: "failed", specialists: ["code.debugging"] });
  recordTeamRun({ teamId: neverWon, members: ["doom", "gloom"], task: "t2", outcome: "failed", specialists: ["code.debugging"] });
  recordTeamRun({ teamId: neverWon, members: ["doom", "gloom"], task: "t3", outcome: "refused", specialists: ["code.debugging"] });
  const noWins = await proposeTeamEvolution(neverWon, ["doom", "gloom"]);
  check("a team that never succeeded has nothing to evolve from", noWins.ok === false && !noWins.ok && noWins.error.includes("no verified runs"));
  const prop = await proposeTeamEvolution(TEAM_A, ["member-a", "qwen"]);
  check("with real verified history the proposal lands", prop.ok === true);
  assert.ok(prop.ok);
  check("recommended specialists come from the verified record", prop.proposal.recommendedSpecialists.length >= 2 && prop.proposal.recommendedSpecialists.every((id) => rep.topSpecialists.some((e) => e.id === id)));
  check("the proposal names its source runs (provenance)", prop.proposal.sourceRunIds.length === 2 && prop.proposal.sourceRunIds.every((id) => teamRuns(TEAM_A).some((r) => r.id === id)));
  check("the rationale cites the real success rate", prop.proposal.rationale[0].includes("2/3"));
  check("the proposal carries a computed digest", /^[0-9a-f]{64}$/.test(prop.proposal.digest));
  check("the proposal is pending until decided", pendingProposal(TEAM_A)?.id === prop.proposal.id);

  console.log("\n── 4. adoption: EVERY member approves, or it does not exist ──");
  const partial = await approveTeamEvolution(TEAM_A, prop.proposal.id, [{ memberId: "member-a", approved: true, at: new Date().toISOString() }]);
  check("partial approval is refused — User 2's consent is structural", partial.ok === false && !partial.ok && partial.error.includes("missing explicit approval") && partial.error.includes("qwen"));
  const dupe = await approveTeamEvolution(TEAM_A, prop.proposal.id, [
    { memberId: "member-a", approved: true, at: new Date().toISOString() },
    { memberId: "member-a", approved: true, at: new Date().toISOString() },
  ]);
  check("duplicate approvals are refused — one voice per member", dupe.ok === false && !dupe.ok && dupe.error.includes("duplicate"));
  const outsider = await approveTeamEvolution(TEAM_A, prop.proposal.id, [
    { memberId: "member-a", approved: true, at: new Date().toISOString() },
    { memberId: "mallory", approved: true, at: new Date().toISOString() },
  ]);
  check("outsider approvals are refused", outsider.ok === false && !outsider.ok && outsider.error.includes("not a member"));
  const declined = await approveTeamEvolution(TEAM_A, prop.proposal.id, [
    { memberId: "member-a", approved: true, at: new Date().toISOString() },
    { memberId: "qwen", approved: false, at: new Date().toISOString() },
  ]);
  check("a single decline blocks adoption", declined.ok === false && !declined.ok && declined.error.includes("declined"));
  check("no config exists while adoption is blocked", evolvedConfig(TEAM_A) === null);
  const adopted = await approveTeamEvolution(TEAM_A, prop.proposal.id, [
    { memberId: "member-a", approved: true, at: new Date().toISOString() },
    { memberId: "qwen", approved: true, at: new Date().toISOString() },
  ]);
  check("unanimous approval adopts the config", adopted.ok === true && adopted.ok === true && adopted.config.version === 1);
  assert.ok(adopted.ok);
  check("the adopted config records both approvals and its source runs", adopted.config.approvals.length === 2 && adopted.config.sourceRunIds.length === 2 && /^[0-9a-f]{64}$/.test(adopted.config.digest));
  check("the pending proposal is consumed by adoption", pendingProposal(TEAM_A) === null);
  check("an unknown proposal id cannot be adopted", (await approveTeamEvolution(TEAM_A, "evo-nope", [{ memberId: "member-a", approved: true, at: "" }, { memberId: "qwen", approved: true, at: "" }])).ok === false);

  console.log("\n── 5. the evolved config leans on routing — visibly ──");
  const selected: RouteCandidate[] = [
    { id: "code.typescript", score: 9, reasons: ["keyword match"] },
    { id: "review.code", score: 7, reasons: ["keyword match"] },
    { id: "testing.unit", score: 6, reasons: ["keyword match"] },
  ];
  const leaned = applyTeamPreference(TEAM_A, selected);
  const boosted = leaned.find((c) => c.id === "review.code")!;
  check("a recommended specialist gets the labeled boost", boosted.score === 9 && boosted.reasons.some((r) => r.includes("team-evolved preference")));
  check("non-recommended specialists are untouched", leaned.find((c) => c.id === "code.typescript")!.score === 9 && !leaned.find((c) => c.id === "code.typescript")!.reasons.some((r) => r.includes("team-evolved")));
  check("the lean reorders by the boosted scores", leaned[0].score >= leaned[1].score);
  const outside: RouteCandidate[] = [{ id: "data.visualization", score: 5, reasons: ["keyword match"] }];
  check("a specialist absent from the decision is never injected", applyTeamPreference(TEAM_A, outside).length === 1 && applyTeamPreference(TEAM_A, outside)[0].id === "data.visualization");
  check("teams without a config get no lean", applyTeamPreference(teamIdFor(["solo"]), selected)[0].score === 9);

  console.log("\n── 6. revocation is a human act ──");
  revokeEvolvedConfig(TEAM_A);
  check("revocation removes the config", evolvedConfig(TEAM_A) === null);
  check("and the routing lean disappears with it", applyTeamPreference(TEAM_A, selected).find((c) => c.id === "review.code")!.score === 7);

  console.log("\n── 5. the team self-proposes after connection (18.2.0) ──");
  {
    const AUTO = teamIdFor(["auto-1", "auto-2"]);
    check("a brand-new connection proposes nothing yet", (await autoProposeIfReady(AUTO, ["auto-1", "auto-2"])) === null);
    recordTeamRun({ teamId: AUTO, members: ["auto-1", "auto-2"], task: "a1", outcome: "verified", specialists: ["code.debugging"] });
    recordTeamRun({ teamId: AUTO, members: ["auto-1", "auto-2"], task: "a2", outcome: "failed", specialists: ["testing.unit"] });
    recordTeamRun({ teamId: AUTO, members: ["auto-1", "auto-2"], task: "a3", outcome: "verified", specialists: ["review.code"] });
    const auto = await autoProposeIfReady(AUTO, ["auto-1", "auto-2"]);
    check("3+ runs, a verified one, 2+ specialists → the team mints its own proposal", auto !== null);
    check("the auto-proposal is visible as pending, not silently adopted", pendingProposal(AUTO)?.id === auto?.id);
    check("and it is never proposed twice", (await autoProposeIfReady(AUTO, ["auto-1", "auto-2"])) === null);
    revokeEvolvedConfig(AUTO); // leave the store clean
  }

  console.log(`\n${fail === 0 ? "✅" : "❌"} teamEvolve probe: ${pass} passed, ${fail} failed\n`);
  assert.equal(fail, 0, `${fail} Team-Evolve checks failed`);
});
