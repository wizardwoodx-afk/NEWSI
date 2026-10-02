/**
 * Patina (17.6.2) — cross-selfimpulse integration probe.
 *
 * Pins the receipt → selfimpulse runtime join (src/selfimpulse/engine/crossSelfImpulse.ts)
 * as behavioral contracts:
 *
 *   1. Identity seam: create/persist/load with sign-then-verify self-test;
 *      a corrupted store refuses IN WORDS, never silently.
 *   2. Anchoring: a REAL buildChainedReceipt() receipt verifies under the
 *      ONE rulebook (proof.ts) and produces a signer-bound anchor envelope
 *      whose evidence binds the chain head and issuer fingerprint.
 *   3. Refusals: tampered receipts, empty chains, tampered envelopes and
 *      wrong signers are all rejected in words.
 *   4. Envelope wire shape stays protocol-compatible (p|n|ts ECDSA payload).
 *   5. 17.6.2: envelopes are one-time evidence — replayed nonces refused via a
 *      bounded ledger; the ledger itself can never grow without limit.
 */
import { describe, it } from "node:test";
import assert from "node:assert";

import { buildChainedReceipt } from "../src/selfimpulse/engine/proof";
import {
  loadOrCreateCrossSelfImpulseIdentity, anchorReceipt, anchorReceiptJsonl,
  verifyAnchorEnvelope, fingerprintFromJwk, IDENTITY_KEY, memoryReplayLedger,
  type CrossSelfImpulseStore,
} from "../src/selfimpulse/engine/crossSelfImpulse";
import { receiptToJsonl } from "../src/selfimpulse/engine/proof";

function memStore(): CrossSelfImpulseStore & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return { map, get: (k) => map.get(k) ?? null, set: (k, v) => { map.set(k, v); } };
}

async function sampleReceipt(tamper = false) {
  const rc = await buildChainedReceipt({
    mission: "cross-selfimpulse-probe",
    teamId: "probe-team",
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    version: "17.6.2",
    edition: "probe",
    events: [
      { kind: "mission.start", seatId: null, data: { objective: "anchor me" } },
      { kind: "tool.call", seatId: "seat-1", data: { tool: "shell_exec", governed: true } },
      { kind: "mission.done", seatId: null, data: { verified: true } },
    ],
  });
  if (tamper && rc.events.length > 1) {
    (rc.events[1] as { data: Record<string, unknown> }).data = { tool: "evil" };
  }
  return rc;
}

describe("crossSelfImpulse — the Patina ⇄ Protocol runtime join (17.6.2)", () => {
  it("identity seam: create → persist → reload, self-tested, fp grouped", async () => {
    const store = memStore();
    const first = await loadOrCreateCrossSelfImpulseIdentity(store, "probe-agent");
    assert.equal(first.ok, true);
    if (!first.ok) return;
    assert.match(first.value.fp, /^[0-9A-F]{4}(-[0-9A-F]{4}){3}$/);
    assert.ok(store.map.has(IDENTITY_KEY), "identity persisted through the injected seam");

    const again = await loadOrCreateCrossSelfImpulseIdentity(store, "probe-agent");
    assert.equal(again.ok, true);
    if (again.ok) assert.equal(again.value.fp, first.value.fp, "reload returns the same identity");
  });

  it("identity seam: a corrupted store refuses IN WORDS", async () => {
    const store = memStore();
    await loadOrCreateCrossSelfImpulseIdentity(store);
    const rec = JSON.parse(store.map.get(IDENTITY_KEY)!);
    // swap in an alien public key → self-test must fail
    rec.publicJwk = { ...rec.publicJwk, x: "AAAA" + rec.publicJwk.x.slice(4) };
    store.map.set(IDENTITY_KEY, JSON.stringify(rec));
    const res = await loadOrCreateCrossSelfImpulseIdentity(store);
    assert.equal(res.ok, false);
    if (!res.ok) assert.match(res.reason, /keypair mismatch/);
  });

  it("a REAL sealed receipt anchors into a signer-bound envelope", async () => {
    const store = memStore();
    const id = await loadOrCreateCrossSelfImpulseIdentity(store, "probe-agent");
    assert.equal(id.ok, true);
    if (!id.ok) return;

    const rc = await sampleReceipt();
    const anchored = await anchorReceipt(rc, id.value);
    assert.equal(anchored.ok, true, JSON.stringify(anchored));
    if (!anchored.ok) return;

    const { env, fact, head, evidence } = anchored.value;
    assert.match(head, /^[0-9a-f]{64}$/);
    assert.ok(evidence.includes(`head:${head}`), "evidence binds the verified chain head");
    // 20.1: was a hardcoded `events:3`. The chain is now four events long because
  // the receipt HEADER is the first chained event, so mission/teamId/edition/
  // autonomyArms sit inside the hash chain, the seal and the signature instead
  // of beside them as rewritable JSON. The count is the visible consequence of
  // that change and is asserted explicitly, because "the header is signed" is
  // only meaningful if a fourth event exists to carry it.
  assert.ok(/^receipt:si-proof-receipt\/2:head:[0-9a-f]{64}:events:4:seal:ok:issuer:([0-9a-f]{16}|unsigned)$/.test(evidence), `evidence was: ${evidence}`);
    assert.equal((fact as { action: string }).action, "anchor_receipt");
    assert.equal((fact as { agent: { fp: string } }).agent.fp, id.value.fp, "signer == actor");

    const opened = await verifyAnchorEnvelope(env, id.value.publicJwk);
    assert.equal(opened.ok, true, JSON.stringify(opened));
  });

  it("JSONL round-trip: the Register export format anchors unchanged", async () => {
    const store = memStore();
    const id = await loadOrCreateCrossSelfImpulseIdentity(store);
    if (!id.ok) throw new Error("identity");
    const rc = await sampleReceipt();
    const anchored = await anchorReceiptJsonl(receiptToJsonl(rc), id.value);
    assert.equal(anchored.ok, true, JSON.stringify(anchored));
  });

  it("tampered receipts are refused in words — never anchored", async () => {
    const store = memStore();
    const id = await loadOrCreateCrossSelfImpulseIdentity(store);
    if (!id.ok) throw new Error("identity");
    const rc = await sampleReceipt(true);
    const res = await anchorReceipt(rc, id.value);
    assert.equal(res.ok, false);
    if (!res.ok) assert.match(res.reason, /^receipt:/);
  });

  it("tampered envelopes and wrong signers are rejected", async () => {
    const store = memStore();
    const id = await loadOrCreateCrossSelfImpulseIdentity(store);
    if (!id.ok) throw new Error("identity");
    const other = await loadOrCreateCrossSelfImpulseIdentity(memStore(), "impostor");
    if (!other.ok) throw new Error("impostor identity");

    const rc = await sampleReceipt();
    const anchored = await anchorReceipt(rc, id.value);
    if (!anchored.ok) throw new Error("anchor");

    const forged = { ...anchored.value.env, p: anchored.value.env.p.replace("success", "failure") };
    const bad = await verifyAnchorEnvelope(forged, id.value.publicJwk);
    assert.equal(bad.ok, false);
    assert.equal(bad.reason, "bad-signature");

    const wrongKey = await verifyAnchorEnvelope(anchored.value.env, other.value.publicJwk);
    assert.equal(wrongKey.ok, false, "a different signer must not verify the envelope");
  });

  it("17.6.2: an envelope is ONE-TIME evidence — replays are refused", async () => {
    const store = memStore();
    const id = await loadOrCreateCrossSelfImpulseIdentity(store);
    if (!id.ok) throw new Error("identity");
    const rc = await sampleReceipt();
    const anchored = await anchorReceipt(rc, id.value);
    if (!anchored.ok) throw new Error("anchor");

    const ledger = memoryReplayLedger();
    const first = await verifyAnchorEnvelope(anchored.value.env, id.value.publicJwk, { replay: ledger });
    assert.equal(first.ok, true, "first presentation verifies");
    const second = await verifyAnchorEnvelope(anchored.value.env, id.value.publicJwk, { replay: ledger });
    assert.equal(second.ok, false);
    assert.equal(second.reason, "replayed-envelope");
  });

  it("17.6.2: the replay ledger is bounded — it cannot grow without limit", () => {
    const ledger = memoryReplayLedger(8);
    for (let i = 0; i < 100; i++) ledger.add(`nonce-${i}`);
    // oldest entries evicted; recent ones remembered
    assert.equal(ledger.has("nonce-0"), false, "bounded: oldest nonce evicted");
    assert.equal(ledger.has("nonce-99"), true, "recent nonce still remembered");
  });

  it("fingerprints are deterministic for a given public key", async () => {
    const store = memStore();
    const id = await loadOrCreateCrossSelfImpulseIdentity(store);
    if (!id.ok) throw new Error("identity");
    const fp2 = await fingerprintFromJwk(id.value.publicJwk);
    assert.equal(fp2, id.value.fp);
  });
});
