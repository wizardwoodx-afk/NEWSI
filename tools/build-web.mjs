#!/usr/bin/env node
/**
 * Build the browser (dist/) with the esbuild API.
 *
 * The normal path is `vite build` (rollup), but in this sandbox rollup's
 * "rendering chunks" phase OOM-kills on a 2 GB host with no swap. esbuild
 * produces a working single-bundle output with dramatically less memory and
 * is the same approach we already use for tools/mcp-engine.mjs and
 * tools/si-host-engine.mjs. CSS is processed by esbuild's CSS pipeline which
 * resolves the font @imports and emits hashed asset URLs.
 */
import { build } from "esbuild";
import { copyFileSync, mkdirSync, rmSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const dist = join(root, "dist");

if (existsSync(dist)) rmSync(dist, { recursive: true, force: true });
mkdirSync(join(dist, "assets"), { recursive: true });

// Copy static files. Fonts live at /fonts at runtime; index.html references
// them relatively.
copyFileSync(join(root, "index.html"), join(dist, "index.html"));
copyFileSync(join(root, "public", "favicon.svg"), join(dist, "favicon.svg"));
copyFonts(join(root, "public", "fonts"), join(dist, "fonts"));

function copyFonts(src, dst) {
  mkdirSync(dst, { recursive: true });
  for (const f of readdirSync(src)) {
    const s = join(src, f), d = join(dst, f);
    if (statSync(s).isDirectory()) copyFonts(s, d);
    else copyFileSync(s, d);
  }
}

// Tell the browser-targeted node-stubs not to throw for node: builtins —
// these files are already exercised by probes and the same alias logic vite
// applies is handled below via esbuild plugins.
const result = await build({
  entryPoints: [join(root, "src", "main.tsx")],
  bundle: true,
  platform: "browser",
  format: "esm",
  target: ["safari14", "chrome105"],
  outfile: join(dist, "assets", "index.js"),
  logLevel: "info",
  absWorkingDir: root,
  sourcemap: false,
  minify: false,        // minify adds memory; dev-quality JS is fine for the archive
  splitting: false,
  define: {
    "process.env.NODE_ENV": '"production"',
    "process.env.TAURI_ENV_PLATFORM": '""',
    "process.env.TAURI_ENV_DEBUG": "false",
    "global": "window",
  },
  loader: {
    ".woff2": "file",
    ".svg": "file",
    ".png": "file",
  },
  assetNames: "assets/[name]-[hash]",
  // Browser aliases for node builtins (matches vite.config.ts)
  plugins: [
    {
      name: "node-stubs",
      setup(build) {
        const stubs = {
          "node:fs/promises": "fs-promises",
          "node:fs": "fs",
          "node:os": "os",
          "node:path": "path",
          "node:child_process": "child_process",
          "node:readline": "readline",
          "node:crypto": "crypto",
          "node:url": "url",
          "node:util": "util",
          "node:stream": "stream",
          "node:events": "events",
          "node:buffer": "buffer",
          "node:process": "process",
        };
        for (const [spec, stub] of Object.entries(stubs)) {
          build.onResolve({ filter: new RegExp(`^${spec.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`) }, () => {
            const p = join(root, "src", "browser", "nodeStubs", `${stub}.ts`);
            // Fallback to an empty stub if the file doesn't exist yet
            if (existsSync(p)) return { path: p };
            return { path: join(root, "src", "browser", "nodeStubs", "_empty.ts") };
          });
        }
        // Fonts referenced from CSS as /fonts/X.woff2 — serve as external URLs
        build.onResolve({ filter: /^\/fonts\// }, (args) => ({
          path: args.path, external: true,
        }));
        // Vite `?url` suffix — resolve the underlying path and route through a
        // url-asset namespace that copies the file and returns its public URL.
        build.onResolve({ filter: /\?url$/ }, (args) => {
          const realPath = args.path.replace(/\?url$/, "");
          const base = (args.resolveDir && !realPath.startsWith("."))
            ? join(root, realPath)
            : join(args.resolveDir || root, realPath);
          return { path: base, namespace: "url-asset" };
        });
        build.onLoad({ filter: /.*/, namespace: "url-asset" }, async (args) => {
          const { copyFile } = await import("node:fs/promises");
          const src = args.path;
          const base = src.split(/[\\/]/).pop() ?? "asset";
          const out = join(dist, "assets", base);
          mkdirSync(join(dist, "assets"), { recursive: true });
          try { await copyFile(src, out); } catch (e) { /* ignore — vendor copy may already be there */ }
          return { contents: `export default ${JSON.stringify("/assets/" + base)};`, loader: "js" };
        });
      },
    },
  ],
});

// Patch index.html to load the built bundle (the dev entry was via @vite/client).
import { readFileSync, writeFileSync } from "node:fs";
let html = readFileSync(join(dist, "index.html"), "utf8");
// Remove vite client if present
html = html.replace(/<script[^>]*src=["']\/@vite\/client["'][^>]*><\/script>/, "");
// Replace dev main.tsx script with the built bundle
html = html.replace(/<script[^>]*src=["'][^"']*main\.tsx["'][^>]*><\/script>/,
  '<script type="module" crossorigin src="/assets/index.js"></script>');
// Link the emitted CSS before the script
if (!html.includes("/assets/index.css")) {
  html = html.replace("</head>", '<link rel="stylesheet" href="/assets/index.css" /></head>');
}
if (!html.includes('src="/assets/index.js"')) {
  html = html.replace("</body>", '<script type="module" crossorigin src="/assets/index.js"></script></body>');
}
writeFileSync(join(dist, "index.html"), html);

console.log("web build: dist/ ready (" + (result.warnings?.length ?? 0) + " warnings)");
