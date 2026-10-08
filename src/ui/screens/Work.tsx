import React, { useMemo, useState } from "react";
import { useVh } from "../store";
import { GateCard } from "./GateCard";
import { getSpecialist } from "../../engine/registry";
import { TITLES } from "../../engine/chain";
import type { GeneralistResponse, MemberRunView } from "../../engine/types";

/** One row of the mission thread, plus the detail that appears under it when it is
 *  chosen. `led` is a claim about THIS row and nothing else. */
interface Step {
  id: string;
  who: string;
  at?: string;
  line: string;
  led: string;
  body: React.ReactNode;
}

/** Work — the mission read top to bottom like a conversation: what was asked, what each
 *  agent did, what it produced, what is waiting on the human. Detail opens in place, so
 *  the thing you are reading never moves out from under you. */
export function Work(): React.ReactElement {
  const { lastResp, busy, gate, msgs, go, stewardName, savedTokens, sessions } = useVh();
  const [sel, setSel] = useState<string | null>(null);

  const steps = useMemo(() => thread(msgs, lastResp, gate, busy, stewardName, go), [msgs, lastResp, gate, busy, stewardName, go]);

  const runs = lastResp?.memberRuns ?? [];
  const calls = runs.reduce((n, r) => n + r.toolReceipts.length, 0);
  /* The chip counts what its own number counts: member runs that ran. On a plan there is
     no member run at all, so "0 agents" would erase the crew the Captain did choose. */
  const ran = runs.length > 0;
  const crew = ran ? runs.length : lastResp?.specialistIds.length ?? 0;

  return (
    <>
      {/* No <h2> — the shell top bar already reads "Work"; this row is status only. */}
      <header className="top">
        <span className="sub">{busy ? "Running" : lastResp ? RUN_SAYS[lastResp.outcome] ?? lastResp.outcome : ""}</span>
        <div className="right">
          {lastResp && crew > 0 && <span className="pill">{plural(crew, "agent")}{ran ? " ran" : " chosen, none ran"}</span>}
          {lastResp && <span className="pill">{calls} tool call{calls === 1 ? "" : "s"}</span>}
          {gate && <span className="pill warn">Waiting on you</span>}
          {savedTokens > 0 && <span className="pill">−{savedTokens} tokens</span>}
          {busy && <span className="pill accent">Live</span>}
          <button className="btn sm" onClick={() => go("steward")}>New mission</button>
        </div>
      </header>

      {!lastResp && !busy && !gate ? (
        <div className="scroll"><div className="read-col">
          <div className="empty"><h3>{sessions.length > 0 ? "No mission in this conversation" : "No work yet"}</h3>
            {/* "Nothing has run on this machine" is a claim about the machine, and
                Receipts contradicts it the moment anything has run: the thread here
                is per-conversation, so the sentence has to be too. */}
            <p className="hint">{sessions.length > 0
              ? `Nothing has been routed in the conversation you have open. The ${sessions.length} conversation${sessions.length === 1 ? "" : "s"} this machine has kept are on the Captain door.`
              : "Nothing has run on this machine, so there is no mission to read. Its steps appear here in the order they happened."}</p>
            <button className="btn primary" onClick={() => go("steward")}>Ask the Captain</button>
          </div>
        </div></div>
      ) : (
        <div className="scroll"><div className="read-col">
          <ol className="steps">
            {steps.map((s) => (
              <li key={s.id}>
                <button className="step" aria-expanded={sel === s.id} aria-controls={`step-${s.id}`} onClick={() => setSel(sel === s.id ? null : s.id)}>
                  <span className="av" aria-hidden />
                  <span className="step-body">
                    <span className="who"><b>{s.who}</b>{s.at ? ` · ${clock(s.at)}` : ""}</span>
                    <span className="say">{s.line}</span>
                  </span>
                  <span className={`led ${s.led}`} aria-hidden />
                </button>
                {/* Nothing renders until the row is chosen: an always-open detail panel
                    is the side panel again, only scrolled away. */}
                {sel === s.id && <div className="step-open" id={`step-${s.id}`}>{s.body}</div>}
              </li>
            ))}
            {busy && !lastResp && <li className="step"><span className="av" aria-hidden /><span className="step-body"><span className="who"><b>{stewardName}</b></span><span className="say faint">Working</span></span></li>}
          </ol>
          {gate && <div className="gate-float"><GateCard /></div>}
        </div></div>
      )}
    </>
  );
}

const one = (s: string) => s.replace(/\s+/g, " ").trim().slice(0, 160);
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
const clock = (iso: string) => { try { return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); } catch { return ""; } };

/** The engine writes its run record as dot-separated clauses and full stops. This splits
 *  it onto lines — a clause is never reworded, merged or dropped, only given room to read. */
function clauses(note: string): string[] {
  return note
    .split(/\s+·\s+|\s*\.\s+(?=[A-Z0-9(])|\s*\.\s*$/)
    .map((c) => c.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

/* ── the lights ─────────────────────────────────────────────────────────────── */

/** Every status word a row's own evidence can carry, and the light it earns. A word this
 *  table does not know is amber and never green: green is a claim that this row worked,
 *  and an unrecognised word carries no evidence of that. */
const LED_OF: Record<string, "ok" | "warn" | "bad"> = {
  ok: "ok", answered: "ok", completed: "ok", executed: "ok", "peer-delegated": "ok",
  planned: "warn", partial: "warn", pending: "warn", proposed: "warn",
  error: "bad", refused: "bad", "gated-out": "bad", blocked: "bad", failed: "bad",
};
const ledClass = (word: string): "ok" | "warn" | "bad" => LED_OF[word.toLowerCase().trim()] ?? "warn";

/** A status dot is a claim about its own row, so it colours from that row's evidence: a
 *  refused or failed outcome is never green, and a light that is still running is its own. */
function ledFor(word: string, busy: boolean): string {
  return busy ? "live" : ledClass(word);
}

/** The worst receipt in the row decides the row — one refusal cannot average away, and a
 *  row with no receipts is a row where nothing ran, which is not a green light either. */
const RANK = { bad: 0, warn: 1, ok: 2 } as const;
const rankOf = (word: string) => RANK[ledClass(word)];
function worstOf(receipts: Array<{ outcome: string }>): string {
  if (receipts.length === 0) return "planned";
  return receipts.reduce((worst, r) => (rankOf(r.outcome) < rankOf(worst) ? r.outcome : worst), receipts[0].outcome);
}

/** One agent's own row: a failed tool outranks an early stop, and a member the report
 *  records as an error cannot turn green just because its receipt list is empty. */
function memberLed(mr: MemberRunView, loggedOutcome?: string): string {
  const fromTools = ledClass(worstOf(mr.toolReceipts));
  if (fromTools === "bad") return "error";
  if (loggedOutcome && ledClass(loggedOutcome) === "bad") return loggedOutcome;
  if (mr.truncated || fromTools === "warn") return "partial";
  if (mr.toolReceipts.length === 0) return loggedOutcome ?? "planned";
  return "ok";
}

/** The answer row claims this person was handed an answer. An answer from a run that never
 *  executed, lost a member, was cut off mid-loop, or whose live claims were never verified
 *  is not one that gets a green dot. */
function answerLed(resp: GeneralistResponse, runs: MemberRunView[]): string {
  if (resp.outcome !== "answered") return resp.outcome;
  if (!resp.executed) return "partial";
  if (resp.captain && resp.captain.status !== "completed") return resp.captain.status;
  if (runs.some((r) => r.truncated)) return "partial";
  if (runs.some((r) => r.toolReceipts.some((t) => ledClass(t.outcome) === "bad"))) return "partial";
  if (resp.liveData && !resp.liveData.verified) return "partial";
  return "answered";
}

/* ── the words ──────────────────────────────────────────────────────────────── */

/** The run's outcome said as what happened, not as the field that was read. */
const RUN_SAYS: Record<string, string> = {
  answered: "Answered", planned: "Planned — nothing executed", refused: "Refused",
  "gated-out": "Stopped at the gate", "peer-delegated": "Handed to a peer", error: "Did not complete",
};
const STRATEGY_SAYS: Record<string, string> = { single: "one agent", multi: "a crew", none: "no agent" };
const ROUTED_BY_SAYS: Record<string, string> = { deterministic: "the deterministic ranker", "llm-assisted": "a model re-rank" };
/** The storage seam under the tools. The kind is the engine's own id; these are the words
 *  for what it means to the person reading, and an unknown kind falls through untranslated. */
const SEAM_SAYS: Record<string, string> = {
  node: "a folder on this machine", "browser-memory": "a browser sandbox that is not on disk",
  "browser-fs-access": "a folder you granted in the browser",
};
/** A tool's outcome as what the tool did. */
const TOOL_SAYS: Record<string, string> = {
  ok: "ran", executed: "ran", error: "failed", refused: "refused", "gated-out": "held at the gate",
};
/** A member's outcome as what happened to that member. */
const MEMBER_SAYS: Record<string, string> = {
  answered: "answered in its own call", completed: "answered in its own call", executed: "ran",
  error: "its own provider call did not complete", refused: "refused before it ran",
  "gated-out": "held at the gate", blocked: "blocked", planned: "planned, never ran",
  partial: "finished only part of it",
};
const SAY_TOOL = (w: string) => TOOL_SAYS[w.toLowerCase().trim()] ?? w;
const SAY_MEMBER = (w: string) => MEMBER_SAYS[w.toLowerCase().trim()] ?? w;

/** What the live-data GuardRail really did, in the register it deserves: a "verified" that
 *  came from disclosure is not a "verified" that came from a fetch, and the door has always
 *  said "verified" over both. */
function liveSays(ld: NonNullable<GeneralistResponse["liveData"]>): string {
  const tried = ld.retrieval?.length ?? 0;
  const got = ld.retrieval?.filter((r) => r.status === "retrieved").length ?? 0;
  if (ld.verified && ld.verifiedBy === "retrieval") {
    return `Time-sensitive claims checked against the sources themselves — ${got} of the ${plural(tried, "cited source")} fetched came back holding what the answer cites.`;
  }
  if (ld.verified) {
    return `Time-sensitive claims carry disclosure only — the answer names ${plural(ld.sources, "source")} and ${plural(ld.datedClaims, "dated claim")}, but nothing was fetched to check them.`;
  }
  return `Time-sensitive claims NOT verified${tried ? ` — ${got} of the ${plural(tried, "cited source")} fetched held nothing the answer cites` : ""}. The reply carries the flag.`;
}

function thread(msgs: ReturnType<typeof useVh.getState>["msgs"], resp: ReturnType<typeof useVh.getState>["lastResp"], gate: ReturnType<typeof useVh.getState>["gate"], busy: boolean, captainName: string, go: ReturnType<typeof useVh.getState>["go"]): Step[] {
  const out: Step[] = [];
  const lastVh = [...msgs].reverse().find((m) => m.role !== "user");
  const ask = [...msgs].reverse().find((m) => m.role === "user");

  if (ask) {
    out.push({
      id: "ask", who: "You", at: ask.at, led: "", line: one(ask.text),
      body: <p className="prose">{ask.text}</p>,
    });
  }

  if (resp) {
    const dropped = resp.routed.policyDropped ?? [];
    const runs = resp.memberRuns ?? [];
    const report = resp.captain;
    out.push({
      id: "route", who: captainName, at: lastVh?.at, led: ledFor(resp.outcome, busy),
      line: resp.specialistIds.length
        ? `Chose ${plural(resp.specialistIds.length, "agent")} from ${resp.routed.considered} considered`
        : resp.executed
          ? "Took it itself — no agent was routed"
          : `Sent nobody — ${resp.routed.considered} considered, none went to work`,
      body: <>
        <p className="hint">Routing — {STRATEGY_SAYS[resp.routed.strategy] ?? resp.routed.strategy}, picked by {ROUTED_BY_SAYS[resp.routed.routedBy] ?? resp.routed.routedBy}.</p>
        {resp.routed.fallbackReason && <p className="hint">The model re-rank was tried and fell back: {resp.routed.fallbackReason}</p>}
        <ul className="dl">
          {resp.specialistIds.map((sid, i) => {
            const sp = getSpecialist(sid);
            const cand = resp.routed.selected.find((c) => c.id === sid);
            const score = cand?.score;
            return <li key={sid}>
              <span className="agent-tag">{`AGENT ${String(i + 1).padStart(2, "0")}`}</span>
              <b>{sp?.category ?? sid}</b>
              {typeof score === "number" && <span className="faint mono">{score}</span>}
              {cand && cand.reasons.length > 0 && <span className="faint">{cand.reasons.slice(0, 2).join(" · ")}</span>}
            </li>;
          })}
        </ul>
        {/* A plan that is short because a desk is off shift is the owner's own doing, and
            looks identical to one that is short because nothing fitted — say which. */}
        {dropped.length > 0 && <>
          <p className="hint">The router scored these; the shift policy kept them off the run:</p>
          <ul className="dl">{dropped.map((d) => <li key={d.id}><b>{d.domain}</b><span className="faint">{d.reason ?? "off shift"}</span></li>)}</ul>
        </>}
        {resp.workspace && <p className="hint">Its tools worked on {SEAM_SAYS[resp.workspace.kind] ?? resp.workspace.kind} — <span className="mono">{resp.workspace.root}</span></p>}
        {resp.authority
          ? <p className="hint">This run rode a signed mandate — <span className="mono">{resp.authority.mandateDigest.slice(0, 12)}…</span> ({resp.authority.scheme}) held by {resp.authority.owner}</p>
          : <p className="hint">No mandate rode on this run.</p>}
      </>,
    });

    const office = resp.office;
    if (office && office.desks.length > 0) {
      out.push({
        id: "office", who: captainName, at: lastVh?.at, led: busy ? "live" : office.floor.length > 0 ? "ok" : "warn",
        line: office.floor.length > 0
          ? `Opened ${plural(office.desks.length, "desk")} and put ${plural(office.floor.length, TITLES.crew.toLowerCase())} on the floor, of a ${office.cap}-seat cap`
          : `Opened ${plural(office.desks.length, "desk")} — nobody went to the floor`,
        body: <ul className="dl">
          {office.desks.map((d) => <li key={d.id}>
            <b>{d.label}</b>
            <span className="faint">under {d.consul}</span>
            <span className="faint">{d.lead} · {d.hr}</span>
            <span className={d.onFloor > 0 ? "" : "faint"}>{d.onFloor} on the floor of {d.pooled} pooled here</span>
          </li>)}
        </ul>,
      });
    }

    runs.forEach((mr, i) => {
      const receipts = mr.toolReceipts;
      const logged = report?.members.find((m) => m.specialistId === mr.specialistId);
      const failed = !!logged && ledClass(logged.outcome) === "bad";
      out.push({
        id: `m${i}`,
        who: `AGENT ${String(i + 1).padStart(2, "0")}`,
        at: lastVh?.at,
        led: ledFor(memberLed(mr, logged?.outcome), busy),
        line: failed
          ? SAY_MEMBER(logged!.outcome)
          : receipts.length
            ? `${plural(receipts.length, "tool call")} ran over ${plural(mr.providerCalls, "provider call")}${mr.truncated ? " — cut off at the step limit" : ""}`
            : mr.tools.length
              ? `Carried ${plural(mr.tools.length, "tool")} and used none — ${plural(mr.providerCalls, "provider call")}`
              : `Answered from the model alone — ${plural(mr.providerCalls, "provider call")}`,
        body: <>
          <p className="hint">{getSpecialist(mr.specialistId)?.category ?? mr.specialistId} — {plural(mr.providerCalls, "provider call")}, {(mr.latencyMs / 1000).toFixed(1)}s end to end{mr.truncated ? ", and it stopped before finishing" : ""}</p>
          {mr.tools.length > 0 && <p className="mono faint">carried: {mr.tools.join(" · ")}</p>}
          {failed && logged?.note && <p className="hint">Why: {logged.note}</p>}
          {receipts.length === 0 ? <p className="hint">No tool ran under this agent.</p> : <ul className="rcpts">
            {receipts.map((t, j) => (
              <li key={j}>
                <div className="rcpt-h"><b>{t.tool}</b><span className={`pill ${ledClass(t.outcome)}`}>{SAY_TOOL(t.outcome)}</span></div>
                {t.inputPreview && <p className="hint">asked · {t.inputPreview}</p>}
                {t.outputPreview && <p className="prose">came back · {t.outputPreview}</p>}
                {t.digest && <p className="mono faint">{`receipt ${t.digest.slice(0, 8)}…`}</p>}
              </li>
            ))}
          </ul>}
        </>,
      });
    });

    if (report) {
      out.push({
        id: "report", who: report.captainName, at: lastVh?.at, led: ledFor(report.status, busy),
        line: one(report.summary),
        body: <>
          <p className="prose">{report.summary}</p>
          <ul className="dl">
            {report.members.map((m, i) => <li key={`${m.specialistId}_${i}`}>
              <span className="agent-tag">{`AGENT ${String(i + 1).padStart(2, "0")}`}</span>
              <b>{SAY_MEMBER(m.outcome)}</b>
              {/* A member's note is only worth this row when it explains a failure: on the
                  other paths it is the run record, which the answer row already carries. */}
              {ledClass(m.outcome) === "bad" && m.note && <span className="hint">Why: {m.note}</span>}
              {m.memberDigest && <span className="mono faint">{m.memberDigest.slice(0, 8)}…</span>}
            </li>)}
          </ul>
          {report.failures.length > 0 && <>
            <p className="hint">What did not run:</p>
            <ul className="dl">{report.failures.map((f, i) => <li key={`f${i}`}>{f}</li>)}</ul>
          </>}
          {report.nextStep && <p className="hint">Next: {report.nextStep}</p>}
        </>,
      });
    }

    const syn = resp.synthesis;
    if (syn) {
      out.push({
        id: "synthesis", who: syn.captainName, at: lastVh?.at, led: busy ? "live" : "ok",
        line: `Weighed ${plural(syn.divergences.membersCompared, "member answer")} — ${plural(syn.divergences.corroborated.length, "point")} every answering member backed, ${plural(syn.divergences.singleSourced.length, "point")} only one did; the points are listed below`,
        body: <>
          <p className="prose">{syn.text}</p>
          <p className="hint">{syn.model} · {(syn.latencyMs / 1000).toFixed(1)}s{syn.digest ? ` · ${syn.digest.slice(0, 12)}…` : ""}</p>
          {syn.divergences.singleSourced.length > 0 && <>
            <p className="hint">One member said this and nobody backed it:</p>
            <ul className="dl">{syn.divergences.singleSourced.map((s, i) => <li key={`s${i}`}><b>{s.atom}</b><span className="faint">{s.kind}</span></li>)}</ul>
          </>}
          {syn.divergences.corroborated.length > 0 && <>
            <p className="hint">Every answering member said this:</p>
            <ul className="dl">{syn.divergences.corroborated.map((s, i) => <li key={`c${i}`}>{s}</li>)}</ul>
          </>}
        </>,
      });
    }
  }

  if (resp) {
    const planned = resp.outcome === "planned" && !resp.executed;
    const record = resp.note ? clauses(resp.note) : [];
    const ld = resp.liveData;
    out.push({
      id: "answer", who: captainName, at: lastVh?.at, led: ledFor(answerLed(resp, resp.memberRuns ?? []), busy),
      line: planned ? "Planned — connect a provider and it will run" : one(resp.reply),
      body: <>
        <p className="prose">{resp.reply}</p>
        {record.length > 0 && <>
          {/* This is the sentence the answer bubble used to carry. It is the machine's own
              record of the run, so it stays word for word — here, on one line per clause. */}
          <p className="hint">Run record — every clause the engine logged:</p>
          <ul className="dl">{record.map((c, i) => <li key={`n${i}`}>{c}</li>)}</ul>
        </>}
        {resp.failure && <p className="hint">{resp.failure.meaning} — {resp.failure.advice}{resp.failure.retryable ? " (retryable)" : ""}</p>}
        {ld && <p className="hint">{liveSays(ld)}</p>}
        {ld?.retrieval && ld.retrieval.length > 0 && <ul className="dl">
          {ld.retrieval.map((r, i) => <li key={`${r.url}_${i}`}>
            <span className={`pill ${r.status === "retrieved" ? "ok" : "bad"}`}>{r.status === "retrieved" ? "fetched" : "not fetched"}</span>
            <span className="mono faint">{r.url}</span>
            <span className="faint">{plural(r.claimHits, "claim")} found · {r.bytes} bytes · {clock(r.fetchedAt)}</span>
            {r.detail && <span className="faint">{r.detail}</span>}
          </li>)}
        </ul>}
        {resp.provenanceDigest && <p className="mono faint">provenance {resp.provenanceDigest.slice(0, 12)}… — what the receipt commits to</p>}
        {!busy && <div className="acts"><button className="btn sm ghost" onClick={() => go("chat")}>Read the answer</button></div>}
      </>,
    });
  }

  if (gate) {
    out.push({
      id: "gate", who: "You", at: gate.askedAt, led: "warn",
      line: `Waiting on you — ${one(gate.ask.action)}`,
      body: <>
        <p className="prose">{gate.ask.summary}</p>
        <p className="hint">Risk {gate.ask.riskTier}. The decision is in the card at the foot of the screen; it is receipted either way.</p>
      </>,
    });
  }

  return out;
}
