/**
 * Declarative policy probe.
 *
 * The value of a policy language is entirely in its FAILURE SEMANTICS. A
 * policy engine that only works on the happy path is a config file, and a
 * config file that fails open is the bug every serious engine is built to
 * avoid. So this probe is mostly about refusal, and every semantic is asserted
 * from BOTH directions.
 *
 * The four rules, and why each exists:
 *   1. no policy permits nothing        — "we never configured it" ≠ allow
 *   2. deny before allow                — adding an allow cannot widen past a deny
 *   3. a rule that does not compile refuses — broken config is not permissive
 *   4. an evaluator that throws refuses   — a bug is a denial, not an outage
 *
 * Derived from OPA/Rego, Cedar, and the CEL-style boundary rules published with
 * agent runtimes. The code is ours; the semantics are the shared lesson.
 */
import * as fs from "node:fs";
import * as path from "node:path";

import {
  compile, evaluate, matchesRule, resolveRole, KNOWN_ROLES, UNASSIGNED_ROLE,
  DEFAULT_POLICY, DEFAULT_POLICY_SOURCE,
  type ActionFacts, type Policy,
} from "../src/security/policy";

const ROOT: string = process.env.SI_ROOT ?? process.cwd();

let passed = 0;
let failed = 0;
const failures: string[] = [];
const ok = (label: string, cond: boolean, detail = ""): void => {
  if (cond) { passed += 1; console.log(`  ok   ${label}`); }
  else { failed += 1; failures.push(`${label}${detail ? ` — ${detail}` : ""}`); console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`); }
};
const section = (n: string): void => console.log(`\n== ${n}`);

const facts = (a: string, role = "coder", extra: Partial<ActionFacts> = {}): ActionFacts =>
  ({ action: a, principal: "agent-1", role, ...extra });

/* ───────────────────────────────────────────────────────────────────────── */
section("1. RULE 1 — no policy permits nothing");
{
  ok("a null policy denies", evaluate(null, facts("read")).effect === "deny");
  ok("an undefined policy denies", evaluate(undefined, facts("read")).effect === "deny");
  ok("the refusal explains itself", /permits nothing/.test((evaluate(null, facts("read")) as { reason: string }).reason));

  const empty: Policy = { name: "empty", deny: [], allow: [] };
  ok("a policy with no rules denies", evaluate(empty, facts("read")).effect === "deny");
  ok("and says it is an empty policy", /empty policy/.test((evaluate(empty, facts("read")) as { reason: string }).reason));

  const denyOnly: Policy = { name: "deny-only", deny: [{ name: "d", action: "read", field: "action", op: "==", value: "read" }], allow: [] };
  ok("a deny-only policy does not permit by omission", evaluate(denyOnly, facts("exec")).effect === "deny");

  const allowOnly: Policy = { name: "allow-only", deny: [], allow: [{ name: "a", action: "read", field: "action", op: "==", value: "read" }] };
  ok("an allow-only policy permits only what it names",
    evaluate(allowOnly, facts("read")).effect === "allow" && evaluate(allowOnly, facts("exec")).effect === "deny");
}

section("2. RULE 2 — deny is evaluated first and wins");
{
  const both: Policy = {
    name: "both",
    deny: [{ name: "never-write", action: "write_file", field: "action", op: "==", value: "write_file" }],
    allow: [{ name: "writes-ok", action: "write_file", field: "action", op: "==", value: "write_file" }],
  };
  const d = evaluate(both, facts("write_file"));
  ok("a matching deny beats a matching allow", d.effect === "deny");
  ok("and the refusal names the deny rule", (d as { rule?: string }).rule === "never-write");

  // Order in the source must not matter.
  const reordered: Policy = { name: "both", deny: [...both.deny], allow: [...both.allow] };
  ok("the result does not depend on array order", evaluate(reordered, facts("write_file")).effect === "deny");

  // Widening the allow set must not widen past an existing deny. This is the
  // property that makes deny-first structural rather than conventional.
  // A genuinely broad allow. An earlier version of this assertion used
  // `== "anything"`, which is not broad at all — it matched one literal string,
  // so the test would have passed for the wrong reason or failed confusingly.
  const widened: Policy = { ...both, allow: [...both.allow, { name: "wildcard", action: "*", field: "action", op: "matches", value: ".*" }] };
  ok("adding a broad allow cannot widen past a deny", evaluate(widened, facts("write_file")).effect === "deny");
  ok("…but the broad allow does work elsewhere", evaluate(widened, facts("something_else")).effect === "allow");
}

section("3. RULE 3 — a rule that does not compile refuses");
{
  const cases: Array<[string, unknown, RegExp]> = [
    ["not an object", "nope", /not an object/],
    ["no name", { name: "p", deny: [{ action: "a", field: "f", op: "==", value: 1 }], allow: [] }, /needs a name/],
    ["no action", { name: "p", deny: [{ name: "r", field: "f", op: "==", value: 1 }], allow: [] }, /action pattern/],
    ["no field", { name: "p", deny: [{ name: "r", action: "a", op: "==", value: 1 }], allow: [] }, /field to read/],
    ["bad operator", { name: "p", deny: [{ name: "r", action: "a", field: "f", op: "wat", value: 1 }], allow: [] }, /not one of/],
    ["no value", { name: "p", deny: [{ name: "r", action: "a", field: "f", op: "==" }], allow: [] }, /needs a value/],
    ["non-array deny list", { name: "p", deny: "nope", allow: [] }, /must be an array/],
    ["uncompilable regex", { name: "p", deny: [{ name: "r", action: "a", field: "f", op: "matches", value: "([unclosed" }], allow: [] }, /not a valid pattern/],
    ["matches with a non-string", { name: "p", deny: [{ name: "r", action: "a", field: "f", op: "matches", value: 42 }], allow: [] }, /needs a string pattern/],
  ];
  for (const [label, input, expect] of cases) {
    const r = compile(input);
    ok(`compile refuses: ${label}`, !r.ok && r.errors.some((e) => expect.test(e)), JSON.stringify(r));
  }

  // The critical one: a policy that will not compile must not be usable, and a
  // caller that ignores the compile result must still not get a permissive one.
  const broken = compile({ name: "broken", deny: [{ name: "r", action: "a", field: "f", op: "wat", value: 1 }], allow: [] });
  ok("a failed compile returns no policy object", !broken.ok && !("policy" in broken));
  const coerced = (broken as { policy?: Policy }).policy as Policy;
  ok("evaluating a never-compiled policy denies", evaluate(coerced, facts("read")).effect === "deny");

  // A valid policy still compiles, and an omitted list is an empty list.
  const sparse = compile({ name: "sparse", deny: [{ name: "r", action: "a", field: "f", op: "==", value: 1 }] });
  ok("an omitted allow list compiles as empty", sparse.ok && (sparse as { policy: Policy }).policy.allow.length === 0);
}

section("4. RULE 4 — a missing field never clears a rule");
{
  const notEqual: Policy = { name: "ne", deny: [], allow: [{ name: "a", action: "*", field: "nope", op: "!=", value: "x" }] };
  ok("!= against a missing field does not allow", evaluate(notEqual, facts("read")).effect === "deny",
    "a policy could not see the field, so it must not grant on it");

  const containsMissing: Policy = { name: "c", deny: [], allow: [{ name: "a", action: "*", field: "nope", op: "contains", value: "x" }] };
  ok("contains against a missing field does not allow", evaluate(containsMissing, facts("read")).effect === "deny");

  const inMissing: Policy = { name: "i", deny: [], allow: [{ name: "a", action: "*", field: "nope", op: "in", value: ["x"] }] };
  ok("in against a missing field does not allow", evaluate(inMissing, facts("read")).effect === "deny");

  const gtMissing: Policy = { name: "gt", deny: [], allow: [{ name: "a", action: "*", field: "nope", op: ">", value: 0 }] };
  ok("> against a missing field does not allow", evaluate(gtMissing, facts("read")).effect === "deny");

  // Context values ARE visible, so a rule can be written against them.
  const withCtx: Policy = { name: "ctx", deny: [], allow: [{ name: "a", action: "*", field: "env", op: "==", value: "prod" }] };
  ok("a rule can read a context field", evaluate(withCtx, facts("read", "coder", { context: { env: "prod" } })).effect === "allow");
  ok("and denies when it is absent", evaluate(withCtx, facts("read", "coder", { context: { env: "dev" } })).effect === "deny");
}

section("5. operators behave");
{
  const r = (op: Policy["allow"][number]["op"], field: string, value: Policy["allow"][number]["value"], f = facts("read")) =>
    evaluate({ name: "t", deny: [], allow: [{ name: "r", action: "*", field, op, value }] }, f).effect;

  ok("== on a string", r("==", "action", "read") === "allow");
  ok("== on a number", r("==", "n", 5, facts("read", "coder", { context: { n: 5 } })) === "allow");
  ok("== across types is string-compared, not coercive equality",
    r("==", "n", "5", facts("read", "coder", { context: { n: 5 } })) === "allow");
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
  const scoped: Policy = {
    name: "scoped",
    deny: [],
    allow: [{ name: "testers-test", action: "test", role: "tester", field: "action", op: "==", value: "test" }],
  };
  ok("a rule fires for its role", evaluate(scoped, facts("test", "tester")).effect === "allow");
  ok("and not for another role", evaluate(scoped, facts("test", "coder")).effect === "deny");
  ok("and not for another action", evaluate(scoped, facts("write_file", "tester")).effect === "deny");
  ok("role '*' matches any role", evaluate({ name: "s", deny: [], allow: [{ name: "a", action: "read", role: "*", field: "action", op: "==", value: "read" }] }, facts("read", "anything")).effect === "allow");
}

section("7. THE SHIPPED BASELINE — and the bug it must not have");
{
  ok("the baseline compiles", compile(DEFAULT_POLICY_SOURCE).ok, JSON.stringify(compile(DEFAULT_POLICY_SOURCE)));
  ok("it is the compiled form of the source", DEFAULT_POLICY.name === "s" || DEFAULT_POLICY.name === DEFAULT_POLICY_SOURCE.name);

  // This block exists because the baseline SHIPPED WITH A BUG: a reviewer deny
  // rule that matched on the role rather than the action, so it denied every
  // reviewer action — including reading. A read-only rule that also forbids the
  // read is a rule that quietly removes the seat. Both directions are asserted
  // so it cannot come back.
  ok("a reviewer CAN read", evaluate(DEFAULT_POLICY, facts("read_file", "reviewer")).effect === "allow",
    (evaluate(DEFAULT_POLICY, facts("read_file", "reviewer")) as { reason?: string }).reason);
  ok("a reviewer CANNOT write", evaluate(DEFAULT_POLICY, facts("write_file", "reviewer")).effect === "deny");
  ok("a reviewer CANNOT commit", evaluate(DEFAULT_POLICY, facts("commit", "reviewer")).effect === "deny");
  ok("a reviewer CANNOT delete", evaluate(DEFAULT_POLICY, facts("rm_rf", "reviewer")).effect === "deny");

  ok("a coder CAN write", evaluate(DEFAULT_POLICY, facts("write_file", "coder")).effect === "allow");
  ok("a coder CAN run shell", evaluate(DEFAULT_POLICY, facts("exec", "coder")).effect === "allow");
  ok("a coder CANNOT delete", evaluate(DEFAULT_POLICY, facts("rm_rf", "coder")).effect === "deny");
  ok("a coder CANNOT force-push", evaluate(DEFAULT_POLICY, facts("git_force_push", "coder")).effect === "deny");
  ok("a coder CANNOT reach the network by default", evaluate(DEFAULT_POLICY, facts("http_fetch", "coder")).effect === "deny");
  ok("a tester CAN test", evaluate(DEFAULT_POLICY, facts("test", "tester")).effect === "allow");

  // A deny rule with no action restriction still scopes by role — the shape
  // that caused the bug. Assert that role-scoped deny rules must be narrow.
  const roleOnlyDeny = DEFAULT_POLICY.deny.find((d) => d.role === "reviewer");
  ok("the reviewer deny rule is scoped to an ACTION, not the role alone",
    !!roleOnlyDeny && roleOnlyDeny.field !== "role",
    "a role-only deny rule blocks every action for that role, including the work it exists to protect");
}

section("8. it is wired, not a document");
{
  const src = fs.readFileSync(path.join(ROOT, "src", "security", "policy.ts"), "utf8");
  ok("the four semantics are stated in the source", /RULE 1/.test(src) && /RULE 2/.test(src) && /RULE 3/.test(src) && /RULE 4/.test(src));
  const importers = ["src/engine/hermesRuntime.ts", "src/mission/teamExecutor.ts", "src/mission/a2aBridge.ts", "src/security/actionGraph.ts"]
    .filter((f) => fs.existsSync(path.join(ROOT, f)) && fs.readFileSync(path.join(ROOT, f), "utf8").includes("security/policy"));
  ok("at least one runtime path imports the policy module", importers.length > 0, importers.join(", ") || "none import it");
}

section("9. a seat with no usable role gets no authority, not a coder's");
{
  // The bug this pins: `String(node.config.role ?? "coder")` gave every
  // malformed seat the permissions of a working developer. Silence about a
  // seat's role is not a claim that it is a coder.
  ok("a missing role is unassigned", resolveRole(undefined) === UNASSIGNED_ROLE);
  ok("null is unassigned", resolveRole(null) === UNASSIGNED_ROLE);
  ok("an empty string is unassigned", resolveRole("") === UNASSIGNED_ROLE);
  ok("whitespace is unassigned", resolveRole("   ") === UNASSIGNED_ROLE);
  ok("a non-string is unassigned, not coerced", resolveRole(7) === UNASSIGNED_ROLE);
  ok("an object is unassigned, not stringified into a role", resolveRole({ toString: () => "coder" }) === UNASSIGNED_ROLE);

  // The dangerous ones: a role that merely LOOKS like a real one.
  ok("a near-miss is not coder", resolveRole("Coder") !== "coder");
  ok("'superuser' is not a role this build grants", resolveRole("superuser") === UNASSIGNED_ROLE);
  ok("a padded real role still resolves", resolveRole("  coder ") === "coder");
  ok("the sentinel itself stays the sentinel", resolveRole(UNASSIGNED_ROLE) === UNASSIGNED_ROLE);

  for (const r of KNOWN_ROLES) {
    ok(`a real role round-trips: ${r}`, resolveRole(r) === r);
  }

  // And the consequence: the unassigned seat is denied the coder's powers by
  // the SHIPPED policy, with no custom policy needed to get that.
  const facts = (role: string): ActionFacts => ({ action: "write", principal: "seat-x", role });
  ok("an unassigned seat cannot write under the shipped policy",
    evaluate(DEFAULT_POLICY, facts(resolveRole(undefined))).effect === "deny");
  ok("an unassigned seat cannot shell under the shipped policy",
    evaluate(DEFAULT_POLICY, { action: "exec", principal: "seat-x", role: resolveRole(null) }).effect === "deny");
  ok("it cannot even read — an unowned seat is inert, not merely non-writing",
    evaluate(DEFAULT_POLICY, { action: "read", principal: "seat-x", role: resolveRole("") }).effect === "deny");
  ok("while a real coder still writes (the fix is not a lockout)",
    evaluate(DEFAULT_POLICY, facts("coder")).effect === "allow");
  ok("and a reviewer still reads",
    evaluate(DEFAULT_POLICY, { action: "read", principal: "seat-y", role: "reviewer" }).effect === "allow");

  // No policy may be written that hands the sentinel real power by accident.
  const namesSentinel = DEFAULT_POLICY.allow.some((r) => r.role === UNASSIGNED_ROLE);
  ok("no shipped ALLOW rule names the sentinel, so it can never be widened", !namesSentinel);
  ok("an explicit deny makes it inert, independent of any future unscoped allow",
    DEFAULT_POLICY.deny.some((r) => r.role === UNASSIGNED_ROLE),
    "without this the unscoped read rule grants a nameless seat read access");
}

section("10. the runtime resolves roles through the fail-closed path");
{
  const src = fs.readFileSync(path.join(ROOT, "src", "engine", "hermesRuntime.ts"), "utf8");
  ok("hermesRuntime calls resolveRole", /resolveRole\(/.test(src));
  ok("and no longer falls back to a privileged literal",
    !/role\s*:\s*String\(/.test(src), "the ?? \"coder\" fail-open default is back");
  // Line-scoped on the `role:` field itself, which is where the privilege lives.
  // (Keying off `principal:` instead would also catch the object literal whose
  // role sits on the following line — a false alarm about the wrong thing.)
  const roleFields = src.split(String.fromCharCode(10))
    .map((l, i) => [i, l] as const)
    .filter(([, l]) => /^\s*role:/.test(l));
  const untyped = roleFields.filter(([, l]) => !/resolveRole\(/.test(l) && !/role: "user"/.test(l));
  ok("every role fact is produced by resolveRole", roleFields.length > 0 && untyped.length === 0,
    untyped.map(([, l]) => l.trim()).join(" | ").slice(0, 160));
  ok("and the module is imported from the policy layer", /resolveRole[^;]*from "\.\.\/security\/policy"/.test(src));
}

console.log(`\n${passed} passed, ${failed} failed.`);
if (failed) {
  console.log(failures.map((f) => `  - ${f}`).join("\n"));
  process.exit(1);
}
