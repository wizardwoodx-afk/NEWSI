/**
 * probe/pairing.test.ts — peer pairing, bind scope, and a clean stop.
 *
 * Three findings from the release review live here, because they are one story:
 * a desktop-mounted A2A host could not be reached by a peer, could not safely be
 * given a credential, and was killed rather than asked to stop.
 *
 *   LOCAL-ONLY. The host defaults to 127.0.0.1 and the supervisor passed no bind
 *   address at all, so the Federation screen's promise to "let other nodes
 *   delegate work to this one" was true only for this machine. The fix is an
 *   explicit scope chosen before the mount — never a wildcard.
 *
 *   NO CREDENTIAL ROUTE. The supervisor rightly never returns the host's bearer
 *   token, and that left remote federation impossible: the credential existed
 *   and no honest path to it did. Pairing is that path — a one-time code the
 *   operator reads out, which mints a credential scoped to one peer.
 *
 *   FORCEFUL STOP. `kill()` worked, but the host has a SIGTERM handler that
 *   closes its own listener. Unmounting should use the path the host provides.
 */
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  createInvitation, redeemInvitation, credentialStatus, describeInvitation,
  type Invitation,
} from "../src/mission/pairing";
import { claimPairing } from "../src/mission/a2aClient";

const ROOT: string = process.env.SI_ROOT ?? process.cwd();
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

let passed = 0;
let failed = 0;
const failures: string[] = [];
const ok = (label: string, cond: boolean, detail = ""): void => {
  if (cond) { passed += 1; console.log(`  ok   ${label}`); }
  else { failed += 1; failures.push(`${label}${detail ? ` — ${detail}` : ""}`); console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`); }
};
const section = (n: string): void => console.log(`\n== ${n}`);

const NONCE = "si-stop-test-nonce-0123456789";

async function modelTests(): Promise<void> {
  section("1. an invitation is single-use, short, and not the token");
  const { invitation, code } = await createInvitation({ hostFp: "FP-HOST", selfimpulse: "USER 1" });
  ok("a code is minted", /^[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(code), code);
  ok("it avoids characters people mishear", !/[01OI]/.test(code), code);
  ok("the invitation stores no code, only a digest", !JSON.stringify(invitation).includes(code));
  ok("it expires within minutes, not hours", invitation.expiresAt - invitation.issuedAt <= 900_000);
  ok("it is bound to this host's identity", invitation.hostFp === "FP-HOST" && invitation.selfimpulse === "USER 1");

  section("2. redeeming spends it");
  const first = await redeemInvitation({ invitation, code, peer: { fp: "FP-PEER", name: "laptop" } });
  ok("the right code redeems", first.ok === true, first.ok ? "" : first.reason);
  const cred = first.ok ? first.credential : null;
  ok("the credential is scoped and expiring", Boolean(cred && cred.expiresAt > Date.now() && cred.scope.includes("delegate")));
  ok("it is a PAIRED credential, not the host's bearer token", Boolean(cred && cred.token.startsWith("vhp_")), cred?.token.slice(0, 8) ?? "");
  ok("it records which peer took it", first.ok && first.invitation.redeemedBy?.fp === "FP-PEER");
  ok("it is bound to the host identity it came from", cred?.hostFp === "FP-HOST");

  const replay = await redeemInvitation({ invitation: first.ok ? first.invitation : invitation, code, peer: { fp: "FP-OTHER", name: "attacker" } });
  ok("the SAME code cannot be redeemed twice", replay.ok === false);
  ok("and the refusal says it was used", !replay.ok && /already used/.test(replay.reason), replay.ok ? "" : replay.reason);
  ok("a second peer cannot ride the first peer's code", !replay.ok && (replay.invitation.redeemedBy?.fp === "FP-PEER"));

  section("3. wrong codes are expensive, not free");
  {
    const m = await createInvitation({ hostFp: "FP-HOST", selfimpulse: "USER 1" });
    for (let i = 0; i < 4; i += 1) {
      const r = await redeemInvitation({ invitation: m.invitation, code: "ZZZZ-ZZZZ", peer: { fp: "FP-X", name: "guess" } });
      ok(`guess ${i + 1} is refused`, r.ok === false);
      if (!r.ok) m.invitation = r.invitation;
    }
    const last = await redeemInvitation({ invitation: m.invitation, code: "ZZZZ-ZZZZ", peer: { fp: "FP-X", name: "guess" } });
    ok("the fifth wrong guess voids the invitation", !last.ok && last.invitation.state === "destroyed", last.ok ? "" : last.reason);
    const after = await redeemInvitation({ invitation: last.invitation, code, peer: { fp: "FP-X", name: "guess" } });
    ok("a void invitation cannot be redeemed with the CORRECT code either", after.ok === false,
      "a destroyed invitation is a resource that still works");
    ok("and it says so", !after.ok && /void|destroyed/.test(after.reason), after.ok ? "" : after.reason);
  }

  section("4. time is not a suggestion");
  {
    const m = await createInvitation({ hostFp: "FP-HOST", selfimpulse: "USER 1" });
    const later = m.invitation.expiresAt + 1;
    ok("an expired invitation is not redeemable", (await redeemInvitation({ invitation: m.invitation, code, peer: { fp: "FP-P", name: "late" }, now: later })).ok === false);
    ok("describeInvitation says expired", /expired/.test(describeInvitation(m.invitation, later)));
    const live = describeInvitation(m.invitation);
    ok("a live one says what it is waiting for", /waiting for a peer/.test(live), live);
    ok("…and how long is left", /\d+s left/.test(live), live);
    ok("a spent one names the peer who spent it", /used by laptop/.test(describeInvitation(first.ok ? first.invitation : m.invitation)));
  }

  section("5. credentials expire and are shaped honestly");
  {
    const c = first.ok ? first.credential : null;
    if (!c) { ok("credential present", false); return; }
    ok("a fresh credential is valid", credentialStatus(c).valid === true);
    ok("an expired one is not", credentialStatus(c, c.expiresAt + 1).valid === false);
    ok("and the refusal is in words", /expired/.test(credentialStatus(c, c.expiresAt + 1).reason));
    ok("something that is not a paired credential is refused outright",
      credentialStatus({ ...c, token: "si-someone-elses-token" }).valid === false);
  }

  section("6. a live mount: bind scope, pairing code, paired credential, clean stop");
  const child = spawn(process.execPath, [
    path.join(ROOT, "tools", "si-host.mjs"),
    "--selfimpulse", "PAIR-PROBE",
    "--port", "0",
    "--pair",
  ], {
    cwd: ROOT, stdio: ["ignore", "pipe", "pipe"],
    // The supervisor passes the unmount nonce this way; doing the same here is
    // what lets this suite exercise the real unmount channel rather than a
    // stand-in for it.
    env: { ...process.env, HANDLE_STOP_NONCE: NONCE },
  }) as ChildProcessWithoutNullStreams;
  let out = "";
  let err = "";
  let ready: Record<string, unknown> | null = null;
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (c: string) => {
    out += c;
    for (const line of c.split("\n")) {
      if (line.startsWith("SI-A2A-READY") && !ready) {
        try { ready = JSON.parse(line.slice("SI-A2A-READY".length).trim()); } catch { ready = {}; }
      }
    }
  });
  child.stderr.on("data", (c: string) => { err += c; });

  try {
    const deadline = Date.now() + 40_000;
    while (!ready && Date.now() < deadline) await sleep(200);
    ok("the host mounted", ready !== null, err.slice(0, 300));

    const d = (ready ?? {}) as Record<string, unknown>;
    ok("it is bound to loopback unless told otherwise", String(d.interfaceUrl).startsWith("http://127.0.0.1"), String(d.interfaceUrl));
    ok("the card advertises the loopback URL, not a wildcard", String(d.cardUrl).startsWith("http://127.0.0.1"));

    /* THE CREDENTIAL ROUTE, end to end. */
    const liveCode = (d.pairing as Record<string, unknown> | undefined)?.code;
    ok("a pairing code is published in the READY descriptor", typeof liveCode === "string" && liveCode.length > 0);
    ok("the host's OWN TOKEN IS NOT IN THE READY LINE", typeof d.tokenEnforced === "boolean" && d.token !== undefined ? !out.includes(String(d.token)) : !/"token"/.test(out.split("\n")[0] ?? ""),
      "the READY line carries the bearer token, so anything that tees stdout leaks it");
    ok("…but the host does say it enforces one", d.tokenEnforced === true, JSON.stringify(d).slice(0, 160));

    const port = d.port as number;
    const base = `http://127.0.0.1:${port}`;

    const wrong = await claimPairing({ hostRoot: base, code: "QQQQ-QQQQ", peerFp: "FP-PEER-3", peerName: "guess" });
    ok("a wrong code is refused, and the refusal names the cost of guessing", wrong.ok === false && /attempt/.test(wrong.reason), wrong.ok ? "" : wrong.reason);

    const claimed = await claimPairing({ hostRoot: base, code: String(liveCode), peerFp: "FP-PEER-1", peerName: "peer-laptop" });
    // archive-6 audit: the claim helper obeys the SAME egress policy as the JSON-RPC client, and reports
    // the origin that issued the credential so the AlterSend helpers can refuse to send it anywhere else.
    {
      const realFetch = globalThis.fetch;
      const spied: string[] = [];
      globalThis.fetch = (async (input: unknown) => { spied.push(String(input)); throw new Error("fetch spy"); }) as typeof fetch;
      try {
        for (const url of ["http://192.168.1.20:41234", "http://10.1.2.3:41234", "http://169.254.169.254", "ftp://host"]) {
          const r = await claimPairing({ hostRoot: url, code: "AAAA-AAAA", peerFp: "FP", peerName: "n" });
          ok(`claimPairing refuses ${url} before any request`, !r.ok && /egress-refused|http\(s\)/.test((r as { reason: string }).reason), JSON.stringify(r));
        }
        ok("…and no request left the process for any of them (the pairing code never moved)", spied.length === 0, spied.join(","));
      } finally {
        globalThis.fetch = realFetch;
      }
    }
    ok("a successful claim reports the origin that issued the credential", claimed.ok === true && claimed.origin === new URL(base).origin, claimed.ok ? String(claimed.origin) : claimed.reason);
    ok("a peer redeems the code over the wire", claimed.ok === true, claimed.ok ? "" : claimed.reason);
    ok("it gets a credential, not the host token",
      claimed.ok && claimed.credential.token.startsWith("vhp_") && claimed.credential.token !== d.token);

    /* The credential must actually pass the same gate the host token passes. */
    const rpc = async (token: string): Promise<{ status: number; body: string }> => {
      const res = await fetch(`${base}/`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({ jsonrpc: "2.0", id: "probe-1", method: "message/send", params: { message: { role: "user", parts: [{ kind: "text", text: "ping" }] } } }),
        signal: AbortSignal.timeout(10_000),
      });
      return { status: res.status, body: await res.text() };
    };
    const withPaired = await rpc(claimed.ok ? claimed.credential.token : "");
    ok("the paired credential is ACCEPTED by the auth gate", !/unauthorized/.test(withPaired.body), withPaired.body.slice(0, 200));
    const withBogus = await rpc("vhp_totally-made-up");
    ok("a made-up credential is REFUSED by the same gate", /unauthorized/.test(withBogus.body), withBogus.body.slice(0, 200));

    const replayed = await claimPairing({ hostRoot: base, code: String(liveCode), peerFp: "FP-PEER-2", peerName: "attacker" });
    ok("the code cannot be redeemed a second time over the wire", replayed.ok === false);
    ok("and the host's refusal is specific", !replayed.ok && /already used/.test(replayed.reason), replayed.ok ? "" : replayed.reason);

    /* CLEAN STOP — the host unmounts ITSELF, over its own channel. */
    const stop = async (nonce: string): Promise<number> => {
      const res = await fetch(`${base}/vh/stop`, {
        method: "POST", headers: { "x-si-stop-nonce": nonce }, signal: AbortSignal.timeout(8000),
      });
      await res.text();
      return res.status;
    };
    ok("a WRONG unmount nonce is refused", (await stop("not-the-nonce")) === 403);
    ok("…and the host is still listening after the refusal", child.exitCode === null && /SI-A2A-STOPPED/.test(out) === false);
    let stillUp = true;
    try { await fetch(`${base}/.well-known/agent-card.json`, { signal: AbortSignal.timeout(2500) }); } catch { stillUp = false; }
    ok("…and still serving its card", stillUp, "a refused unmount took the host down anyway");

    ok("the right nonce is accepted", (await stop(NONCE)) === 200);
    const stopAt = Date.now();
    while (Date.now() < stopAt + 12_000 && child.exitCode === null) await sleep(150);
    ok("the host unmounted ITSELF and wrote its own shutdown line", /SI-A2A-STOPPED/.test(out),
      (out + err).split("\n").slice(-3).join(" | ").slice(0, 200));
    ok("a clean unmount exits 0, with no signal", child.exitCode === 0 && child.signalCode === null,
      `exit=${child.exitCode} signal=${child.signalCode}`);
    await sleep(400);
    let stillServing = true;
    try { await fetch(`${base}/.well-known/agent-card.json`, { signal: AbortSignal.timeout(2500) }); } catch { stillServing = false; }
    ok("and the card stops being served", !stillServing);
  } finally {
    if (child.exitCode === null) { child.kill("SIGKILL"); await sleep(300); }
  }
}

async function sourceTests(): Promise<void> {
  section("7. the supervisor is where bind scope and pairing are decided");
  const sup = fs.readFileSync(path.join(ROOT, "src-tauri", "src", "a2a_host.rs"), "utf8");
  ok("the start command takes a bind scope", /bind: Option<String>/.test(sup));
  ok("and defaults it to the narrowest choice", sup.includes('bind.as_deref().unwrap_or("local")'));
  ok("it passes --host to the host", sup.includes('.arg("--host")'));
  ok("a wildcard bind is refused by name", sup.includes("0.0.0.0") && sup.includes("A wildcard bind is never offered"));
  ok("a LAN mount resolves to a real interface address, not a wildcard", /fn lan_address/.test(sup) && /TEST-NET-1/.test(sup));
  ok("…and refuses rather than guessing when there is none", /does not have a routable one/.test(sup));
  ok("it passes --pair only when the operator asked", sup.includes("if pair.unwrap_or(false)"));
  ok("status reports what it is bound to", /"bindAddress"/.test(sup) && /"bindScope"/.test(sup));
  ok("the host token still never crosses to the frontend", !/"token":/.test(sup) && /token. is deliberately NOT read/.test(sup));
  ok("the one-time code is what crosses", /"pairingCode"/.test(sup));

  section("8. stopping is graceful, with a fallback");
  ok("unmount asks the HOST to stop, over its own channel", sup.includes("request_unmount(&m)") && sup.includes("/vh/stop"));
  ok("the channel is nonce-guarded", sup.includes("x-si-stop-nonce") && sup.includes("stop_nonce"));
  ok("and the nonce travels by environment, never argv", sup.includes('cmd.env("HANDLE_STOP_NONCE"'));
  ok("killing is the FALLBACK, not the plan", sup.includes("did not unmount when asked and had to be killed") && sup.includes("let _ = m.child.kill();"));
  ok("the operator is told which path it took", sup.includes('"graceful": graceful'));
  ok("no unsafe block was needed to do any of it", !sup.includes("unsafe"));
  ok("the operator is told which path it took", /"graceful": graceful/.test(sup));
  ok("quitting uses the same path", sup.includes("request_unmount(&m)") && sup.includes("wait_for_exit(&mut m.child, Duration::from_secs(3))"));
  const server2 = fs.readFileSync(path.join(ROOT, "src", "mission", "a2aServer.ts"), "utf8");
  ok("the unmount endpoint is nonce-guarded, not open", server2.includes("unmount-refused") && server2.includes("x-si-stop-nonce"));
  ok("it is off unless a nonce was supplied", server2.includes("onStop?:") && server2.includes("opts.onStop = undefined") === false);
  const runtime2 = fs.readFileSync(path.join(ROOT, "src", "mission", "a2aRuntime.ts"), "utf8");
  ok("the host writes its own shutdown line before leaving", runtime2.includes("SI-A2A-STOPPED") && runtime2.includes("shutdownThenExit"));
  ok("a wrong nonce is refused without stopping anything", runtime2.includes("constantTimeEqual(presented, opts.stopNonce"));

  section("9. the endpoint cannot be reached as an A2A method");
  const server = fs.readFileSync(path.join(ROOT, "src", "mission", "a2aServer.ts"), "utf8");
  ok("pairing is a separate path, not an RPC method", server.includes('export const PAIR_PATH = "/vh/pair"') && !server.includes('case "vh/pair"'));
  ok("it is served before the bearer check — redeeming is what GETS a credential",
    server.indexOf("req.url === PAIR_PATH") < server.indexOf("opts.authorize(req)"));
  ok("it answers 404 when the host is not pairing", /not-pairing/.test(server));
  ok("it validates the request rather than trusting it", /needs a code and the peer's identity/.test(server));
  ok("a refusal is specific, not a bare status", /pairing-refused/.test(server));

  const runtime = fs.readFileSync(path.join(ROOT, "src", "mission", "a2aRuntime.ts"), "utf8");
  ok("a paired credential passes the same gate as the host token", runtime.includes("presented === token") && runtime.includes("peers.get(presented)"));
  ok("an expired credential is removed, not merely rejected", runtime.includes("peers.delete(presented)"));
  ok("pairing is off unless the operator asked for it", runtime.includes("pairing?: boolean") && runtime.includes("opts.pairing === true"));
  ok("the spent invitation replaces the live one", runtime.includes("invitation = r.invitation"));

  section("10. the screen states the choice before making it");
  const screen = fs.readFileSync(path.join(ROOT, "src", "ui", "screens", "Federation.tsx"), "utf8");
  ok("both scopes are offered", /federation-bind-local/.test(screen) && /federation-bind-lan/.test(screen));
  ok("local is the default", screen.includes('useState<"local" | "lan">("local")'));
  ok("the screen says there is no wildcard option", screen.includes("There is no &ldquo;everything&rdquo; option"));
  ok("it warns what a network bind exposes", screen.includes("Anything else on the same network can"));
  ok("the pairing code is shown as a one-time code",
    screen.includes("works <strong>once</strong>") && screen.includes("federation-pairing-code"));
  ok("and it is explicit that the token is not it", screen.includes("the host&rsquo;s token") || screen.includes("not the host"));
  ok("the live view shows what it is bound to", /federation-bind/.test(screen));
}

async function main(): Promise<void> {
  await modelTests();
  await sourceTests();
  console.log(`\n${passed} passed, ${failed} failed.`);
  if (failed) {
    console.log(failures.map((f) => `  - ${f}`).join("\n"));
    process.exit(1);
  }
}

void main();
