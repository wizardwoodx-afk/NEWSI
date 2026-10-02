#!/usr/bin/env node
/**
 * generate-batch.mjs — compile a registered specialist bench from its spec.
 *
 *   node tools/generate-batch.mjs <batch>            # write the snapshot
 *   node tools/generate-batch.mjs <batch> --check    # fail if it has drifted
 *   node tools/generate-batch.mjs --all --check      # every batch, one line each
 *
 * Batches: reach · federation · regulated
 *
 * ONE GENERATOR, THREE BATCHES. The first two batches each had their own
 * near-identical script; a third would have made three copies of the same
 * compile step. The per-batch entry points are kept (`generate-reach-batch.mjs`,
 * `generate-federation-batch.mjs`) as thin shims so every command named in a
 * probe, a doc or a build log still works.
 *
 * The generated file is the REVIEWED artefact's shadow: the spec is what a
 * person reads and edits, the snapshot is what the app imports, and `--check`
 * fails on a single byte of drift between them.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createHash } from "node:crypto";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const BATCHES = {
  reach: {
    spec: ["src", "engine", "reach", "batchSpec.ts"],
    out: ["src", "engine", "reach", "reachBatch.ts"],
    build: "buildReachBatch", census: "reachBatchCensus",
    exportName: "REACH_BATCH_SPECIALISTS",
    provenance: "REACH_BATCH_PROVENANCE",
    title: "REACH · BATCH — the 200-specialist industry bench (GENERATED, 19.5.6)",
    what: "forty *industry* domains",
    headline: "established 1,150 + registered 640 = fleet 1,790",
  },
  federation: {
    spec: ["src", "engine", "federation", "federationSpec.ts"],
    out: ["src", "engine", "federation", "federationBatch.ts"],
    build: "buildFederationBatch", census: "federationBatchCensus",
    exportName: "FEDERATION_BATCH_SPECIALISTS",
    provenance: "FEDERATION_BATCH_PROVENANCE",
    title: "FEDERATION · BATCH — the 210-specialist practice bench (GENERATED, 19.6.0)",
    what: "forty-two *engineering, practice and professional* domains",
    headline: "established 1,150 + registered 640 = fleet 1,790",
  },
  regulated: {
    spec: ["src", "engine", "federation", "regulatedSpec.ts"],
    out: ["src", "engine", "federation", "regulatedBatch.ts"],
    build: "buildRegulatedBatch", census: "regulatedBatchCensus",
    exportName: "REGULATED_BATCH_SPECIALISTS",
    provenance: "REGULATED_BATCH_PROVENANCE",
    title: "FEDERATION · REGULATED BATCH — the 230-specialist regulated-field bench (GENERATED, 19.6.2)",
    what: "forty-six *regulated-field* domains",
    headline: "established 1,150 + registered 640 = fleet 1,790",
  },
};

/**
 * Load a spec. Two paths, same source:
 *
 *   1. compile it here (needs esbuild — the normal developer case);
 *   2. fall back to the PRE-COMPILED bundle in `verify/specs/`, which ships with the
 *      offline pack, so the drift check runs in a tree with no node_modules at all.
 *
 * The fallback was added because a reviewer could not run the generators in the
 * uploaded archive (no esbuild). The drift CHECK was already available offline — the
 * batch probes build each batch from its spec and compare it to the snapshot — but the
 * command a maintainer reaches for was not. Now both work.
 *
 * The fallback NAMES ITSELF in the output: a verdict that came from a pre-compiled
 * bundle says so, and the bundle's sha256 is in verify/MANIFEST.json, so the reader can
 * see it is the spec that shipped rather than one recompiled on the spot.
 */
async function loadSpec(rel, key) {
  const spec = path.join(root, ...rel);
  const built = path.join(root, "verify", "specs", `${key}.spec.mjs`);
  let tmp = null;
  try {
    /* A LAZY import, deliberately. A static `import { buildSync } from "esbuild"` makes
       the whole module fail to LOAD when esbuild is absent — before any fallback can
       run — which is exactly the reviewer's case. */
    const { buildSync } = await import("esbuild");
    tmp = path.join(os.tmpdir(), `si-batch-${key}-${process.pid}.mjs`);
    buildSync({ entryPoints: [spec], bundle: true, platform: "node", format: "esm", packages: "external", outfile: tmp, logLevel: "error" });
    const mod = await import(pathToFileURL(tmp).href);
    fs.unlinkSync(tmp);
    return { mod, source: "compiled from source (esbuild)" };
  } catch (err) {
    if (tmp) { try { fs.unlinkSync(tmp); } catch { /* nothing to clean */ } }
    if (!fs.existsSync(built)) {
      console.error(`cannot load ${key}: esbuild is unavailable AND ${path.relative(root, built)} is missing.`);
      console.error("  In a tree with dependencies:  npm ci && node tools/generate-batch.mjs " + key);
      console.error("  In the offline pack:           node tools/build-offline-verify.mjs   (writes verify/specs/)");
      throw err;
    }
    const expected = (() => {
      try {
        const m = JSON.parse(fs.readFileSync(path.join(root, "verify", "MANIFEST.json"), "utf8"));
        return m.specs?.[`${key}.spec.mjs`];
      } catch { return undefined; }
    })();
    const actual = createHash("sha256").update(fs.readFileSync(built)).digest("hex");
    if (expected && expected !== actual) {
      console.error(`${path.relative(root, built)} does not match verify/MANIFEST.json (${actual.slice(0, 12)}… vs ${expected.slice(0, 12)}…) — the pack is stale, rebuild it.`);
      process.exit(1);
    }
    const mod = await import(pathToFileURL(built).href);
    return { mod, source: `pre-compiled ${path.relative(root, built)}${expected ? " (sha256 matches MANIFEST)" : ""}` };
  }
}

function render(batch, spec, entries, census) {
  const stations = spec.REACH_BATCH_STATIONS.join(" / ");
  const body = entries
    .map((e) =>
      [
        "  {",
        `    id: ${JSON.stringify(e.id)},`,
        `    name: ${JSON.stringify(e.name)},`,
        `    category: ${JSON.stringify(e.category)},`,
        "    capabilities: [",
        ...e.capabilities.map((c) => `      ${JSON.stringify(c)},`),
        "    ],",
        `    keywords: ${JSON.stringify(e.keywords)},`,
        `    riskTier: ${JSON.stringify(e.riskTier)},`,
        `    systemPrompt:\n      ${JSON.stringify(e.systemPrompt)},`,
        `    provenance: ${JSON.stringify(e.provenance)},`,
        "  },",
      ].join("\n"),
    )
    .join("\n");

  return `/**
 * ${batch.title}
 *
 * DO NOT EDIT BY HAND. Compiled from \`${path.basename(batch.spec[batch.spec.length - 1])}\`, which is the
 * reviewed artefact: ${batch.what} × five stations of work
 * (${stations}), each entry with its own capabilities, routing vocabulary,
 * honest risk tier and system prompt. Regenerate with:
 *
 *     node tools/generate-batch.mjs ${Object.keys(BATCHES).find((k) => BATCHES[k] === batch)}
 *
 * The batch's probe fails if this snapshot and the spec disagree.
 *
 * Census at generation time: ${census.total} entries over ${census.domains} domains —
 * ${census.byRisk.safe} safe / ${census.byRisk.risky} risky / ${census.byRisk.critical} critical,
 * stations ${census.byStation.assess}/${census.byStation.design}/${census.byStation.build}/${census.byStation.verify}/${census.byStation.sustain}.
 * Provenance: ${spec[batch.provenance]}.
 *
 * Reported through \`federation/fleet.ts\`: ${batch.headline}, with the routed
 * number always printed first.
 */
import type { Specialist } from "../types";

export const ${batch.exportName}: Specialist[] = [
${body}
];
`;
}

async function runBatch(key, argv = process.argv.slice(2)) {
  const batch = BATCHES[key];
  if (!batch) throw new Error(`unknown batch "${key}" — known: ${Object.keys(BATCHES).join(", ")}`);
  const check = argv.includes("--check");
  const { mod: spec, source } = await loadSpec(batch.spec, key);
  if (argv.includes("--verbose")) console.log(`${key}: spec loaded from ${source}`);
  const entries = spec[batch.build]();
  const census = spec[batch.census](entries);
  const next = render(batch, spec, entries, census);
  const out = path.join(root, ...batch.out);
  const prev = fs.existsSync(out) ? fs.readFileSync(out, "utf8") : null;

  if (check) {
    if (prev === next) {
      console.log(`${key} batch: OK — ${census.total} entries over ${census.domains} domains, snapshot matches the spec`);
      return true;
    }
    console.log(`${key} batch: DRIFT — ${path.relative(root, out)} does not match ${path.basename(batch.spec[batch.spec.length - 1])}`);
    console.log(`  regenerate with: node tools/generate-batch.mjs ${key}`);
    return false;
  }
  if (prev === next) {
    console.log(`${key} batch: unchanged — ${census.total} entries already current`);
    return true;
  }
  fs.writeFileSync(out, next);
  console.log(`${key} batch: wrote ${path.relative(root, out)} — ${census.total} entries over ${census.domains} domains`);
  console.log(`  census: ${census.byRisk.safe} safe / ${census.byRisk.risky} risky / ${census.byRisk.critical} critical`);
  return true;
}

export { runBatch, BATCHES };

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  const argv = process.argv.slice(2);
  const keys = argv.includes("--all") ? Object.keys(BATCHES) : argv.filter((a) => !a.startsWith("--"));
  if (keys.length === 0) {
    console.error("usage: node tools/generate-batch.mjs <reach|federation|regulated|--all> [--check]");
    process.exit(2);
  }
  let ok = true;
  for (const key of keys) ok = (await runBatch(key, argv)) && ok;
  process.exit(ok ? 0 : 1);
}
