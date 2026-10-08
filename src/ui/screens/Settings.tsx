import React, { useEffect, useState } from "react";
import { useVh , THEMES } from "../store";
import { ipc, useTauri, type SecretStatus } from "../../ipc/client";
import { saveNativeProvider, providerSecretRef, nativeEndpointFor } from "../../engine/nativeProvider";
import { Mcp } from "./Mcp";
import { PROVIDER_DEFAULTS } from "../../engine/providers";
import { CrewMatrixButton } from "./CrewMatrix";
import { knownCategories, categorySizes, policySummary } from "../../engine/crewPolicy";
import { AUTONOMY_LEVEL_NAMES, HEARTBEAT_DEFAULT_MS, type AutonomyLevel } from "../../engine/initiative";
import type { ProviderKind } from "../../engine/types";
import { mcpRuntimeServers } from "../../engine/mcpRuntime";
import { PRODUCT_NAME, ENGINE_CREDIT } from "../../brand";
import { detectHost } from "../../app/desktop";
import {
  issueLiveGrant, revokeLiveGrant, runLiveCrossing, liveGrant, liveUsage, liveLedgerView,
  loadRegulatedActivation, enableRegulatedBench, DELEGATION_CAPABILITIES, REGULATED_DOMAIN_SLUGS,
} from "../../engine/federation/live";
import { standingNotice } from "../../engine/federation/standing";
import { ledgerRowSentence } from "../../engine/federation/ledger";
import { pairKey } from "../../engine/selfimpulseMesh";
import type { DelegationCapability } from "../../engine/reach/delegationGrant";
/* 19.8 — the identity seam and the local crash ledger reach Settings. The owner
 * handle is written through `setOwnerDisplay` (not a raw localStorage write), so
 * the name in the corner and the subject on every receipt are one fact. */
import { setOwnerDisplay, dataClass, setDataClass, identityProvider, type DataClass } from "../../security/identity";
import { readCrashes, verifyCrashChain, lastCrash, exportCrashReport, clearCrashes, chainAssurance } from "../../security/crashLedger";
import { toast } from "../../panels/Toast";
import { APP_CONNECTORS, connectorState, setConnectorConnected } from "../../engine/connectors";
import { CHANNELS, channelState, firesInLastDay, isDue, setChannelEnabled } from "../../engine/channels";
/* The books: Agent FinOps, the fleet roster, and the live assurance score —
   the same rows the executor settles, the same authority the sovereign signs. */
import { chargebackCsv, ledgerDigest, summary } from "../../engine/finops";
import { roster, exportRoster } from "../../engine/iamLedger";
import { scoreFromLedger } from "../../engine/assuranceLive";
/* The proactive crew: schedules, signed webhooks and named events that start
   governed runs — a trigger is a doorbell, not a key. */
import { listTriggers, addTrigger, removeTrigger, setTriggerEnabled, type Trigger } from "../../engine/intakeTriggers";

type Sect = "provider" | "vault" | "autonomy" | "mcp" | "permissions" | "federation" | "appearance" | "identity" | "about" | "crew" | "connectors" | "channels" | "ledgers" | "triggers";
const SECTS: Array<[Sect, string]> = [
  ["provider", "AI connection"],
  ["vault", "Key vault"],
  ["autonomy", "Independence"],
  ["mcp", "Tools (MCP)"],
  ["permissions", "Permissions"],
  ["ledgers", "Ledgers"],
  ["triggers", "Triggers"],
  ["crew", "Crew"],
  ["federation", "Federation"],
  ["appearance", "Appearance"],
  ["connectors", "Connect"],
  ["channels", "Channels"],
  ["identity", "Identity"],
  ["about", "About"],
];
const KINDS: Array<[ProviderKind, string]> = [["openai-compatible", "OpenAI-compatible"], ["anthropic", "Anthropic"], ["gemini", "Gemini"]];

/* Three clusters, every section reachable. The nav renders each as a caption plus
 * its own item list, so the captions read as headings and not as run-on items. */
const SECT_GROUPS: Array<[string, Sect[]]> = [
  ["Everyday", ["provider", "appearance", "autonomy", "crew"]],
  ["Security", ["vault", "permissions", "ledgers", "identity"]],
  ["Advanced", ["mcp", "federation", "triggers", "connectors", "channels", "about"]],
];

/* A finish swatch wears the finish. The span carries the theme id as its own
   `data-theme`, so the token blocks in theme.css and ink.css resolve against the
   swatch itself and it paints with the real ground, ramp and ink — not a copied
   table. The table this replaces listed two of six finishes with hex values that
   no longer matched anything, which left four swatches unpainted. */

export function Settings(): React.ReactElement {
  const [sect, setSect] = useState<Sect>("provider");
  return (
    <>
      {/* The shell's top bar owns the one visible title, so no .top header and no
          duplicate heading here; the section names itself for assistive tech. */}
      <div className="scroll"><section aria-label="Settings"><div className="settings">
        <nav className="snav" aria-label="Settings sections">
          {SECT_GROUPS.map(([cap, keys]) => (
            <div key={cap} className="snav-group">
              <b className="snav-cap">{cap}</b>
              {SECTS.filter(([k]) => keys.includes(k)).map(([k, l]) => (
                <button key={k} className="snav-item" aria-current={sect === k ? "page" : undefined} onClick={() => setSect(k)}>
                  <span>{l}</span>
                </button>
              ))}
            </div>
          ))}
        </nav>
        <div className="sbody">
          {sect === "provider" && <Provider />}
          {sect === "vault" && <Vault />}
          {sect === "autonomy" && <Autonomy />}
          {sect === "mcp" && <Mcp />}
          {sect === "permissions" && <Permissions />}
          {sect === "crew" && <Crew />}
          {sect === "federation" && <Federation />}
          {sect === "appearance" && <Appearance />}
          {sect === "connectors" && <Connectors />}
          {sect === "channels" && <Channels />}
          {sect === "ledgers" && <Ledgers />}
          {sect === "triggers" && <TriggersPane />}
          {sect === "identity" && <Identity />}
          {sect === "about" && <About />}
        </div>
      </div></section></div>
    </>
  );
}

/* THE KEY HOLDER.
 *
 * The three references this app can hold a provider key under — a closed family it
 * owns (`vh.providerkey.<kind>`), not a listing of the keychain. There is no command
 * that enumerates a credential store and this screen does not ask for one: it reads
 * the three names it already knows and reports what comes back, which is enough to
 * be exact about the only key that matters and cannot wander.
 */
const KEY_SLOTS: Array<{ kind: ProviderKind; label: string; ref: string }> =
  KINDS.map(([kind, label]) => ({ kind, label, ref: providerSecretRef(kind) }));

type KeyBinding = Awaited<ReturnType<typeof ipc.providerEndpointsList>>[number];

/** One of the store's honest states, said with its consequence. "memory-only" means
 *  nothing to an owner until they are told what is lost by it. "unknown" is carried
 *  too: this panel has not always been answered yet, and a reading shown before the
 *  answer arrives is a guess wearing a lamp. */
function locationOf(loc: SecretStatus["location"] | "unknown", label: string): { word: string; tone: string; line: string; cost: string | null } {
  switch (loc) {
    case "keychain":
      return {
        word: "OS keychain", tone: "ok",
        line: `The ${label} key is in your OS keychain, under the service name this app writes to. It outlives this window.`,
        cost: null,
      };
    case "memory-only":
      return {
        word: "Memory only", tone: "warn",
        line: `The ${label} key is in this process and nowhere else — the OS vault refused the write.`,
        cost: "It is not on disk. Closing SelfImpulse destroys it, and there is no copy to recover.",
      };
    case "browser-localStorage":
      return {
        word: "Browser storage", tone: "warn",
        line: "The preview has no native key holder, so the key sits in this browser's own storage.",
        cost: "Anything running in this origin can read it. That is the difference between this host and the desktop build.",
      };
    case "unknown":
      return { word: "Not read", tone: "", line: "Nothing has asked the store where this key is — or the store did not answer.", cost: null };
    default:
      return {
        word: "Nothing stored", tone: "",
        line: `No ${label} key is stored. Without one the Captain plans the request and tells you it did not run, instead of answering as though it had.`,
        cost: null,
      };
  }
}

function originOf(url: string): string {
  try { return new URL(url).origin; } catch { return url; }
}

/** A binding nobody can date is not evidence, so the moment a human said yes is shown
 *  — and the raw string is kept if it will not parse, because an unreadable timestamp
 *  is still a fact about the record. */
function boundWhen(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString([], { year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function Provider() {
  const { provider, setProvider, forgetProvider, securityNote } = useVh();
  const [kind, setKind] = useState<ProviderKind>(provider?.kind ?? "openai-compatible");
  const [baseUrl, setBase] = useState(provider?.baseUrl ?? PROVIDER_DEFAULTS["openai-compatible"]);
  const [model, setModel] = useState(provider?.model ?? "");
  const [key, setKey] = useState("");
  const [remember, setRemember] = useState(true);
  const [note, setNote] = useState<string | null>(null);
  const native = useTauri();
  /* Three real calls, no invented ones: `secret_exists` answers WHERE each reference
     is held (keychain / memory-only / absent — the Rust store's own three states),
     `provider_endpoints_list` answers which origin a human bound and when, and
     `secret_get` on a key that is actually present answers with `value: null,
     redacted: true`. The third is the one that lets this screen state the page's own
     limits as a reading rather than as a promise. */
  const [vault, setVault] = useState<Record<string, SecretStatus>>({});
  const [bindings, setBindings] = useState<KeyBinding[]>([]);
  const [withheld, setWithheld] = useState<{ hint: string | null } | null>(null);
  const [probed, setProbed] = useState(false);
  /* "absent" is an answer; "not read yet" is not. Every reading below goes through
     this, so the panel never reports a key as missing in the moment before it was
     asked. */
  const stateOf = (secretRef: string): SecretStatus["location"] | "unknown" =>
    !probed ? "unknown" : vault[secretRef]?.location ?? "absent";
  const ref = providerSecretRef(kind);
  const held = vault[ref];
  const label = KINDS.find((k) => k[0] === kind)?.[1] ?? "selected";
  /* The preview's key is in the page's own memory — a fourth state the native store
     has no word for, and the one place the instrument would otherwise read "nothing
     stored" while the session is holding a key. It is named rather than folded into
     the OS vocabulary, because the difference IS the product's claim. */
  const inThisWindow = !native && provider?.kind === kind && !!provider.apiKey;
  const read = inThisWindow
    ? { word: "This window", tone: "warn", line: "The preview keeps the key in the app's own memory. There is no native store here to hold it, and no native sender either.", cost: "It is gone when the tab closes. The desktop build hands the same paste to the OS keychain and forgets it here." }
    : locationOf(stateOf(ref), label);
  const binding = bindings.find((b) => b.secretRef === ref);

  /* Re-read on mount, then on the same slow tick the Permissions pane uses. Deleting a
     key happens in the store's async tail, and binding an origin happens in a dialog
     this page cannot see — so a panel that read once would go on describing a state
     the owner has already changed. */
  const refresh = async (): Promise<void> => {
    try {
      const [locations, bound] = await Promise.all([
        ipc.secretExists(KEY_SLOTS.map((s) => s.ref)),
        ipc.providerEndpointsList(),
      ]);
      setVault(locations);
      setBindings(bound);
      setProbed(true);
    } catch { /* the readings stay as they were — and "Not read" is what they stay as */ }
  };
  useEffect(() => {
    void refresh();
    const t = setInterval(() => void refresh(), 15_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [native]);

  /* Asked only of the native host, and only about a reference that just reported a
     key. The browser's `secret_get` DOES hand back a value, and this screen has no
     business fetching one it would then have to be careful with. The claim
     "this window cannot read it" is printed only when native actually answered
     `value: null, redacted: true` — a UI asserting a guarantee it did not receive
     would be the same kind of lie this section exists to remove. */
  useEffect(() => {
    let live = true;
    setWithheld(null);
    if (!native || held?.exists !== true) return () => { live = false; };
    void ipc.secretGet(ref)
      .then((g) => { if (live && g.present && g.value === null && g.redacted === true) setWithheld({ hint: g.hint ?? null }); })
      .catch(() => undefined);
    return () => { live = false; };
  }, [native, ref, held?.exists]);

  const save = async () => {
    if (!model.trim()) { setNote("Model required."); return; }
    if (!baseUrl.trim()) { setNote("Endpoint required."); return; }
    const cfg = { kind, baseUrl: baseUrl.trim().replace(/\/+$/, ""), model: model.trim() };
    if (native) {
      const r = await saveNativeProvider(cfg, key.trim());
      if (!r.ok) { setNote(r.note); return; }
      /* Always persisted here: `saveNativeProvider` above has already written the
         key to the OS keychain, and the native sender resolves it by reference. */
      const done = await setProvider({ ...cfg, apiKey: key.trim(), secretRef: r.secretRef }, true);
      setNote(`${r.note} ${done.note}`);
      setKey("");
      void refresh();
      return;
    }
    // A blank key field means "keep the saved key".
    const resolvedKey = key.trim() || provider?.apiKey || "";
    const r = await setProvider({ kind, baseUrl: cfg.baseUrl, apiKey: resolvedKey, model: cfg.model }, remember);
    setNote(r.note);
    setKey("");
  };

  const trimmedBase = baseUrl.trim().replace(/\/+$/, "");
  /* `nativeEndpointFor` is the app's own decision procedure: undefined means the base
     is the vendor's canonical host and native's built-in endpoint applies — a
     destination no page can widen. Anything else is a URL the native side will only
     attach the key to if a human bound that origin at a dialog. */
  const endpoint = native ? nativeEndpointFor({ kind, baseUrl: trimmedBase }) : undefined;
  const sentTo = endpoint === undefined ? originOf(trimmedBase || PROVIDER_DEFAULTS[kind]) : originOf(endpoint);
  const reach = !native
    ? "This window sends the request itself — the browser has no native sender and no destination check."
    : endpoint === undefined
      ? `${sentTo} — the vendor's own host, built into the app. Nothing in this page can point a key somewhere else.`
      : binding
        ? `${binding.origin} — the only origin this key may reach, and only because you approved it at a dialog this page cannot open.`
        : `${sentTo} is unbound. No key can be sent there until a human approves this origin at the native dialog.`;

  /* A key in the vault with no settings attached is a real and reachable state: the
     desktop loader gives up quietly when the localStorage pointer is missing, even
     though the keychain still holds the key. It is surfaced as the discrepancy it
     is — stored, unusable, finishable — and nothing is read back to prove it. */
  const stranded = probed
    ? KEY_SLOTS.filter((s) => vault[s.ref]?.exists === true && provider?.secretRef !== s.ref && provider?.kind !== s.kind)
    : [];
  const nothingHeld = probed && KEY_SLOTS.every((s) => vault[s.ref]?.exists !== true) && !provider;

  /* What the page can see of the secret is native's answer, not this component's
     claim, and it is printed in the shape it came back in. The preview has no such
     refusal, so it gets the other sentence — one screen must not describe a boundary
     that only exists on the other host. */
  const readable = withheld
    ? `null · redacted${withheld.hint ? ` · ${withheld.hint}` : ""}`
    : native
      ? (held?.exists ? "reading…" : "nothing to read")
      : (held?.exists || inThisWindow) ? "the key itself" : "nothing to read";

  /* "Forget" deletes through the store's own async tail, so the reading taken the
     instant the button is pressed still says the key is resident. One follow-up read
     settles it, and the store's note about a refused delete stays on screen either
     way — a key that could not be deleted is said, not quietly re-listed. */
  const removeKey = (): void => {
    forgetProvider(); setNote(null); setWithheld(null);
    setTimeout(() => void refresh(), 1_200);
  };

  return (
    <section className="sgroup">
      <h3>AI connection</h3>

      {/* The reading comes before the form, because this is the surface a person checks
          when they are deciding whether to trust the machine: where the key is, what
          this page can see of it, where it is allowed to go, who said so, and what it
          costs if the answer is "memory". Every row is an answer from the native store,
          not an assertion by the page. */}
      <div className="keyholder">
        <div className="row" style={{ gap: "var(--s-2)" }}>
          <span className={`led ${read.tone}`} />
          <b>{read.word}</b>
          <span className="lbl push">{native ? "key holder" : "preview · no key holder"}</span>
        </div>
        <p className="hint">{read.line}</p>

        <div>
          <dl className="kv"><dt>Reference</dt><dd className="mono">{ref}</dd></dl>
          <dl className="kv"><dt>Connected as</dt><dd className="mono">{provider ? `${provider.model || "no model"} · ${originOf(provider.baseUrl)}` : "nothing yet"}</dd></dl>
          <dl className="kv"><dt>This page can read</dt><dd className="mono" style={{ overflowWrap: "anywhere" }}>{readable}</dd></dl>
          <dl className="kv"><dt>May be sent to</dt><dd className="mono" style={{ overflowWrap: "anywhere" }}>{sentTo}</dd></dl>
          <dl className="kv"><dt>Approved by</dt><dd>{binding ? `${binding.boundBy} · ${boundWhen(binding.boundAt)}` : native ? (endpoint === undefined ? "no approval needed — vendor's own host" : "no one yet") : "nothing binds it on this host"}</dd></dl>
        </div>
        <p className="hint">{reach}</p>
        {withheld && <p className="hint">Native refuses the value rather than the page hiding it: a provider key is the one class <span className="mono">secret_get</span> will not return (<span className="mono">src-tauri/src/commands.rs</span>). Presence and a four-character fingerprint is all any screen here can ever show.</p>}
        {read.cost && <p className="note warn">{read.cost}</p>}
        {stranded.length > 0 && <p className="note warn">A key is stored for {stranded.map((s) => s.label).join(" and ")}, but no endpoint or model is configured for it — finish setup here.</p>}
        {nothingHeld && <p className="hint">A key pasted below takes one trip: this field, then the store above. It does not come back. The reference and the settings stay; the key is used outside this window, by the native side, so nothing here can show it and a picture of this screen cannot leak one.</p>}

        <div className="acts">
          {provider && <button className="btn sm ghost danger" onClick={removeKey}>Remove key</button>}
          {stranded.map((s) => (
            <button key={s.ref} className="btn sm" onClick={() => { setKind(s.kind); setBase(PROVIDER_DEFAULTS[s.kind]); setNote("The stored key stays where it is. Set the endpoint and model, then connect without pasting anything."); }}>
              Finish setup · {s.label}
            </button>
          ))}
        </div>

        {/* All three references the store can hold a key under, each with where it
            stands and the origin it is bound to. A closed list, read by name — the page
            is not given a way to walk a keychain, and does not need one. */}
        <div>
          {KEY_SLOTS.map((s) => {
            const r = locationOf(stateOf(s.ref), s.label);
            const b = bindings.find((x) => x.secretRef === s.ref);
            return (
              <dl key={s.ref} className="kv">
                <dt><span className={`led ${r.tone}`} /> {s.label}</dt>
                <dd className="mono" style={{ overflowWrap: "anywhere" }}>{r.word}{b ? ` · ${b.origin}` : ""}{provider?.secretRef === s.ref ? " · in use" : ""}</dd>
              </dl>
            );
          })}
        </div>
      </div>

      <div className="stack">
        {/* Each field's name rides in `lbl`, the same micro caption the rest of the
            product uses, so a password box that will never show its value again is
            at least unmistakably labelled. */}
        <label className="field" htmlFor="set-key"><span className="lbl">API key</span>
          <div className="keyrow">
            <input id="set-key" className="input keyinput" type="password" autoComplete="new-password" spellCheck={false} placeholder={held?.exists ? "leave empty to keep the stored key" : "paste once — it is never shown again"} value={key} onChange={(e) => setKey(e.target.value)} />
          </div>
        </label>
        {/* The choice is stated where the key is typed, because it is a choice about
            that field and not a general preference. It is offered in the browser and
            NOT on the desktop, and that asymmetry is the honest one: the native sender
            attaches the key by reference out of the OS keychain, so a desktop key that
            was never stored is a desktop key that cannot be used. A checkbox that
            changes nothing there would be worse than no checkbox. */}
        {!native && <div className="field">
          <span className="lbl">Keep this key</span>
          <div className="checkrow">
            <input id="set-remember" type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
            <label htmlFor="set-remember">Remember on this device</label>
          </div>
          <span className="hint">Needs an unlocked Key vault — otherwise the model settings are saved and the key is not.</span>
        </div>}
        <label className="field" htmlFor="set-model"><span className="lbl">Model</span>
          <input id="set-model" className="input" autoComplete="off" spellCheck={false} placeholder="model id" value={model} onChange={(e) => setModel(e.target.value)} />
        </label>
        <label className="field" htmlFor="set-url"><span className="lbl">Endpoint URL</span>
          <input id="set-url" className="input" autoComplete="off" spellCheck={false} value={baseUrl} onChange={(e) => setBase(e.target.value)} />
        </label>
      </div>
      <div className="field"><span className="flabel">Provider</span>
        <div className="seg">{KINDS.map(([k, l]) => <button key={k} aria-pressed={kind === k} onClick={() => { setKind(k); setBase(PROVIDER_DEFAULTS[k]); }}>{l}</button>)}</div>
      </div>
      {/* A key already in the store is a reason the button works with an empty field:
          the native side keeps what it holds and only re-points the endpoint. The
          reading above is what makes that visible here instead of arriving as a
          refusal after the click. */}
      <div className="acts"><button className="btn primary" disabled={(!key.trim() && !provider && held?.exists !== true) || !model.trim() || !baseUrl.trim()} onClick={() => void save()}>{provider ? "Update" : "Connect"}</button>{(note ?? securityNote) && <span className="hint" role="status">{note ?? securityNote}</span>}</div>
    </section>
  );
}

/**
 * CREW — which desks the router may ask. The decision surface is the matrix
 * behind the button, so this pane only reports the live policy.
 */
function Crew(): React.ReactElement {
  const cats = knownCategories();
  const sizes = categorySizes();
  const total = cats.reduce((n, c) => n + (sizes[c] ?? 0), 0);
  const summary = policySummary();
  return (
    <section className="sgroup">
      <h3>Crew</h3>
      <div className="row">
        <span className={summary.off === 0 ? "led ok" : "led warn"} />
        <b>{summary.source === "default" ? "Shipped policy" : "Your policy"}</b>
        <span className="faint">
          {total.toLocaleString()} specialists · {summary.on} of {cats.length} desks on shift
          {summary.off > 0 ? ` · ${summary.off} off` : ""}
          {summary.narrowest ? ` · ${summary.narrowest} narrowed` : ""}
        </span>
        <span className="cm-actions"><CrewMatrixButton /></span>
      </div>
    </section>
  );
}

function Permissions() {
  const native = useTauri();
  const [grants, setGrants] = useState<Array<{ workspace: string; network: boolean; programs: string[]; secondsLeft: number }>>([]);
  const [bindings, setBindings] = useState<Array<{ secretRef: string; origin: string }>>([]);
  const [note, setNote] = useState<string | null>(null);
  const refresh = async () => {
    if (!native) return;
    try {
      setGrants(await ipc.execGrantsStatus());
      setBindings(await ipc.providerEndpointsList());
    } catch { /* the lists stay as they were */ }
  };
  useEffect(() => {
    void refresh();
    const t = setInterval(() => void refresh(), 15_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [native]);
  const askNetwork = async () => {
    try {
      const g = await ipc.execGrantRequest({ network: true, minutes: 30 });
      setNote(`Allowed for 30 minutes in ${g.workspace} — network ON.`);
      await refresh();
    } catch (e) { setNote(e instanceof Error ? e.message : String(e)); }
  };
  const revoke = async () => { await ipc.execGrantsRevoke(); setNote("Every grant was revoked — nothing may run until you allow it again."); await refresh(); };
  const unbind = async (ref: string) => { await ipc.providerUnbindEndpoint(ref); await refresh(); };
  return (
    <>
      <section className="sgroup">
        <h3>Programs</h3>
        {!native && <div className="note warn">Running programs and approving key destinations exist in the desktop build. Nothing here is active in the browser.</div>}
        {native && grants.length === 0 && <p className="hint">Nothing is allowed to run right now.</p>}
        {grants.map((g, i) => (
          <div key={i} className="row" style={{ flexDirection: "column", alignItems: "stretch", gap: 4 }}>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <span className={`led ${g.network ? "warn" : "ok"}`} />
              <b>{g.network ? "Network ON" : "No network"}</b>
              <span className="faint mono">{g.workspace}</span>
              <span className="hint" style={{ marginLeft: "auto" }}>{Math.max(1, Math.round(g.secondsLeft / 60))} min left</span>
            </div>
            <div className="mono faint">{g.programs.join(", ")}</div>
          </div>
        ))}
        <div className="acts">
          <button className="btn" disabled={!native} onClick={() => void askNetwork()}>Allow network for 30 min…</button>
          <button className="btn ghost danger" disabled={!native || grants.length === 0} onClick={() => void revoke()}>Revoke all</button>
          {note && <span className="hint">{note}</span>}
        </div>
      </section>
      <section className="sgroup">
        <h3>Where your keys may go</h3>
        {native && bindings.length === 0 && <p className="hint">Every key can reach only its own vendor.</p>}
        {bindings.map((b) => (
          <div key={b.secretRef} className="row">
            <b className="mono">{b.origin}</b><span className="faint mono">{b.secretRef}</span>
            <button className="btn sm ghost danger" style={{ marginLeft: "auto" }} onClick={() => void unbind(b.secretRef)}>Remove</button>
          </div>
        ))}
      </section>
    </>
  );
}

function Vault() {
  const { vault, createVault, unlockVault, lock } = useVh();
  const [pass, setPass] = useState("");
  /* `refused` marks the input invalid on a refused attempt, so the error is
     detectable without reading the note's wording. */
  const [note, setNote] = useState<string | null>(null);
  const [refused, setRefused] = useState(false);
  const act = async () => { const r = vault.status === "no-passphrase" ? await createVault(pass) : await unlockVault(pass); setNote(r.note); setRefused(!r.ok); if (r.ok) setPass(""); };
  return (
    <section className="sgroup">
      <h3>Vault</h3>
      <div className="row"><span className={`led ${vault.status === "unlocked" ? "ok" : vault.status === "sealed-locked" ? "warn" : ""}`} /><b>{vault.status === "unlocked" ? "Unlocked" : vault.status === "sealed-locked" ? "Locked" : "Not created"}</b>{vault.kdf && <span className="faint mono">{vault.kdf} · {vault.iterations?.toLocaleString()} rounds</span>}{vault.status === "unlocked" && <button className="btn sm ghost" style={{ marginLeft: "auto" }} onClick={lock}>Lock now</button>}</div>
      {vault.status !== "unlocked" && <>
        <label className="field"><span>Passphrase</span><input className="input" type="password" autoComplete="off" aria-invalid={refused || undefined} aria-describedby="set-vault-note" value={pass} onChange={(e) => setPass(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void act(); }} /></label>
        <div className="acts"><button className="btn primary" disabled={pass.length < 8} onClick={() => void act()}>{vault.status === "no-passphrase" ? "Create vault" : "Unlock"}</button><span className="hint" id="set-vault-note">{note ?? "at least 8 characters"}</span></div>
      </>}
      {vault.status === "unlocked" && note && <span className="hint" role="status">{note}</span>}
    </section>
  );
}

function Autonomy() {
  const { initiative, setAutonomy, wakeNow, stewardName, renameSteward } = useVh();
  const [name, setName] = useState(stewardName);
  const mcp = mcpRuntimeServers();
  return (
    <>
      <section className="sgroup">
        <h3>Autonomy</h3>
        <div className="radios">{([0, 1, 2, 3] as AutonomyLevel[]).map((l) => <label key={l} className="check"><input type="radio" name="auto" checked={initiative.level === l} onChange={() => setAutonomy(l)} /><span>{AUTONOMY_LEVEL_NAMES[l].split(" — ")[0]}<small>{AUTONOMY_LEVEL_NAMES[l].split(" — ")[1]}</small></span></label>)}</div>
        <div className="row"><span className="faint">Heartbeat</span><b>{Math.round(HEARTBEAT_DEFAULT_MS / 60000)} min</b><span className="faint" style={{ marginLeft: 16 }}>Scheduled follow-ups</span><b>{initiative.followUps.length}</b><span className="faint" style={{ marginLeft: 16 }}>Breaker</span><b>{initiative.breakerUntil && initiative.breakerUntil > Date.now() ? "tripped" : "closed"}</b>{initiative.level > 0 && <button className="btn ghost" style={{ marginLeft: "auto" }} onClick={() => void wakeNow()}>Run a heartbeat now</button>}</div>
      </section>
      <section className="sgroup">
        <h3>Captain</h3>
        <div className="acts"><input className="input" style={{ maxWidth: 260 }} aria-label="Captain's name" value={name} onChange={(e) => setName(e.target.value)} /><button className="btn" disabled={!name.trim() || name === stewardName} onClick={() => renameSteward(name.trim())}>Rename</button></div>
      </section>
      <section className="sgroup">
        <h3>Tools</h3>
        <div className="row"><span className="faint">MCP tool servers</span><b>{mcp.length}</b></div>
      </section>
    </>
  );
}

/* Federation — two owners, one standing grant, receipted crossings, a common
 * ledger derived from both stores. The live seam (engine/federation/live) does
 * the signing and refusing; this section only shows it and asks. */
function Federation() {
  const [ownerA, setOwnerA] = useState("you");
  const [ownerB, setOwnerB] = useState("peer");
  const [cap, setCap] = useState<DelegationCapability>(DELEGATION_CAPABILITIES[0]);
  const [task, setTask] = useState("Ship the release notes draft");
  const [days, setDays] = useState(30);
  const [regDomain, setRegDomain] = useState(REGULATED_DOMAIN_SLUGS[0] ?? "");
  const [regBy, setRegBy] = useState("");
  const [tick, setTick] = useState(0);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const pair = pairKey(ownerA.trim(), ownerB.trim());
  const grant = liveGrant(); const usage = liveUsage(grant);
  const rows = liveLedgerView(pair);
  const activation = loadRegulatedActivation();
  void tick;
  const run = async (fn: () => Promise<string | null>) => { setBusy(true); try { setNote(await fn()); } catch (e) { setNote(String(e)); } finally { setBusy(false); setTick((n) => n + 1); } };
  return (
    <>
      <section className="sgroup">
        <h3>Standing grant</h3>
        <div className="acts">
          {/* Each field carries an explicit aria-label: a placeholder is not a
              reliable accessible name (it disappears on the first keystroke). */}
          <input className="input" style={{ maxWidth: 140 }} aria-label="Initiating owner" value={ownerA} onChange={(e) => setOwnerA(e.target.value)} placeholder="you" />
          <input className="input" style={{ maxWidth: 140 }} aria-label="Responding peer owner" value={ownerB} onChange={(e) => setOwnerB(e.target.value)} placeholder="peer" />
          <input className="input" style={{ maxWidth: 90 }} type="number" min={1} aria-label="Grant lifetime in days" value={days} onChange={(e) => setDays(Number(e.target.value) || 1)} title="days" />
          {!grant
            ? <button className="btn" disabled={busy || !ownerA.trim() || !ownerB.trim()} onClick={() => void run(async () => { const r = await issueLiveGrant({ capabilities: [cap], maxCrossings: 5, windowMs: 24 * 3600 * 1000, windowMax: 2, expiresInMs: days * 24 * 3600 * 1000, initiatorHuman: ownerA.trim(), responderHuman: ownerB.trim() }); return r.ok ? "grant issued — both sides signed" : (r.refusal ?? "grant refused"); })}>Issue grant</button>
            : <button className="btn ghost" disabled={busy} onClick={() => void run(async () => { revokeLiveGrant("initiator", ownerA.trim(), "owner revoked in Settings"); return "grant revoked"; })}>Revoke</button>}
        </div>
        {grant && usage && <p className="lead" style={{ marginTop: 10 }}>{standingNotice(grant, usage.initiator)}</p>}
      </section>
      <section className="sgroup">
        <h3>Crossing</h3>
        <div className="acts">
          <select className="input" aria-label="Capability to cross with" value={cap} onChange={(e) => setCap(e.target.value as DelegationCapability)}>{DELEGATION_CAPABILITIES.map((c) => <option key={c} value={c}>{c}</option>)}</select>
          <input className="input" style={{ flex: 1, minWidth: 200 }} aria-label="Task to cross with" value={task} onChange={(e) => setTask(e.target.value)} />
          <button className="btn" disabled={busy || !task.trim()} onClick={() => void run(async () => { const r = await runLiveCrossing({ capability: cap, task: task.trim(), ownerA: ownerA.trim(), ownerB: ownerB.trim() }); return `${r.outcome.status}: ${r.outcome.detail}`; })}>Run crossing</button>
        </div>
      </section>
      <section className="sgroup">
        <h3>Common ledger</h3>
        {rows.length === 0 ? <p className="lead faint">No crossings for {pair} yet.</p> : <ul className="rails">{rows.slice(-8).reverse().map((r) => <li key={r.crossingId}><span>{ledgerRowSentence(r)}</span><small>{r.disagrees ? "disagrees" : r.seenBy}</small></li>)}</ul>}
      </section>
      <section className="sgroup">
        <h3>Regulated bench</h3>
        <div className="acts">
          <select className="input" aria-label="Regulated domain" value={regDomain} onChange={(e) => setRegDomain(e.target.value)}>{REGULATED_DOMAIN_SLUGS.map((d) => <option key={d} value={d}>{d}</option>)}</select>
          <input className="input" style={{ maxWidth: 180 }} aria-label="Enabled by" value={regBy} onChange={(e) => setRegBy(e.target.value)} />
          <button className="btn" disabled={busy || !regBy.trim()} onClick={() => void run(async () => { const r = await enableRegulatedBench({ domains: [regDomain], enabledBy: regBy.trim(), jurisdiction: "IN", context: "preparer", renewBy: Date.now() + 90 * 24 * 3600 * 1000 }); return r.ok ? "regulated bench enabled — signed" : (r.refusal ?? "activation refused"); })}>Enable</button>
        </div>
        {activation && <p className="lead" style={{ marginTop: 10 }}>Active: {activation.domains.join(", ")} · by {activation.enabledBy} · {activation.jurisdiction} · {activation.context}</p>}
      </section>
      {note && <p className="lead" style={{ color: "var(--accent)" }} role="status">{note}</p>}
    </>
  );
}

function Appearance() {
  const { theme, setTheme, ownerHandle } = useVh();
  const [h, setH] = useState(ownerHandle);

  return (
    <section className="sgroup">
      <h3>Appearance</h3>

      <div className="themes">
        {THEMES.map(({ id, name }) => (
          <button key={id} aria-pressed={theme === id} onClick={() => setTheme(id)}>
            <span className="sw" data-theme={id} aria-hidden /><b>{name}</b>
          </button>
        ))}
      </div>

      <h3 style={{ marginTop: 28 }}>Identity</h3>
      <div className="acts"><input className="input" style={{ maxWidth: 260 }} aria-label="Your handle" value={h} onChange={(e) => setH(e.target.value)} /><button className="btn" disabled={!h.trim() || h === ownerHandle} onClick={() => { const r = setOwnerDisplay(h); if (r.ok) { useVh.setState({ ownerHandle: h.trim() }); toast(`Handle saved`, "ok"); } }}>Save</button></div>
    </section>
  );
}

/* Identity, data class, and the crash ledger — the three things an operator or
 * an auditor needs to be able to SEE. The identity posture is stated in the
 * provider's own words: a build that authenticates nobody must not render a
 * reassuring tick. */
function Identity() {
  const id = identityProvider().current();
  const [cls, setCls] = useState<DataClass>(dataClass());
  const [verdict, setVerdict] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const crashes = readCrashes();
  const last = lastCrash();

  return (
    <>
      <section className="sgroup">
        <h3>Identity</h3>
        <p className="lead">{identityProvider().describe()}</p>
        <div className="klist about">
          <div><span>Subject</span><span>{id?.subject ?? "none established"}</span></div>
          <div><span>Role</span><span>{id?.role ?? "—"}</span></div>
          <div><span>Capabilities</span><span>{id?.capabilities.length ?? 0} granted</span></div>
          <div><span>Established by</span><span>{id?.method ?? "—"}</span></div>
        </div>
      </section>
      <section className="sgroup">
        <h3>Data class</h3>
        <div className="acts">
          {(["general", "financial", "pii", "phi"] as DataClass[]).map((c) => (
            <button key={c} className={`btn${cls === c ? " on" : ""}`} aria-pressed={cls === c}
              onClick={() => { const r = setDataClass(c); if (r.ok) { setCls(c); toast(r.note, "ok"); } else toast(r.note, "err"); }}>
              {c === "phi" ? "PHI (health)" : c === "pii" ? "PII" : c === "financial" ? "Financial" : "General"}
            </button>
          ))}
        </div>
      </section>
      <section className="sgroup">
        <h3>Crash record</h3>
        <div className="klist about">
          <div><span>Entries</span><span>{crashes.length}</span></div>
          <div><span>Most recent</span><span>{last ? `${last.kind} · ${last.where} · ${last.name}` : "none"}</span></div>
          <div><span>Window</span><span>{chainAssurance(crashes)}</span></div>
        </div>
        <div className="acts" style={{ marginTop: 10 }}>
          <button className="btn" disabled={busy} onClick={async () => {
            setBusy(true);
            try {
              const r = await verifyCrashChain();
              setVerdict(r.assurance);
              toast(r.ok ? "Crash record verifies." : "The crash record does NOT verify — see the detail below.", r.ok ? "ok" : "err");
            } finally { setBusy(false); }
          }}>Verify the chain</button>
          <button className="btn" onClick={async () => {
            const rep = await exportCrashReport();
            const blob = new Blob([JSON.stringify(rep, null, 2)], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url; a.download = `selfimpulse-crash-${new Date().toISOString().slice(0, 10)}.json`; a.click();
            URL.revokeObjectURL(url);
            toast("Exported. The file contains no message text, keys or user paths.", "ok");
          }}>Export</button>
          <button className="btn" disabled={crashes.length === 0} onClick={() => {
            const r = clearCrashes();
            toast(`Erased ${r.cleared} crash ${r.cleared === 1 ? "entry" : "entries"}.`, "ok");
            setVerdict("");
          }}>Erase</button>
        </div>
        {verdict && <p className="lead" style={{ marginTop: 8 }}>{verdict}</p>}
      </section>
    </>
  );
}

function About() {
  /* Which host the UI resolved decides whether every native affordance exists, so
     it is shown here rather than left to be guessed at. */
  const host = detectHost();
  return (
    <section className="sgroup">
      <h3>About</h3>
      <div className="klist about">
        <div><span>Product</span><span>{PRODUCT_NAME}</span></div>
        <div><span>Engine</span><span>{ENGINE_CREDIT}</span></div>
        <div><span>Runtime</span><span>{host === "tauri" ? "Desktop shell" : "Browser preview"}</span></div>
        <div><span>Where it runs</span><span>On this device · no telemetry</span></div>
        <div><span>Honesty contract</span><span>Executes only with a provider · pauses at the gate · refuses in words · receipts everything</span></div>
        <div><span>Egress</span><span>Nothing leaves without a signed authority (requestEgress) and a receipt</span></div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Connect — the declared intake points.                               */
/*                                                                     */
/* setConnectorConnected persists ONE BOOLEAN. There is no OAuth, no    */
/* handshake and no credential entered on this surface, so the control  */
/* is labelled for what it does: enable / disable.                     */
function Connectors() {
  const [, setTick] = useState(0);
  const refresh = () => setTick((n) => n + 1);
  const list = APP_CONNECTORS.map((c) => ({ c, st: connectorState(c.id) }));
  const live = list.filter(({ st }) => st.connected).length;
  return (
    <section className="sgroup">
      <h3>Connect</h3>
      <div className="row"><span className="faint">Enabled</span><b>{live} of {list.length}</b></div>
      <div className="acts" style={{ flexDirection: "column", alignItems: "stretch", gap: 10 }}>
        {list.map(({ c, st }) => (
          <div key={c.id} className="card" style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "12px 14px" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
                <b>{c.name}</b>
                <span className="faint sm">{c.vendor}</span>
                {st.connected && <span className="lbl">enabled</span>}
              </div>
              <div className="sm muted" style={{ marginTop: 2 }}>{c.purpose}</div>
              <div className="sm faint" style={{ marginTop: 4 }}>{c.scopes.join(" · ")}</div>
            </div>
            <button
              className="btn"
              onClick={() => { setConnectorConnected(c.id, !st.connected); refresh(); toast(st.connected ? `${c.name} disabled` : `${c.name} enabled`, st.connected ? "info" : "ok"); }}
            >
              {st.connected ? "Disable" : "Enable"}
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Channels — the declared communication planes.                       */
/*                                                                     */
/* Enabling one now changes what the heartbeat does: the tick asks the */
/* engine which channel is due and routes the impulse through send(),  */
/* so it is bound by the identity check, the busy guard and the human  */
/* gate like any typed message. The card reports what the engine       */
/* actually believes — fires spent against the daily cap, and whether  */
/* the cadence is due — not just the last toggle pressed.              */
function Channels() {
  const [, setTick] = useState(0);
  const refresh = () => setTick((n) => n + 1);
  return (
    <section className="sgroup">
      <h3>Channels</h3>
      <div className="acts" style={{ flexDirection: "column", alignItems: "stretch", gap: 10 }}>
        {CHANNELS.map((c) => {
          const st = channelState(c.id);
          const at = Date.now();
          const fires = firesInLastDay(c.id, at);
          const due = st.enabled && c.kind === "impulse" && isDue(c.id, at);
          return (
            <div key={c.id} className="card" style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "12px 14px" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
                  <b>{c.name}</b>
                  <span className="faint sm">{c.kind}</span>
                  {st.enabled && <span className="lbl">enabled</span>}
                </div>
                <div className="sm muted" style={{ marginTop: 2 }}>{c.purpose}</div>
                <div className="sm faint" style={{ marginTop: 4 }}>
                  {fires}/{c.caps.maxPerDay} fires in the last 24 h
                  {c.everyMs ? ` · cadence ${Math.round(c.everyMs / 60000)} min` : ""}
                  {c.bind ? ` · binds ${c.bind}` : ""}
                  {st.enabled ? (due ? " · due on the next beat" : " · armed") : " · silent"}
                </div>
              </div>
              <button
                className="btn"
                onClick={() => { setChannelEnabled(c.id, !st.enabled); refresh(); toast(st.enabled ? `${c.name} disabled` : `${c.name} enabled`, st.enabled ? "info" : "ok"); }}
              >
                {st.enabled ? "Disable" : "Enable"}
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/* ── Ledgers — the books a fleet is asked to open ─────────────────────────
 * Agent FinOps (spend, dollar-honest), the fleet roster (owned, not
 * assigned, revocable), and the assurance score those books can honestly
 * support. Exports carry identity and money data only — never keys. */
function downloadText(text: string, name: string, mime: string): void {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}

function Ledgers(): React.ReactElement {
  const sum = summary();
  const s = scoreFromLedger();
  const fleet = roster();
  return (
    <div>
      <h3>Ledgers</h3>
      <div className="kv">
        <div><span>Seat runs settled</span><span>{sum.runs}</span></div>
        <div><span>Spend (measured)</span><span>${sum.usdKnown.toFixed(2)}</span></div>
        <div><span>Spend unmeasured</span><span>{sum.usdUnknownRuns === 0 ? "none" : `${sum.usdUnknownRuns} run(s) reported tokens only`}</span></div>
        <div><span>Verified share</span><span>{sum.verifiedShare === null ? "not measurable yet" : `${Math.round(sum.verifiedShare * 100)}%`}</span></div>
      </div>
      <div className="acts" style={{ marginTop: 10 }}>
        <button className="btn" onClick={() => {
          downloadText(chargebackCsv(), "selfimpulse-chargeback.csv", "text/csv");
          toast("Chargeback exported. Measured and unmeasured spend stay in their own columns.", "ok");
        }}>Export chargeback (CSV)</button>
      </div>
      <h3 style={{ marginTop: 18 }}>Fleet</h3>
      <div className="kv">
        <div><span>Seats on roster</span><span>{fleet.length}</span></div>
        <div><span>Authority root</span><span>{fleet[0]?.issuerRoot ?? "bootstrap"}</span></div>
        <div><span>Revoked</span><span>{fleet.filter((f) => f.revoked).length}</span></div>
      </div>
      <div className="acts" style={{ marginTop: 10 }}>
        <button className="btn" onClick={() => {
          downloadText(JSON.stringify(exportRoster(), null, 2), "selfimpulse-fleet-roster.json", "application/json");
          toast("Roster exported. Identity data only — no signatures, no keys.", "ok");
        }}>Export roster (JSON)</button>
      </div>
      <h3 style={{ marginTop: 18 }}>Assurance</h3>
      {s.status === "evaluated" ? (
        <div className="kv">
          <div><span>Score</span><span>{s.score} · band {s.band}</span></div>
          <div><span>Evidence coverage</span><span>{Math.round((s.evidenceCoverage ?? 0) * 100)}% measured</span></div>
          <div><span>Ledger digest</span><span>{ledgerDigest()}</span></div>
        </div>
      ) : (
        <p>{s.unevaluatedReason}</p>
      )}
    </div>
  );
}

/* ── Triggers — when the crew starts work ───────────────────────────────── */
function TriggersPane(): React.ReactElement {
  const [rows, setRows] = useState<Trigger[]>(() => listTriggers());
  const [name, setName] = useState("");
  const [tool, setTool] = useState("calculator");
  const [arg, setArg] = useState("");
  const [minutes, setMinutes] = useState("30");
  const [note, setNote] = useState<string | null>(null);
  /* Which field the current note belongs to: an engine exception is not
     attributable to either, so `bad` stays null in that case. */
  const [bad, setBad] = useState<"name" | "arg" | null>(null);

  const refresh = () => setRows(listTriggers());
  const create = () => {
    try {
      if (name.trim().length < 2) { setBad("name"); setNote("Name required."); return; }
      if (arg.trim().length === 0) { setBad("arg"); setNote(tool === "dispatch_mission" ? "Objective required." : "Input required."); return; }
      const mins = Math.max(1, Number.parseInt(minutes, 10) || 30);
      addTrigger({
        name: name.trim(),
        kind: "schedule",
        intervalMs: mins * 60_000,
        target: tool === "dispatch_mission"
          ? { tool: "dispatch_mission", args: { objective: arg.trim() } }
          : { tool, args: tool === "calculator" ? { expression: arg.trim() } : {} },
        maxPerHour: Math.max(1, Math.floor(60 / mins)),
      });
      setName(""); setArg(""); setNote(null); setBad(null);
      refresh();
      toast("Trigger armed. It fires through the governed pipeline — risky work still waits for you.", "ok");
    } catch (e) {
      setBad(null);
      setNote(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div>
      <h3>Triggers</h3>
      {rows.length > 0 && (
        <div className="kv">
          {rows.map((t) => (
            <div key={t.id}>
              <span>{t.name}{t.enabled ? "" : " (paused)"}</span>
              <span>{t.kind === "schedule" ? `every ${Math.max(1, Math.round((t.intervalMs ?? 60_000) / 60_000))} min` : t.kind} · {t.fires} fired · {t.lastVerdict ?? "not yet"}</span>
            </div>
          ))}
        </div>
      )}
      <div className="acts" style={{ marginTop: 10 }}>
        {rows.map((t) => (
          <button key={t.id} className="btn" onClick={() => { setTriggerEnabled(t.id, !t.enabled); refresh(); }}>
            {t.enabled ? "Pause" : "Resume"} “{t.name}”
          </button>
        ))}
        {rows.length > 0 && <button className="btn" onClick={() => { for (const t of rows) removeTrigger(t.id); refresh(); toast("Triggers removed.", "ok"); }}>Remove all</button>}
      </div>
      <h3 style={{ marginTop: 18 }}>Arm a schedule</h3>
      <div className="kv">
        {/* Each row is a real <label htmlFor>, so the visible name and the
            accessible name are the same word. */}
        <div><label htmlFor="trig-name">Name</label><span><input id="trig-name" aria-invalid={bad === "name" || undefined} aria-describedby="trig-note" value={name} onChange={(e) => setName(e.target.value)} style={{ maxWidth: 200 }} /></span></div>
        <div><label htmlFor="trig-work">Work</label><span>
          <select id="trig-work" value={tool} onChange={(e) => setTool(e.target.value)}>
            <option value="calculator">Calculator</option>
            <option value="clock">Clock check</option>
            <option value="dispatch_mission">Dispatch a mission</option>
          </select>
        </span></div>
        <div><label htmlFor="trig-arg">Input / objective</label><span><input id="trig-arg" aria-invalid={bad === "arg" || undefined} aria-describedby="trig-note" value={arg} onChange={(e) => setArg(e.target.value)} style={{ maxWidth: 200 }} /></span></div>
        <div><label htmlFor="trig-mins">Every (minutes)</label><span><input id="trig-mins" value={minutes} onChange={(e) => setMinutes(e.target.value)} style={{ maxWidth: 70 }} /></span></div>
      </div>
      {note && <p id="trig-note">{note}</p>}
      <div className="acts" style={{ marginTop: 10 }}>
        <button className="btn" onClick={create}>Arm it</button>
      </div>
    </div>
  );
}
