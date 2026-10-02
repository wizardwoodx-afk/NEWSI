/**
 * SelfImpulse — failure taxonomy & recovery (19.0.0 "Bastion").
 *
 * Sub-agent failures are not one blob called "error". Every non-execution
 * is classified into a named class with (a) an honest user-facing meaning,
 * (b) concrete recovery advice, and (c) a retry policy that says whether
 * trying again could possibly help. A failure the system cannot classify is
 * reported as unknown — never dressed up as something it is not.
 */

export type FailureClass =
  | "no-provider"
  | "provider-auth"
  | "provider-rate-limit"
  | "provider-timeout"
  | "provider-unreachable"
  | "bad-response"
  | "gate-denied"
  | "policy-refused"
  | "injection-blocked"
  | "peer-refused"
  | "bad-input"
  | "unknown";

export interface FailureInfo {
  klass: FailureClass;
  /** "error" = something failed; "info" = the system chose not to execute, honestly. */
  severity: "error" | "info";
  /** One sentence, user-facing, no jargon walls. */
  meaning: string;
  /** The next concrete step a human can take. */
  advice: string;
  /** Would an automatic retry plausibly change the outcome? */
  retryable: boolean;
}

const INFO: Record<string, { meaning: string; advice: string }> = {
  "no-provider": {
    meaning: "No provider key is configured, so nothing could execute — you received a plan instead of a run.",
    advice: "Add a provider key in the door (stored locally, never uploaded) and re-run; the plan is ready to execute as-is.",
  },
  "gate-denied": {
    meaning: "A human denied this at the gate. That decision is final for this run.",
    advice: "If the concern was scope, narrow the request and send it again; the denial is logged and never silently retried.",
  },
  "policy-refused": {
    meaning: "This work is refused by policy — the refusal is the correct, intended behaviour.",
    advice: "Reframe the request within policy, or route the underlying need through a permitted path.",
  },
  "injection-blocked": {
    meaning: "The GuardRail detected prompt-injection content and blocked the request before anything ran.",
    advice: "Remove embedded instructions from pasted content (quote it as data), then resend.",
  },
  "peer-refused": {
    meaning: "The peer declined or the delegation could not be sent — nothing ran on either side.",
    advice: "Check the handoff ledger for the reason in the peer's words; fix the cause before re-offering.",
  },
};

const ERRORS: Record<string, { meaning: string; advice: string; retryable: boolean }> = {
  "provider-auth": {
    meaning: "The provider rejected the API key (401/403).",
    advice: "Verify the key is active and has quota; re-enter it in the door. The key never leaves this machine.",
    retryable: false,
  },
  "provider-rate-limit": {
    meaning: "The provider rate-limited the request (429).",
    advice: "Wait briefly and retry; if it persists, spread requests out or switch provider.",
    retryable: true,
  },
  "provider-timeout": {
    meaning: "The provider did not respond within the time limit.",
    advice: "Retry once; if it repeats, shorten the request or check provider status.",
    retryable: true,
  },
  "provider-unreachable": {
    meaning: "The provider endpoint could not be reached (network/DNS/endpoint).",
    advice: "Check connectivity and the endpoint URL; nothing was sent or executed.",
    retryable: true,
  },
  "bad-response": {
    meaning: "The provider responded, but the response could not be used (malformed or empty).",
    advice: "Retry; if it persists, the provider may be degraded — try another one.",
    retryable: true,
  },
  "bad-input": {
    meaning: "The request itself could not be processed (empty or unreadable).",
    advice: "Rephrase the request; if it contained pasted content, check for encoding damage.",
    retryable: false,
  },
  "unknown": {
    meaning: "The failure did not match any known class — reported honestly as unknown rather than guessed at.",
    advice: "The full note is preserved verbatim; retry once, and if it repeats, report it with the note attached.",
    retryable: false,
  },
};

/**
 * Classify a non-executed outcome from the pipeline's own signals. The
 * outcome decides the info classes; the provider error text (when present)
 * decides among the error classes. Order matters: auth before rate-limit
 * before reachability, because a 401 body often mentions the endpoint too.
 */
export function classifyFailure(
  outcome: "planned" | "refused" | "gated-out" | "error",
  note?: string,
): FailureInfo {
  const n = (note ?? "").toLowerCase();

  if (outcome === "planned") return info("no-provider");
  if (outcome === "gated-out") return info("gate-denied");
  if (outcome === "refused") {
    if (n.includes("injection") || n.includes("guardrail")) return info("injection-blocked");
    if (n.includes("peer") || n.includes("delegat") || n.includes("bridge")) return info("peer-refused");
    return info("policy-refused");
  }

  // outcome === "error"
  if (/401|403|invalid api key|unauthorized|forbidden/.test(n)) return error("provider-auth");
  if (/429|rate.?limit|too many requests|quota/.test(n)) return error("provider-rate-limit");
  if (/timeout|timed out|deadline/.test(n)) return error("provider-timeout");
  if (/econnrefused|enotfound|fetch failed|network|dns|unreachable|socket/.test(n)) return error("provider-unreachable");
  if (/json|parse|malformed|empty response|unexpected token/.test(n)) return error("bad-response");
  if (/empty request|too short|unreadable/.test(n)) return error("bad-input");
  return error("unknown");
}

function info(klass: FailureClass): FailureInfo {
  const e = INFO[klass] ?? INFO["policy-refused"];
  return { klass, severity: "info", meaning: e.meaning, advice: e.advice, retryable: false };
}
function error(klass: FailureClass): FailureInfo {
  const e = ERRORS[klass] ?? ERRORS["unknown"];
  return { klass, severity: "error", meaning: e.meaning, advice: e.advice, retryable: e.retryable };
}

/** Should the pipeline auto-retry this class? Bounded: transient classes only. */
export function shouldRetry(f: FailureInfo): boolean {
  return f.severity === "error" && f.retryable;
}
