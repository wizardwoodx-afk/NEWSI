/**
 * FEDERATION · STANDING AUTHORITY — approve once, then run autonomously, with
 * the same evidence.
 *
 * THE ASK THIS MODULE ANSWERS. A crossing currently stops for a human decision
 * on EACH side, EVERY time. That is correct for the first crossing and for
 * anything unusual, and it is untenable for the tenth crossing of the same kind
 * in the same day — which is the case that actually exists in a working pair of
 * selfimpulses. The request was: let both owners approve ONCE, then let the pair work
 * autonomously, with the same security.
 *
 * WHAT IS REMOVED, EXACTLY. The human is removed from the loop. The EVIDENCE is
 * not. Every crossing still:
 *   • carries its own envelope — CSPRNG id, one nonce per side, recomputed
 *     digest, untouched by this module;
 *   • is authorised individually under the grant, by an acknowledgement bound to
 *     THIS envelope digest and THIS side's nonce;
 *   • is single-use, and lands in the same ledger and receipt path as a
 *     per-crossing decision;
 *   • is refused the moment the grant's bounds are exceeded.
 *
 * WHAT THE BOUNDS ARE — because "autonomous" without bounds is just unlogged
 * hope. A grant that cannot be exhausted, overrun in rate, or expired is not a
 * grant:
 *
 *   capabilities    enumerated, from the selfimpulse's own delegation vocabulary —
 *                   never `*`; a grant naming every capability is a blank cheque
 *   maxCrossings    a total budget; spent grants stop, they do not renew
 *   windowMs/windowMax  a rate bound, so a compromised peer cannot drain the
 *                   budget in a burst
 *   expiresAt       a date the humans must look again
 *   onOutOfScope    always "escalate" — anything outside the grant returns to a
 *                   per-crossing human decision (approval.ts), never proceeds
 *                   on standing authority by inference
 *   two signatures  BOTH owners' authority keys sign the identical canonical
 *                   body; one side cannot grant itself authority over a pair
 *
 * WHAT A RECEIPT MAY SAY, AND MAY NOT. With per-crossing approvals the honest
 * sentence was "the owner's authority key approved this crossing, naming the
 * human who authorised it." Under standing authority that sentence would be a
 * lie about *this* crossing, so the acknowledgement prints something narrower —
 * and, beside it, what is missing:
 *
 *   ATTESTED      the owner's authority key authorised this crossing in
 *                 advance, under a standing grant naming the human who set its
 *                 scope and bounds
 *   NOT ATTESTED  that a human reviewed this specific crossing — the grant was
 *                 approved once, and its bounds are what stand in for a
 *                 per-crossing decision
 *
 * That pair of sentences is the whole point of the module: autonomy that does
 * not quietly upgrade itself into human review in the record.
 *
 * It reuses, deliberately, the selfimpulse's own keypair (`authorityWeb`), the
 * delegation vocabulary from `reach/delegationGrant`, and the receipt discipline
 * of `federation/approval.ts` — a filed acknowledgement looks like a filed
 * approval, so one reader can check both. WebCrypto only, no node builtins.
 */
import { bytesToB64, b64ToBytes } from "../authorityCore";
import { importPublicKeyWeb, type OwnerKeyPairWeb } from "../authorityWeb";
import { DELEGATION_CAPABILITIES } from "../reach/delegationGrant";
import { pureSha256 } from "../pureHash";
import { APPROVAL_SIGNER } from "./approval";

export const STANDING_FORMAT = "vh.fed.standing.v1" as const;
export const STANDING_PREFIX = `ecdsa-p256:`;

/** The same key role that signs approvals signs grants — one authority, one name. */
export const STANDING_SIGNER = APPROVAL_SIGNER;

export const STANDING_ATTESTATION =
  "the selfimpulse owner's authority key authorised this crossing in advance, under a standing grant that names the human who set its scope and its bounds";

export const STANDING_NOT_ATTESTED =
  "that a human reviewed this specific crossing — the grant was approved once, and its bounds (capabilities, budget, window, expiry) are what stand in for a per-crossing decision";

/** The only honest value for out-of-scope work. Anything else is refused by name. */
export const OUT_OF_SCOPE_ESCALATE = "escalate" as const;

export interface StandingGrantBody {
  v: typeof STANDING_FORMAT;
  /** CSPRNG id — how this grant is revoked, cited and audited. */
  grantId: string;
  /** The order-free pair key both owners sign over. */
  pair: string;
  /** Enumerated capabilities from the selfimpulse's delegation vocabulary. Never a wildcard. */
  capabilities: string[];
  /** Who set the bounds, on each side. Names claimed by the keys that signed. */
  initiatorHuman: string;
  responderHuman: string;
  /** Total budget. A spent grant stops; it does not renew itself. */
  maxCrossings: number;
  /** Rate bound: at most `windowMax` crossings in any `windowMs` window. */
  windowMs: number;
  windowMax: number;
  issuedAt: number;
  expiresAt: number;
  /** Out-of-scope work escalates to a human. There is no other setting. */
  onOutOfScope: typeof OUT_OF_SCOPE_ESCALATE;
}

export interface StandingGrant extends StandingGrantBody {
  signatureInitiator: string;
  signatureResponder: string;
}

export type StandingRefusal =
  | "malformed"
  | "no-human"
  | "no-capabilities"
  | "wildcard-capability"
  | "unknown-capability"
  | "unbounded"
  | "bad-signature"
  | "grant-expired"
  | "no-grant"
  | "wrong-pair"
  | "capability-not-granted"
  | "grant-exhausted"
  | "window-exceeded"
  | "revoked"
  | "escalate";

/** Fixed field order, so both owners hash the identical bytes. */
export function standingCanonical(b: StandingGrantBody): string {
  return JSON.stringify({
    v: b.v,
    grantId: b.grantId,
    pair: b.pair,
    capabilities: [...b.capabilities].sort(),
    initiatorHuman: b.initiatorHuman,
    responderHuman: b.responderHuman,
    maxCrossings: b.maxCrossings,
    windowMs: b.windowMs,
    windowMax: b.windowMax,
    issuedAt: b.issuedAt,
    expiresAt: b.expiresAt,
    onOutOfScope: b.onOutOfScope,
  });
}

/** Judge the body alone — before any signature exists. Every vagueness is named. */
export function judgeGrantBody(b: StandingGrantBody): { ok: true } | { ok: false; reason: StandingRefusal; detail: string } {
  if (b.v !== STANDING_FORMAT) {
    return { ok: false, reason: "malformed", detail: `grant format ${String(b.v)} is not ${STANDING_FORMAT}` };
  }
  if (!b.grantId || b.grantId.trim().length === 0) {
    return { ok: false, reason: "malformed", detail: "a grant without an id cannot be revoked, cited or audited" };
  }
  if (!b.pair.includes("↔")) {
    return { ok: false, reason: "malformed", detail: "the pair key must be the two-selfimpulse pair key, not a single selfimpulse name" };
  }
  if (!b.initiatorHuman?.trim() || !b.responderHuman?.trim()) {
    return { ok: false, reason: "no-human", detail: "a standing grant runs without a human in the loop, so BOTH humans must be named at the moment it is set — an unnamed side has nobody accountable for what it authorised" };
  }
  if (!Array.isArray(b.capabilities) || b.capabilities.length === 0) {
    return { ok: false, reason: "no-capabilities", detail: "a grant that names no capability authorises nothing and must not be issued" };
  }
  if (b.capabilities.some((c) => c === "*" || c === "all" || c === "any")) {
    return { ok: false, reason: "wildcard-capability", detail: "a grant naming every capability is not a grant, it is a blank cheque — enumerate what the pair may do" };
  }
  const unknown = b.capabilities.filter((c) => !(DELEGATION_CAPABILITIES as readonly string[]).includes(c));
  if (unknown.length > 0) {
    return { ok: false, reason: "unknown-capability", detail: `"${unknown.join('", "')}" is not a delegation capability this selfimpulse has a policy for` };
  }
  if (new Set(b.capabilities).size !== b.capabilities.length) {
    return { ok: false, reason: "malformed", detail: "the same capability is listed twice; a grant is a set, not a tally" };
  }
  const ints = [b.maxCrossings, b.windowMax];
  if (!ints.every((n) => Number.isInteger(n) && n >= 1)) {
    return { ok: false, reason: "unbounded", detail: "maxCrossings and windowMax must be whole numbers of at least 1 — an unbounded grant never comes back to a human" };
  }
  if (!Number.isFinite(b.windowMs) || b.windowMs <= 0) {
    return { ok: false, reason: "unbounded", detail: "windowMs must be a positive duration; a grant with no rate window can be drained in one burst" };
  }
  if (b.windowMax > b.maxCrossings) {
    return { ok: false, reason: "unbounded", detail: `windowMax (${b.windowMax}) exceeds the whole budget (maxCrossings ${b.maxCrossings}) — the rate bound would never bind` };
  }
  if (!(b.expiresAt > b.issuedAt)) {
    return { ok: false, reason: "unbounded", detail: "a grant must expire after it is issued; one that never lapses is one nobody re-reads" };
  }
  if (b.onOutOfScope !== OUT_OF_SCOPE_ESCALATE) {
    return { ok: false, reason: "malformed", detail: `onOutOfScope must be "${OUT_OF_SCOPE_ESCALATE}" — out-of-scope work returns to a human, and there is no setting that lets it proceed` };
  }
  return { ok: true };
}

/**
 * Issue a standing grant. BOTH owners sign the identical canonical body, so
 * neither side can create authority over the pair alone.
 */
export async function issueStandingGrant(
  body: StandingGrantBody,
  initiatorKeys: OwnerKeyPairWeb,
  responderKeys: OwnerKeyPairWeb,
): Promise<{ ok: true; grant: StandingGrant } | { ok: false; reason: StandingRefusal; detail: string }> {
  const judged = judgeGrantBody(body);
  if (!judged.ok) return judged;
  const bytes = new TextEncoder().encode(standingCanonical(body)).buffer as ArrayBuffer;
  const [si, sr] = await Promise.all([
    crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, initiatorKeys.privateKey, bytes),
    crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, responderKeys.privateKey, bytes),
  ]);
  return {
    ok: true,
    grant: {
      ...body,
      capabilities: [...body.capabilities].sort(),
      signatureInitiator: `${STANDING_PREFIX}${bytesToB64(new Uint8Array(si))}`,
      signatureResponder: `${STANDING_PREFIX}${bytesToB64(new Uint8Array(sr))}`,
    },
  };
}

/** Verify a grant against both owners' public keys, and its own clock. */
export async function verifyStandingGrant(
  grant: StandingGrant | null | undefined,
  initiatorPublicKeyPem: string,
  responderPublicKeyPem: string,
  now: number,
): Promise<{ ok: true } | { ok: false; reason: StandingRefusal; detail: string }> {
  if (!grant || typeof grant !== "object") {
    return { ok: false, reason: "no-grant", detail: "no standing grant was presented — a crossing does not run autonomously on history alone" };
  }
  const judged = judgeGrantBody(grant);
  if (!judged.ok) return judged;
  if (now > grant.expiresAt) {
    return { ok: false, reason: "grant-expired", detail: `the standing grant lapsed at ${new Date(grant.expiresAt).toISOString()}; the pair must set a new one before crossing again` };
  }
  for (const [sig, pem, side] of [
    [grant.signatureInitiator, initiatorPublicKeyPem, "initiator"],
    [grant.signatureResponder, responderPublicKeyPem, "responder"],
  ] as const) {
    if (typeof sig !== "string" || !sig.startsWith(STANDING_PREFIX)) {
      return { ok: false, reason: "bad-signature", detail: `the ${side} side's grant signature is not an asymmetric signature — a history row and an HMAC tag are not a standing authority` };
    }
    try {
      const pub = await importPublicKeyWeb(pem);
      const valid = await crypto.subtle.verify(
        { name: "ECDSA", hash: "SHA-256" },
        pub,
        b64ToBytes(sig.slice(STANDING_PREFIX.length)),
        new TextEncoder().encode(standingCanonical(grant)).buffer as ArrayBuffer,
      );
      if (!valid) return { ok: false, reason: "bad-signature", detail: `the ${side} side's signature does not verify under the key it claims — treating it as forged` };
    } catch {
      return { ok: false, reason: "bad-signature", detail: `the ${side} side's public key or signature is malformed — treating it as forged` };
    }
  }
  return { ok: true };
}

/** sha256 over the canonical body AND both signatures. */
export function standingDigest(grant: StandingGrant): string {
  return pureSha256(`vh.fed.standing.v1:${standingCanonical(grant)}|${grant.signatureInitiator}|${grant.signatureResponder}`);
}

/* ── spending the grant ────────────────────────────────────────────────────
   The usage counter is the difference between autonomy and drift: it is what
   stops a grant from quietly becoming permanent. It is carried by the caller
   (the runtime holds it beside the ledger) and returned incremented, never
   mutated in place, so a refused crossing cannot spend authority. */

export interface GrantUsage {
  grantId: string;
  crossings: number;
  windowStart: number;
  windowCount: number;
}

export function freshGrantUsage(grant: StandingGrant, at: number): GrantUsage {
  return { grantId: grant.grantId, crossings: 0, windowStart: at, windowCount: 0 };
}

export interface StandingAuthorisation {
  grantId: string;
  grantDigest: string;
  pair: string;
  side: "initiator" | "responder";
  capability: string;
  /** The name the grant named for THIS side. */
  human: string;
  envelopeDigest: string;
  nonce: string;
  crossingsUsed: number;
  crossingsRemaining: number;
  at: number;
}

export interface StandingRevocation {
  grantId: string;
  pair: string;
  by: "initiator" | "responder";
  human: string;
  at: number;
  reason: string;
}

/**
 * Revoke a grant. Either side, alone, at any time — with the reason recorded,
 * because "we turned it off" is a claim and a revocation record is evidence.
 */
export function revokeStandingGrant(
  grant: StandingGrant,
  by: "initiator" | "responder",
  human: string,
  at: number,
  reason: string,
): StandingRevocation {
  return { grantId: grant.grantId, pair: grant.pair, by, human, at, reason };
}

export interface StandingExpectation {
  pair: string;
  side: "initiator" | "responder";
  capability: string;
  envelopeDigest: string;
  nonce: string;
}

export type AuthorisationVerdict =
  | { ok: true; authorisation: StandingAuthorisation; usage: GrantUsage }
  | { ok: false; reason: StandingRefusal; detail: string };

/**
 * The check that replaces the per-crossing human on routine work. It refuses by
 * name — and note which refusals are NOT failures of the grant: `escalate` and
 * `grant-exhausted` mean "this belongs to a human now", which is the designed
 * behaviour, not an error to be retried.
 */
export function authoriseUnderGrant(
  grant: StandingGrant | null | undefined,
  usage: GrantUsage | null | undefined,
  expected: StandingExpectation,
  now: number,
  revocations: StandingRevocation[] = [],
): AuthorisationVerdict {
  if (!grant) {
    return { ok: false, reason: "no-grant", detail: "no standing grant covers this pair, so this crossing needs a per-crossing human decision" };
  }
  if (grant.pair !== expected.pair) {
    return { ok: false, reason: "wrong-pair", detail: `this grant covers ${grant.pair}, and the crossing is ${expected.pair}` };
  }
  const revoked = revocations.find((r) => r.grantId === grant.grantId);
  if (revoked) {
    return { ok: false, reason: "revoked", detail: `the ${revoked.by} side revoked this grant at ${new Date(revoked.at).toISOString()}: ${revoked.reason}` };
  }
  if (now > grant.expiresAt) {
    return { ok: false, reason: "grant-expired", detail: `the standing grant lapsed at ${new Date(grant.expiresAt).toISOString()}` };
  }
  if (!grant.capabilities.includes(expected.capability)) {
    return {
      ok: false,
      reason: "escalate",
      detail: `"${expected.capability}" is outside this grant (${grant.capabilities.join(", ")}) — the crossing returns to a per-crossing human decision rather than proceeding on standing authority`,
    };
  }
  const used = usage && usage.grantId === grant.grantId ? usage : freshGrantUsage(grant, now);
  if (used.crossings >= grant.maxCrossings) {
    return { ok: false, reason: "grant-exhausted", detail: `the grant authorised ${grant.maxCrossings} crossings and all of them are spent — set a new grant, which means two humans looking again` };
  }
  const windowExpired = now - used.windowStart >= grant.windowMs;
  const windowCount = windowExpired ? 0 : used.windowCount;
  if (windowCount >= grant.windowMax) {
    return { ok: false, reason: "window-exceeded", detail: `the grant allows ${grant.windowMax} crossings per ${grant.windowMs}ms and this window is spent — wait for the window rather than raising the bound` };
  }
  const nextUsage: GrantUsage = {
    grantId: grant.grantId,
    crossings: used.crossings + 1,
    windowStart: windowExpired ? now : used.windowStart,
    windowCount: windowCount + 1,
  };
  return {
    ok: true,
    usage: nextUsage,
    authorisation: {
      grantId: grant.grantId,
      grantDigest: standingDigest(grant),
      pair: grant.pair,
      side: expected.side,
      capability: expected.capability,
      human: expected.side === "initiator" ? grant.initiatorHuman : grant.responderHuman,
      envelopeDigest: expected.envelopeDigest,
      nonce: expected.nonce,
      crossingsUsed: nextUsage.crossings,
      crossingsRemaining: grant.maxCrossings - nextUsage.crossings,
      at: now,
    },
  };
}

/**
 * The filed form — shaped like `ApprovalRecord` so one reader checks both, with
 * the two sentences that keep an autonomous crossing from claiming human review
 * it never had.
 */
export interface StandingAcknowledgement {
  kind: "standing";
  grantId: string;
  grantDigest: string;
  pair: string;
  side: "initiator" | "responder";
  capability: string;
  /** The name the grant named for this side. A claim by the key holder. */
  human: string;
  signedBy: typeof STANDING_SIGNER;
  ownerKeyHandle?: string;
  crossingsUsed: number;
  crossingsRemaining: number;
  envelopeDigest: string;
  nonce: string;
  /** What this crossing's authority is, in words a receipt may print verbatim. */
  attests: string;
  /** What it is NOT — printed beside `attests`, never omitted. */
  notAttested: string;
  digest: string;
}

export function standingAcknowledgement(
  a: StandingAuthorisation,
  signerKey?: { publicKeyPem: string; handle: string },
): StandingAcknowledgement {
  const body = {
    kind: "standing" as const,
    grantId: a.grantId,
    grantDigest: a.grantDigest,
    pair: a.pair,
    side: a.side,
    capability: a.capability,
    human: a.human,
    signedBy: STANDING_SIGNER,
    ...(signerKey ? { ownerKeyHandle: signerKey.handle } : {}),
    crossingsUsed: a.crossingsUsed,
    crossingsRemaining: a.crossingsRemaining,
    envelopeDigest: a.envelopeDigest,
    nonce: a.nonce,
  };
  return {
    ...body,
    attests: STANDING_ATTESTATION,
    notAttested: STANDING_NOT_ATTESTED,
    digest: pureSha256(`vh.fed.standing.ack.v1:${JSON.stringify(body)}`),
  };
}

/** The one-line statement a surface prints beside an autonomous crossing. */
export function standingNotice(grant: StandingGrant, usage: GrantUsage): string {
  return `standing authority: ${grant.capabilities.join(", ")} on ${grant.pair} — ${usage.crossings}/${grant.maxCrossings} crossings used, expiring ${new Date(grant.expiresAt).toISOString()}; out-of-scope work returns to a human`;
}
