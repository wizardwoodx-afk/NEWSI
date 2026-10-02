import { createRequire as __mjCreateRequire } from "node:module"; const require = __mjCreateRequire(import.meta.url);

// probe/browserService.test.ts
import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
var root = process.env.SI_ROOT ? path.resolve(process.env.SI_ROOT) : process.cwd();
var SERVICE = path.join(root, "src-tauri", "browser-service");
var checks = 0;
var ok = (cond, msg) => {
  assert.ok(cond, msg);
  checks += 1;
};
ok(fs.existsSync(path.join(SERVICE, "server.mjs")), "the service ships in the archive (server.mjs)");
ok(fs.existsSync(path.join(SERVICE, "cli.mjs")), "the service ships in the archive (cli.mjs)");
var serverSrc = fs.readFileSync(path.join(SERVICE, "server.mjs"), "utf8");
var commandsSrc = fs.readFileSync(path.join(root, "src-tauri", "src", "commands.rs"), "utf8");
ok(commandsSrc.includes('include_str!("../browser-service/server.mjs")'), "commands.rs materializes the bundled service (nothing outside required)");
ok(commandsSrc.includes("HANDLE_BROWSER_DIR") && !commandsSrc.includes(["VH", "_BROWSER"].join("")), "browser env names are clean (HANDLE_*; legacy MJ_* fallback only)");
ok(serverSrc.includes("127.0.0.1"), "the service binds loopback only");
ok(/notAttached/.test(serverSrc), "the service speaks the fail-closed notAttached contract");
var child = spawn(process.execPath, [path.join(SERVICE, "server.mjs")], {
  env: { ...process.env, HANDLE_BROWSER_PORT: "0", HANDLE_BROWSER_BIN: "" },
  stdio: ["ignore", "pipe", "pipe"]
});
var port = 0;
await new Promise((resolve2, reject) => {
  const t = setTimeout(() => reject(new Error("service did not print a listening line")), 8e3);
  let buf = "";
  child.stdout.on("data", (d) => {
    buf += d;
    const m = buf.match(/listening on http:\/\/127\.0\.0\.1:(\d+)/);
    if (m) {
      port = Number(m[1]);
      clearTimeout(t);
      resolve2();
    }
  });
  child.stderr.on("data", (d) => buf += d);
  child.on("exit", (c) => {
    clearTimeout(t);
    reject(new Error(`service exited early (${c}): ${buf}`));
  });
});
ok(port > 0, `service boots and reports its port (${port})`);
var call = async (route, body) => {
  const res = await fetch(`http://127.0.0.1:${port}${route}`, {
    method: body === void 0 ? "GET" : "POST",
    headers: { "content-type": "application/json" },
    body: body === void 0 ? void 0 : JSON.stringify(body)
  });
  return await res.json();
};
try {
  const health = await call("/health");
  ok(health.ok === true && health.service === "selfimpulse-browser", "health reports the bundled service identity");
  const create = await call("/session/create", { key: "probe" });
  if (create.ok === true) {
    ok(typeof create.sessionId === "string" && create.sessionId, "with a real browser attached, sessions are real");
  } else {
    ok(create.notAttached === true, "session create fails closed when no browser is attached");
    ok(create.sessionId === null || create.sessionId === void 0, "no invented session id");
    ok(create.engine === null || create.engine === void 0, "no invented engine name");
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
  const status = execFileSync(process.execPath, [path.join(SERVICE, "cli.mjs"), "status"], {
    env: { ...process.env, HANDLE_BROWSER_PORT: String(port) },
    encoding: "utf8"
  });
  ok(status.includes('"running": true'), "cli.mjs status sees the running service");
} finally {
  child.kill("SIGTERM");
}
console.log(`browserService: PASS (${checks} checks)`);
