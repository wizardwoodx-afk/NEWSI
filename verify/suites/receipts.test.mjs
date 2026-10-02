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
      check(key) {
        const t = this.now();
        const arr = (this.hits.get(key) ?? []).filter((x) => t - x < this.windowMs);
        if (arr.length >= this.limit) {
          this.hits.set(key, arr);
          return false;
        }
        arr.push(t);
        this.hits.set(key, arr);
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
var client_exports = {};
__export(client_exports, {
  ipc: () => ipc,
  nodeKeyOf: () => nodeKeyOf,
  useTauri: () => useTauri
});
async function tauriInvoke(cmd, args) {
  const { invoke: invoke2 } = await Promise.resolve().then(() => (init_core(), core_exports));
  return invoke2(cmd, args ?? {});
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
function nodeKeyOf(workflowId, nodeId) {
  return `${workflowId}:${nodeId}`;
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
    within = (child, root) => norm(child) === norm(root) || norm(child).startsWith(norm(root) + "/");
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
        const key = localDb.secretGet(req.secret_ref);
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
        if (!key) throw new Error(`secret not found: ${req.secret_ref}`);
        throw new Error("Cloud LLM calls from the web host require the native desktop build (CORS). Use Local LLM / Ollama or run `npm run tauri`.");
      },
      fsRead: async (path) => {
        if (useTauri()) return tauriInvoke("fs_read", { path });
        throw new Error("Filesystem is available in the native desktop build.");
      },
      fsWrite: async (path, content) => {
        if (useTauri()) return tauriInvoke("fs_write", { path, content });
        throw new Error("Filesystem is available in the native desktop build.");
      },
      fsList: async (path) => {
        if (useTauri()) return tauriInvoke("fs_list", { path });
        return [];
      },
      fsMkdir: async (path) => {
        if (useTauri()) return tauriInvoke("fs_mkdir", { path });
      },
      fsRemove: async (path, recursive) => {
        if (useTauri()) return tauriInvoke("fs_remove", { path, recursive });
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
      workspaceRootAdd: async (root) => {
        if (!useTauri()) return { ok: false, path: root };
        return tauriInvoke("workspace_root_add", { root });
      },
      workspaceRootRemove: async (root) => {
        if (!useTauri()) return { ok: false, path: root };
        return tauriInvoke("workspace_root_remove", { root });
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
      browserSessionCreate: async (key) => {
        if (useTauri()) return tauriInvoke("browser_session_create", { key });
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

// probe/receipts.test.ts
import { describe, it } from "node:test";
import assert from "node:assert/strict";

// src/mission/licensing.ts
var VERIFY_SECRET = "si-commercial-v1-offline";
var LEGACY_SEAL_SECRET = "mj-commercial-v1-offline";
var SEAL_SECRET_BY_FORMAT = {
  "si-proof-receipt/2": VERIFY_SECRET,
  "mj-proof-receipt/2": LEGACY_SEAL_SECRET,
  "mj-proof-receipt/1": LEGACY_SEAL_SECRET
};

// src/mission/signing.ts
var STORAGE_KEY = "vh.issuerkey.v1";
var KEYCHAIN_REF = "vh.issuerkey.v1";
async function keychainBridge() {
  try {
    const native = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
    if (!native) return null;
    const { ipc: ipc2 } = await Promise.resolve().then(() => (init_client(), client_exports));
    return {
      get: async () => {
        try {
          const r = await ipc2.secretGet(KEYCHAIN_REF);
          return r?.present && r.value ? r.value : null;
        } catch {
          return null;
        }
      },
      set: async (json) => {
        try {
          const r = await ipc2.secretSet(KEYCHAIN_REF, json);
          return Boolean(r?.stored);
        } catch {
          return false;
        }
      }
    };
  } catch {
    return null;
  }
}
var cached = null;
function toHex(bytes) {
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
          keyId: `si-issuer-${stored.publicKeyHex.slice(0, 12)}`,
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
    const publicKeyHex = toHex(rawPub);
    const identity = {
      keyId: `si-issuer-${publicKeyHex.slice(0, 12)}`,
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
    return { alg: "EdDSA", keyId: holder.identity.keyId, publicKeyHex: holder.identity.publicKeyHex, sigHex: toHex(sig) };
  } catch {
    return null;
  }
}
async function signChainHash(chainHashHex) {
  return signHexDigest(chainHashHex);
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
function signingSupported() {
  return ed25519Available();
}

// src/mission/receipts.ts
var enc = new TextEncoder();
function sortDeep(v) {
  if (Array.isArray(v)) return v.map(sortDeep);
  if (v && typeof v === "object") {
    const out = {};
    for (const k of Object.keys(v).sort()) out[k] = sortDeep(v[k]);
    return out;
  }
  return v;
}
var canon = (o) => JSON.stringify(sortDeep(o));
async function sha256hex(s) {
  const d = await crypto.subtle.digest("SHA-256", enc.encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
async function hmacHex(s, secret) {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(s));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
async function buildProofReceipt(args) {
  const { report: report2 } = args;
  const seatEvents = [];
  for (const s of report2.seats) {
    const data = { role: s.role, outcome: s.outcome, verified: s.verified };
    if (s.harness) {
      data.harness = s.harness;
      data.identity = await sha256hex(`${s.seatId}|${s.role}|${s.harness}`);
    }
    seatEvents.push({ kind: "seat.outcome", seatId: s.seatId, data });
  }
  const raw = [
    { kind: "mission.status", seatId: null, data: { status: report2.status, reviewedBySnapshot: report2.reviewedBySnapshot === true } },
    ...seatEvents,
    { kind: "mission.verdict", seatId: null, data: { verified: report2.seats.some((s) => s.verified), arms: report2.autonomyArms ?? [] } }
  ];
  if (report2.gateStatus !== void 0) {
    raw.push({
      kind: "gate.verdict",
      seatId: null,
      data: {
        status: report2.gateStatus,
        tier: report2.gateTier ?? "n/a",
        // 11.10 — the writer→snapshot→verifier evidence link, in the chain itself.
        snapshotSha: report2.gateSnapshotSha ?? null
      }
    });
  }
  if (report2.arenaGate) {
    raw.push({
      kind: "arena.gate",
      seatId: null,
      data: {
        gate: report2.arenaGate.gate,
        digest: report2.arenaGate.digest,
        defended: report2.arenaGate.defended,
        total: report2.arenaGate.total,
        summary: report2.arenaGate.summary
      }
    });
  }
  const header = {
    mission: args.mission,
    teamId: args.teamId,
    startedAt: args.startedAt,
    finishedAt: args.finishedAt,
    mjVersion: args.mjVersion,
    edition: args.edition,
    autonomyArms: report2.autonomyArms ?? []
  };
  const events = [];
  let prev = "0".repeat(64);
  let seq = 0;
  const chain = [
    { kind: "receipt.header", seatId: null, data: { ...header } },
    ...raw
  ];
  for (const r of chain) {
    const ts = (/* @__PURE__ */ new Date()).toISOString();
    const body = { seq, ts, kind: r.kind, seatId: r.seatId, data: r.data, prev };
    const hash = await sha256hex(canon(body));
    events.push({ ...body, hash });
    prev = hash;
    seq += 1;
  }
  const seal = await hmacHex(prev, VERIFY_SECRET);
  const sig = await signChainHash(prev);
  if (sig) {
    return {
      format: "si-proof-receipt/2",
      header,
      events,
      seal,
      issuer: { keyId: sig.keyId, publicKeyHex: sig.publicKeyHex },
      signature: sig.sigHex
    };
  }
  return {
    format: "si-proof-receipt/2",
    header,
    events,
    seal,
    issuer: null,
    signature: null,
    signatureNote: "This runtime has no Ed25519 (WebCrypto refused or is absent). The receipt is tamper-evident via its HMAC seal but NOT issuer-signed."
  };
}
async function verifyProofReceipt(rc) {
  if (rc.format !== "si-proof-receipt/2" && rc.format !== "mj-proof-receipt/2" && rc.format !== "mj-proof-receipt/1") return { ok: false, reason: "unknown format" };
  const HEADER_KIND = "receipt.header";
  const bound = rc.events[0]?.kind === HEADER_KIND;
  if (rc.format === "si-proof-receipt/2" && !bound) {
    return {
      ok: false,
      reason: "receipt header is not bound to the signed chain \u2014 mission, teamId, edition and autonomyArms could be edited freely. A current-format receipt must begin with a receipt.header event."
    };
  }
  if (bound) {
    const first = rc.events[0];
    const h = first.data;
    if (!h || h.mission !== rc.header?.mission || h.teamId !== rc.header?.teamId || h.edition !== rc.header?.edition) {
      return { ok: false, reason: "receipt header does not match the bound header event \u2014 the header was edited after signing" };
    }
  }
  let prev = "0".repeat(64);
  for (const e of rc.events) {
    if (e.prev !== prev) return { ok: false, reason: `chain broken at seq ${e.seq}` };
    const { hash, ...body } = e;
    const expect = await sha256hex(canon(body));
    if (expect !== hash) return { ok: false, reason: `hash mismatch at seq ${e.seq}` };
    prev = hash;
  }
  const sealSecret = SEAL_SECRET_BY_FORMAT[rc.format] ?? VERIFY_SECRET;
  const seal = await hmacHex(prev, sealSecret);
  if (seal !== rc.seal) return { ok: false, reason: "seal mismatch" };
  const isCurrent = rc.format === "si-proof-receipt/2";
  if (isCurrent && !rc.signature) {
    return {
      ok: false,
      reason: `receipt carries no issuer signature${rc.signatureNote ? ` (${rc.signatureNote})` : ""}. For si-proof-receipt/2 an issuer signature is required: without it the chain attests only tamper-evidence against anyone who knows the published seal secret, not authorship.`
    };
  }
  if (rc.signature) {
    if (!rc.issuer?.publicKeyHex) return { ok: false, reason: "receipt is signed but carries no issuer public key" };
    const ok = await verifyIssuerSignature(prev, rc.signature, rc.issuer.publicKeyHex);
    if (!ok) return { ok: false, reason: `issuer signature verification FAILED for chain head ${prev}` };
  }
  return { ok: true, events: rc.events.length, binding: bound ? "header-bound" : "legacy-unbound", signed: Boolean(rc.signature) };
}
function receiptToJsonl(rc) {
  const head = { receipt: rc.header, format: rc.format, seal: rc.seal };
  if (rc.issuer !== void 0) head.issuer = rc.issuer;
  if (rc.signature !== void 0) head.signature = rc.signature;
  if (rc.signatureNote !== void 0) head.signatureNote = rc.signatureNote;
  const lines = [JSON.stringify(head), ...rc.events.map((e) => JSON.stringify(e))];
  return `${lines.join("\n")}
`;
}
function receiptFromJsonl(text) {
  try {
    const lines = text.trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
    if (lines.length < 1) return null;
    const head = lines[0];
    if (!head.receipt || !head.seal) return null;
    const out = {
      format: head.format ?? "mj-proof-receipt/1",
      header: head.receipt,
      events: lines.slice(1),
      seal: head.seal
    };
    if (head.issuer !== void 0) out.issuer = head.issuer;
    if (head.signature !== void 0) out.signature = head.signature;
    if (head.signatureNote !== void 0) out.signatureNote = head.signatureNote;
    return out;
  } catch {
    return null;
  }
}

// probe/receipts.test.ts
import { createHmac } from "node:crypto";
var report = {
  status: "pass",
  seats: [
    { seatId: "s1", role: "builder", outcome: "done", verified: true },
    { seatId: "s2", role: "reviewer", outcome: "done", verified: true }
  ],
  autonomyArms: ["pro"],
  reviewedBySnapshot: true
};
describe("receipts \u2014 build and verify", () => {
  it("a fresh receipt verifies; chain links every event", async () => {
    const rc = await buildProofReceipt({ mission: "mission-x", teamId: "team-x", startedAt: "2026-09-06T12:00:00Z", finishedAt: "2026-09-06T12:09:00Z", mjVersion: "11.9.4-Redesign", edition: "pro", report });
    const v = await verifyProofReceipt(rc);
    assert.equal(v.ok, true);
    assert.equal(rc.events.length, 5);
    assert.equal(rc.events[0].kind, "receipt.header");
    assert.equal(rc.events[0].data.mission, "mission-x");
    assert.equal(rc.events[0].prev, "0".repeat(64));
    for (let i = 1; i < rc.events.length; i++) assert.equal(rc.events[i].prev, rc.events[i - 1].hash);
    if (v.ok) assert.equal(v.binding, "header-bound");
  });
  it("rewriting the header is refused \u2014 it is signed now", async () => {
    const rc = await buildProofReceipt({ mission: "mission-x", teamId: "team-x", startedAt: "a", finishedAt: "b", mjVersion: "11.9.4-Redesign", edition: "personal", report });
    const before = await verifyProofReceipt(rc);
    assert.equal(before.ok, true);
    rc.header = { ...rc.header, mission: "ATTACKER-MISSION", edition: "pro" };
    const after = await verifyProofReceipt(rc);
    assert.equal(after.ok, false, "an edited header must not verify");
    if (!after.ok) assert.match(after.reason, /header/);
  });
  it("stripping the signature is refused on the current format", async () => {
    const rc = await buildProofReceipt({ mission: "mission-x", teamId: "team-x", startedAt: "a", finishedAt: "b", mjVersion: "11.9.4-Redesign", edition: "personal", report });
    if (!rc.signature) return;
    rc.signature = null;
    rc.issuer = null;
    const v = await verifyProofReceipt(rc);
    assert.equal(v.ok, false, "an unsigned si-proof-receipt/2 must not verify");
    if (!v.ok) assert.match(v.reason, /signature/i);
  });
  it("tampering with an event breaks the chain at that event", async () => {
    const rc = await buildProofReceipt({ mission: "mission-x", teamId: "team-x", startedAt: "a", finishedAt: "b", mjVersion: "11.9.4-Redesign", edition: "personal", report });
    rc.events[2] = { ...rc.events[2], data: { ...rc.events[2].data, verified: false } };
    const v = await verifyProofReceipt(rc);
    assert.equal(v.ok, false);
    if (!v.ok) assert.match(v.reason, /seq 2/);
  });
  it("tampering with the seal is rejected", async () => {
    const rc = await buildProofReceipt({ mission: "mission-x", teamId: "team-x", startedAt: "a", finishedAt: "b", mjVersion: "11.9.4-Redesign", edition: "personal", report });
    rc.seal = rc.seal.slice(0, -4) + "beef";
    const v = await verifyProofReceipt(rc);
    assert.equal(v.ok, false);
    if (!v.ok) assert.match(v.reason, /seal/);
  });
  it("jsonl export roundtrips through import + verify", async () => {
    const rc = await buildProofReceipt({ mission: "mission-x", teamId: "team-x", startedAt: "a", finishedAt: "b", mjVersion: "11.9.4-Redesign", edition: "business", report });
    const back = receiptFromJsonl(receiptToJsonl(rc));
    assert.ok(back);
    const v = await verifyProofReceipt(back);
    assert.equal(v.ok, true);
    assert.equal(receiptFromJsonl("not json at all"), null);
  });
});
describe("receipts \u2014 issuer signature (11.10.1)", () => {
  it("every new receipt is v2, and is either signed or honestly explains why not", async () => {
    const rc = await buildProofReceipt({ mission: "mission-sig", teamId: "team-x", startedAt: "a", finishedAt: "b", mjVersion: "11.10.1", edition: "pro", report });
    assert.equal(rc.format, "si-proof-receipt/2");
    if (signingSupported() && rc.signature) {
      assert.match(rc.signature, /^[0-9a-f]{128}$/, "Ed25519 signature is 64 bytes of hex");
      assert.ok(rc.issuer && rc.issuer.publicKeyHex.length === 64, "the verifying public key rides with the receipt");
      assert.equal(rc.signatureNote, void 0, "a signed receipt must not carry an excuse");
    } else {
      assert.equal(rc.signature, null);
      assert.ok(rc.signatureNote && rc.signatureNote.length > 10, "an unsigned receipt must say why, in writing");
    }
    const v = await verifyProofReceipt(rc);
    assert.equal(v.ok, true);
  });
  it("a genuine legacy-wire (mj/1, legacy-sealed) receipt strips issuer fields and verifies", async () => {
    const rc = await buildProofReceipt({ mission: "mission-compat", teamId: "team-x", startedAt: "a", finishedAt: "b", mjVersion: "11.10.1", edition: "pro", report });
    const lastHash = rc.events[rc.events.length - 1].hash;
    const legacySeal = createHmac("sha256", LEGACY_SEAL_SECRET).update(lastHash, "utf8").digest("hex");
    const legacy = { ...rc, format: "mj-proof-receipt/1", seal: legacySeal, issuer: void 0, signature: void 0, signatureNote: void 0 };
    const v = await verifyProofReceipt(legacy);
    assert.equal(v.ok, true, "11.9.x-era receipts must keep verifying after the 16.1.0 upgrade");
  });
});
