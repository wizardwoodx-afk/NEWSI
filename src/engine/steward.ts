/**
 * THE STEWARD — the crew's voice to its owner (19.7.4 [Crew]).
 *
 * Twenty-five specialists working in parallel produce a firehose of events.
 * The owner does not want the firehose; the owner wants the steward — one
 * calm voice that watches the crew and reports the working as it happens:
 * who joined, who finished, who failed and was replaced, what needs a
 * decision, and when the job is done.
 *
 * The discipline (pinned by probe/crew):
 *   • every event is ONE short line — the steward spends the owner's
 *     attention like it spends tokens, sparingly;
 *   • milestones are recorded at fixed fractions (25/50/75%) exactly once;
 *   • a reassignment is always named ("failed → replaced by, same domain"),
 *     never a bare "error";
 *   • escalations (a domain with no bench reserve left) end with the ask;
 *   • the feed is capped — the newest history survives, the ring never grows
 *     unbounded.
 */

export type StewardEventKind =
  | "crew-started"
  | "member-admitted"
  | "member-answered"
  | "member-failed"
  | "member-reassigned"
  | "member-gated"
  | "escalated"
  | "mode-switched"
  | "milestone"
  | "crew-done"
  | "note";

export interface StewardEvent {
  kind: StewardEventKind;
  at: number;
  line: string;
}

export const STEWARD_FEED_CAP = 200;

export const MILESTONES: readonly number[] = [0.25, 0.5, 0.75];

export interface StewardFeed {
  events: StewardEvent[];
  /** Milestone fractions already recorded — a fraction fires once. */
  milestonesSeen: number[];
}

export function initialFeed(): StewardFeed {
  return { events: [], milestonesSeen: [] };
}

/** Record one event. Caps the feed oldest-out; returns the event for chaining. */
export function record(feed: StewardFeed, kind: StewardEventKind, line: string, at: number): StewardEvent {
  const ev: StewardEvent = { kind, at, line };
  feed.events.push(ev);
  if (feed.events.length > STEWARD_FEED_CAP) feed.events.splice(0, feed.events.length - STEWARD_FEED_CAP);
  return ev;
}

/**
 * Milestone check — call after every member settles. Records each fraction
 * at most once, with the real counts in the line. Pure over the feed.
 */
export function checkMilestone(
  feed: StewardFeed,
  answered: number,
  total: number,
  at: number,
): StewardEvent | null {
  if (total <= 0) return null;
  const frac = answered / total;
  for (const m of MILESTONES) {
    if (frac >= m && !feed.milestonesSeen.includes(m)) {
      feed.milestonesSeen.push(m);
      return record(feed, "milestone", `milestone ${Math.round(m * 100)}% — ${answered} of ${total} members answered`, at);
    }
  }
  return null;
}

export interface BriefCounts {
  total: number;
  answered: number;
  failed: number;
  reassigned: number;
  gated: number;
  escalated: number;
}

/**
 * The steward's current briefing — the line the owner reads to know how
 * the crew is doing. Deterministic, honest, one sentence pair. No invented
 * progress: the numbers are the counts passed in, nothing smoothed.
 */
export function brief(counts: BriefCounts, status: string): string {
  const parts: string[] = [];
  if (counts.total === 0) return "the steward has no crew to report on yet.";
  parts.push(`${counts.answered}/${counts.total} answered`);
  if (counts.reassigned > 0) parts.push(`${counts.reassigned} reassigned from the bench`);
  if (counts.gated > 0) parts.push(`${counts.gated} waiting on your approval`);
  if (counts.escalated > 0) parts.push(`${counts.escalated} escalated — bench exhausted`);
  else if (counts.failed > counts.reassigned) parts.push(`${counts.failed - counts.reassigned} failed without a reserve`);
  return `steward: ${parts.join(" · ")} — ${status}.`;
}

/** The steward's line when a member fails and the bench answers. */
export function reassignLine(failedId: string, replacementId: string, domain: string): string {
  return `${failedId} failed — ${replacementId} stepped in from the same ${domain} bench`;
}

/** The steward's line when a domain has nobody left to send. */
export function escalateLine(failedId: string, domain: string, task: string): string {
  return `${failedId} failed and the ${domain} bench is exhausted — this part of the work needs you: ${task}`;
}
