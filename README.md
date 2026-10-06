# SelfImpulse

**Intelligence That Collaborates.**

SelfImpulse is an on-device AI captain. You describe the outcome you want; a
crew of specialists does the work on your machine, under your own provider
key. Every action — and every refusal — is sealed into a receipt you can
verify later, offline, with one command. Built on the **MJ** engine.

---

## What you get

- **The Captain** — one calm place to ask. The Captain routes your request to
  the right specialists and answers in words when it can't act. It answers to
  any name you give it.
- **The crew** — a company, organised. Captain → Consul → Adept → crew, one
  rung at a time. The crew is internal: you work with one Captain, not a
  roster.
- **Work** — watch a mission as a live 3D graph, from your request down to
  its receipts. Risky steps pause and ask. Approve once, or refuse with a
  reason — both are receipted.
- **Connect** — mail, calendar, repositories, documents. A connection is a
  declared, inspectable policy: one purpose, one address range, scopes in
  plain words. Connecting teaches the crew where it may go; it never adds a
  tool. Mutations still stop at the gate.
- **Federation** — your Captain works with another owner's Captain over the
  A2A protocol. Mounting is explicit, pairing is a one-time code, and every
  crossing is receipted on both sides. You choose the reach: this machine
  only, or your network.
- **Receipts** — a hash-chained ledger of everything that happened. Export a
  mission as a single signed record and verify it anywhere:
  `node tools/verify-mission-record.mjs record.json` — no install, no state.
- **Docs** — teach the Captain from your own documents. Structure is
  distilled, proposed, and installed only when you approve. Handling is
  disclosed: what stayed on this machine, and what (if anything) went to a
  provider.
- **Memory** — conversations become a graph you can move through in 3D.
  Double-click a node to return to that conversation. Encrypted at rest
  behind the vault; one switch turns it off. Memory compounds: working,
  episodic and semantic tiers, with promotion you can walk back to the
  episodes it was distilled from.
- **Durable runs** — in progress. The tamper-evident checkpoint chain, the
  resume verdict and the journal serializer are built and pinned
  (`src/mission/runCheckpoints.ts`, `probe/durableRuns.test.ts`), and a settled
  mission wave already appends to the chain. What does not work yet: the chain
  is held in memory, so it dies with the process, and the loader that would
  restore it after a restart (`restoreRunJournal`) has no caller in `src/`. A
  crash therefore resumes from the mission runtime's own task state, not yet
  from this chain. Treat "a crash resumes instead of restarting" as the
  intended behaviour, not the current one.
- **Intake triggers** — schedules, signed webhooks and named events that
  start runs for you. A trigger is a doorbell, not a key: everything it starts
  goes through the same gate as your own requests.
- **Governance evals** — the governed behaviors (risky asks gate, denials
  execute nothing, safe asks run) held by an explicit baseline, with a
  regression gate that names what moved.
- **Ledgers** — the books a fleet is asked to open. Agent FinOps: per-seat,
  per-mission spend with a chargeback export — dollar-known and dollar-unknown
  kept honestly apart. Fleet identity: who owns every seat, under which key,
  revocable. Assurance: a measured score that refuses to exist without
  evidence.
- **Capabilities** — a human approval at the gate is not UI state. It mints a
  signed, scoped, expiring, redeem-once capability that the execution plane
  must verify and redeem before any effect — audience-bound, depth-zero,
  fail-closed. One root signs everything: the owner's own key — derived from
  the vault passphrase through the vault's own hardened KDF at unlock — signs
  mandates and capabilities alike, and locking the vault takes that authority
  out of memory: the root unbinds and every outstanding capability dies. A
  revoked seat stays revoked until the owner explicitly re-grants it, and
  before the owner's key is bound the console can read but not effect — no
  owner proof, no effectful capability, at the capability mint OR the
  mandate issuance. Re-granting a revoked seat requires the owner's key —
  bootstrap cannot resurrect a seat — and the read-only registry seals at
  trusted startup, so loaded code can never redefine what "read" means.

## Eight finishes

Holst, Obsidian, Azure, Titanium, Caesar and Stratos for the night; Platinum
and Akaroa for the day. Every ground is a shade, never an extreme, and each
finish carries one accent. `src/ui/store.ts` is the one list of them.

Two stylesheets paint those finishes and both are measured:
`node tools/contrast-check.mjs` parses `src/ui/vh.css` (the screen interiors)
and `src/ui/si/si.css` (the shell chrome, under its own `--si-*` names),
composites every translucent wash over the ground it is painted on, and
computes real WCAG 2.x ratios across all eight finishes: text at 4.5:1, and
focus indicators and component state at 3:1, which is the bar WCAG's Non-text
Contrast and Focus Appearance criteria set.

It currently exits non-zero, and that is the point: the tool is a gate, not a
certificate. The open failures it names are in the two stylesheets — the primary
action's label drops under 4.5:1 on its hover fill, the light finishes' rail
tertiary ink falls short on the rail ground, the field placeholder and the
deepest-ground code block fall short on their own fills, and the accent pill's
ink falls short on its own wash. Run it for the current list rather than taking
this paragraph's word for it; the count moves as the sheets change.

This is not a claim of AA compliance. It is a list of the pairings a rule
actually paints, checked against the ground each is painted on, plus an
explicit statement of what the check does not cover: a pairing no rule paints,
a font size read from the cascade rather than declared, and any ink or wash an
image, gradient or filter contributes.

## The law the code enforces

- **On-device.** Every agent runs in-process, on your own provider key — no
  external agent binary is reachable from the app, and the Rust allowlist has
  no coding agent in it. Nothing leaves your machine without a signed authority
  and a receipt. There is no product telemetry endpoint; the one OTLP exporter
  in the tree (`src/mission/otel.ts`) is called by nothing in `src/`.
- **Your key, sealed.** Provider keys live in memory for the session, or
  encrypted at rest behind a passphrase vault.
- **The human gate.** Actions above the safe tier stop and ask — and the
  gate is fail-closed: without permission, nothing runs.
- **Honest outcomes.** Without a provider the Captain plans, and says so.
  A claim is fetched and checked before it is called verified.
- **Bounded autonomy.** You choose how far the Captain may go on its own —
  inside hard caps, through the same governed path, with a circuit breaker.

## Run it

```bash
npm install
npm test                # the full gate — every suite
npm run dev             # the web app
npm run tauri:build     # the desktop shell
node verify/run.mjs     # the offline verification pack — zero install
```

Node 22.12+. Desktop build needs the Rust toolchain
([docs/setup/DESKTOP-NATIVE.md](docs/setup/DESKTOP-NATIVE.md)).

## Where to read more

| Read | For |
|---|---|
| [docs/STORY.md](docs/STORY.md) | the product narrative, one spine |
| [docs/releases/FEATURES.md](docs/releases/FEATURES.md) | every feature, and where it lives |
| [docs/VERIFICATION.md](docs/VERIFICATION.md) | how everything above is proved |
| [docs/setup/](docs/setup/) | install, desktop build, deploy |
| [docs/internal/](docs/internal/) | engineering records: limits, compatibility, gap audits |

## License

[MIT](LICENSE). Third-party notices:
[docs/legal/THIRD-PARTY-NOTICES.md](docs/legal/THIRD-PARTY-NOTICES.md).
