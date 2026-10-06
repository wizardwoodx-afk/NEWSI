import { createRequire as __mjCreateRequire } from "node:module"; const require = __mjCreateRequire(import.meta.url);
var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// src/security/actionGraph.ts
function stableStringify(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const entries = Object.entries(value).filter(([, v]) => v !== void 0).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
}
function riskAtLeast(actual, ceiling) {
  return RISK_ORDER[actual] >= RISK_ORDER[ceiling];
}
function riskOfAction(action) {
  const a = action.toLowerCase();
  if (/(rm|delete|drop\s+table|truncate|revoke|force.push|reset --hard|chmod 777|sudo)/.test(a)) return "critical";
  if (/(write|edit|patch|apply|commit|install|exec|run|shell|http|fetch|curl|npm|pip)/.test(a)) return "high";
  if (/(test|read|stat|ls|grep|search)/.test(a)) return "low";
  return "medium";
}
function authorize(env, action) {
  const a = action.toLowerCase();
  const risk = riskOfAction(action);
  if (!env || typeof env.root !== "string" || env.root.length === 0) {
    return { allowed: false, reason: "no authority envelope: a decision that cannot name its envelope is not made", action, risk, escalated: true };
  }
  if (risk === "critical") {
    return {
      allowed: false,
      reason: "critical-risk actions are never taken on the seat's own authority; they require a named human",
      action,
      risk,
      escalated: true
    };
  }
  if (/(write|edit|patch|apply|commit)/.test(a) && !env.allowWrite) {
    return { allowed: false, reason: "this seat is read-only: it may not change the workspace", action, risk, escalated: true };
  }
  if (/(exec|run|shell|npm|pip)/.test(a) && !env.allowShell) {
    return { allowed: false, reason: "shell execution is outside this seat's authority", action, risk, escalated: true };
  }
  if (/(http|fetch|curl|network)/.test(a) && !env.allowNetwork) {
    return { allowed: false, reason: "network egress is outside this seat's authority", action, risk, escalated: true };
  }
  if (riskAtLeast(risk, "high") && !riskAtLeast(env.maxRisk, "high")) {
    return {
      allowed: false,
      reason: `action is ${risk} risk but this seat's approved ceiling is ${env.maxRisk}`,
      action,
      risk,
      escalated: true
    };
  }
  return { allowed: true, reason: `within the approved envelope (ceiling ${env.maxRisk}, write=${env.allowWrite}, shell=${env.allowShell})`, action, risk };
}
var RISK_ORDER;
var init_actionGraph = __esm({
  "src/security/actionGraph.ts"() {
    "use strict";
    RISK_ORDER = { low: 0, medium: 1, high: 2, critical: 3 };
  }
});

// src/engine/authorityCore.ts
var mandateCanonical;
var init_authorityCore = __esm({
  "src/engine/authorityCore.ts"() {
    "use strict";
    mandateCanonical = (m) => JSON.stringify({
      v: "vh.mandate.v1",
      agentId: m.agentId,
      owner: m.owner,
      scope: [...m.scope].sort(),
      budgetCap: m.budgetCap,
      maxDepth: m.maxDepth,
      issuedAt: m.issuedAt,
      expiresAt: m.expiresAt
    });
  }
});

// src/security/sovereign.ts
import { createHash, generateKeyPairSync, sign as edSign, verify as edVerify } from "node:crypto";
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
function canonicalScopeOf(env) {
  const scope = [];
  if (env.allowWrite) scope.push("fs.write");
  if (env.allowShell) scope.push("shell.exec");
  if (env.allowNetwork) scope.push("net.fetch");
  scope.push(`risk:${env.maxRisk}`);
  return scope.sort();
}
function toCanonicalMandate(m, signer) {
  const base = {
    agentId: m.agentId,
    owner: m.owner,
    scope: canonicalScopeOf(m.env),
    budgetCap: m.env.budgetCeiling,
    maxDepth: 0,
    // local seats attenuate only — never re-delegate
    issuedAt: m.issuedAt,
    expiresAt: m.expiresAt
  };
  return { ...base, signature: `ed25519:${signer.sign(mandateCanonical(base))}` };
}
function verifyCanonicalMandate(c, signer) {
  if (!c.signature || typeof c.signature !== "string") return false;
  const raw = c.signature.startsWith("ed25519:") ? c.signature.slice("ed25519:".length) : c.signature;
  const { signature, ...base } = c;
  return signer.verify(mandateCanonical(base), raw);
}
var MANDATE_FORMAT, FRONT_DOOR_AGENT, FRONT_DOOR_TTL_MS, DENY_ALL_ENVELOPE, SovereignAuthority, sovereign;
var init_sovereign = __esm({
  "src/security/sovereign.ts"() {
    "use strict";
    init_actionGraph();
    init_authorityCore();
    MANDATE_FORMAT = "si.mandate.v1";
    FRONT_DOOR_AGENT = "si.front-door.captain";
    FRONT_DOOR_TTL_MS = 60 * 6e4;
    DENY_ALL_ENVELOPE = {
      allowWrite: false,
      allowShell: false,
      allowNetwork: false,
      root: workingRoot(),
      budgetCeiling: 0,
      maxRisk: "low"
    };
    SovereignAuthority = class {
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
    sovereign = new SovereignAuthority();
  }
});

// src/selfimpulse/engine/policyGateway.ts
var policyGateway_exports = {};
__export(policyGateway_exports, {
  _resetPolicyRulesForProbe: () => _resetPolicyRulesForProbe,
  propose: () => propose,
  registerPolicyRule: () => registerPolicyRule,
  riskyTools: () => riskyTools,
  sealPolicyRegistry: () => sealPolicyRegistry
});
function registerPolicyRule(rule) {
  if (policySealed) {
    throw new Error("the policy registry is sealed \u2014 rules are registered at trusted startup only, never by loaded code");
  }
  RULES.push(rule);
}
function sealPolicyRegistry() {
  policySealed = true;
}
function _resetPolicyRulesForProbe() {
  if (policySealed) {
    throw new Error("the policy registry is sealed \u2014 no path mutates rules after trusted startup, test helpers included");
  }
  RULES.length = 0;
  RULES.push(riskyToolRule, sovereignRule, workspaceRootRule, budgetRule);
}
function propose(input) {
  for (const rule of RULES) {
    const r = rule(input);
    if (r) {
      return { ...r, audit: { kind: "policy", decision: r.decision, rule: r.rule, reason: r.reason, tool: input.tool, ts: (/* @__PURE__ */ new Date()).toISOString() } };
    }
  }
  return { ...SOVEREIGN_ALLOW, audit: { kind: "policy", decision: "allow", rule: SOVEREIGN_ALLOW.rule, reason: SOVEREIGN_ALLOW.reason, tool: input.tool, ts: (/* @__PURE__ */ new Date()).toISOString() } };
}
var riskyTools, riskyToolRule, sovereignRule, budgetRule, workspaceRootRule, RULES, SOVEREIGN_ALLOW, policySealed;
var init_policyGateway = __esm({
  "src/selfimpulse/engine/policyGateway.ts"() {
    "use strict";
    init_actionGraph();
    init_sovereign();
    riskyTools = /* @__PURE__ */ new Set(["workspace_write", "dispatch_mission", "shell_exec"]);
    riskyToolRule = (input) => {
      if (!riskyTools.has(input.tool)) return null;
      return {
        decision: "steer",
        rule: "risky-tool-requires-approval",
        reason: `"${input.tool}" is a governed action \u2014 human approval required before execution.`
      };
    };
    sovereignRule = (input) => {
      const env = sovereign.frontDoorEnvelope();
      const verdict = authorize(env, input.tool);
      if (verdict.allowed) return null;
      if (verdict.risk === "critical") {
        return {
          decision: "deny",
          rule: "sovereign-critical-refuses",
          reason: verdict.reason
        };
      }
      return {
        decision: "steer",
        rule: "sovereign-envelope",
        reason: `${verdict.reason} \u2014 the human decides.`
      };
    };
    budgetRule = (_input) => null;
    workspaceRootRule = (_input) => null;
    RULES = [riskyToolRule, sovereignRule, workspaceRootRule, budgetRule];
    SOVEREIGN_ALLOW = {
      decision: "allow",
      rule: "sovereign-safe-class",
      reason: "within the front-door envelope \u2014 low-risk action on the owner's own authority"
    };
    policySealed = false;
  }
});

// probe/canonicalAuthority.test.ts
init_sovereign();
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";

// src/security/ownerRoot.ts
init_sovereign();
import { createHash as createHash3, createPrivateKey, createPublicKey, hkdfSync, pbkdf2Sync, sign as edSign2, verify as edVerify2 } from "node:crypto";

// src/security/capability.ts
init_actionGraph();
init_sovereign();
import { createHash as createHash2 } from "node:crypto";
var CAPABILITY_FORMAT = "si.capability.v1";
var DEFAULT_CAPABILITY_TTL_MS = 10 * 6e4;
var registry = /* @__PURE__ */ new Map();
var byApproval = /* @__PURE__ */ new Map();
function theSigner() {
  return sovereign.currentRootSigner();
}
var capabilityDigest = (base) => createHash2("sha256").update(stableStringify(base)).digest("hex");
var baseOf = (c) => ({
  v: c.v,
  subject: c.subject,
  audience: c.audience,
  action: c.action,
  resource: c.resource,
  missionId: c.missionId,
  budget: c.budget,
  issuedAt: c.issuedAt,
  expiresAt: c.expiresAt,
  delegationDepth: c.delegationDepth,
  approvalId: c.approvalId
});
function mintCapability(input) {
  const ttl = input.ttlMs ?? DEFAULT_CAPABILITY_TTL_MS;
  if (!Number.isFinite(ttl) || ttl <= 0) throw new Error(`capability ttl must be a positive number of ms \u2014 got ${input.ttlMs}`);
  const issuedAt = Date.now();
  const base = {
    v: CAPABILITY_FORMAT,
    subject: input.subject,
    audience: input.audience,
    action: input.action,
    resource: input.resource,
    missionId: input.missionId ?? null,
    budget: input.budget ?? 0,
    issuedAt,
    expiresAt: issuedAt + ttl,
    delegationDepth: 0,
    approvalId: input.approvalId
  };
  if (sovereign.root !== "owner" && actionIsEffectful(input.action)) {
    throw new Error(`refused: the authority root is still bootstrap \u2014 before the owner's key is bound, no effectful capability may be minted (${input.action})`);
  }
  const capability = { ...base, signature: theSigner().sign(stableStringify(base)) };
  const digest = capabilityDigest(base);
  registry.set(digest, { base, mintedRootKeyId: theSigner().id, redeemed: null, invalidated: false });
  const seen = byApproval.get(input.approvalId) ?? [];
  seen.push(digest);
  byApproval.set(input.approvalId, seen);
  return { capability, digest };
}
function verifyCapability(c, audience) {
  if (!c || typeof c !== "object" || !c.signature || c.v !== CAPABILITY_FORMAT) {
    return { ok: false, reason: "missing", detail: "not a capability" };
  }
  if (c.delegationDepth !== 0) {
    return { ok: false, reason: "depth", detail: `delegation depth ${c.delegationDepth} \u2014 capabilities never re-delegate` };
  }
  const base = baseOf(c);
  if (!theSigner().verify(stableStringify(base), c.signature)) {
    return { ok: false, reason: "bad-signature", detail: "the capability does not verify against the issuing key \u2014 forged or edited" };
  }
  const minted = registry.get(capabilityDigest(base));
  if (minted?.invalidated) {
    return { ok: false, reason: "invalidated", detail: "the root that minted this capability was locked out or replaced \u2014 a lock kills outstanding capabilities" };
  }
  if (Date.now() > c.expiresAt) {
    return { ok: false, reason: "expired", detail: `expired ${new Date(c.expiresAt).toISOString()} \u2014 an approval is not a standing power` };
  }
  if (c.audience !== audience) {
    return { ok: false, reason: "wrong-audience", detail: `minted for ${c.audience}, presented to ${audience}` };
  }
  return { ok: true, capability: c };
}
function redeemCapability(c, audience) {
  const v = verifyCapability(c, audience);
  if (!v.ok) return v;
  const digest = capabilityDigest(baseOf(c));
  const entry = registry.get(digest);
  if (entry?.redeemed) {
    return { ok: false, reason: "already-redeemed", detail: `redeemed by ${entry.redeemed.by} at ${new Date(entry.redeemed.at).toISOString()} \u2014 one approval, one use` };
  }
  if (entry) entry.redeemed = { by: audience, at: Date.now() };
  return v;
}
function redemptionOf(c) {
  return registry.get(capabilityDigest(baseOf(c)))?.redeemed ?? null;
}
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
var READ_ONLY_OPERATIONS = /* @__PURE__ */ new Set([
  "read",
  "list",
  "get",
  "status",
  "search",
  "describe",
  "poll",
  "simulate",
  "call_status",
  "export",
  "help"
]);
var registrySealed = false;
function registerReadOnlyOperation(name) {
  if (registrySealed) {
    throw new Error("the read-only registry is sealed \u2014 operations are registered at trusted startup only, never by loaded code");
  }
  READ_ONLY_OPERATIONS.add(String(name).trim().toLowerCase());
}
function sealReadOnlyRegistry() {
  registrySealed = true;
}
function actionIsEffectful(action) {
  return !READ_ONLY_OPERATIONS.has(String(action).trim().toLowerCase());
}
function _resetCapabilitiesForProbe() {
  registry.clear();
  byApproval.clear();
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
  const id = createHash3("sha256").update(pubDer).digest("hex").slice(0, 16);
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
function lockOwnerRoot() {
  const departing = sovereign.signerId;
  sovereign.unbindOwnerSigner();
  invalidateCapabilitiesForRoot(departing);
}

// probe/canonicalAuthority.test.ts
init_actionGraph();
var ROOT = ".".length > 0 ? "." : process.cwd();
var pass = 0;
var fail = 0;
function ok(label, cond, detail = "") {
  if (cond) {
    pass += 1;
    console.log(`  ok   ${label}`);
  } else {
    fail += 1;
    console.log(`  FAIL ${label}${detail ? ` \u2014 ${detail}` : ""}`);
  }
}
function section(name) {
  console.log(`
== ${name}`);
}
var seat = (config, id = "seat.canon.1") => ({ id, title: id, config });
section("1. one mandate format \u2014 vh.mandate.v1 everywhere");
{
  const signer = sessionSigner();
  const authority = new SovereignAuthority(signer);
  authority.bindOwnerSigner(signer);
  const node = seat({ allowWrite: true, allowNetwork: true, maxRisk: "medium", workspaceRoot: "/tmp/w" });
  const claim = authority.mandateFor(node);
  assert.ok(claim.ok);
  const canon = toCanonicalMandate(claim.mandate, signer);
  ok("the canonical mandate verifies against the SAME key", verifyCanonicalMandate(canon, signer) === true);
  ok("it carries the canonical agent/owner identity", canon.agentId === "seat.canon.1" && canon.owner === "owner");
  ok(
    "scope is derived mechanically from the envelope \u2014 write and network, no shell",
    JSON.stringify(canon.scope) === JSON.stringify(["fs.write", "net.fetch", "risk:medium"]),
    canon.scope.join(",")
  );
  ok("a local seat's mandate is depth-zero \u2014 attenuation only, never re-delegation", canon.maxDepth === 0);
  ok("the budget cap travels as the envelope carried it", canon.budgetCap === 0);
  ok(
    "canonicalScopeOf is monotone: more envelope, more scope",
    canonicalScopeOf({ ...claim.mandate.env, allowShell: true }).includes("shell.exec")
  );
  const foreign = sessionSigner();
  ok("a foreign key cannot verify the mandate \u2014 one root per issuance", verifyCanonicalMandate(canon, foreign) === false);
}
section("2. one root \u2014 the owner's key, bindable");
{
  const authority = new SovereignAuthority();
  ok('before binding, the root is honestly "bootstrap"', authority.root === "bootstrap");
  const owner = sessionSigner();
  authority.bindOwnerSigner(owner);
  ok('after binding, the root is "owner"', authority.root === "owner");
  const claim = authority.mandateFor(seat({ allowWrite: true, workspaceRoot: "/tmp/w" }), 6e4);
  assert.ok(claim.ok);
  ok("the mandate was signed by the OWNER's key id", claim.signerId === owner.id);
  const canon = toCanonicalMandate(claim.mandate, owner);
  ok("\u2026and the canonical form verifies against the owner key", verifyCanonicalMandate(canon, owner) === true);
  ok(
    "the bootstrap key cannot verify it \u2014 no dual-root ambiguity",
    verifyCanonicalMandate(canon, sessionSigner()) === false
  );
}
section("2b. the LIVE bind \u2014 the runtime derives the owner root, not a probe");
{
  ok('before the bind, the global sovereign honestly says "bootstrap"', sovereign.root === "bootstrap");
  const live = bindOwnerRoot("the owner's vault passphrase");
  ok("the live runtime binds the owner root from the vault passphrase", live.ok === true && sovereign.root === "owner");
  ok(
    "the derivation is deterministic \u2014 same passphrase, same owner key across sessions",
    deriveOwnerSigner("the owner's vault passphrase").id === deriveOwnerSigner("the owner's vault passphrase").id
  );
  ok(
    "a different passphrase derives a different root \u2014 no guessing at authority",
    deriveOwnerSigner("another passphrase").id !== deriveOwnerSigner("the owner's vault passphrase").id
  );
  const claim = sovereign.mandateFor(seat({ allowWrite: true, workspaceRoot: "/tmp/w" }, "seat.live.1"), 6e4);
  assert.ok(claim.ok);
  ok(
    "after the bind, live issuance carries the OWNER key id",
    claim.signerId === deriveOwnerSigner("the owner's vault passphrase").id
  );
  const ownerCap = mintCapability({ approvalId: "lock-1", subject: "s", audience: "si.runtime", action: "workspace_write", resource: "report.md", ttlMs: 6e4 });
  lockOwnerRoot();
  ok("LOCK unbinds the owner root \u2014 back to the honest bootstrap label", sovereign.root === "bootstrap");
  ok(
    "owner-signed capabilities stop verifying once the key is gone \u2014 a key that is gone cannot vouch",
    verifyCapability(ownerCap.capability, "si.runtime").ok === false
  );
  const seatLive = seat({ allowWrite: true, workspaceRoot: "/tmp/w" }, "seat.live.1");
  ok("the owner's mandates stop reading too \u2014 seats fail-closed while locked", sovereign.read(seatLive) === null);
  const rebind = bindOwnerRoot("the owner's vault passphrase");
  ok("UNLOCK re-binds the same owner key (the derivation is stable per vault)", rebind.ok === true && sovereign.root === "owner");
  ok(
    "\u2026and the owner's mandates verify and read again \u2014 nothing was lost, nothing was forged",
    sovereign.read(seatLive) !== null
  );
  const after = verifyCapability(ownerCap.capability, "si.runtime");
  ok(
    "capabilities minted before the lock stay DEAD after the same key returns \u2014 a lock kills outstanding capabilities",
    after.ok === false && after.reason === "invalidated"
  );
}
section("3. revocation is sticky \u2014 only an explicit owner regrant lifts it");
{
  const authority = new SovereignAuthority();
  const owner = sessionSigner();
  authority.bindOwnerSigner(owner);
  const node = seat({ allowWrite: true, workspaceRoot: "/tmp/w" }, "seat.revoke.1");
  assert.ok(authority.mandateFor(node).ok);
  ok("live before revocation", authority.read(node) !== null);
  authority.revoke("seat.revoke.1");
  ok("read returns NOTHING after revocation \u2014 fail-closed at the next governed step", authority.read(node) === null);
  ok("the roster seam reports the revocation", authority.isRevoked("seat.revoke.1") === true);
  const runtimeTry = authority.mandateFor(node);
  ok(
    "the runtime path (mandateFor) REFUSES a revoked seat \u2014 it can never un-revoke",
    runtimeTry.ok === false && runtimeTry.reason === "revoked"
  );
  ok("still revoked after the runtime tried", authority.read(node) === null && authority.isRevoked("seat.revoke.1") === true);
  const back = authority.regrant(node);
  ok("an explicit OWNER regrant is the only way back", back.ok === true && authority.read(node) !== null && authority.isRevoked("seat.revoke.1") === false);
}
section("4. the capability \u2014 an approval made portable");
{
  _resetCapabilitiesForProbe();
  const minted = mintCapability({
    approvalId: "appr-1",
    subject: "si.captain",
    audience: "si.runtime",
    action: "workspace_write",
    resource: "report.md",
    budget: 0,
    ttlMs: 6e4
  });
  ok("minting returns a signed capability and its digest", minted.capability.signature !== null && minted.digest.length === 64);
  const c = minted.capability;
  ok("audience match verifies", verifyCapability(c, "si.runtime").ok === true);
  const wrongAud = verifyCapability(c, "some.other.plane");
  ok("a wrong audience is refused BY NAME", wrongAud.ok === false && wrongAud.reason === "wrong-audience");
  ok("depth is zero by construction", c.delegationDepth === 0);
  const first = redeemCapability(c, "si.runtime");
  ok("the first redemption succeeds", first.ok === true);
  const replay = redeemCapability(c, "si.runtime");
  ok("a replayed redemption is refused \u2014 one approval, one use", replay.ok === false && replay.reason === "already-redeemed");
  ok("the redemption is attributable", redemptionOf(c)?.by === "si.runtime");
  const rootKey = sovereign.currentRootSigner();
  const base = {
    v: c.v,
    subject: c.subject,
    audience: c.audience,
    action: c.action,
    resource: c.resource,
    missionId: c.missionId,
    budget: c.budget,
    issuedAt: c.issuedAt,
    expiresAt: c.expiresAt,
    delegationDepth: c.delegationDepth,
    approvalId: c.approvalId
  };
  ok(
    "the SOVEREIGN'S root key verifies the capability signature \u2014 one root signs mandates and capabilities",
    rootKey.verify(stableStringify(base), c.signature)
  );
  const tampered = { ...c, action: "shell_exec" };
  const t = verifyCapability(tampered, "si.runtime");
  ok("a tampered capability refuses as forged", t.ok === false && t.reason === "bad-signature");
  const shortLived = mintCapability({ approvalId: "appr-2", subject: "s", audience: "a", action: "x", resource: "y", ttlMs: 1 });
  const spin = Date.now();
  while (Date.now() - spin < 5) {
  }
  const e = verifyCapability(shortLived.capability, "a");
  ok("an expired capability refuses \u2014 an approval is not a standing power", e.ok === false && e.reason === "expired");
}
section("4b. the bootstrap window \u2014 read-only yes, effectful no");
{
  _resetCapabilitiesForProbe();
  lockOwnerRoot();
  const readOnly = mintCapability({ approvalId: "boot-1", subject: "s", audience: "si.runtime", action: "read", resource: "notes.md", ttlMs: 6e4 });
  ok(
    "under bootstrap, an exactly-registered READ-ONLY operation still mints \u2014 the window is useful, not powerful",
    readOnly.capability.signature !== null
  );
  let unregistered = "";
  try {
    mintCapability({ approvalId: "boot-1b", subject: "s", audience: "si.runtime", action: "read.workspace", resource: "notes.md", ttlMs: 6e4 });
  } catch (e) {
    unregistered = e instanceof Error ? e.message : String(e);
  }
  ok(
    "a dotted sub-action is effectful until its plane registers it BY NAME",
    /bootstrap/.test(unregistered)
  );
  registerReadOnlyOperation("read.workspace");
  ok(
    "\u2026and after registration it mints \u2014 explicit, not inferred",
    mintCapability({ approvalId: "boot-1c", subject: "s", audience: "si.runtime", action: "read.workspace", resource: "notes.md", ttlMs: 6e4 }).capability.signature !== null
  );
  for (const trap of ["read_delete", "list_and_delete", "get_shell"]) {
    let msg = "";
    try {
      mintCapability({ approvalId: `trap-${trap}`, subject: "s", audience: "si.runtime", action: trap, resource: "x", ttlMs: 6e4 });
    } catch (e) {
      msg = e instanceof Error ? e.message : String(e);
    }
    ok(`prefix tricks stay effectful: ${trap}`, /bootstrap/.test(msg), msg.slice(0, 60));
  }
  let refused = "";
  try {
    mintCapability({ approvalId: "boot-2", subject: "s", audience: "si.runtime", action: "workspace_write", resource: "x", ttlMs: 6e4 });
  } catch (e) {
    refused = e instanceof Error ? e.message : String(e);
  }
  ok(
    "under bootstrap, an EFFECTFUL capability REFUSES \u2014 no owner proof, no effect",
    /bootstrap/.test(refused) && /no effectful capability/.test(refused)
  );
  let refusedShell = "";
  try {
    mintCapability({ approvalId: "boot-3", subject: "s", audience: "si.runtime", action: "authority.issue", resource: "scope", ttlMs: 6e4 });
  } catch (e) {
    refusedShell = e instanceof Error ? e.message : String(e);
  }
  ok("unknown actions default to effectful \u2014 the honest default is refusal, not hope", /bootstrap/.test(refusedShell));
  bindOwnerRoot("the owner's vault passphrase");
  ok(
    "under the OWNER root, the same effectful capability mints freely",
    mintCapability({ approvalId: "own-1", subject: "s", audience: "si.runtime", action: "workspace_write", resource: "x", ttlMs: 6e4 }).capability.signature !== null
  );
}
section("4c. the issuance throat \u2014 bootstrap mandates are read-only, regrant is owner-only");
{
  lockOwnerRoot();
  const authority = new SovereignAuthority();
  const writer = seat({ allowWrite: true, workspaceRoot: "/tmp/w" }, "seat.window.1");
  const denied = authority.mandateFor(writer);
  ok(
    "BOOTSTRAP + EFFECTFUL PROFILE \u2192 DENIED, by name, at mandateFor",
    denied.ok === false && denied.reason === "bootstrap-effectful-mandate" && /read-only until the owner/.test(denied.detail),
    JSON.stringify(denied)
  );
  ok("the denied seat reads as NO authority \u2014 there is nothing to read", authority.read(writer) === null);
  const reader = seat({}, "seat.window.2");
  const allowed = authority.mandateFor(reader);
  ok("BOOTSTRAP + READ-ONLY PROFILE \u2192 still issued (the window stays useful)", allowed.ok === true);
  ok("the read-only mandate really is read-only", allowed.ok === true && allowed.mandate.env.allowWrite === false && allowed.mandate.env.allowNetwork === false);
  ok(
    "BOOTSTRAP + REGRANT \u2192 DENIED, by name \u2014 no owner, no regrant",
    authority.regrant(writer).ok === false && authority.regrant(writer).reason === "owner-required"
  );
  const owner = sessionSigner();
  authority.bindOwnerSigner(owner);
  const afterBind = authority.mandateFor(writer);
  ok("OWNER BOUND + the same effectful profile \u2192 issued", afterBind.ok === true && afterBind.signerId === owner.id);
  authority.revoke("seat.window.1");
  ok("owner regrant lifts the revocation (the ONLY path that can)", authority.regrant(writer).ok === true && authority.isRevoked("seat.window.1") === false);
  bindOwnerRoot("probe-owner-passphrase");
}
section("5. the seams are wired \u2014 runtime, not exports");
{
  const gate = fs.readFileSync(path.join(ROOT, "src", "selfimpulse", "engine", "selfimpulse.ts"), "utf8");
  ok(
    "the human gate MINTS, VERIFIES, then grants \u2014 never true on faith",
    /mintCapability\(/.test(gate) && /verifyCapability\(/.test(gate) && /capability: capabilityDigest/.test(gate) && /capability-unavailable/.test(gate)
  );
  ok("the execution plane REDEEMS the capability before any effect", /redeemCapability\(/.test(gate));
  ok("the gate's grant IS the capability, not a boolean", /SelfImpulseGate/.test(gate) && /capability: ScopedCapability \| null/.test(gate));
  ok("the approval record CARRIES the capability digest", /capability\?: string/.test(gate));
  const executor = fs.readFileSync(path.join(ROOT, "src", "mission", "teamExecutor.ts"), "utf8");
  ok("seat settlement FEEDS the FinOps ledger", /finopsRecordSeatRun\(/.test(executor) && /engine\/finops/.test(executor));
  ok("the ledger records USD-unknown honestly, never a guess", /usd: r\.usage\?\.costUsd \?\? null/.test(executor));
  const sovereignSrc = fs.readFileSync(path.join(ROOT, "src", "security", "sovereign.ts"), "utf8");
  ok("the canonical bridge speaks vh.mandate.v1", /authorityCore/.test(sovereignSrc) && /coreMandateCanonical/.test(sovereignSrc));
  ok("revocation is sticky: only regrant clears it", /regrant\(/.test(sovereignSrc) && /reason: "revoked"/.test(sovereignSrc));
  const capSrc = fs.readFileSync(path.join(ROOT, "src", "security", "capability.ts"), "utf8");
  ok(
    "no independent capability signer exists \u2014 one root signs everything",
    !/setCapabilitySigner/.test(capSrc) && /currentRootSigner\(\)/.test(capSrc)
  );
  const ownerRootSrc = fs.readFileSync(path.join(ROOT, "src", "security", "ownerRoot.ts"), "utf8");
  ok(
    "the owner root rides the VAULT'S hardened KDF (PBKDF2 with the vault salt), then domain separation",
    /pbkdf2Sync/.test(ownerRootSrc) && /hkdfSync/.test(ownerRootSrc) && /vaultKdfParams/.test(ownerRootSrc)
  );
  ok(
    "the owner root is bound on unlock AND invalidated on lock",
    /bindOwnerSigner\(/.test(ownerRootSrc) && /unbindOwnerSigner\(\)/.test(ownerRootSrc) && /invalidateCapabilitiesForRoot/.test(ownerRootSrc)
  );
  const vaultSrc = fs.readFileSync(path.join(ROOT, "src", "engine", "vault.ts"), "utf8");
  ok("the vault exposes its KDF params so the owner key inherits the same hardening", /vaultKdfParams/.test(vaultSrc));
  ok(
    "the KDF docs state measured choice, not borrowed guidance \u2014 and vaults calibrate and upgrade",
    !/OWASP 2023/.test(vaultSrc) && /calibratedIterations/.test(vaultSrc) && /upgradeVaultCost/.test(vaultSrc) && /existing\.iterations/.test(vaultSrc)
  );
  const storeSrc = fs.readFileSync(path.join(ROOT, "src", "ui", "store.ts"), "utf8");
  ok(
    "the shipped UI binds the owner root on vault unlock/create and UNBINDS it on lock",
    (storeSrc.match(/bindOwnerRoot\(/g) ?? []).length >= 2 && /lockOwnerRoot/.test(storeSrc)
  );
  ok(
    "the lock is ATOMIC and fail-safe ordered: unbind FIRST, then seal \u2014 one synchronous task, no dynamic import",
    !/import\("[^"]*ownerRoot"\)/.test(storeSrc) && storeSrc.indexOf("lockOwnerRoot();") !== -1 && storeSrc.indexOf("lockOwnerRoot();") < storeSrc.indexOf("lockVault();")
  );
  const capSrc2 = fs.readFileSync(path.join(ROOT, "src", "security", "capability.ts"), "utf8");
  ok(
    "capability minting refuses effectful actions under bootstrap \u2014 in the mint itself, one throat",
    /actionIsEffectful/.test(capSrc2) && /no effectful capability may be minted/.test(capSrc2)
  );
  ok(
    "the read-only registry is EXACT \u2014 no prefix inference anywhere in it",
    /READ_ONLY_OPERATIONS/.test(capSrc2) && !/startsWith\(/.test(capSrc2)
  );
  ok(
    "the registry SEALS at trusted startup \u2014 loaded code can never redefine read-only",
    /sealReadOnlyRegistry/.test(capSrc2) && /registry is sealed/.test(capSrc2)
  );
  {
    let sealedRefused = "";
    sealReadOnlyRegistry();
    try {
      registerReadOnlyOperation("delete_database");
    } catch (e) {
      sealedRefused = e instanceof Error ? e.message : String(e);
    }
    ok(
      "a sealed registry refuses the delete_database registration \u2014 workers cannot redefine semantics",
      /sealed/.test(sealedRefused),
      sealedRefused.slice(0, 80)
    );
  }
  {
    const mcp = fs.readFileSync(path.join(ROOT, "src", "selfimpulse", "engine", "mcpRouter.ts"), "utf8");
    const host = fs.readFileSync(path.join(ROOT, "tools", "si-host.entry.ts"), "utf8");
    ok(
      "trusted startup seals the registry in both engine entries",
      /sealReadOnlyRegistry\(\)/.test(mcp) && /sealReadOnlyRegistry\(\)/.test(host)
    );
  }
  {
    const pg = await Promise.resolve().then(() => (init_policyGateway(), policyGateway_exports));
    pg.sealPolicyRegistry();
    let refused = "";
    try {
      pg.registerPolicyRule(() => ({ decision: "allow", rule: "hijack", reason: "loaded code expanding authority" }));
    } catch (e) {
      refused = e instanceof Error ? e.message : String(e);
    }
    ok(
      "a SEALED policy registry refuses new rules \u2014 workers cannot alter policy semantics",
      /policy registry is sealed/.test(refused),
      refused.slice(0, 80)
    );
    const verdict = pg.propose({ tool: "calculator", args: { expression: "6*7" }, workspaceRoot: "/tmp/w" });
    ok(
      "the built-in rules still evaluate \u2014 sealing freezes semantics, never breaks them",
      verdict.decision === "allow" && verdict.rule === "sovereign-safe-class"
    );
    const mcp = fs.readFileSync(path.join(ROOT, "src", "selfimpulse", "engine", "mcpRouter.ts"), "utf8");
    const host = fs.readFileSync(path.join(ROOT, "tools", "si-host.entry.ts"), "utf8");
    ok(
      "trusted startup seals the POLICY registry in both engine entries too",
      /sealPolicyRegistry\(\)/.test(mcp) && /sealPolicyRegistry\(\)/.test(host)
    );
    let resetRefused = "";
    try {
      pg._resetPolicyRulesForProbe();
    } catch (e) {
      resetRefused = e instanceof Error ? e.message : String(e);
    }
    ok(
      "even the probe-reset seam refuses after the seal \u2014 no path mutates rules, helpers included",
      /no path mutates rules/.test(resetRefused),
      resetRefused.slice(0, 80)
    );
  }
  const iamSrc = fs.readFileSync(path.join(ROOT, "src", "engine", "iamLedger.ts"), "utf8");
  ok("enrollment is an explicit owner regrant through the sovereign", /sovereign\.regrant\(/.test(iamSrc));
}
console.log(`
canonicalAuthority: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
