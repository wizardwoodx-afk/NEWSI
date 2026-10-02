import { createRequire as __mjCreateRequire } from "node:module"; const require = __mjCreateRequire(import.meta.url);

// src/engine/aguiProtocol.ts
var AGUI_EVENT_TYPES = [
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
  "SUBAGENT_ERROR"
];
var AGUI_TYPE_SET = new Set(AGUI_EVENT_TYPES);
var AGUI_PROTOCOL_VERSION = "1.0";
var AGUI_KIND_PREFIX = "agui:";
function aguiKind(type) {
  return `${AGUI_KIND_PREFIX}${type.toLowerCase()}`;
}
function levelFor(type) {
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
function str(p, key) {
  const v = p?.[key];
  return typeof v === "string" ? v : void 0;
}
function aguiToEleven(ev) {
  const type = typeof ev.type === "string" ? ev.type : "CUSTOM";
  const payload = ev.payload ?? {};
  const nodeId = str(payload, "nodeId") ?? str(payload, "parentId") ?? str(payload, "toolCallId") ?? str(payload, "messageId") ?? null;
  const executionId = str(payload, "executionId") ?? str(payload, "runId") ?? str(payload, "threadId");
  const data = {
    ...payload,
    aguiType: type,
    aguiVersion: AGUI_PROTOCOL_VERSION
  };
  if (ev.timestamp !== void 0) data.aguiTimestamp = ev.timestamp;
  if (ev.rawEvent !== void 0) data.aguiRaw = ev.rawEvent;
  if (ev.metadata !== void 0) {
    const meta = ev.metadata;
    for (const [k, v] of Object.entries(meta)) {
      if (!(k in data)) data[k] = v;
    }
    data.aguiMetadata = meta;
  }
  return {
    ts: ev.timestamp !== void 0 ? new Date(ev.timestamp).toISOString() : (/* @__PURE__ */ new Date()).toISOString(),
    kind: aguiKind(type),
    level: levelFor(type),
    nodeId,
    executionId,
    data
  };
}
function aguiStreamToEleven(events, opts = {}) {
  let seq = opts.startSeq ?? 0;
  return events.map((ev) => {
    const rec = aguiToEleven(ev);
    if (opts.executionId && !rec.executionId) rec.executionId = opts.executionId;
    rec.seq = seq++;
    return rec;
  });
}
function stripAguiEnvelope(data) {
  const out = { ...data };
  delete out.aguiType;
  delete out.aguiVersion;
  delete out.aguiTimestamp;
  delete out.aguiMetadata;
  delete out.aguiRaw;
  return out;
}
function elevenToAgui(rec) {
  const data = rec.data;
  const original = typeof data.aguiType === "string" ? data.aguiType : void 0;
  if (original) {
    return {
      type: original,
      timestamp: Date.parse(rec.ts),
      payload: stripAguiEnvelope(data),
      metadata: { level: rec.level, seq: rec.seq }
    };
  }
  return {
    type: "CUSTOM",
    timestamp: Date.parse(rec.ts),
    payload: { name: rec.kind, value: data },
    metadata: { level: rec.level, seq: rec.seq, elevenKind: rec.kind }
  };
}
function aguiBoundaryFacts() {
  return {
    protocol: AGUI_PROTOCOL_VERSION,
    direction: "bidirectional",
    eventTypes: AGUI_EVENT_TYPES.length,
    canonicalModel: "ExecutionEventRecord",
    unknownEventsPreserved: true,
    provenancePreserved: true,
    authority: "SelfImpulse"
  };
}
function isAguiEventType(t) {
  return typeof t === "string" && AGUI_TYPE_SET.has(t);
}

// probe/aguiBoundary.test.ts
var passed = 0;
var failed = 0;
var failures = [];
function ok(label, cond, detail = "") {
  if (cond) {
    passed += 1;
    console.log(`  ok   ${label}`);
  } else {
    failed += 1;
    failures.push(`${label}${detail ? ` \u2014 ${detail}` : ""}`);
    console.log(`  FAIL ${label}${detail ? ` \u2014 ${detail}` : ""}`);
  }
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
console.log("== 1. the mapping is TOTAL \u2014 no event shape is dropped");
var everyType = AGUI_EVENT_TYPES.map((t) => ({ type: t, timestamp: 17e11 }));
var mapped = aguiStreamToEleven(everyType);
ok("every declared event type maps to a record", mapped.length === everyType.length, `${mapped.length}/${everyType.length}`);
ok("every mapped record has a kind", mapped.every((r) => typeof r.kind === "string" && r.kind.length > 0));
ok("every mapped record has a level", mapped.every((r) => typeof r.level === "string" && r.level.length > 0));
ok("every mapped record has an ISO timestamp", mapped.every((r) => !Number.isNaN(Date.parse(r.ts))));
var unknownRec = aguiToEleven({ type: "SOMETHING_FROM_THE_FUTURE", payload: { x: 1 } });
ok("an unknown event still produces a record", typeof unknownRec.kind === "string");
ok("an unknown event keeps its own name", unknownRec.kind === `${AGUI_KIND_PREFIX}something_from_the_future`, unknownRec.kind);
ok("an unknown event keeps its payload", unknownRec.data.x === 1);
console.log("== 2. sequence numbers are assigned in arrival order");
var seqd = aguiStreamToEleven(
  [{ type: "RUN_STARTED" }, { type: "TEXT_MESSAGE_START" }, { type: "RUN_FINISHED" }],
  { startSeq: 7 }
);
ok("sequence starts where asked", seqd[0].seq === 7, String(seqd[0].seq));
ok("sequence is contiguous", seqd.map((r) => r.seq).join(",") === "7,8,9", seqd.map((r) => r.seq).join(","));
console.log("== 3. GOVERNANCE FACTS ARE NOT DEMOTED");
var toolStart = aguiToEleven({ type: "TOOL_CALL_START", payload: { toolCallId: "tc1" } });
var toolResult = aguiToEleven({ type: "TOOL_CALL_RESULT", payload: { toolCallId: "tc1" } });
ok("a tool call is SECURITY, not INFO", toolStart.level === "SECURITY", toolStart.level);
ok("a tool result is SECURITY, not INFO", toolResult.level === "SECURITY", toolResult.level);
ok("a run error is ERROR", aguiToEleven({ type: "RUN_ERROR" }).level === "ERROR");
ok("a subagent error is ERROR", aguiToEleven({ type: "SUBAGENT_ERROR" }).level === "ERROR");
ok("state is AUDIT", aguiToEleven({ type: "STATE_SNAPSHOT" }).level === "AUDIT");
ok("ordinary text is INFO", aguiToEleven({ type: "TEXT_MESSAGE_CONTENT" }).level === "INFO");
ok(
  "NO governance event is emitted as plain INFO",
  ["TOOL_CALL_START", "TOOL_CALL_RESULT", "RUN_ERROR", "SUBAGENT_ERROR", "STATE_SNAPSHOT"].every((t) => aguiToEleven({ type: t }).level !== "INFO")
);
console.log("== 4. AG-UI events are NAMESPACED \u2014 never confused with native ones");
ok("adopted kinds carry the agui prefix", mapped.every((r) => r.kind.startsWith(AGUI_KIND_PREFIX)));
ok("the prefix is agui:", AGUI_KIND_PREFIX === "agui:");
ok("a native kind is NOT prefixed", !"gate.approved".startsWith(AGUI_KIND_PREFIX));
var native = {
  ts: (/* @__PURE__ */ new Date()).toISOString(),
  kind: "gate.approved",
  level: "AUDIT",
  data: { receiptId: "r-1" }
};
var nativeAsAgui = elevenToAgui(native);
ok("a native event reaches an AG-UI consumer", nativeAsAgui.type === "CUSTOM", nativeAsAgui.type);
ok(
  "a native event keeps its own name in the payload",
  nativeAsAgui.payload.name === "gate.approved"
);
ok(
  "a native event keeps its level in metadata",
  nativeAsAgui.metadata.level === "AUDIT"
);
ok(
  "a native event is not laundered into a tool call",
  !String(nativeAsAgui.type).startsWith("TOOL_CALL")
);
console.log("== 5. provenance SURVIVES the round trip");
var inbound = {
  type: "TOOL_CALL_START",
  timestamp: 1700000000123,
  payload: { toolCallId: "tc9", toolCallName: "shell", parentId: "agent01", args: { cmd: "ls" } },
  metadata: { traceId: "t-7" }
};
var asRecord = aguiToEleven(inbound);
ok("the agent node is recovered from parentId", asRecord.nodeId === "agent01", String(asRecord.nodeId));
ok("the peer's timestamp is honoured", asRecord.ts === (/* @__PURE__ */ new Date(1700000000123)).toISOString());
ok("the peer's metadata is kept", asRecord.data.traceId === "t-7");
var backOut = elevenToAgui(asRecord);
ok("it goes back out as the same AG-UI type", backOut.type === "TOOL_CALL_START", String(backOut.type));
var backPayload = backOut.payload;
ok("the tool call id survives", backPayload.toolCallId === "tc9", String(backPayload.toolCallId));
ok("the tool name survives", backPayload.toolCallName === "shell");
ok("the tool arguments survive", JSON.stringify(backPayload.args) === JSON.stringify({ cmd: "ls" }));
ok("internal envelope keys are stripped on the way out", backPayload.aguiType === void 0 && backPayload.aguiVersion === void 0);
ok("the level is preserved in metadata", backOut.metadata.level === "SECURITY");
ok("the protocol version is stamped on the record", asRecord.data.aguiVersion === "1.0");
console.log("== 6. the boundary does not become the AUTHORITY");
var facts = aguiBoundaryFacts();
ok("authority is SelfImpulse, not the protocol", facts.authority === "SelfImpulse", facts.authority);
ok("the canonical model is SelfImpulse's own", facts.canonicalModel === "ExecutionEventRecord");
ok("unknown events are declared preserved", facts.unknownEventsPreserved === true);
ok("provenance is declared preserved", facts.provenancePreserved === true);
ok("the event count matches the vocabulary", facts.eventTypes === AGUI_EVENT_TYPES.length);
var policyish = aguiToEleven({ type: "CUSTOM", payload: { name: "approval.granted", approved: true } });
ok(
  "an approval claim arrives as data, never as a grant",
  policyish.level === "INFO" && !("grant" in policyish.data)
);
ok(
  "the boundary exposes no approval or policy decision of its own",
  !("approve" in facts) && !("grantAuthority" in facts)
);
console.log("== 7. the produced record is structurally SelfImpulse's own");
ok(
  "the produced record satisfies ExecutionEventRecord",
  mapped.every((r) => typeof r.ts === "string" && typeof r.kind === "string" && ["INFO", "DEBUG", "WARN", "ERROR", "AUDIT", "SECURITY", "EVOLUTION"].includes(r.level) && typeof r.data === "object" && r.data !== null)
);
ok(
  "records carry an execution id when the peer supplies one",
  aguiToEleven({ type: "RUN_STARTED", payload: { runId: "run-42" } }).executionId === "run-42"
);
ok(
  "a caller can stamp a shared execution id",
  aguiStreamToEleven([{ type: "RUN_STARTED" }], { executionId: "exec-9" })[0].executionId === "exec-9"
);
ok(
  "a nodeId the peer sends is preferred over a derived one",
  aguiToEleven({ type: "TOOL_CALL_START", payload: { nodeId: "node-a", toolCallId: "tc-1" } }).nodeId === "node-a"
);
console.log("");
console.log(`${passed} passed, ${failed} failed`);
if (failures.length > 0) {
  console.log("failures:");
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
ok(
  "sequence is deterministic for a replayed stream",
  aguiStreamToEleven([{ type: "RUN_STARTED" }], { startSeq: 7 })[0].seq === 7
);
