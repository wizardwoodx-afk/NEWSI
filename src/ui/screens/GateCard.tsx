import React, { useEffect, useRef, useState } from "react";
import { useVh } from "../store";

const TIER: Record<string, string> = { safe: "tier 1", risky: "tier 2", critical: "tier 3" };

/** How long the engine's own quote of the request is allowed to run. The cap is
 *  restated here rather than imported because a screen reaching into the generalist
 *  front door is forbidden outright (probe/patinaShell), and because a card that
 *  does not know where the quote ends has no business adding an ellipsis. */
const QUOTE_CAP = 120;

/** A quote trimmed inside a word — "Report wha" — reads as a string that broke, not
 *  as an excerpt that continues. Step back to the last whole word and let a real
 *  ellipsis say the rest exists. */
function wholeWords(quoted: string): string {
  const stopsInsideAWord = /[^\s.,;:!?)\]"']$/.test(quoted);
  const space = quoted.lastIndexOf(" ");
  const kept = stopsInsideAWord && space > 0 ? quoted.slice(0, space) : quoted;
  return `${kept.trimEnd()}…`;
}

/** The routing gate names the request and the crew in one sentence; every other gate
 *  (a tool, a delegation) is already a plain clause. Split the sentence when it has
 *  this shape and leave it alone when it does not — a card that mis-parses its own
 *  subject is worse than one that reads slightly long. */
function readAction(action: string): { said: string; request: string } | null {
  const m = /^(?<said>[^"]*?)\s?"(?<request>.+)"\s+to\s+[^"]+$/s.exec(action);
  const parts = m?.groups;
  if (!parts?.said || !parts.request) return null;
  return { said: parts.said, request: parts.request };
}

/** The human gate — the one thing that interrupts the user. Approve or refuse; both are receipted. */
export function GateCard(): React.ReactElement | null {
  const { gate, decideGate } = useVh();
  const [reason, setReason] = useState("");
  const [refusing, setRefusing] = useState(false);
  const ask = gate?.ask ?? null;

  const routed = ask ? readAction(ask.action) : null;
  const quoted = routed ? (routed.request.length >= QUOTE_CAP ? wholeWords(routed.request) : routed.request.trimEnd()) : null;
  const who = (ask?.specialistIds ?? []).map((_, i) => `AGENT ${String(i + 1).padStart(2, "0")}`).join(", ") || "the crew";
  const what = routed && quoted ? `${routed.said}: “${quoted}”` : (ask?.action ?? "");
  const risk = `risk ${TIER[ask?.riskTier ?? ""] ?? ask?.riskTier ?? "tier unstated"}`;
  const why = (ask?.summary ?? "").split(";").map((s) => s.trim()).filter(Boolean);

  /* The gate is the one place taking focus is right: the run cannot continue until a
     human decides. The arrival is spoken first, and spoken on the NEXT tick — a live
     region created at the same instant as its own content is frequently silent.
     What is spoken is the decision and its stakes, never the router's notes. */
  const [arrival, setArrival] = useState("");
  useEffect(() => {
    if (!ask) return;
    const t = setTimeout(() => setArrival(`Your approval is needed. ${what}. ${risk}.`), 0);
    return () => clearTimeout(t);
  }, [ask, what, risk]);

  /* Escape backs out of typing a reason, never out of the gate: refusing on a stray
     keystroke would write a decision the owner never made. */
  const refuseBtn = useRef<HTMLButtonElement>(null);
  const cancelRefusal = () => { setRefusing(false); refuseBtn.current?.focus(); };

  useEffect(() => {
    if (!gate || !refusing) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      cancelRefusal();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [gate, refusing]);

  if (!gate || !ask) return null;
  return (
    /* A named GROUP so the whole decision is one navigable stop under one name,
       rather than a bare pile of buttons and a code block. */
    <div className="gatebox" role="group" aria-labelledby="gate-heading" aria-describedby="gate-receipt">
      <p className="sr" role="status" aria-live="polite" aria-atomic="true">{arrival}</p>
      <div className="h" id="gate-heading"><span className="led warn" />Your approval is needed<span className="tier">{risk}</span></div>

      {/* In the order a decision actually needs: what happens, then who does it.
          The tier moved up into the status row, which is where a person looks for
          "how much should I care about this" before they have read the sentence. */}
      <p style={{ margin: "12px 0 0" }}>{what}</p>
      <p style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: "4px 14px", margin: "8px 0 0" }}>
        <span className="agent-tag">by {who}</span>
      </p>
      {/* It carries an id because it states the CONSEQUENCE of what is about to
          happen, which makes it the description for the refusal field below. */}
      <p className="hint" id="gate-receipt" style={{ margin: "10px 0 0" }}>
        Approving lets it run now; refusing stops it. Either way the decision is receipted.
      </p>

      {/* Every mark the router made is still here — the matched keywords, the
          capability overlap, the engine's own untouched line — behind one label that
          says whose notes they are. An auditable trail is not the same thing as an
          auditable first screen: reachable, and no longer in the way. */}
      <details style={{ margin: "12px 0 0" }}>
        <summary style={{ cursor: "pointer" }}>Why this was flagged</summary>
        {why.length > 0 && (
          <ul style={{ margin: "8px 0 0", paddingLeft: "18px", listStyle: "disc" }}>
            {why.map((w) => <li key={w} className="hint">{w}</li>)}
          </ul>
        )}
        <code id="gate-record" style={{ display: "block", margin: "8px 0 0", whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{`action   ${ask.action}\nby       ${who}\nreceipt  issued on approve AND on refuse`}</code>
      </details>

      {!refusing ? (
        <div className="acts" style={{ marginTop: 16 }}>
          <button className="btn primary" onClick={() => decideGate({ approved: true })}>Approve</button>
          <button className="btn" ref={refuseBtn} onClick={() => setRefusing(true)}>Reject</button>
        </div>
      ) : (
        <div className="acts" style={{ flexDirection: "column", alignItems: "stretch", marginTop: 14 }}>
          {/* A placeholder disappears as soon as you type, so the name lives in aria-label. */}
          <input className="input" autoFocus aria-label="Reason for refusing, recorded in the receipt"
            aria-describedby="gate-receipt" placeholder="Why? (recorded in the receipt)"
            value={reason} onChange={(e) => setReason(e.target.value)} />
          <div className="acts reason"><button className="btn primary" onClick={() => decideGate({ approved: false, reason: reason.trim() || "refused by the owner" })}>Confirm refusal</button><button className="btn ghost" onClick={cancelRefusal}>Back</button></div>
        </div>
      )}
    </div>
  );
}
