/* ============================================================================
 * si-errors.js — si-errors.js — formalized from the v0.10.1 pinned contract
 * ----------------------------------------------------------------------------
 * NOTE: listed as "unchanged" from the v0.9 branch but not bundled in the
 * v0.10.1 doc. v0.10.2 ships it explicitly, formalized to the exact
 * contracts the code and self-test pin (error class names, VHTamperError.seq,
 * VHError(code, message) shape).
 * ========================================================================== */

export class VHError extends Error {
  constructor(code, message) {
    super(message ?? code);
    this.name = "VHError";
    this.code = code;
  }
}

export class VHCryptoError extends VHError {
  constructor(message) { super("CRYPTO_ERROR", message); this.name = "VHCryptoError"; }
}

export class VHPolicyError extends VHError {
  constructor(message) { super("POLICY_ERROR", message); this.name = "VHPolicyError"; }
}

export class VHAuthError extends VHError {
  constructor(message) { super("AUTH_ERROR", message); this.name = "VHAuthError"; }
}

export class VHConfigError extends VHError {
  constructor(message) { super("CONFIG_ERROR", message); this.name = "VHConfigError"; }
}

export class VHLedgerError extends VHError {
  constructor(message) { super("LEDGER_ERROR", message); this.name = "VHLedgerError"; }
}

export class VHTamperError extends VHError {
  constructor(seq, message) {
    super("LEDGER_TAMPERED", message);
    this.name = "VHTamperError";
    this.seq = seq;
  }
}
