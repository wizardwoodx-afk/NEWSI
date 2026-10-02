/**
 * Renders the 19.7.12 shell to a string, in node, and checks what it actually says.
 *
 * Successor to probe/v10Page.test.tsx (which rendered the retired Proof page). The
 * reason is unchanged: `tsc --noEmit` proves types line up; it does not prove the
 * screen renders. A bad lookup or a `.map` over `undefined` type-checks perfectly
 * and then blanks the screen behind an error boundary. So this renders the REAL
 * shell and every door through `react-dom/server` and asserts on the output —
 * with no localStorage, no WebGL, no provider: the coldest first run there is.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import fs from "node:fs";
import path from "node:path";

/* The shell file the door list is DERIVED from — never a hardcoded list.
   A literal list is what let "the five doors are on screen" keep passing after a
   sixth door (Docs) shipped: the gate described a shell that no longer existed. */
declare const SI_ROOT: string;
const ROOT = SI_ROOT ?? process.cwd();
const read = (rel: string): string => fs.readFileSync(path.join(ROOT, rel), "utf8");
/** Every door the shell actually declares, in order: /\{ key: "x", label: "Y", icon: "z" \}/ */
// 20.1: the shell moved to src/ui/si/SiShell.tsx (src/ui/Shell.tsx is now a
// re-export). The door list itself is unchanged — same eight keys, same order.
function shellDoors(): Array<{ key: string; label: string }> {
  return [...read("src/ui/si/SiShell.tsx").matchAll(/\{ key: "([a-z]+)", label: "([A-Za-z ]+)", icon: "[a-z]+" \}/g)]
    .map((m) => ({ key: m[1] as string, label: m[2] as string }));
}

let passed = 0;
let failed = 0;
const failures: string[] = [];
function ok(label: string, cond: boolean, detail = ""): void {
  if (cond) { passed += 1; console.log(`  ok   ${label}`); }
  else { failed += 1; failures.push(`${label}${detail ? ` — ${detail}` : ""}`); console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`); }
}
function section(name: string): void { console.log(`\n== ${name}`); }
const strip = (html: string): string => html.replace(/<[^>]*>/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/\s+/g, " ");

// Minimal DOM shims the store touches at module-evaluation time (theme boot).
const g = globalThis as unknown as { document?: unknown; window?: unknown; ResizeObserver?: unknown; MutationObserver?: unknown };
if (!g.document) {
  g.document = { documentElement: { dataset: {}, style: {} }, createElement: () => ({ style: {}, setAttribute() {}, appendChild() {} }), head: { appendChild() {} }, fonts: [] };
}

async function main(): Promise<void> {
  const { Shell } = await import("../src/ui/Shell");
  const { useVh } = await import("../src/ui/store");
  const { Steward } = await import("../src/ui/screens/Steward");
  const { Work } = await import("../src/ui/screens/Work");
  const { Receipts } = await import("../src/ui/screens/Receipts");
  const { Memory } = await import("../src/ui/screens/Memory");
  const { Docs } = await import("../src/ui/screens/Docs");
  const { Specialists } = await import("../src/ui/screens/Specialists");
  const { default: Federation } = await import("../src/ui/screens/Federation");
  const { Settings } = await import("../src/ui/screens/Settings");
  const { Chat } = await import("../src/ui/screens/Chat");

  section("0. the shell renders cold (no storage, no provider, no WebGL)");
  let html = "";
  try { html = renderToStaticMarkup(createElement(Shell)); }
  catch (err) { ok("Shell renders without throwing", false, err instanceof Error ? err.message : String(err)); }
  ok("Shell renders without throwing", html.length > 1000, `${html.length} bytes`);
  const text = strip(html);
  /* 19.7.13 — DERIVED, not literalled. The old line asserted five door labels and
     said "the five doors are on screen", so when the Docs door shipped it kept
     passing while the shell had six: Docs could have been deleted from the shell
     and this gate would not have noticed. The expected set now comes from the
     shell source itself, the count is pinned exactly, and every door is rendered
     on its own in section 1 — the Specialists door (nine domains, the finance pack
     among them) joined as the seventh on exactly those terms, and Federation joined
     as the eighth on the same terms: a door with no render target fails here. */
  const doors = shellDoors();
  ok("the shell declares eight doors", doors.length === 8, `declared ${doors.length}: ${doors.map((d) => d.label).join(" · ")}`);
  ok("every declared door is on screen", doors.every((d) => text.includes(d.label)), `missing: ${doors.filter((d) => !text.includes(d.label)).map((d) => d.label).join(", ") || "none"}`);
  ok("the Docs door is among them", doors.some((d) => d.key === "docs" && d.label === "Docs"));
  ok("the Specialists door is among them", doors.some((d) => d.key === "specialists" && d.label === "Specialists"));
  /* The Captain surface was a centred chat hero and is now a work surface: the
     ledger when there is one, the execution contract when there is not. Both
     assertions below were re-pointed at the new surface. What they protect is
     unchanged — the opening screen must be unambiguous, and it must state
     honestly that nothing has executed without a provider. The old wording
     ("How can I help you today?", "Nothing executes yet.") was the thing that
     made it read as a chat demo, so the pins moved with the copy. */
  ok("the Captain surface opens on work, not a chat prompt", /Ledger|Nothing has run on this machine yet/.test(text), "opening surface missing");
  ok("it is honest about plan-only without a provider", /plan only|Plan-only/i.test(text) && /nothing executes/i.test(text), "no plan-only statement");
  ok("no version number on the primary surface", !/\b19\.\d+\.\d+/.test(text), (text.match(/\b19\.\d+\.\d+/) ?? [""])[0]);
  ok("no agent name leaks (Generalist / specialist ids)", !/Generalist|business\.|code\./.test(text), "internal names leaked");
  ok("no boot splash, no keyboard-shortcut hints", !/si-boot|⌘K|⌘N/.test(html), "leftover chrome");

  section("1. every door renders on its own, empty");
  /* Driven by the SAME derived set as the check above, so a door cannot be added
     to the shell without a render target here. Docs renders empty exactly like the
     rest: the honest first run, no document, no proposal. */
  const COMPONENTS: Record<string, () => JSX.Element> = {
    steward: Steward as unknown as () => JSX.Element,
    work: Work as unknown as () => JSX.Element,
    receipts: Receipts as unknown as () => JSX.Element,
    docs: Docs as unknown as () => JSX.Element,
    specialists: Specialists as unknown as () => JSX.Element,
    federation: Federation as unknown as () => JSX.Element,
    memory: Memory as unknown as () => JSX.Element,
    settings: Settings as unknown as () => JSX.Element,
  };
  for (const d of doors) {
    const C = COMPONENTS[d.key];
    if (!C) { ok(`${d.label} has a render target in this probe`, false, `no component mapped for key "${d.key}"`); continue; }
    let h = ""; let err = "";
    try { h = renderToStaticMarkup(createElement(C as () => JSX.Element)); } catch (e) { err = e instanceof Error ? e.message : String(e); }
    ok(`${d.label} renders without throwing`, h.length > 200 && !err, err || `${h.length} bytes`);
  }
  /* The Docs door's own promises, rendered cold: it offers the document path and
     says plainly that nothing installs itself. */
  /* The Federation door's promise, rendered cold: the app must say in words that
   * it does NOT open a listener by itself. A screen that quietly started a
   * federation host on launch would be a governance failure wearing a feature. */
  const fed = strip(renderToStaticMarkup(createElement(Federation as unknown as () => JSX.Element)));
  ok("the Federation door states that no listener starts on launch",
    /does not start a federation listener on launch/i.test(fed), "the launch-posture statement is missing");
  ok("…and explains what mounting actually does before offering the control",
    /signed agent card/.test(fed) && /Mount the A2A host/.test(fed), "the explanation or the control is missing");

  const docs = strip(renderToStaticMarkup(createElement(Docs as unknown as () => JSX.Element)));
  /* Pinned against what the door ACTUALLY renders cold (no document, no proposal):
     the document path, the empty state, and the human-decision promise. The
     post-propose note ("nothing is installed until you decide") is deliberately not
     asserted here — it only appears after a successful proposal, so requiring it in
     a cold render would have been asserting a screen that does not exist yet. */
  ok("Docs: offers the document path, installs nothing on its own, and states it",
    /Propose knowledge/.test(docs) && /Load a file/.test(docs) && /No documents yet/.test(docs) &&
    /asks you before anything is installed/.test(docs) && /structure/.test(docs),
    "the Docs door lost its document path or its human-decision statement");
  let chatHtml = ""; try { chatHtml = renderToStaticMarkup(createElement(Chat, { title: "Steward" })); } catch (e) { chatHtml = ""; }
  ok("Chat renders empty without throwing", chatHtml.length > 200 && /Nothing here yet/.test(strip(chatHtml)));

  section("2. the empty states say the truth, not a loading spinner");
  const work = strip(renderToStaticMarkup(createElement(Work)));
  ok("Work: 'No work yet' — not a spinner, not fake nodes", /No work yet/.test(work) && !/spinner|loading/i.test(work));
  const receipts = strip(renderToStaticMarkup(createElement(Receipts)));
  /* The strip used to label a count of state==="ok" rows as "Verified" while
     nothing in the render path ever verified a chain. It now reads "Recorded",
     and this asserts both halves: the honest label is present, and the
     unearned one cannot come back. */
  ok("Receipts: KPI strip renders zeros, not blanks", /0 Recorded/.test(receipts) && /No receipts yet/.test(receipts));
  ok("Receipts: the strip never claims verification it does not perform", !/Verified/.test(receipts),
    'a "Verified" label returned — counting state==="ok" rows is not verification');
  const memory = strip(renderToStaticMarkup(createElement(Memory)));
  ok("Memory: names where memory lives (on device)", /Nothing remembered yet|Memory is off/.test(memory) && /this device/.test(memory));

  section("3. state moves the surface — a gate renders as a decision, never a silent skip");
  // zustand v5 serves the store's INITIAL snapshot to react-dom/server (useSyncExternalStore
  // getServerSnapshot), so a setState() cannot be observed through SSR of a connected screen.
  // The gate is therefore pinned two ways: (a) the store's own transition and resolution,
  // (b) the Work door's source guard — a pending gate MUST defeat the empty state (the render
  // probe caught exactly this on first run: gate before any reply rendered "No work yet").
  let resolved: unknown = null;
  useVh.setState({ gate: { ask: { action: "delete branch", riskTier: "risky", specialistIds: ["x"], summary: "Remove the stale release branch." }, resolve: (d) => { resolved = d; }, askedAt: new Date().toISOString() }, busy: true });
  ok("a pending gate is visible in the store", useVh.getState().gate?.ask.action === "delete branch");
  const fs = await import("node:fs"); const path = await import("node:path");
  const workSrc = fs.readFileSync(path.join(process.cwd(), "src/ui/screens/Work.tsx"), "utf8");
  ok("Work never shows the empty state while a gate is pending", /\{!lastResp && !busy && !gate \? \(/.test(workSrc), "empty-state guard must include !gate");
  ok("Work floats the GateCard over the graph", /gate && <div className="gate-float"><GateCard \/><\/div>/.test(workSrc));
  useVh.getState().decideGate({ approved: false, reason: "not now" });
  ok("refusing resolves the engine's promise with the reason", JSON.stringify(resolved) === JSON.stringify({ approved: false, reason: "not now" }), JSON.stringify(resolved));
  ok("the gate is cleared after the decision", useVh.getState().gate === null);
  ok("a second decision is a no-op, never a double resolve", (() => { resolved = null; useVh.getState().decideGate({ approved: true }); return resolved === null; })());

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) { console.log("\nfailures:"); for (const f of failures) console.log(`  - ${f}`); }
  process.exit(failed > 0 ? 1 : 0);
}
void main();
