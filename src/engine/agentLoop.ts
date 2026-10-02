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
import { complete, redactSecrets } from "./providers";
import { estimateTokens, optimizeComposedPrompt, recordUsage } from "./tokenOptim";
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
}

export interface MemberRun {
  ok: boolean;
  /** The final answer text, tool fences stripped. */
  text: string;
  /** Present only when the final provider call failed. */
  error?: string;
  errorKind?: "no-key" | "egress-blocked" | "http-error" | "network" | "timeout" | "bad-response";
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
}

/** 19.7.0 — the transient failure kinds the auto-repair rung covers. The
 * repair ladder's floor is unchanged: a repair CHANGES THE SITUATION (the
 * member is told its prior attempt died and must stand alone), it never
 * blind-retries, and it is labelled on the run record. */
const AUTO_REPAIR_KINDS = new Set(["timeout", "network", "bad-response"]);

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
  const toolReceipts: ToolReceipt[] = [];
  let calls = 0;
  let totalLatency = 0;
  let lastModel = provider.model;

  /* RUNTIME BEW — the loop, not the prompt, holds the phase machine. intake
     is the run's opening; plan is the composed task + protocol the member
     received; act is every tool step; verify runs before any final answer
     that would claim done; recover is the auto-repair rung. */
  const bew = new BewRun(specialist.id);
  bew.to("plan");

  for (let step = 0; step < maxSteps; step++) {
    const res = await complete(provider, system, conversation, { fetchImpl: opts.fetchImpl });
    calls += 1;
    recordUsage({
      promptTokens: estimateTokens(system) + estimateTokens(conversation),
      replyTokens: estimateTokens(res.ok ? res.text : res.error),
      optimized: false,
      savedTokens: 0,
    });
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
        const repair = await complete(provider, system, repairTask, { fetchImpl: opts.fetchImpl });
        calls += 1;
        recordUsage({
          promptTokens: estimateTokens(system) + estimateTokens(repairTask),
          replyTokens: estimateTokens(repair.ok ? repair.text : repair.error),
          optimized: false,
          savedTokens: 0,
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
        bew: bew.finish("failed"),
      };
    }
    totalLatency += res.latencyMs;
    lastModel = res.model;

    if (!hasTools || !toolCtx) {
      bew.to("verify");
      return { ok: true, text: res.text, model: lastModel, latencyMs: totalLatency, calls, toolReceipts, truncated: false, tools: [], bew: bew.finish(res.text.trim().length > 0 ? "done" : "partial") };
    }

    const blocks = parseToolBlocks(res.text);
    if (blocks.length === 0) {
      bew.to("verify");
      return { ok: true, text: res.text, model: lastModel, latencyMs: totalLatency, calls, toolReceipts, truncated: false, tools: toolIds, bew: bew.finish(res.text.trim().length > 0 ? "done" : "partial") };
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
        bew: bew.finish("partial"), // truncated ⇒ verify cannot pass ⇒ partial, never done
      };
    }

    // Feed the real results back and continue.
    conversation = `${task}\n\n[turn ${step + 1}] Your previous reply requested tools. Their real results:\n\n${resultLines.join("\n\n")}\n\nContinue the task. If the work is done, answer with NO tool blocks.`;
  }

  // Unreachable — the loop always returns — kept for exhaustiveness.
  return { ok: false, text: "", error: "agent loop ended without a provider result", model: provider.model, latencyMs: totalLatency, calls, toolReceipts, truncated: false, tools: toolIds, bew: bew.finish("failed") };
}
