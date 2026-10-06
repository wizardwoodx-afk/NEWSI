/**
 * §CANONICAL AUTHORITY probe — one root, one mandate format, approvals that
 * become portable authority.
 *
 * v1.2.0's review named the last two authority gaps: the sovereign's session
 * key was a second root beside authorityCore/authorityWeb, and a human
 * approval was receipted UI state rather than a signed capability. This
 * suite pins the closure:
 *
 *   §1  ONE mandate format — a sovereign mandate renders as a canonical
 *       vh.mandate.v1 CoreMandate, verifiable by the same key, with scope
 *       derived mechanically from the envelope;
 *   §2  ONE root, bindable — bindOwnerSigner re-keys issuance to the OWNER;
 *       until then the root honestly reports "bootstrap";
 *   §3  revocation — a revoked seat reads as NO authority and the roster
 *       shows it;
 *   §4  the capability — minted from a human approval, audience-bound,
 *       redeem-once, expiring, depth-zero; every refusal names itself;
 *   §5  the seams are WIRED — the gate mints on approval, the executor
 *       feeds the FinOps ledger.
 */
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  SovereignAuthority, canonicalScopeOf, sessionSigner, sovereign,
  toCanonicalMandate, verifyCanonicalMandate,
} from "../src/security/sovereign";
import { bindOwnerRoot, deriveOwnerSigner, lockOwnerRoot } from "../src/security/ownerRoot";
import { registerReadOnlyOperation, sealReadOnlyRegistry } from "../src/security/capability";
import { stableStringify } from "../src/security/actionGraph";
import {
  _resetCapabilitiesForProbe, mintCapability, redemptionOf,
  redeemCapability, verifyCapability, type ScopedCapability,
} from "../src/security/capability";

declare const SI_ROOT: string;
const ROOT = typeof SI_ROOT === "string" && SI_ROOT.length > 0 ? SI_ROOT : process.cwd();

let pass = 0;
let fail = 0;
function ok(label: string, cond: boolean, detail = ""): void {
  if (cond) { pass += 1; console.log(`  ok   ${label}`); }
  else { fail += 1; console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`); }
}
function section(name: string): void { console.log(`\n== ${name}`); }

const seat = (config: Record<string, unknown>, id = "seat.canon.1"): { id: string; title: string; config: Record<string, unknown> } =>
  ({ id, title: id, config });

section("1. one mandate format — vh.mandate.v1 everywhere");
{
  const signer = sessionSigner();
  const authority = new SovereignAuthority(signer);
  authority.bindOwnerSigner(signer); // this section pins the mandate FORMAT — the owner is present
  const node = seat({ allowWrite: true, allowNetwork: true, maxRisk: "medium", workspaceRoot: "/tmp/w" });
  const claim = authority.mandateFor(node);
  assert.ok(claim.ok);
  const canon = toCanonicalMandate(claim.mandate, signer);
  ok("the canonical mandate verifies against the SAME key", verifyCanonicalMandate(canon, signer) === true);
  ok("it carries the canonical agent/owner identity", canon.agentId === "seat.canon.1" && canon.owner === "owner");
  ok("scope is derived mechanically from the envelope — write and network, no shell",
    JSON.stringify(canon.scope) === JSON.stringify(["fs.write", "net.fetch", "risk:medium"]),
    canon.scope.join(","));
  ok("a local seat's mandate is depth-zero — attenuation only, never re-delegation", canon.maxDepth === 0);
  ok("the budget cap travels as the envelope carried it", canon.budgetCap === 0);
  ok("canonicalScopeOf is monotone: more envelope, more scope",
    canonicalScopeOf({ ...claim.mandate.env, allowShell: true }).includes("shell.exec"));

  const foreign = sessionSigner();
  ok("a foreign key cannot verify the mandate — one root per issuance", verifyCanonicalMandate(canon, foreign) === false);
}

section("2. one root — the owner's key, bindable");
{
  const authority = new SovereignAuthority(); // bootstraps its session key
  ok("before binding, the root is honestly \"bootstrap\"", authority.root === "bootstrap");
  const owner = sessionSigner();
  authority.bindOwnerSigner(owner);
  ok("after binding, the root is \"owner\"", authority.root === "owner");
  const claim = authority.mandateFor(seat({ allowWrite: true, workspaceRoot: "/tmp/w" }), 60_000);
  assert.ok(claim.ok);
  ok("the mandate was signed by the OWNER's key id", claim.signerId === owner.id);
  const canon = toCanonicalMandate(claim.mandate, owner);
  ok("…and the canonical form verifies against the owner key", verifyCanonicalMandate(canon, owner) === true);
  ok("the bootstrap key cannot verify it — no dual-root ambiguity",
    verifyCanonicalMandate(canon, sessionSigner()) === false);
}

section("2b. the LIVE bind — the runtime derives the owner root, not a probe");
{
  /* THE LIVE BIND: the owner's presence proof on this machine is the vault
   * passphrase. The shipped UI derives the owner key from it at unlock and
   * binds it as THE root — bootstrap is only the pre-unlock label. */
  ok("before the bind, the global sovereign honestly says \"bootstrap\"", sovereign.root === "bootstrap");
  const live = bindOwnerRoot("the owner's vault passphrase");
  ok("the live runtime binds the owner root from the vault passphrase", live.ok === true && sovereign.root === "owner");
  ok("the derivation is deterministic — same passphrase, same owner key across sessions",
    deriveOwnerSigner("the owner's vault passphrase").id === deriveOwnerSigner("the owner's vault passphrase").id);
  ok("a different passphrase derives a different root — no guessing at authority",
    deriveOwnerSigner("another passphrase").id !== deriveOwnerSigner("the owner's vault passphrase").id);
  const claim = sovereign.mandateFor(seat({ allowWrite: true, workspaceRoot: "/tmp/w" }, "seat.live.1"), 60_000);
  assert.ok(claim.ok);
  ok("after the bind, live issuance carries the OWNER key id",
    claim.signerId === deriveOwnerSigner("the owner's vault passphrase").id);

  /* LOCK LOCKS: locking the vault takes the owner's authority out of
   * memory — unbound root, swept capabilities, fail-closed seats. */
  const ownerCap = mintCapability({ approvalId: "lock-1", subject: "s", audience: "si.runtime", action: "workspace_write", resource: "report.md", ttlMs: 60_000 });
  lockOwnerRoot();
  ok("LOCK unbinds the owner root — back to the honest bootstrap label", sovereign.root === "bootstrap");
  ok("owner-signed capabilities stop verifying once the key is gone — a key that is gone cannot vouch",
    verifyCapability(ownerCap.capability, "si.runtime").ok === false);
  const seatLive = seat({ allowWrite: true, workspaceRoot: "/tmp/w" }, "seat.live.1");
  ok("the owner's mandates stop reading too — seats fail-closed while locked", sovereign.read(seatLive) === null);

  /* UNLOCK re-binds the SAME key — stable identity pays its dividend. */
  const rebind = bindOwnerRoot("the owner's vault passphrase");
  ok("UNLOCK re-binds the same owner key (the derivation is stable per vault)", rebind.ok === true && sovereign.root === "owner");
  ok("…and the owner's mandates verify and read again — nothing was lost, nothing was forged",
    sovereign.read(seatLive) !== null);
  const after = verifyCapability(ownerCap.capability, "si.runtime");
  ok("capabilities minted before the lock stay DEAD after the same key returns — a lock kills outstanding capabilities",
    after.ok === false && after.reason === "invalidated");
}

section("3. revocation is sticky — only an explicit owner regrant lifts it");
{
  const authority = new SovereignAuthority();
  const owner = sessionSigner();
  authority.bindOwnerSigner(owner); // the regrant law needs an owner to enforce
  const node = seat({ allowWrite: true, workspaceRoot: "/tmp/w" }, "seat.revoke.1");
  assert.ok(authority.mandateFor(node).ok);
  ok("live before revocation", authority.read(node) !== null);
  authority.revoke("seat.revoke.1");
  ok("read returns NOTHING after revocation — fail-closed at the next governed step", authority.read(node) === null);
  ok("the roster seam reports the revocation", authority.isRevoked("seat.revoke.1") === true);
  const runtimeTry = authority.mandateFor(node);
  ok("the runtime path (mandateFor) REFUSES a revoked seat — it can never un-revoke",
    runtimeTry.ok === false && runtimeTry.reason === "revoked");
  ok("still revoked after the runtime tried", authority.read(node) === null && authority.isRevoked("seat.revoke.1") === true);
  const back = authority.regrant(node);
  ok("an explicit OWNER regrant is the only way back", back.ok === true && authority.read(node) !== null && authority.isRevoked("seat.revoke.1") === false);
}

section("4. the capability — an approval made portable");
{
  _resetCapabilitiesForProbe();
  const minted = mintCapability({
    approvalId: "appr-1", subject: "si.captain", audience: "si.runtime",
    action: "workspace_write", resource: "report.md", budget: 0, ttlMs: 60_000,
  });
  ok("minting returns a signed capability and its digest", minted.capability.signature !== null && minted.digest.length === 64);

  const c = minted.capability;
  ok("audience match verifies", verifyCapability(c, "si.runtime").ok === true);
  const wrongAud = verifyCapability(c, "some.other.plane");
  ok("a wrong audience is refused BY NAME", wrongAud.ok === false && wrongAud.reason === "wrong-audience");
  ok("depth is zero by construction", c.delegationDepth === 0);

  const first = redeemCapability(c, "si.runtime");
  ok("the first redemption succeeds", first.ok === true);
  const replay = redeemCapability(c, "si.runtime");
  ok("a replayed redemption is refused — one approval, one use", replay.ok === false && replay.reason === "already-redeemed");
  ok("the redemption is attributable", redemptionOf(c)?.by === "si.runtime");

  /* ONE ROOT, proven behaviorally: the sovereign's own current root key
   * verifies the capability signature — mandates and capabilities carry
   * the same key's word. There is no independent capability key. */
  const rootKey = sovereign.currentRootSigner();
  const base = {
    v: c.v, subject: c.subject, audience: c.audience, action: c.action, resource: c.resource,
    missionId: c.missionId, budget: c.budget, issuedAt: c.issuedAt, expiresAt: c.expiresAt,
    delegationDepth: c.delegationDepth, approvalId: c.approvalId,
  };
  ok("the SOVEREIGN'S root key verifies the capability signature — one root signs mandates and capabilities",
    rootKey.verify(stableStringify(base), c.signature));

  const tampered: ScopedCapability = { ...c, action: "shell_exec" };
  const t = verifyCapability(tampered, "si.runtime");
  ok("a tampered capability refuses as forged", t.ok === false && t.reason === "bad-signature");

  const shortLived = mintCapability({ approvalId: "appr-2", subject: "s", audience: "a", action: "x", resource: "y", ttlMs: 1 });
  const spin = Date.now();
  while (Date.now() - spin < 5) { /* let it expire */ }
  const e = verifyCapability(shortLived.capability, "a");
  ok("an expired capability refuses — an approval is not a standing power", e.ok === false && e.reason === "expired");
}

section("4b. the bootstrap window — read-only yes, effectful no");
{
  _resetCapabilitiesForProbe();
  lockOwnerRoot(); // back to bootstrap: no owner proof in this room
  const readOnly = mintCapability({ approvalId: "boot-1", subject: "s", audience: "si.runtime", action: "read", resource: "notes.md", ttlMs: 60_000 });
  ok("under bootstrap, an exactly-registered READ-ONLY operation still mints — the window is useful, not powerful",
    readOnly.capability.signature !== null);
  let unregistered = "";
  try {
    mintCapability({ approvalId: "boot-1b", subject: "s", audience: "si.runtime", action: "read.workspace", resource: "notes.md", ttlMs: 60_000 });
  } catch (e) {
    unregistered = e instanceof Error ? e.message : String(e);
  }
  ok("a dotted sub-action is effectful until its plane registers it BY NAME",
    /bootstrap/.test(unregistered));
  registerReadOnlyOperation("read.workspace");
  ok("…and after registration it mints — explicit, not inferred",
    mintCapability({ approvalId: "boot-1c", subject: "s", audience: "si.runtime", action: "read.workspace", resource: "notes.md", ttlMs: 60_000 }).capability.signature !== null);
  for (const trap of ["read_delete", "list_and_delete", "get_shell"]) {
    let msg = "";
    try {
      mintCapability({ approvalId: `trap-${trap}`, subject: "s", audience: "si.runtime", action: trap, resource: "x", ttlMs: 60_000 });
    } catch (e) {
      msg = e instanceof Error ? e.message : String(e);
    }
    ok(`prefix tricks stay effectful: ${trap}`, /bootstrap/.test(msg), msg.slice(0, 60));
  }
  let refused = "";
  try {
    mintCapability({ approvalId: "boot-2", subject: "s", audience: "si.runtime", action: "workspace_write", resource: "x", ttlMs: 60_000 });
  } catch (e) {
    refused = e instanceof Error ? e.message : String(e);
  }
  ok("under bootstrap, an EFFECTFUL capability REFUSES — no owner proof, no effect",
    /bootstrap/.test(refused) && /no effectful capability/.test(refused));
  let refusedShell = "";
  try {
    mintCapability({ approvalId: "boot-3", subject: "s", audience: "si.runtime", action: "authority.issue", resource: "scope", ttlMs: 60_000 });
  } catch (e) {
    refusedShell = e instanceof Error ? e.message : String(e);
  }
  ok("unknown actions default to effectful — the honest default is refusal, not hope", /bootstrap/.test(refusedShell));
  bindOwnerRoot("the owner's vault passphrase"); // restore the owner for the seams below
  ok("under the OWNER root, the same effectful capability mints freely",
    mintCapability({ approvalId: "own-1", subject: "s", audience: "si.runtime", action: "workspace_write", resource: "x", ttlMs: 60_000 }).capability.signature !== null);
}

section("4c. the issuance throat — bootstrap mandates are read-only, regrant is owner-only");
{
  lockOwnerRoot(); // no owner proof in this room
  const authority = new SovereignAuthority(); // bootstrap by construction
  const writer = seat({ allowWrite: true, workspaceRoot: "/tmp/w" }, "seat.window.1");
  const denied = authority.mandateFor(writer);
  ok("BOOTSTRAP + EFFECTFUL PROFILE → DENIED, by name, at mandateFor",
    denied.ok === false && denied.reason === "bootstrap-effectful-mandate"
    && /read-only until the owner/.test(denied.detail), JSON.stringify(denied));
  ok("the denied seat reads as NO authority — there is nothing to read", authority.read(writer) === null);
  const reader = seat({}, "seat.window.2");
  const allowed = authority.mandateFor(reader);
  ok("BOOTSTRAP + READ-ONLY PROFILE → still issued (the window stays useful)", allowed.ok === true);
  ok("the read-only mandate really is read-only", allowed.ok === true && allowed.mandate.env.allowWrite === false && allowed.mandate.env.allowNetwork === false);
  ok("BOOTSTRAP + REGRANT → DENIED, by name — no owner, no regrant",
    authority.regrant(writer).ok === false && authority.regrant(writer).reason === "owner-required");
  const owner = sessionSigner();
  authority.bindOwnerSigner(owner);
  const afterBind = authority.mandateFor(writer);
  ok("OWNER BOUND + the same effectful profile → issued", afterBind.ok === true && afterBind.signerId === owner.id);
  authority.revoke("seat.window.1");
  ok("owner regrant lifts the revocation (the ONLY path that can)", authority.regrant(writer).ok === true && authority.isRevoked("seat.window.1") === false);
  bindOwnerRoot("probe-owner-passphrase"); // restore the global owner for later sections
}

section("5. the seams are wired — runtime, not exports");
{
  const gate = fs.readFileSync(path.join(ROOT, "src", "selfimpulse", "engine", "selfimpulse.ts"), "utf8");
  ok("the human gate MINTS, VERIFIES, then grants — never true on faith",
    /mintCapability\(/.test(gate) && /verifyCapability\(/.test(gate) && /capability: capabilityDigest/.test(gate)
    && /capability-unavailable/.test(gate));
  ok("the execution plane REDEEMS the capability before any effect", /redeemCapability\(/.test(gate));
  ok("the gate's grant IS the capability, not a boolean", /SelfImpulseGate/.test(gate) && /capability: ScopedCapability \| null/.test(gate));
  ok("the approval record CARRIES the capability digest", /capability\?: string/.test(gate));

  const executor = fs.readFileSync(path.join(ROOT, "src", "mission", "teamExecutor.ts"), "utf8");
  ok("seat settlement FEEDS the FinOps ledger", /finopsRecordSeatRun\(/.test(executor) && /engine\/finops/.test(executor));
  ok("the ledger records USD-unknown honestly, never a guess", /usd: r\.usage\?\.costUsd \?\? null/.test(executor));

  const sovereignSrc = fs.readFileSync(path.join(ROOT, "src", "security", "sovereign.ts"), "utf8");
  ok("the canonical bridge speaks vh.mandate.v1", /authorityCore/.test(sovereignSrc) && /coreMandateCanonical/.test(sovereignSrc));
  ok("revocation is sticky: only regrant clears it", /regrant\(/.test(sovereignSrc) && /reason: "revoked"/.test(sovereignSrc));

  const capSrc = fs.readFileSync(path.join(ROOT, "src", "security", "capability.ts"), "utf8");
  ok("no independent capability signer exists — one root signs everything",
    !/setCapabilitySigner/.test(capSrc) && /currentRootSigner\(\)/.test(capSrc));

  const ownerRootSrc = fs.readFileSync(path.join(ROOT, "src", "security", "ownerRoot.ts"), "utf8");
  ok("the owner root rides the VAULT'S hardened KDF (PBKDF2 with the vault salt), then domain separation",
    /pbkdf2Sync/.test(ownerRootSrc) && /hkdfSync/.test(ownerRootSrc) && /vaultKdfParams/.test(ownerRootSrc));
  ok("the owner root is bound on unlock AND invalidated on lock",
    /bindOwnerSigner\(/.test(ownerRootSrc) && /unbindOwnerSigner\(\)/.test(ownerRootSrc) && /invalidateCapabilitiesForRoot/.test(ownerRootSrc));
  const vaultSrc = fs.readFileSync(path.join(ROOT, "src", "engine", "vault.ts"), "utf8");
  ok("the vault exposes its KDF params so the owner key inherits the same hardening", /vaultKdfParams/.test(vaultSrc));
  ok("the KDF docs state measured choice, not borrowed guidance — and vaults calibrate and upgrade",
    !/OWASP 2023/.test(vaultSrc) && /calibratedIterations/.test(vaultSrc) && /upgradeVaultCost/.test(vaultSrc)
    && /existing\.iterations/.test(vaultSrc));
  const storeSrc = fs.readFileSync(path.join(ROOT, "src", "ui", "store.ts"), "utf8");
  ok("the shipped UI binds the owner root on vault unlock/create and UNBINDS it on lock",
    (storeSrc.match(/bindOwnerRoot\(/g) ?? []).length >= 2 && /lockOwnerRoot/.test(storeSrc));
  ok("the lock is ATOMIC and fail-safe ordered: unbind FIRST, then seal — one synchronous task, no dynamic import",
    !/import\("[^"]*ownerRoot"\)/.test(storeSrc)
    && storeSrc.indexOf("lockOwnerRoot();") !== -1
    && storeSrc.indexOf("lockOwnerRoot();") < storeSrc.indexOf("lockVault();"));
  const capSrc2 = fs.readFileSync(path.join(ROOT, "src", "security", "capability.ts"), "utf8");
  ok("capability minting refuses effectful actions under bootstrap — in the mint itself, one throat",
    /actionIsEffectful/.test(capSrc2) && /no effectful capability may be minted/.test(capSrc2));
  ok("the read-only registry is EXACT — no prefix inference anywhere in it",
    /READ_ONLY_OPERATIONS/.test(capSrc2) && !/startsWith\(/.test(capSrc2));
  ok("the registry SEALS at trusted startup — loaded code can never redefine read-only",
    /sealReadOnlyRegistry/.test(capSrc2) && /registry is sealed/.test(capSrc2));
  {
    let sealedRefused = "";
    sealReadOnlyRegistry();
    try {
      registerReadOnlyOperation("delete_database");
    } catch (e) {
      sealedRefused = e instanceof Error ? e.message : String(e);
    }
    ok("a sealed registry refuses the delete_database registration — workers cannot redefine semantics",
      /sealed/.test(sealedRefused), sealedRefused.slice(0, 80));
  }
  {
    const mcp = fs.readFileSync(path.join(ROOT, "src", "selfimpulse", "engine", "mcpRouter.ts"), "utf8");
    const host = fs.readFileSync(path.join(ROOT, "tools", "si-host.entry.ts"), "utf8");
    ok("trusted startup seals the registry in both engine entries",
      /sealReadOnlyRegistry\(\)/.test(mcp) && /sealReadOnlyRegistry\(\)/.test(host));
  }

  /* The POLICY registry gets the same immutable treatment: rules are
     trusted-startup facts; loaded code can evaluate, never rewrite. */
  {
    const pg = await import("../src/selfimpulse/engine/policyGateway");
    pg.sealPolicyRegistry();
    let refused = "";
    try {
      pg.registerPolicyRule(() => ({ decision: "allow", rule: "hijack", reason: "loaded code expanding authority" }));
    } catch (e) {
      refused = e instanceof Error ? e.message : String(e);
    }
    ok("a SEALED policy registry refuses new rules — workers cannot alter policy semantics",
      /policy registry is sealed/.test(refused), refused.slice(0, 80));
    const verdict = pg.propose({ tool: "calculator", args: { expression: "6*7" }, workspaceRoot: "/tmp/w" });
    ok("the built-in rules still evaluate — sealing freezes semantics, never breaks them",
      verdict.decision === "allow" && verdict.rule === "sovereign-safe-class");
    const mcp = fs.readFileSync(path.join(ROOT, "src", "selfimpulse", "engine", "mcpRouter.ts"), "utf8");
    const host = fs.readFileSync(path.join(ROOT, "tools", "si-host.entry.ts"), "utf8");
    ok("trusted startup seals the POLICY registry in both engine entries too",
      /sealPolicyRegistry\(\)/.test(mcp) && /sealPolicyRegistry\(\)/.test(host));
    let resetRefused = "";
    try {
      pg._resetPolicyRulesForProbe();
    } catch (e) {
      resetRefused = e instanceof Error ? e.message : String(e);
    }
    ok("even the probe-reset seam refuses after the seal — no path mutates rules, helpers included",
      /no path mutates rules/.test(resetRefused), resetRefused.slice(0, 80));
  }

  const iamSrc = fs.readFileSync(path.join(ROOT, "src", "engine", "iamLedger.ts"), "utf8");
  ok("enrollment is an explicit owner regrant through the sovereign", /sovereign\.regrant\(/.test(iamSrc));
}

console.log(`\ncanonicalAuthority: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
