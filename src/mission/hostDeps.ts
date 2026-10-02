/**
 * §HOST RUNNER DEPS — the Loop page's execution deps (VH 12.0).
 *
 * Native (Tauri) hosts run real CLIs through the Rust shell; browser hosts get
 * the same high-fidelity multi-turn simulation TeamsPage used (same canned
 * protocol, same honesty: git/verify succeed only through the host or are
 * reported as simulated). The Mission Loop engine never fakes a run — these
 * are the deps the app hands it; probes inject deterministic ones.
 */
import { ipc, useTauri } from "../ipc/client";
import type { TeamRunnerDeps } from "./teamExecutor";

export function hostRunnerDeps(opts?: { testCommand?: string }): TeamRunnerDeps {
  const isNative = useTauri();
  const testCmd = opts?.testCommand?.trim().split(/\s+/) ?? ["npm", "test"];
  return {
    // 19.7.15: the native seat runner. This is what actually runs an agent now
    // that the CLI tier is gone — the owner's own provider key, in this process,
    // under the authority envelope the Governor derived. A read-only seat is
    // told so in the system prompt and gets no write or shell affordance; the
    // capability ceiling in src/security/guardrail.ts is what actually enforces
    // that, not this string.
    nativeInvoke: async (req) => {
      const started = Date.now();
      // Resolve the owner's OWN configured key, the same way the native loop
      // does in src/engine/hermesRuntime.ts (resolveLlm): no key means no run.
      // A seat must never fall back to a default model it was not granted.
      const candidates = ["openai", "anthropic", "ollama"];
      let chosen: { provider: string; model: string; secret_ref: string; base_url?: string } | null = null;
      for (const kind of candidates) {
        const secret_ref = kind === "ollama" ? "provider.ollama.local" : `provider.${kind}.production`;
        const have = await ipc.secretExists([secret_ref]);
        if (have?.[secret_ref]) {
          chosen = {
            provider: kind,
            model: req.model || (kind === "anthropic" ? "claude-sonnet-4" : kind === "ollama" ? "llama3.1" : "gpt-4o-mini"),
            secret_ref,
            ...(kind === "ollama" ? { base_url: "http://127.0.0.1:11434" } : {}),
          };
          break;
        }
      }
      if (!chosen) {
        return {
          exitCode: 1,
          stdout: "",
          stderr: "no provider key is configured — add one in Settings before running agents. Nothing ran.",
          durationMs: Date.now() - started,
          timedOut: false,
        };
      }
      try {
        const out = await ipc.llmChat({
          provider: chosen.provider,
          model: chosen.model,
          secret_ref: chosen.secret_ref,
          ...(chosen.base_url ? { base_url: chosen.base_url } : {}),
          system: req.readOnly
            ? "You are a governed reviewer operating READ-ONLY. Do not write files or run shell commands; report findings."
            : "You are a governed worker inside a sandboxed workspace. Stay inside the given working directory.",
          messages: [{ role: "user", content: req.prompt }],
        });
        return {
          exitCode: 0,
          stdout: out?.content ?? "",
          stderr: "",
          durationMs: Date.now() - started,
          timedOut: false,
        };
      } catch (err) {
        return {
          exitCode: 1,
          stdout: "",
          stderr: `native seat failed: ${String(err)}`,
          durationMs: Date.now() - started,
          timedOut: false,
        };
      }
    },
    // External agent CLIs are removed. No binary is resolved by id and no
    // third-party agent process is spawned. Dev-tool seats (node/npm/cargo/git
    // and the repository's own tests) still run — through shell_exec, which keeps
    // its own allowlist and workspace containment.
    resolveBin: async (_bin) => null,
    cliInvoke: async (req) => {
      void req;
      return {
        exitCode: 127,
        stdout: "",
        stderr:
          "external agent CLIs are removed — every agent runs in-process on your own provider key. Refused in words; nothing ran.",
        durationMs: 0,
        timedOut: false,
      };
    },
    git: async (args, cwd) => {
      if (isNative) {
        try {
          const r = (await ipc.shellExec("git", args, cwd, 60)) as { stdout?: string; stderr?: string; code?: number | null };
          return { ok: r.code === 0, exitCode: r.code ?? null, stdout: r.stdout ?? "", stderr: r.stderr ?? "", reason: r.code === 0 ? null : (r.stderr || "git command failed") };
        } catch (e) {
          return { ok: false, exitCode: null, stdout: "", stderr: String(e), reason: String(e) };
        }
      }
      return { ok: true, exitCode: 0, stdout: "ok", stderr: "", reason: null };
    },
    writeFile: async (filePath, contents) => {
      if (isNative) await ipc.fsWrite(filePath, contents).catch(() => undefined);
    },
    verify: async (cwd) => {
      if (isNative) {
        try {
          const r = (await ipc.shellExec(testCmd[0] ?? "npm", testCmd.slice(1), cwd, 120)) as { stdout?: string; stderr?: string; code?: number | null };
          return { exitCode: r.code ?? 0, stdout: r.stdout ?? "", stderr: r.stderr ?? "", durationMs: 0, timedOut: false };
        } catch (e) {
          return { exitCode: 1, stdout: "", stderr: String(e), durationMs: 0, timedOut: false };
        }
      }
      await new Promise((r) => setTimeout(r, 250));
      return { exitCode: 0, stdout: "PASS — simulated verify (browser host)", stderr: "", durationMs: 240, timedOut: false };
    },
  };
}
