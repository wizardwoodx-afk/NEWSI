/**
 * probe/synthesis.test.ts — Captain synthesis (19.3.0 "Vanguard").
 *
 * Pins the capability the 19.2.0 review named as the remaining gap: the
 * Captain must REASON over its members' real outputs, not merely report
 * them — and it must do so the VH way: synthesis is the Captain's OWN
 * provider call with its OWN receipt, divergences are computed and surfaced,
 * a failed synthesis never fakes a combination, and a single-member run
 * never claims to synthesize.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

if (typeof globalThis.localStorage === "undefined") {
  const map = new Map<string, string>();
  (globalThis as unknown as { localStorage: Storage }).localStorage = {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, String(v)),
    removeItem: (k: string) => void map.delete(k),
    clear: () => void map.clear(),
    key: (i: number) => Array.from(map.keys())[i] ?? null,
    get length() { return map.size; },
  } as Storage;
}

import { askSelfImpulse19, responseCanonical } from "../src/engine/generalist";
import { extractClaimAtoms, findDivergences, buildSynthesisSystem, buildSynthesisUser } from "../src/engine/synthesis";
import { getCaptain, captainForRoute } from "../src/engine/captains";
import { TITLES } from "../src/engine/chain";
import type { ProviderConfig } from "../src/engine/types";

const prov: ProviderConfig = { kind: "openai-compatible", baseUrl: "https://api.openai.com/v1", apiKey: "sk-test-abcdefgh123456789", model: "gpt-test" };
const MULTI_TEXT = "write unit tests for the typescript parser and review the code changes";
const SYNTH_MARKER = "single synthesized domain result";

test("consul synthesis — reasoned collaboration over real executions (19.3.0, company chain)", async () => {
  let pass = 0, fail = 0;
  const check = (name: string, cond: boolean, detail?: unknown) => {
    cond ? pass++ : fail++;
    console.log(`  ${cond ? "ok  " : "FAIL"} ${name}${cond || detail === undefined ? "" : ` — ${JSON.stringify(detail)}`}`);
  };

  console.log("\n── 1. divergence detection is computed, not asserted ──");
  const atoms = extractClaimAtoms("Coverage reached 85% on 2026-09-10 per https://example.org/r at cost $1,200 (v2.1).");
  check("percentages, ISO dates, money, versions and URLs all extract", ["85%", "2026-09-10", "$1,200", "v2.1", "https://example.org/r"].every((v) => atoms.some((a) => a.value.includes(v.toLowerCase().replace("v2.1", "2.1")) || a.value.includes(v.toLowerCase()))), atoms);
  check("atoms are deduped", extractClaimAtoms("85% and again 85%").filter((a) => a.value === "85%").length === 1);
  check("a claim-free text yields no atoms", extractClaimAtoms("the function returns a value").length === 0);

  const div = findDivergences([
    { specialistId: "a", text: "Coverage is 85% as of 2026-09-10." },
    { specialistId: "b", text: "Coverage is 90% as of 2026-09-10." },
  ]);
  check("atoms all members back are corroborated", div.corroborated.some((c) => c.includes("2026-09-10")), div);
  check("conflicting atoms are surfaced as single-sourced, never dropped", div.singleSourced.some((s) => s.atom.includes("85%")) && div.singleSourced.some((s) => s.atom.includes("90%")), div.singleSourced);
  check("single-sourced atoms name their backing member", div.singleSourced.every((s) => s.backedBy.length === 1 && ["a", "b"].includes(s.backedBy[0])));
  check("members compared counts only executed answers", div.membersCompared === 2 && findDivergences([{ specialistId: "a", text: "" }]).membersCompared === 0);

  console.log("\n── 2. the synthesis prompts carry the honesty rules ──");
  const captain = getCaptain("captain.code");
  assert.ok(captain);
  const sys = buildSynthesisSystem(captain);
  check("the synthesis prompt forbids inventing facts", sys.includes("Never invent facts"));
  check("the synthesis prompt demands divergences be named", sys.includes("say so explicitly"));
  const user = buildSynthesisUser("the task", [{ name: "Spec A", text: "answer A 85%" }, { name: "Spec B", text: "answer B 90%" }], div);
  check("the synthesis input carries the task, both member answers and the divergence notes", user.includes("the task") && user.includes("answer A 85%") && user.includes("answer B 90%") && user.includes("DIVERGENCE NOTES"));
  check("a clean comparison says so instead of staying silent", buildSynthesisUser("t", [{ name: "A", text: "x" }], findDivergences([{ specialistId: "a", text: "x" }])).includes("none detected"));

  console.log("\n── 3. end to end: multi-member run ends in the Captain's OWN synthesis ──");
  let memberNo = 0;
  const calls: string[] = [];
  const synthFetch = (async (_input: unknown, init?: unknown) => {
    const body = String(((init ?? {}) as RequestInit).body ?? "");
    calls.push(body);
    let content: string;
    if (body.includes("Rank these specialist ids")) content = "re-rank noise";
    // The synthesis double deliberately emits a stray tool fence — the
    // pipeline must strip it before the text reaches the user or the digest.
    else if (body.includes(SYNTH_MARKER)) content = "SYNTHESIZED RESULT: reconciled coverage at 85% (Spec A is dated; Spec B's 90% is single-sourced). Next step: add the regression suite.\n\u0060\u0060\u0060tool\n{\"tool\":\"fs.read\",\"input\":{\"path\":\"x\"}}\n\u0060\u0060\u0060";
    else { memberNo++; return new Response(JSON.stringify({ choices: [{ message: { content: `member work ${memberNo === 1 ? "A: coverage is 85% as of 2026-09-10 per https://example.org/a" : `B: coverage is 90% — tests pass`}` } }] }), { status: 200 }); }
    return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });
  }) as unknown as typeof fetch;

  const multi = await askSelfImpulse19({ text: MULTI_TEXT, userId: "synth-probe" }, { provider: prov, fetchImpl: synthFetch });
  const nMem = multi.specialistIds.length;
  check("the request multi-routed", nMem > 1, nMem);
  check("synthesis exists and is its own receipted record", multi.synthesis !== undefined && /^[0-9a-f]{64}$/.test(multi.synthesis?.digest ?? ""), multi.synthesis?.digest);
  check("the synthesis digest is NOT any member digest", !(multi.captain?.members ?? []).some((m) => m.memberDigest === multi.synthesis?.digest));
  check("the reply leads with the consul synthesis, then keeps every member section as evidence", multi.reply.includes(`${TITLES.consul.toUpperCase()} SYNTHESIS`) && multi.reply.includes("SYNTHESIZED RESULT") && multi.reply.includes("MEMBER EVIDENCE") && multi.reply.includes("member work A") && multi.reply.includes("member work B"));
  const expectedCaptain = captainForRoute(multi.specialistIds);
  check("the synthesis names the captain of the routed domain", expectedCaptain !== null && multi.synthesis?.captainId === expectedCaptain.id && multi.synthesis?.captainName === expectedCaptain.name, { got: multi.synthesis?.captainId, want: expectedCaptain?.id });
  check("divergences travelled with the record", (multi.synthesis?.divergences.singleSourced.length ?? 0) > 0 && multi.synthesis?.divergences.membersCompared === nMem, multi.synthesis?.divergences);
  check("a stray tool fence in the synthesis output is stripped before user or digest", !(multi.synthesis?.text ?? "").includes("\u0060\u0060\u0060tool") && !(multi.reply ?? "").includes("\u0060\u0060\u0060tool"));
  check("the note receipts the synthesis honestly", (multi.note ?? "").includes(`${TITLES.consul.toLowerCase()} synthesis`), multi.note);
  check("the synthesis rides inside the provenance digest", JSON.parse(responseCanonical({ ...multi, provenanceDigest: "" })).synthesis?.digest === multi.synthesis?.digest);
  check(`provider arithmetic: re-rank + ${nMem} members + 1 synthesis`, calls.length === nMem + 2, { calls: calls.length, nMem });

  console.log("\n── 4. a failed synthesis call never fakes a combination ──");
  memberNo = 0;
  const failSynthFetch = (async (_input: unknown, init?: unknown) => {
    const body = String(((init ?? {}) as RequestInit).body ?? "");
    if (body.includes("Rank these specialist ids")) return new Response(JSON.stringify({ choices: [{ message: { content: "re-rank noise" } }] }), { status: 200 });
    if (body.includes(SYNTH_MARKER)) return new Response(JSON.stringify({ error: "synthesis engine down" }), { status: 500 });
    memberNo++;
    return new Response(JSON.stringify({ choices: [{ message: { content: `member work ${memberNo}` } }] }), { status: 200 });
  }) as unknown as typeof fetch;
  const failedSynth = await askSelfImpulse19({ text: MULTI_TEXT, userId: "synth-probe" }, { provider: prov, fetchImpl: failSynthFetch });
  check("no synthesis record exists", failedSynth.synthesis === undefined);
  check("the failure is stated in words", (failedSynth.note ?? "").includes("synthesis attempted, failed honestly") && failedSynth.reply.includes("FAILED"), failedSynth.note);
  check("every member answer still stands in the reply", failedSynth.reply.includes("member work 1") && failedSynth.reply.includes("member work 2"));
  check("the run is still honestly executed", failedSynth.executed === true && failedSynth.outcome === "answered");

  console.log("\n── 5. synthesis only reasons over EXECUTED members ──");
  memberNo = 0;
  const partialFetch = (async (_input: unknown, init?: unknown) => {
    const body = String(((init ?? {}) as RequestInit).body ?? "");
    if (body.includes("Rank these specialist ids")) return new Response(JSON.stringify({ choices: [{ message: { content: "re-rank noise" } }] }), { status: 200 });
    if (body.includes(SYNTH_MARKER)) return new Response(JSON.stringify({ choices: [{ message: { content: "should never be called with one executed member" } }] }), { status: 200 });
    memberNo++;
    // ONLY the first member executes — every later member call fails, so
    // exactly one executed member remains, whatever the routing width.
    if (memberNo > 1) return new Response(JSON.stringify({ error: "member down" }), { status: 500 });
    return new Response(JSON.stringify({ choices: [{ message: { content: `member work ${memberNo}` } }] }), { status: 200 });
  }) as unknown as typeof fetch;
  const partial = await askSelfImpulse19({ text: MULTI_TEXT, userId: "synth-probe" }, { provider: prov, fetchImpl: partialFetch });
  check("with one executed member, no synthesis is attempted", partial.synthesis === undefined);
  check("the captain reads partial and the reply keeps both truths", partial.captain?.status === "partial" && partial.reply.includes("ERROR"));

  console.log("\n── 6. a single-member run never claims to synthesize ──");
  // "describe the tcp three way handshake" deterministically routes to
  // exactly one specialist — pinned in the routing table, not assumed.
  const single = await askSelfImpulse19(
    { text: "describe the tcp three way handshake", userId: "synth-probe" },
    { provider: prov, fetchImpl: (async () => new Response(JSON.stringify({ choices: [{ message: { content: "SYNACK: one clean answer." } }] }), { status: 200 })) as unknown as typeof fetch, gate: async () => ({ approved: true }) },
  );
  check("the route really is single-member", single.specialistIds.length === 1, single.specialistIds);
  check("single member ⇒ executed answer with NO synthesis field", single.outcome === "answered" && single.synthesis === undefined);

  console.log(`\n${fail === 0 ? "✅" : "❌"} synthesis probe: ${pass} passed, ${fail} failed\n`);
  assert.equal(fail, 0, `${fail} synthesis checks failed`);
});
