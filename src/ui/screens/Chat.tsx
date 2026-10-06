import React, { useEffect, useRef, useState } from "react";
import { useVh } from "../store";
import { Composer } from "./Composer";
import { GateCard } from "./GateCard";

/** The conversation view — reached from Memory (double-click a node) or "Open the conversation". */
export function Chat({ title }: { title: string }): React.ReactElement {
  const { msgs, busy, send, go, openSession, gate, addFiles } = useVh();
  const [draft, setDraft] = useState("");
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [msgs.length, gate]);

  /* THE THINKING LINE. A single "Working…" told the user nothing and aged
     badly; this rotates a small set of precise, unhurried phrases while a run
     is in flight — the register the product wants: considered, never
     breathless. It cycles only while genuinely busy and never while a gate is
     waiting on a human (the gate has its own words). */
  const THOUGHTS = [
    "Thinking it through",
    "Weighing the next step",
    "Tracing the plan end to end",
    "Checking the move against the guardrails",
    "Shaping an answer worth reading",
  ];
  const [thought, setThought] = useState(0);
  useEffect(() => {
    if (!busy || gate) return;
    setThought(0);
    const t = setInterval(() => setThought((n) => (n + 1) % THOUGHTS.length), 2600);
    return () => clearInterval(t);
  }, [busy, gate]);

  /* WHAT GETS SAID, AND WHAT DOES NOT.
     Priority, most urgent first: a pending gate (it stops the run and demands a
     decision), then the newest message (the actual content), then the run going
     quiet-but-busy.
     The ROTATION IS DELIBERATELY NOT ANNOUNCED. The visible line changes every
     2.6s; a polite region that re-fires on that cadence is not a status update,
     it is a 23-interruptions-a-minute wall of speech that makes the transcript
     unusable. The run's arrival is announced once; the rotating phrases are
     ambience for people who can see them. */
  const [announced, setAnnounced] = useState("");
  /* Seeded with what is ALREADY in the transcript so a cold open (a remembered
     conversation, a rehydrated session) does not read the whole backlog aloud. */
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
    if (enteredBusy) setAnnounced(`${title} is working — ${THOUGHTS[0]}. The live graph is on the Work board.`);
  }, [gate, busy, msgs, title]);

  const fmt = (iso: string) => { try { return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); } catch { return ""; } };
  return (
    <>
      <header className="top"><h2>{openSession?.title ?? "Conversation"}</h2><span className="sub">{openSession ? "from memory" : "this session"}</span>
        <div className="right"><button className="btn sm ghost" onClick={() => go("memory")}>← Back to memory</button><button className="btn sm ghost" onClick={() => go("work")}>Watch the work</button></div></header>
      <div className="scroll">
        {/* THE ANNOUNCER. One polite live region, mounted EMPTY and rendered BEFORE
            the transcript, so the first thing that ever changes is text going into a
            region that was already in the document. That ordering is the whole trick:
            a live region inserted at the same instant as its own content is routinely
            silent, and it is the single most common way a chat becomes mute.
            It is `.sr` (vh.css) rather than visible, because it is a duplicate of
            information the transcript already carries — it exists only to be spoken.
            WHY NOT `aria-live` ON `.thread`: a live region announces its own contents
            on every mutation, and this transcript mutates on every arriving message,
            so the whole history would be re-read aloud each time — the polite region
            becomes a wall of repetition and is unusable. The transcript stays ordinary
            content that a screen-reader user reads at their own pace; this region
            carries ONE line about the newest event only. */}
        <p className="sr" role="status" aria-live="polite" aria-atomic="true">{announced}</p>
        <div className="thread">
        {msgs.length === 0 && <div className="empty"><h3>Nothing here yet</h3><p>Start with the Steward and the conversation will appear here.</p></div>}
        {msgs.map((m) => (
          <div key={m.id} className={`msg ${m.role === "user" ? "user" : ""}`}>
            <span className="av" />
            <div>
              <div className="who"><b>{m.role === "user" ? "You" : title}</b> · {fmt(m.at)}{m.rehydratedFrom ? <> · <span className="faint">continuing “{m.rehydratedFrom}”</span></> : null}</div>
              <p>{m.text}</p>
              {m.resp && (
                <div className="meta">
                  <span className={`pill ${m.resp.outcome === "refused" ? "bad" : m.resp.executed ? "ok" : "warn"}`}>{m.resp.outcome}</span>
                  {m.resp.specialistIds.length > 0 && <span className="pill">{m.resp.specialistIds.length} agent{m.resp.specialistIds.length === 1 ? "" : "s"}</span>}
                  {m.tok && m.tok.savedTokens > 0 && <span className="pill">−{m.tok.savedTokens} tokens</span>}
                  {m.resp.provenanceDigest && <span className="pill mono" title="provenance digest">{m.resp.provenanceDigest.slice(0, 8)}…</span>}
                </div>
              )}
            </div>
          </div>
        ))}
        {gate && <div className="msg"><span className="av" /><div><GateCard /></div></div>}
        {busy && !gate && (
          <div className="msg"><span className="av" /><div>
            <div className="who"><b>{title}</b></div>
            <p className="faint">{THOUGHTS[thought]} — the live graph is on the Work board.</p>
          </div></div>
        )}
        <div ref={end} />
      </div></div>
      {/* §13 — same ingest seam as everywhere else: attach from a conversation,
          get the same caps, receipts and Docs proposals. */}
      <div className="dock"><Composer small value={draft} onChange={setDraft} onSend={() => { void send(draft); setDraft(""); }} busy={busy} placeholder="Continue this conversation…" onFiles={(files) => addFiles(files)} /></div>
    </>
  );
}
