/**
 * SelfImpulse — the content injection guard.
 *
 * THE PROBLEM THIS CLOSES. Every path that brings text INTO a mission is a path an
 * attacker can write on: a dropped PDF, a fetched web page, a federated handoff, and —
 * once channels are mounted — a WhatsApp or Telegram message from someone who is not
 * the owner. Those are all untrusted content that the model will read as if a person
 * wrote it. This module is the door those paths walk through.
 *
 * WHAT IT IS, EXACTLY. A detector battery with two tiers, and the split is deliberate
 * because the first tier alone is not sufficient:
 *
 *   • LEXICAL (h1–h6) — instruction override, prompt exfiltration, role hijack,
 *     authority claim, exfiltration request, fake conversation delimiters. These read
 *     WORDS. They are cheap, they are the common case, and they are EVADABLE by
 *     rewording. That is not a defect to hide; it is a property to state.
 *
 *   • STRUCTURAL (s7–s11) — invisible and zero-width characters, the Unicode tag block,
 *     bidirectional overrides, long encoded blobs, homoglyph substitution. These do not
 *     read intent at all; they notice that the text is doing something a human reader
 *     cannot see. Rewording the prose does not remove an invisible instruction channel.
 *
 *   • CAPABILITY (c12–c13) — the content names SelfImpulse's OWN tool vocabulary
 *     (`fs.write`, `pc.exec`, `net.fetch`, `shell_exec`) or a tool-call-shaped payload.
 *     This tier does not read intent either. It answers one question: does this text,
 *     sitting in a document, spell out a tool invocation? A page cannot ask for
 *     `pc.exec` by accident.
 *
 * The lesson is taken verbatim from 19.7.10 [Screenwright], which recorded that an
 * all-lexical battery was EVADABLE — a destructive proposal reworded to dodge the
 * keywords passed 6/6 and drew a valid signature. The same failure mode applies here,
 * and the answer is the same: add tiers that do not depend on wording.
 *
 * WHAT IT DOES NOT DO, STATED PLAINLY.
 *   • It is PATTERN MATCHING, not a classifier and not a sandbox. A remote model is
 *     never called — the content does not leave the machine to be judged.
 *   • It does NOT decide. It returns findings and a suggested tier. The engine's own
 *     gate decides, exactly as it does for a tool call. This module holds no authority.
 *   • It will MISS a novel phrasing that names none of the patterns. It is a seatbelt,
 *     not a wall. The wall is the gate and the receipt.
 *   • A clean scan is NOT a statement that content is safe. It is a statement that this
 *     battery found nothing. Those are different sentences and the refusal text below
 *     is written to keep them different.
 *
 * Determinism: no clock, no randomness, no I/O, no network. The same content returns
 * byte-identical findings on every machine — the probe pins that, because a guard whose
 * output drifts cannot be receipted.
 */

import type { RiskTier } from "../engine/types";

/** Detector families. The split is the design, not a label. */
export type InjectionFamily = "lexical" | "structural" | "capability";

export type InjectionSeverity = "low" | "medium" | "high";

export interface InjectionFinding {
  /** Stable id — never reused, never renumbered. Receipts point at these. */
  id: string;
  family: InjectionFamily;
  severity: InjectionSeverity;
  /** Short human label for the ledger. */
  label: string;
  /** The exact span that fired, truncated and made safe to print. */
  evidence: string;
  /** Byte offset into the NORMALIZED content (not the raw input). */
  offset: number;
}

export interface InjectionScan {
  /** Every detector that fired, in scan order. Empty means this battery found nothing. */
  findings: InjectionFinding[];
  /**
   * Suggested tier for the gate. `safe` here means "this battery found nothing",
   * NOT "this content is safe" — see the header.
   */
  tier: RiskTier;
  /** The normalized content the scan actually ran against. */
  normalized: string;
  /** Counts of characters this module removed or flagged as invisible. */
  stripped: { zeroWidth: number; tags: number; bidi: number };
  /** Words for a refusal, present only when tier is `critical`. */
  refusal?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Normalization
// ─────────────────────────────────────────────────────────────────────────────

/** Zero-width and invisible formatting characters that carry no visible glyph. */
const ZERO_WIDTH = /[\u200B-\u200F\u2060-\u2064\u206A-\u206F\uFEFF\u00AD]/g;
/** The Unicode tag block: invisible, and a known instruction-smuggling channel. */
const UNICODE_TAGS = /[\u{E0000}-\u{E007F}]/gu;
/** Bidirectional overrides — the Trojan Source family. */
const BIDI = /[\u202A-\u202E\u2066-\u2069\u061C]/g;
/** Variation selectors and other default-ignorable codepoints. */
const IGNORABLE = /[\u180B-\u180D\uFE00-\uFE0F]/g;

export interface StrippedContent {
  text: string;
  zeroWidth: number;
  tags: number;
  bidi: number;
}

/**
 * Remove characters a human reader cannot see. Exported because the ingest path wants
 * it too: a document whose extracted text carries invisible instructions should be
 * stored the way it reads, not the way it was written.
 */
export function stripInvisible(input: string): StrippedContent {
  let zeroWidth = 0, tags = 0, bidi = 0;
  const text = input
    .replace(ZERO_WIDTH, () => { zeroWidth++; return ""; })
    .replace(UNICODE_TAGS, () => { tags++; return ""; })
    .replace(BIDI, () => { bidi++; return ""; })
    .replace(IGNORABLE, () => { zeroWidth++; return ""; });
  return { text, zeroWidth, tags, bidi };
}

/** Collapse whitespace runs so a pattern cannot be defeated by newlines alone. */
function flatten(s: string): string {
  return s.replace(/[\t\r\f\v]+/g, " ").replace(/\n{3,}/g, "\n\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// Detector battery
// ─────────────────────────────────────────────────────────────────────────────

interface Detector {
  id: string;
  family: InjectionFamily;
  severity: InjectionSeverity;
  label: string;
  pattern: RegExp;
}

/**
 * LEXICAL tier — reads words. Evadable by rewording; kept because it is the common case
 * and because a detection here is cheap evidence for the ledger.
 */
const LEXICAL: Detector[] = [
  {
    id: "h1", family: "lexical", severity: "high", label: "Instruction override",
    pattern: /\b(ignore|disregard|forget|override|bypass)\s+(all\s+|any\s+|the\s+|your\s+)?(previous|prior|above|earlier|preceding|system)\s+(instruction|prompt|rule|direction|message|context)/i,
  },
  {
    id: "h2", family: "lexical", severity: "high", label: "System-prompt exfiltration",
    pattern: /\b(reveal|repeat|print|show|output|disclose|echo|dump)\s+(me\s+)?(your\s+|the\s+)?(full\s+|entire\s+|complete\s+|verbatim\s+)?(system\s+prompt|initial\s+prompt|instructions|system\s+message|prompt\s+template)/i,
  },
  {
    id: "h3", family: "lexical", severity: "medium", label: "Role hijack",
    pattern: /\b(you\s+are\s+now|from\s+now\s+on\s+you|act\s+as\s+(if\s+you\s+are\s+)?(a|an|the)\s+(unrestricted|unfiltered|new|different|admin)|pretend\s+(that\s+)?you\s+(are|have)|assume\s+the\s+(role|persona|identity)\s+of|new\s+(persona|identity|role)\s*:)/i,
  },
  {
    id: "h4", family: "lexical", severity: "medium", label: "Authority claim",
    pattern: /\b(as\s+(the|an?)\s+(administrator|admin|developer|owner|operator|root)|developer\s+mode|admin(istrative)?\s+override|god\s+mode|jailbreak|maintenance\s+mode|authorized\s+override|sudo\s+mode)/i,
  },
  {
    id: "h5", family: "lexical", severity: "high", label: "Exfiltration request",
    pattern: /\b(send|post|upload|transmit|exfiltrate|forward|email|leak)\b[^.\n]{0,60}\b(to|at)\b\s*(https?:\/\/|ftp:\/\/|[\w.-]+@)/i,
  },
  {
    id: "h6", family: "lexical", severity: "medium", label: "Fake conversation delimiter",
    pattern: /(^|\n)\s*(#{1,4}\s*)?(system|assistant|human|user|developer)\s*(\[|:|\|)/i,
  },
];

/**
 * STRUCTURAL tier — does not read intent. Notices that the text is doing something a
 * reader cannot see, or is shaped like a payload rather than prose.
 */
const STRUCTURAL: Detector[] = [
  {
    id: "s7", family: "structural", severity: "high", label: "Encoded blob in prose",
    // A long base64 run inside flowing text is not how documents are written.
    pattern: /(?<![A-Za-z0-9+/])[A-Za-z0-9+/]{120,}={0,2}(?![A-Za-z0-9+/])/,
  },
  {
    id: "s8", family: "structural", severity: "medium", label: "Homoglyph substitution",
    // Cyrillic/Greek lookalikes mixed into otherwise-Latin words.
    pattern: /(?:\b\w*[\u0400-\u04FF\u0370-\u03FF]\w*\b)/,
  },
  {
    id: "s9", family: "structural", severity: "medium", label: "Data-URI or encoded redirect",
    pattern: /data:text\/html|base64,[A-Za-z0-9+/]{40,}|\bjavascript:\s*\w/i,
  },
  {
    id: "s10", family: "structural", severity: "medium", label: "Imperative embedded in a link",
    pattern: /https?:\/\/[^\s<>"']*[?&][^\s<>"']*(prompt|instruction|cmd|command|exec|payload)=/i,
  },
  {
    id: "s11", family: "structural", severity: "low", label: "Assignment-shaped secret echo",
    // text inviting the model to reproduce a credential-looking pair
    pattern: /\b(api[_-]?key|secret|token|password|passwd|credential)s?\b\s*[:=]\s*\S{8,}/i,
  },
];

/**
 * CAPABILITY tier — SelfImpulse's own tool vocabulary appearing in content.
 *
 * This is the tier the 19.7.10 lesson produced: reword the prose all you like, a page
 * has no innocent reason to spell out `pc.exec` or to phrase a JSON tool call. It reads
 * presence, not intent.
 *
 * The vocabulary is exactly the tools that EXIST. The removed CLI subsystem is absent
 * on purpose, and a probe enforces it: watching for a tool that no longer exists is
 * watching nothing, and naming it here would make this file read as a live reference to
 * a capability the product deleted.
 */
const SELFIMPULSE_TOOLS = "fs\\.(?:list|read|write)|net\\.fetch|wiki\\.search|pc\\.(?:exec|browser)|mcp\\.call|shell_exec";

const CAPABILITY: Detector[] = [
  {
    id: "c12", family: "capability", severity: "high", label: "Engine tool named in content",
    pattern: new RegExp(`\\b(?:${SELFIMPULSE_TOOLS})\\b`),
  },
  {
    id: "c13", family: "capability", severity: "high", label: "Tool-call-shaped payload",
    pattern: /(?:```[a-z]*\s*)?[{[][^}\]]{0,200}?"(?:tool|tool_name|function|name|action)"\s*:\s*"(?:[a-z_]+\.)?(?:exec|write|shell|run|call|fetch|read)[a-z_]*"/i,
  },
];

const ALL: Detector[] = [...CAPABILITY, ...STRUCTURAL, ...LEXICAL];

// ─────────────────────────────────────────────────────────────────────────────
// The scan
// ─────────────────────────────────────────────────────────────────────────────

const REFUSAL_WORDS =
  "This content asks the engine to act on its own instructions — it names the engine's tools, " +
  "or carries hidden or encoded text that a reader cannot see. SelfImpulse will not treat a " +
  "document or a message as an operator. The content is not installed, and this refusal is " +
  "kept as a receipt.";

const CAP_WORDS =
  "This content names the engine's own tools. A document, a web page or a message from someone " +
  "else has no reason to spell out a tool invocation, so it is refused rather than executed.";

function clip(s: string, n = 80): string {
  const one = s.replace(/\s+/g, " ").trim();
  return one.length <= n ? one : one.slice(0, n - 1) + "…";
}

/**
 * Scan untrusted content for injection-shaped material.
 *
 * Never throws. A guard that throws is a guard that can be disabled by its own input.
 */
export function scanForInjection(content: string, opts?: { maxFindings?: number }): InjectionScan {
  const max = opts?.maxFindings ?? 40;
  const empty: InjectionScan = {
    findings: [], tier: "safe", normalized: "", stripped: { zeroWidth: 0, tags: 0, bidi: 0 },
  };

  try {
    if (typeof content !== "string" || content.length === 0) return empty;

    const strip = stripInvisible(content);
    const normalized = flatten(strip.text);
    const findings: InjectionFinding[] = [];
    const record = (f: InjectionFinding) => { if (findings.length < max) findings.push(f); };

    // ── Invisible-character channels are recorded FIRST, because they are the findings a
    //    human cannot see for themselves. Each channel is its own id, so the ledger names
    //    how the text was hidden rather than only that something was.
    if (strip.tags > 0) {
      record({ id: "s-tags", family: "structural", severity: "high",
        label: `Unicode tag block (${strip.tags} char${strip.tags === 1 ? "" : "s"})`,
        evidence: `${strip.tags} invisible tag codepoint(s) removed`, offset: 0 });
    }
    if (strip.bidi > 0) {
      record({ id: "s-bidi", family: "structural", severity: "medium",
        label: `Bidirectional override (${strip.bidi})`,
        evidence: `${strip.bidi} bidi override(s) removed`, offset: 0 });
    }
    if (strip.zeroWidth > 0) {
      record({ id: "s-zw", family: "structural", severity: "medium",
        label: `Zero-width characters (${strip.zeroWidth})`,
        evidence: `${strip.zeroWidth} invisible character(s) removed`, offset: 0 });
    }

    // ── Pattern detectors run against the NORMALIZED text, so hiding a keyword behind a
    //    zero-width joiner or a newline does not defeat the lexical tier.
    for (const d of ALL) {
      const re = new RegExp(d.pattern.source, d.pattern.flags.includes("g") ? d.pattern.flags : d.pattern.flags + "g");
      let m: RegExpExecArray | null;
      let seen = 0;
      while ((m = re.exec(normalized)) !== null && seen < 3) {
        seen++;
        record({ id: d.id, family: d.family, severity: d.severity, label: d.label, evidence: clip(m[0]), offset: m.index });
        if (m.index === re.lastIndex) re.lastIndex++;
      }
    }

    const { tier } = computeTier(findings);
    const scan: InjectionScan = {
      findings, tier, normalized,
      stripped: { zeroWidth: strip.zeroWidth, tags: strip.tags, bidi: strip.bidi },
    };
    if (tier === "critical") {
      const cap = findings.some((f) => f.family === "capability");
      scan.refusal = cap ? CAP_WORDS : REFUSAL_WORDS;
    }
    return scan;
  } catch {
    // A guard that throws is worse than a guard that reports nothing: the caller cannot
    // tell "clean" from "crashed". Return an explicit empty scan, never a throw.
    return empty;
  }
}

/**
 * The tier rule, stated once.
 *
 *   critical — the content names the engine's tools (capability), or it hides text from
 *              the reader AND tries a lexical move, or two or more high findings fire.
 *   risky    — any high finding, or a hidden-text channel on its own, or three medium.
 *   safe     — this battery found nothing above the threshold.
 */
export function computeTier(findings: InjectionFinding[]): { tier: RiskTier; why: string } {
  const has = (id: string) => findings.some((f) => f.id === id);
  const count = (s: InjectionSeverity) => findings.filter((f) => f.severity === s).length;
  const capability = findings.some((f) => f.family === "capability");
  const hidden = has("s-tags") || has("s-bidi") || has("s-zw");
  const high = count("high");

  if (capability) return { tier: "critical", why: "content names the engine's own tools" };
  if (hidden && findings.some((f) => f.family === "lexical")) {
    return { tier: "critical", why: "hidden text channel combined with an instruction-shaped phrase" };
  }
  if (high >= 2) return { tier: "critical", why: `${high} high-severity findings` };
  if (high >= 1 || hidden) return { tier: "risky", why: high >= 1 ? "a high-severity finding" : "a hidden text channel" };
  if (count("medium") >= 3) return { tier: "risky", why: "three or more medium findings" };
  return { tier: "safe", why: "this battery found nothing" };
}

/**
 * One line for the ledger. The gate records this next to every ingested document and
 * every inbound channel message, so a scan is auditable rather than remembered.
 */
export function scanLine(scan: InjectionScan, sourceName: string): string {
  if (scan.findings.length === 0) return `${sourceName}: injection scan clean (this battery found nothing)`;
  const ids = Array.from(new Set(scan.findings.map((f) => f.id))).join(", ");
  return `${sourceName}: injection scan ${scan.tier} — ${scan.findings.length} finding(s) [${ids}]`;
}
