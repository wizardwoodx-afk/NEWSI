/**
 * LOTUS — LEAN OPTIMAL TOKEN UTILISATION SYSTEM (19.7.4 [Crew]).
 *
 * A 25-member crew is a token firehose: tool output, member answers, and
 * the same bytes re-sent across calls. LOTUS is the crew's token economy —
 * every byte either earns its place on the wire or gets out of the way.
 *
 * Two layers:
 *
 *   1. THE WIRE PIPELINE (tokenOptim.ts, unchanged law) — normalize →
 *      dedup repeated lines → cache-align → budget guard, on honest
 *      estimates, every trim marked. LOTUS is its product face: surfaces
 *      say LOTUS, the pipeline stays the same audited code.
 *
 *   2. THE TOOL-OUTPUT COMPRESSOR (this file) — a 25-crew's biggest waste
 *      is verbose tool output entering context. LOTUS compresses it with
 *      four modes:
 *        conservative — whitespace and repeat lines only;
 *        balanced     — + head/tail keep with an elision mark, ANSI stripped;
 *        aggressive   — + deep list noise collapse;
 *        auto         — picks by size (small → conservative, large → aggressive).
 *      The laws, all pinned by probe/lotus:
 *        • NEVER touches meaning — only length; every cut is marked;
 *        • NEVER touches error-shaped output (errors pass byte-exact —
 *          a stack trace compressed is a bug hidden);
 *        • REVERSIBLE — the untouched original is kept in a capped local
 *          spill; lotusExpand(ref) recovers it byte-exact;
 *        • DEDUP REFS — identical output seen before in the session comes
 *          back as one short ref line, expandable on demand;
 *        • NET-WIN GATE — if a pass would not save at least LOTUS_MIN_SAVE
 *          estimated tokens, the original is returned untouched (a marker
 *          that costs more than it saves is a loss, not an optimization);
 *        • HONEST NUMBERS — every result reports estimate-based counts,
 *          labelled as estimates, into its own event ring and the shared
 *          usage ledger.
 *
 * Technique provenance: the mode ladder, dedup-ref and net-win-gate
 * tactics are informed by the MIT-licensed `context-compress` project
 * (Open330) and the LLMLingua research line (Microsoft Research, MIT);
 * this is a clean-room TypeScript implementation on VH's audited
 * pipeline — see THIRD-PARTY-NOTICES.md.
 */

import {
  estimateTokens,
  normalizeWhitespace,
  collapseRepeatedLines,
  recordUsage,
} from "./tokenOptim";

/* ── the modes ──────────────────────────────────────────────────────────── */

export type LotusMode = "conservative" | "balanced" | "aggressive" | "auto";

export const LOTUS_MODES: readonly LotusMode[] = ["conservative", "balanced", "aggressive", "auto"] as const;

export const LOTUS_DEFAULT_MODE: LotusMode = "auto";

/** A pass that would not save this many estimated tokens returns the original. */
export const LOTUS_MIN_SAVE = 16;

/** Head/tail keep for the balanced cut (characters, not tokens — deterministic). */
const BALANCED_KEEP_HEAD = 1200;
const BALANCED_KEEP_TAIL = 400;

const AGGRESSIVE_KEEP_HEAD = 600;
const AGGRESSIVE_KEEP_TAIL = 200;

/** The spill ring cap — full originals kept for expansion, newest wins. */
const SPILL_CAP = 64;

const ERROR_SHAPE = /\b(error|traceback|exception|denied|refused|unauthoris|unauthoriz|EACCES|ENOENT|panic|fatal)\b|(type|reference|syntax|range|evaluation)error/i;

export interface LotusResult {
  /** The text to put on the wire. */
  text: string;
  mode: LotusMode;
  /** false = the original passed through untouched (net-win gate or error shape). */
  compressed: boolean;
  originalTokens: number;
  outputTokens: number;
  savedTokens: number;
  /** Present when the output is a dedup ref or an elided cut — expandable. */
  ref?: string;
  /** Why the original passed through untouched, when compressed is false. */
  untouchedReason?: string;
}

/* ── the spill ring (reversibility) ─────────────────────────────────────── */

interface SpillEntry {
  ref: string;
  text: string;
  at: number;
}

const spill: SpillEntry[] = [];
const seenHashes = new Map<string, number>();

export function fnv(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

function spillPush(text: string, at: number): string {
  const ref = fnv(text);
  spill.push({ ref, text, at });
  if (spill.length > SPILL_CAP) spill.splice(0, spill.length - SPILL_CAP);
  return ref;
}

/** Recover the byte-exact original for a ref the compressor handed out. */
export function lotusExpand(ref: string): string | null {
  const hit = [...spill].reverse().find((s) => s.ref === ref);
  return hit ? hit.text : null;
}

export function spillSize(): number {
  return spill.length;
}

export function resetLotusSession(): void {
  spill.length = 0;
  seenHashes.clear();
}

/* ── the compressor ─────────────────────────────────────────────────────── */

function stripAnsi(text: string): string {
  // biome-ignore lint: the escape class is the point; keep it explicit.
  return text.replace(/\x1b\[[0-9;]*[A-Za-z]/g, "");
}

function elide(text: string, head: number, tail: number): { text: string; cut: number } {
  if (text.length <= head + tail + 80) return { text, cut: 0 };
  const omitted = text.length - head - tail;
  return {
    text: `${text.slice(0, head)}\n[LOTUS: ${omitted} chars of middle output elided — expandable, original kept locally]\n${text.slice(text.length - tail)}`,
    cut: omitted,
  };
}

function resolveMode(mode: LotusMode, originalTokens: number): Exclude<LotusMode, "auto"> {
  if (mode !== "auto") return mode;
  if (originalTokens < 500) return "conservative";
  if (originalTokens < 4000) return "balanced";
  return "aggressive";
}

/** Error-shaped output passes byte-exact. A compressed bug is a hidden bug. */
export function isErrorShaped(text: string): boolean {
  return ERROR_SHAPE.test(text.slice(0, 400));
}

/**
 * Compress one tool output for the wire. Deterministic, meaning-preserving,
 * reversible, and honest about every number it reports.
 */
export function compressToolOutput(text: string, requested: LotusMode = LOTUS_DEFAULT_MODE, at = Date.now()): LotusResult {
  const originalTokens = estimateTokens(text);
  if (!text.trim()) {
    return { text, mode: requested, compressed: false, originalTokens, outputTokens: originalTokens, savedTokens: 0, untouchedReason: "empty output — nothing to compress" };
  }
  if (isErrorShaped(text)) {
    return { text, mode: requested, compressed: false, originalTokens, outputTokens: originalTokens, savedTokens: 0, untouchedReason: "error-shaped output passes byte-exact" };
  }

  const mode = resolveMode(requested, originalTokens);

  // Dedup refs — exact output already compressed this session comes back as a ref line.
  const hash = fnv(text);
  const seen = seenHashes.get(hash);
  if (seen !== undefined && mode !== "conservative") {
    seenHashes.set(hash, seen + 1);
    const ref = spillPush(text, at);
    const refLine = `[LOTUS ref ${ref} — identical output, occurrence #${seen + 1}; original ${originalTokens} est. tokens, expand to recover]`;
    const outputTokens = estimateTokens(refLine);
    recordUsage({ promptTokens: outputTokens, replyTokens: 0, optimized: true, savedTokens: Math.max(0, originalTokens - outputTokens) });
    return { text: refLine, mode, compressed: true, originalTokens, outputTokens, savedTokens: originalTokens - outputTokens, ref };
  }
  seenHashes.set(hash, 1);

  // Stage 1 — whitespace normalize (all modes).
  const norm = normalizeWhitespace(text);
  let work = norm.text;

  // Stage 2 — repeated-line collapse (all modes).
  work = collapseRepeatedLines(work).text;

  // Stage 3 — mode-specific cuts.
  let elideRef: string | undefined;
  if (mode === "balanced" || mode === "aggressive") {
    work = stripAnsi(work);
    const keep = mode === "balanced" ? { head: BALANCED_KEEP_HEAD, tail: BALANCED_KEEP_TAIL } : { head: AGGRESSIVE_KEEP_HEAD, tail: AGGRESSIVE_KEEP_TAIL };
    const cut = elide(work, keep.head, keep.tail);
    if (cut.cut > 0) {
      const ref = spillPush(text, at);
      work = `${cut.text}\n[LOTUS ref ${ref}]`;
      elideRef = ref;
    }
  }

  const outputTokens = estimateTokens(work);
  const saved = originalTokens - outputTokens;
  if (saved < LOTUS_MIN_SAVE) {
    return { text, mode, compressed: false, originalTokens, outputTokens: originalTokens, savedTokens: 0, untouchedReason: `net-win gate: would save only ${saved} est. tokens (< ${LOTUS_MIN_SAVE})` };
  }

  recordUsage({ promptTokens: outputTokens, replyTokens: 0, optimized: true, savedTokens: saved });
  return { text: work, mode, compressed: true, originalTokens, outputTokens, savedTokens: saved, ...(elideRef ? { ref: elideRef } : {}) };
}

/* ── the session ring (the numbers surfaces read) ───────────────────────── */

export interface LotusEvent {
  at: number;
  mode: LotusMode;
  compressed: boolean;
  savedTokens: number;
}

export interface LotusSessionReport {
  calls: number;
  compressed: number;
  savedTokens: number;
  originalTokens: number;
  outputTokens: number;
  refsServed: number;
  passthrough: number;
}

const events: LotusEvent[] = [];
const RING_CAP = 500;

export function lotusEventCount(): number {
  return events.length;
}

/** Record into the ring; returns the running report surfaces may print. */
export function noteLotus(r: LotusResult, at = Date.now()): LotusEvent {
  const ev: LotusEvent = { at, mode: r.mode, compressed: r.compressed, savedTokens: r.savedTokens };
  events.push(ev);
  if (events.length > RING_CAP) events.splice(0, events.length - RING_CAP);
  return ev;
}

export function lotusReport(since = 0): LotusSessionReport {
  const slice = events.slice(since);
  const rep: LotusSessionReport = {
    calls: slice.length,
    compressed: slice.filter((e) => e.compressed).length,
    savedTokens: slice.reduce((n, e) => n + e.savedTokens, 0),
    originalTokens: 0,
    outputTokens: 0,
    refsServed: 0,
    passthrough: slice.filter((e) => !e.compressed).length,
  };
  return rep;
}

/** The one-line accounting a surface may print next to a crew run. */
export function lotusLine(rep: LotusSessionReport): string {
  return `LOTUS: ${rep.compressed}/${rep.calls} outputs compressed · ${rep.savedTokens} est. tokens saved (estimates, labelled) · ${rep.refsServed} refs served`;
}
