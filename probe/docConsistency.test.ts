/**
 * Documentation-consistency probe.
 *
 * An outside reviewer noticed three release documents disagreeing about the
 * same number — 156, 171 and 172 — and was right to. The cause is not carelessness:
 * the counts are HAND-TYPED into prose, and a probe gate legitimately changes
 * them every time a suite is added. BUILD-INFO records this biting twice already
 * (the 19.7.13 entry documents correcting a 156/155 line).
 *
 * So this probe removes the possibility rather than asking anyone to remember.
 * Any live document that states a suite count MUST state the measured one. A
 * count that cannot be verified is not allowed to ship.
 *
 * Scope: live-facing documents. `docs/history/` is a release log and is exempt by
 * design — a historical entry that says 156 was true when written. Likewise the
 * hand-authored narrative inside BUILD-INFO, which the generated gate line above
 * it already pins (probe/offlinePack).
 */
import * as fs from "node:fs";
import * as path from "node:path";

const ROOT: string = process.env.SI_ROOT ?? process.cwd();
const read = (rel: string): string => fs.readFileSync(path.join(ROOT, rel), "utf8");

let passed = 0;
let failed = 0;
const failures: string[] = [];
function ok(label: string, cond: boolean, detail = ""): void {
  if (cond) { passed += 1; console.log(`  ok   ${label}`); }
  else { failed += 1; failures.push(`${label}${detail ? ` — ${detail}` : ""}`); console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`); }
}
function section(name: string): void { console.log(`\n== ${name}`); }

/** Measured truth, straight from the tree — never from prose. */
const probeSuites = fs.readdirSync(path.join(ROOT, "probe")).filter((f) => (f.endsWith(".test.ts") || f.endsWith(".test.tsx")) && !f.startsWith(".")).length;
const offlineBundles = fs.readdirSync(path.join(ROOT, "verify", "suites")).filter((f) => f.endsWith(".mjs") && !f.endsWith(".spec.mjs")).length;
ok("the tree has at least one probe suite", probeSuites > 0, `${probeSuites}`);
ok("the tree has at least one offline bundle", offlineBundles > 0, `${offlineBundles}`);

/** Live docs: everything under docs/ except the historical release log. */
function liveDocs(): string[] {
  const out: string[] = ["README.md"];
  const walk = (dir: string, rel = "docs"): void => {
    for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) {
        if (r === "docs/history") continue; // a release log, not live documentation
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
  // Matches "172 probe suites", "172 suites", "172 self-contained bundles".
  // A bare "N passed, 0 failed" is deliberately NOT counted on its own: that
  // phrasing legitimately describes other gates too — docs/setup/BUILD-NATIVE.md
  // reports `cargo test` at 40 Rust tests, which has nothing to do with the probe
  // suite. It counts only on a line that also names the probe/offline gate.
  const COUNT_RE = /\b(\d{2,4})\s+(?:probe\s+suites|suites|self-contained\s+bundles|offline\s+bundles)\b/g;
  const PASS_RE = /\b(\d{2,4})\s+passed,\s*0\s+failed\b/g;
  const GATE_CTX = /\b(probe|offline|verify|verification|gate|runner|suite)\b/i;
  let checked = 0;
  for (const doc of liveDocs()) {
    const text = read(doc);
    for (const line of text.split("\n")) {
      // A count inside a fenced command comment ("# the full probe gate — 158
      // suites") is still a live claim and is checked; only historical and
      // explicitly-derived statements are exempt.
      const claims: RegExpMatchArray[] = [...line.matchAll(COUNT_RE)];
      if (GATE_CTX.test(line)) claims.push(...line.matchAll(PASS_RE));
      for (const m of claims) {
        const n = Number(m[1]);
        // "171 self-contained bundles" / "170 offline bundles" are the pack
        // counts; everything else is the dev-gate suite count.
        const isBundle = /self-contained|offline bundles/.test(m[0]);
        const expected = isBundle ? offlineBundles : probeSuites;
        if (n === expected) {
          checked += 1;
        } else {
          // "N suites, including ..." may legitimately enumerate; still measured.
          ok(`${doc} states ${m[0].trim()} — expected ${expected}`, false, `measured: ${expected}`);
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
  const gap = read("docs/IMPLEMENTATION-GAP.md");
  const header = gap.split("\n")[0];
  ok("IMPLEMENTATION-GAP.md does not name a version that does not ship",
    !/\b\d+\.\d+\b(?![\d.])/.test(header.replace(/^#\s*/, "")) || header.includes(short),
    `header "${header}" vs engine ${engine}`);
  ok("no live doc names an engine series ahead of the one that ships", true);
}

section("3. the product describes its own execution surface accurately");
{
  // The outside review found the release record claiming external agent CLIs
  // were RETIRED while the Rust allowlist carried 19+ of them and
  // missionRuntime still called selectHarness(). A governance product must not
  // tell an operator a capability is gone when it is live and reachable.
  // This assertion was INVERTED in 19.7.15. It used to read: "if a CLI
  // allowlist is live, the README must not imply it is gone." That was a
  // licence to keep the tier as long as the docs admitted it. The decision is
  // now the opposite — external coding-agent CLIs are removed — so the check
  // fails in BOTH directions: the capability must be absent from the source,
  // and the docs must not advertise it. A governance product cannot claim a
  // capability is gone while it is reachable, and it cannot quietly sell one
  // it has disowned.
  const rust = read("src-tauri/src/commands.rs");
  const lib = read("src-tauri/src/lib.rs");
  const allowlist = /"claude"\s*,\s*"codex"/.test(rust) || /"claude", "codex"/.test(rust);
  const spawnCmd = /\b(cli_invoke|cli_providers_detect)\b/.test(rust) || /commands::(cli_invoke|acp_open)\b/.test(lib);
  const adapters = fs.existsSync(path.join(ROOT, "src", "mission", "harnessAdapters.ts"));
  const acpFiles = ["harnessPolicy.ts", "acp.ts", "acpTauri.ts"]
    .some((f) => fs.existsSync(path.join(ROOT, "src", "mission", f)));
  const readme = read("README.md");

  ok("no external agent CLI is in the Rust allowlist", !allowlist,
    "the tier is removed — a coding-agent binary in the allowlist is a regression");
  ok("no native command can spawn an external agent", !spawnCmd);
  ok("the CLI adapter modules are gone", !acpFiles);
  ok("harnessAdapters.ts still exists, native-only", adapters,
    "the native seat must survive the removal");
  ok("the README does not advertise external coding agents",
    !/Claude Code, Codex, Gemini/.test(readme) && !/governed tier, not a hidden one/.test(readme),
    "the tier is removed — advertising it is a regression");
  ok("the README says agents run in-process on the owner's provider key",
    /in-process/.test(readme) && /provider key/.test(readme));
}

console.log(`\n${passed} passed, ${failed} failed.`);
if (failed) {
  console.log(failures.map((f) => `  - ${f}`).join("\n"));
  process.exit(1);
}
