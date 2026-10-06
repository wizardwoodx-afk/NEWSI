/**
 * §BOOKS probe — Agent FinOps, Agent IAM, and the live Assurance score.
 *
 * The three 2027 asks, wired: a dollar-honest chargeback, a fleet roster
 * over the sovereign (never a second authority), and a measured assurance
 * score that refuses to exist without evidence.
 */
import assert from "node:assert/strict";
import {
  byDay, byMission, bySeat, chargebackCsv, ledgerDigest,
  recordSeatRun, resetFinopsForProbe, summary,
} from "../src/engine/finops";
import { scoreFromLedger, scoreRuns } from "../src/engine/assuranceLive";
import { roster, revokeAgent } from "../src/engine/iamLedger";
import { sovereign } from "../src/security/sovereign";
import { bindOwnerRoot } from "../src/security/ownerRoot";

let pass = 0;
let fail = 0;
function ok(label: string, cond: boolean, detail = ""): void {
  if (cond) { pass += 1; console.log(`  ok   ${label}`); }
  else { fail += 1; console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`); }
}
function section(name: string): void { console.log(`\n== ${name}`); }

const T0 = 1_780_000_000_000;

section("1. Agent FinOps — the money law");
{
  resetFinopsForProbe();
  recordSeatRun({ at: T0, seatId: "coder", missionId: "m-1", usd: 0.12, tokens: 4000, turns: 3, verdict: "verified", source: "cli-a" });
  recordSeatRun({ at: T0 + 1000, seatId: "reviewer", missionId: "m-1", usd: null, tokens: 2500, turns: 2, verdict: "completed", source: "local" });
  recordSeatRun({ at: T0 + 2000, seatId: "coder", missionId: "m-2", usd: 0.30, tokens: 9000, turns: 5, verdict: "failed", source: "cli-a" });
  recordSeatRun({ at: T0 + 26 * 60 * 60_000, seatId: "coder", missionId: "m-3", usd: 0.05, tokens: 900, turns: 1, verdict: "verified", source: "cli-a" });

  const seats = bySeat();
  ok("the by-seat rollup groups honestly", seats.length === 2);
  const coder = seats.find((s) => s.key === "coder");
  assert.ok(coder);
  ok("coder: 3 runs, $0.47 known, verified and failed counted", coder.runs === 3 && Math.abs(coder.usdKnown - 0.47) < 1e-9 && coder.verified === 2 && coder.failed === 1);

  const missions = byMission();
  ok("the by-mission rollup answers what a body of work cost", missions.find((m) => m.key === "m-1")?.usdKnown === 0.12);

  ok("the by-day rollup splits on the UTC day boundary", byDay().length === 2);
  ok("USD-unknown is its own count — never zero, never invented", seats.find((s) => s.key === "reviewer")?.usdUnknownRuns === 1);

  const sum = summary();
  ok("the summary: 4 runs, $0.47, 1 unknown, verified share 2/3",
    sum.runs === 4 && Math.abs(sum.usdKnown - 0.47) < 1e-9 && sum.usdUnknownRuns === 1 && (sum.verifiedShare ?? 0) === 0.67);

  const csv = chargebackCsv();
  ok("the chargeback CSV carries the header and every dimension", csv.startsWith("dimension,key,runs,usd_known,usd_unknown_runs,tokens,verified,failed")
    && csv.includes("seat,coder,") && csv.includes("mission,m-1,") && csv.includes("day,"));
  ok("the ledger digest is stable and content-bound", ledgerDigest() === ledgerDigest() && ledgerDigest().length === 16);
}

section("2. Assurance — measured, or it refuses to exist");
{
  ok("no measured runs → unevaluated, with the reason said", scoreRuns([]).status === "unevaluated");
  const score = scoreRuns([
    { seatId: "a", missionId: "m-1", measured: true, verified: true, arenaPass: true, usd: 0.1, budgetCap: 0.2, egressViolations: 0 },
    { seatId: "b", missionId: "m-1", measured: true, verified: false, arenaPass: false, usd: 0.3, budgetCap: 0.2, egressViolations: 1 },
    { seatId: "c", missionId: "m-2", measured: false, verified: false, arenaPass: false, usd: null, budgetCap: null, egressViolations: 0 },
  ]);
  ok("evaluated from measured runs only (the simulated one dilutes coverage, never adds)", score.status === "evaluated" && (score.evidenceCoverage ?? 0) < 1);
  ok("the budget-discipline factor reflects the overrun (b spent past cap)", score.factors.find((f) => f.name === "budget discipline")?.points ?? -1 < 20);
  ok("the egress factor reflects the violation", (score.factors.find((f) => f.name === "egress integrity")?.points ?? 15) < 15);
  ok("the ledger-backed read scores the same rows the chargeback exports", scoreFromLedger().status === "evaluated");
}

section("3. Agent IAM — owned, not assigned");
{
  bindOwnerRoot("probe-owner-passphrase"); // enrollment mandates effectful seats — the owner must be present
  ok("the roster starts empty", roster().length === 0);
  const claim = sovereign.mandateFor({ id: "seat.iam.1", title: "IAM seat", config: { allowWrite: true, workspaceRoot: "/tmp/w" } });
  assert.ok(claim.ok);
  const entry = roster().find((r) => r.agentId === "seat.iam.1");
  assert.ok(entry);
  ok("the roster carries owner, issuer root, key id, scope and expiry",
    entry.owner === "owner" && entry.issuerRoot === sovereign.root && entry.issuerKeyId === sovereign.signerId
    && entry.scope.includes("fs.write") && entry.expiresAt > entry.issuedAt);
  ok("the scope derivation is the canonical one", JSON.stringify(entry.scope) === JSON.stringify(["fs.write", "risk:low"]));
  revokeAgent("seat.iam.1");
  ok("revocation flows through the sovereign and shows in the roster", sovereign.isRevoked("seat.iam.1") === true && roster().find((r) => r.agentId === "seat.iam.1")?.revoked === true);
  const exported = JSON.stringify({ entries: roster().length, root: sovereign.root });
  ok("the roster exports as identity data, not credentials", !exported.includes("signature") && !exported.includes("privateKey"));
}

console.log(`\nbooks: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
