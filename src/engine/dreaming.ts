/**
 * SelfImpulse — DREAMING: consolidation memory.
 *
 * ── WHAT WAS WRONG WITH THE MEMORY WE HAD ────────────────────────────────────
 * `engine/memory.ts` keeps a ledger of accept/reject/correction records, capped
 * at 500, and `memoryBriefing()` hands a specialist the last four rejections
 * verbatim. That is a RECEIPT FILE. It answers "what happened" and never answers
 * "what have we learned", for three reasons that are worth naming:
 *
 *   1. It has no notion of repetition. One bad afternoon and forty consistent
 *      signals look identical in the output.
 *   2. It is unbounded in what it will say. The 500th record is handed to a
 *      specialist with exactly the same confidence as the first, so the prompt
 *      gets longer as the evidence gets thinner.
 *   3. Nothing is ever forgotten. A preference the user reversed in March still
 *      reads as current in September.
 *
 * ── WHAT DREAMING ADDS ───────────────────────────────────────────────────────
 * A memory that EARNS its place. Three phases, and the names are load-bearing:
 *
 *   STAGE        New records are marked for this cycle. Nothing is interpreted
 *                yet — staging makes no claims, it only draws a line under what
 *                has already been looked at.
 *
 *   CONSOLIDATE  Read the staged window and find what REPEATS: a rejection
 *                reason the user keeps giving, a specialist whose work keeps
 *                being refused, a shape of ask that keeps coming back, a
 *                correction aimed at the same kind of target.
 *
 *   PROMOTE      A repeated thing becomes a durable memory ONLY if it clears
 *                every gate. A candidate that fails a gate is not stored and is
 *                not lost — it is re-counted next cycle, so three slow signals
 *                eventually promote and one loud one never does.
 *
 * This is a consolidation pass in the same sense as sleep consolidation: short-
 * term signals are replayed, patterns are extracted, and only the patterns that
 * survive thresholds are written to long-term store. The idea is borrowed; the
 * LOGIC — the reader, the fingerprint, the gates, the strength curve — is this
 * product's own, operating on this product's own DecisionRecords.
 *
 * ── THE FOUR GATES, AND WHY EACH ONE EXISTS ──────────────────────────────────
 *   MIN_EVIDENCE   Repetition. Below 3 sightings there is no pattern, only
 *                  coincidence. This is the gate the old briefing lacked.
 *   MIN_SESSIONS   Independence. The same user hitting the same wall three times
 *                  in one sitting is ONE event, not three. Requiring the
 *                  evidence to span at least two days stops a single frustrated
 *                  session from hardening into a belief about the user.
 *   MIN_CONFIDENCE The pattern's own strength has to clear a floor, and
 *                  confidence is computed from how MUCH evidence and how WIDELY
 *                  it is spread — not from a count alone.
 *   REVERSIBLE     A promoted memory can be undone by the opposite signal.
 *                  Strength decays when it is not reconfirmed, and a memory that
 *                  falls below the floor is RETIRED, not deleted — so a reversal
 *                  is visible in the record rather than silently absent.
 *
 * ── RECALL: THE PART THAT ACTUALLY REACHES THE MODEL ─────────────────────────
 * `recall()` scores durable memories against the CURRENT turn and returns the
 * few that are relevant. This is the difference between a bigger prompt and a
 * better one: the ledger grew without bound, while the recall set is capped and
 * ranked, so a specialist sees the three things that bear on this ask rather
 * than the four most recent rejections whether or not they matter.
 *
 * Local-first, like every other store here: this runs on-device, writes to the
 * same webview-local store the engine already uses, and sends nothing anywhere.
 */
import { uid, nowIso } from "../app/id";
import { loadMemory } from "./memory";
import type { DecisionRecord } from "./types";

const WATERMARK_KEY = "engine.dream.v1";
const DURABLE_KEY = "engine.dream.mem.v1";

/* ── the gates ───────────────────────────────────────────────────────────────
 * Named constants, exported, because a threshold you cannot read is a threshold
 * nobody can argue with. Each one is a floor, never a target. */
export const MIN_EVIDENCE = 3;
export const MIN_SESSIONS = 2;
export const MIN_CONFIDENCE = 0.6;
/** Below this strength a durable memory is retired rather than shown. */
export const RETIRE_BELOW = 0.25;
/** A reconfirmation adds this much. */
export const STRENGTH_GAIN = 0.34;
/** Decay is charged per SILENT DAY, not per pass. See the note in dreamPass:
 *  a schedule must not be what decides whether a belief survives. */
export const STRENGTH_DECAY = 0.15;
/** A belief is not punished for a quiet weekend. */
export const DECAY_GRACE_DAYS = 2;
export const DURABLE_CAP = 120;

export type MemoryKind = "preference" | "caution" | "rhythm" | "correction";

export interface DurableMemory {
  id: string;
  /** The fingerprint this memory was promoted from. Kept so a later cycle can
   *  recognise that a live belief and a new pattern are THE SAME belief, and
   *  reconfirm it rather than promoting a duplicate beside it. */
  key: string;
  /** The words behind it, most-supported first. The key is a fingerprint, and a
   *  fingerprint legitimately drifts as evidence accumulates; the words are what
   *  make a later sighting recognisable as the same belief anyway. */
  words?: string[];
  /** Whose memory this is. The ledger has always been per-user; a consolidated
   *  belief has to be too, or one person's habits would be briefed to another. */
  userId: string;
  /** When it was promoted. */
  ts: string;
  kind: MemoryKind;
  /** One plain sentence. This is what reaches the model, so it has to read. */
  statement: string;
  /** Why we believe it — the record ids behind it, so it can be checked. */
  evidence: string[];
  /** How many times it has been sighted, across how many distinct days. */
  sightings: number;
  days: number;
  /** 0..1. Grows on reconfirmation, decays when quiet, retires below the floor. */
  strength: number;
  lastSeen: string;
  /** The last day decay was charged for. Without it, two passes on the same day
   *  would charge the same silence twice. */
  decayedAt?: string;
  retired: boolean;
}

export interface DreamCandidate {
  kind: MemoryKind;
  /** The fingerprint — what makes two sightings THE SAME thing. */
  key: string;
  statement: string;
  evidence: string[];
  sightings: number;
  days: number;
  confidence: number;
  /** The words the sightings actually share, most-supported first. Carried so a
   *  held candidate can be matched against a later sighting without re-reading
   *  the ledger — and so the match is over RECORD words, never over the words of
   *  a rendered sentence. */
  words: string[];
  /** What the belief is NAMED for: the work, not the complaint. */
  subject: string[];
  /** The longest reason behind it, so the sentence can carry its evidence. */
  detail: string;
  /** The distinct days the EVIDENCE fell on.
   *
   *  Taken from the records, never from the clock at consolidation time. A pass
   *  that runs once, after three days of complaints, is still evidence of three
   *  days — a candidate that recorded the pass's own date instead would hold
   *  three separate days' evidence as a single day, which is the independence
   *  gate refusing everything it should have promoted. */
  dayKeys: string[];
  /** The gate that stopped it, or null when it promoted. Honest, per candidate. */
  blockedBy: string | null;
}

export interface DreamReport {
  staged: number;
  consolidated: number;
  promoted: number;
  /** Candidates that repeated but did NOT clear a gate — with the reason. */
  held: DreamCandidate[];
  retired: number;
  at: string;
}

/* ── storage, the same shape every engine store here uses ───────────────────── */

function storage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

/** A candidate that repeated but did not clear a gate.
 *
 *  This is the half that made "held" mean "thrown away". The watermark below
 *  marks every staged record as consumed, which is right — a record must not be
 *  counted twice — but consuming a record is only safe if its EVIDENCE survives
 *  somewhere. It survives here: the accumulated sightings, the distinct days and
 *  the record ids behind a candidate that is not yet believed. A pass merges the
 *  new sightings into this and re-runs the gates on the union, so 1 + 1 + 1 over
 *  three days promotes on the third day, which is what the gates always claimed.
 */
interface PendingCandidate {
  userId: string;
  kind: MemoryKind;
  key: string;
  /** The keyword profile, as words, so a later sighting is recognised as the same thing. */
  words: string[];
  /** The work words, when the held candidate has any. */
  subject?: string[];
  /** The longest reason seen so far. */
  detail?: string;
  /** Record ids already counted — so nothing is ever counted twice. */
  evidence: string[];
  sightings: number;
  /** Distinct days, kept as a list rather than a tally so a union is exact. */
  dayKeys: string[];
  firstSeen: string;
  lastSeen: string;
}

/** Held candidates are capped too. The oldest sighting gives way first. */
export const PENDING_CAP = 80;

interface Watermark {
  /** Record ids already consolidated. Ids, not a timestamp: two records can
   *  share a millisecond and a timestamp watermark would silently drop one. */
  seen: string[];
  lastPass: string | null;
  passes: number;
  /** Seen, not yet believed. A file written before this existed folds in as
   *  "nothing pending" — an old store is read, never repaired by crashing. */
  pending: PendingCandidate[];
}

function loadWatermark(): Watermark {
  const s = storage();
  const empty: Watermark = { seen: [], lastPass: null, passes: 0, pending: [] };
  if (!s) return empty;
  try {
    const raw = JSON.parse(s.getItem(WATERMARK_KEY) ?? "null") as Watermark | null;
    if (!raw || !Array.isArray(raw.seen)) return empty;
    return {
      seen: raw.seen,
      lastPass: raw.lastPass ?? null,
      passes: raw.passes ?? 0,
      pending: Array.isArray(raw.pending) ? raw.pending : [],
    };
  } catch {
    return empty;
  }
}

function saveWatermark(w: Watermark): void {
  const s = storage();
  if (s) s.setItem(WATERMARK_KEY, JSON.stringify({ ...w, seen: w.seen.slice(-2000) }));
}

export function loadDurable(userId?: string): DurableMemory[] {
  const s = storage();
  if (!s) return [];
  try {
    const raw = JSON.parse(s.getItem(DURABLE_KEY) ?? "[]") as DurableMemory[];
    const ok = Array.isArray(raw) ? raw.filter((m) => m && typeof m.statement === "string") : [];
    return userId ? ok.filter((m) => (m.userId ?? "default") === userId) : ok;
  } catch {
    return [];
  }
}

function saveDurable(all: DurableMemory[]): void {
  const s = storage();
  if (!s) return;
  // Same discipline as the ledger: the cap protects the store, and the WEAKEST
  // give way first rather than the oldest — a strong old memory outranks a weak
  // new one, which is the opposite of how a receipt file behaves.
  //
  // The cap is applied PER USER. A global cap is not a storage decision, it is
  // one person losing their memory to another person's throughput.
  const byUser = new Map<string, DurableMemory[]>();
  for (const m of all) {
    const u = m.userId ?? "default";
    const list = byUser.get(u);
    if (list) list.push(m);
    else byUser.set(u, [m]);
  }
  const kept: DurableMemory[] = [];
  for (const list of byUser.values()) {
    kept.push(
      ...list
        .slice()
        .sort((a, b) => Number(a.retired) - Number(b.retired) || b.strength - a.strength || (a.ts < b.ts ? 1 : -1))
        .slice(0, DURABLE_CAP),
    );
  }
  s.setItem(DURABLE_KEY, JSON.stringify(kept));
}

/* ── fingerprinting: what makes two sightings the same thing ────────────────── */

const STOP = new Set([
  "the", "a", "an", "and", "or", "but", "if", "then", "than", "that", "this", "these", "those",
  "is", "are", "was", "were", "be", "been", "being", "to", "of", "in", "on", "at", "for", "with",
  "it", "its", "as", "by", "from", "not", "no", "do", "does", "did", "have", "has", "had",
  "i", "we", "you", "they", "he", "she", "my", "our", "your", "their",
]);

/** Words that carry the signal, lowercased, de-duplicated, order-free. */
/** The shared words, most-supported first.
 *
 *  A word carried by every sighting describes the pattern better than one that
 *  appeared once, and the ORDER matters twice over: it is what names the pattern
 *  in a sentence, and it is what a later sighting is matched against. Ties break
 *  alphabetically, so the order is a fact about the evidence rather than about
 *  which record happened to arrive first. */
function profileOrder(lists: string[][]): string[] {
  const df = new Map<string, number>();
  for (const list of lists) for (const w of new Set(list)) df.set(w, (df.get(w) ?? 0) + 1);
  return Array.from(df.keys()).sort((a, b) => (df.get(b) as number) - (df.get(a) as number) || (a < b ? -1 : 1));
}

/* ── pending: a candidate that repeated but has not cleared the gates ───────── */

function loadPending(): PendingCandidate[] {
  return loadWatermark().pending;
}

/** Merge the sighting just seen into the pending list for that user, folding it
 *  into an existing candidate when the words say it is the same thing.
 *
 *  Two candidates from the same cycle that look alike are merged here rather
 *  than pre-merged by the caller, because the caller's buckets hold RECORDS and
 *  this holds EVIDENCE — the ids and the days are the part that has to survive.
 */
function mergePending(pending: PendingCandidate[], c: DreamCandidate, userId: string, at: string): void {
  /* The words come from the RECORDS. Reading them back out of the rendered
   * statement would feed the template's own vocabulary ("tends", "refuse",
   * "about") into the profile, and then every preference ever held would look
   * alike — one pattern absorbing the next. */
  const words = c.words.slice();
  const mine = pending.filter((p) => p.userId === (userId || "default"));
  const home = mine.find((p) => p.kind === c.kind && (p.key === c.key || similarity(new Set(p.words), new Set(words)) >= SAME_PATTERN));
  if (!home) {
    pending.push({
      userId: userId || "default",
      kind: c.kind,
      key: c.key,
      words,
      subject: c.subject.slice(),
      detail: c.detail,
      evidence: c.evidence.slice(),
      sightings: c.sightings,
      dayKeys: Array.from(new Set(c.dayKeys)),
      firstSeen: at,
      lastSeen: at,
    });
    return;
  }
  /* The key can only be computed over the union — a group's identity is the
   * words its members share, so it has to be recomputed, not inherited. */
  home.words = profileOrder([home.words, words]);
  /* The work words accumulate the same way, and the detail keeps the LONGEST
   * reason rather than the newest: a held belief is replayed many times, and the
   * most explicit statement of why is the one worth carrying. */
  home.subject = profileOrder([home.subject ?? [], c.subject]);
  if (c.detail.length > (home.detail ?? "").length) home.detail = c.detail;
  home.evidence = Array.from(new Set([...home.evidence, ...c.evidence]));
  home.sightings += c.sightings;
  /* Days union by DAY, and each record contributes its own — three complaints on
   * three days that arrive in one pass are three days of evidence. */
  home.dayKeys = Array.from(new Set([...home.dayKeys, ...c.dayKeys]));
  home.lastSeen = at;
}

/** Re-run the gates over the ACCUMULATED evidence rather than this cycle alone. */
function replayPending(p: PendingCandidate): DreamCandidate {
  const sightings = p.sightings;
  const days = p.dayKeys.length;
  const confidence = confidenceOf(sightings, days);
  const base: DreamCandidate = {
    kind: p.kind,
    key: p.key,
    statement: renderStatement(p.kind, p.subject && p.subject.length > 0 ? p.subject : p.words, p.detail ?? ""),
    evidence: p.evidence,
    sightings,
    days,
    confidence,
    words: p.words.slice(),
    subject: (p.subject ?? []).slice(),
    detail: p.detail ?? "",
    dayKeys: p.dayKeys.slice(),
    blockedBy: null,
  };
  if (sightings < MIN_EVIDENCE) return { ...base, blockedBy: `evidence: ${sightings}/${MIN_EVIDENCE} sightings` };
  if (days < MIN_SESSIONS) return { ...base, blockedBy: `independence: ${days}/${MIN_SESSIONS} days` };
  if (confidence < MIN_CONFIDENCE) return { ...base, blockedBy: `confidence: ${confidence}/${MIN_CONFIDENCE}` };
  return base;
}

/** Cap the pending list: the least-supported and oldest go first. */
function capPending(pending: PendingCandidate[]): PendingCandidate[] {
  const byUser = new Map<string, PendingCandidate[]>();
  for (const p of pending) {
    const u = p.userId || "default";
    const list = byUser.get(u);
    if (list) list.push(p);
    else byUser.set(u, [p]);
  }
  const out: PendingCandidate[] = [];
  for (const list of byUser.values()) {
    out.push(
      ...list
        .slice()
        .sort((a, b) => b.sightings - a.sightings || (a.lastSeen < b.lastSeen ? 1 : -1))
        .slice(0, PENDING_CAP),
    );
  }
  return out;
}

export function keywords(text: string): string[] {
  const words = (text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP.has(w));
  return Array.from(new Set(words)).sort();
}

/** How alike two keyword sets are, 0..1 — intersection over union.
 *
 *  This replaced a `fingerprint(text) -> "a+b"` that took the two keywords and
 *  joined them. That version was WRONG, and a probe caught it: run over two
 *  phrasings of the same complaint it produced "changelog+far" and "heavy+like",
 *  because "the first two" of an alphabetically sorted set is a fact about the
 *  alphabet rather than about the complaint. Any fixed-length ranking has that
 *  failure — two people describing the same thing rarely choose the same two
 *  words, and no global order can know which words those would have been.
 *
 *  Comparing SETS instead asks the question that actually matters: how much do
 *  these two complaints have in common? That is stable under rephrasing, and it
 *  degrades gracefully — a complaint that mentions three of the same things
 *  still joins the pattern. */
export function similarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const w of a) if (b.has(w)) shared += 1;
  return shared / (a.size + b.size - shared);
}

/** Above this, two sightings are the same complaint. Chosen so a shared pair of
 *  topic words in otherwise different sentences groups, while a shared stopword-
 *  ish word does not — and it is a threshold on the UNION, so a long sentence
 *  cannot drag a short one in on one common word. */
export const SAME_PATTERN = 0.34;

/** The stable identity of a group: the two most SHARED words across its members,
 *  which is a fact about the evidence rather than about the alphabet. */
export function groupKey(members: string[][]): string {
  const freq = new Map<string, number>();
  for (const words of members) for (const w of words) freq.set(w, (freq.get(w) ?? 0) + 1);
  return Array.from(freq.entries())
    .sort((a, b) => b[1] - a[1] || (a[0].length === b[0].length ? a[0].localeCompare(b[0]) : b[0].length - a[0].length))
    .slice(0, 2)
    .map(([w]) => w)
    .join("+") || "unspecified";
}

/** The day a record belongs to. Days are the unit of INDEPENDENCE: the gate
 *  counts days, not records, because one session is one event. */
function dayOf(ts: string): string {
  return (ts || "").slice(0, 10);
}

/** Whole CALENDAR days between two stamps.
 *
 *  Calendar days, not 24-hour blocks: a belief must not decay because a laptop
 *  was closed overnight. Used by the decay rule, which charges for silence in
 *  days rather than in passes so that the schedule cannot change what is true. */
function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${dayOf(from)}T00:00:00.000Z`);
  const b = Date.parse(`${dayOf(to)}T00:00:00.000Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.max(0, Math.round((b - a) / 86400000));
}

/* ── CONSOLIDATE ────────────────────────────────────────────────────────────── */

interface Bucket {
  kind: MemoryKind;
  key: string;
  records: DecisionRecord[];
  /** The words of the WORK each sighting was about, separate from the words of
   *  the complaint. A belief is named for the work ("refuses work about draft
   *  release") and the complaint becomes its reason — and a memory named only
   *  after the complaint can never be recalled by a question about the work. */
  subjects: string[][];
  /** The keyword set of each member, kept so a newcomer can be compared against
   *  the group without re-tokenising every member on every comparison. */
  words: string[][];
  /** The union of every member's words — what a new sighting is measured against. */
  profile: Set<string>;
}

/** Group staged records into PATTERNS by what they are about.
 *
 *  Greedy, single-pass, and deliberately explainable: a record joins the first
 *  group of its own kind it is sufficiently similar to, and starts a new group
 *  otherwise. No embedding model, no vector store — the claim being made is
 *  "these complaints are about the same things", and a set comparison answers
 *  exactly that question while staying inspectable.
 *
 *  REJECTIONS read their REASON first and the scenario second, corrected when
 *  neither is present. That order matters: "too verbose" generalises across
 *  tasks, while "the third table" only means something alongside its scenario. */
function bucketsFrom(records: DecisionRecord[]): Bucket[] {
  const out: Bucket[] = [];
  for (const r of records) {
    const scenario = r.scenario ?? "";
    let kind: MemoryKind;
    let text: string;
    if (r.kind === "reject") {
      kind = "preference";
      text = r.reason || scenario;
    } else if (r.kind === "correction") {
      kind = "correction";
      text = scenario || r.reason || "";
    } else if (r.kind === "accept") {
      kind = "rhythm";
      text = scenario;
    } else {
      continue;
    }
    const words = keywords(text);
    if (words.length === 0) continue;
    const subj = keywords(scenario);
    const set = new Set(words);
    const home = out.find((b) => b.kind === kind && similarity(b.profile, set) >= SAME_PATTERN);
    if (home) {
      home.records.push(r);
      home.words.push(words);
      home.subjects.push(subj);
      for (const w of words) home.profile.add(w);
    } else {
      out.push({ kind, key: "", records: [r], words: [words], subjects: [subj], profile: new Set(words) });
    }
  }
  /* The key is only assigned once a group is closed, because it is a fact about
   * the WHOLE group: the words its members actually share. Assigning it from the
   * first record would make the identity of a pattern depend on which of its
   * sightings happened to arrive first. */
  for (const b of out) b.key = groupKey(b.words);
  return out;
}

/** The words a belief is named for: the WORK first, and the complaint only when
 *  no sighting named a piece of work. */
function themeOf(subjects: string[][], words: string[][]): string[] {
  const subj = profileOrder(subjects);
  return subj.length > 0 ? subj : profileOrder(words);
}

/** Preference-shaped statements read as the user's taste; rhythm-shaped ones read
 *  as this user's recurring work. Kept apart because they are used differently:
 *  a preference changes how a specialist WRITES, a rhythm changes what it
 *  EXPECTS. */
function renderStatement(kind: MemoryKind, themeWords: string[], detail: string): string {
  const theme = themeWords.slice(0, 2).join(" ") || "this kind of work";
  switch (kind) {
    case "preference":
      return detail
        ? `This user tends to refuse work about ${theme} — most often because: ${detail.slice(0, 140)}.`
        : `This user tends to refuse work about ${theme}.`;
    case "caution":
      return `Work about ${theme} has been set aside more than once — check it before spending steps on it.`;
    case "correction":
      return `This user corrects ${theme} — expect to revise it rather than to get it right first time.`;
    case "rhythm":
      return `Asks about ${theme} recur for this user — treat them as standing work, not one-offs.`;
  }
}

function statementFor(b: Bucket): string {
  const reasons = b.records.map((r) => (r.reason ?? "").trim()).filter(Boolean);
  const topReason = reasons.sort((a, x) => x.length - a.length)[0] ?? "";
  return renderStatement(b.kind, themeOf(b.subjects, b.words), topReason);
}

/** The longest reason behind a group. Kept on a held candidate so that a belief
 *  promoted three cycles later still reads with its evidence, not just its
 *  shape — "because: too marketing-heavy" is the part a person recognises. */
function longestReason(records: { reason?: string }[]): string {
  return records.map((r) => (r.reason ?? "").trim()).filter(Boolean).sort((a, x) => x.length - a.length)[0] ?? "";
}

/** Confidence, computed — never assumed. Two ingredients, both required:
 *  evidence (how many sightings) and independence (how many separate days).
 *  Five sightings in one day must not outrank three across three days.
 *
 *  ANCHORED AT THE GATE, and that anchoring is the whole design. A blend that
 *  simply ramps from zero would mean a pattern sitting exactly on the evidence
 *  and independence floors could still be refused by the confidence gate — three
 *  gates and then a fourth one saying "yes but not really". That is not caution,
 *  it is an off-by-a-constant, and it makes the three named gates untrue.
 *
 *  So the blend is rescaled: at exactly the required evidence and spread,
 *  confidence IS `MIN_CONFIDENCE`; at twice the evidence and twice the spread it
 *  is 1; below the floors it falls away fast. Each gate then says one thing, and
 *  none of them repeats another. */
export function confidenceOf(sightings: number, days: number): number {
  const e = Math.min(1, sightings / (MIN_EVIDENCE * 2));
  const d = Math.min(1, days / (MIN_SESSIONS * 2));
  const raw = e * 0.55 + d * 0.45;                     // 0.5 exactly at the floors
  const scaled = MIN_CONFIDENCE + (raw - 0.5) * (2 * (1 - MIN_CONFIDENCE));
  return Number(Math.min(1, Math.max(0, scaled)).toFixed(3));
}

/** Apply the gates. Returns the candidate with `blockedBy` naming the gate that
 *  stopped it — a held candidate is reported, never swallowed. */
function gate(b: Bucket): DreamCandidate {
  const sightings = b.records.length;
  const days = new Set(b.records.map((r) => dayOf(r.ts))).size;
  const confidence = confidenceOf(sightings, days);
  const statement = statementFor(b);
  const base: DreamCandidate = {
    kind: b.kind,
    key: b.key,
    statement,
    evidence: b.records.map((r) => r.id),
    sightings,
    days,
    confidence,
    words: profileOrder([...b.words, ...b.subjects]),
    subject: themeOf(b.subjects, b.words),
    detail: longestReason(b.records),
    dayKeys: Array.from(new Set(b.records.map((r) => dayOf(r.ts)))),
    blockedBy: null,
  };

  if (sightings < MIN_EVIDENCE) return { ...base, blockedBy: `evidence: ${sightings}/${MIN_EVIDENCE} sightings` };
  if (days < MIN_SESSIONS) return { ...base, blockedBy: `independence: ${days}/${MIN_SESSIONS} days` };
  if (confidence < MIN_CONFIDENCE) return { ...base, blockedBy: `confidence: ${confidence}/${MIN_CONFIDENCE}` };
  return base;
}

/* ── STAGE + PROMOTE: one full cycle ────────────────────────────────────────── */

/** Write a cleared candidate into the durable store: create it, or reconfirm it
 *  in place. A reconfirmation grows strength — capped at 1, because a memory
 *  that can grow without limit becomes a dogma the evidence no longer supports. */
function promote(byKey: Map<string, DurableMemory>, c: DreamCandidate, userId: string, at: string): void {
  const id = `${c.kind}|${c.key}`;
  /* Exact fingerprint first, then the words. A key names the words its members
   * shared AT THE MOMENT the group closed, and that set grows as evidence
   * accumulates — so without the second look, a belief that keeps being
   * reconfirmed gets promoted again as a near-duplicate beside itself, under a
   * slightly different key, and the store fills with the same belief twice. */
  const prior =
    byKey.get(id) ??
    Array.from(byKey.values()).find(
      (m) => !m.retired && m.kind === c.kind && similarity(new Set(m.words ?? []), new Set(c.words)) >= SAME_PATTERN,
    );
  if (prior) {
    prior.sightings += c.sightings;
    prior.days += c.days;
    prior.strength = Math.min(1, prior.strength + STRENGTH_GAIN);
    prior.lastSeen = at;
    prior.statement = c.statement;
    prior.words = profileOrder([prior.words ?? [], c.words]);
    prior.evidence = Array.from(new Set([...prior.evidence, ...c.evidence])).slice(-24);
    prior.retired = false;
    return;
  }
  byKey.set(id, {
    id: uid("mem"),
    key: c.key,
    userId,
    ts: at,
    kind: c.kind,
    statement: c.statement,
    words: c.words.slice(),
    evidence: c.evidence.slice(-24),
    sightings: c.sightings,
    days: c.days,
    strength: 0.5 + (c.confidence - MIN_CONFIDENCE) * 0.5,
    lastSeen: at,
    retired: false,
  });
}

export function dreamPass(userId = "default", at: string = nowIso()): DreamReport {
  const who = userId || "default";
  const wm = loadWatermark();
  const seen = new Set(wm.seen);

  /* STAGE — the records that have not been through a cycle. */
  const all = loadMemory(who);
  const staged = all.filter((r) => !seen.has(r.id));

  /* THIS user's durable memories, and only this user's.
   *
   * Reading the whole store meant a pass could reconfirm, decay or overwrite
   * another person's belief. Worse, the lookup key carries no user, so two
   * people who happened to share a habit collided onto one entry — and one of
   * them lost their memory the next time the map was written back. */
  const durable = loadDurable(who);
  const byKey = new Map(durable.map((m) => [`${m.kind}|${m.key}`, m]));
  const pending = loadPending();

  let promoted = 0;
  const held: DreamCandidate[] = [];
  const promotedKeys = new Set<string>();

  /* CONSOLIDATE — this cycle's sightings are merged into what is already HELD
   * for this user, and the gates then run on the UNION.
   *
   * This is the whole difference between "held" and "discarded". The watermark
   * consumes every staged record on every pass, and that is right — a record
   * must never be counted twice. But consuming a record is only safe when its
   * EVIDENCE survives the cycle somewhere, and this is where it survives.
   * Without it, one rejection a day for a week never reaches three sightings,
   * because every pass sees one and throws it away — the gates read as if they
   * accumulated and behaved as if they were per-cycle.
   *
   * Only the staged window is scanned: a full re-scan every pass would count old
   * evidence twice and drift the thresholds. */
  for (const b of bucketsFrom(staged)) mergePending(pending, gate(b), who, at);

  /* PROMOTE — replay every candidate held for this user, on accumulated evidence. */
  const stillPending: PendingCandidate[] = [];
  for (const p of pending) {
    if ((p.userId || "default") !== who) {
      stillPending.push(p);
      continue;
    }
    const c = replayPending(p);
    if (c.blockedBy) {
      held.push(c);
      stillPending.push(p);
      continue;
    }
    promote(byKey, c, who, at);
    promotedKeys.add(`${c.kind}|${c.key}`);
    promoted += 1;
  }

  /* DECAY AND RETIRE — by SILENT DAYS, never by pass.
   *
   * A quiet cycle is not evidence against a belief. Charging decay per call
   * would mean the same deployment retired a belief in half an hour when a
   * heartbeat called the pass every fifteen minutes, and kept it for a week when
   * a person had to press a button: the SCHEDULE would be deciding what is true.
   * So a belief pays for the days it has been silent, after a grace period, and
   * a second pass on the same day costs it nothing. This is also the half the
   * old ledger was missing — without it a reversed preference stays exactly as
   * loud as a live one forever. */
  let retired = 0;
  for (const m of byKey.values()) {
    if (promotedKeys.has(`${m.kind}|${m.key}`)) continue;
    if (daysBetween(m.lastSeen, at) <= DECAY_GRACE_DAYS) continue;
    const charged = daysBetween(m.decayedAt ?? m.lastSeen, at);
    if (charged <= 0) continue;
    m.strength = Number((m.strength - STRENGTH_DECAY * Math.min(charged, 30)).toFixed(3));
    m.decayedAt = at;
    if (m.strength < RETIRE_BELOW && !m.retired) {
      m.retired = true;
      retired += 1;
    }
  }

  /* SAVE — this user's list is written back over the store and every other
   * user's rows are left exactly as they were. `loadDurable(who)` gave us a
   * filtered view, so the merge is by id: writing that view back wholesale is
   * how one user's pass would otherwise delete everybody else's memories. */
  const mine = new Set(durable.map((m) => m.id));
  saveDurable([...loadDurable().filter((m) => !mine.has(m.id)), ...byKey.values()]);

  saveWatermark({
    seen: Array.from(new Set([...wm.seen, ...all.map((r) => r.id)])),
    lastPass: at,
    passes: wm.passes + 1,
    pending: capPending(stillPending),
  });

  return { staged: staged.length, consolidated: staged.length, promoted, held, retired, at };
}

/* ── RECALL — what actually reaches the model ───────────────────────────────── */

export interface Recalled {
  statement: string;
  kind: MemoryKind;
  strength: number;
  score: number;
}

/** Score every live memory against the current turn and return the best few.
 *
 * Relevance is keyword overlap. It is deliberately NOT an embedding: the whole
 * store is on-device and the memory set is capped at 120, so a scan is
 * micro-seconds and adding a vector index here would buy nothing but a
 * dependency. What matters is the RANKING RULE, and its rule is:
 *
 *     score = overlap × strength
 *
 * — a well-earned memory about something adjacent beats a fresh memory about
 * something unrelated, and an unrelated memory scores zero however strong it is.
 * That single product is why the prompt gets better rather than merely bigger.
 */
/** The strongest live memories, with no query to rank them against.
 *
 *  This exists because the no-query path used to call `recall("*")` — and `*`
 *  yields no keywords, so it returned nothing, and a session start silently fell
 *  back to the raw rejection lines it was supposed to have outgrown. A path that
 *  is reached by abusing a query string is a path nobody tests. */
export function topMemories(k = 3, userId = "default"): Recalled[] {
  return loadDurable(userId)
    .filter((m) => !m.retired && m.strength >= RETIRE_BELOW)
    .sort((a, b) => b.strength - a.strength)
    .slice(0, k)
    .map((m) => ({ statement: m.statement, kind: m.kind, strength: m.strength, score: Number(m.strength.toFixed(4)) }));
}

export function recall(query: string, k = 3, userId = "default"): Recalled[] {
  const q = new Set(keywords(query));
  if (q.size === 0) return [];
  const out: Recalled[] = [];
  for (const m of loadDurable(userId).filter((x) => !x.retired && x.strength >= RETIRE_BELOW)) {
    /* Score against the belief's OWN words, never against the rendered sentence.
     * The sentence is built from a template, so its words are shared by every
     * belief of that kind — "about", "work", "tends" — and a query containing any
     * of them would match every preference the deployment ever formed. A belief
     * written before the words were stored falls back to its sentence. */
    const mk = m.words && m.words.length > 0 ? m.words : keywords(m.statement);
    if (mk.length === 0) continue;
    const hits = mk.filter((w) => q.has(w)).length;
    const overlap = hits / Math.max(4, Math.min(mk.length, 16));
    const score = overlap * m.strength;
    if (score <= 0) continue;
    out.push({ statement: m.statement, kind: m.kind, strength: m.strength, score: Number(score.toFixed(4)) });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, k);
}

/** The lines a specialist is given before it answers. Capped, ranked, and it
 *  says out loud when there is nothing rather than padding. */
export function recallBriefing(query: string, k = 3, userId = "default"): string[] {
  /* An empty or keyword-free query is a session start, not a search: the
   * strongest memories stand in. */
  const r = keywords(query).length === 0 ? topMemories(k, userId) : recall(query, k, userId);
  if (r.length === 0) return [];
  const head = [
    "What this deployment has LEARNED about this user (consolidated over repeat sightings, not single events):",
  ];
  return head.concat(r.map((x) => `• [${x.kind}] ${x.statement}`));
}

/* ── status, for the surface ────────────────────────────────────────────────── */

export interface DreamStatus {
  passes: number;
  lastPass: string | null;
  durable: number;
  live: number;
  retired: number;
  strongest: DurableMemory | null;
  /** How many ledger records have been through a cycle. */
  consolidated: number;
  /** Candidates repeated enough to be held, not yet believed. */
  held: number;
}

export function dreamStatus(userId = "default"): DreamStatus {
  const who = userId || "default";
  const wm = loadWatermark();
  /* This user's store, not the whole store. A count that includes other people's
   * memories is a number about the installation, not about this user — and the
   * panel that shows it sits on this user's Memory door. */
  const mem = loadDurable(who);
  const live = mem.filter((m) => !m.retired);
  return {
    passes: wm.passes,
    lastPass: wm.lastPass,
    durable: mem.length,
    live: live.length,
    retired: mem.length - live.length,
    strongest: live.slice().sort((a, b) => b.strength - a.strength)[0] ?? null,
    consolidated: wm.seen.length,
    /** Repeated enough to be watched, not yet believed. */
    held: wm.pending.filter((p) => (p.userId || "default") === who).length,
  };
}

/** Forget one promoted memory. The record it came from stays in the ledger — a
 *  forgotten BELIEF is not a rewritten HISTORY. */
export function forgetMemory(id: string, userId?: string): boolean {
  const all = userId ? loadDurable(userId) : loadDurable();
  const next = all.filter((m) => m.id !== id);
  if (userId) {
    /* Scoped forget still has to preserve everybody else's rows on the way out. */
    const keep = loadDurable().filter((m) => m.userId !== userId);
    saveDurable([...keep, ...next]);
    return next.length !== all.length;
  }
  if (next.length === all.length) return false;
  saveDurable(next);
  return true;
}

/** Forget everything promoted, and keep the ledger. Used by "Forget everything"
 *  on the Memory door, which must not leave consolidated beliefs behind when the
 *  user has asked to be forgotten. */
export function forgetAllDurable(userId?: string): number {
  const who = userId || "";
  const wm = loadWatermark();
  const n = who ? loadDurable(who).length : loadDurable().length;
  if (who) {
    /* One person asking to be forgotten must not take the whole installation's
     * learned memory with them. */
    saveDurable(loadDurable().filter((m) => m.userId !== who));
    saveWatermark({ ...wm, pending: wm.pending.filter((p) => (p.userId || "default") !== who) });
    return n;
  }
  saveDurable([]);
  saveWatermark({ seen: [], lastPass: null, passes: 0, pending: [] });
  return n;
}
