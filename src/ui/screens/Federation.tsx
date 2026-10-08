/**
 * SelfImpulse — Federation: mount and inspect the bundled A2A host.
 *
 * Mounting is explicit, never automatic: the listener starts only when the button
 * is pressed. The state shown here is the supervisor's answer from
 * `ipc.federationStatus`, not an inference from a command's exit code.
 *
 * Not wired in this window: originating a crossing. The delegation executor lives
 * in the host process, which a renderer cannot reach; the caller-side entry point
 * is `mountFederation(deps)` in src/mission/a2aFederation.ts.
 */
import React, { useCallback, useEffect, useState } from "react";
import { ipc, type FederationStatus } from "../../ipc/client";

const IDLE: FederationStatus = {
  state: "unavailable", bundled: false, hostPath: null, running: false,
  pid: null, port: null, cardUrl: null, interfaceUrl: null, selfimpulse: null,
  identityFp: null, cardSigned: false, tokenMinted: false,
  bindScope: null, bindAddress: null, pairingCode: null, pairingExpires: null,
  files: false,
  detail: "Reading status…",
};

const STATE_WORD: Record<FederationStatus["state"], string> = {
  stopped: "Not mounted",
  starting: "Starting…",
  running: "Running",
  failed: "Failed",
  unavailable: "Unavailable",
};

export default function Federation(): React.ReactElement {
  const [st, setSt] = useState<FederationStatus>(IDLE);
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<string | null>(null);
  /* Chosen before the mount, and the widest option is not offered at all. */
  const [bind, setBind] = useState<"local" | "lan">("local");
  const [pair, setPair] = useState(false);
  const [files, setFiles] = useState(false);

  const refresh = useCallback(async () => {
    try { setSt(await ipc.federationStatus()); }
    catch (e) { setSt({ ...IDLE, detail: `Could not read the bundle state: ${String(e)}` }); }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  /* Poll only while the mount is in flight; a timer that outlives `starting`
     keeps refreshing after the operator has moved on. */
  useEffect(() => {
    if (st.state !== "starting") return;
    const t = setInterval(() => { void refresh(); }, 700);
    return () => clearInterval(t);
  }, [st.state, refresh]);

  const mount = useCallback(async () => {
    setBusy(true);
    setOutcome(null);
    setSt((s) => ({ ...s, state: "starting", running: false, detail: "Starting…" }));
    try {
      const r = await ipc.federationMount({ selfimpulse: "SelfImpulse", port: 0, bind, pair, files });
      setOutcome(r.detail);
    } catch (e) {
      setOutcome(`Mount failed: ${String(e)}`);
    } finally {
      setBusy(false);
      await refresh();
    }
  }, [bind, pair, files, refresh]);

  const stop = useCallback(async () => {
    setBusy(true);
    setOutcome(null);
    try {
      const r = await ipc.federationStop();
      setOutcome(r.detail);
    } catch (e) {
      setOutcome(`Unmount failed: ${String(e)}`);
    } finally {
      setBusy(false);
      await refresh();
    }
  }, [refresh]);

  const canMount = st.bundled && !st.running && st.state !== "starting" && !busy;
  const canStop = st.running && !busy;

  return (
    <div className="si-screen" data-testid="federation">
      <header className="si-screen-head">
        <h2>Federation</h2>
      </header>

      <section className="si-card">
        <h3>Status</h3>
        <p className="si-sub" role="status" data-testid="federation-detail">
          <strong data-testid="federation-state">{STATE_WORD[st.state]}</strong> — {st.detail}
        </p>

        {st.hostPath ? <p className="si-mono si-small">host: {st.hostPath}</p> : null}

        {st.running ? (
          <dl className="si-kv" data-testid="federation-live">
            <dt>pid</dt><dd className="si-mono">{st.pid}</dd>
            <dt>port</dt><dd className="si-mono">{st.port}</dd>
            <dt>card</dt><dd className="si-mono">{st.cardUrl}</dd>
            <dt>interface</dt>
            <dd className="si-mono" data-testid="federation-interface">{st.interfaceUrl ?? "—"}</dd>
            <dt>bound to</dt>
            <dd className="si-mono" data-testid="federation-bind">{st.bindAddress ?? "—"}</dd>
            <dt>selfimpulse</dt><dd className="si-mono">{st.selfimpulse}</dd>
            <dt>identity</dt><dd className="si-mono">{st.identityFp}</dd>
            <dt>card signed</dt><dd>{st.cardSigned ? "yes" : "no"}</dd>
            <dt>token</dt><dd>{st.tokenMinted ? "minted here" : "supplied by you"}</dd>
            <dt>file exchange</dt>
            <dd data-testid="federation-files-live">{st.files ? "mounted" : "not mounted"}</dd>
          </dl>
        ) : null}

        {st.running && st.pairingCode ? (
          <div className="si-card" data-testid="federation-pairing">
            <h3>Pair a peer</h3>
            <p className="si-mono si-big" data-testid="federation-pairing-code">{st.pairingCode}</p>
            <p className="si-note">Works once. Expires {st.pairingExpires ?? "—"}.</p>
          </div>
        ) : null}
      </section>

      <section className="si-card">
        <h3>Listener</h3>

        {!st.running ? (
          <fieldset className="si-fieldset" data-testid="federation-choose">
            <legend>Who may reach this machine</legend>
            <label className="si-radio">
              <input
                type="radio" name="si-bind" value="local" checked={bind === "local"}
                onChange={() => setBind("local")} data-testid="federation-bind-local"
              />
              <span><strong>This machine only</strong> — binds 127.0.0.1.</span>
            </label>
            <label className="si-radio">
              <input
                type="radio" name="si-bind" value="lan" checked={bind === "lan"}
                onChange={() => setBind("lan")} data-testid="federation-bind-lan"
              />
              <span>
                <strong>My network</strong> — binds this machine&rsquo;s network address;
                a peer still needs a paired credential.
              </span>
            </label>
            <label className="si-check">
              <input
                type="checkbox" checked={pair} onChange={() => setPair(!pair)}
                data-testid="federation-pair-toggle"
              />
              <span>Create a one-time pairing code</span>
            </label>
            <label className="si-check">
              <input
                type="checkbox" checked={files} onChange={() => setFiles(!files)}
                data-testid="federation-files-toggle"
              />
              <span>Allow paired peers to offer files</span>
            </label>
          </fieldset>
        ) : null}

        <div className="si-row">
          <button
            className="si-btn si-btn-primary"
            onClick={() => void mount()}
            disabled={!canMount}
            data-testid="federation-mount"
          >
            {st.state === "starting" ? "Mounting…" : "Mount the A2A host"}
          </button>
          <button
            className="si-btn"
            onClick={() => void stop()}
            disabled={!canStop}
            data-testid="federation-stop"
          >
            Unmount
          </button>
          <button className="si-btn" onClick={() => void refresh()} data-testid="federation-refresh">
            Re-check
          </button>
        </div>

        <p className="si-note">
          This app does not start a federation listener on launch. Mounting publishes a signed agent card
          describing this machine; a peer must present an authorized credential to call it.
        </p>

        {!st.bundled ? <p className="si-note">This build has no A2A host bundle.</p> : null}

        {outcome ? (
          <pre className="si-mono si-small si-pre" role="status" data-testid="federation-outcome">{outcome}</pre>
        ) : null}
      </section>
    </div>
  );
}
