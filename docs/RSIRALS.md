# RSIRALS v5.0 — Trust-Rooted Recursive Self-Improvement
## A proprietary SelfImpulse product architecture (implementation: `src/engine/rsirals.ts` + `src/engine/rsi.ts`)

**RSIRALS** = **R**ecursive **S**elf-**I**mprovement + **R**einforcement + **A**gentic **L**earning **S**ystem.

**Core lifecycle (fast plane):**
`OBSERVE → ATTRIBUTE → IMPROVE → VERIFY → PROMOTE → CANARY → REMEMBER → MONITOR → REPEAT`

**Parallel slow channel (never touched by the loop above):**
`HUMAN GOVERN → VERSION → SIGN → DEPLOY TRUST POLICY`

**Governing principle:** the agent may recursively evolve everything about
itself. It may never recursively evolve the authority that judges whether its
evolution is allowed. Formally: **∂T/∂A = 0** — the governance plane T has no
write-dependency on anything the agent produces, however indirect.

---

## 1. The three planes, as shipped

### Plane T — Governance (`GOVERNANCE_PLANE`, frozen)

Objective contract, promotion rules, safety policies, evaluation standards,
resource ceilings, rollback authority. Shipped as a **frozen, digest-stamped
constant with no setter, updater or patcher anywhere in the product** — the
door probe pins `Object.isFrozen(GOVERNANCE_PLANE)` and scans the module for
any mutation API. T changes only through its own lifecycle:

`Human proposal → Independent review → T_vN → T_vN+1 → Signed release → deployed → RSIRALS resumes`

In SelfImpulse that lifecycle is the existing human-gated self-evolution flow plus a
versioned release — never the recursive loop.

### Trust / Promotion plane (enforces T, never redefines T)

| Component | SelfImpulse implementation |
|---|---|
| Control-plane firewall | `controlPlaneFirewall()` — candidates touching governance-plane targets are rejected **before verification runs**; no score can override it |
| Independent verification | The autonomy exam is held out of the generation path — the judge that scores is never the drafter |
| Regression testing | The probe fleet (pins) — a change that breaks a pin cannot ship |
| Safety/policy testing | The GuardRail: SSRF/egress policy, injection scan, rate gates |
| Anti-reward-hacking | Promotion settles only on **receipt-bound** measurements (exam receipts), or is explicitly marked externally supplied |
| Anti-collapse | Diversity check over applied playbook families |
| Cost budget | T's resource ceilings bound provider calls, topics, draft size per cycle |
| Canary + auto-rollback | Applied playbooks arm a canary; scaffold-attributed live regressions revert them automatically, receipted in the archive |
| Deterministic evidence | Ledger ids, digests, receipt stamps — replay records carry inputs + receipt digests frozen at run time |

### Self-improving agent plane (the Σ/θ dual clocks)

- **Σ-arm (fast, in-product):** playbooks, routing, prompts, memory — the
  `rsi.ts` loop: curriculum from the five evidence sources → actor drafts →
  human apply → frozen digest-stamped memory → measured promotion.
- **θ-arm (slow, out-of-band):** weight updates. **SelfImpulse never trains weights
  in-product** — that is the honest boundary of a local-first assurance
  runtime. Instead, model-shaped failures attribute to the θ-arm and its fuel
  is exported: `exportThetaPairs()` yields the real logged accept/reject
  pairs for out-of-band DPO under human governance (RSIRALS Phase 1).

## 2. Attribution — failure-source / arm routing (honest wording)

`attributeEvidence()` is **heuristic failure-source attribution by failure
shape — arm routing, not a full causal counterfactual experiment.** True
controlled counterfactuals (same/matched task, baseline vs candidate,
measured outcome) live in the mission-level measured loop
(`src/mission/selfImprove.ts`); the two layers are designed to meet at the
promotion ladder.

- scaffold-shaped (playbook/routing/tool/prompt/egress/retrieval) → **Σ-arm**
- model-shaped (provider/model/completion/api errors) → **θ-arm**
- ambiguous → **joint**, tagged

Attribution also drives the canary: a model-shaped failure does not roll back
scaffold memory — no blame-spray.

## 3. Promotion — end-to-end evidentiary

```
candidate playbook
   ↓ human applies (canary arms, baseline exam score recorded)
   ↓ controlled operation with real receipts
   ↓ exam receipts: baseline-at-apply vs latest
   ↓ bound comparison (candidateScore > baselineScore)
   ↓ adopted — or retired with exact revert of frozen memory
```

`bindSettlementEvidence()` reads the numbers from the product's own receipts
and returns them as **sealed** `MeasurementEvidence`; `settleRsiPromotion()`
accepts ONLY sealed evidence — the raw numeric settlement function is
module-private, and forged or tampered evidence fails the seal check.
Without real receipts the bind step refuses in words. That makes the
receipt-bound path the ONLY product-level settlement door — the
anti-reward-hacking rung, enforced structurally.

**Sealed, not attested — stated plainly.** The seal proves *measurement
integrity* (these exact fields belong to this digest). It does NOT prove
*provenance/authorship* (that a trusted execution system produced them) —
the salt is public, and this is a local-first client, not a signing
authority. Signed measurement provenance (receipt id + execution provenance
bound into signed evidence) is the named next milestone; until then the
honest claim is "sealed," never "cryptographically attested."

### Structured change contracts (the primary enforcement)

Strings alone cannot prove a candidate safe, so the primary governance
check is structural: every change carries a contract — `target`, `field`,
`old/new value`, `authority`, `scope`, `risk` — and `validateChangeContract()`
rejects any mutation targeting a protected field (`governance`, `gate`,
`exam`, `verification`, `risk-tier`, `floor`) regardless of authority or
wording. Every RSI draft is born with its contract; the string firewall
remains as defense-in-depth, supplementary rather than primary.

## 4. Failure mode → component (why each piece exists)

| Failure mode | Component |
|---|---|
| Agent rewrites the rules that judge its own rewrites | Frozen Plane T + control-plane firewall (no write path) |
| Training on self-generated defective data → collapse | Anti-collapse check + longitudinal monitor over the archive |
| Verifier gaming / reward hacking | Receipt-bound settlement; independent verifier held out |
| Non-reproducible environment breaks attribution | Receipt digests frozen at run time; shape-based attribution |
| Replay passes but live behavior drifts | Canary watch + automatic rollback on live regression |
| Single-candidate checks miss slow drift | Longitudinal monitor runs on the ARCHIVE (capability, diversity, verifier, cost drift) |
| Safety criteria go stale | T's own human-governed lifecycle, separate from the loop |
| Misrouted root cause (weights vs scaffold) | Failure-source attribution / arm routing (heuristic, labeled as such), not hard binary routing |
| Forged or replayed measurement evidence | Sealed MeasurementEvidence; raw settlement API is module-private |
| String-evasion of the governance firewall | Structural change contracts are primary; strings are supplementary |

## 5. Research anchors

Schmidhuber's Gödel Machine / success-story algorithm (theoretical root of
provable self-rewrite); Gödel Agent (ACL 2025); POLARIS (ACL Findings 2026);
ADAS (archive-driven agent design search); "Self-Improvements in Modern
Agentic Systems: A Survey"; "LLMs Gaming Verifiers: RLVR can Lead to Reward
Hacking"; the 2026 RSI taxonomy survey and RSIAgent (both in the founding
reading list); Huang et al. (ICLR 2024) on the unreliability of intrinsic
self-correction.

## 6. What is deliberately NOT in scope (honesty clause)

- No in-product weight training, no reward-model training, no population
  search (compute ceilings governed by T).
- No autonomous T changes. Ever.
- No promotion on self-generated scores.
- The θ-arm is an export seam, not a trainer.

That is what makes RSIRALS a *trust-rooted* RSI: recursion everywhere the
evidence supports it, and a wall exactly where authority lives.
