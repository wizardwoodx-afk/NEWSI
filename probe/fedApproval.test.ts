/**
 * probe/fedApproval.test.ts — a signed, bound, single-use approval, and an
 * honest account of what its signature proves.
 *
 * THE REVIEWER'S BLOCKER, PINNED. In the 19.5.6-alpha Bridge, the responder
 * side inferred permission from a ledger row (`hasCrossedBefore(pair)` made
 * true by a prior `success` record). This suite exists so that cannot come
 * back: an approval is an ECDSA P-256 signature over a body bound to one pair,
 * one side, one capability, one envelope digest and one nonce — and every way
 * of re-aiming it is refused BY NAME.
 *
 * THE REVIEWER'S TERMINOLOGICAL FINDING, ALSO PINNED. These are OWNER-KEY
 * approvals made on behalf of a named human — not signatures by a human-held
 * credential. The suite requires that distinction to exist in the API
 * (`APPROVAL_SIGNER`, `APPROVAL_ATTESTATION`, `APPROVAL_NOT_ATTESTED`), to
 * travel with every filed record, and to hold semantically: ONE owner key can
 * approve while naming different humans, and the records keep them apart.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  APPROVAL_FORMAT, MIN_NONCE_CHARS, APPROVAL_SIGNER, APPROVAL_ATTESTATION, APPROVAL_NOT_ATTESTED,
  issueFederationApproval, verifyFederationApproval, consumeApproval, memoryApprovalLedger,
  approvalRecord, approvalDigest, approvalCanonical,
  type FederationApproval, type FederationApprovalBody,
} from "../src/engine/federation/approval";
import { keyHandle } from "../src/engine/federation/identity";
import { generateOwnerKeysWeb } from "../src/engine/authorityWeb";
import { pureSha256 } from "../src/engine/pureHash";

const PAIR = "selfimpulse-a↔selfimpulse-b";
const ENV = pureSha256("the-crossing-envelope-under-test");
const NOW = 1_760_000_000_000;

function body(over: Partial<FederationApprovalBody> = {}): FederationApprovalBody {
  return {
    v: APPROVAL_FORMAT,
    approvalId: "appr-0001",
    pair: PAIR,
    side: "responder",
    capability: "repo.write",
    envelopeDigest: ENV,
    nonce: "9f2c1d4e6a8b0c3d5e7f1021",
    human: "priya",
    decidedAt: NOW,
    expiresAt: NOW + 60_000,
    ...over,
  };
}

const EXPECT = { pair: PAIR, side: "responder" as const, capability: "repo.write", envelopeDigest: ENV, nonce: "9f2c1d4e6a8b0c3d5e7f1021" };

test("federated approval — the responder's decision is a signature, not a memory", async (t) => {
  const keys = await generateOwnerKeysWeb();
  const other = await generateOwnerKeysWeb();

  await t.test("it refuses to issue something it would have to distrust", async () => {
    const noHuman = await issueFederationApproval(body({ human: "  " }), keys);
    assert.equal(noHuman.ok, false);
    if (!noHuman.ok) assert.equal(noHuman.reason, "no-human");

    const unknownCap = await issueFederationApproval(body({ capability: "root.everything" }), keys);
    assert.equal(unknownCap.ok, false);
    if (!unknownCap.ok) assert.equal(unknownCap.reason, "unknown-capability");

    const shortNonce = await issueFederationApproval(body({ nonce: "short" }), keys);
    assert.equal(shortNonce.ok, false);
    if (!shortNonce.ok) assert.match(shortNonce.detail, new RegExp(`at least ${MIN_NONCE_CHARS}`));

    const noBinding = await issueFederationApproval(body({ envelopeDigest: "not-a-digest" }), keys);
    assert.equal(noBinding.ok, false);
    if (!noBinding.ok) assert.equal(noBinding.reason, "not-a-crossing-binding");

    const singleSelfImpulse = await issueFederationApproval(body({ pair: "selfimpulse-a" }), keys);
    assert.equal(singleSelfImpulse.ok, false);

    const backdated = await issueFederationApproval(body({ decidedAt: NOW, expiresAt: NOW - 1 }), keys);
    assert.equal(backdated.ok, false);
    if (!backdated.ok) assert.equal(backdated.reason, "expired");

    const ok = await issueFederationApproval(body(), keys);
    assert.equal(ok.ok, true);
    if (ok.ok) assert.match(ok.approval.signature, /^ecdsa-p256:/);
  });

  await t.test("a genuine approval verifies, and its filed digest is real SHA-256", async () => {
    const issued = await issueFederationApproval(body(), keys);
    if (!issued.ok) throw new Error("issue failed");
    const verdict = await verifyFederationApproval(issued.approval, EXPECT, keys.publicKeyPem, NOW + 1_000);
    assert.equal(verdict.ok, true, JSON.stringify(verdict));

    const filed = approvalRecord(issued.approval);
    assert.equal(filed.human, "priya");
    assert.equal(filed.digest, approvalDigest(issued.approval));
    assert.equal(
      filed.digest,
      pureSha256(`vh.fed.approval.v1:${approvalCanonical(issued.approval)}|${issued.approval.signature}`),
      "the decision's digest is the selfimpulse's own SHA-256 over the signed bytes",
    );
    assert.equal(filed.digest.length, 64);
    assert.equal(JSON.stringify(filed).includes("9f2c1d4e6a8b0c3d5e7f1021"), false, "the filed form carries the binding, not the nonce");
  });

  await t.test("every way of re-aiming a decision is refused by name", async () => {
    const issued = await issueFederationApproval(body(), keys);
    if (!issued.ok) throw new Error("issue failed");
    const a = issued.approval;

    const cases: Array<[string, Parameters<typeof verifyFederationApproval>[1]]> = [
      ["wrong-pair", { ...EXPECT, pair: "selfimpulse-a↔selfimpulse-c" }],
      ["wrong-side", { ...EXPECT, side: "initiator" }],
      ["wrong-capability", { ...EXPECT, capability: "shell.exec" }],
      ["wrong-envelope", { ...EXPECT, envelopeDigest: pureSha256("another-crossing") }],
      ["wrong-nonce", { ...EXPECT, nonce: "0000000000000000000000" }],
    ];
    for (const [reason, expected] of cases) {
      const verdict = await verifyFederationApproval(a, expected, keys.publicKeyPem, NOW + 1_000);
      assert.equal(verdict.ok, false, `${reason} was not refused`);
      if (!verdict.ok) assert.equal(verdict.reason, reason);
    }

    const late = await verifyFederationApproval(a, EXPECT, keys.publicKeyPem, NOW + 60_001);
    assert.equal(late.ok, false);
    if (!late.ok) assert.equal(late.reason, "expired");

    const forged: FederationApproval = { ...a, human: "someone-else" };
    const forgedVerdict = await verifyFederationApproval(forged, EXPECT, keys.publicKeyPem, NOW + 1_000);
    assert.equal(forgedVerdict.ok, false);
    if (!forgedVerdict.ok) assert.equal(forgedVerdict.reason, "bad-signature", "editing the human must break the signature");

    const alien = await verifyFederationApproval(a, EXPECT, other.publicKeyPem, NOW + 1_000);
    assert.equal(alien.ok, false, "another selfimpulse's key must not verify this decision");
    if (!alien.ok) assert.equal(alien.reason, "bad-signature");

    const absent = await verifyFederationApproval(null, EXPECT, keys.publicKeyPem, NOW + 1_000);
    assert.equal(absent.ok, false);
    if (!absent.ok) assert.match(absent.detail, /not proceed on history alone/);
  });

  await t.test("a decision is spent once — a replay is refused by id", async () => {
    const issued = await issueFederationApproval(body(), keys);
    if (!issued.ok) throw new Error("issue failed");
    const ledger = memoryApprovalLedger(8);

    const first = await consumeApproval(issued.approval, EXPECT, keys.publicKeyPem, NOW + 1_000, ledger);
    assert.equal(first.ok, true);
    assert.equal(ledger.size, 1);

    const second = await consumeApproval(issued.approval, EXPECT, keys.publicKeyPem, NOW + 1_000, ledger);
    assert.equal(second.ok, false);
    if (!second.ok) {
      assert.equal(second.reason, "replayed-approval");
      assert.match(second.detail, /appr-0001/);
      assert.match(second.detail, /already been spent/);
    }

    const unspent = await issueFederationApproval(body({ approvalId: "appr-0002" }), keys);
    if (!unspent.ok) throw new Error("issue failed");
    const rejected = await consumeApproval(unspent.approval, { ...EXPECT, capability: "shell.exec" }, keys.publicKeyPem, NOW + 1_000, ledger);
    assert.equal(rejected.ok, false);
    assert.equal(ledger.has("appr-0002"), false, "a decision that failed verification is NOT burned — the human keeps it");
  });

  await t.test("the ledger is bounded, so a long-lived selfimpulse cannot grow without limit", () => {
    const ledger = memoryApprovalLedger(4);
    for (let i = 0; i < 50; i++) ledger.add(`appr-${i}`);
    assert.equal(ledger.size, 4);
    assert.equal(ledger.has("appr-0"), false, "oldest evicted");
    assert.equal(ledger.has("appr-49"), true, "recent remembered");
  });

  await t.test("WHAT THE SIGNATURE PROVES — an owner-key approval on behalf of a named human", async () => {
    const keys = await generateOwnerKeysWeb();

    /* The vocabulary exists and says the right things. A caller cannot invent a
       stronger sentence than the one the module hands it. */
    assert.equal(APPROVAL_SIGNER, "owner-authority-key");
    assert.match(APPROVAL_ATTESTATION, /authority key approved/);
    assert.match(APPROVAL_ATTESTATION, /naming the human who authorised it/);
    assert.match(APPROVAL_NOT_ATTESTED, /distinct from the owner key/);
    assert.equal(/human (signed|authenticated)/.test(APPROVAL_ATTESTATION), false,
      "the attestation never says a human signed it");

    /* The semantic, by construction: ONE owner key approves twice, naming two
       different humans. Both approvals verify — because the key is what signs —
       and the filed records keep the two humans apart, which is exactly what
       "on behalf of" means and what "a human credential" would not allow. */
    const one = await issueFederationApproval(body({ approvalId: "same-key-1", human: "priya" }), keys);
    const two = await issueFederationApproval(body({ approvalId: "same-key-2", human: "ana" }), keys);
    if (!one.ok || !two.ok) throw new Error("issue failed");
    assert.equal((await verifyFederationApproval(one.approval, EXPECT, keys.publicKeyPem, NOW)).ok, true);
    assert.equal((await verifyFederationApproval(two.approval, EXPECT, keys.publicKeyPem, NOW)).ok, true);

    const handle = keyHandle(keys.publicKeyPem);
    const r1 = approvalRecord(one.approval, { publicKeyPem: keys.publicKeyPem, handle });
    const r2 = approvalRecord(two.approval, { publicKeyPem: keys.publicKeyPem, handle });
    assert.equal(r1.human, "priya");
    assert.equal(r2.human, "ana");
    assert.equal(r1.ownerKeyHandle, r2.ownerKeyHandle, "one key signed both");
    assert.equal(r1.signedBy, APPROVAL_SIGNER, "and the record says what signed");
    assert.equal(r1.attests, APPROVAL_ATTESTATION, "the claim travels with the record");
    assert.equal(r1.notAttested, APPROVAL_NOT_ATTESTED, "…and so does its limit");
    assert.equal(r2.notAttested, APPROVAL_NOT_ATTESTED);

    /* A record built without the signer still carries both sentences — the
       limit is never optional. */
    const bare = approvalRecord(one.approval);
    assert.equal(bare.attests, APPROVAL_ATTESTATION);
    assert.equal(bare.notAttested, APPROVAL_NOT_ATTESTED);
    assert.equal(bare.ownerKeyHandle, undefined, "no key given, no handle claimed");

    /* A DIFFERENT key naming the same human is a different approver — the name
       is a claim by the key holder, and the handle on the record shows which. */
    const other = await generateOwnerKeysWeb();
    const alien = await issueFederationApproval(body({ approvalId: "other-key-1", human: "priya" }), other);
    if (!alien.ok) throw new Error("issue failed");
    const alienRecord = approvalRecord(alien.approval, { publicKeyPem: other.publicKeyPem, handle: keyHandle(other.publicKeyPem) });
    assert.equal(alienRecord.human, r1.human, "the same name…");
    assert.notEqual(alienRecord.ownerKeyHandle, r1.ownerKeyHandle, "…from a different key is a different approver");
    assert.equal((await verifyFederationApproval(alien.approval, EXPECT, keys.publicKeyPem, NOW)).ok, false,
      "and it does not verify against the selfimpulse's own key");
    assert.equal(alienRecord.digest !== r1.digest, true, "the two records are not interchangeable");
  });
});
