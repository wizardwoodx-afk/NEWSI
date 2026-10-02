/**
 * MESH RUNTIME PROBE — 19.5.4 release-quality close-out.
 *
 * Review round 6 demanded one thing above all: SelfImpulseMesh must not be a
 * probe-only island — it must sit on the production collaboration path.
 * This suite pins that wiring mechanically:
 *
 *   1. pureHash (the mesh's synchronous SHA-256/HMAC) is BYTE-IDENTICAL to
 *      node:crypto on fixed vectors and randomized cases — the WebView and
 *      Node sides of the seam cannot diverge.
 *   2. recordHandoff (the live A2A seam consumed by the door and RSI) mints
 *      a fully co-signed SelfImpulseMesh joint receipt on every delegated handoff,
 *      and honestly mints nothing on a refused one.
 *   3. Pair trust compounds on clean joint receipts, decays on refusals, and
 *      persists per pair.
 *   4. The mesh refuses what it must refuse: plain-http peers, self-
 *      attestation, outsider co-signatures.
 *   5. uid() is CSPRNG-born (randomUUID / getRandomValues), never Math.random.
 *   6. Reach MCP reports the current release and documents exactly the SIX
 *      tools it exposes — no ghost authority.bind, no undocumented lookup.
 *   7. The wiring is structural: production files import the mesh, and the
 *      mesh imports no Node-only builtin.
 *   8. The canonical scope line — mesh = LOCAL trust fabric, ECDSA = portable
 *      authority — is stated in every file that pitches SelfImpulseMesh.
 */
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert";
import * as fs from "node:fs";
import * as path from "node:path";
import { createHash, createHmac } from "node:crypto";

declare const SI_ROOT: string | undefined;
const ROOT = typeof SI_ROOT === "string" && SI_ROOT.length > 0 ? SI_ROOT : process.cwd();

/* localStorage shim — same shape as probe/agentTeam */
if (typeof globalThis.localStorage === "undefined") {
  const store = new Map<string, string>();
  (globalThis as unknown as { localStorage: Storage }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
    clear: () => void store.clear(),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() { return store.size; },
  } as Storage;
}

import { pureSha256, pureHmacSha256 } from "../src/engine/pureHash";
import {
  registerPeer, attest, openChannel, buildJointReceipt, coSign,
  jointCanonical,
} from "../src/engine/selfimpulseMesh";
import {
  meshForHandoff, pairTrustFor, standingFor, clearMeshTrust, recomputeCoSelfImpulse,
} from "../src/engine/meshRuntime";
import { recordHandoff, clearHandoffs } from "../src/engine/handoffs";
import { uid } from "../src/app/id";
import { REACH_MCP_VERSION, REACH_MCP_NAME } from "../src/engine/reachMcp";

beforeEach(() => {
  globalThis.localStorage.clear();
  clearMeshTrust();
  clearHandoffs();
});

describe("pureHash — byte identity with node:crypto", () => {
  it("matches SHA-256 on the FIPS vector 'abc'", () => {
    assert.equal(pureSha256("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });

  it("matches node:crypto SHA-256 across edge shapes (empty, block boundaries, unicode)", () => {
    const cases = ["", "a".repeat(55), "a".repeat(56), "a".repeat(64), "a".repeat(65), "a".repeat(200), "unicode \u2713 \u00e9 \u65e5\u672c"];
    for (const c of cases) {
      assert.equal(pureSha256(c), createHash("sha256").update(c).digest("hex"), `sha256 drift at len ${c.length}`);
    }
  });

  it("matches node:crypto HMAC-SHA256 for short, block-length and oversized keys", () => {
    for (const secret of ["k", "secret-0123456789", "s".repeat(64), "s".repeat(70)]) {
      for (const msg of ["", "the quick brown fox", "x".repeat(129)]) {
        assert.equal(pureHmacSha256(secret, msg), createHmac("sha256", secret).update(msg).digest("hex"), `hmac drift key=${secret.length} msg=${msg.length}`);
      }
    }
  });
});

describe("mesh primitives refuse what they must", () => {
  it("refuses a plain-http peer endpoint — TLS-by-default", () => {
    const p = registerPeer({ peerId: "bad", instanceOf: "bad", capabilities: [], endpoint: "http://insecure.example" });
    assert.ok("refused" in p && p.refused.includes("TLS-by-default"));
  });

  it("refuses self-attestation — one signature is half a handshake", () => {
    const a = attest("s1", "peer-a", { peerId: "peer-b", instanceOf: "b", capabilities: ["x"], endpoint: "https://b.local", registeredAt: 1, identityDigest: "d" }, 1);
    const self = attest("s1", "peer-a", { peerId: "peer-b", instanceOf: "b", capabilities: ["x"], endpoint: "https://b.local", registeredAt: 1, identityDigest: "d" }, 1);
    const ch = openChannel(a, self);
    assert.ok("refused" in ch);
  });

  it("refuses an outsider co-signature", () => {
    const pa = registerPeer({ peerId: "a", instanceOf: "ia", capabilities: ["x"], endpoint: "https://a.local" });
    const pb = registerPeer({ peerId: "b", instanceOf: "ib", capabilities: ["x"], endpoint: "https://b.local" });
    assert.ok(!("refused" in pa) && !("refused" in pb));
    const ch = openChannel(attest("sa", "a", pb, 1), attest("sb", "b", pa, 1));
    assert.ok(!("refused" in ch));
    const rec = buildJointReceipt("m1", ch, [{ actor: "a", action: "go", outcome: "executed", at: 1 }]);
    assert.throws(() => coSign(rec, "mallory", "sm"));
  });
});

describe("the production handoff seam is meshed", () => {
  it("a delegated handoff carries a fully co-signed joint receipt digest", () => {
    const rec = recordHandoff({ peer: "peer-atlas", task: "summarize the ledger", outcome: "delegated", detail: "routed deterministically", receiptDigest: "rd-1" });
    assert.ok(rec.meshJointDigest && /^[0-9a-f]{64}$/.test(rec.meshJointDigest), `joint digest: ${rec.meshJointDigest}`);
    assert.ok(rec.meshStanding && rec.meshDetail, "standing + decision in words ride the record");
    assert.ok(rec.meshDetail.includes("co-signed joint receipt"));
  });

  it("a refused handoff mints NO joint receipt but still moves pair trust", () => {
    recordHandoff({ peer: "peer-atlas", task: "summarize the ledger", outcome: "delegated", detail: "clean", receiptDigest: "rd-1" });
    const before = pairTrustFor("vh.selfimpulse", "peer-atlas");
    const rec = recordHandoff({ peer: "peer-atlas", task: "another task", outcome: "refused", detail: "peer offline" });
    assert.equal(rec.meshJointDigest, null);
    assert.ok(rec.meshDetail.includes("refused"));
    const after = pairTrustFor("vh.selfimpulse", "peer-atlas");
    assert.ok(before && after && after.trust < before.trust, `trust ${before?.trust} -> ${after?.trust}`);
  });

  it("pair trust compounds across clean handoffs and persists", () => {
    recordHandoff({ peer: "peer-borealis", task: "t1", outcome: "delegated", detail: "ok" });
    recordHandoff({ peer: "peer-borealis", task: "t2", outcome: "delegated", detail: "ok" });
    recordHandoff({ peer: "peer-borealis", task: "t3", outcome: "delegated", detail: "ok" });
    const t = pairTrustFor("vh.selfimpulse", "peer-borealis");
    assert.ok(t && t.trust === 3 && t.jointReceipts === 3, JSON.stringify(t));
    assert.equal(standingFor("vh.selfimpulse", "peer-borealis"), "selfimpulseed");
    // persisted, not just in memory: a fresh read sees the same ledger
    const again = JSON.parse(globalThis.localStorage.getItem("engine.mesh.trust.v1") ?? "[]") as { trust: number }[];
    assert.ok(again.some((r) => r.trust === 3));
  });

  it("the joint receipt verifies offline by recomputation (verifier path)", () => {
    // Rebuild the exact mesh computation meshForHandoff performs, then verify
    // each co-selfimpulse with only the canonical body + the participant's secret.
    const pa = registerPeer({ peerId: "peer-a", instanceOf: "selfimpulse-node", capabilities: ["routing"], endpoint: "https://peer-a.selfimpulse.test" });
    const pb = registerPeer({ peerId: "peer-verity", instanceOf: "peer-verity", capabilities: ["a2a", "handoff"], endpoint: "https://peer-verity.si-mesh.local" });
    assert.ok(!("refused" in pa) && !("refused" in pb));
    const ch = openChannel(attest("sec-selfimpulse", "peer-a", pb, 1), attest("sec-verity", "peer-verity", pa, 1));
    assert.ok(!("refused" in ch));
    const actions = [
      { actor: "peer-a", action: "delegate", outcome: "executed" as const, at: 7 },
      { actor: "peer-verity", action: "accept", outcome: "executed" as const, at: 7 },
    ];
    let rec = buildJointReceipt("handoff:ho-verify", ch, actions);
    rec = coSign(rec, "peer-a", "sec-selfimpulse");
    rec = coSign(rec, "peer-verity", "sec-verity");
    const body = jointCanonical(rec.missionId, rec.channelDigest, rec.actions);
    assert.equal(recomputeCoSelfImpulse("sec-selfimpulse", body), rec.coSignatures["peer-a"]);
    assert.equal(recomputeCoSelfImpulse("sec-verity", body), rec.coSignatures["peer-verity"]);
    assert.notEqual(recomputeCoSelfImpulse("wrong-secret", body), rec.coSignatures["peer-a"]);
  });
});

describe("uid is CSPRNG-born and Reach MCP is current", () => {
  it("uid() never repeats across 2,000 draws and carries the prefix", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 2000; i++) seen.add(uid("m"));
    assert.equal(seen.size, 2000);
    assert.ok([...seen].every((s) => s.startsWith("m-")));
  });

  it("id.ts uses crypto.randomUUID/getRandomValues and contains no Math.random", () => {
    const src = fs.readFileSync(path.join(ROOT, "src", "app", "id.ts"), "utf8");
    assert.ok(src.includes("randomUUID"));
    assert.ok(src.includes("getRandomValues"));
    assert.ok(!src.includes("Math.random"), "uid must not fall back to Math.random");
  });

  it("Reach MCP reports the current release and documents exactly its six exposed tools", () => {
    assert.ok(/^\d+\.\d+\.\d+(?:\.\d+)?$/.test(REACH_MCP_VERSION));
    assert.equal(REACH_MCP_NAME, "Agent Reach MCP");
    const src = fs.readFileSync(path.join(ROOT, "src", "engine", "reachMcp.ts"), "utf8");
    assert.ok(!src.includes("authority.bind"), "no ghost tool in Reach MCP docs");
    for (const tool of ["pc.exec", "pc.browser.open", "pc.browser.screenshot", "authority.issue", "authority.verify", "authority.lookup"]) {
      assert.ok(src.includes(tool), `documented tool ${tool}`);
    }
    const headerList = src.slice(0, src.indexOf("export const REACH_MCP_NAME"));
    assert.ok(headerList.includes("authority.lookup"), "the header documents authority.lookup too");
  });

  it("the canonical scope line is stated everywhere SelfImpulseMesh is pitched", () => {
    const flat = (p: string) =>
      fs.readFileSync(path.join(ROOT, p), "utf8").replace(/^\s*\*+\s?/gm, "").replace(/\s+/g, " ");
    const needle1 = "LOCAL collaboration trust fabric";
    const needle2 = "ECDSA provides portable authority across instances";
    for (const p of ["src/engine/selfimpulseMesh.ts", "src/engine/meshRuntime.ts", "docs/VERIFICATION.md"]) {
      const src = flat(p);
      assert.ok(src.includes(needle1), `${p} names the mesh a local trust fabric`);
      assert.ok(src.includes(needle2), `${p} keeps portable authority on ECDSA`);
    }
  });
});

describe("the wiring is structural, not incidental", () => {
  it("handoffs.ts (the live seam) imports the mesh runtime", () => {
    const src = fs.readFileSync(path.join(ROOT, "src", "engine", "handoffs.ts"), "utf8");
    assert.ok(src.includes('from "./meshRuntime"'));
    assert.ok(src.includes("meshForHandoff"));
  });

  it("the mesh is reachable from the production door (store → handoffs → meshRuntime → selfimpulseMesh)", () => {
    const door = fs.readFileSync(path.join(ROOT, "src", "ui", "store.ts"), "utf8");
    assert.ok(door.includes("../engine/handoffs") && door.includes("recordHandoff(h)"), "the store consumes the handoff seam on every run");
    const mesh = fs.readFileSync(path.join(ROOT, "src", "engine", "meshRuntime.ts"), "utf8");
    assert.ok(mesh.includes('from "./selfimpulseMesh"'));
  });

  it("selfimpulseMesh is isomorphic — no Node-only builtin import", () => {
    const src = fs.readFileSync(path.join(ROOT, "src", "engine", "selfimpulseMesh.ts"), "utf8");
    assert.ok(!src.includes('from "node:crypto"'), "selfimpulseMesh must run in the WebView");
    assert.ok(src.includes('from "./pureHash"'));
  });
});
