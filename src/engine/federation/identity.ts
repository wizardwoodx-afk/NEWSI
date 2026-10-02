/**
 * FEDERATION · IDENTITY — one identity system, not two.
 *
 * THE REVIEWER'S THIRD POINT. The alpha's `createSelfImpulseKeys()` kept a private
 * key inside a closure and never persisted it. That is a fine *module* security
 * model and a terrible *identity* model: a selfimpulse whose signing key dies with
 * the tab cannot be a counterparty anyone can pin. The fix is not to invent a
 * key store inside the federation layer — it is to REUSE the durable authority
 * identity the selfimpulse already has:
 *
 *     authorityOwnerIdentity()            (src/engine/missionAuthority.ts)
 *        ├─ native   → Tauri IPC keystore (OS credential store)
 *        ├─ encrypted→ AES-256-GCM envelope under the owner passphrase
 *        └─ session  → honestly flagged `session`, never claimed durable
 *              ↓
 *     federationIdentity()                (this module — a THIN resolver)
 *              ↓
 *     anchor + sigil                      (what a counterparty pins)
 *
 * This module mints NOTHING. It resolves the same owner keypair that signs
 * mandates and hands back an anchor that carries a PROOF OF POSSESSION —
 * because an anchor that is merely a claimed public key proves nothing about
 * who holds the private half.
 *
 * THE FACE IS KEY-DERIVED (19.6.1). Which material the mark comes from was
 * ambiguous in 19.6.0 — the module seeded it from `selfimpulse:<owner>`, so the same
 * owner with a new key kept the same face, while the docs said the mark was
 * derived from the identity. Both readings were defensible and they disagreed,
 * which is the defect. The decision, now the implementation:
 *
 *     the mark a counterparty pins is derived from the CANONICAL PUBLIC KEY.
 *
 * So key rotation produces a NEW mark, and the mark is bound to the same
 * material the proof is: `faceSeedForKey()` hashes the SPKI PEM, and the anchor
 * body carries both the PEM and the resulting fingerprint. A swapped key cannot
 * keep the old face — `verifyAnchor` re-derives the fingerprint FROM THE PEM,
 * so a mismatch is caught twice over: once by the derivation, once by the
 * self-signature that covers the fingerprint.
 *
 * Two kinds of mark exist in this product and they are labelled, not confused:
 *   • a KEY-DERIVED mark (`faceSeedForKey`) — a selfimpulse identity: the identity
 *     of record IS the key. Used by anchors, peer lists and approvals.
 *   • a SUBJECT-DERIVED mark (`sigilOf("<kind>:<id>")`) — a run-derived subject
 *     with no key of its own: a crew member, a specialist, a seat. The identity
 *     of record is its id. The UI says "identity mark" for these and never
 *     implies a key stands behind it.
 */
import { pureSha256 } from "../pureHash";
import { bytesToB64, b64ToBytes } from "../authorityCore";
import { importPublicKeyWeb, type OwnerKeyPairWeb } from "../authorityWeb";
import {
  authorityOwnerIdentity, AUTHORITY_SCHEME,
  type OwnerIdentity, type OwnerIdentityOptions,
} from "../missionAuthority";
import type { KeySecurity } from "../ownerKeyStore";
import { sigilOf, sigilSummary, sigilSvg, fingerprintOf, type Sigil, type SigilState } from "./sigil";

export const ANCHOR_FORMAT = "vh.fed.anchor.v1" as const;

/** Domain separator for a KEY-derived face seed. Never reused for subject seeds. */
export const KEY_FACE_PREFIX = "vh.fed.face.key.v1:" as const;

/**
 * The canonical form of key material for hashing: the Base64 body of the PEM,
 * with the armour and every whitespace run removed. Two encoders that produce
 * the same DER in different line lengths (a PEM from the authority layer, a PEM
 * rebuilt from a JWK the UI holds) must derive the SAME mark — otherwise the
 * face beside a peer's name would not match the face on that peer's anchor.
 */
export function canonicalKeyMaterial(publicKeyPem: string): string {
  return publicKeyPem.replace(/-----[A-Z ]+-----/g, "").replace(/\s+/g, "");
}

/**
 * The face seed for a public key. The same key always derives the same mark,
 * wherever the PEM came from and however it was wrapped.
 */
export function faceSeedForKey(publicKeyPem: string): string {
  return `${KEY_FACE_PREFIX}${canonicalKeyMaterial(publicKeyPem)}`;
}

/**
 * Re-encode a JWK as an SPKI PEM, so a key held as a JWK (the collaboration
 * peer list) derives the same mark as the same key held as a PEM (an anchor).
 * One canonical encoding, one mark — no second face for the same key.
 */
export async function publicKeyPemFromJwk(jwk: JsonWebKey): Promise<string> {
  const key = await crypto.subtle.importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, true, ["verify"]);
  const spki = new Uint8Array(await crypto.subtle.exportKey("spki", key));
  const b64 = bytesToB64(spki);
  const lines = b64.match(/.{1,64}/g) ?? [b64];
  return `-----BEGIN PUBLIC KEY-----\n${lines.join("\n")}\n-----END PUBLIC KEY-----\n`;
}

/** The mark for a key held as a JWK — the same mark as for the same key as a PEM. */
export async function faceFromJwk(jwk: JsonWebKey): Promise<Sigil> {
  return faceForKey(await publicKeyPemFromJwk(jwk));
}

/** The readable handle for a key held as a JWK. */
export async function keyHandleFromJwk(jwk: JsonWebKey): Promise<string> {
  return keyHandle(await publicKeyPemFromJwk(jwk));
}

/** The recognition mark for a public key — what a counterparty actually pins. */
export function faceForKey(publicKeyPem: string): Sigil {
  return sigilOf(faceSeedForKey(publicKeyPem));
}

/**
 * The readable handle beside a KEY-derived mark.
 *
 * ONE RULE, NO SPECIAL CASE: the handle of a mark is always the handle of the
 * mark's SEED (`fingerprintOf(faceSeedForKey(pem))`), never a second derivation
 * over the raw key. The 19.6.1 probe caught the alternative — a handle hashed
 * straight off the PEM disagreed with the handle the face itself reported, and
 * disagreed again when the same PEM was re-wrapped. Domain separation is the
 * seed prefix's job, so a key handle and a subject handle are still different
 * strings and read differently in a log.
 */
export function keyHandle(publicKeyPem: string): string {
  return fingerprintOf(faceSeedForKey(publicKeyPem));
}

export interface FederationIdentity {
  owner: string;
  keys: OwnerKeyPairWeb;
  /** How the private key is protected. `session` means NOT durable, and is said so. */
  security: KeySecurity;
  persisted: boolean;
  /** True when a sealed blob exists but the passphrase could not open it. */
  unlockFailed?: boolean;
  /** The derived face. Key-derived: it changes when the key changes. */
  sigil: Sigil;
  /** What the mark was derived from, so no caller has to guess. */
  sigilDerivedFrom: "public-key";
}

/**
 * Resolve the selfimpulse's federation identity from the SAME owner keys that sign
 * mandates. No new key material is ever generated here: if the authority layer
 * returns session keys, the federation layer says `persisted: false` and the
 * anchor it issues is marked non-durable, rather than pretending otherwise.
 */
export async function federationIdentity(opts: OwnerIdentityOptions = {}): Promise<FederationIdentity> {
  const id: OwnerIdentity = await authorityOwnerIdentity(opts);
  return {
    owner: id.owner,
    keys: id.keys,
    security: id.security,
    persisted: id.persisted,
    unlockFailed: id.unlockFailed,
    sigil: faceForKey(id.keys.publicKeyPem),
    sigilDerivedFrom: "public-key",
  };
}

export interface AnchorBody {
  v: typeof ANCHOR_FORMAT;
  owner: string;
  /** SPKI PEM — the portable verifier a counterparty pins. */
  publicKeyPem: string;
  scheme: typeof AUTHORITY_SCHEME;
  /**
   * The readable handle of the KEY-derived mark. NOT a security identifier — a
   * recognition aid — but it IS bound to the public key below, and verification
   * re-derives it rather than believing it.
   */
  fingerprint: string;
  /** Whether the key behind this anchor survives a restart. Peers may require it. */
  durable: boolean;
  /** How the key is protected, in VH's own vocabulary. */
  security: KeySecurity;
  issuedAt: number;
  /** Proof of possession: ECDSA over the canonical body, by the key itself. */
  selfSignature: string;
}

export function anchorCanonical(b: Omit<AnchorBody, "selfSignature">): string {
  return JSON.stringify({
    v: b.v, owner: b.owner, publicKeyPem: b.publicKeyPem, scheme: b.scheme,
    fingerprint: b.fingerprint, durable: b.durable, security: b.security, issuedAt: b.issuedAt,
  });
}

/**
 * Issue the anchor a counterparty keeps. The self-signature is what separates
 * "here is my public key" from "here is my public key and I hold the private
 * half" — and it commits to the fingerprint, so the face cannot be re-pointed.
 */
export async function issueAnchor(
  identity: FederationIdentity,
  opts: { issuedAt?: number } = {},
): Promise<AnchorBody> {
  const body: Omit<AnchorBody, "selfSignature"> = {
    v: ANCHOR_FORMAT,
    owner: identity.owner,
    publicKeyPem: identity.keys.publicKeyPem,
    scheme: AUTHORITY_SCHEME,
    fingerprint: identity.sigil.fingerprint,
    durable: identity.persisted && identity.security !== "session",
    security: identity.security,
    issuedAt: opts.issuedAt ?? Date.now(),
  };
  const sig = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    identity.keys.privateKey,
    new TextEncoder().encode(anchorCanonical(body)).buffer as ArrayBuffer,
  );
  return { ...body, selfSignature: `${AUTHORITY_SCHEME}:${bytesToB64(new Uint8Array(sig))}` };
}

export type AnchorVerdict =
  | { ok: true; anchor: AnchorBody; owner: string; fingerprint: string; durable: boolean }
  | { ok: false; reason: "malformed" | "wrong-scheme" | "fingerprint-mismatch" | "non-durable" | "bad-self-signature"; detail: string };

export interface AnchorVerifyOptions {
  /** Refuse an anchor whose key will not survive a restart. Defaults to false (accept, flagged). */
  requireDurable?: boolean;
}

/**
 * Verify a pinned anchor before it is trusted for anything. Three refusals
 * matter beyond a bad signature:
 *   • the fingerprint must re-derive FROM THE PUBLIC KEY in this anchor, so a
 *     face cannot be carried across to another key — rotation yields a new
 *     mark, and a swapped key cannot keep the old one;
 *   • a non-durable anchor is REFUSED when the caller requires durability, and
 *     otherwise reported as non-durable rather than silently accepted;
 *   • the scheme must be asymmetric — a symmetric tag is not portable identity.
 */
export async function verifyAnchor(anchor: AnchorBody | null | undefined, opts: AnchorVerifyOptions = {}): Promise<AnchorVerdict> {
  if (!anchor || typeof anchor !== "object") {
    return { ok: false, reason: "malformed", detail: "no anchor was presented, so there is no identity to pin" };
  }
  if (anchor.v !== ANCHOR_FORMAT) {
    return { ok: false, reason: "malformed", detail: `anchor format ${String(anchor.v)} is not ${ANCHOR_FORMAT}` };
  }
  if (anchor.scheme !== AUTHORITY_SCHEME) {
    return { ok: false, reason: "wrong-scheme", detail: `anchor scheme "${String(anchor.scheme)}" is not ${AUTHORITY_SCHEME} — refusing to pin a non-portable identity` };
  }
  if (anchor.owner.trim().length === 0) {
    return { ok: false, reason: "malformed", detail: "an anchor with no owner name cannot be held accountable" };
  }
  if (typeof anchor.publicKeyPem !== "string" || anchor.publicKeyPem.trim().length === 0) {
    return { ok: false, reason: "malformed", detail: "an anchor with no public key pins nothing" };
  }
  const expected = keyHandle(anchor.publicKeyPem);
  if (anchor.fingerprint !== expected) {
    return { ok: false, reason: "fingerprint-mismatch", detail: `this anchor carries face ${anchor.fingerprint}, and the public key inside it derives ${expected} — the mark and the key disagree, so the mark is not evidence about this key` };
  }
  if (!anchor.durable && (opts.requireDurable ?? false)) {
    return { ok: false, reason: "non-durable", detail: `this anchor's key is ${anchor.security}-scoped and will not survive a restart; a durable identity was required` };
  }
  if (!anchor.selfSignature.startsWith(`${AUTHORITY_SCHEME}:`)) {
    return { ok: false, reason: "bad-self-signature", detail: "the anchor carries no asymmetric proof of possession" };
  }
  try {
    const pub = await importPublicKeyWeb(anchor.publicKeyPem);
    const valid = await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      pub,
      b64ToBytes(anchor.selfSignature.slice(`${AUTHORITY_SCHEME}:`.length)),
      new TextEncoder().encode(anchorCanonical(anchor)).buffer as ArrayBuffer,
    );
    if (!valid) return { ok: false, reason: "bad-self-signature", detail: "the anchor's proof of possession does not verify — treating the claim as unproven" };
    return { ok: true, anchor, owner: anchor.owner, fingerprint: anchor.fingerprint, durable: anchor.durable };
  } catch {
    return { ok: false, reason: "bad-self-signature", detail: "public key or proof malformed — treating the claim as unproven" };
  }
}

/** A stable digest of the anchor, for filing beside receipts. */
export function anchorDigest(anchor: AnchorBody): string {
  return pureSha256(`vh.fed.anchor.v1:${anchorCanonical(anchor)}|${anchor.selfSignature}`);
}

/** The anchor as a face + words, for a peers list. */
export function anchorSummary(identity: FederationIdentity): string {
  return `${identity.owner} — ${sigilSummary(identity.sigil)} — ${identity.persisted ? `durable (${identity.security})` : "session-scoped, not durable"}`;
}

/** Render this identity's KEY-derived mark. Same renderer the rest of the product uses; no second path. */
export function anchorFace(identity: FederationIdentity, state: SigilState = "idle", size = 72): string {
  return sigilSvg(identity.sigil, { size, state });
}
