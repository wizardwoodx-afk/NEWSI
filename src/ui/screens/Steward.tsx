import React, { useEffect, useRef, useState } from "react";
import { useVh } from "../store";
import { Composer } from "./Composer";
import { GateCard } from "./GateCard";

const stamp = (iso: string): string => {
  try { return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); } catch { return ""; }
};

/** "3 days ago", in words. A timestamp you have to subtract is not an answer to
 *  "is this the one I mean". */
function aged(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "today";
  const d = Math.floor(ms / 86_400_000);
  if (d < 1) return "today";
  if (d === 1) return "yesterday";
  if (d < 30) return `${d} days ago`;
  return `${Math.floor(d / 30)} months ago`;
}

export function Steward(): React.ReactElement {
  const { provider, send, busy, gate, msgs, workspace, addFiles, stewardName, sessions, openConversation, forgetSession, newMission, openSession } = useVh();
  const [draft, setDraft] = useState("");
  const [hist, setHist] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [msgs.length, gate]);

  /* The list is the graph's own order reversed: a conversation you had this
     morning is the one you are most likely looking for, and nothing here is
     generated — every row is a chat that actually ran on this machine. */
  const past = [...sessions].sort((a, b) => (a.endedAt ?? a.startedAt) < (b.endedAt ?? b.startedAt) ? 1 : -1);

  return (
    <>
      {/* The shell's own top bar already names this screen, so no second title
          lives here; the header carries only the live status chips. */}
      <header className="top">
        <div className="right">
          <span className={`strip-state ${provider ? "live" : "idle"}`}>
            {provider ? "Connected" : "No provider"}
          </span>
          <span className="strip-ws">{workspace.kind === "browser-memory" ? "Sandbox" : "Local Workspace"}</span>
          {msgs.length > 0 && (
            <button className="btn sm ghost" onClick={() => newMission()}>New chat</button>
          )}
          <button className="btn sm" aria-expanded={hist} aria-controls="si-hist" onClick={() => setHist((v) => !v)}>
            History{sessions.length > 0 ? ` (${sessions.length})` : ""}
          </button>
        </div>
      </header>

      <div className="scroll">
        <div className="wrap wide deck-wrap">
          {openSession && (
            <p className="hint si-continued">Reading “{openSession.title}” — anything you send now continues it.</p>
          )}

          {hist && (
            <div className="si-hist" id="si-hist">
              {past.length === 0 ? (
                <p className="hint">No conversations yet. Every chat you start lands here as soon as it has run.</p>
              ) : (
                <ul>
                  {past.map((s) => (
                    <li key={s.id}>
                      <button className="si-hist-open" onClick={() => { openConversation(s.id); setHist(false); }}>
                        <b>{s.title}</b>
                        <span>{s.messageCount} message{s.messageCount === 1 ? "" : "s"} · {aged(s.endedAt ?? s.startedAt)}</span>
                      </button>
                      <button className="btn sm ghost danger" onClick={() => forgetSession(s.id)}>Forget</button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {msgs.length > 0 ? (
            <div>
              {msgs.map((m) => (
                <div key={m.id} className={`msg ${m.role === "user" ? "user" : ""}`}>
                  <span className="av" aria-hidden>{m.role === "user" ? "Y" : stewardName[0]}</span>
                  <div>
                    <div className="who"><b>{m.role === "user" ? "You" : stewardName}</b> · {stamp(m.at)}{m.rehydratedFrom ? <> · <span className="faint">continuing “{m.rehydratedFrom}”</span></> : null}</div>
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
              {gate && <div className="msg"><span className="av" aria-hidden>{stewardName[0]}</span><div><GateCard /></div></div>}
              {busy && !gate && (
                <div className="msg"><span className="av" aria-hidden>{stewardName[0]}</span><div>
                  <div className="who"><b>{stewardName}</b></div>
                  <p className="faint">Working</p>
                </div></div>
              )}
              <div ref={end} />
            </div>
          ) : (
            <div className="empty"><h3>{sessions.length > 0 ? "This chat is empty" : "Nothing has run on this machine yet"}</h3>
              {/* One next action, and it is the only one there is. With history on
                  the device, "nothing has run" is simply false, so the sentence
                  changes instead of standing contradicted by the list above it. */}
              {sessions.length > 0
                ? <>
                  <p className="hint">Open one of the {sessions.length} conversation{sessions.length === 1 ? "" : "s"} this machine has kept, or describe something new below.</p>
                  <button className="btn primary" onClick={() => setHist(true)}>Open a past conversation</button>
                </>
                : <p className="hint">Describe what you need below. The Captain routes it, and the whole exchange stays on this device.</p>}
            </div>
          )}

          <Composer
            value={draft}
            onChange={setDraft}
            onSend={() => { void send(draft); setDraft(""); }}
            busy={busy}
            placeholder="Describe what you need."
            onFiles={(files) => addFiles(files)}
          />
        </div>
      </div>
    </>
  );
}
