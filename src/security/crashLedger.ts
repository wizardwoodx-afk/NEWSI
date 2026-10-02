/**
 * SelfImpulse — the crash ledger.
 *
 * WHY THIS EXISTS
 * ---------------
 * A production product that cannot say what broke is not debuggable and is not
 * auditable. Three facts make this a real gap rather than a nicety:
 *
 *   1. `src/panels/ErrorBoundary.tsx` existed but NOTHING imported it, so any
 *      render throw in any of the nine screens blanked the whole window with no
 *      message and no record. The user's work — an open mission, a decision at
 *      the gate — vanished with the screen.
 *   2. `src/ui/store.ts:send` caught engine throws and rendered them as a chat
 *      message, which is correct, but the failure then left no durable trace: a
 *      reload erased the only evidence it had ever happened.
 *   3. There is no crash reporting anywhere in the product. That is DELIBERATE
 *      and must stay deliberate — the product's own principle is "no telemetry".
 *      So this ledger is LOCAL ONLY. It never leaves the machine. There is no
 *      endpoint, no beacon, no queue. The operator exports it by hand if they
 *      choose, and that choice is theirs.
 *
 * WHAT MAKES THIS AUDITABLE
 * -------------------------
 * Each entry is hash-chained: `digest = sha256(prevDigest + canonical(entry))`.
 * It is the same construction the product already uses for its signed receipts,
 * and it buys the property an
 * auditor asks for first — **the record cannot be quietly edited**. Remove an
 * entry from the middle and every later digest fails to verify, and
 * `verifyCrashChain` says exactly where it broke.
 *
 * The chain detects tampering; it does not prevent it. Nobody can make an
 * append-only log in a browser tamper-proof, and this module does not pretend
 * otherwise. What it does promise is stated in `chainAssurance()`.
 *
 * WHAT IS CAPTURED
 * ----------------
 * The message and the first frames of the stack. Deliberately NOT captured:
 * arguments, the user's message text, document contents, provider keys, file
 * paths outside the app. A crash log that can read the user's data is a second
 * data store with none of the vault's guarantees, so this one is narrow on
 * purpose. `redact()` is the single place that decides what survives, and the
 * probe pins it.
 */

/** The stack frame shape we keep. Deliberately small. */
export interface CrashFrame {
  /** the function/module name as the engine reported it, already redacted */
  where: string;
  /** 1-based line, or 0 when the engine gave none */
  line: number;
}

export type CrashKind = "render" | "unhandled" | "engine" | "write";

export interface CrashEntry {
  /** stable id: seq + start-of-ms, so two crashes in one ms stay distinct */
  id: string;
  at: string;
  kind: CrashKind;
  /** the screen or subsystem, when the caller knows it */
  where: string;
  /** the error name, e.g. "TypeError" */
  name: string;
  /** the message, redacted and length-capped */
  message: string;
  frames: CrashFrame[];
  /** digest of THIS entry, chained onto the previous one */
  digest: string;
  /** the previous entry's digest; "genesis" for the first */
  prev: string;
}

export interface CrashChainReport {
  ok: boolean;
  entries: number;
  /** the id of the first entry whose digest does not follow, if any */
  brokenAt: string | null;
  /** what we are prepared to claim about this chain */
  assurance: string;
}

const KEY = "vh.crashLedger.v1";
const GENESIS = "genesis";
/** Entries are capped. A crash loop must not be able to fill the origin. */
export const CRASH_CAP = 200;
const FRAME_CAP = 6;
const MESSAGE_CAP = 300;
/**
 * The byte budget for the whole ledger.
 *
 * This is sized from the WORST CASE, not the average. A retained entry with six
 * fully-spelled stack frames measures ~800 bytes, so CRASH_CAP entries need
 * ~160 KB. Two earlier budgets were wrong in instructive ways: 4 KB held 11
 * entries, and 96 KB held 153 — in both cases the 200 cap was unreachable and
 * the ledger quietly forgot early, which is precisely when you need the history.
 * 192 KB is ~4% of a localStorage origin, and
 * `probe/crashLedger.test.ts` builds the worst case and FAILS if the budget ever
 * stops being able to hold the cap.
 */
const STORE_CAP = 192_000;

/**
 * The on-disk shape.
 *
 * `base` is not decoration. The ledger is a ROLLING WINDOW: once it is full the
 * oldest entries are dropped, and the new first entry chains onto a digest that
 * is no longer stored. A naive `prev`-walk then fails on the first entry for
 * every ledger past its cap — the chain would be unverifiable in exactly the
 * situation that matters most, an app that is crashing repeatedly.
 *
 * So the continuity point is stored explicitly. `base` is the digest of the
 * entry immediately before the first retained one, and verification starts from
 * it rather than from genesis. The retained window is provably a suffix of a
 * longer history; what came before `base` is deliberately not claimed, and
 * `chainAssurance` says so.
 */
interface LedgerFile {
  version: 1;
  base: string;
  entries: CrashEntry[];
}

type Reader = Pick<Storage, "getItem">;
type Writer = Pick<Storage, "setItem" | "removeItem">;
type Store = Reader & Writer;

function resolveStore(store?: Store | null): Store | null {
  if (store !== undefined) return store;
  try {
    const ls = (globalThis as { localStorage?: Storage }).localStorage;
    return ls && typeof ls.setItem === "function" && typeof ls.getItem === "function" ? ls : null;
  } catch {
    // a sandboxed frame throws on ACCESS, not just on write
    return null;
  }
}

/**
 * What this module will and will not let into the ledger.
 *
 * Exported so the probe can assert the policy directly rather than inferring it.
 * The rules: no message text longer than the cap, no absolute user paths, no
 * bearer/apikey-shaped strings. A stack frame keeps only its last two path
 * segments, so `C:\Users\somebody\Documents\secret.pdf` becomes `…\secret.pdf`
 * at worst and, in practice, an app-relative path.
 */
export function redact(raw: string): string {
  let s = String(raw ?? "");
  // credential-shaped tokens never enter a log, whatever their length
  s = s.replace(/\b(bearer|authorization|api[-_]?key|secret|token|password)\b\s*[:=]?\s*\S+/gi, "$1=[redacted]");
  // absolute user paths collapse to their last segment
  s = s.replace(/[A-Za-z]:\\[^\s"'<>|]{2,}/g, (m) => "…" + m.slice(Math.max(m.lastIndexOf("\\"), m.length - 40)));
  s = s.replace(/\/(?:home|Users|var)\/[^\s"'<>|]{2,}/g, (m) => "…" + m.slice(m.lastIndexOf("/") + 1));
  if (s.length > MESSAGE_CAP) s = s.slice(0, MESSAGE_CAP) + "…";
  return s;
}

/** Frames: keep the shape, lose the noise. */
export function frameList(stack: unknown): CrashFrame[] {
  const out: CrashFrame[] = [];
  if (typeof stack !== "string") return out;
  for (const line of stack.split("\n")) {
    if (out.length >= FRAME_CAP) break;
    const m = /\(?([^()\s]+):(\d+):(\d+)\)?\s*$/.exec(line.trim());
    if (!m) continue;
    const raw = m[1] as string;
    const parts = raw.split(/[\\/]/);
    const where = redact(parts.length > 2 ? `…/${parts.slice(-2).join("/")}` : raw);
    out.push({ where, line: Number(m[2]) || 0 });
  }
  return out;
}

/**
 * Canonical form of an entry, minus its own digest.
 *
 * Field order is fixed by construction order here, not by `JSON.stringify` of a
 * live object — a key order that shifts between runs would silently break every
 * digest and make the chain unverifiable for no reason.
 */
function canonical(e: Omit<CrashEntry, "digest">): string {
  return [
    e.id,
    e.at,
    e.kind,
    e.where,
    e.name,
    e.message,
    e.prev,
    e.frames.map((f) => `${f.where}#${f.line}`).join("|"),
  ].join("\u0001");
}

async function sha256Hex(text: string): Promise<string> {
  const subtle = (globalThis as { crypto?: { subtle?: SubtleCrypto } }).crypto?.subtle;
  if (subtle && typeof subtle.digest === "function") {
    const buf = await subtle.digest("SHA-256", new TextEncoder().encode(text));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  // No WebCrypto (an old webview, a Node probe without globalThis.crypto).
  // This is NOT a silent downgrade to a fake digest: `digest` is prefixed
  // `unverified-` so nothing downstream can mistake it for a real one, and
  // `chainAssurance()` reports the weaker claim.
  return `unverified-${fnv1a(text)}`;
}

function fnv1a(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/** Read the ledger. A corrupt store yields an empty ledger, never a throw. */
export function readCrashes(store?: Store | null): CrashEntry[] {
  return readLedger(store).entries;
}

/** The retained window plus the digest it continues from. */
function readLedger(store?: Store | null): LedgerFile {
  const empty: LedgerFile = { version: 1, base: GENESIS, entries: [] };
  const s = resolveStore(store);
  if (!s) return empty;
  try {
    const raw = s.getItem(KEY) ?? null;
    if (!raw) return empty;
    const parsed = JSON.parse(raw) as unknown;
    // A v1 flat array is an older file with no base; it is still readable, and
    // is treated as chaining from genesis.
    if (Array.isArray(parsed)) {
      return { version: 1, base: GENESIS, entries: parsed.filter(isCrashEntry) };
    }
    if (!parsed || typeof parsed !== "object") return empty;
    const f = parsed as Partial<LedgerFile>;
    if (!Array.isArray(f.entries)) return empty;
    return {
      version: 1,
      base: typeof f.base === "string" && f.base ? f.base : GENESIS,
      entries: f.entries.filter(isCrashEntry),
    };
  } catch {
    return empty;
  }
}

function isCrashEntry(e: unknown): e is CrashEntry {
  return !!e && typeof e === "object"
    && typeof (e as CrashEntry).digest === "string"
    && typeof (e as CrashEntry).prev === "string"
    && Array.isArray((e as CrashEntry).frames);
}

/** Persist, degrading honestly: a full origin keeps the NEWEST entries. */
function writeLedger(next: LedgerFile, store?: Store | null): { ok: boolean; kept: number; note: string } {
  const s = resolveStore(store);
  if (!s) return { ok: false, kept: 0, note: "no storage on this host — the crash is reported to the console and nothing is kept." };
  let payload = "";
  let base = next.base;
  let entries = next.entries;
  for (let budget = STORE_CAP; budget >= 20; budget = Math.floor(budget / 2)) {
    // Trim from the FRONT, and move the base forward to the digest of the last
    // dropped entry, so the retained window keeps a valid continuity point.
    base = next.base;
    entries = next.entries;
    payload = JSON.stringify({ version: 1, base, entries });
    while (entries.length > 1 && payload.length > budget) {
      base = entries[0]!.digest;
      entries = entries.slice(1);
      payload = JSON.stringify({ version: 1, base, entries });
    }
    try {
      s.setItem(KEY, payload);
      const dropped = next.entries.length - entries.length;
      return {
        ok: true,
        kept: entries.length,
        note: dropped > 0
          ? `kept the newest ${entries.length} crashes; ${dropped} older entries did not fit this origin's budget.`
          : `kept all ${entries.length} entries.`,
      };
    } catch {
      // too big for the store itself — halve the byte budget and try again
    }
  }
  return { ok: false, kept: 0, note: "the crash ledger could not be written at any size — the crash is on the console only." };
}

/**
 * Append one crash. Returns what actually happened, because a crash handler
 * that reports success when it stored nothing is exactly the bug this product
 * refuses elsewhere.
 */
export async function recordCrash(
  input: { kind: CrashKind; where?: string; error: unknown; stack?: unknown },
  store?: Store | null,
): Promise<{ id: string; ok: boolean; kept: number; note: string }> {
  const err = (input.error ?? {}) as { name?: unknown; message?: unknown; stack?: unknown };
  const at = new Date().toISOString();
  const file = readLedger(store);
  const prev = file.entries;
  const last = prev[prev.length - 1];
  const prevDigest = last ? last.digest : file.base;
  const name = redact(String(err.name ?? "Error"));
  const message = redact(String(err.message ?? err));
  const frames = frameList(input.stack ?? err.stack);

  const body: Omit<CrashEntry, "digest"> = {
    id: `c_${Date.now().toString(36)}_${prev.length + 1}`,
    at,
    kind: input.kind,
    where: redact(String(input.where ?? "app")),
    name,
    message,
    frames,
    prev: prevDigest,
  };
  const digest = await sha256Hex(canonical(body));
  const entry: CrashEntry = { ...body, digest };

  // A full ledger drops the OLDEST entries here; the base moves with it.
  const overflow = prev.length + 1 - CRASH_CAP;
  const trimmed: CrashEntry[] = overflow > 0 ? [...prev.slice(overflow), entry] : [...prev, entry];
  const base = overflow > 0 ? trimmed[0]!.prev : file.base;

  const kept = writeLedger({ version: 1, base, entries: trimmed }, store);
  // The console is the fallback that always works, and it is local too.
  try {
    console.error(`[11h crash] ${entry.kind} in ${entry.where}: ${entry.name}: ${entry.message}`);
  } catch {
    /* a console that throws is not worth crashing over */
  }
  return { id: entry.id, ok: kept.ok, kept: kept.kept, note: kept.note };
}

/** The most recent crash, or null. This is what Settings surfaces. */
export function lastCrash(store?: Store | null): CrashEntry | null {
  const list = readCrashes(store);
  return list.length ? list[list.length - 1] : null;
}

/**
 * Walk the chain and re-derive every digest.
 *
 * This is the audit question — "show me that nobody edited the record" — and it
 * is the reason the entries are chained at all. The genesis entry is chained
 * onto the literal string "genesis", so a ledger that had its first entry
 * replaced still fails.
 */
export async function verifyCrashChain(store?: Store | null): Promise<CrashChainReport> {
  const file = readLedger(store);
  const list = file.entries;
  const assurance = chainAssurance(list, file.base);
  if (list.length === 0) {
    return { ok: true, entries: 0, brokenAt: null, assurance: "no crashes have been recorded, so there is no chain to verify." };
  }
  // Verification starts at the stored base, NOT at genesis: past the cap the
  // ledger is a rolling window and the entries before `base` are not claimed.
  let prev = file.base;
  for (const e of list) {
    if (e.prev !== prev) {
      return { ok: false, entries: list.length, brokenAt: e.id, assurance: `${assurance} Broken at ${e.id}: the entry does not follow the one before it, so a record was removed or reordered.` };
    }
    const { digest, ...body } = e;
    const again = await sha256Hex(canonical(body));
    if (again !== digest) {
      return { ok: false, entries: list.length, brokenAt: e.id, assurance: `${assurance} Broken at ${e.id}: the entry's own contents were changed after it was written.` };
    }
    prev = digest;
  }
  return {
    ok: true,
    entries: list.length,
    brokenAt: null,
    assurance: `${assurance} All ${list.length} entries re-derive to the same digests — no record was edited or removed.`,
  };
}

/**
 * What may honestly be claimed about a chain, given how it was built.
 *
 * Deliberately modest. A browser cannot make an append-only log tamper-proof:
 * anyone with the machine can rewrite the whole file and recompute every hash,
 * because the hashing key is in the same bundle. The chain catches ACCIDENTAL
 * loss and CASUAL editing. It is not a WORM store and does not pretend to be
 * one — an auditor should be told the difference rather than shown a green tick.
 *
 * A non-genesis `base` is stated too: the ledger is a suffix of a longer history
 * and says so rather than implying it holds everything that ever happened.
 */
export function chainAssurance(list: CrashEntry[], base: string = GENESIS): string {
  const weak = list.some((e) => e.digest.startsWith("unverified-"));
  const windowed = base !== GENESIS
    ? ` This ledger is a rolling window: it continues from digest ${base.slice(0, 12)}…, so entries older than the retained ${list.length} are not covered.`
    : "";
  const claim = weak
    ? "This ledger was written on a host without WebCrypto, so its digests are WEAK markers, not SHA-256. Treat it as evidence of ordering only."
    : "Each entry's SHA-256 covers the previous entry's digest, so a removed or edited record breaks every digest after it.";
  return claim + windowed;
}

/** Delete the whole ledger. This is the GDPR erasure path for the crash store. */
export function clearCrashes(store?: Store | null): { cleared: number } {
  const s = resolveStore(store);
  const n = readCrashes(store).length;
  if (!s) return { cleared: 0 };
  try {
    s.removeItem(KEY);
  } catch {
    /* nothing to clear */
  }
  return { cleared: n };
}

/**
 * The export an operator hands to support, or an auditor.
 *
 * A single self-describing object: what produced it, when, whether the chain
 * verified, and the entries. It contains no user content by construction —
 * see `redact`.
 */
export async function exportCrashReport(store?: Store | null): Promise<{
  product: string;
  engine: string;
  exportedAt: string;
  chain: CrashChainReport;
  entries: CrashEntry[];
}> {
  const chain = await verifyCrashChain(store);
  return {
    product: "SelfImpulse",
    engine: "MJ",
    exportedAt: new Date().toISOString(),
    chain,
    entries: readCrashes(store),
  };
}
