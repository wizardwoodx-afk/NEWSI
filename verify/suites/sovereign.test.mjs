import { createRequire as __mjCreateRequire } from "node:module"; const require = __mjCreateRequire(import.meta.url);

// src/security/sovereign.ts
import { createHash as createHash2, generateKeyPairSync, sign as edSign, verify as edVerify } from "node:crypto";

// src/security/actionGraph.ts
import { createHash, timingSafeEqual } from "node:crypto";
var PROVENANCE_PREDICATE = "https://mj.desktop/action-provenance/v1";
function nodeId(kind, seq) {
  return `${kind}#${String(seq).padStart(3, "0")}`;
}
function digestOf(kind, content) {
  return createHash("sha256").update(`${PROVENANCE_PREDICATE}
${kind}
${stableStringify(content)}`).digest("hex");
}
function stableStringify(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const entries = Object.entries(value).filter(([, v]) => v !== void 0).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
}
function emptyGraph() {
  return {
    graph: { nodes: {}, children: {}, rootId: "" },
    seq: { n: 0 }
  };
}
function addNode(graph, seq, kind, content, parents, detail, signed = true) {
  const id = nodeId(kind, seq.n);
  seq.n += 1;
  const node = {
    id,
    kind,
    digest: digestOf(kind, content),
    parents,
    ts: 0,
    // set by the recorder; kept 0 here so digests stay content-only
    detail,
    signed
  };
  graph.nodes[id] = node;
  graph.children[id] = [];
  for (const p of parents) (graph.children[p] ??= []).push(id);
  if (!graph.rootId && kind === "prompt") graph.rootId = id;
  return node;
}
var RISK_ORDER = { low: 0, medium: 1, high: 2, critical: 3 };
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
function detectDrift(issued, current) {
  if (issued.allowWrite && !current.allowWrite) return "write authority was attenuated mid-run";
  if (issued.allowShell && !current.allowShell) return "shell authority was attenuated mid-run";
  if (issued.allowNetwork && !current.allowNetwork) return "network authority was attenuated mid-run";
  if (RISK_ORDER[current.maxRisk] < RISK_ORDER[issued.maxRisk]) return "the risk ceiling was lowered mid-run";
  if (current.budgetCeiling < issued.budgetCeiling) return "the budget ceiling was lowered mid-run";
  if (current.root !== issued.root) return `the workspace root moved from ${issued.root} to ${current.root}`;
  if (!issued.allowWrite && current.allowWrite) return "write authority was ESCALATED mid-run without a human decision";
  if (!issued.allowShell && current.allowShell) return "shell authority was ESCALATED mid-run without a human decision";
  if (!issued.allowNetwork && current.allowNetwork) return "network authority was ESCALATED mid-run without a human decision";
  if (RISK_ORDER[current.maxRisk] > RISK_ORDER[issued.maxRisk]) return "the risk ceiling was ESCALATED mid-run without a human decision";
  if (current.budgetCeiling > issued.budgetCeiling) return "the budget ceiling was ESCALATED mid-run without a human decision";
  return null;
}
var DecisionJournal = class {
  entries = [];
  lastDigest = "genesis";
  append(entry) {
    const body = {
      seq: this.entries.length,
      ts: entry.ts ?? 0,
      stage: entry.stage,
      decision: entry.decision,
      outcome: entry.outcome,
      nodeId: entry.nodeId ?? null,
      evidence: entry.evidence,
      prev: this.lastDigest
    };
    const digest = createHash("sha256").update(stableStringify(body)).digest("hex");
    const full = { ...body, nodeId: body.nodeId ?? void 0, digest };
    this.entries.push(full);
    this.lastDigest = digest;
    return full;
  }
  all() {
    return this.entries;
  }
  /**
   * Verify the chain. Returns the index of the first entry whose digest does not
   * match its content, or -1. It does NOT stop at the first break: a journal
   * with a gap is more interesting than a journal that merely fails, so the
   * caller gets every index.
   */
  verify() {
    const brokenAt = [];
    let prev = "genesis";
    for (const e of this.entries) {
      const body = {
        seq: e.seq,
        ts: e.ts,
        stage: e.stage,
        decision: e.decision,
        outcome: e.outcome,
        nodeId: e.nodeId ?? null,
        evidence: e.evidence,
        prev
      };
      const expect = createHash("sha256").update(stableStringify(body)).digest("hex");
      if (expect !== e.digest || e.prev !== prev) brokenAt.push(e.seq);
      prev = e.digest;
    }
    return { ok: brokenAt.length === 0, brokenAt };
  }
};
function guardBefore(args) {
  const trips = [];
  if (!args.verdict.allowed) {
    trips.push({ when: "before", rule: "authority", detail: args.verdict.reason });
  }
  if (args.verdict.escalated) {
    trips.push({ when: "before", rule: "escalation", detail: `escalated to a human: ${args.verdict.reason}` });
  }
  if (args.repeatCount >= 3) {
    trips.push({
      when: "before",
      rule: "non-convergence",
      detail: `"${args.action}" has been attempted ${args.repeatCount} times; the run is not converging`
    });
  }
  return trips;
}
function guardAfter(args) {
  const trips = [];
  const out = args.stdout ?? "";
  const root = args.env.root;
  const escaped = [...out.matchAll(/(?:^|\s)((?:\/|\.\.\/)[^\s"'`,)]+)/g)].map((m) => m[1]).filter((p) => p.startsWith("/") && !p.startsWith(root) && !/^\/(usr|proc|sys|dev|lib|bin|sbin)\b/.test(p));
  if (escaped.length > 0) {
    trips.push({
      when: "after",
      rule: "path-escape",
      detail: `output names ${escaped.length} path(s) outside the seat root ${root}: ${escaped.slice(0, 3).join(", ")}`
    });
  }
  if (args.failed && args.failureStreak >= 3) {
    trips.push({
      when: "after",
      rule: "repeated-failure",
      detail: `${args.failureStreak} consecutive failures \u2014 stopping rather than burning the budget on a loop`
    });
  }
  if (out.length > 2e6) {
    trips.push({ when: "after", rule: "output-volume", detail: `a single tool call returned ${out.length} bytes` });
  }
  return trips;
}
function revokedEnvelope(issued) {
  return {
    allowWrite: false,
    allowShell: false,
    allowNetwork: false,
    root: issued.root,
    budgetCeiling: 0,
    maxRisk: "low"
  };
}
function governStep(session, seq, args) {
  const refreshed = session.source ? session.source() : session.issued;
  const live = refreshed ?? revokedEnvelope(session.issued);
  const drift = refreshed ? detectDrift(session.issued, live) : "the live authority is unavailable (mandate invalid, expired, or its profile changed) \u2014 authority revoked for this step";
  const verdict = authorize(live, args.action);
  const before = guardBefore({ action: args.action, env: live, verdict, repeatCount: args.repeatCount });
  if (drift) {
    session.journal.append({
      stage: "drift",
      decision: `authority drift: ${drift}`,
      outcome: "refused",
      evidence: { action: args.action, liveRefreshed: refreshed !== null }
    });
  }
  if (refreshed === null && session.source) {
    session.journal.append({
      stage: "authorize",
      decision: "live authority read returned null \u2014 proceeding under the revoked envelope",
      outcome: "refused",
      evidence: { action: args.action, liveRefreshed: false }
    });
  }
  const authNode = addNode(
    session.graph,
    seq,
    "authorization",
    { action: args.action, allowed: verdict.allowed, reason: verdict.reason, risk: verdict.risk },
    [session.graph.rootId].filter(Boolean),
    { action: args.action, allowed: verdict.allowed, risk: verdict.risk }
  );
  session.journal.append({
    stage: "authorize",
    decision: `${verdict.allowed ? "allow" : "refuse"} "${args.action}": ${verdict.reason}`,
    outcome: verdict.allowed ? "allowed" : "refused",
    nodeId: authNode.id,
    evidence: { action: args.action, risk: verdict.risk, escalated: verdict.escalated === true }
  });
  if (!verdict.allowed || drift) {
    addNode(session.graph, seq, "outcome", { action: args.action, result: "refused", reason: drift ?? verdict.reason }, [authNode.id]);
    const driftTrip = drift ? [{ when: "before", rule: "authority-drift", detail: drift }] : [];
    return { verdict, proceed: false, tripped: [...before, ...driftTrip] };
  }
  const after = guardAfter({
    action: args.action,
    env: session.issued,
    stdout: args.stdout ?? "",
    failed: args.failed === true,
    failureStreak: args.failureStreak ?? 0
  });
  const trips = [...before, ...after];
  if (trips.length > 0) {
    for (const t of trips) {
      session.journal.append({
        stage: "observe",
        decision: `guard tripped (${t.when}/${t.rule}): ${t.detail}`,
        outcome: "refused",
        evidence: { rule: t.rule, when: t.when }
      });
    }
    return { verdict, proceed: false, tripped: trips };
  }
  return { verdict, proceed: true, tripped: [] };
}
function startSession(env, prompt, opts) {
  const { graph, seq } = emptyGraph();
  addNode(graph, seq, "prompt", { prompt }, [], { bytes: prompt.length });
  const journal = new DecisionJournal();
  journal.append({
    stage: "execute",
    decision: `session opened with a ${env.maxRisk} ceiling, write=${env.allowWrite}, shell=${env.allowShell}`,
    outcome: "allowed",
    nodeId: graph.rootId,
    evidence: { maxRisk: env.maxRisk, allowWrite: env.allowWrite, allowShell: env.allowShell, root: env.root }
  });
  return { graph, journal, issued: env, trips: [], hitl: [], source: opts?.source };
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
var sovereign = new SovereignAuthority();

// src/selfimpulse/engine/policyGateway.ts
var riskyTools = /* @__PURE__ */ new Set(["workspace_write", "dispatch_mission", "shell_exec"]);
var riskyToolRule = (input) => {
  if (!riskyTools.has(input.tool)) return null;
  return {
    decision: "steer",
    rule: "risky-tool-requires-approval",
    reason: `"${input.tool}" is a governed action \u2014 human approval required before execution.`
  };
};
var sovereignRule = (input) => {
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
var budgetRule = (_input) => null;
var workspaceRootRule = (_input) => null;
var RULES = [riskyToolRule, sovereignRule, workspaceRootRule, budgetRule];
var SOVEREIGN_ALLOW = {
  decision: "allow",
  rule: "sovereign-safe-class",
  reason: "within the front-door envelope \u2014 low-risk action on the owner's own authority"
};
var policySealed = false;
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

// probe/sovereign.test.ts
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
function seat(config) {
  return { id: "seat.test.1", title: "Test seat", config };
}
section("1. a requested profile is a REQUEST \u2014 config alone issues nothing");
{
  const node = seat({ allowWrite: true, allowShell: true, allowNetwork: true, maxRisk: "high", workspaceRoot: "/tmp/si-workspace" });
  const profile = requestProfileOf(node);
  ok("the profile reads the configuration honestly", profile.allowWrite === true && profile.maxRisk === "high" && profile.root === "/tmp/si-workspace");
  ok("the profile names the agent and the owner it belongs to", profile.agentId === "seat.test.1" && profile.owner === "owner");
  const authority = new SovereignAuthority();
  ok(
    "with no mandate issued, the live read returns NOTHING",
    authority.read(node) === null,
    "config is not authority"
  );
  ok("profileDigest is stable and content-bound", profileDigest(profile) === profileDigest(requestProfileOf(node)) && profileDigest(profile) !== profileDigest(requestProfileOf(seat({ allowWrite: false }))));
  const conservative = requestProfileOf(seat({}));
  ok(
    "absent config resolves to the CONSERVATIVE profile",
    conservative.allowWrite === false && conservative.allowShell === false && conservative.allowNetwork === false && conservative.maxRisk === "low" && conservative.budgetCeiling === 0
  );
}
section("2. a mandate verifies \u2014 tampered, foreign, expired and owner-less refuse by name");
{
  const signer = sessionSigner();
  const node = seat({ allowWrite: true, maxRisk: "medium", workspaceRoot: "/tmp/si-workspace" });
  const profile = requestProfileOf(node);
  const mandate = issueMandate(profile, signer, 6e4);
  ok("a fresh mandate verifies", verifyMandate(mandate, signer).ok === true);
  const tampered = { ...mandate, env: { ...mandate.env, allowWrite: false } };
  const t = verifyMandate(tampered, signer);
  ok("a tampered envelope refuses as bad-signature", t.ok === false && t.reason === "bad-signature", t.ok ? "" : t.detail);
  const foreign = sessionSigner();
  const f = verifyMandate(mandate, foreign);
  ok("a foreign owner key refuses", f.ok === false && f.reason === "bad-signature");
  const expired = issueMandate(profile, signer, 1);
  const spinStart = Date.now();
  while (Date.now() - spinStart < 5) {
  }
  const e = verifyMandate(expired, signer);
  ok("an expired mandate refuses as expired", e.ok === false && e.reason === "expired");
  const ownerless = { ...mandate, owner: "" };
  const o = verifyMandate(ownerless, signer);
  ok("a mandate that names no human refuses as no-owner", o.ok === false && o.reason === "no-owner");
  const n = verifyMandate(null, signer);
  ok("a missing mandate refuses as missing", n.ok === false && n.reason === "missing");
}
section("3. the envelope comes from the mandate \u2014 and only from a VERIFIED mandate");
{
  const signer = sessionSigner();
  const profile = requestProfileOf(seat({ allowWrite: true, maxRisk: "high", workspaceRoot: "/tmp/si-workspace", budgetCeiling: 500 }));
  const mandate = issueMandate(profile, signer);
  const env = envelopeFromMandate(mandate, signer);
  ok(
    "the envelope carries exactly what the owner signed",
    env?.allowWrite === true && env.maxRisk === "high" && env.budgetCeiling === 500 && env.root === "/tmp/si-workspace"
  );
  ok("authorize() accepts the mandate's envelope for a write", authorize(env, "fs_write").allowed === true);
  ok("authorize() still refuses CRITICAL on the seat's own authority", authorize(env, "rm_rf").allowed === false && authorize(env, "rm_rf").escalated === true);
  const revoked = envelopeFromMandate(issueMandate(requestProfileOf(seat({})), signer), signer);
  ok("a conservative mandate issues a read-only envelope", revoked?.allowWrite === false && revoked.allowShell === false);
  const foreign = sessionSigner();
  ok(
    "a foreign key renders NOTHING \u2014 the render verifies, it does not trust",
    envelopeFromMandate(mandate, foreign) === null
  );
  ok(
    "a tampered envelope renders NOTHING",
    envelopeFromMandate({ ...mandate, env: { ...mandate.env, allowShell: true } }, signer) === null
  );
  ok(
    "an unsigned mandate renders NOTHING",
    envelopeFromMandate({ ...mandate, signature: void 0 }, signer) === null
  );
  ok("an expired mandate renders NOTHING", (() => {
    const shortLived = issueMandate(profile, signer, 1);
    return envelopeFromMandate({ ...shortLived, expiresAt: Date.now() - 1 }, signer) === null;
  })());
}
section("4. the governed loop detects live drift \u2014 attenuated, escalated, unavailable");
{
  const issued = { allowWrite: true, allowShell: false, allowNetwork: false, root: "/w", budgetCeiling: 100, maxRisk: "medium" };
  const s1 = startSession(issued, "drift probe", { source: () => ({ ...issued, allowWrite: false }) });
  const r1 = governStep(s1, { n: 1 }, { action: "fs_write", repeatCount: 1 });
  ok("an ATTENUATED authority stops the step", r1.proceed === false);
  ok("the stop names the authority-drift rule", r1.tripped.some((t) => t.rule === "authority-drift"));
  ok("the journal records the drift as a refusal", s1.journal.all().some((e) => e.stage === "drift" && e.outcome === "refused"));
  const s2 = startSession(issued, "drift probe", { source: () => ({ ...issued, allowNetwork: true }) });
  const r2 = governStep(s2, { n: 1 }, { action: "fs_write", repeatCount: 1 });
  ok("an ESCALATED authority stops the step too", r2.proceed === false);
  ok("the escalation is the drift the journal names", s2.journal.all().some((e) => e.stage === "drift" && (e.decision ?? "").includes("ESCALATED")));
  const s3 = startSession(issued, "drift probe", { source: () => null });
  const r3 = governStep(s3, { n: 1 }, { action: "read_file", repeatCount: 1 });
  ok("an UNAVAILABLE authority fail-closes even a read", r3.proceed === false);
  ok("the refusal says the authority was revoked, not merely denied", (r3.verdict.reason + r3.tripped.map((t) => t.detail).join("; ")).includes("revoked"));
  const s4 = startSession(issued, "calm probe", { source: () => issued });
  const r4 = governStep(s4, { n: 1 }, { action: "read_file", repeatCount: 1 });
  ok("a stable authority proceeds exactly as before", r4.proceed === true && r4.verdict.allowed === true);
  ok(
    "detectDrift: attenuation and escalation both reported",
    detectDrift(issued, { ...issued, allowWrite: false }) !== null && detectDrift(issued, { ...issued, allowShell: true }) !== null && detectDrift(issued, issued) === null
  );
}
section("5. a configuration change under a live mandate reads as NO authority");
{
  const authority = new SovereignAuthority();
  authority.bindOwnerSigner(sessionSigner());
  const node = seat({ allowWrite: true, maxRisk: "medium", workspaceRoot: "/tmp/si-workspace" });
  const claim = authority.mandateFor(node);
  ok("the sovereign issues the mandate", claim.ok === true && claim.issued === true);
  ok("the live read verifies against the issued profile", authority.read(node) !== null);
  node.config.allowWrite = false;
  ok("after the config changed, the read returns NOTHING (fail-closed)", authority.read(node) === null);
  ok("mandateOf agrees: the mandate no longer vouches for this seat", authority.mandateOf(node) === null);
  const back = authority.mandateFor(node);
  ok("a changed profile gets a FRESH mandate (an owner act, not a drift)", back.ok === true && back.issued === true);
  ok("\u2026and the live read verifies again", authority.read(node) !== null);
}
section("6. the PolicyGateway is a downstream adapter \u2014 no anonymous default-allow");
{
  _resetPolicyRulesForProbe();
  const r1 = propose({ tool: "workspace_write", detail: "write file.txt", args: { name: "f.txt", content: "x" } });
  ok("risky tools keep their historical rule: steer", r1.decision === "steer" && r1.rule === "risky-tool-requires-approval");
  const r2 = propose({ tool: "system_info", detail: "system info" });
  ok(
    "a low-risk read is allowed under a NAMED sovereign rule",
    r2.decision === "allow" && r2.rule === "sovereign-safe-class",
    `${r2.decision}/${r2.rule}`
  );
  const r3 = propose({ tool: "rm_rf_workspace", detail: "delete everything" });
  ok(
    "a CRITICAL action is denied outright at the front door",
    r3.decision === "deny" && r3.rule === "sovereign-critical-refuses",
    `${r3.decision}/${r3.rule}`
  );
  const r4 = propose({ tool: "npm_publish_package", detail: "publish it" });
  ok(
    "a HIGH-risk action outside the envelope steers to the human",
    r4.decision === "steer" && r4.rule === "sovereign-envelope",
    `${r4.decision}/${r4.rule}`
  );
}
console.log(`
sovereign: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
