/**
 * Developer engines — the release and protocol arithmetic that teams otherwise do by eye.
 *
 * Every one of these is a rule that already exists, written down somewhere, and applied
 * wrongly under time pressure: a caret range nobody can expand from memory, a commit that
 * breaks the changelog generator, a retry ladder that takes eleven hours to fail, a cron
 * expression that runs at the wrong hour because of day-of-week numbering.
 */
import { num, text, area, number, str, sel, type Tool, type ToolResult } from "./types";

/* ── semantic versions ─────────────────────────────────────────────────────── */

export interface Semver { major: number; minor: number; patch: number; pre: string[]; raw: string }

export function parseSemver(input: string): Semver | null {
  const m = input.trim().match(/^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/);
  if (!m) return null;
  return { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]),
           pre: m[4] ? m[4].split(".") : [], raw: input.trim() };
}

/** -1 | 0 | 1 under SemVer precedence: a pre-release sorts BELOW its release. */
export function compareSemver(a: Semver, b: Semver): -1 | 0 | 1 {
  for (const k of ["major", "minor", "patch"] as const) {
    if (a[k] !== b[k]) return a[k] < b[k] ? -1 : 1;
  }
  if (a.pre.length === 0 && b.pre.length === 0) return 0;
  if (a.pre.length === 0) return 1;
  if (b.pre.length === 0) return -1;
  for (let i = 0; i < Math.max(a.pre.length, b.pre.length); i++) {
    const x = a.pre[i], y = b.pre[i];
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    const nx = /^\d+$/.test(x), ny = /^\d+$/.test(y);
    if (nx && ny) { if (Number(x) !== Number(y)) return Number(x) < Number(y) ? -1 : 1; continue; }
    if (nx !== ny) return nx ? -1 : 1;
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}

/**
 * Range satisfaction for the shapes that actually appear: exact, ^, ~, comparators,
 * hyphen ranges, x-ranges and unions. Deliberately not a full node-semver clone — it
 * expands the range into explicit bounds so the answer can be shown to a human.
 */
export function satisfiesRange(version: Semver, range: string): { ok: boolean; expanded: string[] } {
  const sets = range.split("||").map((r) => r.trim());
  const expanded: string[] = [];
  for (const set of sets) {
    const parts = set.split(/\s+/).filter(Boolean);
    let ok = true;
    for (const part of parts) {
      const bounds = boundFor(part.trim());
      expanded.push(`${part} → ${bounds}`);
      ok = ok && within(version, part.trim());
    }
    if (ok) return { ok: true, expanded };
  }
  return { ok: false, expanded };
}

function boundFor(range: string): string {
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

function within(v: Semver, range: string): boolean {
  const cmp = (a: Semver, b: Semver): number => compareSemver(a, b);
  if (range === "*" || range === "" || range.toLowerCase() === "latest") return true;
  let m: RegExpMatchArray | null;
  if ((m = range.match(/^([\^~]?)(\d+)\.(\d+)\.(\d+)$/))) {
    const b = parseSemver(`${m[2]}.${m[3]}.${m[4]}`)!;
    if (m[1] === "^") {
      if (v.major !== b.major) return false;
      return b.major > 0 ? true : v.minor === b.minor && cmp(v, b) >= 0;
    }
    if (m[1] === "~") return v.major === b.major && v.minor === b.minor && cmp(v, b) >= 0;
    return cmp(v, b) === 0;
  }
  if ((m = range.match(/^(>=|<=|>|<)\s*v?(\d+)\.(\d+)\.(\d+)$/))) {
    const b = parseSemver(`${m[2]}.${m[3]}.${m[4]}`)!;
    const c = cmp(v, b);
    return m[1] === ">=" ? c >= 0 : m[1] === "<=" ? c <= 0 : m[1] === ">" ? c > 0 : c < 0;
  }
  if ((m = range.match(/^(\d+)\.(\d+)\.[xX*]$/)) || (m = range.match(/^(\d+)\.[xX*]$/))) {
    return v.major === Number(m[1]) && (m.length === 2 || v.minor === Number(m[2]));
  }
  return false;
}

export function nextVersion(v: Semver, kind: "major" | "minor" | "patch" | "prerelease" | "release"): string {
  switch (kind) {
    case "major": return `${v.major + 1}.0.0`;
    case "minor": return `${v.major}.${v.minor + 1}.0`;
    case "patch": return `${v.major}.${v.minor}.${v.patch + 1}`;
    case "prerelease": {
      const last = v.pre[v.pre.length - 1];
      const n = last && /^\d+$/.test(last) ? Number(last) + 1 : 0;
      const head = last && /^\d+$/.test(last) ? v.pre.slice(0, -1) : v.pre;
      const pre = head.length ? head : ["rc"];
      return `${v.major}.${v.minor}.${v.patch}-${[...pre, n].join(".")}`;
    }
    case "release": return `${v.major}.${v.minor}.${v.patch}`;
  }
}

/* ── conventional commits ──────────────────────────────────────────────────── */

const COMMIT_TYPES = ["feat", "fix", "docs", "style", "refactor", "perf", "test", "build", "ci", "chore", "revert"];

export interface CommitLint {
  subject: string; type: string | null; scope: string | null; breaking: boolean;
  errors: string[]; warnings: string[];
}

export function lintCommit(message: string): CommitLint {
  const lines = message.split(/\r?\n/);
  const subject = (lines[0] ?? "").trim();
  const errors: string[] = [], warnings: string[] = [];
  const m = subject.match(/^([a-z]+)(?:\(([^)]+)\))?(!)?:\s(.+)$/);
  let type: string | null = null, scope: string | null = null, breaking = false;
  if (!m) {
    errors.push("subject does not match `type(scope): description` — no changelog or release tool can parse this");
  } else {
    type = m[1]!; scope = m[2] ?? null; breaking = Boolean(m[3]);
    if (!COMMIT_TYPES.includes(type)) errors.push(`type "${type}" is not a conventional type (${COMMIT_TYPES.join(", ")})`);
    const desc = m[4]!;
    if (desc.length > 72) errors.push(`description is ${desc.length} characters — 72 is the limit most tools truncate at`);
    if (desc.endsWith(".")) warnings.push("the description ends with a full stop; the convention leaves it off");
    if (/^[A-Z]/.test(desc)) warnings.push("the description starts with a capital; the convention is lower case");
    if (desc.split(/\s+/).length < 2) warnings.push("one-word descriptions make an unreadable changelog");
  }
  const body = lines.slice(1);
  if (body.length > 0 && (body[0] ?? "").trim() !== "") {
    errors.push("the second line must be blank — a body glued to the subject is the classic parse failure");
  }
  if (body.some((l) => /^BREAKING CHANGE:/.test(l))) breaking = true;
  if (breaking && !subject.match(/^[a-z]+(\([^)]+\))?!:/) && !body.some((l) => /^BREAKING CHANGE:/.test(l))) {
    warnings.push("marked breaking without the `!` or a BREAKING CHANGE footer");
  }
  return { subject, type, scope, breaking, errors, warnings };
}

/* ── HTTP semantics ────────────────────────────────────────────────────────── */

const HTTP: Readonly<Record<number, { name: string; retry: "yes" | "no" | "maybe"; note: string }>> = Object.freeze({
  200: { name: "OK", retry: "no", note: "success" },
  201: { name: "Created", retry: "no", note: "the Location header should carry the new resource" },
  202: { name: "Accepted", retry: "no", note: "work queued — poll the status resource, do not re-POST" },
  204: { name: "No Content", retry: "no", note: "success with an empty body; do not parse it as JSON" },
  301: { name: "Moved Permanently", retry: "no", note: "a client should cache the redirect; API clients should be updated" },
  304: { name: "Not Modified", retry: "no", note: "conditional GET succeeded without a body" },
  400: { name: "Bad Request", retry: "no", note: "the request is malformed — retrying sends the same malformed request" },
  401: { name: "Unauthorized", retry: "maybe", note: "refresh the credential ONCE, then stop" },
  403: { name: "Forbidden", retry: "no", note: "authenticated but not permitted — a retry cannot fix it" },
  404: { name: "Not Found", retry: "no", note: "in a retry loop this usually means a wrong identifier" },
  405: { name: "Method Not Allowed", retry: "no", note: "the Allow header names the permitted methods" },
  409: { name: "Conflict", retry: "maybe", note: "a concurrent write lost — re-read and decide, do not blind-retry" },
  410: { name: "Gone", retry: "no", note: "deliberately absent; stop asking" },
  412: { name: "Precondition Failed", retry: "no", note: "an If-Match/If-Unmodified-Since guard rejected the write" },
  422: { name: "Unprocessable Content", retry: "no", note: "well-formed but semantically rejected — the body explains why" },
  425: { name: "Too Early", retry: "yes", note: "the server refused a replay — safe to retry after a delay" },
  429: { name: "Too Many Requests", retry: "yes", note: "honour Retry-After; exponential backoff without it is guesswork" },
  500: { name: "Internal Server Error", retry: "yes", note: "the classic retryable failure" },
  502: { name: "Bad Gateway", retry: "yes", note: "upstream failed — retry with backoff and a cap" },
  503: { name: "Service Unavailable", retry: "yes", note: "honour Retry-After; this is what load shedding looks like" },
  504: { name: "Gateway Timeout", retry: "yes", note: "the work may have COMPLETED — only retry an idempotent operation" },
});

export function httpSemantics(code: number): { known: boolean; klass: string; retry: string; idempotentSafe: string; note: string } {
  const entry = HTTP[code];
  const klass = code >= 100 && code < 200 ? "informational" : code < 300 ? "success" : code < 400 ? "redirect"
    : code < 500 ? "client error" : code < 600 ? "server error" : "not a status code";
  if (!entry) {
    return { known: false, klass, retry: "unknown", idempotentSafe: "—",
             note: "not a code this engine carries — treat an unrecognised status as unclassified rather than guessing" };
  }
  const idempotentSafe = code < 500
    ? "a retry changes nothing only if the request was idempotent (GET/PUT/DELETE/HEAD)"
    : "retry is safe only for an idempotent request or with an idempotency key";
  return { known: true, klass, retry: entry.retry, idempotentSafe, note: entry.note };
}

/* ── retry ladders ─────────────────────────────────────────────────────────── */

/**
 * Deterministic by design: the jitter is a fixed permille step rather than randomness, so
 * two engineers computing the same ladder get the same schedule — and a probe can pin it.
 * Real jitter is added at runtime; this is the shape underneath it.
 */
export function backoffSchedule(attempts: number, baseMs: number, factor: number, capMs: number, jitterPermille = 0): {
  rows: Array<{ attempt: number; delayMs: number; cumulativeMs: number }>; totalMs: number; human: string;
} {
  const out: Array<{ attempt: number; delayMs: number; cumulativeMs: number }> = [];
  let cumulative = 0;
  for (let i = 1; i <= Math.max(1, Math.min(30, attempts)); i++) {
    const raw = Math.min(capMs, baseMs * Math.pow(factor, i - 1));
    const jittered = Math.round(raw * (1 + (jitterPermille * ((i % 3) - 1)) / 1000));
    const delayMs = Math.max(0, Math.min(capMs, jittered));
    cumulative += delayMs;
    out.push({ attempt: i, delayMs, cumulativeMs: cumulative });
  }
  const human = cumulative < 60_000 ? `${(cumulative / 1000).toFixed(1)}s` : `${(cumulative / 60_000).toFixed(1)} minutes`;
  return { rows: out, totalMs: cumulative, human };
}

/* ── cron ──────────────────────────────────────────────────────────────────── */

const CRON_FIELDS = [
  { name: "minute", min: 0, max: 59 },
  { name: "hour", min: 0, max: 23 },
  { name: "day-of-month", min: 1, max: 31 },
  { name: "month", min: 1, max: 12 },
  { name: "day-of-week", min: 0, max: 6 },
] as const;

function fieldSet(expr: string, min: number, max: number, name: string, errors: string[]): Set<number> | null {
  const set = new Set<number>();
  for (const part of expr.split(",")) {
    const stepMatch = part.match(/^(\*|\d+(?:-\d+)?)\/(\d+)$/);
    const base = stepMatch ? stepMatch[1]! : part;
    const step = stepMatch ? Number(stepMatch[2]) : 1;
    let from = min, to = max;
    if (base !== "*") {
      const r = base.match(/^(\d+)(?:-(\d+))?$/);
      if (!r) { errors.push(`${name}: "${part}" is not a value, range, list or step`); return null; }
      from = Number(r[1]); to = r[2] !== undefined ? Number(r[2]) : stepMatch ? max : from;
    }
    if (from < min || to > max || from > to) { errors.push(`${name}: ${from}-${to} is outside ${min}-${max}`); return null; }
    if (step < 1) { errors.push(`${name}: step must be at least 1`); return null; }
    for (let i = from; i <= to; i += step) set.add(i);
  }
  return set;
}

export interface CronResult { valid: boolean; errors: string[]; fields: string[]; next: string[] }

export function parseCron(expr: string, fromIso: string, count = 5): CronResult {
  const errors: string[] = [];
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) {
    return { valid: false, fields: [], next: [],
      errors: [`${parts.length} fields — cron takes exactly 5 (minute hour day-of-month month day-of-week); a 6-field expression with seconds is a different dialect`] };
  }
  const sets = CRON_FIELDS.map((f, i) => fieldSet(parts[i]!, f.min, f.max, f.name, errors));
  if (errors.length > 0 || sets.some((s) => s === null)) return { valid: false, errors, fields: [], next: [] };
  const [min, hr, dom, mon, dow] = sets as Set<number>[];

  const start = new Date(`${fromIso}T00:00:00Z`);
  if (Number.isNaN(start.getTime())) return { valid: false, errors: [`"${fromIso}" is not an ISO date`], fields: [], next: [] };
  const next: string[] = [];
  const cursor = new Date(start.getTime());
  cursor.setUTCMinutes(cursor.getUTCMinutes() + 1);
  const limit = 366 * 24 * 60;                                  // a year of minutes is enough to find five runs
  for (let i = 0; i < limit && next.length < count; i++) {
    const dayRestricted = parts[2]!.trim() !== "*";
    const dowRestricted = parts[4]!.trim() !== "*";
    /* cron's classic oddity: when BOTH day fields are restricted the run happens if EITHER
       matches — not both. Getting this wrong is how a weekly job stops firing. */
    const dayMatch = dayRestricted && dowRestricted
      ? dom.has(cursor.getUTCDate()) || dow.has(cursor.getUTCDay())
      : dom.has(cursor.getUTCDate()) && dow.has(cursor.getUTCDay());
    if (min.has(cursor.getUTCMinutes()) && hr.has(cursor.getUTCHours())
        && mon.has(cursor.getUTCMonth() + 1) && dayMatch) {
      next.push(cursor.toISOString().slice(0, 16).replace("T", " "));
    }
    cursor.setUTCMinutes(cursor.getUTCMinutes() + 1);
  }
  return { valid: true, errors: [], fields: parts, next };
}

/* ── the tools ─────────────────────────────────────────────────────────────── */

export const DEV_TOOLS: Tool[] = [
  {
    id: "semver",
    domain: "dev",
    label: "SemVer",
    blurb: "Compare two versions, expand a range into the bounds it really means, bump correctly.",
    fields: [
      text("version", "Version", "1.4.2-rc.3"),
      text("range", "Range to test", "^1.2.0", "exact · ^ · ~ · >= · x-range · hyphen · || unions"),
      sel("bump", "If bumping", ["patch", "minor", "major", "prerelease", "release"], "patch"),
    ],
    run: (v): ToolResult => {
      const ver = parseSemver(str(v, "version"));
      if (!ver) return { headline: "That is not a semantic version this engine accepts", ok: false,
        basis: "expected MAJOR.MINOR.PATCH with optional -prerelease and +build, an optional leading v" };
      const range = str(v, "range");
      const sat = satisfiesRange(ver, range);
      const bumpKind = str(v, "bump") as "patch" | "minor" | "major" | "prerelease" | "release";
      return {
        headline: `${ver.raw} ${sat.ok ? "satisfies" : "does NOT satisfy"} ${range}`,
        ok: sat.ok,
        kpis: [
          { value: `${ver.major}.${ver.minor}.${ver.patch}`, label: "core" },
          { value: ver.pre.length ? ver.pre.join(".") : "—", label: "prerelease" },
          { value: nextVersion(ver, bumpKind), label: `bump ${bumpKind}` },
        ],
        table: sat.expanded.length
          ? { head: ["Term", "Expands to"], rows: sat.expanded.map((e) => {
              const [term, bounds] = e.split(" → ");
              return [term ?? "", bounds ?? ""];
            }) }
          : undefined,
        lines: [
          sat.ok ? "The version is inside the declared range." : "The version is outside the range — check whether the range or the version is the stale one.",
          ver.pre.length ? "A prerelease sorts BELOW its own release: 1.4.2-rc.3 < 1.4.2. Caret and tilde ranges do not admit prereleases unless the range itself names one." : "No prerelease, so ordinary precedence applies.",
        ],
        basis: "SemVer 2.0.0 precedence; ranges expanded to explicit bounds so the answer is checkable rather than asserted",
      };
    },
  },
  {
    id: "commit",
    domain: "dev",
    label: "Commit lint",
    blurb: "Lints a commit message the way the changelog generator will read it.",
    fields: [area("msg", "Message", "feat(auth): add device-bound session keys\n\nSessions are now bound to a device key at issue time.", "the whole message, subject and body")],
    run: (v): ToolResult => {
      const msg = str(v, "msg");
      if (!msg.trim()) return { headline: "Nothing to lint", ok: false, basis: "paste a full commit message, including the body" };
      const l = lintCommit(msg);
      return {
        headline: l.errors.length === 0 ? `Clean — ${l.type}${l.scope ? `(${l.scope})` : ""}` : `${l.errors.length} error(s)`,
        ok: l.errors.length === 0,
        kpis: [
          { value: l.type ?? "—", label: "type" },
          { value: l.scope ?? "—", label: "scope" },
          { value: l.breaking ? "yes" : "no", label: "breaking" },
          { value: `${l.subject.length}`, label: "subject chars" },
        ],
        lines: [...l.errors.map((e) => `ERROR — ${e}`), ...l.warnings.map((w) => `warning — ${w}`)],
        basis: "Conventional Commits 1.0.0: `type(scope): description`, a blank second line, and a BREAKING CHANGE "
             + "footer or `!` for a breaking change",
      };
    },
  },
  {
    id: "http",
    domain: "dev",
    label: "HTTP status",
    blurb: "What a status code means for a retry loop — and whether retrying is safe at all.",
    fields: [num("code", "Status code", "429")],
    run: (v): ToolResult => {
      const code = Math.round(number(v, "code", 429));
      const s = httpSemantics(code);
      return {
        headline: `${code} ${s.known ? "" : "(unclassified)"} — retry: ${s.retry}`,
        ok: s.known && s.retry !== "no",
        kpis: [
          { value: s.klass, label: "class" },
          { value: s.retry, label: "retry?" },
        ],
        lines: [s.note, `Idempotence — ${s.idempotentSafe}`],
        basis: "HTTP semantics (RFC 9110) plus the retry conventions that follow from them; 504 is the one that "
             + "looks like a failure and may not be one",
      };
    },
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
      num("jitter", "Jitter (±‰)", "0", "a fixed permille, so the schedule is reproducible"),
    ],
    run: (v): ToolResult => {
      const s = backoffSchedule(Math.round(number(v, "attempts", 6)), number(v, "base", 200),
        number(v, "factor", 2) || 2, number(v, "cap", 30000), Math.round(number(v, "jitter", 0)));
      const last = s.rows[s.rows.length - 1];
      return {
        headline: `${s.rows.length} attempts, ${s.human} before the last one is sent`,
        ok: true,
        kpis: [
          { value: s.human, label: "total elapsed" },
          { value: `${last?.delayMs ?? 0}ms`, label: "final delay" },
          { value: s.rows.some((r) => r.delayMs === Math.round(number(v, "cap", 30000))) ? "capped" : "uncapped", label: "cap" },
        ],
        table: { head: ["Attempt", "Delay (ms)", "Cumulative (ms)"], rows: s.rows.map((r) => [`${r.attempt}`, `${r.delayMs}`, `${r.cumulativeMs}`]) },
        lines: ["A ladder that exceeds the caller's own timeout is a ladder nobody finishes climbing — compare the total above with the timeout on the client."],
        basis: "exponential backoff with a cap; jitter is shown as a fixed permille so the schedule is reproducible "
             + "and pinnable — real jitter is applied at runtime on top of this shape",
      };
    },
  },
  {
    id: "cron",
    domain: "dev",
    label: "Cron",
    blurb: "Validates a 5-field cron expression and shows the next runs — including the day-field oddity.",
    fields: [
      text("expr", "Expression", "0 3 * * 1"),
      text("from", "From (ISO date)", "2026-09-22"),
      num("count", "Runs to show", "5"),
    ],
    run: (v): ToolResult => {
      const r = parseCron(str(v, "expr"), str(v, "from"), Math.max(1, Math.min(20, Math.round(number(v, "count", 5)))));
      if (!r.valid) {
        return { headline: "Invalid expression", ok: false, lines: r.errors,
          basis: "5 fields: minute hour day-of-month month day-of-week (0 = Sunday)" };
      }
      return {
        headline: `Next ${r.next.length} run(s)`,
        ok: true,
        kpis: [
          { value: r.fields[0] ?? "", label: "minute" },
          { value: r.fields[1] ?? "", label: "hour" },
          { value: `${r.fields[2]} ${r.fields[3]} ${r.fields[4]}`, label: "dom · month · dow" },
        ],
        lines: r.next.map((n) => `· ${n} UTC`),
        code: r.next.join("\n"),
        basis: "standard 5-field cron interpreted in UTC; when BOTH day-of-month and day-of-week are restricted the "
             + "job runs when EITHER matches — the rule that silently breaks weekly jobs",
      };
    },
  },
];
