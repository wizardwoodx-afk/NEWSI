/**
 * SelfImpulse — bound peer identities (18.3.0).
 *
 * Closes the 18.2.0 review's cryptographic hole: `verifyApproval` used to
 * verify against a public key SUPPLIED INSIDE the approval, so an attacker's
 * fresh key wearing "qwen" as a name would verify. Now the verifier resolves
 * the expected approver's key from THIS store — bound by an explicit human
 * act (accepting an invitation binds the issuer; a manual bind covers the
 * rest) — and an approval whose presented key does not deep-equal the bound
 * one REFUSES. An unbound member refuses too: no binding, no verification.
 *
 * Binding is trust-on-first-use BY DESIGN and says so (`source` records how
 * the key arrived). The next step up — mirroring the A2A JWS identity so the
 * binding is structural rather than first-use — is documented as the
 * upgrade path; nothing here pretends to be it yet.
 */
import { jwkEqual } from "./secureKeys";

const PEERS_KEY = "engine.collab.peers.v1";

export interface BoundPeer {
  memberId: string;
  publicJwk: JsonWebKey;
  boundAt: string;
  source: "invite-acceptance" | "manual";
}

interface Registry {
  peers: BoundPeer[];
}

function storage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function load(): Registry {
  const raw = storage()?.getItem(PEERS_KEY) ?? null;
  if (!raw) return { peers: [] };
  try {
    const r = JSON.parse(raw) as Registry;
    return Array.isArray(r.peers) ? r : { peers: [] };
  } catch {
    return { peers: [] };
  }
}

function save(r: Registry): void {
  storage()?.setItem(PEERS_KEY, JSON.stringify(r));
}

export function boundIdentityFor(memberId: string): BoundPeer | null {
  return load().peers.find((p) => p.memberId === memberId) ?? null;
}

export function listBoundPeers(): BoundPeer[] {
  return load().peers;
}

/** Bind (or RE-bind — a human act, recorded) a member's public identity. */
export function bindPeerIdentity(memberId: string, publicJwk: JsonWebKey, source: BoundPeer["source"], now: () => Date = () => new Date()): BoundPeer {
  const r = load();
  const entry: BoundPeer = { memberId, publicJwk, boundAt: now().toISOString(), source };
  r.peers = [...r.peers.filter((p) => p.memberId !== memberId), entry];
  save(r);
  return entry;
}

/** Unbinding is a human act and never automatic. */
export function unbindPeer(memberId: string): void {
  const r = load();
  r.peers = r.peers.filter((p) => p.memberId !== memberId);
  save(r);
}

export function clearRegistry(): void {
  storage()?.removeItem(PEERS_KEY);
}

/* ── structural identities: keys the A2A layer verified on a signed card ──
 * Read by WELL-KNOWN STORE, not by importing the mission layer — the engine
 * engine stays self-contained. The writer is a2aIdentityBridge, called only
 * after verifyAgentCardV10Signatures passed. */
const A2A_PEERS_KEY = "engine.collab.a2a.v1";

export interface StructuralPeer {
  memberId: string;
  publicJwk: JsonWebKey;
  fp: string;
  verifiedAt: string;
  cardUrl: string;
}

export function structuralIdentityFor(memberId: string): StructuralPeer | null {
  const raw = storage()?.getItem(A2A_PEERS_KEY) ?? null;
  if (!raw) return null;
  try {
    const r = JSON.parse(raw) as { peers: StructuralPeer[] };
    return (Array.isArray(r.peers) ? r.peers : []).find((p) => p.memberId === memberId) ?? null;
  } catch {
    return null;
  }
}

export interface KnownIdentityRow {
  memberId: string;
  publicJwk: JsonWebKey;
  source: string;
  boundAt: string;
}

export function allKnownIdentities(): KnownIdentityRow[] {
  const manual = load().peers;
  const structural = (() => {
    const raw = storage()?.getItem(A2A_PEERS_KEY) ?? null;
    if (!raw) return [] as StructuralPeer[];
    try {
      const r = JSON.parse(raw) as { peers: StructuralPeer[] };
      return Array.isArray(r.peers) ? r.peers : [];
    } catch {
      return [] as StructuralPeer[];
    }
  })();
  return [
    ...structural.filter((p) => !manual.some((m) => m.memberId === p.memberId)).map((p) => ({ ...p, source: "a2a-card", boundAt: p.verifiedAt })),
    ...manual,
  ];
}

/**
 * The binding check used by every approval verifier. Returns the bound key
 * the approval MUST have been signed with, or a refusal in words.
 */
export function requireBoundKey(memberId: string, presentedJwk: JsonWebKey): { ok: true; bound: BoundPeer } | { ok: false; error: string } {
  const bound = boundIdentityFor(memberId);
  if (bound) {
    if (!jwkEqual(bound.publicJwk, presentedJwk)) {
      return { ok: false, error: `presented key does not match the bound identity for "${memberId}" — refusing` };
    }
    return { ok: true, bound };
  }
  // structural path: the A2A layer verified this key on a signed AgentCard
  const structural = structuralIdentityFor(memberId);
  if (structural) {
    if (!jwkEqual(structural.publicJwk, presentedJwk)) {
      return { ok: false, error: `presented key does not match the A2A-card-verified identity for "${memberId}" — refusing` };
    }
    return { ok: true, bound: { memberId, publicJwk: structural.publicJwk, boundAt: structural.verifiedAt, source: "invite-acceptance" } };
  }
  return { ok: false, error: `"${memberId}" has no bound or A2A-verified identity here — bind it (invite acceptance, manual verify, or connect over A2A) before approvals can be trusted` };
}
