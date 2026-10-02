/**
 * Operations engines — the arithmetic of reliability, done before the incident rather than
 * during it.
 *
 * Error budgets and burn rates exist so that a team can decide calmly whether to ship or
 * freeze. Capacity headroom exists so that the answer to "can we take the launch" is a
 * number. The deploy-risk score is deliberately a simple, disclosed weighting rather than a
 * clever one: a gate nobody can explain is a gate people route around.
 */
import { num, flag, number, type Tool, type ToolResult } from "./types";

/* ── error budgets ─────────────────────────────────────────────────────────── */

export interface Budget {
  windowMinutes: number; allowedDownMinutes: number; consumedMinutes: number;
  remainingMinutes: number; burnRate: number; timeToExhaustHours: number | null; state: string;
}

export function sloErrorBudget(sloPercent: number, windowDays: number, consumedPercent: number): Budget {
  const windowMinutes = windowDays * 24 * 60;
  const allowedDownMinutes = windowMinutes * (1 - sloPercent / 100);
  const consumedMinutes = allowedDownMinutes * (consumedPercent / 100);
  const remainingMinutes = allowedDownMinutes - consumedMinutes;
  const burnRate = consumedPercent / 100;
  const timeToExhaustHours = burnRate > 0 ? (remainingMinutes / (consumedMinutes || 1)) * windowMinutes / 60 : null;
  const state = burnRate >= 1
    ? "exhausted — the SLO is breached for this window"
    : burnRate > 0.5
      ? "over half spent — freeze feature work, or the breach is a matter of when"
      : burnRate > 0.2
        ? "normal burn"
        : "comfortable";
  return { windowMinutes, allowedDownMinutes, consumedMinutes, remainingMinutes, burnRate, timeToExhaustHours, state };
}

/* ── capacity ──────────────────────────────────────────────────────────────── */

export function capacityHeadroom(currentPct: number, growthPctPerMonth: number, targetPct: number, months = 24): {
  breachMonth: number | null; atTarget: string; lines: string[];
} {
  if (growthPctPerMonth <= 0) {
    return { breachMonth: null, atTarget: `${targetPct}%`,
      lines: [`At ${growthPctPerMonth}% monthly growth the utilisation never rises — a flat or falling curve needs no capacity decision, only a check that the flatness is not an outage.`] };
  }
  let level = currentPct;
  let breachMonth: number | null = null;
  for (let m = 1; m <= months; m++) {
    level = level * (1 + growthPctPerMonth / 100);
    if (level >= targetPct && breachMonth === null) breachMonth = m;
  }
  return {
    breachMonth,
    atTarget: `${level.toFixed(1)}% after ${months} months`,
    lines: [
      breachMonth === null
        ? `Utilisation reaches ${level.toFixed(1)}% after ${months} months and stays below the ${targetPct}% ceiling — the runway is longer than this horizon.`
        : `Utilisation crosses ${targetPct}% in month ${breachMonth} (about ${(breachMonth / 12).toFixed(1)} years). That is the deadline for the capacity work, and it is a deadline that does not move because nobody planned for it.`,
      "Compound growth flattens this calculation fast: a 1-point change in the monthly rate moves the breach month more than a 10% change in headroom.",
    ],
  };
}

/* ── incident severity ─────────────────────────────────────────────────────── */

const SEVERITY_RULES = [
  "S1 — data loss or corruption, a security breach, or a total outage of the primary product",
  "S2 — a core journey is broken for many users, or revenue collection is impaired",
  "S3 — a feature is degraded or unavailable with a workaround available",
  "S4 — cosmetic or single-user impact",
];

export function incidentSeverity(usersAffectedPct: number, revenueImpactPct: number, dataLoss: boolean, hasWorkaround: boolean): {
  severity: "S1" | "S2" | "S3" | "S4"; why: string; rules: string[];
} {
  let severity: "S1" | "S2" | "S3" | "S4" = "S4";
  const reasons: string[] = [];
  if (dataLoss) { severity = "S1"; reasons.push("data loss or corruption is present — severity is S1 regardless of how many users noticed"); }
  else if (usersAffectedPct >= 50 || revenueImpactPct >= 10) {
    severity = "S2";
    reasons.push(`${usersAffectedPct}% of users affected and ${revenueImpactPct}% revenue impact — a core journey, so S2`);
  } else if (usersAffectedPct >= 10 || revenueImpactPct >= 2) {
    severity = hasWorkaround ? "S3" : "S2";
    reasons.push(hasWorkaround
      ? "material impact with a workaround available, which is what separates S3 from S2"
      : "material impact and NO workaround, which promotes this to S2");
  } else {
    severity = "S4";
    reasons.push("impact is below the material thresholds — S4");
  }
  return { severity, why: reasons.join("; "), rules: SEVERITY_RULES };
}

/* ── deploy risk ───────────────────────────────────────────────────────────── */

export function deployRisk(changedFiles: number, hasMigration: boolean, testsGreen: boolean,
  rollbackReady: boolean, offPeak: boolean, flagged: boolean): {
  score: number; recommendation: string; factors: Array<{ factor: string; weight: number; why: string }>;
} {
  const factors = [
    { factor: "Test suite", weight: testsGreen ? 0 : 30, why: "shipping with a failing or unknown test suite is the single largest avoidable risk" },
    { factor: "Rollback path", weight: rollbackReady ? 0 : 20, why: "no tested rollback means an incident becomes an archaeology exercise" },
    { factor: "Migration", weight: hasMigration ? 15 : 0, why: "a schema change outlives the deploy that made it" },
    { factor: "Blast radius", weight: changedFiles > 50 ? 15 : changedFiles > 15 ? 8 : 0, why: `${changedFiles} files changed — wide diffs are harder to reason about under pressure` },
    { factor: "Timing", weight: offPeak ? 0 : 10, why: "deploying into peak removes the calm window you would want to fix it in" },
    { factor: "Feature flag", weight: flagged ? 0 : 10, why: "without a flag the only way back is another deploy" },
  ];
  const score = Math.min(100, factors.reduce((a, f) => a + f.weight, 0));
  const recommendation = score === 0
    ? "Ship. Every risk factor this model checks is addressed."
    : score <= 15
      ? "Ship, with a human watching the dashboards for the first thirty minutes."
      : score <= 40
        ? "Ship behind a flag, or fix the cheapest factor above first — the score is dominated by one or two items, not by the diff."
        : "Do not ship yet. At this score the cheapest fix (usually the test suite or the rollback path) buys more than the delay costs.";
  return { score, recommendation, factors };
}

/* ── the tools ─────────────────────────────────────────────────────────────── */

export const OPS_TOOLS: Tool[] = [
  {
    id: "error-budget",
    domain: "ops",
    label: "Error budget",
    blurb: "What a SLO actually permits, how much is gone, and how long until the breach.",
    fields: [
      num("slo", "SLO (%)", "99.9"),
      num("window", "Window (days)", "30"),
      num("consumed", "Budget consumed (%)", "35"),
    ],
    run: (v): ToolResult => {
      const b = sloErrorBudget(number(v, "slo", 99.9), number(v, "window", 30), number(v, "consumed", 35));
      const hours = (b.allowedDownMinutes / 60).toFixed(1);
      return {
        headline: `${b.remainingMinutes.toFixed(0)} of ${b.allowedDownMinutes.toFixed(0)} minutes remaining — ${b.state}`,
        ok: b.burnRate <= 0.5,
        kpis: [
          { value: `${hours} h`, label: `allowed downtime / ${number(v, "window", 30)}d` },
          { value: `${b.remainingMinutes.toFixed(0)} min`, label: "remaining" },
          { value: `${(b.burnRate * 100).toFixed(0)}%`, label: "budget burned" },
          { value: b.timeToExhaustHours === null ? "—" : `${b.timeToExhaustHours.toFixed(0)} h`, label: "time to exhaust" },
        ],
        lines: [
          `A ${number(v, "slo", 99.9)}% SLO over ${number(v, "window", 30)} days allows ${hours} hours of failure — about ${(b.allowedDownMinutes / number(v, "window", 30)).toFixed(1)} minutes a day.`,
          b.state,
          "An error budget is a decision rule, not a report: spending it on a risky launch is legitimate, and so is freezing features when it is gone. What is not legitimate is discovering the breach after the fact.",
        ],
        basis: "budget = (1 − SLO) × window; burn rate = consumed / budget; time-to-exhaust extrapolates the "
             + "consumption rate observed so far (it is a straight-line estimate, and it says so)",
      };
    },
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
      num("months", "Horizon (months)", "24"),
    ],
    run: (v): ToolResult => {
      const c = capacityHeadroom(number(v, "current", 42), number(v, "growth", 6), number(v, "target", 80),
        Math.round(number(v, "months", 24)));
      return {
        headline: c.breachMonth === null ? `No breach inside the horizon (${c.atTarget})` : `Breach in month ${c.breachMonth}`,
        ok: c.breachMonth === null || c.breachMonth > 6,
        kpis: [
          { value: `${number(v, "current", 42)}%`, label: "now" },
          { value: `${number(v, "growth", 6)}%/mo`, label: "growth" },
          { value: `${number(v, "target", 80)}%`, label: "ceiling" },
          { value: c.atTarget, label: "at horizon" },
        ],
        lines: c.lines,
        basis: "compound growth on utilisation; the ceiling is a planning line, not a physical limit — the tool "
             + "does not model the knee in the performance curve before saturation",
      };
    },
  },
  {
    id: "severity",
    domain: "ops",
    label: "Severity",
    blurb: "Turns impact numbers into an S1–S4 call, with the rule that produced it.",
    fields: [
      num("users", "Users affected (%)", "12"),
      num("revenue", "Revenue impact (%)", "1"),
      flag("dataLoss", "Data loss or corruption", false),
      flag("workaround", "A workaround exists", true),
    ],
    run: (v): ToolResult => {
      const s = incidentSeverity(number(v, "users", 12), number(v, "revenue", 1),
        v["dataLoss"] === true, v["workaround"] === true);
      return {
        headline: `${s.severity} — ${s.why.split(";")[0]}`,
        ok: s.severity === "S3" || s.severity === "S4",
        kpis: [{ value: s.severity, label: "severity" }],
        lines: [s.why, ...s.rules],
        basis: "an explicit impact matrix: data loss is always S1; ≥50% of users or ≥10% revenue is S2; a workaround "
             + "is what separates S3 from S2 — the rule is printed so it can be argued with during an incident",
      };
    },
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
      flag("flag", "Behind a feature flag", true),
    ],
    run: (v): ToolResult => {
      const r = deployRisk(Math.round(number(v, "files", 23)), v["migration"] === true, v["tests"] === true,
        v["rollback"] === true, v["offPeak"] === true, v["flag"] === true);
      const active = r.factors.filter((f) => f.weight > 0);
      return {
        headline: `Risk ${r.score}/100 — ${r.recommendation.split(".")[0]}.`,
        ok: r.score <= 15,
        kpis: [{ value: `${r.score}`, label: "risk score" }, { value: `${active.length}`, label: "factors active" }],
        table: { head: ["Factor", "Weight", "Why"], rows: r.factors.map((f) => [f.factor, f.weight ? `+${f.weight}` : "—", f.why]) },
        lines: [r.recommendation, "The weights are a judgement, printed in full so a team can change them; what is not optional is writing them down."],
        basis: "additive weighted model over six factors (tests, rollback, migration, blast radius, timing, feature "
             + "flag), capped at 100 — deliberately simple so the gate can be explained to the person it stops",
      };
    },
  },
];
