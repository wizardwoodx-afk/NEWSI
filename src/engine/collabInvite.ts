/**
 * SelfImpulse — signed collaboration invitations, HARDENED (18.3.0).
 *
 * The 18.2.0 flow, with the external review's two holes closed:
 *
 *   • keys are minted and unlocked through `secureKeys` — AES-GCM encrypted
 *     at rest under the user's passphrase, session-only in memory, legacy
 *     plaintext blobs purged. localStorage never holds a private key;
 *   • `verifyApproval` resolves the expected approver's key from the BOUND
 *     registry (`collabRegistry`), not from the approval itself. A fresh
 *     attacker key wearing a member's name refuses; an UNBOUND member
 *     refuses. Binding happens by explicit human act — accepting an
 *     invitation binds the issuer; manual bind covers the rest.
 *
 * What stays honest: first contact is still trust-on-first-use and says so
 * (`trustModel: "tofu"`, `source` recorded on every binding). Structural
 * binding via the A2A JWS identity is the documented upgrade path.
 */
import { identityUnlocked, signWithIdentity, storedPublicJwk } from "./secureKeys";
import { bindPeerIdentity, requireBoundKey } from "./collabRegistry";

export interface InvitationPayload {
  v: "engine-invite/1";
  id: string;
  from: string;
  to: string;
  scope: string;
  riskCeiling: "safe" | "risky" | "critical";
  durationH: number;
  capabilities: string[];
  message?: string;
  createdAt: string;
  issuerPublicJwk: JsonWebKey;
  /** TOFU flag — the key travels with the invite until a human binds it. */
  trustModel: "tofu";
}

export interface SignedInvitation {
  payload: InvitationPayload;
  signatureB64: string;
  digest: string;
}

export interface SignedApproval {
  inviteDigest: string;
  approver: string;
  approved: boolean;
  at: string;
  publicJwk: JsonWebKey;
  signatureB64: string;
}

/* ── encoding helpers ─────────────────────────────────────────────────────── */

const enc = new TextEncoder();

function b64url(bytes: ArrayBuffer | Uint8Array): string {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = "";
  for (const b of u8) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(s: string): Uint8Array {
  const pad = s.replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(pad + "=".repeat((4 - (pad.length % 4)) % 4));
  const u8 = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) u8[i] = raw.charCodeAt(i);
  return u8;
}

export async function sha256Hex(text: string): Promise<string> {
  const buf = await globalThis.crypto.subtle.digest("SHA-256", enc.encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function canonical(obj: unknown): string {
  return JSON.stringify(obj, Object.keys(obj as object).sort());
}

async function importPublic(jwk: JsonWebKey): Promise<CryptoKey> {
  return globalThis.crypto.subtle.importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
}

export const SIGN_PARAMS: EcKeyImportParams & EcdsaParams = { name: "ECDSA", namedCurve: "P-256", hash: "SHA-256" };

/* ── invitations ──────────────────────────────────────────────────────────── */

export interface InviteArgs {
  from: string;
  to: string;
  scope: string;
  riskCeiling: "safe" | "risky" | "critical";
  durationH: number;
  capabilities: string[];
  message?: string;
  now?: () => Date;
}

/**
 * Mint a signed invitation. The issuer's identity must be UNLOCKED
 * (passphrase) — a locked identity refuses before any bytes are produced.
 */
export async function createInvitation(args: InviteArgs): Promise<SignedInvitation | { ok: false; error: string }> {
  const pub = storedPublicJwk(args.from);
  if (!pub) return { ok: false, error: `no identity for "${args.from}" — create one with a passphrase first` };
  if (!identityUnlocked(args.from)) return { ok: false, error: `identity "${args.from}" is locked — unlock it to sign` };
  const payload: InvitationPayload = {
    v: "engine-invite/1",
    id: `inv-${(args.now ?? (() => new Date()))().getTime().toString(36)}`,
    from: args.from,
    to: args.to,
    scope: args.scope,
    riskCeiling: args.riskCeiling,
    durationH: args.durationH,
    capabilities: args.capabilities,
    message: args.message,
    createdAt: (args.now ?? (() => new Date()))().toISOString(),
    issuerPublicJwk: pub,
    trustModel: "tofu",
  };
  const canon = canonical(payload);
  const signatureB64 = await signWithIdentity(args.from, enc.encode(canon));
  return { payload, signatureB64, digest: await sha256Hex(canon + "." + signatureB64) };
}

export type ParseResult =
  | { ok: true; invite: SignedInvitation; issuerVerified: true }
  | { ok: false; error: string };

export async function parseInvitation(token: string): Promise<ParseResult> {
  let obj: { payload?: InvitationPayload; signatureB64?: string; digest?: string };
  try {
    obj = JSON.parse(new TextDecoder().decode(fromB64url(token.trim())));
  } catch {
    return { ok: false, error: "not a parseable invitation token" };
  }
  if (!obj.payload || obj.payload.v !== "engine-invite/1" || !obj.signatureB64) {
    return { ok: false, error: "token is not a engine-invite/1 payload" };
  }
  const canon = canonical(obj.payload);
  let verified: boolean;
  try {
    const key = await importPublic(obj.payload.issuerPublicJwk);
    verified = await globalThis.crypto.subtle.verify(SIGN_PARAMS, key, fromB64url(obj.signatureB64) as Uint8Array<ArrayBuffer>, enc.encode(canon) as Uint8Array<ArrayBuffer>);
  } catch {
    verified = false;
  }
  if (!verified) return { ok: false, error: "signature does not verify against the issuer key — the invite was tampered with or is not from its claimed issuer" };
  const digest = await sha256Hex(canon + "." + obj.signatureB64);
  if (obj.digest && obj.digest !== digest) return { ok: false, error: "invite digest mismatch" };
  return { ok: true, invite: { payload: obj.payload, signatureB64: obj.signatureB64, digest }, issuerVerified: true };
}

export function serializeInvitation(inv: SignedInvitation): string {
  return b64url(enc.encode(JSON.stringify(inv)));
}

/* ── approvals: signed by the approver's unlocked session key ─────────────── */

export async function signApproval(inviteDigest: string, approver: string, approved: boolean, now: () => Date = () => new Date()): Promise<SignedApproval | { ok: false; error: string }> {
  const pub = storedPublicJwk(approver);
  if (!pub) return { ok: false, error: `no identity for "${approver}"` };
  if (!identityUnlocked(approver)) return { ok: false, error: `identity "${approver}" is locked — unlock it to sign consent` };
  const body = { inviteDigest, approver, approved, at: now().toISOString() };
  const signatureB64 = await signWithIdentity(approver, enc.encode(canonical(body)));
  return { ...body, publicJwk: pub, signatureB64 };
}

/**
 * Accept (or reject) an invitation AND bind the issuer's key in the same
 * human act — the key that just signed a verified invite becomes the bound
 * identity for its `from` member, source "invite-acceptance".
 */
export async function acceptInvitation(invite: SignedInvitation, approver: string, approved: boolean): Promise<{ approval: SignedApproval; bound: string } | { ok: false; error: string }> {
  const approval = await signApproval(invite.digest, approver, approved);
  if ("ok" in approval && approval.ok === false) return approval;
  if (approved) {
    bindPeerIdentity(invite.payload.from, invite.payload.issuerPublicJwk, "invite-acceptance");
  }
  return { approval: approval as SignedApproval, bound: approved ? invite.payload.from : "(rejected — issuer not bound)" };
}

export type VerifyApprovalResult = { ok: true } | { ok: false; error: string };

/**
 * Verification now resolves the approver's key from the BOUND registry.
 * The key presented inside the approval must deep-equal it; an unbound
 * member, a mismatched key, or a bad signature all refuse in words.
 */
export async function verifyApproval(a: SignedApproval, expectedApprover: string): Promise<VerifyApprovalResult> {
  if (a.approver !== expectedApprover) return { ok: false, error: `approval claims "${a.approver}" but the team expects "${expectedApprover}"` };
  const binding = requireBoundKey(expectedApprover, a.publicJwk);
  if (!binding.ok) return { ok: false, error: binding.error };
  const body = { inviteDigest: a.inviteDigest, approver: a.approver, approved: a.approved, at: a.at };
  try {
    const key = await importPublic(binding.bound.publicJwk);
    const ok = await globalThis.crypto.subtle.verify(SIGN_PARAMS, key, fromB64url(a.signatureB64) as Uint8Array<ArrayBuffer>, enc.encode(canonical(body)) as Uint8Array<ArrayBuffer>);
    return ok ? { ok: true } : { ok: false, error: `approval signature for "${a.approver}" does not verify against the bound identity` };
  } catch {
    return { ok: false, error: `approval signature for "${a.approver}" is not verifiable` };
  }
}

export { ensureIdentity, forgetIdentity, identityUnlocked, storedPublicJwk, jwkFingerprint } from "./secureKeys";
export { allKnownIdentities, bindPeerIdentity, boundIdentityFor, listBoundPeers, structuralIdentityFor, unbindPeer, clearRegistry, type KnownIdentityRow } from "./collabRegistry";
