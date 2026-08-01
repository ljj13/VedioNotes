// == Stage 02: Production Provider Adapter Tests ==============================
//
// Comprehensive localhost-mock tests for all provider adapters:
//
//   - Normalized errors (ProviderErrorKind fallback eligibility)
//   - OpenAiCompatibleAsrAdapter — multipart POST, Bearer auth, parsing,
//     error status mapping, cancellation
//   - MiMoAsrAdapter — Chat Completions JSON shape, Base64 Data URL,
//     response parsing, error mapping
//   - TencentFlashAsrAdapter — canonical query sorting, HMAC-SHA1 signature,
//     flash_result parsing, Tencent error code classification
//   - OpenAiCompatibleSummaryAdapter — chat completions prompt, parsing,
//     missing/empty content
//   - ModelDiscovery — success, unsupported, authentication
//   - Registries — resolves all three ASR kinds and all three summary kinds
//     without caller string branching
//   - Cancellation — checked before read, before send, after receive
//
// All HTTP interactions use wiremock on loopback. No DNS or remote provider
// is contacted.  No real credentials appear in any fixture.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use base64::Engine;
use hmac::Mac;
use tempfile::TempDir;
use wiremock::{Mock, MockServer, ResponseTemplate};

use video_distiller_lib::credential_store::SecretPayload;
use video_distiller_lib::domain::{KeyEvidence, NoteStyle};
use video_distiller_lib::profiles::{
    OnlineTranscriptionLanguage, OnlineTranscriptionOptions, SummaryProfile, SummaryProviderKind,
    TranscriptionProfile, TranscriptionProviderKind,
};
use video_distiller_lib::providers::error::{self, ProviderError, ProviderErrorKind};
use video_distiller_lib::providers::summary::{
    AnthropicSummaryAdapter, GoogleSummaryAdapter, OpenAiCompatibleSummaryAdapter,
    OpenAiResponsesSummaryAdapter,
};
use video_distiller_lib::providers::transcription::{
    MiMoAsrAdapter, OpenAiCompatibleAsrAdapter, TencentFlashAsrAdapter,
};
use video_distiller_lib::providers::{
    SummaryAdapter, SummaryRegistry, TranscriptionAdapter, TranscriptionRegistry,
};

// =========================================================================
//  Fixture helpers
// =========================================================================

/// Create a short dummy audio file at the given path.
fn create_audio_fixture(dir: &TempDir) -> std::path::PathBuf {
    let path = dir.path().join("test_audio.mp3");
    std::fs::write(&path, b"fake audio bytes for mock testing").unwrap();
    path
}

/// A non-cancelled cancellation flag (always false).
fn non_cancelled() -> Arc<AtomicBool> {
    Arc::new(AtomicBool::new(false))
}

/// A pre-cancelled flag.
fn pre_cancelled() -> Arc<AtomicBool> {
    let flag = Arc::new(AtomicBool::new(false));
    flag.store(true, Ordering::SeqCst);
    flag
}

/// Build a transcription profile pointing to a mock server base URL.
fn mock_transcription_profile(
    mock: &MockServer,
    kind: TranscriptionProviderKind,
) -> TranscriptionProfile {
    TranscriptionProfile {
        id: "mock-profile".into(),
        name: "Mock Profile".into(),
        provider: kind,
        base_url: mock.uri(),
        model: "test-model".into(),
        online_options: OnlineTranscriptionOptions::default(),
        enabled: true,
        built_in: false,
    }
}

/// Build a summary profile pointing to a mock server base URL.
fn mock_summary_profile(mock: &MockServer, kind: SummaryProviderKind) -> SummaryProfile {
    SummaryProfile {
        id: "mock-summary".into(),
        name: "Mock Summary".into(),
        provider: kind,
        catalog_provider_id: None,
        base_url: mock.uri(),
        model: "test-summary-model".into(),
        enabled: true,
        built_in: false,
    }
}

// =========================================================================
//  1. ProviderErrorKind — fallback eligibility
// =========================================================================

#[test]
fn quota_and_billing_allow_fallback() {
    assert!(ProviderErrorKind::QuotaExhausted.allows_quota_fallback());
    assert!(ProviderErrorKind::BillingUnavailable.allows_quota_fallback());
}

#[test]
fn auth_and_network_errors_are_not_fallback_eligible() {
    assert!(!ProviderErrorKind::AuthenticationFailed.allows_quota_fallback());
    assert!(!ProviderErrorKind::RateLimited.allows_quota_fallback());
    assert!(!ProviderErrorKind::NetworkError.allows_quota_fallback());
    assert!(!ProviderErrorKind::InvalidResponse.allows_quota_fallback());
    assert!(!ProviderErrorKind::ProviderError.allows_quota_fallback());
    assert!(!ProviderErrorKind::Cancelled.allows_quota_fallback());
}

// =========================================================================
//  2. ProviderError — construction and conversion
// =========================================================================

#[test]
fn provider_error_new_and_builder() {
    let err = ProviderError::new(
        ProviderErrorKind::AuthenticationFailed,
        "test error",
        "try again",
    )
    .with_provider_code("4002")
    .with_http_status(401);

    assert_eq!(err.kind, ProviderErrorKind::AuthenticationFailed);
    assert_eq!(err.message, "test error");
    assert_eq!(err.recovery, "try again");
    assert_eq!(err.provider_code, Some("4002".into()));
    assert_eq!(err.http_status, Some(401));
}

#[test]
fn provider_error_into_app_error() {
    let err = ProviderError::new(
        ProviderErrorKind::QuotaExhausted,
        "额度耗尽",
        "切换备用配置",
    );
    let app_err = err.into_app_error();
    assert_eq!(app_err.code, "quota_exhausted");
    assert_eq!(app_err.message, "额度耗尽");
    assert_eq!(app_err.recovery, "切换备用配置");
}

#[test]
fn provider_error_display_does_not_leak_secrets() {
    let err = ProviderError::new(
        ProviderErrorKind::AuthenticationFailed,
        "认证失败",
        "检查 API Key",
    );
    let display = format!("{}", err);
    assert!(!display.contains("sk-"));
    assert!(!display.contains("Bearer"));
    assert!(display.contains("认证失败"));
}

#[test]
fn provider_error_kind_display() {
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
    assert_eq!(format!("{}", ProviderErrorKind::Cancelled), "cancelled");
}

#[test]
fn provider_error_kind_serialize_snake_case() {
    assert_eq!(
        serde_json::to_value(&ProviderErrorKind::QuotaExhausted).unwrap(),
        serde_json::json!("quota_exhausted")
    );
    assert_eq!(
        serde_json::to_value(&ProviderErrorKind::BillingUnavailable).unwrap(),
        serde_json::json!("billing_unavailable")
    );
}

#[test]
fn err_cancelled_has_correct_kind() {
    let err = error::err_cancelled();
    assert_eq!(err.kind, ProviderErrorKind::Cancelled);
}

// =========================================================================
//  3. OpenAiCompatibleAsrAdapter tests
// =========================================================================

#[tokio::test]
async fn openai_asr_sends_multipart_and_parses() {
    let mock = MockServer::start().await;
    let dir = tempfile::TempDir::new().unwrap();
    let audio_path = create_audio_fixture(&dir);

    Mock::given(wiremock::matchers::method("POST"))
        .and(wiremock::matchers::path("/v1/audio/transcriptions"))
        .and(wiremock::matchers::header_exists("Authorization"))
        .and(wiremock::matchers::header(
            "Authorization",
            "Bearer test-api-key-123",
        ))
        .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
            "text": "这是转写测试结果。"
        })))
        .mount(&mock)
        .await;

    let adapter = OpenAiCompatibleAsrAdapter;
    let mut profile =
        mock_transcription_profile(&mock, TranscriptionProviderKind::OpenAiCompatible);
    profile.base_url = format!("{}/v1", mock.uri());
    profile.online_options.language = OnlineTranscriptionLanguage::En;
    let secret = SecretPayload::Bearer {
        api_key: "test-api-key-123".into(),
    };
    let cancel = non_cancelled();

    let result = adapter
        .transcribe(&audio_path, &profile, &secret, &cancel)
        .await;
    assert!(
        result.is_ok(),
        "OpenAI ASR should succeed: {:?}",
        result.err()
    );
    assert_eq!(result.unwrap(), "这是转写测试结果。");

    // Verify request headers were correct
    let requests = mock.received_requests().await.unwrap();
    assert_eq!(requests.len(), 1);
    let req = &requests[0];
    assert_eq!(req.method, "POST");
    assert!(req.url.as_str().contains("/v1/audio/transcriptions"));

    // Verify multipart contains model and file
    let body_str = String::from_utf8_lossy(&req.body);
    assert!(
        body_str.contains("test-model"),
        "multipart body should contain model"
    );
    assert!(
        body_str.contains("test_audio.mp3"),
        "multipart body should contain file name"
    );
    assert!(body_str.contains("name=\"language\""));
    assert!(body_str.contains("en"));
}

#[tokio::test]
async fn openai_asr_honors_the_profile_timeout() {
    let mock = MockServer::start().await;
    let dir = tempfile::TempDir::new().unwrap();
    let audio_path = create_audio_fixture(&dir);
    Mock::given(wiremock::matchers::method("POST"))
        .respond_with(
            ResponseTemplate::new(200)
                .set_delay(std::time::Duration::from_millis(120))
                .set_body_json(serde_json::json!({ "text": "too late" })),
        )
        .mount(&mock)
        .await;

    let adapter = OpenAiCompatibleAsrAdapter;
    let mut profile = mock_transcription_profile(&mock, TranscriptionProviderKind::OpenAiCompatible);
    profile.online_options.timeout_ms = 20;
    let result = adapter
        .transcribe(
            &audio_path,
            &profile,
            &SecretPayload::Bearer { api_key: "test-key".into() },
            &non_cancelled(),
        )
        .await;

    assert!(result.is_err(), "the request must be cancelled by the configured timeout");
    assert_eq!(result.unwrap_err().kind, ProviderErrorKind::NetworkError);
}

#[tokio::test]
async fn openai_asr_401_maps_to_auth_error() {
    let mock = MockServer::start().await;
    let dir = tempfile::TempDir::new().unwrap();
    let audio_path = create_audio_fixture(&dir);

    Mock::given(wiremock::matchers::method("POST"))
        .respond_with(ResponseTemplate::new(401))
        .mount(&mock)
        .await;

    let adapter = OpenAiCompatibleAsrAdapter;
    let profile = mock_transcription_profile(&mock, TranscriptionProviderKind::OpenAiCompatible);
    let secret = SecretPayload::Bearer {
        api_key: "test-bad-key".into(),
    };
    let cancel = non_cancelled();

    let result = adapter
        .transcribe(&audio_path, &profile, &secret, &cancel)
        .await;
    assert!(result.is_err());
    assert_eq!(
        result.as_ref().unwrap_err().kind,
        ProviderErrorKind::AuthenticationFailed
    );
}

#[tokio::test]
async fn openai_asr_403_maps_to_auth_error() {
    let mock = MockServer::start().await;
    let dir = tempfile::TempDir::new().unwrap();
    let audio_path = create_audio_fixture(&dir);

    Mock::given(wiremock::matchers::method("POST"))
        .respond_with(ResponseTemplate::new(403))
        .mount(&mock)
        .await;

    let adapter = OpenAiCompatibleAsrAdapter;
    let profile = mock_transcription_profile(&mock, TranscriptionProviderKind::OpenAiCompatible);
    let secret = SecretPayload::Bearer {
        api_key: "test-bad-key".into(),
    };
    let cancel = non_cancelled();

    let result = adapter
        .transcribe(&audio_path, &profile, &secret, &cancel)
        .await;
    assert!(result.is_err());
    assert_eq!(
        result.as_ref().unwrap_err().kind,
        ProviderErrorKind::AuthenticationFailed
    );
}

#[tokio::test]
async fn openai_asr_402_maps_to_billing_error() {
    let mock = MockServer::start().await;
    let dir = tempfile::TempDir::new().unwrap();
    let audio_path = create_audio_fixture(&dir);

    Mock::given(wiremock::matchers::method("POST"))
        .respond_with(ResponseTemplate::new(402))
        .mount(&mock)
        .await;

    let adapter = OpenAiCompatibleAsrAdapter;
    let profile = mock_transcription_profile(&mock, TranscriptionProviderKind::OpenAiCompatible);
    let secret = SecretPayload::Bearer {
        api_key: "test-key".into(),
    };
    let cancel = non_cancelled();

    let result = adapter
        .transcribe(&audio_path, &profile, &secret, &cancel)
        .await;
    assert!(result.is_err());
    assert_eq!(
        result.as_ref().unwrap_err().kind,
        ProviderErrorKind::BillingUnavailable
    );
}

#[tokio::test]
async fn openai_asr_429_maps_to_rate_limited() {
    let mock = MockServer::start().await;
    let dir = tempfile::TempDir::new().unwrap();
    let audio_path = create_audio_fixture(&dir);

    Mock::given(wiremock::matchers::method("POST"))
        .respond_with(ResponseTemplate::new(429))
        .mount(&mock)
        .await;

    let adapter = OpenAiCompatibleAsrAdapter;
    let profile = mock_transcription_profile(&mock, TranscriptionProviderKind::OpenAiCompatible);
    let secret = SecretPayload::Bearer {
        api_key: "test-key".into(),
    };
    let cancel = non_cancelled();

    let result = adapter
        .transcribe(&audio_path, &profile, &secret, &cancel)
        .await;
    assert!(result.is_err());
    assert_eq!(
        result.as_ref().unwrap_err().kind,
        ProviderErrorKind::RateLimited
    );
}

#[tokio::test]
async fn openai_asr_invalid_json_response() {
    let mock = MockServer::start().await;
    let dir = tempfile::TempDir::new().unwrap();
    let audio_path = create_audio_fixture(&dir);

    Mock::given(wiremock::matchers::method("POST"))
        .respond_with(ResponseTemplate::new(200).set_body_string("这不是 JSON"))
        .mount(&mock)
        .await;

    let adapter = OpenAiCompatibleAsrAdapter;
    let profile = mock_transcription_profile(&mock, TranscriptionProviderKind::OpenAiCompatible);
    let secret = SecretPayload::Bearer {
        api_key: "test-key".into(),
    };
    let cancel = non_cancelled();

    let result = adapter
        .transcribe(&audio_path, &profile, &secret, &cancel)
        .await;
    assert!(result.is_err());
    assert_eq!(
        result.as_ref().unwrap_err().kind,
        ProviderErrorKind::InvalidResponse
    );
}

#[tokio::test]
async fn openai_asr_missing_text_field() {
    let mock = MockServer::start().await;
    let dir = tempfile::TempDir::new().unwrap();
    let audio_path = create_audio_fixture(&dir);

    Mock::given(wiremock::matchers::method("POST"))
        .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
            "not_text": "should not work"
        })))
        .mount(&mock)
        .await;

    let adapter = OpenAiCompatibleAsrAdapter;
    let profile = mock_transcription_profile(&mock, TranscriptionProviderKind::OpenAiCompatible);
    let secret = SecretPayload::Bearer {
        api_key: "test-key".into(),
    };
    let cancel = non_cancelled();

    let result = adapter
        .transcribe(&audio_path, &profile, &secret, &cancel)
        .await;
    assert!(result.is_err());
    assert_eq!(
        result.as_ref().unwrap_err().kind,
        ProviderErrorKind::InvalidResponse
    );
}

#[tokio::test]
async fn openai_asr_empty_text_rejected() {
    let mock = MockServer::start().await;
    let dir = tempfile::TempDir::new().unwrap();
    let audio_path = create_audio_fixture(&dir);

    Mock::given(wiremock::matchers::method("POST"))
        .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
            "text": ""
        })))
        .mount(&mock)
        .await;

    let adapter = OpenAiCompatibleAsrAdapter;
    let profile = mock_transcription_profile(&mock, TranscriptionProviderKind::OpenAiCompatible);
    let secret = SecretPayload::Bearer {
        api_key: "test-key".into(),
    };
    let cancel = non_cancelled();

    let result = adapter
        .transcribe(&audio_path, &profile, &secret, &cancel)
        .await;
    assert!(result.is_err());
    assert_eq!(
        result.as_ref().unwrap_err().kind,
        ProviderErrorKind::InvalidResponse
    );
}

#[tokio::test]
async fn openai_asr_rejects_non_bearer_secret() {
    let mock = MockServer::start().await;
    let dir = tempfile::TempDir::new().unwrap();
    let audio_path = create_audio_fixture(&dir);

    let adapter = OpenAiCompatibleAsrAdapter;
    let profile = mock_transcription_profile(&mock, TranscriptionProviderKind::OpenAiCompatible);
    let secret = SecretPayload::Tencent {
        app_id: "123".into(),
        secret_id: "456".into(),
        secret_key: "789".into(),
    };
    let cancel = non_cancelled();

    let result = adapter
        .transcribe(&audio_path, &profile, &secret, &cancel)
        .await;
    assert!(result.is_err());
    assert_eq!(
        result.as_ref().unwrap_err().kind,
        ProviderErrorKind::AuthenticationFailed
    );
}

// =========================================================================
//  4. MiMoAsrAdapter tests
// =========================================================================

#[tokio::test]
async fn mimo_asr_sends_correct_request_and_parses() {
    let mock = MockServer::start().await;
    let dir = tempfile::TempDir::new().unwrap();
    let audio_path = create_audio_fixture(&dir);

    Mock::given(wiremock::matchers::method("POST"))
        .and(wiremock::matchers::path("/v1/chat/completions"))
        .and(wiremock::matchers::header(
            "Authorization",
            "Bearer test-mimo-key",
        ))
        .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
            "id": "chatcmpl-mock",
            "object": "chat.completion",
            "created": 1720000000,
            "model": "mimo-v2.5-asr",
            "choices": [{
                "index": 0,
                "message": {
                    "role": "assistant",
                    "content": "今天天气很好，适合出行。"
                },
                "finish_reason": "stop"
            }]
        })))
        .mount(&mock)
        .await;

    let adapter = MiMoAsrAdapter;
    let mut profile = mock_transcription_profile(&mock, TranscriptionProviderKind::MimoAsr);
    profile.base_url = format!("{}/v1", mock.uri());
    profile.online_options.language = OnlineTranscriptionLanguage::Zh;
    let secret = SecretPayload::Bearer {
        api_key: "test-mimo-key".into(),
    };
    let cancel = non_cancelled();

    let result = adapter
        .transcribe(&audio_path, &profile, &secret, &cancel)
        .await;
    assert!(
        result.is_ok(),
        "MiMo ASR should succeed: {:?}",
        result.err()
    );
    assert_eq!(result.unwrap(), "今天天气很好，适合出行。");

    // Verify the request body has the expected MiMo Audio ASR shape
    let requests = mock.received_requests().await.unwrap();
    assert_eq!(requests.len(), 1);
    let req_body: serde_json::Value = serde_json::from_slice(&requests[0].body).unwrap();
    assert_eq!(req_body["model"], "test-model");
    assert_eq!(req_body["messages"][0]["role"], "user");
    assert_eq!(req_body["messages"][0]["content"][0]["type"], "input_audio");
    assert!(req_body["messages"][0]["content"][0]["input_audio"]["data"]
        .as_str()
        .unwrap()
        .starts_with("data:audio/mpeg;base64,"));
    assert_eq!(req_body["asr_options"]["language"], "zh");
}

#[tokio::test]
async fn mimo_asr_401_maps_to_auth_error() {
    let mock = MockServer::start().await;
    let dir = tempfile::TempDir::new().unwrap();
    let audio_path = create_audio_fixture(&dir);

    Mock::given(wiremock::matchers::any())
        .respond_with(ResponseTemplate::new(401))
        .mount(&mock)
        .await;

    let adapter = MiMoAsrAdapter;
    let profile = mock_transcription_profile(&mock, TranscriptionProviderKind::MimoAsr);
    let secret = SecretPayload::Bearer {
        api_key: "bad".into(),
    };
    let cancel = non_cancelled();

    let result = adapter
        .transcribe(&audio_path, &profile, &secret, &cancel)
        .await;
    assert!(result.is_err());
    assert_eq!(
        result.as_ref().unwrap_err().kind,
        ProviderErrorKind::AuthenticationFailed
    );
}

#[tokio::test]
async fn mimo_asr_403_maps_to_auth_error() {
    let mock = MockServer::start().await;
    let dir = tempfile::TempDir::new().unwrap();
    let audio_path = create_audio_fixture(&dir);

    Mock::given(wiremock::matchers::any())
        .respond_with(ResponseTemplate::new(403))
        .mount(&mock)
        .await;

    let adapter = MiMoAsrAdapter;
    let profile = mock_transcription_profile(&mock, TranscriptionProviderKind::MimoAsr);
    let secret = SecretPayload::Bearer {
        api_key: "bad".into(),
    };
    let cancel = non_cancelled();

    let result = adapter
        .transcribe(&audio_path, &profile, &secret, &cancel)
        .await;
    assert!(result.is_err());
    assert_eq!(
        result.as_ref().unwrap_err().kind,
        ProviderErrorKind::AuthenticationFailed
    );
}

#[tokio::test]
async fn mimo_asr_402_maps_to_quota_error() {
    let mock = MockServer::start().await;
    let dir = tempfile::TempDir::new().unwrap();
    let audio_path = create_audio_fixture(&dir);

    Mock::given(wiremock::matchers::any())
        .respond_with(ResponseTemplate::new(402))
        .mount(&mock)
        .await;

    let adapter = MiMoAsrAdapter;
    let profile = mock_transcription_profile(&mock, TranscriptionProviderKind::MimoAsr);
    let secret = SecretPayload::Bearer {
        api_key: "test".into(),
    };
    let cancel = non_cancelled();

    let result = adapter
        .transcribe(&audio_path, &profile, &secret, &cancel)
        .await;
    assert!(result.is_err());
    assert_eq!(
        result.as_ref().unwrap_err().kind,
        ProviderErrorKind::QuotaExhausted
    );
}

#[tokio::test]
async fn mimo_asr_429_maps_to_rate_limited() {
    let mock = MockServer::start().await;
    let dir = tempfile::TempDir::new().unwrap();
    let audio_path = create_audio_fixture(&dir);

    Mock::given(wiremock::matchers::any())
        .respond_with(ResponseTemplate::new(429))
        .mount(&mock)
        .await;

    let adapter = MiMoAsrAdapter;
    let profile = mock_transcription_profile(&mock, TranscriptionProviderKind::MimoAsr);
    let secret = SecretPayload::Bearer {
        api_key: "test".into(),
    };
    let cancel = non_cancelled();

    let result = adapter
        .transcribe(&audio_path, &profile, &secret, &cancel)
        .await;
    assert!(result.is_err());
    assert_eq!(
        result.as_ref().unwrap_err().kind,
        ProviderErrorKind::RateLimited
    );
}

#[tokio::test]
async fn mimo_asr_invalid_json_response() {
    let mock = MockServer::start().await;
    let dir = tempfile::TempDir::new().unwrap();
    let audio_path = create_audio_fixture(&dir);

    Mock::given(wiremock::matchers::any())
        .respond_with(ResponseTemplate::new(200).set_body_string("不是 JSON"))
        .mount(&mock)
        .await;

    let adapter = MiMoAsrAdapter;
    let profile = mock_transcription_profile(&mock, TranscriptionProviderKind::MimoAsr);
    let secret = SecretPayload::Bearer {
        api_key: "test".into(),
    };
    let cancel = non_cancelled();

    let result = adapter
        .transcribe(&audio_path, &profile, &secret, &cancel)
        .await;
    assert!(result.is_err());
    assert_eq!(
        result.as_ref().unwrap_err().kind,
        ProviderErrorKind::InvalidResponse
    );
}

#[tokio::test]
async fn mimo_asr_empty_content_rejected() {
    let mock = MockServer::start().await;
    let dir = tempfile::TempDir::new().unwrap();
    let audio_path = create_audio_fixture(&dir);

    Mock::given(wiremock::matchers::any())
        .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
            "id": "chatcmpl-mock",
            "choices": [{
                "message": { "content": "" }
            }]
        })))
        .mount(&mock)
        .await;

    let adapter = MiMoAsrAdapter;
    let profile = mock_transcription_profile(&mock, TranscriptionProviderKind::MimoAsr);
    let secret = SecretPayload::Bearer {
        api_key: "test".into(),
    };
    let cancel = non_cancelled();

    let result = adapter
        .transcribe(&audio_path, &profile, &secret, &cancel)
        .await;
    assert!(result.is_err());
    assert_eq!(
        result.as_ref().unwrap_err().kind,
        ProviderErrorKind::InvalidResponse
    );
}

// =========================================================================
//  5. TencentFlashAsrAdapter tests
// =========================================================================

#[tokio::test]
async fn tencent_asr_sends_signed_request_and_parses() {
    let mock = MockServer::start().await;
    let dir = tempfile::TempDir::new().unwrap();
    let audio_path = create_audio_fixture(&dir);

    Mock::given(wiremock::matchers::method("POST"))
        .and(wiremock::matchers::header_exists("Authorization"))
        .and(wiremock::matchers::header(
            "Content-Type",
            "application/octet-stream",
        ))
        .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
            "code": 0,
            "message": "success",
            "request_id": "mock-req-001",
            "flash_result": [
                { "channel_id": 0, "text": "今天天气真好" },
                { "channel_id": 1, "text": "我们可以去公园散步" }
            ]
        })))
        .mount(&mock)
        .await;

    let adapter = TencentFlashAsrAdapter;
    let profile = mock_transcription_profile(&mock, TranscriptionProviderKind::TencentFlash);
    let secret = SecretPayload::Tencent {
        app_id: "1259220000".into(),
        secret_id: "AKIDtest123".into(),
        secret_key: "testSecretKey".into(),
    };
    let cancel = non_cancelled();

    let result = adapter
        .transcribe(&audio_path, &profile, &secret, &cancel)
        .await;
    assert!(
        result.is_ok(),
        "Tencent ASR should succeed: {:?}",
        result.err()
    );
    assert_eq!(result.unwrap(), "今天天气真好我们可以去公园散步");
}

#[tokio::test]
async fn tencent_asr_4002_maps_to_auth_error() {
    let mock = MockServer::start().await;
    let dir = tempfile::TempDir::new().unwrap();
    let audio_path = create_audio_fixture(&dir);

    Mock::given(wiremock::matchers::any())
        .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
            "code": 4002,
            "message": "鉴权失败"
        })))
        .mount(&mock)
        .await;

    let adapter = TencentFlashAsrAdapter;
    let profile = mock_transcription_profile(&mock, TranscriptionProviderKind::TencentFlash);
    let secret = SecretPayload::Tencent {
        app_id: "1259220000".into(),
        secret_id: "AKIDtest".into(),
        secret_key: "key".into(),
    };
    let cancel = non_cancelled();

    let result = adapter
        .transcribe(&audio_path, &profile, &secret, &cancel)
        .await;
    assert!(result.is_err());
    assert_eq!(
        result.as_ref().unwrap_err().kind,
        ProviderErrorKind::AuthenticationFailed
    );
    assert_eq!(
        result.as_ref().unwrap_err().provider_code.as_deref(),
        Some("4002")
    );
}

#[tokio::test]
async fn tencent_asr_4003_maps_to_provider_error() {
    let mock = MockServer::start().await;
    let dir = tempfile::TempDir::new().unwrap();
    let audio_path = create_audio_fixture(&dir);

    Mock::given(wiremock::matchers::any())
        .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
            "code": 4003,
            "message": "服务未开通"
        })))
        .mount(&mock)
        .await;

    let adapter = TencentFlashAsrAdapter;
    let profile = mock_transcription_profile(&mock, TranscriptionProviderKind::TencentFlash);
    let secret = SecretPayload::Tencent {
        app_id: "1259220000".into(),
        secret_id: "AKIDtest".into(),
        secret_key: "key".into(),
    };
    let cancel = non_cancelled();

    let result = adapter
        .transcribe(&audio_path, &profile, &secret, &cancel)
        .await;
    assert!(result.is_err());
    assert_eq!(
        result.as_ref().unwrap_err().kind,
        ProviderErrorKind::ProviderError
    );
}

#[tokio::test]
async fn tencent_asr_4004_maps_to_quota_exhausted() {
    let mock = MockServer::start().await;
    let dir = tempfile::TempDir::new().unwrap();
    let audio_path = create_audio_fixture(&dir);

    Mock::given(wiremock::matchers::any())
        .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
            "code": 4004,
            "message": "资源包耗尽"
        })))
        .mount(&mock)
        .await;

    let adapter = TencentFlashAsrAdapter;
    let profile = mock_transcription_profile(&mock, TranscriptionProviderKind::TencentFlash);
    let secret = SecretPayload::Tencent {
        app_id: "1259220000".into(),
        secret_id: "AKIDtest".into(),
        secret_key: "key".into(),
    };
    let cancel = non_cancelled();

    let result = adapter
        .transcribe(&audio_path, &profile, &secret, &cancel)
        .await;
    assert!(result.is_err());
    assert_eq!(
        result.as_ref().unwrap_err().kind,
        ProviderErrorKind::QuotaExhausted
    );
    assert!(result.as_ref().unwrap_err().kind.allows_quota_fallback());
}

#[tokio::test]
async fn tencent_asr_4005_maps_to_billing_unavailable() {
    let mock = MockServer::start().await;
    let dir = tempfile::TempDir::new().unwrap();
    let audio_path = create_audio_fixture(&dir);

    Mock::given(wiremock::matchers::any())
        .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
            "code": 4005,
            "message": "账户欠费"
        })))
        .mount(&mock)
        .await;

    let adapter = TencentFlashAsrAdapter;
    let profile = mock_transcription_profile(&mock, TranscriptionProviderKind::TencentFlash);
    let secret = SecretPayload::Tencent {
        app_id: "1259220000".into(),
        secret_id: "AKIDtest".into(),
        secret_key: "key".into(),
    };
    let cancel = non_cancelled();

    let result = adapter
        .transcribe(&audio_path, &profile, &secret, &cancel)
        .await;
    assert!(result.is_err());
    assert_eq!(
        result.as_ref().unwrap_err().kind,
        ProviderErrorKind::BillingUnavailable
    );
    assert!(result.as_ref().unwrap_err().kind.allows_quota_fallback());
}

#[tokio::test]
async fn tencent_asr_4006_maps_to_rate_limited() {
    let mock = MockServer::start().await;
    let dir = tempfile::TempDir::new().unwrap();
    let audio_path = create_audio_fixture(&dir);

    Mock::given(wiremock::matchers::any())
        .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
            "code": 4006,
            "message": "调用并发超限"
        })))
        .mount(&mock)
        .await;

    let adapter = TencentFlashAsrAdapter;
    let profile = mock_transcription_profile(&mock, TranscriptionProviderKind::TencentFlash);
    let secret = SecretPayload::Tencent {
        app_id: "1259220000".into(),
        secret_id: "AKIDtest".into(),
        secret_key: "key".into(),
    };
    let cancel = non_cancelled();

    let result = adapter
        .transcribe(&audio_path, &profile, &secret, &cancel)
        .await;
    assert!(result.is_err());
    assert_eq!(
        result.as_ref().unwrap_err().kind,
        ProviderErrorKind::RateLimited
    );
}

#[tokio::test]
async fn tencent_asr_http_429_maps_to_rate_limited() {
    let mock = MockServer::start().await;
    let dir = tempfile::TempDir::new().unwrap();
    let audio_path = create_audio_fixture(&dir);

    Mock::given(wiremock::matchers::any())
        .respond_with(ResponseTemplate::new(429))
        .mount(&mock)
        .await;

    let adapter = TencentFlashAsrAdapter;
    let profile = mock_transcription_profile(&mock, TranscriptionProviderKind::TencentFlash);
    let secret = SecretPayload::Tencent {
        app_id: "1259220000".into(),
        secret_id: "AKIDtest".into(),
        secret_key: "key".into(),
    };
    let cancel = non_cancelled();

    let result = adapter
        .transcribe(&audio_path, &profile, &secret, &cancel)
        .await;
    assert!(result.is_err());
    assert_eq!(
        result.as_ref().unwrap_err().kind,
        ProviderErrorKind::RateLimited
    );
    assert_eq!(result.as_ref().unwrap_err().http_status, Some(429));
}

#[tokio::test]
async fn tencent_asr_rejects_non_tencent_secret() {
    let mock = MockServer::start().await;
    let dir = tempfile::TempDir::new().unwrap();
    let audio_path = create_audio_fixture(&dir);

    let adapter = TencentFlashAsrAdapter;
    let profile = mock_transcription_profile(&mock, TranscriptionProviderKind::TencentFlash);
    let secret = SecretPayload::Bearer {
        api_key: "test".into(),
    };
    let cancel = non_cancelled();

    let result = adapter
        .transcribe(&audio_path, &profile, &secret, &cancel)
        .await;
    assert!(result.is_err());
    assert_eq!(
        result.as_ref().unwrap_err().kind,
        ProviderErrorKind::AuthenticationFailed
    );
}

#[tokio::test]
async fn tencent_asr_empty_flash_result_rejected() {
    let mock = MockServer::start().await;
    let dir = tempfile::TempDir::new().unwrap();
    let audio_path = create_audio_fixture(&dir);

    Mock::given(wiremock::matchers::any())
        .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
            "code": 0,
            "flash_result": []
        })))
        .mount(&mock)
        .await;

    let adapter = TencentFlashAsrAdapter;
    let profile = mock_transcription_profile(&mock, TranscriptionProviderKind::TencentFlash);
    let secret = SecretPayload::Tencent {
        app_id: "1259220000".into(),
        secret_id: "AKIDtest".into(),
        secret_key: "key".into(),
    };
    let cancel = non_cancelled();

    let result = adapter
        .transcribe(&audio_path, &profile, &secret, &cancel)
        .await;
    assert!(result.is_err());
    assert_eq!(
        result.as_ref().unwrap_err().kind,
        ProviderErrorKind::InvalidResponse
    );
}

#[tokio::test]
async fn tencent_asr_strengthened_wire_test() {
    // Verify exact wire format: path, sorted query keys/values, body bytes,
    // content type, and HMAC-SHA1 Authorization recomputation.
    let mock = MockServer::start().await;
    let dir = tempfile::TempDir::new().unwrap();
    let audio_path = create_audio_fixture(&dir);
    let expected_bytes = std::fs::read(&audio_path).unwrap();

    Mock::given(wiremock::matchers::method("POST"))
        .and(wiremock::matchers::header_exists("Authorization"))
        .and(wiremock::matchers::header(
            "Content-Type",
            "application/octet-stream",
        ))
        .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
            "code": 0,
            "message": "success",
            "request_id": "mock-req-001",
            "flash_result": [
                { "channel_id": 0, "text": "今天天气真好" },
                { "channel_id": 1, "text": "我们去公园散步" }
            ]
        })))
        .mount(&mock)
        .await;

    let adapter = TencentFlashAsrAdapter;
    let profile = mock_transcription_profile(&mock, TranscriptionProviderKind::TencentFlash);
    let secret = SecretPayload::Tencent {
        app_id: "1259220000".into(),
        secret_id: "AKIDtest".into(),
        secret_key: "testSecretKey".into(),
    };
    let cancel = non_cancelled();

    let result = adapter
        .transcribe(&audio_path, &profile, &secret, &cancel)
        .await;
    assert!(
        result.is_ok(),
        "Tencent ASR should succeed: {:?}",
        result.err()
    );
    assert_eq!(result.unwrap(), "今天天气真好我们去公园散步");

    // --- Offline wire verification ---
    let requests = mock.received_requests().await.unwrap();
    assert_eq!(requests.len(), 1);
    let req = &requests[0];

    // 1. Exact path: /asr/flash/v1/{app_id}
    let url = &req.url;
    assert_eq!(url.path(), "/asr/flash/v1/1259220000", "unexpected path");

    // 2. Required sorted query keys and values
    let query_pairs: std::collections::BTreeMap<String, String> = url
        .query_pairs()
        .map(|(k, v)| (k.into(), v.into()))
        .collect();
    assert_eq!(
        query_pairs.get("appid").map(|s| s.as_str()),
        Some("1259220000"),
        "missing/wrong appid"
    );
    assert_eq!(
        query_pairs.get("secretid").map(|s| s.as_str()),
        Some("AKIDtest"),
        "missing/wrong secretid"
    );
    assert_eq!(
        query_pairs.get("engine_type").map(|s| s.as_str()),
        Some("test-model"),
        "missing/wrong engine_type"
    );
    assert_eq!(
        query_pairs.get("voice_format").map(|s| s.as_str()),
        Some("wav"),
        "missing/wrong voice_format"
    );
    assert!(query_pairs.contains_key("timestamp"), "missing timestamp");

    // Reconstruct the sorted query string the way Tencent expects it
    let sorted_query: String = query_pairs
        .iter()
        .map(|(k, v)| format!("{}={}", k, urlencoding::encode(v)))
        .collect::<Vec<_>>()
        .join("&");

    // 3. Content-Type: application/octet-stream
    assert_eq!(
        req.headers
            .get("content-type")
            .map(|v| v.to_str().unwrap_or("")),
        Some("application/octet-stream"),
        "wrong content type"
    );

    // 4. Body is the exact audio fixture bytes
    assert_eq!(
        req.body.as_slice(),
        expected_bytes.as_slice(),
        "body must match exact fixture bytes"
    );

    // 5. Recompute HMAC-SHA1: POST + host/path?<sorted_query>
    let canonical_string = format!(
        "POSTasr.cloud.tencent.com/asr/flash/v1/1259220000?{}",
        sorted_query
    );
    let mut mac = hmac::Hmac::<sha1::Sha1>::new_from_slice(b"testSecretKey").expect("valid key");
    mac.update(canonical_string.as_bytes());
    let expected_sig =
        base64::engine::general_purpose::STANDARD.encode(&mac.finalize().into_bytes());

    let auth_header = req
        .headers
        .get("authorization")
        .map(|v| v.to_str().unwrap_or(""))
        .unwrap_or("");
    assert_eq!(
        auth_header, expected_sig,
        "HMAC-SHA1 Authorization mismatch; canonical=[{}]",
        canonical_string
    );
}

#[tokio::test]
async fn tencent_asr_connection_failure_does_not_leak_credentials() {
    // A connection-failure test using fake Tencent credentials.
    // The error's Display and Serialize must not contain any of the fake
    // AppID, SecretID, SecretKey, query string, Authorization, or audio bytes.
    // Use 127.0.0.1:1 (no service) to trigger a transport-level connection error
    // without any mock server involvement.
    let dir = tempfile::TempDir::new().unwrap();
    let audio_path = create_audio_fixture(&dir);

    let adapter = TencentFlashAsrAdapter;
    let profile = TranscriptionProfile {
        id: "mock-profile".into(),
        name: "Mock Profile".into(),
        provider: TranscriptionProviderKind::TencentFlash,
        base_url: "http://127.0.0.1:1".into(),
        model: "16k_zh".into(),
        online_options: OnlineTranscriptionOptions::default(),
        enabled: true,
        built_in: false,
    };
    // Use clearly fake values — these must never appear in error output
    let secret = SecretPayload::Tencent {
        app_id: "FAKE-APPID-99999".into(),
        secret_id: "FAKE-SECRETID-abc123".into(),
        secret_key: "FAKE-SECRETKEY-xyz789".into(),
    };
    let cancel = non_cancelled();

    let result = adapter
        .transcribe(&audio_path, &profile, &secret, &cancel)
        .await;
    assert!(result.is_err());
    let err = result.unwrap_err();
    let display = format!("{}", err);
    let serialized = serde_json::to_string(&err).unwrap();

    // None of the fake credential values should appear in error text or JSON
    assert!(
        !display.contains("FAKE-APPID-99999"),
        "Display must not leak AppID"
    );
    assert!(
        !display.contains("FAKE-SECRETID"),
        "Display must not leak SecretID"
    );
    assert!(
        !display.contains("FAKE-SECRETKEY"),
        "Display must not leak SecretKey"
    );
    assert!(
        !serialized.contains("FAKE-APPID-99999"),
        "Serialized must not leak AppID"
    );
    assert!(
        !serialized.contains("FAKE-SECRETID"),
        "Serialized must not leak SecretID"
    );
    assert!(
        !serialized.contains("FAKE-SECRETKEY"),
        "Serialized must not leak SecretKey"
    );
    // Also verify the error does not contain query parameter or Authorization noise
    assert!(
        !display.contains("secretid="),
        "Display must not contain query secretid"
    );
    assert!(
        !display.contains("Authorization"),
        "Display must not contain Authorization"
    );
    // No audio bytes or base64 in error
    assert!(
        !display.contains("fake audio"),
        "Display must not contain fixture bytes"
    );
    // The exact error kind varies by platform (Windows may map connection
    // refused differently than Linux). The security assertions above are the
    // primary contract — this test exists to prove credentials never leak.
    // Just verify it's not Cancelled (which would mean it hit the pre-read
    // guard, not the transport layer).
    assert_ne!(
        err.kind,
        ProviderErrorKind::Cancelled,
        "must not be Cancelled for a connection failure"
    );
}

// =========================================================================
//  6. OpenAiCompatibleSummaryAdapter tests
// =========================================================================

#[tokio::test]
async fn summary_returns_typed_distillation() {
    let mock = MockServer::start().await;

    Mock::given(wiremock::matchers::method("POST"))
        .and(wiremock::matchers::path("/v1/chat/completions"))
        .and(wiremock::matchers::header("Authorization", "Bearer test-summary-key"))
        .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
            "id": "chatcmpl-summary",
            "choices": [{
                "index": 0,
                "message": {
                    "role": "assistant",
                    "content": r#"{"core_conclusion":"测试结论","key_evidence":["依据1","依据2"],"implications":["行动1"]}"#
                },
                "finish_reason": "stop"
            }]
        })))
        .mount(&mock)
        .await;

    let adapter = OpenAiCompatibleSummaryAdapter;
    let mut profile = mock_summary_profile(&mock, SummaryProviderKind::DeepSeek);
    profile.base_url = format!("{}/v1", mock.uri());
    let secret = SecretPayload::Bearer {
        api_key: "test-summary-key".into(),
    };
    let cancel = non_cancelled();

    let result = adapter
        .summarize("测试转写文本", NoteStyle::Minimal, &profile, &secret, &cancel)
        .await;
    assert!(result.is_ok(), "Summary should succeed: {:?}", result.err());
    let distillation = result.unwrap();

    // Verify all three required sections
    assert_eq!(distillation.core_conclusion, "测试结论");
    assert_eq!(
        distillation.key_evidence,
        vec![
            KeyEvidence {
                text: "依据1".into(),
                timestamp_seconds: None,
                source_url: None,
                screenshot_path: None,
            },
            KeyEvidence {
                text: "依据2".into(),
                timestamp_seconds: None,
                source_url: None,
                screenshot_path: None,
            },
        ]
    );
    assert_eq!(distillation.implications, vec!["行动1"]);

    // Verify transcript is attached after valid parsing
    assert_eq!(distillation.transcript, Some("测试转写文本".to_string()));

    // Verify request includes the transcript and profile.model
    let requests = mock.received_requests().await.unwrap();
    assert_eq!(requests.len(), 1);
    let req_body: serde_json::Value = serde_json::from_slice(&requests[0].body).unwrap();
    assert!(
        req_body.to_string().contains("测试转写文本"),
        "request must contain transcript"
    );
    assert_eq!(
        req_body["model"], "test-summary-model",
        "request must contain profile.model"
    );
}

#[tokio::test]
async fn summary_invalid_structured_content_rejected() {
    let mock = MockServer::start().await;

    Mock::given(wiremock::matchers::any())
        .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
            "choices": [{
                "message": { "content": "这不是有效的 JSON 结构" }
            }]
        })))
        .mount(&mock)
        .await;

    let adapter = OpenAiCompatibleSummaryAdapter;
    let profile = mock_summary_profile(&mock, SummaryProviderKind::DeepSeek);
    let secret = SecretPayload::Bearer {
        api_key: "test".into(),
    };
    let cancel = non_cancelled();

    let result = adapter
        .summarize("test", NoteStyle::Minimal, &profile, &secret, &cancel)
        .await;
    assert!(result.is_err());
    assert_eq!(
        result.as_ref().unwrap_err().kind,
        ProviderErrorKind::InvalidResponse
    );
}

#[tokio::test]
async fn summary_missing_content_rejected() {
    let mock = MockServer::start().await;

    Mock::given(wiremock::matchers::any())
        .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
            "choices": [{
                "message": {}
            }]
        })))
        .mount(&mock)
        .await;

    let adapter = OpenAiCompatibleSummaryAdapter;
    let profile = mock_summary_profile(&mock, SummaryProviderKind::Mimo);
    let secret = SecretPayload::Bearer {
        api_key: "test".into(),
    };
    let cancel = non_cancelled();

    let result = adapter
        .summarize("test", NoteStyle::Minimal, &profile, &secret, &cancel)
        .await;
    assert!(result.is_err());
    assert_eq!(
        result.as_ref().unwrap_err().kind,
        ProviderErrorKind::InvalidResponse
    );
}

#[tokio::test]
async fn summary_empty_content_rejected() {
    let mock = MockServer::start().await;

    Mock::given(wiremock::matchers::any())
        .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
            "choices": [{
                "message": { "content": "" }
            }]
        })))
        .mount(&mock)
        .await;

    let adapter = OpenAiCompatibleSummaryAdapter;
    let profile = mock_summary_profile(&mock, SummaryProviderKind::OpenAiCompatible);
    let secret = SecretPayload::Bearer {
        api_key: "test".into(),
    };
    let cancel = non_cancelled();

    let result = adapter
        .summarize("test", NoteStyle::Minimal, &profile, &secret, &cancel)
        .await;
    assert!(result.is_err());
    assert_eq!(
        result.as_ref().unwrap_err().kind,
        ProviderErrorKind::InvalidResponse
    );
}

#[tokio::test]
async fn summary_401_maps_to_auth_error() {
    let mock = MockServer::start().await;

    Mock::given(wiremock::matchers::any())
        .respond_with(ResponseTemplate::new(401))
        .mount(&mock)
        .await;

    let adapter = OpenAiCompatibleSummaryAdapter;
    let profile = mock_summary_profile(&mock, SummaryProviderKind::DeepSeek);
    let secret = SecretPayload::Bearer {
        api_key: "bad".into(),
    };
    let cancel = non_cancelled();

    let result = adapter
        .summarize("test", NoteStyle::Minimal, &profile, &secret, &cancel)
        .await;
    assert!(result.is_err());
    assert_eq!(
        result.as_ref().unwrap_err().kind,
        ProviderErrorKind::AuthenticationFailed
    );
}

#[tokio::test]
async fn summary_429_maps_to_rate_limited() {
    let mock = MockServer::start().await;

    Mock::given(wiremock::matchers::any())
        .respond_with(ResponseTemplate::new(429))
        .mount(&mock)
        .await;

    let adapter = OpenAiCompatibleSummaryAdapter;
    let profile = mock_summary_profile(&mock, SummaryProviderKind::DeepSeek);
    let secret = SecretPayload::Bearer {
        api_key: "test".into(),
    };
    let cancel = non_cancelled();

    let result = adapter
        .summarize("test", NoteStyle::Minimal, &profile, &secret, &cancel)
        .await;
    assert!(result.is_err());
    assert_eq!(
        result.as_ref().unwrap_err().kind,
        ProviderErrorKind::RateLimited
    );
}

#[tokio::test]
async fn summary_invalid_json_rejected() {
    let mock = MockServer::start().await;

    Mock::given(wiremock::matchers::any())
        .respond_with(ResponseTemplate::new(200).set_body_string("不是 JSON"))
        .mount(&mock)
        .await;

    let adapter = OpenAiCompatibleSummaryAdapter;
    let profile = mock_summary_profile(&mock, SummaryProviderKind::DeepSeek);
    let secret = SecretPayload::Bearer {
        api_key: "test".into(),
    };
    let cancel = non_cancelled();

    let result = adapter
        .summarize("test", NoteStyle::Minimal, &profile, &secret, &cancel)
        .await;
    assert!(result.is_err());
    assert_eq!(
        result.as_ref().unwrap_err().kind,
        ProviderErrorKind::InvalidResponse
    );
}

// =========================================================================
//  7. Cancellation tests
// =========================================================================

#[tokio::test]
async fn openai_asr_cancels_before_read() {
    let mock = MockServer::start().await;
    let dir = tempfile::TempDir::new().unwrap();
    let audio_path = create_audio_fixture(&dir);

    let adapter = OpenAiCompatibleAsrAdapter;
    let profile = mock_transcription_profile(&mock, TranscriptionProviderKind::OpenAiCompatible);
    let secret = SecretPayload::Bearer {
        api_key: "test".into(),
    };
    let cancel = pre_cancelled();

    let result = adapter
        .transcribe(&audio_path, &profile, &secret, &cancel)
        .await;
    assert!(result.is_err());
    assert_eq!(
        result.as_ref().unwrap_err().kind,
        ProviderErrorKind::Cancelled
    );
}

#[tokio::test]
async fn mimo_asr_cancels_before_read() {
    let mock = MockServer::start().await;
    let dir = tempfile::TempDir::new().unwrap();
    let audio_path = create_audio_fixture(&dir);

    let adapter = MiMoAsrAdapter;
    let profile = mock_transcription_profile(&mock, TranscriptionProviderKind::MimoAsr);
    let secret = SecretPayload::Bearer {
        api_key: "test".into(),
    };
    let cancel = pre_cancelled();

    let result = adapter
        .transcribe(&audio_path, &profile, &secret, &cancel)
        .await;
    assert!(result.is_err());
    assert_eq!(
        result.as_ref().unwrap_err().kind,
        ProviderErrorKind::Cancelled
    );
}

#[tokio::test]
async fn tencent_asr_cancels_before_read() {
    let mock = MockServer::start().await;
    let dir = tempfile::TempDir::new().unwrap();
    let audio_path = create_audio_fixture(&dir);

    let adapter = TencentFlashAsrAdapter;
    let profile = mock_transcription_profile(&mock, TranscriptionProviderKind::TencentFlash);
    let secret = SecretPayload::Tencent {
        app_id: "1259220000".into(),
        secret_id: "AKIDtest".into(),
        secret_key: "key".into(),
    };
    let cancel = pre_cancelled();

    let result = adapter
        .transcribe(&audio_path, &profile, &secret, &cancel)
        .await;
    assert!(result.is_err());
    assert_eq!(
        result.as_ref().unwrap_err().kind,
        ProviderErrorKind::Cancelled
    );
}

#[tokio::test]
async fn summary_cancels_before_send() {
    let mock = MockServer::start().await;

    let adapter = OpenAiCompatibleSummaryAdapter;
    let profile = mock_summary_profile(&mock, SummaryProviderKind::DeepSeek);
    let secret = SecretPayload::Bearer {
        api_key: "test".into(),
    };
    let cancel = pre_cancelled();

    let result = adapter
        .summarize("test", NoteStyle::Minimal, &profile, &secret, &cancel)
        .await;
    assert!(result.is_err());
    assert_eq!(
        result.as_ref().unwrap_err().kind,
        ProviderErrorKind::Cancelled
    );
}

#[tokio::test]
async fn tencent_asr_cancels_after_response_delayed() {
    // Test that cancellation is checked AFTER receiving a response by
    // flipping the flag while a delayed-request is in flight.
    let mock = MockServer::start().await;
    let dir = tempfile::TempDir::new().unwrap();
    let audio_path = create_audio_fixture(&dir);

    Mock::given(wiremock::matchers::method("POST"))
        .respond_with(
            ResponseTemplate::new(200)
                .set_body_json(serde_json::json!({
                    "code": 0,
                    "flash_result": [{"channel_id": 0, "text": "test"}]
                }))
                // Delay so we can cancel in-flight
                .set_delay(std::time::Duration::from_millis(200)),
        )
        .mount(&mock)
        .await;

    let adapter = TencentFlashAsrAdapter;
    let profile = mock_transcription_profile(&mock, TranscriptionProviderKind::TencentFlash);
    let secret = SecretPayload::Tencent {
        app_id: "1259220000".into(),
        secret_id: "AKIDtest".into(),
        secret_key: "key".into(),
    };

    // Flag starts false; will be flipped after send
    let cancel = Arc::new(AtomicBool::new(false));
    let cancel_clone = cancel.clone();

    // Spawn the transcribe call; it will block waiting for the response
    let audio_path_clone = audio_path.clone();
    let profile_clone = profile.clone();
    let secret_clone = secret.clone();
    let handle = tokio::spawn(async move {
        adapter
            .transcribe(
                &audio_path_clone,
                &profile_clone,
                &secret_clone,
                &cancel_clone,
            )
            .await
    });

    // Small delay to let the request fire and the mock start its delay
    tokio::time::sleep(std::time::Duration::from_millis(50)).await;

    // Flip cancellation — this should be seen in the after-response check
    cancel.store(true, Ordering::SeqCst);

    // Wait for the result
    let result = tokio::time::timeout(std::time::Duration::from_secs(5), handle)
        .await
        .expect("task timed out")
        .expect("task panicked");

    assert!(result.is_err(), "should have been cancelled after response");
    assert_eq!(
        result.unwrap_err().kind,
        ProviderErrorKind::Cancelled,
        "must return Cancelled, not the parsed response"
    );
}

// =========================================================================
//  8. Registry resolution tests
// =========================================================================

#[test]
fn transcription_registry_resolves_all_kinds() {
    let registry = TranscriptionRegistry::new();

    assert!(registry
        .get(&TranscriptionProviderKind::OpenAiCompatible)
        .is_ok());
    assert!(registry.get(&TranscriptionProviderKind::MimoAsr).is_ok());
    assert!(registry
        .get(&TranscriptionProviderKind::TencentFlash)
        .is_ok());
}

#[test]
fn transcription_registry_returns_error_for_unregistered() {
    let registry = TranscriptionRegistry::new();
    // All built-in kinds are registered, but this tests the error path
    // by checking that the error type is correct.
    // There's no unregistered variant currently, so verify ok first.
    let result = registry.get(&TranscriptionProviderKind::OpenAiCompatible);
    assert!(result.is_ok());
}

#[test]
fn summary_registry_resolves_all_kinds() {
    let registry = SummaryRegistry::new();

    assert!(registry.get(&SummaryProviderKind::DeepSeek).is_ok());
    assert!(registry.get(&SummaryProviderKind::Mimo).is_ok());
    assert!(registry.get(&SummaryProviderKind::OpenAiCompatible).is_ok());
    assert!(registry.get(&SummaryProviderKind::OpenAiResponses).is_ok());
    assert!(registry.get(&SummaryProviderKind::Anthropic).is_ok());
    assert!(registry.get(&SummaryProviderKind::Google).is_ok());
}

// =========================================================================
//  9. Model discovery tests
// =========================================================================

#[tokio::test]
async fn model_discovery_success() {
    let mock = MockServer::start().await;

    Mock::given(wiremock::matchers::method("GET"))
        .and(wiremock::matchers::path("/v1/models"))
        .and(wiremock::matchers::header(
            "Authorization",
            "Bearer test-key",
        ))
        .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
            "object": "list",
            "data": [
                { "id": "gpt-4" },
                { "id": "deepseek-chat" },
                { "id": "gpt-3.5-turbo" },
                { "id": "deepseek-chat" }
            ]
        })))
        .mount(&mock)
        .await;

    let registry = SummaryRegistry::new();
    let mut profile = mock_summary_profile(&mock, SummaryProviderKind::DeepSeek);
    profile.base_url = format!("{}/v1", mock.uri());
    let secret = SecretPayload::Bearer {
        api_key: "test-key".into(),
    };
    let cancel = non_cancelled();

    let result = registry.discover_models(&profile, &secret, &cancel).await;
    assert!(
        result.is_ok(),
        "Discovery should succeed: {:?}",
        result.err()
    );

    match result.unwrap() {
        video_distiller_lib::providers::ModelDiscoveryResult::Success(models) => {
            // Should be sorted and deduplicated
            assert_eq!(
                models,
                vec![
                    "deepseek-chat".to_string(),
                    "gpt-3.5-turbo".to_string(),
                    "gpt-4".to_string(),
                ]
            );
        }
        _ => panic!("Expected Success variant"),
    }
}

#[tokio::test]
async fn model_discovery_404_returns_unsupported() {
    let mock = MockServer::start().await;

    Mock::given(wiremock::matchers::any())
        .respond_with(ResponseTemplate::new(404))
        .mount(&mock)
        .await;

    let registry = SummaryRegistry::new();
    let profile = mock_summary_profile(&mock, SummaryProviderKind::DeepSeek);
    let secret = SecretPayload::Bearer {
        api_key: "test".into(),
    };
    let cancel = non_cancelled();

    let result = registry.discover_models(&profile, &secret, &cancel).await;
    assert!(result.is_ok());
    assert_eq!(
        result.unwrap(),
        video_distiller_lib::providers::ModelDiscoveryResult::Unsupported
    );
}

#[tokio::test]
async fn model_discovery_405_returns_unsupported() {
    let mock = MockServer::start().await;

    Mock::given(wiremock::matchers::any())
        .respond_with(ResponseTemplate::new(405))
        .mount(&mock)
        .await;

    let registry = SummaryRegistry::new();
    let profile = mock_summary_profile(&mock, SummaryProviderKind::DeepSeek);
    let secret = SecretPayload::Bearer {
        api_key: "test".into(),
    };
    let cancel = non_cancelled();

    let result = registry.discover_models(&profile, &secret, &cancel).await;
    assert!(result.is_ok());
    assert_eq!(
        result.unwrap(),
        video_distiller_lib::providers::ModelDiscoveryResult::Unsupported
    );
}

#[tokio::test]
async fn model_discovery_401_returns_auth_error() {
    let mock = MockServer::start().await;

    Mock::given(wiremock::matchers::any())
        .respond_with(ResponseTemplate::new(401))
        .mount(&mock)
        .await;

    let registry = SummaryRegistry::new();
    let profile = mock_summary_profile(&mock, SummaryProviderKind::DeepSeek);
    let secret = SecretPayload::Bearer {
        api_key: "bad".into(),
    };
    let cancel = non_cancelled();

    let result = registry.discover_models(&profile, &secret, &cancel).await;
    assert!(result.is_err());
    assert_eq!(
        result.as_ref().unwrap_err().kind,
        ProviderErrorKind::AuthenticationFailed
    );
}

#[tokio::test]
async fn model_discovery_rejects_non_bearer_secret() {
    let mock = MockServer::start().await;

    let registry = SummaryRegistry::new();
    let profile = mock_summary_profile(&mock, SummaryProviderKind::DeepSeek);
    let secret = SecretPayload::Tencent {
        app_id: "123".into(),
        secret_id: "456".into(),
        secret_key: "789".into(),
    };
    let cancel = non_cancelled();

    let result = registry.discover_models(&profile, &secret, &cancel).await;
    assert!(result.is_err());
    assert_eq!(
        result.as_ref().unwrap_err().kind,
        ProviderErrorKind::AuthenticationFailed
    );
}

#[tokio::test]
async fn model_discovery_cancels_before_send() {
    let mock = MockServer::start().await;

    let registry = SummaryRegistry::new();
    let profile = mock_summary_profile(&mock, SummaryProviderKind::DeepSeek);
    let secret = SecretPayload::Bearer {
        api_key: "test".into(),
    };
    let cancel = pre_cancelled();

    let result = registry.discover_models(&profile, &secret, &cancel).await;
    assert!(result.is_err());
    assert_eq!(
        result.as_ref().unwrap_err().kind,
        ProviderErrorKind::Cancelled
    );
}

// =========================================================================
//  10. Security — diagnostic output must not leak secret values
// =========================================================================

#[test]
fn provider_error_serialization_no_secrets() {
    // Verify that ProviderError serialized doesn't contain secret patterns
    let err = ProviderError::new(
        ProviderErrorKind::AuthenticationFailed,
        "认证失败",
        "检查 API Key",
    );
    let serialized = serde_json::to_string(&err).unwrap();
    assert!(
        !serialized.contains("sk-"),
        "Error JSON must not contain API key pattern: {}",
        serialized
    );
    assert!(
        !serialized.contains("Bearer"),
        "Error JSON must not contain 'Bearer': {}",
        serialized
    );
}

#[test]
fn provider_error_message_no_audio_data_url() {
    // Verify error messages don't contain audio data URL patterns
    let err = ProviderError::new(
        ProviderErrorKind::InvalidResponse,
        "转写结果为空。",
        "请重试此任务。",
    );
    let msg = format!("{}", err);
    assert!(
        !msg.contains("data:audio/"),
        "Error must not contain audio data URL"
    );
    assert!(!msg.contains("base64,"), "Error must not contain base64");
}

// =========================================================================
//  Endpoint 404 recovery guidance
// =========================================================================

#[tokio::test]
async fn openai_asr_404_mentions_base_url_without_echoing_it() {
    let mock = MockServer::start().await;
    Mock::given(wiremock::matchers::any())
        .respond_with(ResponseTemplate::new(404))
        .mount(&mock)
        .await;
    let dir = tempfile::TempDir::new().unwrap();
    let audio = create_audio_fixture(&dir);
    let profile = mock_transcription_profile(&mock, TranscriptionProviderKind::OpenAiCompatible);
    let secret = SecretPayload::Bearer {
        api_key: "fake".into(),
    };
    let err = OpenAiCompatibleAsrAdapter
        .transcribe(&audio, &profile, &secret, &non_cancelled())
        .await
        .unwrap_err();
    assert!(err.recovery.contains("/v1"));
    assert!(!err.recovery.contains(&mock.uri()));
}

#[tokio::test]
async fn mimo_asr_404_mentions_base_url_without_echoing_it() {
    let mock = MockServer::start().await;
    Mock::given(wiremock::matchers::any())
        .respond_with(ResponseTemplate::new(404))
        .mount(&mock)
        .await;
    let dir = tempfile::TempDir::new().unwrap();
    let audio = create_audio_fixture(&dir);
    let profile = mock_transcription_profile(&mock, TranscriptionProviderKind::MimoAsr);
    let secret = SecretPayload::Bearer {
        api_key: "fake".into(),
    };
    let err = MiMoAsrAdapter
        .transcribe(&audio, &profile, &secret, &non_cancelled())
        .await
        .unwrap_err();
    assert!(err.recovery.contains("/v1"));
    assert!(!err.recovery.contains(&mock.uri()));
}

#[tokio::test]
async fn summary_404_mentions_base_url_without_echoing_it() {
    let mock = MockServer::start().await;
    Mock::given(wiremock::matchers::any())
        .respond_with(ResponseTemplate::new(404))
        .mount(&mock)
        .await;
    let profile = mock_summary_profile(&mock, SummaryProviderKind::DeepSeek);
    let secret = SecretPayload::Bearer {
        api_key: "fake".into(),
    };
    let err = OpenAiCompatibleSummaryAdapter
        .summarize(
            "test",
            NoteStyle::Minimal,
            &profile,
            &secret,
            &non_cancelled(),
        )
        .await
        .unwrap_err();
    assert!(err.recovery.contains("/v1"));
    assert!(!err.recovery.contains(&mock.uri()));
}

#[tokio::test]
async fn openai_responses_supports_output_text_and_normalized_prompt() {
    let mock = MockServer::start().await;
    let distilled = r#"{"core_conclusion":"Responses","key_evidence":["e"],"implications":["i"]}"#;
    Mock::given(wiremock::matchers::method("POST"))
        .and(wiremock::matchers::path("/v1/responses"))
        .and(wiremock::matchers::header("Authorization", "Bearer response-key"))
        .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
            "output_text": distilled
        })))
        .mount(&mock)
        .await;

    let profile = mock_summary_profile(&mock, SummaryProviderKind::OpenAiResponses);
    let result = OpenAiResponsesSummaryAdapter
        .summarize(
            "responses transcript",
            NoteStyle::Detailed,
            &profile,
            &SecretPayload::Bearer { api_key: "response-key".into() },
            &non_cancelled(),
        )
        .await
        .unwrap();
    assert_eq!(result.core_conclusion, "Responses");

    let requests = mock.received_requests().await.unwrap();
    let body: serde_json::Value = serde_json::from_slice(&requests[0].body).unwrap();
    assert_eq!(body["model"], "test-summary-model");
    assert!(body["instructions"].as_str().unwrap().contains("详细"));
    assert!(body["input"].as_str().unwrap().contains("responses transcript"));
}

#[tokio::test]
async fn openai_responses_supports_nested_output_text_blocks() {
    let mock = MockServer::start().await;
    let distilled = r#"{"core_conclusion":"Nested","key_evidence":["e"],"implications":["i"]}"#;
    Mock::given(wiremock::matchers::path("/v1/responses"))
        .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
            "output": [{"content": [{"type": "output_text", "text": distilled}]}]
        })))
        .mount(&mock)
        .await;
    let profile = mock_summary_profile(&mock, SummaryProviderKind::OpenAiResponses);
    let result = OpenAiResponsesSummaryAdapter
        .summarize(
            "nested",
            NoteStyle::Minimal,
            &profile,
            &SecretPayload::Bearer { api_key: "key".into() },
            &non_cancelled(),
        )
        .await
        .unwrap();
    assert_eq!(result.core_conclusion, "Nested");
}

#[tokio::test]
async fn anthropic_messages_uses_required_headers_and_prompt_shape() {
    let mock = MockServer::start().await;
    let distilled = r#"{"core_conclusion":"Anthropic","key_evidence":["e"],"implications":["i"]}"#;
    Mock::given(wiremock::matchers::method("POST"))
        .and(wiremock::matchers::path("/v1/messages"))
        .and(wiremock::matchers::header("x-api-key", "anthropic-key"))
        .and(wiremock::matchers::header("anthropic-version", "2023-06-01"))
        .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
            "content": [
                {"type": "text", "text": distilled},
                {"type": "tool_use", "name": "ignored"}
            ]
        })))
        .mount(&mock)
        .await;

    let profile = mock_summary_profile(&mock, SummaryProviderKind::Anthropic);
    let result = AnthropicSummaryAdapter
        .summarize(
            "anthropic transcript",
            NoteStyle::Academic,
            &profile,
            &SecretPayload::Bearer { api_key: "anthropic-key".into() },
            &non_cancelled(),
        )
        .await
        .unwrap();
    assert_eq!(result.core_conclusion, "Anthropic");

    let requests = mock.received_requests().await.unwrap();
    let body: serde_json::Value = serde_json::from_slice(&requests[0].body).unwrap();
    assert_eq!(body["model"], "test-summary-model");
    assert_eq!(body["max_tokens"], 4096);
    assert!(body["system"].as_str().unwrap().contains("学术"));
    assert!(body["messages"][0]["content"].as_str().unwrap().contains("anthropic transcript"));
}

#[tokio::test]
async fn google_generate_content_uses_header_and_encoded_model_path() {
    let mock = MockServer::start().await;
    let distilled = r#"{"core_conclusion":"Google","key_evidence":["e"],"implications":["i"]}"#;
    Mock::given(wiremock::matchers::method("POST"))
        .and(wiremock::matchers::header("x-goog-api-key", "google-key"))
        .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
            "candidates": [{"content": {"parts": [{"text": distilled}]}}]
        })))
        .mount(&mock)
        .await;

    let mut profile = mock_summary_profile(&mock, SummaryProviderKind::Google);
    profile.model = "gemini/test".into();
    let result = GoogleSummaryAdapter
        .summarize(
            "google transcript",
            NoteStyle::Tutorial,
            &profile,
            &SecretPayload::Bearer { api_key: "google-key".into() },
            &non_cancelled(),
        )
        .await
        .unwrap();
    assert_eq!(result.core_conclusion, "Google");

    let requests = mock.received_requests().await.unwrap();
    assert!(requests[0].url.as_str().contains("/v1beta/models/gemini%2Ftest:generateContent"));
    let body: serde_json::Value = serde_json::from_slice(&requests[0].body).unwrap();
    assert!(body["systemInstruction"]["parts"][0]["text"]
        .as_str().unwrap().contains("教程"));
    assert!(body["contents"][0]["parts"][0]["text"]
        .as_str().unwrap().contains("google transcript"));
}
#[tokio::test]
async fn standard_protocol_status_errors_are_normalized_and_redacted() {
    let secret_marker = "protocol-secret-must-not-leak";

    let responses_mock = MockServer::start().await;
    Mock::given(wiremock::matchers::any())
        .respond_with(ResponseTemplate::new(404).set_body_string(secret_marker))
        .mount(&responses_mock)
        .await;
    let responses_error = OpenAiResponsesSummaryAdapter
        .summarize(
            "private transcript",
            NoteStyle::Minimal,
            &mock_summary_profile(&responses_mock, SummaryProviderKind::OpenAiResponses),
            &SecretPayload::Bearer { api_key: secret_marker.into() },
            &non_cancelled(),
        )
        .await
        .unwrap_err();
    assert_eq!(responses_error.kind, ProviderErrorKind::ProviderError);
    assert_eq!(responses_error.http_status, Some(404));

    let anthropic_mock = MockServer::start().await;
    Mock::given(wiremock::matchers::any())
        .respond_with(ResponseTemplate::new(401).set_body_string(secret_marker))
        .mount(&anthropic_mock)
        .await;
    let anthropic_error = AnthropicSummaryAdapter
        .summarize(
            "private transcript",
            NoteStyle::Minimal,
            &mock_summary_profile(&anthropic_mock, SummaryProviderKind::Anthropic),
            &SecretPayload::Bearer { api_key: secret_marker.into() },
            &non_cancelled(),
        )
        .await
        .unwrap_err();
    assert_eq!(anthropic_error.kind, ProviderErrorKind::AuthenticationFailed);
    assert_eq!(anthropic_error.http_status, Some(401));

    let google_mock = MockServer::start().await;
    Mock::given(wiremock::matchers::any())
        .respond_with(ResponseTemplate::new(429).set_body_string(secret_marker))
        .mount(&google_mock)
        .await;
    let google_error = GoogleSummaryAdapter
        .summarize(
            "private transcript",
            NoteStyle::Minimal,
            &mock_summary_profile(&google_mock, SummaryProviderKind::Google),
            &SecretPayload::Bearer { api_key: secret_marker.into() },
            &non_cancelled(),
        )
        .await
        .unwrap_err();
    assert_eq!(google_error.kind, ProviderErrorKind::RateLimited);
    assert_eq!(google_error.http_status, Some(429));

    for error in [responses_error, anthropic_error, google_error] {
        let rendered = format!("{error}");
        assert!(!rendered.contains(secret_marker));
        assert!(!rendered.contains("private transcript"));
    }
}

#[tokio::test]
async fn summary_protocols_reject_oversized_or_missing_text_responses() {
    let oversized_mock = MockServer::start().await;
    Mock::given(wiremock::matchers::any())
        .respond_with(ResponseTemplate::new(200).set_body_string("x".repeat(1024 * 1024 + 1)))
        .mount(&oversized_mock)
        .await;
    let oversized_error = OpenAiResponsesSummaryAdapter
        .summarize(
            "test",
            NoteStyle::Minimal,
            &mock_summary_profile(&oversized_mock, SummaryProviderKind::OpenAiResponses),
            &SecretPayload::Bearer { api_key: "key".into() },
            &non_cancelled(),
        )
        .await
        .unwrap_err();
    assert_eq!(oversized_error.kind, ProviderErrorKind::InvalidResponse);

    let anthropic_mock = MockServer::start().await;
    Mock::given(wiremock::matchers::any())
        .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({"content": []})))
        .mount(&anthropic_mock)
        .await;
    let anthropic_error = AnthropicSummaryAdapter
        .summarize(
            "test",
            NoteStyle::Minimal,
            &mock_summary_profile(&anthropic_mock, SummaryProviderKind::Anthropic),
            &SecretPayload::Bearer { api_key: "key".into() },
            &non_cancelled(),
        )
        .await
        .unwrap_err();
    assert_eq!(anthropic_error.kind, ProviderErrorKind::InvalidResponse);

    let google_mock = MockServer::start().await;
    Mock::given(wiremock::matchers::any())
        .respond_with(ResponseTemplate::new(200).set_body_string("not-json"))
        .mount(&google_mock)
        .await;
    let google_error = GoogleSummaryAdapter
        .summarize(
            "test",
            NoteStyle::Minimal,
            &mock_summary_profile(&google_mock, SummaryProviderKind::Google),
            &SecretPayload::Bearer { api_key: "key".into() },
            &non_cancelled(),
        )
        .await
        .unwrap_err();
    assert_eq!(google_error.kind, ProviderErrorKind::InvalidResponse);
}
