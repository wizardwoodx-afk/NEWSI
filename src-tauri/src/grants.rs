//! Native capability primitives — PURE logic (no Tauri imports), so every rule
//! in this file is exercised by `cargo test`, not merely described.
//!
//! WHY THIS FILE EXISTS. The WebView is untrusted content: a script injected
//! into the page can call any registered command with any arguments. The
//! privileged commands used to authorize on the SHAPE of those arguments ("is
//! the secret_ref non-empty?", "is the program string non-empty?"), which is a
//! typo check, not an authorization. A compromised page could therefore name
//! ANY stored secret and ANY destination (`llm_chat`: attach the key to an
//! attacker's public https URL), read raw secrets back (`secret_get`), or run a
//! dev tool with any arguments and the network wide open.
//!
//! The rules below replace "does it look right" with "was it granted":
//!
//!   • SECRET CLASSES — which references may ever leave native code, and how.
//!     A provider key is never returned to the page at all; it is only ever
//!     attached natively, by `llm_chat`, to a destination this file approves.
//!   • ENDPOINT POLICY — a provider key may be sent only to the vendor's own
//!     canonical origin, or to an origin a HUMAN bound through a native dialog.
//!     The page can name neither a foreign secret nor a foreign host.
//!   • EXEC GRANTS — running a dev tool needs a scoped, expiring grant minted
//!     by a native dialog: which programs, which workspace, whether the network
//!     is reachable (default: it is NOT). The token is stored only as a hash.
//!   • DIALOG THROTTLE — a page cannot machine-gun confirmation dialogs at the
//!     human until one is clicked through by reflex.
//!
//! Honest limit, stated here so no reader infers more: a native dialog proves
//! "a human confirmed THIS request", not "this request was a good idea". The
//! dialogs therefore print the exact program/host/workspace they are about to
//! authorize, and the throttle makes spam fail closed.

use parking_lot::Mutex;
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::time::{SystemTime, UNIX_EPOCH};

pub fn unix_now() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0)
}

/* ───────────────────────────── secret classes ───────────────────────────── */

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SecretClass {
    /// A model-provider API key. NEVER returned to the page; only attached natively.
    Provider,
    /// A signing key the WebView-side signer still needs to read (owner / issuer keys).
    /// Honest residual: until signing moves native, these remain readable by the page.
    Signing,
    /// Anything else. Not readable by the page, not attachable to a provider call.
    Other,
}

/// Signing-key references the page-side signer reads today.
pub const SIGNING_REFS: &[&str] = &["engine.ownerKeys", "vh.issuerkey.v1", "selfimpulse.issuerkey.v1"];
/// Reference families that hold model-provider API keys.
pub const PROVIDER_PREFIXES: &[&str] = &["vh.providerkey.", "provider.", "selfimpulse.providerkey."];

pub fn classify_secret(secret_ref: &str) -> SecretClass {
    if SIGNING_REFS.contains(&secret_ref) {
        return SecretClass::Signing;
    }
    if PROVIDER_PREFIXES.iter().any(|p| secret_ref.starts_with(p) && secret_ref.len() > p.len()) {
        return SecretClass::Provider;
    }
    SecretClass::Other
}

/// A non-reversible nudge for the settings page ("…abcd"). Short secrets get none:
/// four characters of a short secret is a real fraction of it.
pub fn secret_hint(value: &str) -> Option<String> {
    let chars: Vec<char> = value.chars().collect();
    if chars.len() >= 20 {
        Some(format!("…{}", chars[chars.len() - 4..].iter().collect::<String>()))
    } else {
        None
    }
}

/* ──────────────────────────── endpoint policy ───────────────────────────── */

/// The vendor's own origin for the provider kinds this build knows. A kind not
/// listed here has NO built-in destination: its key may only go where a human bound it.
pub fn canonical_origin(kind: &str) -> Option<&'static str> {
    match kind {
        "openai" => Some("https://api.openai.com"),
        "anthropic" => Some("https://api.anthropic.com"),
        "google" => Some("https://generativelanguage.googleapis.com"),
        "groq" => Some("https://api.groq.com"),
        "openrouter" => Some("https://openrouter.ai"),
        _ => None,
    }
}

pub fn is_loopback_host(host: &str) -> bool {
    let h = host.trim_start_matches('[').trim_end_matches(']').to_ascii_lowercase();
    if h == "localhost" {
        return true;
    }
    h.parse::<std::net::IpAddr>().map(|ip| ip.is_loopback()).unwrap_or(false)
}

/// `scheme://host[:port]`, lowercase, default port elided. Credentials in the URL
/// are refused outright — `https://api.openai.com@evil.example/` must never be
/// read as "openai".
pub fn origin_of(raw: &str) -> Result<String, String> {
    let u = reqwest::Url::parse(raw).map_err(|_| "not a parseable URL".to_string())?;
    if !u.username().is_empty() || u.password().is_some() {
        return Err("a URL with embedded credentials is refused".into());
    }
    match u.scheme() {
        "http" | "https" => {}
        s => return Err(format!("scheme \"{s}\" refused — only http(s)")),
    }
    if u.host_str().is_none() {
        return Err("the URL has no host".into());
    }
    Ok(u.origin().ascii_serialization())
}

/// May a request carrying this provider's KEY go to `url`?
///
/// Yes only if (a) it is https — or plain http to a loopback address — AND
/// (b) the origin is the vendor's canonical origin for `kind`, or exactly the
/// origin a human bound to this secret. Everything else is refused before the
/// secret is even read.
pub fn key_destination_allowed(kind: &str, url: &str, bound_origin: Option<&str>) -> Result<(), String> {
    let origin = origin_of(url)?;
    let u = reqwest::Url::parse(url).map_err(|e| e.to_string())?;
    let loopback = u.host_str().map(is_loopback_host).unwrap_or(false);
    if u.scheme() != "https" && !loopback {
        return Err(format!(
            "a provider key may only travel over https (plain http is allowed to a loopback address only) — {origin} refused"
        ));
    }
    if canonical_origin(kind) == Some(origin.as_str()) {
        return Ok(());
    }
    if bound_origin == Some(origin.as_str()) {
        return Ok(());
    }
    Err(match canonical_origin(kind) {
        Some(c) => format!(
            "this provider's key may only be sent to {c} or to an endpoint you bound with a native confirmation — {origin} is neither"
        ),
        None => format!(
            "this provider has no built-in endpoint; its key may only be sent to an endpoint you bound with a native confirmation — {origin} is not bound"
        ),
    })
}

/// A provider id as the page may spell it: `[a-z0-9][a-z0-9._-]{0,63}`.
pub fn valid_provider_id(s: &str) -> bool {
    let b = s.as_bytes();
    !b.is_empty()
        && b.len() <= 64
        && (b[0].is_ascii_lowercase() || b[0].is_ascii_digit())
        && b.iter().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || matches!(c, b'.' | b'_' | b'-'))
}

/* ───────────────────────────── execution grants ──────────────────────────── */

/// The dev-tool seat a grant may cover. One list, shared with `shell_exec`.
/// (`uvx` is `npx`'s Python-side twin and the launcher the product's own MCP catalog uses for its
/// git / fetch / time servers — leaving it off made those entries unrunnable.)
pub const DEV_TOOLS: &[&str] = &["node", "npm", "npx", "python", "python3", "pip", "pip3", "pytest", "cargo", "git", "go", "uvx"];
/// Marker a grant may include to also cover executables that live INSIDE its workspace.
pub const WORKSPACE_BINARIES: &str = "@workspace";
pub const MAX_GRANT_SECS: u64 = 3600;
pub const MIN_GRANT_SECS: u64 = 60;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GrantView {
    pub workspace: String,
    pub network: bool,
    pub programs: Vec<String>,
    pub expires_at: u64,
}

pub fn bare_name(program: &str) -> String {
    std::path::Path::new(program)
        .file_name()
        .map(|f| f.to_string_lossy().trim_end_matches(".exe").to_string())
        .unwrap_or_else(|| program.to_string())
}

pub fn token_hash(token: &str) -> String {
    format!("{:x}", Sha256::digest(token.as_bytes()))
}

/// In-memory, per-process. Never persisted: a grant does not survive a restart,
/// which is the point.
pub struct ExecGrants {
    inner: Mutex<HashMap<String, GrantView>>,
}

impl Default for ExecGrants {
    fn default() -> Self {
        Self::new()
    }
}

impl ExecGrants {
    pub fn new() -> Self {
        Self { inner: Mutex::new(HashMap::new()) }
    }

    /// Normalise and validate what a grant would cover — WITHOUT minting anything. The command
    /// calls this before it asks a human, so the dialog can never describe a scope that would
    /// then be refused or quietly trimmed.
    pub fn validate_scope(programs: &[String], workspace: &str) -> Result<Vec<String>, String> {
        if workspace.trim().is_empty() {
            return Err("an execution grant must name its workspace".into());
        }
        let mut progs: Vec<String> = programs
            .iter()
            .map(|p| if p == WORKSPACE_BINARIES { p.clone() } else { bare_name(p) })
            .collect();
        progs.sort();
        progs.dedup();
        if progs.is_empty() {
            return Err("an execution grant must name at least one program".into());
        }
        if let Some(bad) = progs.iter().find(|p| p.as_str() != WORKSPACE_BINARIES && !DEV_TOOLS.contains(&p.as_str())) {
            return Err(format!("\"{bad}\" is not a dev tool an execution grant may cover"));
        }
        Ok(progs)
    }

    /// Mint a grant. Called ONLY after the human confirmed the native dialog that
    /// printed exactly these programs, this workspace and this network setting.
    pub fn mint(&self, programs: &[String], workspace: &str, network: bool, ttl_secs: u64, now: u64) -> Result<(String, GrantView), String> {
        let progs = Self::validate_scope(programs, workspace)?;
        let ttl = ttl_secs.clamp(MIN_GRANT_SECS, MAX_GRANT_SECS);
        let token = format!("xg_{}", uuid::Uuid::new_v4());
        let view = GrantView { workspace: workspace.to_string(), network, programs: progs, expires_at: now + ttl };
        let mut g = self.inner.lock();
        g.retain(|_, v| v.expires_at > now);
        g.insert(token_hash(&token), view.clone());
        Ok((token, view))
    }

    /// Does `token` authorize running `program`? The caller separately proves the
    /// cwd sits inside `GrantView::workspace`, using its own path normalizer.
    pub fn check(&self, token: &str, program: &str, is_workspace_binary: bool, now: u64) -> Result<GrantView, String> {
        if token.trim().is_empty() {
            return Err("no execution grant was presented — request one (a native confirmation) before running a program. Nothing ran.".into());
        }
        let g = self.inner.lock();
        let Some(view) = g.get(&token_hash(token)) else {
            return Err("that execution grant is unknown or was revoked — request a new one. Nothing ran.".into());
        };
        if now >= view.expires_at {
            return Err("that execution grant has expired — request a new one. Nothing ran.".into());
        }
        let bare = bare_name(program);
        let covered = if DEV_TOOLS.contains(&bare.as_str()) {
            view.programs.contains(&bare)
        } else {
            is_workspace_binary && view.programs.iter().any(|p| p == WORKSPACE_BINARIES)
        };
        if !covered {
            return Err(format!(
                "\"{bare}\" is outside this execution grant (covers: {}). Nothing ran.",
                view.programs.join(", ")
            ));
        }
        Ok(view.clone())
    }

    pub fn revoke_all(&self) -> usize {
        let mut g = self.inner.lock();
        let n = g.len();
        g.clear();
        n
    }

    /// What is currently granted — never the tokens.
    pub fn status(&self, now: u64) -> Vec<GrantView> {
        let mut v: Vec<GrantView> = self.inner.lock().values().filter(|g| g.expires_at > now).cloned().collect();
        v.sort_by(|a, b| a.workspace.cmp(&b.workspace).then(a.expires_at.cmp(&b.expires_at)));
        v
    }
}

/* ───────────────────────────── dialog throttle ───────────────────────────── */

pub const DECLINE_LIMIT: usize = 3;
pub const DECLINE_WINDOW_SECS: u64 = 60;
pub const LOCKOUT_SECS: u64 = 120;

#[derive(Default)]
struct ThrottleState {
    declines: Vec<u64>,
    locked_until: u64,
    open: bool,
}

/// One native confirmation at a time, and a fail-closed lockout after repeated
/// declines. Without it a hostile page can queue dialogs until a reflexive click
/// lands on one it should not have.
pub struct DialogThrottle {
    st: Mutex<ThrottleState>,
}

impl Default for DialogThrottle {
    fn default() -> Self {
        Self::new()
    }
}

pub struct DialogTicket<'a> {
    t: &'a DialogThrottle,
}

impl DialogThrottle {
    pub fn new() -> Self {
        Self { st: Mutex::new(ThrottleState::default()) }
    }

    pub fn begin(&self, now: u64) -> Result<DialogTicket<'_>, String> {
        let mut s = self.st.lock();
        if now < s.locked_until {
            return Err(format!(
                "too many declined confirmation prompts — prompts are locked for {} more second(s). Nothing was shown and nothing was granted.",
                s.locked_until - now
            ));
        }
        if s.open {
            return Err("another confirmation prompt is already open — answer it first. Nothing new was shown.".into());
        }
        s.open = true;
        Ok(DialogTicket { t: self })
    }
}

impl DialogTicket<'_> {
    /// Record the human's answer. A decline counts toward the lockout.
    pub fn finish(self, confirmed: bool, now: u64) {
        if !confirmed {
            let mut s = self.t.st.lock();
            s.declines.push(now);
            s.declines.retain(|t| now.saturating_sub(*t) < DECLINE_WINDOW_SECS);
            if s.declines.len() >= DECLINE_LIMIT {
                s.locked_until = now + LOCKOUT_SECS;
                s.declines.clear();
            }
        }
        // `self` drops here and releases the single-dialog slot.
    }
}

impl Drop for DialogTicket<'_> {
    fn drop(&mut self) {
        self.t.st.lock().open = false;
    }
}

/* ──────────────────────────────── tests ──────────────────────────────────── */

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn secret_classes_separate_provider_keys_from_signing_keys_from_everything_else() {
        assert_eq!(classify_secret("vh.providerkey.openai-main"), SecretClass::Provider);
        assert_eq!(classify_secret("provider.anthropic.production"), SecretClass::Provider);
        assert_eq!(classify_secret("provider.ollama.local"), SecretClass::Provider);
        assert_eq!(classify_secret("engine.ownerKeys"), SecretClass::Signing);
        assert_eq!(classify_secret("vh.issuerkey.v1"), SecretClass::Signing);
        assert_eq!(classify_secret("selfimpulse.issuerkey.v1"), SecretClass::Signing);
        assert_eq!(classify_secret("something.else"), SecretClass::Other);
        // a bare prefix is not a provider reference, and a lookalike is not a signing key
        assert_eq!(classify_secret("provider."), SecretClass::Other);
        assert_eq!(classify_secret("engine.ownerKeys2"), SecretClass::Other);
        assert_eq!(classify_secret("xprovider.openai"), SecretClass::Other);
    }

    #[test]
    fn the_hint_never_reveals_a_short_secret() {
        assert_eq!(secret_hint("short"), None);
        assert_eq!(secret_hint("sk-1234567890123456"), None); // 19 chars
        assert_eq!(secret_hint("sk-12345678901234567890abcd").as_deref(), Some("…abcd"));
    }

    #[test]
    fn origins_normalise_and_hostile_forms_are_refused() {
        assert_eq!(origin_of("https://API.OpenAI.com/v1/chat/completions").unwrap(), "https://api.openai.com");
        assert_eq!(origin_of("https://api.openai.com:443/x").unwrap(), "https://api.openai.com");
        assert_eq!(origin_of("http://127.0.0.1:11434/api/chat").unwrap(), "http://127.0.0.1:11434");
        assert!(origin_of("https://api.openai.com@evil.example/").is_err(), "userinfo must never read as the vendor");
        assert!(origin_of("https://user:pw@api.openai.com/").is_err());
        assert!(origin_of("ftp://api.openai.com/").is_err());
        assert!(origin_of("not a url").is_err());
    }

    #[test]
    fn a_key_goes_to_the_vendor_or_to_a_human_bound_origin_and_nowhere_else() {
        // the vendor's own host: fine with no binding at all
        assert!(key_destination_allowed("openai", "https://api.openai.com/v1/chat/completions", None).is_ok());
        assert!(key_destination_allowed("anthropic", "https://api.anthropic.com/v1/messages", None).is_ok());
        // THE REVIEW'S ATTACK: an attacker-controlled PUBLIC https host with a known secret ref
        let e = key_destination_allowed("openai", "https://attacker-controlled.example/v1/chat/completions", None).unwrap_err();
        assert!(e.contains("neither"), "{e}");
        // the same attack dressed as the vendor
        assert!(key_destination_allowed("openai", "https://api.openai.com.evil.example/v1", None).is_err());
        assert!(key_destination_allowed("openai", "https://api.openai.com@evil.example/v1", None).is_err());
        // one vendor's key cannot be sent to another vendor's host
        assert!(key_destination_allowed("openai", "https://api.anthropic.com/v1/messages", None).is_err());
        // a kind with no built-in endpoint needs a human binding
        assert!(key_destination_allowed("mistral", "https://api.mistral.ai/v1/chat/completions", None).is_err());
        assert!(key_destination_allowed("mistral", "https://api.mistral.ai/v1/chat/completions", Some("https://api.mistral.ai")).is_ok());
        // …and the binding is for that exact origin, not for the host family
        assert!(key_destination_allowed("mistral", "https://evil.example/", Some("https://api.mistral.ai")).is_err());
        assert!(key_destination_allowed("mistral", "https://api.mistral.ai:8443/", Some("https://api.mistral.ai")).is_err());
    }

    #[test]
    fn plain_http_carries_no_key_except_to_loopback() {
        assert!(key_destination_allowed("openai", "http://api.openai.com/v1", None).is_err(), "cleartext to the vendor is still refused");
        assert!(key_destination_allowed("custom", "http://gateway.example/v1", Some("http://gateway.example")).is_err());
        assert!(key_destination_allowed("custom", "http://127.0.0.1:8080/v1", Some("http://127.0.0.1:8080")).is_ok());
        assert!(key_destination_allowed("custom", "http://localhost:8080/v1", Some("http://localhost:8080")).is_ok());
        assert!(key_destination_allowed("custom", "http://[::1]:8080/v1", Some("http://[::1]:8080")).is_ok());
    }

    #[test]
    fn provider_ids_are_flat_lowercase_slugs() {
        for ok in ["openai", "openai-main", "a", "my.gateway_2", "0abc"] {
            assert!(valid_provider_id(ok), "{ok}");
        }
        for bad in ["", "-x", "Open", "a b", "a/b", "a..\\b", &"x".repeat(65)] {
            assert!(!valid_provider_id(bad), "{bad:?}");
        }
    }

    fn mint(g: &ExecGrants, progs: &[&str], net: bool, ttl: u64, now: u64) -> String {
        let p: Vec<String> = progs.iter().map(|s| s.to_string()).collect();
        g.mint(&p, "/ws", net, ttl, now).unwrap().0
    }

    #[test]
    fn a_grant_covers_exactly_what_the_human_saw() {
        let g = ExecGrants::new();
        let t = mint(&g, &["node", "git"], false, 600, 1000);
        let v = g.check(&t, "node", false, 1001).unwrap();
        assert_eq!((v.network, v.workspace.as_str()), (false, "/ws"));
        assert!(g.check(&t, "/usr/bin/git", false, 1001).is_ok(), "a path resolves to its bare name");
        let e = g.check(&t, "python3", false, 1001).unwrap_err();
        assert!(e.contains("outside this execution grant"), "{e}");
        let e = g.check(&t, "calc.exe", true, 1001).unwrap_err();
        assert!(e.contains("outside this execution grant"), "a workspace binary needs the marker: {e}");
    }

    #[test]
    fn workspace_binaries_need_the_explicit_marker_and_to_actually_live_in_the_workspace() {
        let g = ExecGrants::new();
        let t = mint(&g, &["node", WORKSPACE_BINARIES], false, 600, 1000);
        assert!(g.check(&t, "./tool", true, 1001).is_ok());
        assert!(g.check(&t, "./tool", false, 1001).is_err(), "not inside the workspace");
    }

    #[test]
    fn grants_expire_and_unknown_or_empty_tokens_are_refused() {
        let g = ExecGrants::new();
        let t = mint(&g, &["node"], false, 300, 1000);
        assert!(g.check(&t, "node", false, 1299).is_ok());
        let e = g.check(&t, "node", false, 1300).unwrap_err();
        assert!(e.contains("expired"), "{e}");
        assert!(g.check("xg_not-a-token", "node", false, 1001).unwrap_err().contains("unknown"));
        assert!(g.check("", "node", false, 1001).unwrap_err().contains("no execution grant"));
        assert!(g.check("   ", "node", false, 1001).is_err());
    }

    #[test]
    fn the_catalogs_own_launchers_are_dev_tools() {
        for p in ["node", "npx", "uvx", "git"] {
            assert!(DEV_TOOLS.contains(&p), "{p}");
        }
        let g = ExecGrants::new();
        assert!(g.mint(&["uvx".to_string()], "/ws", false, 600, 1000).is_ok());
    }

    #[test]
    fn ttl_is_clamped_and_only_dev_tools_can_be_granted() {
        let g = ExecGrants::new();
        let v = g.mint(&["node".to_string()], "/ws", false, 99_999, 1000).unwrap().1;
        assert_eq!(v.expires_at, 1000 + MAX_GRANT_SECS, "a grant cannot be made to last for days");
        let v = g.mint(&["node".to_string()], "/ws", false, 1, 1000).unwrap().1;
        assert_eq!(v.expires_at, 1000 + MIN_GRANT_SECS);
        assert!(g.mint(&["calc.exe".to_string()], "/ws", false, 600, 1000).is_err());
        assert!(g.mint(&["rm".to_string()], "/ws", false, 600, 1000).is_err());
        assert!(g.mint(&[], "/ws", false, 600, 1000).is_err());
        assert!(g.mint(&["node".to_string()], "  ", false, 600, 1000).is_err());
    }

    #[test]
    fn tokens_are_stored_only_as_hashes_and_status_never_lists_them() {
        let g = ExecGrants::new();
        let t = mint(&g, &["node"], true, 600, 1000);
        assert!(t.starts_with("xg_"));
        let st = g.status(1001);
        assert_eq!(st.len(), 1);
        assert!(st[0].network, "the status shows the network setting the human granted");
        assert!(!format!("{st:?}").contains(&t), "status must never echo a token");
        assert!(g.inner.lock().keys().all(|k| k.len() == 64 && !k.contains("xg_")), "the map is keyed by sha256, not by token");
        assert_eq!(g.revoke_all(), 1);
        assert!(g.check(&t, "node", false, 1001).is_err(), "a revoked grant is dead");
    }

    #[test]
    fn expired_grants_are_pruned_on_the_next_mint() {
        let g = ExecGrants::new();
        let _old = mint(&g, &["node"], false, 60, 1000);
        let _new = mint(&g, &["git"], false, 600, 5000);
        assert_eq!(g.inner.lock().len(), 1, "the expired grant must not accumulate");
    }

    #[test]
    fn one_prompt_at_a_time() {
        let t = DialogThrottle::new();
        let first = t.begin(100).unwrap();
        let e = t.begin(100).err().unwrap();
        assert!(e.contains("already open"), "{e}");
        first.finish(true, 100);
        assert!(t.begin(101).is_ok(), "the slot frees when the answer lands");
    }

    #[test]
    fn repeated_declines_lock_the_prompt_closed_then_it_recovers() {
        let t = DialogThrottle::new();
        for i in 0..DECLINE_LIMIT as u64 {
            t.begin(200 + i).unwrap().finish(false, 200 + i);
        }
        let e = t.begin(205).err().unwrap();
        assert!(e.contains("locked"), "{e}");
        assert!(t.begin(200 + 2 + LOCKOUT_SECS).is_ok(), "the lockout ends");
    }

    #[test]
    fn declines_outside_the_window_do_not_accumulate() {
        let t = DialogThrottle::new();
        t.begin(0).unwrap().finish(false, 0);
        t.begin(100).unwrap().finish(false, 100);
        t.begin(200).unwrap().finish(false, 200);
        assert!(t.begin(201).is_ok(), "three declines spread over minutes are not an attack");
    }

    #[test]
    fn a_dropped_ticket_still_releases_the_slot() {
        let t = DialogThrottle::new();
        {
            let _ticket = t.begin(10).unwrap(); // e.g. the dialog call panicked or errored out
        }
        assert!(t.begin(11).is_ok());
    }
}
