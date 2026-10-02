import { useEffect, useRef, useState } from "react";
import {
  BOT_NAME,
  exportSelfImpulseMemoryMarkdown,
  newSelfImpulseThread,
  rateSelfImpulseRun,
  removeSelfImpulseFact,
  removeSelfImpulsePreference,
  removeSelfImpulseSkill,
  resolveSelfImpulseApproval,
  sendSelfImpulseMessage,
  setActiveSelfImpulseThread,
  setSelfImpulseMode,
  setSelfImpulsePersona,
  stopSelfImpulse,
  subscribeSelfImpulse,
  selfimpulseBrain,
  selfimpulseMissions,
  selfimpulseReceiptJsonl,
  selfimpulseSession,
  selfimpulseWorkspaceFiles,
  verifySelfImpulseReceipt,
  type SelfImpulseMessage,
  type SelfImpulseMode,
  type SelfImpulsePersona,
  type SelfImpulseSession,
  type SelfImpulseTraceStep,
} from "../engine/selfimpulse";

/* ── mini markdown → React nodes (no deps, no innerHTML) ─────────────────── */
function inline(s: string, key: number): (string | JSX.Element)[] {
  const parts = s.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((p, i) => {
    const k = `${key}-${i}`;
    if (p.startsWith("**") && p.endsWith("**")) return <strong key={k}>{p.slice(2, -2)}</strong>;
    if (p.startsWith("`") && p.endsWith("`")) return <code key={k} className="tm-code">{p.slice(1, -1)}</code>;
    return p;
  });
}

function renderMiniMd(text: string): JSX.Element {
  const lines = text.split("\n");
  const out: JSX.Element[] = [];
  let i = 0;
  let li = 0;
  while (i < lines.length) {
    const ln = lines[i];
    if (ln.startsWith("```")) {
      const buf: string[] = [];
      i += 1;
      while (i < lines.length && !lines[i].startsWith("```")) buf.push(lines[i++]);
      i += 1;
      out.push(<pre key={`pre-${li++}`} className="tm-pre">{buf.join("\n")}</pre>);
      continue;
    }
    if (ln.startsWith("- ")) {
      const items: string[] = [];
      while (i < lines.length && lines[i].startsWith("- ")) items.push(lines[i++].slice(2));
      out.push(<ul key={`ul-${li++}`} className="tm-ul">{items.map((it, j) => <li key={j}>{inline(it, j)}</li>)}</ul>);
      continue;
    }
    if (ln.startsWith("## ")) {
      out.push(<div key={`h-${li++}`} className="tm-h">{ln.slice(3)}</div>);
      i += 1;
      continue;
    }
    if (ln.trim() === "") {
      i += 1;
      continue;
    }
    out.push(<p key={`p-${li++}`} className="tm-p">{inline(ln, i)}</p>);
    i += 1;
  }
  return <>{out}</>;
}

/* ── trace steps (the SelfImpulse Cycle, rendered honestly) ─────────────────────── */
function TraceStepView({ s, onApprove }: { s: SelfImpulseTraceStep; onApprove: (id: string, ok: boolean) => void }): JSX.Element {
  const argStr = (a: Record<string, unknown>): string => {
    try {
      const t = JSON.stringify(a);
      return t.length > 90 ? `${t.slice(0, 90)}…` : t;
    } catch {
      return "";
    }
  };
  if (s.kind === "route") {
    return (
      <div className="tm-step">
        <span className={`tm-tag ${s.path === "slow" ? "tm-tag-slow" : "tm-tag-fast"}`}>{s.path.toUpperCase()}</span>
        <span className="tm-step-body tm-muted">{s.reasons.join(" · ")}</span>
      </div>
    );
  }
  if (s.kind === "recall") {
    return (
      <div className="tm-step">
        <span className="tm-tag tm-tag-recall">RECALL</span>
        <span className="tm-step-body tm-muted">{s.facts} facts · {s.preferences} preferences applied · {s.skills} skills in play</span>
      </div>
    );
  }
  if (s.kind === "thought") {
    return <div className="tm-step"><span className="tm-tag tm-tag-think">THOUGHT</span><span className="tm-step-body">{s.text}</span></div>;
  }
  if (s.kind === "plan") {
    return (
      <div className="tm-step">
        <span className="tm-tag tm-tag-plan">PLAN</span>
        <ol className="tm-plan">{s.steps.map((st, i) => <li key={i}>{st}</li>)}</ol>
      </div>
    );
  }
  if (s.kind === "simulate") {
    return (
      <div className="tm-step">
        <span className="tm-tag tm-tag-sim">SIMULATE</span>
        <span className="tm-step-body">
          <div className="tm-sim-pred">{s.prediction}</div>
          {s.sideEffects.length > 0 && (
            <div className="tm-muted">side effects — {s.sideEffects.join(" · ")}</div>
          )}
          {s.warnings.length > 0 && (
            <div className="tm-warn">⚠ {s.warnings.join(" · ")}</div>
          )}
          <div className="tm-muted">prediction confidence: {s.confidence} — checked against reality in the receipt (SELFIMPULSE)</div>
        </span>
      </div>
    );
  }
  if (s.kind === "dispatch") {
    return (
      <div className="tm-step">
        <span className="tm-tag tm-tag-tool">DISPATCH</span>
        <span className="tm-step-body">
          {s.objective}
          {s.awaitingApprovalId ? (
            <div className="tm-approval">
              <div className="tm-approval-h">HUMAN GATE — dispatch a mission to a crew</div>
              <div className="tm-approval-btns">
                <button className="control" onClick={() => onApprove(s.awaitingApprovalId!, true)}>Approve</button>
                <button className="ghost danger" onClick={() => onApprove(s.awaitingApprovalId!, false)}>Deny</button>
              </div>
            </div>
          ) : s.denied ? (
            <span className="tm-denied">denied by the human gate — nothing executed</span>
          ) : s.status ? (
            <span className="tm-done">{s.status}</span>
          ) : null}
        </span>
      </div>
    );
  }
  if (s.kind === "receipt") return <></>;
  if (s.kind === "council")
    return (
      <div className="tm-step tm-step-council">
        <span className="tm-tag tm-tag-think">COUNCIL · {s.ruleBased ? "rule-based" : "model"}</span>
        <span className="tm-step-body">
          {s.seats.map((seat) => (
            <div key={seat.seat} className="tm-council-seat">
              <strong>{seat.seat}</strong> <em>({seat.role})</em>: {seat.section}
            </div>
          ))}
          <div className="tm-council-synthesis">
            <div><strong>Proposal:</strong> {s.synthesis.proposal}</div>
            <div><strong>Critique:</strong> {s.synthesis.critique}</div>
            <div><strong>Verdict:</strong> {s.synthesis.verdict}</div>
            <div><strong>Resolution:</strong> {s.synthesis.resolution}</div>
          </div>
        </span>
      </div>
    );
  /* tool */
  return (
    <div className="tm-step">
      <span className="tm-tag tm-tag-tool">{s.tool.toUpperCase()}</span>
      <span className="tm-step-body">
        <span className="tm-args">{argStr(s.args)}</span>
        {s.awaitingApprovalId ? (
          <div className="tm-approval">
            <div className="tm-approval-h">HUMAN GATE — {s.tool === "workspace_write" ? "write a file to the local workspace" : "risky action"}</div>
            <div className="tm-approval-btns">
              <button className="control" onClick={() => onApprove(s.awaitingApprovalId!, true)}>Approve</button>
              <button className="ghost danger" onClick={() => onApprove(s.awaitingApprovalId!, false)}>Deny</button>
            </div>
          </div>
        ) : s.denied ? (
          <span className="tm-denied">denied by the human gate — nothing executed</span>
        ) : s.output !== undefined ? (
          <pre className="tm-out">{s.output}</pre>
        ) : null}
        {s.ms !== undefined && !s.denied ? <span className="tm-ms">{s.ms}ms</span> : null}
      </span>
    </div>
  );
}

/* ── feedback (binds to the receipt, not a vibe) ──────────────────────────── */
function ReceiptFeedback({ receiptId, onRated }: { receiptId: string; onRated: () => void }): JSX.Element {
  const [score, setScore] = useState(0);
  const [note, setNote] = useState("");
  const [rated, setRated] = useState<number | null>(null);
  useEffect(() => {
    const ref = selfimpulseSession().receipts.find((r) => r.id === receiptId);
    if (ref && ref.feedback.length > 0) setRated(ref.feedback[ref.feedback.length - 1].score);
  }, [receiptId]);
  if (rated !== null) {
    return (
      <div className="tm-fb">
        <span className="tm-muted">rated {rated}/5 — bound to this receipt</span>
      </div>
    );
  }
  return (
    <div className="tm-fb">
      <span className="tm-muted">rate this run:</span>
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} className={`tm-star ${score >= n ? "on" : ""}`} onClick={() => setScore(n)} aria-label={`${n} stars`}>★</button>
      ))}
      <input
        className="tm-fb-note"
        placeholder="note (e.g. wrong answer / unsafe / slow)"
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      <button className="tm-fb-save" disabled={score === 0} onClick={() => { rateSelfImpulseRun(receiptId, score, note); setRated(score); onRated(); }}>
        save
      </button>
    </div>
  );
}

function MessageView({ m, onApprove }: { m: SelfImpulseMessage; onApprove: (id: string, ok: boolean) => void }): JSX.Element {
  if (m.role === "user") {
    return <div className="tm-msg tm-msg-user"><div className="tm-bubble-user">{m.text}</div></div>;
  }
  return (
    <div className="tm-msg tm-msg-bot">
      <div className="tm-avatar" title={`${BOT_NAME} — the accountable colleague`}>{BOT_NAME.slice(0, 1)}</div>
      <div className="tm-bubble-bot">
        {m.trace.length > 0 && (
          <div className="tm-trace">
            {m.trace.map((s, i) => {
              if (s.kind === "receipt") {
                const ref = selfimpulseSession().receipts.find((r) => r.id === s.receiptId);
                return (
                  <div key={i} className="tm-step">
                    <span className="tm-tag tm-tag-receipt">RECEIPT</span>
                    <span className="tm-step-body">
                      <span className="tm-mono">
                        {s.events} events · head {s.head.slice(0, 12)}… · {s.signed ? "ED25519 SIGNED" : "HMAC SEAL (no Ed25519 in this runtime)"}
                        {ref?.skillId ? " · skill linked" : ""}
                      </span>
                      <ReceiptFeedback receiptId={s.receiptId} onRated={() => {}} />
                    </span>
                  </div>
                );
              }
              return <TraceStepView key={i} s={s} onApprove={onApprove} />;
            })}
          </div>
        )}
        {m.text ? renderMiniMd(m.text) : null}
        {m.streaming && <span className="tm-cursor" />}
      </div>
    </div>
  );
}

/* ── the page ─────────────────────────────────────────────────────────────── */
export function SelfImpulsePage(): JSX.Element {
  const [sess, setSess] = useState<SelfImpulseSession>(() => selfimpulseSession());
  const [input, setInput] = useState("");
  const [verifyRes, setVerifyRes] = useState<Record<string, string>>({});
  const [memoryTab, setMemoryTab] = useState<"facts" | "prefs" | "skills" | "failures" | "missions">("facts");
  const [panelOpen, setPanelOpen] = useState(false);
  const [selMission, setSelMission] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => subscribeSelfImpulse(() => setSess(selfimpulseSession())), []);
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [sess.messages]);

  const busy = sess.messages.some((m) => m.streaming);
  const brain = selfimpulseBrain();

  /* M5-lite: the mission timeline — every event in the unified chain that
   * carries the selected mission ID (execution phases + the control-plane
   * bookends of the receipt that selfimpulseed them). */
  const missionTimeline = (() => {
    if (!selMission) return null;
    const out: Array<{ kind: string; phase: string; note: string }> = [];
    for (const r of sess.receipts) {
      let owns = false;
      for (const e of r.receipt.events) {
        const d = e.data as Record<string, unknown>;
        const mid = (d.missionId as string | undefined) ?? ((d.mission as { missionId?: string } | null)?.missionId);
        if (mid === selMission) owns = true;
      }
      if (!owns) continue;
      for (const e of r.receipt.events) {
        const d = e.data as Record<string, unknown>;
        const mid = (d.missionId as string | undefined) ?? ((d.mission as { missionId?: string } | null)?.missionId);
        const isMissionEvent = e.kind === "mission.event" && mid === selMission;
        const isDispatch = e.kind === "selfimpulse.dispatch" && mid === selMission;
        const isBookend = e.kind === "selfimpulse.session" || e.kind === "selfimpulse.verdict";
        if (!isMissionEvent && !isDispatch && !isBookend) continue;
        out.push({
          kind: e.kind,
          phase: isMissionEvent ? String(d.phase ?? "loop") : e.kind === "selfimpulse.dispatch" ? "dispatch" : e.kind.replace("selfimpulse.", ""),
          note: String(d.note ?? (e.kind === "selfimpulse.verdict" ? String(d.status ?? "") : "")).slice(0, 160),
        });
      }
    }
    return out;
  })();

  const send = (text?: string) => {
    const t = (text ?? input).trim();
    if (!t || busy) return;
    setInput("");
    void sendSelfImpulseMessage(t);
  };

  const approve = (id: string, ok: boolean) => resolveSelfImpulseApproval(id, ok);

  const downloadBlob = (content: string, name: string, type: string) => {
    if (typeof document === "undefined") return;
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 500);
  };

  const downloadJsonl = (id: string) => {
    const jsonl = selfimpulseReceiptJsonl(id);
    if (!jsonl) return;
    downloadBlob(jsonl, `selfimpulse-receipt-${id}.jsonl`, "application/jsonl");
  };

  const verify = (id: string) => {
    void verifySelfImpulseReceipt(id).then((r) =>
      setVerifyRes((v) => ({ ...v, [id]: r.ok ? `verified ok · ${r.events} events` : `FAILED: ${r.reason}` })),
    );
  };

  const files = selfimpulseWorkspaceFiles();
  const threads = sess.threads;
  const active = threads.find((t) => t.id === sess.activeThreadId);

  return (
    <div className="tm-root">
      <style>{`
        /* VH 16.9.1 — the chat face. ChatGPT/Claude posture: one centered column,
           generous air, tokens only (no hardcoded hue), motion with a job. */
        .tm-root{display:flex;height:100%;min-height:0;background:var(--bg);color:var(--text)}
        .tm-chat{flex:1;display:flex;flex-direction:column;min-width:0}
        .tm-threadstrip{display:flex;gap:8px;padding:10px 20px;align-items:center;border-bottom:1px solid var(--border);background:var(--bg);flex-wrap:wrap}
        .tm-threadtitle{font:600 11px var(--font-mono);letter-spacing:.1em;color:var(--text-mute);margin-right:auto}
        .tm-thread{font-size:11px;padding:4px 10px;border:1px solid var(--border);border-radius:14px;background:transparent;color:var(--text-dim);cursor:pointer;transition:border-color var(--t-fast),color var(--t-fast)}
        .tm-thread:hover{border-color:var(--border-strong);color:var(--text)}
        .tm-thread.active{border-color:var(--accent);color:var(--text)}
        .tm-thread.dropped{color:var(--text-mute);font-style:italic}
        .tm-thread-new{font-size:11px;padding:4px 10px;border:1px dashed var(--border-strong);border-radius:14px;background:transparent;color:var(--text-mute);cursor:pointer}
        .tm-thread-new:hover{border-color:var(--accent);color:var(--text)}
        .tm-panel-toggle{font-size:11px;padding:4px 10px;border:1px solid var(--border);border-radius:var(--r-md);background:transparent;color:var(--text-mute);cursor:pointer}
        .tm-panel-toggle:hover{color:var(--text);border-color:var(--border-strong)}
        .tm-scroll{flex:1;overflow-y:auto}
        .tm-col{max-width:760px;margin:0 auto;padding:28px 24px 12px;display:flex;flex-direction:column;gap:22px}
        .tm-hero{display:flex;flex-direction:column;align-items:center;text-align:center;gap:10px;padding:9vh 0 26px}
        .tm-hero-word{font-family:var(--font-doto);font-size:34px;letter-spacing:.04em;color:var(--text)}
        .tm-hero-sub{font-size:13.5px;color:var(--text-mute);max-width:52ch;line-height:1.6}
        .tm-starters{display:grid;grid-template-columns:1fr 1fr;gap:10px;width:100%;max-width:640px;margin-top:14px}
        .tm-starter{display:flex;flex-direction:column;gap:3px;text-align:left;padding:12px 14px;border:1px solid var(--border);border-radius:var(--r-lg);background:var(--bg-panel);cursor:pointer;transition:border-color var(--t-fast),transform var(--t-fast)}
        .tm-starter:hover{border-color:var(--accent);transform:translateY(-1px)}
        .tm-starter b{font-size:12.5px;font-weight:600;color:var(--text)}
        .tm-starter span{font-size:11px;color:var(--text-mute)}
        .tm-msg{display:flex;gap:12px;align-items:flex-start}
        .tm-msg-user{justify-content:flex-end}
        .tm-msg-user .tm-bubble-user{max-width:78%;background:var(--bg-panel);border:1px solid var(--border);border-radius:var(--r-lg);padding:10px 14px;font-size:13.5px;line-height:1.6;white-space:pre-wrap;animation:si-msg-in 200ms cubic-bezier(.22,1,.36,1)}
        .tm-avatar{flex:none;width:24px;height:24px;border-radius:var(--r-md);border:1px solid var(--border-strong);display:flex;align-items:center;justify-content:center;font:700 11px var(--font-mono);color:var(--accent);margin-top:2px}
        .tm-bubble-bot{flex:1;min-width:0;font-size:13.5px;line-height:1.65;animation:si-msg-in 200ms cubic-bezier(.22,1,.36,1)}
        .tm-bubble-bot .tm-p{margin:0 0 8px}
        .tm-bubble-bot .tm-p:last-child{margin-bottom:0}
        .tm-bubble-bot code{font:12px var(--font-mono);background:var(--bg-panel);border:1px solid var(--border);border-radius:4px;padding:1px 5px}
        .tm-bubble-bot pre{background:var(--bg-panel);border:1px solid var(--border);border-radius:var(--r-md);padding:10px 12px;overflow-x:auto;font:12px/1.5 var(--font-mono)}
        .tm-bubble-bot table{border-collapse:collapse;margin:6px 0}
        .tm-bubble-bot th,.tm-bubble-bot td{border:1px solid var(--border);padding:4px 8px;font-size:12px;text-align:left}
        .tm-composer{border-top:1px solid var(--border);padding:14px 24px 18px;background:var(--bg)}
        .tm-composer-inner{max-width:760px;margin:0 auto;display:flex;flex-direction:column;gap:8px}
        .tm-mode-row{display:flex;gap:6px;align-items:center}
        .tm-mode{font:600 10px var(--font-mono);letter-spacing:.1em;padding:4px 10px;border:1px solid var(--border);border-radius:var(--r-sm);background:transparent;color:var(--text-mute);cursor:pointer;transition:border-color var(--t-fast),color var(--t-fast)}
        .tm-mode:hover{color:var(--text)}
        .tm-mode.on{border-color:var(--accent);color:var(--accent)}
        .tm-inputrow{display:flex;gap:10px;align-items:flex-end;border:1px solid var(--border-strong);border-radius:14px;background:var(--bg-input);padding:8px 8px 8px 14px;transition:border-color var(--t-fast),box-shadow var(--t-fast)}
        .tm-inputrow:focus-within{border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-dim)}
        .tm-input{flex:1;resize:none;border:none;background:transparent;font:13.5px/1.5 var(--font-ui);color:var(--text);min-height:24px;max-height:160px;padding:4px 0}
        .tm-input:focus{outline:none}
        .tm-send{flex:none;border-radius:10px;padding:7px 14px}
        .tm-rail{display:none;width:340px;flex:none;border-left:1px solid var(--border);overflow-y:auto;padding:16px;background:var(--bg)}
        .tm-rail.open{display:block;animation:si-panel-in 200ms cubic-bezier(.22,1,.36,1)}
        .tm-sec{font:600 10px var(--font-mono);letter-spacing:.14em;color:var(--text-mute);margin-bottom:8px}
        .tm-ident{padding:12px;border:1px solid var(--border);border-radius:var(--r-lg);background:var(--bg-panel)}
        .tm-ident-name{font:700 15px var(--font-mono);letter-spacing:.06em}
        .tm-ident-sub{font-size:11px;color:var(--text-mute);margin-top:2px;line-height:1.5}
        .tm-badge{display:inline-block;margin-top:8px;font:600 10px var(--font-mono);letter-spacing:.08em;padding:2px 8px;border-radius:4px;border:1px solid var(--accent);color:var(--accent)}
        .tm-chips{display:flex;flex-wrap:wrap;gap:8px;margin:4px 0 12px}
        .tm-chip{font-size:12px;padding:6px 10px;border:1px solid var(--border);border-radius:16px;background:transparent;color:var(--text-dim);cursor:pointer;transition:border-color var(--t-fast),color var(--t-fast)}
        .tm-chip:hover{border-color:var(--accent);color:var(--text)}
        @media (prefers-reduced-motion: reduce){.tm-bubble-user,.tm-bubble-bot,.tm-rail.open{animation:none!important}}
      `}</style>

      <section className="tm-chat">
        <div className="tm-threadstrip">
          <span className="tm-threadtitle">{active ? active.title : "SelfImpulse"}</span>
          <button className="tm-panel-toggle" onClick={() => setPanelOpen((v) => !v)} title="Memory, missions, receipts — the machinery drawer">
            {panelOpen ? "Hide panel" : "Panel"}
          </button>
          {threads.map((t) => (
            <button
              key={t.id}
              className={`tm-thread ${t.id === sess.activeThreadId ? "active" : ""} ${t.status === "dropped" ? "dropped" : ""}`}
              title={t.status === "dropped" ? `dropped — “continue ${t.title}” resumes it` : "open"}
              onClick={() => setActiveSelfImpulseThread(t.id)}
            >
              {t.status === "dropped" ? "⌛ " : "● "}{t.title}
            </button>
          ))}
          <button
            className="tm-thread-new"
            onClick={() => {
              const t = typeof window !== "undefined" ? window.prompt("Thread name:", "New thread") : "New thread";
              if (t !== null) newSelfImpulseThread(t.trim() || "New thread");
            }}
          >
            + new thread
          </button>
        </div>
        <div className="tm-scroll" ref={scrollRef}>
          <div className="tm-col">
          {sess.messages.length === 0 && (
            <div className="tm-hero">
              <div className="tm-hero-word">SelfImpulse</div>
              <div className="tm-hero-sub">
                Your accountable colleague — every request runs a full cycle:
                recall → plan → think → simulate → act → <b>selfimpulse</b> → learn.
                Risky actions pause at your gate. Every finished run mints a signed,
                offline-verifiable receipt. Everything stays on this machine.
              </div>
              <div className="tm-starters">
                <button className="tm-starter" onClick={() => send("What time is it in Chennai right now?")}><b>Live fact</b><span>real-time answer, evidenced</span></button>
                <button className="tm-starter" onClick={() => send("Calculate (12 * 8) + (144 / 9)")}><b>Compute</b><span>deterministic, receipt-stamped</span></button>
                <button className="tm-starter" onClick={() => send("Write a file called hello.txt: SelfImpulse — every job receipted")}><b>Act (gated)</b><span>simulated first, your approval</span></button>
                <button className="tm-starter" onClick={() => send("Dispatch a mission: summarize what this runtime is")}><b>Dispatch a mission</b><span>the full governed loop</span></button>
              </div>
            </div>
          )}
          {sess.messages.map((m) => (
            <MessageView key={m.id} m={m} onApprove={approve} />
          ))}
          </div>
        </div>
        <div className="tm-composer">
          <div className="tm-composer-inner">
          <div className="tm-mode-row" role="group" aria-label="Cycle depth">
            <button className={"tm-mode" + (sess.mode === "quick" ? " on" : "")} onClick={() => setSelfImpulseMode("quick" as SelfImpulseMode)}>QUICK</button>
            <button className={"tm-mode" + (sess.mode === "deep" ? " on" : "")} onClick={() => setSelfImpulseMode("deep" as SelfImpulseMode)}>DEEP ⚡</button>
          </div>
          <div className="tm-inputrow">
          <textarea
            className="tm-input"
            rows={1}
            placeholder={`Message ${BOT_NAME} — Enter sends, Shift+Enter for a new line · “continue <thread>” resumes a dropped thread`}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
          />
          {busy ? (
              <button className="ghost danger" onClick={() => stopSelfImpulse()}>Stop</button>
            ) : (
              <button className="primary tm-send" onClick={() => send()} disabled={!input.trim()}>Send</button>
            )}
          </div>
          </div>
        </div>
      </section>

      <aside className={`tm-rail${panelOpen ? " open" : ""}`} aria-label="SelfImpulse context">
        <div className="tm-ident">
          <div className="tm-ident-name">{BOT_NAME}</div>
          <div className="tm-ident-sub">The accountable colleague · SelfImpulse Cycle: recall → plan → think → simulate → act → selfimpulse → learn. Runs on this machine — nothing phones home.</div>
          <div style={{ display: "flex", gap: 8, marginTop: 10, alignItems: "center" }}>
            <span className="tm-sec" style={{ margin: 0 }}>PERSONA</span>
            <select className="tm-select" value={sess.persona} onChange={(e) => setSelfImpulsePersona(e.target.value as SelfImpulsePersona)}>
              <option value="witty">Witty</option>
              <option value="professional">Professional</option>
              <option value="minimal">Minimal</option>
            </select>
          </div>
          <div className="tm-badge">{brain.label.toUpperCase()}</div>
        </div>

        <div>
          <div className="tm-sec">MEMORY — local, inspectable, yours</div>
          <div className="tm-tabs">
            <button className={`tm-tab ${memoryTab === "facts" ? "on" : ""}`} onClick={() => setMemoryTab("facts")}>FACTS ({sess.facts.length})</button>
            <button className={`tm-tab ${memoryTab === "prefs" ? "on" : ""}`} onClick={() => setMemoryTab("prefs")}>PREFS ({sess.preferences.length})</button>
            <button className={`tm-tab ${memoryTab === "skills" ? "on" : ""}`} onClick={() => setMemoryTab("skills")}>SKILLS ({sess.skills.length})</button>
            <button className={`tm-tab ${memoryTab === "failures" ? "on" : ""}`} onClick={() => setMemoryTab("failures")}>FAILURES ({sess.failures.length})</button>
            <button className={`tm-tab ${memoryTab === "missions" ? "on" : ""}`} onClick={() => setMemoryTab("missions")}>MISSIONS ({selfimpulseMissions().length})</button>
          </div>
          {memoryTab === "facts" && (
            <>
              {sess.facts.length === 0 ? (
                <div className="tm-empty">Nothing remembered yet. Try “remember: …”</div>
              ) : (
                sess.facts.map((f) => (
                  <div key={f.id} className="tm-row">
                    <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.text}</span>
                    <button className="tm-row-x" title="Forget this" onClick={() => removeSelfImpulseFact(f.id)}>✕</button>
                  </div>
                ))
              )}
            </>
          )}
          {memoryTab === "prefs" && (
            <>
              {sess.preferences.length === 0 ? (
                <div className="tm-empty">No preferences learned. Try “from now on: …”</div>
              ) : (
                sess.preferences.map((p) => (
                  <div key={p.id} className="tm-row">
                    <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.text}</span>
                    <button className="tm-row-x" title="Delete preference" onClick={() => removeSelfImpulsePreference(p.id)}>✕</button>
                  </div>
                ))
              )}
            </>
          )}
          {memoryTab === "skills" && (
            <>
              {sess.skills.length === 0 ? (
                <div className="tm-empty">No skills yet — successful runs distill test-gated skills here.</div>
              ) : (
                sess.skills.map((k) => (
                  <div key={k.id} className={`tm-skill ${k.flagged ? "flagged" : ""}`}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6 }}>
                      <span className="tm-skill-name">{k.name} v{k.version}{k.flagged ? <span className="tm-skill-flag"> · ⚑ flagged — review</span> : null}</span>
                      <button className="tm-row-x" title="Delete skill" onClick={() => removeSelfImpulseSkill(k.id)}>✕</button>
                    </div>
                    <div className="tm-muted">{k.when}</div>
                    <div className="tm-muted" style={{ marginTop: 3 }}>{k.steps.join(" → ")}</div>
                    <div className="tm-mono" style={{ marginTop: 3 }}>tool: {k.tool} · runs {k.runs} · wins {k.wins} · avg {k.avgScore ?? "n/a"}</div>
                    {k.mission ? (
                      <div className="tm-muted" style={{ marginTop: 2 }}>M4 provenance: {k.mission.missionId} · crew "{k.mission.team}" · {k.mission.verifiedSeats}/{k.mission.seatCount} verified · cycle {k.mission.cycleNo}</div>
                    ) : null}
                    <div className="tm-muted" style={{ marginTop: 2 }}>provenance: receipt {k.bornReceiptId.slice(0, 14)}…</div>
                  </div>
                ))
              )}
            </>
          )}
          {memoryTab === "failures" && (
            <>
              {sess.failures.length === 0 ? (
                <div className="tm-empty">Failure memory is empty — rejected skill mutations land here.</div>
              ) : (
                sess.failures.map((x) => (
                  <div key={x.id} className="tm-skill">
                    <div className="tm-skill-name">{x.what}</div>
                    <div className="tm-muted">{x.reason}</div>
                  </div>
                ))
              )}
            </>
          )}
          {memoryTab === "missions" && (
            <>
              {selfimpulseMissions().length === 0 ? (
                <div className="tm-empty">No dispatched missions yet. Ask me to run a mission — the real execution core runs it, and the whole trail lands in one selfimpulseed chain.</div>
              ) : (
                selfimpulseMissions().map((m) => (
                  <div
                    key={m.missionId}
                    className={`tm-skill ${selMission === m.missionId ? "tm-skill-on" : ""}`}
                    style={{ cursor: "pointer" }}
                    title="Click for the mission timeline"
                    onClick={() => setSelMission(selMission === m.missionId ? null : m.missionId)}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6 }}>
                      <span className="tm-skill-name tm-mono">{m.missionId}</span>
                      <span className={`tm-tag ${m.receiptOk ? "" : "tm-tag-receipt"}`}>{m.status.toUpperCase()}</span>
                    </div>
                    <div className="tm-muted" style={{ marginTop: 2 }}>{m.objective}</div>
                    <div className="tm-mono" style={{ marginTop: 3 }}>
                      crew "{m.teamName}" · execution core + control plane
                    </div>
                    <div className="tm-muted" style={{ marginTop: 2 }}>
                      cycle {m.cycleNo} · {m.verifiedSeats}/{m.seatCount} seats verified · gate {m.gateStatus ?? "n/a"} · receipt {m.receiptOk ? "signed" : "missing"} · {m.runMs}ms
                    </div>
                    {selMission === m.missionId && missionTimeline && (
                      <div className="tm-timeline">
                        {missionTimeline.map((ev, i) => (
                          <div key={i} className="tm-tl-step">
                            <span className={`tm-tag ${ev.kind.startsWith("mission") ? "tm-tag-mission" : ""}`}>{ev.phase.toUpperCase()}</span>
                            {ev.note ? <span className="tm-muted" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ev.note}</span> : null}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))
              )}
            </>
          )}
          <button className="tm-chip" style={{ marginTop: 6 }} onClick={() => downloadBlob(exportSelfImpulseMemoryMarkdown(), "selfimpulse-memory-export.md", "text/markdown")}>
            ⬇ export memory (.md — local, yours)
          </button>
        </div>

        <div>
          <div className="tm-sec">WORKSPACE — files written here</div>
          {files.length === 0 ? (
            <div className="tm-empty">Empty. Ask me to write a file — I'll simulate it, then ask first.</div>
          ) : (
            files.map((f) => (
              <div key={f.name} className="tm-row">
                <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</span>
                <span className="tm-ms">{f.chars} chars</span>
              </div>
            ))
          )}
        </div>

        <div>
          <div className="tm-sec">RECEIPTS — every job, selfimpulseed</div>
          {sess.receipts.length === 0 ? (
            <div className="tm-empty">No runs yet. Every finished job mints one.</div>
          ) : (
            [...sess.receipts].reverse().map((r) => (
              <div key={r.id} className="tm-receipt">
                <div className="tm-receipt-h">{r.mission}</div>
                <div className="tm-mono">{r.events} events · head {r.head.slice(0, 14)}… · {r.signed ? "ed25519 signed" : "hmac seal (runtime unsigned)"}{(r.feedback ?? []).length > 0 ? ` · rated ${r.feedback[r.feedback.length - 1].score}/5` : ""}</div>
                <div className="tm-receipt-btns">
                  <button onClick={() => verify(r.id)}>verify (offline)</button>
                  <button onClick={() => downloadJsonl(r.id)}>export .jsonl</button>
                </div>
                {verifyRes[r.id] && <div className={`tm-verify ${verifyRes[r.id].startsWith("FAILED") ? "bad" : ""}`}>{verifyRes[r.id]}</div>}
              </div>
            ))
          )}
        </div>

        <div className="tm-ident-sub" style={{ marginTop: "auto" }}>
          {sess.facts.length} facts · {sess.preferences.length} prefs · {sess.skills.length} skills · {sess.receipts.length} receipts · brain: {brain.id}
        </div>
      </aside>
    </div>
  );
}

export default SelfImpulsePage;
