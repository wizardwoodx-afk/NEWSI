import React, { useMemo, useState } from "react";
import {
  knownCategories, categorySizes, defaultPolicy, loadPolicy, savePolicy, clearPolicy,
  DEPTH_LABEL, DEPTH_LIMIT, BUDGET_STOPS, BUDGET_MIN, BUDGET_MAX, BUDGET_DEFAULT,
  clampBudget, type CrewPolicy, type Depth,
} from "../../engine/crewPolicy";

/**
 * SelfImpulse — the CREW MATRIX.
 *
 * One row per desk the router can actually send work to, and three knobs per row:
 * whether the desk is on shift, how deep it may go on a single route, and what it
 * may spend in prompt tokens. Every one of those is enforced by `crewPolicy` on
 * the routing seam — this screen writes the policy, it does not merely display it.
 *
 * ── WHY A TABLE OF DESKS AND NOT A SETTINGS FORM ─────────────────────────────
 * The decision being made here is comparative: "which desks do I keep on, and is
 * any of them too expensive to keep at full depth". A vertical list of forms
 * makes that unanswerable, because you cannot see two desks' depths at once. A
 * matrix answers it by construction — the whole point of the layout is that the
 * column reads down.
 *
 * ── DEFAULT vs CUSTOM ────────────────────────────────────────────────────────
 * "Default" is the shipped policy, derived from the roster rather than typed
 * out. "Custom" is your file. They are DIFFERENT STATES and the screen says
 * which one is in force, because an operator has to be able to answer "what did
 * this ship as?" without reinstalling — and a screen that silently shows your
 * edits as if they were the default would take that away.
 *
 * Editing a value switches the tab to Custom, because that is now the truth.
 * "Restore default" is one press, and it deletes the file rather than writing a
 * copy of the default into it — so the two can never drift.
 */
export function CrewMatrix({ onClose }: { onClose: () => void }): React.ReactElement {
  const [draft, setDraft] = useState<CrewPolicy>(() => loadPolicy() ?? defaultPolicy());
  const [tab, setTab] = useState<"default" | "custom">(() => (loadPolicy() ? "custom" : "default"));
  const [note, setNote] = useState("");
  const sizes = useMemo(() => categorySizes(), []);
  const cats = useMemo(() => knownCategories(), []);
  const shipped = useMemo(() => defaultPolicy(), []);

  const shown = tab === "default" ? shipped : draft;
  const customised = useMemo(
    () => cats.filter((c) => JSON.stringify(draft[c]) !== JSON.stringify(shipped[c])),
    [draft, shipped, cats],
  );

  const patch = (cat: string, next: Partial<CrewPolicy[string]>) => {
    setDraft((d) => ({ ...d, [cat]: { ...d[cat], ...next } }));
    setTab("custom");
    setNote("");
  };

  const save = () => {
    savePolicy(draft);
    setNote("Saved. The next route obeys it.");
  };
  const restore = () => {
    clearPolicy();
    setDraft(defaultPolicy());
    setTab("default");
    setNote("Restored to the shipped default.");
  };

  return (
    <div className="cm-overlay" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="cm-dialog" role="dialog" aria-modal="true" aria-label="Crew settings">
        <div className="cm-head">
          <div className="cm-tabs" role="tablist" aria-label="Policy source">
            <button role="tab" aria-selected={tab === "default"} className={tab === "default" ? "cm-tab on" : "cm-tab"} onClick={() => setTab("default")}>Default</button>
            <button role="tab" aria-selected={tab === "custom"} className={tab === "custom" ? "cm-tab on" : "cm-tab"} onClick={() => setTab("custom")}>Custom</button>
          </div>
          <button className="cm-x" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="cm-body">
          <div className="cm-row cm-cols">
            <span>Desk</span>
            <span>Depth</span>
            <span>On shift</span>
            <span>Prompt budget</span>
          </div>

          {cats.map((cat) => {
            const p = shown[cat];
            const edited = JSON.stringify(draft[cat]) !== JSON.stringify(shipped[cat]);
            return (
              <div className={p.onShift ? "cm-row" : "cm-row off"} key={cat}>
                <div className="cm-desk">
                  <i className="cm-mark" aria-hidden data-desk={cat} />
                  <span className="cm-name">{cat}</span>
                  <span className="cm-size">{sizes[cat] ?? 0} specialists</span>
                  {edited && tab === "custom" ? <span className="cm-edited" title="differs from the shipped default">edited</span> : null}
                </div>

                <div className="cm-depth">
                  <select
                    className="cm-select"
                    value={p.depth}
                    disabled={!p.onShift}
                    aria-label={`Depth for ${cat}`}
                    onChange={(e) => patch(cat, { depth: e.target.value as Depth })}
                  >
                    {(["lead", "desk", "full"] as Depth[]).map((d) => (
                      <option key={d} value={d}>{DEPTH_LABEL[d]}</option>
                    ))}
                  </select>
                  <span className="cm-cap">{DEPTH_LIMIT[p.depth]} per route</span>
                </div>

                <div className="cm-shift">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={p.onShift}
                    aria-label={`${cat} on shift`}
                    className={p.onShift ? "cm-switch on" : "cm-switch"}
                    onClick={() => patch(cat, { onShift: !p.onShift })}
                  >
                    <span className="cm-knob" />
                  </button>
                </div>

                <div className="cm-budget">
                  <input
                    type="range"
                    className="cm-range"
                    min={0}
                    max={BUDGET_STOPS.length - 1}
                    step={1}
                    disabled={!p.onShift}
                    value={Math.max(0, BUDGET_STOPS.indexOf(clampBudget(p.budget) as typeof BUDGET_STOPS[number]))}
                    aria-label={`Prompt budget for ${cat}`}
                    onChange={(e) => patch(cat, { budget: BUDGET_STOPS[Number(e.target.value)] })}
                  />
                  <div className="cm-ticks" aria-hidden>
                    {BUDGET_STOPS.map((s) => <span key={s} className={clampBudget(p.budget) === s ? "cm-tick on" : "cm-tick"} />)}
                  </div>
                  <span className="cm-amount">{(p.budget / 1000).toLocaleString()}k tokens</span>
                </div>
              </div>
            );
          })}
        </div>

        <div className="cm-foot">
          <p className="cm-note">
            <i className="cm-info" aria-hidden>i</i>
            {tab === "default"
              ? "This is what the product ships. Every desk is on the floor at full depth, so nothing here is being withheld from you."
              : customised.length === 0
                ? "No desk differs from the shipped default yet."
                : `${customised.length} desk${customised.length === 1 ? "" : "s"} differ from the default (${customised.slice(0, 4).join(", ")}${customised.length > 4 ? "…" : ""}). Applies to new routes; a run already in flight keeps the policy it started under.`}
            {note ? <b className="cm-saved"> {note}</b> : null}
          </p>
          <div className="cm-acts">
            {tab === "custom" && customised.length > 0 ? <button className="btn sm ghost" onClick={restore}>Restore default</button> : null}
            <button className="btn sm ghost" onClick={onClose}>Cancel</button>
            <button className="btn sm primary" onClick={save} disabled={tab === "custom" && customised.length === 0}>Save settings</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** The header control the Settings screen mounts. Kept beside the matrix so the
 *  label and the count come from the same place the dialog reads. */
export function CrewMatrixButton(): React.ReactElement {
  const [open, setOpen] = useState(false);
  const stored = loadPolicy();
  const off = stored ? knownCategories().filter((c) => !stored[c].onShift).length : 0;
  return (
    <>
      <button className="btn sm" onClick={() => setOpen(true)}>
        Open crew settings{off > 0 ? ` · ${off} off shift` : ""}
      </button>
      {open ? <CrewMatrix onClose={() => setOpen(false)} /> : null}
    </>
  );
}

export { BUDGET_DEFAULT, BUDGET_MIN, BUDGET_MAX };
