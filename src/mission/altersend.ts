/**
 * AlterSend — moving a file from one SelfImpulse to another, over the same
 * authenticated channel everything else federation does.
 *
 * The design question is not "how do I move bytes". It is "what stops this from
 * being a remote file-write primitive on someone else's machine". Three rules do
 * that work, and each one is a rule a path-based file share does not have:
 *
 *  1. NOTHING IS ADDRESSED BY PATH. A transfer carries a sanitised display name
 *     and a content hash. The receiver never sees, and cannot be steered by, a
 *     directory. `../../.ssh/authorized_keys` is not a thing this module can be
 *     asked to write, because it has no concept of a path at all.
 *
 *  2. THE RECEIVER DECIDES. An offer is an offer. Nothing lands until the
 *     receiver calls accept(), which is where a human or a policy sees the name,
 *     the size and the hash. There is no auto-accept path and no "just save it".
 *
 *  3. EVERY TRANSFER LEAVES A RECEIPT. Offered, accepted, refused, fetched — each
 *     is an entry with a digest, in the same ledger shape as everything else the
 *     product does. A file you cannot account for is a file you did not send.
 *
 * Limits are not a detail here: an unbounded inbox on a machine that answers the
 * network is a disk-exhaustion tool, so the store is capped by count AND by
 * bytes, and a full store refuses new offers rather than evicting silently.
 */
import { createHash, timingSafeEqual } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";

/** One file on the wire. Bytes, not a reference to somebody else's filesystem. */
export interface AlterSendFile {
  /** Display name only. Sanitised on the way in; never used to build a path. */
  readonly name: string;
  readonly bytes: Buffer;
}

/** What the sender publishes. The bytes are already here, already hashed. */
export interface AlterSendOffer {
  readonly id: string;
  readonly name: string;
  readonly size: number;
  /** `sha256:<hex>` of the exact bytes. The receiver verifies before accepting. */
  readonly digest: string;
  readonly offeredAt: string;
  readonly from: string;
}

export type AlterSendDecision = "pending" | "accepted" | "refused" | "fetched";

export interface AlterSendReceipt {
  readonly id: string;
  readonly at: string;
  readonly decision: AlterSendDecision;
  readonly detail: string;
  /** Chained, so removing an entry from the middle breaks every later digest. */
  readonly digest: string;
}

export interface AlterSendLimits {
  readonly maxFileBytes: number;
  readonly maxStoreBytes: number;
  readonly maxFiles: number;
  readonly maxNameLength: number;
  /** How long a pending or accepted offer survives before it is swept. */
  readonly ttlMs: number;
}

/** Defaults chosen for a laptop, not a server. Override per-host if you must. */
export const DEFAULT_LIMITS: AlterSendLimits = {
  maxFileBytes: 32 * 1024 * 1024,
  maxStoreBytes: 256 * 1024 * 1024,
  maxFiles: 64,
  maxNameLength: 120,
  ttlMs: 60 * 60 * 1000,
};

export type AlterSendResult<T> = { ok: true; value: T } | { ok: false; reason: string };

/** Stable id from the content itself: the same bytes are the same transfer. */
export function contentId(digest: string): string {
  return digest.replace("sha256:", "").slice(0, 24);
}

export function digestOf(bytes: Buffer): string {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

/**
 * Reduce a caller-supplied name to something printable and inert.
 *
 * Directory separators, parent references, control characters and leading dots
 * are removed rather than escaped, because a name that survives this function
 * has no path structure left to exploit. The result is a label, not a location.
 */
export function safeName(raw: string, maxLength = DEFAULT_LIMITS.maxNameLength): AlterSendResult<string> {
  if (typeof raw !== "string" || raw.length === 0) return { ok: false, reason: "name:empty" };
  // eslint-disable-next-line no-control-regex
  const cleaned = raw
    .replace(/[\x00-\x1f\x7f]/g, "")
    .replace(/[/\\]/g, "-")
    .replace(/\.{2,}/g, ".")
    .replace(/^[.\-\s]+/, "")
    .replace(/[^\w .()\-]+/g, "")
    .trim();
  if (cleaned.length === 0) return { ok: false, reason: "name:empty-after-sanitising" };
  return { ok: true, value: cleaned.slice(0, maxLength) };
}

export interface AlterSendStoreOptions {
  readonly peer: string;
  readonly limits?: Partial<AlterSendLimits>;
  /** Injected so the receipt chain is testable without a clock. */
  readonly now?: () => Date;
  /**
   * Where transfer bytes live.
   *
   * The reviewer's point, and it is the right one: a 256 MB store held in the JS
   * heap is 256 MB of process RSS, and it is RSS that a peer on your network can
   * push you into. So bytes are written to a 0600 directory as they arrive and
   * only a bounded window is ever resident. Content-addressed names mean a
   * replayed offer reuses the object rather than doubling it, and an explicit
   * `close()` removes the directory — nothing is left behind on exit.
   *
   * Omit `spillDir` and the store is pure memory, which is what the unit probe
   * uses so it does not litter the filesystem.
   */
  readonly spillDir?: string;
}

interface Entry {
  readonly offer: AlterSendOffer;
  /** Populated only while the object is resident; otherwise read from disk. */
  bytes: Buffer | null;
  /** Where the bytes are, when spilled. Digest-named, so it is self-verifying. */
  readonly objectPath: string | null;
  decision: AlterSendDecision;
  detail: string;
}

export class AlterSendStore {
  private readonly entries = new Map<string, Entry>();
  private readonly receipts: AlterSendReceipt[] = [];
  private readonly limits: AlterSendLimits;
  private readonly peer: string;
  private readonly now: () => Date;
  private readonly root: string | null;
  /** How many bytes may be resident at once. Older objects fall back to disk. */
  private readonly residentBytes: number;
  private resident = 0;

  constructor(opts: AlterSendStoreOptions) {
    this.limits = { ...DEFAULT_LIMITS, ...(opts.limits ?? {}) };
    this.peer = opts.peer;
    this.now = opts.now ?? (() => new Date());
    this.residentBytes = Math.min(this.limits.maxFileBytes, 8 * 1024 * 1024);
    if (opts.spillDir) {
      // 0700 on the directory and 0600 on every object: a peer's file is not
      // world-readable even on a single-user machine, because "single-user
      // machine" is a claim about the operator, not about the threat model.
      fs.mkdirSync(opts.spillDir, { recursive: true, mode: 0o700 });
      fs.chmodSync(opts.spillDir, 0o700);
      this.root = opts.spillDir;
    } else {
      this.root = null;
    }
  }

  /** Remove every spilled object and the directory. Call on unmount. */
  close(): void {
    for (const [id] of this.entries) {
      const e = this.entries.get(id);
      if (e?.objectPath) { try { fs.rmSync(e.objectPath, { force: true }); } catch { /* already gone */ } }
    }
    this.entries.clear();
    this.resident = 0;
    if (this.root) { try { fs.rmSync(this.root, { recursive: true, force: true }); } catch { /* already gone */ } }
  }

  private objectPathFor(digest: string): string | null {
    return this.root ? path.join(this.root, digest.replace(":", "-")) : null;
  }

  /** Write bytes atomically and 0600: a reader never sees a half-written file. */
  private writeObject(digest: string, bytes: Buffer): string | null {
    const p = this.objectPathFor(digest);
    if (!p) return null;
    const tmp = `${p}.${process.pid}.partial`;
    const fd = fs.openSync(tmp, "wx", 0o600);
    try {
      fs.writeSync(fd, bytes);
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    fs.renameSync(tmp, p); // atomic within a filesystem
    return p;
  }

  private readObject(entry: Entry): Buffer {
    if (entry.bytes) return entry.bytes;
    if (!entry.objectPath) throw new Error("altersend: object is not on disk");
    const bytes = fs.readFileSync(entry.objectPath);
    // Re-verify on the way out. A file that changed under us is refused, not
    // served: the digest is the promise, and the promise is checked twice.
    if (digestOf(bytes) !== entry.offer.digest) throw new Error("altersend: object failed its digest on read");
    return bytes;
  }

  /**
   * Keep the resident window bounded. Anything evicted stays on disk and is
   * re-read (and re-verified) on demand, so eviction costs a read, not
   * correctness.
   */
  private evictFor(incoming: number): void {
    for (const [, e] of this.entries) {
      if (this.resident + incoming <= this.residentBytes) break;
      if (e.bytes && e.objectPath) {
        this.resident -= e.bytes.byteLength;
        e.bytes = null;
      }
    }
  }

  private record(id: string, decision: AlterSendDecision, detail: string): AlterSendReceipt {
    const at = this.now().toISOString();
    const prev = this.receipts[this.receipts.length - 1]?.digest ?? "";
    const payload = `${prev}|${id}|${decision}|${detail}|${at}`;
    const receipt: AlterSendReceipt = {
      id,
      at,
      decision,
      detail,
      digest: `sha256:${createHash("sha256").update(payload).digest("hex")}`,
    };
    this.receipts.push(receipt);
    return receipt;
  }

  /** Bytes held by the store, resident or spilled — this is what the quota counts. */
  get storeBytes(): number {
    let n = 0;
    for (const e of this.entries.values()) n += e.offer.size;
    return n;
  }

  /** Bytes actually in the JS heap. Bounded by the resident window, not the quota. */
  get residentBytesHeld(): number {
    return this.resident;
  }

  /** Objects currently on disk, for the operator-facing store report. */
  get spilledCount(): number {
    let n = 0;
    for (const e of this.entries.values()) if (e.objectPath) n += 1;
    return n;
  }

  /**
   * Publish a file. Rejects rather than evicts: silently dropping the oldest
   * entry to make room would mean the sender's offer had been honoured and then
   * un-honoured, and the receipt would be lying.
   */
  offer(file: AlterSendFile): AlterSendResult<AlterSendOffer> {
    const name = safeName(file.name, this.limits.maxNameLength);
    if (!name.ok) {
      this.record(":", "refused", name.reason);
      return name;
    }
    if (!Buffer.isBuffer(file.bytes) || file.bytes.byteLength === 0) {
      this.record(":", "refused", "empty");
      return { ok: false, reason: "file:empty" };
    }
    if (file.bytes.byteLength > this.limits.maxFileBytes) {
      this.record(":", "refused", "too-large");
      return { ok: false, reason: `file:too-large (max ${this.limits.maxFileBytes})` };
    }
    if (this.entries.size >= this.limits.maxFiles) {
      this.record(":", "refused", "store-full");
      return { ok: false, reason: "store:full" };
    }
    if (this.storeBytes + file.bytes.byteLength > this.limits.maxStoreBytes) {
      this.record(":", "refused", "store-bytes");
      return { ok: false, reason: "store:full" };
    }
    const digest = digestOf(file.bytes);
    const id = contentId(digest);
    if (this.entries.has(id)) return { ok: false, reason: "file:already-offered" };
    const offer: AlterSendOffer = {
      id,
      name: name.value,
      size: file.bytes.byteLength,
      digest,
      offeredAt: this.now().toISOString(),
      from: this.peer,
    };
    // The object is written FIRST, so an offer that survives is one whose bytes
    // are already durably on disk. If the write fails, nothing is offered.
    const objectPath = this.writeObject(digest, file.bytes);
    let resident: Buffer | null = file.bytes;
    if (objectPath) {
      this.evictFor(file.bytes.byteLength);
      if (file.bytes.byteLength > this.residentBytes) resident = null;
      else this.resident += file.bytes.byteLength;
    }
    this.entries.set(id, { offer, bytes: resident, objectPath, decision: "pending", detail: "" });
    this.record(id, "pending", `${offer.name} (${offer.size} bytes)`);
    return { ok: true, value: offer };
  }

  list(): readonly AlterSendOffer[] {
    return [...this.entries.values()].map((e) => e.offer);
  }

  get(id: string): AlterSendResult<AlterSendOffer> {
    const e = this.entries.get(id);
    return e ? { ok: true, value: e.offer } : { ok: false, reason: "no-such-offer" };
  }

  /**
   * The receiver's decision. This is the only way a file becomes accepted, and
   * it verifies the bytes against the hash the sender published first — a sender
   * that lies about the digest is caught here, not at write time.
   */
  accept(id: string): AlterSendResult<AlterSendOffer> {
    const e = this.entries.get(id);
    if (!e) return { ok: false, reason: "no-such-offer" };
    if (e.decision !== "pending") return { ok: false, reason: `already:${e.decision}` };
    let current: Buffer;
    try {
      current = this.readObject(e);
    } catch (err) {
      e.decision = "refused";
      e.detail = "unreadable";
      this.record(id, "refused", err instanceof Error ? err.message : "the object could not be read back");
      return { ok: false, reason: "file:unreadable" };
    }
    if (digestOf(current) !== e.offer.digest) {
      e.decision = "refused";
      e.detail = "digest-mismatch";
      this.record(id, "refused", "the bytes do not match the digest the sender published");
      return { ok: false, reason: "file:digest-mismatch" };
    }
    e.decision = "accepted";
    this.record(id, "accepted", e.offer.name);
    return { ok: true, value: e.offer };
  }

  refuse(id: string, why = "the receiver declined"): AlterSendResult<AlterSendOffer> {
    const e = this.entries.get(id);
    if (!e) return { ok: false, reason: "no-such-offer" };
    if (e.decision !== "pending") return { ok: false, reason: `already:${e.decision}` };
    e.decision = "refused";
    e.detail = why;
    this.record(id, "refused", why);
    return { ok: true, value: e.offer };
  }

  /** Hand over the bytes — only ever after accept(). */
  fetch(id: string): AlterSendResult<{ offer: AlterSendOffer; bytes: Buffer }> {
    const e = this.entries.get(id);
    if (!e) return { ok: false, reason: "no-such-offer" };
    if (e.decision !== "accepted") return { ok: false, reason: `not-accepted (${e.decision})` };
    let bytes: Buffer;
    try {
      bytes = this.readObject(e);
    } catch (err) {
      e.decision = "refused";
      e.detail = "unreadable";
      this.record(id, "refused", err instanceof Error ? err.message : "the object could not be read back");
      return { ok: false, reason: "file:unreadable" };
    }
    e.decision = "fetched";
    if (e.bytes) { this.resident -= e.bytes.byteLength; e.bytes = null; }
    this.record(id, "fetched", e.offer.name);
    return { ok: true, value: { offer: e.offer, bytes: Buffer.from(bytes) } };
  }

  drop(id: string): AlterSendResult<true> {
    const e = this.entries.get(id);
    if (!e) return { ok: false, reason: "no-such-offer" };
    if (e.objectPath) { try { fs.rmSync(e.objectPath, { force: true }); } catch { /* already gone */ } }
    if (e.bytes) this.resident -= e.bytes.byteLength;
    this.entries.delete(id);
    this.record(id, "refused", "dropped");
    return { ok: true, value: true };
  }

  /** The ledger, for the receipts screen. */
  ledger(): readonly AlterSendReceipt[] {
    return [...this.receipts];
  }

  /**
   * Re-walk the chain. Any entry removed or edited from the middle breaks every
   * later digest — the same property the crash ledger buys, for the same reason.
   */
  verifyChain(): { ok: boolean; brokenAt?: number } {
    let prev = "";
    for (let i = 0; i < this.receipts.length; i += 1) {
      const r = this.receipts[i]!;
      const payload = `${prev}|${r.id}|${r.decision}|${r.detail}|${r.at}`;
      const want = `sha256:${createHash("sha256").update(payload).digest("hex")}`;
      if (want.length !== r.digest.length || !timingSafeEqual(Buffer.from(want), Buffer.from(r.digest))) {
        return { ok: false, brokenAt: i };
      }
      prev = r.digest;
    }
    return { ok: true };
  }
}
