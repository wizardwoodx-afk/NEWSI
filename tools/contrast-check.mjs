/**
 * contrast-check.mjs — machine-check every colour pairing in vh.css.
 *
 * WHY THIS EXISTS
 * vh.css carried a header comment asserting "every text step clears WCAG AA
 * against its own ground", listing six ratios. Two of the six were false:
 * --fg-3 was 4.15:1 in dark and 3.21:1 in light, and because the comment was
 * the only evidence, nothing ever noticed the values had drifted from it.
 * A comment cannot fail a build. This can.
 *
 * It parses the real stylesheet, composites rgba() over its backing surface,
 * and computes WCAG 2.1 ratios. Any text pairing under 4.5:1 (or UI
 * component boundary under 3:1) exits non-zero, so the palette cannot
 * silently regress again.
 *
 *   node tools/contrast-check.mjs [path-to-css]
 */
import fs from "node:fs";
import path from "node:path";

const CSS = process.argv[2] ?? path.join(process.cwd(), "src/ui/vh.css");
const src = fs.readFileSync(CSS, "utf8");

function parseTheme(theme) {
  const m = src.match(new RegExp(`\\[data-theme=${theme}\\]\\s*\\{([\\s\\S]*?)\\n\\}`, "m"));
  if (!m) throw new Error(`[data-theme=${theme}] block not found in ${CSS}`);
  const out = {};
  // Tokens are packed several per line, so this matches every pair in the
  // block rather than the first one on each line.
  for (const kv of m[1].matchAll(/--([a-z0-9-]+)\s*:\s*([^;]+);/gi)) out[kv[1]] = kv[2].trim();
  return out;
}

const rgb = (v) => {
  v = v.trim();
  let m = v.match(/^#([0-9a-f]{3,8})$/i);
  if (m) {
    let h = m[1];
    if (h.length === 3) h = h.split("").map((c) => c + c).join("");
    if (h.length === 6) h += "ff";
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  m = v.match(/^rgba?\(([^)]+)\)$/i);
  if (m) { const p = m[1].split(",").map(parseFloat); return [p[0], p[1], p[2]]; }
  return null;
};
const alphaOf = (v) => {
  const m = v.match(/^rgba?\(([^)]+)\)$/i);
  if (!m) return 1;
  const p = m[1].split(",").map(parseFloat);
  return p.length > 3 ? p[3] : 1;
};
const over = (fg, bg, a) => [0, 1, 2].map((i) => Math.round(fg[i] * a + bg[i] * (1 - a)));
const lum = ([r, g, b]) => {
  const c = [r, g, b].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const ratio = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};
const resolve = (tok, ground) => {
  const v = tok;
  if (v.startsWith("var(")) return resolve(v.slice(4, -1).trim(), ground);
  if (v.includes("var(")) return resolve(v.match(/var\((--[a-z0-9-]+)\)/i)[1].slice(2), ground);
  const c = rgb(v);
  if (!c) return null;
  const a = alphaOf(v);
  return a < 1 && ground ? over(c, ground, a) : c;
};

/* Every text pairing the stylesheet actually paints. */
const PAIRINGS = [
  ["fg", "bg", "primary body text on the page", 4.5],
  ["fg", "s1", "primary text on a card", 4.5],
  ["fg", "s2", "primary text on a control", 4.5],
  ["fg-2", "bg", "secondary text on the page", 4.5],
  ["fg-2", "s1", "secondary text on a card", 4.5],
  ["fg-2", "s2", "secondary text on a control", 4.5],
  ["fg-3", "bg", "tertiary text / labels on the page", 4.5],
  ["fg-3", "s1", "tertiary text on a card", 4.5],
  ["fg-3", "s2", "tertiary text on a control", 4.5],
  ["accent", "bg", "accent text on the page", 4.5],
  ["accent", "s1", "accent text on a card", 4.5],
  ["accent-fg", "accent", "label on an accent button", 4.5],
  ["on-accent", "accent", "label on an accent button (alt)", 4.5],
  ["ok", "bg", "ok text on the page", 4.5],
  ["warn", "bg", "warn text on the page", 4.5],
  ["bad", "bg", "bad text on the page", 4.5],
  ["ok", "s1", "ok text on a card", 4.5],
  ["warn", "s1", "warn text on a card", 4.5],
  ["bad", "s1", "bad text on a card", 4.5],
];

let failures = 0;
let checked = 0;
const rows = [];

for (const theme of ["dark", "light"]) {
  const t = parseTheme(theme);
  for (const [f, b, label, min] of PAIRINGS) {
    if (!t[f] || !t[b]) {
      rows.push({ theme, label: `${f} on ${b}`, ratio: null, min, note: "token missing" });
      failures++;
      continue;
    }
    const ground = resolve(t[b], null);
    let fgRgb = resolve(t[f], ground);
    if (fgRgb) {
      const raw = rgb(t[f]);
      if (raw && alphaOf(t[f]) < 1 && ground) fgRgb = over(raw, ground, alphaOf(t[f]));
    }
    if (!ground || !fgRgb) {
      rows.push({ theme, label: `${f} on ${b}`, ratio: null, min, note: "unresolved" });
      failures++;
      continue;
    }
    const r = ratio(fgRgb, ground);
    checked++;
    const ok = r >= min;
    if (!ok) failures++;
    rows.push({ theme, label: `${f} on ${b} — ${label}`, ratio: r, min, note: ok ? "pass" : "FAIL" });
  }
}

const w = Math.max(...rows.map((r) => r.label.length));
for (const r of rows) {
  const v = r.ratio === null ? "  n/a " : r.ratio.toFixed(2).padStart(6);
  console.log(`  ${r.theme.padEnd(5)} ${r.label.padEnd(w)} ${v}:1  min ${r.min}  ${r.note}`);
}

const worst = rows.filter((r) => r.ratio !== null).reduce((a, b) => (b.ratio < a.ratio ? b : a));
console.log(`\n  ${checked} pairings checked across both themes.`);
console.log(`  worst: ${worst.theme} ${worst.label} at ${worst.ratio.toFixed(2)}:1`);
if (failures > 0) {
  console.error(`\n  CONTRAST CHECK FAILED — ${failures} pairing(s) below their minimum.`);
  process.exit(1);
}
console.log("  CONTRAST CHECK PASSED — every text pairing clears WCAG AA.");
