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

// src/engine/tokenOptim.ts
var tokenOptim_exports = {};
__export(tokenOptim_exports, {
  CONVERSATION_BUDGET: () => CONVERSATION_BUDGET,
  PROMPT_BUDGET: () => PROMPT_BUDGET,
  WIRE_BUDGET: () => WIRE_BUDGET,
  budgetConversation: () => budgetConversation,
  clearTokenLedger: () => clearTokenLedger,
  collapseRepeatedLines: () => collapseRepeatedLines,
  estimateTokens: () => estimateTokens,
  fitToBudget: () => fitToBudget,
  fnv1a: () => fnv1a,
  normalizeWhitespace: () => normalizeWhitespace,
  optimDelta: () => optimDelta,
  optimizeComposedPrompt: () => optimizeComposedPrompt,
  optimizeWirePair: () => optimizeWirePair,
  recordUsage: () => recordUsage,
  resetWireCacheState: () => resetWireCacheState,
  usageReport: () => usageReport,
  wireEventSeq: () => wireEventSeq
});
function estimateTokens(text) {
  return Math.ceil(text.length / 4);
}
function fnv1a(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  let h2 = 2166136261 ^ 2654435769;
  for (let i = text.length - 1; i >= 0; i--) {
    h2 ^= text.charCodeAt(i);
    h2 = Math.imul(h2, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, "0") + (h2 >>> 0).toString(16).padStart(8, "0");
}
function fitToBudget(text, budgetTokens) {
  const total = estimateTokens(text);
  if (total <= budgetTokens) return { text, trimmed: false, savedTokens: 0 };
  const keepChars = Math.max(400, budgetTokens * 4 - 120);
  const headLen = Math.floor(keepChars * 0.6);
  const tailLen = keepChars - headLen;
  const cut = total - budgetTokens;
  const out = `${text.slice(0, headLen)}
[\u2026 ${cut} tokens trimmed by the VH token optimizer \u2014 full playbook preserved in the skill library \u2026]
${text.slice(text.length - tailLen)}`;
  return { text: out, trimmed: true, savedTokens: Math.max(0, total - estimateTokens(out)) };
}
function normalizeWhitespace(text) {
  const out = text.replace(/[ \t]+$/gm, "").replace(/\n{3,}/g, "\n\n").replace(/\n +/g, "\n ").trimEnd();
  return { text: out, removedChars: Math.max(0, text.length - out.length) };
}
function collapseRepeatedLines(text, tolerance = 2) {
  if (tolerance < 1) tolerance = 1;
  const lines = text.split("\n");
  const totals = /* @__PURE__ */ new Map();
  for (const line of lines) {
    const t = line.trim();
    if (t.length >= 8 && !/^#|^[-*+] |^```|^\d+\. /.test(t)) totals.set(t, (totals.get(t) ?? 0) + 1);
  }
  const counts = /* @__PURE__ */ new Map();
  const kept = [];
  let collapsed = 0;
  for (const line of lines) {
    const t = line.trim();
    if (t.length < 8 || /^#|^[-*+] |^```|^\d+\. /.test(t)) {
      kept.push(line);
      continue;
    }
    const n2 = counts.get(t) ?? 0;
    counts.set(t, n2 + 1);
    if (n2 < tolerance) {
      kept.push(line);
    } else if (n2 === tolerance) {
      collapsed += 1;
      const rest = Math.max(0, (totals.get(t) ?? 0) - tolerance);
      kept.push(`${line}  [\u2026 this exact line repeats ${rest} more time${rest === 1 ? "" : "s"} below \u2014 repeats elided by the token optimizer \u2026]`);
    } else {
      collapsed += 1;
    }
  }
  return { text: kept.join("\n"), collapsed };
}
function clipMarked(text, maxChars) {
  const marker = "\n[\u2026 the middle of this tool output was elided to fit the context budget \u2026]\n";
  if (maxChars <= marker.length) return marker.trim();
  if (text.length <= maxChars) return text;
  const room = maxChars - marker.length;
  const head = Math.floor(room * 0.6);
  return `${text.slice(0, head)}${marker}${text.slice(text.length - (room - head))}`;
}
function budgetConversation(head, segments, tail, budgetTokens = CONVERSATION_BUDGET) {
  const assemble = (parts) => [head, ...parts, tail].filter((p) => p.length > 0).join("\n\n");
  const full = assemble(segments.map((s) => s.text));
  const fullTokens = estimateTokens(full);
  if (fullTokens <= budgetTokens) {
    return { text: full, trimmed: false, savedTokens: 0, kept: segments.length, clipped: 0, elided: 0, floorLimited: false, est: true };
  }
  const clean = (s) => collapseRepeatedLines(normalizeWhitespace(s).text).text;
  const nHead = clean(head);
  const nTail = clean(tail);
  const nSegs = segments.map((s) => ({ label: s.label, text: clean(s.text) }));
  const deduped = assemble(nSegs.map((s) => s.text));
  if (estimateTokens(deduped) <= budgetTokens) {
    return {
      text: deduped,
      trimmed: true,
      savedTokens: fullTokens - estimateTokens(deduped),
      kept: nSegs.length,
      clipped: 0,
      elided: 0,
      floorLimited: false,
      est: true
    };
  }
  let remaining = budgetTokens - estimateTokens(nHead) - estimateTokens(nTail);
  const bodies = new Array(nSegs.length);
  const elidedLabels = [];
  let kept = 0;
  let clipped = 0;
  for (let i = nSegs.length - 1; i >= 0; i--) {
    const seg = nSegs[i];
    const tokens = estimateTokens(seg.text);
    if (tokens <= remaining) {
      bodies[i] = seg.text;
      kept++;
      remaining -= tokens;
      continue;
    }
    if (remaining > 0) {
      bodies[i] = clipMarked(seg.text, Math.floor(remaining * 4));
      clipped++;
      remaining = 0;
      continue;
    }
    elidedLabels.unshift(seg.label);
    bodies[i] = "";
  }
  const notices = [];
  if (clipped > 0 || elidedLabels.length > 0) {
    notices.push(
      `[loop context note] This conversation was held to a ${budgetTokens}-token budget. ${kept} result block(s) are complete, ${clipped} were shortened (each says so inline), and ${elidedLabels.length > 0 ? `${elidedLabels.length} \u2014 ${elidedLabels.join(", ")} \u2014 were left out.` : "none were left out."} An elided result did NOT come back empty and no tool failed: its output simply did not fit. Re-run that tool if you need it. The most recent turn is complete.`
    );
  }
  let out = assemble([...notices, ...bodies.filter((b) => b.length > 0)]);
  if (estimateTokens(out) > budgetTokens) {
    out = fitToBudget(out, budgetTokens).text;
  }
  const after = estimateTokens(out);
  return {
    text: out,
    trimmed: true,
    savedTokens: Math.max(0, fullTokens - after),
    kept,
    clipped,
    elided: elidedLabels.length,
    floorLimited: after > budgetTokens,
    est: true
  };
}
function recordEvent(e) {
  wireEvents.push(e);
  if (wireEvents.length > EVENT_CAP) wireEvents.splice(0, wireEvents.length - EVENT_CAP);
}
function optimizeWirePair(system, user, ctx = { model: "unknown" }) {
  try {
    const beforeTokens = estimateTokens(system) + estimateTokens(user);
    const nSys = normalizeWhitespace(system);
    const nUsr = normalizeWhitespace(user);
    const cSys = collapseRepeatedLines(nSys.text);
    const cUsr = collapseRepeatedLines(nUsr.text);
    const prefixHash = fnv1a(cSys.text);
    const cacheAligned = lastPrefix !== null && lastPrefix.model === ctx.model && lastPrefix.hash === prefixHash;
    lastPrefix = { model: ctx.model, hash: prefixHash };
    let outSys = cSys.text;
    let outUsr = cUsr.text;
    let budgetTrimmed = false;
    const pair = `${outSys}
${outUsr}`;
    if (estimateTokens(pair) > WIRE_BUDGET) {
      const f = fitToBudget(pair, WIRE_BUDGET);
      if (f.trimmed) {
        const at = f.text.indexOf("\u2026 tokens trimmed by the VH token optimizer");
        const sysPart = at >= 0 ? f.text.slice(0, at) : f.text;
        const usrPart = at >= 0 ? f.text.slice(at) : "";
        outSys = sysPart.replace(/\n$/, "");
        outUsr = usrPart && usrPart.length > 40 ? usrPart : outUsr;
        budgetTrimmed = true;
      }
    }
    const afterTokens = estimateTokens(outSys) + estimateTokens(outUsr);
    const savedTokens = Math.max(0, beforeTokens - afterTokens);
    const report = {
      beforeTokens,
      afterTokens,
      savedTokens,
      savedPct: beforeTokens === 0 ? 0 : Math.round(savedTokens / beforeTokens * 100),
      normalizedChars: nSys.removedChars + nUsr.removedChars,
      collapsedLines: cSys.collapsed + cUsr.collapsed,
      cacheAligned,
      prefixTokens: estimateTokens(outSys),
      budgetTrimmed,
      est: true
    };
    wireSeq += 1;
    recordEvent({ ...report, seq: wireSeq, at: (/* @__PURE__ */ new Date()).toISOString(), model: ctx.model, kind: ctx.kind ?? "provider-call" });
    return { system: outSys, user: outUsr, report };
  } catch {
    const beforeTokens = estimateTokens(system) + estimateTokens(user);
    wireSeq += 1;
    recordEvent({
      seq: wireSeq,
      at: (/* @__PURE__ */ new Date()).toISOString(),
      model: ctx.model,
      kind: ctx.kind ?? "provider-call",
      beforeTokens,
      afterTokens: beforeTokens,
      savedTokens: 0,
      savedPct: 0,
      normalizedChars: 0,
      collapsedLines: 0,
      cacheAligned: false,
      prefixTokens: estimateTokens(system),
      budgetTrimmed: false,
      est: true
    });
    return { system, user, report: { beforeTokens, afterTokens: beforeTokens, savedTokens: 0, savedPct: 0, normalizedChars: 0, collapsedLines: 0, cacheAligned: false, prefixTokens: estimateTokens(system), budgetTrimmed: false, est: true } };
  }
}
function wireEventSeq() {
  return wireSeq;
}
function optimDelta(sinceSeq) {
  const evs = wireEvents.filter((e) => e.seq > sinceSeq);
  return evs.reduce(
    (acc, e) => ({
      calls: acc.calls + 1,
      beforeTokens: acc.beforeTokens + e.beforeTokens,
      afterTokens: acc.afterTokens + e.afterTokens,
      savedTokens: acc.savedTokens + e.savedTokens,
      savedPct: acc.savedPct + e.savedPct,
      normalizedChars: acc.normalizedChars + e.normalizedChars,
      collapsedLines: acc.collapsedLines + e.collapsedLines,
      cacheAligned: acc.cacheAligned || e.cacheAligned,
      prefixTokens: acc.prefixTokens + e.prefixTokens,
      budgetTrimmed: acc.budgetTrimmed || e.budgetTrimmed,
      est: true
    }),
    {
      calls: 0,
      beforeTokens: 0,
      afterTokens: 0,
      savedTokens: 0,
      savedPct: 0,
      normalizedChars: 0,
      collapsedLines: 0,
      cacheAligned: false,
      prefixTokens: 0,
      budgetTrimmed: false,
      est: true
    }
  );
}
function resetWireCacheState() {
  lastPrefix = null;
}
function optimizeComposedPrompt(composed2, budgetTokens = PROMPT_BUDGET) {
  const normalized = normalizeWhitespace(composed2).text;
  const before = estimateTokens(normalized);
  if (before <= budgetTokens) return { prompt: normalized, optimized: false, savedTokens: 0, estimatedTokens: before };
  const MARKER = "## Bound skills";
  const at = normalized.indexOf(MARKER);
  if (at === -1) {
    const f2 = fitToBudget(normalized, budgetTokens);
    return { prompt: f2.text, optimized: f2.trimmed, savedTokens: f2.savedTokens, estimatedTokens: estimateTokens(f2.text) };
  }
  const base = normalized.slice(0, at);
  const skills = normalized.slice(at);
  const condensed = skills.split("\n").filter((line) => /^### Skill:/.test(line) || /^(Procedure:|Checklist:|Quality checklist)/.test(line) || /^\d+\./.test(line.trim()) || line.trim() === "").join("\n").replace(/\n{3,}/g, "\n\n");
  let prompt = base + condensed;
  let est = estimateTokens(prompt);
  if (est <= budgetTokens) {
    return { prompt, optimized: true, savedTokens: before - est, estimatedTokens: est };
  }
  const f = fitToBudget(prompt, budgetTokens);
  est = estimateTokens(f.text);
  return { prompt: f.text, optimized: true, savedTokens: before - est, estimatedTokens: est };
}
function storage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}
function recordUsage(entry, now = () => /* @__PURE__ */ new Date()) {
  const raw = storage()?.getItem(LEDGER_KEY);
  let list = [];
  try {
    const parsed = raw ? JSON.parse(raw) : [];
    if (Array.isArray(parsed)) list = parsed;
  } catch {
  }
  list.push({ ...entry, at: now().toISOString() });
  storage()?.setItem(LEDGER_KEY, JSON.stringify(list.slice(-LEDGER_CAP)));
}
function usageReport() {
  const raw = storage()?.getItem(LEDGER_KEY);
  let list = [];
  try {
    const parsed = raw ? JSON.parse(raw) : [];
    if (Array.isArray(parsed)) list = parsed;
  } catch {
  }
  return list.reduce(
    (acc, e) => ({
      calls: acc.calls + 1,
      promptTokens: acc.promptTokens + e.promptTokens,
      replyTokens: acc.replyTokens + e.replyTokens,
      optimizedCalls: acc.optimizedCalls + (e.optimized ? 1 : 0),
      savedTokens: acc.savedTokens + e.savedTokens
    }),
    { calls: 0, promptTokens: 0, replyTokens: 0, optimizedCalls: 0, savedTokens: 0 }
  );
}
function clearTokenLedger() {
  storage()?.removeItem(LEDGER_KEY);
}
var LEDGER_KEY, LEDGER_CAP, PROMPT_BUDGET, WIRE_BUDGET, CONVERSATION_BUDGET, EVENT_CAP, wireEvents, wireSeq, lastPrefix;
var init_tokenOptim = __esm({
  "src/engine/tokenOptim.ts"() {
    "use strict";
    LEDGER_KEY = "engine.tokens.v1";
    LEDGER_CAP = 500;
    PROMPT_BUDGET = 6e3;
    WIRE_BUDGET = 24e3;
    CONVERSATION_BUDGET = 6e3;
    EVENT_CAP = 400;
    wireEvents = [];
    wireSeq = 0;
    lastPrefix = null;
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
    const n2 = Number(p);
    if (n2 > 255) return null;
    octets.push(n2);
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
function classifyIp(n2, allowLoopback) {
  if (n2.kind === "ipv4" && n2.octets) return classifyV4(n2.octets, allowLoopback);
  if (n2.kind === "ipv6" && n2.groups) return classifyV6(n2.groups, allowLoopback);
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
    const n2 = normalizeHost(a);
    const cls = classifyIp(n2, allowLoopback);
    if (!cls.ok) {
      return { ok: false, reason: `"${host}" resolves to ${n2.ip || a} \u2014 ${cls.reason}`, scope: cls.scope };
    }
    seen.push(n2.ip || a);
    if (!pinned) pinned = { ip: n2.ip || a, scope: cls.scope };
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
        for (const r2 of await dns.lookup(hostname, { all: true, verbatim: true })) out.push(r2.address);
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
  const c2 = globalThis.crypto;
  if (c2 && typeof c2.randomUUID === "function") return c2.randomUUID();
  if (c2 && typeof c2.getRandomValues === "function") {
    const bytes = new Uint8Array(16);
    c2.getRandomValues(bytes);
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
          refs.map((r2) => [
            r2,
            db.secrets[r2] ? { exists: true, location: "browser-localStorage", survivesRestart: true, warning: "Stored in browser localStorage, not an OS keychain. Readable by anything in this origin." } : { exists: false, location: "absent", survivesRestart: false }
          ])
        );
      },
      secretGet(ref) {
        return load().secrets[ref] ?? null;
      },
      mcpList() {
        return load().mcp;
      },
      mcpSave(cfg2) {
        const db = load();
        const id = cfg2.id || uid("mcp");
        const now = nowIso();
        const existing = db.mcp.find((m) => m.id === id);
        if (existing) {
          Object.assign(existing, cfg2, { updatedAt: now });
        } else {
          db.mcp.push({
            id,
            name: cfg2.name,
            transport: cfg2.transport ?? "stdio",
            config: cfg2.config ?? { transport: "stdio", enabled: true },
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
        const c2 = db.evolution.find((x) => x.id === id);
        if (!c2) throw new Error(`evolution candidate ${id} does not exist \u2014 nothing was changed.`);
        if (c2.status !== "PROPOSED")
          throw new Error(
            `evolution candidate ${id} is not PROPOSED (current status ${c2.status}) \u2014 it moves exactly once, from PROPOSED to DECIDED.`
          );
        c2.decision = decision;
        c2.status = "DECIDED";
        c2.decidedAt = nowIso();
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
        const ok2 = window.confirm(
          `SelfImpulse \u2014 human approval gate

${a.summary}

Requester: ${a.requestedBy ?? `execution:${a.executionId}`}
Required authority: ${a.authority ?? "human"}
Verdict if you confirm: ${decision}

${word.toUpperCase()} this? Cancel mints nothing and decides nothing.`
        );
        if (!ok2) {
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
  const r2 = await tauriInvoke("exec_grant_request", { programs, workspace: ws, network, minutes });
  const g = { token: r2.grant, workspace: r2.workspace, network: r2.network, programs: r2.programs, expiresAt: r2.expiresAt };
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
          const r2 = await tauriInvoke("a2a_host_start", {
            selfimpulse: opts.selfimpulse || "SelfImpulse",
            port: opts.port ?? 0,
            bind: opts.bind ?? "local",
            pair: opts.pair === true,
            files: opts.files === true
          });
          return { ok: r2.ok === true, detail: String(r2.detail ?? (r2.ok === true ? "The host is mounted." : "The host did not report ready.")) };
        } catch (err) {
          return { ok: false, detail: `Mount failed in words rather than pretending: ${String(err)}` };
        }
      },
      federationStop: async () => {
        if (!useTauri()) return { ok: false, detail: "Federation is a desktop capability." };
        try {
          const r2 = await tauriInvoke("a2a_host_stop");
          return { ok: r2.ok !== false, detail: String(r2.detail ?? "The A2A host was stopped.") };
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
            const r2 = await safeEgressFetch(`${target || "http://127.0.0.1:11434"}/api/chat`, {
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
            const j = await r2.json();
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
      mcpServerSave: async (cfg2) => {
        if (useTauri()) return tauriInvoke("mcp_server_save", { cfg: cfg2 });
        return localDb.mcpSave(cfg2);
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

// src/engine/nativeProvider.ts
function originOf(url) {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}
function nativeKindFor(cfg2) {
  if (cfg2.kind === "anthropic") return "anthropic";
  if (cfg2.kind === "gemini") return "google";
  const o = originOf(cfg2.baseUrl);
  for (const k of ["openai", "groq", "openrouter"]) if (o === CANONICAL[k]) return k;
  return "custom";
}
function nativeEndpointFor(cfg2) {
  const kind = nativeKindFor(cfg2);
  const base = cfg2.baseUrl.trim().replace(/\/+$/, "");
  if (CANONICAL[kind] && originOf(base) === CANONICAL[kind]) return void 0;
  return cfg2.kind === "anthropic" ? `${base}/v1/messages` : `${base}/chat/completions`;
}
async function callNativeProvider(cfg2, system, user, opts = {}) {
  if (!cfg2.secretRef) return { ok: false, kind: "no-key", error: "no native key reference \u2014 nothing was executed" };
  const started = Date.now();
  const endpoint = nativeEndpointFor(cfg2);
  const timeoutMs = opts.timeoutMs ?? 12e4;
  let timer;
  try {
    const r2 = await Promise.race([
      ipc.llmChat({
        provider: nativeKindFor(cfg2),
        ...endpoint ? { base_url: endpoint } : {},
        model: cfg2.model,
        messages: [{ role: "user", content: user }],
        system,
        max_tokens: 1024,
        secret_ref: cfg2.secretRef
      }),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`provider timed out after ${timeoutMs}ms`)), timeoutMs);
      })
    ]);
    const text = String(r2.content ?? "").trim();
    if (!text) return { ok: false, kind: "bad-response", error: "provider response carried no usable text \u2014 nothing was executed" };
    return { ok: true, text, model: r2.model || cfg2.model, latencyMs: Date.now() - started };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const kind = /timed out/i.test(msg) ? "timeout" : /HTTP \d{3}/.test(msg) ? "http-error" : /egress|refused|not bound|neither|DENIED|no built-in endpoint/i.test(msg) ? "egress-blocked" : /secret not found|no key/i.test(msg) ? "no-key" : "network";
    return { ok: false, kind, error: redactSecrets(msg) };
  } finally {
    if (timer) clearTimeout(timer);
  }
}
var CANONICAL;
var init_nativeProvider = __esm({
  "src/engine/nativeProvider.ts"() {
    "use strict";
    init_client();
    init_providers();
    CANONICAL = {
      openai: "https://api.openai.com",
      anthropic: "https://api.anthropic.com",
      google: "https://generativelanguage.googleapis.com",
      groq: "https://api.groq.com",
      openrouter: "https://openrouter.ai"
    };
  }
});

// src/engine/providers.ts
var providers_exports = {};
__export(providers_exports, {
  DEFAULT_TIMEOUT_MS: () => DEFAULT_TIMEOUT_MS,
  PROVIDER_DEFAULTS: () => PROVIDER_DEFAULTS,
  complete: () => complete,
  providerFromEnv: () => providerFromEnv,
  redactSecrets: () => redactSecrets
});
function providerFromEnv(env) {
  for (const src of ENV_SOURCES) {
    const apiKey = src.keyVars.map((v) => env[v]).find((v) => typeof v === "string" && v.trim().length > 0);
    if (!apiKey) continue;
    return {
      kind: src.kind,
      baseUrl: (env[src.baseVar] ?? PROVIDER_DEFAULTS[src.kind]).replace(/\/+$/, ""),
      apiKey: apiKey.trim(),
      model: env[src.modelVar] ?? src.defaultModel
    };
  }
  return null;
}
function redactSecrets(text, known = []) {
  let out = text;
  for (const k of known) {
    if (k && k.length >= 8) out = out.split(k).join(`${k.slice(0, 4)}\u2026REDACTED`);
  }
  out = out.replace(/\b(sk-[A-Za-z0-9_-]{6})[A-Za-z0-9_-]+/g, "$1\u2026REDACTED");
  out = out.replace(/\b(sk-ant-[A-Za-z0-9_-]{6})[A-Za-z0-9_-]+/g, "$1\u2026REDACTED");
  out = out.replace(/\b(AIza[A-Za-z0-9_-]{6})[A-Za-z0-9_-]+/g, "$1\u2026REDACTED");
  return out;
}
function buildRequest(cfg2, system, user) {
  switch (cfg2.kind) {
    case "openai-compatible":
      return {
        url: `${cfg2.baseUrl}/chat/completions`,
        init: {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${cfg2.apiKey}` },
          body: JSON.stringify({ model: cfg2.model, messages: [{ role: "system", content: system }, { role: "user", content: user }] })
        }
      };
    case "anthropic":
      return {
        url: `${cfg2.baseUrl}/v1/messages`,
        init: {
          method: "POST",
          headers: { "content-type": "application/json", "x-api-key": cfg2.apiKey, "anthropic-version": "2023-06-01" },
          body: JSON.stringify({ model: cfg2.model, max_tokens: 2048, system, messages: [{ role: "user", content: user }] })
        }
      };
    case "gemini":
      return {
        url: `${cfg2.baseUrl}/models/${encodeURIComponent(cfg2.model)}:generateContent`,
        init: {
          method: "POST",
          headers: { "content-type": "application/json", "x-goog-api-key": cfg2.apiKey },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: system }] },
            contents: [{ role: "user", parts: [{ text: user }] }],
            // Thinking models spend part of the budget on thoughts — give room.
            generationConfig: { maxOutputTokens: 4096 }
          })
        }
      };
  }
}
function extractText(cfg2, body) {
  try {
    if (cfg2.kind === "openai-compatible") {
      const b2 = body;
      return b2.choices?.[0]?.message?.content ?? null;
    }
    if (cfg2.kind === "anthropic") {
      const b2 = body;
      const parts2 = (b2.content ?? []).filter((c2) => c2.type === "text").map((c2) => c2.text ?? "");
      return parts2.length ? parts2.join("") : null;
    }
    const b = body;
    const parts = (b.candidates?.[0]?.content?.parts ?? []).filter((p) => !p.thought).map((p) => p.text ?? "");
    return parts.length ? parts.join("") : null;
  } catch {
    return null;
  }
}
async function complete(cfg2, system, user, opts = {}) {
  if (!cfg2) return { ok: false, kind: "no-key", error: "no provider configured \u2014 supply an API key (env or the Providers door); nothing was executed" };
  if (cfg2.secretRef) {
    if (!useTauri()) return { ok: false, kind: "no-key", error: "this provider's key is held by the desktop keychain \u2014 it cannot be used from the browser; nothing was executed" };
    const nativeWire = optimizeWirePair(system, user, { model: cfg2.model, kind: "provider-call" });
    return callNativeProvider(cfg2, nativeWire.system, nativeWire.user, { timeoutMs: opts.timeoutMs });
  }
  if (!cfg2.apiKey || !cfg2.apiKey.trim()) return { ok: false, kind: "no-key", error: "provider key is empty \u2014 nothing was executed" };
  const egress = checkEgressUrl(cfg2.baseUrl);
  if (!egress.ok) return { ok: false, kind: "egress-blocked", error: redactSecrets(`base URL refused by the egress guard: ${egress.reason}`, [cfg2.apiKey]) };
  const wire = optimizeWirePair(system, user, { model: cfg2.model, kind: "provider-call" });
  const { url, init } = buildRequest(cfg2, wire.system, wire.user);
  const doFetch = opts.fetchImpl ?? globalThis.fetch?.bind(globalThis);
  if (!doFetch) return { ok: false, kind: "network", error: "no fetch available in this runtime \u2014 nothing was executed" };
  const controller = new AbortController();
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const t0 = Date.now();
  try {
    const res = await doFetch(url, { ...init, signal: controller.signal });
    const latencyMs = Date.now() - t0;
    if (!res.ok) {
      const bodyText = await res.text().catch(() => "");
      return { ok: false, kind: "http-error", error: redactSecrets(`provider returned HTTP ${res.status}${bodyText ? `: ${bodyText.slice(0, 300)}` : ""}`, [cfg2.apiKey]) };
    }
    const body = await res.json().catch(() => null);
    const text = body == null ? null : extractText(cfg2, body);
    if (text == null || text.length === 0) {
      return { ok: false, kind: "bad-response", error: "provider response carried no usable text \u2014 nothing was executed" };
    }
    return { ok: true, text, model: cfg2.model, latencyMs };
  } catch (err) {
    const aborted = err instanceof Error && err.name === "AbortError";
    return {
      ok: false,
      kind: aborted ? "timeout" : "network",
      error: redactSecrets(aborted ? `provider timed out after ${timeoutMs}ms` : `network failure: ${err instanceof Error ? err.message : String(err)}`, [cfg2.apiKey])
    };
  } finally {
    clearTimeout(timer);
  }
}
var PROVIDER_DEFAULTS, DEFAULT_TIMEOUT_MS, ENV_SOURCES;
var init_providers = __esm({
  "src/engine/providers.ts"() {
    "use strict";
    init_guardrail();
    init_tokenOptim();
    init_nativeProvider();
    init_client();
    PROVIDER_DEFAULTS = {
      "openai-compatible": "https://api.openai.com/v1",
      anthropic: "https://api.anthropic.com",
      gemini: "https://generativelanguage.googleapis.com/v1"
      // 18.5.0: stable v1 line (review note); the OpenAI-compat path stays v1beta/openai/
    };
    DEFAULT_TIMEOUT_MS = 3e4;
    ENV_SOURCES = [
      { kind: "openai-compatible", keyVars: ["HANDLE_OPENAI_API_KEY", "OPENAI_API_KEY"], baseVar: "HANDLE_OPENAI_BASE_URL", modelVar: "HANDLE_OPENAI_MODEL", defaultModel: "gpt-4.1" },
      { kind: "anthropic", keyVars: ["HANDLE_ANTHROPIC_API_KEY", "ANTHROPIC_API_KEY"], baseVar: "HANDLE_ANTHROPIC_BASE_URL", modelVar: "HANDLE_ANTHROPIC_MODEL", defaultModel: "claude-sonnet-4-20250514" },
      { kind: "gemini", keyVars: ["HANDLE_GEMINI_API_KEY", "GEMINI_API_KEY", "GOOGLE_GENERATIVE_AI_API_KEY"], baseVar: "HANDLE_GEMINI_BASE_URL", modelVar: "HANDLE_GEMINI_MODEL", defaultModel: "gemini-2.5-flash" }
    ];
  }
});

// probe/tokenPipeline.test.ts
var passed = 0;
var failed = 0;
var failures = [];
function ok(label, cond, detail = "") {
  if (cond) {
    passed++;
    console.log(`  ok   ${label}`);
  } else {
    failed++;
    failures.push(`${label}${detail ? ` \u2014 ${detail}` : ""}`);
    console.log(`  FAIL ${label}${detail ? ` \u2014 ${detail}` : ""}`);
  }
}
var {
  estimateTokens: estimateTokens2,
  fitToBudget: fitToBudget2,
  optimizeComposedPrompt: optimizeComposedPrompt2,
  optimizeWirePair: optimizeWirePair2,
  normalizeWhitespace: normalizeWhitespace2,
  collapseRepeatedLines: collapseRepeatedLines2,
  fnv1a: fnv1a2,
  wireEventSeq: wireEventSeq2,
  optimDelta: optimDelta2,
  resetWireCacheState: resetWireCacheState2,
  WIRE_BUDGET: WIRE_BUDGET2
} = await Promise.resolve().then(() => (init_tokenOptim(), tokenOptim_exports));
var { complete: complete2 } = await Promise.resolve().then(() => (init_providers(), providers_exports));
console.log("== estimates and the fitter ==");
ok("estimateTokens is the honest ~4 chars/token", estimateTokens2("12345678") === 2);
ok("fitToBudget leaves short text alone", !fitToBudget2("hello world", 100).trimmed);
var big = "x".repeat(3e3) + "\n" + "keep this tail line".repeat(20);
var fit = fitToBudget2(big, 400);
ok("fitToBudget trims only when over, and MARKS the cut", fit.trimmed && fit.text.includes("trimmed by the VH token optimizer"));
ok("fitToBudget keeps the tail (the checklist)", fit.text.endsWith("keep this tail line".repeat(20).slice(-40)) || fit.text.includes("keep this tail line"));
console.log("== stage 1: normalization ==");
var n = normalizeWhitespace2("a\n\n\n\nb   \nc");
ok("3+ newlines collapse, trailing spaces go, meaning stays", n.text === "a\n\nb\nc" && n.removedChars > 0);
console.log("== stage 2: repeated-line collapse ==");
var rep = ["alpha beta gamma delta", "alpha beta gamma delta", "alpha beta gamma delta", "something else entirely long here"].join("\n");
var c = collapseRepeatedLines2(rep);
ok("a line seen >2\xD7 collapses to the first two + a marker", c.collapsed === 1 && c.text.includes("repeats 1 more time") && c.text.includes("repeats elided by the token optimizer"));
ok("structural lines never collapse", collapseRepeatedLines2("# Header\n# Header").collapsed === 0);
console.log("== fnv1a determinism ==");
ok(
  "same text, same hash; different text, different hash",
  fnv1a2("mission alpha") === fnv1a2("mission alpha") && fnv1a2("mission alpha") !== fnv1a2("mission beta")
);
console.log("== the wire pipeline ==");
resetWireCacheState2();
var seq0 = wireEventSeq2();
var sys = "You are SelfImpulse.\n\n\n\nStay honest.   \nStay honest.";
var usr = "plan a mission";
var w1 = optimizeWirePair2(sys, usr, { model: "m1", kind: "probe" });
ok("pipeline returns usable texts", w1.system.includes("You are SelfImpulse.") && w1.user === "plan a mission");
ok("pipeline report is labelled an estimate", w1.report.est === true);
ok("first call is NOT cache-aligned (no prefix history)", w1.report.cacheAligned === false);
var w2 = optimizeWirePair2(sys, usr, { model: "m1", kind: "probe" });
ok("identical system bytes on the same model ARE cache-aligned", w2.report.cacheAligned === true);
var w3 = optimizeWirePair2(sys, usr, { model: "m2", kind: "probe" });
ok("a different model is NOT cache-aligned", w3.report.cacheAligned === false);
var delta = optimDelta2(seq0);
ok("optimDelta scopes to the run: 3 calls, honest sums", delta.calls === 3 && delta.savedTokens >= 0 && delta.est === true);
ok("the pipeline never turns text into a fabrication", w1.system.includes("Stay honest"));
var hugeSys = Array.from({ length: 4e3 }, (_, i) => `Unique filler line ${i} carrying plenty of padding text so dedup cannot save it here.`).join("\n");
var w4 = optimizeWirePair2(hugeSys, "short task", { model: "m3", kind: "probe" });
ok("the emergency budget guard fires only on egregious overshoot", w4.report.budgetTrimmed === true && estimateTokens2(w4.system + "\n" + w4.user) <= WIRE_BUDGET2 + 900);
console.log("== complete() rides the pipeline ==");
var seq1 = wireEventSeq2();
var cfg = { kind: "openai-compatible", baseUrl: "https://provider.example/v1", apiKey: "sk-test-abcdef123456", model: "probe-1" };
var seenBody = "";
var fakeFetch = (async (_url, init) => {
  seenBody = init?.body ?? "";
  return new Response(JSON.stringify({ choices: [{ message: { content: "the answer" } }] }), { status: 200, headers: { "content-type": "application/json" } });
});
var r = await complete2(cfg, "You are SelfImpulse, the SelfImpulse generalist.", "hello", { fetchImpl: fakeFetch });
ok("complete() succeeds through the pipeline", r.ok === true && r.text === "the answer");
ok("the wire body still carries the system + user roles", seenBody.includes("You are SelfImpulse") && seenBody.includes("hello"));
var d1 = optimDelta2(seq1);
ok("the call landed exactly one pipeline event", d1.calls === 1 && d1.beforeTokens > 0);
console.log("== the composed-prompt fitter still honors skills ==");
var composed = ["Base identity prompt for the specialist.", "## Bound skills", "### Skill: Search", "Procedure: find sources", "1. search the web", "1. read the top result", "1. cite what you used"].join("\n");
var opt = optimizeComposedPrompt2(composed, estimateTokens2(composed) - 5 > 0 ? 10 : 10);
ok("over budget, it trims; the base prompt survives", opt.optimized === true && opt.prompt.includes("Base identity prompt"));
console.log(`
${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log("\nfailures:");
  for (const f of failures) console.log(`  - ${f}`);
}
process.exit(failed > 0 ? 1 : 0);
