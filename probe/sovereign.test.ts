/**
 * §SOVEREIGN AUTHORITY probe — config alone issues nothing.
 *
 * v1.1.0's external review found the honest gap: the runtime derived a
 * seat's AuthorityEnvelope from its own configuration, and the live loop's
 * drift check compared the issued envelope to itself. This suite pins the
 * sovereign path that replaces both defects:
 *
 *   §1  a requested profile is a REQUEST — without the owner's signature it
 *       issues no envelope at all;
 *   §2  a mandate verifies — and a tampered, foreign-signed, expired, or
 *       owner-less mandate refuses, each with its own reason;
 *   §3  the envelope comes from the mandate and only from the mandate;
 *   §4  the LIVE drift loop: a governed session whose source reports an
 *       attenuated, escalated, or unavailable authority STOPS the run —
 *       the detector that could never fire in v1.1.0, firing;
 *   §5  a configuration change under a live mandate is drift — read()
 *       returns null and the loop fail-closes;
 *   §6  the front door speaks the same language: the PolicyGateway's
 *       decisions now name the sovereign, and the anonymous default-allow
 *       is gone.
 */
import assert from "node:assert/strict";
import {
  envelopeFromMandate, issueMandate,
  profileDigest, requestProfileOf, SovereignAuthority, sessionSigner,
  verifyMandate, type SovereignMandate,
} from "../src/security/sovereign";
import { authorize, detectDrift, governStep, startSession, type AuthorityEnvelope } from "../src/security/actionGraph";
import { propose, _resetPolicyRulesForProbe } from "../src/selfimpulse/engine/policyGateway";

let pass = 0;
let fail = 0;
function ok(label: string, cond: boolean, detail = ""): void {
  if (cond) { pass += 1; console.log(`  ok   ${label}`); }
  else { fail += 1; console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`); }
}
function section(name: string): void { console.log(`\n== ${name}`); }

/* ── fixtures ───────────────────────────────────────────────────────────── */

function seat(config: Record<string, unknown>): { id: string; title: string; config: Record<string, unknown> } {
  return { id: "seat.test.1", title: "Test seat", config };
}

const CONSERVATIVE: AuthorityEnvelope = {
  allowWrite: false, allowShell: false, allowNetwork: false,
  root: "/tmp/si-workspace", budgetCeiling: 0, maxRisk: "low",
};

/* ── §1 the request, and nothing without a signature ───────────────────── */

section("1. a requested profile is a REQUEST — config alone issues nothing");
{
  const node = seat({ allowWrite: true, allowShell: true, allowNetwork: true, maxRisk: "high", workspaceRoot: "/tmp/si-workspace" });
  const profile = requestProfileOf(node);
  ok("the profile reads the configuration honestly", profile.allowWrite === true && profile.maxRisk === "high" && profile.root === "/tmp/si-workspace");
  ok("the profile names the agent and the owner it belongs to", profile.agentId === "seat.test.1" && profile.owner === "owner");

  const authority = new SovereignAuthority();
  ok("with no mandate issued, the live read returns NOTHING", authority.read(node) === null,
    "config is not authority");
  ok("profileDigest is stable and content-bound", profileDigest(profile) === profileDigest(requestProfileOf(node))
    && profileDigest(profile) !== profileDigest(requestProfileOf(seat({ allowWrite: false }))));

  const conservative = requestProfileOf(seat({}));
  ok("absent config resolves to the CONSERVATIVE profile",
    conservative.allowWrite === false && conservative.allowShell === false && conservative.allowNetwork === false
    && conservative.maxRisk === "low" && conservative.budgetCeiling === 0);
}

/* ── §2 the mandate verifies, and refuses by name ───────────────────────── */

section("2. a mandate verifies — tampered, foreign, expired and owner-less refuse by name");
{
  const signer = sessionSigner();
  const node = seat({ allowWrite: true, maxRisk: "medium", workspaceRoot: "/tmp/si-workspace" });
  const profile = requestProfileOf(node);
  const mandate = issueMandate(profile, signer, 60_000);
  ok("a fresh mandate verifies", verifyMandate(mandate, signer).ok === true);

  const tampered: SovereignMandate = { ...mandate, env: { ...mandate.env, allowWrite: false } };
  const t = verifyMandate(tampered, signer);
  ok("a tampered envelope refuses as bad-signature", t.ok === false && t.reason === "bad-signature", t.ok ? "" : t.detail);

  const foreign = sessionSigner(); // a different keypair — someone else's key material
  const f = verifyMandate(mandate, foreign);
  ok("a foreign owner key refuses", f.ok === false && f.reason === "bad-signature");

  /* ttl is clamped to >=1ms, so expiry is proven by letting a 1ms mandate age out. */
  const expired = issueMandate(profile, signer, 1);
  const spinStart = Date.now();
  while (Date.now() - spinStart < 5) { /* let the 1ms mandate die */ }
  const e = verifyMandate(expired, signer);
  ok("an expired mandate refuses as expired", e.ok === false && e.reason === "expired");

  const ownerless: SovereignMandate = { ...mandate, owner: "" };
  const o = verifyMandate(ownerless, signer);
  ok("a mandate that names no human refuses as no-owner", o.ok === false && o.reason === "no-owner");

  const n = verifyMandate(null, signer);
  ok("a missing mandate refuses as missing", n.ok === false && n.reason === "missing");
}

/* ── §3 the envelope comes from the mandate ─────────────────────────────── */

section("3. the envelope comes from the mandate — and only from a VERIFIED mandate");
{
  const signer = sessionSigner();
  const profile = requestProfileOf(seat({ allowWrite: true, maxRisk: "high", workspaceRoot: "/tmp/si-workspace", budgetCeiling: 500 }));
  const mandate = issueMandate(profile, signer);
  const env = envelopeFromMandate(mandate, signer);
  ok("the envelope carries exactly what the owner signed",
    env?.allowWrite === true && env.maxRisk === "high" && env.budgetCeiling === 500 && env.root === "/tmp/si-workspace");
  ok("authorize() accepts the mandate's envelope for a write", authorize(env!, "fs_write").allowed === true);
  ok("authorize() still refuses CRITICAL on the seat's own authority", authorize(env!, "rm_rf").allowed === false && authorize(env!, "rm_rf").escalated === true);

  const revoked = envelopeFromMandate(issueMandate(requestProfileOf(seat({})), signer), signer);
  ok("a conservative mandate issues a read-only envelope", revoked?.allowWrite === false && revoked.allowShell === false);

  /* The render VERIFIES. Before this, `envelopeFromMandate` was exported beside
   * the exported `issueMandate` and did no checking at all, so anyone who could
   * reach both could mint an allowShell envelope with no signature anywhere in
   * the path — and the bootstrap guard could not help, because that composition
   * never went near it. */
  const foreign = sessionSigner(); // a different keypair — someone else's key material
  ok("a foreign key renders NOTHING — the render verifies, it does not trust",
    envelopeFromMandate(mandate, foreign) === null);
  ok("a tampered envelope renders NOTHING",
    envelopeFromMandate({ ...mandate, env: { ...mandate.env, allowShell: true } }, signer) === null);
  ok("an unsigned mandate renders NOTHING",
    envelopeFromMandate({ ...mandate, signature: undefined } as never, signer) === null);
  ok("an expired mandate renders NOTHING", (() => {
    const shortLived = issueMandate(profile, signer, 1);
    // Force the clock past the TTL without sleeping on a wall-clock timer.
    return envelopeFromMandate({ ...shortLived, expiresAt: Date.now() - 1 }, signer) === null;
  })());
}

/* ── §4 the LIVE drift loop — the detector that can now actually fire ───── */

section("4. the governed loop detects live drift — attenuated, escalated, unavailable");
{
  const issued: AuthorityEnvelope = { allowWrite: true, allowShell: false, allowNetwork: false, root: "/w", budgetCeiling: 100, maxRisk: "medium" };

  // attenuated mid-run
  const s1 = startSession(issued, "drift probe", { source: () => ({ ...issued, allowWrite: false }) });
  const r1 = governStep(s1, { n: 1 }, { action: "fs_write", repeatCount: 1 });
  ok("an ATTENUATED authority stops the step", r1.proceed === false);
  ok("the stop names the authority-drift rule", r1.tripped.some((t) => t.rule === "authority-drift"));
  ok("the journal records the drift as a refusal", s1.journal.all().some((e) => e.stage === "drift" && e.outcome === "refused"));

  // ESCALATED mid-run — the direction v1.1.0 could never see
  const s2 = startSession(issued, "drift probe", { source: () => ({ ...issued, allowNetwork: true }) });
  const r2 = governStep(s2, { n: 1 }, { action: "fs_write", repeatCount: 1 });
  ok("an ESCALATED authority stops the step too", r2.proceed === false);
  ok("the escalation is the drift the journal names", s2.journal.all().some((e) => e.stage === "drift" && (e.decision ?? "").includes("ESCALATED")));

  // unavailable mid-run — fail-closed
  const s3 = startSession(issued, "drift probe", { source: () => null });
  const r3 = governStep(s3, { n: 1 }, { action: "read_file", repeatCount: 1 });
  ok("an UNAVAILABLE authority fail-closes even a read", r3.proceed === false);
  ok("the refusal says the authority was revoked, not merely denied", (r3.verdict.reason + r3.tripped.map((t) => t.detail).join("; ")).includes("revoked"));

  // a stable source changes nothing
  const s4 = startSession(issued, "calm probe", { source: () => issued });
  const r4 = governStep(s4, { n: 1 }, { action: "read_file", repeatCount: 1 });
  ok("a stable authority proceeds exactly as before", r4.proceed === true && r4.verdict.allowed === true);

  // detectDrift still answers directly (the unit contract is untouched)
  ok("detectDrift: attenuation and escalation both reported",
    detectDrift(issued, { ...issued, allowWrite: false }) !== null
    && detectDrift(issued, { ...issued, allowShell: true }) !== null
    && detectDrift(issued, issued) === null);
}

/* ── §5 config change under a live mandate is drift ─────────────────────── */

section("5. a configuration change under a live mandate reads as NO authority");
{
  const authority = new SovereignAuthority();
  authority.bindOwnerSigner(sessionSigner()); // this section tests drift, not the bootstrap window
  const node = seat({ allowWrite: true, maxRisk: "medium", workspaceRoot: "/tmp/si-workspace" });
  const claim = authority.mandateFor(node);
  ok("the sovereign issues the mandate", claim.ok === true && claim.issued === true);
  ok("the live read verifies against the issued profile", authority.read(node) !== null);

  node.config.allowWrite = false; // the config moved under the mandate
  ok("after the config changed, the read returns NOTHING (fail-closed)", authority.read(node) === null);
  ok("mandateOf agrees: the mandate no longer vouches for this seat", authority.mandateOf(node) === null);

  const back = authority.mandateFor(node); // a NEW issuance over the new profile
  ok("a changed profile gets a FRESH mandate (an owner act, not a drift)", back.ok === true && back.issued === true);
  ok("…and the live read verifies again", authority.read(node) !== null);
}

/* ── §6 one throat — the front door speaks the sovereign language ───────── */

section("6. the PolicyGateway is a downstream adapter — no anonymous default-allow");
{
  _resetPolicyRulesForProbe();
  const r1 = propose({ tool: "workspace_write", detail: "write file.txt", args: { name: "f.txt", content: "x" } });
  ok("risky tools keep their historical rule: steer", r1.decision === "steer" && r1.rule === "risky-tool-requires-approval");

  const r2 = propose({ tool: "system_info", detail: "system info" });
  ok("a low-risk read is allowed under a NAMED sovereign rule", r2.decision === "allow" && r2.rule === "sovereign-safe-class",
    `${r2.decision}/${r2.rule}`);

  const r3 = propose({ tool: "rm_rf_workspace", detail: "delete everything" });
  ok("a CRITICAL action is denied outright at the front door", r3.decision === "deny" && r3.rule === "sovereign-critical-refuses",
    `${r3.decision}/${r3.rule}`);

  /* npm_publish: not in the hand-named risky set, but HIGH risk by class —
     exactly the action the envelope must catch that a name list would miss. */
  const r4 = propose({ tool: "npm_publish_package", detail: "publish it" });
  ok("a HIGH-risk action outside the envelope steers to the human", r4.decision === "steer" && r4.rule === "sovereign-envelope",
    `${r4.decision}/${r4.rule}`);
}

console.log(`\nsovereign: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
