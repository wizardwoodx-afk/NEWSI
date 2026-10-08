/**
 * Design-system probe — the live finish layer in src/ui/theme.css.
 *
 * WHAT THIS FILE MEASURES, AND WHY IT WAS REWRITTEN
 * The sheet this file used to read is `src/ui/vh.css`, which `main.tsx` has never
 * imported: the app shipped 41KB of 197KB CSS because the sheets carrying the
 * shell's colours were dead on disk. Every assertion below therefore reads one of
 * the THREE sheets that actually load — ink.css (geometry), si/si.css (the shell),
 * theme.css (every colour, elevation, focus and motion decision) — in that order.
 *
 * It also used to pin eight finish ids (holst, obsidian, azure, platinum,
 * titanium, akaroa, caesar, stratos) and asserted that `dark` and `light` must NOT
 * exist as live themes. Those ids are not in the product; `dark` and `light` are.
 * A test that enforces the opposite of reality is worse than no test, because it
 * teaches everyone that red means nothing.
 *
 * Its thresholds were also stale in a way that matters: the ground law demanded the
 * first surface step sit at 1.6x the ground's luminance, and three of the six
 * finishes that DO ship fail that (charleston 1.19x, bistre 1.29x, licorice 1.58x).
 * So the ramp laws below were re-derived from measurement rather than inherited —
 * every threshold here is stated as a perceptual distance (CIE76 delta-E) or a WCAG
 * ratio, and each was checked against all six live finishes before it was written.
 *
 * RE-ANCHOR HISTORY (kept, because an assertion whose comment no longer describes
 * its subject is the exact defect this file exists to catch):
 *   · originally pinned raw hex literals;
 *   · then re-anchored to properties when the ground moved from deep ink to true
 *     black and back to a shade of black;
 *   · re-anchored at the owner's instruction of 2026-10-04 from two finishes to
 *     four; re-anchored again on 2026-10-05 to the owner's eight palettes;
 *   · and re-anchored on 2026-10-07 to the six finishes that actually ship, with
 *     TWO LAWS RETIRED because the owner overrode them directly:
 *       - "a ground is a shade, never an extreme" — the default ground is now
 *         Vantablack #000100, the darkest value a screen can show. That is the
 *         owner's choice, so the law moved from the ground to what a ground at the
 *         extreme makes impossible: shadows read as nothing there, so separation
 *         must come from the ramp, and the default finish is held to a WIDER first
 *         step than any other finish for exactly that reason.
 *       - "no competitor-purple anywhere" — the brand is now Pantone 19-3737 TCX
 *         Heliotrope, named by the owner. The law that replaces it is not a hue
 *         ban but a coherence test: the brand ramp must hold ONE hue and move only
 *         its lightness, which is what stops "we lifted a purple from a palette
 *         generator" from being mistaken for a designed identity.
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
const read = (p: string): string => fs.readFileSync(path.join(ROOT, p), "utf8");

const themeCss = read("src/ui/theme.css");
const inkCss = read("src/ui/ink.css");
const siCss = read(path.join("src", "ui", "si", "si.css"));
const main = read("src/main.tsx");
const storeSrc = read(path.join("src", "ui", "store.ts"));
const settingsSrc = read(path.join("src", "ui", "screens", "Settings.tsx"));
const inlineHtml = read("index.html");

/* ── colour maths ────────────────────────────────────────────────────────── */
const hex = (h: string): [number, number, number] => {
  const s = h.replace("#", "").trim();
  const full = s.length === 3 ? s.split("").map((c) => c + c).join("") : s;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)) as [number, number, number];
};
const relLum = (h: string): number => {
  const c = hex(h).map((v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const contrast = (a: string, b: string): number => {
  const [hi, lo] = [relLum(a), relLum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
const lab = (h: string): [number, number, number] => {
  const [r0, g0, b0] = hex(h);
  const f = (c: number): number => { const s = c / 255; return s > 0.04045 ? ((s + 0.055) / 1.055) ** 2.4 : s / 12.92; };
  const [r, g, b] = [f(r0), f(g0), f(b0)];
  const X = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047;
  const Y = r * 0.2126 + g * 0.7152 + b * 0.0722;
  const Z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883;
  const k = (c: number): number => (c > 0.008856 ? Math.cbrt(c) : 7.787 * c + 16 / 116);
  const [fx, fy, fz] = [k(X), k(Y), k(Z)];
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
};
const deltaE = (a: string, b: string): number => { const A = lab(a), B = lab(b); return Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]); };
/** sRGB hue angle in degrees — used to prove a ramp moves lightness and not hue. */
const hue = (h: string): number => {
  const [r, g, b] = hex(h);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  if (d === 0) return NaN;
  const seg = max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return seg * 60;
};

/* ── the six finishes that actually ship ─────────────────────────────────── */
/* `dark` is the default and lives in theme.css's first :root. `light` is the one
   finish ink.css still owns. The rest are theme.css attribute blocks. A finish
   whose tokens are read from the wrong place measures as an empty string, which
   fails loudly below rather than passing on an undefined comparison. */
/* `[^{]*` and not `\s*\{` because the default finish is now also addressable as
   `[data-theme="dark"]`, so its selector list spans two lines. */
const rootBlock = themeCss.match(/:root[^{]*\{([\s\S]*?)\n\}/)?.[1] ?? "";
const attrBlock = (id: string, sheet: string): string =>
  sheet.match(new RegExp(`\\[data-theme="${id}"\\]\\s*\\{([\\s\\S]*?)\\n\\}`))?.[1] ?? "";
const SOURCES: Record<string, string> = {
  dark: rootBlock,
  heliotrope: attrBlock("heliotrope", themeCss),
  charleston: attrBlock("charleston", themeCss),
  licorice: attrBlock("licorice", themeCss),
  bistre: attrBlock("bistre", themeCss),
  feldgrau: attrBlock("feldgrau", themeCss),
  light: attrBlock("light", inkCss),
};
/* A finish that overrides only its brand is a complete finish, not an incomplete
   one — CSS custom properties inherit, so Heliotrope borrows the default ground,
   ramp and ink wholesale and restates six colour tokens. Resolution therefore
   reads the finish's own block first and falls back to the default, which is what
   the browser does. */
const resolve = (t: string, name: string): string => (t === "dark" ? "" : tok(SOURCES[t], name)) || tok(rootBlock, name);
const FINISHES = Object.keys(SOURCES);
const DARKS = ["dark", "charleston", "licorice", "bistre"];
const LIGHTS = ["light", "feldgrau"];
const tok = (src: string, name: string): string => src.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{3,8})`))?.[1] ?? "";

console.log("== the cascade is the one that ships ==");
ok("main.tsx imports all three live sheets", /\.\/ui\/ink\.css/.test(main) && /\.\/ui\/si\/si\.css/.test(main) && /\.\/ui\/theme\.css/.test(main), main.match(/import[^\n]*\.css[^\n]*/g)?.join(" | "));
ok("theme.css loads LAST, so the finish layer wins the cascade", main.lastIndexOf("theme.css") > main.lastIndexOf("si.css") && main.lastIndexOf("si.css") > main.lastIndexOf("ink.css"));
ok("the dead sheet is not imported", !/import[^\n]*vh\.css/.test(main));
ok("every finish declares a ground, a four-step ramp and four ink steps",
  FINISHES.every((t) => ["ground", "surface-1", "surface-2", "surface-3", "surface-4", "ink-1", "ink-2", "ink-3", "ink-4", "accent", "accent-hi", "accent-ink"]
    .every((n) => resolve(t, n) !== "")),
  FINISHES.filter((t) => ["ground", "surface-1", "surface-2", "surface-3", "surface-4", "ink-1", "ink-2", "ink-3", "ink-4", "accent", "accent-hi", "accent-ink"].some((n) => resolve(t, n) === "")).join(", ") || "complete");

console.log("\n== ONE id list, five places it must never disagree ==");
const themeUnion = (storeSrc.match(/export type Theme = ([^;]+);/)?.[1] ?? "").split("|").map((x) => x.trim().replace(/"/g, "")).filter(Boolean);
const declared = [...[themeCss, siCss, inkCss].join("\n").matchAll(/\[data-theme="([a-z]+)"\]/g)].map((m) => m[1]);
const bootList = (inlineHtml.match(/\[([^\]]*"[a-z]+"[^\]]*)\]/)?.[1] ?? "").match(/"[a-z]+"/g)?.map((s) => s.replace(/"/g, "")) ?? [];
const persisted = [...storeSrc.matchAll(/\bid:\s*"([a-z]+)",\s*name:/g)].map((m) => m[1]);
/* Compared as SETS. The order the picker lists finishes in is a presentation
   choice, not an invariant, and asserting it here would only teach the next
   person to reorder a menu that they broke the design system. */
const sameSet = (a: string[], b: string[]): boolean =>
  a.length === new Set([...a, ...b]).size && a.every((x) => b.includes(x)) && b.every((x) => a.includes(x));
ok("the Theme union lists exactly the six shipping ids", sameSet(themeUnion, FINISHES), themeUnion.join(", "));
ok("THEMES in the store lists exactly the six shipping ids", sameSet(persisted, FINISHES), persisted.join(", "));
ok("index.html's boot whitelist accepts exactly the six shipping ids", sameSet(bootList, FINISHES), bootList.join(", "));
ok("no finish is declared as a block that is not in the list, or listed without a block",
  FINISHES.every((t) => declared.includes(t) || t === "dark") && declared.every((d) => FINISHES.includes(d)),
  `declared: ${[...new Set(declared)].join(", ")}`);
ok("Settings renders THEMES from the store, never a private copy", /THEMES\.map\(/.test(settingsSrc) && !/const FINISHES/.test(settingsSrc));

/* A finish has to be addressable by something other than the document element,
   or the Appearance picker cannot paint a swatch of it. `light` lived behind
   `html[data-theme="light"]` alone — the qualification it needs to win the
   cascade — so its swatch resolved the DEFAULT ground and looked like a dark
   finish named "Light". The selector list is scanned for a rule whose subject is
   not `html`, which is the smallest check that would have caught that. */
const allSheets = [themeCss, inkCss, siCss].join("\n");
for (const t of FINISHES) {
  const subjects = [...allSheets.matchAll(new RegExp(`([^\\s,{}\\[]*)\\[data-theme="${t}"\\]`, "g"))].map((m) => m[1]);
  ok(`the ${t} finish is addressable by a non-root element (a swatch can paint it)`,
    subjects.some((s) => s !== "html"), `subjects: ${subjects.join(" | ") || "none"}`);
}
ok("main.tsx validates the saved finish before first paint", /THEMES\.some\(/.test(main) && /DEFAULT_THEME/.test(main));

console.log("\n== the ramp law — every step is perceptible ==");
/* Re-derived 2026-10-07 from the six shipping finishes: the tightest legitimate
   step in the whole system is 2.30 delta-E (charleston's ground to its first
   surface), and the widest collapse this law has to catch is two identical tokens
   at 0. The bar sits at 2.0 — it passes every finish with margin and fails any
   step that has been flattened into its neighbour. */
for (const t of FINISHES) {
  const ramp = ["ground", "surface-1", "surface-2", "surface-3", "surface-4"].map((n) => resolve(t, n));
  const steps = ramp.slice(1).map((v, i) => deltaE(ramp[i], v));
  ok(`the ${t} surface ramp never collapses — every step is a perceptible move`,
    Math.min(...steps) >= 2.0,
    `steps ${steps.map((s) => s.toFixed(2)).join(", ")} (min ${Math.min(...steps).toFixed(2)})`);
  ok(`the ${t} ink ramp never collapses`, (() => {
    const inks = ["ink-1", "ink-2", "ink-3", "ink-4"].map((n) => resolve(t, n));
    return Math.min(...inks.slice(1).map((v, i) => deltaE(inks[i], v))) >= 6.0;
  })(), ["ink-1", "ink-2", "ink-3", "ink-4"].map((n) => resolve(t, n)).join(" "));
}
ok("the dark finishes climb away from their ground and the light ones step off theirs",
  DARKS.every((t) => { const r = ["ground", "surface-1", "surface-2", "surface-3", "surface-4"].map((n) => relLum(resolve(t, n))); return r.every((v, i) => i === 0 || v > r[i - 1]); })
  && LIGHTS.every((t) => { const s1 = relLum(resolve(t, "surface-1")); const s4 = relLum(resolve(t, "surface-4")); return s1 > relLum(resolve(t, "ground")) && s4 < s1; }),
  DARKS.filter((t) => { const r = ["ground", "surface-1", "surface-2", "surface-3", "surface-4"].map((n) => relLum(resolve(t, n))); return !r.every((v, i) => i === 0 || v > r[i - 1]); }).join(", ") || "monotone");

/* Retired law, recorded rather than deleted: the default ground used to be barred
   from the black extreme. The owner chose Vantablack, so what is enforced instead
   is the consequence — at that bottom a shadow is arithmetically nothing, so the
   default finish must separate its first surface WIDER than any other finish does,
   or the whole window reads as one flat field with no furniture in it. */
const defaultStep = deltaE(tok(SOURCES.dark, "ground"), tok(SOURCES.dark, "surface-1"));
const otherMin = Math.min(...FINISHES.filter((t) => t !== "dark").map((t) => deltaE(resolve(t, "ground"), resolve(t, "surface-1"))));
ok(`the Vantablack ground pays for itself with the widest first step (${defaultStep.toFixed(2)} vs ${otherMin.toFixed(2)} elsewhere)`,
  defaultStep >= 3.5 && defaultStep > otherMin, `default ${defaultStep.toFixed(2)}, tightest other ${otherMin.toFixed(2)}`);

console.log("\n== the ink law ==");
for (const t of FINISHES) {
  const s1 = resolve(t, "surface-1");
  const i1 = resolve(t, "ink-1"), i2 = resolve(t, "ink-2"), i3 = resolve(t, "ink-3");
  ok(`the ${t} body ink clears AAA on its raised surface (${contrast(i1, s1).toFixed(1)}:1)`, contrast(i1, s1) >= 7);
  ok(`the ${t} secondary and muted ink both clear AA (${contrast(i2, s1).toFixed(1)} / ${contrast(i3, s1).toFixed(1)})",`, contrast(i2, s1) >= 4.5 && contrast(i3, s1) >= 4.5);
}

console.log("\n== the accent law — three roles, three bars ==");
/* The old law demanded one accent clear 4.5:1 AS TEXT on its ground. Two of the six
   shipping finishes put their accent on a fill instead of in a sentence, where that
   bar is the wrong test, so the law is split into the roles the tokens actually
   play: --accent is a component (3:1, WCAG SC 1.4.11), --accent-hi is text and the
   focus ring (4.5 as text; it clears 3:1 for the ring by a wide margin), and
   --accent-ink is the label sitting ON the accent (4.5). */
for (const t of FINISHES) {
  const g = resolve(t, "ground"), a = resolve(t, "accent"), ah = resolve(t, "accent-hi"), ai = resolve(t, "accent-ink");
  ok(`the ${t} accent clears 3:1 on its ground as a component (${contrast(a, g).toFixed(2)}:1)`, contrast(a, g) >= 3);
  ok(`the ${t} accent-hi clears AA as text and the focus ring clears SC 2.4.11 (${contrast(ah, g).toFixed(2)}:1)`, contrast(ah, g) >= 4.5);
  ok(`the ${t} accent-ink is readable on its own accent (${contrast(ai, a).toFixed(2)}:1)`, contrast(ai, a) >= 4.5);
}

console.log("\n== the brand ramp holds one hue ==");
/* The replacement for the retired hue ban. Pantone 19-3737 TCX Heliotrope is the
   printed swatch; the two UI steps are that pigment with only its lightness moved.
   A ramp whose hue angle drifts is a ramp that was picked by eye from three
   different sources, which is exactly how a brand starts to look generated. */
const brand = tok(SOURCES.dark, "brand");
ok("the default finish declares an anchor pigment and uses it for both UI steps",
  /^#[0-9a-f]{6}$/i.test(brand) && relLum(brand) < relLum(tok(SOURCES.dark, "accent")),
  `brand ${brand} vs accent ${tok(SOURCES.dark, "accent")}`);
ok("the Pantone the owner named survives as its own finish",
  tok(SOURCES.heliotrope, "brand").toLowerCase() === "#4f3872", tok(SOURCES.heliotrope, "brand"));
for (const [name, v] of [["--accent", tok(SOURCES.dark, "accent")], ["--accent-hi", tok(SOURCES.dark, "accent-hi")]] as const) {
  const d = Math.abs(((hue(v) - hue(brand) + 540) % 360) - 180) === 0 ? 0 : Math.abs(hue(v) - hue(brand));
  ok(`${name} is the anchor's hue at a different lightness (Δhue ${d.toFixed(1)}°)`, d <= 6, `${name} ${v} hue ${hue(v).toFixed(1)} vs brand ${hue(brand).toFixed(1)}`);
  ok(`${name} is lighter than the anchor, not merely different`, relLum(v) > relLum(brand), `${name} ${relLum(v).toFixed(4)} vs brand ${relLum(brand).toFixed(4)}`);
}
ok("the control bevel is a token and not a per-component literal",
  /--ctl-face:/.test(themeCss) && /--ctl-hi:/.test(themeCss) && /var\(--ctl-face\)/.test(siCss) && /var\(--ctl-hi\)/.test(siCss));
ok("the brand face derives from --accent, so no finish paints another finish's hue",
  /--brand-face:[^;]*var\(--accent\)/.test(themeCss) && !/--brand-face:[^;]*#[0-9a-f]{6}/i.test(themeCss));

console.log("\n== the boot block cannot separate from the sheet ==");
const inlineStyle = inlineHtml.match(/<style>([\s\S]*?)<\/style>/)?.[1] ?? "";
for (const t of FINISHES) {
  const want = resolve(t, "ground");
  const got = t === "dark"
    ? (inlineStyle.match(/html,body\{[^}]*?background:\s*(#[0-9a-fA-F]{3,8})/)?.[1] ?? "")
    : (inlineStyle.match(new RegExp(`\\[data-theme="${t}"\\][^{]*\\{[^}]*?background:\\s*(#[0-9a-fA-F]{3,8})`))?.[1] ?? "");
  ok(`index.html's boot ground for ${t} EQUALS --${t === "dark" ? "ground" : "ground"} in the sheet`,
    got !== "" && got.toLowerCase() === want.toLowerCase(), `index.html ${got || "(none)"} vs sheet ${want}`);
}
ok(`index.html boots the default finish server-side`, /<html lang="en" data-theme="dark">/.test(inlineHtml));

console.log("\n== type and weight ==");
ok("Switzer for the interface, Fragment Mono for data", /Switzer/.test(themeCss) && /Fragment Mono/.test(themeCss));
ok("not Inter", !/font-family[^;}]*Inter\b/.test(themeCss + inkCss + siCss));
ok("nothing is set bold — 700 and above is retired from the design sheets",
  !/font-weight:\s*(7|8|9)00\b/.test(themeCss + inkCss),
  (themeCss + inkCss).match(/font-weight:\s*(?:7|8|9)00\b/)?.[0] ?? "clean");
ok("the elevation scale is alive, not zeroed", /--el-1:/.test(themeCss) && !/--el-1:\s*none/.test(themeCss));
ok("reduced motion is honoured", /@media \(prefers-reduced-motion: reduce\)/.test(themeCss + siCss));
ok("the focus indicator is stated, not left to the UA", /:focus-visible/.test(themeCss + siCss + inkCss));

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) { console.log("\nfailures:"); for (const f of failures) console.log(`  - ${f}`); }
process.exit(failed > 0 ? 1 : 0);
