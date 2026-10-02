#!/usr/bin/env node
/**
 * make-runnable-zip.mjs — the same full tree as pack-release.mjs, PLUS dist/.
 *
 * pack-release.mjs excludes dist/ by design: the canonical artifact is the
 * source tree a reviewer verifies from scratch (sh VERIFY.sh, no install). This
 * one exists for the other reader — someone who wants to open the product now,
 * without a node toolchain. Same sources, same gates; the only addition is the
 * already-built production bundle.
 *
 *   node tools/make-runnable-zip.mjs [--out <dir>]
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
// 11.14.4 — same cross-platform zip writer pack-release.mjs now uses. The
// `execFileSync("zip")` + `/tmp` list here made this artifact unbuildable on
// Windows, and the filename still said "elevenhandle" from before the rebrand.
import { writeZip } from "./zipwriter.mjs";

const root = process.cwd();
const i = process.argv.indexOf("--out");
const outDir = i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : process.cwd();
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
// 11.14.4 — was `elevenhandle-<v>-runnable.zip`, a name from two brands ago.
// Derive it from the same identity pack-release.mjs uses so the two artifacts
// are visibly the same product.
const codename = (fs.readFileSync(path.join(root, "src/version.ts"), "utf8").match(/ENGINE_CODENAME = "([^"]+)"/) ?? [, "Release"])[1];
const outFile = path.join(outDir, `SI-${pkg.version}-${codename}-runnable.zip`);

const EXCLUDE = new Set([
  "node_modules", ".git", "target", "__pycache__", ".vite", ".cache",
  // 11.14.4 — the browser service writes a real Chromium user-data-dir inside
  // the source tree and never prunes it. Without this line a "runnable" build
  // would carry ~200 MB of cookies and saved-password files to whoever unzips it.
  "profiles",
]);
const SCRATCH = new Set(["montage.cjs", "fleet-check.mjs", "shot.mjs", "dist.mjs", "run1.mjs", "run2.mjs", "scratch-agentic-result.json"]);

function walk(dir, base = "", out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (EXCLUDE.has(e.name)) continue;
    const rel = base ? `${base}/${e.name}` : e.name;
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) walk(abs, rel, out);
    else if (e.isFile() && !SCRATCH.has(e.name)) out.push(rel);
  }
  return out;
}

const files = walk(root);
if (!files.some((f) => f.startsWith("dist/"))) {
  console.error("REFUSING: dist/ is not present — run `npm run build` first; this artifact exists to be runnable.");
  process.exit(1);
}
if (fs.existsSync(outFile)) fs.unlinkSync(outFile);
// 11.14.4 — no /tmp list, no external `zip`. Same writer, same checksum.
const { bytes } = writeZip(outFile, files, { root });
const digest = crypto.createHash("sha256").update(fs.readFileSync(outFile)).digest("hex");
fs.writeFileSync(`${outFile}.sha256`, `${digest}  ${path.basename(outFile)}\n`);
const mb = (bytes / 1024 / 1024).toFixed(1);
console.log(`${outFile}  —  ${files.length} files, ${mb} MB (dist/ included: the app runs from the unzip)`);
console.log(`         sha256 ${digest}`);

// The same refusal pack-release.mjs makes, kept here so a "runnable" build can
// never be the one that leaks.
const leaked = files.filter((rel) => /(^|\/)profiles\//i.test(rel) || /(^|\/)(Login Data|Cookies|History|Web Data|Local State)$/i.test(rel));
if (leaked.length > 0) {
  console.error(`\nREFUSING: ${leaked.length} browser-credential file(s) would ship:`);
  for (const rel of leaked.slice(0, 10)) console.error(`  ${rel}`);
  process.exit(1);
}
