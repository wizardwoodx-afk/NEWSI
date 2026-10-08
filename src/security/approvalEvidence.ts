/**
 * CONTENT-BOUND GATE APPROVAL EVIDENCE — SelfImpulse's lift from
 * `open-multi-agent` (MIT, `approval/durable.ts`, `journal/hash.ts`,
 * `journal/verify.ts`, `memory/checkpoint.ts`).
 *
 * WHAT THE UPSTREAM PROVED, AND WHY WE CARE
 * open-multi-agent's durable approvals hash EXACTLY WHAT THE REVIEWER SAW — a
 * canonical digest over the approval content — so a later dispute proves *what*
 * was approved, not merely *that* something was. Its `decide()` refuses a
 * decision whose `requestHash` differs from the stored request
 * (`APPROVAL_STALE_DECISION`), and its checkpoint re-derives that hash on every
 * resume so a pending approval cannot silently follow a drifted state. For a
 * governed agent acting on a business's behalf that is an enterprise property,
 * and it composes directly with our own receipt chain.
 *
 * WHAT ALREADY EXISTED HERE (so this file EXTENDS, never duplicates)
 *   - `src/security/actionGraph.ts` — the codebase's canonical serialiser,
 *     `stableStringify` (recursive key sort). We reuse it verbatim: the whole
 *     value of a content hash is that it does not move with object-key
 *     insertion order, and it already made that promise for the provenance
 *     graph. Two canonical forms would let the same ask hash two ways.
 *   - `src/engine/pureHash.ts` — `pureSha256`, a from-scratch SHA-256 that is
 *     byte-identical to `node:crypto` and runs on Node, Tauri AND the WebView.
 *     We hash with it, not `node:crypto`, so a gate digest computed in the
 *     WebView matches the one an auditor recomputes under Node.
 *   - `src/mission/durable.ts` — the digest-stamped envelope + the uniform KV
 *     adapter (`asKV`/`DurableKV`/`defaultDurableKV`) and the DoneLedger
 *     one-decision discipline. Our ledger reuses that KV seam and that
 *     "one decision wins, a second is refused" rule.
 *   - `src/mission/signing.ts` — the Ed25519 issuer (`signChainHash` /
 *     `verifyIssuerSignature`) that already attests every proof receipt. We
 *     bind the approval evidence under the SAME issuer, so a gate receipt
 *     verifies offline against the exported public key like any other receipt,
 *     and the honest null-signature posture carries over unchanged.
 *   - `src/mission/receipts.ts` — `buildChainedReceipt` folds an event list into
 *     the hash-chained proof receipt. `gateApprovalReceiptEvent` below emits an
 *     event in exactly that shape, so an approval lands INSIDE a run receipt's
 *     chain (cover it with the seal and the signature) rather than beside it.
 *
 * THE HONESTY RULES (inherited, and enforced by this file's shape)
 *   - This module adds EVIDENCE, never AUTHORITY. It computes a digest over the
 *     payload, records a decision that some other code already reached, and
 *     verifies it. It cannot approve, cannot deny, and cannot decide who
 *     satisfies the gate. The native dialog remains the only satisfier; nothing
 *     here is consulted for a proceed/deny outcome.
 *   - A payload that drifted is reported as a loud failure, never coerced into
 *     a pass. `verifyGateApproval` returns `{ ok:false }` with both digests
 *     named when the executed action does not match what the human was shown.
 *   - An unsigned receipt says so (the WebCrypto-absent case), exactly like the
 *     rest of the proof layer: tamper-EVIDENT via its digest, not issuer-ATTESTED.
 */
import { pureSha256 } from "../engine/pureHash";
import { stableStringify } from "./actionGraph";
import { signChainHash, verifyIssuerSignature } from "../mission/signing";
import { asKV, defaultDurableKV, type DurableKVLike } from "../mission/durable";
import type { GateAsk, GateDecision } from "../engine/types";

/* ── canonical digests ───────────────────────────────────────────────────
 * Domain separation by predicate + version tag mirrors actionGraph's
 * `digestOf(kind, content)` so a gate-ask digest can never collide with some
 * other node's digest, and a future format bump changes every old hash rather
 * than quietly reusing it.
 *
 * Determinism, point by point (this is the whole value — a digest that moves
 * with key order or platform proves nothing):
 *   - object keys are sorted at EVERY depth by `stableStringify`, so two
 *     structurally identical asks built by different code paths hash the same;
 *   - ARRAY ORDER IS PRESERVED — `specialistIds` is a routing order and a
 *     reorder is a different decision, so it must change the digest;
 *   - `undefined` fields are dropped (actionGraph already does this), so an
 *     absent reason and a null reason are not conflated but an omitted optional
 *     never leaks insertion order;
 *   - leaf primitives go through `JSON.stringify`, which escapes control
 *     characters and is byte-stable; whitespace INSIDE a shown string is
 *     significant (a relabelled "delete 5 rows" → "delete 5  rows" is a drift),
 *     which is what `summary`/`action` are for;
 *   - the string is UTF-8 encoded by `TextEncoder` and hashed by `pureSha256`,
 *     byte-identical to `node:crypto` on every host (probe/meshRuntime pins
 *     that equivalence) — so the WebView and the auditor agree, exactly. */
export const GATE_EVIDENCE_PREDICATE = "https://selfimpulse.local/gate-approval/v1";
/** The first `prev` of an approval chain — same 64-zero genesis the proof
 *  receipts use, so a chain of gate receipts and a receipt chain read alike. */
export const APPROVAL_GENESIS = "0".repeat(64);

/** The canonical digest over the EXACT payload the human was shown. */
export function canonicalGateDigest(ask: GateAsk): string {
  return pureSha256(`${GATE_EVIDENCE_PREDICATE}\ngate-ask/1\n${stableStringify(ask)}`);
}

/** The canonical digest over a whole decision record — the thing the issuer
 *  signs and the chain links on. */
function canonicalRecordDigest(rec: GateApprovalRecord): string {
  return pureSha256(`${GATE_EVIDENCE_PREDICATE}\ngate-approval-record/1\n${stableStringify(rec)}`);
}

/* ── the decision record ────────────────────────────────────────────────
 * The record retains the shown payload AND its digest: the digest binds what
 * was reviewed, the retained payload lets a verifier recompute the digest (to
 * prove the record itself was not edited) and compare against a later executed
 * ask (to prove what ran is what was approved). This is the open-multi-agent
 * shape — an `ApprovalRequest` carries `content` + `requestHash` — re-expressed
 * in our `GateAsk`/`GateDecision` vocabulary. */
export interface GateApprovalRecord {
  format: "si-gate-approval/1";
  /** sha256 over the canonical `ask` — what the human actually saw. */
  askDigest: string;
  /** The exact presented payload, kept so the digest is recomputable, not asserted. */
  ask: GateAsk;
  /** The gate's outcome as some other code already decided it. Recorded, never derived here. */
  decision: { approved: boolean; reason: string | null };
  /** Who/what satisfied the gate. Attribution only — this file grants nothing. */
  decidedBy: string;
  /** ISO timestamp. */
  decidedAt: string;
}

export interface RecordGateApprovalMeta {
  decidedBy: string;
  /** Deterministic-time seam (probes, and a replay that must re-hash identically). */
  decidedAt?: string;
}

/**
 * Bind a gate ask and the decision that was reached on it into a content-anchored
 * record. Pure and synchronous: the digest is computed here, over the ask exactly
 * as presented, before anything else can touch it.
 */
export function recordGateApproval(
  ask: GateAsk,
  decision: GateDecision,
  meta: RecordGateApprovalMeta,
): GateApprovalRecord {
  const approved = decision.approved === true;
  return {
    format: "si-gate-approval/1",
    askDigest: canonicalGateDigest(ask),
    ask,
    decision: { approved, reason: approved ? null : decision.reason ?? null },
    decidedBy: meta.decidedBy,
    decidedAt: meta.decidedAt ?? new Date().toISOString(),
  };
}

/* ── the signed receipt ────────────────────────────────────────────────
 * The record is minted into a receipt that carries the issuer's Ed25519
 * signature over the canonical record digest, plus the `prev` of the approval
 * chain. It verifies offline with nothing but the receipt and the exported
 * public key — the exact auditor path `verifyProofReceipt` already documents. */
export interface GateApprovalReceipt {
  format: "si-gate-approval-receipt/1";
  record: GateApprovalRecord;
  /** sha256 over the canonical record — the signed bytes. */
  digest: string;
  /** Prior receipt's digest, or APPROVAL_GENESIS. Editing any receipt breaks this. */
  prev: string;
  issuer: { keyId: string; publicKeyHex: string } | null;
  /** Hex Ed25519 signature over `digest`; null when this runtime cannot sign. */
  signature: string | null;
  /** Present exactly when signature is null — an honest state, never a silent one. */
  signatureNote?: string;
}

const UNSIGNED_NOTE =
  "This runtime has no Ed25519 (WebCrypto refused or is absent). The approval is tamper-EVIDENT via its digest but NOT issuer-signed — do not treat it as attested by a key.";

/** Sign one approval record into a receipt. `prev` chains it to the last
 *  approval head (see ApprovalEvidenceLedger). */
export async function sealGateApprovalReceipt(
  record: GateApprovalRecord,
  prev = APPROVAL_GENESIS,
): Promise<GateApprovalReceipt> {
  const digest = canonicalRecordDigest(record);
  const sig = await signChainHash(digest);
  if (sig) {
    return {
      format: "si-gate-approval-receipt/1",
      record,
      digest,
      prev,
      issuer: { keyId: sig.keyId, publicKeyHex: sig.publicKeyHex },
      signature: sig.sigHex,
    };
  }
  return { format: "si-gate-approval-receipt/1", record, digest, prev, issuer: null, signature: null, signatureNote: UNSIGNED_NOTE };
}

/* ── the verifier: does what ran match what was approved? ─────────────── */

export type GateApprovalVerdict =
  | { ok: true; askDigest: string; approved: boolean }
  | { ok: false; reason: string };

/**
 * Prove that a past approval covers the action that is about to be — or was —
 * executed, and fail loudly if the payload drifted.
 *
 * Two independent questions, reported separately so a dispute names which one
 * broke:
 *   1. SELF-INTEGRITY — the ask the record RETAINS must hash to the digest the
 *      record STATES. If not, the record was edited after the human saw it.
 *   2. DRIFT — the ask the record retains must hash the same as the `executedAsk`
 *      the runtime is now holding. If not, the human approved one thing and a
 *      different thing is running. This is the property the whole lift is for:
 *      a decision recorded against digest A cannot verify an execution of B.
 */
export function verifyGateApproval(record: GateApprovalRecord, executedAsk: GateAsk): GateApprovalVerdict {
  const retained = canonicalGateDigest(record.ask);
  if (retained !== record.askDigest) {
    return {
      ok: false,
      reason: `record tampered: the retained ask hashes to ${retained.slice(0, 16)}… but the record claims ${record.askDigest.slice(0, 16)}… — the payload shown to the human was altered after it was recorded.`,
    };
  }
  const executing = canonicalGateDigest(executedAsk);
  if (executing !== record.askDigest) {
    return {
      ok: false,
      reason: `DRIFT — the action executing does not match what was approved: approved ${record.askDigest.slice(0, 16)}…, now attempting ${executing.slice(0, 16)}…. A human must be asked again; this run must not proceed on the old approval.`,
    };
  }
  return { ok: true, askDigest: record.askDigest, approved: record.decision.approved };
}

/**
 * Offline integrity of a single receipt: re-canonicalise the record, re-hash,
 * compare to the stored digest, and (when present) verify the Ed25519 signature
 * with ONLY the issuer public key. No ledger, no mission state — the auditor path.
 */
export async function verifyGateApprovalReceipt(
  rc: GateApprovalReceipt,
): Promise<{ ok: true; signed: boolean; approved: boolean } | { ok: false; reason: string }> {
  if (!rc || rc.format !== "si-gate-approval-receipt/1") return { ok: false, reason: "unknown gate-approval-receipt format" };
  const expected = canonicalRecordDigest(rc.record);
  if (expected !== rc.digest) {
    return { ok: false, reason: `digest mismatch — the approval record was altered after signing (expected ${expected.slice(0, 12)}…, got ${String(rc.digest).slice(0, 12)}…)` };
  }
  const approved = rc.record.decision.approved;
  if (!rc.signature) {
    // Honest, and deliberately NOT attestation: a caller that wanted authorship
    // must not get it by accident.
    return { ok: true, signed: false, approved };
  }
  if (!rc.issuer?.publicKeyHex) return { ok: false, reason: "receipt is signed but carries no issuer public key" };
  const sigOk = await verifyIssuerSignature(rc.digest, rc.signature, rc.issuer.publicKeyHex);
  if (!sigOk) return { ok: false, reason: "issuer signature verification FAILED" };
  return { ok: true, signed: true, approved };
}

export type ApprovalChainVerdict =
  | { ok: true; count: number; signed: boolean }
  | { ok: false; index: number; reason: string };

/**
 * Verify a whole approval chain offline. Each receipt's `prev` must equal the
 * prior receipt's recomputed digest and each record must re-hash to its stored
 * digest — so editing or reordering any earlier approval invalidates every link
 * after it, which is what turns a pile of receipts into a tamper-evident record.
 */
export async function verifyApprovalChain(receipts: readonly GateApprovalReceipt[]): Promise<ApprovalChainVerdict> {
  let prev = APPROVAL_GENESIS;
  for (let i = 0; i < receipts.length; i++) {
    const rc = receipts[i];
    const expected = canonicalRecordDigest(rc.record);
    if (expected !== rc.digest) return { ok: false, index: i, reason: `approval #${i} does not re-hash to its recorded digest` };
    if (rc.prev !== prev) return { ok: false, index: i, reason: `approval #${i} names prev ${String(rc.prev).slice(0, 12)}… but the chain head was ${prev.slice(0, 12)}…` };
    if (rc.signature) {
      if (!rc.issuer?.publicKeyHex) return { ok: false, index: i, reason: `approval #${i} is signed but carries no issuer public key` };
      const sigOk = await verifyIssuerSignature(rc.digest, rc.signature, rc.issuer.publicKeyHex);
      if (!sigOk) return { ok: false, index: i, reason: `approval #${i} issuer signature verification FAILED` };
    }
    prev = rc.digest;
  }
  return { ok: true, count: receipts.length, signed: receipts.some((r) => r.signature !== null) };
}

/* ── the receipt-chain event ───────────────────────────────────────────
 * `src/mission/receipts.ts` folds `Array<{kind, seatId, data}>` into the
 * hash-chained proof receipt (chain + HMAC seal + Ed25519 signature). Emitting
 * the approval as one of those events is the literal binding: the askDigest
 * rides INSIDE the run's signed chain, so the mission receipt proves what the
 * human approved, not merely that a gate ran. `decisionReceipt.ts` uses this
 * same event shape for authority decisions; we mirror it, no duplication. */
export function gateApprovalReceiptEvent(rc: GateApprovalReceipt, seq: number): {
  seq: number; ts: string; kind: string; seatId: string | null; data: Record<string, unknown>;
} {
  return {
    seq,
    ts: rc.record.decidedAt,
    kind: "gate.approval",
    seatId: rc.record.decidedBy,
    data: {
      askDigest: rc.record.askDigest,
      action: rc.record.ask.action,
      riskTier: rc.record.ask.riskTier,
      specialistIds: rc.record.ask.specialistIds,
      approved: rc.record.decision.approved,
      reason: rc.record.decision.reason,
      approvalDigest: rc.digest,
      signed: rc.signature !== null,
      issuer: rc.issuer?.keyId ?? null,
    },
  };
}

/* ── the ledger: what was shown, and the decision that answered it ──────
 * The resume-proof property from open-multi-agent, over our own KV seam
 * (durable.ts `asKV`/`DurableKV`). The sequence mirrors its `ensureRequest` →
 * `decide`: present the ask (stash its digest + payload), and only commit a
 * decision whose payload still hashes to the stashed digest — a drifted state
 * is refused (`... changed after review`) exactly as its `APPROVAL_STALE_DECISION`.
 * A second commit is refused: one decision per ask. This file still decides
 * nothing; it is the evidence drawer, not the gate.
 *
 * The KV adapter exposes only get/set (no key enumeration), so the ledger keeps
 * a small JSON index of decided askDigests. `list()` returns them in that
 * append order — which is the ledger's chronological order — and the integrity
 * of that ordering is NOT taken on faith: `verifyApprovalChain` re-checks each
 * receipt's `prev` against the prior receipt's recomputed digest. */
const LEDGER_PENDING = "si.gate.approval.pending.";
const LEDGER_DECIDED = "si.gate.approval.decided.";
const LEDGER_HEAD = "si.gate.approval.__head__";
const LEDGER_INDEX = "si.gate.approval.__index__";

interface StashedAsk { askDigest: string; ask: GateAsk; presentedAt: string }

export interface LedgerOk { ok: true }
export interface LedgerRefused { ok: false; refused: string }
export type LedgerResult = LedgerOk | LedgerRefused;

export class ApprovalEvidenceLedger {
  private readonly kv;
  constructor(store: DurableKVLike = defaultDurableKV()) {
    this.kv = asKV(store);
  }

  /** Read a value, normalising an absent key to `null`. The KV seam is honest
   *  about storage but not about the missing-key sentinel: a real adapter and a
   *  raw Map handed to `asKV` report absence as `null` and `undefined`
   *  respectively, so an empty string (a cleared pending) and a missing key are
   *  both "nothing here". */
  private read(k: string): string | null {
    return this.kv.get(k) || null;
  }

  /** Record that a gate ask was presented. Idempotent on the exact payload. */
  present(ask: GateAsk, presentedAt = new Date().toISOString()): { ok: true; askDigest: string } {
    const askDigest = canonicalGateDigest(ask);
    if (this.read(LEDGER_PENDING + askDigest) === null) {
      this.kv.set(LEDGER_PENDING + askDigest, JSON.stringify({ askDigest, ask, presentedAt } satisfies StashedAsk));
    }
    return { ok: true, askDigest };
  }

  /** A resumed run asks: is the pending approval still over THIS state? This is
   *  the whole resume-proof — a payload that moved under a still-open gate is
   *  reported rather than silently inherited. */
  matchesPending(askDigest: string, currentAsk: GateAsk): LedgerResult {
    const raw = this.read(LEDGER_PENDING + askDigest);
    if (!raw) return { ok: false, refused: `no pending ask for digest ${askDigest.slice(0, 12)}… — it was never presented, or already decided.` };
    const stashed = JSON.parse(raw) as StashedAsk;
    if (canonicalGateDigest(stashed.ask) !== askDigest) {
      return { ok: false, refused: "the stashed pending ask no longer hashes to its digest — the pending approval was tampered with." };
    }
    if (canonicalGateDigest(currentAsk) !== askDigest) {
      return { ok: false, refused: "the pending ask changed after it was shown; a decision against the old digest is stale and must be re-asked." };
    }
    return { ok: true };
  }

  /** Commit the sealed receipt. Refuses: no matching pending, a drifted pending,
   *  or an ask that already has a decision. Chains on the running head digest. */
  async commit(record: GateApprovalRecord): Promise<GateApprovalReceipt | LedgerRefused> {
    const askDigest = record.askDigest;
    const pending = this.matchesPending(askDigest, record.ask);
    if (!pending.ok) return { ok: false, refused: pending.refused };
    if (this.read(LEDGER_DECIDED + askDigest) !== null) {
      return { ok: false, refused: `approval ${askDigest.slice(0, 12)}… already decided — one decision per ask, first one wins.` };
    }
    const prev = this.read(LEDGER_HEAD) ?? APPROVAL_GENESIS;
    const rc = await sealGateApprovalReceipt(record, prev);
    this.kv.set(LEDGER_DECIDED + askDigest, JSON.stringify(rc));
    this.kv.set(LEDGER_HEAD, rc.digest);
    this.kv.set(LEDGER_INDEX, JSON.stringify(this.indexDigests().concat(askDigest)));
    this.kv.set(LEDGER_PENDING + askDigest, "");
    return rc;
  }

  get(askDigest: string): GateApprovalReceipt | null {
    const raw = this.read(LEDGER_DECIDED + askDigest);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as GateApprovalReceipt;
    } catch {
      return null;
    }
  }

  /** Every decided receipt, in the ledger's append (chronological) order. Chain
   *  integrity is proven by `verifyApprovalChain`, not assumed from here. */
  list(): GateApprovalReceipt[] {
    const out: GateApprovalReceipt[] = [];
    for (const d of this.indexDigests()) {
      const rc = this.get(d);
      if (rc) out.push(rc);
    }
    return out;
  }

  private indexDigests(): string[] {
    const raw = this.kv.get(LEDGER_INDEX);
    if (!raw) return [];
    try {
      const arr = JSON.parse(raw) as unknown;
      return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === "string") : [];
    } catch {
      return [];
    }
  }
}
