/**
 * probe/docIdentity.test.ts — exhaustive release-document identity scanning (16.9.5).
 *
 * The 16.9.1 external review found the last identity-drift class: current-facing
 * documents (one-pager, deck outline, platform limits) still naming an old release
 * while every manifest said the new one. versionDrift pins the manifests; this suite
 * pins the DOCS:
 *
 *   current docs  →  scan every release-string occurrence
 *                 →  allow historical references only (named patterns)
 *                 →  anything else that is not PRODUCT_VERSION  →  FAIL
 *
 * Scope: every Markdown file at the repo root and under docs/ — except docs/history/
 * (the historical ledger by design) and CHANGELOG.md (the historical changelog).
 * Matches both "16.9.5" and "v16.9.5" forms, and bare minor forms ("16.9").
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

declare const SI_ROOT: string;
const root = SI_ROOT ?? process.cwd();
const PRODUCT_VERSION = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")).version as string;

/* 19.7.10 [Screenwright] — THE DORMANT GATE, REPAIRED.

   The sixth external review found this suite had gone VACUOUS: VERSION_RE and
   HISTORICAL were both hardcoded to major `16`, written when 16.x was current.
   From the first 19.x release onward the regex matched NO string in any
   document, so `offenders` was always empty and the suite reported green while
   scanning nothing. That is the worst failure mode a drift gate can have — it
   looks like assurance and is the absence of it.

   The patterns are now DERIVED FROM THE RELEASE IDENTITY, so they track every
   future major instead of silently disarming at the next one. A regression
   check below pins that the regex still matches the current major. */
const MAJOR = PRODUCT_VERSION.split(".")[0];
const MINOR = PRODUCT_VERSION.split(".")[1] ?? "0";

/* The trailing lookahead matters, and so does the depth. This release moved to
   a FOUR-part identity (19.7.10.1), which exposed both:
     • without the lookahead the optional patch group backtracks, so
       "a retired-name 19.7.9 installer artifact" also yielded a bare "19.7";
     • with only ONE optional group, "19.7.10.1" backtracked to "19.7.1" —
       the patch digit matched the "1" of "10" and the lookahead then passed
       on the following "0".
   So: up to three numeric groups after the major, and a lookahead that
   refuses BOTH a following ".<digit>" and a bare following digit. */
const VERSION_RE = new RegExp(`\\b(v?${MAJOR}\\.\\d{1,2}(?:\\.\\d{1,2}){0,2})(?![.\\d])`, "g");

/** Documents that are HISTORICAL BY ROLE — older versions are facts in them, not drift.
 *  Each exclusion is named so it cannot grow silently. */
const HISTORICAL_BY_ROLE = /^(CHANGELOG\.md|RELEASE-VERIFICATION\.md|(VH|11H)-\d+\.\d+-UPGRADE\.md|docs[\\/]history[\\/]|docs[\\/]VERSIONING\.md)/;

// a line carrying one of these markers is HISTORICAL context — older versions allowed
const HISTORICAL = new RegExp(
  [
    "release notes", "docs/history", "history/", "CHANGELOG", "changelog",
    "supersed", "retired", "replaced", "POINTER", "WINDOWS-FIX", "version of record", "product release:", "engine release:", "docs/VERSIONING",
    "relative to", "upgrade", "UPGRADE", "baseline", "frozen", "regress",
    "drift", "review", "external", "was ", "were ", "is now", "became",
    "unchanged", "stands unchanged", "→", "->",
    `pre-${MAJOR}`, `legacy`, `heritage`, `since ${MAJOR}`, `over ${MAJOR}`,
    `what ${MAJOR}`, `added over`, `gains? over`,
    // release-note section headers: "### NEW in 19.7.6 [Office] — …"
    `^#{1,6}\\s*(NEW|New|new)\\s+in\\s+v?${MAJOR}\\.`,
    `^#{1,6}.*\\bv?${MAJOR}\\.\\d+(?:\\.\\d+)?\\b.*—`,
    // a version used as an adjective for a past subsystem ("the 19.5.6 bench")
    `\\bv?${MAJOR}\\.\\d+(?:\\.\\d+)?[- ]?(reach|federation|regulated|broader|bench|batch|redesign|record|subsystem|engine)`,
    `per the ${MAJOR}\\.\\d`, `decided at ${MAJOR}\\.\\d`, `at ${MAJOR}\\.\\d`,
    `committed with the ${MAJOR}\\.\\d`, `with the ${MAJOR}\\.\\d`,
    `ranked v?${MAJOR}\\.\\d`, `in ${MAJOR}\\.\\d`, `hardened in ${MAJOR}\\.\\d`,
    `\\bv?${MAJOR}\\.\\d+(?:\\.\\d+)?\\s*(review|external|shipped|added|adds|closes|closed|gains|ships|made|merged|retired|introduced|brought|turned|learned|fused|carries)`,
    `\\bv?${MAJOR}\\.\\d+(?:\\.\\d+)?'s`,
    // parenthetical provenance annotations: "(19.7.1)", "(19.6, new)", "Identity (19.6.0):"
    `\\(\\s*v?${MAJOR}\\.\\d+(?:\\.\\d+)?\\s*[,)]`,
    `\\(\\s*Identity\\s*\\(?\\s*v?${MAJOR}\\.\\d`,
    `Identity\\s*\\(\\s*v?${MAJOR}\\.\\d+(?:\\.\\d+)?\\s*\\)`,
    `\\bv?${MAJOR}\\.\\d+(?:\\.\\d+)?\\s*,\\s*(new|unchanged|beta|revised|updated|renamed)`,
    `^[*>\\u2022\\s]*\\bv?${MAJOR}\\.\\d+(?:\\.\\d+)?\\s*[\\u2014\\u2013-]`,
  ].join("|"),
  "im",
);

function mdFiles(): string[] {
  const out: string[] = [];
  for (const f of fs.readdirSync(root)) {
    if (f.endsWith(".md") && !HISTORICAL_BY_ROLE.test(f)) out.push(f);
  }
  const docs = path.join(root, "docs");
  for (const f of fs.readdirSync(docs)) {
    const full = path.join("docs", f);
    if (fs.statSync(path.join(docs, f)).isDirectory()) continue; // history/ etc. excluded
    if (HISTORICAL_BY_ROLE.test(full)) continue;
    out.push(full);
  }
  return out.sort();
}

let passed = 0;
const failures: string[] = [];
const ok = (label: string, cond: boolean, detail = ""): void => {
  if (cond) passed++;
  else failures.push(detail ? `${label} — ${detail}` : label);
  console.log(`  ${cond ? "ok " : "FAIL"} ${label}${cond ? "" : ` — ${detail}`}`);
};

test("docIdentity — current-facing documents name only the current release (outside historical context)", () => {
  console.log(`\n== doc identity scan (VH ${PRODUCT_VERSION}) ==\n`);
  const files = mdFiles();
  ok("the scan covers the current docs surface", files.length >= 10, `only ${files.length} files`);

  /* THE ANTI-DORMANCY PIN (19.7.10). The whole failure this suite is being
     repaired for was a regex that matched nothing, so it could never fail.
     A drift gate that cannot fail is worse than no gate: it manufactures
     confidence. These three assertions make vacuity itself a failure. */
  ok(`VERSION_RE is derived from the release identity (major ${MAJOR}), not hardcoded to a past major`,
    VERSION_RE.source.includes(`${MAJOR}\\.\\d`) && !VERSION_RE.source.includes("16\\.\\d"));
  /* Non-global copies: VERSION_RE carries /g, and a stateful lastIndex would
     make these assertions order-dependent. */
  const matchesOnce = new RegExp(VERSION_RE.source);
  ok("VERSION_RE actually matches the current release string — the gate is not vacuous",
    matchesOnce.test(PRODUCT_VERSION) && matchesOnce.test(`v${PRODUCT_VERSION}`));
  ok("VERSION_RE matches a STALE release string — the gate would catch drift",
    matchesOnce.test(`${MAJOR}.${Number(MINOR) > 0 ? Number(MINOR) - 1 : 0}.0`));
  ok("historical-by-role documents are excluded by NAME, not by accident",
    !files.some((f) => HISTORICAL_BY_ROLE.test(f)) && files.length >= 10);

  const offenders: string[] = [];
  let scanned = 0;
  let historicalRefs = 0;
  for (const rel of files) {
    const text = fs.readFileSync(path.join(root, rel), "utf8");
    const lines = text.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      VERSION_RE.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = VERSION_RE.exec(lines[i])) !== null) {
        const norm = m[1].replace(/^v/, "");
        if (HISTORICAL.test(lines[i])) { historicalRefs++; continue; }
        scanned++;
        if (norm === PRODUCT_VERSION) continue;
        offenders.push(`${rel}:${i + 1} → "${m[1]}" in: ${lines[i].trim().slice(0, 90)}`);
      }
    }
  }
  /* Clean-name policy: the product ships under its NAME. Lines labelled "Version of record" are the versioning policy speaking (docs/VERSIONING.md), not drift. Current-facing docs carry
     NO product version at all (stale-or-current is no longer the question — any
     number is drift). Historical records live in docs/history and are out of scope. */
  ok(`current docs carry zero product version mentions (scanned ${files.length} docs, ${scanned} mentions, ${historicalRefs} historical)`, scanned === 0, offenders.concat(files.filter(() => false)).slice(0, 6).join(" | ") || `${scanned} mention(s)`);
  void offenders;

  // identity lines: the flagship documents open under the product name, engine credited
  const readme = fs.readFileSync(path.join(root, "README.md"), "utf8");
  ok("README.md opens as SelfImpulse", readme.startsWith("# SelfImpulse"), readme.split("\n")[0]);
  ok("README.md credits the MJ engine", /\*\*MJ\*\* engine|MJ\*\* is the engine/.test(readme), "engine credit");
  ok("README.md names no product version", !/\b1[0-9]\.[0-9]+(\.[0-9]+)+\b/.test(readme), (readme.match(/\b1[0-9]\.[0-9]+(\.[0-9]+)+\b/) ?? [""])[0]);
  const features = fs.readFileSync(path.join(root, "docs", "releases", "FEATURES.md"), "utf8");
  ok("docs/releases/FEATURES.md opens as SelfImpulse and names no version", features.startsWith("# SelfImpulse") && !/\b1[0-9]\.[0-9]+\.[0-9]+\b/.test(features), features.split("\n")[0]);
  
  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length > 0) {
    console.log("\nfailures:");
    for (const f of failures) console.log(`  - ${f}`);
  }
  assert.equal(failures.length, 0, failures.join("; "));
});

test("docIdentity — protocol-version labels agree with the single source (17.10.3 review finding)", () => {
  /* The 17.10.3 external review found the security-review artifact still
     labelling the grant-authority surface "protocol v0.10.3" while the
     implementation and the threat model were both v0.10.4. This suite scans
     CURRENT-FACING surfaces for the label and requires every one of them to
     name the version the code actually declares. Historical records
     (CHANGELOG.md, *-UPGRADE.md, docs/history/) and protocol/src comments
     legitimately name older versions and are out of scope by design. */
  console.log("\n== protocol version label scan ==\n");
  const pkgVersion = JSON.parse(fs.readFileSync(path.join(root, "protocol", "package.json"), "utf8")).version as string;
  const core = fs.readFileSync(path.join(root, "protocol", "src", "core", "si-crypto.js"), "utf8");
  const cryptoVersion = core.match(/version:\s*"(\d+\.\d+\.\d+)"/)?.[1] ?? null;

  const localFailures: string[] = [];
  const okk = (label: string, cond: boolean, detail = ""): void => {
    console.log(`  ${cond ? "ok " : "FAIL"} ${label}${cond ? "" : ` — ${detail}`}`);
    if (!cond) localFailures.push(detail ? `${label} — ${detail}` : label);
  };

  okk(
    "protocol/package.json and si-crypto.js agree on the protocol version",
    cryptoVersion !== null && cryptoVersion === pkgVersion,
    `package.json ${pkgVersion} vs si-crypto.js ${cryptoVersion}`,
  );

  const LABEL_RE = /protocol v(\d+\.\d+\.\d+)/gi;
  const files: string[] = ["README.md", "protocol/README.md", "protocol/THREAT-MODEL.md"];
  const walk = (dir: string): void => {
    for (const e of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
      const rel = `${dir}/${e.name}`;
      if (e.isDirectory()) {
        if (e.name === "node_modules" || e.name === "dist" || e.name === "build") continue;
        walk(rel);
      } else if (/\.tsx?$/.test(e.name)) files.push(rel);
    }
  };
  walk("src");

  const offenders: string[] = [];
  let labels = 0;
  for (const rel of files) {
    const text = fs.readFileSync(path.join(root, rel), "utf8");
    for (const [i, line] of text.split(/\r?\n/).entries()) {
      LABEL_RE.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = LABEL_RE.exec(line)) !== null) {
        labels++;
        if (m[1] === pkgVersion) continue;
        offenders.push(`${rel}:${i + 1} — "protocol v${m[1]}" but the code declares v${pkgVersion}`);
      }
    }
  }
  okk(
    "every current-facing protocol-version label names the shipped protocol",
    offenders.length === 0,
    offenders.slice(0, 5).join(" | "),
  );
  okk(
    `the scan still finds the labels it guards (${labels} found, across ${files.length} files)`,
    labels > 0,
    "no label matched — the pattern no longer matches the codebase, so this gate guards nothing",
  );

  console.log(`\n${files.length} files scanned, ${labels} labels, ${localFailures.length} failed`);
  assert.equal(localFailures.length, 0, localFailures.join("; "));
});
