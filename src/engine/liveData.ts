/**
 * SelfImpulse — the live-data GuardRail (19.2.0): a runtime control, not a prompt ask.
 *
 * The 19.1.0 review was right: a prompt line saying "date your findings"
 * is not a GuardRail. This module is the enforcement half, and it runs on
 * EVERY answered research/analysis reply, inside the pipeline, whether or
 * not the model cooperated:
 *
 *   1. detect_live_data_required — the ANSWER itself is scanned: a reply
 *      in a time-sensitive domain (research/analysis) that makes
 *      time-sensitive claims (prices, versions, CVEs, "latest", years…)
 *      requires live evidence.
 *   2. evidence check — dated sources: URLs plus as-of/date markers.
 *   3. verdict — verified, or an explicit STALE FLAG appended to the
 *      reply itself and sealed inside the provenance digest.
 *
 * Honest boundary: VH ships no web-search provider (no external services
 * by design), so this control cannot perform the search — it enforces the
 * disclosure instead. An unverified answer is labelled knowledge-cutoff
 * data; it is never dressed as fresh, and the verdict rides in the digest
 * so the log cannot show a clean stamp over a stale answer.
 */

import type { LiveDataVerdict, RetrievalRecord } from "./types";
import { checkEgressUrl } from "../security/guardrail";

/** Domains where freshness is a safety property, not a preference. */
const LIVE_CATEGORIES = new Set(["research", "analysis"]);

/** Time-sensitive claim markers. Deliberately conservative: bare "version" or "now" do not trigger; "version 3.2" and "as of" do. */
const TIME_SENSITIVE =
  /\b(?:latest|current|today|tonight|yesterday|this (?:week|month|year)|last (?:week|month|year)|news|price|prices|pricing|stock|stocks|inflation|interest rates?|election|elections|cve-\d{4}-\d+|vulnerabilit(?:y|ies)|exploit|exploits|as of)\b|\bversion\s+\d+(?:\.\d+)*|\b(?:19|20)\d{2}\b/gi;

const MONTH_DATE = /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(?:19|20)\d{2}\b/gi;
const ISO_DATE = /\b(?:19|20)\d{2}-\d{2}(?:-\d{2})?\b/g;
const URL = /https?:\/\/[^\s)"'<>]+/g;

/** Claim markers found in a text (deduped, capped — these are shown to the user). */
export function detectTimeSensitiveClaims(text: string): string[] {
  const hits = text.match(TIME_SENSITIVE);
  return hits ? [...new Set(hits.map((h) => h.toLowerCase().trim()))].slice(0, 8) : [];
}

/** The evidence side: URLs and dated-claim markers in the reply. */
export function assessReplyEvidence(reply: string): { sources: number; datedClaims: number } {
  const sources = (reply.match(URL) ?? []).length;
  const datedClaims =
    (reply.match(/as of\b/gi) ?? []).length +
    (reply.match(ISO_DATE) ?? []).length +
    (reply.match(MONTH_DATE) ?? []).length;
  return { sources, datedClaims };
}

/**
 * The runtime verdict. Returns null when there is nothing to enforce
 * (wrong domain, or the answer makes no time-sensitive claims) — the
 * GuardRail never invents a requirement, and never stays silent when
 * one exists.
 */
export function liveDataVerdict(reply: string, categories: string[]): LiveDataVerdict | null {
  if (!categories.some((c) => LIVE_CATEGORIES.has(c))) return null;
  const claims = detectTimeSensitiveClaims(reply);
  if (claims.length === 0) return null;
  const { sources, datedClaims } = assessReplyEvidence(reply);
  const verified = sources > 0 && datedClaims > 0;
  const shown = claims.slice(0, 3).join(", ");
  return {
    required: true,
    verified,
    claims,
    sources,
    datedClaims,
    note: verified
      ? `Time-sensitive claims (${shown}…) carry dated live sources — ${sources} URL(s), ${datedClaims} dated claim(s).`
      : `Time-sensitive claims (${shown}…) carry NO dated live sources — ${sources} URL(s), ${datedClaims} dated claim(s). Flagged as unverified.`,
  };
}

/* ── 19.3.0: retrieval, not just disclosure ─────────────────────────────────
 *
 * The 19.2.0 GuardRail enforced DISCLOSURE: URL + dated marker ⇒ verified.
 * A model could satisfy that with a fabricated citation. 19.3.0 adds the
 * enforcement the review demanded — when an evidence-retrieval fetch is
 * wired, the GuardRail FETCHES the cited sources and checks the claim
 * markers INSIDE them:
 *
 *   time-sensitive claim → fetch each cited URL (≤3, timeout) → claim
 *   markers found in the fetched text? → supported ⇒ verifiedBy "retrieval"
 *
 * Honest boundary, unchanged in spirit: when no evidenceFetch is wired the
 * GuardRail stays disclosure-only and labels the verdict exactly that —
 * "verified" stamps carry their earning mechanism in the digest, so a
 * disclosure stamp can never pose as a retrieval stamp.
 */

export const MAX_RETRIEVAL_SOURCES = 3;
const RETRIEVAL_TIMEOUT_MS = 8_000;
const MAX_RETRIEVAL_CHARS = 20_000;

/**
 * Fetch the URLs the reply itself cites and look for the reply's claim
 * markers inside them. Pure function of real fetch results — every attempt
 * lands in a RetrievalRecord, successful or not.
 */
export async function verifyLiveEvidence(
  reply: string,
  claims: string[],
  opts: { fetchImpl: typeof fetch; now?: () => Date },
): Promise<{ retrieval: RetrievalRecord[]; supported: boolean }> {
  const urls = [...new Set(reply.match(URL) ?? [])].slice(0, MAX_RETRIEVAL_SOURCES);
  const now = opts.now ?? (() => new Date());
  const retrieval: RetrievalRecord[] = [];
  let supported = false;
  for (const url of urls) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), RETRIEVAL_TIMEOUT_MS);
    const fetchedAt = now().toISOString();
    /* 19.4.1 — ONE network policy. The evidence path rides the same
       checkEgressUrl SSRF guard as net.fetch; a model-cited URL gets no
       privileges a tool call would not have. Refusals are receipted. */
    const policy = checkEgressUrl(url);
    if (!policy.ok) {
      clearTimeout(timer);
      retrieval.push({ url, status: "failed", claimHits: 0, fetchedAt, bytes: 0, detail: `egress refused by the shared URL policy: ${policy.reason}` });
      continue;
    }
    try {
      const res = await opts.fetchImpl(url, { signal: controller.signal, headers: { accept: "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8", "user-agent": "SelfImpulse-GuardRail/19.7 (evidence-retrieval)" } });
      if (!res.ok) {
        retrieval.push({ url, status: "failed", claimHits: 0, fetchedAt, bytes: 0, detail: `HTTP ${res.status}` });
        continue;
      }
      const body = (await res.text()).slice(0, MAX_RETRIEVAL_CHARS);
      const lower = body.toLowerCase();
      const claimHits = claims.filter((c) => lower.includes(c.toLowerCase())).length;
      retrieval.push({ url, status: "retrieved", claimHits, fetchedAt, bytes: body.length });
      if (claimHits > 0) supported = true;
    } catch (err) {
      const aborted = err instanceof Error && err.name === "AbortError";
      retrieval.push({ url, status: "failed", claimHits: 0, fetchedAt, bytes: 0, detail: aborted ? `timeout after ${RETRIEVAL_TIMEOUT_MS}ms` : (err instanceof Error ? err.message : String(err)) });
    } finally {
      clearTimeout(timer);
    }
  }
  return { retrieval, supported };
}

/** The stale flag — appended to the reply itself, so it travels with the answer into the digest. */
export function liveDataBanner(v: LiveDataVerdict): string {
  const retrievalNote =
    v.retrieval && v.retrieval.length > 0
      ? ` Retrieval was attempted: ${v.retrieval.filter((r) => r.status === "retrieved").length}/${v.retrieval.length} cited source(s) fetched, ${v.retrieval.reduce((n, r) => n + r.claimHits, 0)} claim hit(s) found — the flag stands.`
      : ` No retrieval capability is wired in this runtime, so disclosure is enforced instead.`;
  return (
    `\n\n⚠ LIVE-DATA CHECK (runtime GuardRail): this answer makes time-sensitive claims (${v.claims.slice(0, 4).join(", ")}) ` +
    `without sufficient dated live sources (${v.sources} URL(s), ${v.datedClaims} dated claim(s)).${retrievalNote} ` +
    `Treat it as knowledge-cutoff data until verified — flagged honestly instead of dressed as fresh.`
  );
}
