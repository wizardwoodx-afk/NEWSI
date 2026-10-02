# SelfImpulse

**Agentic impulse, for all.**

SelfImpulse is an on-device AI captain. You describe the outcome you want; a
crew of specialist agents does the work on your own machine, under your own
provider key; every action — and every refusal — is signed into a receipt you
can verify later. Built on the **MJ** engine.

---

## What you get

- **Captain** — one calm place to ask. The Captain routes your request to the
  right specialists, executes only when a provider is connected, and answers
  in words when it can't.
- **The company** — the product is organised like one, and no rung is ever
  skipped. You speak only with the **Captain** (the CEO). The Captain briefs a
  **Consul** — one per domain, sixteen in all — who reports up to it and never
  addresses you or a sub-agent. Each Consul oversees its desks' **Adepts** (the
  team leads), and each Adept leads a crew of **sub-agents** who do the work. A
  message moves exactly one rung up or down (`src/engine/chain.ts`);
  `probe/workspace` pins the law and refuses a desk that has no Consul.
- **Work** — watch the crew work as a live 3D mission DAG, drawn rung by rung:
  you → the Captain → a Consul → an Adept → sub-agents → tools → receipts.
  Risky actions pause here for your approval.
- **Specialists** — domain teams (frontend, engineering, healthcare, finance
  and more). The Captain picks ≤3 candidates per mission; execution expands
  to at most twenty-five live seats on the floor (see
  [`docs/design/specialist-routing.md`](docs/design/specialist-routing.md)).
- **Federation** — let other SelfImpulse nodes delegate work to this one over the
  A2A wire protocol. Mounting is explicit: the screen says what the bundled host
  does (bind a port, publish a signed agent card, verify its own engine pin
  before listening) and you turn it on. The host is **supervised**, not fired as
  a command with a timeout: it stays up until you unmount it, the status you see
  is the OS's answer rather than a stored flag, and quitting the app unmounts it
  so a card never outlives the window. This app does not open a listener on
  launch, and every inbound delegation must state the authority it carries —
  unstated authority is refused by name, not executed under an invented ceiling.
  You choose the bind scope before mounting — this machine only (127.0.0.1) or
  your network — and there is no wildcard option. To let another machine in, tick
  **pairing**: the app shows a one-time code, the peer redeems it once, and it
  gets a credential scoped to delegation. The host's own token never leaves the
  process and is not on screen. Unmounting asks the host to stop itself and only
  kills it if it will not.
- **Receipts** — a compact ledger of everything that happened, each line
  digest-stamped; export it as a file. Refusals additionally carry a signed
  `11h-decision/1` receipt bound to the evidence pack it was made against.
- **Docs** — teach the Captain from your own documents. Paste one or load a
  file; the engine distills its *structure* (procedure, decision rules, failure
  modes) into a knowledge proposal and you approve or dismiss it. It will not
  summarize, it will not install anything on its own, and it tells you whether
  the content stayed on this machine.
- **Memory** — your conversations become a graph you can move through;
  double-click a node to return to that conversation. Memory can be
  encrypted at rest with the local vault, and can be switched off.
- **Settings** — provider, vault, autonomy level, federation with another
  owner, appearance, and the guardrail manifest.

## Principles the code enforces

- **On-device.** Nothing leaves your machine without a signed authority and a
  receipt. No telemetry.
- **Your key, sealed.** Provider keys live in memory for the session, or
  encrypted at rest behind a passphrase vault — never plaintext.
- **The human gate.** Actions above the safe tier stop and ask. Approvals
  *and* refusals are receipted.
- **Honest outcomes.** Without a provider the Captain *plans*; it never
  dresses a plan as an execution. Live-data claims are fetched and checked
  before they are called verified.
- **Bounded autonomy.** Above "Off", a heartbeat lets the Captain act on its
  own inside hard caps, through the same engine path as a typed message, with
  a circuit breaker on failure.
- **The crew is internal.** Agents appear as AGENT 01, 02… — you work with
  one Captain, not a roster.
- **Every agent runs in-process, on your own provider key.** Earlier releases
  seated third-party coding-agent CLIs as a governed tier. **That tier is
  removed from the product.** The native
  handlers that could execute one are deleted — `cli_invoke`,
  `cli_providers_detect`, the CLI allowlist, the custom-harness registry and
  the whole ACP bridge — and no agent binary is reachable from the app any
  more. What ships is a native loop: the Governor seats, scopes and receipts
  work, and the Captain runs it in this process. `probe/noExternalCli.test.ts`
  fails the build if any of it comes back.
- **The loop is governed, not merely run.** Authority is decided once at the
  door and re-checked before **every** tool call — a step that drifts outside its
  envelope is stopped mid-run, with the reason recorded, not flagged in review
  afterwards. Every prompt, authorization, tool call and outcome is a hash-chained
  node in an **action provenance graph**, so a receipt can be walked back to the
  decision that caused it. Each decision is appended to a **tamper-evident
  decision journal**: edit one entry and every entry after it fails to verify.
  Human oversight is **tiered** — approval before a run, intervention during
  one, audit after — with the asymmetry made explicit: a silent approval or
  intervention fails *closed*, a silent audit does not retroactively discard
  verified work. The guard runs on both sides of every call, because a tool that
  was authorized can still return something that warrants stopping.
- **The A2A host ships inside the app bundle.** Federation is not a feature you
  install separately: `tools/si-host.mjs` and its byte-pinned engine are
  declared in `bundle.resources`, and the app reports the resolved path and
  whether the bundle is actually present.

The full list of what the product physically cannot do is in
**Settings → About → Guardrail manifest**, and every line is pinned by a test.

## Run it

Requires Node 22.12 or newer.

```bash
npm install
npm run dev          # web app on http://localhost:5173
npm run build        # production build → dist/
```

Desktop builds (Tauri) are described in [`docs/setup/DESKTOP-NATIVE.md`](docs/setup/DESKTOP-NATIVE.md)
and [`docs/setup/BUILD-NATIVE.md`](docs/setup/BUILD-NATIVE.md). Laptop install notes are in
[`docs/setup/INSTALL-ON-LAPTOP.md`](docs/setup/INSTALL-ON-LAPTOP.md); hosted preview in
[`docs/setup/DEPLOY-VERCEL.md`](docs/setup/DEPLOY-VERCEL.md).

## Verify it yourself

Every claim above is a probe you can run.

```bash
npx tsc --noEmit                  # types
node tools/run-all-probes.mjs     # the full dev gate
node verify/run.mjs               # the offline pack — no install, node builtins only
sh scripts/verify.sh             # the same, from a clean unzip
```

The runners report their own suite counts; do not take this file's word for
it. The verification record for this build is in
[docs/history/releases/RELEASE-VERIFICATION.md](docs/history/releases/RELEASE-VERIFICATION.md).

## The engine

SelfImpulse is the product. **MJ** is the engine underneath: the
specialist registry and routing, the human gate, the receipt chain, the
memory graph, the vault, federation between owners, and the self-improvement
loop with its external verifier. The engine keeps its own build identity in
`src/version.ts` for manifests and receipts; the product never shows a
version number.

Engine documentation, design notes and the complete release history live in
[docs/](docs/README.md) and [docs/history/](docs/history/).

## Layout

```
src/ui/          the product — Shell, screens, store, one stylesheet (vh.css)
src/brand.ts     the product's name and tagline (one source of truth)
src/engine/        the engine — routing, gate, receipts, memory, vault, federation, RSI
src/mission/     custody, egress, capability and privacy guards
src/selfimpulse/       the selfimpulse engine, drills and harness seams
probe/           the test suites (every guarantee above has one)
verify/          the zero-dependency offline pack
tools/           builders: MCP engine, host engine, offline pack, version bump
src-tauri/       the desktop shell
```

## License

Copyright © 2024–2026 K.S. / SelfImpulse. All rights reserved.
Third-party notices: [`docs/legal/THIRD-PARTY-NOTICES.md`](docs/legal/THIRD-PARTY-NOTICES.md).

## Security

See [`SECURITY.md`](SECURITY.md) for the disclosure policy and what is (and
is not) in scope. The short version: IPC handlers enforce what TypeScript
policy promises, egress and SSRF guards live on the fetch path, and child
processes spawn through a scrubbed environment inside workspace-root
containment.

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md). The three bars are `tsc`, `npm
test`, and `node verify/run.mjs` — all green, every commit. CI runs them on
every PR via `.github/workflows/gate.yml`.
