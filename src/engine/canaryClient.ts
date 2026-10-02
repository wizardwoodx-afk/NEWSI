/**
 * CANARY CLIENT — the bridge to the EXTERNAL verifier (19.7.9 [Keyholder]).
 *
 * The battery lives in `verifier/si-verifier.mjs`, a separate zero-dependency
 * process OUTSIDE src/. The 19.7.8 review killed the old model — the
 * verifier's private key shipped in the artifact, so its signature proved
 * nothing. The new model has no secret in the artifact at all:
 *
 *   PROVISIONING (once per machine, owner-gated)
 *     spawn verifier {op:"provision"}
 *       → verifier generates a fresh ECDSA P-256 keypair, private key at
 *         ~/.selfimpulse/verifier.key (0600, outside every artifact)
 *       → returns publicKeyJwk + keyFingerprint + programDigest
 *     VH countersigns {publicKeyJwk, programDigest} with the OWNER key
 *     (the mandate/crossing authority) → REGISTRATION in the owner store.
 *
 *   VERDICTS (every canary run)
 *     spawn verifier {nonce, candidate} — nonce is CSPRNG (randomUUID)
 *       → verdict {failed, batteryDigest, programDigest, sig}
 *     validate: nonce echo · batteryDigest === pinned · programDigest ===
 *     pinned · alg === pinned · ECDSA verify under the REGISTERED key.
 *     Replays, tampered payloads, swapped batteries, modified programs,
 *     and stranger keys are all refused — each named.
 *
 *   HONEST DEGRADATION — no node runtime, no storage, or no owner key →
 *     the report says `unavailable` with the reason, and the gate never
 *     pretends: the candidate simply cannot pass canaries without the
 *     externally executed, digest-pinned battery. (Honest words: the
 *     battery is pinned and outside the proposal API — it is not secret,
 *     and nothing here claims it is.)
 */

import { TRUST_ROOT } from "./verifierTrust";
import { liveOwnerKeys } from "./federation/live";
import { importPublicKeyWeb } from "./authorityWeb";
import { bytesToB64, b64ToBytes } from "./authorityCore";

export const VERIFIER_PATH = "verifier/si-verifier.mjs";

export interface ExternalCanaryReport {
  ran: number;
  failed: Array<{ id: string; finding: string }>;
  batteryDigest: string;
  /** "external-verifier" = a live, signature-verified run; "unavailable" = no process could run. */
  source: "external-verifier" | "unavailable";
  note?: string;
}

export interface VerifierWire {
  nonce: string;
  ran: number;
  failed: Array<{ id: string; finding: string }>;
  batteryDigest: string;
  programDigest: string;
  alg: string;
  sig: string;
}

export interface VerifierRegistration {
  publicKeyJwk: { kty: string; crv: string; x: string; y: string; key_ops?: string[]; ext?: boolean };
  keyFingerprint: string;
  programDigest: string;
  registeredAt: number;
  /** `ecdsa-p256:` + base64 — the owner's countersignature over the canonical registration. */
  ownerSig: string;
}

export function canonicalRegistration(r: Omit<VerifierRegistration, "ownerSig">): string {
  return JSON.stringify({ v: "si-verifier-registration/3", publicKeyJwk: r.publicKeyJwk, keyFingerprint: r.keyFingerprint, programDigest: r.programDigest, registeredAt: r.registeredAt });
}

/** CSPRNG nonce — randomUUID, with a getRandomValues fallback. No clocks, no Math.random. */
export function newNonce(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string; getRandomValues?: (a: Uint8Array) => Uint8Array } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  if (c?.getRandomValues) {
    const bytes = c.getRandomValues(new Uint8Array(32));
    return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  return null as unknown as string; // no CSPRNG in this runtime — caller degrades honestly
}

/** The canonical payload the verifier signs and VH verifies (v3: program-bound). */
export function canonicalVerdictPayload(nonce: string, ran: number, failed: Array<{ id: string; finding: string }>, batteryDigest: string, programDigest: string): string {
  return `si-verifier/3|${nonce}|${ran}|${JSON.stringify(failed)}|${batteryDigest}|${programDigest}`;
}

function subtle(): SubtleCrypto | null {
  const g = globalThis as { crypto?: { subtle?: SubtleCrypto } };
  if (g.crypto?.subtle) return g.crypto.subtle;
  try {
    const proc = (globalThis as { process?: { getBuiltinModule?: (id: string) => { webcrypto?: { subtle?: SubtleCrypto } } } }).process;
    return proc?.getBuiltinModule?.("node:crypto")?.webcrypto?.subtle ?? null;
  } catch {
    return null;
  }
}

/* ── the registration (owner trust store) ───────────────────────────────── */

function storage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function readRegistration(): VerifierRegistration | null {
  try {
    const raw = storage()?.getItem(TRUST_ROOT.registrationKey);
    return raw ? (JSON.parse(raw) as VerifierRegistration) : null;
  } catch {
    return null;
  }
}

function writeRegistration(reg: VerifierRegistration): void {
  storage()?.setItem(TRUST_ROOT.registrationKey, JSON.stringify(reg));
}

/** Test/admin seam — forget the registration (the next run re-provisions, owner-gated). */
export function resetRegistration(): void {
  storage()?.removeItem(TRUST_ROOT.registrationKey);
}

/**
 * Verify a registration end to end: the owner countersignature must verify
 * under the owner public key, and the registered program digest must equal
 * the SHIPPED pin. Anything else is not a registration.
 */
export async function verifyRegistration(reg: VerifierRegistration | null, ownerPublicPem: string): Promise<{ ok: true; reg: VerifierRegistration } | { ok: false; reason: string }> {
  if (!reg || typeof reg !== "object") return { ok: false, reason: "no verifier registration on this machine" };
  if (reg.programDigest !== TRUST_ROOT.verifierProgramDigest) return { ok: false, reason: "registration anchors a different verifier program — re-provision required" };
  if (typeof reg.ownerSig !== "string" || !reg.ownerSig.startsWith("ecdsa-p256:")) return { ok: false, reason: "registration is not owner-countersigned" };
  try {
    const pub = await importPublicKeyWeb(ownerPublicPem);
    const ok = await subtle()!.verify({ name: "ECDSA", hash: "SHA-256" }, pub, b64ToBytes(reg.ownerSig.slice("ecdsa-p256:".length)), new TextEncoder().encode(canonicalRegistration(reg)));
    if (!ok) return { ok: false, reason: "registration countersignature does not verify — treating as forged" };
    return { ok: true, reg };
  } catch (err) {
    return { ok: false, reason: `registration check failed: ${err instanceof Error ? err.message : String(err)}` };
  }
}

/**
 * Ensure a valid registration exists: reuse the stored one, or provision a
 * fresh verifier key and countersign it with the OWNER key. Every failure
 * mode is named — provisioning is owner-gated by design.
 */
export async function ensureRegistration(): Promise<{ ok: true; reg: VerifierRegistration } | { ok: false; reason: string }> {
  const proc = (globalThis as { process?: { execPath?: string; cwd?: () => string; getBuiltinModule?: (id: string) => unknown; versions?: { node?: string } } }).process;
  const getBuiltin = proc?.getBuiltinModule;
  if (typeof getBuiltin !== "function" || typeof proc?.cwd !== "function" || !proc.versions?.node) {
    return { ok: false, reason: "no node runtime — the external verifier cannot run here" };
  }
  if (!storage()) return { ok: false, reason: "no local trust store — the registration cannot persist" };

  const keys = await liveOwnerKeys().catch(() => null);
  if (!keys?.privateKey || !keys?.publicKeyPem) {
    return { ok: false, reason: "the owner key is unavailable — unseal the vault (or connect the owner key) to provision the verifier" };
  }

  const existing = readRegistration();
  const checked = await verifyRegistration(existing, keys.publicKeyPem);
  if (checked.ok) return checked;

  const cp = getBuiltin("node:child_process") as { execFileSync: (file: string, args: string[], opts: Record<string, unknown>) => string | Buffer };
  const fs = getBuiltin("node:fs") as { existsSync: (p: string) => boolean };
  const pathMod = getBuiltin("node:path") as { resolve: (...p: string[]) => string };
  const verifierPath = pathMod.resolve(proc.cwd()!, VERIFIER_PATH);
  if (!fs.existsSync(verifierPath)) return { ok: false, reason: `verifier process not found at ${VERIFIER_PATH}` };

  let prov;
  try {
    const raw = cp.execFileSync(proc.execPath as string, [verifierPath], { input: JSON.stringify({ op: "provision" }), encoding: "utf8", timeout: 15_000 }) as string;
    prov = JSON.parse(raw) as { op?: string; publicKeyJwk?: VerifierRegistration["publicKeyJwk"]; keyFingerprint?: string; programDigest?: string; error?: string };
  } catch (err) {
    return { ok: false, reason: `verifier provisioning failed: ${err instanceof Error ? err.message : String(err)}` };
  }
  if (prov.op !== "provisioned" || !prov.publicKeyJwk || !prov.keyFingerprint || !prov.programDigest) {
    return { ok: false, reason: `verifier provisioning refused: ${prov.error ?? "malformed response"}` };
  }
  if (prov.programDigest !== TRUST_ROOT.verifierProgramDigest) {
    return { ok: false, reason: `provisioned verifier program ${prov.programDigest.slice(0, 12)}… does not match the shipped pin ${TRUST_ROOT.verifierProgramDigest.slice(0, 12)}… — a modified verifier is not registrable` };
  }
  const reg: Omit<VerifierRegistration, "ownerSig"> = {
    publicKeyJwk: prov.publicKeyJwk,
    keyFingerprint: prov.keyFingerprint,
    programDigest: prov.programDigest,
    registeredAt: Date.now(),
  };
  const s = subtle();
  if (!s) return { ok: false, reason: "no WebCrypto in this runtime — the owner countersignature cannot be minted" };
  const sig = await s.sign({ name: "ECDSA", hash: "SHA-256" }, keys.privateKey, new TextEncoder().encode(canonicalRegistration(reg)));
  const full: VerifierRegistration = { ...reg, ownerSig: `ecdsa-p256:${bytesToB64(new Uint8Array(sig))}` };
  writeRegistration(full);
  return { ok: true, reg: full };
}

/**
 * Verify a verdict against the TRUST ROOT + the REGISTRATION: nonce echo,
 * battery anchor, program anchor, algorithm tag, and the ECDSA P-256
 * signature under the REGISTERED verifier key. Nothing here trusts the
 * verifier's word — only its registered key and the pinned digests.
 */
export async function validateVerifierOutput(out: VerifierWire, expectedNonce: string, reg: VerifierRegistration): Promise<{ ok: true; report: ExternalCanaryReport } | { ok: false; reason: string }> {
  if (!out || typeof out !== "object") return { ok: false, reason: "verifier output is not an object" };
  if (out.nonce !== expectedNonce) return { ok: false, reason: "verdict nonce mismatch — replay refused" };
  if (!Array.isArray(out.failed)) return { ok: false, reason: "verdict failed-list malformed" };
  if (typeof out.ran !== "number" || typeof out.batteryDigest !== "string" || out.batteryDigest.length !== 64) return { ok: false, reason: "verdict payload malformed" };
  if (out.alg !== TRUST_ROOT.algorithm) return { ok: false, reason: `verdict algorithm '${String(out.alg)}' is not the pinned ${TRUST_ROOT.algorithm}` };
  if (out.programDigest !== TRUST_ROOT.verifierProgramDigest) {
    return { ok: false, reason: `verdict came from program ${String(out.programDigest).slice(0, 12)}… — the shipped pin is ${TRUST_ROOT.verifierProgramDigest.slice(0, 12)}… — a modified verifier is refused` };
  }
  if (out.batteryDigest !== TRUST_ROOT.expectedBatteryDigest) {
    return { ok: false, reason: `battery digest ${out.batteryDigest.slice(0, 12)}… does not match the pinned battery ${TRUST_ROOT.expectedBatteryDigest.slice(0, 12)}… — a swapped battery is not the approved exam` };
  }
  const s = subtle();
  if (!s) return { ok: false, reason: "no WebCrypto in this runtime — the signature cannot be verified here" };
  try {
    const jwk: JsonWebKey = { ...reg.publicKeyJwk } as JsonWebKey;
    const key = await s.importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
    const ok = await s.verify({ name: "ECDSA", hash: "SHA-256" }, key, b64ToBytes(out.sig), new TextEncoder().encode(canonicalVerdictPayload(out.nonce, out.ran, out.failed, out.batteryDigest, out.programDigest)));
    if (!ok) return { ok: false, reason: `verdict signature INVALID under the registered verifier key ${reg.keyFingerprint.slice(0, 12)}… — tamper or a forged signer refused` };
    return {
      ok: true,
      report: { ran: out.ran, failed: out.failed.map((f) => ({ id: String(f.id), finding: String(f.finding) })), batteryDigest: out.batteryDigest, source: "external-verifier" },
    };
  } catch (err) {
    return { ok: false, reason: `signature verification failed: ${err instanceof Error ? err.message : String(err)}` };
  }
}

/**
 * Run the external verifier for one candidate and verify its verdict
 * against the trust root and the owner-countersigned registration. Node
 * runtimes with an owner key get a REAL signed process run; anything less
 * is honestly `unavailable`.
 */
export async function verifyExternal(candidate: { name: string; target: string; body: string; declares: string }): Promise<ExternalCanaryReport> {
  const reg = await ensureRegistration();
  if (!reg.ok) return { ran: 0, failed: [], batteryDigest: "", source: "unavailable", note: reg.reason };
  try {
    const proc = (globalThis as { process?: { execPath?: string; cwd?: () => string; getBuiltinModule?: (id: string) => unknown; versions?: { node?: string } } }).process;
    if (typeof proc?.cwd !== "function" || typeof proc?.getBuiltinModule !== "function" || typeof proc.execPath !== "string") {
      return { ran: 0, failed: [], batteryDigest: "", source: "unavailable", note: "no node runtime — the external verifier cannot run here" };
    }
    const cp = proc.getBuiltinModule("node:child_process") as { execFileSync: (file: string, args: string[], opts: Record<string, unknown>) => string | Buffer };
    const fs = proc.getBuiltinModule("node:fs") as { existsSync: (p: string) => boolean };
    const pathMod = proc.getBuiltinModule("node:path") as { resolve: (...p: string[]) => string };
    const verifierPath = pathMod.resolve(proc.cwd(), VERIFIER_PATH);
    if (!fs.existsSync(verifierPath)) {
      return { ran: 0, failed: [], batteryDigest: "", source: "unavailable", note: `verifier process not found at ${VERIFIER_PATH}` };
    }
    const nonce = newNonce();
    if (!nonce) return { ran: 0, failed: [], batteryDigest: "", source: "unavailable", note: "no CSPRNG in this runtime — refusing to run without a fresh nonce" };
    const raw = cp.execFileSync(proc.execPath, [verifierPath], {
      input: JSON.stringify({ nonce, candidate }),
      encoding: "utf8",
      timeout: 15_000,
    }) as string;
    const out = JSON.parse(raw) as VerifierWire;
    const res = await validateVerifierOutput(out, nonce, reg.reg);
    if (!res.ok) return { ran: 0, failed: [], batteryDigest: "", source: "unavailable", note: res.reason };
    return res.report;
  } catch (err) {
    return { ran: 0, failed: [], batteryDigest: "", source: "unavailable", note: `verifier run failed: ${err instanceof Error ? err.message : String(err)}` };
  }
}
