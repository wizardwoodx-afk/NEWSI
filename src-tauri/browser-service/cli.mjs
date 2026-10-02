#!/usr/bin/env node
/**
 * SelfImpulse — browser service control: `node cli.mjs start|stop|status`.
 * The service itself is server.mjs next to this file (bundled inside the product).
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const PID_FILE = path.join(DIR, "service.pid");
const PORT = Number(process.env.HANDLE_BROWSER_PORT ?? "9223");

const health = () =>
  new Promise((resolve) => {
    const req = http.get({ host: "127.0.0.1", port: PORT, path: "/health", timeout: 800 }, (res) => {
      let b = "";
      res.on("data", (d) => (b += d));
      res.on("end", () => {
        try { resolve({ up: res.statusCode === 200, body: JSON.parse(b) }); }
        catch { resolve({ up: false, body: null }); }
      });
    });
    req.on("error", () => resolve({ up: false, body: null }));
    req.on("timeout", () => { req.destroy(); resolve({ up: false, body: null }); });
  });

const cmd = process.argv[2] ?? "status";

if (cmd === "status") {
  const h = await health();
  console.log(JSON.stringify(h.up ? { running: true, ...h.body } : { running: false }, null, 2));
  process.exit(h.up ? 0 : 1);
} else if (cmd === "start") {
  const h = await health();
  if (h.up) {
    console.log(`already running on http://127.0.0.1:${PORT}`);
    process.exit(0);
  }
  const out = fs.openSync(path.join(DIR, "service.log"), "a");
  const child = spawn(process.execPath, [path.join(DIR, "server.mjs")], {
    detached: true,
    stdio: ["ignore", out, out],
    env: process.env,
  });
  child.unref();
  fs.writeFileSync(PID_FILE, String(child.pid));
  for (let i = 0; i < 50; i++) {
    await new Promise((r) => setTimeout(r, 200));
    const h2 = await health();
    if (h2.up) {
      console.log(`started (pid ${child.pid}) on http://127.0.0.1:${PORT}`);
      process.exit(0);
    }
  }
  console.log(`spawned pid ${child.pid} but it did not answer on port ${PORT} within 10s — see ${path.join(DIR, "service.log")}`);
  process.exit(1);
} else if (cmd === "stop") {
  let killed = false;
  try {
    const pid = Number(fs.readFileSync(PID_FILE, "utf8").trim());
    process.kill(pid, "SIGTERM");
    killed = true;
  } catch { /* not running / no pid file */ }
  fs.rmSync(PID_FILE, { force: true });
  console.log(killed ? "stopped" : "not running");
  process.exit(0);
} else {
  console.log("usage: node cli.mjs start|stop|status");
  process.exit(2);
}
