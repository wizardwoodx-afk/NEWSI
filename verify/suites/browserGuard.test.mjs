import { createRequire as __mjCreateRequire } from "node:module"; const require = __mjCreateRequire(import.meta.url);

// probe/browserGuard.test.ts
import * as fs from "node:fs";
import * as path from "node:path";
import * as vm from "node:vm";
import { fileURLToPath } from "node:url";
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
var here = path.dirname(fileURLToPath(import.meta.url));
var root = "." ? "." : path.join(here, "..", "..");
var guardPath = path.join(root, "src-tauri", "browser-service", "browser-guard.script.mjs");
var guardSrc = fs.readFileSync(guardPath, "utf8");
function makePage(allowed, opts = {}) {
  const report = [];
  const calls = [];
  const blobUrls = [];
  class GuardURL extends URL {
    static createObjectURL() {
      if (opts.blockBlob) throw new Error("CSP blocked blob: worker");
      blobUrls.push("blob:https://allowed.test/guarded-" + (blobUrls.length + 1));
      return blobUrls[blobUrls.length - 1];
    }
    static revokeObjectURL() {
    }
  }
  const sandbox = {
    Date,
    URL: GuardURL,
    Promise,
    Map,
    Set,
    Array,
    Object,
    String,
    Error,
    JSON,
    Blob: class {
    },
    DOMException: class extends Error {
      constructor(msg, name) {
        super(msg);
        this.name = name ?? "Error";
      }
    },
    __selfimpulseGuardReport: report,
    location: { href: "https://allowed.test/page" },
    // A real WebRTC surface, so "blocked" is observable. Absent on a real page
    // it is a no-op, which is also correct — there is nothing to block.
    RTCPeerConnection: function() {
      return { open: true };
    },
    webkitRTCPeerConnection: function() {
      return { open: true };
    },
    fetch: function(input) {
      calls.push("fetch:" + String(input));
      return Promise.resolve("ok");
    },
    XMLHttpRequest: function() {
      this.open = function(_m, u) {
        calls.push("xhr:" + u);
      };
    },
    WebSocket: function(u) {
      calls.push("ws:" + u);
    },
    EventSource: function(u) {
      calls.push("es:" + u);
    },
    navigator: { sendBeacon: function(u) {
      calls.push("beacon:" + u);
      return true;
    } },
    importScripts: function(u) {
      calls.push("import:" + u);
    },
    Worker: function(u) {
      calls.push("worker:" + u);
    },
    SharedWorker: function(u) {
      calls.push("sworker:" + u);
    }
  };
  if (opts.noFetch) delete sandbox.fetch;
  vm.createContext(sandbox);
  vm.runInContext(guardSrc, sandbox, { filename: "browser-guard.script.mjs" });
  vm.runInContext(`__installSelfImpulseNetworkGuard(${JSON.stringify(allowed)})`, sandbox);
  return { g: sandbox, report, calls, blobUrls };
}
console.log("== 0. the adopted shim is present and parseable");
ok("the guard file is non-trivial", guardSrc.length > 2e3, String(guardSrc.length));
ok("it defines the install entry point", guardSrc.includes("function __installSelfImpulseNetworkGuard"));
ok("it is JavaScript node can parse", (() => {
  try {
    new vm.Script(guardSrc);
    return true;
  } catch {
    return false;
  }
})());
ok("no upstream identifier survives", !/agentBrowser|_isDomainAllowed/.test(guardSrc));
console.log("== 1. every API the adopted design guards is wrapped by the shim");
for (const api of [
  "fetch",
  "XMLHttpRequest",
  "WebSocket",
  "EventSource",
  "sendBeacon",
  "importScripts",
  "Worker",
  "SharedWorker",
  "RTCPeerConnection",
  "webkitRTCPeerConnection"
]) {
  ok(`the shim wraps ${api}`, guardSrc.includes(api));
}
console.log("== 2. an EMPTY allowlist is CLOSED \u2014 our divergence from upstream");
{
  const p = makePage([]);
  const outcome = p.g.fetch("https://anything.test/x").then(
    () => "resolved",
    (e) => e.name
  );
  ok("no fetch reached the network", p.calls.length === 0, p.calls.join(","));
  ok("the refusal is reported to the host", p.report.length > 0, String(p.report.length));
  ok("the reason names the host", p.report[0]?.reason.includes("anything.test") === true);
  ok("the fetch promise rejects with a SecurityError", await outcome === "SecurityError");
}
console.log("== 3. an ALLOWED host passes, a foreign host does not");
{
  const p = makePage(["allowed.test"]);
  p.g.fetch("https://allowed.test/api");
  ok("an allowlisted host is permitted", p.calls.some((c) => c.startsWith("fetch:https://allowed.test")));
  let refused = false;
  p.g.fetch("https://evil.test/steal").then(() => {
  }, (e) => {
    refused = e.name === "SecurityError";
  });
  ok("a foreign host is refused", p.report.some((r) => r.reason.includes("Fetch blocked: evil.test")));
  ok("the foreign request never reached the network", !p.calls.some((c) => c.includes("evil.test")));
  void refused;
  ok(
    "the refusal names the API and the host",
    p.report.some((r) => r.reason.includes("Fetch blocked: evil.test"))
  );
}
console.log("== 4. wildcard subdomains, without over-matching");
{
  const p = makePage(["*.trusted.test"]);
  p.g.fetch("https://a.trusted.test/ok");
  ok("a subdomain of a wildcard is permitted", p.calls.some((c) => c.includes("a.trusted.test")));
  p.g.fetch("https://trusted.test/ok");
  ok(
    "the bare domain of a wildcard is permitted",
    p.calls.some((c) => c.includes("https://trusted.test/ok"))
  );
  p.g.fetch("https://nottrusted.test/x").then(() => {
  }, () => {
  });
  ok("a lookalike suffix is NOT permitted", !p.calls.some((c) => c.includes("nottrusted.test")));
  p.g.fetch("https://evil-trusted.test/x").then(() => {
  }, () => {
  });
  ok("a lookalike prefix is NOT permitted", !p.calls.some((c) => c.includes("evil-trusted.test")));
}
console.log("== 5. WebSocket and EventSource are constrained too");
{
  const p = makePage(["allowed.test"]);
  p.g.WebSocket("wss://allowed.test/socket");
  ok("an allowlisted WebSocket is permitted", p.calls.some((c) => c.startsWith("ws:wss://allowed.test")));
  let threw = false;
  try {
    p.g.WebSocket("wss://evil.test/socket");
  } catch (e) {
    threw = e.name === "SecurityError";
  }
  ok("a foreign WebSocket is refused", threw);
  ok("the foreign WebSocket never opened", !p.calls.some((c) => c.includes("evil.test")));
  p.g.EventSource("https://allowed.test/stream");
  ok("an allowlisted EventSource is permitted", p.calls.some((c) => c.startsWith("es:https://allowed.test")));
  let esThrew = false;
  try {
    p.g.EventSource("https://evil.test/stream");
  } catch (e) {
    esThrew = e.name === "SecurityError";
  }
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
console.log("== 7. WebRTC is blocked OUTRIGHT \u2014 it cannot be URL-filtered");
{
  const p = makePage(["allowed.test"]);
  let threw = false;
  try {
    new p.g.RTCPeerConnection();
  } catch (e) {
    threw = e.name === "SecurityError";
  }
  ok("RTCPeerConnection is blocked", threw);
  let threw2 = false;
  try {
    new p.g.webkitRTCPeerConnection();
  } catch (e) {
    threw2 = e.name === "SecurityError";
  }
  ok("webkitRTCPeerConnection is blocked", threw2);
  ok("the block cannot be undone by reassignment", (() => {
    try {
      p.g.RTCPeerConnection = function() {
        return "unguarded";
      };
    } catch (_) {
    }
    try {
      new p.g.RTCPeerConnection();
      return false;
    } catch (e) {
      return e.name === "SecurityError";
    }
  })());
  ok("the reason explains why", p.report.some((r) => r.reason.includes("while domain filtering is active")));
}
console.log("== 8. WORKERS: the guard re-installs inside the worker's own scope");
{
  const p = makePage(["allowed.test"]);
  p.g.Worker("https://allowed.test/worker.js");
  ok("a worker from an allowlisted host starts", p.calls.some((c) => c.startsWith("worker:")));
  ok("the worker was NOT started with its raw URL", p.blobUrls.length > 0, String(p.blobUrls.length));
  ok(
    "the worker was started via a guarded Blob bootstrap",
    p.blobUrls[0]?.startsWith("blob:") === true,
    p.blobUrls[0] ?? ""
  );
}
console.log("== 9. WORKERS FAIL CLOSED when the bootstrap cannot be created");
{
  const p = makePage(["allowed.test"], { blockBlob: true });
  let threw = false;
  try {
    p.g.Worker("https://allowed.test/worker.js");
  } catch (e) {
    threw = e.name === "SecurityError";
  }
  ok("the worker is REFUSED rather than running unguarded", threw);
  ok("no worker was started at all", !p.calls.some((c) => c.startsWith("worker:")), p.calls.join(","));
  ok(
    "the refusal explains that the bootstrap is unavailable",
    p.report.some((r) => r.reason.includes("bootstrap")),
    JSON.stringify(p.report)
  );
  ok(
    "there is no unguarded fallback path in the shim",
    !guardSrc.includes("return new OrigCtor(checkedUrl") && !guardSrc.includes("CSPFallback")
  );
}
console.log("== 10. a worker from a FOREIGN host is refused outright");
{
  const p = makePage(["allowed.test"]);
  let threw = false;
  try {
    p.g.Worker("https://evil.test/worker.js");
  } catch (e) {
    threw = e.name === "SecurityError";
  }
  ok("a foreign worker is refused", threw);
  ok("the foreign worker never started", !p.calls.some((c) => c.includes("evil.test")));
}
console.log("== 11. the shim degrades safely on a page missing APIs");
{
  const p = makePage(["allowed.test"], { noFetch: true });
  p.g.WebSocket("wss://allowed.test/ok");
  ok(
    "installing on a page without fetch does not break the other guards",
    p.calls.some((c) => c.startsWith("ws:"))
  );
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
