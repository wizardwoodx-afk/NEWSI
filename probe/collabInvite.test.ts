/**
 * probe/collabInvite.test.ts — hardened collaboration identity (18.3.0).
 *
 * Pins the review-driven fixes:
 *   1. private keys are AES-GCM encrypted at rest under a passphrase —
 *      localStorage never contains a private key, plaintext 18.2.0 blobs
 *      are PURGED, a wrong passphrase refuses;
 *   2. verifyApproval resolves the approver's key from the BOUND registry:
 *      an attacker's fresh key wearing "qwen" refuses, an unbound member
 *      refuses, a mismatched presented key refuses;
 *   3. accepting an invitation is the human act that binds the issuer;
 *   4. teamEvolve adoption verifies every signed approval against bindings.
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
  acceptInvitation,
  bindPeerIdentity,
  clearRegistry,
  createInvitation,
  ensureIdentity,
  forgetIdentity,
  identityUnlocked,
  listBoundPeers,
  parseInvitation,
  serializeInvitation,
  signApproval,
  storedPublicJwk,
  unbindPeer,
  verifyApproval,
} from "../src/engine/collabInvite";
import { clearA2AVerifiedPeers, recordA2AVerifiedPeer } from "../src/mission/a2aIdentityBridge";
import { approveTeamEvolution, proposeTeamEvolution, recordTeamRun, teamIdFor } from "../src/engine/teamEvolve";

let pass = 0;
let fail = 0;
const check = (name: string, cond: boolean, detail?: unknown): void => {
  if (cond) pass++;
  else fail++;
  console.log(`  ${cond ? "✅" : "❌"} ${name}${cond || detail === undefined ? "" : ` — ${JSON.stringify(detail)}`}`);
};

const PASS = "correct-horse-battery";

test("collabInvite — identity is sealed, binding is enforced", async () => {
  console.log("\n── 1. keys at rest ──");
  check("a short passphrase refuses to mint an identity", (await ensureIdentity("member-a", "tiny")).ok === false);
  const h = await ensureIdentity("member-a", PASS);
  check("a passphrase mints the identity", h.ok === true && h.created === true);
  const storedRaw = localStorage.getItem("engine.collab.key.v2:member-a") ?? "";
  const priv = (await globalThis.crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"])).privateKey;
  const privJwk = await globalThis.crypto.subtle.exportKey("jwk", priv);
  check("localStorage holds NO private key material", !storedRaw.includes(privJwk.d ?? "absent-sentinel") && !storedRaw.includes('"d":'));
  check("the public half is exactly what is stored in the open", JSON.stringify(storedPublicJwk("member-a")) === JSON.stringify((h as { publicJwk: JsonWebKey }).publicJwk));
  forgetIdentity("member-a");
  const wrong = await ensureIdentity("member-a", "wrong-passphrase-123");
  check("a wrong passphrase refuses — the key stays sealed", wrong.ok === false && !wrong.ok && wrong.error.includes("wrong passphrase"));
  check("refused unlock leaves the identity locked", identityUnlocked("member-a") === false);
  await ensureIdentity("member-a", PASS);
  check("the right passphrase re-unlocks and the public key is unchanged", (await ensureIdentity("member-a", PASS)) && JSON.stringify(storedPublicJwk("member-a")) === JSON.stringify((h as { publicJwk: JsonWebKey }).publicJwk));

  console.log("\n── 2. legacy plaintext blobs are purged ──");
  localStorage.setItem("engine.collab.key.v1:legacyuser", JSON.stringify({ pub: { kty: "EC" }, priv: { kty: "EC", d: "PLAINTEXT" } }));
  await ensureIdentity("legacyuser", PASS);
  check("the 18.2.0 plaintext blob is gone after first contact", localStorage.getItem("engine.collab.key.v1:legacyuser") === null);
  check("legacy user got a sealed v2 identity", localStorage.getItem("engine.collab.key.v2:legacyuser") !== null);

  console.log("\n── 3. invitations ──");
  const q = await ensureIdentity("qwen", PASS);
  const invR = await createInvitation({ from: "member-a", to: "qwen", scope: "one shared mission", riskCeiling: "safe", durationH: 24, capabilities: [] });
  check("an unlocked identity mints a signed invite", "digest" in invR);
  assert.ok("digest" in invR);
  check("scope, ceiling, duration and TOFU model ride in the payload", invR.payload.scope === "one shared mission" && invR.payload.riskCeiling === "safe" && invR.payload.trustModel === "tofu");
  forgetIdentity("member-a");
  const lockedMint = await createInvitation({ from: "member-a", to: "qwen", scope: "x", riskCeiling: "safe", durationH: 1, capabilities: [] });
  check("a LOCKED identity cannot mint invites", lockedMint.ok === false && !lockedMint.ok && lockedMint.error.includes("locked"));
  await ensureIdentity("member-a", PASS);
  const parsed = await parseInvitation(serializeInvitation(invR));
  check("a round-tripped invite verifies", parsed.ok === true);
  const tampered = JSON.parse(JSON.stringify(invR));
  tampered.payload.riskCeiling = "critical";
  check("raising the ceiling in transit refuses", (await parseInvitation(serializeInvitation(tampered))).ok === false);

  console.log("\n── 4. binding closes the attacker-key hole ──");
  clearRegistry();
  assert.ok(parsed.ok);
  const appr = await signApproval(parsed.invite.digest, "qwen", true);
  check("the approver's unlocked session key signs", appr !== null && !("ok" in appr));
  assert.ok(!("ok" in appr));
  const unbound = await verifyApproval(appr, "qwen");
  check("an UNBOUND member's approval refuses — no binding, no verification", unbound.ok === false && !unbound.ok && unbound.error.includes("has no bound"));
  // attacker: fresh keypair, wearing qwen's name, honestly signed with their own key
  const atk = await globalThis.crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const atkJwk = await globalThis.crypto.subtle.exportKey("jwk", atk.publicKey);
  const atkPrivJwk = await globalThis.crypto.subtle.exportKey("jwk", atk.privateKey);
  const atkKey = await globalThis.crypto.subtle.importKey("jwk", atkPrivJwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const body = { inviteDigest: parsed.invite.digest, approver: "qwen", approved: true, at: new Date().toISOString() };
  const canon = JSON.stringify(body, Object.keys(body).sort());
  const sig = await globalThis.crypto.subtle.sign({ name: "ECDSA", namedCurve: "P-256", hash: "SHA-256" }, atkKey, new TextEncoder().encode(canon));
  const b64 = btoa(String.fromCharCode(...new Uint8Array(sig)));
  const atkApproval = { ...body, publicJwk: atkJwk, signatureB64: b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "") };
  bindPeerIdentity("qwen", (q as { publicJwk: JsonWebKey }).publicJwk, "manual");
  const atkVerdict = await verifyApproval(atkApproval, "qwen");
  check("attacker's fresh key + qwen's name REFUSES (the 18.2.0 hole, closed)", atkVerdict.ok === false && !atkVerdict.ok && atkVerdict.error.includes("does not match the bound identity"));
  const good = await verifyApproval(appr, "qwen");
  check("the real qwen approval verifies against the bound key", good.ok === true);
  const flipped = { ...appr, approved: false };
  check("flipping approved without re-signing refuses", (await verifyApproval(flipped, "qwen")).ok === false);

  console.log("\n── 5. accepting an invitation binds the issuer ──");
  clearRegistry();
  const accept = await acceptInvitation(parsed.invite, "qwen", true);
  check("acceptance signs consent AND binds the issuer in one human act", accept !== null && "approval" in accept && listBoundPeers().some((p) => p.memberId === "member-a" && p.source === "invite-acceptance"));
  unbindPeer("member-a");
  check("unbinding is a human act and takes effect", listBoundPeers().every((p) => p.memberId !== "member-a"));
  bindPeerIdentity("qwen", (q as { publicJwk: JsonWebKey }).publicJwk, "manual");
  bindPeerIdentity("member-a", (h as { publicJwk: JsonWebKey }).publicJwk, "manual");

  console.log("\n── 6. teamEvolve verifies against bindings ──");
  const TEAM = teamIdFor(["member-a", "qwen"]);
  for (const [task, outcome, specs] of [
    ["t1", "verified", ["code.debugging", "testing.unit"]],
    ["t2", "verified", ["review.code", "security.review"]],
    ["t3", "failed", ["code.typescript"]],
  ] as const) {
    recordTeamRun({ teamId: TEAM, members: ["member-a", "qwen"], task, outcome, specialists: [...specs] });
  }
  const prop = await proposeTeamEvolution(TEAM, ["member-a", "qwen"]);
  assert.ok(prop.ok);
  const signedH = await signApproval(prop.proposal.digest, "member-a", true);
  const signedQ = await signApproval(prop.proposal.digest, "qwen", true);
  assert.ok(!("ok" in signedH) && !("ok" in signedQ));
  const adopt = await approveTeamEvolution(
    TEAM,
    prop.proposal.id,
    [
      { memberId: "member-a", approved: true, at: signedH.at },
      { memberId: "qwen", approved: true, at: signedQ.at },
    ],
    undefined,
    [signedH, signedQ],
  );
  check("adoption verifies every signed approval against bindings", adopt.ok === true);
  const prop2 = await proposeTeamEvolution(TEAM, ["member-a", "qwen"]);
  assert.ok(prop2.ok);
  const stale = await approveTeamEvolution(
    TEAM,
    prop2.proposal.id,
    [
      { memberId: "member-a", approved: true, at: new Date().toISOString() },
      { memberId: "qwen", approved: true, at: new Date().toISOString() },
    ],
    undefined,
    [signedH, signedQ],
  );
  check("signatures over an old proposal digest refuse", stale.ok === false);

  console.log("\n── 7. the stored public key must match the decrypted private key (18.4.0) ──");
  {
    const rawKey = "engine.collab.key.v2:member-a";
    const before = localStorage.getItem(rawKey)!;
    const rec = JSON.parse(before);
    const other = await globalThis.crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
    rec.publicJwk = await globalThis.crypto.subtle.exportKey("jwk", other.publicKey);
    localStorage.setItem(rawKey, JSON.stringify(rec));
    forgetIdentity("member-a");
    const tampered = await ensureIdentity("member-a", PASS);
    check("a tampered metadata row refuses even with the right passphrase", tampered.ok === false && !tampered.ok && tampered.error.includes("tampered"));
    check("the refused identity stays locked", identityUnlocked("member-a") === false);
    localStorage.setItem(rawKey, before);
    const healed = await ensureIdentity("member-a", PASS);
    check("restoring the coherent record re-unlocks", healed.ok === true);
  }

  console.log("\n── 8. A2A-card-verified peers bind structurally (18.4.0) ──");
  {
    clearRegistry();
    clearA2AVerifiedPeers();
    const qPub = storedPublicJwk("qwen")!;
    const appr2 = await signApproval(parsed.invite.digest, "qwen", true);
    assert.ok(!("ok" in appr2));
    check("with neither binding nor A2A record, qwen's approval refuses", (await verifyApproval(appr2, "qwen")).ok === false);
    await recordA2AVerifiedPeer("qwen", qPub, "https://peer.vh/.well-known/agent-card.json");
    const structural = await verifyApproval(appr2, "qwen");
    check("a card-verified A2A peer binds WITHOUT trust-on-first-use", structural.ok === true);
    const atk2 = await globalThis.crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
    const atkJwk2 = await globalThis.crypto.subtle.exportKey("jwk", atk2.publicKey);
    const atkPriv2 = await globalThis.crypto.subtle.exportKey("jwk", atk2.privateKey);
    const atkKey2 = await globalThis.crypto.subtle.importKey("jwk", atkPriv2, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
    const body2 = { inviteDigest: parsed.invite.digest, approver: "qwen", approved: true, at: new Date().toISOString() };
    const canon2 = JSON.stringify(body2, Object.keys(body2).sort());
    const sig2 = await globalThis.crypto.subtle.sign({ name: "ECDSA", namedCurve: "P-256", hash: "SHA-256" }, atkKey2, new TextEncoder().encode(canon2));
    const b642 = btoa(String.fromCharCode(...new Uint8Array(sig2))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    check("an attacker key against an A2A-bound member still refuses", (await verifyApproval({ ...body2, publicJwk: atkJwk2, signatureB64: b642 }, "qwen")).ok === false);
    clearA2AVerifiedPeers();
    bindPeerIdentity("qwen", qPub, "manual");
    bindPeerIdentity("member-a", storedPublicJwk("member-a")!, "manual");
  }

  console.log(`\n${fail === 0 ? "✅" : "❌"} collabInvite probe: ${pass} passed, ${fail} failed\n`);
  assert.equal(fail, 0, `${fail} collabInvite checks failed`);
});
