/**
 * 20.1 — the MCP catalogue must not advertise packages upstream has ARCHIVED.
 *
 * The catalogue shipped twelve entries. Five named packages that
 * modelcontextprotocol/servers moved into `servers-archived/` under the banner
 * "NO SECURITY GUARANTEES": server-postgres, server-sqlite, server-slack,
 * server-puppeteer, server-brave-search. A user could pick one, and the failure
 * (or worse, a successful call into unmaintained code) looked like the app's
 * fault rather than a catalogue defect.
 *
 * This runs over the real exported catalogue, so it fails if any archived
 * package is added back — the failure mode cannot be reintroduced quietly.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { MCP_CATALOG, ARCHIVED_MCP_PACKAGES } from "../src/engine/mcpMarket";

describe("mcp catalogue — no archived packages", () => {
  it("names no package from the upstream archived set", () => {
    const offenders: string[] = [];
    for (const entry of MCP_CATALOG) {
      const text = [entry.command ?? "", ...(entry.args ?? [])].join(" ");
      for (const banned of ARCHIVED_MCP_PACKAGES) {
        if (text.includes(banned)) offenders.push(`${entry.id} -> ${banned}`);
      }
    }
    assert.deepEqual(offenders, [], `archived packages reintroduced: ${offenders.join(", ")}`);
  });

  it("every entry declares its provenance", () => {
    // `verified` means confirmed live upstream; `unverified` must be explicit so
    // the UI can tell the user which is which.
    for (const entry of MCP_CATALOG) {
      assert.ok(entry.status === "verified" || entry.status === "unverified", `${entry.id} has no status`);
    }
  });

  it("every network entry warns that data leaves the machine", () => {
    for (const entry of MCP_CATALOG) {
      if (entry.transport !== "http") continue;
      assert.ok(entry.caveat && /network|leave/i.test(entry.caveat), `${entry.id} is http but does not say data leaves the device`);
    }
  });

  it("webfetch carries the upstream local-IP warning verbatim in substance", () => {
    // Upstream's own README says the fetch server "can access local/internal IP
    // addresses", and this app's SSRF guard validates the SERVER url, not the
    // urls that child process fetches. Silently dropping that is the defect.
    const f = MCP_CATALOG.find((e) => e.id === "webfetch");
    assert.ok(f, "webfetch missing from the catalogue");
    assert.match(f!.caveat ?? "", /local\/internal IP/i);
    assert.match(f!.caveat ?? "", /SSRF/i);
  });

  it("no entry is an unknown id with no command or url", () => {
    for (const entry of MCP_CATALOG) {
      if (entry.transport === "stdio") assert.ok(entry.command, `${entry.id} stdio entry has no command`);
      else assert.ok(entry.url, `${entry.id} http entry has no url`);
    }
  });
});
