/**
 * V9 — CLI agent teams. The thing that makes nine different coding CLIs usable as one reusable,
 * savable crew.
 *
 * Every assertion here is about behaviour that would silently break a real mission: a seat that
 * claims a sandbox its CLI cannot enforce, a team that round-trips wrong, a CRITICAL task quietly
 * handed to a harness.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { AGENT_CAPABILITIES, EXECUTABLE_HARNESSES, enforcedReadOnly, fullyDocumented, unverifiedClaims } from "../src/mission/agentCapabilities";
import {
  PREBUILT_TEAMS,
  composeSeatArgv,
  loadSavedTeams,
  parseTeam,
  saveTeams,
  seatForTask,
  serializeTeam,
  upsertTeam,
  validateTeam,
  type CliAgentTeam,
  type TeamSeat,
} from "../src/mission/agentTeam";
import type { HarnessId } from "../src/domain/harness";

const ROOT: string = process.env.SI_ROOT ?? process.cwd();
const existsSync = (p: string): boolean => fs.existsSync(p);

let pass = 0;
let fail = 0;
const ok = (c: boolean, m: string) => {
  if (c) pass += 1;
  else {
    fail += 1;
    console.log(`  FAIL ${m}`);
  }
};

console.log("\n== the capability table itself ==\n");

{
  const ids = Object.keys(AGENT_CAPABILITIES) as HarnessId[];
  // Was `ids.length >= 9` over the vendor CLI matrix. With the CLIs removed the
  // table describes exactly the two in-process runtimes, and the count is
  // asserted exactly so a future seat cannot be added without updating it.
  ok(ids.length === 2 && ids.includes("hermes") && ids.includes("llm"),
    `only the in-process runtimes are described, got ${ids.join(", ")}`);
  for (const id of ids) {
    const c = AGENT_CAPABILITIES[id];
    ok(c.id === id, `${id}: id field matches its key`);
    ok(c.name.length > 0, `${id}: has a name`);
    ok(c.install.length > 0, `${id}: says how to install it`);
    ok(c.gotchas.length > 0, `${id}: has at least one production gotcha written down`);
    // Every non-null capability must cite where the claim came from.
    const caps = [c.prompt, c.json, c.readOnly, c.write, c.fullAuto, c.maxTurns, c.timeout, c.outputSchema, c.worktree, c.cwd, c.model, c.resume, c.noAutoUpdate];
    ok(caps.every((x) => x === null || (x.source.length > 0 && x.confidence !== undefined)), `${id}: every capability cites a source`);
  }
}

{
  // The sandbox bug this block used to fix ("three harnesses were wrongly marked
  // as having no sandbox") was about vendor CLIs. Those seats are removed, so
  // the bug class is gone with them, and what remains is the honest statement:
  // the native runtimes are in-process and have no OS sandbox to enforce. The
  // capability registry must say so rather than claim one.
  ok(!enforcedReadOnly("hermes"), "hermes is in-process and has no sandbox — the registry says so");
  ok(!enforcedReadOnly("llm"), "a plain LLM is an API call and has no sandbox — the registry says so");
  const ids = Object.keys(AGENT_CAPABILITIES) as HarnessId[];
  ok(ids.every((id) => id === "hermes" || id === "llm"),
    `the capability table describes only the in-process runtimes, got ${ids.join(", ")}`);
  ok(!existsSync(path.join(ROOT, "src", "mission", "harnessPolicy.ts")),
    "harnessPolicy.ts is deleted — there is no argv policy layer left to drift from the registry");
}
{
  // The documentation-confidence ledger was a vendor-CLI concern: each binary's
  // flags carried a source and a confidence so the UI could admit what was
  // community-sourced. Those flags are gone. What must remain true is that the
  // native seats make no undocumented claims — they have no argv, so the ledger
  // is empty rather than padded with inherited vendor data.
  ok(!EXECUTABLE_HARNESSES.includes("llm"), "the direct-LLM seam is not a spawnable executable");
  for (const id of Object.keys(AGENT_CAPABILITIES) as HarnessId[]) {
    ok(AGENT_CAPABILITIES[id].prompt === null || AGENT_CAPABILITIES[id].prompt?.argv?.length === 0,
      `${id}: no argv to document — the ledger cannot drift`);
    ok(unverifiedClaims(id).length === 0, `${id}: makes no unverified claims`);
  }
}

console.log("\n== composing a seat into a real command line ==\n");

function mkSeat(harness: HarnessId, over: Partial<TeamSeat> = {}): TeamSeat {
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
    ...over,
  };
}

{
  // The command-line composer was a vendor-CLI concern: it turned a seat into
  // argv, env and config files for whichever binary was on the PATH. The vendor
  // seats are removed, so there is no argv to compose. What must survive is the
  // honest behaviour of the seam: a seat naming a removed engine produces no
  // command and no file, and the in-process runtimes are not silently handed a
  // command line either.
  const ctx = { prompt: "Review the diff", cwd: "/repo", readOnly: true };
  for (const gone of ["claude", "codex", "opencode", "cline", "cursor", "grok", "gemini", "acp"] as HarnessId[]) {
    const r = composeSeatArgv(mkSeat(gone), ctx);
    ok(!r || r.argv.length === 0, `${gone} composes no command line — the seat is removed, not stubbed`);
  }
  for (const native of ["hermes", "llm"] as HarnessId[]) {
    const r = composeSeatArgv(mkSeat(native), ctx);
    ok(!r || r.argv.length === 0,
      `${native} is in-process and is not given a command line to execute`);
  }
}

console.log("\n== validating a team ==\n");

{
  for (const t of PREBUILT_TEAMS) {
    const errors = validateTeam(t).filter((f) => f.severity === "error");
    ok(errors.length === 0, `prebuilt "${t.name}" has no errors: ${errors.map((e) => e.message).join("; ")}`);
  }
  const balanced = PREBUILT_TEAMS.find((t) => t.id === "team.balanced")!;
  ok(balanced.seats.length === 7, `the balanced crew has 7 seats, got ${balanced.seats.length}`);
  ok(balanced.seats.some((s) => s.role === "coder") && balanced.seats.some((s) => s.role === "tester"), "it can both implement and test");
}

{
  const bad: CliAgentTeam = {
    id: "t",
    name: "",
    description: "",
    seats: [
      { id: "a", role: "coder", harness: "llm", model: null, mayWrite: true, maxRisk: "MEDIUM", maxTurns: null, timeoutSecs: 5, instructions: "" },
      { id: "a", role: "coder", harness: "kilo", model: null, mayWrite: false, maxRisk: "LOW", maxTurns: 99, timeoutSecs: 600, instructions: "" },
    ],
    budgetUsd: null,
    createdAt: "",
    updatedAt: "",
    revision: 1,
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
  // Single-vendor writing is called out, because that is exactly the blind spot VH exists to avoid.
  const mono: CliAgentTeam = { ...PREBUILT_TEAMS[0], seats: PREBUILT_TEAMS[0].seats.map((s) => (s.mayWrite ? { ...s, harness: "claude" as HarnessId } : s)) };
  const mono2: CliAgentTeam = { ...PREBUILT_TEAMS[0], seats: PREBUILT_TEAMS[0].seats.map((s) => (s.mayWrite ? { ...s, harness: "claude" as HarnessId } : s)) };
  mono2.seats.push({ ...mono2.seats[2], id: "impl2" }); // two writing seats, one vendor
  ok(validateTeam(mono2).some((f) => f.code === "single_vendor"), "two writing seats on one vendor is flagged");
  const adversarial = PREBUILT_TEAMS.find((t) => t.id === "team.adversarial")!;
  ok(adversarial.seats.filter((s) => s.mayWrite).length === 1, "the adversarial team has exactly one writer");
  ok(!validateTeam(adversarial).some((f) => f.code === "single_vendor"), "one writer is not a diversity problem, so it is not flagged");
}

console.log("\n== routing a task to a seat ==\n");

{
  const team = PREBUILT_TEAMS.find((t) => t.id === "team.balanced")!;
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
  ok(parseTeam('{"schemaVersion":1,"team":{"seats":[]}}').team !== null, "an empty seat list is valid — validateTeam warns, parse does not");
}

{
  // Storage round trip. localStorage does not exist under node, so provide one — and assert the
  // module degrades safely when it does not.
  const store = new Map<string, string>();
  (globalThis as Record<string, unknown>).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
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
  delete (globalThis as Record<string, unknown>).localStorage;
  ok(loadSavedTeams().length === 0, "with no storage at all it returns empty instead of throwing");
  saveTeams([PREBUILT_TEAMS[0]]); // must not throw
}

// The "composed argv is accepted by the policy layer" section is gone with
// harnessPolicy.ts. Its whole subject was the vendor argv contract; with the
// vendor seats removed there is no argv to compose and no policy to agree
// with. The native equivalent — that a seat's authority envelope is what
// actually bounds it — is asserted in governanceAuthority.test.ts.

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
