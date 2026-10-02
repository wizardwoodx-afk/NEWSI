/**
 * SelfImpulse — self-override store (18.2.0).
 *
 * The ONLY knobs the product may turn on itself, and every one of them is a
 * TIGHTENING: raise the routing bar, tighten a specialist's risk tier,
 * suppress a proposal category. Nothing here can loosen a control, enable a
 * specialist, raise a ceiling, or touch the floor (receipts, the gate, the
 * honesty contract) — those are not representable in this store.
 *
 * Every applied change is a history entry with its previous value, so
 * revert is exact-state restoration, one call.
 */
import type { RiskTier } from "./types";

const KEY = "engine.self.overrides.v1";

export interface SelfOverrideEntry {
  id: string;
  kind: "tighten-tier" | "raise-min-score" | "suppress-category";
  target: string;
  prev: string | number | null;
  at: string;
  proposalId?: string;
}

export interface SelfOverrides {
  minScoreDelta: number;
  tierTightens: Record<string, Exclude<RiskTier, "safe">>;
  suppressedCategories: string[];
  history: SelfOverrideEntry[];
}

const EMPTY: SelfOverrides = { minScoreDelta: 0, tierTightens: {}, suppressedCategories: [], history: [] };

function storage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function loadSelfOverrides(): SelfOverrides {
  const s = storage();
  if (!s) return { ...EMPTY };
  try {
    const raw = JSON.parse(s.getItem(KEY) ?? "null") as Partial<SelfOverrides> | null;
    return {
      minScoreDelta: Math.max(0, raw?.minScoreDelta ?? 0),
      tierTightens: raw?.tierTightens ?? {},
      suppressedCategories: raw?.suppressedCategories ?? [],
      history: raw?.history ?? [],
    };
  } catch {
    return { ...EMPTY };
  }
}

function save(next: SelfOverrides): void {
  storage()?.setItem(KEY, JSON.stringify(next));
}

export function applyTightenTier(id: string, tier: Exclude<RiskTier, "safe">, entry: Omit<SelfOverrideEntry, "kind" | "target" | "prev">): SelfOverrides {
  const cur = loadSelfOverrides();
  const prev = cur.tierTightens[id] ?? null;
  cur.tierTightens[id] = tier;
  cur.history.push({ ...entry, kind: "tighten-tier", target: id, prev });
  save(cur);
  return cur;
}

export function applyRaiseMinScore(delta: number, entry: Omit<SelfOverrideEntry, "kind" | "target" | "prev">): SelfOverrides {
  const cur = loadSelfOverrides();
  const prev = cur.minScoreDelta;
  cur.minScoreDelta = Math.max(cur.minScoreDelta, delta); // never below today's bar
  cur.history.push({ ...entry, kind: "raise-min-score", target: "router.minScore", prev });
  save(cur);
  return cur;
}

export function applySuppressCategory(cat: string, entry: Omit<SelfOverrideEntry, "kind" | "target" | "prev">): SelfOverrides {
  const cur = loadSelfOverrides();
  const prev = null;
  if (!cur.suppressedCategories.includes(cat)) cur.suppressedCategories.push(cat);
  cur.history.push({ ...entry, kind: "suppress-category", target: cat, prev });
  save(cur);
  return cur;
}

/** Exact-state restoration: the entry names the previous value; revert restores it. */
export function revertSelfChange(entryId: string): SelfOverrides {
  const cur = loadSelfOverrides();
  const idx = cur.history.findIndex((h) => h.id === entryId);
  if (idx === -1) return cur;
  const e = cur.history[idx];
  if (e.kind === "tighten-tier") {
    if (e.prev === null) delete cur.tierTightens[e.target];
    else cur.tierTightens[e.target] = e.prev as Exclude<RiskTier, "safe">;
  }
  if (e.kind === "raise-min-score") cur.minScoreDelta = Math.max(0, e.prev as number);
  if (e.kind === "suppress-category") cur.suppressedCategories = cur.suppressedCategories.filter((c) => c !== e.target);
  cur.history.splice(idx, 1);
  save(cur);
  return cur;
}

export function resetSelfOverrides(): void {
  storage()?.removeItem(KEY);
}
