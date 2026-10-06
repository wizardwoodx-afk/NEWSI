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

/**
 * The ceiling for the GROWING side of a conversation.
 *
 * Why this exists. `PROMPT_BUDGET` above governs a COMPOSED SYSTEM prompt, and
 * a system prompt is fixed for the length of a run. A tool-using agent also
 * re-sends a conversation that carries that step's tool results, and for years
 * that side carried no budget at all: one model reply may contain any number of
 * tool blocks (`parseToolBlocks` has no cap), each receipt carries up to 2000
 * characters of real output, and every one of those went onto the wire
 * verbatim. The cost of a single member call was therefore decided by how many
 * blocks the model happened to emit — unbounded, and never budgeted.
 *
 * `WIRE_BUDGET` is not a substitute. It is deliberately generous, it runs
 * inside `complete()` after the text is already built, and when it does fire it
 * trims the PAIR at a fixed offset — which can move a slice of the
 * conversation into the system message. It is an emergency brake, not a bound
 * the loop can plan against.
 *
 * The value matches `PROMPT_BUDGET` deliberately: after budgeting, the worst
 * case wire pair is 12k tokens, comfortably inside `WIRE_BUDGET`, so the
 * emergency guard never has to shred a real tool result to save the run.
 */
export const CONVERSATION_BUDGET = 6000;

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

/* ── the growing side: an agent loop's transcript, budgeted ─────────────── */

/** One step's worth of tool results inside a conversation, oldest first. */
export interface ConversationSegment {
  /** "turn 2" — repeated verbatim in every elision note, so the model can name
   *  the turn whose output is missing instead of guessing why. */
  label: string;
  text: string;
}

export interface ConversationBudgetReport {
  text: string;
  trimmed: boolean;
  /** estimated tokens not put on the wire, versus the un-budgeted conversation */
  savedTokens: number;
  /** segments sent in full */
  kept: number;
  /** segments sent with their middle cut and a marker naming the cut */
  clipped: number;
  /** segments left out entirely — each named in the note, none silent */
  elided: number;
  /** True when the result still exceeds the budget, so the caller can say so
   *  instead of implying the budget held. See the floor note in budgetConversation. */
  floorLimited: boolean;
  est: true;
}

/**
 * Clip to a character count, marking where the middle went.
 *
 * `fitToBudget` cannot do this below ~130 tokens: it floors `keepChars` at 400,
 * so a smaller budget silently returns MORE text than was asked for. And its
 * marker ends "full playbook preserved in the skill library", which is true of
 * a composed system prompt and false of a tool result — it would tell the model
 * its output is somewhere it can go and read it. This is the same head + tail +
 * marker shape, with a marker that says what actually happened.
 */
function clipMarked(text: string, maxChars: number): string {
  const marker = "\n[… the middle of this tool output was elided to fit the context budget …]\n";
  if (maxChars <= marker.length) return marker.trim();
  if (text.length <= maxChars) return text;
  const room = maxChars - marker.length;
  const head = Math.floor(room * 0.6);
  return `${text.slice(0, head)}${marker}${text.slice(text.length - (room - head))}`;
}

/**
 * Fit a conversation to a budget without lying about what happened to it.
 *
 * Order of sacrifice, and why:
 *   1. NORMALIZE + DEDUP first — both are meaning-preserving and both already
 *      mark what they touch, so they are free wins.
 *   2. Then the segments. Head (the task) and tail (the instruction to
 *      continue) are NEVER cut: the task is the contract and the instruction is
 *      the loop's own protocol.
 *   3. Newest segment first. The most recent tool result is what the model has
 *      to act on; an older, larger one is the right thing to shorten.
 *   4. A segment that does not fit is CLIPPED with a visible marker, not
 *      dropped. Only when the budget is already spent does a segment become an
 *      elision note — and that note is explicit, names the turn, and says
 *      outright that the result did not come back empty, because "I cannot see
 *      it" and "it was empty" are different facts and the model must not be
 *      left guessing which one it is looking at.
 *
 * Nothing is ever dropped silently. That is the whole point: a truncated tool
 * result that the model cannot tell apart from an empty one is a correctness
 * bug, not a saving.
 *
 * Honest limit: when `head + tail` alone exceed the budget, no arrangement of
 * segments can bring the conversation under it, and `fitToBudget`'s 400-char
 * floor can stop the last-resort guard from enforcing a very small budget
 * either. Both cases are reported as `floorLimited` rather than papered over.
 */
export function budgetConversation(
  head: string,
  segments: ConversationSegment[],
  tail: string,
  budgetTokens: number = CONVERSATION_BUDGET,
): ConversationBudgetReport {
  const assemble = (parts: string[]): string => [head, ...parts, tail].filter((p) => p.length > 0).join("\n\n");
  const full = assemble(segments.map((s) => s.text));
  const fullTokens = estimateTokens(full);
  // The common case — a small run — is returned byte-identical, so nothing about
  // a normal loop's wire text changes.
  if (fullTokens <= budgetTokens) {
    return { text: full, trimmed: false, savedTokens: 0, kept: segments.length, clipped: 0, elided: 0, floorLimited: false, est: true };
  }

  const clean = (s: string): string => collapseRepeatedLines(normalizeWhitespace(s).text).text;
  const nHead = clean(head);
  const nTail = clean(tail);
  const nSegs = segments.map((s) => ({ label: s.label, text: clean(s.text) }));
  const deduped = assemble(nSegs.map((s) => s.text));
  if (estimateTokens(deduped) <= budgetTokens) {
    return {
      text: deduped,
      trimmed: true,
      savedTokens: fullTokens - estimateTokens(deduped),
      kept: nSegs.length,
      clipped: 0,
      elided: 0,
      floorLimited: false,
      est: true,
    };
  }

  let remaining = budgetTokens - estimateTokens(nHead) - estimateTokens(nTail);
  const bodies: string[] = new Array(nSegs.length);
  const elidedLabels: string[] = [];
  let kept = 0;
  let clipped = 0;
  for (let i = nSegs.length - 1; i >= 0; i--) {
    const seg = nSegs[i];
    const tokens = estimateTokens(seg.text);
    if (tokens <= remaining) {
      bodies[i] = seg.text;
      kept++;
      remaining -= tokens;
      continue;
    }
    if (remaining > 0) {
      bodies[i] = clipMarked(seg.text, Math.floor(remaining * 4));
      clipped++;
      remaining = 0;
      continue;
    }
    // Budget already spent on newer results. Say so, by name, or the model
    // reads the gap as a tool that returned nothing.
    elidedLabels.unshift(seg.label);
    bodies[i] = "";
  }

  const notices: string[] = [];
  if (clipped > 0 || elidedLabels.length > 0) {
    notices.push(
      `[loop context note] This conversation was held to a ${budgetTokens}-token budget. ` +
        `${kept} result block(s) are complete, ${clipped} were shortened (each says so inline), ` +
        `and ${elidedLabels.length > 0 ? `${elidedLabels.length} — ${elidedLabels.join(", ")} — were left out.` : "none were left out."} ` +
        `An elided result did NOT come back empty and no tool failed: its output simply did not fit. ` +
        `Re-run that tool if you need it. The most recent turn is complete.`,
    );
  }

  let out = assemble([...notices, ...bodies.filter((b) => b.length > 0)]);
  if (estimateTokens(out) > budgetTokens) {
    // head + tail alone are over budget: no segment arrangement can save it.
    out = fitToBudget(out, budgetTokens).text;
  }
  const after = estimateTokens(out);
  return {
    text: out,
    trimmed: true,
    savedTokens: Math.max(0, fullTokens - after),
    kept,
    clipped,
    elided: elidedLabels.length,
    floorLimited: after > budgetTokens,
    est: true,
  };
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
