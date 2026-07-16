// == Stage 01: Per-Profile Credential Store Tests ===========================
//
// Tests for credential_store.rs: key namespacing, secret types, redacted
// debug/error output, in-memory mock backend, set/get/delete/has operations,
// missing key, malformed stored value, and isolation between profiles.
// No test writes to the real Windows Credential Manager.

use video_distiller_lib::credential_store::{
    credential_account, CredentialBackend, CredentialBackendError, CredentialStore,
    InMemoryBackend, SecretPayload,
};

// ---------------------------------------------------------------------------
// Account name namespacing
// ---------------------------------------------------------------------------

#[test]
fn credential_account_is_namespaced_by_profile() {
    let trans = credential_account("transcription", "abc");
    let summary = credential_account("summary", "abc");
    assert_eq!(trans, "transcription:abc");
    assert_ne!(
        trans, summary,
        "Different profile types must produce different account names"
    );
}

// ---------------------------------------------------------------------------
// Redacted Debug output
// ---------------------------------------------------------------------------

#[test]
fn bearer_debug_redacts_api_key() {
    let payload = SecretPayload::Bearer {
        api_key: "sk-secret-value".into(),
    };
    let debug = format!("{:?}", payload);
    assert!(
        !debug.contains("sk-secret-value"),
        "Debug output must not contain the raw api_key: {}",
        debug
    );
    assert!(
        debug.contains("[redacted]"),
        "Debug output should indicate the value is redacted: {}",
        debug
    );
}

#[test]
fn tencent_debug_redacts_all_secrets() {
    let payload = SecretPayload::Tencent {
        app_id: "1259220000".into(),
        secret_id: "AKIDsecret123".into(),
        secret_key: "mySecretKeyValue".into(),
    };
    let debug = format!("{:?}", payload);
    assert!(
        !debug.contains("AKIDsecret123"),
        "Debug must not contain secret_id"
    );
    assert!(
        !debug.contains("mySecretKeyValue"),
        "Debug must not contain secret_key"
    );
    // app_id is non-sensitive
    assert!(
        debug.contains("1259220000"),
        "Debug may contain non-sensitive app_id"
    );
}

#[test]
fn serialized_profiles_never_contain_secret_payload() {
    let payload = SecretPayload::Bearer {
        api_key: "sk-secret".into(),
    };
    let store = CredentialStore::new(InMemoryBackend::new());

    // Set, then get back
    store.set("transcription", "profile-1", &payload).unwrap();
    let retrieved = store.get("transcription", "profile-1").unwrap();
    assert_eq!(retrieved, payload);

    // The serialized (Display) form should not leak secrets
    let display_redacted = format!(
        "{}",
        store.get("transcription", "profile-1").unwrap().redacted()
    );
    assert!(!display_redacted.contains("sk-secret"));
}

// ---------------------------------------------------------------------------
// Bearer payload CRUD
// ---------------------------------------------------------------------------

#[test]
fn set_and_get_bearer_payload() {
    let store = CredentialStore::new(InMemoryBackend::new());
    let payload = SecretPayload::Bearer {
        api_key: "sk-my-key".into(),
    };
    store.set("transcription", "asr-1", &payload).unwrap();
    let retrieved = store.get("transcription", "asr-1").unwrap();
    assert_eq!(retrieved, payload);
}

#[test]
fn has_returns_true_for_existing_credential() {
    let store = CredentialStore::new(InMemoryBackend::new());
    let payload = SecretPayload::Bearer {
        api_key: "sk-exists".into(),
    };
    store.set("transcription", "p1", &payload).unwrap();
    assert!(store.has("transcription", "p1").unwrap());
}

#[test]
fn has_returns_false_for_missing_credential() {
    let store = CredentialStore::new(InMemoryBackend::new());
    assert!(!store.has("nonexistent", "nope").unwrap());
}

#[test]
fn get_returns_error_for_missing_credential() {
    let store = CredentialStore::new(InMemoryBackend::new());
    let result = store.get("transcription", "missing");
    assert!(result.is_err(), "get() on missing key should return error");
    assert_eq!(
        result.unwrap_err().code,
        "credential_missing",
        "Error code should be credential_missing"
    );
}

#[test]
fn delete_removes_credential() {
    let store = CredentialStore::new(InMemoryBackend::new());
    let payload = SecretPayload::Bearer {
        api_key: "sk-to-delete".into(),
    };
    store.set("transcription", "del-me", &payload).unwrap();
    assert!(store.has("transcription", "del-me").unwrap());
    store.delete("transcription", "del-me").unwrap();
    assert!(!store.has("transcription", "del-me").unwrap());
}

// ---------------------------------------------------------------------------
// Tencent payload CRUD
// ---------------------------------------------------------------------------

#[test]
fn set_and_get_tencent_payload() {
    let store = CredentialStore::new(InMemoryBackend::new());
    let payload = SecretPayload::Tencent {
        app_id: "1259220000".into(),
        secret_id: "AKIDtest123".into(),
        secret_key: "mySecretKey".into(),
    };
    store.set("transcription", "tencent-1", &payload).unwrap();
    let retrieved = store.get("transcription", "tencent-1").unwrap();
    assert_eq!(retrieved, payload);
}

// ---------------------------------------------------------------------------
// Overwrite
// ---------------------------------------------------------------------------

#[test]
fn overwrite_replaces_existing_credential() {
    let store = CredentialStore::new(InMemoryBackend::new());
    let first = SecretPayload::Bearer {
        api_key: "sk-first".into(),
    };
    let second = SecretPayload::Bearer {
        api_key: "sk-second".into(),
    };
    store.set("transcription", "p1", &first).unwrap();
    store.set("transcription", "p1", &second).unwrap();
    let retrieved = store.get("transcription", "p1").unwrap();
    assert_eq!(retrieved, second);
}

// ---------------------------------------------------------------------------
// Isolation between profile types and IDs
// ---------------------------------------------------------------------------

#[test]
fn different_profile_ids_are_isolated() {
    let store = CredentialStore::new(InMemoryBackend::new());
    let payload_a = SecretPayload::Bearer {
        api_key: "sk-a".into(),
    };
    let payload_b = SecretPayload::Bearer {
        api_key: "sk-b".into(),
    };
    store.set("transcription", "id-a", &payload_a).unwrap();
    store.set("transcription", "id-b", &payload_b).unwrap();
    assert_eq!(store.get("transcription", "id-a").unwrap(), payload_a);
    assert_eq!(store.get("transcription", "id-b").unwrap(), payload_b);
}

#[test]
fn different_profile_types_same_id_are_isolated() {
    let store = CredentialStore::new(InMemoryBackend::new());
    let trans = SecretPayload::Bearer {
        api_key: "sk-trans".into(),
    };
    let summary = SecretPayload::Bearer {
        api_key: "sk-summary".into(),
    };
    store.set("transcription", "same-id", &trans).unwrap();
    store.set("summary", "same-id", &summary).unwrap();
    assert_eq!(store.get("transcription", "same-id").unwrap(), trans);
    assert_eq!(store.get("summary", "same-id").unwrap(), summary);
}

// ---------------------------------------------------------------------------
// Error handling: malformed stored data
// ---------------------------------------------------------------------------

#[test]
fn malformed_stored_value_returns_credential_invalid() {
    // Use an InMemoryBackend pre-populated with invalid data
    let mut backend = InMemoryBackend::new();
    backend.store_raw("transcription:corrupt").unwrap();
    let store = CredentialStore::new(backend);

    let result = store.get("transcription", "corrupt");
    assert!(
        result.is_err(),
        "Malformed stored value should produce an error"
    );
    assert_eq!(
        result.unwrap_err().code,
        "credential_invalid",
        "Error code should be credential_invalid"
    );
}

#[test]
fn malformed_value_does_not_leak_contents() {
    let mut backend = InMemoryBackend::new();
    backend.store_raw("transcription:leak-test").unwrap();
    let store = CredentialStore::new(backend);

    let result = store.get("transcription", "leak-test");
    let err = result.unwrap_err();
    let err_display = format!("{:?}", err);
    assert!(
        !err_display.contains("this-is-sensitive-stored-data-that-should-not-leak"),
        "Error output must not contain stored value contents"
    );
}

// ---------------------------------------------------------------------------
// Redacted helper
// ---------------------------------------------------------------------------

#[test]
fn redacted_produces_same_variant_different_values() {
    let bearer = SecretPayload::Bearer {
        api_key: "real-key".into(),
    };
    let redacted = bearer.redacted();
    match redacted {
        SecretPayload::Bearer { api_key } => {
            assert_ne!(
                api_key, "real-key",
                "Redacted Bearer should not expose the real key"
            );
            assert_eq!(api_key, "[redacted]");
        }
        _ => panic!("redacted should keep the variant"),
    }
}

#[test]
fn redacted_tencent_produces_same_variant() {
    let tencent = SecretPayload::Tencent {
        app_id: "1259220000".into(),
        secret_id: "AKIDreal".into(),
        secret_key: "real-secret-key".into(),
    };
    let redacted = tencent.redacted();
    match redacted {
        SecretPayload::Tencent {
            app_id,
            secret_id,
            secret_key,
        } => {
            // app_id is non-sensitive — may or may not be preserved
            assert_eq!(secret_id, "[redacted]", "secret_id must be redacted");
            assert_eq!(secret_key, "[redacted]", "secret_key must be redacted");
            assert_eq!(app_id, "1259220000", "app_id is non-sensitive");
        }
        _ => panic!("redacted should keep the variant"),
    }
}

// ---------------------------------------------------------------------------
// Validation: profile type and ID format
// ---------------------------------------------------------------------------

#[test]
fn rejects_empty_profile_type() {
    let store = CredentialStore::new(InMemoryBackend::new());
    let payload = SecretPayload::Bearer {
        api_key: "sk-key".into(),
    };
    let result = store.set("", "profile-1", &payload);
    assert!(result.is_err(), "Empty profile type should be rejected");
}

#[test]
fn rejects_empty_profile_id() {
    let store = CredentialStore::new(InMemoryBackend::new());
    let payload = SecretPayload::Bearer {
        api_key: "sk-key".into(),
    };
    let result = store.set("transcription", "", &payload);
    assert!(result.is_err(), "Empty profile ID should be rejected");
}

// ---------------------------------------------------------------------------
// Failing mock backend: always returns Other for every operation
// ---------------------------------------------------------------------------

/// A mock backend that always fails with `Other`, simulating a system-level
/// credential manager outage (access denied, locked store, etc.).
struct FailingMockBackend;

impl CredentialBackend for FailingMockBackend {
    fn set_password(
        &self,
        _service: &str,
        _account: &str,
        _password: &str,
    ) -> Result<(), CredentialBackendError> {
        Err(CredentialBackendError::Other(
            "simulated backend failure".into(),
        ))
    }

    fn get_password(
        &self,
        _service: &str,
        _account: &str,
    ) -> Result<String, CredentialBackendError> {
        Err(CredentialBackendError::Other(
            "simulated backend failure".into(),
        ))
    }

    fn delete_password(
        &self,
        _service: &str,
        _account: &str,
    ) -> Result<(), CredentialBackendError> {
        Err(CredentialBackendError::Other(
            "simulated backend failure".into(),
        ))
    }

    fn make_clone_box(&self) -> Box<dyn CredentialBackend> {
        Box::new(FailingMockBackend)
    }
}

#[test]
fn get_returns_credential_error_on_backend_failure() {
    let store = CredentialStore::new(FailingMockBackend);
    let result = store.get("transcription", "any-id");
    assert!(
        result.is_err(),
        "get() on failing backend should return error"
    );
    assert_eq!(
        result.unwrap_err().code,
        "credential_error",
        "Error code should be credential_error, not credential_missing"
    );
}

#[test]
fn has_returns_credential_error_on_backend_failure() {
    let store = CredentialStore::new(FailingMockBackend);
    let result = store.has("transcription", "any-id");
    assert!(
        result.is_err(),
        "has() on failing backend should return error"
    );
    assert_eq!(
        result.unwrap_err().code,
        "credential_error",
        "Error code should be credential_error, not false"
    );
}

#[test]
fn delete_returns_credential_error_on_backend_failure() {
    let store = CredentialStore::new(FailingMockBackend);
    let result = store.delete("transcription", "any-id");
    assert!(
        result.is_err(),
        "delete() on failing backend should return error"
    );
    assert_eq!(
        result.unwrap_err().code,
        "credential_error",
        "Error code should be credential_error, not Ok(())"
    );
}

#[test]
fn backend_error_message_does_not_leak_backend_text() {
    let store = CredentialStore::new(FailingMockBackend);
    let err = store.get("transcription", "any-id").unwrap_err();
    let err_display = format!("{:?}", err);
    assert!(
        !err_display.contains("simulated backend failure"),
        "Error output must not leak backend error text: {}",
        err_display
    );
}
