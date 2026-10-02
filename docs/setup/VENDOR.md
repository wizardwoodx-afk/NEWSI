# What SelfImpulse vendors

SelfImpulse doesn't reimplement everything. A few pieces are vendored so the app works fresh off a clone — they're shipped inside the installer (`src-tauri/tauri.conf.json` → `bundle.resources: ["../vendor"]`).

| Path | Where it comes from | License | What SelfImpulse uses it for |
|---|---|---|---|
| `vendor/mcp-servers-reference` | [modelcontextprotocol/servers](https://github.com/modelcontextprotocol/servers) | MIT / Apache-2.0 | Filesystem, Git, Memory, Sequential Thinking, Time (stdio) |
| `vendor/mcp-github` | [github/github-mcp-server](https://github.com/github/github-mcp-server) | MIT | GitHub MCP over stdio |
| `vendor/evolution-service` | **Mine — first-party** | SelfImpulse proprietary | Python stdio bridge `mj_evolution.stdio_server` — Tauri spawns it, no HTTP |

`vendor/evolution-service` lives under `vendor/` just because `src-tauri/src/hermes.rs` looks there (`<vendor>/evolution-service/...`). It is a first-partyowned first-party component (proprietary, same license as the product).

The agent skill contract (SKILL.md), skill parsing, and the evolution fitness/constraints engine are **SelfImpulse's own TypeScript** implementations with no dependency on a vendored agent codebase.

Licenses are kept verbatim in each vendor dir and summarized in `NOTICE`. `mcp-servers-reference` declares a mid-transition MIT → Apache-2.0 — double-check that if you redistribute commercially.
