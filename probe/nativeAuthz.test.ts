/**
 * Native authorization boundary probe — the security review of archive 3
 * (C-1..C-4) as an executable gate.
 *
 *   C-1  a MANDATORY, deny-by-default gate sits in front of every privileged
 *        Tauri command: guard.rs holds the policy table, lib.rs registers the
 *        wrappers, and the probe fails if the two ever drift apart or if any
 *        privileged name is still registered straight from commands::.
 *   C-2  approval/evolution decisions are authority-checked state transitions
 *        (enumerated decision, OPEN/PROPOSED only, exactly once, unknown id
 *        errors) — in db.rs AND in the localDb.ts web-mode mirror.
 *   C-3  the credential/system root refusal matches on PATH COMPONENTS; the
 *        never-firing suffix construction is gone and the reviewer's Windows
 *        vectors are pinned as shipped #[cfg(test)] tests.
 *   C-4  the receipt bridge refuses unsigned CURRENT-format receipts exactly
 *        like the canonical verifier — this section runs the real bridge.
 *
 * Run: ./node_modules/.bin/esbuild probe/nativeAuthz.test.ts --bundle --platform=node --format=esm \
 *        --define:SI_ROOT='"'$(pwd)'"' --outfile=/tmp/na.mjs --log-level=error && node /tmp/na.mjs
 */
import * as fs from "node:fs";
import * as path from "node:path";
import crypto from "node:crypto";

declare const SI_ROOT: string | undefined;
const root =
  typeof SI_ROOT === "string" && SI_ROOT.length > 0
    ? SI_ROOT
    : fs.existsSync(path.join(process.cwd(), "package.json"))
      ? process.cwd()
      : path.resolve(__dirname ?? process.cwd(), ".");
if (!fs.existsSync(path.join(root, "package.json"))) {
  console.error(`nativeAuthz: cannot find project root (looked in ${root}).`);
  process.exit(2);
}
const read = (p: string): string => fs.readFileSync(path.join(root, p), "utf8");

let pass = 0;
let fail = 0;
const failures: string[] = [];
function ok(label: string, cond: boolean, detail = ""): void {
  if (cond) {
    pass++;
    console.log(`  ok   ${label}`);
  } else {
    fail++;
    failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`);
  }
}
const section = (name: string): void => console.log(`\n== ${name}`);

const libRs = read("src-tauri/src/lib.rs");
const guardRs = read("src-tauri/src/guard.rs");
const commandsRs = read("src-tauri/src/commands.rs");
const dbRs = read("src-tauri/src/db.rs");
const localDbTs = read("src/ipc/localDb.ts");
const clientTs = read("src/ipc/client.ts");

/** The privileged set: reviewer's ten plus the commands of the same class
 *  (secrets, sandbox boundary, code execution, browser actuation) plus the
 *  native capability minter added with C-2's authority binding. */
const PRIVILEGED = [
  "approval_decide", "approval_authorize", "evolution_decide", "evolution_rollback",
  "secret_set", "secret_delete", "secret_get",
  "package_import", "package_export",
  "workspace_root_add", "workspace_root_remove",
  "shell_exec", "mcp_call",
  "browser_session_create", "browser_navigate", "browser_act", "browser_screenshot",
  "control_run_workflow",
  "fs_read", "fs_write", "fs_list", "fs_mkdir", "fs_remove",
  /* archive-6 audit: the provider call, the endpoint binding, execution grants, MCP registration and the
     evolution bridge all moved behind the gate */
  "llm_chat", "provider_bind_endpoint", "exec_grant_request",
  "mcp_server_save", "mcp_server_remove", "mcp_connect_test", "hermes_bridge",
];

/* ─────────────────────────── C-1: the gate exists ─────────────────────────── */
section("C-1 — centralized native authorization boundary");
ok("lib.rs declares `mod guard;`", /\bmod guard;/.test(libRs));
for (const name of PRIVILEGED) {
  ok(`lib.rs registers ${name} from guard::`, new RegExp(`guard::${name}\\b`).test(libRs));
  ok(
    `lib.rs does NOT register ${name} straight from commands::`,
    !new RegExp(`commands::${name}\\b`).test(libRs),
  );
}
ok(
  "guard::authorize is deny-by-default (unknown action => Err)",
  /other\s*=>\s*Err\(/.test(guardRs) && /deny by default/i.test(guardRs),
);
for (const name of PRIVILEGED) {
  ok(`guard.rs policy table names "${name}"`, guardRs.includes(`"${name}"`));
}
ok("guard wrappers call authorize() before commands::", /authorize\(/.test(guardRs));
/* Reviewer nuance (archive 4): EVERY privileged wrapper body — not just the
   file as a whole — must cross authorize(). Split guard.rs at each command
   attribute and require an authorize( call inside each wrapper segment. */
{
  const segs = guardRs.split("#[tauri::command]").slice(1);
  const allWrapperNames = segs.map((s) => (/(?:pub\s+)?(?:async\s+)?fn\s+([a-z0-9_]+)/.exec(s) ?? [null, ""])[1] ?? "");
  const wrapperNames = allWrapperNames.filter((n) => PRIVILEGED.includes(n));
  /* The check used to be ONE-directional: it counted only the wrappers already named in PRIVILEGED, so a
     new wrapper that skipped the gate — or a privileged command nobody listed — passed unnoticed. */
  ok(
    "EVERY #[tauri::command] wrapper in guard.rs is in the privileged set, and vice versa (no unlisted wrapper)",
    allWrapperNames.length === PRIVILEGED.length && allWrapperNames.every((n) => PRIVILEGED.includes(n)) && PRIVILEGED.every((n) => allWrapperNames.includes(n)),
    `wrappers=${allWrapperNames.length} privileged=${PRIVILEGED.length}; unlisted=${allWrapperNames.filter((n) => !PRIVILEGED.includes(n)).join(",")}`,
  );
  ok(
    `every privileged wrapper body crosses authorize() (${wrapperNames.length}/${PRIVILEGED.length} found)`,
    wrapperNames.length === PRIVILEGED.length,
  );
  const missing = wrapperNames.filter((n) => {
    const seg = segs.find((s) => s.includes(`fn ${n}(`)) ?? "";
    return !seg.includes("authorize(");
  });
  ok(
    "no privileged wrapper skips the gate (browser wrappers included)",
    missing.length === 0,
    missing.join(","),
  );
  ok(
    "browser wrappers refuse with {ok:false,reason} on gate denial",
    /authorize\("browser_session_create"[\s\S]{0,200}ok": false/.test(guardRs) &&
      /authorize\("browser_act"[\s\S]{0,200}ok": false/.test(guardRs) &&
      /authorize\("browser_screenshot"[\s\S]{0,200}ok": false/.test(guardRs),
  );
}
ok(
  "gate self-tests ship in guard.rs",
  /#\[cfg\(test\)\]/.test(guardRs) && /unknown_actions_are_denied/.test(guardRs),
);
ok(
  "guard validates the two verdict enums at the gate",
  guardRs.includes('arg == "APPROVED" || arg == "REJECTED"') &&
    guardRs.includes('arg == "ACCEPTED" || arg == "REJECTED"'),
);

/* ────────────────────── C-2: authority-checked decisions ────────────────────── */
section("C-2 — decisions are authority-checked transitions");
ok(
  "db::approval_decide only flips OPEN rows, recording the authorizing actor",
  /UPDATE approvals SET status=\?2, decided_by='human:dialog'[\s\S]*?WHERE id=\?1 AND status='OPEN'/.test(dbRs),
);
ok(
  "db::approval_decide validates the decision enum",
  dbRs.includes("approval_decide: decision must be APPROVED or REJECTED"),
);
ok(
  "db::approval_decide errors on unknown id instead of silent success",
  dbRs.includes("does not exist — nothing was changed."),
);
ok(
  "db::approval_decide takes the capability (the actor, not just the state)",
  /pub fn approval_decide\(conn: &Connection, id: &str, decision: &str, capability: &str\)/.test(dbRs),
);
ok(
  "decide without a capability is refused in words",
  dbRs.includes("no capability presented"),
);
ok(
  "capability ownership is proven (confused-approver refused)",
  dbRs.includes("confused-approver refused") && dbRs.includes("cap_fingerprint(capability) != cap_hash"),
);
ok(
  "capability freshness is enforced",
  dbRs.includes("capability for approval {id} expired"),
);
ok(
  "capability scope binds the ONE verdict it may cast",
  dbRs.includes("was minted for {cap_decision}; it cannot cast {decision}"),
);
ok(
  "the transition consumes the capability (single-use)",
  dbRs.includes("cap_hash='', cap_expires_at=0, cap_decision=''"),
);
ok(
  "approvals schema binds requester + authority + capability material",
  /CREATE TABLE IF NOT EXISTS approvals \([\s\S]*?requested_by TEXT[\s\S]*?authority TEXT[\s\S]*?cap_hash TEXT[\s\S]*?cap_expires_at INTEGER[\s\S]*?cap_decision TEXT[\s\S]*?decided_by TEXT/.test(dbRs),
);
ok(
  "existing databases migrate in place (archive-4 columns added)",
  dbRs.includes("fn ensure_approval_authority_columns") && dbRs.includes("ALTER TABLE approvals ADD COLUMN requested_by"),
);
ok(
  "approval_request binds requested_by and required authority at birth",
  dbRs.includes("requested_by,authority) VALUES") && dbRs.includes("'human')"),
);
ok(
  "the capability minter is the ONLY store of capability material",
  /fn approval_mint_capability\(/.test(dbRs) && (dbRs.match(/UPDATE approvals SET cap_hash=/g) ?? []).length === 1,
);
ok(
  "approval_authorize gates the mint behind the NATIVE dialog",
  /fn approval_authorize\(app: tauri::AppHandle/.test(commandsRs) &&
    commandsRs.includes(".blocking_show()") &&
    commandsRs.includes("MessageDialogButtons::OkCancelCustom"),
);
ok(
  "declining the native dialog mints nothing and decides nothing",
  commandsRs.includes("declined at the native dialog — no capability was minted"),
);
ok(
  "guard policy covers approval_authorize (enum at the gate) + empty-cap refusal",
  guardRs.includes('"approval_decide" | "approval_authorize"') &&
    guardRs.includes("guard: approval_decide requires the native capability"),
);
ok(
  "lib.rs registers approval_authorize from guard::",
  /guard::approval_authorize\b/.test(libRs) && !/commands::approval_authorize\b/.test(libRs),
);
ok(
  "web-mode mirror mints only through an interactive confirm",
  localDbTs.includes('typeof window.confirm !== "function"') &&
    localDbTs.includes("window.confirm(") &&
    localDbTs.includes("declined at the confirm dialog"),
);
ok(
  "web-mode mirror enforces capability ownership, freshness and scope",
  localDbTs.includes("confused-approver refused") &&
    localDbTs.includes("expired (freshness window closed)") &&
    localDbTs.includes("cannot cast"),
);
ok(
  "lists never carry the capability",
  dbRs.includes("Capabilities are NEVER listed") &&
    localDbTs.includes("capability: _capability, ...rest"),
);
ok(
  "the ipc client passes the capability through on decide",
  clientTs.includes('approvalDecide: async (approvalId: string, decision: "APPROVED" | "REJECTED", capability: string)'),
);
ok(
  "db::evolution_decide only flips PROPOSED rows",
  /UPDATE evolution SET decision=\?2, status='DECIDED', decided_at=\?3 WHERE id=\?1 AND status='PROPOSED'/.test(dbRs),
);
ok(
  "evolution_rollback only flips DECIDED rows",
  /UPDATE evolution SET status='ROLLED_BACK' WHERE id=\?1 AND status='DECIDED'/.test(commandsRs),
);
ok(
  "web-mode mirror (localDb.ts) refuses decisions on non-OPEN approvals",
  localDbTs.includes('if (a.status !== "OPEN")') && localDbTs.includes("is not OPEN (current status"),
);
ok(
  "web-mode mirror (localDb.ts) refuses decisions on non-PROPOSED candidates",
  localDbTs.includes('if (c.status !== "PROPOSED")'),
);
ok(
  "C-2 regression tests ship, covering the capability flow (cargo test c2_)",
  dbRs.includes("mod c2_decision_transition_tests") &&
    dbRs.includes("foreign_capability_is_a_confused_approver") &&
    dbRs.includes("capability_cannot_cast_the_other_verdict") &&
    dbRs.includes("expired_capability_is_refused") &&
    dbRs.includes("decide_without_capability_is_refused") &&
    dbRs.includes("existing_databases_gain_the_authority_columns"),
);

/* ───────────── archive-6 audit: what may LEAVE native code, and who may run what ───────────── */
section("archive-6 — the boundary decides what leaves native code (secrets, destinations, execution, programs)");
const grantsRs = read("src-tauri/src/grants.rs");
const secretsRs = read("src-tauri/src/secrets.rs");
const containRs6 = read("src-tauri/src/contain.rs");
const mcpRs6 = read("src-tauri/src/mcp.rs");
const a2aClientTs = read("src/mission/a2aClient.ts");
const selfEvolveTs = read("src/engine/selfEvolve.ts");

/* 0. THE BUG CLASS THAT BROKE THE BUILD FOR THREE ROUNDS: the same command name declared as a
   #[tauri::command] in two modules is a hard compile error (E0428 — the macro exports one name per
   crate), and probes that only pin source TEXT never noticed. Pin the invariant directly. */
{
  const names = (src: string): string[] =>
    [...src.matchAll(/#\[tauri::command\]\s*\n(?:[ \t]*(?:\/\/\/[^\n]*|\/\/[^\n]*|#\[[^\n]*)\n)*[ \t]*pub (?:async )?fn (\w+)/g)].map((m) => m[1]);
  const inCommands = names(commandsRs);
  const inGuard = names(guardRs);
  const both = inCommands.filter((n) => inGuard.includes(n));
  ok("no command is a #[tauri::command] in BOTH commands.rs and guard.rs (E0428 — the crate would not compile)", both.length === 0, both.join(","));
  ok("every command lib.rs registers exists as a #[tauri::command] in the module it is registered from", (() => {
    const regs = [...libRs.matchAll(/\b(commands|guard|git|a2a_host)::(\w+),/g)].map((m) => [m[1], m[2]] as const);
    const gitRs = read("src-tauri/src/git.rs");
    const a2aRs = read("src-tauri/src/a2a_host.rs");
    const bag: Record<string, string[]> = { commands: inCommands, guard: inGuard, git: names(gitRs), a2a_host: names(a2aRs) };
    const missing = regs.filter(([m, n]) => !(bag[m] ?? []).includes(n)).map(([m, n]) => `${m}::${n}`);
    return missing.length === 0 || (console.log("   unresolved registrations:", missing.join(", ")), false);
  })());
}

/* 1. secrets: classes, no raw provider key back to the page, delete is complete */
ok("secret classes exist: provider keys, signing keys, everything else", /pub enum SecretClass \{[\s\S]*Provider[\s\S]*Signing[\s\S]*Other/.test(grantsRs) && /pub fn classify_secret/.test(grantsRs));
ok("secret_get NEVER returns a provider key (value is null + redacted) and refuses unlisted refs",
  /SecretClass::Provider => \{[\s\S]{0,400}"value": null[\s\S]{0,80}"redacted": true/.test(commandsRs) && /SecretClass::Other => Err\(/.test(commandsRs));
ok("guard::authorize classifies secret_get (Other is denied before it reaches the command)", /"secret_get" => \{[\s\S]{0,200}classify_secret\(arg\)/.test(guardRs));
ok("SecretStore::delete clears BOTH keychain namespaces and proves nothing readable remains", /for svc in \[SERVICE, LEGACY_SERVICE\] \{\s*if let Err\(e\) = self\.vault\.delete/.test(secretsRs) && /STILL readable/.test(secretsRs));
ok("the first read migrates a legacy secret forward and retires the legacy copy", /fn get[\s\S]{0,700}vault\.set\(SERVICE[\s\S]{0,120}vault\.delete\(LEGACY_SERVICE/.test(secretsRs));
ok("location() sees the legacy namespace (no 'absent' for a key llm_chat can still use)", /fn location[\s\S]{0,500}for svc in \[SERVICE, LEGACY_SERVICE\]/.test(secretsRs));
ok("the keychain sits behind a Vault seam so the logic is tested (delete / migrate / degrade)", /pub trait Vault/.test(secretsRs) && /delete_removes_the_legacy_namespace_too/.test(secretsRs));

/* 2. llm_chat: the page may not choose BOTH the secret and the destination */
ok("llm_chat is registered from guard:: (async wrapper that authorizes the provider slug)", /pub async fn llm_chat\(state: State<'_, Arc<AppState>>, req: Value\)[\s\S]{0,400}authorize\("llm_chat"/.test(guardRs));
ok("llm_chat attaches PROVIDER keys only (an owner/issuer/other secret_ref is refused)", /classify_secret\(secret_ref\) != grants::SecretClass::Provider/.test(commandsRs));
{
  const i = commandsRs.indexOf("pub async fn llm_chat");
  const body = commandsRs.slice(i, i + 9000);
  const dest = body.indexOf("key_destination_allowed(");
  const keyRead = body.indexOf("state.secrets.get(secret_ref)");
  ok("the destination is decided BEFORE the secret is read (a refused call never touches the key)", dest > 0 && keyRead > 0 && dest < keyRead, `dest=${dest} keyRead=${keyRead}`);
  ok("the destination rule is the vendor's origin or a HUMAN-bound one, over https (or loopback)", /pub fn key_destination_allowed/.test(grantsRs) && /canonical_origin\(kind\) == Some\(origin\.as_str\(\)\)/.test(grantsRs) && /bound_origin == Some\(origin\.as_str\(\)\)/.test(grantsRs) && /plain http is allowed to a loopback address only/.test(grantsRs));
  ok("the SSRF egress guard still runs on top of the destination rule", /egress_guard\(&url\)\.map_err\(\|e\| format!\("base URL refused by the egress guard/.test(body));
}
ok("endpoint binding is a NATIVE dialog (throttled), stored with the human actor, never by the page alone", /pub fn provider_bind_endpoint\(app: AppHandle/.test(commandsRs) && /native_confirm\(/.test(commandsRs.slice(commandsRs.indexOf("pub fn provider_bind_endpoint"))) && /provider_endpoint_bind\(&\*lock_db\(&state\)\?, &secret_ref, &origin, "human:dialog"\)/.test(commandsRs));
ok("an endpoint can only be bound to a PROVIDER key (guard + command)", /"provider_bind_endpoint" => \{[\s\S]{0,200}SecretClass::Provider/.test(guardRs) && /is not a provider key reference/.test(commandsRs));

/* 3. execution: a grant, scoped and expiring, network off by default */
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

/* 4. programs: registering one is a human decision, and what runs is what was approved */
ok("mcp_server_save / _remove are behind the gate AND a native confirmation", /pub fn mcp_server_save\(app: tauri::AppHandle/.test(guardRs) && /pub fn mcp_server_remove\(app: tauri::AppHandle/.test(guardRs) && /native_confirm\(/.test(commandsRs.slice(commandsRs.indexOf("pub fn mcp_server_save"), commandsRs.indexOf("pub fn mcp_connect_test"))));
ok("an approval is written ONLY by native code (`Some(\"human:dialog\")`); the page's own `approval` field is stripped", /mcp_save\(&\*lock_db\(&state\)\?, &cfg, Some\("human:dialog"\)\)/.test(commandsRs) && /o\.remove\("approval"\)/.test(dbRs));
ok("mcp_call and mcp_connect_test run only a program whose approval still matches (fingerprint)", (commandsRs.match(/db::mcp_check_approved\(&s\)/g) ?? []).length >= 2 && /pub fn mcp_check_approved/.test(dbRs));
ok("the flat shape the UI sends is judged like the nested one (mcp_program_of), in the command AND the guard", /db::mcp_program_of\(&cfg\)/.test(commandsRs) && /crate::db::mcp_program_of\(&cfg\)/.test(guardRs));
ok("hermes_bridge speaks only the three commands the evolution service implements", /const HERMES_COMMANDS: &\[&str\] = &\["ping", "score_fitness", "propose"\]/.test(commandsRs) && /"hermes_bridge" => \{[\s\S]{0,160}"ping" \| "score_fitness" \| "propose"/.test(guardRs));
ok("workflow mutation stays data-only: native workflow code spawns nothing (the sinks are gated instead)", !/Command::new|std::process|reqwest/.test(read("src-tauri/src/control_mcp.rs")));

ok("widening the filesystem boundary (workspace_root_add) needs a native confirmation — idempotent for a folder already registered",
  /pub fn workspace_root_add\(app: AppHandle/.test(commandsRs) && /native_confirm\([\s\S]{0,200}open a folder to the crew/.test(commandsRs) && /pub fn workspace_root_add\(app: tauri::AppHandle/.test(guardRs));

/* 5. the helpers the review named */
ok("claimPairing / sendFileToPeer / fetchFileFromPeer all run the shared egress policy before any fetch", (a2aClientTs.match(/guardedBase\(/g) ?? []).length >= 4 && /redirect: "error"/.test(a2aClientTs));
ok("self-evolution's human approval is MEASURED from the approvals store, never hardcoded", !/"human-approved": 1 \}/.test(selfEvolveTs.replace(/\{ floors: \{[^}]*\} \}/g, "")) && /human\.earned \? 1 : 0/.test(selfEvolveTs) && /candidateDigest !== digestOfCandidate/.test(selfEvolveTs));
ok("approval_get reports who decided and what was approved (decidedBy + payload), natively and in the mirror", /"decidedBy": by\.unwrap_or_default\(\)/.test(dbRs) && /decidedBy: a\.decidedBy/.test(localDbTs));
ok("the Rust suites ship and cover this round (grants, secrets, contain, migrate)", ["mod tests", "fn secret_classes_separate", "fn delete_removes_the_legacy_namespace_too", "fn live_every_proven_rung_launches_a_process", "fn an_existing_install_follows_the_rename"].every((t) => [grantsRs, secretsRs, containRs6, read("src-tauri/src/migrate.rs")].some((src) => src.includes(t))));

/* ─────────────────────── C-3: component-based refusal ─────────────────────── */
section("C-3 — credential/system root refusal");
ok("commands.rs matches on path components (path_components_lower)", /fn path_components_lower\(/.test(commandsRs));
ok(
  "the never-firing with_sep construction is gone",
  !/let with_sep = /.test(commandsRs) && !/with_sep\.ends_with\(/.test(commandsRs),
);
ok(
  "credential check is an ordered TAIL match over components",
  /comps\.len\(\) >= want\.len\(\) && comps\[comps\.len\(\) - want\.len\(\)\.\.\] == want\[\.\.\]/.test(commandsRs),
);
ok(
  "system dirs compare component-wise, not as separator-fragile strings",
  /comps == path_components_lower\(bad\)/.test(commandsRs),
);
ok(
  "extended-length prefix handled in both canonical and folded forms",
  (commandsRs.match(/strip_prefix\("/g)?.length ?? 0) >= 3 && commandsRs.includes('strip_prefix("?/")'),
);
ok(
  "reviewer's Windows vectors ship as #[cfg(test)] tests",
  commandsRs.includes("mod c3_credential_path_tests") &&
    commandsRs.includes("C:\\Users\\me\\.ssh") &&
    commandsRs.includes("\\\\?\\C:\\Users\\me\\.ssh"),
);
ok(
  "trailing-separator and case variants are pinned",
  commandsRs.includes("trailing backslash must not defeat the check") &&
    commandsRs.includes("C:\\USERS\\ME\\.SSH"),
);

/* ──────── C-4: the bridge refuses unsigned current-format receipts ──────── */
section("C-4 — bridge matches the canonical receipt policy (runs the real bridge)");
const bridge = await import("../protocol/bridge/selfimpulse-receipt-bridge.mjs") as {
  verifyReceiptChain(rc: unknown): { ok: boolean; reason?: string; head?: string };
  generateBridgeIdentity(name?: string): { name: string; fp: string; privateKey: crypto.KeyObject; publicJwk: unknown };
  anchorReceipt(id: unknown, receipt: unknown, opts?: object): { ok: boolean; reason?: string; env?: unknown; evidence?: string };
  verifyAnchor(env: unknown, jwk: unknown): { ok: boolean; reason?: string; facts?: { kind?: string } };
  sealFact(facts: unknown, key: crypto.KeyObject): unknown;
};

const sortDeep = (v: unknown): unknown =>
  Array.isArray(v) ? v.map(sortDeep)
  : v && typeof v === "object"
    ? Object.fromEntries(Object.keys(v as Record<string, unknown>).sort().map((k) => [k, sortDeep((v as Record<string, unknown>)[k])]))
    : v;
const canon = (o: unknown): string => JSON.stringify(sortDeep(o));
const sha = (s: string): string => crypto.createHash("sha256").update(s, "utf8").digest("hex");
/** Published per-format seal secrets — mirror of SEAL_SECRETS in the bridge. */
const SEAL_SECRETS: Record<string, string> = {
  "si-proof-receipt/2": "si-commercial-v1-offline",
  "mj-proof-receipt/2": "mj-commercial-v1-offline",
  "mj-proof-receipt/1": "mj-commercial-v1-offline",
};

type Receipt = { format: string; header: Record<string, unknown>; events: unknown[]; seal: string; issuer?: unknown; signature?: string };

function buildReceipt(fmt: string, signed: boolean): Receipt {
  const issuer = crypto.generateKeyPairSync("ed25519");
  const pubHex = Buffer.from((issuer.publicKey.export({ format: "jwk" }) as { x: string }).x, "base64url").toString("hex");
  let prev = "0".repeat(64);
  const events = [{ seq: 0, prev, ts: 1_750_000_000_000, type: "mission.start", objective: "probe" }].map((body) => {
    const e: Record<string, unknown> = { ...body };
    e.prev = prev;
    e.hash = sha(canon(e));
    prev = e.hash;
    return e;
  });
  const rc: Receipt = {
    format: fmt,
    header: { mission: "native-authz-probe" },
    events,
    seal: crypto.createHmac("sha256", SEAL_SECRETS[fmt] ?? "si-commercial-v1-offline").update(prev, "utf8").digest("hex"),
  };
  if (signed) {
    rc.issuer = { alg: "ed25519", publicKeyHex: pubHex };
    rc.signature = crypto.sign(null, Buffer.from(prev, "hex"), issuer.privateKey).toString("hex");
  }
  return rc;
}

const unsignedCurrent = buildReceipt("si-proof-receipt/2", false);
const vUnsigned = bridge.verifyReceiptChain(unsignedCurrent);
ok(
  "unsigned si-proof-receipt/2 is REFUSED with the signature requirement named",
  vUnsigned.ok === false && /issuer signature is required/.test(vUnsigned.reason ?? ""),
  vUnsigned.reason,
);

const signedCurrent = buildReceipt("si-proof-receipt/2", true);
const vSigned = bridge.verifyReceiptChain(signedCurrent);
ok("signed si-proof-receipt/2 verifies", vSigned.ok === true, vSigned.reason);

const legacyUnsigned = buildReceipt("mj-proof-receipt/1", false);
const vLegacy = bridge.verifyReceiptChain(legacyUnsigned);
ok("legacy mj-proof-receipt/1 still verifies unsigned (format promise)", vLegacy.ok === true, vLegacy.reason);

const tampered = buildReceipt("si-proof-receipt/2", true);
(tampered.events[0] as { note?: string }).note = "evil";
ok("tampered event still fails (hash mismatch)", bridge.verifyReceiptChain(tampered).ok === false);

const anchor = bridge.generateBridgeIdentity("probe");
const refusedAnchor = bridge.anchorReceipt(anchor, unsignedCurrent);
ok(
  "anchorReceipt refuses to attest an unsigned current-format receipt",
  refusedAnchor.ok === false && /issuer signature is required/.test(refusedAnchor.reason ?? ""),
  refusedAnchor.reason,
);

// A forged evidence string inside a valid envelope: the envelope signature is
// real (attacker would need the issuer key to produce it — here WE are the
// issuer to prove the evidence grammar itself holds the line).
const forgedFacts = {
  v: 2, kind: "agent_action",
  agent: { n: "probe", fp: anchor.fp },
  action: "anchor_receipt", tool: "selfimpulse-receipt-bridge", purpose: "native-authz-probe",
  policy: null,
  evidence: `receipt:si-proof-receipt/2:head:${"a".repeat(64)}:events:1:seal:ok:issuer:unsigned`,
  result: "success", ts: Date.now(),
};
const forgedEnv = bridge.sealFact(forgedFacts, anchor.privateKey);
const vForged = bridge.verifyAnchor(forgedEnv, anchor.publicJwk);
ok(
  "verifyAnchor rejects evidence that claims an unsigned CURRENT-format receipt",
  vForged.ok === false && /claims an unsigned receipt/.test(vForged.reason ?? ""),
  vForged.reason,
);

const legacyFacts = { ...forgedFacts, evidence: `receipt:mj-proof-receipt/1:head:${"b".repeat(64)}:events:1:seal:ok:issuer:unsigned` };
const legacyEnv = bridge.sealFact(legacyFacts, anchor.privateKey);
ok(
  "verifyAnchor still accepts legacy-format unsigned evidence (no over-blocking)",
  bridge.verifyAnchor(legacyEnv, anchor.publicJwk).ok === true,
);

const malformedEnv = bridge.sealFact({ ...forgedFacts, evidence: "receipt:garbage" }, anchor.privateKey);
ok("verifyAnchor still rejects malformed evidence", bridge.verifyAnchor(malformedEnv, anchor.publicJwk).ok === false);

/* ───────────────────────────────── summary ───────────────────────────────── */
console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) {
  console.error("failures:\n  - " + failures.join("\n  - "));
  process.exit(1);
}
