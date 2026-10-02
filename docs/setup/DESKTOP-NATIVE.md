# SelfImpulse — Desktop native install (Windows 11)

SelfImpulse is a Tauri v2 desktop app for Windows 11. The web preview you see in a browser is the same React app with no
native shell — it cannot spawn coding agents, touch the keyring, or write SQLite. Everything below
is about getting the **native** build running on your machine. macOS/Linux are not supported by this
tree (CI is Windows-only; bundle target is nsis only).

§1–§5 are written as an ordered checklist, so they can be executed and verified
one step at a time.

---

## 1. Toolchain (Windows 11)

```powershell
# Rust (required)
winget install Rustlang.Rustup
winget install Microsoft.VisualStudio.2022.BuildTools   # "Desktop development with C++"
rustc --version      # a current stable toolchain; the floor is pinned as rust-version in src-tauri/Cargo.toml

# Node 20+ and the Vite/React deps
node --version
cd mj; npm ci
```

Platform extras: **Windows** needs "Desktop development with C++" from Visual Studio Build Tools,
plus WebView2 (preinstalled on Win 11). That is the whole list — no other OS is supported.

## 2. Verify before building

```bash
cd mj
./node_modules/.bin/tsc --noEmit                      # must exit 0
./node_modules/.bin/esbuild probe/acceptance.test.ts --bundle --platform=node --format=esm --outfile=/tmp/a.mjs && node /tmp/a.mjs
./node_modules/.bin/esbuild probe/harnessPolicy.test.ts --bundle --platform=node --format=esm --outfile=/tmp/h.mjs && node /tmp/h.mjs
./node_modules/.bin/esbuild probe/engine.test.ts --bundle --platform=node --format=esm --outfile=/tmp/e.mjs && node /tmp/e.mjs
./node_modules/.bin/esbuild probe/wiring.test.ts --bundle --platform=node --format=esm --outfile=/tmp/w.mjs && node /tmp/w.mjs
./node_modules/.bin/vite build                        # must exit 0
```

Expected: all probe suites passing, `vite build` exit 0.

## 3. The Rust side — verified on Windows 11

`cargo test` over `src-tauri/` passes against real dependencies: **29 unit + 11 store-integration,
0 failed.** Run it yourself:

```powershell
cd mj\src-tauri
cargo test
```

If anything fails here, that failure is real and specific — fix or report it; do not skip this step.

## 4. Run it

```powershell
cd mj
npm run tauri dev        # dev window, hot reload
npm run tauri:build      # installer: nsis (Win x64)
```

The bundle lands in `src-tauri\target\release\bundle\nsis\SelfImpulse_x64-setup.exe`.

## 5. There is nothing to install

Earlier builds of this product drove **external coding-agent CLIs** — Claude Code,
Codex, OpenCode — as subprocesses, under a `PATH` scan and a per-risk flag
matrix. That architecture is **gone, permanently**. There is no CLI to install,
no `PATH` to scan, no `--permission-mode` to pass, and no login step.

What runs instead is the **in-process agent plane** (`src/engine/`), where a seat
is a function on this machine with a scoped tool set, not a child process with a
shell. The two harnesses that remain are both native:

| Harness | What it is | Where it runs |
|---|---|---|
| `hermes` | the default reasoning + tool harness | in this process |
| `llm` | a direct provider call, with a local Ollama option | in this process |

### What replaced the risk-flag matrix

The old design turned a mission's risk class into CLI sandbox flags. That is
gone, and so is the problem it was papering over: the risk classification now
gates the **capability set**, not a subprocess's flags.

| Risk | What happens now |
|---|---|
| LOW / review | the seat is offered read-only tools; a write is a different seat |
| MEDIUM | writes allowed, scoped to the declared worktree |
| HIGH | **paused at the human gate** before the seat is ever created |
| CRITICAL | **refused** — no seat is created, and the refusal is receipted |

`src/mission/gateRules.ts` and `src/security/guardrail.ts` own that ladder.
There is no equivalent of `--dangerously-skip-permissions` because there is no
subprocess to hand it to.

### Why this is better, not just different

A child process is a thing you have to *constrain*: you pass it flags and hope,
and the flags are only as good as the CLI's own interpretation of them. An
in-process seat is bounded by construction — the tool set is a parameter, not a
suggestion, and there is no shell for a malformed argument to reach. Removing
the CLIs removed an entire class of "works on my machine" failures along with
the dependency.

## 6. Provider keys and Ollama

Set locally, never committed: `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`. For the local `llm` harness run
Ollama on `127.0.0.1:11434`. Secrets go to the OS keyring (`src-tauri/src/secrets.rs`); if the
keyring is unavailable SelfImpulse falls back to an in-memory map and says so.

## 7. PATH: the #1 native failure, and what was done about it

A packaged app launched from the Start menu does **not** inherit your shell's PATH. So
`claude` installed by npm is invisible to SelfImpulse even though it works in your terminal.

`which_bin` in `src-tauri/src/commands.rs` now searches, in order:

1. the inherited `PATH`;
2. known install locations — `%APPDATA%\npm`, `C:\Program Files\nodejs`, scoop shims,
   `~/.npm-global/bin`, `~/.nvm/versions/node/*/bin` (every installed node version),
   `~/.volta/bin`, `~/.bun/bin`, `~/.deno/bin`, `~/.cargo/bin`;
3. the login shell's own PATH on unix (`zsh`/`bash`/`sh` — skipped on Windows, where
   step 2 plus the inherited registry PATH covers the standard install locations).

If it still misses, the Providers page lists every directory searched.

## 8. Execution semantics

Until a real CLI is installed, missions run on SelfImpulse's labelled `local-test` double. It reports
`simulated: true` in every event, artifact and UI surface, and `MissionRuntime.finish()` will return
`BLOCKED` — never `COMPLETED` — for a mission that used it. That is deliberate: SelfImpulse does not claim
verified success it did not earn.
