/**
 * SelfImpulse — the OAuth PKCE seam (identity + model access, kept apart).
 *
 * Two independent facts travel through OAuth and this product refuses to
 * blur them:
 *
 *   IDENTITY     — who is signed in (a Google account, a ChatGPT account).
 *                  A successful consent screen proves a session, nothing else.
 *   MODEL ACCESS — a separate credential that actually bills API calls
 *                  (a Gemini API key / Google Cloud OAuth token, or an
 *                  OpenAI API key with API billing attached).
 *
 * A consumer subscription (Google One AI Pro / Gemini Advanced, ChatGPT
 * Plus/Go) is a WEB product entitlement. It does not mint an API credential,
 * does not bill the Gemini Developer API or the OpenAI API, and its
 * conversation history is not reachable through either API. Nothing in this
 * directory may imply otherwise — `authStatus.ts` derives `canExecute` from
 * the credential alone, never from the subscription.
 *
 * What lives here is the pure crypto that makes the Google authorization-code
 * flow safe to run from a desktop/native client:
 *
 *   • code_verifier  — 32 CSPRNG bytes, base64url ⇒ 43 chars (RFC 7636 §4.1
 *                      requires 43–128 chars of the unreserved set);
 *   • code_challenge — BASE64URL(SHA-256(ASCII(verifier))) with
 *                      `code_challenge_method=S256` — the S256 form only;
 *                      `plain` is deliberately NOT offered, because a
 *                      downgrade is exactly what PKCE exists to stop;
 *   • state          — an independent 16-byte CSPRNG value, stored across the
 *                      consent redirect and compared in constant time. This
 *                      is the CSRF half of the flow and is not optional;
 *   • `randomBytes`  — refuses to run without `crypto.getRandomValues`. There
 *                      is no `Math.random` fallback anywhere in this file,
 *                      because a guessable verifier or state turns PKCE and
 *                      CSRF into decoration.
 */
import type { ProviderConfig } from "../engine/types";

const TE = new TextEncoder();

/** RFC 4648 §5 base64url, no padding — the alphabet RFC 7636 mandates. */
const B64URL = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

/** RFC 7636 §4.1: the verifier is 43–128 characters. */
export const CODE_VERIFIER_MIN = 43;
export const CODE_VERIFIER_MAX = 128;

/** The only challenge method this seam will ever emit. */
export const CODE_CHALLENGE_METHOD = "S256" as const;


function requireCrypto(): Crypto {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (!c || typeof c.getRandomValues !== "function") {
    throw new Error(
      "this runtime has no Web Crypto (crypto.getRandomValues) — the OAuth seam refuses rather than fall back to a weak PRNG",
    );
  }
  return c;
}

function requireSubtle(): SubtleCrypto {
  const s = (globalThis as { crypto?: Crypto }).crypto?.subtle;
  if (!s || typeof s.digest !== "function") {
    throw new Error("this runtime has no SubtleCrypto — PKCE S256 cannot be computed and the sign-in is refused");
  }
  return s;
}

/** base64url, unpadded. Hand-rolled so it is identical in Node and the webview. */
export function base64UrlEncode(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < bytes.length ? bytes[i + 1] : undefined;
    const b2 = i + 2 < bytes.length ? bytes[i + 2] : undefined;
    out += B64URL[b0 >> 2];
    out += B64URL[((b0 & 3) << 4) | ((b1 ?? 0) >> 4)];
    if (b1 === undefined) break;
    out += B64URL[((b1 & 15) << 2) | ((b2 ?? 0) >> 6)];
    if (b2 === undefined) break;
    out += B64URL[b2 & 63];
  }
  return out;
}

/**
 * CSPRNG bytes, and nothing else. Length is bounded so a caller cannot ask
 * for a megabyte of randomness by accident.
 */
export function randomBytes(length: number): Uint8Array {
  if (!Number.isInteger(length) || length < 16 || length > 64) {
    throw new Error("random byte length must be an integer between 16 and 64");
  }
  const out = new Uint8Array(length);
  requireCrypto().getRandomValues(out);
  return out;
}

/** A fresh RFC 7636 code_verifier: 32 bytes ⇒ 43 base64url chars. */
export function createCodeVerifier(byteLength = 32): string {
  const verifier = base64UrlEncode(randomBytes(byteLength));
  if (!isValidCodeVerifier(verifier)) {
    throw new Error("generated code_verifier failed the RFC 7636 shape check — refusing to start a flow that cannot be verified");
  }
  return verifier;
}

/** RFC 7636 §4.1 shape: 43–128 chars from ALPHA / DIGIT / "-" / "." / "_" / "~". */
export function isValidCodeVerifier(verifier: string): boolean {
  return (
    typeof verifier === "string" &&
    verifier.length >= CODE_VERIFIER_MIN &&
    verifier.length <= CODE_VERIFIER_MAX &&
    /^[A-Za-z0-9\-._~]+$/.test(verifier)
  );
}

/** BASE64URL(SHA-256(ASCII(code_verifier))) — RFC 7636 §4.2. */
export async function computeCodeChallenge(verifier: string, subtleImpl?: SubtleCrypto): Promise<string> {
  if (!isValidCodeVerifier(verifier)) {
    throw new Error("code_verifier is not a valid RFC 7636 verifier — no challenge was computed");
  }
  const subtleCrypto = subtleImpl ?? requireSubtle();
  const digest = await subtleCrypto.digest("SHA-256", TE.encode(verifier) as BufferSource);
  return base64UrlEncode(new Uint8Array(digest));
}

/** Verifier + S256 challenge, minted together for one authorization request. */
export interface PkcePair {
  verifier: string;
  challenge: string;
  method: typeof CODE_CHALLENGE_METHOD;
}

export async function createPkcePair(byteLength = 32): Promise<PkcePair> {
  const verifier = createCodeVerifier(byteLength);
  return { verifier, challenge: await computeCodeChallenge(verifier), method: CODE_CHALLENGE_METHOD };
}

/**
 * The CSRF half: 16 CSPRNG bytes → 22 base64url chars. Independent of the
 * verifier on purpose — reusing one value for both would let a leaked
 * challenge stand in for a leaked state.
 */
export function createState(byteLength = 16): string {
  return base64UrlEncode(randomBytes(byteLength));
}

/**
 * Length-independent, early-exit-free string comparison. `charCodeAt` past the
 * end yields NaN, and `NaN | 0 === 0`, so a length mismatch still walks the
 * whole loop and only shows up in the final accumulator.
 */
export function constantTimeEqual(a: string, b: string): boolean {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const len = a.length > b.length ? a.length : b.length;
  let diff = a.length ^ b.length;
  for (let i = 0; i < len; i++) {
    diff |= (a.charCodeAt(i) | 0) ^ (b.charCodeAt(i) | 0);
  }
  return diff === 0;
}

/** The CSRF check. An absent value is a mismatch, never a pass. */
export function stateMatches(expected: string, received: string | null | undefined): boolean {
  if (!expected || !received) return false;
  return constantTimeEqual(expected, received);
}

/**
 * The app's provider config from the environment, read the same way the engine
 * reads it. A convenience for the sign-in screen only — it never implies a key
 * exists, and a consumer subscription is still not a key.
 */
export function providerFromEnvironment(): ProviderConfig | null {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
  const candidates: Array<{ cfg: ProviderConfig; vars: string[] }> = [
    { cfg: { kind: "openai-compatible", baseUrl: "https://api.openai.com/v1", apiKey: "", model: "gpt-4.1" }, vars: ["OPENAI_API_KEY", "HANDLE_OPENAI_API_KEY"] },
    { cfg: { kind: "anthropic", baseUrl: "https://api.anthropic.com", apiKey: "", model: "claude-sonnet-4-20250514" }, vars: ["ANTHROPIC_API_KEY", "HANDLE_ANTHROPIC_API_KEY"] },
    { cfg: { kind: "gemini", baseUrl: "https://generativelanguage.googleapis.com/v1", apiKey: "", model: "gemini-2.5-flash" }, vars: ["GEMINI_API_KEY", "GOOGLE_GENERATIVE_AI_API_KEY", "HANDLE_GEMINI_API_KEY"] },
  ];
  for (const c of candidates) {
    const key = c.vars.map((v) => env[v]).find((v) => typeof v === "string" && v.trim().length > 0);
    if (!key) continue;
    return { ...c.cfg, apiKey: key.trim() };
  }
  return null;
}

