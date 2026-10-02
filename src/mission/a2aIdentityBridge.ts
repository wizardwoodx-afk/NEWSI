/**
 * A2A → collaboration identity bridge (18.4.0).
 *
 * The 18.3.0 review's remaining structural point: the bound-peer registry was
 * trust-on-first-use in browser storage. The A2A layer already does better —
 * `discoverAgentCard` verifies a peer's AgentCard JWS against the pinned
 * publisher key before any traffic flows. This bridge records THAT verified
 * key, keyed by the member the card names, into a store the collaboration
 * registry reads. Connected peers therefore bind STRUCTURALLY (card-verified),
 * not by first-use; TOFU remains only for the offline paste-an-invite path.
 *
 * Honesty, as always: the store itself is still browser-local. A full
 * client-side compromise can still rewrite it (denial, not impersonation of
 * the encrypted private key). The terminus remains native secure storage;
 * this module is the step that makes the binding structural today. The
 * module is dependency-free (localStorage + WebCrypto digest) so both the
 * mission layer and the SelfImpulse door can read it.
 */
const A2A_PEERS_KEY = "engine.collab.a2a.v1";

export interface A2AVerifiedPeer {
  memberId: string;
  publicJwk: JsonWebKey;
  fp: string;
  verifiedAt: string;
  cardUrl: string;
}

function storage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function listA2AVerifiedPeers(): A2AVerifiedPeer[] {
  const raw = storage()?.getItem(A2A_PEERS_KEY) ?? null;
  if (!raw) return [];
  try {
    const r = JSON.parse(raw) as { peers: A2AVerifiedPeer[] };
    return Array.isArray(r.peers) ? r.peers : [];
  } catch {
    return [];
  }
}

export function a2aVerifiedKeyFor(memberId: string): A2AVerifiedPeer | null {
  return listA2AVerifiedPeers().find((p) => p.memberId === memberId) ?? null;
}

export async function fpForJwk(jwk: JsonWebKey): Promise<string> {
  const buf = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(jwk)));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 16);
}

/** Called ONLY from the A2A client after a card signature actually verified. */
export async function recordA2AVerifiedPeer(memberId: string, publicJwk: JsonWebKey, cardUrl: string, now: () => Date = () => new Date()): Promise<A2AVerifiedPeer> {
  const entry: A2AVerifiedPeer = { memberId, publicJwk, fp: await fpForJwk(publicJwk), verifiedAt: now().toISOString(), cardUrl };
  const peers = [...listA2AVerifiedPeers().filter((p) => p.memberId !== memberId), entry];
  storage()?.setItem(A2A_PEERS_KEY, JSON.stringify({ peers }));
  return entry;
}

export function clearA2AVerifiedPeers(): void {
  storage()?.removeItem(A2A_PEERS_KEY);
}
