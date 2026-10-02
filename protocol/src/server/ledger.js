import fs       from "node:fs";
import path     from "node:path";
import readline from "node:readline";
import { sha256Hex, verify, sign as vhSign, GENESIS } from "../core/si-crypto.js";
import { VHTamperError, VHLedgerError } from "../core/si-errors.js";
import { log } from "./logger.js";

const MAX_PAYLOAD_BYTES = 512 * 1024;

/* ─────────────────────────────────────────────────────────────────────────
 * ILedgerStorage — storage backend interface.
 *
 * interface ILedgerStorage {
 *   readLines(): AsyncIterable<string>
 *   appendLine(line: string): Promise<void>
 * }
 *
 * JsonlStorage: O(1) append via appendFileSync + fsync.
 * See ATOMICITY NOTE in file header.
 * ───────────────────────────────────────────────────────────────────────── */

class JsonlStorage {
  constructor(file) { this.file = file; }

  async *readLines() {
    if (!fs.existsSync(this.file)) return;
    const rl = readline.createInterface({
      input: fs.createReadStream(this.file, { encoding: "utf8" }),
      crlfDelay: Infinity,
    });
    for await (const line of rl) if (line.trim()) yield line;
  }

  /* O(1) append with fsync on all platforms */
  async appendLine(line) {
    fs.appendFileSync(this.file, line + "\n");
    /* fsync to flush OS write buffer — ensures durability before ack */
    const fd = fs.openSync(this.file, "r+");
    try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  }
}

function _linkHeader(seq, prev, hash, tsRecorded) {
  return `VH-LINK-META|${seq}|${prev}|${hash}|${tsRecorded}`;
}

export class Ledger {
  /**
   * @param {string} file
   * @param {object} opts
   * @param {number}  opts.chainMemory
   * @param {boolean} opts.failFast
   * @param {boolean} opts.requireMetaSig  default true (from config)
   * @param {object}  [opts.storage]       ILedgerStorage
   */
  constructor(file, { chainMemory = 1_000, failFast = true, requireMetaSig = true, storage } = {}) {
    this.file             = file;
    this.chainMemory      = chainMemory;
    this.failFast         = failFast;
    this.requireMetaSig   = requireMetaSig;
    this.links            = [];
    this.seq              = 0;
    this._queue           = Promise.resolve();
    this._storage         = storage ?? new JsonlStorage(file);
    this._selfimpulseKey       = null;
    this._firstMetaSigSeq = null;
  }

  setSelfImpulseKey(selfimpulseKey) { this._selfimpulseKey = selfimpulseKey; }

  get length()   { return this.seq; }
  get lastHash() { return this.links.length ? this.links[this.links.length - 1].hash : GENESIS; }
  tail(n = 20)   { return this.links.slice(-Math.min(n, this.links.length)); }

  async init() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    let prev = GENESIS;
    let seq  = 0;

    for await (const line of this._storage.readLines()) {
      if (line.length > MAX_PAYLOAD_BYTES * 2)
        throw new VHTamperError(seq + 1, "line exceeds maximum size");
      let link;
      try { link = JSON.parse(line); }
      catch { throw new VHTamperError(seq + 1, "unparseable line"); }

      seq += 1;
      if (link.seq  !== seq)  throw new VHTamperError(seq, "sequence gap");
      if (link.prev !== prev) throw new VHTamperError(seq, "broken prev pointer");

      const recomputed = await sha256Hex(link.prev + "|" + link.payloadStr);
      if (recomputed !== link.hash) throw new VHTamperError(seq, "hash mismatch");

      if (link.sig && link.pubJwk) {
        if (!(await verify(link.pubJwk, `${link.p}|${link.n}|${link.ts}`, link.sig)))
          throw new VHTamperError(seq, "payload signature mismatch");
      }

      if (link.metaSig) {
        if (this._firstMetaSigSeq === null) this._firstMetaSigSeq = seq;
        if (this._selfimpulseKey) {
          const header = _linkHeader(link.seq, link.prev, link.hash, link.tsRecorded);
          if (!(await verify(this._selfimpulseKey.jwk, header, link.metaSig)))
            throw new VHTamperError(seq, "selfimpulse meta-signature mismatch");
        }
      } else if (this._firstMetaSigSeq !== null && this.requireMetaSig) {
        throw new VHTamperError(
          seq,
          `link at seq ${seq} is missing metaSig but seq ${this._firstMetaSigSeq} established ` +
          `the metaSig requirement (requireMetaSig=true). Possible tampering or mixed-version write.`,
        );
      }

      prev = link.hash;
      this.links.push(link);
      if (this.links.length > this.chainMemory) this.links.shift();
    }

    this.seq = seq;
    log.info("ledger.init", {
      file: this.file, status: "verified", links: seq,
      requireMetaSig:  this.requireMetaSig,
      firstMetaSigSeq: this._firstMetaSigSeq ?? "none",
    });
    return this;
  }

  append(entry) {
    if (!entry?.payloadStr || typeof entry.payloadStr !== "string")
      return Promise.reject(new VHLedgerError("append: payloadStr required"));
    if (entry.payloadStr.length > MAX_PAYLOAD_BYTES)
      return Promise.reject(new VHLedgerError("append: payloadStr exceeds size limit"));
    const run   = this._queue.then(() => this._appendOne(entry));
    this._queue = run.then(() => {}, () => {});
    return run;
  }

  async _appendOne(entry) {
    /* HARDEN-1 (v0.10.2): seq is STAGED and committed only after metaSig
       resolution succeeds. v0.10.1 incremented this.seq before the
       requireMetaSig throw paths — a signing failure there would leave an
       unrecoverable sequence gap on the next append. */
    const seq        = this.seq + 1;
    const prev       = this.lastHash;
    const hash       = await sha256Hex(prev + "|" + entry.payloadStr);
    const tsRecorded = Date.now();

    let metaSig = null;
    if (this._selfimpulseKey?.privateKey) {
      const header = _linkHeader(seq, prev, hash, tsRecorded);
      try {
        metaSig = await vhSign(this._selfimpulseKey.privateKey, header);
      } catch (e) {
        /* requireMetaSig=true: signing failure halts the append */
        if (this.requireMetaSig) {
          throw new VHLedgerError(
            `metaSig computation failed for seq ${seq}: ${e.message}. ` +
            `SelfImpulse key unavailable or corrupt. Set HANDLE_REQUIRE_META_SIG=false to skip (not recommended).`,
          );
        }
        /* requireMetaSig=false: log the failure and continue without metaSig */
        log.warn("ledger.metaSig.skipped", { seq, reason: e.message });
      }
      if (metaSig && this._firstMetaSigSeq === null) this._firstMetaSigSeq = seq;
    } else if (this.requireMetaSig && this._firstMetaSigSeq !== null) {
      /*
       * selfimpulseKey disappeared after firstMetaSigSeq was set.
       * This is a configuration error — refuse to write an unsigned link
       * into a ledger that has already established the metaSig invariant.
       */
      throw new VHLedgerError(
        `SelfImpulse key is unavailable but seq ${this._firstMetaSigSeq} established the metaSig ` +
        `requirement. Cannot append seq ${seq} without metaSig (requireMetaSig=true).`,
      );
    }

    this.seq = seq;   /* HARDEN-1: commit point */
    const link = { seq, prev, hash, tsRecorded, metaSig, ...entry };
    this.links.push(link);
    if (this.links.length > this.chainMemory) this.links.shift();
    await this._storage.appendLine(JSON.stringify(link));
    return link;
  }

  async verifyWindow() {
    const links = this.links;

    let linkIntact  = 0;
    const linkTotal = Math.max(0, links.length - 1);
    for (let i = 1; i < links.length; i++) {
      const recomputed = await sha256Hex(links[i].prev + "|" + links[i].payloadStr);
      if (links[i].prev === links[i - 1].hash && recomputed === links[i].hash) linkIntact++;
    }

    const signed = links.filter((l) => l.sig && l.pubJwk);
    let sigValid  = 0;
    for (const l of signed)
      if (await verify(l.pubJwk, `${l.p}|${l.n}|${l.ts}`, l.sig)) sigValid++;

    let metaSigValid = 0;
    let metaSigTotal = 0;
    if (this._selfimpulseKey) {
      const withMeta = links.filter((l) => l.metaSig);
      metaSigTotal   = withMeta.length;
      for (const l of withMeta) {
        const header = _linkHeader(l.seq, l.prev, l.hash, l.tsRecorded);
        if (await verify(this._selfimpulseKey.jwk, header, l.metaSig)) metaSigValid++;
      }
    }

    let missingMetaSig = 0;
    if (this._firstMetaSigSeq !== null && this.requireMetaSig) {
      for (const l of links)
        if (l.seq >= this._firstMetaSigSeq && !l.metaSig) missingMetaSig++;
    }

    const payloadSigsOk = sigValid === signed.length;
    const metaSigsOk    = metaSigTotal === 0 || metaSigValid === metaSigTotal;
    const noMissingMeta = missingMetaSig === 0;

    return {
      ok:             linkIntact === linkTotal && payloadSigsOk && metaSigsOk && noMissingMeta,
      links:          { intact: linkIntact,   total: linkTotal      },
      signatures:     { valid:  sigValid,     total: signed.length  },
      metaSignatures: { valid:  metaSigValid, total: metaSigTotal,  missing: missingMetaSig },
      window:         links.length,
      firstMetaSigSeq: this._firstMetaSigSeq,
      requireMetaSig:  this.requireMetaSig,
    };
  }
}
