import { buildSync } from "esbuild";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
const root = process.cwd();
const name = process.argv[2];
const full = path.join(root, "probe", `${name}.test.tsx`);
const out = path.join(root, "probe", `.one-${name}.tsx.mjs`);
buildSync({ entryPoints: [full], bundle: true, platform: "node", format: "esm", packages: "external",
  banner: { js: 'import { createRequire as __cr } from "node:module"; const require = __cr(import.meta.url);' },
  define: { SI_ROOT: JSON.stringify(root) }, outfile: out, logLevel: "error" });
try { process.stdout.write(execFileSync(process.execPath, [out], { cwd: root, encoding: "utf8", stdio: ["ignore","pipe","pipe"] })); }
catch (e) { if (e.stdout) process.stdout.write(e.stdout); if (e.stderr) process.stdout.write(e.stderr); }
finally { fs.unlinkSync(out); }
