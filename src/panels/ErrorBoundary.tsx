import React from "react";
import { recordCrash, type CrashKind } from "../security/crashLedger";

interface Props {
  children: React.ReactNode;
  /** the door or subsystem, shown verbatim in the crash screen and the ledger */
  label: string;
  kind?: CrashKind;
  /** changing this clears a caught crash — pass the active screen so a crash
   *  in one door does not still be on screen after the user navigates away */
  resetKey?: string | number;
  /** what the recovery button does; defaults to re-rendering the subtree */
  onLeave?: () => void;
}
interface State { err?: Error; recorded?: { ok: boolean; note: string } }

/**
 * The render boundary.
 *
 * WHY IT IS WRITTEN THIS WAY
 * -------------------------
 * The previous version existed and nothing imported it, so a throw in any
 * screen blanked the entire window. Three things that a real boundary must do
 * and the old one did not:
 *
 *   1. RECORD the crash before offering Retry. A boundary that only prints the
 *      message destroys the evidence the moment the user clicks away, and on
 *      reload the message is gone. Recording is fire-and-forget on purpose: the
 *      boundary must render its recovery UI even if the ledger write is slow,
 *      and a failed write must not become a second crash.
 *   2. RESET ON NAVIGATION, not only on the Retry button. React re-mounts a
 *      boundary when its `resetKey` changes, so switching doors clears a stale
 *      crash screen instead of stranding the user on it. Without this, a crash
 *      in Docs would still be on screen after clicking to Receipts.
 *   3. SHOW WHAT WAS RECORDED. If the ledger refused the write, saying so is
 *      the honest move — the same rule the rest of the stack follows.
 */
export class ErrorBoundary extends React.Component<Props, State> {
  state: State = {};
  /** guards against a second record for the same throw (StrictMode double-invoke) */
  private recording = false;

  static getDerivedStateFromError(e: Error): Partial<State> {
    return { err: e };
  }

  componentDidUpdate(prev: Props): void {
    if (this.state.err && prev.resetKey !== this.props.resetKey) {
      this.setState({ err: undefined, recorded: undefined });
    }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    if (this.recording) return;
    this.recording = true;
    void recordCrash({
      kind: this.props.kind ?? "render",
      where: this.props.label,
      error,
      stack: [error.stack, info.componentStack].filter(Boolean).join("\n"),
    }).then(
      (r) => this.setState({ recorded: { ok: r.ok, note: r.note } }),
      () => this.setState({ recorded: { ok: false, note: "the crash could not be recorded." } }),
    );
  }

  render() {
    const { err, recorded } = this.state;
    if (err) {
      return (
        <div className="panel-page" role="alert">
          <h2>{this.props.label} stopped</h2>
          <p className="sub">
            The rest of the app is still running — this door did not. Nothing was lost and no action was taken.
          </p>
          <p className="sub" style={{ fontFamily: "var(--font-mono, monospace)", whiteSpace: "pre-wrap" }}>
            {err.name}: {err.message}
          </p>
          <p className="sub">
            {recorded
              ? recorded.ok
                ? `Recorded in the local crash ledger (${recorded.note}). It never leaves this machine.)`
                : `Not recorded — ${recorded.note}`
              : "Recording the crash…"}
          </p>
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button
              onClick={() => {
                this.recording = false;
                this.setState({ err: undefined, recorded: undefined });
              }}
            >
              Try again
            </button>
            <button onClick={() => { this.recording = false; this.setState({ err: undefined, recorded: undefined }); this.props.onLeave?.(); }}>
              Back to the Captain
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
