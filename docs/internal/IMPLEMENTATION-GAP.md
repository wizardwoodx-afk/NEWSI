# Implementation-gap document — 19.7.16

Engine audit against the frozen architecture. Written 2026-09-26, revised
2026-10-06.
Baseline and final state are both the full green gate. The runners print the
exact suite count; this file deliberately does not repeat one, and
`probe/docConsistency.test.ts` fails the build if a live document ever states a
count that disagrees with the tree.

This document is a record of what was found, what was changed, and what was
deliberately left alone. Items marked **OPEN** are real and are not done.

**Revision note (19.7.16).** §3.5 records six findings that have since landed,
each re-verified against the source for this revision. OPEN-2 is now closed —
`crew.ts` reached the UI. Two new items were added by this revision:
**OPEN-14** (a 4-bit A2A seat id that makes an intermittent test failure a
dice roll rather than a race) and **OPEN-15** (the offline pack verifies the
live working tree, not the tree it was built from). Every OPEN item not marked
"re-verified" below was **not** re-counted in this pass; where the module graph
moved underneath the original figure, that is said so rather than quietly
repeated.

---

## 1. What the engine already satisfies

These were verified in code, not inferred from the docs, and were not touched.

| Frozen requirement | Where it lives | Verdict |
|---|---|---|
| One runtime, role/capability profiles | `engine/agentLoop.ts` `runMemberAgent`; tiers are `Specialist` records in `types.ts`, not separate codebases | satisfied |
| Captain is the only human-facing agent, and no rung of the company chain is skipped (Captain ⇄ Consul ⇄ Adept ⇄ sub-agents) | `chain.ts` (the law), `captains.ts` (one Consul per category), `workspace.ts` (refuses a desk with no Consul); `face.tsx` | satisfied |
| Routing is sparse, capped | `moeV2.ts` `CREW_MAX = 25`, `POOL_CATEGORY_MIN = 3` | satisfied |
| AI proposes, deterministic code authorises | `tools.ts:371` refuses non-`safe` tools without a gate; `generalist.ts:284` tier gate | satisfied |
| Gate is a hard capability check, fail-closed | both above return `gated-out`, never auto-run | satisfied |
| Human gate is receipted on BOTH branches | `store.ts` `decideGate` writes `gateLog` on approve and refuse | satisfied |
| Receipts are hash-chained and tamper-evident | nested digests: tool → member → synthesis → provenance → ECDSA mandate | satisfied |
| Receipts are honest about what they prove | `types.ts:319` states the provenance digest is "an evidence hook, NOT a proof receipt" | satisfied |
| Federation is cross-principal | `federation/standing.ts` two-signature ECDSA standing grant, `reach/delegationGrant.ts` capability narrowing | satisfied, 2-party only |
| Regulated activation is cryptographically gated | `federation/regulatedPolicy.ts` refuses unsigned activation "a name is not an authorisation" | satisfied |
| Self-improvement cannot rewrite its own authority | `rsirals.ts` `GOVERNANCE_PLANE` frozen, `∂T/∂A = 0` | satisfied |
| Checker is never the author | external `verifier/si-verifier.mjs`, 10-check battery, digest-pinned, owner-countersigned | satisfied |
| Untrusted archives are scanned before decompression | `mission/archiveScan.ts` bomb defence + entry-name sanitising | satisfied |
| Quarantine exists for extraction | `mission/fileIngest.ts` | satisfied |

---

## 2. What was fixed in this pass

### 2.1 The tool layer was dead in production — **the largest defect found**

`store.ts` `runDeps` returned only `provider`, `gate`, `onHandoff` and
`evidenceFetch`. `generalist.ts:350` gates the tool context on
`deps.workspaceRoot`, so with that absent every member took the single-call
path. Consequences in the shipped app:

- `hasTools` was `false` for every member, on every surface
- all eight tools were probe-only: `fs.list`, `fs.read`, `fs.write`,
  `net.fetch`, `wiki.search`, `pc.exec`, `pc.browser`, `mcp.call`
- the per-tool risk gate never fired
- `ToolReceipt` was always empty, so the ledger showed runs with no tool
  evidence
- `attestMissionRun` returned `null` on every run, because `executedTools`
  was always empty

`engine/browserWorkspace.ts` already existed and was written for exactly this
seam. It was simply never wired. `runDeps` now supplies `workspaceRoot` and
`fsImpl` from a store-held workspace, defaulting to the in-memory backing and
offering a user-picked directory via `useRealFolder()` when the File System
Access API exists.

### 2.2 The human gate could clobber itself

The gate is a single slot in the store, and `makeGate` did
`set({ gate })` per ask with no queue. Two live asks meant the second
overwrote the first and the first promise never resolved — a run would hang
forever with a pending gate. Latent before this pass, reachable now that the
tool layer is live (a member can raise an output gate and a tool gate).
`makeGate` now chains asks so only one is pending at a time.

### 2.3 Members ran sequentially

`generalist.ts` ran members in a `for … await` loop. At `CREW_MAX = 25` and
`MAX_AGENT_STEPS = 5` that is up to **125 serial provider round-trips** for one
message. Members are independent — no member reads another's output — so they
now run through a bounded-concurrency map (`MEMBER_CONCURRENCY = 4`, a
rate-limit budget rather than a speed target). Result assembly stays in
routing order, so every digest and rendered section is byte-identical to the
sequential path. `crew.ts` carries a 25-lane implementation, but it is
unreachable from `store.ts`; this fix does not depend on it.

### 2.4 The provenance digest attested a route that never happened

`routeWithModel` set `routedBy: "llm-assisted"`, and `responseCanonical()`
commits to `routedBy` in the provenance digest. But the MoE floor then
replaced `routed.selected` wholesale, and the type's own doc says the field is
"which mechanism produced the final order". The digest was therefore attesting
an LLM decision that did not decide anything. The floor now sets
`routedBy: "deterministic"`; `fallbackReason` still records what the re-rank
did, honestly.

### 2.5 Seven hundred specialists had no tools

`toolsForCategory` covers 14 of 16 categories. `finance` and `silicon` fell
through to `default: return []`, so 700 bench members could be routed to,
gated for, and then do nothing. Both now map to
`["fs.read", "fs.write", "wiki.search"]` — read the source, write the
deliverable, consult a pinned reference. Deliberately **no `net.fetch`**, so
neither category can reach an arbitrary endpoint by naming one in a prompt.

### 2.6 Company and customer references removed

The finance demo named a real company, its real CEO, and its real
counterparties. Anonymised in place to `Synthetic Industrial Ltd`, and the
generator renamed `buildKrIndustriesLedger` → `buildDemoLedger`.

**The fixture's structure was preserved deliberately.** The six anchor rows —
a large purchase, a payroll run, an exact duplicate pair, a board-note
settlement, a negative credit note — are what `probe/financeExcel.test.ts`
asserts on. Renaming them without preserving the structure would have gutted
the test while leaving it green.

Left in place, with reasons:

| Kept | Why |
|---|---|
| `munshi/gstin.ts` "Tamil Nadu" | real GST state-code data; removing it breaks tax validation |
| `INR` and the GST challan line in the finance fixture | domain characteristics of the pack, not customer identity |
| `selfimpulse.ts` city knowledge base and the IST clock tool | a timezone feature, not a company reference — see OPEN-3 |

---

## 3. Design system

The palette moved from Charleston/champagne to the house colours:
Bistre ground, Feldgrau rail, Isabelline and Eburnean on light, Skobeloff
accent (lifted to `#2E9E9B` on dark for contrast). Three probes pinned the
old hex values; the pins were re-anchored to the new tokens **without
loosening what they assert** — not-flat-black, a real light ground/ink pair, a
single declared accent, the competitor-colour deny list, the font roles, and
the light-weight rule all still hold.

Corrections made to my own work after looking at a screenshot: the accent was
initially used as a large solid fill in three places, which made the rail the
loudest thing on screen. It is now a soft fill in the rail and a solid fill
only on the composer's send. The serif was removed from navigation, which had
been reading as a table of contents. The suggestion list lost numerals that
did not describe a sequence.

---

## 3.5 What landed after this audit (re-verified 19.7.16)

Six items were carried as findings and have since landed. Each was re-checked
against the source for this revision, not taken from a changelog.

| Item | Where it lives now | Verdict |
|---|---|---|
| Skill imports are scanned for injection | `src/engine/skillsImport.ts:162` `assessImport` strips invisible characters, runs `scanForInjection`, and refuses a `critical` tier in words. The scan line rides the stored record as `scanNote`, so the finding is disclosed rather than swallowed. | landed |
| …and re-scanned at composition time | `skillsImport.ts:366-398`. A body written by an older build predates the scan, so the store-write path alone is not a boundary. Three refusal paths close it. | landed |
| Federation depth bound | `src/mission/selfimpulseTeams.ts:360` `MAX_FEDERATION_HOPS = 2`. The sender's claimed hop is never authoritative (`:329-347`); the receiver counts its **own** observed hops and refuses past the limit (`:455-458`). A forged `hop: 1` buys a peer nothing. | landed |
| Federation spend caps | `src/mission/caps.ts:84` `INBOUND_DELEGATION_CAPS` — $2, 40 turns, 4 invocations, 30 min, all strictly under the owner's own defaults. | landed |
| Pre-dispatch budget check | `src/mission/a2aBridge.ts:425` refuses before dispatch on `ledger.admissionError()`; `src/mission/teamExecutor.ts:1413-1416` refuses per turn as `blocked_budget`; `src/engine/agentLoop.ts:246-260` applies a pre-dispatch token ceiling. The repair rung is admitted separately so a ceiling cannot be evaded by retrying (`:333-337`). | landed |
| Durable-run persistence | `src/mission/runCheckpoints.ts` now has a full path — `persistRunJournal`, `restoreRunJournal`, `loadRunJournal`, `resumeRun`, and a lazily-resolved store (`:81-105`, so a graph installed after module load is not silently missed). `missionRuntime.ts:395` calls `resumeRun` **before any new work**, so the verdict is on the record first. | landed, with a seam open — see below |
| Crew idempotency | `src/mission/teamExecutor.ts:1616-1653` gates `git add -A`/`commit` on `dispatchedAnyTurn`, so a resumed seat cannot re-apply work it already applied; `src/mission/crewMission.ts:399,414` consumes `seat.idempotency.reused` and reports the count. | landed |
| Undefined `--si-*` tokens | **0 remain.** Measured across `src/ui/vh.css` + `src/ui/si/si.css`: 41 tokens declared, 39 consumed via `var()`, 0 undefined. The 15 that were referenced without a declaration are now declared. | landed |

### 3.5.1 The durable-run seam that is still open

The engine path is complete and wired. The **UI** path is not:
`resumeDurableRun()` and `flushRunJournal()` are defined at
`missionRuntime.ts:1441` and `:1462` and have **no caller in `src/ui/`**. So
the two cases that matter most in practice — "can my interrupted run
continue?" at startup, and "save now" while the window is closing — are
reachable from the runtime but not from the app. Carried forward as **OPEN-14**.

---

## 4. OPEN — not done

These are real. None is cosmetic.

**OPEN-1 · The self-improvement loop has no caller.** `selfEvolve.ts`,
`rsiralsV6.ts`, `canaryClient.ts` and `verifierTrust.ts` are 926 lines of
constitution, drift, canary and rollback governance. `runRsiCycle`,
`applyRsiDraft` and `settleRsiPromotion` have **no caller in `src/`**. Only
`recordRsiSignal` and `revertRsiMemory` are wired. The pinned external
verifier at `verifier/si-verifier.mjs` is never spawned by the app. The
machinery is correct and unreachable.
*Re-verified 19.7.16: still open. The three exports are defined at
`src/engine/rsi.ts:215,263,333` and referenced from doc comments only.*

**OPEN-2 · ~~`crew.ts` is dead (472 lines).~~ CLOSED 19.7.16.** This item said
the only code with true concurrency, per-member failover, a circuit breaker and
hot mode switching had no `src/` caller. It now has one:
`src/mission/crewMission.ts:97` imports `runCrewSession` and calls it at
`:492`, and `src/ui/screens/Work.tsx:39-45` calls `runCrewMission` from the
screen. The breaker, the 25-lane bounded concurrency (`crew.ts:63,362`) and
mode switching are now on a live path. §2.3's workaround is still the path
`store.ts` uses; the crew module is the path `Work.tsx` uses. Both are real.

**OPEN-3 · The clock tool is hard-wired to one city's timezone.** `selfimpulse.ts`
computes IST and `SelfImpulsePage.tsx` ships a starter button that asks for that
city's time. For a global product the clock should read the machine's own
zone. Left alone because generalising it touches timezone logic and three
probes, and it is a product decision rather than a defect.

**OPEN-4 · `gateRules.ts` is unwired.** `answerGateWithRules` is called only
by a probe.
*Re-verified 19.7.16: still open. Defined at `src/engine/gateRules.ts:57`,
no caller in `src/`.*

**OPEN-5 · 27 modules are unreachable from `store.ts`.** Includes `byoa.ts`,
`wings.ts`, `graph3d.ts`, `modes.ts`, `steward.ts`, `lotus.ts`, `teams`
(`groups.ts`), and `finance/` entirely — so the finance engine, `xlsxLite` and
the demo generator ship in the bundle but run only under probes.
*Not re-counted this pass — the module graph moved while four agents were
editing `src/`. The figure is stale, not disproved; re-count before citing it.*

**OPEN-6 · `SELF_EVOLUTION_FLOOR` and `RSI_FLOOR` are decorative.** Both are
string arrays explicitly `void`-ed. Tighten-only is enforced *structurally* by
the override store's shape, which is the honest mechanism, but the named
"floor" is words. Either enforce it or delete it.
*Re-verified 19.7.16: still open. `SELF_EVOLUTION_FLOOR`
(`selfEvolve.ts:40`) is joined into a display string at `:151`;
`RSI_FLOOR` (`rsi.ts:43`) appears only inside a doc string at `:47`.*

**OPEN-7 · `reach/delegationGrant.ts` is the weakest oracle.** It is the only
cross-principal decision point whose output is an unsigned hash, and
`bridge.ts` feeds its verdict straight into `crossFederation`. Everything else
in the trust fabric is ECDSA P-256.

**OPEN-8 · `selfimpulseMesh.ts` uses symmetric HMAC** inside an otherwise asymmetric
fabric (`attest` takes a shared `peerSecret`).

**OPEN-9 · `demoEntry.ts` writes files at import time.** Zero exports,
top-level `fs.writeFileSync`. Any future import of that module writes four
files into `demo/`. It should export a function and be called by the tool.

**OPEN-10 · 60 `DeskSpecialist` Lead/HR objects can never execute.** They
appear in `officeSnapshot` for display and are never routed to. The office
line prints `ORG_SPECIALIST_COUNT` next to the floor count, which reads as 60
runnable agents.

**OPEN-11 · `registry.ts` is 2,093 lines / 211 KB of inline data** loaded
eagerly into the module graph, plus ~9,000 lines of generated batch snapshots
in three more files.

**OPEN-12 · Every source change requires `node tools/rebuild-pack.mjs`
(~97 s)** or `offlinePack.test.ts` fails on drift. Correct behaviour, high
friction. Worth a `npm run verify` that does both.

**OPEN-13 · `routeWithModel`'s LLM call is still made and largely discarded.**
Its ordering is undone by `selectCrew`'s score sort, but it *truncates the
candidate pool to `MAX_K = 3`*, which is a real effect on routing. Removing it
would change routing outcomes and needs its own probe cycle, so it was left
in place. The attribution bug in §2.4 is fixed; the wasted call is not.

**OPEN-14 · An A2A seat id carries 4 bits of entropy, and worktree branches
are never deleted.** Found 19.7.16 while diagnosing an intermittent test
failure; it is a product defect, not a test artifact.

- `src/mission/a2aBridge.ts:184` builds a seat id as
  `` `a2a-${teammate.id.slice(0,8)}-${uid("seat").slice(0,6)}` ``. `uid()`
  returns `seat-<csprng token>`, so `slice(0, 6)` keeps the five literal
  characters `seat-` plus **one** hex character. Measured over 4,000 draws:
  **16 distinct values — 4 bits.**
- `src/mission/collaboration.ts:78` turns that id into a branch
  (`vh/<missionSlug>/<seatId>`) and into the worktree directory path.
- `collaboration.ts:94` removes a worktree with `git worktree remove --force`,
  which removes the **directory** and leaves the **branch** behind.
- So a second delegation against the same repository and the same teammate asks
  `git worktree add -b` for a branch that already exists. Git exits 255 with
  `fatal: a branch named '…' already exists`, `teamExecutor.ts:818` records the
  seat as failed ("its worktree could not be created"), the run reports
  `blocked`, and the bridge returns `ok: false`.
- **Failure rate 1/16 ≈ 6.25% per run, independent of machine load.** Measured:
  39 green / 1 red over 40 strictly sequential solo runs on an idle machine, and
  1 red in 16 concurrent runs. It is a dice roll, not a race.

The fix belongs to whoever owns `src/`: widen the slice so real entropy
survives (and stop slicing a prefixed id at all — slice the token, not
`seat-<token>`), and delete or reuse the branch on teardown so the second run
against one repo is a legitimate operation. Until then, treat any intermittent
`a2aBridge` / `a2aRuntime` failure as **this**, and read the git message rather
than assuming a regression.

**OPEN-15 · The offline pack verifies the live tree, not the tree it was built
from.** Several packed bundles re-read `src/` or a committed bundle from disk
at runtime — `stubSurface.test.ts` scans `src/` for `node:*` imports,
`a2aRuntime.test.mjs` and `mcpRouter.test.mjs` rebuild `tools/si-host-engine.mjs`
and `tools/mcp-engine.mjs` and compare. So the pack is not hermetic: edit a
source file and a pre-built bundle will legitimately fail against it. This is
the freshness discipline working as designed, but it means "the offline pack is
reproducible with zero install" holds for the *bundles*, not for the *working
tree*. Say so in `docs/VERIFICATION.md` rather than leaving a reviewer to
rediscover it.

---

## 5. Standing instruction

Read and understand the implementation before changing it. Preserve components
that already satisfy the invariants. Change only what materially violates
them. Do not rebuild working infrastructure to match a diagram. Produce a gap
document before destructive changes.

**This document is that gap document.**

- Sections 1 and 2 are done and verified.
- Section 3.5 is landed and re-verified (19.7.16).
- The items in section 4 are **not** done and are not to be reported as done.
  OPEN-2 is the only exception: it is closed, and it now has both a src/
  caller and a UI path.
