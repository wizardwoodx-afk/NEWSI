import { createRequire as __mjCreateRequire } from "node:module"; const require = __mjCreateRequire(import.meta.url);
var __defProp = Object.defineProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// src/specialists/index.ts
var specialists_exports = {};
__export(specialists_exports, {
  API_TOOLS: () => API_TOOLS,
  COMMERCE_TOOLS: () => COMMERCE_TOOLS,
  DATA_TOOLS: () => DATA_TOOLS,
  DEV_TOOLS: () => DEV_TOOLS,
  DOCS_TOOLS: () => DOCS_TOOLS,
  DOMAINS: () => DOMAINS,
  FRONTEND_TOOLS: () => FRONTEND_TOOLS,
  GOVERNANCE_TOOLS: () => GOVERNANCE_TOOLS,
  GROWTH_TOOLS: () => GROWTH_TOOLS,
  HEALTH_TOOLS: () => HEALTH_TOOLS,
  INTELLIGENCE_TOOLS: () => INTELLIGENCE_TOOLS,
  OPS_TOOLS: () => OPS_TOOLS,
  SECURITY_TOOLS: () => SECURITY_TOOLS,
  SPECIALISTS: () => SPECIALISTS,
  SYSTEMS_TOOLS: () => SYSTEMS_TOOLS,
  TOOLS: () => TOOLS,
  abTest: () => abTest,
  anomalyZ: () => anomalyZ,
  appSizeBudget: () => appSizeBudget,
  area: () => area,
  backoffSchedule: () => backoffSchedule,
  bedOccupancy: () => bedOccupancy,
  bitrateBudget: () => bitrateBudget,
  bool: () => bool,
  capacityHeadroom: () => capacityHeadroom,
  checkIdempotencyKey: () => checkIdempotencyKey,
  citationLint: () => citationLint,
  clauseLint: () => clauseLint,
  compBand: () => compBand,
  compareSemver: () => compareSemver,
  contrastRatio: () => contrastRatio,
  crawlBudget: () => crawlBudget,
  cspAudit: () => cspAudit,
  dateTerms: () => dateTerms,
  deployRisk: () => deployRisk,
  egressCost: () => egressCost,
  eoq: () => eoq,
  evalInterval: () => evalInterval,
  findSpecialist: () => findSpecialist,
  flag: () => flag,
  funnel: () => funnel,
  gasPlan: () => gasPlan,
  growthModel: () => growthModel,
  headcountModel: () => headcountModel,
  headingLint: () => headingLint,
  hslToRgb: () => hslToRgb,
  httpSemantics: () => httpSemantics,
  incidentSeverity: () => incidentSeverity,
  indexSelectivity: () => indexSelectivity,
  inr: () => inr,
  instanceSizing: () => instanceSizing,
  jwtInspect: () => jwtInspect,
  lintCommit: () => lintCommit,
  localeCoverage: () => localeCoverage,
  loudnessGain: () => loudnessGain,
  maskSecret: () => maskSecret,
  mean: () => mean,
  metaLint: () => metaLint,
  news2Score: () => news2Score,
  nextVersion: () => nextVersion,
  normalTwoSidedP: () => normalTwoSidedP,
  num: () => num,
  number: () => number,
  outliersIqr: () => outliersIqr,
  paginationPlan: () => paginationPlan,
  parseColor: () => parseColor,
  parseCron: () => parseCron,
  parseSemver: () => parseSemver,
  payloadBudget: () => payloadBudget,
  pct: () => pct,
  percentile: () => percentile,
  percentiles: () => percentiles,
  piiScan: () => piiScan,
  pipelineCoverage: () => pipelineCoverage,
  poolSizing: () => poolSizing,
  powerBudget: () => powerBudget,
  raterAgreement: () => raterAgreement,
  readability: () => readability,
  readingTime: () => readingTime,
  relativeLuminance: () => relativeLuminance,
  retentionClock: () => retentionClock,
  rgbToHsl: () => rgbToHsl,
  riceScore: () => riceScore,
  rows: () => rows,
  safetyStock: () => safetyStock,
  sampleSize: () => sampleSize,
  satisfiesRange: () => satisfiesRange,
  scanSecrets: () => scanSecrets,
  sel: () => sel,
  series: () => series,
  slaClock: () => slaClock,
  sloErrorBudget: () => sloErrorBudget,
  snapToGrid: () => snapToGrid,
  spacingGrid: () => spacingGrid,
  specialistStatus: () => specialistStatus,
  specialistsByDomain: () => specialistsByDomain,
  spendForecast: () => spendForecast,
  splitAudit: () => splitAudit,
  stddev: () => stddev,
  str: () => str,
  stringEntropyBits: () => stringEntropyBits,
  stringExpansion: () => stringExpansion,
  syllables: () => syllables,
  terminologyDrift: () => terminologyDrift,
  text: () => text,
  timingSlack: () => timingSlack,
  toHex: () => toHex,
  tokenBucketPlan: () => tokenBucketPlan,
  tokenDecimals: () => tokenDecimals,
  toolById: () => toolById,
  toolsForDomain: () => toolsForDomain,
  touchTargets: () => touchTargets,
  typeScale: () => typeScale,
  unitEconomics: () => unitEconomics,
  wcagVerdict: () => wcagVerdict
});

// src/specialists/types.ts
var text = (key2, label, def = "", hint) => ({ key: key2, label, kind: "text", def, ...hint ? { hint } : {} });
var num = (key2, label, def, hint) => ({ key: key2, label, kind: "number", def, ...hint ? { hint } : {} });
var area = (key2, label, def = "", hint) => ({ key: key2, label, kind: "textarea", def, ...hint ? { hint } : {} });
var sel = (key2, label, options, def, hint) => ({ key: key2, label, kind: "select", options, def: def ?? options[0] ?? "", ...hint ? { hint } : {} });
var flag = (key2, label, def, hint) => ({ key: key2, label, kind: "toggle", def, ...hint ? { hint } : {} });
var str = (v, key2, fallback = "") => {
  const x = v[key2];
  return typeof x === "string" ? x : typeof x === "boolean" ? String(x) : fallback;
};
var bool = (v, key2, fallback = false) => {
  const x = v[key2];
  return typeof x === "boolean" ? x : typeof x === "string" ? x === "true" : fallback;
};
var number = (v, key2, fallback = 0) => {
  const raw = str(v, key2).replace(/[,\s_₹%]/g, "");
  const n3 = Number(raw);
  return Number.isFinite(n3) ? n3 : fallback;
};
var rows = (v, key2) => str(v, key2).split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0 && !l.startsWith("#"));
var series = (v, key2) => rows(v, key2).flatMap((l) => l.split(/[,\s;]+/)).map((c) => Number(c)).filter((x) => Number.isFinite(x));
var inr = (n3, dp = 2) => `\u20B9${n3.toLocaleString("en-IN", { minimumFractionDigits: dp, maximumFractionDigits: dp })}`;
var pct = (n3, dp = 1) => `${n3.toFixed(dp)}%`;

// src/specialists/frontend.ts
function parseColor(input) {
  const s = input.trim().toLowerCase();
  const hex = s.match(/^#?([0-9a-f]{3,8})$/);
  if (hex) {
    const h = hex[1];
    if (h.length === 3 || h.length === 4) {
      const [r, g, b, a] = h.split("");
      return {
        r: parseInt(`${r}${r}`, 16),
        g: parseInt(`${g}${g}`, 16),
        b: parseInt(`${b}${b}`, 16),
        a: a === void 0 ? 1 : parseInt(`${a}${a}`, 16) / 255
      };
    }
    if (h.length === 6 || h.length === 8) {
      return {
        r: parseInt(h.slice(0, 2), 16),
        g: parseInt(h.slice(2, 4), 16),
        b: parseInt(h.slice(4, 6), 16),
        a: h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1
      };
    }
    return null;
  }
  const rgb = s.match(/^rgba?\(([^)]+)\)$/);
  if (rgb) {
    const p = rgb[1].split(/[\s,/]+/).filter(Boolean).map(Number);
    if (p.length < 3 || p.slice(0, 3).some((x) => !Number.isFinite(x))) return null;
    return { r: clamp255(p[0]), g: clamp255(p[1]), b: clamp255(p[2]), a: p[3] ?? 1 };
  }
  const hsl = s.match(/^hsla?\(([^)]+)\)$/);
  if (hsl) {
    const p = hsl[1].split(/[\s,/]+/).filter(Boolean);
    const h = Number(p[0]), sat = parseFloat(p[1] ?? "0"), l = parseFloat(p[2] ?? "0");
    if (!Number.isFinite(h) || !Number.isFinite(sat) || !Number.isFinite(l)) return null;
    const { r, g, b } = hslToRgb(h, sat / 100, l / 100);
    return { r, g, b, a: p[3] !== void 0 ? Number(p[3]) : 1 };
  }
  return null;
}
var clamp255 = (n3) => Math.max(0, Math.min(255, Math.round(n3)));
function hslToRgb(h, s, l) {
  const hue = (h % 360 + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(hue / 60 % 2 - 1));
  const m = l - c / 2;
  const seg = Math.floor(hue / 60) % 6;
  const [r1, g1, b1] = [[c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x]][seg];
  return { r: clamp255((r1 + m) * 255), g: clamp255((g1 + m) * 255), b: clamp255((b1 + m) * 255) };
}
function rgbToHsl({ r, g, b }) {
  const [rr, gg, bb] = [r / 255, g / 255, b / 255];
  const max = Math.max(rr, gg, bb), min = Math.min(rr, gg, bb), d = max - min;
  const l = (max + min) / 2;
  if (d === 0) return { h: 0, s: 0, l: l * 100 };
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = max === rr ? 60 * ((gg - bb) / d % 6) : max === gg ? 60 * ((bb - rr) / d + 2) : 60 * ((rr - gg) / d + 4);
  return { h: (h % 360 + 360) % 360, s: s * 100, l: l * 100 };
}
var toHex = (c) => `#${[c.r, c.g, c.b].map((x) => x.toString(16).padStart(2, "0")).join("")}` + (c.a < 1 ? Math.round(c.a * 255).toString(16).padStart(2, "0") : "");
function relativeLuminance(c) {
  const f2 = (v) => {
    const x = v / 255;
    return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f2(c.r) + 0.7152 * f2(c.g) + 0.0722 * f2(c.b);
}
function contrastRatio(a, b) {
  const la = relativeLuminance(a), lb = relativeLuminance(b);
  const hi = Math.max(la, lb), lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}
function wcagVerdict(ratio) {
  const aaNormal = ratio >= 4.5, aaLarge = ratio >= 3, aaaNormal = ratio >= 7, aaaLarge = ratio >= 4.5;
  const guidance = aaaNormal ? "passes AAA for body text as well as AA" : aaNormal ? "passes AA for body text; AAA (7:1) is not met \u2014 acceptable for everything except the strictest briefs" : aaLarge ? "passes AA for LARGE text only (18.66px bold or 24px+): do not use this pair for body copy" : "fails every threshold \u2014 increase the luminance gap";
  return { ratio, aaNormal, aaLarge, aaaNormal, aaaLarge, guidance };
}
function typeScale(base, ratio, steps) {
  const NAMES = ["-1", "base", "lg", "xl", "2xl", "3xl", "4xl", "5xl", "6xl"];
  const out = [];
  let previous = Math.round(base / ratio * 4) / 4;
  for (let i = -1; i < steps - 1; i++) {
    const raw = i === -1 ? base / ratio : previous * ratio;
    const px = Math.round(raw * 4) / 4;
    out.push({ step: i, px, rem: Math.round(px / 16 * 1e3) / 1e3, name: NAMES[i + 1] ?? `step${i}` });
    previous = px;
  }
  return out;
}
function spacingGrid(base, count) {
  return Array.from({ length: count + 1 }, (_, i) => i * base);
}
function snapToGrid(values, base) {
  const mapped = values.map((v) => {
    const snapped = Math.round(v / base) * base;
    return { value: v, snapped, moved: Math.round((snapped - v) * 100) / 100 };
  });
  const moved = mapped.map((m) => Math.abs(m.moved));
  return {
    rows: mapped,
    worst: moved.length ? Math.max(...moved) : 0,
    onGrid: mapped.filter((m) => m.moved === 0).length
  };
}
var FRONTEND_TOOLS = [
  {
    id: "contrast",
    domain: "frontend",
    label: "Contrast",
    blurb: "WCAG 2.x contrast ratio for a foreground/background pair, and what it passes.",
    fields: [
      text("fg", "Text colour", "#8A9BA8", "hex, rgb() or hsl()"),
      text("bg", "Background", "#0E1113"),
      sel("size", "Text size", ["body", "large"], "body", "large = 24px+, or 18.66px bold")
    ],
    run: (v) => {
      const fg = parseColor(str(v, "fg")), bg = parseColor(str(v, "bg"));
      if (!fg || !bg) {
        return {
          headline: "One of those is not a colour this engine can read",
          ok: false,
          basis: "accepted forms: #rgb \xB7 #rrggbb \xB7 #rrggbbaa \xB7 rgb()/rgba() \xB7 hsl()/hsla() \u2014 an unreadable value is refused rather than approximated"
        };
      }
      const ratio = contrastRatio(fg, bg);
      const verdict = wcagVerdict(ratio);
      const large = str(v, "size") === "large";
      const passesNow = large ? verdict.aaLarge : verdict.aaNormal;
      return {
        headline: `${ratio.toFixed(2)}:1 \u2014 ${passesNow ? "passes" : "fails"} AA for ${large ? "large" : "body"} text`,
        ok: passesNow,
        kpis: [
          { value: `${ratio.toFixed(2)}:1`, label: "contrast ratio" },
          { value: verdict.aaaNormal ? "AAA" : verdict.aaNormal ? "AA" : verdict.aaLarge ? "AA large" : "fail", label: "highest level met" },
          { value: toHex(fg), label: "text" },
          { value: toHex(bg), label: "background" }
        ],
        lines: [verdict.guidance],
        basis: "WCAG 2.1 SC 1.4.3 / 1.4.6 \u2014 relative luminance per WCAG, ratio = (L1+0.05)/(L2+0.05); AA 4.5:1 body and 3:1 large, AAA 7:1 body and 4.5:1 large"
      };
    }
  },
  {
    id: "colour",
    domain: "frontend",
    label: "Colour convert",
    blurb: "One colour in every notation a codebase, a design file and a runtime need.",
    fields: [text("c", "Colour", "#D5B26B")],
    run: (v) => {
      const c = parseColor(str(v, "c"));
      if (!c) return {
        headline: "Not a colour this engine can read",
        ok: false,
        basis: "#rgb \xB7 #rrggbb \xB7 #rrggbbaa \xB7 rgb() \xB7 rgba() \xB7 hsl() \xB7 hsla()"
      };
      const hsl = rgbToHsl(c);
      return {
        headline: toHex(c),
        ok: true,
        kpis: [
          { value: toHex(c), label: "hex" },
          { value: `rgb(${c.r}, ${c.g}, ${c.b})`, label: "rgb" },
          { value: `hsl(${hsl.h.toFixed(0)}, ${hsl.s.toFixed(0)}%, ${hsl.l.toFixed(0)}%)`, label: "hsl" },
          { value: c.a.toFixed(2), label: "alpha" }
        ],
        lines: [`On white: ${contrastRatio(c, { r: 255, g: 255, b: 255, a: 1 }).toFixed(2)}:1 \xB7 on black: ${contrastRatio(c, { r: 0, g: 0, b: 0, a: 1 }).toFixed(2)}:1`],
        basis: "sRGB conversion, alpha preserved from an 8-digit hex or an rgba()/hsla() argument"
      };
    }
  },
  {
    id: "type-scale",
    domain: "frontend",
    label: "Type scale",
    blurb: "A modular type scale in px and rem, rounded the way a designer writes it.",
    fields: [
      num("base", "Base size (px)", "16"),
      sel("ratio", "Ratio", ["1.125", "1.2", "1.25", "1.333", "1.414", "1.5", "1.618"], "1.25"),
      num("steps", "Steps", "6")
    ],
    run: (v) => {
      const base = number(v, "base", 16), ratio = Number(str(v, "ratio")) || 1.25;
      const steps = Math.max(2, Math.min(9, Math.round(number(v, "steps", 6))));
      const scale2 = typeScale(base, ratio, steps);
      return {
        headline: `${base}px \xD7 ${ratio} \u2014 ${scale2.length} steps`,
        ok: true,
        table: { head: ["Step", "Name", "px", "rem"], rows: scale2.map((s) => [String(s.step), s.name, `${s.px}`, `${s.rem}`]) },
        lines: [`Smallest ${scale2[0].px}px \xB7 largest ${scale2[scale2.length - 1].px}px. Rounding is to a quarter pixel and each step compounds the ROUNDED value, so the scale matches the numbers in the code.`],
        basis: "modular scale, ratio applied per step; rem assumes a 16px root"
      };
    }
  },
  {
    id: "spacing",
    domain: "frontend",
    label: "Spacing grid",
    blurb: "Snaps a list of spacing values to a base grid and reports how far each one moved.",
    fields: [
      num("base", "Grid base (px)", "8"),
      num("count", "Scale steps", "8"),
      text("values", "Values to snap", "4, 10, 16, 24, 30, 40, 55", "comma or newline separated")
    ],
    run: (v) => {
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
          { value: bad.length ? `${snapped.worst}px` : "\u2014", label: "largest snap" }
        ],
        table: snapped.rows.length ? { head: ["Value", "Snapped", "Moved"], rows: snapped.rows.map((r) => [`${r.value}`, `${r.snapped}`, r.moved === 0 ? "\u2014" : `${r.moved > 0 ? "+" : ""}${r.moved}`]) } : void 0,
        lines: bad.length ? [`${bad.length} value(s) are off-grid. The largest moves ${snapped.worst}px onto the grid.`] : ["Every value is already on the grid \u2014 the scale is internally consistent."],
        basis: `nearest multiple of ${base}px; a grid is a constraint, and the tool reports the movement rather than pretending the values were always aligned`
      };
    }
  }
];

// src/specialists/dev.ts
function parseSemver(input) {
  const m = input.trim().match(/^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/);
  if (!m) return null;
  return {
    major: Number(m[1]),
    minor: Number(m[2]),
    patch: Number(m[3]),
    pre: m[4] ? m[4].split(".") : [],
    raw: input.trim()
  };
}
function compareSemver(a, b) {
  for (const k of ["major", "minor", "patch"]) {
    if (a[k] !== b[k]) return a[k] < b[k] ? -1 : 1;
  }
  if (a.pre.length === 0 && b.pre.length === 0) return 0;
  if (a.pre.length === 0) return 1;
  if (b.pre.length === 0) return -1;
  for (let i = 0; i < Math.max(a.pre.length, b.pre.length); i++) {
    const x = a.pre[i], y = b.pre[i];
    if (x === void 0) return -1;
    if (y === void 0) return 1;
    const nx = /^\d+$/.test(x), ny = /^\d+$/.test(y);
    if (nx && ny) {
      if (Number(x) !== Number(y)) return Number(x) < Number(y) ? -1 : 1;
      continue;
    }
    if (nx !== ny) return nx ? -1 : 1;
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}
function satisfiesRange(version, range) {
  const sets = range.split("||").map((r) => r.trim());
  const expanded = [];
  for (const set of sets) {
    const parts = set.split(/\s+/).filter(Boolean);
    let ok2 = true;
    for (const part of parts) {
      const bounds = boundFor(part.trim());
      expanded.push(`${part} \u2192 ${bounds}`);
      ok2 = ok2 && within(version, part.trim());
    }
    if (ok2) return { ok: true, expanded };
  }
  return { ok: false, expanded };
}
function boundFor(range) {
  if (range.startsWith("^")) {
    const b = parseSemver(range.slice(1));
    if (!b) return "unparseable";
    const upper = b.major > 0 ? `${b.major + 1}.0.0` : b.minor > 0 ? `0.${b.minor + 1}.0` : `0.0.${b.patch + 1}`;
    return `>=${b.major}.${b.minor}.${b.patch} <${upper}`;
  }
  if (range.startsWith("~")) {
    const b = parseSemver(range.slice(1));
    if (!b) return "unparseable";
    return `>=${b.major}.${b.minor}.${b.patch} <${b.major}.${b.minor + 1}.0`;
  }
  return range;
}
function within(v, range) {
  const cmp = (a, b) => compareSemver(a, b);
  if (range === "*" || range === "" || range.toLowerCase() === "latest") return true;
  let m;
  if (m = range.match(/^([\^~]?)(\d+)\.(\d+)\.(\d+)$/)) {
    const b = parseSemver(`${m[2]}.${m[3]}.${m[4]}`);
    if (m[1] === "^") {
      if (v.major !== b.major) return false;
      return b.major > 0 ? true : v.minor === b.minor && cmp(v, b) >= 0;
    }
    if (m[1] === "~") return v.major === b.major && v.minor === b.minor && cmp(v, b) >= 0;
    return cmp(v, b) === 0;
  }
  if (m = range.match(/^(>=|<=|>|<)\s*v?(\d+)\.(\d+)\.(\d+)$/)) {
    const b = parseSemver(`${m[2]}.${m[3]}.${m[4]}`);
    const c = cmp(v, b);
    return m[1] === ">=" ? c >= 0 : m[1] === "<=" ? c <= 0 : m[1] === ">" ? c > 0 : c < 0;
  }
  if ((m = range.match(/^(\d+)\.(\d+)\.[xX*]$/)) || (m = range.match(/^(\d+)\.[xX*]$/))) {
    return v.major === Number(m[1]) && (m.length === 2 || v.minor === Number(m[2]));
  }
  return false;
}
function nextVersion(v, kind) {
  switch (kind) {
    case "major":
      return `${v.major + 1}.0.0`;
    case "minor":
      return `${v.major}.${v.minor + 1}.0`;
    case "patch":
      return `${v.major}.${v.minor}.${v.patch + 1}`;
    case "prerelease": {
      const last = v.pre[v.pre.length - 1];
      const n3 = last && /^\d+$/.test(last) ? Number(last) + 1 : 0;
      const head = last && /^\d+$/.test(last) ? v.pre.slice(0, -1) : v.pre;
      const pre = head.length ? head : ["rc"];
      return `${v.major}.${v.minor}.${v.patch}-${[...pre, n3].join(".")}`;
    }
    case "release":
      return `${v.major}.${v.minor}.${v.patch}`;
  }
}
var COMMIT_TYPES = ["feat", "fix", "docs", "style", "refactor", "perf", "test", "build", "ci", "chore", "revert"];
function lintCommit(message) {
  const lines = message.split(/\r?\n/);
  const subject = (lines[0] ?? "").trim();
  const errors = [], warnings = [];
  const m = subject.match(/^([a-z]+)(?:\(([^)]+)\))?(!)?:\s(.+)$/);
  let type = null, scope = null, breaking = false;
  if (!m) {
    errors.push("subject does not match `type(scope): description` \u2014 no changelog or release tool can parse this");
  } else {
    type = m[1];
    scope = m[2] ?? null;
    breaking = Boolean(m[3]);
    if (!COMMIT_TYPES.includes(type)) errors.push(`type "${type}" is not a conventional type (${COMMIT_TYPES.join(", ")})`);
    const desc = m[4];
    if (desc.length > 72) errors.push(`description is ${desc.length} characters \u2014 72 is the limit most tools truncate at`);
    if (desc.endsWith(".")) warnings.push("the description ends with a full stop; the convention leaves it off");
    if (/^[A-Z]/.test(desc)) warnings.push("the description starts with a capital; the convention is lower case");
    if (desc.split(/\s+/).length < 2) warnings.push("one-word descriptions make an unreadable changelog");
  }
  const body = lines.slice(1);
  if (body.length > 0 && (body[0] ?? "").trim() !== "") {
    errors.push("the second line must be blank \u2014 a body glued to the subject is the classic parse failure");
  }
  if (body.some((l) => /^BREAKING CHANGE:/.test(l))) breaking = true;
  if (breaking && !subject.match(/^[a-z]+(\([^)]+\))?!:/) && !body.some((l) => /^BREAKING CHANGE:/.test(l))) {
    warnings.push("marked breaking without the `!` or a BREAKING CHANGE footer");
  }
  return { subject, type, scope, breaking, errors, warnings };
}
var HTTP = Object.freeze({
  200: { name: "OK", retry: "no", note: "success" },
  201: { name: "Created", retry: "no", note: "the Location header should carry the new resource" },
  202: { name: "Accepted", retry: "no", note: "work queued \u2014 poll the status resource, do not re-POST" },
  204: { name: "No Content", retry: "no", note: "success with an empty body; do not parse it as JSON" },
  301: { name: "Moved Permanently", retry: "no", note: "a client should cache the redirect; API clients should be updated" },
  304: { name: "Not Modified", retry: "no", note: "conditional GET succeeded without a body" },
  400: { name: "Bad Request", retry: "no", note: "the request is malformed \u2014 retrying sends the same malformed request" },
  401: { name: "Unauthorized", retry: "maybe", note: "refresh the credential ONCE, then stop" },
  403: { name: "Forbidden", retry: "no", note: "authenticated but not permitted \u2014 a retry cannot fix it" },
  404: { name: "Not Found", retry: "no", note: "in a retry loop this usually means a wrong identifier" },
  405: { name: "Method Not Allowed", retry: "no", note: "the Allow header names the permitted methods" },
  409: { name: "Conflict", retry: "maybe", note: "a concurrent write lost \u2014 re-read and decide, do not blind-retry" },
  410: { name: "Gone", retry: "no", note: "deliberately absent; stop asking" },
  412: { name: "Precondition Failed", retry: "no", note: "an If-Match/If-Unmodified-Since guard rejected the write" },
  422: { name: "Unprocessable Content", retry: "no", note: "well-formed but semantically rejected \u2014 the body explains why" },
  425: { name: "Too Early", retry: "yes", note: "the server refused a replay \u2014 safe to retry after a delay" },
  429: { name: "Too Many Requests", retry: "yes", note: "honour Retry-After; exponential backoff without it is guesswork" },
  500: { name: "Internal Server Error", retry: "yes", note: "the classic retryable failure" },
  502: { name: "Bad Gateway", retry: "yes", note: "upstream failed \u2014 retry with backoff and a cap" },
  503: { name: "Service Unavailable", retry: "yes", note: "honour Retry-After; this is what load shedding looks like" },
  504: { name: "Gateway Timeout", retry: "yes", note: "the work may have COMPLETED \u2014 only retry an idempotent operation" }
});
function httpSemantics(code) {
  const entry = HTTP[code];
  const klass = code >= 100 && code < 200 ? "informational" : code < 300 ? "success" : code < 400 ? "redirect" : code < 500 ? "client error" : code < 600 ? "server error" : "not a status code";
  if (!entry) {
    return {
      known: false,
      klass,
      retry: "unknown",
      idempotentSafe: "\u2014",
      note: "not a code this engine carries \u2014 treat an unrecognised status as unclassified rather than guessing"
    };
  }
  const idempotentSafe = code < 500 ? "a retry changes nothing only if the request was idempotent (GET/PUT/DELETE/HEAD)" : "retry is safe only for an idempotent request or with an idempotency key";
  return { known: true, klass, retry: entry.retry, idempotentSafe, note: entry.note };
}
function backoffSchedule(attempts, baseMs, factor, capMs, jitterPermille = 0) {
  const out = [];
  let cumulative = 0;
  for (let i = 1; i <= Math.max(1, Math.min(30, attempts)); i++) {
    const raw = Math.min(capMs, baseMs * Math.pow(factor, i - 1));
    const jittered = Math.round(raw * (1 + jitterPermille * (i % 3 - 1) / 1e3));
    const delayMs = Math.max(0, Math.min(capMs, jittered));
    cumulative += delayMs;
    out.push({ attempt: i, delayMs, cumulativeMs: cumulative });
  }
  const human = cumulative < 6e4 ? `${(cumulative / 1e3).toFixed(1)}s` : `${(cumulative / 6e4).toFixed(1)} minutes`;
  return { rows: out, totalMs: cumulative, human };
}
var CRON_FIELDS = [
  { name: "minute", min: 0, max: 59 },
  { name: "hour", min: 0, max: 23 },
  { name: "day-of-month", min: 1, max: 31 },
  { name: "month", min: 1, max: 12 },
  { name: "day-of-week", min: 0, max: 6 }
];
function fieldSet(expr, min, max, name, errors) {
  const set = /* @__PURE__ */ new Set();
  for (const part of expr.split(",")) {
    const stepMatch = part.match(/^(\*|\d+(?:-\d+)?)\/(\d+)$/);
    const base = stepMatch ? stepMatch[1] : part;
    const step = stepMatch ? Number(stepMatch[2]) : 1;
    let from = min, to = max;
    if (base !== "*") {
      const r = base.match(/^(\d+)(?:-(\d+))?$/);
      if (!r) {
        errors.push(`${name}: "${part}" is not a value, range, list or step`);
        return null;
      }
      from = Number(r[1]);
      to = r[2] !== void 0 ? Number(r[2]) : stepMatch ? max : from;
    }
    if (from < min || to > max || from > to) {
      errors.push(`${name}: ${from}-${to} is outside ${min}-${max}`);
      return null;
    }
    if (step < 1) {
      errors.push(`${name}: step must be at least 1`);
      return null;
    }
    for (let i = from; i <= to; i += step) set.add(i);
  }
  return set;
}
function parseCron(expr, fromIso, count = 5) {
  const errors = [];
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) {
    return {
      valid: false,
      fields: [],
      next: [],
      errors: [`${parts.length} fields \u2014 cron takes exactly 5 (minute hour day-of-month month day-of-week); a 6-field expression with seconds is a different dialect`]
    };
  }
  const sets = CRON_FIELDS.map((f2, i) => fieldSet(parts[i], f2.min, f2.max, f2.name, errors));
  if (errors.length > 0 || sets.some((s) => s === null)) return { valid: false, errors, fields: [], next: [] };
  const [min, hr, dom, mon, dow] = sets;
  const start = /* @__PURE__ */ new Date(`${fromIso}T00:00:00Z`);
  if (Number.isNaN(start.getTime())) return { valid: false, errors: [`"${fromIso}" is not an ISO date`], fields: [], next: [] };
  const next = [];
  const cursor = new Date(start.getTime());
  cursor.setUTCMinutes(cursor.getUTCMinutes() + 1);
  const limit = 366 * 24 * 60;
  for (let i = 0; i < limit && next.length < count; i++) {
    const dayRestricted = parts[2].trim() !== "*";
    const dowRestricted = parts[4].trim() !== "*";
    const dayMatch = dayRestricted && dowRestricted ? dom.has(cursor.getUTCDate()) || dow.has(cursor.getUTCDay()) : dom.has(cursor.getUTCDate()) && dow.has(cursor.getUTCDay());
    if (min.has(cursor.getUTCMinutes()) && hr.has(cursor.getUTCHours()) && mon.has(cursor.getUTCMonth() + 1) && dayMatch) {
      next.push(cursor.toISOString().slice(0, 16).replace("T", " "));
    }
    cursor.setUTCMinutes(cursor.getUTCMinutes() + 1);
  }
  return { valid: true, errors: [], fields: parts, next };
}
var DEV_TOOLS = [
  {
    id: "semver",
    domain: "dev",
    label: "SemVer",
    blurb: "Compare two versions, expand a range into the bounds it really means, bump correctly.",
    fields: [
      text("version", "Version", "1.4.2-rc.3"),
      text("range", "Range to test", "^1.2.0", "exact \xB7 ^ \xB7 ~ \xB7 >= \xB7 x-range \xB7 hyphen \xB7 || unions"),
      sel("bump", "If bumping", ["patch", "minor", "major", "prerelease", "release"], "patch")
    ],
    run: (v) => {
      const ver = parseSemver(str(v, "version"));
      if (!ver) return {
        headline: "That is not a semantic version this engine accepts",
        ok: false,
        basis: "expected MAJOR.MINOR.PATCH with optional -prerelease and +build, an optional leading v"
      };
      const range = str(v, "range");
      const sat = satisfiesRange(ver, range);
      const bumpKind = str(v, "bump");
      return {
        headline: `${ver.raw} ${sat.ok ? "satisfies" : "does NOT satisfy"} ${range}`,
        ok: sat.ok,
        kpis: [
          { value: `${ver.major}.${ver.minor}.${ver.patch}`, label: "core" },
          { value: ver.pre.length ? ver.pre.join(".") : "\u2014", label: "prerelease" },
          { value: nextVersion(ver, bumpKind), label: `bump ${bumpKind}` }
        ],
        table: sat.expanded.length ? { head: ["Term", "Expands to"], rows: sat.expanded.map((e) => {
          const [term, bounds] = e.split(" \u2192 ");
          return [term ?? "", bounds ?? ""];
        }) } : void 0,
        lines: [
          sat.ok ? "The version is inside the declared range." : "The version is outside the range \u2014 check whether the range or the version is the stale one.",
          ver.pre.length ? "A prerelease sorts BELOW its own release: 1.4.2-rc.3 < 1.4.2. Caret and tilde ranges do not admit prereleases unless the range itself names one." : "No prerelease, so ordinary precedence applies."
        ],
        basis: "SemVer 2.0.0 precedence; ranges expanded to explicit bounds so the answer is checkable rather than asserted"
      };
    }
  },
  {
    id: "commit",
    domain: "dev",
    label: "Commit lint",
    blurb: "Lints a commit message the way the changelog generator will read it.",
    fields: [area("msg", "Message", "feat(auth): add device-bound session keys\n\nSessions are now bound to a device key at issue time.", "the whole message, subject and body")],
    run: (v) => {
      const msg = str(v, "msg");
      if (!msg.trim()) return { headline: "Nothing to lint", ok: false, basis: "paste a full commit message, including the body" };
      const l = lintCommit(msg);
      return {
        headline: l.errors.length === 0 ? `Clean \u2014 ${l.type}${l.scope ? `(${l.scope})` : ""}` : `${l.errors.length} error(s)`,
        ok: l.errors.length === 0,
        kpis: [
          { value: l.type ?? "\u2014", label: "type" },
          { value: l.scope ?? "\u2014", label: "scope" },
          { value: l.breaking ? "yes" : "no", label: "breaking" },
          { value: `${l.subject.length}`, label: "subject chars" }
        ],
        lines: [...l.errors.map((e) => `ERROR \u2014 ${e}`), ...l.warnings.map((w) => `warning \u2014 ${w}`)],
        basis: "Conventional Commits 1.0.0: `type(scope): description`, a blank second line, and a BREAKING CHANGE footer or `!` for a breaking change"
      };
    }
  },
  {
    id: "http",
    domain: "dev",
    label: "HTTP status",
    blurb: "What a status code means for a retry loop \u2014 and whether retrying is safe at all.",
    fields: [num("code", "Status code", "429")],
    run: (v) => {
      const code = Math.round(number(v, "code", 429));
      const s = httpSemantics(code);
      return {
        headline: `${code} ${s.known ? "" : "(unclassified)"} \u2014 retry: ${s.retry}`,
        ok: s.known && s.retry !== "no",
        kpis: [
          { value: s.klass, label: "class" },
          { value: s.retry, label: "retry?" }
        ],
        lines: [s.note, `Idempotence \u2014 ${s.idempotentSafe}`],
        basis: "HTTP semantics (RFC 9110) plus the retry conventions that follow from them; 504 is the one that looks like a failure and may not be one"
      };
    }
  },
  {
    id: "backoff",
    domain: "dev",
    label: "Retry ladder",
    blurb: "The schedule a retry loop actually produces, and how long it takes to give up.",
    fields: [
      num("attempts", "Attempts", "6"),
      num("base", "Base delay (ms)", "200"),
      num("factor", "Factor", "2"),
      num("cap", "Cap (ms)", "30000"),
      num("jitter", "Jitter (\xB1\u2030)", "0", "a fixed permille, so the schedule is reproducible")
    ],
    run: (v) => {
      const s = backoffSchedule(
        Math.round(number(v, "attempts", 6)),
        number(v, "base", 200),
        number(v, "factor", 2) || 2,
        number(v, "cap", 3e4),
        Math.round(number(v, "jitter", 0))
      );
      const last = s.rows[s.rows.length - 1];
      return {
        headline: `${s.rows.length} attempts, ${s.human} before the last one is sent`,
        ok: true,
        kpis: [
          { value: s.human, label: "total elapsed" },
          { value: `${last?.delayMs ?? 0}ms`, label: "final delay" },
          { value: s.rows.some((r) => r.delayMs === Math.round(number(v, "cap", 3e4))) ? "capped" : "uncapped", label: "cap" }
        ],
        table: { head: ["Attempt", "Delay (ms)", "Cumulative (ms)"], rows: s.rows.map((r) => [`${r.attempt}`, `${r.delayMs}`, `${r.cumulativeMs}`]) },
        lines: ["A ladder that exceeds the caller's own timeout is a ladder nobody finishes climbing \u2014 compare the total above with the timeout on the client."],
        basis: "exponential backoff with a cap; jitter is shown as a fixed permille so the schedule is reproducible and pinnable \u2014 real jitter is applied at runtime on top of this shape"
      };
    }
  },
  {
    id: "cron",
    domain: "dev",
    label: "Cron",
    blurb: "Validates a 5-field cron expression and shows the next runs \u2014 including the day-field oddity.",
    fields: [
      text("expr", "Expression", "0 3 * * 1"),
      text("from", "From (ISO date)", "2026-09-22"),
      num("count", "Runs to show", "5")
    ],
    run: (v) => {
      const r = parseCron(str(v, "expr"), str(v, "from"), Math.max(1, Math.min(20, Math.round(number(v, "count", 5)))));
      if (!r.valid) {
        return {
          headline: "Invalid expression",
          ok: false,
          lines: r.errors,
          basis: "5 fields: minute hour day-of-month month day-of-week (0 = Sunday)"
        };
      }
      return {
        headline: `Next ${r.next.length} run(s)`,
        ok: true,
        kpis: [
          { value: r.fields[0] ?? "", label: "minute" },
          { value: r.fields[1] ?? "", label: "hour" },
          { value: `${r.fields[2]} ${r.fields[3]} ${r.fields[4]}`, label: "dom \xB7 month \xB7 dow" }
        ],
        lines: r.next.map((n3) => `\xB7 ${n3} UTC`),
        code: r.next.join("\n"),
        basis: "standard 5-field cron interpreted in UTC; when BOTH day-of-month and day-of-week are restricted the job runs when EITHER matches \u2014 the rule that silently breaks weekly jobs"
      };
    }
  }
];

// src/specialists/api.ts
function tokenBucketPlan(ratePerMinute, burst, perSecond, seconds) {
  const refill = ratePerMinute / 60;
  let tokens = burst;
  const steps = [];
  let admitted = 0, rejected = 0, firstRejection = null;
  for (let s = 1; s <= seconds; s++) {
    tokens = Math.min(burst, tokens + refill);
    const take = Math.min(perSecond, Math.floor(tokens));
    if (take < perSecond && firstRejection === null) firstRejection = s;
    admitted += take;
    rejected += perSecond - take;
    tokens -= take;
    steps.push({ second: s, tokens: Math.round(tokens * 1e3) / 1e3, admitted: take, rejected: perSecond - take });
  }
  return {
    steps,
    admitted,
    rejected,
    firstRejection,
    steadyState: Math.min(perSecond, Math.floor(refill))
  };
}
function payloadBudget(json) {
  const trimmed = json.trim();
  if (!trimmed) return { ok: false, error: "nothing to measure", totalBytes: 0, fields: [], largest: null };
  let parsed;
  try {
    parsed = JSON.parse(trimmed);
  } catch (e) {
    return { ok: false, error: `not valid JSON \u2014 ${String(e)}`, totalBytes: new TextEncoder().encode(trimmed).length, fields: [], largest: null };
  }
  const totalBytes = new TextEncoder().encode(trimmed).length;
  const rows2 = [];
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    for (const [k, val] of Object.entries(parsed)) {
      const size2 = new TextEncoder().encode(`${JSON.stringify(k)}:${JSON.stringify(val)}`).length;
      rows2.push({ field: k, bytes: size2, share: totalBytes ? size2 / totalBytes * 100 : 0 });
    }
  } else if (Array.isArray(parsed)) {
    const first = parsed[0];
    rows2.push({ field: "(array)", bytes: totalBytes, share: 100 });
    if (first && typeof first === "object" && !Array.isArray(first)) {
      for (const k of Object.keys(first)) {
        const size2 = new TextEncoder().encode(JSON.stringify(k)).length + 2;
        rows2.push({ field: `(item).${k}`, bytes: size2, share: 0 });
      }
    }
  } else {
    rows2.push({ field: "(scalar)", bytes: totalBytes, share: 100 });
  }
  rows2.sort((a, b) => b.bytes - a.bytes);
  return { ok: true, totalBytes, fields: rows2, largest: rows2[0] ?? null };
}
function stringEntropyBits(s) {
  if (!s) return 0;
  const counts = /* @__PURE__ */ new Map();
  for (const ch of s) counts.set(ch, (counts.get(ch) ?? 0) + 1);
  let bitsPerChar = 0;
  for (const n3 of counts.values()) {
    const p = n3 / s.length;
    bitsPerChar -= p * Math.log2(p);
  }
  return bitsPerChar * s.length;
}
function checkIdempotencyKey(key2) {
  const issues = [];
  const k = key2.trim();
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(k);
  const isHex = /^[0-9a-f]{16,}$/i.test(k);
  const isB64 = /^[A-Za-z0-9_-]{22,}$/.test(k);
  const charset = isUuid ? "uuid" : isHex ? "hex" : isB64 ? "base64url" : "other";
  const entropyBits = Math.round(stringEntropyBits(k));
  if (k.length < 16) issues.push(`${k.length} characters \u2014 too short to be collision-resistant; 128 bits of randomness is the usual floor`);
  if (charset === "other") issues.push("unusual character set \u2014 prefer a UUIDv4 or 16+ random bytes in hex/base64url");
  if (/^(test|dev|dummy|123|abc)/i.test(k)) issues.push("looks sequential or human-authored; an idempotency key must not be guessable");
  if (entropyBits < 96) issues.push(`~${entropyBits} bits measured from its own character distribution \u2014 below the 96\u2013128 bit range a real random key lands in`);
  return { ok: issues.length === 0, length: k.length, charset, entropyBits, issues };
}
function paginationPlan(total, pageSize, offset = 0, deepOffsetLimit = 1e4) {
  if (pageSize <= 0) return { pages: 0, lastPageSize: 0, currentPage: 0, deep: false, lines: ["page size must be at least 1"] };
  const pages = Math.ceil(total / pageSize);
  const lastPageSize = total % pageSize === 0 ? pageSize : total % pageSize;
  const currentPage = Math.floor(offset / pageSize) + 1;
  const deep = offset > deepOffsetLimit;
  return {
    pages,
    lastPageSize,
    currentPage,
    deep,
    lines: [
      `${total} rows at ${pageSize}/page = ${pages} pages; the last page carries ${total === 0 ? 0 : lastPageSize}.`,
      deep ? `Offset ${offset} is deep paging: the database still walks ${offset} rows to discard them. Prefer a keyset cursor (WHERE id > :last_id ORDER BY id LIMIT :n) \u2014 it is O(page size) instead of O(offset).` : `Offset paging is fine at this depth (${offset} rows skipped).`,
      `A cursor is also stable under writes; an offset is not \u2014 rows inserted while paging shift every later page.`
    ]
  };
}
var API_TOOLS = [
  {
    id: "rate-limit",
    domain: "api",
    label: "Rate limit",
    blurb: "Simulates a token bucket against a client's demand and shows the first 429.",
    fields: [
      num("rate", "Limit (requests / minute)", "600"),
      num("burst", "Burst allowance", "20"),
      num("demand", "Client demand (requests / second)", "15"),
      num("seconds", "Seconds to simulate", "30")
    ],
    run: (v) => {
      const rate = number(v, "rate", 600), burst = number(v, "burst", 20);
      const demand = Math.max(0, Math.round(number(v, "demand", 15)));
      const seconds = Math.max(1, Math.min(600, Math.round(number(v, "seconds", 30))));
      const plan = tokenBucketPlan(rate, burst, demand, seconds);
      const sustainable = plan.steadyState;
      const oversubscribed = demand > sustainable;
      return {
        headline: oversubscribed ? `Oversubscribed \u2014 ${demand}/s demanded against a sustainable ${sustainable}/s` : `Sustainable \u2014 ${demand}/s fits inside ${sustainable}/s`,
        ok: !oversubscribed,
        kpis: [
          { value: `${sustainable}/s`, label: "sustainable rate" },
          { value: plan.firstRejection === null ? "never" : `${plan.firstRejection}s`, label: "first rejection" },
          { value: `${plan.admitted}`, label: "admitted" },
          { value: `${plan.rejected}`, label: "rejected" }
        ],
        table: {
          head: ["Second", "Tokens", "Admitted", "Rejected"],
          rows: plan.steps.slice(0, 12).map((s) => [`${s.second}`, `${s.tokens}`, `${s.admitted}`, `${s.rejected}`])
        },
        lines: [
          oversubscribed ? `The burst absorbs the first ${plan.firstRejection ?? 0} second(s) and then the limit bites. A client that retries immediately on 429 makes this worse \u2014 honour Retry-After, or size the client below ${sustainable}/s.` : "Demand fits: the bucket refills faster than the client drains it, so a burst is absorbed and the steady state is never breached.",
          `Refill is ${(rate / 60).toFixed(2)} tokens/second \u2014 a limit expressed per minute is a per-SECOND refill, which is why the smoothing surprises people.`
        ],
        basis: "token bucket: capacity = burst, refill = limit/60 per second, whole requests only; deterministic simulation \u2014 no wall clock and no randomness, so a limit is reproducible and arguable"
      };
    }
  },
  {
    id: "payload",
    domain: "api",
    label: "Payload budget",
    blurb: "Measures a JSON response field by field and names what is making it big.",
    fields: [area("json", "JSON", '{"id":"acct_9f2","name":"Acme Industries","orders":[{"id":1},{"id":2}],"internal_notes":"a very long note that the client will never render but pays to download"}', "paste a response body")],
    run: (v) => {
      const b = payloadBudget(str(v, "json"));
      if (!b.ok) return { headline: "Could not measure that", ok: false, lines: b.error ? [b.error] : [], basis: "the payload must be valid JSON to be measured" };
      return {
        headline: `${b.totalBytes.toLocaleString()} bytes across ${b.fields.length} field(s)`,
        ok: b.totalBytes < 1e5,
        kpis: [
          { value: `${b.totalBytes.toLocaleString()} B`, label: "total" },
          { value: b.largest ? `${b.largest.share.toFixed(0)}%` : "\u2014", label: "largest share" },
          { value: b.largest?.field ?? "\u2014", label: "largest field" }
        ],
        table: { head: ["Field", "Bytes", "Share"], rows: b.fields.slice(0, 12).map((f2) => [f2.field, `${f2.bytes}`, `${f2.share.toFixed(1)}%`]) },
        lines: [
          b.largest && b.largest.share > 40 ? `"${b.largest.field}" is ${b.largest.share.toFixed(0)}% of the response \u2014 a list endpoint that most clients ignore is the usual cause.` : "No single field dominates; the size is spread across the shape itself.",
          "Compression is NOT estimated here: the ratio depends on the data and the encoder, and a guessed ratio is the kind of number that looks precise and gets quoted in a design doc."
        ],
        basis: "UTF-8 byte length as the wire sees it, measured per top-level field (key + value); gzip is deliberately not estimated"
      };
    }
  },
  {
    id: "idempotency",
    domain: "api",
    label: "Idempotency key",
    blurb: "Checks a key the way a payment API will, and states the entropy it actually carries.",
    fields: [
      text("key", "Key", "3f8a1c9b-6d2e-4f71-9a55-2c7e8b0d4e13"),
      num("ttl", "Retention (hours)", "24", "how long the server must remember the key")
    ],
    run: (v) => {
      const c = checkIdempotencyKey(str(v, "key"));
      const ttl = number(v, "ttl", 24);
      return {
        headline: c.ok ? `Usable \u2014 ${c.charset}, ~${c.entropyBits} bits` : `${c.issues.length} issue(s)`,
        ok: c.ok,
        kpis: [
          { value: c.charset, label: "shape" },
          { value: `${c.length}`, label: "characters" },
          { value: `~${c.entropyBits}`, label: "bits (measured)" },
          { value: `${ttl}h`, label: "retention asked" }
        ],
        lines: [
          ...c.issues,
          `Retention is the other half of the contract: a key remembered for ${ttl} hour(s) means a retry after that window is a NEW charge. The client's retry budget and the server's retention must agree \u2014 that gap is how a duplicate payment happens with an idempotency key in place.`,
          "The measured bits come from the string's own character distribution. A key that LOOKS random but was typed by a human measures low, which is exactly what you want to catch."
        ],
        basis: "Shannon entropy over the key's characters as a floor on guessability (not a guarantee of randomness), plus the shape rules payment APIs enforce"
      };
    }
  },
  {
    id: "paging",
    domain: "api",
    label: "Pagination",
    blurb: "Pages, last-page size and whether the offset is deep enough to hurt.",
    fields: [
      num("total", "Total rows", "250000"),
      num("size", "Page size", "100"),
      num("offset", "Offset used", "25000"),
      num("limit", "Deep-offset warning above", "10000")
    ],
    run: (v) => {
      const p = paginationPlan(
        Math.round(number(v, "total", 25e4)),
        Math.round(number(v, "size", 100)),
        Math.round(number(v, "offset", 25e3)),
        Math.round(number(v, "limit", 1e4))
      );
      return {
        headline: p.deep ? `Deep paging at offset ${number(v, "offset", 25e3)}` : `${p.pages.toLocaleString()} pages`,
        ok: !p.deep,
        kpis: [
          { value: p.pages.toLocaleString(), label: "pages" },
          { value: `${p.lastPageSize}`, label: "last page rows" },
          { value: `#${p.currentPage.toLocaleString()}`, label: "page at this offset" }
        ],
        lines: p.lines,
        basis: "offset paging arithmetic; keyset paging is recommended above the configured depth because an offset scan is O(offset) while a cursor is O(page size)"
      };
    }
  }
];

// src/specialists/data.ts
function percentile(sorted, p) {
  if (sorted.length === 0) return NaN;
  if (sorted.length === 1) return sorted[0];
  const rank = p / 100 * (sorted.length - 1);
  const lo = Math.floor(rank), hi = Math.ceil(rank);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (rank - lo) * (sorted[hi] - sorted[lo]);
}
function percentiles(values, ps) {
  const sorted = [...values].sort((a, b) => a - b);
  return ps.map((p) => ({ p, value: percentile(sorted, p) }));
}
function mean(values) {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : NaN;
}
function stddev(values, sample = true) {
  if (values.length < 2) return 0;
  const m = mean(values);
  const ss2 = values.reduce((a, b) => a + (b - m) ** 2, 0);
  return Math.sqrt(ss2 / (values.length - (sample ? 1 : 0)));
}
function outliersIqr(values, k = 1.5) {
  const sorted = [...values].sort((a, b) => a - b);
  const q1 = percentile(sorted, 25), q3 = percentile(sorted, 75);
  const iqr = q3 - q1;
  const lowerFence = q1 - k * iqr, upperFence = q3 + k * iqr;
  const outliers = sorted.filter((v) => v < lowerFence || v > upperFence);
  const whys = [];
  if (values.length < 8) whys.push(`${values.length} points is a small sample for a quartile rule \u2014 the fences move a lot below about twenty.`);
  if (iqr === 0) whys.push("the middle half of the data is identical, so the fence collapses onto the median and everything else becomes an 'outlier' \u2014 the rule is degenerate on this data.");
  return { sorted, q1, q3, iqr, lowerFence, upperFence, outliers, whys };
}
function erf(x) {
  const sign = x < 0 ? -1 : 1;
  const z = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * z);
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-z * z);
  return sign * y;
}
function normalTwoSidedP(z) {
  return Math.max(0, Math.min(1, 2 * (1 - 0.5 * (1 + erf(Math.abs(z) / Math.SQRT2)))));
}
function abTest(trialsA, convA, trialsB, convB) {
  const pA = trialsA > 0 ? convA / trialsA : 0;
  const pB = trialsB > 0 ? convB / trialsB : 0;
  const pooled = trialsA + trialsB > 0 ? (convA + convB) / (trialsA + trialsB) : 0;
  const se = Math.sqrt(pooled * (1 - pooled) * (1 / Math.max(1, trialsA) + 1 / Math.max(1, trialsB)));
  const z = se > 0 ? (pB - pA) / se : 0;
  const p = normalTwoSidedP(z);
  const seDiff = Math.sqrt(pA * (1 - pA) / Math.max(1, trialsA) + pB * (1 - pB) / Math.max(1, trialsB));
  const diff = pB - pA;
  const guardrails = [];
  if (Math.min(trialsA, trialsB) < 100) guardrails.push("fewer than 100 trials in one arm \u2014 the normal approximation is unreliable at this size.");
  const successes = Math.min(convA, convB, trialsA - convA, trialsB - convB);
  if (successes < 10) guardrails.push("fewer than ten conversions or non-conversions in an arm \u2014 use an exact test instead of this one.");
  guardrails.push("peeking at a running test inflates the false-positive rate; the p-value is only valid for a sample size fixed in advance.");
  return {
    rateA: pA * 100,
    rateB: pB * 100,
    liftPct: pA > 0 ? diff / pA * 100 : 0,
    z,
    p,
    significant95: p < 0.05,
    significant99: p < 0.01,
    ciLowPct: (diff - 1.96 * seDiff) * 100,
    ciHighPct: (diff + 1.96 * seDiff) * 100,
    verdict: p < 0.05 ? `a difference this large is unlikely under the null (p = ${p.toFixed(4)})` : `no detectable difference at 95% (p = ${p.toFixed(4)}) \u2014 that is NOT evidence the two are equal`,
    guardrails
  };
}
function sampleSize(baselinePct, mdeRelativePct, power2 = 0.8, alpha = 0.05) {
  const p1 = baselinePct / 100;
  const p2 = p1 * (1 + mdeRelativePct / 100);
  const pBar = (p1 + p2) / 2;
  const zA = alpha === 0.01 ? 2.576 : alpha === 0.1 ? 1.645 : 1.96;
  const zB = power2 === 0.9 ? 1.282 : power2 === 0.95 ? 1.645 : 0.842;
  const delta = Math.abs(p2 - p1);
  if (delta === 0 || pBar <= 0 || pBar >= 1) return NaN;
  return Math.ceil(
    Math.pow(zA * Math.sqrt(2 * pBar * (1 - pBar)) + zB * Math.sqrt(p1 * (1 - p1) + p2 * (1 - p2)), 2) / Math.pow(delta, 2)
  );
}
var DATA_TOOLS = [
  {
    id: "percentiles",
    domain: "data",
    label: "Percentiles",
    blurb: "p50 / p90 / p95 / p99 from a series, with the method stated \u2014 including how few points you have.",
    fields: [area("values", "Values", "12, 18, 22, 25, 27, 31, 33, 35, 38, 41, 44, 52, 61, 88, 240", "one per line, or comma separated")],
    run: (v) => {
      const values = series(v, "values");
      if (values.length === 0) return { headline: "No numbers in that", ok: false, basis: "one value per line, or comma separated" };
      const ps = percentiles(values, [50, 90, 95, 99]);
      const m = mean(values), sd = stddev(values);
      const small2 = values.length < 20;
      return {
        headline: `${values.length} points \xB7 median ${Math.round(m)} \xB7 max ${Math.max(...values)}`,
        ok: !small2,
        kpis: [
          { value: `${values.length}`, label: "points" },
          { value: m.toFixed(1), label: "mean" },
          { value: sd.toFixed(1), label: "std dev" },
          { value: `${Math.min(...values)}\u2013${Math.max(...values)}`, label: "range" }
        ],
        table: { head: ["Percentile", "Value"], rows: ps.map((x) => [`p${x.p}`, x.value.toFixed(1)]) },
        lines: [
          small2 ? `${values.length} points cannot support a p99: the top percentile of 15 samples is the maximum, not a percentile. Above p90 a small sample is decoration.` : "The sample is large enough for the percentiles above p90 to mean something.",
          `Mean ${m.toFixed(1)} vs median ${percentile([...values].sort((a, b) => a - b), 50).toFixed(1)} \u2014 the gap is how much the tail is dragging the average. A latency SLO written as a mean is a SLO that hides the users who left.`
        ],
        basis: "linear interpolation between order statistics (the R-7 / NumPy default); stating the method matters because p95 differs between conventions"
      };
    }
  },
  {
    id: "outliers",
    domain: "data",
    label: "Outliers",
    blurb: "IQR fences, the points outside them, and when the rule is meaningless.",
    fields: [
      area("values", "Values", "10, 11, 12, 12, 13, 13, 14, 15, 16, 17, 18, 120", "one per line or comma separated"),
      num("k", "Fence multiplier (k)", "1.5", "1.5 is the usual rule; 3 is 'far out'")
    ],
    run: (v) => {
      const values = series(v, "values");
      if (values.length === 0) return { headline: "No numbers in that", ok: false, basis: "one value per line, or comma separated" };
      const r = outliersIqr(values, number(v, "k", 1.5));
      return {
        headline: r.outliers.length ? `${r.outliers.length} point(s) outside the fences` : "Nothing outside the fences",
        ok: r.outliers.length === 0,
        kpis: [
          { value: r.q1.toFixed(1), label: "Q1" },
          { value: r.q3.toFixed(1), label: "Q3" },
          { value: r.iqr.toFixed(1), label: "IQR" },
          { value: `${r.lowerFence.toFixed(1)} \u2026 ${r.upperFence.toFixed(1)}`, label: "fences" }
        ],
        lines: [
          r.outliers.length ? `Outside: ${r.outliers.join(", ")}. An outlier is a question, not a verdict \u2014 the next step is to look at what those rows have in common, not to delete them.` : "Every point sits inside the fences.",
          ...r.whys
        ],
        basis: `Tukey's fences: outside Q1 \u2212 ${number(v, "k", 1.5)}\xB7IQR and Q3 + ${number(v, "k", 1.5)}\xB7IQR; quartiles by linear interpolation`
      };
    }
  },
  {
    id: "ab-test",
    domain: "data",
    label: "A/B test",
    blurb: "Two-proportion test with the lift, the interval, and the peeking warning.",
    fields: [
      num("trialsA", "Control trials", "5000"),
      num("convA", "Control conversions", "400"),
      num("trialsB", "Variant trials", "5000"),
      num("convB", "Variant conversions", "452")
    ],
    run: (v) => {
      const r = abTest(
        Math.round(number(v, "trialsA", 5e3)),
        Math.round(number(v, "convA", 400)),
        Math.round(number(v, "trialsB", 5e3)),
        Math.round(number(v, "convB", 452))
      );
      return {
        headline: r.significant95 ? `Significant \u2014 ${r.liftPct >= 0 ? "+" : ""}${r.liftPct.toFixed(1)}% relative lift` : `Not significant \u2014 ${r.liftPct >= 0 ? "+" : ""}${r.liftPct.toFixed(1)}% relative lift`,
        ok: r.significant95,
        kpis: [
          { value: `${r.rateA.toFixed(2)}%`, label: "control rate" },
          { value: `${r.rateB.toFixed(2)}%`, label: "variant rate" },
          { value: `${r.liftPct >= 0 ? "+" : ""}${r.liftPct.toFixed(1)}%`, label: "relative lift" },
          { value: `${r.ciLowPct >= 0 ? "+" : ""}${r.ciLowPct.toFixed(2)}% \u2026 ${r.ciHighPct >= 0 ? "+" : ""}${r.ciHighPct.toFixed(2)}%`, label: "95% interval" }
        ],
        lines: [
          r.verdict,
          `Absolute difference ${(r.rateB - r.rateA).toFixed(3)} percentage points \xB7 z = ${r.z.toFixed(3)} \xB7 p = ${r.p.toFixed(4)} (two-sided).`,
          ...r.guardrails
        ],
        basis: "two-proportion z-test on the pooled proportion; 95% interval is the Wald interval on the difference. The normal CDF is the Abramowitz & Stegun 7.1.26 approximation (error \u2248 1.5e-7)"
      };
    }
  },
  {
    id: "sample-size",
    domain: "data",
    label: "Sample size",
    blurb: "How many trials a test needs before it starts \u2014 the question usually asked too late.",
    fields: [
      num("baseline", "Baseline rate (%)", "8"),
      num("mde", "Minimum detectable effect (%)", "10", "relative to the baseline"),
      sel("power", "Power", ["0.8", "0.9", "0.95"], "0.8"),
      sel("alpha", "Alpha", ["0.05", "0.01", "0.1"], "0.05")
    ],
    run: (v) => {
      const n3 = sampleSize(number(v, "baseline", 8), number(v, "mde", 10), Number(str2(v, "power")) || 0.8, Number(str2(v, "alpha")) || 0.05);
      if (!Number.isFinite(n3)) return {
        headline: "That combination has no finite sample size",
        ok: false,
        basis: "a zero effect or a rate at 0/100% cannot be sized \u2014 check the inputs"
      };
      const perDay = number(v, "baseline", 8) > 0 ? null : null;
      return {
        headline: `${n3.toLocaleString()} trials per arm`,
        ok: true,
        kpis: [
          { value: n3.toLocaleString(), label: "per arm" },
          { value: (n3 * 2).toLocaleString(), label: "total" },
          { value: `${number(v, "baseline", 8)}% \u2192 ${(number(v, "baseline", 8) * (1 + number(v, "mde", 10) / 100)).toFixed(2)}%`, label: "detecting" }
        ],
        lines: [
          `Detecting a ${number(v, "mde", 10)}% relative change on an ${number(v, "baseline", 8)}% baseline needs ${n3.toLocaleString()} per arm at ${(Number(str2(v, "power")) || 0.8) * 100}% power.`,
          "Sample size is a function of the effect you are trying to detect, not of the traffic you happen to have \u2014 if the traffic cannot reach this number in a sensible time, the honest move is to test a bigger change, not a smaller sample.",
          perDay ? "" : "Halving the effect roughly QUADRUPLES the sample: the relationship is inverse-square."
        ].filter(Boolean),
        basis: "two-proportion formula with a pooled variance term and the normal quantiles for the chosen alpha and power (no continuity correction)"
      };
    }
  }
];
function str2(v, key2) {
  const x = v[key2];
  return typeof x === "string" ? x : typeof x === "boolean" ? String(x) : "";
}

// src/specialists/security.ts
var PATTERNS = [
  { name: "AWS access key id", re: /\bAKIA[0-9A-Z]{16}\b/g, note: "AKIA-prefixed; rotate and check CloudTrail for use" },
  { name: "GitHub token", re: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/g, note: "GitHub PAT \u2014 revoke first, then rewrite history" },
  { name: "Slack token", re: /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/g, note: "Slack app/bot token" },
  { name: "Private key block", re: /-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/g, note: "an actual private key in the file \u2014 treat the key as compromised" },
  { name: "JSON Web Token", re: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}\b/g, note: "a signed token; it is bearer authority until it expires" },
  { name: "Stripe secret key", re: /\bsk_(?:live|test)_[A-Za-z0-9]{16,}\b/g, note: "Stripe secret key \u2014 live keys can move money" },
  { name: "Google API key", re: /\bAIza[0-9A-Za-z_-]{35}\b/g, note: "Google API key; check its referrer/IP restrictions" },
  { name: "Connection string", re: /\b(?:postgres|postgresql|mysql|mongodb(?:\+srv)?|redis|amqp):\/\/[^\s:@/]+:[^\s@/]+@/gi, note: "embeds a password in a URL \u2014 the password is in every log line that prints this string" },
  { name: "Assigned secret", re: /\b(?:api[_-]?key|secret|passwd|password|token|client[_-]?secret)\b\s*[:=]\s*["']?([A-Za-z0-9_\-./+]{16,})["']?/gi, note: "generic assignment \u2014 HIGH false-positive rate by nature; treat as a prompt to look, not a finding" }
];
function maskSecret(s) {
  if (s.length <= 8) return "\u2022".repeat(s.length);
  return `${s.slice(0, 4)}${"\u2022".repeat(Math.max(4, Math.min(24, s.length - 8)))}${s.slice(-4)}`;
}
function scanSecrets(text2) {
  const hits2 = [];
  for (const p of PATTERNS) {
    const re = new RegExp(p.re.source, p.re.flags.includes("g") ? p.re.flags : `${p.re.flags}g`);
    const found = [];
    let m;
    while ((m = re.exec(text2)) !== null) {
      found.push(m[1] ?? m[0]);
      if (found.length >= 50) break;
    }
    if (found.length > 0) {
      hits2.push({ name: p.name, count: found.length, samples: [...new Set(found)].slice(0, 3).map(maskSecret), note: p.note });
    }
  }
  return hits2;
}
function b64urlDecode(part) {
  const pad = part.length % 4 === 0 ? "" : "=".repeat(4 - part.length % 4);
  const b64 = part.replace(/-/g, "+").replace(/_/g, "/") + pad;
  const g = globalThis;
  if (!g.atob || !g.TextDecoder) throw new Error("no base64 decoder available in this runtime");
  const binary = g.atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new g.TextDecoder("utf-8").decode(bytes);
}
function jwtInspect(token, nowIso) {
  const parts = token.trim().split(".");
  if (parts.length !== 3) return { ok: false, error: `${parts.length} segments \u2014 a JWS has 3 (header.payload.signature)`, lines: [] };
  try {
    const header = JSON.parse(b64urlDecode(parts[0]));
    const payload = JSON.parse(b64urlDecode(parts[1]));
    const algorithm = String(header.alg ?? "(none declared)");
    const lines = [];
    let expired = null;
    let expiresIn;
    const now = Math.floor((/* @__PURE__ */ new Date(`${nowIso}T00:00:00Z`)).getTime() / 1e3);
    const exp2 = typeof payload.exp === "number" ? payload.exp : void 0;
    if (exp2 !== void 0) {
      expired = exp2 <= now;
      const secs = exp2 - now;
      expiresIn = expired ? `expired ${Math.abs(Math.round(secs / 3600))} h ago` : `${(secs / 3600).toFixed(1)} h remaining`;
      lines.push(`exp is ${new Date(exp2 * 1e3).toISOString()} \u2014 ${expiresIn}.`);
    } else {
      lines.push("No exp claim: this token never expires on its own. That is a finding, not a detail.");
    }
    if (algorithm === "none") lines.push('alg is "none" \u2014 the token carries NO signature. Anything that accepts it is accepting unsigned authority.');
    if (typeof payload.aud !== "undefined") lines.push(`aud: ${JSON.stringify(payload.aud)} \u2014 check the token was minted FOR this service.`);
    lines.push("The signature was NOT verified and the payload was NOT trusted: this decodes what anyone holding the token can read. Verification needs the key, which this engine deliberately does not hold.");
    return { ok: true, header, payload, algorithm, ...expiresIn ? { expiresIn } : {}, expired, lines };
  } catch (e) {
    return { ok: false, error: `could not decode \u2014 ${String(e)}`, lines: [] };
  }
}
function cspAudit(header, hasNonce = false) {
  const directives = [];
  const findings = [];
  const map = /* @__PURE__ */ new Map();
  for (const clause2 of header.split(";")) {
    const t = clause2.trim();
    if (!t) continue;
    const [name, ...values] = t.split(/\s+/);
    if (!name) continue;
    const key2 = name.toLowerCase();
    directives.push(key2);
    map.set(key2, values);
  }
  const src = (k) => map.get(k) ?? [];
  const allSources = [...map.values()].flat();
  if (!map.has("default-src")) findings.push({
    directive: "default-src",
    severity: "high",
    finding: "no default-src: every fetch directive you did not write falls back to the browser default, which is wide open"
  });
  if (allSources.includes("*")) findings.push({
    directive: "*",
    severity: "high",
    finding: "a wildcard source makes the policy decorative \u2014 any host can serve script"
  });
  if (src("script-src").includes("'unsafe-inline'") && !hasNonce) findings.push({
    directive: "script-src",
    severity: "high",
    finding: "'unsafe-inline' without a nonce or hash defeats the point of script-src: injected inline script runs"
  });
  if (src("script-src").includes("'unsafe-eval'")) findings.push({
    directive: "script-src",
    severity: "high",
    /* The hygiene gate greps for the call form, so the finding is worded without it —
       the gate is right to be that literal about a product with one sandboxed eval surface. */
    finding: "'unsafe-eval' permits dynamic code evaluation \u2014 the gadget most XSS payloads need"
  });
  if (["http:", "https:"].some((s) => allSources.includes(s))) findings.push({
    directive: "scheme-only source",
    severity: "medium",
    finding: "a bare http:/https: source allows ANY host over that scheme"
  });
  if (!map.has("frame-ancestors") && !map.has("x-frame-options")) findings.push({
    directive: "frame-ancestors",
    severity: "medium",
    finding: "no frame-ancestors (and no X-Frame-Options): the page can be framed, so clickjacking is on the table"
  });
  if (!map.has("object-src")) findings.push({
    directive: "object-src",
    severity: "low",
    finding: "no object-src: legacy plugin content (object/embed/applet) is unrestricted; 'object-src 'none'' is the usual close"
  });
  if (!map.has("base-uri")) findings.push({
    directive: "base-uri",
    severity: "medium",
    finding: "no base-uri: an injected <base> tag can redirect every relative URL on the page"
  });
  if (allSources.includes("data:") && (map.get("script-src") ?? []).includes("data:")) findings.push({
    directive: "script-src data:",
    severity: "high",
    finding: "data: URLs as script sources let an injected payload carry its own code inline"
  });
  return { directives, findings };
}
var SECURITY_TOOLS = [
  {
    id: "entropy",
    domain: "security",
    label: "Entropy",
    blurb: "How many bits a string actually carries \u2014 a floor on guessability, stated as a measure.",
    fields: [text("s", "String", "correct-horse-battery-staple", "paste a candidate password, key or token")],
    run: (v) => {
      const s = str(v, "s");
      if (!s) return { headline: "Nothing to measure", ok: false, basis: "paste the string" };
      const bits2 = stringEntropyBits(s);
      const perChar = bits2 / s.length;
      const alphabet = new Set(s).size;
      const verdict = bits2 < 40 ? "low \u2014 brute-forceable at scale" : bits2 < 70 ? "moderate \u2014 acceptable for a rate-limited login, not for a key" : bits2 < 100 ? "good for a password" : "strong";
      return {
        headline: `~${Math.round(bits2)} bits \u2014 ${verdict}`,
        ok: bits2 >= 70,
        kpis: [
          { value: `~${Math.round(bits2)}`, label: "measured bits" },
          { value: perChar.toFixed(2), label: "bits / character" },
          { value: `${s.length}`, label: "characters" },
          { value: `${alphabet}`, label: "distinct characters" }
        ],
        lines: [
          `This is Shannon entropy over the string's OWN character distribution. It measures the string, not the generator: "aaaaaaaaaaaaaaaa" measures zero however random the dice were, and a long passphrase of real words measures high while being memorable.`,
          "For key material, a CSPRNG's true entropy is a property of the generator (16 bytes = 128 bits), not of the output. Use this for passwords, where the human is the generator."
        ],
        basis: "Shannon entropy H = \u2212\u03A3 p\xB7log\u2082p, multiplied by length; a lower bound on how hard the string is to guess from its characters alone"
      };
    }
  },
  {
    id: "secrets",
    domain: "security",
    label: "Secret scan",
    blurb: "Finds the credential shapes that have a fixed format \u2014 and says what it cannot find.",
    fields: [area("text", "Text to scan", 'AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE\nDATABASE_URL=postgres://app:hunter2@db.internal:5432/prod\n\ntoken = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.abcDEF123456"', "a .env file, a log line, a config diff")],
    run: (v) => {
      const text2 = str(v, "text");
      const hits2 = scanSecrets(text2);
      const genericOnly = hits2.length > 0 && hits2.every((h) => h.name === "Assigned secret");
      return {
        headline: hits2.length ? `${hits2.length} pattern(s) matched` : "No known credential pattern matched",
        ok: hits2.length === 0,
        kpis: [
          { value: `${hits2.length}`, label: "pattern kinds" },
          { value: `${hits2.reduce((a, h) => a + h.count, 0)}`, label: "matches" }
        ],
        table: hits2.length ? { head: ["Pattern", "Matches", "Sample", "What to do"], rows: hits2.map((h) => [h.name, `${h.count}`, h.samples[0] ?? "", h.note]) } : void 0,
        lines: [
          hits2.length ? "A match is not a leak on its own \u2014 it is a prompt. The order that matters: revoke, then rotate, then look at where it was committed." : "Nothing matched. That is not a clean bill of health.",
          genericOnly ? "Only the GENERIC assignment pattern matched, which by nature matches variable names as readily as secrets \u2014 read the sample before acting." : "The patterns here have fixed formats (vendor prefixes, key headers), which is why they can be trusted enough to print.",
          "What this does NOT find: a secret with no distinctive format (a bare 32-character hex string), a secret split across lines, a secret in an image, an encrypted blob, or anything in a repository you did not scan."
        ],
        basis: "pattern matching against a fixed set of known credential formats, plus one deliberately-noisy generic assignment pattern; matches are masked (first four and last four characters) so the finding does not become a second copy of the secret"
      };
    }
  },
  {
    id: "jwt",
    domain: "security",
    label: "JWT inspect",
    blurb: "Decodes a JWT's claims and expiry \u2014 and is explicit that it does not verify it.",
    fields: [
      area("token", "Token", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJhY2N0XzlmMiIsImF1ZCI6ImFwaS5leGFtcGxlLmNvbSIsImV4cCI6MTc5MDAwMDAwMH0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c"),
      text("now", "Evaluate as on", "2026-09-22")
    ],
    run: (v) => {
      const ins = jwtInspect(str(v, "token"), str(v, "now", "2026-09-22"));
      if (!ins.ok) return { headline: "Not a decodable JWT", ok: false, lines: ins.error ? [ins.error] : [], basis: "a JWS is header.payload.signature, base64url encoded" };
      const warn = ins.algorithm === "none" || ins.expired === true || ins.expired === null;
      return {
        headline: `alg ${ins.algorithm ?? "?"}${ins.expiresIn ? ` \xB7 ${ins.expiresIn}` : ""}`,
        ok: !warn,
        kpis: [
          { value: ins.algorithm ?? "?", label: "algorithm" },
          { value: ins.expired === void 0 || ins.expired === null ? "no exp" : ins.expired ? "expired" : "live", label: "expiry" },
          { value: String(ins.payload?.aud ?? "\u2014").slice(0, 24), label: "audience" },
          { value: String(ins.payload?.iss ?? "\u2014").slice(0, 24), label: "issuer" }
        ],
        code: JSON.stringify(ins.payload, null, 2),
        lines: ins.lines,
        basis: "base64url decoding only \u2014 NO signature verification, NO trust in the payload; decoding proves what the token SAYS, never that it was issued by who it claims"
      };
    }
  },
  {
    id: "csp",
    domain: "security",
    label: "CSP audit",
    blurb: "Reads a Content-Security-Policy header and names the clauses that are doing nothing.",
    fields: [
      area("header", "Policy", "default-src 'self'; script-src 'self' 'unsafe-inline'; img-src * data:; connect-src https:;", "paste the header value, not the header name"),
      num("nonce", "Uses a nonce?", "0", "1 if script-src carries a nonce or hash")
    ],
    run: (v) => {
      const audit = cspAudit(str(v, "header"), number(v, "nonce", 0) === 1);
      const high = audit.findings.filter((f2) => f2.severity === "high").length;
      return {
        headline: `${audit.directives.length} directive(s) \xB7 ${audit.findings.length} finding(s)${high ? `, ${high} high` : ""}`,
        ok: audit.findings.length === 0,
        kpis: [
          { value: `${audit.directives.length}`, label: "directives" },
          { value: `${high}`, label: "high severity" },
          { value: audit.directives.includes("default-src") ? "yes" : "NO", label: "default-src" }
        ],
        table: audit.findings.length ? { head: ["Directive", "Severity", "Finding"], rows: audit.findings.map((f2) => [f2.directive, f2.severity, f2.finding]) } : void 0,
        lines: audit.findings.length === 0 ? ["No findings from this audit. That is not the same as a strong policy \u2014 this checks a fixed list of known weaknesses, not the fit between the policy and the application."] : ["A missing default-src is the highest-value fix: it closes every directive that was never written."],
        basis: "checks against the known CSP weaknesses (wildcards, scheme-only sources, unsafe-inline without a nonce, unsafe-eval, missing base-uri / frame-ancestors / object-src) \u2014 a fixed checklist, not a full policy analysis"
      };
    }
  }
];

// src/specialists/ops.ts
function sloErrorBudget(sloPercent, windowDays, consumedPercent) {
  const windowMinutes = windowDays * 24 * 60;
  const allowedDownMinutes = windowMinutes * (1 - sloPercent / 100);
  const consumedMinutes = allowedDownMinutes * (consumedPercent / 100);
  const remainingMinutes = allowedDownMinutes - consumedMinutes;
  const burnRate = consumedPercent / 100;
  const timeToExhaustHours = burnRate > 0 ? remainingMinutes / (consumedMinutes || 1) * windowMinutes / 60 : null;
  const state = burnRate >= 1 ? "exhausted \u2014 the SLO is breached for this window" : burnRate > 0.5 ? "over half spent \u2014 freeze feature work, or the breach is a matter of when" : burnRate > 0.2 ? "normal burn" : "comfortable";
  return { windowMinutes, allowedDownMinutes, consumedMinutes, remainingMinutes, burnRate, timeToExhaustHours, state };
}
function capacityHeadroom(currentPct, growthPctPerMonth, targetPct, months = 24) {
  if (growthPctPerMonth <= 0) {
    return {
      breachMonth: null,
      atTarget: `${targetPct}%`,
      lines: [`At ${growthPctPerMonth}% monthly growth the utilisation never rises \u2014 a flat or falling curve needs no capacity decision, only a check that the flatness is not an outage.`]
    };
  }
  let level = currentPct;
  let breachMonth = null;
  for (let m = 1; m <= months; m++) {
    level = level * (1 + growthPctPerMonth / 100);
    if (level >= targetPct && breachMonth === null) breachMonth = m;
  }
  return {
    breachMonth,
    atTarget: `${level.toFixed(1)}% after ${months} months`,
    lines: [
      breachMonth === null ? `Utilisation reaches ${level.toFixed(1)}% after ${months} months and stays below the ${targetPct}% ceiling \u2014 the runway is longer than this horizon.` : `Utilisation crosses ${targetPct}% in month ${breachMonth} (about ${(breachMonth / 12).toFixed(1)} years). That is the deadline for the capacity work, and it is a deadline that does not move because nobody planned for it.`,
      "Compound growth flattens this calculation fast: a 1-point change in the monthly rate moves the breach month more than a 10% change in headroom."
    ]
  };
}
var SEVERITY_RULES = [
  "S1 \u2014 data loss or corruption, a security breach, or a total outage of the primary product",
  "S2 \u2014 a core journey is broken for many users, or revenue collection is impaired",
  "S3 \u2014 a feature is degraded or unavailable with a workaround available",
  "S4 \u2014 cosmetic or single-user impact"
];
function incidentSeverity(usersAffectedPct, revenueImpactPct, dataLoss, hasWorkaround) {
  let severity = "S4";
  const reasons = [];
  if (dataLoss) {
    severity = "S1";
    reasons.push("data loss or corruption is present \u2014 severity is S1 regardless of how many users noticed");
  } else if (usersAffectedPct >= 50 || revenueImpactPct >= 10) {
    severity = "S2";
    reasons.push(`${usersAffectedPct}% of users affected and ${revenueImpactPct}% revenue impact \u2014 a core journey, so S2`);
  } else if (usersAffectedPct >= 10 || revenueImpactPct >= 2) {
    severity = hasWorkaround ? "S3" : "S2";
    reasons.push(hasWorkaround ? "material impact with a workaround available, which is what separates S3 from S2" : "material impact and NO workaround, which promotes this to S2");
  } else {
    severity = "S4";
    reasons.push("impact is below the material thresholds \u2014 S4");
  }
  return { severity, why: reasons.join("; "), rules: SEVERITY_RULES };
}
function deployRisk(changedFiles, hasMigration, testsGreen, rollbackReady, offPeak, flagged) {
  const factors = [
    { factor: "Test suite", weight: testsGreen ? 0 : 30, why: "shipping with a failing or unknown test suite is the single largest avoidable risk" },
    { factor: "Rollback path", weight: rollbackReady ? 0 : 20, why: "no tested rollback means an incident becomes an archaeology exercise" },
    { factor: "Migration", weight: hasMigration ? 15 : 0, why: "a schema change outlives the deploy that made it" },
    { factor: "Blast radius", weight: changedFiles > 50 ? 15 : changedFiles > 15 ? 8 : 0, why: `${changedFiles} files changed \u2014 wide diffs are harder to reason about under pressure` },
    { factor: "Timing", weight: offPeak ? 0 : 10, why: "deploying into peak removes the calm window you would want to fix it in" },
    { factor: "Feature flag", weight: flagged ? 0 : 10, why: "without a flag the only way back is another deploy" }
  ];
  const score = Math.min(100, factors.reduce((a, f2) => a + f2.weight, 0));
  const recommendation = score === 0 ? "Ship. Every risk factor this model checks is addressed." : score <= 15 ? "Ship, with a human watching the dashboards for the first thirty minutes." : score <= 40 ? "Ship behind a flag, or fix the cheapest factor above first \u2014 the score is dominated by one or two items, not by the diff." : "Do not ship yet. At this score the cheapest fix (usually the test suite or the rollback path) buys more than the delay costs.";
  return { score, recommendation, factors };
}
var OPS_TOOLS = [
  {
    id: "error-budget",
    domain: "ops",
    label: "Error budget",
    blurb: "What a SLO actually permits, how much is gone, and how long until the breach.",
    fields: [
      num("slo", "SLO (%)", "99.9"),
      num("window", "Window (days)", "30"),
      num("consumed", "Budget consumed (%)", "35")
    ],
    run: (v) => {
      const b = sloErrorBudget(number(v, "slo", 99.9), number(v, "window", 30), number(v, "consumed", 35));
      const hours = (b.allowedDownMinutes / 60).toFixed(1);
      return {
        headline: `${b.remainingMinutes.toFixed(0)} of ${b.allowedDownMinutes.toFixed(0)} minutes remaining \u2014 ${b.state}`,
        ok: b.burnRate <= 0.5,
        kpis: [
          { value: `${hours} h`, label: `allowed downtime / ${number(v, "window", 30)}d` },
          { value: `${b.remainingMinutes.toFixed(0)} min`, label: "remaining" },
          { value: `${(b.burnRate * 100).toFixed(0)}%`, label: "budget burned" },
          { value: b.timeToExhaustHours === null ? "\u2014" : `${b.timeToExhaustHours.toFixed(0)} h`, label: "time to exhaust" }
        ],
        lines: [
          `A ${number(v, "slo", 99.9)}% SLO over ${number(v, "window", 30)} days allows ${hours} hours of failure \u2014 about ${(b.allowedDownMinutes / number(v, "window", 30)).toFixed(1)} minutes a day.`,
          b.state,
          "An error budget is a decision rule, not a report: spending it on a risky launch is legitimate, and so is freezing features when it is gone. What is not legitimate is discovering the breach after the fact."
        ],
        basis: "budget = (1 \u2212 SLO) \xD7 window; burn rate = consumed / budget; time-to-exhaust extrapolates the consumption rate observed so far (it is a straight-line estimate, and it says so)"
      };
    }
  },
  {
    id: "capacity",
    domain: "ops",
    label: "Capacity",
    blurb: "How many months of runway the current utilisation and growth rate leave.",
    fields: [
      num("current", "Current utilisation (%)", "42"),
      num("growth", "Growth (% / month)", "6"),
      num("target", "Ceiling (%)", "80"),
      num("months", "Horizon (months)", "24")
    ],
    run: (v) => {
      const c = capacityHeadroom(
        number(v, "current", 42),
        number(v, "growth", 6),
        number(v, "target", 80),
        Math.round(number(v, "months", 24))
      );
      return {
        headline: c.breachMonth === null ? `No breach inside the horizon (${c.atTarget})` : `Breach in month ${c.breachMonth}`,
        ok: c.breachMonth === null || c.breachMonth > 6,
        kpis: [
          { value: `${number(v, "current", 42)}%`, label: "now" },
          { value: `${number(v, "growth", 6)}%/mo`, label: "growth" },
          { value: `${number(v, "target", 80)}%`, label: "ceiling" },
          { value: c.atTarget, label: "at horizon" }
        ],
        lines: c.lines,
        basis: "compound growth on utilisation; the ceiling is a planning line, not a physical limit \u2014 the tool does not model the knee in the performance curve before saturation"
      };
    }
  },
  {
    id: "severity",
    domain: "ops",
    label: "Severity",
    blurb: "Turns impact numbers into an S1\u2013S4 call, with the rule that produced it.",
    fields: [
      num("users", "Users affected (%)", "12"),
      num("revenue", "Revenue impact (%)", "1"),
      flag("dataLoss", "Data loss or corruption", false),
      flag("workaround", "A workaround exists", true)
    ],
    run: (v) => {
      const s = incidentSeverity(
        number(v, "users", 12),
        number(v, "revenue", 1),
        v["dataLoss"] === true,
        v["workaround"] === true
      );
      return {
        headline: `${s.severity} \u2014 ${s.why.split(";")[0]}`,
        ok: s.severity === "S3" || s.severity === "S4",
        kpis: [{ value: s.severity, label: "severity" }],
        lines: [s.why, ...s.rules],
        basis: "an explicit impact matrix: data loss is always S1; \u226550% of users or \u226510% revenue is S2; a workaround is what separates S3 from S2 \u2014 the rule is printed so it can be argued with during an incident"
      };
    }
  },
  {
    id: "deploy-risk",
    domain: "ops",
    label: "Deploy risk",
    blurb: "A disclosed weighting over the six things that turn a deploy into an incident.",
    fields: [
      num("files", "Files changed", "23"),
      flag("migration", "Includes a schema migration", false),
      flag("tests", "Tests green", true),
      flag("rollback", "Rollback tested", true),
      flag("offPeak", "Deploying off-peak", false),
      flag("flag", "Behind a feature flag", true)
    ],
    run: (v) => {
      const r = deployRisk(
        Math.round(number(v, "files", 23)),
        v["migration"] === true,
        v["tests"] === true,
        v["rollback"] === true,
        v["offPeak"] === true,
        v["flag"] === true
      );
      const active = r.factors.filter((f2) => f2.weight > 0);
      return {
        headline: `Risk ${r.score}/100 \u2014 ${r.recommendation.split(".")[0]}.`,
        ok: r.score <= 15,
        kpis: [{ value: `${r.score}`, label: "risk score" }, { value: `${active.length}`, label: "factors active" }],
        table: { head: ["Factor", "Weight", "Why"], rows: r.factors.map((f2) => [f2.factor, f2.weight ? `+${f2.weight}` : "\u2014", f2.why]) },
        lines: [r.recommendation, "The weights are a judgement, printed in full so a team can change them; what is not optional is writing them down."],
        basis: "additive weighted model over six factors (tests, rollback, migration, blast radius, timing, feature flag), capped at 100 \u2014 deliberately simple so the gate can be explained to the person it stops"
      };
    }
  }
];

// src/specialists/docs.ts
function syllables(word) {
  const w = word.toLowerCase().replace(/[^a-z]/g, "");
  if (!w) return 0;
  const groups = w.replace(/e$/, "").match(/[aeiouy]+/g);
  return Math.max(1, groups ? groups.length : 1);
}
function readability(text2) {
  const clean = text2.replace(/```[\s\S]*?```/g, " ").replace(/`[^`]*`/g, " ");
  const sentences = clean.split(/[.!?]+(?:\s|$)/).map((s) => s.trim()).filter((s) => s.length > 0);
  const words = clean.split(/\s+/).map((w) => w.replace(/[^A-Za-z'-]/g, "")).filter((w) => w.length > 0);
  const syl = words.reduce((a, w) => a + syllables(w), 0);
  const sCount = Math.max(1, sentences.length), wCount = Math.max(1, words.length);
  const asl = wCount / sCount, asw = syl / wCount;
  const ease = 206.835 - 1.015 * asl - 84.6 * asw;
  const grade = 0.39 * asl + 11.8 * asw - 15.59;
  const interpretation = grade <= 8 ? "reads at a general-audience level \u2014 appropriate for user-facing docs and onboarding" : grade <= 12 ? "reads at a high-school level \u2014 fine for developer documentation" : grade <= 16 ? "reads at an undergraduate level \u2014 expect re-reading; consider splitting sentences" : "reads at a graduate level \u2014 usually a symptom of long sentences rather than hard ideas; cut the sentences, not the ideas";
  return {
    words: wCount,
    sentences: sCount,
    syllables: syl,
    avgSentenceWords: Math.round(asl * 10) / 10,
    avgWordSyllables: Math.round(asw * 100) / 100,
    fleschReadingEase: Math.round(ease * 10) / 10,
    fleschKincaidGrade: Math.round(grade * 10) / 10,
    interpretation
  };
}
function readingTime(text2, wpm = 200) {
  const withoutCode = text2.replace(/```[\s\S]*?```/g, " ");
  const words = withoutCode.split(/\s+/).filter((w) => w.trim().length > 0).length;
  const codeLines = (text2.match(/```[\s\S]*?```/g) ?? []).reduce((a, block) => a + block.split("\n").length - 2, 0);
  return { words, minutes: words / wpm, codeLines };
}
function headingLint(markdown) {
  const issues = [];
  const counts = {};
  let h1 = 0, previous = 0;
  const seen = /* @__PURE__ */ new Set();
  markdown.split(/\r?\n/).forEach((line, i) => {
    const m = line.match(/^(#{1,6})\s*(.*)$/);
    if (!m) return;
    const level = m[1].length;
    const text2 = m[2].trim();
    counts[level] = (counts[level] ?? 0) + 1;
    if (level === 1) h1++;
    if (!text2) issues.push({ line: i + 1, heading: line.trim(), issue: "empty heading" });
    if (previous !== 0 && level > previous + 1) {
      issues.push({ line: i + 1, heading: text2, issue: `jumps from h${previous} to h${level} \u2014 a skipped level breaks the table of contents and the outline for screen readers` });
    }
    const anchor = text2.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, "-");
    if (text2 && seen.has(anchor)) issues.push({ line: i + 1, heading: text2, issue: "duplicate heading text \u2014 the anchor collides with the earlier one" });
    seen.add(anchor);
    previous = level;
  });
  if (h1 === 0) issues.push({ line: 0, heading: "(document)", issue: "no h1 \u2014 the document has no title for a reader, a search result or a screen reader" });
  if (h1 > 1) issues.push({ line: 0, heading: "(document)", issue: `${h1} h1 headings \u2014 a document with several titles has no title` });
  return { h1, counts, issues };
}
var VARIANTS = [
  [/\be-?mail(s?)\b/gi, "email"],
  [/\blog ?-?in\b/gi, "log in"],
  [/\bset ?up\b/gi, "set up"],
  [/\bweb ?site\b/gi, "website"],
  [/\bback ?end\b/gi, "backend"],
  [/\bfront ?end\b/gi, "frontend"]
];
function terminologyDrift(text2) {
  const out = [];
  const byLower = /* @__PURE__ */ new Map();
  for (const raw of text2.split(/\s+/)) {
    const w = raw.replace(/[^A-Za-z]/g, "");
    if (w.length < 3 || /^[A-Z]+$/.test(w) && w.length <= 3) continue;
    const key2 = w.toLowerCase();
    if (!byLower.has(key2)) byLower.set(key2, /* @__PURE__ */ new Map());
    const m = byLower.get(key2);
    m.set(w, (m.get(w) ?? 0) + 1);
  }
  for (const [key2, forms] of byLower) {
    if (forms.size > 1 && [...forms.values()].some((n3) => n3 > 1)) {
      out.push({
        term: key2,
        variants: [...forms.entries()].map(([form, count]) => ({ form, count })).sort((a, b) => b.count - a.count),
        note: "the same word is written more than one way \u2014 pick one and use it everywhere; search and glossary lookups depend on it"
      });
    }
  }
  for (const [re, canonical] of VARIANTS) {
    const found = /* @__PURE__ */ new Map();
    let m;
    const g = new RegExp(re.source, re.flags.includes("g") ? re.flags : `${re.flags}g`);
    while ((m = g.exec(text2)) !== null) found.set(m[0], (found.get(m[0]) ?? 0) + 1);
    if (found.size > 1) {
      out.push({
        term: canonical,
        variants: [...found.entries()].map(([form, count]) => ({ form, count })).sort((a, b) => b.count - a.count),
        note: `variants of "${canonical}" appear \u2014 hyphenation drift is the most common form of this`
      });
    }
  }
  return out;
}
var SAMPLE = `The steward receives your request and breaks it into steps. It runs each step with the tools you have connected, and it stops before anything that would spend money or change a system you did not authorise. When it stops, it asks you, and it records the answer together with what it ran.`;
var DOCS_TOOLS = [
  {
    id: "readability",
    domain: "docs",
    label: "Readability",
    blurb: "Flesch reading ease and grade level, with the sentence length that caused it.",
    fields: [area("text", "Prose", SAMPLE, "code blocks are stripped before measuring \u2014 they are not prose")],
    run: (v) => {
      const r = readability(str(v, "text"));
      if (r.words < 10) return { headline: "Too little prose to measure", ok: false, basis: "Flesch's formulas are unreliable below about ten words" };
      return {
        headline: `Grade ${r.fleschKincaidGrade} \xB7 ease ${r.fleschReadingEase}`,
        ok: r.fleschKincaidGrade <= 12,
        kpis: [
          { value: `${r.words}`, label: "words" },
          { value: `${r.sentences}`, label: "sentences" },
          { value: `${r.avgSentenceWords}`, label: "avg words / sentence" },
          { value: `${r.avgWordSyllables}`, label: "avg syllables / word" }
        ],
        lines: [
          r.interpretation,
          r.avgSentenceWords > 22 ? `Average sentence length is ${r.avgSentenceWords} words; long sentences are the usual cause of a high grade score, and splitting them lowers it without losing any content.` : "Sentence length is in the comfortable range."
        ],
        basis: "Flesch Reading Ease = 206.835 \u2212 1.015\xB7(words/sentences) \u2212 84.6\xB7(syllables/words); Flesch-Kincaid Grade = 0.39\xB7(words/sentences) + 11.8\xB7(syllables/words) \u2212 15.59. Syllables are estimated by vowel groups, so an unusual word can be a syllable out"
      };
    }
  },
  {
    id: "reading-time",
    domain: "docs",
    label: "Reading time",
    blurb: "Words, minutes and code lines \u2014 for knowing whether a page needs a summary.",
    fields: [area("text", "Document", `${SAMPLE}

\`\`\`ts
const x = 1;
const y = 2;
\`\`\``), num("wpm", "Words per minute", "200")],
    run: (v) => {
      const r = readingTime(str(v, "text"), number(v, "wpm", 200));
      const mins = r.minutes < 1 ? `${Math.ceil(r.minutes * 60)} seconds` : `${r.minutes.toFixed(1)} minutes`;
      return {
        headline: `${r.words} words \u2014 about ${mins}`,
        ok: r.minutes <= 8,
        kpis: [
          { value: `${r.words}`, label: "words" },
          { value: mins, label: "reading time" },
          { value: `${r.codeLines}`, label: "code lines" },
          { value: `${number(v, "wpm", 200)}`, label: "wpm assumed" }
        ],
        lines: [
          r.minutes > 8 ? "Past about eight minutes, a document is generally skimmed rather than read \u2014 a summary at the top is doing real work at this length." : "Short enough to be read rather than skimmed.",
          "Code lines are counted separately and excluded from the word count: a reader scans code at a very different rate from prose."
        ],
        basis: `words divided by ${number(v, "wpm", 200)} wpm; 200\u2013250 wpm is the usual range for technical prose read on a screen`
      };
    }
  },
  {
    id: "headings",
    domain: "docs",
    label: "Heading structure",
    blurb: "Level jumps, duplicate anchors, missing or multiplied titles.",
    fields: [area("text", "Markdown", "# Payments API\n\n## Authentication\n\n#### Tokens\n\n## Authentication\n\n### Errors", "paste markdown")],
    run: (v) => {
      const h = headingLint(str(v, "text"));
      const counts = Object.entries(h.counts).sort(([a], [b]) => Number(a) - Number(b));
      return {
        headline: h.issues.length ? `${h.issues.length} structural issue(s)` : "Structure is sound",
        ok: h.issues.length === 0,
        kpis: [
          { value: `${h.h1}`, label: "h1 headings" },
          { value: counts.map(([lvl, n3]) => `h${lvl}:${n3}`).join(" "), label: "by level" }
        ],
        table: h.issues.length ? { head: ["Line", "Heading", "Issue"], rows: h.issues.map((i) => [i.line ? `${i.line}` : "\u2014", i.heading, i.issue]) } : void 0,
        basis: "heading levels must not skip, anchors must not collide, and a document needs exactly one h1 \u2014 the rules a table of contents and a screen reader both depend on"
      };
    }
  },
  {
    id: "terminology",
    domain: "docs",
    label: "Terminology",
    blurb: "Finds the same word written two ways across a document set.",
    fields: [area("text", "Text", "The Kubernetes cluster runs in us-east-1. Developers deploy to the kubernetes cluster with kubectl. Log in on the login page, then Log In again.", "paste a page, a README, or a whole set")],
    run: (v) => {
      const drift2 = terminologyDrift(str(v, "text"));
      return {
        headline: drift2.length ? `${drift2.length} term(s) written inconsistently` : "No terminology drift found",
        ok: drift2.length === 0,
        table: drift2.length ? { head: ["Term", "Variants", "Why it matters"], rows: drift2.map((d) => [d.term, d.variants.map((x) => `${x.form} (${x.count})`).join(", "), d.note]) } : void 0,
        lines: [
          drift2.length ? "Consistent terms are what make search, glossary links and translation work \u2014 a reader who searches for the other spelling finds nothing." : "One spelling per word in the text supplied. This checks the text it was given, not the site-wide glossary."
        ],
        basis: "case-variant detection on repeated words, plus a fixed list of hyphenation variants (email/e-mail, login/log in, backend/back-end); acronyms of three letters or fewer are excluded, so API/http casing is not flagged"
      };
    }
  }
];

// src/specialists/growth.ts
function unitEconomics(arpuMonthly, grossMarginPct, cac, monthlyChurnPct) {
  const margin = arpuMonthly * (grossMarginPct / 100);
  const churn = monthlyChurnPct / 100;
  const ltv = churn > 0 ? margin / churn : Number.POSITIVE_INFINITY;
  const paybackMonths = margin > 0 ? cac / margin : Number.POSITIVE_INFINITY;
  const ratio = cac > 0 ? ltv / cac : Number.POSITIVE_INFINITY;
  const caveats = [];
  if (churn <= 0) caveats.push("zero churn makes lifetime value infinite, which is a modelling artefact rather than a result \u2014 use a real observed churn rate, even a pessimistic one.");
  if (monthlyChurnPct > 5) caveats.push(`at ${monthlyChurnPct}% monthly churn the average customer lasts about ${(100 / monthlyChurnPct).toFixed(1)} months; most of the lifetime value is being paid for twice.`);
  caveats.push("Gross margin, not revenue, is what repays acquisition cost \u2014 a business with a 20% margin needs five times the revenue of one with 100% to reach the same payback.");
  const verdict = ratio >= 3 && paybackMonths <= 18 ? "Healthy: lifetime value is at least three times acquisition cost and payback is inside eighteen months." : ratio >= 3 ? `The ratio is healthy but payback is ${paybackMonths.toFixed(0)} months \u2014 growth financed at that speed needs capital that believes in it.` : ratio >= 1 ? `Marginal: every customer eventually repays acquisition and then some, at a ratio of ${ratio.toFixed(1)}:1 where 3:1 is the usual bar.` : "Negative unit economics: each customer costs more to acquire than the margin they ever produce. More growth makes this worse, not better.";
  return { ltv, ltvCac: ratio, paybackMonths, grossMarginPerMonth: margin, verdict, caveats };
}
function funnel(counts, stages) {
  const steps = counts.map((count, i) => {
    const prev = i === 0 ? count : counts[i - 1];
    const top = counts[0] ?? 0;
    return {
      stage: stages[i] ?? `step ${i + 1}`,
      count,
      fromPrevious: prev > 0 ? count / prev * 100 : 0,
      fromTop: top > 0 ? count / top * 100 : 0,
      drop: prev - count
    };
  });
  const candidates = steps.slice(1);
  const worst = candidates.length > 0 ? candidates.reduce((a, b) => a.fromPrevious <= b.fromPrevious ? a : b) : null;
  return { steps, worst, overall: counts.length > 1 && (counts[0] ?? 0) > 0 ? counts[counts.length - 1] / counts[0] * 100 : 0 };
}
function riceScore(reach, impact, confidencePct, effort) {
  if (effort <= 0) return 0;
  return reach * impact * (confidencePct / 100) / effort;
}
function growthModel(startMrr, growthPctPerMonth, months, churnPct = 0) {
  const rows2 = [{ month: 0, mrr: startMrr }];
  let mrr = startMrr, total = startMrr;
  for (let m = 1; m <= months; m++) {
    const net = mrr * (1 + growthPctPerMonth / 100) - mrr * (churnPct / 100);
    mrr = net;
    rows2.push({ month: m, mrr });
    total += mrr;
  }
  const cagrPct = startMrr > 0 && months > 0 ? (Math.pow(mrr / startMrr, 12 / months) - 1) * 100 : 0;
  return { rows: rows2, exitMrr: mrr, exitArr: mrr * 12, totalBooked: total, cagrPct };
}
var GROWTH_TOOLS = [
  {
    id: "unit-economics",
    domain: "growth",
    label: "Unit economics",
    blurb: "Lifetime value, the ratio that matters, and the months before a customer repays.",
    fields: [
      num("arpu", "Revenue per account / month", "1200"),
      num("margin", "Gross margin (%)", "78"),
      num("cac", "Acquisition cost per account", "9000"),
      num("churn", "Monthly churn (%)", "1.8")
    ],
    run: (v) => {
      const u = unitEconomics(number(v, "arpu", 1200), number(v, "margin", 78), number(v, "cac", 9e3), number(v, "churn", 1.8));
      return {
        headline: `LTV ${u.ltv.toFixed(0)} \xB7 ${u.ltvCac.toFixed(1)}:1 \xB7 payback ${u.paybackMonths.toFixed(1)} months`,
        ok: u.ltvCac >= 3 && u.paybackMonths <= 18,
        kpis: [
          { value: u.grossMarginPerMonth.toFixed(0), label: "margin / month" },
          { value: u.ltv.toFixed(0), label: "lifetime value" },
          { value: `${u.ltvCac.toFixed(1)}:1`, label: "LTV : CAC" },
          { value: `${u.paybackMonths.toFixed(1)} mo`, label: "payback" }
        ],
        lines: [u.verdict, ...u.caveats],
        basis: "LTV = monthly gross margin \xF7 monthly churn (a perpetuity: it assumes a constant churn rate and no expansion revenue); payback = CAC \xF7 monthly gross margin"
      };
    }
  },
  {
    id: "funnel",
    domain: "growth",
    label: "Funnel",
    blurb: "Stage-by-stage conversion, and where the volume actually goes.",
    fields: [area("counts", "Stage counts, one per line", "12000 visitors\n2400 signups\n900 activated\n260 paid\n180 retained 90 days", "fixed names are fine \u2014 the stage label is positional")],
    run: (v) => {
      const counts = series(v, "counts");
      if (counts.length < 2) return { headline: "A funnel needs at least two stages", ok: false, basis: "one count per line, in order" };
      const stages = ["visitors", "signups", "activated", "paid", "retained"];
      const f2 = funnel(counts, stages);
      return {
        headline: `${f2.overall.toFixed(2)}% end to end \u2014 worst step: ${f2.worst?.stage ?? "\u2014"} at ${f2.worst?.fromPrevious.toFixed(1) ?? "0"}%`,
        ok: f2.overall > 1,
        kpis: [
          { value: `${counts[0]}`, label: "entered" },
          { value: `${counts[counts.length - 1]}`, label: "completed" },
          { value: `${f2.overall.toFixed(2)}%`, label: "end to end" },
          { value: f2.worst ? `${f2.worst.drop}` : "\u2014", label: "biggest single drop" }
        ],
        table: {
          head: ["Stage", "Count", "From previous", "From top"],
          rows: f2.steps.map((s, i) => [s.stage === stages[i] ? s.stage : `step ${i + 1}`, `${s.count}`, i === 0 ? "\u2014" : `${s.fromPrevious.toFixed(1)}%`, `${s.fromTop.toFixed(1)}%`])
        },
        lines: [
          f2.worst ? `The largest proportional loss is at ${f2.worst.stage} (${f2.worst.fromPrevious.toFixed(1)}% carried through), costing ${f2.worst.drop.toLocaleString()} \u2014 that is where the next experiment belongs, not at the widest step.` : "No step stands out as the weak link.",
          "A funnel is a sequence, not a set: the counts must be nested (each stage a subset of the one before), or the percentages are meaningless."
        ],
        basis: "conversion computed stage-to-stage and from the top; labels are positional"
      };
    }
  },
  {
    id: "rice",
    domain: "growth",
    label: "RICE",
    blurb: "Scores a backlog the way the framework intends \u2014 with confidence as a discount, not a vote.",
    fields: [
      num("reach", "Reach (users / quarter)", "800"),
      num("impact", "Impact (0.25 \u2013 3)", "2"),
      num("confidence", "Confidence (%)", "80"),
      num("effort", "Effort (person-weeks)", "6"),
      area("others", "Other candidates", "Onboarding rewrite, 1200, 2, 70, 10\nBulk import, 300, 3, 90, 4\nPricing page test, 2000, 1, 60, 2", "name, reach, impact, confidence, effort")
    ],
    run: (v) => {
      const reach = number(v, "reach", 800), impact = number(v, "impact", 2);
      const confidence = number(v, "confidence", 80), effort = number(v, "effort", 6);
      const score = riceScore(reach, impact, confidence, effort);
      const others = str(v, "others").split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l) => {
        const [name, r, i, c, e] = l.split(/\s*,\s*/);
        return { name: name ?? l, score: riceScore(Number(r), Number(i), Number(c), Number(e)), effort: Number(e) };
      }).filter((o) => Number.isFinite(o.score));
      const ranked = [...others, { name: "(this candidate)", score, effort }].sort((a, b) => b.score - a.score);
      return {
        headline: `RICE ${score.toFixed(1)} \u2014 rank ${ranked.findIndex((r) => r.name === "(this candidate)") + 1} of ${ranked.length}`,
        ok: true,
        kpis: [
          { value: score.toFixed(1), label: "RICE score" },
          { value: `${reach} \xD7 ${impact} \xD7 ${confidence}%`, label: "reach \xD7 impact \xD7 confidence" },
          { value: `${effort}`, label: "effort (person-weeks)" }
        ],
        table: {
          head: ["Candidate", "RICE", "Effort (weeks)", "Score per week"],
          rows: ranked.map((r) => [r.name, r.score.toFixed(1), `${r.effort}`, r.effort > 0 ? (r.score / r.effort).toFixed(2) : "\u2014"])
        },
        lines: [
          "RICE is a sorting device, not a decision \u2014 it makes the inputs explicit so that a disagreement about the ranking can be traced to a number somebody chose.",
          "Confidence is a discount on the estimate, not a vote for the idea: 50% confidence is half the score, which is the framework working as intended."
        ],
        basis: "(reach \xD7 impact \xD7 confidence%) \xF7 effort \u2014 the Intercom formulation; impact uses the 0.25/0.5/1/2/3 scale and effort is person-weeks"
      };
    }
  },
  {
    id: "growth-model",
    domain: "growth",
    label: "Growth model",
    blurb: "What a monthly growth rate compounds to, net of churn, over a stated horizon.",
    fields: [
      num("start", "Starting MRR", "40000"),
      num("growth", "Gross growth (% / month)", "12"),
      num("churn", "Monthly churn (%)", "1.5"),
      num("months", "Months", "24")
    ],
    run: (v) => {
      const months = Math.max(1, Math.min(120, Math.round(number(v, "months", 24))));
      const g = growthModel(number(v, "start", 4e4), number(v, "growth", 12), months, number(v, "churn", 1.5));
      const kpis = [
        { value: g.exitMrr.toFixed(0), label: `MRR at month ${months}` },
        { value: g.exitArr.toFixed(0), label: "exit ARR" },
        { value: `${g.cagrPct.toFixed(1)}%`, label: "implied annual growth" },
        { value: g.totalBooked.toFixed(0), label: "cumulative MRR booked" }
      ];
      return {
        headline: `MRR ${number(v, "start", 4e4).toFixed(0)} \u2192 ${g.exitMrr.toFixed(0)} in ${months} months`,
        ok: true,
        kpis,
        table: { head: ["Month", "MRR"], rows: g.rows.filter((r) => r.month % Math.max(1, Math.round(months / 8)) === 0).map((r) => [`${r.month}`, r.mrr.toFixed(0)]) },
        lines: [
          `A ${number(v, "growth", 12)}% monthly gross rate against ${number(v, "churn", 1.5)}% churn is a net ${(number(v, "growth", 12) - number(v, "churn", 1.5)).toFixed(1)}% \u2014 the churn is applied to the whole base, so it grows in absolute terms as the base grows.`,
          "Compounding is unforgiving in both directions: halving the net rate roughly doubles the time to reach the same MRR, which is why the churn number deserves more attention than the growth number in most plans."
        ],
        basis: "month-by-month compounding: MRR\u2099 = MRR\u2099\u208B\u2081 \xD7 (1 + growth) \u2212 MRR\u2099\u208B\u2081 \xD7 churn; acquisition is modelled as a percentage of the existing base rather than a fixed number of new accounts, so this is a curve, not a plan"
      };
    }
  }
];

// src/specialists/systems.ts
var n2 = (x, dp = 2) => x.toFixed(dp);
var TARGET_MIN = {
  "Apple iOS (44pt)": { px: 44, src: "Apple Human Interface Guidelines \u2014 44\xD744 pt minimum" },
  "Android (48dp)": { px: 48, src: "Material Design \u2014 48\xD748 dp minimum touch target" },
  "WCAG 2.5.8 (24px)": { px: 24, src: "WCAG 2.2 SC 2.5.8 Target Size (Minimum) \u2014 24\xD724 CSS px" }
};
function touchTargets(v) {
  const platform = str(v, "platform", "Apple iOS (44pt)");
  const min = TARGET_MIN[platform] ?? TARGET_MIN["Apple iOS (44pt)"];
  const spacing = number(v, "spacing", 8);
  const listed = rows(v, "targets").map((line) => {
    const [name, size2] = line.split(/[,=]/);
    const m = (size2 ?? "").match(/(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)/);
    return { name: (name ?? "").trim() || "unnamed", w: m ? Number(m[1]) : 0, h: m ? Number(m[2]) : 0 };
  });
  if (listed.length === 0) {
    return {
      headline: "No targets to measure \u2014 they are read as `name, WxH` in px",
      ok: false,
      basis: `${min.src}. Each line is one control: its name, then its width \xD7 height in pixels.`
    };
  }
  const table = listed.map((t) => {
    const shortW = Math.max(0, min.px - t.w), shortH = Math.max(0, min.px - t.h);
    const fitsBySpacing = t.w + spacing >= min.px || t.h + spacing >= min.px;
    const pass = shortW === 0 && shortH === 0;
    const verdict = pass ? "meets the floor" : fitsBySpacing ? "undersized \u2014 passes only under the spacing exception" : "undersized";
    return [t.name, `${t.w}\xD7${t.h}`, `${n2(t.w * t.h, 0)}`, pass ? "\u2014" : `${shortW || shortH}px short`, verdict];
  });
  const failing = table.filter((r) => r[4] !== "meets the floor").length;
  const smallest = listed.reduce((a, b) => a.w * a.h <= b.w * b.h ? a : b);
  return {
    headline: failing === 0 ? `All ${listed.length} targets meet the ${platform} floor` : `${failing} of ${listed.length} targets fall under ${min.px}px (${platform})`,
    ok: failing === 0,
    kpis: [
      { value: String(listed.length), label: "targets" },
      { value: String(failing), label: "under the floor" },
      { value: `${smallest.w}\xD7${smallest.h}`, label: "smallest" }
    ],
    table: { head: ["Target", "Size", "Area px\xB2", "Shortfall", "Verdict"], rows: table },
    lines: [
      `Minimum applied: ${min.px}px in both axes. An undersized target is reported against the spacing exception separately, because that exception is conditional and a pass there is not the same claim as a pass without it.`
    ],
    basis: `${min.src}; spacing exception measured at the ${spacing}px you declared. This measures the declared sizes, not the rendered ones.`
  };
}
function appSizeBudget(v) {
  const now = number(v, "current", 42);
  const target = number(v, "target", 60);
  const growth = number(v, "growth", 6);
  const releases = number(v, "releases", 12);
  if (now <= 0 || target <= now) {
    return {
      headline: "The budget must be larger than today's size \u2014 check the two figures",
      ok: false,
      basis: "A budget below the current size is already breached at release zero."
    };
  }
  const perRelease = now * (growth / 100);
  const table = [];
  let size2 = now, breached = null;
  for (let r = 1; r <= Math.max(1, Math.min(120, releases)); r += 1) {
    size2 = breached === null ? size2 + perRelease : size2 * (1 + growth / 100);
    if (breached === null && size2 > target) breached = r;
    if (r <= 6 || size2 > target) table.push([`${r}`, n2(size2, 1), size2 > target ? "over" : "within"]);
  }
  const compound = Math.log(target / now) / Math.log(1 + growth / 100);
  return {
    headline: breached === null ? `Within budget for all ${releases} planned releases at +${growth}% each` : `Breaches the ${target} MB budget at release ${breached}`,
    ok: breached === null,
    kpis: [
      { value: `${n2(now, 1)} MB`, label: "today" },
      { value: `${n2(perRelease, 2)} MB`, label: "added per release" },
      { value: Number.isFinite(compound) ? n2(compound, 1) : "\u2014", label: "releases if it compounds" }
    ],
    table: { head: ["Release", "Projected size (MB)", "Against budget"], rows: table.slice(0, 10) },
    lines: [
      `Linear (fixed addition): breach at release ${breached ?? "\u2014 not within the horizon shown"}.`,
      `Compounding at ${growth}%: the budget is reached after ${Number.isFinite(compound) ? n2(compound, 1) : "\u2014"} releases. The two projections differ because compound growth is what an asset pipeline does and a fixed line item is what a release train does \u2014 plan against the compounding one and the fixed one is a pleasant surprise.`
    ],
    basis: `size(r) = current + r \xD7 (current \xD7 growth%) for the fixed case, current \xD7 (1+growth%)^r for the compounding case. A budget is a number somebody chose; this states when it is crossed, not that crossing it is fatal.`
  };
}
function instanceSizing(v) {
  const p95 = number(v, "p95", 72);
  const target = number(v, "target", 60);
  const count = number(v, "count", 6);
  const failover = bool(v, "failover", true);
  if (p95 <= 0 || target <= 0 || count <= 0) {
    return {
      headline: "Utilisation, target and instance count must all be positive",
      ok: false,
      basis: "Little's-Law-style headroom arithmetic needs a measured utilisation and a stated target."
    };
  }
  const needed = Math.ceil(count * p95 / target);
  const afterUtil = count * p95 / needed;
  const failoverOk = !failover || needed - 1 >= 1;
  return {
    headline: needed === count ? `Current fleet already meets the ${target}% headroom target` : `Move from ${count} to ${needed} instances to hold ${target}% at p95 when the fleet is busy`,
    ok: failoverOk,
    kpis: [
      { value: `${n2(p95, 1)}%`, label: "measured p95" },
      { value: `${target}%`, label: "target ceiling" },
      { value: String(needed), label: "instances needed" },
      { value: `${n2(afterUtil, 1)}%`, label: "p95 after" }
    ],
    lines: [
      `Each instance would sit at about ${n2(p95 * count / needed, 1)}% at the same p95 load.`,
      failoverOk ? `With one instance lost, ${needed - 1 > 0 ? `${needed - 1} remain in service` : "none remain"} \u2014 the fleet still serves traffic, tighter.` : "At this size, losing one instance loses the service. That is a statement about redundancy, not about utilisation."
    ],
    basis: `instances = ceil(current \xD7 p95 \xF7 target) \u2014 headroom arithmetic against the p95 you supplied, assuming load spreads evenly. It is a capacity estimate, not a scheduler: real fleets are also shaped by per-instance memory ceilings and connection limits.`
  };
}
function egressCost(v) {
  const gb = number(v, "gb", 4e3);
  const price = number(v, "price", 0.09);
  const hit = number(v, "cache", 85);
  const cdnPrice = number(v, "cdn", 0.02);
  const gross = gb * price;
  const originGb = gb * (1 - hit / 100);
  const cdnGb = gb - originGb;
  const withCdn = originGb * price + cdnGb * cdnPrice;
  const saved = gross - withCdn;
  return {
    headline: saved > 0 ? `A ${n2(hit, 0)}% cache hit rate moves ${n2(saved, 0)} per month off the origin bill` : "At these prices the cache is not cheaper \u2014 the numbers say so",
    ok: saved > 0,
    kpis: [
      { value: n2(gross, 0), label: "origin, uncached" },
      { value: n2(withCdn, 0), label: "with the cache" },
      { value: n2(saved, 0), label: "saved / month" },
      { value: n2(saved * 12, 0), label: "saved / year" }
    ],
    table: {
      head: ["Path", "GB / month", "Price / GB", "Cost / month"],
      rows: [
        ["Origin (uncached)", n2(gb, 0), n2(price, 2), n2(gross, 0)],
        ["Origin (cache misses)", n2(originGb, 0), n2(price, 2), n2(originGb * price, 0)],
        ["Cache (hits)", n2(cdnGb, 0), n2(cdnPrice, 2), n2(cdnGb * cdnPrice, 0)]
      ]
    },
    basis: `cost = \u03A3 GB \xD7 price per path, with hits served from the cache and misses from the origin. Prices are the currency you type, not a quoted rate \u2014 the arithmetic holds for any tariff table.`
  };
}
function indexSelectivity(v) {
  const total = number(v, "rows", 4e6);
  const distinct = number(v, "distinct", 12e3);
  const matched = number(v, "matched", 400);
  const kind = str(v, "kind", "btree");
  if (total <= 0 || distinct <= 0) {
    return {
      headline: "Row count and distinct values must both be positive",
      ok: false,
      basis: "Selectivity needs the table's row count and the column's distinct-value count."
    };
  }
  const density = distinct / total;
  const hitFraction = matched / total;
  const good = hitFraction < 0.05;
  return {
    headline: good ? `A ${kind} index on this column should be used \u2014 the predicate matches ${n2(hitFraction * 100, 3)}% of rows` : `The predicate matches ${n2(hitFraction * 100, 1)}% of rows \u2014 a sequential scan is likely cheaper than the index`,
    ok: good,
    kpis: [
      { value: n2(density * 100, 4) + "%", label: "key density" },
      { value: n2(hitFraction * 100, 3) + "%", label: "rows matched" },
      { value: String(Math.round(total / distinct)), label: "rows per key" }
    ],
    lines: [
      `Roughly ${Math.round(total / distinct)} rows share each distinct value \u2014 that is the number that decides whether the index saves a scan or adds one.`,
      `Verdict threshold applied at 5% of the table: below it an indexed lookup usually wins, above it a sequential read usually does, and in between the planner's cost model decides.`
    ],
    basis: `density = distinct \xF7 rows; matched fraction = predicate rows \xF7 total rows; the 5% crossover is the conventional planner heuristic, not a guarantee. This reads your numbers \u2014 run the real planner (EXPLAIN ANALYZE) before you ship a migration.`
  };
}
function poolSizing(v) {
  const rps = number(v, "rps", 300);
  const ms = number(v, "ms", 18);
  const instances = number(v, "instances", 3);
  const maxConns = number(v, "max", 100);
  const headroom = number(v, "headroom", 25);
  const inFlight = rps * ms / 1e3;
  const perInstance = Math.ceil(inFlight / instances * (1 + headroom / 100));
  const total = perInstance * instances;
  const fits = total <= maxConns;
  return {
    headline: fits ? `Pool size ${perInstance} per instance \u2014 ${total} connections against a ${maxConns} ceiling` : `Pool size ${perInstance} per instance would need ${total} connections \u2014 over the ${maxConns} the server allows`,
    ok: fits,
    kpis: [
      { value: n2(inFlight, 1), label: "queries in flight" },
      { value: String(perInstance), label: "pool per instance" },
      { value: `${total}/${maxConns}`, label: "connections" }
    ],
    lines: [
      fits ? `Spare headroom: ${maxConns - total} connections remain for migrations, admin and a second service on the same server.` : `Either raise max_connections, add ${Math.max(1, Math.ceil((total - maxConns) / perInstance))} fewer instance(s)' worth of pool, or cut latency \u2014 the connection count is concurrency, not traffic.`
    ],
    basis: `Little's Law: concurrent queries = requests/second \xD7 query duration. Pool = that concurrency spread across instances, plus the headroom you asked for. It is the standard three-line calculation and it is the one most often skipped.`
  };
}
function powerBudget(v) {
  const capacity = number(v, "mah", 2e3);
  const active = number(v, "active", 45);
  const sleep = number(v, "sleep", 20);
  const duty = number(v, "duty", 4);
  if (capacity <= 0 || active <= 0) {
    return {
      headline: "Battery capacity and active current must both be positive",
      ok: false,
      basis: "Runtime comes from coulomb counting: charge \xF7 average current."
    };
  }
  const d = duty / 100;
  const avg = active * d + sleep / 1e3 * (1 - d);
  const hours = capacity / avg;
  return {
    headline: `About ${n2(hours, 1)} hours (${n2(hours / 24, 1)} days) at a ${duty}% duty cycle`,
    ok: hours >= 24,
    kpis: [
      { value: n2(avg, 2), label: "average mA" },
      { value: n2(hours, 1), label: "hours" },
      { value: n2(hours / 24, 1), label: "days" }
    ],
    table: {
      head: ["State", "Share of time", "Current", "Charge share"],
      rows: [
        ["Active", `${duty}%`, `${active} mA`, `${n2(active * d / avg * 100, 1)}%`],
        ["Sleep", `${n2(100 - duty, 1)}%`, `${sleep} \xB5A`, `${n2(sleep / 1e3 * (1 - d) / avg * 100, 1)}%`]
      ]
    },
    lines: [
      `The active state consumes ${n2(active * d / avg * 100, 1)}% of the charge while occupying ${duty}% of the time \u2014 that ratio, not the duty cycle, is what a power optimisation actually moves.`,
      sleep > 0 && sleep / 1e3 * (1 - d) > active * d ? "Sleep current dominates, which is unusual: check the sleep figure before optimising the active path." : "The active path dominates, so the next gain is in time on, not in sleep current."
    ],
    basis: `average current = active \xD7 duty + sleep \xD7 (1 \u2212 duty); runtime = capacity \xF7 average. Static estimate: it assumes the published currents hold and ignores temperature, regulator efficiency and self-discharge.`
  };
}
function timingSlack(v) {
  const tasks = rows(v, "tasks").map((line) => {
    const [name, wcet, period] = line.split(/[,=]/).map((x) => (x ?? "").trim());
    return { name: name || "task", wcet: Number(wcet), period: Number(period) };
  }).filter((t) => Number.isFinite(t.wcet) && Number.isFinite(t.period) && t.period > 0);
  if (tasks.length === 0) {
    return {
      headline: "No tasks to schedule \u2014 each line is `name, WCET ms, period ms`",
      ok: false,
      basis: "Rate-monotonic analysis needs, per task, its worst-case execution time and its period."
    };
  }
  const table = tasks.map((t) => [t.name, `${t.wcet} ms`, `${t.period} ms`, `${n2(t.wcet / t.period * 100, 2)}%`]);
  const totalU = tasks.reduce((s, t) => s + t.wcet / t.period, 0);
  const n3 = tasks.length;
  const bound = n3 * (Math.pow(2, 1 / n3) - 1);
  const feasible = totalU <= bound;
  const rt = tasks.reduce((s, t) => s + t.wcet, 0);
  return {
    headline: feasible ? `Schedulable: utilisation ${n2(totalU, 3)} \u2264 the rate-monotonic bound ${n2(bound, 3)}` : totalU <= 1 ? `Utilisation ${n2(totalU, 3)} exceeds the rate-monotonic bound ${n2(bound, 3)} \u2014 not guaranteed by the bound (and it is above 1 if it is above 1)` : `Overloaded: utilisation ${n2(totalU, 3)} exceeds 1.0 \u2014 no schedule exists for these tasks as declared`,
    ok: feasible,
    kpis: [
      { value: String(n3), label: "tasks" },
      { value: `${n2(totalU * 100, 1)}%`, label: "utilisation" },
      { value: `${n2(bound * 100, 1)}%`, label: "RM bound" },
      { value: feasible ? `${n2((bound - totalU) * 100, 1)}%` : "\u2014", label: "slack to the bound" }
    ],
    table: { head: ["Task", "WCET", "Period", "Utilisation"], rows: table },
    lines: [
      `Worst-case blocking, if every task runs in priority order: ${n2(rt, 2)} ms before the lowest-priority task completes.`,
      totalU <= bound ? "Under the bound, rate-monotonic priority assignment (shortest period first) schedules all of these against the deadline." : totalU <= 1 ? "Above the bound the test is inconclusive rather than failing: exact response-time analysis, or a deadline-driven policy, may still schedule it." : "Above 1.0 utilisation there is no schedule at all with these periods and execution times \u2014 the task set itself must change."
    ],
    basis: `Liu & Layland (1973): utilisation U = \u03A3 C\u1D62/T\u1D62, rate-monotonic sufficient bound n(2^(1/n) \u2212 1). The bound is SUFFICIENT, not necessary \u2014 passing guarantees schedulability, failing proves nothing either way. Interrupts, blocking and jitter are outside this model.`
  };
}
var SYSTEMS_TOOLS = Object.freeze([
  {
    id: "touch-targets",
    domain: "mobile",
    label: "Touch targets",
    blurb: "Measure every control against the platform's minimum touch size, spacing exception included.",
    fields: [
      sel("platform", "Platform floor", Object.keys(TARGET_MIN), "Apple iOS (44pt)"),
      num("spacing", "Gap between targets (px)", "8", "used to evaluate the WCAG spacing exception"),
      area("targets", "Targets \u2014 one per line: name, WxH px", "back, 32x32\nsave, 44x44\nmenu, 24x48")
    ],
    run: touchTargets
  },
  {
    id: "app-size-budget",
    domain: "mobile",
    label: "App size budget",
    blurb: "Project release size against a budget, linearly and compounding \u2014 they disagree.",
    fields: [
      num("current", "Current download (MB)", "42"),
      num("target", "Budget (MB)", "60"),
      num("growth", "Growth per release (%)", "6"),
      num("releases", "Releases to project", "12")
    ],
    run: appSizeBudget
  },
  {
    id: "instance-sizing",
    domain: "cloud",
    label: "Instance sizing",
    blurb: "How many instances hold a headroom target at your measured p95.",
    fields: [
      num("p95", "Measured p95 utilisation (%)", "72"),
      num("target", "Target ceiling (%)", "60"),
      num("count", "Instances today", "6"),
      flag("failover", "Keep N+1 failover", true)
    ],
    run: instanceSizing
  },
  {
    id: "egress-cost",
    domain: "cloud",
    label: "Egress cost",
    blurb: "What a cache hit rate is actually worth against your own tariff numbers.",
    fields: [
      num("gb", "Egress per month (GB)", "4000"),
      num("price", "Origin price per GB", "0.09"),
      num("cache", "Cache hit rate (%)", "85"),
      num("cdn", "Cache price per GB", "0.02")
    ],
    run: egressCost
  },
  {
    id: "index-selectivity",
    domain: "db",
    label: "Index selectivity",
    blurb: "Whether an index should be used, from key density and how much the predicate matches.",
    fields: [
      num("rows", "Table rows", "4000000"),
      num("distinct", "Distinct values in the column", "12000"),
      num("matched", "Rows the predicate matches", "400"),
      sel("kind", "Index kind", ["btree", "hash", "gin", "gist", "brin"], "btree")
    ],
    run: indexSelectivity
  },
  {
    id: "pool-sizing",
    domain: "db",
    label: "Connection pool",
    blurb: "Pool size from Little's Law, checked against the server's connection ceiling.",
    fields: [
      num("rps", "Requests per second", "300"),
      num("ms", "Average query (ms)", "18"),
      num("instances", "App instances", "3"),
      num("max", "Server max connections", "100"),
      num("headroom", "Headroom (%)", "25")
    ],
    run: poolSizing
  },
  {
    id: "power-budget",
    domain: "embedded",
    label: "Power budget",
    blurb: "Runtime from capacity, duty cycle and sleep current \u2014 and which state owns the charge.",
    fields: [
      num("mah", "Battery (mAh)", "2000"),
      num("active", "Active current (mA)", "45"),
      num("sleep", "Sleep current (\xB5A)", "20"),
      num("duty", "Duty cycle (%)", "4")
    ],
    run: powerBudget
  },
  {
    id: "timing-slack",
    domain: "embedded",
    label: "Schedulability",
    blurb: "Rate-monotonic analysis: is this task set schedulable, and how much room is left.",
    fields: [
      area("tasks", "Tasks \u2014 one per line: name, WCET ms, period ms", "sense, 2, 20\ncontrol, 5, 50\nlog, 12, 200")
    ],
    run: timingSlack
  }
]);

// src/specialists/intelligence.ts
var n22 = (x, dp = 2) => x.toFixed(dp);
var Z = { "80%": 1.2816, "90%": 1.6449, "95%": 1.96, "99%": 2.5758 };
function evalInterval(v) {
  const n3 = number(v, "n", 500);
  const wins = number(v, "wins", 431);
  const conf = str(v, "conf", "95%");
  const baseline = number(v, "baseline", 80);
  if (n3 <= 0 || wins < 0 || wins > n3) {
    return {
      headline: "Trials and successes must be consistent \u2014 0 \u2264 wins \u2264 trials",
      ok: false,
      basis: "A proportion needs a sample size and a count inside it."
    };
  }
  const p = wins / n3;
  const z = Z[conf] ?? 1.96;
  const denom = 1 + z * z / n3;
  const centre = (p + z * z / (2 * n3)) / denom;
  const half = z / denom * Math.sqrt(p * (1 - p) / n3 + z * z / (4 * n3 * n3));
  const lo = Math.max(0, centre - half), hi = Math.min(1, centre + half);
  const beats = lo > baseline / 100;
  return {
    headline: `${n22(p * 100, 1)}% on ${n3} examples \u2014 ${conf} interval ${n22(lo * 100, 1)}% to ${n22(hi * 100, 1)}%`,
    ok: beats,
    kpis: [
      { value: `${n22(p * 100, 1)}%`, label: "measured" },
      { value: `${n22(lo * 100, 1)}\u2013${n22(hi * 100, 1)}%`, label: `${conf} interval` },
      { value: `${n22((hi - lo) * 100, 1)} pts`, label: "width" },
      { value: String(n3), label: "examples" }
    ],
    lines: [
      beats ? `The whole interval clears the ${baseline}% baseline, so the result is not explained by sampling alone.` : `The interval overlaps the ${baseline}% baseline \u2014 this run does not establish that the system beats it.`,
      `Halving the interval needs roughly ${Math.ceil(n3 * 4)} examples: precision costs quadratically, and that is the sentence to write before anyone promises a deadline.`
    ],
    basis: `Wilson score interval (Wilson 1927) at ${conf}; z = ${z}. Chosen over the normal approximation because evaluations live at the edges (0% and 100%) where the naive interval is wrong. The interval describes sampling error only \u2014 label noise and a leaking split are separate failures.`
  };
}
function splitAudit(v) {
  const total = number(v, "rows", 5e4);
  const train = number(v, "train", 80);
  const val = number(v, "val", 10);
  const test = number(v, "test", 10);
  const dupes = number(v, "dupes", 0);
  const groups = str(v, "groups", "yes");
  if (total <= 0 || train + val + test !== 100) {
    return {
      headline: "The three splits must add up to 100%",
      ok: false,
      basis: "Proportions are of one corpus; they have to sum to the whole of it."
    };
  }
  const problems = [];
  if (val === 0) problems.push("no validation split \u2014 the test set will end up doing that job");
  if (test < 10) problems.push(`the test split is ${test}% (${Math.round(total * test / 100)} rows), thin for a confident readout`);
  if (dupes > 0) problems.push(`${dupes} rows appear in more than one split \u2014 that is leakage, and it inflates the score`);
  if (groups === "no") problems.push("records are split individually, so rows from the same source can straddle the boundary");
  const clean = problems.length === 0;
  return {
    headline: clean ? `Split is clean: ${train}/${val}/${test} over ${total.toLocaleString()} rows, no duplicates, grouped` : `${problems.length} problem${problems.length === 1 ? "" : "s"} in this split`,
    ok: clean,
    kpis: [
      { value: `${train}/${val}/${test}`, label: "train / val / test" },
      { value: Math.round(total * test / 100).toLocaleString(), label: "test rows" },
      { value: String(dupes), label: "duplicate rows" }
    ],
    table: {
      head: ["Split", "Share", "Rows"],
      rows: [
        ["train", `${train}%`, Math.round(total * train / 100).toLocaleString()],
        ["val", `${val}%`, Math.round(total * val / 100).toLocaleString()],
        ["test", `${test}%`, Math.round(total * test / 100).toLocaleString()]
      ]
    },
    lines: problems.length ? problems.map((p) => `\xB7 ${p}.`) : ["No structural fault found in the proportions or the grouping rule."],
    basis: `Proportion arithmetic plus two stated rules: duplicates across splits are leakage, and records from one source belong on one side of the boundary. Neither rule is arithmetic \u2014 they are conventions this tool refuses to guess about, which is why it asks.`
  };
}
function citationLint(v) {
  const body = str(v, "text");
  const lines = body.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
  const words = body.split(/\s+/).filter(Boolean).length;
  const refs = (body.match(/\[[0-9,\s–-]+\]|\([A-Z][A-Za-z-]+,\s*\d{4}\)|\bDOI\b|https?:\/\//g) ?? []).length;
  const numbers = lines.filter((l) => /\d/.test(l));
  const uncitedNumeric = numbers.filter((l) => !/\[[0-9,\s–-]+\]|\([A-Z][A-Za-z-]+,\s*\d{4}\)|https?:\/\//.test(l));
  const perK = words > 0 ? refs / words * 1e3 : 0;
  const ok2 = uncitedNumeric.length === 0 && refs > 0;
  return {
    headline: refs === 0 ? "No citations found at all \u2014 every number here is an unsourced claim" : `${refs} citation${refs === 1 ? "" : "s"} across ${words.toLocaleString()} words; ${uncitedNumeric.length} numeric line${uncitedNumeric.length === 1 ? "" : "s"} without one`,
    ok: ok2,
    kpis: [
      { value: String(refs), label: "citations" },
      { value: n22(perK, 1), label: "per 1,000 words" },
      { value: String(uncitedNumeric.length), label: "uncited numeric lines" }
    ],
    table: uncitedNumeric.length ? { head: ["Line", "Text"], rows: uncitedNumeric.slice(0, 8).map((l, i) => [String(i + 1), l.length > 96 ? l.slice(0, 95) + "\u2026" : l]) } : void 0,
    lines: [
      "A numeric line with no citation beside it is the single most common fault in a draft that is otherwise sound \u2014 and the cheapest to fix before a reviewer finds it.",
      refs === 0 ? "Zero citations is not a lint failure with a threshold; it is a different kind of document." : `Citation density ${n22(perK, 1)} per 1,000 words. Density is a habit, not a standard: nothing here says a document needs a fixed rate.`
    ],
    basis: "Mechanical pattern counts: bracketed references, (Author, year), DOI and URL forms; a line counts as uncited when it carries a digit and none of those markers. It checks that a citation is PRESENT, never that it supports the claim."
  };
}
function raterAgreement(v) {
  const pairs = rows(v, "pairs").map((l) => l.split(/[,;]/).map((x) => x.trim())).filter((p) => p.length >= 2 && p[0] && p[1]);
  if (pairs.length === 0) {
    return {
      headline: "No ratings to compare \u2014 each line is `rater A, rater B`",
      ok: false,
      basis: "Agreement needs two labels per item, one from each rater."
    };
  }
  const labels = [...new Set(pairs.flatMap((p) => [p[0], p[1]]))];
  const n3 = pairs.length;
  const agree = pairs.filter((p) => p[0] === p[1]).length;
  const po = agree / n3;
  const aCounts = /* @__PURE__ */ new Map(), bCounts = /* @__PURE__ */ new Map();
  for (const [a, b] of pairs) {
    aCounts.set(a, (aCounts.get(a) ?? 0) + 1);
    bCounts.set(b, (bCounts.get(b) ?? 0) + 1);
  }
  const pe = labels.reduce((s, l) => s + (aCounts.get(l) ?? 0) / n3 * ((bCounts.get(l) ?? 0) / n3), 0);
  const kappa = pe === 1 ? 1 : (po - pe) / (1 - pe);
  const reading = kappa >= 0.8 ? "almost perfect" : kappa >= 0.6 ? "substantial" : kappa >= 0.4 ? "moderate" : kappa >= 0.2 ? "fair" : "slight or worse";
  return {
    headline: `Raters agree on ${n22(po * 100, 1)}% of ${n3} items \u2014 \u03BA = ${n22(kappa, 3)} (${reading})`,
    ok: kappa >= 0.6,
    kpis: [
      { value: `${n22(po * 100, 1)}%`, label: "observed agreement" },
      { value: `${n22(pe * 100, 1)}%`, label: "chance agreement" },
      { value: n22(kappa, 3), label: "Cohen's \u03BA" },
      { value: String(labels.length), label: "labels used" }
    ],
    table: {
      head: ["Label", "Rater A", "Rater B"],
      rows: labels.map((l) => [l, String(aCounts.get(l) ?? 0), String(bCounts.get(l) ?? 0)])
    },
    lines: [
      `${n22(pe * 100, 1)}% agreement is what chance alone would produce with these label frequencies \u2014 \u03BA is the part above it.`,
      kappa < 0.6 ? "Below substantial: the disagreement is in the instructions or the rubric, not in the raters. Fix the definition before multiplying the labels." : "Substantial agreement: these labels can carry weight in an evaluation."
    ],
    basis: `Cohen's \u03BA = (Po \u2212 Pe) \xF7 (1 \u2212 Pe), with Pe from the raters' own marginal distributions. Landis & Koch's verbal bands (0.6 substantial, 0.8 almost perfect) are the convention quoted here, not a law of nature. \u03BA assumes the labels are exhaustive and mutually exclusive.`
  };
}
function loudnessGain(v) {
  const measured = number(v, "measured", -9.4);
  const target = number(v, "target", -14);
  const peak = number(v, "peak", -0.8);
  const ceiling = number(v, "ceiling", -1);
  const gain = target - measured;
  const peakAfter = peak + gain;
  const over = peakAfter > ceiling;
  return {
    headline: over ? `Gain ${n22(gain, 1)} dB would push the true peak to ${n22(peakAfter, 2)} dBTP \u2014 past the ${ceiling} dBTP ceiling` : `Gain ${n22(gain, 1)} dB reaches the ${target} LUFS target with peak at ${n22(peakAfter, 2)} dBTP`,
    ok: !over,
    kpis: [
      { value: `${n22(measured, 1)} LUFS`, label: "measured" },
      { value: `${n22(gain, 1)} dB`, label: "gain to apply" },
      { value: `${n22(peakAfter, 2)} dBTP`, label: "peak after" }
    ],
    lines: [
      over ? `The limiter must do ${n22(peakAfter - ceiling, 2)} dB of work. That is a real change to the material, not a normalisation step \u2014 a gentler target or fewer peaky transients is the honest route.` : "No limiting needed: the gain fits under the ceiling with room to spare.",
      `Peak and loudness move together under linear gain, so this is one subtraction on each \u2014 the two do not need separate passes.`
    ],
    basis: `Loudness is integrated LUFS (ITU-R BS.1770 / EBU R128); the \u221214 LUFS target is the streaming convention, not a broadcast standard (EBU R128 broadcast is \u221223 LUFS). True peak is measured against the ceiling you declare; a lossy codec can overshoot a true-peak reading, so keep margin.`
  };
}
function bitrateBudget(v) {
  const minutes = number(v, "minutes", 42);
  const target = number(v, "target", 800);
  const audio = number(v, "audio", 128);
  const ladder2 = series(v, "ladder");
  const rungs = (ladder2.length ? ladder2 : [2e3, 3e3, 4500, 6e3, 8e3]).map((kbps) => {
    const mb = (kbps + audio) * minutes * 60 / 8 / 1e3;
    return { kbps, mb };
  });
  const fits = rungs.filter((r) => r.mb <= target);
  const best = fits.length ? fits[fits.length - 1] : null;
  return {
    headline: best ? `Highest rung that fits ${target} MB over ${minutes} min: ${best.kbps} kbps (${n22(best.mb, 0)} MB with ${audio} kbps audio)` : `Nothing on the ladder fits ${target} MB \u2014 the smallest rung alone is ${n22(rungs[0].mb, 0)} MB`,
    ok: !!best,
    kpis: [
      { value: `${n22(rungs[0].mb, 0)}\u2013${n22(rungs[rungs.length - 1].mb, 0)} MB`, label: "ladder range" },
      { value: String(best?.kbps ?? rungs[0].kbps), label: "rung to ship" },
      { value: `${minutes} min`, label: "duration" }
    ],
    table: { head: ["Rung (kbps)", "Size (MB)", "Against the target"], rows: rungs.map((r) => [String(r.kbps), n22(r.mb, 0), r.mb <= target ? "fits" : "over"]) },
    lines: [
      `Audio is charged against every rung the same way \u2014 ${n22(audio * minutes * 60 / 8 / 1e3, 0)} MB of it \u2014 which is why dropping the video rung is not the same as dropping the size.`,
      "Size = bitrate \xD7 duration. It is exact arithmetic, and every streaming budget conversation is a variant of it."
    ],
    basis: `MB = (video kbps + audio kbps) \xD7 duration(seconds) \xF7 8 \xF7 1000. Variable-bitrate encodes land under this number on average and over it in busy scenes, so leave margin rather than budgeting to the byte.`
  };
}
function spendForecast(v) {
  const months = series(v, "months");
  const horizon = number(v, "horizon", 3);
  if (months.length < 2) {
    return {
      headline: "Give at least two months of spend \u2014 a trend needs two points",
      ok: false,
      basis: "Least-squares needs at least two observations; two is already a weak fit and the result says so."
    };
  }
  const n3 = months.length;
  const xs = months.map((_, i) => i + 1);
  const mx = xs.reduce((a, b) => a + b, 0) / n3;
  const my = months.reduce((a, b) => a + b, 0) / n3;
  const sxx = xs.reduce((s, x) => s + (x - mx) ** 2, 0);
  const sxy = xs.reduce((s, x, i) => s + (x - mx) * (months[i] - my), 0);
  const slope = sxx === 0 ? 0 : sxy / sxx;
  const intercept = my - slope * mx;
  const forecast = Array.from({ length: Math.max(1, Math.min(24, horizon)) }, (_, i) => n3 + i + 1).map((x) => ({
    x,
    y: intercept + slope * x
  }));
  const last = forecast[forecast.length - 1];
  return {
    headline: `${slope >= 0 ? "+" : ""}${n22(slope, 0)} per month on a ${n22(my, 0)} average \u2014 ${n22(last.y, 0)} expected in month ${last.x}`,
    ok: slope <= 0,
    kpis: [
      { value: n22(my, 0), label: "average" },
      { value: `${slope >= 0 ? "+" : ""}${n22(slope, 1)}`, label: "trend / month" },
      { value: n22(last.y, 0), label: `month ${last.x}` },
      { value: String(n3), label: "months observed" }
    ],
    table: {
      head: ["Month", "Observed", "Fitted"],
      rows: [
        ...months.map((m, i) => [String(i + 1), n22(m, 0), n22(intercept + slope * (i + 1), 0)]),
        ...forecast.map((f2) => [String(f2.x), "\u2014", n22(f2.y, 0)])
      ].slice(0, 14)
    },
    lines: [
      `Trend is ${slope >= 0 ? "upward" : "downward"} at ${n22(Math.abs(slope), 0)} per month across ${n3} months of evidence.`,
      n3 < 6 ? `${n3} months is a thin basis for a trend and the fit will chase whatever happened last \u2014 treat the projection as one scenario, not a budget.` : "The fit is a straight line through months that were probably not straight; use it as the trend, not as the plan."
    ],
    basis: `Ordinary least squares on month index: fitted = mean + slope \xD7 (x \u2212 mean x). A linear fit to spend is a statement that the recent past continues \u2014 it cannot see a contract ending, a migration finishing or a price change.`
  };
}
function anomalyZ(v) {
  const values = series(v, "values");
  const threshold = number(v, "z", 3);
  if (values.length < 4) {
    return {
      headline: "Give at least four observations \u2014 a mean and a spread need them",
      ok: false,
      basis: "A z-score compares each day with the mean and standard deviation of the rest; three points make both meaningless."
    };
  }
  const mean2 = values.reduce((a, b) => a + b, 0) / values.length;
  const sd = Math.sqrt(values.reduce((s, x) => s + (x - mean2) ** 2, 0) / (values.length - 1));
  const flagged = values.map((x, i) => ({ i: i + 1, x, z: sd === 0 ? 0 : (x - mean2) / sd })).filter((r) => Math.abs(r.z) >= threshold);
  return {
    headline: flagged.length === 0 ? `No day crosses ${threshold}\u03C3 against a mean of ${n22(mean2, 2)}` : `${flagged.length} day${flagged.length === 1 ? "" : "s"} cross ${threshold}\u03C3 \u2014 ${flagged.map((f2) => `day ${f2.i}`).join(", ")}`,
    ok: flagged.length === 0,
    kpis: [
      { value: n22(mean2, 2), label: "mean" },
      { value: n22(sd, 2), label: "std deviation" },
      { value: String(flagged.length), label: `\u2265 ${threshold}\u03C3` },
      { value: String(values.length), label: "days" }
    ],
    table: flagged.length ? { head: ["Day", "Value", "z"], rows: flagged.slice(0, 10).map((f2) => [String(f2.i), n22(f2.x, 2), n22(f2.z, 2)]) } : void 0,
    lines: [
      `Each flagged day sits at least ${threshold} standard deviations from the mean of the whole window.`,
      flagged.length ? "A single outlier inflates the mean and the spread together, which hides the next one. Re-run with the flagged day removed before deciding it is the only anomaly." : "No day is unusual against this window. That is a statement about the window, not about the bill."
    ],
    basis: `z = (x \u2212 mean) \xF7 sample standard deviation (n \u2212 1), flagged at |z| \u2265 ${threshold}. Daily spend is skewed and autocorrelated (weekends, batch jobs), so a normal-theory threshold is a screen for attention, not a verdict \u2014 and one outlier masks the next.`
  };
}
var INTELLIGENCE_TOOLS = Object.freeze([
  {
    id: "eval-interval",
    domain: "ml",
    label: "Evaluation interval",
    blurb: "The interval around an accuracy figure \u2014 never the score on its own.",
    fields: [
      num("n", "Examples evaluated", "500"),
      num("wins", "Correct outcomes", "431"),
      sel("conf", "Confidence", Object.keys(Z), "95%"),
      num("baseline", "Baseline to beat (%)", "80")
    ],
    run: evalInterval
  },
  {
    id: "split-audit",
    domain: "ml",
    label: "Split audit",
    blurb: "Check train/val/test proportions, duplicates and the grouping rule for leakage.",
    fields: [
      num("rows", "Corpus rows", "50000"),
      num("train", "Train (%)", "80"),
      num("val", "Validation (%)", "10"),
      num("test", "Test (%)", "10"),
      num("dupes", "Rows appearing in more than one split", "0"),
      sel("groups", "Split by group, not by row", ["yes", "no"], "yes")
    ],
    run: splitAudit
  },
  {
    id: "citation-lint",
    domain: "research",
    label: "Citation lint",
    blurb: "Which numeric claims carry no citation \u2014 the cheapest fault to fix before review.",
    fields: [
      area("text", "Draft", "Latency improved by 37% in the second run [3].\nCost fell to 12 per unit in March.\nThroughput reached 9,400 rpm (Iyer, 2024).")
    ],
    run: citationLint
  },
  {
    id: "rater-agreement",
    domain: "research",
    label: "Rater agreement",
    blurb: "Cohen's \u03BA beside the raw agreement, because chance agreement is not zero.",
    fields: [
      area(
        "pairs",
        "One item per line: rater A label, rater B label",
        "pass, pass\nfail, fail\npass, pass\nborderline, fail\nfail, fail\npass, pass\nborderline, borderline\nfail, fail"
      )
    ],
    run: raterAgreement
  },
  {
    id: "loudness-gain",
    domain: "media",
    label: "Loudness gain",
    blurb: "The gain to a target LUFS, and whether the limiter has to work for it.",
    fields: [
      num("measured", "Measured integrated loudness (LUFS)", "-9.4"),
      num("target", "Target (LUFS)", "-14"),
      num("peak", "Measured true peak (dBTP)", "-0.8"),
      num("ceiling", "Peak ceiling (dBTP)", "-1")
    ],
    run: loudnessGain
  },
  {
    id: "bitrate-budget",
    domain: "media",
    label: "Bitrate budget",
    blurb: "Which rung of an encoding ladder fits a size budget over the runtime.",
    fields: [
      num("minutes", "Duration (minutes)", "42"),
      num("target", "Size budget (MB)", "800"),
      num("audio", "Audio bitrate (kbps)", "128"),
      area("ladder", "Video rungs in kbps \u2014 one per line, or comma separated", "2000\n3000\n4500\n6000\n8000")
    ],
    run: bitrateBudget
  },
  {
    id: "spend-forecast",
    domain: "finops",
    label: "Spend forecast",
    blurb: "Trend and projection from the months you have, with the fit's honesty stated.",
    fields: [
      area("months", "Monthly spend \u2014 one per line", "18400\n19250\n18900\n21100\n22600\n23900"),
      num("horizon", "Months to project", "3")
    ],
    run: spendForecast
  },
  {
    id: "anomaly-z",
    domain: "finops",
    label: "Spend anomalies",
    blurb: "Days that sit far from their own window's mean, with the caveat attached.",
    fields: [
      area("values", "Spend per day \u2014 one per line", "410\n398\n425\n402\n418\n24000\n430\n415\n398\n440\n420\n405"),
      num("z", "Flag at |z| \u2265", "3")
    ],
    run: anomalyZ
  }
]);

// src/specialists/governance.ts
var n23 = (x, dp = 2) => x.toFixed(dp);
var day = 864e5;
var iso = (ms) => new Date(ms).toISOString().slice(0, 10);
var parseDate = (s) => {
  const m = s.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isFinite(t) ? t : null;
};
var VAGUE_DEFAULT = "reasonable efforts\nmaterial\npromptly\nas appropriate\nsole discretion\nfrom time to time\nsubstantially\nbest efforts";
function clauseLint(v) {
  const body = str(v, "text");
  const terms = rows(v, "terms").map((t) => t.toLowerCase()).filter(Boolean);
  const words = body.split(/\s+/).filter(Boolean).length;
  if (words === 0) {
    return {
      headline: "Nothing to read \u2014 paste the clause or the section",
      ok: false,
      basis: "A density needs text; the tool counts terms, it does not interpret clauses."
    };
  }
  const found = terms.map((t) => {
    const hits2 = (body.toLowerCase().match(new RegExp(`\\b${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "g")) ?? []).length;
    return { term: t, hits: hits2 };
  }).filter((f2) => f2.hits > 0).sort((a, b) => b.hits - a.hits);
  const total = found.reduce((s, f2) => s + f2.hits, 0);
  const perK = total / words * 1e3;
  return {
    headline: total === 0 ? "No vague terms from this list appear \u2014 the drafting is specific about obligations" : `${total} undefined term${total === 1 ? "" : "s"} across ${words.toLocaleString()} words (${n23(perK, 1)} per 1,000)`,
    ok: total === 0,
    kpis: [
      { value: String(total), label: "vague terms" },
      { value: n23(perK, 1), label: "per 1,000 words" },
      { value: String(found.length), label: "distinct terms" },
      { value: String(words), label: "words" }
    ],
    table: found.length ? { head: ["Term", "Occurrences"], rows: found.map((f2) => [f2.term, String(f2.hits)]) } : void 0,
    lines: [
      "Each hit is a word that will be argued about later unless the contract defines it. The tool does not know which of them matter \u2014 it points at all of them so the lawyer decides.",
      total > 0 ? `Highest count: \u201C${found[0].term}\u201D at ${found[0].hits}.` : "Nothing to rank."
    ],
    basis: "Mechanical word-boundary counts against a term list (yours, or the usual suspects). It neither parses clauses nor gives legal advice; a defined term appearing five times is fine, and an undefined one appearing once may be fatal."
  };
}
function dateTerms(v) {
  const start = parseDate(str(v, "start", "2026-04-01"));
  const months = number(v, "months", 12);
  const notice = number(v, "notice", 90);
  const renew = bool(v, "renew", true);
  if (start === null) {
    return {
      headline: "The effective date must be written as YYYY-MM-DD",
      ok: false,
      basis: "Date arithmetic here is calendar arithmetic on an unambiguous date; a locale-ambiguous date is refused rather than guessed."
    };
  }
  const addMonths = (ms, m) => {
    const d = new Date(ms);
    const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + m, 1));
    const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
    return Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), Math.min(d.getUTCDate(), lastDay));
  };
  const expiry = addMonths(start, months);
  const lastNotice = expiry - notice * day;
  const today = Date.UTC(2026, 8, 22);
  const daysToNotice = Math.round((lastNotice - today) / day);
  return {
    headline: daysToNotice < 0 ? `The notice window closed ${Math.abs(daysToNotice)} days ago on the dates as typed` : `${daysToNotice} days remain to serve notice \u2014 last day ${iso(lastNotice)}`,
    ok: daysToNotice >= 0,
    kpis: [
      { value: iso(start), label: "effective" },
      { value: iso(expiry), label: `expiry (+${months}m)` },
      { value: iso(lastNotice), label: `notice (${notice}d)` },
      { value: String(daysToNotice), label: "days to decide" }
    ],
    table: {
      head: ["Milestone", "Date", "From"],
      rows: [
        ["Effective", iso(start), "as declared"],
        ["Expiry", iso(expiry), `+${months} months, day-clamped`],
        ["Last day to notice", iso(lastNotice), `expiry \u2212 ${notice} days`],
        ["Renewal decision", iso(lastNotice), renew ? "auto-renew unless notice served" : "no auto-renew clause assumed"]
      ]
    },
    lines: [
      `Adding ${months} months clamps an end-of-month day to the target month's last day (31 Jan + 1 month = 28/29 Feb). That is the common intent and it is not the only convention \u2014 the other one carries into the next month.`,
      `Calendar days are used throughout. A contract counting BUSINESS days needs a holiday calendar, which this tool does not have and will not invent.`
    ],
    basis: "Calendar arithmetic in UTC: expiry = effective + term (day-clamped), last notice day = expiry \u2212 notice period. Whether the boundary day counts inclusive or exclusive is a drafting question this tool surfaces rather than decides."
  };
}
var PII = [
  { name: "email address", re: /[\w.+-]+@[\w-]+\.[\w.-]{2,}/g, note: "pattern" },
  { name: "phone (international)", re: /\+\d[\d\s\-()]{7,}\d/g, note: "pattern" },
  { name: "national tax id (5 letters, 4 digits, 1 letter)", re: /\b[A-Z]{5}\d{4}[A-Z]\b/g, note: "pattern + 4th-character holder type" },
  { name: "national-id-shaped 12 digits", re: /\b\d{4}\s?\d{4}\s?\d{4}\b/g, note: "shape only \u2014 not checksum-verified" },
  { name: "card-shaped number", re: /\b(?:\d[ -]?){13,19}\b/g, note: "shape + Luhn checked below" },
  { name: "IPv4 address", re: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g, note: "pattern" },
  { name: "date of birth (ISO)", re: /\b(?:19|20)\d{2}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])\b/g, note: "pattern \u2014 a date is PII only in context" }
];
function luhn(digits) {
  const d = digits.replace(/\D/g, "");
  if (d.length < 13 || d.length > 19) return false;
  let sum = 0, alt = false;
  for (let i = d.length - 1; i >= 0; i -= 1) {
    let x = Number(d[i]);
    if (alt) {
      x *= 2;
      if (x > 9) x -= 9;
    }
    sum += x;
    alt = !alt;
  }
  return sum % 10 === 0;
}
var mask = (s) => s.length <= 4 ? "\u2022".repeat(s.length) : `${s.slice(0, 2)}${"\u2022".repeat(Math.min(10, s.length - 4))}${s.slice(-2)}`;
function piiScan(v) {
  const body = str(v, "text");
  if (!body.trim()) {
    return {
      headline: "Nothing to scan \u2014 paste a sample or a document body",
      ok: false,
      basis: "The scan reports pattern classes present in text you supply. It never sends the text anywhere."
    };
  }
  const found = PII.map((p) => {
    const hits2 = body.match(p.re) ?? [];
    const verified = p.name === "card-shaped number" ? hits2.filter(luhn) : hits2;
    return { ...p, hits: verified };
  }).filter((f2) => f2.hits.length > 0);
  const total = found.reduce((s, f2) => s + f2.hits.length, 0);
  const table = found.map((f2) => [f2.name, String(f2.hits.length), f2.note, f2.hits.slice(0, 2).map(mask).join(" \xB7 ")]);
  return {
    headline: total === 0 ? "No personal-data patterns of these classes appear in the text" : `${total} personal-data pattern${total === 1 ? "" : "s"} across ${found.length} class${found.length === 1 ? "" : "es"}`,
    ok: total === 0,
    kpis: [
      { value: String(total), label: "matches" },
      { value: String(found.length), label: "classes" },
      { value: body.length.toLocaleString(), label: "characters read" }
    ],
    table: table.length ? { head: ["Class", "Count", "Basis", "Masked sample"], rows: table } : void 0,
    lines: [
      "Every sample in the table is masked: the first and last characters only, never the value.",
      total > 0 ? "A match is a shape, not a finding. A 12-digit number may be an invoice; a date may be a delivery date. What the scan establishes is that the text needs a classification decision by a human before it is copied anywhere." : "Clean against these patterns \u2014 which is not the same as clean. Names, addresses and free-text identifiers have no regex, and this tool will not pretend to one."
    ],
    basis: "Pattern classes with published shapes (email, E.164-ish phone, PAN's mask, ISO dates) plus a Luhn checksum for card-shaped digits. Card shapes are only counted when Luhn passes; Aadhaar shapes are counted on shape alone and labelled as such. Nothing is transmitted; the scan runs on this machine."
  };
}
function retentionClock(v) {
  const today = parseDate(str(v, "today", "2026-09-22"));
  const listed = rows(v, "items").map((line) => {
    const [category, created, days] = line.split(/[,=]/).map((x) => (x ?? "").trim());
    const c = parseDate(created ?? "");
    const d = Number(days);
    return c === null || !Number.isFinite(d) ? null : { category: category || "item", created: c, days: d };
  }).filter((x) => x !== null);
  if (today === null || listed.length === 0) {
    return {
      headline: "Give the reference date (YYYY-MM-DD) and rows of `category, created, retention days`",
      ok: false,
      basis: "A retention clock is creation date plus retention period, measured against a stated reference date."
    };
  }
  const table = listed.map((it) => {
    const expiry = it.created + it.days * day;
    const left = Math.round((expiry - today) / day);
    return { it, expiry, left };
  }).sort((a, b) => a.left - b.left);
  const overdue = table.filter((t) => t.left < 0).length;
  const soon = table.filter((t) => t.left >= 0 && t.left <= 30).length;
  return {
    headline: overdue > 0 ? `${overdue} categor${overdue === 1 ? "y is" : "ies are"} past their retention date` : `Nothing overdue \u2014 ${soon} categor${soon === 1 ? "y falls" : "ies fall"} due within 30 days`,
    ok: overdue === 0,
    kpis: [
      { value: String(table.length), label: "categories" },
      { value: String(overdue), label: "overdue" },
      { value: String(soon), label: "due \u2264 30 days" },
      { value: iso(today), label: "as at" }
    ],
    table: {
      head: ["Category", "Created", "Retention", "Expires", "Days"],
      rows: table.map((t) => [t.it.category, iso(t.it.created), `${t.it.days}d`, iso(t.expiry), (t.left < 0 ? "" : "+") + String(t.left)])
    },
    lines: [
      "Retention is stated as a period from creation, which is the shape most policies are written in. A policy written from LAST ACTIVITY needs the activity date, not the creation date \u2014 the two clocks differ and the difference is usually the whole argument.",
      overdue > 0 ? "An overdue category is a deletion that policy says should already have happened; whether it can happen is a legal holdup question this tool does not answer." : "No category is past its date."
    ],
    basis: "expiry = created + retention days; days remaining = expiry \u2212 reference date. Plain calendar arithmetic, no business-day adjustment, no legal-hold awareness."
  };
}
function headcountModel(v) {
  const current = number(v, "current", 40);
  const hires = number(v, "hires", 3);
  const attrition = number(v, "attrition", 1.5);
  const months = Math.max(1, Math.min(36, number(v, "months", 12)));
  if (current <= 0) {
    return { headline: "Headcount must be greater than zero", ok: false, basis: "Recurrence modelling needs a starting population." };
  }
  const a = attrition / 100;
  let h = current;
  const rowsOut = [];
  for (let m = 1; m <= months; m += 1) {
    const leavers = h * a;
    h = h - leavers + hires;
    if (m <= 6 || m === months) rowsOut.push([String(m), n23(leavers, 1), String(hires), n23(h, 1)]);
  }
  const net = h - current;
  return {
    headline: `${current} \u2192 ${n23(h, 1)} over ${months} months at ${hires} hires and ${attrition}% monthly attrition`,
    ok: net >= 0,
    kpis: [
      { value: `${net >= 0 ? "+" : ""}${n23(net, 1)}`, label: "net change" },
      { value: n23(h, 1), label: `month ${months}` },
      { value: String(hires * months), label: "hires made" },
      { value: n23(current * a * months, 1), label: "approximate leavers" }
    ],
    table: { head: ["Month", "Leavers", "Hires", "Headcount"], rows: rowsOut },
    lines: [
      `Attrition is charged monthly against the headcount that exists, not the one you planned \u2014 which is why a flat hiring plan still curves downward as the base grows.`,
      net < 0 ? "This plan shrinks the team. If that is not the intent, the hire rate has to rise before attrition compounds, not after." : "The plan grows the team while replacing its own losses."
    ],
    basis: "h(m+1) = h(m) \xD7 (1 \u2212 attrition%) + hires, monthly. Attrition is the rate you typed, applied uniformly \u2014 real attrition clusters in cohorts (new joiners, post-review periods), so treat the curve as a centre line."
  };
}
function compBand(v) {
  const min = number(v, "min", 18e5);
  const mid = number(v, "mid", 24e5);
  const max = number(v, "max", 32e5);
  const offer = number(v, "offer", 252e4);
  if (!(min < mid && mid < max)) {
    return {
      headline: "A band runs min < mid < max \u2014 check these three",
      ok: false,
      basis: "Position in band needs a well-formed band; a malformed one is refused rather than normalised."
    };
  }
  const inBand = offer >= min && offer <= max;
  const position = (offer - min) / (max - min) * 100;
  const compa = offer / mid * 100;
  return {
    headline: inBand ? `The offer sits at ${n23(position, 1)}% of the band \u2014 compa-ratio ${n23(compa, 1)}` : offer < min ? `The offer is below the band minimum by ${n23(min - offer, 0)}` : `The offer is above the band maximum by ${n23(offer - max, 0)}`,
    ok: inBand,
    kpis: [
      { value: `${n23(position, 1)}%`, label: "position in band" },
      { value: n23(compa, 1), label: "compa-ratio" },
      { value: inBand ? "within band" : "outside band", label: "fit" }
    ],
    table: {
      head: ["Point", "Value", "Offer vs point"],
      rows: [
        ["Minimum", min.toLocaleString("en-IN"), `${n23((offer - min) / min * 100, 1)}%`],
        ["Midpoint", mid.toLocaleString("en-IN"), `${n23(compa - 100, 1)}%`],
        ["Maximum", max.toLocaleString("en-IN"), `${n23((offer - max) / max * 100, 1)}%`]
      ]
    },
    lines: [
      "Position in band is cumulative and compa-ratio is relative to the midpoint; they answer different questions and a band review asked for one is not answered by the other.",
      inBand ? "Within the band. Whether it is FAIR within the band is a policy question \u2014 the arithmetic cannot see the peers." : "Outside the band: that is an exception path, not a compa-ratio discussion."
    ],
    basis: "compa-ratio = offer \xF7 midpoint \xD7 100; position = (offer \u2212 min) \xF7 (max \u2212 min) \xD7 100. Both are standard. Neither accounts for tenure, location differentials or equity \u2014 the tool reports position, not fairness, and it will not guess at either."
  };
}
function pipelineCoverage(v) {
  const quota = number(v, "quota", 12e6);
  const target = number(v, "coverage", 3.5);
  const listed = rows(v, "pipeline").map((line) => {
    const [stage, value, win] = line.split(/[,=]/).map((x) => (x ?? "").trim());
    return { stage: stage || "stage", value: Number(String(value).replace(/[,\s₹]/g, "")), win: Number(win) };
  }).filter((s) => Number.isFinite(s.value) && Number.isFinite(s.win) && s.value > 0);
  if (listed.length === 0 || quota <= 0) {
    return {
      headline: "Give a quota and rows of `stage, value, win rate %`",
      ok: false,
      basis: "Coverage is weighted pipeline against the quota it has to cover."
    };
  }
  const weighted = listed.reduce((s, x) => s + x.value * x.win / 100, 0);
  const raw = listed.reduce((s, x) => s + x.value, 0);
  const coverage = weighted / quota;
  const gap = Math.max(0, quota - weighted);
  const needed = gap > 0 ? gap / (weighted / raw || 1) : 0;
  return {
    headline: coverage >= target ? `Weighted coverage ${n23(coverage, 2)}\xD7 against a ${target}\xD7 convention \u2014 ${n23(weighted, 0)} of ${n23(quota, 0)}` : `Weighted coverage ${n23(coverage, 2)}\xD7 is under the ${target}\xD7 convention \u2014 ${n23(gap, 0)} short`,
    ok: coverage >= target,
    kpis: [
      { value: n23(weighted, 0), label: "weighted pipeline" },
      { value: `${n23(coverage, 2)}\xD7`, label: "coverage" },
      { value: gap > 0 ? n23(gap, 0) : "met", label: "weighted gap" },
      { value: n23(raw, 0), label: "raw pipeline" }
    ],
    table: {
      head: ["Stage", "Value", "Win rate", "Weighted"],
      rows: listed.map((x) => [x.stage, n23(x.value, 0), `${x.win}%`, n23(x.value * x.win / 100, 0)])
    },
    lines: [
      `Raw pipeline is ${n23(raw / quota, 2)}\xD7 the quota; the win rates take it to ${n23(coverage, 2)}\xD7. The gap between those two numbers is the entire reason coverage is weighted.`,
      gap > 0 ? `To close it with this stage mix you need roughly ${n23(needed, 0)} of additional raw pipeline \u2014 or a higher win rate on what exists, which is not arithmetic.` : "Coverage meets the convention. Whether the win rates themselves are honest is a separate question, and the one worth asking next."
    ],
    basis: "weighted = \u03A3 value \xD7 win rate; coverage = weighted \xF7 quota. The 3\u20134\xD7 convention quoted on the surface is a habit, not a law \u2014 the number that matters is whether the win rates came from closed history or from optimism."
  };
}
function slaClock(v) {
  const targets2 = { P1: 1, P2: 4, P3: 24, P4: 72 };
  const listed = rows(v, "tickets").map((line) => {
    const [id, priority, opened, responded] = line.split(/[,=]/).map((x) => (x ?? "").trim());
    const t0 = opened ? Date.parse(opened) : NaN;
    const t1 = responded ? Date.parse(responded) : NaN;
    return { id: id || "ticket", priority: priority || "P3", t0, t1 };
  }).filter((t) => Number.isFinite(t.t0));
  if (listed.length === 0) {
    return {
      headline: "Give rows of `id, priority, opened, first response` (ISO timestamps)",
      ok: false,
      basis: "The clock needs an opening time and a first-response time per ticket."
    };
  }
  const table = listed.map((t) => {
    const hours = Number.isFinite(t.t1) ? (t.t1 - t.t0) / 36e5 : null;
    const limit = targets2[t.priority] ?? 24;
    const breach = hours === null ? true : hours > limit;
    return [t.id, t.priority, hours === null ? "no response" : `${n23(hours, 2)}h`, `${limit}h`, breach ? hours === null ? "open, past target" : "breached" : "met"];
  });
  const breaches = table.filter((r) => r[4] !== "met").length;
  return {
    headline: breaches === 0 ? `All ${table.length} tickets responded inside their target` : `${breaches} of ${table.length} tickets missed their first-response target`,
    ok: breaches === 0,
    kpis: [
      { value: String(table.length), label: "tickets" },
      { value: String(breaches), label: "breached" },
      { value: `${n23((table.length - breaches) / table.length * 100, 1)}%`, label: "attainment" }
    ],
    table: { head: ["Ticket", "Priority", "First response", "Target", "Verdict"], rows: table },
    lines: [
      "Targets applied: P1 1h, P2 4h, P3 24h, P4 72h \u2014 the common shape, and yours may differ; change the priorities and the verdicts follow.",
      "Wall-clock hours. A contract measuring business hours needs a calendar and a holiday list, neither of which this tool invents."
    ],
    basis: "first response = responded \u2212 opened, compared with the target for the priority. Timestamps are read as ISO; a ticket with no response is treated as still inside (or past) the clock, never as met."
  };
}
var GOVERNANCE_TOOLS = Object.freeze([
  {
    id: "clause-lint",
    domain: "legal",
    label: "Clause terms",
    blurb: "Density of undefined terms a contract will be argued over later.",
    fields: [
      area("text", "Clause or section", "The Supplier shall use reasonable efforts to deliver promptly, and may in its sole discretion vary the scope from time to time. Material changes require approval."),
      area("terms", "Terms to count \u2014 one per line", VAGUE_DEFAULT)
    ],
    run: clauseLint
  },
  {
    id: "date-terms",
    domain: "legal",
    label: "Contract dates",
    blurb: "Expiry and the last day to serve notice, from the term and notice period.",
    fields: [
      text("start", "Effective date (YYYY-MM-DD)", "2026-04-01"),
      num("months", "Term (months)", "12"),
      num("notice", "Notice period (days)", "90"),
      flag("renew", "Auto-renew unless notice is served", true)
    ],
    run: dateTerms
  },
  {
    id: "pii-scan",
    domain: "privacy",
    label: "Personal-data scan",
    blurb: "Pattern classes present in a text, every sample masked, nothing transmitted.",
    fields: [
      area("text", "Text to scan", "Contact: priya.raman@example.in, +91 98400 12345.\nCard 4111 1111 1111 1111 was refunded.\nPAN AAFPU0939F on file. Order ref 2026-05-14.")
    ],
    run: piiScan
  },
  {
    id: "retention-clock",
    domain: "privacy",
    label: "Retention clock",
    blurb: "What has passed its retention date, and what falls due in the next 30 days.",
    fields: [
      text("today", "Reference date (YYYY-MM-DD)", "2026-09-22"),
      area(
        "items",
        "Rows of `category, created, retention days`",
        "support tickets, 2024-03-11, 730\nmarketing leads, 2023-01-04, 365\ninvoices, 2021-06-30, 2920\naccess logs, 2026-08-01, 90"
      )
    ],
    run: retentionClock
  },
  {
    id: "headcount-model",
    domain: "people",
    label: "Headcount model",
    blurb: "What a hiring plan actually does once attrition compounds against it.",
    fields: [
      num("current", "Headcount today", "40"),
      num("hires", "Hires per month", "3"),
      num("attrition", "Monthly attrition (%)", "1.5"),
      num("months", "Months to project", "12")
    ],
    run: headcountModel
  },
  {
    id: "comp-band",
    domain: "people",
    label: "Band position",
    blurb: "Where an offer sits in a band, as position and as compa-ratio.",
    fields: [
      num("min", "Band minimum", "1800000"),
      num("mid", "Band midpoint", "2400000"),
      num("max", "Band maximum", "3200000"),
      num("offer", "Offer", "2520000")
    ],
    run: compBand
  },
  {
    id: "pipeline-coverage",
    domain: "revenue",
    label: "Pipeline coverage",
    blurb: "Stage-weighted pipeline against the quota it has to cover.",
    fields: [
      num("quota", "Quota", "12000000"),
      num("coverage", "Coverage convention (\xD7)", "3.5"),
      area(
        "pipeline",
        "Rows of `stage, value, win rate %`",
        "discovery, 14000000, 15\nproposal, 9000000, 40\nnegotiation, 4200000, 65\nverbal, 1600000, 85"
      )
    ],
    run: pipelineCoverage
  },
  {
    id: "sla-clock",
    domain: "revenue",
    label: "SLA clock",
    blurb: "First response against priority targets, ticket by ticket.",
    fields: [
      area(
        "tickets",
        "Rows of `id, priority, opened, first response` (ISO)",
        "T-1041, P1, 2026-09-20T09:12:00Z, 2026-09-20T09:48:00Z\nT-1042, P2, 2026-09-20T11:00:00Z, 2026-09-20T16:30:00Z\nT-1043, P3, 2026-09-19T08:00:00Z, 2026-09-19T20:15:00Z\nT-1044, P2, 2026-09-21T07:30:00Z, "
      )
    ],
    run: slaClock
  }
]);

// src/specialists/commerce.ts
var n24 = (x, dp = 2) => x.toFixed(dp);
var money = (x, dp = 2) => x.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp });
function metaLint(v) {
  const title = str(v, "title");
  const desc = str(v, "desc");
  const slug = str(v, "slug");
  if (!title.trim() && !desc.trim()) {
    return {
      headline: "Nothing to lint \u2014 give a title, a description or a slug",
      ok: false,
      basis: "Display limits are counted from the strings you paste; there is nothing to count otherwise."
    };
  }
  const TITLE_MAX = 60, DESC_MAX = 155, SLUG_MAX = 75;
  const stop = /* @__PURE__ */ new Set(["a", "an", "the", "and", "or", "of", "for", "to", "in", "on", "with", "is", "are", "be", "by", "at", "from"]);
  const slugWords = slug.split("-").map((w) => w.trim()).filter(Boolean);
  const filler = slugWords.filter((w) => stop.has(w.toLowerCase()));
  const checks = [
    ["Title", `${title.length} chars (limit ${TITLE_MAX})`, title.length > 0 && title.length <= TITLE_MAX],
    ["Description", `${desc.length} chars (limit ${DESC_MAX})`, desc.length > 0 && desc.length <= DESC_MAX],
    ["Slug", `${slugWords.length} segments (limit ${SLUG_MAX} chars)`, slug.length > 0 && slug.length <= SLUG_MAX]
  ];
  const failing = checks.filter((c) => !c[2]).length;
  return {
    headline: failing === 0 ? "Title, description and slug all sit inside their display limits" : `${failing} field${failing === 1 ? "" : "s"} would be truncated or is empty`,
    ok: failing === 0 && filler.length === 0,
    kpis: [
      { value: `${title.length}/${TITLE_MAX}`, label: "title" },
      { value: `${desc.length}/${DESC_MAX}`, label: "description" },
      { value: String(slugWords.length), label: "slug segments" },
      { value: String(filler.length), label: "filler words" }
    ],
    table: { head: ["Field", "Measured", "Verdict"], rows: checks.map(([f2, m, ok2]) => [f2, m, ok2 ? "within" : "over or empty"]) },
    lines: [
      "Search engines truncate by rendered width, not by character count, so these limits are the conventional proxies \u2014 a title of 58 wide characters can still be cut and one of 62 narrow ones can survive intact.",
      filler.length ? `Slug filler words to drop: ${filler.join(", ")}. They cost width and match nothing.` : "The slug carries no filler words; every segment is earning its place."
    ],
    basis: `Character counts against the commonly cited display limits (title ~60, description ~155) \u2014 conventions derived from pixel widths, not published maxima. Slug hygiene is a stop-word check, which is a style rule, not a ranking factor this tool can measure.`
  };
}
function crawlBudget(v) {
  const pages = number(v, "pages", 25e4);
  const latency = number(v, "latency", 320);
  const rate = number(v, "rate", 5);
  const window_ = number(v, "window", 10);
  if (pages <= 0 || rate <= 0) {
    return {
      headline: "Pages and crawl rate must both be greater than zero",
      ok: false,
      basis: "Crawl time is pages \xD7 latency \xF7 concurrency, bounded by the rate the server allows."
    };
  }
  const parallelizable = Math.max(1, Math.floor(window_ * 1e3 / latency));
  const effective = Math.min(rate, parallelizable);
  const seconds = pages * latency / 1e3 / effective;
  const hours = seconds / 3600;
  const days = hours / 24;
  const limited = parallelizable < rate;
  return {
    headline: `About ${n24(days, 1)} days to crawl ${pages.toLocaleString()} pages at ${effective.toFixed(1)} req/s`,
    ok: days <= 30,
    kpis: [
      { value: n24(hours, 1), label: "hours" },
      { value: n24(days, 1), label: "days" },
      { value: String(effective.toFixed(1)), label: "effective req/s" },
      { value: String(parallelizable), label: "parallel slots" }
    ],
    table: {
      head: ["Limit", "Value", "Binds?"],
      rows: [
        ["Robots/Crawl-delay rate", `${rate} req/s`, limited ? "no" : "yes"],
        ["Client parallelism", `${parallelizable} in flight`, limited ? "yes" : "no"],
        ["Latency", `${latency} ms`, "always"]
      ]
    },
    lines: [
      limited ? `The client can hold ${parallelizable} requests in flight but each takes ${latency} ms, so parallelism \u2014 not the rate limit \u2014 is what bounds this crawl. More workers would help.` : `The rate the server allows (${rate} req/s) is the binding constraint; more client parallelism would change nothing.`,
      `Crawl rate is also a politeness question, and politeness is a decision, not a calculation: this tells you what the current numbers imply, not what the site deserves.`
    ],
    basis: `time = pages \xD7 latency \xF7 effective concurrency, where effective = min(declared rate, floor(window \xF7 latency)). It is throughput arithmetic; it ignores server-side variability, redirects and the pages a crawl discovers only by crawling.`
  };
}
function localeCoverage(v) {
  const base = number(v, "base", 4200);
  const threshold = number(v, "threshold", 98);
  const listed = rows(v, "locales").map((line) => {
    const [locale, done, todo] = line.split(/[,=]/).map((x) => (x ?? "").trim());
    const d = Number(String(done).replace(/[,\s]/g, ""));
    const t = Number(String(todo).replace(/[,\s]/g, ""));
    return { locale: locale || "??", done: Number.isFinite(d) ? d : 0, todo: Number.isFinite(t) ? t : 0 };
  });
  if (base <= 0 || listed.length === 0) {
    return {
      headline: "Give the key count and rows of `locale, translated, missing`",
      ok: false,
      basis: "Coverage is translated keys over the base key count."
    };
  }
  const table = listed.map((l) => {
    const pct2 = l.done / base * 100;
    return [l.locale, String(l.done), String(l.todo), `${n24(pct2, 1)}%`, pct2 >= threshold ? "shippable" : "below the bar"];
  });
  const worst = listed.reduce((a, b) => a.done / base <= b.done / base ? a : b);
  const shipping = table.filter((r) => r[4] === "shippable").length;
  return {
    headline: shipping === listed.length ? `All ${listed.length} locales are at or above ${threshold}% of the ${base.toLocaleString()} keys` : `${listed.length - shipping} of ${listed.length} locales sit below ${threshold}% \u2014 worst is ${worst.locale}`,
    ok: shipping === listed.length,
    kpis: [
      { value: String(base.toLocaleString()), label: "base keys" },
      { value: String(listed.length), label: "locales" },
      { value: `${n24(worst.done / base * 100, 1)}%`, label: `worst (${worst.locale})` },
      { value: `${threshold}%`, label: "bar" }
    ],
    table: { head: ["Locale", "Translated", "Missing", "Coverage", "Verdict"], rows: table },
    lines: [
      "Coverage is a count of keys present, not of sentences that read well. A locale at 99% with the wrong 1% missing \u2014 checkout, errors, consent \u2014 is a worse product than one at 95% with the gaps in a helping page.",
      "Missing keys fall back to the base language at runtime, which is why partial coverage looks shipable until a user hits the gap."
    ],
    basis: `coverage = translated \xF7 base keys \xD7 100, compared with the threshold you declare. It counts what exists in the catalogue; it cannot see whether a translated string is correct, or whether it is the string that was there yesterday.`
  };
}
var EXPANSION = {
  "German (de)": [1.2, 1.35],
  "French (fr)": [1.15, 1.25],
  "Spanish (es)": [1.15, 1.25],
  "Russian (ru)": [1.15, 1.3],
  "Portuguese (pt)": [1.15, 1.25],
  "Italian (it)": [1.1, 1.2],
  "Hindi (hi)": [1, 1.2],
  "Tamil (ta)": [1, 1.25],
  "Japanese (ja)": [0.8, 0.95],
  "Chinese, simplified (zh-Hans)": [0.75, 0.9],
  "Korean (ko)": [0.8, 0.95],
  "Arabic (ar)": [0.9, 1.15]
};
function stringExpansion(v) {
  const source = str(v, "source");
  const locale = str(v, "locale", "German (de)");
  const budget2 = number(v, "budget", 0);
  const range = EXPANSION[locale] ?? [1.15, 1.3];
  const len = source.length;
  const low = Math.ceil(len * range[0]), high = Math.ceil(len * range[1]);
  const over = budget2 > 0 && high > budget2;
  const table = [];
  if (budget2 > 0) {
    table.push(...EXPANSION[locale] ? [[locale, `${low}\u2013${high} chars`, String(budget2), over ? "may overflow" : "fits at the top of the range"]] : []);
  }
  return {
    headline: over ? `\u201C${source.slice(0, 42)}${source.length > 42 ? "\u2026" : ""}\u201D grows to ${low}\u2013${high} characters \u2014 past the ${budget2}-character budget` : `${len} characters becomes roughly ${low}\u2013${high} in ${locale}`,
    ok: !over,
    kpis: [
      { value: String(len), label: "source chars" },
      { value: `${low}\u2013${high}`, label: "translated chars" },
      { value: budget2 > 0 ? String(budget2) : "\u2014", label: "budget" },
      { value: `${n24(range[0], 2)}\u2013${n24(range[1], 2)}\xD7`, label: "factor used" }
    ],
    table: table.length ? { head: ["Locale", "Expected length", "Budget", "Verdict"], rows: table } : void 0,
    lines: [
      `The factor for ${locale} is a published planning range (${n24(range[0], 2)}\u2013${n24(range[1], 2)}\xD7), not a measurement of your string. Short strings expand more than long ones in percentage terms, which is exactly where buttons and tabs live.`,
      over ? "Design to the top of the range or the layout will break on real translations: fixed-width buttons are the usual casualty." : "The top of the range fits the declared budget."
    ],
    basis: `expected length = source length \xD7 the published expansion range for the target locale; expansion ranges are industry planning factors (from localisation practice), not measurements of a specific string. Programming languages with wide glyphs and locales without case add their own constraints this does not model.`
  };
}
function eoq(v) {
  const demand = number(v, "demand", 24e3);
  const orderCost = number(v, "order", 450);
  const holding = number(v, "holding", 12);
  if (demand <= 0 || orderCost <= 0 || holding <= 0) {
    return {
      headline: "Demand, order cost and holding cost must all be positive",
      ok: false,
      basis: "The economic order quantity is a square root of a ratio; a zero anywhere makes it meaningless."
    };
  }
  const q = Math.sqrt(2 * demand * orderCost / holding);
  const orders = demand / q;
  const cycle = 365 / orders;
  const ordering = orders * orderCost;
  const carrying = q / 2 * holding;
  return {
    headline: `Order ${n24(q, 0)} units, ${n24(orders, 1)} times a year (every ${n24(cycle, 1)} days)`,
    ok: true,
    kpis: [
      { value: n24(q, 0), label: "order quantity" },
      { value: n24(orders, 1), label: "orders / year" },
      { value: `${n24(cycle, 1)}d`, label: "cycle" },
      { value: money(ordering + carrying, 0), label: "total annual cost" }
    ],
    table: {
      head: ["Component", "Formula", "Annual cost"],
      rows: [
        ["Ordering", `(${demand} \xF7 ${n24(q, 0)}) \xD7 ${orderCost}`, money(ordering, 0)],
        ["Holding", `(${n24(q, 0)} \xF7 2) \xD7 ${holding}`, money(carrying, 0)],
        ["Total", "EOQ minimises the sum of the two", money(ordering + carrying, 0)]
      ]
    },
    lines: [
      "At the EOQ the ordering cost and the holding cost are equal \u2014 that is the property the formula is built to produce, and it is a useful sanity check on any number you compute by hand.",
      "The model assumes demand is smooth and lead time is known. Real demand is neither, which is what the safety-stock tool is for."
    ],
    basis: "Wilson's EOQ: Q* = \u221A(2DS \xF7 H), yearly cycles = D \xF7 Q*, cycle days = 365 \xF7 cycles. Classic inventory theory: it assumes constant demand, instantaneous replenishment and no quantity discounts. A supplier's price break usually beats the formula, deliberately."
  };
}
var SERVICE_Z = { "90%": 1.2816, "95%": 1.6449, "97.5%": 1.96, "99%": 2.3263, "99.9%": 3.0902 };
function safetyStock(v) {
  const mean2 = number(v, "mean", 180);
  const sd = number(v, "sd", 42);
  const lead = number(v, "lead", 9);
  const service = str(v, "service", "95%");
  const z = SERVICE_Z[service] ?? 1.6449;
  if (mean2 <= 0 || sd < 0 || lead <= 0) {
    return {
      headline: "Daily demand, its spread and the lead time must make sense",
      ok: false,
      basis: "Safety stock is a quantile of demand over the lead time; it needs a mean, a spread and a duration."
    };
  }
  const ss2 = z * sd * Math.sqrt(lead);
  const rop = mean2 * lead + ss2;
  return {
    headline: `Hold ${n24(ss2, 0)} units of safety stock \u2014 reorder at ${n24(rop, 0)}`,
    ok: true,
    kpis: [
      { value: n24(ss2, 0), label: "safety stock" },
      { value: n24(rop, 0), label: "reorder point" },
      { value: n24(mean2 * lead, 0), label: "lead-time demand" },
      { value: n24(z, 4), label: `z at ${service}` }
    ],
    table: {
      head: ["Service level", "z", "Safety stock"],
      rows: Object.entries(SERVICE_Z).map(([lvl, zz]) => [lvl, n24(zz, 4), n24(zz * sd * Math.sqrt(lead), 0)])
    },
    lines: [
      `Safety stock is the extra above average demand over the lead time; here that average is ${n24(mean2 * lead, 0)} units, so the reorder point is the sum of the two.`,
      `Raising the service level from 95% to 99% costs ${n24((2.3263 * sd * Math.sqrt(lead) / (z * sd * Math.sqrt(lead)) - 1) * 100, 0)}% more stock for the last ${n24(99 - 95, 0)} points \u2014 the tail is where the money is, and it is usually worth asking whether it is worth it.`
    ],
    basis: `SS = z \xD7 \u03C3_daily \xD7 \u221Aleadtime, ROP = mean demand \xD7 lead time + SS. It assumes demand is normally distributed and independent day to day \u2014 a normal approximation \u2014 and covers demand variability only. Supplier lead-time variability usually matters more and is a separate term.`
  };
}
function gasPlan(v) {
  const units = number(v, "units", 145e3);
  const base = number(v, "base", 18);
  const priority = number(v, "priority", 1.5);
  const eth = number(v, "eth", 3200);
  const ops = number(v, "ops", 250);
  const perOpGwei = units * (base + priority);
  const perOpEth = perOpGwei * 1e-9;
  const perOpUsd = perOpEth * eth;
  const totalUsd = perOpUsd * ops;
  return {
    headline: `${money(perOpUsd, 2)} per operation \u2014 ${money(totalUsd, 2)} for ${ops.toLocaleString()}`,
    ok: totalUsd < 1e3,
    kpis: [
      { value: `${money(perOpGwei / 1e9, 6)} ETH`, label: "gas per op" },
      { value: `${((base + priority) / base).toFixed(2)}\xD7`, label: "priority uplift" },
      { value: money(perOpUsd, 2), label: "per operation" },
      { value: money(totalUsd, 2), label: "for the batch" }
    ],
    table: {
      head: ["Component", "Gwei", "Share"],
      rows: [
        ["Base fee", n24(base * units / 1e9, 6), `${n24(base / (base + priority) * 100, 1)}%`],
        ["Priority fee", n24(priority * units / 1e9, 6), `${n24(priority / (base + priority) * 100, 1)}%`],
        ["Total per operation", n24(perOpGwei / 1e9, 6), "100%"]
      ]
    },
    lines: [
      `The priority fee is ${n24(priority / (base + priority) * 100, 1)}% of what you pay. On a congested chain that share rises sharply while the base fee also moves \u2014 which is why a budget built on today's base fee does not survive a busy week.`,
      `Base fees change per block; this is a point-in-time estimate from the two figures you entered, not a quoted fee.`
    ],
    basis: `cost = gas units \xD7 (base fee + priority fee) in gwei \xD7 1e-9 ETH per gwei \xD7 price per ETH. EIP-1559 arithmetic: the base fee is burned and the priority fee is paid to the validator, so the split is a real distinction, not a presentation choice.`
  };
}
function tokenDecimals(v) {
  const raw = str(v, "raw", "1234567890123456789");
  const decimals = number(v, "decimals", 18);
  const amount = number(v, "amount", 1.5);
  if (!/^\d+$/.test(raw.trim())) {
    return {
      headline: "The raw amount must be an integer in base units \u2014 digits only",
      ok: false,
      basis: "Tokens are integers on the wire; the decimal point exists only in the interface. A non-integer input is refused rather than rounded."
    };
  }
  if (decimals < 0 || decimals > 36 || !Number.isInteger(decimals)) {
    return {
      headline: "Decimals must be a whole number between 0 and 36",
      ok: false,
      basis: "The base-unit convention needs a whole number of decimal places."
    };
  }
  const s = raw.trim().padStart(decimals + 1, "0");
  const whole = s.slice(0, s.length - decimals).replace(/^0+(?=\d)/, "") || "0";
  const frac = decimals > 0 ? s.slice(s.length - decimals).replace(/0+$/, "") : "";
  const human = frac ? `${whole}.${frac}` : whole;
  const back = `${whole}${frac.padEnd(decimals, "0")}`;
  const forOneAndAHalf = Math.round(amount * Math.pow(10, decimals)).toString();
  return {
    headline: `${raw.trim()} base units at ${decimals} decimals is ${human}`,
    ok: back === s.replace(/^0+(?=\d)/, ""),
    kpis: [
      { value: String(decimals), label: "decimals" },
      { value: human.length > 24 ? human.slice(0, 23) + "\u2026" : human, label: "human amount" },
      { value: `${forOneAndAHalf}`, label: `${amount} in base units` }
    ],
    lines: [
      `Round trip: ${human} \u2192 ${back} base units (leading zeros trimmed, which is the same integer).`,
      `${amount} tokens at ${decimals} decimals is ${forOneAndAHalf} base units \u2014 the multiplication that turns a display amount into something a contract will accept, and the one most often written with a floating-point mistake.`
    ],
    basis: "Base-unit arithmetic on integer strings: the human amount is the raw integer with a decimal point inserted `decimals` from the right, trailing zeros trimmed. No floating point touches the conversion \u2014 token math done in floats is where precision quietly disappears."
  };
}
var COMMERCE_TOOLS = Object.freeze([
  {
    id: "meta-lint",
    domain: "marketing",
    label: "Title & meta",
    blurb: "What a search result truncates, and which slug segments earn their width.",
    fields: [
      text("title", "Page title", "Deterministic specialist tools for engineering teams"),
      text("desc", "Meta description", "Forty deterministic tools across nine domains \u2014 contrast, semver, retries, error budgets and more. Every answer prints the rule it came from."),
      text("slug", "URL slug", "the-deterministic-specialist-tools-for-engineering-teams")
    ],
    run: metaLint
  },
  {
    id: "crawl-budget",
    domain: "marketing",
    label: "Crawl budget",
    blurb: "How long a crawl takes, and which limit is actually binding.",
    fields: [
      num("pages", "Pages to crawl", "250000"),
      num("latency", "Average response (ms)", "320"),
      num("rate", "Allowed rate (req/s)", "5"),
      num("window", "Concurrency window (seconds)", "10")
    ],
    run: crawlBudget
  },
  {
    id: "locale-coverage",
    domain: "locale",
    label: "Translation coverage",
    blurb: "Which locales clear the shipping bar, and which are one gap from a broken screen.",
    fields: [
      num("base", "Base-language keys", "4200"),
      num("threshold", "Shipping bar (%)", "98"),
      area(
        "locales",
        "Rows of `locale, translated, missing`",
        "de-DE, 4130, 70\nfr-FR, 4095, 105\nta-IN, 3610, 590\nja-JP, 4200, 0"
      )
    ],
    run: localeCoverage
  },
  {
    id: "string-expansion",
    domain: "locale",
    label: "String expansion",
    blurb: "How much longer a translated string gets, before it breaks the layout.",
    fields: [
      text("source", "Source string (English)", "Save and continue"),
      sel("locale", "Target locale", Object.keys(EXPANSION), "German (de)"),
      num("budget", "Available width (characters)", "18", "0 to skip the budget check")
    ],
    run: stringExpansion
  },
  {
    id: "eoq",
    domain: "supply",
    label: "Order quantity",
    blurb: "The order size that minimises ordering plus holding cost together.",
    fields: [
      num("demand", "Annual demand (units)", "24000"),
      num("order", "Cost per order", "450"),
      num("holding", "Holding cost per unit / year", "12")
    ],
    run: eoq
  },
  {
    id: "safety-stock",
    domain: "supply",
    label: "Safety stock",
    blurb: "The buffer a service level actually costs, and where the reorder point lands.",
    fields: [
      num("mean", "Mean daily demand (units)", "180"),
      num("sd", "Standard deviation of daily demand", "42"),
      num("lead", "Lead time (days)", "9"),
      sel("service", "Service level", Object.keys(SERVICE_Z), "95%")
    ],
    run: safetyStock
  },
  {
    id: "gas-plan",
    domain: "web3",
    label: "Gas plan",
    blurb: "Per-operation and batch cost from gas units, the fee market and the price.",
    fields: [
      num("units", "Gas units per operation", "145000"),
      num("base", "Base fee (gwei)", "18"),
      num("priority", "Priority fee (gwei)", "1.5"),
      num("eth", "Price per ETH", "3200"),
      num("ops", "Operations in the batch", "250")
    ],
    run: gasPlan
  },
  {
    id: "token-decimals",
    domain: "web3",
    label: "Token decimals",
    blurb: "Base units to a human amount and back, in integer arithmetic only.",
    fields: [
      text("raw", "Raw amount in base units", "1234567890123456789"),
      num("decimals", "Decimals", "18"),
      num("amount", "Display amount to convert", "1.5")
    ],
    run: tokenDecimals
  }
]);

// src/specialists/health.ts
function bandOf(total, anyThree) {
  if (total >= 7) return "high";
  if (total >= 5 || anyThree) return "medium";
  if (total >= 1) return "low-medium";
  return "low";
}
function scoreRr(rr) {
  if (rr <= 8) return 3;
  if (rr <= 11) return 1;
  if (rr <= 20) return 0;
  if (rr <= 24) return 2;
  return 3;
}
function scoreSpo2(spo2) {
  if (spo2 <= 91) return 3;
  if (spo2 <= 93) return 2;
  if (spo2 <= 95) return 1;
  return 0;
}
function scoreTemp(t) {
  if (t <= 35) return 3;
  if (t <= 36) return 1;
  if (t <= 38) return 0;
  if (t <= 39) return 1;
  return 2;
}
function scoreSbp(p) {
  if (p <= 90) return 3;
  if (p <= 100) return 2;
  if (p <= 110) return 1;
  if (p <= 219) return 0;
  return 3;
}
function scoreHr(h) {
  if (h <= 40) return 3;
  if (h <= 50) return 1;
  if (h <= 90) return 0;
  if (h <= 110) return 1;
  if (h <= 130) return 2;
  return 3;
}
function news2Score(input) {
  const rows2 = [
    { param: "Respiratory rate", value: `${input.rr}/min`, score: scoreRr(input.rr) },
    { param: "SpO\u2082 (scale 1)", value: `${input.spo2}%`, score: scoreSpo2(input.spo2) },
    { param: "Air or oxygen", value: input.onOxygen ? "oxygen" : "air", score: input.onOxygen ? 2 : 0 },
    { param: "Temperature", value: `${input.tempC.toFixed(1)} \xB0C`, score: scoreTemp(input.tempC) },
    { param: "Systolic BP", value: `${input.sbp} mmHg`, score: scoreSbp(input.sbp) },
    { param: "Heart rate", value: `${input.hr}/min`, score: scoreHr(input.hr) },
    { param: "Consciousness", value: input.consciousness, score: input.consciousness === "alert" ? 0 : 3 }
  ];
  const total = rows2.reduce((n3, r) => n3 + r.score, 0);
  const anyThree = rows2.some((r) => r.score === 3);
  return { total, band: bandOf(total, anyThree), rows: rows2 };
}
function bedOccupancy(occupied, beds, arrivalsPerDay) {
  const occupancyPct = beds <= 0 ? 0 : occupied / beds * 100;
  const impliedLosDays = arrivalsPerDay > 0 ? occupied / arrivalsPerDay : null;
  const lines = [
    beds <= 0 ? "A ward with no named beds cannot have an occupancy \u2014 the engine refuses the percentage rather than invent a denominator." : `${occupied} of ${beds} beds occupied is ${occupancyPct.toFixed(1)}%.`,
    impliedLosDays === null ? "Arrivals per day is zero, so Little's law cannot imply a length of stay." : `Little's law: length of stay \u2248 occupied / arrivals = ${impliedLosDays.toFixed(2)} days at the current arrival rate.`,
    "This is a census identity, not a clinical forecast. It does not model delayed discharges, boarding, or acuity."
  ];
  return { occupied, beds, occupancyPct, impliedLosDays, lines };
}
var HEALTH_TOOLS = [
  {
    id: "news2",
    domain: "health",
    label: "NEWS2",
    blurb: "Royal College of Physicians early-warning score. A number and a band \u2014 not a diagnosis.",
    fields: [
      num("rr", "Respiratory rate (/min)", "24"),
      num("spo2", "SpO\u2082 (%)", "94"),
      sel("oxygen", "Air or oxygen", ["air", "oxygen"], "air"),
      num("temp", "Temperature (\xB0C)", "38.1"),
      num("sbp", "Systolic BP (mmHg)", "95"),
      num("hr", "Heart rate (/min)", "110"),
      sel("avpu", "Consciousness", ["alert", "voice", "pain", "unresponsive"], "alert")
    ],
    run: (v) => {
      const r = news2Score({
        rr: Math.round(number(v, "rr", 24)),
        spo2: Math.round(number(v, "spo2", 94)),
        onOxygen: String(v["oxygen"] ?? "air") === "oxygen",
        tempC: number(v, "temp", 38.1),
        sbp: Math.round(number(v, "sbp", 95)),
        hr: Math.round(number(v, "hr", 110)),
        consciousness: String(v["avpu"] ?? "alert")
      });
      return {
        headline: `NEWS2 ${r.total} \u2014 ${r.band} (not a diagnosis)`,
        ok: r.band === "low" || r.band === "low-medium",
        kpis: [
          { value: String(r.total), label: "NEWS2 total" },
          { value: r.band, label: "band" }
        ],
        table: { head: ["Parameter", "Value", "Score"], rows: r.rows.map((row) => [row.param, row.value, String(row.score)]) },
        lines: [
          "Bands follow the RCP chart: 0 low, 1\u20134 low-medium, 5\u20136 or any single 3 medium, \u22657 high.",
          "This is a track-and-trigger score. It does not name a condition, recommend a treatment, or replace a clinician."
        ],
        basis: "Royal College of Physicians NEWS2 (scale 1 SpO\u2082). Each parameter scores 0\u20133; oxygen adds 2; unresponsive/voice/pain scores 3. The engine prints the table; it does not interpret a cause."
      };
    }
  },
  {
    id: "bed-occupancy",
    domain: "health",
    label: "Bed occupancy",
    blurb: "Census occupancy and the length of stay Little's law implies \u2014 a ward identity, not a forecast.",
    fields: [
      num("occupied", "Beds occupied", "28"),
      num("beds", "Named beds", "32"),
      num("arrivals", "Arrivals / day", "6")
    ],
    run: (v) => {
      const o = bedOccupancy(
        Math.round(number(v, "occupied", 28)),
        Math.round(number(v, "beds", 32)),
        number(v, "arrivals", 6)
      );
      return {
        headline: o.beds <= 0 ? "No named beds \u2014 occupancy refused" : `${o.occupancyPct.toFixed(1)}% occupancy` + (o.impliedLosDays !== null ? ` \xB7 ${o.impliedLosDays.toFixed(2)} d implied LOS` : ""),
        ok: o.beds > 0 && o.occupancyPct < 92,
        kpis: [
          { value: `${o.occupied}/${o.beds}`, label: "occupied / beds" },
          { value: `${o.occupancyPct.toFixed(1)}%`, label: "occupancy" },
          { value: o.impliedLosDays === null ? "\u2014" : o.impliedLosDays.toFixed(2), label: "implied LOS (days)" }
        ],
        lines: o.lines,
        basis: "occupancy = occupied \xF7 named beds; implied length of stay = occupied \xF7 arrivals-per-day (Little's law, L = \u03BBW). Neither figure is a clinical forecast."
      };
    }
  }
];

// src/specialists/roster.ts
var A = (a) => a;
var SPECIALISTS = Object.freeze([
  /* ── frontend ───────────────────────────────────────────────────────────── */
  A({
    id: "fe.contrast-audit",
    name: "Contrast Audit",
    domain: "frontend",
    status: "engine",
    engine: "contrastRatio + wcagVerdict",
    inputs: "a token set or a list of foreground/background pairs",
    output: "each pair's ratio and the highest WCAG level it meets",
    purpose: "Check every colour pair in a token set against WCAG so accessibility is a build failure rather than a review comment.",
    requiresApproval: false,
    receipt: "the ratio computed for each pair, the standard applied, and the token set it came from"
  }),
  A({
    id: "fe.token-convert",
    name: "Token Converter",
    domain: "frontend",
    status: "engine",
    engine: "parseColor + toHex",
    inputs: "colours in hex, rgb() or hsl() from a design file",
    output: "every notation a codebase needs, alpha preserved",
    purpose: "Convert design-file colours into the exact strings a stylesheet, a canvas call and a native theme each require.",
    requiresApproval: false,
    receipt: "the source value, the conversions produced, and the alpha handling"
  }),
  A({
    id: "fe.type-scale",
    name: "Type Scale",
    domain: "frontend",
    status: "engine",
    engine: "typeScale",
    inputs: "a base size and a ratio",
    output: "the scale in px and rem",
    purpose: "Generate the type scale a design system is built on, with the rounding decided once instead of per component.",
    requiresApproval: false,
    receipt: "the base, the ratio, and every step produced"
  }),
  A({
    id: "fe.grid-drift",
    name: "Grid Drift",
    domain: "frontend",
    status: "engine",
    engine: "snapToGrid",
    inputs: "spacing values found in a stylesheet",
    output: "off-grid values and the distance to the grid",
    purpose: "Find the spacing values that have drifted off the 4/8px grid before they become a visual rhythm nobody can name.",
    requiresApproval: false,
    receipt: "the values tested, the movement each one requires, and the grid base"
  }),
  A({
    id: "fe.a11y-fix",
    name: "Accessibility Fix Plan",
    domain: "frontend",
    status: "workflow",
    engine: "wcagVerdict",
    inputs: "a contrast audit plus the component inventory",
    output: "a ranked list of token changes that clear the most failures",
    purpose: "Turn a list of failing pairs into the smallest set of token changes that fix the most of them.",
    requiresApproval: true,
    receipt: "the plan, the failures it clears, and the human's decision before any token changed"
  }),
  /* ── dev / release engineering ──────────────────────────────────────────── */
  A({
    id: "dev.release-guard",
    name: "Release Guard",
    domain: "dev",
    status: "engine",
    engine: "satisfiesRange + compareSemver",
    inputs: "the manifest, the lockfile and a proposed version",
    output: "ranges a dependency violates, with each range expanded to its real bounds",
    purpose: "Check a release's dependency ranges before the install fails in CI and somebody reaches for --force.",
    requiresApproval: false,
    receipt: "every range tested, the version tested against it, and the expansion used"
  }),
  A({
    id: "dev.changelog",
    name: "Changelog Composer",
    domain: "dev",
    status: "engine",
    engine: "lintCommit",
    inputs: "a commit range",
    output: "a categorised changelog and the commits it could not parse",
    purpose: "Turn a commit range into a readable changelog and name every commit whose message defeated the parser.",
    requiresApproval: false,
    receipt: "the commits read, what each became in the changelog, and every unparsed one"
  }),
  A({
    id: "dev.retry-shape",
    name: "Retry Shape",
    domain: "dev",
    status: "engine",
    engine: "backoffSchedule",
    inputs: "a retry policy or the values the client implements",
    output: "the real schedule and the total time before giving up",
    purpose: "Show what a retry ladder actually does over time, so a policy that never finishes is caught in review.",
    requiresApproval: false,
    receipt: "the policy as implemented, the schedule produced, and the client timeout compared against it"
  }),
  A({
    id: "dev.schedule-audit",
    name: "Schedule Audit",
    domain: "dev",
    status: "engine",
    engine: "parseCron",
    inputs: "cron expressions from a scheduler",
    output: "next runs, daylight handling and the day-field rule",
    purpose: "Catch the scheduled job that will not fire, or will fire twice, before anyone notices the data is stale.",
    requiresApproval: false,
    receipt: "each expression, the runs computed, and the dialect assumed"
  }),
  A({
    id: "dev.migration-plan",
    name: "Migration Plan",
    domain: "dev",
    status: "workflow",
    engine: "deployRisk",
    inputs: "a schema diff and the deploy plan",
    output: "the ordered steps and the rollback path",
    purpose: "Sequence a schema change so the deploy can be rolled back without losing the data it wrote.",
    requiresApproval: true,
    receipt: "the plan, the rollback path, and the human's approval before anything ran against production"
  }),
  /* ── API ────────────────────────────────────────────────────────────────── */
  A({
    id: "api.limit-fit",
    name: "Rate Limit Fit",
    domain: "api",
    status: "engine",
    engine: "tokenBucketPlan",
    inputs: "the published limit and the client's demand",
    output: "sustainable rate, first rejection and the timeline",
    purpose: "Tell a client team what demand its integration can actually sustain before it meets the limit in production.",
    requiresApproval: false,
    receipt: "the limit, the demand simulated, and the timeline produced from them"
  }),
  A({
    id: "api.payload-budget",
    name: "Payload Budget",
    domain: "api",
    status: "engine",
    engine: "payloadBudget",
    inputs: "a response body",
    output: "size per field and what dominates it",
    purpose: "Find the field that is making a response large while clients pay to download and discard it.",
    requiresApproval: false,
    receipt: "the payload measured, the per-field breakdown, and the compression question left unanswered"
  }),
  A({
    id: "api.idempotency-review",
    name: "Idempotency Review",
    domain: "api",
    status: "engine",
    engine: "checkIdempotencyKey",
    inputs: "the key format the client sends and the retention window",
    output: "entropy, shape issues and the retention mismatch",
    purpose: "Check that a write path's idempotency key is actually unguessable and remembered for long enough to matter.",
    requiresApproval: false,
    receipt: "the key shape measured, the entropy floor, and the retention the server promised"
  }),
  A({
    id: "api.paging-advice",
    name: "Paging Advice",
    domain: "api",
    status: "engine",
    engine: "paginationPlan",
    inputs: "row counts, page size and the offset pattern in use",
    output: "page arithmetic and whether the offset is deep enough to hurt",
    purpose: "Say when offset paging stops being fine, and what a keyset cursor would cost instead.",
    requiresApproval: false,
    receipt: "the arithmetic, the depth observed, and the recommendation with its reason"
  }),
  A({
    id: "api.contract-change",
    name: "Contract Change",
    domain: "api",
    status: "workflow",
    engine: "httpSemantics + payloadBudget",
    inputs: "an API diff and the consumer list",
    output: "breaking changes, affected consumers and a deprecation schedule",
    purpose: "Classify an API change as breaking or not, name which consumers it touches, and propose the schedule.",
    requiresApproval: true,
    receipt: "the diff classified, the consumers named, and the human's decision before any deprecation notice went out"
  }),
  /* ── data ───────────────────────────────────────────────────────────────── */
  A({
    id: "data.latency-read",
    name: "Latency Read",
    domain: "data",
    status: "engine",
    engine: "percentile",
    inputs: "a latency series",
    output: "the percentiles with the sample size stated",
    purpose: "Report latency the way users experience it \u2014 at the tail, with the sample size that supports it.",
    requiresApproval: false,
    receipt: "the series, the interpolation method, and every percentile computed"
  }),
  A({
    id: "data.outlier-triage",
    name: "Outlier Triage",
    domain: "data",
    status: "engine",
    engine: "outliersIqr",
    inputs: "a data series",
    output: "fenced values and why the rule may be degenerate here",
    purpose: "Surface the points outside the fences, and say plainly when the sample is too small for the rule to mean anything.",
    requiresApproval: false,
    receipt: "the fences, the points outside them, and the caveats about the sample"
  }),
  A({
    id: "data.experiment-readout",
    name: "Experiment Readout",
    domain: "data",
    status: "engine",
    engine: "abTest + sampleSize",
    inputs: "two arms of a test",
    output: "lift, interval, p-value and the peeking warning",
    purpose: "Read out a test with the uncertainty attached, and refuse to call a result the design could never detect.",
    requiresApproval: false,
    receipt: "the arms, the test used, the interval, and the honesty notes about stopping rules"
  }),
  A({
    id: "data.sample-plan",
    name: "Sample Plan",
    domain: "data",
    status: "engine",
    engine: "sampleSize",
    inputs: "a baseline rate and the effect worth detecting",
    output: "trials per arm and the time that implies",
    purpose: "Size a test before it starts, so the decision is made on the power of the design rather than the patience of the team.",
    requiresApproval: false,
    receipt: "the baseline, the effect, the power and alpha chosen, and the sample derived"
  }),
  A({
    id: "data.metric-definition",
    name: "Metric Definition",
    domain: "data",
    status: "workflow",
    engine: "percentile + stddev",
    inputs: "a metric name, its proposed definition and the events available",
    output: "a definition with its exclusions and its failure modes",
    purpose: "Write down what a metric means \u2014 including the cases it excludes \u2014 before it appears on a dashboard.",
    requiresApproval: false,
    receipt: "the definition, the exclusions, and the events it is actually computed from"
  }),
  /* ── security ───────────────────────────────────────────────────────────── */
  A({
    id: "sec.secret-sweep",
    name: "Secret Sweep",
    domain: "security",
    status: "engine",
    engine: "scanSecrets",
    inputs: "a diff, a config or a log sample",
    output: "matched credential patterns, masked, with the false-positive caveat",
    purpose: "Find the credential shapes that have a fixed format \u2014 and state what a pattern scan cannot find.",
    requiresApproval: false,
    receipt: "the patterns tested, the matches found (masked), and the limits of the method"
  }),
  A({
    id: "sec.token-inspect",
    name: "Token Inspect",
    domain: "security",
    status: "engine",
    engine: "jwtInspect",
    inputs: "a JWT from a support ticket",
    output: "claims, expiry and the algorithm in use",
    purpose: "Decode what a token says and when it dies, without ever implying the signature was checked.",
    requiresApproval: false,
    receipt: "the claims decoded, the arithmetic on exp, and the explicit statement that nothing was verified"
  }),
  A({
    id: "sec.header-audit",
    name: "Header Audit",
    domain: "security",
    status: "engine",
    engine: "cspAudit",
    inputs: "a Content-Security-Policy header",
    output: "directives that are doing nothing, by severity",
    purpose: "Name the clauses of a security policy that look protective and are not.",
    requiresApproval: false,
    receipt: "the policy as supplied, every finding, and the checklist it was tested against"
  }),
  A({
    id: "sec.entropy-floor",
    name: "Entropy Floor",
    domain: "security",
    status: "engine",
    engine: "stringEntropyBits",
    inputs: "a candidate key, password or token",
    output: "measured bits and what the measure does not prove",
    purpose: "Measure how much a string actually carries, and be clear that entropy measures the string and not the generator.",
    requiresApproval: false,
    receipt: "the string measured (not stored), the bits, and the interpretation with its limits"
  }),
  A({
    id: "sec.rotation-runbook",
    name: "Rotation Runbook",
    domain: "security",
    status: "workflow",
    engine: "scanSecrets + stringEntropyBits",
    inputs: "a confirmed exposure and the systems that use the credential",
    output: "the revoke \u2192 rotate \u2192 verify sequence and its owners",
    purpose: "Sequence a credential rotation so revoking comes before rotating, and verification comes before the all-clear.",
    requiresApproval: true,
    receipt: "the sequence, the owners, and the human's approval \u2014 rotation touches production credentials"
  }),
  /* ── ops ────────────────────────────────────────────────────────────────── */
  A({
    id: "ops.budget-watch",
    name: "Error Budget Watch",
    domain: "ops",
    status: "engine",
    engine: "sloErrorBudget",
    inputs: "an SLO, a window and consumption so far",
    output: "remaining budget, burn rate and time to exhaust",
    purpose: "Keep the reliability decision a number rather than an argument held during an incident.",
    requiresApproval: false,
    receipt: "the SLO, the window, the consumption observed, and the extrapolation with its assumption stated"
  }),
  A({
    id: "ops.capacity-plan",
    name: "Capacity Plan",
    domain: "ops",
    status: "engine",
    engine: "capacityHeadroom",
    inputs: "current utilisation, growth rate and a ceiling",
    output: "the month the ceiling is crossed and the runway",
    purpose: "Give the launch question a date: when growth meets the ceiling, if nothing changes.",
    requiresApproval: false,
    receipt: "the inputs, the compound curve, and the breach month computed from them"
  }),
  A({
    id: "ops.incident-class",
    name: "Incident Classifier",
    domain: "ops",
    status: "engine",
    engine: "incidentSeverity",
    inputs: "impact numbers from triage",
    output: "an S1\u2013S4 call with the rule that produced it",
    purpose: "Assign severity from impact rather than from who noticed, using a rule that is printed alongside the verdict.",
    requiresApproval: false,
    receipt: "the impact data, the severity, and the rule applied \u2014 printed so it can be argued with"
  }),
  A({
    id: "ops.deploy-gate",
    name: "Deploy Gate",
    domain: "ops",
    status: "engine",
    engine: "deployRisk",
    inputs: "the change, its tests, its rollback and its timing",
    output: "a risk score, the active factors and a recommendation",
    purpose: "Score a deploy against the six factors that turn releases into incidents, and say which one to fix first.",
    requiresApproval: true,
    receipt: "the factors assessed, the score, and the human's go-ahead \u2014 this gate can stop a release"
  }),
  A({
    id: "ops.postmortem",
    name: "Postmortem Drafter",
    domain: "ops",
    status: "workflow",
    engine: "incidentSeverity + sloErrorBudget",
    inputs: "the incident timeline and its impact",
    output: "a blameless timeline, the budget cost and the actions with owners",
    purpose: "Draft the postmortem from the timeline, with the impact measured against the budget it consumed.",
    requiresApproval: false,
    receipt: "the timeline used, the budget arithmetic, and the actions with their owners"
  }),
  /* ── docs ───────────────────────────────────────────────────────────────── */
  A({
    id: "docs.reading-level",
    name: "Reading Level",
    domain: "docs",
    status: "engine",
    engine: "readability",
    inputs: "prose from a page or a README",
    output: "grade level, ease score and the cause",
    purpose: "Keep user-facing documentation at the reading level its audience actually has.",
    requiresApproval: false,
    receipt: "the text measured, the scores, and the syllable-estimation caveat"
  }),
  A({
    id: "docs.len-budget",
    name: "Length Budget",
    domain: "docs",
    status: "engine",
    engine: "readingTime",
    inputs: "a document",
    output: "words, minutes and code lines",
    purpose: "Decide whether a page needs a summary by knowing how long it takes to read.",
    requiresApproval: false,
    receipt: "the word count, the assumed rate, and the code lines counted separately"
  }),
  A({
    id: "docs.structure-check",
    name: "Structure Check",
    domain: "docs",
    status: "engine",
    engine: "headingLint",
    inputs: "markdown",
    output: "level jumps, duplicate anchors, title problems",
    purpose: "Keep headings in a shape that a table of contents and a screen reader can both follow.",
    requiresApproval: false,
    receipt: "the heading tree, every structural issue, and its line number"
  }),
  A({
    id: "docs.terminology-lock",
    name: "Terminology Lock",
    domain: "docs",
    status: "engine",
    engine: "terminologyDrift",
    inputs: "a document set",
    output: "terms written more than one way",
    purpose: "Keep one spelling per concept so search, glossary links and translation keep working.",
    requiresApproval: false,
    receipt: "the variants found with their counts, and the fixed variant list used"
  }),
  A({
    id: "docs.release-notes",
    name: "Release Notes",
    domain: "docs",
    status: "workflow",
    engine: "lintCommit + readability",
    inputs: "a changelog and the audience it serves",
    output: "notes written for users, checked for reading level",
    purpose: "Turn engineering changes into notes a customer can act on, at a reading level they can finish.",
    requiresApproval: true,
    receipt: "the source commits, the notes drafted, and the human's approval before anything was published"
  }),
  /* ── growth ─────────────────────────────────────────────────────────────── */
  A({
    id: "growth.economics",
    name: "Unit Economics",
    domain: "growth",
    status: "engine",
    engine: "unitEconomics",
    inputs: "revenue, margin, acquisition cost and churn",
    output: "lifetime value, the ratio and the payback period",
    purpose: "Answer whether growth pays for itself before more money is spent proving it.",
    requiresApproval: false,
    receipt: "the inputs, the ratio, the payback, and the assumptions the model rests on"
  }),
  A({
    id: "growth.funnel-read",
    name: "Funnel Read",
    domain: "growth",
    status: "engine",
    engine: "funnel",
    inputs: "stage counts in order",
    output: "stage conversions and the largest proportional loss",
    purpose: "Point the next experiment at the step that loses the most, rather than the step with the most traffic.",
    requiresApproval: false,
    receipt: "the counts, each stage's conversion, and the step identified as the constraint"
  }),
  A({
    id: "growth.backlog-rank",
    name: "Backlog Ranker",
    domain: "growth",
    status: "engine",
    engine: "riceScore",
    inputs: "candidate work with reach, impact, confidence and effort",
    output: "a ranked table with the inputs left visible",
    purpose: "Rank a backlog so disagreement can be traced to an input somebody chose, not to seniority.",
    requiresApproval: false,
    receipt: "every candidate scored, the formula used, and the inputs as supplied"
  }),
  A({
    id: "growth.plan-check",
    name: "Plan Check",
    domain: "growth",
    status: "engine",
    engine: "growthModel",
    inputs: "a growth plan with its churn assumption",
    output: "the trajectory, the exit ARR and the implied rate",
    purpose: "Test whether a revenue plan survives its own churn assumption before it is presented.",
    requiresApproval: false,
    receipt: "the plan modelled month by month, the assumed rates, and the exit position"
  }),
  A({
    id: "growth.price-change",
    name: "Price Change",
    domain: "growth",
    status: "workflow",
    engine: "unitEconomics + growthModel",
    inputs: "a proposed price change and the affected base",
    output: "the margin effect, the churn break-even and the affected cohorts",
    purpose: "Model a price change: what it earns, what churn it can absorb, and who it touches.",
    requiresApproval: true,
    receipt: "the model, the break-even churn, and the human's approval \u2014 a price change is customer-facing"
  }),
  /* ── 19.7.15 [Cartographer]: the pack widens to twenty-four domains ───────── */
  /* ── mobile ───────────────────────────────────────────────────── */
  A({
    id: "mobile.touch-audit",
    name: "Touch-target audit",
    domain: "mobile",
    status: "engine",
    engine: "touchTargets",
    inputs: "a screen's controls and their pixel sizes",
    output: "every control's verdict against the platform floor",
    purpose: "Measure each control against the platform's minimum touch size before a reviewer finds the one nobody can hit.",
    requiresApproval: false,
    receipt: "each target measured, the floor applied, and where the spacing exception was used"
  }),
  A({
    id: "mobile.size-budget",
    name: "Size budget",
    domain: "mobile",
    status: "engine",
    engine: "appSizeBudget",
    inputs: "current download size, budget and growth per release",
    output: "the release at which the budget is crossed",
    purpose: "Project download size release by release so the budget is a number somebody watches, not a surprise at store review.",
    requiresApproval: false,
    receipt: "the size today, the growth applied, and the release where the budget is crossed"
  }),
  A({
    id: "mobile.grid-snap",
    name: "Grid snap review",
    domain: "mobile",
    status: "engine",
    engine: "snapToGrid",
    inputs: "spacing tokens taken from the design file",
    output: "off-grid values and the distance to the grid",
    purpose: "Keep spacing tokens on one grid so two screens built by two people still look like one product.",
    requiresApproval: false,
    receipt: "every token checked, off-grid values named, and the direction of each correction"
  }),
  A({
    id: "mobile.startup-percentiles",
    name: "Startup percentiles",
    domain: "mobile",
    status: "engine",
    engine: "percentiles",
    inputs: "cold-start timings collected from a device fleet",
    output: "p50, p95 and p99 rather than an average",
    purpose: "Report startup at the percentiles users feel, because an average hides the slower half of a device fleet.",
    requiresApproval: false,
    receipt: "the sample size, the percentile method used, and the p50/p95/p99 readout"
  }),
  A({
    id: "mobile.ab-readout",
    name: "UI experiment readout",
    domain: "mobile",
    status: "engine",
    engine: "abTest",
    inputs: "two arms with their conversions",
    output: "the lift, its interval and whether it is real",
    purpose: "Read a UI experiment honestly: the lift, its uncertainty, and whether the sample supports shipping it.",
    requiresApproval: false,
    receipt: "both arms, the test applied, and the interval around the difference"
  }),
  A({
    id: "mobile.release",
    name: "Mobile release",
    domain: "mobile",
    status: "workflow",
    engine: "appSizeBudget + touchTargets",
    inputs: "a build number and the store submission checklist",
    output: "a release package ready to submit, gated",
    purpose: "Ship a mobile build: the size and touch-target gates cleared, store metadata checked, and a human approving the push.",
    requiresApproval: true,
    receipt: "the gates cleared, the metadata checked, and the human's approval of the store submission"
  }),
  A({
    id: "mobile.store-listing",
    name: "Store listing copy",
    domain: "mobile",
    status: "engine",
    engine: "metaLint",
    inputs: "title, subtitle and description for the store",
    output: "what each field will truncate",
    purpose: "Catch truncation in a store listing before the store does it silently on a customer's phone.",
    requiresApproval: false,
    receipt: "each field measured, the display limit applied, and the truncation point named"
  }),
  A({
    id: "mobile.locale-coverage",
    name: "Locale coverage",
    domain: "mobile",
    status: "engine",
    engine: "localeCoverage",
    inputs: "translated keys per app locale",
    output: "which locales clear the shipping bar",
    purpose: "Decide which app locales can ship from translated keys on disk rather than from intent in a planning document.",
    requiresApproval: false,
    receipt: "the key count, each locale's coverage, and the bar that was applied"
  }),
  A({
    id: "mobile.payload-budget",
    name: "Payload budget",
    domain: "mobile",
    status: "engine",
    engine: "payloadBudget",
    inputs: "the API response shape behind one screen",
    output: "the response size against a mobile data budget",
    purpose: "Hold a screen's API response inside a data budget that a phone on a slow network can actually afford.",
    requiresApproval: false,
    receipt: "the measured payload, the budget declared, and the fields that dominate it"
  }),
  A({
    id: "mobile.battery-profile",
    name: "Battery profile",
    domain: "mobile",
    status: "engine",
    engine: "powerBudget",
    inputs: "battery capacity, duty cycle and the active and sleep currents",
    output: "runtime, and which state owns the charge",
    purpose: "Tell a user how long the app lasts and which state is spending the battery, before a review calls it heavy.",
    requiresApproval: false,
    receipt: "the duty cycle, the currents, and the state consuming the largest share of the charge"
  }),
  A({
    id: "mobile.push-send",
    name: "Push campaign",
    domain: "mobile",
    status: "workflow",
    engine: "funnel + growthModel",
    inputs: "a notification campaign and its audience definition",
    output: "the modelled effect, gated before anything sends",
    purpose: "Model a notification campaign and stop at the gate, because a push is a message delivered to somebody's phone.",
    requiresApproval: true,
    receipt: "the audience size, the modelled effect, and the human's approval before any message is sent"
  }),
  /* ── cloud ───────────────────────────────────────────────────── */
  A({
    id: "cloud.instance-plan",
    name: "Instance sizing",
    domain: "cloud",
    status: "engine",
    engine: "instanceSizing",
    inputs: "p95 utilisation, a headroom target and the current fleet size",
    output: "instances needed and the resulting p95",
    purpose: "Size a fleet from measured p95 and a stated headroom target instead of from memory of the last incident.",
    requiresApproval: false,
    receipt: "the measured utilisation, the target declared, and the resulting instance count"
  }),
  A({
    id: "cloud.egress-review",
    name: "Egress review",
    domain: "cloud",
    status: "engine",
    engine: "egressCost",
    inputs: "egress volume, origin price and cache hit rate",
    output: "monthly cost with and without the cache",
    purpose: "Show what a cache is worth in money, using the tariff the team actually pays rather than a published list price.",
    requiresApproval: false,
    receipt: "the volumes, the prices, and the saving computed per path"
  }),
  A({
    id: "cloud.token-scope",
    name: "Token scope audit",
    domain: "cloud",
    status: "engine",
    engine: "jwtInspect",
    inputs: "a service token used by a workload",
    output: "its scopes, expiry and claims, decoded",
    purpose: "Read what a service token can actually do, because a scope nobody intended is a permission that outlives its reason.",
    requiresApproval: false,
    receipt: "the decoded claims, the expiry, and the scopes the token carries"
  }),
  A({
    id: "cloud.cost-anomaly",
    name: "Cost anomaly watch",
    domain: "cloud",
    status: "engine",
    engine: "anomalyZ",
    inputs: "daily spend history for a service",
    output: "days that sit far from their own window's mean",
    purpose: "Surface the day a bill moved without an incident, while nobody was watching the graph.",
    requiresApproval: false,
    receipt: "the window examined, the mean and spread, and each flagged day with its z"
  }),
  A({
    id: "cloud.spend-forecast",
    name: "Spend forecast",
    domain: "cloud",
    status: "engine",
    engine: "spendForecast",
    inputs: "months of infrastructure spend",
    output: "the trend and a projected month",
    purpose: "Put a trajectory on infrastructure spend so the budget conversation starts from a line rather than a feeling.",
    requiresApproval: false,
    receipt: "the months observed, the fitted trend, and the projection with its caveat attached"
  }),
  A({
    id: "cloud.capacity-runway",
    name: "Capacity runway",
    domain: "cloud",
    status: "engine",
    engine: "capacityHeadroom",
    inputs: "current headroom, growth rate and a threshold",
    output: "how long the headroom lasts before the threshold",
    purpose: "Answer how long current capacity lasts, so a migration can be scheduled instead of demanded.",
    requiresApproval: false,
    receipt: "the headroom today, the growth rate assumed, and the runway before the threshold is crossed"
  }),
  A({
    id: "cloud.error-budget",
    name: "Platform error budget",
    domain: "cloud",
    status: "engine",
    engine: "sloErrorBudget",
    inputs: "an SLO target and the measurement window",
    output: "the budget, what is spent and what remains",
    purpose: "Spend reliability effort against a budget instead of against the loudest recent incident.",
    requiresApproval: false,
    receipt: "the SLO, the window, and the error minutes allowed and consumed"
  }),
  A({
    id: "cloud.deploy-window",
    name: "Deployment window",
    domain: "cloud",
    status: "engine",
    engine: "deployRisk",
    inputs: "a change set and the blast radius it touches",
    output: "a risk read for the window chosen",
    purpose: "Choose a deployment window from the change's own risk shape rather than the team's calendar preference.",
    requiresApproval: false,
    receipt: "the change size, the blast radius, and the factors behind the risk read"
  }),
  A({
    id: "cloud.retention-audit",
    name: "Log retention audit",
    domain: "cloud",
    status: "engine",
    engine: "retentionClock",
    inputs: "log classes with creation dates and retention terms",
    output: "what is already overdue for deletion",
    purpose: "Find log classes past their retention date, which is the finding an auditor asks about first.",
    requiresApproval: false,
    receipt: "each class, its retention term, and the days past or remaining"
  }),
  A({
    id: "cloud.autoscale-apply",
    name: "Autoscale policy apply",
    domain: "cloud",
    status: "workflow",
    engine: "instanceSizing + sloErrorBudget",
    inputs: "a proposed scaling policy for a production service",
    output: "a production scaling change, gated",
    purpose: "Change how production scales: modelled first, applied by a human, because a scaling policy is a production change.",
    requiresApproval: true,
    receipt: "the model, the policy difference, and the human's approval of the apply"
  }),
  A({
    id: "cloud.rotation-run",
    name: "Credential rotation",
    domain: "cloud",
    status: "workflow",
    engine: "scanSecrets + stringEntropyBits",
    inputs: "the credentials due for rotation this cycle",
    output: "the rotation plan and its execution, gated",
    purpose: "Rotate credentials on schedule with the exposure window measured and the change approved before it goes out.",
    requiresApproval: true,
    receipt: "which credentials rotated, the exposure window, and the human's approval"
  }),
  /* ── database ───────────────────────────────────────────────────── */
  A({
    id: "db.index-selectivity",
    name: "Index selectivity",
    domain: "db",
    status: "engine",
    engine: "indexSelectivity",
    inputs: "table row counts and how much a predicate matches",
    output: "whether the index will be used, and why",
    purpose: "Decide whether an index earns its write cost from key density rather than from the shape of the query alone.",
    requiresApproval: false,
    receipt: "the row and distinct counts, the fraction matched, and the crossover applied"
  }),
  A({
    id: "db.pool-sizing",
    name: "Connection pool",
    domain: "db",
    status: "engine",
    engine: "poolSizing",
    inputs: "request rate, query latency and instance count",
    output: "pool size per instance against the server ceiling",
    purpose: "Size connection pools from Little's Law instead of from the number that happened to work last time.",
    requiresApproval: false,
    receipt: "the concurrency computed, the pool size derived, and the headroom left on the server"
  }),
  A({
    id: "db.slow-query-percentiles",
    name: "Slow-query percentiles",
    domain: "db",
    status: "engine",
    engine: "percentiles",
    inputs: "query durations lifted from a log",
    output: "p50, p95 and p99 per query",
    purpose: "Rank slow queries at the percentiles that hurt, because an average query time is not a user experience.",
    requiresApproval: false,
    receipt: "the sample, the percentile method, and the readout per query"
  }),
  A({
    id: "db.outlier-queries",
    name: "Outlier queries",
    domain: "db",
    status: "engine",
    engine: "outliersIqr",
    inputs: "query durations from one window",
    output: "queries beyond the Tukey fence",
    purpose: "Separate the genuinely exceptional queries from the merely slow ones, so tuning effort lands where it pays.",
    requiresApproval: false,
    receipt: "the quartiles, the fence, and every query outside it"
  }),
  A({
    id: "db.migration-order",
    name: "Migration ordering",
    domain: "db",
    status: "engine",
    engine: "compareSemver",
    inputs: "migration file names in their numeric order",
    output: "the order they will actually apply in",
    purpose: "Check that a migration series applies in the order intended, because lexical filenames and numeric order disagree.",
    requiresApproval: false,
    receipt: "the sorted order, the anomalies found, and the convention applied"
  }),
  A({
    id: "db.backup-retention",
    name: "Backup retention",
    domain: "db",
    status: "engine",
    engine: "retentionClock",
    inputs: "backup sets with creation dates and retention terms",
    output: "which backups are past their retention date",
    purpose: "Keep backup retention honest: neither so short that recovery is impossible nor so long that it is a liability.",
    requiresApproval: false,
    receipt: "each backup set, its retention term, and the days past or remaining"
  }),
  A({
    id: "db.migration-plan",
    name: "Migration plan",
    domain: "db",
    status: "engine",
    engine: "deployRisk",
    inputs: "a proposed schema change and its blast radius",
    output: "a risk read before the change is written",
    purpose: "Read a schema change's risk before it is written, when the plan is still cheap to alter.",
    requiresApproval: false,
    receipt: "the change described, the blast radius, and the factors behind the risk read"
  }),
  A({
    id: "db.migration-apply",
    name: "Migration apply",
    domain: "db",
    status: "workflow",
    engine: "deployRisk + indexSelectivity",
    inputs: "a migration ready against a production database",
    output: "the migration applied, gated",
    purpose: "Apply a schema migration: the plan reviewed, the lock window known, and a human approving the change to production.",
    requiresApproval: true,
    receipt: "the plan reviewed, the lock window estimated, and the human's approval of the apply"
  }),
  A({
    id: "db.replica-lag-watch",
    name: "Replica lag watch",
    domain: "db",
    status: "engine",
    engine: "anomalyZ",
    inputs: "replication lag samples over time",
    output: "replicas whose lag is out of family",
    purpose: "Catch a replica falling behind before a read from it returns stale data to a customer.",
    requiresApproval: false,
    receipt: "the window, the mean and spread, and each replica flagged with its z"
  }),
  A({
    id: "db.capacity-plan",
    name: "Storage capacity plan",
    domain: "db",
    status: "engine",
    engine: "capacityHeadroom",
    inputs: "current storage use, growth and the warning threshold",
    output: "when the threshold is reached",
    purpose: "Turn storage growth into a date, so provisioning is a scheduled task rather than a pager event.",
    requiresApproval: false,
    receipt: "the headroom today, the growth rate, and the date the threshold is reached"
  }),
  A({
    id: "db.partition-plan",
    name: "Partition plan",
    domain: "db",
    status: "workflow",
    engine: "percentiles + indexSelectivity",
    inputs: "table sizes, access patterns and retention",
    output: "a partitioning change to production, gated",
    purpose: "Restructure a large table for access and retention, with the change gated because partitioning is a schema change.",
    requiresApproval: true,
    receipt: "the access pattern evidence, the partition scheme proposed, and the human's approval"
  }),
  /* ── embedded ───────────────────────────────────────────────────── */
  A({
    id: "embedded.power-budget",
    name: "Power budget",
    domain: "embedded",
    status: "engine",
    engine: "powerBudget",
    inputs: "battery capacity, duty cycle and the active and sleep currents",
    output: "runtime, and which state owns the charge",
    purpose: "Know the runtime a device will achieve before the hardware is ordered, and which state is spending it.",
    requiresApproval: false,
    receipt: "the duty cycle, the currents measured, and the state consuming the largest share"
  }),
  A({
    id: "embedded.schedulability",
    name: "Schedulability",
    domain: "embedded",
    status: "engine",
    engine: "timingSlack",
    inputs: "task periods and worst-case execution times",
    output: "utilisation against the rate-monotonic bound",
    purpose: "Prove a task set schedulable before a missed deadline proves it was not.",
    requiresApproval: false,
    receipt: "each task's utilisation, the bound applied, and the slack remaining"
  }),
  A({
    id: "embedded.loop-percentiles",
    name: "Loop-time percentiles",
    domain: "embedded",
    status: "engine",
    engine: "percentiles",
    inputs: "control-loop execution times from a run",
    output: "p50, p95 and p99 for the loop",
    purpose: "Watch the tail of a control loop, because the deadline is missed by the worst case, not the average.",
    requiresApproval: false,
    receipt: "the sample, the percentile method, and the loop's tail behaviour"
  }),
  A({
    id: "embedded.jitter-outliers",
    name: "Jitter outliers",
    domain: "embedded",
    status: "engine",
    engine: "outliersIqr",
    inputs: "interrupt-to-task latencies",
    output: "the latencies outside the Tukey fence",
    purpose: "Find the interrupts whose latency is genuinely out of family rather than merely above average.",
    requiresApproval: false,
    receipt: "the quartiles, the fence, and the offending latencies"
  }),
  A({
    id: "embedded.retry-ladder",
    name: "Retry ladder",
    domain: "embedded",
    status: "engine",
    engine: "backoffSchedule",
    inputs: "a base delay and a retry count for a bus or link",
    output: "the retry schedule on the wire",
    purpose: "Fix the retry schedule for a link so a flapping bus does not turn into a burst of traffic.",
    requiresApproval: false,
    receipt: "the base delay, the ladder produced, and the total window it occupies"
  }),
  A({
    id: "embedded.payload-budget",
    name: "Frame budget",
    domain: "embedded",
    status: "engine",
    engine: "payloadBudget",
    inputs: "a frame or message shape on the wire",
    output: "its size against the transport budget",
    purpose: "Keep a message inside the transport's frame budget, where one byte over is not slower, it is absent.",
    requiresApproval: false,
    receipt: "the frame size measured, the budget, and the fields that dominate it"
  }),
  A({
    id: "embedded.secret-scan",
    name: "Device key scan",
    domain: "embedded",
    status: "engine",
    engine: "scanSecrets",
    inputs: "firmware sources and configuration files",
    output: "credential shapes found in them",
    purpose: "Find credentials that were compiled into firmware, where they cannot be rotated by any operation short of a recall.",
    requiresApproval: false,
    receipt: "each secret shape found, where it appeared, and the file it came from"
  }),
  A({
    id: "embedded.entropy-check",
    name: "Key entropy",
    domain: "embedded",
    status: "engine",
    engine: "stringEntropyBits",
    inputs: "device keys and identifiers as generated",
    output: "the entropy their shape implies",
    purpose: "Check that a device key has the entropy its purpose needs before a fleet is provisioned with it.",
    requiresApproval: false,
    receipt: "the entropy computed, the requirement, and the key's own shape"
  }),
  A({
    id: "embedded.fleet-growth",
    name: "Fleet growth model",
    domain: "embedded",
    status: "engine",
    engine: "growthModel",
    inputs: "a provisioning plan and its churn",
    output: "the fleet trajectory and its end state",
    purpose: "Model fleet growth so backend capacity and certificate lifetimes are planned rather than discovered.",
    requiresApproval: false,
    receipt: "the plan modelled period by period, the rates assumed, and the end state"
  }),
  A({
    id: "embedded.firmware-release",
    name: "Firmware release",
    domain: "embedded",
    status: "workflow",
    engine: "appSizeBudget + timingSlack",
    inputs: "a firmware build and the target hardware list",
    output: "a release package ready to flash, gated",
    purpose: "Release firmware with the size and timing gates cleared and a human approving, because it cannot be redeployed.",
    requiresApproval: true,
    receipt: "the gates cleared, the hardware list, and the human's approval of the release"
  }),
  A({
    id: "embedded.key-provision",
    name: "Key provisioning",
    domain: "embedded",
    status: "workflow",
    engine: "stringEntropyBits + scanSecrets",
    inputs: "a device identity to be provisioned at manufacture",
    output: "a provisioning run, gated",
    purpose: "Provision device identity with the entropy verified and the run approved, because a fleet's keys are set once.",
    requiresApproval: true,
    receipt: "the entropy verified, the keys provisioned, and the human's approval of the run"
  }),
  /* ── ml & ai ───────────────────────────────────────────────────── */
  A({
    id: "ml.eval-interval",
    name: "Evaluation interval",
    domain: "ml",
    status: "engine",
    engine: "evalInterval",
    inputs: "a sample size and the correct outcomes",
    output: "the proportion and its confidence interval",
    purpose: "Report an evaluation with the interval around it, because a bare score invites a decision it cannot support.",
    requiresApproval: false,
    receipt: "the sample, the confidence level, and the interval computed"
  }),
  A({
    id: "ml.split-audit",
    name: "Split audit",
    domain: "ml",
    status: "engine",
    engine: "splitAudit",
    inputs: "corpus size, split proportions and duplicate rows",
    output: "whether the split leaks",
    purpose: "Check that a train/validation/test split is honest before the score it produces is quoted anywhere.",
    requiresApproval: false,
    receipt: "the proportions, the duplicate count, and the grouping rule applied"
  }),
  A({
    id: "ml.sample-size",
    name: "Evaluation size",
    domain: "ml",
    status: "engine",
    engine: "sampleSize",
    inputs: "an effect worth detecting and a baseline rate",
    output: "the sample needed to see it",
    purpose: "Plan an evaluation from the effect worth detecting, so a null result is informative rather than merely disappointing.",
    requiresApproval: false,
    receipt: "the effect, the power, and the sample size derived"
  }),
  A({
    id: "ml.lift-readout",
    name: "A/B lift readout",
    domain: "ml",
    status: "engine",
    engine: "abTest",
    inputs: "two arms with conversions",
    output: "the lift and whether the sample supports it",
    purpose: "Read a model or prompt A/B honestly, with the uncertainty attached to the difference.",
    requiresApproval: false,
    receipt: "both arms, the statistic applied, and the interval around the lift"
  }),
  A({
    id: "ml.prompt-budget",
    name: "Prompt budget",
    domain: "ml",
    status: "engine",
    engine: "payloadBudget",
    inputs: "system prompt and context as assembled",
    output: "the token cost of the context",
    purpose: "Hold the assembled context inside a token budget so cost and latency stay predictable as prompts grow.",
    requiresApproval: false,
    receipt: "the context measured, the budget, and the components that dominate it"
  }),
  A({
    id: "ml.latency-percentiles",
    name: "Inference latency",
    domain: "ml",
    status: "engine",
    engine: "percentiles",
    inputs: "inference durations from production traffic",
    output: "p50, p95 and p99 per model",
    purpose: "Watch inference at the tail, because autoscaling reacts to the worst requests, not the average ones.",
    requiresApproval: false,
    receipt: "the sample, the percentile method, and the tail per model"
  }),
  A({
    id: "ml.cost-per-token",
    name: "Cost per million tokens",
    domain: "ml",
    status: "engine",
    engine: "unitEconomics",
    inputs: "token volume, provider pricing and the revenue it serves",
    output: "cost per million tokens and its payback",
    purpose: "Put a unit cost on inference so a model choice is a margin decision rather than a preference.",
    requiresApproval: false,
    receipt: "the volume, the price used, and the unit cost derived"
  }),
  A({
    id: "ml.drift-watch",
    name: "Output drift watch",
    domain: "ml",
    status: "engine",
    engine: "anomalyZ",
    inputs: "a daily metric for model outputs",
    output: "days out of family, and by how far",
    purpose: "Notice an output distribution moving while every individual response still looks plausible.",
    requiresApproval: false,
    receipt: "the window, the mean and spread, and each flagged day"
  }),
  A({
    id: "ml.grounding-lint",
    name: "Grounding citations",
    domain: "ml",
    status: "engine",
    engine: "citationLint",
    inputs: "a model answer that cites sources",
    output: "which numeric claims carry no citation",
    purpose: "Check that a grounded answer actually cites the claims that need a source.",
    requiresApproval: false,
    receipt: "the citations found, the claims without one, and the pattern rules applied"
  }),
  A({
    id: "ml.model-promote",
    name: "Model promotion",
    domain: "ml",
    status: "workflow",
    engine: "evalInterval + splitAudit",
    inputs: "a candidate model with its evaluation",
    output: "a promotion to serve traffic, gated",
    purpose: "Promote a model with the evaluation and its interval in front of a human, because promotion changes what customers see.",
    requiresApproval: true,
    receipt: "the evaluation, its interval, the split audit, and the human's approval"
  }),
  A({
    id: "ml.training-run",
    name: "Training run",
    domain: "ml",
    status: "workflow",
    engine: "spendForecast + evalInterval",
    inputs: "a training plan with its compute estimate",
    output: "a training run, gated on spend",
    purpose: "Start a training run with the cost projected and approved, because compute is money spent before any result exists.",
    requiresApproval: true,
    receipt: "the projected spend, the evaluation plan, and the human's approval of the run"
  }),
  /* ── research ───────────────────────────────────────────────────── */
  A({
    id: "research.citation-lint",
    name: "Citation lint",
    domain: "research",
    status: "engine",
    engine: "citationLint",
    inputs: "a draft with numeric claims",
    output: "the claims that carry no citation",
    purpose: "Find uncited numeric claims while the draft is still cheap to fix, rather than at review.",
    requiresApproval: false,
    receipt: "the citations counted, the uncited claims listed, and the pattern rules applied"
  }),
  A({
    id: "research.rater-agreement",
    name: "Rater agreement",
    domain: "research",
    status: "engine",
    engine: "raterAgreement",
    inputs: "two raters' labels for the same items",
    output: "raw agreement and Cohen's kappa beside it",
    purpose: "Show how much of a coding agreement is simply chance, because raw agreement flatters every rubric.",
    requiresApproval: false,
    receipt: "the labels, the observed and chance agreement, and kappa"
  }),
  A({
    id: "research.sample-size",
    name: "Study sample size",
    domain: "research",
    status: "engine",
    engine: "sampleSize",
    inputs: "an effect size worth detecting and a baseline",
    output: "the sample the study needs",
    purpose: "Size a study from the effect worth detecting so an inconclusive result is a finding rather than a waste.",
    requiresApproval: false,
    receipt: "the effect, the power chosen, and the sample derived"
  }),
  A({
    id: "research.result-percentiles",
    name: "Result percentiles",
    domain: "research",
    status: "engine",
    engine: "percentiles",
    inputs: "measurements from an experiment",
    output: "p50, p95 and p99 for the distribution",
    purpose: "Report measurements as a distribution, because a mean hides the tail an experiment may actually be about.",
    requiresApproval: false,
    receipt: "the sample, the percentile method, and the readout"
  }),
  A({
    id: "research.outlier-trials",
    name: "Outlier trials",
    domain: "research",
    status: "engine",
    engine: "outliersIqr",
    inputs: "trial measurements from one condition",
    output: "trials outside the Tukey fence",
    purpose: "Identify trials that are outliers by the measures used, and separate exclusion decisions from dislike of the result.",
    requiresApproval: false,
    receipt: "the quartiles, the fence, and every trial outside it"
  }),
  A({
    id: "research.paper-readability",
    name: "Paper readability",
    domain: "research",
    status: "engine",
    engine: "readability",
    inputs: "a section of the manuscript",
    output: "its reading grade and the sentences that carry it",
    purpose: "Keep a paper readable to the people who will use it, not only to the reviewers who will judge it.",
    requiresApproval: false,
    receipt: "the text measured, the grade computed, and the formula applied"
  }),
  A({
    id: "research.reading-time",
    name: "Reading time",
    domain: "research",
    status: "engine",
    engine: "readingTime",
    inputs: "a manuscript or abstract",
    output: "reading time and the sections that dominate it",
    purpose: "Know what a reviewer has actually been asked to read before assuming a careful read.",
    requiresApproval: false,
    receipt: "the word count, the reading speed assumed, and the time computed"
  }),
  A({
    id: "research.section-structure",
    name: "Section structure",
    domain: "research",
    status: "engine",
    engine: "headingLint",
    inputs: "the manuscript's headings",
    output: "the heading structure and its faults",
    purpose: "Check that a manuscript's structure follows its own promise, because a missing methods heading is a rejection risk.",
    requiresApproval: false,
    receipt: "the headings found, the faults listed, and the structure rule applied"
  }),
  A({
    id: "research.terminology-drift",
    name: "Terminology drift",
    domain: "research",
    status: "engine",
    engine: "terminologyDrift",
    inputs: "a manuscript and the glossary it declares",
    output: "terms used inconsistently",
    purpose: "Catch a term that changes meaning halfway through a paper, which is where reviewers lose the thread.",
    requiresApproval: false,
    receipt: "the glossary, the drift found, and the sections it appears in"
  }),
  A({
    id: "research.ethics-submit",
    name: "Ethics submission",
    domain: "research",
    status: "workflow",
    engine: "headingLint + citationLint",
    inputs: "a protocol ready for an ethics committee",
    output: "a submission, gated",
    purpose: "Submit a protocol with its structure checked and a human approving, because an ethics submission is a commitment.",
    requiresApproval: true,
    receipt: "the protocol checked, the attachments verified, and the human's approval of the submission"
  }),
  A({
    id: "research.preprint-post",
    name: "Preprint release",
    domain: "research",
    status: "workflow",
    engine: "citationLint + raterAgreement",
    inputs: "a manuscript ready for public release",
    output: "a public posting, gated",
    purpose: "Post a preprint with its citations checked and a human approving, because publication is irreversible in practice.",
    requiresApproval: true,
    receipt: "the citation check, the agreement figures attached, and the human's approval"
  }),
  /* ── media ───────────────────────────────────────────────────── */
  A({
    id: "media.loudness-gain",
    name: "Loudness gain",
    domain: "media",
    status: "engine",
    engine: "loudnessGain",
    inputs: "measured integrated loudness and the target",
    output: "the gain to apply and the peak after it",
    purpose: "Reach a loudness target without discovering at the encoder that the limiter had to do the work.",
    requiresApproval: false,
    receipt: "the measured loudness, the gain applied, and the peak it produced"
  }),
  A({
    id: "media.bitrate-budget",
    name: "Bitrate budget",
    domain: "media",
    status: "engine",
    engine: "bitrateBudget",
    inputs: "runtime and a size budget with an encoding ladder",
    output: "which rung of the ladder fits",
    purpose: "Choose the encoding rung from the size budget and the runtime, instead of from habit or from a competitor's number.",
    requiresApproval: false,
    receipt: "the ladder evaluated, the rung chosen, and the size it produces"
  }),
  A({
    id: "media.segment-durations",
    name: "Segment durations",
    domain: "media",
    status: "engine",
    engine: "percentiles",
    inputs: "segment durations from a finished edit",
    output: "p50, p95 and p99 across the timeline",
    purpose: "See the shape of an edit, where a few long segments carry the pace of the whole piece.",
    requiresApproval: false,
    receipt: "the segments measured, the percentile method, and the readout"
  }),
  A({
    id: "media.dropout-outliers",
    name: "Dropout outliers",
    domain: "media",
    status: "engine",
    engine: "outliersIqr",
    inputs: "dropped-frame counts across playback sessions",
    output: "sessions outside the Tukey fence",
    purpose: "Separate a systematic playback problem from the handful of sessions that were always going to be unlucky.",
    requiresApproval: false,
    receipt: "the quartiles, the fence, and the sessions outside it"
  }),
  A({
    id: "media.subtitle-contrast",
    name: "Subtitle contrast",
    domain: "media",
    status: "engine",
    engine: "contrastRatio + wcagVerdict",
    inputs: "subtitle colour and the plate behind it",
    output: "the contrast ratio and the level it meets",
    purpose: "Check that subtitles are legible against the actual plate colour rather than against an assumption about it.",
    requiresApproval: false,
    receipt: "both colours, the ratio computed, and the standard applied"
  }),
  A({
    id: "media.caption-type-scale",
    name: "Caption type scale",
    domain: "media",
    status: "engine",
    engine: "typeScale",
    inputs: "a base caption size and a ratio",
    output: "the caption scale in px and rem",
    purpose: "Generate the caption scale once so every title card and lower third stops being decided individually.",
    requiresApproval: false,
    receipt: "the base, the ratio, and every step of the scale produced"
  }),
  A({
    id: "media.episode-metadata",
    name: "Episode metadata",
    domain: "media",
    status: "engine",
    engine: "metaLint",
    inputs: "an episode title and description",
    output: "what each catalogue and player will truncate",
    purpose: "Catch the truncation in an episode title where every surface cuts it at a different width.",
    requiresApproval: false,
    receipt: "each field measured, the limits applied, and the truncation points"
  }),
  A({
    id: "media.subtitle-coverage",
    name: "Subtitle coverage",
    domain: "media",
    status: "engine",
    engine: "localeCoverage",
    inputs: "subtitle tracks per locale against the base",
    output: "which locales clear the shipping bar",
    purpose: "Decide which subtitle tracks ship together, because a missing track is a missing audience.",
    requiresApproval: false,
    receipt: "the base count, each locale's coverage, and the bar applied"
  }),
  A({
    id: "media.subtitle-expansion",
    name: "Subtitle expansion",
    domain: "media",
    status: "engine",
    engine: "stringExpansion",
    inputs: "a source line and the target language",
    output: "the line's expected length when translated",
    purpose: "Anticipate the reading speed a translated subtitle line will demand before the track is produced.",
    requiresApproval: false,
    receipt: "the source line, the expansion range used, and the resulting length"
  }),
  A({
    id: "media.rendition-publish",
    name: "Rendition publish",
    domain: "media",
    status: "workflow",
    engine: "bitrateBudget + loudnessGain",
    inputs: "a mastered asset with its ladder and loudness targets",
    output: "a publishing run to the CDN, gated",
    purpose: "Publish renditions with the ladder and loudness verified and a human approving, because publishing is customer-facing.",
    requiresApproval: true,
    receipt: "the ladder verified, the loudness measured, and the human's approval of the publish"
  }),
  A({
    id: "media.rights-clearance",
    name: "Rights clearance",
    domain: "media",
    status: "workflow",
    engine: "dateTerms + retentionClock",
    inputs: "a piece of licensed material and its grant",
    output: "a clearance window, gated for the licence holder",
    purpose: "Clear licensed material with the window computed and approved, because an expired licence is a takedown.",
    requiresApproval: true,
    receipt: "the grant dates, the cleared window, and the human's approval of the use"
  }),
  /* ── finops ───────────────────────────────────────────────────── */
  A({
    id: "finops.spend-forecast",
    name: "Spend forecast",
    domain: "finops",
    status: "engine",
    engine: "spendForecast",
    inputs: "months of spend for a service or the whole estate",
    output: "the trend and a projected month",
    purpose: "Give finance a trajectory instead of last month's number and an assurance.",
    requiresApproval: false,
    receipt: "the months observed, the fitted trend, and the projection with its caveat"
  }),
  A({
    id: "finops.anomaly-watch",
    name: "Spend anomaly watch",
    domain: "finops",
    status: "engine",
    engine: "anomalyZ",
    inputs: "daily spend samples",
    output: "days out of family, with their z",
    purpose: "Find the day spend moved without a corresponding incident, while the cause is still cheap to find.",
    requiresApproval: false,
    receipt: "the window, the mean and spread, and each flagged day"
  }),
  A({
    id: "finops.unit-cost",
    name: "Unit cost rollup",
    domain: "finops",
    status: "engine",
    engine: "unitEconomics",
    inputs: "revenue, margin, acquisition cost and churn",
    output: "cost per unit and the payback period",
    purpose: "Express infrastructure cost per customer or per thousand requests, which is the number engineering can act on.",
    requiresApproval: false,
    receipt: "the inputs, the cost per unit, and the assumptions the model rests on"
  }),
  A({
    id: "finops.egress-cost",
    name: "Egress cost",
    domain: "finops",
    status: "engine",
    engine: "egressCost",
    inputs: "egress volume, origin price and cache behaviour",
    output: "cost per path and what the cache saves",
    purpose: "Show where egress money actually goes, path by path, instead of treating it as one line item.",
    requiresApproval: false,
    receipt: "the volumes, the prices, and the per-path computation"
  }),
  A({
    id: "finops.cost-percentiles",
    name: "Cost percentiles",
    domain: "finops",
    status: "engine",
    engine: "percentiles",
    inputs: "per-tenant or per-request cost samples",
    output: "the distribution, not just the total",
    purpose: "Find the tenants and requests that carry the tail of the bill, which a total never shows.",
    requiresApproval: false,
    receipt: "the sample, the percentile method, and the distribution readout"
  }),
  A({
    id: "finops.capacity-runway",
    name: "Capacity runway",
    domain: "finops",
    status: "engine",
    engine: "capacityHeadroom",
    inputs: "current use, growth and the commitment threshold",
    output: "when the commitment threshold is reached",
    purpose: "Time a reservation decision rather than making it under pressure when the threshold is already crossed.",
    requiresApproval: false,
    receipt: "the headroom, the growth rate, and the runway before the threshold"
  }),
  A({
    id: "finops.reliability-spend",
    name: "Reliability spend",
    domain: "finops",
    status: "engine",
    engine: "sloErrorBudget",
    inputs: "an SLO and the window it is measured over",
    output: "the error budget and what is left of it",
    purpose: "Frame reliability work as budget spent, which is the only version of the conversation that ends in a decision.",
    requiresApproval: false,
    receipt: "the SLO, the window, and the budget allowed and consumed"
  }),
  A({
    id: "finops.plan-check",
    name: "Plan check",
    domain: "finops",
    status: "engine",
    engine: "growthModel",
    inputs: "a revenue or usage plan with its churn",
    output: "the trajectory and the exit position",
    purpose: "Test whether a plan survives its own churn assumption before the cost model is built on top of it.",
    requiresApproval: false,
    receipt: "the plan modelled period by period, the rates assumed, and the exit position"
  }),
  A({
    id: "finops.retention-audit",
    name: "Retention audit",
    domain: "finops",
    status: "engine",
    engine: "retentionClock",
    inputs: "data classes with creation dates and retention terms",
    output: "what may be deleted and what is overdue",
    purpose: "Find the storage that policy already says should be gone, which is the cheapest saving available.",
    requiresApproval: false,
    receipt: "each class, its retention term, and the days past or remaining"
  }),
  A({
    id: "finops.budget-commit",
    name: "Commitment purchase",
    domain: "finops",
    status: "workflow",
    engine: "spendForecast + egressCost",
    inputs: "a proposed reservation against forecast usage",
    output: "a commitment, gated on spend",
    purpose: "Buy a commitment with the usage modelled and a human approving, because a reservation is money spent up front.",
    requiresApproval: true,
    receipt: "the forecast it rests on, the break-even, and the human's approval of the purchase"
  }),
  A({
    id: "finops.showback-invoice",
    name: "Chargeback run",
    domain: "finops",
    status: "workflow",
    engine: "unitEconomics + percentiles",
    inputs: "costs allocated across teams or tenants",
    output: "an internal invoice run, gated before it is issued",
    purpose: "Issue internal charges with the allocation method stated and approved, because a chargeback nobody agreed to is an argument.",
    requiresApproval: true,
    receipt: "the allocation method, the amounts per team, and the human's approval of the run"
  }),
  /* ── legal ───────────────────────────────────────────────────── */
  A({
    id: "legal.clause-terms",
    name: "Clause terms",
    domain: "legal",
    status: "engine",
    engine: "clauseLint",
    inputs: "a clause and the terms to count",
    output: "the density of undefined terms a dispute would turn on",
    purpose: "Point at the words a contract will be argued over later, while redrafting is still a text edit.",
    requiresApproval: false,
    receipt: "the terms counted, their occurrences, and the density per thousand words"
  }),
  A({
    id: "legal.contract-dates",
    name: "Contract dates",
    domain: "legal",
    status: "engine",
    engine: "dateTerms",
    inputs: "an effective date, term length and notice period",
    output: "expiry and the last day to serve notice",
    purpose: "Put the dates a contract turns on in front of the people who have to act on them, not only the people who signed.",
    requiresApproval: false,
    receipt: "the effective date, the expiry, and the last day to notice"
  }),
  A({
    id: "legal.terminology-drift",
    name: "Defined-term drift",
    domain: "legal",
    status: "engine",
    engine: "terminologyDrift",
    inputs: "a contract and the terms it defines",
    output: "defined terms used inconsistently",
    purpose: "Catch a defined term that wanders, which is how a clear clause becomes an ambiguous one.",
    requiresApproval: false,
    receipt: "the defined terms, the drift found, and where each appears"
  }),
  A({
    id: "legal.clause-structure",
    name: "Clause structure",
    domain: "legal",
    status: "engine",
    engine: "headingLint",
    inputs: "a contract's clause headings",
    output: "the structure and the headings that break it",
    purpose: "Check that a contract's structure matches its own table of contents, which is where cross-references break.",
    requiresApproval: false,
    receipt: "the headings found, the faults listed, and the structure rule applied"
  }),
  A({
    id: "legal.plain-language",
    name: "Plain language",
    domain: "legal",
    status: "engine",
    engine: "readability",
    inputs: "a clause or a policy",
    output: "its reading grade and the sentences that carry it",
    purpose: "Give a policy a reading grade, because a term nobody understands is a term nobody can follow.",
    requiresApproval: false,
    receipt: "the text measured, the grade computed, and the formula applied"
  }),
  A({
    id: "legal.retention-clock",
    name: "Retention clock",
    domain: "legal",
    status: "engine",
    engine: "retentionClock",
    inputs: "document classes with creation dates and retention terms",
    output: "which documents may already be destroyed",
    purpose: "Run document retention as a clock rather than as a spring clean somebody schedules when they remember.",
    requiresApproval: false,
    receipt: "each class, its term, and the days past or remaining"
  }),
  A({
    id: "legal.pii-in-draft",
    name: "Personal data in a draft",
    domain: "legal",
    status: "engine",
    engine: "piiScan",
    inputs: "a draft, an exhibit or a redaction candidate",
    output: "personal-data classes present, samples masked",
    purpose: "Find personal data in material about to be filed, and mask the sample so the finding is not itself a disclosure.",
    requiresApproval: false,
    receipt: "the classes present, the masked samples, and the patterns applied"
  }),
  A({
    id: "legal.redaction-strength",
    name: "Redaction strength",
    domain: "legal",
    status: "engine",
    engine: "stringEntropyBits",
    inputs: "an identifier as redacted",
    output: "the entropy the redaction leaves",
    purpose: "Check that a redaction has removed enough that the identifier cannot be recovered, not merely that it looks shorter.",
    requiresApproval: false,
    receipt: "the redacted form, the entropy remaining, and the requirement applied"
  }),
  A({
    id: "legal.filing-secret-scan",
    name: "Filing secret scan",
    domain: "legal",
    status: "engine",
    engine: "scanSecrets",
    inputs: "documents about to be filed or published",
    output: "credential shapes present in them",
    purpose: "Catch the API key in an exhibit before the exhibit is a public record.",
    requiresApproval: false,
    receipt: "each secret shape found, its location, and the file it came from"
  }),
  A({
    id: "legal.regulatory-filing",
    name: "Regulatory filing",
    domain: "legal",
    status: "workflow",
    engine: "dateTerms + clauseLint",
    inputs: "a filing due to a regulator by a statutory date",
    output: "a filing, gated on the human",
    purpose: "File with the statutory date computed and the signatory approved, because a late filing is a penalty, not a delay.",
    requiresApproval: true,
    receipt: "the due date computed, the documents attached, and the human's approval of the filing"
  }),
  A({
    id: "legal.notice-serve",
    name: "Serve notice",
    domain: "legal",
    status: "workflow",
    engine: "dateTerms",
    inputs: "a notice to be served inside a contractual window",
    output: "a notice served, gated",
    purpose: "Serve a notice inside a window that closes on a fixed date, with the founder or counsel approving the wording.",
    requiresApproval: true,
    receipt: "the window computed, the notice text served, and the human's approval"
  }),
  /* ── privacy ───────────────────────────────────────────────────── */
  A({
    id: "privacy.pii-scan",
    name: "Personal-data scan",
    domain: "privacy",
    status: "engine",
    engine: "piiScan",
    inputs: "a body of text, a sample or an export",
    output: "personal-data classes present, every sample masked",
    purpose: "Establish what personal data a text contains before it is copied into a ticket, a prompt or a repo.",
    requiresApproval: false,
    receipt: "the classes present, the masked samples, and the patterns applied"
  }),
  A({
    id: "privacy.retention-clock",
    name: "Retention clock",
    domain: "privacy",
    status: "engine",
    engine: "retentionClock",
    inputs: "data classes with creation dates and retention terms",
    output: "what is overdue for deletion",
    purpose: "Run deletion on the clock the policy promises, rather than on the quarter somebody remembers it.",
    requiresApproval: false,
    receipt: "each class, its term, and the days past or remaining"
  }),
  A({
    id: "privacy.secret-scan",
    name: "Secret scan",
    domain: "privacy",
    status: "engine",
    engine: "scanSecrets",
    inputs: "repositories, logs or configuration",
    output: "credential shapes found in them",
    purpose: "Find credentials where they should not be, since a secret in a log is a secret with an audience.",
    requiresApproval: false,
    receipt: "each secret shape, its location, and the source scanned"
  }),
  A({
    id: "privacy.identifier-entropy",
    name: "Identifier entropy",
    domain: "privacy",
    status: "engine",
    engine: "stringEntropyBits",
    inputs: "an identifier used to refer to a person",
    output: "the entropy its shape implies",
    purpose: "Check whether a pseudonymous identifier can be reversed by guessing, which is the difference between pseudonymous and anonymous.",
    requiresApproval: false,
    receipt: "the identifier shape, the entropy computed, and the requirement"
  }),
  A({
    id: "privacy.tracker-surface",
    name: "Tracker surface",
    domain: "privacy",
    status: "engine",
    engine: "cspAudit",
    inputs: "a content security policy from a web surface",
    output: "what the policy permits third parties to do",
    purpose: "See what a page actually permits, because a tag manager can widen a policy nobody reopened.",
    requiresApproval: false,
    receipt: "the directives read, what each permits, and the findings"
  }),
  A({
    id: "privacy.notice-structure",
    name: "Notice structure",
    domain: "privacy",
    status: "engine",
    engine: "headingLint",
    inputs: "a privacy notice's headings",
    output: "whether the structure carries the required sections",
    purpose: "Check that a notice is organised so a reader can find the section that applies to them.",
    requiresApproval: false,
    receipt: "the headings found, the sections missing, and the structure rule"
  }),
  A({
    id: "privacy.notice-readability",
    name: "Notice readability",
    domain: "privacy",
    status: "engine",
    engine: "readability",
    inputs: "a privacy notice",
    output: "its reading grade",
    purpose: "Give a notice a reading grade, because informed consent that requires a law degree is neither.",
    requiresApproval: false,
    receipt: "the text measured, the grade computed, and the formula applied"
  }),
  A({
    id: "privacy.access-outliers",
    name: "Access outliers",
    domain: "privacy",
    status: "engine",
    engine: "outliersIqr",
    inputs: "per-actor access counts over a window",
    output: "actors outside the Tukey fence",
    purpose: "Separate an actor whose access pattern is genuinely exceptional from ordinary variation in a busy system.",
    requiresApproval: false,
    receipt: "the quartiles, the fence, and the actors outside it"
  }),
  A({
    id: "privacy.access-percentiles",
    name: "Access percentiles",
    domain: "privacy",
    status: "engine",
    engine: "percentiles",
    inputs: "record-access volumes by system",
    output: "the distribution across systems",
    purpose: "Rank systems by the tail of their access volume, where over-collection shows up first.",
    requiresApproval: false,
    receipt: "the sample, the percentile method, and the readout"
  }),
  A({
    id: "privacy.dsar-respond",
    name: "Data-subject request",
    domain: "privacy",
    status: "workflow",
    engine: "piiScan + retentionClock",
    inputs: "a request from a data subject with a statutory clock",
    output: "a response assembled, gated",
    purpose: "Answer a data-subject request inside its statutory clock with a human approving the disclosure.",
    requiresApproval: true,
    receipt: "the request logged, the clock applied, the records identified, and the human's approval"
  }),
  A({
    id: "privacy.consent-change",
    name: "Consent change",
    domain: "privacy",
    status: "workflow",
    engine: "readability + localeCoverage",
    inputs: "a change to consent wording and the locales it ships in",
    output: "a consent change, gated",
    purpose: "Change consent wording with the reading grade and locale coverage known and a human approving the change.",
    requiresApproval: true,
    receipt: "the wording diff, the locales covered, and the human's approval"
  }),
  /* ── people ───────────────────────────────────────────────────── */
  A({
    id: "people.headcount-model",
    name: "Headcount model",
    domain: "people",
    status: "engine",
    engine: "headcountModel",
    inputs: "current headcount, hire rate and attrition",
    output: "the trajectory and its end state",
    purpose: "Show what a hiring plan does once attrition compounds against it, before the plan is promised to anyone.",
    requiresApproval: false,
    receipt: "the plan modelled month by month, the rates assumed, and the resulting headcount"
  }),
  A({
    id: "people.band-position",
    name: "Band position",
    domain: "people",
    status: "engine",
    engine: "compBand",
    inputs: "a salary band and a proposed offer",
    output: "position in band and compa-ratio",
    purpose: "Place an offer in its band as both a position and a compa-ratio, which are different questions asked with one word.",
    requiresApproval: false,
    receipt: "the band, the offer, the position computed, and the ratio against the midpoint"
  }),
  A({
    id: "people.hiring-funnel",
    name: "Hiring funnel",
    domain: "people",
    status: "engine",
    engine: "funnel",
    inputs: "stage counts from sourcing to offer",
    output: "stage conversions and the step losing the most",
    purpose: "Point recruiting effort at the stage that loses the most people, not the stage with the most candidates.",
    requiresApproval: false,
    receipt: "the counts, each stage's conversion, and the step identified as the constraint"
  }),
  A({
    id: "people.jd-readability",
    name: "Job-description reading",
    domain: "people",
    status: "engine",
    engine: "readability",
    inputs: "a job description",
    output: "its reading grade",
    purpose: "Write a job description people can read, because a posting nobody finishes is a posting nobody answers.",
    requiresApproval: false,
    receipt: "the text measured, the grade computed, and the formula applied"
  }),
  A({
    id: "people.policy-reading-time",
    name: "Policy reading time",
    domain: "people",
    status: "engine",
    engine: "readingTime",
    inputs: "a policy or handbook section",
    output: "how long it takes to read",
    purpose: "Know what a policy actually asks of the people who must follow it before announcing it is mandatory.",
    requiresApproval: false,
    receipt: "the word count, the reading speed assumed, and the time computed"
  }),
  A({
    id: "people.criteria-drift",
    name: "Review-criteria drift",
    domain: "people",
    status: "engine",
    engine: "terminologyDrift",
    inputs: "a review rubric and the terms it defines",
    output: "criteria used inconsistently across sections",
    purpose: "Catch a review criterion that means something different in two places, which is how ratings stop being comparable.",
    requiresApproval: false,
    receipt: "the defined criteria, the drift found, and where each appears"
  }),
  A({
    id: "people.survey-size",
    name: "Survey sample size",
    domain: "people",
    status: "engine",
    engine: "sampleSize",
    inputs: "an effect worth detecting and a baseline rate",
    output: "the responses a survey needs",
    purpose: "Size an engagement survey from the difference worth acting on, so a weak result is not read as a mandate.",
    requiresApproval: false,
    receipt: "the effect, the power chosen, and the responses derived"
  }),
  A({
    id: "people.scorecard-agreement",
    name: "Scorecard agreement",
    domain: "people",
    status: "engine",
    engine: "raterAgreement",
    inputs: "two interviewers' scores for the same candidates",
    output: "agreement and kappa beside it",
    purpose: "Show how much interviewer agreement is chance, which is the number that decides whether a scorecard is a measure.",
    requiresApproval: false,
    receipt: "the scores compared, the chance agreement, and kappa"
  }),
  A({
    id: "people.handbook-structure",
    name: "Handbook structure",
    domain: "people",
    status: "engine",
    engine: "headingLint",
    inputs: "a handbook's headings",
    output: "its structure and the sections that break it",
    purpose: "Check a handbook's structure, because a policy that cannot be found has not been communicated.",
    requiresApproval: false,
    receipt: "the headings found, the faults listed, and the structure rule applied"
  }),
  A({
    id: "people.offer-send",
    name: "Extend an offer",
    domain: "people",
    status: "workflow",
    engine: "compBand + headcountModel",
    inputs: "an approved role with a band and its headcount plan",
    output: "an offer extended, gated",
    purpose: "Extend an offer with the band position computed and a human approving, because an offer is a commitment to a person.",
    requiresApproval: true,
    receipt: "the band position, the plan it fits, and the human's approval of the offer"
  }),
  A({
    id: "people.comp-change",
    name: "Compensation change",
    domain: "people",
    status: "workflow",
    engine: "compBand + unitEconomics",
    inputs: "a proposed change for an individual or a group",
    output: "a pay change, gated",
    purpose: "Change compensation with the band effect and the affordability modelled and a human approving the change.",
    requiresApproval: true,
    receipt: "the band effect, the cost modelled, and the human's approval"
  }),
  /* ── revenue ───────────────────────────────────────────────────── */
  A({
    id: "revenue.pipeline-coverage",
    name: "Pipeline coverage",
    domain: "revenue",
    status: "engine",
    engine: "pipelineCoverage",
    inputs: "a quota and stage-weighted pipeline",
    output: "weighted coverage against the quota",
    purpose: "Answer whether the quarter is covered by weighted pipeline rather than by the size of the list.",
    requiresApproval: false,
    receipt: "each stage, its win rate, the weighted total, and the gap"
  }),
  A({
    id: "revenue.sla-clock",
    name: "SLA clock",
    domain: "revenue",
    status: "engine",
    engine: "slaClock",
    inputs: "tickets with priorities and response times",
    output: "first response against each priority target",
    purpose: "Show attainment ticket by ticket, because an average response time hides every customer who waited all day.",
    requiresApproval: false,
    receipt: "the tickets measured, the targets applied, and the breaches named"
  }),
  A({
    id: "revenue.unit-economics",
    name: "Unit economics",
    domain: "revenue",
    status: "engine",
    engine: "unitEconomics",
    inputs: "revenue, margin, acquisition cost and churn",
    output: "lifetime value, the ratio and payback",
    purpose: "Test whether growth pays for itself before more money is spent proving the question again.",
    requiresApproval: false,
    receipt: "the inputs, the ratio, the payback, and the assumptions behind them"
  }),
  A({
    id: "revenue.revenue-funnel",
    name: "Revenue funnel",
    domain: "revenue",
    status: "engine",
    engine: "funnel",
    inputs: "stage counts from lead to closed",
    output: "stage conversions and the largest proportional loss",
    purpose: "Find the step where revenue leaks instead of the step where marketing is loudest.",
    requiresApproval: false,
    receipt: "the counts, each stage's conversion, and the constraint identified"
  }),
  A({
    id: "revenue.prioritise",
    name: "Deal prioritisation",
    domain: "revenue",
    status: "engine",
    engine: "riceScore",
    inputs: "candidate deals or plays with reach, impact, confidence and effort",
    output: "a ranked list with the inputs visible",
    purpose: "Rank competing plays so disagreement traces to an input somebody chose rather than to seniority.",
    requiresApproval: false,
    receipt: "every candidate scored, the formula used, and the inputs as supplied"
  }),
  A({
    id: "revenue.plan-check",
    name: "Plan check",
    domain: "revenue",
    status: "engine",
    engine: "growthModel",
    inputs: "a revenue plan with its churn and expansion assumptions",
    output: "the trajectory and the exit position",
    purpose: "Test whether a revenue plan survives its own churn assumption before it becomes a hiring plan.",
    requiresApproval: false,
    receipt: "the plan modelled period by period, the rates assumed, and the exit position"
  }),
  A({
    id: "revenue.deal-size-percentiles",
    name: "Deal-size percentiles",
    domain: "revenue",
    status: "engine",
    engine: "percentiles",
    inputs: "closed deal values over a period",
    output: "the distribution, not just the average deal",
    purpose: "Show a deal-size distribution, because an average deal is a customer that does not quite exist.",
    requiresApproval: false,
    receipt: "the sample, the percentile method, and the distribution readout"
  }),
  A({
    id: "revenue.discount-maths",
    name: "Discount maths",
    domain: "revenue",
    status: "engine",
    engine: "unitEconomics",
    inputs: "a proposed discount and the deal economics",
    output: "what the discount costs over the contract",
    purpose: "Price a discount over the life of the contract rather than in the quarter it is granted.",
    requiresApproval: false,
    receipt: "the discount, its cost over the term, and the margin it reduces"
  }),
  A({
    id: "revenue.pipeline-anomaly",
    name: "Pipeline anomaly",
    domain: "revenue",
    status: "engine",
    engine: "anomalyZ",
    inputs: "daily pipeline creation or stage movement",
    output: "days out of family",
    purpose: "Catch a pipeline that moved for a reason nobody recorded, while the reason is still findable.",
    requiresApproval: false,
    receipt: "the window, the mean and spread, and each flagged day"
  }),
  A({
    id: "revenue.quote-issue",
    name: "Issue a quote",
    domain: "revenue",
    status: "workflow",
    engine: "unitEconomics + compBand",
    inputs: "a deal with its terms and approved pricing",
    output: "a quote issued to a customer, gated",
    purpose: "Issue a quote with the economics and the approval chain checked, because a quote is a commitment made in writing.",
    requiresApproval: true,
    receipt: "the economics computed, the approvals recorded, and the human's sign-off"
  }),
  A({
    id: "revenue.discount-approve",
    name: "Approve a discount",
    domain: "revenue",
    status: "workflow",
    engine: "unitEconomics + pipelineCoverage",
    inputs: "a discount request beyond the standard band",
    output: "an exception approved, gated",
    purpose: "Approve a discount beyond policy with its cost modelled and the decision recorded against a name.",
    requiresApproval: true,
    receipt: "the discount modelled over the contract, the coverage effect, and the human's approval"
  }),
  /* ── marketing ───────────────────────────────────────────────────── */
  A({
    id: "marketing.meta-lint",
    name: "Title & meta",
    domain: "marketing",
    status: "engine",
    engine: "metaLint",
    inputs: "a page title, description and slug",
    output: "what each search surface truncates",
    purpose: "Catch the truncation in a search result before a customer reads half a sentence.",
    requiresApproval: false,
    receipt: "each field measured, the display limit applied, and the truncation point named"
  }),
  A({
    id: "marketing.crawl-budget",
    name: "Crawl budget",
    domain: "marketing",
    status: "engine",
    engine: "crawlBudget",
    inputs: "page count, response latency and the allowed rate",
    output: "crawl time and the binding constraint",
    purpose: "Say how long a crawl takes and which limit binds, before an indexing delay is mistaken for a penalty.",
    requiresApproval: false,
    receipt: "the page count, the rate applied, and the limiting factor identified"
  }),
  A({
    id: "marketing.acquisition-funnel",
    name: "Acquisition funnel",
    domain: "marketing",
    status: "engine",
    engine: "funnel",
    inputs: "visitor counts from impression to conversion",
    output: "stage conversions and the largest loss",
    purpose: "Find the stage where acquisition actually leaks instead of the stage with the most traffic.",
    requiresApproval: false,
    receipt: "the counts, each stage's conversion, and the constraint identified"
  }),
  A({
    id: "marketing.campaign-ab",
    name: "Campaign A/B",
    domain: "marketing",
    status: "engine",
    engine: "abTest",
    inputs: "two creative variants with conversions",
    output: "the lift and whether the sample supports it",
    purpose: "Read a creative test with its uncertainty, so a winner is chosen on evidence rather than on the highest number.",
    requiresApproval: false,
    receipt: "both variants, the test applied, and the interval around the difference"
  }),
  A({
    id: "marketing.spend-forecast",
    name: "Paid spend forecast",
    domain: "marketing",
    status: "engine",
    engine: "spendForecast",
    inputs: "months of paid-media spend",
    output: "the trend and a projected month",
    purpose: "Give a channel a trajectory so budget conversations start from a line rather than a request.",
    requiresApproval: false,
    receipt: "the months observed, the fitted trend, and the projection"
  }),
  A({
    id: "marketing.channel-anomaly",
    name: "Channel anomaly",
    domain: "marketing",
    status: "engine",
    engine: "anomalyZ",
    inputs: "daily sessions, spend or conversions",
    output: "days out of family",
    purpose: "Notice a channel moving while nobody changed a campaign, which is the day to look rather than next week.",
    requiresApproval: false,
    receipt: "the window, the mean and spread, and each flagged day"
  }),
  A({
    id: "marketing.unit-economics",
    name: "CAC & payback",
    domain: "marketing",
    status: "engine",
    engine: "unitEconomics",
    inputs: "revenue, margin, acquisition cost and churn",
    output: "lifetime value, the ratio and payback",
    purpose: "Bound what a customer may cost to acquire, which is the ceiling every campaign has to live under.",
    requiresApproval: false,
    receipt: "the inputs, the ratio, the payback, and the assumptions behind them"
  }),
  A({
    id: "marketing.landing-readability",
    name: "Landing-page reading",
    domain: "marketing",
    status: "engine",
    engine: "readability",
    inputs: "landing-page copy",
    output: "its reading grade",
    purpose: "Match the reading grade of a page to the audience it is actually written for.",
    requiresApproval: false,
    receipt: "the text measured, the grade computed, and the formula applied"
  }),
  A({
    id: "marketing.locale-coverage",
    name: "Locale coverage",
    domain: "marketing",
    status: "engine",
    engine: "localeCoverage",
    inputs: "translated campaign assets per locale",
    output: "which locales can run together",
    purpose: "Decide which locales launch as one campaign, because a missing translation is a missing market.",
    requiresApproval: false,
    receipt: "the base count, each locale's coverage, and the bar applied"
  }),
  A({
    id: "marketing.campaign-launch",
    name: "Launch a campaign",
    domain: "marketing",
    status: "workflow",
    engine: "unitEconomics + abTest",
    inputs: "a campaign ready to spend against an audience",
    output: "a launch, gated",
    purpose: "Launch a campaign with the economics bounded and a human approving, because a launch spends money in public.",
    requiresApproval: true,
    receipt: "the budget, the expected payback, and the human's approval of the launch"
  }),
  A({
    id: "marketing.spend-commit",
    name: "Commit ad spend",
    domain: "marketing",
    status: "workflow",
    engine: "spendForecast + anomalyZ",
    inputs: "a committed spend against forecast performance",
    output: "a spend commitment, gated",
    purpose: "Commit spend with the forecast and its spread in front of a human, because committed media is money already spent.",
    requiresApproval: true,
    receipt: "the forecast it rests on, the downside modelled, and the human's approval"
  }),
  /* ── localisation ───────────────────────────────────────────────────── */
  A({
    id: "locale.coverage",
    name: "Translation coverage",
    domain: "locale",
    status: "engine",
    engine: "localeCoverage",
    inputs: "translated keys per locale",
    output: "which locales clear the shipping bar",
    purpose: "Decide which locales ship from what is on disk, before a rollout discovers the gap in production.",
    requiresApproval: false,
    receipt: "the key count, each locale's coverage, and the bar applied"
  }),
  A({
    id: "locale.expansion",
    name: "String expansion",
    domain: "locale",
    status: "engine",
    engine: "stringExpansion",
    inputs: "a source string and the target language",
    output: "the length it will take when translated",
    purpose: "Design to the length a string becomes rather than the length it was written at.",
    requiresApproval: false,
    receipt: "the source string, the expansion range used, and the resulting length"
  }),
  A({
    id: "locale.heading-structure",
    name: "Localised structure",
    domain: "locale",
    status: "engine",
    engine: "headingLint",
    inputs: "headings across translated pages",
    output: "structure that survives translation",
    purpose: "Keep hierarchy readable after translation, where titles expand and headings wrap into the body.",
    requiresApproval: false,
    receipt: "the headings found, the faults listed, and the structure rule applied"
  }),
  A({
    id: "locale.terminology-drift",
    name: "Glossary drift",
    domain: "locale",
    status: "engine",
    engine: "terminologyDrift",
    inputs: "translated content and the glossary it declares",
    output: "terms translated inconsistently",
    purpose: "Keep a product's vocabulary consistent across locales, which is what a glossary is for.",
    requiresApproval: false,
    receipt: "the glossary, the drift found, and where each appears"
  }),
  A({
    id: "locale.translated-readability",
    name: "Translated readability",
    domain: "locale",
    status: "engine",
    engine: "readability",
    inputs: "a translated page",
    output: "its reading grade in the target language",
    purpose: "Check that a translation is readable in its own language rather than merely faithful to the source.",
    requiresApproval: false,
    receipt: "the text measured, the grade computed, and the formula applied"
  }),
  A({
    id: "locale.script-contrast",
    name: "Script contrast",
    domain: "locale",
    status: "engine",
    engine: "contrastRatio + wcagVerdict",
    inputs: "text and background colours used with a script",
    output: "the ratio and the level it meets",
    purpose: "Check contrast for the script actually being rendered, where stroke weight and glyph size change legibility.",
    requiresApproval: false,
    receipt: "both colours, the ratio computed, and the standard applied"
  }),
  A({
    id: "locale.script-type-scale",
    name: "Script type scale",
    domain: "locale",
    status: "engine",
    engine: "typeScale",
    inputs: "a base size and a ratio for a script",
    output: "the scale that script needs",
    purpose: "Give each script a scale its glyphs can carry, instead of scaling Latin metrics by eye.",
    requiresApproval: false,
    receipt: "the base, the ratio, and every step of the scale produced"
  }),
  A({
    id: "locale.grid-snap",
    name: "Script grid",
    domain: "locale",
    status: "engine",
    engine: "snapToGrid",
    inputs: "spacing values used with a script",
    output: "values off the grid and their distance from it",
    purpose: "Keep spacing sane where line heights differ per script and layouts drift a few pixels at a time.",
    requiresApproval: false,
    receipt: "each value checked, off-grid values named, and the direction of correction"
  }),
  A({
    id: "locale.review-agreement",
    name: "Review agreement",
    domain: "locale",
    status: "engine",
    engine: "raterAgreement",
    inputs: "two reviewers' verdicts on the same strings",
    output: "agreement and kappa beside it",
    purpose: "Show whether translation reviewers actually agree, which decides whether review is a process or an opinion.",
    requiresApproval: false,
    receipt: "the verdicts compared, the chance agreement, and kappa"
  }),
  A({
    id: "locale.locale-release",
    name: "Locale release",
    domain: "locale",
    status: "workflow",
    engine: "localeCoverage + stringExpansion",
    inputs: "a locale ready to be enabled for users",
    output: "a locale enabled, gated",
    purpose: "Enable a locale with coverage and layout risk known and a human approving, because a locale is a promise to users.",
    requiresApproval: true,
    receipt: "the coverage, the expansion risks found, and the human's approval"
  }),
  A({
    id: "locale.glossary-commit",
    name: "Publish a glossary",
    domain: "locale",
    status: "workflow",
    engine: "terminologyDrift + headingLint",
    inputs: "a glossary change that binds future translations",
    output: "a glossary published, gated",
    purpose: "Change the vocabulary every future translation must follow, with the diff reviewed and a human approving it.",
    requiresApproval: true,
    receipt: "the terms changed, the affected locales, and the human's approval of the change"
  }),
  /* ── supply chain ───────────────────────────────────────────────────── */
  A({
    id: "supply.eoq",
    name: "Order quantity",
    domain: "supply",
    status: "engine",
    engine: "eoq",
    inputs: "annual demand, order cost and holding cost",
    output: "the order size that minimises both costs",
    purpose: "Set order sizes from the trade-off between ordering and holding, which is the argument that never ends otherwise.",
    requiresApproval: false,
    receipt: "the inputs, the quantity derived, and the cost either side of it"
  }),
  A({
    id: "supply.safety-stock",
    name: "Safety stock",
    domain: "supply",
    status: "engine",
    engine: "safetyStock",
    inputs: "demand, its spread, lead time and a service level",
    output: "the buffer and the reorder point",
    purpose: "Put a price on a service level, because the last few points of availability cost more than the rest combined.",
    requiresApproval: false,
    receipt: "the inputs, the service level applied, and the buffer it requires"
  }),
  A({
    id: "supply.lead-percentiles",
    name: "Lead-time percentiles",
    domain: "supply",
    status: "engine",
    engine: "percentiles",
    inputs: "supplier lead times recorded per order",
    output: "p50, p95 and p99 lead times",
    purpose: "Plan against the lead time that happens, not the one on the purchase order.",
    requiresApproval: false,
    receipt: "the sample, the percentile method, and the lead-time readout"
  }),
  A({
    id: "supply.demand-outliers",
    name: "Demand outliers",
    domain: "supply",
    status: "engine",
    engine: "outliersIqr",
    inputs: "daily or weekly demand figures",
    output: "periods outside the Tukey fence",
    purpose: "Separate a genuine demand spike from the ordinary variation that would otherwise set the buffer.",
    requiresApproval: false,
    receipt: "the quartiles, the fence, and every period outside it"
  }),
  A({
    id: "supply.demand-forecast",
    name: "Demand forecast",
    domain: "supply",
    status: "engine",
    engine: "spendForecast",
    inputs: "period demand for one item",
    output: "the trend and a projected period",
    purpose: "Give replenishment a trajectory so the order is placed before the stockout rather than after it.",
    requiresApproval: false,
    receipt: "the periods observed, the fitted trend, and the projection"
  }),
  A({
    id: "supply.supplier-sla",
    name: "Supplier SLA clock",
    domain: "supply",
    status: "engine",
    engine: "slaClock",
    inputs: "orders with promised and actual dates",
    output: "delivery performance against the promise",
    purpose: "Measure a supplier against the promise, order by order, rather than against a quarterly impression.",
    requiresApproval: false,
    receipt: "the orders, the promise dates, and the performance computed"
  }),
  A({
    id: "supply.shelf-life",
    name: "Shelf-life clock",
    domain: "supply",
    status: "engine",
    engine: "retentionClock",
    inputs: "batches with receipt dates and shelf lives",
    output: "what expires next and what is already past",
    purpose: "Rotate stock on the clock a batch actually carries, before expiry turns inventory into waste.",
    requiresApproval: false,
    receipt: "each batch, its shelf life, and the days remaining"
  }),
  A({
    id: "supply.warehouse-headroom",
    name: "Warehouse headroom",
    domain: "supply",
    status: "engine",
    engine: "capacityHeadroom",
    inputs: "current occupancy, growth and the practical ceiling",
    output: "when the ceiling is reached",
    purpose: "Turn warehouse growth into a date so the next lease is negotiated before the space runs out.",
    requiresApproval: false,
    receipt: "the occupancy, the growth rate, and the runway to the ceiling"
  }),
  A({
    id: "supply.network-growth",
    name: "Network growth check",
    domain: "supply",
    status: "engine",
    engine: "growthModel",
    inputs: "a supply-network plan with its churn",
    output: "the trajectory and its end state",
    purpose: "Test a network plan against its own attrition before it becomes a capital commitment.",
    requiresApproval: false,
    receipt: "the plan modelled period by period, the rates assumed, and the exit position"
  }),
  A({
    id: "supply.po-issue",
    name: "Raise a purchase order",
    domain: "supply",
    status: "workflow",
    engine: "eoq + safetyStock",
    inputs: "a replenishment need with quantity and timing",
    output: "a purchase order, gated",
    purpose: "Raise a purchase order with the quantity and timing computed and a human approving, because a PO is money committed.",
    requiresApproval: true,
    receipt: "the quantity, the timing, the cost, and the human's approval"
  }),
  A({
    id: "supply.supplier-commit",
    name: "Supplier commitment",
    domain: "supply",
    status: "workflow",
    engine: "safetyStock + slaClock",
    inputs: "a volume commitment to a supplier",
    output: "a commitment, gated",
    purpose: "Commit volume with the service-level effect and the supplier's record modelled, and a human approving.",
    requiresApproval: true,
    receipt: "the volume, the service-level effect, the supplier's record, and the human's approval"
  }),
  /* ── web3 ───────────────────────────────────────────────────── */
  A({
    id: "web3.gas-plan",
    name: "Gas plan",
    domain: "web3",
    status: "engine",
    engine: "gasPlan",
    inputs: "gas units, the fee market and the price of the asset",
    output: "cost per operation and for the batch",
    purpose: "Put a cost on an on-chain operation before the batch is written, when the design can still change.",
    requiresApproval: false,
    receipt: "the units, the fee components, and the cost computed per operation"
  }),
  A({
    id: "web3.token-decimals",
    name: "Token decimals",
    domain: "web3",
    status: "engine",
    engine: "tokenDecimals",
    inputs: "a raw base-unit amount and the token's decimals",
    output: "the human amount, and back again",
    purpose: "Convert base units in integer arithmetic, which is where a decimal point silently becomes a decimal error.",
    requiresApproval: false,
    receipt: "the raw amount, the decimals, and the round trip verified"
  }),
  A({
    id: "web3.seed-entropy",
    name: "Seed entropy",
    domain: "web3",
    status: "engine",
    engine: "stringEntropyBits",
    inputs: "a seed phrase or key as generated",
    output: "the entropy its structure implies",
    purpose: "Check that a seed has the entropy it needs before it holds anything worth taking.",
    requiresApproval: false,
    receipt: "the entropy computed, the requirement, and the key's structure"
  }),
  A({
    id: "web3.key-material-scan",
    name: "Key material scan",
    domain: "web3",
    status: "engine",
    engine: "scanSecrets",
    inputs: "repositories, configs and deployment scripts",
    output: "key material found in them",
    purpose: "Find a private key that reached a repository, because that is not a rotation, it is a compromise.",
    requiresApproval: false,
    receipt: "each key shape found, where it appeared, and the source scanned"
  }),
  A({
    id: "web3.session-token",
    name: "Session token audit",
    domain: "web3",
    status: "engine",
    engine: "jwtInspect",
    inputs: "a session token issued by the app",
    output: "its claims, scopes and expiry, decoded",
    purpose: "Read what a session token grants, because a widened scope outlives the reason it was granted.",
    requiresApproval: false,
    receipt: "the decoded claims, the scopes present, and the expiry"
  }),
  A({
    id: "web3.dapp-headers",
    name: "dApp header audit",
    domain: "web3",
    status: "engine",
    engine: "cspAudit",
    inputs: "the content security policy a dApp serves",
    output: "what the policy permits",
    purpose: "See what a front end allows third parties to run, because a wallet session deserves the strictest policy on the estate.",
    requiresApproval: false,
    receipt: "the directives read, what each permits, and the findings"
  }),
  A({
    id: "web3.rpc-rate-plan",
    name: "RPC rate plan",
    domain: "web3",
    status: "engine",
    engine: "tokenBucketPlan",
    inputs: "read volume and the provider's rate limit",
    output: "a token-bucket plan that holds under it",
    purpose: "Keep RPC calls inside a provider's limit before the provider does it for you, at the worst moment.",
    requiresApproval: false,
    receipt: "the rate, the bucket plan, and the burst permitted"
  }),
  A({
    id: "web3.call-payload",
    name: "Call payload",
    domain: "web3",
    status: "engine",
    engine: "payloadBudget",
    inputs: "a contract call's calldata shape",
    output: "its size against block and cost budgets",
    purpose: "Keep calldata inside its budget, where every byte costs gas on every single call.",
    requiresApproval: false,
    receipt: "the payload measured, the budget, and the fields that dominate it"
  }),
  A({
    id: "web3.treasury-runway",
    name: "Treasury runway",
    domain: "web3",
    status: "engine",
    engine: "spendForecast",
    inputs: "months of treasury outflows",
    output: "the trend and a projected month",
    purpose: "Give a treasury a runway in months, which is the number that decides when a raise starts.",
    requiresApproval: false,
    receipt: "the months observed, the fitted trend, and the projection"
  }),
  A({
    id: "web3.tx-sign",
    name: "Sign a transaction",
    domain: "web3",
    status: "workflow",
    engine: "gasPlan + tokenDecimals",
    inputs: "a prepared transaction with its cost",
    output: "a signed transaction, gated",
    purpose: "Sign a transaction with the cost and the amounts verified in integer arithmetic and a human approving the signature.",
    requiresApproval: true,
    receipt: "the transaction, its gas cost, the amounts verified, and the human's approval"
  }),
  A({
    id: "web3.key-ceremony",
    name: "Key ceremony",
    domain: "web3",
    status: "workflow",
    engine: "stringEntropyBits + scanSecrets",
    inputs: "a key generation and custody procedure",
    output: "a ceremony executed, gated",
    purpose: "Run a key ceremony with entropy verified, custody recorded, and a human approving each step in the room.",
    requiresApproval: true,
    receipt: "each step witnessed, the entropy verified, and the human's approval recorded"
  }),
  /* ── frontend (deepened) ───────────────────────────────────────────────────── */
  A({
    id: "fe.focus-targets",
    name: "Focus target sizes",
    domain: "frontend",
    status: "engine",
    engine: "touchTargets",
    inputs: "interactive elements and their rendered sizes",
    output: "which controls are too small to target",
    purpose: "Treat pointer and keyboard targets with the same minimums as touch, because a trackpad is not a mouse.",
    requiresApproval: false,
    receipt: "each element measured, the floor applied, and the spacing exception noted"
  }),
  A({
    id: "fe.label-expansion",
    name: "Label expansion",
    domain: "frontend",
    status: "engine",
    engine: "stringExpansion",
    inputs: "a UI label and the locales it ships in",
    output: "the length that label becomes",
    purpose: "Size a button for its longest translation rather than for the English it was designed in.",
    requiresApproval: false,
    receipt: "the label, the expansion range used, and the resulting length"
  }),
  A({
    id: "fe.release",
    name: "Frontend release",
    domain: "frontend",
    status: "workflow",
    engine: "snapToGrid + localeCoverage",
    inputs: "a front-end build with its token set and locales",
    output: "a release published, gated",
    purpose: "Publish a front-end release with design tokens and locale coverage checked and a human approving the publish.",
    requiresApproval: true,
    receipt: "the token check, the locale coverage, and the human's approval of the release"
  }),
  /* ── engineering (deepened) ───────────────────────────────────────────────────── */
  A({
    id: "dev.retention-audit",
    name: "Branch retention",
    domain: "dev",
    status: "engine",
    engine: "retentionClock",
    inputs: "branches with last-commit dates and a retention term",
    output: "branches past their retention date",
    purpose: "Retire stale branches on a clock, so review surfaces do not slowly fill with abandoned work.",
    requiresApproval: false,
    receipt: "each branch, its age, and the days past its retention term"
  }),
  A({
    id: "dev.dependency-window",
    name: "Dependency window",
    domain: "dev",
    status: "engine",
    engine: "dateTerms",
    inputs: "a support window and the notice a deprecation needs",
    output: "the last date to migrate off a dependency",
    purpose: "Plan a dependency migration against the support window rather than against the announcement.",
    requiresApproval: false,
    receipt: "the window dates, the migration deadline, and the days remaining"
  }),
  A({
    id: "dev.release-tag",
    name: "Tag a release",
    domain: "dev",
    status: "workflow",
    engine: "nextVersion + satisfiesRange",
    inputs: "a merged change set and the current version",
    output: "a release tag, gated",
    purpose: "Tag a release with the version derived from the changes and a human approving, because a tag is a promise to consumers.",
    requiresApproval: true,
    receipt: "the version derived, the range check, and the human's approval of the tag"
  }),
  /* ── api (deepened) ───────────────────────────────────────────────────── */
  A({
    id: "api.response-budget",
    name: "Response budget",
    domain: "api",
    status: "engine",
    engine: "payloadBudget",
    inputs: "an endpoint's response shape",
    output: "its size against the declared budget",
    purpose: "Hold an endpoint's response inside a budget so one new field does not double a mobile payload.",
    requiresApproval: false,
    receipt: "the shape measured, the budget, and the fields that dominate it"
  }),
  A({
    id: "api.sla-attainment",
    name: "API SLA attainment",
    domain: "api",
    status: "engine",
    engine: "slaClock",
    inputs: "requests with priority classes and response times",
    output: "attainment against each class target",
    purpose: "Report API performance per priority class, because one target for every caller is a target for none.",
    requiresApproval: false,
    receipt: "the requests, the class targets, and the breaches named"
  }),
  A({
    id: "api.version-retire",
    name: "Retire an API version",
    domain: "api",
    status: "workflow",
    engine: "satisfiesRange + dateTerms",
    inputs: "a version marked for retirement and its consumers",
    output: "a retirement, gated",
    purpose: "Retire an API version with the deprecation window computed and a human approving, because consumers are still calling it.",
    requiresApproval: true,
    receipt: "the consumers listed, the notice window, and the human's approval of the retirement"
  }),
  /* ── data (deepened) ───────────────────────────────────────────────────── */
  A({
    id: "data.split-audit",
    name: "Dataset split audit",
    domain: "data",
    status: "engine",
    engine: "splitAudit",
    inputs: "a dataset's split proportions and duplicates",
    output: "whether the split leaks",
    purpose: "Check that a published dataset's split does not leak, because a leaked benchmark is a benchmark nobody trusts.",
    requiresApproval: false,
    receipt: "the proportions, the duplicates found, and the grouping rule"
  }),
  A({
    id: "data.retention-clock",
    name: "Dataset retention",
    domain: "data",
    status: "engine",
    engine: "retentionClock",
    inputs: "datasets with creation dates and retention terms",
    output: "datasets past their retention date",
    purpose: "Run dataset retention as a clock so a training set does not outlive the consent it was collected under.",
    requiresApproval: false,
    receipt: "each dataset, its term, and the days past or remaining"
  }),
  A({
    id: "data.publish-dataset",
    name: "Publish a dataset",
    domain: "data",
    status: "workflow",
    engine: "outliersIqr + retentionClock",
    inputs: "a dataset ready for publication",
    output: "a publication, gated",
    purpose: "Publish a dataset with outliers reviewed and retention checked, and a human approving what becomes public.",
    requiresApproval: true,
    receipt: "the outlier review, the retention check, and the human's approval of the publication"
  }),
  /* ── security (deepened) ───────────────────────────────────────────────────── */
  A({
    id: "security.key-entropy",
    name: "Key entropy",
    domain: "security",
    status: "engine",
    engine: "stringEntropyBits",
    inputs: "keys as generated by a service",
    output: "the entropy their shape implies",
    purpose: "Verify that keys have the entropy their purpose requires, which is cheaper than discovering it during an incident.",
    requiresApproval: false,
    receipt: "the key shape, the entropy computed, and the requirement applied"
  }),
  A({
    id: "security.access-anomaly",
    name: "Access anomaly",
    domain: "security",
    status: "engine",
    engine: "anomalyZ",
    inputs: "per-identity access counts",
    output: "identities whose volume is out of family",
    purpose: "Find the identity that changed behaviour this week, while the change is still explainable.",
    requiresApproval: false,
    receipt: "the window, the mean and spread, and each identity flagged with its z"
  }),
  A({
    id: "security.key-ceremony",
    name: "Key ceremony",
    domain: "security",
    status: "workflow",
    engine: "stringEntropyBits + scanSecrets",
    inputs: "a key generation and custody procedure",
    output: "a ceremony executed, gated",
    purpose: "Run a key ceremony with each step witnessed and a human approving, because custody is only as good as its record.",
    requiresApproval: true,
    receipt: "each step witnessed, the entropy verified, and the human's approval recorded"
  }),
  /* ── reliability (deepened) ───────────────────────────────────────────────────── */
  A({
    id: "ops.capacity-runway",
    name: "Capacity runway",
    domain: "ops",
    status: "engine",
    engine: "capacityHeadroom",
    inputs: "headroom, growth and the threshold",
    output: "how long until the threshold is reached",
    purpose: "Schedule capacity work from a date rather than from the pager that announces it.",
    requiresApproval: false,
    receipt: "the headroom, the growth rate, and the runway before the threshold"
  }),
  A({
    id: "ops.incident-percentiles",
    name: "Incident percentiles",
    domain: "ops",
    status: "engine",
    engine: "percentiles",
    inputs: "incident durations by severity",
    output: "the distribution of duration, not the mean",
    purpose: "See how long incidents actually last at the tail, which is what an on-call rotation experiences.",
    requiresApproval: false,
    receipt: "the sample, the percentile method, and the duration readout"
  }),
  A({
    id: "ops.postmortem-publish",
    name: "Publish a postmortem",
    domain: "ops",
    status: "workflow",
    engine: "readability + headingLint",
    inputs: "a postmortem ready for the wider team",
    output: "a publication, gated",
    purpose: "Publish a postmortem with its structure and readability checked and a human approving what goes on the record.",
    requiresApproval: true,
    receipt: "the structure check, the readability measure, and the human's approval"
  }),
  /* ── docs (deepened) ───────────────────────────────────────────────────── */
  A({
    id: "docs.translation-expansion",
    name: "Doc expansion",
    domain: "docs",
    status: "engine",
    engine: "stringExpansion",
    inputs: "a documentation string and its locales",
    output: "the length it takes when translated",
    purpose: "Anticipate the layout damage a translation does to documentation built in English.",
    requiresApproval: false,
    receipt: "the string, the expansion range used, and the resulting length"
  }),
  A({
    id: "docs.review-agreement",
    name: "Doc review agreement",
    domain: "docs",
    status: "engine",
    engine: "raterAgreement",
    inputs: "two reviewers' verdicts on the same pages",
    output: "agreement and kappa beside it",
    purpose: "Check whether documentation review is a process or two people with different opinions.",
    requiresApproval: false,
    receipt: "the verdicts compared, the chance agreement, and kappa"
  }),
  A({
    id: "docs.publish-runbook",
    name: "Publish a runbook",
    domain: "docs",
    status: "workflow",
    engine: "headingLint + citationLint",
    inputs: "a runbook ready for the on-call rotation",
    output: "a publication, gated",
    purpose: "Publish a runbook with its structure and citations checked and a human approving, because somebody will follow it at 3am.",
    requiresApproval: true,
    receipt: "the structure check, the citations verified, and the human's approval"
  }),
  /* ── growth (deepened) ───────────────────────────────────────────────────── */
  A({
    id: "growth.experiment-size",
    name: "Experiment size",
    domain: "growth",
    status: "engine",
    engine: "sampleSize",
    inputs: "an effect worth detecting and a baseline rate",
    output: "the sample the experiment needs",
    purpose: "Size an experiment from the effect worth acting on, so a null result is a finding rather than a shrug.",
    requiresApproval: false,
    receipt: "the effect, the power chosen, and the sample derived"
  }),
  A({
    id: "growth.metric-anomaly",
    name: "Metric anomaly",
    domain: "growth",
    status: "engine",
    engine: "anomalyZ",
    inputs: "a daily growth metric",
    output: "days out of family",
    purpose: "Catch a metric that moved without a release or a campaign to explain it.",
    requiresApproval: false,
    receipt: "the window, the mean and spread, and each flagged day"
  }),
  A({
    id: "growth.pricing-page",
    name: "Publish a pricing page",
    domain: "growth",
    status: "workflow",
    engine: "unitEconomics + metaLint",
    inputs: "a price change and the page presenting it",
    output: "a publication, gated",
    purpose: "Publish a pricing page with the economics modelled and a human approving, because a price is a promise to customers.",
    requiresApproval: true,
    receipt: "the economics modelled, the page checked, and the human's approval of the publication"
  }),
  /* ── healthcare ───────────────────────────────────────────────────── */
  A({
    id: "health.news2",
    name: "NEWS2 score",
    domain: "health",
    status: "engine",
    engine: "news2Score",
    inputs: "six physiological observations and consciousness",
    output: "the NEWS2 total and band, with the table",
    purpose: "Compute the Royal College of Physicians early-warning score from observations, and print the table so a clinician can argue with it.",
    requiresApproval: false,
    receipt: "each parameter, its score, the total, and the explicit statement that this is not a diagnosis"
  }),
  A({
    id: "health.occupancy",
    name: "Ward occupancy",
    domain: "health",
    status: "engine",
    engine: "bedOccupancy",
    inputs: "occupied beds, named beds and arrivals per day",
    output: "occupancy and the length of stay Little's law implies",
    purpose: "Turn a ward census into occupancy and implied length of stay, which are identities, not forecasts.",
    requiresApproval: false,
    receipt: "the census, the occupancy, and the Little's-law length of stay with its assumption stated"
  }),
  A({
    id: "health.triage-severity",
    name: "Triage severity",
    domain: "health",
    status: "engine",
    engine: "incidentSeverity",
    inputs: "impact numbers from triage",
    output: "an S1\u2013S4 call with the rule that produced it",
    purpose: "Assign a severity from impact using a printed rule, so the call can be argued with during the incident.",
    requiresApproval: false,
    receipt: "the impact data, the severity, and the rule applied"
  }),
  A({
    id: "health.ed-wait",
    name: "ED wait clock",
    domain: "health",
    status: "engine",
    engine: "slaClock",
    inputs: "arrivals with priority and time-to-seen",
    output: "first-seen against each priority target",
    purpose: "Show emergency-department waits against the target, case by case, because an average hides the person who waited all day.",
    requiresApproval: false,
    receipt: "the cases measured, the targets applied, and the breaches named"
  }),
  A({
    id: "health.los-percentiles",
    name: "Length-of-stay percentiles",
    domain: "health",
    status: "engine",
    engine: "percentiles",
    inputs: "length-of-stay samples from a ward",
    output: "p50, p95 and p99 rather than a mean",
    purpose: "Report length of stay at the percentiles a bed manager feels, because a mean stay is a patient who does not quite exist.",
    requiresApproval: false,
    receipt: "the sample, the percentile method, and the readout"
  }),
  A({
    id: "health.sample-size",
    name: "Audit sample size",
    domain: "health",
    status: "engine",
    engine: "sampleSize",
    inputs: "an effect worth detecting and a baseline rate",
    output: "the notes an audit needs",
    purpose: "Size a clinical-audit sample from the difference worth acting on, so a null result is a finding.",
    requiresApproval: false,
    receipt: "the effect, the power chosen, and the sample derived"
  }),
  A({
    id: "health.retention",
    name: "Record retention",
    domain: "health",
    status: "engine",
    engine: "retentionClock",
    inputs: "record classes with creation dates and retention terms",
    output: "what is overdue for destruction",
    purpose: "Run clinical-record retention as a clock, which is the finding an auditor asks about first.",
    requiresApproval: false,
    receipt: "each class, its term, and the days past or remaining"
  }),
  A({
    id: "health.protocol-structure",
    name: "Protocol structure",
    domain: "health",
    status: "engine",
    engine: "headingLint",
    inputs: "a protocol's headings",
    output: "the structure and the headings that break it",
    purpose: "Check that a protocol is organised so a reader at 3am can find the section that applies.",
    requiresApproval: false,
    receipt: "the headings found, the faults listed, and the structure rule applied"
  }),
  A({
    id: "health.consent-readability",
    name: "Consent readability",
    domain: "health",
    status: "engine",
    engine: "readability",
    inputs: "a consent form",
    output: "its reading grade",
    purpose: "Give a consent form a reading grade, because informed consent that requires a degree is neither.",
    requiresApproval: false,
    receipt: "the text measured, the grade computed, and the formula applied"
  }),
  A({
    id: "health.discharge-plan",
    name: "Discharge plan",
    domain: "health",
    status: "workflow",
    engine: "bedOccupancy + slaClock",
    inputs: "a discharge package with destination and follow-up clock",
    output: "a discharge, gated",
    purpose: "Issue a discharge with occupancy and follow-up clocks known and a human approving, because a discharge is a patient leaving the building.",
    requiresApproval: true,
    receipt: "the occupancy, the follow-up clock, and the human's approval of the discharge"
  }),
  A({
    id: "health.protocol-publish",
    name: "Publish a protocol",
    domain: "health",
    status: "workflow",
    engine: "headingLint + readability",
    inputs: "a protocol ready for the ward",
    output: "a publication, gated",
    purpose: "Publish a protocol with its structure and readability checked and a human approving, because somebody will follow it at 3am.",
    requiresApproval: true,
    receipt: "the structure check, the readability measure, and the human's approval of the publication"
  })
]);
function specialistsByDomain(domain) {
  return SPECIALISTS.filter((s) => s.domain === domain);
}
function findSpecialist(id) {
  return SPECIALISTS.find((s) => s.id === id);
}
function specialistStatus() {
  return {
    total: SPECIALISTS.length,
    engine: SPECIALISTS.filter((s) => s.status === "engine").length,
    workflow: SPECIALISTS.filter((s) => s.status === "workflow").length,
    requiringApproval: SPECIALISTS.filter((s) => s.requiresApproval).length,
    domains: new Set(SPECIALISTS.map((s) => s.domain)).size
  };
}

// src/specialists/index.ts
var TOOLS = Object.freeze([
  ...FRONTEND_TOOLS,
  ...DEV_TOOLS,
  ...API_TOOLS,
  ...DATA_TOOLS,
  ...SECURITY_TOOLS,
  ...OPS_TOOLS,
  ...DOCS_TOOLS,
  ...GROWTH_TOOLS,
  ...SYSTEMS_TOOLS,
  ...INTELLIGENCE_TOOLS,
  ...GOVERNANCE_TOOLS,
  ...COMMERCE_TOOLS,
  ...HEALTH_TOOLS
]);
var DOMAINS = Object.freeze([
  { id: "frontend", label: "Frontend", blurb: "Colour, contrast, type and spacing \u2014 the parts of design that are arithmetic." },
  { id: "dev", label: "Engineering", blurb: "Versions, commits, status codes, retry ladders and schedules." },
  { id: "api", label: "API", blurb: "Rate limits, payload budgets, idempotency keys and paging." },
  { id: "data", label: "Data", blurb: "Percentiles, outliers, experiment readouts and sample sizing." },
  { id: "security", label: "Security", blurb: "Secret shapes, token decoding, headers and entropy \u2014 as measures, not verdicts." },
  { id: "ops", label: "Reliability", blurb: "Error budgets, capacity runway, severity and deploy risk." },
  { id: "docs", label: "Docs", blurb: "Reading level, length, heading structure and terminology drift." },
  { id: "growth", label: "Growth", blurb: "Unit economics, funnels, prioritisation and revenue trajectory." },
  { id: "mobile", label: "Mobile", blurb: "Touch targets and the release size budget \u2014 the two that decide whether an app is usable and shippable." },
  { id: "cloud", label: "Cloud", blurb: "Instance sizing and egress cost \u2014 headroom and the bill, both computed from your own numbers." },
  { id: "db", label: "Database", blurb: "Index selectivity and connection pools \u2014 the two settings most changed on a hunch." },
  { id: "embedded", label: "Embedded", blurb: "Power budgets and real-time schedulability for devices that cannot be redeployed." },
  { id: "ml", label: "ML & AI", blurb: "Evaluation intervals and split audits \u2014 the honest statistics of a model readout." },
  { id: "research", label: "Research", blurb: "Citation coverage and inter-rater agreement, because a claim needs a source and a label needs a second rater." },
  { id: "media", label: "Media", blurb: "Loudness normalisation and bitrate budgets for anything watched or listened to." },
  { id: "finops", label: "FinOps", blurb: "Spend trajectory and anomaly detection against your own billing history." },
  { id: "legal", label: "Legal", blurb: "Undefined-term density and the date arithmetic a contract turns on \u2014 measures, never advice." },
  { id: "privacy", label: "Privacy", blurb: "Personal-data classes present in a text, and the clock on how long it may be kept." },
  { id: "people", label: "People", blurb: "Headcount modelling and band position \u2014 the plan and the offer, tested against themselves." },
  { id: "revenue", label: "Revenue", blurb: "Pipeline coverage and the SLA clock \u2014 what the quarter needs and what the customer was promised." },
  { id: "marketing", label: "Marketing", blurb: "What a search result truncates and what a crawl costs, before either is paid for." },
  { id: "locale", label: "Localisation", blurb: "Translation coverage and the space translated strings take in a layout built for English." },
  { id: "supply", label: "Supply chain", blurb: "Order quantities and the safety stock a service level actually costs." },
  { id: "web3", label: "Web3", blurb: "Transaction cost and base-unit arithmetic \u2014 integer maths, because token floats lose money." },
  { id: "health", label: "Healthcare", blurb: "Early-warning scores and ward occupancy \u2014 arithmetic, never a diagnosis." }
]);
function toolsForDomain(domain) {
  return TOOLS.filter((t) => t.domain === domain);
}
function toolById(id) {
  return TOOLS.find((t) => t.id === id);
}

// probe/specialists.test.ts
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
function section(name) {
  console.log(`
== ${name}`);
}
section("1. every tool drives from its own defaults, twice, identically");
ok("the pack ships a substantial set of tools", TOOLS.length >= 30, `${TOOLS.length} tools`);
ok("across all twenty-five domains", DOMAINS.length === 25, `${DOMAINS.length} domains`);
var TOOL_DOMAINS = [...new Set(TOOLS.map((t) => t.domain))];
ok(
  "every domain except finance-in has tools of its own",
  TOOL_DOMAINS.length === 25 && !TOOL_DOMAINS.includes("finance-in"),
  TOOL_DOMAINS.join(" \xB7 ")
);
ok(
  "and every one of those domains has at least two deterministic tools",
  DOMAINS.every((d) => toolsForDomain(d.id).length >= 2),
  DOMAINS.filter((d) => toolsForDomain(d.id).length < 2).map((d) => d.id).join(", ")
);
ok(
  "the pack ships sixty-seven tools of its own (seven more arrive with the finance pack)",
  TOOLS.length === 67,
  `${TOOLS.length} tools`
);
var toolFailures = [];
var nondeterministic = [];
var missingBasis = [];
for (const t of TOOLS) {
  const defaults = Object.fromEntries(t.fields.map((f2) => [f2.key, f2.def]));
  try {
    const a = t.run(defaults);
    const b = t.run(defaults);
    if (JSON.stringify(a) !== JSON.stringify(b)) nondeterministic.push(t.id);
    if (!a.headline || a.headline.length < 5) toolFailures.push(`${t.id}: empty headline`);
    if (!a.basis || a.basis.length < 20) missingBasis.push(t.id);
  } catch (e) {
    toolFailures.push(`${t.id}: ${e instanceof Error ? e.message : String(e)}`);
  }
}
ok("every tool runs on its declared defaults without throwing", toolFailures.length === 0, toolFailures.slice(0, 4).join(" | "));
ok("every tool is deterministic \u2014 two runs are byte-identical", nondeterministic.length === 0, nondeterministic.join(", "));
ok("every tool states the rule or formula behind its answer", missingBasis.length === 0, missingBasis.join(", "));
ok("every tool declares at least one field", TOOLS.every((t) => t.fields.length > 0));
ok("tool ids are unique", new Set(TOOLS.map((t) => t.id)).size === TOOLS.length);
ok(
  "every field has a default that matches its kind",
  TOOLS.every((t) => t.fields.every((f2) => f2.kind === "toggle" ? typeof f2.def === "boolean" : typeof f2.def === "string"))
);
ok(
  "a domain's tools are reachable by domain",
  toolsForDomain("dev").length === 5 && toolById("contrast")?.domain === "frontend"
);
section("2. frontend \u2014 WCAG's own published numbers");
ok(
  "black on white is the maximum 21:1",
  contrastRatio(parseColor("#000000"), parseColor("#ffffff")) === 21
);
var grey = contrastRatio(parseColor("#777777"), parseColor("#ffffff"));
ok("WCAG's worked example #777 on white is 4.48:1", Math.abs(grey - 4.48) < 0.01, grey.toFixed(4));
ok("and it is graded as failing AA for body text", !wcagVerdict(grey).aaNormal && wcagVerdict(grey).aaLarge);
ok("7:1 passes AAA for body text", wcagVerdict(7).aaaNormal);
ok("identical colours are 1:1", contrastRatio(parseColor("#123456"), parseColor("#123456")) === 1);
ok("shorthand hex expands", parseColor("#abc").r === 170 && parseColor("#abc").g === 187);
ok("rgb() is read", parseColor("rgb(1, 2, 3)").b === 3);
ok("hsl() is read", parseColor("hsl(0, 100%, 50%)").r === 255);
ok("alpha is preserved from an 8-digit hex", Math.abs(parseColor("#00000080").a - 0.502) < 0.01);
ok("an unreadable colour is refused, not approximated", parseColor("cornflowerblue") === null);
ok("hex round-trips", toHex(parseColor("#D5B26B")) === "#d5b26b");
var scale = typeScale(16, 1.25, 6);
ok(
  "a 16px / 1.25 scale produces whole and quarter-pixel steps",
  scale.every((s) => s.px * 4 % 1 === 0),
  scale.map((s) => s.px).join(", ")
);
ok("the base step is exactly the base size", scale.some((s) => s.step === 0 && s.px === 16));
ok("rem is px over 16", scale.every((s) => Math.abs(s.rem - s.px / 16) < 1e-3));
var snap = snapToGrid([4, 10, 16, 24, 30, 40, 55], 8);
ok(
  "off-grid values are snapped and the movement reported",
  snap.onGrid === 3 && snap.worst === 4,
  `onGrid=${snap.onGrid} worst=${snap.worst}`
);
section("3. engineering \u2014 versions, commits, statuses, ladders, cron");
ok(
  "a prerelease sorts BELOW its release",
  compareSemver(parseSemver("1.4.2-rc.3"), parseSemver("1.4.2")) === -1
);
ok(
  "numeric identifiers compare numerically, not as strings",
  compareSemver(parseSemver("1.0.0-rc.10"), parseSemver("1.0.0-rc.9")) === 1
);
ok(
  "build metadata is ignored in precedence",
  compareSemver(parseSemver("1.0.0+a"), parseSemver("1.0.0+b")) === 0
);
ok("a caret range admits 1.4.2 for ^1.2.0", satisfiesRange(parseSemver("1.4.2"), "^1.2.0").ok);
ok("and refuses 2.0.0", !satisfiesRange(parseSemver("2.0.0"), "^1.2.0").ok);
ok("a tilde range stops at the minor", satisfiesRange(parseSemver("1.2.9"), "~1.2.0").ok && !satisfiesRange(parseSemver("1.3.0"), "~1.2.0").ok);
ok(
  "the range is expanded so the answer is checkable",
  satisfiesRange(parseSemver("1.4.2"), "^1.2.0").expanded.some((e) => e.includes(">=1.2.0")),
  satisfiesRange(parseSemver("1.4.2"), "^1.2.0").expanded.join(" | ")
);
ok("unions work", satisfiesRange(parseSemver("1.1.0"), "2.x || 1.x").ok);
ok("bumping rolls the right digit", nextVersion(parseSemver("1.4.2"), "major") === "2.0.0" && nextVersion(parseSemver("1.4.2"), "minor") === "1.5.0" && nextVersion(parseSemver("1.4.2"), "patch") === "1.4.3");
ok("a prerelease bump increments the last number", nextVersion(parseSemver("1.4.2-rc.3"), "prerelease") === "1.4.2-rc.4");
ok("a nonsense version is refused", parseSemver("1.4") === null);
ok(
  "a clean conventional commit has no errors",
  lintCommit("feat(auth): add device-bound session keys").errors.length === 0
);
ok("a missing type is an error", lintCommit("Fixed some stuff.").errors.length > 0);
ok("an unknown type is caught", lintCommit("wibble: something").errors.some((e) => e.includes("not a conventional type")));
ok(
  "a body glued to the subject is caught",
  lintCommit("fix: thing\nthis line should have been blank").errors.some((e) => e.includes("second line must be blank"))
);
ok(
  "a BREAKING CHANGE footer marks the commit",
  lintCommit("feat: change\n\nBREAKING CHANGE: the field moved").breaking === true
);
ok(
  "over-length descriptions are caught",
  lintCommit(`feat: ${"x".repeat(80)}`).errors.some((e) => e.includes("72"))
);
ok(
  "504 is retryable but only for an idempotent request",
  httpSemantics(504).retry === "yes" && httpSemantics(504).idempotentSafe.includes("idempotent")
);
ok("404 is never retryable", httpSemantics(404).retry === "no");
ok("an unassigned code is unclassified rather than guessed", httpSemantics(599).known === false);
var ladder = backoffSchedule(5, 200, 2, 3e4);
ok(
  "the ladder doubles and totals 6.2s",
  ladder.rows.map((r) => r.delayMs).join(",") === "200,400,800,1600,3200" && ladder.human === "6.2s",
  `${ladder.rows.map((r) => r.delayMs).join(",")} / ${ladder.human}`
);
var capped = backoffSchedule(8, 1e3, 3, 1e4);
ok("the cap binds and is reported", capped.rows.some((r) => r.delayMs === 1e4));
ok(
  "the ladder is deterministic \u2014 jitter is a fixed permille, not randomness",
  JSON.stringify(backoffSchedule(4, 100, 2, 9999, 100)) === JSON.stringify(backoffSchedule(4, 100, 2, 9999, 100))
);
var cron = parseCron("0 3 * * 1", "2026-09-22", 3);
ok("a weekly 03:00 Monday job parses", cron.valid && cron.errors.length === 0);
ok("and its next run is the following Monday", cron.next[0] === "2026-09-28 03:00", cron.next.join(" | "));
ok(
  "a six-field expression is refused with the dialect named",
  !parseCron("0 0 3 * * 1", "2026-09-22").valid && parseCron("0 0 3 * * 1", "2026-09-22").errors[0].includes("exactly 5")
);
ok("an out-of-range value is refused", !parseCron("0 25 * * *", "2026-09-22").valid);
var both = parseCron("0 0 1 * 1", "2026-09-22", 8);
ok(
  "both day fields restricted means either day fires the job",
  both.next.some((d) => d.endsWith("-28 00:00")) && both.next.some((d) => d.includes("-01 00:00")),
  both.next.join(" | ")
);
section("4. API \u2014 limits, payloads, keys, paging");
var bucket = tokenBucketPlan(600, 20, 15, 30);
ok("a 10/s refill cannot sustain 15/s demand", bucket.steadyState === 10);
ok("the burst absorbs two seconds before the limit bites", bucket.firstRejection === 3, String(bucket.firstRejection));
ok(
  "and the refill is a per-SECOND rate, which is the part people miss",
  tokenBucketPlan(60, 5, 2, 10).steadyState === 1
);
var small = payloadBudget('{"a":1}');
ok("a payload is measured in UTF-8 bytes as the wire sees it", small.totalBytes === 7, String(small.totalBytes));
var big = payloadBudget('{"id":"x","notes":"' + "n".repeat(300) + '"}');
ok("the dominant field is named", big.largest?.field === "notes", String(big.largest?.field));
ok(
  "invalid JSON is refused with the parse error",
  payloadBudget("{not json}").ok === false && (payloadBudget("{not json}").error ?? "").includes("not valid JSON")
);
var key = checkIdempotencyKey("3f8a1c9b-6d2e-4f71-9a55-2c7e8b0d4e13");
ok("a UUIDv4 is accepted and recognised as such", key.ok && key.charset === "uuid");
ok("a short, human-typed key is refused", !checkIdempotencyKey("dev-key-1").ok && checkIdempotencyKey("dev-key-1").issues.some((i) => i.includes("too short")));
ok("entropy is measured, not asserted", stringEntropyBits("aaaaaaaa") === 0 && stringEntropyBits("abcd") === 8);
var paging = paginationPlan(25e4, 100, 25e3, 1e4);
ok("page arithmetic is exact", paging.pages === 2500 && paging.lastPageSize === 100);
ok("deep paging is called out with the reason", paging.deep && paging.lines.some((l) => l.includes("keyset")));
ok("a shallow offset is not flagged", !paginationPlan(500, 25, 50).deep);
section("5. data \u2014 the statistics, checked against known values");
ok("the median of an even set interpolates", percentile([1, 2, 3, 4], 50) === 2.5);
ok("the median of an odd set is the middle", percentile([1, 2, 3, 4, 5], 50) === 3);
ok(
  "p0 and p100 are the extremes of a sorted series",
  percentile([1, 5, 9], 0) === 1 && percentile([1, 5, 9], 100) === 9
);
ok(
  "percentiles() sorts for the caller, so an unsorted series still measures correctly",
  percentiles([5, 1, 9], [50])[0].value === 5
);
ok("one point is its own percentile", percentile([42], 95) === 42);
var fence = outliersIqr([10, 11, 12, 12, 13, 13, 14, 15, 16, 17, 18, 120]);
ok("Tukey's fences find the single outlier", fence.outliers.join(",") === "120", fence.outliers.join(","));
ok(
  "the fences are computed from interpolated quartiles",
  Math.abs(fence.q1 - 12) < 1e-3 && Math.abs(fence.upperFence - 22.625) < 1e-3,
  `q1=${fence.q1} fence=${fence.upperFence}`
);
ok(
  "a degenerate quartile spread is reported as degenerate",
  outliersIqr([5, 5, 5, 5, 5, 5, 5, 5, 5, 99]).whys.some((w) => w.includes("degenerate"))
);
var exp = abTest(5e3, 400, 5e3, 452);
ok("the observed rates are exact", Math.abs(exp.rateA - 8) < 1e-9 && Math.abs(exp.rateB - 9.04) < 1e-9);
ok("a +13% relative lift is measured", Math.abs(exp.liftPct - 13) < 0.05, exp.liftPct.toFixed(3));
ok("and at this sample size it is NOT yet significant", !exp.significant95, `p=${exp.p.toFixed(4)}`);
ok(
  "the interval spans zero exactly when the test is not significant",
  exp.ciLowPct < 0 && exp.ciHighPct > 0,
  `${exp.ciLowPct.toFixed(2)} \u2026 ${exp.ciHighPct.toFixed(2)}`
);
ok("the peeking warning is always attached", exp.guardrails.some((g) => g.includes("peeking")));
ok(
  "a tiny arm is flagged as too small for this test",
  abTest(40, 3, 40, 5).guardrails.some((g) => g.includes("fewer than 100 trials"))
);
var n = sampleSize(8, 10, 0.8, 0.05);
ok("the two-proportion sample size matches this implementation's formula", n === 18878, String(n));
ok(
  "halving the effect roughly quadruples the sample",
  Math.abs(sampleSize(8, 5, 0.8, 0.05) / n - 3.9) < 0.4,
  `${sampleSize(8, 5, 0.8, 0.05)} vs ${n}`
);
section("6. security \u2014 and the limits each tool admits");
var hits = scanSecrets("AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE\nDATABASE_URL=postgres://app:hunter2@db.internal:5432/prod");
ok("an AWS key id is found by its fixed prefix", hits.some((h) => h.name === "AWS access key id"));
ok("a connection string with an embedded password is found", hits.some((h) => h.name === "Connection string"));
ok(
  "matches are masked, so a finding is not a second copy of the secret",
  hits.every((h) => h.samples.every((s) => s.includes("\u2022")))
);
ok("a private key block is found", scanSecrets("-----BEGIN RSA PRIVATE KEY-----\nMIIE").some((h) => h.name === "Private key block"));
ok(
  "clean text yields nothing \u2014 and the tool says that is not a clean bill of health",
  scanSecrets("just some ordinary prose").length === 0
);
var tool = toolById("secrets");
var scanResult = tool.run({ ...Object.fromEntries(tool.fields.map((f2) => [f2.key, f2.def])) });
ok(
  "the scan result states what it cannot find",
  (scanResult.lines ?? []).some((l) => l.includes("does NOT find")),
  "the limits must be printed, not implied"
);
var jwt = jwtInspect("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJhY2N0XzlmMiIsImF1ZCI6ImFwaS5leGFtcGxlLmNvbSIsImV4cCI6MTc5MDAwMDAwMH0.sig", "2026-09-22");
ok("a JWT decodes to its claims", jwt.ok && jwt.payload?.sub === "acct_9f2", JSON.stringify(jwt.payload));
ok("the algorithm is reported", jwt.algorithm === "HS256");
ok(
  "and the tool states plainly that nothing was verified",
  jwt.lines.some((l) => l.includes("NOT verified")),
  jwt.lines.join(" | ").slice(0, 90)
);
var none = jwtInspect("eyJhbGciOiJub25lIn0.eyJzdWIiOiJhZG1pbiJ9.", "2026-09-22");
ok("alg=none is called out as unsigned authority", none.algorithm === "none" && none.lines.some((l) => l.includes("NO signature")));
ok("a token with no exp is a finding", none.lines.some((l) => l.includes("never expires")));
ok("a malformed token is refused", !jwtInspect("not.a.jwt", "2026-09-22").ok);
var csp = cspAudit("default-src 'self'; script-src 'self' 'unsafe-inline'; img-src *", false);
ok(
  "unsafe-inline without a nonce is a high finding",
  csp.findings.some((f2) => f2.severity === "high" && f2.finding.includes("unsafe-inline"))
);
ok("a wildcard source is a high finding", csp.findings.some((f2) => f2.directive === "*"));
ok("a missing base-uri is flagged", csp.findings.some((f2) => f2.directive === "base-uri"));
ok(
  "a policy with a nonce is not flagged for inline",
  !cspAudit("default-src 'self'; script-src 'self' 'unsafe-inline' 'nonce-abc'", true).findings.some((f2) => f2.finding.includes("unsafe-inline"))
);
section("7. reliability \u2014 budgets, runways, severity, deploy risk");
var budget = sloErrorBudget(99.9, 30, 35);
ok(
  "a 99.9% SLO over 30 days allows 43.2 minutes",
  Math.abs(budget.allowedDownMinutes - 43.2) < 1e-9,
  budget.allowedDownMinutes.toFixed(3)
);
ok(
  "the remaining budget is the arithmetic remainder",
  Math.abs(budget.remainingMinutes - 28.08) < 1e-9,
  budget.remainingMinutes.toFixed(3)
);
ok("a spent budget is stated as breached", sloErrorBudget(99.9, 30, 120).state.includes("exhausted"));
ok(
  "a 99% SLO is far more permissive than 99.9%",
  Math.abs(sloErrorBudget(99, 30, 0).allowedDownMinutes - 432) < 1e-9
);
var runway = capacityHeadroom(42, 6, 80, 24);
ok("compound growth crosses an 80% ceiling in month 12", runway.breachMonth === 12, String(runway.breachMonth));
ok("flat growth never breaches", capacityHeadroom(42, 0, 80, 24).breachMonth === null);
ok("a 12% user impact with a workaround is S3", incidentSeverity(12, 1, false, true).severity === "S3");
ok("the same impact without a workaround is S2", incidentSeverity(12, 1, false, false).severity === "S2");
ok("data loss is always S1", incidentSeverity(1, 0, true, true).severity === "S1");
ok("trivial impact is S4", incidentSeverity(0.5, 0, false, true).severity === "S4");
ok("the rules are printed with the verdict", incidentSeverity(1, 0, true, true).rules.length === 4);
var risk = deployRisk(23, false, true, true, false, true);
ok("a clean deploy with a wide diff and peak timing scores 18", risk.score === 18, String(risk.score));
ok(
  "a failing test suite alone outweighs everything else",
  deployRisk(5, false, false, true, true, true).score === 30
);
ok("a fully addressed deploy scores zero", deployRisk(3, false, true, true, true, true).score === 0);
ok("the score comes with the factors that produced it", risk.factors.length === 6 && risk.recommendation.length > 20);
section("8. docs \u2014 readability against the published formulas");
ok("syllables are estimated by vowel groups", syllables("steward") === 2 && syllables("the") === 1);
var prose = readability("The cat sat on the mat. The dog ran fast. A bird flew away.");
ok("Flesch-Kincaid is finite and low on simple prose", prose.fleschKincaidGrade < 4, String(prose.fleschKincaidGrade));
ok("the sentence count is right", prose.sentences === 3, String(prose.sentences));
ok(
  "code blocks are excluded from the prose measure",
  readability("Short words here.\n```\ncomplicated_identifier.with.many.parts()\n```").avgWordSyllables < 2
);
var long = readability(`${"magnificent extraordinary implementation ".repeat(20)}.`);
ok("dense prose scores a higher grade", long.fleschKincaidGrade > 12, String(long.fleschKincaidGrade));
ok(
  "reading time is words over the rate",
  Math.abs(readingTime("word ".repeat(400), 200).minutes - 2) < 0.01
);
ok("code lines are counted separately", readingTime("text\n```\na\nb\nc\n```").codeLines === 3);
var headings = headingLint("# Title\n\n### Skipped\n\n# Second title");
ok("a skipped heading level is caught", headings.issues.some((i) => i.issue.includes("jumps from h1 to h3")));
ok("two h1 headings are caught", headings.issues.some((i) => i.issue.includes("h1 headings")));
ok(
  "duplicate headings are caught",
  headingLint("# A\n\n## Same\n\n## Same").issues.some((i) => i.issue.includes("duplicate"))
);
ok("a clean document reports nothing", headingLint("# A\n\n## B\n\n### C").issues.length === 0);
var drift = terminologyDrift("The Kubernetes cluster is live. Developers use the Kubernetes API. Another kubernetes note. One more kubernetes mention.");
ok("casing drift on a repeated term is caught", drift.some((d) => d.term === "kubernetes"));
ok(
  "hyphenation variants are caught when both forms appear",
  terminologyDrift("Send an e-mail. Then send email. Another e-mail follows.").some((d) => d.term === "email")
);
ok("consistent text reports nothing", terminologyDrift("The email was sent. The email arrived.").length === 0);
section("9. growth \u2014 the ratios a business is run on");
var econ = unitEconomics(1200, 78, 9e3, 1.8);
ok("lifetime value is margin over churn", Math.abs(econ.ltv - 52e3) < 1, econ.ltv.toFixed(2));
ok("the ratio is computed against acquisition cost", Math.abs(econ.ltvCac - 5.777) < 0.01, econ.ltvCac.toFixed(3));
ok("payback is acquisition cost over monthly margin", Math.abs(econ.paybackMonths - 9.615) < 0.01, econ.paybackMonths.toFixed(3));
ok(
  "zero churn is called out as a modelling artefact",
  unitEconomics(1e3, 80, 5e3, 0).caveats.some((c) => c.includes("infinite"))
);
ok(
  "negative economics are stated as such",
  unitEconomics(100, 50, 9e3, 5).verdict.includes("Negative unit economics")
);
var f = funnel([12e3, 2400, 900, 260, 180], ["a", "b", "c", "d", "e"]);
ok("end-to-end conversion is top over bottom", Math.abs(f.overall - 1.5) < 1e-9, f.overall.toFixed(4));
ok("the worst step is the one with the lowest carry-through", f.worst?.stage === "b", String(f.worst?.stage));
ok("stage-to-stage conversion is exact", Math.abs(f.steps[1].fromPrevious - 20) < 1e-9);
ok(
  "RICE is reach \xD7 impact \xD7 confidence \xF7 effort",
  Math.abs(riceScore(800, 2, 80, 6) - 213.333) < 0.01,
  riceScore(800, 2, 80, 6).toFixed(3)
);
ok("zero effort cannot divide", riceScore(100, 1, 100, 0) === 0);
var model = growthModel(4e4, 12, 24, 1.5);
ok("the trajectory is computed month by month", model.rows.length === 25);
ok(
  "net growth is growth minus churn",
  model.exitMrr > 4e4 * Math.pow(1.105, 24) && model.exitMrr < 4e4 * Math.pow(1.106, 24),
  model.exitMrr.toFixed(0)
);
ok("exit ARR is twelve times exit MRR", Math.abs(model.exitArr - model.exitMrr * 12) < 1e-6);
section("10. the roster holds itself to its own claims");
var status = specialistStatus();
ok("the generalist pack ships two hundred and fifty-one specialists", status.total === 251, String(status.total));
ok("across twenty-five domains", status.domains === 25, String(status.domains));
ok(
  "every domain carries at least eight specialists",
  DOMAINS.every((d) => specialistsByDomain(d.id).length >= 8),
  DOMAINS.map((d) => `${d.id}:${specialistsByDomain(d.id).length}`).join(" ")
);
ok("an id is unique per specialist", new Set(SPECIALISTS.map((s) => s.id)).size === status.total);
ok(
  "every specialist declares a purpose and a receipt",
  SPECIALISTS.every((s) => s.purpose.length > 40 && s.receipt.length > 20)
);
var exported = new Set(Object.keys(specialists_exports));
var allowed = /* @__PURE__ */ new Set(["all"]);
var missing = [];
for (const s of SPECIALISTS) {
  for (const part of s.engine.split(/[+,]/)) {
    const lead = part.trim().match(/^([A-Za-z_][A-Za-z0-9_]*)/);
    if (!lead) continue;
    if (!exported.has(lead[1]) && !allowed.has(lead[1])) missing.push(`${s.id} \u2192 ${lead[1]}`);
  }
}
ok("every engine a specialist claims exists in the pack", missing.length === 0, missing.slice(0, 5).join(", "));
var MUST_BE_GATED = /^(ops\.deploy-gate|ops\.change|ops\.postmortem-publish|dev\.migration|dev\.release-tag|sec\.rotation|sec\.key-ceremony|growth\.price|growth\.pricing-page|docs\.release|docs\.publish-runbook|api\.contract|api\.version-retire|fe\.a11y|fe\.release|data\.publish-dataset|mobile\.release|mobile\.push-send|cloud\.autoscale-apply|cloud\.rotation-run|cloud\.budget-commit|db\.migration-apply|db\.partition-plan|embedded\.firmware-release|embedded\.key-provision|ml\.model-promote|ml\.training-run|research\.ethics-submit|research\.preprint-post|media\.rendition-publish|media\.rights-clearance|finops\.budget-commit|finops\.showback-invoice|legal\.filing-submit|legal\.regulatory-filing|legal\.notice-serve|privacy\.dsar-respond|privacy\.consent-change|people\.offer-send|people\.comp-change|revenue\.quote-issue|revenue\.discount-approve|marketing\.campaign-launch|marketing\.spend-commit|locale\.locale-release|locale\.glossary-commit|supply\.po-issue|supply\.supplier-commit|web3\.tx-sign|web3\.key-ceremony|health\.discharge-plan|health\.protocol-publish)/;
var gatedIds = SPECIALISTS.filter((s) => s.requiresApproval).map((s) => s.id);
var ungatedDestructive = SPECIALISTS.filter((s) => MUST_BE_GATED.test(s.id) && !s.requiresApproval).map((s) => s.id);
ok(
  "specialists that change production, spend money or touch customers are gated",
  ungatedDestructive.length === 0,
  ungatedDestructive.join(", ")
);
ok(
  "and the gate is a real set, not a single token",
  gatedIds.length === 49 && gatedIds.length < status.total / 2,
  `${gatedIds.length} gated of ${status.total}`
);
var NEW_DOMAINS = /^(mobile|cloud|db|embedded|ml|research|media|finops|legal|privacy|people|revenue|marketing|locale|supply|web3|health)\./;
ok(
  "every specialist this release gated is a workflow that changes something",
  SPECIALISTS.filter((s) => s.requiresApproval && NEW_DOMAINS.test(s.id)).every((s) => s.status === "workflow"),
  SPECIALISTS.filter((s) => s.requiresApproval && NEW_DOMAINS.test(s.id) && s.status !== "workflow").map((s) => s.id).join(", ")
);
ok(
  "and no domain is mostly gates \u2014 in every one, the ungated specialists outnumber the gated",
  DOMAINS.every((d) => {
    const list = specialistsByDomain(d.id);
    return list.filter((s) => !s.requiresApproval).length > list.filter((s) => s.requiresApproval).length;
  }),
  DOMAINS.map((d) => {
    const list = specialistsByDomain(d.id);
    return `${d.id}:${list.filter((s) => !s.requiresApproval).length}/${list.filter((s) => s.requiresApproval).length}`;
  }).join(" ")
);
ok(
  "a read-only audit is NOT gated, because a gate that always fires is noise",
  SPECIALISTS.filter((s) => /(audit|sweep|inspect|read|check|watch|scan)/i.test(s.id)).every((s) => !s.requiresApproval),
  SPECIALISTS.filter((s) => /(audit|sweep|inspect|read|check|watch|scan)/i.test(s.id) && s.requiresApproval).map((s) => s.id).join(", ")
);
ok(
  "every domain has at least four specialists",
  DOMAINS.every((d) => specialistsByDomain(d.id).length >= 4),
  DOMAINS.map((d) => `${d.id}:${specialistsByDomain(d.id).length}`).join(" ")
);
ok("findSpecialist resolves an id", findSpecialist("ops.deploy-gate")?.requiresApproval === true);
var drive = (id) => {
  const t = toolById(id);
  if (!t) throw new Error(`no such tool: ${id}`);
  const defaults = {};
  for (const f2 of t.fields) defaults[f2.key] = f2.def;
  return t.run(defaults);
};
section("11. the new domains \u2014 mobile, cloud, database, embedded");
var targets = drive("touch-targets");
ok(
  "a 32\xD732 control is under the 44pt floor and a 44\xD744 one is not",
  targets.table.rows.filter((r) => r[4] === "meets the floor").length === 1,
  JSON.stringify(targets.kpis)
);
ok(
  "an undersized-but-spaced target is reported as passing only by the spacing exception",
  targets.table.rows.some((r) => /spacing exception/.test(r[4]))
);
ok("the smallest target is named", targets.table.rows.some((r) => r[1] === "32\xD732"));
var size = drive("app-size-budget");
ok("2.52 MB per release crosses a 60 MB budget at release eight", /release 8/.test(size.headline), size.headline);
ok(
  "compounded at 6% the same budget lasts 6.1 releases",
  size.kpis.some((k) => k.label === "releases if it compounds" && k.value === "6.1"),
  JSON.stringify(size.kpis)
);
var inst = drive("instance-sizing");
ok(
  "72% p95 against a 60% ceiling needs eight instances, not six",
  inst.kpis.some((k) => k.label === "instances needed" && k.value === "8"),
  JSON.stringify(inst.kpis)
);
ok("and lands the fleet at 54% at the same load", inst.kpis.some((k) => k.value === "54.0%"));
var egress = drive("egress-cost");
ok(
  "an 85% hit rate turns a 360 bill into 122 \u2014 238 saved",
  egress.kpis.some((k) => k.label === "with the cache" && k.value === "122") && egress.kpis.some((k) => k.label === "saved / month" && k.value === "238"),
  JSON.stringify(egress.kpis)
);
var idx = drive("index-selectivity");
ok("a predicate matching 0.01% of a table should use the index", idx.ok === true, idx.headline);
ok("and the rows-per-key figure is 333", idx.kpis.some((k) => k.value === "333"));
var pool = drive("pool-sizing");
ok("300 rps at 18 ms is 5.4 queries in flight", pool.kpis.some((k) => k.value === "5.4"), JSON.stringify(pool.kpis));
ok("which is a pool of three per instance across three instances", pool.kpis.some((k) => k.label === "pool per instance" && k.value === "3"));
var power = drive("power-budget");
ok(
  "2000 mAh at a 4% duty of 45 mA with 20 \xB5A sleep lasts about 1099 hours",
  Math.abs(Number(power.kpis.find((k) => k.label === "hours").value) - 1099.4) < 0.5,
  JSON.stringify(power.kpis)
);
var sched = drive("timing-slack");
ok(
  "Liu & Layland on 2/20, 5/50, 12/200 gives U = 0.26",
  sched.kpis.some((k) => k.label === "utilisation" && k.value === "26.0%"),
  JSON.stringify(sched.kpis)
);
ok("against a three-task bound of 0.780", sched.kpis.some((k) => k.label === "RM bound" && k.value === "78.0%"));
ok("so the task set passes the sufficient test", sched.ok === true);
section("12. the new domains \u2014 ml, research, media, finops");
var ev = drive("eval-interval");
var evLo = Number(ev.kpis.find((k) => k.label.startsWith("95%")).value.split("\u2013")[0].replace("%", ""));
var evHi = Number(ev.kpis.find((k) => k.label.startsWith("95%")).value.split("\u2013")[1].replace("%", ""));
ok(
  "431/500 is 86.2%, and the Wilson interval is about 82.9\u201388.9%",
  Math.abs(evLo - 82.9) < 0.4 && Math.abs(evHi - 88.9) < 0.4,
  `${evLo}\u2013${evHi}`
);
ok("the interval clears an 80% baseline, so the result is not sampling noise", ev.ok === true);
var split = drive("split-audit");
ok(
  "an 80/10/10 split of 50,000 rows with no duplicates is clean",
  split.ok === true && split.kpis.some((k) => k.value === "5,000"),
  JSON.stringify(split.kpis)
);
var cite = drive("citation-lint");
ok(
  "the draft cites two claims and leaves one numeric line uncited",
  cite.kpis.some((k) => k.label === "citations" && k.value === "2") && cite.kpis.some((k) => k.label === "uncited numeric lines" && k.value === "1"),
  JSON.stringify(cite.kpis)
);
var kap = drive("rater-agreement");
ok(
  "seven of eight labels agree \u2014 Po = 0.875",
  kap.kpis.some((k) => k.label === "observed agreement" && k.value === "87.5%"),
  JSON.stringify(kap.kpis)
);
ok(
  "and Cohen's \u03BA is 0.805 once chance is removed",
  Math.abs(Number(kap.kpis.find((k) => k.label === "Cohen's \u03BA").value) - 0.805) < 3e-3,
  JSON.stringify(kap.kpis)
);
var loud = drive("loudness-gain");
ok(
  "\u22129.4 LUFS to a \u221214 target is a 4.6 dB cut, peak still under the ceiling",
  loud.kpis.some((k) => k.value === "-4.6 dB") && loud.ok === true,
  JSON.stringify(loud.kpis)
);
var bits = drive("bitrate-budget");
ok(
  "a 42-minute piece at 2000 kbps + 128 kbps audio is 670 MB, the only rung inside 800",
  bits.kpis.some((k) => k.value === "2000"),
  JSON.stringify(bits.kpis)
);
var fc = drive("spend-forecast");
ok(
  "the six-month spend series trends up by about 1136 a month",
  Math.abs(Number(fc.kpis.find((k) => k.label === "trend / month").value) - 1135.7) < 1.5,
  JSON.stringify(fc.kpis)
);
ok(
  "and the projection for month nine is about 26,938",
  Math.abs(Number(fc.kpis.find((k) => k.label.startsWith("month 9")).value) - 26938) < 6,
  JSON.stringify(fc.kpis)
);
var anom = drive("anomaly-z");
ok(
  "one day out of twelve is flagged at 3\u03C3 \u2014 the 24,000 day",
  anom.kpis.some((k) => k.label === "\u2265 3\u03C3" && k.value === "1") && !anom.ok,
  JSON.stringify(anom.kpis)
);
ok("and it names day six", anom.table.rows.some((r) => r[0] === "6"));
section("13. the new domains \u2014 legal, privacy, people, revenue");
var clause = drive("clause-lint");
ok("the sample clause carries five undefined terms", clause.kpis.some((k) => k.value === "5"), JSON.stringify(clause.kpis));
ok(
  "and the most frequent one is named in the lines",
  clause.lines.join(" ").includes("reasonable efforts"),
  clause.lines.join(" ")
);
var dates = drive("date-terms");
ok(
  "effective 1 Apr 2026 + 12 months ends 1 Apr 2027",
  dates.kpis.some((k) => k.value === "2027-04-01"),
  JSON.stringify(dates.kpis)
);
ok(
  "with 90 days' notice the last day to serve it is 1 Jan 2027",
  dates.kpis.some((k) => k.value === "2027-01-01"),
  JSON.stringify(dates.kpis)
);
var pii = drive("pii-scan");
ok(
  "personal-data patterns are found, and every sample in the table is masked",
  pii.table.rows.every((r) => r[3].includes("\u2022")) && !pii.table.rows.some((r) => /@|\d{4} \d{4} \d{4} \d{4}/.test(r[3])),
  JSON.stringify(pii.table.rows.map((r) => r[3]))
);
ok(
  "a card-shaped number is only counted when Luhn passes",
  pii.table.rows.some((r) => r[0] === "card-shaped number" && r[1] === "1"),
  JSON.stringify(pii.table.rows)
);
var ret = drive("retention-clock");
ok("two of the four categories are past their retention date", ret.kpis.some((k) => k.value === "2"), JSON.stringify(ret.kpis));
ok("and the overdue ones are at the top of the table", ret.table.rows[0][4].startsWith("-"), JSON.stringify(ret.table.rows[0]));
var hc = drive("headcount-model");
ok(
  "40 people, 3 hires a month and 1.5% attrition ends at 66.5 after a year",
  Math.abs(Number(hc.kpis.find((k) => k.label === "month 12").value) - 66.5) < 0.2,
  JSON.stringify(hc.kpis)
);
var band = drive("comp-band");
ok(
  "2.52 against a 1.8\u20133.2 band is 51.4% of the way up",
  band.kpis.some((k) => k.value === "51.4%"),
  JSON.stringify(band.kpis)
);
ok("and a compa-ratio of 105.0", band.kpis.some((k) => k.value === "105.0"));
var pipe = drive("pipeline-coverage");
ok(
  "a 12,000,000 quota against 9,790,000 weighted is 0.82\xD7 coverage",
  pipe.kpis.some((k) => k.value === "0.82\xD7"),
  JSON.stringify(pipe.kpis)
);
ok("which is under the 3.5\xD7 convention, so the tool says so", pipe.ok === false);
var sla = drive("sla-clock");
ok("two of four tickets miss their first-response target", sla.kpis.some((k) => k.value === "2"), JSON.stringify(sla.kpis));
ok("at 50% attainment", sla.kpis.some((k) => k.value === "50.0%"));
section("14. the new domains \u2014 marketing, localisation, supply chain, web3");
var meta = drive("meta-lint");
ok(
  "the sample title fits the 60-character display limit",
  meta.kpis.some((k) => k.label === "title" && k.value.startsWith("52/")),
  JSON.stringify(meta.kpis)
);
ok("and two filler words in the slug are flagged", meta.kpis.some((k) => k.label === "filler words" && k.value === "2"));
var crawl = drive("crawl-budget");
ok(
  "250,000 pages at 320 ms against a 5 req/s limit is under a day",
  crawl.ok === true && /0\.2 days/.test(crawl.headline),
  crawl.headline
);
var cov = drive("locale-coverage");
ok("two of four locales clear the 98% bar", cov.table.rows.filter((r) => r[4] === "shippable").length === 2, JSON.stringify(cov.table.rows));
ok("and the worst locale is named as Tamil", /Tamil|ta-IN/.test(cov.headline), cov.headline);
var expn = drive("string-expansion");
ok(
  "17 English characters become 21\u201323 in German",
  expn.kpis.some((k) => k.value === "21\u201323"),
  JSON.stringify(expn.kpis)
);
ok("which overflows an 18-character budget, so the tool refuses to call it fine", expn.ok === false);
var eoqRes = drive("eoq");
ok(
  "EOQ for 24,000 units at 450 an order and 12 held is 1,342 units",
  eoqRes.kpis.some((k) => k.value === "1342"),
  JSON.stringify(eoqRes.kpis)
);
ok("meaning 17.9 orders a year", eoqRes.kpis.some((k) => k.value === "17.9"));
var ss = drive("safety-stock");
ok(
  "a 95% service level on 42 units of daily spread over 9 days holds 207 units",
  ss.kpis.some((k) => k.value === "207"),
  JSON.stringify(ss.kpis)
);
ok("putting the reorder point at 1,827", ss.kpis.some((k) => k.value === "1827"));
var gas = drive("gas-plan");
ok(
  "145,000 gas at 19.5 gwei with ETH at 3,200 is 9.05 a call",
  gas.kpis.some((k) => k.value === "9.05"),
  JSON.stringify(gas.kpis)
);
ok("and 2,262 for the batch of 250, which the tool flags", gas.ok === false);
var dec = drive("token-decimals");
ok(
  "1.234567890123456789 tokens is exactly its base-unit integer",
  dec.headline.includes("1.234567890123456789") && dec.ok === true,
  dec.headline
);
ok(
  "and 1.5 tokens at 18 decimals is 1500000000000000000 base units",
  dec.lines.join(" ").includes("1500000000000000000"),
  dec.lines.join(" ")
);
section("15. healthcare \u2014 NEWS2 and occupancy, never a diagnosis");
var news = drive("news2");
ok(
  "NEWS2 defaults score 7 \u2014 high band, labelled not a diagnosis",
  news.kpis.some((k) => k.label === "NEWS2 total" && k.value === "7") && /not a diagnosis/.test(news.headline),
  news.headline
);
ok("and the band is high", news.kpis.some((k) => k.label === "band" && k.value === "high"), JSON.stringify(news.kpis));
var occ = drive("bed-occupancy");
ok("28 of 32 beds is 87.5% occupancy", occ.kpis.some((k) => k.value === "87.5%"), JSON.stringify(occ.kpis));
ok(
  "Little's law implies 4.67 days length of stay at 6 arrivals",
  occ.kpis.some((k) => k.label === "implied LOS (days)" && k.value === "4.67"),
  JSON.stringify(occ.kpis)
);
console.log(`
${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log("\nfailures:");
  for (const f2 of failures) console.log(`  - ${f2}`);
}
process.exit(failed > 0 ? 1 : 0);
