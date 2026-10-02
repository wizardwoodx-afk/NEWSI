/**
 * SelfImpulse — session Auto-Review rules for the human gate (18.5.0).
 *
 * Standing approval rules at the human gate, honest: a human can teach the
 * gate a rule — "allow this category for THIS session". The differences are
 * the product's floor:
 *
 *   • rules live in MODULE MEMORY ONLY — a restart forgets everything;
 *     permanent autonomy is still earned via the 90% exam and nothing here
 *     persists a loosening;
 *   • a rule answers ONLY `risky` asks; `critical` always pauses at a human,
 *     no rule can touch it;
 *   • every answer a rule gives is logged (who: the rule, what, when) and
 *     shown in the door, and revoking is one click;
 *   • the engine still calls the gate; the rule is a HUMAN-STANDING decision
 *     that answers it, not a bypass of it.
 */
import type { GateAsk, GateDecision } from "./types";
import { getSpecialist } from "./registry";

export interface RuleAnswer {
  category: string;
  action: string;
  riskTier: string;
  at: string;
}

const rules = new Map<string, true>();
const log: RuleAnswer[] = [];

export function allowCategoryForSession(category: string): void {
  rules.set(category, true);
}

export function revokeSessionRule(category: string): void {
  rules.delete(category);
}

export function listSessionRules(): string[] {
  return Array.from(rules.keys());
}

export function sessionRuleLog(): RuleAnswer[] {
  return [...log];
}

export function clearSessionRules(): void {
  rules.clear();
}

/**
 * Consult the standing rules for a gate ask. Returns a decision ONLY when a
 * rule covers EVERY specialist category in the ask and the tier is `risky`.
 * Critical work, mixed/unknown categories and rule-less categories all
 * return null — the human is asked as usual.
 */
export function answerGateWithRules(ask: GateAsk, now: () => Date = () => new Date()): GateDecision | null {
  if (ask.riskTier === "critical") return null;
  if (ask.riskTier !== "risky") return null;
  const categories = ask.specialistIds.map((id) => getSpecialist(id)?.category ?? null);
  if (categories.length === 0 || categories.some((c) => c === null)) return null;
  for (const c of categories) {
    if (!rules.has(c as string)) return null;
  }
  const category = categories[0] as string;
  log.push({ category, action: ask.summary || ask.action, riskTier: ask.riskTier, at: now().toISOString() });
  if (log.length > 200) log.splice(0, log.length - 200);
  return { approved: true };
}
