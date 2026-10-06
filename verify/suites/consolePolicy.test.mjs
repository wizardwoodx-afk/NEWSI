import { createRequire as __mjCreateRequire } from "node:module"; const require = __mjCreateRequire(import.meta.url);

// probe/consolePolicy.test.ts
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
    failures.push(`${label}${detail ? ` \u2014 ${detail}` : ""}`);
    console.log(`  FAIL ${label}${detail ? ` \u2014 ${detail}` : ""}`);
  }
}
var ROOT = ".".length > 0 ? "." : process.cwd();
var read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
var SURFACE = ["src/ui/Shell.tsx", "src/ui/screens/Steward.tsx", "src/ui/screens/Work.tsx", "src/ui/screens/Receipts.tsx", "src/ui/screens/Memory.tsx", "src/ui/screens/Chat.tsx", "src/ui/screens/Composer.tsx", "src/ui/screens/GateCard.tsx"];
var consoleSrc = SURFACE.map(read).join("\n");
var storeSrc = read("src/ui/store.ts");
var settingsSrc = read("src/ui/screens/Settings.tsx");
var css = read("src/ui/vh.css");
var main = read("src/main.tsx");
var skills = read("src/engine/skills.ts");
var loop = read("src/engine/agentLoop.ts");
console.log("== the final-product policy ==");
ok("the primary surface never imports the version \u2014 no numbers in the app", !/from "\.\.\/version"|from "\.\.\/\.\.\/version"|ENGINE_VERSION/.test(consoleSrc), "a version surface leaked into the UI");
ok("no surface states a version \u2014 Settings \u2192 About names the product and the engine from brand.ts", !/ENGINE_VERSION/.test(settingsSrc) && !/"\d+\.\d+\.\d+/.test(settingsSrc) && /ENGINE_CREDIT/.test(settingsSrc));
var rendered = (consoleSrc + settingsSrc).replace(/GeneralistFace|GeneralistMood|GeneralistResponse|generalistName|setGeneralistName|from "\.\.\/engine\/generalist"/g, "");
ok("no rendered string says Generalist \u2014 the agent is the Captain", !rendered.includes("Generalist"));
ok("the Captain rename is real (Settings \u2192 Captain, through the store)", settingsSrc.includes("renameSteward(") && /<h3>Captain<\/h3>/.test(settingsSrc) && /renameSteward:\s*\(n\)\s*=>\s*set\(\{\s*stewardName:\s*setGeneralistName\(n\)/.test(storeSrc));
ok("the crew never faces the user by name", !/specialist\.name|sp\.name|\.name\}/.test(read("src/ui/screens/Work.tsx")) && /AGENT/.test(read("src/ui/screens/Work.tsx")));
ok("no demo/simulated wording on the surface", !consoleSrc.includes("labelled demo") && !consoleSrc.includes("demo mission") && !/simulat/i.test(consoleSrc));
console.log("== the theme system ==");
var THEME_IDS = [...css.matchAll(/\[data-theme=([a-z0-9-]+)\]/g)].map((m) => m[1]).filter((v, i, a) => a.indexOf(v) === i);
var LIGHT_MUST_OWN = ["bg", "bg-deep", "s1", "s2", "s3", "line", "line-2", "fg", "fg-2", "fg-3", "accent", "accent-fg", "accent-soft", "ok", "warn", "bad", "shadow-1", "shadow-4", "glass"];
var incompleteFinish = THEME_IDS.filter((id) => {
  const block = css.match(new RegExp(`\\[data-theme=${id}\\]\\s*\\{([\\s\\S]*?)\\n\\}`, "m"))?.[1] ?? "";
  return LIGHT_MUST_OWN.some((t) => !new RegExp(`--${t}:`).test(block));
});
ok(
  "every finish ships full token overrides \u2014 none inherits a missing value from another",
  incompleteFinish.length === 0,
  incompleteFinish.join(", ") || "all eight complete"
);
ok(
  "the theme applies before first paint, validated against THEMES",
  main.includes("vh.theme.v2") && main.includes("THEMES.some(") && main.includes("dataset.theme")
);
ok(
  "Settings carries the switch \u2014 one picker, driven by THEMES",
  /THEMES\.map\(/.test(settingsSrc) && /setTheme\(id\)/.test(settingsSrc),
  "the picker must render from the store, not from a private id list"
);
ok(
  "no default-blue as a colour value anywhere in the design system",
  !/#2563eb|#3b82f6|#1e40af|#1d4ed8|#60a5fa|#93c5fd/i.test(css) && !/:\s*(blue|indigo|rebeccapurple)\b/i.test(css),
  "agent-tool default blues are banned as values; a palette may lean blue"
);
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
console.log(`
${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log("\nfailures:");
  for (const f of failures) console.log(`  - ${f}`);
}
process.exit(failed > 0 ? 1 : 0);
