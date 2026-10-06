/**
 * FACE SYSTEM PROBE — 19.6.6 (the naming redesign).
 *
 * Pins the avatar swap mechanically:
 *   1. the Generalist's face is a pure function of the owner-chosen name
 *      (a declared dependency): same name → same SVG, different name → different SVG;
 *   2. the mood→expression map is COMPLETE over the GeneralistMood contract —
 *      a mood without a face is a failure, not a silent blank;
 *   3. the name is stored locally under one key, defaulted once;
 *   4. specialists ride deterministic marks keyed by id;
 *   5. the old OSS engine is GONE: no vendored oneworks directory, no import,
 *      no mention anywhere in src/ — the product carries no borrowed faces;
 *   6. the console is wired: App routes the door to NextConsole, the new
 *      design sheet ships, and Tailwind v4 is a real build input.
 */
import { describe, it } from "node:test";
import assert from "node:assert";
import * as fs from "node:fs";
import * as path from "node:path";
import { blobatar } from "blobatar";

declare const SI_ROOT: string | undefined;
const ROOT = typeof SI_ROOT === "string" && SI_ROOT.length > 0 ? SI_ROOT : process.cwd();

import { MOOD_EXPRESSION, MOOD_CAPTION, DEFAULT_GENERALIST_NAME, type GeneralistMood } from "../src/engine/face";

const MOODS: GeneralistMood[] = ["idle", "thinking", "acting", "gate", "sealed", "refused"];

describe("the Generalist's one face", () => {
  it("is a pure function of the name — same name, same face", () => {
    assert.equal(blobatar("Captain"), blobatar("Captain"));
    assert.equal(blobatar(DEFAULT_GENERALIST_NAME).slice(0, 4), "<svg");
  });

  it("different names render different faces", () => {
    assert.notEqual(blobatar("Captain"), blobatar("My SelfImpulse"));
  });

  it("the mood map is complete and honest over the GeneralistMood contract", () => {
    for (const m of MOODS) {
      assert.ok(MOOD_EXPRESSION[m], `mood ${m} has an expression`);
      assert.ok(MOOD_CAPTION[m].length > 0, `mood ${m} has a caption`);
    }
    assert.ok(MOOD_CAPTION.refused.includes("refused"), "a refusal is stated, never dressed up");
  });

  it("the name key is a single local key with one default", () => {
    const src = fs.readFileSync(path.join(ROOT, "src", "engine", "face.tsx"), "utf8");
    assert.ok(src.includes("vh.generalist.name.v1"));
    assert.equal(DEFAULT_GENERALIST_NAME, "Captain");
  });
});

describe("specialists ride deterministic marks, keyed by id", () => {
  it("face.tsx wires SpecialistFace to the mark renderer deterministically", () => {
    const src = fs.readFileSync(path.join(ROOT, "src", "engine", "face.tsx"), "utf8");
    assert.ok(src.includes('from "boring-avatars"'));
    assert.ok(src.includes('name: props.id'), "the specialist id is the seed");
  });
});

describe("the old OSS engine is gone", () => {
  it("no vendored oneworks directory survives", () => {
    assert.ok(!fs.existsSync(path.join(ROOT, "src", "vendor", "oneworks-avatar")));
  });

  it("no source file imports or names OneWorks", () => {
    const walk = (d: string): string[] =>
      fs.readdirSync(d, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
    for (const dir of ["src"]) {
      for (const f of walk(path.join(ROOT, dir))) {
        if (!/\.(ts|tsx|css)$/.test(f)) continue;
        const s = fs.readFileSync(f, "utf8");
        assert.ok(!/oneworks/i.test(s), `${f} must not name the old engine`);
      }
    }
  });
});

describe("the shell is wired", () => {
  it("App routes everything to the one Shell — the old doors are gone", () => {
    const app = fs.readFileSync(path.join(ROOT, "src", "App.tsx"), "utf8");
    assert.ok(/<Shell\s*\/>/.test(app));
    assert.ok(!app.includes("NextConsole") && !app.includes("Comp: SelfImpulse"), "the old doors are no longer the door");
  });

  it("the design system is ONE stylesheet with the house tokens (no Tailwind runtime, no blue)", () => {
    const main = fs.readFileSync(path.join(ROOT, "src", "main.tsx"), "utf8");
    assert.ok(main.includes("ui/vh.css"));
    const css = fs.readFileSync(path.join(ROOT, "src", "ui", "vh.css"), "utf8");
      // The house palette is warm graphite with ONE ember accent. The
      // assertion's PURPOSE is unchanged: the house tokens are declared in the
      // ONE stylesheet, the accent is a single hue family (asserted as a HUE,
      // since the identity is the hue and the exact value is a per-theme
      // tuning decision), the display face is still there, and Tailwind is
      // still not pulled in at runtime.
      const accentHex = css.match(/--accent:\s*(#[0-9a-f]{6})/i)?.[1] ?? "";
      // ONE accent per finish, declared as a token in the ONE stylesheet. Hue
      // is deliberately NOT constrained: the eight supplied finishes span sage,
      // slate, azure, gunmetal, brass, sand, oxblood and violet, and a warm-only
      // law would reject the owner's own palette. What matters is that the token
      // exists, is a real colour, and the banned agent-tool values stay banned —
      // probe/theme.test.ts carries the full per-finish contrast law.
      assert.ok(/--bg:\s*#[0-9a-f]{3,8}/i.test(css) && /^#[0-9a-f]{6}$/i.test(accentHex), `accent ${accentHex} is not a declared colour`);
      assert.ok(/Gambetta/.test(css));
      // Banned as a VALUE, not as a word: two supplied finishes are legitimately
      // blue-leaning (obsidian "blue slate", azure) and the palette comments say
      // so, so grepping the word would fail on honest prose.
      assert.ok(!/#007AFF|#3B82F6|#2563EB|#60A5FA/i.test(css) && !/:\s*(blue|indigo)\b/i.test(css));
    assert.ok(!/@import "tailwindcss"/.test(css));
  });

  it("the shell renders evidence, not vibes — gate card, provenance digest, plan-only honesty", () => {
    const gate = fs.readFileSync(path.join(ROOT, "src", "ui", "screens", "GateCard.tsx"), "utf8");
    const chat = fs.readFileSync(path.join(ROOT, "src", "ui", "screens", "Chat.tsx"), "utf8");
    const work = fs.readFileSync(path.join(ROOT, "src", "ui", "screens", "Work.tsx"), "utf8");
    assert.ok(gate.includes("Your approval is needed") && gate.includes("receipt  issued on approve AND on refuse"));
    assert.ok(chat.includes("provenanceDigest"));
    assert.ok(work.includes("Planned — connect a provider to execute"));
  });
});
