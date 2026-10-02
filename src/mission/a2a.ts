/**
 * §7 Agent-to-Agent discovery for VH (V11, SI-11.0-PROPOSAL W7). FENCED: OFF by default.
 *
 * The 2026 state of agent interoperability: A2A v0.3 is a Linux Foundation project with real
 * adoption (50+ partners), but it describes *task* exchange between self-standing agents, not
 * the local, human-supervised seats VH runs. V11 therefore ships only the discovery + contract
 * half — reading and validating Agent Cards — behind an explicit opt-in flag. Nothing in V11
 * *calls* a remote agent: that would move authority across a network boundary the governance
 * model cannot see, and would be a lie about supervision. What this file does:
 *
 *   • `parseAgentCard(json)` — validate a card from https://host/.well-known/agent-card.json
 *     (the v0.3 location; the legacy /.well-known/agent.json is accepted and labelled).
 *   • `agentCardForMission(mission)` — emit VH's own card for a mission, so the local runtime
 *     can be *described* in A2A terms the day federation is proven.
 *   • `remoteAgentToSeatDraft(card)` — turn a validated card into a DRAFT seat descriptor the
 *     human must confirm before anything runs. Drafts never execute; they are documentation
 *     with structure.
 *
 * The fence: `A2A_ENABLED` is false unless the build sets MJ_A2A_ENABLED=1, and every entry
 * point refuses when it is off — loudly, per the honesty rule.
 */

import { ENGINE_VERSION } from "../version";
export interface AgentCard {
  name: string;
  description: string;
  url: string;
  version: string;
  protocolVersion: string;
  capabilities: { streaming: boolean; pushNotifications: boolean };
  defaultInputModes: string[];
  defaultOutputModes: string[];
  skills: Array<{ id: string; name: string; description: string; tags: string[] }>;
  provider?: { organization: string; url: string };
  /** Present when the card came from the legacy agent.json location. */
  legacyLocation?: boolean;
}

/** The flag is build-time, not a UI toggle: turning federation on is a release decision. */
export function a2aEnabled(): boolean {
  return typeof process !== "undefined" && process.env?.MJ_A2A_ENABLED === "1";
}

function fence(): { ok: false; fenced: true; error: string } {
  return {
    ok: false,
    fenced: true,
    error: "A2A is fenced OFF in this build (set MJ_A2A_ENABLED=1 at build time to opt in). Discovery is available for reading cards, but nothing here can start a remote task — supervision does not cross the network boundary yet.",
  };
}

const REQUIRED_TEXT = ["name", "description", "url", "version", "protocolVersion"] as const;
const CARD_LOCATION = "/.well-known/agent-card.json";

/** Validate an Agent Card (A2A v0.3 shape; legacy location labelled). */
export function parseAgentCard(raw: unknown, opts: { fromLegacyLocation?: boolean } = {}): { ok: true; card: AgentCard } | { ok: false; errors: string[] } {
  if (typeof raw !== "object" || raw === null) return { ok: false, errors: ["an agent card must be a JSON object"] };
  const o = raw as Record<string, unknown>;
  const errors: string[] = [];
  for (const k of REQUIRED_TEXT) {
    if (typeof o[k] !== "string" || (o[k] as string).trim() === "") errors.push(`missing or empty required string: ${k}`);
  }
  const caps = (typeof o.capabilities === "object" && o.capabilities !== null ? o.capabilities : {}) as Record<string, unknown>;
  if (typeof o.capabilities !== "object" || o.capabilities === null) errors.push("missing required object: capabilities");
  const inputModes = Array.isArray(o.defaultInputModes) ? (o.defaultInputModes as unknown[]).filter((m): m is string => typeof m === "string") : [];
  const outputModes = Array.isArray(o.defaultOutputModes) ? (o.defaultOutputModes as unknown[]).filter((m): m is string => typeof m === "string") : [];
  if (!Array.isArray(o.defaultInputModes)) errors.push("missing required array: defaultInputModes (MIME types)");
  if (!Array.isArray(o.defaultOutputModes)) errors.push("missing required array: defaultOutputModes (MIME types)");
  const skills: AgentCard["skills"] = [];
  if (Array.isArray(o.skills)) {
    for (const s of o.skills as unknown[]) {
      const sk = (typeof s === "object" && s !== null ? s : {}) as Record<string, unknown>;
      if (typeof sk.id !== "string" || typeof sk.name !== "string" || typeof sk.description !== "string") {
        errors.push("a skill entry needs id, name and description strings");
        continue;
      }
      skills.push({ id: sk.id, name: sk.name, description: sk.description, tags: Array.isArray(sk.tags) ? (sk.tags as unknown[]).filter((t): t is string => typeof t === "string") : [] });
    }
  }
  if (errors.length > 0) return { ok: false, errors };
  const url = o.url as string;
  if (!url.startsWith("https://") && !url.startsWith("http://localhost")) errors.push(`agent url must be https (got ${url})`);
  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    card: {
      name: o.name as string,
      description: o.description as string,
      url,
      version: o.version as string,
      protocolVersion: o.protocolVersion as string,
      capabilities: { streaming: caps.streaming === true, pushNotifications: caps.pushNotifications === true },
      defaultInputModes: inputModes,
      defaultOutputModes: outputModes,
      skills,
      provider: typeof o.provider === "object" && o.provider !== null ? (o.provider as AgentCard["provider"]) : undefined,
      legacyLocation: opts.fromLegacyLocation === true,
    },
  };
}

/** Fetch + validate a card. Refuses when fenced off. (Renderer fetch only; no commands added.) */
export async function discoverAgentCard(host: string): Promise<{ ok: true; card: AgentCard } | { ok: false; error: string }> {
  if (!a2aEnabled()) return { ok: false, error: fence().error };
  const base = host.replace(/\/+$/, "");
  try {
    const res = await fetch(`${base}${CARD_LOCATION}`);
    if (!res.ok) return { ok: false, error: `${CARD_LOCATION} answered ${res.status}` };
    const parsed = parseAgentCard(await res.json());
    return parsed.ok ? { ok: true, card: parsed.card } : { ok: false, error: parsed.errors.join("; ") };
  } catch (e) {
    return { ok: false, error: `card discovery failed: ${(e as Error).message}` };
  }
}

/** VH's own card, in A2A terms. Local documentation — nothing serves it over the network. */
export function agentCardForMission(mission: { id: string; title: string; description: string; steps: Array<{ id: string; title: string; summary: string }> }): AgentCard {
  return {
    name: `SelfImpulse Mission: ${mission.title}`,
    description: mission.description,
    url: "http://localhost/local-vh",
    version: ENGINE_VERSION,
    protocolVersion: "0.3",
    capabilities: { streaming: false, pushNotifications: false },
    defaultInputModes: ["text/plain", "application/json"],
    defaultOutputModes: ["text/plain", "application/json"],
    skills: [
      {
        id: mission.id,
        name: mission.title,
        description: `A supervised SelfImpulse mission with ${mission.steps.length} checkpointed steps: ${mission.steps.map((s) => s.title).join(" → ")}`,
        tags: ["vh", "supervised", "local"],
      },
    ],
  };
}

export interface SeatDraft {
  draft: true;
  source: "a2a-card";
  name: string;
  url: string;
  streaming: boolean;
  inputModes: string[];
  outputModes: string[];
  skills: Array<{ id: string; name: string; tags: string[] }>;
  /** What a human must confirm before this draft could ever become a seat. */
  requiresHumanConfirmation: string[];
}

/** Card → seat DRAFT. Drafts never execute; they are what the human reviews. */
export function remoteAgentToSeatDraft(card: AgentCard): { ok: true; draft: SeatDraft; fence: string } | { ok: false; error: string } {
  if (!a2aEnabled()) return { ok: false, error: fence().error };
  return {
    ok: true,
    draft: {
      draft: true,
      source: "a2a-card",
      name: card.name,
      url: card.url,
      streaming: card.capabilities.streaming,
      inputModes: card.defaultInputModes,
      outputModes: card.defaultOutputModes,
      skills: card.skills.map((s) => ({ id: s.id, name: s.name, tags: s.tags })),
      requiresHumanConfirmation: [
        "the human reads the card's provider and skills before any draft becomes a seat",
        "the runtime never calls this url in V11 — invocation is future work, gated behind the same flag",
        `legacy location: ${card.legacyLocation ? "yes ( /.well-known/agent.json — the card predates v0.3 )" : "no"}`,
      ],
    },
    fence: fence().error,
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
   A2A v1.0 (major upgrade — SelfImpulse Teams): the Linux Foundation's released
   1.0 shape, added WITHOUT touching the v0.3 surface above (probe/a2a.test.ts
   pins it byte by byte). New capabilities:
     • AgentCardV1        — supportedInterfaces, securitySchemes, signatures
     • signAgentCard      — the selfimpulse's ECDSA P-256 identity signs the card
                            (same wire discipline as crossSelfImpulse envelopes),
                            so USER 1 can prove the card USER 2 links against
     • verifyAgentCardSignature — tamper-evident card acceptance
   Discovery-only honesty is kept: v1.0 cards DESCRIBE a selfimpulse's team; the
   human-gated delegation flow lives in selfimpulseTeams.ts.
   ═══════════════════════════════════════════════════════════════════════════ */

export interface AgentInterfaceV1 {
  url: string;
  protocolBinding: string;
  protocolVersion: string;
}

export interface AgentCardV1 {
  protocolVersion: "1.0";
  name: string;
  description: string;
  version: string;
  url: string;
  /** SelfImpulse/user this card belongs to (e.g. "USER 1"). */
  selfimpulse: string;
  capabilities: { streaming: boolean; pushNotifications: boolean; stateless: boolean };
  supportedInterfaces: AgentInterfaceV1[];
  securitySchemes: Array<{ scheme: "apiKey" | "httpAuth" | "oauth2" | "openIdConnect" | "mutualTls"; note: string }>;
  defaultInputModes: string[];
  defaultOutputModes: string[];
  skills: Array<{ id: string; name: string; description: string; tags: string[] }>;
  /** Signatures over the canonical card digest (signatures field excluded). */
  signatures: Array<{ alg: "ECDSA-P256-SHA256"; fp: string; sig: string }>;
}

const REQUIRED_V1_TEXT = ["name", "description", "version", "url", "selfimpulse"] as const;

/** Validate an A2A v1.0 card. Errors name the offending field, never crash. */
export function parseAgentCardV1(raw: unknown): { ok: true; card: AgentCardV1 } | { ok: false; errors: string[] } {
  if (typeof raw !== "object" || raw === null) return { ok: false, errors: ["an agent card must be a JSON object"] };
  const o = raw as Record<string, unknown>;
  const errors: string[] = [];
  if (o.protocolVersion !== "1.0") errors.push(`protocolVersion must be "1.0" (got ${String(o.protocolVersion)})`);
  for (const k of REQUIRED_V1_TEXT) {
    if (typeof o[k] !== "string" || (o[k] as string).trim() === "") errors.push(`missing or empty required string: ${k}`);
  }
  const caps = (typeof o.capabilities === "object" && o.capabilities !== null ? o.capabilities : {}) as Record<string, unknown>;
  const interfaces: AgentInterfaceV1[] = [];
  if (Array.isArray(o.supportedInterfaces)) {
    for (const i of o.supportedInterfaces as unknown[]) {
      const ii = (typeof i === "object" && i !== null ? i : {}) as Record<string, unknown>;
      if (typeof ii.url !== "string" || typeof ii.protocolBinding !== "string" || typeof ii.protocolVersion !== "string") {
        errors.push("a supportedInterface needs url, protocolBinding and protocolVersion strings");
        continue;
      }
      interfaces.push({ url: ii.url, protocolBinding: ii.protocolBinding, protocolVersion: ii.protocolVersion });
    }
  } else {
    errors.push("missing required array: supportedInterfaces");
  }
  const skills: AgentCardV1["skills"] = [];
  if (Array.isArray(o.skills)) {
    for (const s of o.skills as unknown[]) {
      const sk = (typeof s === "object" && s !== null ? s : {}) as Record<string, unknown>;
      if (typeof sk.id !== "string" || typeof sk.name !== "string" || typeof sk.description !== "string") {
        errors.push("a skill entry needs id, name and description strings");
        continue;
      }
      skills.push({ id: sk.id, name: sk.name, description: sk.description, tags: Array.isArray(sk.tags) ? (sk.tags as unknown[]).filter((t): t is string => typeof t === "string") : [] });
    }
  }
  const schemes: AgentCardV1["securitySchemes"] = [];
  if (Array.isArray(o.securitySchemes)) {
    for (const s of o.securitySchemes as unknown[]) {
      const ss = (typeof s === "object" && s !== null ? s : {}) as Record<string, unknown>;
      if (ss.scheme === "apiKey" || ss.scheme === "httpAuth" || ss.scheme === "oauth2" || ss.scheme === "openIdConnect" || ss.scheme === "mutualTls") {
        schemes.push({ scheme: ss.scheme, note: typeof ss.note === "string" ? ss.note : "" });
      }
    }
  }
  /* Signatures ride WITH the card (the digest excludes them, so carrying
   * them through the parser changes nothing about verification). */
  const signatures: AgentCardV1["signatures"] = [];
  if (Array.isArray(o.signatures)) {
    for (const s of o.signatures as unknown[]) {
      const ss = (typeof s === "object" && s !== null ? s : {}) as Record<string, unknown>;
      if (ss.alg === "ECDSA-P256-SHA256" && typeof ss.fp === "string" && typeof ss.sig === "string") {
        signatures.push({ alg: ss.alg, fp: ss.fp, sig: ss.sig });
      }
    }
  }
  if (errors.length > 0) return { ok: false, errors };
  const url = o.url as string;
  if (!url.startsWith("https://") && !url.startsWith("http://localhost")) errors.push(`agent url must be https (got ${url})`);
  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    card: {
      protocolVersion: "1.0",
      name: o.name as string,
      description: o.description as string,
      version: o.version as string,
      url,
      selfimpulse: o.selfimpulse as string,
      capabilities: { streaming: caps.streaming === true, pushNotifications: caps.pushNotifications === true, stateless: caps.stateless === true },
      supportedInterfaces: interfaces,
      securitySchemes: schemes,
      defaultInputModes: Array.isArray(o.defaultInputModes) ? (o.defaultInputModes as unknown[]).filter((m): m is string => typeof m === "string") : [],
      defaultOutputModes: Array.isArray(o.defaultOutputModes) ? (o.defaultOutputModes as unknown[]).filter((m): m is string => typeof m === "string") : [],
      skills,
      signatures,
    },
  };
}

/* ── card signing: the selfimpulse's identity proves its own card ──────────────── */

const v1Encoder = new TextEncoder();

function v1B64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return typeof btoa === "function" ? btoa(s) : Buffer.from(bytes).toString("base64");
}

function v1B64d(s: string): Uint8Array<ArrayBuffer> {
  const bin = typeof Buffer !== "undefined"
    ? String.fromCharCode(...new Uint8Array(Buffer.from(s, "base64")))
    : atob(s);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Deterministic digest over the card, signatures excluded. */
export async function agentCardDigest(card: AgentCardV1): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error("agent card signing requires WebCrypto");
  const canonical = JSON.stringify({ ...card, signatures: [] });
  const h = new Uint8Array(await subtle.digest("SHA-256", v1Encoder.encode(canonical)));
  return [...h].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export interface CardSigningIdentity {
  fp: string;
  privateKey: CryptoKey;
}

/** Sign a card with the selfimpulse's ECDSA P-256 key (crossSelfImpulse wire discipline). */
export async function signAgentCard(card: AgentCardV1, identity: CardSigningIdentity): Promise<AgentCardV1> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error("agent card signing requires WebCrypto");
  const digest = await agentCardDigest(card);
  const sig = new Uint8Array(
    await subtle.sign({ name: "ECDSA", hash: "SHA-256" }, identity.privateKey, v1Encoder.encode(digest)),
  );
  return { ...card, signatures: [...card.signatures, { alg: "ECDSA-P256-SHA256", fp: identity.fp, sig: v1B64(sig) }] };
}

/** Verify a signed card against the issuer's public JWK. Tamper → false, in words upstream. */
export async function verifyAgentCardSignature(card: AgentCardV1, publicJwk: JsonWebKey): Promise<{ ok: boolean; reason: string }> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) return { ok: false, reason: "agent card verification requires WebCrypto" };
  if (card.signatures.length === 0) return { ok: false, reason: "card carries no signatures" };
  const digest = await agentCardDigest(card);
  for (const s of card.signatures) {
    if (s.alg !== "ECDSA-P256-SHA256") continue;
    try {
      const key = await subtle.importKey("jwk", publicJwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
      const good = await subtle.verify({ name: "ECDSA", hash: "SHA-256" }, key, v1B64d(s.sig), v1Encoder.encode(digest));
      if (good) return { ok: true, reason: `signature from ${s.fp} verifies` };
    } catch {
      continue;
    }
  }
  return { ok: false, reason: "no signature verifies against the issuer's public key" };
}
