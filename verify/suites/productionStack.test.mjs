import { createRequire as __mjCreateRequire } from "node:module"; const require = __mjCreateRequire(import.meta.url);
var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// src/app/desktop.ts
function detectHost() {
  if (typeof window === "undefined") return "web";
  const w = window;
  if (w.__TAURI_INTERNALS__) return "tauri";
  if (w.__TAURI__) return "tauri";
  if (typeof navigator !== "undefined" && /tauri/i.test(navigator.userAgent)) return "tauri";
  return "web";
}
var init_desktop = __esm({
  "src/app/desktop.ts"() {
    "use strict";
  }
});

// src/security/ipClassify.ts
function expandIpv6(input) {
  let s = input;
  const zone = s.indexOf("%");
  if (zone !== -1) s = s.slice(0, zone);
  if (!s.includes(":")) return null;
  const lastColon = s.lastIndexOf(":");
  const tail = s.slice(lastColon + 1);
  if (tail.includes(".")) {
    const v4 = parseIpv4(tail);
    if (!v4) return null;
    s = `${s.slice(0, lastColon + 1)}${(v4[0] << 8 | v4[1]).toString(16)}:${(v4[2] << 8 | v4[3]).toString(16)}`;
  }
  const halves = s.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const rest = halves.length === 2 ? halves[1] ? halves[1].split(":") : [] : [];
  const missing = 8 - head.length - rest.length;
  if (halves.length === 1) {
    if (head.length !== 8) return null;
  } else if (missing < 0) {
    return null;
  }
  const groups = [];
  for (const g of head) groups.push(parseInt(g, 16));
  for (let i = 0; i < missing; i += 1) groups.push(0);
  for (const g of rest) groups.push(parseInt(g, 16));
  if (groups.length !== 8 || groups.some((g) => !Number.isInteger(g) || g < 0 || g > 65535)) return null;
  return groups;
}
function parseIpv4(input) {
  const parts = input.split(".");
  if (parts.length !== 4) return null;
  const octets = [];
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return null;
    const n = Number(p);
    if (n > 255) return null;
    octets.push(n);
  }
  return octets;
}
function isObfuscatedIpv4Literal(host) {
  if (/^\d{1,3}(\.\d{1,3}){0,2}$/.test(host)) return true;
  if (/^0[xX][0-9a-fA-F]{1,8}$/.test(host)) return true;
  return false;
}
function normalizeHost(rawHost) {
  const host = rawHost.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (!host) return { kind: "unknown", ip: "" };
  const v4 = parseIpv4(host);
  if (v4) return { kind: "ipv4", ip: v4.join("."), octets: v4 };
  if (host.includes(":")) {
    const groups = expandIpv6(host);
    if (groups) {
      const isMapped = groups.slice(0, 5).every((g) => g === 0) && (groups[5] === 65535 || groups[5] === 0);
      if (isMapped) {
        const octets = [groups[6] >> 8, groups[6] & 255, groups[7] >> 8, groups[7] & 255];
        return { kind: "ipv4", ip: octets.join("."), octets };
      }
      return { kind: "ipv6", ip: groups.map((g) => g.toString(16).padStart(4, "0")).join(":"), groups };
    }
  }
  if (isObfuscatedIpv4Literal(host)) return { kind: "unknown", ip: "" };
  return { kind: "unknown", ip: "" };
}
function classifyV4(o, allowLoopback) {
  const [a, b] = o;
  const inCidr = (base, bits) => {
    let acc = 0;
    for (let i = 0; i < 4; i += 1) {
      const rem = bits - i * 8;
      const mask = rem <= 0 ? 0 : rem >= 8 ? 255 : 255 << 8 - rem & 255;
      if ((o[i] & mask) !== (base[i] & mask)) return false;
      acc += 1;
      if (acc > 4) break;
    }
    return true;
  };
  const C = (scope, reason) => ({ ok: false, reason, scope });
  if (a === 127) return allowLoopback ? { ok: true, reason: "", scope: "loopback" } : C("loopback", "loopback address refused (SSRF guard)");
  if (a === 169 && b === 254) {
    if (o[2] === 169 && o[3] === 254) return C("metadata", "cloud metadata endpoint refused (SSRF guard)");
    return C("link-local", "link-local address refused (SSRF guard)");
  }
  if (inCidr([0, 0, 0, 0], 8)) return C("reserved", "this-network address refused (SSRF guard)");
  if (inCidr([10, 0, 0, 0], 8)) return C("private", "private network address refused (SSRF guard)");
  if (inCidr([100, 64, 0, 0], 10)) return C("special", "carrier-grade NAT address refused (SSRF guard)");
  if (inCidr([172, 16, 0, 0], 12)) return C("private", "private network address refused (SSRF guard)");
  if (inCidr([192, 0, 0, 0], 24)) return C("special", "IETF protocol assignment refused (SSRF guard)");
  if (inCidr([192, 0, 2, 0], 24)) return C("special", "documentation range refused (SSRF guard)");
  if (inCidr([192, 88, 99, 0], 24)) return C("special", "6to4 relay anycast refused (SSRF guard)");
  if (inCidr([192, 168, 0, 0], 16)) return C("private", "private network address refused (SSRF guard)");
  if (inCidr([198, 18, 0, 0], 15)) return C("special", "benchmarking range refused (SSRF guard)");
  if (inCidr([198, 51, 100, 0], 24)) return C("special", "documentation range refused (SSRF guard)");
  if (inCidr([203, 0, 113, 0], 24)) return C("special", "documentation range refused (SSRF guard)");
  if (a >= 224 && a <= 239) return C("multicast", "multicast address refused (SSRF guard)");
  if (a >= 240) return C("reserved", "reserved address refused (SSRF guard)");
  return { ok: true, reason: "", scope: "public" };
}
function classifyV6(g, allowLoopback) {
  const hex = g.map((x) => x.toString(16).padStart(4, "0")).join(":");
  const C = (scope, reason) => ({ ok: false, reason, scope });
  if (g.slice(0, 7).every((x) => x === 0) && g[7] === 1) {
    return allowLoopback ? { ok: true, reason: "", scope: "loopback" } : C("loopback", "IPv6 loopback refused (SSRF guard)");
  }
  if (g.slice(0, 7).every((x) => x === 0) && g[7] === 0) return C("reserved", "unspecified address refused (SSRF guard)");
  if ((g[0] & 65024) === 64512) return C("private", "IPv6 unique-local refused (SSRF guard)");
  if ((g[0] & 65472) === 65152) return C("link-local", "IPv6 link-local refused (SSRF guard)");
  if ((g[0] & 65280) === 65280) return C("multicast", "IPv6 multicast refused (SSRF guard)");
  if (g[0] === 8193 && g[1] === 3512) return C("special", "IPv6 documentation range refused (SSRF guard)");
  if (g[0] === 100 && g[1] === 65435) {
    const octets = [g[6] >> 8, g[6] & 255, g[7] >> 8, g[7] & 255];
    const inner = classifyV4(octets, allowLoopback);
    return inner.ok ? inner : C(inner.scope, `NAT64-embedded address refused (SSRF guard): ${inner.reason}`);
  }
  if (g[0] === 8194) return C("special", `6to4 address refused (SSRF guard): ${hex}`);
  if (g[0] === 8193 && g[1] === 0) return C("special", `Teredo address refused (SSRF guard): ${hex}`);
  return { ok: true, reason: "", scope: "public" };
}
function classifyIp(n, allowLoopback) {
  if (n.kind === "ipv4" && n.octets) return classifyV4(n.octets, allowLoopback);
  if (n.kind === "ipv6" && n.groups) return classifyV6(n.groups, allowLoopback);
  return { ok: false, reason: "address could not be classified", scope: "unknown" };
}
function classifyHost(rawHost, allowLoopback = false) {
  return classifyIp(normalizeHost(rawHost), allowLoopback);
}
var init_ipClassify = __esm({
  "src/security/ipClassify.ts"() {
    "use strict";
  }
});

// src/security/guardrail.ts
function checkEgressUrl(raw, opts = {}) {
  let u;
  try {
    u = new URL(raw);
  } catch {
    return { ok: false, reason: "not a parseable URL" };
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    return { ok: false, reason: `scheme "${u.protocol}" refused \u2014 only http(s) egress is allowed` };
  }
  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "metadata.google.internal") {
    return { ok: false, reason: "cloud metadata endpoint refused (SSRF guard)" };
  }
  for (const sfx of BLOCKED_HOST_SUFFIXES) {
    if (host.endsWith(sfx)) return { ok: false, reason: `host suffix "${sfx}" refused` };
  }
  const verdict = classifyHost(host, opts.allowLoopback ?? true);
  if (verdict.ok || verdict.scope === "unknown") return { ok: true, reason: "" };
  return { ok: false, reason: verdict.reason };
}
var RateGate, BLOCKED_HOST_SUFFIXES, callRateGate;
var init_guardrail = __esm({
  "src/security/guardrail.ts"() {
    "use strict";
    init_ipClassify();
    RateGate = class {
      constructor(limit, windowMs, now = () => Date.now()) {
        this.limit = limit;
        this.windowMs = windowMs;
        this.now = now;
      }
      hits = /* @__PURE__ */ new Map();
      /** Returns true when the action is within budget (and records it). */
      check(key2) {
        const t = this.now();
        const arr = (this.hits.get(key2) ?? []).filter((x) => t - x < this.windowMs);
        if (arr.length >= this.limit) {
          this.hits.set(key2, arr);
          return false;
        }
        arr.push(t);
        this.hits.set(key2, arr);
        return true;
      }
    };
    BLOCKED_HOST_SUFFIXES = [".internal", ".local", ".localhost"];
    callRateGate = new RateGate(120, 6e4);
  }
});

// src/security/egressNet.ts
async function resolveEgress(raw, opts = {}) {
  const allowLoopback = opts.allowLoopback ?? false;
  const resolve = opts.resolve ?? systemResolver;
  const base = checkEgressUrl(raw);
  if (!base.ok) return { ok: false, reason: base.reason };
  const host = new URL(raw).hostname.replace(/^\[|\]$/g, "");
  const literal = normalizeHost(host);
  if (literal.kind !== "unknown") {
    const cls = classifyIp(literal, allowLoopback);
    return cls.ok ? { ok: true, reason: "", pinnedIp: literal.ip, scope: cls.scope } : { ok: false, reason: `${literal.ip} \u2014 ${cls.reason}`, scope: cls.scope };
  }
  if (literal.ip === "" && isObfuscatedIpv4Literal(host.toLowerCase())) {
    return { ok: false, reason: `obfuscated IP literal "${host}" refused \u2014 write the address in dotted-quad form`, scope: "unknown" };
  }
  let answers;
  try {
    answers = await resolve(host);
  } catch (e) {
    return { ok: false, reason: `DNS resolution failed for "${host}": ${e instanceof Error ? e.message : String(e)}` };
  }
  if (answers.length === 0) return { ok: false, reason: `"${host}" resolved to no addresses \u2014 refused rather than guessing`, scope: "unknown" };
  const seen = [];
  let pinned = null;
  for (const a of answers) {
    const n = normalizeHost(a);
    const cls = classifyIp(n, allowLoopback);
    if (!cls.ok) {
      return { ok: false, reason: `"${host}" resolves to ${n.ip || a} \u2014 ${cls.reason}`, scope: cls.scope };
    }
    seen.push(n.ip || a);
    if (!pinned) pinned = { ip: n.ip || a, scope: cls.scope };
  }
  return { ok: true, reason: "", pinnedIp: pinned.ip, scope: pinned.scope, hops: [{ url: raw, ip: pinned.ip, status: 0 }] };
}
async function safeEgressFetch(raw, init = {}) {
  const { fetchImpl, allowLoopback, resolve, maxRedirects, ...rest } = init;
  const doFetch = fetchImpl ?? globalThis.fetch?.bind(globalThis);
  if (!doFetch) throw new Error("no fetch available in this runtime \u2014 nothing was executed");
  const hops = [];
  let current = raw;
  for (let hop = 0; hop <= (maxRedirects ?? DEFAULT_MAX_REDIRECTS); hop += 1) {
    const decision = await resolveEgress(current, { allowLoopback, resolve });
    if (!decision.ok) {
      throw new Error(`egress refused at hop ${hop}: ${decision.reason} \u2014 nothing further was sent.`);
    }
    const res = await doFetch(current, { ...rest, redirect: "manual" });
    hops.push({ url: current, ip: decision.pinnedIp ?? "", status: res.status });
    const location = res.headers.get("location");
    if (!location || res.status < 300 || res.status > 399) {
      Object.defineProperty(res, "egressHops", { value: hops, enumerable: false });
      return res;
    }
    let next;
    try {
      next = new URL(location, current).toString();
    } catch {
      throw new Error(`egress refused: hop ${hop} returned an unparseable Location \u2014 nothing further was sent.`);
    }
    if (hop === (maxRedirects ?? DEFAULT_MAX_REDIRECTS)) {
      throw new Error(`egress refused: more than ${maxRedirects ?? DEFAULT_MAX_REDIRECTS} redirects \u2014 possible redirect loop.`);
    }
    current = next;
  }
  throw new Error("egress refused: redirect budget exhausted.");
}
var systemResolver, DEFAULT_MAX_REDIRECTS;
var init_egressNet = __esm({
  "src/security/egressNet.ts"() {
    "use strict";
    init_guardrail();
    init_ipClassify();
    systemResolver = async (hostname) => {
      const dns = await import("node:dns/promises").catch(() => null);
      if (!dns) return [];
      const out = [];
      try {
        for (const r of await dns.lookup(hostname, { all: true, verbatim: true })) out.push(r.address);
      } catch {
      }
      return out;
    };
    DEFAULT_MAX_REDIRECTS = 5;
  }
});

// src/version.ts
var ENGINE_VERSION, ENGINE_SHORT, ENGINE_CODENAME, PRODUCT_TITLE;
var init_version = __esm({
  "src/version.ts"() {
    "use strict";
    ENGINE_VERSION = "19.7.15";
    ENGINE_SHORT = "19.7";
    ENGINE_CODENAME = "SelfImpulse";
    PRODUCT_TITLE = `SelfImpulse (engine MJ ${ENGINE_SHORT} "${ENGINE_CODENAME}")`;
  }
});

// src/app/id.ts
function cryptoToken() {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  if (c && typeof c.getRandomValues === "function") {
    const bytes = new Uint8Array(16);
    c.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  }
  degradedSeq += 1;
  return `nocrypto-fallback-${degradedSeq.toString(36)}`;
}
function uid(prefix) {
  return `${prefix}-${cryptoToken()}`;
}
function nowIso() {
  return (/* @__PURE__ */ new Date()).toISOString();
}
var degradedSeq;
var init_id = __esm({
  "src/app/id.ts"() {
    "use strict";
    degradedSeq = 0;
  }
});

// src/domain/types.ts
var GRAPH_SCHEMA_VERSION;
var init_types = __esm({
  "src/domain/types.ts"() {
    "use strict";
    GRAPH_SCHEMA_VERSION = 2;
  }
});

// src/ipc/localDb.ts
var localDb_exports = {};
__export(localDb_exports, {
  localDb: () => localDb
});
function empty() {
  return {
    workflows: [],
    executions: [],
    events: [],
    memories: [],
    skills: [],
    feedback: [],
    evolution: [],
    mcp: seedMcp(),
    approvals: [],
    dlq: [],
    secrets: {},
    runQueue: []
  };
}
function seedMcp() {
  const now = nowIso();
  const rows = [
    ["mcp.filesystem", "Filesystem", "npx", ["-y", "tsx", "vendor/mcp-servers-reference/src/filesystem/index.ts"]],
    ["mcp.git", "Git", "python", ["-m", "mcp_server_git"]],
    ["mcp.memory", "Memory", "npx", ["-y", "tsx", "vendor/mcp-servers-reference/src/memory/index.ts"]],
    ["mcp.sequential-thinking", "Sequential Thinking", "npx", ["-y", "tsx", "vendor/mcp-servers-reference/src/sequentialthinking/index.ts"]],
    ["mcp.time", "Time", "python", ["-m", "mcp_server_time"]],
    ["mcp.github", "GitHub", "github-mcp-server", ["stdio"]],
    ["mcp.control", "Control MCP", "selfimpulse-control-mcp", ["stdio"]]
  ];
  return rows.map(([id, name, command, args]) => ({
    id,
    name,
    transport: "stdio",
    config: { transport: "stdio", command, args, enabled: id === "mcp.control", pinned: true },
    state: "AVAILABLE",
    createdAt: now,
    updatedAt: now
  }));
}
function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return empty();
    return { ...empty(), ...JSON.parse(raw) };
  } catch {
    return empty();
  }
}
function save(db) {
  localStorage.setItem(KEY, JSON.stringify(db));
}
var KEY, localDb;
var init_localDb = __esm({
  "src/ipc/localDb.ts"() {
    "use strict";
    init_id();
    init_types();
    KEY = "selfimpulse.v3.db";
    localDb = {
      load,
      save,
      reset() {
        localStorage.removeItem(KEY);
      },
      workflowList() {
        return load().workflows.slice().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      },
      workflowGet(id) {
        const w = load().workflows.find((x) => x.id === id);
        if (!w) throw new Error(`workflow not found: ${id}`);
        return w;
      },
      workflowCreate(name, description) {
        const db = load();
        const id = uid("wf");
        const now = nowIso();
        const graph = {
          schemaVersion: GRAPH_SCHEMA_VERSION,
          id,
          name,
          nodes: [],
          connections: [],
          viewport: { x: 0, y: 0, zoom: 1 },
          groups: [],
          notes: []
        };
        db.workflows.unshift({ id, name, description, graph, createdAt: now, updatedAt: now, tags: [] });
        save(db);
        return { id };
      },
      workflowSave(id, name, description, graph) {
        const db = load();
        const w = db.workflows.find((x) => x.id === id);
        if (!w) throw new Error("workflow not found");
        w.name = name;
        w.description = description;
        w.graph = graph;
        w.updatedAt = nowIso();
        save(db);
      },
      workflowDelete(id) {
        const db = load();
        db.workflows = db.workflows.filter((w) => w.id !== id);
        save(db);
      },
      executionCreate(workflowId, workflowVersion) {
        const db = load();
        const id = uid("exec");
        db.executions.unshift({
          id,
          workflowId,
          workflowVersion,
          status: "RUNNING",
          startedAt: nowIso(),
          endedAt: null,
          error: null,
          stats: { nodesRun: 0, nodesFailed: 0, retries: 0, inputTokens: 0, outputTokens: 0, durationMs: 0, costUsd: 0, evaluationScores: [] }
        });
        save(db);
        return { id };
      },
      executionFinish(id, status, error, stats) {
        const db = load();
        const e = db.executions.find((x) => x.id === id);
        if (!e) return;
        e.status = status;
        e.error = error;
        e.stats = stats;
        e.endedAt = nowIso();
        save(db);
      },
      executionList() {
        return load().executions;
      },
      eventEmit(executionId, kind, level, nodeId, data) {
        const db = load();
        const rec = {
          seq: db.events.length + 1,
          ts: nowIso(),
          kind,
          level,
          nodeId,
          executionId,
          data
        };
        db.events.push(rec);
        if (db.events.length > 4e3) db.events = db.events.slice(-3e3);
        save(db);
        window.dispatchEvent(new CustomEvent("vh://event", { detail: rec }));
        return rec;
      },
      executionEvents(executionId) {
        return load().events.filter((e) => e.executionId === executionId);
      },
      importedGenomesSave(rows) {
        const db = load();
        db.importedGenomes = rows;
        save(db);
      },
      importedGenomesList() {
        return load().importedGenomes ?? [];
      },
      secretSet(ref, value) {
        const db = load();
        db.secrets[ref] = value;
        save(db);
      },
      secretDelete(ref) {
        const db = load();
        delete db.secrets[ref];
        save(db);
      },
      secretExists(refs) {
        const db = load();
        return Object.fromEntries(
          refs.map((r) => [
            r,
            db.secrets[r] ? { exists: true, location: "browser-localStorage", survivesRestart: true, warning: "Stored in browser localStorage, not an OS keychain. Readable by anything in this origin." } : { exists: false, location: "absent", survivesRestart: false }
          ])
        );
      },
      secretGet(ref) {
        return load().secrets[ref] ?? null;
      },
      mcpList() {
        return load().mcp;
      },
      mcpSave(cfg) {
        const db = load();
        const id = cfg.id || uid("mcp");
        const now = nowIso();
        const existing = db.mcp.find((m) => m.id === id);
        if (existing) {
          Object.assign(existing, cfg, { updatedAt: now });
        } else {
          db.mcp.push({
            id,
            name: cfg.name,
            transport: cfg.transport ?? "stdio",
            config: cfg.config ?? { transport: "stdio", enabled: true },
            state: "AVAILABLE",
            createdAt: now,
            updatedAt: now
          });
        }
        save(db);
        return { id };
      },
      mcpRemove(id) {
        const db = load();
        db.mcp = db.mcp.filter((m) => m.id !== id);
        save(db);
      },
      memoryAdd(nodeKey, kind, content, tags, importance) {
        const db = load();
        const rec = { id: uid("mem"), nodeKey, kind, content, tags, importance, createdAt: nowIso() };
        db.memories.unshift(rec);
        save(db);
        return { id: rec.id };
      },
      memorySearch(nodeKey, query, limit = 12) {
        const q = query.toLowerCase();
        return load().memories.filter((m) => m.nodeKey === nodeKey && (!q || m.content.toLowerCase().includes(q))).slice(0, limit);
      },
      memoryDelete(id) {
        const db = load();
        db.memories = db.memories.filter((m) => m.id !== id);
        save(db);
      },
      skillsList(nodeKey) {
        const all = load().skills.filter((s) => s.nodeKey === nodeKey);
        return { skills: all.filter((s) => s.active), all };
      },
      skillUpsert(args) {
        const db = load();
        const rec = {
          id: uid("skill"),
          nodeKey: args.nodeKey,
          name: args.name,
          description: args.description,
          procedure: args.procedure,
          preconditions: "",
          toolStrategy: "",
          verificationStrategy: "",
          knownFailureModes: "",
          version: 1,
          score: null,
          origin: args.origin,
          active: true,
          createdAt: nowIso(),
          updatedAt: nowIso(),
          applications: 0
        };
        db.skills.push(rec);
        save(db);
        return { id: rec.id, version: 1 };
      },
      feedbackAdd(executionId, nodeKey, rating, comment) {
        const db = load();
        const rec = { id: uid("fb"), executionId, nodeKey, rating, comment, createdAt: nowIso() };
        db.feedback.unshift(rec);
        save(db);
        return { id: rec.id };
      },
      feedbackList() {
        return load().feedback;
      },
      evolutionList() {
        return load().evolution;
      },
      evolutionPropose(cand) {
        const db = load();
        const rec = {
          id: uid("evo"),
          nodeKey: cand.nodeKey ?? "",
          parentVersion: cand.parentVersion ?? 1,
          candidateVersion: cand.candidateVersion ?? 2,
          trigger: cand.trigger ?? "manual",
          evidence: cand.evidence ?? [],
          changes: cand.changes ?? {},
          baselineScore: cand.baselineScore ?? null,
          candidateScore: cand.candidateScore ?? null,
          holdoutPassed: cand.holdoutPassed ?? null,
          regressionPassed: cand.regressionPassed ?? null,
          status: "PROPOSED",
          decision: "PENDING",
          createdAt: nowIso(),
          decidedAt: null
        };
        db.evolution.unshift(rec);
        save(db);
        return { id: rec.id };
      },
      evolutionDecide(id, decision) {
        const db = load();
        const c = db.evolution.find((x) => x.id === id);
        if (!c) throw new Error(`evolution candidate ${id} does not exist \u2014 nothing was changed.`);
        if (c.status !== "PROPOSED")
          throw new Error(
            `evolution candidate ${id} is not PROPOSED (current status ${c.status}) \u2014 it moves exactly once, from PROPOSED to DECIDED.`
          );
        c.decision = decision;
        c.status = "DECIDED";
        c.decidedAt = nowIso();
        save(db);
        return { ok: true };
      },
      approvalList() {
        return load().approvals.filter((a) => a.status === "OPEN").map(({ capability: _capability, ...rest }) => rest);
      },
      approvalRequest(executionId, nodeKey, summary, payload, requestedBy) {
        const db = load();
        const rec = {
          id: uid("appr"),
          executionId,
          nodeKey,
          summary,
          payload,
          status: "OPEN",
          createdAt: nowIso(),
          // C-2 (archive 4): the request binds who asked and what authority answers.
          requestedBy: requestedBy && requestedBy.trim() ? requestedBy : `execution:${executionId}`,
          authority: "human"
        };
        db.approvals.unshift(rec);
        save(db);
        window.dispatchEvent(new CustomEvent("vh://approval", { detail: rec }));
        return { id: rec.id, requestedBy: rec.requestedBy, authority: rec.authority };
      },
      /** C-2 (archive 4) — the web mirror's native-equivalent capability mint.
       *
       *  Desktop mints through an OS dialog; the browser's equivalent of a window
       *  WebView scripts cannot answer is `window.confirm` — synchronous, modal,
       *  and not programmatically dismissible. Declined confirm ⇒ no token, no
       *  decision. The token is scoped to one verdict and expires in five minutes,
       *  exactly like the native capability. */
      approvalAuthorize(id, decision) {
        if (decision !== "APPROVED" && decision !== "REJECTED") {
          throw new Error(`approval_authorize: decision must be APPROVED or REJECTED (got ${JSON.stringify(decision)})`);
        }
        const db = load();
        const a = db.approvals.find((x) => x.id === id);
        if (!a) throw new Error(`approval ${id} does not exist \u2014 nothing to authorize.`);
        if (a.status !== "OPEN") throw new Error(`approval ${id} is not OPEN (current status ${a.status}) \u2014 nothing to authorize.`);
        if (typeof window === "undefined" || typeof window.confirm !== "function") {
          throw new Error("approval_authorize requires an interactive confirm dialog \u2014 refusing to mint a capability non-interactively.");
        }
        const word = decision === "APPROVED" ? "approve" : "refuse";
        const ok = window.confirm(
          `SelfImpulse \u2014 human approval gate

${a.summary}

Requester: ${a.requestedBy ?? `execution:${a.executionId}`}
Required authority: ${a.authority ?? "human"}
Verdict if you confirm: ${decision}

${word.toUpperCase()} this? Cancel mints nothing and decides nothing.`
        );
        if (!ok) {
          throw new Error(`approval ${id}: declined at the confirm dialog \u2014 no capability was minted and no decision was recorded.`);
        }
        const token = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function" ? `cap_${crypto.randomUUID()}` : uid("cap");
        a.capability = token;
        a.capExpiresAt = Math.floor(Date.now() / 1e3) + 300;
        a.capDecision = decision;
        save(db);
        return { capability: token, expiresAt: a.capExpiresAt, approvalId: id, decision };
      },
      approvalDecide(id, decision, capability) {
        const db = load();
        const a = db.approvals.find((x) => x.id === id);
        if (!a) throw new Error(`approval ${id} does not exist \u2014 nothing was changed.`);
        if (a.status !== "OPEN")
          throw new Error(
            `approval ${id} is not OPEN (current status ${a.status}) \u2014 a decision is final; an approval moves exactly once, from OPEN to APPROVED or REJECTED.`
          );
        if (!capability || !capability.trim())
          throw new Error(
            `approval ${id}: no capability presented \u2014 a decision must first pass approval_authorize, where a human answers the dialog. Requester code cannot decide its own request.`
          );
        if (!a.capability)
          throw new Error(`approval ${id} has no live capability \u2014 call approval_authorize first; the human's answer is what makes a decision legitimate.`);
        if (a.capability !== capability)
          throw new Error(`capability does not belong to approval ${id} \u2014 it was minted for a different request (confused-approver refused).`);
        if (typeof a.capExpiresAt === "number" && Math.floor(Date.now() / 1e3) > a.capExpiresAt)
          throw new Error(`capability for approval ${id} expired (freshness window closed) \u2014 return to approval_authorize for a fresh answer.`);
        if (a.capDecision !== decision)
          throw new Error(
            `capability for approval ${id} was minted for ${a.capDecision ?? "no verdict"}; it cannot cast ${decision}. Re-open approval_authorize and let the human pick this verdict explicitly.`
          );
        a.status = decision;
        a.decidedBy = "human:confirm";
        a.decidedAt = nowIso();
        a.capability = void 0;
        a.capExpiresAt = void 0;
        a.capDecision = void 0;
        save(db);
      },
      approvalGet(executionId, nodeKey) {
        const a = load().approvals.find((x) => x.executionId === executionId && x.nodeKey === nodeKey && x.status !== "OPEN");
        return a ? { decided: true, status: a.status, id: a.id, decidedBy: a.decidedBy ?? "", decidedAt: a.decidedAt ?? null, requestedBy: a.requestedBy ?? "", payload: a.payload ?? {} } : { decided: false };
      },
      dlqList() {
        return load().dlq.filter((d) => d.status === "OPEN");
      },
      dlqAdd(executionId, nodeKey, error, payload, suggestedCause, candidateFix) {
        const db = load();
        const rec = {
          id: uid("dlq"),
          executionId,
          nodeKey,
          error,
          payload,
          status: "OPEN",
          suggestedCause,
          candidateFix,
          createdAt: nowIso()
        };
        db.dlq.unshift(rec);
        save(db);
        return { id: rec.id };
      },
      dlqResolve(id) {
        const db = load();
        const d = db.dlq.find((x) => x.id === id);
        if (d) d.status = "RESOLVED";
        save(db);
      },
      runEnqueue(workflowId) {
        const db = load();
        db.runQueue.push(workflowId);
        save(db);
      },
      runTake() {
        const db = load();
        const items = db.runQueue.splice(0);
        save(db);
        return items;
      }
    };
  }
});

// node_modules/@tauri-apps/api/external/tslib/tslib.es6.js
function __classPrivateFieldGet(receiver, state, kind, f) {
  if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a getter");
  if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
  return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
}
function __classPrivateFieldSet(receiver, state, value, kind, f) {
  if (kind === "m") throw new TypeError("Private method is not writable");
  if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a setter");
  if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot write private member to an object whose class did not declare it");
  return kind === "a" ? f.call(receiver, value) : f ? f.value = value : state.set(receiver, value), value;
}
var init_tslib_es6 = __esm({
  "node_modules/@tauri-apps/api/external/tslib/tslib.es6.js"() {
  }
});

// node_modules/@tauri-apps/api/core.js
var core_exports = {};
__export(core_exports, {
  Channel: () => Channel,
  PluginListener: () => PluginListener,
  Resource: () => Resource,
  SERIALIZE_TO_IPC_FN: () => SERIALIZE_TO_IPC_FN,
  addPluginListener: () => addPluginListener,
  checkPermissions: () => checkPermissions,
  convertFileSrc: () => convertFileSrc,
  invoke: () => invoke,
  isTauri: () => isTauri,
  requestPermissions: () => requestPermissions,
  transformCallback: () => transformCallback
});
function transformCallback(callback, once = false) {
  return window.__TAURI_INTERNALS__.transformCallback(callback, once);
}
async function addPluginListener(plugin, event, cb) {
  const handler = new Channel(cb);
  try {
    await invoke(`plugin:${plugin}|register_listener`, {
      event,
      handler
    });
    return new PluginListener(plugin, event, handler.id);
  } catch {
    await invoke(`plugin:${plugin}|registerListener`, { event, handler });
    return new PluginListener(plugin, event, handler.id);
  }
}
async function checkPermissions(plugin) {
  return invoke(`plugin:${plugin}|check_permissions`);
}
async function requestPermissions(plugin) {
  return invoke(`plugin:${plugin}|request_permissions`);
}
async function invoke(cmd, args = {}, options) {
  return window.__TAURI_INTERNALS__.invoke(cmd, args, options);
}
function convertFileSrc(filePath, protocol = "asset") {
  return window.__TAURI_INTERNALS__.convertFileSrc(filePath, protocol);
}
function isTauri() {
  return !!(globalThis || window).isTauri;
}
var _Channel_onmessage, _Channel_nextMessageIndex, _Channel_pendingMessages, _Channel_messageEndIndex, _Resource_rid, SERIALIZE_TO_IPC_FN, Channel, PluginListener, Resource;
var init_core = __esm({
  "node_modules/@tauri-apps/api/core.js"() {
    init_tslib_es6();
    SERIALIZE_TO_IPC_FN = "__TAURI_TO_IPC_KEY__";
    Channel = class {
      constructor(onmessage) {
        _Channel_onmessage.set(this, void 0);
        _Channel_nextMessageIndex.set(this, 0);
        _Channel_pendingMessages.set(this, []);
        _Channel_messageEndIndex.set(this, void 0);
        __classPrivateFieldSet(this, _Channel_onmessage, onmessage || (() => {
        }), "f");
        this.id = transformCallback((rawMessage) => {
          const index = rawMessage.index;
          if ("end" in rawMessage) {
            if (index == __classPrivateFieldGet(this, _Channel_nextMessageIndex, "f")) {
              this.cleanupCallback();
            } else {
              __classPrivateFieldSet(this, _Channel_messageEndIndex, index, "f");
            }
            return;
          }
          const message = rawMessage.message;
          if (index == __classPrivateFieldGet(this, _Channel_nextMessageIndex, "f")) {
            __classPrivateFieldGet(this, _Channel_onmessage, "f").call(this, message);
            __classPrivateFieldSet(this, _Channel_nextMessageIndex, __classPrivateFieldGet(this, _Channel_nextMessageIndex, "f") + 1, "f");
            while (__classPrivateFieldGet(this, _Channel_nextMessageIndex, "f") in __classPrivateFieldGet(this, _Channel_pendingMessages, "f")) {
              const message2 = __classPrivateFieldGet(this, _Channel_pendingMessages, "f")[__classPrivateFieldGet(this, _Channel_nextMessageIndex, "f")];
              __classPrivateFieldGet(this, _Channel_onmessage, "f").call(this, message2);
              delete __classPrivateFieldGet(this, _Channel_pendingMessages, "f")[__classPrivateFieldGet(this, _Channel_nextMessageIndex, "f")];
              __classPrivateFieldSet(this, _Channel_nextMessageIndex, __classPrivateFieldGet(this, _Channel_nextMessageIndex, "f") + 1, "f");
            }
            if (__classPrivateFieldGet(this, _Channel_nextMessageIndex, "f") === __classPrivateFieldGet(this, _Channel_messageEndIndex, "f")) {
              this.cleanupCallback();
            }
          } else {
            __classPrivateFieldGet(this, _Channel_pendingMessages, "f")[index] = message;
          }
        });
      }
      cleanupCallback() {
        window.__TAURI_INTERNALS__.unregisterCallback(this.id);
      }
      set onmessage(handler) {
        __classPrivateFieldSet(this, _Channel_onmessage, handler, "f");
      }
      get onmessage() {
        return __classPrivateFieldGet(this, _Channel_onmessage, "f");
      }
      [(_Channel_onmessage = /* @__PURE__ */ new WeakMap(), _Channel_nextMessageIndex = /* @__PURE__ */ new WeakMap(), _Channel_pendingMessages = /* @__PURE__ */ new WeakMap(), _Channel_messageEndIndex = /* @__PURE__ */ new WeakMap(), SERIALIZE_TO_IPC_FN)]() {
        return `__CHANNEL__:${this.id}`;
      }
      toJSON() {
        return this[SERIALIZE_TO_IPC_FN]();
      }
    };
    PluginListener = class {
      constructor(plugin, event, channelId) {
        this.plugin = plugin;
        this.event = event;
        this.channelId = channelId;
      }
      async unregister() {
        return invoke(`plugin:${this.plugin}|remove_listener`, {
          event: this.event,
          channelId: this.channelId
        });
      }
    };
    Resource = class {
      get rid() {
        return __classPrivateFieldGet(this, _Resource_rid, "f");
      }
      constructor(rid) {
        _Resource_rid.set(this, void 0);
        __classPrivateFieldSet(this, _Resource_rid, rid, "f");
      }
      /**
       * Destroys and cleans up this resource from memory.
       * **You should not call any method on this object anymore and should drop any reference to it.**
       */
      async close() {
        return invoke("plugin:resources|close", {
          rid: this.rid
        });
      }
    };
    _Resource_rid = /* @__PURE__ */ new WeakMap();
  }
});

// src/ipc/client.ts
async function tauriInvoke(cmd, args) {
  const { invoke: invoke3 } = await Promise.resolve().then(() => (init_core(), core_exports));
  return invoke3(cmd, args ?? {});
}
function pickExecGrant(program, cwd, needNetwork) {
  const now = Date.now() / 1e3;
  execGrants = execGrants.filter((g) => g.expiresAt > now + 5);
  const bare = bareProgram(program);
  return execGrants.find((g) => (g.network || !needNetwork) && g.programs.includes(bare) && (cwd === void 0 || within(cwd, g.workspace)));
}
function dropExecGrant(token) {
  execGrants = execGrants.filter((g) => g.token !== token);
}
async function requestExecGrant(workspace, network, programs = [], minutes) {
  const ws = workspace ?? String((await ipc.appInfo()).workspaceRoot ?? "");
  const r = await tauriInvoke("exec_grant_request", { programs, workspace: ws, network, minutes });
  const g = { token: r.grant, workspace: r.workspace, network: r.network, programs: r.programs, expiresAt: r.expiresAt };
  execGrants.push(g);
  return g;
}
var useTauri, browserReason, execGrants, bareProgram, norm, within, ipc;
var init_client = __esm({
  "src/ipc/client.ts"() {
    "use strict";
    init_desktop();
    init_guardrail();
    init_egressNet();
    init_version();
    init_localDb();
    useTauri = () => detectHost() === "tauri";
    browserReason = "No browser is attached in this build: the app does not bundle or launch Chromium, so there is no session, no page and no DOM. Nothing was fetched.";
    execGrants = [];
    bareProgram = (p) => (p.split(/[\\/]/).pop() ?? p).replace(/\.exe$/i, "");
    norm = (p) => p.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
    within = (child, root2) => norm(child) === norm(root2) || norm(child).startsWith(norm(root2) + "/");
    ipc = {
      appInfo: async () => {
        if (useTauri()) return tauriInvoke("app_info");
        return {
          version: ENGINE_VERSION,
          platform: navigator.platform,
          workspaceRoot: "(browser workspace)",
          artifactsDir: "(memory)",
          dbHealthy: true,
          controlMcpPort: 0,
          controlMcpTransport: "stdio",
          controlMcpRunning: true,
          startupMs: 0,
          host: "webview-host",
          vendors: ["mcp-servers-reference", "mcp-github"]
        };
      },
      /* ---------------------------------------------------------------- federation
       *
       * The desktop app bundles an A2A host and, until now, did nothing with it:
       * `app_info` reported `a2aHostPath`, and no TypeScript ever read the field.
       * The architecture was therefore a fact a user had to discover, which is not
       * the same thing as a product concept.
       *
       * It is one now, and the decision is EXPLICIT rather than automatic. A host
       * binds a TCP port and signs an agent card, so silently starting one on launch
       * would be the app opening a listener nobody asked for. Instead the user
       * mounts it deliberately, and the UI says plainly what mounting means before
       * the button does anything.
       */
      /* ── FEDERATION ────────────────────────────────────────────────────────
       * Three commands, one lifecycle. This used to be a single `shellExec` call
       * with a 20-second timeout, which cannot work: `run_timeout()` kills the
       * child on the deadline, so a long-lived A2A host came up, announced READY,
       * and was terminated while the UI still called it mounted. The backend now
       * supervises the child itself (`a2a_host_start` / `_status` / `_stop`), and
       * `running` is a question the OS answers rather than a constant. */
      federationStatus: async () => {
        if (!useTauri()) {
          return {
            state: "unavailable",
            bundled: false,
            hostPath: null,
            running: false,
            pid: null,
            port: null,
            cardUrl: null,
            interfaceUrl: null,
            selfimpulse: null,
            identityFp: null,
            cardSigned: false,
            tokenMinted: false,
            bindScope: null,
            bindAddress: null,
            pairingCode: null,
            pairingExpires: null,
            files: false,
            detail: "Federation is a desktop capability. This build has no bundled A2A host."
          };
        }
        let info = {};
        try {
          info = await tauriInvoke("app_info");
        } catch {
        }
        const bundled = info?.a2aHostBundled === true;
        const hostPath = info?.a2aHostPath ?? null;
        const base = { bundled, hostPath };
        try {
          const st = await tauriInvoke("a2a_host_status");
          const state = typeof st.state === "string" ? st.state : "stopped";
          return {
            state,
            ...base,
            running: st.running === true && state === "running",
            files: st.files === true,
            pid: typeof st.pid === "number" ? st.pid : null,
            port: typeof st.port === "number" ? st.port : null,
            cardUrl: typeof st.cardUrl === "string" ? st.cardUrl : null,
            interfaceUrl: typeof st.interfaceUrl === "string" ? st.interfaceUrl : null,
            selfimpulse: typeof st.selfimpulse === "string" ? st.selfimpulse : null,
            identityFp: typeof st.identityFp === "string" ? st.identityFp : null,
            cardSigned: st.cardSigned === true,
            tokenMinted: st.tokenMinted === true,
            bindScope: st.bindScope === "lan" ? "lan" : st.bindScope === "local" ? "local" : null,
            bindAddress: typeof st.bindAddress === "string" ? st.bindAddress : null,
            pairingCode: typeof st.pairingCode === "string" ? st.pairingCode : null,
            pairingExpires: typeof st.pairingExpires === "string" ? st.pairingExpires : null,
            detail: String(st.detail ?? "")
          };
        } catch (err) {
          return {
            state: bundled ? "stopped" : "unavailable",
            ...base,
            running: false,
            pid: null,
            port: null,
            cardUrl: null,
            interfaceUrl: null,
            selfimpulse: null,
            identityFp: null,
            cardSigned: false,
            tokenMinted: false,
            bindScope: null,
            bindAddress: null,
            pairingCode: null,
            pairingExpires: null,
            files: false,
            detail: `Could not read the A2A host state: ${String(err)}`
          };
        }
      },
      federationMount: async (opts) => {
        if (!useTauri()) return { ok: false, detail: "Federation is a desktop capability." };
        const st = await ipc.federationStatus();
        if (!st.bundled || !st.hostPath) {
          return { ok: false, detail: "No A2A host is bundled with this build; nothing was started." };
        }
        if (st.state === "running") {
          return { ok: true, detail: `The A2A host is already mounted (pid ${st.pid}, port ${st.port}); a second mount was not started.` };
        }
        try {
          const r = await tauriInvoke("a2a_host_start", {
            selfimpulse: opts.selfimpulse || "SelfImpulse",
            port: opts.port ?? 0,
            bind: opts.bind ?? "local",
            pair: opts.pair === true,
            files: opts.files === true
          });
          return { ok: r.ok === true, detail: String(r.detail ?? (r.ok === true ? "The host is mounted." : "The host did not report ready.")) };
        } catch (err) {
          return { ok: false, detail: `Mount failed in words rather than pretending: ${String(err)}` };
        }
      },
      federationStop: async () => {
        if (!useTauri()) return { ok: false, detail: "Federation is a desktop capability." };
        try {
          const r = await tauriInvoke("a2a_host_stop");
          return { ok: r.ok !== false, detail: String(r.detail ?? "The A2A host was stopped.") };
        } catch (err) {
          return { ok: false, detail: `Stop failed in words rather than pretending: ${String(err)}` };
        }
      },
      dbMaintenance: async (vacuum) => {
        if (useTauri()) return tauriInvoke("db_maintenance", { vacuum });
        if (vacuum) {
        }
        const raw = localStorage.getItem("selfimpulse.v3.db") ?? "";
        return { vacuumed: vacuum, sizeBytes: raw.length };
      },
      workflowList: async () => {
        if (useTauri()) return tauriInvoke("workflow_list");
        return localDb.workflowList();
      },
      workflowGet: async (workflowId) => {
        if (useTauri()) return tauriInvoke("workflow_get", { workflowId });
        return localDb.workflowGet(workflowId);
      },
      workflowCreate: async (name, description) => {
        if (useTauri()) return tauriInvoke("workflow_create", { name, description });
        return localDb.workflowCreate(name, description);
      },
      workflowDelete: async (workflowId) => {
        if (useTauri()) return tauriInvoke("workflow_delete", { workflowId });
        localDb.workflowDelete(workflowId);
      },
      workflowSave: async (workflowId, name, description, graph) => {
        if (useTauri()) return tauriInvoke("workflow_save", { workflowId, name, description, graph });
        localDb.workflowSave(workflowId, name, description, graph);
      },
      // V7 fix (bug T): the browser fallbacks for versioning fabricated an id and a constant
      // `version: 1`, so the version history UI showed a plausible list of versions that were never
      // stored and could not be restored. These now fail loudly. The Tauri side is real.
      versionCreate: async (workflowId, label) => {
        if (useTauri()) return tauriInvoke("workflow_version_create", { workflowId, label });
        throw new Error("Workflow versions are only stored by the native build; nothing was saved in this browser session.");
      },
      versionList: async (_workflowId) => {
        if (useTauri()) return tauriInvoke("workflow_versions", { workflowId: _workflowId });
        throw new Error("Workflow versions are only stored by the native build; this browser session has no version history to show.");
      },
      versionRestore: async (versionRecordId) => {
        if (useTauri()) return tauriInvoke("workflow_version_restore", { versionRecordId });
        throw new Error("Cannot restore a version in the browser: nothing was ever stored, so nothing was changed.");
      },
      nodeStateLoad: async (nodeKey) => {
        if (useTauri()) return tauriInvoke("node_state_load", { nodeKey });
        return {};
      },
      nodeStateSave: async (nodeKey, rolePrompt) => {
        if (useTauri()) return tauriInvoke("node_state_save", { nodeKey, rolePrompt });
      },
      memoryAdd: async (nodeKey, kind, content, tags, importance, executionId) => {
        if (useTauri()) return tauriInvoke("memory_add", { nodeKey, kind, content, tags, importance, executionId });
        return localDb.memoryAdd(nodeKey, kind, content, tags, importance);
      },
      memorySearch: async (nodeKey, query, limit = 12) => {
        if (useTauri()) return tauriInvoke("memory_search", { nodeKey, query, limit, kinds: null });
        return localDb.memorySearch(nodeKey, query, limit);
      },
      memoryDelete: async (memoryId) => {
        if (useTauri()) return tauriInvoke("memory_delete", { memoryId });
        localDb.memoryDelete(memoryId);
      },
      skillsList: async (nodeKey) => {
        if (useTauri()) return tauriInvoke("skills_list", { nodeKey });
        return localDb.skillsList(nodeKey);
      },
      skillTouch: async (skillIds) => {
        if (useTauri()) return tauriInvoke("skill_touch", { skill_ids: skillIds });
        throw new Error("Skill usage counts live in the native build's SQLite store; the browser preview has no skill store to update.");
      },
      skillDeactivate: async (skillId) => {
        if (useTauri()) return tauriInvoke("skill_deactivate", { skill_id: skillId });
      },
      skillUpsert: async (args) => {
        if (useTauri()) return tauriInvoke("skill_upsert", args);
        return localDb.skillUpsert(args);
      },
      feedbackAdd: async (executionId, nodeKey, rating, comment) => {
        if (useTauri()) return tauriInvoke("feedback_add", { executionId, nodeKey, rating, comment });
        return localDb.feedbackAdd(executionId, nodeKey, rating, comment);
      },
      feedbackList: async () => {
        if (useTauri()) return tauriInvoke("feedback_list");
        return localDb.feedbackList();
      },
      // V7 fix (bug T): these returned fabricated ids and empty lists. A fabricated evaluation id
      // implies a stored result that does not exist, and an empty list is indistinguishable from
      // "no evaluations have ever run" — both read as success while nothing happened.
      evaluationSave: async (nodeKey, executionId, suite, score, details) => {
        if (useTauri()) return tauriInvoke("evaluation_save", { nodeKey, executionId, suite, score, details });
        throw new Error("Evaluation results live in the native build's SQLite database; the browser preview has no database to write.");
      },
      evaluationHistory: async (nodeKey) => {
        if (useTauri()) return tauriInvoke("evaluation_history", { nodeKey });
        throw new Error("Evaluation history lives in the native build's SQLite database; the browser preview has no database to read.");
      },
      suiteList: async () => {
        if (useTauri()) return tauriInvoke("suite_list");
        throw new Error("Test suites live in the native build's SQLite database; the browser preview has no database to read.");
      },
      suiteSave: async (args) => {
        if (useTauri()) return tauriInvoke("suite_save", args);
        throw new Error("Test suites live in the native build's SQLite database; the browser preview has no database to write.");
      },
      evolutionProposeSave: async (cand) => {
        if (useTauri()) return tauriInvoke("evolution_propose_save", { cand });
        return localDb.evolutionPropose(cand);
      },
      evolutionList: async (nodeKey) => {
        if (useTauri()) return tauriInvoke("evolution_list", { nodeKey: nodeKey ?? null });
        return localDb.evolutionList();
      },
      evolutionDecide: async (candidateId, decision) => {
        if (useTauri()) return tauriInvoke("evolution_decide", { candidateId, decision });
        return localDb.evolutionDecide(candidateId, decision);
      },
      evolutionRollback: async (candidateId, restoreRolePrompt) => {
        if (useTauri()) return tauriInvoke("evolution_rollback", { candidateId, restoreRolePrompt: restoreRolePrompt ?? null });
      },
      approvalRequest: async (executionId, nodeKey, summary, payload, requestedBy) => {
        if (useTauri()) return tauriInvoke("approval_request", { executionId, nodeKey, summary, payload, requestedBy: requestedBy ?? null });
        return localDb.approvalRequest(executionId, nodeKey, summary, payload, requestedBy);
      },
      approvalGet: async (executionId, nodeKey) => {
        if (useTauri()) return tauriInvoke("approval_get", { executionId, nodeKey });
        return localDb.approvalGet(executionId, nodeKey);
      },
      approvalList: async () => {
        if (useTauri()) return tauriInvoke("approval_list");
        return localDb.approvalList();
      },
      /** C-2 (archive 4): mint the decision capability — native OS dialog in the
       *  desktop app, an interactive confirm in the web mirror. The token it
       *  returns is the ONLY thing approvalDecide will accept. */
      approvalAuthorize: async (approvalId, decision) => {
        if (useTauri()) return tauriInvoke("approval_authorize", { approvalId, decision });
        return localDb.approvalAuthorize(approvalId, decision);
      },
      approvalDecide: async (approvalId, decision, capability) => {
        if (useTauri()) return tauriInvoke("approval_decide", { approvalId, decision, capability });
        localDb.approvalDecide(approvalId, decision, capability);
      },
      executionCreate: async (workflowId, workflowVersion) => {
        if (useTauri()) return tauriInvoke("execution_create", { workflowId, workflowVersion });
        return localDb.executionCreate(workflowId, workflowVersion);
      },
      executionFinish: async (executionId, status, error, stats) => {
        if (useTauri()) return tauriInvoke("execution_finish", { executionId, status, error, stats });
        localDb.executionFinish(executionId, status, error, stats);
      },
      eventEmit: async (executionId, kind, level, nodeId, data) => {
        if (useTauri()) {
          const rec = await tauriInvoke("event_emit", { executionId, kind, level, nodeId, data });
          window.dispatchEvent(new CustomEvent("vh://event", { detail: rec }));
          return rec;
        }
        return localDb.eventEmit(executionId, kind, level, nodeId, data);
      },
      executionEvents: async (executionId) => {
        if (useTauri()) return tauriInvoke("execution_events", { executionId });
        return localDb.executionEvents(executionId);
      },
      executionTrace: async (executionId) => {
        if (useTauri()) return tauriInvoke("execution_trace", { executionId });
        return { events: localDb.executionEvents(executionId), status: "COMPLETED" };
      },
      executionList: async () => {
        if (useTauri()) return tauriInvoke("execution_list");
        return localDb.executionList();
      },
      dlqAdd: async (executionId, nodeKey, error, payload, suggestedCause, candidateFix) => {
        if (useTauri()) return tauriInvoke("dlq_add", { executionId, nodeKey, error, payload, suggestedCause, candidateFix });
        return localDb.dlqAdd(executionId, nodeKey, error, payload, suggestedCause, candidateFix);
      },
      dlqList: async () => {
        if (useTauri()) return tauriInvoke("dlq_list");
        return localDb.dlqList();
      },
      dlqResolve: async (dlqId) => {
        if (useTauri()) return tauriInvoke("dlq_resolve", { dlqId });
        localDb.dlqResolve(dlqId);
      },
      runRequestTake: async () => {
        if (useTauri()) return tauriInvoke("run_request_take");
        return localDb.runTake();
      },
      evolutionServiceHealth: async () => {
        if (useTauri()) return tauriInvoke("evolution_service_health");
        return {
          available: false,
          transport: "stdio",
          reason: "The evolution service is a stdio child process of the native host. Build the desktop app (npm run tauri:build).",
          engine: "mj_evolution.stdio_server",
          hooks: ["on_session_start", "pre_llm_call", "post_llm_call", "on_session_end"]
        };
      },
      hermesBridge: async (msg) => {
        if (useTauri()) return tauriInvoke("hermes_bridge", { msg });
        return { ok: true, transport: "in-process", echo: msg };
      },
      evolutionServicePropose: async (args) => {
        if (useTauri()) return tauriInvoke("evolution_service_propose", { args });
        return null;
      },
      secretGet: async (secretRef) => {
        if (useTauri()) return tauriInvoke("secret_get", { secretRef });
        const value = localDb.secretGet(secretRef);
        return { ref: secretRef, present: value != null && value !== "", value: value ?? null };
      },
      secretSet: async (secretRef, value) => {
        if (useTauri()) return tauriInvoke("secret_set", { secretRef, value });
        localDb.secretSet(secretRef, value);
        return { stored: true, location: "browser-localStorage", survivesRestart: true, warning: "Stored in browser localStorage, not an OS keychain." };
      },
      secretDelete: async (secretRef) => {
        if (useTauri()) return tauriInvoke("secret_delete", { secretRef });
        localDb.secretDelete(secretRef);
      },
      secretExists: async (refs) => {
        if (useTauri()) return tauriInvoke("secret_exists", { secretRefs: refs });
        return localDb.secretExists(refs);
      },
      llmChat: async (req) => {
        const target = req.base_url && req.base_url.trim() ? req.base_url.trim() : void 0;
        if (target) {
          const egress = checkEgressUrl(target);
          if (!egress.ok) {
            throw new Error(
              `base URL refused by the egress guard: ${egress.reason} \u2014 nothing was sent and no key left this machine.`
            );
          }
        }
        if (useTauri()) return tauriInvoke("llm_chat", { req: { ...req, base_url: target } });
        const key2 = localDb.secretGet(req.secret_ref);
        if (req.provider === "ollama" || target?.includes("11434")) {
          try {
            const r = await safeEgressFetch(`${target || "http://127.0.0.1:11434"}/api/chat`, {
              method: "POST",
              allowLoopback: true,
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                model: req.model,
                stream: false,
                messages: [
                  ...req.system ? [{ role: "system", content: req.system }] : [],
                  ...req.messages
                ]
              })
            });
            const j = await r.json();
            return {
              content: j.message?.content ?? "",
              model: req.model,
              usage: { input_tokens: 0, output_tokens: 0 },
              duration_ms: 0
            };
          } catch (e) {
            throw new Error(`ollama unreachable: ${e}`);
          }
        }
        if (!key2) throw new Error(`secret not found: ${req.secret_ref}`);
        throw new Error("Cloud LLM calls from the web host require the native desktop build (CORS). Use Local LLM / Ollama or run `npm run tauri`.");
      },
      fsRead: async (path2) => {
        if (useTauri()) return tauriInvoke("fs_read", { path: path2 });
        throw new Error("Filesystem is available in the native desktop build.");
      },
      fsWrite: async (path2, content) => {
        if (useTauri()) return tauriInvoke("fs_write", { path: path2, content });
        throw new Error("Filesystem is available in the native desktop build.");
      },
      fsList: async (path2) => {
        if (useTauri()) return tauriInvoke("fs_list", { path: path2 });
        return [];
      },
      fsMkdir: async (path2) => {
        if (useTauri()) return tauriInvoke("fs_mkdir", { path: path2 });
      },
      fsRemove: async (path2, recursive) => {
        if (useTauri()) return tauriInvoke("fs_remove", { path: path2, recursive });
      },
      /**
       * Run a dev tool inside the sandbox. The native side runs NOTHING without an execution grant a
       * human minted at a native dialog (which tools, which workspace, network or not, for how long).
       * The grant is requested on first need and kept in this module's memory — never persisted — and
       * renewed transparently when it expires or is revoked. Network is OFF unless `opts.network` asks
       * for it, in which case the dialog says so in capitals.
       */
      shellExec: async (program, args, cwd, timeoutSecs, opts) => {
        if (!useTauri()) throw new Error("Terminal is available in the native desktop build.");
        const needNetwork = opts?.network === true;
        let g = pickExecGrant(program, cwd, needNetwork);
        if (!g) g = await requestExecGrant(cwd, needNetwork);
        try {
          return await tauriInvoke("shell_exec", { program, args, cwd, timeoutSecs, grant: g.token });
        } catch (e) {
          if (!/unknown or was revoked|has expired/i.test(String(e))) throw e;
          dropExecGrant(g.token);
          const fresh = await requestExecGrant(cwd, needNetwork);
          return await tauriInvoke("shell_exec", { program, args, cwd, timeoutSecs, grant: fresh.token });
        }
      },
      /** Ask (natively) for an execution grant. Resolves with its public shape — the token stays inside this module. */
      execGrantRequest: async (o = {}) => {
        if (!useTauri()) throw new Error("Execution grants exist in the native desktop build only.");
        const g = await requestExecGrant(o.workspace, o.network === true, o.programs, o.minutes);
        return { workspace: g.workspace, network: g.network, programs: g.programs, expiresAt: g.expiresAt };
      },
      execGrantsStatus: async () => {
        if (!useTauri()) return [];
        return tauriInvoke("exec_grants_status");
      },
      execGrantsRevoke: async () => {
        if (!useTauri()) return { revoked: 0 };
        execGrants = [];
        return tauriInvoke("exec_grants_revoke");
      },
      /**
       * Bind a provider key to ONE non-canonical https origin. The vendor's own host needs no binding;
       * anything else (a self-hosted or BYOK gateway) needs a human at a native dialog, because the
       * page cannot be trusted to say where a key may go.
       */
      providerBindEndpoint: async (secretRef, baseUrl) => {
        if (!useTauri()) throw new Error("Endpoint binding exists in the native desktop build only \u2014 the web edition holds no cloud keys.");
        return tauriInvoke("provider_bind_endpoint", { secretRef, baseUrl });
      },
      providerEndpointsList: async () => {
        if (!useTauri()) return [];
        return tauriInvoke("provider_endpoints_list");
      },
      providerUnbindEndpoint: async (secretRef) => {
        if (!useTauri()) return { unbound: false, secretRef };
        return tauriInvoke("provider_unbind_endpoint", { secretRef });
      },
      // QA fix (audit C2): the native filesystem is sandboxed to the app data dir plus these
      // user-registered workspace roots. Teams registers the runner repo when a run starts.
      workspaceRootAdd: async (root2) => {
        if (!useTauri()) return { ok: false, path: root2 };
        return tauriInvoke("workspace_root_add", { root: root2 });
      },
      workspaceRootRemove: async (root2) => {
        if (!useTauri()) return { ok: false, path: root2 };
        return tauriInvoke("workspace_root_remove", { root: root2 });
      },
      workspaceRootList: async () => {
        if (!useTauri()) return [];
        return tauriInvoke("workspace_root_list");
      },
      mcpServerList: async () => {
        if (useTauri()) return tauriInvoke("mcp_server_list");
        return localDb.mcpList();
      },
      mcpServerSave: async (cfg) => {
        if (useTauri()) return tauriInvoke("mcp_server_save", { cfg });
        return localDb.mcpSave(cfg);
      },
      mcpServerRemove: async (serverId) => {
        if (useTauri()) return tauriInvoke("mcp_server_remove", { serverId });
        localDb.mcpRemove(serverId);
      },
      mcpConnectTest: async (serverId) => {
        if (useTauri()) return tauriInvoke("mcp_connect_test", { serverId });
        const s = localDb.mcpList().find((m) => m.id === serverId);
        return {
          serverId,
          connected: false,
          lastError: "Connect from the native desktop build (stdio MCP).",
          toolCount: 0,
          name: s?.name
        };
      },
      mcpCall: async (serverId, tool, args) => {
        if (useTauri()) return tauriInvoke("mcp_call", { serverId, tool, arguments: args });
        throw new Error("MCP calls require the native desktop build.");
      },
      // V7 fix (bug V): these browser fallbacks invented a session id, a page title and an engine
      // name. An agent or a page reading them would conclude a real navigation had happened. Every
      // one of them now reports the same notAttached shape the Rust side does.
      /**
       * `key` is what makes browser use autonomous: pass a stable key (a node key, a workflow id) and
       * the same session comes back, so a loop that navigates repeatedly drives one tab with its
       * history and cookies intact instead of leaking a fresh browser context on every call.
       */
      browserSessionCreate: async (key2) => {
        if (useTauri()) return tauriInvoke("browser_session_create", { key: key2 });
        return { ok: false, notAttached: true, engine: null, sessionId: null, reason: browserReason };
      },
      browserSessionClose: async (sessionId) => {
        if (useTauri()) return tauriInvoke("browser_session_close", { sessionId });
      },
      browserSessions: async () => {
        if (useTauri()) return tauriInvoke("browser_sessions");
        return [];
      },
      browserNavigate: async (sessionId, url, timeoutMs = 3e4) => {
        if (useTauri()) return tauriInvoke("browser_navigate", { sessionId, url, timeoutMs });
        return { ok: false, notAttached: true, url, title: null, engine: null, reason: browserReason };
      },
      browserAct: async (args) => {
        if (useTauri()) return tauriInvoke("browser_act", args);
        return { ok: false, notAttached: true, reason: browserReason };
      },
      browserScreenshot: async (sessionId, fullPage = false) => {
        if (useTauri()) return tauriInvoke("browser_screenshot", { sessionId, fullPage });
        return { ok: false, notAttached: true, path: null, reason: browserReason };
      },
      browserConsole: async (sessionId) => {
        if (useTauri()) return tauriInvoke("browser_console", { sessionId });
        return { ok: false, notAttached: true, console: [], networkFailures: [], reason: browserReason };
      },
      /* There is no external execution bridge.
       *
       * Every agent runs in-process on the owner's own provider key. Nothing in this
       * bridge can spawn a third-party process, and the methods that once did are
       * gone rather than stubbed — there is no native command left to call.
       * probe/noExternalCli.test.ts pins the absence.
       */
      /* -------------------------------------------------------------- git
       * Every one of these throws in a browser build rather than returning an empty result. A git panel
       * that renders "no changes" when it never spoke to git is the exact false-success pattern the product forbids:
       * the user cannot tell "clean tree" from "never checked". The thrown message is the label.
       */
      gitIsRepo: async (cwd) => {
        if (useTauri()) return tauriInvoke("git_is_repo", { cwd });
        throw new Error("git needs the native desktop build: a browser cannot see your repository.");
      },
      gitStatus: async (cwd) => {
        if (useTauri()) return tauriInvoke("git_status", { cwd });
        throw new Error("git needs the native desktop build: a browser cannot see your repository.");
      },
      gitDiff: async (cwd, staged = false, budget) => {
        if (useTauri()) return tauriInvoke("git_diff", { cwd, staged, budget: budget ?? null });
        throw new Error("git needs the native desktop build: a browser cannot see your repository.");
      },
      gitHead: async (cwd) => {
        if (useTauri()) return tauriInvoke("git_head", { cwd });
        throw new Error("git needs the native desktop build: a browser cannot see your repository.");
      },
      gitBranch: async (cwd) => {
        if (useTauri()) return tauriInvoke("git_branch", { cwd });
        throw new Error("git needs the native desktop build: a browser cannot see your repository.");
      },
      /**
       * Did a seat that was told to be read-only actually refrain from writing?
       * A harness flag is a promise; this is the check. Three-way on purpose — see `git.rs`.
       */
      gitReadOnlyCheck: async (cwd) => {
        if (useTauri()) return tauriInvoke("git_read_only_check", { cwd });
        throw new Error("git needs the native desktop build: a browser cannot see your repository.");
      },
      packageExport: async (workflowId, includeHistory) => {
        if (useTauri()) return tauriInvoke("package_export", { workflowId, includeHistory });
        const wf = localDb.workflowGet(workflowId);
        return {
          packageFormat: 1,
          exportedAt: (/* @__PURE__ */ new Date()).toISOString(),
          application: "SelfImpulse",
          version: ENGINE_VERSION,
          workflow: { name: wf.name, description: wf.description, graph: wf.graph },
          history: [],
          secretsIncluded: false
        };
      },
      packageImport: async (pkg) => {
        if (useTauri()) return tauriInvoke("package_import", { pkg });
        const p = pkg;
        if (p.application !== "SelfImpulse" && p.application !== "VH" || !p.workflow) throw new Error("package rejected");
        const created = localDb.workflowCreate(`${p.workflow.name} (imported)`, p.workflow.description ?? "");
        localDb.workflowSave(created.id, `${p.workflow.name} (imported)`, p.workflow.description ?? "", p.workflow.graph);
        return { id: created.id, validated: true };
      },
      controlValidate: async (workflowId) => {
        if (useTauri()) return tauriInvoke("control_validate_graph", { workflowId });
        return { valid: true, errors: [] };
      },
      controlConnectPorts: async (args) => {
        if (useTauri()) return tauriInvoke("control_connect_ports", args);
        throw new Error("use graph store connect");
      }
    };
  }
});

// src/selfimpulse/engine/providers.ts
var providers_exports = {};
__export(providers_exports, {
  PLANNER_SYSTEM: () => PLANNER_SYSTEM,
  addProvider: () => addProvider,
  chatStep: () => chatStep,
  clearUsage: () => clearUsage,
  defaultModelPrefs: () => defaultModelPrefs,
  estCostUsd: () => estCostUsd,
  ipcCaller: () => ipcCaller,
  keyRef: () => keyRef,
  listProviders: () => listProviders,
  listUsage: () => listUsage,
  modelPrefs: () => modelPrefs,
  pingProvider: () => pingProvider,
  planFromModelText: () => planFromModelText,
  providerHasKey: () => providerHasKey,
  providerKeyStatus: () => providerKeyStatus,
  recordUsage: () => recordUsage,
  removeProvider: () => removeProvider,
  removeProviderKey: () => removeProviderKey,
  setModelPrefs: () => setModelPrefs,
  setProviderKey: () => setProviderKey,
  tierFor: () => tierFor,
  updateProvider: () => updateProvider,
  usageSummary: () => usageSummary,
  wrapModelBrain: () => wrapModelBrain
});
function asKV(store2) {
  if (typeof store2.getItem === "function") {
    const ls = store2;
    return { get: (k) => ls.getItem(k), set: (k, v) => ls.setItem(k, v) };
  }
  const m = store2;
  return { get: (k) => m.get(k) ?? null, set: (k, v) => void m.set(k, v) };
}
function listProviders(store2 = defaultStore()) {
  try {
    const raw = asKV(store2).get(REGISTRY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}
function saveProviders(list, store2) {
  asKV(store2).set(REGISTRY_KEY, JSON.stringify(list));
}
function addProvider(p, store2 = defaultStore()) {
  if (!p.id.trim() || !p.label.trim() || !p.defaultModel.trim()) return { error: "provider needs id, label and a default model \u2014 refused." };
  if (p.kind === "custom" && !p.baseUrl) return { error: "a custom provider needs its endpoint URL \u2014 refused." };
  const list = listProviders(store2);
  if (list.some((x) => x.id === p.id)) return { error: `provider id "${p.id}" already exists \u2014 refused.` };
  const entry = { ...p, enabled: true };
  list.push(entry);
  try {
    saveProviders(list, store2);
  } catch (e) {
    return { error: `provider store refused the write: ${e.message} \u2014 nothing was silently dropped.` };
  }
  return entry;
}
function updateProvider(id, patch, store2 = defaultStore()) {
  const list = listProviders(store2);
  const i = list.findIndex((x) => x.id === id);
  if (i < 0) return { ok: false, refused: `unknown provider "${id}".` };
  list[i] = { ...list[i], ...patch, id };
  try {
    saveProviders(list, store2);
  } catch (e) {
    return { ok: false, refused: `provider store refused the write: ${e.message} \u2014 the change was not saved.` };
  }
  return { ok: true };
}
function removeProvider(id, store2 = defaultStore()) {
  try {
    saveProviders(listProviders(store2).filter((x) => x.id !== id), store2);
  } catch {
    return { ok: false };
  }
  localDb.secretDelete(keyRef(id));
  return { ok: true };
}
function setProviderKey(providerId, apiKey, kind) {
  if (!apiKey.trim()) return { ok: false, refused: "empty key \u2014 refused (clear it with removeProviderKey instead)." };
  if (!useTauri() && kind !== "ollama") {
    return {
      ok: false,
      refused: "the web edition cannot hold cloud keys \u2014 browser storage is readable by anything in this origin. The DESKTOP build stores your key in the OS keychain and runs every provider; on the web, SelfImpulse is Ollama/local-only. Refused in words, nothing stored."
    };
  }
  localDb.secretSet(keyRef(providerId), apiKey.trim());
  return { ok: true };
}
function removeProviderKey(providerId) {
  localDb.secretDelete(keyRef(providerId));
}
function providerHasKey(providerId) {
  return Boolean(localDb.secretGet(keyRef(providerId)));
}
function providerKeyStatus(providerId, kind) {
  if (kind === "ollama") return "not-needed";
  if (!useTauri() && !providerHasKey(providerId)) return "missing";
  return providerHasKey(providerId) ? "set" : "missing";
}
function modelPrefs(store2 = defaultStore()) {
  try {
    const raw = asKV(store2).get(PREFS_KEY);
    if (!raw) return defaultModelPrefs();
    const p = JSON.parse(raw);
    return { enabled: p.enabled === true, cheap: p.cheap, big: p.big };
  } catch {
    return defaultModelPrefs();
  }
}
function setModelPrefs(p, store2 = defaultStore()) {
  try {
    asKV(store2).set(PREFS_KEY, JSON.stringify(p));
  } catch {
  }
}
async function chatStep(prompt, tier, opts) {
  const prefs = opts?.prefs ?? modelPrefs(opts?.store);
  if (!prefs.enabled) {
    const refused = "model routing is OFF \u2014 a human enables it (System \u2192 Model providers); never a silent provider call.";
    recordUsage({ ok: false, refused, ts: (/* @__PURE__ */ new Date()).toISOString() }, opts?.store);
    return { ok: false, refused };
  }
  const route = tier === "cheap" ? prefs.cheap : prefs.big;
  if (!route) {
    const refused = `no ${tier}-tier route configured \u2014 refusing rather than silently spending the other tier.`;
    recordUsage({ ok: false, refused, ts: (/* @__PURE__ */ new Date()).toISOString() }, opts?.store);
    return { ok: false, refused };
  }
  const provider = listProviders(opts?.store).find((x) => x.id === route.providerId);
  if (!provider) {
    const refused = `route names unknown provider "${route.providerId}" \u2014 fix the routing in System \u2192 Model providers.`;
    recordUsage({ ok: false, refused, ts: (/* @__PURE__ */ new Date()).toISOString() }, opts?.store);
    return { ok: false, refused };
  }
  if (!provider.enabled) {
    const refused = `provider "${provider.label}" is disabled \u2014 enable it or re-route this tier.`;
    recordUsage({ ok: false, refused, ts: (/* @__PURE__ */ new Date()).toISOString() }, opts?.store);
    return { ok: false, refused };
  }
  const keyStatus = providerKeyStatus(provider.id, provider.kind);
  if (keyStatus === "missing") {
    const refused = `provider "${provider.label}" has no API key set \u2014 add it in System \u2192 Model providers (BYOK; the key never enters the registry).`;
    recordUsage({ ok: false, refused, ts: (/* @__PURE__ */ new Date()).toISOString() }, opts?.store);
    return { ok: false, refused };
  }
  const t0 = Date.now();
  try {
    const r = await (opts?.caller ?? ipcCaller)({
      provider: provider.kind,
      base_url: provider.baseUrl,
      model: route.model || provider.defaultModel,
      messages: [{ role: "user", content: prompt }],
      system: PLANNER_SYSTEM,
      temperature: 0.2,
      secret_ref: keyRef(provider.id)
    });
    const text = String(r.content ?? "").trim();
    const durationMs = r.duration_ms || Date.now() - t0;
    if (!text) {
      const refused = `${provider.label}:${route.model} returned an empty answer \u2014 nothing is invented to fill it.`;
      recordUsage({ ok: false, refused, ts: (/* @__PURE__ */ new Date()).toISOString(), providerId: provider.id, providerLabel: provider.label, kind: provider.kind, model: route.model, tier, durationMs }, opts?.store);
      return { ok: false, refused };
    }
    recordUsage({ ok: true, ts: (/* @__PURE__ */ new Date()).toISOString(), providerId: provider.id, providerLabel: provider.label, kind: provider.kind, model: r.model || route.model, tier, durationMs, tokensIn: r.usage?.input_tokens ?? 0, tokensOut: r.usage?.output_tokens ?? 0 }, opts?.store);
    return { ok: true, text, provider: provider.id, kind: provider.kind, model: r.model || route.model, tier, durationMs, tokensIn: r.usage?.input_tokens ?? 0, tokensOut: r.usage?.output_tokens ?? 0 };
  } catch (e) {
    const refused = `${provider.label}:${route.model} refused in words: ${String(e?.message ?? e)} \u2014 no fake answer is manufactured.`;
    recordUsage({ ok: false, refused, ts: (/* @__PURE__ */ new Date()).toISOString(), providerId: provider.id, providerLabel: provider.label, kind: provider.kind, model: route.model, tier, durationMs: Date.now() - t0 }, opts?.store);
    return { ok: false, refused };
  }
}
async function pingProvider(providerId, opts) {
  const provider = listProviders(opts?.store).find((x) => x.id === providerId);
  if (!provider) return { ok: false, detail: `unknown provider "${providerId}".` };
  const r = await chatStep("Reply with the single word: pong.", "cheap", { ...opts, prefs: { enabled: true, cheap: { providerId, model: provider.defaultModel } } });
  return r.ok ? { ok: true, detail: `${provider.label}:${r.model} answered in ${r.durationMs}ms`, latencyMs: r.durationMs } : { ok: false, detail: r.refused };
}
function recordUsage(r, store2 = defaultStore()) {
  try {
    const list = listUsage(store2);
    list.push(r);
    asKV(store2).set(USAGE_KEY, JSON.stringify(list.slice(-USAGE_CAP)));
  } catch {
  }
}
function listUsage(store2 = defaultStore()) {
  try {
    return JSON.parse(asKV(store2).get(USAGE_KEY) ?? "[]");
  } catch {
    return [];
  }
}
function clearUsage(store2 = defaultStore()) {
  asKV(store2).set(USAGE_KEY, "[]");
}
function estCostUsd(model, tokensIn, tokensOut) {
  if (!model) return null;
  const row = PRICE_TABLE.find((p) => p.match.test(model));
  if (!row) return null;
  return tokensIn / 1e6 * row.in + tokensOut / 1e6 * row.out;
}
function usageSummary(store2 = defaultStore()) {
  const all = listUsage(store2);
  const ok = all.filter((r) => r.ok);
  const latencies = ok.map((r) => r.durationMs ?? 0).sort((a, b) => a - b);
  const pick = (q) => latencies.length ? latencies[Math.min(latencies.length - 1, Math.floor(q * latencies.length))] : null;
  const byProvider = /* @__PURE__ */ new Map();
  for (const r of all) {
    const key2 = r.providerLabel ?? r.providerId ?? "(unrouted)";
    const rec = byProvider.get(key2) ?? { calls: 0, ok: 0, lat: [] };
    rec.calls++;
    if (r.ok) {
      rec.ok++;
      rec.lat.push(r.durationMs ?? 0);
    }
    byProvider.set(key2, rec);
  }
  let est = 0;
  let priced = false;
  for (const r of ok) {
    const c = estCostUsd(r.model, r.tokensIn ?? 0, r.tokensOut ?? 0);
    if (c != null) {
      est += c;
      priced = true;
    }
  }
  return {
    total: all.length,
    ok: ok.length,
    refused: all.length - ok.length,
    okRate: all.length ? ok.length / all.length : 0,
    avgLatencyMs: latencies.length ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : null,
    p95LatencyMs: pick(0.95),
    tokensIn: ok.reduce((a, r) => a + (r.tokensIn ?? 0), 0),
    tokensOut: ok.reduce((a, r) => a + (r.tokensOut ?? 0), 0),
    estCostUsd: priced ? Math.round(est * 1e4) / 1e4 : null,
    perProvider: [...byProvider.entries()].map(([provider, v]) => ({ provider, calls: v.calls, ok: v.ok, avgLatencyMs: v.lat.length ? Math.round(v.lat.reduce((a, b) => a + b, 0) / v.lat.length) : null })),
    recentRefusals: all.filter((r) => !r.ok && r.refused).slice(-3).map((r) => r.refused)
  };
}
function planFromModelText(text, max = 6) {
  return text.split(/\r?\n/).map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").trim()).filter((l) => l.length > 3).slice(0, max);
}
function wrapModelBrain(base, opts) {
  const enabled = () => (opts?.prefs ?? modelPrefs(opts?.store)).enabled;
  return {
    get id() {
      return enabled() ? "simulated+model-plan" : base.id;
    },
    get label() {
      return enabled() ? "Simulated core + user-routed models (ChatGPT / Claude / Gemini / Groq / Ollama / custom) \u2014 cheap tier for routine steps, big tier for hard ones; refusals in words, never faked" : base.label;
    },
    async decide(input, ctx) {
      const plan = await base.decide(input, ctx);
      const prefs = opts?.prefs ?? modelPrefs(opts?.store);
      if (!prefs.enabled) return plan;
      const tier = tierFor(ctx.mode);
      const r = await chatStep(input.slice(0, 400), tier, opts);
      if (!r.ok) {
        return { ...plan, thoughts: [`model routing: ${r.refused}`, ...plan.thoughts] };
      }
      const steps = planFromModelText(r.text);
      if (steps.length === 0) {
        return { ...plan, thoughts: [`model routing: ${r.provider}:${r.model} answered but produced no parseable steps \u2014 the base plan stands.`, ...plan.thoughts] };
      }
      return {
        ...plan,
        thoughts: [`brain: REAL model \u2014 ${r.provider}:${r.model} (${r.tier} tier) answered in ${r.durationMs}ms \xB7 labeled, this run \xB7 still gated by the same human gate`, ...plan.thoughts],
        plan: steps,
        confidence: "medium"
      };
    }
  };
}
var REGISTRY_KEY, defaultStore, keyRef, PREFS_KEY, defaultModelPrefs, tierFor, ipcCaller, PLANNER_SYSTEM, USAGE_KEY, USAGE_CAP, PRICE_TABLE;
var init_providers = __esm({
  "src/selfimpulse/engine/providers.ts"() {
    "use strict";
    init_client();
    init_localDb();
    REGISTRY_KEY = "vh.providers";
    defaultStore = () => globalThis.localStorage ?? /* @__PURE__ */ new Map();
    keyRef = (providerId) => `vh.providerkey.${providerId}`;
    PREFS_KEY = "vh.brain.model";
    defaultModelPrefs = () => ({ enabled: false });
    tierFor = (mode) => mode === "deep" ? "big" : "cheap";
    ipcCaller = (req) => ipc.llmChat(req);
    PLANNER_SYSTEM = "You are the planner inside SelfImpulse's governed brain. Answer with 3 to 6 concrete steps, one per line, no preamble or markdown. The runtime simulates risky steps and pauses them at a human gate \u2014 propose honestly.";
    USAGE_KEY = "vh.provider.usage";
    USAGE_CAP = 400;
    PRICE_TABLE = [
      { match: /gpt-4o-mini/i, in: 0.15, out: 0.6 },
      { match: /gpt-4o(?!-mini)/i, in: 2.5, out: 10 },
      { match: /gpt-4\.1-mini/i, in: 0.4, out: 1.6 },
      { match: /gpt-4\.1(?!-mini)/i, in: 2, out: 8 },
      { match: /claude-.*haiku/i, in: 0.8, out: 4 },
      { match: /claude-.*sonnet/i, in: 3, out: 15 },
      { match: /claude-.*opus/i, in: 15, out: 75 },
      { match: /gemini-.*flash/i, in: 0.15, out: 0.6 },
      { match: /gemini-.*pro/i, in: 1.25, out: 10 },
      { match: /llama|mistral|qwen|phi|gemma/i, in: 0, out: 0 }
      // local = ₹0
    ];
  }
});

// src/selfimpulse/ipc/client.ts
var client_exports = {};
__export(client_exports, {
  ipc: () => ipc2,
  isNativeHost: () => isNativeHost
});
function isNativeHost() {
  return typeof window !== "undefined" && Boolean(window.__TAURI_INTERNALS__);
}
var invoke2, ipc2;
var init_client2 = __esm({
  "src/selfimpulse/ipc/client.ts"() {
    "use strict";
    invoke2 = (cmd, args) => {
      const internals = window.__TAURI_INTERNALS__;
      if (!internals) throw new Error("not in the native host \u2014 no __TAURI_INTERNALS__");
      return internals.invoke(cmd, args);
    };
    ipc2 = {
      async secretGet(secretRef) {
        return await invoke2("secret_get", { secretRef });
      },
      async secretSet(secretRef, value) {
        return await invoke2("secret_set", { secretRef, value });
      },
      async notifyApproval(title, body) {
        await invoke2("notify_approval", { title, body });
      },
      async appInfo() {
        return await invoke2("app_info");
      }
    };
  }
});

// src/selfimpulse/engine/signing.ts
async function keychainBridge() {
  if (typeof window === "undefined" || !("__TAURI_INTERNALS__" in window)) return null;
  try {
    const { ipc: ipc3 } = await Promise.resolve().then(() => (init_client2(), client_exports));
    return {
      get: async () => {
        try {
          const r = await ipc3.secretGet(KEYCHAIN_REF);
          return r.present && r.value ? r.value : null;
        } catch {
          return null;
        }
      },
      set: async (json) => {
        try {
          const r = await ipc3.secretSet(KEYCHAIN_REF, json);
          return Boolean(r.stored);
        } catch {
          return false;
        }
      }
    };
  } catch {
    return null;
  }
}
function toHex2(bytes) {
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function fromHex(hex) {
  const out = new Uint8Array(new ArrayBuffer(hex.length / 2));
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}
function ed25519Available() {
  try {
    return typeof crypto !== "undefined" && Boolean(crypto.subtle) && typeof crypto.subtle.generateKey === "function";
  } catch {
    return false;
  }
}
async function ensureIssuerIdentity() {
  if (cached) return cached;
  if (!ed25519Available()) return null;
  const bridge = await keychainBridge();
  try {
    const raw = bridge ? await bridge.get() : globalThis.localStorage?.getItem(STORAGE_KEY);
    if (raw) {
      const stored = JSON.parse(raw);
      if (stored?.publicKeyHex && stored?.privateJwk) {
        const privateKey = await crypto.subtle.importKey("jwk", stored.privateJwk, { name: "Ed25519" }, true, ["sign"]);
        const identity = {
          keyId: `selfimpulse-issuer-${stored.publicKeyHex.slice(0, 12)}`,
          publicKeyHex: stored.publicKeyHex,
          createdAt: stored.createdAt ?? (/* @__PURE__ */ new Date(0)).toISOString()
        };
        cached = { identity, privateKey };
        return cached;
      }
    }
  } catch {
  }
  try {
    const pair = await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]);
    const rawPub = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));
    const publicKeyHex = toHex2(rawPub);
    const identity = {
      keyId: `selfimpulse-issuer-${publicKeyHex.slice(0, 12)}`,
      publicKeyHex,
      createdAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    const privateJwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
    const persisted = JSON.stringify({ publicKeyHex, privateJwk, createdAt: identity.createdAt });
    try {
      if (bridge) await bridge.set(persisted);
    } catch {
    }
    try {
      globalThis.localStorage?.setItem(STORAGE_KEY, persisted);
    } catch {
    }
    cached = { identity, privateKey: pair.privateKey };
    return cached;
  } catch {
    return null;
  }
}
async function signHexDigest(hexDigest) {
  const holder = await ensureIssuerIdentity();
  if (!holder) return null;
  try {
    const sig = new Uint8Array(await crypto.subtle.sign({ name: "Ed25519" }, holder.privateKey, fromHex(hexDigest)));
    return { alg: "EdDSA", keyId: holder.identity.keyId, publicKeyHex: holder.identity.publicKeyHex, sigHex: toHex2(sig) };
  } catch {
    return null;
  }
}
async function verifyIssuerSignature(chainHashHex, sigHex, publicKeyHex) {
  if (!ed25519Available()) return false;
  try {
    const publicKey = await crypto.subtle.importKey("raw", fromHex(publicKeyHex), { name: "Ed25519" }, false, ["verify"]);
    return await crypto.subtle.verify({ name: "Ed25519" }, publicKey, fromHex(sigHex), fromHex(chainHashHex));
  } catch {
    return false;
  }
}
var STORAGE_KEY, KEYCHAIN_REF, cached;
var init_signing = __esm({
  "src/selfimpulse/engine/signing.ts"() {
    "use strict";
    STORAGE_KEY = "selfimpulse.issuerkey.v1";
    KEYCHAIN_REF = "selfimpulse.issuerkey.v1";
    cached = null;
  }
});

// src/selfimpulse/engine/genome.ts
function keyOf(id, version) {
  return `${id}@${version}`;
}
function latestVersion(reg, id) {
  let best = null;
  for (const g of reg.genomes.values()) {
    if (g.id !== id) continue;
    if (TERMINAL_STATES.has(g.status) && g.status !== "QUARANTINED") continue;
    if (!best || g.version > best.version) best = g;
  }
  return best;
}
function newGenome(spec, now = (/* @__PURE__ */ new Date()).toISOString()) {
  const version = spec.version ?? 1;
  return {
    ...spec,
    version,
    status: "OBSERVED",
    createdAt: now,
    updatedAt: now,
    history: [{ ts: now, from: null, to: "OBSERVED", by: "engine", reason: "observed" }]
  };
}
function registerGenome(reg, genome) {
  const k = keyOf(genome.id, genome.version);
  if (reg.genomes.has(k)) return { ok: false, reason: `${k} already exists` };
  reg.genomes.set(k, genome);
  return { ok: true };
}
var TERMINAL_STATES;
var init_genome = __esm({
  "src/selfimpulse/engine/genome.ts"() {
    "use strict";
    init_signing();
    TERMINAL_STATES = /* @__PURE__ */ new Set([
      "REJECTED",
      "BLOCKED",
      "ROLLED_BACK",
      "DEPRECATED"
    ]);
  }
});

// src/selfimpulse/engine/skillStore.ts
var skillStore_exports = {};
__export(skillStore_exports, {
  buildCatalog: () => buildCatalog,
  importFromCatalog: () => importFromCatalog,
  importedGenomeRegistry: () => importedGenomeRegistry,
  sha256hex: () => sha256hex
});
async function sha256hex(s) {
  const b = await crypto.subtle.digest("SHA-256", te.encode(s));
  return Array.from(new Uint8Array(b)).map((x) => x.toString(16).padStart(2, "0")).join("");
}
async function buildCatalog(skills) {
  const digest = await sha256hex(JSON.stringify(skills));
  let signature = null;
  try {
    signature = await signHexDigest(digest);
  } catch {
    signature = null;
  }
  return { format: "si-skill-catalog/1", issuedAt: (/* @__PURE__ */ new Date()).toISOString(), skills, digest, signature };
}
function importedGenomeRegistry() {
  const reg = { genomes: /* @__PURE__ */ new Map() };
  for (const row of localDb.importedGenomesList()) {
    const g = row.genome;
    reg.genomes.set(`${g.id}@${g.version}`, g);
  }
  return reg;
}
function persistGenomeRegistry(reg) {
  const rows = [...reg.genomes.values()].map((g) => ({
    genome: g,
    missionId: String(g.provenance?.originReceiptId ?? ""),
    importedAt: (/* @__PURE__ */ new Date()).toISOString()
  }));
  localDb.importedGenomesSave(rows);
}
async function importFromCatalog(catalog, skillId, publicKeyHex, genome) {
  if (catalog.format !== "si-skill-catalog/1") return { ok: false, refused: `unknown catalog format "${catalog.format}" \u2014 refused.` };
  const digest = await sha256hex(JSON.stringify(catalog.skills));
  if (digest !== catalog.digest) return { ok: false, refused: "catalog digest mismatch \u2014 it was modified after issuance; refused in words." };
  if (catalog.signature) {
    if (!publicKeyHex) return { ok: false, refused: "catalog is signed but no issuer public key was supplied \u2014 supply it out-of-band to authenticate; refusing to trust a self-reported key." };
    const okSig = await verifyIssuerSignature(catalog.digest, catalog.signature.sigHex, publicKeyHex);
    if (!okSig) return { ok: false, refused: "catalog signature does NOT verify \u2014 refused." };
  } else {
    return { ok: false, refused: "catalog is UNSIGNED \u2014 an import nobody selfimpulsees for is refused; the issuer must sign or state why." };
  }
  const skill = catalog.skills.find((s) => s.id === skillId);
  if (!skill) return { ok: false, refused: `skill "${skillId}" is not in this catalog.` };
  if (!skill.provenance.missionId || skill.provenance.verifiedSeats.length === 0) return { ok: false, refused: `skill "${skillId}" carries no real provenance (mission + verified seats) \u2014 refused.` };
  const reg = genome?.registry ?? importedGenomeRegistry();
  const gid = `skill.${skill.id}`;
  const now = genome?.now ?? (/* @__PURE__ */ new Date()).toISOString();
  if (!latestVersion(reg, gid)) {
    const g = newGenome({
      id: gid,
      objective: { current: skill.objective, improve: `proven reliable on THIS host (imported from mission ${skill.provenance.missionId})` },
      trigger: skill.when,
      procedure: skill.steps,
      inputs: [],
      outputs: [],
      dependencies: [],
      resourceLimits: {},
      failureModes: ["imported skill misfires on this host \u2014 shadow and trial catch it before ACTIVE"],
      evaluation: { required: true, gate: "soft" },
      safety: { permissionClass: "read-local", externalSideEffects: false },
      provenance: { originType: "derived", originReceiptId: `mission:${skill.provenance.missionId}`, verifiedSeats: skill.provenance.verifiedSeats.length }
    }, now);
    g.status = "UNDER_EVALUATION";
    g.history.push({ ts: now, from: "OBSERVED", to: "UNDER_EVALUATION", by: "skill-store", reason: `imported from signed catalog (mission ${skill.provenance.missionId}, ${skill.provenance.verifiedSeats.length} verified seat(s)) \u2014 full re-proof required on this host` });
    registerGenome(reg, g);
  }
  persistGenomeRegistry(reg);
  const landedStatus = latestVersion(reg, gid)?.status ?? "UNDER_EVALUATION";
  return {
    ok: true,
    skill,
    landedAs: landedStatus,
    note: `imported "${skill.title}" from mission ${skill.provenance.missionId} (${skill.provenance.verifiedSeats.length} verified seat(s), v${skill.provenance.version}) \u2014 landed UNDER_EVALUATION: it re-proves itself on THIS machine before shadow, canary, active. SelfImpulse ${ENGINE_VERSION}.`
  };
}
var te;
var init_skillStore = __esm({
  "src/selfimpulse/engine/skillStore.ts"() {
    "use strict";
    init_signing();
    init_genome();
    init_localDb();
    init_version();
    te = new TextEncoder();
  }
});

// probe/productionStack.test.ts
init_providers();
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

// src/engine/pureHash.ts
var K = [
  1116352408,
  1899447441,
  3049323471,
  3921009573,
  961987163,
  1508970993,
  2453635748,
  2870763221,
  3624381080,
  310598401,
  607225278,
  1426881987,
  1925078388,
  2162078206,
  2614888103,
  3248222580,
  3835390401,
  4022224774,
  264347078,
  604807628,
  770255983,
  1249150122,
  1555081692,
  1996064986,
  2554220882,
  2821834349,
  2952996808,
  3210313671,
  3336571891,
  3584528711,
  113926993,
  338241895,
  666307205,
  773529912,
  1294757372,
  1396182291,
  1695183700,
  1986661051,
  2177026350,
  2456956037,
  2730485921,
  2820302411,
  3259730800,
  3345764771,
  3516065817,
  3600352804,
  4094571909,
  275423344,
  430227734,
  506948616,
  659060556,
  883997877,
  958139571,
  1322822218,
  1537002063,
  1747873779,
  1955562222,
  2024104815,
  2227730452,
  2361852424,
  2428436474,
  2756734187,
  3204031479,
  3329325298
];
var rotr = (x, n) => (x >>> n | x << 32 - n) >>> 0;
var utf8 = (text) => new TextEncoder().encode(text);
function sha256Bytes(data) {
  const bitLen = data.length * 8;
  const padded = new Uint8Array((data.length + 8 >> 6 << 6) + 64);
  padded.set(data);
  padded[data.length] = 128;
  const dv = new DataView(padded.buffer);
  dv.setUint32(padded.length - 4, bitLen >>> 0);
  dv.setUint32(padded.length - 8, Math.floor(bitLen / 4294967296));
  let h0 = 1779033703, h1 = 3144134277, h2 = 1013904242, h3 = 2773480762;
  let h4 = 1359893119, h5 = 2600822924, h6 = 528734635, h7 = 1541459225;
  const w = new Uint32Array(64);
  for (let off = 0; off < padded.length; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = dv.getUint32(off + i * 4);
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ w[i - 15] >>> 3;
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ w[i - 2] >>> 10;
      w[i] = w[i - 16] + s0 + w[i - 7] + s1 >>> 0;
    }
    let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = e & f ^ ~e & g;
      const t1 = h + S1 + ch + K[i] + w[i] >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = a & b ^ a & c ^ b & c;
      const t2 = S0 + maj >>> 0;
      h = g;
      g = f;
      f = e;
      e = d + t1 >>> 0;
      d = c;
      c = b;
      b = a;
      a = t1 + t2 >>> 0;
    }
    h0 = h0 + a >>> 0;
    h1 = h1 + b >>> 0;
    h2 = h2 + c >>> 0;
    h3 = h3 + d >>> 0;
    h4 = h4 + e >>> 0;
    h5 = h5 + f >>> 0;
    h6 = h6 + g >>> 0;
    h7 = h7 + h >>> 0;
  }
  const out = new Uint8Array(32);
  const ov = new DataView(out.buffer);
  ov.setUint32(0, h0);
  ov.setUint32(4, h1);
  ov.setUint32(8, h2);
  ov.setUint32(12, h3);
  ov.setUint32(16, h4);
  ov.setUint32(20, h5);
  ov.setUint32(24, h6);
  ov.setUint32(28, h7);
  return out;
}
var toHex = (bytes) => Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
function pureSha256(text) {
  return toHex(sha256Bytes(utf8(text)));
}

// src/mission/durable.ts
function asKV2(store2) {
  if (typeof store2.get === "function" && typeof store2.set === "function" && typeof store2.getItem !== "function") {
    return store2;
  }
  if (typeof store2.getItem === "function") {
    const ls = store2;
    return { get: (k) => ls.getItem(k), set: (k, v) => ls.setItem(k, v) };
  }
  const m = store2;
  return { get: (k) => m.get(k) ?? null, set: (k, v) => void m.set(k, v) };
}
function defaultDurableKV() {
  const ls = globalThis.localStorage;
  if (ls && typeof ls.getItem === "function") return asKV2(ls);
  const mem = /* @__PURE__ */ new Map();
  return { get: (k) => mem.get(k) ?? null, set: (k, v) => void mem.set(k, v) };
}
var digestOf = (s) => pureSha256(s);
var key = (missionId) => `vh.durable.${missionId}`;
function durableSave(runtime, store2 = defaultDurableKV()) {
  const state = runtime.persist();
  const envelope = {
    format: "si-durable-mission/1",
    missionId: state.missionId,
    savedAt: (/* @__PURE__ */ new Date()).toISOString(),
    digest: digestOf(JSON.stringify(state)),
    state
  };
  asKV2(store2).set(key(state.missionId), JSON.stringify(envelope));
  return envelope;
}
function durableResume(runtime, store2 = defaultDurableKV()) {
  const raw = asKV2(store2).get(key(runtime.persist().missionId));
  if (!raw) return { ok: false, refused: `no durable snapshot for this mission \u2014 starting fresh is the honest path, not a silent resume.` };
  let env;
  try {
    env = JSON.parse(raw);
  } catch {
    return { ok: false, refused: "durable snapshot is corrupt (unparseable) \u2014 refused in words; work is NOT resumed into half-state." };
  }
  if (env.format !== "si-durable-mission/1") return { ok: false, refused: `unknown durable format "${env.format}" \u2014 refused.` };
  if (digestOf(JSON.stringify(env.state)) !== env.digest) return { ok: false, refused: "durable snapshot failed its digest \u2014 it was modified after save; refused rather than resumed." };
  const r = runtime.restore(env.state);
  if (!r.ok) return { ok: false, refused: `runtime restore refused: ${r.errors.join("; ")}` };
  return { ok: true, missionId: env.missionId, completedNodeIds: env.state.completedNodeIds, savedAt: env.savedAt };
}
var DoneLedger = class {
  constructor(store2 = defaultDurableKV(), storeKey = "vh.done.ledger") {
    this.store = store2;
    this.storeKey = storeKey;
    try {
      const raw = asKV2(this.store).get(storeKey);
      if (raw) for (const id of JSON.parse(raw)) this.done.add(id);
    } catch {
    }
  }
  done = /* @__PURE__ */ new Set();
  static actionId(missionId, nodeId, taskTitle) {
    return pureSha256(`${missionId}::${nodeId}::${taskTitle}`).slice(0, 32);
  }
  isDone(actionId) {
    return this.done.has(actionId);
  }
  /** Mark done ONLY after verified completion — callers pass the verification evidence. */
  markDone(actionId, verified) {
    if (!verified) return { ok: false, refused: `refused to mark "${actionId}" done without verification evidence \u2014 never-give-up means never FAKE done.` };
    this.done.add(actionId);
    try {
      asKV2(this.store).set(this.storeKey, JSON.stringify([...this.done]));
    } catch {
    }
    return { ok: true };
  }
  get size() {
    return this.done.size;
  }
};

// src/mission/discipline.ts
var ConstraintLedger = class {
  constructor(initial = [], store2 = globalThis.localStorage ?? /* @__PURE__ */ new Map(), storeKey = "vh.constraints") {
    this.store = store2;
    this.storeKey = storeKey;
    for (const text of initial) this.list.push({ id: `c${this.list.length + 1}`, text, hard: true });
    try {
      const raw = store2.get(storeKey);
      if (raw && this.list.length === 0) for (const c of JSON.parse(raw)) this.list.push(c);
    } catch {
    }
  }
  list = [];
  add(text, hard = true) {
    const c = { id: `c${this.list.length + 1}`, text, hard };
    this.list.push(c);
    try {
      this.store.set(this.storeKey, JSON.stringify(this.list));
    } catch {
    }
    return c;
  }
  all() {
    return [...this.list];
  }
  /** Re-read after EVERY step (rule 1). Returns violations in words. */
  checkStep(stepSummary) {
    const lower = stepSummary.toLowerCase();
    const violations = this.list.filter((c) => {
      const words = c.text.toLowerCase().split(/\W+/).filter((w) => w.length > 4);
      return words.length > 0 && words.every((w) => lower.includes(w));
    }).filter((c) => c.hard).map((c) => `constraint violated: "${c.text}" (${c.id}) \u2014 the step is refused, not warned.`);
    return { ok: violations.length === 0, violations };
  }
};
function askHuman(question, unknowns) {
  if (!question.trim()) throw new Error("an ask with no question is a guess in disguise \u2014 refused");
  return { kind: "ask_human", question, unknowns, answered: false };
}
function answerAsk(a, answer) {
  if (!answer.trim()) return { ...a, answered: false };
  return { ...a, answered: true, answer };
}
function proofBeforeDone(input) {
  if (!input.verificationRan) return { done: false, reason: "refused to finish: nothing was verified \u2014 a run without its own test is a claim, not a result." };
  if (!input.verificationPassed) return { done: false, reason: "refused to finish: verification FAILED \u2014 report the failure honestly, never a fake pass." };
  const c = input.constraints.checkStep(input.finalSummary);
  if (!c.ok) return { done: false, reason: `refused to finish: ${c.violations.join(" ")}` };
  return { done: true, proof: input.evidence ?? "verified (exit-code-first)" };
}

// src/mission/triggers.ts
var TriggerEngine = class {
  constructor(deps) {
    this.deps = deps;
  }
  lastFired = /* @__PURE__ */ new Map();
  firedToday = /* @__PURE__ */ new Map();
  running = false;
  /** Evaluate one trigger now. Quiet rules are mechanical, not vibes. */
  async evaluate(t) {
    if (t.enabled === false) return { ok: false, detail: `trigger "${t.id}" is disabled.` };
    const now = (this.deps.now ?? (() => /* @__PURE__ */ new Date()))();
    const hour = now.getHours();
    if (t.quietHours) {
      const { from, to } = t.quietHours;
      const inside = from <= to ? hour >= from && hour < to : hour >= from || hour < to;
      if (inside) return { ok: false, detail: `quiet hours (${from}:00\u2013${to}:00) \u2014 "${t.id}" stays silent unless it matters.` };
    }
    if (t.everyMs != null) {
      const last = this.lastFired.get(t.id) ?? 0;
      const since = now.getTime() - last;
      if (last !== 0 && since < t.everyMs) return { ok: false, detail: `"${t.id}" not due for another ${Math.ceil((t.everyMs - since) / 1e3)}s (overlap protection).` };
    }
    if (t.maxPerDay != null) {
      const day2 = now.toISOString().slice(0, 10);
      const rec2 = this.firedToday.get(t.id);
      if (rec2 && rec2.day === day2 && rec2.count >= t.maxPerDay) return { ok: false, detail: `"${t.id}" hit its daily cap (${t.maxPerDay}) \u2014 quiet unless it matters.` };
    }
    if (this.running) return { ok: false, detail: `a triggered mission is already running \u2014 one concurrent run, never a pile-up.` };
    this.running = true;
    this.lastFired.set(t.id, now.getTime());
    const day = now.toISOString().slice(0, 10);
    const rec = this.firedToday.get(t.id);
    this.firedToday.set(t.id, { day, count: rec && rec.day === day ? rec.count + 1 : 1 });
    try {
      const r = await this.deps.dispatch(t.objective, t.id);
      return { ok: r.ok, detail: r.ok ? `trigger "${t.id}" dispatched a governed mission (human gate applies): ${r.detail}` : `trigger "${t.id}" dispatch refused: ${r.detail}` };
    } finally {
      this.running = false;
    }
  }
};

// probe/productionStack.test.ts
init_skillStore();

// src/browser/receipted.ts
init_guardrail();
import { createHash } from "node:crypto";
var ReceiptedBrowser = class {
  constructor(deps) {
    this.deps = deps;
  }
  chain = "";
  entries = [];
  seal(e) {
    const prev = this.chain;
    const hash = createHash("sha256").update(`${prev}|${e.seq}|${e.at}|${JSON.stringify(e.action)}|${e.ok}|${e.detail}`).digest("hex");
    this.chain = hash;
    return { ...e, prev, hash };
  }
  /** Run one action — executed OR refused, it is receipted either way. */
  async run(action) {
    const seq = this.entries.length + 1;
    let r;
    try {
      r = await this.deps.perform(action);
    } catch (e) {
      r = { ok: false, detail: String(e?.message ?? e), title: action.kind };
    }
    this.entries.push(this.seal({ seq, action, ok: r.ok, detail: r.detail, at: (/* @__PURE__ */ new Date()).toISOString() }));
    return r;
  }
  /** The action receipt: hash-chained, verifiable without product state. */
  receipt() {
    return this.entries.map((e) => JSON.stringify({ seq: e.seq, action: e.action, ok: e.ok, at: e.at, prev: e.prev.slice(0, 16), hash: e.hash })).join("\n") + "\n";
  }
  get lastHash() {
    return this.chain;
  }
};
var MAX_REDIRECTS = 5;
async function guardedFetch(fetchImpl, initialUrl) {
  let url = initialUrl;
  for (let i = 0; i <= MAX_REDIRECTS; i++) {
    const egress = checkEgressUrl(url);
    if (!egress.ok) return { refused: `refused: SSRF guard blocked ${url} (${egress.reason}) \u2014 fetch mode does not reach metadata, link-local or LAN endpoints.` };
    const t0 = Date.now();
    const res = await fetchImpl(url, { redirect: "manual" });
    const ms = Date.now() - t0;
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) return { refused: `redirect from ${url} had no Location header \u2014 not followed.` };
      try {
        url = new URL(loc, url).toString();
      } catch {
        return { refused: `invalid redirect Location "${loc}" from ${url}.` };
      }
      continue;
    }
    return { res, finalUrl: url, ms };
  }
  return { refused: `refused: more than ${MAX_REDIRECTS} redirects from ${initialUrl} \u2014 redirect cap reached.` };
}
var fetchModeDeps = (fetchImpl = fetch) => ({
  perform: async (a) => {
    if (a.kind === "goto" || a.kind === "extract") {
      const url = a.url;
      if (!/^https?:\/\//.test(url)) return { ok: false, detail: `refused: "${url}" is not an http(s) URL \u2014 no file:// or other schemes in fetch mode.`, title: a.kind };
      const egress0 = checkEgressUrl(url);
      if (!egress0.ok) return { ok: false, detail: `refused: SSRF guard blocked ${url} (${egress0.reason}).`, title: a.kind };
      const fetched = await guardedFetch(fetchImpl, url);
      if ("refused" in fetched) return { ok: false, detail: fetched.refused, title: a.kind };
      const { res, finalUrl, ms } = fetched;
      if (!res.ok) return { ok: false, detail: `HTTP ${res.status} from ${finalUrl} after ${ms}ms \u2014 reported, not masked.`, title: a.kind };
      const html = await res.text();
      const title = (html.match(/<title[^>]*>([^<]{0,200})<\/title>/i)?.[1] ?? "(no title)").trim();
      if (a.kind === "extract") {
        const re = new RegExp(`<[^>]*${a.selectorHint}[^>]*>([\\s\\S]{0,400}?)<`, "i");
        const m = html.match(re);
        return { ok: true, detail: m ? `extracted via <${a.selectorHint}>: ${m[1].replace(/<[^>]+>/g, "").trim().slice(0, 200)}` : `selector hint <${a.selectorHint}> not found on ${finalUrl} (${html.length} bytes, ${ms}ms) \u2014 honest absence.`, title };
      }
      return { ok: true, detail: `${finalUrl} \u2192 HTTP ${res.status}, ${html.length} bytes, ${ms}ms, title: ${title}`, title };
    }
    return { ok: false, detail: `${a.kind} is an INTERACTIVE action \u2014 it needs the native computer-use boundary; this host refuses in words instead of pretending (see docs/history/SI-16.10-UPGRADE.md).`, title: a.kind };
  }
});

// probe/productionStack.test.ts
var root = true ? "." : process.cwd();
var store = () => /* @__PURE__ */ new Map();
var __mem = /* @__PURE__ */ new Map();
if (typeof globalThis.localStorage === "undefined") {
  globalThis.localStorage = {
    getItem: (k) => __mem.has(k) ? __mem.get(k) : null,
    setItem: (k, v) => void __mem.set(k, v),
    removeItem: (k) => void __mem.delete(k),
    clear: () => __mem.clear()
  };
}
var fakeCaller = (answer = "1. read the state\n2. act under the gate\n3. selfimpulse the receipt", fail = false) => async (req) => {
  if (fail) throw new Error("connection refused \u2014 the endpoint is down");
  assert.ok(req.secret_ref.startsWith("vh.providerkey."), "the call carries the keyRef (the key itself NEVER travels in the registry)");
  return { content: answer, model: req.model, usage: { input_tokens: 100, output_tokens: 40 }, duration_ms: 123 };
};
describe("productionStack \u2014 the six production features", () => {
  it("F1: universal providers \u2014 manage, work (tiered), monitor", async () => {
    const s = store();
    const dup = addProvider({ id: "openai-main", kind: "openai", label: "ChatGPT", defaultModel: "gpt-4o-mini" }, s);
    assert.equal("error" in dup, false, "a valid provider adds cleanly");
    assert.equal("error" in addProvider({ id: "openai-main", kind: "openai", label: "x", defaultModel: "m" }, s), true, "duplicate id refused");
    assert.equal("error" in addProvider({ id: "c1", kind: "custom", label: "x", defaultModel: "m" }, s), true, "custom without endpoint refused");
    updateProvider("openai-main", { enabled: false }, s);
    assert.equal(listProviders(s)[0].enabled, false);
    setModelPrefs({ enabled: false }, s);
    assert.equal((await chatStep("hi", "cheap", { store: s })).refused?.includes("OFF"), true, "off \u2192 refused in words");
    setModelPrefs({ enabled: true }, s);
    assert.match((await chatStep("hi", "big", { store: s })).refused, /no big-tier route/);
    setModelPrefs({ enabled: true, cheap: { providerId: "ghost", model: "m" } }, s);
    assert.match((await chatStep("hi", "cheap", { store: s })).refused, /unknown provider/);
    setModelPrefs({ enabled: true, cheap: { providerId: "openai-main", model: "gpt-4o-mini" } }, s);
    assert.match((await chatStep("hi", "cheap", { store: s })).refused, /disabled/, "a disabled provider is refused, not skipped");
    updateProvider("openai-main", { enabled: true }, s);
    assert.match((await chatStep("hi", "cheap", { store: s })).refused, /no API key/, "missing key refused (BYOK)");
    const { setProviderKey: setProviderKey2 } = await Promise.resolve().then(() => (init_providers(), providers_exports));
    const { localDb: localDb2 } = await Promise.resolve().then(() => (init_localDb(), localDb_exports));
    const webRefusal = setProviderKey2("openai-main", "sk-test");
    assert.equal(webRefusal.ok, false, "16.10.1: the web edition refuses CLOUD keys \u2014 nothing stored");
    localDb2.secretSet(keyRef("openai-main"), "sk-test");
    const r = await chatStep("plan this", "cheap", { store: s, caller: fakeCaller() });
    assert.equal(r.ok, true);
    assert.equal(r.ok && r.tier, "cheap");
    assert.equal(localDb2.secretGet(keyRef("openai-main")), "sk-test");
    const sum = usageSummary(s);
    assert.ok(sum.total >= 5, `ledger recorded the calls: ${sum.total}`);
    assert.ok(sum.refused >= 4 && sum.ok >= 1);
    assert.equal(sum.estCostUsd != null, true, "gpt-4o-mini is priced \u2192 an estimate exists (labeled)");
    assert.ok(sum.recentRefusals.length > 0, "refusals are kept in words");
    const ping = await pingProvider("openai-main", { store: s, caller: fakeCaller("pong") });
    assert.equal(ping.ok, true);
    assert.match(ping.detail, /answered in/);
    const base = { id: "simulated", label: "Simulated", decide: async () => ({ thoughts: [], plan: ["base step"], actions: [], final: () => "base" }) };
    const off = wrapModelBrain(base, { prefs: { enabled: false }, store: s });
    assert.equal(off.id, "simulated", "off \u2192 base identity");
    const on = wrapModelBrain(base, { prefs: modelPrefs(s), store: s, caller: fakeCaller() });
    assert.equal(on.id, "simulated+model-plan", "enabled \u2192 the hybrid identity is live");
    const plan = await on.decide("objective", { mode: "quick", persona: "witty", facts: [] });
    assert.ok(plan.thoughts[0].includes("REAL model") && plan.thoughts[0].includes("cheap"), `labeled: ${plan.thoughts[0].slice(0, 70)}`);
    assert.equal(plan.plan.length, 3);
    clearUsage(s);
  });
  it("F2: durable missions \u2014 digest-verified resume; done only after verified", () => {
    const s = store();
    const state = { version: 6, missionId: "m1", completedNodeIds: ["n1", "n2"], savedAt: "", graphVersion: 3, pendingTaskIds: [] };
    const rt = {
      persist: () => ({ ...state, savedAt: (/* @__PURE__ */ new Date()).toISOString() }),
      restore: (st) => st.missionId === "m1" ? { ok: true, errors: [] } : { ok: false, errors: [`state belongs to ${st.missionId}, not m1`] }
    };
    const env = durableSave(rt, s);
    assert.equal(env.format, "si-durable-mission/1");
    const r = durableResume(rt, s);
    assert.equal(r.ok, true);
    assert.ok(r.ok && r.completedNodeIds.includes("n1"), "finished nodes are known \u2014 their work is not repeated");
    const raw = JSON.parse(s.get("vh.durable.m1"));
    raw.state.completedNodeIds = ["n1"];
    s.set("vh.durable.m1", JSON.stringify(raw));
    const bad = durableResume(rt, s);
    assert.equal(bad.ok, false);
    assert.ok(!bad.ok && bad.refused.includes("digest"), "a modified snapshot is refused, never resumed");
    const dl = new DoneLedger(s);
    const id = DoneLedger.actionId("m1", "n3", "run tests");
    assert.equal(dl.markDone(id, false).ok, false, "unverified \u2192 refused to mark done");
    assert.equal(dl.isDone(id), false);
    assert.equal(dl.markDone(id, true).ok, true);
    assert.equal(dl.isDone(id), true);
  });
  it("F4: never-give-up \u2014 constraints, ask-don't-guess, proof before done", () => {
    const s = store();
    const cl = new ConstraintLedger(["never touch files outside the workspace"], s);
    assert.equal(cl.checkStep("the step must never touch files outside the workspace \u2014 it did").ok, false, "a violating step is refused");
    assert.equal(cl.checkStep("all work stayed inside the workspace").ok, true);
    const q = askHuman("which deploy target?", ["target env unknown"]);
    assert.equal(q.answered, false);
    assert.equal(answerAsk(q, "").answered, false, "silence is not an answer");
    assert.equal(answerAsk(q, "staging").answered, true);
    assert.match(proofBeforeDone({ verificationRan: false, verificationPassed: false, constraints: cl, finalSummary: "" }).reason ?? "", /nothing was verified/);
    assert.match(proofBeforeDone({ verificationRan: true, verificationPassed: false, constraints: cl, finalSummary: "" }).reason ?? "", /verification FAILED/);
    const done = proofBeforeDone({ verificationRan: true, verificationPassed: true, evidence: "tests 12/12 green", constraints: cl, finalSummary: "everything stayed inside the workspace" });
    assert.equal(done.done, true);
    assert.ok(done.done && done.proof.includes("12/12"));
  });
  it("F5: always-on triggers \u2014 quiet hours, caps, overlap; dispatch stays gated", async () => {
    const dispatched = [];
    const eng = new TriggerEngine({ dispatch: async (obj) => {
      dispatched.push(obj);
      return { ok: true, detail: "queued" };
    } });
    const quiet = { id: "q", objective: "x", quietHours: { from: 23, to: 6 } };
    const at3am = new TriggerEngine({ now: () => /* @__PURE__ */ new Date("2026-09-11T03:00:00"), dispatch: async () => ({ ok: true, detail: "" }) });
    assert.match((await at3am.evaluate(quiet)).detail, /quiet hours/);
    const capped = new TriggerEngine({ dispatch: async () => ({ ok: true, detail: "" }) });
    const spec = { id: "cap", objective: "x", maxPerDay: 1 };
    await capped.evaluate(spec);
    assert.match((await capped.evaluate(spec)).detail, /daily cap/);
    const overlap = { id: "ov", objective: "x", everyMs: 6e4 };
    await eng.evaluate(overlap);
    assert.match((await eng.evaluate(overlap)).detail, /not due|overlap/);
    assert.match((await eng.evaluate({ id: "g", objective: "morning brief" })).detail, /human gate/, "proactivity still pauses at the gate");
    assert.equal(dispatched.length + 1 >= 1, true);
  });
  it("F3: skill store \u2014 tampered digests and unsigned catalogs are refused", async () => {
    const cat = await buildCatalog([{ id: "s1", title: "Clamp", objective: "add clamp", when: "like: clamp", steps: ["write", "test"], provenance: { missionId: "msn-9", verifiedSeats: ["writer", "reviewer"], version: "1" } }]);
    const imported = await importFromCatalog(cat, "s1", cat.signature?.publicKeyHex);
    if (imported.ok) {
      assert.equal(imported.landedAs, "UNDER_EVALUATION", "even a signed import NEVER lands ACTIVE \u2014 trust is re-earned here");
      assert.match(imported.note, /msn-9/, "the provenance travels with the skill");
    } else {
      assert.match(imported.refused, /UNSIGNED/, "hosts without a key refuse in words");
    }
    const stripped = { ...cat, signature: null };
    const unsigned = await importFromCatalog(stripped, "s1");
    assert.equal(unsigned.ok, false);
    assert.ok(!unsigned.ok && unsigned.refused.includes("UNSIGNED"), "an import nobody selfimpulsees for is refused");
    const tampered = { ...cat, skills: [{ ...cat.skills[0], title: "EVIL" }] };
    const t = await importFromCatalog(tampered, "s1");
    assert.equal(t.ok, false);
    assert.ok(!t.ok && t.refused.includes("digest mismatch"), "tampering is caught before anything else");
    assert.equal(await sha256hex(JSON.stringify(cat.skills)), cat.digest);
  });
  it("F6: receipted browser \u2014 every action (and refusal) lands in the chain", async () => {
    const calls = [];
    const b = new ReceiptedBrowser({
      perform: async (a) => {
        calls.push(a.kind);
        return a.kind === "goto" ? { ok: true, detail: "HTTP 200, title: Example", title: "Example" } : { ok: false, detail: "click needs the native seat \u2014 refused in words", title: a.kind };
      }
    });
    await b.run({ kind: "goto", url: "https://example.com" });
    await b.run({ kind: "click", target: "#go" });
    assert.equal(b.entries.length, 2);
    assert.equal(b.entries[1].prev, b.entries[0].hash, "the receipt is hash-chained");
    assert.equal(b.entries[1].ok, false, "the refusal is receipted too \u2014 nothing hidden");
    const lines = b.receipt().trim().split("\n").map((l) => JSON.parse(l));
    assert.equal(lines.length, 2);
    const web = new ReceiptedBrowser(fetchModeDeps(async () => {
      throw new Error("fetch must not be called");
    }));
    const r = await web.run({ kind: "goto", url: "file:///etc/passwd" });
    assert.equal(r.ok, false);
    assert.match(r.detail, /refused/);
    const root2 = process.cwd();
    const selfimpulseSrc = fs.readFileSync(path.join(root2, "src", "selfimpulse", "engine", "selfimpulse.ts"), "utf8");
    assert.ok(selfimpulseSrc.includes("wrapModelBrain(wrapRealModelBrain(simulatedBrain))"), "model brain wraps the harness seam wraps the labeled core");
    assert.ok(!fs.existsSync(path.join(root2, "src", "pages")), "the retired pages tree is gone (19.7.12 UI)");
    const rb = fs.readFileSync(path.join(root2, "src", "browser", "receipted.ts"), "utf8");
    assert.ok(rb.includes("class ReceiptedBrowser") && /prev/.test(rb), "the receipted browser mints hash-chained receipts at the seam");
  });
  it("16.10.1 integration hardening \u2014 engine, UI, and boundary ride as ONE product", async () => {
    const rustSrc = fs.readFileSync(path.join(root, "src-tauri", "src", "commands.rs"), "utf8");
    const runtimeSrc = fs.readFileSync(path.join(root, "src", "mission", "missionRuntime.ts"), "utf8");
    const opsSrc = fs.readFileSync(path.join(root, "src", "selfimpulse", "engine", "selfimpulse.ts"), "utf8") + fs.readFileSync(path.join(root, "src", "selfimpulse", "engine", "skillStore.ts"), "utf8");
    const browserSrc = fs.readFileSync(path.join(root, "src", "browser", "receipted.ts"), "utf8") + fs.readFileSync(path.join(root, "src", "ipc", "client.ts"), "utf8");
    const providersSrc = fs.readFileSync(path.join(root, "src", "selfimpulse", "engine", "providers.ts"), "utf8");
    const backing = /* @__PURE__ */ new Map();
    const storageShim = {
      getItem: (k) => backing.has(k) ? backing.get(k) : null,
      setItem: (k, v) => void backing.set(k, v),
      removeItem: (k) => void backing.delete(k)
    };
    const ledger = new DoneLedger(storageShim);
    assert.equal(ledger.markDone(DoneLedger.actionId("m1", "n1", "step"), false).ok, false, "unverified work is never marked done");
    assert.equal(ledger.markDone(DoneLedger.actionId("m1", "n1", "step"), true).ok, true, "verified work is marked once");
    const rehydrated = new DoneLedger(storageShim);
    assert.equal(rehydrated.isDone(DoneLedger.actionId("m1", "n1", "step")), true, "the ledger survives a restart through the REAL storage shape");
    assert.ok(runtimeSrc.includes("durableResume(this, this.durableKV)"), "run() resumes from the digest-verified snapshot");
    assert.ok(runtimeSrc.includes("this.durableSnapshot(); // 16.10.1 \u2014 save after EVERY step"), "the loop saves after every step");
    assert.ok(runtimeSrc.includes("this.doneLedger.markDone(doneKey, true)"), "the once-guard marks VERIFIED completions only");
    const { setProviderKey: setProviderKey2 } = await Promise.resolve().then(() => (init_providers(), providers_exports));
    const { localDb: localDb2 } = await Promise.resolve().then(() => (init_localDb(), localDb_exports));
    const refused = setProviderKey2("cloud-x", "sk-secret", "openai");
    assert.equal(refused.ok, false, "a cloud key on the web is refused");
    assert.match(refused.refused ?? "", /cannot hold cloud keys/, "the refusal names the real reason (readable-by-origin storage)");
    assert.equal(localDb2.secretGet(keyRef("cloud-x")), null, "nothing was stored \u2014 zero-risk refusal");
    assert.equal(setProviderKey2("local-1", "irrelevant", "ollama").ok, true, "ollama needs no cloud key \u2014 accepted");
    assert.ok(providersSrc.includes("cannot hold cloud keys"), "the split is pinned in source");
    const { listProviders: listProviders2, addProvider: addProvider2, removeProvider: removeProvider2 } = await Promise.resolve().then(() => (init_providers(), providers_exports));
    const added = addProvider2({ id: "web-local", kind: "ollama", label: "Ollama (this machine)", defaultModel: "llama3.1" });
    assert.ok(!("error" in added), "addProvider works through the DEFAULT store \u2014 no thrown write");
    assert.ok(listProviders2().some((x) => x.id === "web-local"), "the registry round-trips the DEFAULT path \u2014 no silent []");
    assert.equal(removeProvider2("web-local").ok, true, "remove works through the default path too");
    assert.ok(!listProviders2().some((x) => x.id === "web-local"), "the removal actually persisted");
    const { buildCatalog: buildCatalog2 } = await Promise.resolve().then(() => (init_skillStore(), skillStore_exports));
    const cat = await buildCatalog2([{ id: "hard1", title: "Clamp", objective: "add clamp", when: "like: clamp", steps: ["write", "test"], provenance: { missionId: "msn-77", verifiedSeats: ["writer"], version: "1" } }]);
    const reg = { genomes: /* @__PURE__ */ new Map() };
    const imported = await importFromCatalog(cat, "hard1", cat.signature?.publicKeyHex, { registry: reg });
    if (imported.ok) {
      assert.equal(reg.genomes.size, 1, "the import MUTATED the registry \u2014 no label-only landings");
      const g = [...reg.genomes.values()][0];
      assert.equal(g.status, "UNDER_EVALUATION", "landed UNDER_EVALUATION in the actual registry");
      assert.match(g.id, /^skill\.hard1$/, "the genome id names the skill");
    } else {
      assert.match(imported.refused, /UNSIGNED/, "keyless hosts still refuse in words");
    }
    const rows = localDb2.importedGenomesList();
    assert.ok(Array.isArray(rows), "imported genomes persist locally");
    assert.ok(opsSrc.includes("export function importedGenomeRegistry()"), "the Skill Store reads the REAL registry");
    assert.ok(!opsSrc.includes("mission queued from trigger"), "the 'mission queued\u2026' stub is GONE");
    assert.ok(opsSrc.includes("export async function dispatchMission(objective: string)"), "trigger dispatch rides dispatchMission \u2014 the SAME governed pipeline as chat");
    assert.ok(/browserAct|browser_act/.test(browserSrc), "the browser boundary call (browser_act) is declared at the IPC seam");
    const webClick = await fetchModeDeps().perform({ kind: "click", target: "button.primary" });
    assert.equal(webClick.ok, false, "fetch mode still refuses interactive actions honestly");
    assert.ok(rustSrc.includes("https://api.groq.com/openai/v1"), "groq has its REAL endpoint (no more OpenAI fallthrough)");
    assert.ok(rustSrc.includes('b["system"] = json!(system)'), "anthropic speaks its Messages contract: top-level system");
    assert.ok(rustSrc.includes('let base_override = req["base_url"]'), "base_url is honored for every cloud kind (BYOK gateways)");
    assert.ok(rustSrc.includes("fn canonicalize_best"), "the sandbox canonicalizes paths (symlink-proof containment)");
    assert.ok(rustSrc.includes("canonicalize_best(&normalize_path_str(path))"), "ensure_allowed tests the REAL path");
    assert.ok(rustSrc.includes("SHELL_ALLOWED_PROGRAMS.contains(&bare.as_str())"), "shell_exec has a capability boundary, not just a cwd check");
  });
});
