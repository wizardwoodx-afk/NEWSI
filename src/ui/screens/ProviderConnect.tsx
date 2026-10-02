import React, { useCallback, useEffect, useState } from "react";
import {
  beginGoogleAuthorization,
  completeGoogleSignIn,
  hasPendingGoogleRequest,
  type AuthError,
  type GoogleOAuthClient,
} from "../../auth/googleOAuth";
import { validateOpenAIKey, validateGeminiApiKey, looksLikeOpenAIKey, maskKey } from "../../auth/openaiKey";
import {
  saveGoogleCredentials,
  saveOpenAIKey,
  saveGeminiApiKey,
  forgetGoogleCredentials,
  forgetOpenAIKey,
  forgetGeminiApiKey,
  vaultIsOpen,
} from "../../auth/credentialStore";
import { readAuthState, describeAccess, statusBadge, assertHonest, type AuthState } from "../../auth/authStatus";
import { runtimeStatus, antigravityOptIn, setAntigravityOptIn, quotaHint, type AntigravityStatus } from "../../auth/antigravity";

/**
 * ProviderConnect — the honest sign-in door.
 *
 * Two rules govern every line of this screen:
 *
 *   1. IDENTITY IS NOT MODEL ACCESS. Signing in with Google proves who you
 *      are. It does not give the app a credential that can bill a model call.
 *      A Google One AI Pro / Gemini / ChatGPT Plus-Go subscription is a plan
 *      for the consumer web app and includes NO API access — so this screen
 *      says so, in words, exactly where the user would otherwise assume
 *      otherwise. The badge reads "Signed in · no model access" and never
 *      "Connected" until `canExecute` is true.
 *   2. NO CREDENTIAL IS EVER ECHOED BACK. Password inputs are cleared on
 *      submit; the saved state shows only a masked hint from `maskKey`. There
 *      is no code path that renders a secret into the DOM.
 *
 * Styling is plain semantic class names (`pc-*`) because another agent owns the
 * design system; this is deliberately unstyled but well-structured.
 */

type Busy = "none" | "google" | "openai" | "gemini" | "antigravity";

interface Notice {
  tone: "ok" | "err";
  text: string;
}

export function ProviderConnect(): React.ReactElement {
  const [state, setState] = useState<AuthState | null>(null);
  const [busy, setBusy] = useState<Busy>("none");
  const [notice, setNotice] = useState<Notice | null>(null);
  const [err, setErr] = useState<AuthError | null>(null);
  const [awaitingCallback, setAwaitingCallback] = useState(hasPendingGoogleRequest());

  /* Google OAuth client — pasted by the owner, type "Desktop app". */
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [redirectUri, setRedirectUri] = useState("http://127.0.0.1:8765/oauth2callback");
  /* API keys — cleared the moment they are accepted. */
  const [geminiKey, setGeminiKey] = useState("");
  const [openaiKey, setOpenaiKey] = useState("");

  /* Antigravity: an optional LOCAL provider, opt-in. There is no key field and
     no sign-in button here, and that absence is the honest design — the owner
     installs and signs into Antigravity themselves, and this app never holds a
     Google credential for it. Turning the toggle on only permits a loopback
     probe of a runtime the owner already started. */
  const [agyOn, setAgyOn] = useState(antigravityOptIn());
  const [agy, setAgy] = useState<AntigravityStatus | null>(null);

  const probeAgy = useCallback(async () => {
    setAgy(await runtimeStatus());
  }, []);

  useEffect(() => {
    if (!agyOn) {
      setAgy(null);
      return;
    }
    void probeAgy();
  }, [agyOn, probeAgy]);

  const toggleAgy = (on: boolean) =>
    run("antigravity", async () => {
      setAntigravityOptIn(on);
      setAgyOn(on);
      if (!on) setAgy(null);
      await refresh();
    });

  const refresh = useCallback(async () => {
    setState(await readAuthState());
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const run = async (which: Busy, fn: () => Promise<void>) => {
    setBusy(which);
    setErr(null);
    setNotice(null);
    try {
      await fn();
    } catch (e) {
      setErr({ kind: "server-error", message: e instanceof Error ? e.message : String(e), retryable: true });
    } finally {
      setBusy("none");
    }
  };

  const currentClient = (): GoogleOAuthClient => ({
    clientId: clientId.trim(),
    clientSecret: clientSecret.trim() || undefined,
    redirectUri: redirectUri.trim(),
  });

  /* When the app comes back from the consent screen, finish the exchange.
     The PKCE verifier lives in module memory, so this survives the webview
     navigation without the verifier ever being written to storage. */
  useEffect(() => {
    if (!awaitingCallback) return;
    const href = typeof globalThis.location !== "undefined" ? globalThis.location.href : "";
    if (!href.includes("code=") && !href.includes("error=")) return;
    void (async () => {
      setBusy("google");
      setErr(null);
      const client = currentClient();
      const result = await completeGoogleSignIn(href, client);
      setBusy("none");
      setAwaitingCallback(false);
      if (!result.ok) {
        setErr(result.error);
        return;
      }
      await saveGoogleCredentials(result.tokens, result.identity, client);
      /* Strip code + state from the address bar so neither is left in history
         or in a screenshot of the URL. */
      try {
        globalThis.history?.replaceState({}, "", globalThis.location.pathname);
      } catch { /* not a browser shell — nothing to strip */ }
      await refresh();
      if (result.access.granted) {
        setNotice({
          tone: "ok",
          text: `Signed in as ${result.identity?.email ?? "a Google account"} — model access verified against the Generative Language API.`,
        });
      } else {
        /* The honest PLAN-ONLY outcome, stated plainly rather than as success. */
        setErr(result.access.error ?? null);
        setNotice({
          tone: "err",
          text: "Signed in, but there is no model access. A Google One / Gemini subscription does not include API access — enable the Generative Language API on your Cloud project, or add an API key below.",
        });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [awaitingCallback]);

  const signInWithGoogle = () =>
    run("google", async () => {
      const started = await beginGoogleAuthorization(currentClient());
      setAwaitingCallback(true);
      /* the system browser owns the consent screen */
      globalThis.open?.(started.url, "_blank", "noopener,noreferrer");
    });

  const saveGemini = () =>
    run("gemini", async () => {
      const checked = await validateGeminiApiKey(geminiKey.trim());
      if (!checked.ok) {
        setErr(checked.error);
        return;
      }
      const r = await saveGeminiApiKey(checked.key);
      setGeminiKey(""); /* never keep a secret in component state */
      setNotice({ tone: "ok", text: `Gemini API key verified (${checked.model}). ${r.message}.` });
      await refresh();
    });

  const saveOpenAI = () =>
    run("openai", async () => {
      const checked = await validateOpenAIKey(openaiKey.trim());
      if (!checked.ok) {
        setErr(checked.error);
        return;
      }
      const r = await saveOpenAIKey(checked.key);
      setOpenaiKey("");
      setNotice({ tone: "ok", text: `OpenAI API key verified — ${checked.modelCount} models reachable. ${r.message}.` });
      await refresh();
    });

  const badge = state ? statusBadge(state) : { label: "Checking…", tone: "idle" as const };
  const pending = busy !== "none";
  const vaultOpen = vaultIsOpen();

  return (
    <section className="pc-root">
      <header className="pc-head">
        <h2>Accounts &amp; model access</h2>
        <p className={`pc-badge pc-badge--${badge.tone}`} role="status">
          {badge.label}
        </p>
      </header>

      {/* the single most important sentence on this screen */}
      <p className="pc-truth" role="note">
        <strong>Signing in is not the same as having model access.</strong> A Google One AI&nbsp;Pro, Gemini&nbsp;Pro or
        ChatGPT Plus/Go subscription pays for the <em>consumer web app</em>. It does not include API access, does not bill the
        Gemini or OpenAI API, and ChatGPT conversation history is not reachable through any API. Model access needs its own
        credential: a Gemini API key, a Google Cloud OAuth client with the Generative Language API enabled, or an OpenAI API key
        with API billing.
      </p>

      {state && (
        <p className="pc-summary" role="status">
          {describeAccess(state)}
        </p>
      )}
      {state && assertHonest(state) && (
        <p className="pc-error" role="alert">
          The status invariant failed ({assertHonest(state)}). Please report this — the app will not execute until it is fixed.
        </p>
      )}

      {!vaultOpen && (
        <p className="pc-warn" role="note">
          The key vault is locked, so anything added now stays in memory for this session only. Create or unlock the vault in
          Settings to have it sealed at rest.
        </p>
      )}

      {/* one live region, announced */}
      {err && (
        <div className="pc-error" role="alert">
          <p>{err.message}</p>
          {err.retryable ? (
            <button type="button" className="pc-btn" onClick={() => setErr(null)} disabled={pending}>
              Dismiss and retry
            </button>
          ) : (
            <p className="pc-error__hint">This one needs a change on your side before retrying will help.</p>
          )}
        </div>
      )}
      {notice && !err && (
        <p className={notice.tone === "ok" ? "pc-ok" : "pc-error"} role="status">
          {notice.text}
        </p>
      )}

      {/* ---- Google: identity ---- */}
      <form
        className="pc-card"
        onSubmit={(e) => {
          e.preventDefault();
          void signInWithGoogle();
        }}
      >
        <h3>Google — sign in (identity)</h3>
        <p className="pc-hint">
          A real Google sign-in over OAuth 2.0 + PKCE. Needs a Google Cloud project with the Generative Language API enabled and
          an OAuth client of type “Desktop app”.
        </p>

        <label className="pc-field" htmlFor="pc-gcid">
          <span>OAuth client ID</span>
          <input
            id="pc-gcid"
            name="clientId"
            className="pc-input"
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            placeholder="1234567890-abc.apps.googleusercontent.com"
            required
          />
        </label>

        <label className="pc-field" htmlFor="pc-gsecret">
          <span>
            Client secret <em>(optional — desktop clients are public; PKCE is what protects the code)</em>
          </span>
          <input
            id="pc-gsecret"
            name="clientSecret"
            className="pc-input"
            type="password"
            value={clientSecret}
            onChange={(e) => setClientSecret(e.target.value)}
            autoComplete="off"
            spellCheck={false}
          />
        </label>

        <label className="pc-field" htmlFor="pc-gredir">
          <span>Redirect URI (must match the client exactly)</span>
          <input
            id="pc-gredir"
            name="redirectUri"
            className="pc-input"
            value={redirectUri}
            onChange={(e) => setRedirectUri(e.target.value)}
            required
          />
        </label>

        <button type="submit" className="pc-btn pc-btn--primary" disabled={pending || !clientId.trim() || !redirectUri.trim()}>
          {busy === "google" ? "Working…" : awaitingCallback ? "Waiting for the redirect…" : "Sign in with Google"}
        </button>
      </form>

      {/* ---- Antigravity: the local-runtime path for a consumer subscription ----
          Deliberately has NO key field and NO sign-in button. Both would be
          lies: there is no key, and sign-in happens inside Google's own app.
          The toggle only permits a loopback probe of a runtime the owner
          already started, and the status line reports what the runtime said. */}
      <section className="pc-card" aria-labelledby="pc-agy-h">
        <h3 id="pc-agy-h">Google AI Pro / Ultra — via Antigravity</h3>
        <p className="pc-note">
          Google moved AI Pro and Ultra subscriptions out of the Gemini CLI into{" "}
          <strong>Antigravity</strong>, its own agent app. If you have Antigravity installed and signed in
          on this machine, SelfImpulse can run missions through it using the plan you are signed in to
          there — no API key and no API billing.
        </p>
        <p className="pc-note">
          <strong>What this costs you in trust:</strong> Antigravity is Google&rsquo;s closed-source program.
          Running missions through it puts a third-party process in the loop and opens a local port on
          this machine. It is contacted on <code>127.0.0.1</code> only — never any other host — and this app
          installs nothing, launches nothing, and never holds your Google credential.
        </p>

        <label className="pc-switch" htmlFor="pc-agy-on">
          <input
            id="pc-agy-on"
            name="antigravityEnabled"
            type="checkbox"
            className="pc-switch__input"
            checked={agyOn}
            disabled={pending}
            onChange={(e) => toggleAgy(e.target.checked)}
          />
          <span className="pc-switch__label">Use a local Antigravity runtime</span>
        </label>

        {agyOn && (
          <div className="pc-agy" role="status" aria-live="polite">
            <p className="pc-note">{agy ? agy.message : "Looking for a local Antigravity runtime…"}</p>
            {agy && (
              <>
                <p className="pc-note pc-note--strong">{quotaHint(agy)}</p>
                <dl className="pc-kv">
                  <dt>Runtime</dt>
                  <dd>{agy.presence === "present" ? `found${agy.version ? ` · ${agy.version}` : ""}` : "not running"}</dd>
                  <dt>Signed in</dt>
                  <dd>{agy.signIn === "signed-in" ? `yes${agy.accountEmail ? ` · ${agy.accountEmail}` : ""}` : agy.signIn === "signed-out" ? "no — sign in inside Antigravity" : "unconfirmed"}</dd>
                  {agy.quota?.plan && (<><dt>Plan</dt><dd>{agy.quota.plan}</dd></>)}
                </dl>
                <button type="button" className="pc-btn" onClick={() => void probeAgy()} disabled={busy === "antigravity"}>
                  {busy === "antigravity" ? "Checking…" : "Check again"}
                </button>
              </>
            )}
          </div>
        )}
      </section>

      {/* ---- Gemini API key ---- */}
      <form
        className="pc-card"
        onSubmit={(e) => {
          e.preventDefault();
          void saveGemini();
        }}
      >
        <h3>Gemini — API key (model access)</h3>
        <p className="pc-hint">
          Starts with <code>AIza</code>, created in Google AI Studio against a Cloud project with the Generative Language API
          enabled. This — not a Google One subscription — is what bills model calls.
        </p>
        <label className="pc-field" htmlFor="pc-gemini">
          <span>Gemini API key</span>
          <input
            id="pc-gemini"
            name="geminiKey"
            className="pc-input"
            type="password"
            value={geminiKey}
            onChange={(e) => setGeminiKey(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            placeholder="AIza…"
          />
        </label>
        <button type="submit" className="pc-btn" disabled={pending || !geminiKey.trim()}>
          {busy === "gemini" ? "Checking…" : "Verify and save Gemini key"}
        </button>
      </form>

      {/* ---- OpenAI API key ---- */}
      <form
        className="pc-card"
        onSubmit={(e) => {
          e.preventDefault();
          void saveOpenAI();
        }}
      >
        <h3>OpenAI — API key (model access)</h3>
        <p className="pc-hint">
          An <code>sk-…</code> key from platform.openai.com, billed per token through the API platform. A ChatGPT Plus or Go
          subscription does <strong>not</strong> include this — the two bill separately. The key is checked with one free call (
          <code>GET /v1/models</code>) before it is saved.
        </p>
        <label className="pc-field" htmlFor="pc-openai">
          <span>OpenAI API key</span>
          <input
            id="pc-openai"
            name="openaiKey"
            className="pc-input"
            type="password"
            value={openaiKey}
            onChange={(e) => setOpenaiKey(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            placeholder="sk-…"
          />
        </label>
        <button type="submit" className="pc-btn" disabled={pending || !looksLikeOpenAIKey(openaiKey)}>
          {busy === "openai" ? "Checking…" : "Verify and save OpenAI key"}
        </button>
      </form>

      {/* ---- current state + forget ---- */}
      {state && (state.google.connected || state.openai.connected || state.google.hasApiCredential) && (
        <section className="pc-card">
          <h3>On this device</h3>
          <dl className="pc-dl">
            <dt>Google</dt>
            <dd>
              {state.google.connected ? (
                <>
                  signed in{state.google.email ? ` as ${state.google.email}` : ""}
                  {state.google.hasApiCredential ? ` · ${state.google.credentialKind} credential present` : " · NO API credential"}
                </>
              ) : (
                "not signed in"
              )}
            </dd>
            <dt>OpenAI</dt>
            <dd>{state.openai.hasApiKey ? "API key present" : state.openai.connected ? "connected · no API key" : "not connected"}</dd>
            <dt>Model access</dt>
            <dd>{state.modelAccess}</dd>
          </dl>
          <div className="pc-acts">
            {state.google.connected && (
              <button
                type="button"
                className="pc-btn pc-btn--danger"
                disabled={pending}
                onClick={() =>
                  run("google", async () => {
                    forgetGoogleCredentials();
                    await refresh();
                    setNotice({ tone: "ok", text: "Google credentials removed from this device." });
                  })
                }
              >
                Forget Google
              </button>
            )}
            {state.openai.hasApiKey && (
              <button
                type="button"
                className="pc-btn pc-btn--danger"
                disabled={pending}
                onClick={() =>
                  run("openai", async () => {
                    forgetOpenAIKey();
                    await refresh();
                    setNotice({ tone: "ok", text: "OpenAI key removed from this device." });
                  })
                }
              >
                Forget OpenAI key
              </button>
            )}
            <button
              type="button"
              className="pc-btn"
              disabled={pending}
              onClick={() =>
                run("gemini", async () => {
                  forgetGeminiApiKey();
                  await refresh();
                  setNotice({ tone: "ok", text: "Gemini key removed from this device." });
                })
              }
            >
              Forget Gemini key
            </button>
          </div>
          <p className="pc-hint">
            A saved key is displayed as {maskKey("sk-example-key-1234")} — a length hint only. Nothing on this screen can print a
            credential back into the page.
          </p>
        </section>
      )}
    </section>
  );
}

