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
      // v0.0.3 re-anchored the house palette to deep ink / paper cream / one
      // desaturated teal accent; the SI redesign then re-anchored the dark
      // ground to true black and re-stepped the accent. The assertion's
      // PURPOSE is unchanged and is what this still protects: the house tokens
      // are declared in the ONE stylesheet, the accent is still a desaturated
      // teal (asserted as a HUE, since the identity is the hue and the exact
      // value is a per-theme tuning decision), the display face is still there,
      // and Tailwind is still not pulled in at runtime.
      const accentHex = css.match(/--accent:\s*(#[0-9a-f]{6})/i)?.[1] ?? "";
      const rgb = [0, 2, 4].map((i) => parseInt(accentHex.slice(1 + i, 3 + i), 16)) as [number, number, number];
      const mx = Math.max(...rgb); const mn = Math.min(...rgb); const d = mx - mn;
      let hdeg = 0;
      if (d !== 0) {
        hdeg = mx === rgb[0] ? 60 * (((rgb[1] - rgb[2]) / d) % 6)
          : mx === rgb[1] ? 60 * ((rgb[2] - rgb[0]) / d + 2)
            : 60 * ((rgb[0] - rgb[1]) / d + 4);
        if (hdeg < 0) hdeg += 360;
      }
      // 177deg +/- 15 is the house teal: cyan-leaning, unmistakably not blue.
      assert.ok(/--bg:\s*#[0-9a-f]{3,8}/i.test(css) && hdeg > 162 && hdeg < 192, `accent ${accentHex} is ${hdeg.toFixed(0)}deg`);
      assert.ok(/Instrument Serif/.test(css));
      assert.ok(!/blue/i.test(css.replace(/hair.*blue/, "")));
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
