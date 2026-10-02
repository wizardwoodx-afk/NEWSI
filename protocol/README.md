# SelfImpulse Protocol v0.10.7 — "Unified Sentinel-Hybrid"

The device-to-device communication + trust substrate under the SelfImpulse
agent OS. Shipped inside `protocol/` since **17.6**.

## What it is

Local-first, selective, signature-verified exchange for **humans and AI
agents**. Devices talk directly to devices; a *selfimpulse* is a meeting place
only — presence, signaling, and selfimpulse metadata. Content never transits the
selfimpulse: it moves peer-to-peer under hybrid post-quantum encryption.

```
govern  →  execute  →  verify  →  learn
policy     selfimpulse       chain      reputation
engine     kinds       + metaSig  + decay
```

## Layer stack

| Layer | Mechanism |
|---|---|
| Identity | ECDSA P-256 signing + HPKE + ML-KEM-768 key bundles, challenge-response join |
| Envelopes | signed `{p, n, ts, sig}` + replay guard + timestamp window |
| SelfImpulse chain | full SHA-256 hash chain, selfimpulse meta-signatures (`requireMetaSig` default), root-key checkpoints every 10 links |
| Governance | PolicyEngine (6 selfimpulse kinds, charset/hash/expiry rules, self-endorsement ban) + BindingValidator (signer ↔ actor, SDK **and** selfimpulse) |
| Trust | `findAuthorization` (expiry/revocation-aware), `assessActionRisk`, `computeReputationSignals` (per-capability, exponential time decay λ=0.5, half-life ≈ 10 days) — signals are audit-only; access rides authorization |
| Content | **VH-HYBRID-PQ3** true hybrid combiner — two independent secrets (HPKE-protected + ML-KEM-protected) joined by HKDF; compromise of ONE key-establishment path does not reveal the content key. **VH-VAULT-v3** chunked transfer + RFC 6962 Merkle manifest |
| Honesty | `CRYPTO_BOUNDARY` — machine-readable quantum status per primitive; signing stays classical ECDSA and says so |

## The receipt bridge (17.6)

`bridge/selfimpulse-receipt-bridge.mjs` anchors Patina's `si-proof-receipt/2`
proof receipts into the selfimpulse chain — the cross-org capability channel's
trust anchor. A receipt verified on one machine becomes a portable,
policy-governed, revocable selfimpulse on any selfimpulse.

- Verification mirrors `tools/verify-receipt.mjs` **byte-for-byte**
  (chain, canon, seal, Ed25519 issuer signature).
- Envelopes are wire-compatible with the protocol's `sealSecure/openSecure`.
- Anchored facts pass PolicyEngine + BindingValidator + the authorization gate.
- Zero npm dependencies (node builtins only).

```bash
node protocol/bridge/bridge-selftest.mjs   # 🏆 18 checks, zero install
```

## Running

```bash
cd protocol
npm ci            # lockfile-pinned. The archive ships the lockfile, not node_modules
npm test          # 🏆 171 checks (selftest) — exact from-a-bare-archive steps: README-TEST.md
npm start         # selfimpulse server (PORT env, default 3000)
```

## v0.10.4 → v0.10.7 — bounded delegation (RULE 3), designated authority (RULE 4), authority provenance (RULE 5), possession & revocation authority (RULE 6)

An attested granter may only delegate authority it **holds**: the exact action,
a `delegate:<scope>` / `admin:<scope>` token, or `*` where the granter itself
carries `*`-class authority. Sub-delegation may **narrow, never widen**;
coverage is re-checked at consumption, so a narrowed or revoked issuer stops
working; replayed grants are refused. Refusals are counted in
`metrics.grantAuthorityRejected` and audited with the action, the scope, and the
tokens actually held.

**v0.10.5 adds RULE 4: unbounded authority is never a self-claim.** A `*`,
`delegate:*` or `admin:*` token is meaningful only when the harbour root key or
an operator-designated fingerprint (`HANDLE_WILDCARD_AUTHORITIES`) holds it, and it
is never transitive. Rationale: `THREAT-MODEL.md` Decision 3.

**v0.10.7 adds RULE 6: possession, and who may revoke whom.** The attacker-grade
campaign shipped in 17.10.4 measured two bounds and reported them. Both are closed:
a **rotation proof must prove possession of the INCOMING key** (so a member cannot
squat an offline identity's fingerprint), and **a revocation against a designated
identity counts only from an authorised writer** (so no member can switch the
principal that hands authority out off — the refusal is `revocation-requires-authority`,
applied at submission and at consumption). Revocations of ordinary identities are
unchanged, pinned so the rule cannot over-reach. The campaign grew to **22/22
refused** by promoting those two findings from INFO rows to scored attacks.

**v0.10.6 adds RULE 5: a capability claim is not a licence.** RULES 3 and 4 asked
whether a granter *holds* what it hands out — but for **named** tokens "holding"
was still a **self-signed declaration**, so any participant could
`declareCapability(["write:payroll"])` and mint a real payroll grant. Delegable
authority now has exactly two sources: a **live grant** naming the fingerprint as
subject (revocation- and expiry-aware), or a declaration by an
**operator-authorized identity** (`HANDLE_AUTHORITIES=<fp>`; the harbour root key
always qualifies; the v0.10.5 name `HANDLE_WILDCARD_AUTHORITIES` is still read).
Anything else is a claim — descriptive for reputation, reporting and audit, never
a licence — refused as `capability-claim-is-not-authority`. **Designation follows
the identity across a proven key rotation** (the harbour records a rotation only
after verifying a proof from the outgoing key, and `rotate` is not a
member-submittable kind); grants and revocations stay keyed to the exact
fingerprint, so a revoked key cannot rotate out of its own revocation.
Rationale, bootstrap and upgrade impact: `THREAT-MODEL.md` RULE 5.

**Reproduce it** (installed dependencies; `README-TEST.md` has the exact steps).
Since RULE 5 changed what "legitimate" means, the authority harnesses were
re-based on **given** authority: they now start their own harbour, designate an
operator at boot, and hand every honest actor real grants — so a refusal proves
the *bound*, not the absence of a setup.

| Harness | Expected |
|---|---|
| `node wcarena/adversarial-campaign.mjs` — 14 attack classes + control, self-contained | **14/14 refused, control intact** |
| `node wcarena/v104-authority-matrix.mjs` — legitimate paths and amplification routes | **10/10** |
| `node wcarena/governance-attacks.mjs` — four WeClawArena governance attacks + control | **control permitted, 4/4 refused** |
| `node wcarena/exploit-self-attestation.mjs` — the 17.6.2 exploit (attaches to a running harbour) | every leg REFUSED |
| `node wcarena/warrant-compromise-campaign.mjs` — attacker-grade pass: designation compromise, rotation, delegation, revocation race, replay, cross-harbour (two harbours) | **22/22 refused, control intact** · 4 posture notes |
| `cd protocol && npm test` — the full protocol gate | **171/171** |

## v0.10.2 fix record (history — why that release was "Fix1")

v0.10.1 shipped 9 defects found by executing its own suite; all fixed and
re-verified 122/122:

| Fix | What |
|---|---|
| FIX-1 | selftest: `await` inside non-async arrow (SyntaxError at load) |
| FIX-2/3 | `hybridSealFor` crashed on every call: HPKE `sender.enc`/`seal()` return ArrayBuffer in @hpke/core 1.9.0 |
| FIX-4 | selftest used vault `chunkSize: 256` below the 1024 minimum |
| FIX-5 | SDK join raced the server's immediate `auth:challenge` (every join failed locally) |
| FIX-6 | selftest awaited `connect` on an already-connected socket (hang) |
| FIX-7 | `_emit(event, undefined)` put `null` on the wire → `chain:get`/`checkpoint:get` never acked (hang) |
| FIX-8 | `_safeParse`: `"constructor" in obj` is true for EVERY object (prototype chain) → trust layer silently dead; now `Object.hasOwn` |
| FIX-9 | `byCapability` no longer erases revoked capabilities' history (signals are descriptive; selftest contradiction resolved) |
| FIX-10 | selftest reused pre-rotation facts (binding correctly rejected them) |
| HARDEN-1 | ledger seq commits only after metaSig resolution (no sequence-gap edge) |
