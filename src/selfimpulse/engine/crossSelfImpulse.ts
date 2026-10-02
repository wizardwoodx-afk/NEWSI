/**
 * crossSelfImpulse.ts — SelfImpulse 17.10.4: the Warrant ⇄ Protocol runtime join.
 *
 * WHAT THIS IS
 *   The agent OS proves its work with si-proof-receipt/2 receipts (proof.ts).
 *   The SelfImpulse Protocol (protocol/ subtree) carries trust BETWEEN
 *   machines. This module connects the two inside the live runtime:
 *
 *     receipt (proven here) → VERIFY (proof.ts rules) → anchor fact →
 *     signer-bound envelope (wire-compatible with protocol sealSecure) →
 *     portable selfimpulse on any selfimpulse
 *
 * DESIGN RULES (kept from both sides of the house)
 *   • Verification reuses verifyProofReceipt() — one set of rules, never two.
 *   • Envelopes are wire-compatible with protocol/src/core/si-crypto.js:
 *     { p, n, ts, sig } over `${p}|${n}|${ts}`, ECDSA P-256/SHA-256,
 *     WebCrypto-native r||s signatures, base64.
 *   • Identity is a SEAM, not a store: the caller injects a KV adapter
 *     (the same doctrine as the provider registry). Writes that are refused
 *     come back IN WORDS, never silently.
 *   • Runtimes without ECDSA say so in writing — nothing claims signing it
 *     cannot prove (the 11.10.1 doctrine).
 */

import { verifyProofReceipt, receiptFromJsonl, type ProofReceipt } from "./proof";
import { ENGINE_VERSION } from "../../version";

const subtle: SubtleCrypto | undefined = globalThis.crypto?.subtle;
const ECDSA = { name: "ECDSA", namedCurve: "P-256" } as const;
const ECDSA_SIGN = { name: "ECDSA", hash: "SHA-256" } as const;
export const IDENTITY_KEY = "selfimpulse.crossselfimpulse.identity.v1";
const ANCHOR_WINDOW_MS = 5 * 60_000;

/* ── storage seam ─────────────────────────────────────────────────────────── */

export interface CrossSelfImpulseStore {
  get(key: string): string | null;
  set(key: string, value: string): void;
}

export interface CrossSelfImpulseIdentity {
  fp: string;
  name: string;
  publicKey: CryptoKey;
  privateKey: CryptoKey;
  publicJwk: JsonWebKey;
}

export type CrossSelfImpulseResult<T> = { ok: true; value: T } | { ok: false; reason: string };

const enc = new TextEncoder();

function b64e(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return typeof btoa === "function" ? btoa(s) : Buffer.from(bytes).toString("base64");
}

function b64d(s: string): Uint8Array<ArrayBuffer> {
  const bin = typeof Buffer !== "undefined"
    ? String.fromCharCode(...new Uint8Array(Buffer.from(s, "base64")))
    : atob(s);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Grouped fingerprint — same shape as the protocol's device fingerprints. */
export async function fingerprintFromJwk(jwk: JsonWebKey): Promise<string> {
  if (!subtle) throw new Error("cross-selfimpulse identity requires WebCrypto");
  const stable = JSON.stringify({ crv: jwk.crv, kty: jwk.kty, x: jwk.x, y: jwk.y });
  const h = Array.from(new Uint8Array(await subtle.digest("SHA-256", enc.encode(stable))))
    .map((b) => b.toString(16).padStart(2, "0")).join("");
  return h.slice(0, 16).toUpperCase().match(/.{4}/g)!.join("-");
}

async function selfTest(privateKey: CryptoKey, publicJwk: JsonWebKey): Promise<boolean> {
  if (!subtle) return false;
  try {
    const msg = enc.encode("SI-CROSS-SELFIMPULSE-SELFTEST-v1");
    const sig = await subtle.sign(ECDSA_SIGN, privateKey, msg);
    const pub = await subtle.importKey("jwk", publicJwk, ECDSA, false, ["verify"]);
    return await subtle.verify(ECDSA_SIGN, pub, sig, msg);
  } catch {
    return false;
  }
}

/* ── identity ─────────────────────────────────────────────────────────────── */

/**
 * Load the persisted cross-selfimpulse identity, or create + persist one.
 * Every load runs the sign-then-verify self-test; a mismatched or refused
 * store comes back IN WORDS, never silently.
 */
export async function loadOrCreateCrossSelfImpulseIdentity(
  store: CrossSelfImpulseStore,
  name = "patina-agent",
): Promise<CrossSelfImpulseResult<CrossSelfImpulseIdentity>> {
  if (!subtle) return { ok: false, reason: "runtime has no WebCrypto — cannot hold a cross-selfimpulse identity" };

  let raw: string | null = null;
  try { raw = store.get(IDENTITY_KEY); } catch (e) {
    return { ok: false, reason: `identity store refused the read: ${(e as Error).message}` };
  }

  if (raw) {
    try {
      const rec = JSON.parse(raw) as { publicJwk: JsonWebKey; privateJwk: JsonWebKey };
      const privateKey = await subtle.importKey("jwk", rec.privateJwk, ECDSA, true, ["sign"]);
      if (!(await selfTest(privateKey, rec.publicJwk)))
        return { ok: false, reason: "cross-selfimpulse identity keypair mismatch: stored public key does not match private key" };
      return { ok: true, value: { fp: await fingerprintFromJwk(rec.publicJwk), name, publicKey: await subtle.importKey("jwk", rec.publicJwk, ECDSA, false, ["verify"]), privateKey, publicJwk: rec.publicJwk } };
    } catch (e) {
      return { ok: false, reason: `cross-selfimpulse identity unreadable: ${(e as Error).message}` };
    }
  }

  const kp = await subtle.generateKey(ECDSA, true, ["sign", "verify"]);
  const publicJwk = await subtle.exportKey("jwk", kp.publicKey);
  const privateJwk = await subtle.exportKey("jwk", kp.privateKey);
  if (!(await selfTest(kp.privateKey, publicJwk)))
    return { ok: false, reason: "freshly generated cross-selfimpulse identity failed self-test" };
  try {
    store.set(IDENTITY_KEY, JSON.stringify({ v: 1, publicJwk, privateJwk, createdAt: new Date().toISOString() }));
  } catch (e) {
    return { ok: false, reason: `identity store refused the write: ${(e as Error).message}` };
  }
  return { ok: true, value: { fp: await fingerprintFromJwk(publicJwk), name, publicKey: kp.publicKey, privateKey: kp.privateKey, publicJwk } };
}

/* ── receipt → anchor fact ────────────────────────────────────────────────── */

async function sha256HexLatin1(publicKeyHex: string): Promise<string> {
  const raw = publicKeyHex.match(/../g)!.map((h) => parseInt(h, 16));
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw[i];
  const h = Array.from(new Uint8Array(await subtle!.digest("SHA-256", bytes)))
    .map((b) => b.toString(16).padStart(2, "0")).join("");
  return h.slice(0, 16);
}

/** Canonical, policy-safe evidence string (mirrors protocol bridge charset). */
export function anchorEvidence(rc: ProofReceipt, head: string, issuerFp: string | null): string {
  const issuer = rc.signature && issuerFp ? `issuer:${issuerFp}` : "issuer:unsigned";
  return `receipt:${rc.format}:head:${head}:events:${rc.events.length}:seal:ok:${issuer}`;
}

export interface AnchorResult {
  env: { p: string; n: string; ts: number; sig: string };
  fact: Record<string, unknown>;
  head: string;
  events: number;
  evidence: string;
  protocolVersion: string;
}

/**
 * Verify a receipt (proof.ts rules — the ONLY rulebook) and, if it holds,
 * issue the signer-bound anchor envelope. Refusals come back in words.
 */
export async function anchorReceipt(
  rc: ProofReceipt,
  identity: CrossSelfImpulseIdentity,
  purpose = "cross-org-proof-anchoring",
): Promise<CrossSelfImpulseResult<AnchorResult>> {
  if (!subtle) return { ok: false, reason: "runtime has no WebCrypto — cannot anchor" };

  const verdict = await verifyProofReceipt(rc);
  if (!verdict.ok) return { ok: false, reason: `receipt:${verdict.reason}` };
  if (rc.events.length === 0) return { ok: false, reason: "receipt:empty chain" };

  const head = rc.events[rc.events.length - 1].hash;
  const issuerFp = rc.signature && rc.issuer?.publicKeyHex
    ? await sha256HexLatin1(rc.issuer.publicKeyHex) : null;
  const evidence = anchorEvidence(rc, head, issuerFp);

  const fact: Record<string, unknown> = {
    v: 2, kind: "agent_action",
    agent: { n: identity.name.slice(0, 60), fp: identity.fp },
    action: "anchor_receipt",
    tool: "si-cross-selfimpulse",
    purpose: purpose.slice(0, 200),
    policy: null,
    evidence: evidence.slice(0, 2000),
    result: "success",
    ts: Date.now(),
  };

  const p = JSON.stringify(fact);
  if (!globalThis.crypto?.getRandomValues) return { ok: false, reason: "runtime has no CSPRNG" };
  const n = Array.from(new Uint8Array(globalThis.crypto.getRandomValues(new Uint8Array(16))))
    .map((b) => b.toString(16).padStart(2, "0")).join("");
  const ts = Date.now();
  const sig = b64e(await subtle.sign(ECDSA_SIGN, identity.privateKey, enc.encode(`${p}|${n}|${ts}`)));

  return { ok: true, value: { env: { p, n, ts, sig }, fact, head, events: rc.events.length, evidence, protocolVersion: ENGINE_VERSION } };
}

/** JSONL convenience — the shape the Register view already exports. */
export async function anchorReceiptJsonl(
  jsonl: string,
  identity: CrossSelfImpulseIdentity,
  purpose?: string,
): Promise<CrossSelfImpulseResult<AnchorResult>> {
  const rc = receiptFromJsonl(jsonl);
  if (!rc) return { ok: false, reason: "receipt:unparseable JSONL" };
  return anchorReceipt(rc, identity, purpose);
}

/* ── envelope verification (protocol-openSecure-compatible) ───────────────── */

export interface ReplayLedger {
  /** Returns true if this nonce was already verified at this selfimpulse. */
  has(nonce: string): boolean;
  /** Records a freshly verified nonce. Implementations MUST bound storage. */
  add(nonce: string): void;
}

/** Bounded in-memory replay ledger — last `limit` nonces, no growth beyond it. */
export function memoryReplayLedger(limit = 4096): ReplayLedger {
  const seen = new Set<string>();
  const order: string[] = [];
  return {
    has: (n) => seen.has(n),
    add: (n) => {
      if (seen.has(n)) return;
      seen.add(n); order.push(n);
      while (order.length > limit) seen.delete(order.shift()!);
    },
  };
}

export async function verifyAnchorEnvelope(
  env: { p: string; n: string; ts: number; sig: string },
  signerPublicJwk: JsonWebKey,
  opts: { now?: number; replay?: ReplayLedger } = {},
): Promise<{ ok: boolean; reason?: string; fact?: Record<string, unknown> }> {
  const now = opts.now ?? Date.now();
  if (!subtle) return { ok: false, reason: "runtime has no WebCrypto" };
  if (!env || typeof env.p !== "string" || typeof env.n !== "string" || typeof env.ts !== "number")
    return { ok: false, reason: "malformed-envelope" };
  if (env.n.length < 16 || env.n.length > 64) return { ok: false, reason: "invalid-nonce-length" };
  if (Math.abs(now - env.ts) > ANCHOR_WINDOW_MS) return { ok: false, reason: "stale-envelope" };
  if (opts.replay?.has(env.n)) return { ok: false, reason: "replayed-envelope" };
  let verified = false;
  try {
    const key = await subtle.importKey("jwk", signerPublicJwk, ECDSA, false, ["verify"]);
    verified = await subtle.verify(ECDSA_SIGN, key, b64d(env.sig), enc.encode(`${env.p}|${env.n}|${env.ts}`));
  } catch { verified = false; }
  if (!verified) return { ok: false, reason: "bad-signature" };
  let fact: Record<string, unknown>;
  try { fact = JSON.parse(env.p) as Record<string, unknown>; }
  catch { return { ok: false, reason: "unparseable-payload" }; }
  if (fact.kind !== "agent_action" || fact.action !== "anchor_receipt")
    return { ok: false, reason: "not-an-anchor-fact" };
  // an envelope is one-time evidence at this selfimpulse — record AFTER full success
  opts.replay?.add(env.n);
  return { ok: true, fact };
}
