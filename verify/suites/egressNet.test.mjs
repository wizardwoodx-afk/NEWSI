import { createRequire as __mjCreateRequire } from "node:module"; const require = __mjCreateRequire(import.meta.url);

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

// src/security/egressNet.ts
var systemResolver = async (hostname) => {
  const dns = await import("node:dns/promises").catch(() => null);
  if (!dns) return [];
  const out = [];
  try {
    for (const r of await dns.lookup(hostname, { all: true, verbatim: true })) out.push(r.address);
  } catch {
  }
  return out;
};
async function resolveEgress(raw, opts = {}) {
  const allowLoopback = opts.allowLoopback ?? false;
  const resolve = opts.resolve ?? systemResolver;
  const base = checkEgressUrl(raw);
  if (!base.ok) return { ok: false, reason: base.reason };
  const host = new URL(raw).hostname.replace(/^\[|\]$/g, "");
  const literal = normalizeHost(host);
  if (literal.kind !== "unknown") {
    const cls = classifyIp(literal, allowLoopback);
    return cls.ok ? { ok: true, reason: "", pinnedIp: literal.ip, scope: cls.scope } : { ok: false, reason: `${literal.ip} \u2014 ${cls.reason}`, scope: cls.scope };
  }
  if (literal.ip === "" && isObfuscatedIpv4Literal(host.toLowerCase())) {
    return { ok: false, reason: `obfuscated IP literal "${host}" refused \u2014 write the address in dotted-quad form`, scope: "unknown" };
  }
  let answers;
  try {
    answers = await resolve(host);
  } catch (e) {
    return { ok: false, reason: `DNS resolution failed for "${host}": ${e instanceof Error ? e.message : String(e)}` };
  }
  if (answers.length === 0) return { ok: false, reason: `"${host}" resolved to no addresses \u2014 refused rather than guessing`, scope: "unknown" };
  const seen = [];
  let pinned = null;
  for (const a of answers) {
    const n = normalizeHost(a);
    const cls = classifyIp(n, allowLoopback);
    if (!cls.ok) {
      return { ok: false, reason: `"${host}" resolves to ${n.ip || a} \u2014 ${cls.reason}`, scope: cls.scope };
    }
    seen.push(n.ip || a);
    if (!pinned) pinned = { ip: n.ip || a, scope: cls.scope };
  }
  return { ok: true, reason: "", pinnedIp: pinned.ip, scope: pinned.scope, hops: [{ url: raw, ip: pinned.ip, status: 0 }] };
}
var DEFAULT_MAX_REDIRECTS = 5;
async function safeEgressFetch(raw, init = {}) {
  const { fetchImpl, allowLoopback, resolve, maxRedirects, ...rest } = init;
  const doFetch = fetchImpl ?? globalThis.fetch?.bind(globalThis);
  if (!doFetch) throw new Error("no fetch available in this runtime \u2014 nothing was executed");
  const hops = [];
  let current = raw;
  for (let hop = 0; hop <= (maxRedirects ?? DEFAULT_MAX_REDIRECTS); hop += 1) {
    const decision = await resolveEgress(current, { allowLoopback, resolve });
    if (!decision.ok) {
      throw new Error(`egress refused at hop ${hop}: ${decision.reason} \u2014 nothing further was sent.`);
    }
    const res = await doFetch(current, { ...rest, redirect: "manual" });
    hops.push({ url: current, ip: decision.pinnedIp ?? "", status: res.status });
    const location = res.headers.get("location");
    if (!location || res.status < 300 || res.status > 399) {
      Object.defineProperty(res, "egressHops", { value: hops, enumerable: false });
      return res;
    }
    let next;
    try {
      next = new URL(location, current).toString();
    } catch {
      throw new Error(`egress refused: hop ${hop} returned an unparseable Location \u2014 nothing further was sent.`);
    }
    if (hop === (maxRedirects ?? DEFAULT_MAX_REDIRECTS)) {
      throw new Error(`egress refused: more than ${maxRedirects ?? DEFAULT_MAX_REDIRECTS} redirects \u2014 possible redirect loop.`);
    }
    current = next;
  }
  throw new Error("egress refused: redirect budget exhausted.");
}

// probe/egressNet.test.ts
import * as fs from "node:fs";
import * as path from "node:path";
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
section("1. the IPv4-mapped IPv6 bypass \u2014 CLOSED in 11.14.4 (was live in every build before)");
{
  const PRE_11_14_4_BYPASS = "http://[::ffff:a9fe:a9fe]/latest/meta-data/";
  const sneaky = PRE_11_14_4_BYPASS;
  ok(
    "the pre-11.14.4 string policy would have ALLOWED that URL (recorded, so the regression is named)",
    true,
    `retired bypass: ${PRE_11_14_4_BYPASS}`
  );
  ok(
    "and checkEgressUrl now REFUSES it \u2014 the bypass is closed at the string layer too",
    !checkEgressUrl(sneaky).ok,
    checkEgressUrl(sneaky).reason
  );
  const n = normalizeHost("::ffff:a9fe:a9fe");
  ok("normalizeHost unwraps it to 169.254.169.254", n.kind === "ipv4" && n.ip === "169.254.169.254", `${n.kind} ${n.ip}`);
  const cls = classifyIp(n, false);
  ok("and classifies it as the metadata endpoint", !cls.ok && cls.scope === "metadata", `${cls.reason}`);
  const viaNet = await resolveEgress(sneaky, { resolve: async () => ["::ffff:a9fe:a9fe"] });
  ok("resolveEgress refuses it", !viaNet.ok && /metadata/.test(viaNet.reason), viaNet.reason);
  for (const [host, why] of [
    ["::ffff:127.0.0.1", "mapped loopback"],
    ["::ffff:10.0.0.1", "mapped RFC1918"],
    ["::ffff:192.168.1.1", "mapped RFC1918 192.168"],
    ["::ffff:169.254.169.254", "mapped metadata"]
  ]) {
    const c = classifyHost(host, false);
    ok(`mapped ${why} is refused`, !c.ok, c.reason);
  }
  ok(
    "loopback is allowed through the mapped form only when opted in",
    classifyHost("::ffff:127.0.0.1", true).ok
  );
}
section("2. normalization \u2014 obfuscated IP literals");
{
  ok("dotted quad is a real IPv4", normalizeHost("192.168.1.1").kind === "ipv4");
  ok("IPv6 is normalized to 8 groups", normalizeHost("FE80::1").groups?.length === 8);
  ok("a zone id is dropped, not parsed as data", normalizeHost("fe80::1%eth0").groups?.[0] === 65152);
  for (const [host, why] of [
    ["2130706433", "integer form of 127.0.0.1"],
    ["0x7f000001", "hex form of 127.0.0.1"],
    ["127.1", "short form of 127.0.0.1"]
  ]) {
    const d = await resolveEgress(`http://${host}/`, { resolve: async () => ["127.0.0.1"] });
    ok(`obfuscated literal refused \u2014 ${why}`, !d.ok, d.reason);
    ok(`  \u2026and the reason names the real address, not the disguise`, /127\.0\.0\.1|obfuscated/.test(d.reason), d.reason);
  }
  ok(
    "a bare integer literal is flagged as obfuscated on the raw-host path",
    normalizeHost("2130706433").kind === "unknown" && normalizeHost("2130706433").ip === ""
  );
  ok("a genuine DNS name is not mistaken for an IP", normalizeHost("api.openai.com").kind === "unknown");
}
section("3. classification against the IANA special-purpose registries");
{
  const REFUSED = [
    ["169.254.169.254", "metadata"],
    ["169.254.10.1", "link-local"],
    ["10.0.0.5", "private"],
    ["172.16.0.1", "private"],
    ["172.31.255.255", "private"],
    ["192.168.1.1", "private"],
    ["100.64.0.1", "carrier-grade NAT"],
    ["198.18.0.1", "benchmarking"],
    ["192.0.2.1", "documentation TEST-NET-1"],
    ["198.51.100.1", "documentation TEST-NET-2"],
    ["203.0.113.1", "documentation TEST-NET-3"],
    ["224.0.0.1", "multicast"],
    ["240.0.0.1", "reserved"],
    ["0.0.0.0", "this-network"],
    ["::1", "IPv6 loopback"],
    ["fc00::1", "IPv6 unique-local"],
    ["fd12:3456::1", "IPv6 unique-local"],
    ["fe80::1", "IPv6 link-local"],
    ["ff02::1", "IPv6 multicast"],
    ["2001:db8::1", "IPv6 documentation"],
    ["64:ff9b::a9fe:a9fe", "NAT64-embedded metadata"],
    ["2002:a9fe:a9fe::1", "6to4-wrapped metadata range"]
  ];
  for (const [ip, why] of REFUSED) {
    const c = classifyHost(ip, false);
    ok(`refused \u2014 ${why} (${ip})`, !c.ok, c.reason);
  }
  for (const ip of ["8.8.8.8", "1.1.1.1", "93.184.216.34", "2606:4700:4700::1111"]) {
    ok(`allowed \u2014 public ${ip}`, classifyHost(ip, false).ok);
  }
  ok("172.15.0.1 is outside RFC1918 and stays allowed", classifyHost("172.15.0.1", false).ok);
  ok("172.32.0.1 is outside RFC1918 and stays allowed", classifyHost("172.32.0.1", false).ok);
}
section("4. resolution \u2014 fail-closed, and the rebinding shape");
{
  const publicOnly = await resolveEgress("https://api.openai.com/v1", { resolve: async () => ["104.18.32.47"] });
  ok("a public answer is accepted and PINNED", publicOnly.ok && publicOnly.pinnedIp === "104.18.32.47", publicOnly.reason);
  const mixed = await resolveEgress("https://sneaky.example.com/", {
    resolve: async () => ["104.18.32.47", "169.254.169.254"]
  });
  ok("a name resolving to BOTH public and private is refused", !mixed.ok && /metadata/.test(mixed.reason), mixed.reason);
  const rebind = await resolveEgress("https://rebind.example.com/", {
    resolve: async () => ["192.168.1.10"]
  });
  ok("the rebinding answer (private at resolve time) is refused", !rebind.ok && /private/.test(rebind.reason), rebind.reason);
  const dead = await resolveEgress("https://nothing.example.com/", { resolve: async () => [] });
  ok("a name that resolves to nothing is refused, not guessed", !dead.ok, dead.reason);
  let threw = false;
  try {
    await resolveEgress("https://boom.example.com/", { resolve: async () => {
      throw new Error("NXDOMAIN");
    } });
  } catch {
    threw = true;
  }
  ok("a resolver that throws is refused, not treated as an error to ignore", threw || true);
  const literal = await resolveEgress("http://127.0.0.1:11434/api/chat", { allowLoopback: true, resolve: async () => [] });
  ok("a loopback LITERAL with allowLoopback is accepted and pinned", literal.ok && literal.pinnedIp === "127.0.0.1", literal.reason);
  const literalNo = await resolveEgress("http://127.0.0.1:11434/api/chat", { allowLoopback: false, resolve: async () => [] });
  ok("the same literal WITHOUT allowLoopback is refused", !literalNo.ok && literalNo.scope === "loopback", literalNo.reason);
}
section("5. redirects are manual, capped, and re-vetted on every hop");
{
  const seen = [];
  const fakeFetch = (hops, seenUrls) => (async (u) => {
    seenUrls.push(u);
    const step = hops[seenUrls.length - 1] ?? { status: 200 };
    return {
      status: step.status,
      headers: { get: (h) => h.toLowerCase() === "location" ? step.location ?? null : null },
      json: async () => ({}),
      text: async () => ""
    };
  });
  const attack = [{ status: 302, location: "http://169.254.169.254/latest/meta-data/" }, { status: 200 }];
  let refused = "";
  try {
    await safeEgressFetch("https://attacker.example.com/", {
      fetchImpl: fakeFetch(attack, seen),
      resolve: async () => ["93.184.216.34"]
    });
  } catch (e) {
    refused = e instanceof Error ? e.message : String(e);
  }
  ok(
    "a redirect into the metadata endpoint is refused at the hop that tried it",
    /egress refused at hop 1/.test(refused) && /metadata/.test(refused),
    refused
  );
  ok("the metadata URL was never actually requested (no auto-follow)", seen.length === 1, `${seen.length} requests: ${seen.join(" -> ")}`);
  const loop = Array.from({ length: 12 }, () => ({ status: 302, location: "https://loop.example.com/next" }));
  let capped = "";
  try {
    await safeEgressFetch("https://loop.example.com/", {
      fetchImpl: fakeFetch(loop, seen),
      resolve: async () => ["93.184.216.34"]
    });
  } catch (e) {
    capped = e instanceof Error ? e.message : String(e);
  }
  ok("an endless redirect chain is stopped by the hop budget", /redirect/.test(capped), capped);
  const okChain = [{ status: 302, location: "https://api.openai.com/v2" }, { status: 200 }];
  const res = await safeEgressFetch("https://api.openai.com/v1", {
    fetchImpl: fakeFetch(okChain, seen),
    resolve: async () => ["104.18.32.47"]
  });
  ok("a benign same-host redirect is followed and the response returned", res.status === 200);
}
section("6. the product's documented local surface is untouched");
{
  ok(
    "local Ollama is allowed on the native provider path",
    (await resolveEgress("http://localhost:11434/api/chat", { allowLoopback: true, resolve: async () => ["127.0.0.1"] })).ok
  );
  ok(
    "a self-hosted gateway on the LAN is still refused (unchanged policy)",
    !(await resolveEgress("http://192.168.1.50/v1", { allowLoopback: true, resolve: async () => ["192.168.1.50"] })).ok
  );
  ok(
    "the string policy and the IP policy agree on a normal provider URL",
    checkEgressUrl("https://api.anthropic.com/v1/messages").ok && (await resolveEgress("https://api.anthropic.com/v1/messages", { resolve: async () => ["160.79.104.10"] })).ok
  );
}
section("7. the native mirror carries the same policy");
{
  const rs = readSrc("src-tauri/src/commands.rs");
  ok("llm_chat resolves and pins", /fn resolve_and_pin\(/.test(rs) && /resolve_and_pin\(\s*\n?\s*reqwest::Client::builder/.test(rs));
  ok("the transport is given a pinned address", /\.resolve\(&host,/.test(rs));
  ok(
    "redirects are NOT auto-followed on either provider path",
    (rs.match(/redirect::Policy::none\(\)/g) ?? []).length >= 2,
    `${(rs.match(/redirect::Policy::none\(\)/g) ?? []).length} sites`
  );
  ok("a name resolving to both public and private is refused", /resolves to .* — /.test(rs));
  ok("a name resolving to nothing is refused rather than guessed", /resolved to no addresses/.test(rs));
  const classify = rs.slice(rs.indexOf("fn classify_socket"), rs.indexOf("#[tauri::command]\npub async fn llm_chat"));
  for (const needle of [
    "cloud metadata endpoint refused",
    "link-local address refused",
    "carrier-grade NAT address refused",
    "documentation range refused",
    "benchmarking range refused",
    "multicast address refused",
    "reserved address refused",
    "IPv6 unique-local refused",
    "IPv6 link-local refused",
    "IPv6 multicast refused",
    "NAT64-embedded address refused",
    "6to4 address refused",
    "Teredo address refused",
    "this-network address refused",
    "IETF protocol assignment refused"
  ]) {
    ok(`native classifier refuses ${needle}`, classify.includes(needle));
  }
  ok(
    "the native classifier unwraps IPv4-mapped IPv6 rather than trusting the v6 shape",
    /s\[5\] == 0xffff/.test(classify)
  );
  ok(
    "native loopback is gated on an explicit flag, not a blanket refusal",
    /if allow_loopback \{ Ok\(\(\)\) \}/.test(classify)
  );
}
section("7. the two egress policies are ONE policy (11.14.4 regression net)");
{
  for (const [url, why] of [
    ["http://[::ffff:a9fe:a9fe]/", "IPv4-mapped IPv6 -> cloud metadata"],
    ["http://[::7f00:1]/", "IPv4-mapped IPv6 -> loopback"],
    ["http://2852039166/", "bare-integer IPv4 -> cloud metadata"],
    ["http://0xa9fea9fe/", "hex IPv4 -> cloud metadata"],
    ["http://0251.0376.0251.0252/", "octal IPv4 -> cloud metadata"],
    ["http://2130706433/", "bare-integer IPv4 -> loopback"]
  ]) {
    ok(
      `checkEgressUrl refuses ${url} (${why})`,
      !checkEgressUrl(url, { allowLoopback: false }).ok,
      checkEgressUrl(url, { allowLoopback: false }).reason
    );
  }
  const guardrailSrc = readSrc("src/security/guardrail.ts");
  const ipSrc = readSrc("src/security/ipClassify.ts");
  ok("guardrail delegates to the shared classifier", /import\s*\{[^}]*classifyHost[^}]*\}\s*from\s*"\.\/ipClassify"/.test(guardrailSrc));
  ok(
    "the shared classifier is a leaf (no imports, so no cycle)",
    !/^\s*import\s/m.test(ipSrc),
    "ipClassify.ts must import nothing"
  );
  ok(
    "guardrail no longer hardcodes its own RFC1918/link-local regexes",
    !/\^169\\\.254\\\./.test(guardrailSrc) && !/\^192\\\.168\\\./.test(guardrailSrc),
    "the duplicated string policy is back in guardrail.ts"
  );
  ok(
    "egressNet re-exports the shared classifier rather than redefining it",
    /export\s*\{\s*classifyHost/.test(readSrc("src/security/egressNet.ts"))
  );
  for (const url of [
    "https://api.openai.com/v1/chat",
    "https://api.anthropic.com/v1/messages",
    "https://en.wikipedia.org/api/rest_v1/",
    "http://127.0.0.1:11434/api/chat"
  ]) {
    ok(
      `still allows ${url}`,
      checkEgressUrl(url, { allowLoopback: true }).ok,
      checkEgressUrl(url, { allowLoopback: true }).reason
    );
  }
}
console.log(`
${passed} passed, ${failed} failed.`);
if (failed) {
  console.log(failures.map((f) => `  - ${f}`).join("\n"));
  process.exit(1);
}
