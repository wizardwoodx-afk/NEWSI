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
 */
import type { VhSkill } from "./skills";

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

export async function importSkillMd(raw: string, source: ImportedSkill["source"]): Promise<ImportedSkill> {
  const parsed = parseSkillMd(raw, source);
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
