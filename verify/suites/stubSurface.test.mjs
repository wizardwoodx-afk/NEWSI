import { createRequire as __mjCreateRequire } from "node:module"; const require = __mjCreateRequire(import.meta.url);

// probe/stubSurface.test.ts
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
var root = process.env.SI_ROOT ? path.resolve(process.env.SI_ROOT) : process.cwd();
var STUB_DIR = path.join(root, "src", "browser", "nodeStubs");
var VITE_CFG = path.join(root, "vite.config.ts");
var pass = 0;
var fail = 0;
var ok = (label, cond, detail = "") => {
  if (cond) {
    pass += 1;
    console.log(`  ok   ${label}`);
  } else {
    fail += 1;
    console.log(`  FAIL ${label}${detail ? ` \u2014 ${detail}` : ""}`);
  }
};
var section = (t) => console.log(`
== ${t} ==`);
function aliasedBuiltins() {
  const cfg = fs.readFileSync(VITE_CFG, "utf8");
  const map = /* @__PURE__ */ new Map();
  const re = /find:\s*\/\^node:([^\s$]+)\$\/,\s*replacement:\s*browserBuiltin\(\s*"([\w-]+)"\s*\)/g;
  for (const m of cfg.matchAll(re)) map.set(`node:${m[1].replace(/\\\//g, "/")}`, m[2]);
  return map;
}
function stubExports(stubFile) {
  const text = fs.readFileSync(path.join(STUB_DIR, `${stubFile}.ts`), "utf8");
  const names = /* @__PURE__ */ new Set();
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
function* sourceFiles(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "nodeStubs") continue;
      yield* sourceFiles(abs);
    } else if (/\.(ts|tsx)$/.test(e.name) && !e.name.endsWith(".d.ts")) {
      yield abs;
    }
  }
}
function namedImports(text, specifier) {
  const out = [];
  const escaped = specifier.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`import\\s+(?:type\\s+)?\\{([^}]*)\\}\\s*from\\s*["']${escaped}["']`, "g");
  for (const m of text.matchAll(re)) {
    for (const raw of m[1].split(",")) {
      const part = raw.trim();
      if (/^type\s+/.test(part)) continue;
      const name = part.split(/\s+as\s+/)[0].trim();
      if (name && /^[A-Za-z_$][\w$]*$/.test(name)) out.push(name);
    }
  }
  return out;
}
function importedSpecifiers(text) {
  const out = /* @__PURE__ */ new Set();
  for (const m of text.matchAll(/(?:from\s*|import\s*\(\s*)["'](node:[\w/]+)["']/g)) out.add(m[1]);
  return [...out];
}
var NO_BROWSER_SUBSTITUTE = /* @__PURE__ */ new Set(["node:dns/promises"]);
var aliases = aliasedBuiltins();
var stubFiles = fs.readdirSync(STUB_DIR).filter((f) => f.endsWith(".ts") && !f.endsWith(".d.ts")).map((f) => f.replace(/\.ts$/, ""));
section("1. every named node:* import is declared by its stub");
ok("the vite alias table was read", aliases.size > 0, `found ${aliases.size}`);
var aliasTargets = new Set(aliases.values());
var unaliased = stubFiles.filter((f) => f !== "_empty" && !aliasTargets.has(f));
ok(
  "every stub file is reachable from the alias table",
  unaliased.length === 0,
  unaliased.length ? `unaliased: ${unaliased.join(", ")}` : ""
);
function isProxyStub(stubFile) {
  const text = fs.readFileSync(path.join(STUB_DIR, `${stubFile}.ts`), "utf8");
  return /new\s+Proxy/.test(text);
}
var missing = [];
var checked = 0;
var filesWithImports = 0;
var proxyStubs = 0;
var exportsByStub = /* @__PURE__ */ new Map();
for (const file of sourceFiles(path.join(root, "src"))) {
  const rel = path.relative(root, file);
  const text = fs.readFileSync(file, "utf8");
  let hitsHere = 0;
  for (const [specifier, stubFile] of aliases) {
    if (!fs.existsSync(path.join(STUB_DIR, `${stubFile}.ts`))) continue;
    if (isProxyStub(stubFile)) {
      proxyStubs += 1;
      continue;
    }
    for (const name of namedImports(text, specifier)) {
      checked += 1;
      hitsHere += 1;
      if (!exportsByStub.has(stubFile)) exportsByStub.set(stubFile, stubExports(stubFile));
      if (!exportsByStub.get(stubFile).has(name)) {
        missing.push(`${rel} imports ${name} from ${specifier} \u2014 ${stubFile}.ts does not export it`);
      }
    }
  }
  if (hitsHere > 0) filesWithImports += 1;
}
ok(
  "src/ was scanned for node:* named imports",
  checked > 0,
  `checked ${checked} value imports across ${filesWithImports} files (${proxyStubs} Proxy-stub specifiers skipped by design)`
);
ok(
  "every named node:* import resolves against its stub",
  missing.length === 0,
  missing.length === 0 ? `checked ${checked}` : `
      ${missing.join("\n      ")}`
);
section("2. every builtin src/ imports has a stub (no silent externalisation)");
var imported = /* @__PURE__ */ new Set();
for (const file of sourceFiles(path.join(root, "src"))) {
  for (const spec of importedSpecifiers(fs.readFileSync(file, "utf8"))) imported.add(spec);
}
var unstubbed = [...imported].filter((s) => !aliases.has(s) && !NO_BROWSER_SUBSTITUTE.has(s)).sort();
ok("src/ imports at least one node builtin", imported.size > 0, `${imported.size} specifiers`);
ok(
  "no builtin import escapes the alias table",
  unstubbed.length === 0,
  unstubbed.length ? `externalised by the bundler instead of stubbed: ${unstubbed.join(", ")}` : ""
);
var drift = [...imported].filter((s) => !aliases.has(s) && !NO_BROWSER_SUBSTITUTE.has(s));
ok("the no-substitute list is still an accurate list", drift.length === 0, drift.join(", "));
console.log(`
stubSurface: ${pass} passed, ${fail} failed`);
assert.equal(fail, 0, `${fail} stub-surface assertion(s) failed`);
