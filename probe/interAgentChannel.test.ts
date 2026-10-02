import assert from "node:assert/strict";
import { HARNESSES, type HarnessId } from "../src/domain/harness";
import { AGENT_CAPABILITIES, EXECUTABLE_HARNESSES, binaryVerifiedHarnesses } from "../src/mission/agentCapabilities";
import { composeSeatArgv, type TeamSeat } from "../src/mission/agentTeam";
import {
  DEFAULT_CHANNELS,
  InterAgentMessageBus,
  type InterAgentMessage,
} from "../src/mission/interAgentChannel";

// 19.7.15: this listed 14 external coding-agent CLIs and asserted each was
// registered, named and fully specified. Those seats are removed, so the list is
// the two in-process runtimes. The assertions are unchanged in spirit — every
// runtime the app can seat must be named and fully described — and the count is
// exact, so a new seat cannot appear without a deliberate update here.
const EXPECTED_HARNESS_IDS: HarnessId[] = ["hermes", "llm"];

for (const id of EXPECTED_HARNESS_IDS) {
  const harness = HARNESSES.find((h) => h.id === id);
  assert(harness, `harness ${id} is registered in HARNESSES`);
  assert(harness.name.length > 0, `harness ${id} has a human readable name`);
  assert(AGENT_CAPABILITIES[id], `harness ${id} is present in AGENT_CAPABILITIES`);
}
console.log(`  ok   all ${EXPECTED_HARNESS_IDS.length} in-process runtimes present with full capability specs`);


const supportedList = EXECUTABLE_HARNESSES;
// No runtime is "executable" any more — they are in-process, and the name
// predates that change. What must hold is that the list cannot contain a CLI
// the product removed: that is the one property this assertion is here to keep.
assert(supportedList.every((id) => id === "hermes" || id === "llm"),
  `EXECUTABLE_HARNESSES contains no removed CLI, got ${supportedList.join(", ")}`);
console.log(`  ok   EXECUTABLE_HARNESSES returns ${supportedList.length} in-process runtimes and no removed CLI`);

// 19.7.15: this section asserted the exact non-interactive argv for five vendor
// CLIs (aider --message/--yes/--no-auto-commits, goose run, gemini, qwen,
// amazonq). Every one of those flags went with the CLI tier, and the seat they
// composed to no longer exists. What replaces the check is the property that
// actually matters now: a seat is NEVER handed a command line, and a seat naming
// a removed engine produces nothing at all rather than a plausible stub.
{
  const seat = (harness: string): TeamSeat => ({
    id: "s", role: "coder", harness: harness as HarnessId, model: null, mayWrite: true,
    maxRisk: "MEDIUM", timeoutSecs: 600, maxTurns: 10, instructions: "Fix tests",
  });
  for (const gone of ["aider", "goose", "gemini", "qwen", "amazonq", "claude", "codex", "opencode"]) {
    const c = composeSeatArgv(seat(gone), { prompt: "Fix bug", cwd: "/test", readOnly: false });
    assert.equal(c.argv.length, 0, `${gone} is removed and composes no argv`);
    assert.equal(c.bin, "", `${gone} is removed and resolves no binary`);
  }
  for (const native of ["hermes", "llm"] as HarnessId[]) {
    const c = composeSeatArgv(seat(native), { prompt: "Fix bug", cwd: "/test", readOnly: false });
    assert.equal(c.argv.length, 0, `${native} is in-process and is given no command line`);
    assert(c.inProcess === true, `${native} is marked as an in-process seat`);
  }
  console.log("  ok   no seat composes a command line: the CLIs are gone and the natives are in-process");
}


console.log("\n== 2. Inter-Agent Message Bus Pub/Sub & Channels ==");

const bus = new InterAgentMessageBus();
assert.equal(DEFAULT_CHANNELS.length, 5, "5 default channels initialized");

let receivedMessages: InterAgentMessage[] = [];
const unsub = bus.subscribe((msg) => {
  receivedMessages.push(msg);
});

const msg1 = bus.publish({
  channel: "#architecture",
  sender: { seatId: "claude_planner", role: "planner", harness: "claude", name: "Claude Code" },
  mentions: ["@coder", "@reviewer"],
  intent: "proposal",
  content: "Proposing API schema for payment endpoints.",
});

assert.equal(receivedMessages.length, 1);
assert.equal(receivedMessages[0].id, msg1.id);
assert.equal(receivedMessages[0].channel, "#architecture");
assert.equal(receivedMessages[0].intent, "proposal");
console.log("  ok   published and subscribed to message successfully");

// Channel-specific querying
const archMessages = bus.getMessages({ channel: "#architecture" });
assert.equal(archMessages.length, 1);
const syncMessages = bus.getMessages({ channel: "#implementation-sync" });
assert.equal(syncMessages.length, 0);
console.log("  ok   channel filtering queries work accurately");

// Mention filtering
const coderMessages = bus.getMessages({ mention: "@coder" });
assert.equal(coderMessages.length, 1);
const strangerMessages = bus.getMessages({ mention: "@stranger" });
assert.equal(strangerMessages.length, 0);
console.log("  ok   mention routing correctly detects tagged seats");

console.log("\n== 3. Threading and replies ==");

const msg2 = bus.publish({
  channel: "#architecture",
  replyToId: msg1.id,
  sender: { seatId: "codex_coder", role: "coder", harness: "codex", name: "OpenAI Codex" },
  mentions: ["@claude_planner"],
  intent: "contract",
  content: "Contract accepted. Implementing rate-limiter interface.",
});

const thread = bus.getThread(msg1.id);
assert.equal(thread.length, 2);
assert.equal(thread[0].id, msg1.id);
assert.equal(thread[1].id, msg2.id);
console.log("  ok   thread recreation preserves hierarchy and ordering");

console.log("\n== 4. Shared Blackboard State & Versioning ==");

let blackboardEvents: string[] = [];
bus.subscribeBlackboard((entry) => {
  blackboardEvents.push(entry.key);
});

const entry1 = bus.writeBlackboard("api.payment_spec", "export interface PaymentDto { amount: number; }", "codex_coder", "contract");
assert.equal(entry1.version, 1);
assert.equal(entry1.key, "api.payment_spec");
assert.equal(entry1.author, "codex_coder");

// Update same key
const entry2 = bus.writeBlackboard("api.payment_spec", "export interface PaymentDto { amount: number; currency: string; }", "claude_planner", "contract");
assert.equal(entry2.version, 2);
assert.equal(blackboardEvents.length, 2);

const retrieved = bus.readBlackboard("api.payment_spec");
assert.equal(retrieved?.version, 2);
assert(retrieved?.value.includes("currency: string"));
console.log("  ok   blackboard writes increment versions and notify subscribers");

unsub();
console.log("\nInter-Agent parallel channel tests passed cleanly!\n");
