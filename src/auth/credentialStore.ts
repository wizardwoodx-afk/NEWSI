/**
 * SelfImpulse — where credentials actually REST.
 *
 * Every secret this directory handles — Google access/refresh tokens, the
 * OAuth client secret, the OpenAI API key, the Gemini API key — goes through
 * the EXISTING owner vault (`engine/vault.ts`: PBKDF2-SHA-256 at 310k
 * iterations → AES-256-GCM). That module is read here, never modified.
 *
 * The house rule this file exists to enforce: NO CREDENTIAL EVER REACHES
 * PLAINTEXT `localStorage`. The vault is the only writer. When the vault is
 * locked, the honest outcome is that the credential lives in MODULE MEMORY for
 * this session and is lost on quit — never a quiet downgrade to a plaintext
 * write. `put()` returns which of those two happened, so the screen can SAY it.
 */
import { vaultSeal, vaultDecrypt, vaultStatus, vaultRemove } from "../engine/vault";
import type { GoogleTokenSet, GoogleIdentity, GoogleOAuthClient } from "./googleOAuth";
import { isAccessTokenUsable } from "./googleOAuth";

const GOOGLE_TOKENS_STORE = "vh.auth.google.tokens.v1";
const GOOGLE_CLIENT_STORE = "vh.auth.google.client.v1";
const GOOGLE_IDENTITY_STORE = "vh.auth.google.identity.v1";
const OPENAI_KEY_STORE = "vh.auth.openai.key.v1";
const GEMINI_KEY_STORE = "vh.auth.gemini.key.v1";

export type Rest = "vault" | "memory-only";

/**
 * The in-memory fallback for a locked vault. Deliberately a module variable and
 * NOT `sessionStorage`/`localStorage` — a locked vault means "this session
 * only", and that is the whole of the promise.
 */
const memoryOnly = new Map<string, string>();

export interface StoredSecret<T> {
  ok: boolean;
  value: T | null;
  /** where it ended up — the UI must state this honestly. */
  rest: Rest;
  message: string;
}

/**
 * Seal a secret. With an unlocked vault it becomes an encrypted envelope; with a
 * locked vault it stays in memory and says so. There is no third branch that
 * writes plaintext.
 */
async function put<T>(name: string, value: T): Promise<{ ok: boolean; rest: Rest; message: string }> {
  const text = JSON.stringify(value);
  const sealed = await vaultSeal(name, text);
  if (sealed.ok) {
    memoryOnly.delete(name);
    return { ok: true, rest: "vault", message: "sealed in your encrypted vault (AES-256-GCM) — it is never written in plaintext" };
  }
  memoryOnly.set(name, text);
  return {
    ok: true,
    rest: "memory-only",
    message: "the vault is locked, so this lives in memory for this session only and is forgotten when you close the app",
  };
}

/** Unseal, else report honestly — "locked" is never reported as "empty". */
async function take<T>(name: string): Promise<StoredSecret<T>> {
  const opened = await vaultDecrypt(name);
  if (opened.found && !opened.locked) {
    try {
      return { ok: true, value: JSON.parse(opened.text) as T, rest: "vault", message: "unsealed from your encrypted vault" };
    } catch {
      return { ok: false, value: null, rest: "vault", message: "the sealed record was unreadable — sign in again" };
    }
  }
  if (opened.found && opened.locked) {
    return { ok: false, value: null, rest: "vault", message: "a sealed credential is in your vault — unlock it in Settings to use it" };
  }
  const mem = memoryOnly.get(name);
  if (mem !== undefined) {
    try {
      return { ok: true, value: JSON.parse(mem) as T, rest: "memory-only", message: "from memory — this session only" };
    } catch {
      return { ok: false, value: null, rest: "memory-only", message: "the session record was unreadable — sign in again" };
    }
  }
  return { ok: false, value: null, rest: "memory-only", message: "nothing stored" };
}

function drop(name: string): void {
  memoryOnly.delete(name);
  vaultRemove(name);
}

/* ---- Google ---- */

/** Persist the token set (incl. the refresh token), the client, and who is signed in. */
export async function saveGoogleCredentials(
  tokens: GoogleTokenSet,
  identity: GoogleIdentity | null,
  client: GoogleOAuthClient,
): Promise<{ rest: Rest; message: string }> {
  const t = await put(GOOGLE_TOKENS_STORE, tokens);
  await put(GOOGLE_CLIENT_STORE, client);
  if (identity) await put(GOOGLE_IDENTITY_STORE, identity);
  return { rest: t.rest, message: t.message };
}

export async function loadGoogleTokens(): Promise<StoredSecret<GoogleTokenSet>> {
  return take<GoogleTokenSet>(GOOGLE_TOKENS_STORE);
}

export async function loadGoogleClient(): Promise<StoredSecret<GoogleOAuthClient>> {
  return take<GoogleOAuthClient>(GOOGLE_CLIENT_STORE);
}

export async function loadGoogleIdentity(): Promise<StoredSecret<GoogleIdentity>> {
  return take<GoogleIdentity>(GOOGLE_IDENTITY_STORE);
}

export function forgetGoogleCredentials(): void {
  drop(GOOGLE_TOKENS_STORE);
  drop(GOOGLE_CLIENT_STORE);
  drop(GOOGLE_IDENTITY_STORE);
}

/* ---- OpenAI ---- */

export async function saveOpenAIKey(key: string): Promise<{ rest: Rest; message: string }> {
  return put(OPENAI_KEY_STORE, key);
}

export async function loadOpenAIKey(): Promise<StoredSecret<string>> {
  return take<string>(OPENAI_KEY_STORE);
}

export function forgetOpenAIKey(): void {
  drop(OPENAI_KEY_STORE);
}

/* ---- Gemini API key (the credential shape the app already supported) ---- */

export async function saveGeminiApiKey(key: string): Promise<{ rest: Rest; message: string }> {
  return put(GEMINI_KEY_STORE, key);
}

export async function loadGeminiApiKey(): Promise<StoredSecret<string>> {
  return take<string>(GEMINI_KEY_STORE);
}

export function forgetGeminiApiKey(): void {
  drop(GEMINI_KEY_STORE);
}

/** Whether a credential exists in this session, without unsealing it. */
export function credentialPresence(): { google: boolean; openai: boolean; gemini: boolean } {
  const present = (name: string) => memoryOnly.has(name);
  return { google: present(GOOGLE_TOKENS_STORE), openai: present(OPENAI_KEY_STORE), gemini: present(GEMINI_KEY_STORE) };
}

/** True when the vault is unlocked — i.e. when a new secret can be sealed. */
export function vaultIsOpen(): boolean {
  return vaultStatus().status === "unlocked";
}

/**
 * The refresh path in one call: give me a token that is usable NOW. An expired
 * token is re-exchanged, never returned. If it cannot be renewed this returns
 * null and the caller must re-authorize.
 */
export async function usableGoogleTokens(
  refresh: (tokens: GoogleTokenSet) => Promise<{ ok: true; tokens: GoogleTokenSet } | { ok: false }>,
): Promise<{ tokens: GoogleTokenSet; refreshed: boolean } | null> {
  const stored = await loadGoogleTokens();
  if (!stored.ok || !stored.value) return null;
  if (isAccessTokenUsable(stored.value)) return { tokens: stored.value, refreshed: false };
  const next = await refresh(stored.value);
  if (!next.ok) return null;
  const client = await loadGoogleClient();
  await saveGoogleCredentials(next.tokens, null, client.value ?? { clientId: "", redirectUri: "" });
  return { tokens: next.tokens, refreshed: true };
}

/** Clear the module-memory fallback (used by tests and "forget everything"). */
export function clearMemoryOnlyCredentials(): void {
  memoryOnly.clear();
}

