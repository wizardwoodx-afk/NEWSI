/**
 * probe/siliconBench.test.ts — the 350-specialist SEMICONDUCTOR expansion.
 *
 * Pins: exact count (350, silicon.*), per-entry integrity (same finish bar
 * as the fleet: 2 capabilities, 5+ keywords, honest risk tiers, doctrine
 * with the sign-off contract), lifecycle coverage spot-checks (architect →
 * RTL → DV → synthesis → DFT → PD → signoff → tapeout → fab/ATE →
 * packaging → bring-up → reliability → yield → FAE), and catalog
 * registration (1,500 established, 15 categories).
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

import { SILICON_SPECIALISTS } from "../src/engine/siliconBench";
import { catalogStats, SPECIALISTS } from "../src/engine/registry";
import { buildSpecialistPrompt } from "../src/engine/skills";

function main(): void {
  ok("exactly 350 silicon specialists, all silicon.*", SILICON_SPECIALISTS.length === 350 && SILICON_SPECIALISTS.every((s) => s.id.startsWith("silicon.")));

  const ids = new Set(SILICON_SPECIALISTS.map((s) => s.id));
  ok("every id unique", ids.size === 350);
  ok("every entry is a finished professional (2 capabilities, 5+ keywords, honest tier, sign-off contract in doctrine)",
    SILICON_SPECIALISTS.every((s) =>
      s.category === "silicon"
      && s.capabilities.length === 2 && s.capabilities.every((c) => c.length > 25)
      && s.keywords.length >= 5
      && (s.riskTier === "safe" || s.riskTier === "risky")
      && /Silicon contract:/.test(s.systemPrompt)));

  ok("risk tiers honest — irreversible/money/live-silicon work is risky (tapeout, masks, OTP/fuse, key provisioning, bin decisions)",
    SPECIALISTS.filter((s) => s.id.startsWith("silicon.") && s.riskTier === "risky").length >= 18
    && SPECIALISTS.find((s) => s.id === "silicon.tapeout-manager")!.riskTier === "risky"
    && SPECIALISTS.find((s) => s.id === "silicon.fuse-architect")!.riskTier === "risky"
    && SPECIALISTS.find((s) => s.id === "silicon.speed-binning")!.riskTier === "risky");

  /* lifecycle coverage — every id below is grepped-verified in the bench */
  const has = (id: string) => ids.has(id);
  ok("front-end present (architect, RTL, UVM TB, formal, low-power RTL, FPGA prototyping)",
    has("silicon.soc-architect") && has("silicon.cpu-microarch") && has("silicon.rtl-designer")
    && has("silicon.uvm-tb-architect") && has("silicon.formal-property") && has("silicon.lowpower-rtl") && has("silicon.fpga-proto"));
  ok("mid-end present (STA, MCMM, DFT scan/ATPG/MBIST, floorplan, placement, CTS, routing, EM/IR, ECO, LEC)",
    has("silicon.sta-lead") && has("silicon.mcmm-owner") && has("silicon.dft-architect") && has("silicon.atpg-specialist")
    && has("silicon.mbist-owner") && has("silicon.floorplan-lead") && has("silicon.placement-engineer")
    && has("silicon.cts-engineer") && has("silicon.routing-engineer") && has("silicon.em-ir-signoff") && has("silicon.eco-engineer") && has("silicon.lec-owner"));
  ok("sign-off + tapeout present (DRC/LVS, PD, SI, antenna, tapeout manager, mask set, CPPR noise, hold closure)",
    has("silicon.drc-lvs-signoff") && has("silicon.lvs-owner") && has("silicon.pd-signoff") && has("silicon.si-signoff")
    && has("silicon.antenna-checker") && has("silicon.tapeout-manager") && has("silicon.mask-set-owner")
    && has("silicon.cppr-noise") && has("silicon.hold-closure"));
  ok("fab/ATE/packaging present (PDK-fab liaison, FEOL/BEOL integration, wafer disposition, ATE programs, probe card, assembly, substrate, CoWoS, 3D stacking)",
    has("silicon.pdk-fab-liaison") && has("silicon.process-integration-feol") && has("silicon.process-integration-beol")
    && has("silicon.wafer-disposition") && has("silicon.ate-programs") && has("silicon.probe-card-owner")
    && has("silicon.chip-assembly") && has("silicon.substrate-designer") && has("silicon.cowos-integrator") && has("silicon.d3d-stacking"));
  ok("post-silicon present (bring-up lead, lab debug, characterization, firmware bring-up, protocol compliance, ATE-to-bench correlation)",
    has("silicon.bringup-lead") && has("silicon.silicon-debug") && has("silicon.characterization-eng")
    && has("silicon.bringup-fw") && has("silicon.protocol-compliance") && has("silicon.correlation-eng"));
  ok("reliability/quality/yield present (package reliability lab, burn-in, ESD design + latch-up qual, FA lab, yield analysis, DFM sign-off, IP quality audit)",
    has("silicon.package-reliability-lab") && has("silicon.burnin-owner") && has("silicon.esd-designer") && has("silicon.esd-lu-qual")
    && has("silicon.fa-lab-liaison") && has("silicon.yield-analysis") && has("silicon.dfm-signoff-mgr") && has("silicon.ip-quality-audit"));
  ok("analog/security/specialty present (AMS lead, SerDes, PLL, analog layout, SoC security, side-channel eval, root of trust)",
    has("silicon.analog-lead") && has("silicon.serdes-designer") && has("silicon.pll-designer")
    && has("silicon.analog-layout") && has("silicon.security-architect") && has("silicon.sidechannel-eval") && has("silicon.root-trust"));
  ok("ecosystem roles present (EDA vendor mgmt, technical roadmap, wafer logistics, IP licensing, cost model, NPI/capacity planning, design enablement, partner mgmt)",
    has("silicon.eda-vendor-mgr") && has("silicon.tech-roadmap") && has("silicon.wafer-logistics")
    && has("silicon.ip-licensing") && has("silicon.silicon-cost-model") && has("silicon.npi-planner")
    && has("silicon.capacity-planner") && has("silicon.design-enablement") && has("silicon.ecosystem-partner"));

  /* catalog integration */
  const stats = catalogStats();
  ok("catalog census: 1,500 established, 15 categories", stats.count === 1500 && stats.categories === 15);
  ok("provenance carries the silicon batch (350)", stats.byProvenance.silicon === 350);
  ok("silicon specialists registered in SPECIALISTS", SPECIALISTS.some((s) => s.id === "silicon.tapeout-manager") && SPECIALISTS.some((s) => s.id === "silicon.bringup-lead"));

  /* domain skill binds by category */
  const sta = SPECIALISTS.find((s) => s.id === "silicon.sta-lead")!;
  const prompt = buildSpecialistPrompt(sta);
  ok("silicon prompt binds Sign-off Discipline + Reproduce-First playbooks",
    prompt.includes("### Skill: Sign-off Discipline") && prompt.includes("### Skill: Reproduce-First Silicon Debug"));
  ok("silicon prompt carries doctrine + BEW", prompt.includes("Operator doctrine") && prompt.includes("Behaviour Enforcement Workflow [BEW]"));

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) { console.log("\nfailures:"); for (const f of failures) console.log(`  - ${f}`); process.exit(1); }
}
main();
