# Security

SelfImpulse is a desktop agent runtime that can execute real actions on your
machine. Security is not a slogan here — it is the product.

## Reporting a vulnerability

**Do not file a public GitHub issue.** Email security findings to
`security@selfimpulse.dev` (PGP key to be published on the project site).

We will acknowledge within 72 hours and provide a timeline for a fix. We ask
that you give us a reasonable embargo window before public disclosure so
every user has a patched build available.

## What is in scope

- The Tauri/Rust host (`src-tauri/`): IPC handlers, command allowlists,
  process containment (`contain.rs`), the secret store.
- The TypeScript engine (`src/engine/`, `src/mission/`): gates, tool policy,
  SSRF/egress guards, signing, the vault, the receipt chain.
- The verification pack (`verify/`) and probe suite (`probe/`): a bypass
  of a probe that the offline pack does not catch is a vulnerability in the
  proof system itself.
- The receipt protocol: any forgeable digest, unsigned chain, or replay
  against a valid receipt.

## What is *not* a vulnerability

- A refusal in words. SelfImpulse is designed to refuse rather than guess; a
  "I cannot do that" message is working as intended.
- Running on an unsupported engine. SelfImpulse requires Node ≥ 22.12 for dev
  and a supported Tauri WebView for desktop.
- An issue in one of our vendored dependencies that is already fixed at a
  newer pinned version — *do* report it so we can bump; we will credit you.

## Security model

The WebView is untrusted content: a script injected into the page can call any
registered command with any arguments. So the desktop build does not authorize
on the *shape* of those arguments ("is the path non-empty?") — it authorizes on
what was **granted**, by a human, at a **native dialog the page cannot click**.

| Surface | What the native side enforces |
|---|---|
| **Provider keys** | The key is handed to the OS keychain once and never returned: `secret_get` answers "present" and a four-character hint, nothing more. The page holds a *reference*; `llm_chat` attaches the key natively. |
| **Where a key may go** | Only the vendor's own origin, or an origin a human bound at a native dialog, over https (plain http only to loopback). Decided *before* the key is read. A page cannot name both the secret and the destination. |
| **Running programs** | `shell_exec` runs nothing without an *execution grant*: which dev tools, which registered folder, network on/off (default **off**), for how long — minted at a native dialog, stored only as a hash, in memory only. A host that cannot isolate the network **refuses** a network-denied run rather than starting it open. |
| **Registered programs (MCP)** | Saving a new or changed program (command, arguments, network setting) needs a native confirmation; removal too. What runs is what was approved — a fingerprint is checked at every use, and a row edited afterwards stops being approved. |
| **The filesystem boundary** | Adding a workspace folder needs a native confirmation; system and credential folders are refused outright. |
| **Approvals** | A verdict needs a one-time capability minted by the native dialog: bound to one approval, one verdict, 5 minutes, stored as a hash. Self-evolution promotions consume it — the "human approved" score is *measured* from the approvals store, never assumed. |
| **Prompt spam** | One native prompt at a time; repeated declines lock prompts closed. |
| **Process containment** | `bwrap` or `unshare` (a rung is *proven* by launching a process in it, not detected by `which`), the program's own install prefix bound read-only, `/tmp` a tmpfs, `HOME` redirected into the workspace, environment scrubbed. Every run reports the rung it actually got. |
| **Peers** | Pairing and file-transfer helpers run the same egress policy as the JSON-RPC client; credentials are sent only to the origin that issued them; redirects are refused. |

Receipts are ECDSA/Ed25519-signed, hash-chained, and verifiable with zero
product state.

### Stated limits — what this does **not** claim

- **A dialog proves a human confirmed *this request*, not that it was wise.**
  Each dialog prints the exact program / host / folder it authorizes; the
  throttle makes spam fail closed. It is not an identity system: for several
  humans you would bind approvals to an authenticated principal.
- **Signing keys are still readable by the page.** The owner and issuer keys
  are used by page-side signers, so `secret_get` still returns them (provider
  keys never come back). Moving signing native — a signing oracle — is the
  follow-up. A compromised page can therefore sign as the owner while the app is
  open, and could exfiltrate those two keys.
- **The web edition has no native boundary.** The browser is the boundary there;
  keys live in page memory or the sealed vault, and cloud keys are refused for
  anything but local models. Treat the web edition as a labelled demo.
- **Containment depends on the host.** It needs unprivileged user namespaces
  (bubblewrap or util-linux `unshare`) or macOS seatbelt. Where none is proven,
  runs are reported `policy-only` — and a network-denied run is refused.
- **Private/LAN peers are refused** by the shared egress policy until an
  explicit, human-confirmed LAN opt-in exists.
- **The Rust crate's tests** run with `npm run test:rust` (needs a Rust
  toolchain and the Tauri system libraries). The TypeScript gate pins the
  source patterns; only `cargo test` executes the native code.
