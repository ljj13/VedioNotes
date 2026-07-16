use crate::domain::{default_sensevoice_languages, AppError, SenseVoiceLanguage, TranscriptionMode};
use crate::cuda_runtime::LocalComputeMode;
use crate::data_management::{AppearancePreferences, ExportPreferences, LogLevel};
use crate::sensevoice_models::SenseVoiceModelId;
use serde::{Deserialize, Serialize};
use std::io::Write;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppPreferences {
    pub schema_version: u32,
    pub markdown_output_dir: Option<String>,
    #[serde(default)]
    pub local_compute_mode: LocalComputeMode,
    #[serde(default)]
    pub transcription_mode: TranscriptionMode,
    #[serde(default)]
    pub sensevoice_model: SenseVoiceModelId,
    #[serde(default = "default_sensevoice_languages")]
    pub sensevoice_languages: Vec<SenseVoiceLanguage>,
    #[serde(default)]
    pub appearance: AppearancePreferences,
    #[serde(default)]
    pub export: ExportPreferences,
    #[serde(default)]
    pub log_level: LogLevel,
}

impl Default for AppPreferences {
    fn default() -> Self {
        Self {
            schema_version: 1,
            markdown_output_dir: None,
            local_compute_mode: LocalComputeMode::Auto,
            transcription_mode: TranscriptionMode::OnlineProfile,
            sensevoice_model: SenseVoiceModelId::Int8,
            sensevoice_languages: default_sensevoice_languages(),
            appearance: AppearancePreferences::default(),
            export: ExportPreferences::default(),
            log_level: LogLevel::Info,
        }
    }
}

pub struct PreferencesStore {
    path: PathBuf,
}

impl PreferencesStore {
    pub fn new(path: impl Into<PathBuf>) -> Self {
        Self { path: path.into() }
    }

    pub fn load(&self) -> Result<AppPreferences, AppError> {
        if !self.path.exists() {
            return Ok(AppPreferences::default());
        }

        let bytes = std::fs::read(&self.path).map_err(|e| {
            AppError::new(
                "preferences_corrupt",
                format!("无法读取偏好设置: {e}"),
                "请检查偏好设置文件权限。",
            )
        })?;
        let preferences: AppPreferences = serde_json::from_slice(&bytes).map_err(|_| {
            AppError::new(
                "preferences_corrupt",
                "偏好设置文件格式无效。",
                "原文件已保留，请修复或移走后重试。",
            )
        })?;

        if preferences.schema_version != 1 {
            return Err(AppError::new(
                "preferences_corrupt",
                format!("不支持的偏好设置版本: {}", preferences.schema_version),
                "请使用当前版本重新保存偏好设置。",
            ));
        }
        validate_custom_directory(preferences.markdown_output_dir.as_deref(), false)?;
        validate_sensevoice_languages(&preferences.sensevoice_languages)?;
        Ok(preferences)
    }

    pub fn save(&self, preferences: &AppPreferences) -> Result<(), AppError> {
        if preferences.schema_version != 1 {
            return Err(AppError::new(
                "preferences_invalid",
                "偏好设置版本无效。",
                "请重置偏好设置后重试。",
            ));
        }
        validate_custom_directory(preferences.markdown_output_dir.as_deref(), true)?;
        validate_sensevoice_languages(&preferences.sensevoice_languages)?;

        if let Some(parent) = self.path.parent() {
            std::fs::create_dir_all(parent).map_err(io_error)?;
        }
        let json = serde_json::to_vec_pretty(preferences).map_err(|e| {
            AppError::new(
                "preferences_invalid",
                format!("无法序列化偏好设置: {e}"),
                "请重试。",
            )
        })?;
        let parent = self.path.parent().unwrap_or_else(|| Path::new("."));
        let mut temporary = tempfile::Builder::new()
            .prefix(".preferences-")
            .tempfile_in(parent)
            .map_err(io_error)?;
        temporary.write_all(&json).map_err(io_error)?;
        temporary.flush().map_err(io_error)?;
        temporary.as_file().sync_all().map_err(io_error)?;
        temporary
            .persist(&self.path)
            .map_err(|error| io_error(error.error))?;
        Ok(())
    }
}

fn validate_sensevoice_languages(languages: &[SenseVoiceLanguage]) -> Result<(), AppError> {
    if languages.is_empty() {
        return Err(AppError::new(
            "sensevoice_languages_empty",
            "SenseVoice 至少需要一种识别语言。",
            "请至少选择一种识别语言。",
        ));
    }
    Ok(())
}

pub fn resolve_markdown_output_dir(preferences: &AppPreferences) -> Result<PathBuf, AppError> {
    let directory = match preferences.markdown_output_dir.as_deref() {
        Some(path) => PathBuf::from(path.trim()),
        None => dirs::video_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join("video-distiller"),
    };
    ensure_directory(&directory)?;
    Ok(directory)
}

pub fn create_task_work_dir(task_id: &str) -> Result<PathBuf, AppError> {
    if task_id.is_empty()
        || !task_id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_'))
    {
        return Err(AppError::new(
            "invalid_task_id",
            "任务 ID 格式无效。",
            "请重新开始任务。",
        ));
    }
    let directory = std::env::temp_dir().join("video-distiller").join(task_id);
    if directory.exists() {
        return Err(AppError::new(
            "task_workspace_exists",
            "任务工作目录已存在。",
            "请重新开始任务以生成新的任务 ID。",
        ));
    }
    ensure_directory(&directory)?;
    Ok(directory)
}

fn validate_custom_directory(path: Option<&str>, create: bool) -> Result<(), AppError> {
    let Some(path) = path else {
        return Ok(());
    };
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return Err(invalid_output_directory("保存目录不能为空。"));
    }
    let directory = Path::new(trimmed);
    if directory.exists() && !directory.is_dir() {
        return Err(invalid_output_directory("保存位置不是文件夹。"));
    }
    if create {
        ensure_directory(directory)?;
    }
    Ok(())
}

fn ensure_directory(path: &Path) -> Result<(), AppError> {
    std::fs::create_dir_all(path).map_err(|e| {
        AppError::new(
            "invalid_output_directory",
            format!("无法创建保存目录: {e}"),
            "请选择可写入的文件夹。",
        )
    })?;
    if !path.is_dir() {
        return Err(invalid_output_directory("保存位置不是文件夹。"));
    }
    Ok(())
}

fn invalid_output_directory(message: &str) -> AppError {
    AppError::new("invalid_output_directory", message, "请选择有效的文件夹。")
}

fn io_error(error: std::io::Error) -> AppError {
    AppError::new(
        "preferences_io_error",
        format!("偏好设置写入失败: {error}"),
        "请检查磁盘空间和文件夹权限。",
    )
}
