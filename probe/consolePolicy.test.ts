/**
 * probe/consolePolicy.test.ts — the 19.7.2 final-product policy.
 *
 * Pins what the user asked for and the review confirmed:
 *   • NO version numbers in the app UI (the console never imports the version);
 *   • NO "Generalist" in any rendered string (the agent is the Captain —
 *     the owner names it; internal code identifiers are not user-facing);
 *   • NO demo/simulated wording in the console (the product speaks work);
 *   • the theme system ships: cream-gray tokens + boot-time application;
 *   • provider semantics are EXACT: session-only removes storage and never
 *     seals; remember-on-this-machine requires an unlocked vault;
 *   • every specialist rides the operator doctrine (maturity contract);
 *   • the agent loop gives members five real steps.
 */
import * as fs from "node:fs";
import * as path from "node:path";

let passed = 0;
let failed = 0;
const failures: string[] = [];
function ok(label: string, cond: boolean, detail = ""): void {
  if (cond) { passed++; console.log(`  ok   ${label}`); }
  else { failed++; failures.push(`${label}${detail ? ` — ${detail}` : ""}`); console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`); }
}

declare const SI_ROOT: string | undefined;
const ROOT = typeof SI_ROOT === "string" && SI_ROOT.length > 0 ? SI_ROOT : process.cwd();
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8");

// 19.7.12 (UI): the console is retired; the policy now binds the shell, the
// screens and the ONE store (src/ui). "consoleSrc" is the concatenated primary
// surface — everything a user sees outside Settings → About.
const SURFACE = ["src/ui/Shell.tsx", "src/ui/screens/Steward.tsx", "src/ui/screens/Work.tsx", "src/ui/screens/Receipts.tsx", "src/ui/screens/Memory.tsx", "src/ui/screens/Chat.tsx", "src/ui/screens/Composer.tsx", "src/ui/screens/GateCard.tsx"];
const consoleSrc = SURFACE.map(read).join("\n");
const storeSrc = read("src/ui/store.ts");
const settingsSrc = read("src/ui/screens/Settings.tsx");
const css = read("src/ui/vh.css");
const main = read("src/main.tsx");
const skills = read("src/engine/skills.ts");
const loop = read("src/engine/agentLoop.ts");

console.log("== the final-product policy ==");
ok("the primary surface never imports the version — no numbers in the app", !/from "\.\.\/version"|from "\.\.\/\.\.\/version"|ENGINE_VERSION/.test(consoleSrc), "a version surface leaked into the UI");
ok("no surface states a version — Settings → About names the product and the engine from brand.ts", !/ENGINE_VERSION/.test(settingsSrc) && !/"\d+\.\d+\.\d+/.test(settingsSrc) && /ENGINE_CREDIT/.test(settingsSrc));

const rendered = (consoleSrc + settingsSrc)
  .replace(/GeneralistFace|GeneralistMood|GeneralistResponse|generalistName|setGeneralistName|from "\.\.\/engine\/generalist"/g, "");
ok("no rendered string says Generalist — the agent is the Captain", !rendered.includes("Generalist"));
ok("the Captain rename is real (Settings → Captain, through the store)", settingsSrc.includes("renameSteward(") && /<h3>Captain<\/h3>/.test(settingsSrc) && /renameSteward:\s*\(n\)\s*=>\s*set\(\{\s*stewardName:\s*setGeneralistName\(n\)/.test(storeSrc));
ok("the crew never faces the user by name", !/specialist\.name|sp\.name|\.name\}/.test(read("src/ui/screens/Work.tsx")) && /AGENT/.test(read("src/ui/screens/Work.tsx")));

ok("no demo/simulated wording on the surface", !consoleSrc.includes("labelled demo") && !consoleSrc.includes("demo mission") && !/simulat/i.test(consoleSrc));

console.log("== the theme system ==");
/* The intent of this check is that the light theme is a COMPLETE override, not
 * a sparse one — a missing token silently inherits the dark value, which is how
 * a light theme ends up with dark-theme ink. Naming one hex (#FAF7F1) tested
 * neither: it passed or failed on a tuning value while saying nothing about
 * completeness, and it went red when the paper was deliberately re-stepped to
 * #F7F7F5. So this now enumerates the token set the light block must own, and
 * additionally pins the boot-ground parity that index.html:29-35 depends on. */
const lightBlock = css.match(/\[data-theme=light\]\s*\{([\s\S]*?)\n\}/m)?.[1] ?? "";
const LIGHT_MUST_OWN = ["bg", "bg-deep", "s1", "s2", "s3", "line", "line-2", "fg", "fg-2", "fg-3", "accent", "accent-fg", "accent-soft", "ok", "warn", "bad", "shadow-1", "shadow-4", "glass"];
const lightMissing = LIGHT_MUST_OWN.filter((t) => !new RegExp(`--${t}:`).test(lightBlock));
ok("the light theme ships as full token overrides", lightMissing.length === 0,
  `light block is missing: ${lightMissing.join(", ") || "none"}`);
ok("the theme applies before first paint", main.includes("vh.theme.v2") && main.includes('dataset.theme = "light"'));
ok("Settings carries the switch", settingsSrc.includes('setTheme("dark")') && settingsSrc.includes('setTheme("light")'));
ok("no blue anywhere in the design system", !/#[0-9a-f]{0,2}[0-4][0-9a-f][0-9a-f]?[89a-f][0-9a-f]\b/i.test("") && !/\b(blue|indigo|#2563eb|#3b82f6|#1e40af)\b/i.test(css));

console.log("== provider semantics are exact ==");
ok("session-only never seals (persist=false returns before any vault call)", /if \(!persist\) return \{ ok: true, note: "key kept in memory for this session only" \};/.test(storeSrc));
ok("remember-on-this-machine REQUIRES an unlocked vault", /const v = vaultStatus\(\);\s*if \(v\.status !== "unlocked"\) return/.test(storeSrc));
ok("persist seals with vaultSeal only after that check", /vaultSeal\(PROVIDER_STORAGE_KEY, JSON\.stringify\(cfg\)\)/.test(storeSrc));
ok("removing the provider removes the stored copy", /forgetProvider:\s*\(\)\s*=>\s*\{\s*vaultRemove\(PROVIDER_STORAGE_KEY\)/.test(storeSrc));
ok("the Settings checkbox is the persist switch and says what it does", settingsSrc.includes("Remember on this device") && settingsSrc.includes("Needs an unlocked Key vault"));
ok("boot purges a legacy plaintext key and never re-stores it", /purgePlain\(PROVIDER_STORAGE_KEY\)/.test(storeSrc) && !/localStorage\.setItem\(PROVIDER_STORAGE_KEY/.test(storeSrc));

console.log("== the fleet's maturity contract ==");
ok("the operator doctrine exists and leads with verify-before-claim", skills.includes("Operator doctrine") && skills.includes("Verify before you claim"));
ok("EVERY specialist's composed prompt carries the doctrine", /buildSpecialistPrompt[\s\S]*OPERATOR_DOCTRINE/.test(skills));
ok("all five rules ship", ["Evidence over prose", "Fail forward", "Self-review before answering", "Stay in scope"].every((r) => skills.includes(r)));
ok("members get five real steps", loop.includes("MAX_AGENT_STEPS = 5"));

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) { console.log("\nfailures:"); for (const f of failures) console.log(`  - ${f}`); }
process.exit(failed > 0 ? 1 : 0);
