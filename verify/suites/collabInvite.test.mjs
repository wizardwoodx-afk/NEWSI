import { createRequire as __mjCreateRequire } from "node:module"; const require = __mjCreateRequire(import.meta.url);

// probe/collabInvite.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";

// src/engine/secureKeys.ts
var V2_KEY = (memberId) => `engine.collab.key.v2:${memberId}`;
var V1_KEY = (memberId) => `engine.collab.key.v1:${memberId}`;
var PBKDF_ITERATIONS = 31e4;
var PBKDF_ITERATIONS_MIN = 15e4;
var enc = new TextEncoder();
var dec = new TextDecoder();
function storage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}
var toB64 = (buf) => {
  const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (const b of u8) s += String.fromCharCode(b);
  return btoa(s);
};
var fromB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
var unlocked = /* @__PURE__ */ new Map();
function identityUnlocked(memberId) {
  return unlocked.has(memberId);
}
function forgetIdentity(memberId) {
  unlocked.delete(memberId);
}
function purgeLegacy(memberId) {
  const s = storage();
  if (s && s.getItem(V1_KEY(memberId)) !== null) {
    s.removeItem(V1_KEY(memberId));
  }
}
async function deriveKey(passphrase, salt, iterations = PBKDF_ITERATIONS) {
  const base = await globalThis.crypto.subtle.importKey("raw", enc.encode(passphrase), "PBKDF2", false, ["deriveKey"]);
  return globalThis.crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    iterations === PBKDF_ITERATIONS ? ["encrypt", "decrypt"] : ["decrypt"]
  );
}
async function ensureIdentity(memberId, passphrase) {
  if (!memberId || !passphrase || passphrase.length < 8) {
    return { ok: false, error: "a passphrase of at least 8 characters guards the signing key" };
  }
  const s = storage();
  purgeLegacy(memberId);
  const raw = s?.getItem(V2_KEY(memberId)) ?? null;
  if (raw === null) {
    const pair = await globalThis.crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
    const publicJwk = await globalThis.crypto.subtle.exportKey("jwk", pair.publicKey);
    const privateJwk = await globalThis.crypto.subtle.exportKey("jwk", pair.privateKey);
    const salt = globalThis.crypto.getRandomValues(new Uint8Array(16));
    const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
    const kek = await deriveKey(passphrase, salt);
    const cipher = await globalThis.crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      kek,
      enc.encode(JSON.stringify(privateJwk))
    );
    const record2 = {
      v: "engine-collab-key/2",
      memberId,
      publicJwk,
      saltB64: toB64(salt),
      ivB64: toB64(iv),
      cipherB64: toB64(cipher),
      kdf: "PBKDF2-SHA-256",
      iterations: PBKDF_ITERATIONS,
      createdAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    s?.setItem(V2_KEY(memberId), JSON.stringify(record2));
    unlocked.set(memberId, pair.privateKey);
    return { ok: true, created: true, publicJwk, purgedLegacy: false };
  }
  const record = JSON.parse(raw);
  try {
    const salt = fromB64(record.saltB64);
    const iv = fromB64(record.ivB64);
    const ct = fromB64(record.cipherB64);
    const itersToTry = [];
    if (typeof record.iterations === "number" && record.iterations >= PBKDF_ITERATIONS_MIN) itersToTry.push(record.iterations);
    if (!itersToTry.includes(PBKDF_ITERATIONS)) itersToTry.push(PBKDF_ITERATIONS);
    if (!itersToTry.includes(PBKDF_ITERATIONS_MIN)) itersToTry.push(PBKDF_ITERATIONS_MIN);
    let plain = null;
    for (const iters of itersToTry) {
      try {
        const kek = await deriveKey(passphrase, salt, iters);
        plain = await globalThis.crypto.subtle.decrypt(
          { name: "AES-GCM", iv },
          kek,
          ct
        );
        break;
      } catch {
      }
    }
    if (!plain) throw new Error("decrypt failed at every supported iteration count");
    const privateJwk = JSON.parse(dec.decode(plain));
    if (privateJwk.x !== record.publicJwk.x || privateJwk.y !== record.publicJwk.y) {
      return { ok: false, error: "stored public key does not match the decrypted private key \u2014 identity record tampered, refusing" };
    }
    const key = await globalThis.crypto.subtle.importKey("jwk", privateJwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
    unlocked.set(memberId, key);
    if ((record.iterations ?? 0) !== PBKDF_ITERATIONS) {
      try {
        const newSalt = globalThis.crypto.getRandomValues(new Uint8Array(16));
        const newIv = globalThis.crypto.getRandomValues(new Uint8Array(12));
        const kek = await deriveKey(passphrase, newSalt, PBKDF_ITERATIONS);
        const cipher = await globalThis.crypto.subtle.encrypt({ name: "AES-GCM", iv: newIv }, kek, enc.encode(JSON.stringify(privateJwk)));
        const upgraded = { ...record, saltB64: toB64(newSalt), ivB64: toB64(newIv), cipherB64: toB64(cipher), iterations: PBKDF_ITERATIONS };
        s?.setItem(V2_KEY(memberId), JSON.stringify(upgraded));
      } catch {
      }
    }
    return { ok: true, created: false, publicJwk: record.publicJwk, purgedLegacy: false };
  } catch {
    return { ok: false, error: "wrong passphrase \u2014 the private key stays sealed" };
  }
}
function storedPublicJwk(memberId) {
  const raw = storage()?.getItem(V2_KEY(memberId)) ?? null;
  if (raw === null) return null;
  try {
    return JSON.parse(raw).publicJwk;
  } catch {
    return null;
  }
}
var SIGN_PARAMS = {
  name: "ECDSA",
  namedCurve: "P-256",
  hash: "SHA-256"
};
async function signWithIdentity(memberId, data) {
  const key = unlocked.get(memberId);
  if (!key) throw new Error(`identity "${memberId}" is locked \u2014 unlock it before signing`);
  const sig = await globalThis.crypto.subtle.sign(
    SIGN_PARAMS,
    key,
    data
  );
  return toB64(sig);
}
function jwkEqual(a, b) {
  return a.kty === b.kty && a.crv === b.crv && a.x === b.x && a.y === b.y;
}

// src/engine/collabRegistry.ts
var PEERS_KEY = "engine.collab.peers.v1";
function storage2() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}
function load() {
  const raw = storage2()?.getItem(PEERS_KEY) ?? null;
  if (!raw) return { peers: [] };
  try {
    const r = JSON.parse(raw);
    return Array.isArray(r.peers) ? r : { peers: [] };
  } catch {
    return { peers: [] };
  }
}
function save(r) {
  storage2()?.setItem(PEERS_KEY, JSON.stringify(r));
}
function boundIdentityFor(memberId) {
  return load().peers.find((p) => p.memberId === memberId) ?? null;
}
function listBoundPeers() {
  return load().peers;
}
function bindPeerIdentity(memberId, publicJwk, source, now = () => /* @__PURE__ */ new Date()) {
  const r = load();
  const entry = { memberId, publicJwk, boundAt: now().toISOString(), source };
  r.peers = [...r.peers.filter((p) => p.memberId !== memberId), entry];
  save(r);
  return entry;
}
function unbindPeer(memberId) {
  const r = load();
  r.peers = r.peers.filter((p) => p.memberId !== memberId);
  save(r);
}
function clearRegistry() {
  storage2()?.removeItem(PEERS_KEY);
}
var A2A_PEERS_KEY = "engine.collab.a2a.v1";
function structuralIdentityFor(memberId) {
  const raw = storage2()?.getItem(A2A_PEERS_KEY) ?? null;
  if (!raw) return null;
  try {
    const r = JSON.parse(raw);
    return (Array.isArray(r.peers) ? r.peers : []).find((p) => p.memberId === memberId) ?? null;
  } catch {
    return null;
  }
}
function requireBoundKey(memberId, presentedJwk) {
  const bound = boundIdentityFor(memberId);
  if (bound) {
    if (!jwkEqual(bound.publicJwk, presentedJwk)) {
      return { ok: false, error: `presented key does not match the bound identity for "${memberId}" \u2014 refusing` };
    }
    return { ok: true, bound };
  }
  const structural = structuralIdentityFor(memberId);
  if (structural) {
    if (!jwkEqual(structural.publicJwk, presentedJwk)) {
      return { ok: false, error: `presented key does not match the A2A-card-verified identity for "${memberId}" \u2014 refusing` };
    }
    return { ok: true, bound: { memberId, publicJwk: structural.publicJwk, boundAt: structural.verifiedAt, source: "invite-acceptance" } };
  }
  return { ok: false, error: `"${memberId}" has no bound or A2A-verified identity here \u2014 bind it (invite acceptance, manual verify, or connect over A2A) before approvals can be trusted` };
}

// src/engine/collabInvite.ts
var enc2 = new TextEncoder();
function b64url(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = "";
  for (const b of u8) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function fromB64url(s) {
  const pad = s.replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(pad + "=".repeat((4 - pad.length % 4) % 4));
  const u8 = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) u8[i] = raw.charCodeAt(i);
  return u8;
}
async function sha256Hex(text) {
  const buf = await globalThis.crypto.subtle.digest("SHA-256", enc2.encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
function canonical(obj) {
  return JSON.stringify(obj, Object.keys(obj).sort());
}
async function importPublic(jwk) {
  return globalThis.crypto.subtle.importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
}
var SIGN_PARAMS2 = { name: "ECDSA", namedCurve: "P-256", hash: "SHA-256" };
async function createInvitation(args) {
  const pub = storedPublicJwk(args.from);
  if (!pub) return { ok: false, error: `no identity for "${args.from}" \u2014 create one with a passphrase first` };
  if (!identityUnlocked(args.from)) return { ok: false, error: `identity "${args.from}" is locked \u2014 unlock it to sign` };
  const payload = {
    v: "engine-invite/1",
    id: `inv-${(args.now ?? (() => /* @__PURE__ */ new Date()))().getTime().toString(36)}`,
    from: args.from,
    to: args.to,
    scope: args.scope,
    riskCeiling: args.riskCeiling,
    durationH: args.durationH,
    capabilities: args.capabilities,
    message: args.message,
    createdAt: (args.now ?? (() => /* @__PURE__ */ new Date()))().toISOString(),
    issuerPublicJwk: pub,
    trustModel: "tofu"
  };
  const canon = canonical(payload);
  const signatureB64 = await signWithIdentity(args.from, enc2.encode(canon));
  return { payload, signatureB64, digest: await sha256Hex(canon + "." + signatureB64) };
}
async function parseInvitation(token) {
  let obj;
  try {
    obj = JSON.parse(new TextDecoder().decode(fromB64url(token.trim())));
  } catch {
    return { ok: false, error: "not a parseable invitation token" };
  }
  if (!obj.payload || obj.payload.v !== "engine-invite/1" || !obj.signatureB64) {
    return { ok: false, error: "token is not a engine-invite/1 payload" };
  }
  const canon = canonical(obj.payload);
  let verified;
  try {
    const key = await importPublic(obj.payload.issuerPublicJwk);
    verified = await globalThis.crypto.subtle.verify(SIGN_PARAMS2, key, fromB64url(obj.signatureB64), enc2.encode(canon));
  } catch {
    verified = false;
  }
  if (!verified) return { ok: false, error: "signature does not verify against the issuer key \u2014 the invite was tampered with or is not from its claimed issuer" };
  const digest = await sha256Hex(canon + "." + obj.signatureB64);
  if (obj.digest && obj.digest !== digest) return { ok: false, error: "invite digest mismatch" };
  return { ok: true, invite: { payload: obj.payload, signatureB64: obj.signatureB64, digest }, issuerVerified: true };
}
function serializeInvitation(inv) {
  return b64url(enc2.encode(JSON.stringify(inv)));
}
async function signApproval(inviteDigest, approver, approved, now = () => /* @__PURE__ */ new Date()) {
  const pub = storedPublicJwk(approver);
  if (!pub) return { ok: false, error: `no identity for "${approver}"` };
  if (!identityUnlocked(approver)) return { ok: false, error: `identity "${approver}" is locked \u2014 unlock it to sign consent` };
  const body = { inviteDigest, approver, approved, at: now().toISOString() };
  const signatureB64 = await signWithIdentity(approver, enc2.encode(canonical(body)));
  return { ...body, publicJwk: pub, signatureB64 };
}
async function acceptInvitation(invite, approver, approved) {
  const approval = await signApproval(invite.digest, approver, approved);
  if ("ok" in approval && approval.ok === false) return approval;
  if (approved) {
    bindPeerIdentity(invite.payload.from, invite.payload.issuerPublicJwk, "invite-acceptance");
  }
  return { approval, bound: approved ? invite.payload.from : "(rejected \u2014 issuer not bound)" };
}
async function verifyApproval(a, expectedApprover) {
  if (a.approver !== expectedApprover) return { ok: false, error: `approval claims "${a.approver}" but the team expects "${expectedApprover}"` };
  const binding = requireBoundKey(expectedApprover, a.publicJwk);
  if (!binding.ok) return { ok: false, error: binding.error };
  const body = { inviteDigest: a.inviteDigest, approver: a.approver, approved: a.approved, at: a.at };
  try {
    const key = await importPublic(binding.bound.publicJwk);
    const ok = await globalThis.crypto.subtle.verify(SIGN_PARAMS2, key, fromB64url(a.signatureB64), enc2.encode(canonical(body)));
    return ok ? { ok: true } : { ok: false, error: `approval signature for "${a.approver}" does not verify against the bound identity` };
  } catch {
    return { ok: false, error: `approval signature for "${a.approver}" is not verifiable` };
  }
}

// src/mission/a2aIdentityBridge.ts
var A2A_PEERS_KEY2 = "engine.collab.a2a.v1";
function storage3() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}
function listA2AVerifiedPeers() {
  const raw = storage3()?.getItem(A2A_PEERS_KEY2) ?? null;
  if (!raw) return [];
  try {
    const r = JSON.parse(raw);
    return Array.isArray(r.peers) ? r.peers : [];
  } catch {
    return [];
  }
}
async function fpForJwk(jwk) {
  const buf = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(jwk)));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 16);
}
async function recordA2AVerifiedPeer(memberId, publicJwk, cardUrl, now = () => /* @__PURE__ */ new Date()) {
  const entry = { memberId, publicJwk, fp: await fpForJwk(publicJwk), verifiedAt: now().toISOString(), cardUrl };
  const peers = [...listA2AVerifiedPeers().filter((p) => p.memberId !== memberId), entry];
  storage3()?.setItem(A2A_PEERS_KEY2, JSON.stringify({ peers }));
  return entry;
}
function clearA2AVerifiedPeers() {
  storage3()?.removeItem(A2A_PEERS_KEY2);
}

// src/app/id.ts
var degradedSeq = 0;
function cryptoToken() {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  if (c && typeof c.getRandomValues === "function") {
    const bytes = new Uint8Array(16);
    c.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  }
  degradedSeq += 1;
  return `nocrypto-fallback-${degradedSeq.toString(36)}`;
}
function uid(prefix) {
  return `${prefix}-${cryptoToken()}`;
}

// src/engine/teamEvolve.ts
var RUNS_KEY = "engine.team.runs.v1";
var CONFIG_KEY = "engine.team.config.v1";
var PENDING_KEY = "engine.team.pending.v1";
var RUN_CAP = 200;
function storage4() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}
async function sha256Hex2(text) {
  const buf = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
function teamIdFor(members) {
  const clean = Array.from(new Set(members.map((m) => m.trim().toLowerCase()).filter(Boolean))).sort();
  return `team:${clean.join("+")}`;
}
function recordTeamRun(run) {
  const rec = { id: run.id ?? uid("trun"), ts: run.ts ?? (/* @__PURE__ */ new Date()).toISOString(), ...run };
  const s = storage4();
  if (s) {
    const all = JSON.parse(s.getItem(RUNS_KEY) ?? "[]");
    all.push(rec);
    s.setItem(RUNS_KEY, JSON.stringify(all.slice(-RUN_CAP * 4)));
  }
  return rec;
}
function teamRuns(teamId) {
  const s = storage4();
  if (!s) return [];
  try {
    const all = JSON.parse(s.getItem(RUNS_KEY) ?? "[]");
    return all.filter((r) => r.teamId === teamId).slice(-RUN_CAP);
  } catch {
    return [];
  }
}
function teamMemoryReport(teamId) {
  const runs = teamRuns(teamId);
  const verified = runs.filter((r) => r.outcome === "verified");
  const perSpec = /* @__PURE__ */ new Map();
  for (const r of verified) for (const id of r.specialists) perSpec.set(id, (perSpec.get(id) ?? 0) + 1);
  return {
    runs: runs.length,
    verified: verified.length,
    failed: runs.filter((r) => r.outcome === "failed").length,
    refused: runs.filter((r) => r.outcome === "refused").length,
    successRate: runs.length === 0 ? 0 : verified.length / runs.length,
    topSpecialists: Array.from(perSpec.entries()).map(([id, verifiedRuns]) => ({ id, verifiedRuns })).sort((a, b) => b.verifiedRuns - a.verifiedRuns || a.id.localeCompare(b.id))
  };
}
async function proposeTeamEvolution(teamId, members, now = () => /* @__PURE__ */ new Date()) {
  const report = teamMemoryReport(teamId);
  if (report.runs < 3) {
    return { ok: false, error: `team has ${report.runs} recorded run(s) \u2014 at least 3 real runs are needed before an evolution proposal` };
  }
  if (report.verified < 1) {
    return { ok: false, error: "team has no verified runs \u2014 a team that has never succeeded has nothing to evolve from" };
  }
  const recommended = report.topSpecialists.slice(0, 3).map((e) => e.id);
  if (recommended.length < 2) {
    return { ok: false, error: "verified runs used fewer than 2 distinct specialists \u2014 not enough signal to recommend a composition" };
  }
  const verifiedRuns = teamRuns(teamId).filter((r) => r.outcome === "verified");
  const rationale = [
    `${report.verified}/${report.runs} joint runs verified (${Math.round(report.successRate * 100)}% success).`,
    ...recommended.map((id) => {
      const e = report.topSpecialists.find((x) => x.id === id);
      return `"${id}" proved out in ${e.verifiedRuns} verified run(s) \u2014 recommended for the evolved composition.`;
    })
  ];
  const proposal = {
    id: uid("evo"),
    teamId,
    members: Array.from(new Set(members)).sort(),
    createdAt: now().toISOString(),
    recommendedSpecialists: recommended,
    rationale,
    sourceRunIds: verifiedRuns.map((r) => r.id),
    digest: ""
  };
  proposal.digest = await sha256Hex2(JSON.stringify(["engine-evolution/1", proposal.teamId, proposal.recommendedSpecialists, proposal.sourceRunIds, proposal.createdAt]));
  const s = storage4();
  if (s) s.setItem(`${PENDING_KEY}:${teamId}`, JSON.stringify(proposal));
  return { ok: true, proposal };
}
function pendingProposal(teamId) {
  const s = storage4();
  if (!s) return null;
  try {
    return JSON.parse(s.getItem(`${PENDING_KEY}:${teamId}`) ?? "null");
  } catch {
    return null;
  }
}
async function approveTeamEvolution(teamId, proposalId, approvals, now = () => /* @__PURE__ */ new Date(), signedApprovals = []) {
  const proposal = pendingProposal(teamId);
  if (!proposal || proposal.id !== proposalId) return { ok: false, error: `no pending proposal ${proposalId} for this team` };
  for (const sa of signedApprovals) {
    const member = approvals.find((a) => a.memberId === sa.approver);
    if (!member) return { ok: false, error: `signed approval from "${sa.approver}" has no matching team approval` };
    if (sa.inviteDigest !== proposal.digest) return { ok: false, error: `signed consent of "${sa.approver}" covers a DIFFERENT proposal \u2014 stale signatures refuse` };
    const v = await verifyApproval(sa, sa.approver);
    if (!v.ok) return { ok: false, error: v.error };
    if (sa.approved !== member.approved) return { ok: false, error: `signed consent of "${sa.approver}" contradicts the presented approval` };
  }
  const members = proposal.members;
  const seen = /* @__PURE__ */ new Set();
  for (const a of approvals) {
    if (!members.includes(a.memberId)) return { ok: false, error: `"${a.memberId}" is not a member of this team \u2014 outsider approvals are refused` };
    if (seen.has(a.memberId)) return { ok: false, error: `duplicate approval from "${a.memberId}" \u2014 one voice per member` };
    seen.add(a.memberId);
    if (!a.approved) return { ok: false, error: `"${a.memberId}" declined the evolution \u2014 a decline is not adopted` };
  }
  const missing = members.filter((m) => !seen.has(m));
  if (missing.length > 0) {
    return { ok: false, error: `missing explicit approval from: ${missing.join(", ")} \u2014 EVERY member must approve; there is no partial adoption` };
  }
  const prev = evolvedConfig(teamId);
  const config = {
    teamId,
    version: (prev?.version ?? 0) + 1,
    specialists: proposal.recommendedSpecialists,
    sourceRunIds: proposal.sourceRunIds,
    approvals: approvals.map((a) => ({ ...a, at: a.at || now().toISOString() })),
    adoptedAt: now().toISOString(),
    digest: await sha256Hex2(JSON.stringify(["engine-evolved-team/1", teamId, proposal.recommendedSpecialists, proposal.sourceRunIds, members]))
  };
  const s = storage4();
  if (s) {
    s.setItem(`${CONFIG_KEY}:${teamId}`, JSON.stringify(config));
    s.removeItem(`${PENDING_KEY}:${teamId}`);
  }
  return { ok: true, config };
}
function evolvedConfig(teamId) {
  const s = storage4();
  if (!s) return null;
  try {
    return JSON.parse(s.getItem(`${CONFIG_KEY}:${teamId}`) ?? "null");
  } catch {
    return null;
  }
}

// probe/collabInvite.test.ts
if (typeof globalThis.localStorage === "undefined") {
  const map = /* @__PURE__ */ new Map();
  globalThis.localStorage = {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, String(v)),
    removeItem: (k) => void map.delete(k),
    clear: () => map.clear(),
    key: (i) => Array.from(map.keys())[i] ?? null,
    get length() {
      return map.size;
    }
  };
}
var pass = 0;
var fail = 0;
var check = (name, cond, detail) => {
  if (cond) pass++;
  else fail++;
  console.log(`  ${cond ? "\u2705" : "\u274C"} ${name}${cond || detail === void 0 ? "" : ` \u2014 ${JSON.stringify(detail)}`}`);
};
var PASS = "correct-horse-battery";
test("collabInvite \u2014 identity is sealed, binding is enforced", async () => {
  console.log("\n\u2500\u2500 1. keys at rest \u2500\u2500");
  check("a short passphrase refuses to mint an identity", (await ensureIdentity("member-a", "tiny")).ok === false);
  const h = await ensureIdentity("member-a", PASS);
  check("a passphrase mints the identity", h.ok === true && h.created === true);
  const storedRaw = localStorage.getItem("engine.collab.key.v2:member-a") ?? "";
  const priv = (await globalThis.crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"])).privateKey;
  const privJwk = await globalThis.crypto.subtle.exportKey("jwk", priv);
  check("localStorage holds NO private key material", !storedRaw.includes(privJwk.d ?? "absent-sentinel") && !storedRaw.includes('"d":'));
  check("the public half is exactly what is stored in the open", JSON.stringify(storedPublicJwk("member-a")) === JSON.stringify(h.publicJwk));
  forgetIdentity("member-a");
  const wrong = await ensureIdentity("member-a", "wrong-passphrase-123");
  check("a wrong passphrase refuses \u2014 the key stays sealed", wrong.ok === false && !wrong.ok && wrong.error.includes("wrong passphrase"));
  check("refused unlock leaves the identity locked", identityUnlocked("member-a") === false);
  await ensureIdentity("member-a", PASS);
  check("the right passphrase re-unlocks and the public key is unchanged", await ensureIdentity("member-a", PASS) && JSON.stringify(storedPublicJwk("member-a")) === JSON.stringify(h.publicJwk));
  console.log("\n\u2500\u2500 2. legacy plaintext blobs are purged \u2500\u2500");
  localStorage.setItem("engine.collab.key.v1:legacyuser", JSON.stringify({ pub: { kty: "EC" }, priv: { kty: "EC", d: "PLAINTEXT" } }));
  await ensureIdentity("legacyuser", PASS);
  check("the 18.2.0 plaintext blob is gone after first contact", localStorage.getItem("engine.collab.key.v1:legacyuser") === null);
  check("legacy user got a sealed v2 identity", localStorage.getItem("engine.collab.key.v2:legacyuser") !== null);
  console.log("\n\u2500\u2500 3. invitations \u2500\u2500");
  const q = await ensureIdentity("qwen", PASS);
  const invR = await createInvitation({ from: "member-a", to: "qwen", scope: "one shared mission", riskCeiling: "safe", durationH: 24, capabilities: [] });
  check("an unlocked identity mints a signed invite", "digest" in invR);
  assert.ok("digest" in invR);
  check("scope, ceiling, duration and TOFU model ride in the payload", invR.payload.scope === "one shared mission" && invR.payload.riskCeiling === "safe" && invR.payload.trustModel === "tofu");
  forgetIdentity("member-a");
  const lockedMint = await createInvitation({ from: "member-a", to: "qwen", scope: "x", riskCeiling: "safe", durationH: 1, capabilities: [] });
  check("a LOCKED identity cannot mint invites", lockedMint.ok === false && !lockedMint.ok && lockedMint.error.includes("locked"));
  await ensureIdentity("member-a", PASS);
  const parsed = await parseInvitation(serializeInvitation(invR));
  check("a round-tripped invite verifies", parsed.ok === true);
  const tampered = JSON.parse(JSON.stringify(invR));
  tampered.payload.riskCeiling = "critical";
  check("raising the ceiling in transit refuses", (await parseInvitation(serializeInvitation(tampered))).ok === false);
  console.log("\n\u2500\u2500 4. binding closes the attacker-key hole \u2500\u2500");
  clearRegistry();
  assert.ok(parsed.ok);
  const appr = await signApproval(parsed.invite.digest, "qwen", true);
  check("the approver's unlocked session key signs", appr !== null && !("ok" in appr));
  assert.ok(!("ok" in appr));
  const unbound = await verifyApproval(appr, "qwen");
  check("an UNBOUND member's approval refuses \u2014 no binding, no verification", unbound.ok === false && !unbound.ok && unbound.error.includes("has no bound"));
  const atk = await globalThis.crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const atkJwk = await globalThis.crypto.subtle.exportKey("jwk", atk.publicKey);
  const atkPrivJwk = await globalThis.crypto.subtle.exportKey("jwk", atk.privateKey);
  const atkKey = await globalThis.crypto.subtle.importKey("jwk", atkPrivJwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const body = { inviteDigest: parsed.invite.digest, approver: "qwen", approved: true, at: (/* @__PURE__ */ new Date()).toISOString() };
  const canon = JSON.stringify(body, Object.keys(body).sort());
  const sig = await globalThis.crypto.subtle.sign({ name: "ECDSA", namedCurve: "P-256", hash: "SHA-256" }, atkKey, new TextEncoder().encode(canon));
  const b64 = btoa(String.fromCharCode(...new Uint8Array(sig)));
  const atkApproval = { ...body, publicJwk: atkJwk, signatureB64: b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "") };
  bindPeerIdentity("qwen", q.publicJwk, "manual");
  const atkVerdict = await verifyApproval(atkApproval, "qwen");
  check("attacker's fresh key + qwen's name REFUSES (the 18.2.0 hole, closed)", atkVerdict.ok === false && !atkVerdict.ok && atkVerdict.error.includes("does not match the bound identity"));
  const good = await verifyApproval(appr, "qwen");
  check("the real qwen approval verifies against the bound key", good.ok === true);
  const flipped = { ...appr, approved: false };
  check("flipping approved without re-signing refuses", (await verifyApproval(flipped, "qwen")).ok === false);
  console.log("\n\u2500\u2500 5. accepting an invitation binds the issuer \u2500\u2500");
  clearRegistry();
  const accept = await acceptInvitation(parsed.invite, "qwen", true);
  check("acceptance signs consent AND binds the issuer in one human act", accept !== null && "approval" in accept && listBoundPeers().some((p) => p.memberId === "member-a" && p.source === "invite-acceptance"));
  unbindPeer("member-a");
  check("unbinding is a human act and takes effect", listBoundPeers().every((p) => p.memberId !== "member-a"));
  bindPeerIdentity("qwen", q.publicJwk, "manual");
  bindPeerIdentity("member-a", h.publicJwk, "manual");
  console.log("\n\u2500\u2500 6. teamEvolve verifies against bindings \u2500\u2500");
  const TEAM = teamIdFor(["member-a", "qwen"]);
  for (const [task, outcome, specs] of [
    ["t1", "verified", ["code.debugging", "testing.unit"]],
    ["t2", "verified", ["review.code", "security.review"]],
    ["t3", "failed", ["code.typescript"]]
  ]) {
    recordTeamRun({ teamId: TEAM, members: ["member-a", "qwen"], task, outcome, specialists: [...specs] });
  }
  const prop = await proposeTeamEvolution(TEAM, ["member-a", "qwen"]);
  assert.ok(prop.ok);
  const signedH = await signApproval(prop.proposal.digest, "member-a", true);
  const signedQ = await signApproval(prop.proposal.digest, "qwen", true);
  assert.ok(!("ok" in signedH) && !("ok" in signedQ));
  const adopt = await approveTeamEvolution(
    TEAM,
    prop.proposal.id,
    [
      { memberId: "member-a", approved: true, at: signedH.at },
      { memberId: "qwen", approved: true, at: signedQ.at }
    ],
    void 0,
    [signedH, signedQ]
  );
  check("adoption verifies every signed approval against bindings", adopt.ok === true);
  const prop2 = await proposeTeamEvolution(TEAM, ["member-a", "qwen"]);
  assert.ok(prop2.ok);
  const stale = await approveTeamEvolution(
    TEAM,
    prop2.proposal.id,
    [
      { memberId: "member-a", approved: true, at: (/* @__PURE__ */ new Date()).toISOString() },
      { memberId: "qwen", approved: true, at: (/* @__PURE__ */ new Date()).toISOString() }
    ],
    void 0,
    [signedH, signedQ]
  );
  check("signatures over an old proposal digest refuse", stale.ok === false);
  console.log("\n\u2500\u2500 7. the stored public key must match the decrypted private key (18.4.0) \u2500\u2500");
  {
    const rawKey = "engine.collab.key.v2:member-a";
    const before = localStorage.getItem(rawKey);
    const rec = JSON.parse(before);
    const other = await globalThis.crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
    rec.publicJwk = await globalThis.crypto.subtle.exportKey("jwk", other.publicKey);
    localStorage.setItem(rawKey, JSON.stringify(rec));
    forgetIdentity("member-a");
    const tampered2 = await ensureIdentity("member-a", PASS);
    check("a tampered metadata row refuses even with the right passphrase", tampered2.ok === false && !tampered2.ok && tampered2.error.includes("tampered"));
    check("the refused identity stays locked", identityUnlocked("member-a") === false);
    localStorage.setItem(rawKey, before);
    const healed = await ensureIdentity("member-a", PASS);
    check("restoring the coherent record re-unlocks", healed.ok === true);
  }
  console.log("\n\u2500\u2500 8. A2A-card-verified peers bind structurally (18.4.0) \u2500\u2500");
  {
    clearRegistry();
    clearA2AVerifiedPeers();
    const qPub = storedPublicJwk("qwen");
    const appr2 = await signApproval(parsed.invite.digest, "qwen", true);
    assert.ok(!("ok" in appr2));
    check("with neither binding nor A2A record, qwen's approval refuses", (await verifyApproval(appr2, "qwen")).ok === false);
    await recordA2AVerifiedPeer("qwen", qPub, "https://peer.vh/.well-known/agent-card.json");
    const structural = await verifyApproval(appr2, "qwen");
    check("a card-verified A2A peer binds WITHOUT trust-on-first-use", structural.ok === true);
    const atk2 = await globalThis.crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
    const atkJwk2 = await globalThis.crypto.subtle.exportKey("jwk", atk2.publicKey);
    const atkPriv2 = await globalThis.crypto.subtle.exportKey("jwk", atk2.privateKey);
    const atkKey2 = await globalThis.crypto.subtle.importKey("jwk", atkPriv2, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
    const body2 = { inviteDigest: parsed.invite.digest, approver: "qwen", approved: true, at: (/* @__PURE__ */ new Date()).toISOString() };
    const canon2 = JSON.stringify(body2, Object.keys(body2).sort());
    const sig2 = await globalThis.crypto.subtle.sign({ name: "ECDSA", namedCurve: "P-256", hash: "SHA-256" }, atkKey2, new TextEncoder().encode(canon2));
    const b642 = btoa(String.fromCharCode(...new Uint8Array(sig2))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    check("an attacker key against an A2A-bound member still refuses", (await verifyApproval({ ...body2, publicJwk: atkJwk2, signatureB64: b642 }, "qwen")).ok === false);
    clearA2AVerifiedPeers();
    bindPeerIdentity("qwen", qPub, "manual");
    bindPeerIdentity("member-a", storedPublicJwk("member-a"), "manual");
  }
  console.log(`
${fail === 0 ? "\u2705" : "\u274C"} collabInvite probe: ${pass} passed, ${fail} failed
`);
  assert.equal(fail, 0, `${fail} collabInvite checks failed`);
});
