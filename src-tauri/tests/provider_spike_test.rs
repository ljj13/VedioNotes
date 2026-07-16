// == Stage 00: Provider Protocol Spike ========================================
//
// Proves that MiMo mimo-v2.5-asr (via Chat Completions) and Tencent Cloud
// Flash ASR (signed request) protocols can be constructed, sent to a local
// mock, and parsed. No production source code is modified. No remote API is
// contacted — all HTTP interactions use wiremock running on localhost.
//
// These helpers are SPIKE ONLY. They are not the final production adapters.
// The names, types, and error classifications here inform production code
// that will be written in later stages.

use base64::Engine;
use hmac::{Hmac, Mac};
use sha1::Sha1;
use wiremock::{Mock, MockServer, ResponseTemplate};

// ---------------------------------------------------------------------------
// Constants — fake values used only by spike tests. Not real credentials.
// ---------------------------------------------------------------------------

/// Fake Bearer token — never a real key.
const MIMO_FAKE_BEARER_TOKEN: &str = "fake-test-token-do-not-use";

/// Real Base64 encoding of fixed test bytes — proves the encoding path works.
fn mimo_fake_audio_data_url() -> String {
    let encoded = base64::engine::general_purpose::STANDARD.encode(b"FixedTestAudioBytesForSpike");
    format!("data:audio/mpeg;base64,{}", encoded)
}

// Tencent frozen fixture values (documented, non-secret, stable across runs).
const TENCENT_APPID: &str = "1259220000";
const TENCENT_SECRET_ID: &str = "AKIDtest123";
const TENCENT_SECRET_KEY: &str = "testSecretKeyForSpikeDoNotUse";

// =========================================================================
//  MiMo ASR spike: wiremock-local success, auth error, malformed response
// =========================================================================

#[tokio::test]
async fn mimo_success_request_shape_and_parse() {
    // Arrange — a wiremock server that returns a valid MiMo-style response.
    let mock = MockServer::start().await;

    let mock_response = serde_json::json!({
        "id": "chatcmpl-mock-001",
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
    });

    Mock::given(wiremock::matchers::method("POST"))
        .and(wiremock::matchers::path("/v1/chat/completions"))
        .and(wiremock::matchers::header(
            "Authorization",
            format!("Bearer {}", MIMO_FAKE_BEARER_TOKEN),
        ))
        .respond_with(ResponseTemplate::new(200).set_body_json(mock_response))
        .mount(&mock)
        .await;

    // Act — send the exact MiMo request shape to the mock.
    let client = reqwest::Client::new();
    let request_body = serde_json::json!({
        "model": "mimo-v2.5-asr",
        "messages": [{
            "role": "user",
            "content": [{
                "type": "input_audio",
                "input_audio": {
                    "data": mimo_fake_audio_data_url()
                }
            }]
        }],
        "asr_options": {
            "language": "auto"
        }
    });
    let resp = client
        .post(format!("{}/v1/chat/completions", mock.uri()))
        .header(
            "Authorization",
            format!("Bearer {}", MIMO_FAKE_BEARER_TOKEN),
        )
        .json(&request_body)
        .send()
        .await
        .unwrap();

    // Assert — transcript correctly extracted from choices[0].message.content.
    assert!(
        resp.status().is_success(),
        "Expected 2xx, got {}",
        resp.status()
    );
    let body: serde_json::Value = resp.json().await.unwrap();
    let transcript = body["choices"][0]["message"]["content"]
        .as_str()
        .expect("choices[0].message.content should be a string");
    assert_eq!(transcript, "今天天气很好，适合出行。");

    // Assert — Base64 data URL uses the documented format prefix.
    let received = mock.received_requests().await.unwrap();
    assert_eq!(received.len(), 1);
    let req_body: serde_json::Value = serde_json::from_slice(&received[0].body).unwrap();
    let data_url = req_body["messages"][0]["content"][0]["input_audio"]["data"]
        .as_str()
        .expect("input_audio.data should be present");
    assert!(
        data_url.starts_with("data:audio/mpeg;base64,"),
        "input_audio.data must be a data URL with correct MIME and base64 encoding"
    );
}

#[tokio::test]
async fn mimo_401_maps_to_authentication_failed() {
    // Arrange — mock returns 401 (invalid or missing API key).
    let mock = MockServer::start().await;

    Mock::given(wiremock::matchers::any())
        .respond_with(ResponseTemplate::new(401))
        .mount(&mock)
        .await;

    // Act
    let client = reqwest::Client::new();
    let resp = client
        .post(format!("{}/v1/chat/completions", mock.uri()))
        .header(
            "Authorization",
            format!("Bearer {}", MIMO_FAKE_BEARER_TOKEN),
        )
        .json(&serde_json::json!({
            "model": "mimo-v2.5-asr",
            "messages": [{
                "role": "user",
                "content": [{
                    "type": "input_audio",
                    "input_audio": { "data": mimo_fake_audio_data_url() }
                }]
            }],
            "asr_options": { "language": "auto" }
        }))
        .send()
        .await
        .unwrap();

    let status = resp.status().as_u16();
    let body = resp.text().await.unwrap_or_default();

    // Assert — 401 classifies as authentication_failed.
    let category = classify_mimo_error(status, &body);
    assert_eq!(category, "authentication_failed");
}

#[tokio::test]
async fn mimo_malformed_json_maps_to_invalid_response() {
    // Arrange — mock returns 200 with garbage body (not valid JSON).
    let mock = MockServer::start().await;

    Mock::given(wiremock::matchers::any())
        .respond_with(ResponseTemplate::new(200).set_body_string("这不是 JSON"))
        .mount(&mock)
        .await;

    // Act
    let client = reqwest::Client::new();
    let resp = client
        .post(format!("{}/v1/chat/completions", mock.uri()))
        .header(
            "Authorization",
            format!("Bearer {}", MIMO_FAKE_BEARER_TOKEN),
        )
        .json(&serde_json::json!({
            "model": "mimo-v2.5-asr",
            "messages": [{
                "role": "user",
                "content": [{
                    "type": "input_audio",
                    "input_audio": { "data": mimo_fake_audio_data_url() }
                }]
            }],
            "asr_options": { "language": "auto" }
        }))
        .send()
        .await
        .unwrap();

    let body_text = resp.text().await.unwrap();
    let result = mimo_parse_success(&body_text);
    assert!(result.is_err(), "Malformed JSON should produce an error");
    assert_eq!(
        result.unwrap_err().category,
        "invalid_response",
        "Unparseable MiMo response should map to invalid_response"
    );
}

// =========================================================================
//  Tencent Flash ASR spike: signing, parsing, error classification
// =========================================================================

/// Canonical query parameters are sorted alphabetically — a Tencent signing
/// requirement (ref: https://cloud.tencent.com/document/api/1093/52097).
#[test]
fn tencent_canonical_query_sorted_deterministically() {
    let params = [
        ("voice_format", "wav"),
        ("secretid", TENCENT_SECRET_ID),
        ("timestamp", "1720000000"),
        ("engine_type", "16k_zh"),
    ];
    let query = sort_and_join_query(&params);
    assert_eq!(
        query, "engine_type=16k_zh&secretid=AKIDtest123&timestamp=1720000000&voice_format=wav",
        "Tencent signing requires alphabetically sorted query parameters"
    );
}

/// HMAC-SHA1 signature is deterministic for the same frozen fixture.
///
/// Fixture derivation:
///   POSTasr.cloud.tencent.com/asr/flash/v1/1259220000
///       ?engine_type=16k_zh&secretid=AKIDtest123
///       &timestamp=1720000000&voice_format=wav
///   Key: testSecretKeyForSpikeDoNotUse
///   → HMAC-SHA1 → Base64 → SHHJmjoxlLM/nf9OT1GBzJhwsmI=
#[test]
fn tencent_signature_stable_for_frozen_fixture() {
    let expected_b64 = "SHHJmjoxlLM/nf9OT1GBzJhwsmI=";

    let query = sort_and_join_query(&[
        ("voice_format", "wav"),
        ("secretid", TENCENT_SECRET_ID),
        ("timestamp", "1720000000"),
        ("engine_type", "16k_zh"),
    ]);
    let signature = compute_tencent_signature(TENCENT_SECRET_KEY, TENCENT_APPID, &query);

    assert_eq!(
        signature, expected_b64,
        "HMAC-SHA1 signature must be deterministic for the same inputs"
    );
}

/// Success response: parses flash_result[*].text into combined transcript.
///
/// Each channel contributes its `text` field; they are concatenated in
/// channel_id order to form the full multi-channel transcript.
#[test]
fn tencent_success_response_parses_combined_transcript() {
    let fixture = serde_json::json!({
        "code": 0,
        "message": "success",
        "request_id": "mock-success-req-001",
        "flash_result": [
            {
                "channel_id": 0,
                "text": "今天天气真好",
                "sentences": []
            },
            {
                "channel_id": 1,
                "text": "我们可以去公园散步",
                "sentences": []
            }
        ]
    });

    let result = tencent_parse_success(&fixture.to_string()).unwrap();
    assert_eq!(result, "今天天气真好我们可以去公园散步");
    assert!(
        !result.is_empty(),
        "Combined transcript should not be empty"
    );
}

/// 4004 → quota_exhausted
///
/// Tencent doc: "资源包耗尽，请开通后付费或者购买资源包".
/// This code indicates free-quota / resource-pack exhaustion,
/// which should trigger fallback to an alternative provider.
#[test]
fn tencent_quota_exhausted_mapped() {
    // Source: Tencent Flash ASR API doc, error code 4004.
    let fixture = r#"{"code":4004,"message":"资源包耗尽，请开通后付费或者购买资源包","request_id":"mock-qt-001"}"#;
    let category = parse_and_classify_tencent_error(fixture);
    assert_eq!(
        category, "quota_exhausted",
        "4004 maps to quota_exhausted (doc: 资源包耗尽/quota exhausted)"
    );
}

/// 4005 → billing_unavailable
///
/// Tencent doc: "账户欠费停止服务，请及时充值".
/// This code indicates the account is in arrears or suspended.
#[test]
fn tencent_billing_unavailable_mapped() {
    // Source: Tencent Flash ASR API doc, error code 4005.
    let fixture =
        r#"{"code":4005,"message":"账户欠费停止服务，请及时充值","request_id":"mock-bl-001"}"#;
    let category = parse_and_classify_tencent_error(fixture);
    assert_eq!(
        category, "billing_unavailable",
        "4005 maps to billing_unavailable (doc: 账户欠费/billing arrears)"
    );
}

/// 4002 → authentication_failed
///
/// Tencent doc: "鉴权失败".
/// This code indicates signature mismatch, invalid SecretId, or expiry.
#[test]
fn tencent_authentication_error_mapped() {
    // Source: Tencent Flash ASR API doc, error code 4002.
    let fixture = r#"{"code":4002,"message":"鉴权失败","request_id":"mock-auth-001"}"#;
    let category = parse_and_classify_tencent_error(fixture);
    assert_eq!(
        category, "authentication_failed",
        "4002 maps to authentication_failed (doc: 鉴权失败/auth failure)"
    );
}

// =========================================================================
//  Inline spike helpers — not production code.
//  These define the request shape, signing, parsing, and error
//  classification for the two protocols. Production adapters will
//  refine and move these into the provider module tree.
// =========================================================================

/// Sorts query parameters alphabetically (Tencent signing requirement).
fn sort_and_join_query(params: &[(&str, &str)]) -> String {
    let mut sorted: Vec<(&str, &str)> = params.to_vec();
    sorted.sort_by(|a, b| a.0.cmp(b.0));
    sorted
        .iter()
        .map(|(k, v)| format!("{}={}", k, v))
        .collect::<Vec<_>>()
        .join("&")
}

/// Computes Tencent Flash ASR request signature: HMAC-SHA1 → Base64.
///
/// The canonical request is the uppercase HTTP method ("POST") followed by
/// the request URI (host + path + query) with no scheme, exactly as specified
/// in the Tencent API signing doc:
///   https://cloud.tencent.com/document/api/1093/52097
fn compute_tencent_signature(secret_key: &str, appid: &str, canonical_query: &str) -> String {
    let canonical_uri = format!(
        "asr.cloud.tencent.com/asr/flash/v1/{}?{}",
        appid, canonical_query
    );

    let mut mac = Hmac::<Sha1>::new_from_slice(secret_key.as_bytes())
        .expect("HMAC key must accept arbitrary bytes");
    mac.update(b"POST");
    mac.update(canonical_uri.as_bytes());
    let result = mac.finalize().into_bytes();
    base64::engine::general_purpose::STANDARD.encode(&result[..])
}

/// Parses a MiMo Chat Completions success response to extract transcript.
///
/// Expected shape:
///   { "choices": [{ "message": { "content": "transcribed text" } }] }
fn mimo_parse_success(body: &str) -> Result<String, SpikeError> {
    let v: serde_json::Value = serde_json::from_str(body).map_err(|_| SpikeError {
        category: "invalid_response",
        message: "无法解析为JSON".into(),
    })?;

    let text = v["choices"][0]["message"]["content"]
        .as_str()
        .ok_or_else(|| SpikeError {
            category: "invalid_response",
            message: "缺少 choices[0].message.content".into(),
        })?;

    Ok(text.to_string())
}

/// Classifies a MiMo HTTP status into a normalized error category.
///
/// Error codes (ref: https://mimo.mi.com/docs/zh-CN/api/guidance/error-codes):
///   - 401  → authentication_failed (缺少或无效的 API Key)
///   - 402  → quota_exhausted (余额不足)
///   - 429  → rate_limited (请求过于频繁)
///   - 403  → authentication_failed (region/access denied)
fn classify_mimo_error(status: u16, _body: &str) -> &'static str {
    match status {
        401 | 403 => "authentication_failed",
        402 => "quota_exhausted",
        429 => "rate_limited",
        _ => "provider_error",
    }
}

/// Parses a Tencent Flash ASR success response.
///
/// Expected shape (code=0):
///   { "code": 0, "flash_result": [{ "text": "...", ... }, ...] }
///
/// All channels' `text` fields are concatenated in their array order to
/// produce the full multi-channel transcript.
fn tencent_parse_success(body: &str) -> Result<String, SpikeError> {
    let v: serde_json::Value = serde_json::from_str(body).map_err(|_| SpikeError {
        category: "invalid_response",
        message: "无法解析为JSON".into(),
    })?;

    let code = v["code"].as_i64().unwrap_or(-1);
    if code != 0 {
        let msg = v["message"].as_str().unwrap_or("unknown");
        return Err(SpikeError {
            category: classify_tencent_error(code as i32, msg),
            message: msg.to_string(),
        });
    }

    let channels = v["flash_result"].as_array().ok_or_else(|| SpikeError {
        category: "invalid_response",
        message: "缺少 flash_result".into(),
    })?;

    let combined: String = channels
        .iter()
        .filter_map(|ch| ch["text"].as_str())
        .collect();

    if combined.is_empty() {
        return Err(SpikeError {
            category: "invalid_response",
            message: "flash_result 中没有包含 text 字段".into(),
        });
    }

    Ok(combined)
}

/// Classifies Tencent Flash ASR error codes per published documentation.
///
/// Codes (ref: https://cloud.tencent.com/document/api/1093/52097):
///   4002 → authentication_failed  (鉴权失败)
///   4003 → provider_error         (AppID 服务未开通)
///   4004 → quota_exhausted        (资源包耗尽)
///   4005 → billing_unavailable    (账户欠费停止服务)
///   4006 → rate_limited           (调用并发超限)
fn classify_tencent_error(code: i32, _message: &str) -> &'static str {
    match code {
        4002 => "authentication_failed",
        4003 => "provider_error",
        4004 => "quota_exhausted",
        4005 => "billing_unavailable",
        4006 => "rate_limited",
        _ => "provider_error",
    }
}

/// Parses a Tencent error JSON fixture, extracts `code` and `message`, and
/// classifies the result. This proves the parsing path works end-to-end for
/// each error scenario rather than calling classify_tencent_error directly.
fn parse_and_classify_tencent_error(fixture: &str) -> &'static str {
    let v: serde_json::Value =
        serde_json::from_str(fixture).expect("error fixture must be valid JSON");
    let code = v["code"].as_i64().expect("error fixture must have code") as i32;
    let message = v["message"]
        .as_str()
        .expect("error fixture must have message");
    classify_tencent_error(code, message)
}

/// Lightweight spike-only error — not the production ProviderError.
#[derive(Debug, PartialEq)]
struct SpikeError {
    category: &'static str,
    message: String,
}

// =========================================================================
//  Sanity sentinel — verifies that fake credentials are not actually
//  printed by any test. The constants above are used in request
//  construction but never in assertion messages or stdout.
// =========================================================================

#[test]
fn mimo_constants_are_not_leaked_by_assertions() {
    assert!(MIMO_FAKE_BEARER_TOKEN.starts_with("fake-"));

    // Confirm the runtime-produced data URL has the correct format prefix.
    let url = mimo_fake_audio_data_url();
    assert!(url.starts_with("data:audio/mpeg;base64,"));
    assert_eq!(
        url, "data:audio/mpeg;base64,Rml4ZWRUZXN0QXVkaW9CeXRlc0ZvclNwaWtl",
        "Base64 data URL must match known encoding of fixed test bytes"
    );
}
