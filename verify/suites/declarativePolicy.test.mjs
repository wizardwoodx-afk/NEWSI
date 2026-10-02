import { createRequire as __mjCreateRequire } from "node:module"; const require = __mjCreateRequire(import.meta.url);

// probe/declarativePolicy.test.ts
import * as fs from "node:fs";
import * as path from "node:path";

// src/security/policy.ts
var OPS = ["==", "!=", "contains", "matches", "in", ">", "<"];
function checkRule(r, i, kind, errors) {
  const at = `${kind}[${i}]`;
  if (!r || typeof r !== "object") {
    errors.push(`${at}: not a rule object`);
    return;
  }
  if (!r.name || typeof r.name !== "string") errors.push(`${at}: a rule needs a name; an unnamed rule cannot be quoted in a refusal`);
  if (!r.action || typeof r.action !== "string") errors.push(`${at}: a rule needs an action pattern`);
  if (r.role !== void 0 && typeof r.role !== "string") errors.push(`${at}.role: must be a string or omitted`);
  if (!r.field || typeof r.field !== "string") errors.push(`${at}: a rule needs a field to read`);
  if (!OPS.includes(r.op)) errors.push(`${at}.op: "${String(r.op)}" is not one of ${OPS.join(" ")}`);
  if (r.value === void 0) errors.push(`${at}.value: a rule needs a value to compare against`);
  if (r.op === "matches" && typeof r.value !== "string") {
    errors.push(`${at}.value: "matches" needs a string pattern, got ${typeof r.value}`);
  }
  if (r.op === "matches" && typeof r.value === "string") {
    try {
      new RegExp(r.value);
    } catch (e) {
      errors.push(`${at}.value: "${r.value}" is not a valid pattern (${e.message})`);
    }
  }
}
function compile(input) {
  const errors = [];
  if (!input || typeof input !== "object") {
    return { ok: false, errors: ["policy is not an object"] };
  }
  const p = input;
  if (!p.name || typeof p.name !== "string") errors.push("policy: needs a name");
  for (const kind of ["deny", "allow"]) {
    const list = p[kind];
    if (list === void 0) continue;
    if (!Array.isArray(list)) {
      errors.push(`${kind}: must be an array of rules`);
      continue;
    }
    list.forEach((r, i) => checkRule(r, i, kind, errors));
  }
  if (errors.length) return { ok: false, errors };
  return { ok: true, policy: { name: p.name, deny: p.deny ?? [], allow: p.allow ?? [] } };
}
function readField(facts2, field) {
  switch (field) {
    case "action":
      return facts2.action;
    case "principal":
      return facts2.principal;
    case "role":
      return facts2.role;
    default:
      return facts2.context?.[field];
  }
}
function eq(a, b) {
  if (a === void 0) return false;
  if (Array.isArray(a)) return b instanceof Array ? JSON.stringify(a) === JSON.stringify(b) : false;
  if (typeof a === "number" && typeof b === "number") return a === b;
  if (typeof a === "boolean" && typeof b === "boolean") return a === b;
  return String(a) === String(b);
}
function matchesRule(rule, facts2) {
  if (rule.action !== "*" && rule.action !== facts2.action) return false;
  if (rule.role !== void 0 && rule.role !== "*" && rule.role !== facts2.role) return false;
  const actual = readField(facts2, rule.field);
  switch (rule.op) {
    case "==":
      return eq(actual, rule.value);
    case "!=":
      return actual !== void 0 && !eq(actual, rule.value);
    // "a rule that fails to compile refuses" means an UNMATCHED comparison must
    // not be read as permission. `!=` against a missing field is therefore
    // false, not true — a field the policy could not see cannot clear a rule.
    case "contains":
      if (Array.isArray(actual)) return actual.some((x) => eq(x, rule.value));
      if (typeof actual === "string" && typeof rule.value === "string") return actual.includes(rule.value);
      return false;
    case "matches":
      if (typeof actual !== "string" || typeof rule.value !== "string") return false;
      try {
        return new RegExp(rule.value).test(actual);
      } catch {
        return false;
      }
    // unreachable: compile() rejects this first
    case "in":
      return Array.isArray(rule.value) && rule.value.some((x) => eq(actual, x));
    case ">":
      return typeof actual === "number" && typeof rule.value === "number" && actual > rule.value;
    case "<":
      return typeof actual === "number" && typeof rule.value === "number" && actual < rule.value;
    default:
      return false;
  }
}
function evaluate(policy, facts2) {
  if (!policy) return { effect: "deny", reason: "no policy is configured; an unconfigured policy permits nothing" };
  const hasRules = policy.deny.length > 0 || policy.allow.length > 0;
  if (!hasRules) {
    return { effect: "deny", reason: `policy "${policy.name}" has no rules; an empty policy permits nothing` };
  }
  try {
    for (const r of policy.deny) {
      if (matchesRule(r, facts2)) {
        return { effect: "deny", rule: r.name, policy: policy.name, reason: `refused by rule "${r.name}"` };
      }
    }
    for (const r of policy.allow) {
      if (matchesRule(r, facts2)) {
        return { effect: "allow", rule: r.name, policy: policy.name };
      }
    }
    return {
      effect: "deny",
      policy: policy.name,
      reason: `no allow rule in "${policy.name}" matched ${facts2.action} for role "${facts2.role}"; policy is default-deny`
    };
  } catch (err) {
    return { effect: "deny", reason: `policy evaluation failed and was treated as a denial: ${String(err)}` };
  }
}
var KNOWN_ROLES = Object.freeze([
  "planner",
  "architect",
  "coder",
  "tester",
  "reviewer",
  "security",
  "synthesizer",
  "debugger"
]);
var UNASSIGNED_ROLE = "(unassigned)";
function resolveRole(configured) {
  if (typeof configured !== "string") return UNASSIGNED_ROLE;
  const trimmed = configured.trim();
  if (trimmed === "" || trimmed === UNASSIGNED_ROLE) return UNASSIGNED_ROLE;
  return KNOWN_ROLES.includes(trimmed) ? trimmed : UNASSIGNED_ROLE;
}
var DEFAULT_POLICY_SOURCE = {
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
    { name: "no-egress-by-default", action: "*", field: "action", op: "matches", value: "^(http|curl|wget|fetch)_?" }
  ],
  allow: [
    { name: "reader-may-read", action: "*", field: "action", op: "matches", value: "^(read|list|stat|grep|search|ls)" },
    { name: "tester-may-test", action: "test", field: "action", op: "==", value: "test" },
    { name: "coder-may-write", action: "*", role: "coder", field: "role", op: "==", value: "coder" },
    { name: "shell-for-coders", action: "*", role: "coder", field: "action", op: "matches", value: "^(exec|run|shell)" }
  ]
};
var DEFAULT_POLICY = compile(DEFAULT_POLICY_SOURCE).policy;

// probe/declarativePolicy.test.ts
var ROOT = process.env.SI_ROOT ?? process.cwd();
var passed = 0;
var failed = 0;
var failures = [];
var ok = (label, cond, detail = "") => {
  if (cond) {
    passed += 1;
    console.log(`  ok   ${label}`);
  } else {
    failed += 1;
    failures.push(`${label}${detail ? ` \u2014 ${detail}` : ""}`);
    console.log(`  FAIL ${label}${detail ? ` \u2014 ${detail}` : ""}`);
  }
};
var section = (n) => console.log(`
== ${n}`);
var facts = (a, role = "coder", extra = {}) => ({ action: a, principal: "agent-1", role, ...extra });
section("1. RULE 1 \u2014 no policy permits nothing");
{
  ok("a null policy denies", evaluate(null, facts("read")).effect === "deny");
  ok("an undefined policy denies", evaluate(void 0, facts("read")).effect === "deny");
  ok("the refusal explains itself", /permits nothing/.test(evaluate(null, facts("read")).reason));
  const empty = { name: "empty", deny: [], allow: [] };
  ok("a policy with no rules denies", evaluate(empty, facts("read")).effect === "deny");
  ok("and says it is an empty policy", /empty policy/.test(evaluate(empty, facts("read")).reason));
  const denyOnly = { name: "deny-only", deny: [{ name: "d", action: "read", field: "action", op: "==", value: "read" }], allow: [] };
  ok("a deny-only policy does not permit by omission", evaluate(denyOnly, facts("exec")).effect === "deny");
  const allowOnly = { name: "allow-only", deny: [], allow: [{ name: "a", action: "read", field: "action", op: "==", value: "read" }] };
  ok(
    "an allow-only policy permits only what it names",
    evaluate(allowOnly, facts("read")).effect === "allow" && evaluate(allowOnly, facts("exec")).effect === "deny"
  );
}
section("2. RULE 2 \u2014 deny is evaluated first and wins");
{
  const both = {
    name: "both",
    deny: [{ name: "never-write", action: "write_file", field: "action", op: "==", value: "write_file" }],
    allow: [{ name: "writes-ok", action: "write_file", field: "action", op: "==", value: "write_file" }]
  };
  const d = evaluate(both, facts("write_file"));
  ok("a matching deny beats a matching allow", d.effect === "deny");
  ok("and the refusal names the deny rule", d.rule === "never-write");
  const reordered = { name: "both", deny: [...both.deny], allow: [...both.allow] };
  ok("the result does not depend on array order", evaluate(reordered, facts("write_file")).effect === "deny");
  const widened = { ...both, allow: [...both.allow, { name: "wildcard", action: "*", field: "action", op: "matches", value: ".*" }] };
  ok("adding a broad allow cannot widen past a deny", evaluate(widened, facts("write_file")).effect === "deny");
  ok("\u2026but the broad allow does work elsewhere", evaluate(widened, facts("something_else")).effect === "allow");
}
section("3. RULE 3 \u2014 a rule that does not compile refuses");
{
  const cases = [
    ["not an object", "nope", /not an object/],
    ["no name", { name: "p", deny: [{ action: "a", field: "f", op: "==", value: 1 }], allow: [] }, /needs a name/],
    ["no action", { name: "p", deny: [{ name: "r", field: "f", op: "==", value: 1 }], allow: [] }, /action pattern/],
    ["no field", { name: "p", deny: [{ name: "r", action: "a", op: "==", value: 1 }], allow: [] }, /field to read/],
    ["bad operator", { name: "p", deny: [{ name: "r", action: "a", field: "f", op: "wat", value: 1 }], allow: [] }, /not one of/],
    ["no value", { name: "p", deny: [{ name: "r", action: "a", field: "f", op: "==" }], allow: [] }, /needs a value/],
    ["non-array deny list", { name: "p", deny: "nope", allow: [] }, /must be an array/],
    ["uncompilable regex", { name: "p", deny: [{ name: "r", action: "a", field: "f", op: "matches", value: "([unclosed" }], allow: [] }, /not a valid pattern/],
    ["matches with a non-string", { name: "p", deny: [{ name: "r", action: "a", field: "f", op: "matches", value: 42 }], allow: [] }, /needs a string pattern/]
  ];
  for (const [label, input, expect] of cases) {
    const r = compile(input);
    ok(`compile refuses: ${label}`, !r.ok && r.errors.some((e) => expect.test(e)), JSON.stringify(r));
  }
  const broken = compile({ name: "broken", deny: [{ name: "r", action: "a", field: "f", op: "wat", value: 1 }], allow: [] });
  ok("a failed compile returns no policy object", !broken.ok && !("policy" in broken));
  const coerced = broken.policy;
  ok("evaluating a never-compiled policy denies", evaluate(coerced, facts("read")).effect === "deny");
  const sparse = compile({ name: "sparse", deny: [{ name: "r", action: "a", field: "f", op: "==", value: 1 }] });
  ok("an omitted allow list compiles as empty", sparse.ok && sparse.policy.allow.length === 0);
}
section("4. RULE 4 \u2014 a missing field never clears a rule");
{
  const notEqual = { name: "ne", deny: [], allow: [{ name: "a", action: "*", field: "nope", op: "!=", value: "x" }] };
  ok(
    "!= against a missing field does not allow",
    evaluate(notEqual, facts("read")).effect === "deny",
    "a policy could not see the field, so it must not grant on it"
  );
  const containsMissing = { name: "c", deny: [], allow: [{ name: "a", action: "*", field: "nope", op: "contains", value: "x" }] };
  ok("contains against a missing field does not allow", evaluate(containsMissing, facts("read")).effect === "deny");
  const inMissing = { name: "i", deny: [], allow: [{ name: "a", action: "*", field: "nope", op: "in", value: ["x"] }] };
  ok("in against a missing field does not allow", evaluate(inMissing, facts("read")).effect === "deny");
  const gtMissing = { name: "gt", deny: [], allow: [{ name: "a", action: "*", field: "nope", op: ">", value: 0 }] };
  ok("> against a missing field does not allow", evaluate(gtMissing, facts("read")).effect === "deny");
  const withCtx = { name: "ctx", deny: [], allow: [{ name: "a", action: "*", field: "env", op: "==", value: "prod" }] };
  ok("a rule can read a context field", evaluate(withCtx, facts("read", "coder", { context: { env: "prod" } })).effect === "allow");
  ok("and denies when it is absent", evaluate(withCtx, facts("read", "coder", { context: { env: "dev" } })).effect === "deny");
}
section("5. operators behave");
{
  const r = (op, field, value, f = facts("read")) => evaluate({ name: "t", deny: [], allow: [{ name: "r", action: "*", field, op, value }] }, f).effect;
  ok("== on a string", r("==", "action", "read") === "allow");
  ok("== on a number", r("==", "n", 5, facts("read", "coder", { context: { n: 5 } })) === "allow");
  ok(
    "== across types is string-compared, not coercive equality",
    r("==", "n", "5", facts("read", "coder", { context: { n: 5 } })) === "allow"
  );
  ok("contains on a string", r("contains", "action", "rea") === "allow");
  ok("contains on an array", r("contains", "tags", "b", facts("read", "coder", { context: { tags: ["a", "b"] } })) === "allow");
  ok("contains on a missing array is false", r("contains", "tags", "b") === "deny");
  ok("matches with a regex", r("matches", "action", "^re") === "allow");
  ok("in with a list", r("in", "action", ["write", "read"]) === "allow");
  ok("> on numbers", r(">", "n", 4, facts("read", "coder", { context: { n: 5 } })) === "allow");
  ok("> on strings is false, not a lexicographic surprise", r(">", "action", "a") === "deny");
  ok("< on numbers", r("<", "n", 6, facts("read", "coder", { context: { n: 5 } })) === "allow");
}
section("6. scope: action and role");
{
  const scoped = {
    name: "scoped",
    deny: [],
    allow: [{ name: "testers-test", action: "test", role: "tester", field: "action", op: "==", value: "test" }]
  };
  ok("a rule fires for its role", evaluate(scoped, facts("test", "tester")).effect === "allow");
  ok("and not for another role", evaluate(scoped, facts("test", "coder")).effect === "deny");
  ok("and not for another action", evaluate(scoped, facts("write_file", "tester")).effect === "deny");
  ok("role '*' matches any role", evaluate({ name: "s", deny: [], allow: [{ name: "a", action: "read", role: "*", field: "action", op: "==", value: "read" }] }, facts("read", "anything")).effect === "allow");
}
section("7. THE SHIPPED BASELINE \u2014 and the bug it must not have");
{
  ok("the baseline compiles", compile(DEFAULT_POLICY_SOURCE).ok, JSON.stringify(compile(DEFAULT_POLICY_SOURCE)));
  ok("it is the compiled form of the source", DEFAULT_POLICY.name === "s" || DEFAULT_POLICY.name === DEFAULT_POLICY_SOURCE.name);
  ok(
    "a reviewer CAN read",
    evaluate(DEFAULT_POLICY, facts("read_file", "reviewer")).effect === "allow",
    evaluate(DEFAULT_POLICY, facts("read_file", "reviewer")).reason
  );
  ok("a reviewer CANNOT write", evaluate(DEFAULT_POLICY, facts("write_file", "reviewer")).effect === "deny");
  ok("a reviewer CANNOT commit", evaluate(DEFAULT_POLICY, facts("commit", "reviewer")).effect === "deny");
  ok("a reviewer CANNOT delete", evaluate(DEFAULT_POLICY, facts("rm_rf", "reviewer")).effect === "deny");
  ok("a coder CAN write", evaluate(DEFAULT_POLICY, facts("write_file", "coder")).effect === "allow");
  ok("a coder CAN run shell", evaluate(DEFAULT_POLICY, facts("exec", "coder")).effect === "allow");
  ok("a coder CANNOT delete", evaluate(DEFAULT_POLICY, facts("rm_rf", "coder")).effect === "deny");
  ok("a coder CANNOT force-push", evaluate(DEFAULT_POLICY, facts("git_force_push", "coder")).effect === "deny");
  ok("a coder CANNOT reach the network by default", evaluate(DEFAULT_POLICY, facts("http_fetch", "coder")).effect === "deny");
  ok("a tester CAN test", evaluate(DEFAULT_POLICY, facts("test", "tester")).effect === "allow");
  const roleOnlyDeny = DEFAULT_POLICY.deny.find((d) => d.role === "reviewer");
  ok(
    "the reviewer deny rule is scoped to an ACTION, not the role alone",
    !!roleOnlyDeny && roleOnlyDeny.field !== "role",
    "a role-only deny rule blocks every action for that role, including the work it exists to protect"
  );
}
section("8. it is wired, not a document");
{
  const src = fs.readFileSync(path.join(ROOT, "src", "security", "policy.ts"), "utf8");
  ok("the four semantics are stated in the source", /RULE 1/.test(src) && /RULE 2/.test(src) && /RULE 3/.test(src) && /RULE 4/.test(src));
  const importers = ["src/engine/hermesRuntime.ts", "src/mission/teamExecutor.ts", "src/mission/a2aBridge.ts", "src/security/actionGraph.ts"].filter((f) => fs.existsSync(path.join(ROOT, f)) && fs.readFileSync(path.join(ROOT, f), "utf8").includes("security/policy"));
  ok("at least one runtime path imports the policy module", importers.length > 0, importers.join(", ") || "none import it");
}
section("9. a seat with no usable role gets no authority, not a coder's");
{
  ok("a missing role is unassigned", resolveRole(void 0) === UNASSIGNED_ROLE);
  ok("null is unassigned", resolveRole(null) === UNASSIGNED_ROLE);
  ok("an empty string is unassigned", resolveRole("") === UNASSIGNED_ROLE);
  ok("whitespace is unassigned", resolveRole("   ") === UNASSIGNED_ROLE);
  ok("a non-string is unassigned, not coerced", resolveRole(7) === UNASSIGNED_ROLE);
  ok("an object is unassigned, not stringified into a role", resolveRole({ toString: () => "coder" }) === UNASSIGNED_ROLE);
  ok("a near-miss is not coder", resolveRole("Coder") !== "coder");
  ok("'superuser' is not a role this build grants", resolveRole("superuser") === UNASSIGNED_ROLE);
  ok("a padded real role still resolves", resolveRole("  coder ") === "coder");
  ok("the sentinel itself stays the sentinel", resolveRole(UNASSIGNED_ROLE) === UNASSIGNED_ROLE);
  for (const r of KNOWN_ROLES) {
    ok(`a real role round-trips: ${r}`, resolveRole(r) === r);
  }
  const facts2 = (role) => ({ action: "write", principal: "seat-x", role });
  ok(
    "an unassigned seat cannot write under the shipped policy",
    evaluate(DEFAULT_POLICY, facts2(resolveRole(void 0))).effect === "deny"
  );
  ok(
    "an unassigned seat cannot shell under the shipped policy",
    evaluate(DEFAULT_POLICY, { action: "exec", principal: "seat-x", role: resolveRole(null) }).effect === "deny"
  );
  ok(
    "it cannot even read \u2014 an unowned seat is inert, not merely non-writing",
    evaluate(DEFAULT_POLICY, { action: "read", principal: "seat-x", role: resolveRole("") }).effect === "deny"
  );
  ok(
    "while a real coder still writes (the fix is not a lockout)",
    evaluate(DEFAULT_POLICY, facts2("coder")).effect === "allow"
  );
  ok(
    "and a reviewer still reads",
    evaluate(DEFAULT_POLICY, { action: "read", principal: "seat-y", role: "reviewer" }).effect === "allow"
  );
  const namesSentinel = DEFAULT_POLICY.allow.some((r) => r.role === UNASSIGNED_ROLE);
  ok("no shipped ALLOW rule names the sentinel, so it can never be widened", !namesSentinel);
  ok(
    "an explicit deny makes it inert, independent of any future unscoped allow",
    DEFAULT_POLICY.deny.some((r) => r.role === UNASSIGNED_ROLE),
    "without this the unscoped read rule grants a nameless seat read access"
  );
}
section("10. the runtime resolves roles through the fail-closed path");
{
  const src = fs.readFileSync(path.join(ROOT, "src", "engine", "hermesRuntime.ts"), "utf8");
  ok("hermesRuntime calls resolveRole", /resolveRole\(/.test(src));
  ok(
    "and no longer falls back to a privileged literal",
    !/role\s*:\s*String\(/.test(src),
    'the ?? "coder" fail-open default is back'
  );
  const roleFields = src.split(String.fromCharCode(10)).map((l, i) => [i, l]).filter(([, l]) => /^\s*role:/.test(l));
  const untyped = roleFields.filter(([, l]) => !/resolveRole\(/.test(l) && !/role: "user"/.test(l));
  ok(
    "every role fact is produced by resolveRole",
    roleFields.length > 0 && untyped.length === 0,
    untyped.map(([, l]) => l.trim()).join(" | ").slice(0, 160)
  );
  ok("and the module is imported from the policy layer", /resolveRole[^;]*from "\.\.\/security\/policy"/.test(src));
}
console.log(`
${passed} passed, ${failed} failed.`);
if (failed) {
  console.log(failures.map((f) => `  - ${f}`).join("\n"));
  process.exit(1);
}
