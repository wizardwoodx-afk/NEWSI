import React, { useMemo } from "react";
import { GeneralistFace, SpecialistFace } from "../../engine/face";
import { generalistName } from "../../engine/face";
import { TITLES, ROLES } from "../../engine/chain";
import { DESKS, consulForDesk, leadFor, hrFor, orgStats, type DeskId } from "../../engine/org";
import { knownCategories, categorySizes, effectivePolicy } from "../../engine/crewPolicy";

/**
 * THE CREW BOARD — who is actually in this deployment.
 *
 * The Specialists door has always DESCRIBED the org, in a paragraph: "you speak
 * only with the Captain, it briefs the Consuls, who oversee 30 desks…". That
 * paragraph was accurate and almost useless, because the one question a person
 * actually has about an org they own is "who are they" — and prose cannot
 * answer that. This board answers it: every rung is a face with a name, and the
 * desks are laid out with the person accountable for each one.
 *
 * ── WHAT IS REAL HERE, AND WHAT IS A LABEL ───────────────────────────────────
 * Everything on this board is read from the engine:
 *   • the Captain's name is `generalistName()` — the name the user set;
 *   • each desk's Consul comes from `consulForDesk()`, its Lead and HR seat from
 *     `leadFor()` / `hrFor()`, and the worker count from `orgStats().byDesk`;
 *   • the faces are the DETERMINISTIC marks the rest of the product uses — the
 *     same id always renders the same face, so a Consul looks the same here as
 *     it does in a mission.
 * Nothing is a decorative avatar with no referent, and no count is typed in.
 *
 * ── WHY THE SHIFT STATE IS ON EACH CARD ──────────────────────────────────────
 * A desk being off shift is a decision the user made on the Crew settings
 * matrix. If that decision only showed up in the settings dialog, a person would
 * have to remember it while reading the org. It is shown here, on the desk it
 * applies to, so the org and the policy cannot disagree on screen.
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
      <p className="hint cb-sub">
        Each desk is one area of work. The Consul above it answers for it, the Lead runs it day to day, and the HR seat
        takes the parts a person should not. A desk draws its hands from one routing category, and that is what the crew
        settings switch on and off.
      </p>
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
                {!on ? <span className="cb-off" title={`the ${d.workerCategory} category is off shift`}>off shift</span> : null}
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
