/**
 * Antigravity ACP provider probe.
 *
 * The problem this exists to solve. A Google AI Pro / Ultra subscription
 * stopped being usable anywhere outside Antigravity on 2026-06-18, so
 * SelfImpulse gained an optional provider that reaches it over a local ACP
 * surface. That is a real capability, and it sits one design decision away from
 * silently undoing a product promise: probe/noExternalCli.test.ts bans
 * external coding-agent binaries, and an "ACP provider" is exactly the phrase
 * that could be used to smuggle one back in.
 *
 * So the boundary is pinned from BOTH sides, and this file is the half that
 * holds Antigravity to it:
 *
 *   §1–§3  Antigravity is a TRANSPORT, not an agent. It is never spawned, it
 *          carries no OAuth surface, and it owns no part of the agent loop.
 *   §4–§6  The loopback gate holds. A hostile or compromised runtime cannot
 *          redirect a mission anywhere off this machine, and cannot launder a
 *          subscription into `canExecute` without a signed-in probe.
 *   §7     The product still tells the truth in its own words.
 *
 * The other half — that the agent-CLI ban is still absolute — stays in
 * noExternalCli.test.ts. Neither file trusts the other to carry the whole
 * claim, because a guarantee that lives in one file is a guarantee one edit can
 * remove.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import {
  verifyLoopbackEndpoint,
  candidateEndpoints,
  antigravityCanExecute,
  quotaHint,
  completeViaAntigravity,
  extractCompletionText,
  runtimeStatus,
  type AntigravityStatus,
} from "../src/auth/antigravity";
import { deriveAuthState, assertHonest, statusBadge, describeAccess, EMPTY_AUTH_STATE } from "../src/auth/authStatus";

const ROOT: string = process.env.SI_ROOT ?? process.cwd();
const readSrc = (rel: string): string => fs.readFileSync(path.join(ROOT, rel), "utf8");

let passed = 0;
let failed = 0;
const failures: string[] = [];
function ok(label: string, cond: boolean, detail = ""): void {
  if (cond) { passed += 1; console.log(`  ok   ${label}`); }
  else { failed += 1; failures.push(`${label}${detail ? ` — ${detail}` : ""}`); console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`); }
}
function section(name: string): void { console.log(`\n== ${name}`); }

section("1. the loopback gate refuses everything that is not this machine");
{
  // The SSRF the generic egress guard CANNOT catch: evil.example is a
  // perfectly ordinary public host, so checkEgressUrl would wave it through.
  const REMOTE = [
    ["https://evil.example/collect", "a public host a hostile runtime named"],
    ["https://generativelanguage.googleapis.com/v1", "Google's real API — still not ours to post a mission to"],
    ["http://10.0.0.5:9119", "RFC1918"],
    ["http://192.168.1.10:9119", "RFC1918"],
    ["http://169.254.169.254:80", "cloud metadata"],
    ["http://[fd00::1]:9119", "IPv6 unique-local"],
    ["http://attacker.local:9119", "an .local name"],
    ["http://metadata.google.internal:9119", "an .internal name"],
  ];
  for (const [url, why] of REMOTE) {
    const v = verifyLoopbackEndpoint(url);
    ok(`refused — ${why} (${url})`, !v.ok, v.reason);
    ok(`  ...and yields no origin to build a request from`, v.origin === "", v.origin);
  }

  /* Obfuscation. A host that merely RESOLVES to loopback is refused: DNS is
     attacker-controlled at exactly the moment we care, and we never resolve. */
  for (const [url, why] of [
    ["http://127.0.0.1.evil.example:9119", "a loopback-looking prefix in a real domain"],
    ["http://evil.example#127.0.0.1:9119", "loopback hidden in a fragment"],
    ["http://evil.example?x=127.0.0.1:9119", "loopback hidden in a query"],
  ] as const) {
    ok(`refused — ${why}`, !verifyLoopbackEndpoint(url).ok);
  }

  /* Alternate encodings of 127.0.0.1. A previous draft of this probe asserted
     these were REFUSED, which was the probe being wrong rather than the code:
     `new URL()` NORMALIZES every one of them to the literal `127.0.0.1`, so
     they genuinely address this machine and refusing them would buy nothing.
     The property that actually matters is the one asserted here — a spellable
     loopback alias can never be used to smuggle a REMOTE host past the gate,
     because normalization happens before we inspect the host, not after. */
  for (const [url, normalized] of [
    ["http://2130706433:9119", "decimal"],
    ["http://0x7f.0.0.1:9119", "hex"],
    ["http://127.1:9119", "short-form"],
  ] as const) {
    const v = verifyLoopbackEndpoint(url);
    const parsed = new URL(url);
    ok(`${normalized} spelling normalizes to literal loopback`, parsed.hostname === "127.0.0.1", parsed.hostname);
    ok(`  ...so it resolves to this machine and is allowed (${url})`, v.ok, v.reason);
    ok(`  ...and the origin we hand back is the normalized one`, v.ok && v.origin === "http://127.0.0.1:9119", v.origin);
  }
  /* The smuggling case that must still fail: a real remote host dressed up so
     that a loopback-looking fragment appears somewhere in the URL. */
  for (const [url, why] of [
    ["http://127.0.0.1:80@evil.example:9119", "userinfo smuggling"],
    ["http://evil.example:9119#@127.0.0.1", "loopback in a fragment"],
  ] as const) {
    ok(`refused — ${why}`, !verifyLoopbackEndpoint(url).ok, verifyLoopbackEndpoint(url).reason);
  }
}


section("2. the loopback gate accepts exactly the local runtime");
{
  for (const [url, why] of [
    ["http://127.0.0.1:9119", "the documented ACP port"],
    ["http://localhost:9119", "the localhost spelling"],
    ["https://127.0.0.1:9119", "https loopback"],
    ["http://127.0.0.53:9119", "another 127.x address"],
  ] as const) {
    const v = verifyLoopbackEndpoint(url);
    ok(`allowed — ${why} (${url})`, v.ok, v.reason);
  }

  /* IPv6 loopback is refused by the product egress guard ("this-network
     address"), which this gate deliberately inherits rather than exempting.
     That is the stricter and therefore correct outcome: an ACP runtime that
     binds only to ::1 is not reachable today, and the honest fix is for the
     guard's policy to be widened deliberately — not for a provider to carve
     out a private exemption the rest of the product does not have. */
  {
    const v6 = verifyLoopbackEndpoint("http://[::1]:9119");
    ok("IPv6 loopback is refused by the shared egress guard, not exempted", !v6.ok, v6.reason);
    ok("  ...and yields no origin", v6.origin === "", v6.origin);
  }

  /* Non-loopback shapes on an otherwise fine URL. Each is a redirect trick. */
  for (const [url, why] of [
    ["http://127.0.0.1", "no port — a default port would be assumed"],
    ["http://127.0.0.1:9119/collect", "a path — how you reach a different handler"],
    ["http://127.0.0.1:9119?next=evil", "a query"],
    ["http://127.0.0.1:9119#x", "a fragment"],
    ["file:///etc/passwd", "a non-http scheme"],
    ["gopher://127.0.0.1:9119", "a non-http scheme on loopback"],
    ["", "an empty string"],
  ] as const) {
    ok(`refused — ${why}`, !verifyLoopbackEndpoint(url).ok);
  }

  /* The origin is normalized, so callers cannot smuggle the raw string past. */
  const v = verifyLoopbackEndpoint("http://127.0.0.1:9119/");
  ok("a trailing-slash origin is normalized, not passed through raw", v.ok && v.origin === "http://127.0.0.1:9119", v.origin);
}

section("3. discovery only ever proposes loopback");
{
  const cands = candidateEndpoints();
  ok("there is at least one candidate to probe", cands.length > 0);
  for (const c of cands) {
    /* The load-bearing assertion: a non-loopback origin is never proposed, so
       the discovery sweep has no way to reach off-machine even in principle. */
    ok(`every candidate is loopback (${c})`, verifyLoopbackEndpoint(c).ok, verifyLoopbackEndpoint(c).reason);
  }
}

section("4. a subscription is never laundered into model access");
{
  const base: AntigravityStatus = { presence: "present", signIn: "unknown", endpoint: "http://127.0.0.1:9119", message: "" };

  ok("present + signed-in + endpoint ⇒ can execute", antigravityCanExecute({ ...base, signIn: "signed-in" }));
  ok("signed-OUT never grants execution", !antigravityCanExecute({ ...base, signIn: "signed-out" }));
  ok("an UNKNOWN sign-in never grants execution", !antigravityCanExecute({ ...base, signIn: "unknown" }));
  ok("absent never grants execution", !antigravityCanExecute({ ...base, presence: "absent", signIn: "signed-in" }));
  /* Being installed is not entitlement. */
  ok("signed-in with NO endpoint does not grant execution", !antigravityCanExecute({ ...base, signIn: "signed-in", endpoint: null }));
  /* Found by this probe: the endpoint check was missing here, so a status that
     merely SAID "signed in" while naming a remote host would have granted
     execution. Entitlement and destination are different questions. */
  ok("signed-in with a REMOTE endpoint does not grant execution", !antigravityCanExecute({ ...base, signIn: "signed-in", endpoint: "https://evil.example" }));
  ok("signed-in with a path-bearing endpoint does not grant execution", !antigravityCanExecute({ ...base, signIn: "signed-in", endpoint: "http://127.0.0.1:9119/collect" }));
  ok("signed-in with a port-less loopback endpoint does not grant execution", !antigravityCanExecute({ ...base, signIn: "signed-in", endpoint: "http://127.0.0.1" }));
}

section("5. the UI is told the truth about quota, not a promise");
{
  const mk = (p: Partial<AntigravityStatus>): AntigravityStatus => ({ presence: "present", signIn: "signed-in", endpoint: "http://127.0.0.1:9119", message: "", ...p });
  const hints = {
    absent: quotaHint(mk({ presence: "absent" })),
    out: quotaHint(mk({ signIn: "signed-out" })),
    unknown: quotaHint(mk({ signIn: "unknown" })),
    noAllowance: quotaHint(mk({})),
    allowance: quotaHint(mk({ quota: { remaining: "3 prompts", observedAt: 0 } })),
  };
  ok("absent is stated plainly", /no antigravity runtime is running/i.test(hints.absent), hints.absent);
  ok("signed-out says where to sign in", /sign in inside antigravity/i.test(hints.out), hints.out);
  ok("an unknown sign-in claims no quota", /no quota is claimed/i.test(hints.unknown), hints.unknown);
  ok("a missing allowance warns the call can still be refused", /can still be refused/i.test(hints.noAllowance), hints.noAllowance);
  /* The important one: a real allowance must STILL warn. Otherwise a user with
     a live subscription reads "3 prompts left" as "this mission is fine". */
  ok("a real allowance still warns a long mission can stop mid-run", /stop mid-run/i.test(hints.allowance), hints.allowance);
  for (const [k, h] of Object.entries(hints)) ok(`  ...no hint is empty (${k})`, h.trim().length > 0);
}

section("6. a completion is never fabricated");
{
  const good: AntigravityStatus = { presence: "present", signIn: "signed-in", endpoint: "http://127.0.0.1:9119", message: "" };
  const mustNotCall = (async () => { throw new Error("must not be called"); }) as unknown as typeof fetch;

  /* Refusals happen BEFORE any request, so a signed-out user costs no call. */
  let r = await completeViaAntigravity({ ...good, presence: "absent" }, { system: "s", user: "u", fetchImpl: mustNotCall });
  ok("absent runtime refuses without contacting anything", !r.ok && r.kind === "runtime-absent");
  r = await completeViaAntigravity({ ...good, signIn: "signed-out" }, { system: "s", user: "u", fetchImpl: mustNotCall });
  ok("signed-out refuses without contacting anything", !r.ok && r.kind === "not-signed-in");
  r = await completeViaAntigravity({ ...good, signIn: "unknown" }, { system: "s", user: "u", fetchImpl: mustNotCall });
  ok("an unknown sign-in refuses without contacting anything", !r.ok && r.kind === "not-signed-in");

  /* A hostile endpoint in an otherwise-valid signed-in status is still refused. */
  r = await completeViaAntigravity({ ...good, endpoint: "https://evil.example" }, { system: "s", user: "u", fetchImpl: mustNotCall });
  ok("a signed-in status naming a remote endpoint is refused", !r.ok && r.kind === "egress-blocked");

  /* Quota exhaustion is reported as itself, never as an empty answer. */
  const quotaFetch = (async () => new Response("quota exceeded", { status: 429 })) as unknown as typeof fetch;
  r = await completeViaAntigravity(good, { system: "s", user: "u", fetchImpl: quotaFetch });
  ok("HTTP 429 is reported as quota-exhausted", !r.ok && r.kind === "quota-exhausted");
  ok("  ...and says nothing was executed", /nothing was executed/i.test(r.ok ? "" : r.error));
  const forbidden = (async () => new Response("not entitled", { status: 403 })) as unknown as typeof fetch;
  r = await completeViaAntigravity(good, { system: "s", user: "u", fetchImpl: forbidden });
  ok("HTTP 403 is also quota/not-entitled, not a generic error", !r.ok && r.kind === "quota-exhausted");

  /* An empty body must not become "". */
  const emptyFetch = (async () => new Response(JSON.stringify({ text: "" }), { status: 200 })) as unknown as typeof fetch;
  r = await completeViaAntigravity(good, { system: "s", user: "u", fetchImpl: emptyFetch });
  ok("an empty completion is bad-response, never an empty success", !r.ok && r.kind === "bad-response");
  const nullFetch = (async () => new Response(JSON.stringify({}), { status: 200 })) as unknown as typeof fetch;
  r = await completeViaAntigravity(good, { system: "s", user: "u", fetchImpl: nullFetch });
  ok("a body with no text field is bad-response too", !r.ok && r.kind === "bad-response");

  /* A real completion passes through verbatim. */
  const goodFetch = (async () => new Response(JSON.stringify({ text: "hello" }), { status: 200 })) as unknown as typeof fetch;
  const res = await completeViaAntigravity(good, { system: "s", user: "u", fetchImpl: goodFetch });
  ok("a real completion is returned verbatim", res.ok && res.text === "hello", JSON.stringify(res));
}

section("7. the completion reader tolerates envelopes but never guesses");
{
  ok("plain string", extractCompletionText("hi") === "hi");
  ok("{text}", extractCompletionText({ text: "hi" }) === "hi");
  ok("{content} string", extractCompletionText({ content: "hi" }) === "hi");
  ok("anthropic content blocks", extractCompletionText({ content: [{ type: "text", text: "a" }, { type: "text", text: "b" }] }) === "ab");
  ok("thought parts are dropped — reasoning is not the answer",
    extractCompletionText({ content: [{ type: "text", text: "real" }, { type: "text", text: "hidden", thought: true }] }) === "real");
  ok("nested {message:{text}}", extractCompletionText({ message: { text: "hi" } }) === "hi");
  /* Found by this probe: an array of bare strings was being joined into an
     "answer". An envelope we do not recognise must never become a completion. */
  ok("a bare string array is refused — it is not a shape we understand", extractCompletionText(["x"]) === null);
  ok("a mixed array yields only the understood parts", extractCompletionText([{ text: "a" }, "junk", { text: "b" }]) === "ab");
  for (const [bad, why] of [[null, "null"], [{}, "an empty object"], [{ text: "" }, "an empty string"], [[], "an empty array"], [42, "a number"], [true, "a boolean"]] as const) {
    ok(`returns null for ${why} — never ""`, extractCompletionText(bad as unknown) === null);
  }
}

section("8. Antigravity is a TRANSPORT, not an agent — the source says so");
{
  /* The other half of the promise, asserted at the source level: this provider
     module may talk to a loopback runtime and nothing else. It must not spawn a
     process, must not carry a Google OAuth surface, and must not own any part
     of the agent loop.

     IMPORTANT: these read the file's CODE, not its prose. The module's comments
     deliberately say the words "OAuth", "receipt" and "gate" while explaining
     that it has none of them, so a naive substring scan fails on its own
     documentation — which is the first version of this section, and it was
     wrong. `code()` strips comments for exactly that reason. */
  const stripComments = (text: string): string =>
    text.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
  const src = stripComments(readSrc("src/auth/antigravity.ts"));

  ok("the module has code to check", src.trim().length > 500);
  ok("it never spawns a process", !/child_process|spawn\(|execFile|execSync|Command::new/.test(src));
  ok("it imports nothing from node:", !/from ["']node:/.test(src));

  /* No OAuth surface AT ALL. This is the substantive claim: a subscription is
     reached by asking the owner's own runtime, never by holding a Google
     credential here. Any of these would mean we had built a token store. */
  for (const needle of ["oauth", "client_id", "clientId", "client_secret", "access_token", "accessToken", "refresh_token", "refreshToken", "accounts.google.com", "googleapis.com/token"]) {
    ok(`carries no Google OAuth surface: ${needle}`, !src.includes(needle));
  }
  ok("it holds no credential field at all", !/\bapiKey\b/.test(src));

  /* It must not own the agent loop. The mission engine keeps that. */
  for (const needle of ["autonomyArms", "custody", "seatArgv", "harnessRunner", "agentLoop"]) {
    ok(`it does not own the agent loop: no ${needle}`, !src.includes(needle));
  }

  /* And the trust cost must be stated in the file, not only in a review. These
     DO read the prose, because the whole point is that the cost is documented. */
  const doc = readSrc("src/auth/antigravity.ts");
  ok("the file states the trust cost it adds", /closed-source process to the trust boundary/i.test(doc));
  ok("the file states that nothing is spawned", /never install it, never launch it/i.test(doc));
  ok("the file explains it ships no Google binary", /ship no Google binary/i.test(doc));
}


section("9. the external-CLI ban is amended explicitly, not silently");
{
  /* The ban itself still stands: noExternalCli.test.ts must still exist, still
     name the agent CLIs, and still pin that acp.rs is gone. What changed is that
     one file now records WHY an ACP provider runtime is not a violation —
     an amendment made in the open, in the gate itself, is what keeps this from
     being a quiet regression. */
  ok("the ban probe still exists", fs.existsSync(path.join(ROOT, "probe/noExternalCli.test.ts")));
  const ban = readSrc("probe/noExternalCli.test.ts");
  ok("it still pins the agent CLIs by name", /EXTERNAL_BINS/.test(ban) && /"claude"/.test(ban) && /"codex"/.test(ban));
  ok("it still pins that the ACP wire is deleted", /acp\.rs .* is deleted|acp\.rs — the external agent wire — is deleted/i.test(ban));
  ok("it records the Antigravity carve-out in writing", /antigravity/i.test(ban));
  ok("  ...and explains the transport-vs-agent distinction", /transport/i.test(ban) && /not an agent|not\b.*agent\b/i.test(ban));

section("10. the auth status model treats a runtime as a fact, not a preference");
{
  const baseFacts = { googleConnected: false, openaiConnected: false };
  const agy = (p: Partial<{ enabled: boolean; presence: "absent" | "present" | "unknown"; signIn: "signed-in" | "signed-out" | "unknown"; message: string }>) => ({
    enabled: false,
    presence: "absent" as const,
    signIn: "unknown" as const,
    message: "test",
    ...p,
  });

  const off = deriveAuthState({ ...baseFacts, antigravity: agy({ enabled: true }) });
  ok("switched on but no runtime ⇒ still no model access", !off.canExecute && off.modelAccess === "none");
  ok("  ...and the toggle is reported as a preference, not a connection", off.antigravity.enabled === true && off.antigravity.hasRuntime === false);
  ok("  ...and the state is honest", assertHonest(off) === null);

  const installed = deriveAuthState({ ...baseFacts, antigravity: agy({ enabled: true, presence: "present", signIn: "signed-out" }) });
  ok("a runtime that is present but signed out grants nothing", !installed.canExecute && installed.antigravity.hasRuntime === true);
  ok("  ...and the state is honest", assertHonest(installed) === null);
  ok("  ...and the badge does not say 'connected'", !/^connected$/i.test(statusBadge(installed).label), statusBadge(installed).label);

  const live = deriveAuthState({ ...baseFacts, antigravity: agy({ enabled: true, presence: "present", signIn: "signed-in", message: "running" }) });
  ok("a signed-in runtime grants model access", live.canExecute && live.modelAccess === "antigravity");
  ok("  ...and the state is honest", assertHonest(live) === null);
  ok("  ...and the badge names it as a local runtime, not a connection", /local runtime/i.test(statusBadge(live).label), statusBadge(live).label);
  ok("  ...and the description never calls it an API key", !/api key/i.test(describeAccess(live)), describeAccess(live));

  /* A signed-in claim with no runtime behind it is the exact laundering this
     file exists to prevent, so it must be caught by the invariant. */
  const forged = { ...live, antigravity: { ...live.antigravity, hasRuntime: false } };
  ok("signed-in without a runtime is rejected by assertHonest", assertHonest(forged) !== null, assertHonest(forged) ?? "accepted");
  const switchedOff = { ...live, antigravity: { ...live.antigravity, enabled: false } };
  ok("signed-in while switched off is rejected by assertHonest", assertHonest(switchedOff) !== null, assertHonest(switchedOff) ?? "accepted");

  /* Existing behaviour must be untouched by the new field. */
  ok("the empty state is still honest", assertHonest(EMPTY_AUTH_STATE) === null);
  ok("a Gemini key still wins over the new field", deriveAuthState({ googleConnected: true, googleCredential: "api-key", openaiConnected: false, antigravity: agy({ enabled: true, presence: "present", signIn: "signed-in" }) }).modelAccess === "gemini");
  ok("both keys still report 'both'", deriveAuthState({ googleConnected: true, googleCredential: "api-key", openaiConnected: true, openaiApiKey: true }).modelAccess === "both");
}

}

console.log(`\n${passed} passed, ${failed} failed.`);
if (failed) {
  console.log(failures.map((f) => `  - ${f}`).join("\n"));
  process.exit(1);
}
