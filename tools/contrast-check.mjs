/**
 * contrast-check.mjs — machine-check every colour pairing the product paints.
 *
 * WHY THIS EXISTS
 * vh.css carried a header comment asserting "every text step clears WCAG AA
 * against its own ground", listing six ratios. Two of the six were false:
 * --fg-3 was 4.15:1 in dark and 3.21:1 in light, and because the comment was
 * the only evidence, nothing ever noticed the values had drifted from it.
 * A comment cannot fail a build. This can.
 *
 * WHAT IT READS
 * BOTH stylesheets, not one. src/ui/vh.css owns the un-prefixed tokens and the
 * interior of every screen; src/ui/si/si.css owns the shell chrome, the sign-in
 * door, the status pills and the content surface, under its own --si-* names.
 * A checker that only ever opened vh.css verified half the design system and
 * reported the result as if it were all of it. Both are parsed by default; one
 * or more explicit paths may be passed instead, and the single-path form the
 * probes use keeps working unchanged.
 *
 * WHAT IT CHECKS
 * Text pairings at WCAG AA 4.5:1, and non-text pairings — the focus indicator,
 * state rules and component boundaries — at the 3:1 of WCAG 2.2 SC 1.4.11
 * (Non-text Contrast) and SC 2.4.11 (Focus Appearance). It composites every
 * translucent token over the surface it is actually painted on, because a
 * ratio measured against the wrong backdrop is not a ratio.
 *
 * A colour this tool cannot parse is a FAILURE, never a silent pass.
 *
 *   node tools/contrast-check.mjs                    # both sheets (default)
 *   node tools/contrast-check.mjs src/ui/vh.css      # one sheet
 *   node tools/contrast-check.mjs a.css b.css        # any number of sheets
 */
import fs from "node:fs";
import path from "node:path";

/* ------------------------------------------------------------------ sheets -- */

const DEFAULT_SHEETS = ["src/ui/vh.css", "src/ui/si/si.css"];
const args = process.argv.slice(2);
const SHEETS = (args.length ? args : DEFAULT_SHEETS).map((p) => path.resolve(process.cwd(), p));

for (const sheet of SHEETS) {
  if (!fs.existsSync(sheet)) {
    console.error(`  CONTRAST CHECK FAILED — stylesheet not found: ${sheet}`);
    process.exit(1);
  }
}

const THEME_BLOCK = /\[data-theme=["']?([a-z0-9-]+)["']?\]\s*\{([\s\S]*?)\n\}/g;
const themes = new Map();
const themesPerSheet = new Map();

for (const sheet of SHEETS) {
  const text = fs.readFileSync(sheet, "utf8");
  const found = new Set();
  for (const block of text.matchAll(THEME_BLOCK)) {
    const id = block[1];
    found.add(id);
    if (!themes.has(id)) themes.set(id, new Map());
    const tokens = themes.get(id);
    for (const kv of block[2].matchAll(/--([a-z0-9-]+)\s*:\s*([^;]+);/gi)) {
      const name = kv[1].toLowerCase();
      if (tokens.has(name)) {
        // Two sheets declaring the same token name would silently let one win.
        // vh.css uses bare names and si.css namespaces its own, so a collision
        // here means a name was reused — a design-system bug, not a tool quirk.
        console.error(
          `  CONTRAST CHECK FAILED — token --${name} is declared twice for finish "${id}" ` +
            `(${tokens.get(name).sheet} and ${sheet}). Rename one; the two systems must not share a name.`,
        );
        process.exit(1);
      }
      tokens.set(name, { value: kv[2].trim(), sheet });
    }
  }
  themesPerSheet.set(sheet, found);
}

/* A stylesheet that declares no finish at all would report zero pairings and
 * exit 0 — a green run that proves nothing. Refuse it. */
for (const [sheet, found] of themesPerSheet) {
  if (found.size === 0) {
    console.error(`  CONTRAST CHECK FAILED — no [data-theme=...] block found in ${sheet}.`);
    process.exit(1);
  }
}

/* A finish that exists in one sheet but not the other is a half-painted theme,
 * which is exactly the defect this tool exists to catch. */
let structureFailures = 0;
for (const [sheet, found] of themesPerSheet) {
  for (const id of themes.keys()) {
    if (!found.has(id)) {
      console.error(`  CONTRAST CHECK FAILED — finish "${id}" has no block in ${sheet}.`);
      structureFailures++;
    }
  }
}

const THEME_IDS = [...themes.keys()].sort();

/* Which token NAMESPACE each loaded sheet supplies. vh.css owns the bare names;
 * si.css owns the --si-* names. A pairing whose namespace was not loaded is not a
 * missing token, it is a pairing the caller did not ask about — so passing one
 * sheet checks that sheet's rows instead of reporting 200 phantom failures for
 * tokens the caller never loaded. A token missing from a namespace that WAS
 * loaded is still a hard failure: that is a real hole in the sheet. */
const namespaced = (name) => name.startsWith("si-");
const available = new Map([
  [true, new Set()],
  [false, new Set()],
]);
for (const tokens of themes.values()) {
  for (const name of tokens.keys()) available.get(namespaced(name)).add(name);
}

/* ------------------------------------------------------------------ colour -- */

const HEX_RE = /^#([0-9a-f]{3,8})$/i;
const FN_RE = /^rgba?\(([^)]*)\)$/i;

/**
 * Parse ONE CSS colour into { rgb: [r,g,b], a: 0..1 }, or null when the string is
 * not a colour this tool understands.
 *
 * null is a FAILURE at every call site, never a silent pass. The previous
 * version only understood the legacy comma form: given `rgba(1 2 3 / 0.5)` its
 * channel split produced [1, NaN, NaN] and its alpha split produced a length of
 * 1, so alpha came back as 1 and a ratio was computed from NaN channels. That
 * fails OPEN. Both the legacy `rgba(r,g,b,a)` and the modern `rgb(r g b / a)`
 * forms are handled now, and anything else is named loudly in the output.
 */
function parseColor(raw) {
  if (typeof raw !== "string") return null;
  const v = raw.trim();
  if (!v) return null;

  const hex = v.match(HEX_RE);
  if (hex) {
    let h = hex[1];
    if (h.length === 3 || h.length === 4) h = [...h].map((c) => c + c).join("");
    if (h.length !== 6 && h.length !== 8) return null;
    return {
      rgb: [0, 1, 2].map((i) => parseInt(h.slice(i * 2, i * 2 + 2), 16)),
      a: h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1,
    };
  }

  const fn = v.match(FN_RE);
  if (!fn) return null;
  // The two notations differ only in separators; normalise then split.
  const parts = fn[1].trim().replace(/\s*\/\s*/, ",").split(/[\s,]+/).filter(Boolean);
  if (parts.length < 3 || parts.length > 4) return null;
  /* CSS Color 4 lets any component be a percentage: channels scale against 255,
   * alpha against 1. Resolving it here is four lines; leaving it out means a
   * legitimate modern token reads as UNPARSEABLE, and a tool that cries wolf on
   * valid CSS is a tool whose real failures stop being read. */
  const channel = (s) => (s.endsWith("%") ? (parseFloat(s) / 100) * 255 : parseFloat(s));
  const alpha = (s) => (s.endsWith("%") ? parseFloat(s) / 100 : parseFloat(s));
  // Four parts means the fourth is alpha; three means there is no alpha at all.
  const nums = parts.length === 4 ? [...parts.slice(0, 3).map(channel), alpha(parts[3])] : parts.map(channel);
  if (nums.some((n) => !Number.isFinite(n))) return null;
  const [r, g, b] = nums;
  const a = nums.length === 4 ? nums[3] : 1;
  if ([r, g, b].some((c) => c < 0 || c > 255) || a < 0 || a > 1) return null;
  return { rgb: [r, g, b], a };
}

const over = (fg, bg, a) => [0, 1, 2].map((i) => Math.round(fg[i] * a + bg[i] * (1 - a)));

/* WCAG 2.x relative luminance, verbatim: the sRGB piecewise break is 0.03928 and
 * the linear segment is ((s + 0.055) / 1.055) ^ 2.4. Unchanged from the version
 * that shipped with this tool; see SELFTEST below for the proof it is right. */
const lum = ([r, g, b]) => {
  const c = [r, g, b].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};

const ratio = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

/* A comment cannot fail a build, and neither can an assumption inside the maths
 * that computes it. Three published reference ratios, checked every run. */
const SELFTEST = [
  ["#FFFFFF", "#000000", 21, "white on black"],
  ["#FFFFFF", "#FFFFFF", 1, "white on white"],
  ["#767676", "#FFFFFF", 4.54, "#767676 is the canonical 4.5:1 boundary grey"],
];
for (const [a, b, expected, why] of SELFTEST) {
  const got = ratio(parseColor(a).rgb, parseColor(b).rgb);
  if (Math.abs(got - expected) > 0.02) {
    console.error(
      `  CONTRAST CHECK FAILED — the luminance maths is wrong: ${a} on ${b} computed ` +
        `${got.toFixed(3)}:1, expected ${expected}:1 (${why}). Fix this before trusting any row below.`,
    );
    process.exit(1);
  }
}

/* ---------------------------------------------------------------- resolve -- */

const pageGroundOf = (tokenName) => (tokenName.startsWith("si-") ? "si-bg" : "bg");

/** Resolve a token to a parsed colour, following var() indirection. */
function resolve(tokens, name, seen = new Set()) {
  const entry = tokens.get(name);
  if (!entry) return { error: `no --${name} in this finish` };
  if (seen.has(name)) return { error: `--${name} is a var() cycle` };
  seen.add(name);

  const v = entry.value;
  const indirection = v.match(/^var\(\s*--([a-z0-9-]+)/i);
  if (indirection) return resolve(tokens, indirection[1], seen);
  if (/var\(/i.test(v)) return { error: `--${name} composes other tokens and is not a plain colour: ${v}` };

  const color = parseColor(v);
  if (!color) return { error: `--${name} is not a colour this tool can parse: ${v}` };
  return { color };
}

/** Paint one token flat onto an already-flat backdrop, the way a browser would. */
function paint(tokens, name, backdrop) {
  const r = resolve(tokens, name);
  if (r.error) return r;
  const c = r.color;
  return { rgb: c.a >= 1 ? c.rgb : over(c.rgb, backdrop, c.a) };
}

/* --------------------------------------------------------------- pairings -- */

/* Backdrops, stated once so a row can be read without looking it up:
 *   vh.css paints the door interior over --bg; si.css paints the chrome over
 *   --si-bg. Any translucent ground or wash is composited onto that page, which
 *   is the WORST case for the ink on it in both the dark and the light finishes
 *   (a dark ink gets its lowest ratio on the darkest surface behind the wash, a
 *   light ink its lowest on the lightest), so a pass here is a real pass.
 *
 * TWO KINDS OF ROW, because WCAG has two kinds of requirement and conflating
 * them is how a gate ends up permanently red on something the criterion exempts:
 *
 *   GATED — the pairing is required to READ something. Text at 4.5:1
 *   (SC 1.4.3) and focus indicators at 3:1 (SC 2.4.11 / 1.4.11). Below the bar
 *   is a real defect and the run exits non-zero.
 *
 *   ADVISORY — the pairing is 1px DECORATION on a surface that is already
 *   identified by its fill (a border whose own contrast adds no information,
 *   which SC 1.4.11 explicitly exempts). It is measured and printed so the
 *   number is never hidden, but it does not fail the run. Gate it and you get
 *   eight red rows that are correct-by-criterion and therefore ignored.
 *
 * NOT CHECKED AT ALL: --line / --line-2 / --si-line / --si-line-2. These are
 * pure hairlines with no information to carry, at 0.1-0.24 alpha, on eight
 * finishes. There is no pairing of them worth stating.
 *
 * Every text row below is a pairing a rule in one of the two sheets actually
 * paints. A pairing nobody paints is a hypothetical, and gating a hypothetical
 * only teaches the reader to ignore the gate. */

/* Each row is [foreground, background, label, minimum, gated]. GATED rows fail
 * the run. ADVISORY rows are printed with their number and do not.
 *
 * Sources cited are vh.css / si.css line numbers, so a reader can open the rule
 * and check the claim instead of taking this table's word for it. */

const G = true;
const A = false;

const DOOR_TEXT = [
  ["fg", "bg", "primary body text on the page (body,295)", 4.5, G],
  ["fg", "s1", "primary text on a card (.card,401)", 4.5, G],
  ["fg", "s2", "primary text on a control (.btn,391)", 4.5, G],
  ["fg", "s3", "primary text on a raised control (.input,439)", 4.5, G],
  ["fg-2", "bg", "secondary text on the page (.muted,313)", 4.5, G],
  ["fg-2", "s1", "secondary text on a card (.cb-desk,707)", 4.5, G],
  ["fg-2", "s2", "secondary text on a control (.seg button,437)", 4.5, G],
  ["fg-2", "s3", "secondary text on a chip fill (.tags span,846)", 4.5, G],
  ["fg-3", "bg", "tertiary text / labels on the page (.lbl,315)", 4.5, G],
  ["fg-3", "s1", "tertiary text on a card (.row .d,409)", 4.5, G],
  ["fg-3", "s2", "tertiary text on a control (.pill,397)", 4.5, G],
  ["fg-3", "s3", "field placeholder on a raised fill (.input::placeholder,440)", 4.5, G],
  ["fg-2", "bg-deep", "secondary text in a deepest-ground code block (.si-pre,986)", 4.5, G],
  ["accent", "bg", "accent text on the page (.hero h1 em,471)", 4.5, G],
  ["accent", "s1", "accent text on a card (.cb-cat,719)", 4.5, G],
  ["accent", "s2", "accent text on a note fill (.dream-kind.preference,681)", 4.5, G],
  ["accent", "accent-soft", "accent pill: ink on its own wash (.pill.accent,400)", 4.5, G],
  ["fg-2", "accent-soft", "accent hint: secondary ink on the wash (.si-hint,969)", 4.5, G],
  ["accent-fg", "accent", "label on an accent fill (.btn.primary,394)", 4.5, G],
  ["on-accent", "accent", "the alt label token on an accent fill (--on-accent)", 4.5, G],
  ["ok", "bg", "ok text on the page (.proof.sign,549)", 4.5, G],
  ["warn", "bg", "warn text on the page (.proof.wait,550)", 4.5, G],
  ["bad", "bg", "bad text on the page (.proof.bad,550)", 4.5, G],
  ["ok", "s1", "ok text on a card (.run,535)", 4.5, G],
  ["warn", "s1", "warn text on a card (.gatebox,581)", 4.5, G],
  ["bad", "s1", "bad text on a card (.seal.refused,462)", 4.5, G],
  /* .pill.ok/.warn/.bad are 10.5px uppercase mono — NORMAL-SIZE text under
   * SC 1.4.3, so the bar is 4.5:1 and not the 3:1 of a large glyph. */
  ["ok", "ok-soft", "STATUS PILL: ok ink on its own wash (.pill.ok,399)", 4.5, G],
  ["warn", "warn-soft", "STATUS PILL: warn ink on its own wash (.pill.warn,399)", 4.5, G],
  ["bad", "bad-soft", "STATUS PILL: bad ink on its own wash (.pill.bad,399)", 4.5, G],
  /* .hud .card paints --glass over the graph ground, so the ink has to be
   * re-measured against the composite, not inherited from --bg. */
  ["fg", "glass", "primary text on a HUD card (.hud .card,655)", 4.5, G],
  ["fg-2", "glass", "secondary text on a HUD card (.klist,665)", 4.5, G],
  ["fg-3", "glass", "tertiary text on a HUD card (.klist span,667)", 4.5, G],
  /* --accent-3 is declared by every finish and painted nowhere in vh.css. It is
   * measured so a future use cannot land below 3:1 unnoticed, but nothing
   * renders it, so it is advisory rather than a gate. */
  ["accent-3", "bg", "the declared-but-unused accent-3 step against the page", 3, A],
  ["accent-3", "s1", "the declared-but-unused accent-3 step against a card", 3, A],
];

/* :focus-visible paints a 2px var(--accent) ring at a 2px offset, so the ring
 * lands on the SURROUNDING surface, never on the control's own fill. */
const DOOR_NON_TEXT = [
  ["accent", "bg", "FOCUS RING against the page (:focus-visible,314)", 3, G],
  ["accent", "s1", "FOCUS RING against a card", 3, G],
  ["accent", "s2", "FOCUS RING against a control", 3, G],
  ["accent", "s3", "FOCUS RING against a raised control", 3, G],
  /* A 1px border drawn on an accent fill. The control is already identified by
   * its fill, so SC 1.4.11's "not required to identify a component" exemption
   * applies and this cannot be a gate — but it is measured, because a 1.5:1
   * border on a primary action is worth seeing. */
  ["accent-2", "accent", "a 1px state rule on an accent fill (.si-new hover)", 3, A],
];

const CHROME_TEXT = [
  ["si-text", "si-bg", "primary text on the page (body,345)", 4.5, G],
  ["si-text", "si-bg-2", "primary text in a field on the recessed fill (.pc-input,1469)", 4.5, G],
  ["si-text", "si-surface", "primary text on a card (.si-card,893)", 4.5, G],
  ["si-text", "si-surface-2", "primary text on a raised control (.si-btn,1004)", 4.5, G],
  ["si-text-2", "si-bg", "secondary text on the page (.si-nav-item,521)", 4.5, G],
  ["si-text-2", "si-bg-2", "secondary text on the rail (.si-rail,444)", 4.5, G],
  ["si-text-2", "si-surface", "secondary text on a card (.si-chip,684)", 4.5, G],
  ["si-text-2", "si-surface-2", "secondary text on a raised control (.si-note,901)", 4.5, G],
  ["si-text-3", "si-bg", "tertiary text / labels on the page (.muted/.faint,918)", 4.5, G],
  ["si-text-3", "si-bg-2", "tertiary text on the rail (.si-brand small,479)", 4.5, G],
  ["si-text-3", "si-surface", "tertiary text on a card (.si-kv dt,1056)", 4.5, G],
  ["si-text-3", "si-surface-2", "placeholder on a recessed field (.pc-input::placeholder,1478)", 4.5, G],
  ["si-text-dim", "si-surface", "dimmed text on a card (.pc-note,1586)", 4.5, G],
  /* --si-accent is painted as a FILL and a 2px rule, never as text: no rule in
   * si.css reads it into a `color`. Measured as a rule against its grounds. */
  ["si-accent-ink", "si-accent", "the label on the accent-filled action (.si-new,492)", 4.5, G],
  /* .si-new:hover swaps the fill to --si-accent-2 and inherits the same
   * --si-accent-ink label, so the label is re-measured on the hover fill. This
   * is a real pairing and a real one to fail: the hover fill is one step darker
   * than the resting fill, so the label's ratio DROPS on hover. */
  ["si-accent-ink", "si-accent-2", "the label on the hover fill (.si-new:hover,500)", 4.5, G],
  ["si-ok", "si-bg", "ok text on the page", 4.5, G],
  ["si-warn", "si-bg", "warn text on the page", 4.5, G],
  ["si-bad", "si-bg", "bad text on the page", 4.5, G],
  ["si-ok", "si-ok-soft", "STATUS PILL: ok ink on its own wash (.pill.ok,1025)", 4.5, G],
  ["si-warn", "si-warn-soft", "STATUS PILL: warn ink on its own wash (.pill.warn,1030)", 4.5, G],
  ["si-bad", "si-bad-soft", "STATUS PILL: bad ink on its own wash (.pill.bad,1042)", 4.5, G],
  ["si-ink-soft", "si-accent-soft", "accent pill: ink on its own wash (.pill.accent,1280)", 4.5, G],
];

const CHROME_NON_TEXT = [
  /* si.css draws the ring with outline-offset:2px, so like vh.css it lands on
   * the surrounding surface. .si-nav-item pulls the offset to -2px so the ring
   * paints INSIDE the row, which is why that row is measured against its own
   * fill rather than against the page. */
  ["si-accent-3", "si-bg", "FOCUS RING against the page (:focus-visible,398)", 3, G],
  ["si-accent-3", "si-bg-2", "FOCUS RING against the rail", 3, G],
  ["si-accent-3", "si-surface", "FOCUS RING against a card", 3, G],
  ["si-accent-3", "si-surface-2", "FOCUS RING drawn inside a nav row (.si-nav-item,404)", 3, G],
  ["si-accent-3", "si-bg-2", "FOCUS RING around the accent-filled .si-new", 3, G],
  ["si-accent-3", "si-surface-2", "FOCUS RING on a switch track (.switch,1095)", 3, G],
  /* .si-nav-item[aria-current] paints a 2px left rule, and the row itself fills
   * with --si-surface-2, so the rule is read against that fill. */
  ["si-accent-3", "si-surface-2", "the active-door left rule on its own row fill (533)", 3, G],
  ["si-accent-3", "si-surface", "a 2px severity rule on a card (.pc-truth,1417)", 3, G],
  ["si-warn", "si-surface", "the warn rule on a card (.pc-truth,1417)", 3, G],
  ["si-accent-3", "si-accent-soft", "the checked-state border on the checked wash (1078)", 3, G],
  ["si-accent", "si-bg-2", "the accent rule / progress bar against the rail", 3, G],
  ["si-accent-2", "si-accent", "a 1px border on the accent fill (.si-new,496)", 3, A],
];

const ALL_PAIRINGS = [...DOOR_TEXT, ...DOOR_NON_TEXT, ...CHROME_TEXT, ...CHROME_NON_TEXT];
const PAIRINGS = ALL_PAIRINGS.filter(
  ([f, b]) => available.get(namespaced(f)).has(f) && available.get(namespaced(b)).has(b),
);
const outOfScope = ALL_PAIRINGS.length - PAIRINGS.length;

/* ------------------------------------------------------------------ report -- */

let failures = structureFailures;
let checked = 0;
let advisoryBelow = 0;
const rows = [];
const problems = [];

for (const theme of THEME_IDS) {
  const tokens = themes.get(theme);
  for (const [f, b, label, min, gated] of PAIRINGS) {
    const kind = min > 3 ? "text" : "non-text";
    const name = `${f} on ${b}`;
    if (!tokens.has(f) || !tokens.has(b)) {
      const which = !tokens.has(f) ? f : b;
      rows.push({ theme, kind, gated, label: name, ratio: null, min, note: "MISSING TOKEN" });
      problems.push(`${theme}: no --${which}`);
      failures++;
      continue;
    }

    const pageName = pageGroundOf(b);
    const pageRes = resolve(tokens, pageName);
    if (pageRes.error || pageRes.color.a < 1) {
      const why = pageRes.error ?? `--${pageName} is translucent and this tool does not model a backdrop behind it`;
      rows.push({ theme, kind, gated, label: name, ratio: null, min, note: "UNRESOLVED" });
      problems.push(`${theme}: ${why}`);
      failures++;
      continue;
    }

    const ground = paint(tokens, b, pageRes.color.rgb);
    if (ground.error) {
      rows.push({ theme, kind, gated, label: name, ratio: null, min, note: "UNPARSEABLE" });
      problems.push(`${theme}: ${ground.error}`);
      failures++;
      continue;
    }

    const ink = paint(tokens, f, ground.rgb);
    if (ink.error) {
      rows.push({ theme, kind, gated, label: name, ratio: null, min, note: "UNPARSEABLE" });
      problems.push(`${theme}: ${ink.error}`);
      failures++;
      continue;
    }

    const r = ratio(ink.rgb, ground.rgb);
    checked++;
    const ok = r >= min;
    if (!ok) {
      if (gated) failures++;
      else advisoryBelow++;
    }
    rows.push({
      theme,
      kind,
      gated,
      label: `${name} — ${label}`,
      ratio: r,
      min,
      note: ok ? "pass" : gated ? "FAIL" : "below (advisory)",
    });
  }
}

const w = Math.max(...rows.map((r) => r.label.length));
const themeW = Math.max(...THEME_IDS.map((t) => t.length));
for (const r of rows) {
  const v = r.ratio === null ? "  n/a " : r.ratio.toFixed(2).padStart(6);
  const gate = r.gated ? " " : "~";
  console.log(`  ${r.theme.padEnd(themeW)}${gate} ${r.label.padEnd(w)} ${v}:1  min ${r.min} (${r.kind})  ${r.note}`);
}

console.log(`\n  sheets: ${SHEETS.map((s) => path.relative(process.cwd(), s)).join(", ")}`);
if (outOfScope) {
  console.log(
    `  ${outOfScope} pairing(s) SKIPPED: their token namespace was not among the sheets loaded. ` +
      `Run with no argument to check both halves of the design system.`,
  );
}
console.log(`  ${checked} pairings checked across ${THEME_IDS.length} finishes (gated + advisory).`);
const worstGated = rows.filter((r) => r.ratio !== null && r.gated).reduce((a, b) => (b.ratio < a.ratio ? b : a));
console.log(
  `  worst gated value: ${worstGated.theme} ${worstGated.label} at ${worstGated.ratio.toFixed(2)}:1 ` +
    `(minimum ${worstGated.min})`,
);
if (advisoryBelow) {
  console.log(`  advisory rows below their reference: ${advisoryBelow} (printed above with ~, not gating)`);
}

if (problems.length) {
  console.error(`\n  ${problems.length} pairing(s) could not be measured:`);
  for (const p of problems) console.error(`    - ${p}`);
}

if (failures > 0) {
  const bad = rows.filter((r) => r.note === "FAIL");
  console.error(`\n  CONTRAST CHECK FAILED — ${failures} pairing(s) below their minimum.`);
  if (bad.length) {
    console.error("  Below minimum:");
    for (const r of bad) {
      console.error(
        `    ${r.theme.padEnd(themeW)}  ${r.label.padEnd(w)}  ${r.ratio.toFixed(2)}:1  needs ${r.min} (${r.kind})`,
      );
    }
  }
  process.exit(1);
}
console.log("  CONTRAST CHECK PASSED — every gated pairing clears its WCAG minimum.");
console.log("");
console.log("  SCOPE, stated plainly so this line is never read as more than it is:");
console.log("  This proves the LISTED pairings, on the listed grounds, at the listed sizes.");
console.log("  It is NOT a full WCAG AA audit of the rendered UI. It does not measure a");
console.log("  pairing no rule paints, it does not read font size from the cascade, and it");
console.log("  cannot see an ink or a wash an image, gradient or filter contributes.");
