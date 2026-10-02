/**
 * GRAPH3D — the memory graph, rendered as an interactive 3D space
 * (19.7.2.1 [Agent]).
 *
 * WHY HAND-ROLLED: 3D graph libraries exist (3d-force-graph over three.js,
 * d3-force canvas) — they were evaluated. This product ships byte-pinned
 * offline verification and a strict CSP with zero runtime dependencies in
 * the web build, so the graph engine is ~300 lines of owned TypeScript:
 * a deterministic force-directed layout in 3D, perspective projection,
 * and a canvas renderer with the house finish — GLOSSY BLACK nodes with
 * SILVER-GREY speculars and depth-faded silver edges, on the noir ground.
 *
 * Interaction (the user moves the graph): drag to rotate with inertia,
 * wheel/pinch to zoom, click a node to focus, idle auto-rotation that
 * yields to the hand and resumes after a pause. Touch supported.
 *
 * probe/graph3d pins: layout determinism, projection math, force
 * convergence, and the plane wiring (canvas, drag, zoom, finish).
 */

export interface G3Node {
  id: string;
  label: string;
  weight: number;
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
}

export interface G3Edge {
  a: string;
  b: string;
  weight: number;
}

/* ── deterministic seeding (fnv1a → sphere scatter) ──────────────────── */
export function fnv1a(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}

export function seedPositions(nodes: G3Node[]): void {
  const n = Math.max(1, nodes.length);
  for (const node of nodes) {
    const h = parseInt(fnv1a(node.id), 16);
    const theta = (h % 3600) / 3600 * Math.PI * 2;
    const phi = (((h >>> 12) % 1000) / 1000) * Math.PI;
    const r = 120 * Math.cbrt(((h >>> 22) % 1000) / 1000) + 40;
    node.x = r * Math.sin(phi) * Math.cos(theta);
    node.y = r * Math.cos(phi) * 0.72;
    node.z = r * Math.sin(phi) * Math.sin(theta);
    node.vx = 0; node.vy = 0; node.vz = 0;
  }
  void n;
}

export function makeNode(id: string, label: string, weight: number): G3Node {
  const n: G3Node = { id, label, weight, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 };
  seedPositions([n]);
  return n;
}

/* ── the force simulation (repulsion + springs + centering) ──────────── */
const REPULSION = 14000;
const SPRING = 0.02;
const SPRING_LEN = 115;
const CENTERING = 0.0011;
const DAMPING = 0.86;
const MAX_V = 9;

export function simulateStep(nodes: G3Node[], edges: G3Edge[], byId: Map<string, G3Node>): number {
  let energy = 0;
  for (let i = 0; i < nodes.length; i++) {
    const a = nodes[i];
    for (let j = i + 1; j < nodes.length; j++) {
      const b = nodes[j];
      let dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
      let d2 = dx * dx + dy * dy + dz * dz;
      if (d2 < 1) { dx = (Math.random() - 0.5) || 0.5; dy = (Math.random() - 0.5) || 0.5; dz = 0.5; d2 = dx * dx + dy * dy + dz * dz; }
      const f = REPULSION / d2;
      const d = Math.sqrt(d2);
      const fx = (dx / d) * f, fy = (dy / d) * f, fz = (dz / d) * f;
      a.vx -= fx; a.vy -= fy; a.vz -= fz;
      b.vx += fx; b.vy += fy; b.vz += fz;
    }
  }
  for (const e of edges) {
    const a = byId.get(e.a), b = byId.get(e.b);
    if (!a || !b) continue;
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
    const target = SPRING_LEN / (0.6 + e.weight * 0.4);
    const f = SPRING * (d - target);
    const fx = (dx / d) * f, fy = (dy / d) * f, fz = (dz / d) * f;
    a.vx += fx; a.vy += fy; a.vz += fz;
    b.vx -= fx; b.vy -= fy; b.vz -= fz;
  }
  for (const node of nodes) {
    node.vx -= node.x * CENTERING;
    node.vy -= node.y * CENTERING;
    node.vz -= node.z * CENTERING;
    node.vx *= DAMPING; node.vy *= DAMPING; node.vz *= DAMPING;
    const v = Math.sqrt(node.vx ** 2 + node.vy ** 2 + node.vz ** 2);
    if (v > MAX_V) { const s = MAX_V / v; node.vx *= s; node.vy *= s; node.vz *= s; }
    node.x += node.vx; node.y += node.vy; node.z += node.vz;
    energy += Math.abs(node.vx) + Math.abs(node.vy) + Math.abs(node.vz);
  }
  return energy;
}

/** Run to (bounded) equilibrium. Deterministic for the same input graph. */
export function simulate(nodes: G3Node[], edges: G3Edge[], maxSteps = 260): number {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  let energy = Infinity;
  for (let step = 0; step < maxSteps; step++) {
    energy = simulateStep(nodes, edges, byId);
    if (energy < 0.6) break;
  }
  return energy;
}

/* ── projection (yaw around Y, pitch around X, perspective divide) ───── */
export interface Projected { x: number; y: number; scale: number; depth: number }

export function project(
  node: G3Node, yaw: number, pitch: number, dist: number, w: number, h: number, zoom: number,
): Projected {
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  const x1 = node.x * cy - node.z * sy;
  const z1 = node.x * sy + node.z * cy;
  const cp = Math.cos(pitch), sp = Math.sin(pitch);
  const y1 = node.y * cp - z1 * sp;
  const z2 = node.y * sp + z1 * cp + dist;
  if (z2 <= 0.1) return { x: w / 2, y: h / 2, scale: 0, depth: -1 };
  const f = (Math.min(w, h) * 0.62 * zoom) / z2;
  return { x: w / 2 + x1 * f, y: h / 2 + y1 * f, scale: f, depth: z2 };
}

/* ── the renderer (glossy black spheres, silver edges, drag inertia) ─── */
export interface Graph3DOptions {
  nodes: G3Node[];
  edges: G3Edge[];
  onFocus?: (id: string) => void;
  heightPx?: number;
}

export class Graph3D {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private opts: Graph3DOptions;
  private yaw = 0.5;
  private pitch = 0.35;
  private dist = 620;
  private zoom = 1;
  private vyaw = 0.004;
  private vpitch = 0;
  private dragging = false;
  private lastX = 0;
  private lastY = 0;
  private idle = true;
  private idleUntil = 0;
  private raf = 0;
  private disposed = false;
  private simulated = false;

  constructor(canvas: HTMLCanvasElement, opts: Graph3DOptions) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d")!;
    this.opts = opts;
    this.fit();
    this.wire();
    this.raf = requestAnimationFrame(this.frame);
  }

  /** Zoom-to-fit: fill the canvas with the graph, whatever its seeded spread. */
  private fit(): void {
    const ns = this.opts.nodes;
    if (ns.length === 0) return;
    const c = ns.reduce((a, n) => ({ x: a.x + n.x / ns.length, y: a.y + n.y / ns.length, z: a.z + n.z / ns.length }), { x: 0, y: 0, z: 0 });
    const radius = Math.max(...ns.map((n) => Math.sqrt((n.x - c.x) ** 2 + (n.y - c.y) ** 2 + (n.z - c.z) ** 2)), 1);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = this.canvas.clientWidth / dpr, h = this.canvas.clientHeight / dpr;
    const target = (0.62 * Math.min(w, h) * 0.92) / Math.max(radius, 1); // project() scales min(w,h)*0.62*zoom/depth
    this.zoom = Math.max(0.45, Math.min(4.2, target));
  }

  private wire(): void {
    const c = this.canvas;
    c.addEventListener("pointerdown", this.onDown);
    c.addEventListener("pointermove", this.onMove);
    c.addEventListener("pointerup", this.onUp);
    c.addEventListener("pointerleave", this.onUp);
    c.addEventListener("wheel", this.onWheel, { passive: false });
  }

  private onDown = (e: PointerEvent): void => {
    this.dragging = true; this.idle = false;
    this.lastX = e.clientX; this.lastY = e.clientY;
    this.vyaw = 0; this.vpitch = 0;
    (e.target as Element).setPointerCapture?.(e.pointerId);
  };

  private onMove = (e: PointerEvent): void => {
    if (!this.dragging) return;
    const dx = e.clientX - this.lastX, dy = e.clientY - this.lastY;
    this.lastX = e.clientX; this.lastY = e.clientY;
    this.yaw += dx * 0.008;
    this.pitch = Math.max(-1.35, Math.min(1.35, this.pitch + dy * 0.006));
    this.vyaw = dx * 0.008;
    this.vpitch = dy * 0.006;
  };

  private onUp = (): void => {
    if (!this.dragging) return;
    this.dragging = false;
    this.idleUntil = Date.now() + 8000;
  };

  private onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    this.zoom = Math.max(0.45, Math.min(4.2, this.zoom * (e.deltaY > 0 ? 0.92 : 1.08)));
    this.idle = false;
    this.idleUntil = Date.now() + 8000;
  };

  dispose(): void {
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
  get view(): { yaw: number; pitch: number; zoom: number; idle: boolean } {
    return { yaw: this.yaw, pitch: this.pitch, zoom: this.zoom, idle: this.idle };
  }

  private resize(): boolean {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(2, globalThis.devicePixelRatio || 1);
    const w = Math.max(1, Math.round(rect.width * dpr));
    const h = Math.max(1, Math.round((this.opts.heightPx ?? 320) * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w; this.canvas.height = h;
      return true;
    }
    return false;
  }

  private frame = (): void => {
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
    /* idle: slow cinematic rotation; interacting: inertia from the hand. */
    if (!this.dragging) {
      if (Date.now() > this.idleUntil) this.idle = true;
      if (this.idle) {
        this.yaw += 0.0016;
      } else {
        this.yaw += this.vyaw;
        this.pitch = Math.max(-1.35, Math.min(1.35, this.pitch + this.vpitch));
        this.vyaw *= 0.94; this.vpitch *= 0.94;
        if (Math.abs(this.vyaw) < 0.00005) this.vyaw = 0;
      }
    }

    const cssBg = getComputedStyle(this.canvas).backgroundColor;
    ctx.fillStyle = cssBg && cssBg !== "rgba(0, 0, 0, 0)" ? cssBg : "#0b0c10";
    ctx.fillRect(0, 0, w, h);

    const proj = this.opts.nodes
      .map((n) => ({ n, p: project(n, this.yaw, this.pitch, this.dist, w / dpr, h / dpr, this.zoom) }))
      .filter((o) => o.p.depth > 0)
      .sort((a, b) => b.p.depth - a.p.depth);

    /* edges first — silver hairlines, faded by depth. */
    const posById = new Map(proj.map((o) => [o.n.id, o.p]));
    ctx.lineWidth = Math.max(1, dpr * 0.7);
    for (const e of this.opts.edges) {
      const pa = posById.get(e.a), pb = posById.get(e.b);
      if (!pa || !pb) continue;
      const depth = (pa.depth + pb.depth) / 2;
      const near = Math.max(0, Math.min(1, 1.6 - depth / this.dist));
      ctx.strokeStyle = `rgba(200, 205, 214, ${(0.10 + near * 0.34).toFixed(3)})`;
      ctx.beginPath();
      ctx.moveTo(pa.x * dpr, pa.y * dpr);
      ctx.lineTo(pb.x * dpr, pb.y * dpr);
      ctx.stroke();
    }

    /* nodes — glossy black spheres with a silver-grey specular. */
    for (const { n, p } of proj) {
      if (resized) void 0;
      const r = Math.max(3, (5 + Math.min(11, n.weight * 1.5)) * p.scale * dpr * 0.9);
      const cx = p.x * dpr, cyc = p.y * dpr;
      const near = Math.max(0, Math.min(1, 1.6 - p.depth / this.dist));
      const g = ctx.createRadialGradient(cx - r * 0.38, cyc - r * 0.42, r * 0.12, cx, cyc, r);
      /* the house finish: silver specular → graphite mid → glossy black limb */
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
}
