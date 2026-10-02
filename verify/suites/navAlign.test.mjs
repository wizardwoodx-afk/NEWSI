import { createRequire as __mjCreateRequire } from "node:module"; const require = __mjCreateRequire(import.meta.url);

// probe/navAlign.test.ts
import * as fs from "node:fs";
import * as path from "node:path";
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
var ROOT = ".".length > 0 ? "." : process.cwd();
var read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
var appSrc = read("src/App.tsx");
var shellSrc = read("src/ui/si/SiShell.tsx");
var storeSrc = read("src/ui/store.ts");
var workSrc = read("src/ui/screens/Work.tsx");
var gateSrc = read("src/ui/screens/GateCard.tsx");
var composerSrc = read("src/ui/screens/Composer.tsx");
var settingsSrc = read("src/ui/screens/Settings.tsx");
var pkg = JSON.parse(read("package.json"));
ok("root resolves to SelfImpulse", pkg.name === "selfimpulse", `name=${String(pkg.name)}`);
ok("App renders the shell and nothing else", /import\s*\{\s*Shell\s*\}\s*from\s*["']\.\/ui\/Shell["']/.test(appSrc) && /<Shell\s*\/>/.test(appSrc), "App must be the shell door");
ok("the multi-dock shell and the console are gone from the app entry", !/Sidebar|Helm|VIEWS|NextConsole/.test(appSrc), "stale shell chrome in App.tsx");
var NAV_KEYS = ["steward", "work", "specialists", "federation", "receipts", "docs", "memory", "settings"];
var navEntries = shellSrc.match(/\{ key: "([a-z]+)", label: "[A-Za-z ]+", icon: "[a-z]+" \}/g) ?? [];
ok("the sidebar lists exactly eight doors", navEntries.length === 8, `door count drifted: ${navEntries.length}`);
ok(
  "the eight doors are Steward \xC2\xB7 Work \xC2\xB7 Specialists \xC2\xB7 Federation \xC2\xB7 Receipts \xC2\xB7 Docs \xC2\xB7 Memory \xC2\xB7 Settings",
  NAV_KEYS.every((k) => new RegExp(`key: "${k}", label:`).test(shellSrc)) && NAV_KEYS.every((k) => new RegExp(`screen === "${k}"`).test(shellSrc)),
  "a door is listed but not rendered, or vice versa"
);
var rendersThroughBoundary = (key, comp) => new RegExp(`screen === "${key}" && door\\("${key}", <${comp} \\/>\\)`).test(shellSrc);
ok(
  "every door renders through its own error boundary",
  NAV_KEYS.every((k) => rendersThroughBoundary(k, k === "steward" ? "Steward" : k[0].toUpperCase() + k.slice(1))),
  "a door is rendered bare, so its crash would take the whole shell"
);
ok(
  "the conversation door is bounded too and can return to the Captain",
  /screen === "chat" && \(\s*<ErrorBoundary label="Conversation"/.test(shellSrc) && /onLeave=\{\(\) => go\("steward"\)\}/.test(shellSrc)
);
ok(
  "the Docs door renders the document-distillation surface",
  rendersThroughBoundary("docs", "Docs") && /Propose knowledge/.test(read("src/ui/screens/Docs.tsx")) && /Nothing is installed until you decide/.test(read("src/ui/screens/Docs.tsx")),
  "the Docs door must reach the knowledge proposal seam and install nothing itself"
);
var specSrc = read("src/ui/screens/Specialists.tsx");
ok(
  "the Specialists door renders the generalist pack",
  rendersThroughBoundary("specialists", "Specialists") && /from "\.\.\/\.\.\/specialists"/.test(specSrc) && /toolsForDomain\(domain\)/.test(specSrc) && /DOMAINS\.map/.test(specSrc),
  "the door must render the pack's own tool registry, not a hand-written list"
);
ok(
  "the generalist surface states the same boundary for every domain",
  /Engines compute; they do not act/.test(specSrc) && /gated/.test(specSrc),
  "the generalist door must carry the compute-not-act statement too"
);
ok("no Crew door \xE2\u20AC\u201D the crew is internal", !/label:\s*"Crew"/.test(shellSrc) && !/label:\s*"Agents"/.test(shellSrc), "the crew must not face the user");
ok("the status pill and the owner card sit below the doors and open Settings", /className="si-provider" onClick=\{\(\) => go\("settings"\)\}/.test(shellSrc) && /className="si-owner" onClick=\{\(\) => go\("settings"\)\}/.test(shellSrc), "sidebar foot not wired");
ok("no keyboard-shortcut hints on the surface", !/âŒ˜K|âŒ˜N|Cmd\+K|Ctrl\+K/.test(shellSrc + read("src/ui/screens/Steward.tsx")), "shortcut hints leaked");
ok("the composer is the single command surface and Enter sends", /onKeyDown=\{\(e\) => \{ if \(e\.key === "Enter" && !e\.shiftKey\)/.test(composerSrc) && /onSend\(\)/.test(composerSrc), "composer not wired to send");
ok(
  "send goes through the store to askSelfImpulse19 with the gate and handoff seams, and refuses an unattributed run",
  /send:\s*async \(raw\)/.test(storeSrc) && /await askSelfImpulse19\(\{ text: sentText, userId: subject \}, runDeps\(get, set, gateFn\)\)/.test(storeSrc) && /provider: get\(\)\.provider, gate: gateFn,/.test(storeSrc) && /onHandoff:/.test(storeSrc) && /const subject = currentSubject\(\);/.test(storeSrc) && /if \(!subject\)/.test(storeSrc),
  "store send is not the engine path, or an unattributed run is not refused first"
);
ok("the human gate is a card with approve and refuse, never a silent skip", /Your approval is needed/.test(gateSrc) && /Approve once/.test(gateSrc) && /Refuse/.test(gateSrc), "gate card missing");
ok("Work names agents AGENT nn \xE2\u20AC\u201D never by specialist name", /AGENT \$\{String\(i \+ 1\)\.padStart\(2, "0"\)\}/.test(workSrc) && !/sp\?\.name|specialist\.name/.test(workSrc), "agent names leaked");
ok("first-time users can connect a model provider inside Settings", /Provider/.test(settingsSrc) && /PROVIDER_DEFAULTS/.test(settingsSrc) && /setProvider\(/.test(settingsSrc), "provider onboarding missing");
ok("the federation key resolves through the hardened authority seam", /authorityOwnerIdentity/.test(read("src/engine/federation/live.ts")) && !/exportKey\(["']jwk["']\)/.test(read("src/engine/federation/live.ts")), "raw key storage in the live seam");
console.log(`
${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log("\nfailures:");
  for (const f of failures) console.log(`  - ${f}`);
}
process.exit(failed > 0 ? 1 : 0);
