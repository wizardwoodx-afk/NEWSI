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

// src/selfimpulse/ipc/client.ts
var client_exports = {};
__export(client_exports, {
  ipc: () => ipc,
  isNativeHost: () => isNativeHost
});
function isNativeHost() {
  return typeof window !== "undefined" && Boolean(window.__TAURI_INTERNALS__);
}
var invoke, ipc;
var init_client = __esm({
  "src/selfimpulse/ipc/client.ts"() {
    "use strict";
    invoke = (cmd, args) => {
      const internals = window.__TAURI_INTERNALS__;
      if (!internals) throw new Error("not in the native host \u2014 no __TAURI_INTERNALS__");
      return internals.invoke(cmd, args);
    };
    ipc = {
      async secretGet(secretRef) {
        return await invoke("secret_get", { secretRef });
      },
      async secretSet(secretRef, value) {
        return await invoke("secret_set", { secretRef, value });
      },
      async notifyApproval(title, body) {
        await invoke("notify_approval", { title, body });
      },
      async appInfo() {
        return await invoke("app_info");
      }
    };
  }
});

// probe/securityReview.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

// src/selfimpulse/engine/signing.ts
var STORAGE_KEY = "selfimpulse.issuerkey.v1";
var KEYCHAIN_REF = "selfimpulse.issuerkey.v1";
async function keychainBridge() {
  if (typeof window === "undefined" || !("__TAURI_INTERNALS__" in window)) return null;
  try {
    const { ipc: ipc2 } = await Promise.resolve().then(() => (init_client(), client_exports));
    return {
      get: async () => {
        try {
          const r = await ipc2.secretGet(KEYCHAIN_REF);
          return r.present && r.value ? r.value : null;
        } catch {
          return null;
        }
      },
      set: async (json) => {
        try {
          const r = await ipc2.secretSet(KEYCHAIN_REF, json);
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
    const publicKeyHex = toHex(rawPub);
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

// src/version.ts
var ENGINE_VERSION = "19.7.15";
var ENGINE_SHORT = "19.7";
var ENGINE_CODENAME = "SelfImpulse";
var PRODUCT_TITLE = `SelfImpulse (engine MJ ${ENGINE_SHORT} "${ENGINE_CODENAME}")`;

// src/mission/securityReview.ts
var enc = new TextEncoder();
function sortDeep(v) {
  if (Array.isArray(v)) return v.map(sortDeep);
  if (v && typeof v === "object") {
    const o = v;
    return Object.keys(o).sort().reduce((acc, k) => {
      acc[k] = sortDeep(o[k]);
      return acc;
    }, {});
  }
  return v;
}
function canonicalBody(r) {
  return JSON.stringify(sortDeep({ format: r.format, issuedAt: r.issuedAt, product: r.product, scope: r.scope, findings: r.findings, refusals: r.refusals }));
}
async function digestOf(body) {
  const buf = await crypto.subtle.digest("SHA-256", enc.encode(body));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
function securityScope() {
  return [
    {
      surface: "MCP stdio server \u2014 the governed tool surface (20 tools)",
      posture: "Every call routes the governed pipeline; risky calls pause at the human gate (MRTR on the modern wire); honest risk labels in the schema; refusals in words.",
      evidence: "probe/mcpRouter (22 tests) \xB7 probe/mcpSdkClient + mcpSdkClientV2 (official SDK clients, both eras) \xB7 probe/mcpConformance (official JSON Schemas)"
    },
    {
      surface: "The human gate \u2014 authorization control",
      posture: "Every risky action pauses for a human decision; denials execute nothing (checked, not assumed); the gate, the brain, the receipt protocol and the code are NOT runtime self-modifiable; meta-loop self-changes are tighten-only and revert-gated.",
      evidence: "probe/metaLoop (9 tests) \xB7 probe/arenaGate \xB7 probe/mergeGate \xB7 probe/vhClean"
    },
    {
      surface: "Egress \u2014 data leaving the machine",
      posture: "Every artifact departure needs a human click plus a signed authority envelope, and lands in the egress ledger; refused departures are not violations; nothing is listed that did not leave.",
      evidence: "probe/egressAlign \xB7 Audit door live egress ledger"
    },
    {
      surface: "Proof chain \u2014 evidence integrity",
      posture: "SHA-256 hash-chained, Ed25519-signed receipts; a missing or forged issuer key cannot authenticate; tampering breaks the chain at the exact seq; verifiable with zero product state.",
      evidence: "probe/signing \xB7 probe/receipts \xB7 tools/verify-receipt.mjs (dependency-free open verifier)"
    },
    {
      surface: "Release identity \u2014 provenance of the build",
      posture: "One version line stamps all manifests, docs and the byte-pinned MCP engine bundle; current-facing documents may reference older releases only in historical context; the offline pack is sha256-manifested.",
      evidence: "probe/versionDrift \xB7 probe/docIdentity \xB7 probe/offlinePack (byte-identical rebuild)"
    },
    {
      surface: "Local-first data \u2014 storage and secrets",
      posture: "State lives on the machine (SQLite, localStorage); the issuer key rides the OS keychain (Tauri) or a local store; nothing phones home; the web edition is a labeled demo.",
      evidence: "probe/firstrun \xB7 src-tauri keyring usage \xB7 README honesty contract"
    },
    {
      surface: "Cross-selfimpulse trust \u2014 receipt anchoring (17.6)",
      posture: "Only receipts that pass the ONE rulebook can anchor; the anchor is signer-bound (evidence binds the verified chain head + issuer fingerprint); envelopes replay under ECDSA P-256 with a bounded nonce ledger \u2014 a second presentation is refused as replayed; storage refusals come back in words.",
      evidence: "probe/crossSelfImpulse (9 tests incl. replay) \xB7 probe/interop (two process-isolated machines) \xB7 protocol/bridge/bridge-selftest (zero-install 17/17)"
    },
    {
      surface: "Grant authority \u2014 bounded delegation, designated unbounded authority, authority provenance (protocol v0.10.7)",
      posture: "An authorization is accepted only from an ATTESTED granter (unrevoked capability declaration or live selfimpulse) \u2014 and that granter may only hand out authority it HOLDS: the exact action, a scope token (delegate:<scope> / admin:<scope>), or `*` where it itself carries `*`-class authority. Sub-delegation may narrow, never widen; delegated grants name an attested root and a live parent grant, depth \u2264 maxDelegationDepth (default 2); coverage is re-checked at consumption, so a narrowed or revoked issuer stops working; replayed grants are refused. RULE 4: unbounded (`*`-class) authority is never a SELF-CLAIM \u2014 a `*`, `delegate:*` or `admin:*` token counts only when the harbour root key or an operator-designated fingerprint (HANDLE_WILDCARD_AUTHORITIES) holds it, and it is never transitive. RULE 5: a capability CLAIM is not a licence \u2014 delegable authority comes only from a live grant naming the fingerprint as subject, or a declaration by an operator-authorized identity (HANDLE_AUTHORITIES; the harbour root key always qualifies; the v0.10.5 name HANDLE_WILDCARD_AUTHORITIES is still read), refused otherwise as capability-claim-is-not-authority. RULE 6: a key rotation must prove POSSESSION of the incoming key (a second signature over SI-ROTATE-POP-v1 | oldFp | newFp | ts, bound to the caller fingerprint) so a member cannot squat an offline identity's fingerprint; and a revocation against a DESIGNATED identity is honoured only from an authorised writer (refused as policy:revocation-requires-authority, ignored at consumption), so no member can switch off the principal that hands authority out. Designation follows the identity across a harbour-verified key rotation; grants and revocations stay keyed to the exact fingerprint, so a revoked key cannot rotate out of its own revocation. Posture selector HANDLE_GRANT_POLICY = strict (default) / compat (migration only \u2014 reopens the defects) / off (fixtures).",
      evidence: "protocol/wcarena/adversarial-campaign.mjs (14/14 attack classes refused, legitimate control intact; self-contained \u2014 it starts its own harbour with an operator-designated identity) \xB7 protocol/wcarena/v104-authority-matrix.mjs (10/10 \u2014 re-based on given authority: the operator's grants accepted end-to-end, six amplification routes refused) \xB7 protocol/wcarena/governance-attacks.mjs (legitimate control permitted; poisoned consent, attacker-supplied mandate, stale replay and forged approval all refused) \xB7 protocol/wcarena/warrant-compromise-campaign.mjs (22/22 refused, control intact \u2014 RULE 6: rotation possession + revocation authority) \xB7 protocol selftest \u2014 grant-authority section, 171 checks (run steps: protocol/README-TEST.md) \xB7 protocol/THREAT-MODEL.md Decision 3 \xB7 benchmark/run.mjs B3"
    },
    {
      surface: "External-agent boundary \u2014 the interop CLI (17.10.3)",
      posture: "Non-Patina agents enter through tools/si-interop.mjs: same rulebook as the live product, zero npm dependencies, exit code 1 + refusal in words on any failed proof; transport packs carry proof and identity only \u2014 never content.",
      evidence: "probe/interop (tamper + replay refusals across the process boundary) \xB7 benchmark/run.mjs B1 (same rulebook)"
    },
    {
      surface: "Content gate \u2014 the GuardRail (Warrant-Teams)",
      posture: "One decision seam (src/security/guardrail.ts) in front of every content-bearing surface: tool calls, stored memory, teammate descriptions and cross-selfimpulse payloads are injection-scanned and sanitized; durable memory is capped and injection-poisoned facts are refused outright; the expression sandbox refuses ALL computed member access and ships frozen global facades; SSRF-shaped egress URLs (cloud metadata, link-local, non-http(s)) are refused; approval ids are cryptographically random, single-use and TTL-expiring. Deny by default; findings are refusals, never warnings.",
      evidence: "probe/guardrail.test.ts (pinned PoCs for both sandbox escapes, injection battery, egress refusals) \xB7 probe/selfimpulseTeams.test.ts (poisoned description / poisoned task refusals) \xB7 probe/a2aV10.test.ts \xA7D (injection refused at the A2A transport before any task state)"
    },
    {
      surface: "A2A v1.0 transport \u2014 the remote-agent boundary (Warrant-Teams)",
      posture: "Real Linux-Foundation A2A 1.0.0 wire, not a v1-style shape: agent cards carry NO top-level url/protocolVersion (supportedInterfaces carries them), securitySchemes is a map of discriminated unions, cards are JWS-signed over canonical bytes (any mutation breaks verification) and discovery REFUSES legacy-shape cards. The server binds loopback by default, enforces declared securitySchemes through an authorize hook, content-gates inbound text through the GuardRail before touching task state, refuses replayed request fingerprints within a 30s window, caps bodies at 1 MiB and audits every decision. Cross-selfimpulse delegation over the wire keeps the full ladder: unverified cards carry nothing, injection hard-refuses on BOTH sides, dual SHA-256 digests make the artifact tamper-evident, TTL 10 min, each side's replay registry settles a delegation exactly once.",
      evidence: "probe/a2aV10.test.ts \u2014 53 checks: strict schema, JWS sign/verify + tamper, well-known discovery, message/send + task lifecycle, SSE streaming, push webhooks with Authorization, auth enforcement, replay + injection + egress refusals, and USER 1 \u21C4 USER 2 dual-gate delegation over the wire"
    }
  ];
}
function securityFindings() {
  return {
    findings: [
      "No external penetration test or third-party security audit has been performed; this artifact is a self-assessment whose every claim links to machine-checkable evidence in the tree.",
      "The agent OS threat model is single-host, local-first: no multi-tenant server and no network-listening surface. The multi-machine story rides the protocol subtree (device-to-device, transport proven by process-isolated interop probes, not yet by an external network deployment).",
      "The cross-selfimpulse identity persists as a JWK in the injected KV store (localStorage on web, a file for the interop CLI): possession of that store impersonates the agent. This is stated in the stored record itself and is the operator's protection responsibility on a personal device.",
      "Envelope replay protection is per-selfimpulse (a bounded nonce ledger, last 4096 nonces) inside a 5-minute acceptance window \u2014 cross-selfimpulse global deduplication is not claimed.",
      "The drill's deterministic seats validate the machinery (loop, gates, receipts) \u2014 not frontier-model intelligence; real-model runs are labeled as such where present.",
      "Dependency risk is bounded by the release `npm audit` gate at release time, not continuously monitored after issuance."
    ],
    refusals: [
      "This artifact does NOT claim regulatory certification (EU AI Act conformity is evidence support, not a certificate).",
      "It does NOT claim the product is free of vulnerabilities \u2014 only that named surfaces are gated, evidenced and verifiable.",
      "It does NOT claim model output correctness \u2014 verdicts are exit-code-first measurements of what actually ran."
    ]
  };
}
async function buildSecurityReview() {
  const base = {
    format: "si-security-review/1",
    issuedAt: (/* @__PURE__ */ new Date()).toISOString(),
    product: `SelfImpulse ${ENGINE_VERSION}`,
    scope: securityScope(),
    ...securityFindings()
  };
  const digest = await digestOf(canonicalBody(base));
  let signature = null;
  try {
    signature = await signHexDigest(digest);
  } catch {
    signature = null;
  }
  return { ...base, digest, signature };
}
async function verifySecurityReview(r) {
  const reasons = [];
  if (r.format !== "si-security-review/1") reasons.push(`unknown format: ${r.format}`);
  const body = canonicalBody({ format: r.format, issuedAt: r.issuedAt, product: r.product, scope: r.scope, findings: r.findings, refusals: r.refusals });
  const digest = await digestOf(body);
  if (digest !== r.digest) reasons.push("digest mismatch \u2014 the artifact was modified after issuance");
  if (r.signature) {
    const okSig = await verifyIssuerSignature(digest, r.signature.sigHex, r.signature.publicKeyHex);
    if (!okSig) reasons.push("issuer signature does not verify against the embedded public key");
    else reasons.push("issuer signature VALID (key is self-reported \u2014 supply the issuer key out-of-band to authenticate the issuer)");
  } else {
    reasons.push("UNSIGNED: no issuer key on the issuing host \u2014 digest-stamped only, stated as such");
  }
  return { ok: reasons.every((x) => x.startsWith("issuer signature VALID")) || reasons.length === 1 && reasons[0].startsWith("UNSIGNED"), reasons };
}

// probe/securityReview.test.ts
var root = ".";
test("securityReview \u2014 the artifact is real, signed and honest about its limits", async () => {
  const scope = securityScope();
  assert.ok(scope.length >= 5, `scope inventory too thin: ${scope.length}`);
  for (const s of scope) {
    assert.ok(s.surface.length > 10 && s.posture.length > 20, `surface lacks posture: ${s.surface}`);
    assert.ok(/probe|gate|verifier|ledger|README/i.test(s.evidence), `surface lacks machine-checkable evidence: ${s.surface}`);
  }
  const { findings, refusals } = securityFindings();
  assert.ok(findings.some((f) => /no external penetration test/i.test(f)), "must admit: no external pen test");
  assert.ok(findings.some((f) => /single-host/i.test(f)), "must state the threat-model scope");
  assert.ok(refusals.length >= 3, "must refuse overclaiming");
  assert.ok(refusals.some((r) => /does NOT claim/i.test(r)), "refusals must be explicit");
  const names = scope.map((x) => x.surface.toLowerCase());
  assert.ok(names.some((n) => n.includes("cross-selfimpulse")), "cross-selfimpulse anchoring is a named surface");
  assert.ok(names.some((n) => n.includes("grant authority")), "grant-authority delegation is a named surface");
  assert.ok(names.some((n) => n.includes("external-agent")), "the interop CLI boundary is a named surface");
  assert.ok(findings.some((f) => /replay protection is per-selfimpulse/i.test(f)), "replay limits are stated honestly");
  const a = await buildSecurityReview();
  assert.equal(a.format, "si-security-review/1");
  assert.equal(a.digest.length, 64, "sha256 hex");
  const sortDeep2 = (v2) => Array.isArray(v2) ? v2.map(sortDeep2) : v2 && typeof v2 === "object" ? Object.keys(v2).sort().reduce((acc, k) => {
    acc[k] = sortDeep2(v2[k]);
    return acc;
  }, {}) : v2;
  const canon = (o) => JSON.stringify(sortDeep2(o));
  const bodyKey = canon({ format: a.format, issuedAt: a.issuedAt, product: a.product, scope: a.scope, findings: a.findings, refusals: a.refusals });
  assert.equal(await digestOf(bodyKey), a.digest, "digest covers exactly the canonical body");
  const b = await buildSecurityReview();
  b.issuedAt = a.issuedAt;
  const bodyB = canon({ format: b.format, issuedAt: b.issuedAt, product: b.product, scope: b.scope, findings: b.findings, refusals: b.refusals });
  assert.equal(await digestOf(bodyB), a.digest, "same content \u2192 same digest (no wall-clock in the digest)");
  const forged = { ...a, findings: [...a.findings, "tampered"] };
  const vForged = await verifySecurityReview(forged);
  assert.equal(vForged.ok, false, "a modified artifact must fail verification");
  assert.ok(vForged.reasons.some((r) => /digest mismatch/i.test(r)), "the reason is stated");
  const v = await verifySecurityReview(a);
  if (a.signature) {
    assert.ok(v.ok, `signed artifact verifies: ${v.reasons.join("; ")}`);
    assert.ok(a.signature.alg === "EdDSA" && a.signature.sigHex.length === 128, "Ed25519 signature shape");
  } else {
    assert.ok(v.reasons.some((r) => /UNSIGNED/i.test(r)), "the unsigned path is stated in words");
  }
  const mod = fs.readFileSync(path.join(root, "src", "mission", "securityReview.ts"), "utf8");
  assert.ok(mod.includes("export async function buildSecurityReview"), "the artifact builder is exported at the seam");
  assert.ok(mod.includes('"si-security-review/1"'), "the seam names the wire format");
  assert.ok(!fs.existsSync(path.join(root, "src", "pages", "AuditPage.tsx")), "the retired Audit page is gone (19.7.12 UI)");
});
