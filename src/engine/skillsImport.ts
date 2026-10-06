/**
 * SelfImpulse — skills import (19.4.0): the skill-format + Hermes agent, made ours.
 *
 * The skill format and the Hermes agent both ship skills in the open SKILL.md
 * (Agent Skills) format: YAML frontmatter (name, description, metadata with
 * per-ecosystem gating) plus a markdown playbook body. Instead of forking
 * two ecosystems, SelfImpulse imports both through ONE faithful parser and
 * runs imported skills under VH's own discipline:
 *
 *   • provenance is recorded (source ecosystem, timestamp, sha-256 of the
 *     raw text) and shown — an imported skill never pretends to be seeded;
 *   • gating metadata is RESPECTED, honestly: a skill that declares
 *     required binaries or env vars is ineligible on a surface that cannot
 *     verify them (the browser says so; Node actually checks);
 *   • an imported skill is a playbook, not a capability grant — it composes
 *     into the routed specialist's prompt exactly like a seeded skill and
 *     grants no tools of its own.
 *
 * THE DOOR (19.7.16 — the guard that was missing here).
 *   A skill body is not a document: it is concatenated straight into a SYSTEM
 *   PROMPT (skills.ts → buildSpecialistPrompt), and from there a model can emit
 *   a ```tool block that hermesRuntime dispatches as a real shell/fs/mcp call.
 *   The documents path has had `scanForInjection` since 19.7.10 (mission/
 *   fileIngest.ts:339-343); skills did not, so an imported SKILL.md was the one
 *   untrusted input with a shorter path to the engine than a PDF had.
 *
 *   TRUST TIERS, named once, because three paths reach this module and only one
 *   of them is authored by the person who owns the machine:
 *
 *     · BUNDLED  — the three playbooks under skills/ (SKILL.md) and the seeded
 *                  SKILLS array in skills.ts. Shipped with the product, reviewed
 *                  with it. This module never has to defend against them.
 *     · IMPORTED — anything a user pasted, a file gave us, or another ecosystem's
 *                  skill-format export produced. UNTRUSTED: the author is not the
 *                  owner. Stripped of invisible characters, scanned, and refused
 *                  on `critical` — the same rule, in the same tone, as the
 *                  document door.
 *     · RSI-DRAFTED — an RSI draft's body is composed from ledger evidence and
 *                  then hand-assembled into a SKILL.md by applyRsiDraft, which
 *                  DEFAULTS `category: *`. It arrives on the "pasted" path and
 *                  is treated as IMPORTED (untrusted), never as bundled, and
 *                  never as owner-authored — see the wildcard rule below.
 *
 *   WHAT THIS MODULE DOES NOT DECIDE. `scanForInjection` returns findings and a
 *   suggested tier; the refusal below is the gate, and it is the same shape as
 *   every other gate in the product: refuse in plain words, name what fired,
 *   store nothing.
 */
import type { VhSkill } from "./skills";
import { scanForInjection, scanLine, stripInvisible, type InjectionScan } from "../security/injectionGuard";

export interface ImportedSkill extends VhSkill {
  /** Which ecosystem the text came from (or "pasted" for raw imports). */
  source: "skill" | "hermes" | "pasted";
  importedAt: string;
  /** sha-256 of the raw imported text — provenance, not proof. */
  digest: string;
  version?: string;
  /** Gating metadata, respected at eligibility time. */
  needsEnv: string[];
  needsBins: string[];
  needsTools: string[];
  allowedTools: string[];
  /** VH category binding (frontmatter `category:` — VH extension, documented). */
  category?: string;
  /**
   * How many invisible characters the door removed from this text. Absent means
   * none. It is a field rather than a silent fix because a stored skill whose
   * text differed from the text the owner pasted is a record that disagrees
   * with itself.
   */
  strippedInvisible?: number;
  /** The scan verdict that let this in, for the ledger. Absent = never scanned. */
  scanNote?: string;
}

/* ── the door's bounds ───────────────────────────────────────────────────── */

/**
 * Progressive disclosure's own bound. Every seeded body in skills.ts is under
 * 2000 characters (probe/skills.test.ts pins it) and a playbook is a numbered
 * procedure plus a checklist; anything much longer than this is trying to fill
 * the prompt rather than to describe a procedure. REJECTED, not truncated: a
 * silent truncation would leave the owner believing a skill was installed whole
 * when half of it was quietly dropped, and it would let an attacker push a
 * leading, in-budget payload with an arbitrary tail behind it.
 */
export const MAX_IMPORTED_BODY_CHARS = 4000;
/** Frontmatter and body together. Bounded so parsing is bounded. */
export const MAX_IMPORTED_RAW_CHARS = 8000;

/**
 * A refusal, as a value. Callers that want to distinguish "the door said no"
 * from "a bug threw" can catch this; callers that only report the message
 * (applyRsiDraft, the Skills desk) need nothing else.
 */
export class SkillImportRefusal extends Error {
  readonly scan: InjectionScan | null;
  constructor(message: string, scan: InjectionScan | null = null) {
    super(message);
    this.name = "SkillImportRefusal";
    this.scan = scan;
  }
}

/**
 * F2 — the wildcard, decided once.
 *
 * `category: "*"` on an imported skill means "put this text in front of EVERY
 * specialist", which is the widest possible blast radius for text whose author
 * is not the owner. It was reachable two ways: by hand in frontmatter, and by
 * DEFAULT through applyRsiDraft (rsi.ts:233 writes `category: ${d.category ??
 * "*"}`, so every category-less RSI draft asked for the wildcard). That file is
 * not ours to change, so the rule lives here and at the binding site.
 *
 * Imported skills therefore may NOT bind to the wildcard. skills.ts enforces the
 * matching half — an imported skill binds to a specialist only when its category
 * is a concrete string equal to that specialist's — so a wildcard record already
 * sitting in localStorage from before this rule also binds to nobody.
 *
 * This is deliberately a loud refusal rather than a silent rewrite to the first
 * category we liked: rewriting would import something the owner did not ask for,
 * and the RSI path would then report success for a playbook that never binds.
 */
const WILDCARD = "*";

function assertBindable(parsed: { category?: string }): void {
  if (parsed.category === WILDCARD) {
    throw new SkillImportRefusal(
      `This skill declares category "${WILDCARD}", which would put its text in front of every specialist. ` +
        "Imported skills bind to one named category — give it the category it is actually for " +
        "(for example `category: code`) and import it again. Bundled skills are the only ones that may be unbound.",
    );
  }
}

/**
 * F1 + F3(bound) — the gate itself, in the order the document door uses.
 *
 *   1. INVISIBLE CHARACTERS ARE REMOVED, and the count is kept. A skill carrying
 *      instructions in a channel no human can see should be stored the way it
 *      READS, not the way it was written.
 *   2. THE TEXT IS SCANNED, and `critical` is a refusal — in the guard's own
 *      words, plus the ledger line naming which detectors fired so the owner can
 *      open the file and judge.
 *
 * Lower tiers are DELIBERATELY not blocking, and the reason matters: `risky` is
 * one high-severity finding, or a hidden-text channel alone, or three mediums.
 * Those are text a competent operator may well have written — a security playbook
 * legitimately discusses prompt injection, "api_key:" assignment examples, and
 * base64 snippets, and refusing those would train the owner that the door is
 * noise. Blocking every `risky` import would push owners toward a door that does
 * not work, which is how doors get turned off. So `risky` is admitted, the scan
 * line rides on the stored record (`scanNote`) so the finding is disclosed rather
 * than remembered, and `critical` — content aimed at the agent — is refused.
 * This is the same trade the document door makes (fileIngest.ts:336-338), and it
 * is a seatbelt, not a wall.
 *
 * Lower tiers still cannot escalate: an imported skill grants no tools, whatever
 * the scan says.
 */
function assessImport(raw: string): { text: string; scan: InjectionScan; strippedInvisible: number } {
  if (typeof raw !== "string" || raw.trim().length === 0) {
    throw new SkillImportRefusal("There is no skill text here to import — nothing was installed.");
  }
  if (raw.length > MAX_IMPORTED_RAW_CHARS) {
    throw new SkillImportRefusal(
      `This skill is ${raw.length.toLocaleString()} characters, above the ${MAX_IMPORTED_RAW_CHARS.toLocaleString()} one import holds. ` +
        "A playbook is a procedure and a checklist; split the long one into skills rather than importing a wall.",
    );
  }

  const strip = stripInvisible(raw);
  const removed = strip.zeroWidth + strip.tags + strip.bidi;
  const scan = scanForInjection(strip.text);
  if (scan.tier === "critical") {
    throw new SkillImportRefusal(
      `${scan.refusal ?? "This skill carries text shaped like instructions aimed at the agent rather than a playbook."} ` +
        `Nothing was installed. ${scanLine(scan, "skill")}. Open the file and read it yourself before bringing it in.`,
      scan,
    );
  }
  return { text: strip.text, scan, strippedInvisible: removed };
}

export interface SkillEligibility {
  eligible: boolean;
  reasons: string[];
}

/* ── the parser: a YAML-subset reader for the fields both ecosystems use ── */

export function parseSkillMd(raw: string, source: ImportedSkill["source"]): Omit<ImportedSkill, "importedAt" | "digest"> & { rawLength: number } {
  const text = raw.replace(/\r\n/g, "\n");
  const fmMatch = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(text);
  const fm = fmMatch ? fmMatch[1] : "";
  const body = (fmMatch ? fmMatch[2] : text).trim();

  let name = "";
  let description = "";
  let version: string | undefined;
  let category: string | undefined;
  const needsEnv: string[] = [];
  const needsBins: string[] = [];
  const needsTools: string[] = [];
  const allowedTools: string[] = [];

  if (fm) {
    const lines = fm.split("\n");
    // Section tracking for the nested subset we care about. Both dialects
    // (metadata.skill / metadata.hermes) carry the same requires shape,
    // so we accept either without caring which one wrote it.
    let inMeta = false;
    let inRequires = false;
    let reqList: "env" | "bins" | null = null;
    let inReqEnvVars = false;
    let inAllowedTools = false;
    for (const line of lines) {
      if (!line.trim() || line.trim().startsWith("#")) continue;
      const indent = line.length - line.trimStart().length;
      const t = line.trim();

      if (indent === 0) {
        inMeta = false; inRequires = false; reqList = null; inReqEnvVars = false; inAllowedTools = false;
        const m = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(t);
        if (!m) continue;
        const key = m[1];
        let val = m[2].trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
        if (key === "name") name = val;
        else if (key === "description") description = val;
        else if (key === "version") version = val;
        else if (key === "category") category = val;
        else if (key === "metadata") inMeta = true;
        else if (key === "required_environment_variables") inReqEnvVars = true;
        else if (key === "allowed-tools") inAllowedTools = true;
        continue;
      }

      if (inAllowedTools && t.startsWith("- ")) { allowedTools.push(t.slice(2).trim()); continue; }
      if (inReqEnvVars && /^-\s*name:\s*/.test(t)) { needsEnv.push(t.replace(/^-\s*name:\s*/, "").trim()); continue; }

      if (inMeta) {
        if (indent === 2) {
          const dm = /^(skill|hermes|clawdbot|clawdis):\s*$/.exec(t);
          if (dm) { inRequires = false; reqList = null; }
          else if (/^category:\s*/.test(t) && !category) category = t.replace(/^category:\s*/, "").trim();
          continue;
        }
        if (indent === 4 && /^requires:\s*$/.test(t)) { inRequires = true; reqList = null; continue; }
        if (indent === 4 && /^requires_tools:\s*\[/.test(t)) { needsTools.push(...parseInlineList(t)); continue; }
        if (indent === 4 && /^requires_toolsets:\s*\[/.test(t)) { /* advisory in VH */ continue; }
        if (inRequires && indent === 6) {
          if (/^env:\s*$/.test(t)) { reqList = "env"; continue; }
          if (/^bins:\s*$/.test(t)) { reqList = "bins"; continue; }
          if (/^env:\s*\[/.test(t)) { needsEnv.push(...parseInlineList(t)); reqList = null; continue; }
          if (/^bins:\s*\[/.test(t)) { needsBins.push(...parseInlineList(t)); reqList = null; continue; }
        }
        if (inRequires && indent === 8 && t.startsWith("- ") && reqList === "env") { needsEnv.push(t.slice(2).trim()); continue; }
        if (inRequires && indent === 8 && t.startsWith("- ") && reqList === "bins") { needsBins.push(t.slice(2).trim()); continue; }
        // hermes-style top-of-metadata tool requirements at indent 4
        if (indent === 4 && /^requires_tools:\s*$/ .test(t)) { needsTools.push("__list__"); continue; }
        if (indent === 6 && t.startsWith("- ") && needsTools.includes("__list__")) { needsTools[needsTools.length - 1] = t.slice(2).trim(); continue; }
      }
    }
    const ph = needsTools.indexOf("__list__");
    if (ph >= 0) needsTools.splice(ph, 1);
  }

  return {
    id: `imported.${(name || "unnamed-skill").toLowerCase().replace(/[^a-z0-9-]+/g, "-")}`,
    name: name || "unnamed-skill",
    description: description || "(no description in frontmatter)",
    body,
    source,
    version,
    category,
    needsEnv,
    needsBins,
    needsTools,
    allowedTools,
    rawLength: raw.length,
  };
}

function parseInlineList(t: string): string[] {
  const inner = t.slice(t.indexOf("[") + 1, t.lastIndexOf("]"));
  return inner.split(",").map((x) => x.trim().replace(/^["']|["']$/g, "")).filter(Boolean);
}

/* ── eligibility: gating metadata is respected, honestly ─────────────────── */

export function skillEligibility(s: Pick<ImportedSkill, "needsEnv" | "needsBins" | "needsTools">): SkillEligibility {
  const reasons: string[] = [];
  const isNode = typeof process !== "undefined" && Boolean(process?.versions?.node);
  for (const bin of s.needsBins) {
    if (isNode) {
      // PATH check is advisory here — the desktop host verifies at use time.
      reasons.push(`declares binary "${bin}" — verified at use time on this host`);
    } else {
      reasons.push(`needs binary "${bin}" which a browser surface cannot verify — not eligible here`);
      return { eligible: false, reasons };
    }
  }
  for (const env of s.needsEnv) {
    if (isNode && typeof process !== "undefined" && process.env?.[env]) {
      reasons.push(`env "${env}" present on this host`);
    } else if (isNode) {
      reasons.push(`needs env "${env}" which is not set on this host — not eligible here`);
      return { eligible: false, reasons };
    } else {
      reasons.push(`needs env "${env}" which a browser surface cannot read — not eligible here`);
      return { eligible: false, reasons };
    }
  }
  if (s.needsTools.length > 0) reasons.push(`declares tools [${s.needsTools.join(", ")}] — advisory; SelfImpulse tools stay governed by category bindings`);
  if (reasons.length === 0) reasons.push("no gating requirements — eligible on every surface");
  return { eligible: true, reasons };
}

/* ── the second door: binding time ───────────────────────────────────────── */

/**
 * THE IMPORT DOOR IS NECESSARY AND NOT SUFFICIENT.
 *
 * `importedSkills()` reads JSON out of `localStorage["engine.skills.imported.v1"]`.
 * In a browser that store is writable by any script on the page — one
 * `localStorage.setItem` plants a "skill" that never went near `importSkillMd`, and
 * a skill record written by an older build predates the scan entirely. So the
 * check is repeated where the text is actually USED, and this is the check that
 * closes the store-write path. Re-scanning costs one regex pass over a few
 * kilobytes at prompt-composition time; a prompt-injection payload in the system
 * prompt costs the machine.
 *
 * The import-time rules are applied verbatim here, not a looser version:
 * invisible characters in a STORED body mean the record disagrees with what a
 * reader sees, an oversized body means the bound is not being honoured, and a
 * `critical` scan means the text is aimed at the agent. All three refuse.
 */
export interface BindVerdict {
  bindable: boolean;
  /** Why, in words. An empty array means it binds and nothing was flagged. */
  reasons: string[];
}

export function bindVerdict(s: ImportedSkill, category: string): BindVerdict {
  const reasons: string[] = [];

  if (s.category === WILDCARD) {
    reasons.push(`declares category "${WILDCARD}" — imported skills never bind to every specialist`);
  } else if (typeof s.category !== "string" || s.category.length === 0) {
    reasons.push("declares no category — it binds to no specialist, not even by name");
  } else if (s.category !== category) {
    reasons.push(`declares category "${s.category}", not "${category}"`);
  }

  if (typeof s.body !== "string" || s.body.trim().length === 0) {
    reasons.push("has no playbook body");
    return { bindable: false, reasons };
  }
  if (s.body.length > MAX_IMPORTED_BODY_CHARS) {
    reasons.push(`body is ${s.body.length.toLocaleString()} characters, above the ${MAX_IMPORTED_BODY_CHARS.toLocaleString()} bound`);
  }

  // name and description both reach the prompt ("### Skill: <name>"), so both are
  // scanned. A stored body carrying invisible characters is refused rather than
  // silently stripped at read time: at this point stripping would make the record
  // and the prompt disagree, and the owner would never learn why.
  const strip = stripInvisible(`${s.name}\n${s.description}\n${s.body}`);
  if (strip.zeroWidth + strip.tags + strip.bidi > 0) {
    reasons.push(
      `carries ${strip.zeroWidth + strip.tags + strip.bidi} invisible character(s) — the stored text is not what it reads as`,
    );
  }
  const scan = scanForInjection(strip.text);
  if (scan.tier === "critical") {
    reasons.push(`scan is critical — ${scanLine(scan, `skill "${s.name}"`)}`);
  } else if (scan.findings.length > 0) {
    reasons.push(scanLine(scan, `skill "${s.name}"`));
  }

  return { bindable: reasons.length === 0, reasons };
}

/**
 * The same door, for untrusted text that reaches a prompt by some route other
 * than an import. Used by skills.ts for the operator-supplied connector base URL,
 * which is interpolated into a connector playbook body and therefore into the
 * system prompt. One policy, one place: if the connector route needs a stricter
 * rule than this, the rule is strengthened here rather than duplicated.
 */
export function assessUntrustedText(text: string, label: string): { ok: boolean; reason: string } {
  const strip = stripInvisible(text);
  const scan = scanForInjection(strip.text);
  if (scan.tier === "critical") {
    return { ok: false, reason: `${label} was refused: ${scanLine(scan, label)}. Nothing was bound.` };
  }
  return { ok: true, reason: scanLine(scan, label) };
}

/* ── storage (opt-in persistence; session fallback for SSR/probes) ───────── */

const KEY = "engine.skills.imported.v1";
const session: ImportedSkill[] = [];

function storage(): Storage | null {
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    return null;
  }
}

export function importedSkills(): ImportedSkill[] {
  const s = storage();
  if (!s) return session;
  try {
    return JSON.parse(s.getItem(KEY) ?? "[]") as ImportedSkill[];
  } catch {
    return session;
  }
}

async function sha256Hex(text: string): Promise<string> {
  const buf = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((x) => x.toString(16).padStart(2, "0")).join("");
}

/**
 * The import door. Throws `SkillImportRefusal` — stores nothing — on a critical
 * scan, on an oversized body, or on a wildcard category; returns the installed
 * skill otherwise. `applyRsiDraft` (rsi.ts) already treats a throw here as a
 * refusal and reports it, so a drafted skill that names the wildcard fails
 * loudly at the moment a human applies it rather than quietly binding everywhere
 * later.
 *
 * The digest is taken over the RAW text on purpose: provenance records what the
 * owner handed over, and the stored body is the readable form of it. When the two
 * differ, `strippedInvisible` says so.
 */
export async function importSkillMd(raw: string, source: ImportedSkill["source"]): Promise<ImportedSkill> {
  const { text, scan, strippedInvisible } = assessImport(raw);
  const parsed = parseSkillMd(text, source);
  assertBindable(parsed);
  if (parsed.body.length > MAX_IMPORTED_BODY_CHARS) {
    throw new SkillImportRefusal(
      `This skill's playbook body is ${parsed.body.length.toLocaleString()} characters, above the ${MAX_IMPORTED_BODY_CHARS.toLocaleString()} one import holds. ` +
        "Nothing was truncated and nothing was installed — shorten the procedure, or split it into two skills.",
    );
  }
  const skill: ImportedSkill = {
    id: parsed.id,
    name: parsed.name,
    description: parsed.description,
    body: parsed.body,
    source: parsed.source,
    version: parsed.version,
    category: parsed.category,
    needsEnv: parsed.needsEnv,
    needsBins: parsed.needsBins,
    needsTools: parsed.needsTools,
    allowedTools: parsed.allowedTools,
    importedAt: new Date().toISOString(),
    digest: await sha256Hex(raw),
  };
  if (strippedInvisible > 0) {
    skill.strippedInvisible = strippedInvisible;
  }
  skill.scanNote = scanLine(scan, `imported skill "${skill.name}"`);
  const all = importedSkills().filter((x) => x.name !== skill.name);
  all.push(skill);
  const s = storage();
  if (s) {
    try {
      s.setItem(KEY, JSON.stringify(all));
    } catch {
      session.length = 0;
      session.push(...all);
    }
  } else {
    session.length = 0;
    session.push(...all);
  }
  return skill;
}

export function removeImportedSkill(name: string): ImportedSkill[] {
  const all = importedSkills().filter((x) => x.name !== name);
  const s = storage();
  if (s) {
    try {
      s.setItem(KEY, JSON.stringify(all));
    } catch {
      /* session-only surface */
    }
  }
  session.length = 0;
  session.push(...all);
  return all;
}

/* ── bundled samples: faithful to each ecosystem's documented format ──────
 * Sample A mirrors the classic skill-format docs example (a task-list skill, with
 * requires.env/bins + primaryEnv). Sample B mirrors the Hermes agent
 * research/arxiv bundled skill shape (metadata.hermes tags + requires_tools).
 * They are labeled as samples; provenance records where the format came from. */

export const SAMPLE_SKILL_FORMAT = `---
name: todoist-tasks
description: Manage tasks via the Todoist API.
metadata:
  skill:
    requires:
      env:
        - TODOIST_API_KEY
      bins:
        - curl
    primaryEnv: TODOIST_API_KEY
---

# Todoist Tasks

## When to Use
When the user asks to add, list, complete or reschedule Todoist tasks.

## Procedure
1. Read TODOIST_API_KEY from the environment; never echo it into output.
2. List active tasks with GET https://api.todoist.com/api/v1/tasks before adding duplicates.
3. Create tasks with POST; report the returned id as the receipt of the write.
4. Complete tasks via POST .../close and confirm the task disappeared on re-list.

## Pitfalls
- Todoist dates are per-user timezones; ask before assuming UTC.
- 401 means the key is missing or revoked — say so, do not retry blindly.

## Verification
Re-list tasks after every mutation; the mutation is real only when the list changed.
`;

export const SAMPLE_HERMES_SKILL = `---
name: arxiv
description: Search arXiv papers by keyword, author, category, or ID.
version: 1.0.0
category: research
metadata:
  hermes:
    tags: [Research, Papers, arXiv]
    requires_tools: [web_search]
---

# arXiv Search

## When to Use
When the user wants papers, preprints, authors or categories from arXiv.

## Quick Reference
- API: http://export.arxiv.org/api/query?search_query=...&max_results=N
- Fields: ti:title, au:author, cat:category; combine with AND/OR.

## Procedure
1. Translate the request into an arXiv query string with explicit fields.
2. Fetch and rank by published date; report title, authors, id and date.
3. Cite the arXiv id (e.g. 2401.12345) — never a paraphrased URL.

## Pitfalls
- arXiv results are preprints; label them as not peer-reviewed.
- The API rate-limits aggressively; one query per question.

## Verification
Every cited paper must carry its arXiv id and published date.
`;
