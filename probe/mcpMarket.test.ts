/**
 * probe/mcpMarket.test.ts — the MCP market (19.7.0).
 *
 * Pins: the curated catalog is real and described; installs validate (zod +
 * the SSRF egress guard for HTTP); enable/disable/remove work; the export
 * is the standard mcpServers shape with env NAMES and never values.
 */
import assert from "node:assert/strict";

let passed = 0;
let failed = 0;
const failures: string[] = [];
function ok(label: string, cond: boolean, detail = ""): void {
  if (cond) { passed++; console.log(`  ok   ${label}`); }
  else { failed++; failures.push(`${label}${detail ? ` — ${detail}` : ""}`); console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`); }
}

const mkt = await import("../src/engine/mcpMarket");

console.log("== the curated catalog ==");
const cat = mkt.catalogServers();
// 20.1: was `cat.length >= 10`. That assertion rewarded a catalogue for being
// LONG, which is how five entries naming packages upstream has ARCHIVED
// ("NO SECURITY GUARANTEES") survived review: the more you offered, the
// better this probe scored. Length is not quality and never was.
//
// What actually matters is that every listed server is real and live. The
// exclusion set is enforced by probe/mcpCatalogHonesty.test.ts; here we assert
// the SEVEN upstream reference servers the catalogue is supposed to carry, so
// a shrinking catalogue still has to keep the ones that exist.
const UPSTREAM_REFERENCE_SERVERS = ["filesystem", "git", "webfetch", "memory", "sequentialthinking", "time"];
ok("the catalog ships the live upstream reference servers", UPSTREAM_REFERENCE_SERVERS.every((id) => cat.some((c) => c.id === id)), `missing: ${UPSTREAM_REFERENCE_SERVERS.filter((id) => !cat.some((c) => c.id === id)).join(", ")}`);
ok("every catalog entry is named, described and categorized", cat.every((c) => c.name && c.description && c.category));
ok("every catalog entry declares its transport", cat.every((c) => c.transport === "stdio" || c.transport === "http"));
ok("stdio entries carry a launch command", cat.filter((c) => c.transport === "stdio").every((c) => typeof c.command === "string" && c.command.length > 0));
ok("http entries carry a URL", cat.filter((c) => c.transport === "http").every((c) => typeof c.url === "string" && c.url.startsWith("https://")));

console.log("== installs validate ==");
mkt.clearMarket();
const good = mkt.installServer({ name: "My GitHub", transport: "http", url: "https://api.githubcopilot.com/mcp/", envNames: ["GITHUB_TOKEN"] });
ok("a clean HTTPS install succeeds", good.ok === true);
const badUrl = mkt.installServer({ name: "sneaky", transport: "http", url: "http://169.254.169.254/latest/meta-data" });
ok("a link-local metadata URL is refused by the egress guard", badUrl.ok === false && badUrl.refusal.includes("egress guard"));
const noCmd = mkt.installServer({ name: "no-cmd", transport: "stdio" });
ok("a stdio server without a command is refused in words", noCmd.ok === false && noCmd.refusal.length > 0);
const noName = mkt.installServer({ name: "  ", transport: "http", url: "https://example.com/mcp" });
ok("an unnamed server is refused in words", noName.ok === false);
const sudo = mkt.installServer({ name: "danger", transport: "stdio", command: "sudo rm -rf /" });
ok("destructive command shapes are refused at the market", sudo.ok === false);

console.log("== enable / disable / remove ==");
mkt.clearMarket();
const inst = mkt.installServer({ name: "Memory", transport: "stdio", command: "npx", args: ["-y", "@modelcontextprotocol/server-memory"] });
if (!inst.ok) { ok("baseline install", false); } else {
  ok("install lands enabled", mkt.listInstalled()[0]?.enabled === true);
  mkt.setServerEnabled(inst.server.id, false);
  ok("disable works", mkt.listInstalled()[0]?.enabled === false);
  ok("remove works", mkt.uninstallServer(inst.server.id) === true && mkt.listInstalled().length === 0);
  ok("removing an unknown id is an honest false", mkt.uninstallServer("ghost") === false);
}

console.log("== the export is the standard shape, keys by name only ==");
mkt.clearMarket();
mkt.installServer({ name: "GH", transport: "http", url: "https://api.githubcopilot.com/mcp/", envNames: ["GITHUB_TOKEN"] });
mkt.installServer({ name: "FS", transport: "stdio", command: "npx", args: ["-y", "@modelcontextprotocol/server-filesystem", "/tmp/ws"] });
const exp = mkt.exportMcpJson();
ok("the export carries an mcpServers record", typeof exp.mcpServers === "object" && Object.keys(exp.mcpServers).length === 2);
ok("http servers export their url", exp.mcpServers.gh?.url === "https://api.githubcopilot.com/mcp/");
ok("stdio servers export command + args", exp.mcpServers.fs?.command === "npx" && Array.isArray(exp.mcpServers.fs?.args));
ok("env is exported as NAMES with host-resolved placeholders", exp.mcpServers.gh?.env?.GITHUB_TOKEN === "$GITHUB_TOKEN");
const exported = JSON.stringify(exp);
ok("no literal secret value can ride the export", !exported.includes("ghp_") && !/sk-[A-Za-z0-9]{10,}/.test(exported));
mkt.setServerEnabled("fs", false);
ok("a disabled server is excluded from the export", Object.keys(mkt.exportMcpJson().mcpServers).length === 1);

console.log("== stats ==");
mkt.clearMarket();
const st = mkt.marketStats();
// 20.1: `st.catalog >= 10` rewarded the catalogue for length, which is exactly
// how archived packages survived review (see the note above). Assert the honest
// invariant instead: every catalogue entry is counted, and nothing is installed.
ok("stats read the catalog and the (now empty) registry", st.catalog === cat.length && st.catalog > 0 && st.installed === 0 && st.enabled === 0, `stats.catalog=${st.catalog} vs catalog.length=${cat.length}, installed=${st.installed}, enabled=${st.enabled}`);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) { console.log("\nfailures:"); for (const f of failures) console.log(`  - ${f}`); }
process.exit(failed > 0 ? 1 : 0);
