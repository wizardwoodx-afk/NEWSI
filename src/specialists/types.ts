/**
 * The specialist tool contract.
 *
 * Munshi proved one thing and generalised another. What it proved: a domain specialist is
 * only worth shipping when a DETERMINISTIC engine sits behind it — arithmetic a model cannot
 * get wrong because a model is not doing it. What it generalised: nothing about that is
 * specific to one regulated domain.
 *
 * So this is the contract every domain in the pack implements. A tool declares its fields
 * (as data, so the surface renders itself and a probe can drive every tool without a
 * hand-written form), its engine function, and what it prints. The surface never contains
 * domain logic, and adding a domain never means touching the shell.
 *
 * The rule from the finance pack carries over unchanged and applies to all of them:
 *   · no language model computes a number here,
 *   · every result carries the rule, formula or threshold it came from,
 *   · and where a result is a judgement rather than a fact, the tool says which.
 */

export type Domain =
  | "frontend"
  | "dev"
  | "api"
  | "data"
  | "security"
  | "ops"
  | "docs"
  | "growth"
  | "mobile"
  | "cloud"
  | "db"
  | "embedded"
  | "ml"
  | "research"
  | "media"
  | "finops"
  | "legal"
  | "privacy"
  | "people"
  | "revenue"
  | "marketing"
  | "locale"
  | "supply"
  | "web3"
  | "health";

export type FieldKind = "text" | "number" | "select" | "toggle" | "textarea";

export interface ToolField {
  key: string;
  label: string;
  kind: FieldKind;
  /** for kind "select" */
  options?: string[];
  placeholder?: string;
  hint?: string;
  /** the value the tool renders with before anyone touches it — and what a probe drives it with */
  def: string | boolean;
}

export interface Kpi { value: string; label: string }
export interface TableSpec { head: string[]; rows: string[][] }

export interface ToolResult {
  /** one line a person reads first */
  headline: string;
  /** false draws the result as a warning rather than a clean pass */
  ok: boolean;
  kpis?: Kpi[];
  /** paragraphs, in order — each one is a statement the engine stands behind */
  lines?: string[];
  table?: TableSpec;
  /** the rule, formula, threshold or standard the answer came from — never omitted */
  basis: string;
  /** optional monospace block (a schedule, a redacted sample, a decoded header) */
  code?: string;
}

export type Values = Record<string, string | boolean>;

export interface Tool {
  id: string;
  domain: Domain;
  label: string;
  blurb: string;
  fields: ToolField[];
  run: (v: Values) => ToolResult;
}

/* ── field builders, so a spec reads as a form ────────────────────────────── */

export const text = (key: string, label: string, def = "", hint?: string): ToolField =>
  ({ key, label, kind: "text", def, ...(hint ? { hint } : {}) });

export const num = (key: string, label: string, def: string, hint?: string): ToolField =>
  ({ key, label, kind: "number", def, ...(hint ? { hint } : {}) });

export const area = (key: string, label: string, def = "", hint?: string): ToolField =>
  ({ key, label, kind: "textarea", def, ...(hint ? { hint } : {}) });

export const sel = (key: string, label: string, options: string[], def?: string, hint?: string): ToolField =>
  ({ key, label, kind: "select", options, def: def ?? options[0] ?? "", ...(hint ? { hint } : {}) });

export const flag = (key: string, label: string, def: boolean, hint?: string): ToolField =>
  ({ key, label, kind: "toggle", def, ...(hint ? { hint } : {}) });

/* ── value readers, so a tool never hand-parses its own form ──────────────── */

export const str = (v: Values, key: string, fallback = ""): string => {
  const x = v[key];
  return typeof x === "string" ? x : typeof x === "boolean" ? String(x) : fallback;
};

export const bool = (v: Values, key: string, fallback = false): boolean => {
  const x = v[key];
  return typeof x === "boolean" ? x : typeof x === "string" ? x === "true" : fallback;
};

/** Numbers accept the separators people actually type: 1,00,000 · 1_000 · ₹450 · 12.5 % */
export const number = (v: Values, key: string, fallback = 0): number => {
  const raw = str(v, key).replace(/[,\s_₹%]/g, "");
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
};

/** A whole number of lines from a textarea, blanks and #-comments dropped. */
export const rows = (v: Values, key: string): string[] =>
  str(v, key).split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0 && !l.startsWith("#"));

/** Numbers from a textarea: one per line, or comma/space separated on a line. */
export const series = (v: Values, key: string): number[] =>
  rows(v, key).flatMap((l) => l.split(/[,\s;]+/)).map((c) => Number(c)).filter((x) => Number.isFinite(x));

export const inr = (n: number, dp = 2): string =>
  `₹${n.toLocaleString("en-IN", { minimumFractionDigits: dp, maximumFractionDigits: dp })}`;

export const pct = (n: number, dp = 1): string => `${n.toFixed(dp)}%`;
