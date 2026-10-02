/**
 * REACH · DELEGATION GRANT — what a peer's agent is allowed to do on YOUR
 * machine, decided before it arrives and stated in words.
 *
 * WHERE THIS SITS. `src/mission/selfimpulseTeams.ts` already runs the cross-selfimpulse
 * ladder with the human gate on both sides, and `src/mission/a2aBridge.ts`
 * already executes an accepted delegation for real and seals it. `src/engine/
 * selfimpulseMesh.ts` already keeps pair trust, and `src/mission/custody.ts` already
 * issues scoped authority envelopes. This module adds the one decision that
 * was missing between them: the *narrowing*. A delegation arrives naming what
 * it would like to do; the grant is the intersection of that ask with what
 * this selfimpulse will ever lend a counterparty at that trust level — and every
 * capability withheld is withheld OUT LOUD, with a rule name.
 *
 * THREE RULES, EACH PROBED:
 *   1. TRUST IS READ, NEVER ASSERTED. The tier comes from SelfImpulseMesh's pair
 *      standing (`meshRuntime.standingFor` → the same ledger the mesh writes
 *      when joint receipts are co-signed). A caller cannot pass in a tier it
 *      likes; it passes in owners, and the standing is looked up.
 *   2. HUMAN-FIRST IS ENFORCED HERE, AT RUNTIME, BY DEFAULT. A capability
 *      that writes, executes, spends, ships or touches secrets is refused
 *      unless a human approval naming that exact capability is attached and
 *      still valid at `now`. Shipping a release and reading secrets are
 *      IRREVERSIBLE and stay human-first at every setting; the recoverable
 *      three are human-first under the default posture and only an explicit
 *      operator setting relaxes them. A caller cannot relax anything: it
 *      supplies approvals, not permissions.
 *   3. A GRANT IS AN ARTEFACT. It carries the pair key, the standing it was
 *      computed from, the refusals and a digest over all of it, so both sides
 *      can re-derive the same bytes and file it with the run's receipts.
 *
 * Pure and synchronous apart from the standing lookup, which is injected.
 */
import { pureSha256 } from "../pureHash";
import { pairKey } from "../selfimpulseMesh";
import { standingFor } from "../meshRuntime";

export const DELEGATION_CAPABILITIES = [
  "repo.read",
  "data.aggregate",
  "test.run",
  "net.fetch",
  "egress.share",
  "repo.write",
  "shell.exec",
  "spend.commit",
  "deploy.release",
  "secrets.read",
] as const;

export type DelegationCapability = (typeof DELEGATION_CAPABILITIES)[number];

export type PairStanding = "unknown" | "probation" | "selfimpulseed" | "proven";

/**
 * The lending table. Read it as a policy document, because that is what it is:
 * a stranger may read nothing, a probationary pair may read and aggregate,
 * a selfimpulseed pair may also run tests and fetch, and only a proven pair may
 * write, execute or commit. The two capabilities that can destroy a selfimpulse
 * outright — shipping a release and reading secrets — are additionally
 * human-first at EVERY tier.
 */
export const CAPABILITIES_BY_STANDING: Record<PairStanding, DelegationCapability[]> = {
  unknown: [],
  probation: ["repo.read", "data.aggregate"],
  selfimpulseed: ["repo.read", "data.aggregate", "test.run", "net.fetch", "egress.share"],
  proven: [
    "repo.read", "data.aggregate", "test.run", "net.fetch", "egress.share",
    "repo.write", "shell.exec", "spend.commit", "deploy.release", "secrets.read",
  ],
};

/**
 * Capabilities a human must name at the current setting. Split in two on
 * purpose, because the difference is the safety story:
 *
 *   IRREVERSIBLE — shipping a release and reading secrets cannot be undone by
 *   the party that receives them. No configuration relaxes this set. A selfimpulse
 *   configured in a hurry still cannot lend a counterparty the keys.
 *
 *   SUPERVISED — writing, executing and spending are recoverable, so they are
 *   human-first while the runtime is in its default posture and may be
 *   relaxed only by an explicit operator decision, never by a caller.
 */
export const IRREVERSIBLE_CAPABILITIES: DelegationCapability[] = ["deploy.release", "secrets.read"];

export const SUPERVISED_CAPABILITIES: DelegationCapability[] = ["repo.write", "shell.exec", "spend.commit"];

/** The union — what the UI must paint as "a human decides this". */
export const HUMAN_FIRST_CAPABILITIES: DelegationCapability[] = [
  ...SUPERVISED_CAPABILITIES,
  ...IRREVERSIBLE_CAPABILITIES,
];

/** The default the runtime runs on. Callers may pass it; nothing may ignore it. */
export const REQUIRE_HUMAN_FIRST_DEFAULT = true;

export interface HumanApprovalRef {
  /** The exact capability this approval authorises. A blanket approval authorises nothing. */
  capability: string;
  /** The id of the approval record in the human's own inbox. */
  approvalId: string;
  /** ISO instant the human decided. */
  at: string;
  /** ISO instant this approval stops applying. Absent means "this run only". */
  expiresAt?: string;
}

export interface GrantInput {
  ownerA: string;
  ownerB: string;
  /** What the arriving delegation asked for, verbatim. */
  requested: readonly string[];
  /** Pair standing. Omit to have the runtime read SelfImpulseMesh. */
  standing?: PairStanding;
  /** Human decisions on offer. Only the capabilities they name are affected. */
  approvals?: readonly HumanApprovalRef[];
  /** Defaults to REQUIRE_HUMAN_FIRST_DEFAULT. */
  requireHumanFirst?: boolean;
  at: string;
}

export interface CapabilityRefusal {
  capability: string;
  rule: "not-a-capability" | "below-standing" | "human-first" | "approval-expired" | "quarantined";
  why: string;
}

export interface DelegationGrant {
  id: string;
  pair: string;
  tier: PairStanding;
  at: string;
  humanFirst: boolean;
  granted: DelegationCapability[];
  refused: CapabilityRefusal[];
  /** Digest over the decision — both sides can re-derive it and file it. */
  digest: string;
}

export function grantCanonical(g: Omit<DelegationGrant, "digest">): string {
  const refusals = g.refused.map((r) => `${r.capability}:${r.rule}`).join(",");
  return [g.id, g.pair, g.tier, g.at, String(g.humanFirst), g.granted.join(","), refusals].join("\u001f");
}

/** The tiers a capability is lent at — used to explain a refusal in words. */
export function tiersFor(capability: DelegationCapability): PairStanding[] {
  return (["probation", "selfimpulseed", "proven"] as PairStanding[]).filter((t) => CAPABILITIES_BY_STANDING[t].includes(capability));
}

/**
 * Decide the grant. Every refusal names the rule that produced it; a
 * capability that survives every rule is granted, and what is not mentioned
 * is not granted. There is no path where an unknown capability is silently
 * dropped — it is refused by name.
 */
export function narrowGrant(input: GrantInput): DelegationGrant {
  const tier: PairStanding = input.standing ?? "unknown";
  const humanFirst = input.requireHumanFirst ?? REQUIRE_HUMAN_FIRST_DEFAULT;
  const atMs = Date.parse(input.at);
  const approvals = input.approvals ?? [];
  const granted: DelegationCapability[] = [];
  const refused: CapabilityRefusal[] = [];
  const seen = new Set<string>();

  for (const raw of input.requested) {
    const capability = raw.trim();
    if (seen.has(capability)) continue;
    seen.add(capability);

    if (!(DELEGATION_CAPABILITIES as readonly string[]).includes(capability)) {
      refused.push({
        capability,
        rule: "not-a-capability",
        why: `"${capability}" is not in the delegation capability set, so it is not withheld — it is unknown`,
      });
      continue;
    }
    const cap = capability as DelegationCapability;

    if (tier === "unknown") {
      refused.push({
        capability,
        rule: "quarantined",
        why: "this pair has no joint receipts, so no capability is lent; the first exchange is read-only by ruling, not by luck",
      });
      continue;
    }

    if (!CAPABILITIES_BY_STANDING[tier].includes(cap)) {
      const needed = tiersFor(cap);
      refused.push({
        capability,
        rule: "below-standing",
        why: `pair standing "${tier}" does not lend ${capability}; it is lent from ${needed.join(" or ")} standing`,
      });
      continue;
    }

    const needsHuman = IRREVERSIBLE_CAPABILITIES.includes(cap) || (humanFirst && SUPERVISED_CAPABILITIES.includes(cap));
    if (needsHuman) {
      const approval = approvals.find((a) => a.capability === cap);
      if (!approval) {
        refused.push({
          capability,
          rule: "human-first",
          why: `${capability} changes the state of this selfimpulse, so it needs a human decision naming it; none was attached`,
        });
        continue;
      }
      if (approval.expiresAt !== undefined && Date.parse(approval.expiresAt) < atMs) {
        refused.push({
          capability,
          rule: "approval-expired",
          why: `the approval for ${capability} expired at ${approval.expiresAt}, before this grant at ${input.at}`,
        });
        continue;
      }
      if (approval.approvalId.trim().length === 0) {
        refused.push({
          capability,
          rule: "human-first",
          why: `${capability} was claimed as approved with no approval id, which cannot be checked and is therefore not an approval`,
        });
        continue;
      }
    }

    granted.push(cap);
  }

  const staged: Omit<DelegationGrant, "digest"> = {
    id: `grant-${pureSha256(`${input.ownerA}|${input.ownerB}|${input.at}`).slice(0, 16)}`,
    pair: pairKey(input.ownerA, input.ownerB),
    tier,
    at: input.at,
    humanFirst,
    granted: [...granted].sort(),
    refused,
  };
  return { ...staged, digest: pureSha256(`vh.reach.delegationGrant.v1:${grantCanonical(staged)}`) };
}

/** Does this grant actually lend the capability? Refusals are never implied away. */
export function grantAllows(grant: DelegationGrant, capability: DelegationCapability): boolean {
  return grant.granted.includes(capability);
}

/** The refusals, in one readable line per refusal — for the approval inbox. */
export function refusalSummary(grant: DelegationGrant): string[] {
  return grant.refused.map((r) => `${r.capability} — withheld (${r.rule}): ${r.why}`);
}

/** The grant as it is filed with a run: small, verifiable, no secrets. */
export function grantRecord(grant: DelegationGrant): {
  pair: string;
  tier: PairStanding;
  granted: DelegationCapability[];
  refused: CapabilityRefusal[];
  humanFirst: boolean;
  digest: string;
} {
  return {
    pair: grant.pair,
    tier: grant.tier,
    granted: grant.granted,
    refused: grant.refused,
    humanFirst: grant.humanFirst,
    digest: grant.digest,
  };
}

export interface GrantDeps {
  /** Reads the live pair standing. Defaults to SelfImpulseMesh's mesh ledger. */
  standing?: (a: string, b: string) => PairStanding;
}

/**
 * The wired form: owners in, grant out, standing read from the mesh the
 * selfimpulse already runs on. `standingFor` is the production seam
 * (`engine.mesh.trust.v1`), so a pair earns its tier by co-signing receipts —
 * nothing else moves this number.
 */
export function grantForPair(
  input: Omit<GrantInput, "standing">,
  deps: GrantDeps = {},
): DelegationGrant {
  const read = deps.standing ?? ((a: string, b: string) => standingFor(a, b));
  return narrowGrant({ ...input, standing: read(input.ownerA, input.ownerB) });
}
