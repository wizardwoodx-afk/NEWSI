/**
 * probe/oauth.test.ts — the OAuth / identity-vs-model-access seam.
 *
 * This suite exists to pin four things that are easy to get quietly wrong:
 *
 *   §1 PKCE is RFC 7636 correct. S256(verifier) === challenge, proved against
 *      Node's OWN crypto (and against the RFC's published Appendix B vector),
 *      the verifier shape is 43–128 unreserved chars, and the challenge method
 *      is S256 — never `plain`, because a downgrade is what PKCE prevents.
 *   §2 `state` is CSPRNG, not Math.random, and is compared in constant time.
 *      Poisoning Math.random must not break a mint, and a single-character
 *      change must fail the comparison.
 *   §3 Credentials NEVER reach plain storage. After a full mocked OAuth
 *      exchange + a real vault seal, no access token, refresh token, client
 *      secret or API key appears anywhere in localStorage.
 *   §4 The status model is honest: `canExecute` cannot be true without a real
 *      model credential — a signed-in Google subscriber with no API credential
 *      is PLAN-ONLY and cannot execute — and an expired token is RE-EXCHANGED,
 *      never reused.
 */
import { createHash } from "node:crypto";
import {
  createPkcePair,
  computeCodeChallenge,
  createCodeVerifier,
  createState,
  stateMatches,
  constantTimeEqual,
  isValidCodeVerifier,
  CODE_CHALLENGE_METHOD,
} from "../src/auth/pkce";
import {
  beginGoogleAuthorization,
  parseAuthorizationCallback,
  completeGoogleSignIn,
  refreshAccessToken,
  isAccessTokenUsable,
  resetPendingGoogleRequest,
  GOOGLE_AUTHORIZE_ENDPOINT,
  GOOGLE_TOKEN_ENDPOINT,
  type GoogleTokenSet,
} from "../src/auth/googleOAuth";
import { validateOpenAIKey, validateGeminiApiKey, looksLikeOpenAIKey, maskKey } from "../src/auth/openaiKey";
import {
  saveGoogleCredentials,
  loadGoogleTokens,
  saveOpenAIKey,
  usableGoogleTokens,
  clearMemoryOnlyCredentials,
} from "../src/auth/credentialStore";
import { deriveAuthState, assertHonest, statusBadge, describeAccess, EMPTY_AUTH_STATE } from "../src/auth/authStatus";
import { setVaultPassphrase, lockVault } from "../src/engine/vault";

let passed = 0;
let failed = 0;
const failures: string[] = [];
function ok(label: string, cond: boolean, detail = ""): void {
  if (cond) { passed++; console.log(`  ok   ${label}`); }
  else { failed++; failures.push(`${label}${detail ? ` — ${detail}` : ""}`); console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`); }
}

/* a functioning localStorage so the vault + credential store have somewhere
   to write — and so "nothing leaked" is a real assertion, not a vacuous one */
class MemStore implements Storage {
  private m = new Map<string, string>();
  get length() { return this.m.size; }
  clear() { this.m.clear(); }
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null; }
  key(i: number) { return Array.from(this.m.keys())[i] ?? null; }
  removeItem(k: string) { this.m.delete(k); }
  setItem(k: string, v: string) { this.m.set(k, v); }
  /** every byte ever written, for the leak assertion */
  dump(): string { return Array.from(this.m.values()).join("\n"); }
}
const store = new MemStore();
(globalThis as { localStorage?: Storage }).localStorage = store;

const nodeS256 = (verifier: string) => createHash("sha256").update(verifier, "ascii").digest("base64url");

console.log("== 1. PKCE is RFC 7636 correct, proved against node:crypto ==");
{
  // The RFC's own published vector (RFC 7636 Appendix B). If this matches,
  // our S256 is not merely self-consistent — it is the specified transform.
  const RFC_VERIFIER = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
  const RFC_CHALLENGE = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";
  const ours = await computeCodeChallenge(RFC_VERIFIER);
  ok("S256 matches the RFC 7636 Appendix B published vector", ours === RFC_CHALLENGE, `got ${ours}`);
  ok("S256 matches node:crypto on the same vector", ours === nodeS256(RFC_VERIFIER));

  // 200 random pairs: ours vs Node, every single one.
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
  ok("the challenge method is always S256 — never `plain`", methodOk && CODE_CHALLENGE_METHOD === "S256");

  console.log(`     vector: verifier ${sample.verifier}`);
  console.log(`             challenge ${sample.challenge}  (node: ${nodeS256(sample.verifier)})`);

  ok("a too-short verifier is refused, not silently accepted", !isValidCodeVerifier("tooshort"));
  ok("an out-of-charset verifier is refused", !isValidCodeVerifier("a".repeat(42) + "+"));
  let threw = false;
  try { await computeCodeChallenge("nope"); } catch { threw = true; }
  ok("computing a challenge from an invalid verifier throws", threw);

  // The verifier must be unguessable and unique.
  const seen = new Set<string>();
  for (let i = 0; i < 1000; i++) seen.add(createCodeVerifier());
  ok("1000 verifiers are all distinct", seen.size === 1000);
}

console.log("== 2. state is a CSPRNG and is compared in constant time ==");
{
  const states = new Set<string>();
  for (let i = 0; i < 5000; i++) states.add(createState());
  ok("5000 states are all distinct", states.size === 5000);
  ok("state is 22 base64url chars (16 CSPRNG bytes)", createState().length === 22);
  ok("state uses the base64url alphabet only", /^[A-Za-z0-9_-]+$/.test(createState()));

  // The decisive test: poison Math.random. If ANY code path consulted it,
  // minting would throw. It must not.
  const real = Math.random;
  let touched = false;
  (Math as unknown as { random: () => number }).random = () => { touched = true; throw new Error("Math.random is not a CSPRNG"); };
  try {
    const p = await createPkcePair();
    const s = createState();
    ok("PKCE + state still mint with Math.random poisoned (CSPRNG only)", p.verifier.length === 43 && s.length === 22 && !touched);
  } finally {
    (Math as unknown as { random: () => number }).random = real;
  }

  const good = createState();
  ok("an identical state matches", stateMatches(good, good));
  ok("a one-character change does NOT match", !stateMatches(good, `${good.slice(0, -1)}${good.slice(-1) === "a" ? "b" : "a"}`));
  ok("a prefix does NOT match (no truncation leniency)", !stateMatches(good, good.slice(0, -1)));
  ok("an absent state never matches", !stateMatches(good, null) && !stateMatches(good, undefined) && !stateMatches(good, ""));
  ok("constantTimeEqual rejects non-strings", !constantTimeEqual(null as unknown as string, "x"));
}

console.log("== 3. the authorization flow: URL, callback, state, exchange ==");
{
  const client = { clientId: "123.apps.googleusercontent.com", clientSecret: "GOCSPX-super-secret-client-secret", redirectUri: "http://127.0.0.1:8765/oauth2callback" };

  /* --- the authorization URL carries everything a native client needs --- */
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

  /* --- the callback: each failure gets its own typed, distinct answer --- */
  const errOf = (r: { kind: string }) => (r as unknown as { error: { kind: string; retryable: boolean; message: string } }).error;

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

  /* --- the full return leg, against a mocked network --- */
  const ACCESS = "ya29.super-secret-access-token";
  const REFRESH = "1//super-secret-refresh-token";
  const calls: Array<{ url: string; body: string }> = [];
  const mockFetch: typeof fetch = async (input, init) => {
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
    ok("expiresAt is computed from expires_in", result.tokens.expiresAt > Date.now() + 3_000_000);
    ok("who-is-signed-in is fetched for DISPLAY only", result.identity?.email === "owner@example.com");
    ok("MODEL ACCESS is verified by a real API call, not assumed", result.access.granted === true && result.access.model === "gemini-2.5-flash");

    const sent = new URLSearchParams(calls.find((c) => c.url === GOOGLE_TOKEN_ENDPOINT)?.body ?? "");
    ok("the exchange used grant_type=authorization_code (RFC 6749 §4.1.3)", sent.get("grant_type") === "authorization_code");
    ok("the exchange carried the PKCE verifier", (sent.get("code_verifier") ?? "").length >= 43);
    ok("the verifier sent is exactly the one minted for this flow", sent.get("code_verifier") === started.pkce.verifier);
    ok("the exchange carried client_id + redirect_uri", sent.get("client_id") === client.clientId && sent.get("redirect_uri") === client.redirectUri);
    ok("the client secret is sent when the desktop client has one", sent.get("client_secret") === client.clientSecret);

    /* ---- the storage assertion: nothing secret in plaintext, ever ---- */
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

    /* A LOCKED vault must degrade to memory, never to plaintext. */
    lockVault();
    const LOCKED_KEY = "sk-proj-anothersecretkey0987654321";
    await saveOpenAIKey(LOCKED_KEY);
    ok("with the vault locked, nothing new is written to storage", !store.dump().includes(LOCKED_KEY));
    ok("a locked vault still reads as LOCKED, not as EMPTY", (await loadGoogleTokens()).ok === false);
    await setVaultPassphrase("correct horse battery staple");
    console.log(`     storage keys written: ${Array.from((store as unknown as { m: Map<string, string> }).m.keys()).join(", ")}`);
  }
}

console.log("== 4. the status model: identity is NOT model access ==");
{
  const anonymous = deriveAuthState({ googleConnected: false, openaiConnected: false });
  ok("nothing connected: no model access, cannot execute", anonymous.modelAccess === "none" && anonymous.canExecute === false);
  ok("the empty state is honest", assertHonest(anonymous) === null && assertHonest(EMPTY_AUTH_STATE) === null);

  /* THE central case: a real, signed-in Google subscriber with a real email
     and NO API credential. This is what a Google One AI Pro / Gemini Pro
     subscriber actually is. They are connected — and they cannot execute. */
  const subscriber = deriveAuthState({
    googleConnected: true,
    googleEmail: "owner@gmail.com",
    googleName: "The Owner",
    googleCredential: null,
    openaiConnected: false,
  });
  ok("a signed-in Google account with NO API credential is connected", subscriber.google.connected === true);
  ok("…and is explicitly PLAN-ONLY", subscriber.google.planOnly === true);
  ok("…and CANNOT execute", subscriber.canExecute === false && subscriber.modelAccess === "none");
  ok("…and has no API credential", subscriber.google.hasApiCredential === false);
  ok("the badge never says plain 'Connected'", statusBadge(subscriber).label === "Signed in · no model access" && statusBadge(subscriber).tone === "warn");
  ok("the summary says in words that a subscription is not API access", /subscription/i.test(describeAccess(subscriber)) && /does not include API access/i.test(describeAccess(subscriber)));

  /* The same story at OpenAI: a ChatGPT identity alone grants nothing. */
  const chatgptIdentityOnly = deriveAuthState({ googleConnected: false, openaiConnected: true });
  ok("a ChatGPT-style identity with no API key cannot execute", chatgptIdentityOnly.openai.planOnly === true && chatgptIdentityOnly.canExecute === false);

  /* Now add REAL credentials — only these flip canExecute. */
  const withGeminiKey = deriveAuthState({ googleConnected: true, googleEmail: "owner@gmail.com", googleCredential: "api-key", openaiConnected: false });
  ok("a Gemini API key grants model access", withGeminiKey.canExecute === true && withGeminiKey.modelAccess === "gemini");
  ok("…and it is no longer plan-only", withGeminiKey.google.planOnly === false);
  ok("the badge says model access is ready", statusBadge(withGeminiKey).label === "Model access ready");

  const withOAuth = deriveAuthState({ googleConnected: true, googleCredential: "oauth", openaiConnected: false });
  ok("a verified OAuth credential grants model access", withOAuth.canExecute === true && withOAuth.google.credentialKind === "oauth");

  const both = deriveAuthState({ googleConnected: true, googleCredential: "oauth", openaiConnected: true, openaiApiKey: true });
  ok("both credentials → modelAccess 'both'", both.canExecute === true && both.modelAccess === "both");

  /* The invariant, as a falsifiable property over a whole matrix. */
  const matrix: Array<[boolean, "oauth" | "api-key" | null, boolean, boolean]> = [
    [false, null, false, false],
    [true, null, true, false],
    [true, "oauth", false, true],
    [true, "api-key", true, true],
    [false, null, true, true],
    [true, "oauth", true, true],
  ];
  let honest = true;
  let derivationLocked = true;
  for (const [gc, cred, oc, key] of matrix) {
    const s = deriveAuthState({ googleConnected: gc, googleCredential: cred, openaiConnected: oc, openaiApiKey: key });
    if (assertHonest(s) !== null) honest = false;
    /* canExecute must equal "a credential exists", for EVERY row */
    const hasCred = cred === "oauth" || cred === "api-key" || key === true;
    if (s.canExecute !== hasCred) derivationLocked = false;
  }
  ok("every state in the matrix satisfies the honesty invariant", honest);
  ok("canExecute === (a model credential exists), for every row", derivationLocked);

  /* The invariant must be able to FAIL — otherwise it proves nothing. */
  ok("a forged canExecute:true / no-credential state IS caught", assertHonest({ ...anonymous, canExecute: true }) !== null);
  ok("a forged planOnly-with-credential state IS caught", assertHonest({ ...withGeminiKey, google: { ...withGeminiKey.google, planOnly: true } }) !== null);
}

console.log("== 5. an expired token is RE-EXCHANGED, never reused ==");
{
  const expired: GoogleTokenSet = { accessToken: "ya29.EXPIRED", refreshToken: "1//refresh-still-good", expiresAt: Date.now() - 60_000, tokenType: "Bearer" };
  ok("an expired token is reported unusable", isAccessTokenUsable(expired) === false);
  ok("a live token is reported usable", isAccessTokenUsable({ ...expired, expiresAt: Date.now() + 3_600_000 }) === true);
  ok("a missing token is unusable", isAccessTokenUsable(null) === false && isAccessTokenUsable(undefined) === false);

  let sentBody = "";
  const refreshFetch: typeof fetch = async (_i, init) => {
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

  /* No refresh token at all ⇒ an honest re-auth, never a silent reuse. */
  const noRefresh = await refreshAccessToken({ ...expired, refreshToken: undefined }, client, refreshFetch);
  ok("with no refresh token, the path refuses and asks for a new sign-in", noRefresh.ok === false && !noRefresh.ok && noRefresh.error.kind === "invalid-grant");

  /* And through the store: an expired sealed token triggers a re-exchange. */
  await saveGoogleCredentials(expired, { sub: "1", email: "owner@example.com" }, client);
  let refreshCalls = 0;
  const viaStore = await usableGoogleTokens(async (t) => {
    refreshCalls++;
    return refreshAccessToken(t, client, refreshFetch);
  });
  ok("the store re-exchanges an expired token instead of returning it", viaStore?.refreshed === true && refreshCalls === 1);
  ok("…and hands back the fresh one", viaStore?.tokens.accessToken === "ya29.FRESH-after-refresh");

  const stillGood = await usableGoogleTokens(async () => { refreshCalls++; return { ok: false } as const; });
  ok("a still-valid token is returned WITHOUT a refresh call", stillGood?.refreshed === false && refreshCalls === 1);
}

console.log("== 6. the API-key path: validated, and never echoed back ==");
{
  const KEY = "sk-proj-abcdefghijklmnopqrstuvwxyz012345";
  ok("a well-formed sk- key is recognised", looksLikeOpenAIKey(KEY));
  ok("a ChatGPT session token shape is NOT accepted as an API key", !looksLikeOpenAIKey("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9"));
  ok("a bare word is refused", !looksLikeOpenAIKey("my-chatgpt-password"));

  let seenAuth = "";
  const goodFetch: typeof fetch = async (_i, init) => {
    seenAuth = String((init?.headers as Record<string, string>)?.Authorization ?? "");
    return new Response(JSON.stringify({ data: [{ id: "gpt-4.1" }, { id: "gpt-4.1-mini" }] }), { status: 200 });
  };
  const validated = await validateOpenAIKey(KEY, { fetchImpl: goodFetch });
  ok("a live key validates against the cheap models call", validated.ok === true);
  ok("the check is exactly one Bearer request", seenAuth === `Bearer ${KEY}`);
  if (validated.ok) {
    ok("it returns a usable provider config", validated.config.kind === "openai-compatible" && validated.config.apiKey === KEY);
    ok("it reports how many models the key can reach", validated.modelCount === 2);
  }

  /* A rejected key must be rejected BEFORE anything is stored, with words. */
  const errMsg = (r: unknown) => (r as { error: { message: string } }).error.message;
  const unauthorized = await validateOpenAIKey(KEY, { fetchImpl: async () => new Response("{}", { status: 401 }) });
  ok("HTTP 401 is refused and says nothing was stored", !unauthorized.ok && /nothing was stored/i.test(errMsg(unauthorized)));
  const forbidden = await validateOpenAIKey(KEY, { fetchImpl: async () => new Response("{}", { status: 403 }) });
  ok("HTTP 403 (usually missing billing) is refused", !forbidden.ok);
  const emptyList = await validateOpenAIKey(KEY, { fetchImpl: async () => new Response(JSON.stringify({ data: [] }), { status: 200 }) });
  ok("a key that reaches OpenAI but sees no models is refused", !emptyList.ok);
  const netDown = await validateOpenAIKey(KEY, { fetchImpl: async () => { throw new Error("ENOTFOUND api.openai.com"); } });
  ok("a network failure is typed as network and retryable", !netDown.ok && (netDown as { error: { kind: string; retryable: boolean } }).error.kind === "network" && (netDown as { error: { retryable: boolean } }).error.retryable);

  const badShape = await validateOpenAIKey("hunter2");
  ok("a malformed key is refused, naming the ChatGPT-subscription truth", !badShape.ok && /ChatGPT subscription does not provide/i.test(errMsg(badShape)));
  ok("an empty key is refused", !(await validateOpenAIKey("")).ok);

  /* The mask is the only way a key is ever displayed. */
  ok("maskKey never returns the body of the key", !maskKey(KEY).includes("abcdefghij"));
  ok("maskKey reveals only a prefix, a length and the last 2", maskKey(KEY).startsWith("sk-") && maskKey(KEY).includes(`${KEY.length} chars`) && !maskKey(KEY).includes(KEY));
  ok("a short key is fully masked", !maskKey("sk-abc").includes("abc"));

  /* The Gemini API key, validated the same honest way. */
  const GKEY = "AIzaSyA1234567890abcdefghijklmnopqrstuv";
  const gOk = await validateGeminiApiKey(GKEY, { fetchImpl: async () => new Response(JSON.stringify({ models: [{ name: "models/gemini-2.5-flash" }] }), { status: 200 }) });
  ok("a Gemini API key validates and yields a gemini provider config", gOk.ok === true && (!gOk.ok || gOk.config.kind === "gemini"));
  ok("a malformed Gemini key is refused", !(await validateGeminiApiKey("AIza-not-long-enough")).ok);
  const gDenied = await validateGeminiApiKey(GKEY, {
    fetchImpl: async () => new Response(JSON.stringify({ error: { status: "PERMISSION_DENIED" } }), { status: 403 }),
  });
  ok("PERMISSION_DENIED names the API-not-enabled cause in words", !gDenied.ok && !gDenied.ok && /not enabled/i.test(gDenied.error.message));
}

clearMemoryOnlyCredentials();
resetPendingGoogleRequest();

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) { console.log("\nfailures:"); for (const f of failures) console.log(`  - ${f}`); }
process.exit(failed > 0 ? 1 : 0);


