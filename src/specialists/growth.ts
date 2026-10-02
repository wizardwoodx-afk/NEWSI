/**
 * Growth engines — the commercial arithmetic that decides whether the rest can continue.
 *
 * These are the numbers a business is actually run on, and they are all ratios: lifetime
 * value against acquisition cost, stage-to-stage conversion, the compound curve of revenue,
 * and the scoring model that decides what gets built. They are arithmetic, not sentiment,
 * which is exactly why they belong in a deterministic engine rather than in a persuasive
 * paragraph written after the decision.
 */
import { area, num, number, str, series, type Tool, type ToolResult } from "./types";

/* ── unit economics ────────────────────────────────────────────────────────── */

export interface UnitEconomics {
  ltv: number; ltvCac: number; paybackMonths: number; grossMarginPerMonth: number;
  verdict: string; caveats: string[];
}

export function unitEconomics(arpuMonthly: number, grossMarginPct: number, cac: number, monthlyChurnPct: number): UnitEconomics {
  const margin = arpuMonthly * (grossMarginPct / 100);
  const churn = monthlyChurnPct / 100;
  const ltv = churn > 0 ? margin / churn : Number.POSITIVE_INFINITY;
  const paybackMonths = margin > 0 ? cac / margin : Number.POSITIVE_INFINITY;
  const ratio = cac > 0 ? ltv / cac : Number.POSITIVE_INFINITY;
  const caveats: string[] = [];
  if (churn <= 0) caveats.push("zero churn makes lifetime value infinite, which is a modelling artefact rather than a result — use a real observed churn rate, even a pessimistic one.");
  if (monthlyChurnPct > 5) caveats.push(`at ${monthlyChurnPct}% monthly churn the average customer lasts about ${(100 / monthlyChurnPct).toFixed(1)} months; most of the lifetime value is being paid for twice.`);
  caveats.push("Gross margin, not revenue, is what repays acquisition cost — a business with a 20% margin needs five times the revenue of one with 100% to reach the same payback.");
  const verdict = ratio >= 3 && paybackMonths <= 18
    ? "Healthy: lifetime value is at least three times acquisition cost and payback is inside eighteen months."
    : ratio >= 3
      ? `The ratio is healthy but payback is ${paybackMonths.toFixed(0)} months — growth financed at that speed needs capital that believes in it.`
      : ratio >= 1
        ? `Marginal: every customer eventually repays acquisition and then some, at a ratio of ${ratio.toFixed(1)}:1 where 3:1 is the usual bar.`
        : "Negative unit economics: each customer costs more to acquire than the margin they ever produce. More growth makes this worse, not better.";
  return { ltv, ltvCac: ratio, paybackMonths, grossMarginPerMonth: margin, verdict, caveats };
}

/* ── funnels ───────────────────────────────────────────────────────────────── */

export interface FunnelStep { stage: string; count: number; fromPrevious: number; fromTop: number; drop: number }

export function funnel(counts: number[], stages: string[]): {
  steps: FunnelStep[]; worst: FunnelStep | null; overall: number;
} {
  const steps: FunnelStep[] = counts.map((count, i) => {
    const prev = i === 0 ? count : counts[i - 1]!;
    const top = counts[0] ?? 0;
    return {
      stage: stages[i] ?? `step ${i + 1}`,
      count,
      fromPrevious: prev > 0 ? (count / prev) * 100 : 0,
      fromTop: top > 0 ? (count / top) * 100 : 0,
      drop: prev - count,
    };
  });
  const candidates = steps.slice(1);
  const worst = candidates.length > 0
    ? candidates.reduce((a, b) => (a.fromPrevious <= b.fromPrevious ? a : b))
    : null;
  return { steps, worst, overall: counts.length > 1 && (counts[0] ?? 0) > 0 ? ((counts[counts.length - 1]! / counts[0]!) * 100) : 0 };
}

/* ── prioritisation ────────────────────────────────────────────────────────── */

export function riceScore(reach: number, impact: number, confidencePct: number, effort: number): number {
  if (effort <= 0) return 0;
  return (reach * impact * (confidencePct / 100)) / effort;
}

/* ── revenue trajectory ────────────────────────────────────────────────────── */

export function growthModel(startMrr: number, growthPctPerMonth: number, months: number, churnPct = 0): {
  rows: Array<{ month: number; mrr: number }>; exitMrr: number; exitArr: number; totalBooked: number; cagrPct: number;
} {
  const rows: Array<{ month: number; mrr: number }> = [{ month: 0, mrr: startMrr }];
  let mrr = startMrr, total = startMrr;
  for (let m = 1; m <= months; m++) {
    const net = mrr * (1 + growthPctPerMonth / 100) - mrr * (churnPct / 100);
    mrr = net;
    rows.push({ month: m, mrr });
    total += mrr;
  }
  const cagrPct = startMrr > 0 && months > 0 ? (Math.pow(mrr / startMrr, 12 / months) - 1) * 100 : 0;
  return { rows, exitMrr: mrr, exitArr: mrr * 12, totalBooked: total, cagrPct };
}

/* ── the tools ─────────────────────────────────────────────────────────────── */

export const GROWTH_TOOLS: Tool[] = [
  {
    id: "unit-economics",
    domain: "growth",
    label: "Unit economics",
    blurb: "Lifetime value, the ratio that matters, and the months before a customer repays.",
    fields: [
      num("arpu", "Revenue per account / month", "1200"),
      num("margin", "Gross margin (%)", "78"),
      num("cac", "Acquisition cost per account", "9000"),
      num("churn", "Monthly churn (%)", "1.8"),
    ],
    run: (v): ToolResult => {
      const u = unitEconomics(number(v, "arpu", 1200), number(v, "margin", 78), number(v, "cac", 9000), number(v, "churn", 1.8));
      return {
        headline: `LTV ${u.ltv.toFixed(0)} · ${u.ltvCac.toFixed(1)}:1 · payback ${u.paybackMonths.toFixed(1)} months`,
        ok: u.ltvCac >= 3 && u.paybackMonths <= 18,
        kpis: [
          { value: u.grossMarginPerMonth.toFixed(0), label: "margin / month" },
          { value: u.ltv.toFixed(0), label: "lifetime value" },
          { value: `${u.ltvCac.toFixed(1)}:1`, label: "LTV : CAC" },
          { value: `${u.paybackMonths.toFixed(1)} mo`, label: "payback" },
        ],
        lines: [u.verdict, ...u.caveats],
        basis: "LTV = monthly gross margin ÷ monthly churn (a perpetuity: it assumes a constant churn rate and no "
             + "expansion revenue); payback = CAC ÷ monthly gross margin",
      };
    },
  },
  {
    id: "funnel",
    domain: "growth",
    label: "Funnel",
    blurb: "Stage-by-stage conversion, and where the volume actually goes.",
    fields: [area("counts", "Stage counts, one per line", "12000 visitors\n2400 signups\n900 activated\n260 paid\n180 retained 90 days", "fixed names are fine — the stage label is positional")],
    run: (v): ToolResult => {
      const counts = series(v, "counts");
      if (counts.length < 2) return { headline: "A funnel needs at least two stages", ok: false, basis: "one count per line, in order" };
      const stages = ["visitors", "signups", "activated", "paid", "retained"];
      const f = funnel(counts, stages);
      return {
        headline: `${f.overall.toFixed(2)}% end to end — worst step: ${f.worst?.stage ?? "—"} at ${f.worst?.fromPrevious.toFixed(1) ?? "0"}%`,
        ok: f.overall > 1,
        kpis: [
          { value: `${counts[0]}`, label: "entered" },
          { value: `${counts[counts.length - 1]}`, label: "completed" },
          { value: `${f.overall.toFixed(2)}%`, label: "end to end" },
          { value: f.worst ? `${f.worst.drop}` : "—", label: "biggest single drop" },
        ],
        table: { head: ["Stage", "Count", "From previous", "From top"],
                 rows: f.steps.map((s, i) => [s.stage === stages[i] ? s.stage : `step ${i + 1}`, `${s.count}`, i === 0 ? "—" : `${s.fromPrevious.toFixed(1)}%`, `${s.fromTop.toFixed(1)}%`]) },
        lines: [
          f.worst
            ? `The largest proportional loss is at ${f.worst.stage} (${f.worst.fromPrevious.toFixed(1)}% carried through), costing ${f.worst.drop.toLocaleString()} — that is where the next experiment belongs, not at the widest step.`
            : "No step stands out as the weak link.",
          "A funnel is a sequence, not a set: the counts must be nested (each stage a subset of the one before), or the percentages are meaningless.",
        ],
        basis: "conversion computed stage-to-stage and from the top; labels are positional",
      };
    },
  },
  {
    id: "rice",
    domain: "growth",
    label: "RICE",
    blurb: "Scores a backlog the way the framework intends — with confidence as a discount, not a vote.",
    fields: [
      num("reach", "Reach (users / quarter)", "800"),
      num("impact", "Impact (0.25 – 3)", "2"),
      num("confidence", "Confidence (%)", "80"),
      num("effort", "Effort (person-weeks)", "6"),
      area("others", "Other candidates", "Onboarding rewrite, 1200, 2, 70, 10\nBulk import, 300, 3, 90, 4\nPricing page test, 2000, 1, 60, 2", "name, reach, impact, confidence, effort"),
    ],
    run: (v): ToolResult => {
      const reach = number(v, "reach", 800), impact = number(v, "impact", 2);
      const confidence = number(v, "confidence", 80), effort = number(v, "effort", 6);
      const score = riceScore(reach, impact, confidence, effort);
      const others = str(v, "others").split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l) => {
        const [name, r, i, c, e] = l.split(/\s*,\s*/);
        return { name: name ?? l, score: riceScore(Number(r), Number(i), Number(c), Number(e)), effort: Number(e) };
      }).filter((o) => Number.isFinite(o.score));
      const ranked = [...others, { name: "(this candidate)", score, effort }].sort((a, b) => b.score - a.score);
      return {
        headline: `RICE ${score.toFixed(1)} — rank ${ranked.findIndex((r) => r.name === "(this candidate)") + 1} of ${ranked.length}`,
        ok: true,
        kpis: [
          { value: score.toFixed(1), label: "RICE score" },
          { value: `${reach} × ${impact} × ${confidence}%`, label: "reach × impact × confidence" },
          { value: `${effort}`, label: "effort (person-weeks)" },
        ],
        table: { head: ["Candidate", "RICE", "Effort (weeks)", "Score per week"],
                 rows: ranked.map((r) => [r.name, r.score.toFixed(1), `${r.effort}`, r.effort > 0 ? (r.score / r.effort).toFixed(2) : "—"]) },
        lines: [
          "RICE is a sorting device, not a decision — it makes the inputs explicit so that a disagreement about the ranking can be traced to a number somebody chose.",
          "Confidence is a discount on the estimate, not a vote for the idea: 50% confidence is half the score, which is the framework working as intended.",
        ],
        basis: "(reach × impact × confidence%) ÷ effort — the Intercom formulation; impact uses the 0.25/0.5/1/2/3 "
             + "scale and effort is person-weeks",
      };
    },
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
      num("months", "Months", "24"),
    ],
    run: (v): ToolResult => {
      const months = Math.max(1, Math.min(120, Math.round(number(v, "months", 24))));
      const g = growthModel(number(v, "start", 40000), number(v, "growth", 12), months, number(v, "churn", 1.5));
      const kpis = [
        { value: g.exitMrr.toFixed(0), label: `MRR at month ${months}` },
        { value: g.exitArr.toFixed(0), label: "exit ARR" },
        { value: `${g.cagrPct.toFixed(1)}%`, label: "implied annual growth" },
        { value: g.totalBooked.toFixed(0), label: "cumulative MRR booked" },
      ];
      return {
        headline: `MRR ${number(v, "start", 40000).toFixed(0)} → ${g.exitMrr.toFixed(0)} in ${months} months`,
        ok: true,
        kpis,
        table: { head: ["Month", "MRR"], rows: g.rows.filter((r) => r.month % Math.max(1, Math.round(months / 8)) === 0).map((r) => [`${r.month}`, r.mrr.toFixed(0)]) },
        lines: [
          `A ${number(v, "growth", 12)}% monthly gross rate against ${number(v, "churn", 1.5)}% churn is a net ${(number(v, "growth", 12) - number(v, "churn", 1.5)).toFixed(1)}% — the churn is applied to the whole base, so it grows in absolute terms as the base grows.`,
          "Compounding is unforgiving in both directions: halving the net rate roughly doubles the time to reach the same MRR, which is why the churn number deserves more attention than the growth number in most plans.",
        ],
        basis: "month-by-month compounding: MRRₙ = MRRₙ₋₁ × (1 + growth) − MRRₙ₋₁ × churn; acquisition is modelled as a "
             + "percentage of the existing base rather than a fixed number of new accounts, so this is a curve, not a plan",
      };
    },
  },
];
