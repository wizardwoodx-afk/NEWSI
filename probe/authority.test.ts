/**
 * VH AUTHORITY + SELFIMPULSEMESH — 19.5.0 "Authority" probe pin.
 *
 * Pins the mechanics, not the marketing:
 *   · Mandate Passport — forged/expired/ownerless mandates are refusals
 *   · Chain of Authority — scope & budget can ONLY shrink; depth is capped
 *   · Intent Receipts — declared-vs-executed divergence is measured
 *   · Warranty Pack — sealed, deterministic
 *   · SelfImpulseMesh — no self-attestation, outsiders can't co-sign,
 *     trust compounds bilaterally, quarantine is receipted
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  signMandate, verifyMandate, delegateAuthority, verifyChain, remainingBudget,
  declareIntent, gateIntent, buildWarrantyPack, liabilityMap,
  bindAuthorityToReceipt, verifyAuthorityBinding,
} from "../src/engine/authority";
import { generateOwnerKeysWeb, signMandateWeb, verifyMandateWeb, bindAuthorityToReceiptWeb, verifyAuthorityBindingWeb } from "../src/engine/authorityWeb";
import {
  registerPeer, attest, openChannel, buildJointReceipt, coSign, isFullyCoSigned,
  recordJointOutcome, pairKey, quarantinePeer, meshStanding,
} from "../src/engine/selfimpulseMesh";

const now = 1_800_000_000_000;
const SECRET_OWNER = "owner-secret";

test("authority + selfimpulsemesh", async (t) => {
  // ── mandate passport ──────────────────────────────────────────────────────
  const mandate = signMandate({
    agentId: "si-agent-1", owner: "sree", scope: ["fs.read", "net.fetch"], budgetCap: 100, maxDepth: 2,
    issuedAt: now, expiresAt: now + 3_600_000,
  }, SECRET_OWNER);

  await t.test("a signed mandate verifies", () => {
    const r = verifyMandate(mandate, SECRET_OWNER, now + 1000);
    assert.equal(r.ok, true);
  });
  await t.test("no mandate = refusal, not silence", () => {
    const r = verifyMandate(null, SECRET_OWNER, now);
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.reason, "missing");
  });
  await t.test("an expired mandate is refused", () => {
    const r = verifyMandate(mandate, SECRET_OWNER, now + 7_200_000);
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.reason, "expired");
  });
  await t.test("a forged signature is refused", () => {
    const forged = { ...mandate, budgetCap: 99999 };
    const r = verifyMandate(forged, SECRET_OWNER, now + 1000);
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.reason, "bad-signature");
  });
  await t.test("a mandate without an owner is not authority", () => {
    const m = signMandate({ agentId: "x", owner: "", scope: [], budgetCap: 1, maxDepth: 1, issuedAt: now, expiresAt: now + 1000 }, SECRET_OWNER);
    const r = verifyMandate(m, SECRET_OWNER, now);
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.reason, "no-owner");
  });

  // ── chain of authority ────────────────────────────────────────────────────
  const root = { mandate, spent: 0, depth: 0 };
  await t.test("a contained delegation succeeds and links the chain", () => {
    const d = delegateAuthority(root, "si-agent-2", ["fs.read"], 40, null);
    assert.equal(d.ok, true);
    if (d.ok) { assert.equal(d.hop.depth, 1); assert.ok(d.hop.digest); }
  });
  await t.test("scope inflation is refused — authority only shrinks", () => {
    const d = delegateAuthority(root, "si-agent-2", ["fs.read", "fs.write"], 10, null);
    assert.equal(d.ok, false);
    if (!d.ok) assert.equal(d.reason, "scope-inflation");
  });
  await t.test("budget inflation is refused", () => {
    const d = delegateAuthority(root, "si-agent-2", ["fs.read"], 150, null);
    assert.equal(d.ok, false);
    if (!d.ok) assert.equal(d.reason, "budget-inflation");
  });
  await t.test("the depth ceiling comes from the mandate", () => {
    const d1 = delegateAuthority(root, "b", ["fs.read"], 10, null);
    assert.ok(d1.ok);
    if (d1.ok) {
      const child = { mandate, spent: 0, depth: 1 };
      const d2 = delegateAuthority(child, "c", ["fs.read"], 5, d1.hop.digest);
      assert.ok(d2.ok);
      if (d2.ok) {
        const grand = { mandate, spent: 0, depth: 2 };
        const d3 = delegateAuthority(grand, "d", ["fs.read"], 1, d2.hop.digest);
        assert.equal(d3.ok, false);
        if (!d3.ok) assert.equal(d3.reason, "depth-exceeded");
      }
    }
  });
  await t.test("budget decays with spend", () => {
    const b = { mandate, spent: 60, depth: 0 };
    assert.equal(remainingBudget(b), 40);
    const d = delegateAuthority(b, "x", ["fs.read"], 50, null);
    assert.equal(d.ok, false);
  });
  await t.test("a valid chain verifies end-to-end", () => {
    const d1 = delegateAuthority(root, "b", ["fs.read", "net.fetch"], 80, null);
    assert.ok(d1.ok);
    const mid = { mandate, spent: 0, depth: 1 };
    const d2 = delegateAuthority(mid, "c", ["fs.read"], 30, d1.ok ? d1.hop.digest : null);
    assert.ok(d2.ok);
    if (d1.ok && d2.ok) {
      const v = verifyChain([d1.hop, d2.hop]);
      assert.equal(v.ok, true);
    }
  });
  await t.test("a tampered hop breaks the chain at the right place", () => {
    const d1 = delegateAuthority(root, "b", ["fs.read"], 40, null);
    assert.ok(d1.ok);
    if (d1.ok) {
      const tampered = { ...d1.hop, grantedBudget: 999 };
      const v = verifyChain([tampered]);
      assert.equal(v.ok, false);
      assert.equal(v.brokenAt, 0);
    }
  });

  // ── intent receipts ───────────────────────────────────────────────────────
  await t.test("converged intent: did what it declared", () => {
    const d = declareIntent({ agentId: "a", taskId: "t1", declaredIntent: "read the log and summarize", declaredTools: ["fs.read"] });
    const r = gateIntent(d, { approved: true, reason: "safe read" }, ["fs.read"]);
    assert.equal(r.converged, true);
    assert.equal(r.divergence.length, 0);
  });
  await t.test("divergent intent is measured, not hidden", () => {
    const d = declareIntent({ agentId: "a", taskId: "t2", declaredIntent: "read the log", declaredTools: ["fs.read"] });
    const r = gateIntent(d, { approved: true, reason: "safe read" }, ["fs.read", "fs.write", "net.fetch"]);
    assert.equal(r.converged, false);
    assert.deepEqual(r.divergence.sort(), ["fs.write", "net.fetch"]);
  });
  await t.test("a refused intent stays refused even if tools ran", () => {
    const d = declareIntent({ agentId: "a", taskId: "t3", declaredIntent: "send data out", declaredTools: ["net.fetch"] });
    const r = gateIntent(d, { approved: false, reason: "egress declined at the gate" }, ["net.fetch"]);
    assert.equal(r.converged, false);
    assert.equal(r.gateDecision, "refused");
  });

  // ── warranty pack + liability ─────────────────────────────────────────────
  await t.test("the warranty pack seals deterministically", () => {
    const w1 = buildWarrantyPack("si-agent-1", { from: now, to: now + 86_400_000 }, { missionsCompleted: 12, gateApprovals: 40, gateRefusals: 3, intentConvergenceRate: 0.97, policyViolations: 0, chainDepthMax: 2 }, SECRET_OWNER);
    const w2 = buildWarrantyPack("si-agent-1", { from: now, to: now + 86_400_000 }, { missionsCompleted: 12, gateApprovals: 40, gateRefusals: 3, intentConvergenceRate: 0.97, policyViolations: 0, chainDepthMax: 2 }, SECRET_OWNER);
    assert.equal(w1.seal, w2.seal);
    const w3 = buildWarrantyPack("si-agent-1", { from: now, to: now + 86_400_000 }, { missionsCompleted: 13, gateApprovals: 40, gateRefusals: 3, intentConvergenceRate: 0.97, policyViolations: 0, chainDepthMax: 2 }, SECRET_OWNER);
    assert.notEqual(w1.seal, w3.seal);
  });
  await t.test("the liability map names the owner first, then every hop", () => {
    const d1 = delegateAuthority(root, "b", ["fs.read"], 40, null);
    assert.ok(d1.ok);
    if (d1.ok) {
      const m = liabilityMap(mandate, [d1.hop]);
      assert.equal(m.length, 2);
      assert.match(m[0].principal, /owner/);
      assert.equal(m[1].principal, "b");
    }
  });

  // ── SELFIMPULSEMESH ─────────────────────────────────────────────────────────────
  const peerA = registerPeer({ peerId: "bot-a", instanceOf: "org-alpha", capabilities: ["research", "writing"], endpoint: "https://a.example.com" }, now);
  const peerB = registerPeer({ peerId: "bot-b", instanceOf: "org-beta", capabilities: ["code", "testing"], endpoint: "https://b.example.com" }, now);
  const peerHttp = registerPeer({ peerId: "bot-c", instanceOf: "org-gamma", capabilities: [], endpoint: "http://c.example.com" }, now);

  await t.test("plain-http peers are refused at the door", () => {
    assert.ok("refused" in peerHttp);
  });
  await t.test("registered peers carry a tamper-evident identity", () => {
    assert.ok(!("refused" in peerA) && peerA.identityDigest.length === 64);
  });
  if (!("refused" in peerA) && !("refused" in peerB)) {
    const attA = attest("secret-a", "bot-a", peerB, 3, now);
    const attB = attest("secret-b", "bot-b", peerA, 3, now);

    await t.test("self-attestation is not trust", () => {
      const c = openChannel(attA, attest("secret-a", "bot-a", peerB, 3, now));
      assert.ok("refused" in c);
    });
    await t.test("a mutual handshake opens a channel with two signatures", () => {
      const c = openChannel(attA, attB);
      assert.ok(!("refused" in c) && c.channelDigest.length === 64);
    });
    await t.test("non-cross-referencing attestations are refused", () => {
      const attWrong = attest("secret-x", "bot-x", peerA, 1, now);
      const c = openChannel(attA, attWrong);
      assert.ok("refused" in c);
    });

    const channel = openChannel(attA, attB);
    if (!("refused" in channel)) {
      await t.test("a joint receipt is co-signed by BOTH participants", () => {
        let jr = buildJointReceipt("m-1", channel, [{ actor: "bot-a", action: "research", outcome: "executed", at: now }, { actor: "bot-b", action: "code", outcome: "executed", at: now + 1 }]);
        assert.equal(isFullyCoSigned(jr), false);
        jr = coSign(jr, "bot-a", "secret-a");
        assert.equal(isFullyCoSigned(jr), false);
        jr = coSign(jr, "bot-b", "secret-b");
        assert.equal(isFullyCoSigned(jr), true);
        assert.ok(jr.digest.length === 64);
      });
      await t.test("outsiders cannot co-sign a mission they are not part of", () => {
        const jr = buildJointReceipt("m-2", channel, []);
        assert.throws(() => coSign(jr, "bot-z", "secret-z"));
      });
    }
  }
  await t.test("trust compounds on clean work and decays on divergence", () => {
    const ledger = new Map();
    recordJointOutcome(ledger, "bot-a", "bot-b", "clean");
    recordJointOutcome(ledger, "bot-a", "bot-b", "clean");
    const t2 = recordJointOutcome(ledger, "bot-a", "bot-b", "divergence");
    assert.equal(t2.trust, 0);
    assert.equal(t2.divergences, 1);
    assert.equal(meshStanding(undefined), "unknown");
    assert.equal(meshStanding(t2), "probation");
  });
  await t.test("pair keys are order-independent", () => {
    assert.equal(pairKey("a", "b"), pairKey("b", "a"));
  });
  await t.test("quarantine is receipted", () => {
    const q = quarantinePeer("bot-c", "injection flagged in reply", now);
    assert.ok(q.digest.length === 64);
    assert.equal(q.reason, "injection flagged in reply");
  });

  // ── asymmetric mandates — the portable trust root (WebCrypto, live path) ──
  const keys = await generateOwnerKeysWeb();
  const asymMandate = await signMandateWeb({
    agentId: "si-agent-9", owner: "sree", scope: ["pc.exec", "pc.browser"], budgetCap: 50, maxDepth: 1,
    issuedAt: now, expiresAt: now + 3_600_000,
  }, keys);

  await t.test("an asymmetric mandate verifies with the PUBLIC key alone", async () => {
    const r = await verifyMandateWeb(asymMandate, keys.publicKeyPem, now + 1000);
    assert.equal(r.ok, true);
  });
  await t.test("the wrong public key refuses the mandate", async () => {
    const stranger = await generateOwnerKeysWeb();
    const r = await verifyMandateWeb(asymMandate, stranger.publicKeyPem, now + 1000);
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.reason, "bad-signature");
  });
  await t.test("a symmetric HMAC mandate is refused as portable authority", async () => {
    const r = await verifyMandateWeb(mandate, keys.publicKeyPem, now + 1000);
    assert.equal(r.ok, false);
    if (!r.ok) assert.match(r.detail, /asymmetric/);
  });
  await t.test("an expired asymmetric mandate is refused", async () => {
    const r = await verifyMandateWeb(asymMandate, keys.publicKeyPem, now + 7_200_000);
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.reason, "expired");
  });
  await t.test("the portable binding round-trips offline (authorityWeb)", async () => {
    const receiptDigest = "c".repeat(64);
    const b = await bindAuthorityToReceiptWeb(receiptDigest, null, "sree");
    assert.equal(await verifyAuthorityBindingWeb(b, receiptDigest, null), true);
    assert.equal(await verifyAuthorityBindingWeb(b, "d".repeat(64), null), false);
  });

  // ── authority ⟷ receipt chain binding ─────────────────────────────────────
  await t.test("an authority binding attaches a hop to a receipt digest", () => {
    const d1 = delegateAuthority(root, "b", ["fs.read"], 40, null);
    assert.ok(d1.ok);
    if (d1.ok) {
      const receiptDigest = "a".repeat(64);
      const binding = bindAuthorityToReceipt(receiptDigest, d1.hop, "sree");
      assert.equal(verifyAuthorityBinding(binding, receiptDigest, d1.hop), true);
      assert.equal(verifyAuthorityBinding(binding, "b".repeat(64), d1.hop), false);
    }
  });
  await t.test("a root-mandate action binds with a null hop", () => {
    const binding = bindAuthorityToReceipt("c".repeat(64), null, "sree");
    assert.equal(verifyAuthorityBinding(binding, "c".repeat(64), null), true);
  });
});
