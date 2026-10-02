import { createRequire as __mjCreateRequire } from "node:module"; const require = __mjCreateRequire(import.meta.url);

// probe/scoreSourceOfTruth.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
var root = ".";
var SANCTIONED = /* @__PURE__ */ new Set([
  "src/mission/assuranceScore.ts",
  // the scorer — the ONLY place a score is computed
  "src/selfimpulse/engine/bridge.ts"
  // the adapter — gathers evidence, delegates to the scorer
]);
var SURFACE_DIRS = ["src/ui/", "src/panels/", "src/app/"];
function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (["node_modules", "dist", ".git"].includes(e.name)) continue;
      walk(p, out);
    } else if (/\.(ts|tsx)$/.test(e.name) && !/\.test\./.test(e.name)) {
      out.push(p);
    }
  }
  return out;
}
var rel = (p) => path.relative(root, p).split(path.sep).join("/");
var files = walk(path.join(root, "src")).map(rel).sort();
var read = (p) => fs.readFileSync(path.join(root, p), "utf8");
var passed = 0;
var failures = [];
var ok = (label, cond, detail = "") => {
  if (cond) passed++;
  else failures.push(detail ? `${label} \u2014 ${detail}` : label);
  console.log(`  ${cond ? "ok " : "FAIL"} ${label}${cond ? "" : ` \u2014 ${detail}`}`);
};
test("scoreSourceOfTruth \u2014 one metric has exactly one producer and one renderer", () => {
  console.log("\n== assurance: one metric, one source of truth ==\n");
  ok("the scan covers the live tree", files.length >= 80, `only ${files.length} files`);
  const FABRICATION_SHAPES = [
    { name: "base-constant formula", re: /\b(?:Math\.min\(\s*\d{2,3}\s*,\s*)?(?:5\d|6\d|7\d|8\d|9\d)\s*\+\s*[\w.]+\s*\*/ },
    { name: "count-times-weight formula", re: /\.\w+\s*\*\s*[2-9]\b/ },
    { name: "assurance field assigned arithmetic", re: /assurance\w*\s*[:=]\s*[^;]*\d+\s*[+*]/i }
  ];
  const offenders = [];
  for (const f of files) {
    if (SANCTIONED.has(f)) continue;
    const text = read(f);
    for (const line of text.split("\n")) {
      const code = line.trim();
      if (code.startsWith("*") || code.startsWith("//") || code.startsWith("/*")) continue;
      if (!/assurance|score|kpi/i.test(code)) continue;
      for (const { name, re } of FABRICATION_SHAPES) {
        if (re.test(code)) offenders.push(`${f}: [${name}] ${code.slice(0, 90)}`);
      }
    }
  }
  ok(
    "no file outside the sanctioned pair fabricates a score",
    offenders.length === 0,
    offenders.slice(0, 4).join(" | ")
  );
  const legacyField = files.filter((f) => read(f).split("\n").some((line) => {
    const code = line.trim();
    if (code.startsWith("*") || code.startsWith("//") || code.startsWith("/*")) return false;
    return /\bassuranceScore\s*:\s*number\b/.test(code);
  }));
  ok(
    "no `assuranceScore: number` field survives anywhere",
    legacyField.length === 0,
    legacyField.join(", ")
  );
  const definers = files.filter((f) => /export function scoreAssurance\b/.test(read(f)));
  ok(
    "exactly one `scoreAssurance` definition exists",
    definers.length === 1,
    definers.join(", ")
  );
  const bridge = read("src/selfimpulse/engine/bridge.ts");
  ok(
    "selfimpulseRerate delegates to scoreAssurance()",
    /scoreAssurance\(/.test(bridge),
    "the adapter must call the scorer, not re-implement it"
  );
  ok(
    "selfimpulseRerate calls assuranceEvidence() (real evidence, not counting)",
    /assuranceEvidence\(\)/.test(bridge),
    "no evidence gatherer found"
  );
  const kpiViews = files.filter((f) => /Safe selfimpulse|Assurance score/.test(read(f)) && /useSelfImpulse\(|state\.totals|assuranceKpi\(/.test(read(f)));
  ok("no retired live-state KPI page survives (useSelfImpulse is gone from the tree)", !files.some((f) => /useSelfImpulse\(/.test(read(f))), files.filter((f) => /useSelfImpulse\(/.test(read(f))).join(", "));
  const bypassing = kpiViews.filter((f) => !/assuranceKpi\(/.test(read(f)));
  ok(
    "every live-state assurance KPI renders via assuranceKpi()",
    bypassing.length === 0,
    bypassing.join(", ")
  );
  const sanctionedPure = files.filter((f) => /Assurance score/.test(read(f)) && /AssuranceScore/.test(read(f)) && !/useSelfImpulse\(/.test(read(f)));
  ok(
    "pure panels take the score as input rather than computing it from counts",
    sanctionedPure.every((f) => /scoreAssurance\(/.test(read(f))),
    sanctionedPure.join(", ")
  );
  const formatters = files.filter((f) => /export function assuranceKpi\b/.test(read(f)));
  ok(
    "exactly one `assuranceKpi` definition exists",
    formatters.length === 1,
    formatters.join(", ")
  );
  const reaching = files.filter((f) => SURFACE_DIRS.some((d) => f.startsWith(d)) && f !== "src/app/selfimpulse.tsx").filter((f) => /from ['"][^'"]*selfimpulse\/engine\/bridge['"]/.test(read(f)));
  ok(
    "no surface imports the engine directly for assurance",
    reaching.length === 0,
    reaching.join(", ")
  );
  console.log(`
${passed} passed, ${failures.length} failed`);
  if (failures.length > 0) {
    console.log("\nfailures:");
    for (const f of failures) console.log(`  - ${f}`);
  }
  assert.equal(failures.length, 0, failures.join("; "));
});
