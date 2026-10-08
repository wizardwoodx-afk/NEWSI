import React, { useEffect } from "react";
import { PRODUCT_NAME } from "../../brand";
import { useVh, type Screen } from "../store";
import { Steward } from "../screens/Steward";
import { Work } from "../screens/Work";
import { Specialists } from "../screens/Specialists";
import { Receipts } from "../screens/Receipts";
import Federation from "../screens/Federation";
import { Memory } from "../screens/Memory";
import { Docs } from "../screens/Docs";
import { Settings } from "../screens/Settings";
import { Profile } from "../screens/Profile";
import { Chat } from "../screens/Chat";
import { GateCard } from "../screens/GateCard";
import { WindowControls } from "../WindowControls";
import { ErrorBoundary } from "../../panels/ErrorBoundary";
import { Toasts } from "../../panels/Toast";


/**
 * The door table. Declared once, in the exact shape the probe suites read, and
 * it is the single source for both the rail and the header title. The literal
 * shape is load-bearing: probe/navAlign.test.ts and probe/shellRender.test.tsx
 * DERIVE the expected door set from this file by regex rather than hardcoding
 * it, and probe/shellRender.test.tsx then asserts the count is exactly eight.
 * So the shape below must not be paraphrased — and no comment anywhere in this
 * file may contain a matching sample entry, or the count silently becomes nine.
 */
const NAV: Array<{ key: Screen; label: string; icon: string }> = [
  { key: "steward", label: "Captain", icon: "steward" },
  { key: "work", label: "Work", icon: "crew" },
  { key: "specialists", label: "Specialists", icon: "specialists" },
  { key: "federation", label: "Federation", icon: "federation" },
  { key: "receipts", label: "Receipts", icon: "receipts" },
  { key: "docs", label: "Docs", icon: "docs" },
  { key: "memory", label: "Memory", icon: "memory" },
  { key: "settings", label: "Settings", icon: "settings" },
];

/**
 * Presentation grouping over the door table. The eight doors and their order are
 * still owned entirely by NAV above — this only says which caption they sit under,
 * so the rail reads as two clusters instead of eight equal-weight rows. Keys are
 * references into NAV, never a second copy of the table.
 */
const NAV_GROUPS: Array<{ caption: string; keys: Screen[] }> = [
  { caption: "Mission", keys: ["steward", "work", "docs", "memory"] },
  { caption: "Oversight", keys: ["specialists", "federation", "receipts", "settings"] },
];

/** The conversation door is not in the rail; it is reached from inside Work. */
const CHAT_LABEL = "Conversation";

/** Each door gets its own boundary, so one bad screen cannot blank the shell. */

export function Shell(): React.ReactElement {
  const { screen, go, provider, busy, ownerHandle, boot, newMission, gate, stewardName, initiative, setAutonomy, savedTokens } = useVh();
  useEffect(() => { void boot(); }, [boot]);

  const current = NAV.find((n) => n.key === screen);
  /* Profile is reached from the rail footer, not the door table, so it has no
     NAV entry — and without this it took the product name as its heading,
     opening a screen called "SelfImpulse" inside an app called SelfImpulse. */
  const title = screen === "chat" ? CHAT_LABEL : current?.label ?? (screen === "profile" ? "Profile" : PRODUCT_NAME);

  /* The rail's one dial, and it is the store's own number rather than a decoration:
     ME/ is autonomy level 0 — "acts only when the user sends a task" — and TEAMS is
     any level above it, where the heartbeat wakes the crew and the crew may carry
     its own follow-ups. Both halves read `initiative.level`, so Settings → Autonomy,
     the composer's approval dial and this control cannot disagree. The gate is not
     on this dial: risky and critical work asks at every level. */
  const solo = initiative.level === 0;
  const pickMode = (wantSolo: boolean): void => {
    if (wantSolo === solo) return;
    /* Upward is the floor, not a memory. Leaving ME/ lifts a silent engine to
       level 1 and never to a higher level the operator did not just choose;
       going to ME/ can only ever lower the number. The exact rung is the
       composer's own dial. */
    setAutonomy(wantSolo ? 0 : initiative.level || 1);
  };

  return (
    <div className="si-app">
      {/* The window is created with `decorations: false`, so the OS draws no
          title bar. Without these controls the application has no way to be
          closed, minimised or moved except a keyboard shortcut. It is mounted
          first so the controls paint above everything else. */}
      <WindowControls />

      {/* FIRST focusable element in the document. Off-screen until focused,
          then pinned top-left over the rail. */}
      <a className="si-skip" href="#main-content">Skip to content</a>

      <aside className="si-rail">
        <div className="si-head">
          <div className="si-mode" role="group" aria-label="Who works this mission">
            <button
              type="button"
              className="si-mode-btn"
              aria-pressed={solo}
              title="ME — nothing runs that you did not send"
              onClick={() => pickMode(true)}
            >
              <i className="si-mode-ic si-g-solo" aria-hidden />
              <span>ME</span>
            </button>
            <button
              type="button"
              className="si-mode-btn"
              aria-pressed={!solo}
              title="TEAMS — the crew wakes on the heartbeat without being asked"
              onClick={() => pickMode(false)}
            >
              <i className="si-mode-ic si-g-team" aria-hidden />
              <span>TEAMS</span>
            </button>
          </div>

          {/* The mission reset keeps its wiring and loses its sentence — the rail
              is 248px and the reset is one gesture, not a banner. */}
          <button className="si-new" onClick={newMission} aria-label="New mission" title="New mission">
            <i className="si-new-ic ic ic-plus" aria-hidden />
          </button>
        </div>

        <nav className="si-nav" aria-label="Primary">
          {NAV_GROUPS.map((g, gi) => {
            const capId = `si-nav-cap-${gi}`;
            return (
              <div key={g.caption} className="si-nav-grp" role="group" aria-labelledby={capId}>
                <b id={capId} className="si-nav-cap">{g.caption}</b>
                {NAV.filter((n) => g.keys.includes(n.key)).map((n) => {
                  const on = screen === n.key;
                  return (
                    <button
                      key={n.key}
                      className="si-nav-item"
                      onClick={() => go(n.key)}
                      aria-current={on ? "page" : undefined}
                    >
                      <i className={`si-nav-ic ic ic-${n.icon}`} aria-hidden />
                      <span className="si-nav-label">{n.label}</span>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </nav>

        <div className="si-foot">
          {/* Connection is the one thing down here that keeps words. A dot alone
              is a colour, and "no model" is a security fact: without a provider
              every run is a plan that executes nothing. So the dot, the glyph and
              a short state word all say it, and the title says the consequence. */}
          {/* The two attributes stay on one line: probe/navAlign greps this exact
              adjacency to prove the connection pill opens Settings and the owner
              avatar opens the profile. The wiring is the invariant; the literal is
              how it is caught. */}
          <button className="si-provider" onClick={() => go("settings")}
            aria-label={provider ? `Provider ${provider.model || provider.kind} — open settings` : "No model connected — every run is a plan that executes nothing. Open settings."}
            title={provider ? `${provider.kind} · ${provider.model || "no model named"}` : "no model connected — runs are plan only"}
          >
            <span className={`si-led ${provider ? "ok" : "warn"}`} aria-hidden />
            <i className="si-foot-ic si-g-plug" aria-hidden />
            <span className="si-provider-label">{provider ? provider.model || provider.kind : "No model"}</span>
          </button>
          <div className="si-foot-row">
            <button className="si-owner" onClick={() => go("profile")} aria-label={`Your profile — ${ownerHandle}`} title={ownerHandle}>
              <span className="si-av" aria-hidden>{initials(ownerHandle)}</span>
            </button>
            <span className="si-usage" title={`${savedTokens.toLocaleString()} tokens kept off the wire this session`}>
              <i className="si-foot-ic si-g-gauge" aria-hidden />
              {compact(savedTokens)}
            </span>
            <button className="si-foot-btn" onClick={() => go("docs")} aria-label="Docs — the knowledge and skill door" title="Docs">
              <i className="si-foot-ic ic ic-docs" aria-hidden />
            </button>
            <button className="si-foot-btn" onClick={() => go("settings")} aria-label="Settings" title="Settings">
              <i className="si-foot-ic ic ic-settings" aria-hidden />
            </button>
          </div>
        </div>
      </aside>

      {/* The gate stops the run and needs a human, so it must be reachable from
          every door — previously only Chat and Work mounted it, which let a
          heartbeat gate hang an unresolvable promise on the other eight. */}
      {gate && screen !== "chat" && screen !== "work" && (
        <div className="si-gate-overlay">
          <GateCard />
        </div>
      )}

      <div className="si-main-wrap">
        <header className="si-top">
          <h1>{title}</h1>
          <div className="si-chips">
            {busy ? <span className="si-chip">Working</span> : null}
          </div>
        </header>

        {/* The scroll region. #main-content + tabIndex={-1} is the skip
            link's target; without tabIndex the link would scroll the viewport
            but leave keyboard focus stranded up in the rail. */}
        <main className="si-main" id="main-content" tabIndex={-1}>
          <div className="si-scroll">
            <div className="si-content">
              {screen === "steward" && door("steward", <Steward />)}
              {screen === "work" && door("work", <Work />)}
              {screen === "specialists" && door("specialists", <Specialists />)}
              {screen === "federation" && door("federation", <Federation />)}
              {screen === "receipts" && door("receipts", <Receipts />)}
              {screen === "docs" && door("docs", <Docs />)}
              {screen === "memory" && door("memory", <Memory />)}
              {screen === "settings" && door("settings", <Settings />)}
              {screen === "profile" && door("profile", <Profile />)}
              {screen === "chat" && (
                <ErrorBoundary label="Conversation" resetKey={screen} onLeave={() => go("steward")}>
                  <Chat title={stewardName} />
                </ErrorBoundary>
              )}
            </div>
          </div>
        </main>
      </div>

      {/* The toast component renders a bare fixed container with no ARIA, and
          it is owned by another stream. Wrapping it here gives the whole
          region a polite live announcement without editing that file. */}
      <div className="si-toasts" role="status" aria-live="polite" aria-atomic="false">
        <Toasts />
      </div>
    </div>
  );
}

function initials(s: string): string {
  return s.replace(/[^a-z0-9]/gi, "").slice(0, 2).toUpperCase() || "11";
}
/* The usage chip is 248px of rail, so a five-digit count is a number the eye
   cannot take in. The full count lives in its title. */
function compact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 100) / 10}k`;
  return String(n);
}
function door(key: Screen, el: React.ReactElement) {
  return (
    <ErrorBoundary label={NAV.find((n) => n.key === key)?.label ?? key} resetKey={key}>
      {el}
    </ErrorBoundary>
  );
}
