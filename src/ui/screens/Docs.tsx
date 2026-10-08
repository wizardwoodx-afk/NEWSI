/**
 * SelfImpulse — the Docs door: document → knowledge proposal → human decision.
 *
 * Invariants this surface depends on (all enforced upstream, none re-implemented
 * here):
 *   • `proposeKnowledgeSkill` refuses a document with no extractable structure,
 *     so nothing here summarizes and nothing here accepts a raw blob.
 *   • a proposal is installed only after a human approves it, one per proposal.
 *   • `dataHandling` ("local" | "provider") is printed verbatim: it says whether
 *     the content left the machine. This door takes the mechanical path only.
 *   • dropped files are contained and parsed first (`mission/archiveScan.ts`,
 *     `mission/documentParsers.ts`), then handed to the SAME `proposeKnowledgeSkill`
 *     a pasted paragraph reaches. Caps and refusals belong to `mission/fileIngest.ts`
 *     on the store's call path — this component holds no limits of its own.
 */

import React, { useRef, useState } from "react";
import { useVh } from "../store";
import type { IngestOutcomeSummary } from "../store";

/** What the door reads. A filter list, not a limit: the caps (size, expansion,
 *  entries, depth, time) live in `ingestFile` on the call path, so no caller
 *  walking past this component can bypass them. */
const ACCEPT = ".md,.markdown,.txt,.text,.pdf,.docx,.xlsx,.xlsm,.pptx,.json,.jsonl,.zip,.png,.jpg,.jpeg,application/pdf,application/zip,text/plain,text/markdown,application/json,image/png,image/jpeg";

export function Docs(): React.ReactElement {
  const st = useVh();
  const [text, setText] = useState("");
  const [name, setName] = useState("");
  const [note, setNote] = useState<{ kind: "ok" | "warn"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [dropping, setDropping] = useState(false);
  const file = useRef<HTMLInputElement>(null);

  const rows = st.knowledge.slice().sort((a, b) => (a.provenance.distilledAt < b.provenance.distilledAt ? 1 : -1));
  const proposed = rows.filter((r) => r.status === "proposed");
  const approved = rows.filter((r) => r.status === "approved");
  const filesRefused = st.ingestLog.filter((r) => r.decision === "refused");

  async function propose(): Promise<void> {
    const content = text.trim();
    if (!content || busy) return;
    setBusy(true);
    setNote(null);
    try {
      const r = await st.addDocument(content, name);
      if (r.ok) {
        setText("");
        setName("");
        setNote({ kind: "ok", text: "Proposed. Nothing is installed until you approve it." });
      } else {
        setNote({ kind: "warn", text: r.note });
      }
    } finally {
      setBusy(false);
    }
  }

  /** A drop or a pick goes straight to the store; the verdict is per file and
   *  every file given is reported, including the refused ones. */
  async function takeFiles(list: File[] | FileList): Promise<void> {
    const picked = Array.from(list);
    if (picked.length === 0 || busy) return;
    setBusy(true);
    setNote(null);
    try {
      const payload = await Promise.all(picked.map(async (f) => ({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) })));
      const summary = await st.addFiles(payload);
      const declined = summary.refused.length + summary.structuralRefused.length;
      /* A drop that produced nothing is not a success, and a clean-looking note
         over a partial drop is worse than a warning. */
      setNote({ kind: declined > 0 || summary.proposed.length === 0 ? "warn" : "ok", text: describeDrop(summary) });
    } catch (e) {
      setNote({ kind: "warn", text: `Could not read what you gave it: ${String(e instanceof Error ? e.message : e).slice(0, 160)}` });
    } finally {
      setBusy(false);
    }
  }

  /* One line per drop: what was proposed, what was declined and why. Each clause
     names the first offending file with the engine's reason; the rest are counted,
     since the ledger holds the full list. */
  function describeDrop(s: IngestOutcomeSummary): string {
    const parts: string[] = [];
    if (s.proposed.length > 0) parts.push(`${s.proposed.length} proposed`);
    if (s.structuralRefused.length > 0) parts.push(`${s.structuralRefused.length} declined for want of structure: ${s.structuralRefused[0].file} — ${s.structuralRefused[0].words}`);
    if (s.refused.length > 0) parts.push(`${s.refused.length} refused: ${s.refused[0].file} — ${s.refused[0].words}`);
    if (parts.length === 0) parts.push("Nothing was read");
    return parts.join(" · ");
  }

  function decide(id: string, ok: boolean): void {
    const r = st.decideDocument(id, ok, "");
    setNote(r.ok
      ? { kind: "ok", text: ok ? "Approved — installed." : "Dismissed and recorded." }
      : { kind: "warn", text: r.note });
  }

  const fmt = (iso: string) => { try { const d = new Date(iso); return `${d.toLocaleDateString([], { month: "short", day: "2-digit" })} · ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`; } catch { return "—"; } };

  return (
    <>
      <header className="top"><h2>Docs</h2></header>
      <div className="scroll"><div className="page narrow">
        <div className="kpis">
          <div><b>{proposed.length}</b><span>Waiting on you</span></div>
          <div><b>{approved.length}</b><span>Approved</span></div>
          <div><b>{rows.filter((r) => r.dataHandling === "local").length}</b><span>Stayed on this machine</span></div>
          <div><b>{rows.filter((r) => r.status === "discarded").length}</b><span>Dismissed</span></div>
          <div><b>{filesRefused.length}</b><span>Files refused</span></div>
        </div>

        <div className="card">
          {/* The one drop target. The card that wraps it used to carry a second
              copy of the same three handlers, so two nested zones competed for
              one drag; the visible dashed zone owns the drop. */}
          <div className={`drop${dropping ? " over" : ""}`}
            onDragOver={(e) => { e.preventDefault(); if (!dropping) setDropping(true); }}
            onDragLeave={() => setDropping(false)}
            onDrop={(e) => { e.preventDefault(); setDropping(false); void takeFiles(e.dataTransfer.files); }}>
            <span className="dt">{dropping ? "Release to read them" : "Drop documents here"}</span>
          </div>
          <div className="field"><label className="lbl" htmlFor="doc-name">Source name</label>
            <input id="doc-name" className="input" aria-describedby={note ? "doc-note" : undefined} placeholder="Optional" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="field"><label className="lbl" htmlFor="doc-body">Document</label>
            <textarea id="doc-body" className="input" rows={9} aria-describedby={note ? "doc-chars doc-note" : "doc-chars"} placeholder="Paste the document text"
              value={text} onChange={(e) => setText(e.target.value)} />
          </div>
          <div className="row">
            <button className="btn" onClick={() => void propose()} disabled={busy || text.trim().length < 60}>
              {busy ? "Distilling…" : "Propose knowledge"}
            </button>
            <button className="btn sm" onClick={() => file.current?.click()}>Load a file</button>
            <input ref={file} type="file" multiple aria-label="Choose documents to read" accept={ACCEPT} style={{ display: "none" }}
              onChange={(e) => { void takeFiles(e.target.files ?? []); e.target.value = ""; }} />
            <span className="hint" id="doc-chars">{busy ? "Reading…" : text.trim().length < 60 ? `${text.trim().length}/60 characters` : `${text.trim().length.toLocaleString()} characters`}</span>
          </div>
          {note && <div id="doc-note" className={`note ${note.kind === "warn" ? "warn" : ""}`} role="status">{note.text}</div>}
        </div>

        {rows.length === 0 ? (
          <div className="empty"><h3>No documents yet</h3><p className="hint">Distilling reads structure, not prose, and asks you before anything is installed.</p></div>
        ) : (
          <div className="ledger">
            <div className="lh"><span>When</span><span>Document</span><span>Handling</span><span>Status</span><span /></div>
            {rows.map((r) => (
              <React.Fragment key={r.id}>
                <button className={`lr ${open === r.id ? "open" : ""}`} aria-expanded={open === r.id} onClick={() => setOpen(open === r.id ? null : r.id)}>
                  <span className="mono">{fmt(r.provenance.distilledAt)}</span>
                  <span className="t"><b>{r.title}</b><small>{r.provenance.sourceName || "pasted document"}</small></span>
                  <span className="mono">{r.dataHandling === "local" ? "on this machine" : "provider"}</span>
                  <span className={`pill ${r.status}`}>{r.status === "proposed" ? "waiting" : r.status === "discarded" ? "dismissed" : r.status}</span>
                  <span className={`dot ${r.status === "approved" ? "ok" : r.status === "proposed" ? "pending" : "refused"}`} />
                </button>
                {open === r.id && (
                  <div className="ld">
                    <p><b>{r.summary}</b></p>
                    {r.procedure && <p className="hint">Procedure — {r.procedure}</p>}
                    {r.knownFailureModes && <p className="hint">Known failure modes — {r.knownFailureModes}</p>}
                    <p className="hint">
                      {r.distiller.kind === "llm" ? `LLM harness (${r.distiller.harness})` : "Mechanical — no model was called"}
                      {" · "}
                      {r.dataHandling === "local" ? "never left this machine" : `sent to ${r.providerInfo?.vendor ?? "a model provider"} (${r.providerInfo?.endpointClass ?? "endpoint unknown"})`}
                    </p>
                    <div className="acts">
                      {r.status === "proposed" ? (
                        <>
                          <button className="btn sm" onClick={() => decide(r.id, true)}>Approve</button>
                          <button className="btn sm" onClick={() => decide(r.id, false)}>Dismiss</button>
                        </>
                      ) : (
                        <span className="hint">
                          {r.status === "approved"
                            ? `Approved by ${r.decidedBy ?? "owner"} — installed.`
                            : `Dismissed by ${r.decidedBy ?? "owner"}${r.decidedAt ? ` · ${fmt(r.decidedAt)}` : ""}.`}
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </React.Fragment>
            ))}
          </div>
        )}
      </div></div>
    </>
  );
}
