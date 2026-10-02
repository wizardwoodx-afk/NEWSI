/**
 * MESH RUNTIME — SelfImpulseMesh wired into the live A2A handoff path (19.5.3 final-freeze).
 *
 * Before this module existed, SelfImpulseMesh was proven by its probe but not yet on
 * a production path. This is the wiring: every handoff recorded through
 * ./handoffs now runs through the mesh fabric.
 *
 * What actually happens on a handoff:
 *
 *   DELEGATED — the selfimpulse and the receiving peer are registered as mesh
 *   peers (TLS-by-default endpoint policy), each signs the other's capability
 *   attestation, a channel is opened, and the handoff becomes a JOINT RECEIPT
 *   co-signed by BOTH parties. The receipt digest lands on the handoff record
 *   itself, so the collaboration ledger and the trust fabric are one artifact.
 *   The pair's trust level rises (recordJointOutcome "clean").
 *
 *   REFUSED — no joint receipt is minted (nothing was jointly executed), but
 *   the refusal still moves pair trust down through the same ledger, so a
 *   peer that keeps failing the seam cannot quietly build standing.
 *
 * Standing ("probation" → "selfimpulseed" → "proven") is persisted per pair in
 * localStorage and compounds across sessions.
 *
 * Honesty statements:
 *  - SelfImpulseMesh is the LOCAL collaboration trust fabric; ECDSA provides
 *    portable authority across instances. Both sides of every handoff are
 *    minted and co-signed inside this one runtime — no remote VH instance is
 *    contacted and no cross-instance cryptographic handshake is claimed.
 *  - Co-signatures are HMAC co-selfimpulsees with session-scoped secrets: they make
 *    the joint artifact tamper-evident inside this selfimpulse.
 *  - Peer endpoints here are trust-anchor identifiers minted from the peer's
 *    declared name; no network call is made by the mesh itself.
 *  - Nothing happens silently: every mesh decision (including refusals) is
 *    returned in words and recorded on the handoff.
 */
import {
  registerPeer, attest, openChannel, buildJointReceipt, coSign, isFullyCoSigned,
  recordJointOutcome, meshStanding, pairKey,
  type MeshPeer, type PairTrust,
} from "./selfimpulseMesh";
import { pureHmacSha256 } from "./pureHash";

const TRUST_KEY = "engine.mesh.trust.v1";
const SELFIMPULSE_PEER_ID = "vh.selfimpulse";

/** The selfimpulse itself is a mesh peer — the local trust anchor of every channel. */
const selfimpulsePeer = (): MeshPeer => {
  const p = registerPeer({
    peerId: SELFIMPULSE_PEER_ID,
    instanceOf: "selfimpulse",
    capabilities: ["routing", "attestation", "receipts", "gating"],
    endpoint: "https://selfimpulse.local",
  });
  if ("refused" in p) throw new Error(`selfimpulse peer registration refused: ${p.refused}`);
  return p;
};

/** Peer names become deterministic trust-anchor endpoints (identifiers, not dialled). */
const anchorEndpointFor = (peerName: string): string => {
  const slug = peerName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "peer";
  return `https://${slug}.si-mesh.local`;
};

const registerRemotePeer = (peerName: string): MeshPeer | { refused: string } =>
  registerPeer({
    peerId: peerName,
    instanceOf: peerName,
    capabilities: ["a2a", "handoff"],
    endpoint: anchorEndpointFor(peerName),
  });

/* ── session-scoped co-signing secrets (honestly labelled, not portable) ── */
const secrets = new Map<string, string>();

function secretFor(peerId: string): string {
  let s = secrets.get(peerId);
  if (!s) {
    const bytes = new Uint8Array(32);
    globalThis.crypto?.getRandomValues(bytes);
    s = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    secrets.set(peerId, s);
  }
  return s;
}

/* ── persisted pair-trust ledger ─────────────────────────────────────────── */
function loadTrust(): Map<string, PairTrust> {
  try {
    const raw = globalThis.localStorage?.getItem(TRUST_KEY);
    if (!raw) return new Map();
    const rows = JSON.parse(raw) as PairTrust[];
    return new Map(rows.map((r) => [r.pairKey, r]));
  } catch {
    return new Map();
  }
}

function saveTrust(ledger: Map<string, PairTrust>): void {
  try {
    globalThis.localStorage?.setItem(TRUST_KEY, JSON.stringify([...ledger.values()]));
  } catch {
    /* no storage ⇒ trust lives for this session only; honestly, that is all it can do */
  }
}

export function pairTrustFor(a: string, b: string): PairTrust | undefined {
  return loadTrust().get(pairKey(a, b));
}

export function standingFor(a: string, b: string): ReturnType<typeof meshStanding> {
  return meshStanding(pairTrustFor(a, b));
}

/* ── the wired seam ──────────────────────────────────────────────────────── */
export interface MeshHandoffResult {
  meshJointDigest: string | null;   // null ⇒ no joint receipt (refused handoff)
  meshStanding: ReturnType<typeof meshStanding>;
  meshDetail: string;               // the mesh decision in words
}

export function meshForHandoff(input: {
  handoffId: string;
  peer: string;
  outcome: "delegated" | "refused";
  taskDigest: string;
}): MeshHandoffResult {
  const ledger = loadTrust();

  if (input.outcome === "refused") {
    recordJointOutcome(ledger, SELFIMPULSE_PEER_ID, input.peer, "refused");
    saveTrust(ledger);
    return {
      meshJointDigest: null,
      meshStanding: meshStanding(ledger.get(pairKey(SELFIMPULSE_PEER_ID, input.peer))),
      meshDetail: "no joint receipt minted — the handoff was refused before any joint execution; pair trust adjusted",
    };
  }

  const remote = registerRemotePeer(input.peer);
  if ("refused" in remote) {
    return { meshJointDigest: null, meshStanding: "unknown", meshDetail: remote.refused };
  }

  const selfimpulse = selfimpulsePeer();
  const aToB = attest(secretFor(selfimpulse.peerId), selfimpulse.peerId, remote, 1);
  const bToA = attest(secretFor(remote.peerId), remote.peerId, selfimpulse, 1);
  const channel = openChannel(aToB, bToA);
  if ("refused" in channel) {
    return { meshJointDigest: null, meshStanding: "unknown", meshDetail: `channel refused: ${channel.refused}` };
  }

  const now = Date.now();
  let receipt = buildJointReceipt(`handoff:${input.handoffId}`, channel, [
    { actor: selfimpulse.peerId, action: "delegate", outcome: "executed", at: now },
    { actor: remote.peerId, action: input.taskDigest || "accept", outcome: "executed", at: now },
  ]);
  receipt = coSign(receipt, selfimpulse.peerId, secretFor(selfimpulse.peerId));
  receipt = coSign(receipt, remote.peerId, secretFor(remote.peerId));
  if (!isFullyCoSigned(receipt)) {
    return { meshJointDigest: null, meshStanding: "unknown", meshDetail: "joint receipt left partially signed — refused, not shipped" };
  }

  recordJointOutcome(ledger, selfimpulse.peerId, remote.peerId, "clean");
  saveTrust(ledger);
  return {
    meshJointDigest: receipt.digest,
    meshStanding: meshStanding(ledger.get(pairKey(selfimpulse.peerId, remote.peerId))),
    meshDetail: `co-signed joint receipt ${receipt.digest.slice(0, 12)}… across channel ${channel.channelDigest.slice(0, 12)}…`,
  };
}

/* ── test/re-run hygiene ─────────────────────────────────────────────────── */
export function clearMeshTrust(): void {
  try {
    globalThis.localStorage?.removeItem(TRUST_KEY);
  } catch {
    /* nothing to clear */
  }
  secrets.clear();
}

/** Verifier helper: recompute a participant's co-selfimpulse for a joint canonical body. */
export const recomputeCoSelfImpulse = (peerSecret: string, canonicalBody: string): string =>
  pureHmacSha256(peerSecret, canonicalBody);
