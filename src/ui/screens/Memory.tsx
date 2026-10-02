import React, { useMemo, useState } from "react";
import { useVh, memoryGraphData, memoryStats, memorySecurity } from "../store";
import { ForceGraph, type FgNode, type FgLink } from "../graph/ForceGraph";
import { dreamStatus, loadDurable, forgetMemory, forgetAllDurable, MIN_EVIDENCE, MIN_SESSIONS, DECAY_GRACE_DAYS, type DurableMemory } from "../../engine/dreaming";
import { dreamTick, dreamCursor, dreamJournal } from "../../engine/dreamBridge";
import { currentSubject } from "../store";

/**
 * MEMORY — a cool, organic cluster of everything the Captain remembers.
 * Sessions are the large nodes; keywords the small ones. Double-click a session to open it.
 */

/**
 * WHAT THE DEPLOYMENT HAS LEARNED.
 *
 * The graph above this panel shows the raw material: sessions and the topics in
 * them. This shows the OUTPUT of consolidation — the few statements that survived
 * repetition, independence and confidence, each carrying how many sightings and
 * how many separate days stand behind it.
 *
 * The second half matters as much as the first. A memory system that only shows
 * what it believes gives a person no way to see that it is being appropriately
 * cautious, and no way to see WHY something they expected is not here. So the
 * candidates that repeated but did not clear a gate are shown too, with the gate
 * that stopped them named in words ("evidence: 2/3 sightings"). Honest silence is
 * a feature; unexplained silence is a bug.
 */
function Learned(): React.ReactElement {
  const [tick, setTick] = React.useState(0);
  /* Whose memory. The ledger has always been per-user, and now the beliefs are
   * too — so the panel asks for this subject's, rather than for whatever the
   * installation happens to hold. */
  const who = currentSubject() ?? "default";
  const st = React.useMemo(() => dreamStatus(who), [tick, who]);
  const live = React.useMemo(() => loadDurable(who).filter((m) => !m.retired), [tick, who]);
  const cursor = React.useMemo(() => dreamCursor(who), [tick, who]);
  /* A row still reading `running` means a pass was interrupted. Said plainly:
   * a memory system that hides an unfinished pass is one nobody can audit. */
  const interrupted = React.useMemo(() => dreamJournal(who).find((r) => r.state === "running"), [tick, who]);

  const run = () => {
    /* The heartbeat's own path, forced: a person pressing the button IS a
     * statement that something has changed, which is exactly what the gap guard
     * is there to wait for. */
    dreamTick(who, undefined, { force: true });
    setTick((n) => n + 1);
  };

  const strength = (m: DurableMemory) => m.strength >= 0.75 ? "well established" : m.strength >= 0.5 ? "settling" : "fading";

  return (
    <div className="card soft" style={{ marginTop: 12 }}>
      <div className="card-b">
        <div className="row" style={{ alignItems: "baseline" }}>
          <b>What the deployment has learned</b>
          <span className="hint" style={{ marginLeft: "auto" }}>
            {st.passes} consolidation {st.passes === 1 ? "pass" : "passes"}
            {cursor?.state === "done" ? ` · last ${new Date(cursor.at).toLocaleString()}` : st.lastPass ? ` · last ${new Date(st.lastPass).toLocaleDateString()}` : ""}
            {st.held > 0 ? ` · ${st.held} held at the gates` : ""}
          </span>
          <button className="btn sm ghost" onClick={run} title="Replay the staged records and re-run the gates">Consolidate now</button>
        </div>

        {live.length === 0 ? (
          <p className="hint" style={{ margin: "10px 0 0" }}>
            Nothing has been learned yet, and that is the honest answer rather than an empty box: a statement is only
            written here once it has been seen at least {MIN_EVIDENCE} times across at least {MIN_SESSIONS} separate days.
            A single rejection is an event, not a preference.
            {st.held > 0 ? ` ${st.held} ${st.held === 1 ? "candidate is" : "candidates are"} being held until then.` : ""}
          </p>
        ) : (
          <div className="dream-list">
            {live.sort((a, b) => b.strength - a.strength).map((m) => (
              <div className="dream-item" key={m.id}>
                <span className={`dream-kind ${m.kind}`}>{m.kind}</span>
                <div className="dream-body">
                  <p className="dream-stmt">{m.statement}</p>
                  <span className="dream-meta">
                    {m.sightings} sightings over {m.days} {m.days === 1 ? "day" : "days"} · {strength(m)} ·{" "}
                    {Math.round(m.strength * 100)}% strength
                  </span>
                </div>
                <button className="btn sm ghost danger" onClick={() => { forgetMemory(m.id, who); setTick((n) => n + 1); }} title="Forget this belief. The records behind it are kept.">Forget</button>
              </div>
            ))}
          </div>
        )}

        {interrupted ? (
          <p className="hint" style={{ marginTop: 10 }}>
            One consolidation {interrupted.state === "running" ? "did not finish" : "is in progress"} — the pass was
            interrupted while it ran, so it was recorded and left alone rather than quietly repeated. The next pass will
            pick up whatever it staged.
          </p>
        ) : null}

        <p className="hint" style={{ marginTop: 10 }}>
          Consolidation runs on the initiative heartbeat whenever autonomy is above zero. A belief is only charged for
          silence after {DECAY_GRACE_DAYS} quiet days, so a schedule can never be what retires it.
        </p>

        {st.retired > 0 ? (
          <p className="hint" style={{ marginTop: 10 }}>
            {st.retired} earlier {st.retired === 1 ? "belief has" : "beliefs have"} been retired — nothing reconfirmed
            them, so they faded rather than staying loud forever. They are kept in the record, not deleted.
          </p>
        ) : null}
      </div>
    </div>
  );
}

export function Memory(): React.ReactElement {
  const { sessions, memOn, setMemory, clearMemory, openConversation, forgetSession, vault } = useVh();
  const [spin, setSpin] = useState(true);
  const [fit, setFit] = useState(0);
  const [sel, setSel] = useState<FgNode | null>(null);
  const [confirm, setConfirm] = useState(false);

  const { nodes, links, stats, sec } = useMemo(() => {
    const g = memoryGraphData(); const stats = memoryStats(); const sec = memorySecurity();
    const nodes: FgNode[] = [];
    const links: FgLink[] = [];
    for (const s of sessions) nodes.push({ id: `s:${s.id}`, name: s.title, kind: "session", val: 4 + Math.min(8, s.messageCount), sub: `${s.messageCount} messages · ${new Date(s.startedAt).toLocaleDateString()}` });
    for (const n of g.nodes) { nodes.push({ id: `k:${n.id}`, name: n.label, kind: "keyword", val: 1 + Math.min(5, n.weight) }); for (const sid of n.sessionIds) if (sessions.some((s) => s.id === sid)) links.push({ source: `s:${sid}`, target: `k:${n.id}` }); }
    for (const e of g.edges) links.push({ source: `k:${e.a}`, target: `k:${e.b}` });
    return { nodes, links, stats, sec };
  }, [sessions]);

  const selSession = sel?.id.startsWith("s:") ? sessions.find((s) => `s:${s.id}` === sel.id) ?? null : null;
  const open = (n: FgNode) => { if (n.id.startsWith("s:")) openConversation(n.id.slice(2)); };

  return (
    <>
      <header className="top"><h2>Memory</h2><span className="sub">everything the crew remembers · {sessions.length} conversation{sessions.length === 1 ? "" : "s"}</span>
        <div className="right"><span className={`pill ${sec.mode === "sealed" ? "ok" : "warn"}`}>{sec.mode === "sealed" ? "encrypted at rest" : sec.mode === "locked" ? "vault locked" : vault.status === "no-passphrase" ? "on device · no vault" : "plaintext on device"}</span><label className="switch"><input type="checkbox" checked={memOn} onChange={(e) => setMemory(e.target.checked)} /><i /><span>Remember</span></label></div></header>
      {nodes.length === 0 ? (
        <div className="scroll"><div className="empty" style={{ height: "100%" }}><h3>Nothing remembered yet</h3><p>{memOn ? "Conversations you have with the Captain will cluster here by topic — nothing leaves this device." : "Memory is off. Turn it on to keep conversations on this device."}</p></div></div>
      ) : (
        <div className="graph-wrap memory">
          <ForceGraph mode="memory" nodes={nodes} links={links} autoRotate={spin} fitSignal={fit} onNodeClick={setSel} onNodeDoubleClick={open} />
          <div className="hud">
            <div className="card"><div className="card-b">
              <span className="mode-tag memory"><i />Memory graph · frosted cluster · no arrows</span>
              <div className="klist" style={{ marginTop: 8 }}>
                <div><span>Conversations</span><span>{sessions.length}</span></div>
                <div><span>Topics</span><span>{stats.nodes}</span></div>
                <div><span>Links</span><span>{stats.edges}</span></div>
                <div><span>At rest</span><span>{sec.mode}</span></div>
              </div>
              <div className="legend memory"><span><i style={{ background: "#E9EBEE" }} />conversations</span><span><i style={{ background: "#AEB8B5" }} />topics</span></div>
            </div></div>
          </div>
          <div className="hud-r">
            {sel ? (
              <div className="card"><div className="card-b">
                <span className="lbl">{sel.kind === "session" ? "Conversation" : "Topic"}</span>
                <h3 style={{ margin: "4px 0 2px" }}>{sel.name}</h3>
                {sel.sub && <p className="faint" style={{ margin: 0 }}>{sel.sub}</p>}
                {selSession && <>
                  <div className="tags">{selSession.keywords.slice(0, 8).map((k) => <span key={k}>{k}</span>)}</div>
                  <div className="acts"><button className="btn primary sm" onClick={() => open(sel)}>Open the conversation</button><button className="btn sm ghost" onClick={() => { forgetSession(selSession.id); setSel(null); }}>Forget</button></div>
                </>}
                {!selSession && <p className="hint">Double-click a conversation node to open it.</p>}
              </div></div>
            ) : (
              <div className="card soft"><div className="card-b"><p className="hint" style={{ margin: 0 }}>Click a node for detail · double-click a conversation to open it</p></div></div>
            )}
          </div>
          <div className="graph-foot"><button className="btn sm" onClick={() => setFit((n) => n + 1)}>Fit</button><button className={`btn sm ${spin ? "" : "ghost"}`} onClick={() => setSpin((s) => !s)}>Auto-rotate</button>
            {!confirm ? <button className="btn sm ghost danger" onClick={() => setConfirm(true)}>Forget everything</button> : <><span className="hint">This cannot be undone.</span><button className="btn sm danger" onClick={() => { clearMemory(); forgetAllDurable(); setConfirm(false); setSel(null); }}>Yes, forget</button><button className="btn sm ghost" onClick={() => setConfirm(false)}>Keep</button></>}
          </div>
        </div>
      )}
      <div className="scroll"><div className="page narrow"><Learned /></div></div>
    </>
  );
}
