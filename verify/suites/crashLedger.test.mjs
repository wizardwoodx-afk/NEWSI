import { createRequire as __mjCreateRequire } from "node:module"; const require = __mjCreateRequire(import.meta.url);

// src/security/crashLedger.ts
var KEY = "vh.crashLedger.v1";
var GENESIS = "genesis";
var CRASH_CAP = 200;
var FRAME_CAP = 6;
var MESSAGE_CAP = 300;
var STORE_CAP = 192e3;
function resolveStore(store) {
  if (store !== void 0) return store;
  try {
    const ls = globalThis.localStorage;
    return ls && typeof ls.setItem === "function" && typeof ls.getItem === "function" ? ls : null;
  } catch {
    return null;
  }
}
function redact(raw) {
  let s2 = String(raw ?? "");
  s2 = s2.replace(/\b(bearer|authorization|api[-_]?key|secret|token|password)\b\s*[:=]?\s*\S+/gi, "$1=[redacted]");
  s2 = s2.replace(/[A-Za-z]:\\[^\s"'<>|]{2,}/g, (m) => "\u2026" + m.slice(Math.max(m.lastIndexOf("\\"), m.length - 40)));
  s2 = s2.replace(/\/(?:home|Users|var)\/[^\s"'<>|]{2,}/g, (m) => "\u2026" + m.slice(m.lastIndexOf("/") + 1));
  if (s2.length > MESSAGE_CAP) s2 = s2.slice(0, MESSAGE_CAP) + "\u2026";
  return s2;
}
function frameList(stack2) {
  const out = [];
  if (typeof stack2 !== "string") return out;
  for (const line of stack2.split("\n")) {
    if (out.length >= FRAME_CAP) break;
    const m = /\(?([^()\s]+):(\d+):(\d+)\)?\s*$/.exec(line.trim());
    if (!m) continue;
    const raw = m[1];
    const parts = raw.split(/[\\/]/);
    const where = redact(parts.length > 2 ? `\u2026/${parts.slice(-2).join("/")}` : raw);
    out.push({ where, line: Number(m[2]) || 0 });
  }
  return out;
}
function canonical(e2) {
  return [
    e2.id,
    e2.at,
    e2.kind,
    e2.where,
    e2.name,
    e2.message,
    e2.prev,
    e2.frames.map((f) => `${f.where}#${f.line}`).join("|")
  ].join("");
}
async function sha256Hex(text) {
  const subtle = globalThis.crypto?.subtle;
  if (subtle && typeof subtle.digest === "function") {
    const buf = await subtle.digest("SHA-256", new TextEncoder().encode(text));
    return [...new Uint8Array(buf)].map((b2) => b2.toString(16).padStart(2, "0")).join("");
  }
  return `unverified-${fnv1a(text)}`;
}
function fnv1a(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}
function readCrashes(store) {
  return readLedger(store).entries;
}
function readLedger(store) {
  const empty = { version: 1, base: GENESIS, entries: [] };
  const s2 = resolveStore(store);
  if (!s2) return empty;
  try {
    const raw = s2.getItem(KEY) ?? null;
    if (!raw) return empty;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return { version: 1, base: GENESIS, entries: parsed.filter(isCrashEntry) };
    }
    if (!parsed || typeof parsed !== "object") return empty;
    const f = parsed;
    if (!Array.isArray(f.entries)) return empty;
    return {
      version: 1,
      base: typeof f.base === "string" && f.base ? f.base : GENESIS,
      entries: f.entries.filter(isCrashEntry)
    };
  } catch {
    return empty;
  }
}
function isCrashEntry(e2) {
  return !!e2 && typeof e2 === "object" && typeof e2.digest === "string" && typeof e2.prev === "string" && Array.isArray(e2.frames);
}
function writeLedger(next, store) {
  const s2 = resolveStore(store);
  if (!s2) return { ok: false, kept: 0, note: "no storage on this host \u2014 the crash is reported to the console and nothing is kept." };
  let payload = "";
  let base = next.base;
  let entries = next.entries;
  for (let budget = STORE_CAP; budget >= 20; budget = Math.floor(budget / 2)) {
    base = next.base;
    entries = next.entries;
    payload = JSON.stringify({ version: 1, base, entries });
    while (entries.length > 1 && payload.length > budget) {
      base = entries[0].digest;
      entries = entries.slice(1);
      payload = JSON.stringify({ version: 1, base, entries });
    }
    try {
      s2.setItem(KEY, payload);
      const dropped = next.entries.length - entries.length;
      return {
        ok: true,
        kept: entries.length,
        note: dropped > 0 ? `kept the newest ${entries.length} crashes; ${dropped} older entries did not fit this origin's budget.` : `kept all ${entries.length} entries.`
      };
    } catch {
    }
  }
  return { ok: false, kept: 0, note: "the crash ledger could not be written at any size \u2014 the crash is on the console only." };
}
async function recordCrash(input, store) {
  const err = input.error ?? {};
  const at = (/* @__PURE__ */ new Date()).toISOString();
  const file = readLedger(store);
  const prev = file.entries;
  const last = prev[prev.length - 1];
  const prevDigest = last ? last.digest : file.base;
  const name = redact(String(err.name ?? "Error"));
  const message = redact(String(err.message ?? err));
  const frames2 = frameList(input.stack ?? err.stack);
  const body = {
    id: `c_${Date.now().toString(36)}_${prev.length + 1}`,
    at,
    kind: input.kind,
    where: redact(String(input.where ?? "app")),
    name,
    message,
    frames: frames2,
    prev: prevDigest
  };
  const digest = await sha256Hex(canonical(body));
  const entry = { ...body, digest };
  const overflow = prev.length + 1 - CRASH_CAP;
  const trimmed = overflow > 0 ? [...prev.slice(overflow), entry] : [...prev, entry];
  const base = overflow > 0 ? trimmed[0].prev : file.base;
  const kept2 = writeLedger({ version: 1, base, entries: trimmed }, store);
  try {
    console.error(`[11h crash] ${entry.kind} in ${entry.where}: ${entry.name}: ${entry.message}`);
  } catch {
  }
  return { id: entry.id, ok: kept2.ok, kept: kept2.kept, note: kept2.note };
}
function lastCrash(store) {
  const list = readCrashes(store);
  return list.length ? list[list.length - 1] : null;
}
async function verifyCrashChain(store) {
  const file = readLedger(store);
  const list = file.entries;
  const assurance = chainAssurance(list, file.base);
  if (list.length === 0) {
    return { ok: true, entries: 0, brokenAt: null, assurance: "no crashes have been recorded, so there is no chain to verify." };
  }
  let prev = file.base;
  for (const e2 of list) {
    if (e2.prev !== prev) {
      return { ok: false, entries: list.length, brokenAt: e2.id, assurance: `${assurance} Broken at ${e2.id}: the entry does not follow the one before it, so a record was removed or reordered.` };
    }
    const { digest, ...body } = e2;
    const again = await sha256Hex(canonical(body));
    if (again !== digest) {
      return { ok: false, entries: list.length, brokenAt: e2.id, assurance: `${assurance} Broken at ${e2.id}: the entry's own contents were changed after it was written.` };
    }
    prev = digest;
  }
  return {
    ok: true,
    entries: list.length,
    brokenAt: null,
    assurance: `${assurance} All ${list.length} entries re-derive to the same digests \u2014 no record was edited or removed.`
  };
}
function chainAssurance(list, base = GENESIS) {
  const weak2 = list.some((e2) => e2.digest.startsWith("unverified-"));
  const windowed = base !== GENESIS ? ` This ledger is a rolling window: it continues from digest ${base.slice(0, 12)}\u2026, so entries older than the retained ${list.length} are not covered.` : "";
  const claim = weak2 ? "This ledger was written on a host without WebCrypto, so its digests are WEAK markers, not SHA-256. Treat it as evidence of ordering only." : "Each entry's SHA-256 covers the previous entry's digest, so a removed or edited record breaks every digest after it.";
  return claim + windowed;
}
function clearCrashes(store) {
  const s2 = resolveStore(store);
  const n = readCrashes(store).length;
  if (!s2) return { cleared: 0 };
  try {
    s2.removeItem(KEY);
  } catch {
  }
  return { cleared: n };
}
async function exportCrashReport(store) {
  const chain = await verifyCrashChain(store);
  return {
    product: "SelfImpulse",
    engine: "MJ",
    exportedAt: (/* @__PURE__ */ new Date()).toISOString(),
    chain,
    entries: readCrashes(store)
  };
}

// probe/crashLedger.test.ts
var passed = 0;
var failed = 0;
var failures = [];
function ok(label, cond, detail = "") {
  if (cond) {
    passed += 1;
    console.log(`  ok   ${label}`);
  } else {
    failed += 1;
    failures.push(`${label}${detail ? ` \u2014 ${detail}` : ""}`);
    console.log(`  FAIL ${label}${detail ? ` \u2014 ${detail}` : ""}`);
  }
}
var MemStore = class {
  m = /* @__PURE__ */ new Map();
  /** set this to make the next write throw QuotaExceededError */
  quota = false;
  /** every byte this store was asked to hold, for the budget tests */
  bytesWritten = 0;
  getItem(k) {
    return this.m.has(k) ? this.m.get(k) : null;
  }
  setItem(k, v) {
    if (this.quota) {
      const e2 = new Error("quota");
      e2.name = "QuotaExceededError";
      throw e2;
    }
    this.bytesWritten += v.length;
    this.m.set(k, v);
  }
  removeItem(k) {
    this.m.delete(k);
  }
  /** test-only: write directly, bypassing the module, to simulate tampering */
  poke(k, v) {
    this.m.set(k, v);
  }
  peek(k) {
    return this.m.get(k) ?? null;
  }
};
console.log("== 1. redaction \u2014 what may enter the ledger");
ok("a bearer token is stripped", !/eyJ|abc123secret/i.test(redact("authorization: Bearer sk-live-9f8a7b6c5d4e")), redact("authorization: Bearer sk-live-9f8a7b6c5d4e"));
ok("an api key assignment is stripped", !/sk-live/i.test(redact("api_key=sk-live-9f8a7b6c")), redact("api_key=sk-live-9f8a7b6c"));
ok("a password assignment is stripped", !/hunter2/.test(redact("password: hunter2")));
ok("the KEYWORD survives so the operator still learns what kind of value it was", /redacted/i.test(redact("password: hunter2")));
ok("a Windows absolute path collapses", !/C:\\Users\\somebody/i.test(redact("failed reading C:\\Users\\somebody\\Documents\\q3.pdf")), redact("failed reading C:\\Users\\somebody\\Documents\\q3.pdf"));
ok("a unix home path collapses", !/\/home\/alice/i.test(redact("cannot open /home/alice/secrets/tax.txt")), redact("cannot open /home/alice/secrets/tax.txt"));
ok("a long message is capped", redact("x".repeat(5e3)).length <= 320);
ok("an ordinary message is NOT mangled", redact("TypeError: cannot read properties of undefined") === "TypeError: cannot read properties of undefined");
ok("an empty message is safe", redact("") === "");
console.log("== 2. frames \u2014 shape kept, noise dropped");
var stack = [
  "TypeError: cannot read properties of undefined (reading 'map')",
  "    at renderDesk (D:\\selfimpulse-work\\src\\ui\\screens\\Specialists.tsx:83:12)",
  "    at renderWithHooks (http://localhost:5173/node_modules/.vite/deps/react-dom.js:1:2)",
  "    at Array.map (<anonymous>)"
].join("\n");
var frames = frameList(stack);
ok("frames were extracted", frames.length >= 2, `got ${frames.length}`);
ok("an app frame keeps its file and line", frames.some((f) => f.where.includes("Specialists.tsx") && f.line === 83), JSON.stringify(frames));
ok("an app frame keeps only the last two path segments", !frames.some((f) => f.where.includes("selfimpulse-work")));
ok("a non-frame line is not invented", !frames.some((f) => f.line === 0 && f.where === ""));
ok("frames are capped", frameList(Array.from({ length: 50 }, (_, i) => `    at f${i} (/a/b/c.ts:${i}:1)`).join("\n")).length <= 6);
ok("a non-string stack yields no frames", frameList(void 0).length === 0);
ok("an empty stack yields no frames", frameList("").length === 0);
console.log("== 3. append + read");
var s = new MemStore();
var a = await recordCrash({ kind: "render", where: "Specialists", error: new TypeError("x.map is not a function") }, s);
ok("the first crash is recorded", a.ok, a.note);
var b = await recordCrash({ kind: "engine", where: "askSelfImpulse19", error: new Error("provider fetch failed") }, s);
ok("the second crash is recorded", b.ok);
ok("two entries are stored", readCrashes(s).length === 2);
ok("the first entry chains onto genesis", readCrashes(s)[0].prev === "genesis");
ok("the second entry chains onto the first", readCrashes(s)[1].prev === readCrashes(s)[0].digest);
ok("the kind is preserved", readCrashes(s)[0].kind === "render" && readCrashes(s)[1].kind === "engine");
ok("the where is preserved", readCrashes(s)[0].where === "Specialists");
ok("lastCrash returns the newest", lastCrash(s)?.id === b.id);
ok("digests are hex sha256, not the weak fallback", /^[0-9a-f]{64}$/.test(readCrashes(s)[0].digest), readCrashes(s)[0].digest);
console.log("== 4. the chain verifies when nothing has been touched");
var clean = await verifyCrashChain(s);
ok("an untouched chain verifies", clean.ok, clean.assurance);
ok("the report counts the entries", clean.entries === 2);
ok("nothing is reported as broken", clean.brokenAt === null);
ok("the assurance states the sha256 chaining", /SHA-256/.test(clean.assurance));
console.log("== 5. TAMPER \u2014 the reason the chain exists");
function tamper(edit, store) {
  const raw = JSON.parse(store.peek("vh.crashLedger.v1"));
  store.poke("vh.crashLedger.v1", JSON.stringify({ ...raw, entries: edit(raw.entries) }));
}
var t1 = new MemStore();
await recordCrash({ kind: "render", where: "A", error: new Error("first") }, t1);
await recordCrash({ kind: "render", where: "B", error: new Error("second") }, t1);
await recordCrash({ kind: "render", where: "C", error: new Error("third") }, t1);
ok("a three-entry chain verifies before tampering", (await verifyCrashChain(t1)).ok);
tamper((l) => {
  l[1].message = "a nicer story";
  return l;
}, t1);
var t1r = await verifyCrashChain(t1);
ok("editing an entry's message BREAKS the chain", !t1r.ok);
ok("the break is located at the edited entry", t1r.brokenAt === readCrashes(t1)[1].id, `brokenAt=${t1r.brokenAt}`);
ok("the assurance says the contents were changed", /contents were changed/.test(t1r.assurance), t1r.assurance);
var t2 = new MemStore();
await recordCrash({ kind: "render", where: "A", error: new Error("first") }, t2);
await recordCrash({ kind: "render", where: "B", error: new Error("second") }, t2);
await recordCrash({ kind: "render", where: "C", error: new Error("third") }, t2);
tamper((l) => [l[0], l[2]], t2);
var t2r = await verifyCrashChain(t2);
ok("REMOVING an entry breaks the chain", !t2r.ok);
ok("a removal is reported as not following the previous entry", /does not follow/.test(t2r.assurance), t2r.assurance);
var t3 = new MemStore();
await recordCrash({ kind: "render", where: "A", error: new Error("first") }, t3);
await recordCrash({ kind: "render", where: "B", error: new Error("second") }, t3);
tamper((l) => l.reverse(), t3);
ok("REORDERING entries breaks the chain", !(await verifyCrashChain(t3)).ok);
var t4 = new MemStore();
await recordCrash({ kind: "render", where: "A", error: new Error("first") }, t4);
await recordCrash({ kind: "render", where: "B", error: new Error("second") }, t4);
tamper((l) => {
  l[0].digest = "0".repeat(64);
  return l;
}, t4);
ok("forging a digest breaks the chain", !(await verifyCrashChain(t4)).ok);
var t5 = new MemStore();
await recordCrash({ kind: "render", where: "A", error: new Error("only") }, t5);
tamper((l) => {
  l[0].prev = "genesis";
  l[0].where = "Somewhere Else";
  l[0].digest = "0".repeat(64);
  return l;
}, t5);
ok("rewriting the genesis entry is still caught", !(await verifyCrashChain(t5)).ok);
console.log("== 6. honesty about what a browser chain can promise");
ok("a sha256 chain is described as chained, not tamper-proof", /removed or edited record breaks/.test(chainAssurance(readCrashes(s))));
var weak = [{ ...readCrashes(s)[0], digest: "unverified-deadbeef" }];
ok("a weak digest is called WEAK, not verified", /WEAK markers/.test(chainAssurance(weak)), chainAssurance(weak));
ok("the product does not claim WORM storage", !/tamper-?proof|unforgeable|immutable/i.test(chainAssurance(readCrashes(s))));
console.log("== 7. degradation is reported, never silent");
var q = new MemStore();
await recordCrash({ kind: "render", where: "A", error: new Error("one") }, q);
q.quota = true;
var denied = await recordCrash({ kind: "render", where: "B", error: new Error("two") }, q);
ok("a quota refusal is NOT reported as success", !denied.ok);
ok("the refusal is in words", /does not fit|could not be written/.test(denied.note), denied.note);
var nos = await recordCrash({ kind: "render", where: "C", error: new Error("three") }, null);
ok("with no storage the crash is still reported to the console", nos.ok === false && /no storage/.test(nos.note), nos.note);
console.log("== 8. caps \u2014 a crash loop must not fill the origin");
var c = new MemStore();
for (let i = 0; i < CRASH_CAP + 25; i++) await recordCrash({ kind: "render", where: "loop", error: new Error(`crash ${i}`) }, c);
var kept = readCrashes(c);
ok("the ledger is capped", kept.length <= CRASH_CAP, `kept ${kept.length}`);
ok("the cap keeps the NEWEST entries, not the oldest", kept[kept.length - 1].message.includes(`crash ${CRASH_CAP + 24}`), kept[kept.length - 1].message);
ok("a capped ledger still verifies", (await verifyCrashChain(c)).ok, (await verifyCrashChain(c)).assurance);
ok("a capped ledger SAYS it is a window, not the whole history", /rolling window/.test((await verifyCrashChain(c)).assurance), (await verifyCrashChain(c)).assurance);
ok("a short ledger claims the full chain", !/rolling window/.test((await verifyCrashChain(s)).assurance));
ok("a capped ledger still catches an edit inside the window", await (async () => {
  const t = new MemStore();
  for (let i = 0; i < CRASH_CAP + 10; i++) await recordCrash({ kind: "render", where: "loop", error: new Error(`c${i}`) }, t);
  const file = JSON.parse(t.peek("vh.crashLedger.v1"));
  file.entries[10].message = "rewritten";
  t.poke("vh.crashLedger.v1", JSON.stringify(file));
  return !(await verifyCrashChain(t)).ok;
})());
console.log("== 8b. the byte budget can actually HOLD the cap");
var cost = new MemStore();
var stack6 = Array.from({ length: 8 }, (_, i) => `    at someRatherLongFunctionName${i} (D:\\some\\long\\build\\path\\src\\ui\\screens\\Specialists.tsx:${100 + i}:12)`).join("\n");
for (let i = 0; i < CRASH_CAP; i++) {
  await recordCrash({ kind: "render", where: "Specialists", error: new TypeError("x.map is not a function with a long message"), stack: stack6 }, cost);
}
var full = readCrashes(cost);
ok(`the ledger retains the full ${CRASH_CAP}-entry cap`, full.length === CRASH_CAP, `retained only ${full.length} \u2014 the byte budget is too small for the cap`);
var bytes = cost.peek("vh.crashLedger.v1").length;
ok("a full ledger stays a small fraction of a localStorage origin", bytes < 4e5, `${bytes} bytes`);
ok("a full ledger still verifies end to end", (await verifyCrashChain(cost)).ok);
console.log("== 9. a corrupt store is survivable, not fatal");
var bad = new MemStore();
bad.poke("vh.crashLedger.v1", "{not json at all");
ok("a corrupt ledger reads as empty rather than throwing", readCrashes(bad).length === 0);
ok("a corrupt ledger verifies as an empty chain", (await verifyCrashChain(bad)).ok);
bad.poke("vh.crashLedger.v1", JSON.stringify({ version: 1, base: "genesis", entries: [{ nope: true }] }));
ok("entries without a digest are filtered out", readCrashes(bad).length === 0);
bad.poke("vh.crashLedger.v1", JSON.stringify({ not: "a ledger" }));
ok("a payload with no entries array reads as empty", readCrashes(bad).length === 0);
var legacy = new MemStore();
var real = await recordCrash({ kind: "render", where: "Legacy", error: new Error("written before the base field") }, legacy);
ok("the seed crash was recorded", real.ok);
var arr = JSON.parse(legacy.peek("vh.crashLedger.v1"));
legacy.poke("vh.crashLedger.v1", JSON.stringify(arr.entries));
ok("a LEGACY flat-array file is still readable, not discarded", readCrashes(legacy).length === 1);
ok("a legacy flat-array file still verifies", (await verifyCrashChain(legacy)).ok, (await verifyCrashChain(legacy)).assurance);
await recordCrash({ kind: "render", where: "After", error: new Error("appended to a legacy file") }, legacy);
ok("a legacy file can be appended to, and the chain continues", (await verifyCrashChain(legacy)).ok, (await verifyCrashChain(legacy)).assurance);
ok("the legacy file was upgraded to the wrapped shape on append", !Array.isArray(JSON.parse(legacy.peek("vh.crashLedger.v1"))));
console.log("== 10. export is self-describing and carries no user content");
var e = new MemStore();
await recordCrash({ kind: "engine", where: "askSelfImpulse19", error: new Error("fetch https://api.example.com failed"), stack }, e);
var rep = await exportCrashReport(e);
ok("the report names the product", rep.product === "SelfImpulse" && rep.engine === "MJ");
ok("the report carries the chain verdict", typeof rep.chain.ok === "boolean" && rep.chain.entries === 1);
ok("the report carries the entries", rep.entries.length === 1);
ok("the report has an export timestamp", !Number.isNaN(Date.parse(rep.exportedAt)));
ok("the exported entry is redacted", !/selfimpulse-work/.test(JSON.stringify(rep)), "an absolute build path leaked into the export");
console.log("== 10b. the export carries the chain verdict and the window fact");
var wc = new MemStore();
for (let i = 0; i < CRASH_CAP + 5; i++) await recordCrash({ kind: "render", where: "loop", error: new Error(`w${i}`) }, wc);
var wrep = await exportCrashReport(wc);
ok("a windowed export still verifies", wrep.chain.ok, wrep.chain.assurance);
ok("a windowed export discloses the window", /rolling window/.test(wrep.chain.assurance));
console.log("== 11. erasure \u2014 the GDPR path for this store");
var g = new MemStore();
await recordCrash({ kind: "render", where: "A", error: new Error("one") }, g);
await recordCrash({ kind: "render", where: "B", error: new Error("two") }, g);
var cleared = clearCrashes(g);
ok("erasure reports how many it removed", cleared.cleared === 2);
ok("erasure empties the ledger", readCrashes(g).length === 0);
ok("erasure leaves a verifiable empty chain", (await verifyCrashChain(g)).ok);
ok("erasing twice is not an error", clearCrashes(g).cleared === 0);
console.log(`
${passed} passed, ${failed} failed`);
if (failures.length) {
  console.log("\nFAILURES:");
  for (const f of failures) console.log(`  - ${f}`);
}
if (failed > 0) process.exit(1);
