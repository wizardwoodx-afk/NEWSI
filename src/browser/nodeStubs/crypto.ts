/**
 * Browser stand-in for `node:crypto` — VH 16.4.
 *
 * Same story as `./fs.ts` and `./child_process.ts`: the engine's Node-side modules
 * (the drill, the mission loop) use the real builtin under Node/Tauri, and the
 * probe suites run the real modules — never a double. The WebView has no
 * `node:crypto`; the proof layer itself already uses the Web Crypto API
 * (`crypto.subtle`) where browser-native hashing is possible. Every member the
 * engine modules import is declared here and refuses by name, so a browser-side
 * attempt degrades to a stated cause instead of a silent hash or signature.
 *
 * The export surface is load-bearing, not incidental: `vite.config.ts` aliases
 * `^node:crypto$` here, so a member the alias target does not export is a BUILD
 * failure for the importer, not a runtime one. `probe/stubSurface.test.ts`
 * pins that surface against what `src/` actually imports.
 */

/** One stated cause for every member. The WebView has no `node:crypto`, and the
 *  Web Crypto API cannot stand in for the sync, Buffer-based surface the engine
 *  modules import (`generateKeyPairSync` is sync-only; `crypto.subtle` is async).
 *  So each member refuses by name rather than returning a value that would let a
 *  security decision pass on a hash or signature that was never computed. */
function unavailable(member: string): never {
  throw new Error(
    `node:crypto.${member} is not available in the WebView — this is a browser stub, ` +
      "not a crypto implementation; the engine path that needs it runs on Node/Tauri"
  );
}

export function createHash(): never {
  return unavailable("createHash");
}

export function randomBytes(): never {
  return unavailable("randomBytes");
}

export function timingSafeEqual(): never {
  return unavailable("timingSafeEqual");
}

export function createHmac(): never {
  return unavailable("createHmac");
}

export function generateKeyPairSync(): never {
  return unavailable("generateKeyPairSync");
}

export function sign(): never {
  return unavailable("sign");
}

export function verify(): never {
  return unavailable("verify");
}

export function createPrivateKey(): never {
  return unavailable("createPrivateKey");
}

export function createPublicKey(): never {
  return unavailable("createPublicKey");
}

export function hkdfSync(): never {
  return unavailable("hkdfSync");
}

export function pbkdf2Sync(): never {
  return unavailable("pbkdf2Sync");
}
