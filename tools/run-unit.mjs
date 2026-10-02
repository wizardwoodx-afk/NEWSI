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

try {
  execFileSync(process.execPath, [out], { cwd: root, stdio: "inherit" });
} finally {
  fs.rmSync(out, { force: true });
}
