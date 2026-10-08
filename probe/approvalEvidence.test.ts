/**
 * probe/approvalEvidence.test.ts — content-bound gate approvals, the lift from
 * `open-multi-agent`'s durable approvals (MIT).
 *
 * The property under test is narrow and it is the whole point: a gate approval
 * must hash EXACTLY what the human was shown, so a later dispute can prove WHAT
 * was approved, not merely THAT something was. Everything else in SelfImpulse's
 * receipt spine proves that a decision was signed; this proves that the thing
 * that ran is the thing that was reviewed.
 *
 * The load-bearing assertions are therefore the hostile ones, mirroring
 * decisionReceipt's posture:
 *   - the same payload hashes the same, across key insertion orders and across
 *     the pure SHA-256 vs node:crypto (determinism is the entire value);
 *   - one changed character in what was shown moves the digest;
 *   - a decision recorded against digest A cannot verify an execution of B;
 *   - the signed chain verifies offline, and reordering / editing any earlier
 *     approval breaks every link after it;
 *   - the ledger refuses a stale decision and refuses a second decision — the
 *     resume-proof + one-decision-wins that durable.ts's DoneLedger already
 *     promises for actions, extended to approvals.
 * Nothing here grants authority; the probe asserts the evidence layer can never
 * flip a decision, only describe one.
 */
const memStore = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => (memStore.has(k) ? memStore.get(k)! : null),
  setItem: (k: string, v: string) => void memStore.set(k, String(v)),
  removeItem: (k: string) => void memStore.delete(k),
  clear: () => memStore.clear(),
  key: (i: number) => [...memStore.keys()][i] ?? null,
  get length() {
    return memStore.size;
  },
} as Storage;

import { createHash } from "node:crypto";
import {
  canonicalGateDigest,
  recordGateApproval,
  sealGateApprovalReceipt,
  verifyGateApproval,
  verifyGateApprovalReceipt,
  verifyApprovalChain,
  gateApprovalReceiptEvent,
  ApprovalEvidenceLedger,
  GATE_EVIDENCE_PREDICATE,
  APPROVAL_GENESIS,
  type GateApprovalRecord,
} from "../src/security/approvalEvidence";
import { stableStringify } from "../src/security/actionGraph";
import type { GateAsk, GateDecision } from "../src/engine/types";
import { buildChainedReceipt, verifyProofReceipt } from "../src/mission/receipts";

let passed = 0;
let failed = 0;
const failures: string[] = [];
function ok(label: string, cond: boolean, detail = ""): void {
  if (cond) {
    passed += 1;
    console.log(`  ok   ${label}`);
  } else {
    failed += 1;
    failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`);
  }
}
function section(name: string): void {
  console.log(`\n== ${name}`);
}

/** One realistic gate ask — exactly the payload a human reads before clicking. */
const ASK: GateAsk = {
  action: 'Captain routed "ship the Q3 invoice batch to QuickBooks" to Ops Deployer, Bookkeeper',
  riskTier: "risky",
  specialistIds: ["ops.deploy-gate", "fin.bookkeeper"],
  summary: "writes 41 external records; irreversible send; $0 cost; expected: 41 invoices posted",
};
const APPROVED: GateDecision = { approved: true };
const DENIED: GateDecision = { approved: false, reason: "irreversible send, declined by the owner" };

async function main(): Promise<void> {
  /* ── 1. determinism: identical payload → identical digest ─────────────── */
  section("1 · identical payload → identical digest (the whole value)");
  const d1 = canonicalGateDigest(ASK);
  const d2 = canonicalGateDigest(ASK);
  ok("same payload hashes identically across calls", d1 === d2, `${d1} vs ${d2}`);

  // Key insertion order must NOT move the digest: two objects with the same
  // fields inserted in a different order are the SAME payload to a human.
  const reordered: GateAsk = {
    summary: ASK.summary,
    specialistIds: ASK.specialistIds,
    riskTier: ASK.riskTier,
    action: ASK.action,
  };
  ok("reordering the object keys does not change the digest", canonicalGateDigest(reordered) === d1);

  // The digest must equal node:crypto over the documented canonical string —
  // pinning BOTH the canonical form and pure-SHA-256 == builtin (cross-platform).
  const expectedNode = createHash("sha256")
    .update(`${GATE_EVIDENCE_PREDICATE}\ngate-ask/1\n${stableStringify(ASK)}`)
    .digest("hex");
  ok("pure digest is byte-identical to node:crypto over the canonical form", d1 === expectedNode, `${d1} vs ${expectedNode}`);

  // Array order IS semantic (routing order is a decision) — so it must change.
  const swapped: GateAsk = { ...ASK, specialistIds: [ASK.specialistIds[1], ASK.specialistIds[0]] };
  ok("reordering specialistIds DOES change the digest (order is semantic)", canonicalGateDigest(swapped) !== d1);

  /* ── 2. drift: one character in what was shown → different digest ─────── */
  section("2 · a single character change → a different digest");
  const oneChar: GateAsk = { ...ASK, summary: ASK.summary.replace("41 external records", "4 external records") };
  ok("dropping one digit from the shown summary moves the digest", canonicalGateDigest(oneChar) !== d1);
  const oneSpace: GateAsk = { ...ASK, action: ASK.action };
  oneSpace.action = ASK.action.replace("Q3 invoice", "Q3  invoice"); // double space, human-invisible
  ok("a single invisible space in the shown action moves the digest", canonicalGateDigest(oneSpace) !== d1);

  /* ── 3. a decision against digest A cannot verify execution of B ──────── */
  section("3 · a decision recorded against digest A cannot verify payload B");
  const rec = recordGateApproval(ASK, APPROVED, { decidedBy: "owner@native-dialog", decidedAt: "2026-10-05T12:00:00.000Z" });
  ok("the record stores the shown ask AND its digest", rec.askDigest === d1 && rec.ask.action === ASK.action);
  ok("execution of the SAME payload verifies (approved)", verifyGateApproval(rec, ASK).ok === true);
  const driftVerdict = verifyGateApproval(rec, oneChar);
  ok("execution of a DRIFTED payload FAILS", driftVerdict.ok === false);
  ok("the drift failure says it is a drift and names both digests",
    driftVerdict.ok === false && /DRIFT/.test(driftVerdict.reason), driftVerdict.ok === false ? driftVerdict.reason : "");
  // A refusal is still an approval record — it binds what was shown too.
  const deniedRec = recordGateApproval(oneChar, DENIED, { decidedBy: "owner@native-dialog", decidedAt: "2026-10-05T12:01:00.000Z" });
  const deniedV = verifyGateApproval(deniedRec, oneChar);
  ok("a denied decision verifies against the payload it denied, and reports approved=false",
    deniedV.ok === true && deniedV.approved === false);
  // Self-integrity: edit the retained ask after the fact and the record fails.
  const tampered: GateApprovalRecord = { ...rec, ask: { ...rec.ask, riskTier: "safe" } };
  const selfVerdict = verifyGateApproval(tampered, tampered.ask);
  ok("a record whose retained payload was edited no longer matches its own digest",
    selfVerdict.ok === false && /tampered/.test(selfVerdict.reason), selfVerdict.ok === false ? selfVerdict.reason : "");

  /* ── 4. the signed chain verifies offline; editing breaks it ──────────── */
  section("4 · the chain verifies offline, and a later edit breaks it");
  const rcA = await sealGateApprovalReceipt(rec, APPROVAL_GENESIS);
  const rcB = await sealGateApprovalReceipt(deniedRec, rcA.digest);
  const offlineA = await verifyGateApprovalReceipt(rcA);
  ok("a single receipt verifies offline with only its bytes (digest re-derives)", offlineA.ok === true, offlineA.ok === false ? offlineA.reason : "");
  ok("this runtime can issue an Ed25519 issuer signature over the approval", rcA.signature !== null && rcA.issuer !== null);
  const chain = await verifyApprovalChain([rcA, rcB]);
  ok("the two-approval chain verifies offline (prev links + signatures)", chain.ok === true, chain.ok === false ? `#${String(chain.index)}: ${chain.reason}` : "");

  // Edit an EARLIER approval's record → its digest moves → its own sig check and
  // the later receipt's `prev` both fail. Reorder the chain → prev mismatch.
  const editedA: typeof rcA = { ...rcA, record: { ...rcA.record, ask: { ...rcA.record.ask, summary: "quietly widened" } } };
  const brokenEdit = await verifyApprovalChain([editedA, rcB]);
  ok("editing an earlier approval breaks the chain", brokenEdit.ok === false, brokenEdit.ok === true ? "it passed!" : "");
  const brokenOrder = await verifyApprovalChain([rcB, rcA]);
  ok("reordering the chain breaks the prev linkage", brokenOrder.ok === false, brokenOrder.ok === true ? "it passed!" : "");

  /* ── 5. the ledger: resume-proof + one-decision-wins (built on durable.ts) */
  section("5 · the ledger refuses a stale decision and a second decision");
  const ledger = new ApprovalEvidenceLedger(new Map<string, string>());
  const { askDigest } = ledger.present(ASK, "2026-10-05T12:00:00.000Z");
  ok("present() stashes the shown payload under its digest", askDigest === d1);
  ok("the pending ask still matches the same state", ledger.matchesPending(askDigest, ASK).ok === true);
  ok("the pending ask REFUSES to match a drifted state (stale decision)",
    ledger.matchesPending(askDigest, oneChar).ok === false);
  const committed = await ledger.commit(rec);
  ok("commit() of a matching pending decision yields a receipt", "digest" in committed && (committed as { digest: string }).digest.length === 64);
  const double = await ledger.commit(rec);
  ok("a SECOND decision on the same ask is refused (one decision wins)", "refused" in double, JSON.stringify(double));
  const orphan = await ledger.commit(recordGateApproval(oneChar, APPROVED, { decidedBy: "x", decidedAt: "2026-10-05T12:02:00.000Z" }));
  ok("committing an ask that was never presented is refused", "refused" in orphan);
  const listed = ledger.list();
  ok("the ledger lists exactly the one committed approval", listed.length === 1 && listed[0].record.askDigest === d1);
  const chainFromLedger = await verifyApprovalChain(listed);
  ok("the ledger's own chain verifies offline", chainFromLedger.ok === true, chainFromLedger.ok === false ? chainFromLedger.reason : "");

  /* ── 6. the approval rides INSIDE the run's proof-receipt chain ───────── */
  section("6 · the approval event binds into the mission receipt chain");
  const ev = gateApprovalReceiptEvent(rcA, 0);
  ok("the approval emits a chain event carrying the ask digest",
    ev.kind === "gate.approval" && ev.data.askDigest === d1 && ev.data.approved === true);
  const missionRc = await buildChainedReceipt({
    mission: "m-q3-invoices", teamId: "t-ops", startedAt: "2026-10-05T12:00:00.000Z",
    finishedAt: "2026-10-05T12:05:00.000Z", mjVersion: "1.9.1", edition: "pro",
    events: [{ kind: "gate.approval", seatId: ev.seatId, data: ev.data }],
  });
  const missionVerdict = await verifyProofReceipt(missionRc);
  ok("the mission receipt that contains the approval verifies offline", missionVerdict.ok === true, missionVerdict.ok === false ? missionVerdict.reason : "");
  // Prove the approval is genuinely INSIDE the signed chain, not beside it:
  // flip the recorded approval digest in the event data and the chain must fail.
  const tamperedEvents = JSON.parse(JSON.stringify(missionRc)) as typeof missionRc;
  for (const e of tamperedEvents.events) {
    if (e.kind === "gate.approval") (e.data as { askDigest: string }).askDigest = "f".repeat(64);
  }
  const tamperedMission = await verifyProofReceipt(tamperedEvents);
  ok("editing the approval digest inside the mission chain breaks verification", tamperedMission.ok === false, tamperedMission.ok === true ? "it passed!" : "");

  console.log(`\n========================================`);
  console.log(`APPROVAL EVIDENCE PROBE SUMMARY: ${passed} passed, ${failed} failed.`);
  console.log(`========================================`);
  if (failed > 0) {
    console.log("\nFailures:");
    for (const f of failures) console.log(`  - ${f}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("approvalEvidence probe crashed:", err);
  process.exit(1);
});
