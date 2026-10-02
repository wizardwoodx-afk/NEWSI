/**
 * FEDERATION · SIGIL — the Face, redesigned (19.6 "Federation").
 *
 * WHAT THIS IS, AND WHAT IT REFUSES TO BE.
 *
 * The genre's default is a face you can SHOP FOR: a gallery of options, a
 * colour picker, a "new set" button. That is a costume, and a costume is an
 * impersonation surface — if two people can wear the same face, the face
 * carries no weight, and if a user can re-roll their identity at will, the
 * face cannot be evidence of anything. (The avatar-impersonation literature
 * makes the same point from the other side: user-selectable appearance is the
 * substrate that makes identity abuse cheap.)
 *
 * So the sigil is DERIVED and NOT SELECTABLE:
 *
 *     identity string ──► SHA-256 (the selfimpulse's own pureSha256)
 *                              │
 *                              ├─ field, division, semé, chief, bordure
 *                              ├─ charge, count, tincture, ground, tilt
 *                              └─ fingerprint band (readable, 4 × 4 hex)
 *
 *   • SAME INPUT, SAME FACE — every run, every machine, forever.
 *   • NO PICKER. There is no "new set". The only way to change a sigil is to
 *     change the identity it is derived from, which is a real act.
 *   • THE TINCTURE IS NOT A PREFERENCE. Colour comes from the identity's own
 *     material, so a face's colour is as falsifiable as the string it came
 *     from — and it is drawn strictly from VH's pinned palette, never a new
 *     "AI gimmick" hue.
 *   • NO EYES AND NO MOUTH. This is a heraldic device — a charged field, a
 *     division, a charge — not a mascot. Charges are arranged in fess or in
 *     bend, never two-above-one-below: the classic "two eyes and a mouth"
 *     arrangement is refused by construction. Status rides a CREST above the
 *     field and a VERDICT SEAL over it, so the field never emotes.
 *   • DISTINCTNESS IS MEASURED, NOT ASSERTED. `sigilDistance` encodes the
 *     discrete layers as 23 bits and `collisionReport` returns the CLOSEST
 *     pair plus the true exact-collision count in a sample — because a face
 *     that is unique "on average" is a face that collides in production. A
 *     sigil is a RECOGNITION aid: the fingerprint is a label and the key is
 *     the proof.
 *
 * The existing `avatarEngine.ts` + `avatar.tsx` (19.5.0 "The Face") render a
 * gem with eyes; they stay exactly where they are. The sigil is a second
 * language of the same product — used where a face must be an identity mark
 * rather than a portrait — and both are derived, both deterministic, both
 * offline.
 *
 * Runtime-agnostic: pure data + SVG strings. No React, no DOM, no network, so
 * the offline probe pack renders a sigil with zero install.
 */
import { pureSha256 } from "../pureHash";
import { AVATAR_FIELDS, AVATAR_INKS } from "../avatarEngine";

/* ── the palette is FIXED ───────────────────────────────────────────────────
   Four achromatic inks and six chromatic tinctures, every one an existing VH
   token — the avatar inks, plus the atelier accents already in the CSS. The
   probe asserts membership, so a future edit cannot smuggle in a hue the
   system does not own. */

export const PINNED_PALETTE = [
  ...AVATAR_INKS,
  ...AVATAR_FIELDS,
  "#7c4a55", // atelier wine
  "#b75346", // atelier brick
  "#c98a62", // atelier brass
  "#a5673b", // atelier clay
  "#dda97f", // atelier sand
  "#7a6b3a", // atelier olive
  "#9cafc7", // atelier steel
] as const;

export const SIGIL_TINCTURES = {
  iron: "#2d3142",
  slate: "#3a3f52",
  verdigris: "#586a66",
  moss: "#46554f",
  plum: "#827278",
  wine: "#7c4a55",
  brick: "#b75346",
  brass: "#c98a62",
  clay: "#a5673b",
  olive: "#7a6b3a",
  steel: "#9cafc7",
  sand: "#dda97f",
} as const;

export type TinctureName = keyof typeof SIGIL_TINCTURES;

export type FieldShape = "heater" | "lozenge" | "rondel";
export type Division = "plain" | "bend" | "chevron" | "pale";
export type Seme = "none" | "dots" | "barry" | "lozengy";
export type Chief = "none" | "label" | "wall";
/** Deliberately no chevronel: a pair of small chevrons reads as a smile. */
export type Charge = "cross" | "saltire" | "roundel" | "lozenge" | "estoile" | "pile" | "mullet";
export type Bordure = "none" | "engrailed" | "double";

/** The ground the field sits on — VH's own tonal set, so a sigil never shouts. */
export const SIGIL_GROUNDS = {
  paper: "#f7f5f1",
  mist: "#e2e6ed",
  ash: "#d8d5db",
  pale: "#d5dfea",
} as const;

export type GroundName = keyof typeof SIGIL_GROUNDS;

/** Only these three are trialled, so a "tilt" is never a wobble. */
export const SIGIL_TILTS = [-5, 0, 5] as const;

export interface Sigil {
  /** The identity this was derived from — kept so the face is reproducible, not asserted. */
  seed: string;
  field: FieldShape;
  division: Division;
  seme: Seme;
  chief: Chief;
  charge: Charge;
  chargeCount: 1 | 2 | 3;
  tincture: TinctureName;
  ground: GroundName;
  bordure: Bordure;
  tilt: number;
  /** 4 groups of 4 hex — the visual handle, deliberately NOT a security claim. */
  fingerprint: string;
}

const FIELDS: FieldShape[] = ["heater", "lozenge", "rondel"];
const DIVISIONS: Division[] = ["plain", "bend", "chevron", "pale"];
const SEMES: Seme[] = ["none", "dots", "barry", "lozengy"];
const CHIEFS: Chief[] = ["none", "label", "wall"];
const CHARGES: Charge[] = ["cross", "saltire", "roundel", "lozenge", "estoile", "pile", "mullet"];
const BORDURES: Bordure[] = ["none", "engrailed", "double"];
const TINCTURE_NAMES = Object.keys(SIGIL_TINCTURES) as TinctureName[];
const GROUND_NAMES = Object.keys(SIGIL_GROUNDS) as GroundName[];

/** Blend a hex toward the paper tone. Used for the field wash and nothing else. */
export function wash(hex: string, amount: number, base = "#f7f5f1"): string {
  const parse = (h: string) => [1, 3, 5].map((i) => Number.parseInt(h.slice(i, i + 2), 16));
  const [r1, g1, b1] = parse(hex);
  const [r2, g2, b2] = parse(base);
  const k = Math.min(1, Math.max(0, amount));
  const to = (a: number, b: number) => Math.round(a * k + b * (1 - k));
  const hex2 = (n: number) => n.toString(16).padStart(2, "0");
  return `#${hex2(to(r1 ?? 0, r2 ?? 0))}${hex2(to(g1 ?? 0, g2 ?? 0))}${hex2(to(b1 ?? 0, b2 ?? 0))}`;
}

/**
 * Read the derivation bytes out of the identity's SHA-256. Using the selfimpulse's
 * own `pureSha256` (byte-identical to node:crypto, probe-pinned) rather than a
 * second RNG means a sigil can be re-derived by anyone who has the identity
 * string — including a counterparty checking a face they were shown.
 */
function deriveBytes(seed: string): number[] {
  const hex = pureSha256(`vh.fed.sigil.v1:${seed}`);
  const out: number[] = [];
  for (let i = 0; i < hex.length; i += 2) out.push(Number.parseInt(hex.slice(i, i + 2), 16));
  return out;
}

/** Identity string → sigil. The whole face comes from these 32 bytes. */
export function sigilOf(seed: string): Sigil {
  const b = deriveBytes(seed);
  const at = (i: number) => b[i % b.length] ?? 0;
  return {
    seed,
    field: FIELDS[at(0) % FIELDS.length] ?? "heater",
    division: DIVISIONS[at(1) % DIVISIONS.length] ?? "plain",
    seme: SEMES[at(2) % SEMES.length] ?? "none",
    chief: CHIEFS[at(3) % CHIEFS.length] ?? "none",
    charge: CHARGES[at(4) % CHARGES.length] ?? "cross",
    chargeCount: ((at(5) % 3) + 1) as 1 | 2 | 3,
    tincture: TINCTURE_NAMES[at(6) % TINCTURE_NAMES.length] ?? "iron",
    ground: GROUND_NAMES[at(7) % GROUND_NAMES.length] ?? "paper",
    bordure: BORDURES[at(8) % BORDURES.length] ?? "none",
    tilt: SIGIL_TILTS[at(9) % SIGIL_TILTS.length] ?? 0,
    fingerprint: fingerprintOf(seed),
  };
}

/**
 * The readable handle a person can compare by eye: four groups of four hex,
 * from the same digest. It is a LABEL, not a proof — and the UI says so.
 */
export function fingerprintOf(seed: string): string {
  const hex = pureSha256(`vh.fed.sigil.handle.v1:${seed}`).toUpperCase();
  return [hex.slice(0, 4), hex.slice(4, 8), hex.slice(8, 12), hex.slice(12, 16)].join("-");
}

/** The face described in words, so it can be read aloud in a room. */
export function sigilTraits(s: Sigil): string[] {
  return [
    `${s.field} field`,
    s.division === "plain" ? "undivided" : `${s.division} division`,
    s.seme === "none" ? "plain ground" : `semé of ${s.seme}`,
    s.chief === "none" ? "no chief" : `chief of ${s.chief}`,
    `${s.charge}${s.chargeCount > 1 ? ` ×${s.chargeCount}` : ""}`,
    `${s.tincture} charge`,
    s.bordure === "none" ? "unbordered" : `${s.bordure} bordure`,
    `on ${s.ground}`,
    s.tilt === 0 ? "upright" : s.tilt < 0 ? "tilted left" : "tilted right",
  ];
}

/** One line, for a chip or a title attribute. */
export function sigilSummary(s: Sigil): string {
  return sigilTraits(s).join(" · ");
}

/* ── distance: the honest way to claim faces are different ──────────────────
   The encoding is SIGIL_ENCODING_BITS wide, across ten independent layers:
   field(2) division(2) seme(2) chief(2) charge(3) count(2) tincture(4)
   ground(2) bordure(2) tilt(2). Hamming distance over those bits measures how
   many independent decisions two faces differ in — a RECOGNITION measure, not
   a security claim. Nothing in this file, or in a doc that describes it, may
   hardcode the width: read this constant, because a sheet that says "22" while
   the code encodes 23 is exactly the kind of quiet lie this release removes. */
export const SIGIL_ENCODING_BITS = 23;

/** What each layer means, in the order the bits are packed. */
export const SIGIL_LAYERS = [
  "field", "division", "seme", "chief", "charge", "charge count",
  "tincture", "ground", "bordure", "tilt",
] as const;

export function sigilBits(s: Sigil): number {
  const idx = <T,>(list: readonly T[], v: T) => Math.max(0, list.indexOf(v));
  return (
    (idx(FIELDS, s.field) << 21)
    | (idx(DIVISIONS, s.division) << 19)
    | (idx(SEMES, s.seme) << 17)
    | (idx(CHIEFS, s.chief) << 15)
    | (idx(CHARGES, s.charge) << 12)
    | ((s.chargeCount - 1) << 10)
    | (idx(TINCTURE_NAMES, s.tincture) << 6)
    | (idx(GROUND_NAMES, s.ground) << 4)
    | (idx(BORDURES, s.bordure) << 2)
    | idx(SIGIL_TILTS as readonly number[], s.tilt)
  );
}

function popcount(x: number): number {
  let n = 0;
  let v = x;
  while (v > 0) {
    n += v & 1;
    v >>= 1;
  }
  return n;
}

export function sigilDistance(a: Sigil, b: Sigil): number {
  return popcount(sigilBits(a) ^ sigilBits(b));
}

export interface CollisionReport {
  sample: number;
  /** The closest pair found — never an average, because an average hides the one embarrassing pair. */
  minDistance: number;
  closest: { a: string; b: string } | null;
  /** How wide the encoding is, so no caller has to hardcode it. */
  bits: number;
  /** How many distinct encodings the sample produced. */
  distinct: number;
  /** Identities that encoded IDENTICALLY — reported, not smoothed over. */
  exactCollisions: number;
  /** Share of sampled pairs differing in at least 6 bits. */
  shareWellSeparated: number;
}

/**
 * The measurement behind every claim about this system's faces. It reports the
 * true numbers — including exact collisions — because a face that is unique
 * "on average" is a face that collides in production.
 */
export function collisionReport(seeds: readonly string[]): CollisionReport {
  let min = Number.POSITIVE_INFINITY;
  let closest: { a: string; b: string } | null = null;
  const bits = seeds.map((s) => sigilBits(sigilOf(s)));
  const buckets = new Set<number>();
  for (const b of bits) buckets.add(b);
  let wellSeparated = 0;
  let pairs = 0;
  for (let i = 0; i < bits.length; i++) {
    for (let j = i + 1; j < bits.length; j++) {
      pairs += 1;
      const d = popcount((bits[i] ?? 0) ^ (bits[j] ?? 0));
      if (d < min) {
        min = d;
        closest = { a: seeds[i] ?? "", b: seeds[j] ?? "" };
      }
      if (d >= 6) wellSeparated += 1;
    }
  }
  return {
    sample: seeds.length,
    bits: SIGIL_ENCODING_BITS,
    minDistance: Number.isFinite(min) ? min : 0,
    closest,
    distinct: buckets.size,
    exactCollisions: seeds.length - buckets.size,
    shareWellSeparated: pairs === 0 ? 1 : wellSeparated / pairs,
  };
}

/* ── rendering ──────────────────────────────────────────────────────────────
   Pure SVG strings. State changes the CREST; a verdict changes the SEAL. The
   field itself never emotes. */

export type SigilState = "idle" | "thinking" | "acting" | "gate" | "sealed" | "refused" | "failed";

/**
 * The states, in the order a sheet should show them: at rest, working, acting,
 * waiting on a person, sealed by a decision, refused by the selfimpulse, broken in
 * flight. `refused` and `failed` are different facts and VH never conflates
 * them — one is a decision, the other is a fault — so they are different marks.
 * Single source of truth: the sheet, the montage and the UI all read this.
 */
export const SIGIL_STATES: readonly SigilState[] = ["idle", "thinking", "acting", "gate", "sealed", "refused", "failed"];

export const SIGIL_STATE_WORDS: Record<SigilState, string> = {
  idle: "at rest",
  thinking: "working",
  acting: "acting",
  gate: "awaiting a human",
  sealed: "verified",
  refused: "refused",
  failed: "failed — the run broke",
};

const INK = "#26231d";

const FIELD_PATHS: Record<FieldShape, string> = {
  heater: "M 16 22 H 84 V 58 C 84 76 68 88 50 94 C 32 88 16 76 16 58 Z",
  lozenge: "M 50 16 L 86 56 L 50 94 L 14 56 Z",
  rondel: "M 16 24 H 84 V 50 A 34 34 0 0 1 50 92 A 34 34 0 0 1 16 50 Z",
};

/** An inset copy of the field, for borderings. */
function insetPath(field: FieldShape, inset: number): string {
  const s = 100 - inset * 2;
  const cx = 50;
  const k = s / 100;
  const scale = (d: string) =>
    d.replace(/(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)/g, (_m, x: string, y: string) =>
      `${(cx + (Number(x) - cx) * k).toFixed(1)} ${(cx + (Number(y) - cx) * k).toFixed(1)}`);
  return scale(FIELD_PATHS[field]);
}

function divisionPath(division: Division): string | null {
  switch (division) {
    case "plain": return null;
    case "bend": return "M -20 84 L -20 60 L 120 16 L 120 40 Z";
    case "chevron": return "M -10 74 L 50 40 L 110 74 L 110 54 L 50 20 L -10 54 Z";
    case "pale": return "M 41 0 H 59 V 100 H 41 Z";
  }
}

/**
 * A semé is a GROUND, and a ground with three charges on it is not a device,
 * it is a speckle. Rule: a semé is drawn only under a single charge (or under
 * no charge at all). Rendered and looked at, `dots` behind three roundels was
 * unreadable at every size — the eye cannot tell the ground from the figure.
 */
function semeMarkup(seme: Seme, tincture: string, chargeCount: 1 | 2 | 3): string {
  if (seme === "none" || chargeCount > 1) return "";
  const parts: string[] = [];
  if (seme === "dots") {
    for (let y = 14; y < 94; y += 15) {
      const offset = ((y / 15) | 0) % 2 === 0 ? 0 : 7;
      for (let x = 12; x < 94; x += 15) {
        parts.push(`<circle cx="${(x + offset).toFixed(1)}" cy="${y}" r="1.5" fill="${tincture}" opacity="0.38"/>`);
      }
    }
  } else if (seme === "barry") {
    for (let y = 12; y < 96; y += 18) {
      parts.push(`<rect x="-10" y="${y}" width="120" height="3" fill="${tincture}" opacity="0.26"/>`);
    }
  } else {
    for (let y = 14; y < 94; y += 20) {
      const offset = ((y / 20) | 0) % 2 === 0 ? 0 : 10;
      for (let x = 12; x < 94; x += 20) {
        const px = x + offset;
        parts.push(`<path d="M ${px} ${y - 4} L ${px + 4} ${y} L ${px} ${y + 4} L ${px - 4} ${y} Z" fill="${tincture}" opacity="0.3"/>`);
      }
    }
  }
  return parts.join("");
}

/** A bordure hugs the field exactly — drawn on the field path, never near it. */
function bordureMarkup(bordure: Bordure, field: FieldShape, tincture: string): string {
  if (bordure === "none") return "";
  const path = insetPath(field, 5);
  if (bordure === "double") {
    return `<path d="${path}" fill="none" stroke="${tincture}" stroke-width="1.8" opacity="0.75"/>`;
  }
  return `<path d="${path}" fill="none" stroke="${tincture}" stroke-width="3" stroke-dasharray="1.6 4.4" stroke-linecap="round" opacity="0.85"/>`;
}

function chiefMarkup(chief: Chief, tincture: string): string {
  if (chief === "none") return "";
  if (chief === "label") {
    const tabs = [34, 50, 66]
      .map((x) => `<path d="M ${x - 5} 30 h 10 v 7 l -5 -3.5 l -5 3.5 Z" fill="${tincture}"/>`)
      .join("");
    return `<rect x="14" y="24" width="72" height="7" fill="${tincture}"/>${tabs}`;
  }
  const castellations = [22, 38, 54, 70]
    .map((x) => `<rect x="${x}" y="24" width="7" height="8" fill="#f7f5f1"/>`)
    .join("");
  return `<rect x="14" y="24" width="72" height="8" fill="${tincture}"/>${castellations}`;
}

/** One charge, centred on (cx, cy) with radius r. */
function chargeMarkup(charge: Charge, cx: number, cy: number, r: number, fill: string): string {
  switch (charge) {
    case "cross": {
      const a = r * 0.3;
      return `<path d="M ${cx - a} ${cy - r} h ${a * 2} v ${r - a} h ${r - a} v ${a * 2} h ${-(r - a)} v ${r - a} h ${-(a * 2)} v ${-(r - a)} h ${-(r - a)} v ${-(a * 2)} h ${r - a} Z" fill="${fill}"/>`;
    }
    case "saltire":
      return `<path d="M ${cx - r} ${cy - r * 0.55} L ${cx - r * 0.72} ${cy - r} L ${cx + r} ${cy + r * 0.55} L ${cx + r * 0.72} ${cy + r} Z M ${cx + r} ${cy - r * 0.55} L ${cx + r * 0.72} ${cy - r} L ${cx - r} ${cy + r * 0.55} L ${cx - r * 0.72} ${cy + r} Z" fill="${fill}"/>`;
    case "roundel":
      return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}"/>`;
    case "lozenge":
      return `<path d="M ${cx} ${cy - r} L ${cx + r * 0.7} ${cy} L ${cx} ${cy + r} L ${cx - r * 0.7} ${cy} Z" fill="${fill}"/>`;
    case "estoile": {
      const pts: string[] = [];
      for (let i = 0; i < 12; i++) {
        const ang = (i / 12) * Math.PI * 2 - Math.PI / 2;
        const rr = i % 2 === 0 ? r : r * 0.44;
        pts.push(`${(cx + Math.cos(ang) * rr).toFixed(2)},${(cy + Math.sin(ang) * rr).toFixed(2)}`);
      }
      return `<polygon points="${pts.join(" ")}" fill="${fill}"/>`;
    }
    case "pile":
      return `<path d="M ${cx - r} ${cy + r * 0.7} L ${cx} ${cy - r} L ${cx + r} ${cy + r * 0.7} Z" fill="${fill}"/>`;
    case "mullet": {
      const pts: string[] = [];
      for (let i = 0; i < 10; i++) {
        const ang = (i / 10) * Math.PI * 2 - Math.PI / 2;
        const rr = i % 2 === 0 ? r : r * 0.46;
        pts.push(`${(cx + Math.cos(ang) * rr).toFixed(2)},${(cy + Math.sin(ang) * rr).toFixed(2)}`);
      }
      return `<polygon points="${pts.join(" ")}" fill="${fill}"/>`;
    }
  }
}

/**
 * Charge arrangement — and the one arrangement this system REFUSES.
 *
 *   one  → a single charge, centred (a coin, a cross, a star)
 *   two  → stacked in PALE, i.e. vertically, as a column
 *   three→ in BEND, i.e. diagonally
 *
 * The first draft put two charges side by side at eye height. Rendered and
 * looked at, that is two eyes on a shield — the mascot face this whole design
 * exists to avoid, and it was most obvious at 16–32 px where it read as a tiny
 * smiley. A horizontal pair is therefore not a layout option: `chargesMarkup`
 * has no code path that draws two charges on the same row, and the probe
 * asserts it.
 */
function chargesMarkup(s: Sigil, fill: string): string {
  if (s.chargeCount === 1) return chargeMarkup(s.charge, 50, 60, 16, fill);
  if (s.chargeCount === 2) {
    return chargeMarkup(s.charge, 50, 45, 11, fill) + chargeMarkup(s.charge, 50, 74, 11, fill);
  }
  return (
    chargeMarkup(s.charge, 32, 78, 9.5, fill)
    + chargeMarkup(s.charge, 50, 60, 9.5, fill)
    + chargeMarkup(s.charge, 68, 42, 9.5, fill)
  );
}

/** Centres of each charge, exposed so the arrangement itself can be probed. */
export function chargeCentres(s: Pick<Sigil, "chargeCount">): Array<[number, number]> {
  if (s.chargeCount === 1) return [[50, 60]];
  if (s.chargeCount === 2) return [[50, 45], [50, 74]];
  return [[32, 78], [50, 60], [68, 42]];
}

/** The crest carries status — deliberately above the field, never a facial expression. */
function crestMarkup(state: SigilState, tincture: string): string {
  /* One reading per state, drawn boldly enough to survive a 24px avatar.
     Two same-shaped marks over two different states is a defect, not a
     subtlety: `thinking` and `gate` in the first draft were both "two thin
     vertical lines" and nobody could tell them apart. */
  switch (state) {
    case "idle":
      return "";
    case "thinking":
      return `<g fill="${tincture}" opacity="0.9"><circle cx="38" cy="8" r="3.1"/><circle cx="50" cy="8" r="3.1"/><circle cx="62" cy="8" r="3.1"/></g>`;
    case "acting":
      return `<path d="M 39 1.8 L 63 8 L 39 14.2 Z" fill="${tincture}"/>`;
    case "gate":
      return `<g opacity="0.92"><path d="M 44 7 V 4.8 a 6 6 0 0 1 12 0 V 7" fill="none" stroke="${tincture}" stroke-width="2.2" stroke-linecap="round"/><rect x="39" y="6.6" width="22" height="7.4" rx="1.7" fill="${tincture}"/></g>`;
    case "sealed":
      return "";
    case "refused":
      return "";
    case "failed":
      /* Not a refusal. A refusal is the selfimpulse deciding; this is a run that
         broke mid-flight, and the mark differs on purpose. */
      return `<g stroke="${tincture}" stroke-width="2.8" stroke-linecap="round" opacity="0.92"><path d="M 42 3 L 58 15"/><path d="M 58 3 L 42 15"/></g>`;
  }
}

export interface SigilRenderOptions {
  size?: number;
  state?: SigilState;
  /** Override the ground. Defaults to the ground the identity derived. */
  ground?: string;
  title?: string;
}

/**
 * The sigil as an SVG string. The field is a WASH of the identity's tincture
 * and the charges carry it at full strength, which is what makes two faces
 * tell apart at a glance while staying inside VH's muted light palette.
 * `role="img"` plus an aria-label that reads the face out in words, so a
 * screen reader is told the identity, its description and its state.
 */
export function sigilSvg(s: Sigil, opts: SigilRenderOptions = {}): string {
  const size = opts.size ?? 96;
  const state = opts.state ?? "idle";
  const ground = opts.ground ?? SIGIL_GROUNDS[s.ground];
  const tincture = SIGIL_TINCTURES[s.tincture];
  const clipId = `sigil-${s.fingerprint.replace(/-/g, "")}`;
  const field = FIELD_PATHS[s.field];
  const division = divisionPath(s.division);
  const label = opts.title ?? `sigil ${s.fingerprint} — ${sigilSummary(s)} — ${SIGIL_STATE_WORDS[state]}`;
  const body = [
    `<defs><clipPath id="${clipId}"><path d="${field}"/></clipPath></defs>`,
    crestMarkup(state, tincture),
    `<g transform="rotate(${s.tilt} 50 56)">`,
    `<path d="${field}" fill="${wash(tincture, 0.2, ground)}" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round"/>`,
    `<g clip-path="url(#${clipId})">`,
    division ? `<path d="${division}" fill="${tincture}" opacity="0.2"/>` : "",
    semeMarkup(s.seme, tincture, s.chargeCount),
    chiefMarkup(s.chief, tincture),
    chargesMarkup(s, tincture),
    bordureMarkup(s.bordure, s.field, tincture),
    state === "refused" ? `<path d="M 2 90 L 98 22" stroke="${tincture}" stroke-width="4.5" stroke-linecap="round" opacity="0.9"/>` : "",
    `</g>`,
    `<path d="${field}" fill="none" stroke="${INK}" stroke-width="${state === "sealed" ? 4 : 2.4}" stroke-linejoin="round"/>`,
    `</g>`,
    state === "sealed"
      ? `<g><circle cx="82" cy="88" r="9" fill="${ground}" stroke="${tincture}" stroke-width="2.2"/><path d="M 78 88 l 2.6 2.8 l 5 -6" stroke="${tincture}" stroke-width="2.2" fill="none" stroke-linecap="round"/></g>`
      : "",
  ].join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="${size}" height="${size}" role="img" aria-label="${label}" class="si-sigil si-sigil--${state}">${body}</svg>`;
}

/**
 * The identity card: face, fingerprint, and the traits in words. This is the
 * affordance that replaces a picker — instead of "choose your look", the card
 * says what your look IS, and that it was derived from your identity.
 */
export function sigilCardHtml(s: Sigil, opts: { state?: SigilState; size?: number } = {}): string {
  const traits = sigilTraits(s)
    .map((t) => `<li>${t}</li>`)
    .join("");
  return [
    `<figure class="si-sigil-card">`,
    sigilSvg(s, { size: opts.size ?? 96, state: opts.state ?? "idle" }),
    `<figcaption><code>${s.fingerprint}</code><ul>${traits}</ul></figcaption>`,
    `</figure>`,
  ].join("");
}
