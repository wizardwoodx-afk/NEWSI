/**
 * probe/reachGrant.test.ts — the narrowing decision for a cross-owner delegation.
 *
 * The cross-selfimpulse ladder already asks both humans before a risky delegation
 * runs, and a2aBridge already executes an accepted one and seals it. What this
 * suite pins is the decision BETWEEN those two facts: a delegation arrives
 * naming what it would like to do, and the selfimpulse returns the intersection of
 * that ask with what it will lend this counterparty at this standing — with
 * every withheld capability withheld out loud, by rule.
 *
 *   §1 standing is read from SelfImpulseMesh, never asserted by the caller
 *   §2 the lending table: what each standing actually receives
 *   §3 human-first is enforced at runtime; the irreversible set cannot be relaxed
 *   §4 approvals are capability-bound, attributable and expiring
 *   §5 nothing is silently dropped — unknown asks are refused by name
 *   §6 the grant is an artefact: deterministic digest, no secrets, filed as-is
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  DELEGATION_CAPABILITIES, CAPABILITIES_BY_STANDING, IRREVERSIBLE_CAPABILITIES, SUPERVISED_CAPABILITIES,
  REQUIRE_HUMAN_FIRST_DEFAULT, tiersFor, narrowGrant, grantAllows, refusalSummary, grantRecord, grantForPair,
  grantCanonical, type DelegationCapability, type PairStanding,
} from "../src/engine/reach/delegationGrant";
import { standingFor } from "../src/engine/meshRuntime";
import { pairKey } from "../src/engine/selfimpulseMesh";
import { pureSha256 } from "../src/engine/pureHash";

const AT = "2026-09-18T06:00:00.000Z";
const A = "selfimpulse-alpha";
const B = "selfimpulse-beta";
const refusalFor = (grant: ReturnType<typeof narrowGrant>, cap: string) => grant.refused.find((r) => r.capability === cap);

test("reach delegation grant — what a peer may do here, decided in words", async (t) => {
  await t.test("§1 standing comes from the mesh, and an unknown pair is lent nothing", () => {
    assert.equal(REQUIRE_HUMAN_FIRST_DEFAULT, true, "the shipped posture is human-first");

    const stranger = narrowGrant({ ownerA: A, ownerB: B, requested: [...DELEGATION_CAPABILITIES], standing: "unknown", at: AT });
    assert.deepEqual(stranger.granted, [], "a pair with no joint receipts receives nothing");
    assert.equal(stranger.refused.length, DELEGATION_CAPABILITIES.length);
    for (const r of stranger.refused) assert.equal(r.rule, "quarantined", `${r.capability}: ${r.rule}`);
    assert.equal(stranger.pair, pairKey(A, B), "the grant names the mesh's pair key");

    // The wired form omits `standing` from its input type on purpose: a caller
    // supplies owners, and the tier is looked up.
    const wired = grantForPair({ ownerA: A, ownerB: B, requested: ["repo.read"], at: AT });
    assert.equal(wired.tier, standingFor(A, B), "the default path reads the live mesh ledger");
    assert.equal(wired.tier, "unknown", "an empty mesh knows this pair as little as it should");
    assert.equal(grantAllows(wired, "repo.read"), false);
  });

  await t.test("§2 the lending table is monotone and stated", () => {
    const probation = narrowGrant({ ownerA: A, ownerB: B, requested: [...DELEGATION_CAPABILITIES], standing: "probation", at: AT });
    assert.deepEqual(probation.granted, ["data.aggregate", "repo.read"], "probation reads; it does not run or write");
    assert.equal(refusalFor(probation, "test.run")?.rule, "below-standing");
    assert.match(refusalFor(probation, "test.run")?.why ?? "", /lent from selfimpulseed or proven/);

    const selfimpulseed = narrowGrant({ ownerA: A, ownerB: B, requested: [...DELEGATION_CAPABILITIES], standing: "selfimpulseed", at: AT, approvals: [{ capability: "repo.write", approvalId: "appr-1", at: AT }] });
    assert.deepEqual(selfimpulseed.granted, ["data.aggregate", "egress.share", "net.fetch", "repo.read", "test.run"], "a selfimpulseed pair may test and fetch, not write");

    const proven = narrowGrant({ ownerA: A, ownerB: B, requested: ["repo.read", "repo.write"], standing: "proven", at: AT });
    assert.deepEqual(proven.granted, ["repo.read"], "even a proven pair does not write without a human in the loop");

    const ladder: PairStanding[] = ["probation", "selfimpulseed", "proven"];
    for (const cap of DELEGATION_CAPABILITIES) {
      const lends = (s: PairStanding) => CAPABILITIES_BY_STANDING[s].includes(cap);
      assert.equal(lends("unknown"), false, `${cap} is lent to a stranger`);
      // Monotone upward: earning a tier never takes a capability away.
      ladder.forEach((tier, i) => {
        if (!lends(tier)) return;
        for (const higher of ladder.slice(i + 1)) {
          assert.equal(lends(higher), true, `${cap} is lent at ${tier} but not at ${higher} — trust must never narrow`);
        }
      });
    }
    assert.deepEqual(tiersFor("secrets.read"), ["proven"], "secrets are a proven-only capability");
    assert.deepEqual(tiersFor("repo.read"), ["probation", "selfimpulseed", "proven"]);
  });

  await t.test("§3 human-first holds at runtime, and the irreversible set cannot be relaxed", () => {
    const bare = narrowGrant({ ownerA: A, ownerB: B, requested: ["repo.write", "shell.exec", "spend.commit"], standing: "proven", at: AT });
    assert.deepEqual(bare.granted, []);
    for (const cap of SUPERVISED_CAPABILITIES) assert.equal(refusalFor(bare, cap)?.rule, "human-first");

    const withApprovals = narrowGrant({
      ownerA: A, ownerB: B, requested: ["repo.write", "shell.exec", "spend.commit"], standing: "proven", at: AT,
      approvals: [
        { capability: "repo.write", approvalId: "appr-w", at: AT },
        { capability: "shell.exec", approvalId: "appr-x", at: AT },
        { capability: "spend.commit", approvalId: "appr-s", at: AT },
      ],
    });
    assert.deepEqual(withApprovals.granted, ["repo.write", "shell.exec", "spend.commit"], "named approvals do grant the supervised three");

    // An operator may relax the supervised three. Nobody may relax these two.
    const relaxed = narrowGrant({
      ownerA: A, ownerB: B, requested: ["repo.write", "deploy.release", "secrets.read"], standing: "proven", at: AT,
      requireHumanFirst: false,
    });
    assert.deepEqual(relaxed.granted, ["repo.write"], "the operator lever moves the recoverable capability only");
    for (const cap of IRREVERSIBLE_CAPABILITIES) {
      assert.equal(refusalFor(relaxed, cap)?.rule, "human-first", `${cap} must stay human-first at every setting`);
    }
  });

  await t.test("§4 an approval is capability-bound, attributable and expiring", () => {
    const wrongCapability = narrowGrant({
      ownerA: A, ownerB: B, requested: ["repo.write"], standing: "proven", at: AT,
      approvals: [{ capability: "shell.exec", approvalId: "appr-x", at: AT }],
    });
    assert.equal(wrongCapability.granted.length, 0, "a blanket or adjacent approval authorises nothing");

    const expired = narrowGrant({
      ownerA: A, ownerB: B, requested: ["repo.write"], standing: "proven", at: AT,
      approvals: [{ capability: "repo.write", approvalId: "appr-w", at: "2026-09-01T00:00:00.000Z", expiresAt: "2026-09-10T00:00:00.000Z" }],
    });
    assert.equal(refusalFor(expired, "repo.write")?.rule, "approval-expired");
    assert.match(refusalFor(expired, "repo.write")?.why ?? "", /expired at 2026-09-10/);

    const anonymous = narrowGrant({
      ownerA: A, ownerB: B, requested: ["repo.write"], standing: "proven", at: AT,
      approvals: [{ capability: "repo.write", approvalId: "   ", at: AT }],
    });
    assert.equal(refusalFor(anonymous, "repo.write")?.rule, "human-first");
    assert.match(refusalFor(anonymous, "repo.write")?.why ?? "", /not an approval/);

    const live = narrowGrant({
      ownerA: A, ownerB: B, requested: ["repo.write"], standing: "proven", at: AT,
      approvals: [{ capability: "repo.write", approvalId: "appr-w", at: AT, expiresAt: "2026-09-19T00:00:00.000Z" }],
    });
    assert.equal(grantAllows(live, "repo.write"), true, "a live approval at the moment of the grant does grant");
  });

  await t.test("§5 nothing is silently dropped — unknown asks are refused by name", () => {
    const grant = narrowGrant({
      ownerA: A, ownerB: B, at: AT, standing: "selfimpulseed",
      requested: ["repo.read", "repo.read", "root.everything", "REPO.READ", "  test.run  "],
    });
    assert.deepEqual(grant.granted, ["repo.read", "test.run"], "duplicates collapse; surrounding space is trimmed");
    assert.equal(grant.refused.length, 2, "the unknown ask and the mis-cased ask are both answered");
    assert.equal(refusalFor(grant, "root.everything")?.rule, "not-a-capability");
    assert.equal(refusalFor(grant, "REPO.READ")?.rule, "not-a-capability", "capability names are exact — no fuzzy matching near a permission");
    assert.match(refusalFor(grant, "root.everything")?.why ?? "", /not withheld — it is unknown/);
    assert.equal(refusalSummary(grant).length, 2);
    for (const line of refusalSummary(grant)) assert.match(line, /withheld \(/);
  });

  await t.test("§6 the grant is an artefact: deterministic, complete and secret-free", () => {
    const input = { ownerA: A, ownerB: B, requested: ["repo.read", "repo.write"], standing: "proven" as PairStanding, at: AT, approvals: [{ capability: "repo.write", approvalId: "appr-w", at: AT }] };
    const g1 = narrowGrant(input);
    const g2 = narrowGrant(input);
    assert.equal(g1.digest, g2.digest, "same decision, same digest");
    const { digest, ...body } = g1;
    assert.equal(digest, pureSha256(`vh.reach.delegationGrant.v1:${grantCanonical(body)}`));

    const moved = narrowGrant({ ...input, standing: "selfimpulseed" });
    assert.notEqual(moved.digest, g1.digest, "a different tier is a different decision, and digests differently");
    assert.equal(grantAllows(moved, "repo.write"), false);

    const filed = grantRecord(g1);
    assert.deepEqual(Object.keys(filed).sort(), ["digest", "granted", "humanFirst", "pair", "refused", "tier"]);
    assert.equal(JSON.stringify(filed).includes("appr-w"), false, "the filed grant carries the decision, not the approval id");
    assert.equal(filed.humanFirst, true);
  });
});
