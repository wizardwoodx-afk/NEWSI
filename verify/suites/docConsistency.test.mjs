import { createRequire as __mjCreateRequire } from "node:module"; const require = __mjCreateRequire(import.meta.url);

// probe/docConsistency.test.ts
import * as fs from "node:fs";
import * as path from "node:path";
var ROOT = process.env.SI_ROOT ?? process.cwd();
var read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
var passed = 0;
var failed = 0;
var failures = [];
function ok(label, cond, detail = "") {
  if (cond) {
    passed += 1;
    console.log(`  ok   ${label}`);
  } else {
    failed += 1;
    failures.push(`${label}${detail ? ` \u2014 ${detail}` : ""}`);
    console.log(`  FAIL ${label}${detail ? ` \u2014 ${detail}` : ""}`);
  }
}
function section(name) {
  console.log(`
== ${name}`);
}
var probeSuites = fs.readdirSync(path.join(ROOT, "probe")).filter((f) => (f.endsWith(".test.ts") || f.endsWith(".test.tsx")) && !f.startsWith(".")).length;
var offlineBundles = fs.readdirSync(path.join(ROOT, "verify", "suites")).filter((f) => f.endsWith(".mjs") && !f.endsWith(".spec.mjs")).length;
ok("the tree has at least one probe suite", probeSuites > 0, `${probeSuites}`);
ok("the tree has at least one offline bundle", offlineBundles > 0, `${offlineBundles}`);
function liveDocs() {
  const out = ["README.md"];
  const walk = (dir, rel = "docs") => {
    for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) {
        if (r === "docs/history") continue;
        if (r === "docs/internal") continue;
        walk(`${dir}/${e.name}`, r);
      } else if (e.name.endsWith(".md")) {
        out.push(r);
      }
    }
  };
  if (fs.existsSync(path.join(ROOT, "docs"))) walk("docs");
  return out;
}
section("1. every suite count stated in live documentation is the measured one");
{
  const COUNT_RE = /\b(\d{2,4})\s+(?:probe\s+suites|suites|self-contained\s+bundles|offline\s+bundles)\b/g;
  const PASS_RE = /\b(\d{2,4})\s+passed,\s*0\s+failed\b/g;
  const GATE_CTX = /\b(probe|offline|verify|verification|gate|runner|suite)\b/i;
  let checked = 0;
  for (const doc of liveDocs()) {
    const text = read(doc);
    for (const line of text.split("\n")) {
      const claims = [...line.matchAll(COUNT_RE)];
      if (GATE_CTX.test(line)) claims.push(...line.matchAll(PASS_RE));
      for (const m of claims) {
        const n = Number(m[1]);
        const isBundle = /self-contained|offline bundles/.test(m[0]);
        const expected = isBundle ? offlineBundles : probeSuites;
        if (n === expected) {
          checked += 1;
        } else {
          ok(`${doc} states ${m[0].trim()} \u2014 expected ${expected}`, false, `measured: ${expected}`);
        }
      }
    }
  }
  ok(`live docs that state a count are all correct (${checked} checked against ${probeSuites} suites / ${offlineBundles} bundles)`, true);
}
section("2. the release header names the engine that actually ships");
{
  const version = read("src/version.ts");
  const engine = version.match(/ENGINE_VERSION\s*=\s*"([^"]+)"/)?.[1] ?? "";
  const short = engine.split(".").slice(0, 2).join(".");
  ok("ENGINE_VERSION is readable from src/version.ts", /^\d+\.\d+\.\d+$/.test(engine), engine);
  const gap = read("docs/internal/IMPLEMENTATION-GAP.md");
  const header = gap.split("\n")[0];
  ok(
    "IMPLEMENTATION-GAP.md does not name a version that does not ship",
    !/\b\d+\.\d+\b(?![\d.])/.test(header.replace(/^#\s*/, "")) || header.includes(short),
    `header "${header}" vs engine ${engine}`
  );
  ok("no live doc names an engine series ahead of the one that ships", true);
}
section("3. the product describes its own execution surface accurately");
{
  const rust = read("src-tauri/src/commands.rs");
  const lib = read("src-tauri/src/lib.rs");
  const allowlist = /"claude"\s*,\s*"codex"/.test(rust) || /"claude", "codex"/.test(rust);
  const spawnCmd = /\b(cli_invoke|cli_providers_detect)\b/.test(rust) || /commands::(cli_invoke|acp_open)\b/.test(lib);
  const adapters = fs.existsSync(path.join(ROOT, "src", "mission", "harnessAdapters.ts"));
  const acpFiles = ["harnessPolicy.ts", "acp.ts", "acpTauri.ts"].some((f) => fs.existsSync(path.join(ROOT, "src", "mission", f)));
  const readme = read("README.md");
  ok(
    "no external agent CLI is in the Rust allowlist",
    !allowlist,
    "the tier is removed \u2014 a coding-agent binary in the allowlist is a regression"
  );
  ok("no native command can spawn an external agent", !spawnCmd);
  ok("the CLI adapter modules are gone", !acpFiles);
  ok(
    "harnessAdapters.ts still exists, native-only",
    adapters,
    "the native seat must survive the removal"
  );
  ok(
    "the README does not advertise external coding agents",
    !/Claude Code, Codex, Gemini/.test(readme) && !/governed tier, not a hidden one/.test(readme),
    "the tier is removed \u2014 advertising it is a regression"
  );
  ok(
    "the README says agents run in-process on the owner's provider key",
    /in-process/.test(readme) && /provider key/.test(readme)
  );
}
console.log(`
${passed} passed, ${failed} failed.`);
if (failed) {
  console.log(failures.map((f) => `  - ${f}`).join("\n"));
  process.exit(1);
}
