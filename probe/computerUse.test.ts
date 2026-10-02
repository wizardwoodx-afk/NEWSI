/**
 * VH COMPUTER-USE — 19.5.3 "Reach" probe pin.
 *
 * Pins the mechanics:
 *   · pc.exec — allowlist, injection scan, critical handover, bounds, receipts
 *   · profiles — isolated per mission, cookies off by default
 *   · headless browser — HTTPS-by-policy, honest refusals, co-receipted steps,
 *     screenshot refuses (never fakes) when no browser binary exists
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { pcExec, newProfile, HeadlessBrowser, detectBrowserBinary } from "../src/engine/computerUse";
import type { BrowserTransport, PageSnapshot } from "../src/engine/computerUse";

const policy = { allowlist: ["echo", "ls"], maxRuntimeMs: 5000, maxOutputBytes: 1024 };

const fakeRun = (stdout: string, status = 0, timedOut = false) =>
  () => ({ status, timedOut, stdout, stderr: "" });

const fakeTransport: BrowserTransport = {
  async open(url, profile) {
    return { url, title: `page @ ${url} via ${profile.userAgent.split("/")[0]}`, links: ["/a", "/b"], status: 200 };
  },
  async act(snap, action) {
    if (action.type === "navigate") return { url: action.url, title: "next", links: [], status: 200 };
    return { ...snap, title: `${snap.title} (${action.type})` };
  },
};

test("computer-use", async (t) => {
  // ── pc.exec ───────────────────────────────────────────────────────────────
  await t.test("an allowlisted binary executes and is receipted", () => {
    const r = pcExec("echo", ["hello"], policy, "safe", { run: fakeRun("hello\n") });
    assert.equal(r.decision, "executed");
    assert.equal(r.exitCode, 0);
    assert.equal(r.timedOut, false);
    assert.ok(r.stdoutDigest.length === 64);
    assert.ok(r.digest.length === 64);
  });
  await t.test("a non-allowlisted binary is refused wordingly", () => {
    const r = pcExec("rm", ["-rf", "/"], policy, "risky", { run: fakeRun("") });
    assert.equal(r.decision, "refused");
    assert.match(r.reason, /not on this mission's allowlist/);
  });
  await t.test("shell metacharacters in args are refused as injection", () => {
    const r = pcExec("echo", ["hello; rm -rf /"], policy, "safe", { run: fakeRun("") });
    assert.equal(r.decision, "refused");
    assert.match(r.reason, /injection risk/);
  });
  await t.test("critical-tier commands hand over to the gate, never execute", () => {
    const r = pcExec("echo", ["secret"], policy, "critical", { run: fakeRun("secret") });
    assert.equal(r.decision, "handover");
    assert.match(r.reason, /human gate/);
  });
  await t.test("timeouts are flagged, not hidden", () => {
    const r = pcExec("ls", ["/"], policy, "safe", { run: fakeRun("", null, true) });
    assert.equal(r.timedOut, true);
    assert.match(r.reason, /ceiling/);
  });
  await t.test("output is capped at the policy ceiling", () => {
    const r = pcExec("echo", ["x"], policy, "safe", { run: fakeRun("A".repeat(5000)) });
    assert.ok(r.stdoutPreview.length <= 400);
  });

  // ── profiles ──────────────────────────────────────────────────────────────
  await t.test("profiles are mission-isolated and cookie-free by default", () => {
    const p = newProfile("m-1");
    assert.equal(p.missionId, "m-1");
    assert.equal(p.cookiesAllowed, false);
    assert.match(p.userAgent, /m-1/);
  });

  // ── headless browser ──────────────────────────────────────────────────────
  const browser = new HeadlessBrowser(newProfile("m-2"), fakeTransport, null);

  await t.test("opens HTTPS pages under the mission profile", async () => {
    const r = await browser.open("https://example.com/");
    assert.equal(r.decision, "executed");
    assert.ok(r.result);
    assert.equal(r.result!.status, 200);
    assert.match(r.reason, /profile default/);
  });
  await t.test("refuses plain-http navigation", async () => {
    const r = await browser.open("http://example.com/");
    assert.equal(r.decision, "refused");
    assert.match(r.reason, /HTTPS-by-policy/);
  });
  await t.test("critical navigation hands over to the gate", async () => {
    const r = await browser.open("https://bank.example.com/", "critical");
    assert.equal(r.decision, "handover");
  });
  await t.test("page actions are receipted against the loaded page", async () => {
    const snap: PageSnapshot = { url: "https://example.com/", title: "x", links: [], status: 200 };
    const r = await browser.act(snap, { type: "click", selector: "#go" });
    assert.equal(r.decision, "executed");
    assert.equal(r.result!.title, "x (click)");
  });
  await t.test("screenshot refuses honestly when no browser binary exists", () => {
    const r = browser.screenshot("/tmp/x.png");
    assert.equal(r.decision, "refused");
    assert.match(r.reason, /no browser binary|nothing faked|no page/i);
  });
  await t.test("teardown seals the whole mission trail", () => {
    const td = browser.teardown();
    assert.equal(td.missionId, "m-2");
    assert.ok(td.stepsReceipted >= 4);
    assert.ok(td.digest.length === 64);
  });
  await t.test("browser binary detection returns null or a real path", () => {
    const b = detectBrowserBinary(["/nonexistent/chrome-xyz"]);
    assert.equal(b, null);
  });
});
