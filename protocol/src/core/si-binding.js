import { VHPolicyError } from "./si-errors.js";

/**
 * Assert that the cryptographic signer matches the identity claimed by
 * the selfimpulse payload.  Called in two places:
 *
 *   1. VHClient._submit() — client-side, before sealing the envelope.
 *   2. selfimpulse.js selfimpulse:submit handler — server-side, after openSecure().
 *
 * @param {object} facts     Parsed selfimpulse payload.
 * @param {string} signerFp  Fingerprint of the entity that signed the envelope
 *                           (from the authenticated session, never from facts).
 * @returns {{ ok: boolean, reason?: string }}
 */
export function assertSignerBinding(facts, signerFp) {
  if (!facts || typeof facts !== "object")
    return { ok: false, reason: "binding:empty-payload" };
  if (typeof signerFp !== "string" || !signerFp)
    return { ok: false, reason: "binding:no-signer-fp" };

  switch (facts.kind) {
    case "agent_action": {
      const agentFp = facts.agent?.fp;
      if (!agentFp)              return { ok: false, reason: "binding:missing-agent-fp" };
      if (agentFp !== signerFp)  return { ok: false, reason: "binding:agent-fp-mismatch" };
      return { ok: true };
    }
    case "capability": {
      const agentFp = facts.agent?.fp;
      if (!agentFp)              return { ok: false, reason: "binding:missing-agent-fp" };
      if (agentFp !== signerFp)  return { ok: false, reason: "binding:agent-fp-mismatch" };
      return { ok: true };
    }
    case "share": {
      const fromFp = facts.from?.fp;
      if (!fromFp)               return { ok: false, reason: "binding:missing-from-fp" };
      if (fromFp !== signerFp)   return { ok: false, reason: "binding:share-from-mismatch" };
      return { ok: true };
    }
    case "endorsement": {
      const fromFp = facts.from?.fp;
      if (!fromFp)               return { ok: false, reason: "binding:missing-from-fp" };
      if (fromFp !== signerFp)   return { ok: false, reason: "binding:endorsement-from-mismatch" };
      return { ok: true };
    }
    case "authorization": {
      const fromFp = facts.from?.fp;
      if (!fromFp)               return { ok: false, reason: "binding:missing-from-fp" };
      if (fromFp !== signerFp)   return { ok: false, reason: "binding:authorization-from-mismatch" };
      return { ok: true };
    }
    case "revocation": {
      const fromFp = facts.from?.fp;
      if (!fromFp)               return { ok: false, reason: "binding:missing-from-fp" };
      if (fromFp !== signerFp)   return { ok: false, reason: "binding:revocation-from-mismatch" };
      return { ok: true };
    }
    default:
      /* unknown kinds pass through — policy engine handles kind validation */
      return { ok: true };
  }
}
