/**
 * §AGENT IAM — the fleet roster: owned, not assigned.
 *
 * The 2027 identity ask, answered over the sovereign: every seat's owner,
 * the key that issued its mandate, the canonical scope it runs under, and
 * whether it has been revoked — as ONE exportable view.
 *
 * THE LAW THIS FILE ENFORCES: this is a VIEW, never a second authority.
 * Enrollment goes through the sovereign's mandateFor; revocation goes
 * through the sovereign's revoke (a revoked seat fail-closes at its next
 * governed step, not at the next UI refresh). Nothing here can grant what
 * the sovereign did not sign.
 */
import { canonicalScopeOf, sovereign, type ProfileSource } from "../security/sovereign";

export interface FleetEntry {
  agentId: string;
  /** The human principal the seat's mandate names. */
  owner: string;
  /** Which root signed: the bound owner key, or the labelled bootstrap. */
  issuerRoot: "owner" | "bootstrap";
  issuerKeyId: string;
  /** The canonical scope — the same vocabulary capabilities speak. */
  scope: string[];
  issuedAt: number;
  expiresAt: number;
  revoked: boolean;
}

/** The roster, one entry per enrolled seat. */
export function roster(): FleetEntry[] {
  return sovereign.enrolledAgents().map((agentId) => {
    const m = sovereign.enrolledMandateOf(agentId);
    const base = {
      agentId,
      issuerRoot: sovereign.root,
      issuerKeyId: sovereign.signerId,
      revoked: sovereign.isRevoked(agentId),
    };
    if (!m) {
      return { ...base, owner: "unknown", scope: [], issuedAt: 0, expiresAt: 0 };
    }
    return {
      ...base,
      owner: m.owner,
      scope: canonicalScopeOf(m.env),
      issuedAt: m.issuedAt,
      expiresAt: m.expiresAt,
    };
  });
}

/** The export an identity team reads: identity data only — scopes, owners,
 *  key ids, revocations. Never signatures, never keys. */
export function exportRoster(): { exportedAt: string; root: "owner" | "bootstrap"; issuerKeyId: string; entries: FleetEntry[] } {
  return {
    exportedAt: new Date().toISOString(),
    root: sovereign.root,
    issuerKeyId: sovereign.signerId,
    entries: roster(),
  };
}

/** Revoke a seat — flows THROUGH the sovereign, so enforcement is instant
 *  and fail-closed. */
export function revokeAgent(agentId: string): void {
  sovereign.revoke(agentId);
}

/** Enroll (or re-enroll) a seat — an explicit owner act through the
 *  sovereign's regrant, the ONLY path that can lift a revocation. */
export function enroll(node: ProfileSource) {
  return sovereign.regrant(node);
}
