/**
 * Documentation engines — readability, structure and consistency, measured.
 *
 * Prose quality is a judgement, but three parts of it are not: how long a piece takes to
 * read, what grade level it demands, and whether its own structure holds together. Those are
 * the parts a linter should own, so a reviewer can spend their attention on the part that
 * needs a human.
 */
import { area, num, number, str, type Tool, type ToolResult } from "./types";

/* ── prose measurement ─────────────────────────────────────────────────────── */

/** English syllable estimate: vowel groups, minus a silent trailing e, floor of one. */
export function syllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, "");
  if (!w) return 0;
  const groups = w.replace(/e$/, "").match(/[aeiouy]+/g);
  return Math.max(1, groups ? groups.length : 1);
}

export interface Readability {
  words: number; sentences: number; syllables: number;
  avgSentenceWords: number; avgWordSyllables: number;
  fleschReadingEase: number; fleschKincaidGrade: number; interpretation: string;
}

export function readability(text: string): Readability {
  const clean = text.replace(/```[\s\S]*?```/g, " ").replace(/`[^`]*`/g, " ");
  const sentences = clean.split(/[.!?]+(?:\s|$)/).map((s) => s.trim()).filter((s) => s.length > 0);
  const words = clean.split(/\s+/).map((w) => w.replace(/[^A-Za-z'-]/g, "")).filter((w) => w.length > 0);
  const syl = words.reduce((a, w) => a + syllables(w), 0);
  const sCount = Math.max(1, sentences.length), wCount = Math.max(1, words.length);
  const asl = wCount / sCount, asw = syl / wCount;
  const ease = 206.835 - 1.015 * asl - 84.6 * asw;
  const grade = 0.39 * asl + 11.8 * asw - 15.59;
  const interpretation = grade <= 8
    ? "reads at a general-audience level — appropriate for user-facing docs and onboarding"
    : grade <= 12
      ? "reads at a high-school level — fine for developer documentation"
      : grade <= 16
        ? "reads at an undergraduate level — expect re-reading; consider splitting sentences"
        : "reads at a graduate level — usually a symptom of long sentences rather than hard ideas; cut the sentences, not the ideas";
  return { words: wCount, sentences: sCount, syllables: syl,
           avgSentenceWords: Math.round(asl * 10) / 10, avgWordSyllables: Math.round(asw * 100) / 100,
           fleschReadingEase: Math.round(ease * 10) / 10, fleschKincaidGrade: Math.round(grade * 10) / 10, interpretation };
}

export function readingTime(text: string, wpm = 200): { words: number; minutes: number; codeLines: number } {
  const withoutCode = text.replace(/```[\s\S]*?```/g, " ");
  const words = withoutCode.split(/\s+/).filter((w) => w.trim().length > 0).length;
  const codeLines = (text.match(/```[\s\S]*?```/g) ?? []).reduce((a, block) => a + block.split("\n").length - 2, 0);
  return { words, minutes: words / wpm, codeLines };
}

/* ── structure ─────────────────────────────────────────────────────────────── */

export interface HeadingIssue { line: number; heading: string; issue: string }

export function headingLint(markdown: string): {
  h1: number; counts: Record<number, number>; issues: HeadingIssue[];
} {
  const issues: HeadingIssue[] = [];
  const counts: Record<number, number> = {};
  let h1 = 0, previous = 0;
  const seen = new Set<string>();
  markdown.split(/\r?\n/).forEach((line, i) => {
    const m = line.match(/^(#{1,6})\s*(.*)$/);
    if (!m) return;
    const level = m[1]!.length;
    const text = m[2]!.trim();
    counts[level] = (counts[level] ?? 0) + 1;
    if (level === 1) h1++;
    if (!text) issues.push({ line: i + 1, heading: line.trim(), issue: "empty heading" });
    if (previous !== 0 && level > previous + 1) {
      issues.push({ line: i + 1, heading: text, issue: `jumps from h${previous} to h${level} — a skipped level breaks the table of contents and the outline for screen readers` });
    }
    const anchor = text.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, "-");
    if (text && seen.has(anchor)) issues.push({ line: i + 1, heading: text, issue: "duplicate heading text — the anchor collides with the earlier one" });
    seen.add(anchor);
    previous = level;
  });
  if (h1 === 0) issues.push({ line: 0, heading: "(document)", issue: "no h1 — the document has no title for a reader, a search result or a screen reader" });
  if (h1 > 1) issues.push({ line: 0, heading: "(document)", issue: `${h1} h1 headings — a document with several titles has no title` });
  return { h1, counts, issues };
}

/* ── terminology ───────────────────────────────────────────────────────────── */

const VARIANTS: Array<[RegExp, string]> = [
  [/\be-?mail(s?)\b/gi, "email"],
  [/\blog ?-?in\b/gi, "log in"],
  [/\bset ?up\b/gi, "set up"],
  [/\bweb ?site\b/gi, "website"],
  [/\bback ?end\b/gi, "backend"],
  [/\bfront ?end\b/gi, "frontend"],
];

export function terminologyDrift(text: string): Array<{ term: string; variants: Array<{ form: string; count: number }>; note: string }> {
  const out: Array<{ term: string; variants: Array<{ form: string; count: number }>; note: string }> = [];

  /* casing drift: the same word written two ways */
  const byLower = new Map<string, Map<string, number>>();
  for (const raw of text.split(/\s+/)) {
    const w = raw.replace(/[^A-Za-z]/g, "");
    if (w.length < 3 || /^[A-Z]+$/.test(w) && w.length <= 3) continue;      // skip acronyms like API in prose
    const key = w.toLowerCase();
    if (!byLower.has(key)) byLower.set(key, new Map());
    const m = byLower.get(key)!;
    m.set(w, (m.get(w) ?? 0) + 1);
  }
  for (const [key, forms] of byLower) {
    if (forms.size > 1 && [...forms.values()].some((n) => n > 1)) {
      out.push({
        term: key,
        variants: [...forms.entries()].map(([form, count]) => ({ form, count })).sort((a, b) => b.count - a.count),
        note: "the same word is written more than one way — pick one and use it everywhere; search and glossary lookups depend on it",
      });
    }
  }
  for (const [re, canonical] of VARIANTS) {
    const found = new Map<string, number>();
    let m: RegExpExecArray | null;
    const g = new RegExp(re.source, re.flags.includes("g") ? re.flags : `${re.flags}g`);
    while ((m = g.exec(text)) !== null) found.set(m[0], (found.get(m[0]) ?? 0) + 1);
    if (found.size > 1) {
      out.push({ term: canonical,
        variants: [...found.entries()].map(([form, count]) => ({ form, count })).sort((a, b) => b.count - a.count),
        note: `variants of "${canonical}" appear — hyphenation drift is the most common form of this` });
    }
  }
  return out;
}

/* ── the tools ─────────────────────────────────────────────────────────────── */

const SAMPLE = `The steward receives your request and breaks it into steps. It runs each step with the tools you have connected, and it stops before anything that would spend money or change a system you did not authorise. When it stops, it asks you, and it records the answer together with what it ran.`;

export const DOCS_TOOLS: Tool[] = [
  {
    id: "readability",
    domain: "docs",
    label: "Readability",
    blurb: "Flesch reading ease and grade level, with the sentence length that caused it.",
    fields: [area("text", "Prose", SAMPLE, "code blocks are stripped before measuring — they are not prose")],
    run: (v): ToolResult => {
      const r = readability(str(v, "text"));
      if (r.words < 10) return { headline: "Too little prose to measure", ok: false, basis: "Flesch's formulas are unreliable below about ten words" };
      return {
        headline: `Grade ${r.fleschKincaidGrade} · ease ${r.fleschReadingEase}`,
        ok: r.fleschKincaidGrade <= 12,
        kpis: [
          { value: `${r.words}`, label: "words" },
          { value: `${r.sentences}`, label: "sentences" },
          { value: `${r.avgSentenceWords}`, label: "avg words / sentence" },
          { value: `${r.avgWordSyllables}`, label: "avg syllables / word" },
        ],
        lines: [r.interpretation,
          r.avgSentenceWords > 22 ? `Average sentence length is ${r.avgSentenceWords} words; long sentences are the usual cause of a high grade score, and splitting them lowers it without losing any content.` : "Sentence length is in the comfortable range."],
        basis: "Flesch Reading Ease = 206.835 − 1.015·(words/sentences) − 84.6·(syllables/words); Flesch-Kincaid "
             + "Grade = 0.39·(words/sentences) + 11.8·(syllables/words) − 15.59. Syllables are estimated by vowel groups, "
             + "so an unusual word can be a syllable out",
      };
    },
  },
  {
    id: "reading-time",
    domain: "docs",
    label: "Reading time",
    blurb: "Words, minutes and code lines — for knowing whether a page needs a summary.",
    fields: [area("text", "Document", `${SAMPLE}\n\n\`\`\`ts\nconst x = 1;\nconst y = 2;\n\`\`\``), num("wpm", "Words per minute", "200")],
    run: (v): ToolResult => {
      const r = readingTime(str(v, "text"), number(v, "wpm", 200));
      const mins = r.minutes < 1 ? `${Math.ceil(r.minutes * 60)} seconds` : `${r.minutes.toFixed(1)} minutes`;
      return {
        headline: `${r.words} words — about ${mins}`,
        ok: r.minutes <= 8,
        kpis: [
          { value: `${r.words}`, label: "words" },
          { value: mins, label: "reading time" },
          { value: `${r.codeLines}`, label: "code lines" },
          { value: `${number(v, "wpm", 200)}`, label: "wpm assumed" },
        ],
        lines: [
          r.minutes > 8 ? "Past about eight minutes, a document is generally skimmed rather than read — a summary at the top is doing real work at this length." : "Short enough to be read rather than skimmed.",
          "Code lines are counted separately and excluded from the word count: a reader scans code at a very different rate from prose.",
        ],
        basis: `words divided by ${number(v, "wpm", 200)} wpm; 200–250 wpm is the usual range for technical prose read on a screen`,
      };
    },
  },
  {
    id: "headings",
    domain: "docs",
    label: "Heading structure",
    blurb: "Level jumps, duplicate anchors, missing or multiplied titles.",
    fields: [area("text", "Markdown", "# Payments API\n\n## Authentication\n\n#### Tokens\n\n## Authentication\n\n### Errors", "paste markdown")],
    run: (v): ToolResult => {
      const h = headingLint(str(v, "text"));
      const counts = Object.entries(h.counts).sort(([a], [b]) => Number(a) - Number(b));
      return {
        headline: h.issues.length ? `${h.issues.length} structural issue(s)` : "Structure is sound",
        ok: h.issues.length === 0,
        kpis: [
          { value: `${h.h1}`, label: "h1 headings" },
          { value: counts.map(([lvl, n]) => `h${lvl}:${n}`).join(" "), label: "by level" },
        ],
        table: h.issues.length
          ? { head: ["Line", "Heading", "Issue"], rows: h.issues.map((i) => [i.line ? `${i.line}` : "—", i.heading, i.issue]) }
          : undefined,
        basis: "heading levels must not skip, anchors must not collide, and a document needs exactly one h1 — the "
             + "rules a table of contents and a screen reader both depend on",
      };
    },
  },
  {
    id: "terminology",
    domain: "docs",
    label: "Terminology",
    blurb: "Finds the same word written two ways across a document set.",
    fields: [area("text", "Text", "The Kubernetes cluster runs in us-east-1. Developers deploy to the kubernetes cluster with kubectl. Log in on the login page, then Log In again.", "paste a page, a README, or a whole set")],
    run: (v): ToolResult => {
      const drift = terminologyDrift(str(v, "text"));
      return {
        headline: drift.length ? `${drift.length} term(s) written inconsistently` : "No terminology drift found",
        ok: drift.length === 0,
        table: drift.length
          ? { head: ["Term", "Variants", "Why it matters"], rows: drift.map((d) => [d.term, d.variants.map((x) => `${x.form} (${x.count})`).join(", "), d.note]) }
          : undefined,
        lines: [
          drift.length
            ? "Consistent terms are what make search, glossary links and translation work — a reader who searches for the other spelling finds nothing."
            : "One spelling per word in the text supplied. This checks the text it was given, not the site-wide glossary.",
        ],
        basis: "case-variant detection on repeated words, plus a fixed list of hyphenation variants (email/e-mail, "
             + "login/log in, backend/back-end); acronyms of three letters or fewer are excluded, so API/http casing is not flagged",
      };
    },
  },
];
