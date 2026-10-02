#!/usr/bin/env node
/**
 * Run ONE probe suite by name, with the same bundling the full runner uses.
 * Useful when iterating on a single failure instead of the whole 100-suite run.
 *
 *   node tools/run-one-probe.mjs versionDrift
 *   node tools/run-one-probe.mjs buttonActions
 */
import { buildSync } from "esbuild";
import { execFileSync } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const probeDir = path.join(root, "probe");

const name = process.argv[2];
if (!name) {
  console.error("usage: node tools/run-one-probe.mjs <suite-name>");
  console.error("e.g.   node tools/run-one-probe.mjs versionDrift");
  process.exit(2);
}
const file = name.endsWith(".test.ts") ? name : `${name}.test.ts`;
const fullPath = path.join(probeDir, file);
if (!fs.existsSync(fullPath)) {
  console.error(`no such suite: probe/${file}`);
  process.exit(2);
}

const outPath = path.join(probeDir, `.one-${file}.mjs`);
buildSync({
  entryPoints: [fullPath],
  bundle: true,
  platform: "node",
  format: "esm",
  packages: "external",
  banner: {
    js: 'import { createRequire as __mjCreateRequire } from "node:module"; const require = __mjCreateRequire(import.meta.url);',
  },
  define: { SI_ROOT: JSON.stringify(root) },
  outfile: outPath,
  logLevel: "error",
});

let code = 0;
try {
  const stdout = execFileSync(process.execPath, [outPath], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: Number(process.env.HANDLE_PROBE_TIMEOUT_MS) || 300_000,
  });
  process.stdout.write(stdout);
} catch (err) {
  code = err.status ?? 1;
  if (err.stdout) process.stdout.write(err.stdout);
  if (err.stderr) process.stderr.write(err.stderr);
} finally {
  try { fs.unlinkSync(outPath); } catch { /* best effort */ }
}
process.exit(code);
