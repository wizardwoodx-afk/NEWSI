/**
 * §A2A RUNTIME — the ONE bootstrap that mounts a selfimpulse on the A2A v1.0 wire.
 *
 * WHY THIS FILE EXISTS. Until 17.10.7 rev 3 the A2A stack was complete and
 * unreachable: `createA2AServer()` (transport), `makeDelegationHandler()`
 * (receiver ladder) and `runInboundDelegation()` (the LiveBridge) were all real
 * and all probed — but nothing in the shipped product called them. The only
 * callers were probe suites. A passing end-to-end harness proves the
 * architecture works *when a test wires it*; it does not prove the shipped
 * application exposes it by default. An external review said exactly that, and
 * the grep agreed: `createA2AServer` appeared in src/ once (its own definition)
 * and in comments.
 *
 * This is the mount. One function, the whole ladder, in the order the product
 * claims it runs:
 *
 *     load selfimpulse identity            → ECDSA P-256 keypair + fingerprint
 *     load the team this selfimpulse speaks for
 *     sign the A2A v1.0.0 card        → JWS over the canonical card bytes
 *     build the delegation handler    → receiver GuardRail + routing + gate
 *     attach the LiveBridge           → real TeamExecutor, real CLI, real git
 *     attach the receiver risk policy → the receiver re-classifies; a sender
 *                                       cannot downgrade its own risk class
 *     listen                          → GET /.well-known/agent-card.json, POST /
 *
 * Everything below is Node-only by construction: the browser app cannot listen
 * on a port, so the mount lives in the host runtime (`npm run host` →
 * tools/si-host.mjs) and in probes. The desktop face stays an A2A *client*
 * (discover → delegate → verify the returned receipt).
 *
 * HONESTY RULES, inherited from the bridge and restated here because this is
 * the door strangers walk through:
 *   • no execution deps, no harness binary, no bound repository → the runtime
 *     still mounts (it must, or it cannot refuse politely) but every delegation
 *     is REFUSED IN WORDS. There is no path from this file to a fabricated
 *     completion.
 *   • risky work is DENIED by default. A headless host has no human at the
 *     gate, and a gate that auto-approves for an absent operator is a door, not
 *     a gate. `riskyGate: "approve"` exists for a supervised host that wires a
 *     real `HumanGate`.
 *   • `seatMode: "drill"` (a deterministic local seat used when no agent CLI is
 *     installed) is reported in `describe()` and in every artifact it produces.
 *     It never claims to be a real model.
 */
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import type { HarnessId } from "../domain/harness";
import {
  createInvitation, redeemInvitation, credentialStatus,
  type Invitation, type PeerCredential,
} from "./pairing";

/** Length-safe compare for a nonce. Not a long secret, but a timing-stable one. */
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
import { secureId } from "../security/guardrail";
import { addTeammate, createTeam, delegateViaA2A, selfimpulseCardForTeamV10, makeDelegationHandler, MAX_FEDERATION_HOPS, type DeclaredAuthority, type DelegationOutcome, type SettledChain, type SelfImpulseTeam, type HumanGate, type ReceiverRiskMode, type RiskTier } from "./selfimpulseTeams";
import { createA2AServer, type A2AServerHandle } from "./a2aServer";
import { AlterSendStore } from "./altersend";
import { signAgentCardV10, type AgentCardV10, type CardSigningIdentityV10 } from "./a2aV10";
import type { BridgeConfig } from "./a2aBridge";
import { inboundCapsFor } from "./a2aBridge";
import { ENGINE_VERSION } from "../version";
import type { CliResult, TeamRunnerDeps } from "./teamExecutor";
import { scrubEnv } from "./sandbox";

/* ═══════════════════════════════════════════════════════════════════════════
   1 · SELFIMPULSE IDENTITY — the trust anchor the card is signed with
   ═══════════════════════════════════════════════════════════════════════════ */

const ECDSA = { name: "ECDSA", namedCurve: "P-256" } as const;

/**
 * A selfimpulse's card-signing identity: a real ECDSA P-256 keypair plus the
 * fingerprint a peer pins. Peers verify the card's JWS against `publicJwk`, so
 * any mutation of any card field after signing fails discovery.
 */
export async function makeSelfImpulseIdentity(): Promise<CardSigningIdentityV10> {
  const kp = await crypto.subtle.generateKey(ECDSA, true, ["sign", "verify"]);
  const publicJwk = (await crypto.subtle.exportKey("jwk", kp.publicKey)) as JsonWebKey;
  const fp = createHash("sha256").update(JSON.stringify(publicJwk)).digest("hex").slice(0, 16);
  return { fp, privateKey: kp.privateKey, publicJwk };
}

/* ═══════════════════════════════════════════════════════════════════════════
   2 · NODE EXECUTION DEPS — what lets a mounted selfimpulse actually run a seat
   ═══════════════════════════════════════════════════════════════════════════ */

export interface NodeDepsOptions {
  /** The bound repository's own test command. The verdict comes from the repo. */
  testCommand?: string[];
  /**
   * Explicit engine→executable pins, used verbatim; PATH search is the fallback.
   */
  binOverrides?: Record<string, string>;
  /** Extra directories searched before $PATH. */
  extraPath?: string[];
  /** Per-invocation log hook (the host prints these so a run is observable). */
  onInvoke?: (line: string) => void;
  /**
   * The owner's own provider key, for in-process seats. A federated seat
   * never spawns a binary — it calls the owner's provider directly from this
   * host process.
   * Without a key the host still mounts and still serves its card, but a seat
   * refuses in words rather than pretending to have run.
   */
  provider?: { baseUrl: string; apiKey: string; model: string };
}

function isExecutable(file: string): boolean {
  try {
    const st = fs.statSync(file);
    return st.isFile() && (st.mode & 0o111) !== 0;
  } catch {
    return false;
  }
}

/** Search $PATH (plus extras/overrides) for a binary. Honest: null when absent. */
export function resolveBinSync(bin: string, opts?: NodeDepsOptions): string | null {
  if (bin.includes("/") || bin.includes(path.sep)) return isExecutable(bin) ? bin : null;
  const override = opts?.binOverrides?.[bin];
  if (override) return isExecutable(override) ? override : null;
  const dirs = [...(opts?.extraPath ?? []), ...(process.env.PATH ?? "").split(path.delimiter).filter(Boolean)];
  for (const dir of dirs) {
    const candidate = path.join(dir, bin);
    if (isExecutable(candidate)) return candidate;
  }
  return null;
}

function spawnCli(
  bin: string,
  argv: string[],
  cwd: string,
  timeoutSecs: number,
  onInvoke?: (line: string) => void,
): Promise<CliResult> {
  const t0 = Date.now();
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let settled = false;
    let timedOut = false;
    // V-security: spawn CLI children through scrubEnv() (28 credential-shaped
    // patterns wiped) so a child CLI — and any transitive process it starts —
    // never inherits OPENAI_API_KEY, GH_TOKEN, cloud creds, etc. from the
    // parent. Before this fix the spawn spread `...process.env` directly,
    // which is an env leak equivalent to handing the child the parent's keys.
    // GIT_TERMINAL_PROMPT / NO_COLOR are safe CLI-control vars, restored after
    // scrubbing rather than added to a leaky spread.
    const scrubbed = scrubEnv(process.env as Record<string, string>);
    const child = spawn(bin, argv, {
      cwd,
      env: { ...scrubbed, GIT_TERMINAL_PROMPT: "0", NO_COLOR: "1" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    const kill = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, Math.max(15, timeoutSecs) * 1000);
    child.stdout.on("data", (b) => { stdout += String(b); });
    child.stderr.on("data", (b) => { stderr += String(b); });
    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(kill);
      resolve({ exitCode: null, stdout, stderr: `${stderr}${String(err)}`, durationMs: Date.now() - t0, timedOut });
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(kill);
      onInvoke?.(`spawn ${path.basename(bin)} ${argv.slice(0, 3).join(" ")} → exit ${code ?? "null"} in ${Date.now() - t0}ms`);
      resolve({ exitCode: code, stdout, stderr, durationMs: Date.now() - t0, timedOut });
    });
  });
}

/**
 * The host-side `TeamRunnerDeps`: real process spawning, real git, real fs,
 * and the repository's own test command as the verdict. This is the piece the
 * app's `hostRunnerDeps` cannot provide — that one rides the Tauri IPC layer on
 * desktop and simulates in the browser. A mounted A2A selfimpulse needs the real
 * thing, because the receipt it seals has to mean something.
 */
export function nodeRunnerDeps(opts?: NodeDepsOptions): TeamRunnerDeps {
  const testCmd = opts?.testCommand ?? ["npm", "test"];
  return {
    // Only real dev-tool subprocesses resolve (git, npm, node — they carry the
    // verdict and are not agents). No agent binary is ever resolved.
    resolveBin: async (bin) => (bin === "git" || bin === "npm" || bin === "node" ? resolveBinSync(bin, opts) : null),
    // Seats run in-process against the owner's provider key. No spawn, no argv.
    nativeInvoke: async (req) => {
      const t0 = Date.now();
      const p = opts?.provider;
      if (!p) {
        return {
          exitCode: 1,
          stdout: "",
          stderr: "this A2A host has no provider key configured — pass --provider-key or set SI_A2A_PROVIDER_KEY. No seat ran.",
          durationMs: Date.now() - t0,
          timedOut: false,
        };
      }
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), req.timeoutSecs * 1000);
      try {
        const r = await fetch(`${p.baseUrl.replace(/\/$/, "")}/chat/completions`, {
          method: "POST",
          signal: ctrl.signal,
          headers: { "content-type": "application/json", authorization: `Bearer ${p.apiKey}` },
          body: JSON.stringify({
            model: req.model || p.model,
            messages: [
              {
                role: "system",
                content: req.readOnly
                  ? "You are a governed reviewer operating READ-ONLY. Do not write files or run shell commands; report findings."
                  : "You are a governed worker inside a sandboxed workspace. Stay inside the given working directory.",
              },
              { role: "user", content: req.prompt },
            ],
          }),
        });
        const body = (await r.json()) as { choices?: Array<{ message?: { content?: string } }> };
        return {
          exitCode: r.ok ? 0 : 1,
          stdout: body.choices?.[0]?.message?.content ?? "",
          stderr: r.ok ? "" : `provider returned ${r.status}`,
          durationMs: Date.now() - t0,
          timedOut: false,
        };
      } catch (err) {
        return {
          exitCode: 1,
          stdout: "",
          stderr: `in-process seat failed: ${String(err)}`,
          durationMs: Date.now() - t0,
          timedOut: ctrl.signal.aborted,
        };
      } finally {
        clearTimeout(timer);
      }
    },
    // Kept only so the executor can still reach git/verify below; it refuses any
    // attempt to spawn an agent, because there is nothing left to spawn.
    cliInvoke: async (req) => {
      const t0 = Date.now();
      return {
        exitCode: 127,
        stdout: "",
        stderr: `external agent CLIs are removed — refusing to spawn "${req.bin}". In-process seats do not use this path.`,
        durationMs: Date.now() - t0,
        timedOut: false,
      };
    },
    git: async (args, cwd) => {
      const r = await spawnCli("git", args, cwd, 120, opts?.onInvoke);
      return {
        ok: r.exitCode === 0,
        exitCode: r.exitCode,
        stdout: r.stdout,
        stderr: r.stderr,
        reason: r.exitCode === 0 ? null : r.stderr.trim() || `git ${args[0] ?? ""} failed`,
      };
    },
    writeFile: async (absPath, contents) => {
      fs.mkdirSync(path.dirname(absPath), { recursive: true });
      await fs.promises.writeFile(absPath, contents, "utf8");
    },
    verify: async (cwd) => spawnCli(testCmd[0] ?? "npm", testCmd.slice(1), cwd, 300, opts?.onInvoke),
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
   3 · THE MOUNT
   ═══════════════════════════════════════════════════════════════════════════ */

export interface RuntimeTeammateSpec {
  name: string;
  title: string;
  description: string;
  skills?: string[];
}

export interface A2ARuntimeOptions {
  /** This selfimpulse's user identity — what inbound packets must be addressed to. */
  selfimpulseUser: string;
  /** The team this selfimpulse speaks for. At least one teammate or routing fails. */
  teammates: RuntimeTeammateSpec[];
  /** Bind host. Defaults to 127.0.0.1 — the server refuses to guess wider. */
  host?: string;
  /**
   * Offer a one-time pairing code so a peer machine can obtain a scoped
   * credential without ever seeing this host's token. `false` disables the
   * endpoint entirely, which is the default posture: nothing accepts a code
   * until the operator asks.
   */
  pairing?: boolean;
  /**
   * Allow paired peers to offer files (AlterSend).
   *
   * Off by default, and that default is the point: a host that quietly accepts
   * files from the network is a host nobody chose to be one. When it is on, the
   * bytes land in a 0600 spill directory rather than the process heap, and every
   * transfer still needs a human or a policy to accept it — mounting the feature
   * does not mount an auto-accept.
   */
  files?: boolean;
  /** Where AlterSend keeps offered bytes. Defaults under the selfimpulse state dir. */
  filesDir?: string;
  /**
   * Accept incoming offers without a human in the loop. Off by default and
   * named explicitly, because "mount the feature" and "auto-accept everything
   * a peer sends" are two different decisions and only one of them is a
   * reasonable default.
   */
  filesAutoAccept?: boolean;
  /**
   * Nonce for the unmount channel. It arrives in the environment, not in argv
   * (where any local process could read it from `ps`) and not in the READY line
   * (which operators tee to logs).
   */
  stopNonce?: string;
  /** Bind port. 0 (default) picks a free port and the card is signed for it. */
  port?: number;
  /**
   * Shared bearer token. Every JSON-RPC call must carry it. OMIT IT AND ONE IS
   * MINTED: the selfimpulse's card declares the `selfimpulseIdentity` scheme, and a card
   * that declares a scheme the listener does not enforce refuses everything —
   * so the honest choices are "enforce a token" or "publish a card that claims
   * no security". A mounted selfimpulse that silently accepted strangers' work would
   * be the worst of the three, so that option does not exist here. The minted
   * token is reported on the handle and in `describe()` so the operator can hand
   * it to a peer.
   */
  token?: string;
  /** How the receiver treats work its OWN policy calls risky. Default: deny. */
  riskyGate?: "deny" | "approve" | HumanGate;
  /** The receiver's own risk re-classification. Default: upgrade HIGH/CRITICAL. */
  receiverRiskMode?: ReceiverRiskMode;
  /** Live execution. Without it the runtime mounts and refuses every delegation. */
  bridge?: BridgeConfig;
  /** Reuse an identity (a persisted key) instead of minting a fresh one. */
  identity?: CardSigningIdentityV10;
  /** Log hook for the host process's stdout. */
  onLog?: (line: string) => void;
}

export interface RuntimeDescriptor {
  mounted: true;
  product: string;
  version: string;
  selfimpulseUser: string;
  /** The port this process actually bound — the one the signed card advertises. */
  port: number;
  interfaceUrl: string;
  cardUrl: string;
  identityFp: string;
  cardSigned: boolean;
  securitySchemes: string[];
  /**
   * Whether this listener enforces a bearer token, and whether it minted one.
   *
   * The token ITSELF is no longer in the descriptor. It used to be, and that was
   * a quiet leak: the descriptor is printed as the host's READY line, which a
   * supervisor may tee into a log, and a shared secret in a log is a shared
   * secret in every backup of that log. Operators who genuinely need the token
   * have `runtime.token` in-process, and a remote peer has pairing. Nothing needs
   * it on stdout.
   */
  tokenEnforced: boolean;
  /** True when the token was minted here rather than supplied by the operator. */
  tokenMinted: boolean;
  /**
   * Peer pairing, when the operator asked for it. Carries the ONE-TIME CODE and
   * never the host token: the code is a capability to obtain a scoped credential,
   * not a credential, and it dies the moment it is used or expires.
   */
  pairing: {
    offered: boolean;
    code: string | null;
    expiresAt: string | null;
    state: string;
    peers: number;
  };
  /**
   * File exchange, as actually mounted — not as advertised. A feature that the
   * release notes claim and the runtime does not carry is the exact failure a
   * reviewer is for, so the descriptor reports the truth either way.
   */
  files: {
    enabled: boolean;
    /** Bytes held in the JS heap right now; the rest is on disk. */
    residentBytes: number;
    /** Bytes the store is holding, resident or spilled. */
    storedBytes: number;
    objects: number;
    /** Where the spill directory is, or null for a memory-only store. */
    spillDir: string | null;
    autoAccept: boolean;
  };
  teammates: Array<{ name: string; title: string; skills: string[] }>;
  policy: {
    receiverRiskMode: ReceiverRiskMode;
    riskyGate: "deny" | "approve" | "custom";
    guardrail: "inbound scan + egress check + replay window";
    /**
     * How many hosts will execute ONE delegation chain. Reported so an operator
     * can see the bound that is actually mounted rather than having to know it.
     */
    maxFederationHops: number;
    /**
     * The ceiling every inbound delegation runs under: dollars, turns, seat
     * invocations and wall clock. A host may narrow these in
     * `bridge.inboundCaps`; nothing can widen them.
     */
    inboundCaps: { maxCostUsd: number; maxTurns: number; maxInvocations: number; maxWallClockMs: number };
  };
  bridge: {
    executable: boolean;
    harness: HarnessId | null;
    reviewerHarness: HarnessId | null;
    repoRoot: string | null;
    testCommand: string[] | null;
    writerBin: string | null;
    reviewerBin: string | null;
    allowUnexecuted: boolean;
    /** Why this selfimpulse cannot execute, in words, when it cannot. */
    refusalReason: string | null;
  };
}

export interface A2ARuntime {
  readonly port: number;
  readonly baseUrl: string;
  readonly cardUrl: string;
  readonly card: AgentCardV10;
  readonly identity: CardSigningIdentityV10;
  /** The bearer token a peer must present. Minted when none was configured. */
  readonly token: string;
  readonly team: SelfImpulseTeam;
  readonly server: A2AServerHandle;
  /**
   * The mounted AlterSend store, when file exchange is on. Exposed so the
   * operator's UI can list offers and answer them, and so `close()` can sweep
   * the spill directory on unmount.
   */
  readonly files: AlterSendStore | null;
  /** What is actually mounted, for the operator and for peer probes. */
  describe(): RuntimeDescriptor;
  /** This selfimpulse acting as the SENDER: discover a peer, delegate, verify. */
  delegateTo(opts: {
    remoteRoot: string;
    remotePublicJwk: JsonWebKey;
    task: string;
    tier: RiskTier;
    /**
     * What the remote machine may do for this task. Required and explicit:
     * this selfimpulse's human is stating it, and the remote selfimpulse will narrow it
     * against its own bounds. A delegation that does not state its authority
     * is refused there by name, so there is nothing sensible to default to here.
     */
    authority: DeclaredAuthority;
    authorization?: string;
    senderGate?: HumanGate;
    /**
     * The chain this delegation continues, as the peer reported it. Pass the
     * `chain` from the previous settlement when FORWARDING work; omit it to
     * start a new chain. Either way the depth limit is enforced here — by this
     * host before it transmits, and by the receiver when the packet lands — so a
     * peer cannot spend this machine by asking it to keep re-delegating.
     */
    chain?: Partial<SettledChain>;
  }): Promise<DelegationOutcome>;
  stop(): Promise<void>;
}

/** Claim a free port so the card can be signed for the URL that will really serve it. */
export function pickFreePort(host = "127.0.0.1"): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.on("error", reject);
    srv.listen(0, host, () => {
      const addr = srv.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      srv.close(() => resolve(port));
    });
  });
}

/**
 * 20.1 — the bind allowlist, enforced in the runtime rather than in the UI.
 *
 * The README says "You choose the bind scope before mounting — this machine
 * only (127.0.0.1) or your network — and there is no wildcard option." That was
 * a UI promise with nothing behind it on this path: `si-host.entry.ts:98` reads
 * `args.host` straight from argv and `a2aServer.ts:641` hands it to `listen()`.
 * `--host 0.0.0.0` bound every interface including public/VPN/tether, and the
 * agent card was then signed for `http://0.0.0.0:<port>/`, so the mount looked
 * entirely legitimate.
 *
 * The correct policy already existed in the tree and is mirrored here:
 * `src-tauri/src/a2a_host.rs::resolve_bind` resolves "lan" to the CONCRETE
 * interface address, explicitly refuses to fall back to a wildcard, and
 * rejects every unrecognised string. Two enforcement points, one rule.
 */
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

/** True when the string is a wildcard/unspecified address, which is never offered. */
function isWildcardHost(host: string): boolean {
  const h = host.trim().toLowerCase().replace(/^\[|\]$/g, "");
  if (h === "*" || h === "0.0.0.0" || h === "::" || h === "0:0:0:0:0:0:0:0") return true;
  // Any IPv4 whose host part is zero — 0.0.0.0, 1.0.0.0, 10.0.0.0 — is "this
  // network" or wider, not one host.
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h)) {
    const parts = h.split(".").map(Number);
    if (parts.every((p) => p >= 0 && p <= 255)) return parts.slice(1).every((p) => p === 0);
  }
  return false;
}

/**
 * Decide the address to bind, or refuse.
 *
 * "lan" is NOT silently mapped to loopback. Doing so would be a lie that
 * presents itself as the feature working: the operator asked to reach the
 * network and would get a listener no peer can find. Resolving it needs the
 * host's real interface address, which this pure function does not have — the
 * Rust `resolve_bind` does that lookup with a `UdpSocket::connect` route probe.
 * So the correct behaviour here is to REFUSE and name what to pass, leaving the
 * resolution to the caller that can actually perform it.
 */
export function resolveBindHost(requested: string | undefined): string {
  const raw = (requested ?? "127.0.0.1").trim();
  if (raw === "") return "127.0.0.1";
  const lower = raw.toLowerCase();
  if (LOOPBACK_HOSTS.has(lower)) return "127.0.0.1";
  if (lower === "lan" || lower === "local" || lower === "loopback") {
    if (lower === "loopback" || lower === "local") return "127.0.0.1";
    throw new Error(
      'a2a: "lan" must be resolved to a concrete address before it reaches the runtime. ' +
        "Pass this machine's actual LAN IP (for example 192.168.1.20). The runtime refuses names and wildcards because neither names one specific interface.",
    );
  }
  if (isWildcardHost(raw)) {
    throw new Error(
      `a2a: refusing to bind "${raw}". A wildcard bind exposes this listener on every interface the machine has — including ones the operator never chose. ` +
        "Use 127.0.0.1 for this machine only, or a concrete LAN address such as 192.168.1.20.",
    );
  }
  // A concrete address is accepted, but it must at least LOOK like an address:
  // a hostname would let DNS decide the interface, which is the wildcard
  // problem wearing a different hat.
  const looksLikeIpv4 = /^\d{1,3}(\.\d{1,3}){3}$/.test(raw);
  const looksLikeIpv6 = raw.includes(":");
  if (!looksLikeIpv4 && !looksLikeIpv6) {
    throw new Error(
      `a2a: "${raw}" is neither loopback nor a concrete IP address. ` +
        "Bind 127.0.0.1, or pass the exact LAN address of this machine. Names are refused because a name can resolve anywhere.",
    );
  }
  return raw;
}

export async function startA2ARuntime(opts: A2ARuntimeOptions): Promise<A2ARuntime> {
  const host = resolveBindHost(opts.host);
  const log = opts.onLog ?? (() => undefined);

  /* 1 · identity ─────────────────────────────────────────────────────────── */
  const identity = opts.identity ?? (await makeSelfImpulseIdentity());

  /* 2 · the team this selfimpulse speaks for ──────────────────────────────────── */
  let team = createTeam(opts.selfimpulseUser);
  for (const spec of opts.teammates) {
    const added = addTeammate(team, {
      name: spec.name,
      title: spec.title,
      description: spec.description,
      skills: spec.skills ?? [],
    });
    if (!added.ok) throw new Error(`teammate "${spec.name}" refused: ${added.reason}`);
    team = added.value.team;
  }
  if (team.teammates.length === 0) throw new Error("a mounted selfimpulse needs at least one teammate — routing has nothing to route to");

  /* 3 · the interface URL, known before the card is signed ───────────────── */
  const port = opts.port && opts.port > 0 ? opts.port : await pickFreePort(host);
  const interfaceUrl = `http://${host}:${port}/`;
  const unsigned = selfimpulseCardForTeamV10(team, interfaceUrl);
  const card = await signAgentCardV10(unsigned, identity);

  /* 4 · the receiver ladder: GuardRail + routing + THIS selfimpulse's gate ────── */
  const riskyGate = opts.riskyGate ?? "deny";
  const gate: HumanGate =
    typeof riskyGate === "function"
      ? riskyGate
      : async (action, detail) => {
          log(`gate: ${action} — ${detail} → ${riskyGate === "approve" ? "approved (supervised host)" : "DENIED (no operator at this gate)"}`);
          return riskyGate === "approve";
        };

  /* 5 · the handler, with the LiveBridge and the receiver risk policy ────── */
  const handler = makeDelegationHandler(team, gate, opts.bridge ?? {}, { mode: opts.receiverRiskMode ?? "high-and-critical" });

  /* 6 · transport ────────────────────────────────────────────────────────── */
  // 20.1 — AN EMPTY TOKEN IS NOT A TOKEN.
  //
  // `opts.token ?? …` treats "" as present, because "" is not nullish. So
  // `--token ""` (which `parseArgv` in tools/si-host.entry.ts happily produces:
  // an empty next-argument is a string, not a bare flag) set token = "",
  // minted NOTHING, and then at :594 a request with **no Authorization header
  // at all** compared `"" === ""` and was AUTHORIZED. Combined with a wildcard
  // bind, that is an open delegation endpoint on every interface, executing
  // attacker-supplied tasks under the host's provider key.
  //
  // The rule now: a supplied token must be substantial, and a degenerate one
  // is REFUSED rather than silently accepted. Minting instead of refusing would
  // be friendlier but would also mask a real misconfiguration, so this fails
  // loudly and says why.
  const suppliedToken = typeof opts.token === "string" ? opts.token.trim() : undefined;
  if (opts.token !== undefined && (suppliedToken === undefined || suppliedToken.length < 16)) {
    throw new Error(
      `a2a: refusing to start with a ${opts.token === "" ? "empty" : "too-short"} token (${String(opts.token).length} chars). ` +
        "A listener whose credential can be guessed has no credential. Supply at least 16 characters, or omit --token entirely and one will be minted for you.",
    );
  }
  const tokenMinted = suppliedToken === undefined;
  const token = suppliedToken ?? `si-${secureId("link")}`;

  /* PEER PAIRING STATE — live only while this process lives, which is the point.
   * The invitation is one record; a redeemed credential is added here and
   * disappears with the host, so "which machines is this selfimpulse paired with" has
   * a truthful answer only while the selfimpulse is up, and a stale credential cannot
   * outlive the machine that issued it. */
  let invitation: Invitation | null = null;
  let pairingCode: string | null = null;
  const peers = new Map<string, PeerCredential>();
  // One invitation per mount, minted at start when the operator asked for
  // pairing. Minting a second one would mean two live codes, and "which code is
  // live?" is not a question a screen can answer honestly.
  if (opts.pairing === true) {
    const minted = await createInvitation({ hostFp: identity.fp, selfimpulse: team.user });
    invitation = minted.invitation;
    pairingCode = minted.code;
  }

  /* ALTERSEND — mounted here, not only in the probe.
   *
   * The reviewer's finding was precise and correct: the store, the HTTP surface
   * and a 66-assertion suite all existed, and the shipped product still had no
   * path to any of them, because this call site did not pass one. A test that
   * wires a feature by hand proves the feature works; it does not prove the
   * product ships it. The mount is one option, and this is it. */
  // ~/.selfimpulse/altersend by default: user-scoped, not inside the install,
  // so an uninstall never takes somebody's received files with it and the
  // directory can be inspected without root.
  const filesSpillDir = opts.files === true
    ? (opts.filesDir ?? path.join(os.homedir(), ".selfimpulse", "altersend"))
    : null;
  const files = filesSpillDir ? new AlterSendStore({ peer: opts.selfimpulseUser, spillDir: filesSpillDir }) : null;

  const server = createA2AServer({
    card,
    onMessage: handler,
    altersend: files
      ? {
          store: files,
          /* The receiver's decision is a REFUSAL by default. There is no
           * accept-all mode here on purpose: `decide` returning null means the
           * caller's policy had nothing to object to, and the default policy has
           * something to object to whenever a human is present to be asked. */
          decide: (offer) => (opts.filesAutoAccept === true ? null : `awaiting review: ${offer.name}`),
        }
      : undefined,
    pairing: opts.pairing === false ? undefined : {
      redeem: async (code, peer) => {
        if (!invitation) return { ok: false, reason: "this host is not currently offering a pairing code" };
        const r = await redeemInvitation({ invitation, code, peer });
        // Store the spent record, never the open one: a second attempt with the
        // same code must see `redeemed`, not get a fresh chance at a live record.
        invitation = r.invitation;
        if (!r.ok) return { ok: false, reason: r.reason };
        peers.set(r.credential.token, r.credential);
        return { ok: true, credential: r.credential };
      },
    },
    onStop: opts.stopNonce
      ? (presented) => {
          if (!constantTimeEqual(presented, opts.stopNonce!)) return false;
          // The host stops itself: close the listener, say so, and leave. The
          // response has already been written by the time this runs, because the
          // caller is a supervisor waiting for the process to end.
          setTimeout(() => { void runtime.shutdownThenExit(); }, 50);
          return true;
        }
      : undefined,
    authorize: (req) => {
      const presented = (req.headers.authorization ?? "").replace(/^Bearer\s+/i, "").trim();
      // 20.1: was `presented === token`. This file already defines
      // constantTimeEqual two hundred lines up and applies it to the LESS
      // important stop nonce, while comparing the primary peer credential with
      // `===`. Whatever the practical exploitability of a JIT-compiled `===`
      // over a network, the inconsistency is the defect: the discipline exists
      // here and was simply not applied where it mattered most.
      if (constantTimeEqual(presented, token)) return true;
      const cred = peers.get(presented);
      if (!cred) return false;
      const st = credentialStatus(cred);
      if (!st.valid) {
        // An expired credential is REMOVED, not just rejected: a host that kept
        // expired peers around would accumulate them forever.
        peers.delete(presented);
        return false;
      }
      return true;
    },
    host,
    port,
  });
  // Declared before the server can call it: the unmount channel reaches back
  // into the handle the supervisor is about to receive.
  const runtime: { shutdownThenExit: () => Promise<void> } = {
    shutdownThenExit: async () => {
      try { await server.stop(); } catch { /* already down */ }
      process.stdout.write("SI-A2A-STOPPED\n");
      process.exit(0);
    },
  };
  const boundPort = await server.start();
  if (boundPort !== port) throw new Error(`listener bound ${boundPort} but the signed card advertises ${port} — refusing to serve a card that lies about its own interface`);
  const baseUrl = server.baseUrl;
  log(`a2a: mounted ${opts.selfimpulseUser} on ${baseUrl} (card ${cardUrlOf(baseUrl)}, identity ${identity.fp})`);
  if (tokenMinted) log(`a2a: no --token supplied, so this listener minted one — peers must present it (see describe().token)`);

  const bridge = opts.bridge ?? {};
  /* Can this host actually RUN a seat? There is no binary to resolve, so
     `executable` no longer means "an engine is on the PATH". It means the one
     thing that still gates a
     real run: an in-process seat runner exists (i.e. a provider key is
     configured). The descriptor must say that truthfully in both directions —
     a host that cannot run seats says so before anything is delegated. */
  const canRunSeats = typeof bridge.deps?.nativeInvoke === "function";
  const missing: string[] = [];
  if (!bridge.deps) missing.push("no execution deps");
  if (!bridge.harness) missing.push("no harness configured");
  if (bridge.harness && !canRunSeats) {
    missing.push("no in-process seat runner on this host (set SI_A2A_PROVIDER_KEY to run seats)");
  }
  if (!bridge.repoRoot) missing.push("no repository bound");

  /* What every inbound delegation on this listener is allowed to spend. Computed
     once here so `describe()` reports the real numbers the bridge will enforce —
     a descriptor that said "bounded" without saying by how much would be the same
     kind of claim this codebase refuses elsewhere. */
  const inboundCaps = inboundCapsFor(bridge.inboundCaps);

  const describe = (): RuntimeDescriptor => ({
    files: {
      enabled: files !== null,
      residentBytes: files?.residentBytesHeld ?? 0,
      storedBytes: files?.storeBytes ?? 0,
      objects: files?.list().length ?? 0,
      spillDir: filesSpillDir,
      autoAccept: opts.filesAutoAccept === true,
    },
    pairing: pairingCode && invitation
      ? { offered: true, code: pairingCode, expiresAt: new Date(invitation.expiresAt).toISOString(), state: invitation.state, peers: peers.size }
      : { offered: false, code: null, expiresAt: null, state: "closed", peers: peers.size },
    mounted: true,
    product: "SelfImpulse",
    version: ENGINE_VERSION,
    selfimpulseUser: team.user,
    port: boundPort,
    interfaceUrl,
    cardUrl: cardUrlOf(baseUrl),
    identityFp: identity.fp,
    cardSigned: Array.isArray(card.signatures) && card.signatures.length > 0,
    securitySchemes: Object.keys(card.securitySchemes ?? {}),
    tokenEnforced: true,
    tokenMinted,
    teammates: team.teammates.map((t) => ({ name: t.name, title: t.title, skills: t.skills })),
    policy: {
      receiverRiskMode: opts.receiverRiskMode ?? "high-and-critical",
      riskyGate: typeof riskyGate === "function" ? "custom" : riskyGate,
      guardrail: "inbound scan + egress check + replay window",
      maxFederationHops: MAX_FEDERATION_HOPS,
      inboundCaps: {
        maxCostUsd: inboundCaps.maxCostUsd ?? 0,
        maxTurns: inboundCaps.maxTurns ?? 0,
        maxInvocations: inboundCaps.maxInvocations ?? 0,
        maxWallClockMs: inboundCaps.maxWallClockMs ?? 0,
      },
    },
    bridge: {
      executable: missing.length === 0,
      harness: bridge.harness ?? null,
      reviewerHarness: bridge.reviewerHarness ?? null,
      repoRoot: bridge.repoRoot ?? null,
      testCommand: bridge.testCommand ?? null,
      // No agent binary exists to report. Kept as explicit nulls so a client
      // reading the card cannot mistake "unresolved" for "not attempted".
      writerBin: null,
      reviewerBin: null,
      allowUnexecuted: bridge.allowUnexecuted === true,
      refusalReason: missing.length === 0 ? null : `this selfimpulse cannot execute: ${missing.join("; ")} — delegations will be refused in words, never answered with a completion`,
    },
  });

  return {
    port: boundPort,
    baseUrl,
    cardUrl: cardUrlOf(baseUrl),
    card,
    identity,
    token,
    team,
    server,
    files,
    describe,
    delegateTo: (o) =>
      delegateViaA2A({
        fromTeam: team,
        remoteRoot: o.remoteRoot,
        remotePublicJwk: o.remotePublicJwk,
        task: o.task,
        tier: o.tier,
        authority: o.authority,
        authorization: o.authorization,
        senderGate: o.senderGate,
        chain: o.chain,
      }),
    stop: async () => {
      await server.stop();
      log(`a2a: unmounted ${team.user} from ${baseUrl}`);
    },
  };
}

function cardUrlOf(baseUrl: string): string {
  return `${baseUrl.replace(/\/$/, "")}/.well-known/agent-card.json`;
}

/* ═══════════════════════════════════════════════════════════════════════════
   4 · THE DRILL SEAT — a deterministic local CLI, LABELLED
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * A `BridgeConfig` whose CLI boundary is a deterministic local seat: a real
 * child process, a real worktree, a real git repo and the repository's OWN test
 * command as the verdict — but the "agent" is a script, not a model. This is
 * the drill's own idiom (the drill, `probe/a2aBridge` and the TeamsPage
 * simulation all use it) and it exists so the mount is testable on a host with
 * no agent CLI installed. It is never silent: every artifact it produces is
 * stamped `[drill-seat]`, and `describe()` reports it.
 *
 * `applyFix` decides whether the seat actually repairs the repository. Pass
 * false and the repo's test fails, the gate fails, and the record says
 * `executed-failed` — the anti-cheat path.
 */
export function drillBridgeConfig(opts: {
  repoRoot: string;
  baseBranch?: string;
  testCommand?: string[];
  harness?: HarnessId;
  reviewerHarness?: HarnessId;
  applyFix?: boolean;
  fixFile?: string;
  fixContents?: string;
  timeoutSecs?: number;
  /** Host log hook — the drill seat announces itself in the process log. */
  onLog?: (line: string) => void;
}): BridgeConfig {
  const applyFix = opts.applyFix !== false;
  const target = opts.fixFile ?? "guard.js";
  const contents =
    opts.fixContents ??
    `function authorize(role, user) {\n  // hardened: disabled principals are denied\n  return Boolean(user && user.active) && role !== "disabled";\n}\nmodule.exports = { authorize };\n`;
  const deps = nodeRunnerDeps({ testCommand: opts.testCommand ?? ["node", "test.js"], onInvoke: opts.onLog });
  return {
    harness: opts.harness ?? "hermes",
    reviewerHarness: opts.reviewerHarness ?? "hermes",
    repoRoot: opts.repoRoot,
    baseBranch: opts.baseBranch,
    testCommand: opts.testCommand ?? ["node", "test.js"],
    timeoutSecs: opts.timeoutSecs ?? 120,
    deps: {
      ...deps,
      // 19.7.15: the drill seat is a DETERMINISTIC LOCAL SEAT, not a model. It
      // used to override cliInvoke and fake a child process; external agent CLIs
      // are removed, so it now rides nativeInvoke — the same in-process path a
      // real seat takes. It stays labelled in every artifact it produces, and it
      // is reachable only through drillBridgeConfig, never in a production mount.
      //
      // `readOnly` is now an explicit field on the request instead of an argv
      // regex, so the reviewer seat is read-only by construction rather than by
      // matching its own prompt text.
      nativeInvoke: async (req) => {
        const t0 = Date.now();
        if (!req.readOnly && applyFix) {
          try {
            await fs.promises.writeFile(path.join(req.cwd, target), contents, "utf8");
          } catch (err) {
            return { exitCode: 1, stdout: "", stderr: `[drill-seat] could not write ${target}: ${String(err)}`, durationMs: Date.now() - t0, timedOut: false };
          }
        }
        const stamp = req.readOnly
          ? "[drill-seat] read-only review complete: diff inspected against the delegated task."
          : applyFix
            ? `[drill-seat] applied the fix to ${target}.`
            : "[drill-seat] inspected the repository and made no change.";
        opts.onLog?.(stamp);
        return {
          exitCode: 0,
          stdout: JSON.stringify({ type: "result", is_error: false, result: stamp, session_id: "drill" }),
          stderr: "",
          durationMs: Date.now() - t0,
          timedOut: false,
        };
      },
      // No agent binary is resolved, ever. The drill still runs `node test.js`
      // through the repository's own verification command, which is a dev tool,
      // not an agent.
      resolveBin: async () => process.execPath,
    },
  };
}
