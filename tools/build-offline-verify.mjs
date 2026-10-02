#!/usr/bin/env node
/**
 * V11.7.1 — the offline verification pack.
 *
 * The 11.7. review could not certify the runtime test result from the shipped zip: it has
 * no node_modules, its environment could not `npm ci` offline, and bare `tsc --noEmit`
 * dies on missing React types before it produces a usable exit code. This tool answers
 * that caveat at the pack level: it pre-bundles EVERY probe suite (except its own
 * verifier, suite #40) into one self-contained .mjs per suite — no npm packages needed
 * at runtime, only Node — and writes verify/suites/ plus verify/MANIFEST.json (a sha256
 * per bundle). Anyone can then reproduce the full gate from the extracted zip:
 *
 *     node verify/run.mjs
 *
 * Design notes:
 *  - The suite list comes from tools/probe-list.mjs, the SAME module `npm test` uses —
 *    the pack and the dev gate cannot drift apart.
 *  - SI_ROOT is defined as "." and verify/run.mjs runs each bundle with cwd = the tree
 *    root, so the pack works from any extraction path (the dev runner instead bakes the
 *    absolute checkout path at build time).
 *  - Packages are bundled IN (the dev runner keeps them external for react); the one
 *    wrinkle is react-dom/server, a CommonJS package that require()s node builtins —
 *    the banner gives ESM output a real require (the well-known esbuild recipe; without
 *    it the v10Page suite dies on "Dynamic require of 'stream' is not supported").
 *  - probe/offlinePack.test.ts (suite #40) is deliberately NOT packed: it is the
 *    freshness gate for this pack itself (it rebuilds every bundle and byte-compares
 *    against the shipped ones), which only means something where the dev toolchain
 *    exists. Under `npm test` it runs; packed, it would only re-run the other suites.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { buildSync } from "esbuild";
import { listProbeSuites } from "./probe-list.mjs";

const require = createRequire(import.meta.url);
const esbuildPkg = require("esbuild/package.json");

const MODULE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PACK_SELF_VERIFIER = "offlinePack.test.ts";

/** The esbuild options every offline bundle is built with (shared with suite #40). */
export function offlineBundleOptions(entryPath, outfile) {
  return {
    entryPoints: [entryPath],
    bundle: true,
    platform: "node",
    format: "esm",
    define: { SI_ROOT: '"."' },
    banner: {
      js: 'import { createRequire as __mjCreateRequire } from "node:module"; const require = __mjCreateRequire(import.meta.url);',
    },
    outfile,
    logLevel: "error",
  };
}

/**
 * Build the pack. `root` is the release tree (passed explicitly because suite #40 calls
 * this from a bundle whose own location says nothing about the tree). `outDir` defaults
 * to <root>/verify/suites; a temp outDir is how suite #40 rebuilds for byte-comparison.
 * Returns the manifest it wrote (or would write).
 */
export function buildOfflinePack({ root, outDir }) {
  const probeDir = path.join(root, "probe");
  const dest = outDir ?? path.join(root, "verify", "suites");
  fs.mkdirSync(dest, { recursive: true });
  // 16.6.0: a deleted suite must not leave a ghost bundle — run.mjs walks the
  // directory, so any stale .mjs would run (and pass) as a phantom suite.
  for (const f of fs.readdirSync(dest)) {
    if (f.endsWith(".mjs")) fs.rmSync(path.join(dest, f));
  }
  const pkgJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  const versionSrc = fs.readFileSync(path.join(root, "src", "version.ts"), "utf8");
  const mjVersion = (versionSrc.match(/export const ENGINE_VERSION = "([^"]+)"/) ?? [null, pkgJson.version])[1];
  const productVersion = pkgJson.version;
  const files = listProbeSuites(probeDir).filter((f) => f !== PACK_SELF_VERIFIER);
  const suites = {};
  for (const f of files) {
    const outfile = path.join(dest, f.replace(/\.(ts|tsx)$/, ".mjs"));
    buildSync(offlineBundleOptions(path.join(probeDir, f), outfile));
    suites[path.basename(outfile)] = crypto.createHash("sha256").update(fs.readFileSync(outfile)).digest("hex");
  }
  /* SPEC BUNDLES (19.6.3). The reviewer could not run the batch generators in a tree
     without node_modules, because compiling a .ts spec needs esbuild. The DRIFT CHECK
     was always available offline — `probe/fedFleet` and `probe/reachBatch` build each
     batch from its spec and compare it to the shipped snapshot inside their bundles —
     but the generator itself was not. These three small bundles make it so: they are
     the compiled specs, and `tools/generate-batch.mjs` falls back to them when esbuild
     is absent. Same source, same compile, one artefact. */
  const specsDir = path.join(root, "verify", "specs");
  fs.mkdirSync(specsDir, { recursive: true });
  for (const f of fs.readdirSync(specsDir)) {
    if (f.endsWith(".mjs")) fs.rmSync(path.join(specsDir, f));
  }
  const specSources = {
    reach: path.join(root, "src", "engine", "reach", "batchSpec.ts"),
    federation: path.join(root, "src", "engine", "federation", "federationSpec.ts"),
    regulated: path.join(root, "src", "engine", "federation", "regulatedSpec.ts"),
    /* The two command-line entries that used to refuse without esbuild. Compiling
       them here is what lets a no-node_modules tree run them for real. */
    "drill-benchmark": path.join(root, "tools", "drill-benchmark.entry.ts"),
    "external-model-validation": path.join(root, "tools", "external-model-validation.entry.ts"),
  };
  const specs = {};
  for (const [name, entry] of Object.entries(specSources)) {
    const outfile = path.join(specsDir, `${name}.spec.mjs`);
    buildSync(offlineBundleOptions(entry, outfile));
    specs[`${name}.spec.mjs`] = crypto.createHash("sha256").update(fs.readFileSync(outfile)).digest("hex");
  }

  const manifest = {
    mjVersion,
    productVersion,
    esbuild: esbuildPkg.version,
    suiteCount: files.length,
    note: "Self-contained bundles of every probe suite except offlinePack.test.ts (the pack's own freshness gate). Run with: node verify/run.mjs from the tree root. Built by tools/build-offline-verify.mjs. verify/specs/ holds pre-compiled entry points (the three batch specs and two command-line tools) so they run without node_modules.",
    suites,
    specs,
  };
  if (!outDir) {
    fs.writeFileSync(path.join(root, "verify", "MANIFEST.json"), JSON.stringify(manifest, null, 2) + "\n");
  }
  return { manifest, dest, files };
}

/**
 * 19.8 — rewrite the MACHINE-READABLE half of verify/BUILD-INFO.txt from the
 * numbers this build actually produced.
 *
 * WHY THIS EXISTS
 * ---------------
 * BUILD-INFO.txt carried its suite and bundle counts as hand-typed prose in a
 * long historical narrative, and it drifted. The release shipped "163 probe
 * suites / 162 self-contained bundles" while the tree actually held 167 / 166,
 * and suite #40 — the anti-fabrication gate whose entire job is to catch
 * provenance drift — was failing on exactly that drift. A build record whose
 * numbers are typed by hand is a build record that will be wrong, and the gate
 * that should have noticed was the one tripping over it.
 *
 * So the counts are now GENERATED, and the narrative around them is preserved
 * verbatim: everything between the generated markers is left alone, and only the
 * marker block is rewritten. Hand-authored release history stays hand-authored;
 * only the facts a machine can check are machine-written.
 *
 * The pass/fail line is the second reason. It reports what the pack DID when it
 * was built, and `tools/rebuild-pack.mjs` is the only supported way to regenerate
 * it — it runs the gate first and refuses to write a green line over a red gate.
 */
const COUNT_LINE = /^gate: .*$/m;

export function buildInfoCounts(files) {
  const suites = files.length + 1; // + offlinePack.test.ts, which is never packed
  return { suites, bundles: files.length };
}

/**
 * The line the BUILD step writes: COUNTS ONLY, no pass claim.
 *
 * A count is a fact about what was built. "167 suites, 166 bundles" is true the
 * moment the bundles exist. "167 passed, 0 failed" is a claim about a gate
 * RESULT, and nothing here has run a gate. Writing the pass claim at build time
 * is how a build record ends up asserting a green gate it never saw — which is
 * why the two are separate lines written by two different steps, and why
 * `tools/rebuild-pack.mjs` refuses to stamp the pass claim over a red gate.
 */
export function countsLine(files) {
  const { suites, bundles } = buildInfoCounts(files);
  return `gate:  ${suites} probe suites, ${bundles} self-contained bundles (counts GENERATED by tools/build-offline-verify.mjs; the narrative below is hand-authored; gate result: run tools/rebuild-pack.mjs)`;
}

/** The line the GATE step writes, once a gate has actually passed. */
export function passLine(suites, bundles) {
  return `gate:  ${suites} probe suites - ${suites} passed, 0 failed (verify/run.mjs, ${bundles} self-contained bundles)`;
}

export function stampBuildInfo(root, files) {
  const p = path.join(root, "verify", "BUILD-INFO.txt");
  if (!fs.existsSync(p)) return { stamped: false, reason: "no BUILD-INFO.txt" };
  const { suites, bundles } = buildInfoCounts(files);
  const original = fs.readFileSync(p, "utf8");
  const line = countsLine(files);
  if (!COUNT_LINE.test(original)) {
    fs.appendFileSync(p, `\n${line}\n`);
    return { stamped: true, mode: "appended", suites, bundles };
  }
  fs.writeFileSync(p, original.replace(COUNT_LINE, line), "utf8");
  return { stamped: true, mode: "replaced", suites, bundles };
}

/**
 * Record a green gate. Called ONLY by tools/rebuild-pack.mjs after both the dev
 * gate and the zero-install offline gate have exited 0.
 */
export function stampGateResult(root, suites, bundles) {
  const p = path.join(root, "verify", "BUILD-INFO.txt");
  if (!fs.existsSync(p)) return false;
  const original = fs.readFileSync(p, "utf8");
  if (!COUNT_LINE.test(original)) return false;
  fs.writeFileSync(p, original.replace(COUNT_LINE, passLine(suites, bundles)), "utf8");
  return true;
}

// CLI mode: build the real pack in place.
//
// The guard CANNOT be `process.argv[1] === fileURLToPath(import.meta.url)` — the obvious
// form — because this module is ALSO imported by probe/offlinePack.test.ts, and once
// esbuild bundles it, import.meta.url IS the bundle's path, so argv[1] === import.meta.url
// holds there too. The first version of suite #40 shipped exactly that guard, and its own
// mutation test caught the consequence: the suite was silently REBUILDING the pack in
// place before comparing it to itself — a vacuous freshness check (the 11.7.0 lesson,
// repeated). Matching the module's own filename only fires when this file is run
// directly, never when it is bundled into something else.
const isCli = Boolean(process.argv[1] && path.resolve(process.argv[1]).endsWith("build-offline-verify.mjs"));
if (isCli) {
  const { manifest, files } = buildOfflinePack({ root: MODULE_ROOT });
  const stamp = stampBuildInfo(MODULE_ROOT, files);
  console.log(`offline pack: ${manifest.suiteCount} suites -> verify/suites (VH ${manifest.mjVersion}, esbuild ${manifest.esbuild})`);
  console.log(`BUILD-INFO.txt: ${stamp.mode} - ${stamp.suites} suites, ${stamp.bundles} bundles`);
  console.log("run it with:  node verify/run.mjs");
  if (stamp.mode === "replaced") {
    console.log("");
    console.log("NOTE: the generated line reports a green gate. That claim is only true if the");
    console.log("      gate is green - verify it now with:  node tools/rebuild-pack.mjs");
  }
}
