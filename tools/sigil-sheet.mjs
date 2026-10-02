#!/usr/bin/env node
/**
 * sigil-sheet.mjs — render a contact sheet of the Federation sigils.
 *
 *   node tools/sigil-sheet.mjs [out.html] [count]
 *
 * Design QA, not decoration: the sheet shows a spread of real identities, the
 * every state on one identity, and the same face at 16/24/32/48/96 px so the
 * legibility floor is visible rather than assumed. The state list comes from
 * the module (SIGIL_STATES) — a sheet cannot show a different set than the app. Bundled with the tree's own
 * esbuild; no dependency the repo does not already carry.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { buildSync } from "esbuild";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = process.argv[2] ?? path.join(root, "sigil-sheet.html");
const count = Number(process.argv[3] ?? 24);

const tmp = path.join(os.tmpdir(), `si-sigil-${process.pid}.mjs`);
buildSync({
  entryPoints: [path.join(root, "src", "engine", "federation", "sigil.ts")],
  bundle: true, platform: "node", format: "esm", packages: "external",
  outfile: tmp, logLevel: "error",
});
const S = await import(pathToFileURL(tmp).href);
fs.unlinkSync(tmp);

const NAMES = [
  "owner:priya", "owner:ana", "owner:kenji", "owner:tom", "owner:rosa", "owner:ivan",
  "selfimpulse:reykjavik", "selfimpulse:lisbon", "selfimpulse:osaka", "selfimpulse:denver", "selfimpulse:nairobi", "selfimpulse:quebec",
  "specialist:energy-systems.assess", "specialist:clinical-trials.verify", "specialist:payments.build",
  "specialist:rail-signalling.audit", "specialist:water-utilities.sustain", "specialist:taxation.design",
  "peer:acme-corp", "peer:northwind", "peer:helio-labs", "peer:brightwater", "peer:meridian", "peer:sable-group",
  "seat:coder-01", "seat:reviewer-01", "seat:researcher-01", "crew:chief-steward",
];
const seeds = Array.from({ length: count }, (_, i) => NAMES[i % NAMES.length] ?? `identity-${i}`);

const report = S.collisionReport(seeds);
const states = S.SIGIL_STATES;

const grid = seeds
  .map((seed) => {
    const sigil = S.sigilOf(seed);
    return `<figure>${S.sigilSvg(sigil, { size: 84 })}<figcaption><b>${seed}</b><span>${sigil.fingerprint}</span><em>${S.sigilSummary(sigil)}</em></figcaption></figure>`;
  })
  .join("\n");

const one = S.sigilOf("owner:priya");
const stateRow = states
  .map((st) => `<figure>${S.sigilSvg(one, { size: 76, state: st })}<figcaption><b>${st}</b><span>${S.SIGIL_STATE_WORDS[st]}</span></figcaption></figure>`)
  .join("\n");

const sizeRow = [16, 24, 32, 48, 96]
  .map((px) => `<figure>${S.sigilSvg(one, { size: px })}<figcaption><b>${px}px</b></figcaption></figure>`)
  .join("\n");

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>SelfImpulse — Federation sigils</title>
<style>
  :root { --paper:#f7f5f1; --ink:#26231d; --line:#e8eaed; --muted:#8a8c96; }
  * { box-sizing:border-box; }
  body { margin:0; padding:36px 40px 64px; background:var(--paper); color:var(--ink);
         font:13px/1.5 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif; }
  h1 { font-size:19px; letter-spacing:-.01em; margin:0 0 4px; }
  h2 { font-size:12px; text-transform:uppercase; letter-spacing:.08em; color:var(--muted);
       margin:34px 0 14px; font-weight:600; }
  p.lede { margin:0 0 6px; color:#5d5a52; max-width:78ch; }
  .grid { display:grid; grid-template-columns:repeat(6,1fr); gap:18px; }
  .row { display:flex; gap:22px; align-items:flex-start; flex-wrap:wrap; }
  figure { margin:0; display:flex; flex-direction:column; align-items:center; gap:7px;
           background:#fff; border:1px solid var(--line); border-radius:12px; padding:12px 8px; }
  figcaption { display:flex; flex-direction:column; align-items:center; gap:2px; text-align:center; }
  figcaption b { font-size:10.5px; font-weight:600; }
  figcaption span { font-size:10px; color:var(--muted); font-family:ui-monospace,Menlo,monospace; }
  figcaption em { font-size:9.5px; color:var(--muted); font-style:normal; max-width:150px; }
  .foot { margin-top:26px; color:var(--muted); font-size:11.5px; }
</style></head><body>
<h1>Federation sigils — derived, not selected</h1>
<p class="lede">Every face below is a function of its identity string: SHA-256 → field, division, semé, chief,
charge, tincture, tilt. There is no gallery and no colour picker, because a face you can re-roll is a costume
and a costume is an impersonation surface.</p>
<h2>Identities</h2>
<div class="grid">${grid}</div>
<h2>States — the crest carries status, the field never emotes</h2>
<div class="row">${stateRow}</div>
<h2>Legibility floor</h2>
<div class="row">${sizeRow}</div>
<p class="foot">Sample ${report.sample} identities · closest pair differs in ${report.minDistance} of ${report.bits} discrete bits ·
${report.distinct} distinct encodings${report.exactCollisions > 0 ? ` · ${report.exactCollisions} exact collision(s)` : " · no exact collisions"} ·
${(report.shareWellSeparated * 100).toFixed(1)}% of pairs differ in at least 6 bits
${report.closest ? ` · closest: ${report.closest.a} ↔ ${report.closest.b}` : ""}.
Fingerprints are labels, not proofs — the proof is the key.</p>
</body></html>`;

fs.writeFileSync(out, html);
console.log(`sigil sheet: ${path.relative(root, out)} — ${seeds.length} identities, ${states.length} states, 5 sizes`);
console.log(`  closest pair: ${report.minDistance}/23 bits apart over ${report.sample} identities (${report.distinct} distinct encodings, ${report.exactCollisions} exact collisions)`);
