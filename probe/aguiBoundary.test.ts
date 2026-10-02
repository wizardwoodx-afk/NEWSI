/**
 * The AG-UI event boundary (src/engine/aguiProtocol.ts).
 *
 * SelfImpulse adopted AG-UI's event vocabulary as an interoperability boundary.
 * This suite is the gate that keeps that adoption honest. It fails if the
 * boundary ever grows a second event store, starts dropping unknown events,
 * demotes a governance-critical event, or stops round-tripping provenance.
 *
 * The properties pinned here are the ones that would silently rot:
 *  - the vocabulary matches the adopted spec exactly
 *  - every event shape produces a canonical SelfImpulse record (total mapping)
 *  - tool calls and errors are NOT downgraded to plain INFO
 *  - AG-UI-sourced events are namespaced, so they can never be mistaken for
 *    SelfImpulse-native ones in the same ledger
 *  - a native event still reaches an AG-UI consumer, as CUSTOM
 *  - the boundary does not become the authority
 */
import {
  AGUI_EVENT_TYPES,
  AGUI_KIND_PREFIX,
  AGUI_PROTOCOL_VERSION,
  aguiBoundaryFacts,
  aguiStreamToEleven,
  aguiToEleven,
  elevenToAgui,
  isAguiEventType,
} from "../src/engine/aguiProtocol";
import type { AguiEvent } from "../src/engine/aguiProtocol";
import type { ExecutionEventRecord } from "../src/domain/types";

let passed = 0;
let failed = 0;
const failures: string[] = [];
function ok(label: string, cond: boolean, detail = ""): void {
  if (cond) { passed += 1; console.log(`  ok   ${label}`); }
  else { failed += 1; failures.push(`${label}${detail ? ` — ${detail}` : ""}`); console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`); }
}

console.log("== 0. the adopted vocabulary is real and versioned");
ok("the boundary declares protocol 1.0", AGUI_PROTOCOL_VERSION === "1.0");
ok("the vocabulary is non-empty", AGUI_EVENT_TYPES.length > 0, String(AGUI_EVENT_TYPES.length));
ok("the vocabulary has 31 event types (spec 1.0)", AGUI_EVENT_TYPES.length === 31, String(AGUI_EVENT_TYPES.length));
ok("run lifecycle events are present", ["RUN_STARTED", "RUN_FINISHED", "RUN_ERROR"].every((t) => isAguiEventType(t)));
ok("tool events are present", ["TOOL_CALL_START", "TOOL_CALL_ARGS", "TOOL_CALL_END", "TOOL_CALL_RESULT"].every((t) => isAguiEventType(t)));
ok("state events are present", ["STATE_SNAPSHOT", "STATE_DELTA"].every((t) => isAguiEventType(t)));
ok("an unknown type is not claimed to be known", isAguiEventType("NOT_A_REAL_EVENT") === false);
ok("a non-string is not a type", isAguiEventType(42) === false);

console.log("== 1. the mapping is TOTAL — no event shape is dropped");
const everyType: AguiEvent[] = AGUI_EVENT_TYPES.map((t) => ({ type: t, timestamp: 1_700_000_000_000 }));
const mapped = aguiStreamToEleven(everyType);
ok("every declared event type maps to a record", mapped.length === everyType.length, `${mapped.length}/${everyType.length}`);
ok("every mapped record has a kind", mapped.every((r) => typeof r.kind === "string" && r.kind.length > 0));
ok("every mapped record has a level", mapped.every((r) => typeof r.level === "string" && r.level.length > 0));
ok("every mapped record has an ISO timestamp", mapped.every((r) => !Number.isNaN(Date.parse(r.ts))));
const unknownRec = aguiToEleven({ type: "SOMETHING_FROM_THE_FUTURE", payload: { x: 1 } });
ok("an unknown event still produces a record", typeof unknownRec.kind === "string");
ok("an unknown event keeps its own name", unknownRec.kind === `${AGUI_KIND_PREFIX}something_from_the_future`, unknownRec.kind);
ok("an unknown event keeps its payload", (unknownRec.data as Record<string, unknown>).x === 1);

console.log("== 2. sequence numbers are assigned in arrival order");
const seqd = aguiStreamToEleven(
  [{ type: "RUN_STARTED" }, { type: "TEXT_MESSAGE_START" }, { type: "RUN_FINISHED" }],
  { startSeq: 7 }
);
ok("sequence starts where asked", seqd[0].seq === 7, String(seqd[0].seq));
ok("sequence is contiguous", seqd.map((r) => r.seq).join(",") === "7,8,9", seqd.map((r) => r.seq).join(","));

console.log("== 3. GOVERNANCE FACTS ARE NOT DEMOTED");
const toolStart = aguiToEleven({ type: "TOOL_CALL_START", payload: { toolCallId: "tc1" } });
const toolResult = aguiToEleven({ type: "TOOL_CALL_RESULT", payload: { toolCallId: "tc1" } });
ok("a tool call is SECURITY, not INFO", toolStart.level === "SECURITY", toolStart.level);
ok("a tool result is SECURITY, not INFO", toolResult.level === "SECURITY", toolResult.level);
ok("a run error is ERROR", aguiToEleven({ type: "RUN_ERROR" }).level === "ERROR");
ok("a subagent error is ERROR", aguiToEleven({ type: "SUBAGENT_ERROR" }).level === "ERROR");
ok("state is AUDIT", aguiToEleven({ type: "STATE_SNAPSHOT" }).level === "AUDIT");
ok("ordinary text is INFO", aguiToEleven({ type: "TEXT_MESSAGE_CONTENT" }).level === "INFO");
ok("NO governance event is emitted as plain INFO",
  ["TOOL_CALL_START", "TOOL_CALL_RESULT", "RUN_ERROR", "SUBAGENT_ERROR", "STATE_SNAPSHOT"]
    .every((t) => aguiToEleven({ type: t }).level !== "INFO"));

console.log("== 4. AG-UI events are NAMESPACED — never confused with native ones");
ok("adopted kinds carry the agui prefix", mapped.every((r) => r.kind.startsWith(AGUI_KIND_PREFIX)));
ok("the prefix is agui:", AGUI_KIND_PREFIX === "agui:");
ok("a native kind is NOT prefixed", !("gate.approved" as string).startsWith(AGUI_KIND_PREFIX));
const native: ExecutionEventRecord = {
  ts: new Date().toISOString(),
  kind: "gate.approved",
  level: "AUDIT",
  data: { receiptId: "r-1" },
};
const nativeAsAgui = elevenToAgui(native);
ok("a native event reaches an AG-UI consumer", nativeAsAgui.type === "CUSTOM", nativeAsAgui.type);
ok("a native event keeps its own name in the payload",
  (nativeAsAgui.payload as Record<string, unknown>).name === "gate.approved");
ok("a native event keeps its level in metadata",
  (nativeAsAgui.metadata as Record<string, unknown>).level === "AUDIT");
ok("a native event is not laundered into a tool call",
  !String(nativeAsAgui.type).startsWith("TOOL_CALL"));

console.log("== 5. provenance SURVIVES the round trip");
const inbound: AguiEvent = {
  type: "TOOL_CALL_START",
  timestamp: 1_700_000_000_123,
  payload: { toolCallId: "tc9", toolCallName: "shell", parentId: "agent01", args: { cmd: "ls" } },
  metadata: { traceId: "t-7" },
};
const asRecord = aguiToEleven(inbound);
ok("the agent node is recovered from parentId", asRecord.nodeId === "agent01", String(asRecord.nodeId));
ok("the peer's timestamp is honoured", asRecord.ts === new Date(1_700_000_000_123).toISOString());
ok("the peer's metadata is kept", (asRecord.data as Record<string, unknown>).traceId === "t-7");
const backOut = elevenToAgui(asRecord);
ok("it goes back out as the same AG-UI type", backOut.type === "TOOL_CALL_START", String(backOut.type));
const backPayload = backOut.payload as Record<string, unknown>;
ok("the tool call id survives", backPayload.toolCallId === "tc9", String(backPayload.toolCallId));
ok("the tool name survives", backPayload.toolCallName === "shell");
ok("the tool arguments survive", JSON.stringify(backPayload.args) === JSON.stringify({ cmd: "ls" }));
ok("internal envelope keys are stripped on the way out", backPayload.aguiType === undefined && backPayload.aguiVersion === undefined);
ok("the level is preserved in metadata", (backOut.metadata as Record<string, unknown>).level === "SECURITY");
ok("the protocol version is stamped on the record", (asRecord.data as Record<string, unknown>).aguiVersion === "1.0");

console.log("== 6. the boundary does not become the AUTHORITY");
const facts = aguiBoundaryFacts();
ok("authority is SelfImpulse, not the protocol", facts.authority === "SelfImpulse", facts.authority);
ok("the canonical model is SelfImpulse's own", facts.canonicalModel === "ExecutionEventRecord");
ok("unknown events are declared preserved", facts.unknownEventsPreserved === true);
ok("provenance is declared preserved", facts.provenancePreserved === true);
ok("the event count matches the vocabulary", facts.eventTypes === AGUI_EVENT_TYPES.length);
const policyish = aguiToEleven({ type: "CUSTOM", payload: { name: "approval.granted", approved: true } });
ok("an approval claim arrives as data, never as a grant",
  policyish.level === "INFO" && !("grant" in (policyish.data as Record<string, unknown>)));
ok("the boundary exposes no approval or policy decision of its own",
  !("approve" in (facts as unknown as Record<string, unknown>)) &&
  !("grantAuthority" in (facts as unknown as Record<string, unknown>)));

console.log("== 7. the produced record is structurally SelfImpulse's own");
ok("the produced record satisfies ExecutionEventRecord",
  mapped.every((r): r is ExecutionEventRecord =>
    typeof r.ts === "string" && typeof r.kind === "string" &&
    ["INFO", "DEBUG", "WARN", "ERROR", "AUDIT", "SECURITY", "EVOLUTION"].includes(r.level) &&
    typeof r.data === "object" && r.data !== null));
ok("records carry an execution id when the peer supplies one",
  aguiToEleven({ type: "RUN_STARTED", payload: { runId: "run-42" } }).executionId === "run-42");
ok("a caller can stamp a shared execution id",
  aguiStreamToEleven([{ type: "RUN_STARTED" }], { executionId: "exec-9" })[0].executionId === "exec-9");
ok("a nodeId the peer sends is preferred over a derived one",
  aguiToEleven({ type: "TOOL_CALL_START", payload: { nodeId: "node-a", toolCallId: "tc-1" } }).nodeId === "node-a");

console.log("");
console.log(`${passed} passed, ${failed} failed`);
if (failures.length > 0) {
  console.log("failures:");
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}

ok("sequence is deterministic for a replayed stream",
  aguiStreamToEleven([{ type: "RUN_STARTED" }], { startSeq: 7 })[0].seq === 7);
