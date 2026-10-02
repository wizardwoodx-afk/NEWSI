/**
 * 20.1 — authority-envelope provenance. REGRESSION PROBE.
 *
 * The bug this pins: `checkEnvelope()` read `scope` / `revoked` / `expiresAt`
 * and returned ok:true WITHOUT verifying the envelope was ever sealed. A
 * hand-written object literal — `{ scope:["*"], digest:"deadbeef" }` — opened
 * every authority gate in the product, and `teamExecutor` then attenuated the
 * forged parent into legitimate-looking per-seat envelopes for the whole crew.
 *
 * The fix brands envelopes in a module-private WeakSet from `seal()` alone.
 * These assertions call the REAL functions, so they pass only while the brand
 * is enforced — a test that greps the source would pass on the old code.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  attenuate,
  budgetCheck,
  checkEnvelope,
  issueRootEnvelope,
  rehydrateEnvelope,
  revoke,
  type AuthorityEnvelope,
} from "../src/mission/custody";

const NOW = 1_700_000_000_000;

/** The original exploit, verbatim: an object literal satisfying the interface. */
function forgedEnvelope(overrides: Partial<AuthorityEnvelope> = {}): AuthorityEnvelope {
  return {
    format: "si-envelope/1",
    id: "env-forged",
    principal: "human:mallory",
    delegationChain: ["human:mallory"],
    scope: ["*"],
    issuedAt: NOW,
    expiresAt: null,
    budgetUsd: null,
    revoked: null,
    parentId: null,
    digest: "deadbeef",
    ...overrides,
  } as AuthorityEnvelope;
}

describe("custody — a hand-built envelope is not authority", () => {
  it("refuses a forged envelope that claims a wildcard scope", () => {
    const v = checkEnvelope(forgedEnvelope(), "egress:share", NOW);
    assert.equal(v.ok, false, "a forged envelope must never be accepted");
    assert.match(v.reason, /seal\(\)/);
  });

  it("refuses it for EVERY action, not just the ones it names", () => {
    for (const action of ["egress:share", "run:team-mission", "capability:run", "anything"]) {
      assert.equal(checkEnvelope(forgedEnvelope(), action, NOW).ok, false, `forged envelope opened "${action}"`);
    }
  });

  it("refuses a forged envelope even when the digest is well-formed-looking", () => {
    const v = checkEnvelope(forgedEnvelope({ digest: "a".repeat(64) }), "egress:share", NOW);
    assert.equal(v.ok, false);
  });

  it("refuses a forged budget cap", () => {
    const b = budgetCheck(forgedEnvelope(), 99_999);
    assert.equal(b.ok, false, "budgetUsd:null must not read as 'uncapped' for a forged envelope");
  });

  it("a JSON round-trip cannot smuggle authority back in", async () => {
    const root = await issueRootEnvelope({
      principal: "human:owner",
      scope: ["run:team-mission"],
      expiresAt: NOW + 60_000,
      budgetUsd: 10,
      now: NOW,
    });
    assert.equal(checkEnvelope(root, "run:team-mission", NOW).ok, true, "the genuine envelope works");

    // Persistence and IPC both hand back plain objects. The brand must not
    // survive that, so a reloaded envelope is refused until re-verified.
    const reloaded = JSON.parse(JSON.stringify(root)) as AuthorityEnvelope;
    assert.equal(checkEnvelope(reloaded, "run:team-mission", NOW).ok, false, "a deserialized envelope must not be trusted");

    const re = await rehydrateEnvelope(reloaded);
    assert.equal(re.ok, true, "rehydrate verifies digest+signature and re-admits it");
    assert.equal(checkEnvelope(reloaded, "run:team-mission", NOW).ok, true, "after rehydrate it works again");
  });
});

describe("custody — the legitimate flow is unaffected", () => {
  it("a real root envelope permits its own scope and refuses another", async () => {
    const root = await issueRootEnvelope({
      principal: "human:owner",
      scope: ["run:team-mission"],
      expiresAt: NOW + 60_000,
      budgetUsd: 10,
      now: NOW,
    });
    assert.equal(checkEnvelope(root, "run:team-mission", NOW).ok, true);
    const wrong = checkEnvelope(root, "egress:share", NOW);
    assert.equal(wrong.ok, false);
    assert.match(wrong.reason, /outside envelope scope/);
  });

  it("budget arithmetic is real", async () => {
    const root = await issueRootEnvelope({
      principal: "human:owner",
      scope: ["run:team-mission"],
      expiresAt: NOW + 60_000,
      budgetUsd: 10,
      now: NOW,
    });
    assert.equal(budgetCheck(root, 1.5).ok, true);
    assert.equal(budgetCheck(root, 50).ok, false);
  });

  it("attenuation produces a usable child", async () => {
    const root = await issueRootEnvelope({
      principal: "human:owner",
      scope: ["run:team-mission", "capability:run"],
      expiresAt: NOW + 60_000,
      budgetUsd: 10,
      now: NOW,
    });
    const { envelope, reason } = await attenuate(root, "agent-1", ["run:team-mission"], { now: NOW });
    assert.ok(envelope, reason);
    assert.equal(checkEnvelope(envelope!, "run:team-mission", NOW).ok, true);
  });

  it("revocation is refused for the RIGHT reason, not 'never sealed'", async () => {
    const root = await issueRootEnvelope({
      principal: "human:owner",
      scope: ["run:team-mission"],
      expiresAt: NOW + 60_000,
      now: NOW,
    });
    const rev = revoke(root, "operator revoked");
    const v = checkEnvelope(rev, "run:team-mission", NOW);
    assert.equal(v.ok, false);
    assert.match(v.reason, /revoked/, "revoke() spreads the object, so it must re-brand or this fails for the wrong cause");
  });

  it("expiry is still enforced", async () => {
    const root = await issueRootEnvelope({
      principal: "human:owner",
      scope: ["run:team-mission"],
      expiresAt: NOW + 60_000,
      now: NOW,
    });
    const v = checkEnvelope(root, "run:team-mission", NOW + 120_000);
    assert.equal(v.ok, false);
    assert.match(v.reason, /expired/);
  });
});
