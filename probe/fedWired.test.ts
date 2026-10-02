/**
 * probe/fedWired.test.ts — THE PRODUCTION FEDERATION PATH, PINNED (19.6.6).
 *
 * 19.6.4 shipped standing.ts, ledger.ts and regulatedPolicy.ts probed as
 * subsystems. 19.6.6 puts them ON the path the console actually runs:
 * src/engine/federation/live.ts is the seam — issue the grant once, spend it
 * per crossing, compare both stores into one common ledger, and keep the
 * regulated bench unrouted until a signed activation exists.
 *
 * The semantics pinned here are the shipped ones, stated plainly:
 *   • a standing grant never overrides earned pair standing — the tier is
 *     read from co-signed history (the mesh trust store, plus the federation
 *     ledger's jointly-held rows, plus the live grant itself, each counted
 *     as one trust unit through the mesh's own ladder);
 *   • a grant that does not cover a crossing escalates to a per-crossing
 *     human decision — escalation is designed behaviour, not an error;
 *   • the common ledger rides every outcome, refused rows included.
 *
 * Every test calls the same functions the UI calls. A localStorage shim
 * keeps the stores honest inside Node; the production modules read storage
 * only at call time, so the shim is in place before anything touches it.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as path from "node:path";

declare const SI_ROOT: string | undefined;
const ROOT = typeof SI_ROOT === "string" && SI_ROOT.length > 0 ? SI_ROOT : process.cwd();

/* localStorage shim — call-time reads only, so order is safe */
const shimStore = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => (shimStore.has(k) ? shimStore.get(k)! : null),
  setItem: (k: string, v: string) => { void shimStore.set(k, String(v)); },
  removeItem: (k: string) => { shimStore.delete(k); },
};

import {
  issueLiveGrant, revokeLiveGrant, runLiveCrossing, liveGrant, liveUsage, liveLedgerView,
  liveOwnerKeys, liveOwnerIdentity, loadRegulatedActivation, enableRegulatedBench,
  regulatedRoutingVerdict, liveStandingFor, DELEGATION_CAPABILITIES,
  FED_LIVE_GRANT, FED_LIVE_USAGE, REGULATED_ACTIVATION_KEY,
} from "../src/engine/federation/live";
import { verifyStandingGrant, standingDigest, STANDING_NOT_ATTESTED } from "../src/engine/federation/standing";
import { REGULATED_REGISTERED } from "../src/engine/federation/fleet";
import { REGULATED_BATCH_DOMAINS } from "../src/engine/federation/regulatedSpec";
import { pairKey } from "../src/engine/selfimpulseMesh";

const OWNER_A = "SelfImpulse Alpha Owner";
const OWNER_B = "SelfImpulse Beta Owner";
const PAIR = pairKey(OWNER_A, OWNER_B);

test("1 · a standing grant is issued once and signed by both owners", async () => {
  const issued = await issueLiveGrant({
    capabilities: ["data.aggregate", "repo.read", "repo.write"],
    maxCrossings: 6,
    windowMs: 24 * 3600 * 1000,
    windowMax: 6,
    expiresInMs: 30 * 24 * 3600 * 1000,
    initiatorHuman: OWNER_A,
    responderHuman: OWNER_B,
  });
  assert.equal(issued.ok, true, `grant refused: ${issued.refusal ?? ""}`);
  const grant = liveGrant();
  assert.ok(grant, "the issued grant must be stored where the crossing reads it");
  assert.equal(grant.pair, PAIR, "the grant is signed over the order-free pair key");
  assert.ok(grant.signatureInitiator.length > 10 && grant.signatureResponder.length > 10);
  const keys = await liveOwnerKeys();
  const verdict = await verifyStandingGrant(grant, keys.publicKeyPem, keys.publicKeyPem, Date.now());
  assert.equal(verdict.ok, true, `the grant must verify against both owner keys: ${verdict.ok ? "" : verdict.detail}`);
});

test("2 · usage starts at zero, and the grant earns the pair its first trust unit", () => {
  const usage = liveUsage(liveGrant());
  assert.ok(usage);
  assert.equal(usage.initiator.crossings, 0);
  assert.equal(usage.responder.crossings, 0);
  assert.equal(liveStandingFor(PAIR, OWNER_A, OWNER_B), "probation",
    "one co-signed authorisation = one trust unit = probation on the mesh ladder");
});

test("2b · the owner key rides the HARDENED authority seam, never raw storage", async () => {
  const ident = await liveOwnerIdentity();
  assert.equal(ident.security, "session",
    "no keychain and no passphrase in this runtime ⇒ honestly session-scoped, never raw-at-rest");
  const src = readFileSync(path.join(ROOT, "src", "engine", "federation", "live.ts"), "utf8");
  assert.ok(src.includes("authorityOwnerIdentity"), "the seam must resolve keys through the hardened owner-key service");
  assert.ok(!/exportKey\(["']jwk["']\)/.test(src), "no private key is exported to storage by this module");
  assert.ok(!src.includes("vh.fed.live.keys"), "no raw-key localStorage record survives");
});

test("3 · a covered crossing crosses under standing authority", async () => {
  const r = await runLiveCrossing({ capability: "data.aggregate", task: "aggregate the fleet census", ownerA: OWNER_A, ownerB: OWNER_B });
  const o = r.outcome;
  assert.equal(o.status, "crossed", `expected crossed, got ${o.status}: ${o.detail}`);
  assert.equal(o.reason, "crossed");
  assert.ok(o.standing, "a standing crossing must carry its standing record");
  assert.equal(o.standing.grantDigest, standingDigest(liveGrant()!));
  assert.equal(o.standing.acknowledgements.length, 2);
  assert.equal(o.standingSource.shared, true, "one machine playing both sides says so on the receipt");
  assert.ok(o.standing.notice.includes("standing authority"));
  assert.ok(o.detail.includes("approved once"));
  assert.equal(o.standing.notAttested, STANDING_NOT_ATTESTED);
  assert.ok(o.digest.length === 64);
});

test("4 · both stores hold the same joint row, roots agree", () => {
  const rows = liveLedgerView(PAIR);
  assert.equal(rows.length, 1, "exactly one joint row after one crossing");
  const row = rows[0];
  assert.equal(row.seenBy, "both");
  assert.equal(row.disagrees, false);
  assert.ok(row.initiator && row.responder);
  assert.equal(row.initiator.outcomeDigest, row.responder.outcomeDigest);
  assert.ok(row.initiator.initiatorReceipt.length > 0, "a crossed row carries both receipts");
  assert.ok(row.initiator.responderReceipt.length > 0);
});

test("5 · usage advances and is persisted where the next crossing reads it", () => {
  const raw = shimStore.get(FED_LIVE_USAGE);
  assert.ok(raw, "usage must be persisted, not held in memory only");
  const usage = JSON.parse(raw) as { initiator: { crossings: number }; responder: { crossings: number } };
  assert.equal(usage.initiator.crossings, 1);
  assert.equal(usage.responder.crossings, 1);
  assert.equal(liveUsage(liveGrant())?.initiator.crossings, 1);
});

test("6 · jointly-held rows compound the pair's standing up the mesh ladder", async () => {
  const second = await runLiveCrossing({ capability: "repo.read", task: "read back the joint rows", ownerA: OWNER_A, ownerB: OWNER_B });
  assert.equal(second.outcome.status, "crossed", second.outcome.detail);
  assert.equal(liveStandingFor(PAIR, OWNER_A, OWNER_B), "selfimpulseed",
    "grant unit + two jointly-held crossed rows = three trust units = selfimpulseed");
});

test("7 · a capability the grant omits escalates to a human and spends nothing", async () => {
  // re-issue a narrow grant; the pair keeps its earned selfimpulseed standing
  const narrow = await issueLiveGrant({
    capabilities: ["data.aggregate"],
    maxCrossings: 6,
    windowMs: 24 * 3600 * 1000,
    windowMax: 6,
    expiresInMs: 30 * 24 * 3600 * 1000,
    initiatorHuman: OWNER_A,
    responderHuman: OWNER_B,
  });
  assert.equal(narrow.ok, true);
  assert.equal(liveStandingFor(PAIR, OWNER_A, OWNER_B), "selfimpulseed", "earned standing survives a re-issued grant");
  const before = liveUsage(liveGrant())!.initiator.crossings;
  // net.fetch is lent at selfimpulseed, but this grant does not name it
  const r = await runLiveCrossing({ capability: "net.fetch", task: "fetch outside the grant", ownerA: OWNER_A, ownerB: OWNER_B });
  const o = r.outcome;
  assert.equal(o.status, "refused");
  assert.equal(o.reason, "escalated-to-human", `out-of-scope must escalate, got ${o.reason}: ${o.detail}`);
  assert.ok(o.detail.includes("human decision"));
  assert.equal(liveUsage(liveGrant())!.initiator.crossings, before, "an escalated crossing spends no grant budget");
  const rows = liveLedgerView(PAIR);
  assert.equal(rows.length, 3, "the refusal lands on the common ledger too");
  assert.equal(rows[2].disagrees, false);
  assert.equal(rows[2].initiator?.decision, "refused");
});

test("8 · a grant never overrides earned pair standing", async () => {
  // repo.write is ON this grant, but the pair is selfimpulseed, not proven —
  // the local trust floor decides what the selfimpulse lends, not the grant.
  const wide = await issueLiveGrant({
    capabilities: ["data.aggregate", "repo.write"],
    maxCrossings: 6,
    windowMs: 24 * 3600 * 1000,
    windowMax: 6,
    expiresInMs: 30 * 24 * 3600 * 1000,
    initiatorHuman: OWNER_A,
    responderHuman: OWNER_B,
  });
  assert.equal(wide.ok, true);
  const r = await runLiveCrossing({ capability: "repo.write", task: "write above our standing", ownerA: OWNER_A, ownerB: OWNER_B });
  assert.equal(r.outcome.status, "refused");
  assert.equal(r.outcome.reason, "initiator-below-standing",
    `the tier floor must hold against the grant: ${r.outcome.reason} — ${r.outcome.detail}`);
  assert.ok(/lends this pair nothing|standing/i.test(r.outcome.detail));
});

test("9 · a spent grant is a human's business, not a retry", async () => {
  const small = await issueLiveGrant({
    capabilities: ["data.aggregate"],
    maxCrossings: 1,
    windowMs: 24 * 3600 * 1000,
    windowMax: 1,
    expiresInMs: 30 * 24 * 3600 * 1000,
    initiatorHuman: OWNER_A,
    responderHuman: OWNER_B,
  });
  assert.equal(small.ok, true);
  const one = await runLiveCrossing({ capability: "data.aggregate", task: "aggregate the census", ownerA: OWNER_A, ownerB: OWNER_B });
  assert.equal(one.outcome.status, "crossed", one.outcome.detail);
  const two = await runLiveCrossing({ capability: "data.aggregate", task: "aggregate again", ownerA: OWNER_A, ownerB: OWNER_B });
  assert.equal(two.outcome.status, "refused");
  assert.equal(two.outcome.reason, "escalated-to-human");
  assert.ok(/spent|exhausted/i.test(two.outcome.detail), `the refusal must name the exhaustion: ${two.outcome.detail}`);
});

test("10 · a revoked grant stops the crossing cold", async () => {
  const grant = liveGrant()!;
  const rev = revokeLiveGrant("initiator", OWNER_A, "owner revoked at the console");
  assert.ok(rev && rev.grantId === grant.grantId);
  const r = await runLiveCrossing({ capability: "data.aggregate", task: "after revocation", ownerA: OWNER_A, ownerB: OWNER_B });
  assert.equal(r.outcome.status, "refused");
  assert.equal(r.outcome.reason, "escalated-to-human");
  assert.ok(r.outcome.detail.includes("revoked"));
});

test("11 · no grant, no approval: refused — never guessed", async () => {
  shimStore.delete(FED_LIVE_GRANT);
  const r = await runLiveCrossing({ capability: "repo.read", task: "nothing standing covers this", ownerA: OWNER_A, ownerB: OWNER_B });
  assert.equal(r.outcome.status, "refused");
  assert.notEqual(r.outcome.reason, "escalated-to-human", "no grant present means the per-crossing path, not a standing escalation");
  assert.ok(/approval|human|owner/i.test(`${r.outcome.reason} ${r.outcome.detail}`));
});

test("12 · regulated ids stay unrouted without a signed activation", async () => {
  shimStore.delete(REGULATED_ACTIVATION_KEY);
  const regId = REGULATED_REGISTERED[0].id;
  assert.ok(regId, "the registered regulated bench must not be empty");
  const empty = await regulatedRoutingVerdict([]);
  assert.equal(empty.ok, true, "no regulated id in the selection means no gate");
  const blocked = await regulatedRoutingVerdict([regId]);
  assert.equal(blocked.ok, false, "a regulated specialist without activation must not pass the router");
  if (!blocked.ok) {
    assert.ok(/authori[sz]ation|authority/i.test(blocked.notice), `the refusal must say a catalogue entry is not authority: ${blocked.notice}`);
    assert.ok(blocked.gaps.length > 0, "every missing requirement is named");
  }
});

test("13 · a signed, complete activation opens the bench", async () => {
  const r = await enableRegulatedBench({
    domains: [REGULATED_BATCH_DOMAINS[0].slug],
    enabledBy: "K. S. Sree Harshen",
    jurisdiction: "IN",
    context: "preparer",
    renewBy: Date.now() + 90 * 24 * 3600 * 1000,
  });
  assert.equal(r.ok, true, `activation refused: ${r.refusal ?? ""}`);
  assert.ok(loadRegulatedActivation()?.signature.startsWith("ecdsa-p256:"));
  const opened = await regulatedRoutingVerdict([REGULATED_REGISTERED[0].id]);
  assert.equal(opened.ok, true, "with a signed complete activation the bench may route");
});

test("14 · tampering with the activation is named, not tolerated", async () => {
  const stored = shimStore.get(REGULATED_ACTIVATION_KEY);
  assert.ok(stored);
  const tampered = JSON.parse(stored) as { context: string };
  tampered.context = "operator";
  shimStore.set(REGULATED_ACTIVATION_KEY, JSON.stringify(tampered));
  const verdict = await regulatedRoutingVerdict([REGULATED_REGISTERED[0].id]);
  assert.equal(verdict.ok, false);
  if (!verdict.ok) assert.ok(/signature/i.test(verdict.notice), `tampering must be named as a signature failure: ${verdict.notice}`);
  shimStore.set(REGULATED_ACTIVATION_KEY, stored);
});

test("15 · the routing path is wired to the regulated gate", () => {
  const src = readFileSync(path.join(ROOT, "src", "engine", "generalist.ts"), "utf8");
  assert.ok(src.includes("regulatedRoutingVerdict(specialists.map((s) => s.id))"), "the generalist must consult the gate over its selected specialists");
  assert.ok(src.includes("regulated activation incomplete"), "the refusal must name the gap");
});

test("16 · the product runs the live seam, not a mock of it (Settings → Federation)", () => {
  const src = readFileSync(path.join(ROOT, "src", "ui", "screens", "Settings.tsx"), "utf8");
  for (const needle of ["issueLiveGrant", "runLiveCrossing", "enableRegulatedBench", "liveLedgerView", "Common ledger"]) {
    assert.ok(src.includes(needle), `Settings must wire ${needle}`);
  }
});

test("17 · the capability vocabulary rides the seam", () => {
  assert.ok(DELEGATION_CAPABILITIES.length >= 10);
  assert.ok(DELEGATION_CAPABILITIES.includes("repo.write"));
  assert.ok(DELEGATION_CAPABILITIES.includes("deploy.release"));
});
