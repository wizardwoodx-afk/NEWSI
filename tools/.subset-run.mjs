import fs from "node:fs";
import path from "node:path";
import { buildSync } from "esbuild";
import { execFileSync } from "node:child_process";

const ROOT = "D:/selfimpulse";
const probeDir = path.join(ROOT, "probe");
const files = process.argv.slice(2);

let pass = 0, fail = 0;
const failures = [];
for (const file of files) {
  const outPath = path.join(probeDir, `.${file}.mjs`);
  try {
    buildSync({
      entryPoints: [path.join(probeDir, file)],
      bundle: true, platform: "node", format: "esm", packages: "external",
      banner: { js: 'import { createRequire as __mjCreateRequire } from "node:module"; const require = __mjCreateRequire(import.meta.url);' },
      define: { SI_ROOT: JSON.stringify(ROOT) },
      outfile: outPath, logLevel: "error",
    });
    const stdout = execFileSync(process.execPath, [outPath], {
      cwd: ROOT, timeout: 300_000, killSignal: "SIGKILL",
      maxBuffer: 256 * 1024 * 1024, encoding: "utf8",
    });
    process.stdout.write(stdout);
    console.log(`PASS: ${file}\n`);
    pass++;
  } catch (err) {
    console.log(`FAIL: ${file}`);
    if (err && typeof err.stdout === "string") process.stdout.write(err.stdout);
    console.log((err.message || String(err)).split("\n").slice(0, 12).join("\n"));
    console.log("");
    failures.push(file);
    fail++;
  } finally {
    try { fs.unlinkSync(outPath); } catch { /* never written */ }
  }
}
console.log(`SUBSET: ${pass} passed, ${fail} failed${fail ? ` — ${failures.join(", ")}` : ""}`);
