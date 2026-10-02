#!/usr/bin/env node
/**
 * SelfImpulse 17.6.2 — the reproducible benchmark pack.
 *
 * WHAT THIS IS
 *   The reviewer's fourth validation pillar: a benchmark anyone can
 *   reproduce from the extracted zip with ZERO npm dependencies. Fixed
 *   inputs, pinned pseudo-random seed, no network, no randomness in the
 *   measured paths. Timing is REPORTED, never asserted — machines differ;
 *   CORRECTNESS is asserted.
 *
 * BENCHMARKS
 *   B1  receipt verify throughput — verify a pinned 32-event chain N times
 *       through the SAME rulebook the bridge gate uses
 *       (byte-compatible with proof.ts: seq/ts/kind/seatId/data/prev canon,
 *       HMAC seal over the final chain head with the published secret).
 *   B2  anchor envelope sign/verify round-trips — ECDSA P-256 sealFact/openFact,
 *       the wire format selfimpulses exchange.
 *   B3  grant-authority gate — the protocol's FULL selftest (the dependency-
 *       backed gate that pins the v0.10.3 rule). HONESTLY SKIPPED when
 *       protocol/node_modules is absent — stated, never faked.
 *
 * OUTPUTS
 *   benchmark/results-<ts>.json — machine-readable run record (last 5 kept)
 *   exit 0 only when every asserted check passes.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  generateBridgeIdentity, sealFact, openFact, verifyReceiptChain,
} from "../protocol/bridge/selfimpulse-receipt-bridge.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const N_VERIFY = 500;
const N_ENV = 200;

const t0 = process.hrtime.bigint();
const ms = (since) => Number(process.hrtime.bigint() - since) / 1e6;
const sha256hex = (s) => crypto.createHash("sha256").update(s, "utf8").digest("hex");
function sortDeep(v) {
  if (Array.isArray(v)) return v.map(sortDeep);
  if (v && typeof v === "object") {
    const out = {};
    for (const k of Object.keys(v).sort()) out[k] = sortDeep(v[k]);
    return out;
  }
  return v;
}
const canon = (v) => JSON.stringify(sortDeep(v));

const results = { tool: "si-benchmark", version: "17.6.2", ts: new Date().toISOString(), node: process.version, benchmarks: [] };
const checks = { pass: 0, fail: 0 };
function ok(name, cond, detail = "") {
  if (cond) { checks.pass++; console.log(`  ok   ${name}${detail ? ` — ${detail}` : ""}`); }
  else { checks.fail++; console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`); }
}

/* ── B1: receipt verify throughput on a pinned 32-event chain ────────────── */
console.log("\nB1 — receipt verify throughput (pinned 32-event chain)");
function buildPinnedReceipt() {
  // deterministic: fixed-seed PRNG, fixed timestamps — same bytes on every machine
  let seed = 0x5eed;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const events = [];
  let prev = "0".repeat(64);
  for (let i = 0; i < 32; i++) {
    const body = {
      seq: i,
      ts: new Date(1760000000000 + i * 1000).toISOString(),
      kind: i === 0 ? "mission.start" : i === 31 ? "mission.done" : "tool.call",
      seatId: i === 0 || i === 31 ? null : `seat-${1 + (i % 4)}`,
      data: { step: i, load: Math.floor(rnd() * 1000), governed: true },
      prev,
    };
    const hash = sha256hex(canon(body));
    events.push({ ...body, hash });
    prev = hash;
  }
  return {
    format: "si-proof-receipt/2",
    header: { mission: "benchmark-pinned", teamId: "benchmark", startedAt: new Date(1760000000000).toISOString(), finishedAt: new Date(1760000031000).toISOString(), version: "17.6.2", edition: "benchmark", autonomyArms: [] },
    events,
    seal: crypto.createHmac("sha256", "si-commercial-v1-offline").update(prev, "utf8").digest("hex"),
    issuer: null, signature: null,
  };
}
const receipt = buildPinnedReceipt();
const receiptDigest = sha256hex(JSON.stringify(receipt));
{
  // the pinned-input pin: any drift in the deterministic input fails the run
  try {
    const baseline = JSON.parse(fs.readFileSync(path.join(root, "benchmark", "BASELINE.json"), "utf8"));
    const want = baseline["B1-receipt-verify"]?.receiptDigest;
    ok("pinned input matches BASELINE.json (deterministic across machines)", want === receiptDigest, want === receiptDigest ? `digest ${receiptDigest.slice(0, 12)}…` : `baseline ${want} vs run ${receiptDigest}`);
  } catch (e) {
    ok("BASELINE.json readable", false, e.message);
  }
  const probe = verifyReceiptChain(receipt);
  ok("pinned receipt verifies under the bridge rulebook", probe.ok === true, probe.reason ?? `${probe.events} events, head ${String(probe.head).slice(0, 12)}…`);
  const start = process.hrtime.bigint();
  let allOk = true;
  for (let i = 0; i < N_VERIFY; i++) {
    if (!verifyReceiptChain(receipt).ok) { allOk = false; break; }
  }
  const elapsed = ms(start);
  ok(`${N_VERIFY} verifications all pass`, allOk);
  results.benchmarks.push({ id: "B1-receipt-verify", iterations: N_VERIFY, elapsedMs: +elapsed.toFixed(2), perOpMs: +(elapsed / N_VERIFY).toFixed(4), receiptDigest });
  console.log(`       ${N_VERIFY} verifies in ${elapsed.toFixed(1)} ms (${(elapsed / N_VERIFY).toFixed(3)} ms/op)`);
}

/* ── B2: anchor envelope sign/verify round-trips ─────────────────────────── */
console.log("\nB2 — anchor envelope sign/verify round-trips (ECDSA P-256)");
{
  const identity = generateBridgeIdentity("benchmark-agent");
  const facts = { v: 2, kind: "agent_action", action: "anchor_receipt", tool: "si-benchmark", evidence: "benchmark:pinned", result: "success", ts: 0 };
  const probeOpen = openFact(sealFact(facts, identity.privateKey), identity.publicJwk);
  ok("envelope round-trip verifies", probeOpen.verified === true);
  const start = process.hrtime.bigint();
  let allOk = true;
  for (let i = 0; i < N_ENV; i++) {
    const env = sealFact({ ...facts, ts: i }, identity.privateKey);
    if (!openFact(env, identity.publicJwk).verified) { allOk = false; break; }
  }
  const elapsed = ms(start);
  ok(`${N_ENV} seal+open round-trips all verify`, allOk);
  results.benchmarks.push({ id: "B2-envelope-roundtrip", iterations: N_ENV, elapsedMs: +elapsed.toFixed(2), perOpMs: +(elapsed / N_ENV).toFixed(4) });
  console.log(`       ${N_ENV} round-trips in ${elapsed.toFixed(1)} ms (${(elapsed / N_ENV).toFixed(3)} ms/op)`);
}

/* ── B3: grant-authority gate (dependency-backed — honest skip) ───────────── */
console.log("\nB3 — grant-authority gate (protocol selftest, dependency-backed)");
{
  const hasDeps = fs.existsSync(path.join(root, "protocol", "node_modules", "@hpke", "core"));
  if (!hasDeps) {
    console.log("  skip protocol/node_modules not installed — dependency-backed benchmark HONESTLY SKIPPED");
    console.log("       (install: cd protocol && npm install — the lockfile is shipped)");
    results.benchmarks.push({ id: "B3-grant-authority", skipped: "protocol dependencies not installed" });
  } else {
    const start = process.hrtime.bigint();
    let out = "", passed = false;
    try {
      out = execFileSync("npm", ["test", "--silent"], { cwd: path.join(root, "protocol"), encoding: "utf8", timeout: 180_000 });
      /* the count is READ from the selftest's own summary, never restated here:
         a benchmark that hardcodes the number it guards goes stale on every
         protocol release (it read 129 while the gate said 134 — fixed 17.10.3) */
      passed = /ALL \d+ UNIFIED-SENTINEL CHECKS PASSED/.test(out);
    } catch (e) { out = String(e.stdout ?? "") + String(e.stderr ?? ""); }
    const elapsed = ms(start);
    const nChecks = out.match(/ALL (\d+) UNIFIED-SENTINEL CHECKS PASSED/)?.[1] ?? null;
    ok(`protocol selftest passes (${nChecks ?? "count unavailable"} checks incl. grant authority)`, passed);
    results.benchmarks.push({ id: "B3-grant-authority", elapsedMs: +elapsed.toFixed(1), result: nChecks ? `${nChecks}/${nChecks}` : "FAILED" });
    console.log(`       full protocol gate in ${elapsed.toFixed(0)} ms`);
  }
}

/* ── record ─────────────────────────────────────────────────────────────── */
results.checks = checks;
results.totalMs = +ms(t0).toFixed(1);
const outFile = path.join(root, "benchmark", `results-${Date.now()}.json`);
fs.writeFileSync(outFile, JSON.stringify(results, null, 2));
console.log(`\n${checks.fail === 0 ? "🏆" : "❌"} BENCHMARK: ${checks.pass} passed, ${checks.fail} failed in ${results.totalMs} ms`);
console.log(`   results: ${path.relative(root, outFile)}`);
const keep = fs.readdirSync(path.join(root, "benchmark")).filter((f) => f.startsWith("results-")).sort().reverse();
for (const f of keep.slice(5)) fs.unlinkSync(path.join(root, "benchmark", f));
process.exit(checks.fail === 0 ? 0 : 1);
