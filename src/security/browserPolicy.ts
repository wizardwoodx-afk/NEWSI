/**
 * Browser network policy — the containment layer for an agent-driven browser.
 *
 * Source adoption. The security model (domain allowlist with wildcard
 * matching, network-behaviour controls, destructive-action gating, and output
 * caps) is adapted from agent-browser's documented security layer
 * (github.com/vercel-labs/agent-browser, `docs/src/app/security/page.mdx`,
 * Apache-2.0, Copyright 2025 Vercel, Inc.) and re-expressed as SelfImpulse's own
 * policy module. No source file was copied and no runtime dependency was added;
 * this is first-party TypeScript implementing the adopted model.
 *
 * What was adopted, and what was deliberately not
 * -----------------------------------------------
 * ADOPTED — the policy model:
 *   - a domain allowlist with `*.example.com` wildcard support, where an empty
 *     list means "deny all", never "allow all"
 *   - per-scheme and per-URL checks that also constrain sub-resource loads, not
 *     just top-level navigation
 *   - an action policy that classifies destructive actions and can require
 *     explicit confirmation
 *   - an output-length cap, so a page cannot flood the context
 *
 * NOT ADOPTED — the runtime:
 *   agent-browser is a native Rust CLI whose allowlist REJECTS persistent
 *   profiles, pre-existing CDP sessions, auto-connect and state replay while
 *   the allowlist is active. SelfImpulse's browser is profile-based
 *   (`src/engine/browserWorkspace.ts`), so adopting that runtime would have
 *   disabled the feature it is meant to protect. The plan (§3) says to take the
 *   security patterns, not the framework — this module is that outcome.
 *
 * The rule this module keeps
 * --------------------------
 * Policy decides. The browser does not. `evaluateNavigation` is a pure function
 * of (url, policy): it consults the policy and returns a decision. It never
 * consults the network, never mutates the policy, and never widens it. A caller
 * that ignores a `deny` has a bug, so every decision carries a reason string
 * that is meant to be surfaced and receipted.
 */

/** The action categories that can be gated. Adopted from the upstream policy file shape. */
export type BrowserActionCategory =
  | "navigate"
  | "click"
  | "type"
  | "upload"
  | "download"
  | "eval"
  | "credentials"
  | "delete"
  | "purchase"
  | "submit";

/** Categories that change the world and therefore need a human decision by default. */
const DESTRUCTIVE_ACTIONS: ReadonlySet<BrowserActionCategory> = new Set<BrowserActionCategory>([
  "delete",
  "purchase",
  "submit",
  "download",
  "credentials",
  "eval",
]);

/** Schemes the agent browser may ever load. Anything else is refused outright. */
const ALLOWED_SCHEMES: ReadonlySet<string> = new Set(["http:", "https:"]);

/** Default output cap, in characters. Matches the order of magnitude upstream uses. */
export const DEFAULT_MAX_OUTPUT = 50_000;

/**
 * The policy. An empty `allowedDomains` is a DENY-ALL policy, not an open one.
 *
 * That direction is the whole point: a misconfigured or default-constructed
 * policy must fail closed, so a bug produces a browser that cannot reach the
 * internet rather than one that can reach anything.
 */
export interface BrowserNetworkPolicy {
  /** Host patterns. `example.com` matches that host; `*.example.com` matches subdomains. */
  allowedDomains: readonly string[];
  /** Extra hosts allowed regardless of the allowlist (e.g. a known CDN). */
  alwaysAllow?: readonly string[];
  /** Refuse these even if allowlisted — an explicit deny always wins. */
  denyDomains?: readonly string[];
  /** Cap on captured page output, in characters. */
  maxOutput?: number;
  /** Actions that require explicit human confirmation. */
  confirmActions?: readonly BrowserActionCategory[];
  /** When true, destructive actions are always confirmed, even if not listed. */
  confirmDestructiveAlways?: boolean;
  /** Allow sub-resource loads (scripts, images, fetch) only from allowlisted hosts. */
  constrainSubresources?: boolean;
  /** Refuse `data:`, `blob:`, `file:` and any other non-http(s) scheme. */
  allowOnlyHttpSchemes?: boolean;
}

/** The strictest policy: no destinations at all. Used before a policy is configured. */
export const DENY_ALL: BrowserNetworkPolicy = Object.freeze({
  allowedDomains: Object.freeze([]),
  maxOutput: 0,
  confirmActions: Object.freeze([]),
  confirmDestructiveAlways: true,
  constrainSubresources: true,
  allowOnlyHttpSchemes: true,
});

/**
 * A sensible default policy that is still closed until the owner adds hosts.
 *
 * Read-only navigation to the hosts the owner names, no sub-resource escape, no
 * non-http scheme, and every destructive action confirmed.
 */
export function defaultPolicy(allowedDomains: readonly string[] = []): BrowserNetworkPolicy {
  return {
    allowedDomains: [...allowedDomains],
    maxOutput: DEFAULT_MAX_OUTPUT,
    confirmActions: ["delete", "purchase", "submit", "download", "credentials", "eval"],
    confirmDestructiveAlways: true,
    constrainSubresources: true,
    allowOnlyHttpSchemes: true,
  };
}


/** Why a URL was allowed or refused. Every decision carries one. */
export type PolicyReason =
  | "allowed-by-list"
  | "allowed-always"
  | "denied-explicitly"
  | "not-in-allowlist"
  | "scheme-not-allowed"
  | "malformed-url"
  | "subresource-not-allowed";

export interface PolicyDecision {
  allow: boolean;
  reason: PolicyReason;
  /** A sentence fit for a receipt line or an error shown to a human. */
  detail: string;
  host: string | null;
}

/** Parse without throwing. A malformed URL is a denial, never an exception. */
function parse(raw: string): URL | null {
  try {
    return new URL(raw);
  } catch {
    return null;
  }
}

/**
 * Host-pattern match, adopted from the upstream allowlist semantics.
 *
 * `example.com` matches exactly that host. `*.example.com` matches any
 * subdomain. A leading `.` is treated the same as `*`. Comparison is
 * case-insensitive, and a match is on a label boundary, so `notexample.com`
 * never matches a pattern for `example.com`.
 */
export function hostMatches(host: string, pattern: string): boolean {
  const h = host.toLowerCase();
  const p = pattern.trim().toLowerCase();
  if (p === "*") return true;
  const bare = p.startsWith("*.") ? p.slice(2) : p.replace(/^\./, "");
  if (p.startsWith("*.")) return h === bare || h.endsWith(`.${bare}`);
  return h === bare;
}

function anyMatch(host: string, patterns: readonly string[] | undefined): boolean {
  return (patterns ?? []).some((p) => hostMatches(host, p));
}

/**
 * Decide a single URL against the policy. Pure: no I/O, no mutation.
 *
 * Order matters and is deliberate:
 *   1. malformed   -> deny
 *   2. scheme      -> deny anything that is not http(s)
 *   3. explicit deny -> deny, even if allowlisted
 *   4. always-allow  -> allow
 *   5. allowlist   -> allow or deny
 */
export function evaluateUrl(
  raw: string,
  policy: BrowserNetworkPolicy,
  opts: { subresource?: boolean } = {}
): PolicyDecision {
  const isSub = opts.subresource === true;

  const url = parse(raw);
  if (!url) {
    return {
      allow: false,
      reason: "malformed-url",
      detail: `"${raw}" is not a parsable URL`,
      host: null,
    };
  }

  if (policy.allowOnlyHttpSchemes !== false && !ALLOWED_SCHEMES.has(url.protocol)) {
    return {
      allow: false,
      reason: "scheme-not-allowed",
      detail: `scheme ${url.protocol} is not permitted; only http and https are`,
      host: url.hostname,
    };
  }

  const host = url.hostname;

  if (anyMatch(host, policy.denyDomains)) {
    return { allow: false, reason: "denied-explicitly", detail: `${host} is explicitly denied`, host };
  }

  if (anyMatch(host, policy.alwaysAllow)) {
    return { allow: true, reason: "allowed-always", detail: `${host} is always allowed`, host };
  }

  if (!anyMatch(host, policy.allowedDomains)) {
    return {
      allow: false,
      reason: "not-in-allowlist",
      detail: `${host} is not in the browser allowlist`,
      host,
    };
  }

  return {
    allow: true,
    reason: "allowed-by-list",
    detail: `${host} is allowlisted${isSub ? " (sub-resource)" : ""}`,
    host,
  };
}

/** Convenience: is this URL permitted for top-level navigation? */
export function evaluateNavigation(raw: string, policy: BrowserNetworkPolicy): PolicyDecision {
  return evaluateUrl(raw, policy, { subresource: false });
}

/** Convenience: is this URL permitted as a sub-resource load? */
export function evaluateSubresource(raw: string, policy: BrowserNetworkPolicy): PolicyDecision {
  return evaluateUrl(raw, policy, { subresource: true });
}

/** Is this action category destructive (changes the world)? */
export function isDestructive(category: BrowserActionCategory): boolean {
  return DESTRUCTIVE_ACTIONS.has(category);
}

export interface ActionDecision {
  /** May this action proceed without asking a human? */
  proceed: boolean;
  /** Must a human approve before it runs? */
  requiresConfirmation: boolean;
  destructive: boolean;
  detail: string;
}

/**
 * Decide whether an action may run unattended.
 *
 * Three ways to require confirmation, in increasing strictness:
 *   - the category is listed in `confirmActions`
 *   - the category is destructive and `confirmDestructiveAlways` is set
 * A caller must treat `requiresConfirmation` as binding: the human gate in
 * `src/mission/approvals.ts` is what actually asks, and the receipt records the
 * answer. This function only states the requirement.
 */
export function evaluateAction(
  category: BrowserActionCategory,
  policy: BrowserNetworkPolicy
): ActionDecision {
  const destructive = isDestructive(category);
  const listed = (policy.confirmActions ?? []).includes(category);
  const required = listed || (destructive && policy.confirmDestructiveAlways === true);

  return {
    proceed: !required,
    requiresConfirmation: required,
    destructive,
    detail: required
      ? `${category} requires human confirmation${destructive ? " (destructive action)" : ""}`
      : `${category} may proceed under the current policy`,
  };
}

export interface ClampResult {
  text: string;
  truncated: boolean;
  originalLength: number;
  limit: number;
}

/**
 * Cap captured page output so a page cannot flood the context window.
 *
 * Truncation is explicit and reported: a silently shortened body would be a
 * lie about what the agent saw, which is exactly the failure mode this product
 * is built to avoid.
 */
export function clampOutput(text: string, policy: BrowserNetworkPolicy): ClampResult {
  const limit = policy.maxOutput ?? DEFAULT_MAX_OUTPUT;
  if (limit <= 0) {
    return { text: "", truncated: text.length > 0, originalLength: text.length, limit };
  }
  if (text.length <= limit) {
    return { text, truncated: false, originalLength: text.length, limit };
  }

  const withheld = text.length - limit;
  const marker = `[truncated by browser policy: ${withheld} of ${text.length} characters withheld]`;

  // The marker must fit INSIDE the budget, otherwise a small cap returns more
  // than it allows — the opposite of a cap. If the cap cannot carry the full
  // explanation, return a bare marker cut to the cap. The result is then
  // terse, but `truncated` and `originalLength` remain exact, so the caller
  // still knows precisely what was withheld. The cap is the invariant; the
  // prose is not.
  const note = marker.length >= limit ? "…" : marker;
  return {
    text: text.slice(0, Math.max(0, limit - note.length)) + note.slice(0, limit),
    truncated: true,
    originalLength: text.length,
    limit,
  };
}

/**
 * The facts about a policy, for a probe and for Settings -> About.
 *
 * Returned as data so a test can assert the policy fails closed, and so the
 * guardrail manifest can state the real containment rather than a claim.
 */
export function policyFacts(policy: BrowserNetworkPolicy) {
  return {
    allowedDomains: policy.allowedDomains.length,
    denyDomains: (policy.denyDomains ?? []).length,
    maxOutput: policy.maxOutput ?? DEFAULT_MAX_OUTPUT,
    confirmActions: (policy.confirmActions ?? []).length,
    failsClosed: policy.allowedDomains.length === 0,
    httpSchemesOnly: policy.allowOnlyHttpSchemes !== false,
    subresourcesConstrained: policy.constrainSubresources === true,
  } as const;
}

/** True when the policy permits nothing at all. The state before configuration. */
export function isClosed(policy: BrowserNetworkPolicy): boolean {
  return policy.allowedDomains.length === 0 && (policy.alwaysAllow ?? []).length === 0;
}
