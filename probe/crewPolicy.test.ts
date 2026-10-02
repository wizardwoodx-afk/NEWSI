/**
 * CREW POLICY probe — a knob nobody reads is a lie.
 *
 * The claim this suite exists to check is not "the policy is stored". It is
 * "the policy is ENFORCED": that a desk taken off shift stops being routed to,
 * that a depth cap actually caps, and that the budget a desk is set to is the
 * budget its text is fitted to. Every one of those is checked on the routing
 * seam rather than on the store, because a policy that only round-trips through
 * localStorage would pass a storage test and govern nothing.
 *
 * Run: ./node_modules/.bin/esbuild probe/crewPolicy.test.ts --bundle --platform=node \
 *        --format=esm --outfile=/tmp/policy.mjs --log-level=error && node /tmp/policy.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";

if (typeof globalThis.localStorage === "undefined") {
  const map = new Map<string, string>();
  (globalThis as unknown as { localStorage: Storage }).localStorage = {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, String(v)),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
    key: (i: number) => Array.from(map.keys())[i] ?? null,
    get length() {
      return map.size;
    },
  } as Storage;
}

import {
  knownCategories, categorySizes, defaultPolicy, loadPolicy, savePolicy, clearPolicy,
  effectivePolicy, applyCrewPolicy, clampBudget, policySummary,
  DEPTH_LIMIT, BUDGET_STOPS, BUDGET_DEFAULT, type CrewPolicy,
} from "../src/engine/crewPolicy";
import { routeDeterministic } from "../src/engine/router";
import { getSpecialist, enabledSpecialists } from "../src/engine/registry";
import { fitToBudget } from "../src/engine/tokenOptim";

function policyWith(mut: (p: CrewPolicy) => void): CrewPolicy {
  const p: CrewPolicy = JSON.parse(JSON.stringify(defaultPolicy()));
  mut(p);
  return p;
}

test("1. the rows are DERIVED from what the router can actually route to", () => {
  const cats = knownCategories();
  const sizes = categorySizes();
  assert.ok(cats.length >= 10, `expected the real category set, got ${cats.length}`);
  assert.equal(cats.length, Object.keys(sizes).length);
  /* Every category the registry hands the router must have a row. A hardcoded
     list would go stale the first time one was added, and go stale QUIETLY. */
  for (const s of enabledSpecialists()) {
    assert.ok(cats.includes(s.category), `category "${s.category}" has no policy row`);
  }
  assert.ok(sizes.silicon > 100, "the roster is large; the numbers on the matrix are real");
});

test("2. the shipped default puts every desk on the floor at full depth", () => {
  clearPolicy();
  const { policy, source } = effectivePolicy();
  assert.equal(source, "default", "an untouched deployment reads as default, not as a user decision");
  for (const d of knownCategories()) {
    assert.deepEqual(policy[d], { onShift: true, depth: "full", budget: BUDGET_DEFAULT });
  }
  const sum = policySummary();
  assert.equal(sum.off, 0);
  assert.equal(sum.narrowest, null);
});

test("3. a desk taken OFF SHIFT is dropped, and the reason names the desk", () => {
  clearPolicy();
  const p = policyWith((x) => { x.security = { onShift: false, depth: "full", budget: BUDGET_DEFAULT }; });
  savePolicy(p);
  const secId = enabledSpecialists().find((s) => s.category === "security")!.id;
  const codeId = enabledSpecialists().find((s) => s.category === "code")!.id;

  const out = applyCrewPolicy([{ id: secId }, { id: codeId }], 10);
  assert.equal(out.kept.length, 1);
  assert.equal(out.kept[0].id, codeId);
  assert.equal(out.dropped.length, 1);
  assert.match(out.dropped[0].reason ?? "", /security is off shift/);
  assert.equal(out.dropped[0].domain, "security");
});

test("4. DEPTH caps how many of one desk ride a single route", () => {
  clearPolicy();
  const codeIds = enabledSpecialists().filter((s) => s.category === "code").slice(0, 6).map((s) => ({ id: s.id }));
  assert.equal(codeIds.length, 6, "the roster has at least six code specialists to test with");

  for (const [depth, expected] of [["lead", 1], ["desk", 3], ["full", 6]] as const) {
    savePolicy(policyWith((x) => { x.code = { onShift: true, depth, budget: BUDGET_DEFAULT }; }));
    const out = applyCrewPolicy(codeIds, 10);
    assert.equal(out.kept.length, Math.min(expected, DEPTH_LIMIT[depth]), `depth=${depth}`);
    if (expected < 6) {
      assert.ok(out.dropped.length > 0);
      assert.match(out.dropped[0].reason ?? "", new RegExp(`code is capped at ${depth}`));
    }
  }
  clearPolicy();
});

test("5. an UNKNOWN specialist is not refused — the policy governs what exists", () => {
  clearPolicy();
  savePolicy(policyWith((x) => { x.code = { onShift: false, depth: "lead", budget: 1000 }; }));
  const out = applyCrewPolicy([{ id: "not.a.real.specialist" }, { id: "someone.elses.tool" }], 10);
  assert.equal(out.kept.length, 2, "a tool this roster does not know is not a policy violation");
  assert.equal(out.dropped.length, 0);
  clearPolicy();
});

test("6. the budget is snapped onto the slider, so it can only be a value the UI shows", () => {
  assert.equal(clampBudget(0), BUDGET_STOPS[0]);
  assert.equal(clampBudget(3900), 4000);
  assert.equal(clampBudget(4001), 4000);
  assert.equal(clampBudget(999999), BUDGET_STOPS[BUDGET_STOPS.length - 1]);
  assert.equal(clampBudget(Number.NaN), BUDGET_DEFAULT);
  assert.equal(clampBudget(-5), BUDGET_STOPS[0], "a negative budget is not a budget");
  for (const stop of BUDGET_STOPS) assert.equal(clampBudget(stop), stop);
});

test("7. the budget a desk is set to is the number handed to the prompt fitter", () => {
  clearPolicy();
  savePolicy(policyWith((x) => { x.code = { onShift: true, depth: "full", budget: 2000 }; }));
  const codeId = enabledSpecialists().find((s) => s.category === "code")!.id;
  const out = applyCrewPolicy([{ id: codeId }], 10);
  assert.equal(out.budgets.code, 2000, "enforcement must SURFACE the budget per desk");

  /* …and that number is a real ceiling, not a label: the same fitter the engine
     uses trims a long prompt to it. */
  const long = Array.from({ length: 4000 }, (_, i) => `token${i}`).join(" ");
  const fitted = fitToBudget(long, out.budgets.code);
  assert.equal(fitted.trimmed, true);
  assert.ok(fitted.text.length < long.length);
  clearPolicy();
});

test("8. a policy saved BEFORE a desk existed does not silence that desk", () => {
  clearPolicy();
  /* A file from an older deployment: only one category, and one that is OFF.
     Every other category must come back as its DEFAULT, never as "off" — a new
     desk joining a deployment must not be silently switched off by an old file. */
  const stale: CrewPolicy = { code: { onShift: true, depth: "lead", budget: 1000 } };
  localStorage.setItem("engine.crew.policy.v1", JSON.stringify(stale));
  const loaded = loadPolicy();
  assert.ok(loaded);
  assert.equal(loaded.code.depth, "lead", "the desk the user DID decide about is honoured");
  assert.equal(loaded.code.budget, 1000);
  const others = knownCategories().filter((c) => c !== "code");
  assert.ok(others.length > 0);
  for (const c of others) {
    assert.deepEqual(loaded[c], { onShift: true, depth: "full", budget: BUDGET_DEFAULT }, `${c} inherited the default`);
  }
  const summary = policySummary();
  assert.equal(summary.source, "custom");
  assert.equal(summary.off, 0);
  assert.equal(summary.narrowest, "code");
  clearPolicy();
});

test("9. a corrupt policy file falls back to the SHIPPED default, and says so", () => {
  clearPolicy();
  localStorage.setItem("engine.crew.policy.v1", "{ this is not json");
  assert.equal(loadPolicy(), null);
  assert.equal(effectivePolicy().source, "default");
  /* …and a file that IS json but is the wrong shape must not half-apply. */
  localStorage.setItem("engine.crew.policy.v1", JSON.stringify({ code: "yes please" }));
  const loaded = loadPolicy();
  assert.ok(loaded);
  assert.deepEqual(loaded.code, { onShift: true, depth: "full", budget: BUDGET_DEFAULT }, "a malformed desk entry is replaced, not trusted");
  clearPolicy();
});

test("10. THE ROUTER OBEYS IT — an off-shift desk stops appearing in real routes", () => {
  clearPolicy();

  /* A request the code desk genuinely wins. Found by asking the router itself
   * rather than by guessing, so the fixture cannot drift away from the engine. */
  const request = "refactor this TypeScript class and fix the type errors in the parser";
  const before = routeDeterministic(request);
  const codeBefore = before.selected.filter((c) => getSpecialist(c.id)?.category === "code");
  assert.ok(codeBefore.length > 0, `fixture must route to code; got ${before.selected.map((c) => c.id).join(", ")}`);

  savePolicy(policyWith((x) => { x.code = { onShift: false, depth: "full", budget: BUDGET_DEFAULT }; }));
  const after = routeDeterministic(request);
  const codeAfter = after.selected.filter((c) => getSpecialist(c.id)?.category === "code");
  assert.equal(codeAfter.length, 0, "an off-shift desk must not take part in a route");

  /* The refusal has to be VISIBLE on the decision, or a shorter plan is
     indistinguishable from a plan that simply had less to say. */
  assert.ok(after.policyDropped && after.policyDropped.length > 0, "the dropped candidates ride the decision");
  assert.ok(after.policyDropped!.every((d) => d.domain === "code"));
  assert.match(after.policyDropped![0].reason ?? "", /off shift/);

  clearPolicy();
  const restored = routeDeterministic(request);
  assert.ok(restored.selected.some((c) => getSpecialist(c.id)?.category === "code"), "clearing the policy restores the default route");
});

test("11. the depth cap is enforced through the router too, not only in isolation", () => {
  clearPolicy();
  /* The router collapses to ONE candidate when the leader wins by more than
     SINGLE_MARGIN — that is correct behaviour, not a bug, so this test has to
     find a request it produces a MULTI route for rather than assume one. Asking
     the router which of these it spreads across is the only fixture that cannot
     rot. */
  const probes = [
    "audit this API for security problems and rate limit issues",
    "refactor this TypeScript class and fix the type errors in the parser",
    "review the database schema, the migration plan and the query performance",
    "check the accessibility of this page and the contrast of the text",
    "analyse this dataset, define the metric and plan the sample size",
    "write the documentation, the changelog and the release notes",
    "test this module, review the coverage and triage the failures",
  ];
  let request = "";
  let wide = routeDeterministic(probes[0], 12);
  for (const r of probes) {
    const d = routeDeterministic(r, 12);
    const counts = new Map<string, number>();
    for (const c of d.selected) {
      const cat = getSpecialist(c.id)?.category ?? "";
      counts.set(cat, (counts.get(cat) ?? 0) + 1);
    }
    if (Array.from(counts.values()).some((n) => n > 1)) {
      request = r;
      wide = d;
      break;
    }
  }
  assert.ok(request, "no probe request produced a multi-candidate route");
  /* Find whichever category the ROUTER actually put more than one candidate in,
     rather than assuming it is `code` — the router decides, and a fixture that
     guesses would rot the first time a score changed. */
  const counts = new Map<string, number>();
  for (const c of wide.selected) {
    const cat = getSpecialist(c.id)?.category ?? "";
    counts.set(cat, (counts.get(cat) ?? 0) + 1);
  }
  const doubled = Array.from(counts.entries()).filter(([, n]) => n > 1).sort((a, b) => b[1] - a[1])[0];
  assert.ok(doubled, `need one category with more than one candidate; got ${JSON.stringify([...counts])}`);
  const cat = doubled[0];
  const wideCount = doubled[1];

  savePolicy(policyWith((x) => { x[cat] = { onShift: true, depth: "lead", budget: BUDGET_DEFAULT }; }));
  const capped = routeDeterministic(request, 12);
  const cappedCount = capped.selected.filter((c) => getSpecialist(c.id)?.category === cat).length;
  assert.equal(cappedCount, 1, `${cat} contributed ${wideCount} under the default and must contribute 1 at lead`);
  assert.ok(capped.policyDropped?.some((d) => d.domain === cat), "and the refusal is visible on the decision");
  clearPolicy();
});

test("12. a default deployment routes EXACTLY as it did before the policy existed", () => {
  clearPolicy();
  const request = "audit this API for security problems and rate limit issues";
  const withPolicy = routeDeterministic(request);
  /* The whole point of shipping every desk on at full depth with the house
     budget is that adding this layer changes NOTHING until someone asks it to.
     If this ever fails, the policy has started making decisions on the user's
     behalf that they never made. */
  assert.ok(withPolicy.selected.length > 0);
  assert.equal(withPolicy.policyDropped, undefined, "nothing is dropped under the default");
  assert.equal(policySummary().off, 0);
});
