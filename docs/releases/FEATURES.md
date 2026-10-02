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
