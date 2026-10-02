/**
 * VH Avatar Engine — 19.5.0 "The Face"
 *
 * VH's own procedural geometric avatars: generated deterministically from an
 * identity seed, rendered as pure SVG. No network, no 3D runtime, no
 * dependencies. (Superseded as the product face in 19.6.6 by the deterministic
 * system in ./face; this module remains the federation sigil's geometry.)
 *
 * VH law applied:
 *  - Only the 5-color light system (plus its pinned extensions) — never an
 *    "AI gimmick" palette.
 *  - Deterministic: same identity → same avatar, every run, every machine.
 *    The avatar is a presentation of identity — receipts stay the evidence.
 *  - Honors prefers-reduced-motion; every animation is a whisper.
 */

// ── Palette: the pinned VH light system, nothing else ────────────────────────
export const AVATAR_INKS = ["#2d3142", "#3a3f52", "#586a66", "#46554f", "#827278", "#695c5e"] as const;
export const AVATAR_FIELDS = ["#d8d5db", "#d5dfea", "#e2e6ed", "#c6cdd3"] as const;

/** Mulberry32 — tiny deterministic PRNG seeded from an identity string. */
export function seedRng(seedText: string): () => number {
  let h = 1779033703 ^ seedText.length;
  for (let i = 0; i < seedText.length; i++) {
    h = Math.imul(h ^ seedText.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type AvatarState = "idle" | "thinking" | "acting" | "gate" | "sealed" | "refused";

export interface AvatarSpec {
  /** Number of gem facets on the head (6–10). */
  facets: number;
  /** 0 = circle, 1 = diamond, 2 = bar. */
  eyeShape: 0 | 1 | 2;
  /** Base field tone. */
  field: string;
  /** Primary ink (facets). */
  ink: string;
  /** Accent ink (mark). */
  accent: string;
  /** Rotation offset of the gem (deg). */
  tilt: number;
  /** Whether the user carries a plum mark under the eyes. */
  mark: boolean;
}

/** Deterministic identity → avatar spec. Same seed, same face, forever. */
export function avatarSpec(seed: string): AvatarSpec {
  const rnd = seedRng(seed);
  const facets = 6 + Math.floor(rnd() * 5);
  const eyeShape = Math.floor(rnd() * 3) as 0 | 1 | 2;
  const field = AVATAR_FIELDS[Math.floor(rnd() * AVATAR_FIELDS.length)];
  const ink = AVATAR_INKS[Math.floor(rnd() * AVATAR_INKS.length)];
  const accent = AVATAR_INKS[Math.floor(rnd() * AVATAR_INKS.length)];
  const tilt = Math.floor(rnd() * 30) - 15;
  const mark = rnd() > 0.5;
  return { facets, eyeShape, field, ink, accent, tilt, mark };
}

/** Pure geometry: the head as a faceted gem polygon ring. */
export function gemPoints(cx: number, cy: number, r: number, facets: number, tiltDeg: number): Array<[number, number]> {
  const pts: Array<[number, number]> = [];
  const tilt = (tiltDeg * Math.PI) / 180;
  for (let i = 0; i < facets; i++) {
    const ang = (i / facets) * Math.PI * 2 + tilt;
    const rr = r * (i % 2 === 0 ? 1 : 0.92); // alternate radii → gem cut
    pts.push([cx + Math.cos(ang) * rr, cy + Math.sin(ang) * rr]);
  }
  return pts;
}

