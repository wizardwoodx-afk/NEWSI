import { createRequire as __mjCreateRequire } from "node:module"; const require = __mjCreateRequire(import.meta.url);

// probe/earnedAuthority.test.ts
import * as fs from "node:fs";
import * as path from "node:path";

// src/security/authority.ts
var NO_EVIDENCE = { completedRuns: 0, trippedRuns: 0, independentlyVerifiedRuns: 0 };
function earnAuthority(evidence, ceiling, opts) {
  const need = opts?.threshold ?? 3;
  const streak = cleanStreakOf(evidence);
  const clean2 = streak.clean;
  const verified = streak.verified;
  const qualifies = streak.sound && clean2 >= need && verified >= need;
  const reasons = {};
  const earned = [];
  const earnable = ["read", "write", "shell", "network", "delegate"];
  if (qualifies) {
    for (const c of earnable) {
      if (!hasCapability(ceiling, c)) continue;
      earned.push(c);
      reasons[c] = `earned: ${verified} independently verified runs in the current clean streak (${clean2} clean) - ${streak.reason}`;
    }
  } else {
    for (const c of earnable) {
      if (!hasCapability(ceiling, c)) continue;
      reasons[c] = streak.sound ? `not yet: ${verified}/${need} independently verified runs in the current clean streak (${clean2} clean)` : `not earned: ${streak.reason}`;
    }
  }
  const budgetCents = qualifies ? Math.floor(ceiling.budgetCents / 2) : 0;
  if (budgetCents > 0) reasons.spend = `earned: ${verified} independently verified runs in the current clean streak`;
  if (!hasCapability(ceiling, "spend")) reasons.spend = "not in the ceiling";
  return { capabilities: earned, budgetCents, reasons };
}
function grantFromEarned(e, ceiling) {
  const g2 = {
    capabilities: e.capabilities.filter((c) => hasCapability(ceiling, c)),
    budgetCents: Math.min(e.budgetCents, ceiling.budgetCents)
  };
  return narrowTo(g2, ceiling);
}
var ALL_CAPABILITIES = [
  "read",
  "write",
  "shell",
  "network",
  "delegate",
  "spend"
];
var NO_GRANT = { capabilities: [], budgetCents: 0 };
function hasCapability(g2, c) {
  return g2.capabilities.includes(c);
}
function grantsEqual(a, b) {
  return a.capabilities.length === b.capabilities.length && a.budgetCents === b.budgetCents && a.capabilities.every((c) => b.capabilities.includes(c));
}
function narrowTo(a, b) {
  return {
    capabilities: a.capabilities.filter((c) => b.capabilities.includes(c)),
    budgetCents: Math.min(a.budgetCents, b.budgetCents)
  };
}
function isNarrower(child, parent) {
  const extra = child.capabilities.filter((c) => !parent.capabilities.includes(c));
  return extra.length === 0 && child.budgetCents <= parent.budgetCents;
}
function cleanStreakOf(evidence) {
  const { lastTripAtRun, cleanStreakRuns, cleanStreakVerified } = evidence;
  if (typeof cleanStreakRuns === "number" && cleanStreakRuns > evidence.completedRuns) {
    return {
      clean: 0,
      verified: 0,
      sound: false,
      reason: `the reported clean streak (${cleanStreakRuns} runs) is longer than the ${evidence.completedRuns} runs that exist, so the record cannot be trusted`
    };
  }
  if (typeof cleanStreakRuns === "number") {
    const clean2 = Math.max(0, cleanStreakRuns);
    return {
      clean: clean2,
      // No verified count means no verified runs. It does not mean "assume the
      // whole streak was checked by someone else".
      verified: Math.max(0, cleanStreakVerified ?? 0),
      sound: true,
      reason: typeof lastTripAtRun === "number" && lastTripAtRun > 0 ? `run ${lastTripAtRun} tripped; only the ${clean2} run(s) after it count` : "no trip has ever been recorded, and the executor reports the streak it has measured"
    };
  }
  if (evidence.trippedRuns <= 0) {
    return {
      clean: Math.max(0, evidence.completedRuns),
      verified: Math.max(0, evidence.independentlyVerifiedRuns),
      sound: true,
      reason: "no trip has ever been recorded, so the whole history is one clean streak"
    };
  }
  return {
    clean: 0,
    verified: 0,
    sound: false,
    reason: `${evidence.trippedRuns} trip(s) are recorded with no position, so a clean streak cannot be shown \u2014 a lifetime total is not a reset`
  };
}
function evaluateChain(root, hops) {
  if (root.ceiling.capabilities.length === 0 && root.ceiling.budgetCents === 0 && !root.human) {
    return { ok: false, reason: "the root principal has no ceiling; an authority-free root cannot delegate" };
  }
  let effective = { ...root.ceiling };
  for (let i = 0; i < hops.length; i += 1) {
    const hop = hops[i];
    if (!isNarrower(hop.grant, effective)) {
      return {
        ok: false,
        reason: `hop ${i} (${hop.principalId}) holds authority the chain did not grant it \u2014 a delegation may only narrow, never widen`,
        widenedAt: hop.principalId
      };
    }
    effective = narrowTo(hop.grant, effective);
    if (hop.capability && !hasCapability(effective, hop.capability)) {
      return {
        ok: false,
        reason: `"${hop.capability}" was dropped somewhere in the chain before ${hop.principalId}; the principal that held it is not the one asking`,
        widenedAt: hop.principalId
      };
    }
    if (hop.budgetCents > effective.budgetCents) {
      return {
        ok: false,
        reason: `${hop.principalId} asks for ${hop.budgetCents}c but the chain grants ${effective.budgetCents}c`,
        widenedAt: hop.principalId
      };
    }
  }
  return { ok: true, effective };
}
function effectiveAuthority(agentGrant, userGrant) {
  return narrowTo(agentGrant, userGrant);
}
function issueCeiling(principalId, ceiling, fixedBy, now) {
  if (!principalId) return { ok: false, reason: "a ceiling needs a principal" };
  if (!fixedBy) return { ok: false, reason: "a ceiling must be fixed by a named human; an agent cannot self-issue one" };
  return { ok: true, record: { principalId, ceiling, fixedBy, fixedAt: now } };
}
function narrowCeiling(rec, smaller, by) {
  if (!by) return { ok: false, reason: "narrowing a ceiling must be done by a named human" };
  const next = narrowTo(rec.ceiling, smaller);
  return { ok: true, record: { ...rec, ceiling: next, fixedBy: by } };
}
function currentAuthority(args) {
  const earned = earnAuthority(args.evidence, args.ceiling.ceiling, { threshold: args.threshold });
  const fromEarned = grantFromEarned(earned, args.ceiling.ceiling);
  const effective = narrowTo(narrowTo(args.humanGrant, args.ceiling.ceiling), fromEarned);
  const explanation = Object.entries(earned.reasons).map(([k, v]) => `${k}: ${v}`).join("; ") || "nothing earned yet";
  return { effective, earned, explanation };
}

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

// probe/earnedAuthority.test.ts
bindOwnerRoot("probe-owner-passphrase");
var ROOT = process.env.SI_ROOT ?? process.cwd();
var passed = 0;
var failed = 0;
var failures = [];
var ok = (label, cond, detail = "") => {
  if (cond) {
    passed += 1;
    console.log(`  ok   ${label}`);
  } else {
    failed += 1;
    failures.push(`${label}${detail ? ` \u2014 ${detail}` : ""}`);
    console.log(`  FAIL ${label}${detail ? ` \u2014 ${detail}` : ""}`);
  }
};
var section = (n) => console.log(`
== ${n}`);
var g = (caps, cents = 0) => ({ capabilities: [...caps], budgetCents: cents });
var clean = (n) => ({ completedRuns: n, trippedRuns: 0, independentlyVerifiedRuns: n });
section("1. grants can only narrow \u2014 the absent operations are the enforcement");
{
  const wide = g(["read", "write", "shell", "network", "delegate", "spend"], 500);
  const narrow = g(["read", "write"], 100);
  ok("narrowTo is the intersection", grantsEqual(narrowTo(wide, narrow), narrow));
  ok("narrowTo is commutative here", grantsEqual(narrowTo(narrow, wide), narrowTo(wide, narrow)));
  ok("narrowing to nothing is nothing", grantsEqual(narrowTo(wide, NO_GRANT), NO_GRANT));
  ok("a budget is min, not max", narrowTo(wide, g(["read"], 1)).budgetCents === 1);
  ok("a child is narrower than its parent", isNarrower(narrow, wide));
  ok("a parent is NOT narrower than its child", !isNarrower(wide, narrow));
  const partialParent = g(["read", "write"], 500);
  ok(
    "a child holding an extra capability is not narrower than its parent",
    !isNarrower(g(["read", "write", "shell"], 500), partialParent)
  );
  ok(
    "a child with a bigger budget is not narrower than its parent",
    !isNarrower(g(["read", "write"], 501), partialParent)
  );
  const wider = g(["read", "write", "shell"], 500);
  ok("narrower really is narrower than wider", isNarrower(partialParent, wider));
  ok("and the relation does not hold in reverse", !isNarrower(wider, partialParent));
  ok("a grant is narrower than itself", isNarrower(partialParent, { ...partialParent, capabilities: [...partialParent.capabilities] }));
  const mod = fs.readFileSync(path.join(ROOT, "src", "security", "authority.ts"), "utf8");
  ok(
    "there is no exported union/widen/escalate function",
    !/export function (union|widen|escalate|grow)\b/.test(mod),
    "a grant-widening function appeared \u2014 that is the mechanism this design removes"
  );
  ok("the ceiling is only issued from a named human", /must be fixed by a named human/.test(mod));
}
section("2. a ceiling is immutable from inside");
{
  const human = "USER 1";
  const okIssue = issueCeiling("agent-1", g(["read", "write", "shell"], 1e3), human, 1e3);
  ok("a human can issue a ceiling", okIssue.ok);
  const rec = okIssue.record;
  const selfIssued = issueCeiling("agent-1", g(ALL_CAPABILITIES, 99999), "", 1e3);
  ok("an agent cannot issue its own ceiling", !selfIssued.ok, JSON.stringify(selfIssued));
  ok("the refusal says why", !selfIssued.ok && /named human/.test(selfIssued.reason));
  ok("a ceiling without a principal is refused", !issueCeiling("", g(["read"]), human, 1).ok);
  const narrowed = narrowCeiling(rec, g(["read"], 50), human);
  ok("a human may narrow a ceiling", narrowed.ok);
  const n = narrowed.record;
  ok("narrowing actually narrows", grantsEqual(n.ceiling, g(["read"], 50)));
  ok(
    "narrowing cannot be widened by asking for more",
    grantsEqual(narrowTo(n.ceiling, g(["read", "shell"], 9999)), g(["read"], 50))
  );
  ok("an agent cannot narrow a ceiling either", !narrowCeiling(rec, g(["read"]), "").ok);
}
section("3. authority is EARNED from measured evidence, never self-reported");
{
  const ceiling = g(["read", "write", "shell", "network", "delegate", "spend"], 1e3);
  const nothing = earnAuthority(NO_EVIDENCE, ceiling);
  ok("no evidence earns nothing", nothing.capabilities.length === 0 && nothing.budgetCents === 0);
  ok("and it says so, per capability", Object.values(nothing.reasons).every((r) => /not yet/.test(r)));
  const partial = earnAuthority(clean(2), ceiling);
  ok("two verified runs is below the threshold of three", partial.capabilities.length === 0);
  const earned = earnAuthority(clean(3), ceiling);
  ok("three independently verified runs earns the capabilities", earned.capabilities.length === 5, String(earned.capabilities.length));
  ok("spend is never earned \u2014 it is granted or it is not", !earned.capabilities.includes("spend"));
  ok("earned budget is at most half the ceiling", earned.budgetCents <= ceiling.budgetCents / 2, String(earned.budgetCents));
  const tripped = earnAuthority({ completedRuns: 9, trippedRuns: 7, independentlyVerifiedRuns: 9 }, ceiling);
  ok(
    "a run that tripped the guard does not count toward earning",
    tripped.capabilities.length === 0,
    `${tripped.capabilities.length} capabilities earned despite 7 trips`
  );
  const selfVerified = earnAuthority({ completedRuns: 10, trippedRuns: 0, independentlyVerifiedRuns: 0 }, ceiling);
  ok(
    "an agent that grades its own work earns nothing",
    selfVerified.capabilities.length === 0,
    `${selfVerified.capabilities.length} capabilities earned on self-verification alone`
  );
  const narrowCeiling2 = g(["read"], 10);
  const overEarned = earnAuthority(clean(100), narrowCeiling2);
  ok(
    "earning cannot exceed the ceiling",
    grantsEqual(grantFromEarned(overEarned, narrowCeiling2), g(["read"], 5)),
    JSON.stringify(grantFromEarned(overEarned, narrowCeiling2))
  );
}
section("4. THE AUTHORIZATION GAP: a fixed ceiling across an improving agent");
{
  const rec = issueCeiling("rsirals-1", g(["read", "write", "shell", "network", "delegate"], 1e3), "USER 1", 0);
  const ceilingRec = rec.record;
  const atZero = currentAuthority({ ceiling: ceilingRec, humanGrant: ceilingRec.ceiling, evidence: NO_EVIDENCE });
  ok("at minute zero nothing is earned", grantsEqual(atZero.effective, g([], 0)), JSON.stringify(atZero.effective));
  ok("and the explanation says why", /not yet/.test(atZero.explanation), atZero.explanation);
  const later = currentAuthority({ ceiling: ceilingRec, humanGrant: ceilingRec.ceiling, evidence: clean(5) });
  ok("it earns real capability once verified", hasCapability(later.effective, "write"));
  ok("but never the spend capability", !hasCapability(later.effective, "spend"));
  ok("and never more than the ceiling", isNarrower(later.effective, ceilingRec.ceiling));
  const tightened = narrowCeiling(ceilingRec, g(["read", "write"], 100), "USER 1");
  const after = currentAuthority({
    ceiling: tightened.record,
    humanGrant: ceilingRec.ceiling,
    evidence: clean(50)
  });
  ok(
    "a tightened ceiling binds even an agent with perfect evidence",
    !hasCapability(after.effective, "shell") && !hasCapability(after.effective, "network"),
    JSON.stringify(after.effective)
  );
  ok("and it cannot exceed the tightened budget", after.effective.budgetCents <= 100);
  const userPulledBack = currentAuthority({
    ceiling: ceilingRec,
    humanGrant: g(["read"]),
    evidence: clean(50)
  });
  ok(
    "the user's CURRENT grant binds too, however much was earned",
    grantsEqual(userPulledBack.effective, g(["read"], 0)),
    JSON.stringify(userPulledBack.effective)
  );
}
section("5. THE CONFUSED DEPUTY: intersection, never union");
{
  const agentWide = g(["read", "write", "shell", "network"], 1e3);
  const userNarrow = g(["read"], 0);
  const eff = effectiveAuthority(agentWide, userNarrow);
  ok("effective authority is the intersection", grantsEqual(eff, g(["read"], 0)), JSON.stringify(eff));
  ok("a narrow user cannot borrow the agent's shell", !hasCapability(eff, "shell"));
  ok("a narrow user cannot borrow the agent's budget", eff.budgetCents === 0);
  const unionWouldBe = { capabilities: [.../* @__PURE__ */ new Set([...agentWide.capabilities, ...userNarrow.capabilities])], budgetCents: 1e3 };
  ok("the union is strictly larger and is NOT what we compute", !grantsEqual(eff, unionWouldBe));
  ok("intersection is symmetric", grantsEqual(effectiveAuthority(userNarrow, agentWide), eff));
  ok("two narrow grants intersect to the narrower", grantsEqual(effectiveAuthority(userNarrow, g([])), NO_GRANT));
}
section("6. THE AGENTIC PRINCIPAL CHAIN: delegation may only narrow");
{
  const root = {
    id: "user-1",
    human: true,
    grant: g(["read", "write", "shell", "network", "delegate"], 1e3),
    ceiling: g(["read", "write", "shell", "network", "delegate"], 1e3)
  };
  const hop = (id, grant, capability, cents = 0) => ({ principalId: id, grant, capability: capability ?? "read", budgetCents: cents });
  const okChain = evaluateChain(root, [hop("b", g(["read", "write"], 200), "write", 200)]);
  ok("a properly narrowed chain is allowed", okChain.ok);
  ok(
    "its effective authority is the narrowest grant",
    okChain.ok && grantsEqual(okChain.effective, g(["read", "write"], 200)),
    okChain.ok ? JSON.stringify(okChain.effective) : ""
  );
  const amplifying = evaluateChain(root, [hop("b", g(["read", "write"], 200)), hop("c", g(["read", "write", "shell", "network", "spend"], 9e3), "shell", 9e3)]);
  ok("a hop that widens the chain is refused", !amplifying.ok, JSON.stringify(amplifying));
  ok("and the refusal names the offending principal", !amplifying.ok && amplifying.widenedAt === "c");
  ok("and says the rule that was broken", !amplifying.ok && /only narrow/.test(amplifying.reason));
  const resurrected = evaluateChain(root, [
    hop("b", g(["read"]), "read"),
    hop("c", g(["read", "write", "shell", "network"], 9999), "shell", 0)
  ]);
  ok("a downstream principal cannot recover a dropped capability", !resurrected.ok, JSON.stringify(resurrected));
  const inflated = evaluateChain(root, [hop("b", g(["read"], 50), "read", 50), hop("c", g(["read"], 50), "read", 5e3)]);
  ok("a later hop cannot re-inflate the budget", !inflated.ok);
  ok("the refusal states both numbers", !inflated.ok && /5000c/.test(inflated.reason));
  const emptyRoot = { id: "x", human: false, grant: NO_GRANT, ceiling: NO_GRANT };
  ok("an authority-free root cannot delegate", !evaluateChain(emptyRoot, [hop("b", g(["read"]))]).ok);
  const deep = evaluateChain(root, [
    hop("b", g(["read", "write", "shell"], 800), "read", 0),
    hop("c", g(["read", "write"], 500), "read", 0),
    hop("d", g(["read", "write"], 300), "read", 0),
    hop("e", g(["read", "write"], 100), "write", 100)
  ]);
  ok("a four-hop chain that narrows at every step is allowed", deep.ok);
  ok(
    "its effective authority is the FINAL narrowest grant",
    deep.ok && grantsEqual(deep.effective, g(["read", "write"], 100)),
    deep.ok ? JSON.stringify(deep.effective) : ""
  );
  ok("an empty chain yields the root's own authority", evaluateChain(root, []).ok);
}
section("7. this is not an unused library");
{
  const mod = fs.readFileSync(path.join(ROOT, "src", "security", "authority.ts"), "utf8");
  ok("the module is standalone and typed", /export function evaluateChain/.test(mod));
  ok("it refuses rather than throwing on abuse", mod.includes("ok: false"));
  ok("all six capabilities are named and covered", ALL_CAPABILITIES.length === 6);
  const wired = [
    "src/security/actionGraph.ts",
    "src/mission/teamExecutor.ts",
    "src/mission/a2aBridge.ts",
    "src/engine/hermesRuntime.ts"
  ].some((f) => fs.existsSync(path.join(ROOT, f)) && fs.readFileSync(path.join(ROOT, f), "utf8").includes("authority"));
  ok(
    "at least one runtime path references the authority module",
    wired,
    "the module is not imported anywhere \u2014 it would be a library, not a control"
  );
}
section("\xA79. A TRIP MUST ACTUALLY RESET THE RECORD (the arithmetic bug)");
{
  const CEIL = { capabilities: ["read", "write", "shell", "network", "delegate", "spend"], budgetCents: 1e4 };
  const ev = (o) => ({ completedRuns: 0, trippedRuns: 0, independentlyVerifiedRuns: 0, ...o });
  ok(
    "20 runs with 1 trip, and NO position for it, earns nothing",
    earnAuthority(ev({ completedRuns: 20, trippedRuns: 1, independentlyVerifiedRuns: 19 }), CEIL).capabilities.length === 0,
    "a lifetime net is being treated as a clean streak"
  );
  ok(
    "\u2026and the reason says a net is not a reset",
    /not a reset|clean streak cannot be shown/.test(earnAuthority(ev({ completedRuns: 20, trippedRuns: 1, independentlyVerifiedRuns: 19 }), CEIL).reasons.read ?? "")
  );
  ok(
    "10 clean, 1 trip, 10 more clean with the trip's position stated DOES earn",
    earnAuthority(ev({ completedRuns: 20, trippedRuns: 1, independentlyVerifiedRuns: 19, lastTripAtRun: 10, cleanStreakRuns: 10, cleanStreakVerified: 10 }), CEIL).capabilities.includes("write")
  );
  ok(
    "\u2026because 10 verified runs have been rebuilt since the trip",
    (earnAuthority(ev({ completedRuns: 20, trippedRuns: 1, independentlyVerifiedRuns: 19, lastTripAtRun: 10, cleanStreakRuns: 10, cleanStreakVerified: 10 }), CEIL).reasons.read ?? "").includes("after it count")
  );
  ok(
    "a trip on the LAST run earns nothing, whatever the lifetime total says",
    earnAuthority(ev({ completedRuns: 20, trippedRuns: 1, independentlyVerifiedRuns: 19, lastTripAtRun: 20, cleanStreakRuns: 0, cleanStreakVerified: 0 }), CEIL).capabilities.length === 0,
    "a seat that just tripped is trusted again on its old record"
  );
  ok(
    "a trip two runs ago is still not forgiven",
    earnAuthority(ev({ completedRuns: 20, trippedRuns: 1, independentlyVerifiedRuns: 19, lastTripAtRun: 19, cleanStreakRuns: 1, cleanStreakVerified: 1 }), CEIL).capabilities.length === 0
  );
  ok(
    "a missing streak-verified count is not a free pass",
    earnAuthority(ev({ completedRuns: 20, trippedRuns: 1, independentlyVerifiedRuns: 19, lastTripAtRun: 5, cleanStreakRuns: 15 }), CEIL).capabilities.length === 0,
    "the streak is treated as verified without saying so"
  );
  ok(
    "a streak longer than the run count is refused as a forgery",
    earnAuthority(ev({ completedRuns: 20, trippedRuns: 1, independentlyVerifiedRuns: 19, lastTripAtRun: 5, cleanStreakRuns: 99, cleanStreakVerified: 99 }), CEIL).capabilities.length === 0,
    "a streak longer than the history is accepted"
  );
  ok(
    "\u2026and it is named as untrustworthy, not as 'not yet'",
    /cannot be trusted/.test(earnAuthority(ev({ completedRuns: 20, trippedRuns: 1, independentlyVerifiedRuns: 19, lastTripAtRun: 5, cleanStreakRuns: 99, cleanStreakVerified: 99 }), CEIL).reasons.read ?? "")
  );
  ok(
    "with NO trip at all, the whole history counts (nothing had to be excluded)",
    earnAuthority(ev({ completedRuns: 12, independentlyVerifiedRuns: 12 }), CEIL).capabilities.includes("write")
  );
  ok(
    "a trip count of zero must not be faked by a missing field",
    earnAuthority(ev({ completedRuns: 12, trippedRuns: 0, independentlyVerifiedRuns: 12, lastTripAtRun: 0, cleanStreakRuns: 0 }), CEIL).capabilities.length === 0,
    "an unpopulated streak was ignored for a never-tripped seat"
  );
  ok(
    "an unsound streak yields a ZERO grant, not a reduced one",
    grantFromEarned(earnAuthority(ev({ completedRuns: 20, trippedRuns: 1, independentlyVerifiedRuns: 19 }), CEIL), CEIL).budgetCents === 0
  );
  ok(
    "and still no spend, whatever the evidence",
    !earnAuthority(ev({ completedRuns: 20, trippedRuns: 1, independentlyVerifiedRuns: 19 }), CEIL).capabilities.includes("spend")
  );
  const streak = cleanStreakOf(ev({ completedRuns: 20, trippedRuns: 1, independentlyVerifiedRuns: 19 }));
  ok("cleanStreakOf refuses to invent a streak", streak.sound === false && streak.clean === 0);
  ok(
    "cleanStreakOf reports the whole history when nothing has tripped",
    cleanStreakOf(ev({ completedRuns: 7, independentlyVerifiedRuns: 6 })).sound === true && cleanStreakOf(ev({ completedRuns: 7, independentlyVerifiedRuns: 6 })).clean === 7
  );
  ok(
    "cleanStreakOf measures from the trip, not from zero",
    cleanStreakOf(ev({ completedRuns: 20, trippedRuns: 1, lastTripAtRun: 12, cleanStreakRuns: 8, cleanStreakVerified: 8 })).clean === 8
  );
  ok(
    "a negative counter cannot buy authority",
    earnAuthority(ev({ completedRuns: 20, trippedRuns: 1, lastTripAtRun: 12, cleanStreakRuns: -5, cleanStreakVerified: -5 }), CEIL).capabilities.length === 0
  );
}
console.log(`
${passed} passed, ${failed} failed.`);
if (failed) {
  console.log(failures.map((f) => `  - ${f}`).join("\n"));
  process.exit(1);
}
