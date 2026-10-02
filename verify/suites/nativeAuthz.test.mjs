import { createRequire as __mjCreateRequire } from "node:module"; const require = __mjCreateRequire(import.meta.url);
var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// protocol/bridge/selfimpulse-receipt-bridge.mjs
var selfimpulse_receipt_bridge_exports = {};
__export(selfimpulse_receipt_bridge_exports, {
  anchorReceipt: () => anchorReceipt,
  buildAnchorFact: () => buildAnchorFact,
  generateBridgeIdentity: () => generateBridgeIdentity,
  issuerFingerprint: () => issuerFingerprint,
  openFact: () => openFact,
  receiptEvidence: () => receiptEvidence,
  sealFact: () => sealFact,
  verifyAnchor: () => verifyAnchor,
  verifyReceiptChain: () => verifyReceiptChain
});
import crypto from "node:crypto";
function sortDeep(v) {
  if (Array.isArray(v)) return v.map(sortDeep);
  if (v && typeof v === "object") {
    const out = {};
    for (const k of Object.keys(v).sort()) out[k] = sortDeep(v[k]);
    return out;
  }
  return v;
}
function generateBridgeIdentity(name = "bridge") {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ec", { namedCurve: "P-256" });
  const jwk = publicKey.export({ format: "jwk" });
  const fp = sha256hex(`${jwk.crv}|${jwk.x}|${jwk.y}`).slice(0, 16).toUpperCase();
  return { name, fp, publicKey, privateKey, publicJwk: jwk };
}
function sealFact(facts, privateKey) {
  const p = JSON.stringify(facts);
  const n = crypto.randomBytes(16).toString("hex");
  const ts = Date.now();
  const sig = crypto.sign(
    "sha256",
    Buffer.from(`${p}|${n}|${ts}`, "utf8"),
    { key: privateKey, dsaEncoding: "ieee-p1363" }
  );
  return { p, n, ts, sig: b64e(sig) };
}
function openFact(env, signerPublicJwk, { windowMs = 5 * 6e4 } = {}) {
  if (!env || typeof env.p !== "string" || typeof env.n !== "string" || typeof env.ts !== "number")
    return { payload: null, verified: false, reason: "malformed-envelope" };
  if (env.n.length < 16 || env.n.length > 64)
    return { payload: null, verified: false, reason: "invalid-nonce-length" };
  if (Math.abs(Date.now() - env.ts) > windowMs)
    return { payload: null, verified: false, reason: "stale-envelope" };
  let ok2 = false;
  try {
    const key = crypto.createPublicKey({ key: signerPublicJwk, format: "jwk" });
    ok2 = crypto.verify(
      "sha256",
      Buffer.from(`${env.p}|${env.n}|${env.ts}`, "utf8"),
      { key, dsaEncoding: "ieee-p1363" },
      b64d(env.sig)
    );
  } catch {
    ok2 = false;
  }
  if (!ok2) return { payload: null, verified: false, reason: "bad-signature" };
  try {
    return { payload: JSON.parse(env.p), verified: true };
  } catch {
    return { payload: null, verified: false, reason: "unparseable-payload" };
  }
}
function verifyReceiptChain(rc) {
  if (!rc || typeof rc !== "object") return { ok: false, reason: "not-a-receipt" };
  if (!SEAL_SECRETS[rc.format]) return { ok: false, reason: `unknown format ${rc.format}` };
  if (!Array.isArray(rc.events)) return { ok: false, reason: "missing events" };
  let prev = GENESIS;
  for (const e of rc.events) {
    if (e.prev !== prev) return { ok: false, reason: `chain broken at seq ${e.seq}` };
    const { hash, ...body } = e;
    if (sha256hex(canon(body)) !== hash) return { ok: false, reason: `hash mismatch at seq ${e.seq}` };
    prev = hash;
  }
  if (hmacHex(prev, rc.format) !== rc.seal) return { ok: false, reason: "seal mismatch" };
  if (rc.format === "si-proof-receipt/2" && !rc.signature) {
    return {
      ok: false,
      reason: `receipt carries no issuer signature${rc.signatureNote ? ` (${rc.signatureNote})` : ""}. For si-proof-receipt/2 an issuer signature is required: without it the chain attests only tamper-evidence against anyone who knows the published seal secret, not authorship.`
    };
  }
  if (rc.signature) {
    if (!rc.issuer?.publicKeyHex || !/^[0-9a-fA-F]{64}$/.test(rc.issuer.publicKeyHex))
      return { ok: false, reason: "receipt is signed but carries no issuer public key" };
    const spki = Buffer.concat([ED25519_SPKI_PREFIX, Buffer.from(rc.issuer.publicKeyHex, "hex")]);
    const okSig = crypto.verify(
      null,
      Buffer.from(prev, "hex"),
      crypto.createPublicKey({ key: spki, format: "der", type: "spki" }),
      Buffer.from(rc.signature, "hex")
    );
    if (!okSig) return { ok: false, reason: `issuer signature verification FAILED for chain head ${prev}` };
  }
  return { ok: true, head: prev, events: rc.events.length, signed: Boolean(rc.signature) };
}
function issuerFingerprint(publicKeyHex) {
  return sha256hex(Buffer.from(publicKeyHex, "hex").toString("latin1")).slice(0, 16);
}
function receiptEvidence(rc, verdict) {
  const issuer = rc.signature && rc.issuer?.publicKeyHex ? `issuer:${issuerFingerprint(rc.issuer.publicKeyHex)}` : "issuer:unsigned";
  return `receipt:${rc.format}:head:${verdict.head}:events:${verdict.events}:seal:ok:${issuer}`;
}
function buildAnchorFact({ receipt, verdict, agent, purpose = "cross-org-proof-anchoring" }) {
  if (!verdict?.ok) throw new Error("buildAnchorFact: receipt must be verified first");
  if (!agent?.fp || typeof agent.fp !== "string") throw new Error("buildAnchorFact: agent.fp required");
  return {
    v: 2,
    kind: "agent_action",
    agent: { n: String(agent.name ?? "").trim().slice(0, 60), fp: agent.fp },
    action: "anchor_receipt",
    tool: "selfimpulse-receipt-bridge",
    purpose: String(purpose).trim().slice(0, 200),
    policy: null,
    evidence: receiptEvidence(receipt, verdict).slice(0, 2e3),
    result: "success",
    ts: Date.now()
  };
}
function anchorReceipt(identity, receipt, { purpose } = {}) {
  const verdict = verifyReceiptChain(receipt);
  if (!verdict.ok) return { ok: false, reason: verdict.reason };
  const facts = buildAnchorFact({ receipt, verdict, agent: { name: identity.name, fp: identity.fp }, purpose });
  const env = sealFact(facts, identity.privateKey);
  return { ok: true, env, facts, verdict, evidence: facts.evidence };
}
function verifyAnchor(env, signerPublicJwk) {
  const opened = openFact(env, signerPublicJwk);
  if (!opened.verified) return { ok: false, reason: opened.reason };
  const facts = opened.payload;
  if (facts?.kind !== "agent_action" || facts.action !== "anchor_receipt")
    return { ok: false, reason: "not-an-anchor-fact" };
  const m = /^receipt:([a-z0-9/-]+):head:[0-9a-f]{64}:events:\d+:seal:ok:(issuer:[0-9a-f]{16}|issuer:unsigned)$/.exec(facts.evidence ?? "");
  if (!m) return { ok: false, reason: "malformed-anchor-evidence" };
  if (m[1] === "si-proof-receipt/2" && m[2] === "issuer:unsigned")
    return { ok: false, reason: "current-format anchor evidence claims an unsigned receipt" };
  return { ok: true, facts };
}
var SEAL_SECRETS, ED25519_SPKI_PREFIX, GENESIS, canon, sha256hex, hmacHex, b64e, b64d;
var init_selfimpulse_receipt_bridge = __esm({
  "protocol/bridge/selfimpulse-receipt-bridge.mjs"() {
    "use strict";
    SEAL_SECRETS = {
      "si-proof-receipt/2": "si-commercial-v1-offline",
      "mj-proof-receipt/2": "mj-commercial-v1-offline",
      "mj-proof-receipt/1": "mj-commercial-v1-offline"
    };
    ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");
    GENESIS = "0".repeat(64);
    canon = (o) => JSON.stringify(sortDeep(o));
    sha256hex = (s) => crypto.createHash("sha256").update(s, "utf8").digest("hex");
    hmacHex = (s, format) => crypto.createHmac("sha256", SEAL_SECRETS[format]).update(s, "utf8").digest("hex");
    b64e = (buf) => Buffer.from(buf).toString("base64");
    b64d = (s) => Buffer.from(s, "base64");
  }
});

// probe/nativeAuthz.test.ts
import * as fs from "node:fs";
import * as path from "node:path";
import crypto2 from "node:crypto";
var root = ".".length > 0 ? "." : fs.existsSync(path.join(process.cwd(), "package.json")) ? process.cwd() : path.resolve(__dirname ?? process.cwd(), ".");
if (!fs.existsSync(path.join(root, "package.json"))) {
  console.error(`nativeAuthz: cannot find project root (looked in ${root}).`);
  process.exit(2);
}
var read = (p) => fs.readFileSync(path.join(root, p), "utf8");
var pass = 0;
var fail = 0;
var failures = [];
function ok(label, cond, detail = "") {
  if (cond) {
    pass++;
    console.log(`  ok   ${label}`);
  } else {
    fail++;
    failures.push(`${label}${detail ? ` \u2014 ${detail}` : ""}`);
    console.log(`  FAIL ${label}${detail ? ` \u2014 ${detail}` : ""}`);
  }
}
var section = (name) => console.log(`
== ${name}`);
var libRs = read("src-tauri/src/lib.rs");
var guardRs = read("src-tauri/src/guard.rs");
var commandsRs = read("src-tauri/src/commands.rs");
var dbRs = read("src-tauri/src/db.rs");
var localDbTs = read("src/ipc/localDb.ts");
var clientTs = read("src/ipc/client.ts");
var PRIVILEGED = [
  "approval_decide",
  "approval_authorize",
  "evolution_decide",
  "evolution_rollback",
  "secret_set",
  "secret_delete",
  "secret_get",
  "package_import",
  "package_export",
  "workspace_root_add",
  "workspace_root_remove",
  "shell_exec",
  "mcp_call",
  "browser_session_create",
  "browser_navigate",
  "browser_act",
  "browser_screenshot",
  "control_run_workflow",
  "fs_read",
  "fs_write",
  "fs_list",
  "fs_mkdir",
  "fs_remove",
  /* archive-6 audit: the provider call, the endpoint binding, execution grants, MCP registration and the
     evolution bridge all moved behind the gate */
  "llm_chat",
  "provider_bind_endpoint",
  "exec_grant_request",
  "mcp_server_save",
  "mcp_server_remove",
  "mcp_connect_test",
  "hermes_bridge"
];
section("C-1 \u2014 centralized native authorization boundary");
ok("lib.rs declares `mod guard;`", /\bmod guard;/.test(libRs));
for (const name of PRIVILEGED) {
  ok(`lib.rs registers ${name} from guard::`, new RegExp(`guard::${name}\\b`).test(libRs));
  ok(
    `lib.rs does NOT register ${name} straight from commands::`,
    !new RegExp(`commands::${name}\\b`).test(libRs)
  );
}
ok(
  "guard::authorize is deny-by-default (unknown action => Err)",
  /other\s*=>\s*Err\(/.test(guardRs) && /deny by default/i.test(guardRs)
);
for (const name of PRIVILEGED) {
  ok(`guard.rs policy table names "${name}"`, guardRs.includes(`"${name}"`));
}
ok("guard wrappers call authorize() before commands::", /authorize\(/.test(guardRs));
{
  const segs = guardRs.split("#[tauri::command]").slice(1);
  const allWrapperNames = segs.map((s) => (/(?:pub\s+)?(?:async\s+)?fn\s+([a-z0-9_]+)/.exec(s) ?? [null, ""])[1] ?? "");
  const wrapperNames = allWrapperNames.filter((n) => PRIVILEGED.includes(n));
  ok(
    "EVERY #[tauri::command] wrapper in guard.rs is in the privileged set, and vice versa (no unlisted wrapper)",
    allWrapperNames.length === PRIVILEGED.length && allWrapperNames.every((n) => PRIVILEGED.includes(n)) && PRIVILEGED.every((n) => allWrapperNames.includes(n)),
    `wrappers=${allWrapperNames.length} privileged=${PRIVILEGED.length}; unlisted=${allWrapperNames.filter((n) => !PRIVILEGED.includes(n)).join(",")}`
  );
  ok(
    `every privileged wrapper body crosses authorize() (${wrapperNames.length}/${PRIVILEGED.length} found)`,
    wrapperNames.length === PRIVILEGED.length
  );
  const missing = wrapperNames.filter((n) => {
    const seg = segs.find((s) => s.includes(`fn ${n}(`)) ?? "";
    return !seg.includes("authorize(");
  });
  ok(
    "no privileged wrapper skips the gate (browser wrappers included)",
    missing.length === 0,
    missing.join(",")
  );
  ok(
    "browser wrappers refuse with {ok:false,reason} on gate denial",
    /authorize\("browser_session_create"[\s\S]{0,200}ok": false/.test(guardRs) && /authorize\("browser_act"[\s\S]{0,200}ok": false/.test(guardRs) && /authorize\("browser_screenshot"[\s\S]{0,200}ok": false/.test(guardRs)
  );
}
ok(
  "gate self-tests ship in guard.rs",
  /#\[cfg\(test\)\]/.test(guardRs) && /unknown_actions_are_denied/.test(guardRs)
);
ok(
  "guard validates the two verdict enums at the gate",
  guardRs.includes('arg == "APPROVED" || arg == "REJECTED"') && guardRs.includes('arg == "ACCEPTED" || arg == "REJECTED"')
);
section("C-2 \u2014 decisions are authority-checked transitions");
ok(
  "db::approval_decide only flips OPEN rows, recording the authorizing actor",
  /UPDATE approvals SET status=\?2, decided_by='human:dialog'[\s\S]*?WHERE id=\?1 AND status='OPEN'/.test(dbRs)
);
ok(
  "db::approval_decide validates the decision enum",
  dbRs.includes("approval_decide: decision must be APPROVED or REJECTED")
);
ok(
  "db::approval_decide errors on unknown id instead of silent success",
  dbRs.includes("does not exist \u2014 nothing was changed.")
);
ok(
  "db::approval_decide takes the capability (the actor, not just the state)",
  /pub fn approval_decide\(conn: &Connection, id: &str, decision: &str, capability: &str\)/.test(dbRs)
);
ok(
  "decide without a capability is refused in words",
  dbRs.includes("no capability presented")
);
ok(
  "capability ownership is proven (confused-approver refused)",
  dbRs.includes("confused-approver refused") && dbRs.includes("cap_fingerprint(capability) != cap_hash")
);
ok(
  "capability freshness is enforced",
  dbRs.includes("capability for approval {id} expired")
);
ok(
  "capability scope binds the ONE verdict it may cast",
  dbRs.includes("was minted for {cap_decision}; it cannot cast {decision}")
);
ok(
  "the transition consumes the capability (single-use)",
  dbRs.includes("cap_hash='', cap_expires_at=0, cap_decision=''")
);
ok(
  "approvals schema binds requester + authority + capability material",
  /CREATE TABLE IF NOT EXISTS approvals \([\s\S]*?requested_by TEXT[\s\S]*?authority TEXT[\s\S]*?cap_hash TEXT[\s\S]*?cap_expires_at INTEGER[\s\S]*?cap_decision TEXT[\s\S]*?decided_by TEXT/.test(dbRs)
);
ok(
  "existing databases migrate in place (archive-4 columns added)",
  dbRs.includes("fn ensure_approval_authority_columns") && dbRs.includes("ALTER TABLE approvals ADD COLUMN requested_by")
);
ok(
  "approval_request binds requested_by and required authority at birth",
  dbRs.includes("requested_by,authority) VALUES") && dbRs.includes("'human')")
);
ok(
  "the capability minter is the ONLY store of capability material",
  /fn approval_mint_capability\(/.test(dbRs) && (dbRs.match(/UPDATE approvals SET cap_hash=/g) ?? []).length === 1
);
ok(
  "approval_authorize gates the mint behind the NATIVE dialog",
  /fn approval_authorize\(app: tauri::AppHandle/.test(commandsRs) && commandsRs.includes(".blocking_show()") && commandsRs.includes("MessageDialogButtons::OkCancelCustom")
);
ok(
  "declining the native dialog mints nothing and decides nothing",
  commandsRs.includes("declined at the native dialog \u2014 no capability was minted")
);
ok(
  "guard policy covers approval_authorize (enum at the gate) + empty-cap refusal",
  guardRs.includes('"approval_decide" | "approval_authorize"') && guardRs.includes("guard: approval_decide requires the native capability")
);
ok(
  "lib.rs registers approval_authorize from guard::",
  /guard::approval_authorize\b/.test(libRs) && !/commands::approval_authorize\b/.test(libRs)
);
ok(
  "web-mode mirror mints only through an interactive confirm",
  localDbTs.includes('typeof window.confirm !== "function"') && localDbTs.includes("window.confirm(") && localDbTs.includes("declined at the confirm dialog")
);
ok(
  "web-mode mirror enforces capability ownership, freshness and scope",
  localDbTs.includes("confused-approver refused") && localDbTs.includes("expired (freshness window closed)") && localDbTs.includes("cannot cast")
);
ok(
  "lists never carry the capability",
  dbRs.includes("Capabilities are NEVER listed") && localDbTs.includes("capability: _capability, ...rest")
);
ok(
  "the ipc client passes the capability through on decide",
  clientTs.includes('approvalDecide: async (approvalId: string, decision: "APPROVED" | "REJECTED", capability: string)')
);
ok(
  "db::evolution_decide only flips PROPOSED rows",
  /UPDATE evolution SET decision=\?2, status='DECIDED', decided_at=\?3 WHERE id=\?1 AND status='PROPOSED'/.test(dbRs)
);
ok(
  "evolution_rollback only flips DECIDED rows",
  /UPDATE evolution SET status='ROLLED_BACK' WHERE id=\?1 AND status='DECIDED'/.test(commandsRs)
);
ok(
  "web-mode mirror (localDb.ts) refuses decisions on non-OPEN approvals",
  localDbTs.includes('if (a.status !== "OPEN")') && localDbTs.includes("is not OPEN (current status")
);
ok(
  "web-mode mirror (localDb.ts) refuses decisions on non-PROPOSED candidates",
  localDbTs.includes('if (c.status !== "PROPOSED")')
);
ok(
  "C-2 regression tests ship, covering the capability flow (cargo test c2_)",
  dbRs.includes("mod c2_decision_transition_tests") && dbRs.includes("foreign_capability_is_a_confused_approver") && dbRs.includes("capability_cannot_cast_the_other_verdict") && dbRs.includes("expired_capability_is_refused") && dbRs.includes("decide_without_capability_is_refused") && dbRs.includes("existing_databases_gain_the_authority_columns")
);
section("archive-6 \u2014 the boundary decides what leaves native code (secrets, destinations, execution, programs)");
var grantsRs = read("src-tauri/src/grants.rs");
var secretsRs = read("src-tauri/src/secrets.rs");
var containRs6 = read("src-tauri/src/contain.rs");
var mcpRs6 = read("src-tauri/src/mcp.rs");
var a2aClientTs = read("src/mission/a2aClient.ts");
var selfEvolveTs = read("src/engine/selfEvolve.ts");
{
  const names = (src) => [...src.matchAll(/#\[tauri::command\]\s*\n(?:[ \t]*(?:\/\/\/[^\n]*|\/\/[^\n]*|#\[[^\n]*)\n)*[ \t]*pub (?:async )?fn (\w+)/g)].map((m) => m[1]);
  const inCommands = names(commandsRs);
  const inGuard = names(guardRs);
  const both = inCommands.filter((n) => inGuard.includes(n));
  ok("no command is a #[tauri::command] in BOTH commands.rs and guard.rs (E0428 \u2014 the crate would not compile)", both.length === 0, both.join(","));
  ok("every command lib.rs registers exists as a #[tauri::command] in the module it is registered from", (() => {
    const regs = [...libRs.matchAll(/\b(commands|guard|git|a2a_host)::(\w+),/g)].map((m) => [m[1], m[2]]);
    const gitRs = read("src-tauri/src/git.rs");
    const a2aRs = read("src-tauri/src/a2a_host.rs");
    const bag = { commands: inCommands, guard: inGuard, git: names(gitRs), a2a_host: names(a2aRs) };
    const missing = regs.filter(([m, n]) => !(bag[m] ?? []).includes(n)).map(([m, n]) => `${m}::${n}`);
    return missing.length === 0 || (console.log("   unresolved registrations:", missing.join(", ")), false);
  })());
}
ok("secret classes exist: provider keys, signing keys, everything else", /pub enum SecretClass \{[\s\S]*Provider[\s\S]*Signing[\s\S]*Other/.test(grantsRs) && /pub fn classify_secret/.test(grantsRs));
ok(
  "secret_get NEVER returns a provider key (value is null + redacted) and refuses unlisted refs",
  /SecretClass::Provider => \{[\s\S]{0,400}"value": null[\s\S]{0,80}"redacted": true/.test(commandsRs) && /SecretClass::Other => Err\(/.test(commandsRs)
);
ok("guard::authorize classifies secret_get (Other is denied before it reaches the command)", /"secret_get" => \{[\s\S]{0,200}classify_secret\(arg\)/.test(guardRs));
ok("SecretStore::delete clears BOTH keychain namespaces and proves nothing readable remains", /for svc in \[SERVICE, LEGACY_SERVICE\] \{\s*if let Err\(e\) = self\.vault\.delete/.test(secretsRs) && /STILL readable/.test(secretsRs));
ok("the first read migrates a legacy secret forward and retires the legacy copy", /fn get[\s\S]{0,700}vault\.set\(SERVICE[\s\S]{0,120}vault\.delete\(LEGACY_SERVICE/.test(secretsRs));
ok("location() sees the legacy namespace (no 'absent' for a key llm_chat can still use)", /fn location[\s\S]{0,500}for svc in \[SERVICE, LEGACY_SERVICE\]/.test(secretsRs));
ok("the keychain sits behind a Vault seam so the logic is tested (delete / migrate / degrade)", /pub trait Vault/.test(secretsRs) && /delete_removes_the_legacy_namespace_too/.test(secretsRs));
ok("llm_chat is registered from guard:: (async wrapper that authorizes the provider slug)", /pub async fn llm_chat\(state: State<'_, Arc<AppState>>, req: Value\)[\s\S]{0,400}authorize\("llm_chat"/.test(guardRs));
ok("llm_chat attaches PROVIDER keys only (an owner/issuer/other secret_ref is refused)", /classify_secret\(secret_ref\) != grants::SecretClass::Provider/.test(commandsRs));
{
  const i = commandsRs.indexOf("pub async fn llm_chat");
  const body = commandsRs.slice(i, i + 9e3);
  const dest = body.indexOf("key_destination_allowed(");
  const keyRead = body.indexOf("state.secrets.get(secret_ref)");
  ok("the destination is decided BEFORE the secret is read (a refused call never touches the key)", dest > 0 && keyRead > 0 && dest < keyRead, `dest=${dest} keyRead=${keyRead}`);
  ok("the destination rule is the vendor's origin or a HUMAN-bound one, over https (or loopback)", /pub fn key_destination_allowed/.test(grantsRs) && /canonical_origin\(kind\) == Some\(origin\.as_str\(\)\)/.test(grantsRs) && /bound_origin == Some\(origin\.as_str\(\)\)/.test(grantsRs) && /plain http is allowed to a loopback address only/.test(grantsRs));
  ok("the SSRF egress guard still runs on top of the destination rule", /egress_guard\(&url\)\.map_err\(\|e\| format!\("base URL refused by the egress guard/.test(body));
}
ok("endpoint binding is a NATIVE dialog (throttled), stored with the human actor, never by the page alone", /pub fn provider_bind_endpoint\(app: AppHandle/.test(commandsRs) && /native_confirm\(/.test(commandsRs.slice(commandsRs.indexOf("pub fn provider_bind_endpoint"))) && /provider_endpoint_bind\(&\*lock_db\(&state\)\?, &secret_ref, &origin, "human:dialog"\)/.test(commandsRs));
ok("an endpoint can only be bound to a PROVIDER key (guard + command)", /"provider_bind_endpoint" => \{[\s\S]{0,200}SecretClass::Provider/.test(guardRs) && /is not a provider key reference/.test(commandsRs));
ok("shell_exec takes a grant and the guard refuses a call without one before any path is touched", /pub fn shell_exec\([\s\S]{0,260}grant: Option<String>/.test(guardRs) && /requires an execution grant/.test(guardRs));
ok("shell_exec checks the grant (program, expiry, workspace) and hands ITS network setting to the containment layer", /state\.grants\.check\(grant\.as_deref\(\)/.test(commandsRs) && /is_within\(&cwd, &view\.workspace\)/.test(commandsRs) && /wrap_command\([^;]{0,220}view\.network\)/.test(commandsRs.replace(/\s+/g, " ")));
ok("a grant is minted ONLY after a native dialog that printed the scope; its token is stored hashed", /pub fn exec_grant_request\(/.test(commandsRs) && /native_confirm\(/.test(commandsRs.slice(commandsRs.indexOf("pub fn exec_grant_request"))) && /token_hash\(&token\)/.test(grantsRs) && /validate_scope/.test(commandsRs));
ok("the dialog throttle is in the path of EVERY confirmation (one at a time, lockout after declines)", /state\.prompts\.begin\(/.test(commandsRs) && /DECLINE_LIMIT/.test(grantsRs) && !/\.blocking_show\(\)/.test(commandsRs.replace(/fn native_confirm[\s\S]*?\n}\n/, "")));
ok("the containment layer REFUSES a network-denied run on a host that cannot isolate it", /network access is DENIED for this run, but this host has no containment/.test(containRs6));
ok("unshare/bwrap/seatbelt each carry the network switch (-n / --unshare-net / (deny network*))", /"-n"/.test(containRs6) && /--unshare-net/.test(containRs6) && /\(deny network\*\)/.test(containRs6));
ok("a rung is PROVEN by launching a process in it (canary), and the mount script is hardened (rbind, fail closed, /tmp first, CONTAIN_READS)", /fn canary_unshare/.test(containRs6) && /--rbind/.test(containRs6) && /exit 97/.test(containRs6) && /CONTAIN_READS/.test(containRs6));
ok("the wrapper's own environment is applied AFTER the scrub (the unshare rung once lost CONTAIN_WRITES to env_clear)", /post_scrub_env/.test(containRs6) && /scrub\(&mut cmd, &home\);\s*for \(k, v\) in post_scrub_env/.test(containRs6));
ok("MCP spawns carry the server's network setting through the containment layer", /wrap_command\(&program, &argv, cwd, &\[\], &\[cwd\.to_path_buf\(\)\], network\)/.test(mcpRs6));
ok("live containment tests start real sandboxed processes (network isolation proven against a host listener)", /live_the_network_is_unreachable_when_not_granted_and_reachable_when_granted/.test(containRs6) && /live_a_toolchain_outside_the_system_prefixes_actually_runs/.test(containRs6));
ok("mcp_server_save / _remove are behind the gate AND a native confirmation", /pub fn mcp_server_save\(app: tauri::AppHandle/.test(guardRs) && /pub fn mcp_server_remove\(app: tauri::AppHandle/.test(guardRs) && /native_confirm\(/.test(commandsRs.slice(commandsRs.indexOf("pub fn mcp_server_save"), commandsRs.indexOf("pub fn mcp_connect_test"))));
ok('an approval is written ONLY by native code (`Some("human:dialog")`); the page\'s own `approval` field is stripped', /mcp_save\(&\*lock_db\(&state\)\?, &cfg, Some\("human:dialog"\)\)/.test(commandsRs) && /o\.remove\("approval"\)/.test(dbRs));
ok("mcp_call and mcp_connect_test run only a program whose approval still matches (fingerprint)", (commandsRs.match(/db::mcp_check_approved\(&s\)/g) ?? []).length >= 2 && /pub fn mcp_check_approved/.test(dbRs));
ok("the flat shape the UI sends is judged like the nested one (mcp_program_of), in the command AND the guard", /db::mcp_program_of\(&cfg\)/.test(commandsRs) && /crate::db::mcp_program_of\(&cfg\)/.test(guardRs));
ok("hermes_bridge speaks only the three commands the evolution service implements", /const HERMES_COMMANDS: &\[&str\] = &\["ping", "score_fitness", "propose"\]/.test(commandsRs) && /"hermes_bridge" => \{[\s\S]{0,160}"ping" \| "score_fitness" \| "propose"/.test(guardRs));
ok("workflow mutation stays data-only: native workflow code spawns nothing (the sinks are gated instead)", !/Command::new|std::process|reqwest/.test(read("src-tauri/src/control_mcp.rs")));
ok(
  "widening the filesystem boundary (workspace_root_add) needs a native confirmation \u2014 idempotent for a folder already registered",
  /pub fn workspace_root_add\(app: AppHandle/.test(commandsRs) && /native_confirm\([\s\S]{0,200}open a folder to the crew/.test(commandsRs) && /pub fn workspace_root_add\(app: tauri::AppHandle/.test(guardRs)
);
ok("claimPairing / sendFileToPeer / fetchFileFromPeer all run the shared egress policy before any fetch", (a2aClientTs.match(/guardedBase\(/g) ?? []).length >= 4 && /redirect: "error"/.test(a2aClientTs));
ok("self-evolution's human approval is MEASURED from the approvals store, never hardcoded", !/"human-approved": 1 \}/.test(selfEvolveTs.replace(/\{ floors: \{[^}]*\} \}/g, "")) && /human\.earned \? 1 : 0/.test(selfEvolveTs) && /candidateDigest !== digestOfCandidate/.test(selfEvolveTs));
ok("approval_get reports who decided and what was approved (decidedBy + payload), natively and in the mirror", /"decidedBy": by\.unwrap_or_default\(\)/.test(dbRs) && /decidedBy: a\.decidedBy/.test(localDbTs));
ok("the Rust suites ship and cover this round (grants, secrets, contain, migrate)", ["mod tests", "fn secret_classes_separate", "fn delete_removes_the_legacy_namespace_too", "fn live_every_proven_rung_launches_a_process", "fn an_existing_install_follows_the_rename"].every((t) => [grantsRs, secretsRs, containRs6, read("src-tauri/src/migrate.rs")].some((src) => src.includes(t))));
section("C-3 \u2014 credential/system root refusal");
ok("commands.rs matches on path components (path_components_lower)", /fn path_components_lower\(/.test(commandsRs));
ok(
  "the never-firing with_sep construction is gone",
  !/let with_sep = /.test(commandsRs) && !/with_sep\.ends_with\(/.test(commandsRs)
);
ok(
  "credential check is an ordered TAIL match over components",
  /comps\.len\(\) >= want\.len\(\) && comps\[comps\.len\(\) - want\.len\(\)\.\.\] == want\[\.\.\]/.test(commandsRs)
);
ok(
  "system dirs compare component-wise, not as separator-fragile strings",
  /comps == path_components_lower\(bad\)/.test(commandsRs)
);
ok(
  "extended-length prefix handled in both canonical and folded forms",
  (commandsRs.match(/strip_prefix\("/g)?.length ?? 0) >= 3 && commandsRs.includes('strip_prefix("?/")')
);
ok(
  "reviewer's Windows vectors ship as #[cfg(test)] tests",
  commandsRs.includes("mod c3_credential_path_tests") && commandsRs.includes("C:\\Users\\me\\.ssh") && commandsRs.includes("\\\\?\\C:\\Users\\me\\.ssh")
);
ok(
  "trailing-separator and case variants are pinned",
  commandsRs.includes("trailing backslash must not defeat the check") && commandsRs.includes("C:\\USERS\\ME\\.SSH")
);
section("C-4 \u2014 bridge matches the canonical receipt policy (runs the real bridge)");
var bridge = await Promise.resolve().then(() => (init_selfimpulse_receipt_bridge(), selfimpulse_receipt_bridge_exports));
var sortDeep2 = (v) => Array.isArray(v) ? v.map(sortDeep2) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortDeep2(v[k])])) : v;
var canon2 = (o) => JSON.stringify(sortDeep2(o));
var sha = (s) => crypto2.createHash("sha256").update(s, "utf8").digest("hex");
var SEAL_SECRETS2 = {
  "si-proof-receipt/2": "si-commercial-v1-offline",
  "mj-proof-receipt/2": "mj-commercial-v1-offline",
  "mj-proof-receipt/1": "mj-commercial-v1-offline"
};
function buildReceipt(fmt, signed) {
  const issuer = crypto2.generateKeyPairSync("ed25519");
  const pubHex = Buffer.from(issuer.publicKey.export({ format: "jwk" }).x, "base64url").toString("hex");
  let prev = "0".repeat(64);
  const events = [{ seq: 0, prev, ts: 175e10, type: "mission.start", objective: "probe" }].map((body) => {
    const e = { ...body };
    e.prev = prev;
    e.hash = sha(canon2(e));
    prev = e.hash;
    return e;
  });
  const rc = {
    format: fmt,
    header: { mission: "native-authz-probe" },
    events,
    seal: crypto2.createHmac("sha256", SEAL_SECRETS2[fmt] ?? "si-commercial-v1-offline").update(prev, "utf8").digest("hex")
  };
  if (signed) {
    rc.issuer = { alg: "ed25519", publicKeyHex: pubHex };
    rc.signature = crypto2.sign(null, Buffer.from(prev, "hex"), issuer.privateKey).toString("hex");
  }
  return rc;
}
var unsignedCurrent = buildReceipt("si-proof-receipt/2", false);
var vUnsigned = bridge.verifyReceiptChain(unsignedCurrent);
ok(
  "unsigned si-proof-receipt/2 is REFUSED with the signature requirement named",
  vUnsigned.ok === false && /issuer signature is required/.test(vUnsigned.reason ?? ""),
  vUnsigned.reason
);
var signedCurrent = buildReceipt("si-proof-receipt/2", true);
var vSigned = bridge.verifyReceiptChain(signedCurrent);
ok("signed si-proof-receipt/2 verifies", vSigned.ok === true, vSigned.reason);
var legacyUnsigned = buildReceipt("mj-proof-receipt/1", false);
var vLegacy = bridge.verifyReceiptChain(legacyUnsigned);
ok("legacy mj-proof-receipt/1 still verifies unsigned (format promise)", vLegacy.ok === true, vLegacy.reason);
var tampered = buildReceipt("si-proof-receipt/2", true);
tampered.events[0].note = "evil";
ok("tampered event still fails (hash mismatch)", bridge.verifyReceiptChain(tampered).ok === false);
var anchor = bridge.generateBridgeIdentity("probe");
var refusedAnchor = bridge.anchorReceipt(anchor, unsignedCurrent);
ok(
  "anchorReceipt refuses to attest an unsigned current-format receipt",
  refusedAnchor.ok === false && /issuer signature is required/.test(refusedAnchor.reason ?? ""),
  refusedAnchor.reason
);
var forgedFacts = {
  v: 2,
  kind: "agent_action",
  agent: { n: "probe", fp: anchor.fp },
  action: "anchor_receipt",
  tool: "selfimpulse-receipt-bridge",
  purpose: "native-authz-probe",
  policy: null,
  evidence: `receipt:si-proof-receipt/2:head:${"a".repeat(64)}:events:1:seal:ok:issuer:unsigned`,
  result: "success",
  ts: Date.now()
};
var forgedEnv = bridge.sealFact(forgedFacts, anchor.privateKey);
var vForged = bridge.verifyAnchor(forgedEnv, anchor.publicJwk);
ok(
  "verifyAnchor rejects evidence that claims an unsigned CURRENT-format receipt",
  vForged.ok === false && /claims an unsigned receipt/.test(vForged.reason ?? ""),
  vForged.reason
);
var legacyFacts = { ...forgedFacts, evidence: `receipt:mj-proof-receipt/1:head:${"b".repeat(64)}:events:1:seal:ok:issuer:unsigned` };
var legacyEnv = bridge.sealFact(legacyFacts, anchor.privateKey);
ok(
  "verifyAnchor still accepts legacy-format unsigned evidence (no over-blocking)",
  bridge.verifyAnchor(legacyEnv, anchor.publicJwk).ok === true
);
var malformedEnv = bridge.sealFact({ ...forgedFacts, evidence: "receipt:garbage" }, anchor.privateKey);
ok("verifyAnchor still rejects malformed evidence", bridge.verifyAnchor(malformedEnv, anchor.publicJwk).ok === false);
console.log(`
${pass} passed, ${fail} failed`);
if (fail > 0) {
  console.error("failures:\n  - " + failures.join("\n  - "));
  process.exit(1);
}
