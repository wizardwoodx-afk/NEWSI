/**
 * MJ — the Captain (CEO) front door (askSelfImpulse19 keeps its symbol so the store and
 * probes stay wired; the user-facing role is Captain).
 *
 * The ONLY agent the user talks to. One request goes in; behind it: GuardRail
 * scan → the user's learned memory → the MoE router → (optional) the human
 * gate → a real provider execution or an honest non-execution → a
 * provenance-digested response. Peer work delegates through the injected
 * A2A seam; nothing here invents a second front door or bypasses a gate.
 *
 * The honesty contract, restated where it is enforced:
 *   • no provider key        → outcome "planned": routes and plans in words,
 *                              executed: false. Never a fabricated answer.
 *   • provider failure       → outcome "error" with the failure in words.
 *   • risky + gate denies    → outcome "gated-out"; nothing executed.
 *   • risky + no gate        → outcome "refused"; risky work without a human
 *                              gate does not run, ever.
 *   • injection detected     → outcome "refused" with the finding codes.
 *
 * 19.3.0 "Vanguard" — the execution layer becomes real:
 *   • members with a wired workspace run an ACT/ OBSERVE tool loop
 *     (agentLoop.ts) — every tool call gated and receipted;
 *   • multi-member runs end in the Captain's OWN synthesis call over the
 *     members' real answers (synthesis.ts), divergences surfaced, not hidden;
 *   • the live-data GuardRail FETCHES cited sources when an evidence fetch
 *     is wired — "verified" then means retrieval, and the verdict says so.
 */
import { uid } from "../app/id";
import { detectInjection, sanitizeText } from "../security/guardrail";
import { getSpecialist } from "./registry";
import { buildSpecialistPrompt } from "./skills";
import { estimateTokens, optimizeComposedPrompt, recordUsage } from "./tokenOptim";
import { liveDataBanner, liveDataVerdict, verifyLiveEvidence } from "./liveData";
import { buildCaptainReport, captainForRoute } from "./captains";
import { TITLES } from "./chain";
import { buildSynthesisSystem, buildSynthesisUser, findDivergences } from "./synthesis";
import { runMemberAgent } from "./agentLoop";
import { stripToolBlocks } from "./tools";
import { attestMissionRun, recordMissionAuthority, authorityOwnerIdentity } from "./missionAuthority";
import { mandateCanonical } from "./authorityCore";
import { classifyFailure } from "./failures";
import { routeDeterministic, routeWithModel } from "./router";
import { selectCrew, moeLine, type MoEReport } from "./moe";
import { moeV2Line, type CrewSelection } from "./moeV2";
import { musterWorkspace, floorAsCrew, officeSnapshot, type ElevenWorkspace } from "./workspace";
import { complete, redactSecrets } from "./providers";
import { memoryBriefing } from "./memory";
import { applyTeamPreference, autoProposeIfReady, recordTeamRun } from "./teamEvolve";
import { autonomyCovers } from "./exam";
import { regulatedRoutingVerdict } from "./federation/live";
import type { GeneralistDeps, GeneralistResponse, MemberRunView, ProviderConfig, RouteDecision, SynthesisRecord } from "./types";

async function sha256Hex(text: string): Promise<string> {
  const buf = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** How many specialists may be in flight at once. Four is a rate-limit budget,
 *  not a performance target: the win comes from overlapping latency, and past a
 *  handful the provider's own queue starts rejecting work we then have to
 *  classify as a transient failure and repair. */
const MEMBER_CONCURRENCY = 4;

/** Run `fn` over `items` with at most `limit` in flight, returning results in
 *  INPUT order. Order is the whole point — the caller folds these into digests
 *  and rendered sections, and a completion-order result array would make the
 *  receipt depend on which member happened to be quicker. */
async function mapBounded<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  if (items.length === 0) return out;
  const width = Math.max(1, Math.min(limit, items.length));
  let cursor = 0;
  const lanes = Array.from({ length: width }, async () => {
    for (;;) {
      const i = cursor++;
      if (i >= items.length) return;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(lanes);
  return out;
}

/** Canonical serialization of the response — what the provenance digest commits to. */
export function responseCanonical(r: Omit<GeneralistResponse, "provenanceDigest">): string {
  return JSON.stringify({
    v: "engine-response/1",
    reply: r.reply,
    executed: r.executed,
    outcome: r.outcome,
    specialistIds: r.specialistIds,
    routedBy: r.routed.routedBy,
    selected: r.routed.selected.map((c) => [c.id, c.score]),
    strategy: r.routed.strategy,
    note: r.note ?? null,
    captain: r.captain ?? null,
    failure: r.failure ?? null,
    liveData: r.liveData ?? null,
    synthesis: r.synthesis ?? null,
    memberRuns: r.memberRuns ?? null,
    workspace: r.workspace ?? null,
    office: r.office ?? null,
    authority: r.authority ?? null,
  });
}

export interface AskArgs {
  text: string;
  userId?: string;
  /** Explicit peer delegation ("ask <peer> to …") takes the A2A path. */
  peer?: string;
  /** Cross-user team context: the evolved config leans on routing, and peer runs land in the team ledger. */
  team?: { id: string; members: string[] };
}

export async function askSelfImpulse19(args: AskArgs, deps: GeneralistDeps = {}): Promise<GeneralistResponse> {
  const userId = args.userId ?? "default";
  const text = sanitizeText(args.text, 8000);
  /* Review fix (P0) — mission identity is a RANDOM per-run id, never derived
     from the ask text: identical asks by different users/runs can never
     collide into the same browser session or authority context. User/task
     metadata rides the response (userId, routed, provenanceDigest). */
  const missionId = uid("m");
  const now = deps.now ?? (() => new Date());
  void now; // reserved for receipt timestamps in the UI wiring phase

  /* 19.4.0 — the run states which storage seam it rode on, in the digest.
     Declared before finish() so EVERY exit path (including the content-gate
     refusal) carries the workspace view honestly. */
  const workspaceView = deps.workspaceRoot
    ? { kind: deps.fsImpl?.kind ?? "node", root: deps.workspaceRoot }
    : null;
  let officeSnap: ReturnType<typeof officeSnapshot> | undefined;

  /* The advisory layer is attached centrally so EVERY exit path carries it:
     the domain captain reports on the routed work, every non-execution is
     classified with recovery advice, and the live-data GuardRail (19.2.0;
     19.3.0 retrieval upgrade) assesses every answered research/analysis
     reply at RUNTIME. When an evidence fetch is wired, the GuardRail
     FETCHES the cited sources and only a source that was actually retrieved
     and contains the claim markers earns a "retrieval" stamp — otherwise
     the stale flag is appended to the reply itself, inside the digest. */
  const finish = async (r: Omit<GeneralistResponse, "provenanceDigest">): Promise<GeneralistResponse> => {
    const captain = r.captain ?? (r.specialistIds.length > 0
      ? buildCaptainReport(captainForRoute(r.specialistIds)?.id ?? "", r.specialistIds.map((id) => ({ specialistId: id, outcome: r.outcome, note: r.note }))) ?? undefined
      : undefined);
    const failure = r.failure ?? (r.outcome === "answered" || r.outcome === "peer-delegated"
      ? undefined
      : classifyFailure(r.outcome as "planned" | "refused" | "gated-out" | "error", r.note));
    let reply = r.reply;
    let liveData = r.liveData;
    if (r.outcome === "answered") {
      const verdict = liveDataVerdict(reply, r.specialistIds.map((id) => id.split(".")[0]));
      if (verdict) {
        if (deps.evidenceFetch) {
          // 19.3.0 — verification by REAL retrieval: fetch what the answer
          // cites, look for the claims inside, and stamp accordingly.
          const { retrieval, supported } = await verifyLiveEvidence(reply, verdict.claims, { fetchImpl: deps.evidenceFetch });
          const retrievedCount = retrieval.filter((x) => x.status === "retrieved").length;
          const hits = retrieval.reduce((n, x) => n + x.claimHits, 0);
          verdict.retrieval = retrieval;
          if (supported) {
            verdict.verified = true;
            verdict.verifiedBy = "retrieval";
            verdict.note = `Time-sensitive claims VERIFIED BY RETRIEVAL — ${retrievedCount}/${retrieval.length} cited source(s) fetched, claim markers found inside (${hits} hit(s)).`;
          } else {
            verdict.verified = false;
            verdict.note = `Time-sensitive claims NOT supported by retrieval — ${retrievedCount}/${retrieval.length} cited source(s) fetched, ${hits} claim hit(s). Flagged as unverified.`;
          }
        } else if (verdict.verified) {
          verdict.verifiedBy = "disclosure";
        }
        liveData = verdict;
        if (!verdict.verified) reply = `${reply}${liveDataBanner(verdict)}`;
      }
    }
    const full = { ...r, workspace: r.workspace ?? workspaceView, office: r.office ?? officeSnap, reply, captain, failure, liveData };
    /* Review hardening — the Generalist never SELF-GRANTS broad authority.
       It signs a RUN ATTESTATION: scope = the tool classes actually executed
       this run, budget = executed action count, depth 0. Nothing executed ⇒
       authority is null — provenance without pretend permission. A-priori
       grants exist only via the owner-gated Agent Reach MCP surface. */
    const executedTools: string[] = [];
    for (const run of full.memberRuns ?? []) {
      for (const tr of run.toolReceipts) {
        if (tr.outcome === "ok") executedTools.push(tr.tool);
      }
    }
    const mandate = await attestMissionRun({ missionId, executedTools }, { identity: userId });
    if (!mandate) return { ...full, authority: null, provenanceDigest: await sha256Hex(responseCanonical({ ...full, authority: null })) };
    const mandateDigest = await sha256Hex(mandateCanonical(mandate));
    const ident = await authorityOwnerIdentity({ identity: userId });
    const authority = { mandateDigest, scheme: "ecdsa-p256" as const, owner: mandate.owner };
    const full2 = { ...full, authority };
    const provenanceDigest = await sha256Hex(responseCanonical(full2));
    await recordMissionAuthority(missionId, provenanceDigest, mandate, mandateDigest, ident.keys.publicKeyPem);
    return { ...full2, provenanceDigest };
  };

  /* 0 — content gate: the GuardRail scans before anything else exists. */
  const findings = detectInjection(text);
  if (findings.length > 0) {
    return finish({
      reply: "I can't take this request into the pipeline: the content gate flagged it.",
      routed: { selected: [], considered: 0, strategy: "none", routedBy: "deterministic" },
      executed: false,
      outcome: "refused",
      specialistIds: [],
      note: `guardrail findings: ${findings.map((f) => f.code).join(", ")}`,
    });
  }

  /* 1 — peer delegation rides the real A2A seam (injected; the production one
         is the a2aBridge). No seam, no delegation — refused in words. */
  if (args.peer) {
    if (!deps.peerDelegate) {
      deps.onHandoff?.({ peer: args.peer, task: text, outcome: "refused", detail: "no A2A bridge is wired into this runtime — nothing was sent" });
      return finish({
        reply: `Peer delegation to "${args.peer}" is not available: no A2A bridge is wired into this runtime.`,
        routed: { selected: [], considered: 0, strategy: "none", routedBy: "deterministic" },
        executed: false,
        outcome: "refused",
        specialistIds: [],
        note: "peer delegation requires the A2A bridge (src/mission/a2aBridge) — nothing was sent",
      });
    }
    const res = await deps.peerDelegate({ peerName: args.peer, task: text });
    deps.onHandoff?.({ peer: args.peer, task: text, outcome: res.ok ? "delegated" : "refused", detail: res.detail, receiptDigest: res.receiptDigest });
    if (args.team) {
      recordTeamRun({
        teamId: args.team.id,
        members: args.team.members,
        task: text.slice(0, 200),
        outcome: res.ok ? "verified" : "refused",
        specialists: [],
        note: res.detail.slice(0, 160),
      });
      void autoProposeIfReady(args.team.id, args.team.members);
    }
    return finish({
      reply: res.ok ? `Delegated to ${args.peer}: ${res.detail}${res.receiptDigest ? ` (peer receipt ${res.receiptDigest.slice(0, 12)}…)` : ""}` : `Delegation to ${args.peer} did not run: ${res.detail}`,
      routed: { selected: [], considered: 0, strategy: "none", routedBy: "deterministic" },
      executed: res.ok,
      outcome: res.ok ? "peer-delegated" : "refused",
      specialistIds: [],
      note: res.ok ? undefined : res.detail,
    });
  }

  /* 2 — route the bench. LLM-assisted only when a provider exists; the
         fallback reason travels with the decision either way. */
  const provider: ProviderConfig | null = deps.provider ?? null;
  let routed: RouteDecision;
  if (provider) {
    routed = await routeWithModel(text, provider, async (cfg, system, user) => {
      const r = await complete(cfg, system, user, { fetchImpl: deps.fetchImpl, timeoutMs: 15_000 });
      return r.ok ? { ok: true, text: r.text } : { ok: false, error: r.error };
    });
  } else {
    routed = routeDeterministic(text);
  }
  /* 11WORKSPACE — Captain (CEO) opens desks autonomously, Consuls own the
     domains, Adepts staff the sub-agent crew, MoE caps the floor at 25. v1 stays imported
     so its probe suite still exercises the module; it is not the live path. */
  let moeReport: MoEReport | null = null;
  let moeV2: CrewSelection | null = null;
  {
    const office: ElevenWorkspace = musterWorkspace(text);
    moeV2 = office.selection;
    officeSnap = officeSnapshot(office);
    const floor = floorAsCrew(office);
    if (floor.length > 0) {
      /* The floor REPLACES the candidate order wholesale, so the final order was
         produced by the workspace muster, not by the re-rank above. `routedBy`
         is documented as "which mechanism produced the final order", and
         responseCanonical() commits to it in the provenance digest — so leaving
         "llm-assisted" here made every receipt attest to an LLM decision that
         never happened. Whatever the re-rank did or failed to do, `fallbackReason`
         still records it honestly; only the attribution of the final order moves. */
      routed = {
        ...routed,
        selected: floor,
        considered: Math.max(routed.considered, office.considered),
        strategy: floor.length === 1 ? "single" : "multi",
        routedBy: "deterministic",
      };
    } else {
      const m = selectCrew(routed, text);
      routed = m.decision;
      moeReport = m.report;
    }
  }
  if (args.team) {
    routed = { ...routed, selected: applyTeamPreference(args.team.id, routed.selected) };
  }
  const specialists = routed.selected.map((c) => getSpecialist(c.id)!).filter(Boolean);

  /* 2b — 19.6.6: regulated activation on the ROUTING path. The registered
     regulated bench stays unrouted until a signed, complete, current
     activation exists; the refusal names every gap, and the unsigned case is
     named exactly: a name is not an authorisation. */
  {
    const reg = await regulatedRoutingVerdict(specialists.map((s) => s.id));
    if (!reg.ok) {
      return finish({
        reply: reg.notice,
        routed,
        executed: false,
        outcome: "refused",
        specialistIds: specialists.map((s) => s.id),
        note: `regulated activation incomplete — gaps: ${reg.gaps.join(", ") || "signature"}`,
      });
    }
  }

  /* 3 — the human gate. Risky/critical output without an approved gate does
         not execute. Autonomy (the 90% exam) downgrades ONLY "safe" work to
         gate-free; the override floor is structural. */
  const worstTier = specialists.some((s) => s.riskTier === "critical")
    ? "critical"
    : specialists.some((s) => s.riskTier === "risky")
      ? "risky"
      : "safe";
  /* The earned-autonomy grant must cover EVERY routed member. It previously
     consulted specialists[0] only, while worstTier spans the whole routing —
     so one passed exam in the first domain opened the human gate for risky
     specialists from unrelated domains in the same run. */
  const autonomyEarned = specialists.length > 0 && specialists.every((s) => autonomyCovers(userId, s.category));
  const needsGate = worstTier !== "safe" && !(autonomyEarned && worstTier === "risky");
  if (needsGate) {
    if (!deps.gate) {
      return finish({
        reply: "This routes to specialists whose work is gated as risky, and no human gate is available in this runtime — so nothing was executed.",
        routed,
        executed: false,
        outcome: "refused",
        specialistIds: specialists.map((s) => s.id),
        note: `risk tier "${worstTier}" requires the human gate; wire one or re-route`,
      });
    }
    const decision = await deps.gate({
      action: `Captain routed "${text.slice(0, 120)}" to ${specialists.map((s) => s.name).join(", ")}`,
      riskTier: worstTier,
      specialistIds: specialists.map((s) => s.id),
      summary: routed.selected.flatMap((c) => c.reasons).slice(0, 4).join("; "),
    });
    if (!decision.approved) {
      return finish({
        reply: `You (or the standing policy) declined this at the gate: ${decision.reason}`,
        routed,
        executed: false,
        outcome: "gated-out",
        specialistIds: specialists.map((s) => s.id),
        note: decision.reason,
      });
    }
  }

  /* 4 — execute for real, or plan honestly. */
  if (!provider) {
    const plan = specialists.length
      ? specialists.map((s) => `${s.name} (${s.id}): ${s.capabilities[0]}`).join("\n")
      : `no specialist cleared the routing bar — the ${TITLES.captain} would handle this directly once a provider is configured`;
    return finish({
      reply:
        `No provider key is configured, so nothing was executed. Here is the plan I would run:\n\n${plan}\n\n` +
        `Routing: ${routed.strategy} via ${routed.routedBy} (${routed.selected.length} of ${routed.considered} specialists considered). ` +
        (moeV2 ? moeV2Line(moeV2) : moeReport ? moeLine(moeReport) : "") +
        (officeSnap ? ` ${officeSnap.line}` : "") +
        (routed.fallbackReason ? ` Note: ${routed.fallbackReason}.` : ""),
      routed,
      executed: false,
      outcome: "planned",
      specialistIds: specialists.map((s) => s.id),
      note: "provider not configured — plan only, nothing executed",
    });
  }

  const gateLine = "You operate behind a human gate; risky actions are paused for approval. Never claim work you did not do.";
  const briefing = memoryBriefing(userId);

  /* The 19.3.0 member execution seam: a workspace-wired member runs the real
     act/observe loop (own provider calls, gated tool executions, receipts);
     a toolless member keeps the exact 19.2.0 single-call semantics. */
  const memberToolCtx = deps.workspaceRoot
    ? { workspaceRoot: deps.workspaceRoot, gate: deps.gate, fetchImpl: deps.fetchImpl, fsImpl: deps.fsImpl }
    : undefined;
  /* 19.5.1 — the computer-use plane is attached to reach-provenance members
     ONLY: the Generalist routes a reach specialist → the mission gets the
     governed pc.* tools (gate + receipts unchanged). Everyone else keeps the
     exact pre-Reach tool surface. */
  const reachPc = { missionId, policy: { allowlist: ["ls", "cat", "echo", "grep"], maxRuntimeMs: 5000, maxOutputBytes: 64 * 1024 } };
  const ctxFor = (s: { provenance?: string }) =>
    memberToolCtx && s.provenance === "si-19.5.1-reach" ? { ...memberToolCtx, pc: reachPc } : memberToolCtx;


  /* 19.2.0 — TRUE multi-member execution; 19.3.0 — with real member agent
     loops and Captain synthesis on top:

       route (up to 25 specialists)
         ↓
       EACH member: own agent loop (own calls, own gated tool receipts) →
                    own result → own member receipt digest
         ↓
       divergence pass (claim atoms, computed not asserted)
         ↓
       Captain's OWN synthesis call → one coherent domain result
         ↓
       reply = synthesis + member evidence sections, never one shared
       answer relabelled N ways, never a synthesis the Captain didn't run */
  if (specialists.length > 1) {
    const memberResults: { specialistId: string; outcome: string; note?: string; memberDigest?: string }[] = [];
    const memberAnswers: { specialistId: string; text: string }[] = [];
    const memberRunViews: MemberRunView[] = [];
    const sections: string[] = [];
    /* Members are independent — no member reads another's output — so they run
       concurrently. This used to be a sequential `for … await`, which meant a
       25-member crew cost up to 25 x MAX_AGENT_STEPS provider round-trips back
       to back. The concurrency is bounded rather than unbounded: providers
       rate-limit, and a fan-out of 25 simultaneous streams is a 429 waiting to
       happen. Result ASSEMBLY stays in routing order, so every digest, the
       member view list and the rendered sections are byte-identical to the
       sequential path — parallelism here is invisible in the receipt. */
    const runs = await mapBounded(specialists, MEMBER_CONCURRENCY, (s) => {
      const systemBase = [buildSpecialistPrompt(s), gateLine, ...briefing].join("\n\n");
      return runMemberAgent({
        provider,
        specialist: s,
        task: text,
        systemBase,
        fetchImpl: deps.fetchImpl,
        toolCtx: ctxFor(s),
        hash: sha256Hex,
      });
    });
    for (let i = 0; i < specialists.length; i++) {
      const s = specialists[i];
      const run = runs[i];
      memberRunViews.push({
        specialistId: s.id,
        providerCalls: run.calls,
        latencyMs: run.latencyMs,
        truncated: run.truncated,
        tools: run.tools,
        toolReceipts: run.toolReceipts.map((t) => ({ tool: t.tool, outcome: t.outcome, inputPreview: t.inputCanonical.slice(0, 300), outputPreview: t.output.slice(0, 200), digest: t.digest })),
      });
      if (run.ok) {
        const digest = await sha256Hex(JSON.stringify({
          v: "engine-member/1", specialistId: s.id, outcome: "answered", model: run.model, text: run.text,
          tools: run.tools, truncated: run.truncated, bew: run.bew,
          toolReceipts: run.toolReceipts.map((t) => ({ tool: t.tool, outcome: t.outcome, digest: t.digest ?? null })),
        }));
        memberResults.push({ specialistId: s.id, outcome: "answered", memberDigest: digest });
        memberAnswers.push({ specialistId: s.id, text: run.text });
        const toolLine = run.toolReceipts.length > 0 ? ` · ${run.toolReceipts.length} tool call(s) receipted` : "";
        const truncLine = run.truncated ? "\n[agent loop reached its step limit — labelled honestly, not dressed as done]" : "";
        sections.push(`── ${s.name} (${s.id}) · answered · ${run.model} · ${run.latencyMs}ms · ${run.calls} provider call(s)${toolLine} · member receipt ${digest.slice(0, 12)}\n[bew ${run.bew.phases.join("→")} · verify ${run.bew.verify} · verdict ${run.bew.verdict}${run.bew.violations.length ? ` · violations: ${run.bew.violations.join("; ")}` : ""}]\n${run.text}${truncLine}`);
      } else {
        const note = `${run.errorKind}: ${run.error} [bew ${run.bew.phases.join("→")} · verdict ${run.bew.verdict}]`;
        const digest = await sha256Hex(JSON.stringify({ v: "engine-member/1", specialistId: s.id, outcome: "error", note, bew: run.bew }));
        memberResults.push({ specialistId: s.id, outcome: "error", note, memberDigest: digest });
        sections.push(`── ${s.name} (${s.id}) · ERROR — this member's own provider call failed\n${note}`);
      }
    }
    const executedCount = memberResults.filter((m) => m.outcome === "answered").length;
    const captain = buildCaptainReport(captainForRoute(memberResults.map((m) => m.specialistId))?.id ?? "", memberResults) ?? undefined;

    /* 19.3.0 — Consul synthesis (the domain layer; the Captain still owns the
       reply): the Consul reasons over the executed members' real answers in its
       OWN provider call. Honest edges: only
       executed answers are synthesized; a failed synthesis call keeps every
       member answer and says so; single-member runs never synthesize. */
    let synthesis: SynthesisRecord | undefined;
    let synthesisFailure = "";
    const synthCaptain = captainForRoute(memberAnswers.map((m) => m.specialistId));
    if (executedCount >= 2 && synthCaptain) {
      const divergences = findDivergences(memberAnswers);
      const synthSystem = buildSynthesisSystem(synthCaptain);
      const synthUser = buildSynthesisUser(
        text,
        memberAnswers.map((m) => ({ name: getSpecialist(m.specialistId)?.name ?? m.specialistId, text: m.text })),
        divergences,
      );
      const optimizedSynth = optimizeComposedPrompt(synthSystem);
      const sres = await complete(provider, optimizedSynth.prompt, synthUser, { fetchImpl: deps.fetchImpl });
      recordUsage({
        promptTokens: optimizedSynth.estimatedTokens + estimateTokens(synthUser),
        replyTokens: estimateTokens(sres.ok ? sres.text : sres.error),
        optimized: optimizedSynth.optimized,
        savedTokens: optimizedSynth.savedTokens,
      });
      if (sres.ok) {
        // Defence in depth: the Captain synthesizes — it never executes tools
        // here, so any stray tool fence in the model output is stripped
        // before the text reaches the user or the digest.
        const synthText = stripToolBlocks(sres.text);
        const digest = await sha256Hex(JSON.stringify({
          v: "engine-synthesis/1", captainId: synthCaptain.id, text: synthText,
          memberDigests: memberResults.filter((m) => m.outcome === "answered").map((m) => m.memberDigest),
          divergences,
        }));
        synthesis = { text: synthText, captainId: synthCaptain.id, captainName: synthCaptain.name, model: sres.model, latencyMs: sres.latencyMs, digest, divergences };
      } else {
        synthesisFailure = `Captain synthesis was attempted and FAILED (${sres.kind}: ${redactSecrets(sres.error, [provider.apiKey])}) — the member answers below stand on their own.`;
      }
    }

    const header = `${captain?.captainName ?? "The domain captain"} coordinated ${memberResults.length} specialists — each section below is that member's OWN provider run${synthesis ? ", and the synthesis above them is the captain's OWN reasoned result" : ""}:`;
    const body = synthesis
      ? `── ${TITLES.consul.toUpperCase()} SYNTHESIS (${synthesis.captainName} · ${synthesis.model} · synthesis receipt ${synthesis.digest?.slice(0, 12)}…) ──\n${synthesis.text}\n\n── MEMBER EVIDENCE (each its own execution) ──\n\n${sections.join("\n\n")}`
      : sections.join("\n\n");
    return finish({
      reply: `${header}\n\n${synthesisFailure ? `${synthesisFailure}\n\n` : ""}${body}`,
      routed,
      executed: executedCount > 0,
      outcome: executedCount > 0 ? "answered" : "error",
      specialistIds: memberResults.map((m) => m.specialistId),
      captain,
      synthesis,
      memberRuns: memberRunViews,
      note: `${executedCount} of ${memberResults.length} routed members executed — each with its own agent loop and member receipt` +
        (synthesis ? ` · ${TITLES.consul.toLowerCase()} synthesis ${synthesis.digest?.slice(0, 12)}… over ${synthesis.divergences.membersCompared} executed member(s)` : synthesisFailure ? " · synthesis attempted, failed honestly" : ""),
    });
  }

  const primary = specialists[0] ?? null;
  /* Single routed member (or none): the member agent loop with its tools
     when a workspace is wired, the plain generalist call when not. */
  if (primary) {
    const systemBase = [buildSpecialistPrompt(primary), gateLine, ...briefing].join("\n\n");
    const run = await runMemberAgent({
      provider,
      specialist: primary,
      task: text,
      systemBase,
      fetchImpl: deps.fetchImpl,
      toolCtx: ctxFor(primary),
      hash: sha256Hex,
    });
    if (!run.ok) {
      return finish({
        reply: `The provider call did not complete (${run.errorKind}): ${run.error}`,
        routed,
        executed: false,
        outcome: "error",
        specialistIds: specialists.map((s) => s.id),
        note: redactSecrets(run.error ?? "", [provider.apiKey]),
      });
    }
    const toolLine = run.toolReceipts.length > 0 ? ` · ${run.toolReceipts.length} tool call(s) receipted` : "";
    return finish({
      reply: run.text + (run.truncated ? "\n\n[agent loop reached its step limit — labelled honestly]" : ""),
      routed,
      executed: true,
      outcome: "answered",
      specialistIds: specialists.map((s) => s.id),
      memberRuns: [{
        specialistId: primary.id,
        providerCalls: run.calls,
        latencyMs: run.latencyMs,
        truncated: run.truncated,
        tools: run.tools,
        toolReceipts: run.toolReceipts.map((t) => ({ tool: t.tool, outcome: t.outcome, inputPreview: t.inputCanonical.slice(0, 300), outputPreview: t.output.slice(0, 200), digest: t.digest })),
      }],
      note: `provider ${provider.kind}/${run.model} · ${run.latencyMs}ms · ${run.calls} provider call(s)${toolLine} · BEW ${run.bew.phases.join("→")} · verify ${run.bew.verify} · verdict ${run.bew.verdict} · accept or reject this answer so I can learn${
        autonomyEarned ? " · running under earned autonomy (override always available)" : ""
      }`,
    });
  }

  const composedSystem = [
    `You are the SelfImpulse ${TITLES.captain} (engine: MJ) — the company's CEO and the only voice the user hears. Answer directly and concisely. Work travels strictly down the chain — ${TITLES.captain} → ${TITLES.consul}s → ${TITLES.adept}s → ${TITLES.crew.toLowerCase()}s — and reports travel up it; no layer ever speaks past its neighbour.`,
    gateLine,
    ...briefing,
  ].join("\n\n");
  const optimized = optimizeComposedPrompt(composedSystem);
  const system = optimized.prompt;

  const result = await complete(provider, system, text, { fetchImpl: deps.fetchImpl });
  recordUsage({
    promptTokens: optimized.estimatedTokens + estimateTokens(text),
    replyTokens: estimateTokens(result.ok ? result.text : result.error),
    optimized: optimized.optimized,
    savedTokens: optimized.savedTokens,
  });
  if (!result.ok) {
    return finish({
      reply: `The provider call did not complete (${result.kind}): ${result.error}`,
      routed,
      executed: false,
      outcome: "error",
      specialistIds: specialists.map((s) => s.id),
      note: redactSecrets(result.error, [provider.apiKey]),
    });
  }

  return finish({
    reply: result.text,
    routed,
    executed: true,
    outcome: "answered",
    specialistIds: specialists.map((s) => s.id),
    note: `provider ${provider.kind}/${result.model} · ${result.latencyMs}ms · accept or reject this answer so I can learn${
      autonomyEarned ? " · running under earned autonomy (override always available)" : ""
    }`,
  });
}

/** Stable id for correlation across the bus/UI. */
export function requestId(): string {
  return uid("engine");
}
