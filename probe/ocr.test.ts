/**
 * The local OCR reader probe.
 *
 * THE RECOGNISER IS A SEAM. `readImages` takes an `engineFactory` the way `generalist`
 * takes `deps.fetchImpl`. A multi-megabyte WASM recogniser cannot live inside a
 * self-contained offline bundle, so this suite drives a FAKE and asserts what actually
 * lives in this module: the LOCAL-DATA RULE, the caps, the refusal words, the deadline,
 * the never-throws promise, and the ledger line. The real recogniser is proven in
 * `probe/ocrLive.spec.ts`, which declares honestly that it needs node_modules.
 *
 * THE LOCAL-DATA RULE GETS THE MOST ATTENTION, ON PURPOSE. Tesseract.js fetches language
 * data over the network by default. If this module ever took that default, importing it
 * would produce an outbound request — and the product's "on-device" claim, and its egress
 * guards, would both be false. So the probe pins that the module refuses rather than
 * fetches, on every path that could lead to a fetch.
 */
import { readImages, ocrLine, type OcrOutcome, type OcrEngineHandle, type OcrInput } from "../src/mission/ocr";

let passed = 0;
let failed = 0;
const failures: string[] = [];
function ok(label: string, cond: boolean, detail = ""): void {
  if (cond) { passed++; console.log(`  ok   ${label}`); }
  else { failed++; failures.push(`${label}${detail ? ` — ${detail}` : ""}`); console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`); }
}
function section(name: string): void { console.log(`\n== ${name}`); }

// ─────────────────────────────────────────────────────────────────────────────
// A fake recogniser that records whether it was ever started.

interface FakeSpec {
  text?: string;
  confidence?: number;
  words?: Array<{ text: string; confidence: number }>;
  recognizeThrows?: string;
  startThrows?: string;
  countStarts?: { n: number };
  countRecognize?: { n: number };
  countTerminate?: { n: number };
}

function fakeEngine(spec: FakeSpec): (lang: string, path: string) => Promise<OcrEngineHandle> {
  return async () => {
    if (spec.startThrows) throw new Error(spec.startThrows);
    if (spec.countStarts) spec.countStarts.n++;
    return {
      async recognize() {
        if (spec.countRecognize) spec.countRecognize.n++;
        if (spec.recognizeThrows) throw new Error(spec.recognizeThrows);
        return {
          data: {
            text: spec.text ?? "",
            confidence: spec.confidence ?? 92,
            words: spec.words ?? [],
          },
        };
      },
      async terminate() { if (spec.countTerminate) spec.countTerminate.n++; },
    };
  };
}

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10, 0, 0, 0, 0]);
const page = (n: number): OcrInput => ({ page: n, png: PNG });
const DATA = "/tmp/si-tessdata";
const hasData = () => true;
const hasNoData = () => false;

// ─────────────────────────────────────────────────────────────────────────────
section("1. THE LOCAL-DATA RULE — the module refuses rather than fetches");

const noPath = await readImages([page(1)], { dataPath: "", engineFactory: fakeEngine({ text: "x" }) });
ok("an empty dataPath is refused", noPath.ok === false, noPath.result ? "returned ok" : "");
ok("…with a code that names the condition", noPath.refusal?.code === "no-language-data", noPath.refusal?.code);
ok("…and words that say it does not download", /does not download/i.test(noPath.refusal?.words ?? ""), noPath.refusal?.words?.slice(0, 100));

const starts = { n: 0 };
const missing = await readImages([page(1)], {
  dataPath: DATA, hasLanguageData: hasNoData, engineFactory: fakeEngine({ text: "x", countStarts: starts }),
});
ok("missing language data is refused", missing.ok === false);
ok("…with a code naming the missing data", missing.refusal?.code === "language-data-missing", missing.refusal?.code);
ok("…the recogniser was NEVER STARTED — no fetch could have happened", starts.n === 0, `${starts.n} starts`);
ok("…and the words name the exact file to add", /eng\.traineddata/.test(missing.refusal?.words ?? ""), missing.refusal?.words?.slice(0, 140));
ok("…and the words say why it will not fetch", /does not fetch language data over the network/i.test(missing.refusal?.words ?? ""), missing.refusal?.words?.slice(0, 160));

// ─────────────────────────────────────────────────────────────────────────────
section("2. a real read reports text, confidence and the local path");

const words = [
  { text: "INVOICE", confidence: 96 },
  { text: "48200", confidence: 88 },
  { text: "INR", confidence: 92 },
];
const r = await readImages([page(1)], {
  dataPath: DATA, hasLanguageData: hasData,
  engineFactory: fakeEngine({ text: "INVOICE 48200 INR", confidence: 92, words }),
});
ok("the read succeeds", r.ok, r.refusal?.words ?? "");
ok("the text is returned", r.result?.pages[0].text === "INVOICE 48200 INR", JSON.stringify(r.result?.pages[0].text));
ok("confidence is reported", r.result?.pages[0].confidence === 92, String(r.result?.pages[0].confidence));
ok("words are returned for a caller that wants its own threshold", r.result?.pages[0].words.length === 3);
ok("…and empty words are dropped", (await readImages([page(1)], {
  dataPath: DATA, hasLanguageData: hasData,
  engineFactory: fakeEngine({ text: "a", words: [{ text: "  ", confidence: 99 }, { text: "a", confidence: 90 }] }),
})).result?.pages[0].words.length === 1);
ok("the language used is named", r.result?.language === "eng", r.result?.language);
ok("THE LOCAL PATH IS NAMED — a receipt can prove it was local", r.result?.dataPath === DATA, r.result?.dataPath);

// ─────────────────────────────────────────────────────────────────────────────
section("3. whitespace is normalised, so OCR noise does not become structure");

const messy = await readImages([page(1)], {
  dataPath: DATA, hasLanguageData: hasData,
  engineFactory: fakeEngine({ text: "  line one\r\n\r\n\r\n   line   two   \n\n\n", confidence: 80 }),
});
ok("CRLF becomes LF", !/\r/.test(messy.result?.pages[0].text ?? ""), JSON.stringify(messy.result?.pages[0].text));
ok("runs of spaces collapse", !/  /.test(messy.result?.pages[0].text ?? ""), JSON.stringify(messy.result?.pages[0].text));
ok("the text is trimmed", (messy.result?.pages[0].text ?? "").startsWith("line one"), JSON.stringify(messy.result?.pages[0].text));

// ─────────────────────────────────────────────────────────────────────────────
section("4. multi-page reads, in the caller's order");

const rec = { n: 0 };
const many = await readImages([page(1), page(2), page(3)], {
  dataPath: DATA, hasLanguageData: hasData,
  engineFactory: fakeEngine({ text: "page text", countRecognize: rec }),
});
ok("every page is read", many.result?.pages.length === 3, String(many.result?.pages.length));
ok("…in the order handed in", many.result?.pages.map((p) => p.page).join(",") === "1,2,3", JSON.stringify(many.result?.pages.map((p) => p.page)));
ok("…with one recognise call each", rec.n === 3, `${rec.n} calls`);
ok("the mean confidence is reported across pages", many.result?.confidence === 92, String(many.result?.confidence));

// ─────────────────────────────────────────────────────────────────────────────
section("5. caps are refusals in words, and they name the remedy");

const tooMany = await readImages(Array.from({ length: 25 }, (_, i) => page(i + 1)), {
  dataPath: DATA, hasLanguageData: hasData, engineFactory: fakeEngine({ text: "x" }),
});
ok("a page cap refuses rather than truncating", tooMany.ok === false, tooMany.result ? "returned ok" : "");
ok("…with a code", tooMany.refusal?.code === "too-many-pages", tooMany.refusal?.code);
ok("…naming the remedy", /split the document|read the pages that matter/i.test(tooMany.refusal?.words ?? ""), tooMany.refusal?.words?.slice(0, 110));

const tooBig = await readImages([page(1)], {
  dataPath: DATA, hasLanguageData: hasData, maxTextChars: 5,
  engineFactory: fakeEngine({ text: "far more than five characters here", confidence: 90 }),
});
ok("a character cap refuses rather than truncating", tooBig.ok === false, tooBig.result ? "returned ok" : "");
ok("…naming the remedy", /drop a chapter/i.test(tooBig.refusal?.words ?? ""), tooBig.refusal?.words?.slice(0, 100));

const noPages = await readImages([], { dataPath: DATA, hasLanguageData: hasData, engineFactory: fakeEngine({}) });
ok("no pages refuses", noPages.ok === false && noPages.refusal?.code === "no-pages", noPages.refusal?.code);

// ─────────────────────────────────────────────────────────────────────────────
section("6. the deadline is a refusal, never a partial read");

let calls = 0;
const dl = await readImages([page(1), page(2)], {
  dataPath: DATA, hasLanguageData: hasData, budgetMs: 1,
  now: () => (++calls > 1 ? 10_000_000 : 0),
  engineFactory: fakeEngine({ text: "x" }),
});
ok("an expired budget refuses", dl.ok === false, dl.result ? "returned ok" : "");
ok("…with the deadline code", dl.refusal?.code === "deadline", dl.refusal?.code);
ok("…and says how far it got, so a partial read is never dressed as a whole one",
  /after \d+ of \d+ page/i.test(dl.refusal?.words ?? ""), dl.refusal?.words?.slice(0, 110));

// ─────────────────────────────────────────────────────────────────────────────
section("7. failures arrive as words, and the recogniser is always released");

const badStart = await readImages([page(1)], {
  dataPath: DATA, hasLanguageData: hasData,
  engineFactory: fakeEngine({ startThrows: "wasm heap could not be allocated" }),
});
ok("a recogniser that will not start refuses in words", badStart.ok === false && badStart.refusal?.code === "reader-unavailable", badStart.refusal?.code);
ok("…and says what happened", /could not start/i.test(badStart.refusal?.words ?? ""), badStart.refusal?.words?.slice(0, 90));

const badRec = await readImages([page(1)], {
  dataPath: DATA, hasLanguageData: hasData,
  engineFactory: fakeEngine({ recognizeThrows: "image decode failed" }),
});
ok("a page the recogniser chokes on is a refusal, not a throw", badRec.ok === false && badRec.refusal?.code === "page-unreadable", badRec.refusal?.code);
ok("…and names the page", /page 1/.test(badRec.refusal?.words ?? ""), badRec.refusal?.words?.slice(0, 90));

const term = { n: 0 };
await readImages([page(1)], { dataPath: DATA, hasLanguageData: hasData, engineFactory: fakeEngine({ text: "x", countTerminate: term }) });
ok("the recogniser is terminated after a successful read", term.n === 1, `${term.n} terminations`);

const term2 = { n: 0 };
await readImages([page(1)], {
  dataPath: DATA, hasLanguageData: hasData, maxTextChars: 1,
  engineFactory: fakeEngine({ text: "far too long", countTerminate: term2 }),
});
ok("…and after a refusal, too", term2.n === 1, `${term2.n} terminations`);

// ─────────────────────────────────────────────────────────────────────────────
section("8. confidence is computed honestly when the engine omits it");

const noConf = await readImages([page(1)], {
  dataPath: DATA, hasLanguageData: hasData,
  engineFactory: async () => ({
    async recognize() {
      return { data: { text: "abc", confidence: Number.NaN, words: [{ text: "abc", confidence: 70 }] } };
    },
  }),
});
ok("a NaN confidence falls back to the mean of the words", noConf.result?.pages[0].confidence === 70, String(noConf.result?.pages[0].confidence));

const noWordsNoConf = await readImages([page(1)], {
  dataPath: DATA, hasLanguageData: hasData,
  engineFactory: async () => ({ async recognize() { return { data: { text: "abc", confidence: Number.NaN, words: [] } }; } }),
});
ok("with neither, confidence is 0 rather than invented", noWordsNoConf.result?.pages[0].confidence === 0, String(noWordsNoConf.result?.pages[0].confidence));

// ─────────────────────────────────────────────────────────────────────────────
section("8b. a missing image is a REFUSAL, not a crash inside the recogniser");

// The WASM worker does not validate its argument. Handed undefined it throws from inside a
// MessagePort callback, which escapes try/catch and kills the process. So the guard is
// asserted here directly rather than only via the never-throws sweep.
for (const [label, bad] of [
  ["an undefined png", [{ page: 7, png: undefined }]],
  ["a null png", [{ page: 7, png: null }]],
  ["a zero-length png", [{ page: 7, png: new Uint8Array(0) }]],
] as const) {
  const starts2 = { n: 0 };
  const out = await readImages(bad as OcrInput[], {
    dataPath: DATA, hasLanguageData: hasData,
    engineFactory: fakeEngine({ text: "x", countStarts: starts2 }),
  });
  ok(`${label} is refused`, out.ok === false && out.refusal?.code === "empty-image", out.refusal?.code);
  ok(`…the recogniser was never started for ${label}`, starts2.n === 0, `${starts2.n} starts`);
  ok(`…and the words name the page — "page 7"`, /page 7/.test(out.refusal?.words ?? ""), out.refusal?.words?.slice(0, 80));
}

section("8c. in a browser, no local core means NO READ — the defaults there are remote");

// This is the failure mode that would otherwise be invisible. In a browser the engine's
// defaults for its core Wasm, its worker script and its language data are all remote. It
// does not warn and it does not fail: it simply reaches out on first use. So the reader
// refuses to start in a browser that was not told where its local copies are. The guard is
// asserted here because nothing else in the tree can see it — the offline pack runs in
// Node, where the defaults are local and the guard correctly stays out of the way.
const g = globalThis as { window?: unknown };
const savedWindow = g.window;
g.window = {}; // pretend we are a webview
try {
  const starts = { n: 0 };
  const noCore = await readImages([page(1)], {
    dataPath: DATA, hasLanguageData: hasData, engineFactory: fakeEngine({ text: "x", countStarts: starts }),
  });
  ok("a browser read with no local core refuses", noCore.ok === false, noCore.ok ? "read succeeded" : "");
  ok("…with the reader-unavailable code", noCore.refusal?.code === "reader-unavailable", noCore.refusal?.code);
  ok("…naming the core as what is missing", /local core/.test(noCore.refusal?.words ?? ""), noCore.refusal?.words?.slice(0, 120));
  ok("…and saying nothing was fetched", /nothing was fetched/.test(noCore.refusal?.words ?? ""), "");
  ok("…and the recogniser was never started", starts.n === 0, `${starts.n} starts`);

  const partial = await readImages([page(1)], {
    dataPath: DATA, hasLanguageData: hasData, corePath: "/assets/core", engineFactory: fakeEngine({ text: "x" }),
  });
  ok("a browser read with a core but no worker script also refuses", partial.ok === false, partial.ok ? "read succeeded" : "");
  ok("…naming the worker script", /worker script/.test(partial.refusal?.words ?? ""), partial.refusal?.words?.slice(0, 120));

  const both = await readImages([page(1)], {
    dataPath: DATA, hasLanguageData: hasData, corePath: "/assets/core", workerPath: "/assets/worker.js",
    engineFactory: fakeEngine({ text: "in the webview" }),
  });
  ok("a fully-configured browser read proceeds", both.ok === true, both.ok ? "" : both.refusal?.words);
  ok("…and reads the text", both.result?.pages[0].text === "in the webview", JSON.stringify(both.result?.pages[0].text));

  // The refusal must not name a fetchable location, or the guard becomes the leak.
  const words = noCore.refusal?.words ?? "";
  ok("the refusal names no URL that could be fetched", !/https?:\/\//.test(words), words.slice(0, 120));
} finally {
  if (savedWindow === undefined) delete g.window; else g.window = savedWindow;
}

section("9. the reader never throws, whatever it is handed");

const HOSTILE: Array<[string, unknown]> = [
  ["empty inputs", []],
  ["null inputs", null],
  ["undefined inputs", undefined],
  ["a bare string", "not an array"],
  ["a page with no png", [{ page: 1 }]],
  ["a page with null png", [{ page: 1, png: null }]],
];
for (const [label, v] of HOSTILE) {
  let threw = false;
  let out: OcrOutcome | null = null;
  try {
    out = await readImages(v as OcrInput[], { dataPath: DATA, hasLanguageData: hasData, engineFactory: fakeEngine({ text: "x" }) });
  } catch { threw = true; }
  ok(`does not throw on ${label}`, !threw && out !== null && (out!.ok || !!out!.refusal?.code), threw ? "THREW" : JSON.stringify(out?.refusal?.code ?? "ok"));
}

// ─────────────────────────────────────────────────────────────────────────────
section("10. determinism — the same input gives the same answer, twice");

const strip = (o: OcrOutcome) => JSON.stringify(o);
const opts = { dataPath: DATA, hasLanguageData: hasData, engineFactory: fakeEngine({ text: "INVOICE 48200", confidence: 91, words }) };
const d1 = await readImages([page(1), page(2)], opts);
const d2 = await readImages([page(1), page(2)], opts);
ok("identical outcome on repeat", strip(d1) === strip(d2));
ok("…and the decision to refuse is deterministic too",
  strip(await readImages([page(1)], { dataPath: DATA, hasLanguageData: hasNoData })) ===
  strip(await readImages([page(1)], { dataPath: DATA, hasLanguageData: hasNoData })));

// ─────────────────────────────────────────────────────────────────────────────
section("11. the ledger line tells the truth, including about poor reads");

const lineOk = ocrLine(r, "scanned-circular.pdf");
ok("a read names the local folder it used", lineOk.includes(DATA), lineOk);
ok("…so a receipt can prove the read was local", /read locally from/.test(lineOk), lineOk);
ok("…and reports confidence", /confidence 92\.0%/.test(lineOk), lineOk);
ok("…and the language", /\beng\b/.test(lineOk), lineOk);

const poor = await readImages([page(1)], {
  dataPath: DATA, hasLanguageData: hasData,
  engineFactory: fakeEngine({ text: "smudged", confidence: 31 }),
});
const linePoor = ocrLine(poor, "bad-scan.pdf");
ok("a below-floor read SAYS it is unreliable", /BELOW the confidence floor/i.test(linePoor), linePoor);
ok("…and says what to do about it", /unreliable/i.test(linePoor), linePoor);

const lineRefused = ocrLine(missing, "no-data.pdf");
ok("a refusal line names the code", /OCR refused \[language-data-missing\]/.test(lineRefused), lineRefused);

// ─────────────────────────────────────────────────────────────────────────────
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) { console.log("\nfailures:"); for (const f of failures) console.log(`  - ${f}`); }
process.exit(failed > 0 ? 1 : 0);
