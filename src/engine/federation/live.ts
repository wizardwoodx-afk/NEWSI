/**
 * FEDERATION · LIVE SEAM — 19.6.6.
 *
 * The production path the release record now claims: standing authority,
 * the common ledger and regulated activation are NOT a verified subsystem
 * beside the bridge — this module puts them ON the crossing the console
 * runs, and the generalist's router consults the regulated gate before a
 * regulated specialist can execute.
 *
 * Single-machine truth, stated: one selfimpulse plays both sides here, so one
 * owner key signs both halves and the stores are two arrays on one machine.
 * The outcome reports `standingSource.shared: true` in that case — the
 * receipt says it is one machine, because it is.
 *
 * Everything persists locally and honestly: grants, usage counters, joint
 * rows, revocations and the regulated activation ride named localStorage
 * keys; a missing store is an empty store, never a silent zero.
 */
import {
  openCrossing, crossFederation,
  type CrossingOutcome, type StandingReader,
} from "./bridge";
import {
  STANDING_FORMAT, issueStandingGrant, freshGrantUsage, revokeStandingGrant,
  type StandingGrant, type GrantUsage, type StandingRevocation,
} from "./standing";
import { pairLedgerView, type PairLedgerEntry, type PairLedgerRow } from "./ledger";
import {
  issueRegulatedActivation, verifyRegulatedActivation, activationGaps, regulatedNotice,
  type SignedRegulatedActivation,
} from "./regulatedPolicy";
import type { OwnerKeyPairWeb } from "../authorityWeb";
import { authorityOwnerIdentity, type OwnerIdentity } from "../missionAuthority";
import { pairKey, meshStanding } from "../selfimpulseMesh";
import { standingFor } from "../meshRuntime";
import type { PairStanding } from "../reach/delegationGrant";
import { FEDERATION_REGISTERED, REGULATED_REGISTERED } from "./fleet";
import { REGULATED_BATCH_DOMAINS } from "./regulatedSpec";
import { DELEGATION_CAPABILITIES, type DelegationCapability } from "../reach/delegationGrant";

export const FED_LIVE_GRANT = "vh.fed.live.grant.v1";
export const FED_LIVE_USAGE = "vh.fed.live.usage.v1";
export const FED_LIVE_LEDGER_I = "vh.fed.live.ledger.initiator.v1";
export const FED_LIVE_LEDGER_R = "vh.fed.live.ledger.responder.v1";
export const FED_LIVE_REVOCATIONS = "vh.fed.live.revocations.v1";
export const REGULATED_ACTIVATION_KEY = "vh.regulated.activation.v1";

/* ── 19.7.0 — the replay guard ────────────────────────────────────────────
 * An A2A crossing is a state-changing, signed action. The 19.6 hardening
 * made approvals owner-key and reproducible inside a short window; what a
 * dup click (or a hostile retry of a captured request) could still do is
 * submit the SAME crossing twice. The guard: an in-memory ring of request
 * signatures — (pair, capability, task) — where a repeat inside the window
 * is REFUSED in words before anything is signed or opened. The window is
 * short by design: re-running the same task a minute later is a legitimate
 * owner decision, not a replay. Module memory only: a restart genuinely is
 * a new session, and the guard says so rather than pretending persistence. */
const REPLAY_WINDOW_MS = 60_000;
const replayRing = new Map<string, { at: number; seen: number }>();

function replaySignature(ownerA: string, ownerB: string, capability: string, task: string): string {
  const basis = `${pairKey(ownerA, ownerB)}|${capability}|${task.trim().replace(/\s+/g, " ")}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < basis.length; i++) { h ^= basis.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16);
}

export function replayGuardCheck(ownerA: string, ownerB: string, capability: string, task: string, now: () => Date = () => new Date()): { ok: true } | { ok: false; reason: string; seenAt: number; seen: number } {
  const t = now().getTime();
  for (const [k, v] of replayRing) if (t - v.at > REPLAY_WINDOW_MS) replayRing.delete(k);
  const sig = replaySignature(ownerA, ownerB, capability, task);
  const hit = replayRing.get(sig);
  if (hit && t - hit.at <= REPLAY_WINDOW_MS) {
    return { ok: false, reason: `replay-guard: this exact crossing request was submitted ${Math.round((t - hit.at) / 1000)}s ago (seen ${hit.seen}×) — nothing was signed twice inside the ${REPLAY_WINDOW_MS / 1000}s window; resubmit after it if you truly mean a second run`, seenAt: hit.at, seen: hit.seen };
  }
  replayRing.set(sig, { at: t, seen: (hit?.seen ?? 0) + 1 });
  return { ok: true };
}

export function replayGuardStats(): { entries: number; windowMs: number } {
  return { entries: replayRing.size, windowMs: REPLAY_WINDOW_MS };
}

export function resetReplayGuard(): void {
  replayRing.clear();
}

const read = <T,>(key: string, fallback: T): T => {
  try {
    const raw = globalThis.localStorage?.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
};
const write = (key: string, value: unknown): void => {
  try {
    globalThis.localStorage?.setItem(key, JSON.stringify(value));
  } catch {
    /* no storage ⇒ this session only; stated, not hidden */
  }
};

/* ── the owner key — through the HARDENED authority seam, never raw ──────
   The private key is resolved by missionAuthority's owner-key service:
   native keychain (desktop) > passphrase-encrypted store > session-only.
   This module mints NO key storage of its own; a session-scoped key is
   stated as session-scoped, and a spent or unverifiable grant escalates
   to a human instead of being re-signed by a stranger key. */
export const LIVE_FEDERATION_OWNER = "si-owner";

export async function liveOwnerIdentity(): Promise<OwnerIdentity> {
  return authorityOwnerIdentity({ identity: LIVE_FEDERATION_OWNER });
}

export async function liveOwnerKeys(): Promise<OwnerKeyPairWeb> {
  return (await liveOwnerIdentity()).keys;
}

/* ── standing grant, issued once, spent per crossing ────────────────────── */
export const liveGrant = (): StandingGrant | null => read<StandingGrant | null>(FED_LIVE_GRANT, null);
export const liveUsage = (grant: StandingGrant | null): { initiator: GrantUsage; responder: GrantUsage } | null =>
  grant ? read(FED_LIVE_USAGE, { initiator: freshGrantUsage(grant, Date.now()), responder: freshGrantUsage(grant, Date.now()) }) : null;
export const liveRevocations = (): StandingRevocation[] => read<StandingRevocation[]>(FED_LIVE_REVOCATIONS, []);

/** The pair ledger is pair-scoped by name: one row list per pair, per side. */
export type LiveLedgerStore = Record<string, PairLedgerEntry[]>;
export const liveLedgerStores = (): { initiator: LiveLedgerStore; responder: LiveLedgerStore } => ({
  initiator: read<LiveLedgerStore>(FED_LIVE_LEDGER_I, {}),
  responder: read<LiveLedgerStore>(FED_LIVE_LEDGER_R, {}),
});
export const livePairLedgers = (pair: string): { initiator: PairLedgerEntry[]; responder: PairLedgerEntry[] } => {
  const s = liveLedgerStores();
  return { initiator: s.initiator[pair] ?? [], responder: s.responder[pair] ?? [] };
};

/* ── the pair's standing, read from BOTH planes of co-signed history ──────
   The mesh trust store is the 19.5.x plane. The federation plane adds its
   own co-signed evidence: every joint row BOTH stores hold, and the live
   standing grant itself — each counts as one trust unit, and the mesh's own
   ladder decides the tier. A grant never overrides earned standing; it only
   adds to the record the ladder reads. */
export function liveStandingUnits(pair: string, now = Date.now()): number {
  const s = livePairLedgers(pair);
  const heldByResponder = new Set(s.responder.map((r) => `${r.crossingId}|${r.outcomeDigest}`));
  let units = 0;
  for (const row of s.initiator) {
    if (row.decision === "crossed" && heldByResponder.has(`${row.crossingId}|${row.outcomeDigest}`)) units += 1;
  }
  const g = liveGrant();
  if (g && g.pair === pair && now < g.expiresAt && !liveRevocations().some((r) => r.grantId === g.grantId)) units += 1;
  return units;
}

export function liveStandingFor(pair: string, a: string, b: string, now = Date.now()): PairStanding {
  const units = liveStandingUnits(pair, now);
  if (units === 0) return standingFor(a, b);
  return meshStanding({ pairKey: pair, trust: units, jointReceipts: units, divergences: 0 });
}

export interface LiveGrantResult {
  ok: boolean;
  grant?: StandingGrant;
  refusal?: string;
}

export async function issueLiveGrant(opts: {
  capabilities: DelegationCapability[];
  maxCrossings: number;
  windowMs: number;
  windowMax: number;
  expiresInMs: number;
  initiatorHuman: string;
  responderHuman: string;
  pair?: string;
}): Promise<LiveGrantResult> {
  const keys = await liveOwnerKeys();
  const now = Date.now();
  const issued = await issueStandingGrant(
    {
      v: STANDING_FORMAT,
      grantId: crypto.randomUUID ? crypto.randomUUID() : `grant-${now}`,
      /* the order-free pair key the crossing envelope will carry — both
         sides name the pair identically, so the grant can only ever cover
         crossings of exactly this pair. */
      pair: opts.pair ?? pairKey(opts.initiatorHuman, opts.responderHuman),
      capabilities: opts.capabilities,
      initiatorHuman: opts.initiatorHuman,
      responderHuman: opts.responderHuman,
      maxCrossings: opts.maxCrossings,
      windowMs: opts.windowMs,
      windowMax: opts.windowMax,
      issuedAt: now,
      expiresAt: now + opts.expiresInMs,
      onOutOfScope: "escalate",
    },
    keys,
    keys,
  );
  if (!issued.ok) return { ok: false, refusal: `${issued.reason}: ${issued.detail}` };
  write(FED_LIVE_GRANT, issued.grant);
  write(FED_LIVE_USAGE, { initiator: freshGrantUsage(issued.grant, now), responder: freshGrantUsage(issued.grant, now) });
  return { ok: true, grant: issued.grant };
}

export function revokeLiveGrant(by: "initiator" | "responder", human: string, reason: string): StandingRevocation | null {
  const grant = liveGrant();
  if (!grant) return null;
  const rev = revokeStandingGrant(grant, by, human, Date.now(), reason);
  write(FED_LIVE_REVOCATIONS, [...liveRevocations(), rev]);
  return rev;
}

/* ── the live crossing — standing authority on the production path ──────── */
export interface LiveCrossingResult {
  outcome: CrossingOutcome;
  view: PairLedgerRow[];
  storedLedgers: { initiator: PairLedgerEntry[]; responder: PairLedgerEntry[] };
}

export async function runLiveCrossing(opts: {
  capability: DelegationCapability;
  task: string;
  ownerA: string;
  ownerB: string;
}): Promise<LiveCrossingResult> {
  /* 19.7.0 — the replay guard runs BEFORE anything is signed or opened: a
     repeat of the same (pair, capability, task) inside the window is refused
     in words. A dup click can no longer sign two crossings. */
  const replay = replayGuardCheck(opts.ownerA, opts.ownerB, opts.capability, opts.task);
  if (!replay.ok) {
    const t = Date.now();
    return {
      outcome: {
        crossingId: `replay-${replay.seenAt.toString(36)}`,
        pair: pairKey(opts.ownerA, opts.ownerB),
        capability: opts.capability,
        status: "refused",
        reason: "replay",
        detail: replay.reason,
        at: t,
        envelopeDigest: "none — nothing was opened or signed",
        tierInitiator: "unknown",
        tierResponder: "unknown",
        standingSource: { initiator: "not consulted — refused at the door", responder: "not consulted — refused at the door", shared: true },
        grants: {
          initiator: { capability: opts.capability, granted: false, note: "replay refused — no grant consulted" },
          responder: { capability: opts.capability, granted: false, note: "replay refused — no grant consulted" },
        } as unknown as CrossingOutcome["grants"],
        approvals: [],
        attestation: {
          attests: "that the replay guard refused a duplicate submission inside its window — nothing was signed, opened or spent twice",
          notAttested: "any crossing outcome — no work ran, so there is nothing to attest",
        },
        digest: `replay-${replay.seenAt.toString(36)}`,
      },
      view: [],
      storedLedgers: { initiator: [], responder: [] },
    };
  }
  const keys = await liveOwnerKeys();
  const opened = await openCrossing({ ownerA: opts.ownerA, ownerB: opts.ownerB, task: opts.task, capability: opts.capability, at: Date.now() });
  if (!opened.ok) throw new Error(`federation envelope refused: ${opened.reason} — ${opened.detail}`);
  const pair = opened.envelope.pair;
  const grant = liveGrant();
  const stores = livePairLedgers(pair);
  const reader: StandingReader = (a, b) => liveStandingFor(pair, a, b);
  const outcome = await crossFederation(
    {
      envelope: opened.envelope,
      initiator: opts.ownerA,
      responder: opts.ownerB,
      initiatorPublicKeyPem: keys.publicKeyPem,
      responderPublicKeyPem: keys.publicKeyPem, // one machine, one key — the outcome says shared:true
      initiatorApproval: null,
      responderApproval: null,
    },
    {
      standingGrant: grant,
      standingUsage: liveUsage(grant) ?? undefined,
      standingRevocations: liveRevocations(),
      standingInitiator: reader,
      standingResponder: reader,
      ledgers: stores,
      stores: { initiator: "this machine's initiator store", responder: "this machine's responder store" },
    },
  );
  /* persist what the outcome asks both stores to hold */
  if (outcome.commonLedger) {
    const all = liveLedgerStores();
    write(FED_LIVE_LEDGER_I, { ...all.initiator, [pair]: [...(all.initiator[pair] ?? []), outcome.commonLedger.entry] });
    write(FED_LIVE_LEDGER_R, { ...all.responder, [pair]: [...(all.responder[pair] ?? []), outcome.commonLedger.entry] });
  }
  if (outcome.standing) write(FED_LIVE_USAGE, outcome.standing.usageAfter);
  const after = livePairLedgers(pair);
  return { outcome, view: pairLedgerView(after.initiator, after.responder), storedLedgers: after };
}

export const liveLedgerView = (pair: string): PairLedgerRow[] => {
  const s = livePairLedgers(pair);
  return pairLedgerView(s.initiator, s.responder);
};

/* ── regulated activation on the routing path ───────────────────────────── */
export const loadRegulatedActivation = (): SignedRegulatedActivation | null =>
  read<SignedRegulatedActivation | null>(REGULATED_ACTIVATION_KEY, null);

export async function enableRegulatedBench(opts: {
  domains: string[];
  enabledBy: string;
  jurisdiction: string;
  context: "advisory" | "preparer" | "reviewer" | "operator";
  renewBy: number;
}): Promise<{ ok: boolean; refusal?: string; activation?: SignedRegulatedActivation }> {
  const keys = await liveOwnerKeys();
  const issued = await issueRegulatedActivation(
    { domains: opts.domains, enabledBy: opts.enabledBy, jurisdiction: opts.jurisdiction, context: opts.context, renewBy: opts.renewBy },
    keys,
    Date.now(),
  );
  if (!issued.ok) return { ok: false, refusal: issued.detail };
  write(REGULATED_ACTIVATION_KEY, issued.activation);
  return { ok: true, activation: issued.activation };
}

const registeredRegulatedIds = new Set(REGULATED_REGISTERED.map((s) => s.id));
export const isRegulatedRegistered = (id: string): boolean => registeredRegulatedIds.has(id);
export const isFederationRegistered = (id: string): boolean => FEDERATION_REGISTERED.some((s) => s.id === id);

/**
 * The router gate: regulated specialists stay registered-but-unrouted until a
 * signed, complete, current activation exists. The refusal names every gap —
 * "a name is not an authorisation" is the unsigned case.
 */
export async function regulatedRoutingVerdict(ids: string[], now = Date.now()): Promise<{ ok: true } | { ok: false; notice: string; gaps: string[] }> {
  const hits = ids.filter(isRegulatedRegistered);
  if (hits.length === 0) return { ok: true };
  const keys = await liveOwnerKeys();
  const stored = loadRegulatedActivation();
  const verdict = await verifyRegulatedActivation(stored, keys.publicKeyPem, now);
  const gaps = activationGaps(stored ?? undefined, now);
  if (!verdict.ok || gaps.length > 0) {
    return {
      ok: false,
      notice: `${regulatedNotice(hits.length)}${verdict.ok ? "" : ` Refusal: ${verdict.reason} — ${verdict.detail}`}`,
      gaps,
    };
  }
  return { ok: true };
}

export { DELEGATION_CAPABILITIES };

/** The regulated taxonomy's slugs — what an activation may name. */
export const REGULATED_DOMAIN_SLUGS: string[] = REGULATED_BATCH_DOMAINS.map((d) => d.slug);
