//! Persistent metadata cache for expensive integrity verification.

use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::UNIX_EPOCH;

const CACHE_SCHEMA_VERSION: u32 = 1;
const CACHE_FILE_NAME: &str = ".verification-cache-v1.json";
static CACHE_LOCK: Mutex<()> = Mutex::new(());

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
struct FileFingerprint {
    bytes: u64,
    modified_unix_nanos: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct VerificationEntry {
    fingerprint: FileFingerprint,
    expected_digest: String,
    verified: bool,
}

#[derive(Debug, Serialize, Deserialize)]
struct VerificationDocument {
    schema_version: u32,
    entries: BTreeMap<String, VerificationEntry>,
}

impl Default for VerificationDocument {
    fn default() -> Self {
        Self {
            schema_version: CACHE_SCHEMA_VERSION,
            entries: BTreeMap::new(),
        }
    }
}

/// Reuse a previous full digest result only when path, size, modification time,
/// and the expected digest are unchanged. Concurrent callers are deduplicated.
pub fn verify_file_cached<E>(
    root: &Path,
    path: &Path,
    expected_digest: &str,
    verifier: impl FnOnce() -> Result<bool, E>,
) -> Result<bool, E> {
    let _guard = CACHE_LOCK
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    let Some(fingerprint) = fingerprint(path) else {
        return verifier();
    };
    let key = cache_key(root, path);
    let mut document = load_document(root);

    if let Some(entry) = document.entries.get(&key) {
        if entry.fingerprint == fingerprint && entry.expected_digest == expected_digest {
            return Ok(entry.verified);
        }
    }

    let verified = verifier()?;
    document.entries.insert(
        key,
        VerificationEntry {
            fingerprint,
            expected_digest: expected_digest.to_string(),
            verified,
        },
    );
    persist_document(root, &document);
    Ok(verified)
}

/// Seed the cache after a file was already fully verified before an atomic rename.
pub fn remember_file_verification(root: &Path, path: &Path, expected_digest: &str, verified: bool) {
    let _guard = CACHE_LOCK
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    let Some(fingerprint) = fingerprint(path) else {
        return;
    };
    let mut document = load_document(root);
    document.entries.insert(
        cache_key(root, path),
        VerificationEntry {
            fingerprint,
            expected_digest: expected_digest.to_string(),
            verified,
        },
    );
    persist_document(root, &document);
}

/// Remove an entry after a managed file is deleted.
pub fn forget_file_verification(root: &Path, path: &Path) {
    let _guard = CACHE_LOCK
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    let mut document = load_document(root);
    if document.entries.remove(&cache_key(root, path)).is_some() {
        persist_document(root, &document);
    }
}

fn fingerprint(path: &Path) -> Option<FileFingerprint> {
    let metadata = path.metadata().ok()?;
    let modified = metadata.modified().ok()?.duration_since(UNIX_EPOCH).ok()?;
    Some(FileFingerprint {
        bytes: metadata.len(),
        modified_unix_nanos: modified.as_nanos().to_string(),
    })
}

fn cache_key(root: &Path, path: &Path) -> String {
    path.strip_prefix(root)
        .unwrap_or(path)
        .to_string_lossy()
        .replace('\\', "/")
}

fn cache_path(root: &Path) -> PathBuf {
    root.join(CACHE_FILE_NAME)
}

fn load_document(root: &Path) -> VerificationDocument {
    let Ok(bytes) = std::fs::read(cache_path(root)) else {
        return VerificationDocument::default();
    };
    let Ok(document) = serde_json::from_slice::<VerificationDocument>(&bytes) else {
        return VerificationDocument::default();
    };
    if document.schema_version == CACHE_SCHEMA_VERSION {
        document
    } else {
        VerificationDocument::default()
    }
}

fn persist_document(root: &Path, document: &VerificationDocument) {
    let Ok(bytes) = serde_json::to_vec(document) else {
        return;
    };
    let _ = std::fs::create_dir_all(root);
    let destination = cache_path(root);
    let temporary = root.join(format!("{CACHE_FILE_NAME}.part"));
    if std::fs::write(&temporary, bytes).is_err() {
        return;
    }
    if std::fs::rename(&temporary, &destination).is_err() {
        let _ = std::fs::remove_file(&destination);
        let _ = std::fs::rename(&temporary, &destination);
    }
}
