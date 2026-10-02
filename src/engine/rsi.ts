/**
 * SelfImpulse — Recursive Self-Improvement, the SelfImpulse way (19.4.2).
 *
 * THE LANDSCAPE, AND WHERE THIS SITS (see docs/RSI-FRAMEWORK.md):
 * every verified RSI system in the 2026 literature — AlphaEvolve, the
 * Darwin Gödel Machine, Gödel Agent, STOP, AIDE², RSIAgent — improves
 * against a FIXED external signal and is bounded. The production
 * literature converges on the same checklist: external ground truth
 * (never intrinsic self-judgment — Huang et al., ICLR 2024), capped
 * iterations, promotion gates, rollback, evidence lineage. SelfImpulse
 * implements that checklist as product mechanics:
 *
 *   CURRICULUM — deterministic scan of the agent's OWN evidence, all five
 *     declared sources: user rejection, human-gate denial, execution
 *     failure, live-data verification failure, peer/BYOA handoff refusal.
 *     Nothing is invented; every topic cites ledger evidence.
 *   ACTOR — drafts a frozen SKILL playbook per topic; with a provider, ONE
 *     receipted call may refine wording. Provider proposes ≠ provider
 *     decides: drafts stay pending until a human acts.
 *   VERIFIER — the hierarchy from the RSI survey, honored in code: human
 *     approval + the autonomy exam outrank everything; intrinsic
 *     self-assessment is NEVER a verifier (floor).
 *   PROMOTION — an applied playbook enters the promotion ladder as
 *     'measuring'; it may only be settled by a MEASURED comparison
 *     (candidate beats baseline) — the same discipline as the mission
 *     self-improve loop (src/mission/selfImprove.ts). Self-declared
 *     success retires nothing and adopts nothing.
 *   MEMORY — frozen, digest-stamped, composed into prompts (no parameter
 *     updates), reverts exactly.
 *
 * The floor is the product's answer to open-ended RSI: the loop may
 * improve playbooks; it may never touch the gate, the exam, the
 * verification suites, the risk tiers, or the floor itself.
 */
import { loadMemory } from "./memory";
import { listHandoffs } from "./handoffs";
import { getSpecialist } from "./registry";
import { importSkillMd, removeImportedSkill, importedSkills } from "./skillsImport";
import type { ProviderConfig } from "./types";
import { complete } from "./providers";
import { draftContract, validateChangeContract, type ChangeContract, type MeasurementEvidence, sealMeasurement } from "./rsirals";

export const RSI_FLOOR = [
  "the human gate and its risk tiers",
  "the autonomy exam and its pass threshold",
  "the probe and verification suites and their pins",
  "the self-evolution floor (SELF_EVOLUTION_FLOOR)",
  "this floor list itself — the loop cannot loosen the loop",
];

/** The full declared evidence hierarchy — every source is implemented. */
export type RsiSource = "reject" | "gate" | "failure" | "livedata" | "handoff";

export interface RsiSignal {
  id: string;
  kind: RsiSource;
  subject: string;
  evidence: string[];
  at: string;
}

export interface RsiTopic {
  id: string;
  subject: string;
  source: RsiSource;
  evidence: string[];
  category?: string;
}

export interface RsiPromotion {
  id: string;
  draftId: string;
  name: string;
  state: "measuring" | "adopted" | "retired";
  baseline: string;
  candidate: string;
  settledBy?: string;
  at: string;
}

export interface RsiDraft {
  id: string;
  topicId: string;
  name: string;
  description: string;
  body: string;
  provenance: "rsi-deterministic" | "rsi-provider";
  /** sha-256 over the draft — frozen-memory identity. */
  digest: string;
  state: "pending" | "applied" | "rejected" | "reverted";
  /** Which rung of the verifier hierarchy applies — stated, not implied. */
  verifierNote: string;
  /** 19.4.4: every draft carries a STRUCTURED change contract — the
      primary governance check is structural, not string-based. */
  contract: ChangeContract;
  category?: string;
  at: string;
}

interface RsiState { topics: RsiTopic[]; drafts: RsiDraft[]; signals: RsiSignal[]; promotions: RsiPromotion[]; }

const KEY = "engine.rsi.v1";
const SIGNAL_CAP = 50;

function storage(): Storage | null {
  try { return typeof localStorage !== "undefined" ? localStorage : null; } catch { return null; }
}
const session: RsiState = { topics: [], drafts: [], signals: [], promotions: [] };

function load(): RsiState {
  const s = storage();
  if (!s) return session;
  try {
    const p = JSON.parse(s.getItem(KEY) ?? "") as Partial<RsiState>;
    return { topics: p.topics ?? [], drafts: p.drafts ?? [], signals: p.signals ?? [], promotions: p.promotions ?? [] };
  } catch { return session; }
}
function save(st: RsiState): void {
  const s = storage();
  if (s) { try { s.setItem(KEY, JSON.stringify(st)); return; } catch { /* session-only */ } }
  session.topics = st.topics; session.drafts = st.drafts; session.signals = st.signals; session.promotions = st.promotions;
}

async function sha256Hex(text: string): Promise<string> {
  const buf = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((x) => x.toString(16).padStart(2, "0")).join("");
}

export function rsiState(): RsiState { return load(); }
export function rsiMemory(): RsiDraft[] { return load().drafts.filter((d) => d.state === "applied"); }
export function rsiSignals(): RsiSignal[] { return load().signals; }
export function rsiPromotions(): RsiPromotion[] { return load().promotions; }

/* ── EVIDENCE INGEST — the five sources, wired from the live product ─────── */

/**
 * Called by the door on real events: a gate denial, an execution failure,
 * a live-data verification that did not verify. The RSI loop only ever
 * learns from events that actually happened and were receipted elsewhere.
 */
export function recordRsiSignal(kind: RsiSource, subject: string, evidence: string[] = []): RsiSignal {
  const st = load();
  const sig: RsiSignal = { id: `sig.${kind}.${st.signals.length + 1}.${Date.now().toString(36)}`, kind, subject: subject.slice(0, 200), evidence: evidence.slice(0, 4), at: new Date().toISOString() };
  st.signals = [...st.signals, sig].slice(-SIGNAL_CAP);
  save(st);
  return sig;
}

/* ── CURRICULUM — the scan of the agent's own evidence ───────────────────── */

export function rsiCurriculum(userId = "local"): RsiTopic[] {
  const topics: RsiTopic[] = [];
  /* 1. user rejections — the strongest human signal */
  const mem = loadMemory(userId).slice(-60);
  for (const d of mem.filter((x) => x.kind === "reject").slice(-4)) {
    topics.push({
      id: `topic.reject.${d.id}`,
      subject: `Rejected work in "${(d.scenario ?? "").slice(0, 90)}" — correction: ${d.reason || "(no reason recorded)"}`,
      source: "reject",
      evidence: [d.id],
      category: d.category ?? (d.specialistId ? getSpecialist(d.specialistId)?.category : undefined) ?? undefined,
    });
  }
  /* 2-4. gate denials, execution failures, live-data failures — ingested live */
  for (const sig of load().signals.slice(-9)) {
    topics.push({ id: `topic.${sig.kind}.${sig.id}`, subject: sig.subject, source: sig.kind, evidence: sig.evidence });
  }
  /* 5. peer/BYOA handoff refusals */
  for (const h of listHandoffs().filter((x) => x.outcome === "refused").slice(-3)) {
    topics.push({ id: `topic.handoff.${h.id}`, subject: `Refused delegation to ${h.peer}: ${h.detail.slice(0, 90)}`, source: "handoff", evidence: [h.id] });
  }
  return topics.slice(0, 10);
}

/* ── ACTOR — draft a frozen playbook per topic ───────────────────────────── */

const draftBody = (t: RsiTopic): string =>
  `Procedure:\n1. When a task resembles "${t.subject.split("—")[0].trim()}", recall this ledger event (${t.source}).\n2. Apply the recorded correction before answering; if the correction conflicts with a newer human decision, the NEWER decision wins.\n3. State in one line that this playbook came from the RSI loop, with its evidence id.\nQuality checklist: does the correction trace to a real ledger entry? does it tighten rather than widen discretion? would a reviewer accept it in one sentence?`;

export async function runRsiCycle(userId: string, opts: { provider?: ProviderConfig | null; fetchImpl?: typeof fetch } = {}): Promise<RsiState> {
  const topics = rsiCurriculum(userId);
  const st = load();
  const known = new Set(st.topics.map((t) => t.id));
  const fresh = topics.filter((t) => !known.has(t.id));
  st.topics = [...st.topics, ...fresh].slice(-40);

  for (const t of fresh) {
    let body = draftBody(t);
    let provenance: RsiDraft["provenance"] = "rsi-deterministic";
    if (opts.provider) {
      try {
        const res = await complete(
          opts.provider,
          "You draft operational playbooks for a governed agent OS. Output ONLY markdown: a numbered Procedure (3-5 steps) and a Quality checklist (2-4 items). The playbook must TIGHTEN discretion, trace to the evidence given, and never touch gates, exams, risk tiers or verification.",
          `Evidence (${t.source}): ${t.subject}\nDraft the playbook.`,
          { fetchImpl: opts.fetchImpl, timeoutMs: 20_000 },
        );
        if (res.ok && res.text.trim().length > 40) { body = res.text.trim().slice(0, 2400); provenance = "rsi-provider"; }
      } catch { /* deterministic draft stands — honesty over polish */ }
    }
    const name = `rsi.${t.source}.${t.id.split(".").pop()}`;
    /* Structural governance first: every draft is born with a change
       contract; a contract that cannot validate is never even drafted. */
    const contract = draftContract(t.subject);
    const cv = validateChangeContract(contract);
    if (!cv.allowed) continue;
    st.drafts.push({
      id: `draft.${t.id}`,
      topicId: t.id,
      name,
      description: `RSI draft from ${t.source} evidence — ${t.subject.slice(0, 110)}`,
      body,
      provenance,
      digest: await sha256Hex(`${t.id}\n${body}`),
      state: "pending",
      verifierNote: "verifier hierarchy: human approval now (strong) + measured promotion before broad trust; intrinsic self-assessment is never a verifier (floor)",
      contract,
      category: t.category,
      at: new Date().toISOString(),
    });
  }
  save(st);
  return st;
}

/* ── VERIFIER + frozen memory + the promotion ladder ─────────────────────── */

export async function applyRsiDraft(draftId: string): Promise<{ ok: boolean; error?: string }> {
  const st = load();
  const d = st.drafts.find((x) => x.id === draftId);
  if (!d) return { ok: false, error: "no such draft" };
  if (d.state !== "pending") return { ok: false, error: `draft already ${d.state}` };
  const skillMd = `---\nname: ${d.name}\ndescription: ${d.description.slice(0, 160)}\ncategory: ${d.category ?? "*"}\n---\n\n# RSI playbook ${d.name}\n\n${d.body}\n\n## Provenance\nFrozen RSI memory ${d.digest.slice(0, 16)}… · ${d.provenance} · ${d.at}. Applied by human decision; reverts exactly.`;
  try {
    await importSkillMd(skillMd, "pasted");
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
  d.state = "applied";
  /* The promotion ladder: applied ≠ trusted. The playbook enters as
     'measuring' and can only be settled by a MEASURED comparison —
     the same discipline as src/mission/selfImprove.ts. */
  const promo: RsiPromotion = {
    id: `promo.${d.id}`,
    draftId: d.id,
    name: d.name,
    state: "measuring",
    baseline: "no playbook",
    candidate: d.name,
    at: new Date().toISOString(),
  };
  st.promotions = [...st.promotions, promo].slice(-24);
  save(st);
  return { ok: true };
}

/**
 * MODULE-PRIVATE raw settlement. Deliberately NOT exported: no product
 * surface can settle a promotion by supplying numbers directly. The only
 * exported door is settleRsiPromotion below, which verifies a sealed
 * MeasurementEvidence produced by the receipt-bound path
 * (rsirals.bindSettlementEvidence). This is a structural seal — the
 * honesty of the claim rests on code review + probes, not on keeping
 * client-side crypto secret.
 */
function settleRaw(promoId: string, measured: { baselineScore: number; candidateScore: number; source: string }): RsiPromotion | null {
  const st = load();
  const p = st.promotions.find((x) => x.id === promoId);
  if (!p || p.state !== "measuring") return null;
  const won = Number.isFinite(measured.baselineScore) && Number.isFinite(measured.candidateScore) && measured.candidateScore > measured.baselineScore;
  p.state = won ? "adopted" : "retired";
  p.settledBy = `${measured.source} · baseline ${measured.baselineScore} vs candidate ${measured.candidateScore}`;
  if (!won) {
    /* retired = the frozen memory goes with it; revert is exact */
    const d = st.drafts.find((x) => x.id === p.draftId);
    if (d && d.state === "applied") { removeImportedSkill(d.name); d.state = "reverted"; }
  }
  save(st);
  return p;
}

/**
 * The ONLY product-level settlement API (19.4.4). Evidence must be a
 * MeasurementEvidence sealed by rsirals.bindSettlementEvidence; the seal
 * is recomputed here and any mismatch — forged numbers, re-used
 * evidence, tampered source — is refused by returning null.
 */
export function settleRsiPromotion(promoId: string, evidence: MeasurementEvidence): RsiPromotion | null {
  if (evidence.promoId !== promoId) return null;
  if (sealMeasurement(evidence) !== evidence.digest) return null;
  return settleRaw(promoId, { baselineScore: evidence.baseline, candidateScore: evidence.candidate, source: evidence.source });
}

export function rejectRsiDraft(draftId: string, reason: string): RsiState {
  const st = load();
  const d = st.drafts.find((x) => x.id === draftId);
  if (d && d.state === "pending") { d.state = "rejected"; d.description = `${d.description} · rejected: ${reason}`; save(st); }
  return st;
}

export function revertRsiMemory(draftId: string): RsiState {
  const st = load();
  const d = st.drafts.find((x) => x.id === draftId);
  if (d && d.state === "applied") {
    removeImportedSkill(d.name);
    d.state = "reverted";
    const p = st.promotions.find((x) => x.draftId === draftId);
    if (p && p.state === "measuring") p.state = "retired";
    save(st);
  }
  return st;
}

/** Applied RSI playbooks currently live in the imported-skill store. */
export function rsiLivePlaybooks() {
  return importedSkills().filter((s) => s.name.startsWith("rsi."));
}
