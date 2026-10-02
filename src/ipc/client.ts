import type {
  Connection,
  ExecutionEventRecord,
  ExecutionRecord,
  ExecutionStats,
  McpServerEntry,
  MemoryRecord,
  RolePrompt,
  SkillRecord,
  WorkflowGraph,
  WorkflowRecord,
} from "../domain/types";
import { detectHost } from "../app/desktop";
import { checkEgressUrl } from "../security/guardrail";
import { safeEgressFetch } from "../security/egressNet";
import { ENGINE_VERSION } from "../version";
import { localDb } from "./localDb";

/**
 * The Rust <-> TypeScript command contract, in ONE table.
 *
 * Before this existed, `tauriInvoke` was generic over a type nobody supplied: 72 of 82 call
 * sites inferred `T = unknown`, so a mistyped command name, a renamed Rust command, or a changed
 * return shape all compiled clean and failed at runtime — in the one environment (the desktop
 * build) the probe suites never touch, because they run with `useTauri() === false`.
 *
 * Now the command NAME is part of the type. `tauriInvoke("workflowk_list")` is a compile error,
 * and so is reading a field off a payload the bridge has not modelled.
 *
 * Honesty about precision: the entries typed `Json` are `serde_json::Value` on the Rust side. The bridge
 * has not modelled their shape and this table does not pretend otherwise — they are typed as
 * "some JSON", not as a specific record wearing a type it has not earned. The precise entries are
 * the ones the frontend already declares AND both branches (Tauri and localDb) agree on.
 */
type Json = Record<string, unknown> | unknown[] | string | number | boolean | null;

/** Result of one CLI probe: what the app resolved for each bin in this shell's PATH. */
export interface CliEnvReport {
  path: string;
  searched: string[];
  bins: Array<{ id: string; bin: string; executable: string | null; installed: boolean; version: string | null }>;
}

/**
 * The shape `mcp_server_save` accepts.
 *
 * This is deliberately NOT `McpServerEntry`. `McpServerEntry` is the post-save READ shape, where
 * the command lives at `config.command`. The save endpoint also accepts the flat WRITE shape —
 * `command`, `args`, `enabled`, `pinned` at the top level — because `db::mcp_save` lifts them into
 * `config` itself when no `config` key is present (src-tauri/src/db.rs:444). `McpPage` sends the
 * flat form, and `mcp_connect_test` reads it back at `/config/command`.
 *
 * Typing this as `McpServerEntry` would have been a lie that only survived because the parameter
 * used to be `Record<string, unknown>`.
 */
export type McpServerSaveInput = Partial<McpServerEntry> & {
  name: string;
  command?: string | null;
  args?: string[] | null;
  enabled?: boolean;
  pinned?: boolean;
  /** May the sandboxed server reach the network? Default true (MCP servers are network clients); false = none at all. Part of what a human approves. */
  network?: boolean;
};

interface NativeCommands {
  /** Federation lifecycle — supervised children, not timed-out commands. */
  a2a_host_start: Record<string, unknown>;
  a2a_host_status: Record<string, unknown>;
  a2a_host_stop: Record<string, unknown>;
  app_info: Record<string, unknown>;
  approval_authorize: Json;
  approval_decide: null;
  approval_get: Json;
  approval_list: Json;
  approval_request: Json;
  browser_act: Json;
  browser_console: Json;
  browser_navigate: Json;
  browser_screenshot: Json;
  browser_session_close: Json;
  browser_session_create: Json;
  browser_sessions: Json;
  // Retained under its historical name: it now reports the DEV-TOOL allowlist
  // (node/npm/cargo/git/…), not agent CLIs. Renaming it is a wire change to
  // every caller and buys clarity we can get from the comment instead.
  cli_env: CliEnvReport;
  control_connect_ports: Connection;
  control_disconnect_ports: Json;
  control_list_nodes: Json;
  control_run_workflow: Json;
  control_validate_graph: Json;
  custom_harness_delete: Json;
  custom_harness_save: Json;
  db_maintenance: Json;
  dlq_add: Json;
  dlq_list: Json;
  dlq_resolve: null;
  evaluation_history: Json;
  evaluation_save: Json;
  event_emit: ExecutionEventRecord;
  evolution_decide: Json;
  evolution_list: Json;
  evolution_propose_save: Json;
  evolution_rollback: Json;
  evolution_service_health: Json;
  evolution_service_propose: Json;
  execution_create: { id: string };
  execution_events: ExecutionEventRecord[];
  execution_finish: null;
  execution_list: ExecutionRecord[];
  execution_trace: Json;
  feedback_add: Json;
  feedback_list: Json;
  fs_list: Json;
  fs_mkdir: null;
  fs_read: string;
  fs_remove: null;
  fs_write: null;
  git_branch: GitBranchResult;
  git_diff: GitDiffResult;
  git_head: GitHeadResult;
  git_is_repo: GitRepoResult;
  git_read_only_check: GitReadOnlyResult;
  git_status: GitStatusResult;
  hermes_bridge: Json;
  llm_chat: { content: string; model: string; usage: { input_tokens: number; output_tokens: number }; duration_ms: number };
  mcp_call: Json;
  mcp_connect_test: Json;
  mcp_server_list: McpServerEntry[];
  mcp_server_remove: null;
  mcp_server_save: { id: string; approved: boolean };
  memory_add: Json;
  memory_delete: null;
  memory_search: MemoryRecord[];
  node_state_load: Json;
  node_state_save: null;
  package_export: Json;
  package_import: Json;
  run_request_take: string[];
  secret_delete: null;
  secret_exists: Record<string, SecretStatus>;
  /**
   * Provider keys are NEVER returned (`value` is null, `redacted` true, `hint` is the last four
   * characters of a long key). Only signing keys (owner / issuer) come back as a value — a stated
   * residual until signing moves native. Any other reference is refused.
   */
  secret_get: { ref: string; present: boolean; value: string | null; redacted?: boolean; hint?: string | null };
  exec_grant_request: { grant: string; workspace: string; network: boolean; programs: string[]; expiresAt: number };
  exec_grants_status: Array<{ workspace: string; network: boolean; programs: string[]; expiresAt: number; secondsLeft: number }>;
  exec_grants_revoke: { revoked: number };
  provider_bind_endpoint: { bound: boolean; origin: string; secretRef: string; alreadyBound: boolean };
  provider_endpoints_list: Array<{ secretRef: string; origin: string; boundBy: string; boundAt: string }>;
  provider_unbind_endpoint: { unbound: boolean; secretRef: string };
  secret_set: { stored: boolean; location: "keychain" | "memory-only" | "browser-localStorage" | "absent"; survivesRestart: boolean; warning?: string };
  shell_exec: Json;
  skill_deactivate: null;
  skill_touch: Json;
  skill_upsert: Json;
  skills_list: { skills: SkillRecord[]; all: SkillRecord[] };
  suite_list: Json;
  suite_save: Json;
  workflow_create: { id: string };
  workflow_delete: null;
  workspace_root_add: { ok: boolean; path: string };
  workspace_root_list: { path: string; addedAt: string }[];
  workspace_root_remove: { ok: boolean; path: string };
  workflow_get: WorkflowRecord;
  workflow_list: WorkflowRecord[];
  workflow_save: null;
  workflow_version_create: Json;
  workflow_version_restore: Json;
  workflow_versions: Json;
}

async function tauriInvoke<K extends keyof NativeCommands>(
  cmd: K,
  args?: Record<string, unknown>,
): Promise<NativeCommands[K]> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<NativeCommands[K]>(cmd, args ?? {});
}

/**
 * True when running inside the Tauri WebView rather than a plain browser.
 *
 * Exported so pages can *label* what they are showing rather than render a panel that silently does
 * nothing. A page that renders "0 files changed" in a browser build is asserting something false about
 * the user's repository; a page that says "git needs the native build" is not.
 */
export const useTauri = () => detectHost() === "tauri";

/**
 * Where a secret really lives. V7 fix (bug W): "exists" used to be a bare boolean, which could not
 * distinguish a key safely in the OS keychain from one sitting in RAM that vanishes on exit.
 */
export interface SecretStatus {
  exists: boolean;
  location: "keychain" | "memory-only" | "browser-localStorage" | "absent";
  survivesRestart: boolean;
  warning?: string;
}

/**
 * V7 fix (bug V): the single honest explanation for the browser family, shared by the browser
 * fallbacks here and mirrored by `browser_reason()` in commands.rs. No Chromium is bundled.
 */
const browserReason =
  "No browser is attached in this build: the app does not bundle or launch Chromium, so there is no session, no page and no DOM. Nothing was fetched.";

/* ------------------------------------------------------------------ git result shapes
 * Mirrors what `src-tauri/src/git.rs` returns. `ok: false` is a *result*, not a thrown error: a
 * repository that is not a git repository, or a diff that timed out, is something the UI has to be able
 * to display. `reason` always explains it.
 */
export interface GitRepoResult {
  ok: boolean;
  isRepo: boolean;
  toplevel?: string;
  reason?: string | null;
  timedOut?: boolean;
}
export interface GitStatusEntry {
  xy: string;
  path: string;
  from: string | null;
  untracked: boolean;
  staged: boolean;
  worktree: boolean;
}
export interface GitStatusResult {
  ok: boolean;
  entries: GitStatusEntry[];
  count: number;
  clean: boolean;
  untracked: number;
  summary?: string;
  reason?: string | null;
  timedOut?: boolean;
}
export interface GitDiffFile {
  path: string;
  added: number;
  removed: number;
  isNew: boolean;
  isDeleted: boolean;
  isBinary: boolean;
  renamedFrom: string | null;
}
export interface GitDiffResult {
  ok: boolean;
  files: GitDiffFile[];
  summary?: string;
  totals?: { files: number; added: number; removed: number; newFiles: number; deletedFiles: number; renames: number; binaryFiles: number };
  raw?: string;
  rawBytes?: number;
  truncated?: boolean;
  reason?: string | null;
  timedOut?: boolean;
}
export interface GitHeadResult {
  ok: boolean;
  sha: string | null;
  shortSha?: string;
  subject?: string;
  author?: string;
  committedAt?: string;
  hasCommits: boolean;
  reason?: string | null;
}
export interface GitBranchResult {
  ok: boolean;
  branch: string | null;
  detached: boolean;
  reason?: string | null;
}
export interface GitReadOnlyResult {
  ok: boolean;
  /** "clean" | "violated" | "unknown". Unknown is never reported as clean. */
  verdict: "clean" | "violated" | "unknown";
  paths: string[];
  reason: string;
}

/** The A2A host's real lifecycle, as reported by the backend supervisor.
 *  `running` is never assumed: it is true only when the OS says the child is
 *  alive AND the supervisor says it reached `running`. */
export type FederationState = "stopped" | "starting" | "running" | "failed" | "unavailable";

export interface FederationStatus {
  state: FederationState;
  bundled: boolean;
  hostPath: string | null;
  running: boolean;
  pid: number | null;
  port: number | null;
  cardUrl: string | null;
  interfaceUrl: string | null;
  selfimpulse: string | null;
  identityFp: string | null;
  cardSigned: boolean;
  tokenMinted: boolean;
  /** "local" = 127.0.0.1 only. "lan" = this machine and the network it is on. */
  bindScope: "local" | "lan" | null;
  bindAddress: string | null;
  /** The ONE-TIME pairing code. Never the host's own token. */
  pairingCode: string | null;
  pairingExpires: string | null;
  /** Whether AlterSend is actually mounted on the running host. */
  files: boolean;
  detail: string;
}

/* ── execution grants (module memory only; the native side holds the truth) ───────────────── */
interface ExecGrantToken { token: string; workspace: string; network: boolean; programs: string[]; expiresAt: number }
let execGrants: ExecGrantToken[] = [];

const bareProgram = (p: string): string => (p.split(/[\\/]/).pop() ?? p).replace(/\.exe$/i, "");
const norm = (p: string): string => p.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
const within = (child: string, root: string): boolean => norm(child) === norm(root) || norm(child).startsWith(norm(root) + "/");

function pickExecGrant(program: string, cwd: string | undefined, needNetwork: boolean): ExecGrantToken | undefined {
  const now = Date.now() / 1000;
  execGrants = execGrants.filter((g) => g.expiresAt > now + 5);
  const bare = bareProgram(program);
  return execGrants.find((g) => (g.network || !needNetwork) && g.programs.includes(bare) && (cwd === undefined || within(cwd, g.workspace)));
}
function dropExecGrant(token: string): void {
  execGrants = execGrants.filter((g) => g.token !== token);
}
async function requestExecGrant(workspace: string | undefined, network: boolean, programs: string[] = [], minutes?: number): Promise<ExecGrantToken> {
  const ws = workspace ?? String(((await ipc.appInfo()) as { workspaceRoot?: unknown }).workspaceRoot ?? "");
  const r = (await tauriInvoke("exec_grant_request", { programs, workspace: ws, network, minutes })) as NativeCommands["exec_grant_request"];
  const g: ExecGrantToken = { token: r.grant, workspace: r.workspace, network: r.network, programs: r.programs, expiresAt: r.expiresAt };
  execGrants.push(g);
  return g;
}

export const ipc = {
  appInfo: async () => {
    if (useTauri()) return tauriInvoke("app_info");
    return {
      version: ENGINE_VERSION,
      platform: navigator.platform,
      workspaceRoot: "(browser workspace)",
      artifactsDir: "(memory)",
      dbHealthy: true,
      controlMcpPort: 0,
      controlMcpTransport: "stdio",
      controlMcpRunning: true,
      startupMs: 0,
      host: "webview-host",
      vendors: ["mcp-servers-reference", "mcp-github"],
    };
  },
  /* ---------------------------------------------------------------- federation
   *
   * The desktop app bundles an A2A host and, until now, did nothing with it:
   * `app_info` reported `a2aHostPath`, and no TypeScript ever read the field.
   * The architecture was therefore a fact a user had to discover, which is not
   * the same thing as a product concept.
   *
   * It is one now, and the decision is EXPLICIT rather than automatic. A host
   * binds a TCP port and signs an agent card, so silently starting one on launch
   * would be the app opening a listener nobody asked for. Instead the user
   * mounts it deliberately, and the UI says plainly what mounting means before
   * the button does anything.
   */
  /* ── FEDERATION ────────────────────────────────────────────────────────
   * Three commands, one lifecycle. This used to be a single `shellExec` call
   * with a 20-second timeout, which cannot work: `run_timeout()` kills the
   * child on the deadline, so a long-lived A2A host came up, announced READY,
   * and was terminated while the UI still called it mounted. The backend now
   * supervises the child itself (`a2a_host_start` / `_status` / `_stop`), and
   * `running` is a question the OS answers rather than a constant. */
  federationStatus: async (): Promise<FederationStatus> => {
    if (!useTauri()) {
      return {
        state: "unavailable", bundled: false, hostPath: null, running: false,
        pid: null, port: null, cardUrl: null, interfaceUrl: null, selfimpulse: null,
        identityFp: null, cardSigned: false, tokenMinted: false,
        bindScope: null, bindAddress: null, pairingCode: null, pairingExpires: null, files: false,
        detail: "Federation is a desktop capability. This build has no bundled A2A host.",
      };
    }
    let info: { a2aHostPath?: string; a2aHostBundled?: boolean } = {};
    try {
      info = (await tauriInvoke("app_info")) as typeof info;
    } catch {
      // The lifecycle answer is still worth having; the bundle path is not.
    }
    const bundled = info?.a2aHostBundled === true;
    const hostPath = info?.a2aHostPath ?? null;
    const base = { bundled, hostPath };
    try {
      const st = (await tauriInvoke("a2a_host_status")) as Record<string, unknown>;
      const state = (typeof st.state === "string" ? st.state : "stopped") as FederationState;
      return {
        state,
        ...base,
        running: st.running === true && state === "running",
        files: st.files === true,
        pid: typeof st.pid === "number" ? st.pid : null,
        port: typeof st.port === "number" ? st.port : null,
        cardUrl: typeof st.cardUrl === "string" ? st.cardUrl : null,
        interfaceUrl: typeof st.interfaceUrl === "string" ? st.interfaceUrl : null,
        selfimpulse: typeof st.selfimpulse === "string" ? st.selfimpulse : null,
        identityFp: typeof st.identityFp === "string" ? st.identityFp : null,
        cardSigned: st.cardSigned === true,
        tokenMinted: st.tokenMinted === true,
        bindScope: st.bindScope === "lan" ? "lan" : st.bindScope === "local" ? "local" : null,
        bindAddress: typeof st.bindAddress === "string" ? st.bindAddress : null,
        pairingCode: typeof st.pairingCode === "string" ? st.pairingCode : null,
        pairingExpires: typeof st.pairingExpires === "string" ? st.pairingExpires : null,
        detail: String(st.detail ?? ""),
      };
    } catch (err) {
      return {
        state: bundled ? "stopped" : "unavailable",
        ...base,
        running: false, pid: null, port: null, cardUrl: null, interfaceUrl: null,
        selfimpulse: null, identityFp: null, cardSigned: false, tokenMinted: false,
        bindScope: null, bindAddress: null, pairingCode: null, pairingExpires: null, files: false,
        detail: `Could not read the A2A host state: ${String(err)}`,
      };
    }
  },

  federationMount: async (opts: {
    selfimpulse: string;
    port?: number;
    /** Explicit, and defaulted to the narrowest choice. */
    bind?: "local" | "lan";
    /** Mint a one-time pairing code for a peer machine. */
    pair?: boolean;
    /** Mount AlterSend so paired peers can offer files. Off unless asked for. */
    files?: boolean;
  }): Promise<{ ok: boolean; detail: string }> => {
    if (!useTauri()) return { ok: false, detail: "Federation is a desktop capability." };
    const st = await ipc.federationStatus();
    if (!st.bundled || !st.hostPath) {
      return { ok: false, detail: "No A2A host is bundled with this build; nothing was started." };
    }
    if (st.state === "running") {
      return { ok: true, detail: `The A2A host is already mounted (pid ${st.pid}, port ${st.port}); a second mount was not started.` };
    }
    try {
      // Our own byte-pinned bundle, launched by the supervisor. The launcher
      // verifies the engine's SHA-256 before it will listen, and the child is
      // kept — not waited on — so it outlives this call.
      const r = (await tauriInvoke("a2a_host_start", {
        selfimpulse: opts.selfimpulse || "SelfImpulse",
        port: opts.port ?? 0,
        bind: opts.bind ?? "local",
        pair: opts.pair === true,
        files: opts.files === true,
      })) as Record<string, unknown>;
      return { ok: r.ok === true, detail: String(r.detail ?? (r.ok === true ? "The host is mounted." : "The host did not report ready.")) };
    } catch (err) {
      return { ok: false, detail: `Mount failed in words rather than pretending: ${String(err)}` };
    }
  },

  federationStop: async (): Promise<{ ok: boolean; detail: string }> => {
    if (!useTauri()) return { ok: false, detail: "Federation is a desktop capability." };
    try {
      const r = (await tauriInvoke("a2a_host_stop")) as Record<string, unknown>;
      return { ok: r.ok !== false, detail: String(r.detail ?? "The A2A host was stopped.") };
    } catch (err) {
      return { ok: false, detail: `Stop failed in words rather than pretending: ${String(err)}` };
    }
  },

  dbMaintenance: async (vacuum: boolean) => {
    if (useTauri()) return tauriInvoke("db_maintenance", { vacuum });
    if (vacuum) {
      /* no-op compact */
    }
    const raw = localStorage.getItem("selfimpulse.v3.db") ?? "";
    return { vacuumed: vacuum, sizeBytes: raw.length };
  },

  workflowList: async (): Promise<WorkflowRecord[]> => {
    if (useTauri()) return tauriInvoke("workflow_list");
    return localDb.workflowList();
  },
  workflowGet: async (workflowId: string) => {
    if (useTauri()) return tauriInvoke("workflow_get", { workflowId });
    return localDb.workflowGet(workflowId);
  },
  workflowCreate: async (name: string, description: string) => {
    if (useTauri()) return tauriInvoke("workflow_create", { name, description });
    return localDb.workflowCreate(name, description);
  },
  workflowDelete: async (workflowId: string) => {
    if (useTauri()) return tauriInvoke("workflow_delete", { workflowId });
    localDb.workflowDelete(workflowId);
  },
  workflowSave: async (workflowId: string, name: string, description: string, graph: WorkflowGraph) => {
    if (useTauri()) return tauriInvoke("workflow_save", { workflowId, name, description, graph });
    localDb.workflowSave(workflowId, name, description, graph);
  },
  // V7 fix (bug T): the browser fallbacks for versioning fabricated an id and a constant
  // `version: 1`, so the version history UI showed a plausible list of versions that were never
  // stored and could not be restored. These now fail loudly. The Tauri side is real.
  versionCreate: async (workflowId: string, label: string) => {
    if (useTauri()) return tauriInvoke("workflow_version_create", { workflowId, label });
    throw new Error("Workflow versions are only stored by the native build; nothing was saved in this browser session.");
  },
  versionList: async (_workflowId: string) => {
    if (useTauri()) return tauriInvoke("workflow_versions", { workflowId: _workflowId });
    throw new Error("Workflow versions are only stored by the native build; this browser session has no version history to show.");
  },
  versionRestore: async (versionRecordId: string) => {
    if (useTauri()) return tauriInvoke("workflow_version_restore", { versionRecordId });
    throw new Error("Cannot restore a version in the browser: nothing was ever stored, so nothing was changed.");
  },

  nodeStateLoad: async (nodeKey: string) => {
    if (useTauri()) return tauriInvoke("node_state_load", { nodeKey });
    return {};
  },
  nodeStateSave: async (nodeKey: string, rolePrompt?: RolePrompt) => {
    if (useTauri()) return tauriInvoke("node_state_save", { nodeKey, rolePrompt });
  },

  memoryAdd: async (nodeKey: string, kind: string, content: string, tags: string[], importance: number, executionId?: string) => {
    if (useTauri()) return tauriInvoke("memory_add", { nodeKey, kind, content, tags, importance, executionId });
    return localDb.memoryAdd(nodeKey, kind, content, tags, importance);
  },
  memorySearch: async (nodeKey: string, query: string, limit = 12): Promise<MemoryRecord[]> => {
    if (useTauri()) return tauriInvoke("memory_search", { nodeKey, query, limit, kinds: null });
    return localDb.memorySearch(nodeKey, query, limit);
  },
  memoryDelete: async (memoryId: string) => {
    if (useTauri()) return tauriInvoke("memory_delete", { memoryId });
    localDb.memoryDelete(memoryId);
  },
  skillsList: async (nodeKey: string): Promise<{ skills: SkillRecord[]; all: SkillRecord[] }> => {
    if (useTauri()) return tauriInvoke("skills_list", { nodeKey });
    return localDb.skillsList(nodeKey);
  },
  skillTouch: async (skillIds: string[]) => {
    if (useTauri()) return tauriInvoke("skill_touch", { skill_ids: skillIds });
    // Honest browser-host limitation (V11): usage counts live in the native SQLite store.
    throw new Error("Skill usage counts live in the native build's SQLite store; the browser preview has no skill store to update.");
  },
  skillDeactivate: async (skillId: string) => {
    if (useTauri()) return tauriInvoke("skill_deactivate", { skill_id: skillId });
  },
  skillUpsert: async (args: {
    nodeKey: string;
    skillId?: string | null;
    name: string;
    description: string;
    procedure: string;
    origin: string;
    score?: number | null;
  }) => {
    if (useTauri()) return tauriInvoke("skill_upsert", args);
    return localDb.skillUpsert(args);
  },
  feedbackAdd: async (executionId: string, nodeKey: string, rating: number, comment: string) => {
    if (useTauri()) return tauriInvoke("feedback_add", { executionId, nodeKey, rating, comment });
    return localDb.feedbackAdd(executionId, nodeKey, rating, comment);
  },
  feedbackList: async () => {
    if (useTauri()) return tauriInvoke("feedback_list");
    return localDb.feedbackList();
  },

  // V7 fix (bug T): these returned fabricated ids and empty lists. A fabricated evaluation id
  // implies a stored result that does not exist, and an empty list is indistinguishable from
  // "no evaluations have ever run" — both read as success while nothing happened.
  evaluationSave: async (nodeKey: string, executionId: string | null, suite: unknown, score: number, details: Record<string, unknown>) => {
    if (useTauri()) return tauriInvoke("evaluation_save", { nodeKey, executionId, suite, score, details });
    throw new Error("Evaluation results live in the native build's SQLite database; the browser preview has no database to write.");
  },
  evaluationHistory: async (nodeKey: string) => {
    if (useTauri()) return tauriInvoke("evaluation_history", { nodeKey });
    throw new Error("Evaluation history lives in the native build's SQLite database; the browser preview has no database to read.");
  },
  suiteList: async () => {
    if (useTauri()) return tauriInvoke("suite_list");
    throw new Error("Test suites live in the native build's SQLite database; the browser preview has no database to read.");
  },
  suiteSave: async (args: { suiteId?: string | null; name: string; cases: unknown[] }) => {
    if (useTauri()) return tauriInvoke("suite_save", args);
    throw new Error("Test suites live in the native build's SQLite database; the browser preview has no database to write.");
  },
  evolutionProposeSave: async (cand: Record<string, unknown>) => {
    if (useTauri()) return tauriInvoke("evolution_propose_save", { cand });
    return localDb.evolutionPropose(cand);
  },
  evolutionList: async (nodeKey?: string) => {
    if (useTauri()) return tauriInvoke("evolution_list", { nodeKey: nodeKey ?? null });
    return localDb.evolutionList();
  },
  evolutionDecide: async (candidateId: string, decision: "ACCEPTED" | "REJECTED") => {
    if (useTauri()) return tauriInvoke("evolution_decide", { candidateId, decision });
    return localDb.evolutionDecide(candidateId, decision);
  },
  evolutionRollback: async (candidateId: string, restoreRolePrompt?: RolePrompt | null) => {
    if (useTauri()) return tauriInvoke("evolution_rollback", { candidateId, restoreRolePrompt: restoreRolePrompt ?? null });
  },

  approvalRequest: async (executionId: string, nodeKey: string, summary: string, payload: Record<string, unknown>, requestedBy?: string) => {
    if (useTauri()) return tauriInvoke("approval_request", { executionId, nodeKey, summary, payload, requestedBy: requestedBy ?? null });
    return localDb.approvalRequest(executionId, nodeKey, summary, payload, requestedBy);
  },
  approvalGet: async (executionId: string, nodeKey: string) => {
    if (useTauri()) return tauriInvoke("approval_get", { executionId, nodeKey });
    return localDb.approvalGet(executionId, nodeKey);
  },
  approvalList: async () => {
    if (useTauri()) return tauriInvoke("approval_list");
    return localDb.approvalList();
  },
  /** C-2 (archive 4): mint the decision capability — native OS dialog in the
   *  desktop app, an interactive confirm in the web mirror. The token it
   *  returns is the ONLY thing approvalDecide will accept. */
  approvalAuthorize: async (approvalId: string, decision: "APPROVED" | "REJECTED") => {
    if (useTauri()) return tauriInvoke("approval_authorize", { approvalId, decision });
    return localDb.approvalAuthorize(approvalId, decision);
  },
  approvalDecide: async (approvalId: string, decision: "APPROVED" | "REJECTED", capability: string) => {
    if (useTauri()) return tauriInvoke("approval_decide", { approvalId, decision, capability });
    localDb.approvalDecide(approvalId, decision, capability);
  },

  executionCreate: async (workflowId: string, workflowVersion: number) => {
    if (useTauri()) return tauriInvoke("execution_create", { workflowId, workflowVersion });
    return localDb.executionCreate(workflowId, workflowVersion);
  },
  executionFinish: async (executionId: string, status: string, error: string | null, stats: Record<string, unknown>) => {
    if (useTauri()) return tauriInvoke("execution_finish", { executionId, status, error, stats });
    localDb.executionFinish(executionId, status, error, stats as unknown as ExecutionStats);
  },
  eventEmit: async (executionId: string, kind: string, level: string, nodeId: string | null, data: Record<string, unknown>) => {
    if (useTauri()) {
      const rec = await tauriInvoke("event_emit", { executionId, kind, level, nodeId, data });
      window.dispatchEvent(new CustomEvent("vh://event", { detail: rec }));
      return rec;
    }
    return localDb.eventEmit(executionId, kind, level, nodeId, data);
  },
  executionEvents: async (executionId: string): Promise<ExecutionEventRecord[]> => {
    if (useTauri()) return tauriInvoke("execution_events", { executionId });
    return localDb.executionEvents(executionId);
  },
  executionTrace: async (executionId: string) => {
    if (useTauri()) return tauriInvoke("execution_trace", { executionId });
    return { events: localDb.executionEvents(executionId), status: "COMPLETED" };
  },
  executionList: async (): Promise<ExecutionRecord[]> => {
    if (useTauri()) return tauriInvoke("execution_list");
    return localDb.executionList();
  },
  dlqAdd: async (executionId: string, nodeKey: string, error: string, payload: Record<string, unknown>, suggestedCause: string, candidateFix: string) => {
    if (useTauri()) return tauriInvoke("dlq_add", { executionId, nodeKey, error, payload, suggestedCause, candidateFix });
    return localDb.dlqAdd(executionId, nodeKey, error, payload, suggestedCause, candidateFix);
  },
  dlqList: async () => {
    if (useTauri()) return tauriInvoke("dlq_list");
    return localDb.dlqList();
  },
  dlqResolve: async (dlqId: string) => {
    if (useTauri()) return tauriInvoke("dlq_resolve", { dlqId });
    localDb.dlqResolve(dlqId);
  },
  runRequestTake: async (): Promise<string[]> => {
    if (useTauri()) return tauriInvoke("run_request_take");
    return localDb.runTake();
  },

  evolutionServiceHealth: async () => {
    if (useTauri()) return tauriInvoke("evolution_service_health");
    // V6 fix: this used to claim available:true from the browser. It is not available there —
    // the service is a stdio child process owned by the native host.
    return {
      available: false,
      transport: "stdio",
      reason: "The evolution service is a stdio child process of the native host. Build the desktop app (npm run tauri:build).",
      engine: "mj_evolution.stdio_server",
      hooks: ["on_session_start", "pre_llm_call", "post_llm_call", "on_session_end"],
    };
  },
  hermesBridge: async (msg: Record<string, unknown>) => {
    if (useTauri()) return tauriInvoke("hermes_bridge", { msg });
    return { ok: true, transport: "in-process", echo: msg };
  },
  evolutionServicePropose: async (args: { task: string; expected: string; output: string; skill: string }) => {
    // V6 fix: the Rust command takes one parameter named `args`; this used to send the
    // payload flat, so Tauri rejected the invoke for a missing key.
    if (useTauri()) return tauriInvoke("evolution_service_propose", { args });
    return null;
  },

  secretGet: async (secretRef: string): Promise<{ ref: string; present: boolean; value: string | null; redacted?: boolean; hint?: string | null }> => {
    if (useTauri()) return tauriInvoke("secret_get", { secretRef });
    const value = localDb.secretGet(secretRef) as string | null | undefined;
    return { ref: secretRef, present: value != null && value !== "", value: value ?? null };
  },
  secretSet: async (secretRef: string, value: string): Promise<{ stored: boolean; location: SecretStatus["location"]; survivesRestart: boolean; warning?: string }> => {
    if (useTauri()) return tauriInvoke("secret_set", { secretRef, value });
    localDb.secretSet(secretRef, value);
    return { stored: true, location: "browser-localStorage", survivesRestart: true, warning: "Stored in browser localStorage, not an OS keychain." };
  },
  secretDelete: async (secretRef: string) => {
    if (useTauri()) return tauriInvoke("secret_delete", { secretRef });
    localDb.secretDelete(secretRef);
  },
  secretExists: async (refs: string[]): Promise<Record<string, SecretStatus>> => {
    if (useTauri()) return tauriInvoke("secret_exists", { secretRefs: refs });
    return localDb.secretExists(refs);
  },
  llmChat: async (req: {
    provider: string;
    base_url?: string;
    model: string;
    messages: Array<{ role: string; content: string }>;
    system?: string;
    max_tokens?: number;
    temperature?: number;
    secret_ref: string;
  }): Promise<{ content: string; model: string; usage: { input_tokens: number; output_tokens: number }; duration_ms: number }> => {
    // Egress guard at the IPC boundary. Every provider call in the engine passes
    // through here, so the policy is applied once, at the choke point, rather than
    // per call site. Before this, only engine/providers.ts complete() checked
    // checkEgressUrl — the Hermes autonomous loop (engine/hermesRuntime.ts) called
    // llmChat directly with a caller-supplied base_url, so an SSRF to link-local /
    // RFC1918 / a cloud metadata endpoint, and an exfiltration of the provider key
    // to an attacker-chosen host, both rode an unguarded path. The web host and the
    // Rust handler enforce the same policy; this is the shared decision.
    const target = req.base_url && req.base_url.trim() ? req.base_url.trim() : undefined;
    if (target) {
      const egress = checkEgressUrl(target);
      if (!egress.ok) {
        throw new Error(
          `base URL refused by the egress guard: ${egress.reason} — nothing was sent and no key left this machine.`,
        );
      }
    }
    if (useTauri()) return tauriInvoke("llm_chat", { req: { ...req, base_url: target } });

    // The WEB host has no native egress_guard, so the DNS/IP-aware check happens
    // here instead: resolve once, classify every answer, pin the address, and
    // re-vet each redirect hop (safeEgressFetch, below). On desktop this is the
    // native handler's job — doing it twice would add a second DNS lookup to
    // every call and would break an offline self-hosted gateway whose name does
    // not resolve, so the string gate above is all the WebView does there.
    const key = localDb.secretGet(req.secret_ref);
    if (req.provider === "ollama" || target?.includes("11434")) {
      try {
        // The web host has no native egress_guard, so the DNS/IP-aware check
        // runs here instead: resolve once, classify every answer, pin the
        // address, and re-vet each redirect hop. Loopback is allowed because a
        // local Ollama is documented product surface; a name that resolves to a
        // private address is not, and is refused before a key or a prompt moves.
        const r = await safeEgressFetch(`${target || "http://127.0.0.1:11434"}/api/chat`, {
          method: "POST",
          allowLoopback: true,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: req.model,
            stream: false,
            messages: [
              ...(req.system ? [{ role: "system", content: req.system }] : []),
              ...req.messages,
            ],
          }),
        });
        const j = await r.json();
        return {
          content: j.message?.content ?? "",
          model: req.model,
          usage: { input_tokens: 0, output_tokens: 0 },
          duration_ms: 0,
        };
      } catch (e) {
        throw new Error(`ollama unreachable: ${e}`);
      }
    }
    if (!key) throw new Error(`secret not found: ${req.secret_ref}`);
    throw new Error("Cloud LLM calls from the web host require the native desktop build (CORS). Use Local LLM / Ollama or run `npm run tauri`.");
  },

  fsRead: async (path: string) => {
    if (useTauri()) return tauriInvoke("fs_read", { path });
    throw new Error("Filesystem is available in the native desktop build.");
  },
  fsWrite: async (path: string, content: string) => {
    if (useTauri()) return tauriInvoke("fs_write", { path, content });
    throw new Error("Filesystem is available in the native desktop build.");
  },
  fsList: async (path: string) => {
    if (useTauri()) return tauriInvoke("fs_list", { path });
    return [];
  },
  fsMkdir: async (path: string) => {
    if (useTauri()) return tauriInvoke("fs_mkdir", { path });
  },
  fsRemove: async (path: string, recursive: boolean) => {
    if (useTauri()) return tauriInvoke("fs_remove", { path, recursive });
  },
  /**
   * Run a dev tool inside the sandbox. The native side runs NOTHING without an execution grant a
   * human minted at a native dialog (which tools, which workspace, network or not, for how long).
   * The grant is requested on first need and kept in this module's memory — never persisted — and
   * renewed transparently when it expires or is revoked. Network is OFF unless `opts.network` asks
   * for it, in which case the dialog says so in capitals.
   */
  shellExec: async (program: string, args: string[], cwd?: string, timeoutSecs?: number, opts?: { network?: boolean }) => {
    if (!useTauri()) throw new Error("Terminal is available in the native desktop build.");
    const needNetwork = opts?.network === true;
    let g = pickExecGrant(program, cwd, needNetwork);
    if (!g) g = await requestExecGrant(cwd, needNetwork);
    try {
      return await tauriInvoke("shell_exec", { program, args, cwd, timeoutSecs, grant: g.token });
    } catch (e) {
      if (!/unknown or was revoked|has expired/i.test(String(e))) throw e;
      dropExecGrant(g.token);
      const fresh = await requestExecGrant(cwd, needNetwork);
      return await tauriInvoke("shell_exec", { program, args, cwd, timeoutSecs, grant: fresh.token });
    }
  },
  /** Ask (natively) for an execution grant. Resolves with its public shape — the token stays inside this module. */
  execGrantRequest: async (o: { workspace?: string; programs?: string[]; network?: boolean; minutes?: number } = {}) => {
    if (!useTauri()) throw new Error("Execution grants exist in the native desktop build only.");
    const g = await requestExecGrant(o.workspace, o.network === true, o.programs, o.minutes);
    return { workspace: g.workspace, network: g.network, programs: g.programs, expiresAt: g.expiresAt };
  },
  execGrantsStatus: async () => {
    if (!useTauri()) return [] as NativeCommands["exec_grants_status"];
    return tauriInvoke("exec_grants_status");
  },
  execGrantsRevoke: async () => {
    if (!useTauri()) return { revoked: 0 };
    execGrants = [];
    return tauriInvoke("exec_grants_revoke");
  },

  /**
   * Bind a provider key to ONE non-canonical https origin. The vendor's own host needs no binding;
   * anything else (a self-hosted or BYOK gateway) needs a human at a native dialog, because the
   * page cannot be trusted to say where a key may go.
   */
  providerBindEndpoint: async (secretRef: string, baseUrl: string) => {
    if (!useTauri()) throw new Error("Endpoint binding exists in the native desktop build only — the web edition holds no cloud keys.");
    return tauriInvoke("provider_bind_endpoint", { secretRef, baseUrl });
  },
  providerEndpointsList: async () => {
    if (!useTauri()) return [] as NativeCommands["provider_endpoints_list"];
    return tauriInvoke("provider_endpoints_list");
  },
  providerUnbindEndpoint: async (secretRef: string) => {
    if (!useTauri()) return { unbound: false, secretRef };
    return tauriInvoke("provider_unbind_endpoint", { secretRef });
  },

  // QA fix (audit C2): the native filesystem is sandboxed to the app data dir plus these
  // user-registered workspace roots. Teams registers the runner repo when a run starts.
  workspaceRootAdd: async (root: string) => {
    if (!useTauri()) return { ok: false as boolean, path: root };
    return tauriInvoke("workspace_root_add", { root });
  },
  workspaceRootRemove: async (root: string) => {
    if (!useTauri()) return { ok: false as boolean, path: root };
    return tauriInvoke("workspace_root_remove", { root });
  },
  workspaceRootList: async (): Promise<{ path: string; addedAt: string }[]> => {
    if (!useTauri()) return [];
    return tauriInvoke("workspace_root_list");
  },

  mcpServerList: async (): Promise<McpServerEntry[]> => {
    if (useTauri()) return tauriInvoke("mcp_server_list");
    return localDb.mcpList();
  },
  mcpServerSave: async (cfg: McpServerSaveInput) => {
    if (useTauri()) return tauriInvoke("mcp_server_save", { cfg });
    return localDb.mcpSave(cfg);
  },
  mcpServerRemove: async (serverId: string) => {
    if (useTauri()) return tauriInvoke("mcp_server_remove", { serverId });
    localDb.mcpRemove(serverId);
  },
  mcpConnectTest: async (serverId: string) => {
    if (useTauri()) return tauriInvoke("mcp_connect_test", { serverId });
    const s = localDb.mcpList().find((m) => m.id === serverId);
    return {
      serverId,
      connected: false,
      lastError: "Connect from the native desktop build (stdio MCP).",
      toolCount: 0,
      name: s?.name,
    };
  },
  mcpCall: async (serverId: string, tool: string, args: unknown) => {
    if (useTauri()) return tauriInvoke("mcp_call", { serverId, tool, arguments: args });
    throw new Error("MCP calls require the native desktop build.");
  },

  // V7 fix (bug V): these browser fallbacks invented a session id, a page title and an engine
  // name. An agent or a page reading them would conclude a real navigation had happened. Every
  // one of them now reports the same notAttached shape the Rust side does.
  /**
   * `key` is what makes browser use autonomous: pass a stable key (a node key, a workflow id) and
   * the same session comes back, so a loop that navigates repeatedly drives one tab with its
   * history and cookies intact instead of leaking a fresh browser context on every call.
   */
  browserSessionCreate: async (key?: string) => {
    if (useTauri()) return tauriInvoke("browser_session_create", { key });
    return { ok: false, notAttached: true, engine: null, sessionId: null, reason: browserReason };
  },
  browserSessionClose: async (sessionId: string) => {
    if (useTauri()) return tauriInvoke("browser_session_close", { sessionId });
  },
  browserSessions: async () => {
    if (useTauri()) return tauriInvoke("browser_sessions");
    return [];
  },
  browserNavigate: async (sessionId: string, url: string, timeoutMs = 30000) => {
    if (useTauri()) return tauriInvoke("browser_navigate", { sessionId, url, timeoutMs });
    return { ok: false, notAttached: true, url, title: null, engine: null, reason: browserReason };
  },
  browserAct: async (args: Record<string, unknown>) => {
    if (useTauri()) return tauriInvoke("browser_act", args);
    return { ok: false, notAttached: true, reason: browserReason };
  },
  browserScreenshot: async (sessionId: string, fullPage = false) => {
    if (useTauri()) return tauriInvoke("browser_screenshot", { sessionId, fullPage });
    return { ok: false, notAttached: true, path: null, reason: browserReason };
  },
  browserConsole: async (sessionId: string) => {
    if (useTauri()) return tauriInvoke("browser_console", { sessionId });
    return { ok: false, notAttached: true, console: [], networkFailures: [], reason: browserReason };
  },

  /* There is no external execution bridge.
   *
   * Every agent runs in-process on the owner's own provider key. Nothing in this
   * bridge can spawn a third-party process, and the methods that once did are
   * gone rather than stubbed — there is no native command left to call.
   * probe/noExternalCli.test.ts pins the absence.
   */

  /* -------------------------------------------------------------- git
   * Every one of these throws in a browser build rather than returning an empty result. A git panel
   * that renders "no changes" when it never spoke to git is the exact false-success pattern the product forbids:
   * the user cannot tell "clean tree" from "never checked". The thrown message is the label.
   */
  gitIsRepo: async (cwd: string) => {
    if (useTauri()) return tauriInvoke("git_is_repo", { cwd });
    throw new Error("git needs the native desktop build: a browser cannot see your repository.");
  },
  gitStatus: async (cwd: string) => {
    if (useTauri()) return tauriInvoke("git_status", { cwd });
    throw new Error("git needs the native desktop build: a browser cannot see your repository.");
  },
  gitDiff: async (cwd: string, staged = false, budget?: number) => {
    if (useTauri()) return tauriInvoke("git_diff", { cwd, staged, budget: budget ?? null });
    throw new Error("git needs the native desktop build: a browser cannot see your repository.");
  },
  gitHead: async (cwd: string) => {
    if (useTauri()) return tauriInvoke("git_head", { cwd });
    throw new Error("git needs the native desktop build: a browser cannot see your repository.");
  },
  gitBranch: async (cwd: string) => {
    if (useTauri()) return tauriInvoke("git_branch", { cwd });
    throw new Error("git needs the native desktop build: a browser cannot see your repository.");
  },
  /**
   * Did a seat that was told to be read-only actually refrain from writing?
   * A harness flag is a promise; this is the check. Three-way on purpose — see `git.rs`.
   */
  gitReadOnlyCheck: async (cwd: string) => {
    if (useTauri()) return tauriInvoke("git_read_only_check", { cwd });
    throw new Error("git needs the native desktop build: a browser cannot see your repository.");
  },

  packageExport: async (workflowId: string, includeHistory: boolean) => {
    if (useTauri()) return tauriInvoke("package_export", { workflowId, includeHistory });
    const wf = localDb.workflowGet(workflowId);
    return {
      packageFormat: 1,
      exportedAt: new Date().toISOString(),
      application: "SelfImpulse",
      version: ENGINE_VERSION,
      workflow: { name: wf.name, description: wf.description, graph: wf.graph },
      history: [],
      secretsIncluded: false,
    };
  },
  packageImport: async (pkg: unknown) => {
    if (useTauri()) return tauriInvoke("package_import", { pkg });
    const p = pkg as { application?: string; workflow?: { name: string; description?: string; graph: WorkflowGraph } };
    // The export names SelfImpulse; packages written before the rename say "VH" and still import.
    if ((p.application !== "SelfImpulse" && p.application !== "VH") || !p.workflow) throw new Error("package rejected");
    const created = localDb.workflowCreate(`${p.workflow.name} (imported)`, p.workflow.description ?? "");
    localDb.workflowSave(created.id, `${p.workflow.name} (imported)`, p.workflow.description ?? "", p.workflow.graph);
    return { id: created.id, validated: true };
  },

  controlValidate: async (workflowId: string) => {
    if (useTauri()) return tauriInvoke("control_validate_graph", { workflowId });
    return { valid: true, errors: [] };
  },
  controlConnectPorts: async (args: { workflowId: string; sourceNodeId: string; sourcePortId: string; targetNodeId: string; targetPortId: string }): Promise<Connection> => {
    if (useTauri()) return tauriInvoke("control_connect_ports", args);
    throw new Error("use graph store connect");
  },
};

export function nodeKeyOf(workflowId: string, nodeId: string): string {
  return `${workflowId}:${nodeId}`;
}
