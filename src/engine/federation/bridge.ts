/**
 * FEDERATION · CROSSING — a cross-owner delegation that both humans decided.
 *
 * WHAT WAS WRONG BEFORE. The alpha's `respondToCrossing()` decided the
 * responder's first crossing by looking at history:
 *
 *     if (!hasCrossedBefore(pair)) { ...refuse... }
 *     // and a ledger row `{ kind: "success", note: "a person at selfimpulse-b
 *     // walked this pair through once already" }` made hasCrossedBefore true
 *
 * So the second side trusted a RECORD as if it were a DECISION. History can
 * show what happened; it cannot show that the human who owns this machine
 * agreed to *this* crossing. This module requires a signed approval from each
 * side, bound to the exact envelope, before anything crosses — and a prior
 * success row does not substitute for one, which is pinned by probe.
 *
 * THE ORDER OF OPERATIONS IS THE SECURITY PROPERTY:
 *
 *   1. the envelope is minted FIRST (CSPRNG id + nonce per side) and digested
 *   2. each SIDE's approval is verified AGAINST THAT DIGEST, so a decision
 *      taken for some other crossing cannot be re-aimed at this one
 *
 * WHO SIGNS, PRECISELY. Each side's approval is signed by that selfimpulse's OWNER
 * AUTHORITY KEY and names the human it acts on behalf of. The crossing's
 * receipts therefore attest: *the owner-controlled key of each selfimpulse approved,
 * naming who authorised it* — and do NOT attest that the named human
 * authenticated with a separate credential. Both sentences travel with every
 * filed approval (`approvalRecord().attests` / `.notAttested`), so a reader is
 * never left to infer the stronger claim.
 *   3. the capability is narrowed separately on each side, by that selfimpulse's
 *      own policy and that pair's standing (SelfImpulseMesh, read live)
 *   4. a crossing happens only if BOTH sides' grants allow it AND both
 *      approvals verified; otherwise the refusal names the side and the rule
 *
 * DISTRIBUTED EVIDENCE, LOCAL TRUST — and the runtime models it, it does not
 * just say it. Two selfimpulses each keep their own trust ledger
 * (`engine.mesh.trust.v1` on each machine). The evidence — envelopes, approvals,
 * receipts — is portable and verifiable by either party; the trust SCORE is
 * local observation and may legitimately differ. So this module takes a
 * standing reader PER SIDE (`standingInitiator` / `standingResponder`): the
 * initiator's grant is computed against the initiator's own local store and the
 * responder's grant against the responder's own local store, and the outcome
 * records which store each tier came from. When a caller has only one machine,
 * one reader serves both sides — and the receipt says `shared: true` rather
 * than pretending two stores agreed.
 *
 * This module reads standing, never writes it: pair trust moves only through
 * SelfImpulseMesh's own `recordJointOutcome`.
 *
 * SCOPE. This is the reference model of a crossing, run where both sides'
 * state can be verified together. In a two-machine deployment each selfimpulse
 * computes its own side's grant locally and exchanges the signed envelope,
 * approvals and receipt this module defines; nothing here claims to be the
 * wire between them.
 */
import { pureSha256 } from "../pureHash";
import { pairKey } from "../selfimpulseMesh";
import { grantForPair, grantAllows, type DelegationCapability, type DelegationGrant, type PairStanding } from "../reach/delegationGrant";
import { keyHandle } from "./identity";
import {
  issueFederationApproval, verifyFederationApproval, consumeApproval, approvalRecord, memoryApprovalLedger,
  APPROVAL_ATTESTATION, APPROVAL_NOT_ATTESTED,
  type ApprovalLedger, type FederationApproval,
} from "./approval";
/* 19.6.6 — the production path: standing authority and the common ledger are
   no longer a verified subsystem beside the bridge; the bridge itself spends
   grants and files joint rows. */
import {
  authoriseUnderGrant, standingAcknowledgement, standingDigest, standingNotice,
  type StandingGrant, type GrantUsage, type StandingRevocation,
} from "./standing";
import { compareRoots, LEDGER_VIEW_NOTE, type PairLedgerEntry, type RootRecord } from "./ledger";

export const CROSSING_FORMAT = "vh.fed.crossing.v1" as const;
/** An envelope that never expires can be decided on forever; this is the default ceiling. */
export const DEFAULT_ENVELOPE_TTL_MS = 10 * 60 * 1000;

export interface CrossingRequest {
  /** CSPRNG id for this crossing. */
  id: string;
  /** The two selfimpulse owners, in the order the caller named them. */
  ownerA: string;
  ownerB: string;
  /** What is being asked for, in words, so a human can decide on it. */
  task: string;
  capability: DelegationCapability;
  at: number;
  expiresAt: number;
}

export interface CrossingEnvelope extends CrossingRequest {
  format: typeof CROSSING_FORMAT;
  /** Order-free pair key — SelfImpulseMesh's, so both sides name the pair identically. */
  pair: string;
  /** One CSPRNG nonce per side: neither human can borrow the other's randomness. */
  nonceInitiator: string;
  nonceResponder: string;
  /** sha256 over everything above. Both sides recompute this; nobody trusts a carried digest. */
  digest: string;
}

export function envelopeCanonical(e: Omit<CrossingEnvelope, "digest">): string {
  return JSON.stringify({
    format: e.format,
    id: e.id,
    ownerA: e.ownerA,
    ownerB: e.ownerB,
    pair: e.pair,
    task: e.task,
    capability: e.capability,
    nonceInitiator: e.nonceInitiator,
    nonceResponder: e.nonceResponder,
    at: e.at,
    expiresAt: e.expiresAt,
  });
}

export interface FederationDeps {
  /** CSPRNG id/nonce source. Default: WebCrypto randomUUID, else getRandomValues. */
  entropy?: () => string;
  now?: () => number;
  /** Pair standing reader. Default: SelfImpulseMesh's live mesh ledger. */
  standing?: (a: string, b: string) => PairStanding;
  /** Single-use ledger for approvals. Default: in-memory, bounded. */
  ledger?: ApprovalLedger;
}

/**
 * CSPRNG only. The alpha's deterministic ids are fine for tests and are
 * labelled as such there; production ids here can never fall back to a
 * counter, because a guessable nonce makes an approval re-aimable.
 */
export function federationEntropy(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  if (c && typeof c.getRandomValues === "function") {
    const bytes = new Uint8Array(16);
    c.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  }
  throw new Error("federation: no CSPRNG in this runtime — refusing to mint guessable crossing ids");
}

/** Mint the envelope. Digest first, then decide — never the other way round. */
export async function openCrossing(
  input: Omit<CrossingRequest, "id" | "expiresAt"> & { id?: string; expiresAt?: number },
  deps: FederationDeps = {},
): Promise<{ ok: true; envelope: CrossingEnvelope } | { ok: false; reason: string; detail: string }> {
  const entropy = deps.entropy ?? federationEntropy;
  const nowMs = deps.now ? deps.now() : Date.now();
  const ownerA = input.ownerA.trim();
  const ownerB = input.ownerB.trim();
  if (ownerA.length === 0 || ownerB.length === 0) {
    return { ok: false, reason: "no-owner", detail: "a crossing names two owners; one of them is missing" };
  }
  if (ownerA === ownerB) {
    return { ok: false, reason: "same-owner", detail: "both ends are the same owner — this is not a cross-owner crossing" };
  }
  const task = input.task.trim();
  if (task.length === 0) {
    return { ok: false, reason: "no-task", detail: "a crossing must state what is being asked for, or nobody can decide it" };
  }
  const id = input.id ?? entropy();
  if (id.trim().length === 0) return { ok: false, reason: "no-id", detail: "the crossing id came back empty from the id source" };
  const nonceInitiator = entropy();
  const nonceResponder = entropy();
  if (nonceInitiator === nonceResponder) {
    return { ok: false, reason: "entropy-collision", detail: "the two sides drew the same nonce — the id source is not behaving like a CSPRNG" };
  }
  const at = input.at ?? nowMs;
  const expiresAt = input.expiresAt ?? at + DEFAULT_ENVELOPE_TTL_MS;
  const body: Omit<CrossingEnvelope, "digest"> = {
    format: CROSSING_FORMAT,
    id,
    ownerA,
    ownerB,
    pair: pairKey(ownerA, ownerB),
    task,
    capability: input.capability,
    nonceInitiator,
    nonceResponder,
    at,
    expiresAt,
  };
  const envelope: CrossingEnvelope = { ...body, digest: pureSha256(`vh.fed.crossing.v1:${envelopeCanonical(body)}`) };
  return { ok: true, envelope };
}

/** Recompute the digest from the body — a carried digest is never trusted. */
export function verifyEnvelope(envelope: CrossingEnvelope): { ok: true } | { ok: false; reason: string; detail: string } {
  const { digest, ...body } = envelope;
  if (body.format !== CROSSING_FORMAT) return { ok: false, reason: "malformed", detail: `envelope format ${String(body.format)} is not ${CROSSING_FORMAT}` };
  const want = pureSha256(`vh.fed.crossing.v1:${envelopeCanonical(body)}`);
  return digest === want
    ? { ok: true }
    : { ok: false, reason: "envelope-tampered", detail: "the envelope digest does not match its body — something moved after it was minted" };
}

export type CrossingRefusal =
  | "envelope-expired"
  | "envelope-tampered"
  | "initiator-human-first"
  | "responder-human-first"
  | "initiator-approval-invalid"
  | "responder-approval-invalid"
  | "initiator-below-standing"
  | "responder-below-standing"
  | "initiator-unknown-capability"
  | "responder-unknown-capability"
  /* 19.6.6 — a standing grant existed but did not cover THIS crossing; the
     designed behaviour is a return to a per-crossing human decision. */
  | "escalated-to-human"
  /* 19.7.0 — the replay guard refused a duplicate submission inside its
     window; nothing was signed twice. */
  | "replay";

export interface CrossingOutcome {
  crossingId: string;
  pair: string;
  capability: DelegationCapability;
  status: "crossed" | "refused";
  reason: CrossingRefusal | "crossed";
  /** In words, naming the side and the rule — the line a human reads. */
  detail: string;
  at: number;
  envelopeDigest: string;
  tierInitiator: PairStanding;
  tierResponder: PairStanding;
  /**
   * Which local trust store each tier was read from. `shared` is TRUE only when
   * both sides read the same store — a one-machine caller. When it is false,
   * the two tiers are genuinely independent local observations, and a refusal
   * naming one side means that side's own store said no.
   */
  standingSource: { initiator: string; responder: string; shared: boolean };
  grants: { initiator: DelegationGrant; responder: DelegationGrant };
  approvals: ReturnType<typeof approvalRecord>[];
  /**
   * What this crossing's approvals prove, and what they do not. Repeated at the
   * top level so a UI that renders an outcome without walking `approvals` still
   * has both sentences in hand.
   */
  attestation: { attests: string; notAttested: string };
  /**
   * 19.6.6 — present when this crossing rode a standing grant: the grant's
   * digest, the two per-side acknowledgements (bound to THIS envelope digest
   * and THIS side's nonce), the usage counters AFTER the spend, and both
   * halves of what a standing acknowledgement does and does not attest.
   */
  standing?: {
    grantDigest: string;
    acknowledgements: ReturnType<typeof standingAcknowledgement>[];
    usageAfter: { initiator: GrantUsage; responder: GrantUsage };
    notice: string;
    attests: string;
    notAttested: string;
  };
  /**
   * 19.6.6 — the joint row this crossing asks BOTH stores to write, and the
   * root comparison over each store plus that row. Equal roots say both hold
   * the same set; divergence is named in words down to the crossing id.
   */
  commonLedger?: { entry: PairLedgerEntry; record: RootRecord; viewNote: typeof LEDGER_VIEW_NOTE };
  /** sha256 over the whole decision — filed with the run's receipts. */
  digest: string;
}

export interface CrossingParties {
  envelope: CrossingEnvelope;
  /** The two owners, named as they are on each machine. */
  initiator: string;
  responder: string;
  /** Each side's own public key — the responder never trusts the initiator's copy of it. */
  initiatorPublicKeyPem: string;
  responderPublicKeyPem: string;
  /**
   * Each side's approval. Absent means no owner key approved for that side —
   * which refuses. The approval names a human; the signature is the selfimpulse's
   * owner key (see `approval.ts` for what that does and does not prove).
   */
  initiatorApproval?: FederationApproval | null;
  responderApproval?: FederationApproval | null;
}

/**
 * How one selfimpulse reads a pair's standing FROM ITS OWN LOCAL STORE. Two selfimpulses
 * supply two readers; a single-machine caller supplies one for both sides and
 * the outcome records that fact.
 */
export type StandingReader = (a: string, b: string) => PairStanding;

export interface CrossingWiring {
  /** The INITIATOR selfimpulse's local trust store. Defaults to the live SelfImpulseMesh ledger on this machine. */
  standingInitiator?: StandingReader;
  /** The RESPONDER selfimpulse's local trust store. Defaults to the same local ledger. */
  standingResponder?: StandingReader;
  /**
   * Legacy/compat: one reader used for BOTH sides. Pass this only when both
   * sides genuinely share one local store (the single-machine case); the
   * outcome then reports `shared: true`. Prefer the two side-specific readers:
   * a single reader cannot express two stores disagreeing.
   */
  standing?: StandingReader;
  /** Human labels for the two stores, so a receipt can name them. */
  stores?: { initiator?: string; responder?: string };
  /**
   * 19.6.6 — a standing grant both owners signed once. When present and BOTH
   * sides authorise under it, the crossing proceeds without per-crossing
   * approvals; anything out of scope escalates back to a human decision.
   */
  standingGrant?: StandingGrant | null;
  /** The usage counters the runtime holds beside its ledger. Absent = fresh. */
  standingUsage?: { initiator?: GrantUsage; responder?: GrantUsage };
  /** Revocations the runtime knows of — either side, alone, at any time. */
  standingRevocations?: StandingRevocation[];
  /** The two stores' joint rows so far; the outcome's commonLedger builds on these. */
  ledgers?: { initiator: PairLedgerEntry[]; responder: PairLedgerEntry[] };
  ledger?: ApprovalLedger;
  now?: () => number;
}

/**
 * Run the crossing. Both sides are symmetric by construction: same approval
 * object, same binding, same rule. There is no code path in which a prior
 * ledger row, a past success, or a caller's assertion stands in for a human
 * decision on either side.
 */
export async function crossFederation(parties: CrossingParties, wiring: CrossingWiring = {}): Promise<CrossingOutcome> {
  const { envelope } = parties;
  const now = wiring.now ? wiring.now() : Date.now();
  const ledger = wiring.ledger ?? memoryApprovalLedger();
  /* The default standing reader is SelfImpulseMesh's live ledger — a pair earns its
     tier by co-signing receipts, and nothing else moves it. `requested: []`
     asks for no capability; this call exists only to read the tier. */
  const localLedger: StandingReader =
    (a, b) => grantForPair({ ownerA: a, ownerB: b, requested: [], at: new Date(now).toISOString() }).tier;

  /* TWO READERS, ONE PER SIDE. The responder's tier must come from the
     responder's own store, or "local trust state" is a claim this function
     cannot honour. `wiring.standing` is honoured for BOTH sides only so that
     single-machine callers keep working, and the outcome says so. */
  const readInitiator = wiring.standingInitiator ?? wiring.standing ?? localLedger;
  const readResponder = wiring.standingResponder ?? wiring.standing ?? localLedger;
  const sharedStore = readInitiator === readResponder;
  const standingSource = {
    initiator: wiring.stores?.initiator ?? (readInitiator === localLedger ? "this machine's SelfImpulseMesh ledger" : sharedStore ? "the shared local store" : "the initiator's local store"),
    responder: wiring.stores?.responder ?? (readResponder === localLedger ? "this machine's SelfImpulseMesh ledger" : sharedStore ? "the shared local store" : "the responder's local store"),
    shared: sharedStore,
  };

  const atIso = new Date(envelope.at).toISOString();
  /* Each side's grant is computed from ITS OWN approval and nothing else: the
     initiator's decision never buys the responder a capability, and a missing
     approval is passed through as an empty list rather than a shortcut. Each
     side's STANDING is likewise read from its own store. */
  const grantInitiator = grantForPair(
    {
      ownerA: parties.initiator, ownerB: parties.responder, requested: [envelope.capability], at: atIso,
      approvals: parties.initiatorApproval
        ? [{ capability: envelope.capability, approvalId: parties.initiatorApproval.approvalId, at: new Date(parties.initiatorApproval.decidedAt).toISOString() }]
        : [],
    },
    { standing: readInitiator },
  );
  const grantResponder = grantForPair(
    {
      ownerA: parties.initiator, ownerB: parties.responder, requested: [envelope.capability], at: atIso,
      approvals: parties.responderApproval
        ? [{ capability: envelope.capability, approvalId: parties.responderApproval.approvalId, at: new Date(parties.responderApproval.decidedAt).toISOString() }]
        : [],
    },
    { standing: readResponder },
  );

  /** Name the store that refused, and say it plainly when the two stores disagree. */
  const refusalDetail = (side: "initiator" | "responder", why: string): string => {
    const store = side === "initiator" ? standingSource.initiator : standingSource.responder;
    const other = side === "initiator" ? standingSource.responder : standingSource.initiator;
    const base = `the ${side}'s own local trust store (${store}) lends this pair nothing: ${why}`;
    return sharedStore
      ? base
      : `${base} — read from the ${side}'s store (${store}), not the other side's (${other}); local trust state is per machine and the two are free to disagree`;
  };

  const finish = (
    status: "crossed" | "refused",
    reason: CrossingOutcome["reason"],
    detail: string,
    approvals: ReturnType<typeof approvalRecord>[],
    extra?: { standing?: CrossingOutcome["standing"]; receipts?: { initiator: string; responder: string } },
  ): CrossingOutcome => {
    const body = {
      crossingId: envelope.id,
      pair: envelope.pair,
      capability: envelope.capability,
      status,
      reason,
      detail,
      at: now,
      envelopeDigest: envelope.digest,
      tierInitiator: grantInitiator.tier,
      tierResponder: grantResponder.tier,
      standingSource,
      grants: { initiator: grantInitiator, responder: grantResponder },
      approvals,
      attestation: extra?.standing
        ? { attests: extra.standing.attests, notAttested: extra.standing.notAttested }
        : { attests: APPROVAL_ATTESTATION, notAttested: APPROVAL_NOT_ATTESTED },
      ...(extra?.standing ? { standing: extra.standing } : {}),
    };
    const decisionDigest = pureSha256(`vh.fed.outcome.v1:${JSON.stringify(body)}`);
    /* 19.6.6 — the common ledger rides every outcome the runtime supplies
       stores for: both sides are asked to write the SAME joint row, and the
       roots over each store plus that row are compared here, so divergence
       is visible on the receipt itself, not discovered later. */
    let commonLedger: CrossingOutcome["commonLedger"];
    if (wiring.ledgers) {
      const entry: PairLedgerEntry = {
        crossingId: envelope.id,
        envelopeDigest: envelope.digest,
        capability: envelope.capability,
        decision: status,
        outcomeDigest: decisionDigest,
        /* empty receipt = nothing was minted (a refusal); both stores write
           the same empty string, so an honest "nothing" still compares. */
        initiatorReceipt: extra?.receipts?.initiator ?? "",
        responderReceipt: extra?.receipts?.responder ?? "",
        at: now,
      };
      commonLedger = {
        entry,
        record: compareRoots(
          envelope.pair,
          { entries: [...wiring.ledgers.initiator, entry] },
          { entries: [...wiring.ledgers.responder, entry] },
          now,
        ),
        viewNote: LEDGER_VIEW_NOTE,
      };
    }
    const full = { ...body, ...(commonLedger ? { commonLedger } : {}) };
    return { ...full, digest: pureSha256(`vh.fed.outcome.v1:${JSON.stringify(full)}`) };
  };

  /* ── 0. the envelope is re-derived, never taken on trust ───────────────── */
  const envelopeCheck = verifyEnvelope(envelope);
  if (!envelopeCheck.ok) return finish("refused", "envelope-tampered", envelopeCheck.detail, []);
  if (now > envelope.expiresAt) {
    return finish("refused", "envelope-expired", `this crossing expired at ${new Date(envelope.expiresAt).toISOString()} and nobody decided inside the window`, []);
  }

  /* ── 1. standing, on both sides, before any approval is spent ──────────── */
  if (grantInitiator.refused.some((r) => r.rule === "quarantined")) {
    return finish("refused", "initiator-below-standing", refusalDetail("initiator", grantInitiator.refused[0]?.why ?? ""), []);
  }
  if (grantResponder.refused.some((r) => r.rule === "quarantined")) {
    return finish("refused", "responder-below-standing", refusalDetail("responder", grantResponder.refused[0]?.why ?? ""), []);
  }
  if (grantInitiator.refused.some((r) => r.rule === "not-a-capability")) {
    return finish("refused", "initiator-unknown-capability", `${envelope.capability} is not a capability either side has a policy for`, []);
  }
  if (grantResponder.refused.some((r) => r.rule === "not-a-capability")) {
    return finish("refused", "responder-unknown-capability", `${envelope.capability} is not a capability either side has a policy for`, []);
  }
  if (grantInitiator.refused.some((r) => r.rule === "below-standing")) {
    return finish("refused", "initiator-below-standing", refusalDetail("initiator", grantInitiator.refused.find((r) => r.rule === "below-standing")?.why ?? ""), []);
  }
  if (grantResponder.refused.some((r) => r.rule === "below-standing")) {
    return finish("refused", "responder-below-standing", refusalDetail("responder", grantResponder.refused.find((r) => r.rule === "below-standing")?.why ?? ""), []);
  }

  /* ── 1b. 19.6.6 — STANDING AUTHORITY on the live path. When BOTH owners
     approved once under a grant and neither per-crossing approval rides this
     envelope, the grant is the authorisation — and the evidence is unchanged:
     this envelope, these nonces, one acknowledgement per side, usage spent,
     out-of-scope escalated. When the grant does not cover the crossing, the
     refusal names the escalation back to a human; autonomy never extends by
     inference. Per-crossing approvals, when present, keep the older path. ── */
  if (wiring.standingGrant && !parties.initiatorApproval && !parties.responderApproval) {
    const g = wiring.standingGrant;
    const vI = authoriseUnderGrant(g, wiring.standingUsage?.initiator, {
      pair: envelope.pair, side: "initiator", capability: envelope.capability,
      envelopeDigest: envelope.digest, nonce: envelope.nonceInitiator,
    }, now, wiring.standingRevocations);
    const vR = authoriseUnderGrant(g, wiring.standingUsage?.responder, {
      pair: envelope.pair, side: "responder", capability: envelope.capability,
      envelopeDigest: envelope.digest, nonce: envelope.nonceResponder,
    }, now, wiring.standingRevocations);
    if (vI.ok && vR.ok) {
      const ackI = standingAcknowledgement(vI.authorisation);
      const ackR = standingAcknowledgement(vR.authorisation);
      const standing = {
        grantDigest: standingDigest(g),
        acknowledgements: [ackI, ackR],
        usageAfter: { initiator: vI.usage, responder: vR.usage },
        notice: standingNotice(g, vI.usage),
        attests: ackI.attests,
        notAttested: ackI.notAttested,
      };
      if (!grantAllows(grantInitiator, envelope.capability) || !grantAllows(grantResponder, envelope.capability)) {
        return finish("refused", "escalated-to-human",
          `standing grant ${g.grantId} is bounded to its enumerated capabilities and the pair's policy standing does not lend ${envelope.capability} — escalated to a per-crossing human decision`,
          [], { standing, receipts: { initiator: ackI.digest, responder: ackR.digest } });
      }
      return finish("crossed", "crossed",
        `${envelope.capability} crossed between ${envelope.pair} under standing grant ${g.grantId}: both owners approved once and named their bounds; this crossing kept its own envelope, nonces and acknowledgements; ${standing.notice}`,
        [], { standing, receipts: { initiator: ackI.digest, responder: ackR.digest } });
    }
    const esc = !vI.ok ? vI : vR as Extract<typeof vR, { ok: false }>;
    return finish("refused", "escalated-to-human",
      `standing grant ${g.grantId} did not authorise this crossing (${esc.reason}: ${esc.detail}) — it returns to a per-crossing human decision; a spent, lapsed or revoked grant is a human's business now`,
      [], {});
  }

  /* ── 2. the humans. Both sides, same object, bound to THIS envelope ────── */
  const filed: ReturnType<typeof approvalRecord>[] = [];

  const initiatorVerdict = await verifyFederationApproval(
    parties.initiatorApproval,
    { pair: envelope.pair, side: "initiator", capability: envelope.capability, envelopeDigest: envelope.digest, nonce: envelope.nonceInitiator },
    parties.initiatorPublicKeyPem,
    now,
  );
  if (!initiatorVerdict.ok) {
    const needsHuman = grantInitiator.refused.some((r) => r.rule === "human-first");
    const reason: CrossingRefusal = initiatorVerdict.reason === "malformed" && needsHuman ? "initiator-human-first" : "initiator-approval-invalid";
    const detail = initiatorVerdict.reason === "malformed" && needsHuman
      ? `${envelope.capability} changes the initiator's selfimpulse, so its owner must approve it by name: ${initiatorVerdict.detail}. A previous successful crossing is a record, not a decision.`
      : `the initiator's approval does not hold: ${initiatorVerdict.reason} — ${initiatorVerdict.detail}`;
    return finish("refused", reason, detail, filed);
  }

  const responderVerdict = await verifyFederationApproval(
    parties.responderApproval,
    { pair: envelope.pair, side: "responder", capability: envelope.capability, envelopeDigest: envelope.digest, nonce: envelope.nonceResponder },
    parties.responderPublicKeyPem,
    now,
  );
  if (!responderVerdict.ok) {
    const needsHuman = grantResponder.refused.some((r) => r.rule === "human-first");
    const reason: CrossingRefusal = responderVerdict.reason === "malformed" && needsHuman ? "responder-human-first" : "responder-approval-invalid";
    const detail = responderVerdict.reason === "malformed" && needsHuman
      ? `${envelope.capability} changes the responder's selfimpulse, so its owner must approve it by name: ${responderVerdict.detail}. A previous successful crossing is a record, not a decision.`
      : `the responder's approval does not hold: ${responderVerdict.reason} — ${responderVerdict.detail}`;
    return finish("refused", reason, detail, filed);
  }

  /* ── 3. capability, intersected on both sides ──────────────────────────── */
  if (!grantAllows(grantInitiator, envelope.capability)) {
    return finish("refused", "initiator-below-standing", `${refusalDetail("initiator", `its policy does not lend ${envelope.capability} at ${grantInitiator.tier}`)}`, []);
  }
  if (!grantAllows(grantResponder, envelope.capability)) {
    return finish("refused", "responder-below-standing", `${refusalDetail("responder", `its policy does not lend ${envelope.capability} at ${grantResponder.tier}`)}`, []);
  }

  /* ── 4. single use: both decisions are spent together, verified first ──── */
  const spendInitiator = await consumeApproval(initiatorVerdict.approval, { pair: envelope.pair, side: "initiator", capability: envelope.capability, envelopeDigest: envelope.digest, nonce: envelope.nonceInitiator }, parties.initiatorPublicKeyPem, now, ledger);
  if (!spendInitiator.ok) return finish("refused", "initiator-approval-invalid", spendInitiator.detail, filed);
  const spendResponder = await consumeApproval(responderVerdict.approval, { pair: envelope.pair, side: "responder", capability: envelope.capability, envelopeDigest: envelope.digest, nonce: envelope.nonceResponder }, parties.responderPublicKeyPem, now, ledger);
  if (!spendResponder.ok) return finish("refused", "responder-approval-invalid", spendResponder.detail, filed);

  /* Both records carry the recognition handle of the key that actually signed,
     so a receipt shows WHICH key approved and WHICH human it named — the two
     halves of "on behalf of", side by side. */
  filed.push(
    approvalRecord(initiatorVerdict.approval, { publicKeyPem: parties.initiatorPublicKeyPem, handle: keyHandle(parties.initiatorPublicKeyPem) }),
    approvalRecord(responderVerdict.approval, { publicKeyPem: parties.responderPublicKeyPem, handle: keyHandle(parties.responderPublicKeyPem) }),
  );
  return finish(
    "crossed",
    "crossed",
    `${envelope.capability} crossed between ${envelope.pair}: the owner key of each selfimpulse approved it, naming who authorised it, both selfimpulses lend the capability at their own standing, and both approvals are now spent`,
    filed,
    { receipts: { initiator: filed[0]?.digest ?? "", responder: filed[1]?.digest ?? "" } },
  );
}

/**
 * Sign a decision for one side of a crossing: the selfimpulse's owner authority key
 * approves, naming the human it acts on behalf of. The name is recorded; it is
 * not an independent human credential, and nothing here claims one.
 */
export async function decideCrossing(
  envelope: CrossingEnvelope,
  side: "initiator" | "responder",
  human: string,
  keys: Parameters<typeof issueFederationApproval>[1],
  opts: { approvalId?: string; entropy?: () => string; now?: () => number; ttlMs?: number } = {},
): Promise<ReturnType<typeof issueFederationApproval>> {
  const entropy = opts.entropy ?? federationEntropy;
  const nowMs = opts.now ? opts.now() : Date.now();
  return issueFederationApproval(
    {
      v: "vh.fed.approval.v1",
      approvalId: opts.approvalId ?? entropy(),
      pair: envelope.pair,
      side,
      capability: envelope.capability,
      envelopeDigest: envelope.digest,
      nonce: side === "initiator" ? envelope.nonceInitiator : envelope.nonceResponder,
      human: human.trim(),
      decidedAt: nowMs,
      expiresAt: envelope.expiresAt + (opts.ttlMs ?? 0),
    },
    keys,
  );
}
