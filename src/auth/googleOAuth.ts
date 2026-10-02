/**
 * SelfImpulse — the Google authorization-code + PKCE flow, done for real.
 *
 * This is the REAL Google OAuth flow, not a simulation. It needs a Google
 * Cloud project with the Generative Language API enabled and an OAuth client
 * of type "Desktop app" (native/loopback). Two credential shapes are
 * supported because the owner may have either:
 *
 *   1. an OAuth CLIENT ID (+ optional client secret for the desktop flow);
 *   2. a plain Gemini API KEY (`AIza…`) — handled in `openaiKey.ts`, which is
 *      the shape the app already supported through `engine/providers.ts`.
 *
 * THE TRUTH REQUIREMENT, which is why this file is shaped the way it is:
 * signing in with Google proves IDENTITY only. A Google One / Gemini Advanced
 * consumer subscription is a web-product entitlement — it does not enable the
 * Generative Language API, does not bill it, and never becomes
 * `hasApiCredential` in `authStatus.ts`. Only a real API credential does.
 *
 * Endpoints are the documented Google ones (verified 2026-09):
 *   authorize  https://accounts.google.com/o/oauth2/v2/auth
 *   token      https://oauth2.googleapis.com/token
 *   userinfo   https://www.googleapis.com/oauth2/v3/userinfo
 *   models     https://generativelanguage.googleapis.com/v1beta/models
 *
 * NOTE ON GRANT TYPE: RFC 6749 §4.1.3 mandates `grant_type=authorization_code`
 * for this exchange. `authorization_token` is not a grant type OAuth 2.0
 * defines and Google's token endpoint rejects it, so this module uses the RFC
 * value. `refreshAccessToken` uses `grant_type=refresh_token`.
 */
import { createPkcePair, createState, stateMatches, type PkcePair } from "./pkce";

export const GOOGLE_AUTHORIZE_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
export const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
export const GOOGLE_USERINFO_ENDPOINT = "https://www.googleapis.com/oauth2/v3/userinfo";
export const GEMINI_MODELS_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

/**
 * `openid email profile` for who is signed in; the retriever scope is what the
 * Gemini API requires for a Cloud OAuth token. The identity scopes are for
 * DISPLAY only — this app never reads mail or Drive.
 */
export const GOOGLE_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/generative-language.retriever",
] as const;

/** The OAuth client the owner pastes in (type: "Desktop app"). */
export interface GoogleOAuthClient {
  clientId: string;
  /** Optional. Google's desktop flow accepts it; PKCE still protects the code. */
  clientSecret?: string;
  /** Must exactly match a redirect URI registered on the client. */
  redirectUri: string;
}

/** What Google returns from the token endpoint. */
export interface GoogleTokenSet {
  accessToken: string;
  refreshToken?: string;
  /** epoch ms — computed from `expires_in` at exchange time. */
  expiresAt: number;
  tokenType: string;
  scope?: string;
}

/** Who is signed in — DISPLAY ONLY, never an authorization for model access. */
export interface GoogleIdentity {
  sub: string;
  email?: string;
  emailVerified?: boolean;
  name?: string;
  picture?: string;
}

/** Every failure is typed and worded. There is no silent catch-and-continue. */
export type AuthErrorKind =
  | "consent-declined"
  | "cancelled"
  | "state-mismatch"
  | "network"
  | "timeout"
  | "invalid-client"
  | "invalid-grant"
  | "invalid-request"
  | "access-denied"
  | "api-not-enabled"
  | "server-error"
  | "unauthorized"
  | "bad-response"
  | "not-configured";

export interface AuthError {
  kind: AuthErrorKind;
  /** A distinct, human sentence — the screen shows this verbatim. */
  message: string;
  /** Whether a Retry button is honest here. */
  retryable: boolean;
  detail?: string;
}

export function authError(kind: AuthErrorKind, message: string, retryable: boolean, detail?: string): AuthError {
  return { kind, message, retryable, detail };
}

/**
 * Each Google failure gets its OWN sentence and its OWN retry semantics,
 * because "the user pressed Cancel", "your client ID is wrong" and "the
 * network is down" need different human answers.
 */
const SENTENCES: Record<string, { message: string; retryable: boolean }> = {
  access_denied: {
    message: "You declined the consent screen, so nothing was granted. Nothing was stored.",
    retryable: true,
  },
  invalid_client: {
    message:
      "Google rejected the client ID. Check it is an OAuth client of type “Desktop app”, and that the client secret (if any) matches.",
    retryable: false,
  },
  invalid_grant: {
    message:
      "The authorization grant is no longer valid — the code was already used, or the refresh token was revoked. Sign in again to get a new one.",
    retryable: true,
  },
  invalid_request: {
    message: "Google rejected the request shape — usually a redirect_uri that is not registered on this client.",
    retryable: false,
  },
  unauthorized_client: {
    message: "This OAuth client is not allowed to use the authorization-code flow.",
    retryable: false,
  },
  timeout: {
    message: "The request to Google timed out. Nothing was stored — you can retry.",
    retryable: true,
  },
  "api-not-enabled": {
    message:
      "This Google account is signed in, but the Generative Language API is not enabled on the Cloud project behind this client — so there is no model access. Enable it in the Google Cloud console.",
    retryable: false,
  },
};

const DEFAULT_TIMEOUT_MS = 30_000;
type FetchImpl = typeof fetch;

/**
 * The in-flight request. The verifier is a secret for the life of one
 * authorization round-trip: it lives in module memory only and is dropped the
 * moment a callback is consumed or the flow is abandoned. It is never written
 * to storage, because writing it would hand an attacker the one value PKCE
 * exists to protect.
 */
interface PendingRequest {
  verifier: string;
  state: string;
  startedAt: number;
  client: GoogleOAuthClient;
}

let pending: PendingRequest | null = null;

const PENDING_TTL_MS = 10 * 60 * 1000;

/** Test seam: drop any in-flight request. */
export function resetPendingGoogleRequest(): void {
  pending = null;
}

/** True while a consent round-trip is in flight (never exposes the verifier). */
export function hasPendingGoogleRequest(): boolean {
  return pending !== null && Date.now() - pending.startedAt < PENDING_TTL_MS;
}

export interface BeginAuthResult {
  /** Open this in the system browser / webview. */
  url: string;
  state: string;
  pkce: PkcePair;
}

/**
 * Build the authorization URL. Everything OAuth 2.0 for native apps requires is
 * present: `response_type=code`, PKCE S256, `state`, and `access_type=offline`
 * so Google returns a refresh token. Without a refresh token the app could
 * only call the API for the first hour, which the status model would then have
 * to report as expired — so asking for one is the difference between working
 * and not.
 */
export async function beginGoogleAuthorization(client: GoogleOAuthClient): Promise<BeginAuthResult> {
  if (!client.clientId.trim()) {
    throw new Error("no OAuth client ID — a Google Cloud OAuth client of type “Desktop app” is required for this flow");
  }
  if (!client.redirectUri.trim()) {
    throw new Error("no redirect URI — it must match a redirect URI registered on the OAuth client");
  }
  const pkce = await createPkcePair();
  const state = createState();
  pending = { verifier: pkce.verifier, state, startedAt: Date.now(), client };

  const url = new URL(GOOGLE_AUTHORIZE_ENDPOINT);
  url.searchParams.set("client_id", client.clientId.trim());
  url.searchParams.set("redirect_uri", client.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", GOOGLE_SCOPES.join(" "));
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", pkce.challenge);
  url.searchParams.set("code_challenge_method", pkce.method);
  url.searchParams.set("access_type", "offline");
  /* ask for a refresh token explicitly — consent may already have been given */
  url.searchParams.set("include_granted_scopes", "true");
  return { url: url.toString(), state, pkce };
}

/** What the redirect back to the app carries. */
export type CallbackResult =
  | { kind: "code"; code: string; state: string }
  | { kind: "error"; error: AuthError };

/**
 * Parse the redirect the authorization server sent back. Forgiving about the
 * URL's shape, strict about the SECURITY-relevant parts: `state` is mandatory
 * and is verified in constant time before any token exchange happens.
 */
export function parseAuthorizationCallback(rawUrl: string, expectedState: string): CallbackResult {
  let params: URLSearchParams;
  try {
    params = new URL(rawUrl).searchParams;
  } catch {
    return {
      kind: "error",
      error: authError("bad-response", "The redirect back from Google could not be read — nothing was stored.", true),
    };
  }

  const err = params.get("error");
  const desc = params.get("error_description") ?? undefined;

  /* Declining consent is a first-class outcome, not an error to apologise for.
     `kind` must be set explicitly — SENTENCES holds only the human sentence,
     never the machine code. */
  if (err === "access_denied") {
    return { kind: "error", error: authError("consent-declined", SENTENCES.access_denied.message, SENTENCES.access_denied.retryable, desc) };
  }
  if (err) {
    const known = SENTENCES[err];
    return {
      kind: "error",
      error: authError(
        known ? "access-denied" : "server-error",
        known ? known.message : `Google returned an error (“${err}”). Nothing was stored.`,
        known ? known.retryable : false,
        desc,
      ),
    };
  }

  const code = params.get("code");
  const state = params.get("state");

  if (!code) {
    return {
      kind: "error",
      error: authError("cancelled", "The sign-in was cancelled before a code was issued — nothing was stored. You can try again.", true),
    };
  }
  if (!state || !stateMatches(expectedState, state)) {
    /* CSRF: a missing or mismatched state is the ONE case never retried
       blindly — the flow is aborted and a fresh one must be started. */
    return {
      kind: "error",
      error: authError(
        "state-mismatch",
        "The sign-in was stopped because its security token did not match. This protects against a hijacked redirect — start the sign-in again.",
        false,
      ),
    };
  }
  return { kind: "code", code, state };
}

/** Turn a Google `{"error":…}` body into our typed error. */
function googleErrorFrom(error: string, description: string | undefined, status: number): AuthError {
  const known = SENTENCES[error];
  if (known) {
    const kind: AuthErrorKind = error === "invalid_grant" ? "invalid-grant" : error === "invalid_client" ? "invalid-client" : "access-denied";
    return authError(kind, known.message, known.retryable, description);
  }
  if (status === 401) return authError("unauthorized", "Google rejected these credentials. Sign in again.", true);
  if (status >= 500) return authError("server-error", "Google's servers returned an error. Nothing was stored — you can retry.", true);
  return authError("server-error", `Google returned “${error}”. Nothing was stored.`, false, description);
}

/** POST the token endpoint and normalise every way it can fail. */
async function postToken(
  body: URLSearchParams,
  fetchImpl: FetchImpl | undefined,
  timeoutMs: number,
): Promise<{ ok: true; json: Record<string, unknown> } | { ok: false; error: AuthError }> {
  const doFetch = fetchImpl ?? globalThis.fetch?.bind(globalThis);
  if (!doFetch) return { ok: false, error: authError("network", "No fetch is available in this runtime — nothing was exchanged.", true) };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await doFetch(GOOGLE_TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
      signal: controller.signal,
    });
    const text = await res.text().catch(() => "");
    let json: Record<string, unknown> = {};
    try {
      json = text ? (JSON.parse(text) as Record<string, unknown>) : {};
    } catch {
      return { ok: false, error: authError("bad-response", "Google's token response was not readable JSON — nothing was stored.", true) };
    }
    if (!res.ok) {
      const err = typeof json.error === "string" ? json.error : `http_${res.status}`;
      const desc = typeof json.error_description === "string" ? json.error_description : text.slice(0, 200);
      return { ok: false, error: googleErrorFrom(err, desc, res.status) };
    }
    if (typeof json.access_token !== "string" || json.access_token.length === 0) {
      return { ok: false, error: authError("bad-response", "Google returned no access token — nothing was stored.", true) };
    }
    return { ok: true, json };
  } catch (e) {
    const aborted = e instanceof Error && e.name === "AbortError";
    return {
      ok: false,
      error: aborted
        ? authError("timeout", SENTENCES.timeout.message, true)
        : authError("network", `Could not reach Google: ${e instanceof Error ? e.message : String(e)}. Nothing was stored — you can retry.`, true),
    };
  } finally {
    clearTimeout(timer);
  }
}

/** Exchange an authorization code + PKCE verifier for tokens (RFC 6749 §4.1.3). */
export async function exchangeAuthorizationCode(
  code: string,
  client: GoogleOAuthClient,
  fetchImpl?: FetchImpl,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<{ ok: true; tokens: GoogleTokenSet } | { ok: false; error: AuthError }> {
  const body = new URLSearchParams({
    code,
    client_id: client.clientId.trim(),
    /* the verifier never leaves this module — it is read from the in-flight request */
    code_verifier: pending?.verifier ?? "",
    grant_type: "authorization_code",
    redirect_uri: client.redirectUri,
  });
  if (client.clientSecret?.trim()) body.set("client_secret", client.clientSecret.trim());

  const out = await postToken(body, fetchImpl, timeoutMs);
  if (!out.ok) return out;

  const expiresIn = typeof out.json.expires_in === "number" ? out.json.expires_in : 3600;
  return {
    ok: true,
    tokens: {
      accessToken: out.json.access_token as string,
      refreshToken: typeof out.json.refresh_token === "string" ? out.json.refresh_token : undefined,
      expiresAt: Date.now() + expiresIn * 1000,
      tokenType: typeof out.json.token_type === "string" ? out.json.token_type : "Bearer",
      scope: typeof out.json.scope === "string" ? out.json.scope : undefined,
    },
  };
}

/**
 * Re-exchange a refresh token for a FRESH access token. Called on expiry — an
 * expired access token is NEVER reused, because sending it produces a 401 that
 * looks like a revoked key and sends the owner re-authorizing for what is only
 * a clock.
 */
export async function refreshAccessToken(
  tokens: GoogleTokenSet,
  client: GoogleOAuthClient,
  fetchImpl?: FetchImpl,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<{ ok: true; tokens: GoogleTokenSet } | { ok: false; error: AuthError }> {
  if (!tokens.refreshToken) {
    return {
      ok: false,
      error: authError("invalid-grant", "The saved sign-in has expired and Google gave no refresh token, so it cannot be renewed. Sign in again.", true),
    };
  }
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: tokens.refreshToken,
    client_id: client.clientId.trim(),
  });
  if (client.clientSecret?.trim()) body.set("client_secret", client.clientSecret.trim());

  const out = await postToken(body, fetchImpl, timeoutMs);
  if (!out.ok) return out;

  const expiresIn = typeof out.json.expires_in === "number" ? out.json.expires_in : 3600;
  return {
    ok: true,
    tokens: {
      accessToken: out.json.access_token as string,
      /* Google may omit refresh_token on renewal — keep the one we hold. */
      refreshToken: typeof out.json.refresh_token === "string" ? out.json.refresh_token : tokens.refreshToken,
      expiresAt: Date.now() + expiresIn * 1000,
      tokenType: typeof out.json.token_type === "string" ? out.json.token_type : tokens.tokenType,
      scope: tokens.scope,
    },
  };
}

/**
 * Who is signed in — DISPLAY ONLY. A name and an email change nothing about
 * what the app may do; `authStatus` keeps that a separate fact. If this call
 * fails the sign-in still stands (the token is valid), so it returns null
 * rather than an error.
 */
export async function fetchGoogleIdentity(
  tokens: GoogleTokenSet,
  fetchImpl?: FetchImpl,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<GoogleIdentity | null> {
  const doFetch = fetchImpl ?? globalThis.fetch?.bind(globalThis);
  if (!doFetch) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await doFetch(GOOGLE_USERINFO_ENDPOINT, {
      headers: { Authorization: `Bearer ${tokens.accessToken}` },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    const sub = typeof body?.sub === "string" ? body.sub : null;
    if (!sub) return null;
    return {
      sub,
      email: typeof body?.email === "string" ? body.email : undefined,
      emailVerified: body?.email_verified === true || body?.email_verified === "true",
      name: typeof body?.name === "string" ? body.name : undefined,
      picture: typeof body?.picture === "string" ? body.picture : undefined,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export interface GeminiAccessProbe {
  /** the credential really authorizes Generative Language API calls. */
  granted: boolean;
  /** a model id, when the call succeeded — proof it is not a hollow 200. */
  model?: string;
  error?: AuthError;
}

/**
 * THE HONESTY GATE. A successful Google sign-in proves identity and nothing
 * else, so this one cheap GET is what decides `hasApiCredential` for the
 * OAuth path: it costs no tokens, and it is the only way to tell "signed in"
 * from "can actually call a model" — exactly the distinction a consumer
 * subscription cannot satisfy.
 */
export async function probeGeminiModelAccess(
  credential: string,
  kind: "oauth" | "api-key",
  fetchImpl?: FetchImpl,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<GeminiAccessProbe> {
  const doFetch = fetchImpl ?? globalThis.fetch?.bind(globalThis);
  if (!doFetch) return { granted: false, error: authError("network", "No fetch is available in this runtime.", true) };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await doFetch(GEMINI_MODELS_ENDPOINT, {
      headers: kind === "oauth" ? { Authorization: `Bearer ${credential}` } : { "x-goog-api-key": credential },
      signal: controller.signal,
    });
    if (res.status === 401 || res.status === 403) {
      const text = await res.text().catch(() => "");
      let status = "";
      try {
        status = String((JSON.parse(text) as { error?: { status?: string } }).error?.status ?? "");
      } catch { /* not JSON — fall through to the generic sentence */ }
      return {
        granted: false,
        error:
          status === "PERMISSION_DENIED"
            ? authError("api-not-enabled", SENTENCES["api-not-enabled"].message, false)
            : authError("unauthorized", "Google accepted the request but refused model access for this credential.", false),
      };
    }
    if (!res.ok) {
      return { granted: false, error: authError("server-error", `The Generative Language API returned HTTP ${res.status}. You can retry.`, true) };
    }
    const body = (await res.json().catch(() => null)) as { models?: Array<{ name?: string }> } | null;
    const model = body?.models?.find((m) => typeof m.name === "string" && m.name.includes("gemini"))?.name?.replace(/^models\//, "");
    return { granted: true, model };
  } catch (e) {
    const aborted = e instanceof Error && e.name === "AbortError";
    return {
      granted: false,
      error: aborted
        ? authError("timeout", SENTENCES.timeout.message, true)
        : authError("network", `Could not reach the Generative Language API: ${e instanceof Error ? e.message : String(e)}.`, true),
    };
  } finally {
    clearTimeout(timer);
  }
}

export type SignInResult =
  | { ok: true; tokens: GoogleTokenSet; identity: GoogleIdentity | null; access: GeminiAccessProbe }
  | { ok: false; error: AuthError };

/**
 * The whole return leg, in order, with nothing skipped:
 *
 *   parse redirect → verify `state` (constant time) → exchange code+verifier
 *   → fetch who-is-signed-in (display only) → probe whether a model is
 *   actually reachable (the honesty gate).
 *
 * The probe runs even on success, because "signed in" and "can call a model"
 * are different claims and only the second may set `canExecute`.
 */
export async function completeGoogleSignIn(
  callbackUrl: string,
  client: GoogleOAuthClient,
  opts: { fetchImpl?: FetchImpl; timeoutMs?: number } = {},
): Promise<SignInResult> {
  const expectedState = pending?.state ?? "";
  if (!expectedState) {
    return {
      ok: false,
      error: authError("state-mismatch", "There is no sign-in in progress on this device, so the redirect was refused. Start the sign-in again.", true),
    };
  }
  const parsed = parseAuthorizationCallback(callbackUrl, expectedState);
  if (parsed.kind === "error") {
    pending = null;
    return { ok: false, error: parsed.error };
  }
  if (!pending) {
    return { ok: false, error: authError("state-mismatch", "The sign-in state expired before it completed. Start again.", true) };
  }

  const exchange = await exchangeAuthorizationCode(parsed.code, client, opts.fetchImpl, opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  /* the verifier is single-use: drop it the moment the code is spent */
  pending = null;
  if (!exchange.ok) return { ok: false, error: exchange.error };

  const identity = await fetchGoogleIdentity(exchange.tokens, opts.fetchImpl, opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const access = await probeGeminiModelAccess(exchange.tokens.accessToken, "oauth", opts.fetchImpl, opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  return { ok: true, tokens: exchange.tokens, identity, access };
}

/**
 * A token set is usable only if it has not expired. An expired token is NEVER
 * sent: the caller must re-exchange via `refreshAccessToken` first. Keeping
 * this predicate separate from the refresh call is what makes the refresh path
 * testable.
 */
export function isAccessTokenUsable(tokens: GoogleTokenSet | null | undefined, skewMs = 60_000): boolean {
  if (!tokens || !tokens.accessToken) return false;
  return tokens.expiresAt - skewMs > Date.now();
}




