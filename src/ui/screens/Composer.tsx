import React, { useRef, useState } from "react";

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

async function readEntry(entry: FsEntry, depth: number, out: File[]): Promise<void> {
  if (out.length >= MAX_FILES) return;
  if (entry.isFile) {
    entry.file((f) => { if (out.length < MAX_FILES) out.push(f); }, () => { /* a single unreadable file is not a failure */ });
    return;
  }
  if (!entry.isDirectory || depth >= MAX_DEPTH) return;
  const reader = entry.createReader();
  // readEntries returns at most 100 per call, so it must be drained.
  for (;;) {
    const batch = await new Promise<FsEntry[]>((res) => reader.readEntries(res, () => res([])));
    if (batch.length === 0) break;
    for (const child of batch) await readEntry(child, depth + 1, out);
    if (out.length >= MAX_FILES) break;
  }
}

async function filesFromDrop(dt: DataTransfer): Promise<File[]> {
  const items = Array.from(dt.items ?? []).filter((i) => i.kind === "file") as DataTransferItemLike[];
  const entries = items.map((i) => (typeof i.webkitGetAsEntry === "function" ? i.webkitGetAsEntry() : null));
  if (entries.some(Boolean)) {
    const out: File[] = [];
    for (const e of entries) { if (e) await readEntry(e, 0, out); }
    if (out.length) return out;
  }
  return Array.from(dt.files ?? []);
}

/** The share row: the five formats people actually hand over, each with its own
 *  minimal glyph so the door says what it accepts without a paragraph. The
 *  titles carry the full disposition (read / listed) from the product's own
 *  wording — an icon that promises "opens everything" would be a lie the
 *  refusals later contradict. Rendering is gated on `onFiles` like the attach
 *  control itself: no host, no claim. */
const SHARE_TYPES: Array<{ cls: string; tag: string; title: string }> = [
  { cls: "ic-f-pdf", tag: "PDF", title: "PDF — read for you, structure only" },
  { cls: "ic-f-doc", tag: "DOCX", title: "Word documents — read for you" },
  { cls: "ic-f-sheet", tag: "XLSX", title: "Spreadsheets — tables are read" },
  { cls: "ic-f-slides", tag: "PPTX", title: "Slides — every slide is read" },
  { cls: "ic-f-zip", tag: "ZIP", title: "Archives — listed and read, never unpacked loose" },
];

export function Composer({ value, onChange, onSend, busy, placeholder, small, onFiles }: {
  value: string; onChange: (v: string) => void; onSend: () => void; busy: boolean;
  placeholder: string; small?: boolean;
  /** Present when the host can ingest documents. Omit and no attach control renders. */
  onFiles?: (files: Array<{ name: string; bytes: Uint8Array }>) => Promise<{ proposed: unknown[]; refused: unknown[]; structuralRefused: unknown[] }> | void;
}): React.ReactElement {
  const input = useRef<HTMLInputElement>(null);
  const [picked, setPicked] = useState<string | null>(null);
  /* Nested-element drag counter. dragEnter/dragLeave fire for every child so a
     boolean `over` would flicker; the reducer keeps a depth count and over is
     derived from it. */
  const [dragDepth, bumpDrag] = React.useReducer((n: number, delta: 1 | -1) => Math.max(0, n + delta), 0);
  const over = dragDepth > 0;

  async function ingest(list: File[]): Promise<void> {
    if (!onFiles || !list.length) return;
    setPicked(`${list.length} file${list.length === 1 ? "" : "s"} reading…`);
    try {
      const payload = await Promise.all(list.map(async (f) => ({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) })));
      const r = (await onFiles(payload)) as
        | { proposed: unknown[]; refused: unknown[]; structuralRefused: unknown[] }
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
      } else {
        parts.push(`${list.length} read`);
      }
      setPicked(parts.join(" · "));
      setTimeout(() => setPicked(null), 6000);
    } catch (e) {
      setPicked(`could not read: ${String(e).slice(0, 80)}`);
      setTimeout(() => setPicked(null), 5000);
    }
  }

  function onDrop(e: React.DragEvent): void {
    e.preventDefault();
    bumpDrag(-1); // reset counter on drop
    if (busy) return;
    void filesFromDrop(e.dataTransfer).then(ingest);
  }

  return (
    <div
      className={`composer${over ? " over" : ""}`}
      onDragOver={(e) => { e.preventDefault(); if (onFiles) { e.dataTransfer.dropEffect = "copy"; } }}
      onDragEnter={(e) => { e.preventDefault(); if (onFiles) bumpDrag(1); }}
      onDragLeave={() => bumpDrag(-1)}
      onDrop={onDrop}
    >
      <textarea
        value={value} placeholder={placeholder} rows={small ? 2 : 3}
        aria-label="Describe what you need"
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); if (value.trim() && !busy) onSend(); } }}
      />
      <div className="bar">
        {onFiles && (
          <>
            {/* The share row — the formats this door accepts, in glyphs. Quiet
                by construction: a hint of what lands here, not a toolbar. */}
            <span className="ftypes" aria-label="Accepts PDF, DOCX, XLSX, PPTX and ZIP files">
              {SHARE_TYPES.map((t) => (
                <span key={t.cls} className="ftype" title={t.title}>
                  <i className={`ic ${t.cls}`} aria-hidden />
                  <span aria-hidden>{t.tag}</span>
                </span>
              ))}
            </span>
            <button
              className="attach"
              type="button"
              aria-label="Attach files or a folder"
              title="Attach files or a folder — dropped folders are read up to 8 levels deep"
              onClick={() => input.current?.click()}
            >
              <i className="ic ic-clip" />
            </button>
            {/* webkitdirectory lets a folder be picked directly, not only dropped */}
            <input
              ref={input} className="sr" type="file" multiple hidden={false}
              onChange={(e) => { const f = Array.from(e.target.files ?? []); e.target.value = ""; void ingest(f); }}
            />
            <input
              className="sr" type="file" multiple {...({ webkitdirectory: "" } as DirInputProps)}
              onChange={(e) => { const f = Array.from(e.target.files ?? []); e.target.value = ""; void ingest(f); }}
            />
            <button className="attach folder" type="button" aria-label="Attach a folder" title="Attach a folder" onClick={() => {
              const d = input.current?.parentElement?.querySelector<HTMLInputElement>('input[webkitdirectory]');
              d?.click();
            }}><i className="ic ic-folder" /></button>
          </>
        )}
        <span className="pick" role="status" aria-live="polite">{picked ?? ""}</span>
        <button className="send" type="button" aria-label="Send" disabled={busy || !value.trim()} onClick={onSend}><i className="ic ic-arrow" /></button>
      </div>
      {/* drag depth counter kept out of the DOM tree — `over` (above) derives
          the visible overlay state; the counter only prevents flicker on
          dragLeave over child elements. */}
      <span hidden data-drag={dragDepth} />
    </div>
  );
}
