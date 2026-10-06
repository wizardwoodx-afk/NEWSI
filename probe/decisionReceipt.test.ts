/**
 * probe/decisionReceipt.test.ts — 11h-decision/1.
 *
 * What is being pinned here is a posture, not a format: a REFUSAL is the
 * decision this product most needs to be able to defend. An allow is implied by
 * the run continuing, so it barely needs recording. A deny is the exact place a
 * fail-open bug would live, and the evidence system has to survive someone
 * editing the log afterwards.
 *
 * So the load-bearing assertions are the hostile ones: flip a deny to an allow,
 * rename the rule that refused, widen the grant, replay against different
 * evidence, and add a field after signing. Each of those must fail loudly, and
 * each must SAY why.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import {
  buildDecisionReceipt, verifyDecisionReceipt, evidencePackDigest,
  decisionReceiptEvent, type DecisionBody, type DecisionReceipt,
} from "../src/security/decisionReceipt";
import { NO_EVIDENCE, NO_GRANT, narrowTo } from "../src/security/authority";
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

const PACK = { journal: 12, head: "abc123", policy: "selfimpulse-baseline", graph: 41 };
const WRITER = { capabilities: ["read", "write", "shell"] as const, budgetCents: 5000 };

function bodyOf(over: Partial<DecisionBody> = {}): DecisionBody {
  return {
    decisionId: "d-seat-7-write",
    principal: "seat-7",
    action: "write",
    role: "reviewer",
    effect: "deny",
    rule: "reviewer-cannot-write",
    reason: "role \"reviewer\" may not mutate the workspace",
    grant: { capabilities: ["read", "write", "shell"], budgetCents: 5000 },
    evidence: { completedRuns: 9, trippedRuns: 1, independentlyVerifiedRuns: 7 },
    evidenceDigest: "",
    issuedAt: "2026-09-28T10:00:00.000Z",
    ...over,
  };
}

async function main(): Promise<void> {
  const packDigest = await evidencePackDigest(PACK);
  const refusal = await buildDecisionReceipt(bodyOf({ evidenceDigest: packDigest }));

  section("1. it is a real receipt, not a log line");
  {
    ok("the format is named", refusal.format === "11h-decision/1", refusal.format);
    ok("it carries the decision in words", refusal.body.reason.length > 10 && refusal.body.rule === "reviewer-cannot-write");
    ok("it carries the effect", refusal.body.effect === "deny");
    ok("it carries the authority in force", Array.isArray(refusal.body.grant.capabilities) && refusal.body.grant.capabilities.length === 3);
    ok("it carries the evidence it was made against", refusal.body.evidenceDigest === packDigest);
    ok("it has a digest", /^[0-9a-f]{64}$/.test(refusal.digest), refusal.digest);
    const v = await verifyDecisionReceipt(refusal, packDigest);
    ok("it verifies against the evidence it names", v.ok === true, JSON.stringify(v));
  }

  section("2. tampering is caught, and caught with a reason");
  {
    const flip = JSON.parse(JSON.stringify(refusal)) as DecisionReceipt;
    flip.body.effect = "allow";
    const v = await verifyDecisionReceipt(flip, packDigest);
    ok("flipping a deny to an allow FAILS", v.ok === false);
    ok("and it says the body was altered", !v.ok && /altered after signing/.test(v.reason), v.ok ? "" : v.reason);

    const renamed = JSON.parse(JSON.stringify(refusal)) as DecisionReceipt;
    renamed.body.rule = "totally-fine-rule";
    ok("renaming the rule FAILS", (await verifyDecisionReceipt(renamed, packDigest)).ok === false);

    const reworded = JSON.parse(JSON.stringify(refusal)) as DecisionReceipt;
    reworded.body.reason = "allowed because the operator said so";
    ok("rewording the reason FAILS", (await verifyDecisionReceipt(reworded, packDigest)).ok === false);

    const promoted = JSON.parse(JSON.stringify(refusal)) as DecisionReceipt;
    promoted.body.principal = "the-operator";
    ok("re-attributing the principal FAILS", (await verifyDecisionReceipt(promoted, packDigest)).ok === false);

    const roleless = JSON.parse(JSON.stringify(refusal)) as DecisionReceipt;
    roleless.body.role = "coder";   // the same decision, claimed for a writer instead
    ok("changing the role the decision was made under FAILS", (await verifyDecisionReceipt(roleless, packDigest)).ok === false);

    const forgedSig = JSON.parse(JSON.stringify(refusal)) as DecisionReceipt;
    forgedSig.signature = forgedSig.signature ? `${"0".repeat(128)}` : "00";
    const v2 = await verifyDecisionReceipt(forgedSig, packDigest);
    ok("a forged signature FAILS", v2.ok === false);
    ok("and it names the signature check", !v2.ok && /signature/.test(v2.reason), v2.ok ? "" : v2.reason);

    const extra = JSON.parse(JSON.stringify(refusal)) as DecisionReceipt;
    (extra as unknown as Record<string, unknown>).approvedBy = "someone important";
    const v3 = await verifyDecisionReceipt(extra, packDigest);
    ok("a field smuggled in AFTER signing FAILS", v3.ok === false);
    ok("and it names the unsigned field", !v3.ok && /unsigned field/.test(v3.reason), v3.ok ? "" : v3.reason);
  }

  section("3. a receipt cannot be replayed against different evidence");
  {
    const otherPack = await evidencePackDigest({ ...PACK, journal: 13 });
    ok("a different journal is a different evidence pack", otherPack !== packDigest);
    const v = await verifyDecisionReceipt(refusal, otherPack);
    ok("verifying against the wrong pack FAILS", v.ok === false);
    ok("and it says evidence mismatch, not just 'invalid'", !v.ok && /evidence mismatch/.test(v.reason), v.ok ? "" : v.reason);
    ok("omitting the pack still verifies the receipt itself (it is self-consistent)",
      (await verifyDecisionReceipt(refusal)).ok === true);
    ok("…but the self-consistent answer still reports the effect, so a caller can see what it decided",
      (await verifyDecisionReceipt(refusal)).ok && (await verifyDecisionReceipt(refusal)).effect === "deny");
  }

  section("4. it refuses to be vague");
  {
    const neither = await buildDecisionReceipt(bodyOf({ effect: "maybe" as DecisionBody["effect"], evidenceDigest: packDigest }));
    ok("an effect that is neither allow nor deny is rejected", (await verifyDecisionReceipt(neither, packDigest)).ok === false);
    ok("a null rule is allowed but stays null — the reason still carries the words",
      (await buildDecisionReceipt(bodyOf({ rule: null, evidenceDigest: packDigest }))).body.rule === null);
    ok("an unknown format is rejected", (await verifyDecisionReceipt({ ...refusal, format: "nope/9" } as DecisionReceipt, packDigest)).ok === false);
  }

  section("5. the unsigned posture is honest, never a silent pass");
  {
    // A runtime with no Ed25519 still produces a digest; it must not claim a key.
    const unsigned: DecisionReceipt = { ...refusal, issuer: null, signature: null, signatureNote: "no Ed25519 in this runtime" };
    const v = await verifyDecisionReceipt(unsigned, packDigest);
    ok("an unsigned receipt still verifies its body", v.ok === true && v.signed === false, JSON.stringify(v));
    ok("and it explains the absence rather than passing quietly", v.ok && typeof v.reason === "string" && v.reason.length > 10, v.ok ? String(v.reason) : "");
    // The real builder, on whatever this runtime can actually do, must never
    // leave a null signature unexplained.
    const real = await buildDecisionReceipt(bodyOf({ evidenceDigest: packDigest }));
    ok("the builder's own receipt either signs, or says why it could not",
      real.signature !== null || (typeof real.signatureNote === "string" && /not issuer-signed/i.test(real.signatureNote)),
      real.signature !== null ? "signed" : String(real.signatureNote));
    ok("a signed receipt carries no excuse attached", real.signature === null || real.signatureNote === undefined);
    ok("a caller cannot mistake it for a pass", v.ok === true && v.signed === false);
    const tampered = JSON.parse(JSON.stringify(unsigned)) as DecisionReceipt;
    tampered.body.effect = "allow";
    ok("but tampering with an UNSIGNED body is still caught", (await verifyDecisionReceipt(tampered, packDigest)).ok === false);
  }

  section("6. it belongs INSIDE the evidence pack, not beside it");
  {
    const ev = decisionReceiptEvent(refusal, 3);
    ok("it becomes a decision.receipt event", ev.kind === "decision.receipt" && ev.seq === 3);
    ok("the event names the principal as the seat", ev.seatId === "seat-7");
    ok("it carries the decision digest into the chain", ev.data.decisionDigest === refusal.digest);
    ok("it carries the evidence digest it is bound to", ev.data.evidenceDigest === packDigest);
    ok("it records whether it was actually signed, not merely that it has a signature field",
      ev.data.signed === (refusal.signature !== null));
    ok("it carries the rule name so the chain is readable without the receipt",
      ev.data.rule === "reviewer-cannot-write" && ev.data.effect === "deny");
  }

  section("7. the runtime actually mints these on REFUSAL");
  {
    const src = fs.readFileSync(path.join(ROOT, "src", "engine", "hermesRuntime.ts"), "utf8");
    ok("hermesRuntime imports the receipt builder", src.includes("security/decisionReceipt"));
    ok("it mints inside the policy-denial branch", /verdict0\.effect === "deny"[\s\S]{0,2200}buildDecisionReceipt\(/.test(src));
    ok("the journal entry records the decision digest", /decisionDigest: receipt\.digest/.test(src));
    ok("…and whether it was signed", /signed: receipt\.signature !== null/.test(src));
    ok("the decision is bound to the journal state it was made against", /evidencePackDigest\(\{[\s\S]{0,200}journal:/.test(src));
    ok("allows are not signed — one signature per tool call would cost real time for a record nobody reads",
      (src.match(/buildDecisionReceipt\(/g) ?? []).length === 1);
    ok("the refusal still stops the run", /verdict0\.effect === "deny"[\s\S]{0,3000}break;/.test(src));
  }

  section("8. the authority named in a receipt is the one that was really in force");
  {
    // The decision records what the engine enforced. If a reviewer can narrow a
    // grant afterwards, the receipt must not follow the later state.
    const full = await buildDecisionReceipt(bodyOf({ grant: { ...WRITER, capabilities: [...WRITER.capabilities] }, evidenceDigest: packDigest }));
    const narrowed = narrowTo(full.body.grant, { capabilities: ["read"], budgetCents: 0 });
    ok("narrowing the grant in force produces a different receipt", JSON.stringify(narrowed) !== JSON.stringify(full.body.grant));
    const withNarrowed = await buildDecisionReceipt(bodyOf({ grant: narrowed, evidenceDigest: packDigest }));
    ok("so a receipt minted under narrowed authority has a different digest", withNarrowed.digest !== full.digest);
    ok("and each still verifies on its own terms",
      (await verifyDecisionReceipt(full, packDigest)).ok === true && (await verifyDecisionReceipt(withNarrowed, packDigest)).ok === true);
    ok("a seat with no authority says so rather than implying a grant",
      NO_GRANT.capabilities.length === 0 && NO_EVIDENCE.completedRuns === 0);
  }

  console.log(`\n${passed} passed, ${failed} failed.`);
  if (failed) {
    console.log(failures.map((f) => `  - ${f}`).join("\n"));
    process.exit(1);
  }
}

void main();
