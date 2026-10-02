/**
 * REACH PLANE PROBE — Agent Reach MCP + the wired computer-use plane (19.5.3)
 *
 * Review-hardened: owner-granted issuance is gated; run attestations match
 * actual execution; bindings commit to mandate digests; browser sessions
 * persist per mission but adopt upgraded bindings; private keys never touch
 * disk plaintext (encrypted-at-rest keystore).
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { reachMcpServerInfo, reachMcpCall } from "../src/engine/reachMcp";
import {
  issueMissionMandate, attestMissionRun, recordMissionAuthority,
  verifyMissionAuthorityRecord, authorityOwnerIdentity, AUTHORITY_OWNER_FALLBACK,
} from "../src/engine/missionAuthority";
import { mandateCanonical, type Mandate } from "../src/engine/authorityCore";
import { sha256HexWeb, verifyMandateWeb } from "../src/engine/authorityWeb";
import { createHash } from "node:crypto";
import { missionBrowser, endMissionBrowser, type BrowserTransport } from "../src/engine/computerUse";
import { encryptedOwnerStorage } from "../src/engine/ownerKeyStore";
import { memberToolIds } from "../src/engine/agentLoop";
import { TOOLS, executeTool, toolsForCategory } from "../src/engine/tools";
import { askSelfImpulse19 } from "../src/engine/generalist";
import { getSpecialist } from "../src/engine/registry";

const sha256 = (t: string) => createHash("sha256").update(t).digest("hex");
const GATE_OK = async () => ({ approved: true, reason: "probe approves" });
const GATE_NO = async () => ({ approved: false, reason: "probe declines" });
const nodeishRun = (bin: string, args: string[]) => ({ status: 0, timedOut: false, stdout: `${bin} ${args.join(" ")}`, stderr: "" });
const memStore = () => { let v: string | null = null; return { get: () => v, set: (x: string) => { v = x; } }; };

test("Agent Reach MCP — primary default server, governed computer-use", async (t) => {
  await t.test("the server self-describes as PRIMARY + default with six tools", () => {
    const info = reachMcpServerInfo();
    assert.equal(info.name, "Agent Reach MCP");
    assert.equal(info.primary, true);
    assert.equal(info.default, true);
    assert.equal(info.tools.length, 6);
    assert.ok(info.tools.some((x) => x.name === "pc.exec"));
    assert.ok(info.tools.some((x) => x.name === "authority.verify"));
  });

  await t.test("risky tools never run without a human gate", async () => {
    const r = await reachMcpCall("pc.exec", { binary: "ls" }, { missionId: "m-exec" });
    assert.equal(r.ok, false);
    assert.equal(r.decision, "gated-out");
  });

  await t.test("gate denial is recorded as gated-out, nothing executed", async () => {
    const r = await reachMcpCall("pc.exec", { binary: "ls" }, { missionId: "m-exec", gate: GATE_NO, run: nodeishRun });
    assert.equal(r.decision, "gated-out");
    assert.match(r.output, /declined/);
  });

  await t.test("gate approval + allowlisted binary executes and carries a receipt", async () => {
    const r = await reachMcpCall("pc.exec", { binary: "ls", args: ["-la"] }, { missionId: "m-exec", gate: GATE_OK, run: nodeishRun });
    assert.equal(r.ok, true);
    assert.equal(r.decision, "executed");
    assert.ok(r.receipt && (r.receipt as { digest: string }).digest.length === 64, "receipt digest present");
  });

  await t.test("a non-allowlisted binary is refused even with the gate open", async () => {
    const r = await reachMcpCall("pc.exec", { binary: "rm", args: ["-rf", "/"] }, { missionId: "m-exec", gate: GATE_OK, run: nodeishRun });
    assert.equal(r.decision, "refused");
    assert.match(r.output, /allowlist/);
  });

  await t.test("injection payloads inside pc.exec are refused", async () => {
    const r = await reachMcpCall("pc.exec", { binary: "echo", args: ["$(whoami)"] }, { missionId: "m-exec", gate: GATE_OK, run: nodeishRun });
    assert.equal(r.decision, "refused");
    assert.match(r.output, /injection|metacharacters/i);
  });

  await t.test("pc.browser rides the CENTRAL egress guard (SSRF/private refused)", async () => {
    endMissionBrowser("m-egress");
    const local = await reachMcpCall("pc.browser.open", { url: "https://127.0.0.1/admin" }, { missionId: "m-egress", gate: GATE_OK });
    assert.equal(local.decision, "refused");
    assert.match(local.output, /egress guard/);
    const meta = await reachMcpCall("pc.browser.open", { url: "https://169.254.169.254/latest" }, { missionId: "m-egress", gate: GATE_OK });
    assert.equal(meta.decision, "refused");
    assert.match(meta.output, /egress guard|metadata/i);
    endMissionBrowser("m-egress");
  });

  await t.test("pc.browser.open refuses non-HTTPS", async () => {
    endMissionBrowser("m-web");
    const bad = await reachMcpCall("pc.browser.open", { url: "http://plain.example" }, { missionId: "m-web", gate: GATE_OK });
    assert.equal(bad.decision, "refused");
    assert.match(bad.output, /HTTPS-by-policy/);
    endMissionBrowser("m-web");
  });

  await t.test("pc.browser.open executes via injected transport", async () => {
    endMissionBrowser("m-web2");
    const fake: BrowserTransport = {
      open: async (url: string) => ({ url, status: 200, title: "A", bodyText: "hello", links: [], images: [] }),
      act: async (s) => s,
    };
    const ok = await reachMcpCall("pc.browser.open", { url: "https://example.com/a" }, { missionId: "m-web2", gate: GATE_OK, transport: fake });
    assert.equal(ok.ok, true);
    assert.match(ok.output, /loaded https:\/\/example.com\/a/);
    endMissionBrowser("m-web2");
  });

  await t.test("unknown tool names refuse honestly with the surface list", async () => {
    const r = await reachMcpCall("pc.format_disk", {}, { missionId: "m-exec", gate: GATE_OK });
    assert.equal(r.decision, "refused");
    assert.match(r.output, /unknown tool/);
  });
});

test("portable authority — owner-granted, attested runs, durable identity", async (t) => {
  await t.test("issue → verify round-trip with the public key alone", async () => {
    const store = memStore();
    const ident = await authorityOwnerIdentity({ storage: store });
    const m = await issueMissionMandate({ missionId: "m-roundtrip", scope: ["pc.exec", "fs.read"] }, { storage: store });
    const r = await verifyMandateWeb(m, ident.keys.publicKeyPem);
    assert.equal(r.ok, true);
    assert.ok(m.scope.includes("pc.exec"));
  });

  await t.test("empty or out-of-set scope is REFUSED — authority is never self-issued broad", async () => {
    const empty = await reachMcpCall("authority.issue", { missionId: "m-empty", scope: [] }, { missionId: "m-empty", gate: GATE_OK });
    assert.equal(empty.decision, "refused");
    assert.match(empty.output, /explicit non-empty scope/);
    const dropped = await reachMcpCall("authority.issue", { missionId: "m-bad", scope: ["fs.read", "rm.root"] }, { missionId: "m-bad", gate: GATE_OK });
    assert.equal(dropped.decision, "refused");
    assert.match(dropped.output, /outside the issuable set/);
  });

  await t.test("authority.issue is OWNER-GATED: no gate, nothing issued", async () => {
    const r = await reachMcpCall("authority.issue", { missionId: "m-nogate", scope: ["fs.read"] }, { missionId: "m-nogate" });
    assert.equal(r.decision, "gated-out");
    assert.equal(r.ok, false);
  });

  await t.test("authority.issue + authority.verify through the MCP surface (gate + explicit scope)", async () => {
    const ident = await authorityOwnerIdentity();
    const issued = await reachMcpCall("authority.issue", { missionId: "m-surface", scope: ["pc.browser", "wiki.search"], budgetCap: 10 }, { missionId: "m-surface", gate: GATE_OK });
    assert.equal(issued.ok, true);
    const mandate = issued.receipt as Mandate;
    assert.deepEqual(mandate.scope, ["pc.browser", "wiki.search"]);
    assert.equal(mandate.budgetCap, 10);
    const verified = await reachMcpCall("authority.verify", { mandate: issued.receipt, publicKeyPem: ident.keys.publicKeyPem }, { missionId: "m-surface" });
    assert.equal(verified.ok, true, verified.output);
  });

  await t.test("budget and depth CLAMP — an owner grant can never exceed the caps", async () => {
    const issued = await reachMcpCall("authority.issue", { missionId: "m-clamp", scope: ["fs.read"], budgetCap: 99999, maxDepth: 42 }, { missionId: "m-clamp", gate: GATE_OK });
    const m = issued.receipt as Mandate;
    assert.equal(m.budgetCap, 100);
    assert.equal(m.maxDepth, 1);
  });

  await t.test("RUN ATTESTATION — scope is exactly what executed, nothing more", async () => {
    const m = await attestMissionRun({ missionId: "m-attest", executedTools: ["fs.read", "fs.read", "pc.exec", "net.fetch"] });
    assert.ok(m, "executed tools ⇒ attestation minted");
    assert.deepEqual(m!.scope, ["fs.read", "net.fetch", "pc.exec"], "deduped, sorted, exactly the executed classes");
    assert.equal(m!.budgetCap, 4, "budget = total executed actions");
    assert.equal(m!.maxDepth, 0, "attestations never delegate");
    const none = await attestMissionRun({ missionId: "m-attest-none", executedTools: [] });
    assert.equal(none, null, "nothing executed ⇒ NO authority minted — provenance without pretend permission");
  });

  await t.test("authority.verify refuses the wrong public key", async () => {
    const issued = await reachMcpCall("authority.issue", { missionId: "m-wrong", scope: ["fs.read"] }, { missionId: "m-wrong", gate: GATE_OK });
    const bad = await reachMcpCall("authority.verify", { mandate: issued.receipt, publicKeyPem: "-----BEGIN PUBLIC KEY-----\nMFkw\n-----END PUBLIC KEY-----" }, { missionId: "m-wrong" });
    assert.equal(bad.ok, false);
  });

  await t.test("ONE mandate: ledger stores the exact object; verification RECOMPUTES the digest", async () => {
    const digest = "e".repeat(64);
    const mandate = await issueMissionMandate({ missionId: "m-bind", scope: ["fs.read"] });
    const mandateDigest = sha256(mandateCanonical(mandate));
    const ident = await authorityOwnerIdentity();
    const rec = await recordMissionAuthority("m-bind", digest, mandate, mandateDigest, ident.keys.publicKeyPem);
    assert.equal(rec.mandate, mandate, "the ledger stores the exact issued object");
    assert.equal(rec.mandateDigest, mandateDigest);
    assert.equal(await verifyMissionAuthorityRecord(rec, mandateDigest), true);
    assert.equal(await verifyMissionAuthorityRecord(rec, "0".repeat(64)), false, "a different expected digest breaks the record");
    /* swap the stored mandate but keep its digest — recomputation catches it */
    const swapped = { ...rec, mandate: { ...mandate, budgetCap: mandate.budgetCap + 1 } };
    assert.equal(await verifyMissionAuthorityRecord(swapped, mandateDigest), false, "stored mandate must re-hash to the stored digest");
    /* swap the response digest — the binding (which commits to the mandate) catches it */
    const tampered = { ...rec, responseDigest: "9".repeat(64) };
    assert.equal(await verifyMissionAuthorityRecord(tampered, mandateDigest), false);
  });

  await t.test("durable identity: a persisted keypair reloads — no fresh anonymous owner per runtime", async () => {
    const store = memStore();
    const first = await authorityOwnerIdentity({ storage: store, identity: "sree-harshen" });
    assert.equal(first.owner, "sree-harshen");
    const readOnly = { get: store.get, set: () => { throw new Error("must not re-mint"); } };
    const reloaded = await authorityOwnerIdentity({ storage: readOnly, identity: "sree-harshen" });
    assert.equal(reloaded.keys.publicKeyPem, first.keys.publicKeyPem, "reload returns the SAME public key");
    assert.equal(reloaded.persisted, true);
    void AUTHORITY_OWNER_FALLBACK;
  });

  await t.test("authority.issue enforces MISSION-CONTEXT equality", async () => {
    const r = await reachMcpCall("authority.issue", { missionId: "some-other-mission", scope: ["fs.read"] }, { missionId: "m-ctx", gate: GATE_OK });
    assert.equal(r.decision, "refused");
    assert.match(r.output, /does not match/);
  });

  await t.test("WRONG PASSPHRASE is a hard unlock failure — sealed keys are never replaced", async () => {
    const base = memStore();
    const right = await encryptedOwnerStorage(base, "right passphrase");
    const ident1 = await authorityOwnerIdentity({ storage: right, identity: "sealed-owner" });
    right.set(JSON.stringify({ byOwner: { "sealed-owner": { priv: {}, pem: ident1.keys.publicKeyPem } } }));
    await new Promise((r) => setTimeout(r, 2000));
    const blobBefore = base.get();
    assert.ok(blobBefore, "a sealed blob exists");
    const wrong = await encryptedOwnerStorage(base, "wrong passphrase");
    assert.equal(wrong.sealed, true, "failed decrypt flags the store as sealed");
    assert.equal(wrong.get(), null);
    const ident2 = await authorityOwnerIdentity({ storage: wrong, identity: "sealed-owner" });
    assert.equal(ident2.unlockFailed, true, "the identity honestly reports a failed unlock");
    assert.equal(ident2.persisted, false, "no key was persisted on a failed unlock");
    wrong.set("attacker material");
    assert.equal(base.get(), blobBefore, "the sealed blob is byte-identical — never replaced");
  });

  await t.test("encrypted keystore: private keys persist ONLY sealed by the passphrase", async () => {
    const base = memStore();
    const sealed = await encryptedOwnerStorage(base, "correct horse battery staple");
    sealed.set(JSON.stringify({ byOwner: { probe: { priv: {}, pem: "x" } } }));
    await new Promise((r) => setTimeout(r, 2000)); // PBKDF2 envelope write is async
    assert.ok(base.get(), "something was written");
    assert.ok(!(base.get() as string).includes("byOwner"), "the stored blob is NOT plaintext key material");
    const reopened = await encryptedOwnerStorage(base, "correct horse battery staple");
    assert.ok(reopened.get()?.includes("byOwner"), "the right passphrase opens the envelope");
    const wrong = await encryptedOwnerStorage(base, "wrong passphrase");
    assert.equal(wrong.get(), null, "a wrong passphrase yields nothing, never plaintext");
  });
});

test("SelfImpulse pipeline — the plane is wired, not an island", async (t) => {
  await t.test("the eight-tool surface lists pc.exec + pc.browser + mcp.call as risky", () => {
    assert.equal(TOOLS.length, 8);
    assert.equal(TOOLS.some((t) => t.id === "mcp.call" && t.riskTier === "risky"), true);
    const pc = TOOLS.filter((x) => x.id.startsWith("pc."));
    assert.equal(pc.length, 2);
    for (const x of pc) assert.equal(x.riskTier, "risky");
  });

  await t.test("pc tools are never category-bound (mission ctx only)", () => {
    const cats = ["code", "research", "data", "design"] as const;
    for (const c of cats) {
      assert.ok(!toolsForCategory(c).some((x) => x.startsWith("pc.")), `pc tools must not bind to ${c}`);
    }
  });

  await t.test("executeTool refuses pc tools without a mission pc context", async () => {
    const r = await executeTool("pc.exec", { binary: "ls" }, { gate: async () => ({ approved: true, reason: "probe approves" }) });
    assert.equal(r.outcome, "refused");
    assert.match(r.output, /not attached/);
  });

  await t.test("reach missions ADVERTISE pc tools to member protocols (capability policy)", () => {
    const plain = memberToolIds("code");
    assert.ok(!plain.includes("pc.exec"), "no pc plane attached ⇒ no pc tools advertised");
    const reach = memberToolIds("code", { pc: { missionId: "m-x" } });
    assert.ok(reach.includes("pc.exec") && reach.includes("pc.browser"), "pc plane attached ⇒ pc tools advertised to the member");
  });

  await t.test("the mission browser session persists AND adopts upgraded bindings", () => {
    endMissionBrowser("m-session");
    const a = missionBrowser("m-session");
    const b = missionBrowser("m-session");
    assert.equal(a, b, "same mission ⇒ same live browser instance");
    assert.notEqual(a, missionBrowser("m-other"), "different mission ⇒ isolated session");
    const fake: BrowserTransport = { open: async (u: string) => ({ url: u, status: 200, title: "t", bodyText: "", links: [], images: [] }), act: async (s) => s };
    const c = missionBrowser("m-session", fake);
    assert.equal(c, a, "still the same session object");
    assert.equal(c.transport, fake, "an explicitly-provided transport UPGRADES the live session — stale bindings never win");
    endMissionBrowser("m-session");
    endMissionBrowser("m-other");
  });

  await t.test("a toolless SelfImpulse run carries NO authority — attestation, not permission", async () => {
    const specialist = getSpecialist("code.typescript");
    assert.ok(specialist, "registry has code.typescript");
    const res = await askSelfImpulse19({ text: "review the diff for regressions", userId: "reach-probe" });
    assert.equal(res.authority, null, "no tools executed ⇒ no mandate minted; broad self-grants are gone");
    assert.match(res.provenanceDigest, /^[0-9a-f]{64}$/, "provenance stands on its own");
  });
});
