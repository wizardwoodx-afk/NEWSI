/**
 * wcarena/_selfimpulse.mjs — the shared bootstrap for the wcarena harnesses.
 *
 * v0.10.6 (RULE 5) changed what "legitimate" means: a capability CLAIM is no
 * longer a licence, so delegable authority must be GIVEN — by the harbour root,
 * or by an identity the operator designated at boot (HANDLE_AUTHORITIES). A harness
 * that attaches to somebody else's harbour cannot play the operator, and without
 * an operator its "legitimate path" would be unprovable — which would make every
 * refusal meaningless. So each harness now OWNS its harbour:
 *
 *   · a real harbour process in a temp data dir,
 *   · an operator identity generated here and named to the harbour at boot,
 *   · the harness plays that operator and hands authority out as GRANTS.
 *
 * Everything is real: real ECDSA envelopes, real policy engine, real ledger.
 */
import { spawn } from "node:child_process";
import net       from "node:net";
import fs        from "node:fs";
import os        from "node:os";
import path      from "node:path";
import { fileURLToPath } from "node:url";
import * as VH   from "../src/core/si-crypto.js";
import { VHClient } from "../src/client/si-sdk.js";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function freePort() {
  return new Promise((res, rej) => {
    const srv = net.createServer();
    srv.on("error", rej);
    srv.listen(0, "127.0.0.1", () => { const p = srv.address().port; srv.close(() => res(p)); });
  });
}

async function waitForPort(port, ms = 15_000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const ok = await new Promise((res) => {
      const s = net.connect({ port, host: "127.0.0.1" });
      s.once("connect", () => { s.destroy(); res(true); });
      s.once("error", () => { s.destroy(); res(false); });
    });
    if (ok) return true;
    await sleep(120);
  }
  return false;
}

/** Start a real harbour with `authorities` (fingerprints) allowed to hand out
 *  authority, and return the operator client already joined. */
export async function startSelfImpulse({ label = "wcarena", declare = [] } = {}) {
  const identity = await VH.generateIdentity();
  const port     = await freePort();
  const dataDir  = fs.mkdtempSync(path.join(os.tmpdir(), `si-${label}-`));
  const proc     = spawn(process.execPath, [path.join(ROOT, "protocol/src/server/selfimpulse.js")], {
    env: {
      ...process.env,
      PORT: String(port),
      HANDLE_DATA_DIR: dataDir,
      HANDLE_AUTHORITIES: identity.fp,
      HANDLE_MAX_SOCKETS_PER_IP: "64",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  proc.stderr.on("data", (b) => process.stderr.write(`[selfimpulse] ${b}`));
  const url = `http://127.0.0.1:${port}`;
  if (!(await waitForPort(port))) {
    console.error("wcarena: harbour did not come up");
    proc.kill("SIGTERM");
    process.exit(2);
  }

  const operator = new VHClient(url);
  await operator.join("wcarena_operator", "operators", { identity });
  await sleep(900);
  /* The operator's own inventory: what this principal speaks for. Under RULE 5 a
     DESIGNATED identity's declaration IS delegable authority, so this is what the
     operator may hand out — and nothing else. */
  if (declare.length) {
    await operator.declareCapability(declare, { reason: "wcarena operator: the scopes this principal speaks for" });
    await sleep(700);
  }

  const stop = async () => {
    try { operator.disconnect(); } catch { /* already gone */ }
    proc.kill("SIGTERM");
    await sleep(500);
    if (!proc.killed) proc.kill("SIGKILL");
  };

  /* `identity` is returned so a harness can play the operator at the envelope
     level (seal/replay/craft traffic as the designated principal) — the
     compromise campaign needs that to forge rotation proofs and capture sealed
     traffic the way an attacker would. */
  return { url, dataDir, proc, stop, operator, identity, operatorFp: identity.fp };
}

/** Resolve a peer by name fragment. */
export async function peerOf(client, frag, tries = 24) {
  for (let i = 0; i < tries; i++) {
    const p = [...client.peers.values()].find((x) => x.name.includes(frag));
    if (p) return p;
    await sleep(150);
  }
  return null;
}

/** The operator GIVES authority: a real authorization naming the recipient as
 *  subject. `endorse` also supplies RULE 1 standing (given, not self-declared) —
 *  an endorsement says "this is somebody we know", never what they may do. */
export async function give(operator, recipientFrag, token, { scope, ttlMs = 3_600_000, endorse = true } = {}) {
  const p = await peerOf(operator, recipientFrag);
  const grant = await operator.authorize(p?.id, token, { scope, ttlMs });
  if (endorse && p?.id) { await sleep(300); await operator.endorse(p.id, 4, "authority holder, standing given"); }
  return grant;
}

export const show = (o) => `ok=${o?.ok} reason=${o?.reason ?? "—"}`;
