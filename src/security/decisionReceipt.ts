/**
 * 11h-decision/1 — a SIGNED RECEIPT FOR AN AUTHORIZATION DECISION.
 *
 * The research that motivated this is consistent and uncomfortable: the
 * evidence systems that are actually trusted are the ones that record the
 * REFUSALS, not the successes. A log full of "allowed" lines proves that the
 * machine was awake. What an auditor needs, and what almost nobody keeps, is
 * "on this run, at this moment, for this principal, this rule refused this
 * action, and here is the authority it had at the time" — because every
 * fail-open bug in this product's lineage shows up first as a decision that
 * should not have been made and cannot be reconstructed afterwards.
 *
 * The mission receipt (`mission/receipts.ts`) answers "what happened in this
 * run". It does not answer "was this refusal correct, and was it made under the
 * authority that existed then". A decision receipt closes that gap by binding
 * three things into one signed object:
 *
 *   1. the DECISION     — effect, action, principal, role, and the rule that
 *                         produced it, in words rather than as a bare boolean;
 *   2. the AUTHORITY    — the grant that was in force, so a later reviewer can
 *                         see that the decision was not made under powers the
 *                         principal did not hold;
 *   3. the EVIDENCE     — a digest of the evidence pack the decision was made
 *                         against, so the same decision cannot be replayed
 *                         against different evidence.
 *
 * The third binding is the one that earns the module its place. Without it a
 * receipt is a signed statement with no context: it will verify forever, against
 * any evidence you like, which means it proves nothing. Bound to the pack, it
 * expires the moment the evidence it was made against moves.
 *
 * It is deliberately NOT a general audit log and does not try to be. One
 * decision, one receipt, one signature, and a verification path that needs
 * nothing but the receipt, the issuer public key, and the evidence digest.
 */
import { signChainHash, verifyIssuerSignature } from "../mission/signing";
import type { Evidence, Grant } from "./authority";

/* ── the canonical form ──────────────────────────────────────────────────
 * The same lesson as the mission receipt: object keys are sorted RECURSIVELY
 * before hashing. JSON.stringify's array replacer only sorts the top level, so
 * a shallow sort would produce digests that ignore a nested field's order and
 * therefore ignore a nested field's tampering. */
const enc = new TextEncoder();

function sortDeep(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortDeep);
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v as Record<string, unknown>).sort()) out[k] = sortDeep((v as Record<string, unknown>)[k]);
    return out;
  }
  return v;
}
const canon = (o: unknown): string => JSON.stringify(sortDeep(o));

async function sha256hex(s: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", enc.encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export type DecisionEffect = "allow" | "deny";

export interface DecisionBody {
  /** Stable id of this decision — the journal/approval record it belongs to. */
  decisionId: string;
  /** The principal the decision was about: a seat, a peer, or a human. */
  principal: string;
  /** The action as the runtime named it, e.g. "write", "exec", "delegate". */
  action: string;
  /** The role the principal was judged as — `resolveRole`'s output, never a raw config value. */
  role: string;
  effect: DecisionEffect;
  /** The rule that produced the decision, named. Null only for a bare engine refusal. */
  rule: string | null;
  /** Why, in the words the user would use. */
  reason: string;
  /** The authority in force at decision time. */
  grant: Grant;
  /** The evidence counters as they stood. */
  evidence: Evidence;
  /** SHA-256 over the evidence pack this decision was made against. */
  evidenceDigest: string;
  issuedAt: string;
}

export interface DecisionReceipt {
  format: "11h-decision/1";
  body: DecisionBody;
  /** SHA-256 over the canonical body. The signature is over THIS, not the body text. */
  digest: string;
  issuer: { keyId: string; publicKeyHex: string } | null;
  /** Hex Ed25519 signature over `digest`; null when this runtime cannot sign. */
  signature: string | null;
  /** Present exactly when signature is null — an honest state, never a silent one. */
  signatureNote?: string;
}

/** Digest of an evidence pack. The receipt stores the pack's digest, not the pack. */
export async function evidencePackDigest(pack: unknown): Promise<string> {
  return sha256hex(canon(pack));
}

/**
 * Mint a receipt for one decision.
 *
 * The caller supplies the grant and evidence it actually enforced — this
 * function never re-derives them, because a receipt that recomputes its own
 * inputs proves nothing about what the engine really used. If you cannot name
 * the authority you decided under, that is a bug at the call site, and it shows
 * up here as an empty grant rather than as a plausible-looking record.
 */
export async function buildDecisionReceipt(body: DecisionBody): Promise<DecisionReceipt> {
  const digest = await sha256hex(canon(body));
  const sig = await signChainHash(digest);
  if (sig) {
    return { format: "11h-decision/1", body, digest, issuer: { keyId: sig.keyId, publicKeyHex: sig.publicKeyHex }, signature: sig.sigHex };
  }
  return {
    format: "11h-decision/1",
    body,
    digest,
    issuer: null,
    signature: null,
    signatureNote:
      "This runtime has no Ed25519 (WebCrypto refused or is absent). The receipt is tamper-EVIDENT via its digest but NOT issuer-signed — do not treat it as attested by a key.",
  };
}

export type DecisionVerdict =
  | { ok: true; signed: true; decisionId: string; effect: DecisionEffect }
  | { ok: true; signed: false; decisionId: string; effect: DecisionEffect; reason: string }
  | { ok: false; reason: string };

/**
 * Verify a receipt with nothing but the receipt, the issuer key, and the digest
 * of the evidence pack it claims to answer to.
 *
 * `expectedEvidenceDigest` is the whole point of the format. Pass the pack you
 * actually have; a receipt minted against different evidence will not verify,
 * which is what stops an old "denied" receipt from being used to describe a
 * present in which the same action would now be allowed.
 */
export async function verifyDecisionReceipt(
  rc: DecisionReceipt,
  expectedEvidenceDigest?: string,
): Promise<DecisionVerdict> {
  if (!rc || rc.format !== "11h-decision/1") return { ok: false, reason: "unknown decision-receipt format" };
  const { signature, issuer, body, ...rest } = rc;
  // The digest must cover the body EXACTLY as it stands. A receipt carrying
  // fields outside the signed body is not a receipt with extra notes; it is a
  // different object wearing the same name.
  // signatureNote is exempt, and exempt ONLY when there is no signature: it is
  // the honest explanation of the absence, not a field riding along unsigned.
  const exempt = signature === null && (rc as { signatureNote?: string }).signatureNote !== undefined;
  const extra = Object.keys(rest).filter((k) => k !== "format" && k !== "digest" && !(k === "signatureNote" && exempt));
  if (extra.length > 0) return { ok: false, reason: `receipt carries unsigned field(s): ${extra.join(", ")}` };
  if (signature !== null && (rc as { signatureNote?: string }).signatureNote !== undefined) {
    return { ok: false, reason: "a signed receipt must not also carry a signatureNote" };
  }
  const expected = await sha256hex(canon(body));
  if (expected !== rc.digest) return { ok: false, reason: `digest mismatch — the decision body was altered after signing (expected ${expected.slice(0, 12)}…, got ${String(rc.digest).slice(0, 12)}…)` };
  if (expectedEvidenceDigest !== undefined && body.evidenceDigest !== expectedEvidenceDigest) {
    return {
      ok: false,
      reason: `evidence mismatch — this decision was made against evidence ${body.evidenceDigest.slice(0, 12)}…, not the pack you are holding (${expectedEvidenceDigest.slice(0, 12)}…)`,
    };
  }
  if (body.effect !== "allow" && body.effect !== "deny") {
    return { ok: false, reason: `a decision must be an allow or a deny, not "${String(body.effect)}"` };
  }
  if (!rc.signature) {
    // Honest, and deliberately NOT a pass. A caller that wanted attestation
    // must not be able to get it by accident.
    return {
      ok: true,
      signed: false,
      decisionId: body.decisionId,
      effect: body.effect,
      reason: rc.signatureNote ?? "unsigned receipt: the body digest matches, but no issuer signed it",
    };
  }
  if (!issuer?.publicKeyHex) return { ok: false, reason: "receipt is signed but carries no issuer public key" };
  const sigOk = await verifyIssuerSignature(rc.digest, rc.signature, issuer.publicKeyHex);
  if (!sigOk) return { ok: false, reason: "issuer signature verification FAILED" };
  return { ok: true, signed: true, decisionId: body.decisionId, effect: body.effect };
}

/**
 * The evidence event a decision receipt becomes inside a mission pack.
 *
 * Decisions are recorded as events rather than appended to a side file so the
 * pack's own chain covers them: an event that is not in the chain is an event
 * anyone can edit, and this format is worthless if its receipts are.
 */
export function decisionReceiptEvent(rc: DecisionReceipt, seq: number): {
  seq: number; ts: string; kind: string; seatId: string | null; data: Record<string, unknown>;
} {
  return {
    seq,
    ts: rc.body.issuedAt,
    kind: "decision.receipt",
    seatId: rc.body.principal,
    data: {
      decisionId: rc.body.decisionId,
      action: rc.body.action,
      role: rc.body.role,
      effect: rc.body.effect,
      rule: rc.body.rule,
      reason: rc.body.reason,
      grant: rc.body.grant,
      evidence: rc.body.evidence,
      evidenceDigest: rc.body.evidenceDigest,
      decisionDigest: rc.digest,
      signed: rc.signature !== null,
      issuer: rc.issuer?.keyId ?? null,
    },
  };
}
