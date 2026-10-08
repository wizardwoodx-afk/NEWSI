/**
 * probe/workspace.test.ts — 11WORKSPACE and the company org.
 *
 * Pins: 30 desks × Adept+HR = 60 domain specialists; every established
 * worker maps to a desk; leads are NOT in the routed catalog; Captain
 * musters the office from the request alone (no picker); a compound
 * app+docs+mail ask opens ≥3 desks; the floor is workers only, ≤25,
 * and every floor id exists in the registry.
 *
 * THE COMPANY CHAIN (USER ⇄ Captain ⇄ Consul ⇄ Adept ⇄ sub-agents): the
 * no-skip law (src/engine/chain.ts), its enforcement on the real desks
 * (every desk resolves to exactly one Consul; seating a desk with none is a
 * LayerSkipError), the titles' single source of truth, and a source scan that
 * no surface still carries a retired layer title.
 */
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";

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
import { ESTABLISHED_SPECIALISTS } from "../src/engine/federation/fleet";
import { CREW_MAX } from "../src/engine/moeV2";
import {
  DESKS, DOMAIN_SPECIALISTS, ORG_DESK_COUNT, ORG_SPECIALIST_COUNT,
  desksForWorker, homeDesk, orgStats, leadFor, hrFor,
} from "../src/engine/org";
import {
  musterWorkspace, floorAsCrew, officeSnapshot, officeViewFromMuster,
  isElevenWorkspace, WORKSPACE_NAME, FLOOR_CAP,
} from "../src/engine/workspace";
import { askSelfImpulse19, responseCanonical } from "../src/engine/generalist";
import {
  RUNGS, TITLES, ROLES, mayAddress, assertMayAddress, assertChain, legalPath, LayerSkipError, type Rung,
} from "../src/engine/chain";
import { CAPTAINS, captainForDomain } from "../src/engine/captains";
import { consulForDesk } from "../src/engine/org";

async function main(): Promise<void> {
  console.log("workspace — 11WORKSPACE and the three-tier org");

  ok("thirty desks", DESKS.length === 30 && ORG_DESK_COUNT === 30);
  ok("sixty domain specialists (Lead+HR)", DOMAIN_SPECIALISTS.length === 60 && ORG_SPECIALIST_COUNT === 60);
  ok("every desk has a unique id", new Set(DESKS.map((d) => d.id)).size === DESKS.length);
  ok("every Lead+HR id is unique", new Set(DOMAIN_SPECIALISTS.map((s) => s.id)).size === DOMAIN_SPECIALISTS.length);
  ok("every desk has both a Lead and an HR",
    DESKS.every((d) => leadFor(d.id)?.role === "lead" && hrFor(d.id)?.role === "hr"));
  ok("Lead/HR ids never collide with the routed catalog",
    DOMAIN_SPECIALISTS.every((s) => getSpecialist(s.id) === null));
  ok("the routed catalog is still the established 1,500",
    ESTABLISHED_SPECIALISTS.length === 1500 && listSpecialists().length === 1500);

  const stats = orgStats();
  ok("every established worker maps to at least one desk", stats.unassigned === 0, `unassigned=${stats.unassigned}`);
  ok("the org accounts for every worker at least once",
    Object.values(stats.byDesk).reduce((n, c) => n + c, 0) >= ESTABLISHED_SPECIALISTS.length);
  ok("home desk is always a real desk",
    ESTABLISHED_SPECIALISTS.every((s) => DESKS.some((d) => d.id === homeDesk(s))));
  ok("desksForWorker never returns empty",
    ESTABLISHED_SPECIALISTS.every((s) => desksForWorker(s).length >= 1));

  const compound = "Make me a app and connect to my internal XYZ Docs with that and send me mail";
  const office = musterWorkspace(compound);
  ok("muster names 11WORKSPACE", office.name === WORKSPACE_NAME && isElevenWorkspace(office));
  ok("Captain is the only human-facing agent", office.captain === "Captain");
  ok("a compound app+docs+mail ask opens at least three desks",
    office.desks.length >= 3, `desks=${office.desks.map((d) => d.id).join(",")}`);
  const deskIds = new Set(office.desks.map((d) => d.id));
  ok("the compound ask involves product desks (frontend or backend, docs, comms)",
    (deskIds.has("frontend") || deskIds.has("backend") || deskIds.has("mobile") || deskIds.has("api"))
    && (deskIds.has("docs") || deskIds.has("writing"))
    && deskIds.has("comms"),
    `desks=${[...deskIds].join(",")}`);
  ok(`the floor never exceeds CREW_MAX (${CREW_MAX})`,
    office.floor.length <= FLOOR_CAP && FLOOR_CAP === CREW_MAX && CREW_MAX === 25,
    `floor=${office.floor.length}`);
  ok("the floor is non-empty for a compound build", office.floor.length >= 1, `floor=${office.floor.length}`);
  ok("every floor seat is a routed worker, never a Lead or HR",
    office.floor.every((s) => getSpecialist(s.id) !== null && !s.id.startsWith("lead.") && !s.id.startsWith("hr.")));
  ok("every floor seat sits at a named desk",
    office.floor.every((s) => deskIds.has(s.desk) || DESKS.some((d) => d.id === s.desk)));
  ok("floorAsCrew ids match the floor and stay inside the registry",
    floorAsCrew(office).every((c) => getSpecialist(c.id) !== null)
    && floorAsCrew(office).length === office.floor.length);
  ok("the accounting line names the office, the cap, and autonomy",
    office.line.includes("11WORKSPACE") && office.line.includes("Autonomous") && office.line.includes(`${FLOOR_CAP}`));

  const view = officeViewFromMuster(office);
  ok("the office view reports occupancy against the cap",
    view.occupancy === office.floor.length && view.cap === 25 && view.rooms === office.desks.length);

  const snap = officeSnapshot(office);
  ok("the snapshot is JSON-safe (no Maps) and named 11WORKSPACE",
    snap.name === "11WORKSPACE" && JSON.parse(JSON.stringify(snap)).floor.length === office.floor.length);

  const single = musterWorkspace("what is a merkle tree?");
  ok("a single-fact ask still musters without a picker",
    single.name === WORKSPACE_NAME && single.floor.length <= 1);

  /* ───────── the company chain: no rung is ever skipped ───────── */
  console.log("\n== the company chain: USER ⇄ Captain ⇄ Consul ⇄ Adept ⇄ sub-agents ==");
  ok("five rungs, in command order", RUNGS.join(">") === "user>captain>consul>adept>crew");
  ok("the renamed rungs carry short, premium titles (Consul, Adept)",
    TITLES.consul === "Consul" && TITLES.adept === "Adept" && TITLES.consul.length <= 7 && TITLES.adept.length <= 7);
  ok("every rung states its role in one line", RUNGS.every((r) => ROLES[r].length > 20));

  const hops: Array<[Rung, Rung]> = [["user", "captain"], ["captain", "consul"], ["consul", "adept"], ["adept", "crew"]];
  ok("every adjacent hop is legal both ways — briefs travel down, reports travel up",
    hops.every(([a, b]) => mayAddress(a, b) && mayAddress(b, a)));
  const skips: Array<[Rung, Rung]> = [
    ["user", "consul"], ["user", "adept"], ["user", "crew"],
    ["captain", "adept"], ["captain", "crew"], ["consul", "crew"],
  ];
  ok("no rung may skip another, in either direction",
    skips.every(([a, b]) => !mayAddress(a, b) && !mayAddress(b, a)));
  ok("the owner's two rules: a Consul cannot talk to the USER, and cannot talk to the CREW",
    !mayAddress("consul", "user") && !mayAddress("user", "consul") && !mayAddress("consul", "crew") && !mayAddress("crew", "consul"));
  ok("a rung cannot address itself — peers coordinate through the rung above, never sideways",
    RUNGS.every((r) => !mayAddress(r, r)));
  ok("a skip throws LayerSkipError that names the path the message must travel", (() => {
    try { assertMayAddress("consul", "crew"); return false; } catch (e) {
      return e instanceof LayerSkipError && e.from === "consul" && e.to === "crew"
        && e.message.includes("Consul cannot address the Sub-agent directly")
        && e.message.includes("Consul → Adept → Sub-agent");
    }
  })());
  ok("legalPath spans every rung in order, up and down",
    legalPath("user", "crew").join(">") === RUNGS.join(">")
    && legalPath("crew", "user").join(">") === [...RUNGS].reverse().join(">")
    && legalPath("captain", "adept").join(">") === "captain>consul>adept");
  ok("a whole reporting line passes; the same line with the Consul dropped is refused", (() => {
    assertChain(["user", "captain", "consul", "adept", "crew"]);
    try { assertChain(["user", "captain", "adept", "crew"]); return false; } catch (e) { return e instanceof LayerSkipError; }
  })());

  ok("EVERY desk resolves to exactly one Consul of its own domain — no Adept reports straight to the Captain",
    DESKS.every((d) => { const c = consulForDesk(d.id); return c !== null && c.domain === d.workerCategory; }),
    DESKS.filter((d) => consulForDesk(d.id) === null).map((d) => d.id).join(","));
  ok("finance and silicon have Consuls — their desks field hundreds of sub-agents",
    captainForDomain("finance")?.name === `${TITLES.consul} of Finance` && captainForDomain("silicon")?.name === `${TITLES.consul} of Silicon`);
  ok("every established sub-agent's category has a Consul above it",
    ESTABLISHED_SPECIALISTS.every((s) => captainForDomain(s.category) !== null));
  ok("Consul names derive from the single TITLES source",
    CAPTAINS.every((c) => c.name.startsWith(`${TITLES.consul} of `)));
  ok("the Adept and HR mandates keep the chain: report to the Consul, never to the user or over the Consul's head",
    DESKS.every((d) => {
      const l = leadFor(d.id)!; const h = hrFor(d.id)!;
      return l.name === `${d.label} ${TITLES.adept}`
        && l.mandate.includes(`report to your ${TITLES.consul}`)
        && l.mandate.includes("Never address the user")
        && h.mandate.includes(`answers to your ${TITLES.consul}`);
    }));

  ok("every desk in a live muster carries its Consul; the snapshot carries the reporting line",
    office.desks.length > 0
    && office.desks.every((d) => d.consul.id === consulForDesk(d.id)!.id)
    && snap.desks.every((d) => d.consulId.startsWith("captain.") && d.consul.startsWith(`${TITLES.consul} of `)));
  ok("the accounting line says who is above the desks (Captain → N Consul(s))",
    office.line.includes(`${TITLES.captain} opened`) && office.line.includes(`${TITLES.consul}(s)`) && office.line.includes(`${TITLES.adept}+HR`));

  ok("seating a desk with no Consul is REFUSED — LayerSkipError, not a quiet seat", (() => {
    const saved = CAPTAINS.slice();
    CAPTAINS.splice(0, CAPTAINS.length, ...saved.filter((c) => c.domain !== "code"));
    try {
      musterWorkspace("build me a react frontend app with a typescript backend and tests");
      return false;
    } catch (e) {
      return e instanceof LayerSkipError && e.from === "captain" && e.to === "adept" && /no Consul above its Adept/.test(e.message);
    } finally {
      CAPTAINS.splice(0, CAPTAINS.length, ...saved);
    }
  })());
  ok("…and the roster is restored after that mutation test", CAPTAINS.length === 16 && captainForDomain("code") !== null);

  /* source scan: no live surface may still carry a retired layer title */
  const SCAN_ROOT = fs.existsSync(path.join(process.cwd(), "package.json")) ? process.cwd() : path.resolve(".");
  const scanDirs = ["src/engine", "src/ui/screens"];
  const retired = /Team Lead|regional manager|Captain of |CAPTAIN SYNTHESIS|captain synthesis/;
  const offenders: string[] = [];
  let scanned = 0;
  for (const dir of scanDirs) {
    const abs = path.join(SCAN_ROOT, dir);
    if (!fs.existsSync(abs)) continue;
    for (const f of fs.readdirSync(abs)) {
      if (!/\.(ts|tsx)$/.test(f)) continue;
      scanned++;
      const lines = fs.readFileSync(path.join(abs, f), "utf8").split("\n");
      lines.forEach((line, i) => { if (retired.test(line)) offenders.push(`${dir}/${f}:${i + 1}`); });
    }
  }
  ok("the title scan really read the engine and the screens (not vacuous)", scanned >= 50, `scanned=${scanned}`);
  ok("no engine or screen still carries a retired layer title (Team Lead / regional manager / Captain of … / CAPTAIN SYNTHESIS)",
    offenders.length === 0, offenders.slice(0, 5).join(" ; "));

  void (async () => {
    const planned = await askSelfImpulse19({ text: compound, userId: "workspace-probe" });
    ok("askSelfImpulse19 carries the office on the live path",
      planned.office?.name === "11WORKSPACE", `office=${planned.office?.name ?? "absent"}`);
    ok("the live floor is the routed specialistIds (workers, not leads)",
      !!planned.office && planned.specialistIds.length === planned.office.floor.length
      && planned.specialistIds.every((id) => planned.office!.floor.some((s) => s.id === id))
      && planned.specialistIds.every((id) => getSpecialist(id) !== null));
    ok("the live response's office carries each desk's Consul (the chain rides the provenance digest)",
      !!planned.office && planned.office.desks.length > 0
      && planned.office.desks.every((d) => typeof d.consul === "string" && d.consul.startsWith(`${TITLES.consul} of `) && d.consulId.startsWith("captain."))
      && JSON.parse(responseCanonical({ ...planned, provenanceDigest: "" })).office.desks.every((d: { consul?: string }) => !!d.consul));
    /* Re-anchored 2026-10-08. This used to require the reply to contain the literal
       "Autonomous" — one of two tokens from a sentence the owner had taken out of
       the answer bubble because it read as "floor 3/25 sub-agents of 1500 · 60
       domain specialists (Adept+HR) across 30 desks". The PROPERTY worth pinning is
       that a plan says which workspace ran and that the crew was not user-picked;
       the words it said it in were a proxy. */
    ok("the plan names 11WORKSPACE in words and says who picked the crew",
      planned.reply.includes("11WORKSPACE") && /you did not pick the team/i.test(planned.reply));
    ok("the office rides inside the provenance digest",
      JSON.parse(responseCanonical({ ...planned, provenanceDigest: "" })).office?.name === "11WORKSPACE");
    ok("the filesystem workspace seam is a different field",
      planned.workspace == null || planned.workspace.kind !== "11WORKSPACE");

    console.log(`\n${passed} passed, ${failed} failed`);
    if (failed > 0) { console.log("\nfailures:"); for (const f of failures) console.log(`  - ${f}`); process.exit(1); }
  })().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
void assert;
main();
