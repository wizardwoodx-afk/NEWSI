/**
 * probe/navAlign.test.ts â€” shell alignment probe (the one shell, src/ui/Shell.tsx).
 *
 * The 19.7.12 redesign replaced the 19.6.6 console with one quiet shell; 19.7.13
 * added the sixth door, and the Specialists door the seventh â€” the generalist domain
 * surface, with the Indian-finance pack hosted as one of its nine domains, and the
 * Federation door the eighth â€” the A2A mounting surface, which the bundling of an
 * A2A host had made real in the architecture but invisible in the product. The live
 * door set is eight â€” Steward Â· Work Â· Specialists Â· Federation Â· Receipts Â· Docs Â·
 * Memory Â· Settings â€” with one store and one composer.
 * This suite pins the structure mechanically:
 *  - App renders the shell and nothing else
 *  - the sidebar carries exactly the eight doors + status + owner â€” every one wired
 *  - the composer is the single command surface (Enter sends through the store)
 *  - the human gate is a card with approve/refuse, never a silent skip
 *  - the crew is internal: Work shows AGENT nn, never a specialist name
 */
import * as fs from "node:fs";
import * as path from "node:path";

let passed = 0;
let failed = 0;
const failures: string[] = [];
function ok(label: string, cond: boolean, detail = ""): void {
  if (cond) { passed++; console.log(`  ok   ${label}`); }
  else { failed++; failures.push(`${label}${detail ? ` â€” ${detail}` : ""}`); console.log(`  FAIL ${label}${detail ? ` â€” ${detail}` : ""}`); }
}

declare const SI_ROOT: string | undefined;
const ROOT = typeof SI_ROOT === "string" && SI_ROOT.length > 0 ? SI_ROOT : process.cwd();
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8");

const appSrc = read("src/App.tsx");
const shellSrc = read("src/ui/si/SiShell.tsx");
const storeSrc = read("src/ui/store.ts");
const workSrc = read("src/ui/screens/Work.tsx");
const gateSrc = read("src/ui/screens/GateCard.tsx");
const composerSrc = read("src/ui/screens/Composer.tsx");
const settingsSrc = read("src/ui/screens/Settings.tsx");

const pkg = JSON.parse(read("package.json")) as { name?: string };
ok("root resolves to SelfImpulse", pkg.name === "selfimpulse", `name=${String(pkg.name)}`);

ok("App renders the shell and nothing else", /import\s*\{\s*Shell\s*\}\s*from\s*["']\.\/ui\/Shell["']/.test(appSrc) && /<Shell\s*\/>/.test(appSrc), "App must be the shell door");
ok("the multi-dock shell and the console are gone from the app entry", !/Sidebar|Helm|VIEWS|NextConsole/.test(appSrc), "stale shell chrome in App.tsx");
/* 19.7.13 â€” this pin said "exactly five doors" and matched only those five keys,
   so a SIXTH door (src/ui/screens/Docs.tsx) would have been added while the check
   stayed green â€” a gate that had stopped describing the shell. The door list is
   now the full set, the count matches the labels actually rendered, and the
   render wiring for every door is pinned alongside it. The Specialists door joined
   the list, the count AND the wiring pin in the same change that shipped it, and
   the Federation door did the same â€” a new door that is not simultaneously wired
   is a door that navigates nowhere. */
const NAV_KEYS = ["steward", "work", "specialists", "federation", "receipts", "docs", "memory", "settings"];
const navEntries = shellSrc.match(/\{ key: "([a-z]+)", label: "[A-Za-z ]+", icon: "[a-z]+" \}/g) ?? [];
ok("the sidebar lists exactly eight doors", navEntries.length === 8, `door count drifted: ${navEntries.length}`);
ok("the eight doors are Steward Â· Work Â· Specialists Â· Federation Â· Receipts Â· Docs Â· Memory Â· Settings",
  NAV_KEYS.every((k) => new RegExp(`key: "${k}", label:`).test(shellSrc)) &&
  NAV_KEYS.every((k) => new RegExp(`screen === "${k}"`).test(shellSrc)),
  "a door is listed but not rendered, or vice versa");
/* 19.8 â€” every door is now wrapped in its own ErrorBoundary, so a throw in one
   screen cannot blank the shell. That wrapping changed the literal the two pins
   below matched on (`screen === "docs" && <Docs />`), and the naive fix is to
   loosen them. That would have been wrong: the pin exists to catch a door that
   is LISTED IN THE SIDEBAR BUT NEVER RENDERED, and a regex that accepts "docs"
   appearing anywhere would stop catching exactly that.
   So the pins now require BOTH halves explicitly â€” the screen is rendered, AND
   it is rendered through the boundary â€” and a new pin asserts that no door is
   rendered bare. */
const rendersThroughBoundary = (key: string, comp: string) =>
  new RegExp(`screen === "${key}" && door\\("${key}", <${comp} \\/>\\)`).test(shellSrc);
ok("every door renders through its own error boundary",
  NAV_KEYS.every((k) => rendersThroughBoundary(k, k === "steward" ? "Steward" : k[0]!.toUpperCase() + k.slice(1))),
  "a door is rendered bare, so its crash would take the whole shell");
ok("the conversation door is bounded too and can return to the Captain",
  /screen === "chat" && \(\s*<ErrorBoundary label="Conversation"/.test(shellSrc) && /onLeave=\{\(\) => go\("steward"\)\}/.test(shellSrc));
ok("the Docs door renders the document-distillation surface",
  rendersThroughBoundary("docs", "Docs") && /Propose knowledge/.test(read("src/ui/screens/Docs.tsx")) &&
  /Nothing is installed until you decide/.test(read("src/ui/screens/Docs.tsx")),
  "the Docs door must reach the knowledge proposal seam and install nothing itself");
const specSrc = read("src/ui/screens/Specialists.tsx");
ok("the Specialists door renders the generalist pack",
  rendersThroughBoundary("specialists", "Specialists") &&
  /from "\.\.\/\.\.\/specialists"/.test(specSrc) &&
  /toolsForDomain\(domain\)/.test(specSrc) && /DOMAINS\.map/.test(specSrc),
  "the door must render the pack's own tool registry, not a hand-written list");
ok("the generalist surface states the same boundary for every domain",
  /Engines compute; they do not act/.test(specSrc) && /gated/.test(specSrc),
  "the generalist door must carry the compute-not-act statement too");
ok("no Crew door â€” the crew is internal", !/label:\s*"Crew"/.test(shellSrc) && !/label:\s*"Agents"/.test(shellSrc), "the crew must not face the user");
// 20.1: the shell was rebuilt under src/ui/si/SiShell.tsx and its classes were
// namespaced (`status` -> `si-provider`, `me` -> `si-owner`) so they cannot
// collide with the legacy vh.css rules. The WIRING is what this probe is about:
// both foot controls must still open Settings. Asserting the new names keeps the
// original intent — a path change alone would have silently passed.
ok("the status pill and the owner card sit below the doors and open Settings", /className="si-provider" onClick=\{\(\) => go\("settings"\)\}/.test(shellSrc) && /className="si-owner" onClick=\{\(\) => go\("settings"\)\}/.test(shellSrc), "sidebar foot not wired");
ok("no keyboard-shortcut hints on the surface", !/âŒ˜K|âŒ˜N|Cmd\+K|Ctrl\+K/.test(shellSrc + read("src/ui/screens/Steward.tsx")), "shortcut hints leaked");
ok("the composer is the single command surface and Enter sends", /onKeyDown=\{\(e\) => \{ if \(e\.key === "Enter" && !e\.shiftKey\)/.test(composerSrc) && /onSend\(\)/.test(composerSrc), "composer not wired to send");
/* 19.8 â€” the subject now comes from the identity seam rather than the removed
   `USER` constant. The pin additionally requires that a run with no subject is
   REFUSED before the engine is reached, which is the property that actually
   matters here: a receipt has to name someone, and there must be no path that
   produces one naming nobody. */
ok("send goes through the store to askSelfImpulse19 with the gate and handoff seams, and refuses an unattributed run",
  /send:\s*async \(raw\)/.test(storeSrc) &&
  /await askSelfImpulse19\(\{ text: sentText, userId: subject \}, runDeps\(get, set, gateFn\)\)/.test(storeSrc) &&
  /provider: get\(\)\.provider, gate: gateFn,/.test(storeSrc) &&
  /onHandoff:/.test(storeSrc) &&
  /const subject = currentSubject\(\);/.test(storeSrc) &&
  /if \(!subject\)/.test(storeSrc),
  "store send is not the engine path, or an unattributed run is not refused first");
ok("the human gate is a card with approve and refuse, never a silent skip", /Your approval is needed/.test(gateSrc) && /Approve once/.test(gateSrc) && /Refuse/.test(gateSrc), "gate card missing");
ok("Work names agents AGENT nn â€” never by specialist name", /AGENT \$\{String\(i \+ 1\)\.padStart\(2, "0"\)\}/.test(workSrc) && !/sp\?\.name|specialist\.name/.test(workSrc), "agent names leaked");
ok("first-time users can connect a model provider inside Settings", /Provider/.test(settingsSrc) && /PROVIDER_DEFAULTS/.test(settingsSrc) && /setProvider\(/.test(settingsSrc), "provider onboarding missing");
ok("the federation key resolves through the hardened authority seam", /authorityOwnerIdentity/.test(read("src/engine/federation/live.ts")) && !/exportKey\(["']jwk["']\)/.test(read("src/engine/federation/live.ts")), "raw key storage in the live seam");

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) { console.log("\nfailures:"); for (const f of failures) console.log(`  - ${f}`); }
process.exit(failed > 0 ? 1 : 0);
