import { createRequire as __mjCreateRequire } from "node:module"; const require = __mjCreateRequire(import.meta.url);

// probe/patinaShell.test.ts
import fs from "node:fs";
import path from "node:path";
var root = ".".length > 0 ? "." : process.cwd();
var read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");
var passed = 0;
var failed = 0;
var failures = [];
function ok(label, cond, detail = "") {
  if (cond) {
    passed++;
    console.log(`  ok   ${label}`);
  } else {
    failed++;
    failures.push(`${label}${detail ? ` \xE2\u20AC\u201D ${detail}` : ""}`);
    console.log(`  FAIL ${label}${detail ? ` \xE2\u20AC\u201D ${detail}` : ""}`);
  }
}
function section(name) {
  console.log(`
== ${name}`);
}
section("0. the shell files exist \xE2\u20AC\u201D and the retired shells do not");
var SHELL_FILES = [
  "src/App.tsx",
  "src/main.tsx",
  "src/ui/si/SiShell.tsx",
  "src/ui/store.ts",
  "src/ui/vh.css",
  "src/ui/graph/ForceGraph.tsx",
  "src/ui/screens/Steward.tsx",
  "src/ui/screens/Work.tsx",
  "src/ui/screens/Receipts.tsx",
  "src/ui/screens/Docs.tsx",
  "src/ui/screens/Specialists.tsx",
  "src/ui/screens/Memory.tsx",
  "src/ui/screens/Settings.tsx",
  "src/ui/screens/Chat.tsx",
  "src/ui/screens/GateCard.tsx",
  "src/ui/screens/Composer.tsx"
];
for (const f of SHELL_FILES) ok(`${f} exists`, fs.existsSync(path.join(root, f)));
var RETIRED = ["src/views", "src/pages", "src/styles", "src/app/selfimpulse.tsx", "src/app/Sidebar.tsx", "src/app/Helm.tsx", "src/panels/Splash.tsx", "src/panels/Onboarding.tsx"];
for (const f of RETIRED) ok(`${f} is gone (no second UI in the tree)`, !fs.existsSync(path.join(root, f)));
section("1. App mounts the shell and nothing else");
var appSrc = read("src/App.tsx");
ok("App imports Shell from ./ui/Shell", /from\s*["']\.\/ui\/Shell["']/.test(appSrc));
ok("App renders <Shell />", /<Shell\s*\/>/.test(appSrc));
ok("no retired shell import survives in App", !/NextConsole|views\/|pages\/|Sidebar|Helm/.test(appSrc));
var mainSrc = read("src/main.tsx");
ok("main imports exactly one stylesheet (ui/vh.css)", (mainSrc.match(/import\s+['"][^'"]+\.css['"]/g) ?? []).length === 1 && /ui\/vh\.css/.test(mainSrc));
ok("no boot splash in index.html", !/si-boot|@keyframes/.test(read("index.html")));
section("2. the store is the ONLY path to the engine \xE2\u20AC\u201D screens never bypass it");
var storeSrc = read("src/ui/store.ts");
ok("the store drives askSelfImpulse19", /import\s*\{\s*askSelfImpulse19\s*\}\s*from\s*["']\.\.\/engine\/generalist["']/.test(storeSrc) && /await askSelfImpulse19\(/.test(storeSrc));
ok("the store passes the human gate into the engine", /gate:\s*gateFn/.test(storeSrc) && /gate:\s*\{\s*ask,\s*resolve/.test(storeSrc));
ok("the store records handoffs", /onHandoff:\s*\(h\)\s*=>\s*\{\s*recordHandoff\(h\)/.test(storeSrc));
ok("the store ingests memory after every run (idempotent by session id)", /ingestSession\(all,\s*\{\s*id:\s*s\.chatSessionId/.test(storeSrc));
for (const f of SHELL_FILES.filter((x) => x.startsWith("src/ui/screens/"))) {
  const src = read(f);
  ok(`${f} never imports the generalist engine directly`, !/engine\/generalist/.test(src));
  ok(`${f} never touches the provider vault directly`, !/engine\/vault/.test(src));
}
section("3. the human gate: approve or refuse \xE2\u20AC\u201D never a silent skip");
var gate = read("src/ui/screens/GateCard.tsx");
ok("the gate card offers Approve once", /Approve once/.test(gate) && /decideGate\(\{\s*approved:\s*true\s*\}\)/.test(gate));
ok("refusal carries a reason into the receipt", /decideGate\(\{\s*approved:\s*false,\s*reason:/.test(gate));
ok("the gate names the risk tier", /riskTier/.test(gate));
ok("Work floats the gate over the graph", /gate-float/.test(read("src/ui/screens/Work.tsx")) && /<GateCard\s*\/>/.test(read("src/ui/screens/Work.tsx")));
var dg = storeSrc.slice(storeSrc.indexOf("decideGate: (d) =>"));
var dgGuard = dg.indexOf("if (!g) return");
var dgClear = dg.indexOf("gate: null");
var dgResolve = dg.indexOf("g.resolve(d)");
ok(
  "the store resolves exactly the pending gate",
  dg.startsWith("decideGate: (d) =>") && dgGuard > -1 && dgClear > dgGuard && dgResolve > dgClear,
  "decideGate must bail without a gate, clear it, then resolve \xE2\u20AC\u201D in that order"
);
ok(
  "a gate decision is recorded, not dropped",
  /gateLog/.test(dg),
  "decideGate no longer persists the decision; approvals and refusals would vanish with the gate"
);
section("4. every primary action is wired to real state");
var shell = read("src/ui/si/SiShell.tsx");
ok("New mission resets the store", /onClick=\{newMission\}/.test(shell) && /newMission:\s*\(\)\s*=>\s*set\(/.test(storeSrc));
var shellDoors = [...shell.matchAll(/\{ key: "([a-z]+)", label: "([A-Za-z ]+)", icon: "[a-z]+" \}/g)].map((m) => m[1]);
ok(
  "the shell declares eight doors, Docs, Specialists and Federation among them",
  shellDoors.length === 8 && shellDoors.includes("docs") && shellDoors.includes("specialists") && shellDoors.includes("federation"),
  `declared ${shellDoors.length}: ${shellDoors.join(" \xC2\xB7 ")}`
);
ok(
  "every door is Steward \xC2\xB7 Work \xC2\xB7 Specialists \xC2\xB7 Federation \xC2\xB7 Receipts \xC2\xB7 Docs \xC2\xB7 Memory \xC2\xB7 Settings",
  ["steward", "work", "specialists", "federation", "receipts", "docs", "memory", "settings"].every((k) => shellDoors.includes(k)),
  shellDoors.join(" \xC2\xB7 ")
);
ok("the crew never faces the user by name \xE2\u20AC\u201D Work renders AGENT nn tags", /AGENT \$\{String\(i \+ 1\)\.padStart\(2, "0"\)\}/.test(read("src/ui/screens/Work.tsx")));
var composer = read("src/ui/screens/Composer.tsx");
ok("Enter sends (Shift+Enter breaks a line)", /e\.key === "Enter" && !e\.shiftKey/.test(composer) && /onSend\(\)/.test(composer));
var settings = read("src/ui/screens/Settings.tsx");
ok("Settings connects a provider through the store", /setProvider\(\{\s*kind,\s*baseUrl/.test(settings));
ok("Settings creates/unlocks the vault through the store", /createVault\(pass\)/.test(settings) && /unlockVault\(pass\)/.test(settings));
ok("the Memory door opens a remembered conversation on double-click", /onNodeDoubleClick=\{open\}/.test(read("src/ui/screens/Memory.tsx")) && /openConversation\(/.test(read("src/ui/screens/Memory.tsx")));
section("5. two graphs, deliberately different");
var fg = read("src/ui/graph/ForceGraph.tsx");
ok("Work is a top-down DAG with arrows", /dagMode\(work \? "td"/.test(fg) && /linkDirectionalArrowLength\(work \? 3\.5 : 0\)/.test(fg));
ok("Memory is an organic cluster (no DAG, no arrows, no particles)", /linkDirectionalParticles\(\(l: FgLink\) => \(work \?/.test(fg) && /linkDirectionalArrowLength\(work \? 3\.5 : 0\)/.test(fg));
ok("the graph is a real OSS renderer (3d-force-graph), not a hand-rolled canvas", /import\("3d-force-graph"\)/.test(fg));
console.log(`
${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log("\nfailures:");
  for (const f of failures) console.log(`  - ${f}`);
}
process.exit(failed > 0 ? 1 : 0);
