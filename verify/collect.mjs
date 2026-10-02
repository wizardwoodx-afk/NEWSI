#!/usr/bin/env node
/**
 * verify/collect.mjs — merge shard records into one honest verdict (19.6.3).
 *
 *     node verify/collect.mjs                 merge everything in verify/shards/
 *     node verify/collect.mjs --json out.json  also write the merged record
 *     node verify/collect.mjs --clear          remove the shard records
 *
 * WHY THIS EXISTS. `node verify/run.mjs` takes ~86s on a two-core machine, and a
 * reviewer whose execution window is shorter than that had no way to reproduce
 * the pack gate at all — so a release claim went unverified through no fault of
 * theirs. The runner can now be run in pieces (`--shard i/n`, `--time-budget s`),
 * and this merges the pieces.
 *
 * THE RULE THAT KEEPS IT HONEST: a merged verdict is a PASS only when the union
 * of the records covers EVERY bundle in the pack and nothing failed. Any suite
 * missing is named, and the exit code is 3 (incomplete) rather than 0. A
 * collector that printed "all good" over a partial set would be worse than no
 * collector at all.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const suitesDir = path.join(root, "verify", "suites");
const shardsDir = path.join(root, "verify", "shards");
const argv = process.argv.slice(2);
const jsonAt = (() => {
  const i = argv.indexOf("--json");
  return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : null;
})();

if (argv.includes("--clear")) {
  if (fs.existsSync(shardsDir)) {
    let n = 0;
    for (const f of fs.readdirSync(shardsDir)) {
      if (f.endsWith(".json")) { fs.rmSync(path.join(shardsDir, f)); n += 1; }
    }
    console.log(`collect: cleared ${n} shard record(s)`);
  } else {
    console.log("collect: nothing to clear");
  }
  process.exit(0);
}

if (!fs.existsSync(shardsDir)) {
  console.error("collect: no verify/shards/ directory — run a shard first:");
  console.error("  node verify/run.mjs --shard 1/4     (repeat for 1/4 … 4/4)");
  process.exit(2);
}

const every = fs.readdirSync(suitesDir).filter((f) => f.endsWith(".mjs")).sort();
const records = fs
  .readdirSync(shardsDir)
  .filter((f) => f.endsWith(".json"))
  .sort()
  .map((f) => {
    const full = path.join(shardsDir, f);
    try {
      return { file: f, ...JSON.parse(fs.readFileSync(full, "utf8")) };
    } catch {
      return { file: f, unreadable: true };
    }
  });

if (records.length === 0) {
  console.error("collect: verify/shards/ holds no records yet");
  process.exit(2);
}

const covered = new Set();
const passed = new Set();
const failed = new Set();
const skipped = new Set();
const unreadable = [];
let seconds = 0;
const versions = new Set();

for (const r of records) {
  if (r.unreadable) { unreadable.push(r.file); continue; }
  versions.add(`${r.tree ?? "?"} (node ${r.node ?? "?"})`);
  seconds += Number(r.elapsedSec ?? 0);
  for (const s of r.ran ?? []) covered.add(s);
  for (const s of r.passed ?? []) { covered.add(s); passed.add(s); }
  for (const s of r.failed ?? []) { covered.add(s); failed.add(s); }
  for (const s of r.skipped ?? []) { covered.add(s); skipped.add(s); }
}

const missing = every.filter((s) => !covered.has(s));
const extra = [...covered].filter((s) => !every.includes(s));

console.log(`collect: ${records.length} record(s) — ${records.map((r) => r.label ?? r.file).join(", ")}`);
console.log(`collect: tree(s) seen — ${[...versions].join(" | ")}`);
console.log(`collect: ${seconds.toFixed(1)}s of runner time across the records`);
if (unreadable.length > 0) console.log(`collect: UNREADABLE record(s): ${unreadable.join(", ")}`);

if (extra.length > 0) {
  console.log(`collect: ${extra.length} suite(s) in the records are not in this tree's pack — stale shards from a different build:`);
  for (const s of extra.slice(0, 10)) console.log(`  · ${s}`);
}
if (missing.length > 0) {
  console.log(`collect: NOT COVERED — ${missing.length} of ${every.length} bundle(s) were never run:`);
  for (const s of missing) console.log(`  · ${s}`);
}

console.log("========================================");
const skipNote = skipped.size > 0 ? `, ${skipped.size} skipped (need node_modules — esbuild)` : "";
console.log(`MERGED VERIFY SUMMARY: ${passed.size} passed, ${failed.size} failed${skipNote}, ${missing.length} not covered. (${records.length} record(s))`);
console.log("========================================");

if (jsonAt) {
  fs.writeFileSync(jsonAt, JSON.stringify({
    at: new Date().toISOString(),
    records: records.map((r) => ({ file: r.file, label: r.label ?? null, tree: r.tree ?? null })),
    passed: [...passed].sort(), failed: [...failed].sort(), skipped: [...skipped].sort(), missing,
  }, null, 2) + "\n");
  console.log(`collect: merged record written to ${jsonAt}`);
}

if (failed.size > 0) {
  console.error("Failed suites:", [...failed].sort());
  process.exit(1);
}
if (missing.length > 0 || records.length === 0) {
  console.error("NOT VERIFIED: the records do not cover the whole pack. Run the remaining shards:");
  console.error(`  node verify/run.mjs --shard <i>/n     until every one of the ${every.length} bundles is covered`);
  process.exit(3);
}
console.log(`verified: all ${every.length} bundles covered, 0 failed.`);
