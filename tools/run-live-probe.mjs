#!/usr/bin/env node
/**
 * Live-probe runner — every suite whose claim can only be checked against a real dependency.
 *
 * WHY THESE ARE NOT IN THE OFFLINE PACK. The pack bundles every suite into one
 * self-contained file so a stranger can reproduce the gate with Node and nothing else. No
 * self-contained file can carry a 5 MB PDFium binary or a multi-megabyte recogniser, and the
 * pack's own freshness gate assumes every bundle PASSES — so a suite that must skip would
 * break it. Hence: environment-dependent suites are named `.spec.ts`, live here, and are run
 * on demand.
 *
 *     npm run test:live              every live suite
 *     npm run test:live ocrLive      one of them, by name fragment
 *
 * THEY ARE NOT PART OF THE OFFLINE GATE, and that is stated rather than implied: a green
 * `npm test` does not mean these ran.
 *
 * A REFUSAL IS NEVER A PASS. Each suite that cannot run here prints the house
 * `REFUSED (needs node_modules)` line and exits NON-ZERO, so this runner reports it as
 * SKIPPED — the same rule the offline runner follows, for the same reason.
 */
import { readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildSync } from "esbuild";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const probeDir = path.join(root, "probe");

/** Every `probe/*.spec.ts` — auto-discovered, so a new live suite cannot be forgotten. */
function liveSuites(filter) {
  return readdirSync(probeDir)
    .filter((f) => f.endsWith(".spec.ts") && !f.startsWith("."))
    .filter((f) => (filter ? f.includes(filter) : true))
    .sort();
}

const filter = process.argv[2];
const suites = liveSuites(filter);
if (suites.length === 0) {
  console.error(filter
    ? `REFUSED: no live suite in probe/ matches "${filter}". Known: ${liveSuites().join(", ") || "(none)"}`
    : "REFUSED: there are no probe/*.spec.ts suites in this tree.");
  process.exit(2);
}

const { spawnSync } = await import("node:child_process");
const out = path.join(probeDir, ".live-run.mjs");
const results = [];

for (const suite of suites) {
  const entry = path.join(probeDir, suite);
  try {
    buildSync({
      entryPoints: [entry],
      bundle: true,
      platform: "node",
      format: "esm",
      packages: "external",
      banner: { js: 'import { createRequire as __r } from "node:module"; const require = __r(import.meta.url);' },
      define: { SI_ROOT: JSON.stringify(root) },
      outfile: out,
      logLevel: "error",
    });
  } catch (e) {
    // esbuild missing is an environment fact, not a verification failure — the same
    // distinction `verify/run.mjs` draws.
    results.push({ suite, status: "skip", detail: `needs node_modules (esbuild): ${String(e).slice(0, 100)}` });
    continue;
  }
  const r = spawnSync(process.execPath, [out], { cwd: root, stdio: "inherit" });
  const status = r.status ?? 1;
  // Exit 2 is the house refusal code: the suite declined to run here. Anything else
  // non-zero is a genuine failure and must never be reported as a skip.
  results.push({ suite, status: status === 0 ? "pass" : status === 2 ? "skip" : "FAIL", detail: `exit ${status}` });
}

try { (await import("node:fs")).rmSync(out, { force: true }); } catch { /* best effort */ }

const passed = results.filter((r) => r.status === "pass").length;
const skipped = results.filter((r) => r.status === "skip");
const failed = results.filter((r) => r.status === "FAIL");

console.log("\n========================================");
console.log(`LIVE PROBES: ${passed} passed, ${failed.length} failed, ${skipped.length} skipped.`);
console.log("========================================");
if (skipped.length > 0) {
  console.log("\nSkipped (environment, not a verification failure):");
  for (const s of skipped) console.log(`  • ${s.suite} — ${s.detail}`);
  console.log("  These suites have NOT verified anything on this machine.");
}
if (failed.length > 0) {
  console.log("\nFAILED:");
  for (const f of failed) console.log(`  • ${f.suite} — ${f.detail}`);
}
process.exit(failed.length > 0 ? 1 : 0);
