/**
 * §POLICY GATEWAY — the single decision seam for every proposed action.
 *
 * Before any tool call or dispatch reaches the execution plane, it MUST pass
 * through `policyGateway.propose(...)`. The gateway returns one of three
 * decisions:
 *
 *   • ALLOW   — the action may execute; an audit event is sealed into the
 *               receipt chain with the policy rule that allowed it.
 *   • STEER   — execution pauses for human approval; the UI surfaces the
 *               reason and waits for approve/deny.
 *   • DENY    — the action is refused in words, with the rule that refused
 *               it; no execution happens and the refusal is audited.
 *
 * The gateway is introduced in 17.1.3 to make the RISKY_TOOLS set a data-
 * driven policy rather than inline `if`s, and to prepare for CEL policy
 * rules (17.2). Every tool call — bridge, MCP, dispatch_mission — routes
 * through here, so future policies (budget, business-hours, workspace root,
 * egress scope, capability envelope) can be added in one place.
 *
 * The receipt chain always carries the decision: { kind: "policy", decision,
 * rule, reason, tool? } so refusals are auditable and the policy-replay
 * sandbox can re-evaluate historical chains against new rules.
 */
export type PolicyDecision = "allow" | "steer" | "deny";

export interface PolicyInput {
  /** Tool id (e.g. "workspace_write", "shell_exec", "dispatch_mission"). */
  tool: string;
  /** Tool/dispatch arguments, used by future CEL predicates. */
  args?: Record<string, unknown>;
  /** Human-facing summary for the approval card / refusal message. */
  detail: string;
  /** Optional mission ID this action belongs to (for budget-per-mission). */
  missionId?: string;
}

export interface PolicyResult {
  decision: PolicyDecision;
  /** Machine-readable rule id that produced the decision. */
  rule: string;
  /** Human-readable reason (shown in the approval card / refusal toast). */
  reason: string;
}

export interface PolicyAuditEvent {
  kind: "policy";
  decision: PolicyDecision;
  rule: string;
  reason: string;
  tool: string;
  ts: string;
}

/**
 * A PolicyRule evaluates a proposed action and returns a decision, or returns
 * `null` to abstain and let the next rule decide. The first non-null decision
 * wins; rules are evaluated in registration order. If every rule abstains the
 * action is allowed under the "default-allow" rule (which is itself named so
 * it appears in the audit trail).
 */
export type PolicyRule = (input: PolicyInput) => PolicyResult | null;

/* ── built-in rules ────────────────────────────────────────────────────── */

/**
 * Tools that ALWAYS require human approval before execution. This is the
 * original 16.10/17.1 RISKY_TOOLS behaviour, extracted as a named rule so
 * it appears in audit events ("rule: risky-tool-requires-approval") rather
 * than as an anonymous `if` in the dispatch loop.
 */
export const riskyTools = new Set<string>(["workspace_write", "dispatch_mission", "shell_exec"]);

const riskyToolRule: PolicyRule = (input) => {
  if (!riskyTools.has(input.tool)) return null;
  return {
    decision: "steer",
    rule: "risky-tool-requires-approval",
    reason: `\"${input.tool}\" is a governed action — human approval required before execution.`,
  };
};

/**
 * Budget-aware refuse: once per-mission spend exceeds the envelope, refuse
 * with the budget rule. 17.1.3 ships this as a hook (predicate returns false
 * = no budget) so consumers can wire in envelope state in 17.2.
 */
const budgetRule: PolicyRule = (_input) => null;

/**
 * Workspace root containment: refuse writes whose target path escapes the
 * workspace root. Path-validation is the caller's responsibility today (the
 * sandbox does symlink-proof canonicalization); this rule reserves the seat
 * for an explicit path argument check in 17.2.
 */
const workspaceRootRule: PolicyRule = (_input) => null;

/** Ordered list. Order matters: earlier rules win. */
const RULES: PolicyRule[] = [riskyToolRule, workspaceRootRule, budgetRule];

const DEFAULT_ALLOW: PolicyResult = {
  decision: "allow",
  rule: "default-allow",
  reason: "no governing rule matched; action allowed",
};

/** Register an additional rule. Used by tests and (in 17.2) the CEL loader. */
export function registerPolicyRule(rule: PolicyRule): void {
  RULES.push(rule);
}

/** Test helper: clear rules back to the built-in set. */
export function _resetPolicyRulesForProbe(): void {
  RULES.length = 0;
  RULES.push(riskyToolRule, workspaceRootRule, budgetRule);
}

/** Propose an action. Returns the winning decision and produces a sealed audit event. */
export function propose(input: PolicyInput): PolicyResult & { audit: PolicyAuditEvent } {
  for (const rule of RULES) {
    const r = rule(input);
    if (r) {
      return { ...r, audit: { kind: "policy", decision: r.decision, rule: r.rule, reason: r.reason, tool: input.tool, ts: new Date().toISOString() } };
    }
  }
  return { ...DEFAULT_ALLOW, audit: { kind: "policy", decision: "allow", rule: DEFAULT_ALLOW.rule, reason: DEFAULT_ALLOW.reason, tool: input.tool, ts: new Date().toISOString() } };
}
