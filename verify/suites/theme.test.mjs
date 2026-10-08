import { createRequire as __mjCreateRequire } from "node:module"; const require = __mjCreateRequire(import.meta.url);

// probe/theme.test.ts
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
var read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
var themeCss = read("src/ui/theme.css");
var inkCss = read("src/ui/ink.css");
var siCss = read(path.join("src", "ui", "si", "si.css"));
var main = read("src/main.tsx");
var storeSrc = read(path.join("src", "ui", "store.ts"));
var settingsSrc = read(path.join("src", "ui", "screens", "Settings.tsx"));
var inlineHtml = read("index.html");
var hex = (h) => {
  const s = h.replace("#", "").trim();
  const full = s.length === 3 ? s.split("").map((c) => c + c).join("") : s;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
};
var relLum = (h) => {
  const c = hex(h).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
var contrast = (a, b) => {
  const [hi, lo] = [relLum(a), relLum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
var lab = (h) => {
  const [r0, g0, b0] = hex(h);
  const f = (c) => {
    const s = c / 255;
    return s > 0.04045 ? ((s + 0.055) / 1.055) ** 2.4 : s / 12.92;
  };
  const [r, g, b] = [f(r0), f(g0), f(b0)];
  const X = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047;
  const Y = r * 0.2126 + g * 0.7152 + b * 0.0722;
  const Z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883;
  const k = (c) => c > 8856e-6 ? Math.cbrt(c) : 7.787 * c + 16 / 116;
  const [fx, fy, fz] = [k(X), k(Y), k(Z)];
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
};
var deltaE = (a, b) => {
  const A = lab(a), B = lab(b);
  return Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]);
};
var hue = (h) => {
  const [r, g, b] = hex(h);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  if (d === 0) return NaN;
  const seg = max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return seg * 60;
};
var rootBlock = themeCss.match(/:root[^{]*\{([\s\S]*?)\n\}/)?.[1] ?? "";
var attrBlock = (id, sheet) => sheet.match(new RegExp(`\\[data-theme="${id}"\\]\\s*\\{([\\s\\S]*?)\\n\\}`))?.[1] ?? "";
var SOURCES = {
  dark: rootBlock,
  heliotrope: attrBlock("heliotrope", themeCss),
  charleston: attrBlock("charleston", themeCss),
  licorice: attrBlock("licorice", themeCss),
  bistre: attrBlock("bistre", themeCss),
  feldgrau: attrBlock("feldgrau", themeCss),
  light: attrBlock("light", inkCss)
};
var resolve = (t, name) => (t === "dark" ? "" : tok(SOURCES[t], name)) || tok(rootBlock, name);
var FINISHES = Object.keys(SOURCES);
var DARKS = ["dark", "charleston", "licorice", "bistre"];
var LIGHTS = ["light", "feldgrau"];
var tok = (src, name) => src.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{3,8})`))?.[1] ?? "";
console.log("== the cascade is the one that ships ==");
ok("main.tsx imports all three live sheets", /\.\/ui\/ink\.css/.test(main) && /\.\/ui\/si\/si\.css/.test(main) && /\.\/ui\/theme\.css/.test(main), main.match(/import[^\n]*\.css[^\n]*/g)?.join(" | "));
ok("theme.css loads LAST, so the finish layer wins the cascade", main.lastIndexOf("theme.css") > main.lastIndexOf("si.css") && main.lastIndexOf("si.css") > main.lastIndexOf("ink.css"));
ok("the dead sheet is not imported", !/import[^\n]*vh\.css/.test(main));
ok(
  "every finish declares a ground, a four-step ramp and four ink steps",
  FINISHES.every((t) => ["ground", "surface-1", "surface-2", "surface-3", "surface-4", "ink-1", "ink-2", "ink-3", "ink-4", "accent", "accent-hi", "accent-ink"].every((n) => resolve(t, n) !== "")),
  FINISHES.filter((t) => ["ground", "surface-1", "surface-2", "surface-3", "surface-4", "ink-1", "ink-2", "ink-3", "ink-4", "accent", "accent-hi", "accent-ink"].some((n) => resolve(t, n) === "")).join(", ") || "complete"
);
console.log("\n== ONE id list, five places it must never disagree ==");
var themeUnion = (storeSrc.match(/export type Theme = ([^;]+);/)?.[1] ?? "").split("|").map((x) => x.trim().replace(/"/g, "")).filter(Boolean);
var declared = [...[themeCss, siCss, inkCss].join("\n").matchAll(/\[data-theme="([a-z]+)"\]/g)].map((m) => m[1]);
var bootList = (inlineHtml.match(/\[([^\]]*"[a-z]+"[^\]]*)\]/)?.[1] ?? "").match(/"[a-z]+"/g)?.map((s) => s.replace(/"/g, "")) ?? [];
var persisted = [...storeSrc.matchAll(/\bid:\s*"([a-z]+)",\s*name:/g)].map((m) => m[1]);
var sameSet = (a, b) => a.length === (/* @__PURE__ */ new Set([...a, ...b])).size && a.every((x) => b.includes(x)) && b.every((x) => a.includes(x));
ok("the Theme union lists exactly the six shipping ids", sameSet(themeUnion, FINISHES), themeUnion.join(", "));
ok("THEMES in the store lists exactly the six shipping ids", sameSet(persisted, FINISHES), persisted.join(", "));
ok("index.html's boot whitelist accepts exactly the six shipping ids", sameSet(bootList, FINISHES), bootList.join(", "));
ok(
  "no finish is declared as a block that is not in the list, or listed without a block",
  FINISHES.every((t) => declared.includes(t) || t === "dark") && declared.every((d) => FINISHES.includes(d)),
  `declared: ${[...new Set(declared)].join(", ")}`
);
ok("Settings renders THEMES from the store, never a private copy", /THEMES\.map\(/.test(settingsSrc) && !/const FINISHES/.test(settingsSrc));
var allSheets = [themeCss, inkCss, siCss].join("\n");
for (const t of FINISHES) {
  const subjects = [...allSheets.matchAll(new RegExp(`([^\\s,{}\\[]*)\\[data-theme="${t}"\\]`, "g"))].map((m) => m[1]);
  ok(
    `the ${t} finish is addressable by a non-root element (a swatch can paint it)`,
    subjects.some((s) => s !== "html"),
    `subjects: ${subjects.join(" | ") || "none"}`
  );
}
ok("main.tsx validates the saved finish before first paint", /THEMES\.some\(/.test(main) && /DEFAULT_THEME/.test(main));
console.log("\n== the ramp law \u2014 every step is perceptible ==");
for (const t of FINISHES) {
  const ramp = ["ground", "surface-1", "surface-2", "surface-3", "surface-4"].map((n) => resolve(t, n));
  const steps = ramp.slice(1).map((v, i) => deltaE(ramp[i], v));
  ok(
    `the ${t} surface ramp never collapses \u2014 every step is a perceptible move`,
    Math.min(...steps) >= 2,
    `steps ${steps.map((s) => s.toFixed(2)).join(", ")} (min ${Math.min(...steps).toFixed(2)})`
  );
  ok(`the ${t} ink ramp never collapses`, (() => {
    const inks = ["ink-1", "ink-2", "ink-3", "ink-4"].map((n) => resolve(t, n));
    return Math.min(...inks.slice(1).map((v, i) => deltaE(inks[i], v))) >= 6;
  })(), ["ink-1", "ink-2", "ink-3", "ink-4"].map((n) => resolve(t, n)).join(" "));
}
ok(
  "the dark finishes climb away from their ground and the light ones step off theirs",
  DARKS.every((t) => {
    const r = ["ground", "surface-1", "surface-2", "surface-3", "surface-4"].map((n) => relLum(resolve(t, n)));
    return r.every((v, i) => i === 0 || v > r[i - 1]);
  }) && LIGHTS.every((t) => {
    const s1 = relLum(resolve(t, "surface-1"));
    const s4 = relLum(resolve(t, "surface-4"));
    return s1 > relLum(resolve(t, "ground")) && s4 < s1;
  }),
  DARKS.filter((t) => {
    const r = ["ground", "surface-1", "surface-2", "surface-3", "surface-4"].map((n) => relLum(resolve(t, n)));
    return !r.every((v, i) => i === 0 || v > r[i - 1]);
  }).join(", ") || "monotone"
);
var defaultStep = deltaE(tok(SOURCES.dark, "ground"), tok(SOURCES.dark, "surface-1"));
var otherMin = Math.min(...FINISHES.filter((t) => t !== "dark").map((t) => deltaE(resolve(t, "ground"), resolve(t, "surface-1"))));
ok(
  `the Vantablack ground pays for itself with the widest first step (${defaultStep.toFixed(2)} vs ${otherMin.toFixed(2)} elsewhere)`,
  defaultStep >= 3.5 && defaultStep > otherMin,
  `default ${defaultStep.toFixed(2)}, tightest other ${otherMin.toFixed(2)}`
);
console.log("\n== the ink law ==");
for (const t of FINISHES) {
  const s1 = resolve(t, "surface-1");
  const i1 = resolve(t, "ink-1"), i2 = resolve(t, "ink-2"), i3 = resolve(t, "ink-3");
  ok(`the ${t} body ink clears AAA on its raised surface (${contrast(i1, s1).toFixed(1)}:1)`, contrast(i1, s1) >= 7);
  ok(`the ${t} secondary and muted ink both clear AA (${contrast(i2, s1).toFixed(1)} / ${contrast(i3, s1).toFixed(1)})",`, contrast(i2, s1) >= 4.5 && contrast(i3, s1) >= 4.5);
}
console.log("\n== the accent law \u2014 three roles, three bars ==");
for (const t of FINISHES) {
  const g = resolve(t, "ground"), a = resolve(t, "accent"), ah = resolve(t, "accent-hi"), ai = resolve(t, "accent-ink");
  ok(`the ${t} accent clears 3:1 on its ground as a component (${contrast(a, g).toFixed(2)}:1)`, contrast(a, g) >= 3);
  ok(`the ${t} accent-hi clears AA as text and the focus ring clears SC 2.4.11 (${contrast(ah, g).toFixed(2)}:1)`, contrast(ah, g) >= 4.5);
  ok(`the ${t} accent-ink is readable on its own accent (${contrast(ai, a).toFixed(2)}:1)`, contrast(ai, a) >= 4.5);
}
console.log("\n== the brand ramp holds one hue ==");
var brand = tok(SOURCES.dark, "brand");
ok(
  "the default finish declares an anchor pigment and uses it for both UI steps",
  /^#[0-9a-f]{6}$/i.test(brand) && relLum(brand) < relLum(tok(SOURCES.dark, "accent")),
  `brand ${brand} vs accent ${tok(SOURCES.dark, "accent")}`
);
ok(
  "the Pantone the owner named survives as its own finish",
  tok(SOURCES.heliotrope, "brand").toLowerCase() === "#4f3872",
  tok(SOURCES.heliotrope, "brand")
);
for (const [name, v] of [["--accent", tok(SOURCES.dark, "accent")], ["--accent-hi", tok(SOURCES.dark, "accent-hi")]]) {
  const d = Math.abs((hue(v) - hue(brand) + 540) % 360 - 180) === 0 ? 0 : Math.abs(hue(v) - hue(brand));
  ok(`${name} is the anchor's hue at a different lightness (\u0394hue ${d.toFixed(1)}\xB0)`, d <= 6, `${name} ${v} hue ${hue(v).toFixed(1)} vs brand ${hue(brand).toFixed(1)}`);
  ok(`${name} is lighter than the anchor, not merely different`, relLum(v) > relLum(brand), `${name} ${relLum(v).toFixed(4)} vs brand ${relLum(brand).toFixed(4)}`);
}
ok(
  "the control bevel is a token and not a per-component literal",
  /--ctl-face:/.test(themeCss) && /--ctl-hi:/.test(themeCss) && /var\(--ctl-face\)/.test(siCss) && /var\(--ctl-hi\)/.test(siCss)
);
ok(
  "the brand face derives from --accent, so no finish paints another finish's hue",
  /--brand-face:[^;]*var\(--accent\)/.test(themeCss) && !/--brand-face:[^;]*#[0-9a-f]{6}/i.test(themeCss)
);
console.log("\n== the boot block cannot separate from the sheet ==");
var inlineStyle = inlineHtml.match(/<style>([\s\S]*?)<\/style>/)?.[1] ?? "";
for (const t of FINISHES) {
  const want = resolve(t, "ground");
  const got = t === "dark" ? inlineStyle.match(/html,body\{[^}]*?background:\s*(#[0-9a-fA-F]{3,8})/)?.[1] ?? "" : inlineStyle.match(new RegExp(`\\[data-theme="${t}"\\][^{]*\\{[^}]*?background:\\s*(#[0-9a-fA-F]{3,8})`))?.[1] ?? "";
  ok(
    `index.html's boot ground for ${t} EQUALS --${t === "dark" ? "ground" : "ground"} in the sheet`,
    got !== "" && got.toLowerCase() === want.toLowerCase(),
    `index.html ${got || "(none)"} vs sheet ${want}`
  );
}
ok(`index.html boots the default finish server-side`, /<html lang="en" data-theme="dark">/.test(inlineHtml));
console.log("\n== type and weight ==");
ok("Switzer for the interface, Fragment Mono for data", /Switzer/.test(themeCss) && /Fragment Mono/.test(themeCss));
ok("not Inter", !/font-family[^;}]*Inter\b/.test(themeCss + inkCss + siCss));
ok(
  "nothing is set bold \u2014 700 and above is retired from the design sheets",
  !/font-weight:\s*(7|8|9)00\b/.test(themeCss + inkCss),
  (themeCss + inkCss).match(/font-weight:\s*(?:7|8|9)00\b/)?.[0] ?? "clean"
);
ok("the elevation scale is alive, not zeroed", /--el-1:/.test(themeCss) && !/--el-1:\s*none/.test(themeCss));
ok("reduced motion is honoured", /@media \(prefers-reduced-motion: reduce\)/.test(themeCss + siCss));
ok("the focus indicator is stated, not left to the UA", /:focus-visible/.test(themeCss + siCss + inkCss));
console.log(`
${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log("\nfailures:");
  for (const f of failures) console.log(`  - ${f}`);
}
process.exit(failed > 0 ? 1 : 0);
