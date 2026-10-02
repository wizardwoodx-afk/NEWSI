#!/usr/bin/env node
/**
 * quick-verify.mjs — run a NAMED SUBSET of the offline pack, fast, with zero
 * install. Built because a reviewer with a short execution window could not run
 * the whole zero-dependency gate and was therefore unable to reproduce any of
 * the release's headline numbers.
 *
 *   node tools/quick-verify.mjs                 # the headline suites (~10s)
 *   node tools/quick-verify.mjs fed             # every bundle whose name contains "fed"
 *   node tools/quick-verify.mjs fedApproval fedCrossing fedFleet
 *   node tools/quick-verify.mjs --list          # what is in the pack
 *
 * It runs the SAME pre-built bundles the full gate runs (`verify/suites/*.mjs`,
 * produced by `node tools/build-offline-verify.mjs`), in a child process each,
 * and prints the same summary shape. It is a convenience over
 * `node verify/run.mjs` — never a replacement: the full runner is the gate, this
 * is how you get a five-suite answer inside a five-second window.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const suitesDir = path.join(root, "verify", "suites");

/** The suites a reviewer most needs to see, in the order they read best. */
const HEADLINE = [
  "fedApproval", "fedCrossing", "fedIdentity", "fedSigil", "fedFleet",
  "reachGrant", "reachPairMemory", "reachBeacon", "reachBatch",
  "versionDrift", "docIdentity",
];
/* Note: `offlinePack` is deliberately NOT in the pack it verifies — the pack's
   own freshness gate runs only under `npm test`. The full runner says the same. */

const argv = process.argv.slice(2);

if (!fs.existsSync(suitesDir)) {
  console.error("verify/suites is missing. Build it first:  node tools/build-offline-verify.mjs");
  process.exit(2);
}

const all = fs.readdirSync(suitesDir).filter((f) => f.endsWith(".mjs") && f !== "run.mjs").sort();

if (argv.includes("--list")) {
  console.log(`${all.length} bundles in verify/suites:`);
  for (const f of all) console.log(`  ${f.replace(/\.test\.mjs$/, "")}`);
  process.exit(0);
}

const wanted = argv.filter((a) => !a.startsWith("--"));
const chosen = [];
for (const name of wanted.length > 0 ? wanted : HEADLINE) {
  const stem = name.replace(/\.test\.mjs$/, "");
  const match = all.filter((f) => f.replace(/\.test\.mjs$/, "") === stem);
  const loose = match.length > 0 ? match : all.filter((f) => f.includes(stem));
  if (loose.length === 0) {
    console.error(`no bundle matches "${name}" — try: node tools/quick-verify.mjs --list`);
    process.exit(2);
  }
  for (const f of loose) if (!chosen.includes(f)) chosen.push(f);
}

console.log(`quick verify: ${chosen.length} bundle(s), zero install, from verify/suites\n`);

let pass = 0;
let fail = 0;
const failed = [];
for (const file of chosen) {
  const full = path.join(suitesDir, file);
  const started = Date.now();
  try {
    const out = execFileSync(process.execPath, [full], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 120_000 });
    pass += 1;
    /* Two shapes exist in this repo: plain runners print "N passed, M failed",
       node:test TAP prints "# pass N". Read whichever is present, so the number
       a reviewer sees is the suite's own count and never a label we invented. */
    const lines = out.trim().split("\n");
    const plain = lines.filter((l) => /^\d+ passed, \d+ failed$/.test(l.trim())).pop();
    const tapPass = (out.match(/^# pass (\d+)$/m) ?? [])[1];
    const tapFail = (out.match(/^# fail (\d+)$/m) ?? [])[1];
    const count = plain ? plain.trim() : tapPass !== undefined ? `${tapPass} checks passed, ${tapFail ?? "?"} failed` : "ran";
    console.log(`PASS ${file}  (${((Date.now() - started) / 1000).toFixed(1)}s)  ${count}`);
  } catch (err) {
    fail += 1;
    failed.push(file);
    const text = `${err.stdout ?? ""}${err.stderr ?? ""}`;
    const detail = text.split("\n").filter((l) => /not ok|error:|AssertionError|passed/.test(l)).slice(0, 4).join("\n    ");
    console.log(`FAIL ${file}\n    ${detail}`);
  }
}

console.log(`\nQUICK VERIFY SUMMARY: ${pass} passed, ${fail} failed.`);
if (failed.length > 0) {
  console.log(`Failed: ${failed.join(", ")}`);
  process.exit(1);
}
console.log("This is a subset. The full gate is:  node verify/run.mjs   (and  npm test  with dependencies installed)");
