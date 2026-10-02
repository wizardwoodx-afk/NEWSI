# Running the protocol gate from a bare archive

**Why this file exists.** The release ZIP ships `protocol/package-lock.json` but
not `protocol/node_modules` (dependency trees are large and platform-specific).
The protocol gate is therefore **dependency-backed** — the release notes never
call it zero-install — and it cannot run until those dependencies are installed.
If you run a harness before installing, you will see errors like:

```text
Error: Cannot find module 'socket.io-client'
```

That is a missing-dependency error, **not** a protocol failure. Install once, then
the advertised results are reproducible.

## 1 · Prerequisites

- **Node 20+** (22 recommended). No Docker, no network access needed at run time.
- The lockfile is the pin: `npm ci` installs exactly the tree the release was
  verified against.

## 2 · Install once

```bash
cd protocol
npm ci            # or: npm install — same lockfile
```

## 3 · The cryptographic self-test — the full gate

```bash
cd protocol
npm test          # →  🏆 ALL 171 UNIFIED-SENTINEL CHECKS PASSED   (exit 0)
                  #    any failure → ⚠️ N FAILED / M passed         (exit 1)
```

Covers identity, signed envelopes + the replay guard, selfimpulseing and the SHA-256
hash chain, policy + binding, authorization/revocation/expiry, reputation
signals, the hybrid post-quantum content path, vault/Merkle transfer, root-key
checkpoints — and the **grant-authority section** (RULE 3, v0.10.4) including the
self-attestation amplification regression that fails on 17.6.2 and earlier.

The count printed by this command is the single source of that number. Do not
trust a restatement of it anywhere else (including release notes).

## 4 · The bridge gate — genuinely zero-install

```bash
node protocol/bridge/bridge-selftest.mjs      # → 18 checks, no dependencies
```

Run it from the archive root. It needs no `npm install` at all — that is the
point of the bridge.

## 5 · The governance harnesses (need a running selfimpulse)

Start a selfimpulse (it needs the dependencies from step 2):

```bash
cd protocol
PORT=3200 HANDLE_DATA_DIR=/tmp/si-protocol-test node src/server/selfimpulse.js
```

Then, from the archive root:

```bash
node protocol/wcarena/adversarial-campaign.mjs     # → 14/14 refused, legitimate control intact
node protocol/wcarena/v104-authority-matrix.mjs    # → 10/10
node protocol/wcarena/governance-attacks.mjs       # → control permitted, 4/4 attacks refused
node protocol/wcarena/exploit-self-attestation.mjs # → every leg REFUSED (attaches to the harbour above)
node protocol/wcarena/warrant-compromise-campaign.mjs # → 22/22 refused, control intact (starts TWO harbours)
```

The first four are **self-contained**: since RULE 5 (v0.10.6) changed what
"legitimate" means, they start their own harbour, designate an operator at boot
(`HANDLE_AUTHORITIES`) and hand every honest actor real grants — a refusal therefore
proves the bound, not the absence of a setup. `exploit-self-attestation.mjs` is
attacker-only and attaches to the harbour you started (`HANDLE_URL`, default
`http://localhost:3200`). Expected results:

| Harness | What it proves | Expected |
|---|---|---|
| `adversarial-campaign.mjs` | 14 attack classes against **granted** authority — self-declared wildcards, self-declared named claims (`write:payroll`, `admin:finance`), a claim widening a real holder, revocation race, expiry, name/scope smuggling, action substitution — plus the legitimate control | 14/14 refused, control intact |
| `v104-authority-matrix.mjs` | **both** directions of scope-bounded delegation: the operator's grants accepted end-to-end, six amplification routes refused | 10/10 |
| `exploit-self-attestation.mjs` | the 17.6.2 self-attestation amplification no longer reproduces | every leg REFUSED |
| `warrant-compromise-campaign.mjs` | the attacker-grade pass: a joined member, a key thief, captured traffic, and an identity with REAL authority in another harbour. Rotation cannot manufacture designation; grants are keyed to the exact key; chains cannot re-root or exceed the depth cap; withdrawing the issuer's grant kills sub-grants minted before it; captured/stale/edited traffic is refused; and no authority or designation crosses a harbour boundary. **RULE 6 regressions** are pinned here too: offline-fingerprint squatting is refused (no proof / wrong-key proof) and the fingerprint stays free for its real keyholder; a member's revocation of the designated operator is refused while the operator keeps delegating; an authorised withdrawal is honoured. Four **posture** notes are stated rather than scored | `22/22 refused, control intact` · 4 posture notes |
| `governance-attacks.mjs` | four WeClawArena governance attacks refused while a legitimate grant still lands | `false-accepts: 0 of 4 tested bypasses`, `legitimate path still works: true` |

Indicators to read in the selfimpulse log: refusal reasons in words
(`policy:grantor-out-of-scope`, `policy:grantor-unattested`,
`policy:wildcard-grant-requires-wildcard-authority`, `replayed-envelope`), the
counter `metrics.grantAuthorityRejected`, and `selfimpulse.closed totalSelfImpulsees:N`.

## 6 · What runs with no install at all, and what does not

| Gate | Command | Dependencies |
|---|---|---|
| Bridge gate | `node protocol/bridge/bridge-selftest.mjs` | **none** |
| Offline pack (bundled probe suites) | `node verify/run.mjs` | none in the shipped archive* |
| Benchmark pack | `node benchmark/run.mjs` | none — B3 honestly skips without protocol deps |
| Interop CLI | `node tools/si-interop.mjs …` | **none** |
| **Protocol self-test** | `cd protocol && npm ci && npm test` | **yes** — lock-pinned |
| Governance harnesses | see §5 | **yes** + a running selfimpulse |
| App probe suites / build | `npm ci && npm test` at the archive root | **yes** — the React/Tauri toolchain |

\* The bundled suites that are dependency-backed say so in their own output and
skip or fail honestly rather than pretending to pass.

## 7 · Reporting a result

State which command produced it and from what extraction, e.g.:

> `npm ci && npm test` in `protocol/` on the extracted 17.10.5 archive →
> 🏆 ALL 171 UNIFIED-SENTINEL CHECKS PASSED.

That sentence is checkable by anyone; "the tests pass" is not.
