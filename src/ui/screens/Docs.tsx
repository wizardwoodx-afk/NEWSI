/**
 * SelfImpulse — the Docs door.
 *
 * WHY THIS DOOR EXISTS: the engine has always been able to distill a document
 * into an approved knowledge skill (`mission/knowledgeSkills.ts` —
 * propose → human decision → installed skills), but no surface reached it. The
 * capability was real and unreachable, which is the same as absent. This is the
 * door.
 *
 * WHAT IT WILL NOT DO, by design and enforced upstream:
 *   • it does not summarize. `proposeKnowledgeSkill` refuses a document with no
 *     extractable STRUCTURE (headings, decision rules, frameworks, chapter
 *     hints) and says so in words. A raw blob is refused, not quietly accepted.
 *   • it does not install anything. A proposal waits for the human; approval is
 *     one decision per proposal, recorded with who and when.
 *   • it does not hide where the content went. Every proposal carries
 *     `dataHandling` — "local" when nothing left the machine, "provider" when an
 *     LLM pass sent it to the selected harness — and the door prints it verbatim.
 *
 * THE DISTILLER IS NAMED, NOT IMPLIED (19.7.13). The engine can distill two ways:
 * mechanically (structure is extracted from the text itself — no model is called,
 * and `dataHandling` is "local") or through an LLM harness (`distiller.kind ===
 * "llm"`, which reports its vendor and endpoint class). This door currently takes
 * the MECHANICAL path only: it calls `proposeKnowledgeSkill` without the optional
 * direct provider call, because local execution is a desktop-host capability and the web
 * build has none. That is a deliberate product posture for a security-first tool —
 * the document is not sent anywhere to be understood — and it is stated on the
 * surface rather than left for the user to infer. Wiring the LLM path belongs on
 * the desktop build, where a harness actually exists.
 *
 * FILES ARE NOT A SECOND PATH (§13). PDF, DOCX, XLSX/XLSM, PPTX, JSON, ZIP,
 * Markdown and plain text can be dropped or picked here. Each one is contained
 * first (`mission/archiveScan.ts`: sizes, entry count, names, depth — all
 * checked against what the archive DECLARES, before a byte is inflated), then
 * read into markdown with its real headings (`mission/documentParsers.ts`), then
 * handed to the SAME `proposeKnowledgeSkill` a pasted paragraph reaches. So a
 * 400-slide deck meets the same "structure or refused" rule as a typed note,
 * and there is no file-shaped pipeline that could drift from this one. Caps,
 * refusals and the digest of the rejected bytes belong to `mission/fileIngest.ts`
 * on the store's call path — not to this component, which holds no limits at all.
 */

import React, { useRef, useState } from "react";
import { useVh } from "../store";
import type { IngestOutcomeSummary } from "../store";

/** What the door reads. Kept as a label list, not a limit: the caps — size,
 *  expansion, entries, depth, time — live in `ingestFile`, on the call path
 *  (L12), so a future bulk-import or host path cannot walk past them. */
const ACCEPT = ".md,.markdown,.txt,.text,.pdf,.docx,.xlsx,.xlsm,.pptx,.json,.jsonl,.zip,.png,.jpg,.jpeg,application/pdf,application/zip,text/plain,text/markdown,application/json,image/png,image/jpeg";
const READS = "PDF · DOCX · XLSX/XLSM · PPTX · JSON · ZIP · Markdown · text";

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
        setNote({ kind: "ok", text: `Proposed as ${r.note}. Nothing is installed until you decide — find it below.` });
      } else {
        setNote({ kind: "warn", text: r.note });
      }
    } finally {
      setBusy(false);
    }
  }

  /**
   * A drop or a pick goes straight to the store — the door holds no size, count
   * or time limit of its own, because a limit that only this component enforces
   * is a limit any other caller bypasses. What comes back is a per-file verdict;
   * the door reports every file it was given, including the ones it refused, and
   * refuses to present a partial drop as a clean one.
   */
  async function takeFiles(list: File[] | FileList): Promise<void> {
    const picked = Array.from(list);
    if (picked.length === 0 || busy) return;
    setBusy(true);
    setNote(null);
    try {
      const payload = await Promise.all(picked.map(async (f) => ({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) })));
      const summary = await st.addFiles(payload);
      setNote({ kind: summary.refused.length + summary.structuralRefused.length > 0 ? "warn" : "ok", text: describeDrop(summary) });
    } catch (e) {
      setNote({ kind: "warn", text: `the door could not read what you gave it: ${String(e instanceof Error ? e.message : e).slice(0, 160)}` });
    } finally {
      setBusy(false);
    }
  }

  function describeDrop(s: IngestOutcomeSummary): string {
    const parts: string[] = [];
    if (s.proposed.length > 0) parts.push(`${s.proposed.length} proposed as knowledge (${s.proposed.map((p) => p.file).join(", ")}) — nothing is installed until you decide, below.`);
    if (s.structuralRefused.length > 0) parts.push(`${s.structuralRefused.length} read but declined for want of structure: ${s.structuralRefused[0].file} — ${s.structuralRefused[0].words}`);
    if (s.refused.length > 0) parts.push(`${s.refused.length} refused: ${s.refused[0].file} — ${s.refused[0].words}`);
    if (parts.length === 0) parts.push("nothing was read. Every file you gave is accounted for in the ledger.");
    return parts.join("  ");
  }

  function decide(id: string, ok: boolean): void {
    const r = st.decideDocument(id, ok, "");
    setNote(r.ok
      ? { kind: "ok", text: ok ? `Approved — the knowledge is now an installed skill (${r.note}).` : `Dismissed (${r.note}). One decision per proposal, recorded.` }
      : { kind: "warn", text: r.note });
  }

  const fmt = (iso: string) => { try { const d = new Date(iso); return `${d.toLocaleDateString([], { month: "short", day: "2-digit" })} · ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`; } catch { return "—"; } };

  return (
    <>
      <header className="top"><h2>Docs</h2><span className="sub">teach the crew from your own files — you approve every lesson</span></header>
      <div className="scroll"><div className="page narrow">
        <div className="kpis">
          <div><b>{proposed.length}</b><span>Waiting on you</span></div>
          <div><b>{approved.length}</b><span>Approved</span></div>
          <div><b>{rows.filter((r) => r.dataHandling === "local").length}</b><span>Stayed on this machine</span></div>
          <div><b>{rows.filter((r) => r.status === "discarded").length}</b><span>Dismissed</span></div>
          <div><b>{filesRefused.length}</b><span>Files refused</span></div>
        </div>

        <div className="card"
          onDragOver={(e) => { e.preventDefault(); if (!dropping) setDropping(true); }}
          onDragLeave={() => setDropping(false)}
          onDrop={(e) => { e.preventDefault(); setDropping(false); void takeFiles(e.dataTransfer.files); }}>
          {/* The drop target is the FIRST thing in the card, not a sentence below
              the fold: a capability nothing invites you to use is, to the person
              using it, a capability that does not exist. */}
          <button type="button" className={`drop${dropping ? " over" : ""}`} onClick={() => file.current?.click()}
            onDragOver={(e) => { e.preventDefault(); if (!dropping) setDropping(true); }}
            onDragLeave={() => setDropping(false)}
            onDrop={(e) => { e.preventDefault(); setDropping(false); void takeFiles(e.dataTransfer.files); }}>
            <span className="dt">{dropping ? "Release to read them" : "Drop documents here"}</span>
            <span className="ds">{READS} — or click to choose. Nothing is installed until you approve a proposal.</span>
          </button>
          <div className="field"><label className="lbl" htmlFor="doc-name">Source name</label>
            <input id="doc-name" className="input" aria-describedby={note ? "doc-note" : undefined} placeholder="e.g. Incident review handbook — chapter 3" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="field"><label className="lbl" htmlFor="doc-body">Document</label>
            <textarea id="doc-body" className="input" rows={9} aria-describedby={note ? "doc-chars doc-note" : "doc-chars"} placeholder="Paste the document. Headings, numbered procedure and rules distill well; a wall of prose without structure is refused — truthfully, in words."
              value={text} onChange={(e) => setText(e.target.value)} />
          </div>
          <div className="row">
            <button className="btn" onClick={() => void propose()} disabled={busy || text.trim().length < 60}>
              {busy ? "Distilling…" : "Propose knowledge"}
            </button>
            <button className="btn sm" onClick={() => file.current?.click()}>Load a file</button>
            <input ref={file} type="file" multiple aria-label="Choose documents to read" accept={ACCEPT} style={{ display: "none" }}
              onChange={(e) => { void takeFiles(e.target.files ?? []); e.target.value = ""; }} />
            <span className="hint" id="doc-chars">{busy ? "Reading…" : text.trim().length < 60 ? `${text.trim().length}/60 characters minimum` : `${text.trim().length.toLocaleString()} characters ready`}</span>
          </div>
          <div className="row"><span className="grow hint">An encrypted, oversized or nested archive is refused in words, and the refusal is kept as a receipt.</span></div>
          {/* The one sentence that reports what the door did with what you gave it.
              It was rendered and never spoken, and nothing associated it with the
              two fields it is about — so a refusal was visible and unreachable. It
              is now BOTH: a polite status region (the outcome is announced without
              anyone having to be on the field) and the description of the name and
              document fields (the person editing them is told directly). */}
          {note && <div id="doc-note" className={`note ${note.kind === "warn" ? "warn" : ""}`} role="status">{note.text}</div>}
          {filesRefused.length > 0 && (
            <div className="row"><span className="grow"><span className="t">Last refusal</span>
              <span className="d">{filesRefused[filesRefused.length - 1].file} — {filesRefused[filesRefused.length - 1].words}</span></span>
              <span className="pill mono">{filesRefused[filesRefused.length - 1].code}</span></div>
          )}
        </div>

        {rows.length === 0 ? (
          <div className="empty"><h3>No documents yet</h3><p>Add one above. The Captain distills its <b>structure</b> — procedure, decision rules, failure modes — into a knowledge proposal, then asks you before anything is installed.</p><p className="hint">Extraction is <b>mechanical</b>: the structure is read out of the text on this machine and no model is called. Nothing is summarized and nothing is sent anywhere.</p></div>
        ) : (
          <div className="ledger">
            <div className="lh"><span>When</span><span>Document</span><span>Handling</span><span>Status</span><span /></div>
            {rows.map((r) => (
              <React.Fragment key={r.id}>
                <button className={`lr ${open === r.id ? "open" : ""}`} onClick={() => setOpen(open === r.id ? null : r.id)}>
                  <span className="mono">{fmt(r.provenance.distilledAt)}</span>
                  <span className="t"><b>{r.title}</b><small>{r.provenance.sourceName || "pasted document"}</small></span>
                  <span className="mono">{r.dataHandling === "local" ? "on this machine" : "provider"}</span>
                  <span className={`pill ${r.status}`}>{r.status === "proposed" ? "waiting" : r.status}</span>
                  <span className={`dot ${r.status === "approved" ? "ok" : r.status === "proposed" ? "pending" : "refused"}`} />
                </button>
                {open === r.id && (
                  <div className="ld">
                    <p><b>{r.summary}</b></p>
                    {r.procedure && <p className="hint">Procedure — {r.procedure}</p>}
                    {r.knownFailureModes && <p className="hint">Known failure modes — {r.knownFailureModes}</p>}
                    <p className="hint">
                      <b>Distiller — </b>
                      {r.distiller.kind === "llm"
                        ? `an LLM harness (${r.distiller.harness}) distilled this document.`
                        : "mechanical extraction: the structure was read out of the text itself and no model was called."}
                    </p>
                    <p className="hint">
                      {r.dataHandling === "local"
                        ? "Handling: the content never left this machine."
                        : `Handling: the content was sent to ${r.providerInfo?.vendor ?? "a model provider"} (${r.providerInfo?.endpointClass ?? "endpoint unknown"}).`}
                      {" "}Claims: knowledge is approved human knowledge — it is never counted as a measured effect.
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
                            ? `Approved by ${r.decidedBy ?? "owner"} — installed as a knowledge skill.`
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
