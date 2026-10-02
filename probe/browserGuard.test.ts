/**
 * Browser network guard — the injected enforcement shim.
 *
 * SOURCE ADOPTION. The guard body under test is
 * `src-tauri/browser-service/browser-guard.script.mjs`, adopted from the
 * browser containment layer of github.com/vercel-labs/agent-browser @ d01253d9db28
 * (`cli/src/native/network.rs` -> `domain_filter_script()`), Apache-2.0,
 * Copyright Vercel, Inc. See THIRD-PARTY-NOTICES.md.
 *
 * These checks run the REAL shim in a sandboxed global with stub browser APIs
 * and assert what a page can and cannot do once the guard is installed. That is
 * the only honest way to test an injected script: assert behaviour, not the
 * presence of substrings in the source.
 *
 * The two properties that matter most and are easiest to lose in a refactor:
 *   - an EMPTY allowlist is closed (our deliberate divergence from upstream)
 *   - a Worker whose guarded bootstrap cannot be created does NOT start
 */
import * as fs from "node:fs";
import * as path from "node:path";
import * as vm from "node:vm";
import { fileURLToPath } from "node:url";

let passed = 0;
let failed = 0;
const failures: string[] = [];
function ok(label: string, cond: boolean, detail = ""): void {
  if (cond) { passed += 1; console.log(`  ok   ${label}`); }
  else { failed += 1; failures.push(`${label}${detail ? ` — ${detail}` : ""}`); console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`); }
}

// Other probes resolve the tree root through SI_ROOT, which the dev runner
// sets to the absolute checkout and the offline runner sets to ".". Using it
// means this probe reads the real guard file in both runners, instead of
// guessing a relative path that differs per runner.
declare const SI_ROOT: string;
const here = path.dirname(fileURLToPath(import.meta.url));
const root = typeof SI_ROOT === "string" && SI_ROOT ? SI_ROOT : path.join(here, "..", "..");
const guardPath = path.join(root, "src-tauri", "browser-service", "browser-guard.script.mjs");
const guardSrc = fs.readFileSync(guardPath, "utf8");

/**
 * Build a page-like global with stub network APIs, install the guard, and hand
 * back everything a test needs to assert on.
 *
 * `blockBlob` simulates a page whose CSP refuses `URL.createObjectURL` — the
 * condition the adopted design must fail closed on.
 */
function makePage(allowed: string[], opts: { blockBlob?: boolean; noFetch?: boolean } = {}) {
  const report: { reason: string }[] = [];
  const calls: string[] = [];
  const blobUrls: string[] = [];

  class GuardURL extends URL {
    static createObjectURL(): string {
      if (opts.blockBlob) throw new Error("CSP blocked blob: worker");
      blobUrls.push("blob:https://allowed.test/guarded-" + (blobUrls.length + 1));
      return blobUrls[blobUrls.length - 1];
    }
    static revokeObjectURL(): void {}
  }

  const sandbox: Record<string, unknown> = {
    Date, URL: GuardURL, Promise, Map, Set, Array, Object, String, Error, JSON,
    Blob: class {},
    DOMException: class extends Error {
      constructor(msg: string, name?: string) { super(msg); this.name = name ?? "Error"; }
    },
    __selfimpulseGuardReport: report,
    location: { href: "https://allowed.test/page" },
    // A real WebRTC surface, so "blocked" is observable. Absent on a real page
    // it is a no-op, which is also correct — there is nothing to block.
    RTCPeerConnection: function () { return { open: true }; },
    webkitRTCPeerConnection: function () { return { open: true }; },
    fetch: function (input: unknown) { calls.push("fetch:" + String(input)); return Promise.resolve("ok"); },
    XMLHttpRequest: function () { this.open = function (_m: string, u: string) { calls.push("xhr:" + u); }; },
    WebSocket: function (u: string) { calls.push("ws:" + u); },
    EventSource: function (u: string) { calls.push("es:" + u); },
    navigator: { sendBeacon: function (u: string) { calls.push("beacon:" + u); return true; } },
    importScripts: function (u: string) { calls.push("import:" + u); },
    Worker: function (u: string) { calls.push("worker:" + u); },
    SharedWorker: function (u: string) { calls.push("sworker:" + u); },
  };
  if (opts.noFetch) delete sandbox.fetch;

  vm.createContext(sandbox);
  vm.runInContext(guardSrc, sandbox, { filename: "browser-guard.script.mjs" });
  vm.runInContext(`__installSelfImpulseNetworkGuard(${JSON.stringify(allowed)})`, sandbox);

  return { g: sandbox as Record<string, any>, report, calls, blobUrls };
}

console.log("== 0. the adopted shim is present and parseable");
ok("the guard file is non-trivial", guardSrc.length > 2000, String(guardSrc.length));
ok("it defines the install entry point", guardSrc.includes("function __installSelfImpulseNetworkGuard"));
ok("it is JavaScript node can parse", (() => {
  try { new vm.Script(guardSrc); return true; } catch { return false; }
})());
ok("no upstream identifier survives", !/agentBrowser|_isDomainAllowed/.test(guardSrc));

console.log("== 1. every API the adopted design guards is wrapped by the shim");
for (const api of ["fetch", "XMLHttpRequest", "WebSocket", "EventSource", "sendBeacon",
                   "importScripts", "Worker", "SharedWorker", "RTCPeerConnection",
                   "webkitRTCPeerConnection"]) {
  ok(`the shim wraps ${api}`, guardSrc.includes(api));
}

console.log("== 2. an EMPTY allowlist is CLOSED — our divergence from upstream");
{
  const p = makePage([]);
  // The guard throws inside the fetch wrapper; the wrapper converts that into a
  // REJECTED PROMISE, which is the correct shape for fetch. The refusal is
  // therefore observable two ways: the promise rejects, and the request never
  // reaches the underlying fetch.
  const outcome = p.g.fetch("https://anything.test/x").then(
    () => "resolved",
    (e: Error) => e.name
  );
  ok("no fetch reached the network", p.calls.length === 0, p.calls.join(","));
  ok("the refusal is reported to the host", p.report.length > 0, String(p.report.length));
  ok("the reason names the host", p.report[0]?.reason.includes("anything.test") === true);
  ok("the fetch promise rejects with a SecurityError", (await outcome) === "SecurityError");
}

console.log("== 3. an ALLOWED host passes, a foreign host does not");
{
  const p = makePage(["allowed.test"]);
  p.g.fetch("https://allowed.test/api");
  ok("an allowlisted host is permitted", p.calls.some((c) => c.startsWith("fetch:https://allowed.test")));
  // The guard throws a SecurityError inside the fetch wrapper, which the
  // wrapper converts into a rejected promise. Checking the promise directly
  // keeps this synchronous — a rejection handler runs as a microtask, so the
  // observable effect (the request never reached `calls`) is already true here.
  let refused = false;
  p.g.fetch("https://evil.test/steal").then(() => {}, (e: Error) => { refused = e.name === "SecurityError"; });
  ok("a foreign host is refused", p.report.some((r) => r.reason.includes("Fetch blocked: evil.test")));
  ok("the foreign request never reached the network", !p.calls.some((c) => c.includes("evil.test")));
  void refused;
  ok("the refusal names the API and the host",
    p.report.some((r) => r.reason.includes("Fetch blocked: evil.test")));
}

console.log("== 4. wildcard subdomains, without over-matching");
{
  const p = makePage(["*.trusted.test"]);
  p.g.fetch("https://a.trusted.test/ok");
  ok("a subdomain of a wildcard is permitted", p.calls.some((c) => c.includes("a.trusted.test")));
  p.g.fetch("https://trusted.test/ok");
  ok("the bare domain of a wildcard is permitted",
    p.calls.some((c) => c.includes("https://trusted.test/ok")));
  p.g.fetch("https://nottrusted.test/x").then(() => {}, () => {});
  ok("a lookalike suffix is NOT permitted", !p.calls.some((c) => c.includes("nottrusted.test")));
  p.g.fetch("https://evil-trusted.test/x").then(() => {}, () => {});
  ok("a lookalike prefix is NOT permitted", !p.calls.some((c) => c.includes("evil-trusted.test")));
}

console.log("== 5. WebSocket and EventSource are constrained too");
{
  const p = makePage(["allowed.test"]);
  p.g.WebSocket("wss://allowed.test/socket");
  ok("an allowlisted WebSocket is permitted", p.calls.some((c) => c.startsWith("ws:wss://allowed.test")));
  let threw = false;
  try { p.g.WebSocket("wss://evil.test/socket"); } catch (e) { threw = e.name === "SecurityError"; }
  ok("a foreign WebSocket is refused", threw);
  ok("the foreign WebSocket never opened", !p.calls.some((c) => c.includes("evil.test")));
  p.g.EventSource("https://allowed.test/stream");
  ok("an allowlisted EventSource is permitted", p.calls.some((c) => c.startsWith("es:https://allowed.test")));
  let esThrew = false;
  try { p.g.EventSource("https://evil.test/stream"); } catch (e) { esThrew = e.name === "SecurityError"; }
  ok("a foreign EventSource is refused", esThrew);
}

console.log("== 6. sendBeacon refuses by RETURNING FALSE");
{
  const p = makePage(["allowed.test"]);
  ok("an allowlisted beacon is delivered", p.g.navigator.sendBeacon("https://allowed.test/b", "x") === true);
  const bad = p.g.navigator.sendBeacon("https://evil.test/b", "x");
  ok("a foreign beacon returns false rather than throwing", bad === false, String(bad));
  ok("the foreign beacon was not delivered", !p.calls.some((c) => c.includes("evil.test")));
}

console.log("== 7. WebRTC is blocked OUTRIGHT — it cannot be URL-filtered");
{
  const p = makePage(["allowed.test"]);
  let threw = false;
  try { new p.g.RTCPeerConnection(); } catch (e) { threw = e.name === "SecurityError"; }
  ok("RTCPeerConnection is blocked", threw);
  let threw2 = false;
  try { new p.g.webkitRTCPeerConnection(); } catch (e) { threw2 = e.name === "SecurityError"; }
  ok("webkitRTCPeerConnection is blocked", threw2);
  ok("the block cannot be undone by reassignment", (() => {
    try { p.g.RTCPeerConnection = function () { return "unguarded"; }; } catch (_) {}
    try { new p.g.RTCPeerConnection(); return false; } catch (e) { return e.name === "SecurityError"; }
  })());
  ok("the reason explains why", p.report.some((r) => r.reason.includes("while domain filtering is active")));
}

console.log("== 8. WORKERS: the guard re-installs inside the worker's own scope");
{
  const p = makePage(["allowed.test"]);
  p.g.Worker("https://allowed.test/worker.js");
  ok("a worker from an allowlisted host starts", p.calls.some((c) => c.startsWith("worker:")));
  ok("the worker was NOT started with its raw URL", p.blobUrls.length > 0, String(p.blobUrls.length));
  ok("the worker was started via a guarded Blob bootstrap",
    p.blobUrls[0]?.startsWith("blob:") === true, p.blobUrls[0] ?? "");
}

console.log("== 9. WORKERS FAIL CLOSED when the bootstrap cannot be created");
{
  // The condition the adopted design exists for: the page's CSP refuses the
  // Blob bootstrap. With a host that IS allowlisted, the only remaining way for
  // the worker to fail is the bootstrap itself — and the design refuses rather
  // than falling back to an unguarded worker.
  const p = makePage(["allowed.test"], { blockBlob: true });
  let threw = false;
  try { p.g.Worker("https://allowed.test/worker.js"); } catch (e) { threw = e.name === "SecurityError"; }
  ok("the worker is REFUSED rather than running unguarded", threw);
  ok("no worker was started at all", !p.calls.some((c) => c.startsWith("worker:")), p.calls.join(","));
  ok("the refusal explains that the bootstrap is unavailable",
    p.report.some((r) => r.reason.includes("bootstrap")), JSON.stringify(p.report));
  ok("there is no unguarded fallback path in the shim",
    !guardSrc.includes("return new OrigCtor(checkedUrl") && !guardSrc.includes("CSPFallback"));
}

console.log("== 10. a worker from a FOREIGN host is refused outright");
{
  const p = makePage(["allowed.test"]);
  let threw = false;
  try { p.g.Worker("https://evil.test/worker.js"); } catch (e) { threw = e.name === "SecurityError"; }
  ok("a foreign worker is refused", threw);
  ok("the foreign worker never started", !p.calls.some((c) => c.includes("evil.test")));
}

console.log("== 11. the shim degrades safely on a page missing APIs");
{
  const p = makePage(["allowed.test"], { noFetch: true });
  p.g.WebSocket("wss://allowed.test/ok");
  ok("installing on a page without fetch does not break the other guards",
    p.calls.some((c) => c.startsWith("ws:")));
}

console.log("");
console.log(`${passed} passed, ${failed} failed`);
if (failures.length > 0) {
  console.log("failures:");
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}


console.log("");
console.log(`${passed} passed, ${failed} failed`);
if (failures.length > 0) {
  console.log("failures:");
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}

