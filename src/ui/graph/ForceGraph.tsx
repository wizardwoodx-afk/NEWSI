/**
 * SelfImpulse — the two 3D graphs.
 *
 * Renderer: 3d-force-graph (MIT, vasturiano) over three.js / WebGL / d3-force-3d.
 * That is the maintained OSS 3D force-graph. Cosmograph is GPU-faster at 50k+
 * nodes; our graphs are tens of nodes, so the Three.js path is the right one —
 * it lets each MODE have its own geometry, material and lighting.
 *
 * ── REALISTIC, AND STILL THE HOUSE PALETTE ───────────────────────────────────
 * The brief was "realistic, movable, rotatable", and the honest reading of
 * "realistic" for a node graph is MATERIAL, not texture: nodes that catch a key
 * light, carry a specular highlight, and sit in a scene with real directional
 * light, ambient fill and a rim so their silhouettes read against the ground.
 *
 * WHAT "REALISTIC" DOES NOT MEAN HERE: photoreal, textured, or beige. Two hard
 * constraints survive, both machine-checked by the gate:
 *   • no AI-purple, no Apple-blue, no electric cyan — probe/theme.test.ts and
 *     probe/graph3d.test.ts both grep for those literals, and they are right to;
 *   • one accent hue across the whole product.
 * So the material vocabulary is metal, stone, glass and light — a workshop —
 * and the colour vocabulary is graphite, brass and verdigris. Realism comes
 * from the light and the surfaces, not from introducing new hues.
 *
 * ── TWO MODES, TWO PLACES ───────────────────────────────────────────────────
 * The grounds are set in vh.css and they differ in KIND, not in tint: WORK is a
 * workshop floor with a horizon and receding perspective; MEMORY is an open
 * field with a two-depth starfield and no plane at all.
 *
 *   • "work"   — mission DAG, top→bottom. Machined brass octahedra, steel
 *                boxes for tools, a directional key from above.
 *   • "memory" — topic cluster, no up. Frosted glass spheres with transmission,
 *                lit from three sides, no directional arrows.
 *
 * Interactivity is unchanged and deliberately conventional, because a 3D view
 * that cannot be moved is a picture: LEFT-DRAG orbits, WHEEL zooms, drag a node
 * to move it, click to focus, double-click to open.
 *
 * WebGL is loaded on demand: the shell paints with zero GPU cost, and the
 * module stays importable in SSR / the render probe.
 */
import React, { useEffect, useRef } from "react";
import { THEMES } from "../store";

/* 3d-force-graph's published types are generic over node/link; we keep the
   instance as a structural any so custom Three.js meshes don't fight them. */
type FgInst = {
  width: (n: number) => FgInst; height: (n: number) => FgInst;
  backgroundColor: (c: string) => FgInst; showNavInfo: (v: boolean) => FgInst;
  nodeThreeObject: (fn: (n: FgNode) => unknown) => FgInst;
  nodeThreeObjectExtend: (v: boolean) => FgInst;
  nodeLabel: (fn: (n: FgNode) => string) => FgInst;
  linkColor: (fn: (l: FgLink) => string) => FgInst;
  linkWidth: (fn: (l: FgLink) => number) => FgInst;
  linkOpacity: (n: number) => FgInst;
  linkDirectionalArrowLength: (n: number) => FgInst;
  linkDirectionalArrowRelPos: (n: number) => FgInst;
  linkDirectionalArrowColor: (fn: () => string) => FgInst;
  linkDirectionalParticles: (fn: (l: FgLink) => number) => FgInst;
  linkDirectionalParticleWidth: (n: number) => FgInst;
  linkDirectionalParticleColor: (fn: () => string) => FgInst;
  linkDirectionalParticleSpeed: (fn: (l: FgLink) => number) => FgInst;
  dagMode: (m: "td" | null) => FgInst; dagLevelDistance: (n: number) => FgInst;
  warmupTicks: (n: number) => FgInst; cooldownTicks: (n: number) => FgInst; cooldownTime: (n: number) => FgInst;
  onNodeClick: (fn: (n: FgNode) => void) => FgInst;
  d3Force: (name: string) => { strength: (n: number) => void } | undefined;
  cameraPosition: (pos: { x: number; y: number; z: number }, lookAt?: unknown, ms?: number) => FgInst;
  scene: () => { add: (...o: unknown[]) => void; fog?: unknown };
  rendererConfig: (o: Record<string, unknown>) => FgInst;
  linkCurvature: (v: number) => FgInst;
  linkResolution: (v: number) => FgInst;
  controls: () => { autoRotate: boolean; autoRotateSpeed: number; enableDamping: boolean };
  onEngineStop: (fn: () => void) => FgInst; zoomToFit: (ms: number, pad: number) => FgInst;
  graphData: (data?: { nodes: FgNode[]; links: FgLink[] }) => { nodes: FgNode[]; links: FgLink[] };
  d3ReheatSimulation: () => FgInst;
  _destructor: () => void;
};
const loadRenderer = () => import("3d-force-graph").then((m) => m.default as unknown as new (el: HTMLElement) => FgInst);
const loadThree = () => import("three") as Promise<ThreeLib>;
type ThreeLib = {
  Mesh: new (g: unknown, m: unknown) => { add: (o: unknown) => void };
  OctahedronGeometry: new (r: number, d: number) => unknown;
  TetrahedronGeometry: new (r: number, d: number) => unknown;
  BoxGeometry: new (x: number, y: number, z: number) => unknown;
  SphereGeometry: new (r: number, w: number, h: number) => unknown;
  CylinderGeometry: new (rt: number, rb: number, h: number, s: number) => unknown;
  MeshStandardMaterial: new (o: Record<string, unknown>) => unknown;
  MeshPhysicalMaterial: new (o: Record<string, unknown>) => unknown;
  MeshBasicMaterial: new (o: Record<string, unknown>) => unknown;
  AmbientLight: new (c: number, i: number) => unknown;
  DirectionalLight: new (c: number, i: number) => { position: { set: (x: number, y: number, z: number) => void } };
  FogExp2: new (c: number, d: number) => unknown;
};

export type GraphMode = "work" | "memory";
export interface FgNode { id: string; name: string; kind: string; val?: number; live?: boolean; sub?: string }
export interface FgLink { source: string; target: string; live?: boolean }

/* MONOCHROME CUT — nodes are white/grey only; role reads through lightness and
 * geometry, not hue. Two functional colours survive: `live` (the accent —
 * something is happening RIGHT NOW) and `refused` (a safety fact that must
 * never be styled away). Everything else is a studio-grey ramp.
 *
 * This used to be a second hardcoded copy of the palette. It had already
 * drifted once from vh.css, which is how --fg-3 ended up shipping an
 * unreadable 4.15:1 in dark while the stylesheet's own comment claimed AA.
 * So the graph now READS the theme tokens at draw time and derives its
 * intermediate greys by blending between --fg and --fg-3. The literals that
 * remain are fallbacks for when the stylesheet has not loaded yet; they are
 * no longer the source of truth. */
function cssVar(name: string, fallback: string): string {
  try {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
  } catch {
    return fallback;
  }
}

function mix(a: string, b: string, t: number): string {
  const pa = /^#([0-9a-f]{6})$/i.exec(a.trim());
  const pb = /^#([0-9a-f]{6})$/i.exec(b.trim());
  if (!pa || !pb) return a;
  const na = parseInt(pa[1], 16), nb = parseInt(pb[1], 16);
  const ch = (sh: number): number =>
    Math.round((((na >> sh) & 255) + (((nb >> sh) & 255) - ((na >> sh) & 255)) * t));
  return "#" + [ch(16), ch(8), ch(0)].map((v) => v.toString(16).padStart(2, "0")).join("").toUpperCase();
}

function palette(): Record<string, string> {
  const dark = currentTheme() === "dark";
  const bg = cssVar("--bg", dark ? "#0A0C0E" : "#E6E5DD");
  const fg = cssVar("--fg", dark ? "#F2F4F6" : "#15181A");
  const fg3 = cssVar("--fg-3", dark ? "#7F868E" : "#5B6269");
  /* "you" is the far end of the ramp: brightest on black, darkest on stone. */
  const pole = dark ? "#FFFFFF" : "#000000";
  /* THE MATERIAL RAMP. Roles are read as one of four MATERIALS rather than as
   * fourteen shades of grey, which is what makes the scene legible at a glance:
   *
   *   brass — the things that decide something: you, the Captain, a gate.
   *   steel — the things that do work: consuls, adepts, tools.
   *   glass — memory: sessions and topics.
   *   ink   — the things that only record: receipts.
   *
   * The greys still derive from the theme tokens rather than from literals, so a
   * theme change moves the whole scene instead of half of it. */
  const brass = dark ? "#C9A45C" : "#9A7628";
  const steel = mix(fg, fg3, 0.34);
  const steelDeep = mix(fg, fg3, 0.56);
  return {
    you: dark ? mix(pole, "#C9A45C", 0.20) : "#2A2116",
    gate: brass,
    captain: brass,
    consul: steel,
    adept: mix(fg, fg3, 0.26),
    session: dark ? "#CFE4DF" : "#1F4A45",
    agent: steel,
    keyword: steelDeep,
    wreceipt: mix(fg, fg3, 0.60),
    tool: mix(fg, fg3, 0.50),
    receipt: mix(fg, fg3, 0.68),
    live: cssVar("--accent", dark ? "#5BD4CE" : "#0A6E6A"),
    refused: cssVar("--bad", dark ? "#E5745F" : "#9C3B2D"),
    link: cssVar("--line", dark ? "rgba(255,255,255,.09)" : "rgba(18,20,24,.10)"),
    wlink: cssVar("--line-2", dark ? "rgba(255,255,255,.15)" : "rgba(18,20,24,.18)"),
    bg,
    fg,
  };
}

/* Light/dark is a PROPERTY OF THE FINISH (store THEMES[].kind), not a literal
 * id match — the retired "light"/"dark" ids no longer exist, so comparing
 * dataset.theme against them would pin every finish to the dark palette. */
export function currentTheme(): "dark" | "light" {
  const id = document.documentElement.dataset.theme;
  return THEMES.find((t) => t.id === id)?.kind ?? "dark";
}

/* ── REDUCED MOTION, IN ONE PLACE ──────────────────────────────────────────────
 * `prefers-reduced-motion` is not a build-time constant and it is not a mount-time
 * fact: a user can turn it on while the window is open. Every motion decision in
 * this file therefore goes through this predicate, and nothing caches the answer.
 *
 * The defect this fixes: the mount effect computed the media query once and gated
 * autoRotate on it, but a SEPARATE effect wrote `ctrl.autoRotate = autoRotate`
 * straight past that gate every time the prop changed — so flipping the toggle
 * put a continuously rotating scene back in front of someone who had asked the
 * OS for less of exactly that. Orbit damping and the directional particles, which
 * are motion too, were never gated at all.
 *
 * The query object is created once and lazily, because `matchMedia()` allocates a
 * fresh MediaQueryList per call and the particle callback below runs per link per
 * frame. `.matches` is a live getter on that one object, so a mid-session change
 * in the OS setting is still picked up — with a property read, not a query. */
let reduceQuery: MediaQueryList | null | undefined;
function reducedMotion(): boolean {
  if (reduceQuery === undefined) {
    reduceQuery = typeof matchMedia === "function" ? matchMedia("(prefers-reduced-motion: reduce)") : null;
  }
  return reduceQuery?.matches ?? false;
}

/** Camera drift, per mode. Zero under reduced motion. */
const ROTATE_SPEED: Record<GraphMode, number> = { work: 0.18, memory: 0.42 };
const PARTICLE_SPEED = (l: FgLink): number => (l.live ? 0.014 : 0.005);

export interface ForceGraphProps {
  mode: GraphMode;
  nodes: FgNode[];
  links: FgLink[];
  onNodeDoubleClick?: (n: FgNode) => void;
  onNodeClick?: (n: FgNode) => void;
  autoRotate?: boolean;
  fitSignal?: number;
  className?: string;
}

export function ForceGraph({ mode, nodes, links, onNodeDoubleClick, onNodeClick, autoRotate = true, fitSignal = 0, className }: ForceGraphProps): React.ReactElement {
  const el = useRef<HTMLDivElement>(null);
  const g = useRef<FgInst | null>(null);
  const last = useRef<{ id: string; at: number }>({ id: "", at: 0 });
  const cbs = useRef({ onNodeDoubleClick, onNodeClick });
  cbs.current = { onNodeDoubleClick, onNodeClick };
  const data = useRef({ nodes, links }); data.current = { nodes, links };
  const rot = useRef(autoRotate); rot.current = autoRotate;

  useEffect(() => {
    const host = el.current; if (!host) return;
    let inst: FgInst | null = null; let ro: ResizeObserver | null = null; let cancelled = false;
    void Promise.all([loadRenderer(), loadThree()]).then(([Ctor, THREE]) => {
      if (cancelled || !host.isConnected) return;
      const c = palette();
      const work = mode === "work";
      const reduce = reducedMotion();
      inst = new Ctor(host)
        .width(host.clientWidth).height(host.clientHeight)
        .backgroundColor("rgba(0,0,0,0)")
        .showNavInfo(false)
        /* Antialiasing is the single cheapest thing that separates "realistic"
           from "a screenshot of a graph": without it every silhouette is a
           staircase, and a staircase reads as a diagram. */
        .rendererConfig({ antialias: true, alpha: true, powerPreference: "high-performance" })
        .nodeThreeObject((n: FgNode) => makeNode(THREE, n, c, work))
        .nodeThreeObjectExtend(false)
        .nodeLabel((n: FgNode) => {
          const x = n;
          /* The two families are the ones the product ships, spelled exactly as
           * their @font-face rules declare them. This used to ask for Geist and
           * Geist Mono, whose files were deleted when Gambetta / Switzer /
           * Fragment Mono replaced them, so every node label silently fell back
           * to the system UI face and the data line to whatever monospace the OS
           * had — a label set outside the design system, next to a canvas whose
           * own palette is read from these same tokens. */
          return `<div style="font:12px &quot;Switzer&quot;,system-ui,sans-serif;background:${c.bg};color:${c.fg};padding:7px 10px;border-radius:8px;box-shadow:0 4px 14px rgba(0,0,0,.4);max-width:280px;border-left:3px solid ${c[x.kind] ?? c.keyword}">${esc(x.name)}${x.sub ? `<br><span style="opacity:.7">${esc(x.sub)}</span>` : ""}<br><span style="opacity:.55;font-family:&quot;Fragment Mono&quot;,monospace;font-size:10px;letter-spacing:.08em">${x.kind.toUpperCase()}${x.live ? " · LIVE" : ""}</span></div>`;
        })
        .linkColor((l: FgLink) => (l.live ? c.live : (work ? c.wlink : c.link)))
        .linkWidth((l: FgLink) => (l.live ? 1.8 : work ? 1.05 : 0.8))
        .linkOpacity(0.95)
        /* A wire drawn dead straight reads as a line on a chart; a slight bow
           reads as a CABLE, which is what it is. Arcs also stop parallel links
           from stacking into one thick line. */
        .linkCurvature(work ? 0.16 : 0.26)
        .linkResolution(18)
        .linkDirectionalArrowLength(work ? 3.5 : 0).linkDirectionalArrowRelPos(1).linkDirectionalArrowColor(() => c.live)
        /* Particles TRAVEL a link, so they are continuous motion and go when the camera
         * does. The gate lives INSIDE the callback because this is re-read every
         * frame: a user who turns reduced motion on mid-session stops them on the
         * next frame, with no re-wiring. Memory mode still spawns none, and
         * probe/patinaShell.test.ts pins this exact expression as the proof. */
        .linkDirectionalParticles((l: FgLink) => (work ? (reducedMotion() ? 0 : (l.live ? 5 : 2)) : 0))
        .linkDirectionalParticleWidth(work && !reduce ? 1.8 : 0).linkDirectionalParticleColor(() => c.live)
        .linkDirectionalParticleSpeed(PARTICLE_SPEED)
        .dagMode(work ? "td" : (null as unknown as "td")).dagLevelDistance(work ? 48 : 0)
        .warmupTicks(work ? 48 : 80)
        .cooldownTicks(work ? 160 : 220)
        .cooldownTime(9000)
        .onNodeClick((n) => {
          const x = n as FgNode & { x: number; y: number; z: number };
          const now = Date.now();
          if (now - last.current.at < 350 && last.current.id === x.id) { cbs.current.onNodeDoubleClick?.(x); return; }
          last.current = { id: x.id, at: now };
          cbs.current.onNodeClick?.(x);
          const d = 70; const r = 1 + d / Math.max(1, Math.hypot(x.x, x.y, x.z));
          inst?.cameraPosition({ x: x.x * r, y: x.y * r, z: x.z * r }, x, 900);
        });
      const live = inst as FgInst;
      live.d3Force("charge")?.strength(work ? -72 : -88);
      live.cameraPosition({ x: 0, y: work ? 40 : 20, z: work ? 280 : 330 });
      lightScene(THREE, live, work, c);
      const ctrl = live.controls();
      ctrl.autoRotate = rot.current && !reduce;
      ctrl.autoRotateSpeed = reduce ? 0 : ROTATE_SPEED[work ? "work" : "memory"];
      /* Damping is an easing curve applied every frame — motion, so it goes when
         the camera does. */
      ctrl.enableDamping = !reduce;
      /* Frame the scene once the layout settles, in BOTH modes — a graph that
         opens cropped is a graph the user has to fix before reading it. */
      live.onEngineStop(() => live.zoomToFit(700, work ? 140 : 120));
      g.current = live;
      live.graphData({ nodes: data.current.nodes.map((n) => ({ ...n })), links: data.current.links.map((l) => ({ ...l })) });
      ro = new ResizeObserver(() => { if (host.isConnected) live.width(host.clientWidth).height(host.clientHeight); });
      ro.observe(host);
    });
    return () => { cancelled = true; ro?.disconnect(); inst?._destructor(); g.current = null; };
  }, [mode]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const inst = g.current; if (!inst) return;
    const cur = inst.graphData();
    const keep = new Map(cur.nodes.map((n: FgNode) => [n.id, n]));
    const merged = nodes.map((n) => Object.assign(keep.get(n.id) ?? {}, n));
    inst.graphData({ nodes: merged as FgNode[], links: links.map((l) => ({ ...l })) });
    inst.d3ReheatSimulation();
  }, [nodes, links]);

  /* THE MOTION GATE. Reads the live instance at apply time — not a captured one, so
   * a prop change that lands before the renderer has resolved is applied when it
   * does — and re-checks the OS setting on every apply. A media-query change
   * re-runs it too, so turning reduced motion on mid-session takes effect without a
   * remount. The camera knobs are imperative properties on the controls object
   * rather than per-frame callbacks, which is why they need re-applying at all;
   * the particle count is not here because its own callback reads the setting
   * live. A control that consults the setting once and a later control that does
   * not is precisely how this regressed. */
  useEffect(() => {
    const apply = (): void => {
      const ctrl = g.current?.controls();
      if (!ctrl) return;
      const off = reducedMotion();
      ctrl.autoRotate = autoRotate && !off;
      ctrl.autoRotateSpeed = off ? 0 : ROTATE_SPEED[mode === "work" ? "work" : "memory"];
      ctrl.enableDamping = !off;
    };
    apply();
    if (typeof matchMedia !== "function") return;
    const mq = matchMedia("(prefers-reduced-motion: reduce)");
    mq.addEventListener?.("change", apply);
    return () => { mq.removeEventListener?.("change", apply); };
  }, [autoRotate, mode]);

  useEffect(() => { if (fitSignal > 0) g.current?.zoomToFit(700, 120); }, [fitSignal]);

  useEffect(() => {
    const obs = new MutationObserver(() => {
      const inst = g.current; if (!inst) return;
      const c = palette(); const work = mode === "work";
      inst.linkColor((l) => (l.live ? c.live : (work ? c.wlink : c.link)));
    });
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => obs.disconnect();
  }, [mode]);

  return <div ref={el} className={`g3 ${className ?? ""}`} data-graph={mode} />;
}

function hexToInt(hex: string): number {
  return parseInt(hex.replace("#", ""), 16);
}

function makeNode(THREE: ThreeLib, n: FgNode, c: Record<string, string>, work: boolean) {
  const hex = c[n.kind] ?? c.keyword;
  const color = hexToInt(hex);
  const r = Math.max(2.2, (n.val ?? 3) * (work ? 1.15 : 1.0));

  /* GEOMETRY CARRIES THE ROLE, so the shape tells you what a node IS before you
     read its label or its colour. That is the difference between a graph you
     read and a graph you study. */
  const geom = work
    ? (n.kind === "you" || n.kind === "captain"
      ? new THREE.OctahedronGeometry(r * 1.18, 0)
      : n.kind === "consul" || n.kind === "adept" || n.kind === "agent"
        ? new THREE.OctahedronGeometry(r, 0)
        : n.kind === "gate"
          ? new THREE.TetrahedronGeometry(r * 1.15, 0)
          : new THREE.BoxGeometry(r * 1.5, r * 1.5, r * 1.5))
    : new THREE.SphereGeometry(r, 32, 24);

  /* MATERIAL IS THE INSTRUMENT. Machined metal in the workshop, frosted glass in
     the memory field. Both are lit by lightScene() below — the material is only
     half of "realistic" and the lighting is the other half. */
  const mat = work
    ? new THREE.MeshPhysicalMaterial({
      color,
      metalness: 0.66,
      roughness: 0.28,
      clearcoat: 1.0,
      clearcoatRoughness: 0.28,
      reflectivity: 0.55,
      emissive: color,
      emissiveIntensity: n.live ? 0.34 : 0.02,
    })
    : new THREE.MeshPhysicalMaterial({
      color,
      metalness: 0.05,
      roughness: 0.22,
      transmission: 0.34,
      thickness: 1.1,
      ior: 1.35,
      clearcoat: 1.0,
      clearcoatRoughness: 0.1,
      emissive: color,
      emissiveIntensity: n.kind === "session" ? 0.3 : 0.1,
    });

  const mesh = new THREE.Mesh(geom, mat);

  if (work) {
    /* A live node gets a machined collar — a real object in the scene rather
       than a screen-space glow, which would read as a decal. */
    if (n.live) {
      const collar = new THREE.Mesh(
        new THREE.CylinderGeometry(r * 1.75, r * 1.75, r * 0.16, 24),
        new THREE.MeshStandardMaterial({ color: hexToInt(c.live), metalness: 0.85, roughness: 0.22, emissive: hexToInt(c.live), emissiveIntensity: 0.5 }),
      );
      mesh.add(collar);
    }
  } else {
    /* MEMORY = FROSTED VOLUME WITH A CORE. The bright speck inside the glass is
       what makes a sphere look like it is holding something rather than being a
       ball, and it survives being small on screen where surface shading does not. */
    const core = new THREE.Mesh(
      new THREE.SphereGeometry(r * (n.kind === "session" ? 0.42 : 0.3), 16, 12),
      new THREE.MeshBasicMaterial({ color: hexToInt(n.kind === "session" ? c.session : hex), transparent: true, opacity: n.kind === "session" ? 0.95 : 0.5, depthWrite: false }),
    );
    mesh.add(core);
    if (n.kind === "session") {
      const halo = new THREE.Mesh(
        new THREE.SphereGeometry(r * 1.85, 20, 14),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.13, depthWrite: false }),
      );
      mesh.add(halo);
    }
  }
  return mesh;
}

function lightScene(THREE: ThreeLib, live: FgInst, work: boolean, c: Record<string, string>): void {
  const scene = live.scene();

  /* FOUR LIGHTS, and they are the whole difference between a bag of shapes and a
     lit scene. A single light leaves every face it cannot reach dead flat, which
     is exactly what a graph with one ambient light looks like. The setup is the
     standard product-shot rig, because that is what it is:
       key   — warm, high and slightly forward. Defines the form.
       fill  — cool and low from the opposite side. Keeps the shadow side readable
               instead of black, and its coolness against the warm key is what
               makes the surfaces look like real material rather than tinted grey.
       rim   — from behind. Picks out the silhouette against the ground, which is
               what makes nodes separate from each other when they overlap.
       under — for the WORKSHOP only: a dim warm bounce, as if off the floor, so
               the undersides of the brass are not a flat black hole. */
  const ambient = new THREE.AmbientLight(0xffffff, work ? 0.34 : 0.46);
  const key = new THREE.DirectionalLight(0xfff0d8, work ? 1.5 : 1.25);
  key.position.set(work ? 40 : -34, work ? 130 : 46, 90);
  const fill = new THREE.DirectionalLight(0xcfdce8, work ? 0.62 : 0.72);
  fill.position.set(-90, 24, -50);
  const rim = new THREE.DirectionalLight(0xffffff, work ? 0.5 : 0.62);
  rim.position.set(34, -40, -110);
  scene.add(ambient, key, fill, rim);
  if (work) {
    const under = new THREE.DirectionalLight(hexToInt(c.mix ?? "#C9A45C"), 0.3);
    under.position.set(0, -120, 20);
    scene.add(under);
  }

  /* FOG SELLS DEPTH — and it must NOT be the ground colour, which is the only
     thing the previous version got wrong. Fog toward the ground erases whatever
     falls behind the focus, so the far half of the graph faded into the page.
     Fog toward a colour slightly LIFTED from the ground keeps the aerial
     perspective (near things crisp, far things soft) while leaving the far nodes
     still visible against their own background. In the memory field, where there
     is deliberately no plane at all, the fog is what supplies the depth cue the
     missing floor would have given. */
  const fogBase = c.bg && /^#[0-9a-f]{6}$/i.test(c.bg) ? c.bg : "#0A0C0E";
  const fogTo = work ? mix(fogBase, "#C9A45C", 0.16) : mix(fogBase, "#CFE4DF", 0.13);
  scene.fog = new THREE.FogExp2(hexToInt(fogTo.replace("#", "")), work ? 0.0011 : 0.0016);
}

function esc(s: string): string { return s.replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch] as string)); }
