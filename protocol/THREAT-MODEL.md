# SelfImpulse Protocol — Threat Model & Trust Decisions (v0.10.7)

This file records the **explicit trust-model decisions** of the protocol,
including the answer to the question every reviewer asks:

> *"Only an authorized principal may grant authorization — who watches the grantors?"*

## Decision 1 — Attested granters (17.6.1 / v0.10.3, enforced mechanically)

An `authorization` selfimpulse is accepted by a selfimpulse **only if the granter holds
an on-record attestation on that selfimpulse**:

- an unrevoked **capability declaration**, or
- an **endorsement received**.

A valid signature alone is not enough. The v0.10.2 hole —

```
Agent A signs authorization → Agent B is now authorized
```

— is refused with `policy:grantor-unattested`. Signing proves *who spoke*;
attestation proves *who is trusted enough to delegate*.

**Bootstrap.** The first attestation on any selfimpulse is an on-record capability
claim. That is deliberate: it is identity-bound, carries reputation
consequences, is revocable, and is visible to every auditor of the chain.
Anonymous authority creation does not exist.

**Revocation is live.** A revocation with `target.kind: "capability"` or
`target.action: "*"` against the granter removes their attestation;
subsequent grants fail immediately. Existing grants remain subject to the
normal expiry/revocation rules at lookup time (`findAuthorization`).

## Decision 2 — Capped delegation chains

Grants may carry `authority: { root, depth }`:

- `depth ≥ 1` requires that the **root is attested** AND that the granter
  **holds a live grant from that root** (expiry + revocation aware).
  Delegation is delegated — never self-invented.
- Depth is capped by `HANDLE_MAX_DELEGATION_DEPTH` (default **2**, range 0–8).
  Beyond the cap: `policy:delegation-depth-exceeded`.
- A grant without `authority` is self-attested (Decision 1 applies).

## Decision 3 — Coverage: a granter may only delegate what it holds (17.10 / v0.10.4)

**The defect this closes.** Decisions 1 and 2 answered *who* may delegate and
*how deep* a chain may run. Neither asked *what* may be delegated. Any attested
identity could therefore mint authority for any action — including actions it
had no capability to perform. Attestation was being read as authority, but a
capability declaration is a **self-signed claim**; it is not a grant.

This was reachable by any participant and required no forgery, no collusion and
no key compromise. It is privilege amplification.

`verifyGrantAuthority` now requires the granter to hold, in its own right:

- the **exact action** (or `*`), held via a capability declaration or a live
  grant naming it as subject — revocation- and expiry-aware; **or**
- a **delegation token for the grant's scope**: `delegate:<scope>` or
  `admin:<scope>`, or their `*` forms; **or**
- for a `*` grant specifically, a `*`-class token. A narrow capability can
  never be widened into unbounded authority.

Anything else is refused with `policy:grantor-out-of-scope`. **Deny by default.**

**Sub-delegation may narrow, never widen:** a delegated grant is accepted only
when the parent grant covers what is being passed on.

`findAuthorization` re-checks issuer coverage at **consumption** time as well, so
a grant whose issuer has since been narrowed or revoked stops working — closing
the upgrade window for ledgers written under the old rule.

**Posture.** `HANDLE_GRANT_POLICY` selects `strict` (default) / `compat` (v0.10.3
attested-only — migration only, reopens the defect) / `off` (test fixtures
only). Refusals increment `metrics.grantAuthorityRejected` and are audited with
the action, the scope, and the tokens the granter actually held.

**Standing vs. scope.** Endorsement supplies *standing* (Decision 1).
Capability supplies *scope* (this Decision). Both are now required.

### RULE 4 — unbounded authority is never a self-claim (v0.10.5)

RULE 3 asked *may this granter hand out what it HOLDS?* — but "holding" was still
established by a **self-signed capability declaration**. Found by the 17.10.3
adversarial campaign against the running server: any participant could join,
`declareCapability(["*"])` (or `["delegate:*"]`), and then mint unbounded
authority to an accomplice. The release that closed "attestation read as
authority" had left the same amplification one level up.

A `*`-class token (`*`, `delegate:*`, `admin:*`) now counts **only when the
harbour DESIGNATED its holder**:

- the harbour's own **root key** is designated automatically, and
- operators may name fingerprints explicitly: `HANDLE_WILDCARD_AUTHORITIES=<fp>,<fp>`.

Everyone else's claim is refused with `policy:wildcard-authority-not-designated`
and the claim itself is recorded in the audit line's `held` array. Unbounded
authority is **never transitive**: holding `*` through a grant does not let a
non-designated identity mint `*`. Named capabilities are unaffected, so the
ordinary "'I hold write:offers, I may delegate write:offers' path is unchanged.
`HANDLE_GRANT_POLICY=compat` restores the previous semantics for migration only.

**Operational note.** Fingerprints are generated when an identity first joins,
so designation is: let the identity join once, read its fingerprint from the
harbour log, then start the harbour with `HANDLE_WILDCARD_AUTHORITIES` naming it.

### RULE 5 — a capability claim is not a licence (v0.10.6)

RULES 3 and 4 both asked *may this granter hand out what it HOLDS?* — but for
**named** tokens "holding" was still established by a **self-signed capability
declaration**. Found by an external review of the 17.10.3 campaign, reproduced
from the trust code alone: `heldTokens()` → `canDelegate()` → `{ ok: true,
reason: "attested-granter:holds-action" }`. Any participant could join, declare
`["write:payroll"]` (no `*`, no forgery, no collusion) and mint a real payroll
grant to an accomplice. The release that closed *unbounded* self-authority had
left the *named* case standing.

RULE 5 separates two things the protocol had been conflating:

| | |
|---|---|
| **capability claim** — "I can do X" | descriptive: reputation, capability reporting, audit, UI |
| **delegable authority** — "the harbour recognizes that I may grant X" | provenance required |

Delegable authority has exactly two sources:

1. a **live grant** naming the fingerprint as subject (revocation- and
   expiry-aware), or
2. a declaration by an **operator-authorized identity** — the harbour root key,
   or a fingerprint named in `HANDLE_AUTHORITIES` (the v0.10.5 name
   `HANDLE_WILDCARD_AUTHORITIES` is still read).

Everything else is a claim. `canDelegate()` derives from the delegable set, never
from a bare claim, and names the rule that refused: `capability-claim-is-not-authority`
(a claim covers the action) or `grantor-holds-nothing` (nothing held). RULE 4's
`wildcard-authority-not-designated` still speaks for `*`-class tokens.

**Designation attaches to the identity, not to the key material.** A key rotation
is recorded in the ledger only after the harbour verifies a proof signed by the
**outgoing** key (`key:rotate`), and `rotate` is not a member-submittable kind
(`SELFIMPULSE_KINDS`), so lineage cannot be forged from a message. A designated
identity's successor therefore inherits its designation, transitively along
recorded rotations. **Grants and revocations, by contrast, stay keyed to the exact
fingerprint that was named** — deliberately: if grants followed lineage, a revoked
key could rotate once and walk out of its own revocation.

**Designation is also attestation.** RULE 1 asked whether an issuer is
*attested* (a capability claim or an endorsement). An operator-authorised
identity is attested by construction: designation is the operator's own statement
about who this is, which is strictly stronger than a claim the harbour merely
records. Without that, an operator's designated key would be refused as
`grantor-unattested` — authority the operator believes it delegated but cannot use.

**Bootstrap, so a real organisation can still work.** Name the organisation's key
(`HANDLE_AUTHORITIES=<fp>`); that identity declares its scope tokens
(`delegate:<scope>`, `admin:<scope>`, or named actions) and hands grants to
members, who may sub-delegate inside them. A fresh harbour with no designation
hands out nothing it was not told to — the failure mode is refusal, not silence.

**Upgrade impact.** An identity that used to self-declare a token and grant it now
needs either designation or a grant. `HANDLE_GRANT_POLICY=compat` restores the
previous semantics for migration only; `strict` is the default and the shipped
posture. Tests: selftest grant-authority section (**171/171**) plus the rewritten
`wcarena/adversarial-campaign.mjs` — **14/14 attack classes refused, legitimate
control intact** — which now runs every honest actor on GRANTED authority, so a
refusal proves the bound rather than the absence of a setup. The reviewer's
five cases — self-`write:payroll` ⇒ refused · self-`admin:finance` ⇒ refused ·
operator-authorized ⇒ allowed · valid parent ⇒ narrower child allowed · valid
parent ⇒ wider child refused.

**Residual risk, stated.** RULE 4 removed the unbounded case; the named case
was removed by RULE 5 below. What remains true is that a claim is still a claim:
it is recorded, reputation-weighted, revocable and visible — it just no longer
licenses a grant. Nothing here claims a harbour that works without an operator
ever deciding who speaks for it.

### RULE 6 — possession, and who may revoke whom (v0.10.7)

The attacker-grade campaign shipped in 17.10.4 MEASURED two bounds and reported
them rather than hiding them. Both are closed here; the campaign legs that found
them are now scored attacks (`wcarena/warrant-compromise-campaign.mjs`).

**(1) A rotation proof must prove possession of the INCOMING key.** v0.10.6 and
earlier verified continuity only — a signature by the outgoing key over the new
bundle — and then adopted whatever bundle the caller named. A joined member could
therefore name an **offline** identity's public bundle as its successor: it showed
up as that fingerprint, and because the duplicate-fingerprint check only covers
identities currently connected, the real keyholder was locked out
(`fp-already-joined`). Not privilege escalation — the squatter could not sign as
the victim (`bad-signature`) — but impersonation plus denial of identity. From
v0.10.7 the proof carries a **second signature by the new private key** over
`VH-ROTATE-POP-v1 | oldFp | newFp | ts`, verified against the incoming bundle and
bound to the caller's authenticated fingerprint. No `pop`, a wrong key, or a
mismatched `oldFp` fails closed (`invalid-rotation-proof`).

**(2) Authority is withdrawn by authority.** Any member could file
`revocation{target: <designated identity>}` and switch that principal off — and it
was **sticky**: re-declaring the scope did not restore it, because revocations are
keyed to the fingerprint and live in the ledger. No privilege was gained, but the
principal that hands authority out could be silenced by anyone. From v0.10.7 a
revocation against a **designated** identity is honoured only from an authorised
writer (the harbour root, or a fingerprint in `HANDLE_AUTHORITIES`) and is refused at
submission as `revocation-requires-authority`; the same gate is applied at
consumption (`_revokedActions`), so records already in a ledger are inert too.
Revocations of **ordinary** identities are unchanged — a peer may still withdraw
standing, and that behaviour is pinned so the rule cannot over-reach.

**Posture that remains, by design:** authority-managing is a *class*, not a single
key — any designated principal may withdraw another's scope, because designation
IS the operator's statement that this identity speaks for it. Narrowing that to
per-target management is a real option if an organisation needs it, and is
recorded as posture rather than a gap. An authorised withdrawal is deliberately
sticky (withdrawal means what it says); recovery is a config change
(`HANDLE_AUTHORITIES`) or a fresh identity.

### Bounds measured in 17.10.4 — both closed in v0.10.7

`wcarena/warrant-compromise-campaign.mjs` (**22/22 refused**) MEASURES the choices
this model makes, so a reader can argue with a number instead of an assumption.
The two bounds it found on its first outing are closed; what remains below is
posture, stated out loud:

| Bound | What it was | Status in v0.10.7 |
|---|---|---|
| `key:rotate` proved **continuity**, never possession of the new key | A member could bind an **offline** identity's public bundle as its successor: it appeared as that fingerprint and the real keyholder could not re-join (`fp-already-joined`). It could not SIGN as it (`bad-signature`), so no authority was gained — impersonation + denial of identity. | **CLOSED** — the proof now carries a signature by the incoming private key, bound to the caller's fingerprint (`invalid-rotation-proof` otherwise). Pinned in the suite and scored in the campaign (ROTATION 5–7), including that the real keyholder can still join. |
| Any member's `revocation` record stripped a **designated** identity's declared capability | A stranger filed one revocation against the operator's fingerprint — one token, or `"*"` for all of them — and the operator could no longer hand that scope out. Re-declaring did not restore it. | **CLOSED** — a revocation against a designated identity counts only from an authorised writer, refused at submission (`revocation-requires-authority`) and inert at consumption. Legitimate withdrawal still works (REVOCATION 3) and ordinary identities are unchanged. |
| A chain cannot re-root itself | A delegation naming `authority.root` requires the granter to hold a live grant FROM that root, so hops only deepen where the root granted the granter directly (`no-parent-grant` otherwise). Depth 3 exceeds the cap (`delegation-depth-exceeded`). | Conservative by construction: it makes withdrawal cheap (one revocation kills the subtree) at the cost of unrooted multi-hop chains. |

## Decision 4 — Signals vs. decisions

Reputation (`computeReputationSignals`) is **descriptive audit material** and
is never an access-control input. Access rides `findAuthorization` +
`assessActionRisk` + the grant-authority gate above. Time decay (λ=0.5,
half-life ≈ 10 days) shapes *human* review, not machine decisions.

## Decision 5 — Cryptographic boundary

Content encryption is hybrid post-quantum (HPKE + ML-KEM-768, independent
secrets + HKDF). **Identity and signing remain classical ECDSA P-256** and
are labeled as such (`PROTOCOL.signingLayer`, `CRYPTO_BOUNDARY`). ML-DSA
(FIPS 204) signing is roadmap; no blanket "quantum-safe" claim is made.

## Known limitations (documented, not solved)

| Threat | Status |
|---|---|
| Sybil identities | Mitigated by attestation requirement + per-selfimpulse join governance; not solved globally |
| Colluding endorsers | Reputation is audit-only; delegation depth capped; **coverage rule (Decision 3) bounds what any granter can hand out**; human review expected at org boundaries |
| Granter key compromise | Rotation proofs + revocation; no retroactive invalidation of pre-compromise grants (they still expire ≤ 30d) |
| Cross-selfimpulse attestation portability | Roadmap: bridge-anchored receipts + endorsement portability |

## Alignment with Warrant (17.10)

Patina enforces the **human-principal invariant**: authority envelopes must
root at `human:<id>`, and agents mechanically cannot install their own
safety authority. The protocol's attested-granter rule is the multi-party
projection of the same doctrine: *authority must be rooted in something an
auditor can name*. Roadmap: cross-signing Patina human-root envelopes into
selfimpulse attestations so a selfimpulse can require **human-rooted** attestation for
high-risk action classes — the `authority.root` field is already shaped for
it.
