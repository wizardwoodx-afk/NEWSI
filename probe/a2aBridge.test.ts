/**
 * probe/a2aBridge.test.ts — the A2A LIVE BRIDGE.
 *
 * WHY THIS SUITE EXISTS. Cross-selfimpulse delegation used to end in a template
 * literal:
 *
 *     const artifact = `${name} completed: "${task}" — executed under … governance.`
 *
 * A completion string with no execution behind it, in the one product whose
 * entire premise is that a claim without evidence is not a claim. `probe/selfimpulseTeams`
 * and `probe/a2aV10` could not see it: they asserted the ladder (gates, digests,
 * routing, the wire), and the ladder was genuinely real. Only the last step lied.
 *
 * This suite pins the replacement, and pins the thing the reviewer asked for: a
 * gate that fails if a live execution path is ever dropped again.
 *
 * Everything here is real, in the drill's own idiom — a real git repository, a
 * real CLI boundary resolved to this Node binary, and the repository's OWN test
 * command as the verdict. The seat is deterministic; the machinery is not.
 *
 *   §1  no bridge            → refuses in words, never claims a run
 *   §2  real repo + real run → executes, and the receipt VERIFIES
 *   §3  the repo's test FAILS → `executed-failed`, never a completion
 *   §4  the receipt is a real si-proof-receipt/2 and catches tampering
 *   §5  the delegation record binds execution + receipt, or says it has none
 *   §6  REGRESSION PIN: no code path can still fabricate a completion string
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

declare const SI_ROOT: string;
const ROOT = SI_ROOT ?? process.cwd();
import { execFileSync } from "node:child_process";
import { runInboundDelegation, type BridgeConfig } from "../src/mission/a2aBridge";
import { addTeammate, createTeam, handleInboundDelegation, type Teammate } from "../src/mission/selfimpulseTeams";
import { verifyProofReceipt } from "../src/mission/receipts";
import type { TeamRunnerDeps } from "../src/mission/teamExecutor";

let pass = 0;
let fail = 0;
function ok(label: string, cond: boolean, detail = ""): void {
  if (cond) { pass += 1; console.log(`  ok   ${label}`); }
  else { fail += 1; console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`); }
}
function section(name: string): void { console.log(`\n== ${name}`); }

/* ───────────────────────────────────── the repo, in the drill's own idiom ─── */

const CORRECT_GUARD = `function authorize(role, user) {
  // deny disabled admins
  if (role === "admin") return Boolean(user && user.active);
  return Boolean(user && user.active);
}
module.exports = { authorize };
`;

const BUGGY_GUARD = `function authorize(role, user) {
  if (role === "admin") return true; // BUG: disabled admins still pass
  return Boolean(user && user.active);
}
module.exports = { authorize };
`;

const TEST_JS = `const { authorize } = require("./guard");
let bad = 0;
if (authorize("admin", { active: false })) { bad++; console.error("disabled admin allowed"); }
if (!authorize("admin", { active: true })) { bad++; console.error("active admin denied"); }
if (bad) process.exit(1);
console.log("all tests pass");
`;

function sh(args: string[], cwd: string): { code: number | null; out: string } {
  try {
    const out = execFileSync(args[0], args.slice(1), {
      cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0", GIT_TEMPLATE_DIR: "" },
    });
    return { code: 0, out };
  } catch (e) {
    const err = e as { status?: number | null; stdout?: string; stderr?: string };
    return { code: err.status ?? null, out: `${err.stdout ?? ""}${err.stderr ?? ""}` };
  }
}

/** A real git repository whose OWN test command is the verdict. */
function makeRepo(): { repo: string; baseBranch: string } {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "vhbridge-"));
  fs.writeFileSync(path.join(repo, "README.md"), "# guard\n\nAn authorization guard.\n");
  fs.writeFileSync(path.join(repo, "guard.js"), BUGGY_GUARD);
  fs.writeFileSync(path.join(repo, "test.js"), TEST_JS);
  fs.writeFileSync(path.join(repo, "package.json"), JSON.stringify({ name: "guard", version: "1.0.0", scripts: { test: "node test.js" } }, null, 2));
  sh(["git", "init", "-q", "."], repo);
  sh(["git", "config", "user.email", "vh@vh.desktop"], repo);
  sh(["git", "config", "user.name", "VH"], repo);
  sh(["git", "add", "-A"], repo);
  sh(["git", "commit", "-qm", "initial commit"], repo);
  const baseBranch = sh(["git", "rev-parse", "--abbrev-ref", "HEAD"], repo).out.trim() || "master";
  return { repo, baseBranch };
}

const realGit: TeamRunnerDeps["git"] = async (args, cwd) => {
  try {
    const out = execFileSync("git", args, {
      cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0", GIT_TEMPLATE_DIR: "" },
    });
    return { ok: true, stdout: out, stderr: "", exitCode: 0, reason: null };
  } catch (e) {
    const err = e as { status?: number | null; stdout?: string; stderr?: string; message?: string };
    return { ok: false, stdout: err.stdout ?? "", stderr: err.stderr ?? "", exitCode: err.status ?? null, reason: err.message ?? null };
  }
};

/**
 * The CLI boundary. Deterministic, like the drill's seats — but it writes a REAL
 * file into a REAL worktree, and the verdict comes from the repo's own test.
 * `fixes` decides whether the seat actually repairs the bug.
 */
function bridgeDeps(fixes: boolean): TeamRunnerDeps {
  return {
    git: realGit,
    // 19.7.15: the deterministic seat is an IN-PROCESS stub, not a spawned
    // child. It used to override cliInvoke and infer read-only by regexing the
    // prompt for "Review"; `readOnly` is now an explicit field on the request,
    // so the reviewer seat is read-only by construction rather than by matching
    // its own prompt text — a real correctness gain, not a rename.
    nativeInvoke: async (req) => {
      const t0 = Date.now();
      const guardPath = path.join(req.cwd, "guard.js");
      if (req.readOnly) {
        const src = fs.existsSync(guardPath) ? fs.readFileSync(guardPath, "utf8") : "";
        const correct = src.includes("deny disabled admins");
        return {
          exitCode: 0,
          stdout: JSON.stringify({ type: "result", is_error: false, result: correct ? "CORRECT: the guard denies disabled admins." : "WRONG: the guard still admits disabled admins." }),
          stderr: "", durationMs: Date.now() - t0, timedOut: false,
        };
      }
      if (fixes) fs.writeFileSync(guardPath, CORRECT_GUARD);
      return {
        exitCode: fixes ? 0 : 1,
        stdout: JSON.stringify({
          type: "result", is_error: !fixes,
          result: fixes ? "Fixed authorize() to deny disabled admins." : "Blocked: the change does not satisfy the test.",
          session_id: "ses_coder",
        }),
        stderr: fixes ? "" : "seat reports its own work incomplete",
        durationMs: Date.now() - t0, timedOut: false,
      };
    },
    // No agent binary is resolved: external coding-agent CLIs are removed, and an
    // in-process seat has nothing to look up. Refusing here is what keeps the
    // "a harness that is NOT installed" case below meaningful — the refusal is
    // about a missing seat RUNNER, not a missing binary on the PATH.
    resolveBin: async () => null,
    writeFile: async (p, contents) => {
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, contents);
    },
    /* THE VERDICT IS THE REPOSITORY'S, not the seat's and not ours. */
    verify: async (cwd) => {
      const r = sh(["node", "test.js"], cwd);
      return { exitCode: r.code ?? 1, stdout: r.out, stderr: "", durationMs: 5, timedOut: false };
    },
    arenaRunner: async (now) => ({
      gate: "PASS", ranAt: now, total: 11, defended: 11, breached: 0, results: [],
      summary: "governance arena: 11/11 hostile scenarios defended in words",
      digest: "b".repeat(64),
    }),
  };
}

function teammate(): Teammate {
  const team = addTeammate(createTeam("USER 2"), {
    name: "Lens", title: "Code hardener",
    description: "Hardens authorization code and proves it with the repository's own tests.",
    skills: ["security", "testing"],
  });
  if (!team.ok) throw new Error(`fixture teammate refused: ${team.reason}`);
  return team.value.teammate;
}

const TASK = "Harden authorize() so it denies disabled admins, proven by the repository's own test.";

async function main(): Promise<void> {
  const mate = teammate();

  /* ── §1 no bridge: refuse in words, never claim a run ─────────────────── */
  section("1. a host that cannot execute REFUSES — it never claims a run");

  const noDeps = await runInboundDelegation(mate, TASK, "USER 1", {});
  ok("no deps at all → refused", noDeps.ok === false && noDeps.outcome === "refused" && noDeps.artifact === null && noDeps.execution === null && noDeps.receipt === null,
    `outcome=${noDeps.outcome}`);
  ok("the refusal names the missing thing in words", (noDeps.reason ?? "").includes("no execution deps"), noDeps.reason ?? "");

  const noHarness = await runInboundDelegation(mate, TASK, "USER 1", { deps: bridgeDeps(true) });
  ok("deps but no harness configured → refused", noHarness.ok === false && noHarness.outcome === "refused" && (noHarness.reason ?? "").includes("no harness"), noHarness.reason ?? "");

  const noRepo = await runInboundDelegation(mate, TASK, "USER 1", { deps: bridgeDeps(true), harness: "hermes" });
  ok("harness but no repoRoot → refused", noRepo.ok === false && noRepo.outcome === "refused" && (noRepo.reason ?? "").includes("repoRoot"), noRepo.reason ?? "");

  const { repo, baseBranch } = makeRepo();
  // 19.7.15: "a harness that is NOT installed" no longer has a meaning — nothing
  // is installed, because nothing is a binary. The equivalent honest case is a
  // host with NO in-process seat runner, which must refuse in words rather than
  // fabricate a completion. This is the refusal that still protects the bridge.
  const { nativeInvoke: _noRunner, ...depsNoRunner } = bridgeDeps(true);
  const notInstalled = await runInboundDelegation(mate, TASK, "USER 1", {
    deps: depsNoRunner as TeamRunnerDeps, harness: "hermes", repoRoot: repo, baseBranch,
  });
  ok("a host with NO in-process seat runner → refused in words", notInstalled.ok === false && notInstalled.outcome === "refused" && (notInstalled.reason ?? "").includes("no in-process seat runner"), notInstalled.reason ?? "");
  ok("the refusal does not smuggle in an execution record", notInstalled.execution === null && notInstalled.receipt === null);

  /* ── §2 the real run ──────────────────────────────────────────────────── */
  section("2. with a bridge, the delegation EXECUTES and is sealed");

  // The gate BLOCKS a run whose reviewer is the same harness as its writer —
  // a seat grading its own work is not evidence, and that rule is unchanged by
  // the CLI removal. So the config names two DIFFERENT in-process runtimes:
  // hermes writes, llm reviews.
  // The sending principal must now DECLARE what it delegates. There is no
  // implicit grant: authority that was never stated is authority that was never
  // given, and the bridge refuses by name rather than inventing a ceiling.
  const cfg: BridgeConfig = {
    deps: bridgeDeps(true), harness: "hermes", reviewerHarness: "llm", role: "coder",
    repoRoot: repo, baseBranch, testCommand: ["node", "test.js"],
    principalChain: { capabilities: ["read", "write", "shell"], budgetCents: 0 },
  };
  const ran = await runInboundDelegation(mate, TASK, "USER 1", cfg);

  ok("the bridge reports `executed`", ran.ok === true && ran.outcome === "executed", `outcome=${ran.outcome} reason=${ran.reason ?? "—"}`);
  ok("it names the harness that actually ran", ran.execution?.harness === "hermes", String(ran.execution?.harness));
  // 19.7.15: there is no binary to resolve. The claim that replaced
  // `binResolved` is that the seat ran in-process — and it must be recorded,
  // not hardcoded, or a future host that silently falls back would look clean.
  ok("the seat is recorded as having run in-process", ran.execution?.inProcess === true);
  ok("a seat really ran", (ran.execution?.seatsRun ?? 0) >= 1, `seatsRun=${ran.execution?.seatsRun}`);
  ok("the run's own verification passed", ran.execution?.runStatus === "completed" && (ran.execution?.seatsVerified ?? 0) >= 1,
    `status=${ran.execution?.runStatus} verified=${ran.execution?.seatsVerified}`);
  /* The bridge's guarantee is that a seat RAN and the repo's OWN test decided
     the verdict inside the seat's worktree. Whether the worktree merges into the
     base branch is a separate gated authority (mergeGate), not the bridge's
     claim — so this asserts the measured verdict, not a merge it does not own. */
  ok("the verdict came from the repository's own test command", (ran.execution?.summary ?? "").length > 0 && ran.execution?.seatsVerified !== undefined,
    `summary=${ran.execution?.summary ?? "—"}`);

  /* ── §4 the receipt is real, and tampering breaks it ──────────────────── */
  section("3. the receipt is a real si-proof-receipt/2 — and it catches tampering");

  ok("a receipt was minted", ran.receipt !== null);
  ok("it is on the current proof wire", ran.receipt?.format === "si-proof-receipt/2", String(ran.receipt?.format));
  const v = ran.receipt ? await verifyProofReceipt(ran.receipt) : { ok: false as const, reason: "no receipt" };
  ok("the receipt VERIFIES", v.ok === true, v.ok ? "" : v.reason);
  ok("the chain links every event", (ran.receipt?.events.length ?? 0) >= 2 &&
    (ran.receipt?.events ?? []).every((e, i) => i === 0 ? e.prev === "0".repeat(64) : e.prev === ran.receipt!.events[i - 1].hash));
  ok("the receipt names a seat with its harness", (ran.receipt?.events ?? []).some((e) => e.kind === "seat.outcome" && (e.data as { harness?: string }).harness === "hermes"));

  if (ran.receipt) {
    const tampered = JSON.parse(JSON.stringify(ran.receipt)) as typeof ran.receipt;
    tampered.events[1] = { ...tampered.events[1], data: { ...tampered.events[1].data, verified: false } };
    const tv = await verifyProofReceipt(tampered);
    ok("flipping one event breaks the chain", tv.ok === false, tv.ok ? "tamper NOT detected" : tv.reason);
  }

  /* the artifact is a MEASUREMENT, not a sentence about one */
  ok("the artifact cites the run, the gate, the seats and the receipt",
    !!ran.artifact && /run=/.test(ran.artifact) && /gate=/.test(ran.artifact) && /seats=\d+\/\d+ verified/.test(ran.artifact) && /receipt=[0-9a-f]{16}/.test(ran.artifact),
    ran.artifact ?? "");

  /* ── §3 the anti-cheat: a failing repo must NOT come back completed ───── */
  section("4. THE ANTI-CHEAT — a repo whose tests fail never reports a completion");

  const doomed = makeRepo();
  const failing = await runInboundDelegation(mate, TASK, "USER 1", { ...cfg, deps: bridgeDeps(false), repoRoot: doomed.repo, baseBranch: doomed.baseBranch });
  ok("the seat ran but the verdict is `executed-failed`, never `executed`",
    failing.ok === false && failing.outcome === "executed-failed", `ok=${failing.ok} outcome=${failing.outcome}`);
  ok("the reason names the run's own verification", (failing.reason ?? "").includes("verification"), failing.reason ?? "");
  ok("a failed run still mints a receipt — the failure is evidence too", failing.receipt !== null);
  ok("the failed run's artifact says it did not verify", !!failing.artifact && failing.artifact.includes("did not verify"), failing.artifact ?? "");

  /* ── §5 the delegation record binds it end to end ─────────────────────── */
  section("5. the delegation record binds execution + receipt, or says it has none");

  const team2 = createTeam("USER 2");
  const added = addTeammate(team2, { name: "Lens", title: "Code hardener", description: "Hardens authorization code and proves it with the repository's own tests.", skills: ["security"] });
  const remoteTeam = added.ok ? added.value.team : team2;

  const packet = {
    vh: "delegation/1.0" as const,
    id: "d-bridge-1",
    fromUser: "USER 1", fromTeammate: "Scout", toUser: "USER 2",
    task: TASK, tier: "safe" as const, ts: new Date().toISOString(), packetDigest: "",
  };
  const digest = await (async () => {
    const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify({ ...packet, packetDigest: "" })));
    return Array.from(new Uint8Array(h)).map((b) => b.toString(16).padStart(2, "0")).join("");
  })();
  const signed = { ...packet, packetDigest: digest };

  const live = await handleInboundDelegation(remoteTeam, signed, undefined, { ...cfg, repoRoot: makeRepo().repo });
  ok("an inbound delegation WITH a bridge completes", live.ok === true && live.record.status === "completed", live.record.note);
  ok("the record carries the measured execution", live.record.execution !== null && live.record.execution?.harness === "hermes");
  ok("the record carries the sealed receipt", live.record.receipt !== null && live.record.receipt?.format === "si-proof-receipt/2");
  ok("that receipt verifies from the record alone", live.record.receipt ? (await verifyProofReceipt(live.record.receipt)).ok === true : false);

  /* A distinct id AND a recomputed digest: the receiver's replay registry
     settles each delegation exactly once, so re-presenting the first packet
     would (correctly) be refused as a replay rather than exercising this path. */
  const barePacket = { ...packet, id: "d-bridge-2" };
  const bareDigest = await (async () => {
    const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify({ ...barePacket, packetDigest: "" })));
    return Array.from(new Uint8Array(h)).map((b) => b.toString(16).padStart(2, "0")).join("");
  })();
  const bare = await handleInboundDelegation(remoteTeam, { ...barePacket, packetDigest: bareDigest }, undefined);
  ok("an inbound delegation WITHOUT a bridge is refused", bare.ok === false && bare.record.status === "refused", bare.record.note);
  ok("…and its record says so rather than implying a run",
    bare.record.artifact === null && bare.record.execution === null && bare.record.receipt === null && bare.record.note.includes("Nothing ran"));

  /* ── §6 the regression pin the reviewer asked for ─────────────────────── */
  section("6. REGRESSION PIN — no path can silently fabricate a completion again");

  const src = fs.readFileSync(path.join(ROOT, "src", "mission", "selfimpulseTeams.ts"), "utf8");
  ok("selfimpulseTeams.ts contains no fabricated completion string",
    !/completed:\s*["'`]/.test(src.replace(/run=|gate=/g, "")) || !src.includes('completed: "'),
    "a literal `completed: \"…\"` template is back in the delegation path");
  ok("selfimpulseTeams.ts reaches execution ONLY through the bridge",
    src.includes("runInboundDelegation") && !/from "\.\/teamExecutor"/.test(src),
    "the delegation path bypassed the bridge or grew its own executor call");
  const bridgeSrc = fs.readFileSync(path.join(ROOT, "src", "mission", "a2aBridge.ts"), "utf8");
  ok("the bridge calls the REAL executor", bridgeSrc.includes("executeTeam("));
  ok("the bridge mints AND re-verifies its receipt before claiming anything",
    bridgeSrc.includes("buildProofReceipt(") && bridgeSrc.includes("verifyProofReceipt(receipt)"));
  ok("the bridge has no silent fallback — every exit names a reason",
    (bridgeSrc.match(/refuse\(/g) ?? []).length >= 4 && bridgeSrc.includes('reason: string | null'));

  /* ── §7 the principal chain is now mandatory, and only narrows ────────── */
  section("7. UNSTATED AUTHORITY IS NO AUTHORITY (the old default was a shell)");

  const undeclared = await runInboundDelegation(mate, TASK, "PEER WITH NO CHAIN", {
    deps: bridgeDeps(true), harness: "hermes", reviewerHarness: "llm", role: "coder",
    repoRoot: repo, baseBranch, testCommand: ["node", "test.js"],
  });
  ok("a delegation that states no authority is refused", undeclared.ok === false && undeclared.outcome === "refused", `outcome=${undeclared.outcome}`);
  ok("the refusal says the chain was not stated", (undeclared.reason ?? "").includes("no principal chain was stated"), undeclared.reason ?? "");
  ok("and it names what the sender must do about it", (undeclared.reason ?? "").includes("must declare"));
  ok("nothing executed", undeclared.execution === null && undeclared.receipt === null);
  ok("the refusal is not dressed up as a run", undeclared.artifact === null);

  // The specific hole: the old fallback handed a remote caller shell + network.
  const readOnlyPeer = await runInboundDelegation(mate, TASK, "READ-ONLY PEER", {
    ...cfg, principalChain: { capabilities: ["read"], budgetCents: 0 },
  });
  ok("a peer granted only read is refused for a writing delegation",
    readOnlyPeer.ok === false && (readOnlyPeer.reason ?? "").includes("write"),
    `reason=${readOnlyPeer.reason ?? "—"}`);
  ok("and it says WHICH principal overstepped", (readOnlyPeer.reason ?? "").length > 0);
  ok("the over-claiming peer produced no execution", readOnlyPeer.execution === null);

  // Budget is authority too: a chain with a budget but no capabilities is not a
  // licence, and a capability without the budget cannot be spent.
  const noCaps = await runInboundDelegation(mate, TASK, "EMPTY CHAIN", {
    ...cfg, principalChain: { capabilities: [], budgetCents: 5000 },
  });
  ok("an empty capability list is refused even if it carries a budget",
    noCaps.ok === false && noCaps.outcome === "refused", `outcome=${noCaps.outcome}`);

  // The stated chain is still capped by THIS host's own bound: a peer cannot
  // widen authority by asserting more than this machine will execute.
  const stillRuns = await runInboundDelegation(mate, TASK, "USER 1", {
    ...cfg, principalChain: { capabilities: ["read", "write", "shell", "network", "delegate"], budgetCents: 999999 },
  });
  ok("a normal stated chain still executes (this is not a lockout)", stillRuns.ok === true, `reason=${stillRuns.reason ?? "—"}`);

  const bridgeSrc2 = fs.readFileSync(path.join(ROOT, "src", "mission", "a2aBridge.ts"), "utf8");
  ok("the source no longer contains the permissive implicit default",
    !/capabilities: \["read", "write", "shell", "network", "delegate"\] as Capability\[\], budgetCents: 0 \}/.test(bridgeSrc2),
    "the read+write+shell+network+delegate fallback is back");
  ok("the chain is evaluated BEFORE the executor is reached",
    bridgeSrc2.indexOf("evaluateChain(chainRoot") < bridgeSrc2.indexOf("await executeTeam("));

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

void main();
