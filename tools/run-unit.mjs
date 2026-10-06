#!/usr/bin/env node
/**
 * Unit gate runner — `npm run unit`.
 *
 * Bundles tools/unit.ts with esbuild's JavaScript API and runs the result
 * with execFileSync(process.execPath, …): no shell, no .bin resolution, no
 * quoting — the same discipline as tools/run-all-probes.mjs, so behaviour
 * is identical on linux / macOS / windows. `packages: "external"` keeps
 * runtime imports resolving from the project's node_modules.
 *
 * tools/unit.ts pins the PURE decision functions of the engine (supervisor
 * classification, the repair ladder, manifest hashing, C2PA-style lineage)
 * and exits 1 on the first failure, so this can gate a build on its own.
 * The whole-mission §39 acceptance run lives in probe/acceptance.test.ts
 * and rides with `npm test`.
 */
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { buildSync } from "esbuild";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const entry = path.join(root, "tools", "unit.ts");
const out = path.join(root, "tools", "unit.built.mjs");

buildSync({
  entryPoints: [entry],
  bundle: true,
  platform: "node",
  format: "esm",
  packages: "external",
  outfile: out,
  logLevel: "warning",
});

/* Optional argument: a single probe path. `npm run unit` (no argument) runs
 * the pure decision gate in tools/unit.ts, exactly as before. Passing a probe
 * path — `node tools/run-unit.mjs probe/a2aBridge.test.ts` — builds and runs
 * that ONE suite through the same esbuild pipeline run-all-probes.mjs uses
 * (same banner, same SI_ROOT define), so a standalone run behaves identically
 * to a gate run. Before this, arguments were silently ignored, which made
 * "run just this suite" lie about what it ran. */
const target = process.argv[2];
if (target) {
  const t = path.resolve(root, target);
  if (!fs.existsSync(t)) {
    console.error(`run-unit: no such file: ${target}`);
    process.exit(2);
  }
  const single = path.join(root, "tools", "single.built.mjs");
  buildSync({
    entryPoints: [t],
    bundle: true,
    platform: "node",
    format: "esm",
    packages: "external",
    banner: {
      js: 'import { createRequire as __mjCreateRequire } from "node:module"; const require = __mjCreateRequire(import.meta.url);',
    },
    define: { SI_ROOT: JSON.stringify(root) },
    outfile: single,
    logLevel: "warning",
  });
  try {
    execFileSync(process.execPath, [single], { cwd: root, stdio: "inherit" });
  } finally {
    fs.rmSync(single, { force: true });
  }
  if (!target.includes("unit.ts")) process.exit(0);
}

try {
  execFileSync(process.execPath, [out], { cwd: root, stdio: "inherit" });
} finally {
  fs.rmSync(out, { force: true });
}
