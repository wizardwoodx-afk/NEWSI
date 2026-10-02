/**
 * Provider egress probe — the llmChat boundary.
 *
 * The gap this pins: `checkEgressUrl` was applied at eleven engine call sites,
 * but NOT at `ipc.llmChat` — the one function every provider call funnels
 * through on the way to Rust `llm_chat`. The Hermes autonomous loop
 * (engine/hermesRuntime.ts) calls `ipc.llmChat` with a caller-supplied
 * `base_url` and never passed through engine/providers.ts, so two things rode an
 * unguarded path:
 *
 *   1. SSRF — a hostile base_url aimed at link-local, RFC1918 or the cloud
 *      metadata endpoint, from an app whose whole pitch is "nothing leaves your
 *      machine without a signed authority".
 *   2. Key exfiltration — the provider key is attached as a header to whatever
 *      base_url says, so an attacker-chosen host received the user's API key.
 *
 * The refusal must be in words, before any fetch, and must not leak the key
 * into the error text. This probe pins the TS boundary; probe/egressAlign and
 * the Rust `egress_guard` mirror carry the same policy natively.
 */
import { checkEgressUrl } from "../src/security/guardrail";
import { complete } from "../src/engine/providers";
import {
  saveNativeProvider, persistNativeConfig, loadNativeConfig, nativeKindFor, nativeEndpointFor, providerSecretRef, NATIVE_PROVIDER_CONFIG_KEY,
} from "../src/engine/nativeProvider";
import type { ProviderConfig } from "../src/engine/types";
import * as fs from "node:fs";
import * as path from "node:path";

// Source-tree root, resolved the way every other disk-reading probe does it
// (docIdentity / legacyCompat / shellAffordances / versionDrift) so this file
// still works when it is bundled into verify/suites/ for the zero-install pack —
// where import.meta.url points at verify/, not the repo.
const ROOT: string = process.env.SI_ROOT ?? process.cwd();
const readSrc = (rel: string): string => fs.readFileSync(path.join(ROOT, rel), "utf8");

let passed = 0;
let failed = 0;
const failures: string[] = [];
function ok(label: string, cond: boolean, detail = ""): void {
  if (cond) { passed += 1; console.log(`  ok   ${label}`); }
  else { failed += 1; failures.push(`${label}${detail ? ` — ${detail}` : ""}`); console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`); }
}
function section(name: string): void { console.log(`\n== ${name}`); }

section("1. the hosts a hostile base_url would aim at are refused");
const ATTACK = [
  ["169.254.169.254", "cloud metadata (AWS/Azure IMDS)"],
  ["http://169.254.169.254/latest/meta-data/iam/security-credentials/", "cloud metadata with a path"],
  ["metadata.google.internal", "cloud metadata (GCP)"],
  ["http://10.0.0.5/admin", "RFC1918 10/8"],
  ["http://192.168.1.1/router", "RFC1918 192.168/16"],
  ["http://172.16.0.1/internal", "RFC1918 172.16/12"],
  ["http://169.254.10.1", "link-local"],
  ["http://[fd00::1]/admin", "IPv6 unique-local"],
  ["http://[fe80::1]/admin", "IPv6 link-local"],
  ["http://0.0.0.0:8080", "unspecified address"],
  ["http://redis.internal:6379", "internal suffix"],
  ["http://db.local:5432", "local suffix"],
  ["file:///etc/passwd", "non-http scheme"],
  ["gopher://127.0.0.1:11211/", "non-http scheme"],
];
for (const [url, why] of ATTACK) {
  ok(`refused — ${why} (${url})`, !checkEgressUrl(url).ok, checkEgressUrl(url).reason);
}

section("2. loopback stays ALLOWED — local models are documented product surface");
for (const url of [
  "http://127.0.0.1:11434",
  "http://localhost:11434",
  "http://127.0.0.1:8080/v1/chat/completions",
]) {
  ok(`allowed — ${url}`, checkEgressUrl(url).ok, checkEgressUrl(url).reason);
}

section("3. the normal provider surface is untouched");
for (const url of [
  "https://api.openai.com/v1/chat/completions",
  "https://api.anthropic.com/v1/messages",
  "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
  "https://api.groq.com/openai/v1/chat/completions",
  "https://openrouter.ai/api/v1/chat/completions",
  "https://my-corp-llm.example.com/v1",
]) {
  ok(`allowed — ${url}`, checkEgressUrl(url).ok, checkEgressUrl(url).reason);
}

section("4. the boundary itself refuses before any fetch");
{
  // The contract the fix relies on: llmChat throws on a refused base_url rather
  // than reaching fetch. Source-level pin, because exercising the real boundary
  // needs a Tauri host and a secret store.
  const src = readSrc("src/ipc/client.ts");
  const body = src.slice(src.indexOf("llmChat: async"), src.indexOf("fsRead: async"));
  ok("ipc.llmChat applies the egress guard", /checkEgressUrl\(/.test(body));
  ok("the guard runs BEFORE the tauri invoke", body.indexOf("checkEgressUrl(") < body.indexOf('tauriInvoke("llm_chat"'));
  ok("a refusal throws instead of returning a result", /throw new Error/.test(body));
  ok("the refusal says no key left the machine", /no key left this machine/.test(body));
  ok("the guarded (trimmed) base_url is what reaches the native handler", /base_url: target/.test(body));
}

section("5. the native handler enforces the same policy");
{
  const rs = readSrc("src-tauri/src/commands.rs");
  ok("llm_chat calls egress_guard", /egress_guard\(/.test(rs));
  ok("the ollama path is guarded", /ollama base URL refused/.test(rs));
  ok("the cloud path is guarded", /base URL refused by the egress guard/.test(rs));

  /* 11.14.4 — this slice used to end at the next `#[tauri::command]`, which was
     a proxy for "the end of the guard" and quietly stopped meaning that when
     `classify_socket` (the address classifier the guard delegates to) landed
     between the two markers. The window then swept in unrelated code and the
     loopback assertion below started reading another function's text.

     The assertion is about the STRING policy specifically: `egress_guard` is
     the hostname gate, and it must not blanket-refuse 127.0.0.1, because a local
     Ollama is documented product surface. Address-level loopback is decided in
     `classify_socket`, gated on an explicit `allow_loopback` flag — so the two
     are asserted separately instead of by one brittle slice. */
  const guardStart = rs.indexOf("fn egress_guard");
  const guardEnd = rs.indexOf("fn classify_socket");
  ok("egress_guard and classify_socket are both present in the native handler",
    guardStart !== -1 && guardEnd > guardStart, `guardStart=${guardStart} guardEnd=${guardEnd}`);
  const guard = guardStart !== -1 && guardEnd > guardStart ? rs.slice(guardStart, guardEnd) : "";

  for (const needle of ["169.254.169.254", "metadata.google.internal", "192.168.", ".internal", ".local", ".localhost"]) {
    ok(`native guard refuses ${needle}`, guard.includes(needle));
  }
  ok("the string-level guard allows loopback (no blanket 127.0.0.1 refusal)", !/127\.0\.0\.1/.test(guard));

  // The classifier must still refuse loopback, and only when not explicitly allowed.
  const classifier = rs.slice(guardEnd, rs.indexOf("#[tauri::command]", guardEnd));
  ok("classify_socket gates loopback on an explicit flag, not a blanket refusal",
    /if o\[0\] == 127 \{[\s\S]*?if allow_loopback \{ Ok\(\(\)\) \} else \{ Err\("loopback address refused/.test(classifier),
    "the address classifier must refuse 127/8 unless allow_loopback is set");
}

/* ───────────── the desktop key holder: the key crosses the bridge ONCE and never comes back ─────────────
   (archive-6 audit.) A fake native bridge records every call. The provider key is handed to native exactly
   once — secret_set — and must appear in NO other call and NO persisted setting; the provider call
   itself carries only a reference; and the destination decisions are the native side's, so a gateway
   goes through a native binding with the FULL endpoint while the vendor's own host needs none. */
section("the desktop key holder — one trip, never back");
{
  class Mem implements Storage {
    private m = new Map<string, string>();
    get length() { return this.m.size; } clear() { this.m.clear(); }
    getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null; }
    key(i: number) { return Array.from(this.m.keys())[i] ?? null; }
    removeItem(k: string) { this.m.delete(k); } setItem(k: string, v: string) { this.m.set(k, v); }
  }
  const store = new Mem();
  (globalThis as { localStorage?: Storage }).localStorage = store;
  const KEY = "sk-THE-KEY-THAT-MUST-CROSS-ONCE-1234567890abcd";
  const wire: Array<{ cmd: string; args: Record<string, unknown> }> = [];
  let declineBinding = false;
  let chatError: string | null = null;
  const fakeNative = async (cmd: string, args: Record<string, unknown> = {}): Promise<unknown> => {
    wire.push({ cmd, args: JSON.parse(JSON.stringify(args)) });
    switch (cmd) {
      case "secret_set": return { stored: true, location: "keychain", survivesRestart: true };
      case "secret_exists": return Object.fromEntries((args.secretRefs as string[]).map((r) => [r, { exists: true, location: "keychain", survivesRestart: true }]));
      case "provider_unbind_endpoint": return { unbound: false, secretRef: args.secretRef };
      case "provider_bind_endpoint":
        if (declineBinding) throw new Error("declined at the native dialog — no endpoint was bound");
        return { bound: true, origin: new URL(String(args.baseUrl)).origin, secretRef: args.secretRef, alreadyBound: false };
      case "llm_chat":
        if (chatError) throw new Error(chatError);
        return { content: "hello from the native side", model: (args.req as { model: string }).model, usage: {}, duration_ms: 1 };
      case "secret_get": return { ref: args.secretRef, present: true, value: null, redacted: true, hint: "…abcd" };
      case "app_info": return { workspaceRoot: "/data" };
      default: throw new Error(`unexpected native command ${cmd}`);
    }
  };
  const setHost = (native: boolean): void => {
    (globalThis as unknown as { window?: unknown }).window = native
      ? { __TAURI_INTERNALS__: { invoke: fakeNative }, dispatchEvent: () => true }
      : undefined;
  };
  const calls = (cmd: string) => wire.filter((w) => w.cmd === cmd);

  ok("the secret reference is in the vh.providerkey.* family native classifies as a provider key", providerSecretRef("anthropic") === "vh.providerkey.anthropic" && /^vh\.providerkey\./.test(providerSecretRef("openai-compatible")));
  ok("the vendor is told to native by NAME (so its own origin applies)",
    nativeKindFor({ kind: "anthropic", baseUrl: "https://api.anthropic.com" }) === "anthropic"
    && nativeKindFor({ kind: "gemini", baseUrl: "https://generativelanguage.googleapis.com/v1" }) === "google"
    && nativeKindFor({ kind: "openai-compatible", baseUrl: "https://api.openai.com/v1" }) === "openai"
    && nativeKindFor({ kind: "openai-compatible", baseUrl: "https://api.groq.com/openai/v1" }) === "groq"
    && nativeKindFor({ kind: "openai-compatible", baseUrl: "https://openrouter.ai/api/v1" }) === "openrouter");
  ok("a host nobody vetted is 'custom' — it has no built-in endpoint and needs a human binding", nativeKindFor({ kind: "openai-compatible", baseUrl: "https://gateway.example/v1" }) === "custom");
  ok("a lookalike host is not the vendor", nativeKindFor({ kind: "openai-compatible", baseUrl: "https://api.openai.com.evil.example/v1" }) === "custom" && nativeKindFor({ kind: "openai-compatible", baseUrl: "https://api.openai.com@evil.example/v1" }) === "custom");
  ok("the vendor's own endpoint is native's built-in (no URL sent, no binding needed)", nativeEndpointFor({ kind: "openai-compatible", baseUrl: "https://api.openai.com/v1" }) === undefined && nativeEndpointFor({ kind: "anthropic", baseUrl: "https://api.anthropic.com/" }) === undefined);
  ok("a gateway sends its FULL endpoint so native can check its origin against what a human bound",
    nativeEndpointFor({ kind: "openai-compatible", baseUrl: "https://gateway.example/v1/" }) === "https://gateway.example/v1/chat/completions"
    && nativeEndpointFor({ kind: "anthropic", baseUrl: "https://proxy.example" }) === "https://proxy.example/v1/messages");

  setHost(true);
  const base = { kind: "openai-compatible" as const, baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini" };
  const saved = await saveNativeProvider(base, KEY);
  ok("saving hands the key to native (secret_set) and reports where it went", saved.ok && saved.secretRef === "vh.providerkey.openai-compatible" && /OS keychain/.test(saved.note), saved.note);
  ok("the key crossed the bridge exactly once, in secret_set", calls("secret_set").length === 1 && calls("secret_set")[0].args.value === KEY && wire.filter((w) => JSON.stringify(w.args).includes(KEY)).length === 1);
  ok("the vendor's own host needs NO binding (and a stale one is dropped)", calls("provider_bind_endpoint").length === 0 && calls("provider_unbind_endpoint").length === 1);

  const cfg: ProviderConfig = { ...base, apiKey: "", secretRef: saved.secretRef };
  const r1 = await complete(cfg, "be brief", "say hello");
  ok("a completion with a key REFERENCE is made natively and works", r1.ok === true && (r1.ok && r1.text === "hello from the native side"), JSON.stringify(r1));
  const chat = calls("llm_chat")[0]?.args.req as Record<string, unknown> | undefined;
  ok("the provider call carries the reference and the vendor name — never the key, never a URL for the vendor's own host",
    !!chat && chat.secret_ref === saved.secretRef && chat.provider === "openai" && chat.base_url === undefined && !JSON.stringify(chat).includes(KEY));
  ok("THE INVARIANT: after secret_set the key appears in no other native call", !JSON.stringify(wire.slice(1)).includes(KEY));
  persistNativeConfig({ ...cfg, apiKey: KEY }); // even if a caller passes the key in, it must not be written
  ok("the remembered settings contain no key at all", !(store.getItem(NATIVE_PROVIDER_CONFIG_KEY) ?? "").includes(KEY) && /"apiKey":""/.test(store.getItem(NATIVE_PROVIDER_CONFIG_KEY) ?? ""));
  const restored = await loadNativeConfig();
  ok("on the next launch the settings come back only because native still holds the key", restored?.secretRef === saved.secretRef && restored?.apiKey === "");

  // a gateway: the binding carries the FULL endpoint, through a native dialog
  wire.length = 0;
  const gw = await saveNativeProvider({ kind: "openai-compatible", baseUrl: "https://gateway.example/v1", model: "m" }, "");
  ok("a blank key keeps the stored key and still binds the new endpoint", gw.ok && calls("secret_set").length === 0 && calls("secret_exists").length === 1, gw.note);
  ok("the gateway is bound with its full endpoint (native checks the ORIGIN a human approves)", calls("provider_bind_endpoint")[0]?.args.baseUrl === "https://gateway.example/v1/chat/completions" && calls("provider_bind_endpoint")[0]?.args.secretRef === saved.secretRef);
  declineBinding = true;
  const declined = await saveNativeProvider({ kind: "openai-compatible", baseUrl: "https://other.example/v1", model: "m" }, "");
  ok("a declined binding is a refusal in words — the key cannot be sent there", !declined.ok && /not approved/.test(declined.note) && /cannot be sent there/.test(declined.note), declined.note);
  declineBinding = false;

  // failures keep their meaning across the bridge
  for (const [native, kind] of [
    ["provider returned HTTP 401: invalid api key", "http-error"],
    ["this provider's key may only be sent to https://api.openai.com or to an endpoint you bound with a native confirmation — https://evil.example is neither", "egress-blocked"],
    ["secret not found: vh.providerkey.openai-compatible", "no-key"],
    ["provider timed out after 120000ms", "timeout"],
  ] as const) {
    chatError = native;
    const r = await complete(cfg, "s", "u");
    ok(`a native failure keeps its kind: ${kind}`, !r.ok && r.kind === kind, JSON.stringify(r));
  }
  chatError = null;

  // the browser has no native side: a reference is an honest refusal, never "fixed" with an empty key
  setHost(false);
  wire.length = 0;
  const web = await complete(cfg, "s", "u");
  ok("a key REFERENCE in the browser is refused in words and nothing is sent", !web.ok && web.kind === "no-key" && /desktop keychain/.test(web.ok ? "" : web.error) && wire.length === 0, JSON.stringify(web));
  ok("the browser never claims to restore a native-held provider", (await loadNativeConfig()) === null);
}

console.log(`\n${passed} passed, ${failed} failed.`);
if (failed) {
  console.log(failures.map((f) => `  - ${f}`).join("\n"));
  process.exit(1);
}
