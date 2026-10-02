/**
 * Browser network ENFORCEMENT — the injected runtime guard.
 *
 * SOURCE ADOPTION (real code, adapted). The guard script in
 * `browser-guard.script.mjs` is adopted from agent-browser's browser
 * containment layer:
 *
 *   source    github.com/vercel-labs/agent-browser
 *   commit    d01253d9db28
 *   file      cli/src/native/network.rs  ->  fn domain_filter_script()
 *   licence   Apache-2.0, Copyright Vercel, Inc.
 *   notices   THIRD-PARTY-NOTICES.md
 *
 * WHAT WAS ADOPTED
 *   The proven enforcement design, which is the genuinely hard part. Rather
 *   than only checking URLs it is asked about, the guard is INSTALLED INTO THE
 *   PAGE and intercepts the browser's own network APIs — fetch,
 *   XMLHttpRequest, WebSocket, EventSource, sendBeacon, importScripts, Worker,
 *   SharedWorker and RTCPeerConnection. A page cannot reach a disallowed host
 *   even if it builds the request itself, because the API it would use is
 *   wrapped before the page's own script runs.
 *
 *   The worker bootstrap is the subtle part. A Worker executes in its own
 *   global scope, so a naive patch does not apply inside it. The adopted
 *   design re-installs the guard from inside the worker via a Blob bootstrap
 *   and FAILS CLOSED when the page's CSP blocks that bootstrap — the worker
 *   refuses to start rather than running unguarded. That property is the
 *   reason to adopt this code rather than write an equivalent.
 *
 * OUR OPTIMISATIONS (deliberate divergences from upstream)
 *   1. FAIL CLOSED on an empty allowlist. Upstream's `DomainFilter::is_allowed`
 *      returns `true` when the list is empty. That is correct for a CLI flag
 *      where "no flag" means "the operator chose not to restrict me", and wrong
 *      for a governed runtime where the safe default is "reach nothing". Ours
 *      refuses everything until a host is explicitly allowed.
 *   2. SelfImpulse naming. No upstream identifier survives; this is first-party
 *      code and the naming probe holds it to that.
 *   3. The guard reports refusals through a global hook so the host process can
 *      record WHY a request was blocked, rather than only observing a thrown
 *      error inside the page.
 *
 * WHAT WAS NOT ADOPTED
 *   The Rust runtime, its CDP plumbing, and the profile/allowlist
 *   incompatibility that makes the upstream browser unusable with our
 *   persistent profiles. This is the security model, expressed for our own
 *   existing browser service.
 */

/** Sanitise an allowlist before it reaches the injected script. */
export function normaliseAllowlist(allowed: readonly string[] | undefined): string[] {
  if (!allowed) return [];
  const seen = new Set<string>();
  for (const raw of allowed) {
    const p = String(raw).trim().toLowerCase();
    if (p) seen.add(p);
  }
  return Array.from(seen);
}

/**
 * The CDP calls that install the guard on a session.
 *
 * Two layers, both required:
 *   - `Page.addScriptToEvaluateOnNewDocument` covers every document loaded
 *     after installation, including navigations and new tabs.
 *   - `Runtime.evaluate` covers the document that is ALREADY loaded, which the
 *     first call does not touch.
 *
 * Installing only one leaves a window in which the current page is unguarded.
 */
export const GUARD_CDP_METHODS = [
  { method: "Page.addScriptToEvaluateOnNewDocument", paramsKey: "source" },
  { method: "Runtime.evaluate", paramsKey: "expression" },
] as const;

/** The name of the in-page global the host process reads blocked events from. */
export const GUARD_REPORT_GLOBAL = "__selfimpulseGuardReport";

/**
 * Build the expression the host process evaluates to install the guard.
 *
 * The guard body itself lives in `browser-guard.script.mjs` as a real file
 * rather than a giant string literal, so it is syntax-highlighted, diffable and
 * testable as JavaScript instead of as TypeScript string fragments.
 *
 * The call evaluates the module factory with this session's allowlist, and
 * wires the report hook so every refusal is observable from the host.
 */
export function buildNetworkGuardScript(
  allowedDomains: readonly string[],
  onBlocked?: string
): string {
  const domains = JSON.stringify(normaliseAllowlist(allowedDomains));
  const report = onBlocked ?? "undefined";
  return `globalThis.${GUARD_REPORT_GLOBAL} = globalThis.${GUARD_REPORT_GLOBAL} || [];
(${report});
__installSelfImpulseNetworkGuard(${domains});`;
}

/**
 * Facts about the guard, for a probe and for Settings -> About.
 *
 * Returned as data so the guardrail manifest can state the real containment
 * rather than a claim.
 */
export function guardFacts() {
  return {
    adoptedFrom: "browser containment layer (Apache-2.0)",
    installedInto: "the page, before its own scripts run",
    guards: [
      "fetch",
      "XMLHttpRequest",
      "WebSocket",
      "EventSource",
      "sendBeacon",
      "importScripts",
      "Worker",
      "SharedWorker",
      "RTCPeerConnection",
      "webkitRTCPeerConnection",
    ],
    emptyAllowlist: "closed",
    workerCspBlocked: "fails closed",
    installLayers: GUARD_CDP_METHODS.length,
  } as const;
}
