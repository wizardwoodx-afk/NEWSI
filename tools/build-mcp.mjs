#!/usr/bin/env node
/**
 * Build the MCP router engine bundle (tools/mcp-engine.mjs).
 *
 * Same discipline as the offline verification pack: one committed,
 * self-contained bundle that the stdio entry (tools/mcp.mjs) loads — no
 * build step needed at runtime, only Node. `probe/mcpRouter.test.ts`
 * rebuilds this bundle in a temp dir and byte-compares it against the
 * shipped one, so a stale bundle fails the gate.
 *
 * 19.6.3 — DEPENDENCIES ARE BUNDLED IN (no `--packages=external`). Shipping the
 * engine with `import "zod"` left it unable to start in a tree without
 * node_modules, which is how a reviewer received the archive: the MCP host —
 * and every suite that spawns it — could only run after `npm ci`. The engine is
 * the product's own transport, so it now carries what it needs. zod is MIT; the
 * bundled copy is noted in NOTICE.
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
// The esbuild JavaScript API is used rather than spawning the binary. The
// binary is `esbuild` on unix and `esbuild.cmd` on Windows, so a hardcoded
// spawn target made `npm run mcp:build` fail with ENOENT on Windows. The
// committed engine bundle therefore could not be rebuilt on this machine, and
// probe/mcpRouter.test.ts correctly failed the gate on a stale bundle. The API
// has no such platform split and needs no PATH lookup.
import { build } from "esbuild";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
await build({
  entryPoints: [path.join(root, "src/selfimpulse/engine/mcpRouter.ts")],
  bundle: true,
  platform: "node",
  format: "esm",
  outfile: path.join(root, "tools/mcp-engine.mjs"),
  logLevel: "warning",
  absWorkingDir: root,
});
const bundlePath = path.join(root, "tools", "mcp-engine.mjs");
const sha = createHash("sha256").update(readFileSync(bundlePath)).digest("hex");
writeFileSync(path.join(root, "tools", "mcp-engine.sha256"), `${sha}  tools/mcp-engine.mjs\n`);
console.log("mcp engine bundle: tools/mcp-engine.mjs + tools/mcp-engine.sha256 (commit both; probe/mcpRouter pins them)");
