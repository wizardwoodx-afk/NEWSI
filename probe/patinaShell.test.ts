/**
 * Shell probe â€” the one shell (src/ui/Shell.tsx).
 *
 * History: this suite pinned the Patina shell (selfimpulse.tsx + five views), then the
 * 19.6.6 Federation Console. Both are retired. The 19.7.12 redesign shipped ONE
 * shell and ONE store (src/ui/store.ts) that is the only path to the engine;
 * 19.7.13 added the sixth door (Docs). The live door set is Steward Â· Work Â·
 * Receipts Â· Docs Â· Memory Â· Settings.
 * The guarantees are the same ones the older shells were held to: the app
 * mounts exactly this shell, the screens never bypass the store to reach the
 * engine, every primary action is wired, and the human gate cannot be skipped.
 */
import fs from "node:fs";
import path from "node:path";

declare const SI_ROOT: string | undefined;
const root = typeof SI_ROOT === "string" && SI_ROOT.length > 0 ? SI_ROOT : process.cwd();
const read = (rel: string) => fs.readFileSync(path.join(root, rel), "utf8");

let passed = 0;
let failed = 0;
const failures: string[] = [];
function ok(label: string, cond: boolean, detail = ""): void {
  if (cond) { passed++; console.log(`  ok   ${label}`); }
  else { failed++; failures.push(`${label}${detail ? ` â€” ${detail}` : ""}`); console.log(`  FAIL ${label}${detail ? ` â€” ${detail}` : ""}`); }
}
function section(name: string): void { console.log(`\n== ${name}`); }

section("0. the shell files exist â€” and the retired shells do not");
const SHELL_FILES = [
  "src/App.tsx", "src/main.tsx", "src/ui/si/SiShell.tsx", "src/ui/store.ts", "src/ui/vh.css",
  "src/ui/graph/ForceGraph.tsx",
  "src/ui/screens/Steward.tsx", "src/ui/screens/Work.tsx", "src/ui/screens/Receipts.tsx",
  "src/ui/screens/Docs.tsx",
  "src/ui/screens/Specialists.tsx",
  "src/ui/screens/Memory.tsx", "src/ui/screens/Settings.tsx", "src/ui/screens/Chat.tsx",
  "src/ui/screens/GateCard.tsx", "src/ui/screens/Composer.tsx",
];
for (const f of SHELL_FILES) ok(`${f} exists`, fs.existsSync(path.join(root, f)));
const RETIRED = ["src/views", "src/pages", "src/styles", "src/app/selfimpulse.tsx", "src/app/Sidebar.tsx", "src/app/Helm.tsx", "src/panels/Splash.tsx", "src/panels/Onboarding.tsx"];
for (const f of RETIRED) ok(`${f} is gone (no second UI in the tree)`, !fs.existsSync(path.join(root, f)));

section("1. App mounts the shell and nothing else");
const appSrc = read("src/App.tsx");
ok("App imports Shell from ./ui/Shell", /from\s*["']\.\/ui\/Shell["']/.test(appSrc));
ok("App renders <Shell />", /<Shell\s*\/>/.test(appSrc));
ok("no retired shell import survives in App", !/NextConsole|views\/|pages\/|Sidebar|Helm/.test(appSrc));
const mainSrc = read("src/main.tsx");
/* This asserted "exactly one stylesheet", naming ui/vh.css — a sheet nothing
   imports any more, so the check failed forever and stopped meaning anything.
   Worse, "exactly one" is the wrong rule: si.css went unimported for a whole
   release and the shell rendered with no rail, no borders and no surfaces,
   because the markup depended on rules that never reached the page. What
   matters is that every sheet the shell needs IS imported, and that the design
   layer loads last so its :root can override ink.css. */
ok("main imports every stylesheet the shell depends on, design layer last",
  /import\s+['"]\.\/ui\/ink\.css['"]/.test(mainSrc) && /import\s+['"]\.\/ui\/si\/si\.css['"]/.test(mainSrc) &&
  /import\s+['"]\.\/ui\/theme\.css['"]/.test(mainSrc) &&
  mainSrc.indexOf("ui/si/si.css") < mainSrc.indexOf("ui/theme.css"));
ok("no boot splash in index.html", !/si-boot|@keyframes/.test(read("index.html")));

section("2. the store is the ONLY path to the engine â€” screens never bypass it");
const storeSrc = read("src/ui/store.ts");
ok("the store drives askSelfImpulse19", /import\s*\{\s*askSelfImpulse19\s*\}\s*from\s*["']\.\.\/engine\/generalist["']/.test(storeSrc) && /await askSelfImpulse19\(/.test(storeSrc));
ok("the store passes the human gate into the engine", /gate:\s*gateFn/.test(storeSrc) && /gate:\s*\{\s*ask,\s*resolve/.test(storeSrc));
ok("the store records handoffs", /onHandoff:\s*\(h\)\s*=>\s*\{\s*recordHandoff\(h\)/.test(storeSrc));
ok("the store ingests memory after every run (idempotent by session id)", /ingestSession\(all,\s*\{\s*id:\s*s\.chatSessionId/.test(storeSrc));
for (const f of SHELL_FILES.filter((x) => x.startsWith("src/ui/screens/"))) {
  const src = read(f);
  ok(`${f} never imports the generalist engine directly`, !/engine\/generalist/.test(src));
  ok(`${f} never touches the provider vault directly`, !/engine\/vault/.test(src));
}

section("3. the human gate: approve or refuse â€” never a silent skip");
const gate = read("src/ui/screens/GateCard.tsx");
ok("the gate card offers Approve", /Approve/.test(gate) && /decideGate\(\{\s*approved:\s*true\s*\}\)/.test(gate));
ok("refusal carries a reason into the receipt", /decideGate\(\{\s*approved:\s*false,\s*reason:/.test(gate));
ok("the gate names the risk tier", /riskTier/.test(gate));
ok("Work floats the gate over the graph", /gate-float/.test(read("src/ui/screens/Work.tsx")) && /<GateCard\s*\/>/.test(read("src/ui/screens/Work.tsx")));
/* The old check was a regex over the exact one-line source of decideGate, so it
   pinned formatting rather than behaviour â€” any legitimate change to the body
   (such as recording the decision) failed it. What actually matters is the
   ORDER: bail if there is no pending gate, clear it, and only then resolve, so
   a double click can never resolve the same gate twice. Assert that. */
const dg = storeSrc.slice(storeSrc.indexOf("decideGate: (d) =>"));
const dgGuard = dg.indexOf("if (!g) return");
const dgClear = dg.indexOf("gate: null");
const dgResolve = dg.indexOf("g.resolve(d)");
ok("the store resolves exactly the pending gate",
  dg.startsWith("decideGate: (d) =>") && dgGuard > -1 && dgClear > dgGuard && dgResolve > dgClear,
  "decideGate must bail without a gate, clear it, then resolve â€” in that order");
ok("a gate decision is recorded, not dropped", /gateLog/.test(dg),
  "decideGate no longer persists the decision; approvals and refusals would vanish with the gate");

section("4. every primary action is wired to real state");
const shell = read("src/ui/si/SiShell.tsx");
ok("New mission resets the store", /onClick=\{newMission\}/.test(shell) && /newMission:\s*\(\)\s*=>\s*set\(/.test(storeSrc));
/* 19.7.13 â€” was `[five labels].every(...)`, which is ADDITIVE-BLIND: the check
   only asked whether those five were present, so a sixth door could ship (and Docs
   did) while this stayed green â€” and Docs could equally have been deleted from the
   shell without failing it. The doors are now DERIVED from the shell source and the
   count is pinned, so the set can only change deliberately. */
// 20.1: read the real shell (src/ui/si/SiShell.tsx); src/ui/Shell.tsx is now a
// re-export and carries no door list. Same eight doors, same keys.
const shellDoors = [...shell.matchAll(/\{ key: "([a-z]+)", label: "([A-Za-z ]+)", icon: "[a-z]+" \}/g)].map((m) => m[1] as string);
ok("the shell declares eight doors, Docs, Specialists and Federation among them",
  shellDoors.length === 8 && shellDoors.includes("docs") && shellDoors.includes("specialists") && shellDoors.includes("federation"),
  `declared ${shellDoors.length}: ${shellDoors.join(" Â· ")}`);
ok("every door is Steward Â· Work Â· Specialists Â· Federation Â· Receipts Â· Docs Â· Memory Â· Settings",
  ["steward", "work", "specialists", "federation", "receipts", "docs", "memory", "settings"].every((k) => shellDoors.includes(k)),
  shellDoors.join(" Â· "));
ok("the crew never faces the user by name â€” Work renders AGENT nn tags", /AGENT \$\{String\(i \+ 1\)\.padStart\(2, "0"\)\}/.test(read("src/ui/screens/Work.tsx")));
const composer = read("src/ui/screens/Composer.tsx");
ok("Enter sends (Shift+Enter breaks a line)", /e\.key === "Enter" && !e\.shiftKey/.test(composer) && /onSend\(\)/.test(composer));
const settings = read("src/ui/screens/Settings.tsx");
ok("Settings connects a provider through the store", /setProvider\(\{\s*kind,\s*baseUrl/.test(settings));
ok("Settings creates/unlocks the vault through the store", /createVault\(pass\)/.test(settings) && /unlockVault\(pass\)/.test(settings));
/* Opening a memory used to be a double-click on a graph node — undiscoverable,
   unlabelled, and unreachable without a mouse. The invariant this check exists
   for is that a remembered conversation can be opened from this door; the
   gesture was never the point, and the button is a stronger guarantee of it. */
ok("the Memory door opens a remembered conversation through an explicit control",
  /onClick=\{\(\) => openConversation\(s\.id\)\}/.test(read("src/ui/screens/Memory.tsx")) && /Open the conversation/.test(read("src/ui/screens/Memory.tsx")));

section("5. two graphs, deliberately different");
const fg = read("src/ui/graph/ForceGraph.tsx");
ok("Work is a top-down DAG with arrows", /dagMode\(work \? "td"/.test(fg) && /linkDirectionalArrowLength\(work \? 3\.5 : 0\)/.test(fg));
ok("Memory is an organic cluster (no DAG, no arrows, no particles)", /linkDirectionalParticles\(\(l: FgLink\) => \(work \?/.test(fg) && /linkDirectionalArrowLength\(work \? 3\.5 : 0\)/.test(fg));
ok("the graph is a real OSS renderer (3d-force-graph), not a hand-rolled canvas", /import\("3d-force-graph"\)/.test(fg));

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) { console.log("\nfailures:"); for (const f of failures) console.log(`  - ${f}`); }
process.exit(failed > 0 ? 1 : 0);
