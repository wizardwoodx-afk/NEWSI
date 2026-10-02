/**
 * Earned-authority + principal-chain probe.
 *
 * Built from four results that apply to SelfImpulse specifically, not in general:
 *  - "Are You Still the Agent I Authorized?" (Zhang & Zhang 2026) — earned
 *    authority under a FIXED CEILING, for an agent that improves after it was
 *    granted. This is the RSIRALS case.
 *  - "Bounded Agents" (Muruaga 2026) — the Agentic Principal Chain, so a
 *    delegation cannot amplify authority. This is the A2A case.
 *  - arXiv 2605.03213 — multi-agent delegation lacks intent transitivity.
 *  - NIST SP 800-162 / OWASP NHI — effective authority is the INTERSECTION of
 *    agent and user grants, never the union (confused-deputy defence).
 *
 * The theme of this probe is DIFFERENCE from the rest of the suite. A governance
 * mechanism is only worth having if it can refuse, so the refusal and abuse
 * paths are asserted first and in detail; the happy paths are the short part.
 */
import * as fs from "node:fs";
import * as path from "node:path";

import {
  ALL_CAPABILITIES, NO_EVIDENCE, currentAuthority, earnAuthority, effectiveAuthority,
  evaluateChain, grantFromEarned, grantsEqual, hasCapability, isNarrower, issueCeiling,
  narrowCeiling, narrowTo, cleanStreakOf, NO_GRANT,
  type Capability, type ChainHop, type Evidence, type Grant, type Principal,
} from "../src/security/authority";

const ROOT: string = process.env.SI_ROOT ?? process.cwd();

let passed = 0;
let failed = 0;
const failures: string[] = [];
const ok = (label: string, cond: boolean, detail = ""): void => {
  if (cond) { passed += 1; console.log(`  ok   ${label}`); }
  else { failed += 1; failures.push(`${label}${detail ? ` — ${detail}` : ""}`); console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`); }
};
const section = (n: string): void => console.log(`\n== ${n}`);

const g = (caps: Capability[], cents = 0): Grant => ({ capabilities: [...caps], budgetCents: cents });
const clean = (n: number): Evidence => ({ completedRuns: n, trippedRuns: 0, independentlyVerifiedRuns: n });

/* ───────────────────────────────────────────────────────────────────────── */
section("1. grants can only narrow — the absent operations are the enforcement");
{
  const wide = g(["read", "write", "shell", "network", "delegate", "spend"], 500);
  const narrow = g(["read", "write"], 100);

  ok("narrowTo is the intersection", grantsEqual(narrowTo(wide, narrow), narrow));
  ok("narrowTo is commutative here", grantsEqual(narrowTo(narrow, wide), narrowTo(wide, narrow)));
  ok("narrowing to nothing is nothing", grantsEqual(narrowTo(wide, NO_GRANT), NO_GRANT));
  ok("a budget is min, not max", narrowTo(wide, g(["read"], 1)).budgetCents === 1);
  ok("a child is narrower than its parent", isNarrower(narrow, wide));
  ok("a parent is NOT narrower than its child", !isNarrower(wide, narrow));
  // `wide` already holds every capability, so it cannot be widened by appending
  // to it. Use a parent with a capability the child does NOT have.
  const partialParent = g(["read", "write"], 500);
  ok("a child holding an extra capability is not narrower than its parent",
    !isNarrower(g(["read", "write", "shell"], 500), partialParent));
  ok("a child with a bigger budget is not narrower than its parent",
    !isNarrower(g(["read", "write"], 501), partialParent));
  // `isNarrower` is deliberately ASYMMETRIC: a grant that fits inside a wider
  // one is narrower than it, but the wider grant does not fit inside the narrow
  // one. That asymmetry is what makes it usable as a chain rule.
  const wider = g(["read", "write", "shell"], 500);
  ok("narrower really is narrower than wider", isNarrower(partialParent, wider));
  ok("and the relation does not hold in reverse", !isNarrower(wider, partialParent));
  ok("a grant is narrower than itself", isNarrower(partialParent, { ...partialParent, capabilities: [...partialParent.capabilities] }));

  // The structural assertion: there is no way to compose grants into something
  // larger, because the function that would do it is not exported. If someone
  // adds a `union` later, this fails.
  const mod = fs.readFileSync(path.join(ROOT, "src", "security", "authority.ts"), "utf8");
  ok("there is no exported union/widen/escalate function",
    !/export function (union|widen|escalate|grow)\b/.test(mod),
    "a grant-widening function appeared — that is the mechanism this design removes");
  ok("the ceiling is only issued from a named human", /must be fixed by a named human/.test(mod));
}

section("2. a ceiling is immutable from inside");
{
  const human = "USER 1";
  const okIssue = issueCeiling("agent-1", g(["read", "write", "shell"], 1000), human, 1000);
  ok("a human can issue a ceiling", okIssue.ok);
  const rec = (okIssue as { ok: true; record: { ceiling: Grant } }).record;

  const selfIssued = issueCeiling("agent-1", g(ALL_CAPABILITIES as Capability[], 99999), "", 1000);
  ok("an agent cannot issue its own ceiling", !selfIssued.ok, JSON.stringify(selfIssued));
  ok("the refusal says why", !selfIssued.ok && /named human/.test((selfIssued as { reason: string }).reason));
  ok("a ceiling without a principal is refused", !issueCeiling("", g(["read"]), human, 1).ok);

  const narrowed = narrowCeiling(rec, g(["read"], 50), human);
  ok("a human may narrow a ceiling", narrowed.ok);
  const n = (narrowed as { ok: true; record: { ceiling: Grant } }).record;
  ok("narrowing actually narrows", grantsEqual(n.ceiling, g(["read"], 50)));
  ok("narrowing cannot be widened by asking for more",
    grantsEqual(narrowTo(n.ceiling, g(["read", "shell"], 9999)), g(["read"], 50)));
  ok("an agent cannot narrow a ceiling either", !narrowCeiling(rec, g(["read"]), "").ok);
}

section("3. authority is EARNED from measured evidence, never self-reported");
{
  const ceiling = g(["read", "write", "shell", "network", "delegate", "spend"], 1000);

  const nothing = earnAuthority(NO_EVIDENCE, ceiling);
  ok("no evidence earns nothing", nothing.capabilities.length === 0 && nothing.budgetCents === 0);
  ok("and it says so, per capability", Object.values(nothing.reasons).every((r) => /not yet/.test(r)));

  const partial = earnAuthority(clean(2), ceiling);
  ok("two verified runs is below the threshold of three", partial.capabilities.length === 0);

  const earned = earnAuthority(clean(3), ceiling);
  ok("three independently verified runs earns the capabilities", earned.capabilities.length === 5, String(earned.capabilities.length));
  ok("spend is never earned — it is granted or it is not", !earned.capabilities.includes("spend"));
  ok("earned budget is at most half the ceiling", earned.budgetCents <= ceiling.budgetCents / 2, String(earned.budgetCents));

  // A trip resets the evidence. This is the property that makes the record mean
  // something: a run that was refused is not a run that succeeded.
  const tripped = earnAuthority({ completedRuns: 9, trippedRuns: 7, independentlyVerifiedRuns: 9 }, ceiling);
  ok("a run that tripped the guard does not count toward earning", tripped.capabilities.length === 0,
    `${tripped.capabilities.length} capabilities earned despite 7 trips`);

  // Self-verification earns nothing. This is where the cross-vendor gate pays.
  const selfVerified = earnAuthority({ completedRuns: 10, trippedRuns: 0, independentlyVerifiedRuns: 0 }, ceiling);
  ok("an agent that grades its own work earns nothing", selfVerified.capabilities.length === 0,
    `${selfVerified.capabilities.length} capabilities earned on self-verification alone`);

  // Earned authority is always a subset of the ceiling.
  const narrowCeiling = g(["read"], 10);
  const overEarned = earnAuthority(clean(100), narrowCeiling);
  ok("earning cannot exceed the ceiling", grantsEqual(grantFromEarned(overEarned, narrowCeiling), g(["read"], 5)),
    JSON.stringify(grantFromEarned(overEarned, narrowCeiling)));
}

section("4. THE AUTHORIZATION GAP: a fixed ceiling across an improving agent");
{
  const rec = issueCeiling("rsirals-1", g(["read", "write", "shell", "network", "delegate"], 1000), "USER 1", 0);
  const ceilingRec = (rec as { ok: true; record: { ceiling: Grant } }).record;

  // Minute zero: nothing earned, so the agent has read-only in practice.
  const atZero = currentAuthority({ ceiling: ceilingRec, humanGrant: ceilingRec.ceiling, evidence: NO_EVIDENCE });
  ok("at minute zero nothing is earned", grantsEqual(atZero.effective, g([], 0)), JSON.stringify(atZero.effective));
  ok("and the explanation says why", /not yet/.test(atZero.explanation), atZero.explanation);

  // Minute forty: the agent has proven itself, and gains below the ceiling.
  const later = currentAuthority({ ceiling: ceilingRec, humanGrant: ceilingRec.ceiling, evidence: clean(5) });
  ok("it earns real capability once verified", hasCapability(later.effective, "write"));
  ok("but never the spend capability", !hasCapability(later.effective, "spend"));
  ok("and never more than the ceiling", isNarrower(later.effective, ceilingRec.ceiling));

  // The human tightens the ceiling. A long-lived agent must not keep the old one.
  const tightened = narrowCeiling(ceilingRec, g(["read", "write"], 100), "USER 1");
  const after = currentAuthority({
    ceiling: (tightened as { ok: true; record: { ceiling: Grant } }).record,
    humanGrant: ceilingRec.ceiling,
    evidence: clean(50),
  });
  ok("a tightened ceiling binds even an agent with perfect evidence",
    !hasCapability(after.effective, "shell") && !hasCapability(after.effective, "network"),
    JSON.stringify(after.effective));
  ok("and it cannot exceed the tightened budget", after.effective.budgetCents <= 100);

  // The user's own current grant is also a bound.
  const userPulledBack = currentAuthority({
    ceiling: ceilingRec, humanGrant: g(["read"]), evidence: clean(50),
  });
  ok("the user's CURRENT grant binds too, however much was earned",
    grantsEqual(userPulledBack.effective, g(["read"], 0)), JSON.stringify(userPulledBack.effective));
}

section("5. THE CONFUSED DEPUTY: intersection, never union");

{
  const agentWide = g(["read", "write", "shell", "network"], 1000);
  const userNarrow = g(["read"], 0);

  const eff = effectiveAuthority(agentWide, userNarrow);
  ok("effective authority is the intersection", grantsEqual(eff, g(["read"], 0)), JSON.stringify(eff));
  ok("a narrow user cannot borrow the agent's shell", !hasCapability(eff, "shell"));
  ok("a narrow user cannot borrow the agent's budget", eff.budgetCents === 0);

  // Union is the bug. Assert the property that catches it rather than the
  // absence of a function (done in section 1) — this is the behavioural one.
  const unionWouldBe = { capabilities: [...new Set([...agentWide.capabilities, ...userNarrow.capabilities])] as Capability[], budgetCents: 1000 };
  ok("the union is strictly larger and is NOT what we compute", !grantsEqual(eff, unionWouldBe));
  ok("intersection is symmetric", grantsEqual(effectiveAuthority(userNarrow, agentWide), eff));
  ok("two narrow grants intersect to the narrower", grantsEqual(effectiveAuthority(userNarrow, g([])), NO_GRANT));
}

section("6. THE AGENTIC PRINCIPAL CHAIN: delegation may only narrow");
{
  const root: Principal = {
    id: "user-1", human: true,
    grant: g(["read", "write", "shell", "network", "delegate"], 1000),
    ceiling: g(["read", "write", "shell", "network", "delegate"], 1000),
  };

  const hop = (id: string, grant: Grant, capability?: Capability, cents = 0): ChainHop =>
    ({ principalId: id, grant, capability: capability ?? "read", budgetCents: cents });

  // The normal case: A delegates a narrower slice to B.
  const okChain = evaluateChain(root, [hop("b", g(["read", "write"], 200), "write", 200)]);
  ok("a properly narrowed chain is allowed", okChain.ok);
  ok("its effective authority is the narrowest grant", okChain.ok && grantsEqual(okChain.effective, g(["read", "write"], 200)),
    okChain.ok ? JSON.stringify(okChain.effective) : "");

  // A hop that claims MORE than it was given. This is the amplification attack.
  const amplifying = evaluateChain(root, [hop("b", g(["read", "write"], 200)), hop("c", g(["read", "write", "shell", "network", "spend"], 9000), "shell", 9000)]);
  ok("a hop that widens the chain is refused", !amplifying.ok, JSON.stringify(amplifying));
  ok("and the refusal names the offending principal", !amplifying.ok && (amplifying as { widenedAt?: string }).widenedAt === "c");
  ok("and says the rule that was broken", !amplifying.ok && /only narrow/.test((amplifying as { reason: string }).reason));

  // A capability dropped upstream cannot be resurrected downstream — the
  // intent-transitivity failure the CC survey names.
  const resurrected = evaluateChain(root, [
    hop("b", g(["read"]), "read"),
    hop("c", g(["read", "write", "shell", "network"], 9999), "shell", 0),
  ]);
  ok("a downstream principal cannot recover a dropped capability", !resurrected.ok, JSON.stringify(resurrected));

  // Budget cannot be re-inflated at a later hop.
  const inflated = evaluateChain(root, [hop("b", g(["read"], 50), "read", 50), hop("c", g(["read"], 50), "read", 5000)]);
  ok("a later hop cannot re-inflate the budget", !inflated.ok);
  ok("the refusal states both numbers", !inflated.ok && /5000c/.test((inflated as { reason: string }).reason));

  // A root with nothing cannot delegate.
  const emptyRoot: Principal = { id: "x", human: false, grant: NO_GRANT, ceiling: NO_GRANT };
  ok("an authority-free root cannot delegate", !evaluateChain(emptyRoot, [hop("b", g(["read"]))]).ok);

  // A four-hop chain that narrows at every step is fine; one that does not is not.
  const deep = evaluateChain(root, [
    hop("b", g(["read", "write", "shell"], 800), "read", 0),
    hop("c", g(["read", "write"], 500), "read", 0),
    hop("d", g(["read", "write"], 300), "read", 0),
    hop("e", g(["read", "write"], 100), "write", 100),
  ]);
  ok("a four-hop chain that narrows at every step is allowed", deep.ok);
  ok("its effective authority is the FINAL narrowest grant", deep.ok && grantsEqual(deep.effective, g(["read", "write"], 100)),
    deep.ok ? JSON.stringify(deep.effective) : "");

  // An empty chain is the root itself, and is valid.
  ok("an empty chain yields the root's own authority", evaluateChain(root, []).ok);
}

section("7. this is not an unused library");
{
  const mod = fs.readFileSync(path.join(ROOT, "src", "security", "authority.ts"), "utf8");
  ok("the module is standalone and typed", /export function evaluateChain/.test(mod));
  ok("it refuses rather than throwing on abuse", mod.includes('ok: false'));
  ok("all six capabilities are named and covered", ALL_CAPABILITIES.length === 6);
  // And it must be reachable from the runtime, or it is decoration.
  const wired = [
    "src/security/actionGraph.ts",
    "src/mission/teamExecutor.ts",
    "src/mission/a2aBridge.ts",
    "src/engine/hermesRuntime.ts",
  ].some((f) => fs.existsSync(path.join(ROOT, f)) && fs.readFileSync(path.join(ROOT, f), "utf8").includes("authority"));
  ok("at least one runtime path references the authority module", wired,
    "the module is not imported anywhere — it would be a library, not a control");
}

/* ───────────────────────────────────────────────────────────────────────── */
section("§9. A TRIP MUST ACTUALLY RESET THE RECORD (the arithmetic bug)");
{
  // The old rule was `completed - tripped`, which is a lifetime NET, not a
  // reset: 10 clean, 1 trip, 10 more clean leaves 19 and the seat is already
  // forgiven. The docs claimed a reset; the code subtracted. These assertions
  // are the ones the old suite was missing.

  const CEIL: Grant = { capabilities: ["read", "write", "shell", "network", "delegate", "spend"], budgetCents: 10_000 };
  const ev = (o: Partial<Evidence>): Evidence => ({ completedRuns: 0, trippedRuns: 0, independentlyVerifiedRuns: 0, ...o });

  ok("20 runs with 1 trip, and NO position for it, earns nothing",
    earnAuthority(ev({ completedRuns: 20, trippedRuns: 1, independentlyVerifiedRuns: 19 }), CEIL).capabilities.length === 0,
    "a lifetime net is being treated as a clean streak");
  ok("…and the reason says a net is not a reset",
    /not a reset|clean streak cannot be shown/.test(earnAuthority(ev({ completedRuns: 20, trippedRuns: 1, independentlyVerifiedRuns: 19 }), CEIL).reasons.read ?? ""));
  ok("10 clean, 1 trip, 10 more clean with the trip's position stated DOES earn",
    earnAuthority(ev({ completedRuns: 20, trippedRuns: 1, independentlyVerifiedRuns: 19, lastTripAtRun: 10, cleanStreakRuns: 10, cleanStreakVerified: 10 }), CEIL).capabilities.includes("write"));
  ok("…because 10 verified runs have been rebuilt since the trip",
    (earnAuthority(ev({ completedRuns: 20, trippedRuns: 1, independentlyVerifiedRuns: 19, lastTripAtRun: 10, cleanStreakRuns: 10, cleanStreakVerified: 10 }), CEIL).reasons.read ?? "").includes("after it count"));
  ok("a trip on the LAST run earns nothing, whatever the lifetime total says",
    earnAuthority(ev({ completedRuns: 20, trippedRuns: 1, independentlyVerifiedRuns: 19, lastTripAtRun: 20, cleanStreakRuns: 0, cleanStreakVerified: 0 }), CEIL).capabilities.length === 0,
    "a seat that just tripped is trusted again on its old record");
  ok("a trip two runs ago is still not forgiven",
    earnAuthority(ev({ completedRuns: 20, trippedRuns: 1, independentlyVerifiedRuns: 19, lastTripAtRun: 19, cleanStreakRuns: 1, cleanStreakVerified: 1 }), CEIL).capabilities.length === 0);
  ok("a missing streak-verified count is not a free pass",
    earnAuthority(ev({ completedRuns: 20, trippedRuns: 1, independentlyVerifiedRuns: 19, lastTripAtRun: 5, cleanStreakRuns: 15 }), CEIL).capabilities.length === 0,
    "the streak is treated as verified without saying so");
  ok("a streak longer than the run count is refused as a forgery",
    earnAuthority(ev({ completedRuns: 20, trippedRuns: 1, independentlyVerifiedRuns: 19, lastTripAtRun: 5, cleanStreakRuns: 99, cleanStreakVerified: 99 }), CEIL).capabilities.length === 0,
    "a streak longer than the history is accepted");
  ok("…and it is named as untrustworthy, not as 'not yet'",
    /cannot be trusted/.test(earnAuthority(ev({ completedRuns: 20, trippedRuns: 1, independentlyVerifiedRuns: 19, lastTripAtRun: 5, cleanStreakRuns: 99, cleanStreakVerified: 99 }), CEIL).reasons.read ?? ""));

  ok("with NO trip at all, the whole history counts (nothing had to be excluded)",
    earnAuthority(ev({ completedRuns: 12, independentlyVerifiedRuns: 12 }), CEIL).capabilities.includes("write"));
  ok("a trip count of zero must not be faked by a missing field",
    earnAuthority(ev({ completedRuns: 12, trippedRuns: 0, independentlyVerifiedRuns: 12, lastTripAtRun: 0, cleanStreakRuns: 0 }), CEIL).capabilities.length === 0,
    "an unpopulated streak was ignored for a never-tripped seat");

  ok("an unsound streak yields a ZERO grant, not a reduced one",
    grantFromEarned(earnAuthority(ev({ completedRuns: 20, trippedRuns: 1, independentlyVerifiedRuns: 19 }), CEIL), CEIL).budgetCents === 0);
  ok("and still no spend, whatever the evidence",
    !earnAuthority(ev({ completedRuns: 20, trippedRuns: 1, independentlyVerifiedRuns: 19 }), CEIL).capabilities.includes("spend"));

  const streak = cleanStreakOf(ev({ completedRuns: 20, trippedRuns: 1, independentlyVerifiedRuns: 19 }));
  ok("cleanStreakOf refuses to invent a streak", streak.sound === false && streak.clean === 0);
  ok("cleanStreakOf reports the whole history when nothing has tripped",
    cleanStreakOf(ev({ completedRuns: 7, independentlyVerifiedRuns: 6 })).sound === true && cleanStreakOf(ev({ completedRuns: 7, independentlyVerifiedRuns: 6 })).clean === 7);
  ok("cleanStreakOf measures from the trip, not from zero",
    cleanStreakOf(ev({ completedRuns: 20, trippedRuns: 1, lastTripAtRun: 12, cleanStreakRuns: 8, cleanStreakVerified: 8 })).clean === 8);
  ok("a negative counter cannot buy authority",
    earnAuthority(ev({ completedRuns: 20, trippedRuns: 1, lastTripAtRun: 12, cleanStreakRuns: -5, cleanStreakVerified: -5 }), CEIL).capabilities.length === 0);
}

console.log(`\n${passed} passed, ${failed} failed.`);
if (failed) {
  console.log(failures.map((f) => `  - ${f}`).join("\n"));
  process.exit(1);
}
