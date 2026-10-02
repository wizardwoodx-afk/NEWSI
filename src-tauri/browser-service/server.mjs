#!/usr/bin/env node
/**
 * SelfImpulse — browser service (bundled inside the product; nothing outside required).
 *
 * Owns the optional Chromium-family browser process over the DevTools protocol and
 * serves the loopback JSON API the desktop app forwards to. Fail-closed contract
 * (preserved exactly): if no browser is attached, every command reports
 * `notAttached` with a reason that says so — no session id, title or engine is
 * ever invented here. An offline browser and a broken browser look identical to
 * a caller that would otherwise believe it had seen a page.
 *
 * Loopback only. Zero npm dependencies. Node >= 18.
 */
import http from "node:http";
import { spawn, execFileSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SERVICE_DIR = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.HANDLE_BROWSER_PORT ?? "9223");
const HOST = "127.0.0.1";

/* ------------------------------------------------------------- browser find */
function browserCandidates() {
  const out = [];
  const envBin = process.env.HANDLE_BROWSER_BIN || process.env.MJ_BROWSER_BIN || "";
  if (envBin.trim()) out.push(envBin.trim());
  const names = ["chromium", "chromium-browser", "google-chrome", "google-chrome-stable", "msedge", "microsoft-edge", "brave-browser"];
  if (process.platform === "win32") {
    for (const base of [process.env.PROGRAMFILES, process.env["PROGRAMFILES(X86)"], process.env.LOCALAPPDATA]) {
      if (!base) continue;
      out.push(path.join(base, "Google", "Chrome", "Application", "chrome.exe"));
      out.push(path.join(base, "Microsoft", "Edge", "Application", "msedge.exe"));
      out.push(path.join(base, "BraveSoftware", "Brave-Browser", "Application", "brave.exe"));
    }
  } else if (process.platform === "darwin") {
    out.push("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome");
    out.push("/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge");
    out.push("/Applications/Chromium.app/Contents/MacOS/Chromium");
    out.push("/Applications/Brave Browser.app/Contents/MacOS/Brave Browser");
  } else {
    for (const n of names) out.push(`/usr/bin/${n}`, `/usr/local/bin/${n}`, `/snap/bin/${n}`, `/opt/google/chrome/chrome`);
  }
  // PATH lookup last (least trusted, most convenient).
  for (const n of names) {
    try {
      const found = execFileSync(process.platform === "win32" ? "where" : "which", [n], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).split(/\r?\n/)[0]?.trim();
      if (found) out.push(found);
    } catch { /* not on PATH */ }
  }
  return [...new Set(out)];
}

function findBrowser() {
  for (const p of browserCandidates()) {
    try { if (fs.statSync(p).isFile()) return p; } catch { /* keep looking */ }
  }
  return null;
}

const noBrowserReason = () =>
  `no Chromium-family browser is installed on this machine (looked on PATH and in standard locations; set HANDLE_BROWSER_BIN to the full path of one). Nothing was fetched. Fetch-mode goto/extract over plain HTTP(S) still works without a browser.`;

/* ------------------------------------------------------------ minimal CDP WS */
class CdpConnection {
  constructor(socket) {
    this.socket = socket;
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Map();
    this.buf = Buffer.alloc(0);
    socket.on("data", (d) => this.onData(d));
    socket.on("error", () => this.failAll("browser websocket error"));
    socket.on("close", () => this.failAll("browser websocket closed"));
  }
  failAll(reason) {
    for (const [, p] of this.pending) p.reject(new Error(reason));
    this.pending.clear();
    this.alive = false;
  }
  onData(d) {
    this.buf = Buffer.concat([this.buf, d]);
    for (;;) {
      const f = this.readFrame();
      if (!f) break;
      if (f.opcode === 0x8) { this.socket.end(); return; }
      if (f.opcode === 0x9) { this.writeFrame(f.payload, 0xA); continue; } // ping→pong
      if (f.opcode !== 0x1 && f.opcode !== 0x0) continue;
      let msg;
      try { msg = JSON.parse(f.payload.toString("utf8")); } catch { continue; }
      if (msg.id && this.pending.has(msg.id)) {
        const p = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) p.reject(new Error(msg.error.message || JSON.stringify(msg.error)));
        else p.resolve(msg.result ?? {});
      } else if (msg.method) {
        for (const fn of this.listeners.get(msg.method) ?? []) {
          try { fn(msg.params ?? {}); } catch { /* listener error is not protocol error */ }
        }
      }
    }
  }
  readFrame() {
    const b = this.buf;
    if (b.length < 2) return null;
    const opcode = b[0] & 0x0f;
    const masked = (b[1] & 0x80) !== 0;
    let len = b[1] & 0x7f;
    let off = 2;
    if (len === 126) { if (b.length < 4) return null; len = b.readUInt16BE(2); off = 4; }
    else if (len === 127) { if (b.length < 10) return null; len = Number(b.readBigUInt64BE(2)); off = 10; }
    const maskLen = masked ? 4 : 0;
    if (b.length < off + maskLen + len) return null;
    let payload = b.subarray(off + maskLen, off + maskLen + len);
    if (masked) {
      const mask = b.subarray(off, off + 4);
      const un = Buffer.allocUnsafe(len);
      for (let i = 0; i < len; i++) un[i] = payload[i] ^ mask[i & 3];
      payload = un;
    }
    this.buf = b.subarray(off + maskLen + len);
    return { opcode, payload };
  }
  writeFrame(payload, opcode = 0x1) {
    const len = payload.length;
    const head = Buffer.allocUnsafe(len < 126 ? 6 : len < 65536 ? 8 : 14);
    head[0] = 0x80 | opcode;
    const mask = randomBytes(4);
    if (len < 126) { head[1] = 0x80 | len; mask.copy(head, 2); }
    else if (len < 65536) { head[1] = 0x80 | 126; head.writeUInt16BE(len, 2); mask.copy(head, 4); }
    else { head[1] = 0x80 | 127; head.writeBigUInt64BE(BigInt(len), 2); mask.copy(head, 10); }
    const body = Buffer.allocUnsafe(len);
    for (let i = 0; i < len; i++) body[i] = payload[i] ^ mask[i & 3];
    this.socket.write(Buffer.concat([head.subarray(0, len < 126 ? 6 : len < 65536 ? 8 : 14), body]));
  }
  send(method, params = {}, sessionId) {
    const id = this.nextId++;
    const msg = { id, method, params };
    if (sessionId) msg.sessionId = sessionId;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.writeFrame(Buffer.from(JSON.stringify(msg), "utf8"));
      setTimeout(() => {
        if (this.pending.has(id)) { this.pending.delete(id); reject(new Error(`CDP ${method} timed out`)); }
      }, 60000).unref?.();
    });
  }
  on(method, fn) {
    if (!this.listeners.has(method)) this.listeners.set(method, []);
    this.listeners.get(method).push(fn);
  }
}

function httpUpgrade(port, wsPath) {
  return new Promise((resolve, reject) => {
    const key = randomBytes(16).toString("base64");
    const req = http.request({
      host: HOST, port, path: wsPath, method: "GET",
      headers: { Connection: "Upgrade", Upgrade: "websocket", "Sec-WebSocket-Key": key, "Sec-WebSocket-Version": "13" },
    });
    req.on("upgrade", (res, socket) => {
      const expect = createHash("sha1").update(key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11").digest("base64");
      if (res.headers["sec-websocket-accept"] !== expect) { socket.destroy(); reject(new Error("websocket handshake mismatch")); return; }
      resolve(new CdpConnection(socket));
    });
    req.on("error", reject);
    req.on("response", () => reject(new Error("browser endpoint refused websocket upgrade")));
    req.end();
  });
}

/* ------------------------------------------------------------- browser state */
const state = {
  attached: false,
  engine: null,
  browserPath: null,
  proc: null,
  browserWs: null,
  cdp: null,
  sessions: new Map(), // id -> { key, targetId, attachedId, console: [], networkFailures: [], created }
};

async function launchBrowser() {
  const bin = findBrowser();
  if (!bin) return noBrowserReason();
  const profileRoot = path.join(SERVICE_DIR, "profiles");
  fs.mkdirSync(profileRoot, { recursive: true });
  const debugPort = await freePort();
  const userDataDir = path.join(profileRoot, `p${debugPort}-${Date.now()}`);
  fs.mkdirSync(userDataDir, { recursive: true });
  const args = [
    `--headless=new`,
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${userDataDir}`,
    "--no-first-run", "--no-default-browser-check", "--disable-gpu", "--disable-dev-shm-usage",
  ];
  if (process.platform === "linux" && process.env.HANDLE_BROWSER_NO_SANDBOX === "1") args.push("--no-sandbox");
  const proc = spawn(bin, args, { stdio: "ignore", detached: false });
  /* OWN THE CHILD IMMEDIATELY. state.proc was previously assigned only AFTER
     the DevTools/WebSocket handshake succeeded, so a handshake failure left a
     live chromium that nothing could kill (state.proc was still null), a
     leaked profile dir, and a `create` answer that reached the caller as a
     bare {ok:false, reason} with no notAttached flag. Ownership starts at
     spawn; every failure path below abandons through `abandon()`. */
  state.proc = proc;
  proc.on("exit", () => {
    state.attached = false; state.cdp = null; state.browserWs = null;
    if (state.proc === proc) state.proc = null;
  });
  const abandon = (why) => {
    try { proc.kill(); } catch { /* already gone */ }
    try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch { /* best effort */ }
    state.attached = false; state.cdp = null; state.browserWs = null;
    if (state.proc === proc) state.proc = null;
    return why;
  };
  try {
    // DevToolsActivePort appears when ready.
    const devToolsFile = path.join(userDataDir, "DevToolsActivePort");
    const deadline = Date.now() + 20000;
    let port = debugPort;
    let wsPath = null;
    while (Date.now() < deadline) {
      await sleep(150);
      try {
        const txt = fs.readFileSync(devToolsFile, "utf8").trim().split("\n");
        port = Number(txt[0]);
        wsPath = (txt[1] ?? "").trim() || null;
        if (port) break;
      } catch { /* not up yet */ }
    }
    if (!port) return abandon(`the browser at ${bin} did not expose a DevTools port within 20s.`);
    const list = await fetchJson(port, "/json/version").catch(() => null);
    const wsUrlPath = wsPath || list?.webSocketDebuggerUrl?.replace(/^ws:\/\/[^/]+/, "") || "/devtools/browser";
    const cdp = await httpUpgrade(port, wsUrlPath.startsWith("/") ? wsPath ?? list?.webSocketDebuggerUrl?.replace(/^ws:\/\/[^/]+/, "") ?? "/devtools/browser" : `/devtools/browser/${wsUrlPath.split("/").pop()}`).catch(async () => {
      // /json/version carries the browser ws url; use it verbatim when present.
      const u = list?.webSocketDebuggerUrl;
      if (u) return httpUpgrade(port, u.replace(/^ws:\/\/[^/]+/, ""));
      throw new Error("no browser websocket endpoint");
    });
    state.attached = true;
    state.engine = path.basename(bin);
    state.browserPath = bin;
    state.cdp = cdp;
    state.browserWs = cdp;
    return null;
  } catch (e) {
    // Any init failure (no ws endpoint, upgrade error, DevTools timeout) is a
    // STRING for createSession's notAttached wrap — never a thrown Error that
    // escapes as a bare {ok:false, reason} without the fail-closed flag.
    return abandon(String(e?.message ?? e));
  }
}

function freePort() {
  return new Promise((resolve) => {
    const s = net.createServer();
    s.listen(0, HOST, () => { const p = s.address().port; s.close(() => resolve(p)); });
    s.on("error", () => resolve(9333));
  });
}
function fetchJson(port, p) {
  return new Promise((resolve, reject) => {
    http.get({ host: HOST, port, path: p }, (res) => {
      let b = "";
      res.on("data", (d) => (b += d));
      res.on("end", () => { try { resolve(JSON.parse(b)); } catch (e) { reject(e); } });
    }).on("error", reject);
  });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function ensureAttached() {
  if (state.attached && state.cdp) return null;
  return launchBrowser();
}

/* --------------------------------------------------------------- sessions */
async function sessionByKey(key) {
  if (key) {
    for (const [id, s] of state.sessions) if (s.key === key) return id;
  }
  return null;
}

/**
 * Install the network guard on a session.
 *
 * Two layers, both required:
 *   - Page.addScriptToEvaluateOnNewDocument covers every document loaded AFTER
 *     installation, including navigations and new tabs.
 *   - Runtime.evaluate covers the document that is ALREADY loaded, which the
 *     first call does not touch.
 *
 * Installing only one leaves a window in which the current page is unguarded.
 */
async function installNetworkGuard(sessionId, allowedDomains) {
  const body = await loadGuardBody();
  const source = `globalThis.__selfimpulseGuardReport = globalThis.__selfimpulseGuardReport || [];
${body}
__installSelfImpulseNetworkGuard(${JSON.stringify(allowedDomains)});`;

  await state.cdp.send("Page.addScriptToEvaluateOnNewDocument", { source }, sessionId);
  const r = await state.cdp.send(
    "Runtime.evaluate",
    { expression: source, returnByValue: true },
    sessionId
  );
  if (r.exceptionDetails) {
    const d = r.exceptionDetails;
    const msg =
      d.exception?.description ?? d.text ?? "the network guard refused to install";
    return { ok: false, reason: String(msg).slice(0, 300) };
  }
  return { ok: true };
}

/** Read the guard body from disk, once per process. */
let guardBodyCache = null;
async function loadGuardBody() {
  if (guardBodyCache) return guardBodyCache;
  guardBodyCache = await fs.promises.readFile(
    path.join(SERVICE_DIR, "browser-guard.script.mjs"),
    "utf8"
  );
  return guardBodyCache;
}

/**
 * Read the blocked-request report the guard maintains in the page.
 *
 * This is how a refusal becomes an SelfImpulse fact: the page records the reason,
 * and the host lifts it out so it can be receipted rather than staying invisible
 * inside the browser.
 */
async function readGuardReport(sessionId) {
  try {
    const r = await state.cdp.send(
      "Runtime.evaluate",
      { expression: "JSON.stringify(globalThis.__selfimpulseGuardReport || [])", returnByValue: true },
      sessionId
    );
    const raw = r.result?.value;
    const list = typeof raw === "string" ? JSON.parse(raw) : [];
    if (Array.isArray(list) && list.length) {
      const rec = state.sessions.get(sessionId);
      if (rec) {
        for (const e of list.slice(-100)) {
          rec.networkFailures.push({ url: String(e.reason ?? "blocked").slice(0, 200), at: new Date().toISOString() });
        }
        // Clear so the same refusal is not counted twice on the next read.
        await state.cdp.send(
          "Runtime.evaluate",
          { expression: "globalThis.__selfimpulseGuardReport.length = 0" },
          sessionId
        );
      }
      return list.map((e) => ({ reason: String(e.reason ?? "") }));
    }
    return [];
  } catch {
    return [];
  }
}

async function createSession(key) {
  const err = await ensureAttached();
  if (err) return { ok: false, notAttached: true, engine: null, sessionId: null, reason: `the SelfImpulse browser service is up, but ${err}` };
  const existing = await sessionByKey(key);
  if (existing) return { ok: true, engine: state.engine, sessionId: existing, reused: true };
  const { targetId } = await state.cdp.send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await state.cdp.send("Target.attachToTarget", { targetId, flatten: true });
  const rec = { key: key || null, targetId, attachedId: sessionId, console: [], networkFailures: [], created: new Date().toISOString() };
  state.sessions.set(sessionId, rec);
  state.cdp.on("Runtime.consoleAPICalled", (p) => {
    const rec2 = state.sessions.get(p.sessionId ?? sessionId);
    if (rec2 && rec2.console.length < 500) rec2.console.push({ type: p.type ?? "log", text: (p.args ?? []).map((a) => a.value ?? a.description ?? "").join(" ").slice(0, 500), at: new Date().toISOString() });
  });
  state.cdp.on("Log.entryAdded", (p) => {
    const rec2 = state.sessions.get(p.sessionId ?? sessionId);
    if (rec2 && p.entry && rec2.console.length < 500) rec2.console.push({ type: p.entry.level ?? "info", text: String(p.entry.text ?? "").slice(0, 500), at: new Date().toISOString() });
  });
  state.cdp.on("Network.loadingFailed", (p) => {
    const rec2 = state.sessions.get(p.sessionId ?? sessionId);
    if (rec2 && rec2.networkFailures.length < 200) rec2.networkFailures.push({ url: String(p.blockedReason ?? p.errorText ?? "failed").slice(0, 200), at: new Date().toISOString() });
  });
  await state.cdp.send("Runtime.enable", {}, sessionId);
  await state.cdp.send("Log.enable", {}, sessionId);
  await state.cdp.send("Network.enable", {}, sessionId);

  // Install the network guard BEFORE the session is handed out. The allowlist
  // comes from the environment, set by the desktop app; an empty list is a
  // CLOSED policy, so a missing configuration produces a browser that cannot
  // reach anything rather than one that can reach anything.
  const allowlist = (process.env.HANDLE_BROWSER_ALLOWED_DOMAINS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const guard = await installNetworkGuard(sessionId, allowlist);
  rec.guard = { installed: guard.ok === true, allowlist, reason: guard.reason ?? null };

  return {
    ok: true,
    engine: state.engine,
    sessionId,
    reused: false,
    guard: rec.guard,
  };
}

const sess = (body) => state.sessions.get(String(body?.sessionId ?? "")) ?? null;

async function evalJs(sessionId, expression) {
  const r = await state.cdp.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }, sessionId);
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text ?? "script failed");
  return r.result?.value;
}

async function queryBox(sessionId, selector) {
  return evalJs(sessionId, `(() => {
    const el = document.querySelector(${JSON.stringify(String(selector))});
    if (!el) return null;
    el.scrollIntoView({ block: "center", inline: "center" });
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width, h: r.height, tag: el.tagName.toLowerCase() };
  })()`);
}

async function act(body) {
  const s = sess(body);
  if (!s) return { ok: false, notAttached: true, reason: `no attached browser session "${body?.sessionId ?? "?"}" — create one first. Nothing was done.` };
  const sid = s.attachedId;
  const action = String(body?.action ?? "");
  const timeoutMs = Number(body?.timeoutMs ?? 30000);
  try {
    switch (action) {
      case "navigate": {
        const url = String(body?.url ?? "");
        if (!/^https?:\/\//i.test(url)) return { ok: false, notAttached: false, reason: `refused: "${url}" is not an http(s) URL — no file:// or other schemes.` };
        await state.cdp.send("Page.navigate", { url }, sid);
        await sleep(Math.min(timeoutMs, 120000));
        const title = await evalJs(sid, "document.title").catch(() => "(no title)");
        return { ok: true, url, title: String(title).slice(0, 200), engine: state.engine };
      }
      case "click": {
        const box = await queryBox(sid, String(body?.selector ?? ""));
        if (!box) return { ok: false, reason: `selector "${body?.selector}" not found — honest absence, nothing clicked.` };
        await state.cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", x: box.x, y: box.y, button: "left", clickCount: 1 }, sid);
        await state.cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: box.x, y: box.y, button: "left", clickCount: 1 }, sid);
        return { ok: true, detail: `clicked ${box.tag} at ${Math.round(box.x)},${Math.round(box.y)}` };
      }
      case "type":
      case "fill": {
        const box = await queryBox(sid, String(body?.selector ?? ""));
        if (!box) return { ok: false, reason: `selector "${body?.selector}" not found — honest absence, nothing typed.` };
        await state.cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", x: box.x, y: box.y, button: "left", clickCount: 1 }, sid);
        await state.cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: box.x, y: box.y, button: "left", clickCount: 1 }, sid);
        if (action === "fill") await evalJs(sid, `document.querySelector(${JSON.stringify(String(body?.selector))}).value = ""`).catch(() => {});
        await state.cdp.send("Input.insertText", { text: String(body?.value ?? "") }, sid);
        return { ok: true, detail: `typed ${String(body?.value ?? "").length} chars into ${box.tag}` };
      }
      case "select": {
        const v = String(body?.value ?? "");
        const changed = await evalJs(sid, `(() => { const el = document.querySelector(${JSON.stringify(String(body?.selector ?? ""))}); if (!el) return false; el.value = ${JSON.stringify(v)}; el.dispatchEvent(new Event("change", { bubbles: true })); return true; })()`);
        return changed ? { ok: true, detail: `selected "${v}"` } : { ok: false, reason: `selector "${body?.selector}" not found — nothing selected.` };
      }
      case "hover": {
        const box = await queryBox(sid, String(body?.selector ?? ""));
        if (!box) return { ok: false, reason: `selector "${body?.selector}" not found.` };
        await state.cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: box.x, y: box.y }, sid);
        return { ok: true, detail: `hovered ${box.tag}` };
      }
      case "scroll":
        await evalJs(sid, `window.scrollBy(${Number(body?.value?.x ?? 0)}, ${Number(body?.value?.y ?? 300)})`);
        return { ok: true, detail: "scrolled" };
      case "wait":
        await sleep(Math.min(Number(body?.timeoutMs ?? 1000), 120000));
        return { ok: true, detail: `waited ${Math.min(Number(body?.timeoutMs ?? 1000), 120000)}ms` };
      case "extract": {
        const sel = String(body?.selector ?? "body");
        const text = await evalJs(sid, `(() => { const el = document.querySelector(${JSON.stringify(sel)}); return el ? el.innerText.slice(0, 4000) : null; })()`);
        return text == null
          ? { ok: false, reason: `selector "${sel}" not found — honest absence.` }
          : { ok: true, text, engine: state.engine };
      }
      case "evaluate": {
        const value = await evalJs(sid, String(body?.script ?? "undefined"));
        return { ok: true, value: value ?? null };
      }
      case "back": case "forward":
        await evalJs(sid, action === "back" ? "history.back()" : "history.forward()");
        await sleep(300);
        return { ok: true, detail: action };
      case "reload":
        await state.cdp.send("Page.reload", {}, sid);
        return { ok: true, detail: "reloaded" };
      case "keyboard": {
        const key = String(body?.key ?? "");
        await state.cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key }, sid);
        await state.cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key }, sid);
        return { ok: true, detail: `key ${key}` };
      }
      default:
        return { ok: false, reason: `unknown action "${action}" — the service does not invent actions.` };
    }
  } catch (e) {
    return { ok: false, reason: String(e?.message ?? e) };
  }
}

/* ------------------------------------------------------------------ server */
const routes = {
  "GET /health": () => ({
    ok: true,
    service: "selfimpulse-browser",
    attached: state.attached,
    engine: state.attached ? state.engine : null,
    browserPath: state.browserPath,
    sessions: state.sessions.size,
  }),
  "GET /sessions": () => [...state.sessions.entries()].map(([id, s]) => ({ sessionId: id, key: s.key, created: s.created })),
  "POST /session/create": async (body) => createSession(body?.key),
  "POST /session/close": async (body) => {
    const s = sess(body);
    if (!s) return { ok: true, closed: false };
    await state.cdp.send("Target.closeTarget", { targetId: s.targetId }).catch(() => {});
    state.sessions.delete(String(body?.sessionId));
    return { ok: true, closed: true };
  },
  "POST /navigate": async (body) => {
    const s = sess(body);
    if (!s) return { ok: false, notAttached: true, reason: `no attached browser session "${body?.sessionId ?? "?"}" — create one first. Nothing was fetched.` };
    const url = String(body?.url ?? "");
    if (!/^https?:\/\//i.test(url)) return { ok: false, notAttached: false, url, reason: `refused: "${url}" is not an http(s) URL — no file:// or other schemes.` };
    try {
      await state.cdp.send("Page.navigate", { url }, s.attachedId);
      await sleep(Math.min(Number(body?.timeoutMs ?? 0) || 2000, 120000));
      const title = await evalJs(s.attachedId, "document.title").catch(() => "(no title)");
      return { ok: true, url, title: String(title).slice(0, 200), engine: state.engine };
    } catch (e) {
      return { ok: false, notAttached: false, url, reason: String(e?.message ?? e) };
    }
  },
  "POST /act": async (body) => act(body),
  "POST /screenshot": async (body) => {
    const s = sess(body);
    if (!s) return { ok: false, notAttached: true, path: null, reason: `no attached browser session "${body?.sessionId ?? "?"}". No file was written.` };
    try {
      const r = await state.cdp.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: Boolean(body?.fullPage) }, s.attachedId);
      const dir = path.join(SERVICE_DIR, "screens");
      fs.mkdirSync(dir, { recursive: true });
      const p = path.join(dir, `${Date.now()}.png`);
      fs.writeFileSync(p, Buffer.from(r.data, "base64"));
      return { ok: true, path: p };
    } catch (e) {
      return { ok: false, notAttached: false, path: null, reason: String(e?.message ?? e) };
    }
  },
  "POST /console": async (body) => {
    const s = sess(body);
    if (!s) return { ok: false, notAttached: true, console: [], networkFailures: [], reason: `no attached browser session "${body?.sessionId ?? "?"}". Empty lists here must never read as "the page was clean".` };
    return { ok: true, console: s.console, networkFailures: s.networkFailures };
  },
};

const server = http.createServer((req, res) => {
  const key = `${req.method} ${req.url?.split("?")[0]}`;
  const handler = routes[key];
  if (!handler) {
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: false, reason: `no route ${key}` }));
    return;
  }
  let body = "";
  req.on("data", (d) => (body += d));
  req.on("end", async () => {
    let parsed = {};
    try { parsed = body ? JSON.parse(body) : {}; } catch { /* empty body */ }
    try {
      const out = await handler(parsed);
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(out ?? { ok: true }));
    } catch (e) {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: false, reason: String(e?.message ?? e) }));
    }
  });
});

server.listen(PORT, HOST, () => {
  console.log(`selfimpulse-browser listening on http://${HOST}:${server.address().port}`);
});
server.on("error", (e) => {
  console.error(`selfimpulse-browser failed to listen: ${e.message}`);
  process.exit(1);
});

for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    try { state.proc?.kill(); } catch { /* already gone */ }
    state.proc = null;
    process.exit(0);
  });
}
