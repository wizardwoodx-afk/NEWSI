/**
 * SelfImpulse — the conversation memory graph (19.7.0).
 *
 * The idea, stated plainly: every conversation becomes a GRAPH of its
 * keywords. Nodes are keywords, edges are co-occurrence, sessions carry the
 * dated, compressed transcript. Later, when the user says "that day when X
 * happened" or "continue the one about Y", the agent walks the graph by
 * keywords and date, finds the session, and REHYDRATES it: a compact,
 * honest context block built from that conversation's own messages, fed
 * forward so the chat continues from where it left off.
 *
 * Design floor, unchanged from the rest of VH:
 *   • local-first — the graph lives in this webview's store, guarded;
 *   • honest — a recall that finds nothing says so; a rehydrated context is
 *     MARKED as rehydrated inside the prompt text itself, so no member or
 *     captain can mistake it for live memory;
 *   • deterministic — extraction and scoring are pure functions; probes
 *     pin the same input to the same graph.
 *
 * Token synergy: rehydration feeds DIGESTS (keywords + trimmed turns), not
 * full transcripts — the memory layer is itself a token optimizer.
 */

import { vaultStatus, vaultSeal, vaultDecrypt } from "./vault";
import { writeFirstThatFits, type PersistRung } from "../persist/quotaSafe";

const GRAPH_KEY = "engine.memgraph.v1";
const ENABLED_KEY = "engine.memgraph.enabled.v1";
const NODE_CAP = 4000;
const EDGE_CAP = 9000;
const SESSION_CAP = 300;
const MSG_CAP_PER_SESSION = 200;

export interface MgMessage { role: "user" | "vh"; text: string; at: string }

export interface MgSession {
  id: string;
  title: string;
  startedAt: string;
  endedAt: string;
  messageCount: number;
  keywords: string[];
  /** sha-free content digest for identity (fnv — fast, non-cryptographic, honest) */
  digest: string;
  messages: MgMessage[];
}

export interface MgNode { id: string; label: string; weight: number; firstSeen: string; lastSeen: string; sessionIds: string[] }
export interface MgEdge { a: string; b: string; weight: number; sessionIds: string[] }
export interface MgGraph {
  version: 1;
  nodes: MgNode[];
  edges: MgEdge[];
  sessions: MgSession[];
  updatedAt: string;
  /** 19.7.13 — running totals of what the caps have pruned. Absent on graphs
   *  written before this build (treated as zero, never as "nothing was lost"). */
  evicted?: { nodes: number; edges: number; sessions: number; at: string };
}

/* ── stopword floor (short, closed list — deterministic, no surprises) ──── */
const STOP = new Set(
  ("a an the and or but if then else of to in on at for with from by as is are was were be been being do does did " +
    "i you he she it we they me him her us them my your his its our their this that these those there here what " +
    "which who whom when where why how not no yes so than too very can will just should now also into about over " +
    "under again once only own same s t don ll re ve m y need want make made get got go went have has had please " +
    "thanks thank okay ok hi hello hey uh um the thing things something anything nothing everything").split(" "),
);

/**
 * Deterministic keyword extraction: tokenize, drop stopwords/numbers,
 * score by frequency × length, capitalize first-occurrence bonus, sort by
 * (score desc, alpha asc) and take the top N. Same text in, same list out.
 */
export function extractKeywords(text: string, max = 8): string[] {
  const words = text.toLowerCase().replace(/[^a-z0-9\s'-]/g, " ").split(/\s+/).filter(Boolean);
  const freq = new Map<string, number>();
  const caps = new Set<string>();
  for (const raw of text.split(/\s+/)) {
    const w = raw.toLowerCase().replace(/[^a-z0-9\s'-]/g, "");
    if (!w) caps.add("__noop__");
  }
  // capitalized-token detection on the ORIGINAL text (proper nouns rank up)
  const capTokens = new Set<string>();
  for (const raw of text.split(/\s+/)) {
    const cleaned = raw.replace(/[^A-Za-z0-9'-]/g, "");
    if (cleaned.length > 2 && /^[A-Z]/.test(cleaned) && !STOP.has(cleaned.toLowerCase())) {
      capTokens.add(cleaned.toLowerCase());
    }
  }
  for (const w of words) {
    const t = w.replace(/^-+|-+$/g, "");
    if (t.length < 3 || STOP.has(t) || /^\d+$/.test(t)) continue;
    freq.set(t, (freq.get(t) ?? 0) + 1);
  }
  const scored = Array.from(freq.entries()).map(([word, f]) => {
    let score = f * (1 + Math.min(1, (word.length - 3) / 8));
    if (capTokens.has(word)) score *= 1.5;
    return { word, score };
  });
  scored.sort((a, b) => (b.score - a.score) || (a.word < b.word ? -1 : a.word > b.word ? 1 : 0));
  return scored.slice(0, Math.max(1, max)).map((s) => s.word);
}

function hash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  let h2 = 0x811c9dc5 ^ 0x9e3779b9;
  for (let i = text.length - 1; i >= 0; i--) { h2 ^= text.charCodeAt(i); h2 = Math.imul(h2, 0x01000193); }
  return (h >>> 0).toString(16).padStart(8, "0") + (h2 >>> 0).toString(16).padStart(8, "0");
}

function storage(): Storage | null {
  try { return globalThis.localStorage ?? null; } catch { return null; }
}

const EMPTY: MgGraph = { version: 1, nodes: [], edges: [], sessions: [], updatedAt: new Date(0).toISOString() };

/* No storage (plain Node, sandboxed quirks) ⇒ the graph lives in this
 * module's memory for the process lifetime — stated, not hidden. With
 * storage, the cache just mirrors the store.
 *
 * 19.7.1 — ENCRYPTION AT REST. The 19.7.0 review was right: session
 * messages are conversation content, and they sat in plaintext storage.
 * Now: when the owner vault is UNLOCKED, the graph persists ONLY as an
 * AES-256-GCM sealed record (plaintext copies are removed the moment a
 * passphrase exists); when the vault is locked or absent the graph
 * persists as PLAINTEXT and `graphSecurityStatus()` says so in words —
 * it never pretends. Reads stay synchronous from memCache; a sealed
 * store hydrates via `hydrateGraph()` after unlock. */
let memCache: MgGraph | null = null;
let lockedAtBoot = false;
let saveToken = 0;
let persistNote: string | null = null;
let persistInFlight: Promise<void> = Promise.resolve();

/** Await the in-flight sealed write — deterministic probes and tests use this. */
export function flushGraphPersist(): Promise<void> {
  return persistInFlight;
}

function isSealedEnvelope(raw: string | null): boolean {
  if (!raw) return false;
  try {
    const parsed = JSON.parse(raw) as { v?: unknown };
    return parsed?.v === "si-vault/1";
  } catch {
    return false;
  }
}

function loadGraph(): MgGraph {
  const s = storage();
  if (!s) {
    if (!memCache) memCache = { ...EMPTY, nodes: [], edges: [], sessions: [] };
    return memCache;
  }
  const raw = s.getItem(GRAPH_KEY);
  if (isSealedEnvelope(raw)) {
    // sealed at rest: synchronous reads come from memCache; hydration is explicit
    if (!memCache) { lockedAtBoot = true; memCache = { ...EMPTY }; }
    return memCache;
  }
  lockedAtBoot = false;
  try {
    const parsed = JSON.parse(raw ?? "null") as MgGraph | null;
    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.nodes) || !Array.isArray(parsed.edges) || !Array.isArray(parsed.sessions)) {
      if (!memCache) memCache = { ...EMPTY };
      return memCache;
    }
    memCache = parsed;
    return parsed;
  } catch {
    if (!memCache) memCache = { ...EMPTY };
    return memCache;
  }
}

function saveGraph(g: MgGraph): void {
  memCache = g;
  const s = storage();
  if (!s) return; // no storage ⇒ the graph lives for this session only; stated, not hidden
  g.updatedAt = new Date().toISOString();
  const token = ++saveToken;
  if (vaultStatus().status === "unlocked") {
    // sealed-only persistence: no plaintext copy survives an unlock
    s.removeItem(GRAPH_KEY);
    persistInFlight = (async () => {
      try {
        const r = await vaultSeal(GRAPH_KEY, JSON.stringify(g));
        if (!r.ok && token === saveToken) persistNote = r.error;
        else if (token === saveToken) persistNote = null;
      } catch (e) {
        if (token === saveToken) persistNote = `sealing failed: ${String(e)} — the graph stays in memory this session rather than downgrading to plaintext silently`;
      }
    })();
    return;
  }
  // 19.7.13 — the plaintext path walks a LADDER instead of swallowing the
  // quota throw. Before this, a full origin meant the whole graph lived only
  // in memory (and the session's transcript was gone at reload) with a code
  // comment as the only witness. Now the degradation is chosen, bounded and
  // NAMED: rung 0 is the whole graph; each rung below keeps more of what makes
  // a session findable (date, title, keywords) and less of the raw transcript,
  // because the keyword graph is the product while the transcript is weight.
  const trimmed = (turnCap: number | null, sessionCap: number): string => {
    const cut: MgGraph = {
      ...g,
      sessions: g.sessions.slice(-sessionCap).map((x) => ({
        ...x,
        messages: turnCap === null ? [] : x.messages.slice(-turnCap),
      })),
    };
    return JSON.stringify(cut);
  };
  const ladder: PersistRung[] = [{ value: JSON.stringify(g), dropped: "" }];
  if (g.sessions.some((x) => x.messages.length > 40)) {
    ladder.push({ value: trimmed(40, g.sessions.length), dropped: "kept the last 40 turns of each conversation (older turns dropped to fit the storage budget)" });
  }
  if (g.sessions.some((x) => x.messages.length > 10)) {
    ladder.push({ value: trimmed(10, g.sessions.length), dropped: "kept the last 10 turns of each conversation (older turns dropped to fit the storage budget)" });
  }
  if (g.sessions.some((x) => x.messages.length > 0)) {
    ladder.push({ value: trimmed(null, g.sessions.length), dropped: "dropped the transcripts; every conversation still keeps its date, title and keywords, so recall still finds it" });
  }
  if (g.sessions.length > 50) {
    ladder.push({ value: trimmed(10, 50), dropped: `kept the newest 50 conversations of ${g.sessions.length} (older ones dropped to fit the storage budget)` });
  }
  const w = writeFirstThatFits(GRAPH_KEY, ladder, s);
  persistNote = w.ok ? (w.rung > 0 ? `memory degraded to fit storage — ${w.dropped}` : null) : (w.refused ?? null);
}

/**
 * 19.7.1 — hydrate a sealed graph after the vault is unlocked (call this
 * from the console whenever the passphrase changes). Honest returns:
 * `locked` when the store is sealed and the vault is not, `loaded` when
 * the in-memory graph now reflects storage.
 */
export async function hydrateGraph(): Promise<{ sealed: boolean; locked: boolean; loaded: boolean }> {
  const s = storage();
  const raw = s?.getItem(GRAPH_KEY) ?? null;
  if (!isSealedEnvelope(raw)) {
    lockedAtBoot = false;
    loadGraph();
    return { sealed: false, locked: false, loaded: true };
  }
  const r = await vaultDecrypt(GRAPH_KEY);
  if (!r.found) return { sealed: true, locked: false, loaded: false };
  if (r.locked) { lockedAtBoot = true; return { sealed: true, locked: true, loaded: false }; }
  try {
    const parsed = JSON.parse(r.text) as MgGraph;
    if (parsed && parsed.version === 1) { memCache = parsed; lockedAtBoot = false; return { sealed: true, locked: false, loaded: true }; }
  } catch { /* a sealed record that decrypts to junk is treated as absent — stated via loaded:false */ }
  return { sealed: true, locked: false, loaded: false };
}

export type GraphSecurityMode = "plaintext" | "sealed" | "locked";

export function graphSecurityStatus(): { mode: GraphSecurityMode; enabled: boolean; note: string | null } {
  const vs = vaultStatus().status;
  const s = storage();
  const sealedOnDisk = isSealedEnvelope(s?.getItem(GRAPH_KEY) ?? null);
  const mode: GraphSecurityMode = sealedOnDisk ? (vs === "unlocked" ? "sealed" : "locked") : "plaintext";
  const bootNote = lockedAtBoot && mode !== "sealed" ? "this graph is sealed on disk and stays hidden until the vault is unlocked" : null;
  return { mode, enabled: memoryEnabled(), note: persistNote ?? bootNote };
}

/* ── the user-controlled memory switch (19.7.1) ─────────────────────────── */
export function memoryEnabled(): boolean {
  const s = storage();
  if (!s) return true; // no store ⇒ nothing persists anyway
  return s.getItem(ENABLED_KEY) !== "off";
}

export function setMemoryEnabled(on: boolean): void {
  const s = storage();
  if (!s) return;
  s.setItem(ENABLED_KEY, on ? "on" : "off");
}

/** The live graph (memory copy when storage is unavailable). */
export function graph(): MgGraph {
  return loadGraph();
}

/** Title a session from its first user message — deterministic. */
export function titleFromMessages(messages: MgMessage[]): string {
  const first = messages.find((m) => m.role === "user")?.text ?? messages[0]?.text ?? "a conversation";
  const t = first.replace(/\s+/g, " ").trim();
  return t.length > 52 ? `${t.slice(0, 49)}…` : t || "a conversation";
}

/**
 * Upsert a conversation as a session and merge its keywords into the graph.
 * Same id ⇒ the session is replaced (a growing chat keeps updating itself)
 * and the graph merge is idempotent per session (sessionIds are set-merged).
 */
export function ingestSession(messages: MgMessage[], opts: { id: string; title?: string; startedAt?: string; endedAt?: string } ): MgSession {
  if (!memoryEnabled()) {
    // the switch is the user's: memory OFF means nothing is learned or stored — stated by graphSecurityStatus()
    return {
      id: opts.id, title: opts.title ?? "memory off", startedAt: opts.startedAt ?? "", endedAt: opts.endedAt ?? "",
      messageCount: messages.length, keywords: [], digest: "memory-off", messages: [],
    };
  }
  const texts = messages.map((m) => m.text).join("\n");
  const keywords = extractKeywords(texts, 10);
  const session: MgSession = {
    id: opts.id,
    title: opts.title ?? titleFromMessages(messages),
    startedAt: opts.startedAt ?? messages[0]?.at ?? new Date().toISOString(),
    endedAt: opts.endedAt ?? messages[messages.length - 1]?.at ?? new Date().toISOString(),
    messageCount: messages.length,
    keywords,
    digest: hash(texts),
    messages: messages.slice(-MSG_CAP_PER_SESSION),
  };
  const g = loadGraph();
  const prev = g.sessions.find((x) => x.id === session.id);
  g.sessions = g.sessions.filter((x) => x.id !== session.id);
  g.sessions.push(session);
  if (g.sessions.length > SESSION_CAP) g.sessions.splice(0, g.sessions.length - SESSION_CAP);

  // keyword co-occurrence edges within the session (complete graph on the keywords, capped)
  const kw = session.keywords;
  for (const k of kw) {
    const n = g.nodes.find((x) => x.id === k);
    if (n) {
      // idempotent per session: a session re-upsert adds no weight twice
      n.weight += prev && n.sessionIds.includes(session.id) ? 0 : 1;
      n.lastSeen = session.endedAt;
      if (!n.sessionIds.includes(session.id)) n.sessionIds.push(session.id);
    } else {
      g.nodes.push({ id: k, label: k, weight: 1, firstSeen: session.endedAt, lastSeen: session.endedAt, sessionIds: [session.id] });
    }
  }
  for (let i = 0; i < kw.length; i++) {
    for (let j = i + 1; j < kw.length; j++) {
      const [a, b] = kw[i] < kw[j] ? [kw[i], kw[j]] : [kw[j], kw[i]];
      const e = g.edges.find((x) => x.a === a && x.b === b);
      if (e) {
        e.weight += prev && e.sessionIds.includes(session.id) ? 0 : 1;
        if (!e.sessionIds.includes(session.id)) e.sessionIds.push(session.id);
      } else {
        g.edges.push({ a, b, weight: 1, sessionIds: [session.id] });
      }
    }
  }
  // 19.7.13 — eviction is now COUNTED and reported. It was always silent:
  // nodes and edges over the cap were sliced away with nothing recording that
  // the graph had been pruned, so a user whose memory had quietly shrunk had
  // no way to learn it. The counts ride on the graph and surface through
  // graphStats(); the policy itself is unchanged.
  const sessionsDropped = Math.max(0, g.sessions.length - SESSION_CAP);
  let nodesDropped = 0;
  let edgesDropped = 0;
  if (g.nodes.length > NODE_CAP) {
    nodesDropped = g.nodes.length - NODE_CAP;
    g.nodes = g.nodes.sort((x, y) => (y.weight - x.weight) || (y.lastSeen < x.lastSeen ? -1 : 1)).slice(0, NODE_CAP);
  }
  if (g.edges.length > EDGE_CAP) {
    edgesDropped = g.edges.length - EDGE_CAP;
    g.edges = g.edges.sort((x, y) => (y.weight - x.weight) || 0).slice(0, EDGE_CAP);
  }
  if (nodesDropped || edgesDropped || sessionsDropped) {
    g.evicted = {
      nodes: (g.evicted?.nodes ?? 0) + nodesDropped,
      edges: (g.evicted?.edges ?? 0) + edgesDropped,
      sessions: (g.evicted?.sessions ?? 0) + sessionsDropped,
      at: session.endedAt,
    };
  }
  saveGraph(g);
  return session;
}

export function listSessions(): MgSession[] {
  return loadGraph().sessions.slice().sort((a, b) => (a.endedAt < b.endedAt ? 1 : -1));
}

export function getSession(id: string): MgSession | null {
  return loadGraph().sessions.find((s) => s.id === id) ?? null;
}

export function deleteSession(id: string): void {
  if (!memoryEnabled()) return;
  const g = loadGraph();
  g.sessions = g.sessions.filter((s) => s.id !== id);
  for (const n of g.nodes) n.sessionIds = n.sessionIds.filter((x) => x !== id);
  for (const e of g.edges) e.sessionIds = e.sessionIds.filter((x) => x !== id);
  saveGraph(g);
}

export function clearGraph(): void {
  const s = storage();
  if (s) { s.removeItem(GRAPH_KEY); s.removeItem(ENABLED_KEY); }
  memCache = null;
  lockedAtBoot = false;
  persistNote = null;
}

/* ── date parsing for "that day when X" recall ──────────────────────────── */

/**
 * 19.7.13 — RECALL WIDENING. The graph is built from keywords, which made the
 * memory exact-match only: "what did we decide about the sandbox" found a
 * session whose keywords said `sandbox`, but "that time we dealt with the
 * container escape" found NOTHING, because `container` and `escape` were never
 * nodes. That is a retrieval ceiling, not a bug — but it made a memory that
 * "works" feel like it "forgot".
 *
 * The fix is deliberately CLOSED. Only the words below widen, and only in the
 * direction written here; a query with no known word in it still recalls
 * nothing, which is the honest answer and the one the probes pin. This is
 * therefore still deterministic and still cheap — no embeddings, no network, no
 * model call in the recall path. An eventual semantic seat belongs BESIDE this
 * (as a resolver that maps a paraphrase to one of these terms), never inside it.
 */
const ALIAS_GROUPS: string[][] = [
  ["sandbox", "sandboxed", "isolation", "isolate", "jail", "confinement", "container"],
  ["database", "db", "sql", "postgres", "postgresql", "sqlite", "query", "storage"],
  ["receipt", "receipts", "proof", "attestation", "ledger", "audit", "tamper"],
  ["gate", "approval", "approve", "signoff", "oversight", "human"],
  ["error", "bug", "failure", "failed", "crash", "broke", "broken", "defect"],
  ["deploy", "deployment", "release", "ship", "shipped", "rollout", "publish"],
  ["key", "credential", "secret", "token", "password", "vault", "passphrase"],
  ["memory", "recall", "remember", "context", "history", "rehydrate"],
  ["test", "tests", "testing", "spec", "probe", "suite"],
  ["invoice", "bill", "payment", "billing", "charge", "refund", "subscription"],
  ["meeting", "call", "calendar", "schedule", "appointment", "booking", "reservation"],
  ["travel", "flight", "trip", "itinerary", "hotel", "airline"],
  ["permission", "scope", "authority", "envelope", "mandate", "capability"],
  ["cost", "price", "pricing", "budget", "spend", "token"],
  ["agent", "crew", "specialist", "teammate", "steward"],
];

const ALIAS_OF = new Map<string, string[]>();
for (const group of ALIAS_GROUPS) {
  for (const term of group) {
    const set = ALIAS_OF.get(term) ?? [];
    for (const other of group) if (other !== term && !set.includes(other)) set.push(other);
    set.push(term);
    ALIAS_OF.set(term, set);
  }
}

/** Light, deterministic suffix normalization so "sandboxed"/"sandboxing" meet
 *  "sandbox". Never shortens a word below four characters, so short tokens are
 *  left exactly as typed. */
export function stem(word: string): string {
  for (const suffix of ["ing", "ed", "es", "s"]) {
    if (word.endsWith(suffix) && word.length - suffix.length >= 4) return word.slice(0, -suffix.length);
  }
  return word;
}

/** Every term an alias is allowed to widen to. Unknown words widen to themselves only. */
export function aliasesOf(word: string): string[] {
  return ALIAS_OF.get(word) ?? [word];
}

/**
 * Substring matching inside message text is a PRECISION hazard, not just a
 * performance one: a query word "out" used to match the word "outside", so a
 * session could be recalled on a fragment and the user would be shown a
 * conversation that never discussed the thing. The cheap `includes` stays as a
 * prefilter — true substring hits are rare, so the regex below almost never
 * runs — and the match is confirmed on a word boundary before it counts.
 */
const escapeRe = (t: string): string => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
function wordHit(lowerText: string, term: string): boolean {
  if (!lowerText.includes(term)) return false;
  return new RegExp(`(^|[^a-z0-9])${escapeRe(term)}([^a-z0-9]|$)`).test(lowerText);
}

export interface Recalled { session: MgSession; score: number; matchedKeywords: string[]; dateMatch: boolean }

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** Parse a query's date window. Returns [startMs, endMs] or null. Deterministic, UTC-day based. */
export function parseDateWindow(query: string, now: () => Date = () => new Date()): [number, number] | null {
  const q = query.toLowerCase();
  const day = 24 * 3600 * 1000;
  const startOfDay = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const n = now();
  const todayStart = startOfDay(n);

  const rel = /(\d+)\s*(day|days|week|weeks|month|months)\s+ago/.exec(q);
  if (rel) {
    const span = Number(rel[1]);
    const unit = rel[2].startsWith("week") ? 7 * day : rel[2].startsWith("month") ? 30 * day : day;
    const end = todayStart + day;
    return [todayStart - span * unit, end];
  }
  if (/\byesterday\b/.test(q)) return [todayStart - day, todayStart];
  if (/\btoday\b/.test(q)) return [todayStart, todayStart + day];
  if (/\blast\s+week\b/.test(q)) return [todayStart - 7 * day, todayStart + day];
  if (/\blast\s+month\b/.test(q)) return [todayStart - 30 * day, todayStart + day];
  const iso = /(\d{4})-(\d{2})-(\d{2})/.exec(q);
  if (iso) {
    const t = Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
    return [t, t + day];
  }
  // "on 12 march", "march 12", "12 march 2026"
  const dmy = /(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]{3})[a-z]*(?:\s+(\d{4}))?/.exec(q);
  const myd = /([a-z]{3})[a-z]*\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?/.exec(q);
  const m = dmy ?? myd;
  if (m) {
    const dayN = dmy ? Number(m[1]) : Number(m[2]);
    const monStr = dmy ? m[2] : m[1];
    const mon = MONTHS.indexOf(monStr.slice(0, 3));
    if (mon >= 0 && dayN >= 1 && dayN <= 31) {
      const year = Number(m[3] ?? n.getUTCFullYear());
      const t = Date.UTC(year, mon, dayN);
      return [t, t + day];
    }
  }
  return null;
}

/**
 * Recall sessions by a natural query: keyword overlap on the session's own
 * keywords (and its messages' text), plus a date window when one parses.
 * A date-only query ranks by recency inside the window; a keyword-only
 * query by overlap × node weight. Honest: no match ⇒ [].
 */
export function recall(query: string, limit = 5, now: () => Date = () => new Date()): Recalled[] {
  const g = loadGraph();
  if (g.sessions.length === 0) return [];
  const qk = extractKeywords(query, 10);
  const win = parseDateWindow(query, now);
  const weightOf = new Map(g.nodes.map((n) => [n.id, n.weight]));

  // Widen each typed word through the closed alias/stem map. The Map is keyed by
  // the EXPANDED term and valued by the word the human actually typed, so
  // matchedKeywords can always report the query in the user's own words —
  // expansion never changes what recall CLAIMS it matched on.
  // Insertion order is stable, so scoring is deterministic.
  const probes = new Map<string, string>();
  const addProbe = (term: string, original: string): void => {
    if (!probes.has(term)) probes.set(term, original);
  };
  for (const word of qk) {
    addProbe(word, word);
    addProbe(stem(word), word);
    for (const alias of aliasesOf(word)) {
      addProbe(alias, word);
      addProbe(stem(alias), word);
    }
  }

  const out: Recalled[] = [];
  for (const s of g.sessions) {
    const sKeys = new Set<string>();
    for (const k of s.keywords) { sKeys.add(k); sKeys.add(stem(k)); }
    // 19.7.13 — PERF. This loop runs once per (probe × session) and the probe
    // set is 30-60 entries deep once aliases and stems expand, so lowercasing
    // every message inside it lowercased the whole transcript dozens of times
    // per query. Lower the transcript ONCE here and search the prepared text.
    // Same matches, same order — the work just happens once instead of N times.
    const hay = s.messages.map((msg) => msg.text.toLowerCase());
    const seen = new Set<string>();
    const matched: string[] = [];
    for (const [term, original] of probes) {
      if (seen.has(original)) continue;
      // the keyword set is checked first because it is a Set lookup: when it
      // hits, the transcript scan is skipped entirely.
      if (sKeys.has(term) || hay.some((text) => wordHit(text, term))) {
        seen.add(original);
        matched.push(original);
      }
    }
    let score = matched.reduce((acc, k) => acc + 1 + Math.min(2, (weightOf.get(k) ?? weightOf.get(stem(k)) ?? 1) / 10), 0);
    const inWin = win ? Date.parse(s.startedAt) >= win[0] && Date.parse(s.startedAt) < win[1] : false;
    if (win) score += inWin ? 2.5 : -1.5; // a date query that misses the window demotes hard
    if (score <= 0) continue;
    out.push({ session: s, score, matchedKeywords: matched, dateMatch: inWin });
  }
  out.sort((a, b) => b.score - a.score || (a.session.endedAt < b.session.endedAt ? 1 : -1));
  return out.slice(0, limit);
}

/** The marker that rides every rehydrated prompt — rehydration is never silent. */
export const REHYDRATION_MARK = "── rehydrated context (from an earlier conversation";

/**
 * Build the rehydration preamble for a session: title, dates, keywords and
 * the most recent turns, trimmed. This text is PREPENDED to the user's new
 * message and marked, so the whole crew sees it as context, not as a claim.
 */
export function rehydrate(sessionId: string, maxTurns = 8, perMessageCap = 240): { preamble: string; session: MgSession } | null {
  const s = getSession(sessionId);
  if (!s) return null;
  const turns = s.messages.slice(-maxTurns);
  const lines: string[] = [];
  lines.push(`${REHYDRATION_MARK} "${s.title}") ──`);
  lines.push(`took place ${s.startedAt.slice(0, 10)} → ${s.endedAt.slice(0, 10)} · ${s.messageCount} message(s) · keywords: ${s.keywords.join(", ")}`);
  lines.push("prior exchange (most recent last, trimmed):");
  for (const m of turns) {
    const who = m.role === "user" ? "user" : "steward";
    const t = m.text.replace(/\s+/g, " ").trim();
    lines.push(`${who}: ${t.length > perMessageCap ? `${t.slice(0, perMessageCap - 1)}…` : t}`);
  }
  lines.push("── end of rehydrated context — continue naturally from the user's new message below ──");
  return { preamble: lines.join("\n"), session: s };
}

/** What the Memory Graphs panel renders: top-weighted nodes + their edges. */
export function graphView(maxNodes = 24): { nodes: MgNode[]; edges: MgEdge[] } {
  const g = loadGraph();
  const nodes = g.nodes.slice().sort((a, b) => b.weight - a.weight || a.id.localeCompare(b.id)).slice(0, maxNodes);
  const ids = new Set(nodes.map((n) => n.id));
  const edges = g.edges.filter((e) => ids.has(e.a) && ids.has(e.b)).slice(0, 80);
  return { nodes, edges };
}

/** Cheap stats line for the UI. */
export function graphStats(): { sessions: number; nodes: number; edges: number; evicted: { nodes: number; edges: number; sessions: number; at: string } | null } {
  const g = loadGraph();
  // 19.7.13 — `evicted` is null ONLY when nothing has ever been pruned. A graph
  // written before this build has no record either way, and reporting null for
  // it is correct: this function never claims to know about a past it did not
  // witness. The UI reads it to say, in words, that memory has been trimmed.
  return { sessions: g.sessions.length, nodes: g.nodes.length, edges: g.edges.length, evicted: g.evicted ?? null };
}
