/**
 * SelfImpulse — the Specialists door: every domain, one surface, the same contract.
 *
 * WHY THIS DOOR EXISTS. The finance desk proved the shape: a deterministic engine behind
 * every specialist, a stated basis on every result, and a human gate wherever the last step
 * would change something real. None of that is specific to finance, so this surface
 * generalises it — frontend, engineering, API, data, security, reliability, docs, growth and
 * regulated domain side by side, each rendered from the same tool contract.
 *
 * THE SHELL CONTAINS NO DOMAIN LOGIC. A tool declares its fields and its engine; this file
 * renders whatever it is given. Adding a domain is therefore a data change, not a UI change —
 * which is the whole reason the pack is a pack.
 *
 * WHAT IT WILL NOT DO:
 *   • no language model computes a number on this surface. Every figure comes from an engine
 *     in src/specialists, and every result prints the rule or formula it used.
 *   • nothing here acts on a system. These tools measure and compute; the specialists whose
 *     last step would change production, spend money or send something to a customer are
 *     marked GATED and stop for a human, exactly as the finance pack does.
 *   • it does not hide the limits. Where an engine's method is an approximation, a floor or a
 *     fixed checklist, the result says so in its own words — that text comes from the engine,
 *     not from this file.
 */

import React, { useState } from "react";
import { TITLES } from "../../engine/chain";
import { CrewBoard } from "./CrewBoard";
import {
  DOMAINS, TOOLS, toolsForDomain, specialistStatus, specialistsByDomain,
  type Domain, type Tool, type ToolResult, type Values, type Specialist,
} from "../../specialists";

/* ── the generic tool renderer ─────────────────────────────────────────────── */

function defaultsFor(tool: Tool): Values {
  return Object.fromEntries(tool.fields.map((f) => [f.key, f.def]));
}

function ResultView({ r }: { r: ToolResult }): React.ReactElement {
  return (
    <div className="card">
      <div className="card-h">
        <h3>{r.headline}</h3>
        <span className={`pill ${r.ok ? "ok" : "warn"}`}>{r.ok ? "engine" : "check"}</span>
      </div>
      <div className="card-b">
        {r.kpis && r.kpis.length > 0 && (
          <div className="kpis" style={{ marginBottom: 12 }}>
            {r.kpis.map((k, i) => (
              <div key={i}><b className="mono" style={{ fontSize: 20 }}>{k.value}</b><span>{k.label}</span></div>
            ))}
          </div>
        )}
        {r.table && (
          <div className="ledger" style={{ marginBottom: 12 }}>
            <div className="lh" style={{ gridTemplateColumns: `repeat(${r.table.head.length}, 1fr)` }}>
              {r.table.head.map((h, i) => <span key={i}>{h}</span>)}
            </div>
            {r.table.rows.map((row, i) => (
              <div className="lr" key={i} style={{ gridTemplateColumns: `repeat(${r.table!.head.length}, 1fr)`, height: "auto", padding: "10px 16px", alignItems: "flex-start" }}>
                {row.map((cell, j) => <span key={j} className={j === 0 ? "mono" : ""}>{cell}</span>)}
              </div>
            ))}
          </div>
        )}
        {(r.lines ?? []).filter(Boolean).map((l, i) => <p key={i}>{l}</p>)}
        {r.code && (
          <pre className="mono" style={{ whiteSpace: "pre-wrap", marginTop: 10, padding: "10px 12px", background: "var(--s3)", borderRadius: 8 }}>{r.code}</pre>
        )}
        <p className="hint" style={{ marginTop: 10 }}><b>Basis — </b>{r.basis}</p>
      </div>
    </div>
  );
}

function ToolPanel({ tool }: { tool: Tool }): React.ReactElement {
  const [values, setValues] = useState<Values>(() => defaultsFor(tool));
  let result: ToolResult;
  let threw = "";
  try {
    result = tool.run(values);
  } catch (e) {
    threw = e instanceof Error ? e.message : String(e);
    result = { headline: "The engine refused these inputs", ok: false, basis: "a refusal is an answer: the engine will not "
      + "produce a figure it cannot stand behind", lines: [threw] };
  }

  return (
    <>
      <div className="card">
        <div className="card-h">
          <h3>{tool.label}</h3>
          <button className="btn sm ghost" onClick={() => setValues(defaultsFor(tool))}>Reset</button>
        </div>
        <div className="card-b">
          <p className="hint" style={{ marginBottom: 12 }}>{tool.blurb}</p>
          <div className="row" style={{ padding: 0, borderTop: 0, flexWrap: "wrap", gap: 16 }}>
            {tool.fields.map((f) => (
              <div key={f.key} style={{ minWidth: f.kind === "textarea" ? "100%" : 180, flex: f.kind === "textarea" ? "1 1 100%" : "0 1 auto" }}>
                <label className="lbl" htmlFor={`${tool.id}-${f.key}`}>{f.label}</label>
                {f.kind === "toggle" ? (
                  <label className="check">
                    <input id={`${tool.id}-${f.key}`} type="checkbox" checked={values[f.key] === true}
                      onChange={(e) => setValues({ ...values, [f.key]: e.target.checked })} />
                    <span>{f.hint ?? "on"}</span>
                  </label>
                ) : f.kind === "select" ? (
                  <select id={`${tool.id}-${f.key}`} className="input" value={String(values[f.key] ?? "")}
                    onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}>
                    {(f.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                ) : f.kind === "textarea" ? (
                  <textarea id={`${tool.id}-${f.key}`} className="input mono" rows={6} placeholder={f.placeholder}
                    value={String(values[f.key] ?? "")}
                    onChange={(e) => setValues({ ...values, [f.key]: e.target.value })} />
                ) : (
                  <input id={`${tool.id}-${f.key}`} className={`input ${f.kind === "number" ? "" : "mono"}`} placeholder={f.placeholder}
                    value={String(values[f.key] ?? "")}
                    onChange={(e) => setValues({ ...values, [f.key]: e.target.value })} />
                )}
                {f.kind !== "toggle" && f.hint ? <span className="hint">{f.hint}</span> : null}
              </div>
            ))}
          </div>
        </div>
      </div>
      <ResultView r={result} />
    </>
  );
}

function ToolKit({ tools }: { tools: Tool[] }): React.ReactElement {
  const [active, setActive] = useState(tools[0]!.id);
  const tool = tools.find((t) => t.id === active) ?? tools[0]!;
  /* key on the tool id: switching tools resets the form to that tool's own defaults rather
     than carrying another tool's values across, which would be a silent wrong answer. */
  return (
    <>
      <div className="seg" style={{ display: "flex", flexWrap: "wrap", marginBottom: 14 }}>
        {tools.map((t) => (
          <button key={t.id} aria-pressed={active === t.id} onClick={() => setActive(t.id)}>{t.label}</button>
        ))}
      </div>
      <ToolPanel key={tool.id} tool={tool} />
    </>
  );
}

/* ── the generalist roster ─────────────────────────────────────────────────── */

function SpecialistLedger({ domain }: { domain: Domain }): React.ReactElement {
  const [open, setOpen] = useState<string | null>(null);
  const listed: Specialist[] = specialistsByDomain(domain);
  return (
    <div className="ledger">
      <div className="lh"><span>·</span><span>Specialist</span><span>Runs on</span><span>Status</span><span>Gate</span></div>
      {listed.map((s) => (
        <React.Fragment key={s.id}>
          <button className={`lr ${open === s.id ? "open" : ""}`} onClick={() => setOpen(open === s.id ? null : s.id)}>
            <span className={`dot ${s.requiresApproval ? "pending" : "ok"}`} />
            <span className="t"><b>{s.name}</b><small className="mono">{s.id}</small></span>
            <span className="mono">{s.status === "engine" ? "engine" : "workflow"}</span>
            <span className="mono">{s.status === "engine" ? `${TOOLS.length} tools in the pack` : "engine-backed"}</span>
            <span className={`pill ${s.requiresApproval ? "warn" : "ok"}`}>{s.requiresApproval ? "gated" : "open"}</span>
          </button>
          {open === s.id && (
            <div className="ld">
              <p>{s.purpose}</p>
              <p className="hint"><b>Engine — </b><span className="mono">{s.engine}</span></p>
              <p className="hint"><b>In — </b>{s.inputs}</p>
              <p className="hint"><b>Out — </b>{s.output}</p>
              <p className="hint"><b>The receipt attests — </b>{s.receipt}</p>
              {s.requiresApproval && (
                <p className="hint"><b>Gate — </b>this specialist's last step changes production, spends money, touches a credential or reaches a customer. It prepares; a human decides; the decision is recorded.</p>
              )}
            </div>
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

/* ── the door ──────────────────────────────────────────────────────────────── */

export function Specialists(): React.ReactElement {
  const [domain, setDomain] = useState<Domain>("frontend");
  const [view, setView] = useState<"tools" | "crew" | "roster">("tools");
  const info = DOMAINS.find((d) => d.id === domain)!;
  const gen = specialistStatus();
  const toolCount = TOOLS.length;
  const specialistCount = gen.total;
  const gatedCount = gen.requiringApproval;

  return (
    <>
      <header className="top">
        <h2>Specialists</h2>
        <span className="sub">
          {DOMAINS.length} teams of in-house experts · up to 25 work at once · no outside software needed
        </span>
        <div className="right"><span className="pill mono">computed on this machine</span></div>
      </header>
      <div className="scroll"><div className="page narrow">
        <div className="kpis">
          <div><b>{DOMAINS.length}</b><span>domain teams</span></div>
          <div className="sep" />
          <div><b>{toolCount}</b><span>deterministic tools</span></div>
          <div className="sep" />
          <div><b>{specialistCount}</b><span>specialists</span></div>
          <div className="sep" />
          <div><b>{gatedCount}</b><span>stop at a human gate</span></div>
        </div>
        <p className="hint" style={{ margin: "0 2px 6px" }}>
          In-house experts, one team per domain. You talk to the {TITLES.captain}; every answer is a local tool, a receipt, or a human gate — never a black box.
        </p>
        <details style={{ margin: "0 2px 14px" }}>
          <summary className="hint" style={{ cursor: "pointer" }}>How the organisation is shaped</summary>
          <p className="hint" style={{ margin: "6px 0 0" }}>
            {`${TITLES.captain} (CEO) briefs the ${TITLES.consul}s — one per domain — who oversee 30 desks × ${TITLES.adept}+HR (60 domain specialists) leading the 1,500 ${TITLES.crew.toLowerCase()}s. No layer ever skips the one above it. Agentic MoE puts at most 25 crew on the 11WORKSPACE floor, chosen autonomously; you never pick the team.`}
          </p>
        </details>

        <div className="seg" style={{ flexWrap: "wrap" }}>
          {DOMAINS.map((d) => (
            <button key={d.id} aria-pressed={domain === d.id} onClick={() => setDomain(d.id)}>{d.label}</button>
          ))}
        </div>

        <p className="hint" style={{ margin: "0 2px 14px" }}>{info.blurb}</p>

        <div className="seg" style={{ marginBottom: 14 }}>
          <button aria-pressed={view === "tools"} onClick={() => setView("tools")}>Tool pack</button>
          <button aria-pressed={view === "crew"} onClick={() => setView("crew")}>Crew</button>
          <button aria-pressed={view === "roster"} onClick={() => setView("roster")}>Specialists</button>
        </div>

        {view === "tools" && (
          <>
            <ToolKit tools={toolsForDomain(domain)} />
            <details style={{ marginTop: 14 }}>
              <summary className="hint" style={{ cursor: "pointer" }}><b>Engines compute; they do not act.</b></summary>
              <p className="hint" style={{ margin: "6px 0 0" }}>
                Nothing on this surface touches a repository, a server, a portal or a
                customer. Every figure is produced on this machine from the engine named on each specialist, and each
                result prints the rule, formula or standard behind it. Where a specialist's last step would change something
                real, it is marked <b>gated</b> and waits for a human.
              </p>
            </details>
          </>
        )}

        {view === "crew" && <CrewBoard />}

        {view === "roster" && <SpecialistLedger domain={domain} />}
      </div></div>
    </>
  );
}
