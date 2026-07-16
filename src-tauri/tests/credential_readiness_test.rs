// == Credential Readiness Query Test =========================================
//
// Stage 04: Tests for the has_profile_credential command which returns boolean
// only — never secrets.
//
// The real test is in profile_commands_test.rs for the command integration.
// This file confirms the credential store's has() method works at the seam.

use video_distiller_lib::credential_store::{CredentialStore, InMemoryBackend, SecretPayload};

#[test]
fn has_credential_returns_true_when_stored() {
    let store = CredentialStore::new(InMemoryBackend::new());
    let payload = SecretPayload::Bearer {
        api_key: "sk-test".into(),
    };
    store.set("transcription", "test-id", &payload).unwrap();
    assert!(store.has("transcription", "test-id").unwrap());
}

#[test]
fn has_credential_returns_false_when_missing() {
    let store = CredentialStore::new(InMemoryBackend::new());
    assert!(!store.has("transcription", "missing-id").unwrap());
}

#[test]
fn has_credential_returns_true_for_different_type() {
    let store = CredentialStore::new(InMemoryBackend::new());
    let payload = SecretPayload::Bearer {
        api_key: "sk-other".into(),
    };
    store.set("summary", "sum-id", &payload).unwrap();
    assert!(store.has("summary", "sum-id").unwrap());
    assert!(!store.has("transcription", "sum-id").unwrap());
}
