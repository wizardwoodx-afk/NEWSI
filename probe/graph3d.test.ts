/**
 * probe/graph3d.test.ts — the interactive 3D memory graph.
 *
 * Pins: deterministic seeded layout (same graph → same coordinates),
 * force convergence (energy falls, positions stabilise), projection math
 * (yaw/pitch move the point, perspective scales with depth), renderer
 * wiring (canvas + drag/zoom listeners + the glossy-black finish in the
 * source), and the plane using Graph3DView instead of a static SVG.
 */
import assert from "node:assert/strict";
import * as path from "node:path";

declare const SI_ROOT: string | undefined;
const ROOT = typeof SI_ROOT === "string" && SI_ROOT.length > 0 ? SI_ROOT : process.cwd();

let passed = 0; let failed = 0; const failures: string[] = [];
function ok(label: string, cond: boolean, detail = ""): void {
  if (cond) { passed++; console.log(`  ok   ${label}`); }
  else { failed++; failures.push(`${label}${detail ? ` — ${detail}` : ""}`); console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`); }
}

import { seedPositions, simulate, simulateStep, project, makeNode, Graph3D, type G3Node, type G3Edge } from "../src/engine/graph3d";

const fs = await import("node:fs");
/* 19.7.12 (UI): the product renders its graphs with 3d-force-graph (WebGL) in
   src/ui/graph/ForceGraph.tsx; the zero-dependency engine/graph3d engine stays as the
   deterministic layout/projection library (used by the offline pack and receipts). */
const consoleSrc = fs.readFileSync(path.join(ROOT, "src/ui/graph/ForceGraph.tsx"), "utf8");
const css = fs.readFileSync(path.join(ROOT, "src/ui/vh.css"), "utf8");

function graphA(): { nodes: G3Node[]; edges: G3Edge[] } {
  const nodes = [makeNode("gst", "GST", 5), makeNode("recon", "reconciliation", 3), makeNode("tds", "TDS", 2), makeNode("itr", "ITR", 1)];
  const edges = [{ a: "gst", b: "recon", weight: 3 }, { a: "gst", b: "tds", weight: 1 }, { a: "recon", b: "itr", weight: 1 }];
  return { nodes, edges };
}

function main(): void {
  /* determinism: same input graph → identical layout */
  const A = graphA(); simulate(A.nodes, A.edges);
  const B = graphA(); simulate(B.nodes, B.edges);
  ok("layout is deterministic — same graph, identical coordinates",
    A.nodes.every((n, i) => Math.abs(n.x - B.nodes[i].x) < 1e-9 && Math.abs(n.y - B.nodes[i].y) < 1e-9 && Math.abs(n.z - B.nodes[i].z) < 1e-9));

  /* convergence: energy decreases and positions settle */
  const C = graphA(); seedPositions(C.nodes);
  const byId = new Map(C.nodes.map((n) => [n.id, n]));
  const e0 = simulateStep(C.nodes, C.edges, byId);
  for (let i = 0; i < 60; i++) simulateStep(C.nodes, C.edges, byId);
  const e1 = simulateStep(C.nodes, C.edges, byId);
  ok("forces converge — energy falls as the layout settles", e1 < e0 * 0.5, `e0=${e0.toFixed(1)} e1=${e1.toFixed(1)}`);
  const D = graphA(); simulate(D.nodes, D.edges, 400);
  const drift = simulateStep(D.nodes, D.edges, new Map(D.nodes.map((n) => [n.id, n])));
  ok("settled graph is stable (residual energy tiny)", drift < 20, `drift=${drift.toFixed(2)}`);

  /* spread: connected nodes stay apart, graph occupies space */
  const xs = D.nodes.map((n) => n.x);
  ok("layout spreads across space (no pile-up)", Math.max(...xs) - Math.min(...xs) > 60);

  /* projection math */
  const probe = makeNode("p", "probe", 1); probe.x = 100; probe.y = 0; probe.z = 0;
  const atYaw0 = project(probe, 0, 0, 620, 800, 400, 1);
  const atYaw90 = project(probe, Math.PI / 2, 0, 620, 800, 400, 1);
  ok("yaw rotates the point across the screen", Math.abs(atYaw0.x - atYaw90.x) > 30);
  const deep = makeNode("d", "deep", 1); deep.x = 0; deep.y = 0; deep.z = 0;
  const near = makeNode("n2", "near", 1); near.x = 0; near.y = 0; near.z = -300;
  const pn = project(near, 0, 0, 620, 800, 400, 1);
  const pd = project(deep, 0, 0, 620, 800, 400, 1);
  ok("perspective: nearer points project larger", pn.scale > pd.scale);
  const zoomed = project(probe, 0, 0, 620, 800, 400, 2);
  ok("zoom scales the projection", Math.abs(zoomed.x - 400) > Math.abs(atYaw0.x - 400) * 1.8);
  ok("projection is centered at origin", Math.abs(pd.x - 400) < 0.001 && Math.abs(pd.y - 200) < 0.001);

  /* renderer wiring in the console */
  ok("the product mounts a live WebGL graph (3d-force-graph), not a static SVG", consoleSrc.includes('import("3d-force-graph")') && !consoleSrc.includes("svg viewBox=\"0 0 660 340\""));
  ok("the graph library is loaded lazily inside the mount effect (SSR/node-safe)", !/^import (?!type )[^;]*3d-force-graph/m.test(consoleSrc));
  ok("canvas carries the interaction contract (drag/zoom handlers in the engine)",
    (() => { const src = fs.readFileSync(path.join(ROOT, "src/engine/graph3d.ts"), "utf8"); return src.includes("pointerdown") && src.includes("pointermove") && src.includes("wheel") && src.includes("idleUntil"); })());
  ok("the house finish is pinned: silver specular → graphite → glossy black stops",
    (() => { const src = fs.readFileSync(path.join(ROOT, "src/engine/graph3d.ts"), "utf8"); return src.includes("236, 239, 244") && src.includes("52, 56, 66") && src.includes("8, 9, 12"); })());
  ok("edge styling is depth-faded silver", (() => { const src = fs.readFileSync(path.join(ROOT, "src/engine/graph3d.ts"), "utf8"); return src.includes("rgba(200, 205, 214,"); })());
  ok("the graph is genuinely interactive — orbit controls, drag, zoom and rotation are wired", /enableNodeDrag|onNodeDrag|controls\(\)/.test(consoleSrc) && /autoRotate|rot/.test(consoleSrc));
  ok("zero-dependency engine (no three.js, no d3 import/require)", (() => {
    const src = fs.readFileSync(path.join(ROOT, "src/engine/graph3d.ts"), "utf8");
    const imports = src.match(/^import[^;]*;/gm)?.join("\n") ?? "";
    return !imports.includes("three") && !imports.includes("d3") && !src.includes('require("three")') && !src.includes('require("d3');
  })());
  ok("package.json ships 3d-force-graph plus three (custom meshes) and no d3", (() => { const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8")); const deps = { ...pkg.dependencies, ...pkg.devDependencies }; const g = Object.keys(deps).filter((d) => /three|d3|force-graph|sigma/.test(d)).sort(); return g.includes("3d-force-graph") && g.includes("three") && !g.some((d) => d.startsWith("d3")); })());
  /* RE-ANCHORED at the true-black redesign. This assertion used to name the
   * literal #0D1010 and forbid #000000 outright, which could only ever be
   * satisfied by one hex: a deliberate, machine-checked re-step of the house
   * ground read as a failure. The property that actually matters — and the one
   * this suite is really about — is that the canvas can never drift onto a
   * hardcoded colour of its own: the renderer reads its background from the
   * --bg TOKEN, so it inherits whatever the house ground is. That is drift-proof
   * in a way the literal was not. The "no blue" half is kept verbatim: the
   * graph must stay inside the house palette, and vh.css carries no blue. */
  ok("the graph canvas takes its ground from the --bg token (never a hardcoded hex)",
    /cssVar\(\s*"--bg"/.test(consoleSrc) && /backgroundColor\("rgba\(0,0,0,0\)"\)/.test(consoleSrc));
  ok("the graph sits in a blue-free house palette", !/#0D1010|#007AFF|#3B82F6|#2563EB|#1E40AF|hsla?\([^)]*\b(2[0-9]{2})\b/i.test(css));

  /* the engine class exposes view state and disposes cleanly */
  ok("Graph3D exposes view + dispose (lifecycle)", typeof Graph3D.prototype.dispose === "function" && typeof Graph3D.prototype.view === "object");

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) { console.log("\nfailures:"); for (const f of failures) console.log(`  - ${f}`); process.exit(1); }
}
main();
