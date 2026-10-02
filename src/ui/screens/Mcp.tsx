import React, { useCallback, useEffect, useState } from "react";
import { ipc, useTauri, type McpServerSaveInput } from "../../ipc/client";
import type { McpServerEntry } from "../../domain/types";

/**
 * The MCP surface.
 *
 * The native half of this already existed and worked: five Tauri commands
 * (`mcp_server_list`, `mcp_server_save`, `mcp_server_remove`,
 * `mcp_connect_test`, `mcp_call`), a Rust stdio host that performs a real
 * `initialize` / `tools/list` / `tools/call` handshake, and ipc client wrappers
 * for all five. What was missing was the page those wrappers were written for —
 * `McpPage` was named in the ipc client's own comments and had never been
 * built. Until now the whole capability was reachable only by editing the
 * database by hand.
 *
 * Two rules this screen follows:
 *
 *  1. **Nothing is reported before it happened.** A server reads "connected"
 *     only when the native host returned a JSON-RPC reply. There is no
 *     optimistic state and no tool count that was not counted.
 *
 *  2. **A failure is shown, not swallowed.** `lastError` is displayed verbatim.
 *     A server that cannot start is a fact about the machine, and hiding it
 *     makes a broken configuration look like an empty one.
 */

export interface ConnectResult {
  connected: boolean;
  toolCount: number;
  lastError?: string | null;
  name?: string;
  transport?: string;
  tools?: Array<{ name: string; description?: string }> | null;
  notImplementedTools?: string[] | null;
}

function parseJson(text: string): { ok: true; value: unknown } | { ok: false; error: string } {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "not valid JSON" };
  }
}

/** One-command presets for the official reference MCP servers. Any runnable
 * command works — a preset is just a filled-in form, never a special path. */
const PRESETS: Array<{ id: string; label: string; desc: string; command: string; args: string }> = [
  { id: "filesystem", label: "Files", desc: "read & write files in a folder you choose", command: "npx", args: "-y @modelcontextprotocol/server-filesystem ." },
  { id: "memory", label: "Memory", desc: "a persistent knowledge graph the crew can query", command: "npx", args: "-y @modelcontextprotocol/server-memory" },
  { id: "git", label: "Git", desc: "commits, branches and history in your repo", command: "uvx", args: "mcp-server-git --repository ." },
  { id: "fetch", label: "Fetch", desc: "let the crew read a web page you point at", command: "uvx", args: "mcp-server-fetch" },
  { id: "time", label: "Time", desc: "clocks and timezones, done right", command: "uvx", args: "mcp-server-time" },
  { id: "thinking", label: "Deep think", desc: "step-by-step structured reasoning tool", command: "npx", args: "-y @modelcontextprotocol/server-sequential-thinking" },
];

export function Mcp(): React.ReactElement {
  const native = useTauri();
  const [servers, setServers] = useState<McpServerEntry[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [probe, setProbe] = useState<Record<string, ConnectResult>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [args, setArgs] = useState("{}");
  const [result, setResult] = useState<{ tool: string; body: string } | null>(null);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<McpServerSaveInput>({ name: "", command: "", args: [], network: true });
  /* Registering or removing a program now opens a NATIVE confirmation. Declining it (or the allow-list
     refusing the program) rejects the call — that is an answer to show, not an unhandled rejection. */
  const [notice, setNotice] = useState<{ kind: "ok" | "bad"; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      setServers(await ipc.mcpServerList());
      setLoadError(null);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e));
      setServers([]);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const test = useCallback(async (id: string) => {
    setBusy(id);
    try {
      // The await has to happen before the updater, not inside it: the updater is
      // a plain (non-async) function, so awaiting in its body is a syntax error.
      const outcome = (await ipc.mcpConnectTest(id)) as unknown as ConnectResult;
      setProbe((p) => ({ ...p, [id]: outcome }));
    } catch (e) {
      setProbe((p) => ({
        ...p,
        [id]: { connected: false, toolCount: 0, lastError: e instanceof Error ? e.message : String(e) },
      }));
    } finally {
      setBusy(null);
    }
  }, []);

  const call = useCallback(async (id: string, tool: string) => {
    const parsed = parseJson(args);
    if (!parsed.ok) {
      setResult({ tool, body: `Arguments are not valid JSON: ${parsed.error}` });
      return;
    }
    setBusy(id);
    try {
      const r = await ipc.mcpCall(id, tool, parsed.value);
      setResult({ tool, body: JSON.stringify(r, null, 2) });
    } catch (e) {
      setResult({ tool, body: `Call failed: ${e instanceof Error ? e.message : String(e)}` });
    } finally {
      setBusy(null);
    }
  }, [args]);

  const save = useCallback(async () => {
    if (!draft.name.trim() || !draft.command?.trim()) return;
    setBusy("save");
    setNotice(null);
    try {
      const r = await ipc.mcpServerSave({ ...draft, name: draft.name.trim(), command: draft.command.trim() });
      setAdding(false);
      setDraft({ name: "", command: "", args: [], network: true });
      setNotice(
        native && r && (r as { approved?: boolean }).approved === false
          ? { kind: "bad", text: "Saved, but NOT approved — it cannot run until a native confirmation approves this program." }
          : { kind: "ok", text: native ? "Saved and approved — this exact program may now run." : "Saved." },
      );
      await load();
    } catch (e) {
      setNotice({ kind: "bad", text: `Not saved — ${e instanceof Error ? e.message : String(e)}` });
    } finally {
      setBusy(null);
    }
  }, [draft, load, native]);

  /** Re-submit a stored server unchanged: the native side asks the human to approve exactly that program. */
  const approve = useCallback(async (s: McpServerEntry) => {
    setBusy(s.id);
    setNotice(null);
    try {
      await ipc.mcpServerSave({
        id: s.id, name: s.name, command: s.config?.command ?? "", args: s.config?.args ?? [],
        enabled: s.config?.enabled, pinned: s.config?.pinned, network: s.config?.network,
      });
      setNotice({ kind: "ok", text: `"${s.name}" approved — this exact program may now run.` });
      await load();
    } catch (e) {
      setNotice({ kind: "bad", text: `Not approved — ${e instanceof Error ? e.message : String(e)}` });
    } finally {
      setBusy(null);
    }
  }, [load]);

  const remove = useCallback(async (id: string) => {
    setBusy(id);
    setNotice(null);
    try {
      await ipc.mcpServerRemove(id);
      setProbe((p) => { const n = { ...p }; delete n[id]; return n; });
      await load();
    } catch (e) {
      setNotice({ kind: "bad", text: `Not removed — ${e instanceof Error ? e.message : String(e)}` });
    } finally {
      setBusy(null);
    }
  }, [load]);

  const rows = servers ?? [];

  return (
    <>
      <section className="sgroup">
        <h3>Tool servers (MCP)</h3>
        <p className="lead">
          Give your crew extra abilities — read files, use git, check the time.
          Pick a ready-made one below, or connect <b>any</b> MCP server: if it can
          run as a command on this machine, one line is all it takes. Tools are
          counted only after a real handshake, never promised in advance.
        </p>

        {!native && (
          <div className="note warn">
            Browser preview — servers run as local processes, so connecting needs the
            desktop build. Nothing below has been contacted.
          </div>
        )}
        {loadError && <div className="note bad">Could not read the server list: {loadError}</div>}
        {notice && <div className={`note ${notice.kind === "ok" ? "ok" : "bad"}`}>{notice.text}</div>}

        {rows.length === 0 && !loadError && (
          <div className="empty">
            <h3>No servers registered</h3>
            <p>The crew is using its built-in tools only.</p>
          </div>
        )}

        {rows.map((s) => {
          const r = probe[s.id];
          const enabled = s.config?.enabled ?? false;
          // `pinned` lives under `config`, not on the record: a pinned server is
          // part of the seeded catalog and has no Remove button, so a user
          // cannot delete the control plane out from under the app.
          const pinned = s.config?.pinned ?? false;
          return (
            <div key={s.id} className="row" style={{ flexDirection: "column", alignItems: "stretch", gap: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <b>{s.name}</b>
                <span className="mono faint">{s.id}</span>
                <span className={`dot ${r ? (r.connected ? "ok" : "refused") : "pending"}`} />
                <span className="hint" style={{ marginLeft: "auto" }}>
                  {r
                    ? r.connected
                      ? `connected · ${r.toolCount} tool${r.toolCount === 1 ? "" : "s"}`
                      : "not connected"
                    : enabled
                      ? "enabled · not yet tested"
                      : "disabled"}
                </span>
                <button className="btn sm" disabled={busy === s.id || !native}
                        onClick={() => void test(s.id)}>
                  {busy === s.id ? "Testing…" : "Test connection"}
                </button>
                {!pinned && (
                  <button className="btn sm danger" disabled={busy === s.id}
                          onClick={() => void remove(s.id)}>Remove</button>
                )}
              </div>
              <div className="mono faint">
                {s.config?.command} {(s.config?.args ?? []).join(" ")}
                {native && <span className="hint"> · network {s.config?.network === false ? "denied" : "allowed"}</span>}
              </div>
              {native && s.approved === false && !pinned && (
                <div className="note warn" style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ flex: 1 }}>
                    Not approved — this program has not been confirmed in a native dialog, so it cannot run.
                  </span>
                  <button className="btn sm" disabled={busy === s.id} onClick={() => void approve(s)}>Approve…</button>
                </div>
              )}
              {r?.lastError && <div className="note bad">{String(r.lastError)}</div>}
              {r && !r.connected && !r.lastError && (
                <div className="note warn">The host got no JSON-RPC reply.</div>
              )}

              {r?.connected && (
                <>
                  <div className="acts">
                    <button className="btn sm ghost" onClick={() => setOpen(open === s.id ? null : s.id)}>
                      {open === s.id ? "Hide tools" : `Browse ${r.toolCount} tool${r.toolCount === 1 ? "" : "s"}`}
                    </button>
                  </div>
                  {open === s.id && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 4 }}>
                      {(r.tools ?? []).map((t) => (
                        <div key={t.name} className="row" style={{ marginBottom: 0 }}>
                          <span className="mono">{t.name}</span>
                          <span className="hint" style={{ flex: 1 }}>{t.description ?? "—"}</span>
                          <button className="btn sm" disabled={busy === s.id}
                                  onClick={() => void call(s.id, t.name)}>Call</button>
                        </div>
                      ))}
                      <label className="field" style={{ maxWidth: "none" }}>
                        <span>Arguments (JSON)</span>
                        <input className="input" value={args} onChange={(e) => setArgs(e.target.value)} />
                      </label>
                    </div>
                  )}
                </>
              )}
            </div>
          );
        })}

        {result && (
          <div className="note" style={{ whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
            <b>{result.tool}</b>{"\n"}{result.body}
          </div>
        )}

        <div className="acts">
          <button className="btn ghost" onClick={() => setAdding(!adding)}>
            {adding ? "Cancel" : "+ Connect a tool server"}
          </button>
        </div>

        {adding && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
            <div className="chips" role="listbox" aria-label="Ready-made servers">
              {PRESETS.map((p) => (
                <button key={p.id} type="button" className="chip" title={`${p.command} ${p.args}`}
                        onClick={() => setDraft({ name: p.label, command: p.command, args: p.args.split(/\s+/) })}>
                  <b>{p.label}</b><span>{p.desc}</span>
                </button>
              ))}
            </div>
            <label className="field"><span>Name</span>
              <input className="input" value={draft.name}
                     onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            </label>
            <label className="field"><span>Command <small className="hint" style={{ textTransform: "none", letterSpacing: 0 }}>(anything runnable: npx, uvx, ./your-server)</small></span>
              <input className="input mono" value={draft.command ?? ""}
                     onChange={(e) => setDraft({ ...draft, command: e.target.value })} />
            </label>
            <label className="field"><span>Arguments (space separated)</span>
              <input className="input" value={(draft.args ?? []).join(" ")}
                     onChange={(e) => setDraft({ ...draft, args: e.target.value.split(/\s+/).filter(Boolean) })} />
            </label>
            <label className="field" style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <input type="checkbox" checked={draft.network !== false}
                     onChange={(e) => setDraft({ ...draft, network: e.target.checked })} />
              <span>Allow this server to use the network <small className="hint" style={{ textTransform: "none", letterSpacing: 0 }}>(untick for a server that only works on local files)</small></span>
            </label>
            <div className="acts">
              <button className="btn" disabled={busy === "save" || !draft.name.trim() || !draft.command?.trim()}
                      onClick={() => void save()}>Save server</button>
              <span className="hint">
                Saved servers are listed here until removed. Connecting is always an explicit test.
              </span>
            </div>
          </div>
        )}
      </section>
    </>
  );
}

