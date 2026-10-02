/**
 * Frontend engines — the checks a design system can answer in arithmetic rather than taste.
 *
 * Contrast is a legal requirement in most jurisdictions that regulate accessibility, and it
 * is pure arithmetic; there is no reason for it to be a matter of opinion, a screenshot, or a
 * model's impression. Type scales and spacing grids are the same: a decision made once,
 * applied consistently, and checkable.
 */
import { num, text, sel, number, str, type Tool, type ToolResult } from "./types";

/* ── colour ────────────────────────────────────────────────────────────────── */

export interface Rgb { r: number; g: number; b: number; a: number }

/** Accepts #rgb, #rrggbb, #rrggbbaa, rgb()/rgba() and hsl()/hsla(). Returns null, never a guess. */
export function parseColor(input: string): Rgb | null {
  const s = input.trim().toLowerCase();
  const hex = s.match(/^#?([0-9a-f]{3,8})$/);
  if (hex) {
    const h = hex[1]!;
    if (h.length === 3 || h.length === 4) {
      const [r, g, b, a] = h.split("");
      return { r: parseInt(`${r}${r}`, 16), g: parseInt(`${g}${g}`, 16), b: parseInt(`${b}${b}`, 16),
               a: a === undefined ? 1 : parseInt(`${a}${a}`, 16) / 255 };
    }
    if (h.length === 6 || h.length === 8) {
      return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16),
               a: h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1 };
    }
    return null;
  }
  const rgb = s.match(/^rgba?\(([^)]+)\)$/);
  if (rgb) {
    const p = rgb[1]!.split(/[\s,/]+/).filter(Boolean).map(Number);
    if (p.length < 3 || p.slice(0, 3).some((x) => !Number.isFinite(x))) return null;
    return { r: clamp255(p[0]!), g: clamp255(p[1]!), b: clamp255(p[2]!), a: p[3] ?? 1 };
  }
  const hsl = s.match(/^hsla?\(([^)]+)\)$/);
  if (hsl) {
    const p = hsl[1]!.split(/[\s,/]+/).filter(Boolean);
    const h = Number(p[0]), sat = parseFloat(p[1] ?? "0"), l = parseFloat(p[2] ?? "0");
    if (!Number.isFinite(h) || !Number.isFinite(sat) || !Number.isFinite(l)) return null;
    const { r, g, b } = hslToRgb(h, sat / 100, l / 100);
    return { r, g, b, a: p[3] !== undefined ? Number(p[3]) : 1 };
  }
  return null;
}

const clamp255 = (n: number): number => Math.max(0, Math.min(255, Math.round(n)));

export function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
  const hue = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = l - c / 2;
  const seg = Math.floor(hue / 60) % 6;
  const [r1, g1, b1] = [[c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x]][seg]!;
  return { r: clamp255((r1! + m) * 255), g: clamp255((g1! + m) * 255), b: clamp255((b1! + m) * 255) };
}

export function rgbToHsl({ r, g, b }: Rgb): { h: number; s: number; l: number } {
  const [rr, gg, bb] = [r / 255, g / 255, b / 255];
  const max = Math.max(rr, gg, bb), min = Math.min(rr, gg, bb), d = max - min;
  const l = (max + min) / 2;
  if (d === 0) return { h: 0, s: 0, l: l * 100 };
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = max === rr ? 60 * (((gg - bb) / d) % 6) : max === gg ? 60 * ((bb - rr) / d + 2) : 60 * ((rr - gg) / d + 4);
  return { h: ((h % 360) + 360) % 360, s: s * 100, l: l * 100 };
}

export const toHex = (c: Rgb): string =>
  `#${[c.r, c.g, c.b].map((x) => x.toString(16).padStart(2, "0")).join("")}`
  + (c.a < 1 ? Math.round(c.a * 255).toString(16).padStart(2, "0") : "");

/** WCAG 2.x relative luminance. */
export function relativeLuminance(c: Rgb): number {
  const f = (v: number): number => {
    const x = v / 255;
    return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
}

/** WCAG 2.x contrast ratio, 1 to 21. Order does not matter. */
export function contrastRatio(a: Rgb, b: Rgb): number {
  const la = relativeLuminance(a), lb = relativeLuminance(b);
  const hi = Math.max(la, lb), lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}

export interface ContrastVerdict {
  ratio: number;
  aaNormal: boolean; aaLarge: boolean; aaaNormal: boolean; aaaLarge: boolean;
  /** What you would have to change to pass, stated as an action rather than a score. */
  guidance: string;
}

export function wcagVerdict(ratio: number): ContrastVerdict {
  const aaNormal = ratio >= 4.5, aaLarge = ratio >= 3, aaaNormal = ratio >= 7, aaaLarge = ratio >= 4.5;
  const guidance = aaaNormal
    ? "passes AAA for body text as well as AA"
    : aaNormal
      ? "passes AA for body text; AAA (7:1) is not met — acceptable for everything except the strictest briefs"
      : aaLarge
        ? "passes AA for LARGE text only (18.66px bold or 24px+): do not use this pair for body copy"
        : "fails every threshold — increase the luminance gap";
  return { ratio, aaNormal, aaLarge, aaaNormal, aaaLarge, guidance };
}

/* ── type scale ────────────────────────────────────────────────────────────── */

export interface TypeStep { step: number; px: number; rem: number; name: string }

/**
 * A modular scale. Rounding is to a quarter pixel and the rounded value is what the next
 * step multiplies — a scale that compounds unrounded values drifts away from the sizes a
 * designer actually writes down.
 */
export function typeScale(base: number, ratio: number, steps: number): TypeStep[] {
  const NAMES = ["-1", "base", "lg", "xl", "2xl", "3xl", "4xl", "5xl", "6xl"];
  const out: TypeStep[] = [];
  let previous = Math.round((base / ratio) * 4) / 4;
  for (let i = -1; i < steps - 1; i++) {
    const raw = i === -1 ? base / ratio : previous * ratio;
    const px = Math.round(raw * 4) / 4;
    out.push({ step: i, px, rem: Math.round((px / 16) * 1000) / 1000, name: NAMES[i + 1] ?? `step${i}` });
    previous = px;
  }
  return out;
}

/* ── spacing grid ──────────────────────────────────────────────────────────── */

export function spacingGrid(base: number, count: number): number[] {
  return Array.from({ length: count + 1 }, (_, i) => i * base);
}

/** Snaps arbitrary values onto a grid, reporting the movement and the worst offender. */
export function snapToGrid(values: number[], base: number): {
  rows: Array<{ value: number; snapped: number; moved: number }>; worst: number; onGrid: number;
} {
  const mapped = values.map((v) => {
    const snapped = Math.round(v / base) * base;
    return { value: v, snapped, moved: Math.round((snapped - v) * 100) / 100 };
  });
  const moved = mapped.map((m) => Math.abs(m.moved));
  return {
    rows: mapped,
    worst: moved.length ? Math.max(...moved) : 0,
    onGrid: mapped.filter((m) => m.moved === 0).length,
  };
}

/* ── the tools ─────────────────────────────────────────────────────────────── */

export const FRONTEND_TOOLS: Tool[] = [
  {
    id: "contrast",
    domain: "frontend",
    label: "Contrast",
    blurb: "WCAG 2.x contrast ratio for a foreground/background pair, and what it passes.",
    fields: [
      text("fg", "Text colour", "#8A9BA8", "hex, rgb() or hsl()"),
      text("bg", "Background", "#0E1113"),
      sel("size", "Text size", ["body", "large"], "body", "large = 24px+, or 18.66px bold"),
    ],
    run: (v): ToolResult => {
      const fg = parseColor(str(v, "fg")), bg = parseColor(str(v, "bg"));
      if (!fg || !bg) {
        return { headline: "One of those is not a colour this engine can read", ok: false,
          basis: "accepted forms: #rgb · #rrggbb · #rrggbbaa · rgb()/rgba() · hsl()/hsla() — an unreadable "
               + "value is refused rather than approximated" };
      }
      const ratio = contrastRatio(fg, bg);
      const verdict = wcagVerdict(ratio);
      const large = str(v, "size") === "large";
      const passesNow = large ? verdict.aaLarge : verdict.aaNormal;
      return {
        headline: `${ratio.toFixed(2)}:1 — ${passesNow ? "passes" : "fails"} AA for ${large ? "large" : "body"} text`,
        ok: passesNow,
        kpis: [
          { value: `${ratio.toFixed(2)}:1`, label: "contrast ratio" },
          { value: verdict.aaaNormal ? "AAA" : verdict.aaNormal ? "AA" : verdict.aaLarge ? "AA large" : "fail", label: "highest level met" },
          { value: toHex(fg), label: "text" },
          { value: toHex(bg), label: "background" },
        ],
        lines: [verdict.guidance],
        basis: "WCAG 2.1 SC 1.4.3 / 1.4.6 — relative luminance per WCAG, ratio = (L1+0.05)/(L2+0.05); "
             + "AA 4.5:1 body and 3:1 large, AAA 7:1 body and 4.5:1 large",
      };
    },
  },
  {
    id: "colour",
    domain: "frontend",
    label: "Colour convert",
    blurb: "One colour in every notation a codebase, a design file and a runtime need.",
    fields: [text("c", "Colour", "#D5B26B")],
    run: (v): ToolResult => {
      const c = parseColor(str(v, "c"));
      if (!c) return { headline: "Not a colour this engine can read", ok: false,
        basis: "#rgb · #rrggbb · #rrggbbaa · rgb() · rgba() · hsl() · hsla()" };
      const hsl = rgbToHsl(c);
      return {
        headline: toHex(c),
        ok: true,
        kpis: [
          { value: toHex(c), label: "hex" },
          { value: `rgb(${c.r}, ${c.g}, ${c.b})`, label: "rgb" },
          { value: `hsl(${hsl.h.toFixed(0)}, ${hsl.s.toFixed(0)}%, ${hsl.l.toFixed(0)}%)`, label: "hsl" },
          { value: c.a.toFixed(2), label: "alpha" },
        ],
        lines: [`On white: ${contrastRatio(c, { r: 255, g: 255, b: 255, a: 1 }).toFixed(2)}:1 · on black: `
              + `${contrastRatio(c, { r: 0, g: 0, b: 0, a: 1 }).toFixed(2)}:1`],
        basis: "sRGB conversion, alpha preserved from an 8-digit hex or an rgba()/hsla() argument",
      };
    },
  },
  {
    id: "type-scale",
    domain: "frontend",
    label: "Type scale",
    blurb: "A modular type scale in px and rem, rounded the way a designer writes it.",
    fields: [
      num("base", "Base size (px)", "16"),
      sel("ratio", "Ratio", ["1.125", "1.2", "1.25", "1.333", "1.414", "1.5", "1.618"], "1.25"),
      num("steps", "Steps", "6"),
    ],
    run: (v): ToolResult => {
      const base = number(v, "base", 16), ratio = Number(str(v, "ratio")) || 1.25;
      const steps = Math.max(2, Math.min(9, Math.round(number(v, "steps", 6))));
      const scale = typeScale(base, ratio, steps);
      return {
        headline: `${base}px × ${ratio} — ${scale.length} steps`,
        ok: true,
        table: { head: ["Step", "Name", "px", "rem"], rows: scale.map((s) => [String(s.step), s.name, `${s.px}`, `${s.rem}`]) },
        lines: [`Smallest ${scale[0]!.px}px · largest ${scale[scale.length - 1]!.px}px. Rounding is to a quarter `
              + `pixel and each step compounds the ROUNDED value, so the scale matches the numbers in the code.`],
        basis: "modular scale, ratio applied per step; rem assumes a 16px root",
      };
    },
  },
  {
    id: "spacing",
    domain: "frontend",
    label: "Spacing grid",
    blurb: "Snaps a list of spacing values to a base grid and reports how far each one moved.",
    fields: [
      num("base", "Grid base (px)", "8"),
      num("count", "Scale steps", "8"),
      text("values", "Values to snap", "4, 10, 16, 24, 30, 40, 55", "comma or newline separated"),
    ],
    run: (v): ToolResult => {
      const base = number(v, "base", 8);
      const grid = spacingGrid(base, Math.max(1, Math.min(20, Math.round(number(v, "count", 8)))));
      const values = str(v, "values").split(/[,\s;]+/).map(Number).filter((x) => Number.isFinite(x));
      const snapped = snapToGrid(values, base);
      const bad = snapped.rows.filter((r) => r.moved !== 0);
      return {
        headline: `${snapped.onGrid}/${snapped.rows.length} values already on the ${base}px grid`,
        ok: bad.length === 0,
        kpis: [
          { value: `${base}px`, label: "grid base" },
          { value: `${grid[grid.length - 1]}px`, label: `top of the ${grid.length - 1}-step scale` },
          { value: bad.length ? `${snapped.worst}px` : "—", label: "largest snap" },
        ],
        table: snapped.rows.length
          ? { head: ["Value", "Snapped", "Moved"], rows: snapped.rows.map((r) => [`${r.value}`, `${r.snapped}`, r.moved === 0 ? "—" : `${r.moved > 0 ? "+" : ""}${r.moved}`]) }
          : undefined,
        lines: bad.length
          ? [`${bad.length} value(s) are off-grid. The largest moves ${snapped.worst}px onto the grid.`]
          : ["Every value is already on the grid — the scale is internally consistent."],
        basis: `nearest multiple of ${base}px; a grid is a constraint, and the tool reports the movement `
             + `rather than pretending the values were always aligned`,
      };
    },
  },
];
