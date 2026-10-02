import express   from "express";
import helmet    from "helmet";
import http      from "node:http";
import { Server } from "socket.io";
import { webcrypto } from "node:crypto";
import { loadConfig }                 from "./config.js";
import { log }                        from "./logger.js";
import { Ledger }                     from "./ledger.js";
import { RateLimiter }                from "./ratelimit.js";
import { CheckpointStore }            from "./checkpoints.js";
import { loadOrCreateSelfImpulseIdentity } from "./selfimpulse-identity.js";
import { PolicyEngine }               from "../core/si-policy.js";
import { assertSignerBinding }        from "../core/si-binding.js";
import { findAuthorization, assessActionRisk, computeReputationSignals, verifyGrantAuthority, authorityFps } from "../core/si-trust.js";
import {
  openSecure, createReplayGuard, verifyRotationProof,
  fingerprint, verifyChallenge, b64e, randomHex, PROTOCOL, GENESIS,
} from "../core/si-crypto.js";
import { VHTamperError } from "../core/si-errors.js";

const subtle = webcrypto.subtle;

function createMetrics() {
  return {
    started: Date.now(),
    joins: 0, leaves: 0, signals: 0,
    selfimpulseAccepted: 0, selfimpulseRejected: 0,
    grantAuthorityRejected: 0,   /* v0.10.4: grants refused by the coverage rule */
    revocationRejected: 0,       /* v0.10.7 RULE 6: revocations of designated authority by an unauthorised writer */
    rotationRejected: 0,         /* v0.10.7 RULE 6: rotations that do not prove possession of the new key */
    rotations: 0, checkpoints: 0,
    rateLimited: 0, banned: 0,
    challengesFailed: 0,
    bindingRejected: 0,
    byKind: {},
  };
}

function ack(cb, data) {
  if (typeof cb !== "function") return;
  try { cb(data); } catch (e) { log.warn("ack.error", { message: e.message }); }
}

const COLORS = ["#0d9488","#7c3aed","#db2777","#d97706","#2563eb","#dc2626","#059669","#4f46e5"];

function parseVersion(v) {
  const [major = 0, minor = 0] = String(v ?? "0.0").split(".").map(Number);
  return { major, minor };
}

/* ============================================================================
 * createSelfImpulse
 * ========================================================================== */
export async function createSelfImpulse(config = loadConfig()) {
  const selfimpulseKey = await loadOrCreateSelfImpulseIdentity(config.dataDir);
  /* v0.10.5 RULES 4+5: who may HAND OUT authority at all. The harbour's own root
     key always may; operators name others explicitly (HANDLE_AUTHORITIES, or the
     v0.10.5 name HANDLE_WILDCARD_AUTHORITIES). Nobody gets it by claiming it — a
     self-declared capability is a claim, not a licence. */
  const authorities = [
    selfimpulseKey.fp,
    ...(Array.isArray(config.authorities) ? config.authorities : []),
    ...(Array.isArray(config.wildcardAuthorities) ? config.wildcardAuthorities : []),
  ];

  const policy  = new PolicyEngine();
  const ledger  = new Ledger(`${config.dataDir}/${config.ledgerFile}`, {
    chainMemory:    config.chainMemory,
    failFast:       config.failFastOnTamper,
    requireMetaSig: config.requireMetaSig,   /* Sentinel/Strict merged */
  });
  ledger.setSelfImpulseKey(selfimpulseKey);
  await ledger.init();

  const checkpointStore = new CheckpointStore(config.dataDir);
  await checkpointStore.init(selfimpulseKey.jwk);

  const rate    = new RateLimiter({
    banThreshold:    config.banThreshold,
    banDurationMs:   config.banDurationMs,
    maxSocketsPerIp: config.maxSocketsPerIp,
  });
  const metrics = createMetrics();
  const members = new Map();
  const replayGuard = createReplayGuard({ windowMs: config.tsWindowMs });

  const pendingChallenges = new Map();
  const CHALLENGE_TTL_MS  = 30_000;

  const nonceSweeper = setInterval(() => {
    replayGuard.purgeExpired();
    const now = Date.now();
    for (const [id, rec] of pendingChallenges)
      if (rec.expiresAt < now) pendingChallenges.delete(id);
  }, 30_000);
  nonceSweeper.unref?.();

  const CHECKPOINT_EVERY   = 10;
  let   linksSinceCheckpoint = 0;

  const app = express();
  app.disable("x-powered-by");
  app.use(helmet({
    contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], connectSrc: ["'self'"], frameSrc: ["'none'"], objectSrc: ["'none'"] } },
    hsts:                         { maxAge: 31_536_000, includeSubDomains: true, preload: true },
    referrerPolicy:               { policy: "no-referrer" },
    permittedCrossDomainPolicies: { permittedPolicies: "none" },
  }));

  const _httpCounts = new Map();
  function httpRateLimit(maxPerMin) {
    return (req, res, next) => {
      const ip  = req.socket.remoteAddress ?? "unknown";
      const now = Date.now();
      const rec = _httpCounts.get(ip) ?? { count: 0, windowStart: now };
      if (now - rec.windowStart > 60_000) { rec.count = 0; rec.windowStart = now; }
      rec.count += 1;
      _httpCounts.set(ip, rec);
      if (rec.count > maxPerMin) return res.status(429).json({ error: "rate-limited" });
      next();
    };
  }

  const server = http.createServer(app);
  const io     = new Server(server, {
    maxHttpBufferSize: config.maxPayloadBytes,
    cors:              { origin: false },
    pingTimeout:       20_000,
    pingInterval:      25_000,
    connectTimeout:    10_000,
  });

  io.use((socket, next) => {
    const ip = socket.handshake.address ?? "unknown";
    if (rate.isBanned(ip))     { metrics.banned++;      return next(new Error("banned")); }
    if (!rate.connAllowed(ip)) { metrics.rateLimited++; rate.violation(ip); return next(new Error("too-many-connections")); }
    rate.connAdd(ip);
    socket.data._ip = ip;
    next();
  });

  io.use((socket, next) => {
    const clientVer       = socket.handshake.auth?.protocolVersion ?? "0.0.0";
    const { major: cMaj } = parseVersion(clientVer);
    const { major: sMaj } = parseVersion(PROTOCOL.version);
    if (cMaj !== sMaj) {
      log.audit("socket.version-mismatch", { clientVer, serverVer: PROTOCOL.version, action: "disconnect" });
      return next(new Error(`protocol-major-mismatch:expected=${sMaj},got=${cMaj}`));
    }
    next();
  });

  app.get("/healthz", httpRateLimit(60), (req, res) => {
    res.json({
      ok:             true,
      version:        PROTOCOL.version,
      codename:       PROTOCOL.codename,
      members:        members.size,
      selfimpulseFp:       selfimpulseKey.fp,
      encryptionScope: PROTOCOL.encryptionScope,
      signingLayer:   PROTOCOL.signingLayer,
      requireMetaSig: config.requireMetaSig,
    });
  });
  app.get("/metrics", httpRateLimit(30), (req, res) => {
    res.json({ uptimeSec: Math.round((Date.now() - metrics.started) / 1000), ...metrics });
  });

  async function signCheckpoint() {
    const statement = JSON.stringify({ kind: "checkpoint", seq: ledger.length, head: ledger.lastHash, ts: Date.now(), rootFp: selfimpulseKey.fp });
    const sig = await subtle.sign({ name: "ECDSA", hash: "SHA-256" }, selfimpulseKey.privateKey, new TextEncoder().encode(statement));
    const cp  = { statement, sig: b64e(new Uint8Array(sig)), rootFp: selfimpulseKey.fp };
    await checkpointStore.append(cp);
    metrics.checkpoints++;
    linksSinceCheckpoint = 0;
    io.emit("checkpoint:new", cp);
    log.audit("checkpoint.signed", { seq: ledger.length, head: ledger.lastHash.slice(0, 16), rootFp: selfimpulseKey.fp });
    return cp;
  }

  async function record(entry) {
    const link = await ledger.append(entry);
    io.emit("selfimpulse:new", link);
    linksSinceCheckpoint++;
    if (linksSinceCheckpoint >= CHECKPOINT_EVERY) await signCheckpoint();
    return link;
  }

  async function appendSystem(kind, obj) {
    return record({ kind, sig: null, payloadStr: JSON.stringify({ kind, ...obj }) });
  }

  function guard(socket, action, limitPerSec, windowMs = 1_000) {
    const ip = socket.data._ip ?? "unknown";
    if (rate.isBanned(ip)) { metrics.banned++; return false; }
    if (!rate.allow(socket.id, action, limitPerSec, windowMs)) {
      rate.violation(ip); metrics.rateLimited++;
      log.audit("rate.denied", { action, ip, socketId: socket.id });
      return false;
    }
    return true;
  }

  /* ════════════════ SOCKET EVENTS ═════════════════════════════════════════ */
  io.on("connection", (socket) => {
    const ip = socket.data._ip ?? "unknown";

    const challenge = randomHex(32);
    pendingChallenges.set(socket.id, { challenge, expiresAt: Date.now() + CHALLENGE_TTL_MS });
    socket.emit("auth:challenge", { challenge, expiresIn: CHALLENGE_TTL_MS });

    /* ------------- PRESENCE ------------- */
    socket.on("user:join", async (payload, cb) => {
      if (!guard(socket, "join", config.rate.join / 60, 60_000))
        return ack(cb, { ok: false, reason: "rate-limited" });
      if (!payload || typeof payload !== "object")
        return ack(cb, { ok: false, reason: "invalid-payload" });

      const pending = pendingChallenges.get(socket.id);
      if (!pending || Date.now() > pending.expiresAt) {
        metrics.challengesFailed++;
        log.audit("join.rejected", { reason: "challenge-expired-or-missing", ip });
        return ack(cb, { ok: false, reason: "challenge-expired" });
      }

      const { name: rawName, group: rawGroup, bundle, challengeSig, claimedFp } = payload;

      if (!bundle?.signJwk?.kty || bundle.signJwk.kty !== "EC" || bundle.signJwk.crv !== "P-256" ||
          !bundle.signJwk.x || !bundle.signJwk.y || !bundle.hpkePub || !bundle.pqPub) {
        log.audit("join.rejected", { reason: "invalid-bundle", ip });
        return ack(cb, { ok: false, reason: "invalid-device-bundle" });
      }

      if (typeof challengeSig !== "string" || typeof claimedFp !== "string") {
        metrics.challengesFailed++;
        return ack(cb, { ok: false, reason: "missing-challenge-proof" });
      }

      let actualFp;
      try { actualFp = await fingerprint(bundle.signJwk); }
      catch { return ack(cb, { ok: false, reason: "invalid-device-bundle" }); }

      if (actualFp !== claimedFp) { metrics.challengesFailed++; return ack(cb, { ok: false, reason: "fp-mismatch" }); }

      const challengeOk = await verifyChallenge(bundle.signJwk, pending.challenge, claimedFp, challengeSig);
      pendingChallenges.delete(socket.id);

      if (!challengeOk) {
        metrics.challengesFailed++;
        rate.violation(ip);
        log.audit("join.rejected", { reason: "bad-challenge-sig", ip, fp: claimedFp });
        return ack(cb, { ok: false, reason: "bad-challenge-signature" });
      }

      for (const m of members.values()) {
        if (m.fp === actualFp) { log.audit("join.rejected", { reason: "duplicate-fp", fp: actualFp, ip }); return ack(cb, { ok: false, reason: "fp-already-joined" }); }
      }

      const name    = String(rawName  ?? "").trim().slice(0, config.maxNameLen) || "Guest";
      const group   = String(rawGroup ?? "").trim().slice(0, config.maxNameLen) || "";
      const profile = { id: socket.id, name, group, fp: actualFp, color: COLORS[members.size % COLORS.length], bundle, joinedAt: Date.now() };
      members.set(socket.id, profile);
      socket.data.user = profile;
      metrics.joins++;

      ack(cb, {
        ok: true,
        you:     { id: profile.id, name, group, fp: actualFp, color: profile.color },
        peers:   [...members.values()].filter((m) => m.id !== socket.id).map((m) => ({ id: m.id, name: m.name, group: m.group, fp: m.fp, color: m.color, bundle: m.bundle })),
        selfimpulse:  { fp: selfimpulseKey.fp, jwk: selfimpulseKey.jwk },
        chainLen: ledger.length, protocol: PROTOCOL.version, checkpoint: checkpointStore.latest(),
      });

      socket.broadcast.emit("peer:joined", { id: profile.id, name, group, fp: actualFp, color: profile.color, bundle });
      await appendSystem("join", { who: name, fp: actualFp });
      log.audit("member.join", { name, fp: actualFp, ip, members: members.size });
    });

    /* ------------- SIGNALING ------------- */
    socket.on("rtc:signal", (payload) => {
      if (!guard(socket, "signal", config.rate.signal)) return;
      if (!payload?.to || !payload?.data || typeof payload.data !== "object") return;
      if (members.has(payload.to)) { metrics.signals++; io.to(payload.to).emit("rtc:signal", { from: socket.id, data: payload.data }); }
    });

    /* ------------- SELFIMPULSEING ------------- */
    socket.on("selfimpulse:submit", async (env, cb) => {
      const user = socket.data.user;
      if (!user) return ack(cb, { ok: false, reason: "not-joined" });
      if (!guard(socket, "selfimpulse", config.rate.selfimpulse)) { metrics.selfimpulseRejected++; return ack(cb, { ok: false, reason: "rate-limited" }); }
      if (JSON.stringify(env).length > config.maxPayloadBytes) { metrics.selfimpulseRejected++; rate.violation(ip); return ack(cb, { ok: false, reason: "payload-too-large" }); }

      const opened = await openSecure(env, user.bundle.signJwk, replayGuard);
      if (!opened.verified) {
        metrics.selfimpulseRejected++;
        log.audit("selfimpulse.rejected", { reason: opened.reason, from: user.name, fp: user.fp });
        return ack(cb, { ok: false, reason: opened.reason ?? "bad-signature" });
      }

      const facts   = opened.payload;
      const verdict = policy.selfimpulse(facts);
      if (!verdict.ok) { metrics.selfimpulseRejected++; return ack(cb, { ok: false, reason: `policy:${verdict.reason}` }); }

      /* ── Sentinel: centralized signer ↔ actor binding (server-side) ── */
      const binding = assertSignerBinding(facts, user.fp);
      if (!binding.ok) {
        metrics.selfimpulseRejected++;
        metrics.bindingRejected++;
        log.audit("selfimpulse.rejected", { reason: binding.reason, from: user.name, fp: user.fp, kind: facts.kind });
        return ack(cb, { ok: false, reason: binding.reason });
      }

      /* v0.10.3: grant-authority gate — only attested principals may issue
         authorizations; delegated grants must chain to an attested root
         (see protocol/THREAT-MODEL.md). Signer binding above already proves
         facts.from.fp is the authenticated session identity. */
      if (facts.kind === "authorization") {
        const authority = verifyGrantAuthority(facts.from?.fp, facts, ledger.links, { maxDepth: config.maxDelegationDepth, grantPolicy: config.grantPolicy, authorities });
        if (!authority.ok) {
          metrics.selfimpulseRejected++;
          metrics.grantAuthorityRejected++;
          log.audit("selfimpulse.rejected", {
            reason: authority.reason, from: user.name, fp: user.fp, kind: facts.kind,
            action: facts.action, scope: facts.scope, held: authority.held,
          });
          return ack(cb, { ok: false, reason: `policy:${authority.reason}`, risk: "unauthorized-grantor" });
        }
      }

      /* v0.10.7 RULE 6: withdrawing authority obeys the same rule as handing it
         out. A revocation against a DESIGNATED identity is only honoured from an
         authorised writer; anyone else's record is refused here and ignored at
         consumption (si-trust `_revokedActions`), so a ledger that already holds
         one cannot be used to switch a principal off. */
      if (facts.kind === "revocation") {
        const authorized = authorityFps(ledger.links, { authorities });
        const targetFp   = facts.target?.fp;
        if (typeof targetFp === "string" && authorized.has(targetFp) && !authorized.has(facts.from?.fp)) {
          metrics.selfimpulseRejected++;
          metrics.revocationRejected++;
          log.audit("selfimpulse.rejected", {
            reason: "revocation-requires-authority", from: user.name, fp: user.fp,
            target: targetFp, targetAction: facts.target?.action ?? "*",
          });
          return ack(cb, { ok: false, reason: "policy:revocation-requires-authority", risk: "unauthorized-revoker" });
        }
      }

      /* authorization gate for agent actions */
      if (facts.kind === "agent_action") {
        const grant = findAuthorization(facts.agent.fp, facts.action, ledger.links, Date.now(), { grantPolicy: config.grantPolicy, authorities });
        if (!grant) { metrics.selfimpulseRejected++; return ack(cb, { ok: false, reason: "policy:no-authorization", risk: "unauthorized" }); }
      }

      const link = await record({
        kind: facts.kind, payloadStr: env.p,
        p: env.p, n: env.n, ts: env.ts, sig: env.sig,
        pubJwk: user.bundle.signJwk, fp: user.fp, name: user.name, verified: true,
      });
      metrics.selfimpulseAccepted++;
      metrics.byKind[facts.kind] = (metrics.byKind[facts.kind] ?? 0) + 1;
      ack(cb, { ok: true, seq: link.seq, hash: link.hash });
      log.audit("selfimpulse.accepted", { seq: link.seq, kind: facts.kind, from: user.name, fp: user.fp });
    });

    /* ------------- KEY ROTATION ------------- */
    socket.on("key:rotate", async (proof, cb) => {
      const user = socket.data.user;
      if (!user) return ack(cb, { ok: false, reason: "not-joined" });
      if (!guard(socket, "rotate", 1 / 60, 60_000)) { metrics.rateLimited++; return ack(cb, { ok: false, reason: "rate-limited" }); }
      if (!proof?.ts || Math.abs(Date.now() - proof.ts) > 5 * 60_000) return ack(cb, { ok: false, reason: "stale-rotation-proof" });
      /* v0.10.7 RULE 6: the proof must show continuity FROM the caller's current
         key AND possession OF the incoming key (bound to this fingerprint), so a
         member cannot name an offline identity's public bundle as its successor
         and squat that fingerprint. */
      const oldFp = user.fp;
      const ok = await verifyRotationProof(proof, user.bundle.signJwk, { oldFp });
      if (!ok) {
        metrics.rotationRejected++;
        rate.violation(ip);
        log.audit("rotate.rejected", { from: user.name, ip, reason: proof?.pop ? "continuity-or-possession-invalid" : "no-possession-proof" });
        return ack(cb, { ok: false, reason: "invalid-rotation-proof" });
      }
      for (const m of members.values())
        if (m.id !== socket.id && m.fp === proof.newBundle.fp) return ack(cb, { ok: false, reason: "new-fp-already-taken" });
      user.bundle = proof.newBundle; user.fp = proof.newBundle.fp; metrics.rotations++;
      await appendSystem("rotate", { who: user.name, from: oldFp, to: user.fp });
      socket.broadcast.emit("peer:rotated", { id: user.id, fp: user.fp, bundle: user.bundle });
      ack(cb, { ok: true, fp: user.fp });
      log.audit("key.rotated", { name: user.name, from: oldFp, to: user.fp });
    });

    /* ------------- CHAIN & TRUST STATE ------------- */
    socket.on("chain:get", (cb) => {
      if (typeof cb !== "function") return;
      try { cb({ length: ledger.length, tail: ledger.tail(20), selfimpulse: { fp: selfimpulseKey.fp, jwk: selfimpulseKey.jwk }, checkpoint: checkpointStore.latest(), genesis: GENESIS }); }
      catch (e) { log.warn("chain.get.error", { message: e.message }); }
    });

    socket.on("chain:verify", async (cb) => {
      if (typeof cb !== "function") return;
      try { cb(await ledger.verifyWindow()); } catch (e) { cb({ ok: false, reason: e.message }); }
    });

    socket.on("checkpoint:get", (cb) => {
      if (typeof cb !== "function") return;
      try { cb({ checkpoint: checkpointStore.latest(), selfimpulse: { fp: selfimpulseKey.fp, jwk: selfimpulseKey.jwk } }); } catch {}
    });

    socket.on("reputation:get", (payload, cb) => {
      if (typeof cb !== "function") return;
      const fp = typeof payload?.fp === "string" ? payload.fp : null;
      if (!fp) return ack(cb, { ok: false, reason: "missing-fp" });
      try {
        const signals = computeReputationSignals(fp, ledger.links);
        ack(cb, { ok: true, signals, profile: signals });
      } catch (e) { ack(cb, { ok: false, reason: e.message }); }
    });

    socket.on("risk:assess", (payload, cb) => {
      if (typeof cb !== "function") return;
      const { fp, action } = payload ?? {};
      if (typeof fp !== "string" || typeof action !== "string") return ack(cb, { ok: false, reason: "missing-args" });
      ack(cb, { ok: true, assessment: assessActionRisk(fp, action, ledger.links, Date.now(), { authorities }) });
    });

    socket.on("authorization:find", (payload, cb) => {
      if (typeof cb !== "function") return;
      const { fp, action } = payload ?? {};
      if (typeof fp !== "string" || typeof action !== "string") return ack(cb, { ok: false, reason: "missing-args" });
      ack(cb, { ok: true, grant: findAuthorization(fp, action, ledger.links, Date.now(), { grantPolicy: config.grantPolicy, authorities }) });
    });

    socket.on("disconnect", async (reason) => {
      rate.connRemove(ip);
      pendingChallenges.delete(socket.id);
      const user = socket.data.user;
      if (!user) return;
      members.delete(socket.id);
      metrics.leaves++;
      io.emit("peer:left", { id: user.id });
      await appendSystem("leave", { who: user.name, fp: user.fp });
      log.info("member.leave", { name: user.name, reason, members: members.size });
    });

    socket.on("error", (err) => { log.warn("socket.error", { message: err.message }); socket.disconnect(true); });
  });

  let httpServer = null;

  async function start(port = config.port) {
    await new Promise((resolve) => { httpServer = server.listen(port, "0.0.0.0", resolve); });
    const bound = httpServer.address().port;
    log.audit("selfimpulse.listening", {
      port: bound, version: PROTOCOL.version, codename: PROTOCOL.codename,
      rootKey: selfimpulseKey.fp, ledger: ledger.length, checkpoints: checkpointStore.size,
      encryptionScope: PROTOCOL.encryptionScope,
      signingLayer:    PROTOCOL.signingLayer.current,
      requireMetaSig:  config.requireMetaSig,
    });
    return bound;
  }

  async function close() {
    clearInterval(nonceSweeper);
    rate.close();
    if (ledger.length > 0) await signCheckpoint();
    await new Promise((resolve) => io.close(resolve));
    if (httpServer) await new Promise((resolve) => httpServer.close(resolve));
    log.audit("selfimpulse.closed", { totalSelfImpulsees: metrics.selfimpulseAccepted });
  }

  return { start, close, config, policy, ledger, checkpointStore, rate, metrics, members, selfimpulseKey, io, app, server, PROTOCOL, signCheckpoint };
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop());
if (isMain) {
  let config;
  try { config = loadConfig(); } catch (e) { process.stderr.write(`[FATAL] Bad configuration: ${e.message}\n`); process.exit(1); }
  createSelfImpulse(config)
    .then(async (selfimpulse) => {
      await selfimpulse.start(config.port);
      const shutdown = async (sig) => { log.audit("selfimpulse.shutdown", { signal: sig }); await selfimpulse.close(); process.exit(0); };
      process.on("SIGTERM", () => shutdown("SIGTERM"));
      process.on("SIGINT",  () => shutdown("SIGINT"));
    })
    .catch((err) => {
      if (err instanceof VHTamperError) {
        process.stderr.write(JSON.stringify({ level: "error", event: "ledger.TAMPERED", seq: err.seq, message: err.message }) + "\n");
      } else {
        process.stderr.write(JSON.stringify({ level: "error", event: "selfimpulse.fatal", message: err.message }) + "\n");
      }
      process.exit(1);
    });
}
