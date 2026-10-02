import React, { useState } from "react";
import { useVh, type Receipt } from "../store";
import { Composer } from "./Composer";

/* What the receipt actually is, in one word. This is read off the signer the
   engine already stamps on every row — it is not a score, and it is not
   decorative. A tool receipt is hashed into the chain; a gate decision is a
   human; a run with a mandate is signed by the owner key. */
function proofOf(r: Receipt): { word: string; cls: string } {
  if (r.state === "pending") return { word: "waiting", cls: "wait" };
  if (r.kind === "gate") return { word: "human", cls: "human" };
  if (r.kind === "ingest") return { word: r.state === "ok" ? "read" : "refused", cls: r.state === "ok" ? "hash" : "bad" };
  if (r.state === "refused") return { word: "refused", cls: "bad" };
  if (r.state === "error") return { word: "failed", cls: "bad" };
  if (r.signer.includes("owner")) return { word: "signed", cls: "sign" };
  return { word: "hashed", cls: "hash" };
}

export function Steward(): React.ReactElement {
  const { provider, go, send, busy, receipts, workspace, addFiles } = useVh();
  const [draft, setDraft] = useState("");
  const rows = receipts().slice(0, 7);
  const runs = rows.filter((r) => r.kind === "run").length;

  return (
    <>
      <header className="top">
        <h2>Captain</h2>
        <span className="sub">Say what you want in plain words — it plans, runs the crew, and hands you a receipt</span>
        <div className="right">
          {/* The state of the machine belongs in the header, where you look for
              it. It used to be a pill in the corner and a banner at the bottom. */}
          <span className={`strip-state ${provider ? "live" : "idle"}`}>
            {provider ? "connected" : "no provider"}
          </span>
          <span className="strip-ws" title="Where a specialist's file tools are allowed to write">
            {workspace.kind === "browser-memory" ? "sandbox workspace" : "real folder"}
          </span>
        </div>
      </header>

      <div className="scroll">
        <div className="wrap wide deck-wrap">
          {rows.length > 0 ? (
            /* The ledger is the product, so it gets the top of the screen and
               the full width. A chat log would be the honest thing here if this
               were a chat product. It is not. */
            <section className="run">
              <div className="run-h">
                <h3>Ledger</h3>
                <span className="muted sm">{runs} run{runs === 1 ? "" : "s"} · {rows.length} entr{rows.length === 1 ? "y" : "ies"}</span>
                <button className="btn ghost sm push" onClick={() => go("receipts")}>Open</button>
              </div>
              <ul>
                {rows.map((r) => {
                  const p = proofOf(r);
                  return (
                    <li key={r.id + r.digest}>
                      <span className={`proof ${p.cls}`}>{p.word}</span>
                      <span className="what">{r.title}</span>
                      <code className="dig">{r.digest === "—" ? "" : r.digest.slice(0, 10)}</code>
                      <span className="when">{r.at ? r.at.slice(11, 16) : ""}</span>
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : (
            /* Empty is not a shrug, it is the most useful thing on screen: the
               contract. What runs, what stops, what is refused. */
            <section className="contract-ledger">
              <h3>Nothing has run on this machine yet</h3>
              <p className="muted">Every run writes a hash-chained receipt here. Approved and refused alike — a decision that leaves no record is not a decision, it is a rumour.</p>
              <dl>
                <div><dt>Plans</dt><dd>Always free. Without a provider the Captain plans and says it planned, and writes nothing.</dd></div>
                <div><dt>Reads</dt><dd>Run without asking. They cannot change anything.</dd></div>
                <div><dt>Writes, fetches, commands</dt><dd>Stop at a gate and wait for you. Every refusal is receipted too.</dd></div>
              </dl>
            </section>
          )}

          {/* §13 — the composer's attach door reaches the SAME ingest seam
              the Docs screen uses: one run, one set of caps, one receipt
              chain. The attach control only renders because this is passed. */}
          <Composer
            value={draft}
            onChange={setDraft}
            onSend={() => { void send(draft); setDraft(""); }}
            busy={busy}
            placeholder={provider ? "Describe what you need." : "Describe what you need — the Captain will plan it, not run it."}
            onFiles={(files) => addFiles(files)}
          />

          {!provider && (
            <div className="nudge">
              <span className="muted">No provider key, so nothing executes.</span>
              <button className="btn primary sm" onClick={() => go("settings")}>Add a key</button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
