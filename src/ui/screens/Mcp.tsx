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

/** One-command presets for the official reference MCP servers — a preset is a
 * filled-in form, never a special path. */
const PRESETS: Array<{ id: string; label: string; command: string; args: string }> = [
  { id: "filesystem", label: "Files", command: "npx", args: "-y @modelcontextprotocol/server-filesystem ." },
  { id: "memory", label: "Memory", command: "npx", args: "-y @modelcontextprotocol/server-memory" },
  { id: "git", label: "Git", command: "uvx", args: "mcp-server-git --repository ." },
  { id: "fetch", label: "Fetch", command: "uvx", args: "mcp-server-fetch" },
  { id: "time", label: "Time", command: "uvx", args: "mcp-server-time" },
  { id: "thinking", label: "Deep think", command: "npx", args: "-y @modelcontextprotocol/server-sequential-thinking" },
];

export function Mcp(): React.ReactElement {
  const native = useTauri();
  const [servers, setServers] = useState<McpServerEntry[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [probe, setProbe] = useState<Record<string, ConnectResult>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [args, setArgs] = useState("{}");
  /* Whether the CURRENT arguments text is known-bad. Set only by the one place
     that knows: the JSON.parse refusal. Without it the field could not be marked
     invalid, so "Arguments are not valid JSON" existed only as a line of output
     in a panel the person editing the field was not on. */
  const [argsBad, setArgsBad] = useState(false);
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
      setArgsBad(true);
      setResult({ tool, body: `Arguments are not valid JSON: ${parsed.error}` });
      return;
    }
    setArgsBad(false);
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
      await ipc.mcpServerSave({ ...draft, name: draft.name.trim(), command: draft.command.trim() });
      setAdding(false);
      setDraft({ name: "", command: "", args: [], network: true });
      /* Confirmation that the save happened, and nothing more. The APPROVAL
         state used to be spelled out here too ("Saved, but NOT approved — it
         cannot run until…"), which put one fact in two places on one screen:
         this notice at the top of the section and the row's own "Not approved"
         line below, in two different sentences. The row owns that state — it
         persists, it sits beside the Approve button that resolves it, and it is
         there whether or not the save happened a second ago. */
      setNotice({ kind: "ok", text: "Saved." });
      await load();
    } catch (e) {
      setNotice({ kind: "bad", text: `Not saved — ${e instanceof Error ? e.message : String(e)}` });
    } finally {
      setBusy(null);
    }
  }, [draft, load]);

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

        {!native && (
          <div className="note warn">
            Servers run as local processes — desktop build only. Nothing below has been contacted.
          </div>
        )}
        {loadError && <div className="note bad">Could not read the server list: {loadError}</div>}
        {notice && <div className={`note ${notice.kind === "ok" ? "ok" : "bad"}`}>{notice.text}</div>}

        {rows.length === 0 && !loadError && (
          <div className="empty">
            <h3>No servers registered</h3>
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
                {/* The dot appears only once a test has actually answered — before
                    that there is no status to show, and a grey dot reads as one. */}
                {r && <span className={`dot ${r.connected ? "ok" : "refused"}`} />}
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
                  <span style={{ flex: 1 }}>Not approved — this program cannot run until you approve it.</span>
                  <button className="btn sm" disabled={busy === s.id} onClick={() => void approve(s)}>Approve…</button>
                </div>
              )}
              {r?.lastError && <div className="note bad">{String(r.lastError)}</div>}
              {r && !r.connected && !r.lastError && (
                <div className="note warn">The server started but did not answer.</div>
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
                        <input className="input mono" aria-invalid={argsBad || undefined} value={args} onChange={(e) => setArgs(e.target.value)} />
                      </label>
                    </div>
                  )}
                </>
              )}
            </div>
          );
        })}

        {result && (
          /* The output of a tool call was the single most important thing on this
             screen and it was completely silent. A status region says it, politely,
             without stealing whatever the person was doing. */
          <div className="note" role="status" style={{ whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
            <b>{result.tool}</b>{"\n"}{result.body}
          </div>
        )}

<div className="acts">
          <button className="btn ghost" onClick={() => setAdding(!adding)} aria-expanded={adding} aria-controls="mcp-add-server">
            {adding ? "Cancel" : "+ Connect a tool server"}
          </button>
        </div>

        {adding && (
          <div id="mcp-add-server" style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
            <div className="chips" role="group" aria-label="Presets">
              {PRESETS.map((p) => (
                <button key={p.id} type="button" className="chip" aria-pressed={draft.command === p.command && draft.name === p.label}
                        title={`${p.command} ${p.args}`}
                        onClick={() => setDraft({ name: p.label, command: p.command, args: p.args.split(/\s+/) })}>
                  <b>{p.label}</b>
                </button>
              ))}
            </div>
            <label className="field"><span>Name</span>
              <input className="input" value={draft.name}
                     onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            </label>
            <label className="field"><span>Command</span>
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
              <span>Allow this server to use the network</span>
            </label>
            <div className="acts">
              <button className="btn" disabled={busy === "save" || !draft.name.trim() || !draft.command?.trim()}
                      onClick={() => void save()}>Save server</button>
            </div>
          </div>
        )}
      </section>
    </>
  );
}

