/* v0.10.3: lazy-load the crypto module. The trust layer's pure analysis
   functions (findAuthorization, computeReputationSignals, assessActionRisk,
   grant-authority checks) must stay importable with ZERO npm dependencies —
   the bridge gate runs them without an install. Only the selfimpulse builders,
   which seal envelopes, load si-crypto on first use. */
let _sealSecure = null;
async function sealSecure(facts, privateKey) {
  if (!_sealSecure) ({ sealSecure: _sealSecure } = await import("./si-crypto.js"));
  return _sealSecure(facts, privateKey);
}

export const SELFIMPULSE_KINDS = Object.freeze([
  "share", "agent_action", "capability",
  "endorsement", "authorization", "revocation",
]);

/* ── time-decay constants ── */
const ONE_WEEK_MS  = 7 * 24 * 3_600_000;
const DECAY_LAMBDA = 0.5;   // λ: half-life ≈ 10 days

/** Exponential decay weight for an event that happened `ageMs` ago. */
function _decayWeight(ageMs) {
  if (ageMs <= 0) return 1.0;
  return Math.exp(-DECAY_LAMBDA * ageMs / ONE_WEEK_MS);
}

/* ── prototype-pollution-safe JSON parse ── */
function _safeParse(str) {
  try {
    const obj = JSON.parse(str);
    if (obj !== null && typeof obj === "object" && !Array.isArray(obj)) {
      /* FIX-8: own-property check ONLY. `in` walks the prototype chain, so
         "constructor" in obj is true for EVERY object; the v0.10.1 guard
         nulled every parsed payload and silently disabled the trust layer. */
      if (Object.hasOwn(obj, "__proto__") || Object.hasOwn(obj, "constructor") || Object.hasOwn(obj, "prototype")) return null;
    }
    return obj;
  } catch { return null; }
}

/* ── selfimpulse builders (unchanged) ── */

export async function selfimpulseAgentAction(identity, {
  agent, action, tool = null, purpose = null, policy = null, evidence = null, result = "success",
}) {
  _requireAgentArg(agent, "selfimpulseAgentAction");
  _requireString(action,  "selfimpulseAgentAction.action");
  return sealSecure({
    v: 2, kind: "agent_action",
    agent: { n: _sanitizeName(agent.name), fp: agent.fp },
    action: _sanitizeStr(action, 120), tool,
    purpose: _sanitizeStr(purpose, 200),
    policy, evidence: _sanitizeStr(evidence, 2000), result,
    ts: Date.now(),
  }, identity.sign.privateKey);
}

export async function declareCapability(identity, { agent, capabilities, meta = {} }) {
  _requireAgentArg(agent, "declareCapability");
  if (!Array.isArray(capabilities) || capabilities.length === 0)
    throw new Error("declareCapability: capabilities must be a non-empty array");
  return sealSecure({
    v: 2, kind: "capability",
    agent: { n: _sanitizeName(agent.name), fp: agent.fp },
    capabilities: capabilities.map((c) => _sanitizeStr(String(c), 120)),
    meta: _sanitizeMeta(meta),
    ts: Date.now(),
  }, identity.sign.privateKey);
}

export async function grantAuthorization(identity, {
  from, subject, action, scope = "*", policy = "default", expiresAt,
}) {
  _requireAgentArg(from,    "grantAuthorization.from");
  _requireAgentArg(subject, "grantAuthorization.subject");
  _requireString(action,    "grantAuthorization.action");
  if (typeof expiresAt !== "number" || expiresAt <= Date.now())
    throw new Error("grantAuthorization: expiresAt must be a future timestamp");
  return sealSecure({
    v: 2, kind: "authorization",
    from:    { n: _sanitizeName(from.name),    fp: from.fp    },
    subject: { n: _sanitizeName(subject.name), fp: subject.fp },
    action: _sanitizeStr(action, 120),
    scope:  _sanitizeStr(scope,  120),
    policy, expiresAt,
    ts: Date.now(),
  }, identity.sign.privateKey);
}

export async function endorseAgent(identity, { from, subject, rating = null, reason = "" }) {
  _requireAgentArg(from,    "endorseAgent.from");
  _requireAgentArg(subject, "endorseAgent.subject");
  return sealSecure({
    v: 2, kind: "endorsement",
    from:    { n: _sanitizeName(from.name),    fp: from.fp    },
    subject: { n: _sanitizeName(subject.name), fp: subject.fp },
    rating, reason: _sanitizeStr(reason, 500),
    ts: Date.now(),
  }, identity.sign.privateKey);
}

export async function revokeStatement(identity, { from, target, reason = "" }) {
  _requireAgentArg(from, "revokeStatement.from");
  if (!target || typeof target !== "object") throw new Error("revokeStatement: target must be object");
  return sealSecure({
    v: 2, kind: "revocation",
    from:   { n: _sanitizeName(from.name), fp: from.fp },
    target, reason: _sanitizeStr(reason, 500),
    ts: Date.now(),
  }, identity.sign.privateKey);
}

/* ── chain analysis ── */

function _parseLinks(links) {
  const out = [];
  for (const l of links) {
    const facts = _safeParse(l.payloadStr);
    if (facts && typeof facts === "object") out.push({ link: l, facts });
  }
  return out;
}

export function findAuthorization(fp, action, links, now = Date.now(), { grantPolicy = "strict", authorities = [], wildcardAuthorities = null } = {}) {
  if (typeof fp !== "string" || typeof action !== "string") return null;
  const parsed  = _parseLinks(links);
  const revoked = _revokedActions(parsed, fp, _authorizedFps(parsed, wildcardAuthorities ?? authorities));
  for (let i = parsed.length - 1; i >= 0; i--) {
    const { link, facts } = parsed[i];
    if (facts.kind !== "authorization")                  continue;
    if (facts.subject?.fp !== fp)                        continue;
    if (facts.action !== action && facts.action !== "*") continue;
    if (revoked.has(facts.action) || revoked.has("*"))   continue;
    if (typeof facts.expiresAt === "number" && facts.expiresAt < now) continue;
    if (link.fp && link.fp !== facts.from?.fp)           continue;   // signer binding
    /* v0.10.4 RULE 3, consumption side: the issuer must STILL hold coverage
       when the grant is used. Catches grants issued before this rule existed,
       and grants whose issuer has since been narrowed or revoked. Defence in
       depth — issuance is already gated, this closes the upgrade window. */
    if (grantPolicy === "strict" &&
        !canDelegate(facts.from?.fp, facts.action, facts.scope, links, now, { authorities: wildcardAuthorities ?? authorities }).ok)
      continue;
    return facts;
  }
  return null;
}

/* ═══════════════════════════════════════════════════════════════════════════
 * SENTINEL: computeReputationSignals() — capability-specific + time decay
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * byCapability breakdown
 * ──────────────────────
 * For each distinct action name in authorized agent_action records:
 *   count        : raw count of successful actions of that type
 *   decayedWeight: sum of e^(-λ * ageMs / ONE_WEEK) over those actions
 *                  → recent actions contribute more than old ones
 *   lastSeen     : timestamp of the most recent action of that type
 *
 * Example for VH:
 *   byCapability = {
 *     execute_trade:     { count: 47, decayedWeight: 31.2, lastSeen: <ts> },
 *     read_market_data:  { count: 203, decayedWeight: 108.1, lastSeen: <ts> },
 *     code_review:       { count: 12, decayedWeight: 4.8, lastSeen: <ts> },
 *   }
 *
 * This lets a delegator ask: "does Bob's execute_trade reputation
 * justify this specific authorization?" rather than collapsing all
 * capabilities into one undifferentiated number.
 *
 * recentWeight = sum of decayedWeights across all capabilities.
 *
 * LIMITATIONS (unchanged — see v0.9 notes)
 *   Sybil, collusion, fake endorsements, reputation farming, evidence quality.
 *   rawScore and recentWeight must NOT be used as access-control inputs.
 *   Use findAuthorization() + assessActionRisk() for access decisions.
 * ═══════════════════════════════════════════════════════════════════════════ */
export function computeReputationSignals(fp, links, now = Date.now()) {
  if (typeof fp !== "string") return null;
  const parsed = _parseLinks(links);

  /* collect revocations for this fp */
  const revokedActions = new Set();
  let   globalRevoke   = false;
  for (const { facts } of parsed) {
    if (facts.kind === "revocation" && facts.target?.fp === fp) {
      if (facts.target.action) revokedActions.add(facts.target.action);
      else globalRevoke = true;
    }
  }

  const signals = {
    fp,
    totalSelfImpulsees:           0,
    shares:                 0,
    authorizedActions:      0,
    capabilities:           0,
    endorsementsGiven:      0,
    endorsementsReceived:   0,
    ratingSum:              0,
    ratingCount:            0,
    authorizationsReceived: 0,
    revocationsAgainst:     0,
    /* Sentinel additions */
    byCapability:           {},   // { [action]: { count, decayedWeight, lastSeen } }
    recentWeight:           0,    // sum of decayedWeights across all capabilities
    /* metadata */
    avgRating:              null,
    rawScore:               0,
    scoreNote:              "raw-audit-signal-only",
    decayLambda:            DECAY_LAMBDA,
    decayHalfLifeDays:      Math.round(ONE_WEEK_MS * Math.LN2 / DECAY_LAMBDA / 86_400_000 * 10) / 10,
  };

  for (const { facts } of parsed) {
    const byMe = facts.from?.fp === fp || facts.agent?.fp === fp;
    if (byMe) signals.totalSelfImpulsees++;

    switch (facts.kind) {
      case "share":
        if (facts.from?.fp === fp) signals.shares++;
        break;

      case "agent_action": {
        if (facts.agent?.fp !== fp) break;
        /* FIX-9: byCapability is DESCRIPTIVE audit history — a revocation must
           not retroactively erase observed actions (v0.10.1 contradicted its own
           selftest here). Revocation is already scored via revocationsAgainst
           (-5 in rawScore) and enforced on the access path by findAuthorization. */
        signals.authorizedActions++;

        /* Sentinel: per-capability time-decayed accounting */
        const action   = facts.action ?? "unknown";
        const ageMs    = Math.max(0, now - (facts.ts ?? now));
        const weight   = _decayWeight(ageMs);
        const ts       = facts.ts ?? now;

        if (!signals.byCapability[action]) {
          signals.byCapability[action] = { count: 0, decayedWeight: 0, lastSeen: 0 };
        }
        const cap = signals.byCapability[action];
        cap.count         += 1;
        cap.decayedWeight += weight;
        if (ts > cap.lastSeen) cap.lastSeen = ts;
        signals.recentWeight += weight;
        break;
      }

      case "capability":
        if (facts.agent?.fp === fp) signals.capabilities++;
        break;

      case "endorsement":
        if (facts.from?.fp === fp)    signals.endorsementsGiven++;
        if (facts.subject?.fp === fp) {
          signals.endorsementsReceived++;
          if (typeof facts.rating === "number") {
            signals.ratingSum   += facts.rating;
            signals.ratingCount += 1;
          }
        }
        break;

      case "authorization":
        if (facts.subject?.fp === fp) signals.authorizationsReceived++;
        break;

      case "revocation":
        if (facts.target?.fp === fp) signals.revocationsAgainst++;
        break;
    }
  }

  signals.avgRating = signals.ratingCount ? signals.ratingSum / signals.ratingCount : null;

  /* rawScore: transparent audit convenience — NOT access-control input */
  signals.rawScore = Math.max(0,
    signals.shares               *  1 +
    signals.authorizedActions    *  2 +
    signals.endorsementsReceived *  3 +
    signals.authorizationsReceived * 1 -
    signals.revocationsAgainst   *  5,
  );

  return signals;
}

/** @deprecated Use computeReputationSignals(). Kept for backward compatibility. */
export const computeReputation = computeReputationSignals;

/* ═══════════════════════════════════════════════════════════════════════════
 * v0.10.3 — GRANT AUTHORITY (explicit threat-model decision, see THREAT-MODEL.md)
 * ─────────────────────────────────────────────────────────────────────────────
 * RULE 1 (attested granter): an authorization may only be issued by an
 *   identity with an on-record attestation on this selfimpulse — an unrevoked
 *   capability declaration or an endorsement RECEIVED. An unknown signer
 *   cannot mint grants ("Agent A signs → Agent B authorized" is refused).
 * RULE 2 (delegation chains): a grant may carry authority = { root, depth }.
 *   depth ≥ 1 requires (a) the root itself is attested and (b) the granter
 *   HOLDS a live grant from that root — sub-granting is delegated, never
 *   self-invented. Depth is capped (config maxDelegationDepth, default 2).
 * Bootstrap is an on-record capability claim (reputation-weighted, revocable);
 * human-root authority via Patina's human-principal envelopes is roadmap.
 * ═══════════════════════════════════════════════════════════════════════════ */
/**
 * The operator-authorised set, resolved through recorded key rotations.
 * An operator designates an IDENTITY, not a bare key: a rotation is recorded
 * only after the harbour verifies a proof signed by the OUTGOING key
 * ("key:rotate"), and "rotate" is not a member-submittable kind (SELFIMPULSE_KINDS),
 * so this lineage cannot be forged from a message.
 */
function _authorizedFps(parsed, authorities) {
  const set = new Set(Array.isArray(authorities) ? authorities : []);
  for (let hop = 0; hop < 64; hop++) {
    const before = set.size;
    for (const { facts } of parsed)
      if (facts.kind === "rotate" && facts.from && facts.to && set.has(facts.from))
        set.add(facts.to);
    if (set.size === before) break;
  }
  return set;
}

/**
 * RULE 6 (v0.10.7) — WHO may revoke WHOM.
 * A revocation against an ordinary identity is honoured from anyone (unchanged).
 * A revocation against a DESIGNATED identity only counts when the writer is
 * itself authorised — the harbour root, or a fingerprint the operator named.
 * Otherwise any member could file `revocation{target: <operator>}` and switch
 * off the principal that hands authority out (a governance denial-of-service
 * measured by wcarena/warrant-compromise-campaign.mjs). Gating happens here, at
 * consumption, so records already in a ledger are covered too — and again at
 * submission (selfimpulse.js) so they are not written in the first place.
 */
function _revokedActions(parsed, targetFp, authorized) {
  const revoked = new Set();
  for (const { link, facts } of parsed) {
    if (facts.kind !== "revocation" || facts.target?.fp !== targetFp) continue;
    const by = link?.fp ?? facts.from?.fp;
    if (authorized.has(targetFp) && !authorized.has(by)) continue;
    revoked.add(facts.target.action ?? "*");
  }
  return revoked;
}

/** The authority-managing set, resolved through recorded rotations. */
export function authorityFps(links, { authorities = [], wildcardAuthorities = null } = {}) {
  return _authorizedFps(_parseLinks(links), wildcardAuthorities ?? authorities);
}

export function isAttested(fp, links, now = Date.now(), opts = {}) {
  if (typeof fp !== "string" || !fp) return false;
  const parsed = _parseLinks(links);
  /* An OPERATOR-AUTHORISED identity is attested by construction: designation is
     the operator's own statement about who this is, which is strictly stronger
     than a self-declared capability (a claim the harbour merely records). */
  const designated = _authorizedFps(parsed, opts.authorities ?? opts.wildcardAuthorities ?? []);
  if (designated.has(fp)) return true;
  /* RULE 6: revocations carry authority weight only from an authorised writer
     when the target is designated — `_revokedActions` applies that gate, so a
     stranger's record no longer strips the operator's attestation. */
  const revoked = _revokedActions(parsed, fp, designated);
  if (revoked.has("*") || revoked.has("capability")) return false;
  for (const { facts } of parsed) {
    if (facts.kind === "capability" && facts.agent?.fp === fp) return true;
    if (facts.kind === "endorsement" && facts.subject?.fp === fp) return true;
  }
  return false;
}

/* ═══════════════════════════════════════════════════════════════════════════
 * v0.10.4 — SCOPE-BOUNDED DELEGATION  (closes self-attestation amplification)
 * ─────────────────────────────────────────────────────────────────────────────
 * RULE 3 (coverage — NEW): a granter may only hand out authority it HOLDS.
 *   v0.10.3 enforced WHO may delegate (attested) but never WHAT may be
 *   delegated. Any attested identity could therefore mint authority for any
 *   action — including actions it had no capability to perform. That is
 *   privilege amplification, and it was reachable by any participant.
 *
 *   A granter now needs, in its own right:
 *     a) the exact action (or "*"), held via a capability declaration or a
 *        live grant naming it as subject, OR
 *     b) a delegation token for the grant's scope — "delegate:<scope>" or
 *        "admin:<scope>" (or the "*" forms), OR
 *     c) for a "*" grant: a "*"-class token. A narrow capability can never be
 *        widened into unbounded authority.
 *   Anything else is refused with `grantor-out-of-scope`. Deny by default.
 *
 * COMPAT: HANDLE_GRANT_POLICY=compat restores v0.10.3 attested-only semantics and
 *   logs the bypass. HANDLE_GRANT_POLICY=off disables the gate entirely.
 *   These exist for migration only; both widen the attack surface.
 * ═══════════════════════════════════════════════════════════════════════════ */

/** Every capability token `fp` holds in its own right (revocation + expiry aware). */
export function heldTokens(fp, links, now = Date.now(), { authorities = [], wildcardAuthorities = null } = {}) {
  const parsed = _parseLinks(links);
  /* RULE 6: the same revocation gate as delegable authority — an unauthorised
     record against a DESIGNATED identity is inert, here as everywhere else. */
  const revoked = _revokedActions(parsed, fp, _authorizedFps(parsed, wildcardAuthorities ?? authorities));
  const tokens = new Set();
  const add = (t) => {
    if (typeof t !== "string" || !t) return;
    if (revoked.has(t) || revoked.has("*")) return;
    tokens.add(t);
  };
  for (const { facts } of parsed) {
    if (facts.kind === "capability" && facts.agent?.fp === fp)
      for (const c of facts.capabilities ?? []) add(c);
    if (facts.kind === "authorization" && facts.subject?.fp === fp &&
        (typeof facts.expiresAt !== "number" || facts.expiresAt >= now))
      add(facts.action);
  }
  return tokens;
}

/**
 * May `fp` delegate `action` within `scope`? Deny by default (RULE 3).
 * Pure: reads the ledger, mutates nothing. `allowLegacy` restores v0.10.3.
 */
/**
 * What `fp` may HAND OUT — v0.10.6 RULE 5, AUTHORITY PROVENANCE.
 *
 * RULE 3 asked whether a granter holds what it hands out; RULE 4 stopped
 * wildcards from being self-declared. Both still read "holding" out of
 * `heldTokens()`, which treats a SELF-SIGNED capability declaration as
 * delegable authority. So a participant could still declare ["write:payroll"]
 * for itself and mint a real payroll grant — no "*", no forgery, no collusion.
 *
 * RULE 5 separates the two concepts the protocol had been conflating:
 *
 *   CAPABILITY CLAIM   "I claim I can do X."   → descriptive: reputation,
 *                                               capability reporting, audit.
 *   DELEGABLE AUTHORITY "The harbour recognizes that I may grant X."
 *                                              → provenance required.
 *
 * Delegable authority comes only from:
 *   a) a LIVE GRANT naming `fp` as subject (someone already authorized gave it),
 *   b) a capability declaration by an OPERATOR-AUTHORIZED identity — the harbour
 *      root key, or a fingerprint named in HANDLE_AUTHORITIES.
 * Everything else is a claim, and a claim is not a licence.
 */
export function delegableTokens(fp, links, now = Date.now(), opts = {}) {
  const authorities = opts.authorities ?? opts.wildcardAuthorities ?? [];
  const onStrip = typeof opts.onStrip === "function" ? opts.onStrip : null;
  const parsed = _parseLinks(links);

  /* RULE 5 lineage — designation follows the identity across a proven rotation
     (see _authorizedFps). Nothing else carries designation across. */
  const authorizedSet = _authorizedFps(parsed, authorities);
  const authorized    = authorizedSet.has(fp);
  const revoked       = _revokedActions(parsed, fp, authorizedSet);
  const tokens = new Set();
  const add = (t) => {
    if (typeof t !== "string" || !t) return;
    if (revoked.has(t) || revoked.has("*")) return;
    tokens.add(t);
  };
  for (const { facts } of parsed) {
    /* (a) GIVEN — a live grant naming fp. Revocation- and expiry-aware. */
    if (facts.kind === "authorization" && facts.subject?.fp === fp &&
        (typeof facts.expiresAt !== "number" || facts.expiresAt >= now))
      add(facts.action);
    /* (b) CLAIMED — only an operator-authorized identity may delegate its claims. */
    if (authorized && facts.kind === "capability" && facts.agent?.fp === fp)
      for (const c of facts.capabilities ?? []) add(c);
  }
  /* RULE 4 stands: "*"-class tokens are never delegable without designation. */
  if (!authorized)
    for (const t of [...tokens])
      if (t === "*" || t === "delegate:*" || t === "admin:*") { tokens.delete(t); onStrip?.(t); }
  return tokens;
}

/**
 * May `fp` delegate `action` within `scope`? Deny by default (RULES 3+4+5).
 * Derives from DELEGABLE authority, never from a bare claim. `allowLegacy`
 * (HANDLE_GRANT_POLICY=compat) restores the pre-0.10.6 semantics for migration.
 */
export function canDelegate(fp, action, scope, links, now = Date.now(), opts = {}) {
  const allowLegacy = opts.allowLegacy === true;
  const authorities = opts.authorities ?? opts.wildcardAuthorities ?? [];
  if (allowLegacy) return { ok: true, reason: "legacy-attested-granter", held: [], delegable: [] };
  if (typeof action !== "string" || !action) return { ok: false, reason: "missing-action", held: [], delegable: [] };

  const claims = heldTokens(fp, links, now, { authorities });
  const strippedWildcard = [];
  const tokens = delegableTokens(fp, links, now, { authorities, onStrip: (t) => strippedWildcard.push(t) });
  const held      = [...claims];
  const delegable = [...tokens];
  const sc = typeof scope === "string" && scope && scope !== "*" ? scope : "";

  if (tokens.size === 0) {
    /* The claim may well cover the action — and it still is not a licence.
       Name the rule that refused, so the audit says WHY: a wildcard-class token
       (claimed or granted) stripped for lack of designation is RULE 4; a named
       claim that covers the action is RULE 5; otherwise nothing was held. */
    const wild = claims.has("*") || claims.has("delegate:*") || claims.has("admin:*") ||
      strippedWildcard.length > 0;
    const claimCovers = claims.has("*") || claims.has(action) ||
      (sc && (claims.has(`delegate:${sc}`) || claims.has(`admin:${sc}`)));
    const reason = wild
      ? "wildcard-authority-not-designated"
      : claimCovers ? "capability-claim-is-not-authority" : "grantor-holds-nothing";
    return { ok: false, reason, held, delegable };
  }

  if (action === "*") {
    const hasUnboundedToken = tokens.has("*") || tokens.has("delegate:*") || tokens.has("admin:*");
    return hasUnboundedToken
      ? { ok: true, reason: "unbounded-delegation", held, delegable }
      : { ok: false, reason: "wildcard-grant-requires-wildcard-authority", held, delegable };
  }
  if (tokens.has("*") || tokens.has(action)) return { ok: true, reason: "holds-action", held, delegable };
  if (tokens.has("delegate:*") || tokens.has("admin:*")) return { ok: true, reason: "delegates-all", held, delegable };
  if (sc && (tokens.has(`delegate:${sc}`) || tokens.has(`admin:${sc}`)))
    return { ok: true, reason: "delegates-scope", held, delegable };
  return { ok: false, reason: "grantor-out-of-scope", held, delegable };
}

export function verifyGrantAuthority(granterFp, facts, links, { maxDepth = 2, now = Date.now(), grantPolicy = "strict", authorities = [], wildcardAuthorities = null } = {}) {
  if (typeof granterFp !== "string" || !granterFp) return { ok: false, reason: "grantor-unattested" };
  if (grantPolicy === "off") return { ok: true, depth: 0, reason: "grant-policy-off" };
  const allowLegacy = grantPolicy !== "strict";
  const authz = wildcardAuthorities ?? authorities;

  const auth = facts?.authority;
  if (auth == null) {
    if (!isAttested(granterFp, links, now, { authorities: authz })) return { ok: false, reason: "grantor-unattested" };
    /* v0.10.4 RULE 3: attestation says you may delegate; coverage says WHAT. */
    const cov = canDelegate(granterFp, facts?.action, facts?.scope, links, now, { allowLegacy, authorities: authz });
    return cov.ok
      ? { ok: true, depth: 0, reason: `attested-granter:${cov.reason}`, held: cov.held }
      : { ok: false, reason: cov.reason, held: cov.held };
  }
  if (typeof auth !== "object" || Array.isArray(auth) ||
      typeof auth.root !== "string" || !auth.root ||
      !Number.isInteger(auth.depth) || auth.depth < 1)
    return { ok: false, reason: "malformed-authority" };
  if (auth.depth > maxDepth) return { ok: false, reason: "delegation-depth-exceeded" };
  if (!isAttested(auth.root, links, now, { authorities: authz })) return { ok: false, reason: "authority-root-unattested" };
  /* the granter must HOLD a live grant from the claimed root (revocation +
     expiry aware) — delegation is real, not self-declared */
  const parsed  = _parseLinks(links);
  const revoked = _revokedActions(parsed, granterFp, _authorizedFps(parsed, authz));
  const parent = parsed
    .map(({ facts: f }) => f)
    .filter((f) =>
      f.kind === "authorization" && f.from?.fp === auth.root && f.subject?.fp === granterFp &&
      !revoked.has(f.action) && !revoked.has("*") &&
      (typeof f.expiresAt !== "number" || f.expiresAt >= now));
  if (parent.length === 0) return { ok: false, reason: "no-parent-grant" };
  /* v0.10.4 RULE 3 on the delegated path too: the parent must cover what is
     being passed on. Sub-delegation can narrow, never widen. */
  if (!allowLegacy) {
    /* a parent "*" grant only covers on down the chain when its ISSUER was
       designated (RULE 4) — unbounded authority is never transitive */
    const designated = new Set(Array.isArray(authz) ? authz : []);
    const covered = parent.some((f) => f.action === facts?.action || (f.action === "*" && designated.has(f.from?.fp))) ||
      canDelegate(granterFp, facts?.action, facts?.scope, links, now, { authorities: authz }).ok;
    if (!covered) return { ok: false, reason: "grantor-out-of-scope", held: parent.map((f) => f.action) };
  }
  return { ok: true, depth: auth.depth, reason: "delegated-authority" };
}

export function assessActionRisk(fp, action, links, now = Date.now(), { authorities = [], wildcardAuthorities = null } = {}) {
  if (typeof fp !== "string" || typeof action !== "string")
    return { level: "error", reason: "invalid-args" };
  const parsed  = _parseLinks(links);
  const revoked = parsed.some(({ facts }) =>
    facts.kind === "revocation" && facts.target?.fp === fp &&
    (facts.target.action === action || !facts.target.action));
  if (revoked) return { level: "blocked",      reason: "authorization-revoked" };
  const grant = findAuthorization(fp, action, links, now, { authorities, wildcardAuthorities });
  if (!grant)  return { level: "unauthorized", reason: "no-valid-authorization" };
  const ttl = grant.expiresAt ? grant.expiresAt - now : Infinity;
  if (ttl < 60_000) return { level: "high", reason: "grant-expires-soon", grant, ttlMs: ttl };
  return { level: "ok", reason: "authorized", grant, ttlMs: ttl, delegator: grant.from?.fp };
}

/* ── sanitization helpers ── */
function _sanitizeStr(s, maxLen) { if (s == null) return null; return String(s).trim().slice(0, maxLen); }
function _sanitizeName(n)         { return _sanitizeStr(n, 60) || ""; }
function _sanitizeMeta(m) {
  if (!m || typeof m !== "object" || Array.isArray(m)) return {};
  const safe = Object.create(null);
  for (const [k, v] of Object.entries(m))
    if (typeof k === "string" && k.length <= 40 && typeof v === "string") safe[k] = v.slice(0, 200);
  return safe;
}
function _requireAgentArg(a, ctx) {
  if (!a || typeof a.fp !== "string" || !a.fp) throw new Error(`${ctx}: agent must have a fp string`);
}
function _requireString(s, ctx) {
  if (typeof s !== "string" || !s.trim()) throw new Error(`${ctx}: must be a non-empty string`);
}
