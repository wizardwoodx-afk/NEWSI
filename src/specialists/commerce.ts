/**
 * COMMERCE — the domains where the number is attached to something a customer sees.
 *
 *   marketing · what a search result will actually truncate, and what a crawl costs
 *   locale    · translation coverage, and the space translated strings take
 *   supply    · order quantity and the safety stock that holds a service level
 *   web3      · what a transaction costs, and where the decimal point is
 *
 * The locale tool carries the expansion factors the localisation industry publishes as ranges
 * and states plainly that a range is not a measurement. The web3 tool is base-unit arithmetic,
 * which is where most of the bugs in that domain live.
 */
import { area, num, number, rows, sel, str, text, type Tool, type ToolResult, type Values } from "./types";

const n2 = (x: number, dp = 2) => x.toFixed(dp);
const money = (x: number, dp = 2) => x.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp });

/* ── marketing ────────────────────────────────────────────────────────────── */

export function metaLint(v: Values): ToolResult {
  const title = str(v, "title");
  const desc = str(v, "desc");
  const slug = str(v, "slug");
  if (!title.trim() && !desc.trim()) {
    return { headline: "Nothing to lint — give a title, a description or a slug", ok: false,
      basis: "Display limits are counted from the strings you paste; there is nothing to count otherwise." };
  }
  const TITLE_MAX = 60, DESC_MAX = 155, SLUG_MAX = 75;
  const stop = new Set(["a", "an", "the", "and", "or", "of", "for", "to", "in", "on", "with", "is", "are", "be", "by", "at", "from"]);
  const slugWords = slug.split("-").map((w) => w.trim()).filter(Boolean);
  const filler = slugWords.filter((w) => stop.has(w.toLowerCase()));
  const checks: Array<[string, string, boolean]> = [
    ["Title", `${title.length} chars (limit ${TITLE_MAX})`, title.length > 0 && title.length <= TITLE_MAX],
    ["Description", `${desc.length} chars (limit ${DESC_MAX})`, desc.length > 0 && desc.length <= DESC_MAX],
    ["Slug", `${slugWords.length} segments (limit ${SLUG_MAX} chars)`, slug.length > 0 && slug.length <= SLUG_MAX],
  ];
  const failing = checks.filter((c) => !c[2]).length;
  return {
    headline: failing === 0
      ? "Title, description and slug all sit inside their display limits"
      : `${failing} field${failing === 1 ? "" : "s"} would be truncated or is empty`,
    ok: failing === 0 && filler.length === 0,
    kpis: [
      { value: `${title.length}/${TITLE_MAX}`, label: "title" },
      { value: `${desc.length}/${DESC_MAX}`, label: "description" },
      { value: String(slugWords.length), label: "slug segments" },
      { value: String(filler.length), label: "filler words" },
    ],
    table: { head: ["Field", "Measured", "Verdict"], rows: checks.map(([f, m, ok]) => [f, m, ok ? "within" : "over or empty"]) },
    lines: [
      "Search engines truncate by rendered width, not by character count, so these limits are the conventional proxies — " +
      "a title of 58 wide characters can still be cut and one of 62 narrow ones can survive intact.",
      filler.length
        ? `Slug filler words to drop: ${filler.join(", ")}. They cost width and match nothing.`
        : "The slug carries no filler words; every segment is earning its place.",
    ],
    basis: `Character counts against the commonly cited display limits (title ~60, description ~155) — conventions derived from pixel widths, not published maxima. Slug hygiene is a stop-word check, which is a style rule, not a ranking factor this tool can measure.`,
  };
}

export function crawlBudget(v: Values): ToolResult {
  const pages = number(v, "pages", 250_000);
  const latency = number(v, "latency", 320);
  const rate = number(v, "rate", 5);
  const window_ = number(v, "window", 10);
  if (pages <= 0 || rate <= 0) {
    return { headline: "Pages and crawl rate must both be greater than zero", ok: false,
      basis: "Crawl time is pages × latency ÷ concurrency, bounded by the rate the server allows." };
  }
  const parallelizable = Math.max(1, Math.floor(window_ * 1000 / latency));
  const effective = Math.min(rate, parallelizable);
  const seconds = (pages * latency) / 1000 / effective;
  const hours = seconds / 3600;
  const days = hours / 24;
  const limited = parallelizable < rate;
  return {
    headline: `About ${n2(days, 1)} days to crawl ${pages.toLocaleString()} pages at ${effective.toFixed(1)} req/s`,
    ok: days <= 30,
    kpis: [
      { value: n2(hours, 1), label: "hours" },
      { value: n2(days, 1), label: "days" },
      { value: String(effective.toFixed(1)), label: "effective req/s" },
      { value: String(parallelizable), label: "parallel slots" },
    ],
    table: {
      head: ["Limit", "Value", "Binds?"],
      rows: [
        ["Robots/Crawl-delay rate", `${rate} req/s`, limited ? "no" : "yes"],
        ["Client parallelism", `${parallelizable} in flight`, limited ? "yes" : "no"],
        ["Latency", `${latency} ms`, "always"],
      ],
    },
    lines: [
      limited
        ? `The client can hold ${parallelizable} requests in flight but each takes ${latency} ms, so parallelism — not the rate limit — is what bounds this crawl. More workers would help.`
        : `The rate the server allows (${rate} req/s) is the binding constraint; more client parallelism would change nothing.`,
      `Crawl rate is also a politeness question, and politeness is a decision, not a calculation: this tells you what the current numbers imply, not what the site deserves.`,
    ],
    basis: `time = pages × latency ÷ effective concurrency, where effective = min(declared rate, floor(window ÷ latency)). It is throughput arithmetic; it ignores server-side variability, redirects and the pages a crawl discovers only by crawling.`,
  };
}

/* ── locale ───────────────────────────────────────────────────────────────── */

export function localeCoverage(v: Values): ToolResult {
  const base = number(v, "base", 4_200);
  const threshold = number(v, "threshold", 98);
  const listed = rows(v, "locales").map((line) => {
    const [locale, done, todo] = line.split(/[,=]/).map((x) => (x ?? "").trim());
    const d = Number(String(done).replace(/[,\s]/g, ""));
    const t = Number(String(todo).replace(/[,\s]/g, ""));
    return { locale: locale || "??", done: Number.isFinite(d) ? d : 0, todo: Number.isFinite(t) ? t : 0 };
  });
  if (base <= 0 || listed.length === 0) {
    return { headline: "Give the key count and rows of `locale, translated, missing`", ok: false,
      basis: "Coverage is translated keys over the base key count." };
  }
  const table = listed.map((l) => {
    const pct = (l.done / base) * 100;
    return [l.locale, String(l.done), String(l.todo), `${n2(pct, 1)}%`, pct >= threshold ? "shippable" : "below the bar"];
  });
  const worst = listed.reduce((a, b) => (a.done / base <= b.done / base ? a : b));
  const shipping = table.filter((r) => r[4] === "shippable").length;
  return {
    headline: shipping === listed.length
      ? `All ${listed.length} locales are at or above ${threshold}% of the ${base.toLocaleString()} keys`
      : `${listed.length - shipping} of ${listed.length} locales sit below ${threshold}% — worst is ${worst.locale}`,
    ok: shipping === listed.length,
    kpis: [
      { value: String(base.toLocaleString()), label: "base keys" },
      { value: String(listed.length), label: "locales" },
      { value: `${n2((worst.done / base) * 100, 1)}%`, label: `worst (${worst.locale})` },
      { value: `${threshold}%`, label: "bar" },
    ],
    table: { head: ["Locale", "Translated", "Missing", "Coverage", "Verdict"], rows: table },
    lines: [
      "Coverage is a count of keys present, not of sentences that read well. A locale at 99% with the wrong 1% missing — " +
      "checkout, errors, consent — is a worse product than one at 95% with the gaps in a helping page.",
      "Missing keys fall back to the base language at runtime, which is why partial coverage looks shipable until a user hits the gap.",
    ],
    basis: `coverage = translated ÷ base keys × 100, compared with the threshold you declare. It counts what exists in the catalogue; it cannot see whether a translated string is correct, or whether it is the string that was there yesterday.`,
  };
}

/** Published planning ranges for text expansion when translating from English. A range is a
    planning factor, not a measurement — the tool says so where it uses one. */
const EXPANSION: Record<string, [number, number]> = {
  "German (de)": [1.2, 1.35], "French (fr)": [1.15, 1.25], "Spanish (es)": [1.15, 1.25],
  "Russian (ru)": [1.15, 1.3], "Portuguese (pt)": [1.15, 1.25], "Italian (it)": [1.1, 1.2],
  "Hindi (hi)": [1.0, 1.2], "Tamil (ta)": [1.0, 1.25], "Japanese (ja)": [0.8, 0.95],
  "Chinese, simplified (zh-Hans)": [0.75, 0.9], "Korean (ko)": [0.8, 0.95], "Arabic (ar)": [0.9, 1.15],
};

export function stringExpansion(v: Values): ToolResult {
  const source = str(v, "source");
  const locale = str(v, "locale", "German (de)");
  const budget = number(v, "budget", 0);
  const range = EXPANSION[locale] ?? [1.15, 1.3];
  const len = source.length;
  const low = Math.ceil(len * range[0]), high = Math.ceil(len * range[1]);
  const over = budget > 0 && high > budget;
  const table: string[][] = [];
  if (budget > 0) {
    table.push(...EXPANSION[locale] ? [[locale, `${low}–${high} chars`, String(budget), over ? "may overflow" : "fits at the top of the range"]] : []);
  }
  return {
    headline: over
      ? `“${source.slice(0, 42)}${source.length > 42 ? "…" : ""}” grows to ${low}–${high} characters — past the ${budget}-character budget`
      : `${len} characters becomes roughly ${low}–${high} in ${locale}`,
    ok: !over,
    kpis: [
      { value: String(len), label: "source chars" },
      { value: `${low}–${high}`, label: "translated chars" },
      { value: budget > 0 ? String(budget) : "—", label: "budget" },
      { value: `${n2(range[0], 2)}–${n2(range[1], 2)}×`, label: "factor used" },
    ],
    table: table.length ? { head: ["Locale", "Expected length", "Budget", "Verdict"], rows: table } : undefined,
    lines: [
      `The factor for ${locale} is a published planning range (${n2(range[0], 2)}–${n2(range[1], 2)}×), not a measurement of your string. ` +
      `Short strings expand more than long ones in percentage terms, which is exactly where buttons and tabs live.`,
      over
        ? "Design to the top of the range or the layout will break on real translations: fixed-width buttons are the usual casualty."
        : "The top of the range fits the declared budget.",
    ],
    basis: `expected length = source length × the published expansion range for the target locale; expansion ranges are industry planning factors (from localisation practice), not measurements of a specific string. Programming languages with wide glyphs and locales without case add their own constraints this does not model.`,
  };
}

/* ── supply ───────────────────────────────────────────────────────────────── */

export function eoq(v: Values): ToolResult {
  const demand = number(v, "demand", 24_000);
  const orderCost = number(v, "order", 450);
  const holding = number(v, "holding", 12);
  if (demand <= 0 || orderCost <= 0 || holding <= 0) {
    return { headline: "Demand, order cost and holding cost must all be positive", ok: false,
      basis: "The economic order quantity is a square root of a ratio; a zero anywhere makes it meaningless." };
  }
  const q = Math.sqrt((2 * demand * orderCost) / holding);
  const orders = demand / q;
  const cycle = 365 / orders;
  const ordering = orders * orderCost;
  const carrying = (q / 2) * holding;
  return {
    headline: `Order ${n2(q, 0)} units, ${n2(orders, 1)} times a year (every ${n2(cycle, 1)} days)`,
    ok: true,
    kpis: [
      { value: n2(q, 0), label: "order quantity" },
      { value: n2(orders, 1), label: "orders / year" },
      { value: `${n2(cycle, 1)}d`, label: "cycle" },
      { value: money(ordering + carrying, 0), label: "total annual cost" },
    ],
    table: {
      head: ["Component", "Formula", "Annual cost"],
      rows: [
        ["Ordering", `(${demand} ÷ ${n2(q, 0)}) × ${orderCost}`, money(ordering, 0)],
        ["Holding", `(${n2(q, 0)} ÷ 2) × ${holding}`, money(carrying, 0)],
        ["Total", "EOQ minimises the sum of the two", money(ordering + carrying, 0)],
      ],
    },
    lines: [
      "At the EOQ the ordering cost and the holding cost are equal — that is the property the formula is built to produce, " +
      "and it is a useful sanity check on any number you compute by hand.",
      "The model assumes demand is smooth and lead time is known. Real demand is neither, which is what the safety-stock tool is for.",
    ],
    basis: "Wilson's EOQ: Q* = √(2DS ÷ H), yearly cycles = D ÷ Q*, cycle days = 365 ÷ cycles. Classic inventory theory: it assumes constant demand, instantaneous replenishment and no quantity discounts. A supplier's price break usually beats the formula, deliberately.",
  };
}

/** Z for the common service levels — the standard normal quantile at each. */
const SERVICE_Z: Record<string, number> = { "90%": 1.2816, "95%": 1.6449, "97.5%": 1.96, "99%": 2.3263, "99.9%": 3.0902 };

export function safetyStock(v: Values): ToolResult {
  const mean = number(v, "mean", 180);
  const sd = number(v, "sd", 42);
  const lead = number(v, "lead", 9);
  const service = str(v, "service", "95%");
  const z = SERVICE_Z[service] ?? 1.6449;
  if (mean <= 0 || sd < 0 || lead <= 0) {
    return { headline: "Daily demand, its spread and the lead time must make sense", ok: false,
      basis: "Safety stock is a quantile of demand over the lead time; it needs a mean, a spread and a duration." };
  }
  const ss = z * sd * Math.sqrt(lead);
  const rop = mean * lead + ss;
  return {
    headline: `Hold ${n2(ss, 0)} units of safety stock — reorder at ${n2(rop, 0)}`,
    ok: true,
    kpis: [
      { value: n2(ss, 0), label: "safety stock" },
      { value: n2(rop, 0), label: "reorder point" },
      { value: n2(mean * lead, 0), label: "lead-time demand" },
      { value: n2(z, 4), label: `z at ${service}` },
    ],
    table: {
      head: ["Service level", "z", "Safety stock"],
      rows: Object.entries(SERVICE_Z).map(([lvl, zz]) => [lvl, n2(zz, 4), n2(zz * sd * Math.sqrt(lead), 0)]),
    },
    lines: [
      `Safety stock is the extra above average demand over the lead time; here that average is ${n2(mean * lead, 0)} units, ` +
      `so the reorder point is the sum of the two.`,
      `Raising the service level from 95% to 99% costs ${n2(((2.3263 * sd * Math.sqrt(lead)) / (z * sd * Math.sqrt(lead)) - 1) * 100, 0)}% more stock ` +
      `for the last ${n2(99 - 95, 0)} points — the tail is where the money is, and it is usually worth asking whether it is worth it.`,
    ],
    basis: `SS = z × σ_daily × √leadtime, ROP = mean demand × lead time + SS. It assumes demand is normally distributed and independent day to day — a normal approximation — and covers demand variability only. Supplier lead-time variability usually matters more and is a separate term.`,
  };
}

/* ── web3 ─────────────────────────────────────────────────────────────────── */

export function gasPlan(v: Values): ToolResult {
  const units = number(v, "units", 145_000);
  const base = number(v, "base", 18);
  const priority = number(v, "priority", 1.5);
  const eth = number(v, "eth", 3200);
  const ops = number(v, "ops", 250);
  const perOpGwei = units * (base + priority);
  const perOpEth = perOpGwei * 1e-9;
  const perOpUsd = perOpEth * eth;
  const totalUsd = perOpUsd * ops;
  return {
    headline: `${money(perOpUsd, 2)} per operation — ${money(totalUsd, 2)} for ${ops.toLocaleString()}`,
    ok: totalUsd < 1000,
    kpis: [
      { value: `${money(perOpGwei / 1e9, 6)} ETH`, label: "gas per op" },
      { value: `${((base + priority) / base).toFixed(2)}×`, label: "priority uplift" },
      { value: money(perOpUsd, 2), label: "per operation" },
      { value: money(totalUsd, 2), label: "for the batch" },
    ],
    table: {
      head: ["Component", "Gwei", "Share"],
      rows: [
        ["Base fee", n2(base * units / 1e9, 6), `${n2((base / (base + priority)) * 100, 1)}%`],
        ["Priority fee", n2(priority * units / 1e9, 6), `${n2((priority / (base + priority)) * 100, 1)}%`],
        ["Total per operation", n2(perOpGwei / 1e9, 6), "100%"],
      ],
    },
    lines: [
      `The priority fee is ${n2((priority / (base + priority)) * 100, 1)}% of what you pay. On a congested chain that share rises ` +
      `sharply while the base fee also moves — which is why a budget built on today's base fee does not survive a busy week.`,
      `Base fees change per block; this is a point-in-time estimate from the two figures you entered, not a quoted fee.`,
    ],
    basis: `cost = gas units × (base fee + priority fee) in gwei × 1e-9 ETH per gwei × price per ETH. EIP-1559 arithmetic: the base fee is burned and the priority fee is paid to the validator, so the split is a real distinction, not a presentation choice.`,
  };
}

export function tokenDecimals(v: Values): ToolResult {
  const raw = str(v, "raw", "1234567890123456789");
  const decimals = number(v, "decimals", 18);
  const amount = number(v, "amount", 1.5);
  if (!/^\d+$/.test(raw.trim())) {
    return { headline: "The raw amount must be an integer in base units — digits only", ok: false,
      basis: "Tokens are integers on the wire; the decimal point exists only in the interface. A non-integer input is refused rather than rounded." };
  }
  if (decimals < 0 || decimals > 36 || !Number.isInteger(decimals)) {
    return { headline: "Decimals must be a whole number between 0 and 36", ok: false,
      basis: "The base-unit convention needs a whole number of decimal places." };
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
      { value: human.length > 24 ? human.slice(0, 23) + "…" : human, label: "human amount" },
      { value: `${forOneAndAHalf}`, label: `${amount} in base units` },
    ],
    lines: [
      `Round trip: ${human} → ${back} base units (leading zeros trimmed, which is the same integer).`,
      `${amount} tokens at ${decimals} decimals is ${forOneAndAHalf} base units — the multiplication that turns a display amount ` +
      `into something a contract will accept, and the one most often written with a floating-point mistake.`,
    ],
    basis: "Base-unit arithmetic on integer strings: the human amount is the raw integer with a decimal point inserted `decimals` from the right, trailing zeros trimmed. No floating point touches the conversion — token math done in floats is where precision quietly disappears.",
  };
}

export const COMMERCE_TOOLS: readonly Tool[] = Object.freeze([
  {
    id: "meta-lint", domain: "marketing", label: "Title & meta",
    blurb: "What a search result truncates, and which slug segments earn their width.",
    fields: [
      text("title", "Page title", "Deterministic specialist tools for engineering teams"),
      text("desc", "Meta description", "Forty deterministic tools across nine domains — contrast, semver, retries, error budgets and more. Every answer prints the rule it came from."),
      text("slug", "URL slug", "the-deterministic-specialist-tools-for-engineering-teams"),
    ],
    run: metaLint,
  },
  {
    id: "crawl-budget", domain: "marketing", label: "Crawl budget",
    blurb: "How long a crawl takes, and which limit is actually binding.",
    fields: [
      num("pages", "Pages to crawl", "250000"),
      num("latency", "Average response (ms)", "320"),
      num("rate", "Allowed rate (req/s)", "5"),
      num("window", "Concurrency window (seconds)", "10"),
    ],
    run: crawlBudget,
  },
  {
    id: "locale-coverage", domain: "locale", label: "Translation coverage",
    blurb: "Which locales clear the shipping bar, and which are one gap from a broken screen.",
    fields: [
      num("base", "Base-language keys", "4200"),
      num("threshold", "Shipping bar (%)", "98"),
      area("locales", "Rows of `locale, translated, missing`",
        "de-DE, 4130, 70\nfr-FR, 4095, 105\nta-IN, 3610, 590\nja-JP, 4200, 0"),
    ],
    run: localeCoverage,
  },
  {
    id: "string-expansion", domain: "locale", label: "String expansion",
    blurb: "How much longer a translated string gets, before it breaks the layout.",
    fields: [
      text("source", "Source string (English)", "Save and continue"),
      sel("locale", "Target locale", Object.keys(EXPANSION), "German (de)"),
      num("budget", "Available width (characters)", "18", "0 to skip the budget check"),
    ],
    run: stringExpansion,
  },
  {
    id: "eoq", domain: "supply", label: "Order quantity",
    blurb: "The order size that minimises ordering plus holding cost together.",
    fields: [
      num("demand", "Annual demand (units)", "24000"),
      num("order", "Cost per order", "450"),
      num("holding", "Holding cost per unit / year", "12"),
    ],
    run: eoq,
  },
  {
    id: "safety-stock", domain: "supply", label: "Safety stock",
    blurb: "The buffer a service level actually costs, and where the reorder point lands.",
    fields: [
      num("mean", "Mean daily demand (units)", "180"),
      num("sd", "Standard deviation of daily demand", "42"),
      num("lead", "Lead time (days)", "9"),
      sel("service", "Service level", Object.keys(SERVICE_Z), "95%"),
    ],
    run: safetyStock,
  },
  {
    id: "gas-plan", domain: "web3", label: "Gas plan",
    blurb: "Per-operation and batch cost from gas units, the fee market and the price.",
    fields: [
      num("units", "Gas units per operation", "145000"),
      num("base", "Base fee (gwei)", "18"),
      num("priority", "Priority fee (gwei)", "1.5"),
      num("eth", "Price per ETH", "3200"),
      num("ops", "Operations in the batch", "250"),
    ],
    run: gasPlan,
  },
  {
    id: "token-decimals", domain: "web3", label: "Token decimals",
    blurb: "Base units to a human amount and back, in integer arithmetic only.",
    fields: [
      text("raw", "Raw amount in base units", "1234567890123456789"),
      num("decimals", "Decimals", "18"),
      num("amount", "Display amount to convert", "1.5"),
    ],
    run: tokenDecimals,
  },
]);
