/**
 * SelfImpulse — the Google Antigravity ACP provider runtime.
 *
 * WHY THIS EXISTS. Google moved consumer AI Pro/Ultra entitlement out of the
 * Gemini CLI and into Antigravity on 2026-06-18. A subscription therefore
 * became reachable again — but only through Antigravity's own ACP surface, not
 * through the Generative Language API. This module is how SelfImpulse talks to
 * that surface so a Google AI Pro subscriber can run a mission without buying
 * API credits.
 *
 * WHAT IT IS, PRECISELY — because the classification matters and is
 * deliberately narrow:
 *
 *   This is a MODEL PROVIDER RUNTIME, in the same family as Ollama.
 *   It is NOT an external coding-agent CLI.
 *
 * SelfImpulse removed Claude Code, Codex, Gemini CLI and friends as a product
 * decision, and probe/noExternalCli.test.ts pins that absence. Those binaries
 * are *agents*: they decide what to do, read and write the filesystem, and
 * call tools. Seating one means giving a third-party program authority over the
 * mission. This one is a *transport*: SelfImpulse still owns the agent loop,
 * the autonomy arms, the gate and the receipt, and asks the runtime for a
 * completion exactly the way it asks api.openai.com. That distinction is the
 * whole reason the ban can stay intact, and probe/antigravity.test.ts pins it
 * from both sides — the runtime is present, and the agent seat is still not.
 *
 * THE HONEST PART, which is most of this file.
 *
 *   • We do NOT sign in to Google. Never. There is no OAuth flow here, no
 *     client id, no token, no scope. Antigravity owns its own sign-in and its
 *     own credential store. This module never reads, copies, stores or
 *     forwards a Google credential, because there is nothing here for it to
 *     read. `probe/antigravity.test.ts` pins the absence of the OAuth surface.
 *   • "Signed in" is PROBED, never assumed. `runtimeStatus` asks the runtime.
 *   • Quota is REPORTED, never promised. A Pro plan's quota refreshes on
 *     Google's schedule and is reported to be small; a mission can still stop
 *     mid-run. `quotaHint` exists to say that out loud, and `complete()`
 *     surfaces a real refusal as a typed error rather than an empty answer.
 *   • Absent runtime ⇒ honest absence. No stub, no fabricated completion, no
 *     fallback that pretends. `runtimeStatus` returns "absent" and the engine
 *     refuses in words.
 *
 * THE ONE REAL TRUST COST, stated plainly: this adds a Google-supplied
 * closed-source process to the trust boundary of a mission, and adds a loopback
 * listener. Loopback is already documented product surface (Ollama —
 * pinned in probe/providerEgress.test.ts §2), so the listener is not a new
 * capability; the foreign binary is. The UI states this where the user opts in.
 */
import { checkEgressUrl } from "../security/guardrail";

/** What the runtime told us when we asked. Never a guess. */
export type RuntimePresence = "absent" | "present" | "unknown";

/**
 * Every way a call through this provider can fail. Each is a real, nameable
 * condition — there is no catch-all "unknown", because an unnamed failure is
 * how a guess gets mistaken for a result.
 */
export type AntigravityFailure =
  | "runtime-absent"
  | "not-signed-in"
  | "egress-blocked"
  | "timeout"
  | "quota-exhausted"
  | "http-error"
  | "bad-response";


/** Sign-in as REPORTED by the runtime. We never infer it from anything local. */
export type SignInState = "signed-in" | "signed-out" | "unknown";

export interface QuotaReport {
  /** Model the runtime reports as default, when it says. */
  model?: string;
  /** Opaque plan/quota label, e.g. "AI Pro". Display only. */
  plan?: string;
  /** Whatever the runtime reports about remaining allowance, if anything. */
  remaining?: string;
  /** Epoch ms when this report was read. */
  observedAt: number;
}

export interface AntigravityStatus {
  presence: RuntimePresence;
  signIn: SignInState;
  /** Loopback endpoint of the ACP surface, once known. Never a remote host. */
  endpoint: string | null;
  accountEmail?: string;
  quota?: QuotaReport;
  /** Version string the runtime reported, when it reported one. */
  version?: string;
  /** Human-readable, always populated, never a silent empty string. */
  message: string;
}

/* ------------------------------------------------------------------------- *
 * THE LOOPBACK GATE.
 *
 * This is the single most important function in the file, and it is stricter
 * than `checkEgressUrl` on purpose. The egress guard is written for the open
 * internet, where loopback is ALLOWED (Ollama lives there — see
 * probe/providerEgress.test.ts §2). That is correct for a base URL the owner
 * typed, and wrong for an endpoint a foreign binary told us to call.
 *
 * The threat: a compromised or hostile runtime returns `endpoint:
 * "https://evil.example/collect"` and the mission — including its system
 * prompt, the task, and every file the agent read — is POSTed there. Passing
 * the generic egress guard would not stop it, because evil.example is a
 * perfectly ordinary public host. Nothing about the URL looks wrong.
 *
 * So the rule here is not "is this host safe" but "is this host MINE":
 *
 *   • loopback literals ONLY — 127.0.0.0/8 spelled out, ::1, and `localhost`.
 *     A name that merely RESOLVES to loopback is refused: DNS is attacker-
 *     controlled at exactly the moment we care, and we do not resolve here.
 *   • http/https only, and a port is mandatory — a bare
 *     `http://127.0.0.1` would silently adopt 80 and fight a real service.
 *   • no userinfo (`http://user:pw@127.0.0.1`) — that is a credential in a URL
 *     and it is how a runtime tries to make us forward a secret.
 *   • no path/query/fragment smuggling: the ACP surface is a base, and a path
 *     is how a caller gets redirected onto a different handler.
 *
 * Returning the parsed origin (not the raw string) means the caller can only
 * ever build a request from something that already passed all of the above.
 * ------------------------------------------------------------------------- */
export interface LoopbackVerdict {
  ok: boolean;
  /** Normalized origin, e.g. `http://127.0.0.1:9119`. Empty when refused. */
  origin: string;
  reason: string;
}

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]", "0:0:0:0:0:0:0:1", "[0:0:0:0:0:0:0:1]"]);

/** 127.x.x.x, decimal only. Rejects `0x7f.0.0.1`, `2130706433`, `127.1`. */
const LOOPBACK_IPV4 = /^127\.(?:\d{1,3}\.){2}\d{1,3}$/;

export function verifyLoopbackEndpoint(raw: string): LoopbackVerdict {
  const refuse = (reason: string): LoopbackVerdict => ({ ok: false, origin: "", reason });

  const candidate = (raw ?? "").trim();
  if (!candidate) return refuse("the runtime did not report an endpoint, so there is nothing to connect to");

  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return refuse(`"${truncate(candidate)}" is not a URL, so it was not contacted`);
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return refuse(`scheme ${url.protocol} is not http(s); the ACP surface is contacted over http(s) only`);
  }
  if (url.username || url.password) {
    return refuse("the endpoint carried credentials in its URL — a runtime has no reason to send us a secret, and none was forwarded");
  }
  if (!url.port) {
    return refuse("the endpoint named no port, so a default port would have been assumed; the ACP surface is always explicit about its port");
  }
  if (url.pathname !== "" && url.pathname !== "/") {
    return refuse(`the endpoint carried a path ("${truncate(url.pathname)}"); only a bare origin is accepted, so a path cannot redirect us onto another handler`);
  }
  if (url.search || url.hash) {
    return refuse("the endpoint carried a query or fragment; only a bare origin is accepted");
  }

  const host = url.hostname.toLowerCase();
  const isLoopback = LOOPBACK_HOSTS.has(host) || LOOPBACK_IPV4.test(host);
  if (!isLoopback) {
    /* This is the SSRF refusal that `checkEgressUrl` alone would NOT catch. */
    return refuse(`"${truncate(host)}" is not a loopback address. A mission may only be sent to a runtime on this machine, so a remote endpoint was refused and nothing was sent.`);
  }

  /* Belt and braces: the generic egress guard must also agree. It allows
     loopback today, so this is a no-op in practice — it is here so that if the
     guard's policy is ever tightened to refuse loopback, this provider inherits
     the stricter policy for free instead of keeping a private exemption. */
  const egress = checkEgressUrl(url.origin);
  if (!egress.ok) return refuse(`refused by the product egress guard: ${egress.reason}`);

  return { ok: true, origin: url.origin, reason: "loopback origin verified" };
}

function truncate(s: string, max = 60): string {
  const t = (s ?? "").slice(0, max);
  return t.length < (s ?? "").length ? `${t}…` : t;
}

/**
 * The opt-in. Antigravity is OFF unless the owner turns it on, and the flag is
 * read from storage rather than inferred from a runtime being present — a
 * runtime that happens to be installed is not consent to route missions to it.
 */
const ANTIGRAVITY_OPTIN_STORE = "vh.auth.antigravity.optin.v1";

export function antigravityOptIn(): boolean {
  try {
    return globalThis.localStorage?.getItem(ANTIGRAVITY_OPTIN_STORE) === "on";
  } catch {
    return false;
  }
}

export function setAntigravityOptIn(on: boolean): void {
  try {
    if (on) globalThis.localStorage?.setItem(ANTIGRAVITY_OPTIN_STORE, "on");
    else globalThis.localStorage?.removeItem(ANTIGRAVITY_OPTIN_STORE);
  } catch {
    /* storage unavailable — the runtime stays off, which is the safe default */
  }
}

/** The narrow slice of the runtime surface this module uses. */
export interface AntigravityProbe {
  /** Reports presence + sign-in + endpoint. Must not require our credentials. */
  status(): Promise<AntigravityStatus>;
  /** One completion. Reject or return `{ok:false}` — never invent text. */
  complete(req: { endpoint: string; system: string; user: string; model?: string; timeoutMs?: number }): Promise<
    { ok: true; text: string; model: string; latencyMs: number } | { ok: false; kind: AntigravityFailure; error: string }
  >;

}

/** ------------------------------------------------------------------------- *
 * RUNTIME DISCOVERY.
 *
 * The Antigravity ACP surface is a local process that the OWNER installs and
 * signs in to. We discover it; we never install it, never launch it and never
 * sign in for them. Three consequences, all deliberate:
 *
 *   1. We ship no Google binary. Redistributing the Antigravity server is not
 *      something Google's licence permits a third-party app to do, and bundling
 *      it would also put a closed-source binary inside our own installer.
 *   2. We do not spawn it. The owner starts Antigravity the way they start any
 *      other app. This is what keeps the external-CLI ban intact — nothing in
 *      SelfImpulse ever execs a foreign program.
 *   3. Discovery is a fixed list of loopback origins plus one env override, and
 *      each candidate is checked BEFORE any request is made. A candidate that
 *      is not loopback is dropped with a reason, never contacted.
 * ------------------------------------------------------------------------- */

/** The one escape hatch, for an owner whose runtime uses an unusual port. */
export const ANTIGRAVITY_DISCOVERY_ENV = "SELFIMPULSE_ANTIGRAVITY_ENDPOINT";

const DEFAULT_PORTS = [9119, 9120, 8080];

/** Conventional loopback origins, probed in order. Loopback by construction. */
export function candidateEndpoints(): string[] {
  const out: string[] = [];
  let override: string | undefined;
  try {
    override = globalThis.process?.env?.[ANTIGRAVITY_DISCOVERY_ENV]?.trim();
  } catch {
    override = undefined;
  }
  if (override) out.push(override);
  for (const port of DEFAULT_PORTS) {
    out.push(`http://127.0.0.1:${port}`);
    out.push(`http://localhost:${port}`);
  }
  return out;
}

type FetchImpl = typeof fetch;

/**
 * Ask one endpoint for its status. This is what makes "signed in" a fact
 * rather than a guess: the runtime answers and we relay only what it said. An
 * unreachable endpoint is absent-with-reason, never "signed out" — the
 * difference matters, because one means "start it" and the other would mean
 * "your Google account is not entitled", which we have no way to know.
 */
async function probeEndpoint(origin: string, fetchImpl: FetchImpl, timeoutMs: number): Promise<AntigravityStatus | null> {
  const verdict = verifyLoopbackEndpoint(origin);
  if (!verdict.ok) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(`${verdict.origin}/status`, { signal: controller.signal, headers: { accept: "application/json" } });
    if (!res.ok) return null;
    const body: unknown = await res.json().catch(() => null);
    if (!body || typeof body !== "object") return null;
    const b = body as { signedIn?: unknown; email?: unknown; version?: unknown; model?: unknown; plan?: unknown; remaining?: unknown; endpoint?: unknown };

    /* Re-verify the endpoint the runtime advertises: a runtime naming a remote
       endpoint in its own status reply is refused exactly as if it had said so
       up front. */
    if (typeof b.endpoint === "string" && b.endpoint) {
      const selfCheck = verifyLoopbackEndpoint(b.endpoint);
      if (!selfCheck.ok) {
        return {
          presence: "present",
          signIn: "unknown",
          endpoint: null,
          message: `Antigravity is running at ${verdict.origin} but advertised a non-loopback endpoint (${selfCheck.reason}). It was not contacted.`,
        };
      }
      b.endpoint = selfCheck.origin;
    }

    const signedIn = b.signedIn === true ? "signed-in" : b.signedIn === false ? "signed-out" : "unknown";
    return {
      presence: "present",
      signIn: signedIn,
      endpoint: typeof b.endpoint === "string" && b.endpoint ? b.endpoint : verdict.origin,
      accountEmail: typeof b.email === "string" ? b.email : undefined,
      version: typeof b.version === "string" ? b.version : undefined,
      quota:
        b.model || b.plan || b.remaining
          ? {
              model: typeof b.model === "string" ? b.model : undefined,
              plan: typeof b.plan === "string" ? b.plan : undefined,
              remaining: typeof b.remaining === "string" ? b.remaining : undefined,
              observedAt: Date.now(),
            }
          : undefined,
      message:
        signedIn === "signed-in"
          ? "Antigravity is running and reports a signed-in Google account."
          : signedIn === "signed-out"
            ? "Antigravity is running but is signed out. Open Antigravity and sign in with your Google account — this app cannot sign in for you."
            : "Antigravity is running but did not report a sign-in state, so no quota is claimed on your behalf.",
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The whole discovery pass. Opt-in first: a runtime that is installed is not
 * consent, and nothing is contacted until the owner has turned this on.
 *
 * Discovery is self-contained: it walks `candidateEndpoints()` and asks each
 * one directly, so it needs no injected probe. `probe` is still accepted so a
 * caller holding a platform-specific transport (a future native IPC bridge)
 * can pass it; when omitted, the loopback HTTP path above is used.
 */
export async function runtimeStatus(
  probe?: AntigravityProbe,
  opts: { fetchImpl?: FetchImpl; timeoutMs?: number } = {},
): Promise<AntigravityStatus> {
  if (!antigravityOptIn()) {
    return {
      presence: "absent",
      signIn: "unknown",
      endpoint: null,
      message: "Antigravity is off. It is an optional local provider runtime — turn it on to look for one on this machine.",
    };
  }
  const fetchImpl = opts.fetchImpl ?? (globalThis.fetch?.bind(globalThis) as FetchImpl | undefined);
  if (!fetchImpl) {
    return { presence: "unknown", signIn: "unknown", endpoint: null, message: "This runtime has no fetch, so Antigravity could not be checked." };
  }
  const timeoutMs = opts.timeoutMs ?? 4000;

  /* A caller-supplied transport wins, and is still held to the same policy:
     `probe.status` returns a status, and we re-verify whatever endpoint it
     claims before any completion is ever routed through it. */
  if (probe) {
    const reported = await probe.status();
    if (reported.endpoint) {
      const verdict = verifyLoopbackEndpoint(reported.endpoint);
      if (!verdict.ok) {
        return {
          presence: reported.presence,
          signIn: "unknown",
          endpoint: null,
          message: `The Antigravity transport reported an endpoint this app refuses: ${verdict.reason}`,
        };
      }
      return { ...reported, endpoint: verdict.origin };
    }
    return reported;
  }

  for (const candidate of candidateEndpoints()) {
    const found = await probeEndpoint(candidate, fetchImpl, timeoutMs);
    if (found) return found;
  }
  return {
    presence: "absent",
    signIn: "unknown",
    endpoint: null,
    message:
      "No Antigravity runtime answered on this machine. Start Antigravity — it must already be installed and signed in, because this app installs nothing and signs in for nobody — then try again.",
  };
}

/**
 * The honesty gate, in one predicate.
 *
 * `canExecute` must never be true on a subscription the app has merely heard
 * about. It is true only when the runtime is present AND reports a signed-in
 * account, i.e. when a real, current, probe-backed fact exists. This is what
 * stops "Antigravity is installed" from being laundered into "this app can
 * run models", which is the exact failure authStatus.ts exists to prevent.
 */
export function antigravityCanExecute(status: AntigravityStatus): boolean {
  if (status.presence !== "present" || status.signIn !== "signed-in" || !status.endpoint) return false;
  /* The endpoint is re-verified HERE, not just at connect time. A status object
     is a plain data shape: anything that can build one — a future native
     bridge, a restored cache, a UI that read it out of storage — must not be
     able to flip `canExecute` by naming a remote host. Entitlement is a
     property of the ACCOUNT; the destination is a separate question, and this
     predicate is the gate that keeps them from being confused. */
  return verifyLoopbackEndpoint(status.endpoint).ok;
}

/** The caveat that must ride alongside every use of this provider. */
export function quotaHint(status: AntigravityStatus): string {
  if (status.presence !== "present") return "No Antigravity runtime is running.";
  if (status.signIn === "signed-out") return "Antigravity is signed out. Sign in inside Antigravity itself.";
  if (status.signIn !== "signed-in") return "Antigravity did not confirm a signed-in account, so no quota is claimed.";
  if (!status.quota?.remaining) {
    return "Antigravity is signed in but did not report a remaining allowance, so this call can still be refused when Google's quota runs out.";
  }
  return `Antigravity reports ${status.quota.remaining} remaining. Consumer plan quotas are small and reset on Google's schedule, so a long mission can still stop mid-run.`;
}

/* ------------------------------------------------------------------------- *
 * THE COMPLETION PATH.
 *
 * This is the only place a mission's prompt is handed to Antigravity, and it
 * is deliberately boring: verify the endpoint is loopback, verify the runtime
 * is actually signed in, then make one request. Every failure is a typed
 * refusal in words. There is no fallback provider, no retry against another
 * host, and — the rule that matters most — no path that returns text this app
 * did not receive. A fabricated answer is the exact failure mode this product
 * exists to make impossible, so an exhausted quota returns `quota-exhausted`
 * and an empty body returns `bad-response`; neither ever becomes "".
 * ------------------------------------------------------------------------- */
export async function completeViaAntigravity(
  status: AntigravityStatus,
  args: { system: string; user: string; model?: string; timeoutMs?: number; fetchImpl?: FetchImpl },
): Promise<{ ok: true; text: string; model: string; latencyMs: number } | { ok: false; kind: AntigravityFailure; error: string }> {
  if (status.presence !== "present") {
    return { ok: false, kind: "runtime-absent", error: "No Antigravity runtime is running, so nothing was executed." };
  }
  if (status.signIn === "signed-out") {
    return { ok: false, kind: "not-signed-in", error: "Antigravity is signed out, so nothing was executed. Sign in inside Antigravity itself." };
  }
  if (status.signIn !== "signed-in") {
    return { ok: false, kind: "not-signed-in", error: "Antigravity did not confirm a signed-in account, so nothing was executed." };
  }

  const verdict = verifyLoopbackEndpoint(status.endpoint ?? "");
  if (!verdict.ok) {
    return { ok: false, kind: "egress-blocked", error: `Antigravity endpoint refused: ${verdict.reason}. Nothing was sent.` };
  }

  const fetchImpl = args.fetchImpl ?? (globalThis.fetch?.bind(globalThis) as FetchImpl | undefined);
  if (!fetchImpl) {
    return { ok: false, kind: "http-error", error: "This runtime has no fetch, so nothing was executed." };
  }

  const timeoutMs = args.timeoutMs ?? 120_000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const t0 = Date.now();
  try {
    const res = await fetchImpl(`${verdict.origin}/complete`, {
      method: "POST",
      signal: controller.signal,
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ system: args.system, user: args.user, model: args.model }),
    });
    const latencyMs = Date.now() - t0;

    /* Google's quota refusal is a real, expected outcome on a consumer plan
       and it is reported as itself — not as a generic error, and never as an
       empty success. */
    if (res.status === 429 || res.status === 403) {
      const detail = (await res.text().catch(() => "")).slice(0, 200);
      return {
        ok: false,
        kind: "quota-exhausted",
        error: `Antigravity refused the call (HTTP ${res.status}) — your Google plan quota is exhausted or not entitled.${detail ? ` ${detail}` : ""} Nothing was executed.`,
      };
    }
    if (!res.ok) {
      const detail = (await res.text().catch(() => "")).slice(0, 200);
      return { ok: false, kind: "http-error", error: `Antigravity returned HTTP ${res.status}.${detail ? ` ${detail}` : ""} Nothing was executed.` };
    }

    const body: unknown = await res.json().catch(() => null);
    const text = extractCompletionText(body);
    if (text === null || text.trim().length === 0) {
      return { ok: false, kind: "bad-response", error: "Antigravity returned no usable text, so nothing was executed. This app never invents an answer." };
    }
    return { ok: true, text, model: args.model ?? status.quota?.model ?? "antigravity", latencyMs };
  } catch (err) {
    const aborted = err instanceof Error && err.name === "AbortError";
    return {
      ok: false,
      kind: aborted ? "timeout" : "http-error",
      error: aborted
        ? `Antigravity did not answer within ${timeoutMs}ms. Nothing was executed.`
        : `Could not reach the Antigravity runtime on this machine: ${err instanceof Error ? err.message : String(err)}.`,
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Pull text out of whatever shape the runtime used. Tolerates the common ACP
 * envelopes; returns null — never "" — when nothing usable is present, so the
 * caller cannot mistake "no answer" for "an empty answer".
 */
export function extractCompletionText(body: unknown): string | null {
  if (body == null) return null;
  if (typeof body === "string") return body.trim() ? body : null;
  if (Array.isArray(body)) {
    /* An array is only meaningful as a list of content parts, and only when the
       parts are objects carrying text. A bare `["x"]` is an envelope we do not
       understand, and treating an unrecognized shape as the answer is exactly
       how a stray field becomes a fabricated completion — so refuse it. */
    const parts = body
      .filter((p): p is Record<string, unknown> => !!p && typeof p === "object" && !Array.isArray(p))
      .map((p) => {
        /* `thought` parts are reasoning, never the answer. */
        if (p.thought === true) return "";
        return typeof p.text === "string" ? p.text : "";
      })
      .filter(Boolean);
    return parts.length ? parts.join("") : null;
  }
  if (typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  for (const key of ["text", "content", "completion", "result", "output"]) {
    const v = b[key];
    if (typeof v === "string" && v.trim()) return v;
  }
  /* Anthropic-style content blocks, and the agent/delta shapes an ACP stream
     may settle into. */
  if (Array.isArray(b.content)) {
    const parts = b.content
      .map((c: unknown) => {
        if (typeof c === "string") return c;
        if (c && typeof c === "object") {
          const cb = c as { type?: string; text?: string; thought?: boolean };
          /* `thought` parts are reasoning, never the answer. */
          if (cb.thought) return "";
          return typeof cb.text === "string" ? cb.text : "";
        }
        return "";
      })
      .filter(Boolean);
    if (parts.length) return parts.join("");
  }
  if (b.message && typeof b.message === "object") return extractCompletionText(b.message);
  return null;
}

/**
 * The default probe — a thin, swappable wrapper so the runtime can be faked in
 * tests and swapped for a native IPC path later without touching the policy.
 * It carries NO credentials and no OAuth surface by construction: `status`
 * needs nothing, and `complete` forwards only the prompt.
 */
export function httpAntigravityProbe(): AntigravityProbe {
  return {
    status: async () => {
      const fetchImpl = globalThis.fetch?.bind(globalThis) as FetchImpl | undefined;
      return runtimeStatus(httpAntigravityProbe(), { fetchImpl });
    },
    complete: async (req) => {
      const fetchImpl = globalThis.fetch?.bind(globalThis) as FetchImpl | undefined;
      const status: AntigravityStatus = {
        presence: "present",
        signIn: "signed-in",
        endpoint: req.endpoint,
        message: "caller-supplied status; the caller already probed sign-in",
      };
      return completeViaAntigravity(status, {
        system: req.system,
        user: req.user,
        model: req.model,
        timeoutMs: req.timeoutMs,
        fetchImpl,
      });
    },
  };
}

