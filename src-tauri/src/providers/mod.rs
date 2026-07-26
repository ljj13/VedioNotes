//! AI 服务商适配器模块入口——声明 endpoint/error/local_whisper/sensevoice/summary 子模块.

pub mod endpoint;
pub mod error;
pub mod local_whisper;
pub mod sensevoice;
pub mod summary;
pub mod transcription;

use crate::credential_store::SecretPayload;
use crate::profiles::{SummaryProfile, TranscriptionProfile};
use async_trait::async_trait;
use error::ProviderError;
use std::path::Path;
use std::sync::atomic::AtomicBool;

// ---------------------------------------------------------------------------
// Transcription adapter trait
// ---------------------------------------------------------------------------

/// Contract for all transcription (ASR) providers.
#[async_trait]
pub trait TranscriptionAdapter: Send + Sync {
    /// Transcribe audio at `audio_path` and return the transcript text.
    ///
    /// Cancellation is checked:
    /// - before reading audio,
    /// - before sending HTTP,
    /// - after receiving a response.
    async fn transcribe(
        &self,
        audio_path: &Path,
        profile: &TranscriptionProfile,
        secret: &SecretPayload,
        cancel: &AtomicBool,
    ) -> Result<String, ProviderError>;
}

// ---------------------------------------------------------------------------
// Summary adapter trait
// ---------------------------------------------------------------------------

/// Contract for all summary (LLM distillation) providers.
#[async_trait]
pub trait SummaryAdapter: Send + Sync {
    /// Send a chat-completion request with the transcript, parse the
    /// response through `parse_distillation`, and return a validated
    /// `Distillation` with the original transcript attached.
    async fn summarize(
        &self,
        transcript: &str,
        style: crate::domain::NoteStyle,
        profile: &SummaryProfile,
        secret: &SecretPayload,
        cancel: &AtomicBool,
    ) -> Result<crate::domain::Distillation, ProviderError>;
}

// ---------------------------------------------------------------------------
// Model discovery
// ---------------------------------------------------------------------------

/// Result of a model discovery call.
#[derive(Debug, Clone, PartialEq)]
pub enum ModelDiscoveryResult {
    /// Successfully fetched and parsed models, sorted ascending.
    Success(Vec<String>),
    /// The provider does not support model discovery (404/405).
    Unsupported,
}

// ---------------------------------------------------------------------------
// Transcription Registry
// ---------------------------------------------------------------------------

/// Resolves transcription adapters by provider kind.
///
/// Usage:
///   let registry = TranscriptionRegistry::new();
///   let adapter = registry.get(&profile.provider)?;
///   let transcript = adapter.transcribe(&audio, &profile, &secret, &cancel).await?;
pub struct TranscriptionRegistry {
    adapters: Vec<(
        crate::profiles::TranscriptionProviderKind,
        Box<dyn TranscriptionAdapter>,
    )>,
}

impl TranscriptionRegistry {
    /// Create a new registry with all built-in adapters registered.
    pub fn new() -> Self {
        Self {
            adapters: vec![
                (
                    crate::profiles::TranscriptionProviderKind::OpenAiCompatible,
                    Box::new(transcription::OpenAiCompatibleAsrAdapter),
                ),
                (
                    crate::profiles::TranscriptionProviderKind::MimoAsr,
                    Box::new(transcription::MiMoAsrAdapter),
                ),
                (
                    crate::profiles::TranscriptionProviderKind::TencentFlash,
                    Box::new(transcription::TencentFlashAsrAdapter),
                ),
                (
                    crate::profiles::TranscriptionProviderKind::LocalWhisperCpp,
                    Box::new(local_whisper::LocalWhisperCppAdapter::new(
                        std::sync::Arc::new(local_whisper::CommandWhisperProcessRunner::default()),
                        std::path::PathBuf::new(),
                        std::path::PathBuf::from("whisper-cli.exe"),
                    )),
                ),
            ],
        }
    }

    /// Replace the built-in local adapter with an app-path-aware instance.
    /// Online adapters remain fixed and local execution never gains a network path.
    pub fn with_local_adapter(adapter: local_whisper::LocalWhisperCppAdapter) -> Self {
        let mut registry = Self::new();
        if let Some((_, slot)) = registry
            .adapters
            .iter_mut()
            .find(|(kind, _)| *kind == crate::profiles::TranscriptionProviderKind::LocalWhisperCpp)
        {
            *slot = Box::new(adapter);
        }
        registry
    }

    /// Get the adapter for the given provider kind.
    ///
    /// Returns `Err(ProviderError)` with kind `ProviderError` if the kind is
    /// not registered (should not happen with built-in adapters).
    pub fn get(
        &self,
        kind: &crate::profiles::TranscriptionProviderKind,
    ) -> Result<&dyn TranscriptionAdapter, ProviderError> {
        self.adapters
            .iter()
            .find(|(k, _)| k == kind)
            .map(|(_, a)| a.as_ref())
            .ok_or_else(|| {
                ProviderError::new(
                    error::ProviderErrorKind::ProviderError,
                    format!("未注册的转写提供商: {:?}", kind),
                    "请检查配置。",
                )
            })
    }
}

impl Default for TranscriptionRegistry {
    fn default() -> Self {
        Self::new()
    }
}

// ---------------------------------------------------------------------------
// Summary Registry
// ---------------------------------------------------------------------------

/// Resolves summary adapters by provider kind and provides model discovery.
pub struct SummaryRegistry {
    adapters: Vec<(
        crate::profiles::SummaryProviderKind,
        Box<dyn SummaryAdapter>,
    )>,
}

impl SummaryRegistry {
    /// Create a new registry with all built-in adapters registered.
    pub fn new() -> Self {
        Self {
            adapters: vec![
                (
                    crate::profiles::SummaryProviderKind::DeepSeek,
                    Box::new(summary::OpenAiCompatibleSummaryAdapter),
                ),
                (
                    crate::profiles::SummaryProviderKind::Mimo,
                    Box::new(summary::OpenAiCompatibleSummaryAdapter),
                ),
                (
                    crate::profiles::SummaryProviderKind::OpenAiCompatible,
                    Box::new(summary::OpenAiCompatibleSummaryAdapter),
                ),
                (
                    crate::profiles::SummaryProviderKind::OpenAiResponses,
                    Box::new(summary::OpenAiResponsesSummaryAdapter),
                ),
                (
                    crate::profiles::SummaryProviderKind::Anthropic,
                    Box::new(summary::AnthropicSummaryAdapter),
                ),
                (
                    crate::profiles::SummaryProviderKind::Google,
                    Box::new(summary::GoogleSummaryAdapter),
                ),
            ],
        }
    }

    /// Get the adapter for the given provider kind.
    pub fn get(
        &self,
        kind: &crate::profiles::SummaryProviderKind,
    ) -> Result<&dyn SummaryAdapter, ProviderError> {
        self.adapters
            .iter()
            .find(|(k, _)| k == kind)
            .map(|(_, a)| a.as_ref())
            .ok_or_else(|| {
                ProviderError::new(
                    error::ProviderErrorKind::ProviderError,
                    format!("未注册的总结提供商: {:?}", kind),
                    "请检查配置。",
                )
            })
    }

    /// Discover available models from a provider's `/v1/models` endpoint.
    ///
    /// - Authenticated GET `<base>/v1/models`.
    /// - Parses and deduplicates `data[].id`, sorts ascending.
    /// - Returns `ModelDiscoveryResult::Unsupported` for 404/405.
    /// - Authentication/network failures return distinct errors.
    /// - This method is never called automatically during task execution.
    pub async fn discover_models(
        &self,
        profile: &SummaryProfile,
        secret: &SecretPayload,
        cancel: &AtomicBool,
    ) -> Result<ModelDiscoveryResult, ProviderError> {
        if cancel.load(std::sync::atomic::Ordering::SeqCst) {
            return Err(error::err_cancelled());
        }

        let api_key = match secret {
            SecretPayload::Bearer { api_key } => api_key,
            _ => {
                return Err(ProviderError::new(
                    error::ProviderErrorKind::AuthenticationFailed,
                    "该配置档的凭据类型不支持模型发现。",
                    "请使用 Bearer 凭据。",
                ))
            }
        };

        let url = endpoint::resolve_endpoint(&profile.base_url, endpoint::EndpointKind::Models)?;

        let client = reqwest::Client::new();
        let response = client
            .get(url)
            .header("Authorization", format!("Bearer {}", api_key))
            .send()
            .await
            .map_err(|e| error::err_network(e))?;

        if cancel.load(std::sync::atomic::Ordering::SeqCst) {
            return Err(error::err_cancelled());
        }

        let status = response.status();

        // 404/405 → model discovery unsupported
        if status == reqwest::StatusCode::NOT_FOUND
            || status == reqwest::StatusCode::METHOD_NOT_ALLOWED
        {
            return Ok(ModelDiscoveryResult::Unsupported);
        }

        // 401/403 → authentication failed
        if status == reqwest::StatusCode::UNAUTHORIZED || status == reqwest::StatusCode::FORBIDDEN {
            return Err(ProviderError::new(
                error::ProviderErrorKind::AuthenticationFailed,
                "模型发现请求认证失败。",
                "请检查 API Key 是否正确。",
            )
            .with_http_status(status.as_u16()));
        }

        // Other non-2xx
        if !status.is_success() {
            return Err(ProviderError::new(
                error::ProviderErrorKind::ProviderError,
                format!("模型发现请求返回错误 ({})", status.as_u16()),
                "请检查 API 配置。",
            )
            .with_http_status(status.as_u16()));
        }

        let body = response.text().await.map_err(|e| {
            error::ProviderError::new(
                error::ProviderErrorKind::InvalidResponse,
                format!("读取模型发现响应失败: {}", e),
                "请重试。",
            )
        })?;

        let parsed: serde_json::Value = serde_json::from_str(&body).map_err(|_| {
            error::ProviderError::new(
                error::ProviderErrorKind::InvalidResponse,
                "模型发现响应不是有效的 JSON。",
                "请重试。",
            )
        })?;

        let models = parsed["data"].as_array().ok_or_else(|| {
            error::ProviderError::new(
                error::ProviderErrorKind::InvalidResponse,
                "模型发现响应缺少 data 字段。",
                "请重试。",
            )
        })?;

        let mut ids: Vec<String> = models
            .iter()
            .filter_map(|m| m["id"].as_str().map(|s| s.to_string()))
            .collect();

        ids.sort();
        ids.dedup();

        Ok(ModelDiscoveryResult::Success(ids))
    }
}

impl Default for SummaryRegistry {
    fn default() -> Self {
        Self::new()
    }
}
