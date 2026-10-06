import React, { useEffect, useRef, useState } from "react";
import { useVh } from "../store";

const TIER: Record<string, string> = { safe: "tier 1", risky: "tier 2", critical: "tier 3" };

/** The human gate — the one thing that interrupts the user. Approve or refuse; both are receipted. */
export function GateCard(): React.ReactElement | null {
  const { gate, decideGate } = useVh();
  const [reason, setReason] = useState("");
  const [refusing, setRefusing] = useState(false);
  const ask = gate?.ask ?? null;

  /* WHY FOCUS IS TAKEN, AND WHY IT IS SAYED FIRST.
     The gate is the one place in this product where taking focus is right: the
     run cannot continue until a human decides, so leaving focus somewhere else
     means the decision is invisible. `autoFocus` on the reason field stays.
     What was missing is the warning. Focus moving with no announcement is the
     behaviour screen-reader users describe as "the app grabbed something", so
     the arrival is spoken.
     The two-step below is deliberate and it is the part people get wrong: the
     live region is rendered on this first commit with NO text, and the sentence
     is injected on the next tick. A live region created at the same instant as
     its own content is frequently silent — the region has to exist first. */
  const [arrival, setArrival] = useState("");
  useEffect(() => {
    if (!ask) return;
    const t = setTimeout(() => setArrival(`Your approval is needed. ${ask.summary}`), 0);
    return () => clearTimeout(t);
  }, [ask]);

  /* The refusal step is escapable, and Escape CANCELS THE STEP rather than the
     gate. A gate is not allowed to resolve itself from a keystroke: refusing on
     Escape would be a decision the owner never made, and it would be written
     into the receipt as one. Escape therefore backs out of typing a reason and
     hands focus back to the "Refuse" button it came from, leaving the decision
     exactly where it was — undecided, visible, still waiting. */
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
      <div className="h" id="gate-heading"><span className="led warn" />Your approval is needed <span className="tier">risk {TIER[ask.riskTier] ?? ask.riskTier}</span></div>
      <p>{ask.summary}</p>
      {/* It carries an id because it states the CONSEQUENCE of what is about to
          happen, which makes it the description for the refusal field below. */}
      <code id="gate-receipt">{`action   ${ask.action}\nby       ${ask.specialistIds.map((_, i) => `AGENT ${String(i + 1).padStart(2, "0")}`).join(", ") || "the crew"}\nreceipt  issued on approve AND on refuse`}</code>
      {!refusing ? (
        <div className="acts">
          <button className="btn primary" onClick={() => decideGate({ approved: true })}>Approve once</button>
          <button className="btn" ref={refuseBtn} onClick={() => setRefusing(true)}>Refuse</button>
        </div>
      ) : (
        <div className="acts" style={{ flexDirection: "column", alignItems: "stretch" }}>
          {/* The reason field had a placeholder and nothing else, and a placeholder
              disappears the moment you type — so the control announced itself only
              while empty and then said nothing at all. aria-label carries the name
              permanently; aria-describedby points at the receipt line that records
              whatever is typed here. */}
          <input className="input" autoFocus aria-label="Reason for refusing, recorded in the receipt"
            aria-describedby="gate-receipt" placeholder="Why? (recorded in the receipt)"
            value={reason} onChange={(e) => setReason(e.target.value)} />
          <div className="acts reason"><button className="btn primary" onClick={() => decideGate({ approved: false, reason: reason.trim() || "refused by the owner" })}>Confirm refusal</button><button className="btn ghost" onClick={cancelRefusal}>Back</button></div>
        </div>
      )}
    </div>
  );
}