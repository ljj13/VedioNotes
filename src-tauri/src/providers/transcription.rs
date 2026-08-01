//! 转写服务——语音识别任务的分发和结果处理。


use async_trait::async_trait;
use base64::Engine;
use hmac::Mac;
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};

use crate::credential_store::SecretPayload;
use crate::profiles::TranscriptionProfile;
use crate::providers::endpoint::{resolve_endpoint, EndpointKind};
use crate::providers::error::{self, ProviderError, ProviderErrorKind};
use crate::providers::TranscriptionAdapter;

fn online_client(profile: &TranscriptionProfile) -> Result<reqwest::Client, ProviderError> {
    reqwest::Client::builder()
        .timeout(std::time::Duration::from_millis(
            profile.online_options.timeout_ms,
        ))
        .build()
        .map_err(|e| {
            ProviderError::new(
                ProviderErrorKind::ProviderError,
                format!("创建在线转写客户端失败: {e}"),
                "请检查在线转写配置后重试。",
            )
        })
}

// =========================================================================
//  OpenAiCompatibleAsrAdapter
// =========================================================================

/// OpenAI-compatible ASR via multipart POST to `/v1/audio/transcriptions`.
pub struct OpenAiCompatibleAsrAdapter;

#[async_trait]
impl TranscriptionAdapter for OpenAiCompatibleAsrAdapter {
    async fn transcribe(
        &self,
        audio_path: &Path,
        profile: &TranscriptionProfile,
        secret: &SecretPayload,
        cancel: &AtomicBool,
    ) -> Result<String, ProviderError> {
        // Check cancellation before reading audio
        if cancel.load(Ordering::SeqCst) {
            return Err(error::err_cancelled());
        }

        let api_key = match secret {
            SecretPayload::Bearer { api_key } => api_key,
            _ => {
                return Err(ProviderError::new(
                    ProviderErrorKind::AuthenticationFailed,
                    "该配置档的凭据不是有效的 Bearer 凭据。",
                    "请检查凭据类型是否正确。",
                ))
            }
        };

        // Read audio file
        let audio_bytes = tokio::fs::read(audio_path).await.map_err(|e| {
            ProviderError::new(
                ProviderErrorKind::NetworkError,
                format!("读取音频文件失败: {}", e),
                "请检查文件权限。",
            )
        })?;

        // Check cancellation before sending HTTP
        if cancel.load(Ordering::SeqCst) {
            return Err(error::err_cancelled());
        }

        let url = resolve_endpoint(&profile.base_url, EndpointKind::AudioTranscriptions)?;

        let file_name = audio_path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("audio.mp3")
            .to_string();

        let file_part = reqwest::multipart::Part::bytes(audio_bytes)
            .file_name(file_name)
            .mime_str("audio/mpeg")
            .map_err(|e| {
                ProviderError::new(
                    ProviderErrorKind::ProviderError,
                    format!("构建请求失败: {}", e),
                    "请检查网络连接和 API 配置。",
                )
            })?;

        let mut form = reqwest::multipart::Form::new()
            .part("file", file_part)
            .text("model", profile.model.clone());
        if profile.online_options.language.as_str() != "auto" {
            form = form.text(
                "language",
                profile.online_options.language.as_str().to_owned(),
            );
        }

        let client = online_client(profile)?;
        let response = client
            .post(url)
            .header("Authorization", format!("Bearer {}", api_key))
            .multipart(form)
            .send()
            .await
            .map_err(|e| error::err_network(e))?;

        // Check cancellation after receiving response
        if cancel.load(Ordering::SeqCst) {
            return Err(error::err_cancelled());
        }

        let status = response.status();
        let body = response.text().await.unwrap_or_default();

        match status.as_u16() {
            200..=299 => {
                // Parse OpenAI-compatible success response
                openai_parse_transcription(&body)
            }
            401 | 403 => Err(ProviderError::new(
                ProviderErrorKind::AuthenticationFailed,
                "认证失败，请检查 API Key。",
                "请在设置中更新 API Key。",
            )
            .with_http_status(status.as_u16())),
            402 => {
                // 402 could be quota or billing depending on provider
                Err(ProviderError::new(
                    ProviderErrorKind::BillingUnavailable,
                    "API 调用余额不足。",
                    "请检查账户余额或更换配置档。",
                )
                .with_http_status(status.as_u16()))
            }
            429 => Err(ProviderError::new(
                ProviderErrorKind::RateLimited,
                "请求过于频繁，请稍后重试。",
                "请稍后再试。",
            )
            .with_http_status(status.as_u16())),
            404 => Err(ProviderError::new(
                ProviderErrorKind::ProviderError,
                "转写服务请求端点不存在。",
                "请检查基础地址是否正确或重复包含 /v1。",
            )
            .with_http_status(status.as_u16())),
            _ => Err(ProviderError::new(
                ProviderErrorKind::ProviderError,
                format!("转写服务返回错误 ({})", status.as_u16()),
                "请检查 API Key 和模型配置是否正确。",
            )
            .with_http_status(status.as_u16())),
        }
    }
}

/// Parse an OpenAI-compatible transcription response `{ "text": "..." }`.
fn openai_parse_transcription(body: &str) -> Result<String, ProviderError> {
    let parsed: serde_json::Value = serde_json::from_str(body)
        .map_err(|_| error::err_invalid_response("转写服务返回了无效的 JSON 响应。"))?;

    let text = parsed
        .get("text")
        .and_then(|t| t.as_str())
        .ok_or_else(|| error::err_invalid_response("转写响应缺少 text 字段或内容为空。"))?;

    if text.is_empty() {
        return Err(error::err_invalid_response("转写结果为空。"));
    }

    Ok(text.to_string())
}

// =========================================================================
//  MiMoAsrAdapter
// =========================================================================

/// MiMo ASR via Chat Completions with Base64 Data URL audio.
pub struct MiMoAsrAdapter;

#[async_trait]
impl TranscriptionAdapter for MiMoAsrAdapter {
    async fn transcribe(
        &self,
        audio_path: &Path,
        profile: &TranscriptionProfile,
        secret: &SecretPayload,
        cancel: &AtomicBool,
    ) -> Result<String, ProviderError> {
        // Check cancellation before reading audio
        if cancel.load(Ordering::SeqCst) {
            return Err(error::err_cancelled());
        }

        let api_key = match secret {
            SecretPayload::Bearer { api_key } => api_key,
            _ => {
                return Err(ProviderError::new(
                    ProviderErrorKind::AuthenticationFailed,
                    "该配置档的凭据不是有效的 Bearer 凭据。",
                    "请检查凭据类型是否正确。",
                ))
            }
        };

        // Read audio file
        let audio_bytes = tokio::fs::read(audio_path).await.map_err(|e| {
            ProviderError::new(
                ProviderErrorKind::NetworkError,
                format!("读取音频文件失败: {}", e),
                "请检查文件权限。",
            )
        })?;

        // Determine MIME from extension
        let mime = detect_mime_from_extension(audio_path);

        // Base64 encode in memory
        let encoded = base64::engine::general_purpose::STANDARD.encode(&audio_bytes);

        // Build data URL
        let data_url = format!("data:{};base64,{}", mime, encoded);

        // Drop raw audio bytes and encoded buffer — no longer needed
        drop(audio_bytes);
        drop(encoded);

        // Check cancellation before sending HTTP
        if cancel.load(Ordering::SeqCst) {
            return Err(error::err_cancelled());
        }

        let url = resolve_endpoint(&profile.base_url, EndpointKind::ChatCompletions)?;

        let request_body = serde_json::json!({
            "model": profile.model,
            "messages": [{
                "role": "user",
                "content": [{
                    "type": "input_audio",
                    "input_audio": {
                        "data": data_url
                    }
                }]
            }],
            "asr_options": {
                "language": profile.online_options.language.as_str()
            }
        });

        // Drop data_url — no longer needed after building request
        drop(data_url);

        let client = online_client(profile)?;
        let response = client
            .post(url)
            .header("Authorization", format!("Bearer {}", api_key))
            .json(&request_body)
            .send()
            .await
            .map_err(|e| error::err_network(e))?;

        // Check cancellation after receiving response
        if cancel.load(Ordering::SeqCst) {
            return Err(error::err_cancelled());
        }

        let status = response.status();
        let body = response.text().await.unwrap_or_default();

        match status.as_u16() {
            200..=299 => mimo_parse_transcription(&body),
            401 | 403 => Err(ProviderError::new(
                ProviderErrorKind::AuthenticationFailed,
                "MiMo 认证失败，请检查 API Key。",
                "请在设置中更新 MiMo API Key。",
            )
            .with_http_status(status.as_u16())),
            402 => Err(ProviderError::new(
                ProviderErrorKind::QuotaExhausted,
                "MiMo 余额不足。",
                "请检查账户余额或更换配置档。",
            )
            .with_http_status(status.as_u16())),
            429 => Err(ProviderError::new(
                ProviderErrorKind::RateLimited,
                "MiMo 请求过于频繁，请稍后重试。",
                "请稍后再试。",
            )
            .with_http_status(status.as_u16())),
            404 => Err(ProviderError::new(
                ProviderErrorKind::ProviderError,
                "MiMo 转写请求端点不存在。",
                "请检查基础地址是否正确或重复包含 /v1。",
            )
            .with_http_status(status.as_u16())),
            _ => Err(ProviderError::new(
                ProviderErrorKind::ProviderError,
                format!("MiMo 转写返回错误 ({})", status.as_u16()),
                "请检查 API Key 和配置是否正确。",
            )
            .with_http_status(status.as_u16())),
        }
    }
}

/// Parse MiMo Chat Completions response to extract transcript.
///
/// Expected: `{ "choices": [{ "message": { "content": "..." } }] }`
fn mimo_parse_transcription(body: &str) -> Result<String, ProviderError> {
    let parsed: serde_json::Value = serde_json::from_str(body)
        .map_err(|_| error::err_invalid_response("MiMo 返回了无效的 JSON 响应。"))?;

    let content = parsed["choices"][0]["message"]["content"]
        .as_str()
        .ok_or_else(|| error::err_invalid_response("MiMo 响应缺少 choices[0].message.content。"))?;

    if content.is_empty() {
        return Err(error::err_invalid_response("MiMo 转写结果为空。"));
    }

    Ok(content.to_string())
}

// =========================================================================
//  TencentFlashAsrAdapter
// =========================================================================

/// Tencent Cloud Flash ASR via signed POST request.
pub struct TencentFlashAsrAdapter;

#[async_trait]
impl TranscriptionAdapter for TencentFlashAsrAdapter {
    async fn transcribe(
        &self,
        audio_path: &Path,
        profile: &TranscriptionProfile,
        secret: &SecretPayload,
        cancel: &AtomicBool,
    ) -> Result<String, ProviderError> {
        // Check cancellation before reading audio
        if cancel.load(Ordering::SeqCst) {
            return Err(error::err_cancelled());
        }

        let tencent = match secret {
            SecretPayload::Tencent {
                app_id,
                secret_id,
                secret_key,
            } => (app_id.clone(), secret_id.clone(), secret_key.clone()),
            _ => {
                return Err(ProviderError::new(
                    ProviderErrorKind::AuthenticationFailed,
                    "该配置档的凭据不是有效的腾讯云凭据。",
                    "请检查 AppID、SecretID 和 SecretKey 是否正确。",
                ))
            }
        };

        let (app_id, secret_id, secret_key) = tencent;

        // Read audio file
        let audio_bytes = tokio::fs::read(audio_path).await.map_err(|e| {
            ProviderError::new(
                ProviderErrorKind::NetworkError,
                format!("读取音频文件失败: {}", e),
                "请检查文件权限。",
            )
        })?;

        // Check cancellation before sending HTTP
        if cancel.load(Ordering::SeqCst) {
            return Err(error::err_cancelled());
        }

        let base = profile.base_url.trim_end_matches('/');
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();

        // Build sorted query parameters
        let raw_params: Vec<(String, String)> = vec![
            ("appid".to_string(), app_id.clone()),
            ("secretid".to_string(), secret_id),
            ("engine_type".to_string(), profile.model.clone()),
            ("timestamp".to_string(), now.to_string()),
            ("voice_format".to_string(), "wav".to_string()),
        ];

        // Sort by key and URL-encode values
        let mut sorted_params = raw_params;
        sorted_params.sort_by(|a, b| a.0.cmp(&b.0));

        let canonical_query: String = sorted_params
            .iter()
            .map(|(k, v)| format!("{}={}", k, urlencoding::encode(v)))
            .collect::<Vec<_>>()
            .join("&");

        // Compute HMAC-SHA1 signature
        let canonical_uri = format!(
            "asr.cloud.tencent.com/asr/flash/v1/{}?{}",
            app_id, canonical_query
        );

        let mut mac =
            hmac::Hmac::<sha1::Sha1>::new_from_slice(secret_key.as_bytes()).map_err(|_| {
                ProviderError::new(
                    ProviderErrorKind::ProviderError,
                    "签名初始化失败。",
                    "请重试。",
                )
            })?;
        mac.update(b"POST");
        mac.update(canonical_uri.as_bytes());
        let signature =
            base64::engine::general_purpose::STANDARD.encode(&mac.finalize().into_bytes());

        let full_url = format!("{}/asr/flash/v1/{}?{}", base, app_id, canonical_query);

        let client = online_client(profile)?;
        let response = client
            .post(&full_url)
            .header("Content-Type", "application/octet-stream")
            .header("Authorization", signature)
            .body(audio_bytes)
            .send()
            .await
            .map_err(|e| error::err_network(e))?;

        // Check cancellation after receiving response
        if cancel.load(Ordering::SeqCst) {
            return Err(error::err_cancelled());
        }

        let status = response.status();
        let body = response.text().await.unwrap_or_default();

        if status.is_success() {
            tencent_parse_success(&body)
        } else if status == reqwest::StatusCode::TOO_MANY_REQUESTS {
            Err(ProviderError::new(
                ProviderErrorKind::RateLimited,
                "腾讯云请求过于频繁。",
                "请稍后再试。",
            )
            .with_http_status(status.as_u16()))
        } else {
            // Try to parse structured error body
            tencent_classify_error_body(&body, status.as_u16())
        }
    }
}

/// Parse a Tencent Flash ASR success response.
///
/// Expected: `{ "code": 0, "flash_result": [{ "channel_id": N, "text": "..." }] }`
fn tencent_parse_success(body: &str) -> Result<String, ProviderError> {
    let parsed: serde_json::Value = serde_json::from_str(body)
        .map_err(|_| error::err_invalid_response("腾讯云返回了无效的 JSON 响应。"))?;

    // Check business-level code
    let code = parsed["code"].as_i64().unwrap_or(-1);
    if code != 0 {
        let msg = parsed["message"].as_str().unwrap_or("unknown");
        return Err(map_tencent_error(code as i32, msg));
    }

    let channels = parsed["flash_result"]
        .as_array()
        .ok_or_else(|| error::err_invalid_response("腾讯云响应缺少 flash_result 字段。"))?;

    let combined: String = channels
        .iter()
        .filter_map(|ch| ch["text"].as_str())
        .collect();

    if combined.is_empty() {
        return Err(error::err_invalid_response("腾讯云转写结果为空。"));
    }

    Ok(combined)
}

/// Classify a Tencent error body by parsing its JSON.
fn tencent_classify_error_body(body: &str, http_status: u16) -> Result<String, ProviderError> {
    // Try to parse structured error
    if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(body) {
        if let Some(code) = parsed["code"].as_i64() {
            let msg = parsed["message"].as_str().unwrap_or("unknown");
            let mut err = map_tencent_error(code as i32, msg);
            err.http_status = Some(http_status);
            return Err(err);
        }
    }
    // Fallback: generic HTTP error
    Err(ProviderError::new(
        ProviderErrorKind::ProviderError,
        format!("腾讯云返回错误 ({})", http_status),
        "请检查 API 配置。",
    )
    .with_http_status(http_status))
}

/// Map Tencent documented error codes to normalized error kinds.
///
/// Codes (ref: https://cloud.tencent.com/document/api/1093/52097):
///   4002 → authentication_failed  (鉴权失败)
///   4003 → provider_error         (AppID 服务未开通)
///   4004 → quota_exhausted        (资源包耗尽)
///   4005 → billing_unavailable    (账户欠费停止服务)
///   4006 → rate_limited           (调用并发超限)
fn map_tencent_error(code: i32, _message: &str) -> ProviderError {
    let err = match code {
        4002 => ProviderError::new(
            ProviderErrorKind::AuthenticationFailed,
            "腾讯云鉴权失败，请检查 SecretId 和 SecretKey。",
            "请在设置中更新腾讯云凭据。",
        ),
        4003 => ProviderError::new(
            ProviderErrorKind::ProviderError,
            "腾讯云 AppID 未开通 Flash ASR 服务。",
            "请检查腾讯云控制台服务开通状态。",
        ),
        4004 => ProviderError::new(
            ProviderErrorKind::QuotaExhausted,
            "腾讯云资源包已耗尽，请购买资源包或开通后付费。",
            "请在腾讯云控制台购买资源包或切换到备用配置档。",
        ),
        4005 => ProviderError::new(
            ProviderErrorKind::BillingUnavailable,
            "腾讯云账户欠费，服务已停止。",
            "请及时充值后继续使用。",
        ),
        4006 => ProviderError::new(
            ProviderErrorKind::RateLimited,
            "腾讯云调用并发超限。",
            "请稍后重试。",
        ),
        _ => ProviderError::new(
            ProviderErrorKind::ProviderError,
            format!("腾讯云返回错误 (code={})", code),
            "请检查 API 配置。",
        ),
    };

    err.with_provider_code(code.to_string())
}

// =========================================================================
//  Helpers
// =========================================================================

/// Detect audio MIME type from file extension.
fn detect_mime_from_extension(path: &Path) -> &'static str {
    match path.extension().and_then(|e| e.to_str()) {
        Some("wav") => "audio/wav",
        Some("mp3") => "audio/mpeg",
        Some("m4a") => "audio/mp4",
        Some("ogg") => "audio/ogg",
        Some("flac") => "audio/flac",
        Some("aac") => "audio/aac",
        Some("webm") => "audio/webm",
        _ => "audio/mpeg",
    }
}
