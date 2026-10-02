/**
 * probe/reachPairMemory.test.ts — what two selfimpulses learned together.
 *
 * The org already remembers missions, teams, agents, artefacts, decisions and
 * failures (§20/§21 memory) and the blackboard already versions shared state
 * between seats. What this suite pins is the scope the Agent Bridge creates
 * and the old memory cannot honestly serve: a fact that belongs to a PAIR of
 * owners, admitted only with the digest of the joint receipt that witnessed
 * it, superseded append-only so "what did we believe on the day of the
 * incident" stays answerable.
 *
 *   §1 refusals are in words: no key, no value, no why, and never a secret
 *   §2 pair/org facts are receipt-bound — a rumour cannot be filed
 *   §3 pair identity IS SelfImpulseMesh's pairKey; there is no second notion of pair
 *   §4 supersession never deletes; history and asOf reconstruct any instant
 *   §5 a bounded read reports what it withheld
 *   §6 every entry digest re-derives, and the log digest moves when a row moves
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  RECEIPT_BOUND_SCOPES, looksLikeSecret, remember, resolve, history, scopeAsOf, cuts,
  memoryDigest, pairMemoryScope, entryDigest, verifyEntry,
  type MemoryEntry,
} from "../src/engine/reach/pairMemory";
import { pairKey } from "../src/engine/selfimpulseMesh";

const DIGEST_A = "a".repeat(64);
const DIGEST_B = "b".repeat(64);
const T = (iso: string) => iso;

function add(log: MemoryEntry[], input: Parameters<typeof remember>[1]): MemoryEntry[] {
  const res = remember(log, input);
  assert.equal(res.ok, true, JSON.stringify(res));
  return res.ok && res.appended ? [...log, res.entry] : log;
}

test("reach pair memory — receipt-bound, append-only, honest about cuts", async (t) => {
  await t.test("§1 refusals are in words, and a credential is never knowledge", () => {
    const noKey = remember([], { id: "m1", scope: "pair", key: "  ", value: "v", why: "w", at: T("2026-09-01T00:00:00Z"), receiptDigest: DIGEST_A });
    assert.equal(noKey.ok, false);
    if (!noKey.ok) assert.match(noKey.reason, /no key/);

    const noValue = remember([], { id: "m2", scope: "agent", key: "k", value: " ", why: "w", at: T("2026-09-01T00:00:00Z") });
    assert.equal(noValue.ok, false);
    if (!noValue.ok) assert.match(noValue.reason, /no value/);

    const noWhy = remember([], { id: "m3", scope: "agent", key: "k", value: "v", why: "", at: T("2026-09-01T00:00:00Z") });
    assert.equal(noWhy.ok, false);
    if (!noWhy.ok) assert.match(noWhy.reason, /no why/);

    const secret = remember([], {
      id: "m4", scope: "agent", key: "rotation", value: "the new key is ghp_abcdefghijklmnopqrstuvwx", why: "rotated", at: T("2026-09-01T00:00:00Z"),
    });
    assert.equal(secret.ok, false);
    if (!secret.ok) assert.match(secret.reason, /looks like a credential/);

    for (const s of ["Bearer abcdefghijklmnop", "password: hunter2hunter2", "-----BEGIN RSA PRIVATE KEY-----", "xoxb-1234567890abcdef"]) {
      assert.equal(looksLikeSecret(s), true, `missed: ${s}`);
    }
    assert.equal(looksLikeSecret("we rotated the deploy credential on tuesday"), false, "talking about a secret is not a secret");
  });

  await t.test("§2 a pair or org fact needs the joint receipt that witnessed it", () => {
    assert.deepEqual(RECEIPT_BOUND_SCOPES, ["pair", "org"]);
    for (const scope of RECEIPT_BOUND_SCOPES) {
      const missing = remember([], { id: "m5", scope, key: "k", value: "v", why: "w", at: T("2026-09-01T00:00:00Z") });
      assert.equal(missing.ok, false);
      if (!missing.ok) assert.match(missing.reason, /joint receipt/);

      const short = remember([], { id: "m6", scope, key: "k", value: "v", why: "w", at: T("2026-09-01T00:00:00Z"), receiptDigest: "abc123" });
      assert.equal(short.ok, false, "a truncated digest is not evidence");
      if (!short.ok) assert.match(short.reason, /64-hex/);

      const upper = remember([], { id: "m7", scope, key: "k", value: "v", why: "w", at: T("2026-09-01T00:00:00Z"), receiptDigest: "A".repeat(64) });
      assert.equal(upper.ok, false, "digests are lower-case hex everywhere else in VH; upper-case here would be a second dialect");
    }
    const runScoped = remember([], { id: "m8", scope: "run", key: "k", value: "v", why: "w", at: T("2026-09-01T00:00:00Z") });
    assert.equal(runScoped.ok, true, "a run fact is witnessed by the run itself");
  });

  await t.test("§3 the pair is SelfImpulseMesh's pair — one identity, not two", () => {
    assert.equal(pairMemoryScope("selfimpulse-a", "selfimpulse-b"), pairKey("selfimpulse-a", "selfimpulse-b"));
    assert.equal(pairMemoryScope("selfimpulse-a", "selfimpulse-b"), pairMemoryScope("selfimpulse-b", "selfimpulse-a"), "the pair key is order-free, like the mesh's");
  });

  await t.test("§4 supersession is append-only; asOf answers on any date", () => {
    const key = pairMemoryScope("selfimpulse-a", "selfimpulse-b");
    let log: MemoryEntry[] = [];
    log = add(log, { id: "e1", scope: "pair", key, value: "the shared staging window is tuesday 09:00", why: "agreed in the joint run", at: T("2026-09-01T09:00:00Z"), receiptDigest: DIGEST_A });
    log = add(log, { id: "e2", scope: "pair", key, value: "the shared staging window moved to thursday 14:00", why: "second joint run re-negotiated it", at: T("2026-09-10T09:00:00Z"), receiptDigest: DIGEST_B });

    assert.equal(log.length, 2, "both rows survive — nothing is deleted on supersede");
    assert.equal(log[1].supersedes, "e1", "the newer row names the row it replaces");
    assert.equal(history(log, "pair", key).length, 2);

    const before = resolve(log, "pair", key, "2026-09-05T00:00:00Z");
    const after = resolve(log, "pair", key, "2026-09-15T00:00:00Z");
    assert.equal(before?.value, "the shared staging window is tuesday 09:00", "we believed the old window on the 5th");
    assert.equal(after?.value, "the shared staging window moved to thursday 14:00");
    assert.equal(resolve(log, "pair", key, "2026-09-10T09:00:00Z")?.id, "e2", "asOf is inclusive at the instant of the write");
    assert.equal(resolve(log, "pair", key, "2026-08-01T00:00:00Z"), null, "before the first fact, we knew nothing — and it says so");
  });

  await t.test("§4b a repeat of what is already current is not a new belief", () => {
    const log = add([], { id: "e1", scope: "agent", key: "style", value: "two-space indent", why: "house style", at: T("2026-09-01T00:00:00Z") });
    const again = remember(log, { id: "e2", scope: "agent", key: "style", value: "two-space indent", why: "house style", at: T("2026-09-02T00:00:00Z") });
    assert.equal(again.ok, true);
    if (again.ok) {
      assert.equal(again.appended, false);
      assert.match(again.reason, /already current/);
      assert.equal(again.entry.id, "e1", "the existing row is returned; no duplicate is filed");
    }
  });

  await t.test("§4c a scope as of an instant returns one truth per key", () => {
    let log: MemoryEntry[] = [];
    log = add(log, { id: "o1", scope: "org", key: "retention.policy", value: "90 days", why: "policy v1", at: T("2026-09-01T00:00:00Z"), receiptDigest: DIGEST_A });
    log = add(log, { id: "o2", scope: "org", key: "retention.policy", value: "180 days", why: "policy v2", at: T("2026-09-06T00:00:00Z"), receiptDigest: DIGEST_B });
    log = add(log, { id: "o3", scope: "org", key: "audit.cadence", value: "quarterly", why: "policy v2", at: T("2026-09-06T00:00:00Z"), receiptDigest: DIGEST_B });

    assert.equal(scopeAsOf(log, "org", "2026-09-03T00:00:00Z").length, 1);
    assert.equal(scopeAsOf(log, "org", "2026-09-03T00:00:00Z")[0].value, "90 days");
    const now = scopeAsOf(log, "org", "2026-09-12T00:00:00Z");
    assert.equal(now.length, 2, "two keys, two rows — never two truths for one key");
    assert.equal(now[0].key, "audit.cadence");
  });

  await t.test("§5 a bounded read says what it withheld", () => {
    let log: MemoryEntry[] = [];
    for (let i = 0; i < 7; i++) {
      log = add(log, { id: `c${i}`, scope: "org", key: `fact-${i}`, value: `value ${i}`, why: "test", at: T(`2026-09-0${i + 1}T00:00:00Z`), receiptDigest: DIGEST_A });
    }
    const bounded = cuts(log, 3);
    assert.equal(bounded.shown.length, 3);
    assert.equal(bounded.omitted, 4);
    assert.match(bounded.note, /3 of 7/);
    assert.match(bounded.note, /not deleted/);
    assert.equal(bounded.shown[0].id, "c6", "newest first");

    const all = cuts(log, 50);
    assert.equal(all.omitted, 0);
    assert.match(all.note, /all 7/);

    const none = cuts(log, 0);
    assert.equal(none.shown.length, 0);
    assert.equal(none.omitted, 7, "a zero cut hides everything and admits it");
  });

  await t.test("§6 entry digests re-derive, and an edited row cannot hide behind its stored digest", () => {
    const log = add([], { id: "d1", scope: "org", key: "k", value: "v", why: "w", at: T("2026-09-01T00:00:00Z"), receiptDigest: DIGEST_A });
    const e = log[0];
    assert.equal(e.digest, entryDigest(e), "the stored digest re-derives from the body");
    assert.equal(verifyEntry(e).ok, true);

    const edited: MemoryEntry = { ...e, value: "v2" };
    const verdict = verifyEntry(edited);
    assert.equal(verdict.ok, false, "an edited body no longer matches its stored digest");
    if (!verdict.ok) assert.match(verdict.reason, /edited after it was written/);

    assert.notEqual(
      memoryDigest(log),
      memoryDigest([edited]),
      "the log digest re-derives every body, so a stale stored digest cannot mask an edit",
    );
    assert.equal(memoryDigest(log), memoryDigest([{ ...e }]), "an identical log digests the same");
  });
});
