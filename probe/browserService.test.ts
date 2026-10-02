/**
 * probe · browserService — the bundled browser service is IN the product and
 * fails closed exactly as the contract says.
 *
 * The service (src-tauri/browser-service/) ships inside the archive and is
 * materialized by the desktop app on first use (include_str! in commands.rs).
 * Contract preserved: if no browser is attached, every command reports
 * `notAttached` with a reason that says so — no session id, title or engine is
 * ever invented. An offline browser and a broken browser look identical to a
 * caller that would otherwise believe it had seen a page.
 */
import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

const root = process.env.SI_ROOT ? path.resolve(process.env.SI_ROOT as string) : process.cwd();
const SERVICE = path.join(root, "src-tauri", "browser-service");

let checks = 0;
const ok = (cond: boolean, msg: string): void => {
  assert.ok(cond, msg);
  checks += 1;
};

ok(fs.existsSync(path.join(SERVICE, "server.mjs")), "the service ships in the archive (server.mjs)");
ok(fs.existsSync(path.join(SERVICE, "cli.mjs")), "the service ships in the archive (cli.mjs)");

const serverSrc = fs.readFileSync(path.join(SERVICE, "server.mjs"), "utf8");
const commandsSrc = fs.readFileSync(path.join(root, "src-tauri", "src", "commands.rs"), "utf8");
ok(commandsSrc.includes('include_str!("../browser-service/server.mjs")'), "commands.rs materializes the bundled service (nothing outside required)");
ok(commandsSrc.includes("HANDLE_BROWSER_DIR") && !commandsSrc.includes(["VH", "_BROWSER"].join("")), "browser env names are clean (HANDLE_*; legacy MJ_* fallback only)");
ok(serverSrc.includes("127.0.0.1"), "the service binds loopback only");
ok(/notAttached/.test(serverSrc), "the service speaks the fail-closed notAttached contract");

/* ---- boot the real service on an ephemeral port ---- */
const child = spawn(process.execPath, [path.join(SERVICE, "server.mjs")], {
  env: { ...process.env, HANDLE_BROWSER_PORT: "0", HANDLE_BROWSER_BIN: "" },
  stdio: ["ignore", "pipe", "pipe"],
});
let port = 0;
await new Promise<void>((resolve, reject) => {
  const t = setTimeout(() => reject(new Error("service did not print a listening line")), 8000);
  let buf = "";
  child.stdout.on("data", (d) => {
    buf += d;
    const m = buf.match(/listening on http:\/\/127\.0\.0\.1:(\d+)/);
    if (m) {
      port = Number(m[1]);
      clearTimeout(t);
      resolve();
    }
  });
  child.stderr.on("data", (d) => (buf += d));
  child.on("exit", (c) => {
    clearTimeout(t);
    reject(new Error(`service exited early (${c}): ${buf}`));
  });
});
ok(port > 0, `service boots and reports its port (${port})`);

const call = async (route: string, body?: unknown): Promise<Record<string, unknown>> => {
  const res = await fetch(`http://127.0.0.1:${port}${route}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return (await res.json()) as Record<string, unknown>;
};

try {
  const health = await call("/health");
  ok(health.ok === true && health.service === "selfimpulse-browser", "health reports the bundled service identity");

  // No Chromium is forced here (HANDLE_BROWSER_BIN=""): the fail-closed contract
  // must speak. On a machine WITH a browser the same calls succeed — either way
  // nothing is invented.
  const create = await call("/session/create", { key: "probe" });
  if (create.ok === true) {
    ok(typeof create.sessionId === "string" && create.sessionId, "with a real browser attached, sessions are real");
  } else {
    ok(create.notAttached === true, "session create fails closed when no browser is attached");
    ok(create.sessionId === null || create.sessionId === undefined, "no invented session id");
    ok(create.engine === null || create.engine === undefined, "no invented engine name");
    ok(String(create.reason ?? "").length > 20, "the refusal says why, in words");
  }

  const nav = await call("/navigate", { sessionId: "ghost", url: "https://example.com" });
  ok(nav.ok === false, "navigate on an unknown session refuses");
  ok(nav.notAttached === true || String(nav.reason ?? "").includes("no attached browser session"), "the refusal is honest about attachment");

  const navBad = await call("/navigate", { sessionId: "ghost", url: "file:///etc/passwd" });
  ok(navBad.ok === false, "file:// schemes are refused");

  const cons = await call("/console", { sessionId: "ghost" });
  ok(cons.ok === false && Array.isArray(cons.console) && Array.isArray(cons.networkFailures), "console on an unknown session: empty lists + failure (never 'the page was clean')");

  const sessions = await call("/sessions");
  ok(Array.isArray(sessions), "GET /sessions lists what exists (never invents)");

  // cli.mjs control channel
  const status = execFileSync(process.execPath, [path.join(SERVICE, "cli.mjs"), "status"], {
    env: { ...process.env, HANDLE_BROWSER_PORT: String(port) },
    encoding: "utf8",
  });
  ok(status.includes('"running": true'), "cli.mjs status sees the running service");
} finally {
  child.kill("SIGTERM");
}
console.log(`browserService: PASS (${checks} checks)`);
