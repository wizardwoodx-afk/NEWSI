import React, { useCallback, useEffect, useState } from "react";
import { getWindowApi, detectHost, type WindowApi } from "../app/desktop";

/**
 * Window controls.
 *
 * The desktop window is created with `decorations: false` in tauri.conf.json,
 * so the operating system draws no title bar and no close button. These
 * controls are the application's only way to minimise, maximise, restore or
 * close itself, and the only draggable region for moving the window.
 *
 * The window API was already implemented in `src/app/desktop.ts`; nothing
 * rendered it. These are the controls for it.
 *
 * Behaviour notes:
 *  - The drag region is a separate element rather than the whole bar, so a
 *    click on a control is never swallowed as a drag.
 *  - Double-clicking the drag region toggles maximise, matching platform
 *    convention.
 *  - In a browser (`web` host) the controls are hidden entirely, because a
 *    web page must not draw chrome it does not own.
 *  - Every control carries a real `aria-label`, and the close control is
 *    keyboard reachable in the expected order.
 */
export function WindowControls(): React.ReactElement | null {
  const [api, setApi] = useState<WindowApi | null>(null);

  useEffect(() => {
    let live = true;
    if (detectHost() !== "tauri") return;
    void getWindowApi().then((a) => { if (live) setApi(a); });
    return () => { live = false; };
  }, []);

  const onDragStart = useCallback((e: React.MouseEvent) => {
    // A drag gesture must not start from a control.
    if ((e.target as HTMLElement).closest("button")) return;
    void api?.startDragging();
  }, [api]);

  const onDoubleClick = useCallback(() => {
    void api?.toggleMaximize();
  }, [api]);

  if (!api) return null;

  return (
    <div className="winctl" aria-hidden={false}>
      <div
        className="winctl-drag"
        onMouseDown={onDragStart}
        onDoubleClick={onDoubleClick}
        title="Drag to move · double-click to maximize"
      />
      <div className="winctl-btns">
        <button type="button" onClick={() => void api.minimize()} aria-label="Minimize" title="Minimize">
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M0 5h10" stroke="currentColor" strokeWidth="1" /></svg>
        </button>
        <button type="button" onClick={() => void api.toggleMaximize()} aria-label="Maximize" title="Maximize / restore">
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
            <rect x="0.5" y="0.5" width="9" height="9" fill="none" stroke="currentColor" strokeWidth="1" />
          </svg>
        </button>
        <button type="button" className="is-close" onClick={() => void api.close()} aria-label="Close" title="Close">
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
            <path d="M0 0l10 10M10 0L0 10" stroke="currentColor" strokeWidth="1" />
          </svg>
        </button>
      </div>
    </div>
  );
}
