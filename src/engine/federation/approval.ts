/**
 * FEDERATION · APPROVAL — a human decision, signed, bound to ONE crossing.
 *
 * THE DEFECT THIS MODULE EXISTS TO CLOSE. In the 19.5.6-alpha Bridge, the
 * responder side of a first crossing inferred permission from history: it
 * called `hasCrossedBefore(pair)` and treated a prior `success` row in the
 * ledger as evidence that a human had approved the relationship. A ledger row
 * is a RECORD; an approval is a DECISION. The two are not interchangeable, and
 * a row that anyone can append is not a signature by the human who owns the
 * machine. The initiator side already had a real signed approval; the responder
 * side did not. This module gives both sides the same object.
 *
 * WHAT AN APPROVAL IS HERE — STATE IT PRECISELY:
 *
 *   human            named, non-empty, and never a role string — a NAME THE
 *                    SIGNER CLAIMS, not a separate credential
 *     ↓ named by
 *   signature        ECDSA P-256 by the selfimpulse's OWNER AUTHORITY KEY — the same
 *                    key that signs mandates, held in the owner's keystore
 *     ↓ over
 *   body             bound to THIS pair, THIS side, THIS capability,
 *                    THIS crossing envelope digest, and THIS nonce
 *     ↓ which is
 *   single-use       consumed once; a replay is refused by name
 *
 * WHAT THAT PROVES, AND WHAT IT DOES NOT. This distinction is the difference
 * between an accurate release note and a misleading one, so it is stated here,
 * returned in every record, and pinned by probe:
 *
 *   PROVEN      the owner-controlled authority key of that selfimpulse approved this
 *               crossing, and it named the human it was acting on behalf of.
 *               The approval cannot be re-aimed at another pair, side,
 *               capability, envelope or nonce, and it can be spent once.
 *
 *   NOT PROVEN  that the named human authenticated with a credential DISTINCT
 *               from the owner key. A name is a claim the key holder makes; it
 *               is recorded and it is accountable (a receipt shows which key
 *               signed and which name it used), but no second factor, device or
 *               human-held key stands behind it.
 *
 * So the honest sentence is "the owner's authority key approved, naming the
 * human who authorised it" — never "the human signed". `APPROVAL_ATTESTATION`
 * and `APPROVAL_NOT_ATTESTED` carry those two sentences so no caller has to
 * paraphrase, and `approvalRecord` puts both, plus the signing key's handle,
 * beside every filed decision.
 *
 * It reuses, deliberately:
 *   • the selfimpulse's durable owner key (`authorityWeb.OwnerKeyPairWeb` — the same
 *     ECDSA P-256 key that signs mandates, resolved through the keystore in
 *     `ownerKeyStore.ts`) rather than minting an identity of its own;
 *   • the capability vocabulary from `reach/delegationGrant`, so an approval
 *     cannot name a capability the selfimpulse has no policy for.
 *
 * Everything here is runtime-agnostic: WebCrypto only, no node builtins.
 */
import { bytesToB64, b64ToBytes } from "../authorityCore";
import { importPublicKeyWeb, type OwnerKeyPairWeb } from "../authorityWeb";
import { DELEGATION_CAPABILITIES } from "../reach/delegationGrant";
import { pureSha256 } from "../pureHash";

export const APPROVAL_SCHEME = "ecdsa-p256" as const;
export const APPROVAL_FORMAT = "vh.fed.approval.v1" as const;

/** A signature that does not name its domain is not portable evidence. */
export const APPROVAL_PREFIX = `${APPROVAL_SCHEME}:`;

/**
 * Who signed, in one word. A caller that shows a decision to a person owes them
 * this: the signature is the SELFIMPULSE OWNER'S authority key, acting on behalf of
 * the human named in the body — not a separate human credential.
 */
export const APPROVAL_SIGNER = "owner-authority-key" as const;

/** The sentence a receipt may print about what an approval proves. */
export const APPROVAL_ATTESTATION =
  "the selfimpulse owner's authority key approved this crossing, naming the human who authorised it";

/**
 * The sentence a receipt must print about what it does NOT prove. Kept as a
 * constant rather than left to each caller's judgment: the failure mode here is
 * a UI sentence that quietly upgrades an owner-key approval into an independent
 * human signature.
 */
export const APPROVAL_NOT_ATTESTED =
  "that the named human authenticated with a credential distinct from the owner key";

export interface FederationApprovalBody {
  v: typeof APPROVAL_FORMAT;
  /** CSPRNG id — the handle this decision is filed under. */
  approvalId: string;
  /** The order-free pair key of the two selfimpulses (SelfImpulseMesh's `pairKey`). */
  pair: string;
  /** Which side of the crossing this human sits on. */
  side: "initiator" | "responder";
  /** The capability this decision authorises — one, named, not a bundle. */
  capability: string;
  /** sha256 (64-hex) of the crossing envelope this decision authorises. */
  envelopeDigest: string;
  /** CSPRNG nonce, bound into the signature so a decision cannot be re-aimed. */
  nonce: string;
  /** The human who decided. A machine name here is a refusal, not a warning. */
  human: string;
  decidedAt: number;
  expiresAt: number;
}

export interface FederationApproval extends FederationApprovalBody {
  signature: string;
}

export type ApprovalRefusal =
  | "malformed"
  | "no-human"
  | "unknown-capability"
  | "not-a-crossing-binding"
  | "wrong-pair"
  | "wrong-side"
  | "wrong-capability"
  | "wrong-envelope"
  | "wrong-nonce"
  | "expired"
  | "bad-signature"
  | "replayed-approval";

export type ApprovalVerdict =
  | { ok: true; approval: FederationApproval }
  | { ok: false; reason: ApprovalRefusal; detail: string };

const HEX64 = /^[0-9a-f]{64}$/;
/** Below this a nonce is guessable; the runtime mints 122-bit ids, so this is a floor, not a target. */
export const MIN_NONCE_CHARS = 16;

/** Fixed field order, so both sides hash the same bytes. */
export function approvalCanonical(b: FederationApprovalBody): string {
  return JSON.stringify({
    v: b.v,
    approvalId: b.approvalId,
    pair: b.pair,
    side: b.side,
    capability: b.capability,
    envelopeDigest: b.envelopeDigest,
    nonce: b.nonce,
    human: b.human,
    decidedAt: b.decidedAt,
    expiresAt: b.expiresAt,
  });
}

export type IssueResult = { ok: true; approval: FederationApproval } | { ok: false; reason: ApprovalRefusal; detail: string };

/**
 * Sign a human's decision. Refusals are in words and happen BEFORE a signature
 * exists — the runtime never issues something it would then have to distrust.
 */
export async function issueFederationApproval(body: FederationApprovalBody, keys: OwnerKeyPairWeb): Promise<IssueResult> {
  if (body.v !== APPROVAL_FORMAT) {
    return { ok: false, reason: "malformed", detail: `approval format ${String(body.v)} is not ${APPROVAL_FORMAT}` };
  }
  if (body.approvalId.trim().length === 0) {
    return { ok: false, reason: "malformed", detail: "an approval without an id cannot be revoked, filed or replayed-checked" };
  }
  if (body.human.trim().length === 0) {
    return { ok: false, reason: "no-human", detail: "a capability decision must name the person it is made on behalf of; without a name there is nothing to sign" };
  }
  if (!body.pair.includes("↔")) {
    return { ok: false, reason: "malformed", detail: "the pair key must be the two-selfimpulse pair key, not a single selfimpulse name" };
  }
  if (body.side !== "initiator" && body.side !== "responder") {
    return { ok: false, reason: "malformed", detail: `side "${String(body.side)}" is neither end of a crossing` };
  }
  if (!(DELEGATION_CAPABILITIES as readonly string[]).includes(body.capability)) {
    return { ok: false, reason: "unknown-capability", detail: `"${body.capability}" is not a delegation capability the selfimpulse has a policy for` };
  }
  if (!HEX64.test(body.envelopeDigest)) {
    return { ok: false, reason: "not-a-crossing-binding", detail: "the envelope digest must be the 64-hex sha256 of the exact crossing this decision authorises" };
  }
  if (body.nonce.trim().length < MIN_NONCE_CHARS) {
    return { ok: false, reason: "not-a-crossing-binding", detail: `the nonce must be at least ${MIN_NONCE_CHARS} characters of CSPRNG output — a short nonce can be aimed` };
  }
  if (!(body.expiresAt > body.decidedAt)) {
    return { ok: false, reason: "expired", detail: "an approval that expires before it is decided authorises nothing" };
  }
  const sig = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    keys.privateKey,
    new TextEncoder().encode(approvalCanonical(body)).buffer as ArrayBuffer,
  );
  return { ok: true, approval: { ...body, signature: `${APPROVAL_PREFIX}${bytesToB64(new Uint8Array(sig))}` } };
}

export interface ApprovalExpectation {
  /** The verifier's own view of the crossing — never taken from the approval itself. */
  pair: string;
  side: "initiator" | "responder";
  capability: string;
  envelopeDigest: string;
  nonce: string;
}

/**
 * Verify a human's decision against the crossing actually in front of you.
 * EVERY mismatch is named: an approval for another pair, another capability,
 * another envelope or another nonce is a refusal with a reason, not a warning.
 */
export async function verifyFederationApproval(
  approval: FederationApproval | null | undefined,
  expected: ApprovalExpectation,
  publicKeyPem: string,
  now: number,
): Promise<ApprovalVerdict> {
  if (!approval || typeof approval !== "object") {
    return { ok: false, reason: "malformed", detail: "no approval was presented — the crossing does not proceed on history alone" };
  }
  if (approval.v !== APPROVAL_FORMAT) {
    return { ok: false, reason: "malformed", detail: `approval format ${String(approval.v)} is not ${APPROVAL_FORMAT}` };
  }
  if (!approval.human || approval.human.trim().length === 0) {
    return { ok: false, reason: "no-human", detail: "the approval names no human, so there is nobody to hold accountable for it" };
  }
  if (approval.pair !== expected.pair) {
    return { ok: false, reason: "wrong-pair", detail: `this approval was decided for ${approval.pair}, and the crossing is ${expected.pair}` };
  }
  if (approval.side !== expected.side) {
    return { ok: false, reason: "wrong-side", detail: `this approval was decided on the ${approval.side} side; it is being presented on the ${expected.side} side` };
  }
  if (approval.capability !== expected.capability) {
    return { ok: false, reason: "wrong-capability", detail: `this approval authorises "${approval.capability}", not "${expected.capability}"` };
  }
  if (approval.envelopeDigest !== expected.envelopeDigest) {
    return { ok: false, reason: "wrong-envelope", detail: "this approval was decided for a different crossing envelope" };
  }
  if (approval.nonce !== expected.nonce) {
    return { ok: false, reason: "wrong-nonce", detail: "this approval was decided for a different nonce — it cannot be re-aimed at this crossing" };
  }
  if (now > approval.expiresAt) {
    return { ok: false, reason: "expired", detail: `the approval expired at ${new Date(approval.expiresAt).toISOString()}, before this crossing` };
  }
  if (!approval.signature.startsWith(APPROVAL_PREFIX)) {
    return { ok: false, reason: "bad-signature", detail: "not an asymmetric signature — a history row and an HMAC tag are not an owner-key approval" };
  }
  try {
    const pub = await importPublicKeyWeb(publicKeyPem);
    const valid = await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      pub,
      b64ToBytes(approval.signature.slice(APPROVAL_PREFIX.length)),
      new TextEncoder().encode(approvalCanonical(approval)).buffer as ArrayBuffer,
    );
    if (!valid) return { ok: false, reason: "bad-signature", detail: "the signature does not verify under the key it claims — treating it as forged" };
    return { ok: true, approval };
  } catch {
    return { ok: false, reason: "bad-signature", detail: "public key or signature malformed — treating it as forged" };
  }
}

/* ── single use ─────────────────────────────────────────────────────────────
   A decision authorises one crossing. The ledger is bounded so a long-lived
   selfimpulse cannot accumulate decisions forever, and it records the approval id
   so a replay is refused BY NAME rather than by luck. */

export interface ApprovalLedger {
  has(id: string): boolean;
  add(id: string): void;
  readonly size: number;
}

export function memoryApprovalLedger(cap = 500): ApprovalLedger {
  const seen: string[] = [];
  return {
    has: (id) => seen.includes(id),
    add: (id) => {
      seen.push(id);
      if (seen.length > cap) seen.splice(0, seen.length - cap);
    },
    get size() {
      return seen.length;
    },
  };
}

export type ConsumeVerdict = { ok: true } | { ok: false; reason: "replayed-approval"; detail: string };

/**
 * Spend an approval. Verifies BEFORE it spends, so a failed crossing does not
 * burn the human's decision, and a successful one cannot be presented twice.
 */
export async function consumeApproval(
  approval: FederationApproval,
  expected: ApprovalExpectation,
  publicKeyPem: string,
  now: number,
  ledger: ApprovalLedger,
): Promise<ConsumeVerdict> {
  const verdict = await verifyFederationApproval(approval, expected, publicKeyPem, now);
  if (!verdict.ok) return { ok: false, reason: "replayed-approval", detail: `${verdict.reason}: ${verdict.detail}` };
  if (ledger.has(approval.approvalId)) {
    return { ok: false, reason: "replayed-approval", detail: `approval ${approval.approvalId} has already been spent on an earlier crossing` };
  }
  ledger.add(approval.approvalId);
  return { ok: true };
}

/**
 * The filed form: the decision, its digest, and — this is the part that keeps a
 * receipt honest — WHO signed it and what that signature does not prove.
 *
 * `signerKey` is the public key the approval verified against. When a caller has
 * it (the crossing engine always does), the record carries the key's recognition
 * handle, so two approvals naming the same human from two different keys are
 * distinguishable on the receipt.
 */
export interface ApprovalRecord {
  approvalId: string;
  pair: string;
  side: "initiator" | "responder";
  capability: string;
  envelopeDigest: string;
  /** The name the SIGNER claimed. A claim by the key holder, not a credential. */
  human: string;
  /** Always `owner-authority-key`: the selfimpulse's own key signed, on behalf of `human`. */
  signedBy: typeof APPROVAL_SIGNER;
  /** The recognition handle of the key that signed, when the caller knows it. */
  ownerKeyHandle?: string;
  /** What this approval proves, in words a receipt may print verbatim. */
  attests: string;
  /** What it does NOT prove — printed beside `attests`, never omitted. */
  notAttested: string;
  decidedAt: number;
  expiresAt: number;
  digest: string;
}

/** The filed form: the decision and its digest, safe to attach to a receipt. */
export function approvalRecord(approval: FederationApproval, signerKey?: { publicKeyPem: string; handle: string }): ApprovalRecord {
  return {
    approvalId: approval.approvalId,
    pair: approval.pair,
    side: approval.side,
    capability: approval.capability,
    envelopeDigest: approval.envelopeDigest,
    human: approval.human,
    signedBy: APPROVAL_SIGNER,
    ...(signerKey ? { ownerKeyHandle: signerKey.handle } : {}),
    attests: APPROVAL_ATTESTATION,
    notAttested: APPROVAL_NOT_ATTESTED,
    decidedAt: approval.decidedAt,
    expiresAt: approval.expiresAt,
    digest: approvalDigest(approval),
  };
}

/**
 * sha256 over the canonical body AND the signature, using the selfimpulse's own
 * synchronous SHA-256 (`engine/pureHash`) — the same implementation that is
 * probe-pinned byte-for-byte against node:crypto. An approval digest that was
 * not real SHA-256 would be a checksum wearing evidence's clothes.
 */
export function approvalDigest(approval: FederationApproval): string {
  return pureSha256(`vh.fed.approval.v1:${approvalCanonical(approval)}|${approval.signature}`);
}
