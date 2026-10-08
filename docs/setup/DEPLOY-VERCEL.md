# SelfImpulse — Deploying to Vercel (web edition)

SelfImpulse's frontend is a pure Vite + React SPA. The desktop shell (Tauri/Rust) is
optional: on any static host SelfImpulse runs as its browser edition. The web edition runs
the full state machine in the browser; agent execution and git are labelled
`simulated` there because neither exists in a static host, while everything else —
Ed25519 signing (WebCrypto), receipts, the vault, the gate and merge logic — is the
same code the desktop runs.

`vercel.json`, `.vercelignore` and `.gitignore` are already in the repo. Vercel
auto-detects the Vite framework; build = `npm ci && npm run build`, output = `dist/`.

## What ships, precisely

**The artifact is the static `dist/` directory.** It is plain files — HTML, JS,
CSS, fonts, images — and it needs no server of its own: no Node process, no
`npm start`, nothing to keep alive. Any static host serves it.

Two commands, and the difference matters:

| Command | Output | Use it for |
|---|---|---|
| `npm run build` | `dist/`, after `tsc --noEmit` | Anything you ship. A type error fails the build instead of reaching production. |
| `npm run web:build` | `dist/`, plus a sync into `web-build/` | When you want the standalone web copy kept in step. No typecheck. |

`npm run dev` on `localhost:5173` is a **development server only**. It is not
the artifact and nothing in `dist/` depends on it running.

`npm run web:build` works on Windows. It used to shell out to POSIX `rm -rf`
and `cp`, which failed *after* a successful Vite build and exited 1 — a build
that looked broken while the output was fine.

**A2A federation is the only feature that binds a TCP port**
(`src/mission/a2aServer.ts`). It defaults to `127.0.0.1` and refuses to widen
itself: `0.0.0.0` is rejected in words, and a hostname is refused because a
name can resolve anywhere. In the static `dist/` edition that listener does not
exist at all, so the browser edition holds no port.

## Option A — GitHub → Vercel (recommended)

1. Push this repository to GitHub.
2. On https://vercel.com → **Add New → Project → Import** the repo.
   Framework preset: **Vite** (auto-detected). Leave Root Directory empty.
   Install `npm ci`, build `npm run build`, output `dist` — pre-filled from
   `vercel.json`.
3. **Deploy.** Every later `git push` auto-deploys; Vercel issues a preview URL per
   branch.

## Option B — Vercel CLI, straight from this folder

```bash
npm i -g vercel
vercel login
vercel --prod
```

`.vercelignore` limits the upload to the web build inputs.

## What the web edition demonstrates

- The full editor: canvas, library, preflight lint, palette, checkpoints, themes.
- The mission runtime: teams, role board, fleet board, approvals, receipts vault.
- Real Ed25519-signed proof receipts and an Evidence Pack export.
- The adversarial gate and merge executor operating on their real logic, with
  execution surfaces that require a host OS (agent CLIs, git) clearly labelled
  `simulated`.

State lives in the visitor's browser (localStorage), so every visitor gets an
isolated vault — useful for demos.

## Notes

- No environment variables, no backend, no database.
- Vercel's default Node 22 runtime matches the release's certifying runtime
  (v22.23.2).
- The desktop edition with real agent execution ships as the Tauri app; see
  [DESKTOP-NATIVE.md](DESKTOP-NATIVE.md).
