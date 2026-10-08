import { useEffect, useRef, useState } from "react";

/**
 * THE WORD SELFIMPULSE SPEAKS WHILE A RUN IS IN FLIGHT.
 *
 * A spinner reports that something is busy. It does not report what, and here the
 * what is the whole product: the Captain reads the request, lays out the work the
 * desks will do, counts what it will cost, and puts the result in front of a human
 * who has not said yes yet. These words name that posture.
 *
 * They are deliberately not the stock set. Thinking / Analyzing / Processing /
 * Loading describe a machine with a queue, and this app has a gate instead of one.
 * Two other verbs are missing on purpose — "deciding" and "confirming" — because
 * those belong to the owner, and the gate is exactly where they get used. Nothing
 * here claims a decision the human has not made.
 *
 * Each entry is also something the engine genuinely does, not a mood: it measures
 * cost against the FinOps ledger, it plans before it executes (a run with no
 * provider returns a plan and says so), and it frames the `ask` object that
 * reaches the gate card.
 */
export const VOICE: readonly string[] = [
  "Weighing",
  "Deliberating",
  "Charting the route",
  "Laying the course",
  "Reading ahead",
  "Measuring twice",
  "Counting the cost",
  "Foreseeing",
  "Rehearsing",
  "Sizing the risk",
  "Turning it over",
  "Holding the thread",
  "Framing the ask",
  "Mulling",
  "Staking the path",
];

/** How long a word holds before the run moves on. Slow on purpose: a word that
 *  turns faster than a person reads it is a blinker, and the point of the row is
 *  that the app is taking its time. The floor of the ladder below. */
const STEP_MS = 3_400;

/**
 * THE THINKING LADDER — how far ahead the Captain plans before it speaks.
 *
 * Stated plainly, because the honest answer is that the engine has no depth
 * setting to bind to: `MAX_AGENT_STEPS` is the loop's own ceiling and no owner
 * dial reaches it. So this control does what the composer actually can — it
 * writes the planning line into the request, which is the only lever a composer
 * has over what comes back — and it holds each deliberation word longer at the
 * same time, so the surface takes as long as it asks for. Nothing here claims a
 * deeper plan than the line that was sent.
 *
 * The words are the house's own, taken from the list above: a run that charts
 * the route is being asked to do the thing it already says it is doing.
 */
export interface ThinkingLevel {
  id: "plain" | "route" | "ahead";
  /** The word the chip wears. */
  word: string;
  /** The line composed onto the request. Empty at `plain`, which sends nothing extra. */
  instruction: string;
  /** How long each word of the deliberation row holds at this level. */
  holdMs: number;
}

export const THINKING: readonly ThinkingLevel[] = [
  { id: "plain", word: "Plain", instruction: "", holdMs: STEP_MS },
  { id: "route", word: "Chart", instruction: "Chart the route and count its cost before you answer.", holdMs: STEP_MS * 1.5 },
  { id: "ahead", word: "Read ahead", instruction: "Read three steps ahead, name what could go wrong, then answer.", holdMs: STEP_MS * 2 },
] as const;

const THINKING_KEY = "vh.thinking.v1";

function readThinking(): ThinkingLevel["id"] {
  try {
    const v = globalThis.localStorage?.getItem(THINKING_KEY);
    return THINKING.some((t) => t.id === v) ? (v as ThinkingLevel["id"]) : "plain";
  } catch { return "plain"; }
}

let thinkingId: ThinkingLevel["id"] = readThinking();
const thinkingWatchers = new Set<() => void>();

/** The ladder's current rung — the value both the composer and the word row read. */
export function thinkingLevel(): ThinkingLevel {
  return THINKING.find((t) => t.id === thinkingId) ?? THINKING[0]!;
}

export function setThinkingLevel(id: ThinkingLevel["id"]): ThinkingLevel {
  thinkingId = id;
  try { globalThis.localStorage?.setItem(THINKING_KEY, id); } catch { /* session only */ }
  for (const wake of thinkingWatchers) wake();
  return thinkingLevel();
}

/** Every line the ladder can write, so the composer can tell its own line from
 *  the operator's text and never stack two of them. */
const DIRECTIVES = new Set(THINKING.map((t) => t.instruction).filter(Boolean));

/** The draft with this level's planning line as its first line — and never a
 *  second copy of it. At `plain` the text is returned untouched. */
export function withPlanningLine(text: string, level: ThinkingLevel = thinkingLevel()): string {
  const rest = text.split("\n").filter((l) => !DIRECTIVES.has(l.trim())).join("\n").replace(/^\n+/, "");
  if (!level.instruction) return rest;
  return rest.length ? `${level.instruction}\n${rest}` : `${level.instruction}\n`;
}

/** The rung, live in both directions: the composer's chip and the word row. */
export function useThinkingLevel(): [ThinkingLevel, (id: ThinkingLevel["id"]) => void] {
  const [, wake] = useState(0);
  useEffect(() => {
    const fn = (): void => wake((n) => n + 1);
    thinkingWatchers.add(fn);
    return () => { thinkingWatchers.delete(fn); };
  }, []);
  return [thinkingLevel(), setThinkingLevel];
}

/* FNV-1a. Any cheap string hash would do; what matters is that it is a pure
 * function of the request, so the opening word is a property of the ask rather
 * than of the clock. Same request, same first word — the owner can tell the app
 * is working on *that* thing, not shuffling for effect. */
function seedOf(text: string): number {
  const trimmed = text.trim().toLowerCase();
  let h = 0x811c9dc5;
  for (const ch of trimmed) {
    h ^= ch.codePointAt(0) ?? 0;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** The word for a request at step `step` of its run. With no request text at all —
 *  a heartbeat or a scheduled trigger has none typed — this still returns the same
 *  word every time, which is the honest fallback: a quiet default rather than a
 *  random one dressed up as a reading. */
export function voiceWord(request: string, step = 0): string {
  return VOICE[(seedOf(request) + step) % VOICE.length] ?? VOICE[0]!;
}

let reduceQuery: MediaQueryList | null | undefined;
function reduceMotion(): MediaQueryList | null {
  if (reduceQuery === undefined) reduceQuery = typeof matchMedia === "function" ? matchMedia("(prefers-reduced-motion: reduce)") : null;
  return reduceQuery;
}

/** The owner's motion preference, live: it can change mid-run, and a rotation that
 *  started before they asked for stillness must not keep flickering after. */
function useStillness(): boolean {
  const [still, setStill] = useState(() => reduceMotion()?.matches === true);
  useEffect(() => {
    const q = reduceMotion();
    if (!q) return;
    const onChange = (): void => setStill(q.matches);
    q.addEventListener("change", onChange);
    return () => q.removeEventListener("change", onChange);
  }, []);
  return still;
}

/**
 * The word for the run currently in flight, or null when there is none.
 *
 * `request` is the composer's live text, which the host has already cleared by the
 * time a run is in flight — so the text is remembered while it is typed and fixed
 * at the moment the run starts. Everything after that belongs to the ask that began
 * the run, including a draft the owner types while waiting.
 *
 * Under reduced motion the run opens on its word and holds it: the rotation is the
 * motion being reduced, not the existence of the word.
 */
export function useRunWord(request: string, running: boolean): string | null {
  const [word, setWord] = useState<string | null>(null);
  const remembered = useRef("");
  const origin = useRef("");
  const startedAt = useRef(0);
  const still = useStillness();

  useEffect(() => {
    if (!running && request.trim()) remembered.current = request;
  }, [request, running]);

  useEffect(() => {
    if (!running) {
      startedAt.current = 0;
      setWord(null);
      return;
    }
    if (!startedAt.current) {
      origin.current = request.trim() || remembered.current;
      startedAt.current = Date.now();
    }
    /* The cadence is the ladder's, not a constant: a run asked to read three
       steps ahead is not a run that flips words twice as fast. Read once when
       the run arms, so a level change mid-flight does not restep words already
       spoken. */
    const hold = thinkingLevel().holdMs;
    const shown = Math.floor((Date.now() - startedAt.current) / hold);
    setWord(voiceWord(origin.current, shown));
    if (still) return;
    const tick = setInterval(() => setWord(voiceWord(origin.current, Math.floor((Date.now() - startedAt.current) / hold))), hold);
    return () => { clearInterval(tick); };
  }, [running, still, request]);

  return word;
}
