/**
 * Healthcare engines — scores and occupancy arithmetic, never a diagnosis.
 *
 * NEWS2 is the Royal College of Physicians' early-warning score: six
 * physiological parameters, each 0–3, summed. The tool prints the table and
 * the band; it does not name a condition, recommend a drug, or replace a
 * clinician. Bed occupancy is Little's law on a ward: arrivals × length of
 * stay, against named beds. Both are arithmetic a model cannot be trusted
 * to invent, so they live here.
 */
import { num, sel, number, type Tool, type ToolResult } from "./types";

export interface News2Input {
  rr: number;
  spo2: number;
  onOxygen: boolean;
  tempC: number;
  sbp: number;
  hr: number;
  consciousness: "alert" | "voice" | "pain" | "unresponsive";
}

export interface News2Result {
  total: number;
  band: "low" | "low-medium" | "medium" | "high";
  rows: Array<{ param: string; value: string; score: number }>;
}

function bandOf(total: number, anyThree: boolean): News2Result["band"] {
  if (total >= 7) return "high";
  if (total >= 5 || anyThree) return "medium";
  if (total >= 1) return "low-medium";
  return "low";
}

function scoreRr(rr: number): number {
  if (rr <= 8) return 3;
  if (rr <= 11) return 1;
  if (rr <= 20) return 0;
  if (rr <= 24) return 2;
  return 3;
}
function scoreSpo2(spo2: number): number {
  if (spo2 <= 91) return 3;
  if (spo2 <= 93) return 2;
  if (spo2 <= 95) return 1;
  return 0;
}
function scoreTemp(t: number): number {
  if (t <= 35.0) return 3;
  if (t <= 36.0) return 1;
  if (t <= 38.0) return 0;
  if (t <= 39.0) return 1;
  return 2;
}
function scoreSbp(p: number): number {
  if (p <= 90) return 3;
  if (p <= 100) return 2;
  if (p <= 110) return 1;
  if (p <= 219) return 0;
  return 3;
}
function scoreHr(h: number): number {
  if (h <= 40) return 3;
  if (h <= 50) return 1;
  if (h <= 90) return 0;
  if (h <= 110) return 1;
  if (h <= 130) return 2;
  return 3;
}

/** NEWS2 total and band. Scale 1 (SpO2) — not a diagnosis. */
export function news2Score(input: News2Input): News2Result {
  const rows: News2Result["rows"] = [
    { param: "Respiratory rate", value: `${input.rr}/min`, score: scoreRr(input.rr) },
    { param: "SpO₂ (scale 1)", value: `${input.spo2}%`, score: scoreSpo2(input.spo2) },
    { param: "Air or oxygen", value: input.onOxygen ? "oxygen" : "air", score: input.onOxygen ? 2 : 0 },
    { param: "Temperature", value: `${input.tempC.toFixed(1)} °C`, score: scoreTemp(input.tempC) },
    { param: "Systolic BP", value: `${input.sbp} mmHg`, score: scoreSbp(input.sbp) },
    { param: "Heart rate", value: `${input.hr}/min`, score: scoreHr(input.hr) },
    { param: "Consciousness", value: input.consciousness, score: input.consciousness === "alert" ? 0 : 3 },
  ];
  const total = rows.reduce((n, r) => n + r.score, 0);
  const anyThree = rows.some((r) => r.score === 3);
  return { total, band: bandOf(total, anyThree), rows };
}

export interface OccupancyResult {
  occupied: number;
  beds: number;
  occupancyPct: number;
  impliedLosDays: number | null;
  lines: string[];
}

/** Occupancy = occupied / beds. Implied LOS = occupied / arrivals-per-day (Little's law). */
export function bedOccupancy(occupied: number, beds: number, arrivalsPerDay: number): OccupancyResult {
  const occupancyPct = beds <= 0 ? 0 : (occupied / beds) * 100;
  const impliedLosDays = arrivalsPerDay > 0 ? occupied / arrivalsPerDay : null;
  const lines = [
    beds <= 0
      ? "A ward with no named beds cannot have an occupancy — the engine refuses the percentage rather than invent a denominator."
      : `${occupied} of ${beds} beds occupied is ${occupancyPct.toFixed(1)}%.`,
    impliedLosDays === null
      ? "Arrivals per day is zero, so Little's law cannot imply a length of stay."
      : `Little's law: length of stay ≈ occupied / arrivals = ${impliedLosDays.toFixed(2)} days at the current arrival rate.`,
    "This is a census identity, not a clinical forecast. It does not model delayed discharges, boarding, or acuity.",
  ];
  return { occupied, beds, occupancyPct, impliedLosDays, lines };
}

export const HEALTH_TOOLS: Tool[] = [
  {
    id: "news2",
    domain: "health",
    label: "NEWS2",
    blurb: "Royal College of Physicians early-warning score. A number and a band — not a diagnosis.",
    fields: [
      num("rr", "Respiratory rate (/min)", "24"),
      num("spo2", "SpO₂ (%)", "94"),
      sel("oxygen", "Air or oxygen", ["air", "oxygen"], "air"),
      num("temp", "Temperature (°C)", "38.1"),
      num("sbp", "Systolic BP (mmHg)", "95"),
      num("hr", "Heart rate (/min)", "110"),
      sel("avpu", "Consciousness", ["alert", "voice", "pain", "unresponsive"], "alert"),
    ],
    run: (v): ToolResult => {
      const r = news2Score({
        rr: Math.round(number(v, "rr", 24)),
        spo2: Math.round(number(v, "spo2", 94)),
        onOxygen: String(v["oxygen"] ?? "air") === "oxygen",
        tempC: number(v, "temp", 38.1),
        sbp: Math.round(number(v, "sbp", 95)),
        hr: Math.round(number(v, "hr", 110)),
        consciousness: (String(v["avpu"] ?? "alert") as News2Input["consciousness"]),
      });
      return {
        headline: `NEWS2 ${r.total} — ${r.band} (not a diagnosis)`,
        ok: r.band === "low" || r.band === "low-medium",
        kpis: [
          { value: String(r.total), label: "NEWS2 total" },
          { value: r.band, label: "band" },
        ],
        table: { head: ["Parameter", "Value", "Score"], rows: r.rows.map((row) => [row.param, row.value, String(row.score)]) },
        lines: [
          "Bands follow the RCP chart: 0 low, 1–4 low-medium, 5–6 or any single 3 medium, ≥7 high.",
          "This is a track-and-trigger score. It does not name a condition, recommend a treatment, or replace a clinician.",
        ],
        basis: "Royal College of Physicians NEWS2 (scale 1 SpO₂). Each parameter scores 0–3; oxygen adds 2; unresponsive/voice/pain scores 3. The engine prints the table; it does not interpret a cause.",
      };
    },
  },
  {
    id: "bed-occupancy",
    domain: "health",
    label: "Bed occupancy",
    blurb: "Census occupancy and the length of stay Little's law implies — a ward identity, not a forecast.",
    fields: [
      num("occupied", "Beds occupied", "28"),
      num("beds", "Named beds", "32"),
      num("arrivals", "Arrivals / day", "6"),
    ],
    run: (v): ToolResult => {
      const o = bedOccupancy(
        Math.round(number(v, "occupied", 28)),
        Math.round(number(v, "beds", 32)),
        number(v, "arrivals", 6),
      );
      return {
        headline: o.beds <= 0 ? "No named beds — occupancy refused" : `${o.occupancyPct.toFixed(1)}% occupancy` + (o.impliedLosDays !== null ? ` · ${o.impliedLosDays.toFixed(2)} d implied LOS` : ""),
        ok: o.beds > 0 && o.occupancyPct < 92,
        kpis: [
          { value: `${o.occupied}/${o.beds}`, label: "occupied / beds" },
          { value: `${o.occupancyPct.toFixed(1)}%`, label: "occupancy" },
          { value: o.impliedLosDays === null ? "—" : o.impliedLosDays.toFixed(2), label: "implied LOS (days)" },
        ],
        lines: o.lines,
        basis: "occupancy = occupied ÷ named beds; implied length of stay = occupied ÷ arrivals-per-day (Little's law, L = λW). Neither figure is a clinical forecast.",
      };
    },
  },
];
