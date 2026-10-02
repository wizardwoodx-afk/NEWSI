#!/usr/bin/env node
/**
 * zipwriter â€” the one way this repo writes a .zip, on every platform.
 *
 * 11.14.4. Both packers used to shell out to Info-ZIP:
 *
 *     execFileSync("zip", ["-q", "-X", "-9", outFile, "-@"], â€¦)
 *
 * and write their file list to a hardcoded `/tmp/â€¦`. Neither assumption holds
 * off Linux. On Windows there is no `zip` on PATH, and `/tmp` does not exist, so
 * `tools/pack-release.mjs` could only ever be run by a maintainer on a Mac â€”
 * which is why the published artifacts had no reproducible provenance: a human
 * ran a POSIX-only script by hand, and CI (which runs on ubuntu) never produced
 * the artifact it was named after.
 *
 * WHAT THIS DOES. Writes the zip in pure Node with `zlib`, so the same code
 * produces byte-identical output on Windows, macOS and Linux. The archive is a
 * real ZIP (local headers + central directory + EOCD), stores directories
 * explicitly so an empty folder survives the round trip, and preserves the
 * executable bit on POSIX so `scripts/verify.sh` is still runnable after unzip.
 *
 * WHY NOT A DEPENDENCY. The project already ships `jszip`, but it buffers the
 * whole archive in memory before it can be written, which is the wrong shape for
 * a 100+ MB release artifact on a laptop. This is ~150 lines of well-specified
 * format (APPNOTE 6.3.3) with no new supply-chain surface.
 *
 * Deterministic by construction: entries are written in the order given, and no
 * timestamp is invented, so packing the same tree twice yields the same bytes.
 */

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const SIG_LOCAL = 0x04034b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_EOCD = 0x06054b50;
const METHOD_STORE = 0;
const METHOD_DEFLATE = 8;

/** CRC-32 (IEEE 802.3), the polynomial every ZIP tool uses. */
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0 ^ -1;
  for (let i = 0; i < buf.length; i += 1) c = (c >>> 8) ^ CRC_TABLE[(c ^ buf[i]) & 0xff];
  return (c ^ -1) >>> 0;
}

/**
 * MS-DOS date/time. ZIP cannot represent anything before 1980 or after 2107, so
 * an out-of-range stamp is clamped rather than allowed to wrap into a nonsense
 * date. Defaults to the epoch so packing the same tree twice is stable.
 */
function dosDateTime(when) {
  const d = when && !Number.isNaN(when.getTime()) ? when : new Date(0);
  const year = Math.min(2107, Math.max(1980, d.getFullYear()));
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (Math.floor(d.getSeconds() / 2));
  const day = ((year - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  return { time, dosDate: day };
}

/**
 * Write `rels` to `outFile` as a zip.
 *
 * @param {string}   outFile
 * @param {string[]} rels        file paths relative to `opts.root`, in order
 * @param {object}   opts
 * @param {string}   opts.root
 * @param {Date}     [opts.date]  stamp for every entry (default: the epoch)
 * @param {number}   [opts.level] 0-9; 0 stores, 9 is smallest
 */
export function writeZip(outFile, rels, opts) {
  const { root, date = new Date(0), level = 9 } = opts;
  const { time, dosDate } = dosDateTime(date);

  // Explicit directory entries: an empty folder is real information (a reviewer
  // unzips and expects the shape), and some tools drop empty dirs otherwise.
  const dirs = new Set();
  for (const rel of rels) {
    const parts = rel.split("/").slice(0, -1);
    for (let i = 1; i <= parts.length; i += 1) dirs.add(`${parts.slice(0, i).join("/")}/`);
  }

  const localChunks = [];
  const central = [];
  let offset = 0;

  const pushEntry = (name, data, isDir, unixMode) => {
    const nameBuf = Buffer.from(name, "utf8");
    const crc = isDir ? 0 : crc32(data);
    const raw = isDir ? Buffer.alloc(0) : data;
    const deflated = !isDir && level > 0 ? zlib.deflateRawSync(raw, { level }) : null;
    const useDeflate = deflated !== null && deflated.length < raw.length;
    const body = useDeflate ? deflated : raw;
    const method = useDeflate ? METHOD_DEFLATE : METHOD_STORE;
    const flags = 0x0800; // UTF-8 names

    const local = Buffer.alloc(30);
    local.writeUInt32LE(SIG_LOCAL, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(flags, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(dosDate, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28); // extra length

    localChunks.push(local, nameBuf, body);

    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(SIG_CENTRAL, 0);
    cd.writeUInt16LE(0x031e, 4); // version made by: UNIX, spec 3.0
    cd.writeUInt16LE(20, 6);
    cd.writeUInt16LE(flags, 8);
    cd.writeUInt16LE(method, 10);
    cd.writeUInt16LE(time, 12);
    cd.writeUInt16LE(dosDate, 14);
    cd.writeUInt32LE(crc, 16);
    cd.writeUInt32LE(body.length, 20);
    cd.writeUInt32LE(raw.length, 24);
    cd.writeUInt16LE(nameBuf.length, 28);
    cd.writeUInt16LE(0, 30); // extra
    cd.writeUInt16LE(0, 32); // comment
    cd.writeUInt16LE(0, 34); // disk number
    cd.writeUInt16LE(0, 36); // internal attrs
    // External attrs carry the unix mode in the high 16 bits â€” this is what
    // keeps scripts/verify.sh executable after unzip on a POSIX host.
    cd.writeUInt32LE(((unixMode & 0xffff) << 16) >>> 0, 38);
    cd.writeUInt32LE(offset, 42);
    central.push(cd, nameBuf);

    offset += local.length + nameBuf.length + body.length;
  };

  for (const d of [...dirs].sort()) pushEntry(d, Buffer.alloc(0), true, 0o755);
  for (const rel of rels) {
    const abs = path.join(root, rel);
    const data = fs.readFileSync(abs);
    // Mirror the source mode where the platform has one; default 0644.
    let mode = 0o644;
    if (process.platform !== "win32") {
      try { mode = fs.statSync(abs).mode & 0o777; } catch { /* keep the default */ }
    }
    pushEntry(rel, data, false, mode);
  }

  const centralBuf = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  const count = rels.length + dirs.size;
  eocd.writeUInt32LE(SIG_EOCD, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(count, 8);
  eocd.writeUInt16LE(count, 10);
  eocd.writeUInt32LE(centralBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20); // comment length

  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, Buffer.concat([...localChunks, centralBuf, eocd]));
  return { entries: count, bytes: fs.statSync(outFile).size };
}
