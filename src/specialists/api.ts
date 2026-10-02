/**
 * API engines — the arithmetic behind rate limits, payloads, idempotency and paging.
 *
 * These are the four things an API consumer gets wrong in production and cannot debug from
 * a stack trace: why the 429 arrives at the same second every minute, why the request is
 * accepted by curl and rejected by the client, why one retry double-charged a customer, and
 * why page 4,000 is slow even though it returns ten rows.
 */
import { num, text, area, number, str, type Tool, type ToolResult } from "./types";

/* ── token bucket ──────────────────────────────────────────────────────────── */

export interface BucketStep { second: number; tokens: number; admitted: number; rejected: number }

/**
 * A token bucket simulated second by second. Deterministic: no wall clock, no randomness —
 * the same inputs always produce the same timeline, which is what makes a limit debuggable.
 */
export function tokenBucketPlan(ratePerMinute: number, burst: number, perSecond: number, seconds: number): {
  steps: BucketStep[]; admitted: number; rejected: number; firstRejection: number | null; steadyState: number;
} {
  const refill = ratePerMinute / 60;
  let tokens = burst;
  const steps: BucketStep[] = [];
  let admitted = 0, rejected = 0, firstRejection: number | null = null;
  for (let s = 1; s <= seconds; s++) {
    tokens = Math.min(burst, tokens + refill);
    const take = Math.min(perSecond, Math.floor(tokens));
    if (take < perSecond && firstRejection === null) firstRejection = s;
    admitted += take;
    rejected += perSecond - take;
    tokens -= take;
    steps.push({ second: s, tokens: Math.round(tokens * 1000) / 1000, admitted: take, rejected: perSecond - take });
  }
  return { steps, admitted, rejected, firstRejection,
           steadyState: Math.min(perSecond, Math.floor(refill)) };
}

/* ── payload budget ────────────────────────────────────────────────────────── */

export interface FieldSize { field: string; bytes: number; share: number }

export function payloadBudget(json: string): { ok: boolean; error?: string; totalBytes: number;
  fields: FieldSize[]; largest: FieldSize | null } {
  const trimmed = json.trim();
  if (!trimmed) return { ok: false, error: "nothing to measure", totalBytes: 0, fields: [], largest: null };
  let parsed: unknown;
  try { parsed = JSON.parse(trimmed); }
  catch (e) { return { ok: false, error: `not valid JSON — ${String(e)}`, totalBytes: new TextEncoder().encode(trimmed).length, fields: [], largest: null }; }

  const totalBytes = new TextEncoder().encode(trimmed).length;
  const rows: FieldSize[] = [];
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    for (const [k, val] of Object.entries(parsed as Record<string, unknown>)) {
      const size = new TextEncoder().encode(`${JSON.stringify(k)}:${JSON.stringify(val)}`).length;
      rows.push({ field: k, bytes: size, share: totalBytes ? (size / totalBytes) * 100 : 0 });
    }
  } else if (Array.isArray(parsed)) {
    const first = parsed[0];
    rows.push({ field: "(array)", bytes: totalBytes, share: 100 });
    if (first && typeof first === "object" && !Array.isArray(first)) {
      for (const k of Object.keys(first as Record<string, unknown>)) {
        const size = new TextEncoder().encode(JSON.stringify(k)).length + 2;
        rows.push({ field: `(item).${k}`, bytes: size, share: 0 });
      }
    }
  } else {
    rows.push({ field: "(scalar)", bytes: totalBytes, share: 100 });
  }
  rows.sort((a, b) => b.bytes - a.bytes);
  return { ok: true, totalBytes, fields: rows, largest: rows[0] ?? null };
}

/* ── idempotency keys ──────────────────────────────────────────────────────── */

export interface KeyCheck { ok: boolean; length: number; charset: "uuid" | "hex" | "base64url" | "other";
  entropyBits: number; issues: string[] }

/** Shannon entropy over the string's own characters — a floor on guessability, not a proof of anything. */
export function stringEntropyBits(s: string): number {
  if (!s) return 0;
  const counts = new Map<string, number>();
  for (const ch of s) counts.set(ch, (counts.get(ch) ?? 0) + 1);
  let bitsPerChar = 0;
  for (const n of counts.values()) {
    const p = n / s.length;
    bitsPerChar -= p * Math.log2(p);
  }
  return bitsPerChar * s.length;
}

export function checkIdempotencyKey(key: string): KeyCheck {
  const issues: string[] = [];
  const k = key.trim();
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(k);
  const isHex = /^[0-9a-f]{16,}$/i.test(k);
  const isB64 = /^[A-Za-z0-9_-]{22,}$/.test(k);
  const charset: KeyCheck["charset"] = isUuid ? "uuid" : isHex ? "hex" : isB64 ? "base64url" : "other";
  const entropyBits = Math.round(stringEntropyBits(k));
  if (k.length < 16) issues.push(`${k.length} characters — too short to be collision-resistant; 128 bits of randomness is the usual floor`);
  if (charset === "other") issues.push("unusual character set — prefer a UUIDv4 or 16+ random bytes in hex/base64url");
  if (/^(test|dev|dummy|123|abc)/i.test(k)) issues.push("looks sequential or human-authored; an idempotency key must not be guessable");
  if (entropyBits < 96) issues.push(`~${entropyBits} bits measured from its own character distribution — below the 96–128 bit range a real random key lands in`);
  return { ok: issues.length === 0, length: k.length, charset, entropyBits, issues };
}

/* ── pagination ────────────────────────────────────────────────────────────── */

export function paginationPlan(total: number, pageSize: number, offset = 0, deepOffsetLimit = 10_000): {
  pages: number; lastPageSize: number; currentPage: number; deep: boolean; lines: string[];
} {
  if (pageSize <= 0) return { pages: 0, lastPageSize: 0, currentPage: 0, deep: false, lines: ["page size must be at least 1"] };
  const pages = Math.ceil(total / pageSize);
  const lastPageSize = total % pageSize === 0 ? pageSize : total % pageSize;
  const currentPage = Math.floor(offset / pageSize) + 1;
  const deep = offset > deepOffsetLimit;
  return {
    pages, lastPageSize, currentPage, deep,
    lines: [
      `${total} rows at ${pageSize}/page = ${pages} pages; the last page carries ${total === 0 ? 0 : lastPageSize}.`,
      deep
        ? `Offset ${offset} is deep paging: the database still walks ${offset} rows to discard them. Prefer a keyset cursor `
          + `(WHERE id > :last_id ORDER BY id LIMIT :n) — it is O(page size) instead of O(offset).`
        : `Offset paging is fine at this depth (${offset} rows skipped).`,
      `A cursor is also stable under writes; an offset is not — rows inserted while paging shift every later page.`,
    ],
  };
}

/* ── the tools ─────────────────────────────────────────────────────────────── */

export const API_TOOLS: Tool[] = [
  {
    id: "rate-limit",
    domain: "api",
    label: "Rate limit",
    blurb: "Simulates a token bucket against a client's demand and shows the first 429.",
    fields: [
      num("rate", "Limit (requests / minute)", "600"),
      num("burst", "Burst allowance", "20"),
      num("demand", "Client demand (requests / second)", "15"),
      num("seconds", "Seconds to simulate", "30"),
    ],
    run: (v): ToolResult => {
      const rate = number(v, "rate", 600), burst = number(v, "burst", 20);
      const demand = Math.max(0, Math.round(number(v, "demand", 15)));
      const seconds = Math.max(1, Math.min(600, Math.round(number(v, "seconds", 30))));
      const plan = tokenBucketPlan(rate, burst, demand, seconds);
      const sustainable = plan.steadyState;
      const oversubscribed = demand > sustainable;
      return {
        headline: oversubscribed
          ? `Oversubscribed — ${demand}/s demanded against a sustainable ${sustainable}/s`
          : `Sustainable — ${demand}/s fits inside ${sustainable}/s`,
        ok: !oversubscribed,
        kpis: [
          { value: `${sustainable}/s`, label: "sustainable rate" },
          { value: plan.firstRejection === null ? "never" : `${plan.firstRejection}s`, label: "first rejection" },
          { value: `${plan.admitted}`, label: "admitted" },
          { value: `${plan.rejected}`, label: "rejected" },
        ],
        table: { head: ["Second", "Tokens", "Admitted", "Rejected"],
                 rows: plan.steps.slice(0, 12).map((s) => [`${s.second}`, `${s.tokens}`, `${s.admitted}`, `${s.rejected}`]) },
        lines: [
          oversubscribed
            ? `The burst absorbs the first ${plan.firstRejection ?? 0} second(s) and then the limit bites. A client that `
              + `retries immediately on 429 makes this worse — honour Retry-After, or size the client below ${sustainable}/s.`
            : "Demand fits: the bucket refills faster than the client drains it, so a burst is absorbed and the steady state is never breached.",
          `Refill is ${(rate / 60).toFixed(2)} tokens/second — a limit expressed per minute is a per-SECOND refill, which is why the smoothing surprises people.`,
        ],
        basis: "token bucket: capacity = burst, refill = limit/60 per second, whole requests only; deterministic "
             + "simulation — no wall clock and no randomness, so a limit is reproducible and arguable",
      };
    },
  },
  {
    id: "payload",
    domain: "api",
    label: "Payload budget",
    blurb: "Measures a JSON response field by field and names what is making it big.",
    fields: [area("json", "JSON", '{"id":"acct_9f2","name":"Acme Industries","orders":[{"id":1},{"id":2}],"internal_notes":"a very long note that the client will never render but pays to download"}', "paste a response body")],
    run: (v): ToolResult => {
      const b = payloadBudget(str(v, "json"));
      if (!b.ok) return { headline: "Could not measure that", ok: false, lines: b.error ? [b.error] : [], basis: "the payload must be valid JSON to be measured" };
      return {
        headline: `${b.totalBytes.toLocaleString()} bytes across ${b.fields.length} field(s)`,
        ok: b.totalBytes < 100_000,
        kpis: [
          { value: `${b.totalBytes.toLocaleString()} B`, label: "total" },
          { value: b.largest ? `${b.largest.share.toFixed(0)}%` : "—", label: "largest share" },
          { value: b.largest?.field ?? "—", label: "largest field" },
        ],
        table: { head: ["Field", "Bytes", "Share"], rows: b.fields.slice(0, 12).map((f) => [f.field, `${f.bytes}`, `${f.share.toFixed(1)}%`]) },
        lines: [
          b.largest && b.largest.share > 40
            ? `"${b.largest.field}" is ${b.largest.share.toFixed(0)}% of the response — a list endpoint that most clients ignore is the usual cause.`
            : "No single field dominates; the size is spread across the shape itself.",
          "Compression is NOT estimated here: the ratio depends on the data and the encoder, and a guessed ratio is the "
          + "kind of number that looks precise and gets quoted in a design doc.",
        ],
        basis: "UTF-8 byte length as the wire sees it, measured per top-level field (key + value); gzip is deliberately "
             + "not estimated",
      };
    },
  },
  {
    id: "idempotency",
    domain: "api",
    label: "Idempotency key",
    blurb: "Checks a key the way a payment API will, and states the entropy it actually carries.",
    fields: [text("key", "Key", "3f8a1c9b-6d2e-4f71-9a55-2c7e8b0d4e13"),
      num("ttl", "Retention (hours)", "24", "how long the server must remember the key")],
    run: (v): ToolResult => {
      const c = checkIdempotencyKey(str(v, "key"));
      const ttl = number(v, "ttl", 24);
      return {
        headline: c.ok ? `Usable — ${c.charset}, ~${c.entropyBits} bits` : `${c.issues.length} issue(s)`,
        ok: c.ok,
        kpis: [
          { value: c.charset, label: "shape" },
          { value: `${c.length}`, label: "characters" },
          { value: `~${c.entropyBits}`, label: "bits (measured)" },
          { value: `${ttl}h`, label: "retention asked" },
        ],
        lines: [
          ...c.issues,
          `Retention is the other half of the contract: a key remembered for ${ttl} hour(s) means a retry after that `
          + `window is a NEW charge. The client's retry budget and the server's retention must agree — that gap is how a `
          + `duplicate payment happens with an idempotency key in place.`,
          "The measured bits come from the string's own character distribution. A key that LOOKS random but was typed "
          + "by a human measures low, which is exactly what you want to catch.",
        ],
        basis: "Shannon entropy over the key's characters as a floor on guessability (not a guarantee of randomness), "
             + "plus the shape rules payment APIs enforce",
      };
    },
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
      num("limit", "Deep-offset warning above", "10000"),
    ],
    run: (v): ToolResult => {
      const p = paginationPlan(Math.round(number(v, "total", 250000)), Math.round(number(v, "size", 100)),
        Math.round(number(v, "offset", 25000)), Math.round(number(v, "limit", 10000)));
      return {
        headline: p.deep ? `Deep paging at offset ${number(v, "offset", 25000)}` : `${p.pages.toLocaleString()} pages`,
        ok: !p.deep,
        kpis: [
          { value: p.pages.toLocaleString(), label: "pages" },
          { value: `${p.lastPageSize}`, label: "last page rows" },
          { value: `#${p.currentPage.toLocaleString()}`, label: "page at this offset" },
        ],
        lines: p.lines,
        basis: "offset paging arithmetic; keyset paging is recommended above the configured depth because an offset "
             + "scan is O(offset) while a cursor is O(page size)",
      };
    },
  },
];
