/**
 * probe/a2aRuntime.test.ts â€” THE MOUNT, proved across processes.
 *
 * WHY THIS SUITE EXISTS. `probe/a2aV10` pins the wire, `probe/a2aBridge` pins
 * the LiveBridge, and between them they proved the architecture works *when a
 * test wires it up*. Neither could see that nothing in the shipped product ever
 * called `createA2AServer()`: the only callers were probes. An external review
 * found exactly that and scored "runtime integration" 8.7 â€” correctly. A passing
 * end-to-end harness is not evidence that the application a user launches
 * exposes the architecture by default.
 *
 * So this suite tests the thing that was missing, at the level it was missing:
 *
 *   Â§1  the bootstrap mounts a selfimpulse: signed card served over real HTTP, the
 *       interface URL it advertises is the port it actually bound
 *   Â§2  the SHIPPED launcher runs the SHIPPED engine: the bundle is byte-pinned,
 *       a tampered engine fails closed, `npm run host` exists
 *   Â§3  TWO INDEPENDENT VH PROCESSES: discover â†’ authorize â†’ real TeamExecutor
 *       mission â†’ receipt that verifies in a THIRD process
 *   Â§4  a mounted selfimpulse that cannot execute refuses in words
 *   Â§5  anti-cheat across the wire: a failing repository is `executed-failed`
 *   Â§6  the receiver grades the request itself â€” a sender's "safe" is a claim
 *
 * Everything here is real: real child processes, real HTTP, real git worktrees,
 * real CLI spawns, the repository's own test command as the verdict, real seals.
 * The one labelled exception is the drill seat (Â§3/Â§5): on a host with no agent
 * CLI installed the "agent" is a deterministic local script â€” a real process, a
 * deterministic brain, reported as such by `describe()` and stamped into every
 * artifact it produces. The machinery under test is not deterministic.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, execFileSync, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createHash } from "node:crypto";
declare const SI_ROOT: string;
const ROOT = SI_ROOT ?? process.cwd();

import { drillBridgeConfig, makeSelfImpulseIdentity, nodeRunnerDeps, startA2ARuntime, type A2ARuntime } from "../src/mission/a2aRuntime";
import { receiverRiskVerdict, createTeam, addTeammate } from "../src/mission/selfimpulseTeams";
import { validateAgentCardV10, verifyAgentCardV10Signatures } from "../src/mission/a2aV10";
import { verifyProofReceipt } from "../src/mission/receipts";

let pass = 0;
let fail = 0;
const failures: string[] = [];
function ok(label: string, cond: boolean, detail = ""): void {
  if (cond) { pass += 1; console.log(`  ok   ${label}`); }
  else { fail += 1; failures.push(label); console.log(`  FAIL ${label}${detail ? ` â€” ${detail}` : ""}`); }
}
function section(name: string): void { console.log(`\n== ${name}`); }

const scratchDirs: string[] = [];
/** Every host process this suite launched. Killed in `finally` â€” a suite that
 *  throws mid-run must not leave a selfimpulse listening on the machine. */
const launched: HostProc[] = [];
function scratch(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  scratchDirs.push(dir);
  return dir;
}

function sh(args: string[], cwd: string): { code: number | null; out: string } {
  try {
    const out = execFileSync(args[0], args.slice(1), { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, GIT_TERMINAL_PROMPT: "0" } });
    return { code: 0, out };
  } catch (e) {
    const err = e as { status?: number | null; stdout?: string; stderr?: string };
    return { code: err.status ?? null, out: `${err.stdout ?? ""}${err.stderr ?? ""}` };
  }
}

const BUGGY_GUARD = `function authorize(role, user) {
  if (role === "admin") return true; // BUG: disabled admins still pass
  return Boolean(user && user.active);
}
module.exports = { authorize };
`;
const TEST_JS = `const { authorize } = require("./guard");
let bad = 0;
if (authorize("admin", { active: false })) { bad++; console.error("disabled admin allowed"); }
if (!authorize("admin", { active: true })) { bad++; console.error("active admin denied"); }
if (bad) process.exit(1);
console.log("all tests pass");
`;

/** A real git repository whose OWN test command is the verdict. */
function makeRepo(): { repo: string; baseBranch: string } {
  const repo = scratch("vhruntime-");
  fs.writeFileSync(path.join(repo, "README.md"), "# guard\n\nAn authorization guard.\n");
  fs.writeFileSync(path.join(repo, "guard.js"), BUGGY_GUARD);
  fs.writeFileSync(path.join(repo, "test.js"), TEST_JS);
  fs.writeFileSync(path.join(repo, "package.json"), JSON.stringify({ name: "guard", version: "1.0.0", scripts: { test: "node test.js" } }, null, 2));
  sh(["git", "init", "-q", "."], repo);
  sh(["git", "config", "user.email", "vh@vh.desktop"], repo);
  sh(["git", "config", "user.name", "VH"], repo);
  sh(["git", "add", "-A"], repo);
  sh(["git", "commit", "-qm", "initial commit"], repo);
  const baseBranch = sh(["git", "rev-parse", "--abbrev-ref", "HEAD"], repo).out.trim() || "master";
  return { repo, baseBranch };
}

const HARDEN = "Harden authorize() so it denies disabled admins, proven by the repository's own test.";
const MATE = { name: "Lens", title: "Code hardener", description: "Hardens authorization code and proves every change with the repository's own tests.", skills: ["security", "testing"] };

/* â”€â”€ host-process helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

interface HostProc {
  child: ChildProcessWithoutNullStreams;
  stdout: string;
  stderr: string;
  ready: Record<string, unknown> | null;
  port: number;
  baseUrl: string;
  stop(): Promise<void>;
}

function launchHost(args: string[]): HostProc {
  const child = spawn(process.execPath, [path.join(ROOT, "tools", "si-host.mjs"), ...args], {
    cwd: ROOT,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env },
  }) as ChildProcessWithoutNullStreams;
  const hp: HostProc = {
    child, stdout: "", stderr: "", ready: null, port: 0, baseUrl: "",
    stop: () => new Promise<void>((resolve) => {
      if (child.exitCode !== null) { resolve(); return; }
      child.once("exit", () => resolve());
      child.kill("SIGTERM");
      setTimeout(() => { try { child.kill("SIGKILL"); } catch { /* gone */ } resolve(); }, 4000);
    }),
  };
  child.stdout.on("data", (b) => { hp.stdout += String(b); });
  child.stderr.on("data", (b) => { hp.stderr += String(b); });
  launched.push(hp);
  return hp;
}

async function waitFor(hp: HostProc, marker: string, ms = 25_000): Promise<string | null> {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const line = hp.stdout.split("\n").find((l) => l.startsWith(marker));
    if (line) return line.slice(marker.length).trim();
    if (hp.child.exitCode !== null) return null;
    await new Promise((r) => setTimeout(r, 60));
  }
  return null;
}

function parseLine(hp: HostProc, marker: string): Record<string, unknown> | null {
  const line = hp.stdout.split("\n").find((l) => l.startsWith(marker));
  if (!line) return null;
  try { return JSON.parse(line.slice(marker.length).trim()) as Record<string, unknown>; } catch { return null; }
}

/**
 * A second, independent receipt check: the shipped CLI verifier, as its own
 * process. `--issuer-key` supplies the out-of-band trust anchor the verifier
 * demands â€” without it a mathematically valid receipt exits 3 ("issuer
 * UNVERIFIED") rather than being presented as authenticated.
 */
function verifyReceiptCli(receiptPath: string, issuerKey?: string): { code: number | null; out: string } {
  const args = [path.join(ROOT, "tools", "verify-receipt.mjs"), receiptPath];
  if (issuerKey) args.push("--issuer-key", issuerKey);
  try {
    const out = execFileSync(process.execPath, args, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    return { code: 0, out };
  } catch (e) {
    const err = e as { status?: number | null; stdout?: string; stderr?: string };
    return { code: err.status ?? null, out: `${err.stdout ?? ""}${err.stderr ?? ""}` };
  }
}

interface DelegatedLine {
  ok: boolean;
  record: {
    status: string;
    toTeammate: string | null;
    tier: string;
    note: string;
    artifact: string | null;
    execution: { harness: string; runStatus: string; seatsRun: number; seatsVerified: number; summary: string } | null;
    receipt: Record<string, unknown> | null;
    receiverPolicy: { risk: string; effectiveTier: string; upgraded: boolean } | null;
  };
}

async function main(): Promise<void> {
  /* â•â• Â§1 the bootstrap mounts a real listener â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
  section("1. startA2ARuntime mounts a selfimpulse (in-process, real HTTP)");

  const { repo, baseBranch } = makeRepo();
  const runtime: A2ARuntime = await startA2ARuntime({
    selfimpulseUser: "USER 2",
    teammates: [MATE],
    port: 0,
    token: "link-secret-for-probe",
    bridge: drillBridgeConfig({ repoRoot: repo, baseBranch, testCommand: ["node", "test.js"] }),
  });
  const desc = runtime.describe();
  ok("the runtime reports itself mounted", desc.mounted === true && desc.selfimpulseUser === "USER 2");
  ok("the card is signed and served from the port that actually bound",
    desc.cardSigned === true && desc.interfaceUrl === `http://127.0.0.1:${runtime.port}/` && desc.cardUrl.startsWith(runtime.baseUrl));
  ok("describe() names the receiver policy and the gate default",
    desc.policy.receiverRiskMode === "high-and-critical" && desc.policy.riskyGate === "deny");
  // 19.7.15: `executable` no longer means "a harness binary is on the PATH" â€”
  // external coding-agent CLIs are removed, so there is no binary to report.
  // It means the only thing that still gates a real run: an in-process seat
  // runner exists. writerBin/reviewerBin are therefore null BY DESIGN, and the
  // assertion below pins that so nobody reintroduces a binary lookup here.
  ok("describe() reports the bridge truthfully (an in-process seat runner exists)",
    desc.bridge.executable === true && desc.bridge.refusalReason === null,
    JSON.stringify(desc.bridge));
  ok("no agent binary is reported, because none exists to report",
    desc.bridge.writerBin === null && desc.bridge.reviewerBin === null,
    JSON.stringify(desc.bridge));

  const cardResp = await fetch(runtime.cardUrl);
  const servedCard = (await cardResp.json()) as Record<string, unknown>;
  ok("the well-known card is real HTTP 200 JSON and passes the strict v1.0.0 validator",
    cardResp.status === 200 && validateAgentCardV10(servedCard).length === 0, validateAgentCardV10(servedCard).join("; "));
  const sig = await verifyAgentCardV10Signatures(servedCard as never, runtime.identity.publicJwk);
  ok("the served card's JWS verifies against the selfimpulse's own publisher key", sig.ok === true && sig.verified.includes(runtime.identity.fp));

  const unauth = await fetch(runtime.baseUrl, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer wrong-token" },
    body: JSON.stringify({ jsonrpc: "2.0", id: "x1", method: "message/send", params: { message: { role: "user", parts: [{ kind: "text", text: "hello" }] } } }),
  });
  const unauthBody = (await unauth.json()) as { error?: { message?: string } };
  ok("a request without the shared token never reaches a task", unauth.status === 401 || unauthBody.error !== undefined, `HTTP ${unauth.status} ${JSON.stringify(unauthBody)}`);
  await runtime.stop();

  /* â•â• Â§2 the shipped launcher runs the shipped engine â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
  section("2. the shipped launcher runs the pinned engine (not a stale one)");

  const entry = fs.readFileSync(path.join(ROOT, "tools", "si-host.entry.ts"), "utf8");
  ok("the host entry point calls the ONE bootstrap", entry.includes("startA2ARuntime(") && entry.includes('from "../src/mission/a2aRuntime"'));
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8")) as { scripts: Record<string, string> };
  ok("npm run host and npm run host:build exist", pkg.scripts.host === "node tools/si-host.mjs" && pkg.scripts["host:build"] === "node tools/build-host.mjs");

  const shipped = fs.readFileSync(path.join(ROOT, "tools", "si-host-engine.mjs"));
  const pin = fs.readFileSync(path.join(ROOT, "tools", "si-host-engine.sha256"), "utf8").trim().split(/\s+/)[0];
  ok("the shipped engine matches its committed sha256 pin (offline-capable gate)",
    pin.length === 64 && pin === createHash("sha256").update(shipped).digest("hex"));

  /* Same discipline as probe/mcpRouter: the sha256 pin is the offline gate, and
     the source rebuild is an EXTRA check that needs esbuild â€” so it is skipped,
     loudly, when the pack runs with no node_modules. Spawning the CLI binary
     (rather than importing the package) is deliberate: node_modules/.bin/esbuild
     is a native executable on some installs, and this suite must stay
     dependency-free to ship inside the offline verification pack. */
  const esbuildBin = process.platform === "win32"
    ? path.join(ROOT, "node_modules", "@esbuild", `win32-${process.arch}`, "esbuild.exe")
    : path.join(ROOT, "node_modules", ".bin", "esbuild");
  if (!fs.existsSync(esbuildBin)) {
    console.log("  (esbuild not available here â€” source-rebuild check skipped; the sha256 pin above is enforced)");
  } else {
    const rebuilt = path.join(scratch("vhhost-rebuild-"), "si-host-engine.mjs");
    execFileSync(esbuildBin, [
      path.join(ROOT, "tools", "si-host.entry.ts"),
      "--bundle", "--platform=node", "--format=esm", "--packages=external",
      `--outfile=${rebuilt}`, "--log-level=warning",
    ], { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"] });
    ok("the shipped host engine is byte-identical to a rebuild of its source",
      shipped.equals(fs.readFileSync(rebuilt)), `shipped ${shipped.length}B vs rebuilt ${fs.statSync(rebuilt).size}B`);
  }

  /* tamper: a launcher next to a doctored engine must refuse to listen */
  const tamperDir = scratch("vhhost-tamper-");
  fs.copyFileSync(path.join(ROOT, "tools", "si-host.mjs"), path.join(tamperDir, "si-host.mjs"));
  const doctored = Buffer.from(shipped);
  doctored[Math.floor(doctored.length / 2)] = doctored[Math.floor(doctored.length / 2)] ^ 0xff;
  fs.writeFileSync(path.join(tamperDir, "si-host-engine.mjs"), doctored);
  fs.copyFileSync(path.join(ROOT, "tools", "si-host-engine.sha256"), path.join(tamperDir, "si-host-engine.sha256"));
  let tamperCode: number | null = 0;
  let tamperOut = "";
  try {
    tamperOut = execFileSync(process.execPath, [path.join(tamperDir, "si-host.mjs"), "--selfimpulse", "X"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  } catch (e) {
    const err = e as { status?: number | null; stdout?: string; stderr?: string };
    tamperCode = err.status ?? null;
    tamperOut = `${err.stdout ?? ""}${err.stderr ?? ""}`;
  }
  ok("a doctored engine fails closed instead of listening", tamperCode === 2 && /does not match its pin/.test(tamperOut), `exit=${tamperCode} ${tamperOut.slice(0, 160)}`);

  /* â•â• Â§3 TWO INDEPENDENT VH PROCESSES â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
  section("3. two independently running VH instances: discover â†’ authorize â†’ execute â†’ verify");

  const live = makeRepo();
  const recvArgs = [
    "--selfimpulse", "USER 2",
    "--teammate", `${MATE.name}|${MATE.title}|${MATE.description}|${MATE.skills.join(",")}`,
    "--port", "0",
    "--token", "shared-link-secret",
    "--repo", live.repo,
    "--test-cmd", "node test.js",
    "--base-branch", live.baseBranch,
    "--seat-mode", "drill",
  ];
  const jwkPath = path.join(scratch("vhjwk-"), "peer.jwk");
  const receiver = launchHost([...recvArgs, "--write-jwk", jwkPath]);
  const readyRaw = await waitFor(receiver, "SI-A2A-READY");
  const ready = parseLine(receiver, "SI-A2A-READY");
  ok("the receiver PROCESS mounted and announced itself", readyRaw !== null && ready?.mounted === true && typeof ready?.port === "number", receiver.stderr.slice(0, 200));
  const recvPort = Number(ready?.port ?? 0);
  const recvRoot = `http://127.0.0.1:${recvPort}`;
  ok("the announced card URL is on the port the process bound", ready?.cardUrl === `${recvRoot}/.well-known/agent-card.json`, String(ready?.cardUrl));
  ok("the process wrote its publisher JWK for peers to pin", fs.existsSync(jwkPath) && JSON.parse(fs.readFileSync(jwkPath, "utf8")).fp === ready?.identityFp);

  /* discovery from a THIRD party (this probe), signature verified against the JWK on disk */
  const peerJwk = JSON.parse(fs.readFileSync(jwkPath, "utf8")).publicJwk as JsonWebKey;
  const discResp = await fetch(`${recvRoot}/.well-known/agent-card.json`);
  const discCard = (await discResp.json()) as never;
  ok("a stranger can discover the card over HTTP and it is strictly v1.0.0", discResp.status === 200 && validateAgentCardV10(discCard).length === 0);
  const peerSig = await verifyAgentCardV10Signatures(discCard, peerJwk);
  ok("â€¦and its signature verifies against the JWK the process published", peerSig.ok === true);

  let grantOut = "";
  const sender = launchHost([
    "--selfimpulse", "USER 1",
    "--teammate", "Scout|Code hardener|Harden authorization code and prove it with the repository's own tests|security,testing",
    "--port", "0",
    "--peer-url", recvRoot,
    "--peer-jwk", jwkPath,
    "--peer-token", "shared-link-secret",
    "--send", HARDEN,
    "--tier", "safe",
    // The operator states what this delegation may do on the peer. There is no
    // default, so the sender process must say it out loud like any other caller.
    "--grant", "read,write,shell",
    "--exit-after-delegation",
  ]);
  /* The CLI half of the same rule: an operator who delegates without stating
   * authority gets a refusal, not a run under an invented ceiling. */
  const noGrantCode = (() => {
    try {
      execFileSync(process.execPath, [path.join(ROOT, "tools", "si-host.mjs"),
        "--selfimpulse", "USER 9", "--port", "0",
        "--peer-url", recvRoot, "--peer-jwk", jwkPath, "--peer-token", "shared-link-secret",
        "--send", HARDEN, "--tier", "safe"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 60_000 });
      return 0;
    } catch (e) {
      const err = e as { status?: number | null; stdout?: string; stderr?: string };
      grantOut = `${err.stdout ?? ""}${err.stderr ?? ""}`;
      return err.status ?? -1;
    }
  })();
  ok("the host CLI refuses to delegate with no stated grant", noGrantCode === 2 && /--grant is required/.test(grantOut), `exit=${noGrantCode} ${grantOut.slice(0, 120)}`);
  ok("it says what to do instead", /read,write,shell/.test(grantOut), grantOut.slice(0, 160));

  const delegatedRaw = await waitFor(sender, "SI-A2A-DELEGATED", 60_000);
  const delegated = parseLine(sender, "SI-A2A-DELEGATED") as DelegatedLine | null;
  ok("the sender PROCESS completed a delegation against the receiver PROCESS", delegatedRaw !== null && delegated?.ok === true, `${delegated?.record.note ?? ""} ${sender.stderr.slice(0, 300)}`);
  const rec = delegated?.record;
  ok("the receiver routed it to its own teammate", rec?.toTeammate === MATE.name, String(rec?.toTeammate));
  ok("a real TeamExecutor mission ran: 2 seats, both verified by the repo's own test",
    rec?.execution !== null && rec.execution.seatsRun === 2 && rec.execution.seatsVerified === 2 && rec.execution.runStatus === "completed",
    JSON.stringify(rec?.execution ?? null));
  ok("the gate PASS is cross-vendor, not self-verification", /cross-vendor/.test(String(rec?.artifact ?? "")), String(rec?.artifact ?? ""));
  ok("the record carries a sealed si-proof-receipt/2", rec?.receipt?.format === "si-proof-receipt/2" && Array.isArray(rec?.receipt?.events));
  const localCheck = rec?.receipt ? await verifyProofReceipt(rec.receipt as never) : { ok: false, reason: "no receipt" };
  ok("that receipt verifies in the sender's own process", localCheck.ok === true, String((localCheck as { reason?: string }).reason ?? ""));

  const receiptFile = path.join(scratch("vhrcpt-"), "receipt.json");
  fs.writeFileSync(receiptFile, JSON.stringify(rec?.receipt ?? {}, null, 2));
  const issuerKey = ((rec?.receipt as { issuer?: { publicKeyHex?: string } } | null)?.issuer ?? {}).publicKeyHex;
  const cliNoAnchor = verifyReceiptCli(receiptFile);
  ok("a THIRD process confirms the chain and seal, but refuses to call the issuer authenticated without an anchor",
    cliNoAnchor.code === 3 && /VALID SIGNATURE/.test(cliNoAnchor.out) && /UNVERIFIED/.test(cliNoAnchor.out), `exit=${cliNoAnchor.code} ${cliNoAnchor.out.slice(0, 200)}`);
  const cli = verifyReceiptCli(receiptFile, issuerKey);
  ok("â€¦and with the issuer key pinned out of band it verifies as AUTHENTIC (exit 0)",
    cli.code === 0 && /VALID: si-proof-receipt\/2/.test(cli.out) && /Issuer AUTHENTICATED/.test(cli.out) && !/UNVERIFIED/.test(cli.out), `exit=${cli.code} ${cli.out.slice(0, 220)}`);
  ok("the receiver's own log shows it spawned the seats (execution happened THERE)",
    /spawn /.test(receiver.stdout) && /mounted USER 2/.test(receiver.stdout), receiver.stdout.slice(0, 200));
  ok("the receiver process reported the labelled drill seat, not a real model",
    ready?.seatMode === "drill" && /drill-seat/.test(receiver.stdout + JSON.stringify(rec?.receipt ?? {})),
    `seatMode=${String(ready?.seatMode)}`);

  /* the same wire, wrong credentials */
  const badAuth = await fetch(recvRoot, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer not-the-token" },
    body: JSON.stringify({ jsonrpc: "2.0", id: "z1", method: "message/send", params: { message: { role: "user", parts: [{ kind: "text", text: "do the work" }] } } }),
  });
  ok("an unauthorized caller is refused by the mounted selfimpulse", badAuth.status === 401 || (await badAuth.json() as { error?: unknown }).error !== undefined, `HTTP ${badAuth.status}`);

  await receiver.stop();
  await sender.stop();

  /* â•â• Â§4 a mounted selfimpulse that cannot execute refuses â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
  section("4. mounted but unable to execute â†’ refused in words, never a completion");

  const barren = await startA2ARuntime({ selfimpulseUser: "USER 3", teammates: [MATE] });
  ok("a selfimpulse with no bridge still mounts (it has to, to refuse politely)", barren.describe().mounted === true && barren.describe().bridge.executable === false);
  ok("â€¦and describe() says why, in words", /cannot execute/.test(String(barren.describe().bridge.refusalReason)), String(barren.describe().bridge.refusalReason));
  const caller = await startA2ARuntime({ selfimpulseUser: "USER 1", teammates: [MATE] });
  ok("a selfimpulse with no operator token still enforces one â€” it mints its own",
    typeof barren.token === "string" && barren.token.length > 8 && barren.describe().tokenMinted === true);
  const barrenOutcome = await caller.delegateTo({
    remoteRoot: barren.baseUrl, remotePublicJwk: barren.identity.publicJwk, task: HARDEN, tier: "safe",
    authority: { capabilities: ["read", "write", "shell"], budgetCents: 0 },
    authorization: `Bearer ${barren.token}`,
  });
  ok("delegating to it is refused", barrenOutcome.ok === false && barrenOutcome.record.status === "refused", barrenOutcome.record.note);
  ok("the refusal carries no artifact, no execution and no receipt",
    barrenOutcome.record.artifact === null && barrenOutcome.record.execution === null && barrenOutcome.record.receipt === null);
  ok("â€¦and the note names the missing capability rather than implying a run",
    /could not execute|no execution deps|Nothing ran/i.test(barrenOutcome.record.note), barrenOutcome.record.note);
  await barren.stop();

  /* â•â• Â§5 anti-cheat across the wire â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
  section("5. a repository whose tests FAIL is never reported as completed");

  const broken = makeRepo();
  const dishonest = await startA2ARuntime({
    selfimpulseUser: "USER 2",
    teammates: [MATE],
    bridge: drillBridgeConfig({ repoRoot: broken.repo, baseBranch: broken.baseBranch, testCommand: ["node", "test.js"], applyFix: false }),
  });
  const cheat = await caller.delegateTo({
    remoteRoot: dishonest.baseUrl, remotePublicJwk: dishonest.identity.publicJwk, task: HARDEN, tier: "safe",
    authority: { capabilities: ["read", "write", "shell"], budgetCents: 0 },
    authorization: `Bearer ${dishonest.token}`,
  });
  /* The wire case the type system cannot stop: an older peer, or a hostile
   * client, that simply omits the declared authority. The host must refuse it
   * by name rather than fall back to a ceiling it invented â€” and this selfimpulse
   * CAN execute, so the refusal cannot be blamed on missing capability. */
  const silent = await caller.delegateTo({
    remoteRoot: dishonest.baseUrl, remotePublicJwk: dishonest.identity.publicJwk, task: HARDEN, tier: "safe",
    authorization: `Bearer ${dishonest.token}`,
  } as Parameters<typeof caller.delegateTo>[0]);
  ok("a peer that states no authority is refused", silent.ok === false && silent.record.status === "refused", silent.record.note);
  ok("the refusal names the missing principal chain", /principal chain|no authority/i.test(String(silent.record.note)), String(silent.record.note));
  ok("nothing ran and nothing is claimed", silent.record.artifact === null && silent.record.execution === null && silent.record.receipt === null);

  ok("the run happened but did not verify â†’ status refused, not completed",
    cheat.ok === false && cheat.record.status === "refused", `${cheat.record.status} ${cheat.record.note}`);
  ok("the measured execution is still reported (seats ran, the verdict failed)",
    cheat.record.execution != null && cheat.record.execution.seatsRun > 0, JSON.stringify(cheat.record.execution ?? null));
  ok("the note says it executed but did not verify", /not verified|did not verify/i.test(cheat.record.note), cheat.record.note);
  await dishonest.stop();
  await caller.stop();

  /* â•â• Â§6 the receiver grades the request itself â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
  section("6. a sender's \"safe\" is a claim â€” the receiver re-classifies");

  const forcePush = receiverRiskVerdict("git push --force the hardened build to production", "safe");
  ok("a CRITICAL task declared \"safe\" by the sender is upgraded to risky",
    forcePush.risk === "CRITICAL" && forcePush.effectiveTier === "risky" && forcePush.upgraded === true, JSON.stringify(forcePush));
  const publish = receiverRiskVerdict("publish the npm package for the release", "safe");
  ok("a HIGH task is upgraded too", publish.risk === "HIGH" && publish.effectiveTier === "risky" && publish.upgraded === true, JSON.stringify(publish));
  const read = receiverRiskVerdict("read the log file and summarize it", "safe");
  ok("genuinely LOW work stays safe (the policy is not a blanket gate)", read.risk === "LOW" && read.effectiveTier === "safe" && read.upgraded === false, JSON.stringify(read));
  const strict = receiverRiskVerdict("modify the source file", "safe", { mode: "medium-and-above" });
  ok("medium-and-above gates ordinary code edits", strict.risk === "MEDIUM" && strict.effectiveTier === "risky", JSON.stringify(strict));
  const trusted = receiverRiskVerdict("git push --force to production", "risky", { mode: "trust-sender" });
  ok("the receiver never DOWNGRADES a sender that declared risky", trusted.effectiveTier === "risky", JSON.stringify(trusted));

  /* The receiver's teammate has to CLAIM this work or routing refuses first â€”
     the point of Â§6 is what happens after routing accepts it. */
  const releaseMate = { name: "Rivet", title: "Release engineer", description: "Harden authorize() code, then git push --force the release to production", skills: ["security", "release"] };
  const guarded = await startA2ARuntime({ selfimpulseUser: "USER 2", teammates: [releaseMate], bridge: drillBridgeConfig({ repoRoot: makeRepo().repo, baseBranch, testCommand: ["node", "test.js"] }) });
  const watched = await startA2ARuntime({
    selfimpulseUser: "USER 1",
    teammates: [{ name: "Scout", title: "Release engineer", description: "Harden authorize() code, then git push --force the release to production", skills: ["security", "release"] }],
  });
  const smuggled = await watched.delegateTo({
    remoteRoot: guarded.baseUrl, remotePublicJwk: guarded.identity.publicJwk,
    task: "Harden authorize() then git push --force the release to production", tier: "safe",
    authority: { capabilities: ["read", "write", "shell"], budgetCents: 0 },
    authorization: `Bearer ${guarded.token}`,
  });
  ok("a headless selfimpulse DENIES the upgraded task â€” nothing executes",
    smuggled.ok === false && smuggled.record.status === "denied", `${smuggled.record.status} ${smuggled.record.note}`);
  ok("the denial records the receiver's own classification and why",
    smuggled.record.receiverPolicy?.upgraded === true && /CRITICAL|HIGH/.test(String(smuggled.record.receiverPolicy?.risk)), JSON.stringify(smuggled.record.receiverPolicy ?? null));
  ok("â€¦and carries no execution and no receipt", smuggled.record.execution === null && smuggled.record.receipt === null);
  await guarded.stop();
  await watched.stop();

  /* identities are fresh per selfimpulse, so a peer cannot borrow one */
  const a = await makeSelfImpulseIdentity();
  const b = await makeSelfImpulseIdentity();
  ok("each mounted selfimpulse mints its own publisher identity", a.fp !== b.fp && a.fp.length === 16);
  ok("the team a selfimpulse speaks for is built through the real teammate API", (() => {
    let t = createTeam("X");
    const added = addTeammate(t, MATE);
    if (added.ok) t = added.value.team;
    return t.teammates.length === 1 && t.teammates[0].name === MATE.name;
  })());
  ok("node deps resolve honestly: a binary that is not installed is null", (await nodeRunnerDeps().resolveBin("definitely-not-a-real-si-binary")) === null);

  console.log(`\na2aRuntime: ${pass} passed, ${fail} failed`);
  if (failures.length > 0) { console.log("failures:"); failures.forEach((f) => console.log(`  - ${f}`)); }
}

main()
  .catch((e) => { console.error(e); fail += 1; })
  .finally(async () => {
    /* No listener and no scratch directory survives this suite, pass or fail:
       a selfimpulse left bound after a thrown assertion is exactly the kind of thing
       that makes the next run's port choice lie. */
    await Promise.all(launched.map((hp) => hp.stop().catch(() => undefined)));
    for (const dir of scratchDirs) { try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ } }
    if (fail > 0) process.exit(1);
  });
