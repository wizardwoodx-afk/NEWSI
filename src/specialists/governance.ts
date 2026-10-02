/**
 * GOVERNANCE — the domains where the deliverable is a decision somebody is accountable for.
 *
 *   legal    · vague-terminology density and date arithmetic a contract turns on
 *   privacy  · pattern-class inventory and retention clocks
 *   people   · headcount modelling and band position
 *   revenue  · pipeline coverage and the SLA clock
 *
 * The legal and privacy tools are deliberately mechanical and say so: they count patterns,
 * compute dates and mask what they find. None of them gives legal advice, and every one of
 * them prints the boundary in its basis line rather than leaving it for the reader to assume.
 */
import { area, bool, flag, num, number, rows, str, text, type Tool, type ToolResult, type Values } from "./types";

const n2 = (x: number, dp = 2) => x.toFixed(dp);
const day = 86_400_000;
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const parseDate = (s: string): number | null => {
  const m = s.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isFinite(t) ? t : null;
};

/* ── legal ────────────────────────────────────────────────────────────────── */

const VAGUE_DEFAULT = "reasonable efforts\nmaterial\npromptly\nas appropriate\nsole discretion\nfrom time to time\nsubstantially\nbest efforts";

export function clauseLint(v: Values): ToolResult {
  const body = str(v, "text");
  const terms = rows(v, "terms").map((t) => t.toLowerCase()).filter(Boolean);
  const words = body.split(/\s+/).filter(Boolean).length;
  if (words === 0) {
    return { headline: "Nothing to read — paste the clause or the section", ok: false,
      basis: "A density needs text; the tool counts terms, it does not interpret clauses." };
  }
  const found = terms.map((t) => {
    const hits = (body.toLowerCase().match(new RegExp(`\\b${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "g")) ?? []).length;
    return { term: t, hits };
  }).filter((f) => f.hits > 0).sort((a, b) => b.hits - a.hits);
  const total = found.reduce((s, f) => s + f.hits, 0);
  const perK = (total / words) * 1000;
  return {
    headline: total === 0
      ? "No vague terms from this list appear — the drafting is specific about obligations"
      : `${total} undefined term${total === 1 ? "" : "s"} across ${words.toLocaleString()} words (${n2(perK, 1)} per 1,000)`,
    ok: total === 0,
    kpis: [
      { value: String(total), label: "vague terms" },
      { value: n2(perK, 1), label: "per 1,000 words" },
      { value: String(found.length), label: "distinct terms" },
      { value: String(words), label: "words" },
    ],
    table: found.length ? { head: ["Term", "Occurrences"], rows: found.map((f) => [f.term, String(f.hits)]) } : undefined,
    lines: [
      "Each hit is a word that will be argued about later unless the contract defines it. The tool does not know which of them matter — it points at all of them so the lawyer decides.",
      total > 0 ? `Highest count: “${found[0]!.term}” at ${found[0]!.hits}.` : "Nothing to rank.",
    ],
    basis: "Mechanical word-boundary counts against a term list (yours, or the usual suspects). It neither parses clauses nor gives legal advice; a defined term appearing five times is fine, and an undefined one appearing once may be fatal.",
  };
}

export function dateTerms(v: Values): ToolResult {
  const start = parseDate(str(v, "start", "2026-04-01"));
  const months = number(v, "months", 12);
  const notice = number(v, "notice", 90);
  const renew = bool(v, "renew", true);
  if (start === null) {
    return { headline: "The effective date must be written as YYYY-MM-DD", ok: false,
      basis: "Date arithmetic here is calendar arithmetic on an unambiguous date; a locale-ambiguous date is refused rather than guessed." };
  }
  /* Month arithmetic in UTC. Adding months can overflow the month (31 Jan + 1 month), so the
     day is clamped to the last valid day of the target month — the convention most contracts
     intend, and the one worth stating out loud because the other convention exists. */
  const addMonths = (ms: number, m: number): number => {
    const d = new Date(ms);
    const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + m, 1));
    const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
    return Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), Math.min(d.getUTCDate(), lastDay));
  };
  const expiry = addMonths(start, months);
  const lastNotice = expiry - notice * day;
  const today = Date.UTC(2026, 8, 22);      // the app's own reference date discipline: pins readable in a probe
  const daysToNotice = Math.round((lastNotice - today) / day);
  return {
    headline: daysToNotice < 0
      ? `The notice window closed ${Math.abs(daysToNotice)} days ago on the dates as typed`
      : `${daysToNotice} days remain to serve notice — last day ${iso(lastNotice)}`,
    ok: daysToNotice >= 0,
    kpis: [
      { value: iso(start), label: "effective" },
      { value: iso(expiry), label: `expiry (+${months}m)` },
      { value: iso(lastNotice), label: `notice (${notice}d)` },
      { value: String(daysToNotice), label: "days to decide" },
    ],
    table: {
      head: ["Milestone", "Date", "From"],
      rows: [
        ["Effective", iso(start), "as declared"],
        ["Expiry", iso(expiry), `+${months} months, day-clamped`],
        ["Last day to notice", iso(lastNotice), `expiry − ${notice} days`],
        ["Renewal decision", iso(lastNotice), renew ? "auto-renew unless notice served" : "no auto-renew clause assumed"],
      ],
    },
    lines: [
      `Adding ${months} months clamps an end-of-month day to the target month's last day (31 Jan + 1 month = 28/29 Feb). ` +
      `That is the common intent and it is not the only convention — the other one carries into the next month.`,
      `Calendar days are used throughout. A contract counting BUSINESS days needs a holiday calendar, which this tool does not have and will not invent.`,
    ],
    basis: "Calendar arithmetic in UTC: expiry = effective + term (day-clamped), last notice day = expiry − notice period. Whether the boundary day counts inclusive or exclusive is a drafting question this tool surfaces rather than decides.",
  };
}

/* ── privacy ──────────────────────────────────────────────────────────────── */

const PII: Array<{ name: string; re: RegExp; note: string }> = [
  { name: "email address", re: /[\w.+-]+@[\w-]+\.[\w.-]{2,}/g, note: "pattern" },
  { name: "phone (international)", re: /\+\d[\d\s\-()]{7,}\d/g, note: "pattern" },
  { name: "national tax id (5 letters, 4 digits, 1 letter)", re: /\b[A-Z]{5}\d{4}[A-Z]\b/g, note: "pattern + 4th-character holder type" },
  { name: "national-id-shaped 12 digits", re: /\b\d{4}\s?\d{4}\s?\d{4}\b/g, note: "shape only — not checksum-verified" },
  { name: "card-shaped number", re: /\b(?:\d[ -]?){13,19}\b/g, note: "shape + Luhn checked below" },
  { name: "IPv4 address", re: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g, note: "pattern" },
  { name: "date of birth (ISO)", re: /\b(?:19|20)\d{2}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])\b/g, note: "pattern — a date is PII only in context" },
];

function luhn(digits: string): boolean {
  const d = digits.replace(/\D/g, "");
  if (d.length < 13 || d.length > 19) return false;
  let sum = 0, alt = false;
  for (let i = d.length - 1; i >= 0; i -= 1) {
    let x = Number(d[i]);
    if (alt) { x *= 2; if (x > 9) x -= 9; }
    sum += x;
    alt = !alt;
  }
  return sum % 10 === 0;
}

const mask = (s: string): string => (s.length <= 4 ? "•".repeat(s.length) : `${s.slice(0, 2)}${"•".repeat(Math.min(10, s.length - 4))}${s.slice(-2)}`);

export function piiScan(v: Values): ToolResult {
  const body = str(v, "text");
  if (!body.trim()) {
    return { headline: "Nothing to scan — paste a sample or a document body", ok: false,
      basis: "The scan reports pattern classes present in text you supply. It never sends the text anywhere." };
  }
  const found = PII.map((p) => {
    const hits = body.match(p.re) ?? [];
    const verified = p.name === "card-shaped number" ? hits.filter(luhn) : hits;
    return { ...p, hits: verified };
  }).filter((f) => f.hits.length > 0);
  const total = found.reduce((s, f) => s + f.hits.length, 0);
  const table = found.map((f) => [f.name, String(f.hits.length), f.note, f.hits.slice(0, 2).map(mask).join(" · ")]);
  return {
    headline: total === 0
      ? "No personal-data patterns of these classes appear in the text"
      : `${total} personal-data pattern${total === 1 ? "" : "s"} across ${found.length} class${found.length === 1 ? "" : "es"}`,
    ok: total === 0,
    kpis: [
      { value: String(total), label: "matches" },
      { value: String(found.length), label: "classes" },
      { value: body.length.toLocaleString(), label: "characters read" },
    ],
    table: table.length ? { head: ["Class", "Count", "Basis", "Masked sample"], rows: table } : undefined,
    lines: [
      "Every sample in the table is masked: the first and last characters only, never the value.",
      total > 0
        ? "A match is a shape, not a finding. A 12-digit number may be an invoice; a date may be a delivery date. What the scan establishes is that the text needs a classification decision by a human before it is copied anywhere."
        : "Clean against these patterns — which is not the same as clean. Names, addresses and free-text identifiers have no regex, and this tool will not pretend to one.",
    ],
    basis: "Pattern classes with published shapes (email, E.164-ish phone, PAN's mask, ISO dates) plus a Luhn checksum for card-shaped digits. Card shapes are only counted when Luhn passes; Aadhaar shapes are counted on shape alone and labelled as such. Nothing is transmitted; the scan runs on this machine.",
  };
}

export function retentionClock(v: Values): ToolResult {
  const today = parseDate(str(v, "today", "2026-09-22"));
  const listed = rows(v, "items").map((line) => {
    const [category, created, days] = line.split(/[,=]/).map((x) => (x ?? "").trim());
    const c = parseDate(created ?? "");
    const d = Number(days);
    return c === null || !Number.isFinite(d) ? null : { category: category || "item", created: c, days: d };
  }).filter((x): x is { category: string; created: number; days: number } => x !== null);
  if (today === null || listed.length === 0) {
    return { headline: "Give the reference date (YYYY-MM-DD) and rows of `category, created, retention days`", ok: false,
      basis: "A retention clock is creation date plus retention period, measured against a stated reference date." };
  }
  const table = listed.map((it) => {
    const expiry = it.created + it.days * day;
    const left = Math.round((expiry - today) / day);
    return { it, expiry, left };
  }).sort((a, b) => a.left - b.left);
  const overdue = table.filter((t) => t.left < 0).length;
  const soon = table.filter((t) => t.left >= 0 && t.left <= 30).length;
  return {
    headline: overdue > 0
      ? `${overdue} categor${overdue === 1 ? "y is" : "ies are"} past their retention date`
      : `Nothing overdue — ${soon} categor${soon === 1 ? "y falls" : "ies fall"} due within 30 days`,
    ok: overdue === 0,
    kpis: [
      { value: String(table.length), label: "categories" },
      { value: String(overdue), label: "overdue" },
      { value: String(soon), label: "due ≤ 30 days" },
      { value: iso(today), label: "as at" },
    ],
    table: {
      head: ["Category", "Created", "Retention", "Expires", "Days"],
      rows: table.map((t) => [t.it.category, iso(t.it.created), `${t.it.days}d`, iso(t.expiry), (t.left < 0 ? "" : "+") + String(t.left)]),
    },
    lines: [
      "Retention is stated as a period from creation, which is the shape most policies are written in. A policy written from LAST ACTIVITY needs the activity date, not the creation date — the two clocks differ and the difference is usually the whole argument.",
      overdue > 0 ? "An overdue category is a deletion that policy says should already have happened; whether it can happen is a legal holdup question this tool does not answer." : "No category is past its date.",
    ],
    basis: "expiry = created + retention days; days remaining = expiry − reference date. Plain calendar arithmetic, no business-day adjustment, no legal-hold awareness.",
  };
}

/* ── people ───────────────────────────────────────────────────────────────── */

export function headcountModel(v: Values): ToolResult {
  const current = number(v, "current", 40);
  const hires = number(v, "hires", 3);
  const attrition = number(v, "attrition", 1.5);
  const months = Math.max(1, Math.min(36, number(v, "months", 12)));
  if (current <= 0) {
    return { headline: "Headcount must be greater than zero", ok: false, basis: "Recurrence modelling needs a starting population." };
  }
  const a = attrition / 100;
  let h = current;
  const rowsOut: string[][] = [];
  for (let m = 1; m <= months; m += 1) {
    const leavers = h * a;
    h = h - leavers + hires;
    if (m <= 6 || m === months) rowsOut.push([String(m), n2(leavers, 1), String(hires), n2(h, 1)]);
  }
  const net = h - current;
  return {
    headline: `${current} → ${n2(h, 1)} over ${months} months at ${hires} hires and ${attrition}% monthly attrition`,
    ok: net >= 0,
    kpis: [
      { value: `${net >= 0 ? "+" : ""}${n2(net, 1)}`, label: "net change" },
      { value: n2(h, 1), label: `month ${months}` },
      { value: String(hires * months), label: "hires made" },
      { value: n2(current * a * months, 1), label: "approximate leavers" },
    ],
    table: { head: ["Month", "Leavers", "Hires", "Headcount"], rows: rowsOut },
    lines: [
      `Attrition is charged monthly against the headcount that exists, not the one you planned — which is why a flat hiring plan ` +
      `still curves downward as the base grows.`,
      net < 0
        ? "This plan shrinks the team. If that is not the intent, the hire rate has to rise before attrition compounds, not after."
        : "The plan grows the team while replacing its own losses.",
    ],
    basis: "h(m+1) = h(m) × (1 − attrition%) + hires, monthly. Attrition is the rate you typed, applied uniformly — real attrition clusters in cohorts (new joiners, post-review periods), so treat the curve as a centre line.",
  };
}

export function compBand(v: Values): ToolResult {
  const min = number(v, "min", 1_800_000);
  const mid = number(v, "mid", 2_400_000);
  const max = number(v, "max", 3_200_000);
  const offer = number(v, "offer", 2_520_000);
  if (!(min < mid && mid < max)) {
    return { headline: "A band runs min < mid < max — check these three", ok: false,
      basis: "Position in band needs a well-formed band; a malformed one is refused rather than normalised." };
  }
  const inBand = offer >= min && offer <= max;
  const position = ((offer - min) / (max - min)) * 100;
  const compa = (offer / mid) * 100;
  return {
    headline: inBand
      ? `The offer sits at ${n2(position, 1)}% of the band — compa-ratio ${n2(compa, 1)}`
      : offer < min ? `The offer is below the band minimum by ${n2(min - offer, 0)}` : `The offer is above the band maximum by ${n2(offer - max, 0)}`,
    ok: inBand,
    kpis: [
      { value: `${n2(position, 1)}%`, label: "position in band" },
      { value: n2(compa, 1), label: "compa-ratio" },
      { value: inBand ? "within band" : "outside band", label: "fit" },
    ],
    table: {
      head: ["Point", "Value", "Offer vs point"],
      rows: [
        ["Minimum", min.toLocaleString("en-IN"), `${n2(((offer - min) / min) * 100, 1)}%`],
        ["Midpoint", mid.toLocaleString("en-IN"), `${n2(compa - 100, 1)}%`],
        ["Maximum", max.toLocaleString("en-IN"), `${n2(((offer - max) / max) * 100, 1)}%`],
      ],
    },
    lines: [
      "Position in band is cumulative and compa-ratio is relative to the midpoint; they answer different questions and a band review " +
      "asked for one is not answered by the other.",
      inBand ? "Within the band. Whether it is FAIR within the band is a policy question — the arithmetic cannot see the peers." : "Outside the band: that is an exception path, not a compa-ratio discussion.",
    ],
    basis: "compa-ratio = offer ÷ midpoint × 100; position = (offer − min) ÷ (max − min) × 100. Both are standard. Neither accounts for tenure, location differentials or equity — the tool reports position, not fairness, and it will not guess at either.",
  };
}

/* ── revenue ──────────────────────────────────────────────────────────────── */

export function pipelineCoverage(v: Values): ToolResult {
  const quota = number(v, "quota", 12_000_000);
  const target = number(v, "coverage", 3.5);
  const listed = rows(v, "pipeline").map((line) => {
    const [stage, value, win] = line.split(/[,=]/).map((x) => (x ?? "").trim());
    return { stage: stage || "stage", value: Number(String(value).replace(/[,\s₹]/g, "")), win: Number(win) };
  }).filter((s) => Number.isFinite(s.value) && Number.isFinite(s.win) && s.value > 0);
  if (listed.length === 0 || quota <= 0) {
    return { headline: "Give a quota and rows of `stage, value, win rate %`", ok: false,
      basis: "Coverage is weighted pipeline against the quota it has to cover." };
  }
  const weighted = listed.reduce((s, x) => s + (x.value * x.win) / 100, 0);
  const raw = listed.reduce((s, x) => s + x.value, 0);
  const coverage = weighted / quota;
  const gap = Math.max(0, quota - weighted);
  const needed = gap > 0 ? gap / (weighted / raw || 1) : 0;
  return {
    headline: coverage >= target
      ? `Weighted coverage ${n2(coverage, 2)}× against a ${target}× convention — ${n2(weighted, 0)} of ${n2(quota, 0)}`
      : `Weighted coverage ${n2(coverage, 2)}× is under the ${target}× convention — ${n2(gap, 0)} short`,
    ok: coverage >= target,
    kpis: [
      { value: n2(weighted, 0), label: "weighted pipeline" },
      { value: `${n2(coverage, 2)}×`, label: "coverage" },
      { value: gap > 0 ? n2(gap, 0) : "met", label: "weighted gap" },
      { value: n2(raw, 0), label: "raw pipeline" },
    ],
    table: {
      head: ["Stage", "Value", "Win rate", "Weighted"],
      rows: listed.map((x) => [x.stage, n2(x.value, 0), `${x.win}%`, n2((x.value * x.win) / 100, 0)]),
    },
    lines: [
      `Raw pipeline is ${n2(raw / quota, 2)}× the quota; the win rates take it to ${n2(coverage, 2)}×. The gap between those two numbers ` +
      `is the entire reason coverage is weighted.`,
      gap > 0
        ? `To close it with this stage mix you need roughly ${n2(needed, 0)} of additional raw pipeline — or a higher win rate on what exists, which is not arithmetic.`
        : "Coverage meets the convention. Whether the win rates themselves are honest is a separate question, and the one worth asking next.",
    ],
    basis: "weighted = Σ value × win rate; coverage = weighted ÷ quota. The 3–4× convention quoted on the surface is a habit, not a law — the number that matters is whether the win rates came from closed history or from optimism.",
  };
}

export function slaClock(v: Values): ToolResult {
  const targets: Record<string, number> = { P1: 1, P2: 4, P3: 24, P4: 72 };
  const listed = rows(v, "tickets").map((line) => {
    const [id, priority, opened, responded] = line.split(/[,=]/).map((x) => (x ?? "").trim());
    const t0 = opened ? Date.parse(opened) : NaN;
    const t1 = responded ? Date.parse(responded) : NaN;
    return { id: id || "ticket", priority: priority || "P3", t0, t1 };
  }).filter((t) => Number.isFinite(t.t0));
  if (listed.length === 0) {
    return { headline: "Give rows of `id, priority, opened, first response` (ISO timestamps)", ok: false,
      basis: "The clock needs an opening time and a first-response time per ticket." };
  }
  const table = listed.map((t) => {
    const hours = Number.isFinite(t.t1) ? (t.t1 - t.t0) / 3_600_000 : null;
    const limit = targets[t.priority] ?? 24;
    const breach = hours === null ? true : hours > limit;
    return [t.id, t.priority, hours === null ? "no response" : `${n2(hours, 2)}h`, `${limit}h`, breach ? (hours === null ? "open, past target" : "breached") : "met"];
  });
  const breaches = table.filter((r) => r[4] !== "met").length;
  return {
    headline: breaches === 0
      ? `All ${table.length} tickets responded inside their target`
      : `${breaches} of ${table.length} tickets missed their first-response target`,
    ok: breaches === 0,
    kpis: [
      { value: String(table.length), label: "tickets" },
      { value: String(breaches), label: "breached" },
      { value: `${n2(((table.length - breaches) / table.length) * 100, 1)}%`, label: "attainment" },
    ],
    table: { head: ["Ticket", "Priority", "First response", "Target", "Verdict"], rows: table },
    lines: [
      "Targets applied: P1 1h, P2 4h, P3 24h, P4 72h — the common shape, and yours may differ; change the priorities and the verdicts follow.",
      "Wall-clock hours. A contract measuring business hours needs a calendar and a holiday list, neither of which this tool invents.",
    ],
    basis: "first response = responded − opened, compared with the target for the priority. Timestamps are read as ISO; a ticket with no response is treated as still inside (or past) the clock, never as met.",
  };
}

export const GOVERNANCE_TOOLS: readonly Tool[] = Object.freeze([
  {
    id: "clause-lint", domain: "legal", label: "Clause terms",
    blurb: "Density of undefined terms a contract will be argued over later.",
    fields: [
      area("text", "Clause or section", "The Supplier shall use reasonable efforts to deliver promptly, and may in its sole discretion vary the scope from time to time. Material changes require approval."),
      area("terms", "Terms to count — one per line", VAGUE_DEFAULT),
    ],
    run: clauseLint,
  },
  {
    id: "date-terms", domain: "legal", label: "Contract dates",
    blurb: "Expiry and the last day to serve notice, from the term and notice period.",
    fields: [
      text("start", "Effective date (YYYY-MM-DD)", "2026-04-01"),
      num("months", "Term (months)", "12"),
      num("notice", "Notice period (days)", "90"),
      flag("renew", "Auto-renew unless notice is served", true),
    ],
    run: dateTerms,
  },
  {
    id: "pii-scan", domain: "privacy", label: "Personal-data scan",
    blurb: "Pattern classes present in a text, every sample masked, nothing transmitted.",
    fields: [
      area("text", "Text to scan", "Contact: priya.raman@example.in, +91 98400 12345.\nCard 4111 1111 1111 1111 was refunded.\nPAN AAFPU0939F on file. Order ref 2026-05-14."),
    ],
    run: piiScan,
  },
  {
    id: "retention-clock", domain: "privacy", label: "Retention clock",
    blurb: "What has passed its retention date, and what falls due in the next 30 days.",
    fields: [
      text("today", "Reference date (YYYY-MM-DD)", "2026-09-22"),
      area("items", "Rows of `category, created, retention days`",
        "support tickets, 2024-03-11, 730\nmarketing leads, 2023-01-04, 365\ninvoices, 2021-06-30, 2920\naccess logs, 2026-08-01, 90"),
    ],
    run: retentionClock,
  },
  {
    id: "headcount-model", domain: "people", label: "Headcount model",
    blurb: "What a hiring plan actually does once attrition compounds against it.",
    fields: [
      num("current", "Headcount today", "40"),
      num("hires", "Hires per month", "3"),
      num("attrition", "Monthly attrition (%)", "1.5"),
      num("months", "Months to project", "12"),
    ],
    run: headcountModel,
  },
  {
    id: "comp-band", domain: "people", label: "Band position",
    blurb: "Where an offer sits in a band, as position and as compa-ratio.",
    fields: [
      num("min", "Band minimum", "1800000"),
      num("mid", "Band midpoint", "2400000"),
      num("max", "Band maximum", "3200000"),
      num("offer", "Offer", "2520000"),
    ],
    run: compBand,
  },
  {
    id: "pipeline-coverage", domain: "revenue", label: "Pipeline coverage",
    blurb: "Stage-weighted pipeline against the quota it has to cover.",
    fields: [
      num("quota", "Quota", "12000000"),
      num("coverage", "Coverage convention (×)", "3.5"),
      area("pipeline", "Rows of `stage, value, win rate %`",
        "discovery, 14000000, 15\nproposal, 9000000, 40\nnegotiation, 4200000, 65\nverbal, 1600000, 85"),
    ],
    run: pipelineCoverage,
  },
  {
    id: "sla-clock", domain: "revenue", label: "SLA clock",
    blurb: "First response against priority targets, ticket by ticket.",
    fields: [
      area("tickets", "Rows of `id, priority, opened, first response` (ISO)",
        "T-1041, P1, 2026-09-20T09:12:00Z, 2026-09-20T09:48:00Z\nT-1042, P2, 2026-09-20T11:00:00Z, 2026-09-20T16:30:00Z\nT-1043, P3, 2026-09-19T08:00:00Z, 2026-09-19T20:15:00Z\nT-1044, P2, 2026-09-21T07:30:00Z, "),
    ],
    run: slaClock,
  },
]);
