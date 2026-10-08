import React, { useCallback, useEffect, useRef, useState } from "react";
import { THINKING, useRunWord, useThinkingLevel, type ThinkingLevel } from "../voice";
import { useVh } from "../store";
import { AUTONOMY_LEVEL_NAMES, type AutonomyLevel } from "../../engine/initiative";

/* File System Access entries. Chrome/Edge expose these on a dropped item; other
   browsers do not, and `files` remains the fallback. Declared structurally
   rather than pulled from a libdef because the surface is three methods. */
interface FsEntry {
  isFile: boolean;
  isDirectory: boolean;
  name: string;
  fullPath: string;
  file(cb: (f: File) => void, err: (e: unknown) => void): void;
  createReader(): { readEntries(cb: (e: FsEntry[]) => void, err: (e: unknown) => void): void };
}
interface DataTransferItemLike { webkitGetAsEntry?: () => FsEntry | null; kind?: string }

/** React's InputHTMLAttributes does not (yet) ship the non-standard
 *  `webkitdirectory` attribute; extend locally so the folder-picker input
 *  compiles under strict tsc. The attribute is only read by Chromium/WebKit at
 *  runtime to enable folder selection — it is never read by our code. */
interface DirInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  webkitdirectory?: string;
}

/** Depth-capped directory walk. A dropped folder can contain a node_modules, a
 *  .git, or a whole drive; without a cap and a file ceiling this is a way to
 *  hang the tab on a stray drop. */
const MAX_DEPTH = 8;
const MAX_FILES = 500;

interface WalkState { files: File[]; capped: boolean }

async function readEntry(entry: FsEntry, depth: number, w: WalkState): Promise<void> {
  if (w.files.length >= MAX_FILES) { w.capped = true; return; }
  if (entry.isFile) {
    entry.file((f) => { if (w.files.length < MAX_FILES) w.files.push(f); else w.capped = true; }, () => { /* a single unreadable file is not a failure */ });
    return;
  }
  if (entry.isDirectory && depth >= MAX_DEPTH) { w.capped = true; return; }
  const reader = entry.createReader();
  // readEntries returns at most 100 per call, so it must be drained.
  for (;;) {
    const batch = await new Promise<FsEntry[]>((res) => reader.readEntries(res, () => res([])));
    if (batch.length === 0) break;
    for (const child of batch) await readEntry(child, depth + 1, w);
    if (w.files.length >= MAX_FILES) { w.capped = true; break; }
  }
}

async function filesFromDrop(dt: DataTransfer): Promise<WalkState> {
  const items = Array.from(dt.items ?? []).filter((i) => i.kind === "file") as DataTransferItemLike[];
  const entries = items.map((i) => (typeof i.webkitGetAsEntry === "function" ? i.webkitGetAsEntry() : null));
  if (entries.some(Boolean)) {
    const w: WalkState = { files: [], capped: false };
    for (const e of entries) { if (e) await readEntry(e, 0, w); }
    if (w.files.length) return w;
  }
  return { files: Array.from(dt.files ?? []), capped: false };
}

/** The share row is GONE, and this comment is the record of why.
 *
 * It used to render five chips — PDF · DOCX · XLSX · PPTX · ZIP — beside the
 * paperclip, each with a glyph and a tooltip. The reasoning at the time was
 * that the door should "say what it accepts without a paragraph". Measured
 * against the actual UI, that was wrong on three counts:
 *
 *   1. THEY WERE NOT CONTROLS. They were `<span>`s. They looked like buttons,
 *      they sat in a button row, and clicking one did nothing at all. A chip
 *      that reads as clickable and is not is worse than no chip.
 *   2. THEY STATED A LIMIT THAT WAS NEVER THERE. The hidden file input has no
 *      `accept` attribute, so the engine's own reader decides — it handles far
 *      more than these five. Five chips told the user "these five only", which
 *      is a false promise about the product's capability.
 *   3. THEY CROWDED THE ONE CONTROL THAT MATTERED. The bar held SEVEN
 *      affordances (five chips, a paperclip, a folder) for one action. The
 *      paperclip is the action; the rest was decoration competing with it.
 *
 * The information is not lost, it is MOVED: the paperclip's `title` now carries
 * the formats, so the capability is discoverable on hover without spending
 * permanent horizontal space on it. This is the ordinary pattern — one
 * attachment button, its accepted types in its tooltip. */

/** One menu open at a time, so Escape has something unambiguous to close and a
 *  second menu cannot be hiding behind the first. */
type MenuId = "attach" | "plus" | "think" | "approve";

/** What each autonomy level lets past the operator, in the operator's words. The
 *  consequence line underneath is the engine's own (`AUTONOMY_LEVEL_NAMES`), so
 *  the dial and the engine cannot drift into describing two different things. */
const APPROVAL_WORD: Record<AutonomyLevel, string> = {
  0: "Nothing",
  1: "Scheduled",
  2: "Follow-ups",
  3: "Adapts",
};

/**
 * A popover the keyboard owns. Opening moves focus to the first row, arrows
 * walk the rows and wrap, Home/End jump, Escape closes, and focus leaving the
 * control's own region closes it. Outside presses are caught on the wrapper
 * rather than the menu, so pressing the trigger while open closes the menu
 * instead of closing and immediately reopening it.
 */
function Menu({ label, align, onClose, children }: {
  label: string; align?: "right"; onClose: () => void; children: React.ReactNode;
}): React.ReactElement {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const owner = el.parentElement ?? el;
    const rows = (): HTMLElement[] => [...el.querySelectorAll<HTMLElement>("[role='menuitem']")];
    rows()[0]?.focus();
    const moveTo = (index: number, dir: 1 | -1): void => {
      const list = rows();
      if (!list.length) return;
      list[(index + dir + list.length) % list.length]?.focus();
    };
    const onKey = (e: KeyboardEvent): void => {
      const at = rows().indexOf(document.activeElement as HTMLElement);
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onClose(); }
      else if (e.key === "ArrowDown") { e.preventDefault(); moveTo(at, 1); }
      else if (e.key === "ArrowUp") { e.preventDefault(); moveTo(at, -1); }
      else if (e.key === "Home") { e.preventDefault(); rows()[0]?.focus(); }
      else if (e.key === "End") { e.preventDefault(); const l = rows(); l[l.length - 1]?.focus(); }
    };
    const onPointer = (e: PointerEvent): void => { if (!owner.contains(e.target as Node)) onClose(); };
    el.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer, true);
    return () => {
      el.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer, true);
    };
  }, [onClose]);
  return (
    <div
      ref={ref}
      className={`si-cmenu${align === "right" ? " right" : ""}`}
      role="menu"
      aria-label={label}
      onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) onClose(); }}
    >
      {children}
    </div>
  );
}

/** One row: the word, what choosing it costs, and where it leads. */
function Row({ children, note, onPick, current, title }: {
  children: React.ReactNode; note?: string; title?: string; current?: boolean; onPick: () => void;
}): React.ReactElement {
  return (
    <button
      type="button"
      role="menuitem"
      className="si-citem"
      aria-current={current ? "true" : undefined}
      title={title}
      onClick={onPick}
    >
      <b>{children}</b>
      {note ? <span>{note}</span> : null}
    </button>
  );
}

export function Composer({ value, onChange, onSend, busy, placeholder, small, onFiles }: {
  value: string; onChange: (v: string) => void; onSend: () => void; busy: boolean;
  placeholder: string; small?: boolean;
  /** Present when the host can ingest documents. Omit and no attach control renders. */
  onFiles?: (files: Array<{ name: string; bytes: Uint8Array }>) => Promise<{ proposed: unknown[]; refused: unknown[]; structuralRefused: unknown[]; notice?: string | null }> | void;
}): React.ReactElement {
  /* Two hidden inputs, two intents, ONE visible control (see the note at the
     paperclip below). `fileRef` is the ordinary file picker; `dirRef` carries
     `webkitdirectory` and is reached by right-clicking that same button. This
     used to be ONE ref plus a `querySelector('input[webkitdirectory]')` from
     the separate folder button, which coupled the control to DOM shape — refs
     state the intent directly. */
  const fileRef = useRef<HTMLInputElement>(null);
  const dirRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<Record<MenuId, HTMLButtonElement | null>>({ attach: null, plus: null, think: null, approve: null });
  const [picked, setPicked] = useState<string | null>(null);
  const [menu, setMenu] = useState<MenuId | null>(null);
  const closeMenu = useCallback((): void => {
    const open = menu;
    setMenu(null);
    /* A menu that closes on Escape has to put the operator back where they came
       from, or the keyboard user loses their place in the bar. */
    if (open) triggerRef.current[open]?.focus();
  }, [menu]);
  const toggleMenu = useCallback((id: MenuId): void => {
    setMenu((cur) => (cur === id ? null : id));
  }, []);
  /* Nested-element drag counter. dragEnter/dragLeave fire for every child so a
     boolean `over` would flicker; the reducer keeps a depth count and over is
     derived from it. */
  const [dragDepth, bumpDrag] = React.useReducer((n: number, delta: 1 | -1) => Math.max(0, n + delta), 0);
  const over = dragDepth > 0;
  /* The word a run in flight speaks, seeded by the text that started it — the same
     request always opens on the same word rather than shuffling. src/ui/voice.ts
     holds the list, the cadence and the reduced-motion rule; the row that renders
     it sits directly above the textarea. */
  const word = useRunWord(value, busy);
  /* The composer is where the work starts, so it is also where the doors that
     feed it have to be reachable. Every entry below goes through the store —
     the same path every screen takes — and none of them claims a surface this
     app does not have. */
  const { go, newMission, initiative, setAutonomy, knowledge, federation } = useVh();
  const [thinking, setThinking] = useThinkingLevel();
  const waitingSkills = knowledge.filter((k) => k.status === "proposed").length;

  const chooseThinking = (level: ThinkingLevel): void => {
    /* The rung is remembered, not written. It used to rewrite the draft here,
       which put the engine's instruction into the operator's own editable text —
       visible, deletable, and duplicated on every keystroke by the guard in the
       change handler. A planning directive is not something you type, so it has
       no business being in the box you type in. store.send applies it at the one
       choke point every door and the impulse already pass through. */
    setThinking(level.id);
    closeMenu();
  };

  async function ingest(list: File[], capped = false): Promise<void> {
    if (!onFiles || !list.length) return;
    setPicked(`${list.length} file${list.length === 1 ? "" : "s"} reading…`);
    try {
      const payload = await Promise.all(list.map(async (f) => ({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) })));
      const r = (await onFiles(payload)) as
        | { proposed: unknown[]; refused: unknown[]; structuralRefused: unknown[]; notice?: string | null }
        | void;
      /* Every file is accounted for in the sentence: what was proposed (and
         WHERE to review it), what was declined, and nothing implied as a clean
         read when part of the drop was refused. */
      const parts: string[] = [];
      if (r) {
        const proposed = r.proposed.length;
        const refused = r.refused.length + r.structuralRefused.length;
        if (proposed > 0) parts.push(`${proposed} proposed — review in Docs`);
        if (refused > 0) parts.push(`${refused} refused`);
        if (parts.length === 0) parts.push(`${list.length} read`);
        if (r.notice) parts.push(r.notice);
      } else {
        parts.push(`${list.length} read`);
      }
      if (capped) parts.push(`only the first ${MAX_FILES} files in that folder were read`);
      setPicked(parts.join(" · "));
      setTimeout(() => setPicked(null), r?.notice ? 12000 : 6000);
    } catch (e) {
      setPicked(`could not read: ${String(e).slice(0, 80)}`);
      setTimeout(() => setPicked(null), 5000);
    }
  }

  function onDrop(e: React.DragEvent): void {
    e.preventDefault();
    if (!onFiles) return;
    bumpDrag(-1); // reset counter on drop
    if (busy) return;
    void filesFromDrop(e.dataTransfer).then((w) => ingest(w.files, w.capped));
  }

  return (
    <div
      className={`composer${over ? " over" : ""}`}
      onDragOver={(e) => { if (!onFiles) return; e.preventDefault(); e.dataTransfer.dropEffect = "copy"; }}
      onDragEnter={(e) => { if (!onFiles) return; e.preventDefault(); bumpDrag(1); }}
      onDragLeave={() => { if (!onFiles) return; bumpDrag(-1); }}
      onDrop={onDrop}
    >
      {/* "Think ahead" is the composer's own label, and the app's posture in two
          words: this box does not answer, it plans, and the plan is what you are
          asked to approve. It is a LABEL, not a second placeholder — the field
          keeps its own accessible name below ("Describe what you need"), so the
          caption says what the surface is for while the name says what to put in
          it. One line, inside the box, so the sheet does not grow when a run starts
          and the word arrives beside the label rather than under it. */}
      <div className="cue" style={{ display: "flex", alignItems: "baseline", gap: "var(--s-3)", padding: "var(--s-2) var(--s-4) 0" }}>
        <span className="lbl">Think ahead</span>
        {busy && word && (
          <>
            <span className="faint mono" aria-hidden="true">{word}</span>
            {/* One sentence, said once when the run starts. The readout above is
                the visual half; a live region that repeats itself every few
                seconds is a flicker in the other sense, so the spoken line holds
                still while the word turns. */}
            <span className="sr" role="status" aria-live="polite">Working on this request</span>
          </>
        )}
      </div>
      <textarea
        value={value} placeholder={placeholder} rows={small ? 2 : 3}
        /* N3 names what the field takes. It stayed in ARIA when "Think ahead"
           joined the line above, and the two are different facts on purpose: the
           caption names the SURFACE (this box plans before it acts), the accessible
           name says what to put IN it. Making one string do both is how a label
           ends up repeating the placeholder. The send shortcut is DECLARED rather
           than left as folklore: Enter sends, Shift+Enter breaks the line, and
           that is invisible to anyone who is not already pressing keys.
           Deliberately NO aria-describedby here — the attach/send status line
           below already carries role="status", and pointing the field at it would
           make the same sentence be spoken twice. */
        aria-label="Describe what you need"
        aria-keyshortcuts="Enter"
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); if (value.trim() && !busy) onSend(); } }}
      />
      <div className="bar">
        {onFiles && (
          <>
            {/* ONE attachment control.
                *
                * It was a paperclip PLUS a separate folder button, and the point
                * of the change is that "attach" is a single intent — asking the
                * user to pick a mechanism before they have picked a file is the
                * kind of question a UI should not ask.
                *
                * Rather than delete folder support, the paperclip now opens the
                * FILE picker on a plain click and the FOLDER picker on a
                * right-click, with the menu key as the keyboard equivalent. Both
                * routes are declared on the button (`aria-keyshortcuts`), so the
                * shortcut is announced rather than being a hidden gesture, and
                * the tooltip names both.
                *
                * Nothing is guessed away: the two `<input>`s below are the SAME
                * pair that existed before, reached by a different route. */}
            <div className="si-cwrap">
              <button
                ref={(el) => { triggerRef.current.attach = el; }}
                className="attach"
                type="button"
                aria-label="Attach files or folders"
                aria-keyshortcuts="ContextMenu"
                aria-haspopup="menu"
                aria-expanded={menu === "attach"}
                title="Attach files or folders (PDF, DOCX, XLSX, PPTX, ZIP, images)"
                onClick={() => toggleMenu("attach")}
                onContextMenu={(e) => { e.preventDefault(); dirRef.current?.click(); }}
              >
                <i className="ic ic-clip" />
              </button>
              {menu === "attach" && (
                <Menu label="Attach" onClose={closeMenu}>
                  <Row note="PDF, DOCX, XLSX, PPTX, ZIP, images" onPick={() => { closeMenu(); fileRef.current?.click(); }}>Files</Row>
                  <Row note="every readable file inside, capped" onPick={() => { closeMenu(); dirRef.current?.click(); }}>Folder</Row>
                </Menu>
              )}
            </div>
            <input
              ref={fileRef} className="sr" type="file" multiple hidden={false} aria-label="Choose files to attach"
              onChange={(e) => { const f = Array.from(e.target.files ?? []); e.target.value = ""; void ingest(f); }}
            />
            <input
              ref={dirRef} className="sr" type="file" multiple aria-label="Choose a folder to attach" {...({ webkitdirectory: "" } as DirInputProps)}
              onChange={(e) => { const f = Array.from(e.target.files ?? []); e.target.value = ""; void ingest(f); }}
            />
          </>
        )}

        {/* The plus door. It adds nothing to the text — what it opens is the
            honest word for it: each row is a surface this app already has and
            already governs, reachable from the place the work is typed.
            Reference names are not borrowed: there is no plugin registry here
            (one entry covers the MCP connectors), and there is no goal object
            the operator can attach to a request, so the mission row does the
            one thing the mission plane actually offers. */}
        <div className="si-cwrap">
          <button
            ref={(el) => { triggerRef.current.plus = el; }}
            className="attach"
            type="button"
            aria-label="Open a surface that feeds this request"
            aria-haspopup="menu"
            aria-expanded={menu === "plus"}
            title="Missions, the plan, skills, connectors, the A2A door"
            onClick={() => toggleMenu("plus")}
          >
            <i className="ic ic-plus" />
          </button>
          {menu === "plus" && (
            <Menu label="Surfaces that feed this request" onClose={closeMenu}>
              <Row note="a fresh thread; the ledger keeps its record" onPick={() => { closeMenu(); newMission(); }}>New mission</Row>
              <Row note="the run laid out, desk by desk" onPick={() => { closeMenu(); go("work"); }}>Plan</Row>
              <Row note={waitingSkills ? `${waitingSkills} awaiting you` : "proposals become skills by your decision"} onPick={() => { closeMenu(); go("docs"); }}>Skill</Row>
              <Row note="tools this machine has agreed to" onPick={() => { closeMenu(); go("settings"); }}>Connector</Row>
              <Row note={federation ? "the A2A host is mounted" : "peers reach you only after pairing"} onPick={() => { closeMenu(); go("federation"); }}>Federation</Row>
            </Menu>
          )}
        </div>

        <span className="pick" role="status" aria-live="polite">{picked ?? ""}</span>

        <div className="si-cwrap">
          <button
            ref={(el) => { triggerRef.current.think = el; }}
            className="si-chipbtn"
            type="button"
            aria-label={`How far ahead the Captain plans: ${thinking.word}`}
            aria-haspopup="menu"
            aria-expanded={menu === "think"}
            title="How far ahead the Captain plans before it answers. This writes the planning line into what you send — the engine has no depth setting to bind to."
            onClick={() => toggleMenu("think")}
          >
            <i className="si-chip-ic si-g-steps" aria-hidden />
            <span>{thinking.word}</span>
          </button>
          {menu === "think" && (
            <Menu label="How far ahead the Captain plans" align="right" onClose={closeMenu}>
              {THINKING.map((t) => (
                <Row
                  key={t.id}
                  current={t.id === thinking.id}
                  note={t.instruction || "no planning line is added"}
                  onPick={() => chooseThinking(t)}
                >
                  {t.word}
                </Row>
              ))}
            </Menu>
          )}
        </div>

        <div className="si-cwrap">
          <button
            ref={(el) => { triggerRef.current.approve = el; }}
            className="si-chipbtn"
            type="button"
            aria-label={`What may run without asking: ${APPROVAL_WORD[initiative.level]}`}
            aria-haspopup="menu"
            aria-expanded={menu === "approve"}
            title="When work may start on its own. The human gate is not on this dial — it asks whoever this is set to."
            onClick={() => toggleMenu("approve")}
          >
            <i className="si-chip-ic si-g-key" aria-hidden />
            <span>{APPROVAL_WORD[initiative.level]}</span>
          </button>
          {menu === "approve" && (
            <Menu label="What may run without asking" align="right" onClose={closeMenu}>
              {([0, 1, 2, 3] as AutonomyLevel[]).map((l) => (
                <Row
                  key={l}
                  current={l === initiative.level}
                  note={AUTONOMY_LEVEL_NAMES[l].split(" — ")[1] ?? ""}
                  title={AUTONOMY_LEVEL_NAMES[l]}
                  onPick={() => { setAutonomy(l); closeMenu(); }}
                >
                  {APPROVAL_WORD[l]}
                </Row>
              ))}
              <p className="si-cfoot">The gate stays wherever this dial sits.</p>
            </Menu>
          )}
        </div>

        <button className="send" type="button" aria-label="Send" disabled={busy || !value.trim()} onClick={onSend}><i className="ic ic-arrow" /></button>
      </div>
      {/* drag depth counter kept out of the DOM tree — `over` (above) derives
          the visible overlay state; the counter only prevents flicker on
          dragLeave over child elements. */}
      <span hidden data-drag={dragDepth} />
    </div>
  );
}
