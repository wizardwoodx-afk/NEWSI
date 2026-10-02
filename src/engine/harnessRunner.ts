import { composeNodePrompt } from "../domain/composer";
import { defaultHarness, HARNESS_BY_ID, type HarnessId } from "../domain/harness";
import type { NodeInstance } from "../domain/types";

export interface HarnessRunResult {
  text: string;
  via: string;
  /** A built-in HarnessId. */
  harness: string;
  code: number | null;
}

/**
 * The runner is a label desk, not a spawner.
 *
 * Every agent executes natively on the owner's own provider keys through the
 * VH agent loop (scheduler → hermesRuntime), so every action carries one
 * audited receipt format. There is no external engine and no spawn path:
 *
 *   • harnessOf — resolves what a node's config SAYS into what actually
 *     runs: the two in-process engines by id, anything else (a stale id in
 *     a saved graph) to the native default, with zero migration step;
 *   • runHarnessAgent — the refusal, for any code path that still tries to
 *     spawn. The refusal states the fix and that nothing was executed.
 */
export function harnessOf(node: NodeInstance): string {
  const raw = String(node.config.harness ?? defaultHarness());
  return HARNESS_BY_ID.has(raw as HarnessId) ? raw : defaultHarness();
}

const SPAWN_REFUSAL =
  "SelfImpulse runs every agent natively on your own provider keys — " +
  "connect a key in the Providers door (OpenAI, Anthropic, Gemini, or local Ollama) and run again. " +
  "Nothing was executed.";

/** The refusal. No binary is spawned, no command is composed. */
export async function runHarnessAgent(
  node: NodeInstance,
  _collected: Record<string, unknown>,
  _composed: ReturnType<typeof composeNodePrompt>,
  _cwd?: string,
): Promise<HarnessRunResult> {
  void node;
  throw new Error(SPAWN_REFUSAL);
}
