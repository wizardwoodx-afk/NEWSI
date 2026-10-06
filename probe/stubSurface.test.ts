/**
 * probe · stubSurface — the browser-stub contract `vite.config.ts` creates.
 *
 * TWO gaps, both of which shipped a broken build in 1.5.0.
 *
 * 1. A named `node:*` import with no matching stub export is a BUILD FAILURE,
 *    not a runtime one. `src/security/actionGraph.ts` imported
 *    `timingSafeEqual` from `node:crypto`; the stub exported only `createHash`
 *    and `randomBytes`. `tsc --noEmit` passed — with no `paths` in tsconfig it
 *    resolved `node:crypto` to the REAL `@types/node`, which does export it —
 *    so `vite build` was the only thing that could catch it, and `npm test`
 *    never runs `vite build`. This half asserts every named import resolves.
 *
 * 2. The inverse. `nodeStubs/` carried eleven files no alias pointed at
 *    (buffer, events, http, net, process, stream, url, util, zlib, _empty,
 *    fs-promises). A stub nothing aliases reads as implemented browser support
 *    while the real import stays externalised and Vite's warning is suppressed
 *    by the `onwarn` handler. That is the same class of lie as a missing
 *    export, in the direction that hides work rather than breaking it, so it is
 *    asserted here instead of left to a reader's judgement.
 *
 * Why text scanning rather than importing the stubs: the stubs refuse by
 * throwing, so importing one into a Node probe proves nothing about its export
 * surface. The declaration IS the contract, and the declaration is the text.
 */
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";

const root = process.env.SI_ROOT ? path.resolve(process.env.SI_ROOT as string) : process.cwd();
const STUB_DIR = path.join(root, "src", "browser", "nodeStubs");
const VITE_CFG = path.join(root, "vite.config.ts");

let pass = 0;
let fail = 0;
const ok = (label: string, cond: boolean, detail = "") => {
  if (cond) {
    pass += 1;
    console.log(`  ok   ${label}`);
  } else {
    fail += 1;
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`);
  }
};
const section = (t: string) => console.log(`\n== ${t} ==`);

/* ── the alias table, parsed out of vite.config.ts ──────────────────────────
 * Deliberately not restated here. A second copy of this map is a second truth,
 * and the drift this gate exists to catch would then live inside the gate. */
function aliasedBuiltins(): Map<string, string> {
  const cfg = fs.readFileSync(VITE_CFG, "utf8");
  const map = new Map<string, string>();
  // `\/` inside the alias regex is an escaped slash, so the builtin segment has
  // to accept it — `[^\s$]+` rather than `[\w/]+`, which silently dropped the
  // `node:fs/promises` alias and made a working stub look unreachable.
  const re = /find:\s*\/\^node:([^\s$]+)\$\/,\s*replacement:\s*browserBuiltin\(\s*"([\w-]+)"\s*\)/g;
  for (const m of cfg.matchAll(re)) map.set(`node:${m[1].replace(/\\\//g, "/")}`, m[2]);
  return map;
}

function stubExports(stubFile: string): Set<string> {
  const text = fs.readFileSync(path.join(STUB_DIR, `${stubFile}.ts`), "utf8");
  const names = new Set<string>();
  for (const m of text.matchAll(/export\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g)) names.add(m[1]);
  for (const m of text.matchAll(/export\s+(?:const|class)\s+([A-Za-z_$][\w$]*)/g)) names.add(m[1]);
  const def = text.match(/export\s+default\s*\{([^}]*)\}/s);
  if (def) {
    for (const raw of def[1].split(",")) {
      const name = raw.split(":")[0].trim();
      if (name && /^[A-Za-z_$][\w$]*$/.test(name)) names.add(name);
    }
  }
  return names;
}

function* sourceFiles(dir: string): Generator<string> {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "nodeStubs") continue; // the stubs are what is being checked
      yield* sourceFiles(abs);
    } else if (/\.(ts|tsx)$/.test(e.name) && !e.name.endsWith(".d.ts")) {
      yield abs;
    }
  }
}

/* Named VALUE imports only — a `type` import is erased before the bundler ever
 * sees it, so `import { type IncomingMessage } from "node:http"` cannot fail to
 * resolve. Checking those would report four phantom failures on a Proxy stub
 * whose entire contract is "any member access throws at runtime". */
function namedImports(text: string, specifier: string): string[] {
  const out: string[] = [];
  const escaped = specifier.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`import\\s+(?:type\\s+)?\\{([^}]*)\\}\\s*from\\s*["']${escaped}["']`, "g");
  for (const m of text.matchAll(re)) {
    for (const raw of m[1].split(",")) {
      const part = raw.trim();
      // An inline `type` modifier makes the whole specifier type-only.
      if (/^type\s+/.test(part)) continue;
      const name = part.split(/\s+as\s+/)[0].trim();
      if (name && /^[A-Za-z_$][\w$]*$/.test(name)) out.push(name);
    }
  }
  return out;
}

/* Dynamic imports reach the same alias table and a named-import scan walks
 * straight past them, so the specifiers are collected too. */
function importedSpecifiers(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(/(?:from\s*|import\s*\(\s*)["'](node:[\w/]+)["']/g)) out.add(m[1]);
  return [...out];
}

/* One builtin has no stub and no honest substitute: `node:dns/promises`, used by
 * the egress guard to resolve a hostname before deciding whether a destination is
 * allowed. In a WebView there is no DNS to ask and no way to make the check
 * trustworthy, so the browser cannot hold authority over "is this address
 * permitted" — it can only refuse to pretend. Naming it here keeps the decision
 * explicit and reviewable instead of leaving it to whoever reads the config. */
const NO_BROWSER_SUBSTITUTE = new Set(["node:dns/promises"]);

const aliases = aliasedBuiltins();
const stubFiles = fs
  .readdirSync(STUB_DIR)
  .filter((f) => f.endsWith(".ts") && !f.endsWith(".d.ts"))
  .map((f) => f.replace(/\.ts$/, ""));

section("1. every named node:* import is declared by its stub");
ok("the vite alias table was read", aliases.size > 0, `found ${aliases.size}`);
// `_empty.ts` is the shared Proxy base the throwing stubs import; the bundler
// never resolves it directly, so the reachable set is every other stub.
const aliasTargets = new Set(aliases.values());
const unaliased = stubFiles.filter((f) => f !== "_empty" && !aliasTargets.has(f));
ok("every stub file is reachable from the alias table", unaliased.length === 0,
  unaliased.length ? `unaliased: ${unaliased.join(", ")}` : "");

/* Two stub shapes, and only one of them can fail to resolve an import.
 *
 * The generated Proxy stubs (http, net, url, zlib, …) export a default Proxy and
 * NOTHING else, so every member resolves through the default binding — `vite build`
 * already accepts that (verified: exit 0 with `createServer` imported from
 * `node:http`), and member access throws at runtime by design. Asserting a named
 * export against them would demand an export the design deliberately does not have.
 *
 * The hand-written stubs (crypto, fs, os, path, child_process) declare real
 * named exports, and a named import from one of those is exactly the 1.5.0 build
 * break. So those are the ones this gate holds responsible. */
function isProxyStub(stubFile: string): boolean {
  const text = fs.readFileSync(path.join(STUB_DIR, `${stubFile}.ts`), "utf8");
  return /new\s+Proxy/.test(text);
}

const missing: string[] = [];
let checked = 0;
let filesWithImports = 0;
let proxyStubs = 0;
const exportsByStub = new Map<string, Set<string>>();

for (const file of sourceFiles(path.join(root, "src"))) {
  const rel = path.relative(root, file);
  const text = fs.readFileSync(file, "utf8");
  let hitsHere = 0;
  for (const [specifier, stubFile] of aliases) {
    if (!fs.existsSync(path.join(STUB_DIR, `${stubFile}.ts`))) continue;
    if (isProxyStub(stubFile)) { proxyStubs += 1; continue; } // resolves through the default Proxy
    for (const name of namedImports(text, specifier)) {
      checked += 1;
      hitsHere += 1;
      if (!exportsByStub.has(stubFile)) exportsByStub.set(stubFile, stubExports(stubFile));
      if (!exportsByStub.get(stubFile)!.has(name)) {
        missing.push(`${rel} imports ${name} from ${specifier} — ${stubFile}.ts does not export it`);
      }
    }
  }
  if (hitsHere > 0) filesWithImports += 1;
}

// `checked > 0` is the assertion that keeps this gate honest: a regex that stops
// matching makes every other check vacuously true, which is how a gate rots.
ok("src/ was scanned for node:* named imports", checked > 0,
  `checked ${checked} value imports across ${filesWithImports} files (${proxyStubs} Proxy-stub specifiers skipped by design)`);
ok("every named node:* import resolves against its stub", missing.length === 0,
  missing.length === 0 ? `checked ${checked}` : `\n      ${missing.join("\n      ")}`);

section("2. every builtin src/ imports has a stub (no silent externalisation)");
const imported = new Set<string>();
for (const file of sourceFiles(path.join(root, "src"))) {
  for (const spec of importedSpecifiers(fs.readFileSync(file, "utf8"))) imported.add(spec);
}
const unstubbed = [...imported].filter((s) => !aliases.has(s) && !NO_BROWSER_SUBSTITUTE.has(s)).sort();
ok("src/ imports at least one node builtin", imported.size > 0, `${imported.size} specifiers`);
ok("no builtin import escapes the alias table", unstubbed.length === 0,
  unstubbed.length ? `externalised by the bundler instead of stubbed: ${unstubbed.join(", ")}` : "");
// The declared exceptions must stay declared — a growing list is how this gate
// quietly stops being a gate.
const drift = [...imported].filter((s) => !aliases.has(s) && !NO_BROWSER_SUBSTITUTE.has(s));
ok("the no-substitute list is still an accurate list", drift.length === 0, drift.join(", "));

console.log(`\nstubSurface: ${pass} passed, ${fail} failed`);
assert.equal(fail, 0, `${fail} stub-surface assertion(s) failed`);