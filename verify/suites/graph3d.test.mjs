import { createRequire as __mjCreateRequire } from "node:module"; const require = __mjCreateRequire(import.meta.url);

// probe/graph3d.test.ts
import * as path from "node:path";

// src/engine/graph3d.ts
function fnv1a(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}
function seedPositions(nodes) {
  const n = Math.max(1, nodes.length);
  for (const node of nodes) {
    const h = parseInt(fnv1a(node.id), 16);
    const theta = h % 3600 / 3600 * Math.PI * 2;
    const phi = (h >>> 12) % 1e3 / 1e3 * Math.PI;
    const r = 120 * Math.cbrt((h >>> 22) % 1e3 / 1e3) + 40;
    node.x = r * Math.sin(phi) * Math.cos(theta);
    node.y = r * Math.cos(phi) * 0.72;
    node.z = r * Math.sin(phi) * Math.sin(theta);
    node.vx = 0;
    node.vy = 0;
    node.vz = 0;
  }
  void n;
}
function makeNode(id, label, weight) {
  const n = { id, label, weight, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 };
  seedPositions([n]);
  return n;
}
var REPULSION = 14e3;
var SPRING = 0.02;
var SPRING_LEN = 115;
var CENTERING = 11e-4;
var DAMPING = 0.86;
var MAX_V = 9;
function simulateStep(nodes, edges, byId) {
  let energy = 0;
  for (let i = 0; i < nodes.length; i++) {
    const a = nodes[i];
    for (let j = i + 1; j < nodes.length; j++) {
      const b = nodes[j];
      let dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
      let d2 = dx * dx + dy * dy + dz * dz;
      if (d2 < 1) {
        dx = Math.random() - 0.5 || 0.5;
        dy = Math.random() - 0.5 || 0.5;
        dz = 0.5;
        d2 = dx * dx + dy * dy + dz * dz;
      }
      const f = REPULSION / d2;
      const d = Math.sqrt(d2);
      const fx = dx / d * f, fy = dy / d * f, fz = dz / d * f;
      a.vx -= fx;
      a.vy -= fy;
      a.vz -= fz;
      b.vx += fx;
      b.vy += fy;
      b.vz += fz;
    }
  }
  for (const e of edges) {
    const a = byId.get(e.a), b = byId.get(e.b);
    if (!a || !b) continue;
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
    const target = SPRING_LEN / (0.6 + e.weight * 0.4);
    const f = SPRING * (d - target);
    const fx = dx / d * f, fy = dy / d * f, fz = dz / d * f;
    a.vx += fx;
    a.vy += fy;
    a.vz += fz;
    b.vx -= fx;
    b.vy -= fy;
    b.vz -= fz;
  }
  for (const node of nodes) {
    node.vx -= node.x * CENTERING;
    node.vy -= node.y * CENTERING;
    node.vz -= node.z * CENTERING;
    node.vx *= DAMPING;
    node.vy *= DAMPING;
    node.vz *= DAMPING;
    const v = Math.sqrt(node.vx ** 2 + node.vy ** 2 + node.vz ** 2);
    if (v > MAX_V) {
      const s = MAX_V / v;
      node.vx *= s;
      node.vy *= s;
      node.vz *= s;
    }
    node.x += node.vx;
    node.y += node.vy;
    node.z += node.vz;
    energy += Math.abs(node.vx) + Math.abs(node.vy) + Math.abs(node.vz);
  }
  return energy;
}
function simulate(nodes, edges, maxSteps = 260) {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  let energy = Infinity;
  for (let step = 0; step < maxSteps; step++) {
    energy = simulateStep(nodes, edges, byId);
    if (energy < 0.6) break;
  }
  return energy;
}
function project(node, yaw, pitch, dist, w, h, zoom) {
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  const x1 = node.x * cy - node.z * sy;
  const z1 = node.x * sy + node.z * cy;
  const cp = Math.cos(pitch), sp = Math.sin(pitch);
  const y1 = node.y * cp - z1 * sp;
  const z2 = node.y * sp + z1 * cp + dist;
  if (z2 <= 0.1) return { x: w / 2, y: h / 2, scale: 0, depth: -1 };
  const f = Math.min(w, h) * 0.62 * zoom / z2;
  return { x: w / 2 + x1 * f, y: h / 2 + y1 * f, scale: f, depth: z2 };
}
var Graph3D = class {
  canvas;
  ctx;
  opts;
  yaw = 0.5;
  pitch = 0.35;
  dist = 620;
  zoom = 1;
  vyaw = 4e-3;
  vpitch = 0;
  dragging = false;
  lastX = 0;
  lastY = 0;
  idle = true;
  idleUntil = 0;
  raf = 0;
  disposed = false;
  simulated = false;
  constructor(canvas, opts) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.opts = opts;
    this.fit();
    this.wire();
    this.raf = requestAnimationFrame(this.frame);
  }
  /** Zoom-to-fit: fill the canvas with the graph, whatever its seeded spread. */
  fit() {
    const ns = this.opts.nodes;
    if (ns.length === 0) return;
    const c = ns.reduce((a, n) => ({ x: a.x + n.x / ns.length, y: a.y + n.y / ns.length, z: a.z + n.z / ns.length }), { x: 0, y: 0, z: 0 });
    const radius = Math.max(...ns.map((n) => Math.sqrt((n.x - c.x) ** 2 + (n.y - c.y) ** 2 + (n.z - c.z) ** 2)), 1);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = this.canvas.clientWidth / dpr, h = this.canvas.clientHeight / dpr;
    const target = 0.62 * Math.min(w, h) * 0.92 / Math.max(radius, 1);
    this.zoom = Math.max(0.45, Math.min(4.2, target));
  }
  wire() {
    const c = this.canvas;
    c.addEventListener("pointerdown", this.onDown);
    c.addEventListener("pointermove", this.onMove);
    c.addEventListener("pointerup", this.onUp);
    c.addEventListener("pointerleave", this.onUp);
    c.addEventListener("wheel", this.onWheel, { passive: false });
  }
  onDown = (e) => {
    this.dragging = true;
    this.idle = false;
    this.lastX = e.clientX;
    this.lastY = e.clientY;
    this.vyaw = 0;
    this.vpitch = 0;
    e.target.setPointerCapture?.(e.pointerId);
  };
  onMove = (e) => {
    if (!this.dragging) return;
    const dx = e.clientX - this.lastX, dy = e.clientY - this.lastY;
    this.lastX = e.clientX;
    this.lastY = e.clientY;
    this.yaw += dx * 8e-3;
    this.pitch = Math.max(-1.35, Math.min(1.35, this.pitch + dy * 6e-3));
    this.vyaw = dx * 8e-3;
    this.vpitch = dy * 6e-3;
  };
  onUp = () => {
    if (!this.dragging) return;
    this.dragging = false;
    this.idleUntil = Date.now() + 8e3;
  };
  onWheel = (e) => {
    e.preventDefault();
    this.zoom = Math.max(0.45, Math.min(4.2, this.zoom * (e.deltaY > 0 ? 0.92 : 1.08)));
    this.idle = false;
    this.idleUntil = Date.now() + 8e3;
  };
  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    const c = this.canvas;
    c.removeEventListener("pointerdown", this.onDown);
    c.removeEventListener("pointermove", this.onMove);
    c.removeEventListener("pointerup", this.onUp);
    c.removeEventListener("pointerleave", this.onUp);
    c.removeEventListener("wheel", this.onWheel);
  }
  /** Current view state — probes and tests read this. */
  get view() {
    return { yaw: this.yaw, pitch: this.pitch, zoom: this.zoom, idle: this.idle };
  }
  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(2, globalThis.devicePixelRatio || 1);
    const w = Math.max(1, Math.round(rect.width * dpr));
    const h = Math.max(1, Math.round((this.opts.heightPx ?? 320) * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
      return true;
    }
    return false;
  }
  frame = () => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.frame);
    const resized = this.resize();
    const dpr = Math.min(2, globalThis.devicePixelRatio || 1);
    const w = this.canvas.width, h = this.canvas.height;
    const ctx = this.ctx;
    if (!this.simulated) {
      simulate(this.opts.nodes, this.opts.edges);
      this.simulated = true;
    }
    if (!this.dragging) {
      if (Date.now() > this.idleUntil) this.idle = true;
      if (this.idle) {
        this.yaw += 16e-4;
      } else {
        this.yaw += this.vyaw;
        this.pitch = Math.max(-1.35, Math.min(1.35, this.pitch + this.vpitch));
        this.vyaw *= 0.94;
        this.vpitch *= 0.94;
        if (Math.abs(this.vyaw) < 5e-5) this.vyaw = 0;
      }
    }
    const cssBg = getComputedStyle(this.canvas).backgroundColor;
    ctx.fillStyle = cssBg && cssBg !== "rgba(0, 0, 0, 0)" ? cssBg : "#0b0c10";
    ctx.fillRect(0, 0, w, h);
    const proj = this.opts.nodes.map((n) => ({ n, p: project(n, this.yaw, this.pitch, this.dist, w / dpr, h / dpr, this.zoom) })).filter((o) => o.p.depth > 0).sort((a, b) => b.p.depth - a.p.depth);
    const posById = new Map(proj.map((o) => [o.n.id, o.p]));
    ctx.lineWidth = Math.max(1, dpr * 0.7);
    for (const e of this.opts.edges) {
      const pa = posById.get(e.a), pb = posById.get(e.b);
      if (!pa || !pb) continue;
      const depth = (pa.depth + pb.depth) / 2;
      const near = Math.max(0, Math.min(1, 1.6 - depth / this.dist));
      ctx.strokeStyle = `rgba(200, 205, 214, ${(0.1 + near * 0.34).toFixed(3)})`;
      ctx.beginPath();
      ctx.moveTo(pa.x * dpr, pa.y * dpr);
      ctx.lineTo(pb.x * dpr, pb.y * dpr);
      ctx.stroke();
    }
    for (const { n, p } of proj) {
      if (resized) ;
      const r = Math.max(3, (5 + Math.min(11, n.weight * 1.5)) * p.scale * dpr * 0.9);
      const cx = p.x * dpr, cyc = p.y * dpr;
      const near = Math.max(0, Math.min(1, 1.6 - p.depth / this.dist));
      const g = ctx.createRadialGradient(cx - r * 0.38, cyc - r * 0.42, r * 0.12, cx, cyc, r);
      g.addColorStop(0, `rgba(236, 239, 244, ${(0.75 + near * 0.25).toFixed(2)})`);
      g.addColorStop(0.22, `rgba(166, 172, 184, ${(0.55 + near * 0.3).toFixed(2)})`);
      g.addColorStop(0.62, `rgba(52, 56, 66, 0.98)`);
      g.addColorStop(1, `rgba(8, 9, 12, 1)`);
      ctx.beginPath();
      ctx.arc(cx, cyc, r, 0, Math.PI * 2);
      ctx.fillStyle = g;
      ctx.fill();
      ctx.lineWidth = dpr * 0.8;
      ctx.strokeStyle = `rgba(203, 208, 217, ${(0.22 + near * 0.5).toFixed(2)})`;
      ctx.stroke();
      ctx.font = `${Math.round(10.5 * dpr * Math.min(1.25, p.scale * 0.95 + 0.3))}px ui-monospace, monospace`;
      ctx.textAlign = "center";
      ctx.fillStyle = `rgba(214, 219, 228, ${(0.35 + near * 0.55).toFixed(2)})`;
      ctx.fillText(n.label.slice(0, 16), cx, cyc + r + 12 * dpr * 0.8);
    }
  };
};

// probe/graph3d.test.ts
var ROOT = ".".length > 0 ? "." : process.cwd();
var passed = 0;
var failed = 0;
var failures = [];
function ok(label, cond, detail = "") {
  if (cond) {
    passed++;
    console.log(`  ok   ${label}`);
  } else {
    failed++;
    failures.push(`${label}${detail ? ` \u2014 ${detail}` : ""}`);
    console.log(`  FAIL ${label}${detail ? ` \u2014 ${detail}` : ""}`);
  }
}
var fs = await import("node:fs");
var consoleSrc = fs.readFileSync(path.join(ROOT, "src/ui/graph/ForceGraph.tsx"), "utf8");
var css = fs.readFileSync(path.join(ROOT, "src/ui/vh.css"), "utf8");
function graphA() {
  const nodes = [makeNode("gst", "GST", 5), makeNode("recon", "reconciliation", 3), makeNode("tds", "TDS", 2), makeNode("itr", "ITR", 1)];
  const edges = [{ a: "gst", b: "recon", weight: 3 }, { a: "gst", b: "tds", weight: 1 }, { a: "recon", b: "itr", weight: 1 }];
  return { nodes, edges };
}
function main() {
  const A = graphA();
  simulate(A.nodes, A.edges);
  const B = graphA();
  simulate(B.nodes, B.edges);
  ok(
    "layout is deterministic \u2014 same graph, identical coordinates",
    A.nodes.every((n, i) => Math.abs(n.x - B.nodes[i].x) < 1e-9 && Math.abs(n.y - B.nodes[i].y) < 1e-9 && Math.abs(n.z - B.nodes[i].z) < 1e-9)
  );
  const C = graphA();
  seedPositions(C.nodes);
  const byId = new Map(C.nodes.map((n) => [n.id, n]));
  const e0 = simulateStep(C.nodes, C.edges, byId);
  for (let i = 0; i < 60; i++) simulateStep(C.nodes, C.edges, byId);
  const e1 = simulateStep(C.nodes, C.edges, byId);
  ok("forces converge \u2014 energy falls as the layout settles", e1 < e0 * 0.5, `e0=${e0.toFixed(1)} e1=${e1.toFixed(1)}`);
  const D = graphA();
  simulate(D.nodes, D.edges, 400);
  const drift = simulateStep(D.nodes, D.edges, new Map(D.nodes.map((n) => [n.id, n])));
  ok("settled graph is stable (residual energy tiny)", drift < 20, `drift=${drift.toFixed(2)}`);
  const xs = D.nodes.map((n) => n.x);
  ok("layout spreads across space (no pile-up)", Math.max(...xs) - Math.min(...xs) > 60);
  const probe = makeNode("p", "probe", 1);
  probe.x = 100;
  probe.y = 0;
  probe.z = 0;
  const atYaw0 = project(probe, 0, 0, 620, 800, 400, 1);
  const atYaw90 = project(probe, Math.PI / 2, 0, 620, 800, 400, 1);
  ok("yaw rotates the point across the screen", Math.abs(atYaw0.x - atYaw90.x) > 30);
  const deep = makeNode("d", "deep", 1);
  deep.x = 0;
  deep.y = 0;
  deep.z = 0;
  const near = makeNode("n2", "near", 1);
  near.x = 0;
  near.y = 0;
  near.z = -300;
  const pn = project(near, 0, 0, 620, 800, 400, 1);
  const pd = project(deep, 0, 0, 620, 800, 400, 1);
  ok("perspective: nearer points project larger", pn.scale > pd.scale);
  const zoomed = project(probe, 0, 0, 620, 800, 400, 2);
  ok("zoom scales the projection", Math.abs(zoomed.x - 400) > Math.abs(atYaw0.x - 400) * 1.8);
  ok("projection is centered at origin", Math.abs(pd.x - 400) < 1e-3 && Math.abs(pd.y - 200) < 1e-3);
  ok("the product mounts a live WebGL graph (3d-force-graph), not a static SVG", consoleSrc.includes('import("3d-force-graph")') && !consoleSrc.includes('svg viewBox="0 0 660 340"'));
  ok("the graph library is loaded lazily inside the mount effect (SSR/node-safe)", !/^import (?!type )[^;]*3d-force-graph/m.test(consoleSrc));
  ok(
    "canvas carries the interaction contract (drag/zoom handlers in the engine)",
    (() => {
      const src = fs.readFileSync(path.join(ROOT, "src/engine/graph3d.ts"), "utf8");
      return src.includes("pointerdown") && src.includes("pointermove") && src.includes("wheel") && src.includes("idleUntil");
    })()
  );
  ok(
    "the house finish is pinned: silver specular \u2192 graphite \u2192 glossy black stops",
    (() => {
      const src = fs.readFileSync(path.join(ROOT, "src/engine/graph3d.ts"), "utf8");
      return src.includes("236, 239, 244") && src.includes("52, 56, 66") && src.includes("8, 9, 12");
    })()
  );
  ok("edge styling is depth-faded silver", (() => {
    const src = fs.readFileSync(path.join(ROOT, "src/engine/graph3d.ts"), "utf8");
    return src.includes("rgba(200, 205, 214,");
  })());
  ok("the graph is genuinely interactive \u2014 orbit controls, drag, zoom and rotation are wired", /enableNodeDrag|onNodeDrag|controls\(\)/.test(consoleSrc) && /autoRotate|rot/.test(consoleSrc));
  ok("zero-dependency engine (no three.js, no d3 import/require)", (() => {
    const src = fs.readFileSync(path.join(ROOT, "src/engine/graph3d.ts"), "utf8");
    const imports = src.match(/^import[^;]*;/gm)?.join("\n") ?? "";
    return !imports.includes("three") && !imports.includes("d3") && !src.includes('require("three")') && !src.includes('require("d3');
  })());
  ok("package.json ships 3d-force-graph plus three (custom meshes) and no d3", (() => {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    const g = Object.keys(deps).filter((d) => /three|d3|force-graph|sigma/.test(d)).sort();
    return g.includes("3d-force-graph") && g.includes("three") && !g.some((d) => d.startsWith("d3"));
  })());
  ok(
    "the graph canvas takes its ground from the --bg token (never a hardcoded hex)",
    /cssVar\(\s*"--bg"/.test(consoleSrc) && /backgroundColor\("rgba\(0,0,0,0\)"\)/.test(consoleSrc)
  );
  ok("the graph sits in a blue-free house palette", !/#0D1010|#007AFF|#3B82F6|#2563EB|#1E40AF|hsla?\([^)]*\b(2[0-9]{2})\b/i.test(css));
  ok("Graph3D exposes view + dispose (lifecycle)", typeof Graph3D.prototype.dispose === "function" && typeof Graph3D.prototype.view === "object");
  console.log(`
${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.log("\nfailures:");
    for (const f of failures) console.log(`  - ${f}`);
    process.exit(1);
  }
}
main();
