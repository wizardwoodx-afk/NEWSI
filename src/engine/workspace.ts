/**
 * 11WORKSPACE — the office floor.
 *
 * A multi-team ask ("build an app, connect my internal docs, mail me")
 * is not a chat with 1,500 people. The Captain (CEO) opens the desks the
 * request actually needs; each Adept staffs sub-agents from
 * that desk; HR holds the bench. The workers who walk onto the floor
 * are capped at CREW_MAX (25) by Agentic MoE — that is 25MoE60:
 * 60 domain specialists (Lead+HR), 25 sub-agents active.
 *
 * Autonomous: the only input is the user's request. No picker. No
 * "which team?". Muster is a pure function of (request, org, fleet).
 */
import type { RouteCandidate } from "./types";
import { getSpecialist } from "./registry";
import { tokenize } from "./router";
import { scanDomains, selectCrewV2, CREW_MAX, type CrewSelection } from "./moeV2";
import {
  DESKS, leadFor, hrFor, homeDesk, workersOnDesk, consulForDesk,
  ORG_DESK_COUNT, ORG_SPECIALIST_COUNT, type DeskId, type DeskDef,
} from "./org";
import { TITLES, LayerSkipError } from "./chain";
import { ESTABLISHED_SPECIALISTS } from "./federation/fleet";

export const WORKSPACE_NAME = "11WORKSPACE";
export const FLOOR_CAP = CREW_MAX;
export const DESK_SCORE_MIN = 3;

export interface OfficeDesk {
  id: DeskId;
  label: string;
  /** The Consul directly above this desk's Adept — the rung the Captain briefs through. */
  consul: { id: string; name: string };
  /** The desk's Adept (team lead). */
  lead: { id: string; name: string };
  hr: { id: string; name: string };
  pooled: number;
  onFloor: number;
}

export interface FloorSeat {
  id: string;
  name: string;
  desk: DeskId;
  score: number;
  reasons: string[];
}

export interface ElevenWorkspace {
  name: typeof WORKSPACE_NAME;
  /** Always the Captain (CEO) — the only agent the user talks to. */
  captain: "Captain";
  task: string;
  desks: OfficeDesk[];
  floor: FloorSeat[];
  /** MoE selection this floor was built from — probes pin the cap. */
  selection: CrewSelection;
  considered: number;
  line: string;
}

function scoreDesk(d: DeskDef, tokens: string[], lower: string): number {
  let n = 0;
  for (const kw of d.keywords) {
    if (tokens.includes(kw)) n += 4;
    else if (kw.length >= 4 && lower.includes(kw)) n += 2;
  }
  return n;
}

/**
 * Open the office for this request. Captain is not asked which desks.
 * Workers on the floor are the MoE crew, each seated at their home desk.
 */
export function musterWorkspace(request: string): ElevenWorkspace {
  const tokens = tokenize(request);
  const lower = request.toLowerCase();
  const pool = scanDomains(request);
  const selection = selectCrewV2(request, pool);

  const deskScores = DESKS
    .map((d) => ({ d, score: scoreDesk(d, tokens, lower) }))
    .filter((x) => x.score >= DESK_SCORE_MIN)
    .sort((a, b) => b.score - a.score || a.d.id.localeCompare(b.d.id));

  const floor: FloorSeat[] = [];
  const onFloor = new Map<DeskId, number>();
  for (const c of selection.crew) {
    const s = getSpecialist(c.id);
    if (!s) continue;
    const desk = homeDesk(s);
    onFloor.set(desk, (onFloor.get(desk) ?? 0) + 1);
    floor.push({ id: s.id, name: s.name, desk, score: c.score, reasons: c.reasons });
  }

  /* Desks the MoE seated, plus desks the request named even if a worker
     home-desk didn't land there — still a team in the room, empty floor. */
  const seated = new Set<DeskId>(floor.map((f) => f.desk));
  const involved: DeskDef[] = [];
  const seen = new Set<DeskId>();
  for (const id of seated) {
    const d = DESKS.find((x) => x.id === id);
    if (d && !seen.has(d.id)) { involved.push(d); seen.add(d.id); }
  }
  for (const { d } of deskScores) {
    if (seen.has(d.id)) continue;
    involved.push(d);
    seen.add(d.id);
  }

  const desks: OfficeDesk[] = involved.map((d) => {
    const lead = leadFor(d.id)!;
    const hr = hrFor(d.id)!;
    /* THE NO-SKIP LAW, applied to real data. This desk's reporting line is
       Captain → Consul → Adept → crew. If no Consul owns the desk's domain, the
       Captain would be briefing an Adept directly — a skipped rung — so the desk
       is REFUSED rather than seated quietly. (probe/workspace pins that none of
       the shipped desks can trip this.) */
    const consul = consulForDesk(d.id);
    if (!consul) {
      throw new LayerSkipError("captain", "adept", `the ${d.label} desk has no ${TITLES.consul} above its ${TITLES.adept}`);
    }
    return {
      id: d.id,
      label: d.label,
      consul: { id: consul.id, name: consul.name },
      lead: { id: lead.id, name: lead.name },
      hr: { id: hr.id, name: hr.name },
      pooled: workersOnDesk(d.id).length,
      onFloor: onFloor.get(d.id) ?? 0,
    };
  });

  const consulCount = new Set(desks.map((d) => d.consul.id)).size;
  const line =
    `${WORKSPACE_NAME}: ${TITLES.captain} opened ${desks.length} desk(s) under ${consulCount} ${TITLES.consul}(s) · ` +
    `floor ${floor.length}/${FLOOR_CAP} ${TITLES.crew.toLowerCase()}s of ${ESTABLISHED_SPECIALISTS.length} · ` +
    `${ORG_SPECIALIST_COUNT} domain specialists (${TITLES.adept}+HR) across ${ORG_DESK_COUNT} desks · ` +
    `MoE tier=${selection.gate.tier}. Autonomous — no team was picked by the user.`;

  return {
    name: WORKSPACE_NAME,
    captain: "Captain",
    task: request,
    desks,
    floor,
    selection,
    considered: pool.considered,
    line,
  };
}

/** Route candidates the live Captain path fields — workers only, never Lead/HR ids. */
export function floorAsCrew(office: ElevenWorkspace): RouteCandidate[] {
  return office.floor.map((s) => ({ id: s.id, score: s.score, reasons: s.reasons }));
}

export function officeViewFromMuster(office: ElevenWorkspace): {
  rooms: number;
  occupancy: number;
  cap: number;
  headline: string;
  desks: OfficeDesk[];
} {
  return {
    rooms: office.desks.length,
    occupancy: office.floor.length,
    cap: FLOOR_CAP,
    headline: office.line,
    desks: office.desks,
  };
}

/** Cheap type-guard so UI/probes don't import a circular. */
export function isElevenWorkspace(x: unknown): x is ElevenWorkspace {
  return !!x && typeof x === "object" && (x as ElevenWorkspace).name === WORKSPACE_NAME;
}

export { ORG_DESK_COUNT, ORG_SPECIALIST_COUNT };

/** JSON-safe snapshot that rides the Captain response (Maps cannot). */
export function officeSnapshot(office: ElevenWorkspace): ElevenOfficeSnapshot {
  return {
    name: WORKSPACE_NAME,
    desks: office.desks.map((d) => ({
      id: d.id, label: d.label, consulId: d.consul.id, consul: d.consul.name,
      lead: d.lead.name, hr: d.hr.name,
      pooled: d.pooled, onFloor: d.onFloor,
    })),
    floor: office.floor.map((s) => ({ id: s.id, desk: s.desk, name: s.name })),
    cap: FLOOR_CAP,
    line: office.line,
  };
}

export interface ElevenOfficeSnapshot {
  name: typeof WORKSPACE_NAME;
  desks: Array<{ id: string; label: string; consulId: string; consul: string; lead: string; hr: string; pooled: number; onFloor: number }>;
  floor: Array<{ id: string; desk: string; name: string }>;
  cap: number;
  line: string;
}
