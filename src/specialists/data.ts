/**
 * Data engines — statistics done in the open.
 *
 * The failure this prevents is specific: a number produced by a library nobody read, quoted
 * in a decision, with no statement of the method. Every function here states its method in
 * the basis line, including the interpolations and the approximations, so a result can be
 * argued with. Where an approximation is used (the normal CDF), the tool says so.
 */
import { num, area, number, series, sel, type Tool, type ToolResult } from "./types";

/* ── distribution ──────────────────────────────────────────────────────────── */

/** Linear interpolation between order statistics (the "inclusive" / R-7 method, as in NumPy's default). */
export function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return NaN;
  if (sorted.length === 1) return sorted[0]!;
  const rank = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(rank), hi = Math.ceil(rank);
  if (lo === hi) return sorted[lo]!;
  return sorted[lo]! + (rank - lo) * (sorted[hi]! - sorted[lo]!);
}

export function percentiles(values: number[], ps: number[]): Array<{ p: number; value: number }> {
  const sorted = [...values].sort((a, b) => a - b);
  return ps.map((p) => ({ p, value: percentile(sorted, p) }));
}

export function mean(values: number[]): number {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : NaN;
}

export function stddev(values: number[], sample = true): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  const ss = values.reduce((a, b) => a + (b - m) ** 2, 0);
  return Math.sqrt(ss / (values.length - (sample ? 1 : 0)));
}

export interface OutlierReport {
  sorted: number[]; q1: number; q3: number; iqr: number; lowerFence: number; upperFence: number;
  outliers: number[]; whys: string[];
}

export function outliersIqr(values: number[], k = 1.5): OutlierReport {
  const sorted = [...values].sort((a, b) => a - b);
  const q1 = percentile(sorted, 25), q3 = percentile(sorted, 75);
  const iqr = q3 - q1;
  const lowerFence = q1 - k * iqr, upperFence = q3 + k * iqr;
  const outliers = sorted.filter((v) => v < lowerFence || v > upperFence);
  const whys: string[] = [];
  if (values.length < 8) whys.push(`${values.length} points is a small sample for a quartile rule — the fences move a lot below about twenty.`);
  if (iqr === 0) whys.push("the middle half of the data is identical, so the fence collapses onto the median and everything else becomes an 'outlier' — the rule is degenerate on this data.");
  return { sorted, q1, q3, iqr, lowerFence, upperFence, outliers, whys };
}

/* ── two-proportion test ───────────────────────────────────────────────────── */

/** Abramowitz & Stegun 7.1.26 — max error ≈ 1.5e-7, which is far below any decision it feeds. */
function erf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const z = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * z);
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592)
    * t * Math.exp(-z * z);
  return sign * y;
}

/** Two-sided p-value for a standard normal deviate. */
export function normalTwoSidedP(z: number): number {
  return Math.max(0, Math.min(1, 2 * (1 - 0.5 * (1 + erf(Math.abs(z) / Math.SQRT2)))));
}

export interface AbResult {
  rateA: number; rateB: number; liftPct: number; z: number; p: number;
  significant95: boolean; significant99: boolean; ciLowPct: number; ciHighPct: number;
  verdict: string; guardrails: string[];
}

export function abTest(trialsA: number, convA: number, trialsB: number, convB: number): AbResult {
  const pA = trialsA > 0 ? convA / trialsA : 0;
  const pB = trialsB > 0 ? convB / trialsB : 0;
  const pooled = trialsA + trialsB > 0 ? (convA + convB) / (trialsA + trialsB) : 0;
  const se = Math.sqrt(pooled * (1 - pooled) * (1 / Math.max(1, trialsA) + 1 / Math.max(1, trialsB)));
  const z = se > 0 ? (pB - pA) / se : 0;
  const p = normalTwoSidedP(z);
  const seDiff = Math.sqrt((pA * (1 - pA)) / Math.max(1, trialsA) + (pB * (1 - pB)) / Math.max(1, trialsB));
  const diff = pB - pA;
  const guardrails: string[] = [];
  if (Math.min(trialsA, trialsB) < 100) guardrails.push("fewer than 100 trials in one arm — the normal approximation is unreliable at this size.");
  const successes = Math.min(convA, convB, (trialsA - convA), (trialsB - convB));
  if (successes < 10) guardrails.push("fewer than ten conversions or non-conversions in an arm — use an exact test instead of this one.");
  guardrails.push("peeking at a running test inflates the false-positive rate; the p-value is only valid for a sample size fixed in advance.");
  return {
    rateA: pA * 100, rateB: pB * 100, liftPct: pA > 0 ? (diff / pA) * 100 : 0, z, p,
    significant95: p < 0.05, significant99: p < 0.01,
    ciLowPct: (diff - 1.96 * seDiff) * 100, ciHighPct: (diff + 1.96 * seDiff) * 100,
    verdict: p < 0.05
      ? `a difference this large is unlikely under the null (p = ${p.toFixed(4)})`
      : `no detectable difference at 95% (p = ${p.toFixed(4)}) — that is NOT evidence the two are equal`,
    guardrails,
  };
}

export function sampleSize(baselinePct: number, mdeRelativePct: number, power = 0.8, alpha = 0.05): number {
  const p1 = baselinePct / 100;
  const p2 = p1 * (1 + mdeRelativePct / 100);
  const pBar = (p1 + p2) / 2;
  const zA = alpha === 0.01 ? 2.576 : alpha === 0.1 ? 1.645 : 1.96;
  const zB = power === 0.9 ? 1.282 : power === 0.95 ? 1.645 : 0.842;
  const delta = Math.abs(p2 - p1);
  if (delta === 0 || pBar <= 0 || pBar >= 1) return NaN;
  return Math.ceil(
    (Math.pow(zA * Math.sqrt(2 * pBar * (1 - pBar)) + zB * Math.sqrt(p1 * (1 - p1) + p2 * (1 - p2)), 2))
    / Math.pow(delta, 2),
  );
}

/* ── the tools ─────────────────────────────────────────────────────────────── */

export const DATA_TOOLS: Tool[] = [
  {
    id: "percentiles",
    domain: "data",
    label: "Percentiles",
    blurb: "p50 / p90 / p95 / p99 from a series, with the method stated — including how few points you have.",
    fields: [area("values", "Values", "12, 18, 22, 25, 27, 31, 33, 35, 38, 41, 44, 52, 61, 88, 240", "one per line, or comma separated")],
    run: (v): ToolResult => {
      const values = series(v, "values");
      if (values.length === 0) return { headline: "No numbers in that", ok: false, basis: "one value per line, or comma separated" };
      const ps = percentiles(values, [50, 90, 95, 99]);
      const m = mean(values), sd = stddev(values);
      const small = values.length < 20;
      return {
        headline: `${values.length} points · median ${Math.round(m)} · max ${Math.max(...values)}`,
        ok: !small,
        kpis: [
          { value: `${values.length}`, label: "points" },
          { value: m.toFixed(1), label: "mean" },
          { value: sd.toFixed(1), label: "std dev" },
          { value: `${Math.min(...values)}–${Math.max(...values)}`, label: "range" },
        ],
        table: { head: ["Percentile", "Value"], rows: ps.map((x) => [`p${x.p}`, x.value.toFixed(1)]) },
        lines: [
          small
            ? `${values.length} points cannot support a p99: the top percentile of 15 samples is the maximum, not a percentile. Above p90 a small sample is decoration.`
            : "The sample is large enough for the percentiles above p90 to mean something.",
          `Mean ${m.toFixed(1)} vs median ${percentile([...values].sort((a, b) => a - b), 50).toFixed(1)} — the gap is how much the tail is dragging the average. A latency SLO written as a mean is a SLO that hides the users who left.`,
        ],
        basis: "linear interpolation between order statistics (the R-7 / NumPy default); stating the method matters "
             + "because p95 differs between conventions",
      };
    },
  },
  {
    id: "outliers",
    domain: "data",
    label: "Outliers",
    blurb: "IQR fences, the points outside them, and when the rule is meaningless.",
    fields: [
      area("values", "Values", "10, 11, 12, 12, 13, 13, 14, 15, 16, 17, 18, 120", "one per line or comma separated"),
      num("k", "Fence multiplier (k)", "1.5", "1.5 is the usual rule; 3 is 'far out'"),
    ],
    run: (v): ToolResult => {
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
          { value: `${r.lowerFence.toFixed(1)} … ${r.upperFence.toFixed(1)}`, label: "fences" },
        ],
        lines: [
          r.outliers.length
            ? `Outside: ${r.outliers.join(", ")}. An outlier is a question, not a verdict — the next step is to look at what those rows have in common, not to delete them.`
            : "Every point sits inside the fences.",
          ...r.whys,
        ],
        basis: `Tukey's fences: outside Q1 − ${number(v, "k", 1.5)}·IQR and Q3 + ${number(v, "k", 1.5)}·IQR; quartiles by linear interpolation`,
      };
    },
  },
  {
    id: "ab-test",
    domain: "data",
    label: "A/B test",
    blurb: "Two-proportion test with the lift, the interval, and the peeking warning.",
    fields: [
      num("trialsA", "Control trials", "5000"), num("convA", "Control conversions", "400"),
      num("trialsB", "Variant trials", "5000"), num("convB", "Variant conversions", "452"),
    ],
    run: (v): ToolResult => {
      const r = abTest(Math.round(number(v, "trialsA", 5000)), Math.round(number(v, "convA", 400)),
        Math.round(number(v, "trialsB", 5000)), Math.round(number(v, "convB", 452)));
      return {
        headline: r.significant95
          ? `Significant — ${r.liftPct >= 0 ? "+" : ""}${r.liftPct.toFixed(1)}% relative lift`
          : `Not significant — ${r.liftPct >= 0 ? "+" : ""}${r.liftPct.toFixed(1)}% relative lift`,
        ok: r.significant95,
        kpis: [
          { value: `${r.rateA.toFixed(2)}%`, label: "control rate" },
          { value: `${r.rateB.toFixed(2)}%`, label: "variant rate" },
          { value: `${r.liftPct >= 0 ? "+" : ""}${r.liftPct.toFixed(1)}%`, label: "relative lift" },
          { value: `${r.ciLowPct >= 0 ? "+" : ""}${r.ciLowPct.toFixed(2)}% … ${r.ciHighPct >= 0 ? "+" : ""}${r.ciHighPct.toFixed(2)}%`, label: "95% interval" },
        ],
        lines: [
          r.verdict,
          `Absolute difference ${((r.rateB - r.rateA)).toFixed(3)} percentage points · z = ${r.z.toFixed(3)} · p = ${r.p.toFixed(4)} (two-sided).`,
          ...r.guardrails,
        ],
        basis: "two-proportion z-test on the pooled proportion; 95% interval is the Wald interval on the difference. "
             + "The normal CDF is the Abramowitz & Stegun 7.1.26 approximation (error ≈ 1.5e-7)",
      };
    },
  },
  {
    id: "sample-size",
    domain: "data",
    label: "Sample size",
    blurb: "How many trials a test needs before it starts — the question usually asked too late.",
    fields: [
      num("baseline", "Baseline rate (%)", "8"),
      num("mde", "Minimum detectable effect (%)", "10", "relative to the baseline"),
      sel("power", "Power", ["0.8", "0.9", "0.95"], "0.8"),
      sel("alpha", "Alpha", ["0.05", "0.01", "0.1"], "0.05"),
    ],
    run: (v): ToolResult => {
      const n = sampleSize(number(v, "baseline", 8), number(v, "mde", 10), Number(str2(v, "power")) || 0.8, Number(str2(v, "alpha")) || 0.05);
      if (!Number.isFinite(n)) return { headline: "That combination has no finite sample size", ok: false,
        basis: "a zero effect or a rate at 0/100% cannot be sized — check the inputs" };
      const perDay = number(v, "baseline", 8) > 0 ? null : null;
      return {
        headline: `${n.toLocaleString()} trials per arm`,
        ok: true,
        kpis: [
          { value: n.toLocaleString(), label: "per arm" },
          { value: (n * 2).toLocaleString(), label: "total" },
          { value: `${number(v, "baseline", 8)}% → ${(number(v, "baseline", 8) * (1 + number(v, "mde", 10) / 100)).toFixed(2)}%`, label: "detecting" },
        ],
        lines: [
          `Detecting a ${number(v, "mde", 10)}% relative change on an ${number(v, "baseline", 8)}% baseline needs ${n.toLocaleString()} per arm at ${(Number(str2(v, "power")) || 0.8) * 100}% power.`,
          "Sample size is a function of the effect you are trying to detect, not of the traffic you happen to have — if the traffic cannot reach this number in a sensible time, the honest move is to test a bigger change, not a smaller sample.",
          perDay ? "" : "Halving the effect roughly QUADRUPLES the sample: the relationship is inverse-square.",
        ].filter(Boolean),
        basis: "two-proportion formula with a pooled variance term and the normal quantiles for the chosen alpha "
             + "and power (no continuity correction)",
      };
    },
  },
];

/** Local reader for the select-valued power/alpha fields. */
function str2(v: Record<string, string | boolean>, key: string): string {
  const x = v[key];
  return typeof x === "string" ? x : typeof x === "boolean" ? String(x) : "";
}
