import { createRequire as __mjCreateRequire } from "node:module"; const require = __mjCreateRequire(import.meta.url);

// probe/antigravity.test.ts
import * as fs from "node:fs";
import * as path from "node:path";

// src/security/ipClassify.ts
function expandIpv6(input) {
  let s = input;
  const zone = s.indexOf("%");
  if (zone !== -1) s = s.slice(0, zone);
  if (!s.includes(":")) return null;
  const lastColon = s.lastIndexOf(":");
  const tail = s.slice(lastColon + 1);
  if (tail.includes(".")) {
    const v4 = parseIpv4(tail);
    if (!v4) return null;
    s = `${s.slice(0, lastColon + 1)}${(v4[0] << 8 | v4[1]).toString(16)}:${(v4[2] << 8 | v4[3]).toString(16)}`;
  }
  const halves = s.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const rest = halves.length === 2 ? halves[1] ? halves[1].split(":") : [] : [];
  const missing = 8 - head.length - rest.length;
  if (halves.length === 1) {
    if (head.length !== 8) return null;
  } else if (missing < 0) {
    return null;
  }
  const groups = [];
  for (const g of head) groups.push(parseInt(g, 16));
  for (let i = 0; i < missing; i += 1) groups.push(0);
  for (const g of rest) groups.push(parseInt(g, 16));
  if (groups.length !== 8 || groups.some((g) => !Number.isInteger(g) || g < 0 || g > 65535)) return null;
  return groups;
}
function parseIpv4(input) {
  const parts = input.split(".");
  if (parts.length !== 4) return null;
  const octets = [];
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return null;
    const n = Number(p);
    if (n > 255) return null;
    octets.push(n);
  }
  return octets;
}
function isObfuscatedIpv4Literal(host) {
  if (/^\d{1,3}(\.\d{1,3}){0,2}$/.test(host)) return true;
  if (/^0[xX][0-9a-fA-F]{1,8}$/.test(host)) return true;
  return false;
}
function normalizeHost(rawHost) {
  const host = rawHost.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (!host) return { kind: "unknown", ip: "" };
  const v4 = parseIpv4(host);
  if (v4) return { kind: "ipv4", ip: v4.join("."), octets: v4 };
  if (host.includes(":")) {
    const groups = expandIpv6(host);
    if (groups) {
      const isMapped = groups.slice(0, 5).every((g) => g === 0) && (groups[5] === 65535 || groups[5] === 0);
      if (isMapped) {
        const octets = [groups[6] >> 8, groups[6] & 255, groups[7] >> 8, groups[7] & 255];
        return { kind: "ipv4", ip: octets.join("."), octets };
      }
      return { kind: "ipv6", ip: groups.map((g) => g.toString(16).padStart(4, "0")).join(":"), groups };
    }
  }
  if (isObfuscatedIpv4Literal(host)) return { kind: "unknown", ip: "" };
  return { kind: "unknown", ip: "" };
}
function classifyV4(o, allowLoopback) {
  const [a, b] = o;
  const inCidr = (base, bits) => {
    let acc = 0;
    for (let i = 0; i < 4; i += 1) {
      const rem = bits - i * 8;
      const mask = rem <= 0 ? 0 : rem >= 8 ? 255 : 255 << 8 - rem & 255;
      if ((o[i] & mask) !== (base[i] & mask)) return false;
      acc += 1;
      if (acc > 4) break;
    }
    return true;
  };
  const C = (scope, reason) => ({ ok: false, reason, scope });
  if (a === 127) return allowLoopback ? { ok: true, reason: "", scope: "loopback" } : C("loopback", "loopback address refused (SSRF guard)");
  if (a === 169 && b === 254) {
    if (o[2] === 169 && o[3] === 254) return C("metadata", "cloud metadata endpoint refused (SSRF guard)");
    return C("link-local", "link-local address refused (SSRF guard)");
  }
  if (inCidr([0, 0, 0, 0], 8)) return C("reserved", "this-network address refused (SSRF guard)");
  if (inCidr([10, 0, 0, 0], 8)) return C("private", "private network address refused (SSRF guard)");
  if (inCidr([100, 64, 0, 0], 10)) return C("special", "carrier-grade NAT address refused (SSRF guard)");
  if (inCidr([172, 16, 0, 0], 12)) return C("private", "private network address refused (SSRF guard)");
  if (inCidr([192, 0, 0, 0], 24)) return C("special", "IETF protocol assignment refused (SSRF guard)");
  if (inCidr([192, 0, 2, 0], 24)) return C("special", "documentation range refused (SSRF guard)");
  if (inCidr([192, 88, 99, 0], 24)) return C("special", "6to4 relay anycast refused (SSRF guard)");
  if (inCidr([192, 168, 0, 0], 16)) return C("private", "private network address refused (SSRF guard)");
  if (inCidr([198, 18, 0, 0], 15)) return C("special", "benchmarking range refused (SSRF guard)");
  if (inCidr([198, 51, 100, 0], 24)) return C("special", "documentation range refused (SSRF guard)");
  if (inCidr([203, 0, 113, 0], 24)) return C("special", "documentation range refused (SSRF guard)");
  if (a >= 224 && a <= 239) return C("multicast", "multicast address refused (SSRF guard)");
  if (a >= 240) return C("reserved", "reserved address refused (SSRF guard)");
  return { ok: true, reason: "", scope: "public" };
}
function classifyV6(g, allowLoopback) {
  const hex = g.map((x) => x.toString(16).padStart(4, "0")).join(":");
  const C = (scope, reason) => ({ ok: false, reason, scope });
  if (g.slice(0, 7).every((x) => x === 0) && g[7] === 1) {
    return allowLoopback ? { ok: true, reason: "", scope: "loopback" } : C("loopback", "IPv6 loopback refused (SSRF guard)");
  }
  if (g.slice(0, 7).every((x) => x === 0) && g[7] === 0) return C("reserved", "unspecified address refused (SSRF guard)");
  if ((g[0] & 65024) === 64512) return C("private", "IPv6 unique-local refused (SSRF guard)");
  if ((g[0] & 65472) === 65152) return C("link-local", "IPv6 link-local refused (SSRF guard)");
  if ((g[0] & 65280) === 65280) return C("multicast", "IPv6 multicast refused (SSRF guard)");
  if (g[0] === 8193 && g[1] === 3512) return C("special", "IPv6 documentation range refused (SSRF guard)");
  if (g[0] === 100 && g[1] === 65435) {
    const octets = [g[6] >> 8, g[6] & 255, g[7] >> 8, g[7] & 255];
    const inner = classifyV4(octets, allowLoopback);
    return inner.ok ? inner : C(inner.scope, `NAT64-embedded address refused (SSRF guard): ${inner.reason}`);
  }
  if (g[0] === 8194) return C("special", `6to4 address refused (SSRF guard): ${hex}`);
  if (g[0] === 8193 && g[1] === 0) return C("special", `Teredo address refused (SSRF guard): ${hex}`);
  return { ok: true, reason: "", scope: "public" };
}
function classifyIp(n, allowLoopback) {
  if (n.kind === "ipv4" && n.octets) return classifyV4(n.octets, allowLoopback);
  if (n.kind === "ipv6" && n.groups) return classifyV6(n.groups, allowLoopback);
  return { ok: false, reason: "address could not be classified", scope: "unknown" };
}
function classifyHost(rawHost, allowLoopback = false) {
  return classifyIp(normalizeHost(rawHost), allowLoopback);
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
var BLOCKED_HOST_SUFFIXES = [".internal", ".local", ".localhost"];
function checkEgressUrl(raw, opts = {}) {
  let u;
  try {
    u = new URL(raw);
  } catch {
    return { ok: false, reason: "not a parseable URL" };
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    return { ok: false, reason: `scheme "${u.protocol}" refused \u2014 only http(s) egress is allowed` };
  }
  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "metadata.google.internal") {
    return { ok: false, reason: "cloud metadata endpoint refused (SSRF guard)" };
  }
  for (const sfx of BLOCKED_HOST_SUFFIXES) {
    if (host.endsWith(sfx)) return { ok: false, reason: `host suffix "${sfx}" refused` };
  }
  const verdict = classifyHost(host, opts.allowLoopback ?? true);
  if (verdict.ok || verdict.scope === "unknown") return { ok: true, reason: "" };
  return { ok: false, reason: verdict.reason };
}
var callRateGate = new RateGate(120, 6e4);

// src/auth/antigravity.ts
var LOOPBACK_HOSTS = /* @__PURE__ */ new Set(["127.0.0.1", "localhost", "::1", "[::1]", "0:0:0:0:0:0:0:1", "[0:0:0:0:0:0:0:1]"]);
var LOOPBACK_IPV4 = /^127\.(?:\d{1,3}\.){2}\d{1,3}$/;
function verifyLoopbackEndpoint(raw) {
  const refuse = (reason) => ({ ok: false, origin: "", reason });
  const candidate = (raw ?? "").trim();
  if (!candidate) return refuse("the runtime did not report an endpoint, so there is nothing to connect to");
  let url;
  try {
    url = new URL(candidate);
  } catch {
    return refuse(`"${truncate(candidate)}" is not a URL, so it was not contacted`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return refuse(`scheme ${url.protocol} is not http(s); the ACP surface is contacted over http(s) only`);
  }
  if (url.username || url.password) {
    return refuse("the endpoint carried credentials in its URL \u2014 a runtime has no reason to send us a secret, and none was forwarded");
  }
  if (!url.port) {
    return refuse("the endpoint named no port, so a default port would have been assumed; the ACP surface is always explicit about its port");
  }
  if (url.pathname !== "" && url.pathname !== "/") {
    return refuse(`the endpoint carried a path ("${truncate(url.pathname)}"); only a bare origin is accepted, so a path cannot redirect us onto another handler`);
  }
  if (url.search || url.hash) {
    return refuse("the endpoint carried a query or fragment; only a bare origin is accepted");
  }
  const host = url.hostname.toLowerCase();
  const isLoopback = LOOPBACK_HOSTS.has(host) || LOOPBACK_IPV4.test(host);
  if (!isLoopback) {
    return refuse(`"${truncate(host)}" is not a loopback address. A mission may only be sent to a runtime on this machine, so a remote endpoint was refused and nothing was sent.`);
  }
  const egress = checkEgressUrl(url.origin);
  if (!egress.ok) return refuse(`refused by the product egress guard: ${egress.reason}`);
  return { ok: true, origin: url.origin, reason: "loopback origin verified" };
}
function truncate(s, max = 60) {
  const t = (s ?? "").slice(0, max);
  return t.length < (s ?? "").length ? `${t}\u2026` : t;
}
var ANTIGRAVITY_DISCOVERY_ENV = "SELFIMPULSE_ANTIGRAVITY_ENDPOINT";
var DEFAULT_PORTS = [9119, 9120, 8080];
function candidateEndpoints() {
  const out = [];
  let override;
  try {
    override = globalThis.process?.env?.[ANTIGRAVITY_DISCOVERY_ENV]?.trim();
  } catch {
    override = void 0;
  }
  if (override) out.push(override);
  for (const port of DEFAULT_PORTS) {
    out.push(`http://127.0.0.1:${port}`);
    out.push(`http://localhost:${port}`);
  }
  return out;
}
function antigravityCanExecute(status) {
  if (status.presence !== "present" || status.signIn !== "signed-in" || !status.endpoint) return false;
  return verifyLoopbackEndpoint(status.endpoint).ok;
}
function quotaHint(status) {
  if (status.presence !== "present") return "No Antigravity runtime is running.";
  if (status.signIn === "signed-out") return "Antigravity is signed out. Sign in inside Antigravity itself.";
  if (status.signIn !== "signed-in") return "Antigravity did not confirm a signed-in account, so no quota is claimed.";
  if (!status.quota?.remaining) {
    return "Antigravity is signed in but did not report a remaining allowance, so this call can still be refused when Google's quota runs out.";
  }
  return `Antigravity reports ${status.quota.remaining} remaining. Consumer plan quotas are small and reset on Google's schedule, so a long mission can still stop mid-run.`;
}
async function completeViaAntigravity(status, args) {
  if (status.presence !== "present") {
    return { ok: false, kind: "runtime-absent", error: "No Antigravity runtime is running, so nothing was executed." };
  }
  if (status.signIn === "signed-out") {
    return { ok: false, kind: "not-signed-in", error: "Antigravity is signed out, so nothing was executed. Sign in inside Antigravity itself." };
  }
  if (status.signIn !== "signed-in") {
    return { ok: false, kind: "not-signed-in", error: "Antigravity did not confirm a signed-in account, so nothing was executed." };
  }
  const verdict = verifyLoopbackEndpoint(status.endpoint ?? "");
  if (!verdict.ok) {
    return { ok: false, kind: "egress-blocked", error: `Antigravity endpoint refused: ${verdict.reason}. Nothing was sent.` };
  }
  const fetchImpl = args.fetchImpl ?? globalThis.fetch?.bind(globalThis);
  if (!fetchImpl) {
    return { ok: false, kind: "http-error", error: "This runtime has no fetch, so nothing was executed." };
  }
  const timeoutMs = args.timeoutMs ?? 12e4;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const t0 = Date.now();
  try {
    const res = await fetchImpl(`${verdict.origin}/complete`, {
      method: "POST",
      signal: controller.signal,
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ system: args.system, user: args.user, model: args.model })
    });
    const latencyMs = Date.now() - t0;
    if (res.status === 429 || res.status === 403) {
      const detail = (await res.text().catch(() => "")).slice(0, 200);
      return {
        ok: false,
        kind: "quota-exhausted",
        error: `Antigravity refused the call (HTTP ${res.status}) \u2014 your Google plan quota is exhausted or not entitled.${detail ? ` ${detail}` : ""} Nothing was executed.`
      };
    }
    if (!res.ok) {
      const detail = (await res.text().catch(() => "")).slice(0, 200);
      return { ok: false, kind: "http-error", error: `Antigravity returned HTTP ${res.status}.${detail ? ` ${detail}` : ""} Nothing was executed.` };
    }
    const body = await res.json().catch(() => null);
    const text = extractCompletionText(body);
    if (text === null || text.trim().length === 0) {
      return { ok: false, kind: "bad-response", error: "Antigravity returned no usable text, so nothing was executed. This app never invents an answer." };
    }
    return { ok: true, text, model: args.model ?? status.quota?.model ?? "antigravity", latencyMs };
  } catch (err) {
    const aborted = err instanceof Error && err.name === "AbortError";
    return {
      ok: false,
      kind: aborted ? "timeout" : "http-error",
      error: aborted ? `Antigravity did not answer within ${timeoutMs}ms. Nothing was executed.` : `Could not reach the Antigravity runtime on this machine: ${err instanceof Error ? err.message : String(err)}.`
    };
  } finally {
    clearTimeout(timer);
  }
}
function extractCompletionText(body) {
  if (body == null) return null;
  if (typeof body === "string") return body.trim() ? body : null;
  if (Array.isArray(body)) {
    const parts = body.filter((p) => !!p && typeof p === "object" && !Array.isArray(p)).map((p) => {
      if (p.thought === true) return "";
      return typeof p.text === "string" ? p.text : "";
    }).filter(Boolean);
    return parts.length ? parts.join("") : null;
  }
  if (typeof body !== "object") return null;
  const b = body;
  for (const key of ["text", "content", "completion", "result", "output"]) {
    const v = b[key];
    if (typeof v === "string" && v.trim()) return v;
  }
  if (Array.isArray(b.content)) {
    const parts = b.content.map((c) => {
      if (typeof c === "string") return c;
      if (c && typeof c === "object") {
        const cb = c;
        if (cb.thought) return "";
        return typeof cb.text === "string" ? cb.text : "";
      }
      return "";
    }).filter(Boolean);
    if (parts.length) return parts.join("");
  }
  if (b.message && typeof b.message === "object") return extractCompletionText(b.message);
  return null;
}

// src/engine/vault.ts
var enc = new TextEncoder();
var dec = new TextDecoder();

// src/auth/pkce.ts
var TE = new TextEncoder();

// src/auth/googleOAuth.ts
var PENDING_TTL_MS = 10 * 60 * 1e3;

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

// probe/antigravity.test.ts
var ROOT = process.env.SI_ROOT ?? process.cwd();
var readSrc = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
var passed = 0;
var failed = 0;
var failures = [];
function ok(label, cond, detail = "") {
  if (cond) {
    passed += 1;
    console.log(`  ok   ${label}`);
  } else {
    failed += 1;
    failures.push(`${label}${detail ? ` \u2014 ${detail}` : ""}`);
    console.log(`  FAIL ${label}${detail ? ` \u2014 ${detail}` : ""}`);
  }
}
function section(name) {
  console.log(`
== ${name}`);
}
section("1. the loopback gate refuses everything that is not this machine");
{
  const REMOTE = [
    ["https://evil.example/collect", "a public host a hostile runtime named"],
    ["https://generativelanguage.googleapis.com/v1", "Google's real API \u2014 still not ours to post a mission to"],
    ["http://10.0.0.5:9119", "RFC1918"],
    ["http://192.168.1.10:9119", "RFC1918"],
    ["http://169.254.169.254:80", "cloud metadata"],
    ["http://[fd00::1]:9119", "IPv6 unique-local"],
    ["http://attacker.local:9119", "an .local name"],
    ["http://metadata.google.internal:9119", "an .internal name"]
  ];
  for (const [url, why] of REMOTE) {
    const v = verifyLoopbackEndpoint(url);
    ok(`refused \u2014 ${why} (${url})`, !v.ok, v.reason);
    ok(`  ...and yields no origin to build a request from`, v.origin === "", v.origin);
  }
  for (const [url, why] of [
    ["http://127.0.0.1.evil.example:9119", "a loopback-looking prefix in a real domain"],
    ["http://evil.example#127.0.0.1:9119", "loopback hidden in a fragment"],
    ["http://evil.example?x=127.0.0.1:9119", "loopback hidden in a query"]
  ]) {
    ok(`refused \u2014 ${why}`, !verifyLoopbackEndpoint(url).ok);
  }
  for (const [url, normalized] of [
    ["http://2130706433:9119", "decimal"],
    ["http://0x7f.0.0.1:9119", "hex"],
    ["http://127.1:9119", "short-form"]
  ]) {
    const v = verifyLoopbackEndpoint(url);
    const parsed = new URL(url);
    ok(`${normalized} spelling normalizes to literal loopback`, parsed.hostname === "127.0.0.1", parsed.hostname);
    ok(`  ...so it resolves to this machine and is allowed (${url})`, v.ok, v.reason);
    ok(`  ...and the origin we hand back is the normalized one`, v.ok && v.origin === "http://127.0.0.1:9119", v.origin);
  }
  for (const [url, why] of [
    ["http://127.0.0.1:80@evil.example:9119", "userinfo smuggling"],
    ["http://evil.example:9119#@127.0.0.1", "loopback in a fragment"]
  ]) {
    ok(`refused \u2014 ${why}`, !verifyLoopbackEndpoint(url).ok, verifyLoopbackEndpoint(url).reason);
  }
}
section("2. the loopback gate accepts exactly the local runtime");
{
  for (const [url, why] of [
    ["http://127.0.0.1:9119", "the documented ACP port"],
    ["http://localhost:9119", "the localhost spelling"],
    ["https://127.0.0.1:9119", "https loopback"],
    ["http://127.0.0.53:9119", "another 127.x address"]
  ]) {
    const v2 = verifyLoopbackEndpoint(url);
    ok(`allowed \u2014 ${why} (${url})`, v2.ok, v2.reason);
  }
  {
    const v6 = verifyLoopbackEndpoint("http://[::1]:9119");
    ok("IPv6 loopback is refused by the shared egress guard, not exempted", !v6.ok, v6.reason);
    ok("  ...and yields no origin", v6.origin === "", v6.origin);
  }
  for (const [url, why] of [
    ["http://127.0.0.1", "no port \u2014 a default port would be assumed"],
    ["http://127.0.0.1:9119/collect", "a path \u2014 how you reach a different handler"],
    ["http://127.0.0.1:9119?next=evil", "a query"],
    ["http://127.0.0.1:9119#x", "a fragment"],
    ["file:///etc/passwd", "a non-http scheme"],
    ["gopher://127.0.0.1:9119", "a non-http scheme on loopback"],
    ["", "an empty string"]
  ]) {
    ok(`refused \u2014 ${why}`, !verifyLoopbackEndpoint(url).ok);
  }
  const v = verifyLoopbackEndpoint("http://127.0.0.1:9119/");
  ok("a trailing-slash origin is normalized, not passed through raw", v.ok && v.origin === "http://127.0.0.1:9119", v.origin);
}
section("3. discovery only ever proposes loopback");
{
  const cands = candidateEndpoints();
  ok("there is at least one candidate to probe", cands.length > 0);
  for (const c of cands) {
    ok(`every candidate is loopback (${c})`, verifyLoopbackEndpoint(c).ok, verifyLoopbackEndpoint(c).reason);
  }
}
section("4. a subscription is never laundered into model access");
{
  const base = { presence: "present", signIn: "unknown", endpoint: "http://127.0.0.1:9119", message: "" };
  ok("present + signed-in + endpoint \u21D2 can execute", antigravityCanExecute({ ...base, signIn: "signed-in" }));
  ok("signed-OUT never grants execution", !antigravityCanExecute({ ...base, signIn: "signed-out" }));
  ok("an UNKNOWN sign-in never grants execution", !antigravityCanExecute({ ...base, signIn: "unknown" }));
  ok("absent never grants execution", !antigravityCanExecute({ ...base, presence: "absent", signIn: "signed-in" }));
  ok("signed-in with NO endpoint does not grant execution", !antigravityCanExecute({ ...base, signIn: "signed-in", endpoint: null }));
  ok("signed-in with a REMOTE endpoint does not grant execution", !antigravityCanExecute({ ...base, signIn: "signed-in", endpoint: "https://evil.example" }));
  ok("signed-in with a path-bearing endpoint does not grant execution", !antigravityCanExecute({ ...base, signIn: "signed-in", endpoint: "http://127.0.0.1:9119/collect" }));
  ok("signed-in with a port-less loopback endpoint does not grant execution", !antigravityCanExecute({ ...base, signIn: "signed-in", endpoint: "http://127.0.0.1" }));
}
section("5. the UI is told the truth about quota, not a promise");
{
  const mk = (p) => ({ presence: "present", signIn: "signed-in", endpoint: "http://127.0.0.1:9119", message: "", ...p });
  const hints = {
    absent: quotaHint(mk({ presence: "absent" })),
    out: quotaHint(mk({ signIn: "signed-out" })),
    unknown: quotaHint(mk({ signIn: "unknown" })),
    noAllowance: quotaHint(mk({})),
    allowance: quotaHint(mk({ quota: { remaining: "3 prompts", observedAt: 0 } }))
  };
  ok("absent is stated plainly", /no antigravity runtime is running/i.test(hints.absent), hints.absent);
  ok("signed-out says where to sign in", /sign in inside antigravity/i.test(hints.out), hints.out);
  ok("an unknown sign-in claims no quota", /no quota is claimed/i.test(hints.unknown), hints.unknown);
  ok("a missing allowance warns the call can still be refused", /can still be refused/i.test(hints.noAllowance), hints.noAllowance);
  ok("a real allowance still warns a long mission can stop mid-run", /stop mid-run/i.test(hints.allowance), hints.allowance);
  for (const [k, h] of Object.entries(hints)) ok(`  ...no hint is empty (${k})`, h.trim().length > 0);
}
section("6. a completion is never fabricated");
{
  const good = { presence: "present", signIn: "signed-in", endpoint: "http://127.0.0.1:9119", message: "" };
  const mustNotCall = (async () => {
    throw new Error("must not be called");
  });
  let r = await completeViaAntigravity({ ...good, presence: "absent" }, { system: "s", user: "u", fetchImpl: mustNotCall });
  ok("absent runtime refuses without contacting anything", !r.ok && r.kind === "runtime-absent");
  r = await completeViaAntigravity({ ...good, signIn: "signed-out" }, { system: "s", user: "u", fetchImpl: mustNotCall });
  ok("signed-out refuses without contacting anything", !r.ok && r.kind === "not-signed-in");
  r = await completeViaAntigravity({ ...good, signIn: "unknown" }, { system: "s", user: "u", fetchImpl: mustNotCall });
  ok("an unknown sign-in refuses without contacting anything", !r.ok && r.kind === "not-signed-in");
  r = await completeViaAntigravity({ ...good, endpoint: "https://evil.example" }, { system: "s", user: "u", fetchImpl: mustNotCall });
  ok("a signed-in status naming a remote endpoint is refused", !r.ok && r.kind === "egress-blocked");
  const quotaFetch = (async () => new Response("quota exceeded", { status: 429 }));
  r = await completeViaAntigravity(good, { system: "s", user: "u", fetchImpl: quotaFetch });
  ok("HTTP 429 is reported as quota-exhausted", !r.ok && r.kind === "quota-exhausted");
  ok("  ...and says nothing was executed", /nothing was executed/i.test(r.ok ? "" : r.error));
  const forbidden = (async () => new Response("not entitled", { status: 403 }));
  r = await completeViaAntigravity(good, { system: "s", user: "u", fetchImpl: forbidden });
  ok("HTTP 403 is also quota/not-entitled, not a generic error", !r.ok && r.kind === "quota-exhausted");
  const emptyFetch = (async () => new Response(JSON.stringify({ text: "" }), { status: 200 }));
  r = await completeViaAntigravity(good, { system: "s", user: "u", fetchImpl: emptyFetch });
  ok("an empty completion is bad-response, never an empty success", !r.ok && r.kind === "bad-response");
  const nullFetch = (async () => new Response(JSON.stringify({}), { status: 200 }));
  r = await completeViaAntigravity(good, { system: "s", user: "u", fetchImpl: nullFetch });
  ok("a body with no text field is bad-response too", !r.ok && r.kind === "bad-response");
  const goodFetch = (async () => new Response(JSON.stringify({ text: "hello" }), { status: 200 }));
  const res = await completeViaAntigravity(good, { system: "s", user: "u", fetchImpl: goodFetch });
  ok("a real completion is returned verbatim", res.ok && res.text === "hello", JSON.stringify(res));
}
section("7. the completion reader tolerates envelopes but never guesses");
{
  ok("plain string", extractCompletionText("hi") === "hi");
  ok("{text}", extractCompletionText({ text: "hi" }) === "hi");
  ok("{content} string", extractCompletionText({ content: "hi" }) === "hi");
  ok("anthropic content blocks", extractCompletionText({ content: [{ type: "text", text: "a" }, { type: "text", text: "b" }] }) === "ab");
  ok(
    "thought parts are dropped \u2014 reasoning is not the answer",
    extractCompletionText({ content: [{ type: "text", text: "real" }, { type: "text", text: "hidden", thought: true }] }) === "real"
  );
  ok("nested {message:{text}}", extractCompletionText({ message: { text: "hi" } }) === "hi");
  ok("a bare string array is refused \u2014 it is not a shape we understand", extractCompletionText(["x"]) === null);
  ok("a mixed array yields only the understood parts", extractCompletionText([{ text: "a" }, "junk", { text: "b" }]) === "ab");
  for (const [bad, why] of [[null, "null"], [{}, "an empty object"], [{ text: "" }, "an empty string"], [[], "an empty array"], [42, "a number"], [true, "a boolean"]]) {
    ok(`returns null for ${why} \u2014 never ""`, extractCompletionText(bad) === null);
  }
}
section("8. Antigravity is a TRANSPORT, not an agent \u2014 the source says so");
{
  const stripComments = (text) => text.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
  const src = stripComments(readSrc("src/auth/antigravity.ts"));
  ok("the module has code to check", src.trim().length > 500);
  ok("it never spawns a process", !/child_process|spawn\(|execFile|execSync|Command::new/.test(src));
  ok("it imports nothing from node:", !/from ["']node:/.test(src));
  for (const needle of ["oauth", "client_id", "clientId", "client_secret", "access_token", "accessToken", "refresh_token", "refreshToken", "accounts.google.com", "googleapis.com/token"]) {
    ok(`carries no Google OAuth surface: ${needle}`, !src.includes(needle));
  }
  ok("it holds no credential field at all", !/\bapiKey\b/.test(src));
  for (const needle of ["autonomyArms", "custody", "seatArgv", "harnessRunner", "agentLoop"]) {
    ok(`it does not own the agent loop: no ${needle}`, !src.includes(needle));
  }
  const doc = readSrc("src/auth/antigravity.ts");
  ok("the file states the trust cost it adds", /closed-source process to the trust boundary/i.test(doc));
  ok("the file states that nothing is spawned", /never install it, never launch it/i.test(doc));
  ok("the file explains it ships no Google binary", /ship no Google binary/i.test(doc));
}
section("9. the external-CLI ban is amended explicitly, not silently");
{
  ok("the ban probe still exists", fs.existsSync(path.join(ROOT, "probe/noExternalCli.test.ts")));
  const ban = readSrc("probe/noExternalCli.test.ts");
  ok("it still pins the agent CLIs by name", /EXTERNAL_BINS/.test(ban) && /"claude"/.test(ban) && /"codex"/.test(ban));
  ok("it still pins that the ACP wire is deleted", /acp\.rs .* is deleted|acp\.rs — the external agent wire — is deleted/i.test(ban));
  ok("it records the Antigravity carve-out in writing", /antigravity/i.test(ban));
  ok("  ...and explains the transport-vs-agent distinction", /transport/i.test(ban) && /not an agent|not\b.*agent\b/i.test(ban));
  section("10. the auth status model treats a runtime as a fact, not a preference");
  {
    const baseFacts = { googleConnected: false, openaiConnected: false };
    const agy = (p) => ({
      enabled: false,
      presence: "absent",
      signIn: "unknown",
      message: "test",
      ...p
    });
    const off = deriveAuthState({ ...baseFacts, antigravity: agy({ enabled: true }) });
    ok("switched on but no runtime \u21D2 still no model access", !off.canExecute && off.modelAccess === "none");
    ok("  ...and the toggle is reported as a preference, not a connection", off.antigravity.enabled === true && off.antigravity.hasRuntime === false);
    ok("  ...and the state is honest", assertHonest(off) === null);
    const installed = deriveAuthState({ ...baseFacts, antigravity: agy({ enabled: true, presence: "present", signIn: "signed-out" }) });
    ok("a runtime that is present but signed out grants nothing", !installed.canExecute && installed.antigravity.hasRuntime === true);
    ok("  ...and the state is honest", assertHonest(installed) === null);
    ok("  ...and the badge does not say 'connected'", !/^connected$/i.test(statusBadge(installed).label), statusBadge(installed).label);
    const live = deriveAuthState({ ...baseFacts, antigravity: agy({ enabled: true, presence: "present", signIn: "signed-in", message: "running" }) });
    ok("a signed-in runtime grants model access", live.canExecute && live.modelAccess === "antigravity");
    ok("  ...and the state is honest", assertHonest(live) === null);
    ok("  ...and the badge names it as a local runtime, not a connection", /local runtime/i.test(statusBadge(live).label), statusBadge(live).label);
    ok("  ...and the description never calls it an API key", !/api key/i.test(describeAccess(live)), describeAccess(live));
    const forged = { ...live, antigravity: { ...live.antigravity, hasRuntime: false } };
    ok("signed-in without a runtime is rejected by assertHonest", assertHonest(forged) !== null, assertHonest(forged) ?? "accepted");
    const switchedOff = { ...live, antigravity: { ...live.antigravity, enabled: false } };
    ok("signed-in while switched off is rejected by assertHonest", assertHonest(switchedOff) !== null, assertHonest(switchedOff) ?? "accepted");
    ok("the empty state is still honest", assertHonest(EMPTY_AUTH_STATE) === null);
    ok("a Gemini key still wins over the new field", deriveAuthState({ googleConnected: true, googleCredential: "api-key", openaiConnected: false, antigravity: agy({ enabled: true, presence: "present", signIn: "signed-in" }) }).modelAccess === "gemini");
    ok("both keys still report 'both'", deriveAuthState({ googleConnected: true, googleCredential: "api-key", openaiConnected: true, openaiApiKey: true }).modelAccess === "both");
  }
}
console.log(`
${passed} passed, ${failed} failed.`);
if (failed) {
  console.log(failures.map((f) => `  - ${f}`).join("\n"));
  process.exit(1);
}
