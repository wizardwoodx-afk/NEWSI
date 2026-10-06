/**
 * SELFIMPULSE 16.0 — the MERGE probe (STEP3-MERGE-SPEC.md, milestone M1 gate).
 *
 * The junction between the two planes, made mechanical:
 *   1. A dispatched mission produces ONE unified si-proof-receipt/2 chain
 *      carrying selfimpulse.* control events AND mission.* execution events under
 *      ONE mission ID — and tampering that chain (1 byte) breaks it.
 *   2. Protocol provenance: the unified chain is format si-proof-receipt/2,
 *      stamped 16.0.0, issuer-signed — the SAME protocol both planes share.
 *   3. One state: the mission ledger is the only product-level mission store
 *      in the control plane, and the bridge writes no storage of its own.
 *   4. The shell join: the face door renders the SelfImpulse page, labeled SelfImpulse.
 *
 * Run: npm test  (esbuild bundle, node --test; SI_ROOT injected by the runner)
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { describe, it } from "node:test";
import assert from "node:assert";

declare const SI_ROOT: string | undefined;
const ROOT = typeof SI_ROOT === "string" && SI_ROOT.length > 0 ? SI_ROOT : process.cwd();
const read = (rel: string): string => fs.readFileSync(path.join(ROOT, rel), "utf8");

/* node-safe storage for the VH engine side: its guarded localStorage reads
 * need a backing map so crews persist within the probe process. (The SelfImpulse
 * engine carries its own node-safe store and is unaffected.) */
const probeLS = new Map<string, string>();
if (typeof globalThis.localStorage === "undefined") {
  (globalThis as Record<string, unknown>).localStorage = {
    getItem: (k: string) => probeLS.get(k) ?? null,
    setItem: (k: string, v: string) => void probeLS.set(k, v),
    removeItem: (k: string) => void probeLS.delete(k),
    clear: () => probeLS.clear(),
    key: (i: number) => [...probeLS.keys()][i] ?? null,
    get length() {
      return probeLS.size;
    },
  } as Storage;
}

import {
  loadCrews,
  persistCrew,
  noHostDeps,
  type CliAgentTeam,
} from "../src/mission/missionLoop";
import {
  sendSelfImpulseMessage,
  resolveSelfImpulseApproval,
  selfimpulseSession,
  selfimpulseReceiptJsonl,
  selfimpulseMissions,
  verifySelfImpulseReceipt,
} from "../src/selfimpulse/engine/selfimpulse";
import {
  setBridgeDeps,
} from "../src/selfimpulse/engine/bridge";
import {
  receiptFromJsonl,
  verifyProofReceipt,
} from "../src/selfimpulse/engine/proof";
import {
  ENGINE_VERSION,
  PRODUCT_VERSION,
  ENGINE_SHORT,
  PRODUCT_TITLE,
  ENGINE_CODENAME,
} from "../src/version";
import { bindOwnerRoot } from "../src/security/ownerRoot";
bindOwnerRoot("probe-owner-passphrase");

const sleep = (ms: number): Promise<void> => new Promise<void>((r) => setTimeout(r, ms));

function probeCrew(): CliAgentTeam {
  return {
    id: "team.merge-probe",
    name: "Merge probe crew",
    description: "Deterministic merge-probe crew",
    seats: [
      { id: "coder", role: "coder", harness: "opencode", model: null, mayWrite: true, timeoutSecs: 60, maxTurns: null, instructions: "Do the objective." },
      { id: "reviewer", role: "reviewer", harness: "opencode", model: null, mayWrite: false, timeoutSecs: 60, maxTurns: null, instructions: "Review the work. Read-only." },
    ],
    revision: 1,
    updatedAt: new Date().toISOString(),
  };
}

describe("merge — one mission ID, one chain, one state (16.0)", () => {
  it("the merged chain is tamper-evident: flip 1 byte → chain broken", { timeout: 20000 }, async () => {
    persistCrew(loadCrews(), probeCrew());
    setBridgeDeps(noHostDeps());
    let missionId = "";
    try {
      const run = sendSelfImpulseMessage("Dispatch a mission: prove the merge is real");
      let gated = false;
      for (let i = 0; i < 300; i++) {
        const pending = selfimpulseSession().approvals.find((a) => a.status === "pending");
        if (pending) {
          resolveSelfImpulseApproval(pending.id, true);
          gated = true;
          break;
        }
        await sleep(30);
      }
      await run;
      assert.ok(gated, "the dispatch paused at the human gate");
      const ref = selfimpulseSession().receipts[selfimpulseSession().receipts.length - 1];
      const chain = ref.receipt.events;
      const dispatchEv = chain.find((e) => e.kind === "selfimpulse.dispatch");
      assert.ok(dispatchEv, "the chain carries the dispatch");
      missionId = String((dispatchEv?.data.mission as { missionId?: string })?.missionId ?? "");
      assert.match(missionId, /^mission_[a-z0-9]{4}$/, "the mission ID has the unified shape");
      const missionEvents = chain.filter((e) => e.kind === "mission.event");
      assert.ok(missionEvents.length >= 1, "execution events were projected into the chain");
      assert.ok(chain.some((e) => e.kind === "selfimpulse.verdict"), "the control plane's verdict closed the chain");
      const rec = selfimpulseMissions().find((x) => x.missionId === missionId);
      assert.ok(rec, "the unified ledger holds the mission");

      /* the receipt verifies clean */
      const jsonl = selfimpulseReceiptJsonl(ref.id);
      assert.ok(jsonl, "the receipt exports to jsonl");
      const rc = receiptFromJsonl(jsonl);
      assert.ok(rc, "the jsonl round-trips");
      const clean = await verifyProofReceipt(rc!);
      assert.equal(clean.ok, true, `clean chain verifies (${clean.reason ?? ""})`);

      /* flip ONE byte inside the middle event's chain hash — valid JSON,
       * broken chain → the verifier must fail it (the tamper demo). */
      const lines = jsonl.split("\n").filter((l) => l.length > 0);
      const mid = Math.floor(lines.length / 2);
      const hm = lines[mid].match(/"hash":"([0-9a-f]{64})"/);
      assert.ok(hm, "the middle event carries its chain hash");
      const flippedHash = (hm![1][0] === "a" ? "b" : "a") + hm![1].slice(1);
      lines[mid] = lines[mid].replace(hm![1], flippedHash);
      const tampered = lines.join("\n");
      const badRc = receiptFromJsonl(tampered);
      assert.ok(badRc, "the tampered jsonl is still parseable (one byte, inside the hash)");
      const bad = await verifyProofReceipt(badRc!);
      assert.equal(bad.ok, false, "the tampered chain FAILS verification — every job selfimpulseed");
    } finally {
      setBridgeDeps(null);
    }
  });

  it("protocol provenance: one format, one version stamp, signed by the SelfImpulse issuer", { timeout: 20000 }, async () => {
    persistCrew(loadCrews(), probeCrew());
    setBridgeDeps(noHostDeps());
    try {
      const run = sendSelfImpulseMessage("Dispatch a mission: stamp the provenance");
      for (let i = 0; i < 300; i++) {
        const pending = selfimpulseSession().approvals.find((a) => a.status === "pending");
        if (pending) {
          resolveSelfImpulseApproval(pending.id, true);
          break;
        }
        await sleep(30);
      }
      await run;
      const ref = selfimpulseSession().receipts[selfimpulseSession().receipts.length - 1];
      assert.equal(ref.receipt.format, "si-proof-receipt/2", "the unified chain is the SelfImpulse proof standard");
      assert.equal(ref.receipt.header.version, ENGINE_VERSION, `the chain is stamped ${ENGINE_VERSION}`);
      assert.ok(ref.receipt.issuer?.keyId, "the chain carries an issuer");
      assert.ok(ref.signed, "the chain is Ed25519-signed by the control plane");
      const v = await verifySelfImpulseReceipt(ref.id);
      assert.equal(v.ok, true, "provenance verifies offline");
    } finally {
      setBridgeDeps(null);
    }
  });

  it("legacy mj-format receipts still verify — the proof standard is backward compatible", async () => {
    const jsonl = read("probe/fixtures/legacy-mj-receipt.jsonl");
    const rc = receiptFromJsonl(jsonl);
    assert.ok(rc, "the legacy fixture parses");
    assert.equal(rc!.format, "mj-proof-receipt/2", "the fixture is the pre-16.1 wire format");
    const v = await verifyProofReceipt(rc!);
    assert.equal(v.ok, true, `legacy receipts verify under the SelfImpulse standard (${v.reason ?? ""})`);
    // and the open zero-dep verifier agrees (exit 0 = authenticated, 3 = chain valid, issuer self-reported)
    const { execFileSync } = await import("node:child_process");
    let code = 0, out = "";
    try {
      out = execFileSync(process.execPath, ["tools/verify-receipt.mjs", "probe/fixtures/legacy-mj-receipt.jsonl"], { cwd: ROOT, encoding: "utf8" });
    } catch (e) {
      code = (e as { status?: number }).status ?? -1;
      out = (e as { stdout?: string }).stdout ?? "";
    }
    assert.ok(code === 0 || code === 3, `open verifier exit code ${code}`);
    assert.ok(out.startsWith("VALID"), `open verifier says VALID (got: ${out.slice(0, 60)})`);
  });

  it("one state: the mission ledger is the ONLY product-level mission store; the bridge writes nothing", () => {
    const selfimpulseFiles: string[] = [];
    const walk = (rel: string): void => {
      for (const e of fs.readdirSync(path.join(ROOT, rel), { withFileTypes: true })) {
        const p = rel ? `${rel}/${e.name}` : e.name;
        if (e.isDirectory()) walk(p);
        else if (e.name.endsWith(".ts") || e.name.endsWith(".tsx")) selfimpulseFiles.push(p);
      }
    };
    walk("src/selfimpulse");
    const storageKeys = new Set<string>();
    for (const f of selfimpulseFiles) {
      for (const m of read(f).matchAll(/"([a-z]+\.[a-z]+\.v\d)"/g)) {
        if (/^(selfimpulse\.)/.test(m[1])) storageKeys.add(m[1]);
      }
    }
    assert.ok(storageKeys.has("selfimpulse.missions.v1"), "the unified mission ledger exists");
    const missionKeys = [...storageKeys].filter((k) => /mission/i.test(k));
    assert.deepEqual(missionKeys, ["selfimpulse.missions.v1"], `exactly ONE mission store — got: ${missionKeys.join(", ")}`);
    const bridge = read("src/selfimpulse/engine/bridge.ts");
    assert.ok(!/localStorage/.test(bridge), "the bridge writes no storage of its own (it is a seam, not a store)");
  });

  it("the shell join: the app mounts the Federation Console and it drives the real engine (19.6.6)", () => {
    const app = read("src/App.tsx");
    // 19.7.12 (UI): the shell is src/ui/Shell.tsx; the one store drives the engine.
    assert.ok(/from\s*['"]\.\/ui\/Shell['"]/.test(app), "the app mounts the 19.7.12 shell");
    assert.ok(/<Shell\s*\/>/.test(app), "the shell IS the app");
    assert.ok(/import\s*\{\s*askSelfImpulse19\s*\}/.test(read("src/ui/store.ts")), "the ui store drives the real askSelfImpulse19 engine path");
    const pkg = JSON.parse(read("package.json")) as { name: string; version: string };
    assert.equal(pkg.name, "selfimpulse", "the product is named selfimpulse");
    assert.equal(pkg.version, PRODUCT_VERSION, "the manifest carries the product version");
    assert.equal((pkg as { engine?: { version?: string } }).engine?.version, ENGINE_VERSION, "the manifest names the engine release beside it");
    assert.equal(PRODUCT_TITLE, `SelfImpulse (engine MJ ${ENGINE_SHORT} "${ENGINE_CODENAME}")`, "the product title is SelfImpulse, engine identity beside it");
    assert.ok(/<title>SelfImpulse[^<]*<\/title>/.test(read("index.html")), "the window title is SelfImpulse");
    assert.ok(/^\d+\.\d+\.\d+(?:\.\d+)?$/.test(ENGINE_VERSION), "one product version line: the single ENGINE_VERSION stamps everything (semver, 3 or 4 numeric parts)");
  });
});
