/**
 * SelfImpulse — the provider seam (18.0.0).
 *
 * One adapter surface for the three wire formats VH supports:
 *   openai-compatible  POST {base}/chat/completions          Authorization: Bearer
 *   anthropic          POST {base}/v1/messages               x-api-key + anthropic-version
 *   gemini             POST {base}/models/{m}:generateContent  x-goog-api-key header
 *
 * Base URLs default to the providers' documented endpoints and are
 * overridable (proxies, gateways, local servers like Ollama's OpenAI-compat
 * mode). Keys come from the environment ONLY — never hardcoded, never
 * logged; `redactSecrets` exists so a stray key cannot reach a receipt, a
 * probe report or a stack trace.
 *
 * Security posture (the release's #1 priority):
 *   • every base URL passes the product's existing SSRF egress guard;
 *   • no key ⇒ an honest `no-key` refusal in words — the seam NEVER fakes a
 *     completion, because a fabricated answer is the exact failure mode this
 *     product exists to make impossible;
 *   • timeouts are real (AbortController), errors are typed, latency measured.
 */
import { checkEgressUrl } from "../security/guardrail";
import { optimizeWirePair } from "./tokenOptim";
import { callNativeProvider } from "./nativeProvider";
import { useTauri } from "../ipc/client";
import type { ProviderConfig, ProviderResult } from "./types";

/** Documented provider endpoints (verified against provider docs, 2026-09). */
export const PROVIDER_DEFAULTS: Record<ProviderConfig["kind"], string> = {
  "openai-compatible": "https://api.openai.com/v1",
  anthropic: "https://api.anthropic.com",
  gemini: "https://generativelanguage.googleapis.com/v1", // 18.5.0: stable v1 line (review note); the OpenAI-compat path stays v1beta/openai/
};

export const DEFAULT_TIMEOUT_MS = 30_000;

/** Env contract — the UI/keychain path can populate these at launch. */
const ENV_SOURCES: Array<{ kind: ProviderConfig["kind"]; keyVars: string[]; baseVar: string; modelVar: string; defaultModel: string }> = [
  { kind: "openai-compatible", keyVars: ["HANDLE_OPENAI_API_KEY", "OPENAI_API_KEY"], baseVar: "HANDLE_OPENAI_BASE_URL", modelVar: "HANDLE_OPENAI_MODEL", defaultModel: "gpt-4.1" },
  { kind: "anthropic", keyVars: ["HANDLE_ANTHROPIC_API_KEY", "ANTHROPIC_API_KEY"], baseVar: "HANDLE_ANTHROPIC_BASE_URL", modelVar: "HANDLE_ANTHROPIC_MODEL", defaultModel: "claude-sonnet-4-20250514" },
  { kind: "gemini", keyVars: ["HANDLE_GEMINI_API_KEY", "GEMINI_API_KEY", "GOOGLE_GENERATIVE_AI_API_KEY"], baseVar: "HANDLE_GEMINI_BASE_URL", modelVar: "HANDLE_GEMINI_MODEL", defaultModel: "gemini-2.5-flash" },
];

export interface EnvLike {
  [k: string]: string | undefined;
}

/**
 * Build a provider config from an environment bag. Priority: openai-compat,
 * anthropic, gemini — the first with a usable key wins. Returns null (not a
 * half-config) when nothing is usable.
 */
export function providerFromEnv(env: EnvLike): ProviderConfig | null {
  for (const src of ENV_SOURCES) {
    const apiKey = src.keyVars.map((v) => env[v]).find((v) => typeof v === "string" && v.trim().length > 0);
    if (!apiKey) continue;
    return {
      kind: src.kind,
      baseUrl: (env[src.baseVar] ?? PROVIDER_DEFAULTS[src.kind]).replace(/\/+$/, ""),
      apiKey: apiKey.trim(),
      model: env[src.modelVar] ?? src.defaultModel,
    };
  }
  return null;
}

/** Mask anything that looks like a provider key so it can never leak into logs/receipts. */
export function redactSecrets(text: string, known: string[] = []): string {
  let out = text;
  for (const k of known) {
    if (k && k.length >= 8) out = out.split(k).join(`${k.slice(0, 4)}…REDACTED`);
  }
  out = out.replace(/\b(sk-[A-Za-z0-9_-]{6})[A-Za-z0-9_-]+/g, "$1…REDACTED");
  out = out.replace(/\b(sk-ant-[A-Za-z0-9_-]{6})[A-Za-z0-9_-]+/g, "$1…REDACTED");
  out = out.replace(/\b(AIza[A-Za-z0-9_-]{6})[A-Za-z0-9_-]+/g, "$1…REDACTED");
  return out;
}

function buildRequest(cfg: ProviderConfig, system: string, user: string): { url: string; init: RequestInit } {
  switch (cfg.kind) {
    case "openai-compatible":
      return {
        url: `${cfg.baseUrl}/chat/completions`,
        init: {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${cfg.apiKey}` },
          body: JSON.stringify({ model: cfg.model, messages: [{ role: "system", content: system }, { role: "user", content: user }] }),
        },
      };
    case "anthropic":
      return {
        url: `${cfg.baseUrl}/v1/messages`,
        init: {
          method: "POST",
          headers: { "content-type": "application/json", "x-api-key": cfg.apiKey, "anthropic-version": "2023-06-01" },
          body: JSON.stringify({ model: cfg.model, max_tokens: 2048, system, messages: [{ role: "user", content: user }] }),
        },
      };
    case "gemini":
      return {
        url: `${cfg.baseUrl}/models/${encodeURIComponent(cfg.model)}:generateContent`,
        init: {
          method: "POST",
          headers: { "content-type": "application/json", "x-goog-api-key": cfg.apiKey },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: system }] },
            contents: [{ role: "user", parts: [{ text: user }] }],
            // Thinking models spend part of the budget on thoughts — give room.
            generationConfig: { maxOutputTokens: 4096 },
          }),
        },
      };
  }
}

function extractText(cfg: ProviderConfig, body: unknown): string | null {
  try {
    if (cfg.kind === "openai-compatible") {
      const b = body as { choices?: Array<{ message?: { content?: string } }> };
      return b.choices?.[0]?.message?.content ?? null;
    }
    if (cfg.kind === "anthropic") {
      const b = body as { content?: Array<{ type?: string; text?: string }> };
      const parts = (b.content ?? []).filter((c) => c.type === "text").map((c) => c.text ?? "");
      return parts.length ? parts.join("") : null;
    }
    const b = body as { candidates?: Array<{ content?: { parts?: Array<{ text?: string; thought?: boolean }> } }> };
    // Thinking models (Gemma 4, Gemini 3.x flash) interleave thought parts —
    // those are reasoning, never the agent's answer. Filter them out.
    const parts = (b.candidates?.[0]?.content?.parts ?? []).filter((p) => !p.thought).map((p) => p.text ?? "");
    return parts.length ? parts.join("") : null;
  } catch {
    return null;
  }
}

/**
 * One completion through the seam. Every failure mode is typed and worded;
 * a missing key is a refusal, not a crash and never a fabrication.
 */
export async function complete(
  cfg: ProviderConfig | null | undefined,
  system: string,
  user: string,
  opts: { fetchImpl?: typeof fetch; timeoutMs?: number } = {},
): Promise<ProviderResult> {
  if (!cfg) return { ok: false, kind: "no-key", error: "no provider configured — supply an API key (env or the Providers door); nothing was executed" };
  /* The desktop key holder: the key lives in the OS keychain and NEVER enters this window, so the call is
     made by native code, which also decides where the key may go. A reference with no native side (the
     browser) is an honest refusal — it is never "fixed" by sending an empty key somewhere. */
  if (cfg.secretRef) {
    if (!useTauri()) return { ok: false, kind: "no-key", error: "this provider's key is held by the desktop keychain — it cannot be used from the browser; nothing was executed" };
    const nativeWire = optimizeWirePair(system, user, { model: cfg.model, kind: "provider-call" });
    return callNativeProvider(cfg, nativeWire.system, nativeWire.user, { timeoutMs: opts.timeoutMs });
  }
  if (!cfg.apiKey || !cfg.apiKey.trim()) return { ok: false, kind: "no-key", error: "provider key is empty — nothing was executed" };

  const egress = checkEgressUrl(cfg.baseUrl);
  if (!egress.ok) return { ok: false, kind: "egress-blocked", error: redactSecrets(`base URL refused by the egress guard: ${egress.reason}`, [cfg.apiKey]) };

  /* 19.7.0 — EVERY provider call rides the token optimization pipeline:
     normalize → dedup repeated lines → cache-alignment measured → budget
     guard. Never throws, never changes meaning; the report lands in the
     wire event ring where the console reads one run's honest delta. */
  const wire = optimizeWirePair(system, user, { model: cfg.model, kind: "provider-call" });

  const { url, init } = buildRequest(cfg, wire.system, wire.user);
  const doFetch = opts.fetchImpl ?? globalThis.fetch?.bind(globalThis);
  if (!doFetch) return { ok: false, kind: "network", error: "no fetch available in this runtime — nothing was executed" };

  const controller = new AbortController();
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const t0 = Date.now();
  try {
    const res = await doFetch(url, { ...init, signal: controller.signal });
    const latencyMs = Date.now() - t0;
    if (!res.ok) {
      const bodyText = await res.text().catch(() => "");
      return { ok: false, kind: "http-error", error: redactSecrets(`provider returned HTTP ${res.status}${bodyText ? `: ${bodyText.slice(0, 300)}` : ""}`, [cfg.apiKey]) };
    }
    const body: unknown = await res.json().catch(() => null);
    const text = body == null ? null : extractText(cfg, body);
    if (text == null || text.length === 0) {
      return { ok: false, kind: "bad-response", error: "provider response carried no usable text — nothing was executed" };
    }
    return { ok: true, text, model: cfg.model, latencyMs };
  } catch (err) {
    const aborted = err instanceof Error && err.name === "AbortError";
    return {
      ok: false,
      kind: aborted ? "timeout" : "network",
      error: redactSecrets(aborted ? `provider timed out after ${timeoutMs}ms` : `network failure: ${err instanceof Error ? err.message : String(err)}`, [cfg.apiKey]),
    };
  } finally {
    clearTimeout(timer);
  }
}
