/**
 * VH 16.9.5 — the SECURITY-REVIEW ARTIFACT (`si-security-review/1`).
 *
 * The 16.6.0 hardening release named "the signed audit report" as a PLANNED
 * deliverable and honestly said so. This module ships it — as a SIGNED
 * SELF-ASSESSMENT: an inventory of the product's security surfaces, the
 * posture of each, the machine-checkable EVIDENCE pointer for each claim
 * (probe suites, gates, the zero-install verifier), and — the part that
 * makes it a SelfImpulse artifact — an explicit list of what it does NOT
 * claim (no external penetration test, single-host threat model, drill
 * seats are machinery not model intelligence).
 *
 * Digest: SHA-256 over the canonical (deep-sorted) scope+findings body.
 * Signature: the receipt issuer keychain (Ed25519) over the digest — the
 * SAME key that signs proof receipts. If the host has no issuer key, the
 * artifact ships digest-stamped with `signature: null` and SAYS SO.
 * Verification: recompute the digest, verify the signature — zero product
 * state beyond the artifact and the issuer public key.
 */
import { signHexDigest, verifyIssuerSignature, type IssuerSignature } from "../selfimpulse/engine/signing";
import { ENGINE_VERSION } from "../version";

export interface SecuritySurface {
  /** The attack surface or control plane, in one line. */
  surface: string;
  /** The posture actually enforced — what happens, not what is hoped. */
  posture: string;
  /** The machine-checkable evidence: probe suites and gates that pin it. */
  evidence: string;
}

export interface SecurityReview {
  format: "si-security-review/1";
  issuedAt: string;
  product: string;
  /** Surfaces inventoried with posture + evidence. */
  scope: SecuritySurface[];
  /** Honest findings — known limitations, stated in words. */
  findings: string[];
  /** What this artifact explicitly does NOT claim. */
  refusals: string[];
  /** sha256 over the canonical body (scope+findings+refusals). */
  digest: string;
  /** Ed25519 from the receipt issuer keychain — null when no key (stated). */
  signature: IssuerSignature | null;
}

const enc = new TextEncoder();

function sortDeep(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortDeep);
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return Object.keys(o).sort().reduce<Record<string, unknown>>((acc, k) => { acc[k] = sortDeep(o[k]); return acc; }, {});
  }
  return v;
}

/** The canonical body the digest covers — everything except digest+signature. */
function canonicalBody(r: Omit<SecurityReview, "digest" | "signature">): string {
  return JSON.stringify(sortDeep({ format: r.format, issuedAt: r.issuedAt, product: r.product, scope: r.scope, findings: r.findings, refusals: r.refusals }));
}

export async function digestOf(body: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", enc.encode(body) as unknown as BufferSource);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function securityScope(): SecuritySurface[] {
  return [
    {
      surface: "MCP stdio server — the governed tool surface (20 tools)",
      posture: "Every call routes the governed pipeline; risky calls pause at the human gate (MRTR on the modern wire); honest risk labels in the schema; refusals in words.",
      evidence: "probe/mcpRouter (22 tests) · probe/mcpSdkClient + mcpSdkClientV2 (official SDK clients, both eras) · probe/mcpConformance (official JSON Schemas)",
    },
    {
      surface: "The human gate — authorization control",
      posture: "Every risky action pauses for a human decision; denials execute nothing (checked, not assumed); the gate, the brain, the receipt protocol and the code are NOT runtime self-modifiable; meta-loop self-changes are tighten-only and revert-gated.",
      evidence: "probe/metaLoop (9 tests) · probe/arenaGate · probe/mergeGate · probe/vhClean",
    },
    {
      surface: "Egress — data leaving the machine",
      posture: "Every artifact departure needs a human click plus a signed authority envelope, and lands in the egress ledger; refused departures are not violations; nothing is listed that did not leave.",
      evidence: "probe/egressAlign · Audit door live egress ledger",
    },
    {
      surface: "Proof chain — evidence integrity",
      posture: "SHA-256 hash-chained, Ed25519-signed receipts; a missing or forged issuer key cannot authenticate; tampering breaks the chain at the exact seq; verifiable with zero product state.",
      evidence: "probe/signing · probe/receipts · tools/verify-receipt.mjs (dependency-free open verifier)",
    },
    {
      surface: "Release identity — provenance of the build",
      posture: "One version line stamps all manifests, docs and the byte-pinned MCP engine bundle; current-facing documents may reference older releases only in historical context; the offline pack is sha256-manifested.",
      evidence: "probe/versionDrift · probe/docIdentity · probe/offlinePack (byte-identical rebuild)",
    },
    {
      surface: "Local-first data — storage and secrets",
      posture: "State lives on the machine (SQLite, localStorage); the issuer key rides the OS keychain (Tauri) or a local store; nothing phones home; the web edition is a labeled demo.",
      evidence: "probe/firstrun · src-tauri keyring usage · README honesty contract",
    },
    {
      surface: "Cross-selfimpulse trust — receipt anchoring (17.6)",
      posture: "Only receipts that pass the ONE rulebook can anchor; the anchor is signer-bound (evidence binds the verified chain head + issuer fingerprint); envelopes replay under ECDSA P-256 with a bounded nonce ledger — a second presentation is refused as replayed; storage refusals come back in words.",
      evidence: "probe/crossSelfImpulse (9 tests incl. replay) · probe/interop (two process-isolated machines) · protocol/bridge/bridge-selftest (zero-install 17/17)",
    },
    {
      surface: "Grant authority — bounded delegation, designated unbounded authority, authority provenance (protocol v0.10.7)",
      posture: "An authorization is accepted only from an ATTESTED granter (unrevoked capability declaration or live selfimpulse) — and that granter may only hand out authority it HOLDS: the exact action, a scope token (delegate:<scope> / admin:<scope>), or `*` where it itself carries `*`-class authority. Sub-delegation may narrow, never widen; delegated grants name an attested root and a live parent grant, depth ≤ maxDelegationDepth (default 2); coverage is re-checked at consumption, so a narrowed or revoked issuer stops working; replayed grants are refused. RULE 4: unbounded (`*`-class) authority is never a SELF-CLAIM — a `*`, `delegate:*` or `admin:*` token counts only when the harbour root key or an operator-designated fingerprint (HANDLE_WILDCARD_AUTHORITIES) holds it, and it is never transitive. RULE 5: a capability CLAIM is not a licence — delegable authority comes only from a live grant naming the fingerprint as subject, or a declaration by an operator-authorized identity (HANDLE_AUTHORITIES; the harbour root key always qualifies; the v0.10.5 name HANDLE_WILDCARD_AUTHORITIES is still read), refused otherwise as capability-claim-is-not-authority. RULE 6: a key rotation must prove POSSESSION of the incoming key (a second signature over SI-ROTATE-POP-v1 | oldFp | newFp | ts, bound to the caller fingerprint) so a member cannot squat an offline identity's fingerprint; and a revocation against a DESIGNATED identity is honoured only from an authorised writer (refused as policy:revocation-requires-authority, ignored at consumption), so no member can switch off the principal that hands authority out. Designation follows the identity across a harbour-verified key rotation; grants and revocations stay keyed to the exact fingerprint, so a revoked key cannot rotate out of its own revocation. Posture selector HANDLE_GRANT_POLICY = strict (default) / compat (migration only — reopens the defects) / off (fixtures).",
      evidence: "protocol/wcarena/adversarial-campaign.mjs (14/14 attack classes refused, legitimate control intact; self-contained — it starts its own harbour with an operator-designated identity) · protocol/wcarena/v104-authority-matrix.mjs (10/10 — re-based on given authority: the operator's grants accepted end-to-end, six amplification routes refused) · protocol/wcarena/governance-attacks.mjs (legitimate control permitted; poisoned consent, attacker-supplied mandate, stale replay and forged approval all refused) · protocol/wcarena/warrant-compromise-campaign.mjs (22/22 refused, control intact — RULE 6: rotation possession + revocation authority) · protocol selftest — grant-authority section, 171 checks (run steps: protocol/README-TEST.md) · protocol/THREAT-MODEL.md Decision 3 · benchmark/run.mjs B3",
    },
    {
      surface: "External-agent boundary — the interop CLI (17.10.3)",
      posture: "Non-Patina agents enter through tools/si-interop.mjs: same rulebook as the live product, zero npm dependencies, exit code 1 + refusal in words on any failed proof; transport packs carry proof and identity only — never content.",
      evidence: "probe/interop (tamper + replay refusals across the process boundary) · benchmark/run.mjs B1 (same rulebook)",
    },
    {
      surface: "Content gate — the GuardRail (Warrant-Teams)",
      posture: "One decision seam (src/security/guardrail.ts) in front of every content-bearing surface: tool calls, stored memory, teammate descriptions and cross-selfimpulse payloads are injection-scanned and sanitized; durable memory is capped and injection-poisoned facts are refused outright; the expression sandbox refuses ALL computed member access and ships frozen global facades; SSRF-shaped egress URLs (cloud metadata, link-local, non-http(s)) are refused; approval ids are cryptographically random, single-use and TTL-expiring. Deny by default; findings are refusals, never warnings.",
      evidence: "probe/guardrail.test.ts (pinned PoCs for both sandbox escapes, injection battery, egress refusals) · probe/selfimpulseTeams.test.ts (poisoned description / poisoned task refusals) · probe/a2aV10.test.ts §D (injection refused at the A2A transport before any task state)",
    },
    {
      surface: "A2A v1.0 transport — the remote-agent boundary (Warrant-Teams)",
      posture: "Real Linux-Foundation A2A 1.0.0 wire, not a v1-style shape: agent cards carry NO top-level url/protocolVersion (supportedInterfaces carries them), securitySchemes is a map of discriminated unions, cards are JWS-signed over canonical bytes (any mutation breaks verification) and discovery REFUSES legacy-shape cards. The server binds loopback by default, enforces declared securitySchemes through an authorize hook, content-gates inbound text through the GuardRail before touching task state, refuses replayed request fingerprints within a 30s window, caps bodies at 1 MiB and audits every decision. Cross-selfimpulse delegation over the wire keeps the full ladder: unverified cards carry nothing, injection hard-refuses on BOTH sides, dual SHA-256 digests make the artifact tamper-evident, TTL 10 min, each side's replay registry settles a delegation exactly once.",
      evidence: "probe/a2aV10.test.ts — 53 checks: strict schema, JWS sign/verify + tamper, well-known discovery, message/send + task lifecycle, SSE streaming, push webhooks with Authorization, auth enforcement, replay + injection + egress refusals, and USER 1 ⇄ USER 2 dual-gate delegation over the wire",
    },
  ];
}

export function securityFindings(): { findings: string[]; refusals: string[] } {
  return {
    findings: [
      "No external penetration test or third-party security audit has been performed; this artifact is a self-assessment whose every claim links to machine-checkable evidence in the tree.",
      "The agent OS threat model is single-host, local-first: no multi-tenant server and no network-listening surface. The multi-machine story rides the protocol subtree (device-to-device, transport proven by process-isolated interop probes, not yet by an external network deployment).",
      "The cross-selfimpulse identity persists as a JWK in the injected KV store (localStorage on web, a file for the interop CLI): possession of that store impersonates the agent. This is stated in the stored record itself and is the operator's protection responsibility on a personal device.",
      "Envelope replay protection is per-selfimpulse (a bounded nonce ledger, last 4096 nonces) inside a 5-minute acceptance window — cross-selfimpulse global deduplication is not claimed.",
      "The drill's deterministic seats validate the machinery (loop, gates, receipts) — not frontier-model intelligence; real-model runs are labeled as such where present.",
      "Dependency risk is bounded by the release `npm audit` gate at release time, not continuously monitored after issuance.",
    ],
    refusals: [
      "This artifact does NOT claim regulatory certification (EU AI Act conformity is evidence support, not a certificate).",
      "It does NOT claim the product is free of vulnerabilities — only that named surfaces are gated, evidenced and verifiable.",
      "It does NOT claim model output correctness — verdicts are exit-code-first measurements of what actually ran.",
    ],
  };
}

/** Build the signed artifact (async: the issuer signature is async). */
export async function buildSecurityReview(): Promise<SecurityReview> {
  const base = {
    format: "si-security-review/1" as const,
    issuedAt: new Date().toISOString(),
    product: `SelfImpulse ${ENGINE_VERSION}`,
    scope: securityScope(),
    ...securityFindings(),
  };
  const digest = await digestOf(canonicalBody(base));
  let signature: SecurityReview["signature"] = null;
  try {
    signature = await signHexDigest(digest); // null when no issuer key — stated, never faked
  } catch {
    signature = null;
  }
  return { ...base, digest, signature };
}

/** Verify an artifact: recompute the digest; verify the signature when present. */
export async function verifySecurityReview(
  r: SecurityReview,
): Promise<{ ok: boolean; reasons: string[] }> {
  const reasons: string[] = [];
  if (r.format !== "si-security-review/1") reasons.push(`unknown format: ${r.format}`);
  const body = canonicalBody({ format: r.format, issuedAt: r.issuedAt, product: r.product, scope: r.scope, findings: r.findings, refusals: r.refusals });
  const digest = await digestOf(body);
  if (digest !== r.digest) reasons.push("digest mismatch — the artifact was modified after issuance");
  if (r.signature) {
    const okSig = await verifyIssuerSignature(digest, r.signature.sigHex, r.signature.publicKeyHex);
    if (!okSig) reasons.push("issuer signature does not verify against the embedded public key");
    else reasons.push("issuer signature VALID (key is self-reported — supply the issuer key out-of-band to authenticate the issuer)");
  } else {
    reasons.push("UNSIGNED: no issuer key on the issuing host — digest-stamped only, stated as such");
  }
  return { ok: reasons.every((x) => x.startsWith("issuer signature VALID")) || (reasons.length === 1 && reasons[0].startsWith("UNSIGNED")), reasons };
}
