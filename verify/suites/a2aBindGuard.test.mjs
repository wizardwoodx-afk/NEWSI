import { createRequire as __mjCreateRequire } from "node:module"; const require = __mjCreateRequire(import.meta.url);
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};

// src/security/ipClassify.ts
var init_ipClassify = __esm({
  "src/security/ipClassify.ts"() {
    "use strict";
  }
});

// src/security/guardrail.ts
var RateGate, callRateGate;
var init_guardrail = __esm({
  "src/security/guardrail.ts"() {
    "use strict";
    init_ipClassify();
    RateGate = class {
      constructor(limit, windowMs, now = () => Date.now()) {
        this.limit = limit;
        this.windowMs = windowMs;
        this.now = now;
      }
      hits = /* @__PURE__ */ new Map();
      /** Returns true when the action is within budget (and records it). */
      check(key) {
        const t = this.now();
        const arr = (this.hits.get(key) ?? []).filter((x) => t - x < this.windowMs);
        if (arr.length >= this.limit) {
          this.hits.set(key, arr);
          return false;
        }
        arr.push(t);
        this.hits.set(key, arr);
        return true;
      }
    };
    callRateGate = new RateGate(120, 6e4);
  }
});

// src/version.ts
var ENGINE_SHORT, ENGINE_CODENAME, PRODUCT_TITLE;
var init_version = __esm({
  "src/version.ts"() {
    "use strict";
    ENGINE_SHORT = "19.7";
    ENGINE_CODENAME = "SelfImpulse";
    PRODUCT_TITLE = `SelfImpulse (engine MJ ${ENGINE_SHORT} "${ENGINE_CODENAME}")`;
  }
});

// src/app/id.ts
var init_id = __esm({
  "src/app/id.ts"() {
    "use strict";
  }
});

// probe/a2aBindGuard.test.ts
import { describe, it } from "node:test";
import assert from "node:assert/strict";

// src/mission/pairing.ts
var enc = new TextEncoder();

// src/mission/a2aRuntime.ts
init_guardrail();

// src/mission/a2a.ts
init_version();
var v1Encoder = new TextEncoder();

// src/mission/selfimpulseTeams.ts
init_guardrail();
init_version();

// src/mission/capability.ts
var DEMO_COMPANY_DATA = {
  dataset: "demo.revenue-by-region",
  rows: [
    { region: "APAC", revenue: 128.4 },
    { region: "EMEA", revenue: 96.2 },
    { region: "APAC", revenue: 64.1, bonus: 2.2 },
    { region: "EMEA", revenue: 45.9, bonus: 4.1 },
    { region: "AMER", revenue: 210.7 }
  ]
};
var DEMO_POLICY = {
  dataset: DEMO_COMPANY_DATA.dataset,
  allowedFields: ["revenue", "bonus"],
  minCohortSize: 5,
  maxQueriesPerWindow: 8,
  windowMs: 10 * 60 * 1e3,
  roundTo: 0.1
};

// src/domain/harness.ts
var HARNESSES = [
  {
    id: "hermes",
    name: "Native agent (in-process)",
    bins: [],
    argv: [],
    install: "Nothing to install \u2014 the agent loop runs inside SelfImpulse on your own provider key (or a local Ollama).",
    notes: "The vendored act/observe/adjust loop. Every crew seat runs here, so every action carries one audited receipt format and the trust story has no third party in it.",
    source: "src/engine/hermesRuntime.ts"
  },
  {
    id: "llm",
    name: "Direct LLM (API / Ollama)",
    bins: [],
    argv: [],
    install: "Save a provider key in Settings \u2192 Providers, or run Ollama locally",
    notes: "Not an agent loop. Calls the chat API with the composed agent prompt \u2014 the direct seam under the native runner."
  }
];
var HARNESS_BY_ID = new Map(HARNESSES.map((h) => [h.id, h]));
var HARNESS_OPTIONS = HARNESSES.map((h) => h.id);

// src/mission/agentCapabilities.ts
var AGENT_CAPABILITIES = {
  hermes: {
    id: "hermes",
    name: "Hermes Runtime",
    // 19.7.15: hermes is IN-PROCESS. It has no binary, is not a stdio child,
    // and takes no argv. These two lines used to describe a subprocess that
    // does not exist; every caller that read them was reasoning about a seat
    // that could not run.
    bins: [],
    install: "bundled with SelfImpulse; runs in-process (src/engine/hermesRuntime.ts) \u2014 no binary, no argv",
    prompt: { argv: [], confidence: "docs", source: "in-process runtime: no argv exists by construction" },
    json: null,
    readOnly: null,
    write: null,
    fullAuto: null,
    maxTurns: null,
    timeout: null,
    outputSchema: null,
    worktree: null,
    cwd: null,
    model: null,
    resume: null,
    sessionStart: null,
    noAutoUpdate: null,
    filters: null,
    cost: null,
    enforcedReadOnly: false,
    gotchas: ["No enforced sandbox, so a hermes seat must never be assigned HIGH or CRITICAL risk."]
  },
  llm: {
    id: "llm",
    name: "Direct LLM",
    bins: [],
    install: "no binary; SelfImpulse calls the provider API directly",
    // In-process API call: there is no command line, and the empty argv says so
    // rather than a fake ["$PROMPT"] that would read as a spawnable command.
    prompt: { argv: [], confidence: "docs", source: "in-process API call: no argv exists by construction" },
    json: null,
    readOnly: null,
    write: null,
    fullAuto: null,
    maxTurns: null,
    timeout: null,
    outputSchema: null,
    worktree: null,
    cwd: null,
    model: null,
    resume: null,
    sessionStart: null,
    noAutoUpdate: null,
    filters: null,
    cost: null,
    enforcedReadOnly: false,
    gotchas: ["No filesystem access and no enforced sandbox. Useful for reasoning, useless for edits."]
  }
};
var EXECUTABLE_HARNESSES = Object.keys(AGENT_CAPABILITIES).filter(
  (id) => AGENT_CAPABILITIES[id].bins.length > 0
);

// src/mission/agentTeam.ts
var SCHEMA_VERSION = 1;
var seat = (id, role, harness, over = {}) => ({
  id,
  role,
  harness,
  model: null,
  mayWrite: role === "coder" || role === "debugger",
  maxRisk: role === "coder" || role === "debugger" ? "MEDIUM" : "LOW",
  timeoutSecs: 900,
  maxTurns: null,
  instructions: "",
  ...over
});
var PREBUILT_TEAMS = [
  {
    id: "team.balanced",
    name: "Balanced",
    description: "Plan, build, test, review. One vendor writes, a second reviews \u2014 so the review is not the author grading its own work.",
    schemaVersion: SCHEMA_VERSION,
    budgetUsd: null,
    createdAt: (/* @__PURE__ */ new Date()).toISOString(),
    updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    revision: 1,
    seats: [
      seat("planner", "planner", "hermes", { mayWrite: false, maxRisk: "LOW", instructions: "Break the objective into steps small enough to verify individually." }),
      seat("architect", "architect", "hermes", { mayWrite: false, maxRisk: "LOW" }),
      seat("impl", "coder", "hermes", { mayWrite: true, maxRisk: "MEDIUM", instructions: "Implement the change. Touch only what the task requires." }),
      seat("synthesizer", "synthesizer", "hermes", { mayWrite: false, maxRisk: "LOW" }),
      seat("test", "tester", "llm", { mayWrite: false, maxRisk: "LOW", instructions: "Run the repository's own checks and report what failed." }),
      seat("reviewer", "reviewer", "llm", { mayWrite: false, maxRisk: "LOW", model: "reviewer-tier", instructions: "Review the diff. Say what is wrong, not what is fine. Run on a different model from the writer \u2014 a reviewer on the writer's own weights is not independent evidence." }),
      seat("security", "security", "llm", { mayWrite: false, maxRisk: "LOW", instructions: "Check for security vulnerabilities." })
    ]
  },
  {
    id: "team.adversarial",
    name: "Adversarial",
    description: "Deliberately independent reviewers. Every writer is reviewed by a different model, because agreement between two seats running the same weights is weaker evidence than agreement across models.",
    schemaVersion: SCHEMA_VERSION,
    budgetUsd: null,
    createdAt: (/* @__PURE__ */ new Date()).toISOString(),
    updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    revision: 1,
    seats: [
      seat("planner", "planner", "hermes", { mayWrite: false, maxRisk: "LOW" }),
      seat("impl", "coder", "hermes", { mayWrite: true, maxRisk: "MEDIUM" }),
      seat("test", "tester", "llm", { mayWrite: false, maxRisk: "LOW", instructions: "Prove the change works or find the case where it does not." }),
      seat("reviewer", "reviewer", "llm", { mayWrite: false, maxRisk: "LOW", model: "reviewer-tier", instructions: "Review independently, on a different model from the writer." }),
      seat("security", "security", "llm", { mayWrite: false, maxRisk: "LOW", instructions: "Look only for injection, secret leakage and unsafe deserialisation." }),
      seat("synthesizer", "synthesizer", "hermes", { mayWrite: false, maxRisk: "LOW", instructions: "Reconcile the verdicts into one decision." })
    ]
  },
  {
    id: "team.powerhouse",
    name: "Cross-Vendor Powerhouse",
    description: "One governed crew, every seat on the native in-process runtime: plans, architects, builds, debugs, tests, reviews and synthesizes \u2014 each seat pointed at its own model, each action receipted through the same gate.",
    schemaVersion: SCHEMA_VERSION,
    budgetUsd: null,
    createdAt: (/* @__PURE__ */ new Date()).toISOString(),
    updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    revision: 1,
    seats: [
      seat("planner", "planner", "hermes", { mayWrite: false, maxRisk: "LOW", instructions: "Formulate the execution plan and criteria." }),
      seat("architect", "architect", "hermes", { mayWrite: false, maxRisk: "LOW", instructions: "Design component interfaces and data schemas." }),
      seat("coder", "coder", "hermes", { mayWrite: true, maxRisk: "MEDIUM", instructions: "Implement core logic and tests in isolated worktree." }),
      seat("debugger", "debugger", "hermes", { mayWrite: true, maxRisk: "MEDIUM", instructions: "Diagnose edge cases and optimize performance." }),
      seat("tester", "tester", "llm", { mayWrite: false, maxRisk: "LOW", instructions: "Run test suites and fuzz edge cases." }),
      seat("reviewer", "reviewer", "llm", { mayWrite: false, maxRisk: "LOW", instructions: "Conduct independent peer review against the snapshot merge." }),
      seat("synthesizer", "synthesizer", "hermes", { mayWrite: false, maxRisk: "LOW", instructions: "Reconcile findings into final release notes." })
    ]
  },
  {
    id: "team.solo",
    name: "Solo",
    description: "One seat. Cheap, fast, and the review is advisory only \u2014 an author grading its own work is not a review.",
    schemaVersion: SCHEMA_VERSION,
    budgetUsd: null,
    createdAt: (/* @__PURE__ */ new Date()).toISOString(),
    updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    revision: 1,
    seats: [seat("impl", "coder", "hermes", { mayWrite: true, maxRisk: "MEDIUM", instructions: "Implement and self-check." })]
  },
  {
    id: "team.audit",
    name: "Read-only audit",
    description: "No seat may write. For answering 'what is wrong with this code?' without risking a change.",
    schemaVersion: SCHEMA_VERSION,
    budgetUsd: null,
    createdAt: (/* @__PURE__ */ new Date()).toISOString(),
    updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    revision: 1,
    seats: [
      seat("reviewer", "reviewer", "llm", { mayWrite: false, maxRisk: "LOW", model: "reviewer-tier", instructions: "Review independently, on a different model from the writer." }),
      seat("security", "security", "llm", { mayWrite: false, maxRisk: "LOW" })
    ]
  }
];
var TEAM_BY_ID = new Map(PREBUILT_TEAMS.map((t) => [t.id, t]));

// src/mission/caps.ts
var DEFAULT_CAPS = { timeoutMs: 10 * 60 * 1e3, maxTurns: 40, maxCostUsd: 5 };
var INBOUND_DELEGATION_CAPS = {
  maxCostUsd: 2,
  maxTurns: 40,
  maxInvocations: 4,
  maxWallClockMs: 30 * 6e4
};

// src/mission/interAgentChannel.ts
var InterAgentMessageBus = class {
  messages = [];
  blackboard = /* @__PURE__ */ new Map();
  listeners = /* @__PURE__ */ new Set();
  blackboardListeners = /* @__PURE__ */ new Set();
  seqCounter = 0;
  constructor(initialMessages = []) {
    this.messages = [...initialMessages];
    this.seqCounter = initialMessages.length;
  }
  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  subscribeBlackboard(listener) {
    this.blackboardListeners.add(listener);
    return () => this.blackboardListeners.delete(listener);
  }
  publish(msg) {
    const nextSeq = ++this.seqCounter;
    const full = {
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      sequence: nextSeq,
      seq: nextSeq,
      replyToId: msg.replyToId,
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      channel: msg.channel,
      sender: msg.sender,
      mentions: msg.mentions ?? [],
      intent: msg.intent,
      content: msg.content,
      data: msg.data
    };
    this.messages.push(full);
    for (const listener of this.listeners) {
      try {
        listener(full);
      } catch (err) {
        console.error("Inter-agent bus listener error:", err);
      }
    }
    return full;
  }
  getMessages(filter) {
    if (!filter) return [...this.messages];
    if (typeof filter === "string") {
      if (filter === "#all") return [...this.messages];
      return this.messages.filter((m) => m.channel === filter);
    }
    return this.messages.filter((m) => {
      if (filter.channel && filter.channel !== "#all" && m.channel !== filter.channel) return false;
      if (filter.sender && m.sender.seatId !== filter.sender) return false;
      if (filter.mention) {
        const target = filter.mention.startsWith("@") ? filter.mention : `@${filter.mention}`;
        const hasDirect = m.mentions.includes(target) || m.mentions.includes("@all");
        const mentionsInText = m.content.includes(target);
        if (!hasDirect && !mentionsInText) return false;
      }
      return true;
    });
  }
  getThread(messageId) {
    const root = this.messages.find((m) => m.id === messageId);
    if (!root) return [];
    const thread = [root];
    const queue = [root.id];
    while (queue.length > 0) {
      const currentId = queue.shift();
      const replies = this.messages.filter((m) => m.replyToId === currentId && !thread.some((t) => t.id === m.id));
      for (const reply of replies) {
        thread.push(reply);
        queue.push(reply.id);
      }
    }
    return thread.sort((a, b) => a.sequence - b.sequence);
  }
  writeBlackboard(key, value, author, category) {
    const existing = this.blackboard.get(key);
    const entry = {
      key,
      author,
      updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
      category,
      value,
      version: (existing?.version ?? 0) + 1
    };
    this.blackboard.set(key, entry);
    for (const listener of this.blackboardListeners) {
      try {
        listener(entry);
      } catch (err) {
        console.error("Blackboard listener error:", err);
      }
    }
    return entry;
  }
  readBlackboard(key) {
    return this.blackboard.get(key) ?? null;
  }
  getBlackboard() {
    return Array.from(this.blackboard.values());
  }
  clear() {
    this.messages = [];
    this.blackboard.clear();
    this.seqCounter = 0;
  }
};
var globalAgentBus = new InterAgentMessageBus();

// src/mission/organizationalMemory.ts
var SEED_INVARIANTS = [
  {
    id: "inv-001-worktree-isolation",
    category: "sandbox",
    rule: "Writing agents must never write directly into the base repository checkout; all edits must be staged in private sibling worktrees.",
    originatingMissionId: "mission-init-01",
    failureObserved: "Base checkout dirty with untracked files before reviewer execution.",
    verifiedRepairAction: "Allocated dedicated git worktrees per writing seat under vh/<mission>/<seatId>.",
    timesApplied: 34,
    successRate: 1,
    active: true
  },
  {
    id: "inv-002-snapshot-peer-review",
    category: "testing",
    rule: "Reviewers must inspect a synthesized merge snapshot branch (--no-ff) containing all writer commits, not the untouched base checkout.",
    originatingMissionId: "mission-init-02",
    failureObserved: "Reviewer passed code without seeing newly written features.",
    verifiedRepairAction: "Built temporary review snapshot branch vh/<mission>/review before wave 3 review runs.",
    timesApplied: 28,
    successRate: 1,
    active: true
  },
  {
    id: "inv-003-async-token-bucket",
    category: "concurrency",
    rule: "Token bucket rate limiters must acquire an atomic reservation lock before consuming burst tokens in async handlers.",
    originatingMissionId: "mission-payment-04",
    failureObserved: "Parallel request burst drained bucket below zero.",
    verifiedRepairAction: "Wrapped token consumption in atomic reservation promise.",
    timesApplied: 12,
    successRate: 0.95,
    active: true
  }
];
var OrganizationalMemoryCortex = class {
  invariants = /* @__PURE__ */ new Map();
  constructor(initial = SEED_INVARIANTS) {
    for (const inv of initial) {
      this.invariants.set(inv.id, inv);
    }
  }
  recordRepairSuccess(category, failureObserved, verifiedRepairAction, missionId, rule) {
    const id = `inv-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const invariant = {
      id,
      category,
      rule,
      originatingMissionId: missionId,
      failureObserved,
      verifiedRepairAction,
      timesApplied: 1,
      successRate: 1,
      active: true
    };
    this.invariants.set(id, invariant);
    globalAgentBus.writeBlackboard(
      `cortex.invariants.${id}`,
      `Rule: ${rule}
Origin: ${missionId}
Action: ${verifiedRepairAction}`,
      "memory_cortex",
      "architecture"
    );
    return invariant;
  }
  compileBriefing() {
    const active = Array.from(this.invariants.values()).filter((i) => i.active);
    const cortexId = `cortex-${Date.now()}`;
    const lines = [
      "# ORGANIZATIONAL MEMORY & LEARNED INVARIANTS",
      `<!-- Auto-compiled by VH Memory Cortex for Mission Execution (${(/* @__PURE__ */ new Date()).toISOString()}) -->`,
      "",
      "The following architectural invariants were derived from past empirical failures and proven repairs:",
      ""
    ];
    for (const inv of active) {
      lines.push(`### [${inv.category.toUpperCase()}] ${inv.rule}`);
      lines.push(`- **Failure Observed**: ${inv.failureObserved}`);
      lines.push(`- **Proven Repair**: ${inv.verifiedRepairAction}`);
      lines.push(`- **Historical Reliability**: ${(inv.successRate * 100).toFixed(0)}% across ${inv.timesApplied} runs`);
      lines.push("");
    }
    const generatedBriefingMarkdown = lines.join("\n");
    const agentsMdInjections = active.map((i) => `MUST OBEY: ${i.rule}`);
    return {
      cortexId,
      invariantsCompiled: active.length,
      activeRules: active,
      generatedBriefingMarkdown,
      agentsMdInjections
    };
  }
  getInvariants() {
    return Array.from(this.invariants.values());
  }
};
var globalMemoryCortex = new OrganizationalMemoryCortex();

// src/mission/selfEvolveRuntime.ts
init_version();

// src/mission/consensusEngine.ts
var AgentReputationLedger = class {
  ledger = /* @__PURE__ */ new Map();
  constructor() {
    const harnesses = ["hermes", "llm"];
    for (const h of harnesses) {
      this.ledger.set(h, {
        seatId: h,
        harness: h,
        missionsParticipated: 0,
        verifiedCommits: 0,
        accurateReviews: 0,
        falseAlarms: 0,
        reputationWeight: 1
        // Neutral 1.0 baseline
      });
    }
  }
  getReputation(harnessOrSeatId) {
    return this.ledger.get(harnessOrSeatId) ?? {
      seatId: harnessOrSeatId,
      harness: "llm",
      missionsParticipated: 0,
      verifiedCommits: 0,
      accurateReviews: 0,
      falseAlarms: 0,
      reputationWeight: 1
    };
  }
  recordOutcome(harnessOrSeatId, result) {
    const rep = this.getReputation(harnessOrSeatId);
    rep.missionsParticipated++;
    if (result.verifiedCommit) rep.verifiedCommits++;
    if (result.accurateReview) rep.accurateReviews++;
    if (result.falseAlarm) rep.falseAlarms++;
    const delta = rep.accurateReviews * 0.05 + rep.verifiedCommits * 0.05 - rep.falseAlarms * 0.1;
    rep.reputationWeight = Math.min(2, Math.max(0.5, 1 + delta));
    this.ledger.set(harnessOrSeatId, rep);
    return rep;
  }
  getAll() {
    return Array.from(this.ledger.values());
  }
};
var globalReputationLedger = new AgentReputationLedger();
var INITIAL_REPUTATIONS = Object.fromEntries(
  globalReputationLedger.getAll().map((r) => [r.harness, r])
);

// src/mission/receipts.ts
var enc2 = new TextEncoder();

// src/mission/a2aBridge.ts
init_version();
init_id();

// src/mission/a2aClient.ts
init_guardrail();

// src/mission/a2aV10.ts
var enc3 = new TextEncoder();

// src/mission/selfimpulseTeams.ts
var PACKET_TTL_MS = 10 * 60 * 1e3;
var REPLAY_REGISTRY_CAP = 4096;
var ReplayRegistry = class {
  constructor(cap) {
    this.cap = cap;
  }
  settled = /* @__PURE__ */ new Map();
  /** Claim an id for exactly one decision. Null when claimed; a reason when not. */
  claim(id, now = Date.now()) {
    for (const [k, at] of [...this.settled]) if (now - at > PACKET_TTL_MS) this.settled.delete(k);
    if (this.settled.has(id)) return `already decided (${this.settled.size} settled within the packet TTL) \u2014 replay refused`;
    if (this.settled.size >= this.cap) {
      return `the replay registry is full (${this.cap} unsettled decisions inside the packet TTL) \u2014 refusing rather than forgetting a live one, because forgetting one is what lets a captured packet replay`;
    }
    this.settled.set(id, now);
    return null;
  }
};
var decidedDelegations = new ReplayRegistry(REPLAY_REGISTRY_CAP);
var decidedInbound = new ReplayRegistry(REPLAY_REGISTRY_CAP);

// src/mission/a2aServer.ts
init_guardrail();
init_guardrail();
var MAX_BODY_BYTES = 1024 * 1024;
var ALTERSEND_MAX_BODY = 48 * 1024 * 1024;

// src/mission/altersend.ts
var DEFAULT_LIMITS = {
  maxFileBytes: 32 * 1024 * 1024,
  maxStoreBytes: 256 * 1024 * 1024,
  maxFiles: 64,
  maxNameLength: 120,
  ttlMs: 60 * 60 * 1e3
};

// src/mission/a2aRuntime.ts
init_version();
var LOOPBACK_HOSTS = /* @__PURE__ */ new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);
function isWildcardHost(host) {
  const h = host.trim().toLowerCase().replace(/^\[|\]$/g, "");
  if (h === "*" || h === "0.0.0.0" || h === "::" || h === "0:0:0:0:0:0:0:0") return true;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h)) {
    const parts = h.split(".").map(Number);
    if (parts.every((p) => p >= 0 && p <= 255)) return parts.slice(1).every((p) => p === 0);
  }
  return false;
}
function resolveBindHost(requested) {
  const raw = (requested ?? "127.0.0.1").trim();
  if (raw === "") return "127.0.0.1";
  const lower = raw.toLowerCase();
  if (LOOPBACK_HOSTS.has(lower)) return "127.0.0.1";
  if (lower === "lan" || lower === "local" || lower === "loopback") {
    if (lower === "loopback" || lower === "local") return "127.0.0.1";
    throw new Error(
      `a2a: "lan" must be resolved to a concrete address before it reaches the runtime. Pass this machine's actual LAN IP (for example 192.168.1.20). The runtime refuses names and wildcards because neither names one specific interface.`
    );
  }
  if (isWildcardHost(raw)) {
    throw new Error(
      `a2a: refusing to bind "${raw}". A wildcard bind exposes this listener on every interface the machine has \u2014 including ones the operator never chose. Use 127.0.0.1 for this machine only, or a concrete LAN address such as 192.168.1.20.`
    );
  }
  const looksLikeIpv4 = /^\d{1,3}(\.\d{1,3}){3}$/.test(raw);
  const looksLikeIpv6 = raw.includes(":");
  if (!looksLikeIpv4 && !looksLikeIpv6) {
    throw new Error(
      `a2a: "${raw}" is neither loopback nor a concrete IP address. Bind 127.0.0.1, or pass the exact LAN address of this machine. Names are refused because a name can resolve anywhere.`
    );
  }
  return raw;
}

// probe/a2aBindGuard.test.ts
describe("a2a \u2014 bind scope cannot be a wildcard", () => {
  it("refuses 0.0.0.0 (the exploit)", () => {
    assert.throws(() => resolveBindHost("0.0.0.0"), /wildcard/i);
  });
  it("refuses ::, *, and the expanded zero form", () => {
    for (const h of ["::", "*", "0:0:0:0:0:0:0:0", "[::]"]) {
      assert.throws(() => resolveBindHost(h), /wildcard|refusing/i, `refused to refuse ${h}`);
    }
  });
  it("refuses the whole-network forms too", () => {
    for (const h of ["1.0.0.0", "10.0.0.0"]) {
      assert.throws(() => resolveBindHost(h), /wildcard|refusing/i, `refused to refuse ${h}`);
    }
  });
  it("a concrete network address is NOT treated as a wildcard", () => {
    assert.equal(resolveBindHost("192.168.0.0"), "192.168.0.0");
  });
  it("accepts loopback, including the aliases", () => {
    for (const h of ["127.0.0.1", "localhost", "::1", void 0, "", "  "]) {
      assert.equal(resolveBindHost(h), "127.0.0.1");
    }
  });
  it("accepts a CONCRETE lan address \u2014 the documented feature still works", () => {
    assert.equal(resolveBindHost("192.168.1.20"), "192.168.1.20");
    assert.equal(resolveBindHost("10.1.2.3"), "10.1.2.3");
  });
  it("refuses a hostname: a name can resolve anywhere", () => {
    assert.throws(() => resolveBindHost("my-host.local"), /concrete IP address/i);
  });
  it("refuses 'lan' rather than pretending, and says what to pass", () => {
    assert.throws(() => resolveBindHost("lan"), /concrete address/i);
  });
});
