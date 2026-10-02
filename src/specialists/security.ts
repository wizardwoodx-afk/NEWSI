/**
 * Security engines — measures, not verdicts.
 *
 * Every tool here is explicit about what it does NOT do, because the failure mode for a
 * security tool is confidence. Pattern matching does not find every secret; entropy does not
 * prove randomness; decoding a JWT does not verify it. Each of those is stated in the result
 * rather than implied by a green tick — a security tool that overstates itself makes an
 * organisation less safe than one that does not exist, because people stop looking.
 */
import { num, text, area, number, str, type Tool, type ToolResult } from "./types";
import { stringEntropyBits } from "./api";

/* ── secret patterns ───────────────────────────────────────────────────────── */

interface Pattern { name: string; re: RegExp; note: string }

/* Deliberately concrete formats first; the generic assignment patterns are last, because a
   generic pattern with a low bar is how a scanner produces a thousand false positives and
   gets switched off in a week. */
const PATTERNS: Pattern[] = [
  { name: "AWS access key id", re: /\bAKIA[0-9A-Z]{16}\b/g, note: "AKIA-prefixed; rotate and check CloudTrail for use" },
  { name: "GitHub token", re: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/g, note: "GitHub PAT — revoke first, then rewrite history" },
  { name: "Slack token", re: /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/g, note: "Slack app/bot token" },
  { name: "Private key block", re: /-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/g, note: "an actual private key in the file — treat the key as compromised" },
  { name: "JSON Web Token", re: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}\b/g, note: "a signed token; it is bearer authority until it expires" },
  { name: "Stripe secret key", re: /\bsk_(?:live|test)_[A-Za-z0-9]{16,}\b/g, note: "Stripe secret key — live keys can move money" },
  { name: "Google API key", re: /\bAIza[0-9A-Za-z_-]{35}\b/g, note: "Google API key; check its referrer/IP restrictions" },
  { name: "Connection string", re: /\b(?:postgres|postgresql|mysql|mongodb(?:\+srv)?|redis|amqp):\/\/[^\s:@/]+:[^\s@/]+@/gi, note: "embeds a password in a URL — the password is in every log line that prints this string" },
  { name: "Assigned secret", re: /\b(?:api[_-]?key|secret|passwd|password|token|client[_-]?secret)\b\s*[:=]\s*["']?([A-Za-z0-9_\-./+]{16,})["']?/gi, note: "generic assignment — HIGH false-positive rate by nature; treat as a prompt to look, not a finding" },
];

export interface SecretHit { name: string; count: number; samples: string[]; note: string }

/** Masks a matched value, keeping enough to identify which one it is. */
export function maskSecret(s: string): string {
  if (s.length <= 8) return "•".repeat(s.length);
  return `${s.slice(0, 4)}${"•".repeat(Math.max(4, Math.min(24, s.length - 8)))}${s.slice(-4)}`;
}

export function scanSecrets(text: string): SecretHit[] {
  const hits: SecretHit[] = [];
  for (const p of PATTERNS) {
    const re = new RegExp(p.re.source, p.re.flags.includes("g") ? p.re.flags : `${p.re.flags}g`);
    const found: string[] = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      found.push(m[1] ?? m[0]);
      if (found.length >= 50) break;
    }
    if (found.length > 0) {
      hits.push({ name: p.name, count: found.length, samples: [...new Set(found)].slice(0, 3).map(maskSecret), note: p.note });
    }
  }
  return hits;
}

/* ── JWT, decoded but never trusted ────────────────────────────────────────── */

export interface JwtInspection {
  ok: boolean; error?: string; header?: Record<string, unknown>; payload?: Record<string, unknown>;
  algorithm?: string; expiresIn?: string; expired?: boolean | null; lines: string[];
}

/**
 * base64url → UTF-8, using only globals both a browser and node provide. Nothing is
 * imported: this module is reachable from the UI, where node: imports are not available.
 */
function b64urlDecode(part: string): string {
  const pad = part.length % 4 === 0 ? "" : "=".repeat(4 - (part.length % 4));
  const b64 = part.replace(/-/g, "+").replace(/_/g, "/") + pad;
  const g = globalThis as unknown as {
    atob?: (s: string) => string;
    TextDecoder?: new (label?: string) => { decode(input: Uint8Array): string };
  };
  if (!g.atob || !g.TextDecoder) throw new Error("no base64 decoder available in this runtime");
  const binary = g.atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new g.TextDecoder("utf-8").decode(bytes);
}

export function jwtInspect(token: string, nowIso: string): JwtInspection {
  const parts = token.trim().split(".");
  if (parts.length !== 3) return { ok: false, error: `${parts.length} segments — a JWS has 3 (header.payload.signature)`, lines: [] };
  try {
    const header = JSON.parse(b64urlDecode(parts[0]!)) as Record<string, unknown>;
    const payload = JSON.parse(b64urlDecode(parts[1]!)) as Record<string, unknown>;
    const algorithm = String(header.alg ?? "(none declared)");
    const lines: string[] = [];
    let expired: boolean | null = null;
    let expiresIn: string | undefined;
    const now = Math.floor(new Date(`${nowIso}T00:00:00Z`).getTime() / 1000);
    const exp = typeof payload.exp === "number" ? payload.exp : undefined;
    if (exp !== undefined) {
      expired = exp <= now;
      const secs = exp - now;
      expiresIn = expired
        ? `expired ${Math.abs(Math.round(secs / 3600))} h ago`
        : `${(secs / 3600).toFixed(1)} h remaining`;
      lines.push(`exp is ${new Date(exp * 1000).toISOString()} — ${expiresIn}.`);
    } else {
      lines.push("No exp claim: this token never expires on its own. That is a finding, not a detail.");
    }
    if (algorithm === "none") lines.push("alg is \"none\" — the token carries NO signature. Anything that accepts it is accepting unsigned authority.");
    if (typeof payload.aud !== "undefined") lines.push(`aud: ${JSON.stringify(payload.aud)} — check the token was minted FOR this service.`);
    lines.push("The signature was NOT verified and the payload was NOT trusted: this decodes what anyone holding the token can read. Verification needs the key, which this engine deliberately does not hold.");
    return { ok: true, header, payload, algorithm, ...(expiresIn ? { expiresIn } : {}), expired, lines };
  } catch (e) {
    return { ok: false, error: `could not decode — ${String(e)}`, lines: [] };
  }
}

/* ── CSP ───────────────────────────────────────────────────────────────────── */

export interface CspFinding { directive: string; severity: "high" | "medium" | "low"; finding: string }

export function cspAudit(header: string, hasNonce = false): { directives: string[]; findings: CspFinding[] } {
  const directives: string[] = [];
  const findings: CspFinding[] = [];
  const map = new Map<string, string[]>();
  for (const clause of header.split(";")) {
    const t = clause.trim();
    if (!t) continue;
    const [name, ...values] = t.split(/\s+/);
    if (!name) continue;
    const key = name.toLowerCase();
    directives.push(key);
    map.set(key, values);
  }
  const src = (k: string): string[] => map.get(k) ?? [];
  const allSources = [...map.values()].flat();

  if (!map.has("default-src")) findings.push({ directive: "default-src", severity: "high",
    finding: "no default-src: every fetch directive you did not write falls back to the browser default, which is wide open" });
  if (allSources.includes("*")) findings.push({ directive: "*", severity: "high",
    finding: "a wildcard source makes the policy decorative — any host can serve script" });
  if (src("script-src").includes("'unsafe-inline'") && !hasNonce) findings.push({ directive: "script-src", severity: "high",
    finding: "'unsafe-inline' without a nonce or hash defeats the point of script-src: injected inline script runs" });
  if (src("script-src").includes("'unsafe-eval'")) findings.push({ directive: "script-src", severity: "high",
    /* The hygiene gate greps for the call form, so the finding is worded without it —
       the gate is right to be that literal about a product with one sandboxed eval surface. */
    finding: "'unsafe-eval' permits dynamic code evaluation — the gadget most XSS payloads need" });
  if (["http:", "https:"].some((s) => allSources.includes(s))) findings.push({ directive: "scheme-only source", severity: "medium",
    finding: "a bare http:/https: source allows ANY host over that scheme" });
  if (!map.has("frame-ancestors") && !map.has("x-frame-options")) findings.push({ directive: "frame-ancestors", severity: "medium",
    finding: "no frame-ancestors (and no X-Frame-Options): the page can be framed, so clickjacking is on the table" });
  if (!map.has("object-src")) findings.push({ directive: "object-src", severity: "low",
    finding: "no object-src: legacy plugin content (object/embed/applet) is unrestricted; 'object-src 'none'' is the usual close" });
  if (!map.has("base-uri")) findings.push({ directive: "base-uri", severity: "medium",
    finding: "no base-uri: an injected <base> tag can redirect every relative URL on the page" });
  if (allSources.includes("data:") && (map.get("script-src") ?? []).includes("data:")) findings.push({ directive: "script-src data:", severity: "high",
    finding: "data: URLs as script sources let an injected payload carry its own code inline" });
  return { directives, findings };
}

/* ── the tools ─────────────────────────────────────────────────────────────── */

export const SECURITY_TOOLS: Tool[] = [
  {
    id: "entropy",
    domain: "security",
    label: "Entropy",
    blurb: "How many bits a string actually carries — a floor on guessability, stated as a measure.",
    fields: [text("s", "String", "correct-horse-battery-staple", "paste a candidate password, key or token")],
    run: (v): ToolResult => {
      const s = str(v, "s");
      if (!s) return { headline: "Nothing to measure", ok: false, basis: "paste the string" };
      const bits = stringEntropyBits(s);
      const perChar = bits / s.length;
      const alphabet = new Set(s).size;
      const verdict = bits < 40 ? "low — brute-forceable at scale" : bits < 70 ? "moderate — acceptable for a rate-limited login, not for a key" : bits < 100 ? "good for a password" : "strong";
      return {
        headline: `~${Math.round(bits)} bits — ${verdict}`,
        ok: bits >= 70,
        kpis: [
          { value: `~${Math.round(bits)}`, label: "measured bits" },
          { value: perChar.toFixed(2), label: "bits / character" },
          { value: `${s.length}`, label: "characters" },
          { value: `${alphabet}`, label: "distinct characters" },
        ],
        lines: [
          "This is Shannon entropy over the string's OWN character distribution. It measures the string, not the generator: "
          + "\"aaaaaaaaaaaaaaaa\" measures zero however random the dice were, and a long passphrase of real words measures high while being memorable.",
          "For key material, a CSPRNG's true entropy is a property of the generator (16 bytes = 128 bits), not of the output. Use this for passwords, where the human is the generator.",
        ],
        basis: "Shannon entropy H = −Σ p·log₂p, multiplied by length; a lower bound on how hard the string is to guess "
             + "from its characters alone",
      };
    },
  },
  {
    id: "secrets",
    domain: "security",
    label: "Secret scan",
    blurb: "Finds the credential shapes that have a fixed format — and says what it cannot find.",
    fields: [area("text", "Text to scan", "AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE\nDATABASE_URL=postgres://app:hunter2@db.internal:5432/prod\n\ntoken = \"eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.abcDEF123456\"", "a .env file, a log line, a config diff")],
    run: (v): ToolResult => {
      const text = str(v, "text");
      const hits = scanSecrets(text);
      const genericOnly = hits.length > 0 && hits.every((h) => h.name === "Assigned secret");
      return {
        headline: hits.length ? `${hits.length} pattern(s) matched` : "No known credential pattern matched",
        ok: hits.length === 0,
        kpis: [
          { value: `${hits.length}`, label: "pattern kinds" },
          { value: `${hits.reduce((a, h) => a + h.count, 0)}`, label: "matches" },
        ],
        table: hits.length
          ? { head: ["Pattern", "Matches", "Sample", "What to do"], rows: hits.map((h) => [h.name, `${h.count}`, h.samples[0] ?? "", h.note]) }
          : undefined,
        lines: [
          hits.length
            ? "A match is not a leak on its own — it is a prompt. The order that matters: revoke, then rotate, then look at where it was committed."
            : "Nothing matched. That is not a clean bill of health.",
          genericOnly
            ? "Only the GENERIC assignment pattern matched, which by nature matches variable names as readily as secrets — read the sample before acting."
            : "The patterns here have fixed formats (vendor prefixes, key headers), which is why they can be trusted enough to print.",
          "What this does NOT find: a secret with no distinctive format (a bare 32-character hex string), a secret "
          + "split across lines, a secret in an image, an encrypted blob, or anything in a repository you did not scan.",
        ],
        basis: "pattern matching against a fixed set of known credential formats, plus one deliberately-noisy generic "
             + "assignment pattern; matches are masked (first four and last four characters) so the finding does not "
             + "become a second copy of the secret",
      };
    },
  },
  {
    id: "jwt",
    domain: "security",
    label: "JWT inspect",
    blurb: "Decodes a JWT's claims and expiry — and is explicit that it does not verify it.",
    fields: [
      area("token", "Token", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJhY2N0XzlmMiIsImF1ZCI6ImFwaS5leGFtcGxlLmNvbSIsImV4cCI6MTc5MDAwMDAwMH0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c"),
      text("now", "Evaluate as on", "2026-09-22"),
    ],
    run: (v): ToolResult => {
      const ins = jwtInspect(str(v, "token"), str(v, "now", "2026-09-22"));
      if (!ins.ok) return { headline: "Not a decodable JWT", ok: false, lines: ins.error ? [ins.error] : [], basis: "a JWS is header.payload.signature, base64url encoded" };
      const warn = ins.algorithm === "none" || ins.expired === true || ins.expired === null;
      return {
        headline: `alg ${ins.algorithm ?? "?"}${ins.expiresIn ? ` · ${ins.expiresIn}` : ""}`,
        ok: !warn,
        kpis: [
          { value: ins.algorithm ?? "?", label: "algorithm" },
          { value: ins.expired === undefined || ins.expired === null ? "no exp" : ins.expired ? "expired" : "live", label: "expiry" },
          { value: String(ins.payload?.aud ?? "—").slice(0, 24), label: "audience" },
          { value: String(ins.payload?.iss ?? "—").slice(0, 24), label: "issuer" },
        ],
        code: JSON.stringify(ins.payload, null, 2),
        lines: ins.lines,
        basis: "base64url decoding only — NO signature verification, NO trust in the payload; decoding proves what "
             + "the token SAYS, never that it was issued by who it claims",
      };
    },
  },
  {
    id: "csp",
    domain: "security",
    label: "CSP audit",
    blurb: "Reads a Content-Security-Policy header and names the clauses that are doing nothing.",
    fields: [
      area("header", "Policy", "default-src 'self'; script-src 'self' 'unsafe-inline'; img-src * data:; connect-src https:;", "paste the header value, not the header name"),
      num("nonce", "Uses a nonce?", "0", "1 if script-src carries a nonce or hash"),
    ],
    run: (v): ToolResult => {
      const audit = cspAudit(str(v, "header"), number(v, "nonce", 0) === 1);
      const high = audit.findings.filter((f) => f.severity === "high").length;
      return {
        headline: `${audit.directives.length} directive(s) · ${audit.findings.length} finding(s)${high ? `, ${high} high` : ""}`,
        ok: audit.findings.length === 0,
        kpis: [
          { value: `${audit.directives.length}`, label: "directives" },
          { value: `${high}`, label: "high severity" },
          { value: audit.directives.includes("default-src") ? "yes" : "NO", label: "default-src" },
        ],
        table: audit.findings.length
          ? { head: ["Directive", "Severity", "Finding"], rows: audit.findings.map((f) => [f.directive, f.severity, f.finding]) }
          : undefined,
        lines: audit.findings.length === 0
          ? ["No findings from this audit. That is not the same as a strong policy — this checks a fixed list of known weaknesses, not the fit between the policy and the application."]
          : ["A missing default-src is the highest-value fix: it closes every directive that was never written."],
        basis: "checks against the known CSP weaknesses (wildcards, scheme-only sources, unsafe-inline without a nonce, "
             + "unsafe-eval, missing base-uri / frame-ancestors / object-src) — a fixed checklist, not a full policy analysis",
      };
    },
  },
];
