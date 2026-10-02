/**
 * TEAMMATES PLANE PROBE — 19.5.6 (crew UX, governance-hardened).
 *
 * Pins the crew plane mechanically:
 *   1. every multi-member run derives a Chief Steward row + one teammate row
 *      per routed specialist, each carrying REAL receipt digests;
 *   2. statuses are honest (done / gated / refused / error — never dressed up);
 *   3. the WORKSPACE line is derived from the member's actual tool surface +
 *      the run's stated workspace seam — a non-Reach member is NEVER shown a
 *      browser session, a toolless member states "no workspace";
 *   4. the coordination feed names how many agents were messaged and what
 *      each returned;
 *   5. the playground is labelled a demo;
 *   6. trace language is precise: sha256 digests are "trace digests", ECDSA
 *      P-256 lives on the authority line only — a digest is never relabelled
 *      a signature;
 *   7. the wiring is structural: the door renders the crew desk, the CSS
 *      ships, and the module states the honesty difference
 *      ("anyone can SHOW a trace; VH SIGNS it").
 */
import { describe, it } from "node:test";
import assert from "node:assert";
import * as fs from "node:fs";
import * as path from "node:path";

declare const SI_ROOT: string | undefined;
const ROOT = typeof SI_ROOT === "string" && SI_ROOT.length > 0 ? SI_ROOT : process.cwd();

import {
  teammatesFromResponse, chiefRow, teammateRows, coordinationFeed, playgroundMission, workspaceFor, CHIEF_STEWARD,
} from "../src/engine/teammates";
import type { GeneralistResponse, MemberRunView } from "../src/engine/types";

const D64 = "ab".repeat(32);

const mk = (over: Partial<GeneralistResponse>): GeneralistResponse => ({
  reply: "reply text",
  routed: { selected: [{ id: "code.typescript", score: 3, reasons: ["x"] }], considered: 1, strategy: "single", routedBy: "deterministic" },
  executed: true,
  outcome: "answered",
  specialistIds: ["code.typescript"],
  provenanceDigest: D64,
  ...over,
}) as GeneralistResponse;

const runOf = (over: Partial<MemberRunView>): MemberRunView => ({
  specialistId: "code.typescript", providerCalls: 1, latencyMs: 10, truncated: false,
  tools: [], toolReceipts: [],
  ...over,
});

describe("chief steward row", () => {
  it("names the Chief Steward and carries the provenance digest as a verified trace digest", () => {
    const row = chiefRow(mk({}));
    assert.equal(row.name, CHIEF_STEWARD);
    assert.equal(row.status, "done");
    assert.ok(row.traceDigests.includes(D64));
    assert.ok(row.queue.some((q) => q.includes("routed")), "routing decision is in the queue");
    assert.equal(row.authorityNote, undefined, "no authority line without an authority");
    assert.ok(row.workspace.includes("no tool workspace"), "the chief states it carries no tools");
  });

  it("a gated run shows HUMAN GATE in the chief queue and gated status", () => {
    const row = chiefRow(mk({ outcome: "gated-out", executed: false }));
    assert.equal(row.status, "gated");
    assert.ok(row.queue.some((q) => q.includes("HUMAN GATE")));
  });

  it("a signed mandate lands in the trace + a precise ECDSA authority line", () => {
    const row = chiefRow(mk({ authority: { mandateDigest: "cd".repeat(32), scheme: "ecdsa-p256", owner: "owner-1" } }));
    assert.ok(row.traceDigests.includes("cd".repeat(32)));
    assert.ok(row.queue.some((q) => q.includes("mandate signed")));
    assert.ok(row.authorityNote && row.authorityNote.includes("ECDSA P-256 mission authority"), "ECDSA lives on its own line");
  });
});

describe("teammate rows", () => {
  it("an answered fs member becomes a done teammate with a real queue + trace + run-derived workspace", () => {
    const resp = mk({
      captain: {
        captainId: "c", captainName: "C",
        members: [{ specialistId: "code.typescript", outcome: "answered", memberDigest: "ef".repeat(32) }],
      } as unknown as GeneralistResponse["captain"],
      memberRuns: [runOf({
        tools: ["fs.read"],
        toolReceipts: [{ tool: "fs.read", outcome: "executed", inputPreview: "", outputPreview: "", digest: "12".repeat(32) }],
      })],
      workspace: { kind: "browser-memory", root: "/si-mission" },
    });
    const rows = teammateRows(resp);
    assert.equal(rows.length, 1);
    const r = rows[0];
    assert.equal(r.status, "done");
    assert.ok(r.queue.some((q) => q.includes("fs.read → executed")));
    assert.ok(r.traceDigests.includes("ef".repeat(32)), "member digest rides the row");
    assert.ok(r.traceDigests.includes("12".repeat(32)), "tool receipt digest rides the row");
    assert.ok(r.workspace.includes("in-browser mission workspace (memory)"), "workspace derived from the run seam");
    assert.ok(!r.workspace.includes("exec/browser session"), "a non-Reach member is NEVER shown a browser session");
  });

  it("only reach members (pc.* tools) display the Reach computer-use session", () => {
    const resp = mk({
      captain: { captainId: "c", captainName: "C", members: [{ specialistId: "reach.runner", outcome: "answered" }] } as unknown as GeneralistResponse["captain"],
      memberRuns: [runOf({ specialistId: "reach.runner", tools: ["pc.exec", "pc.browser"] })],
    });
    const r = teammateRows(resp)[0];
    assert.ok(r.workspace.includes("Reach computer-use plane"));
    assert.ok(r.workspace.includes("cookies off by default"));
  });

  it("a toolless member states 'no workspace' — never implied", () => {
    const resp = mk({
      captain: { captainId: "c", captainName: "C", members: [{ specialistId: "code.typescript", outcome: "answered" }] } as unknown as GeneralistResponse["captain"],
      memberRuns: [runOf({})],
    });
    assert.ok(teammateRows(resp)[0].workspace.includes("toolless · no workspace (stated)"));
  });

  it("workspaceFor itself: fs tools without a stated seam are flagged, not hidden", () => {
    const resp = mk({ workspace: null });
    const w = workspaceFor(runOf({ tools: ["fs.read"] }), resp);
    assert.ok(w.includes("not stated"));
    assert.ok(workspaceFor(runOf({ tools: ["wiki.search"] }), mk({})).includes("research-only tools"));
  });

  it("an errored member is error, never relabelled", () => {
    const resp = mk({
      captain: { captainId: "c", captainName: "C", members: [{ specialistId: "code.typescript", outcome: "error", note: "provider 500" }] } as unknown as GeneralistResponse["captain"],
    });
    assert.equal(teammateRows(resp)[0].status, "error");
  });

  it("a truncated loop is labelled honestly in the queue", () => {
    const resp = mk({
      captain: { captainId: "c", captainName: "C", members: [{ specialistId: "code.typescript", outcome: "answered", memberDigest: D64 }] } as unknown as GeneralistResponse["captain"],
      memberRuns: [runOf({ truncated: true })],
    });
    assert.ok(teammateRows(resp)[0].queue.some((q) => q.includes("labelled honestly")));
  });
});

describe("coordination feed + playground", () => {
  it("the feed says how many agents were messaged and what each returned", () => {
    const resp = mk({
      captain: { captainId: "c", captainName: "C", members: [{ specialistId: "code.typescript", outcome: "answered" }] } as unknown as GeneralistResponse["captain"],
    });
    const lines = coordinationFeed(resp);
    assert.ok(lines[0].includes("Messaged 1 agent"));
  });

  it("the playground mission is deterministic, labelled a demo, and digest-precise", () => {
    const pg = playgroundMission();
    assert.equal(pg.labelledSample, true);
    assert.ok(pg.task.length > 10);
    assert.ok(pg.plan.length >= 4);
    assert.ok(pg.plan.some((p) => p.includes("verified trace digest")), "plan says digest, never signature");
    assert.ok(!pg.plan.some((p) => p.toLowerCase().includes("signed trace")));
  });
});

describe("the wiring is structural", () => {
  it("Work renders the crew from the real response — anonymous agents, digests labelled as digests (19.7.12 UI)", () => {
    const src = fs.readFileSync(path.join(ROOT, "src", "ui", "screens", "Work.tsx"), "utf8");
    assert.ok(src.includes("memberRuns") && src.includes("toolReceipts"), "built from the real GeneralistResponse");
    assert.ok(/AGENT \$\{String\(i \+ 1\)\.padStart\(2, "0"\)\}/.test(src), "agents are AGENT nn — the crew never faces the user by name");
    assert.ok(src.includes("receipt ${t.digest.slice(0, 8)}"), "a digest is labelled receipt/digest, precisely");
    assert.ok(!src.includes("signed trace"), "never relabelled a digest as a signature");
    assert.ok(!src.includes("labelled demo"), "no demo button in the product — Work shows real runs only");
  });

  it("the design system ships the Work graph + gate styles", () => {
    const css = fs.readFileSync(path.join(ROOT, "src", "ui", "vh.css"), "utf8");
    assert.ok(css.includes(".gate-float") && css.includes(".legend"));
  });

  it("the module states the honesty difference (shown vs signed) and the run-derived framing", () => {
    const src = fs.readFileSync(path.join(ROOT, "src", "engine", "teammates.ts"), "utf8");
    assert.ok(src.includes("Anyone can SHOW a trace") && src.includes("VH SIGNS it"));
    assert.ok(src.includes("RUN-DERIVED"), "rows are stated as run-derived, not persistent instances");
  });
});
