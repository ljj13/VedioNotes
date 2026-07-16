// == Provider Profile Domain Types ==========================================
//
// Versioned, serializable profile definitions for transcription and summary
// providers. No API keys, secrets, or credential values exist in these types.
// All secret data lives in credential_store.rs and is accessed by profile ID.

use serde::{Deserialize, Serialize};
use std::collections::HashSet;

use crate::local_models::{descriptor, LOCAL_WHISPER_PROFILE_ID};
use crate::provider_catalog::{provider as catalog_provider, SummaryProtocolKind};

// ---------------------------------------------------------------------------
// Provider kinds (snake-case wire values)
// ---------------------------------------------------------------------------

/// Kinds of transcription providers supported.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum TranscriptionProviderKind {
    TencentFlash,
    MimoAsr,
    OpenAiCompatible,
    LocalWhisperCpp,
}

/// Kinds of summary providers supported.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum SummaryProviderKind {
    DeepSeek,
    Mimo,
    OpenAiCompatible,
    OpenAiResponses,
    Anthropic,
    Google,
}

// ---------------------------------------------------------------------------
// Profile structs
// ---------------------------------------------------------------------------

/// A transcription provider profile.
///
/// No secret fields exist here. Credentials are stored separately in
/// the Windows Credential Manager via `credential_store`.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TranscriptionProfile {
    /// Stable unique identifier (UUID v4 string).
    pub id: String,
    /// User-visible display name (trimmed).
    pub name: String,
    /// Provider kind.
    pub provider: TranscriptionProviderKind,
    /// API base URL (must be HTTPS except localhost).
    pub base_url: String,
    /// Model identifier.
    pub model: String,
    /// Whether this profile is enabled for selection.
    pub enabled: bool,
    /// Whether this is a built-in preset (vs. user-created).
    pub built_in: bool,
}

/// A summary provider profile.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SummaryProfile {
    /// Stable unique identifier (UUID v4 string).
    pub id: String,
    /// User-visible display name (trimmed).
    pub name: String,
    /// Provider kind.
    pub provider: SummaryProviderKind,
    /// Optional identity in the embedded models.dev provider catalog.
    #[serde(default)]
    pub catalog_provider_id: Option<String>,
    /// API base URL (must be HTTPS except localhost).
    pub base_url: String,
    /// Model identifier.
    pub model: String,
    /// Whether this profile is enabled for selection.
    pub enabled: bool,
    /// Whether this is a built-in preset (vs. user-created).
    pub built_in: bool,
}

/// The top-level versioned settings document.
///
/// Serialized with camelCase JSON field names to match frontend conventions.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppProfiles {
    /// Schema version for forward-compatible migration.
    pub schema_version: u32,
    /// ID of the currently active transcription profile.
    pub active_transcription_profile_id: Option<String>,
    /// ID of the currently active summary profile.
    pub active_summary_profile_id: Option<String>,
    /// ID of the fallback transcription profile (used on quota exhaustion).
    pub fallback_transcription_profile_id: Option<String>,
    /// Whether migration from the legacy single API key is still required.
    /// Set to `true` when the legacy `video-distiller/api-key` credential exists
    /// and the user has not yet completed the guided migration process.
    /// Reset to `false` only after the user explicitly confirms migration completion
    /// and both active transcription and summary profiles are credential-ready.
    pub migration_required: bool,
    /// All transcription profiles.
    pub transcription_profiles: Vec<TranscriptionProfile>,
    /// All summary profiles.
    pub summary_profiles: Vec<SummaryProfile>,
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

impl AppProfiles {
    /// Validate the entire profiles document.
    ///
    /// Returns `Ok(())` if valid, or an `Err` with a semicolon-separated list
    /// of descriptive error messages.
    pub fn validate(&self) -> Result<(), String> {
        let mut errors: Vec<String> = Vec::new();

        // Enforce supported schema version
        if self.schema_version != 1 {
            errors.push(format!(
                "unsupported schema version: {} (expected: 1)",
                self.schema_version
            ));
        }

        let enabled_transcription_ids: HashSet<&str> = self
            .transcription_profiles
            .iter()
            .filter(|p| p.enabled)
            .map(|p| p.id.as_str())
            .collect();

        // Validate each transcription profile
        for profile in &self.transcription_profiles {
            if let Err(e) = validate_transcription_profile(profile) {
                errors.push(format!("transcription '{}': {}", profile.id, e));
            }
        }

        // Validate each summary profile
        for profile in &self.summary_profiles {
            if let Err(e) = validate_profile_base(
                &profile.id,
                &profile.name,
                &profile.base_url,
                &profile.model,
            ) {
                errors.push(format!("summary '{}': {}", profile.id, e));
            }
            if let Some(catalog_provider_id) = profile.catalog_provider_id.as_deref() {
                match catalog_provider(catalog_provider_id) {
                    Ok(entry) if entry.protocol == summary_protocol_kind(&profile.provider) => {}
                    Ok(_) => errors.push(format!(
                        "summary '{}': catalog protocol does not match profile provider",
                        profile.id
                    )),
                    Err(_) => errors.push(format!(
                        "summary '{}': catalog provider is unknown",
                        profile.id
                    )),
                }
            }
        }

        // Validate active transcription profile ID
        if let Some(ref active_id) = self.active_transcription_profile_id {
            if !enabled_transcription_ids.contains(active_id.as_str()) {
                errors.push(format!(
                    "active_transcription_profile_id '{}' does not reference an enabled transcription profile",
                    active_id
                ));
            }
        }

        // Validate active summary profile ID
        if let Some(ref active_id) = self.active_summary_profile_id {
            let enabled_summary_ids: HashSet<&str> = self
                .summary_profiles
                .iter()
                .filter(|p| p.enabled)
                .map(|p| p.id.as_str())
                .collect();
            if !enabled_summary_ids.contains(active_id.as_str()) {
                errors.push(format!(
                    "active_summary_profile_id '{}' does not reference an enabled summary profile",
                    active_id
                ));
            }
        }

        // Validate fallback transcription profile ID
        if let Some(ref fallback_id) = self.fallback_transcription_profile_id {
            // Must reference an enabled transcription profile
            if !enabled_transcription_ids.contains(fallback_id.as_str()) {
                errors.push(format!(
                    "fallback_transcription_profile_id '{}' does not reference an enabled transcription profile",
                    fallback_id
                ));
            }

            // Must not be a Tencent profile
            let is_tencent = self.transcription_profiles.iter().any(|p| {
                p.id == *fallback_id && p.provider == TranscriptionProviderKind::TencentFlash
            });
            if is_tencent {
                errors.push(
                    "fallback transcription profile must not be a Tencent Flash profile".into(),
                );
            }
        }

        // Validate that all referenced profile IDs actually exist
        // (already covered above by checking enabled_transcription_ids)

        if errors.is_empty() {
            Ok(())
        } else {
            Err(errors.join("; "))
        }
    }
}

// ---------------------------------------------------------------------------
// Built-in defaults
// ---------------------------------------------------------------------------

impl AppProfiles {
    /// Return the built-in local whisper.cpp profile without selecting or enabling it.
    pub fn local_whisper_default() -> TranscriptionProfile {
        TranscriptionProfile {
            id: LOCAL_WHISPER_PROFILE_ID.into(),
            name: "本地 Whisper（whisper.cpp）".into(),
            provider: TranscriptionProviderKind::LocalWhisperCpp,
            base_url: String::new(),
            model: String::new(),
            enabled: false,
            built_in: true,
        }
    }

    /// Add built-in profiles introduced after an older configuration was saved.
    /// Existing persisted profiles and active IDs always take precedence.
    pub fn ensure_builtin_profiles(&mut self) -> bool {
        let mut changed = false;
        if !self
            .transcription_profiles
            .iter()
            .any(|profile| profile.id == LOCAL_WHISPER_PROFILE_ID)
        {
            self.transcription_profiles
                .push(Self::local_whisper_default());
            changed = true;
        }

        for profile in &mut self.summary_profiles {
            if profile.catalog_provider_id.is_some() {
                continue;
            }
            profile.catalog_provider_id = match profile.provider {
                SummaryProviderKind::DeepSeek => Some("deepseek".into()),
                SummaryProviderKind::Mimo => Some("xiaomi".into()),
                _ => None,
            };
            changed |= profile.catalog_provider_id.is_some();
        }

        changed
    }

    /// Create a new `AppProfiles` with built-in default presets.
    ///
    /// Presets are created with IDs matching their stable names. They are
    /// marked `built_in: true` and are not automatically credential-ready
    /// — users must configure credentials separately.
    pub fn defaults() -> Self {
        Self {
            schema_version: 1,
            active_transcription_profile_id: None,
            active_summary_profile_id: None,
            fallback_transcription_profile_id: None,
            migration_required: false,
            transcription_profiles: vec![
                TranscriptionProfile {
                    id: "tencent-flash".into(),
                    name: "腾讯云极速版".into(),
                    provider: TranscriptionProviderKind::TencentFlash,
                    base_url: "https://asr.cloud.tencent.com".into(),
                    model: "16k_zh".into(),
                    enabled: false,
                    built_in: true,
                },
                TranscriptionProfile {
                    id: "mimo-asr".into(),
                    name: "MiMo ASR".into(),
                    provider: TranscriptionProviderKind::MimoAsr,
                    base_url: "https://api.xiaomimimo.com".into(),
                    model: "mimo-v2.5-asr".into(),
                    enabled: false,
                    built_in: true,
                },
                TranscriptionProfile {
                    id: "custom-openai-asr".into(),
                    name: "自定义 OpenAI 兼容转写".into(),
                    provider: TranscriptionProviderKind::OpenAiCompatible,
                    base_url: "https://api.openai.com".into(),
                    model: "whisper-1".into(),
                    enabled: false,
                    built_in: true,
                },
                Self::local_whisper_default(),
            ],
            summary_profiles: vec![
                SummaryProfile {
                    id: "deepseek-main".into(),
                    name: "DeepSeek".into(),
                    provider: SummaryProviderKind::DeepSeek,
                    catalog_provider_id: Some("deepseek".into()),
                    base_url: "https://api.deepseek.com".into(),
                    model: "deepseek-chat".into(),
                    enabled: false,
                    built_in: true,
                },
                SummaryProfile {
                    id: "mimo-summary".into(),
                    name: "MiMo".into(),
                    provider: SummaryProviderKind::Mimo,
                    catalog_provider_id: Some("xiaomi".into()),
                    base_url: "https://api.xiaomimimo.com".into(),
                    model: "mimo-v2.5".into(),
                    enabled: false,
                    built_in: true,
                },
                SummaryProfile {
                    id: "custom-openai-summary".into(),
                    name: "自定义 OpenAI 兼容总结".into(),
                    provider: SummaryProviderKind::OpenAiCompatible,
                    catalog_provider_id: None,
                    base_url: "https://api.openai.com".into(),
                    model: "gpt-4o-mini".into(),
                    enabled: false,
                    built_in: true,
                },
            ],
        }
    }

    /// Check whether a transcription preset with the given stable ID exists.
    pub fn has_transcription_preset(&self, id: &str) -> bool {
        self.transcription_profiles
            .iter()
            .any(|p| p.id == id && p.built_in)
    }

    /// Check whether a summary preset with the given stable ID exists.
    pub fn has_summary_preset(&self, id: &str) -> bool {
        self.summary_profiles
            .iter()
            .any(|p| p.id == id && p.built_in)
    }
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

/// Validate the common base fields of a profile.
///
/// Rules:
/// - `id` must be non-empty.
/// - `name` must be non-empty after trimming.
/// - `base_url` must be non-empty after trimming, and must be HTTPS except
///   `http://127.0.0.1` and `http://localhost` (any port allowed).
/// - `model` must be non-empty after trimming.
fn summary_protocol_kind(provider: &SummaryProviderKind) -> SummaryProtocolKind {
    match provider {
        SummaryProviderKind::DeepSeek
        | SummaryProviderKind::Mimo
        | SummaryProviderKind::OpenAiCompatible => SummaryProtocolKind::OpenAiCompatible,
        SummaryProviderKind::OpenAiResponses => SummaryProtocolKind::OpenAiResponses,
        SummaryProviderKind::Anthropic => SummaryProtocolKind::Anthropic,
        SummaryProviderKind::Google => SummaryProtocolKind::Google,
    }
}

fn validate_profile_base(id: &str, name: &str, base_url: &str, model: &str) -> Result<(), String> {
    if id.trim().is_empty() {
        return Err("id must not be empty".into());
    }
    if name.trim().is_empty() {
        return Err("name must not be empty".into());
    }
    let trimmed_url = base_url.trim();
    if trimmed_url.is_empty() {
        return Err("base_url must not be empty".into());
    }
    if !is_url_allowed(trimmed_url) {
        return Err(format!(
            "base_url '{}' must use HTTPS (except http://127.0.0.1 and http://localhost)",
            trimmed_url
        ));
    }
    if model.trim().is_empty() {
        return Err("model must not be empty".into());
    }
    Ok(())
}

fn validate_transcription_profile(profile: &TranscriptionProfile) -> Result<(), String> {
    if profile.id.trim().is_empty() {
        return Err("id must not be empty".into());
    }
    if profile.name.trim().is_empty() {
        return Err("name must not be empty".into());
    }

    match profile.provider {
        TranscriptionProviderKind::LocalWhisperCpp => {
            if !profile.base_url.is_empty()
                || (!profile.model.is_empty() && descriptor(&profile.model).is_none())
            {
                return Err("本地 Whisper 不接受 API 端点或未知本地模型。".into());
            }
            Ok(())
        }
        _ => validate_profile_base(
            &profile.id,
            &profile.name,
            &profile.base_url,
            &profile.model,
        ),
    }
}

/// Check whether a URL is allowed.
///
/// Allows: HTTPS on any host, or HTTP on 127.0.0.1 or localhost (any port).
fn is_url_allowed(url: &str) -> bool {
    if url.starts_with("https://") {
        return true;
    }
    if url.starts_with("http://127.0.0.1") || url.starts_with("http://localhost") {
        return true;
    }
    false
}
