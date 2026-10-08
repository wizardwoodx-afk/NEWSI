// SelfImpulse — built on the MJ engine
// Copyright (c) 2024-2026 K.S. / SelfImpulse. All Rights Reserved.

/* Runtime polyfill — Promise.withResolvers is an ES2024 API (Chrome 119,
   Safari 17.4, Node 22). The bundled pdf.js worker calls it, and older Linux
   WebKitGTK / Tauri webviews on older Windows/macOS do not provide it. A single
   shim here keeps the Docs PDF path alive on those hosts instead of throwing
   "Promise.withResolvers is not a function". If the host already ships it,
   this is a no-op. Declared on `globalThis.Promise` with a type assertion
   because the project's TS lib does not yet include ES2024, and bumping lib
   would widen types elsewhere — a small augmentation here is safer. */
type PromiseWithResolversImpl = <T>() => {
  promise: Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
};
const P = Promise as PromiseConstructor & { withResolvers?: PromiseWithResolversImpl };
if (typeof P.withResolvers !== "function") {
  P.withResolvers = function <T>() {
    let resolve!: (value: T | PromiseLike<T>) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
  } as PromiseWithResolversImpl;
}

import React from 'react';
import ReactDOM from 'react-dom/client';
import SelfImpulseApp from './App';
import { ErrorBoundary } from './panels/ErrorBoundary';
import { THEMES, DEFAULT_THEME } from './ui/store';
// ink.css carries layout and component geometry; si.css is the shell's own
// design system (the rail, the chips, the window controls) and was silently
// never imported, so the shell rendered unstyled. theme.css loads last because
// it overrides ink's :root palette.
import './ui/ink.css';
import './ui/si/si.css';
import './ui/theme.css';
/* §13 — pdf.js parses inside a Worker in the browser and will not start without
 * one. The URL comes from the bundler, so it cannot drift from the shipped
 * pdf.js build, and the seam that takes it imports nothing else — booting the
 * app does not pull the file readers in to set one string. */
import pdfWorkerUrl from '../vendor/pdfjs/pdf.worker.min.mjs?url';
import { configurePdfWorker } from './mission/pdfWorker';
configurePdfWorker(pdfWorkerUrl);
/* §13 — and the same seam for the scan reader. A PDF with no text layer is read as images
 * ON THIS MACHINE, and that reader needs three things present locally: the language pack,
 * the recogniser's core Wasm, and the recogniser's worker script. In a browser the engine's
 * own defaults for all three are REMOTE content-delivery locations, and a build that forgets
 * them does not fail — it quietly reaches out on the first scan. So all three are named here,
 * pointing at the copies `tools/vendor-ocr-assets.mjs` puts in the build output.
 *
 * Relative, deliberately: the paths resolve against the document, which is what makes them
 * correct under the dev server AND under the desktop build's own protocol, where an
 * absolute path would resolve against the wrong root.
 *
 * If any of the three is missing the reader REFUSES in words and reads nothing, rather than
 * starting and fetching. The desktop build's Node side needs none of this — there the
 * engine resolves its own core and worker from the installed package, locally. */
import { configureOcrData } from './mission/ocrData';
configureOcrData({
  dataPath: 'ocr/tessdata',
  corePath: 'ocr/core',
  workerPath: 'ocr/worker.min.js',
  language: 'eng',
});

/* 18.3.0 — browser-build CSP. The desktop (Tauri) build enforces its own CSP in
 * tauri.conf.json; the plain-browser build previously had NONE. In dev/preview
 * an injected meta narrows script execution to same-origin and data exfil to
 * https provider endpoints. Never injected under Tauri: the intersection with
 * the native CSP would block the asset:// protocol the webview relies on.
 *
 * 19.7.0 — also never injected inside a SANDBOXED preview frame (opaque
 * origin, `origin === "null"`): with a null origin, `'self'` matches nothing,
 * so the strict policy would blacklist the very scripts that boot the app.
 * The relaxed context is stated in the console, not hidden. */
if (!(globalThis as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__) {
  /* Sandboxed-frame detection that cannot lie: an opaque-origin frame cannot
   * reach its parent document (throws), while any top-level page (and the
   * Tauri webview) can. location.origin === "null" alone proved unreliable
   * across Chromium builds. */
  let sandboxed = typeof location !== "undefined" && location.origin === "null";
  if (!sandboxed) {
    try { const top = window.top; if (top && top !== window) void top.document; } catch { sandboxed = true; }
  }
  if (!sandboxed) {
    const meta = document.createElement('meta');
    meta.httpEquiv = 'Content-Security-Policy';
    meta.content = "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; worker-src 'self'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' ws: wss: https:; base-uri 'self'; object-src 'none'";
    document.head.appendChild(meta);
  } else {
    console.info("[11h] sandboxed preview frame detected (opaque origin) — the strict CSP is relaxed here on purpose; scripts load from the dev server.");
  }
}


/* 18.9.0 identity migration — legacy "mj.*" storage keys move to "vh.*" once.
 * Values are copied (never dropped): a key that already exists under the new
 * name wins, and the legacy key is only removed after a confirmed copy. */
try {
  const moved: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith("mj.")) {
      const nk = "vh." + k.slice(3);
      if (localStorage.getItem(nk) === null) localStorage.setItem(nk, localStorage.getItem(k) ?? "");
      moved.push(k);
    }
  }
  for (const k of moved) localStorage.removeItem(k);
} catch { /* storage unavailable — nothing to migrate */ }

/* 19.8 — appearance boot: the saved finish applies before the first paint. */
try {
  const saved = localStorage.getItem("vh.theme.v2");
  const known = THEMES.some((t) => t.id === saved);
  document.documentElement.dataset.theme = known ? saved! : DEFAULT_THEME;
} catch { /* charcoal stays */ }

/* 19.8 — a crash anywhere in the tree is caught, recorded in the LOCAL ledger
 * (never transmitted) and shown as a recoverable screen. Without this the window
 * went blank on any render throw and the evidence existed nowhere. The boundary
 * inside Shell.tsx handles per-door crashes; this one is the last resort for a
 * throw in the shell itself, so "reload" is offered rather than a dead app. */
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary label="SelfImpulse">
      <SelfImpulseApp />
    </ErrorBoundary>
  </React.StrictMode>,
);
