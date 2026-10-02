/**
 * No-External-CLI probe.
 *
 * The product decision: external coding-agent CLIs are removed. Not deprecated,
 * not hidden behind a flag — gone. Every agent runs in-process on the owner's own
 * provider key.
 *
 * Why a probe rather than a commit message: 19.7.4 already marked these CLIs
 * "retired" while the Rust allowlist still carried 22 binaries, `cli_invoke` could
 * still spawn them, ACP could still bridge to a `claude-code-acp` process, and a
 * user could still register an arbitrary custom harness. The claim was true and
 * the capability was live. A governance product that tells an operator something
 * is gone while it is reachable is worse than one that never had it — so the
 * absence is now pinned, the same way a presence would be.
 *
 * Each section asserts a DIFFERENT layer, so a single file reappearing cannot
 * quietly restore the capability.
 *
 * ---------------------------------------------------------------------------
 * AMENDMENT 19.8.0 — the Antigravity ACP PROVIDER RUNTIME is not a violation.
 *
 * Google stopped serving consumer AI Pro/Ultra entitlement from the Gemini CLI
 * on 2026-06-18, moving it into Antigravity. SelfImpulse can therefore reach
 * that subscription over a local ACP surface (src/auth/antigravity.ts), and
 * this gate has to say plainly whether that breaks the rule above. It does not,
 * and the distinction is not a loophole:
 *
 *   THE THING THAT IS BANNED is an external coding-AGENT: a binary that decides
 *   what to do, reads and writes the filesystem, and calls tools. Seating one
 *   hands a third-party program authority over the mission. That is what
 *   `acp_open`/`acp_send`/`acp_recv` and the CLI allowlist used to do, and they
 *   stay gone.
 *
 *   THE THING THAT IS ADDED is a provider TRANSPORT in the same family as
 *   Ollama: SelfImpulse still owns the agent loop, the autonomy arms, the gate
 *   and the receipt, and asks the runtime for a completion exactly the way it
 *   asks api.openai.com. Nothing in SelfImpulse spawns the runtime, the owner's
 *   Google sign-in happens inside Antigravity, and no Google credential is ever
 *   read, stored or forwarded by this app — so the provider holds no authority
 *   that the owner did not already grant to a process they started themselves.
 *
 * Two things keep this honest, and both are pinned by probe/antigravity.test.ts
 * rather than asserted here: the runtime is never spawned (so no new
 * `child_process`/`Command::new` can appear behind this), and it carries no
 * OAuth surface at all. A provider that reached the subscription by holding a
 * Google token WOULD be a violation, and §8 of that probe fails the build if
 * one is ever added.
 *
 * The amendment is recorded here, in the gate, on purpose. Narrowing a ban from
 * inside the file that enforces it is only acceptable if the narrowing is
 * visible in the same place a reviewer will look — which is why the next
 * sentence of this file still says "not deprecated, not hidden behind a flag".
 * ---------------------------------------------------------------------------
 */
import * as fs from "node:fs";
const { readdirSync, readFileSync } = fs;
const { join } = path;
import * as path from "node:path";

const ROOT: string = process.env.SI_ROOT ?? process.cwd();
const read = (rel: string): string => fs.readFileSync(path.join(ROOT, rel), "utf8");
const exists = (rel: string): boolean => fs.existsSync(path.join(ROOT, rel));

let passed = 0;
let failed = 0;
const failures: string[] = [];
function ok(label: string, cond: boolean, detail = ""): void {
  if (cond) { passed += 1; console.log(`  ok   ${label}`); }
  else { failed += 1; failures.push(`${label}${detail ? ` — ${detail}` : ""}`); console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`); }
}
function section(name: string): void { console.log(`\n== ${name}`); }

/** The binaries the product used to seat. None may appear in an allowlist again. */
const EXTERNAL_BINS = ["claude", "codex", "opencode", "openclaude", "copilot", "cursor-agent",
  "grok", "cline", "kilo", "qwen", "gemini", "aider", "goose", "amazonq", "kiro-cli", "amp",
  "crush", "openhands", "droid", "kimi", "auggie", "warp"];

section("1. the native handlers that could spawn an external agent are gone");
{
  const rust = read("src-tauri/src/commands.rs");
  for (const sym of ["cli_invoke", "cli_providers_detect", "ALLOWED_CLI_BINS", "harness_argv",
    "custom_harness_load", "custom_harness_store", "custom_harness_validate", "CustomHarness",
    "acp_open", "acp_send", "acp_recv", "acp_close"]) {
    ok(`commands.rs no longer defines ${sym}`, !new RegExp(`\\b${sym}\\b`).test(rust));
  }
  const lib = read("src-tauri/src/lib.rs");
  for (const c of ["cli_invoke", "cli_providers_detect", "custom_harness_list", "custom_harness_save",
    "custom_harness_delete", "acp_open", "acp_send", "acp_recv"]) {
    ok(`lib.rs no longer registers ${c}`, !lib.includes(`commands::${c}`));
  }
  ok("acp.rs — the external agent wire — is deleted", !exists("src-tauri/src/acp.rs"));
}

section("2. no external agent binary is in any allowlist");
{
  const rust = read("src-tauri/src/commands.rs");
  // The list lives in grants.rs (DEV_TOOLS) — one source shared by the shell allow-list and the exec grants.
  ok("SHELL_ALLOWED_PROGRAMS still exists, as an alias of the one shared list", /SHELL_ALLOWED_PROGRAMS: &\[&str\] = grants::DEV_TOOLS;/.test(rust));
  const allow = read("src-tauri/src/grants.rs").match(/pub const DEV_TOOLS: &\[&str\] = &\[([\s\S]*?)\];/);
  ok("the shared dev-tool list exists", !!allow);
  const list = allow ? allow[1] : "";
  for (const bin of EXTERNAL_BINS) {
    ok(`shell_exec does not allow ${bin}`, !new RegExp(`"${bin}"`).test(list), list.slice(0, 80));
  }
  ok("the dev-tool seat is kept (node/npm/cargo/git)", /"node"/.test(list) && /"git"/.test(list));
  ok("shell_exec's refusal no longer mentions custom harnesses",
    !/custom harness/i.test(rust.slice(rust.indexOf("SHELL_ALLOWED_PROGRAMS"), rust.indexOf("SHELL_ALLOWED_PROGRAMS") + 1400)));
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
  /* The amendment in this file's header permits a provider TRANSPORT. The two
     claims that make that safe are asserted HERE, next to the ban, so a
     reviewer auditing "is the ban still real?" finds them in the same file —
     and so the amendment cannot be cited as precedent for a spawn. If the
     Antigravity module ever grew a process-spawning call, THIS is the section
     that would notice, not the provider's own probe. */
  ok("src/auth/antigravity.ts exists — the amendment describes a real thing", exists("src/auth/antigravity.ts"));
  /* Scan CODE, not prose: the module's comments say "OAuth" and "receipt" while
     explaining it has neither, so a raw substring scan trips on its own
     documentation. */
  const agy = read("src/auth/antigravity.ts")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
  ok("it never spawns a process", !/child_process|spawn\(|execFile|execSync|Command::new/.test(agy));
  ok("it holds no Google credential, so it is not an authenticated agent",
    !/access_token|accessToken|refresh_token|client_secret|accounts\.google\.com/.test(agy));
  ok("it is a provider seam, not an agent seat: it exposes no agent engine",
    !/harness|seatArgv|agentLoop|autonomyArms/.test(agy));

  /* The runtime is the OWNER's process, contacted over loopback. `agy` must
     therefore never enter the shell allowlist as a spawnable program — the
     owner starts it themselves, outside this app. */
  const rust = read("src-tauri/src/commands.rs");
  const allow = read("src-tauri/src/grants.rs").match(/pub const DEV_TOOLS: &\[&str\] = &\[([\s\S]*?)\];/);
  const list = allow ? allow[1] : "";
  ok("shell_exec cannot launch the Antigravity runtime", !/"agy"/.test(list) && !/antigravity/i.test(list));
  ok("there is still no acp_* command in the native handler",
    !/\bacp_(open|send|recv|close)\b/.test(rust));
}

section("4. the registry offers only in-process engines");
{
  const dom = read("src/domain/harness.ts");
  const union = dom.match(/export type HarnessId =([^;]+);/)?.[1] ?? "";
  ok("HarnessId admits only the native runtimes",
    /"hermes"/.test(union) && /"llm"/.test(union), union.trim());
  for (const gone of ["claude", "codex", "gemini", "cursor", "cline", "grok", "opencode", "acp"]) {
    ok(`HarnessId no longer admits ${gone}`, !new RegExp(`"${gone}"`).test(union));
  }
  const catalog = dom.slice(dom.indexOf("export const HARNESSES"));
  for (const gone of EXTERNAL_BINS) {
    ok(`the HARNESSES catalog has no ${gone} spec`, !new RegExp(`id: "${gone}"`).test(catalog));
  }
  ok("no retired-id deny-list remains — unknown ids route straight to the native default",
    !/RETIRED_HARNESSES/.test(dom) && !/isRetiredHarness/.test(dom));
  ok("no custom-harness machinery remains anywhere in the file",
    !/CustomHarness|customHarnessId|validateCustomHarness|isCustomHarness|setCustomHarnesses|getCustomHarness|listCustomHarnesses/.test(dom));
  ok("no `custom:` id is even constructible",
    !/custom:\$\{/.test(dom));
  ok("no removed engine id appears in any node config option list",
    !/options: \[[^\]]*"(claude|codex|opencode|cursor|grok|cline|kilo)"/.test(read("src/domain/nodeLibrary.ts")));
  ok("the default harness for a new agent node is the native engine",
    !/harness \|\| "claude"/.test(read("src/graph/factory.ts")));
}

section("5. nothing spawns a third-party agent process");
{
  const adapters = read("src/mission/harnessAdapters.ts");
  ok("the CliHarness adapter class is gone", !/class CliHarness/.test(adapters));
  ok("the CustomCliHarness adapter class is gone", !/class CustomCliHarness/.test(adapters));
  ok("the ACP adapter is not registered", !/AcpHarness/.test(adapters));
  ok("the vendor PROFILES table is gone", !/PROFILES/.test(adapters));
  ok("a seat naming a removed engine resolves to null, not to a stub",
    /return registry\.get\(id\) \?\? null/.test(adapters));

  const deps = read("src/mission/hostDeps.ts");
  ok("hostRunnerDeps resolves no agent binary", /resolveBin: async \(_bin\) => null/.test(deps));
  ok("hostRunnerDeps refuses to invoke an agent CLI in words",
    /external agent CLIs are removed/.test(deps));

  const brain = read("src/selfimpulse/engine/brainSeam.ts");
  ok("the brain seam refuses to spawn a CLI process", /external agent CLIs are removed/.test(brain));
  ok("the brain seam no longer calls ipc.cliInvoke", !/ipc\.cliInvoke/.test(brain));
}

section("6. the product tells the truth about what it is");
{
  const readme = read("README.md");
  ok("the README does not offer external coding agents",
    !/Claude Code, Codex, Gemini|governed tier, not a hidden one/.test(readme));
  const story = exists("docs/STORY.md") ? read("docs/STORY.md") : "";
  ok("STORY.md no longer claims a roster of agent CLIs", !/25 agent CLIs/.test(story));
  const info = read("verify/BUILD-INFO.txt");
  ok("the build record states the removal rather than promising the tier",
    /EXTERNAL CODING-AGENT CLIs .* REMOVED|REMOVED FROM THE TREE|are removed/i.test(info));
  ok("the build record does not advertise the tier as a feature",
    !/governed external-harness tier/.test(info));

  /* EVERY shipped document, not a hand-picked few.
   *
   * The reviewer found `docs/setup/DESKTOP-NATIVE.md` still telling readers to
   * `npm i -g @anthropic-ai/claude-code` while this suite was green, because
   * §6 only ever read README.md and one story file. A gate that names two files
   * and calls itself a guarantee is a gate that will be extended by the next
   * document somebody writes, and it will pass.
   *
   * So: walk the whole docs tree, and fail on any instruction to install one of
   * these. A document may still NAME them when it is explaining that they are
   * gone — the test is for the imperative, not the word. */
  const cliNames = ["claude-code", "@openai/codex", "opencode-ai", "aider", "continue-dev"];
  const offenders: string[] = [];
  const walkDocs = (dir: string): void => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const abs = join(dir, e.name);
      if (e.isDirectory()) { walkDocs(abs); continue; }
      if (!e.name.endsWith(".md")) continue;
      const text = readFileSync(abs, "utf8");
      text.split("\n").forEach((line, i) => {
        // An install command, or prose telling the reader to install one.
        if (/npm\s+i\s+-g|pip\s+install|brew\s+install/i.test(line) &&
            cliNames.some((c) => line.toLowerCase().includes(c))) {
          offenders.push(`${abs}:${i + 1} — ${line.trim().slice(0, 90)}`);
        }
        if (/install a coding (cli|agent)|install (claude code|codex|opencode)\b/i.test(line)) {
          offenders.push(`${abs}:${i + 1} — ${line.trim().slice(0, 90)}`);
        }
      });
    }
  };
  if (fs.existsSync(path.join(ROOT, "docs"))) walkDocs(path.join(ROOT, "docs"));
  ok("no shipped document tells a reader to install an external coding agent",
    offenders.length === 0, offenders.join(" | "));
  ok("the docs tree still exists to be walked — a gate over zero files passes everything",
    fs.existsSync(path.join(ROOT, "docs")) && readdirSync(path.join(ROOT, "docs")).length > 0);
}

console.log(`\n${passed} passed, ${failed} failed.`);
if (failed) {
  console.log(failures.map((f) => `  - ${f}`).join("\n"));
  process.exit(1);
}
