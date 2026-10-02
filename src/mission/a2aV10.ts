/**
 * A2A v1.0.0 — STRICT wire layer (Warrant-Teams).
 *
 * The 17.6.2-era AgentCardV1 was VH's v1-STYLE internal contract. This module
 * implements the RELEASED Linux-Foundation A2A 1.0.0 specification shapes
 * (a2a-protocol.org/v1.0.0/specification, §4.4) exactly:
 *
 *   • AgentCard has NO top-level `url` and NO top-level `protocolVersion` —
 *     both live inside `supportedInterfaces` (AgentInterface: url +
 *     protocolBinding + protocolVersion), first entry preferred (§4.4.1/4.4.6).
 *   • `securitySchemes` is a MAP of string → SecurityScheme (§4.4.1), and each
 *     SecurityScheme is a discriminated union carrying EXACTLY ONE of the five
 *     scheme keys (§4.5.1).
 *   • `signatures` is an array of JWS-format AgentCardSignature objects:
 *     base64url(JSON protected header) + base64url(signature bytes) (§4.4.7).
 *   • Task states follow §4.1.1: submitted / working / input-required /
 *     completed / canceled / failed / rejected / auth-required / unknown.
 *   • JSON-RPC error codes follow §3.3.2: TaskNotFoundError −32001,
 *     TaskNotCancelableError −32002, PushNotificationNotSupportedError −32003,
 *     UnsupportedOperationError −32004, ContentTypeNotSupportedError −32005,
 *     InvalidAgentResponseError −32006.
 *
 * Signing uses the selfimpulse's ECDSA P-256 identity (crossSelfImpulse wire
 * discipline) — the card minus its `signatures` array is canonicalized
 * (recursive key-sorted, no whitespace) and signed as the JWS payload.
 * Verification re-derives the canonical payload, so any post-signing mutation
 * of ANY card field breaks the signature.
 */

/* ── §4.4.6 AgentInterface ──────────────────────────────────────────────── */

export interface AgentInterfaceV10 {
  /** Absolute URL where this interface is available (HTTPS in production). */
  url: string;
  /** "JSONRPC" | "GRPC" | "HTTP+JSON" (open-form string per spec). */
  protocolBinding: string;
  /** A2A protocol version this interface exposes, e.g. "1.0". */
  protocolVersion: string;
  /** Optional tenant id for the request. */
  tenant?: string;
}

/* ── §4.4.2 / §4.4.3 ───────────────────────────────────────────────────── */

export interface AgentProviderV10 {
  url: string;
  organization: string;
}

export interface AgentExtensionV10 {
  uri: string;
  description?: string;
  required?: boolean;
  params?: Record<string, unknown>;
}

export interface AgentCapabilitiesV10 {
  streaming?: boolean;
  pushNotifications?: boolean;
  extensions?: AgentExtensionV10[];
  extendedAgentCard?: boolean;
}

/* ── §4.5 SecurityScheme (discriminated union, exactly one key) ────────── */

export interface ApiKeySecuritySchemeV10 {
  description?: string;
  location: "query" | "header" | "cookie";
  name: string;
}
export interface HttpAuthSecuritySchemeV10 {
  description?: string;
  scheme: string;
  bearerFormat?: string;
}
export interface OAuth2SecuritySchemeV10 {
  description?: string;
  flows: Record<string, unknown>;
  oauth2MetadataUrl?: string;
}
export interface OpenIdConnectSecuritySchemeV10 {
  description?: string;
  openIdConnectUrl: string;
}
export interface MutualTlsSecuritySchemeV10 {
  description?: string;
}

export interface SecuritySchemeV10 {
  apiKeySecurityScheme?: ApiKeySecuritySchemeV10;
  httpAuthSecurityScheme?: HttpAuthSecuritySchemeV10;
  oauth2SecurityScheme?: OAuth2SecuritySchemeV10;
  openIdConnectSecurityScheme?: OpenIdConnectSecuritySchemeV10;
  mtlsSecurityScheme?: MutualTlsSecuritySchemeV10;
}

const SCHEME_KEYS = [
  "apiKeySecurityScheme",
  "httpAuthSecurityScheme",
  "oauth2SecurityScheme",
  "openIdConnectSecurityScheme",
  "mtlsSecurityScheme",
] as const;

/* ── §4.4.5 AgentSkill ─────────────────────────────────────────────────── */

export interface AgentSkillV10 {
  id: string;
  name: string;
  description: string;
  tags: string[];
  examples?: string[];
  inputModes?: string[];
  outputModes?: string[];
}

/* ── §4.4.7 AgentCardSignature (JWS format, RFC 7515 JSON serialization) ── */

export interface AgentCardSignatureV10 {
  /** base64url(JSON protected header). */
  protected: string;
  /** base64url(signature bytes). */
  signature: string;
  /** Unprotected header values (optional). */
  header?: Record<string, unknown>;
}

/* ── §4.4.1 AgentCard (strict v1.0.0) ──────────────────────────────────── */

export interface AgentCardV10 {
  name: string;
  description: string;
  /** Ordered; the first entry is the preferred interface. */
  supportedInterfaces: AgentInterfaceV10[];
  provider?: AgentProviderV10;
  /** Version OF THE AGENT (not of the protocol). */
  version: string;
  documentationUrl?: string;
  capabilities: AgentCapabilitiesV10;
  /** MAP of scheme-name → SecurityScheme (never an array). */
  securitySchemes?: Record<string, SecuritySchemeV10>;
  defaultInputModes: string[];
  defaultOutputModes: string[];
  skills: AgentSkillV10[];
  signatures?: AgentCardSignatureV10[];
  iconUrl?: string;
}

/* ── §4.1 core conversation objects ────────────────────────────────────── */

export type TaskStateV10 =
  | "submitted" | "working" | "input-required" | "completed"
  | "canceled" | "failed" | "rejected" | "auth-required" | "unknown";

export interface TextPartV10 { kind: "text"; text: string; metadata?: Record<string, unknown> }
export interface DataPartV10 { kind: "data"; data: Record<string, unknown>; metadata?: Record<string, unknown> }
export interface FilePartV10 {
  kind: "file";
  file: { name?: string; mimeType?: string; uri?: string; bytes?: string };
  metadata?: Record<string, unknown>;
}
export type PartV10 = TextPartV10 | DataPartV10 | FilePartV10;

export interface MessageV10 {
  role: "user" | "agent";
  messageId: string;
  parts: PartV10[];
  taskId?: string;
  contextId?: string;
  referenceTaskIds?: string[];
  metadata?: Record<string, unknown>;
}

export interface ArtifactV10 {
  artifactId: string;
  name?: string;
  description?: string;
  parts: PartV10[];
  metadata?: Record<string, unknown>;
}

export interface TaskStatusV10 {
  state: TaskStateV10;
  message?: MessageV10;
  timestamp: string;
}

export interface TaskV10 {
  id: string;
  contextId: string;
  status: TaskStatusV10;
  artifacts?: ArtifactV10[];
  history?: MessageV10[];
  metadata?: Record<string, unknown>;
}

export interface TaskStatusUpdateEventV10 {
  taskId: string;
  contextId: string;
  status: TaskStatusV10;
  final: boolean;
  timestamp: string;
}

export interface TaskArtifactUpdateEventV10 {
  taskId: string;
  contextId: string;
  artifact: ArtifactV10;
  append?: boolean;
  lastChunk?: boolean;
  timestamp: string;
}

/** §4.3.2 AuthenticationInfo (push notifications). */
export interface AuthenticationInfoV10 {
  scheme: string;
  credentials?: string;
}

/** PushNotificationConfig (§4.3). */
export interface PushNotificationConfigV10 {
  url: string;
  token?: string;
  authentication?: AuthenticationInfoV10;
}

/* ── §3.3.2 error codes ────────────────────────────────────────────────── */

/** RFC 8615 well-known path where a conforming server publishes its card. */
export const WELL_KNOWN_CARD_PATH = "/.well-known/agent-card.json";

export const A2A_ERRORS = {
  TaskNotFoundError: -32001,
  TaskNotCancelableError: -32002,
  PushNotificationNotSupportedError: -32003,
  UnsupportedOperationError: -32004,
  ContentTypeNotSupportedError: -32005,
  InvalidAgentResponseError: -32006,
  ParseError: -32700,
  InvalidRequest: -32600,
  MethodNotFound: -32601,
  InvalidParams: -32602,
} as const;

/* ── base64url (RFC 7515) ──────────────────────────────────────────────── */

function b64u(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 1) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64uDecode(s: string): Uint8Array<ArrayBuffer> {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4);
  const bin = atob(b64);
  const out: Uint8Array<ArrayBuffer> = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}
const enc = new TextEncoder();

/* ── canonical serialization (the JWS payload) ─────────────────────────── */

/** Recursive key-sorted JSON with no whitespace — deterministic bytes. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((v) => canonicalJson(v)).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).filter((k) => obj[k] !== undefined).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`).join(",")}`;
}

/** The card bytes that get signed: the card WITHOUT its signatures array. */
export function cardPayload(card: AgentCardV10): string {
  const { signatures: _sig, ...rest } = card;
  return canonicalJson(rest);
}

/* ── strict structural validator ───────────────────────────────────────── */

/**
 * Checks a value against the RELEASED 1.0.0 AgentCard schema. Returns the
 * list of violations (empty = compliant). This is what separates "A2A-aware"
 * from "A2A v1.0 interoperable": legacy cards with a top-level url /
 * protocolVersion or an array securitySchemes are refused here.
 */
export function validateAgentCardV10(raw: unknown): string[] {
  const v: string[] = [];
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return ["card must be an object"];
  const c = raw as Record<string, unknown>;

  if (typeof c.name !== "string" || c.name.length === 0) v.push("name is required");
  if (typeof c.description !== "string" || c.description.length === 0) v.push("description is required");
  if (typeof c.version !== "string" || c.version.length === 0) v.push("version is required");

  /* the two fields v1.0 REMOVED from the card root */
  if ("url" in c) v.push("top-level url is not part of AgentCard v1.0 — use supportedInterfaces");
  if ("protocolVersion" in c) v.push("top-level protocolVersion is not part of AgentCard v1.0 — interfaces carry it");

  if (!Array.isArray(c.supportedInterfaces) || c.supportedInterfaces.length === 0) {
    v.push("supportedInterfaces is required and must be non-empty");
  } else {
    c.supportedInterfaces.forEach((iface, i) => {
      const f = iface as Record<string, unknown>;
      if (typeof f?.url !== "string" || f.url.length === 0) v.push(`interface[${i}].url is required`);
      if (typeof f?.protocolBinding !== "string" || f.protocolBinding.length === 0) v.push(`interface[${i}].protocolBinding is required`);
      if (typeof f?.protocolVersion !== "string" || f.protocolVersion.length === 0) v.push(`interface[${i}].protocolVersion is required`);
    });
  }

  if (c.capabilities === null || typeof c.capabilities !== "object" || Array.isArray(c.capabilities)) {
    v.push("capabilities is required");
  }

  if (c.securitySchemes !== undefined) {
    if (c.securitySchemes === null || typeof c.securitySchemes !== "object" || Array.isArray(c.securitySchemes)) {
      v.push("securitySchemes must be a MAP of string → SecurityScheme (not an array)");
    } else {
      for (const [k, scheme] of Object.entries(c.securitySchemes as Record<string, unknown>)) {
        if (scheme === null || typeof scheme !== "object" || Array.isArray(scheme)) {
          v.push(`securitySchemes.${k} must be an object`);
          continue;
        }
        const present = SCHEME_KEYS.filter((sk) => (scheme as Record<string, unknown>)[sk] !== undefined);
        if (present.length !== 1) {
          v.push(`securitySchemes.${k} must carry EXACTLY ONE scheme key (found ${present.length})`);
        }
      }
    }
  }

  for (const f of ["defaultInputModes", "defaultOutputModes"] as const) {
    if (!Array.isArray(c[f]) || (c[f] as unknown[]).some((m) => typeof m !== "string")) {
      v.push(`${f} is required (array of media-type strings)`);
    }
  }
  if (!Array.isArray(c.skills)) {
    v.push("skills is required");
  } else {
    c.skills.forEach((s, i) => {
      const sk = s as Record<string, unknown>;
      for (const f of ["id", "name", "description"] as const) {
        if (typeof sk?.[f] !== "string" || (sk[f] as string).length === 0) v.push(`skills[${i}].${f} is required`);
      }
      if (!Array.isArray(sk?.tags)) v.push(`skills[${i}].tags is required`);
    });
  }

  if (c.signatures !== undefined) {
    if (!Array.isArray(c.signatures)) v.push("signatures must be an array of AgentCardSignature");
    else {
      c.signatures.forEach((s, i) => {
        const sg = s as Record<string, unknown>;
        if (typeof sg?.protected !== "string") v.push(`signatures[${i}].protected (base64url JWS header) is required`);
        if (typeof sg?.signature !== "string") v.push(`signatures[${i}].signature (base64url) is required`);
      });
    }
  }
  return v;
}

/* ── signing / verification (selfimpulse ECDSA P-256 identity) ──────────────── */

export interface CardSigningIdentityV10 {
  fp: string;
  privateKey: CryptoKey;
  publicJwk: JsonWebKey;
}

const ECDSA = { name: "ECDSA", namedCurve: "P-256" } as const;
const ECDSA_SIGN = { name: "ECDSA", hash: "SHA-256" } as const;

/**
 * Sign a v1.0 card in JWS form (§4.4.7): the protected header names the
 * algorithm, the key fingerprint (kid) and the card type; the signature
 * covers the canonical card-without-signatures bytes.
 */
export async function signAgentCardV10(card: AgentCardV10, identity: CardSigningIdentityV10): Promise<AgentCardV10> {
  const header = { alg: "ES256", typ: "si-a2a-card", kid: identity.fp, a2a: "1.0" };
  const protectedB64 = b64u(enc.encode(JSON.stringify(header)));
  const payload = enc.encode(cardPayload(card));
  const sig = new Uint8Array(await crypto.subtle.sign(ECDSA_SIGN, identity.privateKey, payload));
  const entry: AgentCardSignatureV10 = { protected: protectedB64, signature: b64u(sig) };
  return { ...card, signatures: [...(card.signatures ?? []), entry] };
}

/**
 * Verify every signature on a card against a publisher's public JWK.
 * Returns the fingerprints that verified (empty = none did). Any mutation of
 * any card field since signing breaks the canonical payload and fails here.
 */
export async function verifyAgentCardV10Signatures(card: AgentCardV10, publicJwk: JsonWebKey): Promise<{ ok: boolean; verified: string[]; total: number }> {
  const sigs = card.signatures ?? [];
  if (sigs.length === 0) return { ok: false, verified: [], total: 0 };
  const key = await crypto.subtle.importKey("jwk", publicJwk, ECDSA, false, ["verify"]);
  const payload = enc.encode(cardPayload(card));
  const verified: string[] = [];
  for (const s of sigs) {
    try {
      const header = JSON.parse(new TextDecoder().decode(b64uDecode(s.protected))) as { alg?: string; kid?: string };
      if (header.alg !== "ES256") continue;
      const good = await crypto.subtle.verify(ECDSA_SIGN, key, b64uDecode(s.signature), payload);
      if (good && typeof header.kid === "string") verified.push(header.kid);
    } catch {
      /* malformed signature entry — never verifies */
    }
  }
  return { ok: verified.length > 0, verified, total: sigs.length };
}

/** The card's preferred service endpoint (§4.4.1 — first interface wins). */
export function preferredInterface(card: AgentCardV10): AgentInterfaceV10 | undefined {
  return card.supportedInterfaces[0];
}
