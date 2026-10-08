/**
 * SelfImpulse — the Specialists door: the agents that are working, read from the run
 * records themselves.
 *
 * This door used to print a curated list of twenty-five domains and a toolbox under
 * each one. A list like that is a promise somebody has to keep: the moment it drifts
 * from what the engine can actually route it is a lie, and every added domain makes
 * the drift likelier. Everything here is read from a run — the crew executor's seat
 * records, the Captain's per-member runs, the handoffs, the gate — so the door can
 * only ever show what really exists. Where nothing is running it says so.
 */

import React, { useMemo, useState } from "react";
import { useVh } from "../store";
import { getSpecialist } from "../../engine/registry";

type AgentState = "running" | "waiting" | "queued" | "finished" | "stopped";
const STATE_WORD: Record<AgentState, string> = { running: "Working", waiting: "Waiting on you", queued: "Queued", finished: "Finished", stopped: "Stopped" };
const LED_FOR: Record<AgentState, string> = { running: "live", waiting: "warn", queued: "", finished: "ok", stopped: "bad" };

interface Agent {
  id: string;
  tag: string;
  seat: string;
  state: AgentState;
  given: string;
  doing: string;
  made: string;
  body: React.ReactNode;
}

export function Specialists(): React.ReactElement {
  const { msgs, busy, gate, lastResp, crewRun, crewRunning, handoffs, restoredRuns, restoreNote, go } = useVh();
  const [sel, setSel] = useState<string | null>(null);

  const agents = useMemo(() => live(msgs, busy, gate?.ask ?? null, lastResp, crewRun, crewRunning, handoffs), [msgs, busy, gate, lastResp, crewRun, crewRunning, handoffs]);
  const count = (s: AgentState) => agents.filter((a) => a.state === s).length;

  return (
    <>
      <header className="top"><h2>Specialists</h2>
        {agents.length > 0 && <span className="sub">{agents.length} this session · {count("running")} working · {count("waiting")} waiting on you</span>}
        <div className="right"><button className="btn sm" onClick={() => go("receipts")}>Receipts</button><button className="btn sm" onClick={() => go("steward")}>New mission</button></div>
      </header>

      <div className="scroll"><div className="read-col">
        {agents.length === 0 ? (
          <div className="empty"><h3>No agents are working</h3>
            <p className="hint">Nothing has been dispatched, so there is nothing to show here — this door reads the live run records rather than a list of what could run.</p>
            <button className="btn primary" onClick={() => go("steward")}>Ask the Captain</button>
          </div>
        ) : (
          <>
            {/* A run that came back from the checkpoint chain is a fact about these
                agents, and the restore's own answer (including a refusal) is words. */}
            {restoreNote && <p className="hint">{restoreNote}{restoredRuns > 0 ? " — their resumed steps are in this list." : ""}</p>}
            <ol className="steps">
              {agents.map((a) => (
                <li key={a.id}>
                  <button className="step" aria-expanded={sel === a.id} aria-controls={`ag-${a.id}`} onClick={() => setSel(sel === a.id ? null : a.id)}>
                    <span className="av" aria-hidden />
                    <span className="step-body">
                      <span className="who"><b>{a.tag}</b> · {a.seat} · {STATE_WORD[a.state]}</span>
                      <span className="say">{a.doing}</span>
                      <span className="hint">given · {a.given}</span>
                      <span className="hint">made · {a.made}</span>
                    </span>
                    <span className={`led ${LED_FOR[a.state]}`} aria-hidden />
                  </button>
                  {sel === a.id && <div className="step-open" id={`ag-${a.id}`}>{a.body}</div>}
                </li>
              ))}
            </ol>
            {/* The door used to print this beside every toolbox. It stays as one line,
                because the agents listed above are exactly the things it is true of. */}
            <p className="hint">Engines compute; they do not act — anything that changes something real is gated and waits for you.</p>
          </>
        )}
      </div></div>
    </>
  );
}

const one = (s: string) => s.replace(/\s+/g, " ").trim().slice(0, 160) || "—";
const many = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
const secs = (ms: number) => `${(ms / 1000).toFixed(1)}s`;
const bad = (outcome: string) => /error|fail|refus|deni|block|gated|abort|timeout|skipped/i.test(outcome);

/** Every agent the records name, in the order a person would read them: the crew's
 *  seats, then the Captain's members, then anything handed to a peer. */
function live(
  msgs: ReturnType<typeof useVh.getState>["msgs"],
  busy: boolean,
  ask: NonNullable<ReturnType<typeof useVh.getState>["gate"]>["ask"] | null,
  lastResp: ReturnType<typeof useVh.getState>["lastResp"],
  crewRun: ReturnType<typeof useVh.getState>["crewRun"],
  crewRunning: boolean,
  handoffs: ReturnType<typeof useVh.getState>["handoffs"],
): Agent[] {
  const out: Agent[] = [];
  const gatedIds = ask?.specialistIds ?? [];

  const rep = crewRun?.report ?? null;
  const slots = new Map((crewRun?.crew?.slots ?? []).map((s) => [s.specialistId, s]));
  const atGate = new Set((crewRun?.crew?.atGate ?? []).map((g) => g.slotId));

  for (const [i, seat] of (rep?.seats ?? []).entries()) {
    const stopped = bad(seat.outcome);
    out.push({
      id: `seat:${seat.seatId}`,
      tag: `SEAT ${String(i + 1).padStart(2, "0")}`,
      seat: `${seat.role} · ${seat.harnessName}`,
      state: atGate.has(seat.seatId) ? "waiting" : crewRunning && seat.turnsRun > 0 && seat.exitCode === null ? "running" : stopped ? "stopped" : "finished",
      given: one(`${crewRun?.objective ?? ""} — ${seat.branch}`),
      doing: `${seat.wave > 0 ? `wave ${seat.wave} · ` : ""}${many(seat.turnsRun, "turn")} on ${seat.worktreePath || seat.cwd} · ${secs(seat.durationMs)}`,
      made: seat.verified
        ? `verified by the repository's own check · ${many(seat.git.filesChanged, "file")} (+${seat.git.additions}/−${seat.git.deletions})`
        : seat.git.measured
          ? `${many(seat.git.filesChanged, "file")} changed (+${seat.git.additions}/−${seat.git.deletions}) — ${seat.verificationDetail}`
          : seat.reason || seat.verificationDetail || "nothing measured",
      body: <>
        <p className="hint">Held: {seat.seatId} · outcome <b>{seat.outcome}</b>{seat.exitCode !== null ? ` · exit ${seat.exitCode}` : " · no exit yet"}</p>
        {seat.reason && <p className="prose">{seat.reason}</p>}
        <p className="hint">{seat.verificationDetail}</p>
        {seat.git.detail && <p className="hint">Git — {seat.git.detail}</p>}
        {seat.selfReport && <p className="hint">Its own account (unverified) — {one(seat.selfReport)}</p>}
        {seat.warnings.length > 0 && <p className="hint">Warnings — {seat.warnings.join(" · ")}</p>}
        {seat.reviewedRef && <p className="mono faint">reviewed {seat.reviewedRef}{seat.reviewedSha ? ` @ ${seat.reviewedSha.slice(0, 12)}` : ""}</p>}
        {seat.outputTail && <pre className="si-pre">{seat.outputTail}</pre>}
      </>,
    });
  }

  for (const n of rep?.notRun ?? []) {
    out.push({
      id: `notrun:${n.seatId}`, tag: n.seatId, seat: "never dispatched", state: "queued",
      given: one(crewRun?.objective ?? ""), doing: "Not dispatched — the run settled without it", made: n.reason,
      body: <p className="prose">{n.reason}</p>,
    });
  }

  for (const g of crewRun?.crew?.atGate ?? []) {
    out.push({
      id: `gate:${g.slotId}`, tag: `AGENT ${g.slotId}`, seat: slots.get(g.specialistId)?.domain ?? getSpecialist(g.specialistId)?.category ?? "unrecorded",
      given: one(crewRun?.objective ?? ""), doing: "Held at the human gate", made: "nothing yet — it stops until you decide",
      state: "waiting",
      body: <p className="prose">{g.ask}</p>,
    });
  }

  /* The Captain's own members. `given` is the ask that produced the run they took,
     read off the transcript, not restated. */
  let askText = "";
  for (const m of msgs) {
    if (m.role === "user") { askText = m.text; continue; }
    const r = m.resp;
    if (!r) continue;
    const current = r === lastResp;
    (r.memberRuns ?? []).forEach((mr, i) => {
      const receipts = mr.toolReceipts;
      const refused = receipts.filter((t) => bad(t.outcome));
      const waiting = gatedIds.includes(mr.specialistId) && current;
      const sp = getSpecialist(mr.specialistId);
      const reasons = r.routed.selected.find((c) => c.id === mr.specialistId)?.reasons ?? [];
      out.push({
        id: `run:${m.id}:${mr.specialistId}`,
        tag: `AGENT ${String(i + 1).padStart(2, "0")}`,
        seat: sp?.category ?? "unrecorded desk",
        state: waiting ? "waiting" : current && busy ? "running" : refused.length > 0 || mr.truncated ? "stopped" : "finished",
        given: one(askText || r.reply),
        doing: waiting
          ? `Held at the gate — ${one(ask?.action ?? "an action needs your approval")}`
          : receipts.length > 0
            ? `${many(receipts.length, "tool call")} · ${many(mr.providerCalls, "provider call")} · ${secs(mr.latencyMs)}`
            : `${many(mr.providerCalls, "provider call")} from the model${mr.tools.length > 0 ? ` with ${many(mr.tools.length, "tool")} carried` : ", no tools carried"} · ${secs(mr.latencyMs)}`,
        made: receipts.length > 0
          ? `${many(receipts.filter((t) => t.digest).length, "sealed receipt")}${refused.length > 0 ? ` · ${many(refused.length, "refusal")}` : ""}${mr.truncated ? " · stopped early" : ""}`
          : mr.truncated ? "an answer, cut short" : "an answer, nothing executed",
        body: <>
          {reasons.length > 0 && <p className="hint">Chosen for — {reasons.join(", ")}</p>}
          <p className="hint">Tools carried — {mr.tools.length > 0 ? mr.tools.join(", ") : "none: this member could not touch the workspace"}</p>
          {receipts.length === 0 ? <p className="hint">No tool ran, so no receipt was issued.</p> : <ul className="rcpts">
            {receipts.map((t, j) => (
              <li key={j}>
                <div className="rcpt-h"><b>{t.tool}</b><span className={`pill ${/error|fail/i.test(t.outcome) ? "bad" : bad(t.outcome) ? "warn" : "ok"}`}>{t.outcome}</span></div>
                {t.inputPreview && <p className="hint">in · {t.inputPreview}</p>}
                {t.outputPreview && <p className="prose">out · {t.outputPreview}</p>}
                {t.digest && <p className="mono faint">{`receipt ${t.digest.slice(0, 8)}…`}</p>}
              </li>
            ))}
          </ul>}
        </>,
      });
    });
  }

  for (const h of handoffs) {
    out.push({
      id: `peer:${h.id}`, tag: h.peer, seat: "peer, off this machine",
      state: h.outcome === "delegated" ? "finished" : "stopped",
      given: `task ${h.taskDigest.slice(0, 10)}…`,
      doing: h.outcome === "delegated" ? "Delegated to the peer" : "Refused by the mesh",
      made: h.receiptDigest ? `joint receipt ${h.meshJointDigest ? h.meshJointDigest.slice(0, 8) : h.receiptDigest.slice(0, 8)}…` : "no receipt came back",
      body: <>
        <p className="prose">{h.detail}</p>
        {h.meshStanding && <p className="hint">Pair standing after this handoff: {h.meshStanding}{h.meshDetail ? ` — ${h.meshDetail}` : ""}</p>}
        <p className="mono faint">{h.receiptDigest ?? h.taskDigest}</p>
      </>,
    });
  }

  return out;
}
