/**
 * SELFIMPULSE 16.0 — the SelfImpulse control-plane probe, now living in the MERGED
 * product: SelfImpulse governs, VH executes, one mission ID, one receipt chain.
 *
 * The rules, made mechanical (same spirit as navAlign / receipts):
 *   1. The SelfImpulse page imports ONLY the selfimpulse engine module — no fragment
 *      stores, no direct missionLoop/receipts import: a page that does is a fork.
 *   2. The selfimpulse module is the one place that reaches the proof layer and the
 *      web-evidence layer — through their APIs. The mission engine is a SEAM,
 *      NOW CONNECTED: exactly one file (bridge.ts) reaches VH's mission loop;
 *      the dispatch test drives the REAL loop and selfimpulsees its events.
 *      (16.0 merge — Step 3 of the SelfImpulse plan.)
 *   3. Risky actions are approval-gated, and the gate is real: a run PAUSES
 *      until the human resolves it; a denial executes nothing.
 *   4. Every finished run mints a si-proof-receipt/2 that verifies offline, and
 *      tampering is caught.
 *   5. The brain is labeled: the simulated brain is rule-based and says so —
 *      the SelfImpulseBrain seam is where a real model plugs in.
 *   6. The SelfImpulse Cycle 2.0 is pinned: dual-process routing (fast/slow),
 *      SIMULATE before risky acts (signed predictions, checked in SELFIMPULSE),
 *      test-gated LEARN (skills that cannot regress; failure memory),
 *      threads with dropped-thread continuity, learned preferences, and an
 *      inspectable Markdown-native memory export.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { execFileSync } from "node:child_process";
import { describe, it } from "node:test";
import assert from "node:assert";

declare const SELFIMPULSE_ROOT: string | undefined;
const ROOT = typeof SELFIMPULSE_ROOT === "string" && SELFIMPULSE_ROOT.length > 0 ? SELFIMPULSE_ROOT : process.cwd();
const read = (rel: string): string => fs.readFileSync(path.join(ROOT, rel), "utf8");

const pageSrc = read("src/selfimpulse/pages/SelfImpulsePage.tsx");
const moduleSrc = read("src/selfimpulse/engine/selfimpulse.ts");
const bridgeSrc = read("src/selfimpulse/engine/bridge.ts");

import {
  ENGINE_VERSION,
} from "../src/version";
import {
  RISKY_TOOLS,
  SELFIMPULSE_TOOLS,
  addSelfImpulseFact,
  exportSelfImpulseMemoryMarkdown,
  newSelfImpulseThread,
  proposeSelfImpulseSkill,
  rateSelfImpulseRun,
  removeSelfImpulseFact,
  removeSelfImpulsePreference,
  removeSelfImpulseSkill,
  resolveSelfImpulseApproval,
  safeCalculate,
  searchKnowledge,
  sendSelfImpulseMessage,
  setSelfImpulseBrain,
  setSelfImpulseMode,
  simulateSelfImpulseAction,
  simulatedBrain,
  stopSelfImpulse,
  selfimpulseBrain,
  selfimpulseReceiptJsonl,
  selfimpulseSession,
  selfimpulseWorkspaceFiles,
  verifySelfImpulseReceipt,
  type SelfImpulseAction,
  type SelfImpulseReceiptRef,
} from "../src/selfimpulse/engine/selfimpulse";

import {
  selfimpulseMissions,
} from "../src/selfimpulse/engine/selfimpulse";
import {
  setBridgeDeps,
} from "../src/selfimpulse/engine/bridge";
import {
  noHostDeps,
  loadCrews,
  persistCrew,
} from "../src/mission/missionLoop";

function lastReceipt(): SelfImpulseReceiptRef {
  const s = selfimpulseSession();
  return s.receipts[s.receipts.length - 1];
}
import {
  buildChainedReceipt,
  verifyProofReceipt,
  type ProofReceipt,
} from "../src/selfimpulse/engine/proof";

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

const sleep = (ms: number): Promise<void> => new Promise<void>((r) => setTimeout(r, ms));

/** A standard selfimpulse-shaped receipt for the protocol assertions. */
async function probeReceipt(): Promise<ProofReceipt> {
  return buildChainedReceipt({
    mission: "selfimpulse: probe",
    teamId: "selfimpulse",
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    version: ENGINE_VERSION,
    edition: "personal",
    events: [
      { kind: "selfimpulse.session", seatId: "selfimpulse-core", data: { brain: "simulated", persona: "witty", mode: "quick", input: "probe" } },
      { kind: "selfimpulse.action", seatId: "selfimpulse-core", data: { tool: "calculator", args: { expression: "1+1" }, ok: true, approved: true, ms: 1, outputDigest: "2" } },
      { kind: "selfimpulse.verdict", seatId: "selfimpulse-core", data: { status: "done", actions: 1, approved: 1, brain: "simulated" } },
    ],
  });
}

async function verifyDirect(rc: ProofReceipt): Promise<{ ok: boolean; events?: number; reason?: string }> {
  const r = await verifyProofReceipt(rc);
  return r.ok ? { ok: true, events: r.events } : { ok: false, reason: r.reason };
}

describe("selfimpulse — the merged product: SelfImpulse governs, VH executes, one chain (16.0 merge)", () => {
  it("the merge seam is isolated: the VH engine is reached EXACTLY ONCE, through bridge.ts", () => {
    // The control plane never imports the execution plane directly — one seam,
    // so the merge can never fork into a second engine.
    assert.ok(!/from "\.\/missionLoop"/.test(moduleSrc), "selfimpulse.ts does not import the mission loop directly");
    assert.ok(!/from "\.\/licensing"/.test(moduleSrc), "no VH licensing import in the control plane");
    assert.ok(!/from "\.\/autonomyRuntime"/.test(moduleSrc), "no VH runtime import in the control plane");
    assert.ok(bridgeSrc.includes("../mission/missionLoop"), "bridge.ts is the seam: it imports the real mission loop");
    assert.ok(bridgeSrc.includes("runMissionLoopCycle"), "the seam runs the REAL loop cycle, not a re-implementation");
    assert.ok(!pageSrc.includes("nav"), "the page has no host-app nav of its own (the shell routes it)");
    assert.ok(moduleSrc.includes('"selfimpulse.session.v1"') && moduleSrc.includes('"selfimpulse.workspace.v1"'), "own storage keys");
  });

  it("exactly ONE file in the SelfImpulse tree reaches the VH engine (static scan)", () => {
    const files: string[] = [];
    const walk = (rel: string): void => {
      for (const e of fs.readdirSync(path.join(ROOT, rel), { withFileTypes: true })) {
        const p = rel ? `${rel}/${e.name}` : e.name;
        if (e.isDirectory()) walk(p);
        else if (e.name.endsWith(".ts") || e.name.endsWith(".tsx")) files.push(p);
      }
    };
    walk("src/selfimpulse");
    const offenders = files.filter((f) => {
      const src = fs.readFileSync(path.join(ROOT, f), "utf8");
      return new RegExp('from "((\\.\\./|\\./)*)mission/').test(src) && f !== "src/selfimpulse/engine/bridge.ts";
    });
    assert.deepEqual(offenders, [], `only bridge.ts may reach the VH engine — offenders: ${offenders.join(", ")}`);
  });

  it("ONE THROAT (16.6.0): across ALL of src/, exactly three files touch runMissionLoopCycle — the definition, the SelfImpulse bridge, the original VH engine page", () => {
    const files: string[] = [];
    const walk = (rel: string): void => {
      for (const e of fs.readdirSync(path.join(ROOT, rel), { withFileTypes: true })) {
        const p = rel ? `${rel}/${e.name}` : e.name;
        if (e.isDirectory()) walk(p);
        else if (e.name.endsWith(".ts") || e.name.endsWith(".tsx")) files.push(p);
      }
    };
    walk("src");
    const callSites = files.filter((f) =>
      fs.readFileSync(path.join(ROOT, f), "utf8").includes("runMissionLoopCycle"),
    );
    // the engine's own module (definition + internals), the SelfImpulse throat
    // (bridge.ts), and the original VH engine page (the live "Mission Loop"
    // nav face — the product's engine screen, not a SelfImpulse-tree path).
    const allowed = new Set(["src/mission/missionLoop.ts", "src/selfimpulse/engine/bridge.ts", "src/pages/LoopPage.tsx"]);
    const offenders = callSites.filter((f) => !allowed.has(f));
    assert.deepEqual(offenders, [], `a NEW path to the mission loop engine — the 15.x teammate path was deleted for exactly this; route execution through bridge.ts (SelfImpulse) or LoopPage (the VH engine face): ${offenders.join(", ")}`);
    // and the 15.x prototype stays deleted:
    assert.ok(!fs.existsSync(path.join(ROOT, "src/mission/teammate.ts")), "src/mission/teammate.ts must stay deleted (15.x legacy path)");
    assert.ok(!fs.existsSync(path.join(ROOT, "src/pages/TeammatePage.tsx")), "src/pages/TeammatePage.tsx must stay deleted (unrouted 15.x prototype)");
  });

  it("the page imports ONLY the selfimpulse module from engine/ (one engine, one API)", () => {
    const engineImports = [...new Set(pageSrc.match(/from "\.\.\/engine\/[a-zA-Z]+/g) ?? [])];
    assert.deepEqual(engineImports, ['from "../engine/selfimpulse'], "no proof/web layer import in the page");
    assert.ok(pageSrc.includes("SelfImpulsePage"), "the page exports SelfImpulsePage");
  });

  it("the module reaches the proof layer through its API (and nothing leaks to the page)", () => {
    assert.ok(moduleSrc.includes('from "./proof"'), "the module mints receipts through proof.ts");
    assert.ok(moduleSrc.includes("buildChainedReceipt"), "the module uses the generic chained-receipt builder");
    assert.ok(moduleSrc.includes('from "./webSearch"'), "the module reaches the keyless web-evidence layer");
    assert.ok(!/from "\.\.\/engine\/(proof|webSearch|signing)"/.test(pageSrc), "the page never imports the proof/web/signing layers directly");
  });

  it("risky actions are approval-gated by policy", () => {
    assert.ok(RISKY_TOOLS.has("workspace_write"), "workspace writes are gated");
    assert.ok(RISKY_TOOLS.has("dispatch_mission"), "mission dispatch is gated");
    assert.ok(!RISKY_TOOLS.has("calculator") && !RISKY_TOOLS.has("memory_save"), "harmless tools are not gated");
  });

  it("the brain is the labeled simulated brain behind the seam", () => {
    assert.equal(selfimpulseBrain().id, "simulated");
    assert.ok(/offline|rule-based|simulated/i.test(selfimpulseBrain().label), "the label is honest about what it is");
    assert.equal(simulatedBrain.id, "simulated");
  });
});

describe("selfimpulse — the tools are real, not vibes", () => {
  it("the calculator is a real parser (no eval)", () => {
    assert.equal(safeCalculate("12 * 8 + 144 / 9"), 112, "96 + 16");
    assert.equal(safeCalculate("(1 + 2) ^ 3"), 27);
    assert.equal(safeCalculate("10 % 3"), 1);
    assert.equal(safeCalculate("-2 ^ 2"), -4);
    assert.equal(safeCalculate("2 ^ 3 ^ 2"), 512, "power is right-associative");
    assert.throws(() => safeCalculate("1 +"), /cannot parse|trailing/i);
    assert.throws(() => safeCalculate("2 / 0"), /finite/);
  });

  it("the math intent produces a real calculator action and uses its result", () => {
    const plan = simulatedBrain.decide("Calculate (12 * 8) + (144 / 9)", { mode: "quick", persona: "witty", facts: [] });
    const tool = plan.actions.find((a) => a.kind === "tool" && a.tool === "calculator") as { args: Record<string, unknown> } | undefined;
    assert.ok(tool, "the plan calls the calculator");
    const out = safeCalculate(String(tool!.args.expression));
    const final = plan.final([{ action: { kind: "tool", tool: "calculator", args: tool!.args } as SelfImpulseAction, ok: true, output: String(out), ms: 1, approved: true }]);
    assert.ok(final.includes(String(out)), `the final carries the computed value ${out}`);
  });

  it("dispatch intent is recognized, planned and approval-gated (the engine behind it arrives in the merge)", () => {
    const plan = simulatedBrain.decide("Dispatch a mission: summarize the README", { mode: "deep", persona: "professional", facts: [] });
    const d = plan.actions.find((a) => a.kind === "dispatch");
    assert.ok(d, "the plan dispatches");
    assert.ok(d!.kind === "dispatch" && d!.objective.length > 5, "the objective survives extraction");
    assert.ok(plan.plan.length >= 3, "deep mode shows a plan");
  });

  it("the knowledge base is offline and labeled as such", () => {
    const hits = searchKnowledge("What is the EU AI Act enforcement date for agents?");
    assert.ok(hits.length > 0, "the EU AI Act query hits the local base");
    assert.ok(hits[0].title.includes("EU AI Act"), `top hit is the EU AI Act entry (got ${hits[0].title})`);
    assert.ok(/local knowledge base/i.test(JSON.stringify(hits)), "hits are labeled as the local knowledge base");
  });
});

describe("selfimpulse — receipts: every job selfimpulseed", () => {
  it("a minted selfimpulse receipt verifies offline (chain + seal, and signature honesty)", { timeout: 20000 }, async () => {
    const rc = await probeReceipt();
    assert.equal(rc.header.version, ENGINE_VERSION, "the receipt carries the current release");
    const v = await verifyDirect(rc);
    assert.equal(v.ok, true, v.ok ? "" : v.reason);
    if (rc.signature) {
      assert.equal(rc.signatureNote, undefined, "a signed receipt carries no excuse");
    } else {
      assert.ok(rc.signatureNote && rc.signatureNote.length > 10, "an unsigned receipt says why, in writing");
    }
  });

  it("a tampered event breaks verification (tamper-evidence is real)", { timeout: 20000 }, async () => {
    const rc = await probeReceipt();
    const tampered = { ...rc, events: rc.events.map((e, i) => (i === 0 ? { ...e, data: { ...e.data, forged: true } } : e)) };
    const v = await verifyDirect(tampered);
    assert.equal(v.ok, false, "tampering must be caught");
  });
});

describe("selfimpulse — the run loop (node-safe e2e)", () => {
  it("a greeting run completes and mints a receipt", async () => {
    const before = selfimpulseSession().receipts.length;
    await sendSelfImpulseMessage("Hello, SelfImpulse");
    const s = selfimpulseSession();
    assert.ok(s.messages.length >= 2, "user + selfimpulse messages exist");
    assert.ok(!s.messages.some((m) => m.streaming), "the run finished (nothing left streaming)");
    assert.equal(s.receipts.length, before + 1, "the run minted exactly one receipt");
    const last = s.receipts[s.receipts.length - 1];
    assert.ok(last.events >= 2, "the receipt carries the session + verdict events");
    const v = await verifySelfImpulseReceipt(last.id);
    assert.equal(v.ok, true, v.ok ? "" : v.reason);
    const jsonl = selfimpulseReceiptJsonl(last.id);
    assert.ok(jsonl && jsonl.split("\n").length >= 3, "the receipt exports to JSONL");
  });

  it("a workspace write PAUSES at the human gate and executes only on approval", { timeout: 20000 }, async () => {
    const run = sendSelfImpulseMessage("Write a file called probe-gate.txt: gate probe content");
    let approved = false;
    for (let i = 0; i < 200; i++) {
      const pending = selfimpulseSession().approvals.find((a) => a.status === "pending");
      if (pending) {
        assert.equal(pending.action, "workspace_write", "the gate names the action");
        resolveSelfImpulseApproval(pending.id, true);
        approved = true;
        break;
      }
      await sleep(30);
    }
    await run;
    assert.ok(approved, "the run paused for a human approval (the gate fired)");
    const files = selfimpulseWorkspaceFiles();
    assert.ok(files.some((f) => f.name === "probe-gate.txt"), "approval → the file exists in the local workspace");
    const s = selfimpulseSession();
    const v = await verifySelfImpulseReceipt(s.receipts[s.receipts.length - 1].id);
    assert.equal(v.ok, true, "the approved run's receipt verifies");
    const actionEvent = s.receipts[s.receipts.length - 1].receipt.events.find((e) => e.kind === "selfimpulse.action");
    assert.ok(actionEvent && actionEvent.data.approved === true, "the receipt records the approval");
  });

  it("a DENIED write executes nothing and is recorded as denied", { timeout: 20000 }, async () => {
    const run = sendSelfImpulseMessage("Write a file called probe-denied.txt: should not exist");
    for (let i = 0; i < 200; i++) {
      const pending = selfimpulseSession().approvals.find((a) => a.status === "pending");
      if (pending) {
        resolveSelfImpulseApproval(pending.id, false);
        break;
      }
      await sleep(30);
    }
    await run;
    assert.ok(!selfimpulseWorkspaceFiles().some((f) => f.name === "probe-denied.txt"), "denial → nothing was written");
    const actionEvent = selfimpulseSession().receipts[selfimpulseSession().receipts.length - 1].receipt.events.find((e) => e.kind === "selfimpulse.action");
    assert.ok(actionEvent && actionEvent.data.approved === false && actionEvent.data.ok === false, "the receipt records the denial honestly");
  });

  it("dispatch drives the REAL VH mission loop end-to-end, honestly, and selfimpulsees it", { timeout: 20000 }, async () => {
    // Seed a crew, inject deterministic runner deps (node probe: no host CLI),
    // then let the full SelfImpulse Cycle run the real engine.
    const team = {
      id: "team.selfimpulse-probe",
      name: "SelfImpulse probe crew",
      description: "Deterministic merge probe crew",
      seats: [
        { id: "coder", role: "coder" as const, harness: "hermes", model: null, mayWrite: true, timeoutSecs: 60, maxTurns: null, instructions: "Do the objective." },
        { id: "reviewer", role: "reviewer" as const, harness: "llm", model: null, mayWrite: false, timeoutSecs: 60, maxTurns: null, instructions: "Review the work. Read-only." },
      ],
      revision: 1,
      updatedAt: new Date().toISOString(),
    };
    persistCrew(loadCrews(), team);
    setBridgeDeps(noHostDeps());
    try {
      const before = selfimpulseSession().receipts.length;
      const run = sendSelfImpulseMessage("Dispatch a mission: build the demo site");
      let gated = false;
      for (let i = 0; i < 300; i++) {
        const pending = selfimpulseSession().approvals.find((a) => a.status === "pending");
        if (pending) {
          assert.equal(pending.action, "dispatch_mission", "the gate names the dispatch");
          resolveSelfImpulseApproval(pending.id, true);
          gated = true;
          break;
        }
        await sleep(30);
      }
      await run;
      assert.ok(gated, "the dispatch paused at the human gate before executing");
      const msgs = selfimpulseSession().threads.find((t) => t.id === selfimpulseSession().activeThreadId)?.messages;
      const lastMsg = msgs?.[msgs.length - 1];
      const m = lastMsg?.text.match(/Dispatched — (mission_[a-z0-9]{4})/);
      assert.ok(m, `the reply reports a real dispatch with a mission ID (got: ${(lastMsg?.text ?? "").slice(0, 120)})`);
      const missionId = m![1];
      // ONE STATE: the mission ledger holds exactly this mission.
      const rec = selfimpulseMissions().find((x) => x.missionId === missionId);
      assert.ok(rec, "the mission is recorded in the unified ledger");
      assert.ok(rec!.status.length > 0, "the ledger carries the honest cycle status");
      // ONE CHAIN: the receipt holds selfimpulse.dispatch + mission.* under one mission ID.
      const ref = selfimpulseSession().receipts[selfimpulseSession().receipts.length - 1];
      const chain = ref.receipt.events;
      const dispatchEv = chain.find((e) => e.kind === "selfimpulse.dispatch");
      assert.ok(dispatchEv, "the chain carries the selfimpulse.dispatch event");
      const missionPayload = dispatchEv!.data.mission as { missionId: string; engine: string } | null;
      assert.equal(missionPayload?.missionId, missionId, "the dispatch event carries the mission ID");
      assert.ok(String(missionPayload?.engine ?? "").startsWith("MJ execution core " + ENGINE_VERSION), "the payload carries the single product-line execution provenance");
      const missionEvents = chain.filter((e) => e.kind === "mission.event");
      assert.ok(missionEvents.length >= 1, "the loop's execution events were projected into the chain");
      assert.ok(missionEvents.every((e) => (e.data as { missionId?: string }).missionId === missionId), "every mission event rides the ONE mission ID");
      assert.equal(selfimpulseSession().receipts.length, before + 1, "the run mints exactly one receipt");
      const v = await verifySelfImpulseReceipt(selfimpulseSession().receipts[selfimpulseSession().receipts.length - 1].id);
      assert.equal(v.ok, true, "the unified receipt verifies offline");
    } finally {
      setBridgeDeps(null);
    }
  });

  it("memory is local, visible and deletable", { timeout: 20000 }, async () => {
    addSelfImpulseFact("probe fact");
    let s = selfimpulseSession();
    assert.ok(s.facts.some((f) => f.text === "probe fact"), "the fact is stored");
    const id = s.facts.find((f) => f.text === "probe fact")!.id;
    removeSelfImpulseFact(id);
    s = selfimpulseSession();
    assert.ok(!s.facts.some((f) => f.id === id), "the fact is gone — memory is the user's to delete");
  });

  it("stopSelfImpulse aborts an in-flight run cleanly", async () => {
    const run = sendSelfImpulseMessage("Tell me about the agent funding landscape and the EU AI Act and Tauri and Chennai and VH and receipts");
    await sleep(60);
    stopSelfImpulse();
    await run;
    const s = selfimpulseSession();
    assert.ok(!s.messages.some((m) => m.streaming), "nothing left streaming after stop");
  });
});

/* ── SelfImpulse Cycle 2.0 — dual-process routing ───────────────────────────────── */
describe("selfimpulse — selfimpulse cycle 2.0: dual-process routing", () => {
  it("a safe single-step run routes FAST", { timeout: 20000 }, async () => {
    await sendSelfImpulseMessage("What time is it right now?");
    const last = lastReceipt();
    const sess = last.receipt.events.find((e) => e.kind === "selfimpulse.session");
    assert.equal(sess?.data.route, "fast", "greeting/time runs are fast");
  });

  it("a risky run routes SLOW (simulation + gate on the slow path)", { timeout: 20000 }, async () => {
    const run = sendSelfImpulseMessage("Write a file called route-slow.txt: routed slow");
    for (let i = 0; i < 200; i++) {
      const pending = selfimpulseSession().approvals.find((a) => a.status === "pending");
      if (pending) { resolveSelfImpulseApproval(pending.id, true); break; }
      await sleep(30);
    }
    await run;
    const last = lastReceipt();
    const sess = last.receipt.events.find((e) => e.kind === "selfimpulse.session");
    assert.equal(sess?.data.route, "slow", "a write action routes slow");
  });
});

/* ── SelfImpulse Cycle 2.0 — SIMULATE before act, SELFIMPULSE checks it ───────────────── */
describe("selfimpulse — selfimpulse cycle 2.0: simulate + selfimpulse", () => {
  it("a new-file write is simulated with a high-confidence prediction and no warnings", () => {
    const sim = simulateSelfImpulseAction({ kind: "tool", tool: "workspace_write", args: { name: "sim-new.txt", content: "hello" } });
    assert.equal(sim.tool, "workspace_write");
    assert.equal(sim.confidence, "high");
    assert.equal(sim.warnings.length, 0, "a brand-new file has no overwrite warning");
    assert.ok(/5 chars/.test(sim.prediction), "the prediction states the exact size");
  });

  it("overwriting an existing file is flagged in the simulation", { timeout: 20000 }, async () => {
    await SELFIMPULSE_TOOLS.workspace_write.run({ name: "sim-over.txt", content: "first" });
    const sim = simulateSelfImpulseAction({ kind: "tool", tool: "workspace_write", args: { name: "sim-over.txt", content: "second" } });
    assert.ok(sim.warnings.some((w) => /already exists|overwrit/i.test(w)), "the overwrite is surfaced before the gate");
    assert.equal(sim.confidence, "high");
  });

  it("a minted write receipt carries the simulation and a matched prediction", async () => {
    const run = sendSelfImpulseMessage("Write a file called sim-selfimpulse.txt: selfimpulse probe");
    for (let i = 0; i < 200; i++) {
      const pending = selfimpulseSession().approvals.find((a) => a.status === "pending");
      if (pending) { resolveSelfImpulseApproval(pending.id, true); break; }
      await sleep(30);
    }
    await run;
    const last = lastReceipt();
    const simEv = last.receipt.events.find((e) => e.kind === "selfimpulse.simulation");
    assert.ok(simEv, "a simulation event is minted before the action");
    assert.equal(simEv?.data.confidence, "high");
    const actEv = last.receipt.events.find((e) => e.kind === "selfimpulse.action");
    assert.equal(actEv?.data.simulated, true, "the action records that it was simulated");
    assert.equal(actEv?.data.predictionMatched, true, "reality matched the signed prediction");
    const verdict = last.receipt.events.find((e) => e.kind === "selfimpulse.verdict");
    assert.equal(verdict?.data.prediction, "matched", "the verdict sums the prediction check");
  });

  it("a DENIED write records a diverged (unrealized) prediction", { timeout: 20000 }, async () => {
    const run = sendSelfImpulseMessage("Write a file called sim-denied.txt: should not exist");
    for (let i = 0; i < 200; i++) {
      const pending = selfimpulseSession().approvals.find((a) => a.status === "pending");
      if (pending) { resolveSelfImpulseApproval(pending.id, false); break; }
      await sleep(30);
    }
    await run;
    assert.ok(!selfimpulseWorkspaceFiles().some((f) => f.name === "sim-denied.txt"), "denial → nothing written");
    const last = lastReceipt();
    const actEv = last.receipt.events.find((e) => e.kind === "selfimpulse.action");
    assert.equal(actEv?.data.predictionMatched, false, "a denied action did not realize its prediction");
    const verdict = last.receipt.events.find((e) => e.kind === "selfimpulse.verdict");
    assert.equal(verdict?.data.prediction, "diverged", "the verdict records the divergence honestly");
  });
});

/* ── SelfImpulse Cycle 2.0 — LEARN: test-gated skills + failure memory ──────────── */
describe("selfimpulse — selfimpulse cycle 2.0: learn (test-gated)", () => {
  it("a successful run distills a test-gated skill with provenance", { timeout: 20000 }, async () => {
    const before = selfimpulseSession().skills.length;
    await sendSelfImpulseMessage("Calculate (7 * 6) + (42 / 6)");
    const s = selfimpulseSession();
    assert.ok(s.skills.length >= before + 1, "the run learned a skill");
    const calc = s.skills.find((k) => k.tool === "calculator");
    assert.ok(calc, "a calculator skill was distilled");
    assert.ok(calc!.bornReceiptId.length > 0, "the skill carries receipt provenance");
    assert.equal(calc!.runs, 1, "first successful run counts as run 1");
    assert.equal(calc!.wins, 1);
    const last = lastReceipt();
    assert.ok(last.skillId, "the receipt links the skill it produced");
  });

  it("a skill with an unknown tool is REJECTED and lands in failure memory", () => {
    const beforeF = selfimpulseSession().failures.length;
    const res = proposeSelfImpulseSkill({ name: "phantom", when: "never", steps: ["ghost"], tool: "not_a_real_tool", bornReceiptId: "r0" });
    assert.equal(res.ok, false, "the test gate rejects unknown tools");
    assert.ok(/unknown tool/i.test(res.reason ?? ""), "the reason is specific");
    const s = selfimpulseSession();
    assert.ok(s.skills.every((k) => k.name !== "phantom"), "no phantom skill was written");
    assert.equal(s.failures.length, beforeF + 1, "the rejection is recorded in failure memory");
  });

  it("a skill whose replay fails is REJECTED (self-learning cannot regress)", () => {
    const beforeF = selfimpulseSession().failures.length;
    const res = proposeSelfImpulseSkill({ name: "calculation", when: "math", steps: ["parse"], tool: "calculator", sampleArgs: { expression: "1 +" }, bornReceiptId: "r0" });
    assert.equal(res.ok, false, "a failing replay is rejected");
    assert.ok(/replay/i.test(res.reason ?? ""), "the reason names the failed replay");
    assert.equal(selfimpulseSession().failures.length, beforeF + 1, "recorded in failure memory");
  });

  it("feedback binds to the receipt and flags a bad skill for review", { timeout: 20000 }, async () => {
    await sendSelfImpulseMessage("Calculate 3 + 4");
    const last = lastReceipt();
    assert.ok(last.skillId, "a skill is linked");
    rateSelfImpulseRun(last.id, 1, "unsafe: it touched a file it shouldn't");
    const s = selfimpulseSession();
    const ref = s.receipts.find((r) => r.id === last.id);
    assert.equal(ref?.feedback.length, 1, "the feedback is bound to the receipt");
    assert.equal(ref?.feedback[0].mode, "unsafe", "the failure mode is classified");
    const sk = s.skills.find((k) => k.id === last.skillId);
    assert.ok(sk, "the skill exists");
    assert.equal(sk!.flagged, true, "an unsafe report flags the skill for human review");
    assert.equal(sk!.avgScore, 1);
  });
});

/* ── SelfImpulse Cycle 2.0 — threads + dropped-thread continuity ────────────────── */
describe("selfimpulse — selfimpulse cycle 2.0: threads", () => {
  it("new threads drop the previous open one; “continue” resumes a dropped thread", { timeout: 20000 }, async () => {
    newSelfImpulseThread("probe-alpha");
    const mainDropped = selfimpulseSession().threads.find((t) => t.title === "Main thread")?.status;
    assert.equal(mainDropped, "dropped", "opening a new thread drops the previous open thread");
    await sendSelfImpulseMessage("Remember: the alpha plan is a selfimpulse");
    const alpha = selfimpulseSession().threads.find((t) => t.title === "probe-alpha");
    assert.ok(alpha && alpha.messages.length >= 2, "the exchange landed in the new thread");

    newSelfImpulseThread("probe-beta");
    assert.equal(selfimpulseSession().threads.find((t) => t.title === "probe-alpha")?.status, "dropped", "alpha is now dropped");

    await sendSelfImpulseMessage("continue probe-alpha");
    const s = selfimpulseSession();
    const resumed = s.threads.find((t) => t.title === "probe-alpha");
    assert.equal(resumed?.status, "open", "“continue” reopens the dropped thread");
    assert.equal(s.activeThreadId, resumed?.id, "the active thread is the resumed one");
    const lastMsg = resumed?.messages[resumed.messages.length - 1];
    assert.ok(lastMsg && lastMsg.role === "selfimpulse" && /picked up/i.test(lastMsg.text), "SelfImpulse reports it picked the thread back up");
  });

  it("a resume with no matching thread is answered honestly", { timeout: 20000 }, async () => {
    await sendSelfImpulseMessage("continue a thread that was never started");
    const last = lastReceipt();
    const finalMsg = selfimpulseSession().threads.find((t) => t.id === selfimpulseSession().activeThreadId)?.messages;
    const text = finalMsg && finalMsg.length > 0 ? finalMsg[finalMsg.length - 1].text : "";
    assert.ok(/don'?t have a thread/i.test(text), "it admits no such thread instead of inventing one");
    assert.ok(last.receipt.events.length >= 2, "the honest answer is still selfimpulseed");
  });
});

/* ── SelfImpulse Cycle 2.0 — preferences + inspectable memory ───────────────────── */
describe("selfimpulse — selfimpulse cycle 2.0: preferences + memory export", () => {
  it("a stated preference is learned and stored", { timeout: 20000 }, async () => {
    const before = selfimpulseSession().preferences.length;
    await sendSelfImpulseMessage("From now on: always mention the receipt at the end");
    const s = selfimpulseSession();
    assert.equal(s.preferences.length, before + 1, "the preference was learned");
    assert.ok(/always mention the receipt/i.test(s.preferences[s.preferences.length - 1].text), "the text is extracted cleanly");
    removeSelfImpulsePreference(s.preferences[s.preferences.length - 1].id);
    assert.equal(selfimpulseSession().preferences.length, before, "preferences are the user's to delete");
  });

  it("the memory export is local, Markdown-native, and complete", () => {
    const md = exportSelfImpulseMemoryMarkdown();
    assert.ok(md.startsWith("# SelfImpulse — memory export"), "it is a proper markdown document");
    for (const section of ["## Facts", "## Preferences", "## Skills", "## Failure memory", "## Workspace", "## Threads"]) {
      assert.ok(md.includes(section), `section present: ${section}`);
    }
    assert.ok(/test-gated/i.test(md), "the export says skills are test-gated");
  });
});

describe("selfimpulse — SelfImpulse Cycle 2.0: confidence routing, council, slow→fast", () => {
  it("confidence is a routing input: a low-confidence plan routes slow and the council selfimpulsees it", async () => {
    const run = sendSelfImpulseMessage("asdfqwer plumb the zephyr");
    await run;
    const last = lastReceipt();
    const sess = last.receipt.events.find((e) => e.kind === "selfimpulse.session");
    assert.equal(sess?.data.route, "slow", "the no-intent fallback is low-confidence → slow");
    const del = last.receipt.events.find((e) => e.kind === "selfimpulse.deliberation");
    assert.ok(del, "the hard step carried a council");
    assert.equal(del?.data.seats, 3, "three seats deliberated");
    const syn = del?.data.synthesis as Record<string, unknown>;
    assert.ok(syn && typeof syn.proposal === "string" && typeof syn.critique === "string" && typeof syn.verdict === "string" && typeof syn.resolution === "string", "four-section synthesis: proposal / critique / verdict / resolution");
    assert.equal(del?.data.ruleBased, true, "honestly labeled rule-based");
  });

  it("council runs on hard (slow) steps, not on easy (fast) ones", { timeout: 20000 }, async () => {
    setSelfImpulseMode("deep");
    const run = sendSelfImpulseMessage("Write a file called council-deep.txt: deliberated content");
    for (let i = 0; i < 200; i++) {
      const pending = selfimpulseSession().approvals.find((a) => a.status === "pending");
      if (pending) { resolveSelfImpulseApproval(pending.id, true); break; }
      await sleep(30);
    }
    await run;
    setSelfImpulseMode("quick");
    const last = lastReceipt();
    assert.ok(last.receipt.events.some((e) => e.kind === "selfimpulse.deliberation"), "deep + risky = hard step → council");
    assert.ok(selfimpulseWorkspaceFiles().some((f) => f.name === "council-deep.txt"), "the act still happened — selfimpulseed, not blocked");
    const r2 = sendSelfImpulseMessage("Calculate 7 * 6");
    await r2;
    assert.ok(!lastReceipt().receipt.events.some((e) => e.kind === "selfimpulse.deliberation"), "a fast run skips the council");
  });

  it("slow→fast: a selfimpulseed skill executes on the fast path, bound into the receipt", { timeout: 20000 }, async () => {
    /* clean slate: the earlier feedback test flagged the calculation skill
     * (that's what it's for) — remove it so this test exercises a healthy one. */
    for (const f of selfimpulseSession().skills.filter((sk) => sk.tool === "calculator")) removeSelfImpulseSkill(f.id);
    const r0 = sendSelfImpulseMessage("Calculate 100 + 23");
    await r0;
    const s1 = selfimpulseSession().skills.find((sk) => sk.tool === "calculator");
    assert.ok(s1 && !s1.flagged, "a fresh, healthy calculator skill was distilled from a selfimpulseed run");
    const r1 = sendSelfImpulseMessage("Calculate 24 * 5");
    await r1;
    const last = lastReceipt();
    const sess = last.receipt.events.find((e) => e.kind === "selfimpulse.session");
    assert.equal(sess?.data.route, "fast", "the skill run takes the fast path — no re-planning");
    const act = last.receipt.events.find((e) => e.kind === "selfimpulse.action");
    const sk = act?.data.skill as { id: string; version: number } | null;
    assert.ok(sk && sk.id === s1.id, "the action event binds the executed skill");
    const verdict = last.receipt.events.find((e) => e.kind === "selfimpulse.verdict");
    assert.equal(verdict?.data.skillId, s1.id, "the verdict carries the skillId");
    assert.ok(!last.receipt.events.some((e) => e.kind === "selfimpulse.deliberation"), "fast run: no council");
    const v = await verifySelfImpulseReceipt(last.id);
    assert.equal(v.ok, true, "the skill run's receipt verifies offline");
  });

  it("a failed live replay flags the skill and falls back to the full cycle (brain-seam double)", { timeout: 20000 }, async () => {
    // Honest note: with the current local toolset the production triggers
    // cannot produce a live replay failure (looksLikeMath pre-validates the
    // calculator; local tools do not throw). The flag + fallback machinery is
    // what a MODEL brain (later release) needs when a skill's args stop
    // replaying — so it is pinned through the brain seam with a double that
    // returns a skill plan whose live args cannot parse.
    const born = proposeSelfImpulseSkill({ name: "replay-fail-probe", when: "probe only", steps: ["probe"], tool: "calculator", sampleArgs: { expression: "1+1" }, bornReceiptId: "probe" });
    assert.ok(born.ok, "the probe skill passes the test gate (1+1 replays)");
    const skillId = born.skillId!;
    const restore = selfimpulseBrain();
    setSelfImpulseBrain({
      ...restore,
      label: "probe-double (simulated)",
      decide(_input, ctx) {
        if ((ctx.recall?.skills ?? []).length > 0) {
          return {
            thoughts: ["double: execute the recalled skill (its live args cannot parse)"],
            plan: ["replay-fail-probe v1 — single selfimpulseed step"],
            actions: [{ kind: "tool", tool: "calculator", args: { expression: "1 +" } }],
            confidence: "high",
            skillId,
            skillVersion: 1,
            final: (r) => `Skill failed on replay: ${r[0]?.output ?? "?"}`,
          };
        }
        return {
          thoughts: ["double: full-cycle fallback — no skill"],
          plan: [],
          actions: [],
          confidence: "low",
          final: () => "Fallback complete: the selfimpulseed skill failed on replay; the run re-planned without it.",
        };
      },
    });
    try {
      const run = sendSelfImpulseMessage("anything that recalls the probe skill");
      await run;
      const last = lastReceipt();
      const acts = last.receipt.events.filter((e) => e.kind === "selfimpulse.action");
      assert.ok(acts.length >= 1, "the failed skill attempt is recorded");
      assert.equal(acts[0].data.ok, false, "the replay failed");
      const sk = acts[0].data.skill as { id: string } | null;
      assert.ok(sk && sk.id === skillId, "the failed attempt is bound to the skill");
      const s2 = selfimpulseSession().skills.find((x) => x.id === skillId);
      assert.equal(s2?.flagged, true, "the failed skill is flagged — it never auto-executes again");
      assert.ok(selfimpulseSession().failures.some((f) => /replay failed live/.test(f.what)), "the failure is in failure memory");
      const v = await verifySelfImpulseReceipt(last.id);
      assert.equal(v.ok, true, "the fallback run's receipt verifies offline");
    } finally {
      setSelfImpulseBrain(restore);
    }
  });

  it("the native (Tauri) seam is wired: keychain-backed issuer key + OS gate notification", () => {
    // Static rules: the engine modules — and only they — reach the host.
    const signingSrc = read("src/selfimpulse/engine/signing.ts");
    assert.ok(signingSrc.includes("keychainBridge"), "the issuer key has a native keychain seam");
    assert.ok(signingSrc.includes("../ipc/client") && signingSrc.includes("secretGet") && signingSrc.includes("secretSet"), "the keychain bridge uses the Rust secret store");
    assert.ok(moduleSrc.includes("notifyApproval") && moduleSrc.includes("../ipc/client"), "the human gate notifies the desktop (native host)");
    assert.ok(!pageSrc.includes("ipc/client"), "the page never touches the host directly");
  });
});

/* ─────────────────────────────────────────────────────────────────────────────
 * M4 — the learning bridge: a real mission trajectory distills a test-gated
 * skill; the next matching objective fast-paths on it; a too-coarse candidate
 * is refused by the replay gate.
 * ───────────────────────────────────────────────────────────────────────────── */
const CORRECT_GUARD = `function authorize(role, user) {
  // deny disabled admins
  if (role === "admin") return Boolean(user && user.active);
  return Boolean(user && user.active);
}
module.exports = { authorize };
`;
const BUGGY_GUARD = `function authorize(role, user) {
  if (role === "admin") return true; // BUG: disabled admins still pass
  return Boolean(user && user.active);
}
module.exports = { authorize };
`;
const LEARNED_MARKER = "## Learned corrections";

function sh4(args: string[], cwd: string): { code: number | null; out: string } {
  try {
    const out = execFileSync(args[0], args.slice(1), { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, GIT_TERMINAL_PROMENT: "0", GIT_TEMPLATE_DIR: "" } });
    return { code: 0, out };
  } catch (e) {
    const err = e as { status?: number | null; stdout?: string; stderr?: string };
    return { code: err.status ?? null, out: `${err.stdout ?? ""}${err.stderr ?? ""}` };
  }
}

function makeGuardRepo(): string {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "si-m4-"));
  fs.writeFileSync(path.join(repo, "guard.js"), BUGGY_GUARD);
  fs.writeFileSync(path.join(repo, "test.js"), `const { authorize } = require("./guard");
let bad = 0;
if (authorize("admin", { active: false })) { bad++; console.error("disabled admin allowed"); }
if (!authorize("admin", { active: true })) { bad++; console.error("active admin denied"); }
if (bad) process.exit(1);
console.log("all tests pass");
`);
  fs.writeFileSync(path.join(repo, "package.json"), JSON.stringify({ name: "guard", version: "1.0.0" }, null, 2));
  sh4(["git", "init", "-q", "-b", "main", "."], repo);
  sh4(["git", "config", "user.email", "probe@selfimpulse.local"], repo);
  sh4(["git", "config", "user.name", "SelfImpulse Probe"], repo);
  sh4(["git", "add", "-A"], repo);
  sh4(["git", "commit", "-qm", "initial commit"], repo);
  return repo;
}

describe("M4 — the learning bridge: trajectory → test-gated skill → fast path", () => {
  it("a successful mission distills a trajectory skill; the next matching mission fast-paths on it", { timeout: 30000 }, async () => {
    const repo = makeGuardRepo();
    const cwdBefore = process.cwd();
    const team = {
      id: "team.m4-probe",
      name: "M4 probe crew",
      description: "Deterministic M4 learning-bridge crew",
      seats: [
        { id: "coder", role: "coder" as const, harness: "hermes", model: null, mayWrite: true, timeoutSecs: 60, maxTurns: null, instructions: `Fix guard.js per the objective. ${LEARNED_MARKER} — deny disabled admins (v1).` },
        { id: "reviewer", role: "reviewer" as const, harness: "llm", model: null, mayWrite: false, timeoutSecs: 60, maxTurns: null, instructions: "Review the writer's work; verify the deny-disabled-admins invariant. Read-only." },
      ],
      revision: 1,
      updatedAt: new Date().toISOString(),
    };
    persistCrew(loadCrews(), team);
    const deps = {
      // Contract (same as the missionLoop probe): `args` is the git SUBCOMMAND list —
      // the runner execs the git binary itself.
      git: async (args: string[], cwd: string) => {
        const r = sh4(["git", ...args], cwd);
        return { ok: r.code === 0, stdout: r.out, stderr: "", exitCode: r.code ?? 1, reason: null };
      },
      nativeInvoke: async (req: { cwd: string; prompt: string; readOnly: boolean }) => {
        const prompt = req.prompt;
        const guardPath = path.join(req.cwd, "guard.js");
        const t0 = Date.now();
        const isWriter = !req.readOnly;
        if (isWriter) {
          if (prompt.includes(LEARNED_MARKER)) {
            fs.writeFileSync(guardPath, CORRECT_GUARD);
            return { exitCode: 0, stdout: JSON.stringify({ type: "result", is_error: false, result: "Fixed authorize() to deny disabled admins.", session_id: "ses_coder" }), stderr: "", durationMs: Date.now() - t0, timedOut: false };
          }
          return { exitCode: 1, stdout: JSON.stringify({ type: "result", is_error: true, result: "incomplete", session_id: "ses_coder" }), stderr: "", durationMs: Date.now() - t0, timedOut: false };
        }
        const src = fs.existsSync(guardPath) ? fs.readFileSync(guardPath, "utf8") : "";
        const correct = src.includes("deny disabled admins") && !src.includes("return true; // BUG");
        return { exitCode: 0, stdout: JSON.stringify({ type: "result", is_error: false, result: correct ? "CORRECT: denies disabled admins." : "WRONG.", session_id: "ses_reviewer" }), stderr: "", durationMs: Date.now() - t0, timedOut: false };
      },
      // No agent binary is resolved: an in-process seat has nothing to look up.
      resolveBin: async () => null,
      writeFile: async (p2: string, contents: string) => {
        fs.mkdirSync(path.dirname(p2), { recursive: true });
        fs.writeFileSync(p2, contents);
      },
      verify: async (cwd2: string) => {
        const r = sh4(["node", "test.js"], cwd2);
        return { exitCode: r.code ?? 1, stdout: r.out, stderr: "", durationMs: 5, timedOut: false };
      },
      arenaRunner: async (now: number) => ({ gate: "PASS", ranAt: now, total: 11, defended: 11, breached: 0, results: [], summary: "governance arena: 11/11 defended", digest: "b".repeat(64) }) as never,
    };
    setBridgeDeps(deps as never);
    try {
      process.chdir(repo); // the bridge runs the loop in "." — the deterministic repo
      /* ── run 1: a real, successful mission ── */
      const run1 = sendSelfImpulseMessage("Dispatch a mission: harden the authorize guard against disabled admins");
      let gated = false;
      for (let i = 0; i < 400; i++) {
        const pending = selfimpulseSession().approvals.find((a) => a.status === "pending");
        if (pending) { resolveSelfImpulseApproval(pending.id, true); gated = true; break; }
        await sleep(30);
      }
      await run1;
      assert.ok(gated, "the dispatch paused at the human gate");
      const msgs1 = selfimpulseSession().threads.find((t) => t.id === selfimpulseSession().activeThreadId)?.messages;
      const last1 = msgs1?.[msgs1.length - 1];
      const m1 = last1?.text.match(/Dispatched — (mission_[a-z0-9]{4}) · engine [^·]+ · crew "[^"]*" · status (\w+)/);
      assert.ok(m1, `run 1 reported a real dispatch (got: ${(last1?.text ?? "").slice(0, 140)})`);
      assert.equal(m1![2], "completed", "the mission really ran to a verified completed");
      /* the trajectory skill was distilled, with real provenance */
      const sk = selfimpulseSession().skills.find((k) => k.name.startsWith("mission-") && k.tool === "dispatch_mission");
      assert.ok(sk, "a mission skill was distilled from the real trajectory");
      assert.equal(sk!.mission?.missionId, m1![1], "the skill carries the REAL mission ID");
      assert.ok(sk!.mission!.verifiedSeats >= 1, "the provenance records verified seats");
      assert.ok(sk!.wins >= 1, "the skill is born with the source run's proven win");
      assert.ok(sk!.steps.some((st) => st.includes("loop phase:")), "the steps are the loop phases that actually ran");
      /* the replay gate is real: a too-coarse candidate is refused */
      const coarse = proposeSelfImpulseSkill({
        name: "mission-coarse",
        when: "dispatching a mission like: the",
        steps: ["dispatch"],
        tool: "dispatch_mission",
        sampleArgs: { objective: "the" },
        bornReceiptId: "probe",
      });
      assert.equal(coarse.ok, false, "the replay gate refuses a too-coarse trigger");
      assert.ok(selfimpulseSession().failures.some((f) => /replay check failed/i.test(f.reason)), "the refusal lands in failure memory");

      /* ── run 2: the next matching mission fast-paths on the skill ── */
      const run2 = sendSelfImpulseMessage("Dispatch a mission: harden the authorize guard against disabled admins once more");
      let gated2 = false;
      for (let i = 0; i < 400; i++) {
        const pending = selfimpulseSession().approvals.find((a) => a.status === "pending");
        if (pending) { resolveSelfImpulseApproval(pending.id, true); gated2 = true; break; }
        await sleep(30);
      }
      await run2;
      assert.ok(gated2, "the fast path still paused at the human gate (risk never drops the gate)");
      const ref2 = selfimpulseSession().receipts[selfimpulseSession().receipts.length - 1];
      const act2 = ref2.receipt.events.find((e) => e.kind === "selfimpulse.action" || e.kind === "selfimpulse.dispatch");
      const bound = act2?.data.skill as { id?: string } | null;
      assert.equal(bound?.id, sk!.id, "run 2's receipt binds the selfimpulseed skill");
      const msgs2 = selfimpulseSession().threads.find((t) => t.id === selfimpulseSession().activeThreadId)?.messages;
      assert.ok((msgs2?.[msgs2.length - 1]?.text ?? "").includes("selfimpulseed skill"), "the reply names the selfimpulseed skill path");
      assert.ok(selfimpulseSession().skills.find((k) => k.id === sk!.id)!.runs >= 2, "the skill earned its run");
      const v = await verifySelfImpulseReceipt(ref2.id);
      assert.equal(v.ok, true, "the fast-path run's receipt verifies offline");
    } finally {
      setBridgeDeps(null);
      process.chdir(cwdBefore);
      fs.rmSync(repo, { recursive: true, force: true });
    }
  });
});
