#!/usr/bin/env node
/**
 * SelfImpulse — A2A v1.0 host process (17.10.7 rev 3).
 *
 *   npm run host -- --selfimpulse "USER 2" --repo /path/to/repo --test-cmd "node test.js"
 *
 * Mounts this selfimpulse on the A2A v1.0.0 wire — signed agent card at
 * /.well-known/agent-card.json, JSON-RPC 2.0 at /, the receiver ladder
 * (GuardRail → routing → this selfimpulse's gate → its own risk policy) and the
 * LiveBridge behind it (real TeamExecutor, real CLI, real git, the repository's
 * own test as the verdict, a sealed si-proof-receipt/2 on the way back).
 *
 * This entry point is a launcher, not the implementation: the engine ships as
 * the committed bundle tools/si-host-engine.mjs, byte-pinned by
 * tools/si-host-engine.sha256 and re-verified here on every start. A stale or
 * tampered bundle fails closed rather than listening.
 *
 * Run `node tools/si-host.mjs --help` for the flags.
 */
import { createHash } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const enginePath = path.join(here, "si-host-engine.mjs");
const pinPath = path.join(here, "si-host-engine.sha256");

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  process.stdout.write(`SelfImpulse A2A host — flags:
  --selfimpulse <name>            this selfimpulse's user identity (inbound packets must address it)
  --teammate "N|Title|desc|skill,skill"   repeatable; the team this selfimpulse speaks for
  --port <n>                 bind port (0 = free port; the card is signed for it)
  --host <addr>              bind address (default 127.0.0.1)
  --token <t>                shared bearer token every JSON-RPC call must carry
  --repo <path>              repository the LiveBridge executes in (required to execute)
  --test-cmd "node test.js"  the repository's own verification command
  --provider-key-env <name>  env var holding the provider key (default SI_A2A_PROVIDER_KEY)
  --harness <id>             writer harness (default hermes — the in-process runtime)
  --reviewer-harness <id>    read-only reviewer harness (default llm; must differ)
  --base-branch <name>       worktree base branch
  --timeout-secs <n>         per-seat timeout (default 120)
  --seat-mode real|drill|off real = run the seat in-process on your provider key
                                          (default; refuses if no key is set)
                             drill = deterministic local seat, labelled in every artifact
                             off = mount only; every delegation is refused in words
  --apply-fix false          drill mode: make the seat NOT fix the repo (anti-cheat path)
  --allow-risky              approve risky work at this gate (a supervised host only)
  --risk-mode <m>            high-and-critical (default) | medium-and-above | trust-sender
  --write-jwk <path>         write this selfimpulse's publisher JWK for peers to pin
  --peer-url <root>          act as sender: delegate to a peer selfimpulse
  --peer-jwk <path>          the peer's publisher JWK (required with --peer-url)
  --peer-token <t>           bearer token for the peer
  --send "task"              the task to delegate
  --tier safe|risky          declared tier (the receiver re-classifies it itself)
  --approve-sender           approve at the SENDER gate
  --exit-after-delegation    unmount and exit once the delegation settles
`);
  process.exit(0);
}

if (!existsSync(enginePath) || !existsSync(pinPath)) {
  process.stderr.write("si-host: tools/si-host-engine.mjs or its .sha256 pin is missing — run `npm run host:build`.\n");
  process.exit(2);
}
const expected = readFileSync(pinPath, "utf8").trim().split(/\s+/)[0];
const actual = createHash("sha256").update(readFileSync(enginePath)).digest("hex");
if (actual !== expected) {
  process.stderr.write(`si-host: engine bundle does not match its pin.\n  expected ${expected}\n  actual   ${actual}\nRefusing to start a listener from a bundle that is not the pinned one. Rebuild with \`npm run host:build\`.\n`);
  process.exit(2);
}

await import("./si-host-engine.mjs");
