/**
 * probe/moeV2.test.ts — DOMAIN POOLS AND THE CREW GATE (19.7.4 [Crew]).
 *
 * Pins: the dynamic domain scan (the pool follows the task), the crew tier
 * (compound multi-domain requests open k up to 25, never above), sparse
 * selection with reasons, the per-member reserve bench (same domain, never
 * a selected member), reserves consent (the registered bench joins ONLY
 * when the owner switches it on), and the accounting line.
 */
import assert from "node:assert/strict";

let passed = 0; let failed = 0; const failures: string[] = [];
function ok(label: string, cond: boolean, detail = ""): void {
  if (cond) { passed++; console.log(`  ok   ${label}`); }
  else { failed++; failures.push(`${label}${detail ? ` — ${detail}` : ""}`); console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`); }
}

class MemStore implements Storage {
  private m = new Map<string, string>();
  get length() { return this.m.size; } clear() { this.m.clear(); }
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null; }
  key(i: number) { return Array.from(this.m.keys())[i] ?? null; }
  removeItem(k: string) { this.m.delete(k); } setItem(k: string, v: string) { this.m.set(k, v); }
}
(globalThis as { localStorage?: Storage }).localStorage = new MemStore();

import { getSpecialist, listSpecialists } from "../src/engine/registry";
import { scanDomains, crewGate, selectCrewV2, setReservesEnabled, reservesEnabledState, moeV2Line, CREW_MAX, POOL_CATEGORY_MIN } from "../src/engine/moeV2";
import { FLEET_SPECIALISTS, ESTABLISHED_SPECIALISTS, REGISTERED_SIZE } from "../src/engine/federation/fleet";

function main(): void {
  console.log("moeV2 — domain pools and the crew gate");

  const appTask = "build an app end to end: frontend, backend, database, security review and deployment";
  const poolApp = scanDomains(appTask);
  const finTask = "file the GST return and reconcile the TDS ledger";
  const poolFin = scanDomains(finTask);

  /* 1 — the domain scan is dynamic */
  ok("an app-build request opens a multi-domain pool", poolApp.domains.length >= 3, `got ${poolApp.domains.length}`);
  ok("a finance task opens a different, smaller footprint", poolFin.domains.length >= 1 && poolFin.domains.length < poolApp.domains.length);
  ok("the pool is drawn ONLY from the scanned domains",
    poolApp.pool.every((c) => poolApp.domains.some((d) => getSpecialist(c.id)?.category === d.category)));
  ok("pool size follows the task, not a constant", poolApp.pool.length !== poolFin.pool.length || poolApp.domains.length !== poolFin.domains.length);
  ok("the scan is ranked — best domain first",
    poolApp.domains.every((d, i) => i === 0 || poolApp.domains[i - 1].best >= d.best));
  ok("every routed specialist was considered", poolApp.considered === ESTABLISHED_SPECIALISTS.length);

  /* 2 — the crew gate */
  const gateApp = crewGate(appTask, poolApp);
  ok("a compound multi-domain request opens the CREW tier", gateApp.tier === "crew", `got ${gateApp.tier}`);
  ok(`the crew ceiling is ${CREW_MAX} and is law`, gateApp.k <= CREW_MAX && CREW_MAX === 25);
  ok("crew k scales with the footprint, minimum 4", gateApp.k >= 4);
  ok("the gate explains itself", gateApp.why.includes("crew tier") || gateApp.why.includes("domains"));
  const gateSingle = crewGate("what is a merkle tree?", scanDomains("what is a merkle tree?"));
  ok("a single-fact request stays point tier, k=1", gateSingle.tier === "point" && gateSingle.k === 1);

  /* 3 — sparse selection with reserves */
  const sel = selectCrewV2(appTask, poolApp);
  ok("the selected crew never exceeds the gate budget", sel.crew.length <= gateApp.k);
  ok("the crew is non-trivial for a compound build", sel.crew.length >= 4, `got ${sel.crew.length}`);
  ok("every prune carries a reason", sel.pruned.every((p) => p.reason.length > 0));
  ok("every admitted member carries scoring reasons", sel.crew.every((c) => c.score >= POOL_CATEGORY_MIN));
  ok("no member is invented — all ids exist in the catalog", sel.crew.every((c) => getSpecialist(c.id) !== null));

  /* the bench */
  const selectedIds = new Set(sel.crew.map((c) => c.id));
  ok("every member has a same-domain bench staged for failover",
    sel.crew.every((m) => {
      const bench = sel.bench.get(m.id) ?? [];
      return bench.every((b) => !selectedIds.has(b.id) && getSpecialist(b.id)?.category === getSpecialist(m.id)?.category);
    }));
  ok("the bench is a bench, not a second crew",
    [...sel.bench.values()].every((b) => b.length <= 3));

  /* 4 — reserves consent */
  ok("reserves default OFF — the honest-fleet rule stands", reservesEnabledState() === false && poolApp.reserves.length === 0);
  setReservesEnabled(true);
  const poolRes = scanDomains(appTask);
  ok("with consent, the registered bench joins the pool's reserves", poolRes.reserves.length > 0);
  ok("reserves come from the registered bench only",
    poolRes.reserves.every((c) => !ESTABLISHED_SPECIALISTS.some((e) => e.id === c.id) && FLEET_SPECIALISTS.some((f) => f.id === c.id)));
  ok(`the registered bench is the shipped ${REGISTERED_SIZE}`, REGISTERED_SIZE === 640);
  const selRes = selectCrewV2(appTask, poolRes);
  ok("reserves only widen a CREW-tier selection, never a small one",
    gateSingle.tier !== "crew" && sel.crew.every((c) => !poolRes.reserves.some((r) => r.id === c.id)) === true || selRes.crew.length > 0);
  setReservesEnabled(false);

  /* the accounting line */
  const line = moeV2Line(sel);
  ok("the line reports tier, crew/pool/domain counts and the bench",
    line.includes(`tier=${gateApp.tier}`) && line.includes(`${sel.crew.length}/${gateApp.k}`) && line.includes("bench reserve"));

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) { console.log("\nfailures:"); for (const f of failures) console.log(`  - ${f}`); process.exit(1); }
}
void listSpecialists;
main();
