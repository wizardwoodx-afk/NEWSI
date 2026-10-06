import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const host = process.env.TAURI_DEV_HOST;

/**
 * VH 11.8.5 — how the Node builtins used by `src/mission/*` reach the WebView.
 *
 * `agentsMd`, `sandbox` and `teamExecutor` import `node:fs` / `node:os` / `node:path` because the
 * probe suites run them directly under Node, and they must test the real modules — never a double.
 *
 * 11.8.1 tried to solve the browser half at runtime with `require()` inside `try {} catch {}`. That
 * was wrong twice over: `require` is not in scope in ESM, so the catch fired under Node too (the
 * probes silently tested an empty object and the gate fell to 38/40), and the empty fallback let a
 * dead filesystem masquerade as an empty workspace.
 *
 * The correct seam is the bundler, not the runtime. These three aliases apply to the browser build
 * only — the probe runner invokes esbuild directly and never reads this file, so Node keeps the
 * genuine builtins. `path` is pure string logic and gets a faithful implementation; `fs` and `os`
 * cannot exist in a WebView and get stubs that THROW with a reason, so any degradation surfaces as
 * a stated cause instead of a silent zero.
 */
const browserBuiltin = (name: string): string =>
  fileURLToPath(new URL(`./src/browser/nodeStubs/${name}.ts`, import.meta.url));

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    {
      /**
       * 19.7.0 — the preview fix. Sandboxed preview iframes run this app
       * under an OPAQUE origin (`origin: null`). Every module fetch from
       * such a frame is a CORS request, and without Access-Control-Allow-Origin
       * headers the scripts never load — the app stayed on its splash
       * forever (observed and reproduced). This middleware answers every
       * request with permissive CORS and handles preflights, so the console
       * boots anywhere it is embedded. Dev-server only; the production
       * build is served same-origin and does not need it.
       */
      name: "si-preview-cors",
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          res.setHeader("Access-Control-Allow-Origin", req.headers.origin ?? "*");
          res.setHeader("Access-Control-Allow-Methods", "GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS");
          res.setHeader("Access-Control-Allow-Headers", "*");
          res.setHeader("Access-Control-Expose-Headers", "*");
          if (req.method === "OPTIONS") { res.statusCode = 204; res.end(); return; }
          next();
        });
      },
    },
  ],
  clearScreen: false,
  // Anchored regexes, deliberately: a bare string key like "node:fs" is a PREFIX match, so
  // `checkRunner.ts`'s `await import("node:fs/promises")` was being rewritten to
  // `…/nodeStubs/fs.ts/promises` and the build died on ENOTDIR. `$` pins each alias to the exact
  // specifier, and `fs/promises` is listed first so the intent reads top-down.
  // Every builtin `src/` reaches for, not just the three the first pass covered: `sandbox.ts`,
  // `checkRunner.ts` and `acp.ts` spawn processes and read their stdout, and an unaliased
  // `node:child_process` was being externalised into a message about the bundler rather than a
  // statement about the missing capability.
  resolve: {
    alias: [
      { find: /^node:fs\/promises$/, replacement: browserBuiltin("fs-promises") },
      { find: /^node:fs$/, replacement: browserBuiltin("fs") },
      { find: /^node:os$/, replacement: browserBuiltin("os") },
      { find: /^node:path$/, replacement: browserBuiltin("path") },
      { find: /^node:child_process$/, replacement: browserBuiltin("child_process") },
      { find: /^node:readline$/, replacement: browserBuiltin("readline") },
      // node:crypto — the drill's attestation digest (16.4); the proof layer itself
      // already uses the Web Crypto API, so the browser half is an honest throw.
      { find: /^node:crypto$/, replacement: browserBuiltin("crypto") },
      // The rest of nodeStubs/, which shipped with no alias pointing at them.
      // A stub nothing aliases is worse than no stub: it reads as browser support
      // that exists while the bundler quietly externalises the real import, and the
      // `onwarn` handler below swallows the one warning that would have said so.
      // These are all Proxy stubs that throw on first member access, so aliasing
      // them turns a silent externalisation into a stated cause at runtime.
      { find: /^node:http$/, replacement: browserBuiltin("http") },
      { find: /^node:net$/, replacement: browserBuiltin("net") },
      { find: /^node:url$/, replacement: browserBuiltin("url") },
      { find: /^node:zlib$/, replacement: browserBuiltin("zlib") },
      { find: /^node:buffer$/, replacement: browserBuiltin("buffer") },
      { find: /^node:events$/, replacement: browserBuiltin("events") },
      { find: /^node:stream$/, replacement: browserBuiltin("stream") },
      { find: /^node:util$/, replacement: browserBuiltin("util") },
      { find: /^node:process$/, replacement: browserBuiltin("process") },
    ],
  },
  optimizeDeps: {
    exclude: ["@primer/react", "@primer/octicons-react", "@modelcontextprotocol/ext-apps/react", "react-markdown", "remark-gfm", "@github/markdown-toolbar-element"],
  },
  server: {
    port: 5173,
    strictPort: false,
    host: host || "0.0.0.0",
    allowedHosts: true,
    // 19.7.0 — vite's own CORS middleware (which 403s opaque origins) is
    // disabled; the si-preview-cors plugin above owns the headers.
    cors: false,
    // 19.3.0 UI refresh — demo-provider relay. The browser build talks to
    // /th-api/* same-origin; the dev server forwards to the provider host.
    // This keeps CSP trivially satisfied and sidesteps provider-side CORS
    // for demos. Production deployments configure their own base URL in the
    // Provider panel; nothing about this proxy ships in the desktop build.
    proxy: {
      "/th-api": {
        target: "https://tokenselfimpulse.ai",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/th-api/, ""),
      },
    },
    hmr: host ? { protocol: "ws", host, port: 5174 } : true,
    watch: { ignored: ["**/src-tauri/**", "**/vendor/**", "**/probe/**", "**/verify/**", "**/web-build/**", "**/dist/**"] },
  },
  preview: {
    host: "0.0.0.0",
    port: 5173,
  },
  envPrefix: ["VITE_", "TAURI_ENV_*"],
  build: {
    target: process.env.TAURI_ENV_PLATFORM == "windows" ? "chrome105" : "safari14",
    minify: !process.env.TAURI_ENV_DEBUG ? "esbuild" : false,
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
    reportCompressedSize: false,
    // 19.7.13 — the limit is DECLARED, not dodged. After the split below the
    // shell is ~50 kB and the vendor and state chunks are well under the line;
    // two chunks remain large and both are intentional, measured, and not a
    // sign of a missing split:
    //   • graph3d (~1.2 MB) is the 3D force-graph library, imported LAZILY
    //     inside the Memory door, so it is never on the first-paint path.
    // Raising the limit is honest only alongside that reasoning; if the engine
    // ever grows past this, the build warns again rather than staying silent.
    chunkSizeWarningLimit: 1300,
    // V10.1: the framework is now its own chunk. The single 596 kB bundle tripped Rollup's
    // warning on every build and forced a full re-download of React on every app release;
    // vendor code changes far less often than app code.
    //
    // V11.4.1: mission modules import node builtins (fs/path/…) behind typeof-guards — they
    // are dual-used by the node-run probes. The browser bundle externalizes those imports by
    // design, and Vite warned about each one on every build. The pattern is deliberate and
    // guarded, so the warning is acknowledged once here instead of spammed 40× per build.
    rollupOptions: {
      cache: false,
      maxParallelFileOps: 2,
      onwarn(warning, warn) {
        if (/has been externalized for browser compatibility/.test(String(warning?.message ?? ""))) {
          return;
        }
        warn(warning);
      },
      output: {
        manualChunks(id: string) {
          if (id.includes("node_modules")) {
            if (id.includes("3d-force-graph") || id.includes("three")) return "graph3d";
            if (id.includes("react") || id.includes("scheduler")) return "react";
            if (id.includes("zustand") || id.includes("zod")) return "vendor-state";
            return "vendor";
          }
          if (id.includes("/src/engine/") || id.includes("/src/mission/") || id.includes("/src/domain/")) return "engine";
          return undefined;
        },
      },
    },
  },
});
