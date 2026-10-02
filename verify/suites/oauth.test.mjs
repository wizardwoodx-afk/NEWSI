import { createRequire as __mjCreateRequire } from "node:module"; const require = __mjCreateRequire(import.meta.url);

// probe/oauth.test.ts
import { createHash } from "node:crypto";

// src/auth/pkce.ts
var TE = new TextEncoder();
var B64URL = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
var CODE_VERIFIER_MIN = 43;
var CODE_VERIFIER_MAX = 128;
var CODE_CHALLENGE_METHOD = "S256";
function requireCrypto() {
  const c = globalThis.crypto;
  if (!c || typeof c.getRandomValues !== "function") {
    throw new Error(
      "this runtime has no Web Crypto (crypto.getRandomValues) \u2014 the OAuth seam refuses rather than fall back to a weak PRNG"
    );
  }
  return c;
}
function requireSubtle() {
  const s = globalThis.crypto?.subtle;
  if (!s || typeof s.digest !== "function") {
    throw new Error("this runtime has no SubtleCrypto \u2014 PKCE S256 cannot be computed and the sign-in is refused");
  }
  return s;
}
function base64UrlEncode(bytes) {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < bytes.length ? bytes[i + 1] : void 0;
    const b2 = i + 2 < bytes.length ? bytes[i + 2] : void 0;
    out += B64URL[b0 >> 2];
    out += B64URL[(b0 & 3) << 4 | (b1 ?? 0) >> 4];
    if (b1 === void 0) break;
    out += B64URL[(b1 & 15) << 2 | (b2 ?? 0) >> 6];
    if (b2 === void 0) break;
    out += B64URL[b2 & 63];
  }
  return out;
}
function randomBytes(length) {
  if (!Number.isInteger(length) || length < 16 || length > 64) {
    throw new Error("random byte length must be an integer between 16 and 64");
  }
  const out = new Uint8Array(length);
  requireCrypto().getRandomValues(out);
  return out;
}
function createCodeVerifier(byteLength = 32) {
  const verifier = base64UrlEncode(randomBytes(byteLength));
  if (!isValidCodeVerifier(verifier)) {
    throw new Error("generated code_verifier failed the RFC 7636 shape check \u2014 refusing to start a flow that cannot be verified");
  }
  return verifier;
}
function isValidCodeVerifier(verifier) {
  return typeof verifier === "string" && verifier.length >= CODE_VERIFIER_MIN && verifier.length <= CODE_VERIFIER_MAX && /^[A-Za-z0-9\-._~]+$/.test(verifier);
}
async function computeCodeChallenge(verifier, subtleImpl) {
  if (!isValidCodeVerifier(verifier)) {
    throw new Error("code_verifier is not a valid RFC 7636 verifier \u2014 no challenge was computed");
  }
  const subtleCrypto = subtleImpl ?? requireSubtle();
  const digest = await subtleCrypto.digest("SHA-256", TE.encode(verifier));
  return base64UrlEncode(new Uint8Array(digest));
}
async function createPkcePair(byteLength = 32) {
  const verifier = createCodeVerifier(byteLength);
  return { verifier, challenge: await computeCodeChallenge(verifier), method: CODE_CHALLENGE_METHOD };
}
function createState(byteLength = 16) {
  return base64UrlEncode(randomBytes(byteLength));
}
function constantTimeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const len = a.length > b.length ? a.length : b.length;
  let diff = a.length ^ b.length;
  for (let i = 0; i < len; i++) {
    diff |= (a.charCodeAt(i) | 0) ^ (b.charCodeAt(i) | 0);
  }
  return diff === 0;
}
function stateMatches(expected, received) {
  if (!expected || !received) return false;
  return constantTimeEqual(expected, received);
}

// src/auth/googleOAuth.ts
var GOOGLE_AUTHORIZE_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
var GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
var GOOGLE_USERINFO_ENDPOINT = "https://www.googleapis.com/oauth2/v3/userinfo";
var GEMINI_MODELS_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";
var GOOGLE_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/generative-language.retriever"
];
function authError(kind, message, retryable, detail) {
  return { kind, message, retryable, detail };
}
var SENTENCES = {
  access_denied: {
    message: "You declined the consent screen, so nothing was granted. Nothing was stored.",
    retryable: true
  },
  invalid_client: {
    message: "Google rejected the client ID. Check it is an OAuth client of type \u201CDesktop app\u201D, and that the client secret (if any) matches.",
    retryable: false
  },
  invalid_grant: {
    message: "The authorization grant is no longer valid \u2014 the code was already used, or the refresh token was revoked. Sign in again to get a new one.",
    retryable: true
  },
  invalid_request: {
    message: "Google rejected the request shape \u2014 usually a redirect_uri that is not registered on this client.",
    retryable: false
  },
  unauthorized_client: {
    message: "This OAuth client is not allowed to use the authorization-code flow.",
    retryable: false
  },
  timeout: {
    message: "The request to Google timed out. Nothing was stored \u2014 you can retry.",
    retryable: true
  },
  "api-not-enabled": {
    message: "This Google account is signed in, but the Generative Language API is not enabled on the Cloud project behind this client \u2014 so there is no model access. Enable it in the Google Cloud console.",
    retryable: false
  }
};
var DEFAULT_TIMEOUT_MS = 3e4;
var pending = null;
var PENDING_TTL_MS = 10 * 60 * 1e3;
function resetPendingGoogleRequest() {
  pending = null;
}
async function beginGoogleAuthorization(client) {
  if (!client.clientId.trim()) {
    throw new Error("no OAuth client ID \u2014 a Google Cloud OAuth client of type \u201CDesktop app\u201D is required for this flow");
  }
  if (!client.redirectUri.trim()) {
    throw new Error("no redirect URI \u2014 it must match a redirect URI registered on the OAuth client");
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
  url.searchParams.set("include_granted_scopes", "true");
  return { url: url.toString(), state, pkce };
}
function parseAuthorizationCallback(rawUrl, expectedState) {
  let params;
  try {
    params = new URL(rawUrl).searchParams;
  } catch {
    return {
      kind: "error",
      error: authError("bad-response", "The redirect back from Google could not be read \u2014 nothing was stored.", true)
    };
  }
  const err = params.get("error");
  const desc = params.get("error_description") ?? void 0;
  if (err === "access_denied") {
    return { kind: "error", error: authError("consent-declined", SENTENCES.access_denied.message, SENTENCES.access_denied.retryable, desc) };
  }
  if (err) {
    const known = SENTENCES[err];
    return {
      kind: "error",
      error: authError(
        known ? "access-denied" : "server-error",
        known ? known.message : `Google returned an error (\u201C${err}\u201D). Nothing was stored.`,
        known ? known.retryable : false,
        desc
      )
    };
  }
  const code = params.get("code");
  const state = params.get("state");
  if (!code) {
    return {
      kind: "error",
      error: authError("cancelled", "The sign-in was cancelled before a code was issued \u2014 nothing was stored. You can try again.", true)
    };
  }
  if (!state || !stateMatches(expectedState, state)) {
    return {
      kind: "error",
      error: authError(
        "state-mismatch",
        "The sign-in was stopped because its security token did not match. This protects against a hijacked redirect \u2014 start the sign-in again.",
        false
      )
    };
  }
  return { kind: "code", code, state };
}
function googleErrorFrom(error, description, status) {
  const known = SENTENCES[error];
  if (known) {
    const kind = error === "invalid_grant" ? "invalid-grant" : error === "invalid_client" ? "invalid-client" : "access-denied";
    return authError(kind, known.message, known.retryable, description);
  }
  if (status === 401) return authError("unauthorized", "Google rejected these credentials. Sign in again.", true);
  if (status >= 500) return authError("server-error", "Google's servers returned an error. Nothing was stored \u2014 you can retry.", true);
  return authError("server-error", `Google returned \u201C${error}\u201D. Nothing was stored.`, false, description);
}
async function postToken(body, fetchImpl, timeoutMs) {
  const doFetch = fetchImpl ?? globalThis.fetch?.bind(globalThis);
  if (!doFetch) return { ok: false, error: authError("network", "No fetch is available in this runtime \u2014 nothing was exchanged.", true) };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await doFetch(GOOGLE_TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
      signal: controller.signal
    });
    const text = await res.text().catch(() => "");
    let json = {};
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      return { ok: false, error: authError("bad-response", "Google's token response was not readable JSON \u2014 nothing was stored.", true) };
    }
    if (!res.ok) {
      const err = typeof json.error === "string" ? json.error : `http_${res.status}`;
      const desc = typeof json.error_description === "string" ? json.error_description : text.slice(0, 200);
      return { ok: false, error: googleErrorFrom(err, desc, res.status) };
    }
    if (typeof json.access_token !== "string" || json.access_token.length === 0) {
      return { ok: false, error: authError("bad-response", "Google returned no access token \u2014 nothing was stored.", true) };
    }
    return { ok: true, json };
  } catch (e) {
    const aborted = e instanceof Error && e.name === "AbortError";
    return {
      ok: false,
      error: aborted ? authError("timeout", SENTENCES.timeout.message, true) : authError("network", `Could not reach Google: ${e instanceof Error ? e.message : String(e)}. Nothing was stored \u2014 you can retry.`, true)
    };
  } finally {
    clearTimeout(timer);
  }
}
async function exchangeAuthorizationCode(code, client, fetchImpl, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const body = new URLSearchParams({
    code,
    client_id: client.clientId.trim(),
    /* the verifier never leaves this module — it is read from the in-flight request */
    code_verifier: pending?.verifier ?? "",
    grant_type: "authorization_code",
    redirect_uri: client.redirectUri
  });
  if (client.clientSecret?.trim()) body.set("client_secret", client.clientSecret.trim());
  const out = await postToken(body, fetchImpl, timeoutMs);
  if (!out.ok) return out;
  const expiresIn = typeof out.json.expires_in === "number" ? out.json.expires_in : 3600;
  return {
    ok: true,
    tokens: {
      accessToken: out.json.access_token,
      refreshToken: typeof out.json.refresh_token === "string" ? out.json.refresh_token : void 0,
      expiresAt: Date.now() + expiresIn * 1e3,
      tokenType: typeof out.json.token_type === "string" ? out.json.token_type : "Bearer",
      scope: typeof out.json.scope === "string" ? out.json.scope : void 0
    }
  };
}
async function refreshAccessToken(tokens, client, fetchImpl, timeoutMs = DEFAULT_TIMEOUT_MS) {
  if (!tokens.refreshToken) {
    return {
      ok: false,
      error: authError("invalid-grant", "The saved sign-in has expired and Google gave no refresh token, so it cannot be renewed. Sign in again.", true)
    };
  }
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: tokens.refreshToken,
    client_id: client.clientId.trim()
  });
  if (client.clientSecret?.trim()) body.set("client_secret", client.clientSecret.trim());
  const out = await postToken(body, fetchImpl, timeoutMs);
  if (!out.ok) return out;
  const expiresIn = typeof out.json.expires_in === "number" ? out.json.expires_in : 3600;
  return {
    ok: true,
    tokens: {
      accessToken: out.json.access_token,
      /* Google may omit refresh_token on renewal — keep the one we hold. */
      refreshToken: typeof out.json.refresh_token === "string" ? out.json.refresh_token : tokens.refreshToken,
      expiresAt: Date.now() + expiresIn * 1e3,
      tokenType: typeof out.json.token_type === "string" ? out.json.token_type : tokens.tokenType,
      scope: tokens.scope
    }
  };
}
async function fetchGoogleIdentity(tokens, fetchImpl, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const doFetch = fetchImpl ?? globalThis.fetch?.bind(globalThis);
  if (!doFetch) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await doFetch(GOOGLE_USERINFO_ENDPOINT, {
      headers: { Authorization: `Bearer ${tokens.accessToken}` },
      signal: controller.signal
    });
    if (!res.ok) return null;
    const body = await res.json().catch(() => null);
    const sub = typeof body?.sub === "string" ? body.sub : null;
    if (!sub) return null;
    return {
      sub,
      email: typeof body?.email === "string" ? body.email : void 0,
      emailVerified: body?.email_verified === true || body?.email_verified === "true",
      name: typeof body?.name === "string" ? body.name : void 0,
      picture: typeof body?.picture === "string" ? body.picture : void 0
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
async function probeGeminiModelAccess(credential, kind, fetchImpl, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const doFetch = fetchImpl ?? globalThis.fetch?.bind(globalThis);
  if (!doFetch) return { granted: false, error: authError("network", "No fetch is available in this runtime.", true) };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await doFetch(GEMINI_MODELS_ENDPOINT, {
      headers: kind === "oauth" ? { Authorization: `Bearer ${credential}` } : { "x-goog-api-key": credential },
      signal: controller.signal
    });
    if (res.status === 401 || res.status === 403) {
      const text = await res.text().catch(() => "");
      let status = "";
      try {
        status = String(JSON.parse(text).error?.status ?? "");
      } catch {
      }
      return {
        granted: false,
        error: status === "PERMISSION_DENIED" ? authError("api-not-enabled", SENTENCES["api-not-enabled"].message, false) : authError("unauthorized", "Google accepted the request but refused model access for this credential.", false)
      };
    }
    if (!res.ok) {
      return { granted: false, error: authError("server-error", `The Generative Language API returned HTTP ${res.status}. You can retry.`, true) };
    }
    const body = await res.json().catch(() => null);
    const model = body?.models?.find((m) => typeof m.name === "string" && m.name.includes("gemini"))?.name?.replace(/^models\//, "");
    return { granted: true, model };
  } catch (e) {
    const aborted = e instanceof Error && e.name === "AbortError";
    return {
      granted: false,
      error: aborted ? authError("timeout", SENTENCES.timeout.message, true) : authError("network", `Could not reach the Generative Language API: ${e instanceof Error ? e.message : String(e)}.`, true)
    };
  } finally {
    clearTimeout(timer);
  }
}
async function completeGoogleSignIn(callbackUrl, client, opts = {}) {
  const expectedState = pending?.state ?? "";
  if (!expectedState) {
    return {
      ok: false,
      error: authError("state-mismatch", "There is no sign-in in progress on this device, so the redirect was refused. Start the sign-in again.", true)
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
  pending = null;
  if (!exchange.ok) return { ok: false, error: exchange.error };
  const identity = await fetchGoogleIdentity(exchange.tokens, opts.fetchImpl, opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const access = await probeGeminiModelAccess(exchange.tokens.accessToken, "oauth", opts.fetchImpl, opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  return { ok: true, tokens: exchange.tokens, identity, access };
}
function isAccessTokenUsable(tokens, skewMs = 6e4) {
  if (!tokens || !tokens.accessToken) return false;
  return tokens.expiresAt - skewMs > Date.now();
}

// src/auth/openaiKey.ts
var OPENAI_MODELS_ENDPOINT = "https://api.openai.com/v1/models";
var OPENAI_KEY_SHAPE = /^sk-[A-Za-z0-9_-]{16,}$/;
function looksLikeOpenAIKey(key) {
  return typeof key === "string" && OPENAI_KEY_SHAPE.test(key.trim());
}
function maskKey(key) {
  const t = (key ?? "").trim();
  if (!t) return "";
  if (t.length <= 8) return `${"\u2022".repeat(t.length)} (${t.length} chars)`;
  return `${t.slice(0, 3)}${"\u2022".repeat(8)}\u2026${t.slice(-2)} (${t.length} chars)`;
}
async function validateOpenAIKey(key, opts = {}) {
  const trimmed = (key ?? "").trim();
  if (!trimmed) {
    return { ok: false, error: keyError("No API key was entered \u2014 nothing was checked or stored.", false, "not-configured") };
  }
  if (!looksLikeOpenAIKey(trimmed)) {
    return {
      ok: false,
      error: keyError(
        "That does not look like an OpenAI API key (they start with \u201Csk-\u201D). A ChatGPT subscription does not provide one \u2014 create a key at platform.openai.com with API billing set up.",
        false,
        "not-configured"
      )
    };
  }
  const doFetch = opts.fetchImpl ?? globalThis.fetch?.bind(globalThis);
  if (!doFetch) {
    return { ok: false, error: keyError("No fetch is available in this runtime \u2014 nothing was checked or stored.", true, "network") };
  }
  const timeoutMs = opts.timeoutMs ?? 3e4;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await doFetch(OPENAI_MODELS_ENDPOINT, {
      headers: { Authorization: `Bearer ${trimmed}` },
      signal: controller.signal
    });
    if (res.status === 401) {
      return {
        ok: false,
        error: keyError("OpenAI rejected that key (HTTP 401). It may be revoked or mistyped \u2014 nothing was stored.", true, "unauthorized")
      };
    }
    if (res.status === 403) {
      return {
        ok: false,
        error: keyError(
          "OpenAI refused that key (HTTP 403). The project may lack billing, or the key may lack access to this resource \u2014 nothing was stored.",
          false,
          "api-not-enabled"
        )
      };
    }
    if (res.status === 429) {
      return {
        ok: false,
        error: keyError("OpenAI is rate-limiting this key (HTTP 429). Wait a moment and retry \u2014 nothing was stored.", true, "server-error")
      };
    }
    if (!res.ok) {
      return { ok: false, error: keyError(`OpenAI returned HTTP ${res.status}. Nothing was stored \u2014 you can retry.`, true, "server-error") };
    }
    const body = await res.json().catch(() => null);
    if (!body || !Array.isArray(body.data)) {
      return { ok: false, error: keyError("OpenAI's response was not readable \u2014 nothing was stored.", true, "bad-response") };
    }
    const modelCount = body.data.length;
    if (modelCount === 0) {
      return {
        ok: false,
        error: keyError("That key reached OpenAI but can see no models \u2014 its project has no access. Nothing was stored.", false, "api-not-enabled")
      };
    }
    return {
      ok: true,
      modelCount,
      key: trimmed,
      config: { kind: "openai-compatible", baseUrl: "https://api.openai.com/v1", apiKey: trimmed, model: opts.model ?? "gpt-4.1" }
    };
  } catch (e) {
    const aborted = e instanceof Error && e.name === "AbortError";
    return {
      ok: false,
      error: aborted ? keyError(`The request to OpenAI timed out after ${timeoutMs}ms. Nothing was stored \u2014 you can retry.`, true, "timeout") : keyError(`Could not reach OpenAI: ${e instanceof Error ? e.message : String(e)}. Nothing was stored \u2014 you can retry.`, true, "network")
    };
  } finally {
    clearTimeout(timer);
  }
}
async function validateGeminiApiKey(key, opts = {}) {
  const trimmed = (key ?? "").trim();
  if (!trimmed) {
    return { ok: false, error: keyError("No Gemini API key was entered \u2014 nothing was checked or stored.", false, "not-configured") };
  }
  if (!/^AIza[0-9A-Za-z_-]{20,}$/.test(trimmed)) {
    return {
      ok: false,
      error: keyError(
        "Gemini API keys start with \u201CAIza\u201D. Create one in Google AI Studio \u2014 a Google One / Gemini subscription does not include API access.",
        false,
        "not-configured"
      )
    };
  }
  const probe = await probeGeminiModelAccess(trimmed, "api-key", opts.fetchImpl, opts.timeoutMs ?? 3e4);
  if (!probe.granted) {
    return { ok: false, error: probe.error ?? keyError("That key could not reach the Gemini API \u2014 nothing was stored.", true) };
  }
  return {
    ok: true,
    model: probe.model ?? "gemini-2.5-flash",
    key: trimmed,
    config: {
      kind: "gemini",
      baseUrl: "https://generativelanguage.googleapis.com/v1",
      apiKey: trimmed,
      model: probe.model ?? "gemini-2.5-flash"
    }
  };
}
function keyError(message, retryable, kind = "unauthorized", detail) {
  return { kind, message, retryable, detail };
}

// src/engine/vault.ts
var VAULT_FORMAT = "si-vault/1";
var VAULT_META_KEY = "vh.vault.meta.v1";
var PBKDF_ITERATIONS = 31e4;
var enc = new TextEncoder();
var dec = new TextDecoder();
function storage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}
var toB64 = (buf) => {
  const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (let b = 0; b < u8.length; b++) s += String.fromCharCode(u8[b]);
  return btoa(s);
};
var fromB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
function subtle() {
  const c = globalThis.crypto;
  return c && typeof c.subtle?.deriveKey === "function" ? c.subtle : null;
}
function randomBytes2(n) {
  const u8 = new Uint8Array(n);
  globalThis.crypto.getRandomValues(u8);
  return u8;
}
var sessionKey = null;
var sessionParams = null;
async function deriveKey(passphrase, salt) {
  const s = subtle();
  if (!s) throw new Error("WebCrypto SubtleCrypto is unavailable in this runtime \u2014 the vault refuses rather than pretend to encrypt");
  const base = await s.importKey("raw", enc.encode(passphrase), "PBKDF2", false, ["deriveKey"]);
  return s.deriveKey(
    { name: "PBKDF2", salt, iterations: PBKDF_ITERATIONS, hash: "SHA-256" },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}
function readMeta() {
  const s = storage();
  if (!s) return null;
  try {
    const raw = JSON.parse(s.getItem(VAULT_META_KEY) ?? "null");
    return raw && raw.v === "si-vault-meta/1" ? raw : null;
  } catch {
    return null;
  }
}
async function setVaultPassphrase(passphrase, now = () => /* @__PURE__ */ new Date()) {
  if (typeof passphrase !== "string" || passphrase.length < 8) {
    return { ok: false, error: "a vault passphrase needs at least 8 characters \u2014 there is no recovery, so length is the only strength that cannot be taken from you" };
  }
  const existing = readMeta();
  try {
    if (!existing) {
      const salt = randomBytes2(16);
      const iv = randomBytes2(12);
      const key = await deriveKey(passphrase, salt);
      const check = await subtle().encrypt({ name: "AES-GCM", iv }, key, enc.encode("si-vault-check/1"));
      const meta = { v: "si-vault-meta/1", saltB64: toB64(salt), ivB64: toB64(iv), cipherB64: toB64(check), kdf: "PBKDF2-SHA-256", iterations: PBKDF_ITERATIONS, createdAt: now().toISOString() };
      const s = storage();
      if (!s) return { ok: false, error: "no storage in this runtime \u2014 the vault can exist for this session only; persistence needs a store" };
      s.setItem(VAULT_META_KEY, JSON.stringify(meta));
      sessionKey = key;
      sessionParams = { salt, meta };
      return { ok: true, created: true };
    }
    try {
      const salt = fromB64(existing.saltB64);
      const key = await deriveKey(passphrase, salt);
      const plain = await subtle().decrypt({ name: "AES-GCM", iv: fromB64(existing.ivB64) }, key, fromB64(existing.cipherB64));
      if (dec.decode(plain) !== "si-vault-check/1") return { ok: false, error: "that passphrase did not open the vault \u2014 nothing was changed" };
      sessionKey = key;
      sessionParams = { salt, meta: existing };
      return { ok: true, created: false };
    } catch {
      return { ok: false, error: "that passphrase did not open the vault \u2014 nothing was changed" };
    }
  } catch (e) {
    return { ok: false, error: `the vault refused the passphrase: ${e instanceof Error ? e.message : String(e)}` };
  }
}
function lockVault() {
  sessionKey = null;
  sessionParams = null;
}
async function vaultSeal(name, text, now = () => /* @__PURE__ */ new Date()) {
  if (!sessionKey) return { ok: false, error: "the vault is locked \u2014 set or enter the passphrase before anything is sealed" };
  const meta = sessionParams?.meta;
  const salt = sessionParams?.salt;
  if (!meta || !salt) return { ok: false, error: "vault session state is missing \u2014 lock and unlock again" };
  try {
    const iv = randomBytes2(12);
    const cipher = await subtle().encrypt({ name: "AES-GCM", iv }, sessionKey, enc.encode(text));
    const record = { v: VAULT_FORMAT, saltB64: toB64(salt), ivB64: toB64(iv), cipherB64: toB64(cipher), kdf: "PBKDF2-SHA-256", iterations: meta.iterations, sealedAt: now().toISOString() };
    const s = storage();
    if (!s) return { ok: false, error: "no storage in this runtime \u2014 nothing was sealed" };
    s.setItem(name, JSON.stringify(record));
    return { ok: true };
  } catch (e) {
    return { ok: false, error: `sealing failed: ${e instanceof Error ? e.message : String(e)}` };
  }
}
async function vaultDecrypt(name) {
  const s = storage();
  if (!s) return { found: false };
  const raw = s.getItem(name);
  if (!raw) return { found: false };
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { found: true, locked: false, text: raw };
  }
  if (!parsed || typeof parsed !== "object" || parsed.v !== VAULT_FORMAT) {
    return { found: true, locked: false, text: raw };
  }
  const rec = parsed;
  if (!sessionKey) return { found: true, locked: true };
  try {
    const plain = await subtle().decrypt({ name: "AES-GCM", iv: fromB64(rec.ivB64) }, sessionKey, fromB64(rec.cipherB64));
    return { found: true, locked: false, text: dec.decode(plain) };
  } catch {
    return { found: true, locked: true };
  }
}

// src/auth/credentialStore.ts
var GOOGLE_TOKENS_STORE = "vh.auth.google.tokens.v1";
var GOOGLE_CLIENT_STORE = "vh.auth.google.client.v1";
var GOOGLE_IDENTITY_STORE = "vh.auth.google.identity.v1";
var OPENAI_KEY_STORE = "vh.auth.openai.key.v1";
var memoryOnly = /* @__PURE__ */ new Map();
async function put(name, value) {
  const text = JSON.stringify(value);
  const sealed = await vaultSeal(name, text);
  if (sealed.ok) {
    memoryOnly.delete(name);
    return { ok: true, rest: "vault", message: "sealed in your encrypted vault (AES-256-GCM) \u2014 it is never written in plaintext" };
  }
  memoryOnly.set(name, text);
  return {
    ok: true,
    rest: "memory-only",
    message: "the vault is locked, so this lives in memory for this session only and is forgotten when you close the app"
  };
}
async function take(name) {
  const opened = await vaultDecrypt(name);
  if (opened.found && !opened.locked) {
    try {
      return { ok: true, value: JSON.parse(opened.text), rest: "vault", message: "unsealed from your encrypted vault" };
    } catch {
      return { ok: false, value: null, rest: "vault", message: "the sealed record was unreadable \u2014 sign in again" };
    }
  }
  if (opened.found && opened.locked) {
    return { ok: false, value: null, rest: "vault", message: "a sealed credential is in your vault \u2014 unlock it in Settings to use it" };
  }
  const mem = memoryOnly.get(name);
  if (mem !== void 0) {
    try {
      return { ok: true, value: JSON.parse(mem), rest: "memory-only", message: "from memory \u2014 this session only" };
    } catch {
      return { ok: false, value: null, rest: "memory-only", message: "the session record was unreadable \u2014 sign in again" };
    }
  }
  return { ok: false, value: null, rest: "memory-only", message: "nothing stored" };
}
async function saveGoogleCredentials(tokens, identity, client) {
  const t = await put(GOOGLE_TOKENS_STORE, tokens);
  await put(GOOGLE_CLIENT_STORE, client);
  if (identity) await put(GOOGLE_IDENTITY_STORE, identity);
  return { rest: t.rest, message: t.message };
}
async function loadGoogleTokens() {
  return take(GOOGLE_TOKENS_STORE);
}
async function loadGoogleClient() {
  return take(GOOGLE_CLIENT_STORE);
}
async function saveOpenAIKey(key) {
  return put(OPENAI_KEY_STORE, key);
}
async function usableGoogleTokens(refresh) {
  const stored = await loadGoogleTokens();
  if (!stored.ok || !stored.value) return null;
  if (isAccessTokenUsable(stored.value)) return { tokens: stored.value, refreshed: false };
  const next = await refresh(stored.value);
  if (!next.ok) return null;
  const client = await loadGoogleClient();
  await saveGoogleCredentials(next.tokens, null, client.value ?? { clientId: "", redirectUri: "" });
  return { tokens: next.tokens, refreshed: true };
}
function clearMemoryOnlyCredentials() {
  memoryOnly.clear();
}

// src/security/guardrail.ts
var RateGate = class {
  constructor(limit, windowMs, now = () => Date.now()) {
    this.limit = limit;
    this.windowMs = windowMs;
    this.now = now;
  }
  hits = /* @__PURE__ */ new Map();
  /** Returns true when the action is within budget (and records it). */
  check(key) {
    const t = this.now();
    const arr = (this.hits.get(key) ?? []).filter((x) => t - x < this.windowMs);
    if (arr.length >= this.limit) {
      this.hits.set(key, arr);
      return false;
    }
    arr.push(t);
    this.hits.set(key, arr);
    return true;
  }
};
var callRateGate = new RateGate(120, 6e4);

// src/auth/authStatus.ts
var EMPTY_AUTH_STATE = {
  google: { connected: false, hasApiCredential: false, planOnly: false },
  openai: { connected: false, hasApiKey: false, planOnly: false },
  antigravity: {
    enabled: false,
    hasRuntime: false,
    signedIn: false,
    message: "Antigravity is an optional local provider runtime. Turn it on to look for one on this machine."
  },
  modelAccess: "none",
  canExecute: false
};
function deriveAuthState(facts) {
  const hasGemini = facts.googleCredential === "oauth" || facts.googleCredential === "api-key";
  const hasOpenai = facts.openaiApiKey === true;
  const google = {
    connected: facts.googleConnected,
    email: facts.googleEmail,
    name: facts.googleName,
    hasApiCredential: hasGemini,
    credentialKind: hasGemini ? facts.googleCredential : void 0,
    /* signed in, real account, but nothing that can bill a call */
    planOnly: facts.googleConnected && !hasGemini,
    needsReauth: facts.googleNeedsReauth
  };
  const openai = {
    connected: facts.openaiConnected,
    hasApiKey: hasOpenai,
    keyKind: hasOpenai ? "api-key" : void 0,
    planOnly: facts.openaiConnected && !hasOpenai
  };
  const agy = facts.antigravity;
  const agySignedIn = !!agy && agy.presence === "present" && agy.signIn === "signed-in";
  const antigravity = {
    enabled: !!agy?.enabled,
    hasRuntime: !!agy && agy.presence === "present",
    signedIn: agySignedIn,
    accountEmail: agySignedIn ? agy.accountEmail : void 0,
    plan: agySignedIn ? agy.plan : void 0,
    remaining: agySignedIn ? agy.remaining : void 0,
    message: agy?.message ?? EMPTY_AUTH_STATE.antigravity.message
  };
  const hasAny = hasGemini || hasOpenai || agySignedIn;
  const modelAccess = hasGemini && hasOpenai ? "both" : hasGemini ? "gemini" : hasOpenai ? "openai" : agySignedIn ? "antigravity" : "none";
  const canExecute = hasAny;
  return { google, openai, antigravity, modelAccess, canExecute };
}
function assertHonest(state) {
  if (state.canExecute && state.modelAccess === "none") {
    return "canExecute is true with no model credential \u2014 identity was treated as capability";
  }
  if (!state.canExecute && state.modelAccess !== "none") {
    return "a model credential exists but canExecute is false \u2014 the status under-reports a working credential";
  }
  if (state.canExecute && !state.google.hasApiCredential && !state.openai.hasApiKey && !state.antigravity.signedIn) {
    return "canExecute is true with no credential on any provider \u2014 identity was treated as capability";
  }
  if (state.google.planOnly && state.google.hasApiCredential) {
    return "google is marked plan-only while holding an API credential";
  }
  if (state.openai.planOnly && state.openai.hasApiKey) {
    return "openai is marked plan-only while holding an API key";
  }
  if (state.canExecute && !state.google.hasApiCredential && !state.openai.hasApiKey && !state.antigravity.signedIn) {
    return "canExecute is true with no credential and no signed-in Antigravity runtime \u2014 something was treated as capability that is not";
  }
  if (state.antigravity.signedIn && !state.antigravity.hasRuntime) {
    return "antigravity is signed in but no runtime was ever found \u2014 entitlement was claimed without a runtime";
  }
  if (state.antigravity.signedIn && !state.antigravity.enabled) {
    return "antigravity reports signed-in while the owner has it switched off";
  }
  if (state.modelAccess === "antigravity" && state.antigravity.signedIn === false) {
    return "model access claims antigravity while no account is signed in";
  }
  return null;
}
function describeAccess(state) {
  if (state.canExecute) {
    const which = state.modelAccess === "both" ? "Gemini and OpenAI" : state.modelAccess === "gemini" ? "Gemini" : state.modelAccess === "openai" ? "OpenAI" : "a local Antigravity runtime";
    if (state.modelAccess === "antigravity") {
      const who = state.antigravity.accountEmail ? ` (${state.antigravity.accountEmail})` : "";
      return `Model access: your own Antigravity runtime${who}. Missions run through it on this machine, using the Google plan you are signed in to there.`;
    }
    return `Model access: ${which}. Signed-in accounts can bill real API calls.`;
  }
  if (state.antigravity.hasRuntime && !state.antigravity.signedIn) {
    return state.antigravity.message;
  }
  if (state.google.planOnly || state.openai.planOnly) {
    const alsoOff = state.antigravity.enabled ? " You can also turn on Antigravity, if you have Google's Antigravity app installed and signed in on this machine." : "";
    return "Signed in, but no model access. A consumer subscription (Google One AI Pro / Gemini / ChatGPT Plus-Go) is a web-product plan \u2014 it does not include API access. Add an API key, or an OAuth client whose Cloud project has the Generative Language API enabled." + alsoOff;
  }
  return "No model access. Sign in and/or add an API credential before anything can execute.";
}
function statusBadge(state) {
  if (state.canExecute) {
    if (state.modelAccess === "antigravity") return { label: "Local runtime signed in", tone: "ok" };
    return { label: "Model access ready", tone: "ok" };
  }
  if (state.antigravity.hasRuntime) return { label: "Runtime found \xB7 sign in there", tone: "warn" };
  if (state.google.planOnly || state.openai.planOnly) return { label: "Signed in \xB7 no model access", tone: "warn" };
  return { label: "Not connected", tone: "idle" };
}

// probe/oauth.test.ts
var passed = 0;
var failed = 0;
var failures = [];
function ok(label, cond, detail = "") {
  if (cond) {
    passed++;
    console.log(`  ok   ${label}`);
  } else {
    failed++;
    failures.push(`${label}${detail ? ` \u2014 ${detail}` : ""}`);
    console.log(`  FAIL ${label}${detail ? ` \u2014 ${detail}` : ""}`);
  }
}
var MemStore = class {
  m = /* @__PURE__ */ new Map();
  get length() {
    return this.m.size;
  }
  clear() {
    this.m.clear();
  }
  getItem(k) {
    return this.m.has(k) ? this.m.get(k) : null;
  }
  key(i) {
    return Array.from(this.m.keys())[i] ?? null;
  }
  removeItem(k) {
    this.m.delete(k);
  }
  setItem(k, v) {
    this.m.set(k, v);
  }
  /** every byte ever written, for the leak assertion */
  dump() {
    return Array.from(this.m.values()).join("\n");
  }
};
var store = new MemStore();
globalThis.localStorage = store;
var nodeS256 = (verifier) => createHash("sha256").update(verifier, "ascii").digest("base64url");
console.log("== 1. PKCE is RFC 7636 correct, proved against node:crypto ==");
{
  const RFC_VERIFIER = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
  const RFC_CHALLENGE = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";
  const ours = await computeCodeChallenge(RFC_VERIFIER);
  ok("S256 matches the RFC 7636 Appendix B published vector", ours === RFC_CHALLENGE, `got ${ours}`);
  ok("S256 matches node:crypto on the same vector", ours === nodeS256(RFC_VERIFIER));
  let allMatch = true;
  let shapeOk = true;
  let methodOk = true;
  const sample = await createPkcePair();
  for (let i = 0; i < 200; i++) {
    const p = await createPkcePair();
    if (nodeS256(p.verifier) !== p.challenge) allMatch = false;
    if (!isValidCodeVerifier(p.verifier)) shapeOk = false;
    if (p.challenge.length !== 43) shapeOk = false;
    if (p.method !== "S256") methodOk = false;
  }
  ok("200 random pairs: SHA256(verifier)===challenge, cross-checked with node:crypto", allMatch);
  ok("200 random verifiers are 43..128 unreserved chars; challenges are 43 chars", shapeOk);
  ok("the challenge method is always S256 \u2014 never `plain`", methodOk && CODE_CHALLENGE_METHOD === "S256");
  console.log(`     vector: verifier ${sample.verifier}`);
  console.log(`             challenge ${sample.challenge}  (node: ${nodeS256(sample.verifier)})`);
  ok("a too-short verifier is refused, not silently accepted", !isValidCodeVerifier("tooshort"));
  ok("an out-of-charset verifier is refused", !isValidCodeVerifier("a".repeat(42) + "+"));
  let threw = false;
  try {
    await computeCodeChallenge("nope");
  } catch {
    threw = true;
  }
  ok("computing a challenge from an invalid verifier throws", threw);
  const seen = /* @__PURE__ */ new Set();
  for (let i = 0; i < 1e3; i++) seen.add(createCodeVerifier());
  ok("1000 verifiers are all distinct", seen.size === 1e3);
}
console.log("== 2. state is a CSPRNG and is compared in constant time ==");
{
  const states = /* @__PURE__ */ new Set();
  for (let i = 0; i < 5e3; i++) states.add(createState());
  ok("5000 states are all distinct", states.size === 5e3);
  ok("state is 22 base64url chars (16 CSPRNG bytes)", createState().length === 22);
  ok("state uses the base64url alphabet only", /^[A-Za-z0-9_-]+$/.test(createState()));
  const real = Math.random;
  let touched = false;
  Math.random = () => {
    touched = true;
    throw new Error("Math.random is not a CSPRNG");
  };
  try {
    const p = await createPkcePair();
    const s = createState();
    ok("PKCE + state still mint with Math.random poisoned (CSPRNG only)", p.verifier.length === 43 && s.length === 22 && !touched);
  } finally {
    Math.random = real;
  }
  const good = createState();
  ok("an identical state matches", stateMatches(good, good));
  ok("a one-character change does NOT match", !stateMatches(good, `${good.slice(0, -1)}${good.slice(-1) === "a" ? "b" : "a"}`));
  ok("a prefix does NOT match (no truncation leniency)", !stateMatches(good, good.slice(0, -1)));
  ok("an absent state never matches", !stateMatches(good, null) && !stateMatches(good, void 0) && !stateMatches(good, ""));
  ok("constantTimeEqual rejects non-strings", !constantTimeEqual(null, "x"));
}
console.log("== 3. the authorization flow: URL, callback, state, exchange ==");
{
  const client = { clientId: "123.apps.googleusercontent.com", clientSecret: "GOCSPX-super-secret-client-secret", redirectUri: "http://127.0.0.1:8765/oauth2callback" };
  const started = await beginGoogleAuthorization(client);
  const u = new URL(started.url);
  ok("the authorize URL is Google's documented endpoint", u.origin + u.pathname === GOOGLE_AUTHORIZE_ENDPOINT);
  ok("response_type=code", u.searchParams.get("response_type") === "code");
  ok("client_id is the pasted one", u.searchParams.get("client_id") === client.clientId);
  ok("redirect_uri is passed through", u.searchParams.get("redirect_uri") === client.redirectUri);
  ok("code_challenge_method=S256", u.searchParams.get("code_challenge_method") === "S256");
  ok("the challenge in the URL is S256 of the verifier", u.searchParams.get("code_challenge") === nodeS256(started.pkce.verifier));
  ok("the verifier itself is NOT in the URL", !started.url.includes(started.pkce.verifier));
  ok("state is present and matches the returned state", u.searchParams.get("state") === started.state);
  ok("access_type=offline is requested (so a refresh token comes back)", u.searchParams.get("access_type") === "offline");
  ok("the Gemini API scope is requested", (u.searchParams.get("scope") ?? "").includes("generative-language"));
  ok("identity scopes are requested", (u.searchParams.get("scope") ?? "").includes("openid") && (u.searchParams.get("scope") ?? "").includes("email"));
  const errOf = (r) => r.error;
  const good = parseAuthorizationCallback(`http://127.0.0.1:8765/oauth2callback?code=4/abc&state=${encodeURIComponent(started.state)}`, started.state);
  ok("a valid callback yields the code", good.kind === "code");
  const declined = parseAuthorizationCallback("http://127.0.0.1:8765/oauth2callback?error=access_denied&error_description=User+declined", started.state);
  ok("declined consent is its own outcome, and retryable", declined.kind === "error" && errOf(declined).kind === "consent-declined" && errOf(declined).retryable);
  const cancelled = parseAuthorizationCallback("http://127.0.0.1:8765/oauth2callback", started.state);
  ok("a redirect with no code and no error reads as CANCELLED, retryable", cancelled.kind === "error" && errOf(cancelled).kind === "cancelled" && errOf(cancelled).retryable);
  const hijacked = parseAuthorizationCallback(`http://127.0.0.1:8765/oauth2callback?code=4/abc&state=${createState()}`, started.state);
  ok("a HIJACKED state is refused and is NOT retryable", hijacked.kind === "error" && errOf(hijacked).kind === "state-mismatch" && !errOf(hijacked).retryable);
  const noState = parseAuthorizationCallback("http://127.0.0.1:8765/oauth2callback?code=4/abc", started.state);
  ok("a MISSING state is refused (the CSRF check is not optional)", noState.kind === "error");
  const msgs = new Set([declined, cancelled, hijacked].map(errOf).map((e) => e.message));
  ok("each failure mode has its OWN distinct human message", msgs.size === 3);
  const ACCESS = "ya29.super-secret-access-token";
  const REFRESH = "1//super-secret-refresh-token";
  const calls = [];
  const mockFetch = async (input, init) => {
    const url = String(input);
    const body = init?.body ? String(init.body) : "";
    calls.push({ url, body });
    if (url === GOOGLE_TOKEN_ENDPOINT) {
      return new Response(JSON.stringify({ access_token: ACCESS, refresh_token: REFRESH, expires_in: 3600, token_type: "Bearer", scope: "openid email profile" }), { status: 200 });
    }
    if (url.includes("userinfo")) {
      return new Response(JSON.stringify({ sub: "1234567890", email: "owner@example.com", email_verified: true, name: "The Owner" }), { status: 200 });
    }
    if (url.includes("generativelanguage")) {
      return new Response(JSON.stringify({ models: [{ name: "models/gemini-2.5-flash" }] }), { status: 200 });
    }
    return new Response("{}", { status: 404 });
  };
  const cbUrl = `http://127.0.0.1:8765/oauth2callback?code=4/abc&state=${encodeURIComponent(started.state)}`;
  const result = await completeGoogleSignIn(cbUrl, client, { fetchImpl: mockFetch });
  ok("the whole return leg succeeds against the documented endpoints", result.ok === true);
  if (result.ok) {
    ok("the access token came back", result.tokens.accessToken === ACCESS);
    ok("a refresh token came back (offline access)", result.tokens.refreshToken === REFRESH);
    ok("expiresAt is computed from expires_in", result.tokens.expiresAt > Date.now() + 3e6);
    ok("who-is-signed-in is fetched for DISPLAY only", result.identity?.email === "owner@example.com");
    ok("MODEL ACCESS is verified by a real API call, not assumed", result.access.granted === true && result.access.model === "gemini-2.5-flash");
    const sent = new URLSearchParams(calls.find((c) => c.url === GOOGLE_TOKEN_ENDPOINT)?.body ?? "");
    ok("the exchange used grant_type=authorization_code (RFC 6749 \xA74.1.3)", sent.get("grant_type") === "authorization_code");
    ok("the exchange carried the PKCE verifier", (sent.get("code_verifier") ?? "").length >= 43);
    ok("the verifier sent is exactly the one minted for this flow", sent.get("code_verifier") === started.pkce.verifier);
    ok("the exchange carried client_id + redirect_uri", sent.get("client_id") === client.clientId && sent.get("redirect_uri") === client.redirectUri);
    ok("the client secret is sent when the desktop client has one", sent.get("client_secret") === client.clientSecret);
    ok("the vault is created for this run", (await setVaultPassphrase("correct horse battery staple")).ok);
    await saveGoogleCredentials(result.tokens, result.identity, client);
    const dump = store.dump();
    ok("NO access token in localStorage", !dump.includes(ACCESS));
    ok("NO refresh token in localStorage", !dump.includes(REFRESH));
    ok("NO OAuth client secret in localStorage", !dump.includes(client.clientSecret));
    ok("NO PKCE verifier in localStorage", !dump.includes(started.pkce.verifier));
    ok("NO email in plaintext storage either", !dump.includes("owner@example.com"));
    ok("the credentials ARE stored, as a sealed si-vault/1 envelope", dump.includes("si-vault/1"));
    const reloaded = await loadGoogleTokens();
    ok("the sealed token set reads back intact", reloaded.ok && reloaded.value?.accessToken === ACCESS);
    ok("it reports being read from the vault, not from memory", reloaded.rest === "vault");
    const KEY = "sk-proj-supersecretkey1234567890";
    await saveOpenAIKey(KEY);
    ok("NO OpenAI API key in localStorage", !store.dump().includes(KEY));
    lockVault();
    const LOCKED_KEY = "sk-proj-anothersecretkey0987654321";
    await saveOpenAIKey(LOCKED_KEY);
    ok("with the vault locked, nothing new is written to storage", !store.dump().includes(LOCKED_KEY));
    ok("a locked vault still reads as LOCKED, not as EMPTY", (await loadGoogleTokens()).ok === false);
    await setVaultPassphrase("correct horse battery staple");
    console.log(`     storage keys written: ${Array.from(store.m.keys()).join(", ")}`);
  }
}
console.log("== 4. the status model: identity is NOT model access ==");
{
  const anonymous = deriveAuthState({ googleConnected: false, openaiConnected: false });
  ok("nothing connected: no model access, cannot execute", anonymous.modelAccess === "none" && anonymous.canExecute === false);
  ok("the empty state is honest", assertHonest(anonymous) === null && assertHonest(EMPTY_AUTH_STATE) === null);
  const subscriber = deriveAuthState({
    googleConnected: true,
    googleEmail: "owner@gmail.com",
    googleName: "The Owner",
    googleCredential: null,
    openaiConnected: false
  });
  ok("a signed-in Google account with NO API credential is connected", subscriber.google.connected === true);
  ok("\u2026and is explicitly PLAN-ONLY", subscriber.google.planOnly === true);
  ok("\u2026and CANNOT execute", subscriber.canExecute === false && subscriber.modelAccess === "none");
  ok("\u2026and has no API credential", subscriber.google.hasApiCredential === false);
  ok("the badge never says plain 'Connected'", statusBadge(subscriber).label === "Signed in \xB7 no model access" && statusBadge(subscriber).tone === "warn");
  ok("the summary says in words that a subscription is not API access", /subscription/i.test(describeAccess(subscriber)) && /does not include API access/i.test(describeAccess(subscriber)));
  const chatgptIdentityOnly = deriveAuthState({ googleConnected: false, openaiConnected: true });
  ok("a ChatGPT-style identity with no API key cannot execute", chatgptIdentityOnly.openai.planOnly === true && chatgptIdentityOnly.canExecute === false);
  const withGeminiKey = deriveAuthState({ googleConnected: true, googleEmail: "owner@gmail.com", googleCredential: "api-key", openaiConnected: false });
  ok("a Gemini API key grants model access", withGeminiKey.canExecute === true && withGeminiKey.modelAccess === "gemini");
  ok("\u2026and it is no longer plan-only", withGeminiKey.google.planOnly === false);
  ok("the badge says model access is ready", statusBadge(withGeminiKey).label === "Model access ready");
  const withOAuth = deriveAuthState({ googleConnected: true, googleCredential: "oauth", openaiConnected: false });
  ok("a verified OAuth credential grants model access", withOAuth.canExecute === true && withOAuth.google.credentialKind === "oauth");
  const both = deriveAuthState({ googleConnected: true, googleCredential: "oauth", openaiConnected: true, openaiApiKey: true });
  ok("both credentials \u2192 modelAccess 'both'", both.canExecute === true && both.modelAccess === "both");
  const matrix = [
    [false, null, false, false],
    [true, null, true, false],
    [true, "oauth", false, true],
    [true, "api-key", true, true],
    [false, null, true, true],
    [true, "oauth", true, true]
  ];
  let honest = true;
  let derivationLocked = true;
  for (const [gc, cred, oc, key] of matrix) {
    const s = deriveAuthState({ googleConnected: gc, googleCredential: cred, openaiConnected: oc, openaiApiKey: key });
    if (assertHonest(s) !== null) honest = false;
    const hasCred = cred === "oauth" || cred === "api-key" || key === true;
    if (s.canExecute !== hasCred) derivationLocked = false;
  }
  ok("every state in the matrix satisfies the honesty invariant", honest);
  ok("canExecute === (a model credential exists), for every row", derivationLocked);
  ok("a forged canExecute:true / no-credential state IS caught", assertHonest({ ...anonymous, canExecute: true }) !== null);
  ok("a forged planOnly-with-credential state IS caught", assertHonest({ ...withGeminiKey, google: { ...withGeminiKey.google, planOnly: true } }) !== null);
}
console.log("== 5. an expired token is RE-EXCHANGED, never reused ==");
{
  const expired = { accessToken: "ya29.EXPIRED", refreshToken: "1//refresh-still-good", expiresAt: Date.now() - 6e4, tokenType: "Bearer" };
  ok("an expired token is reported unusable", isAccessTokenUsable(expired) === false);
  ok("a live token is reported usable", isAccessTokenUsable({ ...expired, expiresAt: Date.now() + 36e5 }) === true);
  ok("a missing token is unusable", isAccessTokenUsable(null) === false && isAccessTokenUsable(void 0) === false);
  let sentBody = "";
  const refreshFetch = async (_i, init) => {
    sentBody = String(init?.body ?? "");
    return new Response(JSON.stringify({ access_token: "ya29.FRESH-after-refresh", expires_in: 3600, token_type: "Bearer" }), { status: 200 });
  };
  const client = { clientId: "123.apps.googleusercontent.com", redirectUri: "http://127.0.0.1:8765/oauth2callback" };
  const refreshed = await refreshAccessToken(expired, client, refreshFetch);
  ok("the refresh path succeeds", refreshed.ok === true);
  if (refreshed.ok) {
    ok("it returns a NEW access token, not the expired one", refreshed.tokens.accessToken === "ya29.FRESH-after-refresh" && refreshed.tokens.accessToken !== expired.accessToken);
    ok("the expired token is not reused anywhere in the result", !JSON.stringify(refreshed.tokens).includes("ya29.EXPIRED"));
    ok("the still-valid refresh token is preserved when Google omits one", refreshed.tokens.refreshToken === expired.refreshToken);
    ok("the new expiry is in the future", refreshed.tokens.expiresAt > Date.now());
  }
  const sent = new URLSearchParams(sentBody);
  ok("the refresh used grant_type=refresh_token", sent.get("grant_type") === "refresh_token");
  ok("the refresh sent the refresh token, never the expired access token", sent.get("refresh_token") === expired.refreshToken && !sentBody.includes("ya29.EXPIRED"));
  const noRefresh = await refreshAccessToken({ ...expired, refreshToken: void 0 }, client, refreshFetch);
  ok("with no refresh token, the path refuses and asks for a new sign-in", noRefresh.ok === false && !noRefresh.ok && noRefresh.error.kind === "invalid-grant");
  await saveGoogleCredentials(expired, { sub: "1", email: "owner@example.com" }, client);
  let refreshCalls = 0;
  const viaStore = await usableGoogleTokens(async (t) => {
    refreshCalls++;
    return refreshAccessToken(t, client, refreshFetch);
  });
  ok("the store re-exchanges an expired token instead of returning it", viaStore?.refreshed === true && refreshCalls === 1);
  ok("\u2026and hands back the fresh one", viaStore?.tokens.accessToken === "ya29.FRESH-after-refresh");
  const stillGood = await usableGoogleTokens(async () => {
    refreshCalls++;
    return { ok: false };
  });
  ok("a still-valid token is returned WITHOUT a refresh call", stillGood?.refreshed === false && refreshCalls === 1);
}
console.log("== 6. the API-key path: validated, and never echoed back ==");
{
  const KEY = "sk-proj-abcdefghijklmnopqrstuvwxyz012345";
  ok("a well-formed sk- key is recognised", looksLikeOpenAIKey(KEY));
  ok("a ChatGPT session token shape is NOT accepted as an API key", !looksLikeOpenAIKey("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9"));
  ok("a bare word is refused", !looksLikeOpenAIKey("my-chatgpt-password"));
  let seenAuth = "";
  const goodFetch = async (_i, init) => {
    seenAuth = String(init?.headers?.Authorization ?? "");
    return new Response(JSON.stringify({ data: [{ id: "gpt-4.1" }, { id: "gpt-4.1-mini" }] }), { status: 200 });
  };
  const validated = await validateOpenAIKey(KEY, { fetchImpl: goodFetch });
  ok("a live key validates against the cheap models call", validated.ok === true);
  ok("the check is exactly one Bearer request", seenAuth === `Bearer ${KEY}`);
  if (validated.ok) {
    ok("it returns a usable provider config", validated.config.kind === "openai-compatible" && validated.config.apiKey === KEY);
    ok("it reports how many models the key can reach", validated.modelCount === 2);
  }
  const errMsg = (r) => r.error.message;
  const unauthorized = await validateOpenAIKey(KEY, { fetchImpl: async () => new Response("{}", { status: 401 }) });
  ok("HTTP 401 is refused and says nothing was stored", !unauthorized.ok && /nothing was stored/i.test(errMsg(unauthorized)));
  const forbidden = await validateOpenAIKey(KEY, { fetchImpl: async () => new Response("{}", { status: 403 }) });
  ok("HTTP 403 (usually missing billing) is refused", !forbidden.ok);
  const emptyList = await validateOpenAIKey(KEY, { fetchImpl: async () => new Response(JSON.stringify({ data: [] }), { status: 200 }) });
  ok("a key that reaches OpenAI but sees no models is refused", !emptyList.ok);
  const netDown = await validateOpenAIKey(KEY, { fetchImpl: async () => {
    throw new Error("ENOTFOUND api.openai.com");
  } });
  ok("a network failure is typed as network and retryable", !netDown.ok && netDown.error.kind === "network" && netDown.error.retryable);
  const badShape = await validateOpenAIKey("hunter2");
  ok("a malformed key is refused, naming the ChatGPT-subscription truth", !badShape.ok && /ChatGPT subscription does not provide/i.test(errMsg(badShape)));
  ok("an empty key is refused", !(await validateOpenAIKey("")).ok);
  ok("maskKey never returns the body of the key", !maskKey(KEY).includes("abcdefghij"));
  ok("maskKey reveals only a prefix, a length and the last 2", maskKey(KEY).startsWith("sk-") && maskKey(KEY).includes(`${KEY.length} chars`) && !maskKey(KEY).includes(KEY));
  ok("a short key is fully masked", !maskKey("sk-abc").includes("abc"));
  const GKEY = "AIzaSyA1234567890abcdefghijklmnopqrstuv";
  const gOk = await validateGeminiApiKey(GKEY, { fetchImpl: async () => new Response(JSON.stringify({ models: [{ name: "models/gemini-2.5-flash" }] }), { status: 200 }) });
  ok("a Gemini API key validates and yields a gemini provider config", gOk.ok === true && (!gOk.ok || gOk.config.kind === "gemini"));
  ok("a malformed Gemini key is refused", !(await validateGeminiApiKey("AIza-not-long-enough")).ok);
  const gDenied = await validateGeminiApiKey(GKEY, {
    fetchImpl: async () => new Response(JSON.stringify({ error: { status: "PERMISSION_DENIED" } }), { status: 403 })
  });
  ok("PERMISSION_DENIED names the API-not-enabled cause in words", !gDenied.ok && !gDenied.ok && /not enabled/i.test(gDenied.error.message));
}
clearMemoryOnlyCredentials();
resetPendingGoogleRequest();
console.log(`
${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log("\nfailures:");
  for (const f of failures) console.log(`  - ${f}`);
}
process.exit(failed > 0 ? 1 : 0);
