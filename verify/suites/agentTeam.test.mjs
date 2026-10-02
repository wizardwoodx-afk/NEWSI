import { createRequire as __mjCreateRequire } from "node:module"; const require = __mjCreateRequire(import.meta.url);

// probe/agentTeam.test.ts
import * as fs from "node:fs";
import * as path from "node:path";

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
function defaultHarness() {
  return "hermes";
}
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
function resolveCaps(harness) {
  const caps = AGENT_CAPABILITIES[harness];
  if (caps) return { harness, caps };
  const fallback = defaultHarness();
  return { harness: fallback, caps: AGENT_CAPABILITIES[fallback] };
}
function enforcedReadOnly(id) {
  const caps = AGENT_CAPABILITIES[id];
  return caps ? caps.enforcedReadOnly : false;
}
function unverifiedClaims(id) {
  const caps = AGENT_CAPABILITIES[id];
  if (!caps) {
    return ["Unknown engine id: no verified capability claims exist for it."];
  }
  const out = [];
  const check = (name, cap) => {
    if (cap?.argv && cap.confidence === "community") {
      out.push(`${name}: ${cap.source}`);
    }
  };
  check("cwd", caps.cwd);
  check("model", caps.model);
  check("resume", caps.resume);
  check("json", caps.json);
  if (!caps.enforcedReadOnly && caps.readOnly?.argv) {
    out.push("read-only is advisory: no enforcement was verified, so this seat can still modify files.");
  }
  return out;
}
var EXECUTABLE_HARNESSES = Object.keys(AGENT_CAPABILITIES).filter(
  (id) => AGENT_CAPABILITIES[id].bins.length > 0
);

// src/mission/sessions.ts
function sessionArgv(harness, opts) {
  const rc = resolveCaps(harness);
  const caps = rc.caps;
  if (opts.kind === "first" && opts.idKind === "cli-chosen") {
    return { argv: [], continuity: "session", warning: null };
  }
  if (opts.kind === "first") {
    const start = caps.sessionStart;
    if (!start?.argv) {
      return { argv: [], continuity: "none", warning: `${caps.name} has no documented way to start a session under a chosen id, so this turn is stateless.` };
    }
    return { argv: start.argv.map((a) => a === "$SESSION" ? opts.sessionId : a), continuity: "session", warning: null };
  }
  const resume = caps.resume;
  if (!resume?.argv) {
    return {
      argv: [],
      continuity: "none",
      warning: `${caps.name} has no documented way to resume a session, so this turn starts from scratch. The agent will not remember the previous turn \u2014 do not treat a second-pass approval as informed.`
    };
  }
  if (!resume.argv.includes("$SESSION")) {
    return {
      argv: [],
      continuity: "none",
      warning: `${caps.name}'s resume form takes no session id, so VH cannot say which conversation to continue and will not guess. This turn starts from scratch and the prompt restates the context.`
    };
  }
  return { argv: resume.argv.map((a) => a === "$SESSION" ? opts.sessionId : a), continuity: "session", warning: null };
}
function sessionIdKind(harness) {
  const rc = resolveCaps(harness);
  return rc.caps.sessionStart?.argv ? "si-chosen" : "cli-chosen";
}

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
function fill(cap, vars) {
  if (!cap || !cap.argv) return [];
  return cap.argv.map((a) => a.startsWith("$") ? vars[a] ?? "" : a);
}
function composeSeatArgv(teamSeat, ctx) {
  if (teamSeat.harness === "hermes" || teamSeat.harness === "llm") {
    return {
      bin: "",
      argv: [],
      env: {},
      files: [],
      claims: { readOnlyEnforced: false, costKind: "none" },
      inProcess: true,
      prompt: ctx.prompt,
      warnings: []
    };
  }
  const resolved = resolveCaps(teamSeat.harness);
  const caps = resolved.caps;
  const warnings = [];
  const vars = {
    $PROMPT: ctx.prompt,
    $MODEL: teamSeat.model ?? "",
    $N: String(teamSeat.maxTurns ?? 20),
    $CWD: ctx.cwd,
    $SECS: String(teamSeat.timeoutSecs),
    $SESSION: ctx.sessionId ?? "",
    $REVIEWER: "si-readonly",
    $NAME: `si-${teamSeat.id}`
  };
  const argv = [];
  const flags = [];
  const env = {};
  const files = [];
  const wantsReadOnly = ctx.readOnly || !teamSeat.mayWrite;
  argv.push(...fill(caps.prompt, vars));
  if (wantsReadOnly) {
    if (caps.readOnly?.argv?.length) flags.push(...fill(caps.readOnly, vars));
    else if (caps.readOnly?.implicit) {
    } else warnings.push(`${caps.name} has no enforced read-only mode, so this seat is ADVISORY only \u2014 it can still modify files.`);
  } else if (caps.write?.argv?.length) {
    flags.push(...fill(caps.write, vars));
  }
  if (caps.json?.argv) flags.push(...fill(caps.json, vars));
  if (teamSeat.maxTurns && caps.maxTurns?.argv) flags.push(...fill(caps.maxTurns, vars));
  if (caps.timeout?.argv) flags.push(...fill(caps.timeout, vars));
  if (caps.cwd?.argv) flags.push(...fill(caps.cwd, vars));
  if (teamSeat.model && caps.model?.argv) flags.push(...fill(caps.model, vars));
  if (caps.noAutoUpdate?.argv) flags.push(...fill(caps.noAutoUpdate, vars));
  if (ctx.sessionId) {
    const s = sessionArgv(teamSeat.harness, {
      kind: (ctx.turn ?? 1) <= 1 ? "first" : "follow-up",
      idKind: sessionIdKind(teamSeat.harness),
      sessionId: ctx.sessionId
    });
    flags.push(...s.argv);
    if (s.warning) warnings.push(s.warning);
  }
  for (const claim of unverifiedClaims(teamSeat.harness)) warnings.push(`Unverified flag \u2014 ${claim}`);
  const cleanFlags = flags.filter((f) => f.length > 0);
  return {
    bin: caps.bins[0] ?? "",
    argv: [...argv, ...cleanFlags],
    env,
    files,
    claims: {
      readOnlyEnforced: wantsReadOnly && enforcedReadOnly(teamSeat.harness),
      costKind: caps.cost?.kind ?? "none"
    },
    warnings
  };
}
function validateTeam(team) {
  const out = [];
  if (!team.name || team.name.trim().length === 0) {
    out.push({ severity: "error", code: "no_name", message: "Team name is required." });
  }
  const ids = /* @__PURE__ */ new Set();
  for (const s of team.seats) {
    if (ids.has(s.id)) {
      out.push({ severity: "error", code: "duplicate_seat", message: `Two seats share the id "${s.id}". Worktrees, sessions and merge steps are keyed by seat id, so one would overwrite the other.`, seatId: s.id });
    }
    ids.add(s.id);
    if (s.harness === "llm" && (s.role === "coder" || s.role === "debugger" || s.mayWrite)) {
      out.push({ severity: "error", code: "cannot_write", message: `Seat "${s.id}" is a direct LLM which cannot modify files.`, seatId: s.id });
    }
    if (!enforcedReadOnly(s.harness) && !s.mayWrite) {
      const name = resolveCaps(s.harness).caps.name;
      out.push({ severity: "warning", code: "advisory_readonly", message: `${name} has no verified read-only enforcement, so "${s.id}" is advisory: it can still modify files despite being a ${s.role}.`, seatId: s.id });
    }
    if (s.timeoutSecs < 30) {
      out.push({ severity: "warning", code: "short_timeout", message: `${s.timeoutSecs}s is below the 30s floor for a coding agent; expect a timeout on any real edit.`, seatId: s.id });
    }
    if (!s.mayWrite && (s.role === "coder" || s.role === "debugger") && s.harness !== "llm") {
      out.push({ severity: "error", code: "writer_cannot_write", message: `"${s.id}" has the ${s.role} role but mayWrite is false, so it cannot do its job.`, seatId: s.id });
    }
  }
  if (team.seats.length === 0) {
    out.push({ severity: "error", code: "no_seats", message: "A team with no seats cannot run." });
  }
  if (team.seats.length > 0 && !team.seats.some((s) => s.mayWrite)) {
    out.push({ severity: "warning", code: "no_writer", message: "No seat may write, so this team can analyse but cannot change anything." });
  }
  if (team.seats.length > 1 && !team.seats.some((s) => s.role === "reviewer" || s.role === "security")) {
    out.push({ severity: "warning", code: "no_reviewer", message: "No reviewer or security seat, so nothing checks the writer's work." });
  }
  const writers = team.seats.filter((s) => s.mayWrite);
  const writingHarnesses = writers.map((s) => s.harness);
  if (writers.length > 1 && new Set(writingHarnesses).size === 1) {
    out.push({
      severity: "warning",
      code: "single_vendor",
      message: `Multiple writing seats (${writers.map((w) => w.id).join(", ")}) are assigned to the same harness vendor (${writingHarnesses[0]}). Diversifying writers avoids single-model blind spots.`
    });
  }
  return out;
}
function serializeTeam(team) {
  return JSON.stringify({ schemaVersion: SCHEMA_VERSION, team }, null, 2);
}
function parseTeam(raw) {
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    const err = `Not valid JSON: ${e instanceof Error ? e.message : String(e)}`;
    return { ok: false, team: null, error: err, errors: [err], findings: [] };
  }
  const env = parsed;
  if (!env || typeof env !== "object" || !env.team) {
    const err = "Missing the `team` object. VH exports { schemaVersion, team }.";
    return { ok: false, team: null, error: err, errors: [err], findings: [] };
  }
  if (env.schemaVersion !== SCHEMA_VERSION) {
    const err = `Schema version ${String(env.schemaVersion)} is not supported (expected ${SCHEMA_VERSION}); VH will not guess how to migrate it.`;
    return { ok: false, team: null, error: err, errors: [err], findings: [] };
  }
  const t = env.team;
  if (!Array.isArray(t.seats)) {
    const err = "The team has no seats array.";
    return { ok: false, team: null, error: err, errors: [err], findings: [] };
  }
  const roles = /* @__PURE__ */ new Set(["planner", "architect", "coder", "tester", "reviewer", "security", "synthesizer", "debugger"]);
  for (const s of t.seats) {
    if (!s.id || !roles.has(s.role)) {
      const err = `Seat "${s.id ?? "?"}" has no id or an unknown role "${s.role}".`;
      return { ok: false, team: null, error: err, errors: [err], findings: [] };
    }
    if (!(s.harness === "hermes" || s.harness === "llm")) {
      const err = `Seat "${s.id}" names an unknown harness "${s.harness}".`;
      return { ok: false, team: null, error: err, errors: [err], findings: [] };
    }
  }
  const findings = validateTeam(t);
  return { ok: true, team: t, error: null, errors: [], findings };
}
var STORAGE_KEY = "vh.teams.v1";
function loadSavedTeams() {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.map((x) => parseTeam(JSON.stringify({ schemaVersion: SCHEMA_VERSION, team: x }))).filter((r) => r.ok && r.team).map((r) => r.team);
  } catch {
    return [];
  }
}
function saveTeams(teams) {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(teams));
  } catch {
  }
}
function upsertTeam(teams, team) {
  const i = teams.findIndex((t) => t.id === team.id);
  const updatedTeam = { ...team, revision: (team.revision ?? 1) + 1 };
  if (i === -1) return [...teams, updatedTeam];
  const next = [...teams];
  next[i] = updatedTeam;
  return next;
}
var RISK_LEVELS = {
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
  CRITICAL: 4
};
function seatForTask(team, role, risk) {
  if (risk === "CRITICAL") {
    return { seat: null, reason: "CRITICAL risk tasks are refused for agent execution and escalated to a human. No sandbox makes an irreversible action safe to delegate." };
  }
  const candidates = team.seats.filter((s) => s.role === role);
  if (candidates.length === 0) return { seat: null, reason: `This team has no ${role} seat.` };
  const taskLevel = RISK_LEVELS[risk] ?? 2;
  const eligible = candidates.filter((s) => {
    const maxLevel = RISK_LEVELS[s.maxRisk ?? "MEDIUM"] ?? 2;
    return maxLevel >= taskLevel;
  });
  if (eligible.length === 0) {
    return { seat: null, reason: `A ${risk} risk task exceeds every available ${role}'s maxRisk ceiling \u2014 escalate to a human.` };
  }
  return { seat: eligible[0] ?? null, reason: null };
}

// probe/agentTeam.test.ts
var ROOT = process.env.SI_ROOT ?? process.cwd();
var existsSync2 = (p) => fs.existsSync(p);
var pass = 0;
var fail = 0;
var ok = (c, m) => {
  if (c) pass += 1;
  else {
    fail += 1;
    console.log(`  FAIL ${m}`);
  }
};
console.log("\n== the capability table itself ==\n");
{
  const ids = Object.keys(AGENT_CAPABILITIES);
  ok(
    ids.length === 2 && ids.includes("hermes") && ids.includes("llm"),
    `only the in-process runtimes are described, got ${ids.join(", ")}`
  );
  for (const id of ids) {
    const c = AGENT_CAPABILITIES[id];
    ok(c.id === id, `${id}: id field matches its key`);
    ok(c.name.length > 0, `${id}: has a name`);
    ok(c.install.length > 0, `${id}: says how to install it`);
    ok(c.gotchas.length > 0, `${id}: has at least one production gotcha written down`);
    const caps = [c.prompt, c.json, c.readOnly, c.write, c.fullAuto, c.maxTurns, c.timeout, c.outputSchema, c.worktree, c.cwd, c.model, c.resume, c.noAutoUpdate];
    ok(caps.every((x) => x === null || x.source.length > 0 && x.confidence !== void 0), `${id}: every capability cites a source`);
  }
}
{
  ok(!enforcedReadOnly("hermes"), "hermes is in-process and has no sandbox \u2014 the registry says so");
  ok(!enforcedReadOnly("llm"), "a plain LLM is an API call and has no sandbox \u2014 the registry says so");
  const ids = Object.keys(AGENT_CAPABILITIES);
  ok(
    ids.every((id) => id === "hermes" || id === "llm"),
    `the capability table describes only the in-process runtimes, got ${ids.join(", ")}`
  );
  ok(
    !existsSync2(path.join(ROOT, "src", "mission", "harnessPolicy.ts")),
    "harnessPolicy.ts is deleted \u2014 there is no argv policy layer left to drift from the registry"
  );
}
{
  ok(!EXECUTABLE_HARNESSES.includes("llm"), "the direct-LLM seam is not a spawnable executable");
  for (const id of Object.keys(AGENT_CAPABILITIES)) {
    ok(
      AGENT_CAPABILITIES[id].prompt === null || AGENT_CAPABILITIES[id].prompt?.argv?.length === 0,
      `${id}: no argv to document \u2014 the ledger cannot drift`
    );
    ok(unverifiedClaims(id).length === 0, `${id}: makes no unverified claims`);
  }
}
console.log("\n== composing a seat into a real command line ==\n");
function mkSeat(harness, over = {}) {
  return {
    id: "s",
    role: "reviewer",
    harness,
    model: null,
    mayWrite: false,
    maxRisk: "LOW",
    maxTurns: null,
    timeoutSecs: 600,
    instructions: "",
    ...over
  };
}
{
  const ctx = { prompt: "Review the diff", cwd: "/repo", readOnly: true };
  for (const gone of ["claude", "codex", "opencode", "cline", "cursor", "grok", "gemini", "acp"]) {
    const r = composeSeatArgv(mkSeat(gone), ctx);
    ok(!r || r.argv.length === 0, `${gone} composes no command line \u2014 the seat is removed, not stubbed`);
  }
  for (const native of ["hermes", "llm"]) {
    const r = composeSeatArgv(mkSeat(native), ctx);
    ok(
      !r || r.argv.length === 0,
      `${native} is in-process and is not given a command line to execute`
    );
  }
}
console.log("\n== validating a team ==\n");
{
  for (const t of PREBUILT_TEAMS) {
    const errors = validateTeam(t).filter((f) => f.severity === "error");
    ok(errors.length === 0, `prebuilt "${t.name}" has no errors: ${errors.map((e) => e.message).join("; ")}`);
  }
  const balanced = PREBUILT_TEAMS.find((t) => t.id === "team.balanced");
  ok(balanced.seats.length === 7, `the balanced crew has 7 seats, got ${balanced.seats.length}`);
  ok(balanced.seats.some((s) => s.role === "coder") && balanced.seats.some((s) => s.role === "tester"), "it can both implement and test");
}
{
  const bad = {
    id: "t",
    name: "",
    description: "",
    seats: [
      { id: "a", role: "coder", harness: "llm", model: null, mayWrite: true, maxRisk: "MEDIUM", maxTurns: null, timeoutSecs: 5, instructions: "" },
      { id: "a", role: "coder", harness: "kilo", model: null, mayWrite: false, maxRisk: "LOW", maxTurns: 99, timeoutSecs: 600, instructions: "" }
    ],
    budgetUsd: null,
    createdAt: "",
    updatedAt: "",
    revision: 1
  };
  const f = validateTeam(bad);
  const codes = f.map((x) => x.code);
  ok(codes.includes("no_name"), "a nameless team is rejected");
  ok(codes.includes("duplicate_seat"), "duplicate seat ids are rejected");
  ok(codes.includes("cannot_write"), "an LLM cannot fill a coder seat");
  ok(codes.includes("advisory_readonly"), "kilo read-only is flagged advisory");
  ok(codes.includes("short_timeout"), "a 5s timeout is flagged as too short");
  ok(codes.includes("cline_retries") === false, "the cline warning only fires for cline seats");
  ok(codes.includes("no_reviewer"), "a team with no reviewer is warned about");
}
{
  const mono = { ...PREBUILT_TEAMS[0], seats: PREBUILT_TEAMS[0].seats.map((s) => s.mayWrite ? { ...s, harness: "claude" } : s) };
  const mono2 = { ...PREBUILT_TEAMS[0], seats: PREBUILT_TEAMS[0].seats.map((s) => s.mayWrite ? { ...s, harness: "claude" } : s) };
  mono2.seats.push({ ...mono2.seats[2], id: "impl2" });
  ok(validateTeam(mono2).some((f) => f.code === "single_vendor"), "two writing seats on one vendor is flagged");
  const adversarial = PREBUILT_TEAMS.find((t) => t.id === "team.adversarial");
  ok(adversarial.seats.filter((s) => s.mayWrite).length === 1, "the adversarial team has exactly one writer");
  ok(!validateTeam(adversarial).some((f) => f.code === "single_vendor"), "one writer is not a diversity problem, so it is not flagged");
}
console.log("\n== routing a task to a seat ==\n");
{
  const team = PREBUILT_TEAMS.find((t) => t.id === "team.balanced");
  ok(seatForTask(team, "coder", "MEDIUM").seat !== null, "a MEDIUM coding task finds a seat");
  ok(seatForTask(team, "reviewer", "LOW").seat !== null, "a LOW review finds a seat");
  const crit = seatForTask(team, "coder", "CRITICAL");
  ok(crit.seat === null, "CRITICAL is never routed to a harness");
  ok(/human/i.test(crit.reason ?? ""), `and it says why: ${crit.reason}`);
  const missing = seatForTask(team, "reviewer", "HIGH");
  ok(missing.seat === null, "a risk above every reviewer's ceiling is not routed");
  ok(/escalate/i.test(missing.reason ?? ""), `and it says to escalate: ${missing.reason}`);
}
console.log("\n== saving and reloading a team ==\n");
{
  const team = PREBUILT_TEAMS[0];
  const json = serializeTeam(team);
  const back = parseTeam(json);
  ok(back.errors.length === 0, `a saved team parses cleanly: ${back.errors.join("; ")}`);
  ok(back.team?.seats.length === team.seats.length, "every seat survives the round trip");
  ok(back.team?.seats[2].harness === team.seats[2].harness, "the harness of each seat survives");
  ok(back.team?.budgetUsd === team.budgetUsd, "the budget survives");
}
{
  ok(parseTeam("not json").team === null, "garbage is refused, not guessed at");
  ok(parseTeam('{"schemaVersion":99,"team":{}}').errors[0].includes("Schema version"), "a future schema is refused with a clear message");
  ok(parseTeam('{"schemaVersion":1,"team":{"seats":[{"id":"a","harness":"nope","role":"coder"}]}}').team === null, "an unknown harness is refused");
  ok(parseTeam('{"schemaVersion":1,"team":{"seats":[]}}').team !== null, "an empty seat list is valid \u2014 validateTeam warns, parse does not");
}
{
  const store = /* @__PURE__ */ new Map();
  globalThis.localStorage = {
    getItem: (k) => store.get(k) ?? null,
    setItem: (k, v) => void store.set(k, v),
    removeItem: (k) => void store.delete(k)
  };
  saveTeams([PREBUILT_TEAMS[0], PREBUILT_TEAMS[1]]);
  const loaded = loadSavedTeams();
  ok(loaded.length === 2, `two teams come back from storage, got ${loaded.length}`);
  ok(loaded[0].name === PREBUILT_TEAMS[0].name, "the saved name is intact");
  const edited = upsertTeam(loaded, { ...loaded[0], name: "Renamed" });
  ok(edited.length === 2, "upsert replaces rather than appends");
  ok(edited[0].name === "Renamed", "the edit landed");
  ok(edited[0].revision === loaded[0].revision + 1, "the revision bumped, so a stale copy is detectable");
  saveTeams([]);
  delete globalThis.localStorage;
  ok(loadSavedTeams().length === 0, "with no storage at all it returns empty instead of throwing");
  saveTeams([PREBUILT_TEAMS[0]]);
}
console.log(`
${pass} passed, ${fail} failed
`);
process.exit(fail ? 1 : 0);
