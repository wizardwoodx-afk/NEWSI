import { createRequire as __mjCreateRequire } from "node:module"; const require = __mjCreateRequire(import.meta.url);

// src/engine/tokenOptim.ts
var LEDGER_KEY = "engine.tokens.v1";
var LEDGER_CAP = 500;
function estimateTokens(text) {
  return Math.ceil(text.length / 4);
}
function normalizeWhitespace(text) {
  const out = text.replace(/[ \t]+$/gm, "").replace(/\n{3,}/g, "\n\n").replace(/\n +/g, "\n ").trimEnd();
  return { text: out, removedChars: Math.max(0, text.length - out.length) };
}
function collapseRepeatedLines(text, tolerance = 2) {
  if (tolerance < 1) tolerance = 1;
  const lines = text.split("\n");
  const totals = /* @__PURE__ */ new Map();
  for (const line of lines) {
    const t = line.trim();
    if (t.length >= 8 && !/^#|^[-*+] |^```|^\d+\. /.test(t)) totals.set(t, (totals.get(t) ?? 0) + 1);
  }
  const counts = /* @__PURE__ */ new Map();
  const kept = [];
  let collapsed = 0;
  for (const line of lines) {
    const t = line.trim();
    if (t.length < 8 || /^#|^[-*+] |^```|^\d+\. /.test(t)) {
      kept.push(line);
      continue;
    }
    const n = counts.get(t) ?? 0;
    counts.set(t, n + 1);
    if (n < tolerance) {
      kept.push(line);
    } else if (n === tolerance) {
      collapsed += 1;
      const rest = Math.max(0, (totals.get(t) ?? 0) - tolerance);
      kept.push(`${line}  [\u2026 this exact line repeats ${rest} more time${rest === 1 ? "" : "s"} below \u2014 repeats elided by the token optimizer \u2026]`);
    } else {
      collapsed += 1;
    }
  }
  return { text: kept.join("\n"), collapsed };
}
function storage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}
function recordUsage(entry, now = () => /* @__PURE__ */ new Date()) {
  const raw = storage()?.getItem(LEDGER_KEY);
  let list = [];
  try {
    const parsed = raw ? JSON.parse(raw) : [];
    if (Array.isArray(parsed)) list = parsed;
  } catch {
  }
  list.push({ ...entry, at: now().toISOString() });
  storage()?.setItem(LEDGER_KEY, JSON.stringify(list.slice(-LEDGER_CAP)));
}

// src/engine/lotus.ts
var LOTUS_MODES = ["conservative", "balanced", "aggressive", "auto"];
var LOTUS_DEFAULT_MODE = "auto";
var LOTUS_MIN_SAVE = 16;
var BALANCED_KEEP_HEAD = 1200;
var BALANCED_KEEP_TAIL = 400;
var AGGRESSIVE_KEEP_HEAD = 600;
var AGGRESSIVE_KEEP_TAIL = 200;
var SPILL_CAP = 64;
var ERROR_SHAPE = /\b(error|traceback|exception|denied|refused|unauthoris|unauthoriz|EACCES|ENOENT|panic|fatal)\b|(type|reference|syntax|range|evaluation)error/i;
var spill = [];
var seenHashes = /* @__PURE__ */ new Map();
function fnv(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}
function spillPush(text, at) {
  const ref = fnv(text);
  spill.push({ ref, text, at });
  if (spill.length > SPILL_CAP) spill.splice(0, spill.length - SPILL_CAP);
  return ref;
}
function lotusExpand(ref) {
  const hit = [...spill].reverse().find((s) => s.ref === ref);
  return hit ? hit.text : null;
}
function spillSize() {
  return spill.length;
}
function resetLotusSession() {
  spill.length = 0;
  seenHashes.clear();
}
function stripAnsi(text) {
  return text.replace(/\x1b\[[0-9;]*[A-Za-z]/g, "");
}
function elide(text, head, tail) {
  if (text.length <= head + tail + 80) return { text, cut: 0 };
  const omitted = text.length - head - tail;
  return {
    text: `${text.slice(0, head)}
[LOTUS: ${omitted} chars of middle output elided \u2014 expandable, original kept locally]
${text.slice(text.length - tail)}`,
    cut: omitted
  };
}
function resolveMode(mode, originalTokens) {
  if (mode !== "auto") return mode;
  if (originalTokens < 500) return "conservative";
  if (originalTokens < 4e3) return "balanced";
  return "aggressive";
}
function isErrorShaped(text) {
  return ERROR_SHAPE.test(text.slice(0, 400));
}
function compressToolOutput(text, requested = LOTUS_DEFAULT_MODE, at = Date.now()) {
  const originalTokens = estimateTokens(text);
  if (!text.trim()) {
    return { text, mode: requested, compressed: false, originalTokens, outputTokens: originalTokens, savedTokens: 0, untouchedReason: "empty output \u2014 nothing to compress" };
  }
  if (isErrorShaped(text)) {
    return { text, mode: requested, compressed: false, originalTokens, outputTokens: originalTokens, savedTokens: 0, untouchedReason: "error-shaped output passes byte-exact" };
  }
  const mode = resolveMode(requested, originalTokens);
  const hash = fnv(text);
  const seen = seenHashes.get(hash);
  if (seen !== void 0 && mode !== "conservative") {
    seenHashes.set(hash, seen + 1);
    const ref = spillPush(text, at);
    const refLine = `[LOTUS ref ${ref} \u2014 identical output, occurrence #${seen + 1}; original ${originalTokens} est. tokens, expand to recover]`;
    const outputTokens2 = estimateTokens(refLine);
    recordUsage({ promptTokens: outputTokens2, replyTokens: 0, optimized: true, savedTokens: Math.max(0, originalTokens - outputTokens2) });
    return { text: refLine, mode, compressed: true, originalTokens, outputTokens: outputTokens2, savedTokens: originalTokens - outputTokens2, ref };
  }
  seenHashes.set(hash, 1);
  const norm = normalizeWhitespace(text);
  let work = norm.text;
  work = collapseRepeatedLines(work).text;
  let elideRef;
  if (mode === "balanced" || mode === "aggressive") {
    work = stripAnsi(work);
    const keep = mode === "balanced" ? { head: BALANCED_KEEP_HEAD, tail: BALANCED_KEEP_TAIL } : { head: AGGRESSIVE_KEEP_HEAD, tail: AGGRESSIVE_KEEP_TAIL };
    const cut = elide(work, keep.head, keep.tail);
    if (cut.cut > 0) {
      const ref = spillPush(text, at);
      work = `${cut.text}
[LOTUS ref ${ref}]`;
      elideRef = ref;
    }
  }
  const outputTokens = estimateTokens(work);
  const saved = originalTokens - outputTokens;
  if (saved < LOTUS_MIN_SAVE) {
    return { text, mode, compressed: false, originalTokens, outputTokens: originalTokens, savedTokens: 0, untouchedReason: `net-win gate: would save only ${saved} est. tokens (< ${LOTUS_MIN_SAVE})` };
  }
  recordUsage({ promptTokens: outputTokens, replyTokens: 0, optimized: true, savedTokens: saved });
  return { text: work, mode, compressed: true, originalTokens, outputTokens, savedTokens: saved, ...elideRef ? { ref: elideRef } : {} };
}
var events = [];
var RING_CAP = 500;
function noteLotus(r, at = Date.now()) {
  const ev = { at, mode: r.mode, compressed: r.compressed, savedTokens: r.savedTokens };
  events.push(ev);
  if (events.length > RING_CAP) events.splice(0, events.length - RING_CAP);
  return ev;
}
function lotusReport(since = 0) {
  const slice = events.slice(since);
  const rep = {
    calls: slice.length,
    compressed: slice.filter((e) => e.compressed).length,
    savedTokens: slice.reduce((n, e) => n + e.savedTokens, 0),
    originalTokens: 0,
    outputTokens: 0,
    refsServed: 0,
    passthrough: slice.filter((e) => !e.compressed).length
  };
  return rep;
}
function lotusLine(rep) {
  return `LOTUS: ${rep.compressed}/${rep.calls} outputs compressed \xB7 ${rep.savedTokens} est. tokens saved (estimates, labelled) \xB7 ${rep.refsServed} refs served`;
}

// probe/lotus.test.ts
var passed = 0;
var failed = 0;
var failures = [];
function ok(label, cond, detail = "") {
  if (cond) {
    passed++;
    console.log(`  ok   ${label}`);
  } else {
    failed++;
    failures.push(`${label}${detail ? ` \u2014 ${detail}` : ""}`);
    console.log(`  FAIL ${label}${detail ? ` \u2014 ${detail}` : ""}`);
  }
}
function noisy(n) {
  const lines = [];
  for (let i = 0; i < n; i++) lines.push(`item ${i}: value ${i * 7} status ok path /very/long/path/number/${i}/under/root \u2014 with trailing padding text to make each line long enough to matter for the estimate`);
  return lines.join("\n");
}
function main() {
  console.log("lotus \u2014 the crew's token economy");
  ok("four modes, auto is the default", LOTUS_MODES.length === 4 && LOTUS_MODES.includes("auto") && LOTUS_DEFAULT_MODE === "auto");
  ok("the net-win gate is a real floor", LOTUS_MIN_SAVE === 16);
  const err = "TypeError: cannot read properties of undefined (reading 'id')\n    at handler (app.ts:41:19)\n    at process (tick.js:9:3)";
  ok("error-shaped output is detected", isErrorShaped(err));
  const errRes = compressToolOutput(err, "aggressive");
  ok("errors pass byte-exact \u2014 a compressed bug is a hidden bug", !errRes.compressed && errRes.text === err && errRes.untouchedReason === "error-shaped output passes byte-exact");
  const tiny = "ok";
  const tinyRes = compressToolOutput(tiny, "aggressive");
  ok("a pass that cannot pay for itself is refused", !tinyRes.compressed && tinyRes.text === tiny && (tinyRes.untouchedReason ?? "").includes("net-win gate"));
  resetLotusSession();
  const big = noisy(60);
  const res = compressToolOutput(big, "balanced");
  ok("balanced compresses a big listing", res.compressed && res.savedTokens > 0);
  ok("the numbers are honest: saved = original \u2212 output", res.savedTokens === res.originalTokens - res.outputTokens && res.originalTokens > res.outputTokens);
  ok("the cut is marked, not silent", res.text.includes("LOTUS:") && res.text.includes("elided"));
  ok("head and tail survive \u2014 the cut is the MIDDLE only", res.text.startsWith(big.slice(0, 40)) && res.text.includes(big.slice(-60).trimEnd().slice(-40)));
  ok("the elided original is kept in the spill", spillSize() >= 1 && typeof res.ref === "string");
  const restored = res.ref ? lotusExpand(res.ref) : null;
  ok("lotusExpand recovers the byte-exact original", restored === big);
  const again = compressToolOutput(big, "balanced");
  ok("identical output compresses to a short ref line", again.compressed && again.text.includes("identical output") && again.savedTokens === again.originalTokens - again.outputTokens);
  ok("the ref line costs a handful of tokens, not the payload", again.outputTokens < 60, `got ${again.outputTokens}`);
  ok("the occurrence count is stated", again.text.includes("occurrence #2"));
  const smallAuto = compressToolOutput("one short line of output", "auto");
  ok("auto picks conservative for small output", smallAuto.mode === "conservative");
  const hugeAuto = compressToolOutput(noisy(400), "auto");
  ok("auto picks aggressive for huge output", hugeAuto.mode === "aggressive");
  const consBig = compressToolOutput(noisy(60), "conservative");
  ok("conservative still normalizes \u2014 but never elides", consBig.compressed === false || !consBig.text.includes("elided"));
  resetLotusSession();
  const r1 = compressToolOutput(noisy(60), "balanced");
  noteLotus(r1);
  const r2 = compressToolOutput(err, "aggressive");
  noteLotus(r2);
  const rep = lotusReport();
  ok("the report counts compressed and passthrough separately", rep.calls === 2 && rep.compressed === 1 && rep.passthrough === 1);
  ok("the report sums real savings, labelled estimates", rep.savedTokens === r1.savedTokens);
  const line = lotusLine(rep);
  ok("the line states compressed/total, savings, and the estimate label", line.includes("1/2") && line.includes("est. tokens saved") && line.includes("estimates, labelled"));
  ok("reset clears the session state", (() => {
    resetLotusSession();
    return spillSize();
  })() === 0);
  console.log(`
${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.log("\nfailures:");
    for (const f of failures) console.log(`  - ${f}`);
    process.exit(1);
  }
}
main();
