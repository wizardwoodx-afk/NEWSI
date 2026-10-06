/**
 * Enforcement probes — every fix in b2c5ae0 pinned by a test that FAILS on the
 * pre-fix code. Written against the rule that a check which cannot fail is
 * worse than no check at all (the defect that produced F16 in the first place).
 *
 * §1 F16  a forged signature on the CURRENT wire format is rejected
 * §2 F17  one outcome classifier, and "gated-out" is never a success
 * §3 F5a  egress policy is applied to the URL wiki.search actually fetches
 * §4 F5b  an earned-autonomy grant must cover every routed member
 * §5 F18  the theme resolves before first paint
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { buildChainedReceipt, verifyProofReceipt } from "../src/selfimpulse/engine/proof";

/* House convention: the runner defines SI_ROOT at bundle time. Deriving the
   root from import.meta.url instead breaks inside the offline pack, where the
   bundle lives in verify/suites/ and the sources it checks are one level up. */
declare const SI_ROOT: string | undefined;
const ROOT = typeof SI_ROOT === "string" && SI_ROOT.length > 0 ? SI_ROOT : process.cwd();
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const now = new Date().toISOString();

describe("F16 — issuer signatures are verified on every wire format", () => {
  it("the module mints the current format", async () => {
    const rc = await buildChainedReceipt({
      mission: "enforcement-f16", teamId: "probe", startedAt: now, finishedAt: now,
      version: "probe", edition: "personal",
      events: [{ kind: "probe.event", seatId: "s1", data: { hello: "f16" } }],
    });
    assert.equal(rc.format, "si-proof-receipt/2");
  });

  it("a forged signature on si-proof-receipt/2 is REJECTED", async () => {
    const rc = await buildChainedReceipt({
      mission: "enforcement-f16", teamId: "probe", startedAt: now, finishedAt: now,
      version: "probe", edition: "personal",
      events: [{ kind: "probe.event", seatId: "s1", data: { hello: "f16" } }],
    });
    /* Before the fix the signature branch was gated on "mj-proof-receipt/2" —
       a format this module stopped minting in 16.1.0 — so this assertion failed:
       the forged receipt verified green. */
    const forged = {
      ...rc,
      signature: "ab".repeat(64),
      issuer: { keyId: "forged-key", publicKeyHex: "cd".repeat(32) },
    };
    const v = await verifyProofReceipt(forged);
    assert.equal(v.ok, false, "a forged signature must not verify on the current wire format");
  });

  it("a signed receipt with no issuer key is rejected", async () => {
    const rc = await buildChainedReceipt({
      mission: "enforcement-f16b", teamId: "probe", startedAt: now, finishedAt: now,
      version: "probe", edition: "personal",
      events: [{ kind: "probe.event", seatId: "s1", data: {} }],
    });
    const { issuer: _omit, ...noIssuer } = rc;
    const v = await verifyProofReceipt({ ...noIssuer, signature: "ab".repeat(64) } as never);
    assert.equal(v.ok, false);
  });
});

describe("F17 — one outcome classifier, denials never read as success", () => {
  const store = read("src/ui/store.ts");

  it("receiptStateFor exists and is the only classifier", () => {
    assert.match(store, /export function receiptStateFor/, "no shared classifier");
    assert.ok(!/\/refus\|denied\|blocked\//.test(store), "the old ad-hoc regex is still in store.ts");
    assert.ok(!/outcome === "refused" \? "refused" : "ok"/.test(store), "an inline outcome comparison is still present");
  });

  it("all three ledger rows route through it", () => {
    assert.equal((store.match(/receiptStateFor\(/g) ?? []).length >= 3, true,
      "run, tool and handoff rows must share one classifier");
  });

  it("gated-out and error are named states, not successes", () => {
    assert.match(store, /"gated-out"/, "gated-out is not handled");
    assert.match(store, /ReceiptState = "ok" \| "pending" \| "refused" \| "error"/, "the error state is missing");
  });

  it("gate decisions are recorded on both branches", () => {
    assert.match(store, /gateLog/, "gate decisions are still discarded");
    assert.match(store, /decision: d\.approved \? "approved" : "refused"/, "the decision is not persisted");
  });

  it("the KPI no longer claims verification it does not perform", () => {
    const receipts = read("src/ui/screens/Receipts.tsx");
    assert.ok(!/<span>Verified<\/span>/.test(receipts),
      'a count of state==="ok" rows is being presented as "Verified"');
  });
});

describe("F5a — egress policy guards every outbound URL", () => {
  it("wiki.search checks the URL it actually fetches", () => {
    const src = read("src/engine/tools.ts");
    const fn = src.slice(src.indexOf("async function execWikiSearch"));
    const guard = fn.indexOf("checkEgressUrl(");
    const fetch = fn.indexOf("await doFetch(");
    assert.ok(guard > -1, "execWikiSearch has no egress guard");
    assert.ok(fetch > -1);
    assert.ok(guard < fetch, "the egress guard runs after the fetch — that is not a guard");
  });

  it("net.fetch is still guarded", () => {
    assert.match(read("src/engine/tools.ts"), /const egress = checkEgressUrl\(url\)/);
  });
});

describe("F5b — an autonomy grant cannot open the gate for other domains", () => {
  it("the grant must cover every routed specialist", () => {
    const src = read("src/engine/generalist.ts");
    assert.ok(!/autonomyCovers\(userId, primaryCategory\)/.test(src),
      "autonomy is still decided from a single specialist");
    assert.match(src, /specialists\.every\(\(s\) => autonomyCovers\(userId, s\.category\)\)/);
  });

  it("worstTier still spans the whole routing", () => {
    assert.match(read("src/engine/generalist.ts"), /const worstTier = specialists\.some\(\(s\) => s\.riskTier === "critical"\)/);
  });
});

describe("F18 — the theme resolves before the first paint", () => {
  it("index.html sets data-theme before the app script runs", () => {
    const html = read("index.html");
    /* The server-side default is whichever finish the store calls DEFAULT_THEME
     * — hardcoding an id here would go red the moment the default changes, and
     * the four legacy ids no longer exist. */
    const store = read("src/ui/store.ts");
    const def = store.match(/DEFAULT_THEME(?:\s*:\s*[^=]+)?\s*=\s*"([a-z0-9-]+)"/)?.[1] ?? "";
    assert.ok(def.length > 0, "store.ts declares DEFAULT_THEME");
    assert.ok(new RegExp(`<html lang="en" data-theme="${def}">`).test(html), `no server-side default theme (${def})`);
    const boot = html.indexOf("dataset.theme");
    const app = html.indexOf('src="/src/main.tsx"');
    assert.ok(boot > -1 && boot < app, "the theme is resolved after the app boots");
  });

  it("colour tokens are only defined under [data-theme=...]", () => {
    const css = read("src/ui/vh.css");
    const rootBlock = css.slice(css.indexOf(":root{"), css.indexOf("}", css.indexOf(":root{")));
    assert.ok(!/--fg:/.test(rootBlock),
      ":root now carries colour tokens — revisit whether the boot guard is still required");
  });
});
