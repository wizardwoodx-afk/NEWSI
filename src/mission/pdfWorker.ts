/**
 * §13 — the pdf.js worker seam, kept apart from the reader on purpose.
 *
 * The browser entry needs to hand pdf.js a worker URL before any PDF is read. If
 * that registration lived in `documentParsers.ts`, booting the app would pull
 * every parser in the tree into the first chunk to set one string. This module
 * imports nothing, so `main.tsx` pays nothing for it.
 *
 * Node has no `document`, so `documentParsers` resolves the vendored worker from
 * the tree instead and never asks this seam — which is why an unconfigured
 * browser build must refuse loudly rather than read a PDF "successfully" with no
 * text in it.
 */
let workerSrc: string | null = null;

export function configurePdfWorker(src: string | null): void { workerSrc = src; }

export function pdfWorkerSrc(): string | null { return workerSrc; }
