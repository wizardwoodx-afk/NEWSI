/**
 * probe/scoreSourceOfTruth.test.ts — ONE metric, ONE source of truth (17.10.3).
 *
 * WHY THIS SUITE EXISTS
 *
 * 17.10.0 fixed `selfimpulseRerate()`, which returned `60 + seats * 3` — assurance that
 * rose every time you added an agent. Its tests passed. Its release notes said the
 * fabricated number was fixed.
 *
 * It wasn't. A SECOND implementation survived in `src/app/selfimpulse.tsx`:
 *
 *     assuranceScore: Math.min(96, 60 + s.receipts.length * 2 + s.skills.length * 3)
 *
 * ...and it was rendered by TWO live surfaces (SelfImpulse "Safe selfimpulse", Register
 * "Assurance score"). The authoritative scorer had been fixed; a parallel
 * presentation path still invented a number. The new module's tests could not
 * see it, because the defect was never in that module.
 *
 * THE LESSON, MADE MECHANICAL
 *
 * A "security fixed" release must not pass on the strength of the new module's
 * tests alone. When you fix a concept, you have to search the whole live
 * runtime for every OTHER implementation of that concept. That is a grep, and a
 * grep belongs in the gate — not in a reviewer's memory.
 *
 * This suite therefore pins the CONCEPT, not the function:
 *   1. a numeric assurance may be produced in exactly ONE place
 *   2. no surface may synthesise one from literals
 *   3. every surface renders through the one shared formatter
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

declare const SI_ROOT: string;
const root = SI_ROOT ?? process.cwd();

/* The only files allowed to take part in producing an assurance figure. */
const SANCTIONED = new Set([
  "src/mission/assuranceScore.ts",   // the scorer — the ONLY place a score is computed
  "src/selfimpulse/engine/bridge.ts",      // the adapter — gathers evidence, delegates to the scorer
]);

/* Surfaces: anything that renders. These must never compute, only read. */
const SURFACE_DIRS = ["src/ui/", "src/panels/", "src/app/"];

function walk(dir: string, out: string[] = []): string[] {
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

const rel = (p: string): string => path.relative(root, p).split(path.sep).join("/");
const files = walk(path.join(root, "src")).map(rel).sort();
const read = (p: string): string => fs.readFileSync(path.join(root, p), "utf8");

let passed = 0;
const failures: string[] = [];
const ok = (label: string, cond: boolean, detail = ""): void => {
  if (cond) passed++;
  else failures.push(detail ? `${label} — ${detail}` : label);
  console.log(`  ${cond ? "ok " : "FAIL"} ${label}${cond ? "" : ` — ${detail}`}`);
};

test("scoreSourceOfTruth — one metric has exactly one producer and one renderer", () => {
  console.log("\n== assurance: one metric, one source of truth ==\n");

  ok("the scan covers the live tree", files.length >= 80, `only ${files.length} files`);

  /* ── 1 · no surface may synthesise a score from literals ─────────────────── */
  const FABRICATION_SHAPES: Array<{ name: string; re: RegExp }> = [
    { name: "base-constant formula", re: /\b(?:Math\.min\(\s*\d{2,3}\s*,\s*)?(?:5\d|6\d|7\d|8\d|9\d)\s*\+\s*[\w.]+\s*\*/ },
    { name: "count-times-weight formula", re: /\.\w+\s*\*\s*[2-9]\b/ },
    { name: "assurance field assigned arithmetic", re: /assurance\w*\s*[:=]\s*[^;]*\d+\s*[+*]/i },
  ];

  const offenders: string[] = [];
  for (const f of files) {
    if (SANCTIONED.has(f)) continue;
    const text = read(f);
    for (const line of text.split("\n")) {
      const code = line.trim();
      // skip comments and doc prose — only real code can fabricate a number
      if (code.startsWith("*") || code.startsWith("//") || code.startsWith("/*")) continue;
      if (!/assurance|score|kpi/i.test(code)) continue;
      for (const { name, re } of FABRICATION_SHAPES) {
        if (re.test(code)) offenders.push(`${f}: [${name}] ${code.slice(0, 90)}`);
      }
    }
  }
  ok("no file outside the sanctioned pair fabricates a score",
    offenders.length === 0,
    offenders.slice(0, 4).join(" | "));

  /* ── 2 · the old field must be gone entirely ─────────────────────────────── */
  const legacyField = files.filter((f) =>
    read(f).split("\n").some((line) => {
      const code = line.trim();
      if (code.startsWith("*") || code.startsWith("//") || code.startsWith("/*")) return false;
      return /\bassuranceScore\s*:\s*number\b/.test(code);
    }));
  ok("no `assuranceScore: number` field survives anywhere",
    legacyField.length === 0, legacyField.join(", "));

  /* ── 3 · the score function has exactly one definition ───────────────────── */
  const definers = files.filter((f) => /export function scoreAssurance\b/.test(read(f)));
  ok("exactly one `scoreAssurance` definition exists",
    definers.length === 1, definers.join(", "));

  /* ── 4 · the adapter delegates rather than computes ──────────────────────── */
  const bridge = read("src/selfimpulse/engine/bridge.ts");
  ok("selfimpulseRerate delegates to scoreAssurance()",
    /scoreAssurance\(/.test(bridge), "the adapter must call the scorer, not re-implement it");
  ok("selfimpulseRerate calls assuranceEvidence() (real evidence, not counting)",
    /assuranceEvidence\(\)/.test(bridge), "no evidence gatherer found");

  /* ── 5 · every surface renders through the one formatter ─────────────────── */
  /* Surfaces wired to LIVE app state must render through the shared formatter —
     they are the ones that previously invented a number from receipts and skills.
     Pure panels that receive an AssuranceScore as a prop and call the scorer
     themselves (e.g. panels/ExecutivePanels.tsx) are a different, sanctioned
     shape: they take the evidence as input and never synthesise it. The rule is
     about who OWNS the number, so it is scoped to live-state surfaces. */
  /* 19.7.12 (UI): the legacy live-state KPI pages (useSelfImpulse) are deleted. The
     rule is now stricter: NO surface renders an assurance figure at all unless
     it comes through assuranceKpi(); today none does. */
  const kpiViews = files.filter((f) =>
    /Safe selfimpulse|Assurance score/.test(read(f)) && /useSelfImpulse\(|state\.totals|assuranceKpi\(/.test(read(f)));
  ok("no retired live-state KPI page survives (useSelfImpulse is gone from the tree)", !files.some((f) => /useSelfImpulse\(/.test(read(f))), files.filter((f) => /useSelfImpulse\(/.test(read(f))).join(", "));
  const bypassing = kpiViews.filter((f) => !/assuranceKpi\(/.test(read(f)));
  ok("every live-state assurance KPI renders via assuranceKpi()",
    bypassing.length === 0, bypassing.join(", "));
  const sanctionedPure = files.filter((f) =>
    /Assurance score/.test(read(f)) && /AssuranceScore/.test(read(f)) && !/useSelfImpulse\(/.test(read(f)));
  ok("pure panels take the score as input rather than computing it from counts",
    sanctionedPure.every((f) => /scoreAssurance\(/.test(read(f))),
    sanctionedPure.join(", "));

  /* ── 6 · the formatter has one definition and is not re-implemented ──────── */
  const formatters = files.filter((f) => /export function assuranceKpi\b/.test(read(f)));
  ok("exactly one `assuranceKpi` definition exists",
    formatters.length === 1, formatters.join(", "));

  /* ── 7 · surfaces never reach past the app layer for it ──────────────────── */
  const reaching = files
    .filter((f) => SURFACE_DIRS.some((d) => f.startsWith(d)) && f !== "src/app/selfimpulse.tsx")
    .filter((f) => /from ['"][^'"]*selfimpulse\/engine\/bridge['"]/.test(read(f)));
  ok("no surface imports the engine directly for assurance",
    reaching.length === 0, reaching.join(", "));

  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length > 0) {
    console.log("\nfailures:");
    for (const f of failures) console.log(`  - ${f}`);
  }
  assert.equal(failures.length, 0, failures.join("; "));
});
