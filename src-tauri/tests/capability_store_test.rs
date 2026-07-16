use std::fs;

use tempfile::tempdir;
use video_distiller_lib::{
    capability_store::{
        CapabilitySettings, CapabilityStore, ImageConfig, LocalAgentConfig, RerankConfig,
        TtsConfig, VectorConfig, WebSearchConfig,
    },
    credential_store::{capability_account, CapabilityKind, CredentialBackend, CredentialStore, InMemoryBackend, SecretPayload},
    commands::{capability_status_for_services, save_vector_config_for_services, ManagedServices},
    domain::SecretInput,
};

fn vector_config() -> VectorConfig {
    VectorConfig {
        enabled: true,
        provider_id: "custom-vector".into(),
        endpoint: "https://example.test/v1/embeddings".into(),
        model: "embed-small".into(),
        collection: "notes".into(),
        dimensions: Some(1024),
    }
}

#[test]
fn missing_store_loads_versioned_safe_defaults() {
    let dir = tempdir().unwrap();
    let store = CapabilityStore::new(dir.path().join("capabilities.json"));

    assert_eq!(store.load().unwrap(), CapabilitySettings::default());
    assert_eq!(store.load().unwrap().schema_version, 1);
}

#[test]
fn saves_all_non_secret_configs_atomically_and_roundtrips() {
    let dir = tempdir().unwrap();
    let path = dir.path().join("capabilities.json");
    let store = CapabilityStore::new(&path);

    let mut settings = CapabilitySettings::default();
    settings.vector = vector_config();
    settings.rerank = RerankConfig {
        enabled: true,
        provider_id: "rerank-main".into(),
        endpoint: "https://example.test/v1/rerank".into(),
        model: "rerank-v3".into(),
    };
    settings.web_search = WebSearchConfig {
        enabled: true,
        provider_id: "tavily".into(),
        endpoint: "https://example.test/search".into(),
        max_results: 5,
    };
    settings.tts = TtsConfig {
        enabled: true,
        provider_id: "tts-main".into(),
        endpoint: "https://example.test/v1/audio/speech".into(),
        model: "tts-1".into(),
        voice: "alloy".into(),
    };
    settings.image = ImageConfig {
        enabled: true,
        provider_id: "image-main".into(),
        endpoint: "https://example.test/v1/images/generations".into(),
        model: "image-1".into(),
        size: "1024x1024".into(),
    };
    settings.local_agent = LocalAgentConfig {
        enabled: true,
        provider_id: "codex".into(),
        executable: "C:\\Tools\\codex.exe".into(),
        arguments: vec!["exec".into(), "--json".into()],
        timeout_seconds: 120,
    };

    store.save(&settings).unwrap();

    assert_eq!(store.load().unwrap(), settings);
    assert!(!path.with_extension("json.tmp").exists());
    let json = fs::read_to_string(path).unwrap();
    assert!(!json.contains("secret-value"));
}

#[test]
fn capability_credentials_use_exact_namespaced_accounts_and_never_enter_json() {
    let dir = tempdir().unwrap();
    let path = dir.path().join("capabilities.json");
    let store = CapabilityStore::new(&path);
    store.save_vector(vector_config()).unwrap();

    let backend = InMemoryBackend::new();
    let credential_store = CredentialStore::new(backend.clone());
    credential_store
        .set_capability(
            CapabilityKind::Vector,
            "custom-vector",
            &SecretPayload::Bearer {
                api_key: "secret-value".into(),
            },
        )
        .unwrap();

    let account = capability_account(CapabilityKind::Vector, "custom-vector").unwrap();
    assert_eq!(account, "capability:vector:custom-vector");
    assert!(backend
        .get_password("video-distiller-profiles-v1", &account)
        .unwrap()
        .contains("secret-value"));
    assert!(!fs::read_to_string(path).unwrap().contains("secret-value"));
}

#[test]
fn rejects_unsafe_remote_endpoints_and_shell_style_local_agent_arguments() {
    let dir = tempdir().unwrap();
    let store = CapabilityStore::new(dir.path().join("capabilities.json"));

    let mut invalid_endpoint = vector_config();
    invalid_endpoint.endpoint = "http://remote.example.test/v1".into();
    assert_eq!(store.save_vector(invalid_endpoint).unwrap_err().code, "capability_invalid");

    let unsafe_agent = LocalAgentConfig {
        enabled: true,
        provider_id: "unsafe".into(),
        executable: "cmd.exe".into(),
        arguments: vec!["/C".into(), "tool && upload".into()],
        timeout_seconds: 60,
    };
    assert_eq!(store.save_local_agent(unsafe_agent).unwrap_err().code, "capability_invalid");

    let relative_agent = LocalAgentConfig {
        enabled: true,
        provider_id: "relative".into(),
        executable: "codex.exe".into(),
        arguments: vec!["exec".into()],
        timeout_seconds: 60,
    };
    assert_eq!(store.save_local_agent(relative_agent).unwrap_err().code, "capability_invalid");
}

#[test]
fn command_seam_saves_config_and_secret_in_separate_stores() {
    let dir = tempdir().unwrap();
    let backend = InMemoryBackend::new();
    let services = ManagedServices::new_with_backend(dir.path().join("profiles.json"), backend);

    let status = save_vector_config_for_services(
        &services,
        vector_config(),
        Some(SecretInput::Bearer {
            api_key: "secret-value".into(),
        }),
    )
    .unwrap();

    assert!(status.configured);
    assert!(status.credential_ready);
    assert_eq!(status.provider_id, "custom-vector");
    let all = capability_status_for_services(&services).unwrap();
    assert!(all.vector.credential_ready);
    assert!(!fs::read_to_string(dir.path().join("capabilities.json"))
        .unwrap()
        .contains("secret-value"));
}

#[test]
fn repeated_save_replaces_the_existing_document_on_windows() {
    let dir = tempdir().unwrap();
    let store = CapabilityStore::new(dir.path().join("capabilities.json"));
    store.save_vector(vector_config()).unwrap();

    let mut replacement = vector_config();
    replacement.model = "embed-large".into();
    store.save_vector(replacement.clone()).unwrap();

    assert_eq!(store.load().unwrap().vector, replacement);
}
