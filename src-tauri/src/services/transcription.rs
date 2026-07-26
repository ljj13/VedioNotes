//! 转写服务——语音识别任务的分发和结果聚合.

use crate::domain::AppError;

/// Configuration for transcription API.
#[derive(Debug, Clone)]
/// TranscriptionConfig
pub struct TranscriptionConfig {
    pub base_url: String,
    pub model: String,
    pub api_key: String,
}

/// Transcribe audio using a cloud ASR provider.
/// Uses multipart upload (file + model) to the configured base URL.
pub async fn transcribe(
    audio_path: &std::path::Path,
    config: &TranscriptionConfig,
) -> Result<String, AppError> {
    let url = format!(
        "{}/v1/audio/transcriptions",
        config.base_url.trim_end_matches('/')
    );

    // Read audio file
    let audio_bytes = tokio::fs::read(audio_path).await.map_err(|e| {
        AppError::new(
            "io_error",
            format!("读取音频文件失败: {}", e),
            "请检查文件权限。",
        )
    })?;

    // Build multipart form
    let file_part = reqwest::multipart::Part::bytes(audio_bytes)
        .file_name(
            audio_path
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("audio.mp3")
                .to_string(),
        )
        .mime_str("audio/mpeg")
        .map_err(|e| {
            AppError::new(
                "request_error",
                format!("构建请求失败: {}", e),
                "请检查网络连接和 API 配置。",
            )
        })?;

    let form = reqwest::multipart::Form::new()
        .part("file", file_part)
        .text("model", config.model.clone());

    // Send request
    let client = reqwest::Client::new();
    let response = client
        .post(&url)
        .header("Authorization", format!("Bearer {}", config.api_key))
        .multipart(form)
        .send()
        .await
        .map_err(|e| {
            AppError::new(
                "network_error",
                format!("网络请求失败: {}", e),
                "请检查网络连接和 API 配置。",
            )
        })?;

    let status = response.status();
    let body = response.text().await.unwrap_or_default();

    if !status.is_success() {
        return Err(AppError::new(
            "transcription_failed",
            format!("转写服务返回错误 ({})", status.as_u16()),
            "请检查 API Key 和模型配置是否正确。",
        ));
    }

    // Parse response: try OpenAI-compatible format first, then raw text
    let text = parse_transcription_response(&body);
    Ok(text)
}

/// Parse transcription response. Supports OpenAI-compatible JSON format and raw text.
fn parse_transcription_response(body: &str) -> String {
    // Try to parse as OpenAI-style { "text": "..." }
    if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(body) {
        if let Some(text) = parsed.get("text").and_then(|t| t.as_str()) {
            return text.to_string();
        }
    }
    // Fallback: return body as-is
    body.to_string()
}
