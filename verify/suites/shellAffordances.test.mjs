import { createRequire as __mjCreateRequire } from "node:module"; const require = __mjCreateRequire(import.meta.url);

// probe/shellAffordances.test.ts
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
var here = path.dirname(fileURLToPath(import.meta.url));
var root = "." ? "." : path.resolve(here, "..");
var read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");
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
var shell = read("src/ui/Shell.tsx");
var css = read("src/ui/vh.css");
var conf = JSON.parse(read("src-tauri/tauri.conf.json"));
var rawConf = read("src-tauri/tauri.conf.json");
var desktop = read("src/app/desktop.ts");
var memory = read("src/ui/screens/Memory.tsx");
var steward = read("src/ui/screens/Steward.tsx");
console.log("== 1. the window has controls the user can actually reach");
ok("the window is frameless, so the app MUST draw its own", conf.app?.windows?.[0]?.decorations === false);
ok(
  "the window exposes the shell globals host detection reads",
  conf.app?.withGlobalTauri === true
);
ok(
  "host detection has a fallback for the older global marker",
  /__TAURI__/.test(desktop) && /__TAURI_INTERNALS__/.test(desktop)
);
ok("the shell renders the window controls", /<WindowControls\s*\/>/.test(shell));
ok("the controls component exists", fs.existsSync(path.join(root, "src", "ui", "WindowControls.tsx")));
var wc = fs.existsSync(path.join(root, "src", "ui", "WindowControls.tsx")) ? read("src/ui/WindowControls.tsx") : "";
ok("a close control is rendered", /api\.close\(\)/.test(wc) && /aria-label="Close"/.test(wc));
ok("a minimise control is rendered", /api\.minimize\(\)/.test(wc) && /aria-label="Minimize"/.test(wc));
ok("a maximise/restore control is rendered", /api\.toggleMaximize\(\)/.test(wc));
ok("the window can be dragged by the user", /startDragging\(\)/.test(wc));
ok(
  "every control has an accessible name",
  (wc.match(/aria-label="/g) ?? []).length >= 3,
  String((wc.match(/aria-label="/g) ?? []).length)
);
ok("the controls are hidden in a browser, where they would be a lie", /detectHost\(\) !== "tauri"/.test(wc));
ok("the controls sit above the app content", /\.winctl\{[^}]*z-index:2147\d{6}/.test(css));
ok(
  "the top bar reserves room for the controls",
  /\.top\{[^}]*padding:0 calc\(36px \+ 138px\) 0 40px/.test(css)
);
ok(
  "no webview debugging port is left in the shipped config",
  !/remote-debugging-port/.test(rawConf)
);
ok(
  "the labelled switch keeps the accent off its own label",
  /label\.switch:has\(input:checked\)\{background:none/.test(css)
);
for (const f of ["tools/build-mcp.mjs", "tools/build-host.mjs"]) {
  ok(
    `${f} bundles through the esbuild API, not a platform-specific binary`,
    /from "esbuild"/.test(read(f)) && !/execFileSync/.test(read(f))
  );
}
ok(
  "build is driven through the Node toolchain (no PowerShell one-off)",
  !fs.existsSync(path.join(root, "tools", "build-app.ps1")) && fs.existsSync(path.join(root, "tools", "build-mcp.mjs")) && fs.existsSync(path.join(root, "tools", "build-host.mjs"))
);
console.log("== 4. the MCP surface exists and is reachable");
var settingsSrc = read("src/ui/screens/Settings.tsx");
var mcpSrc = read("src/ui/screens/Mcp.tsx");
ok("the MCP screen exists", mcpSrc.length > 0);
ok("settings offers an MCP section", /"mcp", "Tools \(MCP\)"/.test(settingsSrc));
ok("the section renders the screen", /sect === "mcp" && <Mcp \/>/.test(settingsSrc));
for (const fn of ["mcpServerList", "mcpConnectTest", "mcpCall", "mcpServerSave", "mcpServerRemove"]) {
  ok(`the surface uses ipc.${fn}`, new RegExp(`ipc\\.${fn}\\(`).test(mcpSrc));
}
ok(
  "connecting is an explicit action, never optimistic",
  /Test connection/.test(mcpSrc) && /enabled · not yet tested/.test(mcpSrc)
);
ok("a failed connection shows the host's own error", /r\?\.lastError/.test(mcpSrc));
ok("a browser is told nothing was contacted", /Nothing below has been contacted/.test(mcpSrc));
ok("a pinned server cannot be removed from the UI", /!pinned && \(/.test(mcpSrc));
ok(
  "the containment layer can resolve a bare program name to a real executable",
  /pub fn resolve_program/.test(read("src-tauri/src/contain.rs")) && /"\.exe", "\.cmd", "\.bat", "\.com"/.test(read("src-tauri/src/contain.rs"))
);
ok(
  "the stdio MCP host resolves the command before spawning",
  (read("src-tauri/src/mcp.rs").match(/spawn_target\(/g) ?? []).length === 2
);
ok(
  "a batch-file target is launched through the command interpreter",
  /pub fn spawn_target/.test(read("src-tauri/src/contain.rs")) && /ends_with\("\.cmd"\)/.test(read("src-tauri/src/contain.rs")) && /ComSpec/.test(read("src-tauri/src/contain.rs"))
);
ok(
  "an extensionless shim is never preferred over a runnable one",
  /v\.push\(bin\.to_string\(\)\);/.test(read("src-tauri/src/contain.rs"))
);
ok("the close control has a distinct hover colour", /\.is-close:hover/.test(css));
ok("the native API the controls call actually exists", /close: \(\) => Promise<void>/.test(desktop));
console.log("== 2. the memory switch reports its own state");
ok("the switch wraps a real checkbox", /<input type="checkbox"/.test(memory));
ok("the checkbox is bound to the real state", /checked=\{memOn\}/.test(memory));
ok("changing it calls setMemory", /setMemory\(e\.target\.checked\)/.test(memory));
ok("the ON state is styled from :checked", /\.switch:has\(input:checked\)/.test(css));
ok("there is also a :checked sibling fallback", /\.switch input:checked\+i/.test(css));
ok(
  "the old never-matching selector is GONE",
  !/\.switch\[aria-checked=true\]/.test(css),
  "an <input> never carries aria-checked, so this rule could never match"
);
ok("the switch is reachable by keyboard", /input:focus-visible/.test(css));
ok("the switch has a visible label", /<span>Remember<\/span>/.test(memory));
ok("the switch label is sized and coloured", /\.switch>span\{/.test(css));
console.log("== 3. the chat composer is not parked at the top of the window");
var hero = /\.deck-wrap\{[^}]*\}/.exec(css)?.[0] ?? "";
ok("the opening surface is a column, not a centred blob", /flex-direction:column/.test(hero), hero);
ok("the hero no longer has the tall fixed top pad", !/padding:72px/.test(hero), hero);
ok("the composer has breathing room above it", /\.composer\{[^}]*margin-top:20px/.test(css));
ok("the opening surface keeps a top pad for the custom window bar", /padding:var\(--s6\)/.test(hero), hero);
ok("the brand is pushed below the bar", /\.brand\{[^}]*padding:6px 8px 10px/.test(css));
ok(
  "the Captain screen is the one that renders the opening surface",
  /className="wrap wide deck-wrap"/.test(steward) && /<Composer/.test(steward)
);
ok("the Captain screen renders no ledger \u2014 it was removed by request", !/className="run"/.test(steward));
console.log("== 4. product source names no third-party project");
var BANNED = new RegExp(
  [
    "agent",
    "browser",
    "open",
    "bot",
    "open",
    "muse",
    "stage",
    "hand",
    "voltagent",
    "page",
    "agent",
    "\\bstrix\\b"
  ].join("[-_ ]?"),
  "i"
);
for (const f of [
  "src/ui/Shell.tsx",
  "src/ui/WindowControls.tsx",
  "src/ui/vh.css",
  "src/ui/screens/Memory.tsx",
  "src/ui/screens/Steward.tsx",
  "src/app/desktop.ts"
]) {
  ok(`${f} carries no third-party product name`, !BANNED.test(read(f)));
}
console.log("");
console.log(`${passed} passed, ${failed} failed`);
if (failures.length > 0) {
  console.log("failures:");
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
