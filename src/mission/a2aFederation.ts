/**
 * A2A FEDERATION — the reachable door.
 *
 * WHY A SEPARATE FILE, stated up front because it is a decision with a cost.
 *
 * `tools/si-host-engine.mjs` is a COMMITTED, byte-pinned bundle of
 * `tools/si-host.entry.ts` and its dependency graph, and
 * `probe/a2aRuntime.test.ts` holds that pin by rebuilding the engine and
 * comparing it byte-for-byte. That pin is a real property — the desktop launcher
 * re-verifies the bundle's SHA-256 before it will listen — and it means ANY edit
 * inside the engine's graph obliges the bundle to be regenerated. Since `tools/`
 * belongs to another owner, this file is deliberately OUTSIDE that graph: nothing
 * in `si-host.entry.ts` imports it, so the committed bundle and its pin are
 * untouched by anything here. The price is stated plainly in §5 below — the
 * desktop host process keeps running the pinned build until somebody who owns
 * `tools/` runs `npm run host:build`. This module is reachable from any Node
 * caller: the host entry, a probe, an MCP tool, or a future in-app bridge.
 *
 * THE GAP THIS CLOSES, as a defect rather than a feature.
 *
 * `startA2ARuntime` (src/mission/a2aRuntime.ts) is a complete, probed mount, and
 * `delegateViaA2A` / `discoverAgentCard` are a complete, probed delegation ladder
 * — and the shipped product had no name for the thing a caller actually wants:
 * mount me, prove a peer, then cross. The architecture was real; the app could
 * mount a listener and then do nothing with it. An external review called the
 * Federation screen decorative, and on the crossing half that was correct.
 *
 * So this composes rather than reimplements. `mountFederation` is
 * `startA2ARuntime` plus the three things it cannot express alone:
 *
 *   · a BIND SCOPE that RESOLVES, so `local` / `lan` are real choices instead of
 *     a refusal (see `resolveBindScope`);
 *   · a PEER that is unauthorised until its card verifies against a PINNED
 *     publisher key, and a crossing that refuses an unauthorised peer WITHOUT
 *     opening a socket;
 *   · a STEP LEDGER, so every call reports what it did and what it refused,
 *     bounded, because honest state that grows without limit is not honest state.
 *
 * IT RELAXES NOTHING. The bind allowlist still decides and a wildcard is still
 * refused (`resolveBindHost` is the last word); the egress guard still runs
 * inside `discoverAgentCard`; the receiver still re-classifies the sender's tier,
 * denies risky work with no real gate, dedupes replays, counts its own hops
 * against `MAX_FEDERATION_HOPS`, bounds inbound spend with `inboundCapsFor`, and
 * refuses an unnamed authority. This file adds a caller, not a privilege.
 *
 * FAIL-CLOSED, as the three rules the code below actually enforces:
 *
 *   1. an unauthorised peer cannot cause a crossing — `cross()` refuses on a map
 *      lookup, before any network call, so there is no packet left to clean up;
 *   2. a settled record is not reported as a crossing unless it carries BOTH a
 *      real execution AND a sealed receipt. The documented `allowUnexecuted` demo
 *      hatch settles as `"completed"` on the wire with nothing run, and a run
 *      whose own gate says BLOCKED settles as `"refused"` — calling either of
 *      those a crossing is exactly the claim this codebase refuses elsewhere;
 *   3. the settlement must name the peer that was authorised, and the
 *      authorisation must have been made against a key the OPERATOR pinned — a
 *      peer can never be the thing that proves itself.
 */
import dgram from "node:dgram";
import {
  resolveBindHost,
  startA2ARuntime,
  type A2ARuntime,
  type A2ARuntimeOptions,
  type RuntimeDescriptor,
  type RuntimeTeammateSpec,
} from "./a2aRuntime";
import { discoverAgentCard } from "./a2aClient";
import { fpForJwk } from "./a2aIdentityBridge";
import { sanitizeDeclaredAuthority } from "./selfimpulseTeams";
import type {
  AgentCardV10,
  CardSigningIdentityV10,
  TaskV10,
} from "./a2aV10";
import type { BridgeConfig } from "./a2aBridge";
import type {
  DeclaredAuthority,
  DelegationRecord,
  HumanGate,
  ReceiverRiskMode,
  RiskTier,
  SettledChain,
} from "./selfimpulseTeams";

/** How many step reports a handle keeps. Bounded for the same reason the replay registries are. */
const STEP_LEDGER_CAP = 64;

export type FederationStepName =
  | "mounting" | "mounted"
  | "authorising" | "authorised"
  | "crossing" | "crossed" | "refused"
  | "closing" | "closed";

export interface FederationStep {
  at: string;
  step: FederationStepName;
  ok: boolean;
  /** In words. A refusal always says what was NOT done. */
  detail: string;
}

/**
 * The bind scopes an operator may choose.
 *
 * `"local"` and `"loopback"` both mean 127.0.0.1. `"lan"` means "this machine's
 * network address" and is RESOLVED by `resolveBindScope` to a concrete address
 * before it reaches the runtime — see the refusal there for why it is never
 * mapped silently. A concrete IPv4/IPv6 address is accepted and still checked by
 * `resolveBindHost`. There is no wildcard member, and adding one would be refused
 * by the same function that refuses `--host 0.0.0.0`.
 */
export type BindScope = "local" | "loopback" | "lan" | (string & {});

export interface FederationDeps {
  /** This selfimpulse's user identity — what inbound packets must be addressed to. */
  selfimpulseUser: string;
  /** The team this selfimpulse speaks for. At least one, or the mount refuses. */
  teammates: RuntimeTeammateSpec[];
  /** Chosen BEFORE the mount. Defaults to `local` — the narrowest thing that works. */
  bind?: BindScope;
  /** 0 (default) picks a free port and the card is signed for it. */
  port?: number;
  /** Offer a one-time pairing code. Off unless the operator asks. */
  pairing?: boolean;
  /** Allow paired peers to offer files (AlterSend). Off unless the operator asks. */
  files?: boolean;
  filesDir?: string;
  /**
   * Accept file offers without a human. Off by default and named separately from
   * `files` for the same reason `files` is separate from `pairing`: mounting a
   * feature is not mounting an auto-accept.
   */
  filesAutoAccept?: boolean;
  /** Shared bearer token. Omitted ⇒ one is minted and never leaves this process. */
  token?: string;
  /** How this host treats work its OWN policy calls risky. Default: deny. */
  riskyGate?: "deny" | "approve" | HumanGate;
  receiverRiskMode?: ReceiverRiskMode;
  /** Live execution. Without it the host mounts and refuses every delegation in words. */
  bridge?: BridgeConfig;
  identity?: CardSigningIdentityV10;
  onLog?: (line: string) => void;
  /** Injectable clock, for the step ledger's timestamps. */
  now?: () => Date;
}

/** A peer the operator names and pins. Nothing here is inferred from the peer. */
export interface PeerTarget {
  /** How the operator names this peer locally. Required — never guessed. */
  id: string;
  /** The peer's interface root, e.g. `http://127.0.0.1:41234`. Egress-guarded. */
  root: string;
  /**
   * The peer's publisher JWK, PINNED by the operator.
   *
   * This is the whole trust anchor, which is why it is never fetched from the
   * host being verified: a key a peer can serve in order to prove itself proves
   * nothing at all.
   */
  publicJwk: JsonWebKey;
  /** Refuse unless the verified card names exactly this selfimpulse. */
  expectIdentity?: string;
}

export interface AuthorizedPeer {
  id: string;
  /** The identity the VERIFIED card claims. Not what the operator typed. */
  selfimpulse: string;
  /** Fingerprint of the pinned key, so a rotated key is visible rather than silent. */
  fp: string;
  root: string;
  publicJwk: JsonWebKey;
  authorizedAt: string;
}

export interface AuthorizationResult {
  ok: boolean;
  peer: AuthorizedPeer | null;
  detail: string;
}

export interface CrossingRequest {
  task: string;
  /** The sender's claim. The receiver re-classifies it and may only upgrade. */
  tier: RiskTier;
  /**
   * What this delegation may touch on the far machine. Required, and refused
   * here when it names no capabilities — see rule 1 in this file's header.
   */
  authority: DeclaredAuthority;
  /** Header satisfying the peer's card security scheme, when it demands one. */
  authorization?: string;
  /**
   * A real human gate for RISKY work on this side.
   *
   * Omitted means no gate, and a missing gate DENIES (the runtime's own default).
   * That is deliberate and unchanged: a supervised host wires a real gate here,
   * and an unattended one must not auto-approve work nobody looked at.
   */
  senderGate?: HumanGate;
  /** Continue a chain this host settled earlier. Omit to start a new one. */
  chain?: Partial<SettledChain>;
}

export interface CrossingResult {
  ok: boolean;
  /**
   * True ONLY when the peer returned a completed record carrying a real
   * execution AND a sealed receipt. A `not-executed` demo-hatch settlement and a
   * `gate=BLOCKED` run are both `crossed: false`, even though the wire says
   * "completed" or seats plainly ran.
   */
  crossed: boolean;
  /** The peer reported running seats. */
  executed: boolean;
  /** A sealed receipt came back to THIS side. */
  receipted: boolean;
  record: DelegationRecord | null;
  detail: string;
}

export interface FederationDescriptor extends RuntimeDescriptor {
  bind: { requested: string; resolved: string };
  peers: AuthorizedPeer[];
  steps: FederationStep[];
  /** One sentence naming where a crossing would go, for an operator's console. */
  crossingPath: string;
}

export interface FederationHandle {
  readonly runtime: A2ARuntime;
  /** Authorised peers only. An unauthorised peer is never in this list. */
  readonly peers: readonly AuthorizedPeer[];
  /** The bounded, ordered record of what this handle did and what it refused. */
  readonly steps: readonly FederationStep[];
  /**
   * What THIS host settled as a RECEIVER — the other half of the receipt claim.
   *
   * Read out of the server's own task store, so these are the records this
   * machine sealed and returned, refusals included. A refusal nobody can read is
   * not a gate.
   */
  inboundSettlements(): DelegationRecord[];
  describe(): FederationDescriptor;
  /** Prove a peer's identity against a pinned key, or refuse in words. */
  discoverAndAuthorize(target: PeerTarget): Promise<AuthorizationResult>;
  /** Cross to an ALREADY AUTHORISED peer, or refuse without sending anything. */
  cross(peerId: string, request: CrossingRequest): Promise<CrossingResult>;
  close(): Promise<void>;
}

/**
 * Ask the OS which local address would be used to LEAVE this machine.
 *
 * A UDP `connect` sends no packet: it binds the socket and makes the kernel pick a
 * route, after which `address()` reports the local end of that route. The
 * destination is RFC 5737 TEST-NET-1 (`203.0.113.1`), reserved for documentation
 * and never routed, precisely so this probe cannot reach anything. It is dgram and
 * NOT net, because a TCP `connect` would put a SYN on the wire — not something a
 * bind-scope decision should do.
 *
 * This is the Node half of `src-tauri/src/a2a_host.rs::lan_address`, which does
 * the same lookup with a `UdpSocket::connect` route probe. Two implementations of
 * one rule, because the two runtimes genuinely cannot share code.
 */
function lanInterfaceAddress(): string {
  const probe = dgram.createSocket("udp4");
  try {
    probe.connect(53, "203.0.113.1");
    const addr = probe.address();
    if (typeof addr !== "object" || addr === null) {
      throw new Error("the OS named no local address for the route probe");
    }
    return addr.address;
  } finally {
    probe.close();
  }
}

/**
 * Turn a chosen bind scope into the concrete address the listener may bind.
 *
 * WHY "lan" IS NOT MAPPED TO LOOPBACK. `resolveBindHost` refuses `"lan"` outright,
 * and its reason is right: mapping it to 127.0.0.1 would be a lie wearing the
 * feature's clothes — the operator asked to reach their network and would get a
 * listener no peer can find, reported as a successful mount. The refusal is also
 * necessary, because resolving a route needs a socket and this is not a pure
 * function.
 *
 * So the resolution happens HERE, where a socket is available, and the answer is
 * then handed to `resolveBindHost` unchanged. The allowlist stays the only thing
 * that decides: a scope that resolves to loopback is refused (the probe found no
 * network, and claiming otherwise is the same lie), and a wildcard is refused
 * exactly as it is on the command line.
 */
export async function resolveBindScope(requested: BindScope | string | undefined): Promise<string> {
  const raw = (requested ?? "local").trim();
  const lower = raw.toLowerCase();
  if (raw === "" || lower === "local" || lower === "loopback") return "127.0.0.1";
  if (lower !== "lan") return resolveBindHost(raw);

  let candidate: string;
  try {
    candidate = lanInterfaceAddress();
  } catch (err) {
    throw new Error(
      'a2a: "lan" was asked for but this machine has no routable network address to bind ' +
        `(${err instanceof Error ? err.message : String(err)}). Refusing rather than falling back to ` +
        '127.0.0.1, because a listener nobody can reach, reported as "your network", is the exact failure ' +
        "this exists to prevent. Bind 127.0.0.1 instead, or pass a concrete address such as 192.168.1.20.",
    );
  }
  // A loopback answer means the probe found no LAN. Passing it on would bind this
  // machine only while the operator was told "my network".
  if (candidate === "127.0.0.1" || candidate.startsWith("127.")) {
    throw new Error(
      `a2a: "lan" resolved to ${candidate}, which is this machine only — the route probe found no other ` +
        'interface. Refusing rather than reporting a local bind as a network one. Use bind: "local" for what ' +
        "you actually want.",
    );
  }
  // The allowlist has the last word on whatever the probe returned.
  return resolveBindHost(candidate);
}

/**
 * Read this host's own inbound settlements out of its A2A task store.
 *
 * `a2aServer.ts` stores the FINAL task for every accepted `message/send`, and that
 * task's agent message carries the `delegation-result/1.0` part — which is the
 * whole settled `DelegationRecord`, sealed receipt included. So the receiving half
 * of "every crossing is receipted on both sides" was always retained; what was
 * missing was a name for reading it. This is that name, and it is a read: nothing
 * here can add, alter or drop a settlement.
 *
 * It also walks `history`, because a task can carry the settlement in either
 * place depending on which write produced it, and a receipt that is only sometimes
 * visible is not evidence.
 */
export function inboundSettlementsOf(runtime: A2ARuntime): DelegationRecord[] {
  const out: DelegationRecord[] = [];
  const seen = new Set<string>();
  const readTask = (task: TaskV10): void => {
    const messages = [task.status?.message, ...(task.history ?? [])];
    for (const message of messages) {
      for (const part of message?.parts ?? []) {
        if (part.kind !== "data") continue;
        if ((part.data as { vh?: unknown }).vh !== "delegation-result/1.0") continue;
        const record = (part.data as { record?: DelegationRecord }).record;
        if (!record || typeof record.id !== "string" || seen.has(record.id)) continue;
        seen.add(record.id);
        out.push(record);
      }
    }
  };
  for (const task of runtime.server.tasks.values()) readTask(task);
  return out.sort((a, b) => a.ts.localeCompare(b.ts));
}

/**
 * Mount a selfimpulse and hand back something a caller can drive.
 *
 * Composes `startA2ARuntime`; it does not reimplement the mount. The failure modes
 * are the ones that file already has — a bad bind scope throws with the reason, a
 * team with no teammate throws, a degenerate token throws — and each is recorded in
 * the step ledger BEFORE the throw, so a caller that catches the error still has
 * the honest history of how far it got.
 */
export async function mountFederation(deps: FederationDeps): Promise<FederationHandle> {
  const log = deps.onLog ?? (() => undefined);
  const now = deps.now ?? (() => new Date());
  const steps: FederationStep[] = [];

  const step = (name: FederationStepName, ok: boolean, detail: string): void => {
    steps.push({ at: now().toISOString(), step: name, ok, detail });
    // Bounded: this ledger reports the recent past. An unbounded one would be a
    // leak, and a caller reading a 10 000-entry array learns nothing extra.
    if (steps.length > STEP_LEDGER_CAP) steps.splice(0, steps.length - STEP_LEDGER_CAP);
    log(`federation: ${name}${ok ? "" : " REFUSED"} — ${detail}`);
  };
  const refuse = (detail: string): void => step("refused", false, detail);

  const requestedBind: string = deps.bind ?? "local";
  step("mounting", true, `resolving the bind scope "${requestedBind}" before anything listens`);

  let host: string;
  try {
    host = await resolveBindScope(requestedBind);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    refuse(`nothing is listening: ${detail}`);
    throw err instanceof Error ? err : new Error(detail);
  }

  /* Peers live only as long as this handle. A pinned key that outlived the process
   * would let "who is this machine federated with" outlive the machine's own
   * decision about it. */
  const peers = new Map<string, AuthorizedPeer>();

  /* Forwarded verbatim to the one mount. Written out rather than spread so that
   * `host` — the ONLY thing this module decides — is visible as exactly that. */
  const runtimeOptions: A2ARuntimeOptions = {
    selfimpulseUser: deps.selfimpulseUser,
    teammates: deps.teammates,
    host,
    port: deps.port,
    pairing: deps.pairing,
    files: deps.files,
    filesDir: deps.filesDir,
    filesAutoAccept: deps.filesAutoAccept,
    token: deps.token,
    riskyGate: deps.riskyGate,
    receiverRiskMode: deps.receiverRiskMode,
    bridge: deps.bridge,
    identity: deps.identity,
    onLog: deps.onLog,
  };

  let runtime: A2ARuntime;
  try {
    runtime = await startA2ARuntime(runtimeOptions);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    refuse(`the mount did not complete: ${detail}`);
    throw err instanceof Error ? err : new Error(detail);
  }

  const mounted = runtime.describe();
  step(
    "mounted",
    true,
    `${mounted.selfimpulseUser} is listening on ${runtime.baseUrl} — card signed by ${mounted.identityFp}, ` +
      `token ${mounted.tokenMinted ? "minted here" : "supplied by the operator"}, ` +
      `depth limit ${mounted.policy.maxFederationHops} hops, ` +
      (mounted.bridge.executable
        ? `inbound spend bounded to $${mounted.policy.inboundCaps.maxCostUsd}/${mounted.policy.inboundCaps.maxTurns}turns`
        : `seats CANNOT run: ${mounted.bridge.refusalReason}`),
  );

  /**
   * Prove a peer, or refuse. Nothing downstream may skip this: `cross()` reads
   * only what this method admitted.
   */
  const discoverAndAuthorize = async (target: PeerTarget): Promise<AuthorizationResult> => {
    const id = typeof target.id === "string" ? target.id.trim() : "";
    if (id === "") {
      const detail = "a peer needs a name the operator chose; an unnamed peer can be neither authorised nor refused";
      refuse(detail);
      return { ok: false, peer: null, detail };
    }
    step("authorising", true, `checking "${id}" at ${target.root} against its PINNED publisher key`);

    let card: AgentCardV10;
    let verified: boolean;
    try {
      // `discoverAgentCard` applies the egress guard itself, demands strict
      // v1.0.0 shape, verifies the card's JWS against the key WE pinned, and
      // throws on every failure — so a return here is a verified card by
      // construction. `verified` is read rather than assumed, because "it cannot
      // happen" is not the same claim as "we checked".
      const disc = await discoverAgentCard(target.root, { publicJwk: target.publicJwk });
      card = disc.card;
      verified = disc.signatureVerified;
    } catch (err) {
      const detail =
        `"${id}" is NOT an authorised peer: ${err instanceof Error ? err.message : String(err)} — ` +
        "nothing crossed to an unproven identity";
      refuse(detail);
      return { ok: false, peer: null, detail };
    }
    if (!verified) {
      const detail = `"${id}" returned a card that did not verify against the pinned key — it stays unauthorised`;
      refuse(detail);
      return { ok: false, peer: null, detail };
    }
    if (target.expectIdentity !== undefined && card.name !== target.expectIdentity) {
      const detail =
        `"${id}" published a card naming itself "${card.name}", not "${target.expectIdentity}" — ` +
        "refused, because a card that says who it is not is not a card";
      refuse(detail);
      return { ok: false, peer: null, detail };
    }

    const fp = await fpForJwk(target.publicJwk);
    const prior = peers.get(id);
    if (prior && prior.fp !== fp) {
      /* Fail closed on rotation. Adopting it silently is how a machine authorised
       * for one key ends up authorising a different one, with the operator never
       * having seen it happen. */
      const detail =
        `"${id}" was authorised for publisher key ${prior.fp} and now presents ${fp}. Refusing the change ` +
        "silently — re-authorise deliberately under a new name, or pair again.";
      refuse(detail);
      return { ok: false, peer: null, detail };
    }

    const peer: AuthorizedPeer = {
      id,
      selfimpulse: card.name,
      fp,
      root: target.root.replace(/\/+$/, ""),
      publicJwk: target.publicJwk,
      authorizedAt: now().toISOString(),
    };
    peers.set(id, peer);
    const detail =
      `"${id}" is authorised as "${card.name}" — card JWS verified against pinned key ${fp}${prior ? " (unchanged)" : ""}`;
    step("authorised", true, detail);
    return { ok: true, peer, detail };
  };

  /**
   * Cross to an authorised peer. Every refusal below happens BEFORE a socket
   * opens, which is what makes the gate worth having: there is no partially sent
   * delegation anywhere in the system to clean up afterwards.
   */
  const cross = async (peerId: string, request: CrossingRequest): Promise<CrossingResult> => {
    const peer = peers.get(peerId);
    if (!peer) {
      const detail =
        `"${peerId}" is not an authorised peer — nothing was sent and nothing ran. ` +
        `Call discoverAndAuthorize() first; authorised peers are: ${[...peers.keys()].join(", ") || "none"}.`;
      refuse(detail);
      return { ok: false, crossed: false, executed: false, receipted: false, record: null, detail };
    }

    /* Rule 1: silence about authority is not consent to it. The receiver refuses an
     * unnamed chain too; refusing here means the peer never sees a request this
     * machine cannot justify. */
    const authority = sanitizeDeclaredAuthority(request.authority);
    if (authority.capabilities.length === 0) {
      const detail =
        `refused to send to "${peer.selfimpulse}": the delegation stated no capabilities this build ` +
        "recognises, so it holds no authority. State what the work may touch, or do not send it.";
      refuse(detail);
      return { ok: false, crossed: false, executed: false, receipted: false, record: null, detail };
    }

    step(
      "crossing",
      true,
      `${peer.selfimpulse} ← "${request.task.slice(0, 80)}" (${request.tier}, authority: ${authority.capabilities.join(", ")})`,
    );

    let outcome;
    try {
      outcome = await runtime.delegateTo({
        remoteRoot: peer.root,
        remotePublicJwk: peer.publicJwk,
        task: request.task,
        tier: request.tier,
        authority,
        authorization: request.authorization,
        senderGate: request.senderGate,
        chain: request.chain,
      });
    } catch (err) {
      const detail =
        `the crossing to "${peer.selfimpulse}" did not complete: ${err instanceof Error ? err.message : String(err)}`;
      refuse(detail);
      return { ok: false, crossed: false, executed: false, receipted: false, record: null, detail };
    }

    const record = outcome.record;

    /* Rule 3: the settlement must name the peer we authorised. If `toUser` is
     * somebody else then whoever answered is not the identity this handle proved,
     * and reporting it as the peer would launder the difference. */
    if (!record || record.toUser !== peer.selfimpulse) {
      const detail =
        `the settlement names "${record?.toUser ?? "nobody"}" but the authorised peer is "${peer.selfimpulse}" ` +
        "— refused to report that as a crossing";
      refuse(detail);
      return { ok: false, crossed: false, executed: false, receipted: false, record: record ?? null, detail };
    }

    /* Rule 2: "completed" on the wire is not "the work happened". The documented
     * `allowUnexecuted` hatch settles with status "completed" and no execution and
     * no receipt, and a run whose own gate returned BLOCKED settles as "refused"
     * despite seats having run. So the crossing claim rests on the execution and
     * the receipt, never on the status string. */
    const executed = record.execution != null;
    const receipted = record.receipt != null;
    const settled = outcome.ok && record.status === "completed";
    const crossed = settled && executed && receipted;

    if (!crossed) {
      const why = !settled
        ? `the peer settled this delegation as "${record.status}"`
        : !executed
          ? "the peer's record carries no execution (the allowUnexecuted demo hatch settles as completed with nothing run)"
          : "the peer's record carries no sealed receipt";
      const detail = `"${peer.selfimpulse}" did not complete the crossing: ${why}. ${record.note ?? ""}`.trim();
      refuse(detail);
      return { ok: false, crossed, executed, receipted, record, detail };
    }

    const detail =
      `crossed to "${peer.selfimpulse}": seat ${record.execution?.harness ?? "unknown"} ran ` +
      `${record.execution?.seatsRun ?? 0}/${record.execution?.seatsVerified ?? 0} verified, ` +
      `gate ${record.execution?.runStatus ?? "unknown"}, receipt sealed on both sides`;
    step("crossed", true, detail);
    return { ok: true, crossed, executed, receipted, record, detail };
  };

  const close = async (): Promise<void> => {
    step("closing", true, `unmounting ${mounted.selfimpulseUser} from ${runtime.baseUrl}`);
    await runtime.stop();
    step(
      "closed",
      true,
      "the listener is closed, its card is no longer served, and every pinned key and token it held died with this process",
    );
  };

  const describe = (): FederationDescriptor => ({
    ...runtime.describe(),
    bind: { requested: requestedBind, resolved: host },
    peers: [...peers.values()],
    steps: [...steps],
    crossingPath:
      "a crossing to a peer runs: discoverAndAuthorize({ id, root, publicJwk }) against a PINNED publisher " +
      "key, then cross(id, { task, tier, authority }) — and cross() refuses any peer that was not authorised. " +
      `This host serves on ${host}, and one chain may execute on at most ${mounted.policy.maxFederationHops} hosts.`,
  });

  return {
    runtime,
    get peers() { return [...peers.values()]; },
    get steps() { return [...steps]; },
    inboundSettlements: () => inboundSettlementsOf(runtime),
    describe,
    discoverAndAuthorize,
    cross,
    close,
  };
}