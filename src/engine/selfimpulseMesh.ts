/**
 * SELFIMPULSEMESH™ — 19.5.0 "Authority"
 * The bot-to-bot trust fabric of SelfImpulse.
 *
 * Bots don't trust each other. They SELFIMPULSE for each other — with receipts.
 *
 * SelfImpulseMesh makes agent-to-agent collaboration strong by construction:
 *
 *  1 · REGISTERED PEERS ONLY — an unknown bot cannot join a mission. Every
 *      peer carries a signed identity + declared capabilities under the same
 *      trust intersection as BYOA (TLS-by-default, rate ceilings,
 *      injection-scanned).
 *
 *  2 · MUTUAL ATTESTATION — before two bots work together, each signs the
 *      other's capability attestation. One-sided trust is not trust; the
 *      handshake produces TWO signatures and one shared channel digest.
 *
 *  3 · JOINT RECEIPTS — every shared mission produces a receipt CO-SIGNED by
 *      every participant. Collaboration is no longer "bot A says bot B did
 *      it" — it is a single artifact both parties are bound to. Either party
 *      can verify the joint receipt offline, forever.
 *
 *  4 · COMPOUNDING TRUST — each clean joint receipt raises the pair's trust
 *      level; a divergence or gate refusal lowers it. Trust is earned
 *      bilaterally and decays on misbehavior — exactly like autonomy inside
 *      one VH instance.
 *
 *  5 · QUARANTINE — a peer that breaks the mesh (injection flagged, forged
 *      attestation, divergence) is quarantined WITH a receipt. The mesh keeps
 *      working; the offending peer does not.
 *
 * Honesty rules: no silent joins, no unsigned collaboration, no trust without
 * history. Everything here lands in the same ledger as everything else.
 *
 * RUNTIME STATUS (live since 19.5.3 final-freeze): wired into the production
 * A2A handoff path through ./meshRuntime — every delegated handoff in the
 * selfimpulse produces a co-signed mesh joint receipt, and pair trust compounds
 * across sessions. Hashing runs on ./pureHash (synchronous, works in the
 * WebView and under Node, byte-identical to node:crypto — probe-pinned in
 * probe/meshRuntime).
 *
 * SCOPE — read before quoting: SelfImpulseMesh is the LOCAL collaboration trust
 * fabric; ECDSA provides portable authority across instances. Both peers of a
 * handoff are registered, attested and co-signed INSIDE ONE VH runtime — no
 * cross-instance network handshake happens here, and none is claimed. The
 * mesh makes local collaboration tamper-evident; the ECDSA mandate plane
 * (./missionAuthority) is what travels between instances.
 */
import { pureSha256, pureHmacSha256 } from "./pureHash";

const sha256 = pureSha256;
const hmac = pureHmacSha256;

// ── peers ───────────────────────────────────────────────────────────────────
export interface MeshPeer {
  peerId: string;
  instanceOf: string;        // whose VH instance this bot represents
  capabilities: string[];    // declared, attested capabilities
  endpoint: string;          // TLS endpoint — plain http refused by policy
  registeredAt: number;
  identityDigest: string;    // tamper-evident identity (BYOA-compatible)
}

export function registerPeer(p: Omit<MeshPeer, "identityDigest" | "registeredAt">, now = Date.now()): MeshPeer | { refused: string } {
  if (!p.endpoint.startsWith("https://")) {
    return { refused: `peer ${p.peerId}: plain-http endpoint refused — SelfImpulseMesh is TLS-by-default` };
  }
  const identityDigest = sha256(JSON.stringify({ v: "vh.mesh.identity.v1", peerId: p.peerId, instanceOf: p.instanceOf, endpoint: p.endpoint }));
  return { ...p, registeredAt: now, identityDigest };
}

// ── mutual attestation ──────────────────────────────────────────────────────
export interface Attestation {
  attester: string;          // who selfimpulsees
  subject: string;           // who is selfimpulseed for
  capabilities: string[];    // what the attester confirms the subject can do
  trustGrant: number;        // initial trust units extended
  issuedAt: number;
  signature: string;
  digest: string;
}

export function attest(peerSecret: string, attester: string, subject: MeshPeer, trustGrant: number, now = Date.now()): Attestation {
  const base = { attester, subject: subject.peerId, capabilities: subject.capabilities, trustGrant, issuedAt: now };
  const signature = hmac(peerSecret, JSON.stringify(base));
  return { ...base, signature, digest: sha256(JSON.stringify(base) + "." + signature) };
}

export interface Channel {
  a: string; b: string;
  attestationAtoB: Attestation;
  attestationBtoA: Attestation;
  channelDigest: string;     // the shared collaboration identity
}

/** Both parties sign. One signature = half a handshake = refused. */
export function openChannel(a: Attestation, b: Attestation): Channel | { refused: string } {
  if (a.attester === b.attester) return { refused: "a channel needs two different peers — self-attestation is not trust" };
  if (a.subject !== b.attester || b.subject !== a.attester) {
    return { refused: "attestations do not cross-reference — each peer must selfimpulse for the other" };
  }
  return { a: a.attester, b: b.attester, attestationAtoB: a, attestationBtoA: b, channelDigest: sha256(a.digest + "|" + b.digest) };
}

// ── joint receipts — collaboration as a co-signed artifact ──────────────────
export interface JointAction { actor: string; action: string; outcome: "executed" | "gated-out" | "refused"; at: number }

export interface JointReceipt {
  missionId: string;
  channelDigest: string;
  participants: string[];
  actions: JointAction[];
  coSignatures: Record<string, string>;   // one per participant
  digest: string;
}

export const jointCanonical = (missionId: string, channelDigest: string, actions: JointAction[]) =>
  JSON.stringify({ v: "vh.mesh.joint.v1", missionId, channelDigest, actions });

export function buildJointReceipt(missionId: string, channel: Channel, actions: JointAction[]): JointReceipt {
  return { missionId, channelDigest: channel.channelDigest, participants: [channel.a, channel.b], actions, coSignatures: {}, digest: "" };
}

/** Each participant signs the SAME canonical body — that is the co-selfimpulse. */
export function coSign(receipt: JointReceipt, peerId: string, peerSecret: string): JointReceipt {
  if (!receipt.participants.includes(peerId)) {
    throw new Error(`${peerId} is not a participant of mission ${receipt.missionId} — outsiders cannot co-sign`);
  }
  const body = jointCanonical(receipt.missionId, receipt.channelDigest, receipt.actions);
  const coSignatures = { ...receipt.coSignatures, [peerId]: hmac(peerSecret, body) };
  const digest = sha256(body + "|" + Object.entries(coSignatures).sort().map(([k, v]) => `${k}:${v}`).join(","));
  return { ...receipt, coSignatures, digest };
}

export function isFullyCoSigned(receipt: JointReceipt): boolean {
  return receipt.participants.every((p) => Boolean(receipt.coSignatures[p]));
}

// ── compounding trust ───────────────────────────────────────────────────────
export interface PairTrust { pairKey: string; trust: number; jointReceipts: number; divergences: number }

export const pairKey = (a: string, b: string) => [a, b].sort().join("↔");

export function recordJointOutcome(
  ledger: Map<string, PairTrust>,
  a: string,
  b: string,
  outcome: "clean" | "divergence" | "refused",
): PairTrust {
  const key = pairKey(a, b);
  const cur = ledger.get(key) ?? { pairKey: key, trust: 0, jointReceipts: 0, divergences: 0 };
  if (outcome === "clean") { cur.trust += 1; cur.jointReceipts += 1; }
  if (outcome === "divergence") { cur.trust = Math.max(0, cur.trust - 2); cur.divergences += 1; }
  if (outcome === "refused") { cur.trust = Math.max(0, cur.trust - 1); }
  ledger.set(key, cur);
  return cur;
}

// ── quarantine ──────────────────────────────────────────────────────────────
export interface QuarantineRecord { peerId: string; reason: string; at: number; digest: string }

export function quarantinePeer(peerId: string, reason: string, now = Date.now()): QuarantineRecord {
  return { peerId, reason, at: now, digest: sha256(`vh.mesh.quarantine.v1:${peerId}:${reason}:${now}`) };
}

export const meshStanding = (t: PairTrust | undefined): "unknown" | "probation" | "selfimpulseed" | "proven" =>
  !t ? "unknown" : t.trust < 3 ? "probation" : t.trust < 10 ? "selfimpulseed" : "proven";
