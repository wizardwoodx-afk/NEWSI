/**
 * In-process Hermes-class runtime for every agent node.
 *
 * Vendored Hermes Agent (Nous) is the model: session, skills, memory, tools, bounded loop.
 * We do not copy 200 Python files into 200 nodes. We instantiate ONE runtime per node
 * with that node's identity (role pack) and permission-gated tools.
 *
 * Engines:
 *   hermes → this loop, with a provider or a local Ollama as the model
 *   llm    → the direct provider seam, with no agent loop of its own
 *
 * There is no third option and no extension point: no binary is spawned, no
 * external peer is bridged, nothing user-registered is executed. `domain/harness.ts`
 * offers exactly these two engines and nothing else can be named.
 */
import { composeNodePrompt } from "../domain/composer";
import {
  addNode, governStep, startSession,
  type AuthorityEnvelope,
} from "../security/actionGraph";
import { envelopeFromMandate, sovereign } from "../security/sovereign";
import { DEFAULT_POLICY, evaluate as evaluatePolicy, resolveRole } from "../security/policy";
import { buildDecisionReceipt, evidencePackDigest } from "../security/decisionReceipt";
import { NO_EVIDENCE, NO_GRANT } from "../security/authority";
import type { NodeInstance } from "../domain/types";
import { ipc, nodeKeyOf } from "../ipc/client";
import { harnessOf } from "./harnessRunner";

export interface HermesRun {
  text: string;
  via: string;
  steps: number;
  toolsUsed: string[];
}

const TOOL_RE = /```tool\s*([\s\S]*?)```/i;

function toolCatalog(node: NodeInstance): string {
  const p = node.permissions;
  const lines = [
    "You are a Hermes-class agent. You may call tools by emitting a fenced block:",
    "```tool",
    '{"name":"finish","args":{"output":"final deliverable"}}',
    "```",
    "Available tools:",
    '- finish {output}  — end the loop with the deliverable',
    '- remember {content, kind?} — write memory (no secrets)',
  ];
  if (p.skillWrite) lines.push('- skill_write {name, procedure} — persist a SKILL.md-shaped procedure');
  if (p.filesystemRead) lines.push('- fs_read {path}  - fs_list {path}');
  if (p.filesystemWrite) lines.push('- fs_write {path, content}');
  if (p.terminalExecute) lines.push('- shell {program, args, cwd?}');
  if (p.mcpUse) lines.push('- mcp {serverId, tool, arguments}');
  if (p.browserControl) {
    lines.push('- browser_navigate {url}  — load a page (fails closed if no browser can be started)');
    lines.push('- browser_act {action, selector?, value?, key?, url?}  — act on the live page');
    lines.push('    actions: click | type | fill | select | hover | check | uncheck | clear | press | wait | scroll | keyboard | evaluate | extract | html | title | back | forward | reload');
    lines.push('    extract {selector} returns visible text; evaluate {value} runs JS and returns its result.');
  }
  lines.push("Do not pretend a tool succeeded. If a tool errors, change approach or finish with the failure.");
  return lines.join("\n");
}

async function execTool(node: NodeInstance, name: string, args: Record<string, unknown>, nodeKey: string): Promise<string> {
  const p = node.permissions;
  switch (name) {
    case "finish":
      return String(args.output ?? "");
    case "remember": {
      if (!p.memoryWrite && !node.memoryEnabled) return "memory disabled";
      await ipc.memoryAdd(nodeKey, String(args.kind ?? "working"), String(args.content ?? ""), ["hermes"], 0.6);
      return "remembered";
    }
    case "skill_write": {
      if (!p.skillWrite) return "skillWrite not granted";
      await ipc.skillUpsert({
        nodeKey,
        name: String(args.name ?? "skill"),
        description: String(args.description ?? args.name ?? "skill"),
        procedure: String(args.procedure ?? ""),
        origin: "learned",
      });
      return "skill saved";
    }
    case "fs_read": {
      if (!p.filesystemRead) return "filesystemRead not granted";
      return ipc.fsRead(String(args.path ?? ""));
    }
    case "fs_list": {
      if (!p.filesystemRead) return "filesystemRead not granted";
      return JSON.stringify(await ipc.fsList(String(args.path ?? ".")), null, 2);
    }
    case "fs_write": {
      if (!p.filesystemWrite) return "filesystemWrite not granted";
      await ipc.fsWrite(String(args.path ?? ""), String(args.content ?? ""));
      return "written";
    }
    case "shell": {
      if (!p.terminalExecute) return "terminalExecute not granted";
      const r = await ipc.shellExec(String(args.program ?? ""), (args.args as string[]) ?? [], args.cwd as string | undefined, 60);
      return JSON.stringify(r);
    }
    case "mcp": {
      if (!p.mcpUse) return "mcpUse not granted";
      const r = await ipc.mcpCall(String(args.serverId ?? ""), String(args.tool ?? ""), args.arguments ?? {});
      return JSON.stringify(r);
    }
    case "browser_navigate": {
      if (!p.browserControl) return "browserControl not granted";
      // Keyed on the node, so the whole loop drives ONE tab: repeated navigations keep history,
      // cookies and scroll position, instead of opening (and leaking) a context per call.
      const sess = await ipc.browserSessionCreate(nodeKey) as { sessionId?: string | null; notAttached?: boolean };
      // V7 fix (bug V): this used to serialise whatever came back, and the Rust side fabricated a
      // page title, so the model was handed a description of a page nobody had loaded. Fail closed.
      if (!sess.sessionId) return `browser_navigate failed: ${String((sess as { reason?: string }).reason ?? "no browser session")}`;
      const r = await ipc.browserNavigate(String(sess.sessionId), String(args.url ?? "")) as { ok?: boolean; notAttached?: boolean; reason?: string };
      if (r.ok === false || r.notAttached) return `browser_navigate failed: nothing was fetched. ${String(r.reason ?? "")}`.trim();
      return JSON.stringify(r);
    }
    case "browser_act": {
      if (!p.browserControl) return "browserControl not granted";
      const action = String(args.action ?? "").trim();
      if (!action) {
        return "browser_act needs an `action` (click, type, fill, select, extract, evaluate, wait, scroll, keyboard, back, forward, reload, html, title).";
      }
      const sess = await ipc.browserSessionCreate(nodeKey) as { sessionId?: string | null };
      if (!sess.sessionId) {
        return `browser_act failed: ${String((sess as { reason?: string }).reason ?? "no browser session")}`;
      }
      const r = await ipc.browserAct({ ...args, sessionId: String(sess.sessionId) }) as { ok?: boolean; reason?: string };
      if (r.ok === false) return `browser_act ${action} failed: ${String(r.reason ?? "")}`.trim();
      return JSON.stringify(r);
    }
    default:
      return `unknown tool: ${name}`;
  }
}

function parseTool(text: string): { name: string; args: Record<string, unknown> } | null {
  const m = text.match(TOOL_RE);
  if (!m) return null;
  try {
    const j = JSON.parse(m[1]) as { name?: string; args?: Record<string, unknown> };
    if (!j.name) return null;
    return { name: j.name, args: j.args ?? {} };
  } catch {
    return null;
  }
}

/** The authority envelope a node runs under, derived from its own config.
 *
 *  Absent fields default to the CONSERVATIVE value, not the permissive one: a
 *  node that says nothing about the network does not get the network. The
 *  envelope is read fresh on every run, which is what makes attenuation between
 *  runs observable (see detectDrift). */
/** The authority a node runs under — THE SOVEREIGN PATH.
 *
 *  v1.1.0 read this straight from `node.config`, which said "a seat's
 *  configuration is its authority." That is no longer true. The config is a
 *  REQUESTED profile; `sovereign.mandateFor` signs it into a mandate bound
 *  to its digest, and only the VERIFIED mandate produces the envelope the
 *  loop runs under. A seat whose mandate cannot be issued or verified gets
 *  nothing — the caller refuses the run instead of guessing an envelope. */
function authorityFor(node: NodeInstance): { env: AuthorityEnvelope; mandateIssued: boolean; signerId: string } {
  const claim = sovereign.mandateFor(node);
  if (!claim.ok) {
    throw new Error(
      `${node.title} has no owner mandate (${claim.reason}: ${claim.detail}). Config alone issues no authority — nothing was executed.`,
    );
  }
  // The render verifies too, so a mandate that somehow stopped verifying between
  // issuance and use fails here instead of handing the governed loop an envelope.
  const env = envelopeFromMandate(claim.mandate, sovereign.currentRootSigner());
  if (!env) {
    throw new Error(
      `${node.title}'s mandate does not verify against the root key ${claim.signerId} — nothing was executed.`,
    );
  }
  return { env, mandateIssued: claim.issued, signerId: claim.signerId };
}

/** The most recent node of a kind, so a new edge attaches to what just happened
 *  rather than always to the root. This is what turns a log into a chain. */
function parentOf(session: { graph: { nodes: Record<string, { id: string; kind: string }> } }): string[] {
  const nodes = Object.values(session.graph.nodes);
  for (let i = nodes.length - 1; i >= 0; i -= 1) {
    if (nodes[i].kind === "authorization" || nodes[i].kind === "outcome") return [nodes[i].id];
  }
  return [session.graph.nodes[Object.keys(session.graph.nodes)[0]]?.id].filter(Boolean) as string[];
}

export async function runHermesNode(
  node: NodeInstance,
  _collected: Record<string, unknown>,
  composed: ReturnType<typeof composeNodePrompt>,
  execId: string,
  workflowId: string,
): Promise<HermesRun> {
  /* 19.7.4 [Crew] — CLI execution is retired. Every node runs the native
     agent loop on the owner's own provider keys: one runtime, one receipt
     format, no third-party binary in the trust chain. A saved graph whose
     config still names a retired CLI resolves to the native runtime via
     harnessOf (label only), and nothing spawns — ever. */
  const hid = harnessOf(node);
  const teamKey = String(node.config.teamMemoryKey ?? "");
  const nodeKey = teamKey || nodeKeyOf(workflowId, node.id);

  const toolsUsed: string[] = [];
  const transcript: Array<{ role: string; content: string }> = [
    { role: "user", content: `${composed.user}\n\n${toolCatalog(node)}` },
  ];
  let finalText = "";
  const maxSteps = Math.max(1, Number(node.config.maxToolSteps ?? 8));

  /* 19.7.15 — the runtime is now GOVERNED, not merely looping.
   *
   * Before this the loop's only limits were a step count and whatever the tool
   * itself did. Authority was decided once, at the door, and never re-checked:
   * a step seven could do something step zero would have been refused for, and
   * nothing noticed. The research this comes from (AGENTSAFE's action provenance
   * graph and continuous runtime authorization, AIR's guardrails attached before
   * and after each tool call, 3PM's decision journaling) all describe the same
   * fix from three directions.
   *
   * So the loop now runs every tool call through the governance session: an
   * authority check, a guard before, a graph edge, the call, a guard after, and a
   * journal entry. A trip STOPS the run and says why — it does not warn and
   * continue, because a run that has been shown to want something outside its
   * envelope is not a run worth finishing. */
  const authority = authorityFor(node);
  const env = authority.env;
  /* THE LIVE SOURCE. Every governed step re-reads the seat's authority from
   * the sovereign: the mandate is re-verified and its profile digest is
   * re-measured against the seat's configuration AS IT IS NOW. Config drift,
   * expiry or tampering read as null, and the loop fail-closes mid-run
   * instead of finishing under authority it no longer holds. */
  const session = startSession(env, `${composed.user}\n\n${toolCatalog(node)}`, {
    source: () => sovereign.read(node),
  });
  session.journal.append({
    stage: "authorize",
    decision: authority.mandateIssued
      ? `owner mandate issued over the seat's requested profile (key ${authority.signerId})`
      : `owner mandate re-verified (key ${authority.signerId})`,
    outcome: "allowed",
    evidence: { signerId: authority.signerId, mandateIssued: authority.mandateIssued, maxRisk: env.maxRisk },
  });
  const seq = { n: 1 }; // 0 is the prompt node
  const repeatCounts = new Map<string, number>();
  let failureStreak = 0;
  let stoppedByGovernance: string | null = null;

  for (let step = 0; step < maxSteps; step++) {
    const provider = await resolveLlm(node);
    if (!provider) {
      throw new Error(
        `${node.title} is a Hermes-class agent — connect a provider key in the Providers door (or run Ollama locally); nothing was executed.`,
      );
    }
    const r = await ipc.llmChat({
      provider: provider.provider,
      base_url: provider.base_url,
      model: provider.model,
      messages: transcript,
      system: composed.system,
      max_tokens: 1800,
      temperature: 0.2,
      secret_ref: provider.secret_ref,
    }) as { content?: string };
    const content = String(r.content ?? "").trim();
    if (!content) throw new Error("Hermes loop: empty model content");
    transcript.push({ role: "assistant", content });
    const call = parseTool(content);
    if (!call || call.name === "finish") {
      finalText = call?.name === "finish" ? String(call.args.output ?? content) : content;
      break;
    }
    /* Continuous authorization: judged NOW, against the live envelope, before
     * the call is made — not at mission start. */
    const repeats = (repeatCounts.get(call.name) ?? 0) + 1;
    repeatCounts.set(call.name, repeats);
    /* The declarative policy runs FIRST and can refuse on its own terms. It is
     * separate from the authority envelope on purpose: authority says WHAT this
     * seat may do, policy says WHICH combinations of action and role this
     * deployment permits. A policy denial is named with the rule that produced
     * it, so an operator learns the rule's name rather than "denied". */
    const verdict0 = evaluatePolicy(DEFAULT_POLICY, {
      action: call.name, principal: nodeKey, role: resolveRole(node.config.role),
    });
    if (verdict0.effect === "deny") {
      const why = `${verdict0.reason}${verdict0.rule ? ` (rule: ${verdict0.rule})` : ""}`;
      /* A REFUSAL is the decision worth keeping. Every allow is implied by the
       * run continuing; a refusal is a point where this product could have been
       * wrong, so it gets a signed receipt bound to the journal state it was
       * made against — not just a log line that anyone can edit. Signing is
       * deliberately not done for allows: one Ed25519 signature per tool call
       * would be a real cost for a record nobody reads, and the journal chain
       * already covers the happy path. */
      const journalHead = session.journal.all();
      const evidenceDigest = await evidencePackDigest({
        journal: journalHead.length,
        head: journalHead.length > 0 ? journalHead[journalHead.length - 1].digest : "genesis",
        policy: DEFAULT_POLICY.name,
        graph: session.graph.nodes?.length ?? 0,
      });
      const receipt = await buildDecisionReceipt({
        decisionId: `d-${nodeKey}-${seq}-${call.name}`,
        principal: nodeKey,
        action: call.name,
        role: resolveRole(node.config.role),
        effect: "deny",
        rule: verdict0.rule ?? null,
        reason: verdict0.reason,
        grant: NO_GRANT,
        evidence: NO_EVIDENCE,
        evidenceDigest,
        issuedAt: new Date().toISOString(),
      });
      session.journal.append({
        stage: "authorize", decision: `policy refused "${call.name}": ${why}`,
        outcome: "refused", evidence: {
          tool: call.name, rule: verdict0.rule ?? "(unnamed)", policy: DEFAULT_POLICY.name,
          decisionDigest: receipt.digest, evidenceDigest, signed: receipt.signature !== null,
        },
      });
      stoppedByGovernance = `policy refusal — ${why}`;
      break;
    }

    const pre = governStep(session, seq, { action: call.name, repeatCount: repeats });
    addNode(session.graph, seq, "tool-call", { name: call.name, args: call.args, step },
      parentOf(session), { name: call.name, step });
    if (!pre.proceed) {
      stoppedByGovernance = pre.tripped.map((t) => `${t.rule}: ${t.detail}`).join("; ");
      addNode(session.graph, seq, "outcome", { name: call.name, result: "refused" }, parentOf(session));
      finalText = `STOPPED BY GOVERNANCE — the run wanted to call "${call.name}", which its authority does not cover. ${stoppedByGovernance}`;
      break;
    }

    toolsUsed.push(call.name);
    let result: string;
    let failed = false;
    try {
      result = await execTool(node, call.name, call.args, nodeKey);
      failed = /^tool error/i.test(result);
    } catch (e) {
      result = `tool error: ${e instanceof Error ? e.message : String(e)}`;
      failed = true;
    }
    failureStreak = failed ? failureStreak + 1 : 0;

    /* AIR's AFTER guard: the RESULT is judged too, because a call that was
     * authorized can still return something that warrants stopping. */
    const post = governStep(session, seq, {
      action: call.name, repeatCount: repeats, stdout: result, failed, failureStreak,
    });
    addNode(session.graph, seq, "outcome", { name: call.name, result: result.slice(0, 4000) },
      parentOf(session), { name: call.name, failed });
    if (!post.proceed) {
      stoppedByGovernance = post.tripped.map((t) => `${t.rule}: ${t.detail}`).join("; ");
      finalText = `STOPPED BY GOVERNANCE — after calling "${call.name}": ${stoppedByGovernance}`;
      break;
    }
    session.journal.append({
      stage: "execute",
      decision: `called "${call.name}" under the approved envelope`,
      outcome: failed ? "failed" : "completed",
      evidence: { tool: call.name, step, repeats, failed },
    });
    if (call.name === "finish") {
      finalText = result || content;
      break;
    }
    transcript.push({ role: "user", content: `TOOL RESULT (${call.name}):\n${result.slice(0, 8000)}` });
    finalText = content;
  }

  if (!finalText.trim()) throw new Error("Hermes loop ended with empty deliverable.");
  await ipc.eventEmit(execId, "HERMES_LOOP", "INFO", node.id, { steps: transcript.length, toolsUsed });
  return { text: finalText, via: `hermes:${hid}`, steps: Math.floor(transcript.length / 2), toolsUsed };
}

async function resolveLlm(node: NodeInstance): Promise<{
  provider: string; model: string; secret_ref: string; base_url?: string;
} | null> {
  const p = node.providers[0];
  const kind = p?.kind && p.kind !== "builtin-agent" ? p.kind : "openai";
  const model = p?.model ?? (kind === "anthropic" ? "claude-sonnet-4" : kind === "ollama" ? "llama3.1" : "gpt-4.1");
  const secret_ref = p?.secretRef ?? `provider.${kind === "ollama" ? "ollama.local" : `${kind}.production`}`;
  if (kind === "ollama") {
    return { provider: "ollama", model, secret_ref, base_url: String(node.config.endpoint ?? "http://127.0.0.1:11434") };
  }
  const exists = await ipc.secretExists([secret_ref]);
  if (!exists[secret_ref]) {
    const ollama = await ipc.secretExists(["provider.ollama.local"]);
    if (ollama["provider.ollama.local"]) {
      return { provider: "ollama", model: "llama3.1", secret_ref: "provider.ollama.local", base_url: "http://127.0.0.1:11434" };
    }
    return null;
  }
  return { provider: kind, model, secret_ref };
}
