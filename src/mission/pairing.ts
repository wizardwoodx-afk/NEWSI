/**
 * PEER PAIRING — how a trusted machine gets a credential, without ever seeing
 * this machine's token.
 *
 * The problem this solves is real and was left open by a decision that was
 * itself correct. The A2A host mints a bearer token and enforces it on every
 * request. The desktop supervisor deliberately never returns that token to the
 * frontend, because a long-lived shared secret displayed in a UI is a secret
 * that ends up in screenshots, clipboard histories and shoulder-surfing. That
 * decision is right. It also meant there was no way at all to let a peer in:
 * the credential existed, and no honest route to it existed. Remote federation
 * was therefore impossible, and the screen claiming otherwise was overstating
 * the product.
 *
 * The answer is not "show the token". It is the shape every serious local
 * network product converged on: a one-time invitation that the operator reads
 * out, that the peer redeems once, and that mints a credential scoped to that
 * peer. The code the operator sees is a CAPABILITY TO OBTAIN a credential, not
 * a credential, and it is destroyed by being used, by expiring, or by too many
 * wrong guesses.
 *
 * The properties this file holds, and why each one is load-bearing:
 *
 *   1. SINGLE USE. An invitation is spent the moment it is redeemed. A code that
 *      leaked from a screen would be worth exactly one delegation round-trip.
 *   2. SHORT. An invitation expires in minutes, not hours. It is only needed
 *      while a human is standing in front of both machines.
 *   3. NOT THE TOKEN. The peer credential is fresh randomness, unrelated to the
 *      host token. Rotating the host token does not silently invalidate peers,
 *      and a peer token cannot be escalated into the host token.
 *   4. BOUND TO AN IDENTITY. A redeemed invitation records WHICH peer took it.
 *      "Somebody on the network used the code" is not an answer an auditor can
 *      accept, and this product does not ask people to accept one.
 *   5. BRUTE FORCE IS EXPENSIVE. A small alphabet read out loud is guessable in
 *      principle, so wrong attempts are counted and a handful destroys the
 *      invitation. A code that survives five wrong guesses is a code that can be
 *      guessed.
 *   6. NO SILENT DEFAULTS. A host with no invitation answers "not pairing" rather
 *      than minting one, and a redeem that cannot be checked says why.
 */

/** Characters an operator can read aloud or type without ambiguity. */
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no 0/O/1/I/L
const CODE_LEN = 8;
const DEFAULT_TTL_SECS = 300;
const MAX_TTL_SECS = 900;
const MAX_ATTEMPTS = 5;

export type InvitationState = "open" | "redeemed" | "expired" | "destroyed";

export interface Invitation {
  id: string;
  /** The identity fingerprint of the selfimpulse issuing the invitation. */
  hostFp: string;
  selfimpulse: string;
  /** Never the code: a salted digest of it, so a memory dump is not a code list. */
  codeHash: string;
  issuedAt: number;
  expiresAt: number;
  attempts: number;
  maxAttempts: number;
  state: InvitationState;
  /** Who redeemed it. Set once, and never changed. */
  redeemedBy: { fp: string; name: string; at: number } | null;
}

/** What a peer receives. Scoped, expiring, and not the host's own token. */
export interface PeerCredential {
  token: string;
  selfimpulse: string;
  hostFp: string;
  peerFp: string;
  issuedAt: number;
  expiresAt: number;
  /** What this credential may ask the host to do, stated up front. */
  scope: string[];
}

export interface MintedInvitation {
  invitation: Invitation;
  /** Shown to the operator ONCE. This is not stored on the invitation. */
  code: string;
}

const enc = new TextEncoder();

function randomBytes(n: number): Uint8Array {
  const b = new Uint8Array(n);
  crypto.getRandomValues(b);
  return b;
}

function randomId(prefix: string): string {
  return `${prefix}-${[...randomBytes(9)].map((b) => b.toString(16).padStart(2, "0")).join("")}`;
}

function b64url(b: Uint8Array): string {
  let s = "";
  for (const byte of b) s += String.fromCharCode(byte);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sha256hex(s: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", enc.encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * A per-process pepper. The stored digest is useless without it, so a leaked
 * invitation record cannot be brute-forced offline against a code space.
 */
let PEPPER: string | null = null;
function pepper(): string {
  if (PEPPER === null) PEPPER = b64url(randomBytes(32));
  return PEPPER;
}

async function hashCode(code: string): Promise<string> {
  return sha256hex(`${pepper()}:${code.trim().toUpperCase()}`);
}

function mintCode(): string {
  const bytes = randomBytes(CODE_LEN);
  let out = "";
  for (let i = 0; i < CODE_LEN; i += 1) out += ALPHABET[bytes[i] % ALPHABET.length];
  return `${out.slice(0, 4)}-${out.slice(4)}`;
}

/** Length-safe, value-safe comparison. A code is not a secret with a long tail of entropy. */
function constantTimeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function createInvitation(args: {
  hostFp: string;
  selfimpulse: string;
  ttlSecs?: number;
  id?: string;
}): Promise<MintedInvitation> {
  const ttl = Math.max(30, Math.min(MAX_TTL_SECS, args.ttlSecs ?? DEFAULT_TTL_SECS));
  const now = Date.now();
  const code = mintCode();
  const invitation: Invitation = {
    id: args.id ?? randomId("pair"),
    hostFp: args.hostFp,
    selfimpulse: args.selfimpulse,
    codeHash: await hashCode(code),
    issuedAt: now,
    expiresAt: now + ttl * 1000,
    attempts: 0,
    maxAttempts: MAX_ATTEMPTS,
    state: "open",
    redeemedBy: null,
  };
  return { invitation, code };
}

/** Expire-by-time, without mutating: a view is still an expired view. */
function stateAt(inv: Invitation, now: number): InvitationState {
  if (inv.state === "open" && now >= inv.expiresAt) return "expired";
  return inv.state;
}

export type RedeemResult =
  | { ok: true; credential: PeerCredential; invitation: Invitation }
  | { ok: false; reason: string; invitation: Invitation };

/**
 * Redeem an invitation for a named peer.
 *
 * Every failure is counted against the invitation, and exhausting the attempts
 * destroys it. That is deliberate: a code read aloud over a room is a code
 * somebody might try to guess from the doorway, and the answer to that is not a
 * longer code but a code that stops existing.
 */
export async function redeemInvitation(args: {
  invitation: Invitation;
  code: string;
  peer: { fp: string; name: string };
  now?: number;
  credentialTtlSecs?: number;
}): Promise<RedeemResult> {
  const now = args.now ?? Date.now();
  const inv = { ...args.invitation };

  const current = stateAt(inv, now);
  if (current !== "open") {
    return {
      ok: false,
      invitation: inv,
      reason:
        current === "redeemed"
          ? "this invitation was already used — pair a fresh one"
          : current === "expired"
            ? "this invitation has expired; pair a new one"
            : "this invitation was destroyed after too many wrong codes",
    };
  }

  const presented = await hashCode(args.code);
  if (!constantTimeEquals(presented, inv.codeHash)) {
    inv.attempts += 1;
    if (inv.attempts >= inv.maxAttempts) {
      inv.state = "destroyed";
      return { ok: false, invitation: inv, reason: "that code was wrong too many times, so this invitation is void" };
    }
    return {
      ok: false,
      invitation: inv,
      reason: `that code does not match (${inv.maxAttempts - inv.attempts} attempt(s) left before this invitation is void)`,
    };
  }

  const ttl = Math.max(60, Math.min(MAX_TTL_SECS * 4, args.credentialTtlSecs ?? DEFAULT_TTL_SECS * 4));
  inv.state = "redeemed";
  inv.redeemedBy = { fp: args.peer.fp, name: args.peer.name, at: now };
  return {
    ok: true,
    invitation: inv,
    credential: {
      token: `vhp_${b64url(randomBytes(32))}`,
      selfimpulse: inv.selfimpulse,
      hostFp: inv.hostFp,
      peerFp: args.peer.fp,
      issuedAt: now,
      expiresAt: now + ttl * 1000,
      // Stated, not implied: what a paired peer may ask for. The host still
      // runs every inbound delegation through its gates, so this is a ceiling
      // an operator can read, not the authority itself.
      scope: ["discover:card", "delegate", "files:send", "files:receive"],
    },
  };
}

/** Is a peer credential still inside its window? Compared in the host's words. */
export function credentialStatus(cred: PeerCredential, now = Date.now()): { valid: boolean; reason: string } {
  if (now >= cred.expiresAt) return { valid: false, reason: "this pairing credential has expired; pair again" };
  if (!cred.token.startsWith("vhp_")) return { valid: false, reason: "this is not a pairing credential" };
  return { valid: true, reason: "valid" };
}

/** A safe description for a UI or a log. The secret is never in it. */
export function describeInvitation(inv: Invitation, now = Date.now()): string {
  const state = stateAt(inv, now);
  if (state === "redeemed") return `used by ${inv.redeemedBy?.name ?? "a peer"}`;
  if (state === "expired") return "expired";
  if (state === "destroyed") return "void after too many wrong codes";
  const left = Math.max(0, Math.ceil((inv.expiresAt - now) / 1000));
  return `waiting for a peer — ${left}s left, ${inv.maxAttempts - inv.attempts} attempt(s) left`;
}
