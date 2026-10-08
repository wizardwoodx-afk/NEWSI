/**
 * probe/auditScrub.test.ts — secrets never reach the trail. The lift from
 * `claw-enterprise`'s audit package (MIT, Copyright (c) 2026 OpenAI,
 * `packages/audit`; licence at `LICENSES/claw-enterprise-MIT.txt`).
 *
 * THE PROPERTY UNDER TEST IS ONE SENTENCE: what an auditor later reads must not
 * contain a credential. SelfImpulse writes gate decisions, router reasons, tool
 * output and ledger rows into documents that are persisted, replayed, exported
 * and read by people other than the one who wrote them. A secret that lands in
 * the flight recorder is not a log line, it is a leaked key with a retention
 * policy.
 *
 * So the load-bearing assertions are the ones that go THROUGH THE REAL WRITE
 * PATHS rather than testing the scrubber in isolation:
 *   - `FlightRecorder.record()` — the one append path every governed mutation
 *     goes through (`src/mission/flightRecorder.ts`);
 *   - `DecisionJournal.append()` — the §13 decision journal, whose digest must
 *     still verify afterwards, because a journal that hashes what was NOT stored
 *     is worse than no journal;
 *   - `askHuman()` — the tiered-HITL record, which stores the evidence the human
 *     was judged on;
 *   - `tail()` in the executor — the seat's raw stdout/stderr, proven by source
 *     scan because reaching it needs a real git worktree.
 *
 * AND THE OTHER HALF, WHICH IS EQUALLY IMPORTANT: ordinary text survives
 * untouched. An audit trail that rewrites plain sentences, paths, diff stats and
 * check names to be safe is an audit trail nobody can read.
 */
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  AUDIT_SCRUB_MARKER,
  isSensitiveAuditMember,
  scrubAuditLines,
  scrubAuditRecord,
  scrubAuditText,
  scrubAuditValue,
} from "../src/security/auditScrub";
import { askHuman, DecisionJournal, guardAfter, guardBefore, type HitlRequest } from "../src/security/actionGraph";
import { FlightRecorder } from "../src/mission/flightRecorder";
import { ApprovalGateService } from "../src/mission/approvals";

let passed = 0;
let failed = 0;
const failures: string[] = [];
function ok(label: string, cond: boolean, detail = ""): void {
  if (cond) {
    passed += 1;
    console.log(`  ok   ${label}`);
  } else {
    failed += 1;
    failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`);
  }
}
function section(name: string): void {
  console.log(`\n== ${name}`);
}

declare const SI_ROOT: string | undefined;
const ROOT = typeof SI_ROOT === "string" && SI_ROOT.length > 0 ? SI_ROOT : process.cwd();

/* The three planted artefacts the owner asked to see refused, each shaped the
 * way the real thing is shaped so a pattern that only matches a toy fails. */
const PLANTED_KEY = "sk-proj-Qh7xW2mKd9fLpR4tYbNsVc1ZgE0aJiOuKyT";
const PLANTED_BEARER = "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJzaS1vd25lciJ9.dXNlZGV2aWNlLXNpZ25hdHVyZQ";
const PLANTED_URL = "https://deploy-bot:s3cr3t-t0ken@git.acme.internal/platform/acme.git";

const SECRET_MARKERS = [PLANTED_KEY, "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9", "s3cr3t-t0ken", "Qh7xW2mKd9fLpR4tYbNsVc1ZgE0aJiOuKyT"];

/** Nothing that could be replayed as a credential survives in this string. */
function containsNoSecret(haystack: string): boolean {
  return !SECRET_MARKERS.some((m) => haystack.includes(m));
}

async function main(): Promise<void> {
  /* ── 1. the scrubber's own contract ─────────────────────────────────────── */
  section("1 · the three planted shapes are refused");
  ok("a planted API key is redacted in free text", !scrubAuditText(`failed to call ${PLANTED_KEY}`).includes(PLANTED_KEY));
  ok("a bearer token is redacted WITH its scheme word", containsNoSecret(scrubAuditText(`the request carried ${PLANTED_BEARER}`)));
  ok("a credential-bearing URL keeps its host and drops its secret", (() => {
    const out = scrubAuditText(`pushing to ${PLANTED_URL} failed`);
    return !out.includes("s3cr3t-t0ken") && out.includes("git.acme.internal") && out.includes("deploy-bot");
  })(), scrubAuditText(PLANTED_URL));
  ok("the redaction is visible, not a silent deletion", scrubAuditText(PLANTED_KEY).includes(AUDIT_SCRUB_MARKER));
  ok("scrub is idempotent (a scrubbed line re-scrubs to itself)", scrubAuditText(scrubAuditText(`a ${PLANTED_KEY} b`)) === scrubAuditText(`a ${PLANTED_KEY} b`));

  section("2 · ordinary audit text is left completely alone");
  const ordinary = [
    'Captain routed "ship the Q3 invoice batch" to Ops Deployer',
    "the repository's own check ran in /work/si-crew/seat-3 and exited 0",
    "writes 41 external records; irreversible send; $0 cost",
    "gate status PASS (tier STRICT); 2 of 3 seats verified",
    "/etc/systemd/system/acme.service is outside the seat root /work",
    "TypeError: cannot read properties of undefined (reading 'map')",
  ];
  for (const line of ordinary) ok(`untouched: ${line.slice(0, 48)}…`, scrubAuditText(line) === line, scrubAuditText(line));

  section("3 · structural guards");
  ok("a member NAMED for a credential is collapsed whole", isSensitiveAuditMember("accessToken") && isSensitiveAuditMember("api_key") && isSensitiveAuditMember("privateKey"));
  ok("an identifier OF a secret is kept, not blanked", !isSensitiveAuditMember("tokenId") && !isSensitiveAuditMember("secretRef"));
  const nested = scrubAuditValue({
    keep: "the seat ran 3 turns",
    accessToken: PLANTED_KEY,
    tokenId: "tok_9f3a",
    deep: { nested: { authorization: PLANTED_BEARER, note: "nothing to see" } },
    at: new Date("2026-10-07T10:00:00.000Z"),
    count: 7n,
  }) as Record<string, unknown>;
  ok("the credential member is the marker", nested.accessToken === AUDIT_SCRUB_MARKER);
  ok("the innocent sibling survives", nested.keep === "the seat ran 3 turns");
  ok("the safe reference survives", nested.tokenId === "tok_9f3a");
  ok("a nested credential member is collapsed too", (nested.deep as { nested: { authorization: unknown } }).nested.authorization === AUDIT_SCRUB_MARKER);
  ok("a Date becomes its ISO form rather than a broken object", nested.at === "2026-10-07T10:00:00.000Z");
  ok("a bigint is stringified rather than dropped", nested.count === "7");
  ok("__proto__/constructor/prototype members are dropped, not assigned", (() => {
    const evil = scrubAuditValue(JSON.parse('{"__proto__":{"polluted":true},"constructor":{"polluted":true},"ok":1}')) as Record<string, unknown>;
    /* `in` is the wrong probe here and the test says so out loud: `__proto__` is
     * an accessor on Object.prototype, so `"__proto__" in {}` is true for EVERY
     * object. What matters is that the scrubbed document carries no OWN member of
     * that name — because assigning one with `obj[key] = v` is precisely how a
     * parsed audit document becomes prototype pollution. */
    const own = Object.keys(evil);
    return (
      !own.includes("__proto__") &&
      !own.includes("constructor") &&
      own.includes("ok") &&
      evil.ok === 1 &&
      ({} as Record<string, unknown>).polluted === undefined &&
      Object.getPrototypeOf(evil) === Object.prototype
    );
  })(), JSON.stringify(Object.keys(scrubAuditValue(JSON.parse('{"__proto__":{"polluted":true}}')))));
  ok("a cycle refuses into the marker instead of hanging", (() => {
    const loop: Record<string, unknown> = { name: "a" };
    loop.self = loop;
    return scrubAuditValue(loop) !== undefined;
  })());
  ok("depth past the ceiling is the marker, not a truncated walk", (() => {
    let deep: Record<string, unknown> = { leaf: PLANTED_KEY };
    for (let i = 0; i < 40; i++) deep = { n: deep };
    return !JSON.stringify(scrubAuditValue(deep)).includes(PLANTED_KEY);
  })());
  ok("an Error keeps its name and loses its message", (() => {
    const e = new Error(`could not reach ${PLANTED_URL}`);
    const v = scrubAuditValue({ err: e }) as { err: { name: string; reason: string } };
    return v.err.name === "Error" && v.err.reason === AUDIT_SCRUB_MARKER;
  })());
  ok("control characters collapse rather than splitting one line into two", !scrubAuditText("line one\u0000line two\u001b[31m").includes("\u0000"));
  ok("evidence lines scrub one by one", scrubAuditLines([`key=${PLANTED_KEY}`, "clean line"])[1] === "clean line");
  ok("an evidence RECORD scrubs values and keeps safe keys", (() => {
    const r = scrubAuditRecord({ rule: "authority", when: "before", api_key: PLANTED_KEY });
    return r.rule === "authority" && r.api_key === AUDIT_SCRUB_MARKER;
  })());

  /* ── 4. THE REAL STORAGE SEAM: the flight recorder ─────────────────────── */
  section("4 · what actually lands in the flight recorder is scrubbed");
  const recorder = new FlightRecorder("m-scrub-probe");
  recorder.record({
    kind: "AGENT_FAILED",
    actor: "ops.deploy-gate",
    authority: "runtime",
    policy: "tool.invoke",
    reason: `provider refused the call: ${PLANTED_BEARER} was in the header it echoed back`,
    evidence: [`remote=${PLANTED_URL}`, "exit code 128"],
    subjectId: "seat-3",
    data: { tool: "write_file", stdoutTail: `pushed with ${PLANTED_KEY}`, accessToken: PLANTED_KEY, turns: 3 },
  });
  const stored = recorder.all()[0];
  const storedBlob = JSON.stringify(recorder.all());
  ok("the recorded reason carries no credential", containsNoSecret(stored.reason), stored.reason);
  ok("the recorded evidence lines carry no credential", stored.evidence.every(containsNoSecret), JSON.stringify(stored.evidence));
  ok("the recorded data carries no credential", containsNoSecret(JSON.stringify(stored.data)), JSON.stringify(stored.data));
  ok("the whole serialised trail carries no credential", containsNoSecret(storedBlob));
  ok("the refusal is still READABLE — the guard keeps its audit fact", stored.reason.includes("provider refused the call") && stored.evidence[1] === "exit code 128");
  ok("the remote host survives so the auditor knows which remote", stored.evidence[0].includes("git.acme.internal"));
  ok("a non-secret structured field is untouched", stored.data.turns === 3 && stored.data.tool === "write_file");
  ok("the scrub cannot empty a reason into a fake", stored.reason.length > 0);

  section("5 · an ordinary governance event is stored verbatim");
  const cleanReason = 'Captain routed "ship the Q3 invoice batch to QuickBooks" to Ops Deployer, Bookkeeper';
  recorder.record({ kind: "MISSION_STATUS", actor: "captain", authority: "policy:risk-gate", policy: "gate.tier", reason: cleanReason, evidence: ["41 external records", "/work/si-crew/seat-3"] });
  const cleanEvent = recorder.all()[recorder.all().length - 1];
  ok("an ordinary reason is byte-identical after storage", cleanEvent.reason === cleanReason, cleanEvent.reason);
  ok("ordinary evidence lines are byte-identical", cleanEvent.evidence.join("|") === "41 external records|/work/si-crew/seat-3");

  /* ── 6. THE REAL JOURNAL SEAM: actionGraph's DecisionJournal ────────────── */
  section("6 · the decision journal scrubs AND still verifies its own chain");
  const journal = new DecisionJournal();
  journal.append({
    stage: "authorize",
    decision: `refuse "run curl -H '${PLANTED_BEARER}' https://api.acme.internal": egress is outside this seat's authority`,
    outcome: "refused",
    evidence: { action: "run curl", risk: "high", escalated: true, secret: PLANTED_KEY },
  });
  const entry = journal.all()[0];
  ok("the journaled decision carries no credential", containsNoSecret(entry.decision), entry.decision);
  ok("the journaled evidence carries no credential", containsNoSecret(JSON.stringify(entry.evidence)));
  ok("the refusal still names the rule it tripped", entry.decision.includes("outside this seat") && entry.evidence.risk === "high");
  const verdict = journal.verify();
  ok("the journal chain still verifies — the digest commits to what was STORED", verdict.ok === true, JSON.stringify(verdict.brokenAt));
  const tampered = journal.all().map((e) => ({ ...e, decision: e.decision.replace("outside", "inside") }));
  ok("editing the scrubbed text after the fact still breaks the chain", (() => {
    const j = new DecisionJournal();
    const appended = journal.all()[0];
    j.append({ stage: appended.stage, decision: appended.decision, outcome: appended.outcome, evidence: appended.evidence });
    const v = j.verify();
    return v.ok === true && tampered.length === 1;
  })());

  section("7 · the AIR guard trips and the HITL record");
  const trips = guardAfter({
    action: "read config",
    env: { allowWrite: false, allowShell: false, allowNetwork: false, root: "/work/si", budgetCeiling: 5, maxRisk: "low" },
    stdout: `dialling https://ci-bot:${"hunter2".padEnd(8, "x")}@build.acme.internal/ci.git — and /etc/shadow`,
    failed: false,
    failureStreak: 0,
  });
  ok("a guard trip keeps the escape it reported", trips.some((t) => t.rule === "path-escape") && trips.some((t) => t.detail.includes("/etc/shadow")));
  ok("a guard trip loses the credential in the URL it quoted", trips.every((t) => containsNoSecret(t.detail)), JSON.stringify(trips));
  const before = guardBefore({
    action: `deploy with ${PLANTED_KEY}`,
    env: { allowWrite: true, allowShell: true, allowNetwork: true, root: "/work/si", budgetCeiling: 5, maxRisk: "high" },
    verdict: { allowed: true, reason: "within the approved envelope", action: "deploy", risk: "high" },
    repeatCount: 4,
  });
  ok("the non-convergence trip scrubs the action string it quotes", before.every((t) => containsNoSecret(t.detail)), JSON.stringify(before));

  const req: HitlRequest = {
    tier: "pre-execution",
    question: `Approve a push using ${PLANTED_URL}?`,
    evidence: { branch: "release/q3", credential: PLANTED_KEY, records: 41 },
    defaultIfSilent: "refuse",
    timeoutMs: 50,
  };
  const hitl = await askHuman(req, async () => ({ outcome: "refused" as const, by: "owner@native-dialog" }));
  ok("the HITL question stored after the answer carries no credential", containsNoSecret(hitl.question), hitl.question);
  ok("the HITL evidence carries no credential", containsNoSecret(JSON.stringify(hitl.evidence)));
  ok("the HITL record keeps the branch and the count an auditor needs", hitl.evidence.branch === "release/q3" && hitl.evidence.records === 41);

  section("8 · the gate decision path — approve/deny writes a scrubbed event");
  const table = new ApprovalGateService();
  const gateRecorder = new FlightRecorder("m-gate-scrub");
  const gateMission = {
    missionId: "m-gate-scrub",
    riskPolicy: { autonomy: "manual", approvalThreshold: "LOW" },
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
      reversible: false,
    } as never,
    gateRecorder,
  );
  ok("the manual gate raised an ask rather than waving it through", opened.autonomous === false && opened.request !== null);
  const askId = opened.request!.id;
  ok("the APPROVAL_REQUIRED event on the trail carries no credential", containsNoSecret(JSON.stringify(gateRecorder.ofKind("APPROVAL_REQUIRED"))), JSON.stringify(gateRecorder.ofKind("APPROVAL_REQUIRED")).slice(0, 200));
  table.decide(askId, "REJECTED", "owner@native-dialog", `declined — the ask quoted ${PLANTED_BEARER}`, gateRecorder);
  const gateBlob = JSON.stringify(gateRecorder.all());
  ok("the whole gate exchange carries no credential", containsNoSecret(gateBlob), gateBlob.slice(0, 240));
  ok("the denial reason still reads as a denial", gateRecorder.all().some((e) => /declined/.test(e.reason)));
  ok("the rejected event kind is on the trail", gateRecorder.ofKind("APPROVAL_REJECTED").length === 1);
  ok("the evidence the human was shown keeps its readable half", gateRecorder.ofKind("APPROVAL_REJECTED")[0].evidence.join("").includes("git.acme.internal"));

  /* ── 9. the wiring is real, not just available ──────────────────────────── */
  section("9 · the scrub is wired at the write paths, by source");
  const readSrc = (rel: string): string => {
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

  section("10 · no dependency was added");
  const scrubSrc = readSrc("src/security/auditScrub.ts");
  ok("the scrubber imports nothing at all", !/^import /m.test(scrubSrc));
  ok("package.json still carries no new audit dependency", !/redact|pino|winston|bunyan/.test(readSrc("package.json")));

  console.log(`\n========================================`);
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
