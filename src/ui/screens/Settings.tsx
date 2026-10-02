import React, { useEffect, useState } from "react";
import { useVh } from "../store";
import { ipc, useTauri } from "../../ipc/client";
import { saveNativeProvider } from "../../engine/nativeProvider";
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

type Sect = "provider" | "vault" | "autonomy" | "mcp" | "permissions" | "federation" | "appearance" | "identity" | "about" | "crew";
/* Each sub-page carries a one-line PLAIN description under its label — the
 * whole point of the sub-page nav is that a first-time reader can see where
 * they are going before they click. Labels are the product's own words; the
 * hint line is a promise about what's inside, never a feature boast. */
const SECTS: Array<[Sect, string, string]> = [
  ["provider", "AI connection", "model, endpoint & key"],
  ["vault", "Key vault", "seal keys at rest"],
  ["autonomy", "Independence", "how far the Captain may act"],
  ["mcp", "Tools (MCP)", "governed external tools"],
  ["permissions", "Permissions", "what may run & where keys go"],
  ["crew", "Crew", "which desks are on shift"],
  ["federation", "Federation", "work across owners"],
  ["appearance", "Appearance", "finish & handle"],
  ["identity", "Identity", "subject, data class, crashes"],
  ["about", "About", "limits, receipts & runtime"],
];
const KINDS: Array<[ProviderKind, string]> = [["openai-compatible", "OpenAI-compatible"], ["anthropic", "Anthropic"], ["gemini", "Gemini"]];
const MODEL_HINT: Record<ProviderKind, string> = { "openai-compatible": "gpt-4o-mini", anthropic: "claude-3-5-haiku-latest", gemini: "gemini-2.0-flash" };
/** Plain-language help per provider: what the key looks like, where to get it. */
const KEY_HINT: Record<ProviderKind, string> = {
  "openai-compatible": "Starts with “sk-”. Any OpenAI-compatible endpoint works — including a local server.",
  anthropic: "Starts with “sk-ant-”. Get one at console.anthropic.com.",
  gemini: "Starts with “AIza”. Get one at aistudio.google.com.",
};

export function Settings(): React.ReactElement {
  const [sect, setSect] = useState<Sect>("provider");
  return (
    <>
      <header className="top"><h2>Settings</h2></header>
      <div className="scroll"><div className="settings">
        <nav className="snav" aria-label="Settings sections">
          <small className="snav-group">Everyday</small>
          {SECTS.filter(([k]) => ["provider", "appearance", "autonomy", "crew"].includes(k)).map(([k, l, d]) => (
            <button key={k} aria-current={sect === k ? "page" : undefined} onClick={() => setSect(k)}>
              <span>{l}</span><small>{d}</small>
            </button>
          ))}
          <small className="snav-group">Security</small>
          {SECTS.filter(([k]) => ["vault", "permissions", "identity"].includes(k)).map(([k, l, d]) => (
            <button key={k} aria-current={sect === k ? "page" : undefined} onClick={() => setSect(k)}>
              <span>{l}</span><small>{d}</small>
            </button>
          ))}
          <small className="snav-group">Advanced</small>
          {SECTS.filter(([k]) => ["mcp", "federation", "about"].includes(k)).map(([k, l, d]) => (
            <button key={k} aria-current={sect === k ? "page" : undefined} onClick={() => setSect(k)}>
              <span>{l}</span><small>{d}</small>
            </button>
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
          {sect === "identity" && <Identity />}
          {sect === "about" && <About />}
        </div>
      </div></div>
    </>
  );
}

function Provider() {
  const { provider, setProvider, forgetProvider, securityNote, vault } = useVh();
  const [showKey, setShowKey] = useState(false);
  const [kind, setKind] = useState<ProviderKind>(provider?.kind ?? "openai-compatible");
  const [baseUrl, setBase] = useState(provider?.baseUrl ?? PROVIDER_DEFAULTS["openai-compatible"]);
  const [model, setModel] = useState(provider?.model ?? "");
  const [key, setKey] = useState("");
  const [persist, setPersist] = useState(vault.status === "unlocked");
  const [note, setNote] = useState<string | null>(securityNote);
  const pick = (k: ProviderKind) => { setKind(k); setBase(PROVIDER_DEFAULTS[k]); };
  /* Desktop: the key is handed to the OS keychain ONCE and this window forgets it — it keeps a reference.
     The page can use the provider through the app but can never read the key back (see nativeProvider.ts). */
  const native = useTauri();
  const [hint, setHint] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    if (native && provider?.secretRef) void ipc.secretGet(provider.secretRef).then((r) => { if (live) setHint(r.present ? (r.hint ?? "") : null); }).catch(() => undefined);
    else setHint(null);
    return () => { live = false; };
  }, [native, provider?.secretRef]);
  const save = async () => {
    const cfg = { kind, baseUrl: baseUrl.trim(), model: model.trim() || MODEL_HINT[kind] };
    if (native) {
      const r = await saveNativeProvider(cfg, key.trim());
      if (!r.ok) { setNote(r.note); return; }
      const done = await setProvider({ ...cfg, apiKey: "", secretRef: r.secretRef }, true);
      setNote(`${r.note} ${done.note}`);
      setKey("");
      void ipc.secretGet(r.secretRef).then((g) => setHint(g.present ? (g.hint ?? "") : null)).catch(() => undefined);
      return;
    }
    // A blank key field means "keep the saved key" (that is what the placeholder promises) — it used to
    // REPLACE the saved key with an empty one.
    const r = await setProvider({ kind, baseUrl: cfg.baseUrl, apiKey: key.trim() || provider?.apiKey || "", model: cfg.model }, persist);
    setNote(r.note);
    setKey("");
  };
  return (
    <section className="sgroup">
      <h3>AI connection</h3><p className="lead">This is the brain your crew thinks with. Without it the Captain can only plan; with it, every step is gated and receipted. Your key never leaves this device.{native && " On the desktop it lives in your OS keychain: this window can use it, but can never read it back."}</p>
      {provider && <div className="row"><span className="led ok" /><b>{KINDS.find((k) => k[0] === provider.kind)?.[1]}</b><span className="faint mono">{provider.model}</span>{native && provider.secretRef && <span className="hint" title="held by the OS keychain">· key {hint ? hint : "held by the OS keychain"}</span>}<button className="btn sm ghost danger" style={{ marginLeft: "auto" }} onClick={forgetProvider}>Remove key</button></div>}
      {/* ── THE KEY HOLDER ────────────────────────────────────────────────────
          Three fields, in the order people actually fill them in: the key, the
          model, the URL. The provider still exists underneath — it decides
          defaults and it is what the store is keyed on — but it is chosen by the
          segment BELOW the three fields, because "which vendor is this" is a
          question the URL usually answers and never the first thing someone
          holding a key wants to be asked.

          Nothing about where the key goes changed. It is still handed to the OS
          keychain once (desktop) or sealed in the vault, still never readable
          back by this window, still only ever sent to its own vendor's address.
          This is a holder, not a new key path. */}
      <div className="keyholder">
        <label className="field"><span>API key</span>
          <div className="keyrow">
            <input className="input keyinput" type={showKey ? "text" : "password"} autoComplete="off" spellCheck={false} placeholder={provider ? (native && provider.secretRef ? "••••••••••••  (stored in your OS keychain — leave blank to keep it)" : "••••••••••••  (leave blank to keep the saved key)") : "paste your key here"} value={key} onChange={(e) => setKey(e.target.value)} />
            <button type="button" className="btn sm ghost" onClick={() => setShowKey(!showKey)}>{showKey ? "Hide" : "Show"}</button>
          </div>
          <small className="hint">{KEY_HINT[kind]}</small>
        </label>
        <label className="field"><span>Model</span><input className="input" placeholder={MODEL_HINT[kind]} value={model} onChange={(e) => setModel(e.target.value)} /></label>
        <label className="field"><span>URL</span><input className="input" value={baseUrl} onChange={(e) => setBase(e.target.value)} /></label>
      </div>
      <div className="field"><span className="flabel">Provider</span>
        <div className="seg">{KINDS.map(([k, l]) => <button key={k} aria-pressed={kind === k} onClick={() => pick(k)}>{l}</button>)}</div>
      </div>
      {native ? <p className="hint">The key is held by your OS keychain, so it survives restarts. A custom endpoint is approved at a native dialog before the key can be sent there.</p> : <label className="check"><input type="checkbox" checked={persist} onChange={(e) => setPersist(e.target.checked)} /><span>Remember on this device <small>{vault.status === "unlocked" ? "Encrypted in your vault (AES-256-GCM). Nothing is ever uploaded." : "Needs an unlocked Key vault — otherwise the key stays in memory for this session only and is forgotten when you close the app."}</small></span></label>}
      <p className="hint">Prefer the terminal? Set <code>HANDLE_OPENAI_API_KEY</code>, <code>HANDLE_ANTHROPIC_API_KEY</code> or <code>HANDLE_GEMINI_API_KEY</code> in your environment and the app picks it up — no paste needed.</p>
      <div className="acts"><button className="btn primary" disabled={!key.trim() && !provider} onClick={() => void save()}>{provider ? "Update" : "Connect"}</button>{note && <span className="hint">{note}</span>}</div>
    </section>
  );
}

/**
 * CREW — the desks.
 *
 * This door exists because the product ships ~1500 routable specialists across
 * fifteen categories, and until now there was no surface anywhere that said so.
 * A user watching a plan arrive had no way to answer "who is even eligible to
 * be picked" or "why did nothing from the security desk show up".
 *
 * The matrix behind the button is the answer to both: every desk the router can
 * reach, on the floor or off it, at the depth it has been granted, with the
 * budget it is allowed to spend. It is one button rather than an inline table
 * because the table is a decision surface — you open it to change something, not
 * to glance at it — and a settings page that is mostly a spreadsheet is a page
 * nobody reads.
 */
function Crew(): React.ReactElement {
  const cats = knownCategories();
  const sizes = categorySizes();
  const total = cats.reduce((n, c) => n + (sizes[c] ?? 0), 0);
  const summary = policySummary();
  return (
    <section className="sgroup">
      <h3>Crew</h3>
      <p className="lead">
        {total.toLocaleString()} specialists stand behind {cats.length} desks. Every route is drawn from them,
        and everything they do is receipted. Nothing on this page changes what a specialist can do — it changes
        which desks are asked.
      </p>
      <div className="row">
        <span className={summary.off === 0 ? "led ok" : "led warn"} />
        <b>{summary.source === "default" ? "Shipped policy" : "Your policy"}</b>
        <span className="faint">
          {summary.on} of {cats.length} desks on shift
          {summary.off > 0 ? ` · ${summary.off} off` : ""}
          {summary.narrowest ? ` · ${summary.narrowest} narrowed` : ""}
        </span>
        <span className="cm-actions"><CrewMatrixButton /></span>
      </div>
      <p className="hint">
        A desk that is off shift is not deleted and its work is not lost — the router simply stops asking it,
        and any route that would have used it says so rather than silently returning less.
      </p>
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
        <p className="lead">Nothing the crew runs starts without your say-so. The first time a mission needs a tool, a native dialog names the programs, the folder and whether the network is reachable — a dialog this window cannot click for you. The default is no network.</p>
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
        <p className="lead">A key is only ever sent to its own vendor's address. A gateway or self-hosted endpoint is added only after you approve it in a native dialog; remove it here at any time.</p>
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
  const [pass, setPass] = useState(""); const [note, setNote] = useState<string | null>(null);
  const act = async () => { const r = vault.status === "no-passphrase" ? await createVault(pass) : await unlockVault(pass); setNote(r.note); if (r.ok) setPass(""); };
  return (
    <section className="sgroup">
      <h3>Vault</h3><p className="lead">One passphrase seals your provider key and memory at rest. There is no recovery — length is the only strength no one can take from you.</p>
      <div className="row"><span className={`led ${vault.status === "unlocked" ? "ok" : vault.status === "sealed-locked" ? "warn" : ""}`} /><b>{vault.status === "unlocked" ? "Unlocked" : vault.status === "sealed-locked" ? "Locked" : "Not created"}</b>{vault.kdf && <span className="faint mono">{vault.kdf} · {vault.iterations?.toLocaleString()} rounds</span>}{vault.status === "unlocked" && <button className="btn sm ghost" style={{ marginLeft: "auto" }} onClick={lock}>Lock now</button>}</div>
      {vault.status !== "unlocked" && <>
        <label className="field"><span>Passphrase</span><input className="input" type="password" autoComplete="off" value={pass} onChange={(e) => setPass(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void act(); }} /></label>
        <div className="acts"><button className="btn primary" disabled={pass.length < 8} onClick={() => void act()}>{vault.status === "no-passphrase" ? "Create vault" : "Unlock"}</button><span className="hint">{note ?? "at least 8 characters"}</span></div>
      </>}
      {vault.status === "unlocked" && note && <span className="hint">{note}</span>}
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
        <h3>Autonomy</h3><p className="lead">How much your Captain may do without being asked. Above Off, a heartbeat every {Math.round(HEARTBEAT_DEFAULT_MS / 60000)} minutes decides, then executes safe acts through the real engine — every act receipted, every risky one stopped at the gate.</p>
        <div className="radios">{([0, 1, 2, 3] as AutonomyLevel[]).map((l) => <label key={l} className="check"><input type="radio" name="auto" checked={initiative.level === l} onChange={() => setAutonomy(l)} /><span>{AUTONOMY_LEVEL_NAMES[l].split(" — ")[0]}<small>{AUTONOMY_LEVEL_NAMES[l].split(" — ")[1]}</small></span></label>)}</div>
        <div className="row"><span className="faint">Scheduled follow-ups</span><b>{initiative.followUps.length}</b><span className="faint" style={{ marginLeft: 16 }}>Breaker</span><b>{initiative.breakerUntil && initiative.breakerUntil > Date.now() ? "tripped" : "closed"}</b>{initiative.level > 0 && <button className="btn ghost" style={{ marginLeft: "auto" }} onClick={() => void wakeNow()}>Run a heartbeat now</button>}</div>
      </section>
      <section className="sgroup">
        <h3>Captain</h3><p className="lead">The name your Captain answers to.</p>
        <div className="acts"><input className="input" style={{ maxWidth: 260 }} value={name} onChange={(e) => setName(e.target.value)} /><button className="btn" disabled={!name.trim() || name === stewardName} onClick={() => renameSteward(name.trim())}>Rename</button></div>
      </section>
      <section className="sgroup">
        <h3>Tools</h3><p className="lead">{mcp.length ? `${mcp.length} governed MCP tool${mcp.length === 1 ? "" : "s"} available to the crew.` : "No external MCP tools enabled — the crew uses its built-in, receipted tools."}</p>
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
        <p className="lead">Two named humans, an enumerated capability list, a crossing budget and an expiry. Nothing crosses without one.</p>
        <div className="acts">
          <input className="input" style={{ maxWidth: 140 }} value={ownerA} onChange={(e) => setOwnerA(e.target.value)} placeholder="you" />
          <input className="input" style={{ maxWidth: 140 }} value={ownerB} onChange={(e) => setOwnerB(e.target.value)} placeholder="peer" />
          <input className="input" style={{ maxWidth: 90 }} type="number" min={1} value={days} onChange={(e) => setDays(Number(e.target.value) || 1)} title="days" />
          {!grant
            ? <button className="btn" disabled={busy || !ownerA.trim() || !ownerB.trim()} onClick={() => void run(async () => { const r = await issueLiveGrant({ capabilities: [cap], maxCrossings: 5, windowMs: 24 * 3600 * 1000, windowMax: 2, expiresInMs: days * 24 * 3600 * 1000, initiatorHuman: ownerA.trim(), responderHuman: ownerB.trim() }); return r.ok ? "grant issued — both sides signed" : (r.refusal ?? "grant refused"); })}>Issue grant</button>
            : <button className="btn ghost" disabled={busy} onClick={() => void run(async () => { revokeLiveGrant("initiator", ownerA.trim(), "owner revoked in Settings"); return "grant revoked"; })}>Revoke</button>}
        </div>
        {grant && usage && <p className="lead" style={{ marginTop: 10 }}>{standingNotice(grant, usage.initiator)}</p>}
      </section>
      <section className="sgroup">
        <h3>Crossing</h3>
        <p className="lead">One task rides one capability across the pair. Refusals are written in words and receipted like successes.</p>
        <div className="acts">
          <select className="input" value={cap} onChange={(e) => setCap(e.target.value as DelegationCapability)}>{DELEGATION_CAPABILITIES.map((c) => <option key={c} value={c}>{c}</option>)}</select>
          <input className="input" style={{ flex: 1, minWidth: 200 }} value={task} onChange={(e) => setTask(e.target.value)} />
          <button className="btn" disabled={busy || !task.trim()} onClick={() => void run(async () => { const r = await runLiveCrossing({ capability: cap, task: task.trim(), ownerA: ownerA.trim(), ownerB: ownerB.trim() }); return `${r.outcome.status}: ${r.outcome.detail}`; })}>Run crossing</button>
        </div>
      </section>
      <section className="sgroup">
        <h3>Common ledger</h3>
        <p className="lead">Both stores, compared — derived from the two sets, never stored, so it is byte-identical on either side.</p>
        {rows.length === 0 ? <p className="lead faint">No crossings for {pair} yet.</p> : <ul className="rails">{rows.slice(-8).reverse().map((r) => <li key={r.crossingId}><span>{ledgerRowSentence(r)}</span><small>{r.disagrees ? "disagrees" : r.seenBy}</small></li>)}</ul>}
      </section>
      <section className="sgroup">
        <h3>Regulated bench</h3>
        <p className="lead">Regulated specialists route only under a signed activation — a named person, a jurisdiction, a context, a renew-by date.</p>
        <div className="acts">
          <select className="input" value={regDomain} onChange={(e) => setRegDomain(e.target.value)}>{REGULATED_DOMAIN_SLUGS.map((d) => <option key={d} value={d}>{d}</option>)}</select>
          <input className="input" style={{ maxWidth: 180 }} value={regBy} onChange={(e) => setRegBy(e.target.value)} placeholder="enabled by (your name)" />
          <button className="btn" disabled={busy || !regBy.trim()} onClick={() => void run(async () => { const r = await enableRegulatedBench({ domains: [regDomain], enabledBy: regBy.trim(), jurisdiction: "IN", context: "preparer", renewBy: Date.now() + 90 * 24 * 3600 * 1000 }); return r.ok ? "regulated bench enabled — signed" : (r.refusal ?? "activation refused"); })}>Enable</button>
        </div>
        {activation && <p className="lead" style={{ marginTop: 10 }}>Active: {activation.domains.join(", ")} · by {activation.enabledBy} · {activation.jurisdiction} · {activation.context}</p>}
      </section>
      {note && <p className="lead" style={{ color: "var(--accent)" }}>{note}</p>}
    </>
  );
}

function Appearance() {
  const { theme, setTheme, ownerHandle } = useVh();
  const [h, setH] = useState(ownerHandle);
  return (
    <section className="sgroup">
      <h3>Appearance</h3><p className="lead">Two finishes. Both keep the same contrast and the same accent.</p>
      <div className="themes">
        <button aria-pressed={theme === "dark"} onClick={() => setTheme("dark")}><span className="sw dark" /><b>Charcoal</b><small>dark</small></button>
        <button aria-pressed={theme === "light"} onClick={() => setTheme("light")}><span className="sw light" /><b>Bone</b><small>light</small></button>
      </div>
      <h3 style={{ marginTop: 28 }}>You</h3>
      <div className="acts"><input className="input" style={{ maxWidth: 260 }} value={h} onChange={(e) => setH(e.target.value)} placeholder="your handle" /><button className="btn" disabled={!h.trim() || h === ownerHandle} onClick={() => { const r = setOwnerDisplay(h); if (r.ok) { useVh.setState({ ownerHandle: h.trim() }); toast(`Handle saved — receipts are attributed to subject ${r.subject.slice(0, 20)}…`, "ok"); } }}>Save</button></div>
      <p className="lead" style={{ marginTop: 8 }}>
        Your handle is the name on receipts and audit rows. The subject id behind it is stable and is what the audit log attributes actions to.
      </p>
    </section>
  );
}

/* The guardrail manifest — what the product physically cannot do. Each line is a
 * check enforced in CODE and pinned by a probe suite (see probe/guardrailAlign);
 * it is the one place the product states its own limits to the owner. */
const GUARDRAILS: Array<[string, string]> = [
  ["No root authority without a HUMAN principal", "custody"],
  ["No delegation that grows scope or outlives its parent", "custody"],
  ["No spend beyond the signed cap — seats reserve before dispatch", "budget gate"],
  ["No house rules written by an agent — propose only", "ledger"],
  ["No skill or strategy installed without measured adoption or human approval", "ledger"],
  ["No merge when the verifier gate fails — the checker is never the author", "merge gate"],
  ["No learning persisted from simulated runs — measured facts only", "reflection"],
  ["No invented prices — token-only harnesses stay dollar-UNKNOWN", "cost honesty"],
  ["No artifact leaves this machine without a signed egress authority + receipt", "egress gate"],
  ["Capability requests return answers only — raw rows never leave this machine", "capability gate"],
  ["Aggregates pass the Privacy Guard — minimum cohort, hard query budget, bounded precision", "privacy guard"],
  ["The privacy budget is durable and per-requester — a restart resets nothing", "durable budget"],
  ["The two-machine proof: the coordinator sees identity, request, authorization and receipt — never rows", "two-node proof"],
];

/**
 * Identity, data class, and the crash ledger.
 *
 * 19.8. Three things an operator or an auditor needs to be able to SEE, all of
 * which existed in the product but were unreachable:
 *
 *   - WHO actions are attributed to. The subject id is the attribution key on
 *     every receipt and audit row, and until now it was a hardcoded constant
 *     that nobody could inspect.
 *   - WHAT CLASS of data this operator handles. HIPAA and GDPR both turn on it,
 *     and a rule cannot be applied to a class the product never records.
 *   - WHETHER THE CRASH RECORD is intact. The chain can be verified from the UI,
 *     which is the difference between "we keep an audit log" and "here is the
 *     proof that nobody edited it".
 *
 * The identity posture is stated in the provider's own words. A build that
 * authenticates nobody must not render a reassuring tick, so the sentence says
 * what is and is not established.
 */
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
        <p className="lead">
          What kind of data this operator handles. Encryption-at-rest and retention rules read
          this, so it is recorded rather than assumed.
        </p>
        <div className="acts">
          {(["general", "financial", "pii", "phi"] as DataClass[]).map((c) => (
            <button key={c} className={`btn${cls === c ? " on" : ""}`} aria-pressed={cls === c}
              onClick={() => { const r = setDataClass(c); if (r.ok) { setCls(c); toast(r.note, "ok"); } else toast(r.note, "err"); }}>
              {c === "phi" ? "PHI (health)" : c === "pii" ? "PII" : c === "financial" ? "Financial" : "General"}
            </button>
          ))}
        </div>
        {cls === "phi" && (
          <p className="lead" style={{ marginTop: 8 }}>
            Protected health information is declared. Records you keep are expected to be encrypted at rest —
            use the Vault — and the retention clock applies to them.
          </p>
        )}
      </section>
      <section className="sgroup">
        <h3>Crash record</h3>
        <p className="lead">
          Crashes are recorded on this machine and never transmitted. Each entry is SHA-256 chained onto
          the one before it, so an edited or removed record breaks every digest after it.
        </p>
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
  // Which host the UI resolved decides whether every native affordance exists:
  // the window controls, the native store, the vault and the file surfaces. A
  // silent fallback to "web" is the failure mode that makes the app look alive
  // while running on a different storage engine, so the resolved host is shown
  // here rather than left to be guessed at.
  const host = detectHost();
  return (
    <>
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
      <section className="sgroup">
        <h3>Guardrail manifest</h3>
        <p className="lead">What {PRODUCT_NAME} physically cannot do. Enforced in code, not in prompts — each line is a check that runs and is pinned by a test.</p>
        <ul className="rails">{GUARDRAILS.map(([t, tag]) => <li key={t}><span>{t}</span><small>{tag}</small></li>)}</ul>
      </section>
    </>
  );
}
