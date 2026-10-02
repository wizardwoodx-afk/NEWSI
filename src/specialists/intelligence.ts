/**
 * INTELLIGENCE — the domains where the number is a claim somebody will repeat.
 *
 *   ml        · how wide an evaluation interval really is, and whether a split leaks
 *   research  · citation coverage and inter-rater agreement
 *   media     · loudness normalisation and bitrate budgets
 *   finops    · spend trajectory and anomaly detection
 *
 * These are the honest-statistics tools of the pack. The interesting number in an evaluation
 * is never the score — it is the interval around it, and these tools refuse to report one
 * without the other.
 */
import { area, num, number, rows, sel, series, str, type Tool, type ToolResult, type Values } from "./types";

const n2 = (x: number, dp = 2) => x.toFixed(dp);

/** Z for the usual confidence levels — the published two-sided normal quantiles. */
const Z: Record<string, number> = { "80%": 1.2816, "90%": 1.6449, "95%": 1.96, "99%": 2.5758 };

/* ── ml ───────────────────────────────────────────────────────────────────── */

export function evalInterval(v: Values): ToolResult {
  const n = number(v, "n", 500);
  const wins = number(v, "wins", 431);
  const conf = str(v, "conf", "95%");
  const baseline = number(v, "baseline", 80);
  if (n <= 0 || wins < 0 || wins > n) {
    return { headline: "Trials and successes must be consistent — 0 ≤ wins ≤ trials", ok: false,
      basis: "A proportion needs a sample size and a count inside it." };
  }
  const p = wins / n;
  const z = Z[conf] ?? 1.96;
  /* Wilson score interval: correct at the edges, where the textbook normal interval is not.
     Reported instead of the naive interval on purpose — an eval that is 100% right on 12
     examples has a lower bound near 0.7, and saying "100%" hides that. */
  const denom = 1 + (z * z) / n;
  const centre = (p + (z * z) / (2 * n)) / denom;
  const half = (z / denom) * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  const lo = Math.max(0, centre - half), hi = Math.min(1, centre + half);
  const beats = lo > baseline / 100;
  return {
    headline: `${n2(p * 100, 1)}% on ${n} examples — ${conf} interval ${n2(lo * 100, 1)}% to ${n2(hi * 100, 1)}%`,
    ok: beats,
    kpis: [
      { value: `${n2(p * 100, 1)}%`, label: "measured" },
      { value: `${n2(lo * 100, 1)}–${n2(hi * 100, 1)}%`, label: `${conf} interval` },
      { value: `${n2((hi - lo) * 100, 1)} pts`, label: "width" },
      { value: String(n), label: "examples" },
    ],
    lines: [
      beats
        ? `The whole interval clears the ${baseline}% baseline, so the result is not explained by sampling alone.`
        : `The interval overlaps the ${baseline}% baseline — this run does not establish that the system beats it.`,
      `Halving the interval needs roughly ${Math.ceil(n * 4)} examples: precision costs quadratically, ` +
      `and that is the sentence to write before anyone promises a deadline.`,
    ],
    basis: `Wilson score interval (Wilson 1927) at ${conf}; z = ${z}. Chosen over the normal approximation because evaluations live at the edges (0% and 100%) where the naive interval is wrong. The interval describes sampling error only — label noise and a leaking split are separate failures.`,
  };
}

export function splitAudit(v: Values): ToolResult {
  const total = number(v, "rows", 50_000);
  const train = number(v, "train", 80);
  const val = number(v, "val", 10);
  const test = number(v, "test", 10);
  const dupes = number(v, "dupes", 0);
  const groups = str(v, "groups", "yes");
  if (total <= 0 || train + val + test !== 100) {
    return { headline: "The three splits must add up to 100%", ok: false,
      basis: "Proportions are of one corpus; they have to sum to the whole of it." };
  }
  const problems: string[] = [];
  if (val === 0) problems.push("no validation split — the test set will end up doing that job");
  if (test < 10) problems.push(`the test split is ${test}% (${Math.round((total * test) / 100)} rows), thin for a confident readout`);
  if (dupes > 0) problems.push(`${dupes} rows appear in more than one split — that is leakage, and it inflates the score`);
  if (groups === "no") problems.push("records are split individually, so rows from the same source can straddle the boundary");
  const clean = problems.length === 0;
  return {
    headline: clean
      ? `Split is clean: ${train}/${val}/${test} over ${total.toLocaleString()} rows, no duplicates, grouped`
      : `${problems.length} problem${problems.length === 1 ? "" : "s"} in this split`,
    ok: clean,
    kpis: [
      { value: `${train}/${val}/${test}`, label: "train / val / test" },
      { value: Math.round((total * test) / 100).toLocaleString(), label: "test rows" },
      { value: String(dupes), label: "duplicate rows" },
    ],
    table: {
      head: ["Split", "Share", "Rows"],
      rows: [["train", `${train}%`, Math.round((total * train) / 100).toLocaleString()],
        ["val", `${val}%`, Math.round((total * val) / 100).toLocaleString()],
        ["test", `${test}%`, Math.round((total * test) / 100).toLocaleString()]],
    },
    lines: problems.length ? problems.map((p) => `· ${p}.`) : ["No structural fault found in the proportions or the grouping rule."],
    basis: `Proportion arithmetic plus two stated rules: duplicates across splits are leakage, and records from one source belong on one side of the boundary. Neither rule is arithmetic — they are conventions this tool refuses to guess about, which is why it asks.`,
  };
}

/* ── research ─────────────────────────────────────────────────────────────── */

export function citationLint(v: Values): ToolResult {
  const body = str(v, "text");
  const lines = body.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
  const words = body.split(/\s+/).filter(Boolean).length;
  const refs = (body.match(/\[[0-9,\s–-]+\]|\([A-Z][A-Za-z-]+,\s*\d{4}\)|\bDOI\b|https?:\/\//g) ?? []).length;
  const numbers = lines.filter((l) => /\d/.test(l));
  const uncitedNumeric = numbers.filter((l) => !/\[[0-9,\s–-]+\]|\([A-Z][A-Za-z-]+,\s*\d{4}\)|https?:\/\//.test(l));
  const perK = words > 0 ? (refs / words) * 1000 : 0;
  const ok = uncitedNumeric.length === 0 && refs > 0;
  return {
    headline: refs === 0
      ? "No citations found at all — every number here is an unsourced claim"
      : `${refs} citation${refs === 1 ? "" : "s"} across ${words.toLocaleString()} words; ${uncitedNumeric.length} numeric line${uncitedNumeric.length === 1 ? "" : "s"} without one`,
    ok,
    kpis: [
      { value: String(refs), label: "citations" },
      { value: n2(perK, 1), label: "per 1,000 words" },
      { value: String(uncitedNumeric.length), label: "uncited numeric lines" },
    ],
    table: uncitedNumeric.length
      ? { head: ["Line", "Text"], rows: uncitedNumeric.slice(0, 8).map((l, i) => [String(i + 1), l.length > 96 ? l.slice(0, 95) + "…" : l]) }
      : undefined,
    lines: [
      "A numeric line with no citation beside it is the single most common fault in a draft that is otherwise sound — " +
      "and the cheapest to fix before a reviewer finds it.",
      refs === 0
        ? "Zero citations is not a lint failure with a threshold; it is a different kind of document."
        : `Citation density ${n2(perK, 1)} per 1,000 words. Density is a habit, not a standard: nothing here says a document needs a fixed rate.`,
    ],
    basis: "Mechanical pattern counts: bracketed references, (Author, year), DOI and URL forms; a line counts as uncited when it carries a digit and none of those markers. It checks that a citation is PRESENT, never that it supports the claim.",
  };
}

export function raterAgreement(v: Values): ToolResult {
  const pairs = rows(v, "pairs").map((l) => l.split(/[,;]/).map((x) => x.trim())).filter((p) => p.length >= 2 && p[0] && p[1]);
  if (pairs.length === 0) {
    return { headline: "No ratings to compare — each line is `rater A, rater B`", ok: false,
      basis: "Agreement needs two labels per item, one from each rater." };
  }
  const labels = [...new Set(pairs.flatMap((p) => [p[0]!, p[1]!]))];
  const n = pairs.length;
  const agree = pairs.filter((p) => p[0] === p[1]).length;
  const po = agree / n;
  const aCounts = new Map<string, number>(), bCounts = new Map<string, number>();
  for (const [a, b] of pairs) {
    aCounts.set(a!, (aCounts.get(a!) ?? 0) + 1);
    bCounts.set(b!, (bCounts.get(b!) ?? 0) + 1);
  }
  const pe = labels.reduce((s, l) => s + ((aCounts.get(l) ?? 0) / n) * ((bCounts.get(l) ?? 0) / n), 0);
  const kappa = pe === 1 ? 1 : (po - pe) / (1 - pe);
  const reading = kappa >= 0.8 ? "almost perfect" : kappa >= 0.6 ? "substantial" : kappa >= 0.4 ? "moderate" : kappa >= 0.2 ? "fair" : "slight or worse";
  return {
    headline: `Raters agree on ${n2(po * 100, 1)}% of ${n} items — κ = ${n2(kappa, 3)} (${reading})`,
    ok: kappa >= 0.6,
    kpis: [
      { value: `${n2(po * 100, 1)}%`, label: "observed agreement" },
      { value: `${n2(pe * 100, 1)}%`, label: "chance agreement" },
      { value: n2(kappa, 3), label: "Cohen's κ" },
      { value: String(labels.length), label: "labels used" },
    ],
    table: {
      head: ["Label", "Rater A", "Rater B"],
      rows: labels.map((l) => [l, String(aCounts.get(l) ?? 0), String(bCounts.get(l) ?? 0)]),
    },
    lines: [
      `${n2(pe * 100, 1)}% agreement is what chance alone would produce with these label frequencies — κ is the part above it.`,
      kappa < 0.6
        ? "Below substantial: the disagreement is in the instructions or the rubric, not in the raters. Fix the definition before multiplying the labels."
        : "Substantial agreement: these labels can carry weight in an evaluation.",
    ],
    basis: `Cohen's κ = (Po − Pe) ÷ (1 − Pe), with Pe from the raters' own marginal distributions. Landis & Koch's verbal bands (0.6 substantial, 0.8 almost perfect) are the convention quoted here, not a law of nature. κ assumes the labels are exhaustive and mutually exclusive.`,
  };
}

/* ── media ────────────────────────────────────────────────────────────────── */

export function loudnessGain(v: Values): ToolResult {
  const measured = number(v, "measured", -9.4);
  const target = number(v, "target", -14);
  const peak = number(v, "peak", -0.8);
  const ceiling = number(v, "ceiling", -1);
  const gain = target - measured;
  const peakAfter = peak + gain;
  const over = peakAfter > ceiling;
  return {
    headline: over
      ? `Gain ${n2(gain, 1)} dB would push the true peak to ${n2(peakAfter, 2)} dBTP — past the ${ceiling} dBTP ceiling`
      : `Gain ${n2(gain, 1)} dB reaches the ${target} LUFS target with peak at ${n2(peakAfter, 2)} dBTP`,
    ok: !over,
    kpis: [
      { value: `${n2(measured, 1)} LUFS`, label: "measured" },
      { value: `${n2(gain, 1)} dB`, label: "gain to apply" },
      { value: `${n2(peakAfter, 2)} dBTP`, label: "peak after" },
    ],
    lines: [
      over
        ? `The limiter must do ${n2(peakAfter - ceiling, 2)} dB of work. That is a real change to the material, not a normalisation step — ` +
          `a gentler target or fewer peaky transients is the honest route.`
        : "No limiting needed: the gain fits under the ceiling with room to spare.",
      `Peak and loudness move together under linear gain, so this is one subtraction on each — the two do not need separate passes.`,
    ],
    basis: `Loudness is integrated LUFS (ITU-R BS.1770 / EBU R128); the −14 LUFS target is the streaming convention, not a broadcast standard (EBU R128 broadcast is −23 LUFS). True peak is measured against the ceiling you declare; a lossy codec can overshoot a true-peak reading, so keep margin.`,
  };
}

export function bitrateBudget(v: Values): ToolResult {
  const minutes = number(v, "minutes", 42);
  const target = number(v, "target", 800);
  const audio = number(v, "audio", 128);
  const ladder = series(v, "ladder");
  const rungs = (ladder.length ? ladder : [2000, 3000, 4500, 6000, 8000]).map((kbps) => {
    const mb = ((kbps + audio) * minutes * 60) / 8 / 1000;
    return { kbps, mb };
  });
  const fits = rungs.filter((r) => r.mb <= target);
  const best = fits.length ? fits[fits.length - 1]! : null;
  return {
    headline: best
      ? `Highest rung that fits ${target} MB over ${minutes} min: ${best.kbps} kbps (${n2(best.mb, 0)} MB with ${audio} kbps audio)`
      : `Nothing on the ladder fits ${target} MB — the smallest rung alone is ${n2(rungs[0]!.mb, 0)} MB`,
    ok: !!best,
    kpis: [
      { value: `${n2(rungs[0]!.mb, 0)}–${n2(rungs[rungs.length - 1]!.mb, 0)} MB`, label: "ladder range" },
      { value: String(best?.kbps ?? rungs[0]!.kbps), label: "rung to ship" },
      { value: `${minutes} min`, label: "duration" },
    ],
    table: { head: ["Rung (kbps)", "Size (MB)", "Against the target"], rows: rungs.map((r) => [String(r.kbps), n2(r.mb, 0), r.mb <= target ? "fits" : "over"]) },
    lines: [
      `Audio is charged against every rung the same way — ${n2(((audio * minutes * 60) / 8 / 1000), 0)} MB of it — which is why dropping the video rung ` +
      `is not the same as dropping the size.`,
      "Size = bitrate × duration. It is exact arithmetic, and every streaming budget conversation is a variant of it.",
    ],
    basis: `MB = (video kbps + audio kbps) × duration(seconds) ÷ 8 ÷ 1000. Variable-bitrate encodes land under this number on average and over it in busy scenes, so leave margin rather than budgeting to the byte.`,
  };
}

/* ── finops ───────────────────────────────────────────────────────────────── */

export function spendForecast(v: Values): ToolResult {
  const months = series(v, "months");
  const horizon = number(v, "horizon", 3);
  if (months.length < 2) {
    return { headline: "Give at least two months of spend — a trend needs two points", ok: false,
      basis: "Least-squares needs at least two observations; two is already a weak fit and the result says so." };
  }
  const n = months.length;
  const xs = months.map((_, i) => i + 1);
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = months.reduce((a, b) => a + b, 0) / n;
  const sxx = xs.reduce((s, x) => s + (x - mx) ** 2, 0);
  const sxy = xs.reduce((s, x, i) => s + (x - mx) * (months[i]! - my), 0);
  const slope = sxx === 0 ? 0 : sxy / sxx;
  const intercept = my - slope * mx;
  const forecast = Array.from({ length: Math.max(1, Math.min(24, horizon)) }, (_, i) => n + i + 1).map((x) => ({
    x, y: intercept + slope * x,
  }));
  const last = forecast[forecast.length - 1]!;
  return {
    headline: `${slope >= 0 ? "+" : ""}${n2(slope, 0)} per month on a ${n2(my, 0)} average — ${n2(last.y, 0)} expected in month ${last.x}`,
    ok: slope <= 0,
    kpis: [
      { value: n2(my, 0), label: "average" },
      { value: `${slope >= 0 ? "+" : ""}${n2(slope, 1)}`, label: "trend / month" },
      { value: n2(last.y, 0), label: `month ${last.x}` },
      { value: String(n), label: "months observed" },
    ],
    table: {
      head: ["Month", "Observed", "Fitted"],
      rows: [...months.map((m, i) => [String(i + 1), n2(m, 0), n2(intercept + slope * (i + 1), 0)]),
        ...forecast.map((f) => [String(f.x), "—", n2(f.y, 0)])].slice(0, 14),
    },
    lines: [
      `Trend is ${slope >= 0 ? "upward" : "downward"} at ${n2(Math.abs(slope), 0)} per month across ${n} months of evidence.`,
      n < 6
        ? `${n} months is a thin basis for a trend and the fit will chase whatever happened last — treat the projection as one scenario, not a budget.`
        : "The fit is a straight line through months that were probably not straight; use it as the trend, not as the plan.",
    ],
    basis: `Ordinary least squares on month index: fitted = mean + slope × (x − mean x). A linear fit to spend is a statement that the recent past continues — it cannot see a contract ending, a migration finishing or a price change.`,
  };
}

export function anomalyZ(v: Values): ToolResult {
  const values = series(v, "values");
  const threshold = number(v, "z", 3);
  if (values.length < 4) {
    return { headline: "Give at least four observations — a mean and a spread need them", ok: false,
      basis: "A z-score compares each day with the mean and standard deviation of the rest; three points make both meaningless." };
  }
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const sd = Math.sqrt(values.reduce((s, x) => s + (x - mean) ** 2, 0) / (values.length - 1));
  const flagged = values.map((x, i) => ({ i: i + 1, x, z: sd === 0 ? 0 : (x - mean) / sd }))
    .filter((r) => Math.abs(r.z) >= threshold);
  return {
    headline: flagged.length === 0
      ? `No day crosses ${threshold}σ against a mean of ${n2(mean, 2)}`
      : `${flagged.length} day${flagged.length === 1 ? "" : "s"} cross ${threshold}σ — ${flagged.map((f) => `day ${f.i}`).join(", ")}`,
    ok: flagged.length === 0,
    kpis: [
      { value: n2(mean, 2), label: "mean" },
      { value: n2(sd, 2), label: "std deviation" },
      { value: String(flagged.length), label: `≥ ${threshold}σ` },
      { value: String(values.length), label: "days" },
    ],
    table: flagged.length
      ? { head: ["Day", "Value", "z"], rows: flagged.slice(0, 10).map((f) => [String(f.i), n2(f.x, 2), n2(f.z, 2)]) }
      : undefined,
    lines: [
      `Each flagged day sits at least ${threshold} standard deviations from the mean of the whole window.`,
      flagged.length
        ? "A single outlier inflates the mean and the spread together, which hides the next one. Re-run with the flagged day removed before deciding it is the only anomaly."
        : "No day is unusual against this window. That is a statement about the window, not about the bill.",
    ],
    basis: `z = (x − mean) ÷ sample standard deviation (n − 1), flagged at |z| ≥ ${threshold}. Daily spend is skewed and autocorrelated (weekends, batch jobs), so a normal-theory threshold is a screen for attention, not a verdict — and one outlier masks the next.`,
  };
}

export const INTELLIGENCE_TOOLS: readonly Tool[] = Object.freeze([
  {
    id: "eval-interval", domain: "ml", label: "Evaluation interval",
    blurb: "The interval around an accuracy figure — never the score on its own.",
    fields: [
      num("n", "Examples evaluated", "500"),
      num("wins", "Correct outcomes", "431"),
      sel("conf", "Confidence", Object.keys(Z), "95%"),
      num("baseline", "Baseline to beat (%)", "80"),
    ],
    run: evalInterval,
  },
  {
    id: "split-audit", domain: "ml", label: "Split audit",
    blurb: "Check train/val/test proportions, duplicates and the grouping rule for leakage.",
    fields: [
      num("rows", "Corpus rows", "50000"),
      num("train", "Train (%)", "80"),
      num("val", "Validation (%)", "10"),
      num("test", "Test (%)", "10"),
      num("dupes", "Rows appearing in more than one split", "0"),
      sel("groups", "Split by group, not by row", ["yes", "no"], "yes"),
    ],
    run: splitAudit,
  },
  {
    id: "citation-lint", domain: "research", label: "Citation lint",
    blurb: "Which numeric claims carry no citation — the cheapest fault to fix before review.",
    fields: [
      area("text", "Draft", "Latency improved by 37% in the second run [3].\nCost fell to 12 per unit in March.\nThroughput reached 9,400 rpm (Iyer, 2024)."),
    ],
    run: citationLint,
  },
  {
    id: "rater-agreement", domain: "research", label: "Rater agreement",
    blurb: "Cohen's κ beside the raw agreement, because chance agreement is not zero.",
    fields: [
      area("pairs", "One item per line: rater A label, rater B label",
        "pass, pass\nfail, fail\npass, pass\nborderline, fail\nfail, fail\npass, pass\nborderline, borderline\nfail, fail"),
    ],
    run: raterAgreement,
  },
  {
    id: "loudness-gain", domain: "media", label: "Loudness gain",
    blurb: "The gain to a target LUFS, and whether the limiter has to work for it.",
    fields: [
      num("measured", "Measured integrated loudness (LUFS)", "-9.4"),
      num("target", "Target (LUFS)", "-14"),
      num("peak", "Measured true peak (dBTP)", "-0.8"),
      num("ceiling", "Peak ceiling (dBTP)", "-1"),
    ],
    run: loudnessGain,
  },
  {
    id: "bitrate-budget", domain: "media", label: "Bitrate budget",
    blurb: "Which rung of an encoding ladder fits a size budget over the runtime.",
    fields: [
      num("minutes", "Duration (minutes)", "42"),
      num("target", "Size budget (MB)", "800"),
      num("audio", "Audio bitrate (kbps)", "128"),
      area("ladder", "Video rungs in kbps — one per line, or comma separated", "2000\n3000\n4500\n6000\n8000"),
    ],
    run: bitrateBudget,
  },
  {
    id: "spend-forecast", domain: "finops", label: "Spend forecast",
    blurb: "Trend and projection from the months you have, with the fit's honesty stated.",
    fields: [
      area("months", "Monthly spend — one per line", "18400\n19250\n18900\n21100\n22600\n23900"),
      num("horizon", "Months to project", "3"),
    ],
    run: spendForecast,
  },
  {
    id: "anomaly-z", domain: "finops", label: "Spend anomalies",
    blurb: "Days that sit far from their own window's mean, with the caveat attached.",
    fields: [
      area("values", "Spend per day — one per line", "410\n398\n425\n402\n418\n24000\n430\n415\n398\n440\n420\n405"),
      num("z", "Flag at |z| ≥", "3"),
    ],
    run: anomalyZ,
  },
]);
