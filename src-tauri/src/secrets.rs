use parking_lot::Mutex;
use std::collections::{HashMap, HashSet};

const SERVICE: &str = "si-desktop";
/// Legacy keychain namespace (pre-19.5.1). Reads fall back to it so owners keep
/// access to previously stored secrets — and the first read MIGRATES the value
/// forward and retires the legacy entry, so there is only ever one namespace to
/// reason about. Deletion removes BOTH, because a delete that leaves a readable
/// copy behind is not a delete: the legacy entry used to survive it, and the next
/// `get()` brought the "deleted" key back.
const LEGACY_SERVICE: &str = "mj-desktop";

/// Where a secret actually ended up. V7 fix (bug W): `set` used to fall back to an in-process
/// HashMap and still return `Ok(())`, so the UI confirmed a key was stored in the OS keychain when
/// in fact it lived only in RAM and was gone at the next restart. The store now reports the truth
/// and remembers which refs are in that degraded state.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SecretLocation {
    /// Written to the OS credential store; survives restarts.
    Keychain,
    /// Held in process memory only; lost on exit.
    MemoryOnly,
    /// Not stored anywhere.
    Absent,
}

/// The OS credential store, behind a seam so the namespace logic below is tested
/// against a controllable fake instead of whatever keychain the CI box has.
pub trait Vault: Send + Sync {
    fn get(&self, service: &str, key: &str) -> Result<Option<String>, String>;
    fn set(&self, service: &str, key: &str, value: &str) -> Result<(), String>;
    /// Ok(true) = removed, Ok(false) = there was nothing to remove, Err = the store refused.
    fn delete(&self, service: &str, key: &str) -> Result<bool, String>;
}

/// The real thing: the platform keychain via the `keyring` crate.
pub struct KeyringVault;

impl Vault for KeyringVault {
    fn get(&self, service: &str, key: &str) -> Result<Option<String>, String> {
        let entry = keyring::Entry::new(service, key).map_err(|e| e.to_string())?;
        match entry.get_password() {
            Ok(v) => Ok(Some(v)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(e) => Err(e.to_string()),
        }
    }
    fn set(&self, service: &str, key: &str, value: &str) -> Result<(), String> {
        keyring::Entry::new(service, key)
            .map_err(|e| e.to_string())?
            .set_password(value)
            .map_err(|e| e.to_string())
    }
    fn delete(&self, service: &str, key: &str) -> Result<bool, String> {
        let entry = keyring::Entry::new(service, key).map_err(|e| e.to_string())?;
        match entry.delete_credential() {
            Ok(()) => Ok(true),
            Err(keyring::Error::NoEntry) => Ok(false),
            Err(e) => Err(e.to_string()),
        }
    }
}

pub struct SecretStore {
    vault: Box<dyn Vault>,
    fallback: Mutex<HashMap<String, String>>,
    /// Refs currently held only in memory, i.e. NOT protected by the OS keychain.
    degraded: Mutex<HashSet<String>>,
}

impl Default for SecretStore {
    fn default() -> Self {
        Self::new()
    }
}

impl SecretStore {
    pub fn new() -> Self {
        Self::with_vault(Box::new(KeyringVault))
    }

    pub fn with_vault(vault: Box<dyn Vault>) -> Self {
        Self { vault, fallback: Mutex::new(HashMap::new()), degraded: Mutex::new(HashSet::new()) }
    }

    pub fn set(&self, secret_ref: &str, value: &str) -> Result<SecretLocation, String> {
        if self.vault.set(SERVICE, secret_ref, value).is_ok() {
            self.degraded.lock().remove(secret_ref);
            // The keychain now holds the truth. A stale memory copy would outlive a later
            // keychain delete, and a legacy copy would resurface after one.
            self.fallback.lock().remove(secret_ref);
            let _ = self.vault.delete(LEGACY_SERVICE, secret_ref);
            return Ok(SecretLocation::Keychain);
        }
        self.fallback.lock().insert(secret_ref.to_string(), value.to_string());
        self.degraded.lock().insert(secret_ref.to_string());
        Ok(SecretLocation::MemoryOnly)
    }

    /// Refs that are stored only in memory and will be lost when the app exits.
    #[allow(dead_code)]
    pub fn degraded_refs(&self) -> Vec<String> {
        let mut v: Vec<String> = self.degraded.lock().iter().cloned().collect();
        v.sort();
        v
    }

    pub fn location(&self, secret_ref: &str) -> SecretLocation {
        if self.degraded.lock().contains(secret_ref) {
            return SecretLocation::MemoryOnly;
        }
        // The legacy namespace counts: `get` can return a secret from it, so reporting
        // "absent" for one would tell the UI a key is gone that `llm_chat` can still use.
        for svc in [SERVICE, LEGACY_SERVICE] {
            if matches!(self.vault.get(svc, secret_ref), Ok(Some(_))) {
                return SecretLocation::Keychain;
            }
        }
        if self.fallback.lock().contains_key(secret_ref) {
            SecretLocation::MemoryOnly
        } else {
            SecretLocation::Absent
        }
    }

    /// Remove the secret from EVERY place it can be read from, then prove it is gone.
    ///
    /// Both keychain namespaces and the memory fallback are cleared. Afterwards each
    /// namespace is read back: a copy that is still readable is an error, not a success
    /// ("the UI said Deleted and the key came back" is the bug this fixes). If the
    /// keychain refuses and the ref was never keychain-resident (memory-only), the
    /// refusal is irrelevant and ignored; otherwise it is reported.
    pub fn delete(&self, secret_ref: &str) -> Result<(), String> {
        let was_memory_only = self.degraded.lock().contains(secret_ref);
        let mut vault_errors: Vec<String> = Vec::new();
        for svc in [SERVICE, LEGACY_SERVICE] {
            if let Err(e) = self.vault.delete(svc, secret_ref) {
                vault_errors.push(format!("{svc}: {e}"));
            }
        }
        self.fallback.lock().remove(secret_ref);
        self.degraded.lock().remove(secret_ref);
        for svc in [SERVICE, LEGACY_SERVICE] {
            if matches!(self.vault.get(svc, secret_ref), Ok(Some(_))) {
                return Err(format!(
                    "the secret is STILL readable from the {svc} keychain namespace after deletion{} — it was NOT removed",
                    if vault_errors.is_empty() { String::new() } else { format!(" ({})", vault_errors.join("; ")) }
                ));
            }
        }
        if !vault_errors.is_empty() && !was_memory_only {
            return Err(format!(
                "the keychain refused part of the deletion and its state could not be confirmed ({}) — treat the secret as still present",
                vault_errors.join("; ")
            ));
        }
        Ok(())
    }

    pub fn get(&self, secret_ref: &str) -> Option<String> {
        if let Ok(Some(v)) = self.vault.get(SERVICE, secret_ref) {
            return Some(v);
        }
        // Migration layer: a pre-19.5.1 "mj-desktop" entry is read ONCE, copied into the
        // current namespace and the legacy entry retired (only if the copy landed — never
        // trade a readable secret for a lost one).
        if let Ok(Some(v)) = self.vault.get(LEGACY_SERVICE, secret_ref) {
            if self.vault.set(SERVICE, secret_ref, &v).is_ok() {
                let _ = self.vault.delete(LEGACY_SERVICE, secret_ref);
            }
            return Some(v);
        }
        self.fallback.lock().get(secret_ref).cloned()
    }

    #[allow(dead_code)]
    pub fn exists(&self, refs: &[String]) -> HashMap<String, bool> {
        refs.iter().map(|r| (r.clone(), self.get(r).is_some())).collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Arc;

    /// A controllable stand-in for the OS keychain.
    #[derive(Default)]
    struct MemVault {
        data: Mutex<HashMap<(String, String), String>>,
        refuse_set: Mutex<bool>,
        /// Simulates a keychain whose delete "succeeds" but leaves the entry in place.
        delete_is_a_noop: Mutex<bool>,
        /// Simulates a locked keychain: every call errors.
        locked: Mutex<bool>,
    }

    impl Vault for Arc<MemVault> {
        fn get(&self, service: &str, key: &str) -> Result<Option<String>, String> {
            if *self.locked.lock() {
                return Err("keychain locked".into());
            }
            Ok(self.data.lock().get(&(service.to_string(), key.to_string())).cloned())
        }
        fn set(&self, service: &str, key: &str, value: &str) -> Result<(), String> {
            if *self.refuse_set.lock() || *self.locked.lock() {
                return Err("keychain refused the write".into());
            }
            self.data.lock().insert((service.to_string(), key.to_string()), value.to_string());
            Ok(())
        }
        fn delete(&self, service: &str, key: &str) -> Result<bool, String> {
            if *self.locked.lock() {
                return Err("keychain locked".into());
            }
            if *self.delete_is_a_noop.lock() {
                return Ok(true);
            }
            Ok(self.data.lock().remove(&(service.to_string(), key.to_string())).is_some())
        }
    }

    fn store() -> (SecretStore, Arc<MemVault>) {
        let v = Arc::new(MemVault::default());
        (SecretStore::with_vault(Box::new(v.clone())), v)
    }
    fn plant_legacy(v: &MemVault, key: &str, value: &str) {
        v.data.lock().insert((LEGACY_SERVICE.to_string(), key.to_string()), value.to_string());
    }
    fn has(v: &MemVault, svc: &str, key: &str) -> bool {
        v.data.lock().contains_key(&(svc.to_string(), key.to_string()))
    }

    /// THE REVIEW'S BUG, reproduced: delete removed only si-desktop, so a legacy
    /// mj-desktop entry survived and get() brought the "deleted" key back.
    #[test]
    fn delete_removes_the_legacy_namespace_too() {
        let (s, v) = store();
        plant_legacy(&v, "vh.providerkey.openai", "sk-legacy");
        s.delete("vh.providerkey.openai").unwrap();
        assert!(!has(&v, LEGACY_SERVICE, "vh.providerkey.openai"), "the legacy entry must be gone");
        assert_eq!(s.get("vh.providerkey.openai"), None, "a deleted key must not come back");
        assert_eq!(s.location("vh.providerkey.openai"), SecretLocation::Absent);
    }

    #[test]
    fn delete_removes_current_and_legacy_copies_of_the_same_ref() {
        let (s, v) = store();
        v.data.lock().insert((SERVICE.to_string(), "k".into()), "new".into());
        plant_legacy(&v, "k", "old");
        s.delete("k").unwrap();
        assert!(!has(&v, SERVICE, "k") && !has(&v, LEGACY_SERVICE, "k"));
        assert_eq!(s.get("k"), None);
    }

    #[test]
    fn the_first_read_migrates_a_legacy_secret_forward_and_retires_it() {
        let (s, v) = store();
        plant_legacy(&v, "k", "sk-legacy");
        assert_eq!(s.get("k").as_deref(), Some("sk-legacy"), "owners keep access to old secrets");
        assert!(has(&v, SERVICE, "k"), "the value now lives in the current namespace");
        assert!(!has(&v, LEGACY_SERVICE, "k"), "the legacy copy is retired");
        assert_eq!(s.get("k").as_deref(), Some("sk-legacy"), "and it still reads");
    }

    #[test]
    fn a_failed_migration_never_loses_the_secret() {
        let (s, v) = store();
        plant_legacy(&v, "k", "sk-legacy");
        *v.refuse_set.lock() = true; // the copy cannot land…
        assert_eq!(s.get("k").as_deref(), Some("sk-legacy"));
        assert!(has(&v, LEGACY_SERVICE, "k"), "…so the legacy entry must NOT be deleted");
    }

    #[test]
    fn location_sees_legacy_entries_instead_of_reporting_a_usable_key_as_absent() {
        let (s, v) = store();
        plant_legacy(&v, "k", "sk-legacy");
        assert_eq!(s.location("k"), SecretLocation::Keychain);
        assert_eq!(s.exists(&["k".to_string()]).get("k"), Some(&true));
    }

    #[test]
    fn a_new_write_supersedes_a_legacy_copy_so_it_cannot_resurface() {
        let (s, v) = store();
        plant_legacy(&v, "k", "old");
        assert_eq!(s.set("k", "new").unwrap(), SecretLocation::Keychain);
        assert!(!has(&v, LEGACY_SERVICE, "k"));
        s.delete("k").unwrap();
        assert_eq!(s.get("k"), None, "no stale legacy value comes back after a delete");
    }

    #[test]
    fn a_delete_that_leaves_a_readable_copy_is_an_error_not_a_success() {
        let (s, v) = store();
        s.set("k", "sk-live").unwrap();
        *v.delete_is_a_noop.lock() = true; // the keychain claims success but keeps the entry
        let e = s.delete("k").unwrap_err();
        assert!(e.contains("STILL readable"), "{e}");
        assert_eq!(s.get("k").as_deref(), Some("sk-live"), "and the truth is that it is still there");
    }

    #[test]
    fn a_keychain_that_refuses_the_write_degrades_to_memory_and_says_so() {
        let (s, v) = store();
        *v.refuse_set.lock() = true;
        assert_eq!(s.set("k", "sk").unwrap(), SecretLocation::MemoryOnly);
        assert_eq!(s.location("k"), SecretLocation::MemoryOnly);
        assert_eq!(s.degraded_refs(), vec!["k".to_string()]);
        assert_eq!(s.get("k").as_deref(), Some("sk"));
        // deleting a memory-only secret works even though the keychain is not there to help
        *v.locked.lock() = true;
        s.delete("k").unwrap();
        assert_eq!(s.get("k"), None);
    }

    #[test]
    fn a_locked_keychain_cannot_confirm_the_deletion_of_a_keychain_secret() {
        let (s, v) = store();
        s.set("k", "sk").unwrap(); // genuinely keychain-resident
        *v.locked.lock() = true;
        let e = s.delete("k").unwrap_err();
        assert!(e.contains("could not be confirmed"), "{e}");
    }

    #[test]
    fn a_keychain_write_clears_a_stale_memory_copy() {
        let (s, v) = store();
        *v.refuse_set.lock() = true;
        s.set("k", "memory-copy").unwrap();
        *v.refuse_set.lock() = false;
        assert_eq!(s.set("k", "keychain-copy").unwrap(), SecretLocation::Keychain);
        assert_eq!(s.location("k"), SecretLocation::Keychain);
        s.delete("k").unwrap();
        assert_eq!(s.get("k"), None, "the old memory copy must not outlive the keychain delete");
    }
}
