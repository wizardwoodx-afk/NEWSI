import { createRequire as __mjCreateRequire } from "node:module"; const require = __mjCreateRequire(import.meta.url);

// probe/versionDrift.test.ts
import * as fs from "node:fs";
import * as path from "node:path";

// src/version.ts
var PRODUCT_VERSION = "1.9.2";
var ENGINE_VERSION = "19.7.16";
var ENGINE_SHORT = "19.7";
var ENGINE_CODENAME = "SelfImpulse";
var PRODUCT_TITLE = `SelfImpulse (engine MJ ${ENGINE_SHORT} "${ENGINE_CODENAME}")`;

// probe/versionDrift.test.ts
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
var root = ".".length > 0 ? "." : path.resolve(process.cwd(), "package.json").startsWith("/home/user/mj") || fs.existsSync(path.join(process.cwd(), "package.json")) ? process.cwd() : path.resolve(__dirname ?? process.cwd(), "..");
if (!fs.existsSync(path.join(root, "package.json"))) {
  console.error(`versionDrift: cannot find the project root (looked in ${root}). Rebuild with --define:SI_ROOT='"'$(pwd)'"'.`);
  process.exit(2);
}
console.log(`project root: ${root}`);
var read = (p) => fs.readFileSync(path.join(root, p), "utf8");
var json = (p) => JSON.parse(read(p));
section("0. the single source of truth is well formed");
ok("ENGINE_VERSION looks like a semver release (3 or 4 numeric parts \u2014 19.7.2.1 ships a patch-of-patch)", /^\d+\.\d+\.\d+(?:\.\d+)?$/.test(ENGINE_VERSION), ENGINE_VERSION);
ok("ENGINE_SHORT is the major.minor of ENGINE_VERSION", ENGINE_SHORT === ENGINE_VERSION.split(".").slice(0, 2).join("."), `${ENGINE_VERSION} -> ${ENGINE_SHORT}`);
ok("PRODUCT_VERSION is a product semver and is not the engine number", /^\d+\.\d+\.\d+$/.test(PRODUCT_VERSION) && PRODUCT_VERSION !== ENGINE_VERSION, `${PRODUCT_VERSION} vs ${ENGINE_VERSION}`);
ok("docs/VERSIONING.md is the policy of record for the pair", read("docs/VERSIONING.md").includes(`product ${PRODUCT_VERSION}`) && read("docs/VERSIONING.md").includes(`engine MJ ${ENGINE_VERSION}`), "docs/VERSIONING.md");
ok(
  "PRODUCT_TITLE is the product name with the engine identity beside it",
  PRODUCT_TITLE === `SelfImpulse (engine MJ ${ENGINE_SHORT} "${ENGINE_CODENAME}")`,
  PRODUCT_TITLE
);
section("1. product manifests state PRODUCT_VERSION; engine sites name ENGINE_VERSION");
var pkg = json("package.json");
var lock = json("package-lock.json");
var cargo = read("src-tauri/Cargo.toml");
var tauriConf = json("src-tauri/tauri.conf.json");
ok(`package.json is ${PRODUCT_VERSION}`, pkg.version === PRODUCT_VERSION, pkg.version);
ok(`package-lock.json top-level is ${PRODUCT_VERSION}`, lock.version === PRODUCT_VERSION, lock.version);
ok(`package-lock.json packages[""] is ${PRODUCT_VERSION}`, lock.packages[""]?.version === PRODUCT_VERSION, lock.packages[""]?.version ?? "missing");
ok("the lock file describes the same package as package.json", lock.packages[""]?.name === pkg.name, `${lock.packages[""]?.name} vs ${pkg.name}`);
ok(`Cargo.toml is ${PRODUCT_VERSION}`, cargo.split("\n").some((l) => l.startsWith("version = ") && l.includes(PRODUCT_VERSION)), (cargo.split("\n").find((l) => l.startsWith("version = ")) ?? ["none"])[0]);
ok(`tauri.conf.json is ${PRODUCT_VERSION}`, tauriConf.version === PRODUCT_VERSION, tauriConf.version);
var pkgTyped = pkg;
ok("package.json carries the engine release in its engine field", pkgTyped.engine?.version === ENGINE_VERSION && pkgTyped.engine?.name === "MJ", JSON.stringify(pkgTyped.engine));
var versionTxt = read("VERSION.txt");
ok(`VERSION.txt states both numbers (product ${PRODUCT_VERSION} / engine ${ENGINE_VERSION})`, versionTxt.includes(`Product release: ${PRODUCT_VERSION}`) && versionTxt.includes("Engine release:") && versionTxt.includes(ENGINE_VERSION), versionTxt.split("\n").slice(0, 3).join(" | "));
ok("Cargo.toml package name is the clean product name", /^name\s*=\s*"selfimpulse"/m.test(cargo) && /name = "selfimpulse_lib"/.test(cargo), "Cargo identity");
var buildInfoIdentity = read("verify/BUILD-INFO.txt");
ok(
  `BUILD-INFO.txt opens as SelfImpulse ${PRODUCT_VERSION} naming the engine ${ENGINE_VERSION} (no stale release identity)`,
  buildInfoIdentity.startsWith(`SelfImpulse ${PRODUCT_VERSION}`) && buildInfoIdentity.includes(ENGINE_VERSION),
  (buildInfoIdentity.split("\n")[0] ?? "missing").slice(0, 80)
);
ok(
  `BUILD-INFO.txt's built: line names ${ENGINE_VERSION} (no stale build identity)`,
  new RegExp(`^built:\\s*${ENGINE_VERSION.replace(/\./g, "\\.")}\\b`, "m").test(buildInfoIdentity),
  (buildInfoIdentity.split("\n").find((l) => l.startsWith("built:")) ?? "missing built: line").slice(0, 60)
);
ok(
  `BUILD-INFO.txt's identity line names the codename ${ENGINE_CODENAME} (a release renames the record)`,
  buildInfoIdentity.split("\n")[0].includes(ENGINE_CODENAME),
  (buildInfoIdentity.split("\n")[0] ?? "missing").slice(0, 80)
);
section("2. the app imports the version instead of hardcoding it");
var ipcClient = read("src/ipc/client.ts");
var settings = read("src/ui/screens/Settings.tsx");
ok("ipc/client.ts imports ENGINE_VERSION", /from "\.\.\/version"/.test(ipcClient) && /ENGINE_VERSION/.test(ipcClient), "no import found");
ok("Settings \u2192 About shows the product + engine names, never a version number", /from "\.\.\/\.\.\/brand"/.test(settings) && /PRODUCT_NAME/.test(settings) && /ENGINE_CREDIT/.test(settings) && !/ENGINE_VERSION/.test(settings), "About still shows a version");
ok("src/brand.ts is the one source of the product name and carries no number", /PRODUCT_NAME = "SelfImpulse"/.test(read("src/brand.ts")) && !/\d+\.\d+\.\d+/.test(read("src/brand.ts")));
ok("no hardcoded release string survives in ipc/client.ts", !/version:\s*"\d+\.\d+\.\d+"/.test(ipcClient), (ipcClient.match(/version:\s*"\d+\.\d+\.\d+"/) ?? [""])[0]);
ok("no hardcoded release string survives in Settings", !/VH \d+\.\d+|"19\.\d+\.\d+/.test(settings), (settings.match(/VH \d+\.\d+|"19\.\d+\.\d+/) ?? [""])[0]);
section("3. the shipped documents name the current release");
var OPERATIONAL_DOCS = ["README.md", "docs/setup/BUILD-NATIVE.md", "docs/setup/DESKTOP-NATIVE.md", "docs/setup/INSTALL-ON-LAPTOP.md", "docs/setup/DEPLOY-VERCEL.md", "docs/internal/PLATFORM-LIMITS.md"];
var docs = [...OPERATIONAL_DOCS];
for (const doc of docs) {
  const firstLine = read(doc).split("\n")[0] ?? "";
  const stale = firstLine.match(/VH (\d+\.\d+)/);
  const staleFull = firstLine.match(/VH (\d+(?:\.\d+){2,3})/);
  ok(`${doc} title does not name a stale release`, stale === null || stale[1] === ENGINE_SHORT, firstLine.slice(0, 70));
  ok(
    `${doc} title carries the exact release patch (${ENGINE_VERSION})`,
    staleFull === null || staleFull[1] === ENGINE_VERSION,
    staleFull ? `title says ${staleFull[1]}` : "title names no full version"
  );
}
for (const doc of OPERATIONAL_DOCS) {
  let body = read(doc).replace(/docs\/history\/(VH|11H)-[0-9.]+[-A-Za-z0-9_]*\.md/g, "").replace(/\b(VH|11H)-[0-9]+\.[0-9]+\.[0-9]+-[A-Za-z0-9-]*\.md\b/g, "");
  body = body.replace(/\bSI-[0-9]+\.[0-9]+-UPGRADE\.md\b/g, "");
  const staleTokens = [...new Set(
    [...body.matchAll(/(?:VH|11H|SelfImpulse)[ _-]?(\d+(?:\.\d+){2,3})|(\d+(?:\.\d+){2,3})_x64/gi)].map((m) => (m[1] ?? m[2] ?? "").trim()).filter((v) => v.length > 0 && v !== ENGINE_VERSION && v !== PRODUCT_VERSION)
  )];
  ok(
    `${doc} names no release other than ${PRODUCT_VERSION} / ${ENGINE_VERSION} in its body`,
    staleTokens.length === 0,
    `stale: ${staleTokens.join(", ")}`
  );
}
section("4. the archive name the user is given matches the release");
var upgradeDoc = `SI-${ENGINE_SHORT}-UPGRADE.md`;
ok(`${upgradeDoc} exists`, fs.existsSync(path.join(root, upgradeDoc)) || fs.existsSync(path.join(root, "docs", "history", upgradeDoc)) || fs.existsSync(path.join(root, "docs", "releases", upgradeDoc)), "missing \u2014 the release notes for this version were never written");
section("5. CI targets runners that still exist");
var wfDir = path.join(root, ".github", "workflows");
var workflowFiles = fs.existsSync(wfDir) ? fs.readdirSync(wfDir).filter((f) => /\.ya?ml$/.test(f)).sort() : [];
ok(`workflows exist (${workflowFiles.length} file(s))`, workflowFiles.length > 0, ".github/workflows is empty or missing");
var RETIRED_RUNNERS = ["macos-12", "macos-13", "macos-14", "ubuntu-20.04", "ubuntu-22.04"];
var retiredHits = [];
for (const wf of workflowFiles) {
  const src = read(path.join(".github", "workflows", wf));
  const executable = src.split("\n").filter((l) => !/^\s*#/.test(l)).join("\n");
  const labels = [];
  for (const m of executable.matchAll(/runs-on:\s*(\S+)/g)) labels.push(m[1]);
  for (const m of executable.matchAll(/^[\t ]*-[\t ]*os:[\t ]*(\S+)/gm)) labels.push(m[1]);
  for (const raw of labels) {
    const label = raw.replace(/["']/g, "");
    if (RETIRED_RUNNERS.some((r) => label === r || label.startsWith(`${r}-`))) {
      retiredHits.push(`${wf} -> ${label}`);
    }
  }
}
ok(
  `no workflow targets a retired runner (${RETIRED_RUNNERS.length} banned labels)`,
  retiredHits.length === 0,
  retiredHits.join(" | ") || "all labels current"
);
var releaseWf = read(".github/workflows/release.yml");
ok(`releaseBody names ${upgradeDoc}`, releaseWf.includes(upgradeDoc), "the release notes link to the wrong version");
ok(
  "the release gate runs the SAME suite CI runs (npm test, not a subset)",
  /npm test/.test(releaseWf) && !/for f in versionDrift/.test(releaseWf),
  "release.yml still gates on a hand-picked subset"
);
section("6. README counts match the code");
var rustFiles = fs.readdirSync(path.join(root, "src-tauri", "src")).filter((f) => f.endsWith(".rs")).sort();
var commandCount = 0;
for (const f of rustFiles) {
  for (const line of read(path.join("src-tauri", "src", f)).split("\n")) {
    if (line.trim().startsWith("#[tauri::command]")) commandCount += 1;
  }
}
var readmeLayout = read("README.md");
var readmeCount = readmeLayout.match(/#\s*(\d+)\s+Tauri commands/);
ok(
  `README layout names the real Tauri command count (${commandCount} across ${rustFiles.length} rust files)`,
  readmeCount === null || Number(readmeCount[1]) === commandCount,
  readmeCount === null ? "README no longer names a count" : `README says ${readmeCount[1]}, code has ${commandCount}`
);
var suiteFiles = fs.readdirSync(path.join(root, "probe")).filter((f) => (f.endsWith(".test.ts") || f.endsWith(".test.tsx")) && !f.startsWith(".")).sort();
var readmeSuites = readmeLayout.match(/#\s*(\d+)\s+suites\s*$/m);
ok(
  `README run-it comment names the real probe suite count (${suiteFiles.length})`,
  readmeSuites === null || Number(readmeSuites[1]) === suiteFiles.length,
  readmeSuites === null ? "README no longer names a suite count" : `README says ${readmeSuites[1]}, probe/ has ${suiteFiles.length}`
);
var manifest = json("verify/MANIFEST.json");
ok(
  `the offline pack holds every suite except itself (${suiteFiles.length - 1} bundles)`,
  manifest.suiteCount === suiteFiles.length - 1,
  `manifest ${manifest.suiteCount} vs probe/ ${suiteFiles.length}`
);
var readmeBundles = readmeLayout.match(/(\d+)\s+bundles/);
ok(
  `README layout names the real bundle count (${manifest.suiteCount})`,
  readmeBundles === null || Number(readmeBundles[1]) === manifest.suiteCount,
  readmeBundles === null ? "README no longer names a bundle count" : `README says ${readmeBundles[1]}, pack has ${manifest.suiteCount}`
);
console.log(`
${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log("\nfailures:");
  for (const f of failures) console.log(`  - ${f}`);
}
process.exit(failed > 0 ? 1 : 0);
