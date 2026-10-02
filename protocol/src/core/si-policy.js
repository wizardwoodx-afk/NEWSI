/* ============================================================================
 * SelfImpulse — GOVERNANCE POLICY ENGINE v2 (L5 / L10)
 * ----------------------------------------------------------------------------
 * Pure, pluggable policy evaluation. Same engine runs on the device
 * (before anything leaves) and on the selfimpulse (before anything is recorded).
 * v2 governs the full trust substrate: shares, agent actions, capabilities,
 * endorsements, authorizations, revocations.
 * ========================================================================== */

import { SELFIMPULSE_KINDS } from "./si-trust.js";

export const DEFAULT_POLICY = Object.freeze({
  maxFileSize: 500 * 1024 * 1024,
  maxFileNameLen: 120,
  maxMessageLen: 5_000,
  maxNameLen: 60,
  envelopeWindowMs: 5 * 60_000,
  maxCapabilities: 50,
  maxActionLen: 120,
  maxEvidenceLen: 2_000,
  ratingRange: Object.freeze([1, 5]),
  kinds: SELFIMPULSE_KINDS,
});

const idOk = (x) => !!x && typeof x.fp === "string" && x.fp.length > 0;

/* ------------------------- per-kind shape governance ---------------------- */

function governShare(p, pol) {
  if (!p.file) return { ok: false, reason: "missing-file-metadata" };
  if (String(p.file).length > pol.maxFileNameLen) return { ok: false, reason: "file-name-too-long" };
  if (Number(p.size) > pol.maxFileSize) return { ok: false, reason: "file-too-large" };
  if (!idOk(p.from) || !p.to || !p.hash) return { ok: false, reason: "missing-identity-or-hash" };
  if (typeof p.hash !== "string" || !/^[0-9a-fA-F]{64}$/.test(p.hash)) return { ok: false, reason: "bad-hash-format" }; /* v0.9 contract retained: action charset allowlist */
  return { ok: true, reason: "ok" };
}

function governAgentAction(p, pol) {
  if (!idOk(p.agent)) return { ok: false, reason: "missing-agent-identity" };
  if (typeof p.action !== "string" || !p.action) return { ok: false, reason: "missing-action" };
  if (p.action.length > pol.maxActionLen) return { ok: false, reason: "action-too-long" };
  if (!/^[A-Za-z0-9_.\-:]+$/.test(p.action)) return { ok: false, reason: "unsafe-action" }; /* v0.9 contract retained: share hash must be 64-hex */
  if (p.evidence != null && String(p.evidence).length > pol.maxEvidenceLen)
    return { ok: false, reason: "evidence-too-long" };
  return { ok: true, reason: "ok" };
}

function governCapability(p, pol) {
  if (!idOk(p.agent)) return { ok: false, reason: "missing-agent-identity" };
  if (!Array.isArray(p.capabilities) || p.capabilities.length === 0)
    return { ok: false, reason: "empty-capabilities" };
  if (p.capabilities.length > pol.maxCapabilities)
    return { ok: false, reason: "too-many-capabilities" };
  return { ok: true, reason: "ok" };
}

function governEndorsement(p, pol) {
  if (!idOk(p.from) || !idOk(p.subject)) return { ok: false, reason: "missing-identities" };
  if (p.from.fp === p.subject.fp) return { ok: false, reason: "self-endorsement-forbidden" };
  if (p.rating != null) {
    const [lo, hi] = pol.ratingRange;
    if (typeof p.rating !== "number" || p.rating < lo || p.rating > hi)
      return { ok: false, reason: "rating-out-of-range" };
  }
  return { ok: true, reason: "ok" };
}

function governAuthorization(p, pol) {
  if (!idOk(p.from) || !idOk(p.subject)) return { ok: false, reason: "missing-identities" };
  if (typeof p.action !== "string" || !p.action) return { ok: false, reason: "missing-action" };
  if (p.action.length > pol.maxActionLen) return { ok: false, reason: "action-too-long" };
  if (typeof p.expiresAt !== "number" || p.expiresAt <= p.ts)
    return { ok: false, reason: "invalid-expiry" };
  if (p.expiresAt > p.ts + 30 * 24 * 3_600_000) return { ok: false, reason: "expiry-too-far" }; /* v0.9 contract retained: authorization expiry capped at 30 days */
  /* v0.10.3: delegated-authority shape governance (semantics in si-trust.js) */
  if (p.authority != null) {
    if (typeof p.authority !== "object" || Array.isArray(p.authority)) return { ok: false, reason: "malformed-authority" };
    if (typeof p.authority.root !== "string" || !p.authority.root) return { ok: false, reason: "malformed-authority" };
    if (!Number.isInteger(p.authority.depth) || p.authority.depth < 1 || p.authority.depth > 8) return { ok: false, reason: "malformed-authority" };
  }
  return { ok: true, reason: "ok" };
}

function governRevocation(p) {
  if (!p.target || typeof p.target !== "object") return { ok: false, reason: "missing-target" };
  if (!p.target.fp && !p.target.hash && p.target.seq == null)
    return { ok: false, reason: "unresolvable-target" };
  return { ok: true, reason: "ok" };
}

/* ------------------------------- public API ------------------------------ */

/** Govern ANY selfimpulse payload by kind. Returns { ok, reason } — never throws. */
export function evaluateSelfImpulse(payload, policy = DEFAULT_POLICY) {
  const pol = policy || DEFAULT_POLICY;
  if (!payload || typeof payload !== "object") return { ok: false, reason: "empty-payload" };
  if (!pol.kinds.includes(payload.kind)) return { ok: false, reason: "unknown-selfimpulse-kind" };
  switch (payload.kind) {
    case "share": return governShare(payload, pol);
    case "agent_action": return governAgentAction(payload, pol);
    case "capability": return governCapability(payload, pol);
    case "endorsement": return governEndorsement(payload, pol);
    case "authorization": return governAuthorization(payload, pol);
    case "revocation": return governRevocation(payload);
    default: return { ok: false, reason: "unknown-selfimpulse-kind" };
  }
}

/* Backwards-compatible helpers (v0.4 API preserved). */
export function evaluateShare(payload, policy = DEFAULT_POLICY) {
  if (!payload || payload.kind !== "share") return { ok: false, reason: "not-a-share-selfimpulse" };
  return governShare(payload, policy || DEFAULT_POLICY);
}
export function evaluateMessage(text, policy = DEFAULT_POLICY) {
  const p = policy || DEFAULT_POLICY;
  if (typeof text !== "string" || !text.trim()) return { ok: false, reason: "empty-message" };
  if (text.length > p.maxMessageLen) return { ok: false, reason: "message-too-long" };
  return { ok: true, reason: "ok" };
}
export function evaluateEnvelopeTs(ts, policy = DEFAULT_POLICY, now = Date.now()) {
  const p = policy || DEFAULT_POLICY;
  if (typeof ts !== "number") return { ok: false, reason: "missing-timestamp" };
  if (Math.abs(now - ts) > p.envelopeWindowMs) return { ok: false, reason: "outside-time-window" };
  return { ok: true, reason: "ok" };
}

/** Composable policy engine. */
export class PolicyEngine {
  constructor(policy = DEFAULT_POLICY) {
    this.policy = { ...DEFAULT_POLICY, ...policy };
  }
  selfimpulse(payload) { return evaluateSelfImpulse(payload, this.policy); }
  share(payload) { return evaluateShare(payload, this.policy); }
  message(text) { return evaluateMessage(text, this.policy); }
  envelopeTs(ts, now) { return evaluateEnvelopeTs(ts, this.policy, now); }
}
