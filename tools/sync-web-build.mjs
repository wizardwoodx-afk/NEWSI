#!/usr/bin/env node
/**
 * sync-web-build.mjs — mirror dist/ into web-build/, cross-platform.
 *
 * WHY THIS FILE EXISTS. The script used to be:
 *
 *     vite build && rm -rf web-build && cp -r dist web-build
 *
 * `rm` and `cp` are POSIX binaries. On Windows they are not on PATH, so the
 * build SUCCEEDED and the copy step still failed, taking the whole npm script
 * with it:
 *
 *     'rm' is not recognized as an internal or external command
 *
 * That is the worst shape for a build step — the expensive part worked, the
 * bundle landed in dist/, and the command still exited 1, so a deploy pipeline
 * gating on it would report failure for a tree that actually built. The mirror
 * is done here in Node instead, which is already a dependency of the project and
 * behaves identically on linux, macOS and windows.
 *
 * `web-build/` is the tree docs/deploy instructions point at; `dist/` is what
 * vercel.json serves. Both end up byte-identical, and dist/ is never touched.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = path.join(root, "dist");
const dest = path.join(root, "web-build");

if (!fs.existsSync(src)) {
  // A clear message beats ENOENT noise from a bare `cp`.
  console.error("web-build: dist/ does not exist — run `vite build` first.");
  process.exit(1);
}

fs.rmSync(dest, { recursive: true, force: true });
fs.cpSync(src, dest, { recursive: true });

const count = (d) => fs.readdirSync(d, { withFileTypes: true }).reduce(
  (n, e) => n + (e.isDirectory() ? count(path.join(d, e.name)) : 1),
  0,
);
const bytes = (d) => fs.readdirSync(d, { withFileTypes: true }).reduce(
  (n, e) => {
    const p = path.join(d, e.name);
    return n + (e.isDirectory() ? bytes(p) : fs.statSync(p).size);
  },
  0,
);

console.log(`web-build: mirrored ${count(dest)} files (${(bytes(dest) / 1048576).toFixed(2)} MB) from dist/`);