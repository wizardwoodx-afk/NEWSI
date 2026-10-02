//! One-time data migration for the bundle-identifier rename
//! (`com.elevenhandle.app` → `com.selfimpulse.app`).
//!
//! Tauri derives the app data directory from the bundle identifier, so renaming the identifier
//! silently ORPHANS an existing install: the new build opens a fresh, empty directory and the
//! owner's database, skills and artifacts are "gone" (they are still on disk under the old name).
//! This copies — never moves, never deletes — the legacy directory into the new one, once, and
//! only when the new directory holds no database yet. A failure rolls back whatever it wrote and
//! leaves the legacy directory untouched, so the next launch can try again; the app then starts
//! fresh rather than opening a half-copied database.

use std::fs;
use std::path::{Path, PathBuf};

pub const LEGACY_IDENTIFIER: &str = "com.elevenhandle.app";

#[derive(Debug, PartialEq, Eq)]
pub enum Migration {
    /// Nothing to do: no legacy directory, nothing in it worth keeping, or the new one already has data.
    NotNeeded,
    Copied { files: usize },
    Failed(String),
}

/// The pre-rename data directory: a sibling of the new one, named after the old identifier.
pub fn legacy_dir_for(new_dir: &Path) -> Option<PathBuf> {
    let legacy = new_dir.parent()?.join(LEGACY_IDENTIFIER);
    if legacy == new_dir {
        None
    } else {
        Some(legacy)
    }
}

/// `db_names` are the file names that mean "this directory already holds a database".
pub fn migrate_legacy_data(new_dir: &Path, db_names: &[&str]) -> Migration {
    let Some(legacy) = legacy_dir_for(new_dir) else { return Migration::NotNeeded };
    if !legacy.is_dir() {
        return Migration::NotNeeded;
    }
    if db_names.iter().any(|n| new_dir.join(n).exists()) {
        return Migration::NotNeeded; // the new install already has data: never overwrite it
    }
    if !db_names.iter().any(|n| legacy.join(n).exists()) {
        return Migration::NotNeeded; // an empty shell of a directory is not worth carrying over
    }
    let mut written: Vec<PathBuf> = Vec::new();
    match copy_tree(&legacy, new_dir, &mut written) {
        Ok(n) => Migration::Copied { files: n },
        Err(e) => {
            // roll back: a half-copied database is worse than a fresh one
            for p in written.iter().rev() {
                let _ = fs::remove_file(p);
            }
            Migration::Failed(e)
        }
    }
}

/// Copy `from` into `to`. Every file lands under a temporary name and is renamed into place, so a
/// file is either complete under its real name or absent. Symlinks are skipped, never followed.
fn copy_tree(from: &Path, to: &Path, written: &mut Vec<PathBuf>) -> Result<usize, String> {
    fs::create_dir_all(to).map_err(|e| format!("{}: {e}", to.display()))?;
    let mut count = 0;
    for entry in fs::read_dir(from).map_err(|e| format!("{}: {e}", from.display()))? {
        let entry = entry.map_err(|e| e.to_string())?;
        let ft = entry.file_type().map_err(|e| e.to_string())?;
        let target = to.join(entry.file_name());
        if ft.is_symlink() {
            continue;
        }
        if ft.is_dir() {
            count += copy_tree(&entry.path(), &target, written)?;
        } else if ft.is_file() && !target.exists() {
            let part = target.with_extension("migrating-part");
            fs::copy(entry.path(), &part).map_err(|e| format!("{}: {e}", entry.path().display()))?;
            fs::rename(&part, &target).map_err(|e| format!("{}: {e}", target.display()))?;
            written.push(target);
            count += 1;
        }
    }
    Ok(count)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scratch(tag: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("si-migrate-{tag}-{}-{}", std::process::id(), std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos()));
        fs::create_dir_all(&d).unwrap();
        d
    }
    const DBS: &[&str] = &["vh.sqlite", "mj.sqlite"];

    #[test]
    fn the_legacy_dir_is_the_sibling_named_after_the_old_identifier() {
        let new_dir = Path::new("/data/com.selfimpulse.app");
        assert_eq!(legacy_dir_for(new_dir), Some(PathBuf::from("/data/com.elevenhandle.app")));
        assert_eq!(legacy_dir_for(Path::new("/data/com.elevenhandle.app")), None, "never migrate a directory into itself");
    }

    #[test]
    fn an_existing_install_follows_the_rename_with_its_data_intact() {
        let base = scratch("copy");
        let legacy = base.join(LEGACY_IDENTIFIER);
        fs::create_dir_all(legacy.join("artifacts/run1")).unwrap();
        fs::create_dir_all(legacy.join("skills")).unwrap();
        fs::write(legacy.join("vh.sqlite"), b"DB-BYTES").unwrap();
        fs::write(legacy.join("vh.sqlite-wal"), b"WAL-BYTES").unwrap();
        fs::write(legacy.join("artifacts/run1/out.txt"), b"artifact").unwrap();
        let new_dir = base.join("com.selfimpulse.app");
        assert_eq!(migrate_legacy_data(&new_dir, DBS), Migration::Copied { files: 3 }, "the database, its write-ahead log and one artifact — files, not directories");
        assert_eq!(fs::read(new_dir.join("vh.sqlite")).unwrap(), b"DB-BYTES");
        assert_eq!(fs::read(new_dir.join("vh.sqlite-wal")).unwrap(), b"WAL-BYTES", "the write-ahead log travels with the database");
        assert_eq!(fs::read(new_dir.join("artifacts/run1/out.txt")).unwrap(), b"artifact");
        assert!(legacy.join("vh.sqlite").exists(), "the legacy directory is COPIED, never emptied — a rollback path stays");
        assert!(!fs::read_dir(&new_dir).unwrap().any(|e| e.unwrap().file_name().to_string_lossy().contains("migrating-part")), "no temporary file is left behind");
        let _ = fs::remove_dir_all(&base);
    }

    #[test]
    fn it_runs_once_and_never_overwrites_a_database_the_new_install_already_has() {
        let base = scratch("once");
        let legacy = base.join(LEGACY_IDENTIFIER);
        fs::create_dir_all(&legacy).unwrap();
        fs::write(legacy.join("vh.sqlite"), b"OLD").unwrap();
        let new_dir = base.join("com.selfimpulse.app");
        assert!(matches!(migrate_legacy_data(&new_dir, DBS), Migration::Copied { .. }));
        fs::write(new_dir.join("vh.sqlite"), b"NEW-WORK-SINCE").unwrap();
        assert_eq!(migrate_legacy_data(&new_dir, DBS), Migration::NotNeeded, "second launch: nothing to do");
        assert_eq!(fs::read(new_dir.join("vh.sqlite")).unwrap(), b"NEW-WORK-SINCE", "work done since the migration is never clobbered");
        let _ = fs::remove_dir_all(&base);
    }

    #[test]
    fn a_fresh_machine_or_an_empty_legacy_shell_migrates_nothing() {
        let base = scratch("fresh");
        let new_dir = base.join("com.selfimpulse.app");
        assert_eq!(migrate_legacy_data(&new_dir, DBS), Migration::NotNeeded, "no legacy directory at all");
        fs::create_dir_all(base.join(LEGACY_IDENTIFIER).join("skills")).unwrap();
        assert_eq!(migrate_legacy_data(&new_dir, DBS), Migration::NotNeeded, "a legacy dir with no database is not carried over");
        assert!(!new_dir.exists(), "and the new directory was not created for nothing");
        let _ = fs::remove_dir_all(&base);
    }

    #[test]
    fn a_pre_vh_database_name_counts_as_data_too() {
        let base = scratch("mj");
        let legacy = base.join(LEGACY_IDENTIFIER);
        fs::create_dir_all(&legacy).unwrap();
        fs::write(legacy.join("mj.sqlite"), b"VERY-OLD").unwrap();
        assert!(matches!(migrate_legacy_data(&base.join("com.selfimpulse.app"), DBS), Migration::Copied { .. }));
        let _ = fs::remove_dir_all(&base);
    }

    #[cfg(unix)]
    #[test]
    fn symlinks_are_skipped_never_followed() {
        let base = scratch("symlink");
        let legacy = base.join(LEGACY_IDENTIFIER);
        fs::create_dir_all(&legacy).unwrap();
        fs::write(legacy.join("vh.sqlite"), b"DB").unwrap();
        let secret = base.join("outside-secret.txt");
        fs::write(&secret, b"SECRET").unwrap();
        std::os::unix::fs::symlink(&secret, legacy.join("link-to-secret")).unwrap();
        let new_dir = base.join("com.selfimpulse.app");
        migrate_legacy_data(&new_dir, DBS);
        assert!(!new_dir.join("link-to-secret").exists(), "a symlink in the old directory must not pull outside files into the new one");
        let _ = fs::remove_dir_all(&base);
    }

    #[cfg(unix)]
    #[test]
    fn a_failed_copy_rolls_back_so_the_app_never_opens_a_half_copied_database() {
        use std::os::unix::fs::PermissionsExt;
        let base = scratch("rollback");
        let legacy = base.join(LEGACY_IDENTIFIER);
        fs::create_dir_all(legacy.join("sub")).unwrap();
        fs::write(legacy.join("vh.sqlite"), b"DB").unwrap();
        fs::write(legacy.join("sub/unreadable.bin"), b"x").unwrap();
        // an unreadable file makes the copy fail AFTER earlier files may already have landed
        fs::set_permissions(legacy.join("sub/unreadable.bin"), fs::Permissions::from_mode(0o000)).unwrap();
        let readable_as_root = fs::read(legacy.join("sub/unreadable.bin")).is_ok(); // root ignores permissions
        let new_dir = base.join("com.selfimpulse.app");
        let out = migrate_legacy_data(&new_dir, DBS);
        fs::set_permissions(legacy.join("sub/unreadable.bin"), fs::Permissions::from_mode(0o644)).unwrap();
        if readable_as_root {
            eprintln!("SKIP rollback assertion: running as a user that ignores file permissions");
        } else {
            assert!(matches!(out, Migration::Failed(_)), "{out:?}");
            assert!(!new_dir.join("vh.sqlite").exists(), "the partially copied database was rolled back");
            assert!(legacy.join("vh.sqlite").exists(), "and the legacy directory is untouched");
        }
        let _ = fs::remove_dir_all(&base);
    }
}
