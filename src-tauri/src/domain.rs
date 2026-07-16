use serde::{Deserialize, Serialize};
use crate::sensevoice_models::SenseVoiceModelId;

/// Source of the video to process
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum InputSource {
    File { path: String },
    DouyinUrl { url: String },
    BilibiliUrl { url: String },
    YoutubeUrl { url: String },
}

/// Stages of the distillation pipeline
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum TaskStage {
    Downloading,
    SubtitleFetching,
    PreparingAudio,
    Transcribing,
    Distilling,
    CapturingScreenshots,
    Saving,
    Complete,
}

impl TaskStage {
    pub fn label(&self) -> &'static str {
        match self {
            Self::Downloading => "下载中",
            Self::SubtitleFetching => "获取字幕",
            Self::PreparingAudio => "音频准备",
            Self::Transcribing => "转写中",
            Self::Distilling => "核心提炼",
            Self::CapturingScreenshots => "截图中",
            Self::Saving => "保存结果",
            Self::Complete => "完成",
        }
    }
}

/// Optional task settings supplied with a distillation request.
#[derive(Debug, Clone, Copy, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum NoteStyle {
    #[default]
    Minimal,
    Detailed,
    Tutorial,
    Academic,
    Xiaohongshu,
    LifeJournal,
    TaskOriented,
    Business,
    MeetingMinutes,
}

impl NoteStyle {
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Minimal => "minimal",
            Self::Detailed => "detailed",
            Self::Tutorial => "tutorial",
            Self::Academic => "academic",
            Self::Xiaohongshu => "xiaohongshu",
            Self::LifeJournal => "life_journal",
            Self::TaskOriented => "task_oriented",
            Self::Business => "business",
            Self::MeetingMinutes => "meeting_minutes",
        }
    }

    pub fn from_stable_id(value: &str) -> Option<Self> {
        match value {
            "minimal" => Some(Self::Minimal),
            "detailed" => Some(Self::Detailed),
            "tutorial" => Some(Self::Tutorial),
            "academic" => Some(Self::Academic),
            "xiaohongshu" => Some(Self::Xiaohongshu),
            "life_journal" => Some(Self::LifeJournal),
            "task_oriented" => Some(Self::TaskOriented),
            "business" => Some(Self::Business),
            "meeting_minutes" => Some(Self::MeetingMinutes),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Copy, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum TranscriptionMode {
    SensevoiceCpu,
    WhisperLocal,
    #[default]
    OnlineProfile,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum SenseVoiceLanguage {
    Zh,
    En,
    Ja,
    Ko,
    Yue,
}

impl SenseVoiceLanguage {
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Zh => "zh",
            Self::En => "en",
            Self::Ja => "ja",
            Self::Ko => "ko",
            Self::Yue => "yue",
        }
    }
}

pub fn default_sensevoice_languages() -> Vec<SenseVoiceLanguage> {
    vec![SenseVoiceLanguage::Zh]
}

fn is_default_sensevoice_model(model: &SenseVoiceModelId) -> bool {
    *model == SenseVoiceModelId::Int8
}

fn is_default_sensevoice_languages(languages: &[SenseVoiceLanguage]) -> bool {
    languages == [SenseVoiceLanguage::Zh]
}

/// Optional task settings supplied with a distillation request.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct TaskOptions {
    pub note_template: String,
    pub include_screenshots: bool,
    #[serde(default)]
    pub note_style: NoteStyle,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub transcription_mode: Option<TranscriptionMode>,
    #[serde(default, skip_serializing_if = "is_default_sensevoice_model")]
    pub sensevoice_model: SenseVoiceModelId,
    #[serde(
        default = "default_sensevoice_languages",
        skip_serializing_if = "is_default_sensevoice_languages"
    )]
    pub sensevoice_languages: Vec<SenseVoiceLanguage>,
}

impl Default for TaskOptions {
    fn default() -> Self {
        Self {
            note_template: "core_distillation".into(),
            include_screenshots: false,
            note_style: NoteStyle::Minimal,
            transcription_mode: None,
            sensevoice_model: SenseVoiceModelId::Int8,
            sensevoice_languages: default_sensevoice_languages(),
        }
    }
}

/// A timestamped source item supporting a distillation conclusion.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct KeyEvidence {
    pub text: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub timestamp_seconds: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub screenshot_path: Option<String>,
}

/// Progress event emitted during processing
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct TaskProgress {
    pub stage: TaskStage,
    pub message: String,
    pub percent: u8,
}

/// The final distillation output
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Distillation {
    pub core_conclusion: String,
    pub key_evidence: Vec<KeyEvidence>,
    pub implications: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub transcript: Option<String>,
}

/// Application error with recovery hint
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct AppError {
    pub code: String,
    pub message: String,
    pub recovery: String,
}

impl AppError {
    pub fn new(
        code: impl Into<String>,
        message: impl Into<String>,
        recovery: impl Into<String>,
    ) -> Self {
        Self {
            code: code.into(),
            message: message.into(),
            recovery: recovery.into(),
        }
    }
}

/// The structured result payload sent via the task-complete event.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct DistillationResult {
    pub task_id: String,
    pub distillation: Distillation,
    pub saved_path: String,
}

/// Event payload emitted when a provider fallback occurs during transcription.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ProviderFallbackEvent {
    pub from_profile_id: String,
    pub from_profile_name: String,
    pub to_profile_id: String,
    pub to_profile_name: String,
    pub reason: String,
}

/// Result of testing a provider profile connection.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ProfileTestResult {
    pub success: bool,
    pub message: String,
    pub latency_ms: Option<u64>,
}

/// Credential input from the frontend — either a Bearer token or Tencent credentials.
/// Maps to `SecretPayload` for storage.
///
/// Wire format (frontend JSON → Rust):
/// ```json
/// {"type": "bearer", "apiKey": "sk-..."}
/// {"type": "tencent", "appId": "...", "secretId": "...", "secretKey": "..."}
/// ```
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "type")]
pub enum SecretInput {
    #[serde(rename = "bearer")]
    Bearer {
        #[serde(rename = "apiKey")]
        api_key: String,
    },
    #[serde(rename = "tencent")]
    Tencent {
        #[serde(rename = "appId")]
        app_id: String,
        #[serde(rename = "secretId")]
        secret_id: String,
        #[serde(rename = "secretKey")]
        secret_key: String,
    },
}

impl SecretInput {
    /// True when every credential field is empty or whitespace.
    pub fn is_blank(&self) -> bool {
        match self {
            SecretInput::Bearer { api_key } => api_key.trim().is_empty(),
            SecretInput::Tencent { app_id, secret_id, secret_key } => {
                app_id.trim().is_empty() && secret_id.trim().is_empty() && secret_key.trim().is_empty()
            }
        }
    }

    /// Convert this frontend input into a storable `SecretPayload`.
    /// Returns an `AppError` if required fields are empty.
    pub fn into_secret_payload(self) -> Result<crate::credential_store::SecretPayload, AppError> {
        match self {
            SecretInput::Bearer { api_key } => {
                if api_key.trim().is_empty() {
                    return Err(AppError::new(
                        "invalid_credential",
                        "API Key 不能为空。",
                        "请输入有效的 API Key。",
                    ));
                }
                Ok(crate::credential_store::SecretPayload::Bearer { api_key })
            }
            SecretInput::Tencent {
                app_id,
                secret_id,
                secret_key,
            } => {
                if app_id.trim().is_empty() {
                    return Err(AppError::new(
                        "invalid_credential",
                        "腾讯云 AppID 不能为空。",
                        "请填写完整的腾讯云凭据。",
                    ));
                }
                if secret_id.trim().is_empty() {
                    return Err(AppError::new(
                        "invalid_credential",
                        "腾讯云 SecretId 不能为空。",
                        "请填写完整的腾讯云凭据。",
                    ));
                }
                if secret_key.trim().is_empty() {
                    return Err(AppError::new(
                        "invalid_credential",
                        "腾讯云 SecretKey 不能为空。",
                        "请填写完整的腾讯云凭据。",
                    ));
                }
                Ok(crate::credential_store::SecretPayload::Tencent {
                    app_id,
                    secret_id,
                    secret_key,
                })
            }
        }
    }
}
