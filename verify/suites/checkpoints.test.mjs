import { createRequire as __mjCreateRequire } from "node:module"; const require = __mjCreateRequire(import.meta.url);

// src/persist/quotaSafe.ts
var NOTICE_KEY = "vh.persist.notices";
var NOTICE_CAP = 40;
function resolveStorage(store) {
  if (store !== void 0) return store;
  try {
    const ls = globalThis.localStorage;
    return ls && typeof ls.setItem === "function" ? ls : null;
  } catch {
    return null;
  }
}
function isQuotaError(e) {
  if (!e || typeof e !== "object") return false;
  const name = e.name;
  const code = e.code;
  return name === "QuotaExceededError" || name === "NS_ERROR_DOM_QUOTA_REACHED" || code === 22 || code === 1014;
}
function persistNotices(store) {
  const s = resolveStorage(store);
  if (!s) return [];
  try {
    const raw = s.getItem?.(NOTICE_KEY) ?? null;
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
function notePersist(key, kind, detail, store) {
  const s = resolveStorage(store);
  if (!s) return;
  try {
    const list2 = persistNotices(s);
    list2.push({ at: (/* @__PURE__ */ new Date()).toISOString(), key, kind, detail });
    const trimmed = list2.slice(-NOTICE_CAP);
    s.setItem?.(NOTICE_KEY, JSON.stringify(trimmed));
  } catch {
  }
}
function writeFirstThatFits(key, ladder, store) {
  const rungs = ladder.length;
  const s = resolveStorage(store);
  if (rungs === 0) {
    const refused2 = "no payload was offered (empty write ladder) \u2014 nothing was written.";
    notePersist(key, "refused", refused2, store);
    return { ok: false, rung: -1, rungs, dropped: "", refused: refused2 };
  }
  if (!s) {
    return { ok: false, rung: -1, rungs, dropped: "", refused: "no storage on this host \u2014 the caller's in-memory copy is the session's only record." };
  }
  for (let i = 0; i < rungs; i++) {
    const rung = ladder[i];
    try {
      s.setItem(key, rung.value);
      if (i > 0) {
        notePersist(key, "degraded", `rung ${i}/${rungs - 1}: ${rung.dropped}`, s);
      }
      return { ok: true, rung: i, rungs, dropped: i > 0 ? rung.dropped : "" };
    } catch (e) {
      if (!isQuotaError(e)) {
        const refused2 = `write to "${key}" failed for a non-quota reason (${String(e)}) \u2014 refused rather than shrinking the payload, which would not have helped.`;
        notePersist(key, "refused", refused2, s);
        return { ok: false, rung: -1, rungs, dropped: "", refused: refused2 };
      }
    }
  }
  const refused = `every rung of the ladder failed on quota \u2014 even the smallest payload does not fit this origin. Nothing was written; the caller keeps its in-memory copy.`;
  notePersist(key, "refused", refused, s);
  return { ok: false, rung: -1, rungs, dropped: "", refused };
}

// src/graph/checkpoints.ts
var CHECKPOINT_CAP = 25;
var seq = 0;
var uid = (p) => `${p}${Date.now().toString(36)}${(seq++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;
function createCheckpoint(name, graph) {
  return {
    id: uid("cp"),
    name: name.trim() || "Untitled checkpoint",
    ts: (/* @__PURE__ */ new Date()).toISOString(),
    workflowId: graph.id,
    counts: { nodes: graph.nodes.length, connections: graph.connections.length },
    graph: structuredClone(graph)
  };
}
function graphsStructurallyEqual(a, b) {
  const strip = (g2) => JSON.stringify({ nodes: g2.nodes, connections: g2.connections, notes: g2.notes ?? [], groups: g2.groups ?? [] });
  return strip(a) === strip(b);
}
function addCheckpoint(list2, cp2) {
  if (list2.length > 0 && graphsStructurallyEqual(list2[0].graph, cp2.graph)) return { list: list2, skipped: true };
  return { list: [cp2, ...list2].slice(0, CHECKPOINT_CAP), skipped: false };
}
function restoreGraph(current, cp2) {
  const g2 = structuredClone(cp2.graph);
  g2.viewport = structuredClone(current.viewport);
  return g2;
}
var LS_KEY = "vh.checkpoints.v1";
var memory = [];
function loadCheckpoints() {
  try {
    if (typeof localStorage === "undefined") return memory;
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return memory;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : memory;
  } catch {
    return memory;
  }
}
function saveCheckpoints(list2) {
  memory.length = 0;
  memory.push(...list2);
  const rung = (n) => JSON.stringify(list2.slice(0, n));
  const ladder = [{ value: rung(list2.length), dropped: "" }];
  for (const keep of [12, 6, 3, 1]) {
    if (keep < list2.length) {
      ladder.push({ value: rung(keep), dropped: `kept the ${keep} newest checkpoint(s), dropped ${list2.length - keep} older one(s) to fit the storage budget` });
    }
  }
  return writeFirstThatFits(LS_KEY, ladder);
}

// src/domain/types.ts
var GRAPH_SCHEMA_VERSION = 2;

// probe/checkpoints.test.ts
var pass = 0;
var fail = 0;
var failures = [];
var ok = (label, cond, detail = "") => {
  if (cond) {
    pass += 1;
    console.log(`  ok   ${label}`);
  } else {
    fail += 1;
    failures.push(label);
    console.log(`  FAIL ${label}${detail ? ` \u2014 ${detail}` : ""}`);
  }
};
var section = (t) => console.log(`
== ${t} ==`);
var mkGraph = (id, nodeCount) => ({
  schemaVersion: GRAPH_SCHEMA_VERSION,
  id,
  name: `wf-${id}`,
  nodes: Array.from({ length: nodeCount }, (_, i) => ({
    id: `n${i}`,
    definitionId: "agent.coder",
    title: `Node ${i}`,
    x: i * 10,
    y: 0,
    purpose: "",
    inputs: [],
    outputs: [],
    config: {},
    rolePrompt: { system: "", user: "" },
    feedbackLoop: { enabled: false, maxRounds: 0, trigger: "never" },
    evolutionMode: "fixed",
    reflection: { enabled: false },
    permissions: { canWrite: false, canExecute: false, canBrowse: false },
    providers: [],
    contract: { timeoutMs: 6e4, retries: 0 }
  })),
  connections: [],
  viewport: { x: 1, y: 2, zoom: 0.7 },
  groups: [],
  notes: []
});
section("1. a checkpoint is a true copy of the moment");
var g = mkGraph("w1", 2);
var cp = createCheckpoint("before the rewire", g);
ok("the checkpoint captures node + wire counts", cp.counts.nodes === 2 && cp.counts.connections === 0, JSON.stringify(cp.counts));
g.nodes[0].title = "MUTATED";
ok("later mutations of the source graph never leak in", cp.graph.nodes[0].title === "Node 0", cp.graph.nodes[0].title);
ok("an empty name becomes a named checkpoint anyway", createCheckpoint("   ", g).name === "Untitled checkpoint", "");
section("2. equality is structural \u2014 the camera is not the work");
var moved = structuredClone(g);
moved.viewport = { x: 999, y: -40, zoom: 2 };
ok("panning/zooming is NOT a change worth saving", graphsStructurallyEqual(g, moved) === true, "");
var changed = structuredClone(g);
changed.nodes[0].x += 8;
ok("moving a node IS a change", graphsStructurallyEqual(g, changed) === false, "");
section("3. add policy: no duplicates of the newest, cap enforced");
var list = [];
var r1 = addCheckpoint(list, createCheckpoint("one", g));
ok("first checkpoint lands", r1.list.length === 1 && r1.skipped === false, "");
list = r1.list;
var r2 = addCheckpoint(list, createCheckpoint("same state again", g));
ok("an identical state is REFUSED, not stored", r2.skipped === true && r2.list.length === 1, JSON.stringify({ skipped: r2.skipped, len: r2.list.length }));
for (let i = 0; i < CHECKPOINT_CAP + 10; i++) {
  const gg = mkGraph(`w${i}`, 1);
  gg.nodes[0].title = `gen ${i}`;
  list = addCheckpoint(list, createCheckpoint(`cp ${i}`, gg)).list;
}
ok(`the ledger never exceeds ${CHECKPOINT_CAP} entries`, list.length === CHECKPOINT_CAP, `${list.length}`);
ok("the newest survives the trim, the oldest falls", list[0].name.startsWith("cp ") && !list.some((c) => c.name === "one"), list[list.length - 1]?.name);
section("4. restore keeps the human's camera");
var now = mkGraph("w1", 3);
now.viewport = { x: 42, y: 24, zoom: 1.4 };
var back = restoreGraph(now, cp);
ok("restored work comes from the checkpoint", back.nodes.length === 2 && back.nodes[0].title === "Node 0", `${back.nodes.length}`);
ok("the viewport stays where the human is looking", back.viewport.x === 42 && back.viewport.zoom === 1.4, JSON.stringify(back.viewport));
ok("restore does not mutate the checkpoint itself", cp.graph.nodes.length === 2, "");
section("5. persistence degrades to memory, never crashes");
saveCheckpoints([cp]);
var loaded = loadCheckpoints();
ok("what was saved can be loaded back (memory fallback in Node)", loaded.length === 1 && loaded[0].id === cp.id, `${loaded.length}`);
console.log(`
${pass} passed, ${fail} failed`);
if (fail > 0) {
  console.log("\nfailures:");
  for (const f of failures) console.log(`  - ${f}`);
}
process.exit(fail > 0 ? 1 : 0);
