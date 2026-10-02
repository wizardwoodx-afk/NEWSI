import React, { useEffect, useMemo, useState } from "react";
import { useVh } from "../store";
import { globalReceiptVault } from "../../mission/receiptVault";

interface ChainAudit { total: number; valid: number; broken: Array<{ id: string; reason: string }> }

export function Receipts(): React.ReactElement {
  const st = useVh();
  const all = useMemo(() => st.receipts(), [st.msgs, st.handoffs, st.gate, st.gateLog]); // eslint-disable-line react-hooks/exhaustive-deps
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  /* The KPI used to be a count of rows whose state string read "ok", labelled
     "Verified". This is the real thing: ReceiptVault.audit() re-canonicalises
     every stored chain and re-checks its seal and issuer signature. */
  const [audit, setAudit] = useState<ChainAudit | null>(null);
  useEffect(() => {
    let live = true;
    void globalReceiptVault.audit().then((r) => { if (live) setAudit(r); });
    return () => { live = false; };
  }, [st.msgs]);
  const rows = all.filter((r) => !q || (r.title + r.signer + r.digest + r.kind).toLowerCase().includes(q.toLowerCase()));
  const ok = all.filter((r) => r.state === "ok").length, refused = all.filter((r) => r.state === "refused").length, pending = all.filter((r) => r.state === "pending").length, errored = all.filter((r) => r.state === "error").length;
  const runs = st.msgs.filter((m) => m.resp).length;
  const fmt = (iso: string) => { if (!iso) return "—"; try { const d = new Date(iso); return `${d.toLocaleDateString([], { month: "short", day: "2-digit" })} · ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`; } catch { return "—"; } };

  return (
    <>
      <header className="top"><h2>Receipts</h2><span className="sub">a tamper-proof log of everything the agents did · {all.length} this session</span>
        <div className="right"><input className="input sm" placeholder="Search receipts" value={q} onChange={(e) => setQ(e.target.value)} /><button className="btn sm" onClick={() => download(all)} disabled={!all.length}>Export JSON</button></div></header>
      <div className="scroll"><div className="page narrow">
        <div className="kpis">
          <div><b>{audit ? `${audit.valid}/${audit.total}` : "—"}</b><span>Chains audited</span></div>
          <div><b>{ok}</b><span>Recorded</span></div>
          <div><b>{pending}</b><span>Waiting on you</span></div>
          <div><b>{refused}</b><span>Refused</span></div>
          <div><b>{errored}</b><span>Errored</span></div>
          <div><b>{runs}</b><span>Runs</span></div>
          <div><b>{st.savedTokens}</b><span>Tokens saved</span></div>
        </div>
        {audit && audit.broken.length > 0 && (
          <div className="tamper" role="alert">
            <b>{audit.broken.length} stored {audit.broken.length === 1 ? "chain fails" : "chains fail"} verification.</b>
            <span> {audit.broken.slice(0, 3).map((b) => `${b.id} — ${b.reason}`).join(" · ")}</span>
            {audit.broken.length > 3 && <span> · {audit.broken.length - 3} more</span>}
          </div>
        )}
        {rows.length === 0 ? (
          <div className="empty"><h3>{all.length ? "No matches" : "No receipts yet"}</h3><p>{all.length ? "Try another search." : "Every run, tool call and approval leaves one here — the honest record of what happened."}</p></div>
        ) : (
          <div className="ledger">
            <div className="lh"><span>When</span><span>What</span><span>Signer</span><span>Digest</span><span /></div>
            {rows.map((r) => (
              <React.Fragment key={r.id}>
                <button className={`lr ${open === r.id ? "open" : ""}`} onClick={() => setOpen(open === r.id ? null : r.id)}>
                  <span className="mono">{fmt(r.at)}</span>
                  <span className="t"><b>{r.title}</b><small>{r.kind}</small></span>
                  <span className="mono">{r.signer}</span>
                  <span className="mono dig">{r.digest === "—" ? "—" : r.digest.slice(0, 12) + "…"}</span>
                  <span className={`dot ${r.state}`} />
                </button>
                {open === r.id && <div className="ld"><code>{r.digest}</code><div className="acts"><button className="btn sm" onClick={() => void navigator.clipboard?.writeText(r.digest)}>Copy digest</button><span className="hint">{r.state === "ok" ? "Lists this run's provenance digest. Chain verification is a separate step — export and run tools/verify-receipt.mjs." : r.state === "pending" ? "Waiting for your decision in Work." : r.state === "error" ? "Errored — recorded exactly as it happened." : "Refused — recorded exactly as it happened."}</span></div></div>}
              </React.Fragment>
            ))}
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
