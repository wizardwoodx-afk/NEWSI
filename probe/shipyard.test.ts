/**
 * probe/shipyard.test.ts — The Shipyard, VH's Team workspace (19.1.0).
 *
 * Pins the contract: a brief becomes work orders via the product's OWN
 * router (capped, never padded), every order is supervised by its
 * domain's Captain, orders execute only through real runs, a blocked
 * order blocks the build, DONE requires every order executed, SETTLED
 * requires the whole ship and seals a digest, and the summary never
 * claims progress that did not happen.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

if (typeof globalThis.localStorage === "undefined") {
  const map = new Map<string, string>();
  (globalThis as unknown as { localStorage: Storage }).localStorage = {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, String(v)),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
    key: (i: number) => Array.from(map.keys())[i] ?? null,
    get length() {
      return map.size;
    },
  } as Storage;
}

import {
  advanceBuild, buildSummary, clearBuilds, createBuild, getBuild, listBuilds, MAX_ORDERS, runAllOrders, settleBuild,
  type RunResult,
} from "../src/engine/shipyard";
import { captainForDomain } from "../src/engine/captains";

let pass = 0;
let fail = 0;
const check = (name: string, cond: boolean, detail?: unknown): void => {
  if (cond) pass++;
  else {
    fail++;
    console.error(`  ✗ ${name}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ""}`);
  }
};

const okRun = async (): Promise<RunResult> => ({ executed: true, outcome: "answered", note: "ran the slice", provenanceDigest: "a".repeat(64) });
const blockedRun = async (): Promise<RunResult> => ({ executed: false, outcome: "gated-out", note: "human gate paused it" });

test("The Shipyard — team workspace that never fakes progress", async () => {
  clearBuilds();

  // ── creation ────────────────────────────────────────────
  const brief = "build me a recipe sharing app with secure auth, unit tests, CI deployment and a nice UI";
  const b = createBuild(brief);
  check("a build is created and checkpointed", getBuild(b.id) !== null && listBuilds().length === 1);
  check("a rich brief opens multiple domain work orders", b.orders.length >= 3, b.orders.map((o) => o.domain));
  check("orders are capped at MAX_ORDERS", b.orders.length <= MAX_ORDERS);
  check("fresh build is active with all orders pending", b.status === "active" && b.orders.every((o) => o.status === "pending"));
  check("every order names its domain's Captain", b.orders.every((o) => o.captainId === captainForDomain(o.domain)?.id && o.captainName === captainForDomain(o.domain)?.name));
  check("every order carries the brief in its instruction", b.orders.every((o) => o.instruction.includes(brief)));
  check("order ids are unique", new Set(b.orders.map((o) => o.id)).size === b.orders.length);

  const vague = createBuild("zzz qqq xyzzy plugh");
  check("a brief too vague to route opens one honest research order", vague.orders.length === 1 && vague.orders[0].domain === "research", vague.orders.map((o) => o.domain));

  check("summary never claims done for an active build", buildSummary(b).includes("ACTIVE"));

  // ── execution ───────────────────────────────────────────
  let after = await advanceBuild(b.id, okRun);
  check("one advance executes exactly one order", after !== null && after.orders.filter((o) => o.status === "executed").length === 1);
  check("the executed order keeps the run's real outcome and digest", after?.orders[0].outcome === "answered" && after.orders[0].receiptDigest === "a".repeat(64));
  check("build is still active while orders remain", after?.status === "active");

  after = await advanceBuild(b.id, blockedRun);
  const blockedOrder = after?.orders.find((o) => o.status === "blocked");
  check("a non-executed run marks the order blocked, never executed", blockedOrder !== undefined && blockedOrder.outcome === "gated-out" && blockedOrder.note === "human gate paused it");

  after = await runAllOrders(b.id, okRun);
  check("runAll stops at the first blocked order instead of pushing past it", after !== null && after.orders.some((o) => o.status === "blocked") && after.status !== "done");

  // blocked orders are retryable, honestly
  after = await advanceBuild(b.id, okRun);
  check("a blocked order can be retried and then counts as executed", after?.orders.every((o) => o.status === "executed") && after?.status === "done");

  // ── settle ──────────────────────────────────────────────
  const premature = await settleBuild(vague.id);
  check("settling an unexecuted build pauses it — never settles", premature?.status === "paused" && buildSummary(premise(vague.id)).includes("PAUSED"));

  const settled = await settleBuild(b.id);
  check("settling a fully executed build settles every order", settled?.status === "settled" && settled.orders.every((o) => o.status === "settled"));
  check("settle seals a real 64-hex build digest", typeof settled?.buildDigest === "string" && /^[0-9a-f]{64}$/.test(settled.buildDigest ?? ""));
  check("summary reports SETTLED only after settlement", buildSummary(settleOrFail(b.id)).includes("SETTLED"));

  const frozen = await advanceBuild(b.id, okRun);
  check("a settled build ignores further runs", frozen?.orders.every((o) => o.status === "settled"));

  check("checkpoint persists every mutation", listBuilds().find((x) => x.id === b.id)?.status === "settled");

  clearBuilds();
  check("clearBuilds empties the Shipyard", listBuilds().length === 0);

  assert.equal(fail, 0, `${fail} shipyard checks failed`);
  console.log(`shipyard probe: ${pass} passed, ${fail} failed`);
});

function premise(id: string) {
  const b = getBuild(id);
  if (!b) throw new Error(`missing build ${id}`);
  return b;
}
function settleOrFail(id: string) {
  const b = getBuild(id);
  if (!b) throw new Error(`missing build ${id}`);
  return b;
}
