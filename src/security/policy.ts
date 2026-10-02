/**
 * §DECLARATIVE, FAIL-CLOSED ACTION POLICY
 *
 * The rules in `actionGraph.ts` that decide an action are regexes. Regexes are
 * readable and they are also arguable: "does `write_file` really match?" has no
 * answer you can point at in a policy document, only at an implementation.
 *
 * Every serious policy engine in this space converged on the same answer, and
 * SelfImpulse is the product where getting the FAILURE SEMANTICS right matters
 * more than the syntax:
 *
 *   - Open Policy Agent (Rego, CNCF-graduated): policy is data, not code, and
 *     "no model in the enforcement path".
 *   - Cedar (AWS): formally verified semantics, fine-grained per-request
 *     decisions, deny is structural rather than conventional.
 *   - Agent-runtime boundary rules: "a rule that fails to compile refuses
 *     rather than opening the gate… broken config usually degrades toward
 *     permissive, and that is the bug."
 *
 * So the syntax here is a small, deliberately boring expression language, and
 * the SEMANTICS are the point. Four rules, each one a way a policy engine
 * usually fails open:
 *
 *   1. NO POLICY PERMITS NOTHING. An absent or empty policy is a deny, not a
 *      default-allow. "We never configured it" must not mean "anything goes".
 *   2. DENY BEFORE ALLOW. A deny match wins even when an allow also matches, so
 *      adding a broad allow can never widen past an existing deny by accident.
 *   3. A RULE THAT DOES NOT COMPILE REFUSES. A malformed policy stops the run
 *      with a named error. It never degrades to permissive.
 *   4. AN ENGINEER THAT THROWS REFUSES. Defence in depth: a bug in evaluation
 *      is a denial, not an outage that silently allows.
 *
 * This is a SUBSET on purpose. It is not CEL, Rego or Cedar, and it is not
 * trying to be. It is the smallest language that can express "this action, in
 * this context, is/is not permitted", evaluated deterministically with a
 * documented failure mode.
 *
 * WHY NOT ADOPT AN EXISTING ENGINE: OPA and Cedar are both substantial
 * dependencies, and a desktop app that must run with no server has a strong
 * reason to keep its enforcement path auditable in one file. The semantics are
 * the lesson; the code is ours.
 */

/* ═══════════════════════════════════════════════════════════════════════════
   1 · THE FACTS A POLICY CAN LOOK AT
   ═══════════════════════════════════════════════════════════════════════════ */

export type FactValue = string | number | boolean | string[];

export interface ActionFacts {
  /** The action name, e.g. "write_file", "exec", "http_fetch". */
  action: string;
  /** The principal doing it. */
  principal: string;
  /** What the seat is for — used for scoping, e.g. "reviewer", "coder". */
  role: string;
  /** Anything else the caller wants the policy to be able to see. Values are
   *  primitives only: a policy language that can walk objects is a policy
   *  language that can be confused by them. */
  context?: Record<string, FactValue>;
}

export type Comparison = "==" | "!=" | "contains" | "matches" | "in" | ">" | "<";

export interface Rule {
  /** Human label. Appears in every refusal, so the operator learns the name
   *  of the rule that stopped them rather than a bare "denied". */
  name: string;
  /** The action this rule applies to. `*` matches any. */
  action: string;
  /** Optional role scope. `*` matches any. */
  role?: string;
  /** The comparison and the field it reads. */
  field: string;
  op: Comparison;
  value: FactValue;
}

export interface Policy {
  name: string;
  /** Deny rules are evaluated FIRST and always win. */
  deny: Rule[];
  allow: Rule[];
}

/* ═══════════════════════════════════════════════════════════════════════════
   2 · COMPILATION — where "fails closed" is actually decided
   ═══════════════════════════════════════════════════════════════════════════ */

export type CompileResult =
  | { ok: true; policy: Policy }
  | { ok: false; errors: string[] };

const OPS: readonly Comparison[] = ["==", "!=", "contains", "matches", "in", ">", "<"];

function checkRule(r: Rule, i: number, kind: "deny" | "allow", errors: string[]): void {
  const at = `${kind}[${i}]`;
  if (!r || typeof r !== "object") { errors.push(`${at}: not a rule object`); return; }
  if (!r.name || typeof r.name !== "string") errors.push(`${at}: a rule needs a name; an unnamed rule cannot be quoted in a refusal`);
  if (!r.action || typeof r.action !== "string") errors.push(`${at}: a rule needs an action pattern`);
  if (r.role !== undefined && typeof r.role !== "string") errors.push(`${at}.role: must be a string or omitted`);
  if (!r.field || typeof r.field !== "string") errors.push(`${at}: a rule needs a field to read`);
  if (!OPS.includes(r.op)) errors.push(`${at}.op: "${String(r.op)}" is not one of ${OPS.join(" ")}`);
  if (r.value === undefined) errors.push(`${at}.value: a rule needs a value to compare against`);
  if (r.op === "matches" && typeof r.value !== "string") {
    errors.push(`${at}.value: "matches" needs a string pattern, got ${typeof r.value}`);
  }
  // A pattern that does not compile is a POLICY error, and per rule 3 a policy
  // error refuses. Detect it here rather than letting a broken RegExp surface
  // mid-evaluation, where a naive engine might treat the throw as "no match".
  if (r.op === "matches" && typeof r.value === "string") {
    try { new RegExp(r.value); }
    catch (e) { errors.push(`${at}.value: "${r.value}" is not a valid pattern (${(e as Error).message})`); }
  }
}

export function compile(input: unknown): CompileResult {
  const errors: string[] = [];
  if (!input || typeof input !== "object") {
    return { ok: false, errors: ["policy is not an object"] };
  }
  const p = input as Partial<Policy>;
  if (!p.name || typeof p.name !== "string") errors.push("policy: needs a name");
  for (const kind of ["deny", "allow"] as const) {
    const list = p[kind];
    // A missing list is not an error: it is an empty list, and empty is fine.
    // What is NOT fine is a list of the wrong shape.
    if (list === undefined) continue;
    if (!Array.isArray(list)) { errors.push(`${kind}: must be an array of rules`); continue; }
    list.forEach((r, i) => checkRule(r as Rule, i, kind, errors));
  }
  if (errors.length) return { ok: false, errors };
  return { ok: true, policy: { name: p.name!, deny: p.deny ?? [], allow: p.allow ?? [] } };
}

/* ═══════════════════════════════════════════════════════════════════════════
   3 · EVALUATION
   ═══════════════════════════════════════════════════════════════════════════ */

export type Decision =
  | { effect: "allow"; rule: string; policy: string }
  | { effect: "deny"; reason: string; rule?: string; policy?: string };

/** Read a field. Only top-level `action`, `principal`, `role` and flat context
 *  keys are addressable. A missing field yields undefined, and a rule comparing
 *  against undefined never matches a non-null value — see matchesRule. */
function readField(facts: ActionFacts, field: string): FactValue | undefined {
  switch (field) {
    case "action": return facts.action;
    case "principal": return facts.principal;
    case "role": return facts.role;
    default: return facts.context?.[field];
  }
}

function eq(a: FactValue | undefined, b: FactValue): boolean {
  if (a === undefined) return false;
  if (Array.isArray(a)) return b instanceof Array ? JSON.stringify(a) === JSON.stringify(b) : false;
  if (typeof a === "number" && typeof b === "number") return a === b;
  if (typeof a === "boolean" && typeof b === "boolean") return a === b;
  return String(a) === String(b);
}

export function matchesRule(rule: Rule, facts: ActionFacts): boolean {
  if (rule.action !== "*" && rule.action !== facts.action) return false;
  if (rule.role !== undefined && rule.role !== "*" && rule.role !== facts.role) return false;
  const actual = readField(facts, rule.field);
  switch (rule.op) {
    case "==": return eq(actual, rule.value);
    case "!=": return actual !== undefined && !eq(actual, rule.value);
    // "a rule that fails to compile refuses" means an UNMATCHED comparison must
    // not be read as permission. `!=` against a missing field is therefore
    // false, not true — a field the policy could not see cannot clear a rule.
    case "contains":
      if (Array.isArray(actual)) return actual.some((x) => eq(x, rule.value));
      if (typeof actual === "string" && typeof rule.value === "string") return actual.includes(rule.value);
      return false;
    case "matches":
      if (typeof actual !== "string" || typeof rule.value !== "string") return false;
      try { return new RegExp(rule.value).test(actual); }
      catch { return false; } // unreachable: compile() rejects this first
    case "in":
      return Array.isArray(rule.value) && rule.value.some((x) => eq(actual, x));
    case ">": return typeof actual === "number" && typeof rule.value === "number" && actual > rule.value;
    case "<": return typeof actual === "number" && typeof rule.value === "number" && actual < rule.value;
    default: return false;
  }
}

/**
 * The evaluation order that the whole design exists to guarantee.
 *
 * RULE 1 — no policy permits nothing.
 * RULE 2 — deny before allow.
 * RULE 3 — a rule that does not compile refuses.
 * RULE 4 — an evaluator that throws refuses.
 */
export function evaluate(policy: Policy | null | undefined, facts: ActionFacts): Decision {
  // RULE 1. Absent, empty, or an empty policy document denies.
  if (!policy) return { effect: "deny", reason: "no policy is configured; an unconfigured policy permits nothing" };
  const hasRules = policy.deny.length > 0 || policy.allow.length > 0;
  if (!hasRules) {
    return { effect: "deny", reason: `policy "${policy.name}" has no rules; an empty policy permits nothing` };
  }

  try {
    // RULE 2. Deny first, and it wins outright.
    for (const r of policy.deny) {
      if (matchesRule(r, facts)) {
        return { effect: "deny", rule: r.name, policy: policy.name, reason: `refused by rule "${r.name}"` };
      }
    }
    for (const r of policy.allow) {
      if (matchesRule(r, facts)) {
        return { effect: "allow", rule: r.name, policy: policy.name };
      }
    }
    // No allow matched. Default-deny within a configured policy.
    return {
      effect: "deny",
      policy: policy.name,
      reason: `no allow rule in "${policy.name}" matched ${facts.action} for role "${facts.role}"; policy is default-deny`,
    };
  } catch (err) {
    // RULE 4. A bug in evaluation is a denial, never an outage that allows.
    return { effect: "deny", reason: `policy evaluation failed and was treated as a denial: ${String(err)}` };
  }
}

/* ═══════════════════════════════════════════════
   4 · ROLE RESOLUTION — the last fail-open hole
   ═══════════════════════════════════════════════ */

/** The seats this build knows how to authorize. Mirrors the team validator in
 * `agentTeam.ts`; a role that is not on this list is not a role, it is a typo
 * or an injected value, and it must not inherit somebody else's powers. */
export const KNOWN_ROLES: readonly string[] = Object.freeze([
  "planner", "architect", "coder", "tester", "reviewer", "security", "synthesizer", "debugger",
]);

/**
 * The role a seat is judged as when it has not declared one it can be held to.
 *
 * This exists because the honest default is not obvious and the dishonest one
 * is easy: `String(config.role ?? "coder")` reads like a reasonable fallback and
 * silently hands every malformed seat the permissions of a working developer —
 * shell, writes, and everything the policy attaches to `coder`. A missing role
 * is not evidence of a coder. It is the absence of evidence, and in a
 * governance product the absence of evidence must resolve to no authority.
 *
 * The sentinel is deliberately a string that can never appear in KNOWN_ROLES,
 * and no ALLOW rule may name it, so an unassigned seat matches no grant.
 */
export const UNASSIGNED_ROLE = "(unassigned)";

/** Resolve a configured role into the role facts are evaluated against. */
export function resolveRole(configured: unknown): string {
  if (typeof configured !== "string") return UNASSIGNED_ROLE;
  const trimmed = configured.trim();
  if (trimmed === "" || trimmed === UNASSIGNED_ROLE) return UNASSIGNED_ROLE;
  return KNOWN_ROLES.includes(trimmed) ? trimmed : UNASSIGNED_ROLE;
}

/* ═══════════════════════════════════════════════════════════════════════════
   5 · A DEFAULT POLICY — the one that ships
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * The shipped baseline. It is intentionally NARROW. A local desktop agent that
 * ships a permissive default is how a tool becomes the thing it was built to
 * prevent, and this is the document an operator is expected to edit.
 */
export const DEFAULT_POLICY_SOURCE: Policy = {
  name: "selfimpulse-baseline",
  deny: [
    /* A seat that never declared a role gets no authority at all. This rule
     * exists because the shipped read rule below is deliberately role-INDEPENDENT:
     * reads are the weakest capability, and requiring a role for them would add
     * ceremony without adding safety. But that same generosity would silently hand
     * a malformed or injected seat read access, so the nameless case is denied
     * outright here rather than left to the absence of a matching allow. An
     * unowned seat should be inert, and an inert seat should say so in a rule an
     * operator can find and read. */
    { name: "unassigned-seat-is-inert", action: "*", role: UNASSIGNED_ROLE, field: "role", op: "==", value: UNASSIGNED_ROLE },
    // Destructive filesystem and history operations are never permitted by a
    // seat's own authority. Deny-before-allow means an operator can add a broad
    // allow for a tool without ever widening past this.
    { name: "no-destructive-fs", action: "*", field: "action", op: "matches", value: "^(rm_?rf?|delete|drop_table|truncate)$" },
    { name: "no-force-push", action: "*", field: "action", op: "matches", value: "force[_-]?push" },
    // A reviewer seat is read-only by policy, not merely by convention. If a
    // seat is mislabelled, this is the rule that stops it writing.
    //
    // It matches on the ACTION, scoped to the role. An earlier version matched
    // on the role alone, which denied EVERY reviewer action including reading —
    // the read-only rule silently became a no-work rule. A deny rule is a
    // blanket refusal by construction, so it must name the thing it refuses.
    { name: "reviewer-cannot-write", action: "*", role: "reviewer", field: "action", op: "matches", value: "^(write|edit|patch|apply|commit|rm|delete)" },
    // Never leave the machine by default.
    { name: "no-egress-by-default", action: "*", field: "action", op: "matches", value: "^(http|curl|wget|fetch)_?" },
  ],
  allow: [
    { name: "reader-may-read", action: "*", field: "action", op: "matches", value: "^(read|list|stat|grep|search|ls)" },
    { name: "tester-may-test", action: "test", field: "action", op: "==", value: "test" },
    { name: "coder-may-write", action: "*", role: "coder", field: "role", op: "==", value: "coder" },
    { name: "shell-for-coders", action: "*", role: "coder", field: "action", op: "matches", value: "^(exec|run|shell)" },
  ],
};

export const DEFAULT_POLICY: Policy = (compile(DEFAULT_POLICY_SOURCE) as { ok: true; policy: Policy }).policy;
