/**
 * SelfImpulse — the autonomous token optimization pipeline (upgraded in 19.7.0).
 *
 * Honest naming, unchanged since 19.2.0: this is a PROMPT-BUDGET optimizer
 * working on token ESTIMATES (~4 chars/token) — not a tokenizer-exact
 * counter. Providers tokenize differently and the estimate can be
 * materially off; every surface says "estimate". The budgeting, the marked
 * trims and the local usage ledger are real.
 *
 * 19.7.0 — the single-budget fitter grew into a PIPELINE, because the
 * biggest waste in an agent fleet is not one oversized prompt, it is the
 * same bytes re-sent on every call. The wire pipeline (optimizeWirePair)
 * now runs, in order:
 *
 *   1. NORMALIZE   — collapse whitespace bloat (3+ newlines, trailing
 *                    spaces). Meaning-preserving, byte-deterministic.
 *   2. DEDUP       — collapse exact repeated lines inside a text beyond a
 *                    tolerance, replacing the repeats with one marked line.
 *                    Also measures cross-call system stability.
 *   3. CACHE-ALIGN — the system text is the prompt prefix; when its bytes
 *                    are identical across calls (the normal case: same
 *                    specialist, same playbook), the provider's prompt
 *                    cache can serve the prefix at a fraction of the cost.
 *                    We measure prefix stability and report it honestly —
 *                    the pipeline NEVER edits the system text to gain
 *                    cache hits, because an unstable prefix is a correctness
 *                    choice, not a formatting accident.
 *   4. BUDGET      — the emergency fitToBudget guard, unchanged, only for
 *                    egregious overshoot (wire budget is deliberately
 *                    generous; the composed-prompt budget still governs).
 *
 * Every stage reports its own numbers into an in-memory event ring, and
 * `optimDelta` lets a caller scope the numbers to ONE run (the console
 * snapshots before/after each ask). Estimates are labelled everywhere.
 * No provider is called by this module; it never changes meaning, only
 * length, and it marks what it trimmed.
 */

const LEDGER_KEY = "engine.tokens.v1";
const LEDGER_CAP = 500;

/** Default budget for a composed system prompt (base + skills). */
export const PROMPT_BUDGET = 6000;

/** Emergency budget for a whole wire pair (system + user), 19.7.0. */
export const WIRE_BUDGET = 24_000;

export interface TokenLedgerEntry {
  at: string;
  promptTokens: number;
  replyTokens: number;
  optimized: boolean;
  savedTokens: number;
}

export interface TokenUsageReport {
  calls: number;
  promptTokens: number;
  replyTokens: number;
  optimizedCalls: number;
  savedTokens: number;
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/** Fast, stable, synchronous 64-bit-ish hash (FNV-1a, hex) — dedup only, never a receipt. */
export function fnv1a(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  // two rounds with a different basis widen the space cheaply
  let h2 = 0x811c9dc5 ^ 0x9e3779b9;
  for (let i = text.length - 1; i >= 0; i--) {
    h2 ^= text.charCodeAt(i);
    h2 = Math.imul(h2, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0") + (h2 >>> 0).toString(16).padStart(8, "0");
}

/**
 * Fit text to a token budget without lying about it: the middle is trimmed
 * and the cut is marked in the text itself. Head and tail survive — the
 * head carries the role, the tail carries the checklist.
 */
export function fitToBudget(text: string, budgetTokens: number): { text: string; trimmed: boolean; savedTokens: number } {
  const total = estimateTokens(text);
  if (total <= budgetTokens) return { text, trimmed: false, savedTokens: 0 };
  const keepChars = Math.max(400, budgetTokens * 4 - 120);
  const headLen = Math.floor(keepChars * 0.6);
  const tailLen = keepChars - headLen;
  const cut = total - budgetTokens;
  const out = `${text.slice(0, headLen)}\n[… ${cut} tokens trimmed by the VH token optimizer — full playbook preserved in the skill library …]\n${text.slice(text.length - tailLen)}`;
  return { text: out, trimmed: true, savedTokens: Math.max(0, total - estimateTokens(out)) };
}

/* ── 19.7.0 pipeline stages ─────────────────────────────────────────────── */

/** Stage 1 — whitespace normalization. Deterministic, meaning-preserving. */
export function normalizeWhitespace(text: string): { text: string; removedChars: number } {
  const out = text
    .replace(/[ \t]+$/gm, "")            // trailing spaces per line
    .replace(/\n{3,}/g, "\n\n")          // 3+ newlines collapse to one blank line
    .replace(/\n +/g, "\n ")             // keep single-space indents sane (no deep strip)
    .trimEnd();
  return { text: out, removedChars: Math.max(0, text.length - out.length) };
}

/** Stage 2 — collapse exact repeated lines (runs and scattered), marked in place. */
export function collapseRepeatedLines(text: string, tolerance = 2): { text: string; collapsed: number } {
  if (tolerance < 1) tolerance = 1;
  const lines = text.split("\n");
  const totals = new Map<string, number>();
  for (const line of lines) {
    const t = line.trim();
    if (t.length >= 8 && !/^#|^[-*+] |^```|^\d+\. /.test(t)) totals.set(t, (totals.get(t) ?? 0) + 1);
  }
  const counts = new Map<string, number>();
  const kept: string[] = [];
  let collapsed = 0;
  for (const line of lines) {
    const t = line.trim();
    // short/structural lines are exempt — blank lines, headers, list markers, fences
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
      kept.push(`${line}  [… this exact line repeats ${rest} more time${rest === 1 ? "" : "s"} below — repeats elided by the token optimizer …]`);
    } else {
      collapsed += 1; // silently absorbed into the marker above
    }
  }
  return { text: kept.join("\n"), collapsed };
}

/* ── the wire pipeline ──────────────────────────────────────────────────── */

export interface WireOptimReport {
  /** token estimates, always labelled as estimates downstream */
  beforeTokens: number;
  afterTokens: number;
  savedTokens: number;
  savedPct: number;
  /** stage counters */
  normalizedChars: number;
  collapsedLines: number;
  /** prefix (system) bytes identical to the previous call on this model */
  cacheAligned: boolean;
  prefixTokens: number;
  /** the emergency budget guard fired */
  budgetTrimmed: boolean;
  est: true;
}

export interface WireOptimResult {
  system: string;
  user: string;
  report: WireOptimReport;
}

interface WireEvent extends WireOptimReport {
  seq: number;
  at: string;
  model: string;
  kind: string;
}

const EVENT_CAP = 400;
const wireEvents: WireEvent[] = [];
let wireSeq = 0;
let lastPrefix: { model: string; hash: string } | null = null;

function recordEvent(e: WireEvent): void {
  wireEvents.push(e);
  if (wireEvents.length > EVENT_CAP) wireEvents.splice(0, wireEvents.length - EVENT_CAP);
}

/**
 * The full pipeline over one (system, user) wire pair. Never throws: on any
 * internal surprise it returns the inputs unchanged with an honest report.
 */
export function optimizeWirePair(system: string, user: string, ctx: { model: string; kind?: string } = { model: "unknown" }): WireOptimResult {
  try {
    const beforeTokens = estimateTokens(system) + estimateTokens(user);

    // 1 — normalize both texts
    const nSys = normalizeWhitespace(system);
    const nUsr = normalizeWhitespace(user);

    // 2 — collapse repeated lines (system blocks repeat tool playbooks most)
    const cSys = collapseRepeatedLines(nSys.text);
    const cUsr = collapseRepeatedLines(nUsr.text);

    // 3 — cache alignment: MEASURED on the (possibly normalized) system text
    const prefixHash = fnv1a(cSys.text);
    const cacheAligned = lastPrefix !== null && lastPrefix.model === ctx.model && lastPrefix.hash === prefixHash;
    lastPrefix = { model: ctx.model, hash: prefixHash };

    // 4 — emergency budget guard on the pair (generous; only egregious overshoot)
    let outSys = cSys.text;
    let outUsr = cUsr.text;
    let budgetTrimmed = false;
    const pair = `${outSys}\n${outUsr}`;
    if (estimateTokens(pair) > WIRE_BUDGET) {
      const f = fitToBudget(pair, WIRE_BUDGET);
      if (f.trimmed) {
        // the tail of the PAIR is the user text; the head is the system.
        // split at the marker the fitter writes so roles survive the trim.
        const at = f.text.indexOf("… tokens trimmed by the VH token optimizer");
        const sysPart = at >= 0 ? f.text.slice(0, at) : f.text;
        const usrPart = at >= 0 ? f.text.slice(at) : "";
        outSys = sysPart.replace(/\n$/, "");
        outUsr = usrPart && usrPart.length > 40 ? usrPart : outUsr; // never gut the actual request
        budgetTrimmed = true;
      }
    }

    const afterTokens = estimateTokens(outSys) + estimateTokens(outUsr);
    const savedTokens = Math.max(0, beforeTokens - afterTokens);
    const report: WireOptimReport = {
      beforeTokens,
      afterTokens,
      savedTokens,
      savedPct: beforeTokens === 0 ? 0 : Math.round((savedTokens / beforeTokens) * 100),
      normalizedChars: nSys.removedChars + nUsr.removedChars,
      collapsedLines: cSys.collapsed + cUsr.collapsed,
      cacheAligned,
      prefixTokens: estimateTokens(outSys),
      budgetTrimmed,
      est: true,
    };
    wireSeq += 1;
    recordEvent({ ...report, seq: wireSeq, at: new Date().toISOString(), model: ctx.model, kind: ctx.kind ?? "provider-call" });
    return { system: outSys, user: outUsr, report };
  } catch {
    const beforeTokens = estimateTokens(system) + estimateTokens(user);
    wireSeq += 1;
    recordEvent({
      seq: wireSeq, at: new Date().toISOString(), model: ctx.model, kind: ctx.kind ?? "provider-call",
      beforeTokens, afterTokens: beforeTokens, savedTokens: 0, savedPct: 0,
      normalizedChars: 0, collapsedLines: 0, cacheAligned: false, prefixTokens: estimateTokens(system), budgetTrimmed: false, est: true,
    });
    return { system, user, report: { beforeTokens, afterTokens: beforeTokens, savedTokens: 0, savedPct: 0, normalizedChars: 0, collapsedLines: 0, cacheAligned: false, prefixTokens: estimateTokens(system), budgetTrimmed: false, est: true } };
  }
}

/** Monotonic sequence of the wire event ring — snapshot before a run. */
export function wireEventSeq(): number {
  return wireSeq;
}

/** Aggregate the pipeline's events after a snapshot — one run's honest delta. */
export type OptimDelta = WireOptimReport & { calls: number };
export function optimDelta(sinceSeq: number): OptimDelta {
  const evs: WireOptimReport[] = wireEvents.filter((e) => e.seq > sinceSeq);
  return evs.reduce<OptimDelta>(
    (acc, e) => ({
      calls: acc.calls + 1,
      beforeTokens: acc.beforeTokens + e.beforeTokens,
      afterTokens: acc.afterTokens + e.afterTokens,
      savedTokens: acc.savedTokens + e.savedTokens,
      savedPct: acc.savedPct + e.savedPct,
      normalizedChars: acc.normalizedChars + e.normalizedChars,
      collapsedLines: acc.collapsedLines + e.collapsedLines,
      cacheAligned: acc.cacheAligned || e.cacheAligned,
      prefixTokens: acc.prefixTokens + e.prefixTokens,
      budgetTrimmed: acc.budgetTrimmed || e.budgetTrimmed,
      est: true as const,
    }),
    {
      calls: 0, beforeTokens: 0, afterTokens: 0, savedTokens: 0, savedPct: 0,
      normalizedChars: 0, collapsedLines: 0, cacheAligned: false, prefixTokens: 0, budgetTrimmed: false, est: true as const,
    },
  );
}

/** Reset cross-call cache state (probe seam; also honest: a NEW SESSION has no prefix history). */
export function resetWireCacheState(): void {
  lastPrefix = null;
}

/**
 * Optimize a composed specialist prompt (base prompt + skill blocks) to a
 * budget. Order of sacrifice: skill examples → skill body middles. The
 * base prompt (identity + working rule) and every skill's checklist line
 * survive whenever the budget allows. (19.1.0 logic, preserved; 19.7.0 adds
 * a normalize pre-pass so whitespace bloat never counts against budget.)
 */
export function optimizeComposedPrompt(
  composed: string,
  budgetTokens: number = PROMPT_BUDGET,
): { prompt: string; optimized: boolean; savedTokens: number; estimatedTokens: number } {
  const normalized = normalizeWhitespace(composed).text;
  const before = estimateTokens(normalized);
  if (before <= budgetTokens) return { prompt: normalized, optimized: false, savedTokens: 0, estimatedTokens: before };

  // Split base prompt from skill blocks (the skills layer joins them under a fixed header).
  const MARKER = "## Bound skills";
  const at = normalized.indexOf(MARKER);
  if (at === -1) {
    const f = fitToBudget(normalized, budgetTokens);
    return { prompt: f.text, optimized: f.trimmed, savedTokens: f.savedTokens, estimatedTokens: estimateTokens(f.text) };
  }
  const base = normalized.slice(0, at);
  const skills = normalized.slice(at);

  // 1) keep only Procedure + Checklist lines from each skill block
  const condensed = skills
    .split("\n")
    .filter((line) => /^### Skill:/.test(line) || /^(Procedure:|Checklist:|Quality checklist)/.test(line) || /^\d+\./.test(line.trim()) || line.trim() === "")
    .join("\n")
    .replace(/\n{3,}/g, "\n\n");
  let prompt = base + condensed;
  let est = estimateTokens(prompt);
  if (est <= budgetTokens) {
    return { prompt, optimized: true, savedTokens: before - est, estimatedTokens: est };
  }
  // 2) still over: honest hard trim of the tail-most skill detail
  const f = fitToBudget(prompt, budgetTokens);
  est = estimateTokens(f.text);
  return { prompt: f.text, optimized: true, savedTokens: before - est, estimatedTokens: est };
}

function storage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function recordUsage(entry: Omit<TokenLedgerEntry, "at">, now: () => Date = () => new Date()): void {
  const raw = storage()?.getItem(LEDGER_KEY);
  let list: TokenLedgerEntry[] = [];
  try {
    const parsed = raw ? (JSON.parse(raw) as TokenLedgerEntry[]) : [];
    if (Array.isArray(parsed)) list = parsed;
  } catch { /* corrupt ledger — start fresh, honestly */ }
  list.push({ ...entry, at: now().toISOString() });
  storage()?.setItem(LEDGER_KEY, JSON.stringify(list.slice(-LEDGER_CAP)));
}

export function usageReport(): TokenUsageReport {
  const raw = storage()?.getItem(LEDGER_KEY);
  let list: TokenLedgerEntry[] = [];
  try {
    const parsed = raw ? (JSON.parse(raw) as TokenLedgerEntry[]) : [];
    if (Array.isArray(parsed)) list = parsed;
  } catch { /* corrupt ledger reads as empty, never as fake numbers */ }
  return list.reduce(
    (acc, e) => ({
      calls: acc.calls + 1,
      promptTokens: acc.promptTokens + e.promptTokens,
      replyTokens: acc.replyTokens + e.replyTokens,
      optimizedCalls: acc.optimizedCalls + (e.optimized ? 1 : 0),
      savedTokens: acc.savedTokens + e.savedTokens,
    }),
    { calls: 0, promptTokens: 0, replyTokens: 0, optimizedCalls: 0, savedTokens: 0 },
  );
}

export function clearTokenLedger(): void {
  storage()?.removeItem(LEDGER_KEY);
}
