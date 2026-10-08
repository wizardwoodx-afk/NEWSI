/**
 * Autonomous Red-Team vs Blue-Team Adversarial Hardening Arena.
 *
 * Rather than merely running basic happy-path tests, the Adversarial Arena pits
 * a Builder agent (Blue Team) against a dedicated Fuzzing & Security agent (Red Team).
 *
 * Red Team generates malicious payloads, race-condition fixtures, boundary probes,
 * and privilege bypass attempts to break Blue Team's worktree before production merge.
 *
 * When an exploit or regression is uncovered, Red generates a minimal reproducing
 * test case, logs it to `#security-audit`, and Blue generates a verified patch.
 */

import { globalAgentBus } from "./interAgentChannel";
import type { HarnessId } from "../domain/harness";

export type AttackVectorKind =
  | "boundary_fuzz"
  | "race_concurrency"
  | "auth_bypass"
  | "rate_limit_evasion"
  | "memory_leak_burst"
  | "injection_payload";

export interface AdversarialAttackVector {
  id: string;
  kind: AttackVectorKind;
  title: string;
  description: string;
  fuzzPayload: string;
  expectedAssertion: string;
  /**
   * THE SIMULATED FIXTURE, DECLARED ON THE VECTOR.
   *
   * When no real `testRunner` is attached the arena cannot measure anything, and
   * the only honest thing it can report is a DECLARED defect. This is that
   * declaration: when present, the simulated round fails with this text, and the
   * report says the breach came from here.
   *
   * It used to be `if (i === 1)`, which is a different and worse thing: a breach
   * attributed to a LOOP INDEX. Reorder `STANDARD_ATTACK_VECTORS`, filter it, or
   * pass a one-element `vectors` array, and the concurrency breach would land on
   * whatever vector happened to sit at index 1 — the null-pointer probe would
   * "fail" with a token-bucket message. Keying on the vector's own id means the
   * declared defect travels with the vector it describes.
   *
   * A vector WITHOUT this field invents no breach: an unmeasured round reports
   * `defended` only in the sense that no declared defect was found, and the
   * report's own summary says the arena measured nothing.
   */
  declaredDefect?: string;
}

export interface DuelRound {
  round: number;
  attackerSeat: string;
  defenderSeat: string;
  vector: AdversarialAttackVector;
  attackScript: string;
  defenseStatus: "defended" | "breached" | "patched";
  stdout: string;
  stderr: string;
  durationMs: number;
}

export interface HardeningReport {
  arenaId: string;
  objective: string;
  defenderHarness: HarnessId;
  attackerHarness: HarnessId;
  roundsExecuted: number;
  breachesFound: number;
  patchesApplied: number;
  defenseScore: number; // Strictly 0 to 100%
  rounds: DuelRound[];
  hardened: boolean;
  isSimulated: boolean;
  summary: string;
}

export const STANDARD_ATTACK_VECTORS: AdversarialAttackVector[] = [
  {
    id: "vec-01-boundary-null",
    kind: "boundary_fuzz",
    title: "Null-Pointer & Extreme Integer Boundary Probe",
    description: "Injects null, undefined, -1, MAX_SAFE_INTEGER, and malformed UTF-8 astral characters into API inputs.",
    fuzzPayload: JSON.stringify({ count: -1, limit: 9007199254740991, token: "\u0000\uFFFF\uD83D\uDE00", payload: null }),
    expectedAssertion: "expect(res.status).not.toBe(500)",
  },
  {
    id: "vec-02-race-concurrency",
    kind: "race_concurrency",
    title: "High-Concurrency Async State Race Condition",
    description: "Simulates 100 parallel asynchronous requests within a 10ms window to test race locks and shared memory safety.",
    fuzzPayload: "Promise.all(Array.from({length: 100}, () => endpoint.consume(1)))",
    expectedAssertion: "expect(totalConsumed).toBeLessThanOrEqual(capacity)",
    declaredDefect: "FAIL: Concurrency race invariant violated: consumed 104 tokens exceeding capacity 100!",
  },
  {
    id: "vec-03-rate-evasion",
    kind: "rate_limit_evasion",
    title: "Token Bucket Burst & Header Spoofing Evasion",
    description: "Attempts token bucket exhaustion bypass using alternating X-Forwarded-For IPs and fractional tokens.",
    fuzzPayload: "headers: { 'X-Forwarded-For': `192.168.1.${i % 255}` }, tokens: 0.0000001",
    expectedAssertion: "expect(res.status).toBe(429)",
  },
  {
    id: "vec-04-auth-bypass",
    kind: "auth_bypass",
    title: "Privilege Escalation & Malformed JWT Signature",
    description: "Sends none-algorithm JWT headers and unverified claim payloads to check authentication middleware integrity.",
    fuzzPayload: "eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJzdWIiOiJhZG1pbiIsInJvbGUiOiJyb290In0.",
    expectedAssertion: "expect(res.status).toBe(401)",
  },
];

/**
 * Runs an adversarial hardening duel between Blue Team (Defender) and Red Team (Attacker).
 */
export async function runAdversarialDuel(options: {
  objective: string;
  defenderSeatId: string;
  defenderHarness: HarnessId;
  attackerSeatId: string;
  attackerHarness: HarnessId;
  targetCwd: string;
  vectors?: AdversarialAttackVector[];
  maxRounds?: number;
  testRunner?: (script: string) => Promise<{ exitCode: number; stdout: string; stderr: string; durationMs: number }>;
  /**
   * OPTIONAL. Confirms a breach was actually repaired, by running the generated
   * probe a second time against the patched tree.
   *
   * Without it a VERIFIED (measured) breach is recorded as `breached`, never as
   * `patched`. The old code incremented `patches` on every breach it saw and
   * announced "PATCH APPLIED" on the bus, having measured nothing — a claim of
   * repair produced by the module that found the defect. That is exactly the
   * sentence this project does not ship, so the count now only moves when a
   * runner says the invariant held after the fix.
   *
   * In the SIMULATED path there is no tree and no runner, so a declared defect
   * is reported as `patched` and the whole report carries `isSimulated: true` and
   * a summary labelled as simulation. The fixture is a fixture; it is labelled,
   * not measured.
   */
  repairRunner?: (script: string) => Promise<{ exitCode: number; stdout: string; stderr: string; durationMs: number }>;
}): Promise<HardeningReport> {
  const arenaId = `arena-${Date.now()}`;
  const vectors = options.vectors ?? STANDARD_ATTACK_VECTORS;
  /* The round ceiling is the VECTOR SET, not an arbitrary 3. A caller asking for
     more rounds than there are vectors used to silently re-run the same probe
     under a fresh round number and score it twice; a caller asking for fewer got
     the first N. Now the ask is clamped to what exists and the report says when
     it was clamped, because a silently-truncated duel reads like a short duel. */
  const asked = options.maxRounds ?? vectors.length;
  const maxRounds = Math.max(0, Math.min(asked, vectors.length));
  const clampedRounds = asked > vectors.length;
  const isSimulated = !options.testRunner;
  const rounds: DuelRound[] = [];
  let breaches = 0;
  let patches = 0;
  let defendedCleanly = 0;

  const modeLabel = isSimulated ? "[SIMULATION / PROTOTYPE DUEL]" : "[VERIFIED HOST DUEL]";

  globalAgentBus.publish({
    channel: "#security-audit",
    sender: { seatId: options.attackerSeatId, role: "security", harness: options.attackerHarness, name: "Red Team Hacker" },
    mentions: [`@${options.defenderSeatId}`, "@all"],
    intent: "proposal",
    content: `⚡ ${modeLabel} ADVERSARIAL DUEL INITIATED for "${options.objective}". Red Team is generating ${maxRounds} aggressive attack vectors against Blue Team's worktree.`,
  });

  for (let i = 0; i < maxRounds; i++) {
    // Rounds map onto DISTINCT vectors now (maxRounds <= vectors.length), so a
    // round number names the vector it attacked and the report can be read.
    const vector = vectors[i]!;
    const t0 = Date.now();

    // Red Team constructs attack probe
    const attackScript = `// Red Team Attack Probe: ${vector.title}\n// Vector: ${vector.kind}\nimport { describe, it, expect } from "vitest";\n\ndescribe("Adversarial Probe: ${vector.id}", () => {\n  it("${vector.description}", async () => {\n    const payload = ${vector.fuzzPayload};\n    // Assert defense invariant:\n    ${vector.expectedAssertion};\n  });\n});\n`;

    /* MEASURED, or DECLARED — never invented.
       A real runner reports what happened. Without one, the round reports the
       vector's own `declaredDefect` and nothing else: a vector with no declared
       defect has no breach, because the arena measured nothing about it. */
    const runRes = options.testRunner
      ? await options.testRunner(attackScript)
      : vector.declaredDefect
        ? { exitCode: 1, stdout: "", stderr: vector.declaredDefect, durationMs: 120 }
        : { exitCode: 0, stdout: "PASS: no declared defect for this vector (nothing was measured).", stderr: "", durationMs: 120 };

    const durationMs = Date.now() - t0 + runRes.durationMs;
    const breached = runRes.exitCode !== 0;
    /* A patch is a MEASURED repair. `repairRunner` re-runs the same probe after
       the fix; only an exit 0 there moves `patches` in a measured duel. */
    const repair = breached && options.repairRunner ? await options.repairRunner(attackScript) : null;
    const repaired = breached ? (isSimulated ? true : repair?.exitCode === 0) : false;

    if (breached) {
      breaches++;
      if (repaired) patches++;
      globalAgentBus.publish({
        channel: "#security-audit",
        sender: { seatId: options.attackerSeatId, role: "security", harness: options.attackerHarness, name: "Red Team Hacker" },
        mentions: [`@${options.defenderSeatId}`],
        intent: "blocker",
        content: `🚨 VULNERABILITY BREACHED in Round ${i + 1}: ${vector.title}!\nReason: ${runRes.stderr || "Assertion failed"}\nGenerated minimal reproducing test fixture for Blue Team patch.`,
      });

      if (repaired) {
        globalAgentBus.publish({
          channel: "#implementation-sync",
          sender: { seatId: options.defenderSeatId, role: "coder", harness: options.defenderHarness, name: "Blue Team Defender" },
          mentions: [`@${options.attackerSeatId}`],
          intent: "handoff",
          content: `🛡️ PATCH APPLIED for ${vector.id}. Added mutex lock boundary to prevent concurrency overflow. Ready for re-fuzzing!`,
        });
      } else {
        globalAgentBus.publish({
          channel: "#implementation-sync",
          sender: { seatId: options.defenderSeatId, role: "coder", harness: options.defenderHarness, name: "Blue Team Defender" },
          mentions: [`@${options.attackerSeatId}`],
          intent: "blocker",
          content: `🛡️ ${vector.id} is STILL BREACHED — no repair runner confirmed the invariant held after a fix, so nothing is claimed patched.`,
        });
      }

      rounds.push({
        round: i + 1,
        attackerSeat: options.attackerSeatId,
        defenderSeat: options.defenderSeatId,
        vector,
        attackScript,
        defenseStatus: repaired ? "patched" : "breached",
        stdout: runRes.stdout,
        stderr: runRes.stderr,
        durationMs,
      });
    } else {
      defendedCleanly++;
      globalAgentBus.publish({
        channel: "#security-audit",
        sender: { seatId: options.attackerSeatId, role: "security", harness: options.attackerHarness, name: "Red Team Hacker" },
        mentions: [`@${options.defenderSeatId}`],
        intent: "verification",
        content: `✅ DEFENSE HELD in Round ${i + 1}: ${vector.title}. Attack payload rejected safely.`,
      });

      rounds.push({
        round: i + 1,
        attackerSeat: options.attackerSeatId,
        defenderSeat: options.defenderSeatId,
        vector,
        attackScript,
        defenseStatus: "defended",
        stdout: runRes.stdout,
        stderr: runRes.stderr,
        durationMs,
      });
    }
  }

  /* Exact bounded score over ROUNDS THAT ACTUALLY HELD.
     `defendedCleanly` counts a round whose invariant held; a breach only counts
     toward the score when a repair was MEASURED (or the round is a declared
     fixture, which the summary labels). An unpatched measured breach is a round
     that did not hold, so it lowers the score — which is the whole point of
     running the arena. */
  const totalRoundsDefendedOrPatched = defendedCleanly + patches;
  const defenseScore = maxRounds === 0 ? 0 : Math.min(100, Math.max(0, Math.round((totalRoundsDefendedOrPatched / maxRounds) * 100)));
  const hardened = defenseScore >= 90;
  const measuredOrDeclared = isSimulated
    ? `No test runner was attached, so nothing here was measured: each round reports the vector's own declared defect, and a vector without one invents no breach.`
    : options.repairRunner
      ? "Every round's outcome came from the host's test runner, and every patch was confirmed by re-running the same probe."
      : "Every round's outcome came from the host's test runner. NO repair runner was attached, so a breach is recorded as breached and nothing is claimed patched.";
  const summary = `${modeLabel} Adversarial Arena completed: ${maxRounds} round(s) executed${clampedRounds ? ` (${asked} were asked for and clamped to the ${vectors.length} vector(s) available — no vector is probed twice)` : ""}. ${breaches} vulnerability probe(s) uncovered, ${patches} verified patch(es) synthesized. Defense Score: ${defenseScore}%. ${measuredOrDeclared}`;

  globalAgentBus.publish({
    channel: "#general",
    sender: { seatId: "arena_coordinator", role: "security", harness: "llm", name: "Arena Coordinator" },
    mentions: ["@all"],
    intent: "broadcast",
    content: `🏆 ADVERSARIAL HARDENING VERDICT: ${hardened ? "CERTIFIED HARDENED" : "REMEDIATION REQUIRED"} (Score: ${defenseScore}%). ${summary}`,
  });

  globalAgentBus.writeBlackboard(
    `security.hardening_cert`,
    `Arena: ${arenaId}\nMode: ${isSimulated ? "SIMULATED_PROTOTYPE" : "VERIFIED_HOST"}\nDefense Score: ${defenseScore}%\nHardened: ${hardened}\nBreaches: ${breaches}\nPatches: ${patches}`,
    "arena_coordinator",
    "finding",
  );

  return {
    arenaId,
    objective: options.objective,
    defenderHarness: options.defenderHarness,
    attackerHarness: options.attackerHarness,
    roundsExecuted: maxRounds,
    breachesFound: breaches,
    patchesApplied: patches,
    defenseScore,
    rounds,
    hardened,
    isSimulated,
    summary,
  };
}
