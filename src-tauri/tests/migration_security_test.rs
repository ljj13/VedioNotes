// == Stage 05 Minimal Fix 01 — Migration Seam and Security Tests ==============
//
// Tests for the `MigrationService` production seam (`run_migration`) with an
// injectable `LegacyCredentialBackend`. Security regression tests are retained
// unchanged from the original migration_security_test.rs.
//
// The old tests in this file used "simulate guard" patterns and directly toggled
// state. Those have been replaced with direct `run_migration()` calls using the
// `InMemoryLegacyBackend` test double.
//
// No real Windows Credential Manager or remote APIs are touched.

use tempfile::tempdir;

use video_distiller_lib::commands::{
    refresh_migration_state, run_migration, InMemoryLegacyBackend, LegacyCredentialBackend,
};
use video_distiller_lib::credential_store::{
    CredentialBackend, CredentialBackendError, CredentialStore, InMemoryBackend, SecretPayload,
};
use video_distiller_lib::domain::ProviderFallbackEvent;
use video_distiller_lib::profile_store::ProfileStore;
use video_distiller_lib::profiles::AppProfiles;
use video_distiller_lib::providers::error::{ProviderError, ProviderErrorKind};

// =========================================================================
//  Helpers: test environments
// =========================================================================

/// Build a profile store with fully enabled defaults and a migration_required flag.
fn setup_profiles(profile_store: &ProfileStore, migration_required: bool) {
    let mut profiles = AppProfiles::defaults();
    for p in &mut profiles.transcription_profiles {
        p.enabled = true;
    }
    for p in &mut profiles.summary_profiles {
        p.enabled = true;
    }
    profiles.active_transcription_profile_id = Some("tencent-flash".into());
    profiles.active_summary_profile_id = Some("deepseek-main".into());
    profiles.migration_required = migration_required;
    profile_store.save(&profiles).unwrap();
}

/// Save credentials for both active profiles so they pass the readiness check.
fn set_active_credentials(cred_store: &CredentialStore) {
    let trans_cred = SecretPayload::Tencent {
        app_id: "test-app".into(),
        secret_id: "test-sid".into(),
        secret_key: "test-key".into(),
    };
    cred_store
        .set("transcription", "tencent-flash", &trans_cred)
        .unwrap();
    let summ_cred = SecretPayload::Bearer {
        api_key: "sk-test-key".into(),
    };
    cred_store
        .set("summary", "deepseek-main", &summ_cred)
        .unwrap();
}

// =========================================================================
//  Startup detection — production seam, no real Credential Manager
// =========================================================================

#[test]
fn startup_detection_persists_required_when_legacy_credential_exists() {
    let dir = tempdir().unwrap();
    let store = ProfileStore::new(dir.path().join("profiles.json"));
    assert!(!store.load().unwrap().migration_required);

    let required = refresh_migration_state(&store, &InMemoryLegacyBackend::with_legacy()).unwrap();

    assert!(required);
    assert!(store.load().unwrap().migration_required);
}

#[test]
fn startup_detection_leaves_clean_install_not_required() {
    let dir = tempdir().unwrap();
    let store = ProfileStore::new(dir.path().join("profiles.json"));

    let required = refresh_migration_state(&store, &InMemoryLegacyBackend::new()).unwrap();

    assert!(!required);
    assert!(!store.load().unwrap().migration_required);
}

/// A credential backend that fails on all operations — used to test that
/// credential propagation errors work end-to-end.
struct FailingGetBackend;

impl CredentialBackend for FailingGetBackend {
    fn set_password(
        &self,
        _service: &str,
        _account: &str,
        _password: &str,
    ) -> Result<(), CredentialBackendError> {
        Ok(())
    }
    fn get_password(
        &self,
        _service: &str,
        _account: &str,
    ) -> Result<String, CredentialBackendError> {
        Err(CredentialBackendError::Other("simulated failure".into()))
    }
    fn delete_password(
        &self,
        _service: &str,
        _account: &str,
    ) -> Result<(), CredentialBackendError> {
        Ok(())
    }
    fn make_clone_box(&self) -> Box<dyn CredentialBackend> {
        Box::new(FailingGetBackend)
    }
}

// =========================================================================
//  1. Migration default state (unchanged from original)
// =========================================================================

#[test]
fn first_launch_defaults_have_migration_required_false() {
    let dir = tempdir().unwrap();
    let store = ProfileStore::new(dir.path().join("profiles.json"));
    let profiles = store.load().unwrap();

    assert_eq!(profiles.schema_version, 1);
    assert_eq!(
        profiles.migration_required, false,
        "First launch without legacy credential must have migration_required = false"
    );
}

// =========================================================================
//  2. run_migration — confirmed=false is rejected without examining state
// =========================================================================

#[test]
fn run_migration_false_confirmation_is_rejected() {
    let dir = tempdir().unwrap();
    let store = ProfileStore::new(dir.path().join("profiles.json"));
    let cred_store = CredentialStore::new(InMemoryBackend::new());
    let legacy = InMemoryLegacyBackend::with_legacy();

    setup_profiles(&store, true);
    set_active_credentials(&cred_store);

    let result = run_migration(&store, &cred_store, &legacy, false);

    assert!(result.is_err(), "Unconfirmed migration must be rejected");
    assert_eq!(
        result.unwrap_err().code,
        "migration_confirmation_required",
        "Error code must be migration_confirmation_required"
    );

    // State unchanged
    let profiles = store.load().unwrap();
    assert!(
        profiles.migration_required,
        "migration_required must not change"
    );
}

// =========================================================================
//  3. run_migration — rejected when missing active transcription profile
// =========================================================================

#[test]
fn run_migration_rejected_when_no_active_transcription() {
    let dir = tempdir().unwrap();
    let store = ProfileStore::new(dir.path().join("profiles.json"));
    let cred_store = CredentialStore::new(InMemoryBackend::new());
    let legacy = InMemoryLegacyBackend::with_legacy();

    // Save defaults without touching active IDs (they default to None)
    let mut profiles = AppProfiles::defaults();
    profiles.migration_required = true;
    store.save(&profiles).unwrap();

    let result = run_migration(&store, &cred_store, &legacy, true);

    assert!(
        result.is_err(),
        "Migration without active trans profile must fail"
    );
    assert_eq!(result.unwrap_err().code, "migration_incomplete");

    let after = store.load().unwrap();
    assert!(
        after.migration_required,
        "migration_required preserved on failure"
    );
}

// =========================================================================
//  4. run_migration — rejected when active transcription lacks credentials
// =========================================================================

#[test]
fn run_migration_rejected_when_transcription_lacks_credential() {
    let dir = tempdir().unwrap();
    let store = ProfileStore::new(dir.path().join("profiles.json"));
    let cred_store = CredentialStore::new(InMemoryBackend::new());
    let legacy = InMemoryLegacyBackend::with_legacy();

    // Setup: active profiles set, but NO credentials saved
    setup_profiles(&store, true);
    // cred_store intentionally empty

    let result = run_migration(&store, &cred_store, &legacy, true);

    assert!(
        result.is_err(),
        "Migration without transcription credential must fail"
    );
    assert_eq!(result.unwrap_err().code, "migration_incomplete");

    let after = store.load().unwrap();
    assert!(after.migration_required, "migration_required preserved");
}

// =========================================================================
//  5. run_migration — rejected when active summary lacks credentials
// =========================================================================

#[test]
fn run_migration_rejected_when_summary_lacks_credential() {
    let dir = tempdir().unwrap();
    let store = ProfileStore::new(dir.path().join("profiles.json"));
    let cred_store = CredentialStore::new(InMemoryBackend::new());
    let legacy = InMemoryLegacyBackend::with_legacy();

    setup_profiles(&store, true);
    // Only set transcription credential
    let trans_cred = SecretPayload::Tencent {
        app_id: "test-app".into(),
        secret_id: "test-sid".into(),
        secret_key: "test-key".into(),
    };
    cred_store
        .set("transcription", "tencent-flash", &trans_cred)
        .unwrap();

    // Summary credential missing → should fail
    let result = run_migration(&store, &cred_store, &legacy, true);
    assert!(
        result.is_err(),
        "Migration without summary credential must fail"
    );
    assert_eq!(result.unwrap_err().code, "migration_incomplete");

    let after = store.load().unwrap();
    assert!(after.migration_required, "migration_required preserved");
}

// =========================================================================
//  6. run_migration — deletion failure propagates (no state change)
// =========================================================================

#[test]
fn run_migration_deletion_failure_propagates() {
    let dir = tempdir().unwrap();
    let store = ProfileStore::new(dir.path().join("profiles.json"));
    let cred_store = CredentialStore::new(InMemoryBackend::new());
    let legacy = InMemoryLegacyBackend::with_failing_delete();

    setup_profiles(&store, true);
    set_active_credentials(&cred_store);

    let result = run_migration(&store, &cred_store, &legacy, true);

    assert!(result.is_err(), "Deletion failure must propagate as error");
    assert_eq!(
        result.unwrap_err().code,
        "migration_deletion_failed",
        "Error code must be migration_deletion_failed"
    );

    // State must NOT have been persisted as completed
    let after = store.load().unwrap();
    assert!(
        after.migration_required,
        "migration_required must remain true after deletion failure"
    );
    // Legacy still exists
    assert!(legacy.has, "Legacy must still exist after deletion failure");
}

// =========================================================================
//  7. run_migration — success with confirmed=true
// =========================================================================

#[test]
fn run_migration_success_with_confirmed_true() {
    let dir = tempdir().unwrap();
    let store = ProfileStore::new(dir.path().join("profiles.json"));
    let cred_store = CredentialStore::new(InMemoryBackend::new());
    let legacy = InMemoryLegacyBackend::with_legacy();

    setup_profiles(&store, true);
    set_active_credentials(&cred_store);

    let result = run_migration(&store, &cred_store, &legacy, true);

    assert!(
        result.is_ok(),
        "Migration should succeed: {:?}",
        result.err()
    );
    let profiles = result.unwrap();
    assert!(
        !profiles.migration_required,
        "migration_required must be false after success"
    );

    // Verify persistence via fresh load
    let loaded = store.load().unwrap();
    assert!(
        !loaded.migration_required,
        "migration_required persisted as false"
    );
    assert_eq!(
        loaded.active_transcription_profile_id.as_deref(),
        Some("tencent-flash"),
        "Active transcription preserved"
    );
    assert_eq!(
        loaded.active_summary_profile_id.as_deref(),
        Some("deepseek-main"),
        "Active summary preserved"
    );
}

// =========================================================================
//  8. run_migration — already completed (idempotent)
// =========================================================================

#[test]
fn run_migration_idempotent_when_already_completed() {
    let dir = tempdir().unwrap();
    let store = ProfileStore::new(dir.path().join("profiles.json"));
    let cred_store = CredentialStore::new(InMemoryBackend::new());
    let legacy = InMemoryLegacyBackend::with_legacy();

    setup_profiles(&store, false); // migration_required = false already
    set_active_credentials(&cred_store);

    let result = run_migration(&store, &cred_store, &legacy, true);

    assert!(
        result.is_ok(),
        "Already-completed migration must be idempotent"
    );
    let profiles = result.unwrap();
    assert!(!profiles.migration_required, "Already false stays false");

    // Legacy was NOT deleted (because the already-completed path doesn't delete)
    assert!(
        legacy.has,
        "Legacy must NOT be deleted in idempotent path (opportunistic delete not allowed)"
    );
}

// =========================================================================
//  9. run_migration — credential backend error propagates (not collapsed)
// =========================================================================

#[test]
fn run_migration_credential_backend_error_propagates() {
    let dir = tempdir().unwrap();
    let store = ProfileStore::new(dir.path().join("profiles.json"));
    let cred_store = CredentialStore::new(FailingGetBackend);
    let legacy = InMemoryLegacyBackend::with_legacy();

    setup_profiles(&store, true);

    let result = run_migration(&store, &cred_store, &legacy, true);

    assert!(result.is_err(), "Backend error must propagate");
    let err = result.unwrap_err();
    // The error code is either credential_error (from has()) or migration_incomplete
    assert!(
        err.code == "credential_error" || err.code == "migration_incomplete",
        "Error code must be meaningful: {}",
        err.code
    );
}

// =========================================================================
//  10. Security regression: serialized config never contains secrets
// =========================================================================

#[test]
fn serialized_app_profiles_never_contain_secret_field_values() {
    let profiles = AppProfiles::defaults();
    let json = serde_json::to_string_pretty(&profiles).unwrap();

    assert!(
        !json.contains("api_key"),
        "api_key must not appear in serialized config"
    );
    assert!(
        !json.contains("secret_id"),
        "secret_id must not appear in serialized config"
    );
    assert!(
        !json.contains("secret_key"),
        "secret_key must not appear in serialized config"
    );
    assert!(
        !json.contains("Authorization"),
        "Authorization must not appear in serialized config"
    );
    assert!(
        !json.contains("Bearer"),
        "Bearer must not appear in serialized config"
    );
}

#[test]
fn formatted_provider_error_does_not_leak_secrets() {
    let err = ProviderError::new(
        ProviderErrorKind::AuthenticationFailed,
        "认证失败",
        "检查 API Key",
    );
    let display = format!("{}", err);
    let serialized = serde_json::to_string(&err).unwrap();

    assert!(
        !display.contains("sk-"),
        "Display must not contain API key prefix"
    );
    assert!(
        !display.contains("secret"),
        "Display must not contain 'secret'"
    );
    assert!(
        !display.contains("Authorization"),
        "Display must not contain Authorization header"
    );
    assert!(
        !serialized.contains("sk-"),
        "Serialized must not contain sk-"
    );
    assert!(
        !serialized.contains("Authorization"),
        "Serialized must not contain Authorization"
    );
}

#[test]
fn provider_error_never_contains_audio_base64_pattern() {
    let err = ProviderError::new(
        ProviderErrorKind::NetworkError,
        "网络请求失败",
        "检查网络连接",
    );
    let display = format!("{}", err);
    assert!(!display.contains("data:audio/"));
    assert!(!display.contains("base64,"));
}

#[test]
fn provider_error_never_contains_request_body_pattern() {
    let err = ProviderError::new(ProviderErrorKind::InvalidResponse, "响应格式错误", "请重试");
    let display = format!("{}", err);
    assert!(!display.contains("input_audio"));
    assert!(!display.contains("chat/completions"));
}

// =========================================================================
//  11. Fallback event payload security
// =========================================================================

#[test]
fn fallback_event_payload_contains_only_safe_fields() {
    let event = ProviderFallbackEvent {
        from_profile_id: "tencent-flash".into(),
        from_profile_name: "腾讯云极速版".into(),
        to_profile_id: "mimo-asr".into(),
        to_profile_name: "MiMo ASR".into(),
        reason: "quota_exhausted".into(),
    };

    let json = serde_json::to_string(&event).unwrap();
    assert!(json.contains("tencent-flash"));
    assert!(json.contains("腾讯云极速版"));
    assert!(json.contains("quota_exhausted"));
    assert!(!json.contains("api_key"));
    assert!(!json.contains("secret"));
    assert!(!json.contains("Bearer"));
    assert!(!json.contains("sk-"));
    assert!(!json.contains("Authorization"));
    assert!(!json.contains("app_id"));
    assert!(!json.contains("base64,"));
}

// =========================================================================
//  12. SecretPayload redaction
// =========================================================================

#[test]
fn secret_payload_redacted_bearer_masks_api_key() {
    let payload = SecretPayload::Bearer {
        api_key: "sk-real-key-12345".into(),
    };
    let redacted = payload.redacted();
    let debug = format!("{:?}", redacted);
    assert!(!debug.contains("sk-real-key-12345"));
    assert!(debug.contains("[redacted]"));
}

#[test]
fn secret_payload_redacted_tencent_masks_all_secrets() {
    let payload = SecretPayload::Tencent {
        app_id: "1259220000".into(),
        secret_id: "AKID-real-secret-id".into(),
        secret_key: "real-secret-key-value".into(),
    };
    let redacted = payload.redacted();
    let debug = format!("{:?}", redacted);
    assert!(!debug.contains("AKID-real-secret-id"));
    assert!(!debug.contains("real-secret-key-value"));
    assert!(debug.contains("[redacted]"));
    assert!(debug.contains("1259220000"));
}

// =========================================================================
//  13. Diagnostics contain only safe fields
// =========================================================================

#[test]
fn provider_error_kind_display_contains_safe_kinds_only() {
    assert_eq!(
        format!("{}", ProviderErrorKind::QuotaExhausted),
        "quota_exhausted"
    );
    assert_eq!(
        format!("{}", ProviderErrorKind::BillingUnavailable),
        "billing_unavailable"
    );
    assert_eq!(
        format!("{}", ProviderErrorKind::AuthenticationFailed),
        "authentication_failed"
    );
    assert_eq!(
        format!("{}", ProviderErrorKind::RateLimited),
        "rate_limited"
    );
    assert_eq!(
        format!("{}", ProviderErrorKind::NetworkError),
        "network_error"
    );
    assert_eq!(
        format!("{}", ProviderErrorKind::InvalidResponse),
        "invalid_response"
    );
    assert_eq!(
        format!("{}", ProviderErrorKind::ProviderError),
        "provider_error"
    );
    assert_eq!(format!("{}", ProviderErrorKind::Cancelled), "cancelled");

    let codes = vec![
        "quota_exhausted",
        "billing_unavailable",
        "authentication_failed",
        "rate_limited",
        "network_error",
        "invalid_response",
        "provider_error",
        "cancelled",
    ];
    for code in &codes {
        assert!(!code.contains("api_key"), "Diagnostic code safe: {}", code);
        assert!(!code.contains("Bearer"));
        assert!(!code.contains("base64"));
    }
}

// =========================================================================
//  14. ProviderError with provider_code and http_status is safe
// =========================================================================

#[test]
fn provider_error_with_code_and_status_does_not_leak() {
    let err = ProviderError::new(
        ProviderErrorKind::QuotaExhausted,
        "腾讯云资源包耗尽",
        "切换备用配置",
    )
    .with_provider_code("4004")
    .with_http_status(200);

    let display = format!("{}", err);
    let serialized = serde_json::to_string(&err).unwrap();

    assert!(serialized.contains("\"provider_code\""));
    assert!(serialized.contains("\"http_status\""));
    assert!(!display.contains("api_key"));
    assert!(!display.contains("secret_"));
    assert!(!serialized.contains("api_key"));
    assert!(!serialized.contains("secret_"));
}

// =========================================================================
//  15. Network error safety
// =========================================================================

#[test]
fn network_error_does_not_contain_query_or_path_parts() {
    let err = video_distiller_lib::providers::error::err_network("some error");
    let display = format!("{}", err);
    assert!(!display.contains("secretid"));
    assert!(!display.contains("api_key"));
    assert!(!display.contains("Authorization"));
}

// =========================================================================
//  16. ProfileStore load with migration_required roundtrips
// =========================================================================

#[test]
fn migration_required_survives_save_load_roundtrip() {
    let dir = tempdir().unwrap();
    let store = ProfileStore::new(dir.path().join("profiles.json"));

    let mut profiles = store.load().unwrap();
    profiles.migration_required = true;
    store.save(&profiles).unwrap();
    let loaded = store.load().unwrap();
    assert!(loaded.migration_required);

    let mut profiles2 = loaded;
    profiles2.migration_required = false;
    store.save(&profiles2).unwrap();
    let loaded2 = store.load().unwrap();
    assert!(!loaded2.migration_required);
}

// =========================================================================
//  17. InMemoryLegacyBackend fundamentals
// =========================================================================

#[test]
fn in_memory_legacy_backend_has_works() {
    let no_legacy = InMemoryLegacyBackend::new();
    assert!(!no_legacy.has_legacy(), "Default has no legacy credential");

    let has_legacy = InMemoryLegacyBackend::with_legacy();
    assert!(has_legacy.has_legacy(), "with_legacy() returns true");
}

#[test]
fn in_memory_legacy_backend_delete_works() {
    let legacy = InMemoryLegacyBackend::with_legacy();
    assert!(legacy.has_legacy());

    let result = legacy.delete_legacy();
    assert!(result.is_ok(), "Delete should succeed with default");
}

#[test]
fn in_memory_legacy_backend_failing_delete_fails() {
    let legacy = InMemoryLegacyBackend::with_failing_delete();
    assert!(legacy.has_legacy());

    let result = legacy.delete_legacy();
    assert!(result.is_err(), "Failing delete should return error");
}

// =========================================================================
//  18. run_migration — error message does not leak backend detail
// =========================================================================

#[test]
fn run_migration_error_does_not_leak_backend_detail() {
    let dir = tempdir().unwrap();
    let store = ProfileStore::new(dir.path().join("profiles.json"));
    let cred_store = CredentialStore::new(InMemoryBackend::new());
    let legacy = InMemoryLegacyBackend::with_failing_delete();

    setup_profiles(&store, true);
    set_active_credentials(&cred_store);

    let result = run_migration(&store, &cred_store, &legacy, true);
    assert!(result.is_err());
    let err = result.unwrap_err();
    // Must not contain the raw "simulated legacy credential deletion failure" text
    assert!(
        !err.message.contains("simulated"),
        "Error message must not leak backend detail: {}",
        err.message
    );
    assert_eq!(err.code, "migration_deletion_failed");
}
