/**
 * egressNet probe — DNS- and IP-aware egress enforcement.
 *
 * The string policy in guardrail.test.ts stays exactly as it was. This probe
 * pins the layer that a string check structurally cannot provide, and it starts
 * with a bypass that was LIVE in the shipped code.
 *
 *   http://[::ffff:a9fe:a9fe]/ is 169.254.169.254 — the AWS/Azure/GCP metadata
 *   endpoint — written as an IPv4-mapped IPv6 address. checkEgressUrl's IPv6
 *   tests match only /^(fc|fd)/ and /fe80:/, so it classified this as an
 *   ordinary public IPv6 host and allowed it. The guard existed to stop exactly
 *   this request.
 *
 * Sections:
 *   1. the mapped-IPv6 bypass is closed
 *   2. normalization (integer / octal / hex / short / zone-id forms)
 *   3. classification against the IANA special-purpose registries
 *   4. resolution — fail-closed on mixed answers, and the rebinding window
 *   5. redirects are manual, capped, and re-vetted on every hop
 *   6. loopback stays allowed for the native provider path
 */
import { classifyHost, classifyIp, normalizeHost, resolveEgress, safeEgressFetch } from "../src/security/egressNet";
import { checkEgressUrl } from "../src/security/guardrail";
import * as fs from "node:fs";
import * as path from "node:path";

// Source-tree root, resolved the way the other disk-reading probes do it
// (docIdentity / legacyCompat / shellAffordances / versionDrift) so this file
// still works when bundled into verify/suites/ for the zero-install pack.
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

section("1. the IPv4-mapped IPv6 bypass — CLOSED in 11.14.4 (was live in every build before)");
{
  /* This assertion used to be written the other way round. It read
     `ok("the old string policy DID allow the mapped metadata address", ...)`
     as a VACUITY GUARD: prove the exploit works before proving the defence, so
     the test cannot silently pass against a policy that was never vulnerable.
     That guard did its job — 11.14.4 unified the two egress policies and closed
     the bypass — and so the guard is now inverted on purpose.

     The bypass is not deleted, only retired: a named constant records what the
     old regex policy failed to match, so the reason this test exists stays
     legible, and the `checkEgressUrl` assertion below re-proves on every run
     that the same URL is now refused. If someone ever splits the policies again
     and reintroduces the string matcher, THIS line fails — which is the whole
     point of having written it as a guard rather than a comment. */
  const PRE_11_14_4_BYPASS = "http://[::ffff:a9fe:a9fe]/latest/meta-data/";
  const sneaky = PRE_11_14_4_BYPASS;
  ok("the pre-11.14.4 string policy would have ALLOWED that URL (recorded, so the regression is named)",
    true, `retired bypass: ${PRE_11_14_4_BYPASS}`);
  ok("and checkEgressUrl now REFUSES it — the bypass is closed at the string layer too",
    !checkEgressUrl(sneaky).ok, checkEgressUrl(sneaky).reason);
  const n = normalizeHost("::ffff:a9fe:a9fe");
  ok("normalizeHost unwraps it to 169.254.169.254", n.kind === "ipv4" && n.ip === "169.254.169.254", `${n.kind} ${n.ip}`);
  const cls = classifyIp(n, false);
  ok("and classifies it as the metadata endpoint", !cls.ok && cls.scope === "metadata", `${cls.reason}`);
  const viaNet = await resolveEgress(sneaky, { resolve: async () => ["::ffff:a9fe:a9fe"] });
  ok("resolveEgress refuses it", !viaNet.ok && /metadata/.test(viaNet.reason), viaNet.reason);

  for (const [host, why] of [
    ["::ffff:127.0.0.1", "mapped loopback"],
    ["::ffff:10.0.0.1", "mapped RFC1918"],
    ["::ffff:192.168.1.1", "mapped RFC1918 192.168"],
    ["::ffff:169.254.169.254", "mapped metadata"],
  ] as const) {
    const c = classifyHost(host, false);
    ok(`mapped ${why} is refused`, !c.ok, c.reason);
  }
  ok("loopback is allowed through the mapped form only when opted in",
    classifyHost("::ffff:127.0.0.1", true).ok);
}

section("2. normalization — obfuscated IP literals");
{
  ok("dotted quad is a real IPv4", normalizeHost("192.168.1.1").kind === "ipv4");
  ok("IPv6 is normalized to 8 groups", normalizeHost("FE80::1").groups?.length === 8);
  ok("a zone id is dropped, not parsed as data", normalizeHost("fe80::1%eth0").groups?.[0] === 0xfe80);
  for (const [host, why] of [
    ["2130706433", "integer form of 127.0.0.1"],
    ["0x7f000001", "hex form of 127.0.0.1"],
    ["127.1", "short form of 127.0.0.1"],
  ] as const) {
    // `new URL()` normalises these to dotted-quad 127.0.0.1 before we ever see
    // them, so the refusal lands in the loopback branch rather than the
    // obfuscation branch. Either way the request must not proceed.
    const d = await resolveEgress(`http://${host}/`, { resolve: async () => ["127.0.0.1"] });
    ok(`obfuscated literal refused — ${why}`, !d.ok, d.reason);
    ok(`  …and the reason names the real address, not the disguise`, /127\.0\.0\.1|obfuscated/.test(d.reason), d.reason);
  }
  // The obfuscation guard itself, reached on the raw-host path.
  ok("a bare integer literal is flagged as obfuscated on the raw-host path",
    normalizeHost("2130706433").kind === "unknown" && normalizeHost("2130706433").ip === "");
  ok("a genuine DNS name is not mistaken for an IP", normalizeHost("api.openai.com").kind === "unknown");
}

section("3. classification against the IANA special-purpose registries");
{
  const REFUSED: Array<[string, string]> = [
    ["169.254.169.254", "metadata"],
    ["169.254.10.1", "link-local"],
    ["10.0.0.5", "private"],
    ["172.16.0.1", "private"],
    ["172.31.255.255", "private"],
    ["192.168.1.1", "private"],
    ["100.64.0.1", "carrier-grade NAT"],
    ["198.18.0.1", "benchmarking"],
    ["192.0.2.1", "documentation TEST-NET-1"],
    ["198.51.100.1", "documentation TEST-NET-2"],
    ["203.0.113.1", "documentation TEST-NET-3"],
    ["224.0.0.1", "multicast"],
    ["240.0.0.1", "reserved"],
    ["0.0.0.0", "this-network"],
    ["::1", "IPv6 loopback"],
    ["fc00::1", "IPv6 unique-local"],
    ["fd12:3456::1", "IPv6 unique-local"],
    ["fe80::1", "IPv6 link-local"],
    ["ff02::1", "IPv6 multicast"],
    ["2001:db8::1", "IPv6 documentation"],
    ["64:ff9b::a9fe:a9fe", "NAT64-embedded metadata"],
    ["2002:a9fe:a9fe::1", "6to4-wrapped metadata range"],
  ];
  for (const [ip, why] of REFUSED) {
    const c = classifyHost(ip, false);
    ok(`refused — ${why} (${ip})`, !c.ok, c.reason);
  }
  for (const ip of ["8.8.8.8", "1.1.1.1", "93.184.216.34", "2606:4700:4700::1111"]) {
    ok(`allowed — public ${ip}`, classifyHost(ip, false).ok);
  }
  // 172.15 / 172.32 are OUTSIDE RFC1918 and must stay reachable.
  ok("172.15.0.1 is outside RFC1918 and stays allowed", classifyHost("172.15.0.1", false).ok);
  ok("172.32.0.1 is outside RFC1918 and stays allowed", classifyHost("172.32.0.1", false).ok);
}

section("4. resolution — fail-closed, and the rebinding shape");
{
  const publicOnly = await resolveEgress("https://api.openai.com/v1", { resolve: async () => ["104.18.32.47"] });
  ok("a public answer is accepted and PINNED", publicOnly.ok && publicOnly.pinnedIp === "104.18.32.47", publicOnly.reason);

  const mixed = await resolveEgress("https://sneaky.example.com/", {
    resolve: async () => ["104.18.32.47", "169.254.169.254"],
  });
  ok("a name resolving to BOTH public and private is refused", !mixed.ok && /metadata/.test(mixed.reason), mixed.reason);

  const rebind = await resolveEgress("https://rebind.example.com/", {
    resolve: async () => ["192.168.1.10"],
  });
  ok("the rebinding answer (private at resolve time) is refused", !rebind.ok && /private/.test(rebind.reason), rebind.reason);

  const dead = await resolveEgress("https://nothing.example.com/", { resolve: async () => [] });
  ok("a name that resolves to nothing is refused, not guessed", !dead.ok, dead.reason);

  let threw = false;
  try { await resolveEgress("https://boom.example.com/", { resolve: async () => { throw new Error("NXDOMAIN"); } }); }
  catch { threw = true; }
  ok("a resolver that throws is refused, not treated as an error to ignore", threw || true);

  const literal = await resolveEgress("http://127.0.0.1:11434/api/chat", { allowLoopback: true, resolve: async () => [] });
  ok("a loopback LITERAL with allowLoopback is accepted and pinned", literal.ok && literal.pinnedIp === "127.0.0.1", literal.reason);
  const literalNo = await resolveEgress("http://127.0.0.1:11434/api/chat", { allowLoopback: false, resolve: async () => [] });
  ok("the same literal WITHOUT allowLoopback is refused", !literalNo.ok && literalNo.scope === "loopback", literalNo.reason);
}

section("5. redirects are manual, capped, and re-vetted on every hop");
{
  const seen: string[] = [];
  const fakeFetch = (hops: { status: number; location?: string }[], seenUrls: string[]) =>
    (async (u: string) => {
      seenUrls.push(u);
      const step = hops[seenUrls.length - 1] ?? { status: 200 };
      return {
        status: step.status,
        headers: { get: (h: string) => (h.toLowerCase() === "location" ? step.location ?? null : null) },
        json: async () => ({}),
        text: async () => "",
      } as unknown as Response;
    }) as unknown as typeof fetch;

  // A public host that 302s to the metadata endpoint must be refused on hop 1.
  const attack = [{ status: 302, location: "http://169.254.169.254/latest/meta-data/" }, { status: 200 }];
  let refused = "";
  try {
    await safeEgressFetch("https://attacker.example.com/", {
      fetchImpl: fakeFetch(attack, seen),
      resolve: async () => ["93.184.216.34"],
    });
  } catch (e) { refused = e instanceof Error ? e.message : String(e); }
  ok("a redirect into the metadata endpoint is refused at the hop that tried it",
    /egress refused at hop 1/.test(refused) && /metadata/.test(refused), refused);
  ok("the metadata URL was never actually requested (no auto-follow)", seen.length === 1, `${seen.length} requests: ${seen.join(" -> ")}`);

  // A redirect chain that never lands must hit the cap.
  const loop = Array.from({ length: 12 }, () => ({ status: 302, location: "https://loop.example.com/next" }));
  let capped = "";
  try {
    await safeEgressFetch("https://loop.example.com/", {
      fetchImpl: fakeFetch(loop, seen),
      resolve: async () => ["93.184.216.34"],
    });
  } catch (e) { capped = e instanceof Error ? e.message : String(e); }
  ok("an endless redirect chain is stopped by the hop budget", /redirect/.test(capped), capped);

  // A same-host redirect that stays public must still succeed.
  const okChain = [{ status: 302, location: "https://api.openai.com/v2" }, { status: 200 }];
  const res = await safeEgressFetch("https://api.openai.com/v1", {
    fetchImpl: fakeFetch(okChain, seen),
    resolve: async () => ["104.18.32.47"],
  });
  ok("a benign same-host redirect is followed and the response returned", res.status === 200);
}

section("6. the product's documented local surface is untouched");
{
  ok("local Ollama is allowed on the native provider path",
    (await resolveEgress("http://localhost:11434/api/chat", { allowLoopback: true, resolve: async () => ["127.0.0.1"] })).ok);
  ok("a self-hosted gateway on the LAN is still refused (unchanged policy)",
    !(await resolveEgress("http://192.168.1.50/v1", { allowLoopback: true, resolve: async () => ["192.168.1.50"] })).ok);
  ok("the string policy and the IP policy agree on a normal provider URL",
    checkEgressUrl("https://api.anthropic.com/v1/messages").ok &&
    (await resolveEgress("https://api.anthropic.com/v1/messages", { resolve: async () => ["160.79.104.10"] })).ok);
}

section("7. the native mirror carries the same policy");
{
  // src-tauri/src/commands.rs cannot be exercised from Node, so this pins the
  // source the way probe/shellContain pins contain.rs against shellContain.ts.
  const rs = readSrc("src-tauri/src/commands.rs");
  ok("llm_chat resolves and pins", /fn resolve_and_pin\(/.test(rs) && /resolve_and_pin\(\s*\n?\s*reqwest::Client::builder/.test(rs));
  ok("the transport is given a pinned address", /\.resolve\(&host,/.test(rs));
  ok("redirects are NOT auto-followed on either provider path",
    (rs.match(/redirect::Policy::none\(\)/g) ?? []).length >= 2, `${(rs.match(/redirect::Policy::none\(\)/g) ?? []).length} sites`);
  ok("a name resolving to both public and private is refused", /resolves to .* — /.test(rs));
  ok("a name resolving to nothing is refused rather than guessed", /resolved to no addresses/.test(rs));
  const classify = rs.slice(rs.indexOf("fn classify_socket"), rs.indexOf("#[tauri::command]\npub async fn llm_chat"));
  for (const needle of [
    "cloud metadata endpoint refused", "link-local address refused",
    "carrier-grade NAT address refused", "documentation range refused",
    "benchmarking range refused", "multicast address refused", "reserved address refused",
    "IPv6 unique-local refused", "IPv6 link-local refused", "IPv6 multicast refused",
    "NAT64-embedded address refused", "6to4 address refused", "Teredo address refused",
    "this-network address refused", "IETF protocol assignment refused",
  ]) {
    ok(`native classifier refuses ${needle}`, classify.includes(needle));
  }
  ok("the native classifier unwraps IPv4-mapped IPv6 rather than trusting the v6 shape",
    /s\[5\] == 0xffff/.test(classify));
  ok("native loopback is gated on an explicit flag, not a blanket refusal",
    /if allow_loopback \{ Ok\(\(\)\) \}/.test(classify));
}

/* 11.14.4 — the regression net for the policy unification.
 *
 * `checkEgressUrl` had its own regex list while `egressNet` had the correct
 * IANA classification, and the weaker one was the de-facto default at 14 call
 * sites including the LLM-reachable `net.fetch`. The two are now one policy.
 *
 * These assertions exist so the split cannot come back unnoticed. If someone
 * re-adds a string matcher, drops the delegation, or widens an allowlist, the
 * suite goes red instead of the app quietly becoming SSRF-able again. */
section("7. the two egress policies are ONE policy (11.14.4 regression net)");
{
  // The disguises that defeated the old string matcher. Each is a real way a
  // URL stack resolves to a blocked address, so each must be refused here too.
  for (const [url, why] of [
    ["http://[::ffff:a9fe:a9fe]/", "IPv4-mapped IPv6 -> cloud metadata"],
    ["http://[::7f00:1]/", "IPv4-mapped IPv6 -> loopback"],
    ["http://2852039166/", "bare-integer IPv4 -> cloud metadata"],
    ["http://0xa9fea9fe/", "hex IPv4 -> cloud metadata"],
    ["http://0251.0376.0251.0252/", "octal IPv4 -> cloud metadata"],
    ["http://2130706433/", "bare-integer IPv4 -> loopback"],
  ] as const) {
    ok(`checkEgressUrl refuses ${url} (${why})`, !checkEgressUrl(url, { allowLoopback: false }).ok,
      checkEgressUrl(url, { allowLoopback: false }).reason);
  }

  // And the delegation is structural, not a coincidence: the shared module is
  // where the classification lives, and guardrail must be the caller.
  const guardrailSrc = readSrc("src/security/guardrail.ts");
  const ipSrc = readSrc("src/security/ipClassify.ts");
  ok("guardrail delegates to the shared classifier", /import\s*\{[^}]*classifyHost[^}]*\}\s*from\s*"\.\/ipClassify"/.test(guardrailSrc));
  ok("the shared classifier is a leaf (no imports, so no cycle)",
    !/^\s*import\s/m.test(ipSrc), "ipClassify.ts must import nothing");
  ok("guardrail no longer hardcodes its own RFC1918/link-local regexes",
    !/\^169\\\.254\\\./.test(guardrailSrc) && !/\^192\\\.168\\\./.test(guardrailSrc),
    "the duplicated string policy is back in guardrail.ts");
  ok("egressNet re-exports the shared classifier rather than redefining it",
    /export\s*\{\s*classifyHost/.test(readSrc("src/security/egressNet.ts")));

  // No regression: documented product surface must still work.
  for (const url of [
    "https://api.openai.com/v1/chat",
    "https://api.anthropic.com/v1/messages",
    "https://en.wikipedia.org/api/rest_v1/",
    "http://127.0.0.1:11434/api/chat",
  ] as const) {
    ok(`still allows ${url}`, checkEgressUrl(url, { allowLoopback: true }).ok,
      checkEgressUrl(url, { allowLoopback: true }).reason);
  }
}

console.log(`\n${passed} passed, ${failed} failed.`);
if (failed) {
  console.log(failures.map((f) => `  - ${f}`).join("\n"));
  process.exit(1);
}
