import { createRequire as __mjCreateRequire } from "node:module"; const require = __mjCreateRequire(import.meta.url);

// probe/reachPairMemory.test.ts
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

// src/engine/reach/pairMemory.ts
var RECEIPT_BOUND_SCOPES = ["pair", "org"];
var HEX64 = /^[0-9a-f]{64}$/;
function looksLikeSecret(text) {
  if (/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}/i.test(text)) return true;
  if (/\b(sk|pk|ghp|gho|glpat|xox[baprs])[-_][A-Za-z0-9_-]{8,}/i.test(text)) return true;
  if (/\bey[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{4,}\b/.test(text)) return true;
  if (/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(text)) return true;
  if (/(password|passwd|secret|api[_-]?key)\s*[:=]\s*\S{6,}/i.test(text)) return true;
  return false;
}
function entryCanonical(e) {
  return [e.id, e.scope, e.key, e.value, e.at, e.supersedes ?? "", e.receiptDigest ?? "", e.why].join("");
}
function entryDigest(entry) {
  const { digest: _stored, ...body } = entry;
  return pureSha256(`vh.reach.memory.entry.v1:${entryCanonical(body)}`);
}
function verifyEntry(entry) {
  const want = entryDigest(entry);
  return entry.digest === want ? { ok: true } : { ok: false, reason: "memory: entry digest does not match its body \u2014 this row was edited after it was written" };
}
function memoryDigest(entries) {
  const body = entries.map((e) => entryDigest(e)).join("|");
  return pureSha256(`vh.reach.pairMemory.v1:${body}`);
}
function pairMemoryScope(a, b) {
  return pairKey(a, b);
}
function remember(log, input) {
  const key = input.key.trim();
  const value = input.value.trim();
  const why = input.why.trim();
  if (key.length === 0) return { ok: false, reason: "memory: no key \u2014 an unaddressable memory cannot be retrieved later" };
  if (value.length === 0) return { ok: false, reason: "memory: no value \u2014 nothing was learned" };
  if (why.length === 0) return { ok: false, reason: "memory: no why \u2014 a memory that cannot say why it exists cannot be audited" };
  if (looksLikeSecret(value) || looksLikeSecret(key)) {
    return { ok: false, reason: "memory: refused \u2014 the entry looks like a credential, and a credential is not knowledge" };
  }
  const digest = input.receiptDigest ?? null;
  if (RECEIPT_BOUND_SCOPES.includes(input.scope)) {
    if (digest === null || !HEX64.test(digest)) {
      return {
        ok: false,
        reason: `memory: a ${input.scope} fact requires the 64-hex digest of the joint receipt that witnessed it`
      };
    }
  }
  const current = resolve(log, input.scope, key, input.at);
  if (current && current.value === value) {
    return { ok: true, appended: false, entry: current, superseded: null, reason: "memory: already current \u2014 nothing was appended" };
  }
  const staged = {
    id: input.id,
    scope: input.scope,
    key,
    value,
    at: input.at,
    supersedes: current ? current.id : null,
    receiptDigest: digest,
    why
  };
  const entry = { ...staged, digest: pureSha256(`vh.reach.memory.entry.v1:${entryCanonical(staged)}`) };
  return { ok: true, appended: true, entry, superseded: current ?? null };
}
function resolve(log, scope, key, asOf) {
  const at = Date.parse(asOf);
  const candidates = log.filter((e) => e.scope === scope && e.key === key && Date.parse(e.at) <= at).sort((a, b) => Date.parse(a.at) - Date.parse(b.at) || a.id.localeCompare(b.id));
  return candidates.length > 0 ? candidates[candidates.length - 1] : null;
}
function history(log, scope, key) {
  return log.filter((e) => e.scope === scope && e.key === key).sort((a, b) => Date.parse(a.at) - Date.parse(b.at) || a.id.localeCompare(b.id));
}
function scopeAsOf(log, scope, asOf) {
  const at = Date.parse(asOf);
  const keys = [...new Set(log.filter((e) => e.scope === scope).map((e) => e.key))];
  return keys.map((k) => resolve(log, scope, k, asOf)).filter((e) => e !== null && Date.parse(e.at) <= at).sort((a, b) => Date.parse(b.at) - Date.parse(a.at) || a.key.localeCompare(b.key));
}
function cuts(log, limit) {
  const sorted = [...log].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  const shown = sorted.slice(0, Math.max(0, limit));
  const omitted = sorted.length - shown.length;
  return {
    shown,
    omitted,
    note: omitted === 0 ? `showing all ${sorted.length} memories` : `showing ${shown.length} of ${sorted.length} memories \u2014 ${omitted} withheld by the ${limit}-row cut, not deleted`
  };
}

// probe/reachPairMemory.test.ts
var DIGEST_A = "a".repeat(64);
var DIGEST_B = "b".repeat(64);
var T = (iso) => iso;
function add(log, input) {
  const res = remember(log, input);
  assert.equal(res.ok, true, JSON.stringify(res));
  return res.ok && res.appended ? [...log, res.entry] : log;
}
test("reach pair memory \u2014 receipt-bound, append-only, honest about cuts", async (t) => {
  await t.test("\xA71 refusals are in words, and a credential is never knowledge", () => {
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
      id: "m4",
      scope: "agent",
      key: "rotation",
      value: "the new key is ghp_abcdefghijklmnopqrstuvwx",
      why: "rotated",
      at: T("2026-09-01T00:00:00Z")
    });
    assert.equal(secret.ok, false);
    if (!secret.ok) assert.match(secret.reason, /looks like a credential/);
    for (const s of ["Bearer abcdefghijklmnop", "password: hunter2hunter2", "-----BEGIN RSA PRIVATE KEY-----", "xoxb-1234567890abcdef"]) {
      assert.equal(looksLikeSecret(s), true, `missed: ${s}`);
    }
    assert.equal(looksLikeSecret("we rotated the deploy credential on tuesday"), false, "talking about a secret is not a secret");
  });
  await t.test("\xA72 a pair or org fact needs the joint receipt that witnessed it", () => {
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
  await t.test("\xA73 the pair is SelfImpulseMesh's pair \u2014 one identity, not two", () => {
    assert.equal(pairMemoryScope("selfimpulse-a", "selfimpulse-b"), pairKey("selfimpulse-a", "selfimpulse-b"));
    assert.equal(pairMemoryScope("selfimpulse-a", "selfimpulse-b"), pairMemoryScope("selfimpulse-b", "selfimpulse-a"), "the pair key is order-free, like the mesh's");
  });
  await t.test("\xA74 supersession is append-only; asOf answers on any date", () => {
    const key = pairMemoryScope("selfimpulse-a", "selfimpulse-b");
    let log = [];
    log = add(log, { id: "e1", scope: "pair", key, value: "the shared staging window is tuesday 09:00", why: "agreed in the joint run", at: T("2026-09-01T09:00:00Z"), receiptDigest: DIGEST_A });
    log = add(log, { id: "e2", scope: "pair", key, value: "the shared staging window moved to thursday 14:00", why: "second joint run re-negotiated it", at: T("2026-09-10T09:00:00Z"), receiptDigest: DIGEST_B });
    assert.equal(log.length, 2, "both rows survive \u2014 nothing is deleted on supersede");
    assert.equal(log[1].supersedes, "e1", "the newer row names the row it replaces");
    assert.equal(history(log, "pair", key).length, 2);
    const before = resolve(log, "pair", key, "2026-09-05T00:00:00Z");
    const after = resolve(log, "pair", key, "2026-09-15T00:00:00Z");
    assert.equal(before?.value, "the shared staging window is tuesday 09:00", "we believed the old window on the 5th");
    assert.equal(after?.value, "the shared staging window moved to thursday 14:00");
    assert.equal(resolve(log, "pair", key, "2026-09-10T09:00:00Z")?.id, "e2", "asOf is inclusive at the instant of the write");
    assert.equal(resolve(log, "pair", key, "2026-08-01T00:00:00Z"), null, "before the first fact, we knew nothing \u2014 and it says so");
  });
  await t.test("\xA74b a repeat of what is already current is not a new belief", () => {
    const log = add([], { id: "e1", scope: "agent", key: "style", value: "two-space indent", why: "house style", at: T("2026-09-01T00:00:00Z") });
    const again = remember(log, { id: "e2", scope: "agent", key: "style", value: "two-space indent", why: "house style", at: T("2026-09-02T00:00:00Z") });
    assert.equal(again.ok, true);
    if (again.ok) {
      assert.equal(again.appended, false);
      assert.match(again.reason, /already current/);
      assert.equal(again.entry.id, "e1", "the existing row is returned; no duplicate is filed");
    }
  });
  await t.test("\xA74c a scope as of an instant returns one truth per key", () => {
    let log = [];
    log = add(log, { id: "o1", scope: "org", key: "retention.policy", value: "90 days", why: "policy v1", at: T("2026-09-01T00:00:00Z"), receiptDigest: DIGEST_A });
    log = add(log, { id: "o2", scope: "org", key: "retention.policy", value: "180 days", why: "policy v2", at: T("2026-09-06T00:00:00Z"), receiptDigest: DIGEST_B });
    log = add(log, { id: "o3", scope: "org", key: "audit.cadence", value: "quarterly", why: "policy v2", at: T("2026-09-06T00:00:00Z"), receiptDigest: DIGEST_B });
    assert.equal(scopeAsOf(log, "org", "2026-09-03T00:00:00Z").length, 1);
    assert.equal(scopeAsOf(log, "org", "2026-09-03T00:00:00Z")[0].value, "90 days");
    const now = scopeAsOf(log, "org", "2026-09-12T00:00:00Z");
    assert.equal(now.length, 2, "two keys, two rows \u2014 never two truths for one key");
    assert.equal(now[0].key, "audit.cadence");
  });
  await t.test("\xA75 a bounded read says what it withheld", () => {
    let log = [];
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
  await t.test("\xA76 entry digests re-derive, and an edited row cannot hide behind its stored digest", () => {
    const log = add([], { id: "d1", scope: "org", key: "k", value: "v", why: "w", at: T("2026-09-01T00:00:00Z"), receiptDigest: DIGEST_A });
    const e = log[0];
    assert.equal(e.digest, entryDigest(e), "the stored digest re-derives from the body");
    assert.equal(verifyEntry(e).ok, true);
    const edited = { ...e, value: "v2" };
    const verdict = verifyEntry(edited);
    assert.equal(verdict.ok, false, "an edited body no longer matches its stored digest");
    if (!verdict.ok) assert.match(verdict.reason, /edited after it was written/);
    assert.notEqual(
      memoryDigest(log),
      memoryDigest([edited]),
      "the log digest re-derives every body, so a stale stored digest cannot mask an edit"
    );
    assert.equal(memoryDigest(log), memoryDigest([{ ...e }]), "an identical log digests the same");
  });
});
