/**
 * SelfImpulse — the honest auth status model. ONE source of truth.
 *
 * The whole point of this file is that the UI cannot render "Connected"
 * while the app cannot actually run a model. So `canExecute` is not a field
 * anyone sets: it is DERIVED, in `deriveAuthState`, from the presence of a
 * real model credential — and `assertHonest` is the invariant the probe pins.
 *
 * The distinction that consumer subscriptions cannot cross:
 *
 *   IDENTITY      `google.connected` / `openai.connected`
 *                 — a session with an account. Proves a person.
 *   MODEL ACCESS  `hasApiCredential` / `hasApiKey`
 *                 — a credential that BILLS api calls. Proves capability.
 *
 * A Google One AI Pro / Gemini Advanced subscriber is `connected` with a real
 * email and `hasApiCredential: false`. A ChatGPT Go subscriber is the same
 * story at OpenAI. Neither can make `canExecute` true, because the derivation
 * only ever reads the credential fields. That is deliberate and it is the
 * reason this type exists rather than a boolean in a React state.
 */
import { loadGoogleTokens, loadGoogleIdentity, loadOpenAIKey, loadGeminiApiKey } from "./credentialStore";
import { isAccessTokenUsable } from "./googleOAuth";
import { runtimeStatus, antigravityOptIn } from "./antigravity";

/** Which model credentials can actually bill a call. */
export type ModelAccess = "none" | "gemini" | "openai" | "antigravity" | "both";

/**
 * Antigravity — the ONE exception to "credentials come from the vault", and it
 * is worth being precise about why that is not a hole.
 *
 * Every other provider here is an API key the owner pasted. Antigravity is a
 * local runtime the owner installed, started and signed into THEMSELVES; this
 * app holds no Google credential for it, has no OAuth flow for it, and never
 * sees a token. So there is nothing to seal — and inventing a vault entry to
 * store nothing would be theatre.
 *
 * What it stores instead is not a secret but a FACT: "there is a signed-in
 * Antigravity on this machine." That is a boolean in local storage, and it is
 * worthless to an attacker — it cannot be replayed anywhere, and it is not
 * treated as a credential. The only thing gated on it is whether this app
 * bothers to look for a runtime it can already reach; the entitlement itself
 * is re-probed from the runtime on every status read, so a stale "on" can
 * never manufacture model access that is not there.
 */
export interface AntigravityAuthState {
  /** The owner has turned the optional local provider on. NOT entitlement. */
  enabled: boolean;
  /** MODEL ACCESS: a runtime answered AND reports a signed-in account. */
  hasRuntime: boolean;
  signedIn: boolean;
  /** What the runtime reported, for display. Never a credential. */
  accountEmail?: string;
  plan?: string;
  remaining?: string;
  /** Always populated — the honest sentence, shown verbatim in the UI. */
  message: string;
}


export interface GoogleAuthState {
  /** IDENTITY: a Google account session exists. Says nothing about models. */
  connected: boolean;
  email?: string;
  name?: string;
  /** MODEL ACCESS: a real Gemini credential (OAuth token or `AIza…` key). */
  hasApiCredential: boolean;
  /** where that credential came from, for display. Never "subscription". */
  credentialKind?: "oauth" | "api-key";
  /** true when signed in but with no API credential — the PLAN-ONLY state. */
  planOnly: boolean;
  /** a token that has expired and could not be renewed. */
  needsReauth?: boolean;
}

export interface OpenAIAuthState {
  /** IDENTITY only. A ChatGPT sign-in would land here and grant no model access. */
  connected: boolean;
  /** MODEL ACCESS: an `sk-…` API key with API billing. */
  hasApiKey: boolean;
  keyKind?: "api-key";
  planOnly: boolean;
}

export interface AuthState {
  google: GoogleAuthState;
  openai: OpenAIAuthState;
  antigravity: AntigravityAuthState;
  modelAccess: ModelAccess;
  /**
   * THE gate. True only when a real model credential exists. Identity alone
   * can never set it — that is the invariant `assertHonest` enforces.
   */
  canExecute: boolean;
}

/** What the runtime told us, flattened into derivation inputs. */
export interface AntigravityFacts {
  enabled: boolean;
  presence: "absent" | "present" | "unknown";
  signIn: "signed-in" | "signed-out" | "unknown";
  accountEmail?: string;
  plan?: string;
  remaining?: string;
  message: string;
}

export const EMPTY_AUTH_STATE: AuthState = {
  google: { connected: false, hasApiCredential: false, planOnly: false },
  openai: { connected: false, hasApiKey: false, planOnly: false },
  antigravity: {
    enabled: false,
    hasRuntime: false,
    signedIn: false,
    message: "Antigravity is an optional local provider runtime. Turn it on to look for one on this machine.",
  },
  modelAccess: "none",
  canExecute: false,
};

/**
 * The one derivation. Note what is NOT an input: any subscription flag,
 * plan name, or "connected" claim. `canExecute` reads credential fields only.
 */
export function deriveAuthState(facts: AuthFacts): AuthState {
  const hasGemini = facts.googleCredential === "oauth" || facts.googleCredential === "api-key";
  const hasOpenai = facts.openaiApiKey === true;

  const google: GoogleAuthState = {
    connected: facts.googleConnected,
    email: facts.googleEmail,
    name: facts.googleName,
    hasApiCredential: hasGemini,
    credentialKind: hasGemini ? (facts.googleCredential as "oauth" | "api-key") : undefined,
    /* signed in, real account, but nothing that can bill a call */
    planOnly: facts.googleConnected && !hasGemini,
    needsReauth: facts.googleNeedsReauth,
  };
  const openai: OpenAIAuthState = {
    connected: facts.openaiConnected,
    hasApiKey: hasOpenai,
    keyKind: hasOpenai ? "api-key" : undefined,
    planOnly: facts.openaiConnected && !hasOpenai,
  };

  /* Antigravity contributes model access ONLY on a probed fact. `enabled` is a
     preference and is deliberately NOT an input to `hasRuntime` — being switched
     on is not the same as a runtime existing, and conflating the two is how a
     toggle would come to mean "connected". */
  const agy = facts.antigravity;
  const agySignedIn = !!agy && agy.presence === "present" && agy.signIn === "signed-in";
  const antigravity: AntigravityAuthState = {
    enabled: !!agy?.enabled,
    hasRuntime: !!agy && agy.presence === "present",
    signedIn: agySignedIn,
    accountEmail: agySignedIn ? agy.accountEmail : undefined,
    plan: agySignedIn ? agy.plan : undefined,
    remaining: agySignedIn ? agy.remaining : undefined,
    message: agy?.message ?? EMPTY_AUTH_STATE.antigravity.message,
  };

  const hasAny = hasGemini || hasOpenai || agySignedIn;
  const modelAccess: ModelAccess =
    hasGemini && hasOpenai ? "both"
    : hasGemini ? "gemini"
    : hasOpenai ? "openai"
    : agySignedIn ? "antigravity"
    : "none";
  /* DERIVED, never assigned — see the file header. */
  const canExecute = hasAny;

  return { google, openai, antigravity, modelAccess, canExecute };
}

/**
 * The invariant, as code. Returns the reason it failed, or null when the state
 * is honest. A UI that renders "Connected" must call this first.
 */
export function assertHonest(state: AuthState): string | null {
  if (state.canExecute && state.modelAccess === "none") {
    return "canExecute is true with no model credential — identity was treated as capability";
  }
  if (!state.canExecute && state.modelAccess !== "none") {
    return "a model credential exists but canExecute is false — the status under-reports a working credential";
  }
  /* The credential check has to know about the third provider. It originally
     read "no credential on EITHER provider", which was correct when there were
     only two — and then a legitimately signed-in Antigravity runtime failed its
     own product's honesty gate, which is the worst possible failure for a gate
     (a UI that must call it would have to either lie or refuse to work).
     The rule is unchanged in spirit: `canExecute` needs a real capability, and
     a signed-in local runtime is one. What it must never accept is the
     *preference* flag, which is why `signedIn` is tested and not `enabled`. */
  if (state.canExecute && !state.google.hasApiCredential && !state.openai.hasApiKey && !state.antigravity.signedIn) {
    return "canExecute is true with no credential on any provider — identity was treated as capability";
  }
  if (state.google.planOnly && state.google.hasApiCredential) {
    return "google is marked plan-only while holding an API credential";
  }
  if (state.openai.planOnly && state.openai.hasApiKey) {
    return "openai is marked plan-only while holding an API key";
  }
  /* The Antigravity half. Same rule, new surface: a preference, a runtime being
     installed, and an account being signed in are three different facts, and
     collapsing any two of them is how this file's whole purpose gets undone. */
  if (state.canExecute && !state.google.hasApiCredential && !state.openai.hasApiKey && !state.antigravity.signedIn) {
    return "canExecute is true with no credential and no signed-in Antigravity runtime — something was treated as capability that is not";
  }
  if (state.antigravity.signedIn && !state.antigravity.hasRuntime) {
    return "antigravity is signed in but no runtime was ever found — entitlement was claimed without a runtime";
  }
  if (state.antigravity.signedIn && !state.antigravity.enabled) {
    return "antigravity reports signed-in while the owner has it switched off";
  }
  if (state.modelAccess === "antigravity" && state.antigravity.signedIn === false) {
    return "model access claims antigravity while no account is signed in";
  }
  return null;
}

/** The sentence the UI shows. Never says "connected" without the caveat. */
export function describeAccess(state: AuthState): string {
  if (state.canExecute) {
    /* Each provider is named for what it actually is. Antigravity is not an API
       key and must never be described as one — it is someone's own runtime,
       spending their own plan quota. */
    const which =
      state.modelAccess === "both" ? "Gemini and OpenAI"
      : state.modelAccess === "gemini" ? "Gemini"
      : state.modelAccess === "openai" ? "OpenAI"
      : "a local Antigravity runtime";
    if (state.modelAccess === "antigravity") {
      const who = state.antigravity.accountEmail ? ` (${state.antigravity.accountEmail})` : "";
      return `Model access: your own Antigravity runtime${who}. Missions run through it on this machine, using the Google plan you are signed in to there.`;
    }
    return `Model access: ${which}. Signed-in accounts can bill real API calls.`;
  }
  /* A signed-in-but-unusable Antigravity deserves its own sentence, because
     "signed in, no model access" is otherwise confusing when a runtime IS
     present — the difference is "signed in over there" versus "signed in here". */
  if (state.antigravity.hasRuntime && !state.antigravity.signedIn) {
    return state.antigravity.message;
  }
  if (state.google.planOnly || state.openai.planOnly) {
    const alsoOff = state.antigravity.enabled ? " You can also turn on Antigravity, if you have Google's Antigravity app installed and signed in on this machine." : "";
    return "Signed in, but no model access. A consumer subscription (Google One AI Pro / Gemini / ChatGPT Plus-Go) is a web-product plan — it does not include API access. Add an API key, or an OAuth client whose Cloud project has the Generative Language API enabled." + alsoOff;
  }
  return "No model access. Sign in and/or add an API credential before anything can execute.";
}

/** Never render "Connected" when `canExecute` is false. */
export function statusBadge(state: AuthState): { label: string; tone: "ok" | "warn" | "idle" } {
  if (state.canExecute) {
    /* Never the bare word "Connected" for Antigravity: the truthful claim is
       that a local runtime is signed in, which is a different and weaker
       statement than a billing credential. */
    if (state.modelAccess === "antigravity") return { label: "Local runtime signed in", tone: "ok" };
    return { label: "Model access ready", tone: "ok" };
  }
  if (state.antigravity.hasRuntime) return { label: "Runtime found · sign in there", tone: "warn" };
  if (state.google.planOnly || state.openai.planOnly) return { label: "Signed in · no model access", tone: "warn" };
  return { label: "Not connected", tone: "idle" };
}

/**
 * Read the live credentials out of the vault and derive the state. This is the
 * seam the screen calls; it reads credentials but NEVER returns them, so no
 * component can accidentally render a key.
 */
export async function readAuthState(): Promise<AuthState> {
  const [tokens, identity, openaiKey, geminiKey, agy] = await Promise.all([
    loadGoogleTokens(),
    loadGoogleIdentity(),
    loadOpenAIKey(),
    loadGeminiApiKey(),
    /* The runtime is probed on every read — never cached into the state, and
       never trusted from a stored flag. It is also the only provider here that
       can take a second or two, so a failure is contained: the catch turns a
       dead runtime into "no facts", not into a thrown error that would take the
       whole status read down with it. */
    runtimeStatus().catch(() => null),
  ]);
  return deriveAuthState({
    googleConnected: tokens.ok,
    googleEmail: identity.ok ? identity.value?.email : undefined,
    googleName: identity.ok ? identity.value?.name : undefined,
    /* a stored token that has already lapsed is not a working credential */
    googleCredential: tokens.ok && tokens.value && isAccessTokenUsable(tokens.value) ? "oauth" : geminiKey.ok ? "api-key" : null,
    googleNeedsReauth: tokens.ok && tokens.value !== null && !isAccessTokenUsable(tokens.value),
    openaiConnected: openaiKey.ok,
    openaiApiKey: openaiKey.ok,
    antigravity: agy
      ? {
          enabled: antigravityOptIn(),
          presence: agy.presence,
          signIn: agy.signIn,
          accountEmail: agy.accountEmail,
          plan: agy.quota?.plan,
          remaining: agy.quota?.remaining,
          message: agy.message,
        }
      : undefined,
  });
}


/** The inputs — deliberately raw, so the derivation is the only way out. */
export interface AuthFacts {
  googleConnected: boolean;
  googleEmail?: string;
  googleName?: string;
  googleCredential?: "oauth" | "api-key" | null;
  googleNeedsReauth?: boolean;
  openaiConnected: boolean;
  openaiApiKey?: boolean;
  /** Raw runtime facts. Absent ⇒ Antigravity contributes nothing. */
  antigravity?: AntigravityFacts;
}
