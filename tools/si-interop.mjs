#!/usr/bin/env node
/**
 * SelfImpulse 17.10.4 — the external-agent interop CLI.
 *
 * WHAT THIS IS
 *   The machine boundary for "real external agents". Any agent, tool or
 *   selfimpulse — Patina or not — can take part in the trust chain using files
 *   and plain JSON, with ZERO npm dependencies (node builtins + the
 *   protocol bridge only):
 *
 *     node tools/si-interop.mjs identity  --dir <dir> [--name <agent>]
 *     node tools/si-interop.mjs anchor    --receipt <receipt.jsonl> --dir <dir> [--out <env.json>]
 *     node tools/si-interop.mjs verify-receipt   <receipt.jsonl>
 *     node tools/si-interop.mjs verify-envelope  <env.json> --signer-jwk <public.json> [--seen <seen.json>]
 *     node tools/si-interop.mjs transport-pack   --receipt <r.jsonl> --env <env.json> --signer-jwk <pub.json> --out <dir>
 *
 *   Exit codes: 0 = verified/created, 1 = refused IN WORDS, 2 = usage error.
 *   The verification rulebook is the SAME one the live product uses
 *   (protocol/bridge/selfimpulse-receipt-bridge.mjs — byte-identical verdicts to
 *   tools/verify-receipt.mjs). Refusals are honest: a CLI that cannot prove
 *   says so, never fakes a pass.
 *
 * REPLAY PROTECTION
 *   verify-envelope accepts --seen <file.json>: a persisted nonce ledger.
 *   An envelope verified once records its nonce there; a second
 *   presentation is refused as `replayed-envelope`. The ledger is bounded
 *   (last 4096 nonces) so it cannot grow without limit.
 */
import fs from "node:fs";
import path from "node:path";
import {
  generateBridgeIdentity, anchorReceipt, verifyReceiptChain, verifyAnchor, openFact,
} from "../protocol/bridge/selfimpulse-receipt-bridge.mjs";

const HANDLE_INTEROP_VERSION = "17.10.4";
const SEEN_LIMIT = 4096;

function fail(msg, code = 1) { console.error(`REFUSED: ${msg}`); process.exit(code); }
function readJson(file, what) {
  let raw;
  try { raw = fs.readFileSync(file, "utf8"); }
  catch (e) { fail(`cannot read ${what} at ${file}: ${e.message}`); }
  try { return JSON.parse(raw); }
  catch (e) { fail(`${what} at ${file} is not valid JSON: ${e.message}`); }
}
function receiptFromJsonlFile(file) {
  let text;
  try { text = fs.readFileSync(file, "utf8"); }
  catch (e) { fail(`cannot read receipt at ${file}: ${e.message}`); }
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) fail(`receipt at ${file} is empty`);
  let head;
  try { head = JSON.parse(lines[0]); }
  catch (e) { fail(`receipt head at ${file} is not valid JSON: ${e.message}`); }
  // receiptToJsonl() shape: line 0 = {receipt: <header>, format, seal, issuer?, signature?},
  // remaining lines = the chain events
  if (!head.receipt || !head.seal || !head.format)
    fail(`receipt head at ${file} is not a si-proof-receipt JSONL head (needs receipt + format + seal)`);
  return {
    format: head.format, header: head.receipt, seal: head.seal,
    issuer: head.issuer ?? null, signature: head.signature ?? null,
    events: lines.slice(1).map((l) => JSON.parse(l)),
  };
}

/* ── identity persistence (JWK at rest — an agent's choice, named honestly) ── */
function loadOrCreateIdentity(dir, name) {
  fs.mkdirSync(dir, { recursive: true });
  const idFile = path.join(dir, "identity.json");
  if (fs.existsSync(idFile)) {
    const rec = readJson(idFile, "identity");
    // rebuild KeyObjects from the stored JWKs
    return {
      name: rec.name, fp: rec.fp, publicJwk: rec.publicJwk,
      publicKey: nodeCrypto.createPublicKey({ key: rec.publicJwk, format: "jwk" }),
      privateKey: nodeCrypto.createPrivateKey({ key: rec.privateJwk, format: "jwk" }),
    };
  }
  const id = generateBridgeIdentity(name);
  const rec = {
    v: 1, name: id.name, fp: id.fp, publicJwk: id.publicJwk,
    privateJwk: id.privateKey.export({ format: "jwk" }),
    createdAt: new Date().toISOString(),
    note: "ECDSA P-256 cross-selfimpulse identity. Private key at rest in this file — protect it.",
  };
  fs.writeFileSync(idFile, JSON.stringify(rec, null, 2));
  return id;
}
import nodeCrypto from "node:crypto";

function loadSeen(file) {
  if (!file || !fs.existsSync(file)) return { nonces: [], file };
  const rec = readJson(file, "seen-nonce ledger");
  if (!Array.isArray(rec.nonces)) fail(`seen ledger at ${file} has no nonces array`);
  return { nonces: rec.nonces, file };
}
function saveSeen(seen) {
  if (!seen.file) return;
  fs.writeFileSync(seen.file, JSON.stringify({ v: 1, nonces: seen.nonces.slice(-SEEN_LIMIT) }, null, 2));
}

/* ── commands ─────────────────────────────────────────────────────────── */
const [cmd, ...rest] = process.argv.slice(2);
const arg = (name, required = true) => {
  const i = rest.indexOf(`--${name}`);
  if (i === -1 || i + 1 >= rest.length) { if (required) fail(`missing --${name}`, 2); return undefined; }
  return rest[i + 1];
};
const positional = rest.filter((a, i) => !a.startsWith("--") && (i === 0 || !rest[i - 1].startsWith("--")));

if (cmd === "identity") {
  const dir = arg("dir");
  const id = loadOrCreateIdentity(dir, arg("name", false) ?? "external-agent");
  fs.writeFileSync(path.join(dir, "public.json"), JSON.stringify(id.publicJwk, null, 2));
  console.log(JSON.stringify({ ok: true, name: id.name, fp: id.fp, publicJwkFile: path.join(dir, "public.json") }));
  process.exit(0);
}

if (cmd === "verify-receipt") {
  const file = positional[0] ?? arg("receipt");
  const rc = receiptFromJsonlFile(file);
  const verdict = verifyReceiptChain(rc);
  if (!verdict.ok) fail(`receipt:${verdict.reason}`);
  console.log(JSON.stringify({ ok: true, head: verdict.head, events: verdict.events, signed: verdict.signed }));
  process.exit(0);
}

if (cmd === "anchor") {
  const dir = arg("dir");
  const rc = receiptFromJsonlFile(arg("receipt"));
  const identity = loadOrCreateIdentity(dir, arg("name", false) ?? "external-agent");
  const res = anchorReceipt(identity, rc, { purpose: arg("purpose", false) ?? "external-agent-anchoring" });
  if (!res.ok) fail(`receipt:${res.reason}`);
  const out = { env: res.env, signer: { name: identity.name, fp: identity.fp }, tool: "si-interop", version: HANDLE_INTEROP_VERSION };
  const outFile = arg("out", false);
  if (outFile) fs.writeFileSync(outFile, JSON.stringify(out, null, 2));
  console.log(JSON.stringify({ ok: true, fp: identity.fp, evidence: res.evidence, out: outFile ?? null }));
  process.exit(0);
}

if (cmd === "verify-envelope") {
  const envFile = positional[0] ?? arg("env");
  const env = readJson(envFile, "envelope");
  const signerJwk = readJson(arg("signer-jwk"), "signer public JWK");
  const res = verifyAnchor(env, signerJwk);
  if (!res.ok) fail(`envelope:${res.reason}`);
  // replay protection — an envelope is one-time evidence at this selfimpulse
  const seen = loadSeen(arg("seen", false));
  if (seen.file && seen.nonces.includes(env.n)) fail("envelope:replayed-envelope — this nonce was already verified at this selfimpulse");
  if (seen.file) { seen.nonces.push(env.n); saveSeen(seen); }
  console.log(JSON.stringify({ ok: true, agent: res.facts.agent, evidence: res.facts.evidence }));
  process.exit(0);
}

if (cmd === "transport-pack") {
  // The machine boundary as files: everything an independent selfimpulse needs,
  // nothing it doesn't. Content never crosses — proof and identity only.
  const out = arg("out");
  fs.mkdirSync(out, { recursive: true });
  fs.copyFileSync(arg("receipt"), path.join(out, "receipt.jsonl"));
  fs.copyFileSync(arg("env"), path.join(out, "anchor-envelope.json"));
  fs.copyFileSync(arg("signer-jwk"), path.join(out, "signer-public.json"));
  fs.writeFileSync(path.join(out, "MANIFEST.txt"),
    `si-interop transport pack ${HANDLE_INTEROP_VERSION}\nfiles: receipt.jsonl anchor-envelope.json signer-public.json\nverify with:\n  node tools/si-interop.mjs verify-receipt receipt.jsonl\n  node tools/si-interop.mjs verify-envelope anchor-envelope.json --signer-jwk signer-public.json\n`);
  console.log(JSON.stringify({ ok: true, dir: out }));
  process.exit(0);
}

console.error(`si-interop ${HANDLE_INTEROP_VERSION} — commands: identity | anchor | verify-receipt | verify-envelope | transport-pack`);
process.exit(2);
