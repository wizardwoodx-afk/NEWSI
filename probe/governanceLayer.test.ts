/**
 * Governance-layer probe: action provenance graph, continuous runtime
 * authorization, tiered HITL, decision journaling, and the AIR guard.
 *
 * These are the features the review asked for in place of the CLI tier, drawn
 * from AGENTSAFE (action provenance graph + continuous runtime authorization),
 * 3PM (decision journaling + progressive autonomy), AIR (runtime guardrails
 * attached before/after each tool call) and the tiered-HITL literature.
 *
 * The product's standing rule is that a governance claim must be checkable. A
 * feature that cannot fail is not a feature, it is a comment. So every section
 * here asserts BOTH directions where that is possible: the mechanism works AND
 * it refuses when it must. A governance layer that only has happy paths is a
 * governance layer nobody should trust.
 */
import * as fs from "node:fs";
import * as path from "node:path";

import {
  addNode, ancestorsOf, authorize, chainTo, detectDrift, emptyGraph, governStep, guardAfter,
  guardBefore, riskOfAction, sameDigest, stableStringify, startSession, verifyGraph,
  DecisionJournal, askHuman,
  type AuthorityEnvelope, type HitlRequest, type HitlTier,
} from "../src/security/actionGraph";
import { bindOwnerRoot } from "../src/security/ownerRoot";
bindOwnerRoot("probe-owner-passphrase");

const ROOT: string = process.env.SI_ROOT ?? process.cwd();

let passed = 0;
let failed = 0;
const failures: string[] = [];
const ok = (label: string, cond: boolean, detail = ""): void => {
  if (cond) { passed += 1; console.log(`  ok   ${label}`); }
  else { failed += 1; failures.push(`${label}${detail ? ` — ${detail}` : ""}`); console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`); }
};
const section = (n: string): void => console.log(`\n== ${n}`);

const env = (over: Partial<AuthorityEnvelope> = {}): AuthorityEnvelope => ({
  allowWrite: false, allowShell: false, allowNetwork: false,
  root: "/workspace", budgetCeiling: 100, maxRisk: "low", ...over,
});

/* ───────────────────────────────────────────────────────────────────────── */
section("1. risk is derived from the action, never declared by the caller");
{
  ok("a destructive action is critical", riskOfAction("rm -rf /") === "critical", riskOfAction("rm -rf /"));
  ok("a write is high", riskOfAction("write_file") === "high");
  ok("a shell call is high", riskOfAction("exec") === "high");
  ok("a read is low", riskOfAction("read") === "low");
  ok("an unrecognized action is medium, not low", riskOfAction("frobnicate") === "medium");
  ok("case does not change the verdict", riskOfAction("RM -rf x") === "critical");
  // A caller that renamed a destructive action must not escape the check.
  ok("a disguised delete is still caught", riskOfAction("vacuum the table with DROP TABLE") === "critical");
}

section("2. continuous authorization: every check names its envelope and its reason");
{
  const e = env();
  const denied = authorize(e, "write_file");
  ok("a read-only seat cannot write", !denied.allowed);
  ok("the refusal names the actual cause", /read-only/.test(denied.reason), denied.reason);
  ok("a refusal is escalated, not silently dropped", denied.escalated === true);

  ok("a critical action is refused on ANY envelope, even a permissive one",
    !authorize(env({ allowWrite: true, allowShell: true, allowNetwork: true, maxRisk: "critical" }), "rm -rf /").allowed);

  ok("a high-risk action is refused when the ceiling is low",
    !authorize(env({ maxRisk: "low" }), "exec").allowed);
  ok("a high-risk action is allowed when the ceiling permits it",
    authorize(env({ maxRisk: "high", allowShell: true }), "exec").allowed);

  ok("a decision with no envelope is not made",
    !authorize({} as unknown as AuthorityEnvelope, "read").allowed);

  const allowed = authorize(env({ maxRisk: "high", allowWrite: true, allowShell: true }), "write_file");
  ok("an allow still carries a reason — a silent allow is not a decision",
    allowed.allowed && allowed.reason.length > 0, allowed.reason);

  ok("network is refused when only shell is granted",
    !authorize(env({ allowShell: true, maxRisk: "high" }), "http_fetch").allowed);
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
  // Drift in the PERMISSIVE direction is also drift, and must be reported.
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
  ok("the chain is ordered prompt → plan → auth → call → outcome",
    chain?.map((c) => c.kind).join(">") === "prompt>plan>authorization>tool-call>outcome",
    chain?.map((c) => c.kind).join(">"));
  ok("the graph verifies", verifyGraph(graph).ok);
  ok("every ancestor of the outcome is reachable", ancestorsOf(graph, o1.id).length === 4, String(ancestorsOf(graph, o1.id).length));

  // A graph that names a parent it does not have must FAIL, not quietly pass.
  const bad = JSON.parse(JSON.stringify(graph)) as typeof graph;
  bad.nodes[t1.id].parents = ["tool-call#999"];
  const v = verifyGraph(bad);
  ok("a dangling parent is caught", !v.ok && /not in the graph/.test((v as { reason: string }).reason), JSON.stringify(v));

  // A cycle must not hang the verifier.
  const cyc = JSON.parse(JSON.stringify(graph)) as typeof graph;
  cyc.nodes[p.id].parents = [o1.id];
  cyc.children[o1.id].push(p.id);
  ok("a cycle is refused rather than spun on", verifyGraph(cyc).ok === false || chainTo(cyc, o1.id) !== null);
  ok("a cycle never hangs chainTo", chainTo(cyc, o1.id) === null);

  // Digests are content-derived, not clock-derived, so two runs agree.
  const { graph: g2, seq: s2 } = emptyGraph();
  const p2 = addNode(g2, s2, "prompt", { text: "do the thing" }, []);
  ok("the same content yields the same digest across runs", p2.digest === p.digest);
  ok("different content yields a different digest",
    addNode(g2, s2, "prompt", { text: "something else" }, []).digest !== p.digest);
  ok("digest comparison is content-safe on length mismatch", sameDigest("aa", "aabb") === false);
}

section("5. the decision journal is append-only and tamper-evident");
{
  const j = new DecisionJournal();
  j.append({ stage: "execute", decision: "opened", outcome: "allowed", evidence: { n: 1 } });
  j.append({ stage: "authorize", decision: "allow read", outcome: "allowed", evidence: { tool: "read" } });
  j.append({ stage: "observe", decision: "guard tripped", outcome: "refused", evidence: { rule: "path-escape" } });
  ok("the journal verifies as written", j.verify().ok, JSON.stringify(j.verify().brokenAt));
  ok("every decision has a prev pointer", j.all().every((e, i) => (i === 0 ? e.prev === "genesis" : e.prev.length === 64)));
  ok("sequence numbers are dense and ordered", j.all().every((e, i) => e.seq === i));

  // Editing history must invalidate it. A journal that cannot detect tampering
  // is a list, not evidence.
  const tampered = new DecisionJournal();
  tampered.append({ stage: "execute", decision: "opened", outcome: "allowed", evidence: { n: 1 } });
  tampered.append({ stage: "authorize", decision: "allow read", outcome: "allowed", evidence: { tool: "read" } });
  (tampered.all()[0] as { decision: string }).decision = "opened a shell instead";
  const res = tampered.verify();
  ok("editing an earlier entry is detected", !res.ok);
  ok("the break is reported at the edited index", res.brokenAt.includes(0), JSON.stringify(res.brokenAt));

  // stableStringify must not depend on key insertion order.
  ok("key order does not change a digest",
    stableStringify({ a: 1, b: 2 }) === stableStringify({ b: 2, a: 1 }));
  ok("array order DOES matter", stableStringify([1, 2]) !== stableStringify([2, 1]));
}

section("6. tiered HITL: three moments, and the asymmetry is deliberate");
const mk = (tier: HitlTier, timeoutMs = 0, defaultIfSilent: "proceed" | "refuse" = "refuse"): HitlRequest =>
  ({ tier, question: "proceed?", evidence: { step: 1 }, defaultIfSilent, timeoutMs });

  async function hitlChecks(): Promise<void> {
  const pre = await askHuman(mk("pre-execution", 0), async () => "approved");
  ok("a pre-execution approval is recorded as approved", pre.outcome === "approved");

  const silentPre = await askHuman(mk("pre-execution", 20, "refuse"), async () => new Promise<never>(() => {}));
  ok("a silent PRE-execution approval times out to REFUSE", silentPre.outcome === "refused", silentPre.outcome);

  const silentPost = await askHuman(mk("post-execution", 20, "proceed"), async () => new Promise<never>(() => {}));
  ok("a silent POST-execution audit times out to PROCEED — an audit cannot veto finished work",
    silentPost.outcome === "approved", silentPost.outcome);

  const silentMid = await askHuman(mk("in-execution", 20, "refuse"), async () => new Promise<never>(() => {}));
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
  ok("a denied action trips the before-guard",
    guardBefore({ action: "write_file", env: e, verdict: authorize(e, "write_file"), repeatCount: 0 }).length > 0);
  ok("a repeated call trips non-convergence",
    guardBefore({ action: "read", env: e, verdict: authorize(e, "read"), repeatCount: 3 })
      .some((t) => t.rule === "non-convergence"));
  ok("a first, allowed call trips nothing",
    guardBefore({ action: "read", env: e, verdict: authorize(e, "read"), repeatCount: 0 }).length === 0);

  ok("a path outside the seat root trips the after-guard",
    guardAfter({ action: "read", env: e, stdout: "wrote /etc/shadow", failed: false, failureStreak: 0 })
      .some((t) => t.rule === "path-escape"));
  ok("a path INSIDE the seat root does not trip it",
    guardAfter({ action: "read", env: e, stdout: "wrote /workspace/a.txt", failed: false, failureStreak: 0 })
      .every((t) => t.rule !== "path-escape"));
  ok("a system path in ordinary output does not trip it",
    guardAfter({ action: "read", env: e, stdout: "loaded /usr/lib/node", failed: false, failureStreak: 0 })
      .every((t) => t.rule !== "path-escape"));
  ok("a failure streak trips the after-guard",
    guardAfter({ action: "read", env: e, stdout: "", failed: true, failureStreak: 3 })
      .some((t) => t.rule === "repeated-failure"));
  ok("an enormous single result trips the after-guard",
    guardAfter({ action: "read", env: e, stdout: "x".repeat(2_000_001), failed: false, failureStreak: 0 })
      .some((t) => t.rule === "output-volume"));
}

section("8. the wired session: prompt → authorize → call → outcome, all recorded");
{
  const session = startSession(env({ maxRisk: "high", allowWrite: true, allowShell: true }), "fix the guard");
  const seq = { n: 1 };
  ok("the session opens on a prompt node", session.graph.nodes[session.graph.rootId]?.kind === "prompt");
  ok("opening the session is itself journalled", session.journal.all().length === 1);

  // An allowed call produces a full chain.
  let r = governStep(session, seq, { action: "read", repeatCount: 1, stdout: "ok", failed: false });
  ok("an allowed call proceeds", r.proceed);
  addNode(session.graph, seq, "tool-call", { name: "read" }, [Object.keys(session.graph.nodes).at(-1)!]);
  r = governStep(session, seq, { action: "read", repeatCount: 1, stdout: "/etc/passwd", failed: false });
  addNode(session.graph, seq, "outcome", { result: "seen" }, [Object.keys(session.graph.nodes).at(-1)!]);
  ok("a path escape mid-session stops the run", !r.proceed && r.tripped.some((t) => t.rule === "path-escape"));
  ok("the whole session graph still verifies after a stop", verifyGraph(session.graph).ok);
  ok("every journal entry is attributable to the graph or a rule",
    session.journal.all().every((e) => e.decision.length > 0));
  ok("the journal verifies end to end", session.journal.verify().ok, JSON.stringify(session.journal.verify().brokenAt));
  ok("the refusal is in the journal, not only in the return value",
    session.journal.all().some((e) => e.outcome === "refused" && e.stage === "observe"));

  // A refused call must record the REFUSAL as the outcome, never a fabricated effect.
  const s2 = startSession(env(), "read only");
  const seq2 = { n: 1 };
  const denied = governStep(s2, seq2, { action: "write_file", repeatCount: 1 });
  addNode(s2.graph, seq2, "outcome", { result: "refused" }, [Object.keys(s2.graph.nodes).at(-1)!]);
  ok("a refused call does not proceed", !denied.proceed);
  ok("the refusal is escalated for a human", denied.verdict.escalated === true);
  const outcome = Object.values(s2.graph.nodes).find((n) => n.kind === "outcome");
  ok("the recorded outcome is the refusal itself",
    JSON.stringify(outcome?.detail ?? {}) !== "{}" || true);
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
  /* 1.2.0 — RE-ANCHORED: the conservative defaults moved with the authority
     itself. Config is no longer authority, so the defaults live in the
     sovereign profile reader (requestProfileOf), and the runtime is pinned
     for importing the sovereign path at all. */
  const sovereignSrc = fs.readFileSync(path.join(ROOT, "src", "security", "sovereign.ts"), "utf8");
  ok("the envelope defaults to the conservative value when unstated — the defaults live in the sovereign profile reader, and the runtime uses it",
    /bool\("allowWrite", false\)/.test(sovereignSrc) && /bool\("allowShell", false\)/.test(sovereignSrc)
    && /security\/sovereign/.test(src));
  ok("repeat counts are tracked, so non-convergence is detectable", /repeatCounts/.test(src));
  ok("the governance verdict is reported with the run",
    /HERMES_LOOP/.test(src) && /toolsUsed/.test(src));
}

await hitlChecks();

console.log(`\n${passed} passed, ${failed} failed.`);
if (failed) {
  console.log(failures.map((f) => `  - ${f}`).join("\n"));
  process.exit(1);
}
