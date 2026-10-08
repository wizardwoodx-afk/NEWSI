import React, { useMemo } from "react";
import { GeneralistFace, SpecialistFace } from "../../engine/face";
import { generalistName } from "../../engine/face";
import { TITLES, ROLES } from "../../engine/chain";
import { DESKS, consulForDesk, leadFor, hrFor, orgStats, type DeskId } from "../../engine/org";
import { knownCategories, categorySizes, effectivePolicy } from "../../engine/crewPolicy";

/**
 * THE CREW BOARD — the deployment's seats, read from the engine: `generalistName()`
 * for the Captain, `consulForDesk()` / `leadFor()` / `hrFor()` for each desk's
 * accountable seats, `orgStats().byDesk` for worker counts, and `effectivePolicy()`
 * for whether a desk is on shift (the decision made on the crew settings matrix,
 * shown here on the desk it applies to). Faces are the deterministic marks the rest
 * of the product uses, so the same id renders the same face everywhere.
 */
export function CrewBoard(): React.ReactElement {
  const stats = useMemo(() => orgStats(), []);
  const policy = useMemo(() => effectivePolicy().policy, []);
  const sizes = useMemo(() => categorySizes(), []);
  const cats = useMemo(() => knownCategories(), []);
  const crew = TITLES.crew.toLowerCase();

  return (
    <div className="cb">
      {/* ── the top of the house ── */}
      <div className="cb-captain">
        <GeneralistFace name={generalistName()} size={52} />
        <div className="cb-captain-text">
          <b>{generalistName()}</b>
          <span className="cb-rung">{TITLES.captain}</span>
          <p>{ROLES.captain}</p>
        </div>
        <div className="cb-captain-counts">
          <div><b>{cats.length}</b><span>Consuls</span></div>
          <div><b>{stats.desks}</b><span>desks</span></div>
          <div><b>{stats.workers.toLocaleString()}</b><span>{crew}s</span></div>
        </div>
      </div>

      {/* ── the rungs, in the order authority flows ── */}
      <div className="cb-rungs">
        {(["captain", "consul", "adept", "crew"] as const).map((r) => (
          <div className="cb-rung-card" key={r}>
            <b>{TITLES[r]}</b>
            <p>{ROLES[r]}</p>
          </div>
        ))}
      </div>

      {/* ── the desks ── */}
      <h3 className="cb-h">The desks</h3>
      <div className="cb-grid">
        {DESKS.map((d) => {
          const consul = consulForDesk(d.id as DeskId);
          const lead = leadFor(d.id as DeskId);
          const hr = hrFor(d.id as DeskId);
          const on = policy[d.workerCategory]?.onShift !== false;
          const hands = stats.byDesk[d.id] ?? 0;
          return (
            <div className={on ? "cb-desk" : "cb-desk off"} key={d.id}>
              <div className="cb-desk-head">
                <span className="cb-desk-mark" aria-hidden />
                <b>{d.label}</b>
                {!on ? <span className="cb-off">off shift</span> : null}
              </div>
              <p className="cb-blurb">{d.blurb}</p>
              <div className="cb-people">
                {consul ? (
                  <span className="cb-person">
                    <SpecialistFace id={consul.id} size={20} />
                    <span className="cb-pname">{consul.name}</span>
                    <span className="cb-prole">{TITLES.consul}</span>
                  </span>
                ) : null}
                {lead ? (
                  <span className="cb-person">
                    <SpecialistFace id={lead.id} size={20} />
                    <span className="cb-pname">{lead.name}</span>
                    <span className="cb-prole">Lead</span>
                  </span>
                ) : null}
                {hr ? (
                  <span className="cb-person">
                    <SpecialistFace id={hr.id} size={20} />
                    <span className="cb-pname">{hr.name}</span>
                    <span className="cb-prole">HR</span>
                  </span>
                ) : null}
              </div>
              <div className="cb-desk-foot">
                <span>{hands} {crew}s</span>
                <span className="cb-cat">{d.workerCategory}</span>
                {sizes[d.workerCategory] ? <span className="cb-cat-n">{sizes[d.workerCategory]} in category</span> : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
