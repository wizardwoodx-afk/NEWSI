/**
 * SelfImpulse — the A2A handoff ledger (18.7.0 · meshed 19.5.3).
 *
 * Every delegation attempt through the peer seam gets a receipt — including
 * the refusals. A handoff that never ran is recorded as refused with the
 * reason in words; a handoff that ran carries the peer's receipt digest AND
 * a SelfImpulseMesh joint receipt co-signed by both parties (see ./meshRuntime —
 * the mesh fabric is wired into this seam, not just probed).
 * Nothing is recorded that did not happen, and nothing that happened goes
 * unrecorded. Module + localStorage only; no network, no fake transports.
 */
import { meshForHandoff } from "./meshRuntime";
import { uid } from "../app/id";

const HANDOFFS_KEY = "engine.handoffs.v1";
const HANDOFF_CAP = 100;

export interface HandoffRecord {
  id: string;
  peer: string;
  taskDigest: string;
  outcome: "delegated" | "refused";
  detail: string;
  receiptDigest?: string;
  /** SelfImpulseMesh joint-receipt digest — present only when the handoff delegated. */
  meshJointDigest?: string | null;
  /** Pair standing after this handoff moved mesh trust. */
  meshStanding?: "unknown" | "probation" | "selfimpulseed" | "proven";
  /** The mesh decision in words. */
  meshDetail?: string;
  at: string;
}

function storage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function listHandoffs(): HandoffRecord[] {
  const raw = storage()?.getItem(HANDOFFS_KEY) ?? null;
  if (!raw) return [];
  try {
    const h = JSON.parse(raw) as HandoffRecord[];
    return Array.isArray(h) ? h : [];
  } catch {
    return [];
  }
}

export function recordHandoff(
  input: { peer: string; task: string; outcome: HandoffRecord["outcome"]; detail: string; receiptDigest?: string },
  now: () => Date = () => new Date(),
): HandoffRecord {
  const rec: HandoffRecord = {
    id: uid("ho"),
    peer: input.peer,
    taskDigest: input.task.slice(0, 120),
    outcome: input.outcome,
    detail: input.detail.slice(0, 200),
    receiptDigest: input.receiptDigest,
    at: now().toISOString(),
  };
  const mesh = meshForHandoff({ handoffId: rec.id, peer: rec.peer, outcome: rec.outcome, taskDigest: rec.taskDigest });
  rec.meshJointDigest = mesh.meshJointDigest;
  rec.meshStanding = mesh.meshStanding;
  rec.meshDetail = mesh.meshDetail;
  storage()?.setItem(HANDOFFS_KEY, JSON.stringify([...listHandoffs(), rec].slice(-HANDOFF_CAP)));
  return rec;
}

export function clearHandoffs(): void {
  storage()?.removeItem(HANDOFFS_KEY);
}
