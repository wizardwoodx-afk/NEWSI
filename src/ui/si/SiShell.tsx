/**
 * SelfImpulse — the SI shell.
 *
 * This is the application's chrome: a fixed left rail, a 52px top bar and the
 * main column. It is a RE-SKIN of the shell that shipped before it, not a
 * rewrite of behaviour. Concretely:
 *
 *   - it reads the SAME store (src/ui/store.ts) and calls the same actions
 *     (go, newMission, boot). No new state was invented for the redesign;
 *   - it renders the SAME nine screens, each still wrapped in its own
 *     ErrorBoundary, so a throw in one door still cannot blank the app;
 *   - the styling lives entirely in ./si.css, whose tokens are namespaced
 *     --si-* so they cannot collide with the legacy sheet (vh.css), which
 *     another stream owns and which still styles the screen interiors.
 *
 * WHAT CHANGED, AND WHY
 * ---------------------
 * Four accessibility defects were fixed here. All four are structural rather
 * than cosmetic, so they are worth stating:
 *
 *   1. TOASTS WERE SILENT. src/panels/Toast.tsx renders a fixed container
 *      with no ARIA at all, so nothing a toast said was ever announced. That
 *      file is not owned by this stream, so the live region is supplied here
 *      as a wrapper — role="status" + aria-live="polite" around the mounted
 *      <Toasts />. The announcement therefore works without editing a file
 *      another agent owns, and it is polite rather than assertive: a toast is
 *      information, never an emergency.
 *   2. NO WAY TO SKIP THE RAIL. The rail holds nine controls, so a keyboard
 *      user had to tab through all of them to reach the work area. The first
 *      focusable element in the document is now a "Skip to content" link
 *      targeting #main-content, and the main region carries that id plus
 *      tabIndex={-1} so it can actually receive focus.
 *   3. THE ACTIVE DOOR WAS ONLY A COLOUR. The rail marks the current door
 *      with aria-current="page" (it had this before, and it is kept) and pairs
 *      the navy left rule with a surface fill and brighter ink, so the current
 *      door is never carried by colour alone. The nav is a labelled landmark.
 *   4. FOCUS WAS INVISIBLE IN PLACES. A visible 2px ring on every interactive
 *      element is defined once in si.css rather than per-component, so a
 *      control added to a door later inherits it for free.
 */
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
import { ProviderConnect } from "../screens/ProviderConnect";
import { Chat } from "../screens/Chat";
import { WindowControls } from "../WindowControls";
import { ErrorBoundary } from "../../panels/ErrorBoundary";
import { Toasts } from "../../panels/Toast";
import "./si.css";

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

/** The conversation door is not in the rail; it is reached from inside Work. */
const CHAT_LABEL = "Conversation";

/** Each door gets its own boundary, so one bad screen cannot blank the shell. */

export function Shell(): React.ReactElement {
  const { screen, go, provider, busy, ownerHandle, vault, boot, newMission, gate, stewardName } = useVh();
  useEffect(() => { void boot(); }, [boot]);

  const counts: Partial<Record<Screen, number>> = {
    work: busy || gate ? 1 : 0,
    receipts: useVh.getState().receipts().filter((r) => r.state !== "pending").length,
  };

  const current = NAV.find((n) => n.key === screen);
  const title = screen === "chat" ? CHAT_LABEL : current?.label ?? PRODUCT_NAME;

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
        <div className="si-brand">
          <span className="si-brand-mark" aria-hidden />
          <div>
            <b>{PRODUCT_NAME}</b>
            <small>On-device · receipted</small>
          </div>
        </div>

        <button className="si-new" onClick={newMission}>
          <span>New mission</span>
        </button>

        <nav className="si-nav" aria-label="Primary">
          {NAV.map((n) => {
            const on = screen === n.key;
            return (
              <button
                key={n.key}
                className="si-nav-item"
                onClick={() => go(n.key)}
                aria-current={on ? "page" : undefined}
                title={n.label}
              >
                <i className={`si-nav-ic ic ic-${n.icon}`} aria-hidden />
                <span className="si-nav-label">{n.label}</span>
                {counts[n.key] ? <span className="si-nav-n">{counts[n.key]}</span> : null}
              </button>
            );
          })}
        </nav>

        <div className="si-foot">
          <button className="si-provider" onClick={() => go("settings")}>
            <span className={`si-led ${provider ? "ok" : "warn"}`} aria-hidden />
            <span className="si-provider-label">{provider ? "Connected" : "Plan-only"}</span>
            <small>{provider ? provider.model || provider.kind : "no provider"}</small>
          </button>
          <button className="si-owner" onClick={() => go("settings")}>
            <span className="si-av" aria-hidden>{initials(ownerHandle)}</span>
            <span className="si-owner-txt">
              <b>{ownerHandle}</b>
              <small>
                Owner · {vault.status === "unlocked" ? "key sealed" : vault.status === "sealed-locked" ? "vault locked" : "no vault"}
              </small>
            </span>
          </button>
        </div>
      </aside>

      <div className="si-main-wrap">
        <header className="si-top">
          <h1>{title}</h1>
          <div className="si-chips">
            <span className="si-chip">
              Provider <b>{provider ? "ready" : "none"}</b>
            </span>
            <span className="si-chip">
              Vault <b>{vault.status === "unlocked" ? "open" : vault.status === "sealed-locked" ? "locked" : "none"}</b>
            </span>
            {busy || gate ? (
              <span className="si-chip">
                <span className={`si-led ${busy ? "ok" : "warn"}`} aria-hidden />
                {gate ? "Waiting on you" : "Considering"}
              </span>
            ) : null}
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
              {/* 20.1 — the sign-in door renders ABOVE Settings rather than as a
                  ninth rail entry. The rail is contractually eight doors and two
                  probes derive that count from this file by regex, so adding a
                  rail item would break a guarantee that is deliberately pinned.
                  Placement here also matches the product's own logic: Settings is
                  where a provider key is configured, and the Captain's "Add a
                  key" button already routes to this door. */}
              {screen === "settings" && (
                <ErrorBoundary label="Sign in" resetKey="provider-connect">
                  <ProviderConnect />
                </ErrorBoundary>
              )}
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
function door(key: Screen, el: React.ReactElement) {
  return (
    <ErrorBoundary label={NAV.find((n) => n.key === key)?.label ?? key} resetKey={key}>
      {el}
    </ErrorBoundary>
  );
}
