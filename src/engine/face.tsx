/**
 * VH FACE SYSTEM — 19.6.6 (the naming redesign).
 *
 * ONE GENERALIST, ONE FACE. The Generalist's face is a pure, deterministic
 * function of the name the OWNER gives their Generalist. Rename it and the
 * face changes; keep the name and the face is the same across the door, the
 * sidebar and every session — nothing stored, nothing uploaded. The face
 * renderer is a declared dependency; its license rides the package manifest,
 * never the UI.
 *
 * EVERY SPECIALIST, ITS OWN FACE. Routed specialists ride a deterministic
 * mark renderer keyed by specialist id — the same id always renders the same
 * mark, so a crew card is recognisable across runs.
 *
 * Moods are honest: they map run states to expressions, and the mapping is
 * complete over the GeneralistMood contract — a mood with no face is a
 * probe failure, not a silent blank.
 */
import React from "react";
import { Blobatar, type BlobatarProps } from "@blobatar/react";
import { idle, thinking, happy, unsure, smug, sad, type Expression } from "blobatar/expression";
// NOTE: the face motion sheet is imported by main.tsx (app layer). This module
// must stay loadable under plain Node — the probes import it directly.
import BoringAvatar from "boring-avatars";

export type GeneralistMood = "idle" | "thinking" | "acting" | "gate" | "sealed" | "refused";

export const MOOD_EXPRESSION: Record<GeneralistMood, Expression> = {
  idle,
  thinking,
  acting: happy,   // a live run: the face is quietly pleased, not neutral
  gate: unsure,
  sealed: smug,
  refused: sad,
};

export const MOOD_CAPTION: Record<GeneralistMood, string> = {
  idle: "idle — listening",
  thinking: "thinking — reasoning over the run",
  acting: "acting — tools in flight",
  gate: "gate — paused for your decision",
  sealed: "sealed — receipted and closed",
  refused: "refused — stated why, nothing hidden",
};

/* ── the Generalist's name is the owner's, stored locally, defaulted once ── */
const NAME_KEY = "vh.generalist.name.v1";
export const DEFAULT_GENERALIST_NAME = "Captain";

export function generalistName(): string {
  try {
    return globalThis.localStorage?.getItem(NAME_KEY) || DEFAULT_GENERALIST_NAME;
  } catch {
    return DEFAULT_GENERALIST_NAME;
  }
}

export function setGeneralistName(name: string): string {
  const clean = name.trim().slice(0, 48) || DEFAULT_GENERALIST_NAME;
  try {
    globalThis.localStorage?.setItem(NAME_KEY, clean);
  } catch {
    /* no storage ⇒ the name lives for this session only; stated, not hidden */
  }
  return clean;
}

/** The Generalist's one face — a pure function of the owner-chosen name. */
export function GeneralistFace(props: {
  mood?: GeneralistMood;
  name?: string;
  size?: number;
  animate?: boolean;
}): React.ReactElement {
  const mood = props.mood ?? "idle";
  const name = props.name ?? generalistName();
  const faceProps = {
    name,
    size: props.size ?? 40,
    expression: MOOD_EXPRESSION[mood],
    animate: props.animate === false ? false : "hover",
    background: "squircle",
    title: `${name} — ${MOOD_CAPTION[mood]}`,
  } as BlobatarProps;
  return React.createElement(Blobatar, faceProps);
}

/** A specialist's mark — deterministic per specialist id, recognisable across runs. */
export function SpecialistFace(props: { id: string; size?: number; square?: boolean }): React.ReactElement {
  return React.createElement(BoringAvatar, {
    name: props.id,
    size: props.size ?? 28,
    variant: "marble",
    square: props.square ?? false,
  });
}
