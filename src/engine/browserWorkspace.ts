/**
 * SelfImpulse — the browser workspace (19.4.0).
 *
 * The reviewer's exact gap: the execution machinery existed, but the default
 * UI path fell back to toolless members because a browser has no node:fs.
 * This module is the seam that closes it. Two honest storage backings behind
 * one VhFs adapter:
 *
 *   • "browser-memory" — a seeded virtual workspace, always available, no
 *     permission asked. Specialists read and write REAL files against it;
 *     the receipts say exactly what happened;
 *   • "browser-fs-access" — the File System Access API, only when the user
 *     picks a directory. Real disk, real receipts, still root-escape-proof
 *     because the resolver runs before the adapter ever sees a path.
 *
 * The desktop (Tauri) surface keeps node:fs by leaving fsImpl absent — one
 * tool boundary, three honest backings, identical gate and receipts.
 */
import type { VhFs } from "./types";

export interface BrowserWorkspace {
  root: string;
  kind: "browser-memory" | "browser-fs-access";
  label: string;
  fs: VhFs;
}

const norm = (p: string): string => p.replace(/\/+$/, "") || "/";

/* ── memory backing ──────────────────────────────────────────────────────── */

export function createMemoryWorkspace(): BrowserWorkspace {
  const root = "/si-mission";
  const files = new Map<string, string>([
    ["/si-mission/MISSION.md", "# Mission\n\nKeep the receipt chain honest: every claim on screen must trace to an executed step.\n"],
    ["/si-mission/notes/standup.md", "# Standup\n\n- wired the execution layer into the door\n- receipts render per tool\n- gate pauses risky work\n"],
    ["/si-mission/notes/open-questions.md", "# Open questions\n\n- which connectors earn a seat at the bench?\n- what does the reviewer want to see first?\n"],
  ]);
  const dirs = new Set<string>(["/si-mission", "/si-mission/notes"]);

  const fs: VhFs = {
    kind: "browser-memory",
    async readdir(p) {
      const np = norm(p);
      if (!dirs.has(np)) throw new Error(`no such directory: ${p}`);
      const out: Array<{ name: string; isDirectory: boolean }> = [];
      const seen = new Set<string>();
      for (const f of files.keys()) {
        if (f.startsWith(np + "/")) {
          const rest = f.slice(np.length + 1);
          const head = rest.split("/")[0];
          if (!seen.has(head)) { seen.add(head); out.push({ name: head, isDirectory: false }); }
        }
      }
      for (const d of dirs) {
        if (d.startsWith(np + "/")) {
          const rest = d.slice(np.length + 1);
          const head = rest.split("/")[0];
          if (!seen.has(head)) { seen.add(head); out.push({ name: head, isDirectory: true }); }
        }
      }
      return out.sort((a, b) => a.name.localeCompare(b.name));
    },
    async stat(p) {
      const np = norm(p);
      if (files.has(np)) return { isFile: true, size: new TextEncoder().encode(files.get(np)!).length };
      if (dirs.has(np)) return { isFile: false, size: 0 };
      throw new Error(`no such path: ${p}`);
    },
    async readText(p, maxBytes) {
      const np = norm(p);
      const content = files.get(np);
      if (content === undefined) throw new Error(`no such file: ${p}`);
      const enc = new TextEncoder().encode(content);
      const truncated = enc.length > maxBytes;
      return { text: truncated ? new TextDecoder().decode(enc.slice(0, maxBytes)) : content, truncated };
    },
    async mkdir(p) {
      let cur = "";
      for (const part of norm(p).split("/").filter(Boolean)) {
        cur = `${cur}/${part}`;
        dirs.add(cur);
      }
    },
    async writeText(p, content) {
      const np = norm(p);
      const parent = np.slice(0, np.lastIndexOf("/")) || "/";
      let cur = "";
      for (const part of parent.split("/").filter(Boolean)) {
        cur = `${cur}/${part}`;
        dirs.add(cur);
      }
      files.set(np, content);
    },
  };
  return { root, kind: "browser-memory", label: "Browser sandbox workspace (in-memory, seeded)", fs };
}

/* ── File System Access backing (user-picked directory only) ─────────────── */

interface FsAccessDirectoryHandle {
  values(): AsyncIterable<unknown>;
  getDirectoryHandle(name: string, opts?: { create?: boolean }): Promise<FsAccessDirectoryHandle>;
  getFileHandle(name: string, opts?: { create?: boolean }): Promise<{
    getFile(): Promise<{ text(): Promise<string>; size: number }>;
    createWritable(): Promise<{ write(d: string): Promise<void>; close(): Promise<void> }>;
  }>;
}

export function fsAccessSupported(): boolean {
  try {
    return typeof (globalThis as { showDirectoryPicker?: unknown }).showDirectoryPicker === "function";
  } catch {
    return false;
  }
}

export async function openDirectoryWorkspace(): Promise<BrowserWorkspace | null> {
  if (!fsAccessSupported()) return null;
  const picker = (globalThis as unknown as { showDirectoryPicker(opts: unknown): Promise<FsAccessDirectoryHandle> }).showDirectoryPicker;
  let rootHandle: FsAccessDirectoryHandle;
  try {
    rootHandle = await picker({ mode: "readwrite" });
  } catch {
    return null; // the user cancelled — silence is the honest answer
  }

  const walk = async (parts: string[], create: boolean): Promise<FsAccessDirectoryHandle> => {
    let h = rootHandle;
    for (const part of parts) h = await h.getDirectoryHandle(part, { create });
    return h;
  };

  const fs: VhFs = {
    kind: "browser-fs-access",
    async readdir(p) {
      const h = await walk(p.split("/").filter(Boolean), false);
      const out: Array<{ name: string; isDirectory: boolean }> = [];
      for await (const entry of h.values() as AsyncIterable<{ name: string; kind: string }>) {
        out.push({ name: entry.name, isDirectory: entry.kind === "directory" });
      }
      return out.sort((a, b) => a.name.localeCompare(b.name));
    },
    async stat(p) {
      const parts = p.split("/").filter(Boolean);
      const fname = parts.pop() ?? "";
      const h = await walk(parts, false);
      try {
        const fh = await h.getFileHandle(fname);
        const file = await fh.getFile();
        return { isFile: true, size: file.size };
      } catch {
        await h.getDirectoryHandle(fname);
        return { isFile: false, size: 0 };
      }
    },
    async readText(p, maxBytes) {
      const parts = p.split("/").filter(Boolean);
      const fname = parts.pop() ?? "";
      const h = await walk(parts, false);
      const fh = await h.getFileHandle(fname);
      const file = await fh.getFile();
      const text = await file.text();
      const enc = new TextEncoder().encode(text);
      const truncated = enc.length > maxBytes;
      return { text: truncated ? new TextDecoder().decode(enc.slice(0, maxBytes)) : text, truncated };
    },
    async mkdir(p) {
      await walk(p.split("/").filter(Boolean), true);
    },
    async writeText(p, content) {
      const parts = p.split("/").filter(Boolean);
      const fname = parts.pop() ?? "";
      const h = await walk(parts, true);
      const fh = await h.getFileHandle(fname, { create: true });
      const w = await fh.createWritable();
      await w.write(content);
      await w.close();
    },
  };
  return { root: "/si-mission", kind: "browser-fs-access", label: `User-picked directory (real disk, File System Access)`, fs };
}
