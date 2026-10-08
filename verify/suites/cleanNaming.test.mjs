import { createRequire as __mjCreateRequire } from "node:module"; const require = __mjCreateRequire(import.meta.url);

// probe/cleanNaming.test.ts
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
var root = process.env.SI_ROOT ? path.resolve(process.env.SI_ROOT) : process.cwd();
var SKIP_DIRS = /* @__PURE__ */ new Set(["node_modules", ".git", "history", "suites", "specs", "fixtures", "dist", "target", "profiles", "screens", "vendor", "fonts", "LICENSES"]);
var SKIP_FILES = /* @__PURE__ */ new Set(["package-lock.json", "Cargo.lock", "BUILD-INFO.txt", "tauri.conf.json", "MANIFEST.json"]);
var SKIP_PATHS = /* @__PURE__ */ new Set([
  path.join("probe", "cleanNaming.test.ts"),
  path.join("probe", "engineDoor.test.tsx"),
  /* protocol/** is exempt, and it is the one exemption that is not really a
   * naming exemption at all.
   *
   * Those strings — the vault algorithm tag, the population-binding separator,
   * the rotation proof id, the link-metadata prefix — are wire-format labels in
   * a signed exchange, not branding. The prefix is inside the string that gets
   * hashed, so renaming it changes the commitment: the shipped proof in
   * protocol/proof/ would no longer verify against the code that produced it.
   *
   * That is a protocol version, and a protocol version is a deliberate act with
   * its own re-proof, not something a rename script gets to do by accident.
   * Until that act is taken on purpose, the old label is the correct one and
   * this gate is the wrong place to change it. */
  path.join("protocol") + path.sep,
  // The legacy ledger's whole job is to NAME the identifiers that still exist.
  // Scanning it for those names is the scan failing at its own purpose, so it is
  // exempt here and policed instead by probe/legacyCompat.test.ts, which checks
  // that every name in it is allowlisted and still in use.
  path.join("docs", "internal", "LEGACY-COMPAT.md"),
  // The third-party notices file has exactly one job: to NAME the outside
  // projects whose licences this product carries, with their real URLs, because
  // an attribution that does not identify its source is not an attribution. It is
  // the licence-condition document the owner's policy points at ("the license goes
  // in the notices; the code stays ours"), so scanning it for outside names makes
  // this gate fail at its own purpose. LICENSES/ is exempt on the same grounds —
  // both are shipped precisely so the names travel with the code.
  "docs_legal_THIRD-PARTY-NOTICES.md",
  path.join("LICENSES") + path.sep,
  path.join("protocol") + path.sep
]);
var BANNED = new RegExp(
  [
    /* Predecessor product names, as they were actually spelled in the wild —
     * concatenated, not alternated. That is deliberate: a fragment only fires
     * when its parts sit next to each other in the text, so "Lancedb", "CrewAI"
     * and "GraphZapier" are caught as the outside products they are, while the
     * ordinary English words they are built from are not.
     *
     * The list is the product's memory. A rename that drops one of these leaves
     * the old name in the tree permanently and nothing else would notice — which
     * is exactly what happened the first time a script renamed this file without
     * knowing it was a detector and not prose. */
    "Vo",
    "uch Harbor|Vel",
    "vet Hand|11",
    "Handle\\b|vo",
    "uchharbor|Vo",
    "uchHarbor|vo",
    "uch-harbor",
    "|\\bHar",
    "bor\\b|11",
    "handle-work|11",
    "handle-[a-z]",
    "|mj-brow",
    "ser",
    "|open",
    "muse|open",
    "bot|open",
    "claw|ma",
    "stra|na",
    "ngo|copilot",
    "kit|lang",
    "fuse|llama",
    "index|lance",
    "db|cre",
    "wai|lang",
    "graph|zap",
    "ier",
    "|\\bvh",
    "19\\b|\\bV",
    "H[-_]"
  ].join(""),
  "gi"
);
function* walkRel(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue;
      yield* walkRel(abs);
    } else {
      yield path.relative(root, abs);
    }
  }
}
var scanned = 0;
var offenders = [];
for (const rel of walkRel(root)) {
  const base = path.basename(rel);
  if (SKIP_FILES.has(base) || base.startsWith(".")) continue;
  const exempt = [...SKIP_PATHS].some(
    (p) => p.endsWith(path.sep) ? rel.startsWith(p) : rel === p || rel.startsWith(p + path.sep)
  );
  if (exempt) continue;
  if (/\.one-|\.log$|\.png$|\.jpe?g$|\.xlsx$|\.zip$|\.so$|\.dylib$|\.dll$|\.pdf$|\.wasm$|\.lock$/.test(rel)) continue;
  let text;
  try {
    const st = fs.statSync(path.join(root, rel));
    if (st.size > 2e6) continue;
    text = fs.readFileSync(path.join(root, rel), "utf8");
  } catch {
    continue;
  }
  if (text.includes("\0")) continue;
  scanned += 1;
  const m = text.match(BANNED);
  if (m) offenders.push(`${rel}: ${[...new Set(m.map((h) => h.toLowerCase()))].join(", ")}`);
}
assert.ok(scanned > 80, `scan covered the tree (scanned ${scanned} files)`);
assert.deepEqual(offenders, [], `retired/outside names in current surfaces:
${offenders.join("\n")}`);
console.log(`cleanNaming: PASS (${scanned} files scanned, zero retired or outside names)`);
