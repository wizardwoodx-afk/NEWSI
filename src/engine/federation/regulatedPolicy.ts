/**
 * FEDERATION · REGULATED ACTIVATION — a catalog entry is not regulatory authority.
 *
 * THE REVIEWER'S PRODUCT NOTE, TAKEN AS A DESIGN CONSTRAINT.
 *
 * The 19.6.2 bench added 230 registered specialists across domains where the
 * governing rule matters as much as the technique — avionics software, medical
 * software, occupational and process safety, structural and electrical
 * inspection, official statistics, courts, immigration, customs, public health.
 *
 * Those entries are REGISTERED, not routed: they carry specification, routing
 * vocabulary, an honest risk tier and doctrine, and they receive no work until
 * the owner wires them in. That was already the architecture. What was missing
 * was the second half of the sentence:
 *
 *     a catalog entry for a regulated domain is not a claim that this product,
 *     or the person running it, holds authority in that domain.
 *
 * So activation is not a boolean. A regulated specialist becomes routable in a
 * JURISDICTION and a CONTEXT, both named by a person, both recorded, and both
 * renewable. This module is the policy that says so — small on purpose: it holds
 * no capability, it routes nothing, and it changes no behaviour on its own. It
 * exists so the product cannot quietly acquire authority it was never given, and
 * so a reviewer can read the rule in one screen.
 *
 * WHERE ENFORCEMENT HAPPENS. `activationGaps()` returns what is still missing for
 * a request; a caller that wants to hold the line calls it before enabling
 * anything. Wiring it into the router is the owner's decision, exactly like
 * wiring the registered benches themselves — and `probe/fedFleet` fails if a
 * registered bench ever reaches the router silently.
 */

import { bytesToB64, b64ToBytes } from "../authorityCore";
import { importPublicKeyWeb, type OwnerKeyPairWeb } from "../authorityWeb";
import { pureSha256 } from "../pureHash";
import { APPROVAL_SIGNER } from "./approval";

/** The sentence that travels with every regulated-capable surface. */
export const REGULATED_DISCLAIMER =
  "a catalog entry is not regulatory authority: this bench is specified domain knowledge, and it becomes usable only under an activation that names a jurisdiction and a context";

/** The two gates, in the order a person meets them. */
export const ACTIVATION_REQUIREMENTS = [
  {
    id: "owner-enablement",
    label: "explicit owner enablement",
    detail: "the selfimpulse owner enables the bench on purpose; it is never enabled by default, by upgrade, or by a caller",
  },
  {
    id: "jurisdiction",
    label: "a named jurisdiction",
    detail: "the rule that governs the work is named (e.g. \"IN\" or \"EU\") — an unstated jurisdiction is a refusal, not a default",
  },
  {
    id: "context",
    label: "a named context",
    detail: "what the agent is allowed to be in that jurisdiction is stated (advisory, preparer, reviewer, operator) — \"full access\" is not a context",
  },
] as const;

export type ActivationRequirementId = (typeof ACTIVATION_REQUIREMENTS)[number]["id"];

/**
 * What an activation must say. `renewBy` is required in spirit: a regulated
 * authorisation that never lapses is one nobody re-reads.
 */
export interface RegulatedActivation {
  /** Which registered specialists this covers — domain slugs, not ids. */
  domains: string[];
  /** Who enabled it. A person, named. */
  enabledBy: string;
  /** The rule that governs the work. Uppercase region code or a named regime. */
  jurisdiction: string;
  /** What the agent may act as here. */
  context: "advisory" | "preparer" | "reviewer" | "operator";
  /** When this activation must be reconsidered. */
  renewBy: number;
  /** Anything the requester wants on the record. */
  note?: string;
}

export type ActivationRefusal =
  | { ok: false; reason: "no-owner" | "no-domains" | "no-jurisdiction" | "weak-jurisdiction" | "no-context" | "no-renewal" | "expired"; detail: string }
  | { ok: true; activation: RegulatedActivation; attests: string; notAttested: string };

/**
 * Judge an activation the way the rest of this codebase judges a claim: every
 * way of leaving it vague has its own refusal, in words a person can act on.
 *
 * This says the REQUEST is complete and current. It does not say the jurisdiction
 * accepts it — no software can promise that, and this module will not pretend to.
 */
export function judgeActivation(activation: Partial<RegulatedActivation> | null | undefined, now: number): ActivationRefusal {
  if (!activation || typeof activation !== "object") {
    return { ok: false, reason: "no-owner", detail: "no activation was proposed, so no regulated bench may be enabled" };
  }
  if (!activation.enabledBy || activation.enabledBy.trim().length === 0) {
    return { ok: false, reason: "no-owner", detail: "an activation is enabled by a named person; without one there is nobody accountable for it" };
  }
  const domains = (activation.domains ?? []).filter((d) => typeof d === "string" && d.trim().length > 0);
  if (domains.length === 0) {
    return { ok: false, reason: "no-domains", detail: "an activation that names no domain enables nothing, and a blanket activation enables everything" };
  }
  const jurisdiction = (activation.jurisdiction ?? "").trim();
  if (jurisdiction.length === 0) {
    return { ok: false, reason: "no-jurisdiction", detail: "the governing rule must be named; an implied jurisdiction is a refusal, because the law is not universal" };
  }
  if (jurisdiction.length < 2) {
    return { ok: false, reason: "weak-jurisdiction", detail: `"${jurisdiction}" does not name a jurisdiction a person could check` };
  }
  if (!activation.context) {
    return { ok: false, reason: "no-context", detail: "state what the agent may act as here (advisory, preparer, reviewer, operator) — access is not a context" };
  }
  if (typeof activation.renewBy !== "number" || !Number.isFinite(activation.renewBy)) {
    return { ok: false, reason: "no-renewal", detail: "an activation that never lapses is one nobody re-reads; name the date it must be reconsidered" };
  }
  if (activation.renewBy <= now) {
    return { ok: false, reason: "expired", detail: `this activation lapsed at ${new Date(activation.renewBy).toISOString()} and must be reconsidered before the bench is used again` };
  }
  const complete: RegulatedActivation = {
    domains,
    enabledBy: activation.enabledBy.trim(),
    jurisdiction,
    context: activation.context,
    renewBy: activation.renewBy,
    ...(activation.note ? { note: activation.note } : {}),
  };
  return {
    ok: true,
    activation: complete,
    attests: `${complete.enabledBy} enabled ${domains.length} regulated domain(s) as ${complete.context} under ${jurisdiction}, until ${new Date(complete.renewBy).toISOString()}`,
    notAttested: ACTIVATION_NOT_ATTESTED,
  };
}

/** Which requirements are still unmet — the checklist a UI renders. */
export function activationGaps(activation: Partial<RegulatedActivation> | null | undefined, now: number): ActivationRequirementId[] {
  const verdict = judgeActivation(activation, now);
  if (verdict.ok) return [];
  const map: Record<Exclude<ActivationRefusal, { ok: true }>["reason"], ActivationRequirementId> = {
    "no-owner": "owner-enablement",
    "no-domains": "owner-enablement",
    "no-jurisdiction": "jurisdiction",
    "weak-jurisdiction": "jurisdiction",
    "expired": "jurisdiction",
    "no-context": "context",
    "no-renewal": "context",
  };
  return [map[verdict.reason]];
}

/** The one-line statement a surface prints beside a regulated bench. */
export function regulatedNotice(domainCount: number): string {
  return `${domainCount} regulated-field specialist(s) are catalogued and NOT routed. ${REGULATED_DISCLAIMER}.`;
}

/* ── BINDING ACTIVATION TO AN OWNER KEY ──────────────────────────────────────

   REVIEWER'S NOTE, ANSWERED HERE. `enabledBy` is a string. That is enough to say
   "priya enabled this bench" and NOT enough to say "the authenticated selfimpulse
   owner identity represented by key X enabled this". While the bench is unrouted
   and this module holds no capability, that gap is contained. The moment anything
   is wired to it, the governance chain has to match the one the crossing plane
   already uses: a decision, signed by the owner's authority key, bound to the
   exact content it authorises, filed with the same sentences as an approval.

   So activation now has a signed form, and the binding covers precisely what the
   reviewer listed — enabledBy, the owner key, the activation digest, jurisdiction,
   context and renewBy — plus the domains, because a signature that does not cover
   the domain list could be re-aimed at another bench.

   `judgeActivation` remains the completeness check (no crypto, usable by a UI
   checklist). The signature sits on top of it, never instead of it. */

export const ACTIVATION_FORMAT = "vh.regulated.activation.v1" as const;
export const ACTIVATION_PREFIX = "ecdsa-p256:" as const;

/** The same key role that signs crossings and grants — one authority, one name. */
export const ACTIVATION_SIGNER = APPROVAL_SIGNER;

/** What a signed activation proves, in words a surface may print verbatim. */
export const ACTIVATION_ATTESTATION =
  "the selfimpulse owner's authority key enabled this regulated bench, naming the human who authorised it, in the jurisdiction and context recorded here, until the renewal date";

/** What it does NOT prove — printed beside `attests`, never omitted. */
export const ACTIVATION_NOT_ATTESTED =
  "that this jurisdiction or any authority in it has accepted, licensed or approved this use";

/** Fixed field order, so signer and verifier hash the identical bytes. */
export function activationCanonical(a: RegulatedActivation): string {
  return JSON.stringify({
    v: ACTIVATION_FORMAT,
    domains: [...a.domains].sort(),
    enabledBy: a.enabledBy,
    jurisdiction: a.jurisdiction,
    context: a.context,
    renewBy: a.renewBy,
  });
}

export interface SignedRegulatedActivation extends RegulatedActivation {
  signature: string;
}

export type ActivationSignatureRefusal = "unsigned-activation" | "bad-signature";

export type SignedActivationVerdict =
  | { ok: true; activation: SignedRegulatedActivation; attests: string; notAttested: string }
  | { ok: false; reason: ActivationRefusal extends never ? never : string; detail: string };

/**
 * Enable a regulated bench, in a jurisdiction and a context, under the owner's
 * key. Completeness is judged FIRST: the runtime never signs something it would
 * then have to distrust.
 */
export async function issueRegulatedActivation(
  activation: Partial<RegulatedActivation> | null | undefined,
  keys: OwnerKeyPairWeb,
  now: number,
): Promise<{ ok: true; activation: SignedRegulatedActivation } | { ok: false; reason: string; detail: string }> {
  const judged = judgeActivation(activation, now);
  if (!judged.ok) return { ok: false, reason: judged.reason, detail: judged.detail };
  const sig = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    keys.privateKey,
    new TextEncoder().encode(activationCanonical(judged.activation)).buffer as ArrayBuffer,
  );
  return { ok: true, activation: { ...judged.activation, signature: `${ACTIVATION_PREFIX}${bytesToB64(new Uint8Array(sig))}` } };
}

/** sha256 over the canonical body AND the signature — the handle an audit cites. */
export function activationDigest(a: SignedRegulatedActivation): string {
  return pureSha256(`${ACTIVATION_FORMAT}:${activationCanonical(a)}|${a.signature}`);
}

export type VerifyActivationVerdict =
  | { ok: true; activation: SignedRegulatedActivation; attests: string; notAttested: string }
  | { ok: false; reason: "unsigned-activation" | "bad-signature" | string; detail: string };

/**
 * Verify a signed activation against the owner key it claims and the clock. An
 * unsigned activation is REFUSED BY NAME rather than accepted with a note — the
 * whole point of this path is that a named string is not an authorisation.
 */
export async function verifyRegulatedActivation(
  activation: SignedRegulatedActivation | (Partial<RegulatedActivation> & { signature?: string }) | null | undefined,
  publicKeyPem: string,
  now: number,
): Promise<VerifyActivationVerdict> {
  if (!activation || typeof activation !== "object") {
    return { ok: false, reason: "unsigned-activation", detail: "no activation was presented, so no regulated bench may be enabled" };
  }
  const sig = (activation as { signature?: string }).signature;
  if (typeof sig !== "string" || sig.length === 0) {
    return { ok: false, reason: "unsigned-activation", detail: "this activation names a person but carries no owner-key signature — a name is not an authorisation" };
  }
  const judged = judgeActivation(activation as Partial<RegulatedActivation>, now);
  if (!judged.ok) return { ok: false, reason: judged.reason, detail: judged.detail };
  if (!sig.startsWith(ACTIVATION_PREFIX)) {
    return { ok: false, reason: "bad-signature", detail: "not an asymmetric signature — an HMAC tag or a log line is not an owner-key activation" };
  }
  try {
    const pub = await importPublicKeyWeb(publicKeyPem);
    const valid = await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      pub,
      b64ToBytes(sig.slice(ACTIVATION_PREFIX.length)),
      new TextEncoder().encode(activationCanonical(judged.activation)).buffer as ArrayBuffer,
    );
    if (!valid) return { ok: false, reason: "bad-signature", detail: "the signature does not verify under the key it claims — treating it as forged" };
  } catch {
    return { ok: false, reason: "bad-signature", detail: "public key or signature malformed — treating it as forged" };
  }
  const signed: SignedRegulatedActivation = { ...judged.activation, signature: sig };
  /* Two different sentences, kept apart on purpose. `judged.attests` DESCRIBES the
     activation ("priya enabled 2 regulated domain(s) …"); what a verifier needs is
     the claim the SIGNATURE carries — and, beside it, the claim it does not. */
  return { ok: true, activation: signed, attests: ACTIVATION_ATTESTATION, notAttested: ACTIVATION_NOT_ATTESTED };
}

/**
 * The filed form — same shape of honesty as `ApprovalRecord`: who signed, what
 * it proves, and what it does not.
 */
export interface ActivationRecord {
  domains: string[];
  enabledBy: string;
  jurisdiction: string;
  context: RegulatedActivation["context"];
  renewBy: number;
  signedBy: typeof ACTIVATION_SIGNER;
  ownerKeyHandle?: string;
  attests: string;
  notAttested: string;
  digest: string;
}

export function activationRecord(
  activation: SignedRegulatedActivation,
  signerKey?: { publicKeyPem: string; handle: string },
): ActivationRecord {
  return {
    domains: [...activation.domains].sort(),
    enabledBy: activation.enabledBy,
    jurisdiction: activation.jurisdiction,
    context: activation.context,
    renewBy: activation.renewBy,
    signedBy: ACTIVATION_SIGNER,
    ...(signerKey ? { ownerKeyHandle: signerKey.handle } : {}),
    attests: ACTIVATION_ATTESTATION,
    notAttested: ACTIVATION_NOT_ATTESTED,
    digest: activationDigest(activation),
  };
}
