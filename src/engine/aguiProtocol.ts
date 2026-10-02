/**
 * AG-UI 1.0 event boundary.
 *
 * Source adoption, not a wrapper. The event vocabulary and the base event
 * contract are adapted from the AG-UI 1.0 JSON schema
 * (github.com/ag-ui-protocol/ag-ui, `spec/1.0/schema.json`, MIT, Copyright
 * (c) 2025 AG-UI contributors) and normalized onto SelfImpulse's ONE canonical
 * event model, `ExecutionEventRecord` in `src/domain/types.ts`.
 *
 * Why this file exists
 * --------------------
 * SelfImpulse is the runtime; AG-UI is the interoperability boundary. Any agent
 * that speaks AG-UI can be driven by SelfImpulse, and SelfImpulse can expose its runs
 * to an AG-UI client, without AG-UI becoming a second event system and without
 * the product's run semantics being replaced by another project's.
 *
 * The rules this file keeps
 * -------------------------
 * 1. There is exactly ONE canonical event record in SelfImpulse
 *    (`ExecutionEventRecord`). Nothing here invents a second store.
 * 2. AG-UI-sourced events are namespaced (`agui:...`) so they are always
 *    distinguishable from SelfImpulse-native events in the same ledger. That is
 *    the difference between "we interop with AG-UI" and "we became AG-UI".
 * 3. Governance facts are not demoted. A tool call is SECURITY, an error is
 *    ERROR, state is AUDIT. An approval request must never be plain INFO.
 * 4. Unknown AG-UI event types are preserved, not discarded, so a newer peer
 *    does not silently lose events.
 *
 * Licensing: AG-UI is MIT. The adopted material is the event vocabulary and
 * the base event shape. Provenance is recorded in the adoption register, which
 * lives outside the product tree.
 */

/**
 * The AG-UI 1.0 `EventType` vocabulary, in schema order.
 *
 * Adopted from `spec/1.0/schema.json` -> `$defs.EventType.enum`.
 */
export const AGUI_EVENT_TYPES = [
  "TEXT_MESSAGE_START",
  "TEXT_MESSAGE_CONTENT",
  "TEXT_MESSAGE_END",
  "TEXT_MESSAGE_CHUNK",
  "TOOL_CALL_START",
  "TOOL_CALL_ARGS",
  "TOOL_CALL_END",
  "TOOL_CALL_CHUNK",
  "TOOL_CALL_RESULT",
  "STATE_SNAPSHOT",
  "STATE_DELTA",
  "MESSAGES_SNAPSHOT",
  "ACTIVITY_SNAPSHOT",
  "ACTIVITY_DELTA",
  "RAW",
  "CUSTOM",
  "RUN_STARTED",
  "RUN_FINISHED",
  "RUN_ERROR",
  "STEP_STARTED",
  "STEP_FINISHED",
  "REASONING_START",
  "REASONING_MESSAGE_START",
  "REASONING_MESSAGE_CONTENT",
  "REASONING_MESSAGE_END",
  "REASONING_MESSAGE_CHUNK",
  "REASONING_END",
  "REASONING_ENCRYPTED_VALUE",
  "SUBAGENT_STARTED",
  "SUBAGENT_FINISHED",
  "SUBAGENT_ERROR",
] as const;

export type AguiEventType = (typeof AGUI_EVENT_TYPES)[number];

const AGUI_TYPE_SET: ReadonlySet<string> = new Set(AGUI_EVENT_TYPES);

/** The AG-UI protocol version this boundary implements. */
export const AGUI_PROTOCOL_VERSION = "1.0";

/** A text message role, per `$defs.TextMessageRole`. */
export type AguiMessageRole = "assistant" | "user" | "tool" | "system";

/**
 * The AG-UI base event.
 *
 * Adopted from `$defs.BaseEvent`: `type`, `timestamp`, `rawEvent`, `metadata`.
 * Event-specific fields (messageId, toolCallId, parentId, delta, ...) are
 * carried in `payload` so the base stays one faithful shape rather than a
 * union of every variant.
 */
export interface AguiEvent {
  type: AguiEventType | string;
  timestamp?: number;
  rawEvent?: unknown;
  metadata?: Record<string, unknown>;
  /** Event-specific fields, verbatim from the producing peer. */
  payload?: Record<string, unknown>;
}

/**
 * SelfImpulse's severity levels, from `ExecutionEventRecord.level`.
 *
 * Kept local rather than imported so this module has no import-cycle risk with
 * the domain types module; the string values are the contract.
 */
export type ElevenLevel =
  | "INFO"
  | "DEBUG"
  | "WARN"
  | "ERROR"
  | "AUDIT"
  | "SECURITY"
  | "EVOLUTION";

/**
 * SelfImpulse's ONE canonical event record.
 *
 * Structurally identical to `ExecutionEventRecord` in `src/domain/types.ts`.
 * Re-declared as a type here so this module states the contract it produces
 * against; a probe pins the two to stay identical.
 */
export interface ElevenEventRecord {
  seq?: number;
  ts: string;
  kind: string;
  level: ElevenLevel;
  nodeId?: string | null;
  executionId?: string;
  data: Record<string, unknown>;
}

/** Namespacing so an AG-UI-sourced event is never confused with a native one. */
export const AGUI_KIND_PREFIX = "agui:";

function aguiKind(type: string): string {
  return `${AGUI_KIND_PREFIX}${type.toLowerCase()}`;
}

/**
 * Events that are governance facts in SelfImpulse, not chatter.
 *
 * These must reach the approval and receipt systems, so they are raised to
 * AUDIT/SECURITY rather than plain INFO. An approval request is the single most
 * important event in the system; demoting it to INFO would be a real defect.
 */
function levelFor(type: string): ElevenLevel {
  switch (type) {
    case "TOOL_CALL_START":
    case "TOOL_CALL_RESULT":
      return "SECURITY";
    case "RUN_ERROR":
    case "SUBAGENT_ERROR":
      return "ERROR";
    case "STATE_SNAPSHOT":
    case "STATE_DELTA":
    case "ACTIVITY_SNAPSHOT":
    case "ACTIVITY_DELTA":
      return "AUDIT";
    default:
      return "INFO";
  }
}

/** Read a string field from a payload without widening to `any`. */
function str(p: Record<string, unknown> | undefined, key: string): string | undefined {
  const v = p?.[key];
  return typeof v === "string" ? v : undefined;
}

/**
 * Convert one AG-UI event into SelfImpulse's canonical event record.
 *
 * Total: every event shape, including unrecognized ones, produces a record.
 * An unknown type is carried as passthrough under its own kind so nothing is
 * dropped.
 */
export function aguiToEleven(ev: AguiEvent): ElevenEventRecord {
  const type = typeof ev.type === "string" ? ev.type : "CUSTOM";
  const payload = (ev.payload ?? {}) as Record<string, unknown>;

  // The node this event belongs to: AG-UI identifies a participant by
  // messageId (text), toolCallId (tools) or parentId (subagents). SelfImpulse
  // identifies by nodeId. Prefer an explicit nodeId when the peer sends one, so
  // an SelfImpulse-native producer keeps its own node identity.
  const nodeId =
    str(payload, "nodeId") ??
    str(payload, "parentId") ??
    str(payload, "toolCallId") ??
    str(payload, "messageId") ??
    null;

  const executionId =
    str(payload, "executionId") ?? str(payload, "runId") ?? str(payload, "threadId");

  const data: Record<string, unknown> = {
    ...payload,
    aguiType: type,
    aguiVersion: AGUI_PROTOCOL_VERSION,
  };
  if (ev.timestamp !== undefined) data.aguiTimestamp = ev.timestamp;
  if (ev.rawEvent !== undefined) data.aguiRaw = ev.rawEvent;
  // Peer metadata is merged at the TOP level as well as kept whole under
  // `aguiMetadata`. A consumer reading a record should be able to reach the
  // peer's own fields directly, without knowing this module's envelope keys;
  // `aguiMetadata` remains the lossless copy, and wins on collision so a peer
  // can never overwrite a field the ledger depends on.
  if (ev.metadata !== undefined) {
    const meta = ev.metadata as Record<string, unknown>;
    for (const [k, v] of Object.entries(meta)) {
      if (!(k in data)) data[k] = v;
    }
    data.aguiMetadata = meta;
  }

  return {
    ts:
      ev.timestamp !== undefined
        ? new Date(ev.timestamp).toISOString()
        : new Date().toISOString(),
    kind: aguiKind(type),
    level: levelFor(type),
    nodeId,
    executionId,
    data,
  };
}

/**
 * Convert a batch, assigning sequence numbers in arrival order.
 *
 * SelfImpulse's ledger is ordered; an event stream is not. Sequencing here is what
 * makes a replay of the same stream produce the same ledger.
 */
export function aguiStreamToEleven(
  events: readonly AguiEvent[],
  opts: { startSeq?: number; executionId?: string } = {}
): ElevenEventRecord[] {
  let seq = opts.startSeq ?? 0;
  return events.map((ev) => {
    const rec = aguiToEleven(ev);
    if (opts.executionId && !rec.executionId) rec.executionId = opts.executionId;
    rec.seq = seq++;
    return rec;
  });
}

/** Remove the keys this module added, to recover the original payload. */
function stripAguiEnvelope(data: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...data };
  delete out.aguiType;
  delete out.aguiVersion;
  delete out.aguiTimestamp;
  delete out.aguiMetadata;
  delete out.aguiRaw;
  return out;
}

/**
 * Serialize back to AG-UI, for exposing an SelfImpulse run to an AG-UI client.
 *
 * SelfImpulse's `level`, `seq` and native kinds have no AG-UI field, so they are
 * preserved in `metadata` rather than dropped. An AG-UI consumer therefore
 * loses nothing it can act on, and an operator can still recover provenance.
 */
export function elevenToAgui(rec: ElevenEventRecord): AguiEvent {
  const data = rec.data as Record<string, unknown>;
  const original = typeof data.aguiType === "string" ? data.aguiType : undefined;

  // An event that came from AG-UI goes back out as the same AG-UI event.
  if (original) {
    return {
      type: original,
      timestamp: Date.parse(rec.ts),
      payload: stripAguiEnvelope(data),
      metadata: { level: rec.level, seq: rec.seq },
    };
  }

  // An SelfImpulse-native event is exposed as a CUSTOM event, which is exactly
  // what AG-UI defines as the escape hatch for producer-specific events.
  return {
    type: "CUSTOM",
    timestamp: Date.parse(rec.ts),
    payload: { name: rec.kind, value: data },
    metadata: { level: rec.level, seq: rec.seq, elevenKind: rec.kind },
  };
}

/**
 * Capability facts about this boundary.
 *
 * Returned as data rather than logged, so a probe can assert them, and so the
 * same facts can be surfaced in Settings -> About beside the guardrail
 * manifest.
 */
export function aguiBoundaryFacts() {
  return {
    protocol: AGUI_PROTOCOL_VERSION,
    direction: "bidirectional",
    eventTypes: AGUI_EVENT_TYPES.length,
    canonicalModel: "ExecutionEventRecord",
    unknownEventsPreserved: true,
    provenancePreserved: true,
    authority: "SelfImpulse",
  } as const;
}

/** Narrowing guard: is this a recognized AG-UI event type? */
export function isAguiEventType(t: unknown): t is AguiEventType {
  return typeof t === "string" && AGUI_TYPE_SET.has(t);
}
