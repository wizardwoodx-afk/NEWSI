// Does every wire a template declares actually survive the app's own resolution rule?
// Rule under test = store.insertTemplate + dataTypes.portsCompatible (both shipped code).
//
// The 1.5.0 review finding, made permanent: this suite used to PRINT the drop
// census and assert nothing, so a template could silently lose wires — or start
// losing them — and the gate stayed green. It is a real oracle (the app's own
// resolution rule over every shipped template and framework), so it is worth
// keeping; what was missing was the assertion. A census nobody checks is a log.
import assert from "node:assert/strict";
import { loadTemplate, WORKFLOW_TEMPLATES } from "../src/domain/templates";
import { AGENT_FRAMEWORKS } from "../src/domain/frameworks";
import { teamFromFramework, instantiateTeam } from "../src/domain/teams";
import { portsCompatible } from "../src/domain/dataTypes";
import { validateWorkflow, topoSort } from "../src/graph/validation";
import type { Connection, NodeInstance } from "../src/domain/types";

type Node = NodeInstance;
const dropped: string[] = [];

let pass = 0;
let fail = 0;
const ok = (label: string, cond: boolean, detail = "") => {
  if (cond) {
    pass += 1;
    console.log(`  ok   ${label}`);
  } else {
    fail += 1;
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`);
  }
};

function materialise(nodes: Node[], wires: Array<[string,string,string,string]>, label: string): Connection[] {
  const byKey = new Map(nodes.map(n=>[n.templateKey as string, n]));
  const out: Connection[] = [];
  wires.forEach(([sk,sp,tk,tp])=>{
    const src = byKey.get(sk); const tgt = byKey.get(tk);
    if (!src || !tgt) { dropped.push(`${label}: unknown key ${sk}->${tk}`); return; }
    const find = (n: Node, dir: "inputs"|"outputs", k: string) => n[dir].find(p=>p.id.toLowerCase()===k.toLowerCase() || p.label.toLowerCase()===k.toLowerCase());
    const s = find(src,"outputs",sp); const t = find(tgt,"inputs",tp);
    if (!s) { dropped.push(`${label}: no output port "${sp}" on ${src.title}`); return; }
    if (!t) { dropped.push(`${label}: no input port "${tp}" on ${tgt.title}`); return; }
    if (!portsCompatible(s.dataType, t.dataType)) { dropped.push(`${label}: ${src.title}.${s.id}(${s.dataType}) -> ${tgt.title}.${t.id}(${t.dataType}) type-incompatible`); return; }
    out.push({ id:`c${out.length}`, sourceNodeId:src.id, sourcePortId:s.id, targetNodeId:tgt.id, targetPortId:t.id, dataType:s.dataType, status:"idle" });
  });
  return out;
}

console.log("== templates: declared wires vs wires that survive ==");
let dT=0, kT=0;
const templateCensus: Array<{ name: string; declared: number; kept: number; errors: number; order: number; nodes: number }> = [];
for (const tpl of WORKFLOW_TEMPLATES) {
  const { instances, wires } = loadTemplate(tpl.id);
  const conns = materialise(instances, wires, tpl.name);
  dT += wires.length; kT += conns.length;
  const errs = validateWorkflow({schemaVersion:2,id:"w",name:tpl.name,nodes:instances,connections:conns,viewport:{x:0,y:0,zoom:1}}).filter(i=>i.severity==="error");
  let order: string[] = []; try { order = topoSort(instances, conns); } catch { order = []; }
  templateCensus.push({ name: tpl.name, declared: wires.length, kept: conns.length, errors: errs.length, order: order.length, nodes: instances.length });
  console.log(`  ${tpl.name.padEnd(38)} declared=${wires.length} kept=${conns.length} errors=${errs.length} topo=${order.length}/${instances.length}${errs.length?`  e.g. "${errs[0].message}"`:""}`);
}
console.log(`  TOTAL declared=${dT} kept=${kT} dropped=${dT-kT}`);

console.log("\n== frameworks -> teams: declared wires vs wires that survive ==");
let dF=0, kF=0;
const frameworkDrops: Array<{ id: string; declared: number; kept: number }> = [];
for (const fw of AGENT_FRAMEWORKS) {
  const { nodes, wires } = instantiateTeam(teamFromFramework(fw) as never, "task");
  const conns = materialise(nodes, wires, fw.id);
  dF += wires.length; kF += conns.length;
  if (conns.length !== wires.length) {
    console.log(`  ${fw.id.padEnd(24)} declared=${wires.length} kept=${conns.length}`);
    frameworkDrops.push({ id: fw.id, declared: wires.length, kept: conns.length });
  }
}
console.log(`  TOTAL declared=${dF} kept=${kF} dropped=${dF-kF}`);

console.log(`\n== every dropped wire (${dropped.length}) ==`);
for (const d of [...new Set(dropped)].slice(0, 12)) console.log("  " + d);
console.log(`  distinct drop reasons: ${new Set(dropped.map(s=>s.split(": ")[1])).size}`);

/* ── the assertions the suite was missing ─────────────────────────────────── */

console.log("\n== the gate itself ==");

ok("templates were actually enumerated", templateCensus.length > 0, `${templateCensus.length}`);
ok("frameworks were actually enumerated", AGENT_FRAMEWORKS.length > 0, `${AGENT_FRAMEWORKS.length}`);

// A template that declares no wires cannot be evidence of anything, so the
// meaningful check is on templates that DO declare wires.
const withWires = templateCensus.filter((t) => t.declared > 0);
ok("some templates declare wires (the census is not vacuous)", withWires.length > 0, `${withWires.length}`);

// Every declared wire must survive. A drop is a template that ships broken:
// the user picks it and the graph is silently disconnected.
const lossy = templateCensus.filter((t) => t.kept !== t.declared);
ok(
  "every template wire survives the app's own resolution rule",
  lossy.length === 0,
  lossy.map((t) => `${t.name}: ${t.kept}/${t.declared}`).join("; "),
);

// A graph that does not validate is not shippable, whatever its wire count.
const invalid = templateCensus.filter((t) => t.errors > 0);
ok(
  "every template validates with zero errors",
  invalid.length === 0,
  invalid.map((t) => `${t.name}: ${t.errors}`).join("; "),
);

// Every node must be orderable — a cycle or an orphan that topoSort cannot place
// means the template cannot be executed in dependency order.
const unsortable = templateCensus.filter((t) => t.order !== t.nodes);
ok(
  "every template's nodes are topologically orderable",
  unsortable.length === 0,
  unsortable.map((t) => `${t.name}: ${t.order}/${t.nodes}`).join("; "),
);

ok(
  "every framework's declared wires survive too",
  frameworkDrops.length === 0,
  frameworkDrops.map((f) => `${f.id}: ${f.kept}/${f.declared}`).join("; "),
);

console.log(`\nwiring: ${pass} passed, ${fail} failed`);
assert.equal(fail, 0, `${fail} wiring assertion(s) failed — a template or framework is losing wires or does not validate`);