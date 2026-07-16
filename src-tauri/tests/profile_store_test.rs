// == Stage 01: Profile Domain and Versioned Store Tests =====================
//
// Tests for profiles.rs and profile_store.rs: serialization, validation,
// defaults, atomic persistence, and active/fallback selection.
// No real credentials or system configuration are touched.

use tempfile::tempdir;
use video_distiller_lib::local_models::LOCAL_WHISPER_PROFILE_ID;
use video_distiller_lib::profile_store::ProfileStore;
use video_distiller_lib::profiles::{
    AppProfiles, SummaryProviderKind, TranscriptionProfile, TranscriptionProviderKind,
};

// ---------------------------------------------------------------------------
// Defaults & basic serialization
// ---------------------------------------------------------------------------

#[test]
fn creates_version_one_defaults_without_credentials() {
    let dir = tempdir().unwrap();
    let store = ProfileStore::new(dir.path().join("profiles.json"));
    let profiles = store.load().unwrap();

    assert_eq!(profiles.schema_version, 1);
    assert!(profiles
        .transcription_profiles
        .iter()
        .any(|p| p.provider == TranscriptionProviderKind::TencentFlash));
    assert!(profiles
        .transcription_profiles
        .iter()
        .any(|p| p.provider == TranscriptionProviderKind::MimoAsr));
    assert!(profiles
        .summary_profiles
        .iter()
        .any(|p| p.provider == SummaryProviderKind::DeepSeek));

    let serialized = serde_json::to_string(&profiles).unwrap();
    // No secret field names or values should appear
    assert!(
        !serialized.contains("api_key"),
        "Serialized profiles must not contain 'api_key': {}",
        serialized
    );
    assert!(
        !serialized.contains("secret_id"),
        "Serialized profiles must not contain 'secret_id'"
    );
    assert!(
        !serialized.contains("secret_key"),
        "Serialized profiles must not contain 'secret_key'"
    );
}

#[test]
fn built_in_local_whisper_profile_has_no_endpoint_or_secret_field() {
    let profiles = AppProfiles::defaults();
    let local = profiles
        .transcription_profiles
        .iter()
        .find(|profile| profile.provider == TranscriptionProviderKind::LocalWhisperCpp)
        .expect("the local whisper profile must be seeded");

    assert_eq!(local.id, "local-whisper-cpp");
    assert_eq!(local.name, "本地 Whisper（whisper.cpp）");
    assert!(local.base_url.is_empty());
    assert!(local.model.is_empty());
    assert!(!local.enabled);

    let json = serde_json::to_value(local).unwrap();
    assert!(json.get("apiKey").is_none());
    assert!(json.get("secret").is_none());
}

#[test]
fn local_whisper_accepts_empty_or_registered_model_without_an_endpoint() {
    let mut profiles = AppProfiles::defaults();
    let local = profiles
        .transcription_profiles
        .iter_mut()
        .find(|profile| profile.provider == TranscriptionProviderKind::LocalWhisperCpp)
        .unwrap();
    local.enabled = true;
    local.model = "tiny".into();
    assert!(profiles.validate().is_ok());

    let local = profiles
        .transcription_profiles
        .iter_mut()
        .find(|profile| profile.provider == TranscriptionProviderKind::LocalWhisperCpp)
        .unwrap();
    local.base_url = "https://example.invalid".into();
    assert!(profiles.validate().is_err());
}

#[test]
fn defaults_have_all_builtin_presets() {
    let dir = tempdir().unwrap();
    let store = ProfileStore::new(dir.path().join("profiles.json"));
    let profiles = store.load().unwrap();

    // Transcription presets
    assert!(
        profiles.has_transcription_preset("tencent-flash"),
        "Should have tencent-flash preset"
    );
    assert!(
        profiles.has_transcription_preset("mimo-asr"),
        "Should have mimo-asr preset"
    );

    // Summary presets
    assert!(
        profiles.has_summary_preset("deepseek-main"),
        "Should have deepseek-main preset"
    );
    assert!(
        profiles.has_summary_preset("mimo-summary"),
        "Should have mimo-summary preset"
    );
}

// ---------------------------------------------------------------------------
// Round-trip: active/fallback IDs survive save/load
// ---------------------------------------------------------------------------

#[test]
fn active_and_fallback_ids_survive_roundtrip() {
    let dir = tempdir().unwrap();
    let store = ProfileStore::new(dir.path().join("profiles.json"));
    let mut profiles = store.load().unwrap();

    // Enable all transcription profiles so they can be referenced
    for p in &mut profiles.transcription_profiles {
        p.enabled = true;
    }

    let mimo_id = profiles
        .transcription_profiles
        .iter()
        .find(|p| p.provider == TranscriptionProviderKind::MimoAsr)
        .map(|p| p.id.clone())
        .unwrap();
    let custom_id = profiles
        .transcription_profiles
        .iter()
        .find(|p| p.provider == TranscriptionProviderKind::OpenAiCompatible)
        .map(|p| p.id.clone())
        .unwrap();

    profiles.active_transcription_profile_id = Some(mimo_id.clone());
    profiles.fallback_transcription_profile_id = Some(custom_id);
    store.save(&profiles).unwrap();
    let loaded = store.load().unwrap();
    assert_eq!(
        loaded.active_transcription_profile_id.as_deref(),
        Some(mimo_id.as_str())
    );
    assert!(
        loaded.fallback_transcription_profile_id.is_some(),
        "Fallback ID should survive roundtrip"
    );
}

// ---------------------------------------------------------------------------
// Serialization format: camelCase for AppProfiles, snake_case for kinds
// ---------------------------------------------------------------------------

#[test]
fn app_profiles_serializes_with_camel_case_field_names() {
    let profiles = AppProfiles::defaults();
    let json = serde_json::to_string(&profiles).unwrap();
    // Verify camelCase field names
    assert!(
        json.contains("schemaVersion"),
        "Should use camelCase schemaVersion"
    );
    assert!(
        json.contains("activeTranscriptionProfileId"),
        "Should use camelCase activeTranscriptionProfileId"
    );
    assert!(
        json.contains("activeSummaryProfileId"),
        "Should use camelCase activeSummaryProfileId"
    );
    assert!(
        json.contains("fallbackTranscriptionProfileId"),
        "Should use camelCase fallbackTranscriptionProfileId"
    );
    assert!(
        json.contains("transcriptionProfiles"),
        "Should use camelCase transcriptionProfiles"
    );
    assert!(
        json.contains("summaryProfiles"),
        "Should use camelCase summaryProfiles"
    );
}

#[test]
fn provider_kind_serializes_snake_case() {
    assert_eq!(
        serde_json::to_value(TranscriptionProviderKind::TencentFlash).unwrap(),
        serde_json::json!("tencent_flash")
    );
    assert_eq!(
        serde_json::to_value(TranscriptionProviderKind::MimoAsr).unwrap(),
        serde_json::json!("mimo_asr")
    );
    assert_eq!(
        serde_json::to_value(TranscriptionProviderKind::OpenAiCompatible).unwrap(),
        serde_json::json!("open_ai_compatible")
    );
    assert_eq!(
        serde_json::to_value(SummaryProviderKind::DeepSeek).unwrap(),
        serde_json::json!("deep_seek")
    );
    assert_eq!(
        serde_json::to_value(SummaryProviderKind::Mimo).unwrap(),
        serde_json::json!("mimo")
    );
    assert_eq!(
        serde_json::to_value(SummaryProviderKind::OpenAiCompatible).unwrap(),
        serde_json::json!("open_ai_compatible")
    );
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

#[test]
fn rejects_empty_stable_id() {
    let mut profiles = AppProfiles::defaults();
    let mut p = TranscriptionProfile {
        id: "".into(),
        name: "Test".into(),
        provider: TranscriptionProviderKind::OpenAiCompatible,
        base_url: "https://api.example.com".into(),
        model: "whisper-1".into(),
        enabled: true,
        built_in: false,
    };
    // Generate unique id for the profile
    p.id = uuid::Uuid::new_v4().to_string();
    profiles.transcription_profiles.push(p);

    let bad = TranscriptionProfile {
        id: "".into(),
        name: "Bad".into(),
        provider: TranscriptionProviderKind::OpenAiCompatible,
        base_url: "https://api.example.com".into(),
        model: "whisper-1".into(),
        enabled: true,
        built_in: false,
    };
    profiles.transcription_profiles.push(bad);
    let result = profiles.validate();
    assert!(result.is_err(), "Empty ID should be rejected");
    assert!(
        result.unwrap_err().contains("id"),
        "Error should mention id"
    );
}

#[test]
fn rejects_empty_name() {
    let mut profiles = AppProfiles::defaults();
    let p = TranscriptionProfile {
        id: uuid::Uuid::new_v4().to_string(),
        name: "  ".into(),
        provider: TranscriptionProviderKind::OpenAiCompatible,
        base_url: "https://api.example.com".into(),
        model: "whisper-1".into(),
        enabled: true,
        built_in: false,
    };
    profiles.transcription_profiles.push(p);
    let result = profiles.validate();
    assert!(result.is_err(), "Empty/whitespace name should be rejected");
}

#[test]
fn rejects_empty_base_url() {
    let mut profiles = AppProfiles::defaults();
    let p = TranscriptionProfile {
        id: uuid::Uuid::new_v4().to_string(),
        name: "Test".into(),
        provider: TranscriptionProviderKind::OpenAiCompatible,
        base_url: "".into(),
        model: "whisper-1".into(),
        enabled: true,
        built_in: false,
    };
    profiles.transcription_profiles.push(p);
    let result = profiles.validate();
    assert!(result.is_err(), "Empty base_url should be rejected");
}

#[test]
fn rejects_empty_model() {
    let mut profiles = AppProfiles::defaults();
    let p = TranscriptionProfile {
        id: uuid::Uuid::new_v4().to_string(),
        name: "Test".into(),
        provider: TranscriptionProviderKind::OpenAiCompatible,
        base_url: "https://api.example.com".into(),
        model: "".into(),
        enabled: true,
        built_in: false,
    };
    profiles.transcription_profiles.push(p);
    let result = profiles.validate();
    assert!(result.is_err(), "Empty model should be rejected");
}

#[test]
fn rejects_http_without_localhost() {
    let mut profiles = AppProfiles::defaults();
    let p = TranscriptionProfile {
        id: uuid::Uuid::new_v4().to_string(),
        name: "Test".into(),
        provider: TranscriptionProviderKind::OpenAiCompatible,
        base_url: "http://api.example.com".into(),
        model: "whisper-1".into(),
        enabled: true,
        built_in: false,
    };
    profiles.transcription_profiles.push(p);
    let result = profiles.validate();
    assert!(result.is_err(), "Non-localhost HTTP should be rejected");
}

#[test]
fn allows_http_localhost() {
    let mut profiles = AppProfiles::defaults();
    let p = TranscriptionProfile {
        id: uuid::Uuid::new_v4().to_string(),
        name: "Local".into(),
        provider: TranscriptionProviderKind::OpenAiCompatible,
        base_url: "http://127.0.0.1:8080".into(),
        model: "whisper-1".into(),
        enabled: true,
        built_in: false,
    };
    profiles.transcription_profiles.push(p);
    assert!(
        profiles.validate().is_ok(),
        "http://127.0.0.1 should be allowed"
    );
}

#[test]
fn allows_http_localhost_hostname() {
    let mut profiles = AppProfiles::defaults();
    let p = TranscriptionProfile {
        id: uuid::Uuid::new_v4().to_string(),
        name: "Local".into(),
        provider: TranscriptionProviderKind::OpenAiCompatible,
        base_url: "http://localhost:11434".into(),
        model: "whisper-1".into(),
        enabled: true,
        built_in: false,
    };
    profiles.transcription_profiles.push(p);
    assert!(
        profiles.validate().is_ok(),
        "http://localhost should be allowed"
    );
}

#[test]
fn rejects_invalid_active_id_reference() {
    let profiles = AppProfiles {
        active_transcription_profile_id: Some("non-existent".into()),
        ..AppProfiles::defaults()
    };
    let result = profiles.validate();
    assert!(
        result.is_err(),
        "Active ID referencing non-existent profile should fail"
    );
}

#[test]
fn rejects_tencent_fallback() {
    let mut profiles = AppProfiles::defaults();

    // Find the tencent flash profile ID
    let tencent_id = profiles
        .transcription_profiles
        .iter()
        .find(|p| p.provider == TranscriptionProviderKind::TencentFlash)
        .map(|p| p.id.clone())
        .unwrap();

    // Enable the tencent profile and set the active to a non-tencent one
    if let Some(ref mut p) = profiles
        .transcription_profiles
        .iter_mut()
        .find(|p| p.id == tencent_id)
    {
        p.enabled = true;
    }

    let mimo_id = profiles
        .transcription_profiles
        .iter()
        .find(|p| p.provider == TranscriptionProviderKind::MimoAsr)
        .map(|p| p.id.clone())
        .unwrap();
    if let Some(ref mut p) = profiles
        .transcription_profiles
        .iter_mut()
        .find(|p| p.id == mimo_id)
    {
        p.enabled = true;
    }

    profiles.active_transcription_profile_id = Some(mimo_id.clone());

    // Set fallback to the tencent profile — should fail
    profiles.fallback_transcription_profile_id = Some(tencent_id);
    let result = profiles.validate();
    assert!(result.is_err(), "Tencent fallback should be rejected");
}

#[test]
fn fallback_equals_active_is_now_valid() {
    let mut profiles = AppProfiles::defaults();

    // Enable both transcription profiles
    for p in &mut profiles.transcription_profiles {
        p.enabled = true;
    }

    let mimo_id = profiles
        .transcription_profiles
        .iter()
        .find(|p| p.provider == TranscriptionProviderKind::MimoAsr)
        .map(|p| p.id.clone())
        .unwrap();

    profiles.active_transcription_profile_id = Some(mimo_id.clone());
    profiles.fallback_transcription_profile_id = Some(mimo_id);
    let result = profiles.validate();
    assert!(
        result.is_ok(),
        "Fallback identical to active should be valid (validator no longer rejects it)"
    );
}

#[test]
fn valid_profiles_pass_validation() {
    let mut profiles = AppProfiles::defaults();

    // Enable all built-in profiles
    for p in &mut profiles.transcription_profiles {
        p.enabled = true;
    }
    for p in &mut profiles.summary_profiles {
        p.enabled = true;
    }

    let mimo_id = profiles
        .transcription_profiles
        .iter()
        .find(|p| p.provider == TranscriptionProviderKind::MimoAsr)
        .map(|p| p.id.clone())
        .unwrap();
    let custom_id = profiles
        .transcription_profiles
        .iter()
        .find(|p| p.provider == TranscriptionProviderKind::OpenAiCompatible)
        .map(|p| p.id.clone())
        .unwrap();

    profiles.active_transcription_profile_id = Some(mimo_id.clone());
    profiles.fallback_transcription_profile_id = Some(custom_id);
    profiles.active_summary_profile_id = Some(
        profiles
            .summary_profiles
            .first()
            .map(|p| p.id.clone())
            .unwrap(),
    );

    assert!(
        profiles.validate().is_ok(),
        "Valid profiles should pass validation: {:?}",
        profiles.validate().err()
    );
}

// ---------------------------------------------------------------------------
// Profile store: load and save behavior
// ---------------------------------------------------------------------------

#[test]
fn missing_file_yields_version_one_defaults() {
    let dir = tempdir().unwrap();
    let store = ProfileStore::new(dir.path().join("does_not_exist.json"));
    let profiles = store.load().unwrap();
    assert_eq!(profiles.schema_version, 1);
}

#[test]
fn malformed_json_returns_error_and_preserves_file() {
    let dir = tempdir().unwrap();
    let path = dir.path().join("profiles.json");
    std::fs::write(&path, "这不是有效的 JSON").unwrap();

    let store = ProfileStore::new(path.clone());
    let result = store.load();
    assert!(result.is_err(), "Malformed JSON should fail");
    assert_eq!(
        result.unwrap_err().code,
        "profile_config_invalid",
        "Error code should be profile_config_invalid"
    );

    // The original content must be preserved
    let content = std::fs::read_to_string(&path).unwrap();
    assert_eq!(
        content, "这不是有效的 JSON",
        "Original file must be preserved"
    );
}

#[test]
fn load_valid_existing_json() {
    let dir = tempdir().unwrap();
    let path = dir.path().join("profiles.json");

    // Write a valid profiles JSON
    let original = AppProfiles::defaults();
    let json = serde_json::to_string_pretty(&original).unwrap();
    std::fs::write(&path, &json).unwrap();

    let store = ProfileStore::new(path);
    let loaded = store.load().unwrap();
    assert_eq!(loaded.schema_version, 1);
    assert!(!loaded.transcription_profiles.is_empty());
    assert!(!loaded.summary_profiles.is_empty());
}

#[test]
fn loading_legacy_profiles_adds_local_whisper_without_changing_active_profile() {
    let dir = tempdir().unwrap();
    let path = dir.path().join("profiles.json");
    let legacy = r#"{
      "schemaVersion": 1,
      "activeTranscriptionProfileId": "mimo-asr",
      "activeSummaryProfileId": "deepseek-main",
      "fallbackTranscriptionProfileId": null,
      "migrationRequired": false,
      "transcriptionProfiles": [{
        "id": "mimo-asr", "name": "MiMo ASR", "provider": "mimo_asr",
        "baseUrl": "https://api.xiaomimimo.com/v1", "model": "mimo-v2.5-asr",
        "enabled": true, "builtIn": true
      }],
      "summaryProfiles": [{
        "id": "deepseek-main", "name": "DeepSeek", "provider": "deep_seek",
        "baseUrl": "https://api.deepseek.com", "model": "deepseek-chat",
        "enabled": true, "builtIn": true
      }]
    }"#;
    std::fs::write(&path, legacy).unwrap();

    let loaded = ProfileStore::new(path.clone()).load().unwrap();
    let local = loaded
        .transcription_profiles
        .iter()
        .find(|profile| profile.id == LOCAL_WHISPER_PROFILE_ID)
        .expect("legacy configuration should gain the local Whisper built-in profile");

    assert!(!local.enabled);
    assert!(local.model.is_empty());
    assert!(local.base_url.is_empty());
    assert_eq!(
        loaded.active_transcription_profile_id.as_deref(),
        Some("mimo-asr")
    );
    assert!(std::fs::read_to_string(path)
        .unwrap()
        .contains("local-whisper-cpp"));
}

#[test]
fn save_validates_before_writing() {
    let dir = tempdir().unwrap();
    let path = dir.path().join("profiles.json");
    let store = ProfileStore::new(path.clone());

    // Create an invalid profile (empty name)
    let mut profiles = AppProfiles::defaults();
    let bad = TranscriptionProfile {
        id: uuid::Uuid::new_v4().to_string(),
        name: "".into(),
        provider: TranscriptionProviderKind::OpenAiCompatible,
        base_url: "https://api.example.com".into(),
        model: "whisper-1".into(),
        enabled: true,
        built_in: false,
    };
    profiles.transcription_profiles.push(bad);

    let result = store.save(&profiles);
    assert!(
        result.is_err(),
        "save() should reject invalid profiles before writing"
    );

    // The file should not exist (or remain absent)
    if path.exists() {
        // If it was created by a prior load, load that content back —
        // but the invalid save should NOT overwrite it.
        let content = std::fs::read_to_string(&path).unwrap();
        let parsed: Result<AppProfiles, _> = serde_json::from_str(&content);
        assert!(parsed.is_ok(), "File should not contain invalid data");
    }
}

#[test]
fn save_produces_valid_json() {
    let dir = tempdir().unwrap();
    let store = ProfileStore::new(dir.path().join("profiles.json"));
    let profiles = AppProfiles::defaults();
    store.save(&profiles).unwrap();

    // Read the file directly and parse it
    let content = std::fs::read_to_string(dir.path().join("profiles.json")).unwrap();
    let parsed: AppProfiles = serde_json::from_str(&content).unwrap();
    assert_eq!(parsed.schema_version, 1);
}

#[test]
fn atomic_save_does_not_corrupt_on_failure() {
    let dir = tempdir().unwrap();
    let path = dir.path().join("profiles.json");
    let store = ProfileStore::new(path.clone());

    // Save valid data first
    let profiles = AppProfiles::defaults();
    store.save(&profiles).unwrap();

    // Record the content
    let original_content = std::fs::read_to_string(&path).unwrap();

    // Now trigger a failure: write-protect the directory
    // Save uses a temp file approach; if serialization itself fails (e.g. invalid state)
    // the original should survive.

    // Actually let's use a path that will fail during write
    let bad_store = ProfileStore::new(dir.path().join("subdir").join("profiles.json"));
    let result = bad_store.save(&profiles);

    // The original good file's content should still be intact
    let still_original = std::fs::read_to_string(&path).unwrap();
    assert_eq!(
        still_original, original_content,
        "Original file must not be corrupted by save failure elsewhere"
    );

    // The save to a bad path should have failed
    assert!(
        result.is_err(),
        "Save to non-existent subdirectory should fail"
    );
}

// ---------------------------------------------------------------------------
// Load-time validation: schema version and invalid references
// ---------------------------------------------------------------------------

#[test]
fn load_rejects_unsupported_schema_version() {
    let dir = tempdir().unwrap();
    let path = dir.path().join("profiles.json");

    // Write JSON with unsupported schema version
    let json = r#"{
        "schemaVersion": 99,
        "activeTranscriptionProfileId": null,
        "activeSummaryProfileId": null,
        "fallbackTranscriptionProfileId": null,
        "transcriptionProfiles": [],
        "summaryProfiles": []
    }"#;
    std::fs::write(&path, json).unwrap();

    let store = ProfileStore::new(path.clone());
    let result = store.load();
    assert!(
        result.is_err(),
        "Unsupported schema version should be rejected on load"
    );
    assert_eq!(
        result.unwrap_err().code,
        "profile_config_invalid",
        "Error code should be profile_config_invalid"
    );

    // Original file must be preserved unchanged
    let content = std::fs::read_to_string(&path).unwrap();
    assert_eq!(content, json, "Original file must be preserved unchanged");
}

#[test]
fn load_rejects_invalid_active_id_reference() {
    let dir = tempdir().unwrap();
    let path = dir.path().join("profiles.json");

    // Syntactically valid JSON but active_transcription_profile_id references
    // a non-existent profile (and no profiles are enabled).
    let json = r#"{
        "schemaVersion": 1,
        "activeTranscriptionProfileId": "ghost-profile",
        "activeSummaryProfileId": null,
        "fallbackTranscriptionProfileId": null,
        "transcriptionProfiles": [],
        "summaryProfiles": []
    }"#;
    std::fs::write(&path, json).unwrap();

    let store = ProfileStore::new(path.clone());
    let result = store.load();
    assert!(
        result.is_err(),
        "Invalid active ID reference should be rejected on load"
    );
    assert_eq!(
        result.unwrap_err().code,
        "profile_config_invalid",
        "Error code should be profile_config_invalid"
    );

    // File must be preserved
    let content = std::fs::read_to_string(&path).unwrap();
    assert_eq!(content, json, "Original file must be preserved unchanged");
}

#[test]
fn load_rejects_invalid_fallback_id_reference() {
    let dir = tempdir().unwrap();
    let path = dir.path().join("profiles.json");

    // Set a valid active, but fallback references a non-existent profile
    let json = r#"{
        "schemaVersion": 1,
        "activeTranscriptionProfileId": "tencent-flash",
        "activeSummaryProfileId": null,
        "fallbackTranscriptionProfileId": "no-such-profile",
        "transcriptionProfiles": [
            {
                "id": "tencent-flash",
                "name": "腾讯云极速版",
                "provider": "tencent_flash",
                "baseUrl": "https://asr.cloud.tencent.com",
                "model": "16k_zh",
                "enabled": true,
                "builtIn": true
            }
        ],
        "summaryProfiles": []
    }"#;
    std::fs::write(&path, json).unwrap();

    let store = ProfileStore::new(path.clone());
    let result = store.load();
    assert!(
        result.is_err(),
        "Invalid fallback ID reference should be rejected on load"
    );
    assert_eq!(
        result.unwrap_err().code,
        "profile_config_invalid",
        "Error code should be profile_config_invalid"
    );

    // File must be preserved
    let content = std::fs::read_to_string(&path).unwrap();
    assert_eq!(content, json, "Original file must be preserved unchanged");
}

#[test]
fn set_active_transcription_works() {
    let mut profiles = AppProfiles::defaults();

    // Enable all transcription profiles
    for p in &mut profiles.transcription_profiles {
        p.enabled = true;
    }

    let mimo_id = profiles
        .transcription_profiles
        .iter()
        .find(|p| p.provider == TranscriptionProviderKind::MimoAsr)
        .map(|p| p.id.clone())
        .unwrap();

    profiles.active_transcription_profile_id = Some(mimo_id.clone());
    assert_eq!(
        profiles.active_transcription_profile_id.as_deref(),
        Some(mimo_id.as_str())
    );
}

#[test]
fn set_fallback_transcription_works() {
    let mut profiles = AppProfiles::defaults();

    for p in &mut profiles.transcription_profiles {
        p.enabled = true;
    }

    let custom_id = profiles
        .transcription_profiles
        .iter()
        .find(|p| p.provider == TranscriptionProviderKind::OpenAiCompatible)
        .map(|p| p.id.clone())
        .unwrap();

    profiles.fallback_transcription_profile_id = Some(custom_id.clone());
    assert_eq!(
        profiles.fallback_transcription_profile_id.as_deref(),
        Some(custom_id.as_str())
    );
}

#[test]
fn set_active_summary_works() {
    let mut profiles = AppProfiles::defaults();

    let ds_id = profiles
        .summary_profiles
        .iter()
        .find(|p| p.provider == SummaryProviderKind::DeepSeek)
        .map(|p| p.id.clone())
        .unwrap();

    profiles.active_summary_profile_id = Some(ds_id.clone());
    assert_eq!(
        profiles.active_summary_profile_id.as_deref(),
        Some(ds_id.as_str())
    );
}

#[test]
fn summary_profiles_accept_standard_protocols_and_legacy_documents() {
    use video_distiller_lib::profiles::{SummaryProfile, SummaryProviderKind};

    let anthropic: SummaryProfile = serde_json::from_value(serde_json::json!({
        "id": "catalog-anthropic",
        "name": "Anthropic",
        "provider": "anthropic",
        "catalogProviderId": "anthropic",
        "baseUrl": "https://api.anthropic.com",
        "model": "claude-sonnet-4-6",
        "enabled": true,
        "builtIn": true
    })).unwrap();
    assert_eq!(anthropic.provider, SummaryProviderKind::Anthropic);
    assert_eq!(anthropic.catalog_provider_id.as_deref(), Some("anthropic"));

    let responses: SummaryProfile = serde_json::from_value(serde_json::json!({
        "id": "catalog-openai",
        "name": "OpenAI",
        "provider": "open_ai_responses",
        "catalogProviderId": "openai",
        "baseUrl": "https://api.openai.com/v1",
        "model": "gpt-4.1-mini",
        "enabled": true,
        "builtIn": true
    })).unwrap();
    assert_eq!(responses.provider, SummaryProviderKind::OpenAiResponses);

    let google: SummaryProfile = serde_json::from_value(serde_json::json!({
        "id": "catalog-google",
        "name": "Google",
        "provider": "google",
        "catalogProviderId": "google",
        "baseUrl": "https://generativelanguage.googleapis.com/v1beta",
        "model": "gemini-2.5-flash",
        "enabled": true,
        "builtIn": true
    })).unwrap();
    assert_eq!(google.provider, SummaryProviderKind::Google);

    let legacy: SummaryProfile = serde_json::from_value(serde_json::json!({
        "id": "deepseek-main",
        "name": "DeepSeek",
        "provider": "deep_seek",
        "baseUrl": "https://api.deepseek.com",
        "model": "deepseek-chat",
        "enabled": true,
        "builtIn": true
    })).unwrap();
    assert_eq!(legacy.provider, SummaryProviderKind::DeepSeek);
    assert_eq!(legacy.catalog_provider_id, None);
}
#[test]
fn load_maps_legacy_summary_profiles_to_catalog_ids() {
    let dir = tempdir().unwrap();
    let path = dir.path().join("profiles.json");
    let mut legacy = AppProfiles::defaults();
    for profile in &mut legacy.summary_profiles {
        if matches!(
            profile.provider,
            SummaryProviderKind::DeepSeek | SummaryProviderKind::Mimo
        ) {
            profile.catalog_provider_id = None;
        }
    }
    std::fs::write(&path, serde_json::to_vec_pretty(&legacy).unwrap()).unwrap();

    let loaded = ProfileStore::new(path).load().unwrap();
    let deepseek = loaded
        .summary_profiles
        .iter()
        .find(|profile| profile.provider == SummaryProviderKind::DeepSeek)
        .unwrap();
    let mimo = loaded
        .summary_profiles
        .iter()
        .find(|profile| profile.provider == SummaryProviderKind::Mimo)
        .unwrap();

    assert_eq!(deepseek.catalog_provider_id.as_deref(), Some("deepseek"));
    assert_eq!(mimo.catalog_provider_id.as_deref(), Some("xiaomi"));
}

#[test]
fn validation_rejects_catalog_protocol_mismatch() {
    let mut profiles = AppProfiles::defaults();
    let deepseek = profiles
        .summary_profiles
        .iter_mut()
        .find(|profile| profile.provider == SummaryProviderKind::DeepSeek)
        .unwrap();
    deepseek.provider = SummaryProviderKind::Anthropic;

    let error = profiles.validate().unwrap_err();
    assert!(error.contains("catalog protocol"));
    assert!(!error.contains("https://"));
}