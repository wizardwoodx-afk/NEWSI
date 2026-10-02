import { createRequire as __mjCreateRequire } from "node:module"; const require = __mjCreateRequire(import.meta.url);

// probe/realCli.test.ts
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

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

// src/mission/caps.ts
var DEFAULT_CAPS = { timeoutMs: 10 * 60 * 1e3, maxTurns: 40, maxCostUsd: 5 };
function parseReportedUsage(harness, raw) {
  const empty = { costUsd: null, tokens: null, turns: null, source: harness };
  if (!raw.trim()) return empty;
  const candidates = jsonChunks(raw);
  let costUsd = null;
  let tokens = null;
  let turns = null;
  for (const obj of candidates) {
    const c = findNumber(obj, ["total_cost_usd", "cost_usd", "costUsd", "cost"], 0);
    if (c !== null) costUsd = c;
    const t = findNumber(obj, ["total_tokens"], 0) ?? sumTokens(obj);
    if (t === null) {
      const flat = findNumber(obj, ["tokens"], 0);
      if (flat !== null) tokens = flat;
    } else {
      tokens = t;
    }
    const n = findNumber(obj, ["num_turns", "turns", "total_turns"], 0);
    if (n !== null) turns = n;
  }
  return { costUsd, tokens, turns, source: harness };
}
function jsonChunks(raw) {
  const out = [];
  const tryOne = (s) => {
    try {
      const v = JSON.parse(s);
      if (v && typeof v === "object") out.push(v);
    } catch {
    }
  };
  tryOne(raw.trim());
  for (const line of raw.split(/\r?\n/)) if (line.trim()) tryOne(line.trim());
  return out;
}
function pickNumber(obj, keys) {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  }
  return null;
}
function findNumber(obj, keys, depth) {
  if (depth > 3 || !obj || typeof obj !== "object") return null;
  const o = obj;
  const direct = pickNumber(o, keys);
  if (direct !== null) return direct;
  for (const v of Object.values(o)) {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      const nested = findNumber(v, keys, depth + 1);
      if (nested !== null) return nested;
    }
  }
  return null;
}
function sumTokens(obj) {
  const blocks = [];
  const collect = (o, depth) => {
    if (depth > 3 || !o || typeof o !== "object" || Array.isArray(o)) return;
    const rec = o;
    for (const k of ["usage", "tokens"]) {
      const v = rec[k];
      if (v && typeof v === "object" && !Array.isArray(v)) blocks.push(v);
    }
    for (const v of Object.values(rec)) collect(v, depth + 1);
  };
  collect(obj, 0);
  let best = null;
  for (const u of blocks) {
    const total = typeof u.total === "number" && Number.isFinite(u.total) ? u.total : null;
    const i = typeof u.input_tokens === "number" ? u.input_tokens : typeof u.input === "number" ? u.input : 0;
    const o = typeof u.output_tokens === "number" ? u.output_tokens : typeof u.output === "number" ? u.output : 0;
    const candidate = total !== null && total > 0 ? total : i + o > 0 ? i + o : null;
    if (candidate !== null) best = candidate;
  }
  return best;
}

// src/mission/git.ts
function parseStatusPorcelainZ(raw) {
  if (!raw) return [];
  const fields = raw.split("\0");
  const out = [];
  for (let i = 0; i < fields.length; i += 1) {
    const entry = fields[i];
    if (!entry || entry.length < 4) continue;
    const code = entry.slice(0, 2);
    const path = entry.slice(3);
    let oldPath = null;
    if (code === "R " || code === "RM" || code === "C " || code === "CM") {
      oldPath = fields[i + 1] ?? null;
      i += 1;
    }
    const status = code === "??" ? "untracked" : code.startsWith("R") ? "renamed" : code.startsWith("C") ? "copied" : code.startsWith("A") ? "added" : code.startsWith("D") ? "deleted" : "modified";
    out.push({ status, path, oldPath });
  }
  return out;
}
function parseUnifiedDiff(raw) {
  const files = [];
  let current = null;
  let currentHunk = null;
  const flush = () => {
    if (current) files.push(current);
    current = null;
    currentHunk = null;
  };
  for (const line of raw.split(/\r?\n/)) {
    if (line.startsWith("diff --git ")) {
      flush();
      const m = /^diff --git a\/(.*) b\/(.*)$/.exec(line);
      current = { path: m?.[2] ?? m?.[1] ?? "unknown", oldPath: null, status: "modified", additions: 0, deletions: 0, binary: false, hunks: [] };
      continue;
    }
    if (!current) continue;
    if (line.startsWith("rename from ")) current.oldPath = line.slice("rename from ".length);
    else if (line.startsWith("copy from ")) current.oldPath = line.slice("copy from ".length);
    else if (line.startsWith("new file mode")) current.status = "added";
    else if (line.startsWith("deleted file mode")) current.status = "deleted";
    else if (line.startsWith("Binary files") || line.startsWith("GIT binary patch")) current.binary = true;
    else if (line.startsWith("@@")) {
      currentHunk = { header: line, added: [], removed: [], lines: [] };
      current.hunks.push(currentHunk);
    } else if (line.startsWith("+") && !line.startsWith("+++")) {
      current.additions += 1;
      if (currentHunk) {
        currentHunk.added.push(line.slice(1));
        currentHunk.lines.push(line);
      }
    } else if (line.startsWith("-") && !line.startsWith("---")) {
      current.deletions += 1;
      if (currentHunk) {
        currentHunk.removed.push(line.slice(1));
        currentHunk.lines.push(line);
      }
    } else if (currentHunk) {
      currentHunk.lines.push(line);
    }
  }
  flush();
  for (const f of files) if (f.oldPath && f.status === "modified") f.status = "renamed";
  return files;
}
function summariseDiff(files) {
  const totalAdditions = files.reduce((s, f) => s + f.additions, 0);
  const totalDeletions = files.reduce((s, f) => s + f.deletions, 0);
  let largest = null;
  let biggest = -1;
  for (const f of files) {
    const churn = f.additions + f.deletions;
    if (churn > biggest) {
      biggest = churn;
      largest = f.path;
    }
  }
  return {
    files,
    totalAdditions,
    totalDeletions,
    netLines: totalAdditions - totalDeletions,
    binaryFiles: files.filter((f) => f.binary).length,
    empty: files.length === 0,
    largest: files.length ? largest : null
  };
}
function gitApi(runner) {
  const run = async (args, cwd) => runner(args, cwd);
  return {
    async isRepo(cwd) {
      const r = await run(["rev-parse", "--is-inside-work-tree"], cwd);
      if (!r.ok) return { ok: false, reason: r.reason ?? (r.stderr || "git rev-parse failed.") };
      return { ok: r.stdout.trim() === "true", reason: r.stdout.trim() === "true" ? null : "This directory is not inside a git work tree." };
    },
    async status(cwd) {
      const r = await run(["status", "--porcelain=v1", "-z"], cwd);
      if (!r.ok) return { ok: false, entries: [], reason: r.reason ?? (r.stderr || "git status failed.") };
      return { ok: true, entries: parseStatusPorcelainZ(r.stdout), reason: null };
    },
    async diff(cwd, opts = {}) {
      const args = ["diff", "--no-color", "--no-ext-diff", "-M"];
      if (opts.staged) args.push("--staged");
      if (opts.ref) args.push(opts.ref);
      args.push("--");
      for (const p of opts.paths ?? []) args.push(p);
      const r = await run(args, cwd);
      if (!r.ok) return { ok: false, summary: null, raw: "", reason: r.reason ?? (r.stderr || "git diff failed.") };
      return { ok: true, summary: summariseDiff(parseUnifiedDiff(r.stdout)), raw: r.stdout, reason: null };
    },
    async head(cwd) {
      const r = await run(["log", "-1", "--format=%H%x00%s"], cwd);
      if (!r.ok) return { ok: false, sha: null, subject: null, reason: r.reason ?? (r.stderr || "git log failed \u2014 is there a commit yet?") };
      const [sha, subject] = r.stdout.replace(/\n+$/, "").split("\0");
      return { ok: true, sha: (sha ?? "").trim() || null, subject: subject ?? null, reason: null };
    },
    async branch(cwd) {
      const r = await run(["rev-parse", "--abbrev-ref", "HEAD"], cwd);
      if (!r.ok) return { ok: false, name: null, reason: r.reason ?? (r.stderr || "git rev-parse failed.") };
      return { ok: true, name: r.stdout.trim() || null, reason: null };
    }
  };
}

// probe/realCli.test.ts
var pass = 0;
var fail_count = 0;
var skipped = 0;
var ok = (c, m) => {
  if (c) pass += 1;
  else fail(`(assertion) ${m}`);
};
var fail = (m) => {
  fail_count += 1;
  console.log(`  FAIL ${m}`);
};
var skip = (m) => {
  skipped += 1;
  console.log(`  SKIP ${m}`);
};
var CLAUDE = process.env.MJ_CLAUDE_BIN ?? "/tmp/cc/node_modules/.bin/claude";
var hasClaude = existsSync(CLAUDE);
var hasGit = (() => {
  try {
    execFileSync("git", ["--version"], { encoding: "utf8" });
    return true;
  } catch {
    return false;
  }
})();
console.log("\n== environment ==");
console.log(`  claude binary: ${hasClaude ? CLAUDE : "ABSENT"}`);
console.log(`  git:           ${hasGit ? "present" : "ABSENT"}`);
console.log("\n== the real binary's version and flags ==\n");
if (!hasClaude) {
  skip("claude is not installed, so nothing about it can be verified");
} else {
  const v = spawnSync(CLAUDE, ["--version"], { encoding: "utf8" });
  ok(v.status === 0, `claude --version exits 0, got ${v.status}`);
  const version = (v.stdout || "").trim();
  console.log(`  version: ${version}`);
  ok(/^\d+\.\d+\.\d+/.test(version), `it reports a semver: ${version}`);
  const help = spawnSync(CLAUDE, ["--help"], { encoding: "utf8" }).stdout || "";
  ok(help.length > 500, `--help produced ${help.length} chars`);
  const caps = AGENT_CAPABILITIES.claude;
  const emitted = [];
  for (const c of [caps.prompt, caps.json, caps.readOnly, caps.write, caps.model, caps.resume, caps.worktree]) {
    if (c?.argv) emitted.push(...c.argv.filter((a) => a.startsWith("-")));
  }
  for (const flag of emitted) {
    ok(help.includes(flag), `VH emits ${flag} and claude --help documents it`);
  }
  ok(!help.includes("--max-turns"), "claude has no --max-turns flag...");
  ok(caps.maxTurns?.argv === null, "...so VH's table now says null instead of emitting it");
  const composed = composeSeatArgv(
    { id: "s", role: "coder", harness: "claude", model: null, mayWrite: true, maxRisk: "MEDIUM", maxTurns: 30, timeoutSecs: 600, instructions: "" },
    { prompt: "x", cwd: "/r", readOnly: false }
  );
  ok(!composed.argv.includes("--max-turns"), "and a coder seat with maxTurns=30 no longer emits --max-turns");
}
console.log("\n== VH's composed argv, run by the real binary, in a real repo ==\n");
if (!hasClaude || !hasGit) {
  skip("needs both the claude binary and git");
} else {
  const dir = mkdtempSync(join(tmpdir(), "mj-real-"));
  const g = (...a) => execFileSync("git", a, { cwd: dir, encoding: "utf8" });
  g("init", "-q");
  g("config", "user.email", "mj@test");
  g("config", "user.name", "VH");
  writeFileSync(join(dir, "calc.ts"), "export function add(a: number, b: number) { return a + b; }\n");
  g("add", ".");
  g("commit", "-q", "-m", "init");
  const seat2 = PREBUILT_TEAMS.find((t) => t.id === "team.adversarial").seats.find((s) => s.role === "reviewer");
  ok(seat2.harness === "grok", `the adversarial reviewer seat is grok, got ${seat2.harness}`);
  const claudeSeat = PREBUILT_TEAMS.find((t) => t.id === "team.balanced").seats.find((s) => s.harness === "claude");
  ok(claudeSeat.harness === "claude", `the seat under test is a claude seat, got ${claudeSeat.harness}`);
  const inv = composeSeatArgv(claudeSeat, { prompt: "Review the diff", cwd: dir, readOnly: true });
  console.log(`  composed: ${inv.bin} ${inv.argv.join(" ")}`);
  const run = spawnSync(CLAUDE, inv.argv, { cwd: dir, encoding: "utf8", timeout: 9e4 });
  const out = (run.stdout || "") + (run.stderr || "");
  const parsed = (() => {
    try {
      return JSON.parse(out.trim().split("\n")[0] ?? "");
    } catch {
      return null;
    }
  })();
  if (!parsed) {
    fail(`the real binary did not return JSON. argv may be wrong. output: ${out.slice(0, 300)}`);
  } else {
    ok(parsed.type === "result", `it returned a real result object, type=${String(parsed.type)}`);
    ok(typeof parsed.session_id === "string", `a session id came back, so the argv parsed: ${String(parsed.session_id).slice(0, 8)}...`);
    ok(!/unknown option|error: unknown/i.test(out), "and no unknown-option error was raised");
    ok(parsed.is_error === true, `it reports is_error=true (no credentials here), got ${String(parsed.is_error)}`);
    ok(String(parsed.result).toLowerCase().includes("not logged in"), `and says why: ${String(parsed.result)}`);
    ok(parsed.total_cost_usd === 0, `real cost is 0 because nothing ran, got ${String(parsed.total_cost_usd)}`);
    const u = parseReportedUsage("claude", out);
    ok(u.costUsd === 0, `VH's parser reads total_cost_usd=0 from real output, got ${String(u.costUsd)}`);
    ok(u.turns === 1, `and num_turns=1, got ${String(u.turns)}`);
    const usage = parsed.usage;
    const expectTokens = (usage?.input_tokens ?? 0) + (usage?.output_tokens ?? 0);
    ok(u.tokens === null, `and a zero token sum yields null (not a fake 0), got ${String(u.tokens)}`);
    ok(expectTokens === 0, `which is correct because the real usage block sums to ${expectTokens}`);
    console.log(`  parsed by VH: cost=${u.costUsd} tokens=${u.tokens} turns=${u.turns} source=${u.source}`);
  }
  rmSync(dir, { recursive: true, force: true });
}
console.log("\n== git evidence over a real repository ==\n");
if (!hasGit) {
  skip("git is not installed");
} else {
  const dir = mkdtempSync(join(tmpdir(), "mj-gitreal-"));
  const g = (...a) => execFileSync("git", a, { cwd: dir, encoding: "utf8" });
  g("init", "-q");
  g("config", "user.email", "mj@test");
  g("config", "user.name", "VH");
  writeFileSync(join(dir, "calc.js"), "module.exports.add = (a, b) => a + b;\n");
  g("add", ".");
  g("commit", "-q", "-m", "init");
  writeFileSync(join(dir, "calc.js"), "module.exports.add = (a, b) => a + b;\nmodule.exports.sub = (a, b) => a - b;\n");
  writeFileSync(join(dir, "calc.test.js"), 'const { sub } = require("./calc");\nif (sub(2, 1) !== 1) { console.error("sub(2,1) !== 1"); process.exit(1); }\nconsole.log("ok");\n');
  g("add", "-A");
  const runner = async (args, cwd) => {
    try {
      return { ok: true, stdout: execFileSync("git", args, { cwd, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }), stderr: "", exitCode: 0, reason: null };
    } catch (e) {
      const err = e;
      return { ok: false, stdout: err.stdout ?? "", stderr: err.stderr ?? "", exitCode: err.status ?? null, reason: (err.stderr || "failed").trim() };
    }
  };
  const api = gitApi(runner);
  const d = await api.diff(dir, { staged: true });
  ok(d.ok === true, "the diff of the agent's change is readable");
  const s = d.summary;
  ok(s.files.length === 2, `two files changed, got ${s.files.length}`);
  ok(s.files.some((f) => f.path === "calc.js" && f.status === "modified"), "calc.js modified");
  ok(s.files.some((f) => f.path === "calc.test.js" && f.status === "added"), "calc.test.js added");
  ok(s.totalAdditions === 4, `+4 lines (1 in calc.js, 3 in the test), got +${s.totalAdditions}`);
  ok(summariseDiff(parseUnifiedDiff(d.raw)).totalAdditions === 4, "and re-parsing the raw diff agrees");
  const test = spawnSync("node", ["calc.test.js"], { cwd: dir, encoding: "utf8" });
  ok(test.status === 0, `the repository's own test exits 0, got ${test.status} (${(test.stdout || "").trim()})`);
  writeFileSync(join(dir, "calc.js"), "module.exports.add = (a, b) => a + b;\nmodule.exports.sub = (a, b) => a + b;\n");
  const broken = spawnSync("node", ["calc.test.js"], { cwd: dir, encoding: "utf8" });
  ok(broken.status !== 0, `and when the agent breaks sub(), the test really fails (exit ${broken.status})`);
  const unstaged = await api.diff(dir, {});
  ok(unstaged.summary.files.length === 1, `an unstaged diff sees only the newly broken file, got ${unstaged.summary.files.length}`);
  const d2 = await api.diff(dir, { staged: true });
  ok(d2.summary.files.length === 2, `the staged diff shows both files, got ${d2.summary.files.length}`);
  ok(d2.raw.includes("module.exports.sub = (a, b) => a - b"), "and it shows the version that was committed to the index (the correct one)");
  ok(unstaged.raw.includes("=> a + b"), "the unstaged diff is where the regression appears...");
  ok(/sub = \(a, b\) => a \+ b/.test(unstaged.raw), "...as a sub() that adds instead of subtracting");
  rmSync(dir, { recursive: true, force: true });
}
console.log(`
${pass} passed, ${fail_count} failed, ${skipped} skipped
`);
process.exit(fail_count ? 1 : 0);
