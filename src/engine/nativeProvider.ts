/**
 * THE NATIVE KEY HOLDER (desktop).
 *
 * The WebView is untrusted content: anything injected into the page runs with the page's powers. A
 * provider key held in the page — in zustand state, or in a localStorage vault the page can unseal —
 * is a key any injected script can read and send anywhere. So on the desktop build the key takes one
 * trip and never comes back:
 *
 *     paste → ipc.secretSet → the OS keychain (native)         the page forgets it immediately
 *     use   → ipc.llmChat   → native reads the key, checks the destination, makes the call
 *
 * What the page keeps is a REFERENCE (`secretRef`) plus non-secret settings (kind / baseUrl / model).
 * Native refuses to attach that key to any host that is not the vendor's own origin or one a human
 * bound at a native dialog (src-tauri/src/grants.rs), and `secret_get` will not hand a provider key
 * back at all. A compromised page can still USE the provider through the app; it cannot walk away
 * with the key, and it cannot point the key somewhere else.
 *
 * The web edition has no native boundary: it keeps the key in page memory / the sealed vault, as it
 * always did, and says so. This module does nothing there.
 */
import { ipc, useTauri } from "../ipc/client";
import { redactSecrets } from "./providers";
import type { ProviderConfig, ProviderKind, ProviderResult } from "./types";

/** Non-secret provider settings, persisted in the clear: there is no key in them to protect. */
export const NATIVE_PROVIDER_CONFIG_KEY = "vh.provider.native.v1";

/** One native secret per provider kind — in the `vh.providerkey.*` family native classifies as a provider key. */
export const providerSecretRef = (kind: ProviderKind): string => `vh.providerkey.${kind}`;

/** Vendors the native side knows by name, with their own origin (mirrors `canonical_origin` in grants.rs). */
const CANONICAL: Record<string, string> = {
  openai: "https://api.openai.com",
  anthropic: "https://api.anthropic.com",
  google: "https://generativelanguage.googleapis.com",
  groq: "https://api.groq.com",
  openrouter: "https://openrouter.ai",
};

function originOf(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

/** The provider string the native `llm_chat` is told. A host nobody vetted is "custom" and needs a human binding. */
export function nativeKindFor(cfg: Pick<ProviderConfig, "kind" | "baseUrl">): string {
  if (cfg.kind === "anthropic") return "anthropic";
  if (cfg.kind === "gemini") return "google";
  const o = originOf(cfg.baseUrl);
  for (const k of ["openai", "groq", "openrouter"]) if (o === CANONICAL[k]) return k;
  return "custom";
}

/**
 * The FULL endpoint URL to send, or undefined when the native side's own built-in endpoint for that
 * vendor is the right one (no human binding needed). A gateway returns its full URL, and native
 * checks that origin against what a human bound.
 */
export function nativeEndpointFor(cfg: Pick<ProviderConfig, "kind" | "baseUrl">): string | undefined {
  const kind = nativeKindFor(cfg);
  const base = cfg.baseUrl.trim().replace(/\/+$/, "");
  if (CANONICAL[kind] && originOf(base) === CANONICAL[kind]) return undefined;
  return cfg.kind === "anthropic" ? `${base}/v1/messages` : `${base}/chat/completions`;
}

export interface NativeSaveResult {
  ok: boolean;
  /** One sentence for the Settings page — what happened, in the owner's words. */
  note: string;
  secretRef: string;
}

/**
 * Hand a pasted key to the native store and, if the endpoint is not the vendor's own, bind it with a
 * native confirmation. `apiKey` blank means "keep the key already stored" (only the endpoint changes).
 * The key is NOT retained here after this returns.
 */
export async function saveNativeProvider(cfg: Pick<ProviderConfig, "kind" | "baseUrl" | "model">, apiKey: string): Promise<NativeSaveResult> {
  const secretRef = providerSecretRef(cfg.kind);
  let note: string;
  if (apiKey.trim()) {
    const r = await ipc.secretSet(secretRef, apiKey.trim());
    note =
      r.location === "keychain"
        ? "Key stored in your OS keychain — this window cannot read it back."
        : `${r.warning ?? "The OS keychain is unavailable, so the key is held in the app's memory only and is lost on exit."}`;
  } else {
    const have = (await ipc.secretExists([secretRef]))[secretRef];
    if (!have?.exists) return { ok: false, note: "No key is stored yet — paste one.", secretRef };
    note = "Kept the key already stored natively.";
  }
  const endpoint = nativeEndpointFor(cfg);
  if (endpoint) {
    try {
      await ipc.providerBindEndpoint(secretRef, endpoint);
      note += ` Endpoint ${originOf(endpoint)} approved at a native dialog.`;
    } catch (e) {
      return {
        ok: false,
        note: `The key is stored, but this endpoint was not approved (${e instanceof Error ? e.message : String(e)}) — the key cannot be sent there.`,
        secretRef,
      };
    }
  } else {
    // The vendor's own host needs no binding; drop a stale one so the key can reach only that host.
    await ipc.providerUnbindEndpoint(secretRef).catch(() => undefined);
  }
  return { ok: true, note, secretRef };
}

const NATIVE_BACKUP_KEY = "vh.provider.active.v1";

/** What the page remembers of a native-held provider: settings only, never the key. */
export function persistNativeConfig(cfg: ProviderConfig): void {
  try {
    globalThis.localStorage?.setItem(
      NATIVE_PROVIDER_CONFIG_KEY,
      JSON.stringify({ kind: cfg.kind, baseUrl: cfg.baseUrl, model: cfg.model, secretRef: cfg.secretRef, apiKey: "" }),
    );
  } catch {
    /* a host with no storage keeps it for the session only */
  }
}

export function clearNativeConfig(): void {
  try {
    globalThis.localStorage?.removeItem(NATIVE_PROVIDER_CONFIG_KEY);
    // Earlier builds wrote the raw key here under the guise of a backup. Purge it.
    globalThis.localStorage?.removeItem(NATIVE_BACKUP_KEY);
  } catch {
    /* nothing to clear */
  }
}

/** Reload the remembered settings. The key itself lives only in the OS keychain,
 *  so if the keychain no longer holds it the provider is simply not restored. */
export async function loadNativeConfig(): Promise<ProviderConfig | null> {
  if (!useTauri()) return null;
  try {
    const raw = globalThis.localStorage?.getItem(NATIVE_PROVIDER_CONFIG_KEY);
    if (!raw) return null;
    const c = JSON.parse(raw) as ProviderConfig;
    if (!c || !c.secretRef || !c.kind || !c.baseUrl) return null;

    const have = (await ipc.secretExists([c.secretRef]))[c.secretRef];
    return have?.exists ? { ...c, apiKey: "" } : null;
  } catch {
    return null;
  }
}

/** One completion through the native boundary. The key never enters this window. */
export async function callNativeProvider(cfg: ProviderConfig, system: string, user: string, opts: { timeoutMs?: number } = {}): Promise<ProviderResult> {
  if (!cfg.secretRef) return { ok: false, kind: "no-key", error: "no native key reference — nothing was executed" };
  const started = Date.now();
  const endpoint = nativeEndpointFor(cfg);
  const timeoutMs = opts.timeoutMs ?? 120_000;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const r = await Promise.race([
      ipc.llmChat({
        provider: nativeKindFor(cfg),
        ...(endpoint ? { base_url: endpoint } : {}),
        model: cfg.model,
        messages: [{ role: "user", content: user }],
        system,
        max_tokens: 1024,
        secret_ref: cfg.secretRef,
      }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`provider timed out after ${timeoutMs}ms`)), timeoutMs);
      }),
    ]);
    const text = String(r.content ?? "").trim();
    if (!text) return { ok: false, kind: "bad-response", error: "provider response carried no usable text — nothing was executed" };
    return { ok: true, text, model: r.model || cfg.model, latencyMs: Date.now() - started };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const kind: Extract<ProviderResult, { ok: false }>["kind"] = /timed out/i.test(msg)
      ? "timeout"
      : /HTTP \d{3}/.test(msg)
        ? "http-error"
        : /egress|refused|not bound|neither|DENIED|no built-in endpoint/i.test(msg)
          ? "egress-blocked"
          : /secret not found|no key/i.test(msg)
            ? "no-key"
            : "network";
    return { ok: false, kind, error: redactSecrets(msg) };
  } finally {
    if (timer) clearTimeout(timer);
  }
}
