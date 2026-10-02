/**
 * probe/fedIdentity.test.ts — one identity system, and it proves possession.
 *
 * Two reviewer findings live here.
 *
 * 19.6.0 pinned that Bridge must not mint its own ephemeral identity beside the
 * selfimpulse's durable authority layer: the federation identity IS the authority
 * identity (same owner, same key, same keystore path).
 *
 * 19.6.1 closed the second finding: the FACE was seeded from `selfimpulse:<owner>`,
 * so the same owner with a rotated key kept the same mark while the docs called
 * the mark "derived from the identity". The decision, now implemented: the mark
 * a counterparty pins is derived from the CANONICAL PUBLIC KEY. Rotation yields
 * a new mark; a swapped key cannot keep the old one.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  ANCHOR_FORMAT, KEY_FACE_PREFIX, federationIdentity, issueAnchor, verifyAnchor, anchorCanonical, anchorDigest, anchorSummary, anchorFace,
  faceForKey, faceSeedForKey, keyHandle, keyHandleFromJwk, faceFromJwk, canonicalKeyMaterial, publicKeyPemFromJwk,
} from "../src/engine/federation/identity";
import { authorityOwnerIdentity } from "../src/engine/missionAuthority";
import { fingerprintOf, sigilOf } from "../src/engine/federation/sigil";
import { pureSha256 } from "../src/engine/pureHash";
import { generateOwnerKeysWeb } from "../src/engine/authorityWeb";

/** A memory keystore seam, exactly as the authority layer expects it. */
function memStore(): { get(): string | null; set(v: string): void } {
  let v: string | null = null;
  return { get: () => v, set: (x: string) => { v = x; } };
}

test("federation identity — the selfimpulse's own authority keys, with proof of possession", async (t) => {
  await t.test("§1 the identity IS the authority identity, not a second one", async () => {
    const storage = memStore();
    const fed = await federationIdentity({ storage, identity: "priya" });
    const auth = await authorityOwnerIdentity({ storage, identity: "priya" });

    assert.equal(fed.owner, auth.owner, "same owner name");
    assert.equal(fed.keys.publicKeyPem, auth.keys.publicKeyPem, "same public key — one identity system, not two");
    assert.equal(fed.security, auth.security);
    assert.equal(fed.persisted, true, "the memory seam persists, so the key is durable in this test");
    assert.equal(fed.sigilDerivedFrom, "public-key", "the mark says what it was derived from");
  });

  await t.test("§2 THE MARK IS KEY-DERIVED — the same owner with a new key gets a new mark", async () => {
    const oldKeys = await generateOwnerKeysWeb();
    const newKeys = await generateOwnerKeysWeb();

    const before = faceForKey(oldKeys.publicKeyPem);
    assert.deepEqual(before, faceForKey(oldKeys.publicKeyPem), "the same key always derives the same mark");
    const after = faceForKey(newKeys.publicKeyPem);

    assert.notEqual(before.fingerprint, after.fingerprint, "rotation produces a NEW mark — the old face does not survive a new key");
    assert.equal(before.seed, `${KEY_FACE_PREFIX}${canonicalKeyMaterial(oldKeys.publicKeyPem)}`);

    /* And the old mark cannot be carried over to the new key: verification
       re-derives the handle from the PEM inside the anchor. */
    const fed = await federationIdentity({ storage: memStore(), identity: "priya" });
    const rotated = { ...(await issueAnchor(fed, { issuedAt: 1_760_000_000_000 })) };
    const carriedOver = { ...rotated, publicKeyPem: newKeys.publicKeyPem, fingerprint: rotated.fingerprint };
    const verdict = await verifyAnchor(carriedOver);
    assert.equal(verdict.ok, false, "a mark from the old key cannot be re-pointed at a new key");
    if (!verdict.ok) assert.equal(verdict.reason, "fingerprint-mismatch");
  });

  await t.test("§3 the two kinds of mark are different strings, so neither can impersonate the other", async () => {
    const keys = await generateOwnerKeysWeb();
    const keyMark = keyHandle(keys.publicKeyPem);
    const subjectMark = fingerprintOf("selfimpulse:priya");
    assert.notEqual(keyMark, subjectMark, "a key handle and a subject handle are domain-separated");
    assert.match(keyMark, /^[0-9A-F]{4}(-[0-9A-F]{4}){3}$/, "…but they read the same way to a human");
    assert.notDeepEqual(faceForKey(keys.publicKeyPem), sigilOf("selfimpulse:priya"), "…and they draw differently");

    /* A JWK and a PEM of the SAME key derive the SAME mark: one canonical
       encoding, so the mark beside a peer's name in the door is the mark on
       that peer's anchor. */
    const spki = new Uint8Array(await crypto.subtle.exportKey("spki", keys.publicKey));
    void spki;
    const jwk = await crypto.subtle.exportKey("jwk", keys.publicKey);
    const fromJwk = await keyHandleFromJwk(jwk);
    assert.equal(fromJwk, keyMark, "JWK and PEM of one key produce one handle");
    assert.deepEqual(await faceFromJwk(jwk), faceForKey(keys.publicKeyPem), "…and one face");

    /* Line-wrapping must not change the mark either: canonicalisation strips it. */
    const rewrapped = keys.publicKeyPem.replace(/\n/g, "\n\n");
    assert.equal(keyHandle(rewrapped), keyMark, "the same key material is the same mark, however it was wrapped");
    assert.notEqual(await publicKeyPemFromJwk(jwk), keys.publicKeyPem.replace(/\n/g, ""), "the re-encode is a real PEM");
  });

  await t.test("§4 an anchor proves possession, and the face cannot be re-pointed", async () => {
    const fed = await federationIdentity({ storage: memStore(), identity: "ana" });
    const anchor = await issueAnchor(fed, { issuedAt: 1_760_000_000_000 });
    assert.equal(anchor.v, ANCHOR_FORMAT);
    assert.equal(anchor.owner, "ana");
    assert.equal(anchor.scheme, "ecdsa-p256");
    assert.equal(anchor.fingerprint, fed.sigil.fingerprint);
    assert.equal(anchor.fingerprint, keyHandle(anchor.publicKeyPem), "the anchor's face is its key's face");
    assert.equal(anchor.durable, true);
    assert.match(anchor.selfSignature, /^ecdsa-p256:/);

    const verdict = await verifyAnchor(anchor);
    assert.equal(verdict.ok, true, JSON.stringify(verdict));
    if (verdict.ok) {
      assert.equal(verdict.owner, "ana");
      assert.equal(verdict.fingerprint, anchor.fingerprint);
    }

    const unproven = { ...anchor, selfSignature: "ecdsa-p256:AAAA" };
    const bad = await verifyAnchor(unproven);
    assert.equal(bad.ok, false);
    if (!bad.ok) assert.equal(bad.reason, "bad-self-signature");

    // Swapping the face breaks the derivation AND the signature over it.
    const other = await generateOwnerKeysWeb();
    const refaced = { ...anchor, fingerprint: keyHandle(other.publicKeyPem) };
    const refused = await verifyAnchor(refaced);
    assert.equal(refused.ok, false);
    if (!refused.ok) assert.equal(refused.reason, "fingerprint-mismatch");

    // Renaming the owner keeps the key (and its mark) but breaks possession.
    const renamed = { ...anchor, owner: "ana-2" };
    const unowned = await verifyAnchor(renamed);
    assert.equal(unowned.ok, false);
    if (!unowned.ok) assert.equal(unowned.reason, "bad-self-signature");

    // An anchor with no key pins nothing.
    const keyless = { ...anchor, publicKeyPem: "" };
    const empty = await verifyAnchor(keyless);
    assert.equal(empty.ok, false);
    if (!empty.ok) assert.equal(empty.reason, "malformed");

    const symmetric = { ...anchor, scheme: "hmac" as unknown as typeof anchor.scheme };
    const notPortable = await verifyAnchor(symmetric);
    assert.equal(notPortable.ok, false);
    if (!notPortable.ok) assert.equal(notPortable.reason, "wrong-scheme");

    const absent = await verifyAnchor(null);
    assert.equal(absent.ok, false);
    if (!absent.ok) assert.equal(absent.reason, "malformed");

    assert.equal(anchorDigest(anchor).length, 64);
    assert.equal(anchorDigest(anchor), pureSha256(`vh.fed.anchor.v1:${anchorCanonical(anchor)}|${anchor.selfSignature}`));
    assert.match(anchorSummary(fed), /ana — /);
    assert.ok(anchorFace(fed, "sealed", 40).includes("si-sigil--sealed"));
  });

  await t.test("§5 a session-scoped anchor is refused when durability is required", async () => {
    const session = await federationIdentity({ identity: "session-only-owner" });
    assert.equal(session.security, "session");
    const anchor = await issueAnchor(session, { issuedAt: 1_760_000_000_000 });
    assert.equal(anchor.durable, false);
    assert.equal(anchor.security, "session");

    const accepted = await verifyAnchor(anchor);
    assert.equal(accepted.ok, true, "an honest session anchor still verifies");
    if (accepted.ok) assert.equal(accepted.durable, false, "…and it reports that it is not durable");

    const strict = await verifyAnchor(anchor, { requireDurable: true });
    assert.equal(strict.ok, false);
    if (!strict.ok) {
      assert.equal(strict.reason, "non-durable");
      assert.match(strict.detail, /will not survive a restart/);
    }
    assert.match(anchorSummary(session), /session-scoped, not durable/);
  });

  await t.test("§6 the same key derives one mark, across identities and across calls", async () => {
    const storage = memStore();
    const fed = await federationIdentity({ storage, identity: "kenji" });
    assert.equal(fed.sigil.fingerprint, keyHandle(fed.keys.publicKeyPem));
    const again = await federationIdentity({ storage, identity: "kenji" });
    assert.deepEqual(fed.sigil, again.sigil, "one key, one mark, every time");

    // A SECOND identity that happens to be named after the first's owner string
    // is still a different key — and therefore a different mark.
    const other = await federationIdentity({ storage: memStore(), identity: "kenji" });
    assert.notEqual(other.sigil.fingerprint, fed.sigil.fingerprint, "a different key is a different identity, whatever it is called");
  });
});
