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
var css = fs.readFileSync(path.join(ROOT, "src", "ui", "vh.css"), "utf8");
var main = fs.readFileSync(path.join(ROOT, "src", "main.tsx"), "utf8");
var hex = (h) => {
  const s = h.replace("#", "").trim();
  const full = s.length === 3 ? s.split("").map((c) => c + c).join("") : s;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
};
var relLum = (h) => {
  const c = hex(h).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
var token = (theme, name) => {
  const block = css.match(new RegExp(`\\[data-theme=${theme}\\]\\s*\\{([\\s\\S]*?)\\n\\}`, "m"));
  const m = block?.[1].match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{3,8})`, "i"));
  return m ? m[1] : "";
};
var deltaE = (a, b) => {
  const lab = (h) => {
    const [r0, g0, b0] = hex(h);
    const f = (c) => {
      const s = c / 255;
      return s > 0.04045 ? Math.pow((s + 0.055) / 1.055, 2.4) : s / 12.92;
    };
    const [r, g, b2] = [f(r0), f(g0), f(b0)];
    const X = (r * 0.4124 + g * 0.3576 + b2 * 0.1805) / 0.95047;
    const Y = r * 0.2126 + g * 0.7152 + b2 * 0.0722;
    const Z = (r * 0.0193 + g * 0.1192 + b2 * 0.9505) / 1.08883;
    const k = (c) => c > 8856e-6 ? Math.cbrt(c) : 7.787 * c + 16 / 116;
    const [fx, fy, fz] = [k(X), k(Y), k(Z)];
    return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
  };
  const A = lab(a);
  const B = lab(b);
  return Math.sqrt((A[0] - B[0]) ** 2 + (A[1] - B[1]) ** 2 + (A[2] - B[2]) ** 2);
};
var rawToken = (theme, name) => {
  const block = css.match(new RegExp(`\\[data-theme=${theme}\\]\\s*\\{([\\s\\S]*?)\\n\\}`, "m"));
  const m = block?.[1].match(new RegExp(`--${name}:\\s*([^;]+);`, "i"));
  return m ? m[1].trim() : "";
};
ok("one stylesheet \u2014 main.tsx imports vh.css and nothing else", /import '\.\/ui\/vh\.css'/.test(main) && (main.match(/\.css['"]/g) ?? []).length === 1);
ok("the retired sheets are gone", !fs.existsSync(path.join(ROOT, "src", "styles")));
var FINISHES = ["holst", "obsidian", "azure", "platinum", "titanium", "akaroa", "caesar", "stratos"];
var DARKS = ["holst", "obsidian", "azure", "titanium", "caesar", "stratos"];
var REJECTED_FLAT_S1_LUM = 45e-4;
var DARK_GROUND_CEILING = 0.012;
var contrast = (a, b) => {
  const [hi, lo] = [relLum(a), relLum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
for (const t of DARKS) {
  const bg = token(t, "bg"), s1 = token(t, "s1"), s2 = token(t, "s2"), s3 = token(t, "s3");
  ok(
    `the ${t} ground is a shade of black (not pure black, not grey) and its surface ramp is measurably raised`,
    relLum(bg) > 0 && relLum(bg) < DARK_GROUND_CEILING && relLum(s1) < relLum(s2) && relLum(s2) < relLum(s3) && relLum(s1) > REJECTED_FLAT_S1_LUM && relLum(s1) > relLum(bg) * 1.6,
    `bg ${bg} (lum ${relLum(bg).toFixed(5)}), s1 ${s1} (${relLum(s1).toFixed(5)} = ${(relLum(bg) > 0 ? relLum(s1) / relLum(bg) : 0).toFixed(2)}x ground), s2 ${s2}, s3 ${s3}`
  );
}
ok("the rail sits on base (transparent over background, hairline separator)", /border-right:1px solid var\(--line\)/.test(css) && !/\.side\{background:var\(--bg-deep\)/.test(css.replace(/background:transparent/, "")));
var LIGHTS = ["platinum", "akaroa"];
var siCss = fs.readFileSync(path.join(ROOT, "src", "ui", "si", "si.css"), "utf8");
var storeSrc = fs.readFileSync(path.join(ROOT, "src", "ui", "store.ts"), "utf8");
var settingsSrc = fs.readFileSync(path.join(ROOT, "src", "ui", "screens", "Settings.tsx"), "utf8");
ok(
  "vh.css declares a [data-theme=...] block for all eight finishes",
  FINISHES.every((t) => new RegExp(`\\[data-theme=${t}\\]\\s*\\{`).test(css)),
  FINISHES.filter((t) => !new RegExp(`\\[data-theme=${t}\\]\\s*\\{`).test(css)).join(", ") || "all present"
);
ok(
  'si.css declares a [data-theme="..."] block for all eight finishes',
  FINISHES.every((t) => new RegExp(`\\[data-theme="${t}"\\]\\s*\\{`).test(siCss)),
  FINISHES.filter((t) => !new RegExp(`\\[data-theme="${t}"\\]\\s*\\{`).test(siCss)).join(", ") || "all present"
);
var RETIRED = ["dark", "light", "petrol", "fog"];
var themeUnion = storeSrc.match(/export type Theme = ([^;]+);/)?.[1] ?? "";
var persistedIds = [...storeSrc.matchAll(/\bid:\s*"([^"]+)"/g)].map((m) => m[1]);
var liveBlocks = RETIRED.filter((r) => [css, siCss].some((sheet) => sheet.includes(`[data-theme=${r}]`) || sheet.includes(`[data-theme="${r}"]`)));
var inUnion = RETIRED.filter((r) => new RegExp(`"${r}"`).test(themeUnion));
var inPersisted = RETIRED.filter((r) => persistedIds.includes(r));
ok(
  "no retired four-finish id survives as a LIVE theme",
  liveBlocks.length === 0 && inUnion.length === 0 && inPersisted.length === 0,
  `blocks: ${liveBlocks.join(", ") || "none"} / union: ${inUnion.join(", ") || "none"} / persisted: ${inPersisted.join(", ") || "none"}`
);
ok(
  "store.ts Theme union lists exactly the eight ids",
  (storeSrc.match(/export type Theme = ([^;]+);/)?.[1] ?? "").split("|").map((x) => x.trim().replace(/"/g, "")).filter(Boolean).length === 8
);
ok(
  "Settings renders THEMES from the store, not a private copy",
  /THEMES\.map\(/.test(settingsSrc) && !/FINISHES/.test(settingsSrc)
);
ok(
  "main.tsx applies the saved finish before first paint, validated against THEMES",
  /vh\.theme\.v2/.test(main) && /THEMES\.some\(/.test(main) && /DEFAULT_THEME/.test(main)
);
for (const t of LIGHTS) {
  const bg = token(t, "bg"), fg = token(t, "fg"), s3 = token(t, "s3");
  ok(
    `the ${t} ground is clearly light \u2014 never screen-white \u2014 and the ink on it is ink`,
    relLum(bg) > 0.5 && relLum(bg) < 0.98 && relLum(fg) < 0.05 && contrast(fg, bg) >= 4.5,
    `bg ${bg} (lum ${relLum(bg).toFixed(4)}), fg ${fg} (${relLum(fg).toFixed(4)}), contrast ${contrast(fg, bg).toFixed(2)}:1`
  );
  ok(
    `the ${t} finish carries its own surface step`,
    relLum(s3) > 0 && relLum(s3) < relLum(bg),
    `s3 ${s3} vs bg ${bg}`
  );
  const surfaces = ["bg", "bg-deep", "s1", "s2", "s3", "glass"];
  const whites = surfaces.filter((n) => {
    const v = rawToken(t, n);
    return /^#ffffff$/i.test(v) || /^#fff$/i.test(v) || /rgba\(\s*255\s*,\s*255\s*,\s*255/i.test(v);
  });
  ok(`no ${t} surface is plain white`, whites.length === 0, whites.join(", "));
  const flats = surfaces.filter((n) => {
    const v = rawToken(t, n);
    return /^#[0-9a-f]{6}$/i.test(v) && (() => {
      const r = parseInt(v.slice(1, 3), 16), g = parseInt(v.slice(3, 5), 16), b = parseInt(v.slice(5, 7), 16);
      return r === g && g === b;
    })();
  });
  ok(`no ${t} surface is a flat neutral grey (the surface carries material)`, flats.length === 0, flats.join(", "));
  const spread = (() => {
    const v = token(t, "bg");
    if (!/^#[0-9a-f]{6}$/i.test(v)) return NaN;
    const c = [0, 2, 4].map((i) => parseInt(v.slice(1 + i, 3 + i), 16));
    return Math.max(...c) - Math.min(...c);
  })();
  ok(`the ${t} ground carries a tint \u2014 it is not a dead neutral grey`, spread >= 3, `channel spread = ${spread}`);
}
for (const t of FINISHES) {
  const a = token(t, "accent"), bg = token(t, "bg"), fg2 = token(t, "fg-2");
  const d = deltaE(a, fg2);
  ok(
    `the ${t} finish carries ONE accent that is AA on its own ground and reads as colour, not as a second grey`,
    contrast(a, bg) >= 4.5 && contrast(a, token(t, "s1")) >= 4.5 && contrast(token(t, "accent-fg"), a) >= 4.5 && d >= 10,
    `${t} accent ${a} on ${bg} ${contrast(a, bg).toFixed(2)}:1, accent-fg on accent ${contrast(token(t, "accent-fg"), a).toFixed(2)}:1, \u0394E vs fg-2 = ${d.toFixed(1)}`
  );
}
ok(
  "the focus ring token clears the 3:1 WCAG 2.2 SC 2.4.11 needs in every finish",
  FINISHES.every((t) => contrast(token(t, "accent-3"), token(t, "bg")) >= 3),
  FINISHES.filter((t) => contrast(token(t, "accent-3"), token(t, "bg")) < 3).join(", ") || "all clear"
);
ok("no default-blue / competitor-purple / electric-cyan anywhere", !/#007AFF|#3B82F6|#2563EB|#7C3AED|#06B6D4/i.test(css));
ok("Gambetta for display, Switzer for body, Fragment Mono for data", /Gambetta/.test(css) && /Switzer/.test(css) && /Fragment Mono/.test(css));
ok("not Inter", !/font-family[^;}]*Inter\b/.test(css));
ok("weights top out at medium (500) \u2014 nothing semibold/bold/600+", !/font-weight:\s*(6|7|8|9)00/.test(css) && !/font-weight:\s*bold(?!.*oblique)/.test(css.replace(/font-weight:\(.*?\)/g, "")));
ok("no legacy animation gimmicks (splash, shimmer, glow keyframes)", !/@keyframes\s+(splash|shimmer|glow|pulseGlow|float)/.test(css));
var inlineHtml = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
var inline = inlineHtml.match(/<style>([\s\S]*?)<\/style>/)?.[1] ?? "";
var DEFAULT_ID = FINISHES[0];
for (const t of FINISHES) {
  const re = t === DEFAULT_ID ? /html,body\{[^}]*?background:\s*(#[0-9a-fA-F]{3,8})/ : new RegExp('\\[data-theme="' + t + '"\\][^{]*\\{[^}]*?background:\\s*(#[0-9a-fA-F]{3,8})');
  const inlineBg = inline.match(re)?.[1] ?? "";
  ok(
    `the inline boot ground for ${t} EQUALS --bg in vh.css -- they cannot separate again`,
    inlineBg !== "" && inlineBg.toLowerCase() === token(t, "bg").toLowerCase(),
    `index.html ${inlineBg || "(none)"} vs vh.css ${token(t, "bg")}`
  );
}
ok(
  `index.html boots the default finish server-side (${DEFAULT_ID})`,
  new RegExp(`<html lang="en" data-theme="${DEFAULT_ID}">`).test(inlineHtml)
);
ok(
  "the boot script accepts all eight ids and falls back to the default",
  FINISHES.every((t) => inlineHtml.includes('"' + t + '"')) && inlineHtml.includes('? t : "' + DEFAULT_ID + '"')
);
console.log(`
${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log("\nfailures:");
  for (const f of failures) console.log(`  - ${f}`);
}
process.exit(failed > 0 ? 1 : 0);
