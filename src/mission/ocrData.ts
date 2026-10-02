/**
 * §13 — the OCR language-data seam, kept apart from the reader on purpose.
 *
 * The browser entry needs to tell the scan reader where the language data lives on this
 * machine before any scan is read. If that configuration lived in `scannedPdf.ts`, booting
 * the app would pull the rasteriser and the recogniser into the first chunk to set two
 * strings. This module imports nothing, so `main.tsx` pays nothing for it — the same
 * reasoning that keeps `pdfWorker.ts` separate from `documentParsers.ts`.
 *
 * WHY A PATH AND NOT A DOWNLOAD. The default in the upstream recogniser is a CDN, and a
 * reader that quietly downloads its language model is not a local reader. There is no
 * network fallback anywhere in this path: the data is either already on this machine, or
 * the read refuses in words and says where it looked. A build that has not configured this
 * refuses rather than fetching, which is the only honest default for an on-device door.
 */
let dataPath: string | null = null;
let language = "eng";
let corePath: string | undefined;
let workerPath: string | undefined;

/**
 * Called once at boot.
 *
 * `corePath` and `workerPath` are needed by the BROWSER build and only by it: there, the
 * recogniser's defaults for its core Wasm, its worker script AND its language data are all
 * remote content-delivery locations. Node resolves the first two from the installed package
 * locally and needs neither. The reader refuses outright in a browser that was given
 * neither, rather than starting and quietly fetching — see the guard in `ocr.ts`.
 */
export function configureOcrData(next: {
  dataPath: string | null;
  language?: string;
  corePath?: string;
  workerPath?: string;
}): void {
  dataPath = next.dataPath;
  language = next.language ?? "eng";
  corePath = next.corePath;
  workerPath = next.workerPath;
}

export function ocrDataPath(): string | null { return dataPath; }
export function ocrLanguage(): string { return language; }
export function ocrCorePath(): string | undefined { return corePath; }
export function ocrWorkerPath(): string | undefined { return workerPath; }
