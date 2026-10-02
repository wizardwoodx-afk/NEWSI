/**
 * SelfImpulse — Captain synthesis (19.3.0 "Vanguard").
 *
 * 19.2.0 made each routed member execute for real. The review's remaining
 * capability gap: the Captain REPORTED on N outputs but never REASONED over
 * them — the reply was sections, not a result. This module closes that gap
 * without giving up the honesty contract:
 *
 *   member results
 *     → deterministic divergence pass (claim atoms each member backs vs.
 *       atoms only one member backs — surfaced, not hidden)
 *     → the Captain's OWN provider call, under the Captain's own prompt,
 *       comparing and reconciling the members' real outputs
 *     → one coherent domain result, sectioned evidence still attached
 *
 * Honesty rules, probe-pinned (probe/synthesis):
 *   • synthesis NEVER runs on unexecuted members — it consumes real results;
 *   • synthesis is its OWN call with its OWN token-ledger entry and its OWN
 *     digest — never a relabel of any member's answer;
 *   • when the synthesis call fails, the run keeps every member answer and
 *     says synthesis was attempted and failed — never a fake combination;
 *   • the divergence list is computed, not asserted: atoms single-sourced
 *     are labelled "single-sourced", never silently dropped or duplicated.
 */
import type { Captain } from "./captains";
import type { SynthesisRecord } from "./types";

export type { SynthesisRecord };

/* ── deterministic divergence detection ───────────────────────────────────── */

/**
 * Claim atoms: the checkable skeleton of an answer — percentages, money,
 * plain numbers with units, ISO dates, years, URLs. Deliberately
 * conservative: free-text claims are the model's job to reconcile; atoms
 * are what VH can count without pretending to understand.
 */
const ATOM_PATTERNS: Array<{ kind: string; re: RegExp }> = [
  { kind: "percent", re: /\b\d+(?:\.\d+)?\s?%/g },
  { kind: "money", re: /\$\s?\d[\d,]*(?:\.\d+)?(?:\s?(?:million|billion|bn|m|k))?/gi },
  { kind: "iso-date", re: /\b(?:19|20)\d{2}-\d{2}(?:-\d{2})?\b/g },
  { kind: "year", re: /\b(?:19|20)\d{2}\b/g },
  { kind: "url", re: /https?:\/\/[^\s)"'<>]+/g },
  { kind: "version", re: /\bv?\d+\.\d+(?:\.\d+)?\b/g },
];

export interface ClaimAtom {
  kind: string;
  value: string;
}

export function extractClaimAtoms(text: string): ClaimAtom[] {
  const seen = new Map<string, ClaimAtom>();
  for (const { kind, re } of ATOM_PATTERNS) {
    for (const m of text.match(re) ?? []) {
      const value = m.trim().toLowerCase().replace(/\s+/g, " ");
      const key = `${kind}:${value}`;
      if (!seen.has(key)) seen.set(key, { kind, value });
    }
  }
  return [...seen.values()];
}

export interface DivergenceReport {
  /** Atoms every executed member backs — the corroborated core. */
  corroborated: string[];
  /** Atoms backed by only some members — labelled, never hidden. */
  singleSourced: Array<{ atom: string; kind: string; backedBy: string[] }>;
  /** How many executed members were compared. */
  membersCompared: number;
}

/**
 * Compare the claim atoms across executed member answers. Pure function of
 * the real results — no provider involved, nothing invented.
 */
export function findDivergences(memberResults: Array<{ specialistId: string; text: string }>): DivergenceReport {
  const executed = memberResults.filter((m) => m.text.length > 0);
  const perMember = executed.map((m) => ({ id: m.specialistId, atoms: extractClaimAtoms(m.text) }));
  const support = new Map<string, { atom: ClaimAtom; backedBy: string[] }>();
  for (const m of perMember) {
    for (const a of m.atoms) {
      const key = `${a.kind}:${a.value}`;
      const entry = support.get(key) ?? { atom: a, backedBy: [] };
      if (!entry.backedBy.includes(m.id)) entry.backedBy.push(m.id);
      support.set(key, entry);
    }
  }
  const corroborated: string[] = [];
  const singleSourced: DivergenceReport["singleSourced"] = [];
  for (const { atom, backedBy } of support.values()) {
    if (executed.length >= 2 && backedBy.length < executed.length) {
      singleSourced.push({ atom: `${atom.kind} ${atom.value}`, kind: atom.kind, backedBy });
    } else {
      corroborated.push(`${atom.kind} ${atom.value}`);
    }
  }
  return {
    corroborated: corroborated.slice(0, 12),
    singleSourced: singleSourced.slice(0, 12),
    membersCompared: executed.length,
  };
}

/* ── the Consul's synthesis call (domain layer; CEO still owns the reply) ───── */

export function buildSynthesisSystem(captain: Captain): string {
  return (
    `${captain.systemPrompt}\n\n` +
    `You are now SYNTHESIZING your members' real, separately-executed answers into ONE coherent domain result.\n` +
    `Rules:\n` +
    `1. Compare the member answers. Where they agree, state the result plainly.\n` +
    `2. Where they diverge (see the divergence notes), say so explicitly and prefer the better-supported claim — name which member supports it.\n` +
    `3. Never invent facts none of your members produced. The synthesis may ONLY combine what is below.\n` +
    `4. Write as one result, not as a list of summaries. End with the single next step if the work is incomplete.\n` +
    `5. If the members' answers cannot be reconciled, say exactly that and keep both positions visible.`
  );
}

export function buildSynthesisUser(task: string, sections: Array<{ name: string; text: string }>, div: DivergenceReport): string {
  const divergenceLines =
    div.singleSourced.length > 0
      ? `DIVERGENCE NOTES (computed, not asserted — reconcile or name them):\n${div.singleSourced.map((d) => `- ${d.atom} — backed only by ${d.backedBy.join(", ")}`).join("\n")}`
      : `DIVERGENCE NOTES: none detected — all extracted claim atoms are corroborated across the ${div.membersCompared} executed members.`;
  const memberParts = sections.map((s) => `── ${s.name}\n${s.text}`).join("\n\n");
  return `Original task: ${task}\n\n${divergenceLines}\n\nMember answers (each its own provider execution):\n\n${memberParts}\n\nNow produce the single synthesized domain result.`;
}

// SynthesisRecord lives in ./types (the contract file) so the Generalist
// response and this module share one definition; see types.ts.
