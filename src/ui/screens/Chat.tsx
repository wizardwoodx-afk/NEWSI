import React, { useEffect, useRef, useState } from "react";
import { useVh } from "../store";
import { Composer } from "./Composer";
import { GateCard } from "./GateCard";

/** The conversation view — reached from Work ("Read the answer") or from Memory. */
export function Chat({ title }: { title: string }): React.ReactElement {
  const { msgs, busy, send, go, openSession, gate, addFiles } = useVh();
  const [draft, setDraft] = useState("");
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [msgs.length, gate]);

  /* One polite live region, and only one sentence in it: a gate, then a newly
     arrived message, then that a run started. Never the rotating status text —
     a region re-firing every couple of seconds is unusable under a screen reader. */
  const [announced, setAnnounced] = useState("");
  /* Seeded with the newest existing message so a cold open does not read the backlog aloud. */
  const spokenMsg = useRef<number>(msgs.length > 0 ? msgs[msgs.length - 1]!.id : 0);
  const wasBusy = useRef(busy);
  useEffect(() => {
    const enteredBusy = busy && !wasBusy.current;
    wasBusy.current = busy;
    if (gate) { setAnnounced(`Your approval is needed. ${gate.ask.summary}`); return; }
    const last = msgs[msgs.length - 1];
    if (last && last.id !== spokenMsg.current) {
      spokenMsg.current = last.id;
      setAnnounced(`${last.role === "user" ? "You said" : `${title} answered`}: ${last.text}`);
      return;
    }
    if (enteredBusy) setAnnounced(`${title} is working.`);
  }, [gate, busy, msgs, title]);

  const fmt = (iso: string) => { try { return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); } catch { return ""; } };
  const fromMemory = !!openSession;
  return (
    <>
      <header className="top"><h2>{openSession?.title ?? "Conversation"}</h2>
        <div className="right"><button className="btn sm ghost" onClick={() => go(fromMemory ? "memory" : "work")}>{fromMemory ? "Back to memory" : "Back to work"}</button>{fromMemory && <button className="btn sm ghost" onClick={() => go("work")}>Watch the work</button>}</div></header>
      <div className="scroll">
        {/* The region is mounted EMPTY, before the transcript: a live region inserted
            at the same instant as its own content is routinely silent. It is `.sr`
            because it duplicates what the transcript already shows. `aria-live` on
            `.thread` was rejected — it would re-read the whole history on every
            arriving message. */}
        <p className="sr" role="status" aria-live="polite" aria-atomic="true">{announced}</p>
        <div className="thread">
        {msgs.length === 0 && <div className="empty"><h3>Nothing here yet</h3></div>}
        {msgs.map((m) => (
          <div key={m.id} className={`msg ${m.role === "user" ? "user" : ""}`}>
            <span className="av" aria-hidden>{m.role === "user" ? "Y" : title[0]}</span>
            <div>
              <div className="who"><b>{m.role === "user" ? "You" : title}</b> · {fmt(m.at)}{m.rehydratedFrom ? <> · <span className="faint">continuing “{m.rehydratedFrom}”</span></> : null}</div>
              <p>{m.text}</p>
              {m.resp && (
                <div className="meta">
                  <span className={`pill ${m.resp.outcome === "refused" ? "bad" : m.resp.executed ? "ok" : "warn"}`}>{m.resp.outcome}</span>
                  {m.resp.specialistIds.length > 0 && <span className="pill">{m.resp.specialistIds.length} agent{m.resp.specialistIds.length === 1 ? "" : "s"}</span>}
                  {m.tok && m.tok.savedTokens > 0 && <span className="pill">−{m.tok.savedTokens} tokens</span>}
                  {m.resp.provenanceDigest && <span className="pill mono">{m.resp.provenanceDigest.slice(0, 8)}…</span>}
                </div>
              )}
            </div>
          </div>
        ))}
        {gate && <div className="msg"><span className="av" aria-hidden>{title[0]}</span><div><GateCard /></div></div>}
        {busy && !gate && (
          <div className="msg"><span className="av" aria-hidden>{title[0]}</span><div>
            <div className="who"><b>{title}</b></div>
            <p className="faint">Working</p>
          </div></div>
        )}
        <div ref={end} />
      </div></div>
      <div className="dock"><Composer small value={draft} onChange={setDraft} onSend={() => { void send(draft); setDraft(""); }} busy={busy} placeholder="Continue this conversation…" onFiles={(files) => addFiles(files)} /></div>
    </>
  );
}
