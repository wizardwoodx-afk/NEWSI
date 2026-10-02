/**
 * What this app is allowed to open, and what happens when it does.
 *
 * WHY A REGISTRY AND NOT A `<input accept>`. The browser attribute is a
 * convenience filter that the user can trivially bypass, and it says nothing to
 * the rest of the program. A file reaches this app through four doors — the
 * composer, a drag-and-drop, a folder the user points at, and a file offered by
 * a connected device — and a type list that lives in only one of those doors is
 * a type list that is wrong in three.
 *
 * So the list lives here, once, and every door asks this module. Anything not in
 * here is refused with a sentence that names the extension, because "unsupported
 * file" tells a user nothing they can act on and "I don't know .xlsm" is worse.
 *
 * READING IS NOT THE SAME AS CARRYING. A `.zip` is not a document; it is a
 * container that may hold an executable, so it is carried and listed, never
 * expanded. An `.mp4` is carried, not watched. This distinction is why every
 * group below has a `read` verb: the app should never imply it understood a file
 * it merely received.
 */

/** What the app does with the bytes once it has them. */
export type Disposition = "read" | "carry" | "list";

export interface FileKind {
  ext: string;
  group: Group;
  disposition: Disposition;
  /** Plain words, for the settings screen and for the refusal message. */
  label: string;
}

export type Group =
  | "docs" | "sheets" | "slides"
  | "zip" | "data" | "img" | "av";

export const GROUPS: Record<Group, string> = {
  docs:   "Documents",
  sheets: "Spreadsheets",
  slides: "Presentations",
  zip:    "Archives",
  data:   "Data & code",
  img:    "Images & design",
  av:     "Audio & video",
};

/**
 * The list itself.
 *
 * Deliberately long, and deliberately boring: this is the union of what a real
 * office, legal or finance person actually has in a folder, not a list of
 * formats that are interesting to support. The ones people hit most often are
 * first in each group.
 *
 * `carry` means the file is accepted, hashed, and shown — but its contents are
 * never interpreted. `read` means text and tables are extracted. `list` means
 * an archive is enumerated without being expanded.
 */
const K = (
  group: Group, disposition: Disposition, label: string,
  exts: string[],
): FileKind[] => exts.map((e) => ({ ext: e, group, disposition, label }));

export const KINDS: FileKind[] = [
  ...K("docs", "read", "document", [
    "pdf", "docx", "doc", "odt", "rtf", "txt", "md", "epub", "pages",
    "wps", "tex", "abw",
  ]),
  ...K("sheets", "read", "spreadsheet", [
    "xlsx", "xls", "csv", "tsv", "ods", "numbers", "xlsm",
  ]),
  ...K("slides", "read", "presentation", [
    "pptx", "ppt", "odp", "key",
  ]),
  ...K("zip", "list", "archive", [
    "zip", "7z", "tar", "gz", "bz2", "xz", "rar",
  ]),
  ...K("data", "read", "data file", [
    "json", "jsonl", "xml", "yaml", "yml", "sql", "log", "ini", "conf",
    "html", "htm", "ts", "js", "py", "rs", "go", "java", "c", "h", "cpp",
  ]),
  ...K("img", "carry", "image", [
    "png", "jpg", "jpeg", "gif", "tiff", "tif", "bmp", "webp", "svg", "heic",
  ]),
  ...K("av", "carry", "media file", [
    "mp4", "mov", "avi", "mkv", "webm", "mp3", "wav", "m4a", "flac", "aac",
    "srt", "vtt",
  ]),
];

/** 512 MB. Large enough for a real deck or a big workbook, small enough that
 *  one file cannot exhaust the machine. Enforced before any read, not after. */
export const MAX_BYTES = 512 * 1024 * 1024;

/** Above this the app lists it and refuses to read it, rather than pretending. */
export const READ_LIMIT = 64 * 1024 * 1024;

const INDEX = new Map<string, FileKind>();
for (const k of KINDS) if (!INDEX.has(k.ext)) INDEX.set(k.ext, k);

export const extOf = (name: string): string => {
  const i = name.lastIndexOf(".");
  if (i < 1) return "";
  return name.slice(i + 1).toLowerCase();
};

export const kindOf = (name: string): FileKind | undefined => INDEX.get(extOf(name));

export const byGroup = (g: Group): FileKind[] => KINDS.filter((k) => k.group === g);

/** Extensions the OS file dialog is allowed to show, as a real filter string. */
export const dialogFilter = (): string =>
  `Openable (${KINDS.map((k) => `.${k.ext}`).join(",")})|` +
  `${KINDS.map((k) => `.${k.ext}`).join(",")}|` +
  `All files (*.*)|*.*`;

export type AcceptResult =
  | { ok: true; kind: FileKind; reason?: string | null }
  | { ok: false; reason: string; kind?: FileKind };

/**
 * The one door. Everything else — composer, drag-drop, folder, peer offer —
 * routes through here, so a type refused in one place is refused in all of them.
 */
export const accept = (name: string, size: number): AcceptResult => {
  const kind = kindOf(name);

  if (!kind) {
    const ext = extOf(name);
    return {
      ok: false,
      reason: ext
        ? `This app does not open .${ext} files, so it will not read "${name}". ` +
          `It can still be attached and passed on untouched, or you can export it to a format it understands.`
        : `"${name}" has no file extension, so there is no way to tell what it is. ` +
          `Rename it to something like .pdf or .docx and it will open.`,
    };
  }

  if (size > MAX_BYTES) {
    return {
      ok: false, kind,
      reason: `"${name}" is ${mb(size)}, and the limit is ${mb(MAX_BYTES)}. ` +
        `Split it, or compress it — a .zip is accepted as a file to look at, ` +
        `though the app will not unpack it on its own.`,
    };
  }

  if (kind.disposition === "carry" && size > READ_LIMIT) {
    return {
      ok: true, kind,
      reason: `${kind.label} files are attached as-is and never interpreted, ` +
        `so size does not matter here.`,
    };
  }
  return { ok: true, kind };
};

const mb = (n: number): string => `${Math.round(n / 1024 / 1024)} MB`;

/** What the settings screen lists, grouped for display. */
export const matrix = (): { group: Group; name: string; kinds: FileKind[] }[] =>
  (Object.keys(GROUPS) as Group[]).map((g) => ({
    group: g, name: GROUPS[g], kinds: byGroup(g),
  }));

/**
 * What a refusal actually protects against, in one sentence each. This is not
 * decoration: a product that refuses things without saying why is indistinguishable
 * from a product that is broken, and users route around broken products.
 */
export const WHY: Record<Disposition, string> = {
  read:   "Read for you. Text and tables are extracted into the conversation.",
  list:   "Listed, never unpacked. A zip you have not opened is a zip that can run something.",
  carry:  "Attached as-is. The app never looks inside it and never claims to have understood it.",
};
