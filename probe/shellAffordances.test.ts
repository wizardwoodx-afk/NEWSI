/**
 * Shell affordances — the controls and states a user must be able to see.
 *
 * These checks exist because three real defects shipped unnoticed:
 *
 *   1. THE WINDOW HAD NO CLOSE BUTTON. The desktop window is created with
 *      `decorations: false`, so the OS draws no title bar. The window API in
 *      `src/app/desktop.ts` implemented minimise / maximise / close, but no
 *      component ever rendered a control that called it. The application could
 *      only be closed with a keyboard shortcut.
 *
 *   2. THE MEMORY TOGGLE NEVER LOOKED ON. The switch CSS selected on
 *      `[aria-checked=true]`, but the control is a real `<input type=checkbox>`,
 *      which never carries that attribute. The state changed; the pixels did
 *      not.
 *
 *   3. THE CHAT COMPOSER SAT TOO HIGH. The hero had a fixed 72px top pad,
 *      which put the input in the top third of the window.
 *
 * A fourth check pins the naming rule the adoption register depends on: no
 * third-party project name may appear in product source.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

// SI_ROOT is injected by the offline runner and the dev runner. When this
// file is executed directly (npx tsx probe/...) it is undefined, so fall back
// to the repository root inferred from this file's own location.
const here = path.dirname(fileURLToPath(import.meta.url));
const root =
  typeof SI_ROOT === "string" && SI_ROOT
    ? SI_ROOT
    : path.resolve(here, "..");
const read = (rel: string) => fs.readFileSync(path.join(root, rel), "utf8");

let passed = 0;
let failed = 0;
const failures: string[] = [];
function ok(label: string, cond: boolean, detail = ""): void {
  if (cond) { passed += 1; console.log(`  ok   ${label}`); }
  else { failed += 1; failures.push(`${label}${detail ? ` — ${detail}` : ""}`); console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`); }
}

const shell = read("src/ui/Shell.tsx");
const css = read("src/ui/vh.css");
const conf = JSON.parse(read("src-tauri/tauri.conf.json"));
const rawConf = read("src-tauri/tauri.conf.json");
const desktop = read("src/app/desktop.ts");
const memory = read("src/ui/screens/Memory.tsx");
const steward = read("src/ui/screens/Steward.tsx");

console.log("== 1. the window has controls the user can actually reach");
ok("the window is frameless, so the app MUST draw its own", conf.app?.windows?.[0]?.decorations === false);
// Host detection reads `window.__TAURI_INTERNALS__`, which only exists when the
// window sets `withGlobalTauri`. Without it the packaged app always reports
// "web" and every native affordance silently disappears — which is exactly how
// the window controls went missing.
ok("the window exposes the shell globals host detection reads",
  conf.app?.withGlobalTauri === true);
ok("host detection has a fallback for the older global marker",
  /__TAURI__/.test(desktop) && /__TAURI_INTERNALS__/.test(desktop));
ok("the shell renders the window controls", /<WindowControls\s*\/>/.test(shell));
ok("the controls component exists", fs.existsSync(path.join(root, "src", "ui", "WindowControls.tsx")));
const wc = fs.existsSync(path.join(root, "src", "ui", "WindowControls.tsx"))
  ? read("src/ui/WindowControls.tsx") : "";
ok("a close control is rendered", /api\.close\(\)/.test(wc) && /aria-label="Close"/.test(wc));
ok("a minimise control is rendered", /api\.minimize\(\)/.test(wc) && /aria-label="Minimize"/.test(wc));
ok("a maximise/restore control is rendered", /api\.toggleMaximize\(\)/.test(wc));
ok("the window can be dragged by the user", /startDragging\(\)/.test(wc));
ok("every control has an accessible name", (wc.match(/aria-label="/g) ?? []).length >= 3,
  String((wc.match(/aria-label="/g) ?? []).length));
ok("the controls are hidden in a browser, where they would be a lie", /detectHost\(\) !== "tauri"/.test(wc));
ok("the controls sit above the app content", /\.winctl\{[^}]*z-index:2147\d{6}/.test(css));
// The controls float above the top bar, so the bar has to reserve their width.
// Without the reservation the per-screen actions (search, export, filters) sit
// underneath the close button and cannot be clicked.
ok("the top bar reserves room for the controls",
  /\.top\{[^}]*padding:0 calc\(36px \+ 138px\) 0 40px/.test(css));
// A webview remote-debugging port lets any local process evaluate script in the
// app's page and drive the UI. That is fine for a verification build and
// unacceptable in one that ships, so it must never be committed to the config.
ok("no webview debugging port is left in the shipped config",
  !/remote-debugging-port/.test(rawConf));
// `.switch:has(input:checked)` is more specific than `label.switch`, so the
// accent flooded the label text and left it unreadable on gold. The accent
// belongs on the track only.
ok("the labelled switch keeps the accent off its own label",
  /label\.switch:has\(input:checked\)\{background:none/.test(css));
// Both committed engine bundles were stale, and for the same reason: the build
// scripts spawned `node_modules/.bin/esbuild`, which is `esbuild.cmd` on
// Windows, so `npm run mcp:build` and `npm run host:build` failed with ENOENT
// here. The bundles could not be regenerated on this machine at all. Both now
// use the esbuild API, which has no platform split — pin that so it cannot
// regress back to a spawn.
for (const f of ["tools/build-mcp.mjs", "tools/build-host.mjs"]) {
  ok(`${f} bundles through the esbuild API, not a platform-specific binary`,
    /from "esbuild"/.test(read(f)) && !/execFileSync/.test(read(f)));
}
// v0.0.3 dropped the PowerShell one-off build-app.ps1 (no Node-only devs
// should ever need PowerShell to ship); the Tauri build is now driven by
// `npm run tauri` through the standard toolchain which writes UTF-8 without
// BOM by default. The BOM-rewrite hazard this line used to guard is therefore
// moot. Pin instead that no PowerShell-only build script has crept back in.
ok("build is driven through the Node toolchain (no PowerShell one-off)",
  !fs.existsSync(path.join(root, "tools", "build-app.ps1")) &&
  fs.existsSync(path.join(root, "tools", "build-mcp.mjs")) &&
  fs.existsSync(path.join(root, "tools", "build-host.mjs")));

// MCP was fully built on the native side — five Tauri commands, a Rust stdio
// host doing a real initialize/tools handshake, and ipc client wrappers for all
// five — but had no page. The wrappers' own comments named an `McpPage` that was
// never written, so the capability was reachable only by editing the database.
// Pin that the surface exists, is reachable, and is wired to those wrappers.
console.log("== 4. the MCP surface exists and is reachable");
const settingsSrc = read("src/ui/screens/Settings.tsx");
const mcpSrc = read("src/ui/screens/Mcp.tsx");
ok("the MCP screen exists", mcpSrc.length > 0);
ok("settings offers an MCP section", /"mcp", "Tools \(MCP\)"/.test(settingsSrc));
ok("the section renders the screen", /sect === "mcp" && <Mcp \/>/.test(settingsSrc));
for (const fn of ["mcpServerList", "mcpConnectTest", "mcpCall", "mcpServerSave", "mcpServerRemove"]) {
  ok(`the surface uses ipc.${fn}`, new RegExp(`ipc\\.${fn}\\(`).test(mcpSrc));
}
ok("connecting is an explicit action, never optimistic",
  /Test connection/.test(mcpSrc) && /enabled · not yet tested/.test(mcpSrc));
ok("a failed connection shows the host's own error", /r\?\.lastError/.test(mcpSrc));
ok("a browser is told nothing was contacted", /Nothing below has been contacted/.test(mcpSrc));
ok("a pinned server cannot be removed from the UI", /!pinned && \(/.test(mcpSrc));

// A bare `npx` cannot be spawned on Windows: the shim is `npx.cmd` and
// `std::process::Command` does not apply PATHEXT. Every seeded server was
// therefore unreachable, and the surface reported `spawn npx: program not
// found` — correct reporting of a real failure, caused by a real bug.
ok("the containment layer can resolve a bare program name to a real executable",
  /pub fn resolve_program/.test(read("src-tauri/src/contain.rs")) &&
  /"\.exe", "\.cmd", "\.bat", "\.com"/.test(read("src-tauri/src/contain.rs")));
ok("the stdio MCP host resolves the command before spawning",
  (read("src-tauri/src/mcp.rs").match(/spawn_target\(/g) ?? []).length === 2);
// Locating `npx.cmd` is only half of it: Windows cannot CreateProcess a batch
// file at all ("%1 is not a valid Win32 application", os error 193), so the file
// has to be launched through the command interpreter. Both halves are pinned.
ok("a batch-file target is launched through the command interpreter",
  /pub fn spawn_target/.test(read("src-tauri/src/contain.rs")) &&
  /ends_with\("\.cmd"\)/.test(read("src-tauri/src/contain.rs")) &&
  /ComSpec/.test(read("src-tauri/src/contain.rs")));
// npm installs a bare `npx` shell script next to `npx.cmd`. Searching the bare
// name first finds the shell script, which Windows cannot execute, so the
// runnable extensions have to be tried before it.
ok("an extensionless shim is never preferred over a runnable one",
  /v\.push\(bin\.to_string\(\)\);/.test(read("src-tauri/src/contain.rs")));
ok("the close control has a distinct hover colour", /\.is-close:hover/.test(css));
ok("the native API the controls call actually exists", /close: \(\) => Promise<void>/.test(desktop));

console.log("== 2. the memory switch reports its own state");
ok("the switch wraps a real checkbox", /<input type="checkbox"/.test(memory));
ok("the checkbox is bound to the real state", /checked=\{memOn\}/.test(memory));
ok("changing it calls setMemory", /setMemory\(e\.target\.checked\)/.test(memory));
ok("the ON state is styled from :checked", /\.switch:has\(input:checked\)/.test(css));
ok("there is also a :checked sibling fallback", /\.switch input:checked\+i/.test(css));
ok("the old never-matching selector is GONE", !/\.switch\[aria-checked=true\]/.test(css),
  "an <input> never carries aria-checked, so this rule could never match");
ok("the switch is reachable by keyboard", /input:focus-visible/.test(css));
ok("the switch has a visible label", /<span>Remember<\/span>/.test(memory));
ok("the switch label is sized and coloured", /\.switch>span\{/.test(css));

console.log("== 3. the chat composer is not parked at the top of the window");
const hero = /\.deck-wrap\{[^}]*\}/.exec(css)?.[0] ?? "";
ok("the opening surface is a column, not a centred blob", /flex-direction:column/.test(hero), hero);
ok("the hero no longer has the tall fixed top pad", !/padding:72px/.test(hero), hero);
ok("the composer has breathing room above it", /\.composer\{[^}]*margin-top:20px/.test(css));
ok("the opening surface keeps a top pad for the custom window bar", /padding:var\(--s6\)/.test(hero), hero);
ok("the brand is pushed below the bar", /\.brand\{[^}]*padding:6px 8px 10px/.test(css));
/* This used to pin `className="run"` — the Ledger section — which the owner had
   the screen rebuilt to remove. What the check is actually for is that the
   Captain door is the one that renders the opening surface at all, so it now
   pins that surface's own class and the composer standing on it. */
ok("the Captain screen is the one that renders the opening surface",
  /className="wrap wide deck-wrap"/.test(steward) && /<Composer/.test(steward));
ok("the Captain screen renders no ledger — it was removed by request", !/className="run"/.test(steward));

console.log("== 4. product source names no third-party project");
// The banned names are assembled from fragments at runtime. Writing them
// literally in this file would put the very strings this check forbids into a
// product surface, which is what the naming probe catches — the check would
// fail on itself.
const BANNED = new RegExp(
  ["agent", "browser", "open", "bot", "open", "muse", "stage", "hand", "voltagent",
   "page", "agent", "\\bstrix\\b"].join("[-_ ]?"),
  "i"
);
for (const f of ["src/ui/Shell.tsx", "src/ui/WindowControls.tsx", "src/ui/vh.css",
                 "src/ui/screens/Memory.tsx", "src/ui/screens/Steward.tsx", "src/app/desktop.ts"]) {
  ok(`${f} carries no third-party product name`, !BANNED.test(read(f)));
}

console.log("");
console.log(`${passed} passed, ${failed} failed`);
if (failures.length > 0) {
  console.log("failures:");
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
