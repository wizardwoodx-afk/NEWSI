#!/usr/bin/env node
/**
 * Build the A2A host engine bundle (tools/si-host-engine.mjs).
 *
 * Same discipline as the MCP router and the offline verification pack: one
 * committed, self-contained bundle that the launcher (tools/si-host.mjs)
 * loads — no build step at runtime, only Node. `probe/a2aRuntime.test.ts`
 * rebuilds this bundle in a temp dir and byte-compares it against the shipped
 * one, so a stale bundle (source changed, engine not rebuilt) fails the gate
 * instead of silently shipping an unmounted or out-of-date listener.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
// The esbuild JavaScript API is used rather than spawning the binary. The
// binary is `esbuild` on unix and `esbuild.cmd` on Windows, so a hardcoded
// spawn target made `npm run host:build` fail with ENOENT on Windows. The
// committed host engine therefore could not be rebuilt on this machine, and
// probe/a2aRuntime.test.ts correctly failed its gate on a stale bundle. This is
// the same defect that was fixed in tools/build-mcp.mjs.
import { build } from "esbuild";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
await build({
  entryPoints: [path.join(root, "tools/si-host.entry.ts")],
  bundle: true,
  platform: "node",
  format: "esm",
  packages: "external",
  outfile: path.join(root, "tools/si-host-engine.mjs"),
  logLevel: "warning",
  absWorkingDir: root,
});

const bundlePath = path.join(root, "tools", "si-host-engine.mjs");
const sha = createHash("sha256").update(readFileSync(bundlePath)).digest("hex");
writeFileSync(path.join(root, "tools", "si-host-engine.sha256"), `${sha}  tools/si-host-engine.mjs\n`);
console.log("a2a host engine: tools/si-host-engine.mjs + tools/si-host-engine.sha256 (commit both; probe/a2aRuntime pins them)");
