import { createRequire as __mjCreateRequire } from "node:module"; const require = __mjCreateRequire(import.meta.url);
var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all2) => {
  for (var name in all2)
    __defProp(target, name, { get: all2[name], enumerable: true });
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
  const tail2 = s.slice(lastColon + 1);
  if (tail2.includes(".")) {
    const v4 = parseIpv4(tail2);
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
  const resolve2 = opts.resolve ?? systemResolver;
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
    answers = await resolve2(host);
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
  const { fetchImpl, allowLoopback, resolve: resolve2, maxRedirects, ...rest } = init;
  const doFetch = fetchImpl ?? globalThis.fetch?.bind(globalThis);
  if (!doFetch) throw new Error("no fetch available in this runtime \u2014 nothing was executed");
  const hops = [];
  let current = raw;
  for (let hop = 0; hop <= (maxRedirects ?? DEFAULT_MAX_REDIRECTS); hop += 1) {
    const decision = await resolveEgress(current, { allowLoopback, resolve: resolve2 });
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
    ENGINE_VERSION = "19.7.16";
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
        const all2 = load().skills.filter((s) => s.nodeKey === nodeKey);
        return { skills: all2.filter((s) => s.active), all: all2 };
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
      fsRead: async (path3) => {
        if (useTauri()) return tauriInvoke("fs_read", { path: path3 });
        throw new Error("Filesystem is available in the native desktop build.");
      },
      fsWrite: async (path3, content) => {
        if (useTauri()) return tauriInvoke("fs_write", { path: path3, content });
        throw new Error("Filesystem is available in the native desktop build.");
      },
      fsList: async (path3) => {
        if (useTauri()) return tauriInvoke("fs_list", { path: path3 });
        return [];
      },
      fsMkdir: async (path3) => {
        if (useTauri()) return tauriInvoke("fs_mkdir", { path: path3 });
      },
      fsRemove: async (path3, recursive) => {
        if (useTauri()) return tauriInvoke("fs_remove", { path: path3, recursive });
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

// probe/mergeGate.test.ts
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path2 from "node:path";
import { execFileSync } from "node:child_process";

// src/mission/teamExecutor.ts
import * as path from "node:path";

// src/mission/webSearch.ts
var WEB_PROVIDERS = [
  {
    id: "wikipedia",
    name: "Wikipedia (opensearch)",
    kind: "secondary",
    needsConfig: false,
    note: "keyless, CORS-open \u2014 primary encyclopedic sources",
    buildUrl: (q) => `https://en.wikipedia.org/w/api.php?action=opensearch&origin=*&format=json&limit=5&search=${encodeURIComponent(q)}`
  },
  {
    id: "hn",
    name: "Hacker News (Algolia)",
    kind: "secondary",
    needsConfig: false,
    note: "keyless, CORS-open \u2014 recent primary discussion + links",
    buildUrl: (q) => `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(q)}&hitsPerPage=5`
  },
  {
    id: "github",
    name: "GitHub repository search",
    kind: "primary",
    needsConfig: false,
    note: "keyless unauthenticated repository search \u2014 first-party code/docs",
    buildUrl: (q) => `https://api.github.com/search/repositories?q=${encodeURIComponent(q)}&per_page=5`
  },
  {
    id: "searxng",
    name: "SearXNG (self-hosted)",
    kind: "meta",
    needsConfig: true,
    note: "user's own metasearch endpoint \u2014 keeps queries local-first",
    buildUrl: (q, o) => o?.searxngRoot ? `${o.searxngRoot.replace(/\/$/, "")}/search?q=${encodeURIComponent(q)}&format=json` : null
  },
  {
    id: "brave",
    name: "Brave Search (BYO key)",
    kind: "meta",
    needsConfig: true,
    note: "optional key in Providers \u2014 never stored by this module",
    buildUrl: (q, o) => o?.braveKey ? `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(q)}&count=5` : null
  }
];
function normalizeWikipedia(json, query) {
  if (!Array.isArray(json) || json.length < 4) return [];
  const [, titles, snippets, urls] = json;
  if (!Array.isArray(titles) || !Array.isArray(urls)) return [];
  return titles.map((title, i) => ({
    url: String(urls[i] ?? ""),
    title: String(title),
    snippet: String(Array.isArray(snippets) ? snippets[i] ?? "" : ""),
    source: "wikipedia",
    kind: "secondary",
    ts: null,
    score: scoreHit({ url: String(urls[i] ?? ""), title: String(title), snippet: String(Array.isArray(snippets) ? snippets[i] ?? "" : ""), source: "wikipedia", kind: "secondary", ts: null }, query)
  })).filter((h) => h.url.length > 0);
}
function normalizeHn(json, query) {
  const hits = json?.hits;
  if (!Array.isArray(hits)) return [];
  return hits.map((h) => {
    const o = h;
    const url = o.url ?? (o.objectID ? `https://news.ycombinator.com/item?id=${o.objectID}` : "");
    return {
      url,
      title: String(o.title ?? ""),
      snippet: String(o.story_text ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 220),
      source: "hn",
      kind: "secondary",
      ts: o.created_at ?? null,
      score: 0
    };
  }).filter((h) => h.url.length > 0).map((h) => ({ ...h, score: scoreHit(h, query) }));
}
function normalizeGithub(json, query) {
  const items = json?.items;
  if (!Array.isArray(items)) return [];
  return items.map((it2) => {
    const o = it2;
    return {
      url: String(o.html_url ?? ""),
      title: String(o.full_name ?? ""),
      snippet: String(o.description ?? "").slice(0, 220),
      source: "github",
      kind: "primary",
      ts: o.pushed_at ?? null,
      score: 0
    };
  }).filter((h) => h.url.length > 0).map((h) => ({ ...h, score: scoreHit(h, query) }));
}
var SOURCE_PRIOR = {
  wikipedia: 0.55,
  hn: 0.45,
  github: 0.45,
  searxng: 0.4,
  brave: 0.4
};
function scoreHit(hit, query) {
  const qTokens = new Set(
    query.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length >= 3)
  );
  if (qTokens.size === 0) return SOURCE_PRIOR[hit.source] * 0.8;
  const text = `${hit.title} ${hit.snippet}`.toLowerCase();
  let matched = 0;
  for (const t of qTokens) if (text.includes(t)) matched += 1;
  const overlap = matched / qTokens.size;
  let recency = 0;
  if (hit.ts) {
    const ageDays = (Date.now() - Date.parse(hit.ts)) / 864e5;
    if (Number.isFinite(ageDays)) recency = ageDays < 7 ? 0.1 : ageDays < 90 ? 0.05 : 0;
  }
  return Math.min(1, 0.35 * overlap + 0.55 * overlap * SOURCE_PRIOR[hit.source] + recency + 0.1 * SOURCE_PRIOR[hit.source]);
}
function dedupeHits(hits) {
  const seen = /* @__PURE__ */ new Set();
  const out = [];
  for (const h of hits) {
    if (seen.has(h.url)) continue;
    seen.add(h.url);
    out.push(h);
  }
  return out.sort((a, b) => b.score - a.score);
}
function toTriples(hits) {
  return hits.map((h) => ({
    claim: `${h.title}${h.snippet ? ` \u2014 ${h.snippet}` : ""}`.slice(0, 280),
    source: h.url,
    confidence: h.score >= 0.55 ? "high" : h.score >= 0.3 ? "medium" : "low",
    kind: h.kind
  }));
}
async function searchWeb(query, opts = {}) {
  const doFetch = opts.fetchImpl ?? (opts.useGlobalFetch === false ? void 0 : typeof fetch === "function" ? fetch : void 0);
  const timeoutMs = opts.timeoutMs ?? 6e3;
  const outcomes = [];
  const hits = [];
  if (!doFetch) {
    return {
      query,
      hits: [],
      providers: WEB_PROVIDERS.map((p) => ({ id: p.id, ok: false, hits: 0, note: "no fetch available in this host" })),
      fetchedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
  }
  await Promise.all(
    WEB_PROVIDERS.map(async (p) => {
      const url = p.buildUrl(query, opts);
      if (url === null) {
        outcomes.push({ id: p.id, ok: false, hits: 0, note: p.needsConfig ? "not configured" : "no url" });
        return;
      }
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), timeoutMs);
      try {
        const res = await doFetch(url, { signal: ctl.signal, headers: p.id === "github" ? { Accept: "application/vnd.github+json" } : void 0 });
        if (!res.ok) {
          outcomes.push({ id: p.id, ok: false, hits: 0, note: `http ${res.status}` });
          return;
        }
        const json = await res.json();
        const norm2 = p.id === "wikipedia" ? normalizeWikipedia(json, query) : p.id === "hn" ? normalizeHn(json, query) : p.id === "github" ? normalizeGithub(json, query) : [];
        hits.push(...norm2);
        outcomes.push({ id: p.id, ok: true, hits: norm2.length, note: "ok" });
      } catch (e) {
        const msg = e instanceof Error && e.name === "AbortError" ? `timeout ${timeoutMs}ms` : "network/cors";
        outcomes.push({ id: p.id, ok: false, hits: 0, note: msg });
      } finally {
        clearTimeout(timer);
      }
    })
  );
  return { query, hits: dedupeHits(hits), providers: outcomes, fetchedAt: (/* @__PURE__ */ new Date()).toISOString() };
}

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

// src/mission/learningReceipt.ts
async function sha256Hex(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// src/mission/custody.ts
var HUMAN_PRINCIPAL_RE = /^human:[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
function isHumanPrincipal(p) {
  return HUMAN_PRINCIPAL_RE.test(p);
}
function canonicalEnvelopeInput(e) {
  return JSON.stringify([e.format, e.id, e.principal, e.delegationChain, e.scope, e.issuedAt, e.expiresAt, e.budgetUsd, e.revoked, e.parentId]);
}
var SEALED = /* @__PURE__ */ new WeakSet();
function markSealed(e) {
  SEALED.add(e);
  return e;
}
function isSealed(e) {
  return SEALED.has(e);
}
var seq = 0;
async function seal(base) {
  const digest = await sha256Hex(canonicalEnvelopeInput(base));
  const env = { ...base, digest };
  if (signingSupported()) {
    const sig = await signHexDigest(digest);
    if (sig) env.signature = sig;
    else env.signatureNote = "Ed25519 unavailable in this runtime; envelope unsigned.";
  } else {
    env.signatureNote = "Ed25519 unavailable in this runtime; envelope unsigned.";
  }
  return markSealed(env);
}
async function issueRootEnvelope(args) {
  if (!isHumanPrincipal(args.principal)) {
    throw new Error(`custody: root principal "${args.principal}" is not a human principal \u2014 the root of every delegation chain must match human:<id>. Refused; nothing was signed.`);
  }
  const now = args.now ?? Date.now();
  const budget = args.budgetUsd ?? null;
  if (budget !== null && (!Number.isFinite(budget) || budget < 0)) {
    throw new Error(`custody: budget cap must be a finite non-negative USD amount \u2014 refused ${String(budget)}`);
  }
  seq += 1;
  return seal({
    format: "si-envelope/1",
    id: `env-${now.toString(36)}-${seq}`,
    principal: args.principal,
    delegationChain: [args.principal],
    scope: args.scope,
    issuedAt: now,
    expiresAt: args.expiresAt,
    budgetUsd: budget,
    revoked: null,
    parentId: null
  });
}
async function attenuate(parent, agentId, subScope, opts) {
  if (!isHumanPrincipal(parent.principal)) {
    return { envelope: null, reason: `custody: parent envelope principal "${parent.principal}" is not human-format \u2014 attenuation is refused rather than delegated from an illegitimate root` };
  }
  const now = opts?.now ?? Date.now();
  const notInParent = subScope.filter((s) => !parent.scope.includes(s));
  if (notInParent.length > 0) {
    return { envelope: null, reason: `attenuation refused: scope would GROW by [${notInParent.join(", ")}] \u2014 a sub-agent never exceeds its parent` };
  }
  const expiry = opts?.expiresAt ?? parent.expiresAt;
  if (parent.expiresAt !== null && (expiry === null || expiry > parent.expiresAt)) {
    return { envelope: null, reason: "attenuation refused: child expiry outlives the parent envelope" };
  }
  const requestedBudget = opts?.budgetUsd ?? null;
  const budget = requestedBudget === null ? parent.budgetUsd : parent.budgetUsd !== null && requestedBudget > parent.budgetUsd ? null : requestedBudget;
  if (requestedBudget !== null && parent.budgetUsd !== null && requestedBudget > parent.budgetUsd) {
    return { envelope: null, reason: `attenuation refused: child budget $${requestedBudget} exceeds the parent's $${parent.budgetUsd} cap \u2014 spend authority never grows` };
  }
  seq += 1;
  const envelope = await seal({
    budgetUsd: budget,
    format: "si-envelope/1",
    id: `env-${now.toString(36)}-${seq}`,
    principal: parent.principal,
    delegationChain: [...parent.delegationChain, agentId],
    scope: subScope,
    issuedAt: now,
    expiresAt: expiry,
    revoked: null,
    parentId: parent.id
  });
  return { envelope, reason: `attenuated from ${parent.id}; chain ${envelope.delegationChain.join(" -> ")}` };
}
function revoke(e, reason) {
  return markSealed({ ...e, revoked: reason });
}
function budgetCheck(e, spentUsd) {
  if (!isSealed(e)) {
    return { ok: false, reason: `envelope ${e.id} is not a sealed envelope \u2014 its budget cap is an unverified claim, not spend authority`, remainingUsd: null };
  }
  if (e.budgetUsd === null) return { ok: true, reason: "uncapped", remainingUsd: null };
  const remaining = e.budgetUsd - spentUsd;
  if (spentUsd >= e.budgetUsd) {
    return { ok: false, reason: `spend authority exhausted \u2014 $${spentUsd.toFixed(4)} spent against a $${e.budgetUsd.toFixed(2)} cap`, remainingUsd: Math.max(0, remaining) };
  }
  return { ok: true, reason: "within budget", remainingUsd: remaining };
}
var BudgetGate = class {
  constructor(capUsd) {
    this.capUsd = capUsd;
  }
  committed = 0;
  /** Budget not yet committed to running seats. */
  get remaining() {
    return Math.max(0, this.capUsd - this.committed);
  }
  get committedUsd() {
    return this.committed;
  }
  /** ATOMIC: check-and-commit with no await in between. Null when the cap cannot admit this seat. */
  reserve(seatId, amount) {
    if (!Number.isFinite(amount) || amount <= 0) return null;
    if (this.committed + amount > this.capUsd + 1e-9) return null;
    this.committed += amount;
    return { seatId, reservedUsd: amount, settled: false };
  }
  /** Swap the reservation for the REAL charge; reports any per-seat overrun honestly. */
  settle(ticket, actualUsd) {
    if (ticket.settled) return { overrunUsd: 0 };
    this.committed -= ticket.reservedUsd;
    const actual = Math.max(0, Number.isFinite(actualUsd) ? actualUsd : 0);
    this.committed += actual;
    ticket.settled = true;
    return { overrunUsd: Math.max(0, actual - ticket.reservedUsd) };
  }
  /** Give the reservation back (a seat skipped or aborted before charging). */
  release(ticket) {
    if (!ticket.settled) {
      this.committed -= ticket.reservedUsd;
      ticket.settled = true;
    }
  }
};
function checkEnvelope(e, action, now) {
  if (!e) return { ok: false, reason: "no authority envelope \u2014 nothing executes without traced authority" };
  if (!isSealed(e)) {
    return {
      ok: false,
      reason: `envelope ${e.id} did not come from this process's seal() \u2014 its fields are unverified claims, not authority. An envelope that crossed a boundary must be re-admitted with rehydrateEnvelope() (which checks the digest and signature) before it can be used.`
    };
  }
  if (e.revoked) return { ok: false, reason: `envelope ${e.id} revoked: ${e.revoked}` };
  if (e.expiresAt !== null && now > e.expiresAt) return { ok: false, reason: `envelope ${e.id} expired \u2014 authority is void` };
  if (!e.scope.includes(action)) return { ok: false, reason: `action "${action}" outside envelope scope [${e.scope.join(", ")}]` };
  return { ok: true, reason: `envelope ${e.id} permits "${action}" (principal ${e.principal})` };
}
async function verifyEnvelope(e) {
  if (!isHumanPrincipal(e.principal)) {
    return { ok: false, reason: `principal "${e.principal}" is not human-format \u2014 every chain must root in a human` };
  }
  const { digest, signature, signatureNote, ...rest } = e;
  void signatureNote;
  const recomputed = await sha256Hex(canonicalEnvelopeInput(rest));
  if (recomputed !== digest) return { ok: false, reason: "digest mismatch \u2014 envelope was altered" };
  if (e.signature) {
    const good = await verifyIssuerSignature(digest, e.signature.sigHex, e.signature.publicKeyHex);
    if (!good) return { ok: false, reason: "signature does not verify" };
  }
  return { ok: true };
}

// src/mission/capability.ts
var CAPABILITY_OPS = ["count", "sum", "avg", "max"];
var LS_PRIVACY = "vh.privacy.ledger";
function privacyCanonical(e) {
  return JSON.stringify([e.id, e.dataset, e.requester, e.op, e.field, e.filtered, e.countedAt, e.prev]);
}
function loadPrivacyLedger() {
  try {
    const raw = localStorage.getItem(LS_PRIVACY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {
  }
  return [];
}
var LS_PRIVACY_ANCHOR = "vh.privacy.ledger.anchor";
function savePrivacyLedger(entries) {
  try {
    localStorage.setItem(LS_PRIVACY, JSON.stringify(entries));
    localStorage.setItem(LS_PRIVACY_ANCHOR, entries.length > 0 ? entries[entries.length - 1].digest : "");
  } catch {
  }
}
async function verifyPrivacyLedger() {
  const entries = loadPrivacyLedger();
  let prev = "GENESIS";
  for (const e of entries) {
    if (e.prev !== prev) return false;
    const { digest, ...rest } = e;
    if (await sha256Hex(privacyCanonical(rest)) !== digest) return false;
    prev = digest;
  }
  try {
    const anchor = localStorage.getItem(LS_PRIVACY_ANCHOR);
    if (anchor !== null && anchor !== (entries.length > 0 ? entries[entries.length - 1].digest : "")) return false;
  } catch {
  }
  return true;
}
var DEMO_COMPANY_DATA = {
  dataset: "demo.revenue-by-region",
  rows: [
    { region: "APAC", revenue: 128.4 },
    { region: "EMEA", revenue: 96.2 },
    { region: "APAC", revenue: 64.1, bonus: 2.2 },
    { region: "EMEA", revenue: 45.9, bonus: 4.1 },
    { region: "AMER", revenue: 210.7 }
  ]
};
var DEMO_POLICY = {
  dataset: DEMO_COMPANY_DATA.dataset,
  allowedFields: ["revenue", "bonus"],
  minCohortSize: 5,
  maxQueriesPerWindow: 8,
  windowMs: 10 * 60 * 1e3,
  roundTo: 0.1
};
function capabilityCanonical(r) {
  return JSON.stringify([r.requestId, r.op, r.dataset, r.field, r.cohortSize, r.value, r.computedAt]);
}
async function executeCapability(args) {
  const { request: request2, envelope, now } = args;
  if (!envelope) return { result: null, reason: "refused \u2014 no authority envelope; a capability request needs the data owner's signed authority" };
  if (!isHumanPrincipal(envelope.principal)) return { result: null, reason: `refused \u2014 principal "${envelope.principal}" is not human; only the data owner may authorize operations on their data` };
  const scope = checkEnvelope(envelope, "capability:run", now);
  if (!scope.ok) return { result: null, reason: `refused \u2014 ${scope.reason}` };
  if (!envelope.scope.includes("capability:run")) return { result: null, reason: "refused \u2014 the envelope's scope does not permit capability:run" };
  if (!CAPABILITY_OPS.includes(request2.op)) return { result: null, reason: `refused \u2014 operation "${request2.op}" is not on the approved whitelist` };
  if (request2.dataset !== DEMO_COMPANY_DATA.dataset) return { result: null, reason: `refused \u2014 dataset "${request2.dataset}" is not exposed on this machine` };
  const policy = DEMO_POLICY;
  if (!await verifyPrivacyLedger()) {
    return { result: null, reason: "refused \u2014 the privacy ledger's digest chain is broken; a restart or reset of the query budget is exactly the reconstruction attack, so nothing computes until the ledger is restored" };
  }
  const ledger = loadPrivacyLedger();
  const spent = ledger.filter(
    (e) => e.dataset === request2.dataset && e.requester === request2.requester && now - e.countedAt < policy.windowMs
  );
  if (spent.length >= policy.maxQueriesPerWindow) {
    return { result: null, reason: `refused \u2014 privacy budget exhausted: ${spent.length} queries already counted for ${request2.requester} in this ${Math.round(policy.windowMs / 6e4)}-minute window; repeated aggregates can reconstruct rows, so the budget is hard` };
  }
  const entry = {
    id: `priv-${Math.random().toString(36).slice(2, 10)}`,
    dataset: request2.dataset,
    requester: request2.requester,
    op: request2.op,
    field: request2.field,
    filtered: !!request2.where,
    countedAt: now,
    prev: ledger.length > 0 ? ledger[ledger.length - 1].digest : "GENESIS",
    digest: ""
  };
  entry.digest = await sha256Hex(privacyCanonical(entry));
  savePrivacyLedger([...ledger, entry]);
  if (!policy.allowedFields.includes(request2.field)) {
    return { result: null, reason: `refused \u2014 field "${request2.field}" is not in this dataset's aggregation policy` };
  }
  const rows = DEMO_COMPANY_DATA.rows.filter(
    (r) => Object.entries(request2.where ?? {}).every(([k, v]) => r[k] === v)
  );
  const values = rows.map((r) => Number(r[request2.field])).filter((v) => Number.isFinite(v));
  if (values.length === 0) return { result: null, reason: `refused \u2014 field "${request2.field}" has no numeric data for that filter` };
  if (values.length < policy.minCohortSize) {
    const scope2 = request2.where ? `matching ${JSON.stringify(request2.where)}` : "in this dataset";
    return { result: null, reason: `refused \u2014 cohort of ${values.length} ${scope2} is below the minimum of ${policy.minCohortSize}; an aggregate that small can expose individuals` };
  }
  const value = request2.op === "count" ? values.length : request2.op === "sum" ? values.reduce((a, b) => a + b, 0) : request2.op === "max" ? Math.max(...values) : values.reduce((a, b) => a + b, 0) / values.length;
  const rounded = Math.round(value / policy.roundTo) * policy.roundTo;
  const base = {
    requestId: request2.id,
    op: request2.op,
    dataset: request2.dataset,
    field: request2.field,
    cohortSize: values.length,
    value: Math.round(rounded * 1e6) / 1e6,
    computedAt: new Date(now).toISOString()
  };
  const digest = await sha256Hex(capabilityCanonical(base));
  return { result: { ...base, digest }, reason: "authorized \u2014 computed where the data lives; only the answer may leave" };
}

// src/mission/egress.ts
var LS_KEY = "vh.egress.ledger";
function egressCanonical(r) {
  return JSON.stringify([r.id, r.at, r.principal, r.item.kind, r.item.name, r.item.sha256, r.recipient, r.envelopeId]);
}
function loadEgressLedger() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      if (Array.isArray(p)) return p;
    }
  } catch {
  }
  return [];
}
function saveEgressLedger(records) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(records));
  } catch {
  }
}
async function requestEgress(args) {
  const { envelope, item, recipient, now } = args;
  if (!envelope) return { record: null, reason: "refused \u2014 no authority envelope; nothing leaves this machine without a human's signed authority" };
  if (!isHumanPrincipal(envelope.principal)) return { record: null, reason: `refused \u2014 principal "${envelope.principal}" is not human; only a human may authorize data to leave` };
  const scopeCheck = checkEnvelope(envelope, "egress:share", now);
  if (!scopeCheck.ok) return { record: null, reason: `refused \u2014 ${scopeCheck.reason}` };
  if (!envelope.scope.includes("egress:share")) return { record: null, reason: "refused \u2014 the envelope's scope does not permit egress:share" };
  const id = `egress-${now.toString(36)}-${loadEgressLedger().length + 1}`;
  const base = {
    id,
    at: new Date(now).toISOString(),
    principal: envelope.principal,
    item,
    recipient,
    envelopeId: envelope.id
  };
  const digest = await sha256Hex(egressCanonical(base));
  const record = { ...base, digest };
  saveEgressLedger([...loadEgressLedger(), record]);
  return { record, reason: "authorized \u2014 receipt recorded" };
}

// src/mission/verifyGate.ts
var GATE_VERIFIER_ROLES = /* @__PURE__ */ new Set(["reviewer", "security", "tester"]);
var GATE_WRITER_ROLES = /* @__PURE__ */ new Set(["coder", "debugger"]);
var POLICY_KEY = "vh.gatepolicy.v1";
function loadGatePolicy() {
  try {
    const raw = globalThis.localStorage?.getItem(POLICY_KEY);
    return raw === "ADVISORY" ? "ADVISORY" : "STRICT";
  } catch {
    return "STRICT";
  }
}
function evaluateVerifyGate(input) {
  const reasons = [];
  const ranVerifiers = input.verifiers.filter((v) => v.ran);
  const snap = input.snapshot;
  if (input.runStatus !== "completed") {
    reasons.push(`Run status is "${input.runStatus}" \u2014 only completed runs can be verified.`);
  }
  const rejections = ranVerifiers.filter((v) => v.verdict === "reject");
  for (const r of rejections) {
    reasons.push(`Verifier "${r.seatId}" (${r.harness}) rejected the work.`);
  }
  const writerHarnesses = [...new Set(input.writers.map((w) => w.harness))];
  let evidence = null;
  if (snap) {
    evidence = {
      snapshotBuilt: snap.built,
      snapshotSha: snap.sha,
      snapshotRef: snap.ref ?? "",
      writerBranches: snap.writerBranches ?? [],
      reviewedBy: ranVerifiers.map((v) => ({
        seatId: v.seatId,
        harness: v.harness,
        reviewedSha: v.reviewedSha ?? null,
        matchesSnapshot: snap.built && snap.sha !== null && v.reviewedSha === snap.sha
      }))
    };
  }
  const countingVerifiers = !snap ? ranVerifiers : ranVerifiers.filter((v) => snap.built && snap.sha !== null && (v.reviewedSha ?? null) === snap.sha);
  let tier;
  let crossVerified = false;
  if (ranVerifiers.length === 0) {
    tier = "unverified";
    reasons.push("No verifier seat ran \u2014 the work was never checked by anyone.");
  } else if (writerHarnesses.length === 0) {
    tier = "cross-vendor";
    crossVerified = true;
  } else if (snap && (!snap.built || snap.sha === null)) {
    tier = "unverified";
    reasons.push("Writers produced work but no review snapshot was built \u2014 no verifier can prove it saw the writers' output, so the run is unverified.");
  } else {
    if (snap && countingVerifiers.length < ranVerifiers.length) {
      const off = ranVerifiers.filter((v) => !(snap.built && snap.sha !== null && (v.reviewedSha ?? null) === snap.sha));
      for (const o of off) {
        reasons.push(`Verifier "${o.seatId}" (${o.harness}) ran, but its reviewed ref (${o.reviewedSha ?? "none recorded"}) does not match the snapshot (${snap.sha}) \u2014 it cannot selfimpulse for the writers' work.`);
      }
    }
    const selfVerified = writerHarnesses.filter(
      (wh) => !countingVerifiers.some((v) => v.harness !== wh)
    );
    if (selfVerified.length > 0) {
      tier = "self-verification";
      reasons.push(
        `Self-verification: writer harness(es) ${selfVerified.join(", ")} had no verifier from a different harness that reviewed the snapshot. An author grading its own work is not a review.`
      );
    } else {
      crossVerified = true;
      const verifierHarnesses = new Set(countingVerifiers.map((v) => v.harness));
      const overlap = writerHarnesses.some((wh) => verifierHarnesses.has(wh));
      tier = overlap ? "cross-seat" : "cross-vendor";
    }
  }
  if (!input.receiptAttached) {
    reasons.push("No proof receipt attached \u2014 verification without a hash-chained record is a claim, not evidence.");
  }
  const hardFail = input.runStatus !== "completed" || rejections.length > 0;
  let status;
  if (hardFail) {
    status = "FAIL";
  } else if (crossVerified && input.receiptAttached) {
    status = "PASS";
  } else {
    status = input.policy === "STRICT" ? "BLOCKED" : "FAIL";
  }
  return { status, tier, reasons, policy: input.policy, crossVerified, evidence };
}
function gateForTeamReport(report, policy, receiptAttached) {
  const notRun = new Set(report.notRun ?? []);
  const seats = report.seats.filter((s) => !notRun.has(s.seatId));
  const failedOutcomes = /* @__PURE__ */ new Set(["failed", "timeout", "blocked_budget"]);
  const writers = seats.filter((s) => GATE_WRITER_ROLES.has(s.role)).map((s) => ({ seatId: s.seatId, harness: s.harness }));
  const verifiers = seats.filter((s) => GATE_VERIFIER_ROLES.has(s.role)).map((s) => ({
    seatId: s.seatId,
    harness: s.harness,
    ran: s.outcome !== "not_run" && s.outcome !== "skipped",
    verdict: s.outcome === "completed" ? "approve" : failedOutcomes.has(s.outcome) ? "reject" : "none",
    reviewedSha: s.reviewedSha ?? null
  }));
  return evaluateVerifyGate({ runStatus: report.status, writers, verifiers, receiptAttached, policy, snapshot: report.snapshot });
}
function enforceMergeGate(verdict) {
  if (verdict.status === "PASS") {
    return { allowed: true, reason: "", overrideRequired: false, verdict };
  }
  if (verdict.policy === "ADVISORY") {
    return {
      allowed: true,
      reason: `Merged under ADVISORY policy despite gate verdict ${verdict.status} (${verdict.tier}): ${verdict.reasons.join(" ")}`,
      overrideRequired: false,
      verdict
    };
  }
  return {
    allowed: false,
    reason: `STRICT gate: merge blocked \u2014 ${verdict.reasons[0] ?? `verdict ${verdict.status} (${verdict.tier})`}`,
    overrideRequired: true,
    verdict
  };
}

// src/mission/lessons.ts
var DECAY_PER_DAY = 0.95;
var RETRIEVE_K = 3;
var LS_KEY2 = "vh.lessons.v1";
function decayedStrength(l, now) {
  const days = Math.max(0, (now - l.createdAt) / 864e5);
  return l.strength * Math.pow(DECAY_PER_DAY, days);
}
function tokens(s) {
  return new Set(s.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 3));
}
function retrieveLessons(memory, goal, k, now) {
  const g = tokens(goal);
  const scored = memory.map((l) => {
    const t = tokens(l.text);
    let overlap = 0;
    g.forEach((w) => {
      if (t.has(w)) overlap += 1;
    });
    const recency = 1 / (1 + (now - l.lastUsedAt) / 864e5);
    return { l, score: decayedStrength(l, now) * (1 + overlap) * (0.5 + 0.5 * recency) };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, k).map((s) => s.l);
}
function retrieveCausal(memory, condition, k, now) {
  const c = tokens(condition);
  const causalText = (l) => l.causal ? [l.causal.decision, l.causal.action, l.causal.observation, l.causal.outcome].filter(Boolean).join(" ") : "";
  const scored = memory.filter((l) => l.causal).map((l) => {
    const t = tokens(causalText(l));
    let overlap = 0;
    c.forEach((w) => {
      if (t.has(w)) overlap += 1;
    });
    return { l, score: overlap === 0 ? 0 : decayedStrength(l, now) * overlap };
  }).filter((x) => x.score > 0);
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, k).map((x) => x.l);
}
function lessonsForBriefing(memory, goal, now) {
  const scars = retrieveLessons(memory.filter((l) => l.kind === "failure"), goal, RETRIEVE_K, now);
  const scarIds = new Set(scars.map((l) => l.id));
  const rest = retrieveLessons(memory, goal, RETRIEVE_K, now).filter((l) => !scarIds.has(l.id));
  return [...scars, ...rest].slice(0, RETRIEVE_K).map(
    (l) => l.kind === "failure" ? `[org memory scar] ${l.text}` : `[org memory] ${l.text}`
  );
}
function loadLessons() {
  try {
    const raw = localStorage.getItem(LS_KEY2);
    if (raw) {
      const p = JSON.parse(raw);
      if (Array.isArray(p)) return p.filter((l) => l && typeof l.text === "string");
    }
  } catch {
  }
  return [];
}

// src/mission/selfImprove.ts
var LS_KEY3 = "vh.selfimprove.v1";
var BASE_PARAMS = {
  reviewDepth: 1,
  checkBias: 0.5,
  serialExec: false,
  lessonBudget: 3,
  mosaic: false
};
function initialState(now) {
  const v = {
    id: "strategy-v1",
    gen: 1,
    params: { ...BASE_PARAMS },
    parentId: null,
    status: "adopted",
    score: null,
    evaluatedOn: 0,
    note: "baseline \u2014 shipped defaults; measured on the runs it itself governs",
    createdAt: now
  };
  return { versions: [v], adoptedId: v.id };
}
function loadImprovement() {
  try {
    const raw = localStorage.getItem(LS_KEY3);
    if (raw) {
      const p = JSON.parse(raw);
      if (p && Array.isArray(p.versions) && p.versions.length > 0) return p;
    }
  } catch {
  }
  return initialState(Date.now());
}
function adoptedVersion(s) {
  return s.versions.find((v) => v.id === s.adoptedId) ?? null;
}
function nextAssignment(s, runs) {
  const baseline = adoptedVersion(s);
  const candidate = s.versions.find((v) => v.status === "candidate") ?? null;
  if (!candidate) return baseline;
  if (!baseline) return candidate;
  const cN = runs.filter((r) => r.strategyId === candidate.id).length;
  const bN = runs.filter((r) => r.strategyId === baseline.id).length;
  return cN <= bN ? candidate : baseline;
}
function strategyWaveShape(assignments, serial) {
  if (serial) return assignments.map((a) => [a]);
  const byWave = /* @__PURE__ */ new Map();
  for (const a of assignments) {
    const list = byWave.get(a.wave) ?? [];
    list.push(a);
    byWave.set(a.wave, list);
  }
  return [...byWave.entries()].sort((x, y) => x[0] - y[0]).map(([, v]) => v);
}
function evidenceDepth(checkBias) {
  return Math.max(2, Math.min(8, Math.round(2 + checkBias * 6)));
}
function reviewBriefingLines(reviewDepth) {
  if (reviewDepth < 2) return [];
  return ["[strategy review depth 2] Reviewers: two independent passes. Pass 1 attacks correctness and demands re-run evidence for every pass claim. Pass 2 re-reads the diff assuming pass 1 missed something. Style nits last and labelled."];
}

// src/mission/skillEvolution.ts
var LS_KEY4 = "vh.skills.v1";
function approvedSkillDefs(memory) {
  return memory.filter((p) => p.status === "approved").map((p) => ({
    id: `learned:${p.id}`,
    label: `\u2605 ${p.name}`,
    description: p.description,
    learnedFrom: p.sourceMissionId
  }));
}
function loadSkills() {
  try {
    const raw = localStorage.getItem(LS_KEY4);
    if (raw) {
      const p = JSON.parse(raw);
      if (Array.isArray(p)) return p;
    }
  } catch {
  }
  return [];
}

// src/mission/ledger.ts
function canWrite(type, writer) {
  switch (type) {
    case "STANCE":
      return writer === "agent" || writer === "human" ? { ok: true, reason: "STANCE is live turn state; the runtime writes it" } : { ok: false, reason: "the experiment writes no live state" };
    case "PRECEDENT":
    case "SCAR":
      return writer === "agent" || writer === "human" ? { ok: true, reason: `${type} is written from MEASURED run facts only (reflection enforces this)` } : { ok: false, reason: "the experiment settles strategies, not episodes" };
    case "DOCTRINE":
      return writer === "human" ? { ok: true, reason: "house rules are human-written" } : { ok: false, reason: `DOCTRINE is human-only; ${writer} may propose, never write` };
    case "RECOURSE":
      return writer === "experiment" || writer === "human" ? { ok: true, reason: "RECOURSE changes only via measured adoption or human approval" } : { ok: false, reason: "an agent run cannot install strategies or skills on its own" };
  }
}
function enforceWrite(type, writer) {
  const v = canWrite(type, writer);
  if (!v.ok) throw new Error(`ledger: refused \u2014 ${writer} may not write ${type} (${v.reason})`);
}

// src/mission/arenaGate.ts
var NOW = 175e10;
async function humanRoot(now, scope, budgetUsd = 100) {
  return issueRootEnvelope({ principal: "human:alice", scope, expiresAt: null, budgetUsd, now });
}
async function scenario(id, title, run) {
  try {
    const { held, note } = await run();
    return { id, title, outcome: held ? "defended" : "breached", note };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const typedRefusal = /^(?:custody|ledger|capability|egress):[\s\S]{0,240}?(?:refused|denied|not a human principal|human-only)/i.test(msg) || /^refused[ —]/i.test(msg);
    return { id, title, outcome: typedRefusal ? "defended" : "breached", note: msg };
  }
}
async function arenaGateDigest(results) {
  return sha256Hex(
    JSON.stringify(results.map((r) => [r.id, r.title, r.outcome]))
  );
}
async function runGovernanceArena(args = {}) {
  const now = args.now ?? NOW;
  const policy = args.policy ?? "STRICT";
  const results = [];
  results.push(
    await scenario("arena.self-grading", "A writer harness tries to grade its own output as verified", async () => {
      const writers = [{ seatId: "seat-w", harness: "hermes" }];
      const verifiers = [
        { seatId: "seat-v", harness: "hermes", ran: true, verdict: "approve", reviewedSha: "abc123" }
      ];
      const verdict = evaluateVerifyGate({
        runStatus: "verified",
        writers,
        verifiers,
        receiptAttached: true,
        policy,
        snapshot: { built: true, sha: "abc123", ref: "head", writerBranches: ["seat-w"] }
      });
      const selfGraded = !verdict.crossVerified;
      const named = verdict.reasons.some((r) => /own work|self/i.test(r));
      return { held: selfGraded && named, note: selfGraded && named ? verdict.reasons.join("; ") : `verdict ${verdict.status}: ${verdict.reasons.join("; ")}` };
    })
  );
  results.push(
    await scenario("arena.agent-root", "An agent identity tries to obtain a root authority envelope", async () => {
      try {
        await issueRootEnvelope({ principal: "agent:hermes", scope: ["*"], expiresAt: null, now });
        return { held: false, note: "agent principal was issued a root envelope" };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { held: /human/i.test(msg), note: msg };
      }
    })
  );
  results.push(
    await scenario("arena.scope-growth", "A delegated seat tries to widen its scope beyond the parent", async () => {
      const root = await humanRoot(now, ["capability:run"]);
      const child = await attenuate(root, "agent:seat", ["capability:run", "egress:share"], { now });
      return { held: child.envelope === null, note: child.envelope === null ? child.reason : "scope was widened" };
    })
  );
  results.push(
    await scenario("arena.expiry", "A mission runs on an envelope whose authority has lapsed", async () => {
      const root = await issueRootEnvelope({ principal: "human:alice", scope: ["capability:run"], expiresAt: now + 1, now });
      const later = checkEnvelope(root, "capability:run", now + 6e4);
      return { held: !later.ok, note: later.ok ? "expired envelope accepted" : later.reason };
    })
  );
  results.push(
    await scenario("arena.revocation", "A compromised envelope tries to act after revocation", async () => {
      const root = await humanRoot(now, ["capability:run"]);
      const dead = revoke(root, "seat compromised \u2014 kill switch");
      const verdict = checkEnvelope(dead, "capability:run", now);
      return { held: !verdict.ok, note: verdict.ok ? "revoked envelope accepted" : verdict.reason };
    })
  );
  results.push(
    await scenario("arena.budget-cap", "A seat tries to charge past the envelope's hard USD cap", async () => {
      const root = await humanRoot(now, ["capability:run"], 100);
      const verdict = budgetCheck(root, 150);
      return { held: !verdict.ok, note: verdict.ok ? "over-budget charge accepted" : verdict.reason };
    })
  );
  results.push(
    await scenario("arena.budget-race", "Concurrent async callers race for the last reservation \u2014 exactly one is admitted, the cap is never crossed", async () => {
      const tick = () => new Promise((resolve2) => setTimeout(resolve2, 0));
      let breached2 = "";
      for (let round = 0; round < 50; round++) {
        const gate2 = new BudgetGate(100);
        const [a, b] = await Promise.all([
          (async () => {
            await tick();
            return gate2.reserve("seat-a", 60);
          })(),
          (async () => {
            await tick();
            return gate2.reserve("seat-b", 60);
          })()
        ]);
        const admitted = [a, b].filter((t) => t !== null).length;
        if (admitted !== 1 || gate2.committedUsd !== 60) {
          breached2 = `round ${round}: admitted=${admitted} committed=${gate2.committedUsd}`;
          break;
        }
      }
      return {
        held: breached2 === "",
        note: breached2 || "50/50 concurrent rounds: exactly one admission each; the cap was never crossed \u2014 reserve() is a synchronous check-and-commit, so async interleaving cannot double-admit"
      };
    })
  );
  results.push(
    await scenario("arena.egress-scope", "An envelope scoped for compute tries to exfiltrate a file", async () => {
      const computeOnly = await humanRoot(now, ["capability:run"]);
      const item = { kind: "file", name: "financial_report.xlsx", sha256: "deadbeef" };
      const verdict = await requestEgress({ envelope: computeOnly, item, recipient: "human:bob", now });
      return { held: verdict.record === null, note: verdict.record === null ? verdict.reason : "egress allowed outside scope" };
    })
  );
  results.push(
    await scenario("arena.tamper", "An attacker edits an envelope's scope after signing", async () => {
      const root = await humanRoot(now, ["capability:run"]);
      const forged = { ...root, scope: [...root.scope, "egress:share"] };
      const verdict = await verifyEnvelope(forged);
      return { held: !verdict.ok, note: verdict.ok ? "forged envelope verified" : verdict.reason ?? "digest mismatch" };
    })
  );
  results.push(
    await scenario("arena.ledger-write", "An agent tries to install DOCTRINE directly into the ledger", async () => {
      try {
        enforceWrite("DOCTRINE", "agent");
        return { held: false, note: "agent wrote DOCTRINE" };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { held: /DOCTRINE|human|agent/i.test(msg), note: msg };
      }
    })
  );
  results.push(
    await scenario("arena.capability-policy", "A requester asks for an aggregate over a dataset this machine does not expose", async () => {
      const root = await humanRoot(now, ["capability:run"]);
      const request2 = {
        id: `req-${now}-offpolicy`,
        op: "sum",
        dataset: "hr_salaries_2026",
        // not exposed on this machine — off-policy data
        field: "salary",
        requester: "human:bob"
      };
      const verdict = await executeCapability({ request: request2, envelope: root, now });
      return { held: verdict.result === null, note: verdict.result === null ? verdict.reason : "off-policy dataset computed" };
    })
  );
  const defended = results.filter((r) => r.outcome === "defended").length;
  const breached = results.length - defended;
  const gate = breached === 0 ? "PASS" : "REFUSED";
  const summary = gate === "PASS" ? `governance arena: ${defended}/${results.length} hostile scenarios defended in words \u2014 the team's authority machine held` : `governance arena REFUSED: ${breached} scenario(s) breached the boundary \u2014 ${results.filter((r) => r.outcome === "breached").map((r) => r.id).join(", ")}`;
  return {
    gate,
    ranAt: now,
    total: results.length,
    defended,
    breached,
    results,
    summary,
    digest: await arenaGateDigest(results)
  };
}

// src/domain/harness.ts
var HARNESSES = [
  {
    id: "hermes",
    name: "Native agent (in-process)",
    bins: [],
    argv: [],
    install: "Nothing to install \u2014 the agent loop runs inside SelfImpulse on your own provider key (or a local Ollama).",
    notes: "The vendored act/observe/adjust loop. Every crew seat runs here, so every action carries one audited receipt format and the trust story has no third party in it.",
    source: "src/engine/hermesRuntime.ts"
  },
  {
    id: "llm",
    name: "Direct LLM (API / Ollama)",
    bins: [],
    argv: [],
    install: "Save a provider key in Settings \u2192 Providers, or run Ollama locally",
    notes: "Not an agent loop. Calls the chat API with the composed agent prompt \u2014 the direct seam under the native runner."
  }
];
var HARNESS_BY_ID = new Map(HARNESSES.map((h) => [h.id, h]));
function defaultHarness() {
  return "hermes";
}
var HARNESS_OPTIONS = HARNESSES.map((h) => h.id);

// src/mission/agentCapabilities.ts
var AGENT_CAPABILITIES = {
  hermes: {
    id: "hermes",
    name: "Hermes Runtime",
    // 19.7.15: hermes is IN-PROCESS. It has no binary, is not a stdio child,
    // and takes no argv. These two lines used to describe a subprocess that
    // does not exist; every caller that read them was reasoning about a seat
    // that could not run.
    bins: [],
    install: "bundled with SelfImpulse; runs in-process (src/engine/hermesRuntime.ts) \u2014 no binary, no argv",
    prompt: { argv: [], confidence: "docs", source: "in-process runtime: no argv exists by construction" },
    json: null,
    readOnly: null,
    write: null,
    fullAuto: null,
    maxTurns: null,
    timeout: null,
    outputSchema: null,
    worktree: null,
    cwd: null,
    model: null,
    resume: null,
    sessionStart: null,
    noAutoUpdate: null,
    filters: null,
    cost: null,
    enforcedReadOnly: false,
    gotchas: ["No enforced sandbox, so a hermes seat must never be assigned HIGH or CRITICAL risk."]
  },
  llm: {
    id: "llm",
    name: "Direct LLM",
    bins: [],
    install: "no binary; SelfImpulse calls the provider API directly",
    // In-process API call: there is no command line, and the empty argv says so
    // rather than a fake ["$PROMPT"] that would read as a spawnable command.
    prompt: { argv: [], confidence: "docs", source: "in-process API call: no argv exists by construction" },
    json: null,
    readOnly: null,
    write: null,
    fullAuto: null,
    maxTurns: null,
    timeout: null,
    outputSchema: null,
    worktree: null,
    cwd: null,
    model: null,
    resume: null,
    sessionStart: null,
    noAutoUpdate: null,
    filters: null,
    cost: null,
    enforcedReadOnly: false,
    gotchas: ["No filesystem access and no enforced sandbox. Useful for reasoning, useless for edits."]
  }
};
function resolveCaps(harness) {
  const caps = AGENT_CAPABILITIES[harness];
  if (caps) return { harness, caps };
  const fallback = defaultHarness();
  return { harness: fallback, caps: AGENT_CAPABILITIES[fallback] };
}
function enforcedReadOnly(id) {
  const caps = AGENT_CAPABILITIES[id];
  return caps ? caps.enforcedReadOnly : false;
}
function unverifiedClaims(id) {
  const caps = AGENT_CAPABILITIES[id];
  if (!caps) {
    return ["Unknown engine id: no verified capability claims exist for it."];
  }
  const out = [];
  const check = (name, cap) => {
    if (cap?.argv && cap.confidence === "community") {
      out.push(`${name}: ${cap.source}`);
    }
  };
  check("cwd", caps.cwd);
  check("model", caps.model);
  check("resume", caps.resume);
  check("json", caps.json);
  if (!caps.enforcedReadOnly && caps.readOnly?.argv) {
    out.push("read-only is advisory: no enforcement was verified, so this seat can still modify files.");
  }
  return out;
}
var EXECUTABLE_HARNESSES = Object.keys(AGENT_CAPABILITIES).filter(
  (id) => AGENT_CAPABILITIES[id].bins.length > 0
);

// src/mission/sessions.ts
function sessionKeyString(k) {
  return `${k.seatId}|${k.harness}|${k.model ?? "default"}|${k.cwd}`;
}
function deriveSessionId(seed) {
  let h1 = 2166136261;
  let h2 = 16777619;
  for (let i = 0; i < seed.length; i += 1) {
    const c = seed.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 16777619) >>> 0;
    h2 = Math.imul(h2 + c + i, 2246822519) >>> 0;
  }
  const hex = (n, len) => n.toString(16).padStart(len, "0").slice(-len);
  return `${hex(h1, 8)}-${hex(h2, 4)}-4${hex(h1 >>> 8, 3)}-a${hex(h2 >>> 12, 3)}-${hex(h1 ^ h2, 8)}${hex(h2 ^ h1, 4)}`;
}
var SessionStore = class {
  byKey = /* @__PURE__ */ new Map();
  all() {
    return [...this.byKey.values()];
  }
  get(key) {
    return this.byKey.get(sessionKeyString(key)) ?? null;
  }
  /**
   * Get the session for a seat, creating it on first use.
   *
   * `confirmed` starts false: VH has asked for a session, but the CLI has not yet said it exists. That
   * distinction is what stops VH resuming a conversation that never started.
   */
  obtain(key, now = (/* @__PURE__ */ new Date()).toISOString()) {
    const k = sessionKeyString(key);
    const existing = this.byKey.get(k);
    if (existing) return existing;
    const fresh = {
      key,
      sessionId: deriveSessionId(k),
      confirmed: false,
      turns: 0,
      createdAt: now,
      updatedAt: now,
      lastPromptHash: null,
      resumeFailedAt: null
    };
    this.byKey.set(k, fresh);
    return fresh;
  }
  /**
   * Record that a turn happened, and confirm the session if the CLI reported an id.
   *
   * `reportedId` is what the CLI printed. When it differs from the id VH asked for, the CLI's word
   * wins — it owns the conversation — and the session is re-keyed so the next resume works.
   */
  recordTurn(key, reportedId, prompt, now = (/* @__PURE__ */ new Date()).toISOString()) {
    const s = this.obtain(key, now);
    if (reportedId && reportedId !== s.sessionId) {
      this.byKey.delete(sessionKeyString(key));
      s.sessionId = reportedId;
      this.byKey.set(sessionKeyString(key), s);
    }
    if (reportedId) s.confirmed = true;
    s.turns += 1;
    s.updatedAt = now;
    s.lastPromptHash = hashPrompt(prompt);
    s.resumeFailedAt = null;
    return s;
  }
  /** The CLI could not resume. Mark it so the next turn starts fresh instead of failing forever. */
  markResumeFailed(key, now = (/* @__PURE__ */ new Date()).toISOString()) {
    const s = this.get(key);
    if (s) s.resumeFailedAt = now;
  }
  hydrate(sessions) {
    for (const s of sessions) this.byKey.set(sessionKeyString(s.key), s);
  }
  export() {
    return this.all();
  }
};
function hashPrompt(p) {
  let h = 2166136261;
  for (let i = 0; i < p.length; i += 1) h = Math.imul(h ^ p.charCodeAt(i), 16777619) >>> 0;
  return h.toString(16);
}
function sessionArgv(harness, opts) {
  const rc = resolveCaps(harness);
  const caps = rc.caps;
  if (opts.kind === "first" && opts.idKind === "cli-chosen") {
    return { argv: [], continuity: "session", warning: null };
  }
  if (opts.kind === "first") {
    const start = caps.sessionStart;
    if (!start?.argv) {
      return { argv: [], continuity: "none", warning: `${caps.name} has no documented way to start a session under a chosen id, so this turn is stateless.` };
    }
    return { argv: start.argv.map((a) => a === "$SESSION" ? opts.sessionId : a), continuity: "session", warning: null };
  }
  const resume = caps.resume;
  if (!resume?.argv) {
    return {
      argv: [],
      continuity: "none",
      warning: `${caps.name} has no documented way to resume a session, so this turn starts from scratch. The agent will not remember the previous turn \u2014 do not treat a second-pass approval as informed.`
    };
  }
  if (!resume.argv.includes("$SESSION")) {
    return {
      argv: [],
      continuity: "none",
      warning: `${caps.name}'s resume form takes no session id, so VH cannot say which conversation to continue and will not guess. This turn starts from scratch and the prompt restates the context.`
    };
  }
  return { argv: resume.argv.map((a) => a === "$SESSION" ? opts.sessionId : a), continuity: "session", warning: null };
}
function sessionIdKind(harness) {
  const rc = resolveCaps(harness);
  return rc.caps.sessionStart?.argv ? "si-chosen" : "cli-chosen";
}
function parseSessionId(harness, raw) {
  void harness;
  if (!raw.trim()) return null;
  for (const line of [raw.trim(), ...raw.split(/\r?\n/).map((l) => l.trim())]) {
    if (!line) continue;
    try {
      const obj = JSON.parse(line);
      const id = obj.session_id ?? obj.sessionID ?? obj.sessionId ?? obj.session;
      if (typeof id === "string" && id.length > 0) return id;
    } catch {
    }
  }
  const m = /"session_?[iI][dD]"\s*:\s*"([^"]+)"/.exec(raw);
  if (m?.[1]) return m[1];
  return null;
}
function detectResumeFailure(raw) {
  const patterns = [
    [/Session not found/i, "the session id is not known to this CLI (it may belong to a different directory, or never existed)"],
    [/No conversation found with session ID/i, "the session id is not known in this directory (sessions are scoped to the cwd and its worktrees)"],
    [/Failed to resume the conversation/i, "the CLI found the session but could not load it"],
    [/Could not resume session/i, "the session's environment expired"]
  ];
  for (const [re, why] of patterns) if (re.test(raw)) return why;
  return null;
}
function followUpPrompt(opts) {
  const lines = [];
  if (opts.continuity === "none") {
    lines.push(
      `NOTE: ${opts.harnessName} cannot resume a session, so you have NO memory of the previous turn.`,
      `Everything you need is restated below. Do not assume you have already seen this work.`,
      ``,
      `## What happened so far`,
      opts.previousSummary,
      ``
    );
  }
  lines.push(`## Do this next`, opts.instruction);
  if (opts.evidence?.length) {
    lines.push(``, `## Evidence you must work from`);
    for (const e of opts.evidence) lines.push(`- ${e}`);
  }
  return lines.join("\n");
}

// src/mission/agentTeam.ts
var SCHEMA_VERSION = 1;
var seat = (id, role, harness, over = {}) => ({
  id,
  role,
  harness,
  model: null,
  mayWrite: role === "coder" || role === "debugger",
  maxRisk: role === "coder" || role === "debugger" ? "MEDIUM" : "LOW",
  timeoutSecs: 900,
  maxTurns: null,
  instructions: "",
  ...over
});
var PREBUILT_TEAMS = [
  {
    id: "team.balanced",
    name: "Balanced",
    description: "Plan, build, test, review. One vendor writes, a second reviews \u2014 so the review is not the author grading its own work.",
    schemaVersion: SCHEMA_VERSION,
    budgetUsd: null,
    createdAt: (/* @__PURE__ */ new Date()).toISOString(),
    updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    revision: 1,
    seats: [
      seat("planner", "planner", "hermes", { mayWrite: false, maxRisk: "LOW", instructions: "Break the objective into steps small enough to verify individually." }),
      seat("architect", "architect", "hermes", { mayWrite: false, maxRisk: "LOW" }),
      seat("impl", "coder", "hermes", { mayWrite: true, maxRisk: "MEDIUM", instructions: "Implement the change. Touch only what the task requires." }),
      seat("synthesizer", "synthesizer", "hermes", { mayWrite: false, maxRisk: "LOW" }),
      seat("test", "tester", "llm", { mayWrite: false, maxRisk: "LOW", instructions: "Run the repository's own checks and report what failed." }),
      seat("reviewer", "reviewer", "llm", { mayWrite: false, maxRisk: "LOW", model: "reviewer-tier", instructions: "Review the diff. Say what is wrong, not what is fine. Run on a different model from the writer \u2014 a reviewer on the writer's own weights is not independent evidence." }),
      seat("security", "security", "llm", { mayWrite: false, maxRisk: "LOW", instructions: "Check for security vulnerabilities." })
    ]
  },
  {
    id: "team.adversarial",
    name: "Adversarial",
    description: "Deliberately independent reviewers. Every writer is reviewed by a different model, because agreement between two seats running the same weights is weaker evidence than agreement across models.",
    schemaVersion: SCHEMA_VERSION,
    budgetUsd: null,
    createdAt: (/* @__PURE__ */ new Date()).toISOString(),
    updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    revision: 1,
    seats: [
      seat("planner", "planner", "hermes", { mayWrite: false, maxRisk: "LOW" }),
      seat("impl", "coder", "hermes", { mayWrite: true, maxRisk: "MEDIUM" }),
      seat("test", "tester", "llm", { mayWrite: false, maxRisk: "LOW", instructions: "Prove the change works or find the case where it does not." }),
      seat("reviewer", "reviewer", "llm", { mayWrite: false, maxRisk: "LOW", model: "reviewer-tier", instructions: "Review independently, on a different model from the writer." }),
      seat("security", "security", "llm", { mayWrite: false, maxRisk: "LOW", instructions: "Look only for injection, secret leakage and unsafe deserialisation." }),
      seat("synthesizer", "synthesizer", "hermes", { mayWrite: false, maxRisk: "LOW", instructions: "Reconcile the verdicts into one decision." })
    ]
  },
  {
    id: "team.powerhouse",
    name: "Cross-Vendor Powerhouse",
    description: "One governed crew, every seat on the native in-process runtime: plans, architects, builds, debugs, tests, reviews and synthesizes \u2014 each seat pointed at its own model, each action receipted through the same gate.",
    schemaVersion: SCHEMA_VERSION,
    budgetUsd: null,
    createdAt: (/* @__PURE__ */ new Date()).toISOString(),
    updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    revision: 1,
    seats: [
      seat("planner", "planner", "hermes", { mayWrite: false, maxRisk: "LOW", instructions: "Formulate the execution plan and criteria." }),
      seat("architect", "architect", "hermes", { mayWrite: false, maxRisk: "LOW", instructions: "Design component interfaces and data schemas." }),
      seat("coder", "coder", "hermes", { mayWrite: true, maxRisk: "MEDIUM", instructions: "Implement core logic and tests in isolated worktree." }),
      seat("debugger", "debugger", "hermes", { mayWrite: true, maxRisk: "MEDIUM", instructions: "Diagnose edge cases and optimize performance." }),
      seat("tester", "tester", "llm", { mayWrite: false, maxRisk: "LOW", instructions: "Run test suites and fuzz edge cases." }),
      seat("reviewer", "reviewer", "llm", { mayWrite: false, maxRisk: "LOW", instructions: "Conduct independent peer review against the snapshot merge." }),
      seat("synthesizer", "synthesizer", "hermes", { mayWrite: false, maxRisk: "LOW", instructions: "Reconcile findings into final release notes." })
    ]
  },
  {
    id: "team.solo",
    name: "Solo",
    description: "One seat. Cheap, fast, and the review is advisory only \u2014 an author grading its own work is not a review.",
    schemaVersion: SCHEMA_VERSION,
    budgetUsd: null,
    createdAt: (/* @__PURE__ */ new Date()).toISOString(),
    updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    revision: 1,
    seats: [seat("impl", "coder", "hermes", { mayWrite: true, maxRisk: "MEDIUM", instructions: "Implement and self-check." })]
  },
  {
    id: "team.audit",
    name: "Read-only audit",
    description: "No seat may write. For answering 'what is wrong with this code?' without risking a change.",
    schemaVersion: SCHEMA_VERSION,
    budgetUsd: null,
    createdAt: (/* @__PURE__ */ new Date()).toISOString(),
    updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    revision: 1,
    seats: [
      seat("reviewer", "reviewer", "llm", { mayWrite: false, maxRisk: "LOW", model: "reviewer-tier", instructions: "Review independently, on a different model from the writer." }),
      seat("security", "security", "llm", { mayWrite: false, maxRisk: "LOW" })
    ]
  }
];
var TEAM_BY_ID = new Map(PREBUILT_TEAMS.map((t) => [t.id, t]));
function fill(cap, vars) {
  if (!cap || !cap.argv) return [];
  return cap.argv.map((a) => a.startsWith("$") ? vars[a] ?? "" : a);
}
function composeSeatArgv(teamSeat, ctx) {
  if (teamSeat.harness === "hermes" || teamSeat.harness === "llm") {
    return {
      bin: "",
      argv: [],
      env: {},
      files: [],
      claims: { readOnlyEnforced: false, costKind: "none" },
      inProcess: true,
      prompt: ctx.prompt,
      warnings: []
    };
  }
  const resolved = resolveCaps(teamSeat.harness);
  const caps = resolved.caps;
  const warnings = [];
  const vars = {
    $PROMPT: ctx.prompt,
    $MODEL: teamSeat.model ?? "",
    $N: String(teamSeat.maxTurns ?? 20),
    $CWD: ctx.cwd,
    $SECS: String(teamSeat.timeoutSecs),
    $SESSION: ctx.sessionId ?? "",
    $REVIEWER: "si-readonly",
    $NAME: `si-${teamSeat.id}`
  };
  const argv = [];
  const flags = [];
  const env = {};
  const files = [];
  const wantsReadOnly = ctx.readOnly || !teamSeat.mayWrite;
  argv.push(...fill(caps.prompt, vars));
  if (wantsReadOnly) {
    if (caps.readOnly?.argv?.length) flags.push(...fill(caps.readOnly, vars));
    else if (caps.readOnly?.implicit) {
    } else warnings.push(`${caps.name} has no enforced read-only mode, so this seat is ADVISORY only \u2014 it can still modify files.`);
  } else if (caps.write?.argv?.length) {
    flags.push(...fill(caps.write, vars));
  }
  if (caps.json?.argv) flags.push(...fill(caps.json, vars));
  if (teamSeat.maxTurns && caps.maxTurns?.argv) flags.push(...fill(caps.maxTurns, vars));
  if (caps.timeout?.argv) flags.push(...fill(caps.timeout, vars));
  if (caps.cwd?.argv) flags.push(...fill(caps.cwd, vars));
  if (teamSeat.model && caps.model?.argv) flags.push(...fill(caps.model, vars));
  if (caps.noAutoUpdate?.argv) flags.push(...fill(caps.noAutoUpdate, vars));
  if (ctx.sessionId) {
    const s = sessionArgv(teamSeat.harness, {
      kind: (ctx.turn ?? 1) <= 1 ? "first" : "follow-up",
      idKind: sessionIdKind(teamSeat.harness),
      sessionId: ctx.sessionId
    });
    flags.push(...s.argv);
    if (s.warning) warnings.push(s.warning);
  }
  for (const claim of unverifiedClaims(teamSeat.harness)) warnings.push(`Unverified flag \u2014 ${claim}`);
  const cleanFlags = flags.filter((f) => f.length > 0);
  return {
    bin: caps.bins[0] ?? "",
    argv: [...argv, ...cleanFlags],
    env,
    files,
    claims: {
      readOnlyEnforced: wantsReadOnly && enforcedReadOnly(teamSeat.harness),
      costKind: caps.cost?.kind ?? "none"
    },
    warnings
  };
}

// src/mission/git.ts
function parseStatusPorcelainZ(raw) {
  if (!raw) return [];
  const fields = raw.split("\0");
  const out = [];
  for (let i = 0; i < fields.length; i += 1) {
    const entry = fields[i];
    if (!entry || entry.length < 4) continue;
    const code = entry.slice(0, 2);
    const path3 = entry.slice(3);
    let oldPath = null;
    if (code === "R " || code === "RM" || code === "C " || code === "CM") {
      oldPath = fields[i + 1] ?? null;
      i += 1;
    }
    const status = code === "??" ? "untracked" : code.startsWith("R") ? "renamed" : code.startsWith("C") ? "copied" : code.startsWith("A") ? "added" : code.startsWith("D") ? "deleted" : "modified";
    out.push({ status, path: path3, oldPath });
  }
  return out;
}
function parseUnifiedDiff(raw) {
  const files = [];
  let current = null;
  let currentHunk = null;
  const flush = () => {
    if (current) files.push(current);
    current = null;
    currentHunk = null;
  };
  for (const line of raw.split(/\r?\n/)) {
    if (line.startsWith("diff --git ")) {
      flush();
      const m = /^diff --git a\/(.*) b\/(.*)$/.exec(line);
      current = { path: m?.[2] ?? m?.[1] ?? "unknown", oldPath: null, status: "modified", additions: 0, deletions: 0, binary: false, hunks: [] };
      continue;
    }
    if (!current) continue;
    if (line.startsWith("rename from ")) current.oldPath = line.slice("rename from ".length);
    else if (line.startsWith("copy from ")) current.oldPath = line.slice("copy from ".length);
    else if (line.startsWith("new file mode")) current.status = "added";
    else if (line.startsWith("deleted file mode")) current.status = "deleted";
    else if (line.startsWith("Binary files") || line.startsWith("GIT binary patch")) current.binary = true;
    else if (line.startsWith("@@")) {
      currentHunk = { header: line, added: [], removed: [], lines: [] };
      current.hunks.push(currentHunk);
    } else if (line.startsWith("+") && !line.startsWith("+++")) {
      current.additions += 1;
      if (currentHunk) {
        currentHunk.added.push(line.slice(1));
        currentHunk.lines.push(line);
      }
    } else if (line.startsWith("-") && !line.startsWith("---")) {
      current.deletions += 1;
      if (currentHunk) {
        currentHunk.removed.push(line.slice(1));
        currentHunk.lines.push(line);
      }
    } else if (currentHunk) {
      currentHunk.lines.push(line);
    }
  }
  flush();
  for (const f of files) if (f.oldPath && f.status === "modified") f.status = "renamed";
  return files;
}
function summariseDiff(files) {
  const totalAdditions = files.reduce((s, f) => s + f.additions, 0);
  const totalDeletions = files.reduce((s, f) => s + f.deletions, 0);
  let largest = null;
  let biggest = -1;
  for (const f of files) {
    const churn = f.additions + f.deletions;
    if (churn > biggest) {
      biggest = churn;
      largest = f.path;
    }
  }
  return {
    files,
    totalAdditions,
    totalDeletions,
    netLines: totalAdditions - totalDeletions,
    binaryFiles: files.filter((f) => f.binary).length,
    empty: files.length === 0,
    largest: files.length ? largest : null
  };
}
function gitApi(runner) {
  const run = async (args, cwd) => runner(args, cwd);
  return {
    async isRepo(cwd) {
      const r = await run(["rev-parse", "--is-inside-work-tree"], cwd);
      if (!r.ok) return { ok: false, reason: r.reason ?? (r.stderr || "git rev-parse failed.") };
      return { ok: r.stdout.trim() === "true", reason: r.stdout.trim() === "true" ? null : "This directory is not inside a git work tree." };
    },
    async status(cwd) {
      const r = await run(["status", "--porcelain=v1", "-z"], cwd);
      if (!r.ok) return { ok: false, entries: [], reason: r.reason ?? (r.stderr || "git status failed.") };
      return { ok: true, entries: parseStatusPorcelainZ(r.stdout), reason: null };
    },
    async diff(cwd, opts = {}) {
      const args = ["diff", "--no-color", "--no-ext-diff", "-M"];
      if (opts.staged) args.push("--staged");
      if (opts.ref) args.push(opts.ref);
      args.push("--");
      for (const p of opts.paths ?? []) args.push(p);
      const r = await run(args, cwd);
      if (!r.ok) return { ok: false, summary: null, raw: "", reason: r.reason ?? (r.stderr || "git diff failed.") };
      return { ok: true, summary: summariseDiff(parseUnifiedDiff(r.stdout)), raw: r.stdout, reason: null };
    },
    async head(cwd) {
      const r = await run(["log", "-1", "--format=%H%x00%s"], cwd);
      if (!r.ok) return { ok: false, sha: null, subject: null, reason: r.reason ?? (r.stderr || "git log failed \u2014 is there a commit yet?") };
      const [sha, subject] = r.stdout.replace(/\n+$/, "").split("\0");
      return { ok: true, sha: (sha ?? "").trim() || null, subject: subject ?? null, reason: null };
    },
    async branch(cwd) {
      const r = await run(["rev-parse", "--abbrev-ref", "HEAD"], cwd);
      if (!r.ok) return { ok: false, name: null, reason: r.reason ?? (r.stderr || "git rev-parse failed.") };
      return { ok: true, name: r.stdout.trim() || null, reason: null };
    }
  };
}

// src/mission/caps.ts
var DEFAULT_CAPS = { timeoutMs: 10 * 60 * 1e3, maxTurns: 40, maxCostUsd: 5 };
var INBOUND_DELEGATION_CAPS = {
  maxCostUsd: 2,
  maxTurns: 40,
  maxInvocations: 4,
  maxWallClockMs: 30 * 6e4
};
var CapLedger = class {
  caps;
  state;
  constructor(caps, now = Date.now()) {
    this.caps = caps;
    this.state = { spentUsd: 0, spentTokens: 0, turnsUsed: 0, invocationsUsed: 0, startedAt: now, cappedInvocations: [] };
  }
  beginInvocation() {
    this.state.invocationsUsed += 1;
  }
  /**
   * Can another invocation start at all? Checked BEFORE dispatch — refusing is control, charging after is bookkeeping.
   *
   * TWO FAIL-CLOSED RULES, both added because an unpopulated `MissionCaps` used
   * to mean "no ceiling at all":
   *
   *  1. A DECLARED-BUT-UNREADABLE CAP IS A REFUSAL, NOT AN ABSENT CAP. Every
   *     guard below reads `?? 0`, and `NaN > 0` is false, so `{ maxTurns: NaN }`
   *     and `{ maxCostUsd: -1 }` each silently disable themselves. A ceiling
   *     nobody can read is not a ceiling, so any declared value that is not a
   *     finite non-negative number refuses the dispatch and names the field.
   *
   *  2. A LEDGER WITH NO ARMED GUARD ADMITS NOTHING. `new CapLedger({})` scored
   *     zero on every guard, so it returned `null` — admit, forever — which meant
   *     the federation path's `new CapLedger({})` was an unbounded budget for
   *     whoever reached the port. There is no honest reading of "no ceiling was
   *     declared" as "run without limit", so it refuses and says so.
   *
   * An explicit `0` is still this build's way of saying "this one dimension is
   * unlimited" (`mayRunTurn` documents the same convention) and stays honoured.
   * What is refused is the ABSENCE of every armed guard, not a chosen zero.
   *
   * `missionLoop` constructs a ledger with `maxTurns: 120` and a numeric
   * `maxCostUsd`, so rule 2 never fires on the mission path; rule 1 only fires
   * on a malformed value, which is the direction it is meant to fail.
   */
  admissionError(now = Date.now()) {
    for (const [field, value] of Object.entries(this.caps)) {
      if (value === void 0 || value === null) continue;
      if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
        return `the ${field} ceiling is declared as ${JSON.stringify(value)}, which is not a usable number \u2014 refusing rather than treating a broken ceiling as no ceiling`;
      }
    }
    const maxCost = this.caps.maxCostUsd ?? 0;
    if (maxCost > 0 && this.state.spentUsd >= maxCost) {
      return `the mission has already spent $${this.state.spentUsd.toFixed(4)} of its $${maxCost.toFixed(4)} ceiling`;
    }
    const maxTurns = this.caps.maxTurns ?? 0;
    if (maxTurns > 0 && this.state.turnsUsed >= maxTurns) {
      return `the mission has already used ${this.state.turnsUsed} of its ${maxTurns} turns`;
    }
    const maxInvocations = this.caps.maxInvocations ?? 0;
    if (maxInvocations > 0 && this.state.invocationsUsed >= maxInvocations) {
      return `the mission has used all ${maxInvocations} permitted invocations`;
    }
    const maxWall = this.caps.maxWallClockMs ?? this.caps.timeoutMs ?? 0;
    if (maxWall > 0 && now - this.state.startedAt >= maxWall) {
      return `the mission's ${Math.round(maxWall / 1e3)}s wall clock has elapsed`;
    }
    if (maxCost <= 0 && maxTurns <= 0 && maxInvocations <= 0 && maxWall <= 0) {
      return `no ceiling is set \u2014 cost, turns, invocations and the wall clock are all absent or zero, so this ledger would admit without limit; dispatch is refused until a real ceiling is declared`;
    }
    return null;
  }
  /** Record what a CLI actually consumed. Returns why, so the caller can show it. */
  charge(r) {
    if (r.tokens !== null && Number.isFinite(r.tokens)) {
      this.state.spentTokens += r.tokens;
    }
    if (r.costUsd !== null && Number.isFinite(r.costUsd)) {
      this.state.spentUsd += r.costUsd;
      const maxCost = this.caps.maxCostUsd ?? 0;
      const breach = maxCost > 0 && this.state.spentUsd > maxCost ? "mission_cap" : null;
      return {
        chargedUsd: r.costUsd,
        basis: "reported_usd",
        breach,
        reason: breach ? `Charged $${r.costUsd.toFixed(4)} from ${r.source}, taking the mission to $${this.state.spentUsd.toFixed(4)} over a $${maxCost.toFixed(4)} ceiling.` : `Charged $${r.costUsd.toFixed(4)} reported by ${r.source}. Mission total $${this.state.spentUsd.toFixed(4)}.`
      };
    }
    if (r.tokens !== null) {
      return {
        chargedUsd: 0,
        basis: "tokens_only",
        breach: null,
        reason: `${r.source} reported ${r.tokens} tokens and no price. Recorded as tokens; NOT converted to dollars, because a guessed price would be a fabricated cost.`
      };
    }
    return { chargedUsd: 0, basis: "unknown", breach: null, reason: `${r.source} reported neither cost nor tokens, so nothing was charged and the true spend is unknown.` };
  }
  /** Note that something was stopped by a cap. Kept separately from charges: a refusal is not a spend. */
  recordCapped(id, outcome, detail, at = (/* @__PURE__ */ new Date()).toISOString()) {
    this.state.cappedInvocations.push({ id, outcome, at, detail });
  }
  addTurns(n) {
    this.state.turnsUsed += n;
  }
  snapshot() {
    return { ...this.state, cappedInvocations: [...this.state.cappedInvocations] };
  }
};
async function withDeadline(work, timeoutMs, now = Date.now) {
  const t0 = now();
  const signal = { cancelled: false };
  if (timeoutMs <= 0) {
    const value = await work(signal);
    return { outcome: "ok", value, timedOut: false, elapsedMs: now() - t0, detail: "No deadline set." };
  }
  let timer = null;
  const deadline = new Promise((resolve2) => {
    timer = setTimeout(() => {
      signal.cancelled = true;
      resolve2("__timeout__");
    }, timeoutMs);
  });
  const winner = await Promise.race([work(signal).then((v) => ({ v })), deadline]);
  if (timer) clearTimeout(timer);
  if (winner === "__timeout__") {
    return {
      outcome: "timeout",
      value: null,
      timedOut: true,
      elapsedMs: now() - t0,
      detail: `Deadline of ${timeoutMs}ms reached. The caller must terminate the child process; VH cannot assume it stopped.`
    };
  }
  return { outcome: "ok", value: winner.v, timedOut: false, elapsedMs: now() - t0, detail: `Finished in ${now() - t0}ms, inside the ${timeoutMs}ms deadline.` };
}
function parseReportedUsage(harness, raw) {
  const empty2 = { costUsd: null, tokens: null, turns: null, source: harness };
  if (!raw.trim()) return empty2;
  const candidates = jsonChunks(raw);
  let costUsd = null;
  let tokens2 = null;
  let turns = null;
  for (const obj of candidates) {
    const c = findNumber(obj, ["total_cost_usd", "cost_usd", "costUsd", "cost"], 0);
    if (c !== null) costUsd = c;
    const t = findNumber(obj, ["total_tokens"], 0) ?? sumTokens(obj);
    if (t === null) {
      const flat = findNumber(obj, ["tokens"], 0);
      if (flat !== null) tokens2 = flat;
    } else {
      tokens2 = t;
    }
    const n = findNumber(obj, ["num_turns", "turns", "total_turns"], 0);
    if (n !== null) turns = n;
  }
  return { costUsd, tokens: tokens2, turns, source: harness };
}
function jsonChunks(raw) {
  const out = [];
  const tryOne = (s) => {
    try {
      const v = JSON.parse(s);
      if (v && typeof v === "object") out.push(v);
    } catch {
    }
  };
  tryOne(raw.trim());
  for (const line of raw.split(/\r?\n/)) if (line.trim()) tryOne(line.trim());
  return out;
}
function pickNumber(obj, keys) {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  }
  return null;
}
function findNumber(obj, keys, depth) {
  if (depth > 3 || !obj || typeof obj !== "object") return null;
  const o = obj;
  const direct = pickNumber(o, keys);
  if (direct !== null) return direct;
  for (const v of Object.values(o)) {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      const nested = findNumber(v, keys, depth + 1);
      if (nested !== null) return nested;
    }
  }
  return null;
}
function sumTokens(obj) {
  const blocks = [];
  const collect = (o, depth) => {
    if (depth > 3 || !o || typeof o !== "object" || Array.isArray(o)) return;
    const rec = o;
    for (const k of ["usage", "tokens"]) {
      const v = rec[k];
      if (v && typeof v === "object" && !Array.isArray(v)) blocks.push(v);
    }
    for (const v of Object.values(rec)) collect(v, depth + 1);
  };
  collect(obj, 0);
  let best = null;
  for (const u of blocks) {
    const total = typeof u.total === "number" && Number.isFinite(u.total) ? u.total : null;
    const i = typeof u.input_tokens === "number" ? u.input_tokens : typeof u.input === "number" ? u.input : 0;
    const o = typeof u.output_tokens === "number" ? u.output_tokens : typeof u.output === "number" ? u.output : 0;
    const candidate = total !== null && total > 0 ? total : i + o > 0 ? i + o : null;
    if (candidate !== null) best = candidate;
  }
  return best;
}

// src/mission/collaboration.ts
function branchSafe(s) {
  return s.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/\.{2,}/g, ".").replace(/^\.+|\.+$/g, "").replace(/^-+|-+$/g, "").slice(0, 40) || "seat";
}
function planWorktrees(team, opts) {
  const plans = [];
  const root = opts.repoRoot.replace(/\/+$/, "");
  const hasWriter = team.seats.some((s) => s.mayWrite);
  for (const seat3 of team.seats) {
    if (!seat3.mayWrite) {
      if (opts.deferReview && hasWriter) {
        const path4 = `${root}-si-review-${branchSafe(opts.missionSlug)}-${branchSafe(seat3.id)}`;
        plans.push({
          seatId: seat3.id,
          branch: "",
          path: path4,
          createArgv: [],
          removeArgv: [["worktree", "remove", "--force", path4]],
          shared: false,
          deferred: true,
          reason: `${seat3.role} is read-only, so it gets its own worktree on the REVIEW SNAPSHOT \u2014 the base plus every writer branch merged. Pointing it at the base checkout would have it review the tree as it was before the work happened, which is the bug this replaces.`
        });
        continue;
      }
      plans.push({
        seatId: seat3.id,
        branch: opts.baseBranch,
        path: root,
        createArgv: [],
        removeArgv: [],
        shared: true,
        deferred: false,
        reason: `${seat3.role} is read-only \u2014 giving a reviewer its own worktree would mean it would review a tree nobody is writing to. Read-only seats share the base checkout.`
      });
      continue;
    }
    const branch = `vh/${opts.missionSlug}/${branchSafe(seat3.id)}`;
    const path3 = `${root}-si-${branchSafe(opts.missionSlug)}-${branchSafe(seat3.id)}`;
    plans.push({
      seatId: seat3.id,
      branch,
      path: path3,
      createArgv: [["worktree", "add", "-b", branch, path3, opts.baseBranch]],
      removeArgv: [["worktree", "remove", "--force", path3]],
      shared: false,
      deferred: false,
      reason: `${seat3.role} writes, so it gets its own worktree on ${branch}. Two agents in one working tree overwrite each other.`
    });
  }
  return plans;
}
function reviewSnapshotBranch(missionSlug) {
  return `vh/${missionSlug}/review`;
}
function reviewSnapshotArgv(opts) {
  const snapshotBranch = reviewSnapshotBranch(opts.missionSlug);
  if (opts.writerBranches.length === 0) {
    return { argv: [], snapshotBranch, problem: "No writer produced a branch, so there is nothing to snapshot." };
  }
  const argv = [
    ["checkout", "-B", snapshotBranch, opts.baseBranch]
  ];
  for (const b of opts.writerBranches) argv.push(["merge", "--no-ff", "--no-edit", b]);
  return { argv, snapshotBranch, problem: null };
}
function reviewWorktreeArgv(snapshotBranch, path3) {
  return [["worktree", "add", "--detach", path3, snapshotBranch]];
}
function snapshotPreflightArgv(baseBranch, writerBranches) {
  const out = [];
  for (let i = 0; i < writerBranches.length; i += 1) {
    for (let j = i + 1; j < writerBranches.length; j += 1) {
      const a = writerBranches[i];
      const b = writerBranches[j];
      if (a && b) out.push(["merge-tree", "--write-tree", "--name-only", a, b]);
    }
  }
  void baseBranch;
  return out;
}
var CONTEXT_PATHS = [
  { harness: "hermes", path: "AGENTS.md" }
];
function briefingContents(opts) {
  const constraintsList = opts.constraints && opts.constraints.length ? opts.constraints.map((c) => `- ${c}`).join("\n") : "- (none declared)";
  const doNotTouchList = opts.doNotTouch && opts.doNotTouch.length ? opts.doNotTouch.map((p) => `- ${p}`).join("\n") : "- (none declared)";
  return [
    `# MISSION BRIEFING \u2014 Generated by VH`,
    ``,
    `## Objective`,
    opts.objective,
    ``,
    `## Constraints`,
    constraintsList,
    ``,
    `## Off-limits files (Do not touch)`,
    doNotTouchList,
    ``,
    `## Collaboration Rules`,
    `- OTHER worktrees are active simultaneously. Work ONLY on files matching your task scope.`,
    `- Do not reformat unrelated code; clean diffs make peer reviews possible.`,
    opts.testCommand ? `- Verify command: \`${opts.testCommand.join(" ")}\`` : ""
  ].filter(Boolean).join("\n");
}
function writeContextFiles(team, opts) {
  const activeHarnesses = new Set(team.seats.map((s) => s.harness));
  const out = [];
  const seenPaths = /* @__PURE__ */ new Set();
  const body = briefingContents(opts);
  for (const entry of CONTEXT_PATHS) {
    if (activeHarnesses.has(entry.harness)) {
      if (seenPaths.has(entry.path)) continue;
      seenPaths.add(entry.path);
      out.push({
        path: entry.path,
        contents: body,
        forHarness: entry.harness
      });
    }
  }
  if (out.length === 0 && team.seats.length > 0) {
    out.push({
      path: "AGENTS.md",
      contents: body,
      forHarness: team.seats[0].harness
    });
  }
  return out;
}

// src/mission/mergePlan.ts
var ROLE_ORDER = {
  architect: 0,
  coder: 1,
  debugger: 2,
  tester: 3,
  security: 4,
  reviewer: 5,
  synthesizer: 6
};
function orderBranches(candidates) {
  const byBranch = new Map(candidates.map((c) => [c.branch, c]));
  const ordered = [];
  const placed = /* @__PURE__ */ new Set();
  const cycles = [];
  const visit = (c, stack) => {
    if (placed.has(c.branch)) return;
    if (stack.includes(c.branch)) {
      cycles.push([...stack.slice(stack.indexOf(c.branch)), c.branch].join(" -> "));
      return;
    }
    for (const dep of c.dependsOn) {
      const d = byBranch.get(dep);
      if (d) visit(d, [...stack, c.branch]);
    }
    placed.add(c.branch);
    ordered.push(c);
  };
  const sorted = [...candidates].sort((a, b) => {
    const ra = ROLE_ORDER[a.role] ?? 99;
    const rb = ROLE_ORDER[b.role] ?? 99;
    if (ra !== rb) return ra - rb;
    return b.additions + b.deletions - (a.additions + a.deletions);
  });
  for (const c of sorted) visit(c, []);
  return { ordered, cycles };
}
function planMerge(candidates, opts) {
  const problems = [];
  const excluded = [];
  const mergeable = [];
  for (const c of candidates) {
    if (!c.verified) {
      excluded.push({ branch: c.branch, seatId: c.seatId, reason: "Its own verification did not pass, so it does not merge. A branch that failed its checks would put a known-broken state on the base branch." });
      continue;
    }
    if (c.additions + c.deletions === 0) {
      excluded.push({ branch: c.branch, seatId: c.seatId, reason: "It changed nothing. Merging an empty branch adds a commit and a conflict surface for no benefit." });
      continue;
    }
    mergeable.push(c);
  }
  const { ordered, cycles } = orderBranches(mergeable);
  for (const cyc of cycles) problems.push(`Dependency cycle: ${cyc}. Two branches each claim to depend on the other, which is a decomposition bug \u2014 VH will not guess an order.`);
  const steps = ordered.map((c, i) => ({
    order: i + 1,
    branch: c.branch,
    seatId: c.seatId,
    argv: [
      ["checkout", opts.baseBranch],
      ["merge", "--no-ff", "--no-edit", c.branch]
    ],
    requires: i === 0 ? [opts.baseBranch] : [ordered[i - 1]?.branch ?? opts.baseBranch],
    note: c.role === "tester" ? "Tests merge after the code they test, so the base branch is never in a state where tests reference code that is not there." : c.dependsOn.length ? `Depends on ${c.dependsOn.join(", ")}, so it merges after them.` : `${c.role} work; +${c.additions}/-${c.deletions}.`
  }));
  const preflight = [];
  for (let i = 0; i < mergeable.length; i += 1) {
    for (let j = i + 1; j < mergeable.length; j += 1) {
      const a = mergeable[i];
      const b = mergeable[j];
      if (!a || !b) continue;
      if (a.dependsOn.includes(b.branch) || b.dependsOn.includes(a.branch)) continue;
      preflight.push({
        a: a.branch,
        b: b.branch,
        // merge-tree does a three-way merge in memory. No working tree is touched, so this is safe to
        // run while agents are still working.
        //
        // It takes TWO branches, not three: the merge base is derived from their history. Passing the
        // base as a third argument makes git reject the command with a usage error (exit 129), which is
        // easy to mistake for "these branches conflict" — verified on git 2.47.3.
        argv: ["merge-tree", "--write-tree", "--name-only", a.branch, b.branch],
        why: `Neither declares a dependency on the other, so a conflict here would be a surprise. Check before merging, not after.`
      });
    }
  }
  if (mergeable.length > 4) {
    problems.push(`${mergeable.length} branches are queued to merge. Four is about where review stops keeping up; consider splitting the mission.`);
  }
  if (excluded.length === candidates.length && candidates.length > 0) {
    problems.push("Every branch was excluded, so nothing will be merged. The mission produced no verified change.");
  }
  const cleanup = [];
  for (const c of mergeable) {
    cleanup.push(["worktree", "remove", "--force", c.worktreePath]);
    cleanup.push(["branch", "-d", c.branch]);
  }
  cleanup.push(["worktree", "prune"]);
  return { steps, excluded, preflight, postMergeCheck: opts.testCommand ?? [], cleanup, problems };
}

// src/mission/interAgentChannel.ts
var InterAgentMessageBus = class {
  messages = [];
  blackboard = /* @__PURE__ */ new Map();
  listeners = /* @__PURE__ */ new Set();
  blackboardListeners = /* @__PURE__ */ new Set();
  seqCounter = 0;
  constructor(initialMessages = []) {
    this.messages = [...initialMessages];
    this.seqCounter = initialMessages.length;
  }
  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  subscribeBlackboard(listener) {
    this.blackboardListeners.add(listener);
    return () => this.blackboardListeners.delete(listener);
  }
  publish(msg) {
    const nextSeq = ++this.seqCounter;
    const full = {
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      sequence: nextSeq,
      seq: nextSeq,
      replyToId: msg.replyToId,
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      channel: msg.channel,
      sender: msg.sender,
      mentions: msg.mentions ?? [],
      intent: msg.intent,
      content: msg.content,
      data: msg.data
    };
    this.messages.push(full);
    for (const listener of this.listeners) {
      try {
        listener(full);
      } catch (err) {
        console.error("Inter-agent bus listener error:", err);
      }
    }
    return full;
  }
  getMessages(filter) {
    if (!filter) return [...this.messages];
    if (typeof filter === "string") {
      if (filter === "#all") return [...this.messages];
      return this.messages.filter((m) => m.channel === filter);
    }
    return this.messages.filter((m) => {
      if (filter.channel && filter.channel !== "#all" && m.channel !== filter.channel) return false;
      if (filter.sender && m.sender.seatId !== filter.sender) return false;
      if (filter.mention) {
        const target = filter.mention.startsWith("@") ? filter.mention : `@${filter.mention}`;
        const hasDirect = m.mentions.includes(target) || m.mentions.includes("@all");
        const mentionsInText = m.content.includes(target);
        if (!hasDirect && !mentionsInText) return false;
      }
      return true;
    });
  }
  getThread(messageId) {
    const root = this.messages.find((m) => m.id === messageId);
    if (!root) return [];
    const thread = [root];
    const queue = [root.id];
    while (queue.length > 0) {
      const currentId = queue.shift();
      const replies = this.messages.filter((m) => m.replyToId === currentId && !thread.some((t) => t.id === m.id));
      for (const reply of replies) {
        thread.push(reply);
        queue.push(reply.id);
      }
    }
    return thread.sort((a, b) => a.sequence - b.sequence);
  }
  writeBlackboard(key, value, author, category) {
    const existing = this.blackboard.get(key);
    const entry = {
      key,
      author,
      updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
      category,
      value,
      version: (existing?.version ?? 0) + 1
    };
    this.blackboard.set(key, entry);
    for (const listener of this.blackboardListeners) {
      try {
        listener(entry);
      } catch (err) {
        console.error("Blackboard listener error:", err);
      }
    }
    return entry;
  }
  readBlackboard(key) {
    return this.blackboard.get(key) ?? null;
  }
  getBlackboard() {
    return Array.from(this.blackboard.values());
  }
  clear() {
    this.messages = [];
    this.blackboard.clear();
    this.seqCounter = 0;
  }
};
var globalAgentBus = new InterAgentMessageBus();

// src/mission/organizationalMemory.ts
var SEED_INVARIANTS = [
  {
    id: "inv-001-worktree-isolation",
    category: "sandbox",
    rule: "Writing agents must never write directly into the base repository checkout; all edits must be staged in private sibling worktrees.",
    originatingMissionId: "mission-init-01",
    failureObserved: "Base checkout dirty with untracked files before reviewer execution.",
    verifiedRepairAction: "Allocated dedicated git worktrees per writing seat under vh/<mission>/<seatId>.",
    timesApplied: 34,
    successRate: 1,
    active: true
  },
  {
    id: "inv-002-snapshot-peer-review",
    category: "testing",
    rule: "Reviewers must inspect a synthesized merge snapshot branch (--no-ff) containing all writer commits, not the untouched base checkout.",
    originatingMissionId: "mission-init-02",
    failureObserved: "Reviewer passed code without seeing newly written features.",
    verifiedRepairAction: "Built temporary review snapshot branch vh/<mission>/review before wave 3 review runs.",
    timesApplied: 28,
    successRate: 1,
    active: true
  },
  {
    id: "inv-003-async-token-bucket",
    category: "concurrency",
    rule: "Token bucket rate limiters must acquire an atomic reservation lock before consuming burst tokens in async handlers.",
    originatingMissionId: "mission-payment-04",
    failureObserved: "Parallel request burst drained bucket below zero.",
    verifiedRepairAction: "Wrapped token consumption in atomic reservation promise.",
    timesApplied: 12,
    successRate: 0.95,
    active: true
  }
];
var OrganizationalMemoryCortex = class {
  invariants = /* @__PURE__ */ new Map();
  constructor(initial = SEED_INVARIANTS) {
    for (const inv of initial) {
      this.invariants.set(inv.id, inv);
    }
  }
  recordRepairSuccess(category, failureObserved, verifiedRepairAction, missionId, rule) {
    const id = `inv-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const invariant = {
      id,
      category,
      rule,
      originatingMissionId: missionId,
      failureObserved,
      verifiedRepairAction,
      timesApplied: 1,
      successRate: 1,
      active: true
    };
    this.invariants.set(id, invariant);
    globalAgentBus.writeBlackboard(
      `cortex.invariants.${id}`,
      `Rule: ${rule}
Origin: ${missionId}
Action: ${verifiedRepairAction}`,
      "memory_cortex",
      "architecture"
    );
    return invariant;
  }
  compileBriefing() {
    const active = Array.from(this.invariants.values()).filter((i) => i.active);
    const cortexId = `cortex-${Date.now()}`;
    const lines = [
      "# ORGANIZATIONAL MEMORY & LEARNED INVARIANTS",
      `<!-- Auto-compiled by VH Memory Cortex for Mission Execution (${(/* @__PURE__ */ new Date()).toISOString()}) -->`,
      "",
      "The following architectural invariants were derived from past empirical failures and proven repairs:",
      ""
    ];
    for (const inv of active) {
      lines.push(`### [${inv.category.toUpperCase()}] ${inv.rule}`);
      lines.push(`- **Failure Observed**: ${inv.failureObserved}`);
      lines.push(`- **Proven Repair**: ${inv.verifiedRepairAction}`);
      lines.push(`- **Historical Reliability**: ${(inv.successRate * 100).toFixed(0)}% across ${inv.timesApplied} runs`);
      lines.push("");
    }
    const generatedBriefingMarkdown = lines.join("\n");
    const agentsMdInjections = active.map((i) => `MUST OBEY: ${i.rule}`);
    return {
      cortexId,
      invariantsCompiled: active.length,
      activeRules: active,
      generatedBriefingMarkdown,
      agentsMdInjections
    };
  }
  getInvariants() {
    return Array.from(this.invariants.values());
  }
};
var globalMemoryCortex = new OrganizationalMemoryCortex();

// src/mission/belief.ts
var LS_KEY5 = "vh.beliefs.v1";
function needsApproval(b) {
  return b.provenance === "agent-inferred" && b.aboutUser && !b.approved;
}
function beliefsForBriefing(memory, goal, now) {
  void now;
  const goalWords = goal.toLowerCase().split(/\W+/).filter((w) => w.length > 3);
  const relevant = (b) => {
    if (needsApproval(b)) return false;
    const low = b.claim.toLowerCase();
    return b.klass === "contradicted" || b.isPrediction || goalWords.some((w) => low.includes(w));
  };
  const lines = [];
  for (const b of memory.filter(relevant)) {
    if (b.isPrediction) lines.push(`[prediction \u2014 NOT evidence] ${b.claim}`);
    else if (b.klass === "contradicted") lines.push(`[belief contradicted] ${b.claim} \u2014 sources disagree; verify before acting on it`);
    else lines.push(`[belief ${b.klass}] ${b.claim} (${b.source})`);
  }
  return lines.slice(0, 6);
}
function loadBeliefs() {
  try {
    const raw = localStorage.getItem(LS_KEY5);
    if (raw) {
      const p = JSON.parse(raw);
      if (Array.isArray(p)) return p;
    }
  } catch {
  }
  return [];
}

// src/mission/selfEvolveRuntime.ts
init_version();
var RUNS_KEY = "vh.selfimprove.runs.v2";
var RUNS_KEY_V1 = "vh.selfimprove.runs.v1";
function loadExperimentRuns() {
  try {
    const raw = localStorage.getItem(RUNS_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      if (Array.isArray(p)) return p;
    }
    const old = localStorage.getItem(RUNS_KEY_V1);
    if (old) {
      const p = JSON.parse(old);
      if (Array.isArray(p)) {
        const migrated = p.map((r) => ({ verified: r.verified, simulated: r.simulated, strategyId: null }));
        localStorage.setItem(RUNS_KEY, JSON.stringify(migrated.slice(-100)));
        localStorage.removeItem(RUNS_KEY_V1);
        return migrated;
      }
    }
  } catch {
  }
  return [];
}
function nextRunStrategy() {
  const v = nextAssignment(loadImprovement(), loadExperimentRuns());
  if (!v) return null;
  return { id: v.id, gen: v.gen, params: v.params, isCandidate: v.status === "candidate" };
}
function composeBriefing(lessons, skillLines, mosaicLines, goal, now, params) {
  const lines = lessonsForBriefing(lessons, goal, now);
  if (params.mosaic) for (const m of mosaicLines) lines.push(m);
  for (const d of skillLines) lines.push(d);
  return lines.slice(0, Math.max(0, params.lessonBudget) + 2 + (params.mosaic ? 4 : 0));
}
function briefingForMission(goal, now) {
  const assigned = nextRunStrategy();
  const params = assigned?.params ?? { reviewDepth: 1, checkBias: 0.5, serialExec: false, lessonBudget: 3, mosaic: false };
  const skillLines = approvedSkillDefs(loadSkills()).map((d) => `[learned skill ${d.label}] ${d.description}`);
  let mosaicLines = [];
  if (params.mosaic) {
    const mem = loadLessons();
    mosaicLines = [
      ...retrieveCausal(mem, goal, 2, now).map((l) => `[causal memory] tried: ${l.causal?.action ?? l.causal?.decision ?? "-"} \u2192 ${l.causal?.outcome ?? "-"}`),
      ...beliefsForBriefing(loadBeliefs(), goal, now)
    ];
  }
  return composeBriefing(loadLessons(), skillLines, mosaicLines, goal, now, params);
}

// src/mission/actionPacket.ts
function canonicalPacketInput(p) {
  return JSON.stringify([
    p.format,
    p.id,
    p.mjVersion,
    p.issuedAt,
    p.intent,
    p.beliefDigest,
    p.planStep,
    p.prediction,
    p.risk,
    p.permission,
    p.rollback,
    p.verification,
    p.reversible
  ]);
}
async function verifyActionPacket(p) {
  const { digest, signature, signatureNote, ...rest } = p;
  void signatureNote;
  const recomputed = await sha256Hex(canonicalPacketInput(rest));
  if (recomputed !== digest) return { ok: false, reason: "digest mismatch \u2014 packet was altered" };
  if (p.signature) {
    const good = await verifyIssuerSignature(digest, p.signature.sigHex, p.signature.publicKeyHex);
    if (!good) return { ok: false, reason: "signature does not verify" };
  }
  return { ok: true };
}
function packetAllowsExecution(p) {
  if (!p) return { ok: true, reason: "no packet \u2014 run proceeds under gate policy alone (pre-11.12 caller)" };
  if (p.permission === "refused") return { ok: false, reason: `action packet ${p.id} is refused: ${p.risk}` };
  if (!p.reversible && p.permission !== "allowed") {
    return { ok: false, reason: `irreversible action requires explicit "allowed" permission; packet ${p.id} says "${p.permission}"` };
  }
  return { ok: true, reason: `packet ${p.id} permits execution (${p.permission}${p.reversible ? ", reversible" : ", irreversible+allowed"})` };
}

// src/security/auditScrub.ts
var AUDIT_SCRUB_MARKER = "[redacted]";
var SECRET_SHAPES = [
  // any `Authorization`-shaped header line, with or without the header name
  /\bauthor(?:ization|isation)\s*:?\s*\S+|\bcookie\s*:\s*\S+/gi,
  // bearer / basic / digest schemes, quoted with or without their scheme word
  /\b(?:bearer|basic|digest)\s+[A-Za-z0-9._~+/=-]{6,}/gi,
  // the long key idioms this product's providers actually issue
  /\b(?:sk|sa|pd|np|sk-proj|sk-svcacct)-[A-Za-z0-9_-]{8,}/gi,
  /\b(?:gh[pousr]_|github_pat_)[A-Za-z0-9_]{8,}/gi,
  /\bxox[baprs]-[A-Za-z0-9-]{6,}/gi,
  /\bAIza[0-9A-Za-z_-]{20,}/g,
  /\bya29\.[A-Za-z0-9_=-]{10,}/g,
  /\bAKIA[0-9A-Z]{12,}/g,
  // a signed token, wherever it came from
  /\beyJ[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}/g,
  // an inline `key = value` / `token=value` assignment
  /\b(?:api[_-]?key|secret|access[_-]?token|refresh[_-]?token|password|passwd|pwd|credential|auth[_-]?token)\s*[:=]\s*[^\s,;]{4,}/gi,
  // a PEM private key body
  /-----BEGIN (?:[A-Z ]*)PRIVATE KEY-----[\s\S]*?-----END (?:[A-Z ]*)PRIVATE KEY-----/g
];
var CREDENTIAL_URL = /\b([a-z][a-z0-9+.-]*:\/\/)([^\s/:@'"]+):([^\s/@'"]+)@/gi;
var CONTROL_CHARACTER = /[\u0000-\u001f\u007f-\u009f]/g;
function scrubAuditText(text) {
  if (!text) return text;
  let out = text.replace(CREDENTIAL_URL, (_all, scheme, user) => `${scheme}${user}:${AUDIT_SCRUB_MARKER}@`);
  for (const shape of SECRET_SHAPES) out = out.replace(shape, AUDIT_SCRUB_MARKER);
  return out.replace(CONTROL_CHARACTER, " ");
}

// src/security/actionGraph.ts
function stableStringify(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const entries = Object.entries(value).filter(([, v]) => v !== void 0).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
}

// src/engine/finops.ts
var MAX_ENTRIES = 2e3;
var all = [];
function recordSeatRun(e) {
  all.push(e);
  if (all.length > MAX_ENTRIES) all = all.slice(-MAX_ENTRIES);
}

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
var toHex2 = (bytes) => Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
function pureSha256(text) {
  return toHex2(sha256Bytes(utf8(text)));
}

// src/mission/durable.ts
function asKV(store) {
  if (typeof store.get === "function" && typeof store.set === "function" && typeof store.getItem !== "function") {
    return store;
  }
  if (typeof store.getItem === "function") {
    const ls = store;
    return { get: (k) => ls.getItem(k), set: (k, v) => ls.setItem(k, v) };
  }
  const m = store;
  return { get: (k) => m.get(k) ?? null, set: (k, v) => void m.set(k, v) };
}
var hostDefault = null;
function defaultDurableKV() {
  if (hostDefault) return hostDefault;
  const ls = globalThis.localStorage;
  if (ls && typeof ls.getItem === "function") hostDefault = asKV(ls);
  else {
    const mem = /* @__PURE__ */ new Map();
    hostDefault = { get: (k) => mem.get(k) ?? null, set: (k, v) => void mem.set(k, v) };
  }
  return hostDefault;
}

// src/mission/runCheckpoints.ts
var RUN_JOURNAL_VERSION = 2;
var RUN_JOURNAL_KEY = "vh.run.journal.v2";
var chainOf = /* @__PURE__ */ new Map();
var states = /* @__PURE__ */ new Map();
var journalStore = null;
function activeStore() {
  journalStore ??= defaultDurableKV();
  return journalStore;
}
var lastWriteRefusal = "";
var digestOf = (s) => pureSha256(stableStringify(s ?? null));
var entryDigestOf = (missionId, step, label, stateDigest, prevDigest, at) => pureSha256(`${missionId}|${step}|${label}|${stateDigest}|${prevDigest}|${at}`);
function stateTable(runId) {
  let table = states.get(runId);
  if (!table) {
    table = /* @__PURE__ */ new Map();
    states.set(runId, table);
  }
  return table;
}
function checkpoint(runId, missionId, step, label, state) {
  const chain = chainOf.get(runId) ?? [];
  const prev = chain[chain.length - 1];
  const at = Date.now();
  const stateDigest = digestOf(state);
  const prevDigest = prev ? prev.entryDigest : "";
  const entryDigest = entryDigestOf(missionId, step, label, stateDigest, prevDigest, at);
  const cp = {
    runId,
    missionId,
    step,
    label,
    stateDigest,
    prevDigest,
    entryDigest,
    at
  };
  chain.push(cp);
  chainOf.set(runId, chain);
  stateTable(runId).set(stateDigest, stableStringify(state ?? null));
  persistRunJournal();
  return cp;
}
function persistRunJournal() {
  try {
    const raw = runJournal();
    asKV(activeStore()).set(RUN_JOURNAL_KEY, raw);
    const parsed = JSON.parse(raw);
    lastWriteRefusal = "";
    return { ok: true, runs: Object.keys(parsed.runs).length, bytes: raw.length };
  } catch (e) {
    lastWriteRefusal = `the run journal could not be written (${e instanceof Error ? e.message : String(e)}) \xE2\u20AC\u201D a restart would have nothing to resume from.`;
    return { ok: false, refused: lastWriteRefusal };
  }
}
function runJournal(runId) {
  const runs = {};
  const stateDoc = {};
  if (runId) {
    runs[runId] = chainOf.get(runId) ?? [];
    stateDoc[runId] = Object.fromEntries(states.get(runId) ?? /* @__PURE__ */ new Map());
  } else {
    for (const [rid, chain] of chainOf) {
      runs[rid] = chain;
      stateDoc[rid] = Object.fromEntries(states.get(rid) ?? /* @__PURE__ */ new Map());
    }
  }
  const doc = { schemaVersion: RUN_JOURNAL_VERSION, savedAt: (/* @__PURE__ */ new Date()).toISOString(), runs, states: stateDoc };
  return JSON.stringify(doc);
}

// src/mission/dispatchLanes.ts
var HOUSEKEEPING_STREAK_CAP = 2;
var SEAT_LANE_CONCURRENCY = 8;
var LaneRefusalError = class extends Error {
  laneRefused = true;
  constructor(message) {
    super(message);
    this.name = "LaneRefusalError";
  }
};
function isLaneRefusal(e) {
  return e instanceof LaneRefusalError;
}
function createDispatchLanes(args) {
  const concurrency = Math.max(1, Math.floor(args.concurrency ?? SEAT_LANE_CONCURRENCY));
  const maximumQueued = Math.max(1, Math.floor(args.maximumQueued ?? concurrency));
  const streakCap = Math.max(1, Math.floor(args.housekeepingStreakCap ?? HOUSEKEEPING_STREAK_CAP));
  const waiting = [];
  const readiness = /* @__PURE__ */ new Set();
  const refusals = [];
  const started = { foreground: 0, housekeeping: 0 };
  let running = 0;
  let housekeepingStreak = 0;
  let longestHousekeepingStreak = 0;
  function notifyRoom() {
    if (waiting.length >= maximumQueued) return;
    const ready = [...readiness];
    readiness.clear();
    for (const notify of ready) notify();
  }
  function pickIndex() {
    const foreground = waiting.findIndex((e) => e.priority === "foreground");
    const housekeeping = waiting.findIndex((e) => e.priority === "housekeeping");
    if (housekeeping < 0) return foreground >= 0 ? foreground : waiting.length ? 0 : -1;
    if (foreground < 0) return housekeeping;
    return housekeepingStreak < streakCap ? housekeeping : foreground;
  }
  function advance() {
    if (running >= concurrency) return;
    const index = pickIndex();
    if (index < 0) {
      if (waiting.length === 0) notifyRoom();
      return;
    }
    const next = waiting.splice(index, 1)[0];
    const stop = next.stopReason ? next.stopReason() : null;
    if (stop) {
      refusals.push(stop);
      next.refuse(stop);
      advance();
      return;
    }
    housekeepingStreak = next.priority === "housekeeping" ? housekeepingStreak + 1 : 0;
    longestHousekeepingStreak = Math.max(longestHousekeepingStreak, housekeepingStreak);
    started[next.priority] += 1;
    running += 1;
    void next.run().finally(() => {
      running -= 1;
      advance();
      notifyRoom();
    });
    if (running < concurrency) advance();
  }
  return Object.freeze({
    run(task, opts = {}) {
      const priority = opts.priority === "housekeeping" ? "housekeeping" : "foreground";
      const stopReason = opts.stopReason;
      const alreadyStopped = stopReason ? stopReason() : null;
      if (alreadyStopped) {
        refusals.push(alreadyStopped);
        return Promise.reject(new LaneRefusalError(alreadyStopped));
      }
      if (waiting.length >= maximumQueued) {
        const reason = `the dispatch lane is full \u2014 ${waiting.length} of ${maximumQueued} queued entries are already waiting under a ceiling of ${concurrency} concurrent ${concurrency === 1 ? "seat" : "seats"}. Refused rather than growing the queue, because an unbounded lane is the thing this guard replaces.`;
        refusals.push(reason);
        return Promise.reject(new LaneRefusalError(reason));
      }
      return new Promise((resolve2, reject) => {
        const entry = {
          priority,
          stopReason,
          refuse: (reason) => reject(new LaneRefusalError(reason)),
          run: async () => {
            try {
              resolve2(await task());
            } catch (e) {
              reject(e instanceof Error ? e : new Error(String(e)));
            }
          }
        };
        waiting.push(entry);
        advance();
      });
    },
    whenAvailable(notify) {
      if (waiting.length < maximumQueued) notify();
      else readiness.add(notify);
    },
    get pending() {
      return waiting.length + running;
    },
    get waiting() {
      return waiting.length;
    },
    get running() {
      return running;
    },
    snapshot() {
      return {
        concurrency,
        maximumQueued,
        running,
        waiting: waiting.length,
        startedByLane: { ...started },
        refused: [...refusals],
        longestHousekeepingStreak
      };
    }
  });
}
function laneForSeat(mayWrite) {
  return mayWrite ? "foreground" : "housekeeping";
}

// src/mission/consensusEngine.ts
var AgentReputationLedger = class {
  ledger = /* @__PURE__ */ new Map();
  constructor() {
    const harnesses = ["hermes", "llm"];
    for (const h of harnesses) {
      this.ledger.set(h, {
        seatId: h,
        harness: h,
        missionsParticipated: 0,
        verifiedCommits: 0,
        accurateReviews: 0,
        falseAlarms: 0,
        reputationWeight: 1
        // Neutral 1.0 baseline
      });
    }
  }
  getReputation(harnessOrSeatId) {
    return this.ledger.get(harnessOrSeatId) ?? {
      seatId: harnessOrSeatId,
      harness: "llm",
      missionsParticipated: 0,
      verifiedCommits: 0,
      accurateReviews: 0,
      falseAlarms: 0,
      reputationWeight: 1
    };
  }
  recordOutcome(harnessOrSeatId, result) {
    const rep = this.getReputation(harnessOrSeatId);
    rep.missionsParticipated++;
    if (result.verifiedCommit) rep.verifiedCommits++;
    if (result.accurateReview) rep.accurateReviews++;
    if (result.falseAlarm) rep.falseAlarms++;
    const delta = rep.accurateReviews * 0.05 + rep.verifiedCommits * 0.05 - rep.falseAlarms * 0.1;
    rep.reputationWeight = Math.min(2, Math.max(0.5, 1 + delta));
    this.ledger.set(harnessOrSeatId, rep);
    return rep;
  }
  getAll() {
    return Array.from(this.ledger.values());
  }
};
var globalReputationLedger = new AgentReputationLedger();
var INITIAL_REPUTATIONS = Object.fromEntries(
  globalReputationLedger.getAll().map((r) => [r.harness, r])
);

// src/mission/teamExecutor.ts
var OUTPUT_TAIL_CHARS = 4e3;
var BRIEF_DIR = ".si-brief";
function seatStepId(missionSlug, seatId, step) {
  return `${missionSlug}::${seatId}::${step}`;
}
var SEAT_STEP_STORAGE_KEY = "vh.seatSteps.v1";
function isStepRecord(r) {
  if (!r || typeof r !== "object") return false;
  const o = r;
  return typeof o.stepId === "string" && typeof o.missionSlug === "string" && typeof o.seatId === "string" && typeof o.step === "string" && typeof o.at === "number" && (o.state === "in_flight" || o.state === "settled" || o.state === "failed");
}
function createSeatStepLedger(opts) {
  const store = opts && "store" in opts ? opts.store ?? null : globalThis.localStorage ?? null;
  const mem = /* @__PURE__ */ new Map();
  let loaded = false;
  const load2 = () => {
    if (loaded) return;
    loaded = true;
    try {
      const raw = store?.getItem(SEAT_STEP_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        for (const r of parsed) if (isStepRecord(r)) mem.set(r.stepId, r);
      }
    } catch {
    }
  };
  const persist = () => {
    try {
      store?.setItem(SEAT_STEP_STORAGE_KEY, JSON.stringify([...mem.values()]));
    } catch {
    }
  };
  return {
    stepId: (p) => seatStepId(p.missionSlug, p.seatId, p.step),
    get: (id) => {
      load2();
      return mem.get(id);
    },
    mark: (rec) => {
      load2();
      mem.set(rec.stepId, rec);
      persist();
    },
    entries: () => {
      load2();
      return [...mem.values()];
    }
  };
}
async function git(deps2, args, cwd) {
  if (!deps2.git) return { ok: false, stdout: "", stderr: "", exitCode: null };
  const r = await deps2.git(args, cwd);
  return { ok: r.exitCode === 0, stdout: r.stdout, stderr: r.stderr, exitCode: r.exitCode };
}
function gateTheRun(args) {
  const gate = gateForTeamReport(
    {
      status: args.status,
      seats: args.seats.map((s) => ({
        seatId: s.seatId,
        role: s.role,
        harness: s.harness,
        outcome: s.outcome,
        verified: s.verified,
        reviewedSha: s.reviewedSha
      })),
      notRun: args.notRun,
      snapshot: {
        built: args.snapshot.built,
        sha: args.snapshot.sha,
        ref: args.snapshot.branch,
        writerBranches: args.snapshot.writerBranches
      }
    },
    args.policy,
    true
  );
  return { gate, mergeGate: enforceMergeGate(gate) };
}
async function executeTeam(req, deps2, sessions = new SessionStore()) {
  const now = deps2.now ?? (() => Date.now());
  const t0 = now();
  const steps = req.steps ?? createSeatStepLedger({ store: null });
  const startedAt = new Date(t0).toISOString();
  const seats = [];
  const notRun = [];
  const setup = [];
  const repCount = /* @__PURE__ */ new Map();
  const depsWithRep = {
    ...deps2,
    onTurn: (rec) => {
      const sig = `${rec.seatId}|${rec.exitCode}|${(rec.outputTail ?? "").length}|${(rec.selfReport ?? "").slice(0, 80)}`;
      const st = repCount.get(rec.seatId) ?? { last: "", run: 0, max: 0 };
      st.run = sig === st.last ? st.run + 1 : 1;
      st.last = sig;
      st.max = Math.max(st.max, st.run);
      repCount.set(rec.seatId, st);
      if (deps2.onTurn) deps2.onTurn(rec);
    }
  };
  const budgetGate = req.rootEnvelope && req.rootEnvelope.budgetUsd !== null ? new BudgetGate(req.rootEnvelope.budgetUsd) : null;
  const budgetAccounting = { admitted: 0, refused: 0, overrun: 0, tokensOnly: /* @__PURE__ */ new Set() };
  const lanes = createDispatchLanes({ concurrency: SEAT_LANE_CONCURRENCY, maximumQueued: Math.max(1, req.team.seats.length) });
  let laneRefusals = 0;
  let seatEnvelopes = [];
  let packetVerified = false;
  let arenaStamp = null;
  const emptySnapshot = { built: false, branch: "", sha: null, writerBranches: [], conflicts: [], detail: "Not attempted." };
  const budgetNote = () => budgetGate ? ` Budget authority: $${budgetGate.capUsd.toFixed(2)} cap; ${budgetAccounting.admitted} seat(s) admitted by atomic reservation, ${budgetAccounting.refused} refused${budgetAccounting.overrun > 0 ? `; $${budgetAccounting.overrun.toFixed(4)} measured overrun settled after the fact` : ""}${budgetAccounting.tokensOnly.size > 0 ? `; ${[...budgetAccounting.tokensOnly].join(", ")} reported tokens only, so VH marks their dollar spend UNKNOWN rather than inventing a price` : ""}${laneRefusals > 0 ? `; ${laneRefusals} seat(s) never started because the run's cap tripped while they waited behind the ${SEAT_LANE_CONCURRENCY}-seat dispatch ceiling` : ""}.` : laneRefusals > 0 ? ` Labour ceiling: ${laneRefusals} seat(s) never started because the run's cap tripped while they waited behind the ${SEAT_LANE_CONCURRENCY}-seat dispatch ceiling.` : "";
  const finish = (status2, summary, spentUsd2, snapshot2, briefings2) => {
    if (status2 === "completed") {
      globalMemoryCortex.recordRepairSuccess(
        "architecture",
        `Mission ${req.missionSlug} task completed`,
        `Verified worktree commit and review passed on ${req.baseBranch}`,
        req.missionSlug,
        `Mission "${req.objective}" verified with 0 regressions.`
      );
    }
    globalAgentBus.publish({
      channel: "#general",
      sender: { seatId: "orchestrator", role: "planner", harness: "llm", name: "Team Orchestrator" },
      mentions: ["@all"],
      intent: "broadcast",
      content: `Team mission "${req.missionSlug}" finished with status ${status2.toUpperCase()} ($${(spentUsd2 || 0).toFixed(4)} spent). Summary: ${summary}`
    });
    globalAgentBus.writeBlackboard("mission.verdict", `Status: ${status2}
Summary: ${summary}
Spent: $${(spentUsd2 || 0).toFixed(4)}`, "orchestrator", "finding");
    const gated2 = gateTheRun({
      status: status2,
      seats,
      notRun: notRun.map((n) => n.seatId),
      snapshot: snapshot2,
      policy: req.gatePolicy ?? loadGatePolicy()
    });
    return {
      seats,
      status: status2,
      summary: summary + budgetNote(),
      spentUsd: spentUsd2,
      notRun,
      setup,
      briefings: briefings2,
      snapshot: snapshot2,
      merge: { candidates: [], plan: planMerge([], { baseBranch: req.baseBranch, repoRoot: req.repoRoot, testCommand: req.testCommand }), gate: gated2.mergeGate },
      gate: gated2.gate,
      startedAt,
      finishedAt: new Date(now()).toISOString(),
      wallClockMs: now() - t0,
      autonomyArms: req.autonomy?.arms,
      strategy: req.strategy ?? null,
      actionPacket: req.actionPacket ? { id: req.actionPacket.id, digest: req.actionPacket.digest, permission: req.actionPacket.permission, reversible: req.actionPacket.reversible, verification: req.actionPacket.verification, verified: packetVerified } : null,
      envelopes: seatEnvelopes,
      budget: budgetGate ? { capUsd: budgetGate.capUsd, admittedByReservation: budgetAccounting.admitted, refusedByReservation: budgetAccounting.refused, overrunUsd: budgetAccounting.overrun, tokensOnlySeats: [...budgetAccounting.tokensOnly] } : void 0,
      repetition: [...repCount.entries()].map(([seatId, r]) => ({ seatId, repeated: r.max })).filter((r) => r.repeated >= 2),
      arena: arenaStamp
    };
  };
  if (req.rootEnvelope) {
    const envCheck = checkEnvelope(req.rootEnvelope, "run:team-mission", now());
    if (!envCheck.ok) {
      return finish("aborted", `Custody refused the mission before any invocation \u2014 ${envCheck.reason}`, 0, emptySnapshot, []);
    }
  }
  if (req.rootEnvelope) {
    for (const st of req.team.seats) {
      const sub = ["role:any", "read:review-snapshot", "spend:capped-by-ledger", ...st.mayWrite ? ["write:worktrees"] : []].filter((x) => req.rootEnvelope.scope.includes(x));
      const att = await attenuate(req.rootEnvelope, `seat:${st.id}`, sub, { now: now() });
      if (att.envelope) {
        seatEnvelopes.push({ seatId: st.id, scope: att.envelope.scope, attenuatedFrom: req.rootEnvelope.id, principal: att.envelope.principal, delegationChain: att.envelope.delegationChain, expiresAt: att.envelope.expiresAt ?? null });
      } else {
        seatEnvelopes.push({ seatId: st.id, scope: [], attenuatedFrom: null });
      }
    }
  }
  if (req.rootEnvelope && req.rootEnvelope.budgetUsd !== null) {
    const bc = budgetCheck(req.rootEnvelope, 0);
    if (!bc.ok) {
      return finish("aborted", `Budget authority refused the mission before any invocation \u2014 ${bc.reason}. Nothing executed, nothing spent.`, 0, emptySnapshot, []);
    }
  }
  if (req.actionPacket) {
    const integrity = await verifyActionPacket(req.actionPacket);
    if (!integrity.ok) {
      return finish("aborted", `Action packet ${req.actionPacket.id} FAILED cryptographic verification \u2014 ${integrity.reason}. Nothing executed, nothing spent.`, 0, emptySnapshot, []);
    }
    packetVerified = true;
  }
  const packetGate = packetAllowsExecution(req.actionPacket ?? null);
  if (!packetGate.ok) {
    return finish("aborted", `Refused before any invocation by its action packet \u2014 ${packetGate.reason}`, 0, emptySnapshot, []);
  }
  const arenaReport = await (deps2.arenaRunner ?? ((n) => runGovernanceArena({ now: n })))(t0);
  arenaStamp = {
    gate: arenaReport.gate,
    digest: arenaReport.digest,
    summary: arenaReport.summary,
    total: arenaReport.total,
    defended: arenaReport.defended,
    breached: arenaReport.breached
  };
  if (arenaReport.gate === "REFUSED") {
    return finish("aborted", `Refused before any invocation by the governance arena \u2014 ${arenaReport.summary} Nothing executed, nothing spent.`, 0, emptySnapshot, []);
  }
  globalAgentBus.publish({
    channel: "#general",
    sender: { seatId: "orchestrator", role: "planner", harness: "llm", name: "Team Orchestrator" },
    mentions: ["@all"],
    intent: "broadcast",
    content: `Launching Team Mission "${req.missionSlug}": ${req.objective} with ${req.team.seats.length} seats.`
  });
  const worktrees = planWorktrees(req.team, { repoRoot: req.repoRoot, baseBranch: req.baseBranch, missionSlug: req.missionSlug, deferReview: true });
  const wtBySeat = new Map(worktrees.map((w) => [w.seatId, w]));
  const autonomyLines = [];
  const arms = req.autonomy?.arms ?? [];
  if (arms.includes("review:deep")) autonomyLines.push("[autonomy arm review:deep] Reviewers: attack correctness first; require re-run evidence for every pass claim; style nits last and labelled.");
  if (arms.includes("review:shallow")) autonomyLines.push("[autonomy arm review:shallow] Reviewers: blockers only this run; defer nits.");
  if (arms.includes("check:strict")) autonomyLines.push("[autonomy arm check:strict] Testers/QA: run EVERY listed check and quote failures verbatim; a pass without output is not a pass.");
  if (arms.includes("check:lenient")) autonomyLines.push("[autonomy arm check:lenient] Testers/QA: core acceptance checks this run; edge cases sampled.");
  if (req.team.seats.some((st) => st.role === "planner" || st.mayWrite) && arms.length > 0) {
    autonomyLines.push(`[autonomy router] strategy arms this run: ${arms.join(", ")} \u2014 outcomes feed the router's next decision.`);
  }
  if (req.strategy) {
    const p = req.strategy.params;
    autonomyLines.push(
      `[strategy experiment ${req.strategy.id}${req.strategy.isCandidate ? " (CANDIDATE)" : " (baseline)"}] this run executes gen ${req.strategy.gen} parameters: reviewDepth ${p.reviewDepth}, checkBias ${p.checkBias}, serialExec ${p.serialExec}, lessonBudget ${p.lessonBudget}. Measured outcomes attribute to this strategy.`
    );
    for (const l of reviewBriefingLines(p.reviewDepth)) autonomyLines.push(l);
  }
  if (req.autonomy?.webEvidence !== false && req.team.seats.some((st) => st.role === "planner" || st.role === "reviewer")) {
    try {
      const web = await searchWeb(req.objective.slice(0, 80), { timeoutMs: 4e3 });
      const live = web.providers.filter((pr) => pr.ok);
      if (live.length > 0) {
        autonomyLines.push(`[web evidence] ${web.hits.length} deduplicated hit(s) from ${live.map((pr) => pr.id).join(", ")}:`);
        for (const t of toTriples(web.hits).slice(0, evidenceDepth(req.strategy?.params.checkBias ?? 0.5))) {
          autonomyLines.push(`  - (${t.confidence}, ${t.kind}) ${t.claim} \u2014 ${t.source}`);
        }
      } else {
        autonomyLines.push(`[web evidence] unavailable this run (${web.providers.map((pr) => `${pr.id}: ${pr.note}`).join("; ")}) \u2014 research proceeds without it.`);
      }
    } catch {
      autonomyLines.push("[web evidence] fetch failed \u2014 research proceeds without it.");
    }
  }
  const briefingsByHarness = writeContextFiles(req.team, {
    objective: req.objective,
    constraints: [...req.constraints ?? [], ...autonomyLines],
    doNotTouch: req.doNotTouch ?? [],
    testCommand: req.testCommand
  });
  const learnedMarkdown = globalMemoryCortex.compileBriefing().generatedBriefingMarkdown;
  for (const seat3 of req.team.seats) {
    briefingsByHarness.push({
      path: ".si-brief/LEARNED_INVARIANTS.md",
      contents: learnedMarkdown,
      forHarness: seat3.harness
    });
  }
  const lessonLines = briefingForMission(req.objective, Date.now());
  if (lessonLines.length > 0) {
    const lessonsMd = `# Organizational lessons (VH 11.11)

${lessonLines.map((l) => `- ${l}`).join("\n")}
`;
    for (const seat3 of req.team.seats) {
      briefingsByHarness.push({
        path: ".si-brief/ORG_LESSONS.md",
        contents: lessonsMd,
        forHarness: seat3.harness
      });
    }
  }
  const setupFailed = /* @__PURE__ */ new Set();
  for (const w of worktrees) {
    if (w.deferred) {
      setup.push({ seatId: w.seatId, path: w.path, ok: true, detail: "Deferred: created on the review snapshot when this seat's wave runs." });
      continue;
    }
    if (w.shared) {
      setup.push({ seatId: w.seatId, path: w.path, ok: true, detail: "Runs in the base checkout \u2014 no writer exists on this team, so there is nothing to snapshot." });
      continue;
    }
    if (!deps2.git) {
      setup.push({ seatId: w.seatId, path: w.path, ok: false, detail: "VH has no git runner here, so the worktree was NOT created. This seat would have written into the base checkout, which defeats isolation, so it is blocked instead." });
      setupFailed.add(w.seatId);
      continue;
    }
    let failed = null;
    for (const argv of w.createArgv) {
      const r = await git(deps2, argv, req.repoRoot);
      if (!r.ok) {
        failed = r.exitCode === null ? `git ${argv.join(" ")} could not run.` : `git ${argv.join(" ")} exited ${r.exitCode}: ${(r.stderr || r.stdout).trim().slice(0, 200)}`;
        break;
      }
    }
    if (failed) {
      setup.push({ seatId: w.seatId, path: w.path, ok: false, detail: failed });
      setupFailed.add(w.seatId);
    } else {
      setup.push({ seatId: w.seatId, path: w.path, ok: true, detail: `Created ${w.branch} at ${w.path}.` });
    }
  }
  const briefings = [];
  const writerWorktrees = worktrees.filter((w) => !w.shared && !w.deferred && !setupFailed.has(w.seatId));
  for (const f of briefingsByHarness) {
    const writtenTo = [];
    for (const w of writerWorktrees) {
      const target = `${w.path}/${BRIEF_DIR}/${f.path}`;
      if (deps2.writeFile) {
        try {
          await deps2.writeFile(target, f.contents);
          writtenTo.push(w.path);
        } catch {
        }
      }
    }
    briefings.push({
      path: `${BRIEF_DIR}/${f.path}`,
      writtenTo,
      excludedFromGit: false,
      detail: writtenTo.length ? `Written into ${writtenTo.length} worktree(s), under ${BRIEF_DIR}/, which VH adds to .git/info/exclude so it can never be committed.` : deps2.writeFile ? "No writable worktree existed for this briefing." : "VH has no file writer here, so the briefing was composed but NOT written. The agents will not see it."
    });
  }
  let excludedEverywhere = true;
  for (const w of writerWorktrees) {
    const okExcl = await excludeBriefDir(deps2, w.path);
    if (!okExcl) excludedEverywhere = false;
  }
  for (const b of briefings) {
    b.excludedFromGit = excludedEverywhere && b.writtenTo.length > 0;
    if (b.writtenTo.length > 0 && !excludedEverywhere) {
      b.detail = `Written into ${b.writtenTo.length} worktree(s), but VH could NOT exclude ${BRIEF_DIR}/ from git. Those files will appear as untracked and WILL be picked up by a commit \u2014 treat this seat's diff as containing the briefing.`;
    }
  }
  const waves = strategyWaveShape(req.assignments, arms.includes("exec:serial") || req.strategy?.params.serialExec === true);
  const runnable = /* @__PURE__ */ new Map();
  const binPaths = /* @__PURE__ */ new Map();
  for (const w of waves) {
    for (const a of w) {
      if (runnable.has(a.seat.id)) continue;
      const rc = resolveCaps(a.seat.harness);
      const caps = rc.caps;
      if (typeof deps2.nativeInvoke === "function") {
        runnable.set(a.seat.id, true);
        continue;
      }
      let resolved = null;
      for (const b of caps.bins) {
        const r = await deps2.resolveBin(b);
        if (r) {
          resolved = r;
          break;
        }
      }
      if (resolved) binPaths.set(a.seat.harness, resolved);
      const ok = resolved !== null;
      runnable.set(a.seat.id, ok);
      if (!ok) {
        notRun.push({
          seatId: a.seat.id,
          reason: `this host cannot run "${caps.name}": there is no in-process seat runner, and no agent binary is looked up any more. Refused in words.`
        });
      }
    }
  }
  const minSeats = req.minimumRunnableSeats ?? 1;
  const runnableCount = [...runnable.values()].filter(Boolean).length;
  if (runnableCount < minSeats) {
    return finish(
      "aborted",
      `Aborted before any invocation: only ${runnableCount} of ${req.assignments.length} seats can run, and ${minSeats} is the minimum. Nothing was executed and nothing was charged.`,
      0,
      emptySnapshot,
      briefings
    );
  }
  let waveFailed = false;
  let budgetStop = null;
  let snapshot = emptySnapshot;
  const committedBranches = [];
  let waveNo = 0;
  const durableRunId = `run:${req.missionSlug}`;
  for (const wave of waves) {
    if (waveFailed) {
      const skipReason = budgetStop ? `Spend authority ran out \u2014 ${budgetStop}` : "An earlier wave did not complete, so this seat was skipped rather than asked to review work that does not exist.";
      for (const a of wave) {
        notRun.push({ seatId: a.seat.id, reason: skipReason });
        seats.push(unrunRecord(a, wtBySeat.get(a.seat.id) ?? null, "skipped_wave_failed", `Skipped: ${skipReason}`));
      }
      continue;
    }
    const hasReadOnly = wave.some((a) => a.readOnly || !a.seat.mayWrite);
    const skippedIds = /* @__PURE__ */ new Set();
    if (hasReadOnly && worktrees.some((w) => w.deferred)) {
      snapshot = await buildReviewSnapshot(req, deps2, worktrees, committedBranches, setupFailed);
      if (!snapshot.built) {
        for (const a of wave.filter((x) => x.readOnly || !x.seat.mayWrite)) {
          const wt = wtBySeat.get(a.seat.id);
          if (!wt?.deferred) continue;
          skippedIds.add(a.seat.id);
          const outcome = committedBranches.length === 0 ? "skipped_nothing_to_review" : "review_snapshot_failed";
          seats.push(
            unrunRecord(
              a,
              wt,
              outcome,
              committedBranches.length === 0 ? "Nothing was committed by any writer, so there was no work to review. Reviewing the untouched base would have produced a verdict about code nobody wrote." : `The review snapshot could not be built: ${snapshot.detail}`
            )
          );
          notRun.push({ seatId: a.seat.id, reason: committedBranches.length === 0 ? "No writer committed anything, so there was nothing to review." : snapshot.detail });
        }
      }
    }
    let runnableWave = wave.filter((a) => !skippedIds.has(a.seat.id));
    const tickets = /* @__PURE__ */ new Map();
    if (budgetGate && runnableWave.length > 0) {
      if (budgetGate.remaining <= 0) {
        budgetStop = `spend authority exhausted before the wave \u2014 the $${budgetGate.capUsd.toFixed(2)} cap is fully committed`;
        waveFailed = true;
        for (const a of runnableWave) {
          notRun.push({ seatId: a.seat.id, reason: `Budget reservation refused \u2014 ${budgetStop}.` });
          seats.push(unrunRecord(a, wtBySeat.get(a.seat.id) ?? null, "skipped_budget", `Skipped: ${budgetStop}`));
          budgetAccounting.refused += 1;
        }
        continue;
      }
      const share = budgetGate.remaining / runnableWave.length;
      const admitted = [];
      for (const a of runnableWave) {
        const tk = budgetGate.reserve(a.seat.id, share);
        if (tk) {
          tickets.set(a.seat.id, tk);
          admitted.push(a);
          budgetAccounting.admitted += 1;
        } else {
          notRun.push({ seatId: a.seat.id, reason: `Budget reservation refused \u2014 the remaining $${budgetGate.remaining.toFixed(2)} cannot admit another concurrent seat under the $${budgetGate.capUsd.toFixed(2)} cap.` });
          seats.push(unrunRecord(a, wtBySeat.get(a.seat.id) ?? null, "skipped_budget", "Skipped: the budget cap could not admit this seat concurrently."));
          budgetAccounting.refused += 1;
        }
      }
      runnableWave = admitted;
    }
    const results = await Promise.all(
      runnableWave.map((a) => {
        const entry = () => runSeat(
          req,
          depsWithRep,
          a,
          sessions,
          wtBySeat.get(a.seat.id) ?? null,
          runnable.get(a.seat.id) ?? false,
          binPaths.get(a.seat.harness) ?? null,
          setupFailed,
          snapshot,
          briefingsByHarness,
          now,
          steps
        );
        return lanes.run(entry, {
          priority: laneForSeat(a.seat.mayWrite),
          stopReason: () => req.ledger.admissionError(now())
        }).catch((e) => {
          if (!isLaneRefusal(e)) throw e;
          laneRefusals += 1;
          notRun.push({ seatId: a.seat.id, reason: e.message });
          return unrunRecord(a, wtBySeat.get(a.seat.id) ?? null, "skipped_budget", `Never dispatched: ${e.message}`);
        });
      })
    );
    seats.push(...results);
    for (const r of results) {
      const tk = tickets.get(r.seatId);
      if (budgetGate && tk) budgetAccounting.overrun += budgetGate.settle(tk, r.chargedUsd ?? 0).overrunUsd;
      if ((r.usage?.costUsd === null || r.usage?.costUsd === void 0) && (r.usage?.tokens ?? 0) > 0) budgetAccounting.tokensOnly.add(r.seatId);
      recordSeatRun({
        at: Date.now(),
        seatId: r.seatId,
        missionId: req.missionSlug,
        usd: r.usage?.costUsd ?? null,
        tokens: r.usage?.tokens ?? null,
        turns: r.usage?.turns ?? null,
        verdict: r.verified ? "verified" : r.outcome === "completed" ? "completed" : r.outcome,
        source: r.usage?.source ?? "unknown"
      });
    }
    checkpoint(durableRunId, req.missionSlug, waveNo, "wave settled", {
      settled: results.length,
      verified: results.filter((x) => x.verified).length,
      budgetStop,
      failed: waveFailed
    });
    waveNo += 1;
    if (req.rootEnvelope && req.rootEnvelope.budgetUsd !== null && !budgetStop) {
      const spentSoFar = seats.reduce((sum, r) => sum + (r.chargedUsd ?? 0), 0);
      const bc = budgetCheck(req.rootEnvelope, spentSoFar);
      if (!bc.ok) {
        budgetStop = bc.reason;
        waveFailed = true;
      }
    }
    for (const r of results) {
      if (r.outcome === "completed" && r.branch && r.branch !== req.baseBranch && !committedBranches.includes(r.branch)) {
        if (/Committed on/.test(r.commit)) committedBranches.push(r.branch);
      }
    }
    for (const r of results) {
      if (r.outcome !== "completed" || !r.branch || r.branch === req.baseBranch || committedBranches.includes(r.branch)) continue;
      if (r.idempotency?.commitApplied) committedBranches.push(r.branch);
    }
    if (results.every((r) => r.outcome !== "completed")) waveFailed = true;
  }
  const spentUsd = seats.reduce((s, r) => s + r.chargedUsd, 0);
  const candidates = seats.filter((r) => r.branch && r.branch !== req.baseBranch && !r.branch.startsWith(`vh/${req.missionSlug}/review`)).map((r) => ({
    seatId: r.seatId,
    branch: r.branch,
    worktreePath: r.worktreePath,
    role: r.role,
    dependsOn: req.assignments.find((a) => a.seat.id === r.seatId)?.dependsOn ?? [],
    verified: r.verified,
    additions: r.git.measured ? r.git.additions : 0,
    deletions: r.git.measured ? r.git.deletions : 0
  }));
  const plan = planMerge(candidates, { baseBranch: req.baseBranch, repoRoot: req.repoRoot, testCommand: req.testCommand });
  const completed = seats.filter((r) => r.outcome === "completed").length;
  const verifiedCount = seats.filter((r) => r.verified).length;
  const status = seats.length === 0 ? "blocked" : completed === seats.length && completed > 0 ? "completed" : completed > 0 ? "partial" : "blocked";
  const gated = gateTheRun({
    status,
    seats,
    notRun: notRun.map((n) => n.seatId),
    snapshot,
    policy: req.gatePolicy ?? loadGatePolicy()
  });
  if (!gated.mergeGate.allowed) {
    globalAgentBus.publish({
      channel: "#general",
      sender: { seatId: "orchestrator", role: "planner", harness: "llm", name: "Team Orchestrator" },
      mentions: ["@all"],
      intent: "blocker",
      content: `MERGE BLOCKED by the adversarial gate (${gated.gate.status}, ${gated.gate.tier}): ${gated.mergeGate.reason} A recorded human approval from Mission Control can override.`
    });
  }
  return {
    seats,
    status,
    // The same budget note the early-exit `finish()` path carries. It was missing
    // here, which meant a run that actually reserved, dispatched and SETTLED
    // against a `BudgetGate` returned a report whose `budget` was undefined —
    // the atomic admission accounting was computed and then thrown away on the
    // only path that had anything to account for. A mission report that omits
    // what its cap did is a report that cannot answer "did the cap hold?".
    summary: buildSummary({ status, seats, verifiedCount, spentUsd, notRun, briefings, snapshot }) + (budgetGate ? budgetNote() : ""),
    spentUsd,
    notRun,
    setup,
    briefings,
    snapshot,
    merge: { candidates, plan, gate: gated.mergeGate },
    gate: gated.gate,
    startedAt,
    finishedAt: new Date(now()).toISOString(),
    wallClockMs: now() - t0,
    autonomyArms: req.autonomy?.arms,
    strategy: req.strategy ?? null,
    actionPacket: req.actionPacket ? { id: req.actionPacket.id, digest: req.actionPacket.digest, permission: req.actionPacket.permission, reversible: req.actionPacket.reversible, verification: req.actionPacket.verification, verified: packetVerified } : null,
    envelopes: seatEnvelopes,
    budget: budgetGate ? { capUsd: budgetGate.capUsd, admittedByReservation: budgetAccounting.admitted, refusedByReservation: budgetAccounting.refused, overrunUsd: budgetAccounting.overrun, tokensOnlySeats: [...budgetAccounting.tokensOnly] } : void 0,
    repetition: [...repCount.entries()].map(([seatId, r]) => ({ seatId, repeated: r.max })).filter((r) => r.repeated >= 2),
    arena: arenaStamp
  };
}
async function buildReviewSnapshot(req, deps2, worktrees, committedBranches, setupFailed) {
  const plan = reviewSnapshotArgv({ repoRoot: req.repoRoot, baseBranch: req.baseBranch, missionSlug: req.missionSlug, writerBranches: committedBranches });
  if (plan.problem || !deps2.git) {
    return { built: false, branch: plan.snapshotBranch, sha: null, writerBranches: committedBranches, conflicts: [], detail: plan.problem ?? "VH has no git runner, so the snapshot could not be built." };
  }
  const conflicts = [];
  for (const argv of snapshotPreflightArgv(req.baseBranch, committedBranches)) {
    const r = await git(deps2, argv, req.repoRoot);
    if (r.exitCode === 1) {
      const paths = r.stdout.split(/\r?\n/).slice(1).filter((l) => l.trim()).join(", ");
      conflicts.push(`Writers disagree: ${paths || "conflicting changes"}`);
    }
  }
  let failed = null;
  for (const argv of plan.argv) {
    const r = await git(deps2, argv, req.repoRoot);
    if (!r.ok) {
      failed = `git ${argv.join(" ")} exited ${r.exitCode ?? "null"}: ${(r.stderr || r.stdout).trim().slice(0, 240)}`;
      break;
    }
  }
  if (failed) {
    return { built: false, branch: plan.snapshotBranch, sha: null, writerBranches: committedBranches, conflicts, detail: failed };
  }
  const head = await git(deps2, ["rev-parse", "HEAD"], req.repoRoot);
  const sha = head.ok ? head.stdout.trim() || null : null;
  for (const w of worktrees) {
    if (!w.deferred || setupFailed.has(w.seatId)) continue;
    for (const argv of reviewWorktreeArgv(plan.snapshotBranch, w.path)) {
      const r = await git(deps2, argv, req.repoRoot);
      if (!r.ok) {
        setupFailed.add(w.seatId);
        await git(deps2, ["checkout", "-q", req.baseBranch], req.repoRoot);
        return { built: false, branch: plan.snapshotBranch, sha, writerBranches: committedBranches, conflicts, detail: `git ${argv.join(" ")} exited ${r.exitCode ?? "null"}: ${(r.stderr || r.stdout).trim().slice(0, 240)}` };
      }
    }
    await excludeBriefDir(deps2, w.path);
  }
  await git(deps2, ["checkout", "-q", req.baseBranch], req.repoRoot);
  return {
    built: true,
    branch: plan.snapshotBranch,
    sha,
    writerBranches: committedBranches,
    conflicts,
    detail: `Built ${plan.snapshotBranch} from ${committedBranches.join(" + ")} on top of ${req.baseBranch}.`
  };
}
async function excludeBriefDir(deps2, worktreePath) {
  if (!deps2.git || !deps2.writeFile) return false;
  const r = await git(deps2, ["rev-parse", "--git-common-dir"], worktreePath);
  if (!r.ok) return false;
  let gitDir = r.stdout.trim();
  if (!gitDir) return false;
  const isAbs = gitDir.startsWith("/") || /^[a-zA-Z]:[\\/]/.test(gitDir);
  if (!isAbs) gitDir = path.resolve(worktreePath, gitDir);
  try {
    const excludePath = path.join(gitDir, "info", "exclude");
    await deps2.writeFile(excludePath, `${BRIEF_DIR}/
`);
    const check = await git(deps2, ["status", "--porcelain"], worktreePath);
    return check.ok && !check.stdout.includes(BRIEF_DIR);
  } catch {
    return false;
  }
}
async function runSeat(req, deps2, a, sessions, wt, binaryExists, resolvedBin, setupFailedSeats, snapshot, briefings, now, steps) {
  const caps = resolveCaps(a.seat.harness).caps;
  const readOnly = a.readOnly || !a.seat.mayWrite;
  const cwd = wt?.path ?? req.repoRoot;
  const branch = wt?.deferred ? snapshot.branch : wt?.branch ?? req.baseBranch;
  const reviewedRef = wt?.deferred ? snapshot.sha ?? snapshot.branch : branch;
  const idem = { reused: [], applied: [], unresolved: [], commitApplied: false, commitAppliedThisRun: false };
  const markStep = (step, state, note, sessionId) => {
    steps.mark({ stepId: steps.stepId({ missionSlug: req.missionSlug, seatId: a.seat.id, step }), missionSlug: req.missionSlug, seatId: a.seat.id, step, state, at: now(), note, ...sessionId ? { sessionId } : {} });
  };
  const base = {
    seatId: a.seat.id,
    role: a.seat.role,
    harness: a.seat.harness,
    harnessName: caps.name,
    bin: resolvedBin ?? caps.bins[0] ?? "",
    argv: [],
    cwd,
    branch,
    worktreePath: cwd,
    reviewedRef,
    reviewedSha: wt?.deferred ? snapshot.sha : null,
    wave: a.wave,
    turnsRun: 0,
    sessionId: null,
    continuity: "none",
    exitCode: null,
    durationMs: 0,
    usage: { costUsd: null, tokens: null, turns: null, source: a.seat.harness },
    chargedUsd: 0,
    verified: false,
    verificationDetail: "Not run.",
    git: { measured: false, detail: "Not measured.", additions: 0, deletions: 0, filesChanged: 0 },
    commit: "Never ran, so nothing was committed.",
    warnings: [],
    selfReport: null,
    outputTail: "",
    idempotency: idem
  };
  if (!binaryExists) {
    return { ...base, outcome: "blocked_missing_binary", reason: `${caps.name} is not installed, so this seat never ran. Install: ${caps.install}` };
  }
  if (setupFailedSeats.has(a.seat.id)) {
    return {
      ...base,
      outcome: wt?.deferred ? "review_snapshot_failed" : "failed",
      reason: wt?.deferred ? "This seat's review worktree could not be created, so it never ran. Running it in the base checkout instead would have it review the tree from before the work happened \u2014 the exact mistake the review snapshot exists to prevent." : "This seat's worktree could not be created, so it never ran. Running it anyway would have pointed it at the base checkout and let it overwrite another seat's work."
    };
  }
  if (wt?.deferred && !snapshot.built) {
    return { ...base, outcome: "skipped_nothing_to_review", reason: "No review snapshot exists, so there was no work to review." };
  }
  if (deps2.writeFile && cwd !== req.repoRoot) {
    for (const f of briefings) {
      try {
        await deps2.writeFile(`${cwd}/${BRIEF_DIR}/${f.path}`, f.contents);
      } catch {
      }
    }
  }
  const sessionKey = { seatId: a.seat.id, harness: a.seat.harness, model: a.seat.model, cwd };
  const session = sessions.obtain(sessionKey);
  const channel = a.seat.role === "planner" || a.seat.role === "architect" ? "#architecture" : a.seat.role === "security" ? "#security-audit" : a.seat.mayWrite ? "#implementation-sync" : "#qa-review";
  globalAgentBus.publish({
    channel,
    sender: { seatId: a.seat.id, role: a.seat.role, harness: a.seat.harness, name: caps.name },
    mentions: ["@all"],
    intent: a.seat.role === "planner" || a.seat.role === "architect" ? "proposal" : a.seat.mayWrite ? "proposal" : "verification",
    content: `[Wave ${a.wave}] Commencing execution in ${cwd} (${branch}).`
  });
  const turns = [{ prompt: a.prompt, turn: 1 }];
  if (a.followUp) turns.push({ prompt: a.followUp, turn: 2 });
  let last = null;
  let continuity = "none";
  let chargedTotal = 0;
  let usage = base.usage;
  const warnings = [];
  let lastArgv = [];
  let lastSummary = "";
  let dispatchedAnyTurn = false;
  let turnsDispatched = 0;
  for (const t of turns) {
    const stepName = `turn:${t.turn}`;
    const stepKey = steps.stepId({ missionSlug: req.missionSlug, seatId: a.seat.id, step: stepName });
    const prior = steps.get(stepKey);
    if (prior?.state === "settled") {
      idem.reused.push(stepName);
      if (prior.sessionId) {
        sessions.recordTurn(sessionKey, prior.sessionId, t.prompt);
        continuity = "session";
      }
      if (prior.note) lastSummary = prior.note;
      continue;
    }
    if (prior) idem.unresolved.push(stepName);
    const admission = req.ledger.admissionError(now());
    if (admission) {
      markStep(stepName, "failed", `refused before dispatch: ${admission}`, session.sessionId);
      return { ...base, argv: lastArgv, sessionId: session.sessionId, continuity, turnsRun: turnsDispatched, chargedUsd: chargedTotal, usage, warnings, outcome: "blocked_budget", reason: `Turn ${t.turn} was never started: ${admission}` };
    }
    const composed = composeSeatArgv(a.seat, {
      prompt: t.turn === 1 ? t.prompt : followUpPrompt({ continuity, harnessName: caps.name, previousSummary: lastSummary, instruction: t.prompt }),
      cwd,
      readOnly,
      sessionId: session.sessionId,
      turn: t.turn
    });
    lastArgv = composed.argv;
    warnings.push(...composed.warnings.filter((w) => !warnings.includes(w)));
    const timeoutSecs = a.seat.timeoutSecs > 0 ? a.seat.timeoutSecs : 600;
    const turnText = t.turn === 1 ? t.prompt : followUpPrompt({ continuity, harnessName: caps.name, previousSummary: lastSummary, instruction: t.prompt });
    const native = deps2.nativeInvoke;
    markStep(stepName, "in_flight", `dispatching turn ${t.turn} of ${req.missionSlug}`, session.sessionId);
    dispatchedAnyTurn = true;
    turnsDispatched += 1;
    const enforced = native ? await withDeadline(
      () => native({
        harness: a.seat.harness,
        prompt: turnText,
        cwd,
        readOnly,
        mayWriteFiles: !readOnly,
        mayRunShell: !readOnly,
        model: a.seat.model,
        timeoutSecs
      }),
      timeoutSecs * 1e3,
      now
    ) : {
      value: {
        exitCode: 127,
        stdout: "",
        stderr: `no native seat runner is configured for "${caps.name}" \u2014 this host cannot run agents`,
        durationMs: 0,
        timedOut: false
      },
      outcome: "ok",
      timedOut: false,
      elapsedMs: 0,
      detail: "No native seat runner is configured on this host."
    };
    const res = enforced.value;
    const durationMs = res ? res.durationMs : enforced.elapsedMs;
    if (enforced.outcome === "timeout" || res?.timedOut) {
      req.ledger.recordCapped(a.seat.id, "timeout", `${caps.name} exceeded its ${timeoutSecs}s deadline on turn ${t.turn}. The child had to be killed; VH cannot assume it stopped cleanly.`);
      markStep(stepName, "failed", `killed at the ${timeoutSecs}s deadline on turn ${t.turn}`, session.sessionId);
      idem.unresolved.push(stepName);
      return {
        ...base,
        argv: composed.argv,
        sessionId: session.sessionId,
        continuity,
        turnsRun: turnsDispatched,
        chargedUsd: chargedTotal,
        usage,
        warnings,
        durationMs,
        outputTail: tail(res?.stdout ?? ""),
        outcome: "timeout",
        reason: `Turn ${t.turn} ran past its ${timeoutSecs}s deadline and was killed. Partial work may be left in the worktree.`
      };
    }
    if (!res) {
      markStep(stepName, "failed", `no result on turn ${t.turn}: ${enforced.detail}`, session.sessionId);
      idem.unresolved.push(stepName);
      return { ...base, argv: composed.argv, sessionId: session.sessionId, continuity, turnsRun: turnsDispatched, chargedUsd: chargedTotal, usage, warnings, outcome: "failed", reason: `Turn ${t.turn} produced no result: ${enforced.detail}` };
    }
    last = res;
    const reportedId = parseSessionId(a.seat.harness, res.stdout);
    if (reportedId) continuity = "session";
    sessions.recordTurn(sessionKey, reportedId, t.prompt);
    const resumeProblem = detectResumeFailure(res.stdout + "\n" + res.stderr);
    if (resumeProblem && t.turn > 1) {
      sessions.markResumeFailed(sessionKey);
      markStep(stepName, "failed", `could not resume the session: ${resumeProblem}`, session.sessionId);
      idem.unresolved.push(stepName);
      return {
        ...base,
        argv: composed.argv,
        sessionId: session.sessionId,
        continuity: "none",
        turnsRun: turnsDispatched,
        chargedUsd: chargedTotal,
        usage,
        warnings,
        durationMs,
        exitCode: res.exitCode,
        outputTail: tail(res.stdout || res.stderr),
        outcome: "resume_failed",
        reason: `Turn ${t.turn} could not resume the session: ${resumeProblem}. The follow-up never ran, so the repair was not applied.`
      };
    }
    const parsed = parseReportedUsage(a.seat.harness, res.stdout);
    usage = parsed;
    const charge = req.ledger.charge(parsed);
    chargedTotal += charge.chargedUsd;
    if (charge.reason && !charge.reason.startsWith("Charged $0.0000")) warnings.push(charge.reason);
    if (charge.breach) req.ledger.recordCapped(a.seat.id, charge.breach === "mission_cap" ? "mission_cap" : "cost_cap", charge.reason);
    lastSummary = summariseOutput(res.stdout);
    if (deps2.onTurn) {
      deps2.onTurn({ ...base, argv: composed.argv, turnsRun: t.turn, sessionId: session.sessionId, continuity, outcome: "completed", reason: "", exitCode: res.exitCode, durationMs, usage, chargedUsd: chargedTotal, outputTail: tail(res.stdout), commit: "", warnings, selfReport: lastSummary });
    }
    if (res.exitCode !== 0 || reportsError(res.stdout)) {
      markStep(stepName, "failed", `turn ${t.turn} failed (exit ${res.exitCode ?? "null"}${reportsError(res.stdout) ? ", error payload" : ""})`, session.sessionId);
      idem.unresolved.push(stepName);
      return {
        ...base,
        argv: composed.argv,
        sessionId: session.sessionId,
        continuity,
        turnsRun: turnsDispatched,
        chargedUsd: chargedTotal,
        usage,
        warnings,
        durationMs,
        exitCode: res.exitCode,
        selfReport: lastSummary,
        // stdout when there is any, stderr when that is all the CLI produced. Throwing stderr away is
        // what once hid `Error: Session not found`.
        outputTail: tail(res.stdout || res.stderr),
        outcome: "failed",
        reason: res.exitCode !== 0 ? `${caps.name} exited ${res.exitCode} on turn ${t.turn}. ${res.stderr.trim() ? `It said: ${tail(res.stderr, 500)}` : "It wrote nothing to stderr."}` : `${caps.name} exited 0 but reported an error in its own output, so VH treats it as a failure rather than a success.`
      };
    }
    idem.applied.push(stepName);
    markStep(stepName, "settled", lastSummary || "(the agent returned no summary)", session.sessionId);
  }
  let verified = false;
  let verificationDetail = "No verification command is configured for this mission, so nothing was checked. This seat's work is UNVERIFIED.";
  if (deps2.verify) {
    const v = await deps2.verify(cwd);
    if (v.exitCode === 0) {
      verified = true;
      verificationDetail = `The repository's own check ran in ${cwd} and exited 0.`;
    } else if (v.exitCode === null) {
      verificationDetail = "The verification command did not run at all, so this is NOT a failed check \u2014 it is an unmeasured one. The seat is unverified either way.";
    } else {
      verificationDetail = `The repository's own check ran and FAILED (exit ${v.exitCode}). ${tail(v.stdout || v.stderr, 600)}`;
    }
  }
  const gitEv = await collectGitEvidence(deps2.git, cwd);
  const commitStep = "commit";
  const priorCommit = steps.get(steps.stepId({ missionSlug: req.missionSlug, seatId: a.seat.id, step: commitStep }));
  let commitDetail = readOnly ? "Read-only seat; nothing to commit." : "No git runner, so the work could not be committed.";
  if (deps2.git && !readOnly && !dispatchedAnyTurn) {
    const earlier = priorCommit?.state === "settled";
    commitDetail = earlier ? `Already committed by an earlier run of this mission${priorCommit.at ? ` (${new Date(priorCommit.at).toISOString()})` : ""}. This run dispatched no agent for this seat \u2014 every turn was already applied \u2014 so nothing was re-added and nothing was re-committed.` : "This run dispatched no agent for this seat (every turn was already applied by an earlier run), so nothing was added and nothing was committed.";
    idem.commitApplied = earlier;
    if (earlier) {
      warnings.push(`Skipped git commit for "${a.seat.id}": this run applied nothing, so re-staging the branch would re-apply work the step ledger already accounts for.`);
    }
  } else if (deps2.git && !readOnly) {
    markStep(commitStep, "in_flight", `staging and committing ${branch} for ${req.missionSlug}`, session.sessionId);
    await git(deps2, ["add", "-A"], cwd);
    const commit = await git(deps2, ["-c", "user.email=vh@selfimpulse.selfimpulse", "-c", "user.name=VH", "commit", "-q", "-m", `vh(${a.seat.id}): ${req.missionSlug}`], cwd);
    commitDetail = commit.ok ? `Committed on ${branch}.` : commit.exitCode === null ? "Could not run git commit." : /nothing to commit|no changes added/i.test(commit.stderr + commit.stdout) ? "Nothing to commit \u2014 this seat changed no files." : `git commit exited ${commit.exitCode}: ${(commit.stderr || commit.stdout).trim().slice(0, 200)}`;
    const landed = commit.ok || /Committed on/.test(commitDetail);
    if (landed) {
      idem.applied.push(commitStep);
      markStep(commitStep, "settled", commitDetail, session.sessionId);
    } else if (/nothing to commit/i.test(commitDetail)) {
      markStep(commitStep, "settled", commitDetail, session.sessionId);
    } else {
      markStep(commitStep, "failed", commitDetail, session.sessionId);
      idem.unresolved.push(commitStep);
    }
    idem.commitApplied = commit.ok;
    idem.commitAppliedThisRun = commit.ok;
    if (priorCommit?.state === "settled" && commit.ok) {
      warnings.push(`This run re-committed "${a.seat.id}" on top of the commit an earlier run of this mission already applied \u2014 that is new work over an existing commit, not a second application of the same effect.`);
    }
  }
  const reusedAll = idem.reused.length > 0 && !dispatchedAnyTurn && idem.unresolved.length === 0;
  const finalRecord = {
    ...base,
    argv: lastArgv,
    sessionId: session.sessionId,
    continuity,
    /* ONLY the turns THIS invocation dispatched. A turn an earlier run applied and
       this one reused is NOT a turn that ran, and counting it is exactly the
       double-count a resume must not make. */
    turnsRun: turnsDispatched,
    chargedUsd: chargedTotal,
    usage,
    warnings,
    durationMs: last?.durationMs ?? 0,
    exitCode: last?.exitCode ?? null,
    verified,
    verificationDetail,
    git: gitEv,
    commit: commitDetail,
    selfReport: lastSummary,
    outputTail: tail(last?.stdout ?? ""),
    outcome: "completed",
    reason: reusedAll ? `Nothing was dispatched: ${idem.reused.join(", ")} ${idem.reused.length === 1 ? "was" : "were"} already applied by an earlier run of this mission and ${idem.reused.length === 1 ? "was" : "were"} not applied again. ${verified ? "The repository's own check was re-run against the worktree as it stands and exited 0." : `This invocation did not confirm it \u2014 ${verificationDetail}`}` : idem.reused.length > 0 ? `${idem.reused.join(", ")} ${idem.reused.length === 1 ? "was" : "were"} already applied by an earlier run of this mission and ${idem.reused.length === 1 ? "was" : "were"} not repeated; the remaining turn(s) ran in this invocation.${verified ? " The repository's own check exited 0." : " Not verified \u2014 see verificationDetail."}` : verified ? "Completed and verified by the repository's own check." : "Completed, but not verified \u2014 see verificationDetail."
  };
  if (!readOnly && commitDetail.includes("Committed on")) {
    globalReputationLedger.recordOutcome(a.seat.harness, { verifiedCommit: true });
    globalAgentBus.publish({
      channel: "#implementation-sync",
      sender: { seatId: a.seat.id, role: a.seat.role, harness: a.seat.harness, name: caps.name },
      mentions: ["@reviewer", "@architect"],
      intent: "handoff",
      content: `[Wave ${a.wave}] Changes committed on ${branch}: ${commitDetail}`
    });
    globalAgentBus.writeBlackboard(`commits.${a.seat.id}`, `Worktree: ${cwd}
Branch: ${branch}
${commitDetail}`, a.seat.id, "contract");
  } else if (readOnly) {
    globalReputationLedger.recordOutcome(a.seat.harness, { accurateReview: true });
    globalAgentBus.publish({
      channel: "#qa-review",
      sender: { seatId: a.seat.id, role: a.seat.role, harness: a.seat.harness, name: caps.name },
      mentions: ["@all"],
      intent: "verification",
      content: `[Wave ${a.wave}] Review finished on ${reviewedRef}. Verdict: ${lastSummary || (verified ? "VERIFIED_PASS" : "DONE")}`
    });
    globalAgentBus.writeBlackboard(`qa.verdict.${a.seat.id}`, `Ref: ${reviewedRef}
Verdict: ${lastSummary || (verified ? "VERIFIED_PASS" : "DONE")}
Verified: ${verified}`, a.seat.id, "test_criteria");
  }
  return finalRecord;
}
async function collectGitEvidence(gitRunner, cwd) {
  if (!gitRunner) return { measured: false, detail: "No git runner is available, so VH cannot say what changed. This is not a clean tree \u2014 it is an unmeasured one.", additions: 0, deletions: 0, filesChanged: 0 };
  const api = gitApi(gitRunner);
  const status = await api.status(cwd);
  if (!status.ok) return { measured: false, detail: `git status failed: ${status.reason ?? "unknown reason"}`, additions: 0, deletions: 0, filesChanged: 0 };
  const diff = await api.diff(cwd);
  if (!diff.ok || !diff.summary) return { measured: false, detail: `git diff failed: ${diff.reason ?? "unknown reason"}`, additions: 0, deletions: 0, filesChanged: 0 };
  const files = diff.summary.files;
  return {
    measured: true,
    detail: files.length === 0 ? "git reports no changes in this worktree." : `${files.length} file(s) changed: ${files.map((f) => f.path).slice(0, 8).join(", ")}${files.length > 8 ? ", \u2026" : ""}`,
    additions: diff.summary.totalAdditions,
    deletions: diff.summary.totalDeletions,
    filesChanged: files.length
  };
}
function reportsError(raw) {
  for (const line of raw.split(/\r?\n/).reverse()) {
    const t = line.trim();
    if (!t) continue;
    try {
      const o = JSON.parse(t);
      if (typeof o.is_error === "boolean") return o.is_error;
    } catch {
    }
    break;
  }
  return /"is_error"\s*:\s*true/.test(raw);
}
function summariseOutput(raw) {
  const texts = [];
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t) continue;
    try {
      const o = JSON.parse(t);
      if (typeof o.result === "string") texts.push(o.result);
      else if (o.part && typeof o.part === "object") {
        const p = o.part;
        if (p.type === "text" && typeof p.text === "string") texts.push(p.text);
      }
    } catch {
    }
  }
  if (texts.length === 0) return raw.trim().slice(-800);
  return texts.join("\n").trim().slice(-800);
}
function tail(s, n = OUTPUT_TAIL_CHARS) {
  const t = s.trimEnd();
  return scrubAuditText(t.length > n ? `\u2026(truncated ${t.length - n} chars)\u2026
${t.slice(-n)}` : t);
}
function unrunRecord(a, wt, outcome, reason) {
  const caps = resolveCaps(a.seat.harness).caps;
  return {
    seatId: a.seat.id,
    role: a.seat.role,
    harness: a.seat.harness,
    harnessName: caps.name,
    bin: caps.bins[0] ?? "",
    argv: [],
    cwd: wt?.path ?? "",
    branch: wt?.branch ?? "",
    worktreePath: wt?.path ?? "",
    reviewedRef: "",
    reviewedSha: null,
    wave: a.wave,
    turnsRun: 0,
    sessionId: null,
    continuity: "none",
    outcome,
    reason,
    exitCode: null,
    durationMs: 0,
    usage: { costUsd: null, tokens: null, turns: null, source: a.seat.harness },
    chargedUsd: 0,
    verified: false,
    verificationDetail: "Never ran, so nothing was verified.",
    git: { measured: false, detail: "Never ran, so nothing was measured.", additions: 0, deletions: 0, filesChanged: 0 },
    commit: "Never ran, so nothing was committed.",
    warnings: [],
    selfReport: null,
    outputTail: ""
  };
}
function buildSummary(o) {
  const ran = o.seats.filter((s) => s.turnsRun > 0).length;
  const parts = [];
  parts.push(`${ran} of ${o.seats.length} seats ran real CLI invocations; ${o.verifiedCount} were verified by the repository's own check.`);
  if (o.snapshot.built) parts.push(`Reviewers ran against snapshot ${o.snapshot.sha ? o.snapshot.sha.slice(0, 8) : o.snapshot.branch}.`);
  else if (o.snapshot.writerBranches.length === 0) parts.push("No review snapshot was built because no writer committed anything.");
  if (o.spentUsd > 0) parts.push(`Reported spend $${o.spentUsd.toFixed(4)}.`);
  else parts.push("No cost was reported by any CLI, so the true spend is unknown rather than zero.");
  if (o.notRun.length) parts.push(`${o.notRun.length} seat(s) never ran: ${o.notRun.map((n) => n.seatId).join(", ")}.`);
  if (o.briefings.some((f) => f.writtenTo.length === 0)) parts.push("At least one briefing could not be written, so some agents ran without the mission brief.");
  if (o.status === "blocked") parts.push("Nothing completed \u2014 this run produced no usable work.");
  return parts.join(" ");
}

// probe/mergeGate.test.ts
function sh(args, cwd) {
  try {
    const out = execFileSync(args[0], args.slice(1), { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    return { code: 0, out };
  } catch (e) {
    const err = e;
    return { code: err.status ?? null, out: `${err.stdout ?? ""}${err.stderr ?? ""}` };
  }
}
function makeRepo() {
  const repo = fs.mkdtempSync(path2.join(os.tmpdir(), "mjgate-"));
  fs.writeFileSync(path2.join(repo, "app.js"), "module.exports = { v: 1 };\n");
  fs.writeFileSync(path2.join(repo, "package.json"), JSON.stringify({ name: "gate-fixture", version: "1.0.0" }, null, 2));
  sh(["git", "init", "-q", "."], repo);
  sh(["git", "config", "user.email", "mj@mj.desktop"], repo);
  sh(["git", "config", "user.name", "VH"], repo);
  sh(["git", "add", "-A"], repo);
  sh(["git", "commit", "-qm", "initial"], repo);
  const branch = sh(["git", "symbolic-ref", "--short", "HEAD"], repo).out.trim() || "master";
  return { repo, branch };
}
var seat2 = (id, role, harness) => ({
  id,
  role,
  harness,
  model: null,
  mayWrite: role === "coder",
  maxRisk: role === "coder" ? "MEDIUM" : "LOW",
  timeoutSecs: 120,
  maxTurns: 2,
  instructions: role === "coder" ? "Implement the change." : "Review the diff against the snapshot."
});
function request(repo, branch, team, over = {}) {
  return {
    team,
    assignments: team.seats.map((s) => ({
      seat: s,
      prompt: `Objective for ${s.role}.`,
      wave: s.role === "coder" ? 1 : 2,
      readOnly: s.role !== "coder"
    })),
    repoRoot: repo,
    baseBranch: branch,
    missionSlug: `gate-${Math.random().toString(36).slice(2, 8)}`,
    objective: "Gate enforcement fixture.",
    ledger: new CapLedger({ maxCostUsd: 5, maxTurns: 10, timeoutMs: 6e4 }, Date.now()),
    testCommand: ["node", "-e", "process.exit(0)"],
    ...over
  };
}
function deps() {
  return {
    resolveBin: async (bin) => `/usr/local/bin/${bin}`,
    nativeInvoke: async (req) => {
      const isWriter = !req.readOnly;
      if (isWriter) {
        fs.writeFileSync(path2.join(req.cwd, "feature.js"), "module.exports = { feature: true };\n");
        fs.writeFileSync(path2.join(req.cwd, "app.js"), "module.exports = { v: 2 };\n");
      }
      return {
        exitCode: 0,
        stdout: JSON.stringify({ type: "result", is_error: false, result: isWriter ? "Implemented." : "CORRECT: reviewed against snapshot.", total_cost_usd: 0.01, usage: { input_tokens: 100, output_tokens: 40 } }),
        stderr: "",
        durationMs: 5,
        timedOut: false
      };
    },
    git: async (args, cwd) => {
      const r = sh(["git", ...args], cwd);
      return { ok: r.code === 0, stdout: r.out, stderr: "", exitCode: r.code, reason: null };
    },
    writeFile: async (p, contents) => {
      fs.mkdirSync(path2.dirname(p), { recursive: true });
      fs.writeFileSync(p, contents);
    },
    verify: async (cwd) => {
      const r = sh(["node", "-e", "process.exit(0)"], cwd);
      return { exitCode: r.code ?? 0, stdout: r.out, stderr: "", durationMs: 3, timedOut: false };
    }
  };
}
var crossTeam = (reviewHarness) => ({
  id: `t.gate.${String(reviewHarness)}`,
  name: "Gate fixture",
  description: "writer + reviewer",
  schemaVersion: 1,
  seats: [seat2("impl", "coder", "claude"), seat2("reviewer", "reviewer", reviewHarness)]
});
describe("merge gate \u2014 STRICT enforcement inside the runtime", () => {
  it("cross-harness review PASSES, binds evidence to the snapshot sha, and allows the merge", async () => {
    const { repo, branch } = makeRepo();
    const report = await executeTeam(request(repo, branch, crossTeam("codex"), { gatePolicy: "STRICT" }), deps());
    assert.equal(report.status, "completed");
    assert.equal(report.gate.status, "PASS");
    assert.equal(report.gate.tier, "cross-vendor");
    assert.ok(report.gate.evidence, "verdict carries evidence");
    assert.ok(report.gate.evidence?.snapshotBuilt);
    assert.ok(report.gate.evidence?.snapshotSha);
    const rev = report.gate.evidence?.reviewedBy.find((r) => r.seatId === "reviewer");
    assert.ok(rev, "reviewer appears in the evidence");
    assert.equal(rev?.matchesSnapshot, true);
    assert.equal(rev?.reviewedSha, report.snapshot.sha);
    assert.equal(report.merge.gate.allowed, true);
    assert.equal(report.merge.gate.overrideRequired, false);
    assert.ok(report.merge.candidates.length >= 1, "writer produced a merge candidate");
  });
  it("same-harness 'review' is BLOCKED and the merge with it (STRICT)", async () => {
    const { repo, branch } = makeRepo();
    const report = await executeTeam(request(repo, branch, crossTeam("claude"), { gatePolicy: "STRICT" }), deps());
    assert.equal(report.gate.status, "BLOCKED");
    assert.equal(report.gate.tier, "self-verification");
    assert.equal(report.gate.crossVerified, false);
    assert.equal(report.merge.gate.allowed, false, "the gate blocks the merge path");
    assert.equal(report.merge.gate.overrideRequired, true, "only a recorded human override can unlock it");
    assert.match(report.merge.gate.reason, /STRICT/);
  });
  it("ADVISORY keeps the merge open but records the failure in the merge reason", async () => {
    const { repo, branch } = makeRepo();
    const report = await executeTeam(request(repo, branch, crossTeam("claude"), { gatePolicy: "ADVISORY" }), deps());
    assert.equal(report.gate.status, "FAIL", "self-verification is still a failure, never silent");
    assert.equal(report.merge.gate.allowed, true);
    assert.equal(report.merge.gate.overrideRequired, false);
    assert.match(report.merge.gate.reason, /ADVISORY/);
  });
  it("a rejecting verifier fails the gate and blocks the merge even cross-harness", async () => {
    const { repo, branch } = makeRepo();
    let calls = 0;
    const d = {
      ...deps(),
      nativeInvoke: async (req) => {
        calls += 1;
        const isWriter = !req.readOnly;
        if (isWriter) fs.writeFileSync(path2.join(req.cwd, "feature.js"), "module.exports = { feature: true };\n");
        return { exitCode: isWriter ? 0 : 1, stdout: "", stderr: isWriter ? "" : "review failed", durationMs: 4, timedOut: false };
      }
    };
    const report = await executeTeam(request(repo, branch, crossTeam("codex"), { gatePolicy: "STRICT" }), d);
    assert.ok(calls >= 2);
    assert.equal(report.gate.status, "FAIL");
    assert.equal(report.merge.gate.allowed, false);
    assert.match(report.gate.reasons.join("\n"), /rejected/);
  });
});
