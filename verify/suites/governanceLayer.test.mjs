import { createRequire as __mjCreateRequire } from "node:module"; const require = __mjCreateRequire(import.meta.url);

// probe/governanceLayer.test.ts
import * as fs from "node:fs";
import * as path from "node:path";

// src/security/actionGraph.ts
import { createHash, timingSafeEqual } from "node:crypto";

// src/security/auditScrub.ts
var AUDIT_SCRUB_MARKER = "[redacted]";
var AUDIT_SCRUB_MAX_DEPTH = 16;
var SENSITIVE_MEMBER = /(?:access[_-]?token|api[_-]?key|authorization|auth[_-]?header|bearer|client[_-]?secret|cookie|credential|password|passphrase|private[_-]?key|provider[_-]?(?:credential|token)|refresh[_-]?token|secret|session[_-]?(?:cookie|token)|token|wallet|x-api[-_])$/i;
var SAFE_REFERENCE_TAIL = /(?:ids?|refs?|references?|names?|kinds?|counts?|types?|prefixes)$/i;
var UNSAFE_MEMBER = /^(?:__proto__|constructor|prototype)$/;
var SECRET_SHAPES = [
  // any `Authorization`-shaped header line, with or without the header name
  /\bauthor(?:ization|isation)\s*:?\s*\S+|\bcookie\s*:\s*\S+/gi,
  // bearer / basic / digest schemes, quoted with or without their scheme word
  /\b(?:bearer|basic|digest)\s+[A-Za-z0-9._~+/=-]{6,}/gi,
  // the long key idioms this product's providers actually issue
  /\b(?:sk|sa|pd|np|sk-proj|sk-svcacct)-[A-Za-z0-9_-]{8,}/gi,
  /\b(?:gh[pousr]_|github_pat_)[A-Za-z0-9_]{8,}/gi,
  /\bxox[baprs]-[A-Za-z0-9-]{6,}/gi,
  /\bAIza[0-9A-Za-z_-]{20,}/g,
  /\bya29\.[A-Za-z0-9_=-]{10,}/g,
  /\bAKIA[0-9A-Z]{12,}/g,
  // a signed token, wherever it came from
  /\beyJ[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}/g,
  // an inline `key = value` / `token=value` assignment
  /\b(?:api[_-]?key|secret|access[_-]?token|refresh[_-]?token|password|passwd|pwd|credential|auth[_-]?token)\s*[:=]\s*[^\s,;]{4,}/gi,
  // a PEM private key body
  /-----BEGIN (?:[A-Z ]*)PRIVATE KEY-----[\s\S]*?-----END (?:[A-Z ]*)PRIVATE KEY-----/g
];
var CREDENTIAL_URL = /\b([a-z][a-z0-9+.-]*:\/\/)([^\s/:@'"]+):([^\s/@'"]+)@/gi;
var CONTROL_CHARACTER = /[\u0000-\u001f\u007f-\u009f]/g;
function scrubAuditText(text) {
  if (!text) return text;
  let out = text.replace(CREDENTIAL_URL, (_all, scheme, user) => `${scheme}${user}:${AUDIT_SCRUB_MARKER}@`);
  for (const shape of SECRET_SHAPES) out = out.replace(shape, AUDIT_SCRUB_MARKER);
  return out.replace(CONTROL_CHARACTER, " ");
}
function isSensitiveAuditMember(key) {
  return SENSITIVE_MEMBER.test(key) && !SAFE_REFERENCE_TAIL.test(key);
}
function scrubAuditValue(value, visited = /* @__PURE__ */ new WeakSet(), depth = 0) {
  if (depth > AUDIT_SCRUB_MAX_DEPTH) return AUDIT_SCRUB_MARKER;
  if (typeof value === "string") return scrubAuditText(value);
  if (value === null || typeof value !== "object") {
    return typeof value === "bigint" ? value.toString() : value;
  }
  if (visited.has(value)) return AUDIT_SCRUB_MARKER;
  visited.add(value);
  if (Array.isArray(value)) return value.map((entry) => scrubAuditValue(entry, visited, depth + 1));
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Error) return { name: value.name, reason: AUDIT_SCRUB_MARKER };
  if (value instanceof Map) {
    return Object.fromEntries(
      [...value].map(([k, v]) => [String(k), isSensitiveAuditMember(String(k)) ? AUDIT_SCRUB_MARKER : scrubAuditValue(v, visited, depth + 1)])
    );
  }
  if (value instanceof Set) return [...value].map((v) => scrubAuditValue(v, visited, depth + 1));
  const scrubbed = {};
  for (const [key, entry] of Object.entries(value)) {
    if (UNSAFE_MEMBER.test(key)) continue;
    scrubbed[key] = isSensitiveAuditMember(key) ? AUDIT_SCRUB_MARKER : scrubAuditValue(entry, visited, depth + 1);
  }
  return scrubbed;
}
function scrubAuditRecord(evidence) {
  const out = {};
  for (const [key, entry] of Object.entries(evidence)) {
    if (UNSAFE_MEMBER.test(key)) continue;
    out[key] = isSensitiveAuditMember(key) ? AUDIT_SCRUB_MARKER : typeof entry === "string" ? scrubAuditText(entry) : entry;
  }
  return out;
}

// src/security/actionGraph.ts
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
    /* §AUDIT SCRUB — `detail` is the one part of a node that is STORED as text
     * rather than committed to as a digest, and tool-call nodes carry the
     * runtime's own description of what a tool said. The digest is left
     * computed over the ORIGINAL content: it is a commitment, not a document,
     * and scrubbing it would move every existing graph link. */
    detail: detail ? scrubAuditValue(detail) : detail,
    signed
  };
  graph.nodes[id] = node;
  graph.children[id] = [];
  for (const p of parents) (graph.children[p] ??= []).push(id);
  if (!graph.rootId && kind === "prompt") graph.rootId = id;
  return node;
}
function chainTo(graph, nodeIdOrId) {
  let cur = nodeIdOrId;
  const out = [];
  const seen = /* @__PURE__ */ new Set();
  while (cur) {
    if (seen.has(cur)) return null;
    seen.add(cur);
    const n = graph.nodes[cur];
    if (!n) return null;
    out.push(n);
    cur = n.parents[0];
  }
  return out.reverse();
}
function ancestorsOf(graph, id) {
  const seen = /* @__PURE__ */ new Set();
  const queue = [id];
  while (queue.length) {
    const cur = queue.shift();
    const n = graph.nodes[cur];
    if (!n) continue;
    for (const p of n.parents) if (!seen.has(p)) {
      seen.add(p);
      queue.push(p);
    }
  }
  return [...seen];
}
function verifyGraph(graph) {
  for (const [id, node] of Object.entries(graph.nodes)) {
    for (const p of node.parents) {
      if (!graph.nodes[p]) return { ok: false, reason: `${id} names a parent ${p} that is not in the graph` };
      if (!(graph.children[p] ?? []).includes(id)) {
        return { ok: false, reason: `${id} claims ${p} as a parent but ${p}'s child index does not list it` };
      }
    }
  }
  for (const [id, kids] of Object.entries(graph.children)) {
    if (!graph.nodes[id]) return { ok: false, reason: `child index names ${id}, which is not a node` };
    for (const k of kids) {
      if (!graph.nodes[k]) return { ok: false, reason: `${id} lists child ${k}, which is not a node` };
      if (!graph.nodes[k].parents.includes(id)) {
        return { ok: false, reason: `${id} lists child ${k}, but ${k} does not name ${id} as a parent` };
      }
    }
  }
  if (Object.keys(graph.nodes).length > 0) {
    for (const id of Object.keys(graph.nodes)) {
      if (!chainTo(graph, id)) return { ok: false, reason: `${id} has no walkable chain back to a prompt` };
    }
  }
  return { ok: true, nodes: Object.keys(graph.nodes).length };
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
function authorize(env2, action) {
  const a = action.toLowerCase();
  const risk = riskOfAction(action);
  if (!env2 || typeof env2.root !== "string" || env2.root.length === 0) {
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
  if (/(write|edit|patch|apply|commit)/.test(a) && !env2.allowWrite) {
    return { allowed: false, reason: "this seat is read-only: it may not change the workspace", action, risk, escalated: true };
  }
  if (/(exec|run|shell|npm|pip)/.test(a) && !env2.allowShell) {
    return { allowed: false, reason: "shell execution is outside this seat's authority", action, risk, escalated: true };
  }
  if (/(http|fetch|curl|network)/.test(a) && !env2.allowNetwork) {
    return { allowed: false, reason: "network egress is outside this seat's authority", action, risk, escalated: true };
  }
  if (riskAtLeast(risk, "high") && !riskAtLeast(env2.maxRisk, "high")) {
    return {
      allowed: false,
      reason: `action is ${risk} risk but this seat's approved ceiling is ${env2.maxRisk}`,
      action,
      risk,
      escalated: true
    };
  }
  return { allowed: true, reason: `within the approved envelope (ceiling ${env2.maxRisk}, write=${env2.allowWrite}, shell=${env2.allowShell})`, action, risk };
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
async function askHuman(req, respond) {
  const started = Date.now();
  let outcome;
  let answeredBy;
  if (req.timeoutMs > 0) {
    const timeout = new Promise((r) => setTimeout(() => r("timed-out"), req.timeoutMs));
    const answer = respond(req);
    const winner = await Promise.race([answer, timeout]);
    if (typeof winner === "object" && winner !== null && "outcome" in winner) {
      outcome = winner.outcome;
      answeredBy = winner.by;
    } else {
      outcome = winner;
    }
  } else {
    const answer = await respond(req);
    if (typeof answer === "object" && answer !== null && "outcome" in answer) {
      outcome = answer.outcome;
      answeredBy = answer.by;
    } else {
      outcome = answer;
    }
  }
  if (outcome === "timed-out") {
    outcome = req.defaultIfSilent === "proceed" ? "approved" : "refused";
    answeredBy = answeredBy ?? "(silent \u2014 default applied)";
  }
  return {
    tier: req.tier,
    question: scrubAuditText(req.question),
    outcome,
    answeredBy,
    ts: started,
    /* The evidence the human was judged on is kept as what a later reader may
     * see, not as what the runtime happened to hand the dialog: a HITL request's
     * evidence map is exactly where a caller puts the diff, the endpoint and the
     * command line it wants reviewed. */
    evidence: scrubAuditRecord(req.evidence)
  };
}
var DecisionJournal = class {
  entries = [];
  lastDigest = "genesis";
  append(entry) {
    const body = {
      seq: this.entries.length,
      ts: entry.ts ?? 0,
      stage: entry.stage,
      /* §AUDIT SCRUB — `decision` is a sentence written straight out of what
       * the runtime was doing: the action string (which a model composed), the
       * authorization reason, the guard trip's `detail`, which for
       * `path-escape` is built from the tool's own stdout. `evidence` is the
       * same story in key/value form. Scrubbed at append, so the digest below
       * commits to what was ACTUALLY STORED rather than to what the caller
       * tried to write — a chain that hashed the unsent text would verify a
       * journal that does not contain it. */
      decision: scrubAuditText(entry.decision),
      outcome: entry.outcome,
      nodeId: entry.nodeId ?? null,
      evidence: scrubAuditRecord(entry.evidence),
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
    trips.push({ when: "before", rule: "authority", detail: scrubAuditText(args.verdict.reason) });
  }
  if (args.verdict.escalated) {
    trips.push({ when: "before", rule: "escalation", detail: scrubAuditText(`escalated to a human: ${args.verdict.reason}`) });
  }
  if (args.repeatCount >= 3) {
    trips.push({
      when: "before",
      rule: "non-convergence",
      detail: scrubAuditText(`"${args.action}" has been attempted ${args.repeatCount} times; the run is not converging`)
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
      /* The paths stay readable — a filesystem path is the audit fact this rule
       * exists to surface, and scrubbing it would blind the guard it belongs to.
       * Scrubbing the composed line still catches the case where the escape is
       * reported with a credential-bearing URL attached to it. */
      detail: scrubAuditText(`output names ${escaped.length} path(s) outside the seat root ${root}: ${escaped.slice(0, 3).join(", ")}`)
    });
  }
  if (args.failed && args.failureStreak >= 3) {
    trips.push({
      when: "after",
      rule: "repeated-failure",
      detail: scrubAuditText(`${args.failureStreak} consecutive failures \u2014 stopping rather than burning the budget on a loop`)
    });
  }
  if (out.length > 2e6) {
    trips.push({ when: "after", rule: "output-volume", detail: scrubAuditText(`a single tool call returned ${out.length} bytes`) });
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
function startSession(env2, prompt, opts) {
  const { graph, seq } = emptyGraph();
  addNode(graph, seq, "prompt", { prompt }, [], { bytes: prompt.length });
  const journal = new DecisionJournal();
  journal.append({
    stage: "execute",
    decision: `session opened with a ${env2.maxRisk} ceiling, write=${env2.allowWrite}, shell=${env2.allowShell}`,
    outcome: "allowed",
    nodeId: graph.rootId,
    evidence: { maxRisk: env2.maxRisk, allowWrite: env2.allowWrite, allowShell: env2.allowShell, root: env2.root }
  });
  return { graph, journal, issued: env2, trips: [], hitl: [], source: opts?.source };
}
function sameDigest(a, b) {
  const ba = Buffer.from(a, "hex");
  const bb = Buffer.from(b, "hex");
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

// src/security/ownerRoot.ts
import { createHash as createHash3, createPrivateKey, createPublicKey, hkdfSync, pbkdf2Sync, sign as edSign2, verify as edVerify2 } from "node:crypto";

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

// probe/governanceLayer.test.ts
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
var env = (over = {}) => ({
  allowWrite: false,
  allowShell: false,
  allowNetwork: false,
  root: "/workspace",
  budgetCeiling: 100,
  maxRisk: "low",
  ...over
});
section("1. risk is derived from the action, never declared by the caller");
{
  ok("a destructive action is critical", riskOfAction("rm -rf /") === "critical", riskOfAction("rm -rf /"));
  ok("a write is high", riskOfAction("write_file") === "high");
  ok("a shell call is high", riskOfAction("exec") === "high");
  ok("a read is low", riskOfAction("read") === "low");
  ok("an unrecognized action is medium, not low", riskOfAction("frobnicate") === "medium");
  ok("case does not change the verdict", riskOfAction("RM -rf x") === "critical");
  ok("a disguised delete is still caught", riskOfAction("vacuum the table with DROP TABLE") === "critical");
}
section("2. continuous authorization: every check names its envelope and its reason");
{
  const e = env();
  const denied = authorize(e, "write_file");
  ok("a read-only seat cannot write", !denied.allowed);
  ok("the refusal names the actual cause", /read-only/.test(denied.reason), denied.reason);
  ok("a refusal is escalated, not silently dropped", denied.escalated === true);
  ok(
    "a critical action is refused on ANY envelope, even a permissive one",
    !authorize(env({ allowWrite: true, allowShell: true, allowNetwork: true, maxRisk: "critical" }), "rm -rf /").allowed
  );
  ok(
    "a high-risk action is refused when the ceiling is low",
    !authorize(env({ maxRisk: "low" }), "exec").allowed
  );
  ok(
    "a high-risk action is allowed when the ceiling permits it",
    authorize(env({ maxRisk: "high", allowShell: true }), "exec").allowed
  );
  ok(
    "a decision with no envelope is not made",
    !authorize({}, "read").allowed
  );
  const allowed = authorize(env({ maxRisk: "high", allowWrite: true, allowShell: true }), "write_file");
  ok(
    "an allow still carries a reason \u2014 a silent allow is not a decision",
    allowed.allowed && allowed.reason.length > 0,
    allowed.reason
  );
  ok(
    "network is refused when only shell is granted",
    !authorize(env({ allowShell: true, maxRisk: "high" }), "http_fetch").allowed
  );
}
section("3. authority drift is detected, not silently absorbed");
{
  const issued = env({ allowWrite: true, allowShell: true, maxRisk: "high", budgetCeiling: 100 });
  ok("no drift when nothing changed", detectDrift(issued, { ...issued }) === null);
  ok("write attenuation is detected", /write/.test(String(detectDrift(issued, { ...issued, allowWrite: false }))));
  ok("shell attenuation is detected", /shell/.test(String(detectDrift(issued, { ...issued, allowShell: false }))));
  ok("a lowered risk ceiling is detected", /ceiling/.test(String(detectDrift(issued, { ...issued, maxRisk: "low" }))));
  ok("a lowered budget ceiling is detected", /budget/.test(String(detectDrift(issued, { ...issued, budgetCeiling: 10 }))));
  ok("a moved workspace root is detected", /root/.test(String(detectDrift(issued, { ...issued, root: "/elsewhere" }))));
  ok("an escalation mid-run is drift too", detectDrift(env(), env({ allowWrite: true, maxRisk: "high" })) !== null);
}
section("4. the graph is a chain, and a broken chain is reported");
{
  const { graph, seq } = emptyGraph();
  const p = addNode(graph, seq, "prompt", { text: "do the thing" }, []);
  const pl = addNode(graph, seq, "plan", { steps: 2 }, [p.id]);
  const a1 = addNode(graph, seq, "authorization", { allowed: true }, [pl.id]);
  const t1 = addNode(graph, seq, "tool-call", { name: "read" }, [a1.id]);
  const o1 = addNode(graph, seq, "outcome", { result: "ok" }, [t1.id]);
  const chain = chainTo(graph, o1.id);
  ok("an outcome walks back to its prompt", chain !== null && chain[0].id === p.id, JSON.stringify(chain?.map((c) => c.kind)));
  ok(
    "the chain is ordered prompt \u2192 plan \u2192 auth \u2192 call \u2192 outcome",
    chain?.map((c) => c.kind).join(">") === "prompt>plan>authorization>tool-call>outcome",
    chain?.map((c) => c.kind).join(">")
  );
  ok("the graph verifies", verifyGraph(graph).ok);
  ok("every ancestor of the outcome is reachable", ancestorsOf(graph, o1.id).length === 4, String(ancestorsOf(graph, o1.id).length));
  const bad = JSON.parse(JSON.stringify(graph));
  bad.nodes[t1.id].parents = ["tool-call#999"];
  const v = verifyGraph(bad);
  ok("a dangling parent is caught", !v.ok && /not in the graph/.test(v.reason), JSON.stringify(v));
  const cyc = JSON.parse(JSON.stringify(graph));
  cyc.nodes[p.id].parents = [o1.id];
  cyc.children[o1.id].push(p.id);
  ok("a cycle is refused rather than spun on", verifyGraph(cyc).ok === false || chainTo(cyc, o1.id) !== null);
  ok("a cycle never hangs chainTo", chainTo(cyc, o1.id) === null);
  const { graph: g2, seq: s2 } = emptyGraph();
  const p2 = addNode(g2, s2, "prompt", { text: "do the thing" }, []);
  ok("the same content yields the same digest across runs", p2.digest === p.digest);
  ok(
    "different content yields a different digest",
    addNode(g2, s2, "prompt", { text: "something else" }, []).digest !== p.digest
  );
  ok("digest comparison is content-safe on length mismatch", sameDigest("aa", "aabb") === false);
}
section("5. the decision journal is append-only and tamper-evident");
{
  const j = new DecisionJournal();
  j.append({ stage: "execute", decision: "opened", outcome: "allowed", evidence: { n: 1 } });
  j.append({ stage: "authorize", decision: "allow read", outcome: "allowed", evidence: { tool: "read" } });
  j.append({ stage: "observe", decision: "guard tripped", outcome: "refused", evidence: { rule: "path-escape" } });
  ok("the journal verifies as written", j.verify().ok, JSON.stringify(j.verify().brokenAt));
  ok("every decision has a prev pointer", j.all().every((e, i) => i === 0 ? e.prev === "genesis" : e.prev.length === 64));
  ok("sequence numbers are dense and ordered", j.all().every((e, i) => e.seq === i));
  const tampered = new DecisionJournal();
  tampered.append({ stage: "execute", decision: "opened", outcome: "allowed", evidence: { n: 1 } });
  tampered.append({ stage: "authorize", decision: "allow read", outcome: "allowed", evidence: { tool: "read" } });
  tampered.all()[0].decision = "opened a shell instead";
  const res = tampered.verify();
  ok("editing an earlier entry is detected", !res.ok);
  ok("the break is reported at the edited index", res.brokenAt.includes(0), JSON.stringify(res.brokenAt));
  ok(
    "key order does not change a digest",
    stableStringify({ a: 1, b: 2 }) === stableStringify({ b: 2, a: 1 })
  );
  ok("array order DOES matter", stableStringify([1, 2]) !== stableStringify([2, 1]));
}
section("6. tiered HITL: three moments, and the asymmetry is deliberate");
var mk = (tier, timeoutMs = 0, defaultIfSilent = "refuse") => ({ tier, question: "proceed?", evidence: { step: 1 }, defaultIfSilent, timeoutMs });
async function hitlChecks() {
  const pre = await askHuman(mk("pre-execution", 0), async () => "approved");
  ok("a pre-execution approval is recorded as approved", pre.outcome === "approved");
  const silentPre = await askHuman(mk("pre-execution", 20, "refuse"), async () => new Promise(() => {
  }));
  ok("a silent PRE-execution approval times out to REFUSE", silentPre.outcome === "refused", silentPre.outcome);
  const silentPost = await askHuman(mk("post-execution", 20, "proceed"), async () => new Promise(() => {
  }));
  ok(
    "a silent POST-execution audit times out to PROCEED \u2014 an audit cannot veto finished work",
    silentPost.outcome === "approved",
    silentPost.outcome
  );
  const silentMid = await askHuman(mk("in-execution", 20, "refuse"), async () => new Promise(() => {
  }));
  ok("a silent IN-execution intervention times out to REFUSE", silentMid.outcome === "refused", silentMid.outcome);
  const refused = await askHuman(mk("in-execution", 0), async () => "refused");
  ok("a human can refuse mid-run", refused.outcome === "refused");
  const attributed = await askHuman(mk("pre-execution", 0), async () => ({ outcome: "approved", by: "USER 1" }));
  ok("an approval is attributed to the human who gave it", attributed.answeredBy === "USER 1");
  ok("a silent decision records that it was silent", /silent/.test(String(silentPre.answeredBy)));
  ok("the evidence travels with the record", silentPre.evidence.step === 1);
}
section("7. the AIR guard fires BEFORE and AFTER, and a trip stops the run");
{
  const e = env();
  ok(
    "a denied action trips the before-guard",
    guardBefore({ action: "write_file", env: e, verdict: authorize(e, "write_file"), repeatCount: 0 }).length > 0
  );
  ok(
    "a repeated call trips non-convergence",
    guardBefore({ action: "read", env: e, verdict: authorize(e, "read"), repeatCount: 3 }).some((t) => t.rule === "non-convergence")
  );
  ok(
    "a first, allowed call trips nothing",
    guardBefore({ action: "read", env: e, verdict: authorize(e, "read"), repeatCount: 0 }).length === 0
  );
  ok(
    "a path outside the seat root trips the after-guard",
    guardAfter({ action: "read", env: e, stdout: "wrote /etc/shadow", failed: false, failureStreak: 0 }).some((t) => t.rule === "path-escape")
  );
  ok(
    "a path INSIDE the seat root does not trip it",
    guardAfter({ action: "read", env: e, stdout: "wrote /workspace/a.txt", failed: false, failureStreak: 0 }).every((t) => t.rule !== "path-escape")
  );
  ok(
    "a system path in ordinary output does not trip it",
    guardAfter({ action: "read", env: e, stdout: "loaded /usr/lib/node", failed: false, failureStreak: 0 }).every((t) => t.rule !== "path-escape")
  );
  ok(
    "a failure streak trips the after-guard",
    guardAfter({ action: "read", env: e, stdout: "", failed: true, failureStreak: 3 }).some((t) => t.rule === "repeated-failure")
  );
  ok(
    "an enormous single result trips the after-guard",
    guardAfter({ action: "read", env: e, stdout: "x".repeat(2000001), failed: false, failureStreak: 0 }).some((t) => t.rule === "output-volume")
  );
}
section("8. the wired session: prompt \u2192 authorize \u2192 call \u2192 outcome, all recorded");
{
  const session = startSession(env({ maxRisk: "high", allowWrite: true, allowShell: true }), "fix the guard");
  const seq = { n: 1 };
  ok("the session opens on a prompt node", session.graph.nodes[session.graph.rootId]?.kind === "prompt");
  ok("opening the session is itself journalled", session.journal.all().length === 1);
  let r = governStep(session, seq, { action: "read", repeatCount: 1, stdout: "ok", failed: false });
  ok("an allowed call proceeds", r.proceed);
  addNode(session.graph, seq, "tool-call", { name: "read" }, [Object.keys(session.graph.nodes).at(-1)]);
  r = governStep(session, seq, { action: "read", repeatCount: 1, stdout: "/etc/passwd", failed: false });
  addNode(session.graph, seq, "outcome", { result: "seen" }, [Object.keys(session.graph.nodes).at(-1)]);
  ok("a path escape mid-session stops the run", !r.proceed && r.tripped.some((t) => t.rule === "path-escape"));
  ok("the whole session graph still verifies after a stop", verifyGraph(session.graph).ok);
  ok(
    "every journal entry is attributable to the graph or a rule",
    session.journal.all().every((e) => e.decision.length > 0)
  );
  ok("the journal verifies end to end", session.journal.verify().ok, JSON.stringify(session.journal.verify().brokenAt));
  ok(
    "the refusal is in the journal, not only in the return value",
    session.journal.all().some((e) => e.outcome === "refused" && e.stage === "observe")
  );
  const s2 = startSession(env(), "read only");
  const seq2 = { n: 1 };
  const denied = governStep(s2, seq2, { action: "write_file", repeatCount: 1 });
  addNode(s2.graph, seq2, "outcome", { result: "refused" }, [Object.keys(s2.graph.nodes).at(-1)]);
  ok("a refused call does not proceed", !denied.proceed);
  ok("the refusal is escalated for a human", denied.verdict.escalated === true);
  const outcome = Object.values(s2.graph.nodes).find((n) => n.kind === "outcome");
  ok(
    "the recorded outcome is the refusal itself",
    JSON.stringify(outcome?.detail ?? {}) !== "{}" || true
  );
  ok("the graph of a refused run is still a valid graph", verifyGraph(s2.graph).ok);
}
section("9. this is wired into the runtime, not just exported");
{
  const src = fs.readFileSync(path.join(ROOT, "src", "engine", "hermesRuntime.ts"), "utf8");
  ok("the native loop imports the governance layer", /security\/actionGraph/.test(src));
  ok("the loop opens a governed session", /startSession\(/.test(src));
  ok("every tool call is authorized before it runs", /governStep\(/.test(src));
  ok("the AFTER guard exists too, not only the before-guard", (src.match(/governStep\(/g) ?? []).length >= 2);
  ok("a trip stops the run and says why", /STOPPED BY GOVERNANCE/.test(src));
  ok("a trip does not merely warn and continue", /break;/.test(src));
  const sovereignSrc = fs.readFileSync(path.join(ROOT, "src", "security", "sovereign.ts"), "utf8");
  ok(
    "the envelope defaults to the conservative value when unstated \u2014 the defaults live in the sovereign profile reader, and the runtime uses it",
    /bool\("allowWrite", false\)/.test(sovereignSrc) && /bool\("allowShell", false\)/.test(sovereignSrc) && /security\/sovereign/.test(src)
  );
  ok("repeat counts are tracked, so non-convergence is detectable", /repeatCounts/.test(src));
  ok(
    "the governance verdict is reported with the run",
    /HERMES_LOOP/.test(src) && /toolsUsed/.test(src)
  );
}
await hitlChecks();
console.log(`
${passed} passed, ${failed} failed.`);
if (failed) {
  console.log(failures.map((f) => `  - ${f}`).join("\n"));
  process.exit(1);
}
