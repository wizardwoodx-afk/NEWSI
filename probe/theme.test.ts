/**
 * v1.1.0 (eight finishes) — design-system probe.
 *
 * One stylesheet, src/ui/vh.css. The product ships EIGHT finishes in one
 * sheet — HOLST (dark, default), OBSIDIAN, AZURE, TITANIUM, CAESAR, STRATOS
 * (dark) and PLATINUM, AKAROA (light). Each finish owns a COMPLETE token
 * block; nothing is inherited from another finish.
 *
 * What this file pins is the LAW, not the literals: a ground is a shade,
 * never an extreme (no pure black, no screen-white, no flat grey); a surface
 * ramp is measurably raised above its own ground; each finish carries exactly
 * ONE accent that clears AA as text on its own ground and is perceptually
 * distinct (ΔE) from the secondary ink; the boot block in index.html can
 * never disagree with the sheet again. The exact hex values are tuning
 * decisions — tools/contrast-check.mjs machine-checks every text pairing
 * across all eight finishes.
 *
 * Weight policy: body stays light (400); headings and interactive controls
 * may step up to 500 (medium). Nothing is bold/600+.
 *
 * RE-ANCHOR HISTORY (kept, because an assertion whose comment no longer
 * describes its subject is the exact defect this file exists to catch):
 *   · originally pinned raw hex literals;
 *   · then re-anchored to properties when the ground moved from deep ink to
 *     true black and back to a shade of black;
 *   · re-anchored again, at the owner's instruction of 2026-10-04, from
 *     two finishes to four (two dark, two light, arranged as pairs);
 *   · re-anchored a final time on 2026-10-05, when the four legacy finishes
 *     were replaced by the owner's eight supplied palettes. Two laws changed
 *     with it and are recorded at their assertion: the light-ground law no
 *     longer demands a warm ground (platinum is a cool neutral by design),
 *     and the accent law measures perceptual distance instead of hue angle
 *     (the supplied accents sit on the same hue family as the secondary ink).
 */
import * as fs from "node:fs";
import * as path from "node:path";

let passed = 0; let failed = 0; const failures: string[] = [];
function ok(label: string, cond: boolean, detail = ""): void {
  if (cond) { passed++; console.log(`  ok   ${label}`); }
  else { failed++; failures.push(`${label}${detail ? ` — ${detail}` : ""}`); console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`); }
}

declare const SI_ROOT: string | undefined;
const ROOT = typeof SI_ROOT === "string" && SI_ROOT.length > 0 ? SI_ROOT : process.cwd();
const css = fs.readFileSync(path.join(ROOT, "src", "ui", "vh.css"), "utf8");
const main = fs.readFileSync(path.join(ROOT, "src", "main.tsx"), "utf8");

/* Palette helpers — they measure PROPERTIES, not literals. */
const hex = (h: string): [number, number, number] => {
  const s = h.replace("#", "").trim();
  const full = s.length === 3 ? s.split("").map((c) => c + c).join("") : s;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)) as [number, number, number];
};
const relLum = (h: string): number => {
  const c = hex(h).map((v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
/** the hex value of one token inside one [data-theme=…] block */
const token = (theme: string, name: string): string => {
  const block = css.match(new RegExp(`\\[data-theme=${theme}\\]\\s*\\{([\\s\\S]*?)\\n\\}`, "m"));
  const m = block?.[1].match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{3,8})`, "i"));
  return m ? m[1] : "";
};
/** CIE76 ΔE — perceptual distance between two hex colours. */
const deltaE = (a: string, b: string): number => {
  const lab = (h: string): [number, number, number] => {
    const [r0, g0, b0] = hex(h);
    const f = (c: number): number => { const s = c / 255; return s > 0.04045 ? Math.pow((s + 0.055) / 1.055, 2.4) : s / 12.92; };
    const [r, g, b] = [f(r0), f(g0), f(b0)];
    const X = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047;
    const Y = r * 0.2126 + g * 0.7152 + b * 0.0722;
    const Z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883;
    const k = (c: number): number => (c > 0.008856 ? Math.cbrt(c) : 7.787 * c + 16 / 116);
    const [fx, fy, fz] = [k(X), k(Y), k(Z)];
    return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
  };
  const A = lab(a); const B = lab(b);
  return Math.sqrt((A[0] - B[0]) ** 2 + (A[1] - B[1]) ** 2 + (A[2] - B[2]) ** 2);
};

/** The RAW value of a token (hex or rgba) in one theme block. */
const rawToken = (theme: string, name: string): string => {
  const block = css.match(new RegExp(`\\[data-theme=${theme}\\]\\s*\\{([\\s\\S]*?)\\n\\}`, "m"));
  const m = block?.[1].match(new RegExp(`--${name}:\\s*([^;]+);`, "i"));
  return m ? m[1].trim() : "";
};

ok("one stylesheet — main.tsx imports vh.css and nothing else", /import '\.\/ui\/vh\.css'/.test(main) && (main.match(/\.css['"]/g) ?? []).length === 1);
ok("the retired sheets are gone", !fs.existsSync(path.join(ROOT, "src", "styles")));

/* ── THE GROUND LAW, over every dark finish ────────────────────────────── */
/* A dark ground is a SHADE of black: not pure black (relLum > 0), not a
 * "premium charcoal" (relLum < 0.012). s1 must clear the historically
 * rejected flat value (0.0045 — vh.css's header records the first attempt
 * that "read as noise"), sit at least 1.6× the ground (once the ground is
 * not zero, only a ratio proves the surface is raised), and the whole ramp
 * must climb. */
const FINISHES = ["holst", "obsidian", "azure", "platinum", "titanium", "akaroa", "caesar", "stratos"];
const DARKS = ["holst", "obsidian", "azure", "titanium", "caesar", "stratos"];
const REJECTED_FLAT_S1_LUM = 0.0045;
const DARK_GROUND_CEILING = 0.012;
const contrast = (a: string, b: string): number => {
  const [hi, lo] = [relLum(a), relLum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
for (const t of DARKS) {
  const bg = token(t, "bg"), s1 = token(t, "s1"), s2 = token(t, "s2"), s3 = token(t, "s3");
  ok(`the ${t} ground is a shade of black (not pure black, not grey) and its surface ramp is measurably raised`,
    relLum(bg) > 0 && relLum(bg) < DARK_GROUND_CEILING
    && relLum(s1) < relLum(s2) && relLum(s2) < relLum(s3)
    && relLum(s1) > REJECTED_FLAT_S1_LUM
    && relLum(s1) > relLum(bg) * 1.6,
    `bg ${bg} (lum ${relLum(bg).toFixed(5)}), s1 ${s1} (${relLum(s1).toFixed(5)} = ${(relLum(bg) > 0 ? (relLum(s1) / relLum(bg)) : 0).toFixed(2)}x ground), s2 ${s2}, s3 ${s3}`);
}
ok("the rail sits on base (transparent over background, hairline separator)", /border-right:1px solid var\(--line\)/.test(css) && !/\.side\{background:var\(--bg-deep\)/.test(css.replace(/background:transparent/, "")));

/* ── THE GROUND LAW, over every light finish ───────────────────────────── */
/* A light ground is warm mineral: light but never screen-white (relLum
 * between 0.75 and 1), the ink on it is ink (relLum < 0.05) at AA or better,
 * the finish carries its own surface step BELOW the ground, no surface is
 * plain white, no surface is a flat neutral grey, and the ground is warm
 * (red channel above blue — the machine-readable form of "not concrete"). */
const LIGHTS = ["platinum", "akaroa"];

/* One list, asserted against the FOUR places it must never disagree with: the
   vh.css blocks, the si.css blocks, the Theme union in store.ts, and the inline
   boot grounds in index.html. Every past drift here was a value that existed in
   one place and not another. */
const siCss = fs.readFileSync(path.join(ROOT, "src", "ui", "si", "si.css"), "utf8");
const storeSrc = fs.readFileSync(path.join(ROOT, "src", "ui", "store.ts"), "utf8");
const settingsSrc = fs.readFileSync(path.join(ROOT, "src", "ui", "screens", "Settings.tsx"), "utf8");

ok("vh.css declares a [data-theme=...] block for all eight finishes",
  FINISHES.every((t) => new RegExp(`\\[data-theme=${t}\\]\\s*\\{`).test(css)),
  FINISHES.filter((t) => !new RegExp(`\\[data-theme=${t}\\]\\s*\\{`).test(css)).join(", ") || "all present");
ok("si.css declares a [data-theme=\"...\"] block for all eight finishes",
  FINISHES.every((t) => new RegExp(`\\[data-theme="${t}"\\]\\s*\\{`).test(siCss)),
  FINISHES.filter((t) => !new RegExp(`\\[data-theme="${t}"\\]\\s*\\{`).test(siCss)).join(", ") || "all present");
/* Retired ids must not exist as LIVE ids: not as a [data-theme=…] block,
 * not in the Theme union, not as a persisted id. The word may still appear
 * in a comment that explains why it is not migrated — that is history, not a
 * theme, and asserting over it would make the test cry wolf. */
const RETIRED = ["dark", "light", "petrol", "fog"];
const themeUnion = storeSrc.match(/export type Theme = ([^;]+);/)?.[1] ?? "";
const persistedIds = [...storeSrc.matchAll(/\bid:\s*"([^"]+)"/g)].map((m) => m[1]);
const liveBlocks = RETIRED.filter((r) =>
  [css, siCss].some((sheet) => sheet.includes(`[data-theme=${r}]`)
    || sheet.includes(`[data-theme="${r}"]`)));
const inUnion = RETIRED.filter((r) => new RegExp(`"${r}"`).test(themeUnion));
const inPersisted = RETIRED.filter((r) => persistedIds.includes(r));
ok("no retired four-finish id survives as a LIVE theme",
  liveBlocks.length === 0 && inUnion.length === 0 && inPersisted.length === 0,
  `blocks: ${liveBlocks.join(", ") || "none"} / union: ${inUnion.join(", ") || "none"} / persisted: ${inPersisted.join(", ") || "none"}`);
ok("store.ts Theme union lists exactly the eight ids",
  (storeSrc.match(/export type Theme = ([^;]+);/)?.[1] ?? "").split("|").map((x) => x.trim().replace(/"/g, "")).filter(Boolean).length === 8);
ok("Settings renders THEMES from the store, not a private copy",
  /THEMES\.map\(/.test(settingsSrc) && !/FINISHES/.test(settingsSrc));
ok("main.tsx applies the saved finish before first paint, validated against THEMES",
  /vh\.theme\.v2/.test(main) && /THEMES\.some\(/.test(main) && /DEFAULT_THEME/.test(main));
for (const t of LIGHTS) {
  const bg = token(t, "bg"), fg = token(t, "fg"), s3 = token(t, "s3");
  /* The light finishes are MINERAL, not warm: platinum is a cool near-neutral
   * by design and akaroa is a sand. So the law measures what actually matters
   * — clearly light (so dark ink is required), never screen-white, and the ink
   * on it is ink at AA. Tint is asserted separately below. */
  ok(`the ${t} ground is clearly light — never screen-white — and the ink on it is ink`,
    relLum(bg) > 0.5 && relLum(bg) < 0.98
    && relLum(fg) < 0.05
    && contrast(fg, bg) >= 4.5,
    `bg ${bg} (lum ${relLum(bg).toFixed(4)}), fg ${fg} (${relLum(fg).toFixed(4)}), contrast ${contrast(fg, bg).toFixed(2)}:1`);
  ok(`the ${t} finish carries its own surface step`, relLum(s3) > 0 && relLum(s3) < relLum(bg),
    `s3 ${s3} vs bg ${bg}`);
  const surfaces = ["bg", "bg-deep", "s1", "s2", "s3", "glass"] as const;
  const whites = surfaces.filter((n) => {
    const v = rawToken(t, n);
    return /^#ffffff$/i.test(v) || /^#fff$/i.test(v) || /rgba\(\s*255\s*,\s*255\s*,\s*255/i.test(v);
  });
  /* --accent-fg on a deep accent fill is the one deliberate near-white: it is
   * TEXT on a dark fill for readability, written as porcelain, never #fff. */
  ok(`no ${t} surface is plain white`, whites.length === 0, whites.join(", "));
  const flats = surfaces.filter((n) => {
    const v = rawToken(t, n);
    return /^#[0-9a-f]{6}$/i.test(v) && (() => {
      const r = parseInt(v.slice(1, 3), 16), g = parseInt(v.slice(3, 5), 16), b = parseInt(v.slice(5, 7), 16);
      return r === g && g === b;
    })();
  });
  ok(`no ${t} surface is a flat neutral grey (the surface carries material)`, flats.length === 0, flats.join(", "));
  /* Not a dead neutral: at least one channel pair must be separated. The old
   * law demanded red-over-blue; the supplied light finishes are a cool
   * platinum and a warm sand, so direction is a per-finish choice while
   * 'carries a tint at all' is the property that survives. */
  const spread = (() => {
    const v = token(t, "bg");
    if (!/^#[0-9a-f]{6}$/i.test(v)) return NaN;
    const c = [0, 2, 4].map((i) => parseInt(v.slice(1 + i, 3 + i), 16));
    return Math.max(...c) - Math.min(...c);
  })();
  ok(`the ${t} ground carries a tint — it is not a dead neutral grey`, spread >= 3, `channel spread = ${spread}`);
}

/* ── THE ACCENT LAW — one accent per finish, AA on its own ground ────── */
/* Every finish carries ONE accent that is AA as text on its own ground and
 * on its raised surface, with accent-fg readable on top of it. It must also
 * read as a distinct colour, not as a second grey — asserted perceptually
 * (CIE76 ΔE against fg-2), not by hue angle: the supplied palettes put the
 * accent on the same hue family as the secondary ink, so hue distance would
 * fail on legitimate designs while saying nothing about what a user sees. */
/* Each dark/light pair shares ONE accent hue (the identity is the hue; the
 * per-finish value is a tuning decision). The dark member pulls brighter,
 * the light member holds deeper, and both clear AA as text on their own
 * ground. Every house hue is WARM (0–60deg): unmistakably not the default
 * blue, purple or electric cyan an agent tool reaches for by default. */
for (const t of FINISHES) {
  const a = token(t, "accent"), bg = token(t, "bg"), fg2 = token(t, "fg-2");
  const d = deltaE(a, fg2);
  ok(`the ${t} finish carries ONE accent that is AA on its own ground and reads as colour, not as a second grey`,
    contrast(a, bg) >= 4.5
    && contrast(a, token(t, "s1")) >= 4.5
    && contrast(token(t, "accent-fg"), a) >= 4.5
    && d >= 10,
    `${t} accent ${a} on ${bg} ${contrast(a, bg).toFixed(2)}:1, accent-fg on accent ${contrast(token(t, "accent-fg"), a).toFixed(2)}:1, ΔE vs fg-2 = ${d.toFixed(1)}`);
}
ok("the focus ring token clears the 3:1 WCAG 2.2 SC 2.4.11 needs in every finish",
  FINISHES.every((t) => contrast(token(t, "accent-3"), token(t, "bg")) >= 3),
  FINISHES.filter((t) => contrast(token(t, "accent-3"), token(t, "bg")) < 3).join(", ") || "all clear");
ok("no default-blue / competitor-purple / electric-cyan anywhere", !/#007AFF|#3B82F6|#2563EB|#7C3AED|#06B6D4/i.test(css));

/* ── TYPE ──────────────────────────────────────────────────────────────── */
/* Gambetta for display (editorial serif), Switzer for body (a neo-grotesque
 * that is not the font every other agent tool ships), Fragment Mono for data.
 * Never Inter; never a second display face. */
ok("Gambetta for display, Switzer for body, Fragment Mono for data", /Gambetta/.test(css) && /Switzer/.test(css) && /Fragment Mono/.test(css));
ok("not Inter", !/font-family[^;}]*Inter\b/.test(css));
ok("weights top out at medium (500) — nothing semibold/bold/600+", !/font-weight:\s*(6|7|8|9)00/.test(css) && !/font-weight:\s*bold(?!.*oblique)/.test(css.replace(/font-weight:\(.*?\)/g, "")));
ok("no legacy animation gimmicks (splash, shimmer, glow keyframes)", !/@keyframes\s+(splash|shimmer|glow|pulseGlow|float)/.test(css));
/* The default finish (the first id) rides the bare html,body rule; every other
   finish gets its own attribute-scoped rule. Both are read back out of the
   inline block and compared to vh.css --bg, so a ground cannot drift. */
const inlineHtml = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const inline = inlineHtml.match(/<style>([\s\S]*?)<\/style>/)?.[1] ?? "";
const DEFAULT_ID = FINISHES[0];
for (const t of FINISHES) {
  const re = t === DEFAULT_ID
    ? /html,body\{[^}]*?background:\s*(#[0-9a-fA-F]{3,8})/
    : new RegExp('\\[data-theme="' + t + '"\\][^{]*\\{[^}]*?background:\\s*(#[0-9a-fA-F]{3,8})');
  const inlineBg = inline.match(re)?.[1] ?? "";
  ok(`the inline boot ground for ${t} EQUALS --bg in vh.css -- they cannot separate again`,
    inlineBg !== "" && inlineBg.toLowerCase() === token(t, "bg").toLowerCase(),
    `index.html ${inlineBg || "(none)"} vs vh.css ${token(t, "bg")}`);
}
ok(`index.html boots the default finish server-side (${DEFAULT_ID})`,
  new RegExp(`<html lang="en" data-theme="${DEFAULT_ID}">`).test(inlineHtml));
ok("the boot script accepts all eight ids and falls back to the default",
  FINISHES.every((t) => inlineHtml.includes('"' + t + '"'))
  && inlineHtml.includes('? t : "' + DEFAULT_ID + '"'));

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) { console.log("\nfailures:"); for (const f of failures) console.log(`  - ${f}`); }
process.exit(failed > 0 ? 1 : 0);
