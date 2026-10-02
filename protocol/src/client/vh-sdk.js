import { io }               from "socket.io-client";
import * as VH              from "../core/si-crypto.js";
import * as TRUST           from "../core/si-trust.js";
import { assertSignerBinding } from "../core/si-binding.js";
import { PolicyEngine }     from "../core/si-policy.js";
import { VHError, VHAuthError } from "../core/si-errors.js";

class EventBus {
  #listeners = new Map();
  on(event, fn) {
    if (typeof event !== "string" || typeof fn !== "function")
      throw new VHError("INVALID_LISTENER", "on: event must be string, fn must be function");
    if (!this.#listeners.has(event)) this.#listeners.set(event, new Set());
    this.#listeners.get(event).add(fn);
    return () => this.#listeners.get(event)?.delete(fn);
  }
  emit(event, data) {
    const fns = this.#listeners.get(event);
    if (!fns) return;
    for (const fn of fns) { try { fn(data); } catch (e) { console.warn(`[VHClient] listener error "${event}":`, e?.message); } }
  }
}

function _validBundle(b) {
  return b && typeof b.signJwk?.x === "string" && typeof b.signJwk?.y === "string" &&
    typeof b.hpkePub === "string" && typeof b.pqPub === "string";
}

function _parseMajor(v) { return Number(String(v ?? "0").split(".")[0]); }

export class VHClient {
  #identity = null;
  #socket   = null;
  #bus      = new EventBus();
  #guard    = VH.createReplayGuard();

  constructor(selfimpulseUrl, { policy = {}, maxReconnectAttempts = 5 } = {}) {
    if (typeof selfimpulseUrl !== "string" || !selfimpulseUrl.startsWith("http"))
      throw new VHError("INVALID_URL", "selfimpulseUrl must be an http(s) URL");
    this.url          = selfimpulseUrl;
    this.policy       = new PolicyEngine(policy);
    this.maxReconnect = maxReconnectAttempts;
    this.me           = null;
    this.selfimpulseKey    = null;
    this.peers        = new Map();
  }

  on(event, fn) { return this.#bus.on(event, fn); }

  async join(name, group = "", { identity = null } = {}) {
    /* v0.10.6: an operator designates an identity by FINGERPRINT, and
       fingerprints are generated at join — so a caller may now present an
       already-known identity (from a key file, or a harness) instead of a fresh
       one. Possession of the private key IS the identity: this grants no
       authority, it makes operator designation possible at all. */
    this.#identity = identity ?? await VH.generateIdentity();
    const bundle   = await VH.publicBundle(this.#identity);

    this.#socket = io(this.url, {
      transports:           ["websocket", "polling"],
      auth:                 { protocolVersion: VH.PROTOCOL.version },
      reconnection:         true,
      reconnectionAttempts: this.maxReconnect,
      reconnectionDelay:    1_000,
      reconnectionDelayMax: 30_000,
      randomizationFactor:  0.5,
      timeout:              10_000,
    });

    /* FIX-5: the challenge listener is attached BEFORE awaiting connect.
       The server emits auth:challenge synchronously on connection; awaiting
       connect first races the event away and every join loses its challenge. */
    const challengeP = new Promise((resolve) => {
      this.#socket.once("auth:challenge", (data) => resolve(data?.challenge));
    });

    await new Promise((resolve, reject) => {
      this.#socket.once("connect",       resolve);
      this.#socket.once("connect_error", (err) => {
        const msg = err?.message ?? "";
        if (msg.includes("protocol-major-mismatch"))
          reject(new VHError("PROTOCOL_MISMATCH", `Server rejected protocol version: ${msg}`));
        else
          reject(err);
      });
    });

    const challenge = await Promise.race([
      challengeP,
      new Promise((_, reject) => setTimeout(() => reject(new VHAuthError("Challenge not received in time")), 10_000)),
    ]);

    if (typeof challenge !== "string" || challenge.length < 16)
      throw new VHAuthError("Received invalid challenge from selfimpulse");

    const fp           = this.#identity.fp;
    const challengeSig = await VH.signChallenge(this.#identity.sign.privateKey, challenge, fp);

    const res = await this._emit("user:join", { name, group, bundle, challengeSig, claimedFp: fp });
    if (!res?.ok) throw new VHAuthError(`join failed: ${res?.reason}`);

    if (res.protocol) {
      const cMaj = _parseMajor(VH.PROTOCOL.version);
      const sMaj = _parseMajor(res.protocol);
      if (cMaj !== sMaj)
        throw new VHError("PROTOCOL_MISMATCH", `Server protocol ${res.protocol} ≠ client ${VH.PROTOCOL.version}`);
      if (res.protocol !== VH.PROTOCOL.version)
        console.warn(`[VHClient] Minor version mismatch: server=${res.protocol}, client=${VH.PROTOCOL.version}`);
    }

    this.me        = res.you;
    this.selfimpulseKey = res.selfimpulse;
    res.peers.forEach((p) => { if (_validBundle(p.bundle)) this.peers.set(p.id, p); });

    this.#socket.on("peer:joined",    (p)   => { if (!_validBundle(p.bundle)) return; this.peers.set(p.id, p); this.#bus.emit("peer:joined", p); });
    this.#socket.on("peer:left",      ({ id }) => { const p = this.peers.get(id); this.peers.delete(id); this.#bus.emit("peer:left", p ?? { id }); });
    this.#socket.on("peer:rotated",   ({ id, fp, bundle: nb }) => { if (!_validBundle(nb)) return; const p = this.peers.get(id); if (p) { p.fp = fp; p.bundle = nb; } this.#bus.emit("peer:rotated", { id, fp }); });
    this.#socket.on("rtc:signal",     (msg)  => this.#bus.emit("rtc:signal",     msg));
    this.#socket.on("selfimpulse:new",      (link) => this.#bus.emit("selfimpulse:new",      link));
    this.#socket.on("selfimpulse:rejected", (r)    => this.#bus.emit("selfimpulse:rejected", r));
    this.#socket.on("rate:limited",   (r)    => this.#bus.emit("rate:limited",   r));
    this.#socket.on("checkpoint:new", async (cp) => {
      const verified = await this._verifyCheckpointObj(cp).catch(() => false);
      this.#bus.emit("checkpoint:new", { ...cp, verified });
    });
    this.#socket.on("disconnect", (reason) => this.#bus.emit("disconnect", { reason }));
    return this.me;
  }

  disconnect() { this.#socket?.disconnect(); this.#socket = null; }

  _emit(event, payload) {
    /* FIX-7: never inject an undefined payload — it arrives as `null` on the
       wire, so (cb)-only handlers (chain:get, checkpoint:get) would receive
       cb=null, never ack, and the caller would hang forever. */
    return new Promise((resolve) => {
      const ackFn = (res) => resolve(res ?? { ok: false, reason: "no-ack" });
      if (payload === undefined) this.#socket.emit(event, ackFn);
      else this.#socket.emit(event, payload, ackFn);
    });
  }

  async sealForTransport(obj) {
    if (!this.#identity) throw new VHAuthError("call join() first");
    return VH.sealSecure(obj, this.#identity.sign.privateKey);
  }

  async openFromPeer(env, peerId) {
    const peer = this.peers.get(peerId);
    if (!peer?.bundle?.signJwk) return { payload: null, verified: false, reason: "unknown-peer" };
    return VH.openSecure(env, peer.bundle.signJwk, this.#guard);
  }

  /**
   * Central submit path — all selfimpulse kinds flow through here.
   * Two checks before sealing:
   *   1. Policy engine validates the payload shape.
   *   2. assertSignerBinding() verifies signer ↔ actor (client-side half).
   */
  async _submit(facts) {
    if (!this.#identity) throw new VHAuthError("call join() first");

    /* (1) policy */
    const verdict = this.policy.selfimpulse(facts);
    if (!verdict.ok) return { ok: false, reason: `local-policy:${verdict.reason}` };

    /* (2) Sentinel: centralized signer ↔ actor binding (client-side) */
    const binding = assertSignerBinding(facts, this.me.fp);
    if (!binding.ok) return { ok: false, reason: binding.reason };

    const env = await VH.sealSecure(facts, this.#identity.sign.privateKey);
    return this._emit("selfimpulse:submit", env);
  }

  async selfimpulseShare(facts) { return this._submit(facts); }

  async selfimpulseAction({ action, tool = null, purpose = null, policy = null, evidence = null, result = "success" }) {
    return this._submit({ v: 2, kind: "agent_action", agent: { n: this.me.name, fp: this.me.fp }, action, tool, purpose, policy, evidence, result, ts: Date.now() });
  }

  async declareCapability(capabilities, meta = {}) {
    return this._submit({ v: 2, kind: "capability", agent: { n: this.me.name, fp: this.me.fp }, capabilities, meta, ts: Date.now() });
  }

  /** v0.10.3: pass `authority: { root, depth }` to issue a DELEGATED grant.
      Without it, the grant is self-attested and requires the caller to hold
      an on-record attestation (capability declaration or endorsement). */
  async authorize(peerId, action, { scope = "*", policy = "default", ttlMs = 3_600_000, authority = null } = {}) {
    const peer = this.peers.get(peerId);
    if (!peer) return { ok: false, reason: "unknown-peer" };
    if (ttlMs <= 0 || ttlMs > 30 * 24 * 3_600_000) return { ok: false, reason: "invalid-ttl" };
    return this._submit({ v: 2, kind: "authorization", from: { n: this.me.name, fp: this.me.fp }, subject: { n: peer.name, fp: peer.fp }, action, scope, policy, expiresAt: Date.now() + ttlMs, ...(authority ? { authority } : {}), ts: Date.now() });
  }

  async endorse(peerId, rating = null, reason = "") {
    const peer = this.peers.get(peerId);
    if (!peer) return { ok: false, reason: "unknown-peer" };
    return this._submit({ v: 2, kind: "endorsement", from: { n: this.me.name, fp: this.me.fp }, subject: { n: peer.name, fp: peer.fp }, rating, reason, ts: Date.now() });
  }

  async revoke(target, reason = "") {
    return this._submit({ v: 2, kind: "revocation", from: { n: this.me.name, fp: this.me.fp }, target, reason, ts: Date.now() });
  }

  reputation(fp)           { return this._emit("reputation:get",     { fp }); }
  assessRisk(fp, action)   { return this._emit("risk:assess",        { fp, action }); }
  findAuthorization(fp, a) { return this._emit("authorization:find", { fp, action: a }); }

  async rotate() {
    if (!this.#identity) throw new VHAuthError("call join() first");
    const { next, proof } = await VH.rotateIdentity(this.#identity);
    const res = await this._emit("key:rotate", proof);
    if (res.ok) { this.#identity = next; this.me.fp = res.fp; }
    return res;
  }

  chainGet()    { return this._emit("chain:get",    undefined); }
  chainVerify() { return this._emit("chain:verify", undefined); }

  async checkpoint() {
    const res = await this._emit("checkpoint:get", undefined);
    if (!res?.checkpoint) return { ok: false, reason: "no-checkpoint-yet" };
    const verified = await this._verifyCheckpointObj(res.checkpoint);
    return { ok: verified, checkpoint: res.checkpoint, verified };
  }

  async _verifyCheckpointObj(cp) {
    const jwk = this.selfimpulseKey?.jwk;
    if (!jwk) return false;
    return VH.verify(jwk, cp.statement, cp.sig);
  }

  async vaultSend(peerId, data, fileName, { chunkSize } = {}) {
    const peer = this.peers.get(peerId);
    if (!peer?.bundle) throw new VHError("UNKNOWN_PEER", "unknown peer or missing bundle");
    if (!_validBundle(peer.bundle)) throw new VHError("INVALID_BUNDLE", "peer bundle is malformed");
    const packed = await VH.vaultPack(peer.bundle, data, { chunkSize });
    const facts  = { v: 2, kind: "share", from: { n: this.me.name, fp: this.me.fp }, to: { n: peer.name, fp: peer.fp }, file: fileName, size: packed.manifest.size, hash: packed.manifest.sha256, merkleRoot: packed.manifest.merkleRoot, ok: true, ts: Date.now() };
    return { packed, facts };
  }

  async vaultReceive(packed) {
    if (!this.#identity) throw new VHAuthError("call join() first");
    return VH.vaultUnpack(this.#identity, packed);
  }

  async linkCode(peerId) {
    const peer = this.peers.get(peerId);
    if (!peer) throw new VHError("UNKNOWN_PEER", "unknown peer");
    return VH.linkFingerprint(this.me.fp, peer.fp);
  }
}

export { VH, TRUST };
