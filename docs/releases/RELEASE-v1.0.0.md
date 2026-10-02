# SelfImpulse 1.0.0 — release notes

## v0.0.3 (current milestone)

- **Editorial Minimal UI.** One stylesheet (`src/ui/vh.css`), retuned for an
  Apple-grade editorial feel: warm paper-cream light theme, deep-ink dark
  theme, one desaturated teal accent, Instrument Serif display face, Geist
  body/mono, hairline borders over shadows, 500-weight ceiling, single
  primary action (the composer send), more generous whitespace, calmer rail,
  stronger hero typography. No purple gradients, no blinking status dots,
  no Lucide icon stacks.
- **GitHub production hygiene.** `.github/workflows/gate.yml` runs tsc →
  `npm test` → `node verify/run.mjs` on ubuntu-latest/Node 22.14; SECURITY.md
  with disclosure policy and in-scope surfaces; CONTRIBUTING.md with the
  three-bar gate rule (don't hand-edit generated bundles); tightened
  `.gitignore`.
- **Repo cleaned.** One-off `.md` how-tos moved under `docs/setup/`, release
  notes under `docs/releases/`, legal notices under `docs/legal/`, the
  verify script under `scripts/verify.sh`. PowerShell one-offs
  (`build-app.ps1`, `cargo-dev.ps1`, `screenshot.ps1`) and stale benchmark
  JSON are gone. The probe/gate/build infra is intact.
- **Specialist routing documented.** `docs/design/specialist-routing.md`
  spells out the two numbers reviewers kept asking about: Top-K=3 candidate
  selection into the plan, CREW_MAX=25 live-agent ceiling on the floor.
- **pdf.js 6.3.** Updated off the vulnerable build the gate flagged; CVE
  addressed in the bundle.

### Federation: LAN binding, one-time pairing, graceful unmount

- **Bind scope is explicit.** `local` is the default and binds loopback. `lan`
  resolves this machine's real interface address with no packets sent, and
  *refuses* when it finds none rather than falling back. `0.0.0.0` is never
  offered and is rejected by name — a wildcard would serve the card on every
  interface at once.
- **Pairing replaces the shared token.** A one-time invitation, single-use,
  minutes not hours, stored as a salted digest, destroyed after five wrong
  guesses, bound to the peer's identity fingerprint. The redeemed credential is
  fresh randomness, not the host token, and the host token no longer appears in
  the READY line or anywhere in the frontend. `HOST TOKEN ≠ PAIRING CODE ≠ PEER
  CREDENTIAL` is enforced by `probe/pairing.test.ts` (87/0), which runs the real
  bundled host over the wire.
- **The host unmounts itself.** `a2a_host_stop` asks the host to shut down over
  a nonce-guarded channel the supervisor opens, and falls back to a kill only
  when the graceful path fails — and says so in the log. The nonce travels by
  environment, never argv (where `ps` shows it) and never stdout. This also
  removed the last `unsafe` block from `src-tauri/`.
- **A worktree collision, found by the gate.** Worktree *directories* were keyed
  by repo+seat while *branches* were keyed by mission too, so a second delegation
  to the same seat in the same repo asked git for a path that already existed.
  It surfaced as an intermittent A2A verification failure, one run in four.
  `probe/collaboration` pins the fix.

### AlterSend — moving a file between peers

Peer file transfer over the same authenticated channel as delegation, and behind
the same credential. Three rules make it not-a-remote-write-primitive:

1. **Nothing is addressed by path.** A transfer carries a sanitised label and a
   content hash. There is no directory in the data model, so
   `../../.ssh/authorized_keys` is not a thing it can be asked to write.
2. **The receiver decides.** An offer is an offer; nothing lands until
   `accept()`, which verifies the bytes against the digest the sender published.
   There is no auto-accept path.
3. **Every transfer is receipted**, hash-chained, in the same ledger shape as the
   rest of the product.

`probe/altersend.test.ts` is 66 assertions and most of them are about refusals:
seven traversal names, four limit boundaries, a sender that swaps its payload
after publishing the digest, an unauthenticated drop, and a replayed fetch.

Gates at tag: tsc 0 errors, `npm test` 177/0, `node verify/run.mjs` 176/0.

## v0.0.2

- pdf.js CVE remediation, receipt chain hardening, first zip release.

## v0.0.1

- initial archive.
