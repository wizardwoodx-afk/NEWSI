import { createRequire as __mjCreateRequire } from "node:module"; const require = __mjCreateRequire(import.meta.url);

// probe/noExternalCli.test.ts
import * as fs from "node:fs";
import * as path from "node:path";
var { readdirSync, readFileSync: readFileSync2 } = fs;
var { join: join2 } = path;
var ROOT = process.env.SI_ROOT ?? process.cwd();
var read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
var exists = (rel) => fs.existsSync(path.join(ROOT, rel));
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
var EXTERNAL_BINS = [
  "claude",
  "codex",
  "opencode",
  "openclaude",
  "copilot",
  "cursor-agent",
  "grok",
  "cline",
  "kilo",
  "qwen",
  "gemini",
  "aider",
  "goose",
  "amazonq",
  "kiro-cli",
  "amp",
  "crush",
  "openhands",
  "droid",
  "kimi",
  "auggie",
  "warp"
];
section("1. the native handlers that could spawn an external agent are gone");
{
  const rust = read("src-tauri/src/commands.rs");
  for (const sym of [
    "cli_invoke",
    "cli_providers_detect",
    "ALLOWED_CLI_BINS",
    "harness_argv",
    "custom_harness_load",
    "custom_harness_store",
    "custom_harness_validate",
    "CustomHarness",
    "acp_open",
    "acp_send",
    "acp_recv",
    "acp_close"
  ]) {
    ok(`commands.rs no longer defines ${sym}`, !new RegExp(`\\b${sym}\\b`).test(rust));
  }
  const lib = read("src-tauri/src/lib.rs");
  for (const c of [
    "cli_invoke",
    "cli_providers_detect",
    "custom_harness_list",
    "custom_harness_save",
    "custom_harness_delete",
    "acp_open",
    "acp_send",
    "acp_recv"
  ]) {
    ok(`lib.rs no longer registers ${c}`, !lib.includes(`commands::${c}`));
  }
  ok("acp.rs \u2014 the external agent wire \u2014 is deleted", !exists("src-tauri/src/acp.rs"));
}
section("2. no external agent binary is in any allowlist");
{
  const rust = read("src-tauri/src/commands.rs");
  ok("SHELL_ALLOWED_PROGRAMS still exists, as an alias of the one shared list", /SHELL_ALLOWED_PROGRAMS: &\[&str\] = grants::DEV_TOOLS;/.test(rust));
  const allow = read("src-tauri/src/grants.rs").match(/pub const DEV_TOOLS: &\[&str\] = &\[([\s\S]*?)\];/);
  ok("the shared dev-tool list exists", !!allow);
  const list = allow ? allow[1] : "";
  for (const bin of EXTERNAL_BINS) {
    ok(`shell_exec does not allow ${bin}`, !new RegExp(`"${bin}"`).test(list), list.slice(0, 80));
  }
  ok("the dev-tool seat is kept (node/npm/cargo/git)", /"node"/.test(list) && /"git"/.test(list));
  ok(
    "shell_exec's refusal no longer mentions custom harnesses",
    !/custom harness/i.test(rust.slice(rust.indexOf("SHELL_ALLOWED_PROGRAMS"), rust.indexOf("SHELL_ALLOWED_PROGRAMS") + 1400))
  );
}
section("3. the TypeScript subsystem is gone from the tree");
{
  for (const f of ["src/mission/harnessPolicy.ts", "src/mission/acp.ts", "src/mission/acpTauri.ts"]) {
    ok(`${f} is deleted`, !exists(f));
  }
  const ipc = read("src/ipc/client.ts");
  for (const m of ["cliInvoke", "cliProvidersDetect", "customHarnessList", "customHarnessSave", "customHarnessDelete"]) {
    ok(`ipc.client no longer exposes ${m}`, !new RegExp(`\\b${m}:`).test(ipc));
  }
}
section("3b. the Antigravity amendment holds to its own terms (19.8.0)");
{
  ok("src/auth/antigravity.ts exists \u2014 the amendment describes a real thing", exists("src/auth/antigravity.ts"));
  const agy = read("src/auth/antigravity.ts").replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
  ok("it never spawns a process", !/child_process|spawn\(|execFile|execSync|Command::new/.test(agy));
  ok(
    "it holds no Google credential, so it is not an authenticated agent",
    !/access_token|accessToken|refresh_token|client_secret|accounts\.google\.com/.test(agy)
  );
  ok(
    "it is a provider seam, not an agent seat: it exposes no agent engine",
    !/harness|seatArgv|agentLoop|autonomyArms/.test(agy)
  );
  const rust = read("src-tauri/src/commands.rs");
  const allow = read("src-tauri/src/grants.rs").match(/pub const DEV_TOOLS: &\[&str\] = &\[([\s\S]*?)\];/);
  const list = allow ? allow[1] : "";
  ok("shell_exec cannot launch the Antigravity runtime", !/"agy"/.test(list) && !/antigravity/i.test(list));
  ok(
    "there is still no acp_* command in the native handler",
    !/\bacp_(open|send|recv|close)\b/.test(rust)
  );
}
section("4. the registry offers only in-process engines");
{
  const dom = read("src/domain/harness.ts");
  const union = dom.match(/export type HarnessId =([^;]+);/)?.[1] ?? "";
  ok(
    "HarnessId admits only the native runtimes",
    /"hermes"/.test(union) && /"llm"/.test(union),
    union.trim()
  );
  for (const gone of ["claude", "codex", "gemini", "cursor", "cline", "grok", "opencode", "acp"]) {
    ok(`HarnessId no longer admits ${gone}`, !new RegExp(`"${gone}"`).test(union));
  }
  const catalog = dom.slice(dom.indexOf("export const HARNESSES"));
  for (const gone of EXTERNAL_BINS) {
    ok(`the HARNESSES catalog has no ${gone} spec`, !new RegExp(`id: "${gone}"`).test(catalog));
  }
  ok(
    "no retired-id deny-list remains \u2014 unknown ids route straight to the native default",
    !/RETIRED_HARNESSES/.test(dom) && !/isRetiredHarness/.test(dom)
  );
  ok(
    "no custom-harness machinery remains anywhere in the file",
    !/CustomHarness|customHarnessId|validateCustomHarness|isCustomHarness|setCustomHarnesses|getCustomHarness|listCustomHarnesses/.test(dom)
  );
  ok(
    "no `custom:` id is even constructible",
    !/custom:\$\{/.test(dom)
  );
  ok(
    "no removed engine id appears in any node config option list",
    !/options: \[[^\]]*"(claude|codex|opencode|cursor|grok|cline|kilo)"/.test(read("src/domain/nodeLibrary.ts"))
  );
  ok(
    "the default harness for a new agent node is the native engine",
    !/harness \|\| "claude"/.test(read("src/graph/factory.ts"))
  );
}
section("5. nothing spawns a third-party agent process");
{
  const adapters = read("src/mission/harnessAdapters.ts");
  ok("the CliHarness adapter class is gone", !/class CliHarness/.test(adapters));
  ok("the CustomCliHarness adapter class is gone", !/class CustomCliHarness/.test(adapters));
  ok("the ACP adapter is not registered", !/AcpHarness/.test(adapters));
  ok("the vendor PROFILES table is gone", !/PROFILES/.test(adapters));
  ok(
    "a seat naming a removed engine resolves to null, not to a stub",
    /return registry\.get\(id\) \?\? null/.test(adapters)
  );
  const deps = read("src/mission/hostDeps.ts");
  ok("hostRunnerDeps resolves no agent binary", /resolveBin: async \(_bin\) => null/.test(deps));
  ok(
    "hostRunnerDeps refuses to invoke an agent CLI in words",
    /external agent CLIs are removed/.test(deps)
  );
  const brain = read("src/selfimpulse/engine/brainSeam.ts");
  ok("the brain seam refuses to spawn a CLI process", /external agent CLIs are removed/.test(brain));
  ok("the brain seam no longer calls ipc.cliInvoke", !/ipc\.cliInvoke/.test(brain));
}
section("6. the product tells the truth about what it is");
{
  const readme = read("README.md");
  ok(
    "the README does not offer external coding agents",
    !/Claude Code, Codex, Gemini|governed tier, not a hidden one/.test(readme)
  );
  const story = exists("docs/STORY.md") ? read("docs/STORY.md") : "";
  ok("STORY.md no longer claims a roster of agent CLIs", !/25 agent CLIs/.test(story));
  const info = read("verify/BUILD-INFO.txt");
  ok(
    "the build record states the removal rather than promising the tier",
    /EXTERNAL CODING-AGENT CLIs .* REMOVED|REMOVED FROM THE TREE|are removed/i.test(info)
  );
  ok(
    "the build record does not advertise the tier as a feature",
    !/governed external-harness tier/.test(info)
  );
  const cliNames = ["claude-code", "@openai/codex", "opencode-ai", "aider", "continue-dev"];
  const offenders = [];
  const walkDocs = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const abs = join2(dir, e.name);
      if (e.isDirectory()) {
        walkDocs(abs);
        continue;
      }
      if (!e.name.endsWith(".md")) continue;
      const text = readFileSync2(abs, "utf8");
      text.split("\n").forEach((line, i) => {
        if (/npm\s+i\s+-g|pip\s+install|brew\s+install/i.test(line) && cliNames.some((c) => line.toLowerCase().includes(c))) {
          offenders.push(`${abs}:${i + 1} \u2014 ${line.trim().slice(0, 90)}`);
        }
        if (/install a coding (cli|agent)|install (claude code|codex|opencode)\b/i.test(line)) {
          offenders.push(`${abs}:${i + 1} \u2014 ${line.trim().slice(0, 90)}`);
        }
      });
    }
  };
  if (fs.existsSync(path.join(ROOT, "docs"))) walkDocs(path.join(ROOT, "docs"));
  ok(
    "no shipped document tells a reader to install an external coding agent",
    offenders.length === 0,
    offenders.join(" | ")
  );
  ok(
    "the docs tree still exists to be walked \u2014 a gate over zero files passes everything",
    fs.existsSync(path.join(ROOT, "docs")) && readdirSync(path.join(ROOT, "docs")).length > 0
  );
}
console.log(`
${passed} passed, ${failed} failed.`);
if (failed) {
  console.log(failures.map((f) => `  - ${f}`).join("\n"));
  process.exit(1);
}
