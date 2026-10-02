/**
 * GROUPS — two owners' agents, one governed crew (19.7.5 [Groups]).
 *
 * The gap this module closes: until now, everything worked INSIDE one
 * owner's machine — Ram's agents worked with Ram's sub-agents, and the
 * federation plane crossed INDIVIDUAL tasks between owners. A group is the
 * missing continuous form: Ram's VH and Raj's VH join as ONE working group
 * whose agents collaborate across both sides — while the OWNERS stay the
 * governors. The agents work; the humans rule.
 *
 * The law of the module, in order:
 *
 *   1. CHARTER — a group exists only as a charter both owners accepted:
 *      named members, explicit capabilities (a subset of the federation
 *      delegation capabilities), hard limits (tasks per rolling 24h,
 *      crossings per task, an expiry), and a group-wide mode. Proposed
 *      until every member accepts; revoked by either owner, finally.
 *
 *   2. LIMITS — the charter's caps are law: a task beyond the rolling
 *      window or the expiry is refused in words. The refusal is the
 *      charter working, not an error.
 *
 *   3. MODES — the SAME three modes as the crew (modes.ts), group-wide
 *      and hot-switchable mid-run: manual gates every item, semi runs
 *      local safe items free but gates every CROSSING (delegating work to
 *      another owner is risky by nature), full runs both free inside the
 *      charter limits. In-flight items finish under their admitting mode;
 *      every switch lands in the steward feed.
 *
 *   4. WORK — a group task is planned into items: LOCAL items (run on this
 *      side, by the real member agent loop, routed by Agentic MoE v2's
 *      top specialist for that slice) and CROSSING items (delegated to the
 *      peer over the signed federation crossing — replay-guarded, both
 *      ledgers agreeing). No standing grant → the crossing item fails
 *      honestly and says to issue one; it never fakes a result.
 *
 *   5. PROOF — every item carries a digest; the session receipt chains the
 *      item receipts. The steward reports the working as it happens; the
 *      human gate is per-item, at the OWNING side, and never bypassed.
 */

import type { ProviderConfig } from "./types";
import { getSpecialist } from "./registry";
import { buildSpecialistPrompt } from "./skills";
import { runMemberAgent } from "./agentLoop";
import { scanDomains, selectCrewV2 } from "./moeV2";
import { pureSha256 } from "./pureHash";
import {
  actRunsUnattended, gateAskLine, setMode, initialModeState,
  CREW_MODE_LABELS, type CrewMode, type ModeState,
} from "./modes";
import {
  initialFeed, record, brief, reassignLine, escalateLine,
  type StewardFeed,
} from "./steward";
import { compressToolOutput, noteLotus } from "./lotus";
import { DELEGATION_CAPABILITIES, type DelegationCapability } from "./reach/delegationGrant";

/* ── the charter ────────────────────────────────────────────────────────── */

export interface GroupMember {
  ownerId: string;
  label: string;
}

export interface GroupLimits {
  /** Refusals beyond this many group sessions in a rolling 24h window. */
  maxTasksPerDay: number;
  /** Crossing items a single group session may field. */
  maxCrossingsPerTask: number;
  /** Epoch ms — past this the charter is inert. */
  expiresAt: number;
}

export type GroupStatus = "proposed" | "active" | "revoked";

export interface GroupCharter {
  id: string;
  name: string;
  members: GroupMember[];
  capabilities: DelegationCapability[];
  limits: GroupLimits;
  mode: CrewMode;
  status: GroupStatus;
  /** memberId → the charter digest they accepted, in acceptance order. */
  acceptances: Array<{ ownerId: string; digest: string; at: number }>;
  revocation?: { by: string; reason: string; at: number };
  createdAt: number;
}

export interface CharterCheck {
  ok: boolean;
  error?: string;
}

export function charterDigest(c: GroupCharter): string {
  return pureSha256(JSON.stringify({
    v: "si-group-charter/1", name: c.name, members: c.members,
    capabilities: [...c.capabilities].sort(), limits: c.limits, createdAt: c.createdAt,
  }));
}

/** The charter's validity law — everything must be explicit, bounded, in-vocabulary. */
export function checkCharter(c: GroupCharter, now = Date.now()): CharterCheck {
  if (c.members.length < 2) return { ok: false, error: "a group is at least two owners — one owner is a crew, not a group" };
  const ids = new Set(c.members.map((m) => m.ownerId));
  if (ids.size !== c.members.length) return { ok: false, error: "duplicate member ids — each owner joins once" };
  if (c.capabilities.length === 0) return { ok: false, error: "name at least one capability — a charter that may do nothing is not a charter" };
  const vocab = new Set<string>(DELEGATION_CAPABILITIES as readonly string[]);
  for (const cap of c.capabilities) {
    if (!vocab.has(cap)) return { ok: false, error: `unknown capability '${cap}' — use the federation delegation vocabulary` };
  }
  if (!Number.isFinite(c.limits.maxTasksPerDay) || c.limits.maxTasksPerDay < 1) return { ok: false, error: "maxTasksPerDay must be at least 1" };
  if (!Number.isFinite(c.limits.maxCrossingsPerTask) || c.limits.maxCrossingsPerTask < 0) return { ok: false, error: "maxCrossingsPerTask must be 0 or more" };
  if (!Number.isFinite(c.limits.expiresAt) || c.limits.expiresAt <= now) return { ok: false, error: "the charter expires in the past — set a live expiry" };
  if (!["manual", "semi", "full"].includes(c.mode)) return { ok: false, error: "the group mode is manual | semi | full" };
  return { ok: true };
}

export function createCharter(opts: {
  name: string; members: [GroupMember, GroupMember, ...GroupMember[]];
  capabilities: DelegationCapability[]; limits: GroupLimits; mode?: CrewMode; at?: number;
}): { charter: GroupCharter | null; error?: string } {
  const at = opts.at ?? Date.now();
  const charter: GroupCharter = {
    id: `group-${at.toString(36)}`,
    name: opts.name.trim() || `${opts.members.map((m) => m.label).join(" ↔ ")}`,
    members: opts.members,
    capabilities: [...opts.capabilities],
    limits: opts.limits,
    mode: opts.mode ?? "manual",
    status: "proposed",
    acceptances: [],
    createdAt: at,
  };
  const check = checkCharter(charter, at);
  if (!check.ok) return { charter: null, error: check.error };
  return { charter };
}

/** One member's acceptance. The charter activates only when ALL accepted. */
export function acceptCharter(c: GroupCharter, ownerId: string, at = Date.now()): { ok: boolean; line: string } {
  if (c.status === "revoked") return { ok: false, line: "the group is revoked — form a new one" };
  const member = c.members.find((m) => m.ownerId === ownerId);
  if (!member) return { ok: false, line: `${ownerId} is not a member of this group` };
  if (c.acceptances.some((a) => a.ownerId === ownerId)) return { ok: false, line: `${ownerId} already accepted` };
  c.acceptances.push({ ownerId, digest: charterDigest(c), at });
  if (c.acceptances.length === c.members.length) {
    c.status = "active";
    return { ok: true, line: `the group is ACTIVE — ${c.members.map((m) => m.label).join(" ↔ ")} work as one governed crew (${c.capabilities.length} capability(ies), ${c.limits.maxTasksPerDay} tasks/day)` };
  }
  return { ok: true, line: `${member.label} accepted — waiting for ${c.members.filter((m) => !c.acceptances.some((a) => a.ownerId === m.ownerId)).map((m) => m.label).join(", ")}` };
}

/** Revocation is one-sided, final, and named. */
export function revokeCharter(c: GroupCharter, byOwnerId: string, reason: string, at = Date.now()): { ok: boolean; line: string } {
  if (!c.members.some((m) => m.ownerId === byOwnerId)) return { ok: false, line: "only a member may revoke" };
  if (c.status === "revoked") return { ok: false, line: "already revoked" };
  c.status = "revoked";
  c.revocation = { by: byOwnerId, reason, at };
  return { ok: true, line: `the group is revoked by ${byOwnerId} — reason on record: ${reason}` };
}

/* ── the group session ──────────────────────────────────────────────────── */

export type GroupItemKind = "local" | "crossing";
export type GroupItemStatus = "queued" | "gated" | "active" | "answered" | "failed" | "refused" | "escalated";

export interface GroupItem {
  itemId: string;
  kind: GroupItemKind;
  ownerId: string;
  task: string;
  specialistId?: string;
  capability?: DelegationCapability;
  status: GroupItemStatus;
  admittedUnder: CrewMode;
  gateAsk?: string;
  answerPreview?: string;
  digest?: string;
  note?: string;
}

export type GroupSessionStatus = "running" | "awaiting-gate" | "done" | "failed";

export interface GroupSession {
  id: string;
  charterId: string;
  task: string;
  createdAt: number;
  status: GroupSessionStatus;
  mode: ModeState;
  items: GroupItem[];
  feed: StewardFeed;
  sessionReceipt?: string;
  refusal?: string;
}

const sessions = new Map<string, GroupSession>();
const sessionTimes: number[] = [];
let seq = 0;

export function getGroupSession(id: string): GroupSession | null {
  return sessions.get(id) ?? null;
}

export function resetGroupSessions(): void {
  sessions.clear();
  sessionTimes.length = 0;
  seq = 0;
}

function rolling24hCount(now: number): number {
  while (sessionTimes.length > 0 && now - sessionTimes[0] > 24 * 60 * 60 * 1000) sessionTimes.shift();
  return sessionTimes.length;
}

/**
 * Plan a group task: local slices route to this side's best specialist per
 * slice; the collaboration slice crosses to the peer once per capability in
 * the charter (bounded by maxCrossingsPerTask). Everything is gated or
 * queued by the charter's mode BEFORE anything runs.
 */
export function createGroupSession(
  charter: GroupCharter,
  task: string,
  slices: string[],
  opts: { at?: number } = {},
): GroupSession {
  const at = opts.at ?? Date.now();
  const base: GroupSession = {
    id: `gsession-${at.toString(36)}-${++seq}`,
    charterId: charter.id,
    task,
    createdAt: at,
    status: "running",
    mode: initialModeState(),
    items: [],
    feed: initialFeed(),
  };
  // charter mode becomes the session's starting mode
  base.mode = { ...base.mode, mode: charter.mode };
  const refuse = (why: string): GroupSession => {
    base.status = "failed";
    base.refusal = why;
    record(base.feed, "note", why, at);
    sessions.set(base.id, base);
    return base;
  };
  if (charter.status !== "active") return refuse(charter.status === "proposed" ? "the charter is only proposed — every member must accept before the group works" : "the group is revoked — nothing executes");
  if (charter.limits.expiresAt <= at) return refuse("the charter has expired — renew it before the group works");
  if (rolling24hCount(at) >= charter.limits.maxTasksPerDay) return refuse(`the charter's limit is ${charter.limits.maxTasksPerDay} task(s) per rolling 24h — this task would exceed it; the limit is the charter working`);
  if (slices.length === 0) return refuse("no work slices were named — a group task is at least one slice");

  const peer = charter.members.find((m) => m.ownerId !== "si-owner") ?? charter.members[charter.members.length - 1];
  const me = charter.members[0];
  const maxCross = charter.limits.maxCrossingsPerTask;
  let crossings = 0;
  sessionTimes.push(at);

  for (const slice of slices) {
    const pool = scanDomains(slice);
    const sel = selectCrewV2(slice, pool);
    const top = sel.crew[0];
    const tier: "safe" | "risky" = "safe";
    const runsFree = actRunsUnattended(charter.mode, tier);
    base.items.push({
      itemId: `${seq}-i${base.items.length}`,
      kind: "local",
      ownerId: me.ownerId,
      task: slice,
      specialistId: top?.id,
      status: runsFree ? "queued" : "gated",
      admittedUnder: charter.mode,
      ...(runsFree ? {} : { gateAsk: gateAskLine(charter.mode, tier, slice) }),
    });
  }
  // one collaboration crossing per charter capability, up to the cap
  for (const cap of charter.capabilities) {
    if (crossings >= maxCross) break;
    const tier: "safe" | "risky" = "risky"; // delegating across owners is risky by nature
    const runsFree = actRunsUnattended(charter.mode, tier);
    crossings += 1;
    base.items.push({
      itemId: `${seq}-i${base.items.length}`,
      kind: "crossing",
      ownerId: peer.ownerId,
      task,
      capability: cap,
      status: runsFree ? "queued" : "gated",
      admittedUnder: charter.mode,
      ...(runsFree ? {} : { gateAsk: gateAskLine(charter.mode, tier, `${cap} → ${peer.label}`) }),
    });
  }
  const gated = base.items.filter((i) => i.status === "gated").length;
  if (gated === base.items.length) base.status = "awaiting-gate";
  record(base.feed, "crew-started",
    `group task mustered: ${base.items.length} item(s) — ${base.items.filter((i) => i.kind === "local").length} local, ${crossings} crossing(s) · mode ${CREW_MODE_LABELS[charter.mode]}${gated ? ` · ${gated} await your gate` : ""}`, at);
  sessions.set(base.id, base);
  return base;
}

/** Per-item gate decision. Same revival law as the crew's resolveGate. */
export function resolveGroupItem(sessionId: string, itemId: string, approve: boolean, at = Date.now()): { ok: boolean; line: string } {
  const s = sessions.get(sessionId);
  if (!s) return { ok: false, line: "no such group session" };
  if (s.status === "failed") return { ok: false, line: "the session was refused at creation — muster a new task" };
  const item = s.items.find((i) => i.itemId === itemId);
  if (!item || item.status !== "gated") return { ok: false, line: "that item is not at the gate" };
  if (!approve) {
    item.status = "refused";
    record(s.feed, "note", `${item.kind} item refused at your gate — it will not run`, at);
  } else {
    item.status = "queued";
    record(s.feed, "member-admitted", `${item.kind} item approved at your gate — joining the work`, at);
  }
  const gatedLeft = s.items.filter((i) => i.status === "gated").length;
  if (s.status === "awaiting-gate" || s.status === "running") s.status = gatedLeft > 0 ? "awaiting-gate" : "running";
  return { ok: true, line: `${approve ? "approved" : "refused"}: ${item.itemId}` };
}

/** Hot-switch the group's mode mid-run. In-flight items keep their admitting mode. */
export function switchGroupMode(sessionId: string, next: CrewMode, at = Date.now(), why = ""): { ok: boolean; line: string } {
  const s = sessions.get(sessionId);
  if (!s) return { ok: false, line: "no such group session" };
  const res = setMode(s.mode, next, at, why);
  s.mode = res.state;
  if (res.changed) {
    record(s.feed, "mode-switched", res.line, at);
    for (const item of s.items) {
      if (item.status !== "queued" && item.status !== "gated") continue;
      const tier: "safe" | "risky" = item.kind === "crossing" ? "risky" : "safe";
      const runsFree = actRunsUnattended(next, tier);
      if (runsFree && item.status === "gated") { item.status = "queued"; item.gateAsk = undefined; item.admittedUnder = next; }
      else if (!runsFree && item.status === "queued") { item.status = "gated"; item.gateAsk = gateAskLine(next, tier, item.task.slice(0, 60)); }
    }
  }
  return { ok: res.changed, line: res.line || res.error || "" };
}

export interface GroupRunOptions {
  provider: ProviderConfig;
  fetchImpl?: typeof fetch;
  /** The crossing seam — production wires the signed federation crossing. */
  cross?: (item: GroupItem) => Promise<{ ok: boolean; detail: string; digest?: string }>;
  maxSteps?: number;
}

/** The production crossing seam: the real signed federation crossing. */
export const productionCross = (ownerA: string) =>
  async (item: GroupItem): Promise<{ ok: boolean; detail: string; digest?: string }> => {
    const { runLiveCrossing } = await import("./federation/live");
    const res = await runLiveCrossing({ capability: item.capability!, task: item.task, ownerA, ownerB: item.ownerId });
    const o = res.outcome;
    return { ok: o.status === "crossed", detail: `${o.status}: ${o.detail ?? o.reason ?? ""}`.trim(), digest: o.envelopeDigest && o.envelopeDigest !== "none — nothing was opened or signed" ? o.envelopeDigest : undefined };
  };

const hashHex = async (t: string) => pureSha256(t);

/** Run the group session. Honest edges: a crossing with no seam fails named. */
export async function runGroupSession(sessionId: string, opts: GroupRunOptions, _at = Date.now()): Promise<{ answered: number; failed: number; refused: number }> {
  const s = sessions.get(sessionId);
  if (!s) throw new Error("no such group session");
  if (s.refusal) return { answered: 0, failed: 0, refused: 0 };
  const out = { answered: 0, failed: 0, refused: 0 };

  const runItem = async (item: GroupItem): Promise<void> => {
    if (s.status === "failed") return;
    if (item.status === "refused") { out.refused += 1; return; }
    if (item.status !== "queued") return; // gated stays gated
    item.status = "active";
    record(s.feed, "member-admitted", `${item.kind} item started — ${item.kind === "local" ? (item.specialistId ?? "local") : `${item.capability} → ${item.ownerId}`}`, Date.now());
    if (item.kind === "local") {
      const specialist = item.specialistId ? getSpecialist(item.specialistId) : null;
      if (!specialist || !item.specialistId) {
        item.status = "failed";
        item.note = "no specialist matched this slice";
        out.failed += 1;
        record(s.feed, "member-failed", `local item failed — no specialist matched`, Date.now());
        return;
      }
      const run = await runMemberAgent({
        provider: opts.provider, specialist, task: item.task,
        systemBase: buildSpecialistPrompt(specialist), fetchImpl: opts.fetchImpl,
        hash: hashHex, maxSteps: opts.maxSteps,
      });
      const lotus = compressToolOutput(run.text, "auto", Date.now());
      noteLotus(lotus, Date.now());
      if (run.ok) {
        item.status = "answered";
        item.answerPreview = lotus.text.slice(0, 260);
        item.digest = await hashHex(JSON.stringify({ v: "si-group-item/1", item: item.itemId, text: run.text, bew: run.bew }));
        out.answered += 1;
        record(s.feed, "member-answered", `local item answered · ${specialist.name} · ${run.latencyMs}ms · receipt ${item.digest.slice(0, 12)}`, Date.now());
      } else {
        item.status = "failed";
        item.note = `${run.errorKind}: ${run.error}`;
        out.failed += 1;
        const bench = scanDomains(item.task);
        const alt = selectCrewV2(item.task, bench).crew[1];
        if (alt) {
          item.note = `${item.note} — the next specialist (${alt.id}) is staged; muster again to retry`;
          record(s.feed, "member-reassigned", reassignLine(specialist.id, alt.id, specialist.category), Date.now());
        } else {
          record(s.feed, "escalated", escalateLine(specialist.id, specialist.category, item.task.slice(0, 60)), Date.now());
        }
      }
      return;
    }
    // crossing item
    if (!opts.cross) {
      item.status = "failed";
      item.note = "no crossing seam on this side — issue a standing grant in the federation panel, then muster again";
      out.failed += 1;
      record(s.feed, "escalated", `crossing failed — no seam wired; nothing was signed, nothing left this machine`, Date.now());
      return;
    }
    const res = await opts.cross(item);
    if (res.ok) {
      item.status = "answered";
      item.note = res.detail;
      item.digest = res.digest ?? (await hashHex(JSON.stringify({ v: "si-group-item/1", item: item.itemId, detail: res.detail })));
      out.answered += 1;
      record(s.feed, "member-answered", `crossing answered · ${item.capability} → ${item.ownerId} · receipt ${(item.digest ?? "").slice(0, 12)}`, Date.now());
    } else {
      item.status = "failed";
      item.note = res.detail;
      out.failed += 1;
      record(s.feed, "member-failed", `crossing failed — ${res.detail}`, Date.now());
    }
  };

  for (const item of [...s.items]) await runItem(item);

  const answered = s.items.filter((i) => i.status === "answered").length;
  if (answered > 0 || s.items.every((i) => i.status === "refused" || i.status === "answered" || i.status === "failed")) {
    s.status = answered > 0 ? "done" : s.items.some((i) => i.status === "failed") ? "failed" : "done";
  }
  s.sessionReceipt = await hashHex(JSON.stringify({
    v: "si-group-session/1", charter: s.charterId, task: s.task,
    items: s.items.map((i) => ({ itemId: i.itemId, kind: i.kind, status: i.status, digest: i.digest ?? null })),
  }));
  record(s.feed, "crew-done",
    `${brief({ total: s.items.length, answered, failed: out.failed, reassigned: 0, gated: s.items.filter((i) => i.status === "gated").length, escalated: s.items.filter((i) => i.status === "escalated").length }, s.status)} session receipt ${s.sessionReceipt.slice(0, 12)}`,
    Date.now());
  return out;
}

export function groupBriefing(s: GroupSession): string {
  return brief({
    total: s.items.length,
    answered: s.items.filter((i) => i.status === "answered").length,
    failed: s.items.filter((i) => i.status === "failed").length,
    reassigned: 0,
    gated: s.items.filter((i) => i.status === "gated").length,
    escalated: s.items.filter((i) => i.status === "escalated").length,
  }, s.status);
}
