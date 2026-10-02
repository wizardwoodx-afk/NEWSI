/**
 * REACH · PAIR MEMORY — what two selfimpulses learned together, and what an
 * organisation learned alone.
 *
 * WHY THIS EXISTS NEXT TO §20/§21 MEMORY. `src/mission/memory.ts` owns six
 * scopes (mission, team, agent, artifact, decision, failure) and
 * `src/mission/interAgentChannel.ts` owns the versioned cross-seat blackboard.
 * Both are real. Neither can answer the question the Agent Bridge creates:
 * *what does THIS pair of owners know, from receipts both sides signed?*
 * A pair fact that cannot name its joint receipt is a rumour, so the pair and
 * org scopes REQUIRE one.
 *
 * FOUR RULES, EACH PROBED:
 *   1. Pair identity is `pairKey()` from SelfImpulseMesh — the same key the mesh
 *      already uses for trust. There is no second notion of "a pair".
 *   2. `pair` and `org` entries must carry a 64-hex receipt digest. Without
 *      it the write is refused in words.
 *   3. Supersession is append-only. A newer entry names the entry it
 *      supersedes; the older one is never deleted, so `history()` and
 *      `asOf()` can always reconstruct what was believed at any instant.
 *   4. `cuts()` reports what it withheld. A memory that silently truncates is
 *      a memory that lies.
 *
 * No storage of its own: the log is passed in, so a probe, a mission or a
 * renderer can hold it and the same functions work everywhere.
 */
import { pureSha256 } from "../pureHash";
import { pairKey } from "../selfimpulseMesh";

export type MemoryScope = "run" | "agent" | "user" | "pair" | "org";

/** Scopes that may not be written without a joint receipt digest. */
export const RECEIPT_BOUND_SCOPES: MemoryScope[] = ["pair", "org"];

export interface MemoryEntry {
  id: string;
  scope: MemoryScope;
  /** What this memory is about — the lookup key, not the content. */
  key: string;
  /** The content, in words. */
  value: string;
  /** ISO instant the memory was recorded. */
  at: string;
  /** The entry this one replaces. Superseding never deletes. */
  supersedes: string | null;
  /** 64-hex receipt digest. Mandatory for `pair` and `org`. */
  receiptDigest: string | null;
  /** Why this is remembered — recorded so a reader can judge it later. */
  why: string;
  digest: string;
}

const HEX64 = /^[0-9a-f]{64}$/;

/**
 * A memory that carries a live credential is not a memory, it is a leak.
 * Deliberately conservative: false positives cost a rephrase, false negatives
 * cost a secret.
 */
export function looksLikeSecret(text: string): boolean {
  if (/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}/i.test(text)) return true;
  if (/\b(sk|pk|ghp|gho|glpat|xox[baprs])[-_][A-Za-z0-9_-]{8,}/i.test(text)) return true;
  if (/\bey[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{4,}\b/.test(text)) return true;
  if (/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(text)) return true;
  if (/(password|passwd|secret|api[_-]?key)\s*[:=]\s*\S{6,}/i.test(text)) return true;
  return false;
}

export function entryCanonical(e: Omit<MemoryEntry, "digest">): string {
  return [e.id, e.scope, e.key, e.value, e.at, e.supersedes ?? "", e.receiptDigest ?? "", e.why].join("\u001f");
}

/**
 * The digest of one entry, re-derived from its body. Never read the stored
 * `digest` field to decide what a row says: an edited body with a stale digest
 * is exactly the tamper this function exists to expose.
 */
export function entryDigest(entry: Omit<MemoryEntry, "digest"> | MemoryEntry): string {
  const { digest: _stored, ...body } = entry as MemoryEntry;
  return pureSha256(`vh.reach.memory.entry.v1:${entryCanonical(body)}`);
}

/** Re-derive and compare — a modified memory is named, not trusted. */
export function verifyEntry(entry: MemoryEntry): { ok: true } | { ok: false; reason: string } {
  const want = entryDigest(entry);
  return entry.digest === want
    ? { ok: true }
    : { ok: false, reason: "memory: entry digest does not match its body — this row was edited after it was written" };
}

/**
 * The digest of the log, computed over RE-DERIVED entry bodies rather than over
 * the `digest` fields the rows carry. That distinction is the whole point: a
 * log whose rows were edited in place digests differently, even though nobody
 * touched the stored digest strings.
 */
export function memoryDigest(entries: readonly MemoryEntry[]): string {
  const body = entries.map((e) => entryDigest(e)).join("|");
  return pureSha256(`vh.reach.pairMemory.v1:${body}`);
}

/** The pair key two owners share — SelfImpulseMesh's, not a parallel invention. */
export function pairMemoryScope(a: string, b: string): string {
  return pairKey(a, b);
}

export type RememberResult =
  | { ok: true; appended: true; entry: MemoryEntry; superseded: MemoryEntry | null }
  | { ok: true; appended: false; entry: MemoryEntry; superseded: null; reason: string }
  | { ok: false; reason: string };

/**
 * Record a memory. Refusals are in words and name the rule that refused:
 * a secret, a missing receipt on a receipt-bound scope, an empty value, or a
 * duplicate of what is already the current truth for that key.
 */
export function remember(
  log: readonly MemoryEntry[],
  input: {
    id: string;
    scope: MemoryScope;
    key: string;
    value: string;
    why: string;
    at: string;
    receiptDigest?: string | null;
  },
): RememberResult {
  const key = input.key.trim();
  const value = input.value.trim();
  const why = input.why.trim();
  if (key.length === 0) return { ok: false, reason: "memory: no key — an unaddressable memory cannot be retrieved later" };
  if (value.length === 0) return { ok: false, reason: "memory: no value — nothing was learned" };
  if (why.length === 0) return { ok: false, reason: "memory: no why — a memory that cannot say why it exists cannot be audited" };
  if (looksLikeSecret(value) || looksLikeSecret(key)) {
    return { ok: false, reason: "memory: refused — the entry looks like a credential, and a credential is not knowledge" };
  }
  const digest = input.receiptDigest ?? null;
  if (RECEIPT_BOUND_SCOPES.includes(input.scope)) {
    if (digest === null || !HEX64.test(digest)) {
      return {
        ok: false,
        reason: `memory: a ${input.scope} fact requires the 64-hex digest of the joint receipt that witnessed it`,
      };
    }
  }

  const current = resolve(log, input.scope, key, input.at);
  if (current && current.value === value) {
    return { ok: true, appended: false, entry: current, superseded: null, reason: "memory: already current — nothing was appended" };
  }

  const staged: Omit<MemoryEntry, "digest"> = {
    id: input.id,
    scope: input.scope,
    key,
    value,
    at: input.at,
    supersedes: current ? current.id : null,
    receiptDigest: digest,
    why,
  };
  const entry: MemoryEntry = { ...staged, digest: pureSha256(`vh.reach.memory.entry.v1:${entryCanonical(staged)}`) };
  return { ok: true, appended: true, entry, superseded: current ?? null };
}

/**
 * What was believed at an instant. `asOf` is inclusive and total: an entry
 * written at exactly `iso` counts, and an entry superseded later still counts
 * for the instant before it was replaced. This is the function that makes
 * "we believed X on the day of the incident" answerable.
 */
export function resolve(log: readonly MemoryEntry[], scope: MemoryScope, key: string, asOf: string): MemoryEntry | null {
  const at = Date.parse(asOf);
  const candidates = log
    .filter((e) => e.scope === scope && e.key === key && Date.parse(e.at) <= at)
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at) || a.id.localeCompare(b.id));
  return candidates.length > 0 ? candidates[candidates.length - 1] : null;
}

/** The whole belief chain for one key, oldest first. Nothing is ever removed. */
export function history(log: readonly MemoryEntry[], scope: MemoryScope, key: string): MemoryEntry[] {
  return log
    .filter((e) => e.scope === scope && e.key === key)
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at) || a.id.localeCompare(b.id));
}

/** Everything a single scope knew at an instant, newest first. */
export function scopeAsOf(log: readonly MemoryEntry[], scope: MemoryScope, asOf: string): MemoryEntry[] {
  const at = Date.parse(asOf);
  const keys = [...new Set(log.filter((e) => e.scope === scope).map((e) => e.key))];
  return keys
    .map((k) => resolve(log, scope, k, asOf))
    .filter((e): e is MemoryEntry => e !== null && Date.parse(e.at) <= at)
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at) || a.key.localeCompare(b.key));
}

/**
 * A bounded read that SAYS what it withheld. `shown` is newest-first; when the
 * log is longer than `limit` the caller is told how many rows were dropped and
 * why, so a UI can print "showing 20 of 43".
 */
export function cuts(
  log: readonly MemoryEntry[],
  limit: number,
): { shown: MemoryEntry[]; omitted: number; note: string } {
  const sorted = [...log].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  const shown = sorted.slice(0, Math.max(0, limit));
  const omitted = sorted.length - shown.length;
  return {
    shown,
    omitted,
    note: omitted === 0
      ? `showing all ${sorted.length} memories`
      : `showing ${shown.length} of ${sorted.length} memories — ${omitted} withheld by the ${limit}-row cut, not deleted`,
  };
}
