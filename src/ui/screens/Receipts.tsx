import React, { useEffect, useMemo, useState } from "react";
import { useVh } from "../store";
import { globalReceiptVault } from "../../mission/receiptVault";

interface ChainAudit { total: number; valid: number; broken: Array<{ id: string; reason: string }> }

const KIND: Record<string, string> = {
  run: "run", tool: "tool call", synthesis: "answer", handoff: "peer handoff", gate: "your decision", ingest: "file",
};

/** The badge word carries the meaning; the row's dot only echoes it, so a colour-blind operator loses nothing. */
const STATE: Record<string, { pill: string; word: string; note: string }> = {
  ok: { pill: "ok", word: "Recorded", note: "" },
  pending: { pill: "warn", word: "Waiting on you", note: "" },
  refused: { pill: "bad", word: "Refused", note: "You or a control said no, so it stopped here." },
  error: { pill: "bad", word: "Failed", note: "The run stopped with a failure and did not complete." },
};

export function Receipts(): React.ReactElement {
  const st = useVh();
  const all = useMemo(() => st.receipts(), [st.msgs, st.handoffs, st.gate, st.gateLog]); // eslint-disable-line react-hooks/exhaustive-deps
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  /* audit() re-canonicalises every stored receipt and re-checks its seal and issuer
     signature — a row reading "Recorded" is a count, not a verification. */
  const [audit, setAudit] = useState<ChainAudit | null>(null);
  useEffect(() => {
    let live = true;
    void globalReceiptVault.audit().then((r) => { if (live) setAudit(r); });
    return () => { live = false; };
  }, [st.msgs]);
  const rows = all.filter((r) => !q || (r.title + r.signer + r.digest + r.kind).toLowerCase().includes(q.toLowerCase()));
  const ok = all.filter((r) => r.state === "ok").length, refused = all.filter((r) => r.state === "refused").length, pending = all.filter((r) => r.state === "pending").length, errored = all.filter((r) => r.state === "error").length;
  const one = (n: number, s: string, p: string) => (n === 1 ? s : p);
  /* The vault holds receipts sealed on this machine — a different set from the rows
     below, so the tile states only the check audit() actually ran. */
  const seal = audit === null
    ? { v: "—", l: "Seal check has not run yet" }
    : audit.total === 0
      ? { v: "—", l: "Nothing sealed on this machine yet" }
      : audit.broken.length > 0
        ? { v: String(audit.broken.length), l: `Sealed ${one(audit.broken.length, "receipt", "receipts")} failed the seal check` }
        : { v: String(audit.total), l: `Sealed ${one(audit.total, "receipt", "receipts")} re-checked, ${one(audit.total, "seal", "seals")} intact` };
  const fmt = (iso: string) => { if (!iso) return "—"; try { const d = new Date(iso); return `${d.toLocaleDateString([], { month: "short", day: "2-digit" })} · ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`; } catch { return "—"; } };

  return (
    <>
      <header className="top"><h2>Receipts</h2><span className="sub">{rows.length === all.length ? `${all.length} in this ledger` : `${rows.length} of ${all.length} match “${q}”`}</span>
        <div className="right"><input className="input sm" aria-label="Search receipts" placeholder="Search receipts" value={q} onChange={(e) => setQ(e.target.value)} /><button className="btn sm" onClick={() => download(all)} disabled={!all.length} title="Downloads every receipt, not only the ones the search shows">Export all as JSON</button></div></header>
      <div className="scroll"><div className="page narrow">
        <div className="kpis">
          <div><b>{seal.v}</b><span>{seal.l}</span></div>
          <div><b>{ok}</b><span>Recorded in this ledger</span></div>
          <div><b>{pending}</b><span>Waiting on you</span></div>
          <div><b>{refused}</b><span>Refused by you or by policy</span></div>
          <div><b>{errored}</b><span>Failed to finish</span></div>
        </div>
        {audit && audit.broken.length > 0 && (
          <div className="tamper" role="alert">
            <b>{`${audit.broken.length} of ${audit.total} sealed ${one(audit.total, "receipt", "receipts")} on this machine failed the seal check.`}</b>
            <span> Reasons it gave: {audit.broken.slice(0, 3).map((b) => `${b.id} — ${b.reason}`).join(" · ")}</span>
            {audit.broken.length > 3 && <span> · and {audit.broken.length - 3} more</span>}
          </div>
        )}
        {rows.length === 0 ? (
          <div className="empty"><h3>{all.length ? `Nothing here matches “${q}”` : "No receipts yet"}</h3>{!all.length && <p className="hint">Finished runs, your gate decisions and files that came through a door are recorded here.</p>}</div>
        ) : (
          <div className="ledger">
            <div className="legend">
              <span>The dot at the right of a row is its outcome:</span>
              <span><i className="dot ok" />recorded</span>
              <span><i className="dot pending" />waiting on you</span>
              <span><i className="dot refused" />refused</span>
              <span><i className="dot error" />failed</span>
            </div>
            <div className="lh"><span>When</span><span>What</span><span>Source</span><span>Proof hash</span><span /></div>
            {rows.map((r) => {
              const s = STATE[r.state];
              /* Only the live gate waits on the operator; a row still open closes on its own. */
              const note = r.state !== "pending" ? s.note : r.kind === "gate" ? "It stops until you decide — answer it in Work." : "Still open — it records when the run finishes.";
              return (
                <React.Fragment key={r.id}>
                  <button className={`lr ${open === r.id ? "open" : ""}`} aria-expanded={open === r.id} onClick={() => setOpen(open === r.id ? null : r.id)}>
                    <span className="mono">{fmt(r.at)}</span>
                    <span className="t"><b>{r.title}</b><small>{KIND[r.kind] ?? r.kind} · <span className={`pill ${s.pill}`}>{s.word}</span></small></span>
                    <span className="mono">{r.signer}</span>
                    <span className="mono dig">{r.digest === "—" ? "—" : r.digest.slice(0, 12) + "…"}</span>
                    <span className={`dot ${r.state}`} aria-hidden="true" />
                  </button>
                  {open === r.id && <div className="ld">{r.digest !== "—" && <code>{r.digest}</code>}<div className="acts">{r.digest !== "—" && <button className="btn sm" onClick={() => void navigator.clipboard?.writeText(r.digest)}>Copy proof hash</button>}{note && <span className="hint">{note}</span>}</div></div>}
                </React.Fragment>
              );
            })}
          </div>
        )}
      </div></div>
    </>
  );
}

function download(rows: unknown[]) {
  const blob = new Blob([JSON.stringify(rows, null, 2)], { type: "application/json" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `selfimpulse-hand-receipts-${Date.now()}.json`; a.click(); URL.revokeObjectURL(a.href);
}
