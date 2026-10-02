/**
 * Federation — the explicit A2A mounting surface.
 *
 * The reviewer's point was correct and it was about product concepts rather
 * than code: the app bundled an A2A host, reported `a2aHostPath` from `app_info`,
 * and then nothing ever read that field. The architecture was real but invisible,
 * so a user had to discover federation rather than be offered it.
 *
 * THE DECISION THIS SCREEN ENCODES: mounting is EXPLICIT, never automatic.
 *
 * The A2A host binds a TCP port and publishes a signed agent card describing
 * this machine. Starting one on app launch would mean the product opens a
 * listener nobody asked for — which is the opposite of what this product is for.
 * So the button says what it does, and the user decides. That is not a missing
 * feature; it is the governance posture applied to the app's own network
 * surface.
 *
 * The second decision: this screen reports the SUPERVISOR'S state, not a guess.
 * "Running" here means the OS has been asked and said the child is alive. An
 * earlier version of this file called a mount successful because a command
 * returned before its 20-second timeout killed the server it had just started —
 * a green light on a process that was already dead.
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import { ipc, type FederationStatus } from "../../ipc/client";

const IDLE: FederationStatus = {
  state: "unavailable", bundled: false, hostPath: null, running: false,
  pid: null, port: null, cardUrl: null, interfaceUrl: null, selfimpulse: null,
  identityFp: null, cardSigned: false, tokenMinted: false,
  bindScope: null, bindAddress: null, pairingCode: null, pairingExpires: null,
  files: false,
  detail: "Reading the bundle state…",
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
  /* Bind scope is chosen BEFORE the mount, not discovered after it. Defaulting
   * to the widest option and letting the operator notice would be the wrong
   * default in a product whose whole argument is that it does not do things
   * behind your back — and a wildcard bind is not offered at all. */
  const [bind, setBind] = useState<"local" | "lan">("local");
  const [pair, setPair] = useState(false);
  /* File exchange is its own decision, for the same reason binding is: a
   * control that is on by default is a control the operator did not make. */
  const [files, setFiles] = useState(false);
  const mountedOnce = useRef(false);

  const refresh = useCallback(async () => {
    try { setSt(await ipc.federationStatus()); }
    catch (e) { setSt({ ...IDLE, detail: `Could not read the bundle state: ${String(e)}` }); }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  /* While a mount is in flight the backend is waiting for the host to announce
   * itself, so the screen polls. It stops the moment the answer is not
   * `starting` — a background timer that outlives the mount is how a UI ends up
   * refreshing forever after the user closed the window. */
  useEffect(() => {
    if (st.state !== "starting") return;
    mountedOnce.current = true;
    const t = setInterval(() => { void refresh(); }, 700);
    return () => clearInterval(t);
  }, [st.state, refresh]);

  const mount = useCallback(async () => {
    setBusy(true);
    setOutcome(null);
    setSt((s) => ({ ...s, state: "starting", running: false, detail: "Verifying the engine pin, then signing the card…" }));
    try {
      const r = await ipc.federationMount({ selfimpulse: "SelfImpulse", port: 0, bind, pair, files });
      setOutcome(r.detail);
    } catch (e) {
      setOutcome(`Mount failed in words rather than pretending: ${String(e)}`);
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
      setOutcome(`Stop failed in words rather than pretending: ${String(e)}`);
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
        <p className="si-sub">
          Team up with other SelfImpulse owners — every handoff is signed and receipted.
        </p>
      </header>

      <section className="si-card">
        <h3>What mounting does</h3>
        <ul className="si-list">
          <li>Starts the A2A host that ships <em>inside</em> this app — not a separately installed service.</li>
          <li>
            Binds a local port and publishes a <strong>signed agent card</strong> describing this machine,
            its teammates and its policy. Peers must present an authorized credential to call it.
          </li>
          <li>
            The host verifies its own engine against a committed SHA-256 before it will listen; a stale or
            tampered bundle fails closed rather than starting.
          </li>
          <li>
            Every inbound delegation still passes the same gates as local work: the receiver ladder, the
            principal chain, and this seat&rsquo;s authority envelope.
          </li>
          <li>
            It stays up until you unmount it or quit SelfImpulse. Quitting the app stops the listener — a
            card must not outlive the machine whose owner closed the window.
          </li>
        </ul>
        <p className="si-note">
          This app does <strong>not</strong> start a federation listener on launch. A network listener is
          something you turn on, not something that turns on with you.
        </p>
      </section>

      <section className="si-card">
        <h3>Status</h3>
        <p className="si-sub" data-testid="federation-detail">
          <strong data-testid="federation-state">{STATE_WORD[st.state]}</strong> — {st.detail}
        </p>

        {st.hostPath ? <p className="si-mono si-small">host: {st.hostPath}</p> : null}

        {st.running ? (
          <dl className="si-kv" data-testid="federation-live">
            <dt>pid</dt><dd className="si-mono">{st.pid}</dd>
            <dt>port</dt><dd className="si-mono">{st.port}</dd>
            <dt>card</dt><dd className="si-mono">{st.cardUrl}</dd>
            <dt>bound to</dt>
            <dd className="si-mono" data-testid="federation-bind">{st.bindAddress ?? "—"}</dd>
            <dt>selfimpulse</dt><dd className="si-mono">{st.selfimpulse}</dd>
            <dt>identity</dt><dd className="si-mono">{st.identityFp}</dd>
            <dt>card signed</dt><dd>{st.cardSigned ? "yes" : "no"}</dd>
            <dt>token</dt><dd>{st.tokenMinted ? "minted here" : "supplied by you"}</dd>
          </dl>
        ) : null}

        {!st.running ? (
          <fieldset className="si-fieldset" data-testid="federation-choose">
            <legend>Who may reach this machine</legend>
            <label className="si-radio">
              <input
                type="radio" name="si-bind" value="local" checked={bind === "local"}
                onChange={() => setBind("local")} data-testid="federation-bind-local"
              />
              <span>
                <strong>This machine only</strong> — binds 127.0.0.1. A peer on your
                network cannot see the card at all.
              </span>
            </label>
            <label className="si-radio">
              <input
                type="radio" name="si-bind" value="lan" checked={bind === "lan"}
                onChange={() => setBind("lan")} data-testid="federation-bind-lan"
              />
              <span>
                <strong>My network</strong> — binds this machine&rsquo;s network address,
                so another SelfImpulse can reach it. Anything else on the same network can
                reach the port too, which is why a peer still needs a paired credential.
              </span>
            </label>
            <p className="si-note" data-testid="federation-bind-note">
              There is no &ldquo;everything&rdquo; option. A wildcard bind would serve this
              machine&rsquo;s card on every interface it has at once, and you did not ask
              for that, so it is not offered.
            </p>
            <label className="si-check">
              <input
                type="checkbox" checked={pair} onChange={() => setPair(!pair)}
                data-testid="federation-pair-toggle"
              />
              <span>Create a one-time pairing code so a peer machine can join</span>
            </label>
            <label className="si-check">
              <input
                type="checkbox" checked={files} onChange={() => setFiles(!files)}
                data-testid="federation-files-toggle"
              />
              <span>Allow paired peers to offer files (AlterSend)</span>
            </label>
            {files ? (
              <p className="si-hint">
                An offer is still not an acceptance. Every file a peer sends is
                held until you look at its name, size and hash, and nothing is
                written anywhere you did not choose. Received files wait in your
                user folder, not inside the app.
              </p>
            ) : null}
          </fieldset>
        ) : null}

        {st.running && st.pairingCode ? (
          <div className="si-card" data-testid="federation-pairing">
            <h3>Pair a peer</h3>
            <p className="si-sub">
              Read this to the machine you are pairing. It works <strong>once</strong>.
            </p>
            <p className="si-mono si-big" data-testid="federation-pairing-code">{st.pairingCode}</p>
            <p className="si-note">
              Expires {st.pairingExpires ?? "shortly"}. After that, or after it is used,
              it is dead — pair again by remounting. This is not the host&rsquo;s token:
              the token never leaves this process, and this code only buys the peer a
              credential scoped to delegation.
            </p>
          </div>
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

        {!st.bundled ? (
          <p className="si-note">
            This build shipped without the A2A host bundle, so the control is disabled rather than
            silently doing nothing.
          </p>
        ) : null}

        {outcome ? (
          <pre className="si-mono si-small si-pre" data-testid="federation-outcome">{outcome}</pre>
        ) : null}
      </section>
    </div>
  );
}
