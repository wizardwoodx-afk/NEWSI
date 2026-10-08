import React, { useMemo, useState } from "react";
import { useVh, memorySecurity, currentSubject } from "../store";
import { dreamStatus, loadDurable, forgetMemory, forgetAllDurable, MIN_EVIDENCE, MIN_SESSIONS } from "../../engine/dreaming";
import { dreamTick, dreamCursor } from "../../engine/dreamBridge";

/**
 * MEMORY — what the Captain holds, read as entries: a statement that survived the
 * dreaming gates, or a conversation one came from, each with its provenance in prose.
 * The node cloud is gone; a keyword orbiting another keyword answered nothing.
 */

interface Entry { id: string; tag: string; line: string; meta: string; led: string; body: React.ReactNode }

const day = (iso: string) => { try { return new Date(iso).toLocaleDateString([], { month: "short", day: "2-digit" }); } catch { return "—"; } };
const stamp = (iso: string) => { try { return new Date(iso).toLocaleString([], { month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" }); } catch { return "—"; } };
/** Age is what makes a memory trustworthy or stale, so it is a word, not a date. */
function ago(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "today";
  const d = Math.floor(ms / 86_400_000);
  if (d < 1) return "today";
  if (d === 1) return "yesterday";
  if (d < 30) return `${d} days ago`;
  return `${Math.floor(d / 30)} months ago`;
}

export function Memory(): React.ReactElement {
  const { sessions, memOn, setMemory, clearMemory, openConversation, forgetSession, vault } = useVh();
  const [sel, setSel] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [tick, setTick] = useState(0);
  const who = currentSubject() ?? "default";

  const sec = memorySecurity();
  const st = useMemo(() => dreamStatus(who), [tick, who]);
  const held = useMemo(() => loadDurable(who).filter((m) => !m.retired).sort((a, b) => b.strength - a.strength), [tick, who]);
  const cursor = useMemo(() => dreamCursor(who), [tick, who]);

  /* One thread in the order it is read: what the Captain believes now, then the
     conversations those beliefs were drawn from. */
  const rows: Entry[] = [];
  for (const m of held) {
    rows.push({
      id: `d:${m.id}`, tag: m.kind, line: m.statement, led: m.strength >= 0.5 ? "ok" : "warn",
      meta: `${m.sightings} sighting${m.sightings === 1 ? "" : "s"} over ${m.days} day${m.days === 1 ? "" : "s"} · believed since ${ago(m.ts)} · ${Math.round(m.strength * 100)}% strength`,
      body: <>
        <p className="prose">{m.statement}</p>
        {/* The provenance in the order it was earned: how often, how independent, how
            old, and which pass promoted it. An unreconfirmed belief is not a fact. */}
        <p className="hint">Said {m.sightings} time{m.sightings === 1 ? "" : "s"} on {m.days} separate day{m.days === 1 ? "" : "s"}, last heard {ago(m.lastSeen)}. Promoted {stamp(m.ts)} on consolidation pass {st.passes}.</p>
        {(m.words?.length ?? 0) > 0 && <p className="hint">In the words it was first said: {m.words!.slice(0, 3).map((w) => `“${w}”`).join(" ")}</p>}
        <p className="hint">Evidence — {m.evidence.length ? m.evidence.map((e) => e.slice(0, 12)).join(" · ") : "this entry carries no record ids"}</p>
        <div className="acts"><button className="btn sm ghost danger" onClick={() => { forgetMemory(m.id, who); setTick((n) => n + 1); setSel(null); }}>Forget this</button></div>
      </>,
    });
  }
  if (st.held > 0) {
    rows.push({
      id: "held", tag: "not yet a memory", led: "warn",
      line: `${st.held} pattern${st.held === 1 ? "" : "s"} repeated enough to watch, not enough to believe`,
      meta: `${st.retired} retired${st.retired === 1 ? "" : "s"} for going quiet`,
      body: <p className="hint">A statement becomes a memory only past {MIN_EVIDENCE} sightings on {MIN_SESSIONS} separate days. Below that the Captain keeps counting and says nothing.</p>,
    });
  }
  for (const s of sessions) {
    rows.push({
      id: `s:${s.id}`, tag: "conversation", led: "",
      line: s.title,
      meta: `${s.messageCount} message${s.messageCount === 1 ? "" : "s"} · started ${day(s.startedAt)}${s.endedAt ? ` · last heard ${ago(s.endedAt)}` : ""}`,
      body: <>
        <p className="hint">{s.keywords.length > 0 ? `Remembered under ${s.keywords.slice(0, 8).join(", ")}.` : "No topics were drawn out of this one."}</p>
        <div className="acts">
          <button className="btn primary sm" onClick={() => openConversation(s.id)}>Open the conversation</button>
          <button className="btn sm ghost" onClick={() => { forgetSession(s.id); setSel(null); }}>Forget</button>
        </div>
      </>,
    });
  }

  const consolidate = () => {
    /* Forced: pressing the button is itself a statement that something changed,
       which is exactly what the heartbeat's gap guard waits for. */
    dreamTick(who, undefined, { force: true });
    setTick((n) => n + 1);
  };

  return (
    <>
      <header className="top"><h2>Memory</h2>
        <div className="right"><span className={`pill ${sec.mode === "sealed" ? "ok" : "warn"}`}>{sec.mode === "sealed" ? "encrypted at rest" : sec.mode === "locked" ? "vault locked" : vault.status === "no-passphrase" ? "on device · no vault" : "plaintext on device"}</span><label className="switch"><input type="checkbox" checked={memOn} onChange={(e) => setMemory(e.target.checked)} /><i /><span>Remember</span></label></div></header>

      <div className="scroll"><div className="read-col">
        {rows.length === 0 ? (
          <div className="empty"><h3>Nothing remembered yet</h3>
            {/* The two reasons this is empty are different and only one of them is
                the user's doing, so they are not the same sentence. */}
            <p className="hint">{memOn ? "Nothing has run on this device yet, so there is nothing here. Conversations and the patterns drawn from them appear in this column, oldest last." : "Memory is off, so nothing is kept on this device. Turn it on above and each conversation starts showing up here."}</p>
          </div>
        ) : (
          <>
            <div className="row mem-foot">
              <span className="hint">{st.passes} consolidation {st.passes === 1 ? "pass" : "passes"}{cursor?.state === "done" ? ` · last ${stamp(cursor.at)}` : st.lastPass ? ` · last ${day(st.lastPass)}` : ""}</span>
              <button className="btn sm ghost" onClick={consolidate}>Consolidate now</button>
              {!confirm ? <button className="btn sm ghost danger" onClick={() => setConfirm(true)}>Forget everything</button> : <>
                <span className="hint">This cannot be undone.</span>
                <button className="btn sm danger" onClick={() => { clearMemory(); forgetAllDurable(); setConfirm(false); setSel(null); }}>Yes, forget</button>
                <button className="btn sm ghost" onClick={() => setConfirm(false)}>Keep</button>
              </>}
            </div>
            <ol className="steps">
              {rows.map((r) => (
                <li key={r.id}>
                  <button className="step" aria-expanded={sel === r.id} aria-controls={`mem-${r.id}`} onClick={() => setSel(sel === r.id ? null : r.id)}>
                    <span className="av" aria-hidden />
                    <span className="step-body">
                      <span className="who"><b>{r.tag}</b></span>
                      <span className="say">{r.line}</span>
                    </span>
                    <span className={`led ${r.led}`} aria-hidden />
                  </button>
                  {sel === r.id && <div className="step-open" id={`mem-${r.id}`}>
                    <p className="hint">{r.meta}</p>
                    {r.body}
                  </div>}
                </li>
              ))}
            </ol>
          </>
        )}
      </div></div>
    </>
  );
}
