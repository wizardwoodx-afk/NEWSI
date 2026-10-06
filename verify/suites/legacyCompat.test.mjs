import { createRequire as __mjCreateRequire } from "node:module"; const require = __mjCreateRequire(import.meta.url);

// probe/legacyCompat.test.ts
import assert from "node:assert";
import * as fs from "node:fs";
import * as path from "node:path";
import { test } from "node:test";
var ROOT = process.env.SI_ROOT ?? process.cwd();
var read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
var LEGACY_ALLOWLIST = [
  { pattern: /mj-proof-receipt/gi, reason: "wire format of pre-16.1 receipts \u2014 the verifier must keep accepting them" },
  { pattern: /mj-commercial-v1-offline/g, reason: "license-secret name \u2014 renaming would invalidate issued offline licenses" },
  { pattern: /mj_evolution/g, reason: "vendored first-party python module name (vendor/evolution-service)" },
  { pattern: /legacy-mj-receipt/g, reason: "the signed back-compat test fixture's filename" },
  { pattern: /mj-mission-record|mj-dossier|mj-incident-dossier|mj-merge-attestation|mj-provenance-statement/g, reason: "legacy export formats \u2014 old artifacts stay verifiable" },
  { pattern: /mj\.desktop/g, reason: "provenance predicate URI baked into issued credentials" },
  { pattern: /mjVersion/g, reason: "schema field name in stored receipts/manifests \u2014 renaming needs a storage migration, tracked on the roadmap" },
  // MJ_ACP_BIN / MJ_ACP_ARGS are deliberately ABSENT: they fed the ACP bridge to
  // an external agent CLI, and that bridge is removed. A back-compat shim that
  // parses an env var nothing reads any more is not compatibility, it is a lie.
  // 19.7.15 removed them deliberately; docs/LEGACY-COMPAT.md says so.
  { pattern: /MJ_BROWSER_DIR|MJ_BROWSER_NODE|MJ_BROWSER_URL/g, reason: "legacy env-var fallbacks \u2014 SI_* names are primary; old environments keep working" },
  { pattern: /"mj\.|`mj\.|'mj\./g, reason: "the one-time storage-key migration in main.tsx must name the old prefix" },
  { pattern: /mj\.sqlite/g, reason: "on-disk database filename \u2014 renaming orphans the user's data; migration is a documented roadmap item" },
  { pattern: new RegExp(["mj-brow", "ser|mj-bridge|mj-con", "trol-mcp|mj-desk", 'top|mj:\\/\\/event|join\\("mj"\\)'].join(""), "g"), reason: "native-layer process/pipe/event names and on-disk data directory segments kept stable for installed builds; HANDLE_* is used for all new surfaces" },
  { pattern: /MJ 1[0-9]\.|MJ-era|pre-16\.1|legacy MJ|LEGACY/g, reason: "historical documentation of the predecessor identity, explicitly labelled" }
];
function stripAllowed(src) {
  let s = src;
  for (const a of LEGACY_ALLOWLIST) s = s.replace(new RegExp(a.pattern.source, a.pattern.flags.includes("g") ? a.pattern.flags : a.pattern.flags + "g"), "");
  return s;
}
function* walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else yield p;
  }
}
test("the active product surface carries no UNDOCUMENTED retired-product identifier", () => {
  const offenders = [];
  const surfaces = ["src", "src-tauri/src"];
  for (const dir of surfaces) {
    for (const abs of walk(path.join(ROOT, dir))) {
      if (!/\.(ts|tsx|rs|css)$/.test(abs)) continue;
      const rel = path.relative(ROOT, abs);
      const stripped = stripAllowed(fs.readFileSync(abs, "utf8"));
      const RETIRED = new RegExp(["Vel", "vet Hand|selfimpulse", "hand|Vo", "uch SelfImpulse|(?<![/.])vo", "uchselfimpulse|RO", "GUE|\\bro", "gue\\b"].join(""), "i");
      if (RETIRED.test(stripped)) offenders.push(rel);
    }
  }
  assert.deepEqual(offenders, [], `undocumented retired identifiers in: ${offenders.join(", ")}`);
});
test("every allowlisted legacy shim still exists in the tree (tested, not dead)", () => {
  const tree = [
    ...["src", "src-tauri/src"].flatMap((d) => [...walk(path.join(ROOT, d))].filter((f) => /\.(ts|tsx|rs|css)$/.test(f)))
  ].map((f) => fs.readFileSync(f, "utf8")).join("\n");
  const docs = read("docs/internal/LEGACY-COMPAT.md");
  const mustExist = ["mj-proof-receipt", "mj-commercial-v1-offline", "mj_evolution", "mj-mission-record", "mjVersion", "mj.sqlite"];
  for (const token of mustExist) {
    assert.ok(tree.includes(token), `allowlisted shim vanished from the tree: ${token} (update the allowlist AND the docs together)`);
    assert.ok(docs.includes(token), `docs/LEGACY-COMPAT.md does not document: ${token}`);
  }
});
test("the primary identity is SelfImpulse everywhere it is user-visible (MJ is the engine credit)", () => {
  const pkg = JSON.parse(read("package.json"));
  assert.equal(pkg.name, "selfimpulse");
  assert.match(read("index.html"), /<title>\s*SelfImpulse/);
  const conf = JSON.parse(read("src-tauri/tauri.conf.json"));
  assert.equal(conf.productName, "SelfImpulse");
  const personalNames = new RegExp(["S", "ree"].join("") + "|" + ["Har", "shen"].join(""), "i");
  assert.ok(!personalNames.test(read("LICENSE") + read("README.md") + read("docs/legal/NOTICE")), "no personal names in the shipped identity files");
  assert.ok(!/PolyForm/i.test(read("LICENSE")), "the noncommercial license is gone");
});
console.log("legacyCompat probe complete");
