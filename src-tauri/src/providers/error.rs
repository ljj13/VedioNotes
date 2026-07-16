// == Provider Error Normalization ============================================
//
// Normalized error types for all provider adapters. These replace raw HTTP
// status codes and provider-specific error responses with a uniform set of
// categories and structured error values.
//
// Security invariants:
// - ProviderError never contains credentials, Bearer tokens, request bodies,
//   MiMo Base64 audio, or complete raw response bodies.
// - The `message` and `recovery` fields are user-facing and must not leak
//   secret/sensitive data.
// - provider_code may contain non-sensitive provider error codes (e.g.
//   Tencent's 4002, 4003) to aid diagnostics without leaking secrets.

use crate::domain::AppError;
use serde::Serialize;
use std::fmt;

// ---------------------------------------------------------------------------
// ProviderErrorKind
// ---------------------------------------------------------------------------

/// Normalized categories of provider errors.
///
/// Only `QuotaExhausted` and `BillingUnavailable` are eligible for automatic
/// quota fallback. All other error kinds represent unrecoverable (from the
/// fallback perspective) failures.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ProviderErrorKind {
    /// Free quota or resource-pack exhausted (Tencent 4004).
    QuotaExhausted,
    /// Account in arrears, billing suspended (Tencent 4005).
    BillingUnavailable,
    /// Invalid API key, expired/incorrect secret, signature mismatch.
    AuthenticationFailed,
    /// Request rate limit exceeded (HTTP 429).
    RateLimited,
    /// DNS, connection timeout, refused, or other transport-level failure.
    NetworkError,
    /// Provider returned malformed JSON, missing fields, or empty content.
    InvalidResponse,
    /// Provider returned a recognized error not covered above.
    ProviderError,
    /// Request was cancelled before or during the operation.
    Cancelled,
}

impl ProviderErrorKind {
    /// Whether this error kind may trigger an automatic quota fallback
    /// (retry with a different provider).
    ///
    /// Only true for `QuotaExhausted` and `BillingUnavailable`.
    pub fn allows_quota_fallback(&self) -> bool {
        matches!(self, Self::QuotaExhausted | Self::BillingUnavailable)
    }
}

impl fmt::Display for ProviderErrorKind {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let label = match self {
            Self::QuotaExhausted => "quota_exhausted",
            Self::BillingUnavailable => "billing_unavailable",
            Self::AuthenticationFailed => "authentication_failed",
            Self::RateLimited => "rate_limited",
            Self::NetworkError => "network_error",
            Self::InvalidResponse => "invalid_response",
            Self::ProviderError => "provider_error",
            Self::Cancelled => "cancelled",
        };
        write!(f, "{}", label)
    }
}

// ---------------------------------------------------------------------------
// ProviderError
// ---------------------------------------------------------------------------

/// A structured, normalized provider error.
///
/// # Security
///
/// - `message` and `recovery` are safe for user display. They do not contain
///   API keys, Bearer tokens, authorization headers, audio Base64, request
///   bodies, or complete raw response bodies.
/// - `provider_code` may carry a non-sensitive provider error code (e.g.
///   Tencent code 4002). It is optional.
/// - `http_status` carries the HTTP status code if the error originated from
///   an HTTP response. It is optional.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct ProviderError {
    /// The normalized error kind.
    pub kind: ProviderErrorKind,
    /// A user-safe error description.
    pub message: String,
    /// A user-safe recovery suggestion.
    pub recovery: String,
    /// An optional provider-specific error code (non-sensitive).
    pub provider_code: Option<String>,
    /// The HTTP status code that caused this error, if applicable.
    pub http_status: Option<u16>,
}

impl ProviderError {
    /// Create a new `ProviderError` from its parts.
    pub fn new(
        kind: ProviderErrorKind,
        message: impl Into<String>,
        recovery: impl Into<String>,
    ) -> Self {
        Self {
            kind,
            message: message.into(),
            recovery: recovery.into(),
            provider_code: None,
            http_status: None,
        }
    }

    /// Attach a provider-specific error code (non-sensitive).
    pub fn with_provider_code(mut self, code: impl Into<String>) -> Self {
        self.provider_code = Some(code.into());
        self
    }

    /// Attach an HTTP status code.
    pub fn with_http_status(mut self, status: u16) -> Self {
        self.http_status = Some(status);
        self
    }

    /// Convert this `ProviderError` into an `AppError` for use in Tauri
    /// command results.
    pub fn into_app_error(self) -> AppError {
        AppError::new(self.kind.to_string(), self.message, self.recovery)
    }
}

impl fmt::Display for ProviderError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(
            f,
            "[{}] {} (recovery: {})",
            self.kind, self.message, self.recovery
        )
    }
}

impl std::error::Error for ProviderError {}

// ---------------------------------------------------------------------------
// Convenience constructors
// ---------------------------------------------------------------------------

/// Build an `InvalidResponse` error for a missing/empty transcript or
/// chat-completion content.
pub fn err_invalid_response(reason: impl Into<String>) -> ProviderError {
    ProviderError::new(ProviderErrorKind::InvalidResponse, reason, "请重试此任务。")
}

/// Build a `NetworkError` for transport-level failures.
///
/// The raw transport error detail is intentionally omitted from the message
/// to prevent credential-bearing URL strings (e.g. Tencent signed URLs
/// containing `secretid`) from appearing in diagnostics.
pub fn err_network(_detail: impl std::fmt::Display) -> ProviderError {
    ProviderError::new(
        ProviderErrorKind::NetworkError,
        "网络请求失败，请检查网络连接和 API 配置。",
        "请检查网络连接和 API 配置。",
    )
}

/// Build a `Cancelled` error.
pub fn err_cancelled() -> ProviderError {
    ProviderError::new(
        ProviderErrorKind::Cancelled,
        "任务已取消。",
        "点击开始提炼重新开始。",
    )
}
