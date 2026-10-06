import { createRequire as __mjCreateRequire } from "node:module"; const require = __mjCreateRequire(import.meta.url);

// probe/preflight.test.ts
import * as fs from "node:fs";
import * as path from "node:path";

// src/security/ownerRoot.ts
import { createHash as createHash2, createPrivateKey, createPublicKey, hkdfSync, pbkdf2Sync, sign as edSign2, verify as edVerify2 } from "node:crypto";

// src/security/sovereign.ts
import { createHash, generateKeyPairSync, sign as edSign, verify as edVerify } from "node:crypto";

// src/security/actionGraph.ts
function stableStringify(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const entries = Object.entries(value).filter(([, v]) => v !== void 0).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
}

// src/security/sovereign.ts
function workingRoot() {
  try {
    if (typeof process !== "undefined" && typeof process.cwd === "function") {
      const cwd = process.cwd();
      if (typeof cwd === "string" && cwd.length > 0) return cwd;
    }
  } catch {
  }
  return "/";
}
function requestProfileOf(node) {
  const cfg = node.config ?? {};
  const bool = (k, dflt) => typeof cfg[k] === "boolean" ? cfg[k] : dflt;
  const riskRaw = String(cfg.maxRisk ?? "low").toLowerCase();
  const maxRisk = riskRaw === "critical" || riskRaw === "high" || riskRaw === "medium" ? riskRaw : "low";
  return {
    agentId: String(node.id ?? node.title ?? "seat"),
    owner: String(cfg.owner ?? "owner"),
    allowWrite: bool("allowWrite", false),
    allowShell: bool("allowShell", false),
    allowNetwork: bool("allowNetwork", false),
    root: String(cfg.workspaceRoot ?? workingRoot()),
    budgetCeiling: Number(cfg.budgetCeiling ?? 0),
    maxRisk
  };
}
function profileDigest(p) {
  return createHash("sha256").update(`si.profile.v1
${stableStringify(p)}`).digest("hex");
}
function profileIsEffectful(p) {
  return p.allowWrite || p.allowShell || p.allowNetwork || p.maxRisk !== "low";
}
var MANDATE_FORMAT = "si.mandate.v1";
function mandateCanonical2(m) {
  return stableStringify({
    v: m.v,
    agentId: m.agentId,
    owner: m.owner,
    profile: m.profile,
    env: m.env,
    issuedAt: m.issuedAt,
    expiresAt: m.expiresAt
  });
}
function sessionSigner() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const pubDer = publicKey.export({ type: "spki", format: "der" });
  const id = createHash("sha256").update(pubDer).digest("hex").slice(0, 16);
  return {
    id,
    sign: (data) => edSign(null, Buffer.from(data, "utf8"), privateKey).toString("base64"),
    verify: (data, sig) => {
      try {
        return edVerify(null, Buffer.from(data, "utf8"), publicKey, Buffer.from(sig, "base64"));
      } catch {
        return false;
      }
    }
  };
}
function issueMandate(profile, signer, ttlMs = 60 * 6e4) {
  const issuedAt = Date.now();
  const m = {
    v: MANDATE_FORMAT,
    agentId: profile.agentId,
    owner: profile.owner,
    profile: profileDigest(profile),
    env: {
      allowWrite: profile.allowWrite,
      allowShell: profile.allowShell,
      allowNetwork: profile.allowNetwork,
      root: profile.root,
      budgetCeiling: profile.budgetCeiling,
      maxRisk: profile.maxRisk
    },
    issuedAt,
    expiresAt: issuedAt + Math.max(1, ttlMs)
  };
  return { ...m, signature: signer.sign(mandateCanonical2(m)) };
}
function verifyMandate(m, signer) {
  if (!m || typeof m !== "object" || !m.signature) {
    return { ok: false, reason: "missing", detail: "no mandate: a profile without a signature issues no authority" };
  }
  if (!m.owner || typeof m.owner !== "string") {
    return { ok: false, reason: "no-owner", detail: "the mandate names no human principal; an anonymous authority is not an authority" };
  }
  if (!signer.verify(mandateCanonical2(m), m.signature)) {
    return { ok: false, reason: "bad-signature", detail: `the mandate's signature does not verify against the owner key ${signer.id}` };
  }
  if (Date.now() > m.expiresAt) {
    return { ok: false, reason: "expired", detail: `the mandate expired at ${new Date(m.expiresAt).toISOString()}` };
  }
  return { ok: true, mandate: m };
}
function envelopeFromMandate(m, signer) {
  if (!verifyMandate(m, signer).ok) return null;
  return {
    allowWrite: m.env.allowWrite === true,
    allowShell: m.env.allowShell === true,
    allowNetwork: m.env.allowNetwork === true,
    root: String(m.env.root),
    budgetCeiling: Number(m.env.budgetCeiling) || 0,
    maxRisk: m.env.maxRisk
  };
}
var FRONT_DOOR_AGENT = "si.front-door.captain";
var FRONT_DOOR_TTL_MS = 60 * 6e4;
var DENY_ALL_ENVELOPE = {
  allowWrite: false,
  allowShell: false,
  allowNetwork: false,
  root: workingRoot(),
  budgetCeiling: 0,
  maxRisk: "low"
};
var SovereignAuthority = class {
  bootstrap;
  ownerSigner = null;
  issued = /* @__PURE__ */ new Map();
  revoked = /* @__PURE__ */ new Set();
  constructor(signer) {
    this.bootstrap = signer ?? null;
  }
  /** ONE authority root. The session key bootstraps (labelled honestly as
   *  "bootstrap"); binding the OWNER's key re-roots every issuance. */
  get root() {
    return this.ownerSigner ? "owner" : "bootstrap";
  }
  /** Bind the owner's signer — the human's key becomes THE root. Idempotent
   *  for the same key; the bootstrap key keeps verifying nothing new. */
  bindOwnerSigner(s) {
    this.ownerSigner = s;
  }
  /** DROP the owner binding — the vault-lock act. The root reverts to the
   *  labelled bootstrap, and every owner-signed artifact (mandates AND
   *  capabilities) stops verifying from this moment: a key that is gone
   *  cannot vouch. Re-binding with the same passphrase restores the same
   *  key, and with it the same mandates. */
  unbindOwnerSigner() {
    this.ownerSigner = null;
  }
  get rootSigner() {
    this.bootstrap ??= sessionSigner();
    return this.ownerSigner ?? this.bootstrap;
  }
  get signerId() {
    const bound = this.ownerSigner ?? this.bootstrap;
    if (bound) return bound.id;
    return "unbound";
  }
  /** The signing root every other authority artifact MUST share —
   *  capabilities sign with exactly this key. One root, no side keys. */
  currentRootSigner() {
    return this.rootSigner;
  }
  /** The OWNER act — an explicit re-grant. The ONLY path that lifts a
   *  revocation; mandateFor refuses revoked seats and never un-revokes. */
  regrant(node, ttlMs = 60 * 6e4) {
    if (this.root !== "owner") {
      return { ok: false, reason: "owner-required", detail: "only the bound owner root may re-grant a revoked seat" };
    }
    const profile = requestProfileOf(node);
    this.revoked.delete(profile.agentId);
    return this.mandateFor(node, ttlMs);
  }
  /** Revoke a seat — the roster's revocation flows through here, so the
   *  very next governed read fail-closes. Only an owner act (a fresh
   *  mandate) re-arms the seat. */
  revoke(agentId) {
    this.revoked.add(agentId);
  }
  isRevoked(agentId) {
    return this.revoked.has(agentId);
  }
  /** The seats under mandate — the IAM roster's source of truth. */
  enrolledAgents() {
    return [...this.issued.keys()];
  }
  enrolledMandateOf(agentId) {
    return this.issued.get(agentId)?.mandate ?? null;
  }
  /** The mandate for a node's CURRENT profile — issuing one if the profile
   *  is new or changed, re-verifying the cached one if it is not. Issuance
   *  here is the owner's standing act (the app owner IS the human principal
   *  for local seats); every issuance is returned with its signing key id so
   *  the caller can journal it. */
  mandateFor(node, ttlMs = 60 * 6e4) {
    const profile = requestProfileOf(node);
    const digest = profileDigest(profile);
    if (this.root === "bootstrap" && profileIsEffectful(profile)) {
      return { ok: false, reason: "bootstrap-effectful-mandate", detail: "bootstrap authority is read-only until the owner root is bound" };
    }
    if (this.revoked.has(profile.agentId)) {
      return { ok: false, reason: "revoked", detail: "this seat is revoked \u2014 authority stays off until the owner re-grants it" };
    }
    const cached = this.issued.get(profile.agentId);
    if (cached && cached.digest === digest) {
      const check = verifyMandate(cached.mandate, this.rootSigner);
      if (check.ok) return { ok: true, mandate: check.mandate, issued: false, signerId: this.rootSigner.id };
      if (check.reason === "expired") {
        const fresh2 = issueMandate(profile, this.rootSigner, ttlMs);
        this.issued.set(profile.agentId, { mandate: fresh2, digest });
        return { ok: true, mandate: fresh2, issued: true, signerId: this.rootSigner.id };
      }
      return { ok: false, reason: check.reason, detail: check.detail };
    }
    const fresh = issueMandate(profile, this.rootSigner, ttlMs);
    this.issued.set(profile.agentId, { mandate: fresh, digest });
    return { ok: true, mandate: fresh, issued: true, signerId: this.rootSigner.id };
  }
  /** The LIVE authority read — called before every governed step.
   *
   *  Returns the envelope ONLY if a mandate exists for this node, verifies
   *  against the owner key, is unexpired, AND was issued over the profile
   *  the node's configuration carries RIGHT NOW. Anything else returns null
   *  and the governed loop fail-closes; that null is what makes drift
   *  detection real instead of decorative. */
  read(node) {
    const profile = requestProfileOf(node);
    const cached = this.issued.get(profile.agentId);
    if (!cached) return null;
    if (this.revoked.has(profile.agentId)) return null;
    if (cached.digest !== profileDigest(profile)) return null;
    const check = verifyMandate(cached.mandate, this.rootSigner);
    if (!check.ok) return null;
    return envelopeFromMandate(check.mandate, this.rootSigner);
  }
  /** The verified mandate for a node, if one is live. */
  mandateOf(node) {
    const profile = requestProfileOf(node);
    const cached = this.issued.get(profile.agentId);
    if (!cached || this.revoked.has(profile.agentId) || cached.digest !== profileDigest(profile)) return null;
    const check = verifyMandate(cached.mandate, this.rootSigner);
    return check.ok ? check.mandate : null;
  }
  /** The front-door envelope — the Captain's own seat, judged by the same
   *  authority as every other seat. Conservative by construction: the front
   *  door steers anything risky and refuses anything critical on its own
   *  authority, exactly like the governed loop. */
  frontDoorEnvelope() {
    const claim = this.mandateFor({ id: FRONT_DOOR_AGENT, config: { owner: "owner" } }, FRONT_DOOR_TTL_MS);
    if (!claim.ok) return DENY_ALL_ENVELOPE;
    return envelopeFromMandate(claim.mandate, this.rootSigner) ?? DENY_ALL_ENVELOPE;
  }
};
var sovereign = new SovereignAuthority();

// src/security/capability.ts
var DEFAULT_CAPABILITY_TTL_MS = 10 * 6e4;
var registry = /* @__PURE__ */ new Map();
function invalidateCapabilitiesForRoot(rootKeyId) {
  let killed = 0;
  for (const entry of registry.values()) {
    if (entry.mintedRootKeyId === rootKeyId && !entry.invalidated) {
      entry.invalidated = true;
      killed += 1;
    }
  }
  return killed;
}

// src/engine/vault.ts
var VAULT_META_KEY = "vh.vault.meta.v1";
var enc = new TextEncoder();
var dec = new TextDecoder();
function storage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}
function readMeta() {
  const s = storage();
  if (!s) return null;
  try {
    const raw = JSON.parse(s.getItem(VAULT_META_KEY) ?? "null");
    return raw && raw.v === "si-vault-meta/1" ? raw : null;
  } catch {
    return null;
  }
}
function vaultKdfParams() {
  const meta = readMeta();
  return meta ? { saltB64: meta.saltB64, iterations: meta.iterations } : null;
}

// src/security/ownerRoot.ts
var OWNER_ROOT_SALT = "si.owner-root.v1";
var OWNER_ROOT_INFO = "ed25519 root seed";
function ed25519Pkcs8Prefix() {
  return Buffer.from("302e020100300506032b657004220420", "hex");
}
function deriveOwnerSigner(passphrase) {
  let material;
  const kdf = vaultKdfParams();
  if (kdf) {
    material = pbkdf2Sync(passphrase, Buffer.from(kdf.saltB64, "base64"), kdf.iterations, 32, "sha256");
  } else {
    material = Buffer.from(passphrase, "utf8");
  }
  const seed = Buffer.from(hkdfSync("sha256", material, OWNER_ROOT_SALT, OWNER_ROOT_INFO, 32));
  const privateKey = createPrivateKey({ key: Buffer.concat([ed25519Pkcs8Prefix(), seed]), format: "der", type: "pkcs8" });
  const publicKey = createPublicKey(privateKey);
  const pubDer = publicKey.export({ type: "spki", format: "der" });
  const id = createHash2("sha256").update(pubDer).digest("hex").slice(0, 16);
  return {
    id,
    sign: (data) => edSign2(null, Buffer.from(data, "utf8"), privateKey).toString("base64"),
    verify: (data, sig) => {
      try {
        return edVerify2(null, Buffer.from(data, "utf8"), publicKey, Buffer.from(sig, "base64"));
      } catch {
        return false;
      }
    }
  };
}
function bindOwnerRoot(passphrase) {
  try {
    const previous = sovereign.signerId;
    const signer = deriveOwnerSigner(passphrase);
    sovereign.bindOwnerSigner(signer);
    if (previous !== signer.id) invalidateCapabilitiesForRoot(previous);
    return { ok: true, signerId: signer.id };
  } catch (e) {
    return { ok: false, error: `the owner root could not be bound: ${e instanceof Error ? e.message : String(e)}` };
  }
}

// probe/preflight.test.ts
bindOwnerRoot("probe-owner-passphrase");
var passed = 0;
var failed = 0;
var failures = [];
function ok(label, cond, detail = "") {
  if (cond) {
    passed++;
    console.log(`  ok   ${label}`);
  } else {
    failed++;
    failures.push(`${label}${detail ? ` \u2014 ${detail}` : ""}`);
    console.log(`  FAIL ${label}${detail ? ` \u2014 ${detail}` : ""}`);
  }
}
var ROOT = ".".length > 0 ? "." : process.cwd();
var engine = fs.readFileSync(path.join(ROOT, "src", "selfimpulse", "engine", "selfimpulse.ts"), "utf8");
var helm = fs.readFileSync(path.join(ROOT, "src", "ui", "store.ts"), "utf8");
var gateCard = fs.readFileSync(path.join(ROOT, "src", "ui", "screens", "GateCard.tsx"), "utf8");
ok("simulateSelfImpulseAction exists (preflight prediction)", /simulateSelfImpulseAction/.test(engine), "no simulate");
ok("risky tools are routed through the human gate", /RISKY_TOOLS/.test(engine) && /requestSelfImpulseApproval/.test(engine), "no gate");
ok('the shell holds the pending gate and Work counts it ("Waiting on you")', /gate: PendingGate \| null/.test(helm) && fs.readFileSync(path.join(ROOT, "src", "ui", "screens", "Work.tsx"), "utf8").includes("Waiting on you"), "shell ignores the pending gate");
ok("every selfimpulseed receipt carries a simulation event when a risky tool ran", /selfimpulse\.simulation/.test(engine), "no simulation event");
ok("the real shell surfaces the gate (Approve / Refuse, both receipted)", /decideGate\(\{ approved: true \}\)/.test(gateCard) && /decideGate\(\{ approved: false, reason/.test(gateCard) && /decideGate:/.test(helm), "gate buttons missing");
console.log(`
${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log("\nfailures:");
  for (const f of failures) console.log(`  - ${f}`);
}
process.exit(failed > 0 ? 1 : 0);
