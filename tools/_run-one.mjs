import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { buildSync } from "esbuild";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const files = process.argv.slice(2);

for (const file of files) {
  const fullPath = path.join(root, "probe", file);
  const outPath = path.join(root, "probe", `.${file}.mjs`);
  buildSync({
    entryPoints: [fullPath],
    bundle: true,
    platform: "node",
    format: "esm",
    packages: "external",
    banner: { js: 'import { createRequire as __mjCreateRequire } from "node:module"; const require = __mjCreateRequire(import.meta.url);' },
    define: { SI_ROOT: JSON.stringify(root) },
    outfile: outPath,
    logLevel: "error",
  });
  try {
    const out = execFileSync(process.execPath, [outPath], { cwd: root, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
    process.stdout.write(out);
    console.log(`PASS: ${file}\n`);
  } catch (err) {
    console.log(`FAIL: ${file}`);
    if (err.stdout) process.stdout.write(err.stdout);
    if (err.stderr) process.stderr.write(err.stderr);
  } finally {
    try { (await import("node:fs")).unlinkSync(outPath); } catch {}
  }
}
