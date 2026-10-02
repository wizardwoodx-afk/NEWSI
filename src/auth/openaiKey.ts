/**
 * SelfImpulse — the OpenAI API-key path (real pay-per-token billing).
 *
 * The truth this file exists to state, because it is the single most common
 * misunderstanding about OpenAI:
 *
 *   • A ChatGPT Plus / Go subscription is a subscription to the CHATGPT web
 *     product. It does NOT include API access, does NOT draw from the same
 *     allowance, and does NOT bill api.openai.com. Subscribing does not
 *     create an API key and paying for the API does not extend ChatGPT.
 *   • "Sign in with ChatGPT" would be IDENTITY only. It grants conversation
 *     identity — nothing more. It is deliberately never treated as a model
 *     credential, and `authStatus.ts` cannot be made to treat it as one.
 *   • ChatGPT conversation history is NOT reachable through the API. There is
 *     no endpoint for it, and this app never asks for one.
 *
 * What IS implemented: an `sk-…` API key validated with ONE cheap call —
 * `GET https://api.openai.com/v1/models`, which costs zero tokens — and only
 * then sealed into the vault. A key that fails validation is never stored.
 */
import type { ProviderConfig } from "../engine/types";
import { probeGeminiModelAccess } from "./googleOAuth";
import type { AuthError } from "./googleOAuth";

export const OPENAI_MODELS_ENDPOINT = "https://api.openai.com/v1/models";

/** Keys this shape: `sk-…` or the newer project form `sk-proj-…`. */
const OPENAI_KEY_SHAPE = /^sk-[A-Za-z0-9_-]{16,}$/;

export function looksLikeOpenAIKey(key: string): boolean {
  return typeof key === "string" && OPENAI_KEY_SHAPE.test(key.trim());
}

/**
 * Never echo a credential back. The UI shows a length hint and nothing else,
 * so a screenshot or a shoulder-surfer cannot read the key out of the app.
 */
export function maskKey(key: string): string {
  const t = (key ?? "").trim();
  if (!t) return "";
  if (t.length <= 8) return `${"•".repeat(t.length)} (${t.length} chars)`;
  return `${t.slice(0, 3)}${"•".repeat(8)}…${t.slice(-2)} (${t.length} chars)`;
}

export type KeyValidation =
  | { ok: true; modelCount: number; key: string; /** the provider config the engine can use. */ config: ProviderConfig }
  | { ok: false; error: AuthError };

/**
 * Validate an OpenAI API key with ONE cheap call. `GET /v1/models` lists the
 * models the key can reach and bills nothing, so it proves the key is live
 * AND that API billing is attached — which a ChatGPT subscription never is.
 */
export async function validateOpenAIKey(
  key: string,
  opts: { fetchImpl?: typeof fetch; timeoutMs?: number; model?: string } = {},
): Promise<KeyValidation> {
  const trimmed = (key ?? "").trim();
  if (!trimmed) {
    return { ok: false, error: keyError("No API key was entered — nothing was checked or stored.", false, "not-configured") };
  }
  if (!looksLikeOpenAIKey(trimmed)) {
    return {
      ok: false,
      error: keyError(
        "That does not look like an OpenAI API key (they start with “sk-”). A ChatGPT subscription does not provide one — create a key at platform.openai.com with API billing set up.",
        false,
        "not-configured",
      ),
    };
  }

  const doFetch = opts.fetchImpl ?? globalThis.fetch?.bind(globalThis);
  if (!doFetch) {
    return { ok: false, error: keyError("No fetch is available in this runtime — nothing was checked or stored.", true, "network") };
  }

  const timeoutMs = opts.timeoutMs ?? 30_000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await doFetch(OPENAI_MODELS_ENDPOINT, {
      headers: { Authorization: `Bearer ${trimmed}` },
      signal: controller.signal,
    });
    if (res.status === 401) {
      return {
        ok: false,
        error: keyError("OpenAI rejected that key (HTTP 401). It may be revoked or mistyped — nothing was stored.", true, "unauthorized"),
      };
    }
    if (res.status === 403) {
      return {
        ok: false,
        error: keyError(
          "OpenAI refused that key (HTTP 403). The project may lack billing, or the key may lack access to this resource — nothing was stored.",
          false,
          "api-not-enabled",
        ),
      };
    }
    if (res.status === 429) {
      return {
        ok: false,
        error: keyError("OpenAI is rate-limiting this key (HTTP 429). Wait a moment and retry — nothing was stored.", true, "server-error"),
      };
    }
    if (!res.ok) {
      return { ok: false, error: keyError(`OpenAI returned HTTP ${res.status}. Nothing was stored — you can retry.`, true, "server-error") };
    }
    const body = (await res.json().catch(() => null)) as { data?: unknown[] } | null;
    if (!body || !Array.isArray(body.data)) {
      return { ok: false, error: keyError("OpenAI's response was not readable — nothing was stored.", true, "bad-response") };
    }
    const modelCount = body.data.length;
    if (modelCount === 0) {
      return {
        ok: false,
        error: keyError("That key reached OpenAI but can see no models — its project has no access. Nothing was stored.", false, "api-not-enabled"),
      };
    }
    return {
      ok: true,
      modelCount,
      key: trimmed,
      config: { kind: "openai-compatible", baseUrl: "https://api.openai.com/v1", apiKey: trimmed, model: opts.model ?? "gpt-4.1" },
    };
  } catch (e) {
    const aborted = e instanceof Error && e.name === "AbortError";
    return {
      ok: false,
      error: aborted
        ? keyError(`The request to OpenAI timed out after ${timeoutMs}ms. Nothing was stored — you can retry.`, true, "timeout")
        : keyError(`Could not reach OpenAI: ${e instanceof Error ? e.message : String(e)}. Nothing was stored — you can retry.`, true, "network"),
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * A Gemini API KEY (`AIza…`) validated the same honest way: one cheap
 * `GET /v1beta/models`. This is the credential a Google Cloud project issues
 * for the Gemini Developer API — it is NOT the Google One subscription, and
 * the UI says so next to the field.
 */
export async function validateGeminiApiKey(
  key: string,
  opts: { fetchImpl?: typeof fetch; timeoutMs?: number } = {},
): Promise<{ ok: true; model: string; key: string; config: ProviderConfig } | { ok: false; error: AuthError }> {
  const trimmed = (key ?? "").trim();
  if (!trimmed) {
    return { ok: false, error: keyError("No Gemini API key was entered — nothing was checked or stored.", false, "not-configured") };
  }
  if (!/^AIza[0-9A-Za-z_-]{20,}$/.test(trimmed)) {
    return {
      ok: false,
      error: keyError(
        "Gemini API keys start with “AIza”. Create one in Google AI Studio — a Google One / Gemini subscription does not include API access.",
        false,
        "not-configured",
      ),
    };
  }
  const probe = await probeGeminiModelAccess(trimmed, "api-key", opts.fetchImpl, opts.timeoutMs ?? 30_000);
  if (!probe.granted) {
    return { ok: false, error: probe.error ?? keyError("That key could not reach the Gemini API — nothing was stored.", true) };
  }
  return {
    ok: true,
    model: probe.model ?? "gemini-2.5-flash",
    key: trimmed,
    config: {
      kind: "gemini",
      baseUrl: "https://generativelanguage.googleapis.com/v1",
      apiKey: trimmed,
      model: probe.model ?? "gemini-2.5-flash",
    },
  };
}


function keyError(message: string, retryable: boolean, kind: AuthError["kind"] = "unauthorized", detail?: string): AuthError {
  return { kind, message, retryable, detail };
}
