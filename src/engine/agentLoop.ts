/**
 * SelfImpulse — the member agent loop (19.3.0 "Vanguard").
 *
 * This is the module that stops the bench being prompt personas. A member run
 * is now a real loop:
 *
 *   composed prompt (+ tool protocol when the member carries tools)
 *     → provider call
 *     → reply contains tool blocks? ──no──► final answer
 *     → yes: validate → gate → execute → receipt → feed results back
 *     → repeat until the model answers clean or maxSteps is reached
 *
 * Honesty rules, all probe-pinned (probe/agentTools):
 *   • a tool receipt exists for EVERY attempted call — executed, failed,
 *     gated-out or refused; nothing silent;
 *   • the model is told the gate's real reason when a tool is denied — it
 *     never sees a fabricated result;
 *   • maxSteps is a hard stop: on exhaustion the loop ends with the text so
 *     far, labelled — a truncated loop is reported, never dressed as done;
 *   • each provider call in the loop lands in the token ledger;
 *   • toolless members keep the exact 19.2.0 single-call path — the loop
 *     changes nothing for them.
 */
import { complete, redactSecrets, DEFAULT_TIMEOUT_MS } from "./providers";
import { budgetConversation, CONVERSATION_BUDGET, estimateTokens, optimizeComposedPrompt, PROMPT_BUDGET, recordUsage, type ConversationSegment } from "./tokenOptim";
import { CapLedger, type CostBasis, type MissionCaps } from "../mission/caps";
import { executeToolReceipted, stripToolBlocks, parseToolBlocks, toolProtocolText, toolsForCategory } from "./tools";
import { mcpRuntimeEnabled, mcpProtocolLine } from "./mcpRuntime";
import { BewRun, type BewReceipt } from "./bew";
/** Capability policy (review fix): a mission that attaches the computer-use
    plane ADVERTISES pc.exec + pc.browser to the member's tool protocol —
    explicit mission policy, never global category binding. */
export function memberToolIds(category: string, toolCtx?: { pc?: unknown } | null) {
  const base = toolsForCategory(category);
  const withPc = toolCtx?.pc ? ([...base, "pc.exec", "pc.browser"] as typeof base) : base;
  // 19.7.1 — the MCP runtime: when the owner has ENABLED market servers,
  // every workspace-wired member can reach them through the same governed
  // mcp.call tool (gate + receipt unchanged). No servers ⇒ no surface.
  if (mcpRuntimeEnabled()) return [...withPc, "mcp.call"] as typeof withPc;
  return withPc;
}

import type { ToolContext, ToolReceipt } from "./tools";
import type { ProviderConfig, Specialist } from "./types";

/** 19.7.2 — five steps: the maturity budget. A member can run a real
 * act/observe/adjust arc (look → act → read the result → repair → answer)
 * without hitting the ceiling; the hard stop and its honest truncation
 * label are unchanged. */
export const MAX_AGENT_STEPS = 5;

/** One member run's cap, used when the host threads none of its own.
 *
 * FAIL SAFE, NOT UNBOUNDED. Every caller that reaches this loop today
 * (generalist, crew, groups) builds its own options object and none of them
 * carry mission caps — so until a host threads a ledger, these defaults ARE the
 * only ceiling the live chat path has, and they are deliberately conservative:
 *
 *   • maxTurns is this loop's own maturity budget plus the single auto-repair
 *     rung the repair ladder allows. That makes the turn ceiling a property of
 *     the LOOP rather than of the caller's `maxSteps`: a caller passing
 *     `maxSteps: 500` gets its five real rounds and then a refusal that says
 *     why, instead of quietly purchasing 500 rounds of spend.
 *   • maxWallClockMs is the same number of calls at the provider seam's own
 *     per-call deadline. Nothing else on this path can stop a hung member.
 *   • maxCostUsd is DELIBERATELY ABSENT. A provider result carries no price
 *     (`ProviderResult` has no cost field — see providers.ts), so this loop can
 *     only ever record TOKENS. A USD cap here would compare a permanent 0
 *     against the cap and pass forever: a ceiling that cannot trip, which is
 *     worse than no ceiling because it reads like enforcement. Cost is bounded
 *     in tokens below instead, which is measurable and honest. This is the
 *     caps.ts rule preserved, not weakened — USD-unknown stays unknown and a
 *     guessed price is never invented to make a budget check work.
 */
export const MEMBER_RUN_CAPS: MissionCaps = {
  maxTurns: MAX_AGENT_STEPS + 1,
  maxWallClockMs: (MAX_AGENT_STEPS + 1) * DEFAULT_TIMEOUT_MS,
};

/** Reply allowance per step. The reply is the one side of a provider call that
 *  no budget in this module controls, so the ceiling must leave room for it. */
const REPLY_ALLOWANCE = PROMPT_BUDGET;

/** The per-run token ceiling, used when the host supplies none.
 *
 * Derived from the very constants the loop builds its wire text from, which is
 * what makes it a real bound on the prompt side rather than a decorative one:
 * the most calls this loop can make, each at the worst case it can now build
 * (a system prompt at PROMPT_BUDGET and a conversation at
 * CONVERSATION_BUDGET), plus a reply allowance. A host that wants tighter
 * passes `runTokenCeiling`; a host holding real mission caps passes a ledger
 * and `CapLedger.admissionError` governs instead. */
export const MEMBER_RUN_TOKEN_CEILING =
  (MAX_AGENT_STEPS + 1) * (PROMPT_BUDGET + CONVERSATION_BUDGET + REPLY_ALLOWANCE);

/** What one member run actually cost, in the only terms this loop can measure.
 *
 *  `usd` is null unless something upstream reported a REAL price — which, today,
 *  nothing on this path does. `basis` says which of the two happened, using
 *  caps.ts's own vocabulary, so a tokens-only run is never dressed up as $0.00
 *  and never priced by guessing. */
export interface MemberCostRecord {
  basis: CostBasis;
  /** null when no real price was reported — NOT zero, and never a guess. */
  usd: number | null;
  tokens: number;
  promptTokens: number;
  replyTokens: number;
  /** caps.ts's own sentence for this charge, carried verbatim. */
  reason: string;
  /** why the run stopped before its step limit, when a cap refused it. */
  refused?: string;
  /** true when the context budget could not be met even after eliding. */
  contextFloorLimited?: boolean;
  /** estimated tokens the context budget kept off the wire this run. */
  savedTokens?: number;
}

export interface MemberRunOptions {
  provider: ProviderConfig;
  specialist: Specialist;
  task: string;
  /** The composed system prompt (specialist + gate line + memory), pre-tools. */
  systemBase: string;
  fetchImpl?: typeof fetch;
  /** Tool context — when absent, the member runs toolless (the 19.2.0 path). */
  toolCtx?: Omit<ToolContext, "specialistId" | "hash">;
  /** Digest hasher shared with the pipeline so receipts chain into member digests. */
  hash?: (text: string) => Promise<string>;
  maxSteps?: number;
  /** The host's mission ledger. When present it is consulted BEFORE every
   *  dispatch, exactly as `teamExecutor.ts:1174` does for a team seat. No caller
   *  on the live chat path threads one today — that is a gap in generalist.ts and
   *  crew.ts, which this module does not own — so omitting it is not a silent
   *  "no ceiling": `MEMBER_RUN_CAPS` below takes over. */
  ledger?: CapLedger;
  /** This run's own cumulative prompt+reply token ceiling. 0 disables. */
  runTokenCeiling?: number;
  /** The ceiling for the growing side of the conversation. 0 disables. */
  conversationBudget?: number;
}

export interface MemberRun {
  ok: boolean;
  /** The final answer text, tool fences stripped. */
  text: string;
  /** Present only when the final provider call failed. */
  error?: string;
  errorKind?: "no-key" | "egress-blocked" | "http-error" | "network" | "timeout" | "bad-response" | "budget";
  model: string;
  latencyMs: number;
  /** Number of provider calls the loop made. */
  calls: number;
  /** Every attempted tool call, in order — executed or not. */
  toolReceipts: ToolReceipt[];
  /** True when the loop hit maxSteps with tool blocks still pending. */
  truncated: boolean;
  /** The tool ids this member carried ([] = toolless run). */
  tools: string[];
  /** 19.7.0 — the loop auto-repaired a transient failure by changing the
   * member's situation (one retry, no human ask, labelled either way). */
  repaired?: boolean;
  repairNote?: string;
  /** 19.7.2.1 [Agent] review fix — the RUNTIME BEW receipt: the phase trail
   * this loop actually executed, verify's real outcome, recoveries used and
   * any violations, with the verdict AFTER enforcement (a run that cannot
   * prove VERIFY cannot claim done). */
  bew: BewReceipt;
  /** What this run cost, in the only terms measurable here: tokens, with USD
   * left null when no real price was reported. Never a guessed price. */
  cost?: MemberCostRecord;
}

/** 19.7.0 — the transient failure kinds the auto-repair rung covers. The
 * repair ladder's floor is unchanged: a repair CHANGES THE SITUATION (the
 * member is told its prior attempt died and must stand alone), it never
 * blind-retries, and it is labelled on the run record. */
const AUTO_REPAIR_KINDS = new Set(["timeout", "network", "bad-response"]);

/** The instruction that closes every tool turn. Held as a constant so the
 *  budgeted conversation ends with exactly the words the raw interpolation
 *  used — the tail is never cut, so this line always reaches the model. */
const CONTINUE_INSTRUCTION = "Continue the task. If the work is done, answer with NO tool blocks.";

/**
 * Run one specialist as a real agent. The caller owns routing, gating of the
 * member's OUTPUT risk tier, and receipt digesting — this module owns the
 * loop itself and the tool-level governance inside it.
 */
export async function runMemberAgent(opts: MemberRunOptions): Promise<MemberRun> {
  const { provider, specialist, task, systemBase } = opts;
  const maxSteps = opts.maxSteps ?? MAX_AGENT_STEPS;
  const toolIds = memberToolIds(specialist.category, opts.toolCtx);
  const hasTools = toolIds.length > 0 && Boolean(opts.toolCtx);

  const mcpLine = hasTools ? mcpProtocolLine() : null;
  const system = hasTools
    ? optimizeComposedPrompt(`${systemBase}\n\n${toolProtocolText(toolIds)}${mcpLine ? `\n\n${mcpLine}` : ""}`).prompt
    : optimizeComposedPrompt(systemBase).prompt;

  const toolCtx: ToolContext | null = hasTools
    ? { ...opts.toolCtx!, specialistId: specialist.id, hash: opts.hash }
    : null;

  let conversation = task;
  /* The turns whose tool results have already been fed back, oldest first.
     `budgetConversation` spends its budget newest-first, so this is the order
     that lets it protect the result the member has to act on next. */
  const previousTurns: ConversationSegment[] = [];
  const toolReceipts: ToolReceipt[] = [];
  let calls = 0;
  let totalLatency = 0;
  let lastModel = provider.model;

  /* 20.x — THE SPEND BOUND, established once, checked before every dispatch.
     A ledger the host threads wins; otherwise this run gets its own, capped by
     MEMBER_RUN_CAPS. Either way the check happens BEFORE the call, which is the
     whole point: refusing beforehand is control, charging afterwards is
     bookkeeping. `beginInvocation` is called here so the invocation cap counts
     this run even when nothing has been charged yet. */
  const ledger = opts.ledger ?? new CapLedger(MEMBER_RUN_CAPS);
  ledger.beginInvocation();
  const tokenCeiling = opts.runTokenCeiling ?? MEMBER_RUN_TOKEN_CEILING;
  const conversationBudget = opts.conversationBudget ?? CONVERSATION_BUDGET;
  let runPromptTokens = 0;
  let runReplyTokens = 0;
  let savedTokens = 0;
  /** Context saving earned by the previous step, carried onto the next call's
   *  ledger entry — the call that actually sends the reduced text. */
  let pendingSaved = 0;
  let contextFloorLimited = false;

  /** The honest cost record so far. USD stays null until a real price exists. */
  const costRecord = (refused?: string): MemberCostRecord => ({
    basis: "tokens_only",
    usd: null,
    tokens: runPromptTokens + runReplyTokens,
    promptTokens: runPromptTokens,
    replyTokens: runReplyTokens,
    reason: "This path reports tokens and no price, so nothing was converted to dollars: a guessed price would be a fabricated cost.",
    ...(refused ? { refused } : {}),
    contextFloorLimited,
    savedTokens,
  });

  /** Pre-dispatch admission for the call about to be made. Returns null when it
   *  may proceed, or the real reason it may not.
   *
   *  It judges the PROJECTED cost, not the cost already spent. Comparing only
   *  the spent total would let the FIRST call of a run through whatever its
   *  size — which is exactly the unbounded case this gate exists to close, since
   *  one reply can carry an unbounded number of tool results. */
  const admit = (user: string): string | null => {
    const blocked = ledger.admissionError(Date.now());
    if (blocked) return blocked;
    if (tokenCeiling > 0) {
      const spent = runPromptTokens + runReplyTokens;
      const projected = spent + estimateTokens(system) + estimateTokens(user);
      if (projected > tokenCeiling) {
        return `dispatching this call would take the run to ${projected} estimated tokens (${spent} already spent), past its ${tokenCeiling}-token ceiling; it was refused before dispatch`;
      }
    }
    return null;
  };

  /** Charge what the call ACTUALLY cost, in the only terms we can measure. */
  const settle = (promptTokens: number, replyTokens: number): void => {
    runPromptTokens += promptTokens;
    runReplyTokens += replyTokens;
    /* costUsd is null, always, because a provider result carries no price.
       charge() therefore records tokens and returns basis "tokens_only" —
       the honest path. Passing a number here would invent a dollar figure the
       provider never reported, which is exactly the fabrication caps.ts
       exists to prevent. */
    ledger.charge({ costUsd: null, tokens: promptTokens + replyTokens, turns: 1, source: "member-agent-loop" });
    ledger.addTurns(1);
  };

  /* RUNTIME BEW — the loop, not the prompt, holds the phase machine. intake
     is the run's opening; plan is the composed task + protocol the member
     received; act is every tool step; verify runs before any final answer
     that would claim done; recover is the auto-repair rung. */
  const bew = new BewRun(specialist.id);
  bew.to("plan");

  for (let step = 0; step < maxSteps; step++) {
    /* 20.x — ADMISSION BEFORE DISPATCH. Charging afterwards is bookkeeping;
       refusing beforehand is control. The cost of this call is known well
       enough to judge before it is made, so it is judged before it is made. */
    const blocked = admit(conversation);
    if (blocked) {
      ledger.recordCapped(specialist.id, "cost_cap", blocked);
      bew.to("verify"); // the run's own acceptance check fails: work was pending
      return {
        ok: false,
        text: "",
        error: blocked,
        errorKind: "budget",
        model: provider.model,
        latencyMs: totalLatency,
        calls,
        toolReceipts,
        truncated: false,
        tools: toolIds,
        cost: costRecord(blocked),
        bew: bew.finish("failed"), // a refused run did not finish its work
      };
    }

    const res = await complete(provider, system, conversation, { fetchImpl: opts.fetchImpl });
    calls += 1;
    const stepPrompt = estimateTokens(system) + estimateTokens(conversation);
    const stepReply = estimateTokens(res.ok ? res.text : res.error);
    settle(stepPrompt, stepReply);
    recordUsage({
      promptTokens: stepPrompt,
      replyTokens: stepReply,
      optimized: pendingSaved > 0,
      savedTokens: pendingSaved,
    });
    pendingSaved = 0;
    if (!res.ok) {
      /* 19.7.0 — the autonomy upgrade: a TRANSIENT failure (timeout /
         network / no-usable-text) gets ONE automatic situation-changing
         retry, without pausing for a human. Safe-tier work never gated
         anyway, and the repair is labelled on the run either way. A
         non-transient failure (no key, egress block, HTTP error) is not
         repaired — retrying those blind is exactly the anti-pattern the
         repair ladder forbids. */
      if (AUTO_REPAIR_KINDS.has(res.kind) && !conversation.includes("[repair turn]")) {
        const repairTask = `${task}\n\n[repair turn] Your previous attempt died mid-run (${res.kind}: ${redactSecrets(res.error, [provider.apiKey]).slice(0, 140)}). Answer the ORIGINAL task standalone now — rely on nothing from the failed attempt.`;
        /* The repair is a real dispatch and costs real money, so it rides the
           same admission check. A ceiling that exempted the retry would be
           spent exactly when the run is already in trouble. */
        const repairBlocked = admit(repairTask);
        if (repairBlocked) {
          ledger.recordCapped(specialist.id, "cost_cap", `the auto-repair rung was refused before dispatch: ${repairBlocked}`);
          return {
            ok: false,
            text: "",
            error: `attempt 1 failed with ${res.kind}, and the auto-repair was never dispatched: ${repairBlocked}`,
            errorKind: "budget",
            model: provider.model,
            latencyMs: totalLatency,
            calls,
            toolReceipts,
            truncated: false,
            tools: toolIds,
            cost: costRecord(repairBlocked),
            bew: bew.finish("failed"),
          };
        }
        const repair = await complete(provider, system, repairTask, { fetchImpl: opts.fetchImpl });
        calls += 1;
        settle(
          estimateTokens(system) + estimateTokens(repairTask),
          estimateTokens(repair.ok ? repair.text : repair.error),
        );
        recordUsage({
          promptTokens: estimateTokens(system) + estimateTokens(repairTask),
          replyTokens: estimateTokens(repair.ok ? repair.text : repair.error),
          optimized: pendingSaved > 0,
          savedTokens: pendingSaved,
        });
        if (repair.ok) {
          totalLatency += repair.latencyMs;
          bew.to("recover");
          bew.to("verify");
          return {
            ok: true,
            text: repair.text,
            model: repair.model || provider.model,
            latencyMs: totalLatency,
            calls,
            toolReceipts,
            truncated: false,
            tools: toolIds,
            repaired: true,
            repairNote: `attempt 1 failed with ${res.kind}; the loop auto-repaired by restating the task standalone — no human pause was needed or made`,
            cost: costRecord(),
            bew: bew.finish(repair.text.trim().length > 0 ? "done" : "partial"),
          };
        }
        bew.to("recover");
        return {
          ok: false,
          text: "",
          error: redactSecrets(repair.error ?? res.error, [provider.apiKey]),
          errorKind: repair.kind ?? res.kind,
          model: provider.model,
          latencyMs: totalLatency,
          calls,
          toolReceipts,
          truncated: false,
          tools: toolIds,
          repaired: true,
          repairNote: `attempt 1 failed with ${res.kind}; the auto-repair also failed with ${repair.kind ?? "unknown"} — reported honestly`,
          cost: costRecord(),
          bew: bew.finish("failed"),
        };
      }
      return {
        ok: false,
        text: "",
        error: redactSecrets(res.error, [provider.apiKey]),
        errorKind: res.kind,
        model: provider.model,
        latencyMs: totalLatency,
        calls,
        toolReceipts,
        truncated: false,
        tools: toolIds,
        cost: costRecord(),
        bew: bew.finish("failed"),
      };
    }
    totalLatency += res.latencyMs;
    lastModel = res.model;

    if (!hasTools || !toolCtx) {
      bew.to("verify");
      return { ok: true, text: res.text, model: lastModel, latencyMs: totalLatency, calls, toolReceipts, truncated: false, tools: [], cost: costRecord(), bew: bew.finish(res.text.trim().length > 0 ? "done" : "partial") };
    }

    const blocks = parseToolBlocks(res.text);
    if (blocks.length === 0) {
      bew.to("verify");
      return { ok: true, text: res.text, model: lastModel, latencyMs: totalLatency, calls, toolReceipts, truncated: false, tools: toolIds, cost: costRecord(), bew: bew.finish(res.text.trim().length > 0 ? "done" : "partial") };
    }
    bew.to("act");

    // Execute every requested call, in order, each through its own receipt.
    const resultLines: string[] = [];
    for (const block of blocks) {
      if ("parseError" in block) {
        const receipt: ToolReceipt = {
          tool: "(parse-error)", // not an executed tool — the outcome field carries the truth
          inputCanonical: JSON.stringify({ parseError: block.parseError }),
          outcome: "error",
          output: block.parseError,
          latencyMs: 0,
        };
        if (opts.hash) {
          receipt.digest = await opts.hash(JSON.stringify({ v: "engine-tool/1", tool: "(parse-error)", inputCanonical: receipt.inputCanonical, outcome: "error", output: receipt.output }));
        }
        toolReceipts.push(receipt);
        resultLines.push(`RESULT(parse-error): ${block.parseError}`);
        continue;
      }
      const receipt = await executeToolReceipted(block.tool, block.input, toolCtx);
      toolReceipts.push(receipt);
      resultLines.push(`RESULT(${receipt.tool}, ${receipt.outcome}${receipt.digest ? `, receipt ${receipt.digest.slice(0, 12)}` : ""}):\n${receipt.output}`);
    }

    // The loop exhausted with work still requested — stop HONESTLY.
    if (step === maxSteps - 1) {
      const soFar = stripToolBlocks(res.text);
      bew.to("verify"); // fails the run's own acceptance check: work was still pending
      return {
        ok: true,
        text: soFar.length > 0 ? soFar : "(the agent loop ended at its step limit while requesting further tool calls)",
        model: lastModel,
        latencyMs: totalLatency,
        calls,
        toolReceipts,
        truncated: true,
        tools: toolIds,
        cost: costRecord(),
        bew: bew.finish("partial"), // truncated ⇒ verify cannot pass ⇒ partial, never done
      };
    }

    /* 20.x — Feed the real results back, under a budget.
     *
     * This line used to be a raw string interpolation of every result into the
     * next call's prompt, so one member call's cost was decided by how many
     * tool blocks the model happened to emit (parseToolBlocks has no cap, each
     * receipt carries up to 2000 chars) and nothing bounded it. `budgetConversation`
     * now caps the growing side, keeps the newest results in full, and marks
     * every elision in the prompt text itself — so a result the model cannot
     * see is visibly missing rather than silently absent, which would read as a
     * tool that returned nothing.
     *
     * `previousTurns` holds the turns already spent. The loop only ever fed the
     * LATEST turn's results back, so this array stays bounded by maxSteps and
     * the per-call size is capped by conversationBudget, not by history. */
    previousTurns.push({ label: `turn ${step + 1}`, text: resultLines.join("\n\n") });
    const budgeted = budgetConversation(task, previousTurns, CONTINUE_INSTRUCTION, conversationBudget);
    conversation = budgeted.text;
    savedTokens += budgeted.savedTokens;
    contextFloorLimited = contextFloorLimited || budgeted.floorLimited;
    /* The saving is attributed to the NEXT call's ledger entry — that is the
       call that actually sends the reduced text. It is never a separate entry:
       the ledger's `calls` counter is the number of provider calls, and
       inflating it with a non-call would make the token books disagree with the
       wire (probe/captains pins that count). */
    pendingSaved += budgeted.savedTokens;
  }

  // Unreachable — the loop always returns — kept for exhaustiveness.
  return { ok: false, text: "", error: "agent loop ended without a provider result", model: provider.model, latencyMs: totalLatency, calls, toolReceipts, truncated: false, tools: toolIds, cost: costRecord(), bew: bew.finish("failed") };
}
