/**
 * §MEMORY TIERS — the layer that makes memory compound.
 *
 * The encrypted graph (`memoryGraph`) remembers everything equally. Humans
 * don't. This file adds the three tiers the science and the product both
 * speak, WITHOUT touching what is stored — tiers are a lens over the graph,
 * computed from timestamps and structure, never a second copy of memory:
 *
 *     working   — the session's own window (the last hour)
 *     episodic  — everything older, still tied to its session
 *     semantic  — what recurs across episodes and earned promotion
 *
 * THE LAWS THIS FILE ENFORCES
 *  1. PROMOTION IS MECHANICAL. A semantic fact is distilled FROM nodes that
 *     recurred across ≥ minSessions episodes and scored past a stated
 *     threshold — and it carries the session ids it came from, so every
 *     fact walks back to real episodes. Nothing is invented; a fact that
 *     cannot cite its sources does not exist.
 *  2. RECALL IS A NAMED NUMBER. recency (½) + frequency (0.3) + weight
 *     (0.2), each stated — not a vibe.
 *  3. FORGETTING IS A POLICY, NOT AN ACCIDENT. Expiry is a visible TTL
 *     (`sessionsPastTtl`) the caller must act on deliberately. This file
 *     never deletes anything.
 */
import type { MgGraph, MgNode, MgSession } from "./memoryGraph";

export type MemoryTier = "working" | "episodic" | "semantic";

/** The working window: a session is "working" for the hour it is alive. */
export const WORKING_TTL_MS = 60 * 60_000;

const r3 = (n: number): number => Math.round(n * 1000) / 1000;

/** Which tier a session sits in right now. An unparseable timestamp is
 *  episodic — never working (fail toward the older, humbler tier). */
export function tierOf(s: MgSession, now: number = Date.now()): MemoryTier {
  const t = Date.parse(s.startedAt);
  return Number.isFinite(t) && now - t < WORKING_TTL_MS ? "working" : "episodic";
}

export interface RecallScore {
  recency: number;
  frequency: number;
  weight: number;
  score: number;
}

/** The named number: recency (½) — newer recalls easier; frequency (0.3) —
 *  repeated across episodes sticks; weight (0.2) — the graph's own
 *  prominence. Each component rounds to 3 decimals: honest, comparable. */
export function recallScore(n: MgNode, now: number = Date.now()): RecallScore {
  const t = Date.parse(n.lastSeen);
  const ageDays = Number.isFinite(t) ? Math.max(0, (now - t) / 86_400_000) : 1e9;
  const recency = r3(1 / (1 + ageDays));
  const frequency = r3(1 / (1 + Math.max(0, n.sessionIds.length - 1)));
  const weight = r3(Math.min(1, Math.max(0, n.weight)));
  return { recency, frequency, weight, score: r3(0.5 * recency + 0.3 * frequency + 0.2 * weight) };
}

export interface SemanticFact {
  fact: string;
  /** The episodes the fact was distilled from — its cited sources. */
  sessions: string[];
  score: number;
  promotedAt: number;
}

export interface PromoteOptions {
  minSessions?: number;
  threshold?: number;
  limit?: number;
}

/** Promote recurring nodes to semantic facts. Deterministic: same graph,
 *  same instant, same facts in the same order (score desc, label asc). */
export function promote(graph: MgGraph, now: number = Date.now(), opts: PromoteOptions = {}): SemanticFact[] {
  const minSessions = opts.minSessions ?? 2;
  const threshold = opts.threshold ?? 0.35;
  const limit = opts.limit ?? 12;
  const cands = graph.nodes
    .map((n) => ({ n, r: recallScore(n, now) }))
    .filter(({ n, r }) => n.sessionIds.length >= minSessions && r.score >= threshold);
  cands.sort((a, b) => (b.r.score - a.r.score) || a.n.label.localeCompare(b.n.label));
  return cands.slice(0, limit).map(({ n, r }) => ({
    fact: n.label,
    sessions: [...n.sessionIds],
    score: r.score,
    promotedAt: now,
  }));
}

/** The forget policy: sessions strictly past the TTL. The caller decides
 *  what to do — this file never deletes. */
export function sessionsPastTtl(sessions: MgSession[], now: number, ttlDays: number): MgSession[] {
  const cutoff = now - ttlDays * 86_400_000;
  return sessions.filter((s) => {
    const t = Date.parse(s.startedAt);
    return Number.isFinite(t) && t < cutoff;
  });
}

export interface TierReport {
  working: number;
  episodic: number;
  semantic: number;
  oldestEpisodic: string | null;
}

/** The census the memory screen can show: how much memory lives where. */
export function tierReport(sessions: MgSession[], now: number, facts: SemanticFact[]): TierReport {
  let working = 0;
  let episodic = 0;
  let oldest: string | null = null;
  for (const s of sessions) {
    if (tierOf(s, now) === "working") {
      working += 1;
      continue;
    }
    episodic += 1;
    if (oldest === null || s.startedAt < oldest) oldest = s.startedAt;
  }
  return { working, episodic, semantic: facts.length, oldestEpisodic: oldest };
}
