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
- **Durable runs** — mostly built, one seam short. The checkpoint chain, the
  resume verdict, and a versioned journal serializer live in
  `src/mission/runCheckpoints.ts` and are pinned by `probe/durableRuns.test.ts`.
  The chain now actually survives the process: `missionRuntime.ts:395` calls
  `resumeRun(...)` before any new work, which loads the journal the checkpoints
  wrote, re-verifies it, and refuses to start fresh over a journal that exists
  but will not load. What is still unwired: `resumeDurableRun()` and
  `flushRunJournal()` have no caller in `src/ui/`, so the two paths that matter
  most in practice — "can my interrupted run continue?" on startup, and "save
  now" when the window is closing — are reachable only from the runtime, not
  from the app. Treat "a crash resumes instead of restarting" as true at the
  engine layer and untested at the UI.
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

## What works today

Plain status, so nothing above has to be taken on faith. Two gates, both real:

| Gate | Command | What it covers |
|---|---|---|
| Dev gate | `npm test` | **200** probe suites, bundled and run one at a time. Needs `npm install`. |
| Offline pack | `node verify/run.mjs` | **199** pre-bundled suites, zero install, no network. This is the one a reviewer with only Node can run. |

The pack is the same suite list the dev gate runs, minus the freshness gate
that builds the pack itself — `tools/probe-list.mjs` is the single list both
read, so the two cannot drift.

Where the features actually stand:

| Surface | State |
|---|---|
| Captain, routing, the human gate, receipts, proofs, the vault | **Live.** Wired from `src/ui/store.ts` and reachable from the UI. |
| The eight tools (`fs.*`, `net.fetch`, `wiki.search`, `pc.exec`, `pc.browser`, `mcp.call`) | **Live.** `store.ts` supplies `workspaceRoot` and `fsImpl`; the per-tool risk tier fires. |
| Eight finishes, contrast-checked | **Live.** 584 pairings gated, 16 advisory. |
| Docs distillation, memory graph, triggers, governance evals, ledgers, capabilities | **Live** in the shipped app. |
| Federation (A2A across owners) | **Wiring in progress.** The protocol, the caps, the hop bound and the receipts are built and tested; the mount/pair UI is being connected. Do not treat a cross-machine run as working yet. |
| Durable runs (crash resumes instead of restarting) | **Wiring in progress.** Engine layer done and wired inside the runtime; the UI entry points are still being connected. |
| Crew execution (multi-seat teams end to end) | **Wiring in progress.** The executor, gate, budget admission, merge and idempotency are built and tested; the UI path is still being connected. |
| Self-improvement loop (`runRsiCycle`) | **Not wired.** Correct code, no caller. See `docs/internal/IMPLEMENTATION-GAP.md` OPEN-1. |
| `crew.ts` (the 25-lane concurrent runner) | **Not wired.** Dead code; the shipped path uses a bounded map instead. OPEN-2. |

Three rows are marked *wiring in progress* because that work is landing
**right now**, in parallel, and is not finished. They are listed so the gap is
visible, not as a claim about the current tree — read the gate output for that.

## Eight finishes

Holst, Obsidian, Azure, Titanium, Caesar and Stratos for the night; Platinum
and Akaroa for the day. Every ground is a shade, never an extreme, and each
finish carries one accent. `src/ui/store.ts` is the one list of them.

Two stylesheets paint those finishes and both are measured:
`node tools/contrast-check.mjs` parses `src/ui/vh.css` (the screen interiors)
and `src/ui/si/si.css` (the shell chrome, under its own `--si-*` names),
composites every translucent wash over the ground it is painted on, and
computes real WCAG 2.x ratios across all eight finishes.

What it actually checks, precisely: **584 ink-on-ground pairings**, every one a
pairing some rule in those two sheets really paints. Gated rows are held to the
bar the relevant WCAG 2.x criterion sets: text at 4.5:1 (Contrast Minimum), and
focus indicators, component state and other non-text marks at 3:1 (Non-text
Contrast and Focus Appearance). The tool exits zero: every gated pairing clears
its minimum today.

**16 rows are ADVISORY, not gated.** Each is a 1px decorative border whose own
contrast is decorative-only — WCAG's Non-text Contrast criterion exempts purely
decorative boundaries, so these are reported, printed with a `~`, and
deliberately excluded from the exit code. They are listed so nobody mistakes
silence for a pass.

Run the tool for the current numbers rather than taking this paragraph's word
for it. The pairing count, the advisory set **and the tightest gated ratio all
move** as the sheets change — the worst gated value shifted twice while this
paragraph was being written — so this one deliberately names no specific
figure.

This is not a claim of AA compliance, and the tool does not make one. It is a
list of the pairings a rule actually paints, checked against the ground each is
painted on, plus an explicit statement of what the check does not cover: a
pairing no rule paints, a font size read from the cascade rather than declared,
and any ink or wash an image, gradient or filter contributes.

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
npm run dev             # the web app (DEV ONLY — localhost:5173)
npm run web:build       # the production artifact: static files in dist/
npm run tauri:build     # the desktop shell
node verify/run.mjs     # the offline verification pack — zero install
```

Node 22.12+. Desktop build needs the Rust toolchain
([docs/setup/DESKTOP-NATIVE.md](docs/setup/DESKTOP-NATIVE.md)).

### What actually ships

**The production artifact is the static `dist/` directory.** `npm run web:build`
emits it and `vercel.json` serves it (`outputDirectory: "dist"`). It needs no
server of its own: no Node process, no `npm start`, nothing to keep alive.
Opening `dist/index.html` through any static host is the whole deployment.
`npm run build` produces the same thing, and additionally runs `tsc --noEmit`
first, so it fails on a type error instead of shipping one.

`npm run dev` on `localhost:5173` is a **development server only**. It is not
the product, it is not the artifact, and nothing in `dist/` depends on it being
running.

**A2A federation is the only feature that binds a TCP port**
(`src/mission/a2aServer.ts`). It defaults to `127.0.0.1` and refuses to widen
itself — `0.0.0.0` is rejected in words, and a hostname is refused because a
name can resolve anywhere. In the static `dist/` edition that listener does not
exist, so the browser edition holds no port at all.

`npm run web:build` works on Windows. It used to shell out to POSIX `rm -rf`
and `cp`, which failed *after* a successful Vite build and exited 1 — a broken
build that looked like a broken app.

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
