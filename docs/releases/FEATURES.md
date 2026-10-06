# SelfImpulse — features

What the product does, in the order you meet it. Every item below is
enforced in code and pinned by a probe in `probe/`; nothing here is a roadmap.
The engine underneath is **MJ**.

## The Captain

- One place to ask. Type the outcome you want; the Captain routes it across a
  large bench of specialists (engineering, finance, healthcare, silicon, regulated
  domains and more) and fields up to twenty-five in parallel.
- **Honest outcomes.** Answered · planned · refused · gated-out · delegated ·
  error. Without a provider the Captain plans and says so.
- **Memory-aware.** Referential questions ("what did we decide last time?")
  rehydrate the right earlier conversation, marked as such.
- **Rename it.** The Captain answers to whatever name you give it.

## Work

- A live top-down graph of the run: you → Captain → agents → tools →
  receipts. Agents are anonymous (AGENT 01, 02…); the crew is internal.
  Metallic octahedrons, champagne light, directional arrows.
- **The human gate.** Actions above the safe tier pause here with the action,
  risk tier and summary. Approve once, or refuse with a reason. Both are
  receipted.
- Per-agent tool calls and their receipts; a "Read the answer" hand-off back
  to the conversation when the run is done.

## Specialists

- One system: a team per domain, deterministic engines behind every number,
  a human gate wherever the last step would change something real.
- Agentic MoE picks the fewest experts that cover the request, never more
  than twenty-five at a time.

## Receipts

- A compact ledger: every reply, tool call, gate decision and handoff with its
  digest and signer.
- Export as a file. Receipts are hash-chained; a doctored ledger refuses to
  verify.

## Docs

- Teach the Captain from your own documents: paste one, or load a `.md` / `.txt`
  file. The engine distills **structure**, not a summary — procedure, decision
  rules, known failure modes, chapter hints.
- **A raw blob is refused, in words.** A document with no extractable structure
  comes back with the reason, not a vague acceptance.
- **Nothing installs itself.** Each document becomes a *proposal*; only your
  approval mirrors it into an installed knowledge skill, and the decision records
  who and when. One decision per proposal.
- **Handling is disclosed, never implied.** Every proposal says whether the
  content stayed on this machine or went to the selected model provider, and
  names the endpoint class when it did.
- **Knowledge is not a measured claim.** Approved knowledge is human-approved
  knowledge; it is never counted as a measured effect.
- **The distiller is named, not implied.** Extraction is **mechanical** by
  default: the structure is read out of the text on this machine and no model is
  called. The engine can also distill through an LLM harness, and when it does the
  proposal says so, names the harness, and discloses the endpoint class. This door
  takes the mechanical path, which is stated on the surface rather than inferred.

## Memory

- Every conversation becomes a keyword graph you can move through in 3D
  (drag, zoom, auto-rotate). Frosted spheres, teal light, no arrows — visually
  distinct from the Work DAG. Double-click a node to reopen that conversation.
- Encrypted at rest behind the vault; a single switch turns memory off.
- Forget a session with one click.

## Settings

- **Provider** — OpenAI-compatible, Anthropic or Gemini endpoints; bring your
  own model. Keys are session-only by default.
- **Vault** — seal the key at rest with a passphrase; lock and unlock at will.
  Any legacy plaintext key found on first run is purged.
- **Autonomy** — four levels. Above Off, a heartbeat lets the Captain act on
  its own inside hard caps, through the same governed path as a typed
  message, with a circuit breaker on failure. "Run a heartbeat now" is one
  click.
- **Federation** — work with another owner: a two-human standing grant with
  enumerated capabilities and a budget, receipted crossings, a common ledger
  derived from both stores, and a signed activation before regulated
  specialists route.
- **Appearance** — charcoal or bone; one sheet, no animation gimmicks.
- **About** — the engine credit and the guardrail manifest.

## Guardrails (enforced in code, not prompts)

- No root authority without a human principal.
- No delegation that grows scope or outlives its parent.
- No spend beyond the signed cap.
- No house rules written by an agent — propose only.
- No skill installed without measured adoption or human approval.
- No merge when the verifier gate fails — the checker is never the author.
- No learning persisted from simulated runs.
- No invented prices — token-only harnesses stay dollar-unknown.
- No artifact leaves the machine without a signed egress authority and receipt.
- Capability requests return answers only — raw rows never leave.
- Aggregates pass the Privacy Guard: minimum cohort, hard query budget,
  bounded precision; the budget is durable and per-requester.
- The two-machine proof: the coordinator sees identity, request, authorization
  and receipt — never rows.

## Ledgers & capabilities (1.3)

- **Agent FinOps** — every seat run lands in a dollar-honest ledger
  (`engine/finops.ts`): measured spend, USD-unknown runs kept their own
  column, chargeback rollups by seat, mission and day, and a CSV export an
  auditor can read. Fed live by the mission executor's settlement.
- **Agent IAM** — the fleet roster (`engine/iamLedger.ts`): every seat's
  owner, issuer key, canonical scope and revocation state, exportable as
  JSON. A view over the sovereign — revocation goes through it, and a
  revoked seat fail-closes at its next governed step.
- **Assurance, live** — the measured score from the governed runtime's own
  facts (`engine/assuranceLive.ts` over `mission/assuranceScore.ts`):
  verification, budget discipline, egress integrity. No measured runs, no
  score — the honesty rule holds.
- **Scoped capabilities** — a human approval mints a signed capability
  (`security/capability.ts`): audience-bound, redeem-once, expiring,
  depth-zero. The unit of authority that can leave the window.
- **One mandate format** — sovereign mandates render as canonical
  `vh.mandate.v1` mandates (`security/sovereign.ts`), verifiable by the
  same key anywhere in the fabric; the owner's key binds as the root, the
  session key bootstraps, and the root says which it is.

## The sovereign core, closed (1.4)

The 1.3.0 review named the last four gaps between "we have mechanisms for
sovereignty" and "the running system derives every executable authority
from one root". All four are closed and pinned:

- **The owner root is LIVE** — `security/ownerRoot.ts`: the vault
  passphrase (the owner's presence proof on the machine) derives a stable
  Ed25519 root key (HKDF, deterministic across sessions) and binds it as
  THE sovereign root at unlock. `bootstrap` is only the pre-unlock label.
- **One root signs everything** — capabilities have no side key: they sign
  with the sovereign's current root, the exact key that signs mandates.
  Binding the owner re-roots both at once.
- **Execution redeems** — the human gate mints, verifies, and only then
  grants a capability; every execution plane (chat actions, tool calls,
  the meta loop, the authority plane) verifies and REDEEMS it before any
  effect. One approval, one execution. If the capability layer is
  unavailable, the approval is refused — fail-closed, never true on faith.
- **Revocation is sticky** — the runtime path (`mandateFor`) refuses a
  revoked seat and can never un-revoke it; only the owner's explicit
  `regrant` lifts a revocation.
- **Scheme honesty** — canonical mandates carry scheme-prefixed signatures
  (`ed25519:`); verification requires the scheme the prefix names. The
  portable fabric key remains ECDSA P-256 (`authorityWeb`); Ed25519 is the
  local, explicitly-scoped root.

## The sovereign core, frozen (1.5)

The 1.4.0 review scored the architecture and named the last three hardenings
before the authority model freezes. All three shipped, and the freeze is now
declared: the sovereign core's authority model does not change again — the
work below it (the execution fabric) begins.

- **Lock locks.** Locking the vault takes the owner's authority out of
  memory: the root unbinds (`unbindOwnerSigner`) and every capability the
  departing root minted is INVALIDATED — marked dead permanently, redeem-once
  memory intact, so nothing dead can be redeemed even after the same owner
  key returns. Owner-signed mandates stop verifying while locked and verify
  again on unlock: nothing lost, nothing forged.
- **The bootstrap window is read-only.** Before the owner's key is bound, no
  effectful capability may be minted — the refusal lives in the mint itself,
  one throat. A closed read-only vocabulary (read, list, get, status, poll…)
  still works; everything else, including anything unknown, is treated as
  effectful. Headless engines take the operator's vouch from the environment
  that launched them (`SI_OWNER_SECRET`); no environment vouch, no authority
  to effect.
- **The owner key inherits the vault's hardening.** The passphrase never
  becomes a key directly: it first runs the vault's own hardened derivation
  (the stored salt and cost the vault already demands), and only that
  high-entropy output is domain-separated into the root seed. One derivation
  scheme, stable per vault, no invented crypto.

With 1.5.0 the answer to "who may effect what?" is one chain, end to end:
the owner's presence (vault unlock) → one derived root → signed mandates and
capabilities → verify → redeem → effect → signed receipt. Everything below
this line is fabric, not authority.

## The production-run layer (1.7)

The features enterprise agent platforms converged on — durable execution,
proactive triggers, evaluation gates — built on the frozen authority core,
never around it:

- **Durable runs** (`mission/runCheckpoints.ts`) — every settled mission
  wave and every human-gate pause appends to a tamper-evident checkpoint
  chain. The pending approval carries its run reference; the decision lands
  on the chain even after a restart. A tampered journal refuses to resume —
  in words, naming the broken link.
- **Intake triggers** (`engine/intakeTriggers.ts`) — schedules fire when the
  interval
  has actually elapsed; webhooks verify an HMAC signature in constant time
  (the secret is shown once, stored only as a fingerprint); events match by
  exact name. Every fire rides the same governed call as a human request —
  a trigger is a doorbell, not a key.
- **Governance evals** (`mission/evals.ts`) — cases run the REAL governed
  pipeline; the baseline is explicit; the regression gate names the case
  ids that fell and says do-not-ship in words.
- **The product surface** — Settings grows a Triggers pane: arm a schedule,
  pause it, watch what it fired and where it sits (gated or done).

## 1.9.1 — the last seam, closed

Even the probe-reset helper on the policy registry refuses after the seal:
a security-critical module does not keep a public reset that outlives its
own seal. No authority change — a patch, by design.

## The integration baseline (1.9)

The last carried hardening, closed: the POLICY registry now seals at
trusted startup, the same way the read-only action registry already did —
both engine entry points call `sealPolicyRegistry()` after boot, and a
sealed registry refuses new rules forever. Loaded code — a worker, a
plugin, an integration — can evaluate policy; it can never rewrite what
the rules mean. With this, everything the review asked before integration
below the frozen throat is ✅, and 1.9.0 is the baseline that integration
starts from.

## The issuance throat, closed (1.8)

The 1.7 review found the two roads that still bypassed the bootstrap
window — both at the authority issuance layer, both now shut and pinned:

- **Bootstrap cannot mandate effect.** `mandateFor` itself refuses an
  effectful profile (write, shell, network, or any risk above low) while
  the root is bootstrap — the same rule the capability mint enforces, now
  at the base-authority throat too. A read-only profile still mandates:
  the window stays useful without becoming a hidden root.
- **Regrant authenticates the owner.** Only the bound owner root can lift
  a revocation; under bootstrap the seat stays revoked, by name
  (`owner-required`).
- **The checkpoint chain hashes every field.** Each entry digests
  mission, step, label, state, previous entry, and timestamp — rewriting
  a label (the auditor's oldest trick) breaks the chain exactly like a
  swapped state.
- **The read-only registry seals at trusted startup.** Both engine entry
  points seal after boot: loaded code — workers, plugins, integrations —
  can never register `delete_database` as read-only. The trusted action
  manifest begins here.

## Freeze hardening (1.6) — the last polish before the line holds

- **Lock is one atomic transition, fail-safe ordered.** The owner's
  authority leaves memory FIRST — root unbound, its capabilities
  invalidated — and only then does the vault seal, in the same synchronous
  task. Nothing can observe "locked" with the owner root still bound.
- **The read-only registry is exact.** An operation is non-effectful only
  if its exact name is registered; dotted sub-actions join only by explicit
  registration from the plane that owns them. No prefix inference —
  `read_delete` and `list_and_delete` are effectful, and anything unknown
  is effectful.
- **The vault's cost is honest and measured.** The shipped cost is a
  measured desktop choice recorded in the vault meta — not a citation.
  New vaults calibrate against the machine they live on (never below the
  shipped floor), and unlock can raise an older vault's cost, re-sealing
  every record at the new cost.
- **Memory tiers** — working, episodic, semantic (`engine/memoryTiers.ts`):
  promotion is mechanical and carries its source episodes; recall is a
  named number; forgetting is a visible TTL policy.

## Under the hood (the MJ engine)

- **Routing** — sparse specialist routing over the whole bench, at most 25
  sub-agents; a Captain synthesises multi-agent answers with its own reasoning pass.
- **Behaviour enforcement** — a runtime phase/provenance machine on every
  sub-agent, not just a prompt.
- **Live-data guardrail** — cited sources are fetched and claim-checked before
  an answer is called verified.
- **Token pipeline** — normalise → dedup → cache-align → budget at the
  provider choke point; savings are measured and shown.
- **Self-improvement, bounded** — the Captain's own failures become
  curriculum; drafts are digest-stamped playbooks; promotion is
  measurement-gated behind an external, signed verifier with staged rollout
  and one-step rollback. A canary that attributes a failure to an applied
  change rolls it back.
- **MCP** — the engine doubles as an MCP router and an A2A host; any MCP
  server can be registered, SSRF-guarded, with environment names only.
- **Runs anywhere** — web (Vite), desktop (Tauri), and a zero-dependency
  offline verification pack.

## Verify

```bash
node tools/run-all-probes.mjs   # the full dev gate
node verify/run.mjs             # the offline pack, no install
```
