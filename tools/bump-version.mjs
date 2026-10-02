#!/usr/bin/env node
/**
 * bump-version.mjs — move the tree from one release identity to the next.
 *
 *   node tools/bump-version.mjs --to 19.6.1 [--from 19.6.0] [--name Federation] [--check]
 *   node tools/bump-version.mjs patch|minor|major [--check]   ← derive --to from src/version.ts
 *   node tools/bump-version.mjs show                          ← print the current identity
 *
 * The positional forms are what package.json's bump:patch / bump:minor /
 * bump:show scripts call; the tool used to reject them ("--to is required"),
 * so every convenience command shipped broken. `patch|minor|major` read the
 * CURRENT engine version from src/version.ts (the single source of truth),
 * derive the next one, and never rename the codename unless --name says so.
 *
 * Every edit is anchored: if a line this script expects is not present it
 * REFUSES and says which one, rather than guessing. It touches version surfaces
 * and the release-note surfaces the host's own drift gate pins — never a core
 * module's behaviour.
 *
 * Why this exists as a tool rather than a one-off: the version identity of this
 * product is spread across nine files and four documents, and a release that
 * moves eight of them is worse than one that moves none. `--check` prints what
 * it would do without writing.
 */
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const argv = process.argv.slice(2);
const dry = argv.includes("--check");
const arg = (flag, fallback) => {
  const i = argv.indexOf(flag);
  return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : fallback;
};

/* The single source of truth — also what the positionals derive from. */
const versionTs = (() => {
  try { return fs.readFileSync(path.join(root, "src/version.ts"), "utf8"); } catch { return ""; }
})();
const CURRENT = versionTs.match(/export const ENGINE_VERSION = "([^"]+)"/)?.[1] ?? null;
const CURRENT_CODENAME = versionTs.match(/export const ENGINE_CODENAME = "([^"]+)"/)?.[1] ?? null;
const positional = argv.find((a) => !a.startsWith("-")) ?? null;

if (positional === "show") {
  console.log(CURRENT ? `${CURRENT} ${CURRENT_CODENAME ?? "?"}` : "bump-version.mjs: src/version.ts unreadable");
  process.exit(CURRENT ? 0 : 1);
}

const OLD = arg("--from", CURRENT ?? "19.5.6");
let NEW = arg("--to", null);
if (!NEW && ["patch", "minor", "major"].includes(positional)) {
  if (!CURRENT || !/^\d+\.\d+\.\d+$/.test(CURRENT)) {
    console.error(`bump-version.mjs: cannot derive ${positional} bump — ENGINE_VERSION not found in src/version.ts`);
    process.exit(2);
  }
  const [M, m, p] = CURRENT.split(".").map(Number);
  NEW = positional === "major" ? `${M + 1}.0.0`
    : positional === "minor" ? `${M}.${m + 1}.0`
    : `${M}.${m}.${p + 1}`;
}
if (!NEW) {
  console.error("bump-version.mjs: --to <version> is required (e.g. --to 19.6.1), or one of: patch | minor | major | show");
  process.exit(2);
}
const short = (v) => v.split(".").slice(0, 2).join(".");
const OLD_SHORT = short(OLD);
const NEW_SHORT = short(NEW);
/* Codename renames are opt-in: without --name the current codename stands.
   (The old default, "Federation", silently renamed every bump.) */
const NAME = arg("--name", CURRENT_CODENAME ?? "Federation");

const problems = [];
let edits = 0;

const require_ = (text, needle, rel) => {
  if (!text.includes(needle)) {
    problems.push(`${rel}: anchor not found -> ${JSON.stringify(needle.slice(0, 80))}`);
    return false;
  }
  return true;
};

function editFile(rel, apply) {
  const p = path.join(root, rel);
  if (!fs.existsSync(p)) {
    problems.push(`${rel}: file missing`);
    return;
  }
  const before = fs.readFileSync(p, "utf8");
  const after = apply(before, rel);
  if (after === null) return;
  if (after === before) {
    problems.push(`${rel}: no change applied (anchor present but text identical?)`);
    return;
  }
  edits += 1;
  if (!dry) fs.writeFileSync(p, after);
  console.log(`  ${dry ? "would update" : "updated"} ${rel}`);
}

console.log(`bump ${OLD} -> ${NEW}${OLD_SHORT === NEW_SHORT ? ` (short stays ${NEW_SHORT})` : ` (${OLD_SHORT} -> ${NEW_SHORT})`}, codename ${NAME}${dry ? " — check only" : ""}`);

/* ── 1. the single source of truth ────────────────────────────────────────── */
editFile("src/version.ts", (t, rel) => {
  if (!require_(t, `export const ENGINE_VERSION = "${OLD}";`, rel)) return null;
  let out = t
    .replace(`export const ENGINE_VERSION = "${OLD}";`, `export const ENGINE_VERSION = "${NEW}";`)
    .replace(`export const ENGINE_SHORT = "${OLD_SHORT}";`, `export const ENGINE_SHORT = "${NEW_SHORT}";`);
  const codenameLine = new RegExp(`export const ENGINE_CODENAME = "([^"]+)";`);
  const found = t.match(codenameLine)?.[1];
  if (found && found !== NAME) out = out.replace(`export const ENGINE_CODENAME = "${found}";`, `export const ENGINE_CODENAME = "${NAME}";`);
  return out;
});

/* ── 2. the engine manifests (product manifests stay at PRODUCT_VERSION) ──── */
/* package-lock.json, src-tauri/Cargo.toml and tauri.conf.json are PRODUCT
   manifests — versionDrift asserts they equal PRODUCT_VERSION (1.0.0), so an
   engine bump must not touch them; requiring the engine number there made
   every run refuse. VERSION.txt and docs/VERSIONING.md are engine surfaces
   the drift gate pins but this tool never moved — a "successful" bump used
   to leave the gate red. */
editFile("package.json", (t, rel) => {
  if (!require_(t, `"version": "${OLD}"`, rel)) return null;
  return t.replace(`"version": "${OLD}"`, `"version": "${NEW}"`);
});
editFile("VERSION.txt", (t, rel) => {
  if (!require_(t, `Engine release: MJ ${OLD}`, rel)) return null;
  let out = t.replace(`MJ ${OLD}`, `MJ ${NEW}`);
  const escN = NEW.replace(/\./g, "\\.");
  const m = out.match(new RegExp(`(Engine release: MJ ${escN} \\(")[^"]+("\\))`));
  if (m && m[1] + NAME + m[2] !== m[0]) out = out.replace(m[0], `${m[1]}${NAME}${m[2]}`);
  return out;
});
editFile("docs/VERSIONING.md", (t, rel) => {
  if (!require_(t, `engine MJ ${OLD}`, rel)) return null;
  let out = t.split(`MJ ${OLD}`).join(`MJ ${NEW}`);
  const escN = NEW.replace(/\./g, "\\.");
  out = out.replace(new RegExp(`MJ ${escN} \\("[^"]*"\\)`, "g"), `MJ ${NEW} ("${NAME}")`);
  return out;
});

/* ── 3. the offline pack's provenance identity ────────────────────────────── */
/* Current format: `SelfImpulse 1.0.0 (engine MJ 19.7.15 "SelfImpulse")` and
   `built: 19.7.15 SelfImpulse` — the old `SelfImpulse ${OLD}` anchor predated
   the product/engine split and refused on every run. */
editFile("verify/BUILD-INFO.txt", (t, rel) => {
  const esc = (v) => v.replace(/\./g, "\\.");
  if (!require_(t, `engine MJ ${OLD}`, rel)) return null;
  if (!require_(t, `built: ${OLD}`, rel)) return null;
  let out = t
    .replace(`engine MJ ${OLD}`, `engine MJ ${NEW}`)
    .replace(`built: ${OLD}`, `built: ${NEW}`);
  // 19.7.14: the codename lives in version.ts, but this record names the release too —
  // renaming one without the other left the pack opening as a retired codename.
  const m = out.match(new RegExp(`^(SelfImpulse \\S+ \\(engine MJ ${esc(NEW)} ")[^"]+`));
  if (m && m[1] + NAME !== m[0]) out = out.replace(m[0], `${m[1]}${NAME}`);
  out = out.replace(new RegExp(`^(built:\\s*${esc(NEW)} )[^\\s\\n]+`, "m"), `$1${NAME}`);
  const line1 = out.split("\n")[0] ?? "";
  if (!line1.includes(NAME) || !new RegExp(`^built:\\s*${esc(NEW)}\\b`, "m").test(out)) {
    problems.push(`${rel}: codename ${NAME} did not land in the record`);
    return null;
  }
  return out;
});

/* ── 4. the MCP server's own version constant and header ──────────────────── */
editFile("src/engine/reachMcp.ts", (t, rel) => {
  if (!require_(t, `export const REACH_MCP_VERSION = "${OLD}";`, rel)) return null;
  return t
    .replace(`export const REACH_MCP_VERSION = "${OLD}";`, `export const REACH_MCP_VERSION = "${NEW}";`)
    .replace(`AGENT REACH MCP — ${OLD}`, `AGENT REACH MCP — ${NEW}`);
});

/* ── 5. what a SHORT change also moves (surfaced, not silently skipped) ────── */
/* versionDrift pins `SI-<short>-UPGRADE.md`'s existence and its mention in
   release.yml's releaseBody. Those are release-NOTE artifacts, not version
   strings — a tool that rewrites them would be inventing history — so say so
   instead of pretending the bump is complete. */
if (OLD_SHORT !== NEW_SHORT) {
  console.log(`  note: short ${OLD_SHORT} -> ${NEW_SHORT} also needs SI-${NEW_SHORT}-UPGRADE.md`);
  console.log(`        (docs/releases) and release.yml's releaseBody to point at it.`);
}

console.log(`\n${edits} file(s) ${dry ? "to change" : "changed"}`);
if (problems.length > 0) {
  console.error("\nrefusals:");
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
