/**
 * SYSTEMS — the domains where a number decides whether the thing runs at all.
 *
 *   mobile    · touch targets and the release size budget
 *   cloud     · instance sizing and egress cost
 *   db        · index selectivity and connection-pool sizing
 *   embedded  · power budget and real-time schedulability
 *
 * Every function here is arithmetic against a published rule, a platform minimum or a
 * standard formula — the point of the pack is that a model is not the thing doing the sum.
 * Where a number is a heuristic rather than a guarantee (a planner's cost model, a
 * scheduling bound's assumption) the result says which it is, in its own basis line.
 */
import { area, bool, flag, num, number, rows, sel, str, type Tool, type ToolResult, type Values } from "./types";

const n2 = (x: number, dp = 2) => x.toFixed(dp);

/* ── mobile ───────────────────────────────────────────────────────────────── */

/** Platform minimums, and the WCAG 2.5.8 target-size floor. Published values. */
const TARGET_MIN: Record<string, { px: number; src: string }> = {
  "Apple iOS (44pt)": { px: 44, src: "Apple Human Interface Guidelines — 44×44 pt minimum" },
  "Android (48dp)": { px: 48, src: "Material Design — 48×48 dp minimum touch target" },
  "WCAG 2.5.8 (24px)": { px: 24, src: "WCAG 2.2 SC 2.5.8 Target Size (Minimum) — 24×24 CSS px" },
};

export function touchTargets(v: Values): ToolResult {
  const platform = str(v, "platform", "Apple iOS (44pt)");
  const min = TARGET_MIN[platform] ?? TARGET_MIN["Apple iOS (44pt)"]!;
  const spacing = number(v, "spacing", 8);
  const listed = rows(v, "targets").map((line) => {
    const [name, size] = line.split(/[,=]/);
    const m = (size ?? "").match(/(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)/);
    return { name: (name ?? "").trim() || "unnamed", w: m ? Number(m[1]) : 0, h: m ? Number(m[2]) : 0 };
  });
  if (listed.length === 0) {
    return { headline: "No targets to measure — they are read as `name, WxH` in px", ok: false,
      basis: `${min.src}. Each line is one control: its name, then its width × height in pixels.` };
  }
  const table = listed.map((t) => {
    const shortW = Math.max(0, min.px - t.w), shortH = Math.max(0, min.px - t.h);
    /* The spacing exception exists in WCAG 2.5.8: an undersized target passes only when the
       circle around it does not intersect a neighbour's. We can test the spacing half of
       that rule from the numbers given, and the result says exactly that. */
    const fitsBySpacing = t.w + spacing >= min.px || t.h + spacing >= min.px;
    const pass = shortW === 0 && shortH === 0;
    const verdict = pass ? "meets the floor" : fitsBySpacing ? "undersized — passes only under the spacing exception" : "undersized";
    return [t.name, `${t.w}×${t.h}`, `${n2(t.w * t.h, 0)}`, pass ? "—" : `${shortW || shortH}px short`, verdict];
  });
  const failing = table.filter((r) => r[4] !== "meets the floor").length;
  const smallest = listed.reduce((a, b) => (a.w * a.h <= b.w * b.h ? a : b));
  return {
    headline: failing === 0
      ? `All ${listed.length} targets meet the ${platform} floor`
      : `${failing} of ${listed.length} targets fall under ${min.px}px (${platform})`,
    ok: failing === 0,
    kpis: [
      { value: String(listed.length), label: "targets" },
      { value: String(failing), label: "under the floor" },
      { value: `${smallest.w}×${smallest.h}`, label: "smallest" },
    ],
    table: { head: ["Target", "Size", "Area px²", "Shortfall", "Verdict"], rows: table },
    lines: [
      `Minimum applied: ${min.px}px in both axes. An undersized target is reported against the spacing ` +
      `exception separately, because that exception is conditional and a pass there is not the same claim as a pass without it.`,
    ],
    basis: `${min.src}; spacing exception measured at the ${spacing}px you declared. This measures the declared sizes, not the rendered ones.`,
  };
}

export function appSizeBudget(v: Values): ToolResult {
  const now = number(v, "current", 42);
  const target = number(v, "target", 60);
  const growth = number(v, "growth", 6);
  const releases = number(v, "releases", 12);
  if (now <= 0 || target <= now) {
    return { headline: "The budget must be larger than today's size — check the two figures", ok: false,
      basis: "A budget below the current size is already breached at release zero." };
  }
  const perRelease = now * (growth / 100);
  const table: string[][] = [];
  let size = now, breached: number | null = null;
  for (let r = 1; r <= Math.max(1, Math.min(120, releases)); r += 1) {
    size = breached === null ? size + perRelease : size * (1 + growth / 100);
    if (breached === null && size > target) breached = r;
    if (r <= 6 || size > target) table.push([`${r}`, n2(size, 1), size > target ? "over" : "within"]);
  }
  /* Two projections, deliberately: a fixed per-release addition (what the team controls) and
     compounding growth (what a growing asset pipeline actually does). They disagree, and the
     disagreement is the useful part. */
  const compound = Math.log(target / now) / Math.log(1 + growth / 100);
  return {
    headline: breached === null
      ? `Within budget for all ${releases} planned releases at +${growth}% each`
      : `Breaches the ${target} MB budget at release ${breached}`,
    ok: breached === null,
    kpis: [
      { value: `${n2(now, 1)} MB`, label: "today" },
      { value: `${n2(perRelease, 2)} MB`, label: "added per release" },
      { value: Number.isFinite(compound) ? n2(compound, 1) : "—", label: "releases if it compounds" },
    ],
    table: { head: ["Release", "Projected size (MB)", "Against budget"], rows: table.slice(0, 10) },
    lines: [
      `Linear (fixed addition): breach at release ${breached ?? "— not within the horizon shown"}.`,
      `Compounding at ${growth}%: the budget is reached after ${Number.isFinite(compound) ? n2(compound, 1) : "—"} releases. ` +
      `The two projections differ because compound growth is what an asset pipeline does and a fixed line item is what a release train does — ` +
      `plan against the compounding one and the fixed one is a pleasant surprise.`,
    ],
    basis: `size(r) = current + r × (current × growth%) for the fixed case, current × (1+growth%)^r for the compounding case. A budget is a number somebody chose; this states when it is crossed, not that crossing it is fatal.`,
  };
}

/* ── cloud ────────────────────────────────────────────────────────────────── */

export function instanceSizing(v: Values): ToolResult {
  const p95 = number(v, "p95", 72);
  const target = number(v, "target", 60);
  const count = number(v, "count", 6);
  const failover = bool(v, "failover", true);
  if (p95 <= 0 || target <= 0 || count <= 0) {
    return { headline: "Utilisation, target and instance count must all be positive", ok: false,
      basis: "Little's-Law-style headroom arithmetic needs a measured utilisation and a stated target." };
  }
  const needed = Math.ceil((count * p95) / target);
  const afterUtil = (count * p95) / needed;
  const failoverOk = !failover || needed - 1 >= 1;
  return {
    headline: needed === count
      ? `Current fleet already meets the ${target}% headroom target`
      : `Move from ${count} to ${needed} instances to hold ${target}% at p95 when the fleet is busy`,
    ok: failoverOk,
    kpis: [
      { value: `${n2(p95, 1)}%`, label: "measured p95" },
      { value: `${target}%`, label: "target ceiling" },
      { value: String(needed), label: "instances needed" },
      { value: `${n2(afterUtil, 1)}%`, label: "p95 after" },
    ],
    lines: [
      `Each instance would sit at about ${n2((p95 * count) / needed, 1)}% at the same p95 load.`,
      failoverOk
        ? `With one instance lost, ${needed - 1 > 0 ? `${needed - 1} remain in service` : "none remain"} — the fleet still serves traffic, tighter.`
        : "At this size, losing one instance loses the service. That is a statement about redundancy, not about utilisation.",
    ],
    basis: `instances = ceil(current × p95 ÷ target) — headroom arithmetic against the p95 you supplied, assuming load spreads evenly. It is a capacity estimate, not a scheduler: real fleets are also shaped by per-instance memory ceilings and connection limits.`,
  };
}

export function egressCost(v: Values): ToolResult {
  const gb = number(v, "gb", 4000);
  const price = number(v, "price", 0.09);
  const hit = number(v, "cache", 85);
  const cdnPrice = number(v, "cdn", 0.02);
  const gross = gb * price;
  const originGb = gb * (1 - hit / 100);
  const cdnGb = gb - originGb;
  const withCdn = originGb * price + cdnGb * cdnPrice;
  const saved = gross - withCdn;
  return {
    headline: saved > 0
      ? `A ${n2(hit, 0)}% cache hit rate moves ${n2(saved, 0)} per month off the origin bill`
      : "At these prices the cache is not cheaper — the numbers say so",
    ok: saved > 0,
    kpis: [
      { value: n2(gross, 0), label: "origin, uncached" },
      { value: n2(withCdn, 0), label: "with the cache" },
      { value: n2(saved, 0), label: "saved / month" },
      { value: n2(saved * 12, 0), label: "saved / year" },
    ],
    table: {
      head: ["Path", "GB / month", "Price / GB", "Cost / month"],
      rows: [
        ["Origin (uncached)", n2(gb, 0), n2(price, 2), n2(gross, 0)],
        ["Origin (cache misses)", n2(originGb, 0), n2(price, 2), n2(originGb * price, 0)],
        ["Cache (hits)", n2(cdnGb, 0), n2(cdnPrice, 2), n2(cdnGb * cdnPrice, 0)],
      ],
    },
    basis: `cost = Σ GB × price per path, with hits served from the cache and misses from the origin. Prices are the currency you type, not a quoted rate — the arithmetic holds for any tariff table.`,
  };
}

/* ── db ───────────────────────────────────────────────────────────────────── */

export function indexSelectivity(v: Values): ToolResult {
  const total = number(v, "rows", 4_000_000);
  const distinct = number(v, "distinct", 12_000);
  const matched = number(v, "matched", 400);
  const kind = str(v, "kind", "btree");
  if (total <= 0 || distinct <= 0) {
    return { headline: "Row count and distinct values must both be positive", ok: false,
      basis: "Selectivity needs the table's row count and the column's distinct-value count." };
  }
  const density = distinct / total;          // how selective the column is across the table
  const hitFraction = matched / total;       // how much of the table this predicate returns
  const good = hitFraction < 0.05;
  return {
    headline: good
      ? `A ${kind} index on this column should be used — the predicate matches ${n2(hitFraction * 100, 3)}% of rows`
      : `The predicate matches ${n2(hitFraction * 100, 1)}% of rows — a sequential scan is likely cheaper than the index`,
    ok: good,
    kpis: [
      { value: n2(density * 100, 4) + "%", label: "key density" },
      { value: n2(hitFraction * 100, 3) + "%", label: "rows matched" },
      { value: String(Math.round(total / distinct)), label: "rows per key" },
    ],
    lines: [
      `Roughly ${Math.round(total / distinct)} rows share each distinct value — that is the number that decides whether the ` +
      `index saves a scan or adds one.`,
      `Verdict threshold applied at 5% of the table: below it an indexed lookup usually wins, above it a sequential read ` +
      `usually does, and in between the planner's cost model decides.`,
    ],
    basis: `density = distinct ÷ rows; matched fraction = predicate rows ÷ total rows; the 5% crossover is the conventional ` +
      `planner heuristic, not a guarantee. This reads your numbers — run the real planner (EXPLAIN ANALYZE) before you ship a migration.`,
  };
}

export function poolSizing(v: Values): ToolResult {
  const rps = number(v, "rps", 300);
  const ms = number(v, "ms", 18);
  const instances = number(v, "instances", 3);
  const maxConns = number(v, "max", 100);
  const headroom = number(v, "headroom", 25);
  const inFlight = (rps * ms) / 1000;
  const perInstance = Math.ceil((inFlight / instances) * (1 + headroom / 100));
  const total = perInstance * instances;
  const fits = total <= maxConns;
  return {
    headline: fits
      ? `Pool size ${perInstance} per instance — ${total} connections against a ${maxConns} ceiling`
      : `Pool size ${perInstance} per instance would need ${total} connections — over the ${maxConns} the server allows`,
    ok: fits,
    kpis: [
      { value: n2(inFlight, 1), label: "queries in flight" },
      { value: String(perInstance), label: "pool per instance" },
      { value: `${total}/${maxConns}`, label: "connections" },
    ],
    lines: [
      fits
        ? `Spare headroom: ${maxConns - total} connections remain for migrations, admin and a second service on the same server.`
        : `Either raise max_connections, add ${Math.max(1, Math.ceil((total - maxConns) / perInstance))} fewer instance(s)' worth of pool, ` +
          `or cut latency — the connection count is concurrency, not traffic.`,
    ],
    basis: `Little's Law: concurrent queries = requests/second × query duration. Pool = that concurrency spread across instances, plus the headroom you asked for. It is the standard three-line calculation and it is the one most often skipped.`,
  };
}

/* ── embedded ─────────────────────────────────────────────────────────────── */

export function powerBudget(v: Values): ToolResult {
  const capacity = number(v, "mah", 2000);
  const active = number(v, "active", 45);
  const sleep = number(v, "sleep", 20);
  const duty = number(v, "duty", 4);
  if (capacity <= 0 || active <= 0) {
    return { headline: "Battery capacity and active current must both be positive", ok: false,
      basis: "Runtime comes from coulomb counting: charge ÷ average current." };
  }
  const d = duty / 100;
  const avg = active * d + (sleep / 1000) * (1 - d);
  const hours = capacity / avg;
  return {
    headline: `About ${n2(hours, 1)} hours (${n2(hours / 24, 1)} days) at a ${duty}% duty cycle`,
    ok: hours >= 24,
    kpis: [
      { value: n2(avg, 2), label: "average mA" },
      { value: n2(hours, 1), label: "hours" },
      { value: n2(hours / 24, 1), label: "days" },
    ],
    table: {
      head: ["State", "Share of time", "Current", "Charge share"],
      rows: [
        ["Active", `${duty}%`, `${active} mA`, `${n2((active * d) / avg * 100, 1)}%`],
        ["Sleep", `${n2(100 - duty, 1)}%`, `${sleep} µA`, `${n2(((sleep / 1000) * (1 - d)) / avg * 100, 1)}%`],
      ],
    },
    lines: [
      `The active state consumes ${n2((active * d) / avg * 100, 1)}% of the charge while occupying ${duty}% of the time — ` +
      `that ratio, not the duty cycle, is what a power optimisation actually moves.`,
      sleep > 0 && (sleep / 1000) * (1 - d) > active * d
        ? "Sleep current dominates, which is unusual: check the sleep figure before optimising the active path."
        : "The active path dominates, so the next gain is in time on, not in sleep current.",
    ],
    basis: `average current = active × duty + sleep × (1 − duty); runtime = capacity ÷ average. Static estimate: it assumes the published currents hold and ignores temperature, regulator efficiency and self-discharge.`,
  };
}

export function timingSlack(v: Values): ToolResult {
  const tasks = rows(v, "tasks").map((line) => {
    const [name, wcet, period] = line.split(/[,=]/).map((x) => (x ?? "").trim());
    return { name: name || "task", wcet: Number(wcet), period: Number(period) };
  }).filter((t) => Number.isFinite(t.wcet) && Number.isFinite(t.period) && t.period > 0);
  if (tasks.length === 0) {
    return { headline: "No tasks to schedule — each line is `name, WCET ms, period ms`", ok: false,
      basis: "Rate-monotonic analysis needs, per task, its worst-case execution time and its period." };
  }
  const table = tasks.map((t) => [t.name, `${t.wcet} ms`, `${t.period} ms`, `${n2((t.wcet / t.period) * 100, 2)}%`]);
  const totalU = tasks.reduce((s, t) => s + t.wcet / t.period, 0);
  const n = tasks.length;
  const bound = n * (Math.pow(2, 1 / n) - 1);
  const feasible = totalU <= bound;
  const rt = tasks.reduce((s, t) => s + t.wcet, 0);      // worst-case response of the lowest task
  return {
    headline: feasible
      ? `Schedulable: utilisation ${n2(totalU, 3)} ≤ the rate-monotonic bound ${n2(bound, 3)}`
      : totalU <= 1
        ? `Utilisation ${n2(totalU, 3)} exceeds the rate-monotonic bound ${n2(bound, 3)} — not guaranteed by the bound (and it is above 1 if it is above 1)`
        : `Overloaded: utilisation ${n2(totalU, 3)} exceeds 1.0 — no schedule exists for these tasks as declared`,
    ok: feasible,
    kpis: [
      { value: String(n), label: "tasks" },
      { value: `${n2(totalU * 100, 1)}%`, label: "utilisation" },
      { value: `${n2(bound * 100, 1)}%`, label: "RM bound" },
      { value: feasible ? `${n2((bound - totalU) * 100, 1)}%` : "—", label: "slack to the bound" },
    ],
    table: { head: ["Task", "WCET", "Period", "Utilisation"], rows: table },
    lines: [
      `Worst-case blocking, if every task runs in priority order: ${n2(rt, 2)} ms before the lowest-priority task completes.`,
      totalU <= bound
        ? "Under the bound, rate-monotonic priority assignment (shortest period first) schedules all of these against the deadline."
        : totalU <= 1
          ? "Above the bound the test is inconclusive rather than failing: exact response-time analysis, or a deadline-driven policy, may still schedule it."
          : "Above 1.0 utilisation there is no schedule at all with these periods and execution times — the task set itself must change.",
    ],
    basis: `Liu & Layland (1973): utilisation U = Σ Cᵢ/Tᵢ, rate-monotonic sufficient bound n(2^(1/n) − 1). The bound is SUFFICIENT, not necessary — passing guarantees schedulability, failing proves nothing either way. Interrupts, blocking and jitter are outside this model.`,
  };
}

/* ── the tool table the surface renders ───────────────────────────────────── */

export const SYSTEMS_TOOLS: readonly Tool[] = Object.freeze([
  {
    id: "touch-targets", domain: "mobile", label: "Touch targets",
    blurb: "Measure every control against the platform's minimum touch size, spacing exception included.",
    fields: [
      sel("platform", "Platform floor", Object.keys(TARGET_MIN), "Apple iOS (44pt)"),
      num("spacing", "Gap between targets (px)", "8", "used to evaluate the WCAG spacing exception"),
      area("targets", "Targets — one per line: name, WxH px", "back, 32x32\nsave, 44x44\nmenu, 24x48"),
    ],
    run: touchTargets,
  },
  {
    id: "app-size-budget", domain: "mobile", label: "App size budget",
    blurb: "Project release size against a budget, linearly and compounding — they disagree.",
    fields: [
      num("current", "Current download (MB)", "42"),
      num("target", "Budget (MB)", "60"),
      num("growth", "Growth per release (%)", "6"),
      num("releases", "Releases to project", "12"),
    ],
    run: appSizeBudget,
  },
  {
    id: "instance-sizing", domain: "cloud", label: "Instance sizing",
    blurb: "How many instances hold a headroom target at your measured p95.",
    fields: [
      num("p95", "Measured p95 utilisation (%)", "72"),
      num("target", "Target ceiling (%)", "60"),
      num("count", "Instances today", "6"),
      flag("failover", "Keep N+1 failover", true),
    ],
    run: instanceSizing,
  },
  {
    id: "egress-cost", domain: "cloud", label: "Egress cost",
    blurb: "What a cache hit rate is actually worth against your own tariff numbers.",
    fields: [
      num("gb", "Egress per month (GB)", "4000"),
      num("price", "Origin price per GB", "0.09"),
      num("cache", "Cache hit rate (%)", "85"),
      num("cdn", "Cache price per GB", "0.02"),
    ],
    run: egressCost,
  },
  {
    id: "index-selectivity", domain: "db", label: "Index selectivity",
    blurb: "Whether an index should be used, from key density and how much the predicate matches.",
    fields: [
      num("rows", "Table rows", "4000000"),
      num("distinct", "Distinct values in the column", "12000"),
      num("matched", "Rows the predicate matches", "400"),
      sel("kind", "Index kind", ["btree", "hash", "gin", "gist", "brin"], "btree"),
    ],
    run: indexSelectivity,
  },
  {
    id: "pool-sizing", domain: "db", label: "Connection pool",
    blurb: "Pool size from Little's Law, checked against the server's connection ceiling.",
    fields: [
      num("rps", "Requests per second", "300"),
      num("ms", "Average query (ms)", "18"),
      num("instances", "App instances", "3"),
      num("max", "Server max connections", "100"),
      num("headroom", "Headroom (%)", "25"),
    ],
    run: poolSizing,
  },
  {
    id: "power-budget", domain: "embedded", label: "Power budget",
    blurb: "Runtime from capacity, duty cycle and sleep current — and which state owns the charge.",
    fields: [
      num("mah", "Battery (mAh)", "2000"),
      num("active", "Active current (mA)", "45"),
      num("sleep", "Sleep current (µA)", "20"),
      num("duty", "Duty cycle (%)", "4"),
    ],
    run: powerBudget,
  },
  {
    id: "timing-slack", domain: "embedded", label: "Schedulability",
    blurb: "Rate-monotonic analysis: is this task set schedulable, and how much room is left.",
    fields: [
      area("tasks", "Tasks — one per line: name, WCET ms, period ms", "sense, 2, 20\ncontrol, 5, 50\nlog, 12, 200"),
    ],
    run: timingSlack,
  },
]);
