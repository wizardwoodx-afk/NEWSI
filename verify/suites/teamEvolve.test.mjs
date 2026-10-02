import { createRequire as __mjCreateRequire } from "node:module"; const require = __mjCreateRequire(import.meta.url);

// probe/teamEvolve.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";

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

// src/engine/secureKeys.ts
var enc = new TextEncoder();
var dec = new TextDecoder();
function jwkEqual(a, b) {
  return a.kty === b.kty && a.crv === b.crv && a.x === b.x && a.y === b.y;
}

// src/engine/collabRegistry.ts
var PEERS_KEY = "engine.collab.peers.v1";
function storage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}
function load() {
  const raw = storage()?.getItem(PEERS_KEY) ?? null;
  if (!raw) return { peers: [] };
  try {
    const r = JSON.parse(raw);
    return Array.isArray(r.peers) ? r : { peers: [] };
  } catch {
    return { peers: [] };
  }
}
function boundIdentityFor(memberId) {
  return load().peers.find((p) => p.memberId === memberId) ?? null;
}
var A2A_PEERS_KEY = "engine.collab.a2a.v1";
function structuralIdentityFor(memberId) {
  const raw = storage()?.getItem(A2A_PEERS_KEY) ?? null;
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
function fromB64url(s) {
  const pad = s.replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(pad + "=".repeat((4 - pad.length % 4) % 4));
  const u8 = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) u8[i] = raw.charCodeAt(i);
  return u8;
}
function canonical(obj) {
  return JSON.stringify(obj, Object.keys(obj).sort());
}
async function importPublic(jwk) {
  return globalThis.crypto.subtle.importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
}
var SIGN_PARAMS = { name: "ECDSA", namedCurve: "P-256", hash: "SHA-256" };
async function verifyApproval(a, expectedApprover) {
  if (a.approver !== expectedApprover) return { ok: false, error: `approval claims "${a.approver}" but the team expects "${expectedApprover}"` };
  const binding = requireBoundKey(expectedApprover, a.publicJwk);
  if (!binding.ok) return { ok: false, error: binding.error };
  const body = { inviteDigest: a.inviteDigest, approver: a.approver, approved: a.approved, at: a.at };
  try {
    const key = await importPublic(binding.bound.publicJwk);
    const ok = await globalThis.crypto.subtle.verify(SIGN_PARAMS, key, fromB64url(a.signatureB64), enc2.encode(canonical(body)));
    return ok ? { ok: true } : { ok: false, error: `approval signature for "${a.approver}" does not verify against the bound identity` };
  } catch {
    return { ok: false, error: `approval signature for "${a.approver}" is not verifiable` };
  }
}

// src/engine/teamEvolve.ts
var RUNS_KEY = "engine.team.runs.v1";
var CONFIG_KEY = "engine.team.config.v1";
var PENDING_KEY = "engine.team.pending.v1";
var RUN_CAP = 200;
function storage2() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}
async function sha256Hex(text) {
  const buf = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
function teamIdFor(members) {
  const clean = Array.from(new Set(members.map((m) => m.trim().toLowerCase()).filter(Boolean))).sort();
  return `team:${clean.join("+")}`;
}
function recordTeamRun(run) {
  const rec = { id: run.id ?? uid("trun"), ts: run.ts ?? (/* @__PURE__ */ new Date()).toISOString(), ...run };
  const s = storage2();
  if (s) {
    const all = JSON.parse(s.getItem(RUNS_KEY) ?? "[]");
    all.push(rec);
    s.setItem(RUNS_KEY, JSON.stringify(all.slice(-RUN_CAP * 4)));
  }
  return rec;
}
function teamRuns(teamId) {
  const s = storage2();
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
  proposal.digest = await sha256Hex(JSON.stringify(["engine-evolution/1", proposal.teamId, proposal.recommendedSpecialists, proposal.sourceRunIds, proposal.createdAt]));
  const s = storage2();
  if (s) s.setItem(`${PENDING_KEY}:${teamId}`, JSON.stringify(proposal));
  return { ok: true, proposal };
}
function pendingProposal(teamId) {
  const s = storage2();
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
    digest: await sha256Hex(JSON.stringify(["engine-evolved-team/1", teamId, proposal.recommendedSpecialists, proposal.sourceRunIds, members]))
  };
  const s = storage2();
  if (s) {
    s.setItem(`${CONFIG_KEY}:${teamId}`, JSON.stringify(config));
    s.removeItem(`${PENDING_KEY}:${teamId}`);
  }
  return { ok: true, config };
}
function evolvedConfig(teamId) {
  const s = storage2();
  if (!s) return null;
  try {
    return JSON.parse(s.getItem(`${CONFIG_KEY}:${teamId}`) ?? "null");
  } catch {
    return null;
  }
}
async function autoProposeIfReady(teamId, members, now = () => /* @__PURE__ */ new Date()) {
  if (pendingProposal(teamId)) return null;
  const report = teamMemoryReport(teamId);
  const proven = new Set(report.topSpecialists.map((e) => e.id));
  if (report.runs < 3 || report.verified < 1 || proven.size < 2) return null;
  const r = await proposeTeamEvolution(teamId, members, now);
  return r.ok ? r.proposal : null;
}
function revokeEvolvedConfig(teamId) {
  const s = storage2();
  if (s) s.removeItem(`${CONFIG_KEY}:${teamId}`);
}
function applyTeamPreference(teamId, selected) {
  const config = evolvedConfig(teamId);
  if (!config) return selected;
  return selected.map(
    (c) => config.specialists.includes(c.id) ? { ...c, score: c.score + 2, reasons: [...c.reasons, `team-evolved preference (config v${config.version})`] } : c
  ).sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
}

// probe/teamEvolve.test.ts
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
var TEAM_A = teamIdFor(["member-a", "qwen"]);
test("teamEvolve \u2014 the team itself learns, with every member's consent", async () => {
  console.log("\n\u2500\u2500 1. team identity \u2500\u2500");
  check("team id is order- and case-independent", teamIdFor(["member-a", "qwen"]) === teamIdFor(["QWEN", "MEMBER-A"]));
  check("duplicate members collapse", teamIdFor(["a", "a", "b"]) === teamIdFor(["b", "a"]));
  console.log("\n\u2500\u2500 2. the joint run ledger \u2500\u2500");
  check("a fresh team has no runs", teamRuns(TEAM_A).length === 0);
  recordTeamRun({ teamId: TEAM_A, members: ["member-a", "qwen"], task: "fix the parser bug", outcome: "verified", specialists: ["code.debugging", "testing.unit"] });
  recordTeamRun({ teamId: TEAM_A, members: ["member-a", "qwen"], task: "refactor auth", outcome: "failed", specialists: ["code.typescript"] });
  recordTeamRun({ teamId: TEAM_A, members: ["member-a", "qwen"], task: "review payment handler", outcome: "verified", specialists: ["review.code", "security.review"] });
  const rep = teamMemoryReport(TEAM_A);
  check("runs are counted honestly", rep.runs === 3 && rep.verified === 2 && rep.failed === 1 && rep.refused === 0, rep);
  check("success rate is computed from real outcomes", Math.abs(rep.successRate - 2 / 3) < 1e-9);
  check("top specialists are ranked by VERIFIED runs only", rep.topSpecialists[0].verifiedRuns === 1 && rep.topSpecialists.every((e) => e.verifiedRuns >= 1));
  check("other teams' runs never leak in", teamMemoryReport(teamIdFor(["solo"])).runs === 0);
  console.log("\n\u2500\u2500 3. proposals come from real history only \u2500\u2500");
  const early = await proposeTeamEvolution(teamIdFor(["fresh", "team"]), ["fresh", "team"]);
  check("a team with no history cannot propose \u2014 refused in words", early.ok === false && !early.ok && early.error.includes("at least 3"));
  const neverWon = teamIdFor(["doom", "gloom"]);
  recordTeamRun({ teamId: neverWon, members: ["doom", "gloom"], task: "t1", outcome: "failed", specialists: ["code.debugging"] });
  recordTeamRun({ teamId: neverWon, members: ["doom", "gloom"], task: "t2", outcome: "failed", specialists: ["code.debugging"] });
  recordTeamRun({ teamId: neverWon, members: ["doom", "gloom"], task: "t3", outcome: "refused", specialists: ["code.debugging"] });
  const noWins = await proposeTeamEvolution(neverWon, ["doom", "gloom"]);
  check("a team that never succeeded has nothing to evolve from", noWins.ok === false && !noWins.ok && noWins.error.includes("no verified runs"));
  const prop = await proposeTeamEvolution(TEAM_A, ["member-a", "qwen"]);
  check("with real verified history the proposal lands", prop.ok === true);
  assert.ok(prop.ok);
  check("recommended specialists come from the verified record", prop.proposal.recommendedSpecialists.length >= 2 && prop.proposal.recommendedSpecialists.every((id) => rep.topSpecialists.some((e) => e.id === id)));
  check("the proposal names its source runs (provenance)", prop.proposal.sourceRunIds.length === 2 && prop.proposal.sourceRunIds.every((id) => teamRuns(TEAM_A).some((r) => r.id === id)));
  check("the rationale cites the real success rate", prop.proposal.rationale[0].includes("2/3"));
  check("the proposal carries a computed digest", /^[0-9a-f]{64}$/.test(prop.proposal.digest));
  check("the proposal is pending until decided", pendingProposal(TEAM_A)?.id === prop.proposal.id);
  console.log("\n\u2500\u2500 4. adoption: EVERY member approves, or it does not exist \u2500\u2500");
  const partial = await approveTeamEvolution(TEAM_A, prop.proposal.id, [{ memberId: "member-a", approved: true, at: (/* @__PURE__ */ new Date()).toISOString() }]);
  check("partial approval is refused \u2014 User 2's consent is structural", partial.ok === false && !partial.ok && partial.error.includes("missing explicit approval") && partial.error.includes("qwen"));
  const dupe = await approveTeamEvolution(TEAM_A, prop.proposal.id, [
    { memberId: "member-a", approved: true, at: (/* @__PURE__ */ new Date()).toISOString() },
    { memberId: "member-a", approved: true, at: (/* @__PURE__ */ new Date()).toISOString() }
  ]);
  check("duplicate approvals are refused \u2014 one voice per member", dupe.ok === false && !dupe.ok && dupe.error.includes("duplicate"));
  const outsider = await approveTeamEvolution(TEAM_A, prop.proposal.id, [
    { memberId: "member-a", approved: true, at: (/* @__PURE__ */ new Date()).toISOString() },
    { memberId: "mallory", approved: true, at: (/* @__PURE__ */ new Date()).toISOString() }
  ]);
  check("outsider approvals are refused", outsider.ok === false && !outsider.ok && outsider.error.includes("not a member"));
  const declined = await approveTeamEvolution(TEAM_A, prop.proposal.id, [
    { memberId: "member-a", approved: true, at: (/* @__PURE__ */ new Date()).toISOString() },
    { memberId: "qwen", approved: false, at: (/* @__PURE__ */ new Date()).toISOString() }
  ]);
  check("a single decline blocks adoption", declined.ok === false && !declined.ok && declined.error.includes("declined"));
  check("no config exists while adoption is blocked", evolvedConfig(TEAM_A) === null);
  const adopted = await approveTeamEvolution(TEAM_A, prop.proposal.id, [
    { memberId: "member-a", approved: true, at: (/* @__PURE__ */ new Date()).toISOString() },
    { memberId: "qwen", approved: true, at: (/* @__PURE__ */ new Date()).toISOString() }
  ]);
  check("unanimous approval adopts the config", adopted.ok === true && adopted.ok === true && adopted.config.version === 1);
  assert.ok(adopted.ok);
  check("the adopted config records both approvals and its source runs", adopted.config.approvals.length === 2 && adopted.config.sourceRunIds.length === 2 && /^[0-9a-f]{64}$/.test(adopted.config.digest));
  check("the pending proposal is consumed by adoption", pendingProposal(TEAM_A) === null);
  check("an unknown proposal id cannot be adopted", (await approveTeamEvolution(TEAM_A, "evo-nope", [{ memberId: "member-a", approved: true, at: "" }, { memberId: "qwen", approved: true, at: "" }])).ok === false);
  console.log("\n\u2500\u2500 5. the evolved config leans on routing \u2014 visibly \u2500\u2500");
  const selected = [
    { id: "code.typescript", score: 9, reasons: ["keyword match"] },
    { id: "review.code", score: 7, reasons: ["keyword match"] },
    { id: "testing.unit", score: 6, reasons: ["keyword match"] }
  ];
  const leaned = applyTeamPreference(TEAM_A, selected);
  const boosted = leaned.find((c) => c.id === "review.code");
  check("a recommended specialist gets the labeled boost", boosted.score === 9 && boosted.reasons.some((r) => r.includes("team-evolved preference")));
  check("non-recommended specialists are untouched", leaned.find((c) => c.id === "code.typescript").score === 9 && !leaned.find((c) => c.id === "code.typescript").reasons.some((r) => r.includes("team-evolved")));
  check("the lean reorders by the boosted scores", leaned[0].score >= leaned[1].score);
  const outside = [{ id: "data.visualization", score: 5, reasons: ["keyword match"] }];
  check("a specialist absent from the decision is never injected", applyTeamPreference(TEAM_A, outside).length === 1 && applyTeamPreference(TEAM_A, outside)[0].id === "data.visualization");
  check("teams without a config get no lean", applyTeamPreference(teamIdFor(["solo"]), selected)[0].score === 9);
  console.log("\n\u2500\u2500 6. revocation is a human act \u2500\u2500");
  revokeEvolvedConfig(TEAM_A);
  check("revocation removes the config", evolvedConfig(TEAM_A) === null);
  check("and the routing lean disappears with it", applyTeamPreference(TEAM_A, selected).find((c) => c.id === "review.code").score === 7);
  console.log("\n\u2500\u2500 5. the team self-proposes after connection (18.2.0) \u2500\u2500");
  {
    const AUTO = teamIdFor(["auto-1", "auto-2"]);
    check("a brand-new connection proposes nothing yet", await autoProposeIfReady(AUTO, ["auto-1", "auto-2"]) === null);
    recordTeamRun({ teamId: AUTO, members: ["auto-1", "auto-2"], task: "a1", outcome: "verified", specialists: ["code.debugging"] });
    recordTeamRun({ teamId: AUTO, members: ["auto-1", "auto-2"], task: "a2", outcome: "failed", specialists: ["testing.unit"] });
    recordTeamRun({ teamId: AUTO, members: ["auto-1", "auto-2"], task: "a3", outcome: "verified", specialists: ["review.code"] });
    const auto = await autoProposeIfReady(AUTO, ["auto-1", "auto-2"]);
    check("3+ runs, a verified one, 2+ specialists \u2192 the team mints its own proposal", auto !== null);
    check("the auto-proposal is visible as pending, not silently adopted", pendingProposal(AUTO)?.id === auto?.id);
    check("and it is never proposed twice", await autoProposeIfReady(AUTO, ["auto-1", "auto-2"]) === null);
    revokeEvolvedConfig(AUTO);
  }
  console.log(`
${fail === 0 ? "\u2705" : "\u274C"} teamEvolve probe: ${pass} passed, ${fail} failed
`);
  assert.equal(fail, 0, `${fail} Team-Evolve checks failed`);
});
