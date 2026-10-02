/**
 * Patina (17.6.2) — two-machine interop probe.
 *
 * The reviewer's external-validation pillar, proven in-tree with REAL
 * process isolation: two independent "machines" that share NOTHING except
 * files on a transport directory — no shared memory, no shared identity,
 * different implementations on each side.
 *
 *   MACHINE A  (this process — the Patina runtime, TypeScript side)
 *     seals a real receipt → anchors it with identity A → exports
 *     receipt.jsonl + anchor-envelope.json + signer-public.json
 *     into the transport dir.
 *
 *   MACHINE B  (a spawned `node tools/si-interop.mjs` process — the pure-JS
 *     external-agent CLI, fresh process, its own rulebook copy)
 *     verifies the receipt, verifies the envelope against A's public key,
 *     and runs replay protection.
 *
 * Cross-implementation pins:
 *   • an envelope sealed by the TS runtime verifies under the JS CLI
 *     (the wire format is real, not an in-process illusion);
 *   • a receipt JSONL exported by the engine verifies under the CLI;
 *   • transport-tampered envelopes and receipts are refused IN WORDS
 *     (exit code 1 + reason on stderr);
 *   • the same envelope presented twice to the same selfimpulse is refused
 *     as replayed.
 */
import { describe, it } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

import { buildChainedReceipt, receiptToJsonl } from "../src/selfimpulse/engine/proof";
import {
  loadOrCreateCrossSelfImpulseIdentity, anchorReceipt,
  type CrossSelfImpulseStore,
} from "../src/selfimpulse/engine/crossSelfImpulse";

/**
 * SI_ROOT is injected by esbuild at build time (absolute path for the dev
 * runner, "." for the offline pack — verify/run.mjs sets cwd to the tree
 * root). import.meta.url cannot be used: the packed bundle lives one level
 * deeper (verify/suites/) than the dev bundle (probe/).
 */
declare const SI_ROOT: string | undefined;
const root = typeof SI_ROOT === "string" && SI_ROOT.length > 0
  ? path.resolve(SI_ROOT)
  : path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const cli = path.join(root, "tools", "si-interop.mjs");

function memStore(): CrossSelfImpulseStore & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return { map, get: (k) => map.get(k) ?? null, set: (k, v) => { map.set(k, v); } };
}

function runCli(args: string[]): { code: number; stdout: string; stderr: string } {
  try {
    const stdout = execFileSync(process.execPath, [cli, ...args], {
      encoding: "utf8", timeout: 60_000, stdio: ["ignore", "pipe", "pipe"],
    });
    return { code: 0, stdout, stderr: "" };
  } catch (e) {
    const err = e as { status?: number; stdout?: Buffer; stderr?: Buffer };
    return {
      code: err.status ?? -1,
      stdout: err.stdout?.toString() ?? "",
      stderr: err.stderr?.toString() ?? "",
    };
  }
}

describe("interop — two machines, one trust chain (17.6.2)", () => {
  it("machine A (TS runtime) → transport files → machine B (JS CLI): the whole chain verifies", async () => {
    const transport = fs.mkdtempSync(path.join(os.tmpdir(), "si-interop-"));

    // ── MACHINE A: the Patina runtime seals and anchors a real receipt ──
    const idA = await loadOrCreateCrossSelfImpulseIdentity(memStore(), "machine-a");
    assert.equal(idA.ok, true);
    if (!idA.ok) return;

    const rc = await buildChainedReceipt({
      mission: "interop-mission",
      teamId: "two-machine",
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      version: "17.6.2",
      edition: "interop",
      events: [
        { kind: "mission.start", seatId: null, data: { objective: "cross the machine boundary" } },
        { kind: "tool.call", seatId: "seat-1", data: { tool: "shell_exec", governed: true } },
        { kind: "mission.done", seatId: null, data: { verified: true } },
      ],
    });
    const anchored = await anchorReceipt(rc, idA.value, "two-machine-interop");
    assert.equal(anchored.ok, true, JSON.stringify(anchored));
    if (!anchored.ok) return;

    // ── the transport: files only, the machine boundary ──
    fs.writeFileSync(path.join(transport, "receipt.jsonl"), receiptToJsonl(rc));
    fs.writeFileSync(path.join(transport, "anchor-envelope.json"), JSON.stringify(anchored.value.env, null, 2));
    fs.writeFileSync(path.join(transport, "signer-public.json"), JSON.stringify(idA.value.publicJwk, null, 2));

    // ── MACHINE B: a fresh CLI process with its own rulebook copy ──
    const vr = runCli(["verify-receipt", path.join(transport, "receipt.jsonl")]);
    assert.equal(vr.code, 0, `verify-receipt failed: ${vr.stderr}`);
    assert.equal(JSON.parse(vr.stdout).head, anchored.value.head, "machine B sees the SAME chain head");

    const seen = path.join(transport, "seen.json");
    const ve = runCli([
      "verify-envelope", path.join(transport, "anchor-envelope.json"),
      "--signer-jwk", path.join(transport, "signer-public.json"),
      "--seen", seen,
    ]);
    assert.equal(ve.code, 0, `verify-envelope failed: ${ve.stderr}`);
    const opened = JSON.parse(ve.stdout);
    assert.equal(opened.agent.fp, idA.value.fp, "machine B attributes the proof to machine A's signer");
  });

  it("replay at machine B: the same envelope is ONE-TIME evidence", async () => {
    const transport = fs.mkdtempSync(path.join(os.tmpdir(), "si-interop-"));
    const idA = await loadOrCreateCrossSelfImpulseIdentity(memStore(), "machine-a");
    if (!idA.ok) throw new Error("identity");
    const rc = await buildChainedReceipt({
      mission: "replay-mission", teamId: "t", startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(), version: "17.6.2", edition: "interop",
      events: [{ kind: "mission.start", seatId: null, data: {} }, { kind: "mission.done", seatId: null, data: { verified: true } }],
    });
    const anchored = await anchorReceipt(rc, idA.value);
    if (!anchored.ok) throw new Error("anchor");
    fs.writeFileSync(path.join(transport, "env.json"), JSON.stringify(anchored.value.env));
    fs.writeFileSync(path.join(transport, "pub.json"), JSON.stringify(idA.value.publicJwk));
    const seen = path.join(transport, "seen.json");

    const first = runCli(["verify-envelope", path.join(transport, "env.json"), "--signer-jwk", path.join(transport, "pub.json"), "--seen", seen]);
    assert.equal(first.code, 0, first.stderr);
    const second = runCli(["verify-envelope", path.join(transport, "env.json"), "--signer-jwk", path.join(transport, "pub.json"), "--seen", seen]);
    assert.equal(second.code, 1, "second presentation must be refused");
    assert.match(second.stderr, /replayed-envelope/);
  });

  it("transport tampering is refused IN WORDS at machine B", async () => {
    const transport = fs.mkdtempSync(path.join(os.tmpdir(), "si-interop-"));
    const idA = await loadOrCreateCrossSelfImpulseIdentity(memStore(), "machine-a");
    if (!idA.ok) throw new Error("identity");
    const rc = await buildChainedReceipt({
      mission: "tamper-mission", teamId: "t", startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(), version: "17.6.2", edition: "interop",
      events: [{ kind: "mission.start", seatId: null, data: {} }, { kind: "mission.done", seatId: null, data: { verified: true } }],
    });
    const anchored = await anchorReceipt(rc, idA.value);
    if (!anchored.ok) throw new Error("anchor");

    // tamper the payload in transit — claim a result the signer never made
    const env = { ...anchored.value.env, p: anchored.value.env.p.replace('"result":"success"', '"result":"forged"') };
    fs.writeFileSync(path.join(transport, "env.json"), JSON.stringify(env));
    fs.writeFileSync(path.join(transport, "pub.json"), JSON.stringify(idA.value.publicJwk));

    const res = runCli(["verify-envelope", path.join(transport, "env.json"), "--signer-jwk", path.join(transport, "pub.json")]);
    assert.equal(res.code, 1, "tampered envelope must be refused");
    assert.match(res.stderr, /bad-signature/);
  });

  it("a tampered receipt in transit is refused by machine B's rulebook", async () => {
    const transport = fs.mkdtempSync(path.join(os.tmpdir(), "si-interop-"));
    const rc = await buildChainedReceipt({
      mission: "receipt-tamper", teamId: "t", startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(), version: "17.6.2", edition: "interop",
      events: [{ kind: "mission.start", seatId: null, data: {} }, { kind: "tool.call", seatId: "s", data: { tool: "shell_exec" } }, { kind: "mission.done", seatId: null, data: { verified: true } }],
    });
    const jsonl = receiptToJsonl(rc);
    const lines = jsonl.split("\n");
    // rewrite a middle event without re-hashing the chain — exactly the forgery the chain prevents
    const ev = JSON.parse(lines[2]);
    ev.data = { tool: "evil_tool" };
    lines[2] = JSON.stringify(ev);
    fs.writeFileSync(path.join(transport, "receipt.jsonl"), lines.join("\n"));

    const res = runCli(["verify-receipt", path.join(transport, "receipt.jsonl")]);
    assert.equal(res.code, 1, "tampered receipt must be refused");
    assert.match(res.stderr, /REFUSED/);
  });

  it("the transport-pack command ships the machine boundary as files", async () => {
    const transport = fs.mkdtempSync(path.join(os.tmpdir(), "si-interop-"));
    const idA = await loadOrCreateCrossSelfImpulseIdentity(memStore(), "packer");
    if (!idA.ok) throw new Error("identity");
    const rc = await buildChainedReceipt({
      mission: "pack-mission", teamId: "t", startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(), version: "17.6.2", edition: "interop",
      events: [{ kind: "mission.start", seatId: null, data: {} }, { kind: "mission.done", seatId: null, data: { verified: true } }],
    });
    const anchored = await anchorReceipt(rc, idA.value);
    if (!anchored.ok) throw new Error("anchor");
    const r = path.join(transport, "r.jsonl");
    const e = path.join(transport, "e.json");
    const k = path.join(transport, "k.json");
    fs.writeFileSync(r, receiptToJsonl(rc));
    fs.writeFileSync(e, JSON.stringify(anchored.value.env));
    fs.writeFileSync(k, JSON.stringify(idA.value.publicJwk));

    const out = path.join(transport, "pack");
    const res = runCli(["transport-pack", "--receipt", r, "--env", e, "--signer-jwk", k, "--out", out]);
    assert.equal(res.code, 0, res.stderr);
    for (const f of ["receipt.jsonl", "anchor-envelope.json", "signer-public.json", "MANIFEST.txt"]) {
      assert.ok(fs.existsSync(path.join(out, f)), `pack carries ${f}`);
    }
    // and the packed files verify standalone — the pack IS the machine boundary
    const ve = runCli(["verify-envelope", path.join(out, "anchor-envelope.json"), "--signer-jwk", path.join(out, "signer-public.json")]);
    assert.equal(ve.code, 0, ve.stderr);
  });
});
