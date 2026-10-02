import { createRequire as __mjCreateRequire } from "node:module"; const require = __mjCreateRequire(import.meta.url);

// probe/computerUse.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";

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

// src/engine/computerUse.ts
var sha256 = (t) => {
  let h1 = 2166136261, h2 = 16777619;
  for (let i = 0; i < t.length; i++) {
    h1 = Math.imul(h1 ^ t.charCodeAt(i), 16777619) >>> 0;
    h2 = Math.imul(h2 ^ t.charCodeAt(t.length - 1 - i), 16777619) >>> 0;
  }
  let out = "";
  for (let i = 0; i < 8; i++) {
    out += (h1 = Math.imul(h1 ^ h1 >>> 15, 2246822507) >>> 0).toString(16).padStart(8, "0").slice(0, 4) + (h2 = Math.imul(h2 ^ h2 >>> 13, 3266489909) >>> 0).toString(16).padStart(8, "0").slice(0, 4);
    h1 ^= h2;
  }
  return out;
};
var SHELL_META = /[;&|`$<>!*?\n\r]/;
function pcExec(binary, args, policy2, risk, opts = {}) {
  const started = Date.now();
  const refuse = (reason) => finalize({
    kind: "pc.exec",
    binary,
    args,
    decision: "refused",
    exitCode: null,
    timedOut: false,
    stdoutDigest: "",
    stderrDigest: "",
    stdoutPreview: "",
    reason,
    durationMs: Date.now() - started
  });
  if (risk === "critical") {
    return finalize({
      kind: "pc.exec",
      binary,
      args,
      decision: "handover",
      exitCode: null,
      timedOut: false,
      stdoutDigest: "",
      stderrDigest: "",
      stdoutPreview: "",
      reason: "critical-tier command: handed to the human gate, not executed",
      durationMs: Date.now() - started
    });
  }
  if (!policy2.allowlist.includes(binary)) {
    return refuse(`binary "${binary}" is not on this mission's allowlist (${policy2.allowlist.join(", ") || "empty"})`);
  }
  const injected = args.filter((a) => SHELL_META.test(a));
  if (injected.length) {
    return refuse(`shell metacharacters in arguments (${injected.join(", ")}) \u2014 injection risk, refusing`);
  }
  const run = opts.run ?? defaultRun;
  let out;
  try {
    out = run(binary, args, policy2.maxRuntimeMs);
  } catch (err) {
    return refuse(`execution failed to start: ${err.message}`);
  }
  const stdout = out.stdout.slice(0, policy2.maxOutputBytes);
  return finalize({
    kind: "pc.exec",
    binary,
    args,
    decision: "executed",
    exitCode: out.status,
    timedOut: out.timedOut,
    stdoutDigest: sha256(out.stdout),
    stderrDigest: sha256(out.stderr),
    stdoutPreview: stdout.slice(0, 400),
    reason: out.timedOut ? `ran past the ${policy2.maxRuntimeMs}ms ceiling and was stopped` : "completed within bounds",
    durationMs: Date.now() - started
  });
}
function defaultRun(_bin, _args, _timeoutMs) {
  throw new Error("no process runner attached to this runtime \u2014 node runtimes inject one from computerUseNode; this execution was refused, not faked");
}
function finalize(base) {
  return { ...base, digest: sha256(JSON.stringify(base)) };
}
function newProfile(missionId, name = "default") {
  return { name, missionId, userAgent: `SI-Reach/19.5 (accountable-agent; mission ${missionId})`, viewport: { width: 1280, height: 800 }, cookiesAllowed: false };
}
function detectBrowserBinary(paths = DEFAULT_BROWSER_PATHS, exists) {
  if (!exists) return null;
  for (const p of paths) if (exists(p)) return p;
  return null;
}
var DEFAULT_BROWSER_PATHS = [
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/snap/bin/chromium",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
];
var fetchTransport = {
  async open(url, profile) {
    const res = await fetch(url, { headers: { "user-agent": profile.userAgent }, redirect: "follow" });
    const html = await res.text();
    return parseSnapshot(url, res.status, html);
  },
  async act(_snapshot, action) {
    if (action.type === "navigate") {
      const res = await fetch(action.url, { redirect: "follow" });
      return parseSnapshot(action.url, res.status, await res.text());
    }
    throw new Error("click/type require a live browser session \u2014 use the browser binary plane for interactive acts");
  }
};
function parseSnapshot(url, status, html) {
  const title = /<title[^>]*>([^<]*)<\/title>/i.exec(html)?.[1]?.trim() ?? "";
  const links = Array.from(html.matchAll(/href="([^"]+)"/gi)).map((m) => m[1]).slice(0, 50);
  return { url, title, links, status };
}
var HeadlessBrowser = class {
  profile;
  /* public so the mission registry can upgrade bindings on a live session */
  transport;
  binary;
  steps = [];
  spawn;
  constructor(profile, transport = fetchTransport, binary = detectBrowserBinary(), spawn) {
    this.profile = profile;
    this.transport = transport;
    this.binary = binary;
    this.spawn = spawn;
  }
  record(receipt) {
    const full = finalize({ ...receipt, missionId: this.profile.missionId });
    this.steps.push(full);
    return full;
  }
  guardUrl(url) {
    if (!url.startsWith("https://")) return "plain-http navigation refused \u2014 the browser plane is HTTPS-by-policy";
    const g = checkEgressUrl(url);
    if (!g.ok) return `egress guard refused: ${g.reason}`;
    let host = "";
    try {
      host = new URL(url).hostname.toLowerCase().replace(/^\[|\]$/g, "");
    } catch {
      return "egress guard refused: not a parseable URL";
    }
    if (host === "localhost" || host === "::1" || host === "0.0.0.0" || /^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host) || /^172\.(1[6-9]|2[0-9]|3[01])\./.test(host) || /^[fu][cd][0-9a-f]{2}:/.test(host)) {
      return "egress guard (browser plane): local/private address refused \u2014 navigation is stricter than general egress";
    }
    return null;
  }
  async open(url, risk = "risky") {
    if (risk === "critical") {
      return this.record({ kind: "pc.browser", action: { type: "open", url }, decision: "handover", result: null, reason: "critical-tier navigation: handed to the human gate" });
    }
    const refusal = this.guardUrl(url);
    if (refusal) return this.record({ kind: "pc.browser", action: { type: "open", url }, decision: "refused", result: null, reason: refusal });
    try {
      const result = await this.transport.open(url, this.profile);
      return this.record({ kind: "pc.browser", action: { type: "open", url }, decision: "executed", result, reason: `loaded (${result.status}) under profile ${this.profile.name}` });
    } catch (err) {
      return this.record({ kind: "pc.browser", action: { type: "open", url }, decision: "refused", result: null, reason: `load failed: ${err.message} \u2014 nothing faked` });
    }
  }
  async act(current, action, risk = "risky") {
    if (risk === "critical") {
      return this.record({ kind: "pc.browser", action, decision: "handover", result: null, reason: "critical-tier page action: handed to the human gate" });
    }
    if (action.type === "navigate") {
      const refusal = this.guardUrl(action.url);
      if (refusal) return this.record({ kind: "pc.browser", action, decision: "refused", result: null, reason: refusal });
    }
    try {
      const result = await this.transport.act(current, action);
      return this.record({ kind: "pc.browser", action, decision: "executed", result, reason: "action applied under the mission profile" });
    } catch (err) {
      return this.record({ kind: "pc.browser", action, decision: "refused", result: null, reason: `action failed: ${err.message}` });
    }
  }
  /**
   * Screenshot via the real browser binary when present. No binary → an
   * honest refusal; the receipt records what could not be done.
   */
  screenshot(outPath) {
    const action = { type: "navigate", url: "screenshot" };
    if (!this.binary) {
      return this.record({ kind: "pc.browser", action, decision: "refused", result: null, reason: "no browser binary on this machine \u2014 screenshot refused, not faked" });
    }
    const last = [...this.steps].reverse().find((s) => s.result && s.decision === "executed");
    if (!last?.result) {
      return this.record({ kind: "pc.browser", action, decision: "refused", result: null, reason: "no page is currently loaded \u2014 open a page before screenshotting" });
    }
    if (!this.spawn) {
      return this.record({ kind: "pc.browser", action, decision: "refused", result: last.result, reason: "browser binary present but no process runner attached to this runtime \u2014 screenshot refused, not faked" });
    }
    const r = this.spawn(this.binary, ["--headless", "--disable-gpu", "--no-sandbox", `--screenshot=${outPath}`, `--window-size=${this.profile.viewport.width},${this.profile.viewport.height}`, last.result.url]);
    if (r.status !== 0) {
      return this.record({ kind: "pc.browser", action, decision: "refused", result: last.result, reason: `browser binary exited ${r.status}: ${(r.stderr ?? "").slice(0, 200)}` });
    }
    return this.record({ kind: "pc.browser", action, decision: "executed", result: last.result, reason: `screenshot written to ${outPath}` });
  }
  /** Mission teardown: the profile's state is declared destroyed. */
  teardown() {
    return { missionId: this.profile.missionId, stepsReceipted: this.steps.length, digest: sha256(this.steps.map((s) => s.digest).join("|")) };
  }
};

// probe/computerUse.test.ts
var policy = { allowlist: ["echo", "ls"], maxRuntimeMs: 5e3, maxOutputBytes: 1024 };
var fakeRun = (stdout, status = 0, timedOut = false) => () => ({ status, timedOut, stdout, stderr: "" });
var fakeTransport = {
  async open(url, profile) {
    return { url, title: `page @ ${url} via ${profile.userAgent.split("/")[0]}`, links: ["/a", "/b"], status: 200 };
  },
  async act(snap, action) {
    if (action.type === "navigate") return { url: action.url, title: "next", links: [], status: 200 };
    return { ...snap, title: `${snap.title} (${action.type})` };
  }
};
test("computer-use", async (t) => {
  await t.test("an allowlisted binary executes and is receipted", () => {
    const r = pcExec("echo", ["hello"], policy, "safe", { run: fakeRun("hello\n") });
    assert.equal(r.decision, "executed");
    assert.equal(r.exitCode, 0);
    assert.equal(r.timedOut, false);
    assert.ok(r.stdoutDigest.length === 64);
    assert.ok(r.digest.length === 64);
  });
  await t.test("a non-allowlisted binary is refused wordingly", () => {
    const r = pcExec("rm", ["-rf", "/"], policy, "risky", { run: fakeRun("") });
    assert.equal(r.decision, "refused");
    assert.match(r.reason, /not on this mission's allowlist/);
  });
  await t.test("shell metacharacters in args are refused as injection", () => {
    const r = pcExec("echo", ["hello; rm -rf /"], policy, "safe", { run: fakeRun("") });
    assert.equal(r.decision, "refused");
    assert.match(r.reason, /injection risk/);
  });
  await t.test("critical-tier commands hand over to the gate, never execute", () => {
    const r = pcExec("echo", ["secret"], policy, "critical", { run: fakeRun("secret") });
    assert.equal(r.decision, "handover");
    assert.match(r.reason, /human gate/);
  });
  await t.test("timeouts are flagged, not hidden", () => {
    const r = pcExec("ls", ["/"], policy, "safe", { run: fakeRun("", null, true) });
    assert.equal(r.timedOut, true);
    assert.match(r.reason, /ceiling/);
  });
  await t.test("output is capped at the policy ceiling", () => {
    const r = pcExec("echo", ["x"], policy, "safe", { run: fakeRun("A".repeat(5e3)) });
    assert.ok(r.stdoutPreview.length <= 400);
  });
  await t.test("profiles are mission-isolated and cookie-free by default", () => {
    const p = newProfile("m-1");
    assert.equal(p.missionId, "m-1");
    assert.equal(p.cookiesAllowed, false);
    assert.match(p.userAgent, /m-1/);
  });
  const browser = new HeadlessBrowser(newProfile("m-2"), fakeTransport, null);
  await t.test("opens HTTPS pages under the mission profile", async () => {
    const r = await browser.open("https://example.com/");
    assert.equal(r.decision, "executed");
    assert.ok(r.result);
    assert.equal(r.result.status, 200);
    assert.match(r.reason, /profile default/);
  });
  await t.test("refuses plain-http navigation", async () => {
    const r = await browser.open("http://example.com/");
    assert.equal(r.decision, "refused");
    assert.match(r.reason, /HTTPS-by-policy/);
  });
  await t.test("critical navigation hands over to the gate", async () => {
    const r = await browser.open("https://bank.example.com/", "critical");
    assert.equal(r.decision, "handover");
  });
  await t.test("page actions are receipted against the loaded page", async () => {
    const snap = { url: "https://example.com/", title: "x", links: [], status: 200 };
    const r = await browser.act(snap, { type: "click", selector: "#go" });
    assert.equal(r.decision, "executed");
    assert.equal(r.result.title, "x (click)");
  });
  await t.test("screenshot refuses honestly when no browser binary exists", () => {
    const r = browser.screenshot("/tmp/x.png");
    assert.equal(r.decision, "refused");
    assert.match(r.reason, /no browser binary|nothing faked|no page/i);
  });
  await t.test("teardown seals the whole mission trail", () => {
    const td = browser.teardown();
    assert.equal(td.missionId, "m-2");
    assert.ok(td.stepsReceipted >= 4);
    assert.ok(td.digest.length === 64);
  });
  await t.test("browser binary detection returns null or a real path", () => {
    const b = detectBrowserBinary(["/nonexistent/chrome-xyz"]);
    assert.equal(b, null);
  });
});
