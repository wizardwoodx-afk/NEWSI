# Verification

SelfImpulse ships its own gate. Two tiers, both self-reporting — the runners
print their suite counts; no document is the source of truth for a number.

## Tier 1 — the offline pack (no install)

```bash
node verify/run.mjs
```

`verify/suites/` holds one self-contained bundle per probe suite (node
builtins only). `verify/MANIFEST.json` pins the digest of every bundle;
`probe/offlinePack` (which runs only under the full toolchain) checks the
shipped bundles are byte-identical to a fresh build. `sh scripts/verify.sh` runs this
tier from a clean unzip.

## Tier 2 — the full toolchain

```bash
npm install
npx tsc --noEmit
node tools/run-all-probes.mjs        # every suite in probe/
node tools/run-one-probe.mjs <name>  # one suite, e.g. shellRender is .tsx — bundle manually
```

Requires Node 22.12 or newer. The gate is green when the summary line reads
`0 failed`.

## What the probes pin

- **The product** — `shellRender` server-renders the Shell and every door;
  `navAlign`, `patinaShell`, `consolePolicy`, `theme`, `buttonActions` pin
  the seven doors (the seventh, Specialists, now spanning twenty-five domains and 251
   specialists), the sidebar, the design tokens, and that every button
  reaches a real engine seam.
- **The engine path** — `engineDoor`, `initiative`, `fedWired`, `meshRuntime`,
  `teammates` pin that the store is the single caller of the engine with the
  human gate, handoff recorder, RSI intake and heartbeat.
- **Guardrails** — `guardrailAlign`, `differentiatorAlign`, `securityReview`,
  `productionStack`, `twoNodeAlign` pin each line of the manifest to code.
- **Identity** — `versionDrift`, `docIdentity`, `vhClean` pin that manifests
  agree and that no retired surface survives.
- **Authority and decisions** — `a2aHostLifecycle` starts the real bundled A2A
  host as a real child and pins that it is **still serving 22 seconds after it
  says it is ready** — the exact window the old 20-second timeout killed it in —
  and that only an explicit stop ends it. `federationSurface` pins that mounting
  asks the supervisor, never a timed command, and never happens at startup.
  `earnedAuthority` pins fixed human ceilings, grants that only narrow, the
  principal chain, and that a guard trip genuinely RESETS the record (a clean
  streak, never a lifetime total); `declarativePolicy` pins
  the four fail-closed policy semantics and that a seat with no declared role
  gets no authority; `decisionReceipt` pins signed `11h-decision/1` refusal
  receipts, their binding to the evidence pack, and their refusal to verify
  after tampering; `federationSurface` pins that the bundled A2A host is
  surfaced, explicitly mounted, and never auto-started.
- **Engine internals** — routing, synthesis, live-data, token pipeline,
  memory graph, vault, MCP, A2A, RSIRALS and its external verifier each have
  their own suites.

## Reading the record

The build record for each release — commands run, node version, results —
is archived in `docs/history/releases/RELEASE-VERIFICATION.md`.

## Mesh scope

The mesh is a **LOCAL collaboration trust fabric**. Nothing in it reaches a
network the operator did not open themselves.

**ECDSA provides portable authority across instances.** A peer proves who it is
without either side holding the other's secret, and a credential minted here
verifies in a different install.
