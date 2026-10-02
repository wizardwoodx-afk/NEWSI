/**
 * FEDERATION · THE COMMON VIEW — one place to check, two independent stores.
 *
 * THE ASK THIS MODULE ANSWERS. "Put the storage in one common place, so it is
 * easy for both users to check." Taken literally that is a shared server, and it
 * is exactly the thing this architecture refuses: a common STORE is a common
 * TRUST ANCHOR. Whoever holds it can add a row, drop a row, or present a
 * different history to each side — and both parties would have to trust the
 * holder, which for two companies amounts to trusting each other's vendor. The
 * Federation plane exists because that trust does not exist yet.
 *
 * SO THIS MODULE BUILDS THE COMMON VIEW INSTEAD.
 *
 *   Both sides record the SAME joint row for a crossing — the envelope, the
 *   decision, the outcome digest and both receipts — into their OWN store. Each
 *   side then derives a ROOT over its own entries, independently, and the two
 *   roots are exchanged and compared:
 *
 *     roots equal   → a co-signed root record: both sides hold the same set, and
 *                     each proved it from its own store rather than asserting it
 *     roots differ  → `agreed: false`, and the FIRST divergence is named in
 *                     words, down to the crossing id — never averaged away and
 *                     never softened into "sync in progress"
 *
 * `pairLedgerView` is what both users open: the union of the two stores in time
 * order. A crossing only one side holds is MARKED (`initiator-only` /
 * `responder-only`); a crossing both hold with DIFFERENT records is flagged
 * (`disagrees`) and both copies are handed over rather than merged — because
 * merging two different records is how a disagreement gets lost.
 *
 * WHY A MIRROR IS STILL ALLOWED. A neutral third party (an auditor, an insurer)
 * may hold the agreed root. That mirror can prove the sides later diverged —
 * which is the service a neutral party should provide — and it can never assert
 * what is true: it holds one number, not the records, and either side can
 * re-derive its root without it.
 *
 * WHAT A MATCHING ROOT PROVES, AND WHAT IT DOES NOT — in the record itself,
 * because this is the sentence that gets oversold:
 *
 *   ATTESTED      both sides hold the same set of records: each derived this
 *                 root from its own store, and the two roots agree
 *   NOT ATTESTED  that the recorded actions were wise or authorised — agreement
 *                 about what happened is not agreement about what should have
 *                 happened
 *
 * No dependencies beyond the selfimpulse's own SHA-256: runtime-free, WebCrypto-free.
 */
import { pureSha256 } from "../pureHash";

export const LEDGER_FORMAT = "vh.fed.ledger.v1" as const;

export const LEDGER_ATTESTATION =
  "both sides hold the same set of records: each derived this root from its own store, and the two roots agree";

export const LEDGER_NOT_ATTESTED =
  "that the recorded actions were wise or well authorised — agreement about what happened is not agreement about what should have happened";

/** The sentence a UI prints above the shared list. */
export const LEDGER_VIEW_NOTE =
  "one view, two stores: each side keeps its own records, and this is what both of them check — a row only one side holds is marked, not hidden";

/**
 * A JOINT row: what both sides agree to record about one crossing. Both sides
 * write the same row into their own store, which is what makes the two roots
 * comparable at all.
 */
export interface PairLedgerEntry {
  /** The crossing this row is about — the join key between the two stores. */
  crossingId: string;
  envelopeDigest: string;
  capability: string;
  /** "crossed" | "refused" | ... — text, not an enum, so a new verdict cannot be silently unrepresentable. */
  decision: string;
  /** The joint outcome digest from the crossing engine. */
  outcomeDigest: string;
  /** Each side's own receipt digest. Both are recorded by both sides; neither is optional. */
  initiatorReceipt: string;
  responderReceipt: string;
  at: number;
}

function rowCanonical(e: PairLedgerEntry): string {
  return [e.crossingId, e.envelopeDigest, e.capability, e.decision, e.outcomeDigest, e.initiatorReceipt, e.responderReceipt, e.at].join("|");
}

/** Order-canonical: sorted by crossing id, so two stores holding the same set hash the same. */
function sortEntries(entries: PairLedgerEntry[]): PairLedgerEntry[] {
  return [...entries].sort((a, b) => a.crossingId.localeCompare(b.crossingId));
}

/**
 * The root over one store. Derived, never carried: both sides recompute it from
 * their own entries, exactly as an envelope digest is recomputed rather than
 * trusted.
 */
export function ledgerRoot(entries: PairLedgerEntry[]): string {
  const rows = sortEntries(entries).map(rowCanonical);
  return pureSha256(`${LEDGER_FORMAT}:${rows.join("\n")}`);
}

export interface RootRecord {
  pair: string;
  initiatorRoot: string;
  responderRoot: string;
  agreed: boolean;
  /** Present only when the roots differ — the first row the two stores disagree about. */
  firstDivergence?: { crossingId: string; detail: string };
  at: number;
  attests: string;
  notAttested: string;
}

/**
 * Compare the two stores and file the result. Divergence names the first
 * crossing (sorted) where the two sides differ, in words a person can act on —
 * a MISSING row and a CHANGED row are different findings and say so.
 */
export function compareRoots(
  pair: string,
  initiator: { entries: PairLedgerEntry[] },
  responder: { entries: PairLedgerEntry[] },
  at: number,
): RootRecord {
  const initiatorRoot = ledgerRoot(initiator.entries);
  const responderRoot = ledgerRoot(responder.entries);
  const agreed = initiatorRoot === responderRoot;
  const record: RootRecord = {
    pair,
    initiatorRoot,
    responderRoot,
    agreed,
    at,
    attests: LEDGER_ATTESTATION,
    notAttested: LEDGER_NOT_ATTESTED,
  };
  if (agreed) return record;

  const mine = new Map(sortEntries(initiator.entries).map((e) => [e.crossingId, rowCanonical(e)]));
  const theirs = new Map(sortEntries(responder.entries).map((e) => [e.crossingId, rowCanonical(e)]));
  const ids = [...new Set([...mine.keys(), ...theirs.keys()])].sort();
  for (const id of ids) {
    const a = mine.get(id);
    const b = theirs.get(id);
    if (a === b) continue;
    record.firstDivergence = {
      crossingId: id,
      detail:
        a === undefined
          ? `the initiator's store holds no record of crossing ${id}; the responder's does`
          : b === undefined
            ? `the responder's store holds no record of crossing ${id}; the initiator's does`
            : `the two stores disagree about crossing ${id} — same crossing, different record`,
    };
    break;
  }
  return record;
}

/**
 * One row of the shared screen. When the two stores hold the same record the row
 * carries it once; when they differ, BOTH copies are handed over and the row is
 * flagged — never merged, because merging is how a disagreement disappears.
 */
export interface PairLedgerRow {
  crossingId: string;
  at: number;
  seenBy: "both" | "initiator-only" | "responder-only";
  disagrees: boolean;
  initiator?: PairLedgerEntry;
  responder?: PairLedgerEntry;
}

/**
 * THE COMMON PLACE, as a function: the union of both stores in time order, each
 * row saying who holds it. Byte-identical on both sides by construction, because
 * it is derived from the two sets rather than stored anywhere.
 */
export function pairLedgerView(initiator: PairLedgerEntry[], responder: PairLedgerEntry[]): PairLedgerRow[] {
  const seen = new Set<string>();
  const rows: PairLedgerRow[] = [];
  const push = (id: string, side: "initiator" | "responder", entry: PairLedgerEntry) => {
    let row = rows.find((r) => r.crossingId === id);
    if (!row) {
      row = { crossingId: id, at: entry.at, seenBy: side === "initiator" ? "initiator-only" : "responder-only", disagrees: false };
      rows.push(row);
    }
    if (side === "initiator") row.initiator = entry;
    else row.responder = entry;
    row.at = Math.min(row.at, entry.at);
    if (row.initiator && row.responder) {
      row.seenBy = "both";
      row.disagrees = rowCanonical(row.initiator) !== rowCanonical(row.responder);
    }
  };
  for (const e of sortEntries(initiator)) if (!seen.has(`i:${e.crossingId}`)) { seen.add(`i:${e.crossingId}`); push(e.crossingId, "initiator", e); }
  for (const e of sortEntries(responder)) if (!seen.has(`r:${e.crossingId}`)) { seen.add(`r:${e.crossingId}`); push(e.crossingId, "responder", e); }
  return rows.sort((a, b) => (a.at === b.at ? a.crossingId.localeCompare(b.crossingId) : a.at - b.at));
}

/**
 * A neutral party's copy. It holds the AGREED root, not the records — enough to
 * prove later that the two sides diverged, never enough to say what is true.
 */
export interface MirrorAttestation {
  pair: string;
  root: string;
  agreed: boolean;
  heldBy: string;
  at: number;
  attests: string;
  notAttested: string;
}

export function mirrorAttestation(record: RootRecord, heldBy: string, at: number): MirrorAttestation {
  return {
    pair: record.pair,
    root: record.initiatorRoot,
    agreed: record.agreed,
    heldBy,
    at,
    attests: record.agreed
      ? `${LEDGER_ATTESTATION}; this mirror holds the root so a later disagreement can be proved against it`
      : "that the two sides had already diverged when this mirror was written; it holds the initiator's root and the responder's differs",
    notAttested: LEDGER_NOT_ATTESTED,
  };
}

/** Does a later claim still match what the mirror holds? The only question a mirror can answer. */
export function mirrorVerifies(mirror: MirrorAttestation, record: RootRecord): { ok: true } | { ok: false; detail: string } {
  if (mirror.root === record.initiatorRoot && mirror.root === record.responderRoot) return { ok: true };
  return {
    ok: false,
    detail: `the mirror holds ${mirror.root.slice(0, 12)}… for ${mirror.pair}; the stores now derive ${record.initiatorRoot.slice(0, 12)}… and ${record.responderRoot.slice(0, 12)}… — the pair's records changed after the mirror was written`,
  };
}

/** What a receipt may print about a stored row, so a UI never paraphrases it. */
export function ledgerRowSentence(row: PairLedgerRow): string {
  if (row.disagrees) return `crossing ${row.crossingId}: both sides hold a record, and the two records differ — shown unmerged`;
  if (row.seenBy === "both") return `crossing ${row.crossingId}: recorded by both sides, identically`;
  return `crossing ${row.crossingId}: held only by the ${row.seenBy.replace("-only", "")} — the other side has no record of it`;
}
