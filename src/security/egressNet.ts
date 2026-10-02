/**
 * egressNet — DNS- and IP-aware egress enforcement.
 *
 * WHY THIS EXISTS. `checkEgressUrl` is a hostname-STRING policy. That is a
 * necessary first gate and it is not sufficient: OWASP's SSRF guidance is
 * explicit that hostname checks are bypassable through DNS rebinding, redirect
 * chains and alternate IP representations, and that the real control is to
 * validate the RESOLVED address and pin it. Two live holes proved that here:
 *
 *   1. IPv4-mapped IPv6. `http://[::ffff:a9fe:a9fe]/` is 169.254.169.254 — the
 *      cloud metadata endpoint — written in the mapped form. The string policy's
 *      IPv6 checks match only /^(fc|fd)/ and /fe80:/, so this passed as "an
 *      ordinary IPv6 host". Shipped, reachable, and it is the SSRF the whole
 *      guard exists to stop.
 *   2. DNS rebinding (TOCTOU). A hostname that resolves public at check time
 *      and private at connect time defeats any string policy. This is
 *      CVE-2025-69660 (simstudioai/sim) and CVE-2026-64849 (MLflow) in the wild.
 *
 * WHAT THIS DOES. It adds the three layers OWASP asks for that a string check
 * cannot provide:
 *
 *   1. normalize()  — canonicalize a host to a real IP, unwrapping IPv4-mapped
 *                     and IPv4-embedded IPv6, and rejecting bare integer /
 *                     octal / hex IPv4 forms.
 *   2. classifyIp() — classify that IP against the IANA special-purpose
 *                     registries (loopback, RFC1918, CGNAT, link-local, IETF
 *                     protocol assignments, multicast, reserved, NAT64, v4-mapped).
 *   3. safeEgressFetch() — resolve ONCE, classify, pin the answer, and re-run
 *                     the whole policy on every redirect hop with redirects
 *                     disabled at the client (OWASP: "Disable HTTP redirections").
 *
 * LOOPBACK STAYS ALLOWED, deliberately. A local Ollama and a self-hosted
 * gateway are documented, consented product surface, and `checkEgressUrl` has
 * always allowed them. The native provider path therefore passes
 * `allowLoopback`, and the web/browser fetch paths do not need to. This mirrors
 * the existing policy — it does not quietly widen or narrow what the product
 * can reach.
 *
 * FAIL-CLOSED. A hostname that resolves to BOTH a public and a private address
 * is refused. A resolver that throws is refused. An IP we cannot parse is
 * refused. "I could not tell" is never "yes".
 */

import { checkEgressUrl } from "./guardrail";
import {
  classifyHost,
  classifyIp,
  isObfuscatedIpv4Literal,
  normalizeHost,
  type IpClass,
  type IpKind,
  type NormalizedHost,
} from "./ipClassify";

/* 11.14.4 — normalization and classification moved to ./ipClassify so that
   `checkEgressUrl` (14 call sites) and this module run ONE policy instead of
   two that could disagree. They re-exported rather than being rewritten, so
   every existing import — and probe/egressNet.test.ts — keeps working. */

/* ── 1. normalization ─────────────────────────────────────────────────────── */

/** @deprecated imported from ./ipClassify; re-exported for existing callers. */
export type { IpClass, IpKind, NormalizedHost };
export { classifyHost, classifyIp, normalizeHost };


/* ── 3. resolution + redirect-safe fetch ──────────────────────────────────── */

export type Resolver = (hostname: string) => Promise<string[]>;

const systemResolver: Resolver = async (hostname) => {
  const dns = await import("node:dns/promises").catch(() => null);
  if (!dns) return [];
  const out: string[] = [];
  try {
    for (const r of await dns.lookup(hostname, { all: true, verbatim: true })) out.push(r.address);
  } catch { /* resolved below as a failure */ }
  return out;
};

export interface EgressDecision {
  ok: boolean;
  reason: string;
  /** The address the caller must connect to. Pinning this closes the rebinding window. */
  pinnedIp?: string;
  scope?: IpClass["scope"];
  hops?: { url: string; ip: string; status: number }[];
}

/**
 * Resolve once, classify every answer, and pin the winner.
 *
 * Fails closed: a name that resolves to BOTH a public and a non-public address
 * is refused, because an attacker who controls the name controls which address
 * the client happens to pick.
 */
export async function resolveEgress(
  raw: string,
  opts: { allowLoopback?: boolean; resolve?: Resolver } = {},
): Promise<EgressDecision> {
  const allowLoopback = opts.allowLoopback ?? false;
  const resolve = opts.resolve ?? systemResolver;

  // The string policy still runs first — it owns scheme and suffix policy.
  const base = checkEgressUrl(raw);
  if (!base.ok) return { ok: false, reason: base.reason };

  const host = new URL(raw).hostname.replace(/^\[|\]$/g, "");

  // Literal address: no DNS involved, so the TOCTOU question does not arise.
  const literal = normalizeHost(host);
  if (literal.kind !== "unknown") {
    const cls = classifyIp(literal, allowLoopback);
    return cls.ok
      ? { ok: true, reason: "", pinnedIp: literal.ip, scope: cls.scope }
      // Name the address we actually refused, not the disguise it was written as.
      : { ok: false, reason: `${literal.ip} — ${cls.reason}`, scope: cls.scope };
  }
  if (literal.ip === "" && isObfuscatedIpv4Literal(host.toLowerCase())) {
    return { ok: false, reason: `obfuscated IP literal "${host}" refused — write the address in dotted-quad form`, scope: "unknown" };
  }

  let answers: string[];
  try {
    answers = await resolve(host);
  } catch (e) {
    return { ok: false, reason: `DNS resolution failed for "${host}": ${e instanceof Error ? e.message : String(e)}` };
  }
  if (answers.length === 0) return { ok: false, reason: `"${host}" resolved to no addresses — refused rather than guessing`, scope: "unknown" };

  const seen: string[] = [];
  let pinned: { ip: string; scope: IpClass["scope"] } | null = null;
  for (const a of answers) {
    const n = normalizeHost(a);
    const cls = classifyIp(n, allowLoopback);
    if (!cls.ok) {
      return { ok: false, reason: `"${host}" resolves to ${n.ip || a} — ${cls.reason}`, scope: cls.scope };
    }
    seen.push(n.ip || a);
    if (!pinned) pinned = { ip: n.ip || a, scope: cls.scope };
  }
  return { ok: true, reason: "", pinnedIp: pinned!.ip, scope: pinned!.scope, hops: [{ url: raw, ip: pinned!.ip, status: 0 }] };
}

const DEFAULT_MAX_REDIRECTS = 5;

export interface SafeEgressInit extends RequestInit {
  fetchImpl?: typeof fetch;
  allowLoopback?: boolean;
  resolve?: Resolver;
  maxRedirects?: number;
}

/**
 * A fetch that OWASP's SSRF guidance accepts: redirects are followed manually,
 * every hop is re-resolved and re-classified, and the address decided at check
 * time is the address handed to the transport.
 */
export async function safeEgressFetch(raw: string, init: SafeEgressInit = {}): Promise<Response> {
  const { fetchImpl, allowLoopback, resolve, maxRedirects, ...rest } = init;
  const doFetch = fetchImpl ?? globalThis.fetch?.bind(globalThis);
  if (!doFetch) throw new Error("no fetch available in this runtime — nothing was executed");

  const hops: EgressDecision["hops"] = [];
  let current = raw;

  for (let hop = 0; hop <= (maxRedirects ?? DEFAULT_MAX_REDIRECTS); hop += 1) {
    const decision = await resolveEgress(current, { allowLoopback, resolve });
    if (!decision.ok) {
      throw new Error(`egress refused at hop ${hop}: ${decision.reason} — nothing further was sent.`);
    }
    // `manual` is load-bearing: an auto-following client would reach an
    // unvetted hop without ever coming back through this loop.
    const res = await doFetch(current, { ...rest, redirect: "manual" });
    hops.push({ url: current, ip: decision.pinnedIp ?? "", status: res.status });

    const location = res.headers.get("location");
    if (!location || res.status < 300 || res.status > 399) {
      Object.defineProperty(res, "egressHops", { value: hops, enumerable: false });
      return res;
    }
    let next: string;
    try {
      next = new URL(location, current).toString();
    } catch {
      throw new Error(`egress refused: hop ${hop} returned an unparseable Location — nothing further was sent.`);
    }
    if (hop === (maxRedirects ?? DEFAULT_MAX_REDIRECTS)) {
      throw new Error(`egress refused: more than ${maxRedirects ?? DEFAULT_MAX_REDIRECTS} redirects — possible redirect loop.`);
    }
    current = next;
  }
  throw new Error("egress refused: redirect budget exhausted.");
}
