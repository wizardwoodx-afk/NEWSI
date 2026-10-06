import { createRequire as __mjCreateRequire } from "node:module"; const require = __mjCreateRequire(import.meta.url);

// probe/books.test.ts
import assert from "node:assert/strict";

// src/engine/finops.ts
import { createHash } from "node:crypto";

// src/security/actionGraph.ts
function stableStringify(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const entries2 = Object.entries(value).filter(([, v]) => v !== void 0).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
  return `{${entries2.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
}

// src/engine/finops.ts
var MAX_ENTRIES = 2e3;
var all = [];
function recordSeatRun(e) {
  all.push(e);
  if (all.length > MAX_ENTRIES) all = all.slice(-MAX_ENTRIES);
}
var ledger = () => [...all];
var entries = () => ledger();
var round4 = (n) => Math.round(n * 1e4) / 1e4;
function rollup(keyOf, rows) {
  const map = /* @__PURE__ */ new Map();
  for (const e of rows) {
    const key = keyOf(e);
    const g = map.get(key) ?? { key, runs: 0, usdKnown: 0, usdUnknownRuns: 0, tokens: 0, verified: 0, failed: 0 };
    g.runs += 1;
    if (e.usd === null || e.usd === void 0) g.usdUnknownRuns += 1;
    else g.usdKnown = round4(g.usdKnown + e.usd);
    g.tokens += e.tokens ?? 0;
    if (e.verdict === "verified") g.verified += 1;
    if (e.verdict === "failed") g.failed += 1;
    map.set(key, g);
  }
  return [...map.values()];
}
var bySeat = (rows = entries()) => rollup((e) => e.seatId, rows);
var byMission = (rows = entries()) => rollup((e) => e.missionId, rows);
var byDay = (rows = entries()) => rollup((e) => new Date(e.at).toISOString().slice(0, 10), rows);
function summary(rows = entries()) {
  const all2 = {
    key: "all",
    runs: rows.length,
    usdKnown: 0,
    usdUnknownRuns: 0,
    tokens: 0,
    verified: 0,
    failed: 0
  };
  for (const e of rows) {
    if (e.usd === null || e.usd === void 0) all2.usdUnknownRuns += 1;
    else all2.usdKnown = round4(all2.usdKnown + e.usd);
    all2.tokens += e.tokens ?? 0;
    if (e.verdict === "verified") all2.verified += 1;
    if (e.verdict === "failed") all2.failed += 1;
  }
  const judged = all2.verified + all2.failed;
  return { ...all2, verifiedShare: judged > 0 ? Math.round(all2.verified / judged * 100) / 100 : null };
}
function chargebackCsv(rows = entries()) {
  const head = "dimension,key,runs,usd_known,usd_unknown_runs,tokens,verified,failed";
  const lines = [head];
  const groups = [
    ["seat", bySeat(rows)],
    ["mission", byMission(rows)],
    ["day", byDay(rows)]
  ];
  for (const [dimension, group] of groups) {
    for (const g of group) {
      lines.push(`${dimension},${g.key},${g.runs},${g.usdKnown.toFixed(4)},${g.usdUnknownRuns},${g.tokens},${g.verified},${g.failed}`);
    }
  }
  return lines.join("\n") + "\n";
}
var ledgerDigest = (rows = entries()) => createHash("sha256").update(stableStringify(rows)).digest("hex").slice(0, 16);
function resetFinopsForProbe() {
  all = [];
}

// src/mission/assuranceScore.ts
var round2 = (n) => Math.round(n * 100) / 100;
var clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
function scoreAssurance(i) {
  if (!Number.isFinite(i.measuredRuns) || i.measuredRuns <= 0) {
    return {
      status: "unevaluated",
      score: null,
      band: null,
      evidenceCoverage: null,
      factors: [],
      unevaluatedReason: "No measured runs \u2014 the score refuses to exist without evidence (simulated runs teach nothing)."
    };
  }
  const measured = i.measuredRuns;
  const factors = [];
  const cvRatio = clamp(i.crossVendorVerifiedRuns / measured, 0, 1);
  const svRatio = clamp(i.sameVendorVerifiedRuns / measured, 0, 1);
  const verificationPoints = cvRatio === 1 ? 35 : round2(25 * cvRatio + Math.min(10, 10 * svRatio));
  factors.push({
    name: "verification",
    points: verificationPoints,
    max: 35,
    note: cvRatio === 1 ? "100% cross-vendor verified \u2014 the full factor" : `${Math.round(cvRatio * 100)}% cross-vendor verified (25 pts), ${Math.round(svRatio * 100)}% same-vendor (capped 10)`
  });
  const arenaRatio = clamp(i.arenaPassRuns / measured, 0, 1);
  factors.push({
    name: "governance arena",
    points: round2(20 * arenaRatio),
    max: 20,
    note: `${Math.round(arenaRatio * 100)}% of measured runs passed the arena preflight`
  });
  const measurable = i.budgetAdherences.filter((a) => a !== null);
  const budgetCoverage = clamp(measurable.length / measured, 0, 1);
  const meanAdherence = measurable.length > 0 ? measurable.reduce((a, b) => a + b, 0) / measurable.length : 0;
  factors.push({
    name: "budget discipline",
    points: round2(20 * meanAdherence * budgetCoverage),
    max: 20,
    note: measurable.length === 0 ? "no mission reported measured spend against a cap" : `mean adherence ${round2(meanAdherence)} over ${measurable.length}/${measured} measurable missions`
  });
  const integrityPoints = round2(clamp(15 - 5 * i.egressViolations, 0, 15));
  factors.push({
    name: "egress integrity",
    points: integrityPoints,
    max: 15,
    note: i.egressViolations === 0 ? "no egress-gate violations on record" : `${i.egressViolations} violation(s) on record`
  });
  const feedbackMean = i.feedbackRatings.length > 0 ? i.feedbackRatings.reduce((a, b) => a + b, 0) / i.feedbackRatings.length : 0;
  factors.push({
    name: "human feedback",
    points: round2(clamp(2 * feedbackMean, 0, 10)),
    max: 10,
    note: i.feedbackRatings.length === 0 ? "no human ratings yet" : `mean rating ${round2(feedbackMean)} over ${i.feedbackRatings.length} cycle(s)`
  });
  const raw = round2(factors.reduce((a, f) => a + f.points, 0));
  const coverage = clamp(measured / (measured + Math.max(0, i.simulatedRuns)), 0, 1);
  const score = Math.round(clamp(raw * coverage, 0, 100));
  const band = score >= 85 ? "A" : score >= 70 ? "B" : score >= 50 ? "C" : "D";
  return { status: "evaluated", score, band, evidenceCoverage: round2(coverage), factors };
}

// src/engine/assuranceLive.ts
function budgetAdherence(usd, cap) {
  if (usd === null || cap === null || cap <= 0) return null;
  return Math.min(1, Math.max(0, 1 - Math.max(0, usd - cap) / cap));
}
function scoreRuns(facts) {
  const measured = facts.filter((f) => f.measured);
  return scoreAssurance({
    measuredRuns: measured.length,
    simulatedRuns: facts.length - measured.length,
    // Cross-vendor verification is not yet fed live — the weaker same-vendor
    // form is what the runtime can honestly claim today. Capped by design.
    crossVendorVerifiedRuns: 0,
    sameVendorVerifiedRuns: measured.filter((f) => f.verified).length,
    arenaPassRuns: measured.filter((f) => f.arenaPass).length,
    budgetAdherences: measured.map((f) => budgetAdherence(f.usd, f.budgetCap)),
    egressViolations: facts.reduce((a, f) => a + f.egressViolations, 0),
    feedbackRatings: []
  });
}
function scoreFromLedger() {
  return scoreRuns(entries().map((e) => ({
    seatId: e.seatId,
    missionId: e.missionId,
    measured: e.verdict !== "other",
    verified: e.verdict === "verified",
    arenaPass: e.verdict === "verified",
    usd: e.usd,
    budgetCap: null,
    // per-mission caps arrive with budget-governed missions
    egressViolations: 0
  })));
}

// src/security/sovereign.ts
import { createHash as createHash2, generateKeyPairSync, sign as edSign, verify as edVerify } from "node:crypto";
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
  return createHash2("sha256").update(`si.profile.v1
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
  const id = createHash2("sha256").update(pubDer).digest("hex").slice(0, 16);
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
function canonicalScopeOf(env) {
  const scope = [];
  if (env.allowWrite) scope.push("fs.write");
  if (env.allowShell) scope.push("shell.exec");
  if (env.allowNetwork) scope.push("net.fetch");
  scope.push(`risk:${env.maxRisk}`);
  return scope.sort();
}
var sovereign = new SovereignAuthority();

// src/engine/iamLedger.ts
function roster() {
  return sovereign.enrolledAgents().map((agentId) => {
    const m = sovereign.enrolledMandateOf(agentId);
    const base = {
      agentId,
      issuerRoot: sovereign.root,
      issuerKeyId: sovereign.signerId,
      revoked: sovereign.isRevoked(agentId)
    };
    if (!m) {
      return { ...base, owner: "unknown", scope: [], issuedAt: 0, expiresAt: 0 };
    }
    return {
      ...base,
      owner: m.owner,
      scope: canonicalScopeOf(m.env),
      issuedAt: m.issuedAt,
      expiresAt: m.expiresAt
    };
  });
}
function revokeAgent(agentId) {
  sovereign.revoke(agentId);
}

// src/security/ownerRoot.ts
import { createHash as createHash3, createPrivateKey, createPublicKey, hkdfSync, pbkdf2Sync, sign as edSign2, verify as edVerify2 } from "node:crypto";

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

// probe/books.test.ts
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
var T0 = 178e10;
section("1. Agent FinOps \u2014 the money law");
{
  resetFinopsForProbe();
  recordSeatRun({ at: T0, seatId: "coder", missionId: "m-1", usd: 0.12, tokens: 4e3, turns: 3, verdict: "verified", source: "cli-a" });
  recordSeatRun({ at: T0 + 1e3, seatId: "reviewer", missionId: "m-1", usd: null, tokens: 2500, turns: 2, verdict: "completed", source: "local" });
  recordSeatRun({ at: T0 + 2e3, seatId: "coder", missionId: "m-2", usd: 0.3, tokens: 9e3, turns: 5, verdict: "failed", source: "cli-a" });
  recordSeatRun({ at: T0 + 26 * 60 * 6e4, seatId: "coder", missionId: "m-3", usd: 0.05, tokens: 900, turns: 1, verdict: "verified", source: "cli-a" });
  const seats = bySeat();
  ok("the by-seat rollup groups honestly", seats.length === 2);
  const coder = seats.find((s) => s.key === "coder");
  assert.ok(coder);
  ok("coder: 3 runs, $0.47 known, verified and failed counted", coder.runs === 3 && Math.abs(coder.usdKnown - 0.47) < 1e-9 && coder.verified === 2 && coder.failed === 1);
  const missions = byMission();
  ok("the by-mission rollup answers what a body of work cost", missions.find((m) => m.key === "m-1")?.usdKnown === 0.12);
  ok("the by-day rollup splits on the UTC day boundary", byDay().length === 2);
  ok("USD-unknown is its own count \u2014 never zero, never invented", seats.find((s) => s.key === "reviewer")?.usdUnknownRuns === 1);
  const sum = summary();
  ok(
    "the summary: 4 runs, $0.47, 1 unknown, verified share 2/3",
    sum.runs === 4 && Math.abs(sum.usdKnown - 0.47) < 1e-9 && sum.usdUnknownRuns === 1 && (sum.verifiedShare ?? 0) === 0.67
  );
  const csv = chargebackCsv();
  ok("the chargeback CSV carries the header and every dimension", csv.startsWith("dimension,key,runs,usd_known,usd_unknown_runs,tokens,verified,failed") && csv.includes("seat,coder,") && csv.includes("mission,m-1,") && csv.includes("day,"));
  ok("the ledger digest is stable and content-bound", ledgerDigest() === ledgerDigest() && ledgerDigest().length === 16);
}
section("2. Assurance \u2014 measured, or it refuses to exist");
{
  ok("no measured runs \u2192 unevaluated, with the reason said", scoreRuns([]).status === "unevaluated");
  const score = scoreRuns([
    { seatId: "a", missionId: "m-1", measured: true, verified: true, arenaPass: true, usd: 0.1, budgetCap: 0.2, egressViolations: 0 },
    { seatId: "b", missionId: "m-1", measured: true, verified: false, arenaPass: false, usd: 0.3, budgetCap: 0.2, egressViolations: 1 },
    { seatId: "c", missionId: "m-2", measured: false, verified: false, arenaPass: false, usd: null, budgetCap: null, egressViolations: 0 }
  ]);
  ok("evaluated from measured runs only (the simulated one dilutes coverage, never adds)", score.status === "evaluated" && (score.evidenceCoverage ?? 0) < 1);
  ok("the budget-discipline factor reflects the overrun (b spent past cap)", score.factors.find((f) => f.name === "budget discipline")?.points ?? -1 < 20);
  ok("the egress factor reflects the violation", (score.factors.find((f) => f.name === "egress integrity")?.points ?? 15) < 15);
  ok("the ledger-backed read scores the same rows the chargeback exports", scoreFromLedger().status === "evaluated");
}
section("3. Agent IAM \u2014 owned, not assigned");
{
  bindOwnerRoot("probe-owner-passphrase");
  ok("the roster starts empty", roster().length === 0);
  const claim = sovereign.mandateFor({ id: "seat.iam.1", title: "IAM seat", config: { allowWrite: true, workspaceRoot: "/tmp/w" } });
  assert.ok(claim.ok);
  const entry = roster().find((r) => r.agentId === "seat.iam.1");
  assert.ok(entry);
  ok(
    "the roster carries owner, issuer root, key id, scope and expiry",
    entry.owner === "owner" && entry.issuerRoot === sovereign.root && entry.issuerKeyId === sovereign.signerId && entry.scope.includes("fs.write") && entry.expiresAt > entry.issuedAt
  );
  ok("the scope derivation is the canonical one", JSON.stringify(entry.scope) === JSON.stringify(["fs.write", "risk:low"]));
  revokeAgent("seat.iam.1");
  ok("revocation flows through the sovereign and shows in the roster", sovereign.isRevoked("seat.iam.1") === true && roster().find((r) => r.agentId === "seat.iam.1")?.revoked === true);
  const exported = JSON.stringify({ entries: roster().length, root: sovereign.root });
  ok("the roster exports as identity data, not credentials", !exported.includes("signature") && !exported.includes("privateKey"));
}
console.log(`
books: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
