/**
 * SelfImpulse — the MCP market (19.7.0).
 *
 * Users add ANY Model Context Protocol server they want. The market keeps
 * three things honest:
 *
 *   • a CURATED CATALOG of well-known reference servers (name, what it does,
 *     how it launches) — provenance stated, nothing downloaded by the UI;
 *   • a LOCAL REGISTRY of the user's installed servers — command + args or
 *     HTTP URL, env keys recorded BY NAME only (never values), zod-validated;
 *   • an EXPORT that emits a standard `mcpServers` JSON config the real
 *     hosts consume (tools/mcp.mjs, the desktop shell, any MCP client).
 *
 * Honesty floor: the browser registry does not secretly spawn processes.
 * A stdio server is "installed and exported — executes under the host";
 * an HTTP server is validated against the SAME SSRF egress guard every
 * provider call passes, and is "registered — the host bridges calls".
 */

import { z } from "zod";
import { checkEgressUrl } from "../security/guardrail";

const REGISTRY_KEY = "engine.mcpmarket.v1";

/* ── the curated catalog ────────────────────────────────────────────────── */

export interface CatalogServer {
  id: string;
  name: string;
  category: string;
  description: string;
  transport: "stdio" | "http";
  /** stdio launch shape */
  command?: string;
  args?: string[];
  /** http shape */
  url?: string;
  /** env var NAMES the server reads — values are supplied by the user at run time */
  envNames?: string[];
}

/**
 * 20.1 — CATALOG HONESTY.
 *
 * Five of the twelve entries below named packages that upstream has ARCHIVED
 * (modelcontextprotocol/servers → `servers-archived/`, carrying the banner
 * "NO SECURITY GUARANTEES"). Offering them in a catalogue is worse than
 * omitting them: a user picks one, the launch fails or worse succeeds against
 * an unmaintained package, and the failure looks like the app's fault.
 *
 * Upstream now ships SEVEN live reference servers: Everything, Fetch,
 * Filesystem, Git, Memory, Sequential Thinking, Time. Those are the only ones
 * listed as ADOPT here, plus Playwright — which is NOT in upstream's reference
 * set but IS actively maintained by Microsoft and is the browser surface worth
 * offering. Everything that was archived is either removed or, where a real
 * need remains, kept with the honest `unverified` posture.
 *
 * `webfetch` carries a standing warning because upstream's own README says it
 * "can access local/internal IP addresses". This app's SSRF guard validates
 * the SERVER url, not the urls that child process fetches — so the guard does
 * not reach it. That is stated in the description rather than hidden, because a
 * user who cannot see the limitation cannot consent to it.
 */
export interface CatalogServer {
  id: string;
  name: string;
  category: string;
  description: string;
  transport: "stdio" | "http";
  /** stdio launch shape */
  command?: string;
  args?: string[];
  /** http shape */
  url?: string;
  /** env var NAMES the server reads — values are supplied by the user at run time */
  envNames?: string[];
  /**
   * 20.1 — provenance. `verified` means the package was confirmed live in
   * upstream's own repository at the time of writing. `unverified` means it
   * could not be confirmed and the user should treat it as experimental.
   */
  status?: "verified" | "unverified";
  /** A caveat the user must see before enabling it. Rendered by the MCP screen. */
  caveat?: string;
}

export const MCP_CATALOG: CatalogServer[] = [
  {
    id: "filesystem", name: "Filesystem", category: "workspace", status: "verified",
    description: "Read/write/search files under a rooted directory you name.",
    transport: "stdio", command: "npx", args: ["-y", "@modelcontextprotocol/server-filesystem", "<ROOT>"],
  },
  {
    id: "git", name: "Git", category: "workspace", status: "verified",
    description: "Repo status, diffs, log and commits through MCP tools.",
    transport: "stdio", command: "uvx", args: ["mcp-server-git", "--repository", "<PATH>"],
    caveat: "Upstream describes this reference server as early development. Read tools are safe; writes (git_commit, git_add) are governed by the same human gate as every other risky tool call.",
  },
  {
    id: "github", name: "GitHub", category: "devtools", status: "unverified",
    description: "Issues, PRs, repos and search via the official GitHub MCP server.",
    transport: "http", url: "https://api.githubcopilot.com/mcp/", envNames: ["GITHUB_PERSONAL_ACCESS_TOKEN"],
    caveat: "This is a NETWORK service on a remote host: model output can leave this machine. It is refused unless you have deliberately enabled network egress. A token is required.",
  },
  {
    id: "webfetch", name: "Web Fetch", category: "web", status: "verified",
    description: "Fetch a page and extract readable markdown from it.",
    transport: "stdio", command: "uvx", args: ["mcp-server-fetch"],
    caveat: "Upstream warns this server \"can access local/internal IP addresses\". SelfImpulse's SSRF guard checks the SERVER's url, not the urls that process fetches, so the guard does NOT reach it. Use only when you accept that a crafted page could induce a request to a local address.",
  },
  {
    id: "memory", name: "Memory", category: "knowledge", status: "verified",
    description: "A persistent knowledge-graph memory for the crew.",
    transport: "stdio", command: "npx", args: ["-y", "@modelcontextprotocol/server-memory"],
  },
  {
    id: "sequentialthinking", name: "Sequential Thinking", category: "reasoning", status: "verified",
    description: "Structured step-by-step reasoning scaffolding for hard tasks.",
    transport: "stdio", command: "npx", args: ["-y", "@modelcontextprotocol/server-sequentialthinking"],
  },
  {
    id: "time", name: "Time", category: "utility", status: "verified",
    description: "Current time and conversions across timezones.",
    transport: "stdio", command: "uvx", args: ["mcp-server-time"],
  },
  {
    id: "playwright", name: "Playwright Browser", category: "web", status: "verified",
    description: "Drive a real browser: navigate, click, snapshot, screenshot.",
    transport: "stdio", command: "npx", args: ["-y", "@playwright/mcp@latest"],
    caveat: "NOT an upstream reference server — maintained by Microsoft. Browser schemas are large, so this can be slow to load into context. Read tools only are recommended; anything that submits or purchases needs the human gate.",
  },
];

/**
 * 20.1 — packages that MUST NOT reappear in the catalogue.
 *
 * Archived upstream, with "NO SECURITY GUARANTEES". Listing one again would
 * reintroduce the exact defect this set was built to stop, so the exclusion is
 * pinned by probe/mcpMarket.test.ts rather than left to review.
 */
export const ARCHIVED_MCP_PACKAGES: readonly string[] = [
  "@modelcontextprotocol/server-postgres",
  "@modelcontextprotocol/server-sqlite",
  "@modelcontextprotocol/server-slack",
  "@modelcontextprotocol/server-puppeteer",
  "@modelcontextprotocol/server-brave-search",
  "mcp-server-sqlite",
];

/* ── the local registry ─────────────────────────────────────────────────── */

export const McpServerSchema = z.object({
  id: z.string().min(1).max(80),
  name: z.string().min(1).max(80),
  transport: z.enum(["stdio", "http"]),
  command: z.string().max(400).optional(),
  args: z.array(z.string().max(400)).max(32).optional(),
  url: z.string().max(600).optional(),
  envNames: z.array(z.string().max(120)).max(16).optional(),
  enabled: z.boolean(),
  addedAt: z.string(),
  fromCatalog: z.string().max(80).nullable(),
  note: z.string().max(400).optional(),
});

export type McpServer = z.infer<typeof McpServerSchema>;

export type InstallResult =
  | { ok: true; server: McpServer }
  | { ok: false; refusal: string };

function storage(): Storage | null {
  try { return globalThis.localStorage ?? null; } catch { return null; }
}

/* No storage (plain Node, sandboxed quirks) ⇒ the registry lives in this
 * module's memory for the process lifetime — stated, not hidden. */
let memRegistry: McpServer[] | null = null;

function loadRegistry(): McpServer[] {
  const s = storage();
  if (!s) {
    if (!memRegistry) memRegistry = [];
    return memRegistry;
  }
  try {
    const raw = JSON.parse(s.getItem(REGISTRY_KEY) ?? "[]") as unknown;
    if (!Array.isArray(raw)) { if (!memRegistry) memRegistry = []; return memRegistry; }
    const parsed = raw.map((r) => McpServerSchema.safeParse(r)).filter((r) => r.success).map((r) => r.data);
    memRegistry = parsed;
    return parsed;
  } catch {
    if (!memRegistry) memRegistry = [];
    return memRegistry;
  }
}

function saveRegistry(list: McpServer[]): void {
  memRegistry = list;
  const s = storage();
  if (!s) return;
  try { s.setItem(REGISTRY_KEY, JSON.stringify(list.slice(0, 64))); } catch { /* quota — memory copy stands */ }
}

export function catalogServers(): CatalogServer[] {
  return MCP_CATALOG.map((c) => ({ ...c }));
}

export function listInstalled(): McpServer[] {
  return loadRegistry();
}

function slugify(name: string): string {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
  return base || "server";
}

/** Install from the catalog or a user form. Every refusal is in words. */
export function installServer(input: {
  name: string;
  transport: "stdio" | "http";
  command?: string;
  args?: string[];
  url?: string;
  envNames?: string[];
  fromCatalogId?: string;
  note?: string;
}, now: () => Date = () => new Date()): InstallResult {
  const name = input.name.trim();
  if (!name) return { ok: false, refusal: "a server needs a name — nothing was installed" };

  const reg = loadRegistry();
  if (reg.length >= 64) return { ok: false, refusal: "the local registry is capped at 64 servers — remove one first" };

  let candidate: McpServer;

  if (input.transport === "http") {
    const url = (input.url ?? "").trim();
    if (!url) return { ok: false, refusal: "an HTTP MCP server needs a URL — nothing was installed" };
    const egress = checkEgressUrl(url);
    if (!egress.ok) return { ok: false, refusal: `URL refused by the same SSRF egress guard every provider call passes: ${egress.reason}` };
    candidate = {
      id: slugify(name), name, transport: "http", url, enabled: true,
      envNames: (input.envNames ?? []).map((v) => v.trim()).filter(Boolean).slice(0, 16),
      addedAt: now().toISOString(), fromCatalog: input.fromCatalogId ?? null, note: input.note?.slice(0, 400),
    };
  } else {
    const command = (input.command ?? "").trim();
    if (!command) return { ok: false, refusal: "a stdio MCP server needs a command to launch — nothing was installed" };
    if (/^sudo\b/.test(command) || /\brm\s+-rf\b/.test(command)) {
      return { ok: false, refusal: "this command shape is refused at the market — register it with your host directly if you truly mean it" };
    }
    candidate = {
      id: slugify(name), name, transport: "stdio", command,
      args: (input.args ?? []).map((v) => String(v).trim()).filter(Boolean).slice(0, 32),
      enabled: true,
      envNames: (input.envNames ?? []).map((v) => v.trim()).filter(Boolean).slice(0, 16),
      addedAt: now().toISOString(), fromCatalog: input.fromCatalogId ?? null, note: input.note?.slice(0, 400),
    };
  }

  const parsed = McpServerSchema.safeParse(candidate);
  if (!parsed.success) return { ok: false, refusal: `the record did not validate: ${parsed.error.issues[0]?.message ?? "unknown field error"}` };

  const existing = reg.findIndex((r) => r.id === candidate.id);
  if (existing >= 0) reg[existing] = candidate; else reg.push(candidate);
  saveRegistry(reg);
  return { ok: true, server: candidate };
}

export function uninstallServer(id: string): boolean {
  const reg = loadRegistry();
  const next = reg.filter((r) => r.id !== id);
  if (next.length === reg.length) return false;
  saveRegistry(next);
  return true;
}

export function setServerEnabled(id: string, enabled: boolean): McpServer | null {
  const reg = loadRegistry();
  const at = reg.findIndex((r) => r.id === id);
  if (at === -1) return null;
  reg[at] = { ...reg[at], enabled };
  saveRegistry(reg);
  return reg[at];
}

/**
 * The standard `mcpServers` export — the shape tools/mcp.mjs, the desktop
 * shell and every MCP client config accepts. Env values are NEVER present;
 * the export names them and the host resolves them from its own keychain.
 */
export function exportMcpJson(): { mcpServers: Record<string, { command?: string; args?: string[]; url?: string; env?: Record<string, string> }> } {
  const out: Record<string, { command?: string; args?: string[]; url?: string; env?: Record<string, string> }> = {};
  for (const s of loadRegistry()) {
    if (!s.enabled) continue;
    if (s.transport === "http") {
      out[s.id] = { url: s.url };
    } else {
      out[s.id] = { command: s.command, args: s.args ?? [] };
    }
    if (s.envNames && s.envNames.length) {
      out[s.id].env = Object.fromEntries(s.envNames.map((n) => [n, `$${n}`]));
    }
  }
  return { mcpServers: out };
}

export function marketStats(): { catalog: number; installed: number; enabled: number } {
  const reg = loadRegistry();
  return { catalog: MCP_CATALOG.length, installed: reg.length, enabled: reg.filter((r) => r.enabled).length };
}

export function clearMarket(): void {
  const s = storage();
  if (s) s.removeItem(REGISTRY_KEY);
  memRegistry = null;
}
