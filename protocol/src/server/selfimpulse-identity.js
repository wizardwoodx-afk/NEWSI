/* ============================================================================
 * selfimpulse-identity.js — selfimpulse-identity.js — formalized from the v0.10.1 pinned contract
 * ----------------------------------------------------------------------------
 * NOTE: listed as "unchanged" from the v0.9 branch but not bundled in the
 * v0.10.1 doc. v0.10.2 ships it explicitly, formalized to the contracts
 * pinned by the self-test (Fix B):
 *   • persisted at <dataDir>/selfimpulse-identity.json (mode 0600)
 *   • sign-then-verify self-test on EVERY load and create
 *   • mismatched public JWK → VHCryptoError("... keypair mismatch ...")
 * ========================================================================== */

import fs   from "node:fs";
import path from "node:path";
import { webcrypto }  from "node:crypto";
import { fingerprint } from "../core/si-crypto.js";
import { VHCryptoError } from "../core/si-errors.js";
import { log }          from "./logger.js";

const subtle = webcrypto.subtle;
const ECDSA      = { name: "ECDSA", namedCurve: "P-256" };
const ECDSA_SIGN = { name: "ECDSA", hash: "SHA-256" };
const SELFTEST_MSG = "VH-SELFIMPULSE-IDENTITY-SELFTEST-v1";

async function _selfTest(privateKey, publicJwk) {
  const enc = new TextEncoder();
  const sig = await subtle.sign(ECDSA_SIGN, privateKey, enc.encode(SELFTEST_MSG));
  const key = await subtle.importKey("jwk", publicJwk, ECDSA, false, ["verify"]);
  return subtle.verify(ECDSA_SIGN, key, sig, enc.encode(SELFTEST_MSG));
}

export async function loadOrCreateSelfImpulseIdentity(dataDir) {
  fs.mkdirSync(dataDir, { recursive: true });
  const file = path.join(dataDir, "selfimpulse-identity.json");

  if (fs.existsSync(file)) {
    const rec = JSON.parse(fs.readFileSync(file, "utf8"));
    if (!rec?.privateJwk || !rec?.publicJwk)
      throw new VHCryptoError("selfimpulse identity file incomplete");
    const privateKey = await subtle.importKey("jwk", rec.privateJwk, ECDSA, true, ["sign"]);
    if (!(await _selfTest(privateKey, rec.publicJwk)))
      throw new VHCryptoError("selfimpulse identity keypair mismatch: stored public key does not match private key");
    const fp = await fingerprint(rec.publicJwk);
    log.info("selfimpulse.identity.loaded", { fp });
    return { privateKey, jwk: rec.publicJwk, fp };
  }

  const kp  = await subtle.generateKey(ECDSA, true, ["sign", "verify"]);
  const publicJwk  = await subtle.exportKey("jwk", kp.publicKey);
  const privateJwk = await subtle.exportKey("jwk", kp.privateKey);
  if (!(await _selfTest(kp.privateKey, publicJwk)))
    throw new VHCryptoError("selfimpulse identity keypair mismatch: freshly generated keypair failed self-test");
  fs.writeFileSync(file, JSON.stringify({ v: 1, publicJwk, privateJwk }, null, 2), { mode: 0o600 });
  const fp = await fingerprint(publicJwk);
  log.info("selfimpulse.identity.created", { fp });
  return { privateKey: kp.privateKey, jwk: publicJwk, fp };
}
