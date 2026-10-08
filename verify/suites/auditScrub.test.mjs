import { createRequire as __mjCreateRequire } from "node:module"; const require = __mjCreateRequire(import.meta.url);

// probe/auditScrub.test.ts
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";

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
function scrubAuditLines(lines) {
  return (lines ?? []).map(scrubAuditText);
}

// src/security/actionGraph.ts
import { createHash, timingSafeEqual } from "node:crypto";
function stableStringify(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const entries = Object.entries(value).filter(([, v]) => v !== void 0).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
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

// src/mission/flightRecorder.ts
var listeners = /* @__PURE__ */ new Set();
var FlightRecorder = class {
  events = [];
  nextSeq = 1;
  missionId;
  constructor(missionId, seed = []) {
    this.missionId = missionId;
    this.events = [...seed];
    this.nextSeq = seed.length ? Math.max(...seed.map((e) => e.seq)) + 1 : 1;
  }
  /**
   * §25 Merge persisted history back in on resume. Existing sequence numbers are kept so a
   * restored mission's trace stays contiguous, and events already present are not duplicated.
   */
  seedHistory(events) {
    if (!events.length) return 0;
    const seen = new Set(this.events.map((e) => e.seq));
    let added = 0;
    for (const e of events) {
      if (seen.has(e.seq)) continue;
      this.events.push(e);
      seen.add(e.seq);
      added += 1;
    }
    this.events.sort((a, b) => a.seq - b.seq);
    this.nextSeq = this.events.length ? this.events[this.events.length - 1].seq + 1 : 1;
    return added;
  }
  record(input) {
    if (!input.actor) throw new Error("governance: every event needs an actor");
    if (!input.authority) throw new Error("governance: every event needs an authority");
    if (!input.reason) throw new Error("governance: every event needs a reason");
    const event = {
      seq: this.nextSeq++,
      missionId: input.missionId ?? this.missionId,
      ts: (/* @__PURE__ */ new Date()).toISOString(),
      kind: input.kind,
      actor: input.actor,
      authority: input.authority,
      policy: input.policy || "none-required",
      reason: scrubAuditText(input.reason),
      evidence: scrubAuditLines(input.evidence),
      subjectId: input.subjectId ?? null,
      data: scrubAuditValue(input.data ?? {})
    };
    this.events.push(event);
    for (const fn of listeners) {
      try {
        fn(event);
      } catch {
      }
    }
    return event;
  }
  all() {
    return [...this.events];
  }
  ofKind(...kinds) {
    const set = new Set(kinds);
    return this.events.filter((e) => set.has(e.kind));
  }
  forSubject(subjectId) {
    return this.events.filter((e) => e.subjectId === subjectId);
  }
  last(kind) {
    for (let i = this.events.length - 1; i >= 0; i--) {
      if (this.events[i].kind === kind) return this.events[i];
    }
    return null;
  }
  count(kind) {
    return this.events.filter((e) => e.kind === kind).length;
  }
  /**
   * §14 Replay. Returns the recorder state as it was after `uptoSeq` events.
   * Used by the flight-recorder UI to scrub the mission timeline.
   */
  replay(uptoSeq) {
    return this.events.filter((e) => e.seq <= uptoSeq);
  }
  /** Distinct sequence numbers, for the scrubber. */
  seqRange() {
    if (!this.events.length) return { min: 0, max: 0 };
    return { min: this.events[0].seq, max: this.events[this.events.length - 1].seq };
  }
  snapshot() {
    return { events: this.all(), nextSeq: this.nextSeq };
  }
  /**
   * Truncate everything after `uptoSeq` — used when rolling a mission back to a checkpoint
   * so the trace does not claim things that are no longer true. The truncation is itself
   * recorded first, so the rollback is visible.
   */
  truncateAfter(uptoSeq, reason) {
    const removed = this.events.filter((e) => e.seq > uptoSeq).length;
    this.events = this.events.filter((e) => e.seq <= uptoSeq);
    this.nextSeq = uptoSeq + 1;
    if (removed > 0) {
      this.record({
        kind: "MISSION_ROLLED_BACK",
        actor: "flight-recorder",
        authority: "runtime",
        policy: "checkpoint.rollback",
        reason,
        data: { removedEvents: removed, uptoSeq }
      });
    }
    return removed;
  }
  get length() {
    return this.events.length;
  }
};
var recorders = /* @__PURE__ */ new Map();
function recorderFor(missionId, seed) {
  let r = recorders.get(missionId);
  if (!r) {
    r = new FlightRecorder(missionId, seed);
    recorders.set(missionId, r);
  }
  return r;
}

// src/mission/riskPolicy.ts
var RISK_RULES = [
  // ---- CRITICAL -------------------------------------------------------------
  { match: /\bdeploy\b.*\b(prod|production)\b|\b(prod|production)\b.*\bdeploy\b/i, risk: "CRITICAL", why: "Production deployment is irreversible for end users." },
  { match: /\bdelete\b.*\b(data|database|volume|bucket|table)\b|\bdrop\s+(table|database)\b|\btruncate\b/i, risk: "CRITICAL", why: "Data destruction." },
  { match: /\b(rotate|revoke|modify|create|delete)\b.*\b(credential|secret|api[- ]?key|token|password)\b/i, risk: "CRITICAL", why: "Credential material." },
  { match: /\b(iam|rbac|role|policy)\b.*\b(grant|attach|modify|delete|create)\b|\bmodify\b.*\b(access policy|identity)\b/i, risk: "CRITICAL", why: "Identity and access policy." },
  { match: /\bgit\s+push\b.*(--force|-f)\b|\bforce[- ]push\b/i, risk: "CRITICAL", why: "Force push rewrites shared history." },
  { match: /\brm\s+-rf\s+\/(?!\w)|\bformat\b.*\bdisk\b|\bmkfs\b/i, risk: "CRITICAL", why: "Destructive filesystem operation." },
  { match: /\b(drop|migrate)\b.*\bproduction\b/i, risk: "CRITICAL", why: "Production schema change." },
  // ---- HIGH -----------------------------------------------------------------
  { match: /\bgit\s+push\b|\bpublish\b.*\b(package|release|npm|crate)\b|\btag\b.*\brelease\b/i, risk: "HIGH", why: "Publishes work outside the workspace." },
  { match: /\b(terraform|pulumi|cloudformation|kubectl|helm)\b.*\b(apply|destroy|delete|scale)\b/i, risk: "HIGH", why: "Infrastructure mutation." },
  { match: /\bmodify\b.*\b(deployment|ci|cd|pipeline)\s*config|\bedit\b.*\.github\/workflows/i, risk: "HIGH", why: "Deployment configuration." },
  { match: /\bnpm\s+publish\b|\bcargo\s+publish\b|\btwine\s+upload\b/i, risk: "HIGH", why: "Publishes an artifact to a public registry." },
  { match: /\bALTER\s+TABLE\b|\bCREATE\s+INDEX\b.*\bCONCURRENTLY\b/i, risk: "HIGH", why: "Schema migration." },
  // ---- MEDIUM ---------------------------------------------------------------
  { match: /\b(npm|pnpm|yarn)\s+(install|add|remove)\b|\bpip\s+install\b|\bcargo\s+add\b|\bapt(-get)?\s+install\b|\bbrew\s+install\b/i, risk: "MEDIUM", why: "Installs packages, changing the dependency set." },
  { match: /\b(edit|write|modify|patch|refactor|implement|fix)\b.*\b(file|code|source|config)\b|\bapply\s+diff\b/i, risk: "MEDIUM", why: "Edits code or configuration." },
  { match: /\bgit\s+(commit|checkout|branch|merge|rebase|reset)\b/i, risk: "MEDIUM", why: "Mutates repository state." },
  { match: /\b(set|export)\b.*\b(env|environment variable)\b|\bedit\b.*\.(env|toml|ya?ml|ini)\b/i, risk: "MEDIUM", why: "Configuration change." },
  { match: /\bmigration\b|\bscaffold\b|\bgenerate\b.*\b(scaffold|boilerplate)\b/i, risk: "MEDIUM", why: "Bulk file creation." },
  // ---- LOW ------------------------------------------------------------------
  { match: /\b(read|view|cat|inspect|list|show)\b.*\b(file|log|output|diff|state)\b/i, risk: "LOW", why: "Read-only inspection." },
  { match: /\b(run|execute)\b.*\b(test|tests|test suite|lint|typecheck|build)\b/i, risk: "LOW", why: "Local verification with no side effects outside the workspace." },
  { match: /\b(research|search|summarise|summarize|analyse|analyze|explain|review|plan|draft)\b/i, risk: "LOW", why: "Analysis produces no external change." }
];
function classifyRisk(action, toolName) {
  const haystack = [toolName ?? "", action].join(" :: ");
  for (const rule of RISK_RULES) {
    if (rule.match.test(haystack)) {
      return { risk: rule.risk, why: rule.why, matchedRule: String(rule.match) };
    }
  }
  return {
    risk: "MEDIUM",
    why: "Unrecognised action. Unknown actions are treated as MEDIUM, not LOW.",
    matchedRule: null
  };
}
function requiresHuman(risk, approvalThreshold, autonomy) {
  if (autonomy === "HUMAN_ONLY") return true;
  if (risk === "CRITICAL") return true;
  if (autonomy === "AUTONOMOUS") return false;
  const order = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
  return order.indexOf(risk) >= order.indexOf(approvalThreshold);
}

// src/mission/approvals.ts
var ApprovalGateService = class {
  requests = /* @__PURE__ */ new Map();
  waiters = /* @__PURE__ */ new Map();
  list() {
    return [...this.requests.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }
  pending() {
    return this.list().filter((r) => r.status === "PENDING");
  }
  get(id) {
    return this.requests.get(id) ?? null;
  }
  forMission(missionId) {
    return this.list().filter((r) => r.missionId === missionId);
  }
  pendingForMission(missionId) {
    return this.forMission(missionId).filter((r) => r.status === "PENDING");
  }
  /**
   * Decide the risk class and whether a human is needed. The risk class is derived from the
   * action by `classifyRisk`; an override must justify itself and can only ever be recorded,
   * never applied silently.
   */
  evaluate(input) {
    const derived = classifyRisk(input.action, input.toolName);
    let risk = derived.risk;
    let why = derived.why;
    if (input.riskOverride) {
      const order = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
      if (order.indexOf(input.riskOverride.risk) > order.indexOf(derived.risk)) {
        risk = input.riskOverride.risk;
        why = `${input.riskOverride.reason} (derived: ${derived.why})`;
      } else {
        why = `${derived.why} (requested downgrade to ${input.riskOverride.risk} refused: overrides may only raise risk)`;
      }
    }
    const autonomy = input.mission.riskPolicy.autonomy;
    const needsHuman = requiresHuman(risk, input.mission.riskPolicy.approvalThreshold, autonomy);
    if (!needsHuman) {
      return { autonomous: true, request: null, risk, why };
    }
    const request = {
      id: uid("apr"),
      missionId: input.mission.missionId,
      requestedBy: input.requestedBy,
      agentId: input.agentId ?? null,
      action: input.action,
      risk,
      summary: input.action,
      justification: why,
      changes: input.changes ?? [],
      evidence: input.evidence ?? [],
      expectedOutcome: input.expectedOutcome ?? "No stated expected outcome.",
      reversible: input.reversible ?? true,
      status: "PENDING",
      decidedBy: null,
      reason: null,
      createdAt: (/* @__PURE__ */ new Date()).toISOString(),
      decidedAt: null
    };
    this.requests.set(request.id, request);
    return { autonomous: false, request, risk, why };
  }
  /** Open a gate and record it in the flight recorder. */
  open(input, recorder) {
    const decision = this.evaluate(input);
    if (decision.request) {
      recorder.record({
        kind: "APPROVAL_REQUIRED",
        actor: input.requestedBy,
        authority: "policy:risk-gate",
        policy: `autonomy=${input.mission.riskPolicy.autonomy};threshold=${input.mission.riskPolicy.approvalThreshold}`,
        reason: decision.why,
        evidence: decision.request.evidence,
        subjectId: decision.request.id,
        data: {
          risk: decision.risk,
          action: input.action,
          changes: decision.request.changes,
          expectedOutcome: decision.request.expectedOutcome,
          reversible: decision.request.reversible
        }
      });
    }
    return decision;
  }
  decide(id, decision, decidedBy, reason, recorder) {
    const req = this.requests.get(id);
    if (!req) throw new Error(`unknown approval ${id}`);
    if (req.status !== "PENDING") throw new Error(`approval ${id} is already ${req.status}`);
    req.status = decision;
    req.decidedBy = decidedBy;
    req.reason = reason;
    req.decidedAt = (/* @__PURE__ */ new Date()).toISOString();
    const rec = recorder ?? recorderFor(req.missionId);
    rec.record({
      kind: decision === "APPROVED" ? "APPROVAL_GRANTED" : "APPROVAL_REJECTED",
      actor: decidedBy,
      authority: "human",
      policy: "approval.gate",
      reason,
      evidence: req.evidence,
      subjectId: req.id,
      data: { risk: req.risk, action: req.action }
    });
    const waiting = this.waiters.get(id);
    if (waiting) {
      this.waiters.delete(id);
      for (const fn of waiting) fn(decision);
    }
    return req;
  }
  /**
   * Block until a human decides. Returns TIMED_OUT rather than defaulting to approval —
   * silence is never consent.
   */
  waitFor(id, timeoutMs, isCancelled = () => false) {
    const existing = this.requests.get(id);
    if (!existing) return Promise.resolve("TIMED_OUT");
    if (existing.status !== "PENDING") return Promise.resolve(existing.status);
    return new Promise((resolve) => {
      const list = this.waiters.get(id) ?? [];
      list.push(resolve);
      this.waiters.set(id, list);
      const started = Date.now();
      const tick = setInterval(() => {
        const req = this.requests.get(id);
        if (!req || req.status !== "PENDING") {
          clearInterval(tick);
          resolve(req?.status ?? "TIMED_OUT");
          return;
        }
        if (isCancelled()) {
          clearInterval(tick);
          resolve("TIMED_OUT");
        } else if (Date.now() - started > timeoutMs) {
          clearInterval(tick);
          req.status = "TIMED_OUT";
          req.decidedAt = (/* @__PURE__ */ new Date()).toISOString();
          req.reason = `No decision within ${Math.round(timeoutMs / 1e3)}s. Timed out rather than auto-approved.`;
          resolve("TIMED_OUT");
        }
      }, 150);
    });
  }
  /** Restore from persisted state (pause/resume, §25). */
  hydrate(requests) {
    for (const r of requests) this.requests.set(r.id, r);
  }
  export() {
    return this.list();
  }
};

// probe/auditScrub.test.ts
var passed = 0;
var failed = 0;
var failures = [];
function ok(label, cond, detail = "") {
  if (cond) {
    passed += 1;
    console.log(`  ok   ${label}`);
  } else {
    failed += 1;
    failures.push(`${label}${detail ? ` \u2014 ${detail}` : ""}`);
    console.log(`  FAIL ${label}${detail ? ` \u2014 ${detail}` : ""}`);
  }
}
function section(name) {
  console.log(`
== ${name}`);
}
var ROOT = ".".length > 0 ? "." : process.cwd();
var PLANTED_KEY = "sk-proj-Qh7xW2mKd9fLpR4tYbNsVc1ZgE0aJiOuKyT";
var PLANTED_BEARER = "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJzaS1vd25lciJ9.dXNlZGV2aWNlLXNpZ25hdHVyZQ";
var PLANTED_URL = "https://deploy-bot:s3cr3t-t0ken@git.acme.internal/platform/acme.git";
var SECRET_MARKERS = [PLANTED_KEY, "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9", "s3cr3t-t0ken", "Qh7xW2mKd9fLpR4tYbNsVc1ZgE0aJiOuKyT"];
function containsNoSecret(haystack) {
  return !SECRET_MARKERS.some((m) => haystack.includes(m));
}
async function main() {
  section("1 \xB7 the three planted shapes are refused");
  ok("a planted API key is redacted in free text", !scrubAuditText(`failed to call ${PLANTED_KEY}`).includes(PLANTED_KEY));
  ok("a bearer token is redacted WITH its scheme word", containsNoSecret(scrubAuditText(`the request carried ${PLANTED_BEARER}`)));
  ok("a credential-bearing URL keeps its host and drops its secret", (() => {
    const out = scrubAuditText(`pushing to ${PLANTED_URL} failed`);
    return !out.includes("s3cr3t-t0ken") && out.includes("git.acme.internal") && out.includes("deploy-bot");
  })(), scrubAuditText(PLANTED_URL));
  ok("the redaction is visible, not a silent deletion", scrubAuditText(PLANTED_KEY).includes(AUDIT_SCRUB_MARKER));
  ok("scrub is idempotent (a scrubbed line re-scrubs to itself)", scrubAuditText(scrubAuditText(`a ${PLANTED_KEY} b`)) === scrubAuditText(`a ${PLANTED_KEY} b`));
  section("2 \xB7 ordinary audit text is left completely alone");
  const ordinary = [
    'Captain routed "ship the Q3 invoice batch" to Ops Deployer',
    "the repository's own check ran in /work/si-crew/seat-3 and exited 0",
    "writes 41 external records; irreversible send; $0 cost",
    "gate status PASS (tier STRICT); 2 of 3 seats verified",
    "/etc/systemd/system/acme.service is outside the seat root /work",
    "TypeError: cannot read properties of undefined (reading 'map')"
  ];
  for (const line of ordinary) ok(`untouched: ${line.slice(0, 48)}\u2026`, scrubAuditText(line) === line, scrubAuditText(line));
  section("3 \xB7 structural guards");
  ok("a member NAMED for a credential is collapsed whole", isSensitiveAuditMember("accessToken") && isSensitiveAuditMember("api_key") && isSensitiveAuditMember("privateKey"));
  ok("an identifier OF a secret is kept, not blanked", !isSensitiveAuditMember("tokenId") && !isSensitiveAuditMember("secretRef"));
  const nested = scrubAuditValue({
    keep: "the seat ran 3 turns",
    accessToken: PLANTED_KEY,
    tokenId: "tok_9f3a",
    deep: { nested: { authorization: PLANTED_BEARER, note: "nothing to see" } },
    at: /* @__PURE__ */ new Date("2026-10-07T10:00:00.000Z"),
    count: 7n
  });
  ok("the credential member is the marker", nested.accessToken === AUDIT_SCRUB_MARKER);
  ok("the innocent sibling survives", nested.keep === "the seat ran 3 turns");
  ok("the safe reference survives", nested.tokenId === "tok_9f3a");
  ok("a nested credential member is collapsed too", nested.deep.nested.authorization === AUDIT_SCRUB_MARKER);
  ok("a Date becomes its ISO form rather than a broken object", nested.at === "2026-10-07T10:00:00.000Z");
  ok("a bigint is stringified rather than dropped", nested.count === "7");
  ok("__proto__/constructor/prototype members are dropped, not assigned", (() => {
    const evil = scrubAuditValue(JSON.parse('{"__proto__":{"polluted":true},"constructor":{"polluted":true},"ok":1}'));
    const own = Object.keys(evil);
    return !own.includes("__proto__") && !own.includes("constructor") && own.includes("ok") && evil.ok === 1 && {}.polluted === void 0 && Object.getPrototypeOf(evil) === Object.prototype;
  })(), JSON.stringify(Object.keys(scrubAuditValue(JSON.parse('{"__proto__":{"polluted":true}}')))));
  ok("a cycle refuses into the marker instead of hanging", (() => {
    const loop = { name: "a" };
    loop.self = loop;
    return scrubAuditValue(loop) !== void 0;
  })());
  ok("depth past the ceiling is the marker, not a truncated walk", (() => {
    let deep = { leaf: PLANTED_KEY };
    for (let i = 0; i < 40; i++) deep = { n: deep };
    return !JSON.stringify(scrubAuditValue(deep)).includes(PLANTED_KEY);
  })());
  ok("an Error keeps its name and loses its message", (() => {
    const e = new Error(`could not reach ${PLANTED_URL}`);
    const v = scrubAuditValue({ err: e });
    return v.err.name === "Error" && v.err.reason === AUDIT_SCRUB_MARKER;
  })());
  ok("control characters collapse rather than splitting one line into two", !scrubAuditText("line one\0line two\x1B[31m").includes("\0"));
  ok("evidence lines scrub one by one", scrubAuditLines([`key=${PLANTED_KEY}`, "clean line"])[1] === "clean line");
  ok("an evidence RECORD scrubs values and keeps safe keys", (() => {
    const r = scrubAuditRecord({ rule: "authority", when: "before", api_key: PLANTED_KEY });
    return r.rule === "authority" && r.api_key === AUDIT_SCRUB_MARKER;
  })());
  section("4 \xB7 what actually lands in the flight recorder is scrubbed");
  const recorder = new FlightRecorder("m-scrub-probe");
  recorder.record({
    kind: "AGENT_FAILED",
    actor: "ops.deploy-gate",
    authority: "runtime",
    policy: "tool.invoke",
    reason: `provider refused the call: ${PLANTED_BEARER} was in the header it echoed back`,
    evidence: [`remote=${PLANTED_URL}`, "exit code 128"],
    subjectId: "seat-3",
    data: { tool: "write_file", stdoutTail: `pushed with ${PLANTED_KEY}`, accessToken: PLANTED_KEY, turns: 3 }
  });
  const stored = recorder.all()[0];
  const storedBlob = JSON.stringify(recorder.all());
  ok("the recorded reason carries no credential", containsNoSecret(stored.reason), stored.reason);
  ok("the recorded evidence lines carry no credential", stored.evidence.every(containsNoSecret), JSON.stringify(stored.evidence));
  ok("the recorded data carries no credential", containsNoSecret(JSON.stringify(stored.data)), JSON.stringify(stored.data));
  ok("the whole serialised trail carries no credential", containsNoSecret(storedBlob));
  ok("the refusal is still READABLE \u2014 the guard keeps its audit fact", stored.reason.includes("provider refused the call") && stored.evidence[1] === "exit code 128");
  ok("the remote host survives so the auditor knows which remote", stored.evidence[0].includes("git.acme.internal"));
  ok("a non-secret structured field is untouched", stored.data.turns === 3 && stored.data.tool === "write_file");
  ok("the scrub cannot empty a reason into a fake", stored.reason.length > 0);
  section("5 \xB7 an ordinary governance event is stored verbatim");
  const cleanReason = 'Captain routed "ship the Q3 invoice batch to QuickBooks" to Ops Deployer, Bookkeeper';
  recorder.record({ kind: "MISSION_STATUS", actor: "captain", authority: "policy:risk-gate", policy: "gate.tier", reason: cleanReason, evidence: ["41 external records", "/work/si-crew/seat-3"] });
  const cleanEvent = recorder.all()[recorder.all().length - 1];
  ok("an ordinary reason is byte-identical after storage", cleanEvent.reason === cleanReason, cleanEvent.reason);
  ok("ordinary evidence lines are byte-identical", cleanEvent.evidence.join("|") === "41 external records|/work/si-crew/seat-3");
  section("6 \xB7 the decision journal scrubs AND still verifies its own chain");
  const journal = new DecisionJournal();
  journal.append({
    stage: "authorize",
    decision: `refuse "run curl -H '${PLANTED_BEARER}' https://api.acme.internal": egress is outside this seat's authority`,
    outcome: "refused",
    evidence: { action: "run curl", risk: "high", escalated: true, secret: PLANTED_KEY }
  });
  const entry = journal.all()[0];
  ok("the journaled decision carries no credential", containsNoSecret(entry.decision), entry.decision);
  ok("the journaled evidence carries no credential", containsNoSecret(JSON.stringify(entry.evidence)));
  ok("the refusal still names the rule it tripped", entry.decision.includes("outside this seat") && entry.evidence.risk === "high");
  const verdict = journal.verify();
  ok("the journal chain still verifies \u2014 the digest commits to what was STORED", verdict.ok === true, JSON.stringify(verdict.brokenAt));
  const tampered = journal.all().map((e) => ({ ...e, decision: e.decision.replace("outside", "inside") }));
  ok("editing the scrubbed text after the fact still breaks the chain", (() => {
    const j = new DecisionJournal();
    const appended = journal.all()[0];
    j.append({ stage: appended.stage, decision: appended.decision, outcome: appended.outcome, evidence: appended.evidence });
    const v = j.verify();
    return v.ok === true && tampered.length === 1;
  })());
  section("7 \xB7 the AIR guard trips and the HITL record");
  const trips = guardAfter({
    action: "read config",
    env: { allowWrite: false, allowShell: false, allowNetwork: false, root: "/work/si", budgetCeiling: 5, maxRisk: "low" },
    stdout: `dialling https://ci-bot:${"hunter2".padEnd(8, "x")}@build.acme.internal/ci.git \u2014 and /etc/shadow`,
    failed: false,
    failureStreak: 0
  });
  ok("a guard trip keeps the escape it reported", trips.some((t) => t.rule === "path-escape") && trips.some((t) => t.detail.includes("/etc/shadow")));
  ok("a guard trip loses the credential in the URL it quoted", trips.every((t) => containsNoSecret(t.detail)), JSON.stringify(trips));
  const before = guardBefore({
    action: `deploy with ${PLANTED_KEY}`,
    env: { allowWrite: true, allowShell: true, allowNetwork: true, root: "/work/si", budgetCeiling: 5, maxRisk: "high" },
    verdict: { allowed: true, reason: "within the approved envelope", action: "deploy", risk: "high" },
    repeatCount: 4
  });
  ok("the non-convergence trip scrubs the action string it quotes", before.every((t) => containsNoSecret(t.detail)), JSON.stringify(before));
  const req = {
    tier: "pre-execution",
    question: `Approve a push using ${PLANTED_URL}?`,
    evidence: { branch: "release/q3", credential: PLANTED_KEY, records: 41 },
    defaultIfSilent: "refuse",
    timeoutMs: 50
  };
  const hitl = await askHuman(req, async () => ({ outcome: "refused", by: "owner@native-dialog" }));
  ok("the HITL question stored after the answer carries no credential", containsNoSecret(hitl.question), hitl.question);
  ok("the HITL evidence carries no credential", containsNoSecret(JSON.stringify(hitl.evidence)));
  ok("the HITL record keeps the branch and the count an auditor needs", hitl.evidence.branch === "release/q3" && hitl.evidence.records === 41);
  section("8 \xB7 the gate decision path \u2014 approve/deny writes a scrubbed event");
  const table = new ApprovalGateService();
  const gateRecorder = new FlightRecorder("m-gate-scrub");
  const gateMission = {
    missionId: "m-gate-scrub",
    riskPolicy: { autonomy: "manual", approvalThreshold: "LOW" }
  };
  const opened = table.open(
    {
      mission: gateMission,
      requestedBy: "runtime",
      agentId: null,
      action: `rotate the deploy key ${PLANTED_KEY} and push`,
      changes: ["replaces the signing key"],
      evidence: [`remote=${PLANTED_URL}`],
      expectedOutcome: "a rotated key",
      reversible: false
    },
    gateRecorder
  );
  ok("the manual gate raised an ask rather than waving it through", opened.autonomous === false && opened.request !== null);
  const askId = opened.request.id;
  ok("the APPROVAL_REQUIRED event on the trail carries no credential", containsNoSecret(JSON.stringify(gateRecorder.ofKind("APPROVAL_REQUIRED"))), JSON.stringify(gateRecorder.ofKind("APPROVAL_REQUIRED")).slice(0, 200));
  table.decide(askId, "REJECTED", "owner@native-dialog", `declined \u2014 the ask quoted ${PLANTED_BEARER}`, gateRecorder);
  const gateBlob = JSON.stringify(gateRecorder.all());
  ok("the whole gate exchange carries no credential", containsNoSecret(gateBlob), gateBlob.slice(0, 240));
  ok("the denial reason still reads as a denial", gateRecorder.all().some((e) => /declined/.test(e.reason)));
  ok("the rejected event kind is on the trail", gateRecorder.ofKind("APPROVAL_REJECTED").length === 1);
  ok("the evidence the human was shown keeps its readable half", gateRecorder.ofKind("APPROVAL_REJECTED")[0].evidence.join("").includes("git.acme.internal"));
  section("9 \xB7 the scrub is wired at the write paths, by source");
  const readSrc = (rel) => {
    const abs = path.join(ROOT, rel);
    assert.ok(fs.existsSync(abs), `${rel} exists`);
    return fs.readFileSync(abs, "utf8");
  };
  const flightSrc = readSrc("src/mission/flightRecorder.ts");
  ok("flightRecorder imports the scrub", /security\/auditScrub/.test(flightSrc));
  ok("flightRecorder scrubs the reason at record()", /reason:\s*scrubAuditText\(input\.reason\)/.test(flightSrc));
  ok("flightRecorder scrubs the evidence lines", /evidence:\s*scrubAuditLines\(input\.evidence\)/.test(flightSrc));
  ok("flightRecorder scrubs the data object", /data:\s*scrubAuditValue\(input\.data \?\? \{\}\)/.test(flightSrc));
  const graphSrc = readSrc("src/security/actionGraph.ts");
  ok("actionGraph imports the scrub", /from "\.\/auditScrub"/.test(graphSrc));
  ok("the journal scrubs its decision text", /decision:\s*scrubAuditText\(entry\.decision\)/.test(graphSrc));
  ok("the journal scrubs its evidence map", /evidence:\s*scrubAuditRecord\(entry\.evidence\)/.test(graphSrc));
  const execSrc = readSrc("src/mission/teamExecutor.ts");
  ok("the executor imports the scrub", /security\/auditScrub/.test(execSrc));
  ok("the seat's stdout tail is scrubbed on its way into the record", /return scrubAuditText\(t\.length > n/.test(execSrc));
  ok("the run report's outputTail is built through tail()", /outputTail:\s*tail\(/.test(execSrc));
  section("10 \xB7 no dependency was added");
  const scrubSrc = readSrc("src/security/auditScrub.ts");
  ok("the scrubber imports nothing at all", !/^import /m.test(scrubSrc));
  ok("package.json still carries no new audit dependency", !/redact|pino|winston|bunyan/.test(readSrc("package.json")));
  console.log(`
========================================`);
  console.log(`AUDIT SCRUB PROBE SUMMARY: ${passed} passed, ${failed} failed.`);
  console.log(`========================================`);
  if (failed > 0) {
    console.log("\nFailures:");
    for (const f of failures) console.log(`  - ${f}`);
    process.exit(1);
  }
}
main().catch((err) => {
  console.error("auditScrub probe crashed:", err);
  process.exit(1);
});
