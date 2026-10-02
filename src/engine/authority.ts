/**
 * VH AUTHORITY — 19.5.0 "Authority"
 *
 * The Chain of Authority: every action carries the cryptographic proof of WHO
 * authorized it and how far that authority reached.
 *
 * Three mechanisms, all probe-pinned:
 *
 *  1 · MANDATE PASSPORT (KYA — Know Your Agent)
 *      A signed, portable mandate: scope, budget ceiling that DECAYS as the
 *      agent operates, expiry, and the human owner's signature. An agent
 *      without a valid passport does not act. Standards bodies are drafting
 *      this; VH ships it local-first.
 *
 *  2 · CHAIN OF AUTHORITY (delegation provenance)
 *      Every delegation hop commits BOTH principals (upstream → downstream),
 *      and scope can only SHRINK per hop (monotonic attenuation). The chain
 *      rides inside the receipt system. No production protocol for this
 *      exists elsewhere — that is the gap, and this is it.
 *
 *  3 · INTENT RECEIPTS
 *      Before a risky action, the agent declares its intent IN WORDS. The
 *      gate approves the intent, not just the action. After execution, we
 *      measure declared-vs-executed divergence. We never claim to read
 *      intent — we MEASURE the divergence between declared and executed.
 *
 * Honesty rules:
 *  - Nothing here invents authority: missing/expired/broken signatures are
 *    refusals, worded plainly.
 *  - Scope attenuation is mechanical; a hop cannot grant what it does not hold.
 *  - The governance plane stays frozen: none of this loosens the human gate.
 */
import { createHash, createHmac } from "node:crypto";
/* Portable cross-user authority lives in authorityWeb.ts (WebCrypto ECDSA
   P-256) — the LIVE runtime path. This module keeps the local HMAC mandate
   verifier as a legacy-compatibility surface, plus node-side bindings. */

// ── primitives ──────────────────────────────────────────────────────────────
const sha256 = (t: string) => createHash("sha256").update(t).digest("hex");
const hmac = (secret: string, t: string) => createHmac("sha256", secret).update(t).digest("hex");

// ── 1 · MANDATE PASSPORT ────────────────────────────────────────────────────
export interface Mandate {
  agentId: string;
  owner: string;            // the human who signs — accountability anchor
  scope: string[];          // permitted tool/action classes
  budgetCap: number;        // authority units granted
  maxDepth: number;         // delegation depth permitted
  issuedAt: number;
  expiresAt: number;
  signature?: string;       // hmac over canonical mandate (owner's secret)
}

export const mandateCanonical = (m: Omit<Mandate, "signature">) =>
  JSON.stringify({
    v: "vh.mandate.v1", agentId: m.agentId, owner: m.owner, scope: [...m.scope].sort(),
    budgetCap: m.budgetCap, maxDepth: m.maxDepth, issuedAt: m.issuedAt, expiresAt: m.expiresAt,
  });

export function signMandate(m: Omit<Mandate, "signature">, ownerSecret: string): Mandate {
  return { ...m, signature: hmac(ownerSecret, mandateCanonical(m)) };
}

export type MandateCheck =
  | { ok: true; mandate: Mandate }
  | { ok: false; reason: "missing" | "expired" | "bad-signature" | "no-owner"; detail: string };

export function verifyMandate(m: Mandate | null | undefined, ownerSecret: string, now = Date.now()): MandateCheck {
  if (!m) return { ok: false, reason: "missing", detail: "no mandate passport — the agent does not act" };
  if (!m.owner) return { ok: false, reason: "no-owner", detail: "a mandate without a named human owner is not authority" };
  if (now > m.expiresAt) return { ok: false, reason: "expired", detail: "mandate expired — re-issue it" };
  const want = hmac(ownerSecret, mandateCanonical(m));
  if (want !== m.signature) return { ok: false, reason: "bad-signature", detail: "mandate signature does not verify — treating as forged" };
  return { ok: true, mandate: m };
}

/** Budget decays as the agent operates — the ceiling is live, not nominal. */
export interface AuthorityBalance { mandate: Mandate; spent: number; depth: number }
export const remainingBudget = (b: AuthorityBalance) => Math.max(0, b.mandate.budgetCap - b.spent);

// ── 2 · CHAIN OF AUTHORITY ──────────────────────────────────────────────────
export interface AuthorityHop {
  from: string;             // upstream principal
  to: string;               // downstream principal
  grantedScope: string[];   // MUST be ⊆ upstream's remaining scope
  grantedBudget: number;    // MUST be ≤ upstream's remaining budget
  depth: number;
  parentDigest: string | null;  // chain link (null = root)
  digest?: string;
}

export const hopCanonical = (h: Omit<AuthorityHop, "digest">) =>
  JSON.stringify({
    v: "vh.authority-hop.v1", from: h.from, to: h.to, scope: [...h.grantedScope].sort(),
    budget: h.grantedBudget, depth: h.depth, parent: h.parentDigest,
  });

export type DelegateResult =
  | { ok: true; hop: AuthorityHop }
  | { ok: false; reason: "scope-inflation" | "budget-inflation" | "depth-exceeded" | "no-mandate"; detail: string };

/**
 * Delegate authority from one principal to another. Monotonic attenuation is
 * enforced mechanically: you can only pass on scope you hold and budget you
 * have left, and the depth ceiling comes from the root mandate.
 */
export function delegateAuthority(
  parent: AuthorityBalance,
  to: string,
  grantedScope: string[],
  grantedBudget: number,
  parentDigest: string | null,
): DelegateResult {
  const { mandate } = parent;
  if (parent.depth + 1 > mandate.maxDepth) {
    return { ok: false, reason: "depth-exceeded", detail: `delegation depth ${parent.depth + 1} exceeds the mandate ceiling ${mandate.maxDepth}` };
  }
  const held = new Set(mandate.scope);
  const inflated = grantedScope.filter((s) => !held.has(s));
  if (inflated.length) {
    return { ok: false, reason: "scope-inflation", detail: `cannot grant scope not held: ${inflated.join(", ")} — authority only shrinks` };
  }
  if (grantedBudget > remainingBudget(parent)) {
    return { ok: false, reason: "budget-inflation", detail: `cannot grant ${grantedBudget} — only ${remainingBudget(parent)} authority remains` };
  }
  const base: Omit<AuthorityHop, "digest"> = {
    from: mandate.agentId, to, grantedScope, grantedBudget, depth: parent.depth + 1, parentDigest,
  };
  return { ok: true, hop: { ...base, digest: sha256(hopCanonical(base)) } };
}

/** Verify a full chain: every hop's scope/budget is contained by its parent. */
export function verifyChain(hops: AuthorityHop[]): { ok: boolean; brokenAt: number | null; reason: string } {
  for (let i = 0; i < hops.length; i++) {
    const h = hops[i];
    const { digest, ...unsigned } = h;
    if (sha256(hopCanonical(unsigned)) !== digest) {
      return { ok: false, brokenAt: i, reason: "hop digest mismatch — chain tampered" };
    }
    if (i > 0) {
      const prev = hops[i - 1];
      const prevScope = new Set(prev.grantedScope);
      if (h.grantedScope.some((s) => !prevScope.has(s))) {
        return { ok: false, brokenAt: i, reason: "scope inflation mid-chain" };
      }
      if (h.grantedBudget > prev.grantedBudget) {
        return { ok: false, brokenAt: i, reason: "budget inflation mid-chain" };
      }
      if (h.parentDigest !== prev.digest) {
        return { ok: false, brokenAt: i, reason: "broken parent link" };
      }
    }
  }
  return { ok: true, brokenAt: null, reason: "chain holds" };
}

// ── 3 · INTENT RECEIPTS ─────────────────────────────────────────────────────
export interface IntentDeclaration {
  agentId: string;
  taskId: string;
  declaredIntent: string;    // the agent states, in words, what it intends
  declaredTools: string[];   // the tools it says it will use
}

export interface IntentReceipt {
  declaration: IntentDeclaration;
  gateDecision: "approved" | "refused";
  gateReason: string;
  executedTools: string[];
  divergence: string[];       // tools executed but never declared
  converged: boolean;         // true = did what it said it would
  digest: string;
}

export function declareIntent(d: IntentDeclaration): IntentDeclaration {
  return { ...d, declaredTools: [...new Set(d.declaredTools)] };
}

/** The gate approves the INTENT, not just the action. */
export function gateIntent(
  d: IntentDeclaration,
  decision: { approved: boolean; reason: string },
  executedTools: string[],
): IntentReceipt {
  const declared = new Set(d.declaredTools);
  const divergence = executedTools.filter((t) => !declared.has(t));
  const receipt: Omit<IntentReceipt, "digest"> = {
    declaration: d,
    gateDecision: decision.approved ? "approved" : "refused",
    gateReason: decision.reason,
    executedTools,
    divergence,
    converged: divergence.length === 0 && decision.approved,
  };
  return { ...receipt, digest: sha256(JSON.stringify(receipt)) };
}

// ── 4 · AGENT WARRANTY PACK (assurance as an insurable/contract artifact) ──
export interface WarrantyPack {
  agentId: string;
  window: { from: number; to: number };
  missionsCompleted: number;
  gateApprovals: number;
  gateRefusals: number;
  intentConvergenceRate: number;   // 1.0 = always did what it declared
  policyViolations: number;
  chainDepthMax: number;
  seal: string;                     // hmac over the whole pack
}

export function buildWarrantyPack(
  agentId: string,
  window: { from: number; to: number },
  stats: Omit<WarrantyPack, "agentId" | "window" | "seal">,
  secret: string,
): WarrantyPack {
  const base = { agentId, window, ...stats };
  return { ...base, seal: hmac(secret, JSON.stringify(base)) };
}

// ── 5 · LIABILITY MAP (who owed what at each hop) ──────────────────────────
export interface LiabilityEntry { principal: string; owedScope: string[]; owedBudget: number; depth: number }

/** From a verified chain, produce the responsibility map for legal/insurance. */
export function liabilityMap(root: Mandate, hops: AuthorityHop[]): LiabilityEntry[] {
  const entries: LiabilityEntry[] = [{ principal: `${root.owner} (owner)`, owedScope: root.scope, owedBudget: root.budgetCap, depth: 0 }];
  for (const h of hops) entries.push({ principal: h.to, owedScope: h.grantedScope, owedBudget: h.grantedBudget, depth: h.depth });
  return entries;
}



/* Node-side authority⟷receipt binding (legacy probes + node surfaces).
   The portable, runtime-agnostic version lives in authorityWeb.ts. */
export interface AuthorityBinding {
  receiptDigest: string;
  hopDigest: string | null;     // null = root mandate action
  mandateOwner: string;
  digest: string;
}

export const bindAuthorityToReceipt = (receiptDigest: string, hopDigest: string | null, mandateOwner: string): AuthorityBinding => {
  const base = { receiptDigest, hopDigest, mandateOwner };
  return { ...base, digest: sha256(JSON.stringify(base)) };
};

export const verifyAuthorityBinding = (binding: AuthorityBinding, receiptDigest: string, hopDigest: string | null): boolean => {
  const want = sha256(JSON.stringify({ receiptDigest, hopDigest, mandateOwner: binding.mandateOwner }));
  return want === binding.digest && binding.receiptDigest === receiptDigest;
};
