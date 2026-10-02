/**
 * §CHECKPOINTS — named time-travel for the graph (VH 11.9.5).
 *
 * Researched grounding: The graph-orchestration checkpointer is the production reference — graph state is
 * saved at a point in time, organised by thread, and any checkpoint can be restored to replay
 * or recover (zylos.ai durable-execution survey 2026: Temporal/Inngest and the graph-orchestration frameworks all expose
 * checkpoint+replay as the durability primitive). VH applies the same idea to the DESIGN graph:
 * name a moment, keep its exact node/wire state, restore it later — and restoration rides the
 * existing undo stack, so even a restore can be undone.
 *
 * Pure + storage wrapper. No DOM in the pure half; storage falls back to memory when
 * localStorage is unavailable (Node probes, sandboxed iframes).
 */
import type { WorkflowGraph } from "../domain/types";
import { writeFirstThatFits, type PersistRung, type PersistResult } from "../persist/quotaSafe";

export interface GraphCheckpoint {
  id: string;
  name: string;
  ts: string;
  workflowId: string;
  counts: { nodes: number; connections: number };
  graph: WorkflowGraph;
}

export const CHECKPOINT_CAP = 25;

let seq = 0;
const uid = (p: string): string => `${p}${Date.now().toString(36)}${(seq++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export function createCheckpoint(name: string, graph: WorkflowGraph): GraphCheckpoint {
  return {
    id: uid("cp"),
    name: name.trim() || "Untitled checkpoint",
    ts: new Date().toISOString(),
    workflowId: graph.id,
    counts: { nodes: graph.nodes.length, connections: graph.connections.length },
    graph: structuredClone(graph),
  };
}

/** Structural equality of two graphs IGNORING viewport (a pan is not a change worth saving). */
export function graphsStructurallyEqual(a: WorkflowGraph, b: WorkflowGraph): boolean {
  const strip = (g: WorkflowGraph) =>
    JSON.stringify({ nodes: g.nodes, connections: g.connections, notes: g.notes ?? [], groups: g.groups ?? [] });
  return strip(a) === strip(b);
}

/** Append with policy: never store a duplicate of the newest, never exceed the cap. */
export function addCheckpoint(list: GraphCheckpoint[], cp: GraphCheckpoint): { list: GraphCheckpoint[]; skipped: boolean } {
  if (list.length > 0 && graphsStructurallyEqual(list[0].graph, cp.graph)) return { list, skipped: true };
  return { list: [cp, ...list].slice(0, CHECKPOINT_CAP), skipped: false };
}

/** Restore = the saved graph, but keep the viewport the human is looking at right now. */
export function restoreGraph(current: WorkflowGraph, cp: GraphCheckpoint): WorkflowGraph {
  const g = structuredClone(cp.graph);
  g.viewport = structuredClone(current.viewport);
  return g;
}

/* --- persistence (LS with memory fallback, same honesty as autonomyStore) --- */
const LS_KEY = "vh.checkpoints.v1";
const memory: GraphCheckpoint[] = [];

export function loadCheckpoints(): GraphCheckpoint[] {
  try {
    if (typeof localStorage === "undefined") return memory;
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return memory;
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as GraphCheckpoint[]) : memory;
  } catch {
    return memory;
  }
}

/**
 * 19.7.13 — save through the quota ladder instead of swallowing the throw.
 *
 * The old body caught `QuotaExceededError` and said nothing: a named checkpoint
 * the user had just taken was written to memory and lost at reload, silently.
 * The list is capped at CHECKPOINT_CAP, but each entry carries a full graph
 * clone, so a large graph reaches the origin budget well before the cap does.
 * Now the write walks a declared ladder — full, then progressively fewer of the
 * OLDEST checkpoints — and whatever it gives up is named in the notice ledger.
 * The return value is additive: existing callers may keep ignoring it.
 */
export function saveCheckpoints(list: GraphCheckpoint[]): PersistResult {
  memory.length = 0;
  memory.push(...list);
  const rung = (n: number): string => JSON.stringify(list.slice(0, n));
  const ladder: PersistRung[] = [{ value: rung(list.length), dropped: "" }];
  for (const keep of [12, 6, 3, 1]) {
    if (keep < list.length) {
      ladder.push({ value: rung(keep), dropped: `kept the ${keep} newest checkpoint(s), dropped ${list.length - keep} older one(s) to fit the storage budget` });
    }
  }
  return writeFirstThatFits(LS_KEY, ladder);
}
