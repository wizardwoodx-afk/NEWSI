import React, { useState } from "react";
import { useVh } from "../store";

const TIER: Record<string, string> = { safe: "tier 1", risky: "tier 2", critical: "tier 3" };

/** The human gate — the one thing that interrupts the user. Approve or refuse; both are receipted. */
export function GateCard(): React.ReactElement | null {
  const { gate, decideGate } = useVh();
  const [reason, setReason] = useState("");
  const [refusing, setRefusing] = useState(false);
  if (!gate) return null;
  const { ask } = gate;
  return (
    <div className="gatebox">
      <div className="h"><span className="led warn" />Your approval is needed <span className="tier">risk {TIER[ask.riskTier] ?? ask.riskTier}</span></div>
      <p>{ask.summary}</p>
      <code>{`action   ${ask.action}\nby       ${ask.specialistIds.map((_, i) => `AGENT ${String(i + 1).padStart(2, "0")}`).join(", ") || "the crew"}\nreceipt  issued on approve AND on refuse`}</code>
      {!refusing ? (
        <div className="acts">
          <button className="btn primary" onClick={() => decideGate({ approved: true })}>Approve once</button>
          <button className="btn" onClick={() => setRefusing(true)}>Refuse</button>
        </div>
      ) : (
        <div className="acts" style={{ flexDirection: "column", alignItems: "stretch" }}>
          <input className="input" autoFocus placeholder="Why? (recorded in the receipt)" value={reason} onChange={(e) => setReason(e.target.value)} />
          <div className="acts reason"><button className="btn primary" onClick={() => decideGate({ approved: false, reason: reason.trim() || "refused by the owner" })}>Confirm refusal</button><button className="btn ghost" onClick={() => setRefusing(false)}>Back</button></div>
        </div>
      )}
    </div>
  );
}
