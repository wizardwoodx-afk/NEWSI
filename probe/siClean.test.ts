/**
 * SelfImpulse — clean-identity probe.
 *
 * Product is SelfImpulse. Engine is MJ. The human the owner talks to is Captain.
 * Retired predecessor names (assembled at runtime below) must not appear on
 * the routed surface. Wire-compat tokens (mj-proof-receipt, mj.* storage keys)
 * still exist so already-issued receipts and keys verify — compatibility, not
 * branding.
 *
 *   1. retired names do not appear on the routed product surface.
 *   2. the current receipt format is si-proof-receipt/2; the signed legacy
 *      fixture still verifies (back-compat contract).
 *   3. every persistence key in the control plane is "selfimpulse.*".
 *   4. identity strings (package, title, native identifier) are SelfImpulse / MJ.
 */

import assert from "node:assert";
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { test } from "node:test";
import { ENGINE_VERSION, PRODUCT_VERSION } from "../src/version";

const SI_ROOT = process.env.SI_ROOT ?? process.cwd();

declare const __SELFIMPULSE_ROOT__: string | undefined;
const ROOT = (typeof __SELFIMPULSE_ROOT__ !== "undefined" && __SELFIMPULSE_ROOT__) || process.env.SELFIMPULSE_ROOT || SI_ROOT;

/* The ROUTED product surface: everything a user can actually see or route to. */
const ROUTED_SURFACE: string[] = [
  "src/App.tsx",
  "src/main.tsx",
  "src/selfimpulse/pages/SelfImpulsePage.tsx",
  // the routed pages are the doors of src/ui (Docs joined in 19.7.13, Munshi after it).
  "src/ui/Shell.tsx",
  "src/ui/store.ts",
  "src/ui/screens/Steward.tsx",
  "src/ui/screens/Work.tsx",
  "src/ui/screens/Specialists.tsx",
  "src/ui/screens/Receipts.tsx",
  "src/ui/screens/Memory.tsx",
  "src/ui/screens/Settings.tsx",
  "src/ui/screens/Chat.tsx",
  "index.html",
  "package.json",
  "src-tauri/tauri.conf.json",
];
const SELFIMPULSEE_TREE = "src/selfimpulse";

function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}
function* walk(dir: string): Generator<string> {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else if (/\.(ts|tsx)$/.test(e.name)) yield p;
  }
}

/* Strip the wire-compat tokens — the ONLY places "mj" may survive:
 * legacy wire format names and the offline license secret name. Renaming
 * either would break verification of already-issued receipts and already-
 * issued license keys. */
function stripWireTokens(src: string): string {
  return src
    .replace(/mj-proof-receipt/gi, "")
    .replace(/mj-commercial-v1-offline/g, "")
    .replace(/mj_evolution/g, "")
    .replace(/legacy-mj-receipt/g, "")
    .replace(/mj-mission-record/g, "")
    .replace(/mj\.desktop/g, "")
    .replace(/mj\./g, "");
}

/** After wire tokens are stripped, retired PRODUCT names must not remain. MJ is the live engine. */
/* Assembled at runtime so the literal retired spellings never appear in the
 * shipped tree — not even in the detector that looks for them. */
const RETIRED_PRODUCT_RE = new RegExp(
  ["Vel", "vet Hand|selfimpulse", "hand|Vo", "uch SelfImpulse|vo", "uchselfimpulse|RO", "GUE|\\bro", "gue\\b"].join(""),
  "i",
);
function hasRetiredProductName(src: string): boolean {
  return RETIRED_PRODUCT_RE.test(src);
}

test("the routed product surface carries no retired predecessor (or ROGUE) name", () => {
  for (const rel of ROUTED_SURFACE) {
    const src = stripWireTokens(read(rel));
    assert.equal(hasRetiredProductName(src), false, `${rel} still references a retired product name`);
  }
});

test("the whole control-plane module (src/selfimpulse/**) carries no retired product name except the wire contract", () => {
  let scanned = 0;
  for (const abs of walk(path.join(ROOT, SELFIMPULSEE_TREE))) {
    scanned++;
    const rel = path.relative(ROOT, abs);
    const src = stripWireTokens(fs.readFileSync(abs, "utf8"));
    assert.equal(hasRetiredProductName(src), false, `${rel} still references a retired product name`);
  }
  assert.ok(scanned >= 6, `expected at least 6 modules under ${SELFIMPULSEE_TREE}, scanned ${scanned}`);
});

/* The clean identity covers the whole VISIBLE product surface: shell, pages,
 * panels, canvas, the IPC bridge, the browser stubs and the domain catalogs. */
const UI_LAYER = ["src/app", "src/ui", "src/panels", "src/canvas", "src/ipc", "src/browser", "src/domain"];

test("the visible product surface carries no retired product name (whole surface, not just the selfimpulse tree)", () => {
  let scanned = 0;
  for (const dir of UI_LAYER) {
    for (const abs of walk(path.join(ROOT, dir))) {
      scanned++;
      const rel = path.relative(ROOT, abs);
      const src = stripWireTokens(fs.readFileSync(abs, "utf8"));
      assert.equal(hasRetiredProductName(src), false, `${rel} still references a retired product name`);
    }
  }
  assert.ok(scanned >= 30, `expected a real UI surface under the audited dirs, scanned ${scanned}`);
});

test("the web entry, IPC bridge, and styles carry no retired product name", () => {
  for (const rel of ["src/main.tsx", "src/ipc/client.ts", "src/ipc/localDb.ts", "src/ui/vh.css", "index.html"]) {
    const src = stripWireTokens(read(rel));
    assert.equal(hasRetiredProductName(src), false, `${rel} still references a retired product name`);
  }
});

test("identity strings are SelfImpulse (product) on the MJ engine", () => {
  const pkg = JSON.parse(read("package.json"));
  assert.equal(pkg.name, "selfimpulse");
  /* RE-ANCHORED at the owner's instruction, 2026-10-02: the tagline became
   * "Agentic impulse for remaining". This line used to pin the old wording
   * verbatim. It now asserts the property that made pinning the wording worth
   * doing — that the product's ONE tagline is present in the description — by
   * reading the tagline from its single source (src/brand.ts) and requiring the
   * manifest to carry it, rather than hardcoding a second copy of the string
   * here. Two copies of a tagline is how the two drift; one copy plus a check is
   * how they cannot. */
  const brandSrc = read("src/brand.ts");
  const tagline = brandSrc.match(/PRODUCT_TAGLINE\s*=\s*"([^"]+)"/)?.[1] ?? "";
  assert.ok(tagline.length > 0, "src/brand.ts declares PRODUCT_TAGLINE");
  assert.ok(
    (pkg.description ?? "").toLowerCase().includes(tagline.toLowerCase()),
    `package description carries the tagline (${tagline}): ${pkg.description}`,
  );
  assert.ok(!hasRetiredProductName(pkg.description ?? ""), `package description: ${pkg.description}`);
  const html = read("index.html");
  assert.ok(/<title>\s*SelfImpulse/.test(html), "index.html title");
  const tauri = read("src-tauri/tauri.conf.json");
  const conf = JSON.parse(tauri);
  assert.equal(conf.identifier, "com.selfimpulse.app", "the bundle identifier names the product");
  const migrateRs = read("src-tauri/src/migrate.rs");
  assert.ok(migrateRs.includes('LEGACY_IDENTIFIER: &str = "com.elevenhandle.app"') && /fn migrate_legacy_data/.test(migrateRs), "the identifier rename carries a data migration, so an existing install keeps its database");
  assert.ok(/migrate::migrate_legacy_data\(&data/.test(read("src-tauri/src/lib.rs")), "the migration runs at startup, before the data directory is created");
  assert.ok(!/elevenhandle/i.test(read("src-tauri/capabilities/desktop.json")) && !/\bVH 4\b/.test(read("src-tauri/capabilities/desktop.json")), "the capability description is the product's");
  assert.ok(!/VH — agent workstation/.test(read("src-tauri/src/lib.rs")), "the tray tooltip names the product");
  assert.equal(conf.productName, "SelfImpulse");
  assert.ok(conf.bundle.longDescription.startsWith("SelfImpulse") && conf.bundle.longDescription.includes("MJ engine"), "native description");
  const brand = read("src/brand.ts");
  assert.ok(/PRODUCT_NAME = "SelfImpulse"/.test(brand) && /ENGINE_NAME = "MJ"/.test(brand), "brand.ts is the one source of both names");
  assert.ok(/\{PRODUCT_NAME\}/.test(read("src/ui/Shell.tsx")), "the sidebar brand reads from brand.ts");
  const ver = read("src/version.ts");
  assert.ok(new RegExp(`export const ENGINE_VERSION = "${ENGINE_VERSION.replace(/\\./g, "\\\\.")}"`).test(ver), `engine version constant in src/version.ts matches ${ENGINE_VERSION}`);
  assert.ok(new RegExp(`export const PRODUCT_VERSION = "${PRODUCT_VERSION.replace(/\\./g, "\\\\.")}"`).test(ver), `product version constant in src/version.ts matches ${PRODUCT_VERSION}`);
});

test("every control-plane persistence key is selfimpulse.*", () => {
  const keys = new Set<string>();
  for (const abs of walk(path.join(ROOT, SELFIMPULSEE_TREE))) {
    const src = fs.readFileSync(abs, "utf8");
    const re = /["']((?:selfimpulse|mj|rogue)\.[a-z0-9.]+)["']/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src))) keys.add(m[1]);
  }
  assert.ok(keys.size >= 5, `expected selfimpulse.* keys to be found, got ${keys.size}`);
  for (const k of keys) {
    assert.ok(k.startsWith("selfimpulse."), `legacy persistence key still present: ${k}`);
  }
});

test("the current wire format is si-proof-receipt/2 and the legacy fixture still verifies", async () => {
  const { buildChainedReceipt, verifyProofReceipt, receiptFromJsonl } = await import("../src/selfimpulse/engine/proof.js");
  const now = new Date().toISOString();
  const r = await buildChainedReceipt({
    mission: "clean-identity-check",
    teamId: "selfimpulse",
    startedAt: now,
    finishedAt: now,
    version: ENGINE_VERSION,
    edition: "offline",
    events: [{ kind: "selfimpulse.session", seatId: "selfimpulse-core", data: { hello: "clean" } }],
  });
  assert.equal(r.format, "si-proof-receipt/2", "new receipts emit the current wire format");
  const fresh = await verifyProofReceipt(r);
  assert.equal(fresh.ok, true, `a fresh vh/2 receipt verifies in-process${fresh.ok ? "" : " — " + (fresh as { reason: string }).reason}`);

  const legacyText = fs.readFileSync(path.join(ROOT, "probe/fixtures/legacy-mj-receipt.jsonl"), "utf8");
  const legacy = receiptFromJsonl(legacyText);
  assert.ok(legacy, "the signed legacy fixture parses");
  assert.equal(legacy.format, "mj-proof-receipt/2", "the fixture is a signed legacy-v2 receipt");
  const v = await verifyProofReceipt(legacy);
  assert.equal(v.ok, true, "back-compat: the legacy fixture still verifies through the same verifier");
});

test("the offline CLI accepts both wires and rejects tampering", async () => {
  const { buildChainedReceipt, receiptToJsonl } = await import("../src/selfimpulse/engine/proof.js");
  const now = new Date().toISOString();
  const fresh = await buildChainedReceipt({ mission: "cli-fresh-check", teamId: "selfimpulse", startedAt: now, finishedAt: now, version: ENGINE_VERSION, edition: "offline", events: [{ kind: "selfimpulse.session", seatId: "selfimpulse-core", data: { x: 1 } }] });
  const freshPath = path.join(ROOT, "probe/.vhClean-fresh.jsonl");
  fs.writeFileSync(freshPath, receiptToJsonl(fresh));
  let freshCode = 0;
  try {
    execFileSync(process.execPath, [path.join(ROOT, "tools/verify-receipt.mjs"), freshPath], { encoding: "utf8" });
  } catch (e) {
    freshCode = (e as { status?: number }).status ?? 1;
  }
  fs.rmSync(freshPath, { force: true });
  assert.ok(freshCode === 0 || freshCode === 3, `fresh vh/2 receipt should verify via CLI, got exit ${freshCode}`);

  const tool = path.join(ROOT, "tools/verify-receipt.mjs");
  const src = read("tools/verify-receipt.mjs");
  for (const fmt of ["si-proof-receipt/2", "mj-proof-receipt/2", "mj-proof-receipt/1"]) {
    assert.ok(src.includes(fmt), `verifier accepts ${fmt}`);
  }
  // legacy fixture → VALID (signature-only: exit 0 or 3)
  let code = 0;
  try {
    execFileSync(process.execPath, [tool, path.join(ROOT, "probe/fixtures/legacy-mj-receipt.jsonl")], { encoding: "utf8" });
  } catch (e) {
    code = (e as { status?: number }).status ?? 1;
  }
  assert.ok(code === 0 || code === 3, `legacy fixture should verify via CLI, got exit ${code}`);
  // tamper ONE hex char in the last event's hash → INVALID (exit 1)
  const tamperedPath = path.join(ROOT, "probe/.vhClean-tampered.jsonl");
  const legacyText = fs.readFileSync(path.join(ROOT, "probe/fixtures/legacy-mj-receipt.jsonl"), "utf8");
  const lines = legacyText.split("\n").filter(Boolean);
  const last = JSON.parse(lines[lines.length - 1]) as { hash: string };
  last.hash = (last.hash.startsWith("0") ? "1" : "0") + last.hash.slice(1);
  lines[lines.length - 1] = JSON.stringify(last);
  fs.writeFileSync(tamperedPath, lines.join("\n") + "\n");
  try {
    execFileSync(process.execPath, [tool, tamperedPath], { encoding: "utf8" });
    assert.fail("tampered receipt must not verify");
  } catch (e) {
    const ec = (e as { status?: number }).status ?? 0;
    assert.equal(ec, 1, `tampered legacy receipt must exit 1, got ${ec}`);
  } finally {
    fs.rmSync(tamperedPath, { force: true });
  }
});

console.log("vhClean probe complete");
