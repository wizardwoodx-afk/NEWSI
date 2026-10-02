/* ============================================================================
 * checkpoints.js — checkpoints.js — formalized from the v0.10.1 pinned contract
 * ----------------------------------------------------------------------------
 * NOTE: listed as "unchanged" from the v0.9 branch but not bundled in the
 * v0.10.1 doc. v0.10.2 ships it explicitly, formalized to the contracts
 * pinned by the self-test (Fix A):
 *   • oversized line  → VHLedgerError("... exceeds maximum ...")
 *   • malformed line  → VHLedgerError("... unparseable JSON ...")
 *   • init(jwk) verifies stored checkpoint signatures when a key is given.
 * ========================================================================== */

import fs   from "node:fs";
import path from "node:path";
import { verify }        from "../core/si-crypto.js";
import { VHLedgerError } from "../core/si-errors.js";
import { log }           from "./logger.js";

const MAX_LINE_BYTES = 8 * 1024;   /* checkpoints are small signed statements */

export class CheckpointStore {
  constructor(dataDir) {
    this.dir   = dataDir;
    this.file  = path.join(dataDir, "checkpoints.jsonl");
    this.items = [];
  }

  async init(jwk) {
    fs.mkdirSync(this.dir, { recursive: true });
    if (!fs.existsSync(this.file)) return this;

    const raw = fs.readFileSync(this.file, "utf8");
    for (const line of raw.split("\n")) {
      if (!line.trim()) continue;
      if (line.length > MAX_LINE_BYTES)
        throw new VHLedgerError(`checkpoint line exceeds maximum size (${MAX_LINE_BYTES} bytes)`);
      let cp;
      try { cp = JSON.parse(line); }
      catch { throw new VHLedgerError("unparseable JSON in checkpoint store"); }
      if (!cp?.statement || !cp?.sig)
        throw new VHLedgerError("checkpoint missing statement or sig");
      if (jwk && !(await verify(jwk, cp.statement, cp.sig)))
        throw new VHLedgerError("checkpoint signature verification failed");
      this.items.push(cp);
    }
    log.info("checkpoints.init", { file: this.file, count: this.items.length });
    return this;
  }

  async append(cp) {
    fs.appendFileSync(this.file, JSON.stringify(cp) + "\n");
    this.items.push(cp);
    return cp;
  }

  latest() { return this.items.length ? this.items[this.items.length - 1] : null; }
  get size() { return this.items.length; }
}
