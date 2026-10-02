import { createRequire as __mjCreateRequire } from "node:module"; const require = __mjCreateRequire(import.meta.url);

// probe/reachGrant.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";

// src/engine/pureHash.ts
var K = [
  1116352408,
  1899447441,
  3049323471,
  3921009573,
  961987163,
  1508970993,
  2453635748,
  2870763221,
  3624381080,
  310598401,
  607225278,
  1426881987,
  1925078388,
  2162078206,
  2614888103,
  3248222580,
  3835390401,
  4022224774,
  264347078,
  604807628,
  770255983,
  1249150122,
  1555081692,
  1996064986,
  2554220882,
  2821834349,
  2952996808,
  3210313671,
  3336571891,
  3584528711,
  113926993,
  338241895,
  666307205,
  773529912,
  1294757372,
  1396182291,
  1695183700,
  1986661051,
  2177026350,
  2456956037,
  2730485921,
  2820302411,
  3259730800,
  3345764771,
  3516065817,
  3600352804,
  4094571909,
  275423344,
  430227734,
  506948616,
  659060556,
  883997877,
  958139571,
  1322822218,
  1537002063,
  1747873779,
  1955562222,
  2024104815,
  2227730452,
  2361852424,
  2428436474,
  2756734187,
  3204031479,
  3329325298
];
var rotr = (x, n) => (x >>> n | x << 32 - n) >>> 0;
var utf8 = (text) => new TextEncoder().encode(text);
function sha256Bytes(data) {
  const bitLen = data.length * 8;
  const padded = new Uint8Array((data.length + 8 >> 6 << 6) + 64);
  padded.set(data);
  padded[data.length] = 128;
  const dv = new DataView(padded.buffer);
  dv.setUint32(padded.length - 4, bitLen >>> 0);
  dv.setUint32(padded.length - 8, Math.floor(bitLen / 4294967296));
  let h0 = 1779033703, h1 = 3144134277, h2 = 1013904242, h3 = 2773480762;
  let h4 = 1359893119, h5 = 2600822924, h6 = 528734635, h7 = 1541459225;
  const w = new Uint32Array(64);
  for (let off = 0; off < padded.length; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = dv.getUint32(off + i * 4);
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ w[i - 15] >>> 3;
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ w[i - 2] >>> 10;
      w[i] = w[i - 16] + s0 + w[i - 7] + s1 >>> 0;
    }
    let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = e & f ^ ~e & g;
      const t1 = h + S1 + ch + K[i] + w[i] >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = a & b ^ a & c ^ b & c;
      const t2 = S0 + maj >>> 0;
      h = g;
      g = f;
      f = e;
      e = d + t1 >>> 0;
      d = c;
      c = b;
      b = a;
      a = t1 + t2 >>> 0;
    }
    h0 = h0 + a >>> 0;
    h1 = h1 + b >>> 0;
    h2 = h2 + c >>> 0;
    h3 = h3 + d >>> 0;
    h4 = h4 + e >>> 0;
    h5 = h5 + f >>> 0;
    h6 = h6 + g >>> 0;
    h7 = h7 + h >>> 0;
  }
  const out = new Uint8Array(32);
  const ov = new DataView(out.buffer);
  ov.setUint32(0, h0);
  ov.setUint32(4, h1);
  ov.setUint32(8, h2);
  ov.setUint32(12, h3);
  ov.setUint32(16, h4);
  ov.setUint32(20, h5);
  ov.setUint32(24, h6);
  ov.setUint32(28, h7);
  return out;
}
var toHex = (bytes) => Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
function pureSha256(text) {
  return toHex(sha256Bytes(utf8(text)));
}

// src/engine/selfimpulseMesh.ts
var pairKey = (a, b) => [a, b].sort().join("\u2194");
var meshStanding = (t) => !t ? "unknown" : t.trust < 3 ? "probation" : t.trust < 10 ? "selfimpulseed" : "proven";

// src/engine/meshRuntime.ts
var TRUST_KEY = "engine.mesh.trust.v1";
function loadTrust() {
  try {
    const raw = globalThis.localStorage?.getItem(TRUST_KEY);
    if (!raw) return /* @__PURE__ */ new Map();
    const rows = JSON.parse(raw);
    return new Map(rows.map((r) => [r.pairKey, r]));
  } catch {
    return /* @__PURE__ */ new Map();
  }
}
function pairTrustFor(a, b) {
  return loadTrust().get(pairKey(a, b));
}
function standingFor(a, b) {
  return meshStanding(pairTrustFor(a, b));
}

// src/engine/reach/delegationGrant.ts
var DELEGATION_CAPABILITIES = [
  "repo.read",
  "data.aggregate",
  "test.run",
  "net.fetch",
  "egress.share",
  "repo.write",
  "shell.exec",
  "spend.commit",
  "deploy.release",
  "secrets.read"
];
var CAPABILITIES_BY_STANDING = {
  unknown: [],
  probation: ["repo.read", "data.aggregate"],
  selfimpulseed: ["repo.read", "data.aggregate", "test.run", "net.fetch", "egress.share"],
  proven: [
    "repo.read",
    "data.aggregate",
    "test.run",
    "net.fetch",
    "egress.share",
    "repo.write",
    "shell.exec",
    "spend.commit",
    "deploy.release",
    "secrets.read"
  ]
};
var IRREVERSIBLE_CAPABILITIES = ["deploy.release", "secrets.read"];
var SUPERVISED_CAPABILITIES = ["repo.write", "shell.exec", "spend.commit"];
var HUMAN_FIRST_CAPABILITIES = [
  ...SUPERVISED_CAPABILITIES,
  ...IRREVERSIBLE_CAPABILITIES
];
var REQUIRE_HUMAN_FIRST_DEFAULT = true;
function grantCanonical(g) {
  const refusals = g.refused.map((r) => `${r.capability}:${r.rule}`).join(",");
  return [g.id, g.pair, g.tier, g.at, String(g.humanFirst), g.granted.join(","), refusals].join("");
}
function tiersFor(capability) {
  return ["probation", "selfimpulseed", "proven"].filter((t) => CAPABILITIES_BY_STANDING[t].includes(capability));
}
function narrowGrant(input) {
  const tier = input.standing ?? "unknown";
  const humanFirst = input.requireHumanFirst ?? REQUIRE_HUMAN_FIRST_DEFAULT;
  const atMs = Date.parse(input.at);
  const approvals = input.approvals ?? [];
  const granted = [];
  const refused = [];
  const seen = /* @__PURE__ */ new Set();
  for (const raw of input.requested) {
    const capability = raw.trim();
    if (seen.has(capability)) continue;
    seen.add(capability);
    if (!DELEGATION_CAPABILITIES.includes(capability)) {
      refused.push({
        capability,
        rule: "not-a-capability",
        why: `"${capability}" is not in the delegation capability set, so it is not withheld \u2014 it is unknown`
      });
      continue;
    }
    const cap = capability;
    if (tier === "unknown") {
      refused.push({
        capability,
        rule: "quarantined",
        why: "this pair has no joint receipts, so no capability is lent; the first exchange is read-only by ruling, not by luck"
      });
      continue;
    }
    if (!CAPABILITIES_BY_STANDING[tier].includes(cap)) {
      const needed = tiersFor(cap);
      refused.push({
        capability,
        rule: "below-standing",
        why: `pair standing "${tier}" does not lend ${capability}; it is lent from ${needed.join(" or ")} standing`
      });
      continue;
    }
    const needsHuman = IRREVERSIBLE_CAPABILITIES.includes(cap) || humanFirst && SUPERVISED_CAPABILITIES.includes(cap);
    if (needsHuman) {
      const approval = approvals.find((a) => a.capability === cap);
      if (!approval) {
        refused.push({
          capability,
          rule: "human-first",
          why: `${capability} changes the state of this selfimpulse, so it needs a human decision naming it; none was attached`
        });
        continue;
      }
      if (approval.expiresAt !== void 0 && Date.parse(approval.expiresAt) < atMs) {
        refused.push({
          capability,
          rule: "approval-expired",
          why: `the approval for ${capability} expired at ${approval.expiresAt}, before this grant at ${input.at}`
        });
        continue;
      }
      if (approval.approvalId.trim().length === 0) {
        refused.push({
          capability,
          rule: "human-first",
          why: `${capability} was claimed as approved with no approval id, which cannot be checked and is therefore not an approval`
        });
        continue;
      }
    }
    granted.push(cap);
  }
  const staged = {
    id: `grant-${pureSha256(`${input.ownerA}|${input.ownerB}|${input.at}`).slice(0, 16)}`,
    pair: pairKey(input.ownerA, input.ownerB),
    tier,
    at: input.at,
    humanFirst,
    granted: [...granted].sort(),
    refused
  };
  return { ...staged, digest: pureSha256(`vh.reach.delegationGrant.v1:${grantCanonical(staged)}`) };
}
function grantAllows(grant, capability) {
  return grant.granted.includes(capability);
}
function refusalSummary(grant) {
  return grant.refused.map((r) => `${r.capability} \u2014 withheld (${r.rule}): ${r.why}`);
}
function grantRecord(grant) {
  return {
    pair: grant.pair,
    tier: grant.tier,
    granted: grant.granted,
    refused: grant.refused,
    humanFirst: grant.humanFirst,
    digest: grant.digest
  };
}
function grantForPair(input, deps = {}) {
  const read = deps.standing ?? ((a, b) => standingFor(a, b));
  return narrowGrant({ ...input, standing: read(input.ownerA, input.ownerB) });
}

// probe/reachGrant.test.ts
var AT = "2026-09-18T06:00:00.000Z";
var A = "selfimpulse-alpha";
var B = "selfimpulse-beta";
var refusalFor = (grant, cap) => grant.refused.find((r) => r.capability === cap);
test("reach delegation grant \u2014 what a peer may do here, decided in words", async (t) => {
  await t.test("\xA71 standing comes from the mesh, and an unknown pair is lent nothing", () => {
    assert.equal(REQUIRE_HUMAN_FIRST_DEFAULT, true, "the shipped posture is human-first");
    const stranger = narrowGrant({ ownerA: A, ownerB: B, requested: [...DELEGATION_CAPABILITIES], standing: "unknown", at: AT });
    assert.deepEqual(stranger.granted, [], "a pair with no joint receipts receives nothing");
    assert.equal(stranger.refused.length, DELEGATION_CAPABILITIES.length);
    for (const r of stranger.refused) assert.equal(r.rule, "quarantined", `${r.capability}: ${r.rule}`);
    assert.equal(stranger.pair, pairKey(A, B), "the grant names the mesh's pair key");
    const wired = grantForPair({ ownerA: A, ownerB: B, requested: ["repo.read"], at: AT });
    assert.equal(wired.tier, standingFor(A, B), "the default path reads the live mesh ledger");
    assert.equal(wired.tier, "unknown", "an empty mesh knows this pair as little as it should");
    assert.equal(grantAllows(wired, "repo.read"), false);
  });
  await t.test("\xA72 the lending table is monotone and stated", () => {
    const probation = narrowGrant({ ownerA: A, ownerB: B, requested: [...DELEGATION_CAPABILITIES], standing: "probation", at: AT });
    assert.deepEqual(probation.granted, ["data.aggregate", "repo.read"], "probation reads; it does not run or write");
    assert.equal(refusalFor(probation, "test.run")?.rule, "below-standing");
    assert.match(refusalFor(probation, "test.run")?.why ?? "", /lent from selfimpulseed or proven/);
    const selfimpulseed = narrowGrant({ ownerA: A, ownerB: B, requested: [...DELEGATION_CAPABILITIES], standing: "selfimpulseed", at: AT, approvals: [{ capability: "repo.write", approvalId: "appr-1", at: AT }] });
    assert.deepEqual(selfimpulseed.granted, ["data.aggregate", "egress.share", "net.fetch", "repo.read", "test.run"], "a selfimpulseed pair may test and fetch, not write");
    const proven = narrowGrant({ ownerA: A, ownerB: B, requested: ["repo.read", "repo.write"], standing: "proven", at: AT });
    assert.deepEqual(proven.granted, ["repo.read"], "even a proven pair does not write without a human in the loop");
    const ladder = ["probation", "selfimpulseed", "proven"];
    for (const cap of DELEGATION_CAPABILITIES) {
      const lends = (s) => CAPABILITIES_BY_STANDING[s].includes(cap);
      assert.equal(lends("unknown"), false, `${cap} is lent to a stranger`);
      ladder.forEach((tier, i) => {
        if (!lends(tier)) return;
        for (const higher of ladder.slice(i + 1)) {
          assert.equal(lends(higher), true, `${cap} is lent at ${tier} but not at ${higher} \u2014 trust must never narrow`);
        }
      });
    }
    assert.deepEqual(tiersFor("secrets.read"), ["proven"], "secrets are a proven-only capability");
    assert.deepEqual(tiersFor("repo.read"), ["probation", "selfimpulseed", "proven"]);
  });
  await t.test("\xA73 human-first holds at runtime, and the irreversible set cannot be relaxed", () => {
    const bare = narrowGrant({ ownerA: A, ownerB: B, requested: ["repo.write", "shell.exec", "spend.commit"], standing: "proven", at: AT });
    assert.deepEqual(bare.granted, []);
    for (const cap of SUPERVISED_CAPABILITIES) assert.equal(refusalFor(bare, cap)?.rule, "human-first");
    const withApprovals = narrowGrant({
      ownerA: A,
      ownerB: B,
      requested: ["repo.write", "shell.exec", "spend.commit"],
      standing: "proven",
      at: AT,
      approvals: [
        { capability: "repo.write", approvalId: "appr-w", at: AT },
        { capability: "shell.exec", approvalId: "appr-x", at: AT },
        { capability: "spend.commit", approvalId: "appr-s", at: AT }
      ]
    });
    assert.deepEqual(withApprovals.granted, ["repo.write", "shell.exec", "spend.commit"], "named approvals do grant the supervised three");
    const relaxed = narrowGrant({
      ownerA: A,
      ownerB: B,
      requested: ["repo.write", "deploy.release", "secrets.read"],
      standing: "proven",
      at: AT,
      requireHumanFirst: false
    });
    assert.deepEqual(relaxed.granted, ["repo.write"], "the operator lever moves the recoverable capability only");
    for (const cap of IRREVERSIBLE_CAPABILITIES) {
      assert.equal(refusalFor(relaxed, cap)?.rule, "human-first", `${cap} must stay human-first at every setting`);
    }
  });
  await t.test("\xA74 an approval is capability-bound, attributable and expiring", () => {
    const wrongCapability = narrowGrant({
      ownerA: A,
      ownerB: B,
      requested: ["repo.write"],
      standing: "proven",
      at: AT,
      approvals: [{ capability: "shell.exec", approvalId: "appr-x", at: AT }]
    });
    assert.equal(wrongCapability.granted.length, 0, "a blanket or adjacent approval authorises nothing");
    const expired = narrowGrant({
      ownerA: A,
      ownerB: B,
      requested: ["repo.write"],
      standing: "proven",
      at: AT,
      approvals: [{ capability: "repo.write", approvalId: "appr-w", at: "2026-09-01T00:00:00.000Z", expiresAt: "2026-09-10T00:00:00.000Z" }]
    });
    assert.equal(refusalFor(expired, "repo.write")?.rule, "approval-expired");
    assert.match(refusalFor(expired, "repo.write")?.why ?? "", /expired at 2026-09-10/);
    const anonymous = narrowGrant({
      ownerA: A,
      ownerB: B,
      requested: ["repo.write"],
      standing: "proven",
      at: AT,
      approvals: [{ capability: "repo.write", approvalId: "   ", at: AT }]
    });
    assert.equal(refusalFor(anonymous, "repo.write")?.rule, "human-first");
    assert.match(refusalFor(anonymous, "repo.write")?.why ?? "", /not an approval/);
    const live = narrowGrant({
      ownerA: A,
      ownerB: B,
      requested: ["repo.write"],
      standing: "proven",
      at: AT,
      approvals: [{ capability: "repo.write", approvalId: "appr-w", at: AT, expiresAt: "2026-09-19T00:00:00.000Z" }]
    });
    assert.equal(grantAllows(live, "repo.write"), true, "a live approval at the moment of the grant does grant");
  });
  await t.test("\xA75 nothing is silently dropped \u2014 unknown asks are refused by name", () => {
    const grant = narrowGrant({
      ownerA: A,
      ownerB: B,
      at: AT,
      standing: "selfimpulseed",
      requested: ["repo.read", "repo.read", "root.everything", "REPO.READ", "  test.run  "]
    });
    assert.deepEqual(grant.granted, ["repo.read", "test.run"], "duplicates collapse; surrounding space is trimmed");
    assert.equal(grant.refused.length, 2, "the unknown ask and the mis-cased ask are both answered");
    assert.equal(refusalFor(grant, "root.everything")?.rule, "not-a-capability");
    assert.equal(refusalFor(grant, "REPO.READ")?.rule, "not-a-capability", "capability names are exact \u2014 no fuzzy matching near a permission");
    assert.match(refusalFor(grant, "root.everything")?.why ?? "", /not withheld — it is unknown/);
    assert.equal(refusalSummary(grant).length, 2);
    for (const line of refusalSummary(grant)) assert.match(line, /withheld \(/);
  });
  await t.test("\xA76 the grant is an artefact: deterministic, complete and secret-free", () => {
    const input = { ownerA: A, ownerB: B, requested: ["repo.read", "repo.write"], standing: "proven", at: AT, approvals: [{ capability: "repo.write", approvalId: "appr-w", at: AT }] };
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
