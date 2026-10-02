/**
 * VH Avatar component — 19.5.0 "The Face" (see avatar.ts for the engine).
 * One identity, one face; states map to real engine moments.
 */
import React from "react";
import { avatarSpec, gemPoints, type AvatarState } from "./avatarEngine";

export interface VhAvatarProps {
  /** Identity seed — user handle, seat id, or "generalist". */
  seed: string;
  name?: string;
  state?: AvatarState;
  size?: number;
}

function eye(cx: number, cy: number, shape: 0 | 1 | 2, ink: string, closed: boolean, key: string): React.ReactElement {
  if (closed) return React.createElement("line", { x1: cx - 5, y1: cy, x2: cx + 5, y2: cy, stroke: ink, strokeWidth: 2, strokeLinecap: "round", key });
  if (shape === 0) return React.createElement("circle", { cx, cy, r: 4.5, fill: ink, key });
  if (shape === 1) return React.createElement("path", { d: `M ${cx} ${cy - 5.5} L ${cx + 5} ${cy} L ${cx} ${cy + 5.5} L ${cx - 5} ${cy} Z`, fill: ink, key });
  return React.createElement("rect", { x: cx - 5.5, y: cy - 2.5, width: 11, height: 5, rx: 1.5, fill: ink, key });
}

export function VhAvatar({ seed, name, state = "idle", size = 44 }: VhAvatarProps): React.ReactElement {
  const spec = avatarSpec(seed);
  const outline = gemPoints(50, 50, 38, spec.facets, spec.tilt).map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const inner = gemPoints(50, 50, 24, spec.facets, spec.tilt + 8).map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const title = name ? `${name} — ${state}` : `avatar — ${state}`;
  const mouth = state === "gate"
    ? React.createElement("path", { d: "M 40 63 Q 50 58 60 63", stroke: spec.accent, strokeWidth: 2.5, fill: "none", strokeLinecap: "round" })
    : state === "refused"
      ? React.createElement("path", { d: "M 40 66 Q 50 70 60 66", stroke: spec.accent, strokeWidth: 2.5, fill: "none", strokeLinecap: "round" })
      : React.createElement("path", { d: "M 41 64 Q 50 69 59 64", stroke: spec.ink, strokeWidth: 2.5, fill: "none", strokeLinecap: "round" });
  return React.createElement(
    "svg",
    { viewBox: "0 0 100 100", width: size, height: size, className: `si-avatar si-avatar--${state}`, role: "img", "aria-label": title },
    React.createElement("polygon", { points: outline, fill: spec.field, stroke: spec.ink, strokeWidth: 2.5, strokeLinejoin: "round" }),
    React.createElement("polygon", { points: inner, fill: "rgba(45,49,66,.07)", stroke: spec.accent, strokeWidth: 1.5, strokeLinejoin: "round", className: "si-avatar__facet" }),
    eye(38, 46, spec.eyeShape, spec.ink, state === "sealed", "L"),
    eye(62, 46, spec.eyeShape, spec.ink, state === "sealed", "R"),
    mouth,
    spec.mark ? React.createElement("circle", { cx: 50, cy: 76, r: 2.5, fill: spec.accent }) : null,
    state === "sealed" ? React.createElement("circle", { cx: 76, cy: 76, r: 9, fill: "none", stroke: "#586a66", strokeWidth: 2, className: "si-avatar__seal" }) : null,
  );
}

export default VhAvatar;
