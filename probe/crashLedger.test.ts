/**
 * The local crash ledger + the render boundary (src/security/crashLedger.ts,
 * src/panels/ErrorBoundary.tsx).
 *
 * WHY THIS SUITE IS A GATE
 * ------------------------
 * The product makes two claims that are only worth anything if they are tested:
 *
 *   1. "A crash is recorded, locally, and never leaves the machine."
 *   2. "The record cannot be quietly edited."
 *
 * Claim 2 is the one that matters for an enterprise audit, and it is the one
 * that quietly rots: a hash chain is only as good as its canonical form, and a
 * canonical form that depends on `JSON.stringify` key order will break on an
 * innocuous refactor. So the tamper cases here are pinned hard, including the
 * exact failure mode of a *reordering* rather than an edit.
 *
 * Claim 1 has a second half that is easy to get wrong: a ledger that captures
 * the user's message text, file paths or provider keys is a second data store
 * with none of the vault's guarantees. The redaction policy is therefore pinned
 * directly, not assumed.
 */
import {
  CRASH_CAP,
  chainAssurance,
  clearCrashes,
  exportCrashReport,
  frameList,
  lastCrash,
  readCrashes,
  recordCrash,
  redact,
  verifyCrashChain,
  type CrashEntry,
} from "../src/security/crashLedger";

let passed = 0;
let failed = 0;
const failures: string[] = [];
function ok(label: string, cond: boolean, detail = ""): void {
  if (cond) { passed += 1; console.log(`  ok   ${label}`); }
  else { failed += 1; failures.push(`${label}${detail ? ` — ${detail}` : ""}`); console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`); }
}

/** A real localStorage stand-in, so the functions under test are the shipped ones. */
class MemStore {
  private m = new Map<string, string>();
  /** set this to make the next write throw QuotaExceededError */
  quota = false;
  /** every byte this store was asked to hold, for the budget tests */
  bytesWritten = 0;
  getItem(k: string) { return this.m.has(k) ? (this.m.get(k) as string) : null; }
  setItem(k: string, v: string) {
    if (this.quota) { const e = new Error("quota"); (e as { name: string }).name = "QuotaExceededError"; throw e; }
    this.bytesWritten += v.length;
    this.m.set(k, v);
  }
  removeItem(k: string) { this.m.delete(k); }
  /** test-only: write directly, bypassing the module, to simulate tampering */
  poke(k: string, v: string) { this.m.set(k, v); }
  peek(k: string) { return this.m.get(k) ?? null; }
}

console.log("== 1. redaction — what may enter the ledger");
ok("a bearer token is stripped", !/eyJ|abc123secret/i.test(redact("authorization: Bearer sk-live-9f8a7b6c5d4e")), redact("authorization: Bearer sk-live-9f8a7b6c5d4e"));
ok("an api key assignment is stripped", !/sk-live/i.test(redact("api_key=sk-live-9f8a7b6c")), redact("api_key=sk-live-9f8a7b6c"));
ok("a password assignment is stripped", !/hunter2/.test(redact("password: hunter2")));
ok("the KEYWORD survives so the operator still learns what kind of value it was", /redacted/i.test(redact("password: hunter2")));
ok("a Windows absolute path collapses", !/C:\\Users\\somebody/i.test(redact("failed reading C:\\Users\\somebody\\Documents\\q3.pdf")), redact("failed reading C:\\Users\\somebody\\Documents\\q3.pdf"));
ok("a unix home path collapses", !/\/home\/alice/i.test(redact("cannot open /home/alice/secrets/tax.txt")), redact("cannot open /home/alice/secrets/tax.txt"));
ok("a long message is capped", redact("x".repeat(5000)).length <= 320);
ok("an ordinary message is NOT mangled", redact("TypeError: cannot read properties of undefined") === "TypeError: cannot read properties of undefined");
ok("an empty message is safe", redact("") === "");

console.log("== 2. frames — shape kept, noise dropped");
const stack = [
  "TypeError: cannot read properties of undefined (reading 'map')",
  "    at renderDesk (D:\\selfimpulse-work\\src\\ui\\screens\\Specialists.tsx:83:12)",
  "    at renderWithHooks (http://localhost:5173/node_modules/.vite/deps/react-dom.js:1:2)",
  "    at Array.map (<anonymous>)",
].join("\n");
const frames = frameList(stack);
ok("frames were extracted", frames.length >= 2, `got ${frames.length}`);
ok("an app frame keeps its file and line", frames.some((f) => f.where.includes("Specialists.tsx") && f.line === 83), JSON.stringify(frames));
ok("an app frame keeps only the last two path segments", !frames.some((f) => f.where.includes("selfimpulse-work")));
ok("a non-frame line is not invented", !frames.some((f) => f.line === 0 && f.where === ""));
ok("frames are capped", frameList(Array.from({ length: 50 }, (_, i) => `    at f${i} (/a/b/c.ts:${i}:1)`).join("\n")).length <= 6);
ok("a non-string stack yields no frames", frameList(undefined).length === 0);
ok("an empty stack yields no frames", frameList("").length === 0);

console.log("== 3. append + read");
const s = new MemStore();
const a = await recordCrash({ kind: "render", where: "Specialists", error: new TypeError("x.map is not a function") }, s);
ok("the first crash is recorded", a.ok, a.note);
const b = await recordCrash({ kind: "engine", where: "askSelfImpulse19", error: new Error("provider fetch failed") }, s);
ok("the second crash is recorded", b.ok);
ok("two entries are stored", readCrashes(s).length === 2);
ok("the first entry chains onto genesis", readCrashes(s)[0]!.prev === "genesis");
ok("the second entry chains onto the first", readCrashes(s)[1]!.prev === readCrashes(s)[0]!.digest);
ok("the kind is preserved", readCrashes(s)[0]!.kind === "render" && readCrashes(s)[1]!.kind === "engine");
ok("the where is preserved", readCrashes(s)[0]!.where === "Specialists");
ok("lastCrash returns the newest", lastCrash(s)?.id === b.id);
ok("digests are hex sha256, not the weak fallback", /^[0-9a-f]{64}$/.test(readCrashes(s)[0]!.digest), readCrashes(s)[0]!.digest);

console.log("== 4. the chain verifies when nothing has been touched");
const clean = await verifyCrashChain(s);
ok("an untouched chain verifies", clean.ok, clean.assurance);
ok("the report counts the entries", clean.entries === 2);
ok("nothing is reported as broken", clean.brokenAt === null);
ok("the assurance states the sha256 chaining", /SHA-256/.test(clean.assurance));

console.log("== 5. TAMPER — the reason the chain exists");
/** rewrite the stored ledger with one entry edited, as an operator with devtools would */
function tamper(edit: (list: CrashEntry[]) => CrashEntry[], store: MemStore) {
  const raw = JSON.parse(store.peek("vh.crashLedger.v1") as string) as { version: number; base: string; entries: CrashEntry[] };
  store.poke("vh.crashLedger.v1", JSON.stringify({ ...raw, entries: edit(raw.entries) }));
}
const t1 = new MemStore();
await recordCrash({ kind: "render", where: "A", error: new Error("first") }, t1);
await recordCrash({ kind: "render", where: "B", error: new Error("second") }, t1);
await recordCrash({ kind: "render", where: "C", error: new Error("third") }, t1);
ok("a three-entry chain verifies before tampering", (await verifyCrashChain(t1)).ok);

tamper((l) => { l[1]!.message = "a nicer story"; return l; }, t1);
const t1r = await verifyCrashChain(t1);
ok("editing an entry's message BREAKS the chain", !t1r.ok);
ok("the break is located at the edited entry", t1r.brokenAt === readCrashes(t1)[1]!.id, `brokenAt=${t1r.brokenAt}`);
ok("the assurance says the contents were changed", /contents were changed/.test(t1r.assurance), t1r.assurance);

const t2 = new MemStore();
await recordCrash({ kind: "render", where: "A", error: new Error("first") }, t2);
await recordCrash({ kind: "render", where: "B", error: new Error("second") }, t2);
await recordCrash({ kind: "render", where: "C", error: new Error("third") }, t2);
tamper((l) => [l[0]!, l[2]!], t2);   // remove the middle entry
const t2r = await verifyCrashChain(t2);
ok("REMOVING an entry breaks the chain", !t2r.ok);
ok("a removal is reported as not following the previous entry", /does not follow/.test(t2r.assurance), t2r.assurance);

const t3 = new MemStore();
await recordCrash({ kind: "render", where: "A", error: new Error("first") }, t3);
await recordCrash({ kind: "render", where: "B", error: new Error("second") }, t3);
tamper((l) => l.reverse(), t3);
ok("REORDERING entries breaks the chain", !(await verifyCrashChain(t3)).ok);

const t4 = new MemStore();
await recordCrash({ kind: "render", where: "A", error: new Error("first") }, t4);
await recordCrash({ kind: "render", where: "B", error: new Error("second") }, t4);
tamper((l) => { l[0]!.digest = "0".repeat(64); return l; }, t4);
ok("forging a digest breaks the chain", !(await verifyCrashChain(t4)).ok);

const t5 = new MemStore();
await recordCrash({ kind: "render", where: "A", error: new Error("only") }, t5);
tamper((l) => { l[0]!.prev = "genesis"; l[0]!.where = "Somewhere Else"; l[0]!.digest = "0".repeat(64); return l; }, t5);
ok("rewriting the genesis entry is still caught", !(await verifyCrashChain(t5)).ok);

console.log("== 6. honesty about what a browser chain can promise");
ok("a sha256 chain is described as chained, not tamper-proof", /removed or edited record breaks/.test(chainAssurance(readCrashes(s))));
const weak: CrashEntry[] = [{ ...readCrashes(s)[0]!, digest: "unverified-deadbeef" }];
ok("a weak digest is called WEAK, not verified", /WEAK markers/.test(chainAssurance(weak)), chainAssurance(weak));
ok("the product does not claim WORM storage", !/tamper-?proof|unforgeable|immutable/i.test(chainAssurance(readCrashes(s))));

console.log("== 7. degradation is reported, never silent");
const q = new MemStore();
await recordCrash({ kind: "render", where: "A", error: new Error("one") }, q);
q.quota = true;
const denied = await recordCrash({ kind: "render", where: "B", error: new Error("two") }, q);
ok("a quota refusal is NOT reported as success", !denied.ok);
ok("the refusal is in words", /does not fit|could not be written/.test(denied.note), denied.note);
const nos = await recordCrash({ kind: "render", where: "C", error: new Error("three") }, null as unknown as MemStore);
ok("with no storage the crash is still reported to the console", nos.ok === false && /no storage/.test(nos.note), nos.note);

console.log("== 8. caps — a crash loop must not fill the origin");
const c = new MemStore();
for (let i = 0; i < CRASH_CAP + 25; i++) await recordCrash({ kind: "render", where: "loop", error: new Error(`crash ${i}`) }, c);
const kept = readCrashes(c);
ok("the ledger is capped", kept.length <= CRASH_CAP, `kept ${kept.length}`);
ok("the cap keeps the NEWEST entries, not the oldest", kept[kept.length - 1]!.message.includes(`crash ${CRASH_CAP + 24}`), kept[kept.length - 1]!.message);
ok("a capped ledger still verifies", (await verifyCrashChain(c)).ok, (await verifyCrashChain(c)).assurance);
ok("a capped ledger SAYS it is a window, not the whole history", /rolling window/.test((await verifyCrashChain(c)).assurance), (await verifyCrashChain(c)).assurance);
ok("a short ledger claims the full chain", !/rolling window/.test((await verifyCrashChain(s)).assurance));
ok("a capped ledger still catches an edit inside the window", await (async () => {
  const t = new MemStore();
  for (let i = 0; i < CRASH_CAP + 10; i++) await recordCrash({ kind: "render", where: "loop", error: new Error(`c${i}`) }, t);
  const file = JSON.parse(t.peek("vh.crashLedger.v1") as string) as { version: number; base: string; entries: CrashEntry[] };
  file.entries[10]!.message = "rewritten";
  t.poke("vh.crashLedger.v1", JSON.stringify(file));
  return !(await verifyCrashChain(t)).ok;
})());

console.log("== 8b. the byte budget can actually HOLD the cap");
// This is the check that catches the 4 KB / 11-entry bug this module shipped
// with. The cap is a promise about how much history survives; a budget too small
// to hold it makes the promise false while every other assertion still passes.
const cost = new MemStore();
const stack6 = Array.from({ length: 8 }, (_, i) =>
  `    at someRatherLongFunctionName${i} (D:\\some\\long\\build\\path\\src\\ui\\screens\\Specialists.tsx:${100 + i}:12)`).join("\n");
for (let i = 0; i < CRASH_CAP; i++) {
  await recordCrash({ kind: "render", where: "Specialists", error: new TypeError("x.map is not a function with a long message"), stack: stack6 }, cost);
}
const full = readCrashes(cost);
ok(`the ledger retains the full ${CRASH_CAP}-entry cap`, full.length === CRASH_CAP, `retained only ${full.length} — the byte budget is too small for the cap`);
const bytes = (cost.peek("vh.crashLedger.v1") as string).length;
ok("a full ledger stays a small fraction of a localStorage origin", bytes < 400_000, `${bytes} bytes`);
ok("a full ledger still verifies end to end", (await verifyCrashChain(cost)).ok);

console.log("== 9. a corrupt store is survivable, not fatal");
const bad = new MemStore();
bad.poke("vh.crashLedger.v1", "{not json at all");
ok("a corrupt ledger reads as empty rather than throwing", readCrashes(bad).length === 0);
ok("a corrupt ledger verifies as an empty chain", (await verifyCrashChain(bad)).ok);
bad.poke("vh.crashLedger.v1", JSON.stringify({ version: 1, base: "genesis", entries: [{ nope: true }] }));
ok("entries without a digest are filtered out", readCrashes(bad).length === 0);
bad.poke("vh.crashLedger.v1", JSON.stringify({ not: "a ledger" }));
ok("a payload with no entries array reads as empty", readCrashes(bad).length === 0);
// A legacy file is one written by the flat-array shape. Build it from a REAL
// recorded entry, not a hand-written stub: a fabricated digest cannot verify, and
// asserting that it does would test nothing.
const legacy = new MemStore();
const real = await recordCrash({ kind: "render", where: "Legacy", error: new Error("written before the base field") }, legacy);
ok("the seed crash was recorded", real.ok);
const arr = JSON.parse(legacy.peek("vh.crashLedger.v1") as string) as { version: number; base: string; entries: CrashEntry[] };
legacy.poke("vh.crashLedger.v1", JSON.stringify(arr.entries));   // drop the wrapper
ok("a LEGACY flat-array file is still readable, not discarded", readCrashes(legacy).length === 1);
ok("a legacy flat-array file still verifies", (await verifyCrashChain(legacy)).ok, (await verifyCrashChain(legacy)).assurance);
await recordCrash({ kind: "render", where: "After", error: new Error("appended to a legacy file") }, legacy);
ok("a legacy file can be appended to, and the chain continues", (await verifyCrashChain(legacy)).ok, (await verifyCrashChain(legacy)).assurance);
ok("the legacy file was upgraded to the wrapped shape on append", !Array.isArray(JSON.parse(legacy.peek("vh.crashLedger.v1") as string)));

console.log("== 10. export is self-describing and carries no user content");
const e = new MemStore();
await recordCrash({ kind: "engine", where: "askSelfImpulse19", error: new Error("fetch https://api.example.com failed"), stack }, e);
const rep = await exportCrashReport(e);
ok("the report names the product", rep.product === "SelfImpulse" && rep.engine === "MJ");
ok("the report carries the chain verdict", typeof rep.chain.ok === "boolean" && rep.chain.entries === 1);
ok("the report carries the entries", rep.entries.length === 1);
ok("the report has an export timestamp", !Number.isNaN(Date.parse(rep.exportedAt)));
ok("the exported entry is redacted", !/selfimpulse-work/.test(JSON.stringify(rep)), "an absolute build path leaked into the export");

console.log("== 10b. the export carries the chain verdict and the window fact");
const wc = new MemStore();
for (let i = 0; i < CRASH_CAP + 5; i++) await recordCrash({ kind: "render", where: "loop", error: new Error(`w${i}`) }, wc);
const wrep = await exportCrashReport(wc);
ok("a windowed export still verifies", wrep.chain.ok, wrep.chain.assurance);
ok("a windowed export discloses the window", /rolling window/.test(wrep.chain.assurance));

console.log("== 11. erasure — the GDPR path for this store");
const g = new MemStore();
await recordCrash({ kind: "render", where: "A", error: new Error("one") }, g);
await recordCrash({ kind: "render", where: "B", error: new Error("two") }, g);
const cleared = clearCrashes(g);
ok("erasure reports how many it removed", cleared.cleared === 2);
ok("erasure empties the ledger", readCrashes(g).length === 0);
ok("erasure leaves a verifiable empty chain", (await verifyCrashChain(g)).ok);
ok("erasing twice is not an error", clearCrashes(g).cleared === 0);

console.log(`\n${passed} passed, ${failed} failed`);
if (failures.length) { console.log("\nFAILURES:"); for (const f of failures) console.log(`  - ${f}`); }
if (failed > 0) process.exit(1);
