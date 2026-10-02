#!/usr/bin/env node
/**
 * pack-release.mjs — build the two artifacts a release needs, and say what each
 * one is for.
 *
 *   node tools/pack-release.mjs [--out <dir>]
 *
 * WHY TWO. The first 19.6 archive was an overlay: modules, probes and rebuilt
 * bundles, with no `tsconfig.json` and no `verify/run.mjs`. A reviewer who
 * unzipped it could not run the commands its own release note named. The
 * overlay is still the right thing for a maintainer who has the host checkout
 * and wants the delta; it is the WRONG thing to hand someone who wants to
 * verify the claim. So both ship, named for what they are:
 *
 *   · SI-<v>-<Name>-full.zip      the complete tree. `tsc`, `npm test` and
 *                                 `sh VERIFY.sh` all run from a clean unzip.
 *   · SI-<v>-<Name>-overlay.zip   only what changed, to drop over 19.5.6.
 *
 * Both exclude node_modules, .git and the scratch files a working tree gathers.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
// 11.14.4 — the archive is now written in pure Node. The old `execFileSync("zip")`
// plus a hardcoded `/tmp` list file only worked on a maintainer's Mac; see
// tools/zipwriter.mjs for why that made the published artifacts unreproducible.
import { writeZip } from "./zipwriter.mjs";

const root = process.cwd();
const outDir = (() => {
  const i = process.argv.indexOf("--out");
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : "/home/user";
})();
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const version = pkg.version;
const codename = (fs.readFileSync(path.join(root, "src/version.ts"), "utf8").match(/ENGINE_CODENAME = "([^"]+)"/) ?? [, "Release"])[1];
const stem = `SI-${version}-${codename}`;

const ALWAYS_EXCLUDE = [
  "node_modules", ".git", "dist", "target", "__pycache__", ".vite", ".cache",
  "sigil-sheet.html", "sheet.html", "scratch-agentic-result.json",
  // 11.14.4 — the browser service writes a real Chromium user-data-dir
  // (Cookies, Login Data, History) INSIDE the source tree, one per launch, and
  // never prunes it. walk() reads the filesystem and never consults .gitignore,
  // so `.gitignore`'s entry was advisory only. Without this line the packer
  // would sweep ~200 MB of browser credential state into a public release.
  // Fixed two ways on purpose: excluded here, AND asserted below, so a rename
  // cannot silently reopen the hole.
  "profiles",
];
const SCRATCH_FILES = new Set([
  "montage.cjs", "fleet-check.mjs", "shot.mjs", "dist.mjs", "run1.mjs", "run2.mjs",
]);

function walk(dir, base = "", out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (ALWAYS_EXCLUDE.includes(entry.name)) continue;
    const abs = path.join(dir, entry.name);
    const rel = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isDirectory()) walk(abs, rel, out);
    else if (entry.isFile()) out.push(rel);
    else if (entry.isSymbolicLink()) out.push(rel);
  }
  return out;
}

/** Files the 19.6 line added or changed, relative to the 19.5.6 host. */
function overlayList() {
  const modified = execFileSync("git", ["diff", "--name-only"], { cwd: root, encoding: "utf8" }).split("\n").filter(Boolean);
  const untracked = execFileSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8" })
    .split("\n").filter((l) => l.startsWith("?? ")).map((l) => l.slice(3));
  const files = new Set();
  for (const rel of [...modified, ...untracked]) {
    if (SCRATCH_FILES.has(rel)) continue;
    // The full zip is written BEFORE this list is computed; on an in-tree
    // --out it shows up here as fresh M/?? and would nest the archive
    // inside the overlay (a 22 MB zip-in-zip). Release outputs never ship
    // inside a release artifact.
    if (inOutDir(rel)) continue;
    const abs = path.join(root, rel);
    if (!fs.existsSync(abs)) continue;
    if (fs.statSync(abs).isDirectory()) walk(abs, rel).forEach((f) => files.add(f));
    else files.add(rel);
  }
  return [...files].sort();
}

function makeZip(name, rels) {
  const outFile = path.join(outDir, `${stem}-${name}.zip`);
  if (fs.existsSync(outFile)) fs.unlinkSync(outFile);
  const { bytes } = writeZip(outFile, rels, { root });
  // 11.14.4 — the artifact is published with a checksum beside it. The release
  // had none, so a user had no way to confirm the archive they downloaded was
  // the one the project built; SECURITY.md pointed at a verification procedure
  // that started from a file nobody could authenticate.
  const digest = crypto.createHash("sha256").update(fs.readFileSync(outFile)).digest("hex");
  const sumFile = `${outFile}.sha256`;
  fs.writeFileSync(sumFile, `${digest}  ${path.basename(outFile)}\n`);
  const size = (bytes / 1024 / 1024).toFixed(1);
  console.log(`${name.padEnd(8)} ${outFile}  —  ${rels.length} files, ${size} MB`);
  console.log(`${" ".repeat(8)} sha256 ${digest}`);
  return { outFile, sumFile, digest };
}

/* ── the full tree ────────────────────────────────────────────────────────── */
/* `--out` may point INSIDE the tree (releases/). The previous archive lives
   there between runs; walk() would list it, makeZip() unlinks the target
   before writing, and writeZip then reads it as a SOURCE file → ENOENT.
   So: anything that resolves under the output dir never enters the archive. */
const outAbs = path.resolve(outDir);
const outRel = path.relative(root, outAbs);
const inOutDir = outRel && !outRel.startsWith("..") && !path.isAbsolute(outRel)
  ? (rel) => rel === outRel || rel.startsWith(outRel + "/")
  : () => false;
const full = walk(root).filter((rel) => !SCRATCH_FILES.has(rel.split("/").pop()) && !inOutDir(rel));
const artifacts = [makeZip("full", full)];

/* ── the overlay over 19.5.6 ─────────────────────────────────────────────── */
let overlay = [];
try {
  overlay = overlayList();
} catch {
  console.log("overlay  skipped — git is not available to diff against the host");
}
if (overlay.length > 0) artifacts.push(makeZip("overlay", overlay));

/* ── the self-check that would have caught the first archive's gap ───────── */
/* 19.7.10: the upgrade-doc entry used to be hardcoded to SelfImpulse.6-UPGRADE.md,
   so the "is this artifact independently verifiable" check was validating a
   stale filename from three series ago. It now follows the release identity
   the same way versionDrift does. */
const ENGINE_SHORT = (fs.readFileSync(path.join(root, "src/version.ts"), "utf8").match(/ENGINE_SHORT = "([^"]+)"/) ?? [, "19.7"])[1];
const REQUIRED_IN_FULL = ["tsconfig.json", "package.json", "verify/run.mjs", "scripts/verify.sh", "src/version.ts", "README.md", `SI-${ENGINE_SHORT}-UPGRADE.md`, "FEATURES.md"];
/**
 * accept the archived home too. The product rebrand moved the versioned record
 * (changelog, upgrade guides, design notes) under docs/history/ BY ROLE — which
 * is correct, and which left this check looking for the upgrade guide at the
 * root it no longer occupies. The result was the worst kind of gate: the zips
 * were written and then the tool exited 1, so a release job would fail on a
 * documentation move while the artifact it produced was perfectly fine.
 * The file is still REQUIRED; only where it is allowed to live has widened.
 *
 * v0.0.3 folded the record under docs/ BY ROLE again (docs/releases/,
 * docs/legal/, docs/setup/) and moved the zero-install gate to scripts/ — so
 * this widens to the same role homes, plus scripts/ for VERIFY.sh. The bug this
 * catches is "the artifact is not independently verifiable"; it is not "someone
 * reorganised a folder".
 */
const RELOCATED_HOMES = ["", "docs/history/", "docs/releases/", "docs/legal/", "scripts/"];
const inFull = (rel) => RELOCATED_HOMES.some((home) => full.includes(home + rel));
const missing = REQUIRED_IN_FULL.filter((rel) => !inFull(rel));
if (missing.length > 0) {
  console.error(`\nREFUSING: the full tree is missing ${missing.join(", ")} — it would not be independently verifiable.`);
  process.exit(1);
}
console.log(`\nfull tree self-check: ${REQUIRED_IN_FULL.length}/${REQUIRED_IN_FULL.length} required files present`);

/* 11.14.4 — the credential-leak self-check.
 *
 * `ALWAYS_EXCLUDE` prevents browser profile state from being swept in. This
 * asserts the OUTCOME, so a future rename of the directory, a new browser
 * service, or a stray copy anywhere in the tree fails the pack rather than
 * shipping it. A Chromium user-data-dir carries Cookies, Login Data and
 * History; the tree's whole claim is that keys never sit in plaintext, so
 * quietly zipping one would contradict the product's own SECURITY.md.
 */
const leakedProfiles = full.filter((rel) => /(^|\/)profiles\//i.test(rel) || /(^|\/)(Login Data|Cookies|History|Web Data|Local State)$/i.test(rel));
if (leakedProfiles.length > 0) {
  console.error(`\nREFUSING: ${leakedProfiles.length} browser-credential file(s) would ship in the release:`);
  for (const rel of leakedProfiles.slice(0, 10)) console.error(`  ${rel}`);
  if (leakedProfiles.length > 10) console.error(`  ... and ${leakedProfiles.length - 10} more`);
  console.error("\nDelete them, or add the directory to ALWAYS_EXCLUDE. Do not publish a browser profile.");
  process.exit(1);
}
console.log("credential self-check: no browser profile data in the artifact");

/* ── SHA256SUMS covering every artifact this run produced ─────────────────── */
const sumsName = "SHA256SUMS";
const sumsPath = path.join(outDir, sumsName);
const sumsBody = artifacts
  .map((a) => `${a.digest}  ${path.basename(a.outFile)}`)
  .join("\n") + "\n";
fs.writeFileSync(sumsPath, sumsBody);
console.log(`\n${sumsName} written for ${artifacts.length} artifact(s):`);
for (const line of sumsBody.trim().split("\n")) console.log(`  ${line}`);
console.log("\nverify a download with:");
console.log(`  shasum -a 256 -c ${sumsName}`);
console.log(`  certutil -hashfile ${path.basename(artifacts[0].outFile)} SHA256   # Windows`);
console.log("\nNOTE: a checksum proves the file arrived intact. It is not a signature —");
console.log("publish these sums where the reader trusts (release page, tag) so a");
console.log("substituted mirror cannot ship its own sum beside a tampered zip.");
console.log("verify the full artifact with: unzip it, then  sh scripts/verify.sh  (zero install)  ·  npm ci && npm test  (with deps)");
