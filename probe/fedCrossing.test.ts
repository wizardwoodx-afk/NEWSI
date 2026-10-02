/**
 * probe/fedCrossing.test.ts — a cross-owner crossing both owner keys approved.
 *
 * THE REGRESSION PIN THIS SUITE EXISTS FOR. The alpha decided the responder's
 * first crossing from ledger history — `hasCrossedBefore(pair)`, made true by a
 * prior `success` row — which let a RECORD stand in for a DECISION.
 *
 * Terminology, kept precise throughout this file: each side's approval is signed
 * by that selfimpulse's OWNER AUTHORITY KEY and names the human it acts on behalf of.
 * The suite pins both halves — see §8b for what an approval proves, and what it
 * does not. §2 below
 * inserts exactly that row, presents exactly no approval, and requires the
 * crossing to be REFUSED, naming the missing human rather than the missing
 * history.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  CROSSING_FORMAT, DEFAULT_ENVELOPE_TTL_MS, openCrossing, verifyEnvelope, crossFederation, decideCrossing,
  type CrossingEnvelope,
} from "../src/engine/federation/bridge";
import { memoryApprovalLedger, APPROVAL_ATTESTATION, APPROVAL_NOT_ATTESTED } from "../src/engine/federation/approval";
import { keyHandle } from "../src/engine/federation/identity";
import { generateOwnerKeysWeb } from "../src/engine/authorityWeb";
import { pairKey } from "../src/engine/selfimpulseMesh";
import { pureSha256 } from "../src/engine/pureHash";
import type { PairStanding } from "../src/engine/reach/delegationGrant";
import {
  STANDING_FORMAT, OUT_OF_SCOPE_ESCALATE, STANDING_ATTESTATION, STANDING_NOT_ATTESTED,
  issueStandingGrant, verifyStandingGrant, authoriseUnderGrant, freshGrantUsage,
  revokeStandingGrant, standingAcknowledgement, standingDigest, standingNotice, type StandingGrantBody,
} from "../src/engine/federation/standing";
import {
  compareRoots, ledgerRoot, pairLedgerView, ledgerRowSentence, mirrorAttestation, mirrorVerifies,
  LEDGER_ATTESTATION, type PairLedgerEntry,
} from "../src/engine/federation/ledger";

const AT = 1_760_000_000_000;
const A = "selfimpulse-alpha";
const B = "selfimpulse-beta";
const proven = () => "proven" as PairStanding;
/** Deterministic ids for the probe only; the shipped default is CSPRNG. */
const seq = (() => { let n = 0; return () => `id-${(n += 1).toString(36)}-9f2c1d4e6a8b0c3d`; })();

async function envelope(capability: Parameters<typeof openCrossing>[0]["capability"], over: Partial<Parameters<typeof openCrossing>[0]> = {}): Promise<CrossingEnvelope> {
  const res = await openCrossing({ ownerA: A, ownerB: B, task: "harden the authorization guard", capability, at: AT, ...over }, { entropy: seq, now: () => AT });
  if (!res.ok) throw new Error(`openCrossing refused: ${res.detail}`);
  return res.envelope;
}

test("federated crossing — both owner keys approve, or nothing crosses", async (t) => {
  const ka = await generateOwnerKeysWeb();
  const kb = await generateOwnerKeysWeb();

  await t.test("§1 the envelope binds both sides and re-derives its own digest", async () => {
    const env = await envelope("repo.read");
    assert.equal(env.format, CROSSING_FORMAT);
    assert.equal(env.pair, pairKey(A, B));
    assert.notEqual(env.nonceInitiator, env.nonceResponder, "each side gets its own nonce");
    assert.equal(verifyEnvelope(env).ok, true);

    const tampered: CrossingEnvelope = { ...env, capability: "secrets.read" };
    const verdict = verifyEnvelope(tampered);
    assert.equal(verdict.ok, false, "changing the capability changes the envelope");
    if (!verdict.ok) assert.equal(verdict.reason, "envelope-tampered");

    const sameOwner = await openCrossing({ ownerA: A, ownerB: A, task: "x", capability: "repo.read", at: AT }, { entropy: seq, now: () => AT });
    assert.equal(sameOwner.ok, false, "one owner is not a crossing");
  });

  await t.test("§2 HISTORY IS NOT PERMISSION — a prior success row does not stand in for an approval", async () => {
    const env = await envelope("repo.write");
    const initiator = await decideCrossing(env, "initiator", "priya", ka, { entropy: seq, now: () => AT });
    if (!initiator.ok) throw new Error("initiator decision failed");

    /* The exact shape the alpha trusted: a ledger row saying a person at the
       other selfimpulse walked this pair through once already. Here it is nothing —
       the responder brings no approval of its own. */
    const priorSuccess = [{ kind: "success", pair: pairKey(A, B), note: "a person at selfimpulse-beta walked this pair through once already" }];
    assert.equal(priorSuccess.length, 1, "the historical record is present and is ignored");

    const outcome = await crossFederation(
      {
        envelope: env, initiator: A, responder: B,
        initiatorPublicKeyPem: ka.publicKeyPem, responderPublicKeyPem: kb.publicKeyPem,
        initiatorApproval: initiator.approval, responderApproval: null,
      },
      { standing: proven, ledger: memoryApprovalLedger(), now: () => AT + 1_000 },
    );
    assert.equal(outcome.status, "refused");
    assert.equal(outcome.reason, "responder-human-first");
    assert.match(outcome.detail, /its owner must approve it by name/);
    assert.match(outcome.detail, /record, not a decision/);
    assert.deepEqual(outcome.approvals, [], "nothing is filed for a crossing that did not happen");
  });

  await t.test("§3 both decisions together, and only then, produce a crossing", async () => {
    const env = await envelope("repo.write");
    const ia = await decideCrossing(env, "initiator", "priya", ka, { entropy: seq, now: () => AT });
    const rb = await decideCrossing(env, "responder", "ana", kb, { entropy: seq, now: () => AT });
    if (!ia.ok || !rb.ok) throw new Error("decisions failed");

    const ledger = memoryApprovalLedger();
    const outcome = await crossFederation(
      {
        envelope: env, initiator: A, responder: B,
        initiatorPublicKeyPem: ka.publicKeyPem, responderPublicKeyPem: kb.publicKeyPem,
        initiatorApproval: ia.approval, responderApproval: rb.approval,
      },
      { standing: proven, ledger, now: () => AT + 1_000 },
    );
    assert.equal(outcome.status, "crossed", `${outcome.reason}: ${outcome.detail}`);
    assert.equal(outcome.approvals.length, 2, "both decisions are filed with the run");
    assert.deepEqual(outcome.approvals.map((a) => a.human).sort(), ["ana", "priya"]);
    assert.equal(outcome.approvals.every((a) => a.digest.length === 64), true);
    assert.equal(outcome.digest.length, 64);
    assert.equal(outcome.envelopeDigest, env.digest);
    assert.equal(ledger.size, 2, "both decisions are spent");

    const replay = await crossFederation(
      {
        envelope: env, initiator: A, responder: B,
        initiatorPublicKeyPem: ka.publicKeyPem, responderPublicKeyPem: kb.publicKeyPem,
        initiatorApproval: ia.approval, responderApproval: rb.approval,
      },
      { standing: proven, ledger, now: () => AT + 2_000 },
    );
    assert.equal(replay.status, "refused", "the same two decisions cannot authorise a second crossing");
    assert.equal(replay.reason, "initiator-approval-invalid");
  });

  await t.test("§4 one side's decision never covers the other side", async () => {
    const env = await envelope("shell.exec");
    const ia = await decideCrossing(env, "initiator", "priya", ka, { entropy: seq, now: () => AT });
    if (!ia.ok) throw new Error("decision failed");

    /* The responder is handed the INITIATOR's approval — a real, valid
       signature, for the same envelope, on the wrong side. */
    const crossed = await crossFederation(
      {
        envelope: env, initiator: A, responder: B,
        initiatorPublicKeyPem: ka.publicKeyPem, responderPublicKeyPem: kb.publicKeyPem,
        initiatorApproval: ia.approval, responderApproval: ia.approval,
      },
      { standing: proven, ledger: memoryApprovalLedger(), now: () => AT + 1_000 },
    );
    assert.equal(crossed.status, "refused");
    assert.equal(crossed.reason, "responder-approval-invalid");
    assert.match(crossed.detail, /wrong-side/);
  });

  await t.test("§5 standing is read, never asserted — a stranger's approval changes nothing", async () => {
    const env = await envelope("repo.read");
    const ia = await decideCrossing(env, "initiator", "priya", ka, { entropy: seq, now: () => AT });
    const rb = await decideCrossing(env, "responder", "ana", kb, { entropy: seq, now: () => AT });
    if (!ia.ok || !rb.ok) throw new Error("decisions failed");

    const stranger = await crossFederation(
      {
        envelope: env, initiator: A, responder: B,
        initiatorPublicKeyPem: ka.publicKeyPem, responderPublicKeyPem: kb.publicKeyPem,
        initiatorApproval: ia.approval, responderApproval: rb.approval,
      },
      { standing: () => "unknown", ledger: memoryApprovalLedger(), now: () => AT + 1_000 },
    );
    assert.equal(stranger.status, "refused");
    assert.equal(stranger.reason, "initiator-below-standing");
    assert.match(stranger.detail, /no joint receipts/);
  });

  await t.test("§6 the default standing reader is the live mesh ledger", async () => {
    const env = await envelope("repo.read");
    const ia = await decideCrossing(env, "initiator", "priya", ka, { entropy: seq, now: () => AT });
    const rb = await decideCrossing(env, "responder", "ana", kb, { entropy: seq, now: () => AT });
    if (!ia.ok || !rb.ok) throw new Error("decisions failed");

    /* No standing injected: the module must consult SelfImpulseMesh, which on a
       fresh machine knows this pair not at all. */
    const outcome = await crossFederation(
      {
        envelope: env, initiator: A, responder: B,
        initiatorPublicKeyPem: ka.publicKeyPem, responderPublicKeyPem: kb.publicKeyPem,
        initiatorApproval: ia.approval, responderApproval: rb.approval,
      },
      { ledger: memoryApprovalLedger(), now: () => AT + 1_000 },
    );
    assert.equal(outcome.status, "refused");
    assert.equal(outcome.tierInitiator, "unknown");
    assert.equal(outcome.tierResponder, "unknown");
    assert.equal(outcome.reason, "initiator-below-standing");
  });

  await t.test("§7 an expired envelope decides nothing, however good the approvals", async () => {
    const env = await envelope("repo.read", { at: AT, expiresAt: AT + 5_000 });
    const ia = await decideCrossing(env, "initiator", "priya", ka, { entropy: seq, now: () => AT, ttlMs: 60_000 });
    const rb = await decideCrossing(env, "responder", "ana", kb, { entropy: seq, now: () => AT, ttlMs: 60_000 });
    if (!ia.ok || !rb.ok) throw new Error("decisions failed");

    const late = await crossFederation(
      {
        envelope: env, initiator: A, responder: B,
        initiatorPublicKeyPem: ka.publicKeyPem, responderPublicKeyPem: kb.publicKeyPem,
        initiatorApproval: ia.approval, responderApproval: rb.approval,
      },
      { standing: proven, ledger: memoryApprovalLedger(), now: () => AT + 5_001 },
    );
    assert.equal(late.status, "refused");
    assert.equal(late.reason, "envelope-expired");

    const fresh = await crossFederation(
      {
        envelope: env, initiator: A, responder: B,
        initiatorPublicKeyPem: ka.publicKeyPem, responderPublicKeyPem: kb.publicKeyPem,
        initiatorApproval: ia.approval, responderApproval: rb.approval,
      },
      { standing: proven, ledger: memoryApprovalLedger(), now: () => AT + 1 },
    );
    assert.equal(fresh.status, "crossed", `${fresh.reason}: ${fresh.detail}`);
    assert.equal(DEFAULT_ENVELOPE_TTL_MS > 5_000, true, "the default window is wider than this test's");
  });

  await t.test("§8b WHAT THE APPROVALS PROVE — stated, not left to inference", async () => {
    const env = await envelope("repo.write");
    const ia = await decideCrossing(env, "initiator", "priya", ka, { entropy: seq, now: () => AT });
    const rb = await decideCrossing(env, "responder", "ana", kb, { entropy: seq, now: () => AT });
    if (!ia.ok || !rb.ok) throw new Error("decisions failed");
    const outcome = await crossFederation(
      {
        envelope: env, initiator: A, responder: B,
        initiatorPublicKeyPem: ka.publicKeyPem, responderPublicKeyPem: kb.publicKeyPem,
        initiatorApproval: ia.approval, responderApproval: rb.approval,
      },
      { standing: proven, ledger: memoryApprovalLedger(), now: () => AT + 1_000 },
    );
    assert.equal(outcome.status, "crossed", `${outcome.reason}: ${outcome.detail}`);

    /* The success line names the KEY as the approver and the human as the party
       authorised — it does not say "a human signed". */
    assert.match(outcome.detail, /owner key of each selfimpulse approved it, naming who authorised it/);
    assert.equal(/both humans (decided|signed)/.test(outcome.detail), false, "no surface may say a human signed it");

    assert.equal(outcome.attestation.attests, APPROVAL_ATTESTATION);
    assert.equal(outcome.attestation.notAttested, APPROVAL_NOT_ATTESTED);
    assert.match(outcome.attestation.attests, /authority key approved/);
    assert.match(outcome.attestation.notAttested, /distinct from the owner key/);

    for (const rec of outcome.approvals) {
      assert.equal(rec.signedBy, "owner-authority-key", "the record names what actually signed");
      assert.equal(rec.attests, APPROVAL_ATTESTATION);
      assert.equal(rec.notAttested, APPROVAL_NOT_ATTESTED, "the limit travels with the claim");
      assert.match(rec.ownerKeyHandle ?? "", /^[0-9A-F]{4}(-[0-9A-F]{4}){3}$/, "the receipt names WHICH key signed");
      assert.ok(["priya", "ana"].includes(rec.human));
    }
    const handles = new Set(outcome.approvals.map((r) => r.ownerKeyHandle));
    assert.equal(handles.size, 2, "two different owner keys signed the two sides");
    assert.equal(handles.has(keyHandle(ka.publicKeyPem)) && handles.has(keyHandle(kb.publicKeyPem)), true,
      "…and the handles are the handles of the keys in the envelope");

    /* The attestation is INSIDE the digest: a receipt cannot be re-worded. */
    const body = { ...outcome } as Record<string, unknown>;
    delete body.digest;
    assert.equal(outcome.digest, pureSha256(`vh.fed.outcome.v1:${JSON.stringify(body)}`));
  });

  await t.test("§9 TWO LOCAL STORES — distributed evidence, local trust, in the runtime", async () => {
    /* The reviewer's P1: one `standing` reader for both sides cannot express
       two selfimpulses whose local trust states disagree. Each side now reads its
       OWN store, and the outcome records which store answered. */
    const env = await envelope("repo.write");
    const ia = await decideCrossing(env, "initiator", "priya", ka, { entropy: seq, now: () => AT });
    const rb = await decideCrossing(env, "responder", "ana", kb, { entropy: seq, now: () => AT });
    if (!ia.ok || !rb.ok) throw new Error("decisions failed");
    const parts = {
      envelope: env, initiator: A, responder: B,
      initiatorPublicKeyPem: ka.publicKeyPem, responderPublicKeyPem: kb.publicKeyPem,
      initiatorApproval: ia.approval, responderApproval: rb.approval,
    };
    const calls: string[] = [];
    const initiatorStore = (a: string, b: string) => { calls.push(`initiator:${a}->${b}`); return "proven" as PairStanding; };
    const responderStore = (a: string, b: string) => { calls.push(`responder:${a}->${b}`); return "proven" as PairStanding; };

    const crossed = await crossFederation(parts, {
      standingInitiator: initiatorStore, standingResponder: responderStore,
      stores: { initiator: "reykjavik", responder: "lisbon" },
      ledger: memoryApprovalLedger(), now: () => AT + 1_000,
    });
    assert.equal(crossed.status, "crossed", `${crossed.reason}: ${crossed.detail}`);
    assert.equal(crossed.standingSource.shared, false, "two stores were read");
    assert.equal(crossed.standingSource.initiator, "reykjavik");
    assert.equal(crossed.standingSource.responder, "lisbon");
    assert.deepEqual([...new Set(calls.map((c) => c.split(":")[0]))].sort(), ["initiator", "responder"],
      "each side's own store was consulted");
    assert.equal(calls.every((c) => c.includes(`${A}->${B}`) || c.includes(`${B}->${A}`)), true,
      "each store was asked about THIS pair");

    /* The divergence itself: the two stores disagree about the same pair.
       The crossing must fail on the side whose OWN store said no — and the
       refusal must name that store rather than blaming the pair. */
    const splitEnv = await envelope("repo.write", { at: AT + 100_000 });
    const ia2 = await decideCrossing(splitEnv, "initiator", "priya", ka, { entropy: seq, now: () => AT });
    const rb2 = await decideCrossing(splitEnv, "responder", "ana", kb, { entropy: seq, now: () => AT });
    if (!ia2.ok || !rb2.ok) throw new Error("decisions failed");
    const splitParts = { ...parts, envelope: splitEnv, initiatorApproval: ia2.approval, responderApproval: rb2.approval };

    const responderSaysNo = await crossFederation(splitParts, {
      standingInitiator: () => "proven",
      standingResponder: () => "probation",
      stores: { initiator: "reykjavik", responder: "lisbon" },
      ledger: memoryApprovalLedger(), now: () => AT + 100_001,
    });
    assert.equal(responderSaysNo.status, "refused");
    assert.equal(responderSaysNo.reason, "responder-below-standing");
    assert.equal(responderSaysNo.tierInitiator, "proven", "the initiator's own store selfimpulseed for the pair");
    assert.equal(responderSaysNo.tierResponder, "probation", "…and the responder's own store did not");
    assert.match(responderSaysNo.detail, /the responder's own local trust store \(lisbon\)/);
    assert.match(responderSaysNo.detail, /not the other side's \(reykjavik\)/);
    assert.match(responderSaysNo.detail, /free to disagree/);
    assert.equal(responderSaysNo.standingSource.shared, false);

    /* Mirror it: now the INITIATOR's store is the one that refuses. Same pair,
       same envelope, opposite outcome — which is only possible if the runtime
       really is reading two independent stores. */
    const initiatorSaysNo = await crossFederation(splitParts, {
      standingInitiator: () => "probation",
      standingResponder: () => "proven",
      stores: { initiator: "reykjavik", responder: "lisbon" },
      ledger: memoryApprovalLedger(), now: () => AT + 100_002,
    });
    assert.equal(initiatorSaysNo.status, "refused");
    assert.equal(initiatorSaysNo.reason, "initiator-below-standing");
    assert.match(initiatorSaysNo.detail, /the initiator's own local trust store \(reykjavik\)/);

    /* A single reader is a single store, and the receipt never pretends the
       two sides agreed independently. */
    const oneStore = await crossFederation(splitParts, {
      standing: proven, stores: { initiator: "reykjavik", responder: "reykjavik (same machine)" },
      ledger: memoryApprovalLedger(), now: () => AT + 100_003,
    });
    assert.equal(oneStore.status, "crossed", `${oneStore.reason}: ${oneStore.detail}`);
    assert.equal(oneStore.standingSource.shared, true, "one reader means one local store, stated plainly");
    assert.equal(oneStore.tierInitiator, oneStore.tierResponder, "…so both tiers come from the same observation");
  });

  await t.test("§8 the outcome digest commits to the whole decision", async () => {
    const env = await envelope("repo.read");
    const ia = await decideCrossing(env, "initiator", "priya", ka, { entropy: seq, now: () => AT });
    const rb = await decideCrossing(env, "responder", "ana", kb, { entropy: seq, now: () => AT });
    if (!ia.ok || !rb.ok) throw new Error("decisions failed");
    const parts = {
      envelope: env, initiator: A, responder: B,
      initiatorPublicKeyPem: ka.publicKeyPem, responderPublicKeyPem: kb.publicKeyPem,
      initiatorApproval: ia.approval, responderApproval: rb.approval,
    };
    const one = await crossFederation(parts, { standing: proven, ledger: memoryApprovalLedger(), now: () => AT + 1_000 });
    const two = await crossFederation(parts, { standing: proven, ledger: memoryApprovalLedger(), now: () => AT + 1_000 });
    assert.equal(one.digest, two.digest, "same decisions, same digest");
    assert.equal(one.digest.length, 64);
    assert.equal(one.digest, pureSha256(`vh.fed.outcome.v1:${JSON.stringify({
      crossingId: one.crossingId, pair: one.pair, capability: one.capability, status: one.status,
      reason: one.reason, detail: one.detail, at: one.at, envelopeDigest: one.envelopeDigest,
      tierInitiator: one.tierInitiator, tierResponder: one.tierResponder,
      standingSource: one.standingSource,
      grants: one.grants, approvals: one.approvals, attestation: one.attestation,
    })}`));
    assert.equal(one.standingSource.shared, true, "this caller read ONE local store, and the receipt says so");
  });
  await t.test("§10 APPROVE ONCE, THEN AUTONOMOUS — the human leaves the loop, the evidence does not", async () => {
    /* The ask: both owners approve ONCE, then the pair works on its own. The bound
       that makes that safe is the grant — enumerated capabilities, a budget, a rate
       window, an expiry, and escalation for anything outside it. */
    const env = await envelope("repo.read");
    const body: StandingGrantBody = {
      v: STANDING_FORMAT,
      grantId: "grant-5c1e7a934b2d4f60",
      pair: pairKey(A, B),
      capabilities: ["test.run", "repo.read"],
      initiatorHuman: "priya",
      responderHuman: "sam",
      maxCrossings: 3,
      windowMs: 60_000,
      windowMax: 2,
      issuedAt: AT,
      expiresAt: AT + 86_400_000,
      onOutOfScope: OUT_OF_SCOPE_ESCALATE,
    };
    const issued = await issueStandingGrant(body, ka, kb);
    assert.equal(issued.ok, true, JSON.stringify(issued));
    if (!issued.ok) return;
    const grant = issued.grant;
    assert.deepEqual(grant.capabilities, ["repo.read", "test.run"], "capabilities are canonicalised so both owners sign identical bytes");

    const verified = await verifyStandingGrant(grant, ka.publicKeyPem, kb.publicKeyPem, AT + 1_000);
    assert.equal(verified.ok, true, JSON.stringify(verified));

    const expect = (nonce: string, capability = "repo.read") => ({
      pair: grant.pair,
      side: "initiator" as const,
      capability,
      envelopeDigest: env.digest,
      nonce,
    });

    /* Two crossings run with NO further human decision — the point of the grant. */
    const first = authoriseUnderGrant(grant, undefined, expect(env.nonceInitiator), AT + 1_000);
    assert.equal(first.ok, true, JSON.stringify(first));
    if (!first.ok) return;
    assert.equal(first.authorisation.crossingsUsed, 1);
    assert.equal(first.authorisation.crossingsRemaining, 2);
    const second = authoriseUnderGrant(grant, first.usage, expect("nonce-2-8f1c4b7d9e0a2c5f"), AT + 2_000);
    assert.equal(second.ok, true, JSON.stringify(second));
    if (!second.ok) return;

    /* The rate bound binds inside the window — a compromised peer cannot drain the budget in a burst. */
    const burst = authoriseUnderGrant(grant, second.usage, expect("nonce-3-burst"), AT + 3_000);
    assert.equal(burst.ok, false);
    if (!burst.ok) assert.equal(burst.reason, "window-exceeded");

    /* A new window opens; the last crossing of the budget is allowed; then the budget binds. */
    const third = authoriseUnderGrant(grant, second.usage, expect("nonce-4-window2"), AT + 61_500);
    assert.equal(third.ok, true, JSON.stringify(third));
    if (!third.ok) return;
    assert.equal(third.authorisation.crossingsRemaining, 0);
    const spent = authoriseUnderGrant(grant, third.usage, expect("nonce-5-spent"), AT + 62_000);
    assert.equal(spent.ok, false);
    if (!spent.ok) {
      assert.equal(spent.reason, "grant-exhausted");
      assert.match(spent.detail, /set a new grant, which means two humans looking again/);
    }

    /* OUT OF SCOPE IS NOT A SILENT ALLOW — it goes back to a human, and says so. */
    const outOfScope = authoriseUnderGrant(grant, second.usage, expect("nonce-6-escalate", "shell.exec"), AT + 4_000);
    assert.equal(outOfScope.ok, false);
    if (!outOfScope.ok) {
      assert.equal(outOfScope.reason, "escalate");
      assert.match(outOfScope.detail, /returns to a per-crossing human decision/);
    }

    /* Revocation by ONE side, with the reason on the record. */
    const rev = revokeStandingGrant(grant, "responder", "sam", AT + 5_000, "the client withdrew consent for the shared repo");
    const afterRevoke = authoriseUnderGrant(grant, first.usage, expect("nonce-7-revoked"), AT + 6_000, [rev]);
    assert.equal(afterRevoke.ok, false);
    if (!afterRevoke.ok) {
      assert.equal(afterRevoke.reason, "revoked");
      assert.match(afterRevoke.detail, /client withdrew consent/);
    }

    /* An expired grant stops being authority, and the refusal says when. */
    const expired = await verifyStandingGrant(grant, ka.publicKeyPem, kb.publicKeyPem, AT + 86_400_001);
    assert.equal(expired.ok, false);
    if (!expired.ok) assert.equal(expired.reason, "grant-expired");

    /* WHAT AN AUTONOMOUS CROSSING PROVES — and, beside it, what it does not. */
    const ack = standingAcknowledgement(first.authorisation, { publicKeyPem: ka.publicKeyPem, handle: keyHandle(ka.publicKeyPem) });
    assert.equal(ack.attests, STANDING_ATTESTATION);
    assert.equal(ack.notAttested, STANDING_NOT_ATTESTED);
    assert.match(ack.attests, /authorised this crossing in advance/);
    assert.match(ack.notAttested, /that a human reviewed this specific crossing/);
    assert.equal(ack.grantDigest, standingDigest(grant));
    assert.equal(ack.human, "priya");
    assert.equal(ack.ownerKeyHandle, keyHandle(ka.publicKeyPem));
    assert.match(ack.digest, /^[0-9a-f]{64}$/);

    /* The refusals that keep "autonomous" from meaning "unbounded". */
    const wildcard = await issueStandingGrant({ ...body, capabilities: ["*"] }, ka, kb);
    assert.equal(wildcard.ok, false);
    if (!wildcard.ok) assert.equal(wildcard.reason, "wildcard-capability");
    const unbounded = await issueStandingGrant({ ...body, windowMax: 99 }, ka, kb);
    assert.equal(unbounded.ok, false);
    if (!unbounded.ok) assert.equal(unbounded.reason, "unbounded");
    const noHuman = await issueStandingGrant({ ...body, responderHuman: "  " }, ka, kb);
    assert.equal(noHuman.ok, false);
    if (!noHuman.ok) assert.equal(noHuman.reason, "no-human");

    /* ONE SIDE ALONE CANNOT CREATE AUTHORITY OVER A PAIR. */
    const forged = { ...grant, signatureResponder: grant.signatureInitiator };
    const forgedVerdict = await verifyStandingGrant(forged, ka.publicKeyPem, kb.publicKeyPem, AT + 1_000);
    assert.equal(forgedVerdict.ok, false);
    if (!forgedVerdict.ok) {
      assert.equal(forgedVerdict.reason, "bad-signature");
      assert.match(forgedVerdict.detail, /responder/);
    }

    /* A surface can print the state without paraphrasing it. */
    assert.match(standingNotice(grant, second.usage), /2\/3 crossings used/);
  });

  await t.test("§11 ONE COMMON PLACE TO CHECK — two independent stores, derived roots", () => {
    /* The ask: both users should be able to check from ONE place. A shared server
       would be a shared trust anchor, so the common place is a derived VIEW: each
       side keeps its own store, each derives its own root, and the roots are
       compared. Divergence is named, never averaged away. */
    const joint = (id: string, at: number, decision = "crossed"): PairLedgerEntry => ({
      crossingId: id,
      envelopeDigest: pureSha256(`env:${id}`),
      capability: "repo.read",
      decision,
      outcomeDigest: pureSha256(`outcome:${id}`),
      initiatorReceipt: pureSha256(`rec-a:${id}`),
      responderReceipt: pureSha256(`rec-b:${id}`),
      at,
    });
    const storeA = [joint("x-1", AT + 1), joint("x-2", AT + 2)];
    const storeB = [joint("x-1", AT + 1), joint("x-2", AT + 2)];

    const same = compareRoots(pairKey(A, B), { entries: storeA }, { entries: storeB }, AT + 10);
    assert.equal(same.agreed, true);
    assert.equal(same.initiatorRoot, same.responderRoot);
    assert.equal(same.attests, LEDGER_ATTESTATION);
    /* Derived, never carried: the same set in another order is the same root. */
    assert.equal(ledgerRoot([...storeA].reverse()), ledgerRoot(storeA));

    /* One side records a DIFFERENT decision → divergence, named down to the crossing. */
    const diverged = compareRoots(pairKey(A, B), { entries: storeA }, { entries: [joint("x-1", AT + 1), joint("x-2", AT + 2, "refused")] }, AT + 11);
    assert.equal(diverged.agreed, false);
    assert.equal(diverged.firstDivergence?.crossingId, "x-2");
    assert.match(diverged.firstDivergence!.detail, /same crossing, different record/);

    /* One side is MISSING a row — a different finding, with its own sentence. */
    const missing = compareRoots(pairKey(A, B), { entries: storeA }, { entries: [joint("x-1", AT + 1)] }, AT + 12);
    assert.equal(missing.agreed, false);
    assert.match(missing.firstDivergence!.detail, /holds no record of crossing x-2/);

    /* THE SHARED SCREEN: the union, in time order, disagreements visible and unmerged. */
    const view = pairLedgerView(storeA, [joint("x-1", AT + 1), joint("x-2", AT + 2, "refused"), joint("x-3", AT + 3)]);
    assert.equal(view.length, 3);
    assert.equal(view.find((r) => r.crossingId === "x-1")!.seenBy, "both");
    assert.equal(view.find((r) => r.crossingId === "x-1")!.disagrees, false);
    assert.equal(view.find((r) => r.crossingId === "x-2")!.disagrees, true, "a disagreement is flagged, never merged");
    assert.equal(view.find((r) => r.crossingId === "x-3")!.seenBy, "responder-only");
    assert.match(ledgerRowSentence(view.find((r) => r.crossingId === "x-3")!), /held only by the responder/);
    assert.match(ledgerRowSentence(view.find((r) => r.crossingId === "x-2")!), /shown unmerged/);

    /* A MIRROR CAN PROVE DIVERGENCE LATER; IT CAN NEVER ASSERT TRUTH. */
    const mirror = mirrorAttestation(same, "auditor-node-1", AT + 20);
    assert.equal(mirror.agreed, true);
    assert.match(mirror.attests, /this mirror holds the root so a later disagreement can be proved against it/);
    assert.equal(mirrorVerifies(mirror, same).ok, true);
    const later = mirrorVerifies(mirror, diverged);
    assert.equal(later.ok, false);
    if (!later.ok) assert.match(later.detail, /records changed after the mirror was written/);
  });

});
