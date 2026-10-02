/**
 * Browser network policy (src/security/browserPolicy.ts).
 *
 * The security model here was adopted from agent-browser's documented browser
 * containment layer. This suite is the gate on the direction in which it fails:
 * closed. A policy that accidentally permits more than it should is a security
 * defect, so every "must refuse" case is pinned, and the ambiguity cases
 * (subdomain matching, scheme handling, label boundaries) are pinned too.
 *
 * The property that matters most: a default or empty policy permits NOTHING.
 * A misconfiguration must yield a browser that cannot reach the internet, not
 * one that can reach everything.
 */
import {
  DENY_ALL,
  DEFAULT_MAX_OUTPUT,
  clampOutput,
  defaultPolicy,
  evaluateAction,
  evaluateNavigation,
  evaluateSubresource,
  evaluateUrl,
  hostMatches,
  isClosed,
  isDestructive,
  policyFacts,
} from "../src/security/browserPolicy";
import type { BrowserNetworkPolicy } from "../src/security/browserPolicy";

let passed = 0;
let failed = 0;
const failures: string[] = [];
function ok(label: string, cond: boolean, detail = ""): void {
  if (cond) { passed += 1; console.log(`  ok   ${label}`); }
  else { failed += 1; failures.push(`${label}${detail ? ` — ${detail}` : ""}`); console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`); }
}

console.log("== 0. the default policy FAILS CLOSED");
ok("an empty allowlist is a closed policy", isClosed(DENY_ALL));
ok("the default policy with no hosts is closed", isClosed(defaultPolicy()));
ok("a policy with hosts is not closed", !isClosed(defaultPolicy(["example.com"])));
ok("a closed policy refuses a normal URL", !evaluateNavigation("https://example.com/", DENY_ALL).allow);
ok("a closed policy refuses ANY url", !evaluateNavigation("https://www.google.com/", DENY_ALL).allow);
ok("the deny-all facts report failsClosed", policyFacts(DENY_ALL).failsClosed === true);

console.log("== 1. host pattern matching, adopted semantics");
ok("an exact host matches", hostMatches("example.com", "example.com"));
ok("case is ignored", hostMatches("EXAMPLE.com", "example.COM"));
ok("a wildcard matches a subdomain", hostMatches("api.example.com", "*.example.com"));
ok("a wildcard matches the bare domain too", hostMatches("example.com", "*.example.com"));
ok("a bare pattern does NOT match a lookalike suffix", !hostMatches("notexample.com", "example.com"));
ok("a wildcard does NOT match a lookalike prefix", !hostMatches("evil-example.com", "*.example.com"));
ok("a bare pattern does not match a subdomain", !hostMatches("api.example.com", "example.com"));
ok("the match-all pattern matches anything", hostMatches("anything.test", "*"));
ok("a deep subdomain matches", hostMatches("a.b.c.example.com", "*.example.com"));

console.log("== 2. navigation decisions");
const p = defaultPolicy(["example.com", "*.trusted.dev"]);
ok("an allowlisted host is allowed", evaluateNavigation("https://example.com/x", p).allow);
ok("an allowlisted subdomain is allowed", evaluateNavigation("https://api.trusted.dev/x", p).allow);
const notAllowed = evaluateNavigation("https://evil.test/", p);
ok("a host outside the list is refused", !notAllowed.allow);
ok("the refusal names the reason", notAllowed.reason === "not-in-allowlist", notAllowed.reason);
ok("the refusal explains itself in words", notAllowed.detail.length > 0, notAllowed.detail);
ok("the refusal reports the host", notAllowed.host === "evil.test", String(notAllowed.host));

console.log("== 3. schemes are constrained");
ok("http is allowed when the host is", evaluateNavigation("http://example.com/", p).allow);
ok("a file: url is refused", !evaluateNavigation("file:///etc/passwd", p).allow);
ok("a file: refusal names the scheme", evaluateNavigation("file:///etc/passwd", p).reason === "scheme-not-allowed");
ok("a data: url is refused", !evaluateNavigation("data:text/html,<script>alert(1)</script>", p).allow);
ok("a javascript: url is refused", !evaluateNavigation("javascript:alert(1)", p).allow);
ok("a blob: url is refused", !evaluateNavigation("blob:https://example.com/abc", p).allow);
ok("a malformed url is refused, not thrown", !evaluateUrl("not a url at all", p).allow);
ok("a malformed url names the reason", evaluateUrl("nonsense", p).reason === "malformed-url");
ok("an empty string is refused", !evaluateUrl("", p).allow);
ok("a scheme bypass wearing an allowlisted host is still refused",
  !evaluateNavigation("javascript://example.com/%0aalert(1)", p).allow);

console.log("== 5. sub-resources are constrained too");
ok("a sub-resource from an allowlisted host is allowed", evaluateSubresource("https://example.com/a.js", p).allow);
ok("a sub-resource from an unknown host is refused", !evaluateSubresource("https://tracker.bad/x.js", p).allow);
ok("a sub-resource cannot smuggle a foreign scheme", !evaluateSubresource("file:///x.js", p).allow);
ok("the sub-resource decision says so", evaluateSubresource("https://example.com/a.js", p).detail.includes("sub-resource"));

console.log("== 6. destructive actions require a human");
ok("delete is destructive", isDestructive("delete"));
ok("purchase is destructive", isDestructive("purchase"));
ok("submit is destructive", isDestructive("submit"));
ok("navigate is NOT destructive", !isDestructive("navigate"));
ok("a listed destructive action requires confirmation", evaluateAction("delete", p).requiresConfirmation);
ok("a listed action does not proceed unattended", !evaluateAction("delete", p).proceed);
ok("an ordinary action may proceed", evaluateAction("navigate", p).proceed);
ok("an ordinary action is not destructive", !evaluateAction("navigate", p).destructive);
ok("a destructive action still requires confirmation when unlisted from the list",
  evaluateAction("submit", { ...p, confirmActions: [], confirmDestructiveAlways: true }).requiresConfirmation === true);
ok("with the always-flag off, a listed action still confirms",
  evaluateAction("delete", { ...p, confirmDestructiveAlways: false }).requiresConfirmation === true);
ok("a NON-destructive action is not confirmed even with the always-flag on",
  evaluateAction("click", { ...p, confirmActions: [], confirmDestructiveAlways: true }).requiresConfirmation === false);
ok("the decision explains itself", evaluateAction("purchase", p).detail.includes("destructive"));
ok("the decision marks destructiveness", evaluateAction("purchase", p).destructive === true);

console.log("== 7. output is capped, and the cap is honest");
const long = "x".repeat(DEFAULT_MAX_OUTPUT + 500);
ok("short output is untouched", clampOutput("hello", p).text === "hello");
ok("short output is not marked truncated", clampOutput("hello", p).truncated === false);
const capped = clampOutput(long, p);
ok("long output is capped", capped.text.length <= DEFAULT_MAX_OUTPUT, String(capped.text.length));
ok("the cap is reported", capped.truncated === true);
ok("the original length is reported", capped.originalLength === long.length, String(capped.originalLength));
ok("the cap is stated in the text", capped.text.includes("truncated"));
ok("the original size is named in the text", capped.text.includes(String(long.length)));
ok("a zero cap yields nothing", clampOutput(long, { ...p, maxOutput: 0 }).text === "");
ok("a zero cap still reports truncation", clampOutput(long, { ...p, maxOutput: 0 }).truncated === true);
ok("a zero cap does not throw on empty input", clampOutput("", { ...p, maxOutput: 0 }).originalLength === 0);
ok("a custom cap is honoured", clampOutput("y".repeat(100), { ...p, maxOutput: 10 }).text.length <= 10);
ok("a cap too small for the full marker still returns no more than the cap",
  clampOutput("y".repeat(100), { ...p, maxOutput: 5 }).text.length <= 5);
ok("a tiny cap still says it truncated", clampOutput("y".repeat(100), { ...p, maxOutput: 5 }).truncated === true);

console.log("== 8. the policy is DATA, and evaluation is pure");
ok("DENY_ALL exposes an empty allowlist", DENY_ALL.allowedDomains.length === 0);
ok("DENY_ALL confirms destructive actions", DENY_ALL.confirmDestructiveAlways === true);
ok("DENY_ALL allows only http schemes", policyFacts(DENY_ALL).httpSchemesOnly === true);
ok("the facts report the subresource constraint", policyFacts(DENY_ALL).subresourcesConstrained === true);
ok("a decision is a plain boolean plus a reason", typeof evaluateNavigation("https://example.com/", p).allow === "boolean");
ok("evaluating twice gives the same answer",
  evaluateNavigation("https://x.example.com/", p).allow === evaluateNavigation("https://x.example.com/", p).allow);
ok("evaluation does not mutate the policy", p.allowedDomains.length === 2, String(p.allowedDomains.length));
ok("a policy with no confirmActions still evaluates", evaluateAction("navigate", {} as BrowserNetworkPolicy).proceed === true);
ok("a policy with no maxOutput falls back to the default",
  clampOutput("z".repeat(DEFAULT_MAX_OUTPUT + 10), {} as BrowserNetworkPolicy).truncated === true);

console.log("");
console.log(`${passed} passed, ${failed} failed`);
if (failures.length > 0) {
  console.log("failures:");
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}


console.log("== 4. explicit deny BEATS the allowlist");
const withDeny: BrowserNetworkPolicy = { ...p, denyDomains: ["api.trusted.dev"] };
ok("an explicitly denied host is refused", !evaluateNavigation("https://api.trusted.dev/", withDeny).allow);
ok("the explicit-deny reason is reported", evaluateNavigation("https://api.trusted.dev/", withDeny).reason === "denied-explicitly");
ok("other allowlisted hosts are unaffected", evaluateNavigation("https://example.com/", withDeny).allow);
const withAlways: BrowserNetworkPolicy = { ...p, alwaysAllow: ["cdn.vendor.net"] };
ok("an always-allowed host is allowed without being listed", evaluateNavigation("https://cdn.vendor.net/", withAlways).allow);
ok("the always-allow reason is reported", evaluateNavigation("https://cdn.vendor.net/", withAlways).reason === "allowed-always");
ok("always-allow does not bypass an explicit deny",
  !evaluateNavigation("https://cdn.vendor.net/", { ...withAlways, denyDomains: ["cdn.vendor.net"] }).allow);
