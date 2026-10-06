/**
 * SelfImpulse — the one UI store (zustand). Owns the real engine seams:
 * askSelfImpulse19 · human gate · provider (session-only or vault-sealed) · memory graph.
 * Screens read from here; nothing in the UI talks to the engine directly.
 */
import { create } from "zustand";
import { askSelfImpulse19 } from "../engine/generalist";
import type { GeneralistDeps } from "../engine/types";
import type { GeneralistResponse, GateAsk, GateDecision, ProviderConfig } from "../engine/types";
import { recordHandoff, listHandoffs, type HandoffRecord } from "../engine/handoffs";
import { vaultStatus, vaultSeal, vaultDecrypt, vaultRemove, lockVault, setVaultPassphrase, purgePlain, upgradeVaultCost, type VaultStatusInfo } from "../engine/vault";
import { bindOwnerRoot, lockOwnerRoot } from "../security/ownerRoot";
import { dueTriggers, fireTrigger } from "../engine/intakeTriggers";
import { ingestSession, listSessions, getSession, graphView, graphStats, recall, rehydrate, memoryEnabled, setMemoryEnabled, clearGraph, deleteSession, graphSecurityStatus, type MgSession, type MgMessage } from "../engine/memoryGraph";
import { wireEventSeq, optimDelta, type OptimDelta } from "../engine/tokenOptim";
import { loadInitiative, setLevel, reportFailure, scheduleFollowUp, evaluateWake, applyWake, executeWakeActs, HEARTBEAT_DEFAULT_MS, type InitiativeState, type AutonomyLevel } from "../engine/initiative";
import { generalistName, setGeneralistName } from "../engine/face";
import { engineExecutor } from "../engine/initiativeBridge";
import { dreamTick, dreamLine } from "../engine/dreamBridge";
import { loadGoals } from "../engine/goals";
import { recordRsiSignal, rsiState, revertRsiMemory } from "../engine/rsi";
import { rsiralsCanaryCheck } from "../engine/rsirals";
/* 19.8 — the execution workspace. The engine has carried a real act/observe
 * loop with gated, receipted tools since 19.4.0, and `runDeps` was the only
 * thing keeping it switched off: with no `workspaceRoot` on the dep set every
 * member fell to the single-call path, so the filesystem tools, net.fetch,
 * wiki.search, the per-tool human gate, the tool receipts and the
 * mission-authority attestation were all probe-only code. This is the seam the
 * module was written for — an in-memory workspace by default (no permission
 * prompt, real files, real receipts) and a user-picked directory when the File
 * System Access API exists. The root still confines every path; the backing is
 * an implementation detail behind one VhFs adapter. */
import { createMemoryWorkspace, openDirectoryWorkspace, fsAccessSupported, type BrowserWorkspace } from "../engine/browserWorkspace";
/* 19.7.13 — the Docs door's engine seam. Knowledge is PROPOSED by the engine and
 * DECIDED by the human (no skill installs on its own); the store holds the
 * proposal list so the door re-renders from one source of truth. */
import { loadKnowledgeProposals, proposeKnowledgeSkill, decideKnowledgeProposal, type KnowledgeProposal } from "../mission/knowledgeSkills";
/* §13 — the file door. One seam on purpose: bytes go in, structure comes out
 * (or a refusal in words does), and what comes out is handed to the SAME
 * proposeKnowledgeSkill the paste box uses. Caps and containment live in
 * `ingestFile`, which is why the door has no size limit of its own. */
import { createIngestRun, ingestFile, type IngestReceipt } from "../mission/fileIngest";
/* 19.8 — the local crash ledger. A throw on the live path is shown in the
 * transcript AND recorded, because the transcript does not survive a reload. */
import { recordCrash } from "../security/crashLedger";
import { persistNativeConfig, clearNativeConfig, loadNativeConfig } from "../engine/nativeProvider";
import { ipc } from "../ipc/client";

/* RSI evidence intake (19.4.2 discipline, now on the ONE live path): real gate
 * denials, failures and live-data misses become curriculum, and a canary that
 * attributes the failure to an applied scaffold change rolls that change back. */
function ingestRsi(kind: "gate" | "failure" | "livedata", subject: string, evidence: string[] = []): void {
  recordRsiSignal(kind, subject, evidence);
  for (const name of rsiralsCanaryCheck({ kind, subject })) {
    const d = rsiState().drafts.find((x) => x.name === name && x.state === "applied");
    if (d) revertRsiMemory(d.id);
  }
}

/* 19.8 — the identity seam. The store used to export a hardcoded
 * `USER = "si-owner"` constant and pass it as `userId` into every engine call.
 * That constant is gone: `identityProvider().subject()` is the single source, and
 * a future server provider replaces it without any call site changing. A run with
 * no established identity is REFUSED at the boundary rather than attributed to a
 * placeholder — receipts that name a subject nobody can selfimpulse for are worse than
 * no receipt. */
import { identityProvider } from "../security/identity";

/** The subject every run is attributed to, or null when there is no identity. */
export function currentSubject(): string | null {
  return identityProvider().subject();
}

const PROVIDER_STORAGE_KEY = "vh.provider.remembered.v1";
const THEME_KEY = "vh.theme.v2";

export type Screen = "steward" | "work" | "specialists" | "federation" | "receipts" | "docs" | "memory" | "settings" | "chat";
/** Eight finishes in two families: six dark, two light. The attribute name is
 *  the persisted value, and it must stay in lockstep with the `[data-theme=…]`
 *  blocks in vh.css and si.css plus THEMES below. */
export type Theme = "holst" | "obsidian" | "azure" | "platinum" | "titanium" | "akaroa" | "caesar" | "stratos";

/** The one list every surface reads. Settings renders it, the store validates
 *  against it, the boot block mirrors it, and the contrast tool walks it — so a
 *  finish can never exist in the picker but not in the stylesheet. */
export const THEMES: ReadonlyArray<{ id: Theme; name: string; kind: "dark" | "light" }> = [
  { id: "holst", name: "Holst", kind: "dark" },
  { id: "obsidian", name: "Obsidian", kind: "dark" },
  { id: "azure", name: "Azure", kind: "dark" },
  { id: "platinum", name: "Platinum", kind: "light" },
  { id: "titanium", name: "Titanium", kind: "dark" },
  { id: "akaroa", name: "Akaroa", kind: "light" },
  { id: "caesar", name: "Caesar", kind: "dark" },
  { id: "stratos", name: "Stratos", kind: "dark" },
];
export const DEFAULT_THEME: Theme = "holst";

export interface Msg { id: number; role: "user" | "vh"; text: string; at: string; resp?: GeneralistResponse; tok?: OptimDelta; rehydratedFrom?: string }
export interface PendingGate { ask: GateAsk; resolve: (d: GateDecision) => void; askedAt: string }
export type ReceiptState = "ok" | "pending" | "refused" | "error";
export interface Receipt { id: string; title: string; signer: string; digest: string; at: string; state: ReceiptState; kind: string }

export interface GateLogEntry { action: string; riskTier: string; decision: "approved" | "refused"; reason: string; at: string }

/**
 * §13 — what one drop of files produced, with every file accounted for in one
 * of three buckets. The third bucket is the one that is easy to lose: a file
 * whose bytes read fine but whose content the knowledge pipeline declined for
 * want of structure. That refusal belongs to the pipeline, not to ingestion,
 * and folding the two together would hide which gate said no.
 */
export interface IngestOutcomeSummary {
  proposed: Array<{ file: string; proposalId: string }>;
  refused: Array<{ file: string; words: string }>;
  structuralRefused: Array<{ file: string; words: string }>;
}

const INGEST_LOG_KEY = "vh.ingestLog.v1";
const INGEST_LOG_KEEP = 200;

function loadIngestLog(): IngestReceipt[] {
  try {
    const raw = globalThis.localStorage?.getItem(INGEST_LOG_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((r): r is IngestReceipt =>
      !!r && typeof (r as IngestReceipt).id === "string" && typeof (r as IngestReceipt).decision === "string") : [];
  } catch { return []; }
}

function saveIngestLog(log: IngestReceipt[]): void {
  try { globalThis.localStorage?.setItem(INGEST_LOG_KEY, JSON.stringify(log)); } catch { /* storage unavailable */ }
}

/**
 * The single classifier for every ledger row's state. Previously three sites
 * each guessed their own way: the run row compared against the literal
 * "refused", the tool row used its own alternation regex, and the handoff row
 * again used the literal. "gated-out" — a human or policy saying no — matched
 * none of them, so denials rendered as successes.
 */
export function receiptStateFor(outcome: string | undefined): ReceiptState {
  const o = (outcome ?? "").toLowerCase();
  if (o === "pending") return "pending";
  if (o === "error" || o === "failed" || o === "executed-failed") return "error";
  if (o === "refused" || o === "gated-out" || o === "blocked" || o === "denied" || o.startsWith("refus")) return "refused";
  return "ok";
}

interface UiState {
  screen: Screen; theme: Theme;
  msgs: Msg[]; busy: boolean; lastResp: GeneralistResponse | null; chatSessionId: string; sessionStart: string;
  gate: PendingGate | null;
  provider: ProviderConfig | null; vault: VaultStatusInfo; securityNote: string | null;
  memOn: boolean; sessions: MgSession[]; openSession: MgSession | null;
  /** 19.7.13 — knowledge proposals (Docs door). Approved ones become skills. */
  knowledge: KnowledgeProposal[];
  handoffs: HandoffRecord[]; initiative: InitiativeState; savedTokens: number;
  /** Every human gate decision, approved or refused. A decision that leaves no
      record cannot be audited, and GateCard promises one on both branches. */
  gateLog: GateLogEntry[];
  /** §13 — every file the door opened or refused, with the bytes it saw. A
      refusal that vanishes on reload is a toast, not a receipt. */
  ingestLog: IngestReceipt[];
  stewardName: string; ownerHandle: string;
  /** 19.8 — the mission workspace. Its presence is what turns the tool layer
      on; its `kind` is disclosed in Settings so nobody is surprised about where
      a file landed. */
  workspace: BrowserWorkspace;

  go: (s: Screen) => void;
  setTheme: (t: Theme) => void;
  send: (text: string) => Promise<void>;
  decideGate: (d: GateDecision) => void;
  setProvider: (cfg: ProviderConfig | null, persist: boolean) => Promise<{ ok: boolean; note: string }>;
  forgetProvider: () => void;
  createVault: (pass: string) => Promise<{ ok: boolean; note: string }>;
  unlockVault: (pass: string) => Promise<{ ok: boolean; note: string }>;
  lock: () => void;
  setMemory: (on: boolean) => void;
  /** Propose a document as knowledge — the engine decides whether it is structure or a blob. */
  addDocument: (content: string, sourceName: string) => Promise<{ ok: boolean; note: string }>;
  /** §13 — take dropped files: contain, parse, and propose what survives. */
  addFiles: (files: Array<{ name: string; bytes: Uint8Array }>) => Promise<IngestOutcomeSummary>;
  /** The human's one decision per proposal. Approving mirrors it into installed skills. */
  decideDocument: (id: string, approved: boolean, note: string) => { ok: boolean; note: string };
  clearMemory: () => void;
  forgetSession: (id: string) => void;
  openConversation: (id: string) => void;
  setAutonomy: (l: AutonomyLevel) => void;
  /** One initiative heartbeat: decide, then EXECUTE safe acts through the real engine. */
  wakeNow: () => Promise<void>;
  renameSteward: (n: string) => void;
  boot: () => Promise<void>;
  receipts: () => Receipt[];
  newMission: () => void;
  /** Swap the in-memory workspace for a real directory the user picks. Answers
      in words, never a silent no-op: an unsupported browser and a cancelled
      picker are different answers and both are worth saying out loud. */
  useRealFolder: () => Promise<{ ok: boolean; note: string }>;
}

let seq = 0;
type SetFn = (p: Partial<UiState> | ((s: UiState) => Partial<UiState>)) => void;
type GetFn = () => UiState;
/** The human gate: one promise per ask; a denial becomes RSI curriculum.
 *
 *  Asks are CHAINED, not just stored. The gate is a single slot in the store,
 *  so two live asks would mean the second `set({gate})` overwrites the first
 *  and the first promise is never resolved — a member awaiting approval hangs
 *  forever and the run never terminates. One run is the only thing that can
 *  reach this at once, but a run fans out across members, and now that the tool
 *  layer is live a single member can raise an output gate and a tool gate. So
 *  the queue is structural, not defensive. */
function makeGate(set: SetFn) {
  let tail: Promise<unknown> = Promise.resolve();
  return (ask: GateAsk) => {
    const asked = tail.then(() => new Promise<GateDecision>((resolve) => {
      set({ gate: { ask, resolve: (dec: GateDecision) => {
        if (!dec.approved) ingestRsi("gate", `Gate denied: ${ask.action} — ${dec.reason ?? "no reason recorded"}`);
        resolve(dec);
      }, askedAt: nowIso() } });
    }));
    // the chain must survive a rejection so one failed ask cannot wedge the rest
    tail = asked.then(() => undefined, () => undefined);
    return asked;
  };
}
/** The ONE dependency set every engine run takes — typed message or heartbeat act. */
function runDeps(get: GetFn, set: SetFn, gateFn: (ask: GateAsk) => Promise<GateDecision>): GeneralistDeps {
  const ws = get().workspace;
  return {
    provider: get().provider, gate: gateFn,
    onHandoff: (h) => { recordHandoff(h); set({ handoffs: listHandoffs() }); },
    evidenceFetch: typeof globalThis.fetch === "function" ? globalThis.fetch.bind(globalThis) : undefined,
    /* The two fields that decide whether a member can actually do anything.
       Absent → toolless single-call members and a receipt chain with no tool
       receipts in it. Present → the real act/observe loop, every tool gated by
       risk tier and hashed into the ledger. */
    workspaceRoot: ws.root,
    fsImpl: ws.fs,
  };
}
let heartbeat: ReturnType<typeof setInterval> | null = null;
/** The heartbeat runs only above level 0; it is re-armed whenever the level changes. */
function armHeartbeat(get: GetFn): void {
  if (heartbeat) { clearInterval(heartbeat); heartbeat = null; }
  if (get().initiative.level === 0 || typeof setInterval !== "function") return;
  heartbeat = setInterval(() => {
    void get().wakeNow();
    /* The proactive crew: due schedule triggers fire through the SAME
       governed call as a human request — a trigger is a doorbell, not a
       key; risky targets simply park at the human gate. */
    try {
      for (const t of dueTriggers()) void fireTrigger(t.id).catch(() => undefined);
    } catch { /* a trigger problem never breaks the heartbeat */ }
  }, HEARTBEAT_DEFAULT_MS);
}
const nowIso = () => new Date().toISOString();
/** Validate a persisted theme id against THEMES. A value from the retired
 *  four-finish era ("dark", "light", "petrol", "fog") is NOT migrated to a
 *  named successor — those names described palettes that no longer exist, and
 *  guessing which of eight a reader meant would silently repaint their UI.
 *  An unknown or retired value falls to the default, which is correct because
 *  an unset attribute is also unstyled. */
const readTheme = (): Theme => {
  try {
    const t = localStorage.getItem(THEME_KEY);
    const hit = THEMES.find((x) => x.id === t);
    return hit ? hit.id : DEFAULT_THEME;
  } catch { return DEFAULT_THEME; }
};
/** 19.8 — the owner handle now comes from the identity seam, so the name in the
 *  corner and the subject on every receipt cannot drift apart. The old read was a
 *  separate `vh.owner.handle` key that the identity layer knew nothing about. */
const readHandle = () => identityProvider().current()?.display ?? "owner";

export const useVh = create<UiState>((set, get) => ({
  screen: "steward", theme: readTheme(),
  msgs: [], busy: false, lastResp: null, chatSessionId: `s_${Date.now().toString(36)}`, sessionStart: nowIso(),
  gate: null,
  provider: null, vault: vaultStatus(), securityNote: null,
  memOn: memoryEnabled(), sessions: listSessions(), openSession: null,
  knowledge: loadKnowledgeProposals(),
  handoffs: listHandoffs(), initiative: loadInitiative(), savedTokens: 0,
  gateLog: [],
  ingestLog: loadIngestLog(),
  stewardName: generalistName(), ownerHandle: readHandle(),
  workspace: createMemoryWorkspace(),

  go: (screen) => set({ screen }),
  setTheme: (theme) => { document.documentElement.dataset.theme = theme; try { localStorage.setItem(THEME_KEY, theme); } catch { /* no storage */ } set({ theme }); },

  newMission: () => set({ msgs: [], lastResp: null, chatSessionId: `s_${Date.now().toString(36)}`, sessionStart: nowIso(), screen: "steward", openSession: null }),

  send: async (raw) => {
    const text = raw.trim(); const st = get();
    if (!text || st.busy) return;
    /* The human gate for identity itself: no subject, no run. */
    const subject = currentSubject();
    if (!subject) {
      seq += 1;
      set((s) => ({ msgs: [...s.msgs, { id: seq, role: "vh", text: "No identity is established on this machine, so nothing was run — a receipt has to name someone, and there is no one to name. Re-establish the owner identity in Settings.", at: nowIso() }] }));
      return;
    }
    seq += 1;
    // referential recall → rehydrate, marked, never silent
    let sentText = text; let rehydratedFrom: string | undefined;
    const hits = recall(text, 1);
    const referential = /\b(remember|that day|last time|we discussed|earlier|continue|pick up|history|before)\b/i.test(text) || (hits[0]?.dateMatch ?? false);
    const useId = st.openSession?.id ?? (referential && hits[0] && hits[0].score >= 3 ? hits[0].session.id : null);
    if (useId) { const r = rehydrate(useId); if (r) { sentText = `${r.preamble}\n\n${text}`; rehydratedFrom = r.session.title; } }
    const userMsg: Msg = { id: seq, role: "user", text, at: nowIso(), rehydratedFrom };
    set({ msgs: [...st.msgs, userMsg], busy: true, screen: st.screen === "chat" ? "chat" : "work" });
    const gateFn = makeGate(set);
    try {
      const snap = wireEventSeq();
      const resp = await askSelfImpulse19({ text: sentText, userId: subject }, runDeps(get, set, gateFn));
      const delta = optimDelta(snap);
      if (resp.liveData && resp.liveData.verified === false) {
        const urls = (resp.liveData.retrieval ?? []).map((r) => r.url);
        ingestRsi("livedata", `Live-data claims did not verify: ${urls.join(", ").slice(0, 140) || "no retrieval recorded"}`, urls.slice(0, 3));
      }
      if (resp.outcome === "refused" || resp.outcome === "error" || resp.outcome === "gated-out" || resp.failure) {
        ingestRsi("failure", `Run did not execute (${resp.outcome}): ${resp.note ?? resp.reply.slice(0, 120)}`);
      }
      seq += 1;
      const vhMsg: Msg = { id: seq, role: "vh", text: resp.reply, at: nowIso(), resp, tok: delta.calls > 0 ? delta : undefined };
      set((s) => ({ msgs: [...s.msgs, vhMsg], lastResp: resp, savedTokens: s.savedTokens + Math.max(0, delta.savedTokens) }));
      if (resp.outcome === "gated-out") {
        const r = scheduleFollowUp("verify", `re-check: ${text.slice(0, 72)}`, Date.now() + HEARTBEAT_DEFAULT_MS, 1);
        if (r.ok) set({ initiative: loadInitiative() });
      }
    } catch (e) {
      reportFailure(loadInitiative());
      ingestRsi("failure", `Run threw before it could answer: ${String(e).slice(0, 140)}`);
      /* 19.8 — an engine throw was previously rendered into the transcript and
       * nowhere else, so a reload erased the only trace it had ever happened.
       * It now lands in the local crash ledger as well, which is what makes the
       * failure countable after the fact. Fire-and-forget: the chat message
       * below is the user-facing path and must not wait on the write. */
      void recordCrash({ kind: "engine", where: "askSelfImpulse19", error: e }).catch(() => { /* the ledger refused; the message below still shows */ });
      seq += 1;
      set((s) => ({ msgs: [...s.msgs, { id: seq, role: "vh", text: `The run failed before it could answer — ${String(e)}`, at: nowIso() }], initiative: loadInitiative() }));
    } finally {
      set({ busy: false, gate: null });
      // memory ingest — idempotent upsert by session id
      const s = get();
      if (s.memOn && s.msgs.length) {
        const all: MgMessage[] = s.msgs.map((x) => ({ role: x.role, text: x.text, at: x.at }));
        ingestSession(all, { id: s.chatSessionId, startedAt: s.sessionStart });
        set({ sessions: listSessions() });
      }
    }
  },

  decideGate: (d) => {
    const g = get().gate; if (!g) return;
    set({
      gate: null,
      gateLog: [...get().gateLog, {
        action: g.ask.action,
        riskTier: g.ask.riskTier,
        decision: d.approved ? "approved" : "refused",
        reason: d.approved ? "approved by the human principal" : d.reason,
        at: nowIso(),
      }],
    });
    g.resolve(d);
  },

  setProvider: async (cfg, persist) => {
    if (!cfg) { get().forgetProvider(); return { ok: true, note: "provider removed" }; }
    set({ provider: cfg });
    /* Desktop key holder: the page holds a REFERENCE and non-secret settings — there is no key to seal.
       The settings are remembered in the clear (nothing in them to protect); the key lives in the OS keychain. */
    if (cfg.secretRef) {
      persistNativeConfig(cfg);
      return { ok: true, note: "Connected — the key stays in your OS keychain and survives restarts." };
    }
    if (!persist) return { ok: true, note: "key kept in memory for this session only" };
    const v = vaultStatus();
    if (v.status !== "unlocked") return { ok: true, note: "kept in memory — unlock or create the vault to persist it encrypted" };
    const r = await vaultSeal(PROVIDER_STORAGE_KEY, JSON.stringify(cfg));
    return r.ok ? { ok: true, note: "key sealed in the vault (AES-256-GCM)" } : { ok: false, note: r.error };
  },
  forgetProvider: () => {
    vaultRemove(PROVIDER_STORAGE_KEY); // the stored copy goes FIRST — before anything else can fail
    const ref = get().provider?.secretRef;
    clearNativeConfig();
    // a native-held key is deleted from BOTH keychain namespaces, and its endpoint binding is dropped
    if (ref) void ipc.secretDelete(ref).catch(() => undefined).then(() => ipc.providerUnbindEndpoint(ref)).catch(() => undefined);
    set({ provider: null, securityNote: "the key was removed — nothing lingers in storage" });
  },

  createVault: async (pass) => {
    const r = await setVaultPassphrase(pass);
    if (!r.ok) return { ok: false, note: r.error };
    /* The owner's presence proof becomes the authority root: the passphrase
       derives the owner key and binds it as THE sovereign root — in the
       same task as the unlock, synchronously. The only possible window
       (vault open, root still bootstrap) fails toward LESS power.

       The bind refuses rather than throws, and a refusal leaves the root at
       bootstrap — which does fail toward less power, as above. It is still
       worth saying out loud: "vault unlocked" over a bootstrap root reads as
       success and is not one. */
    const bound = bindOwnerRoot(pass);
    set({ vault: vaultStatus() });
    const p = get().provider; if (p) await vaultSeal(PROVIDER_STORAGE_KEY, JSON.stringify(p));
    return bound.ok
      ? { ok: true, note: r.created ? "vault created — keys and memory are now sealed at rest" : "vault unlocked" }
      : { ok: false, note: `vault ${r.created ? "created" : "unlocked"}, but the owner root did NOT bind (${bound.error}) — authority stays read-only until you unlock again` };
  },
  unlockVault: async (pass) => {
    const r = await setVaultPassphrase(pass);
    if (!r.ok) return { ok: false, note: r.error };
    /* Same owner act on unlock, same task: the passphrase re-derives the
       SAME owner key and re-binds it — the root is the owner's, every
       session. Afterwards, in the background, the vault's cost is measured
       against this machine and raised if the machine has outgrown it
       (performance hardening — never authority, never blocking).

       The bind's answer is reported, as in createVault: a refusal leaves the
       root at bootstrap, which is less power rather than more, but "vault
       unlocked" would still be a claim the user cannot act on. */
    const bound = bindOwnerRoot(pass);
    const opened = await vaultDecrypt(PROVIDER_STORAGE_KEY);
    if (opened.found && !opened.locked) { try { set({ provider: JSON.parse(opened.text) as ProviderConfig }); } catch { /* leave */ } }
    set({ vault: vaultStatus(), sessions: listSessions() });
    armHeartbeat(get);
    void upgradeVaultCost(pass).catch(() => undefined);
    return bound.ok
      ? { ok: true, note: "vault unlocked" }
      : { ok: false, note: `vault unlocked, but the owner root did NOT bind (${bound.error}) — authority stays read-only until you unlock again` };
  },  lock: () => {
    /* Lock LOCKS — ONE atomic transition, fail-safe ordered: the owner's
       authority leaves memory FIRST (root unbound, its capabilities
       invalidated), and only then does the vault seal. Nothing can ever
       observe "locked" with the owner root still bound, and nothing can
       run between the halves of one synchronous task. */
    lockOwnerRoot();
    lockVault();
    set({ vault: vaultStatus() });
  },

  setMemory: (on) => { setMemoryEnabled(on); set({ memOn: on }); },

  /**
   * 19.7.13 — Docs: propose a document as knowledge.
   *
   * The engine owns the judgement, not the UI: `proposeKnowledgeSkill` refuses a
   * document that carries no extractable structure (headings, rules, frameworks)
   * with a written reason, and it reports where the content went — "local" when
   * nothing left the machine, "provider" when an LLM pass sent it to the selected
   * harness. The door shows that verdict verbatim. Nothing is installed here: a
   * proposal waits for the human in `decideDocument`.
   */
  addDocument: async (content, sourceName) => {
    const r = await proposeKnowledgeSkill({ content, sourceName: sourceName.trim() || null });
    if (!r.ok) return { ok: false, note: r.error };
    set({ knowledge: loadKnowledgeProposals() });
    return { ok: true, note: r.proposal.id };
  },

  /**
   * §13 — dropped files, through the one door.
   *
   * One `IngestRun` spans the whole drop, so the per-run budget is a property of
   * the action rather than of anything the caller remembers to pass. A file that
   * parses is handed to `addDocument`'s own engine call — the same
   * proposeKnowledgeSkill the paste box reaches, so a 400-slide deck meets the
   * same structure gate as a typed paragraph and there is no second pipeline to
   * drift out of step. Every receipt, accepted or refused, is persisted: a
   * refusal the user scrolls past must still be auditable tomorrow.
   */
  addFiles: async (files) => {
    const run = createIngestRun();
    const summary: IngestOutcomeSummary = { proposed: [], refused: [], structuralRefused: [] };
    for (const f of files) {
      let r;
      try {
        r = await ingestFile(run, { name: f.name, bytes: f.bytes });
      } catch (e) {
        /* The reader failing is a refusal with a reason, never a silent zero —
           but the run's own receipts cannot describe a throw, so record it here
           rather than let the file vanish from the count. */
        summary.refused.push({ file: f.name, words: `the reader stopped on ${f.name}: ${String(e instanceof Error ? e.message : e).slice(0, 160)}` });
        continue;
      }
      if (!r.ok) { summary.refused.push({ file: f.name, words: r.refusal.words }); continue; }
      const p = await proposeKnowledgeSkill({ content: r.content, sourceName: r.sourceName });
      if (!p.ok) summary.structuralRefused.push({ file: f.name, words: p.error });
      else summary.proposed.push({ file: f.name, proposalId: p.proposal.id });
    }
    if (run.receipts.length > 0) {
      const log = [...get().ingestLog, ...run.receipts].slice(-INGEST_LOG_KEEP);
      saveIngestLog(log);
      set({ ingestLog: log });
    }
    set({ knowledge: loadKnowledgeProposals() });
    return summary;
  },

  /** The human's one decision per proposal; approval mirrors it into skills. */
  decideDocument: (id, approved, note) => {
    const r = decideKnowledgeProposal({ id, decision: approved ? "APPROVED" : "REJECTED", by: get().ownerHandle, note: note.trim() || null });
    if (!r.ok) return { ok: false, note: r.error };
    set({ knowledge: loadKnowledgeProposals() });
    return { ok: true, note: r.proposal.status };
  },

  clearMemory: () => { clearGraph(); set({ sessions: listSessions() }); },
  forgetSession: (id) => { deleteSession(id); set({ sessions: listSessions(), openSession: get().openSession?.id === id ? null : get().openSession }); },
  openConversation: (id) => {
    const s = getSession(id); if (!s) return;
    const msgs: Msg[] = (s.messages ?? []).map((m, i) => ({ id: i + 1, role: m.role, text: m.text, at: m.at }));
    seq = Math.max(seq, msgs.length + 1);
    set({ openSession: s, msgs, chatSessionId: s.id, sessionStart: s.startedAt, screen: "chat", lastResp: null });
  },
  setAutonomy: (l) => { set({ initiative: setLevel(l) }); armHeartbeat(get); },
  wakeNow: async () => {
    const st = loadInitiative();
    const s0 = get();
    /* DREAMING RUNS ON THIS TICK.
     *
     * Consolidation is housekeeping, not work: it is not routed to a specialist
     * and it does not wait for a wake decision, because "nothing worth acting on"
     * and "nothing worth learning from" are different questions. Above level 0
     * the heartbeat is the schedule — a deployment left running overnight comes
     * back with its patterns consolidated, which is what the name promises. A
     * pass inside DREAM_MIN_GAP_MS is a no-op and says so.
     *
     * Level 0 is a person saying "do not do things in the background", and that
     * covers this too: the thread stays silent, and the Memory door still offers
     * the manual pass. */
    if (st.level > 0) {
      const tick = dreamTick(currentSubject() ?? "default");
      if (tick.ran && tick.row && (tick.row.staged > 0 || tick.row.promoted > 0 || tick.row.retired > 0)) {
        seq += 1;
        const line = dreamLine(tick);
        set((s) => ({ msgs: [...s.msgs, { id: seq, role: "vh", text: line, at: nowIso() }] }));
      }
    }
    let facts = 0; try { const g = graphStats(); facts = g.nodes + g.edges; } catch { /* no graph */ }
    const wake = evaluateWake(
      { now: Date.now(), level: st.level, providerReady: !!s0.provider, vaultUnlocked: s0.vault.status === "unlocked", memoryOn: s0.memOn },
      st,
      { pendingGoalId: loadGoals()[0]?.id ?? null, newFacts: facts },
    );
    set({ initiative: { ...applyWake(wake, st, Date.now()) } });
    /* THE EXECUTION BRIDGE: safe acts ride the REAL engine through the shared
       production executor — askSelfImpulse19 with the SAME dep set a typed message takes
       (provider · human gate · handoff recorder · evidence fetch · userId). */
    if (wake.kind === "act" && wake.acts.length > 0) {
      const gateFn = makeGate(set);
      const executor = engineExecutor({ userId: currentSubject() ?? "unattributed", depsFactory: () => runDeps(get, set, gateFn) });
      const runs = await executeWakeActs(wake.acts, executor);
      const lines = runs.map((r) => {
        const head = `· ${r.act.kind}: ${r.act.subject}`;
        if (!r.executed) return `${head} — ${r.whyNot ?? "not executed"}${r.result ? ` (${r.result.verdict})` : ""}`;
        return `${head} — ${r.result!.verdict}: ${r.act.note}${r.rescheduled ? " → re-check scheduled (depth-capped)" : ""}`;
      });
      seq += 1;
      set((s) => ({ msgs: [...s.msgs, { id: seq, role: "vh", text: `Initiative (self-directed, level ${st.level}) — executed through the real engine\n${lines.join("\n")}`, at: nowIso() }], initiative: loadInitiative(), gate: null }));
    }
  },
  renameSteward: (n) => set({ stewardName: setGeneralistName(n) }),

  useRealFolder: async () => {
    if (!fsAccessSupported()) {
      return { ok: false, note: "This runtime has no File System Access API, so a real folder cannot be opened here. The in-memory workspace is still real to the agents and still produces real receipts — it just does not survive a reload." };
    }
    const picked = await openDirectoryWorkspace();
    if (!picked) return { ok: false, note: "No folder was chosen, so the in-memory workspace is still in use." };
    set({ workspace: picked });
    return { ok: true, note: `Workspace is now ${picked.label}. Everything under it is reachable; paths that try to climb out are refused before any read.` };
  },

  boot: async () => {
    document.documentElement.dataset.theme = get().theme;
    // 19.7.1 discipline: purge legacy plaintext, load sealed if unlocked
    let legacy: ProviderConfig | null = null;
    try {
      const raw = globalThis.localStorage?.getItem(PROVIDER_STORAGE_KEY) ?? null;
      if (raw && !raw.includes("si-vault/1")) { const p = purgePlain(PROVIDER_STORAGE_KEY); if (p.found && p.text) { try { legacy = JSON.parse(p.text) as ProviderConfig; } catch { legacy = null; } } }
    } catch { /* no storage */ }
    const opened = await vaultDecrypt(PROVIDER_STORAGE_KEY);
    if (opened.found && !opened.locked) { try { set({ provider: JSON.parse(opened.text) as ProviderConfig, securityNote: "the key was unsealed from the encrypted vault" }); } catch { /* ignore */ } }
    else if (opened.found && opened.locked) set({ securityNote: "a sealed provider key is in the vault — unlock it in Settings to use it" });
    else if (legacy) set({ provider: legacy, securityNote: "a plaintext key from 19.7.0 was found and removed — it lives in memory for this session only" });
    // Desktop: the provider is a reference to a key in the OS keychain — restored only if that key is still there.
    const nativeProvider = await loadNativeConfig();
    if (nativeProvider) set({ provider: nativeProvider, securityNote: "the key is held by your OS keychain — this window cannot read it" });
    set({ vault: vaultStatus(), sessions: listSessions() });
    armHeartbeat(get);
  },

  receipts: () => {
    const out: Receipt[] = []; const seen = new Set<string>();
    const push = (r: Receipt) => { if (!seen.has(r.id)) { seen.add(r.id); out.push(r); } };
    for (const m of get().msgs) {
      const r = m.resp; if (!r) continue;
      if (r.provenanceDigest) push({ id: r.provenanceDigest, title: `Run · ${r.outcome} · ${r.specialistIds.length} agent${r.specialistIds.length === 1 ? "" : "s"}`, signer: r.authority ? `owner · ${r.authority.scheme}` : "provenance", digest: r.provenanceDigest, at: m.at, state: receiptStateFor(r.outcome), kind: "run" });
      for (const mr of r.memberRuns ?? []) for (const t of mr.toolReceipts) if (t.digest) push({ id: t.digest, title: `${t.tool} · ${t.outcome}`, signer: "tool receipt", digest: t.digest, at: m.at, state: receiptStateFor(t.outcome), kind: "tool" });
      if (r.synthesis && (r.synthesis as { digest?: string }).digest) push({ id: (r.synthesis as { digest: string }).digest, title: "Synthesis", signer: "captain", digest: (r.synthesis as { digest: string }).digest, at: m.at, state: "ok", kind: "synthesis" });
    }
    for (const h of get().handoffs) if (h.receiptDigest) push({ id: h.receiptDigest, title: `Handoff · ${h.peer} · ${h.outcome}`, signer: "mesh", digest: h.receiptDigest, at: "", state: receiptStateFor(h.outcome), kind: "handoff" });
    for (const gl of get().gateLog) push({ id: `gate:${gl.at}:${gl.action}`, title: `Gate · ${gl.action} · ${gl.decision}`, signer: "human decision", digest: "—", at: gl.at, state: gl.decision === "approved" ? "ok" : "refused", kind: "gate" });
    /* §13 — a file the door refused is a ledger row. The digest is the sha256 of
       the bytes that were rejected, so a refusal names its artifact. */
    for (const ing of get().ingestLog) push({ id: ing.id, title: `File · ${ing.file} · ${ing.decision === "accepted" ? `${ing.format} read` : ing.code ?? "refused"}`, signer: `ingestion · ${ing.bytesIn.toLocaleString()} bytes${ing.entries > 0 ? ` · ${ing.entries} entries` : ""}`, digest: ing.sourceSha256.slice(0, 16), at: ing.at, state: ing.decision === "accepted" ? "ok" : "refused", kind: "ingest" });
    const g = get().gate; if (g) out.unshift({ id: "pending", title: g.ask.action, signer: "—", digest: "—", at: g.askedAt, state: "pending", kind: "gate" });
    return out;
  },
}));

export const memoryGraphData = () => graphView(48);
export const memoryStats = () => graphStats();
export const memorySecurity = () => graphSecurityStatus();
