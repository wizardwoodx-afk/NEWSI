import { createRequire as __mjCreateRequire } from "node:module"; const require = __mjCreateRequire(import.meta.url);

// probe/docIdentity.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
var root = ".";
var PRODUCT_VERSION = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")).version;
var MAJOR = PRODUCT_VERSION.split(".")[0];
var MINOR = PRODUCT_VERSION.split(".")[1] ?? "0";
var VERSION_RE = new RegExp(`\\b(v?${MAJOR}\\.\\d{1,2}(?:\\.\\d{1,2}){0,2})(?![.\\d])`, "g");
var HISTORICAL_BY_ROLE = /^(CHANGELOG\.md|RELEASE-VERIFICATION\.md|(VH|11H)-\d+\.\d+-UPGRADE\.md|docs[\\/]history[\\/]|docs[\\/]VERSIONING\.md)/;
var HISTORICAL = new RegExp(
  [
    "release notes",
    "docs/history",
    "history/",
    "CHANGELOG",
    "changelog",
    "supersed",
    "retired",
    "replaced",
    "POINTER",
    "WINDOWS-FIX",
    "version of record",
    "product release:",
    "engine release:",
    "docs/VERSIONING",
    "relative to",
    "upgrade",
    "UPGRADE",
    "baseline",
    "frozen",
    "regress",
    "drift",
    "review",
    "external",
    "was ",
    "were ",
    "is now",
    "became",
    "unchanged",
    "stands unchanged",
    "\u2192",
    "->",
    `pre-${MAJOR}`,
    `legacy`,
    `heritage`,
    `since ${MAJOR}`,
    `over ${MAJOR}`,
    `what ${MAJOR}`,
    `added over`,
    `gains? over`,
    // release-note section headers: "### NEW in 19.7.6 [Office] — …"
    `^#{1,6}\\s*(NEW|New|new)\\s+in\\s+v?${MAJOR}\\.`,
    `^#{1,6}.*\\bv?${MAJOR}\\.\\d+(?:\\.\\d+)?\\b.*\u2014`,
    // a version used as an adjective for a past subsystem ("the 19.5.6 bench")
    `\\bv?${MAJOR}\\.\\d+(?:\\.\\d+)?[- ]?(reach|federation|regulated|broader|bench|batch|redesign|record|subsystem|engine)`,
    `per the ${MAJOR}\\.\\d`,
    `decided at ${MAJOR}\\.\\d`,
    `at ${MAJOR}\\.\\d`,
    `committed with the ${MAJOR}\\.\\d`,
    `with the ${MAJOR}\\.\\d`,
    `ranked v?${MAJOR}\\.\\d`,
    `in ${MAJOR}\\.\\d`,
    `hardened in ${MAJOR}\\.\\d`,
    `\\bv?${MAJOR}\\.\\d+(?:\\.\\d+)?\\s*(review|external|shipped|added|adds|closes|closed|gains|ships|made|merged|retired|introduced|brought|turned|learned|fused|carries)`,
    `\\bv?${MAJOR}\\.\\d+(?:\\.\\d+)?'s`,
    // parenthetical provenance annotations: "(19.7.1)", "(19.6, new)", "Identity (19.6.0):"
    `\\(\\s*v?${MAJOR}\\.\\d+(?:\\.\\d+)?\\s*[,)]`,
    `\\(\\s*Identity\\s*\\(?\\s*v?${MAJOR}\\.\\d`,
    `Identity\\s*\\(\\s*v?${MAJOR}\\.\\d+(?:\\.\\d+)?\\s*\\)`,
    `\\bv?${MAJOR}\\.\\d+(?:\\.\\d+)?\\s*,\\s*(new|unchanged|beta|revised|updated|renamed)`,
    `^[*>\\u2022\\s]*\\bv?${MAJOR}\\.\\d+(?:\\.\\d+)?\\s*[\\u2014\\u2013-]`
  ].join("|"),
  "im"
);
function mdFiles() {
  const out = [];
  for (const f of fs.readdirSync(root)) {
    if (f.endsWith(".md") && !HISTORICAL_BY_ROLE.test(f)) out.push(f);
  }
  const docs = path.join(root, "docs");
  for (const f of fs.readdirSync(docs)) {
    const full = path.join("docs", f);
    if (fs.statSync(path.join(docs, f)).isDirectory()) continue;
    if (HISTORICAL_BY_ROLE.test(full)) continue;
    out.push(full);
  }
  return out.sort();
}
var passed = 0;
var failures = [];
var ok = (label, cond, detail = "") => {
  if (cond) passed++;
  else failures.push(detail ? `${label} \u2014 ${detail}` : label);
  console.log(`  ${cond ? "ok " : "FAIL"} ${label}${cond ? "" : ` \u2014 ${detail}`}`);
};
test("docIdentity \u2014 current-facing documents name only the current release (outside historical context)", () => {
  console.log(`
== doc identity scan (VH ${PRODUCT_VERSION}) ==
`);
  const files = mdFiles();
  ok("the scan covers the current docs surface", files.length >= 8, `only ${files.length} files`);
  ok(
    `VERSION_RE is derived from the release identity (major ${MAJOR}), not hardcoded to a past major`,
    VERSION_RE.source.includes(`${MAJOR}\\.\\d`) && !VERSION_RE.source.includes("16\\.\\d")
  );
  const matchesOnce = new RegExp(VERSION_RE.source);
  ok(
    "VERSION_RE actually matches the current release string \u2014 the gate is not vacuous",
    matchesOnce.test(PRODUCT_VERSION) && matchesOnce.test(`v${PRODUCT_VERSION}`)
  );
  ok(
    "VERSION_RE matches a STALE release string \u2014 the gate would catch drift",
    matchesOnce.test(`${MAJOR}.${Number(MINOR) > 0 ? Number(MINOR) - 1 : 0}.0`)
  );
  ok(
    "historical-by-role documents are excluded by NAME, not by accident",
    !files.some((f) => HISTORICAL_BY_ROLE.test(f)) && files.length >= 8
  );
  const offenders = [];
  let scanned = 0;
  let historicalRefs = 0;
  for (const rel of files) {
    const text = fs.readFileSync(path.join(root, rel), "utf8");
    const lines = text.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      VERSION_RE.lastIndex = 0;
      let m;
      while ((m = VERSION_RE.exec(lines[i])) !== null) {
        const norm = m[1].replace(/^v/, "");
        if (HISTORICAL.test(lines[i])) {
          historicalRefs++;
          continue;
        }
        scanned++;
        if (norm === PRODUCT_VERSION) continue;
        offenders.push(`${rel}:${i + 1} \u2192 "${m[1]}" in: ${lines[i].trim().slice(0, 90)}`);
      }
    }
  }
  ok(`current docs carry zero product version mentions (scanned ${files.length} docs, ${scanned} mentions, ${historicalRefs} historical)`, scanned === 0, offenders.concat(files.filter(() => false)).slice(0, 6).join(" | ") || `${scanned} mention(s)`);
  void offenders;
  const readme = fs.readFileSync(path.join(root, "README.md"), "utf8");
  ok("README.md opens as SelfImpulse", readme.startsWith("# SelfImpulse"), readme.split("\n")[0]);
  ok("README.md credits the MJ engine", /\*\*MJ\*\* engine|MJ\*\* is the engine/.test(readme), "engine credit");
  ok("README.md names no product version", !/\b1[0-9]\.[0-9]+(\.[0-9]+)+\b/.test(readme), (readme.match(/\b1[0-9]\.[0-9]+(\.[0-9]+)+\b/) ?? [""])[0]);
  const features = fs.readFileSync(path.join(root, "docs", "releases", "FEATURES.md"), "utf8");
  ok("docs/releases/FEATURES.md opens as SelfImpulse and names no version", features.startsWith("# SelfImpulse") && !/\b1[0-9]\.[0-9]+\.[0-9]+\b/.test(features), features.split("\n")[0]);
  console.log(`
${passed} passed, ${failures.length} failed`);
  if (failures.length > 0) {
    console.log("\nfailures:");
    for (const f of failures) console.log(`  - ${f}`);
  }
  assert.equal(failures.length, 0, failures.join("; "));
});
test("docIdentity \u2014 protocol-version labels agree with the single source (17.10.3 review finding)", () => {
  console.log("\n== protocol version label scan ==\n");
  const pkgVersion = JSON.parse(fs.readFileSync(path.join(root, "protocol", "package.json"), "utf8")).version;
  const core = fs.readFileSync(path.join(root, "protocol", "src", "core", "si-crypto.js"), "utf8");
  const cryptoVersion = core.match(/version:\s*"(\d+\.\d+\.\d+)"/)?.[1] ?? null;
  const localFailures = [];
  const okk = (label, cond, detail = "") => {
    console.log(`  ${cond ? "ok " : "FAIL"} ${label}${cond ? "" : ` \u2014 ${detail}`}`);
    if (!cond) localFailures.push(detail ? `${label} \u2014 ${detail}` : label);
  };
  okk(
    "protocol/package.json and si-crypto.js agree on the protocol version",
    cryptoVersion !== null && cryptoVersion === pkgVersion,
    `package.json ${pkgVersion} vs si-crypto.js ${cryptoVersion}`
  );
  const LABEL_RE = /protocol v(\d+\.\d+\.\d+)/gi;
  const files = ["README.md", "protocol/README.md", "protocol/THREAT-MODEL.md"];
  const walk = (dir) => {
    for (const e of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
      const rel = `${dir}/${e.name}`;
      if (e.isDirectory()) {
        if (e.name === "node_modules" || e.name === "dist" || e.name === "build") continue;
        walk(rel);
      } else if (/\.tsx?$/.test(e.name)) files.push(rel);
    }
  };
  walk("src");
  const offenders = [];
  let labels = 0;
  for (const rel of files) {
    const text = fs.readFileSync(path.join(root, rel), "utf8");
    for (const [i, line] of text.split(/\r?\n/).entries()) {
      LABEL_RE.lastIndex = 0;
      let m;
      while ((m = LABEL_RE.exec(line)) !== null) {
        labels++;
        if (m[1] === pkgVersion) continue;
        offenders.push(`${rel}:${i + 1} \u2014 "protocol v${m[1]}" but the code declares v${pkgVersion}`);
      }
    }
  }
  okk(
    "every current-facing protocol-version label names the shipped protocol",
    offenders.length === 0,
    offenders.slice(0, 5).join(" | ")
  );
  okk(
    `the scan still finds the labels it guards (${labels} found, across ${files.length} files)`,
    labels > 0,
    "no label matched \u2014 the pattern no longer matches the codebase, so this gate guards nothing"
  );
  console.log(`
${files.length} files scanned, ${labels} labels, ${localFailures.length} failed`);
  assert.equal(localFailures.length, 0, localFailures.join("; "));
});
