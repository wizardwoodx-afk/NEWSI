import React, { useMemo, useState } from "react";
import { useVh } from "../store";
import { ForceGraph, type FgNode, type FgLink } from "../graph/ForceGraph";
import { GateCard } from "./GateCard";
import { getSpecialist } from "../../engine/registry";
import { homeDesk, deskById, consulForDesk, leadFor } from "../../engine/org";
import { TITLES } from "../../engine/chain";

/**
 * WORK — the user watches the crew work as a top→bottom flow.
 * No transcript, no agent names: You → Captain → Consul → Adept → sub-agents → tools → verify.
 * Built from the real GeneralistResponse (memberRuns, toolReceipts, outcome).
 */
export function Work(): React.ReactElement {
  const { lastResp, busy, gate, msgs, go, stewardName, savedTokens } = useVh();
  const [spin, setSpin] = useState(true);
  const [fit, setFit] = useState(0);

  const lastUser = [...msgs].reverse().find((m) => m.role === "user");
  const { nodes, links, agents, tools, receipts } = useMemo(() => build(lastResp, busy, gate?.ask.action ?? null, stewardName), [lastResp, busy, gate, stewardName]);
  const done = lastResp && !busy;
  const total = Math.max(1, tools + 2);
  const complete = done ? total : Math.min(total - 1, 1 + tools);

  return (
    <>
      <header className="top"><h2>Work</h2><span className="sub">{busy ? "the crew is at work — every step lands in the ledger" : lastResp ? `last run · ${lastResp.outcome}` : "watch your crew work, live"}</span>
        <div className="right">{busy && <span className="pill accent">live</span>}<button className="btn sm" onClick={() => go("steward")}>New mission</button></div></header>

      {!lastResp && !busy && !gate ? (
        <div className="scroll"><div className="empty" style={{ height: "100%" }}><h3>No work yet</h3><p>Ask the Captain for an outcome and you'll watch the crew do it here — every step flowing top to bottom.</p><button className="btn primary" onClick={() => go("steward")}>Go to Captain</button></div></div>
      ) : (
        <div className="graph-wrap work">
          <ForceGraph mode="work" nodes={nodes} links={links} autoRotate={spin} fitSignal={fit} />
          <div className="hud">
            <div className="card"><div className="card-b">
              <span className="mode-tag work"><i />{lastResp?.office ? `11WORKSPACE · You → ${TITLES.captain} → ${TITLES.consul}s → ${TITLES.adept}s → ${TITLES.crew.toLowerCase()}s` : "Mission DAG · metallic flow · top to bottom"}</span>
              <h3>{lastUser ? trunc(lastUser.text, 60) : "Mission"}</h3>
              <div className="prog"><i style={{ width: `${Math.round((complete / total) * 100)}%` }} /></div>
              <div className="klist">
                <div><span>Steps</span><span>{complete} / {total}</span></div>
                {lastResp?.office && <div><span>Desks</span><span>{lastResp.office.desks.length}</span></div>}
                <div><span>Agents</span><span>{lastResp?.office ? `${lastResp.office.floor.length} / ${lastResp.office.cap}` : agents}</span></div>
                <div><span>Receipts</span><span>{receipts}</span></div>
                <div><span>Waiting on you</span><span>{gate ? 1 : 0}</span></div>
                {savedTokens > 0 && <div><span>Tokens saved</span><span>{savedTokens}</span></div>}
              </div>
              <div className="legend work"><span><i style={{ background: "#FFFFFF" }} />you</span><span><i style={{ background: "#F4F5F7" }} />captain</span><span><i style={{ background: "#E8EAED" }} />consul</span><span><i style={{ background: "#DFE1E5" }} />adept</span><span><i style={{ background: "#D9DCE0" }} />agents</span><span><i style={{ background: "#A6ABB1" }} />tools</span><span><i style={{ background: "#EDEEF0" }} />gate</span><span><i style={{ background: "#4FB3AF" }} />live</span></div>
            </div></div>
            {lastResp && (
              <div className="card"><div className="card-b">
                <span className="lbl">{busy ? "Now" : "Result"}</span>
                <div className="klist" style={{ marginTop: 6 }}>
                  {(lastResp.office?.desks ?? []).slice(0, 8).map((d) => (
                    <div key={d.id}><span>{d.label} · {d.lead}{d.onFloor ? ` · ${d.onFloor} worker${d.onFloor === 1 ? "" : "s"}` : ""}</span><span className={`led ${d.onFloor ? (busy ? "live" : "ok") : "ok"}`} /></div>
                  ))}
                  {(lastResp.memberRuns ?? []).slice(0, 6).map((mr, i) => (
                    <div key={mr.specialistId}><span><span className="agent-tag">AGENT {String(i + 1).padStart(2, "0")}</span> · {mr.toolReceipts.length ? `${mr.toolReceipts.length} tool call${mr.toolReceipts.length === 1 ? "" : "s"}` : `${mr.providerCalls} call${mr.providerCalls === 1 ? "" : "s"}`}{mr.truncated ? " · partial" : ""}</span><span className={`led ${busy ? "live" : "ok"}`} /></div>
                  ))}
                  {!(lastResp.memberRuns?.length) && !(lastResp.office?.desks.length) && <div><span>{lastResp.outcome === "planned" ? "Planned — connect a provider to execute" : lastResp.outcome}</span><span className="led ok" /></div>}
                </div>
                {done && <button className="btn sm ghost" style={{ marginTop: 10 }} onClick={() => go("chat")}>Read the answer →</button>}
              </div></div>
            )}
          </div>
          {gate && <div className="gate-float"><GateCard /></div>}
          <div className="graph-foot"><button className="btn sm" onClick={() => setFit((n) => n + 1)}>Fit</button><button className={`btn sm ${spin ? "" : "ghost"}`} onClick={() => setSpin((s) => !s)}>Auto-rotate</button><span className="hint">drag to orbit · scroll to zoom · hover a node for detail</span></div>
        </div>
      )}
    </>
  );
}

function trunc(s: string, n: number) { return s.length > n ? s.slice(0, n - 1) + "…" : s; }

function build(resp: ReturnType<typeof useVh.getState>["lastResp"], busy: boolean, gateAction: string | null, stewardName: string) {
  const nodes: FgNode[] = [{ id: "you", name: "You", kind: "you", val: 10 }, { id: "st", name: stewardName, kind: "captain", val: 7, live: busy, sub: TITLES.captain }];
  const links: FgLink[] = [{ source: "you", target: "st", live: busy }];
  let tools = 0, receipts = 0;
  const ids = resp?.specialistIds ?? [];
  const runs = new Map((resp?.memberRuns ?? []).map((r) => [r.specialistId, r]));
  const office = resp?.office;
  const deskOf = new Map((office?.floor ?? []).map((s) => [s.id, s.desk]));
  /* THE COMPANY CHAIN, drawn rung by rung: You → Captain → Consul → Adept → sub-agents.
     No edge skips a rung: a sub-agent hangs off its Adept's desk, a desk off its Consul,
     a Consul off the Captain. A desk comes from the run's office when there is one, else
     from the specialist's HOME desk — a static fact of the org, not a claim the run opened it. */
  const desks = new Map<string, { label: string; sub: string; consulId: string; consul: string }>();
  for (const d of office?.desks ?? []) desks.set(d.id, { label: d.label, sub: `${d.lead} · ${d.onFloor} on floor`, consulId: d.consulId, consul: d.consul });
  const deskFor = (sid: string): string | undefined => {
    const seated = deskOf.get(sid);
    if (seated && desks.has(seated)) return seated;
    const sp = getSpecialist(sid);
    if (!sp) return undefined;
    const home = homeDesk(sp);
    if (!desks.has(home)) {
      const def = deskById(home);
      const consul = consulForDesk(home);
      if (!def || !consul) return undefined; // never draw an edge that would skip a rung
      desks.set(home, { label: def.label, sub: leadFor(home)?.name ?? def.label, consulId: consul.id, consul: consul.name });
    }
    return home;
  };
  const deskOfAgent = ids.map(deskFor);
  const consuls = new Map<string, string>();
  for (const d of desks.values()) consuls.set(d.consulId, d.consul);
  for (const [cid, cname] of consuls) {
    nodes.push({ id: `c:${cid}`, name: cname, kind: "consul", val: 6, live: busy, sub: TITLES.consul });
    links.push({ source: "st", target: `c:${cid}`, live: busy });
  }
  for (const [did, d] of desks) {
    nodes.push({ id: `d:${did}`, name: d.label, kind: "adept", val: 5, sub: d.sub });
    links.push({ source: `c:${d.consulId}`, target: `d:${did}`, live: busy });
  }
  ids.forEach((sid, i) => {
    const tag = `AGENT ${String(i + 1).padStart(2, "0")}`;
    const sp = getSpecialist(sid);
    const run = runs.get(sid);
    const desk = deskOfAgent[i];
    nodes.push({ id: `a${i}`, name: tag, kind: "agent", val: 6, live: busy, sub: sp?.category ? String(sp.category) : undefined });
    if (desk) links.push({ source: `d:${desk}`, target: `a${i}`, live: busy });
    (run?.toolReceipts ?? []).forEach((t, j) => {
      const id = `t${i}_${j}`; tools += 1;
      const refused = /refus|denied|blocked/i.test(t.outcome);
      nodes.push({ id, name: `${t.tool} · ${t.outcome}`, kind: refused ? "refused" : "tool", val: 3, sub: t.inputPreview?.slice(0, 80) });
      links.push({ source: `a${i}`, target: id });
      if (t.digest) { receipts += 1; nodes.push({ id: `r${id}`, name: `receipt ${t.digest.slice(0, 8)}…`, kind: "wreceipt", val: 2 }); links.push({ source: id, target: `r${id}` }); }
    });
  });
  if (gateAction) { nodes.push({ id: "gate", name: gateAction, kind: "gate", val: 5, live: true }); links.push({ source: ids.length ? "a0" : "st", target: "gate", live: true }); }
  if (resp?.provenanceDigest) { receipts += 1; nodes.push({ id: "prov", name: `provenance ${resp.provenanceDigest.slice(0, 8)}…`, kind: "wreceipt", val: 3 }); links.push({ source: "st", target: "prov" }); }
  if (resp && !busy) { nodes.push({ id: "v", name: `Verify · ${resp.outcome}`, kind: resp.outcome === "refused" ? "refused" : "tool", val: 4 }); (ids.length ? ids.map((_, i) => `a${i}`) : ["st"]).forEach((s) => links.push({ source: s, target: "v" })); }
  return { nodes, links, agents: ids.length, tools, receipts };
}
