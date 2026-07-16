use crate::domain::AppError;
use serde::{Deserialize, Serialize};
use std::fs;
use std::io::{Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};

pub const MAX_LOG_TAIL_BYTES: usize = 64 * 1024;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum ExportFormat {
    #[default]
    Markdown,
    Html,
    Text,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportPreferences {
    #[serde(default)]
    pub format: ExportFormat,
    #[serde(default = "default_true")]
    pub include_screenshots: bool,
    #[serde(default = "default_true")]
    pub include_subtitles: bool,
    #[serde(default = "default_true")]
    pub include_source_metadata: bool,
    #[serde(default)]
    pub include_diagnostic_log: bool,
}

impl Default for ExportPreferences {
    fn default() -> Self {
        Self {
            format: ExportFormat::Markdown,
            include_screenshots: true,
            include_subtitles: true,
            include_source_metadata: true,
            include_diagnostic_log: false,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum LogLevel {
    Debug,
    #[default]
    Info,
    Warning,
    Error,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum AppearanceTheme {
    #[default]
    System,
    Light,
    Dark,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct AppearancePreferences {
    #[serde(default)]
    pub theme: AppearanceTheme,
    #[serde(default)]
    pub compact_density: bool,
    #[serde(default)]
    pub reduced_motion: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AboutComponent {
    pub name: String,
    pub version: String,
    pub status: String,
    pub license: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AboutSnapshot {
    pub app_version: String,
    pub tauri_version: String,
    pub frontend_version: String,
    pub rust_version: String,
    pub app_data_dir: String,
    pub export_dir: String,
    pub log_dir: String,
    pub components: Vec<AboutComponent>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CacheCategory {
    TemporaryMedia,
    Screenshots,
    TranscriptionIntermediates,
    AiIndex,
    All,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CacheUsageItem {
    pub category: CacheCategory,
    pub bytes: u64,
    pub file_count: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CacheUsage {
    pub total_bytes: u64,
    pub categories: Vec<CacheUsageItem>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CacheClearResult {
    pub category: CacheCategory,
    pub removed_bytes: u64,
    pub removed_files: u64,
    pub preserved_paths: Vec<PathBuf>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LogDescriptor {
    pub id: String,
    pub name: String,
    pub bytes: u64,
    pub modified_at: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LogTail {
    pub id: String,
    pub content: String,
    pub truncated: bool,
}

#[derive(Debug, Clone)]
pub struct DataManagementService {
    app_data_root: PathBuf,
    temporary_media_root: PathBuf,
}

impl DataManagementService {
    pub fn new(app_data_root: impl Into<PathBuf>, temporary_media_root: impl Into<PathBuf>) -> Self {
        Self {
            app_data_root: app_data_root.into(),
            temporary_media_root: temporary_media_root.into(),
        }
    }

    pub fn cache_usage(&self) -> Result<CacheUsage, AppError> {
        let mut categories = Vec::with_capacity(4);
        let mut total_bytes = 0_u64;
        for category in cache_categories() {
            let (bytes, file_count) = directory_usage(&self.cache_root(category))?;
            total_bytes = total_bytes.saturating_add(bytes);
            categories.push(CacheUsageItem {
                category,
                bytes,
                file_count,
            });
        }
        Ok(CacheUsage {
            total_bytes,
            categories,
        })
    }

    pub fn clear_cache(&self, category: CacheCategory) -> Result<CacheClearResult, AppError> {
        let categories: Vec<CacheCategory> = match category {
            CacheCategory::All => cache_categories().to_vec(),
            value => vec![value],
        };
        let mut removed_bytes = 0_u64;
        let mut removed_files = 0_u64;
        for item in categories {
            let root = self.cache_root(item);
            let (bytes, files) = directory_usage(&root)?;
            clear_directory_contents(&root)?;
            removed_bytes = removed_bytes.saturating_add(bytes);
            removed_files = removed_files.saturating_add(files);
        }
        Ok(CacheClearResult {
            category,
            removed_bytes,
            removed_files,
            preserved_paths: vec![
                self.app_data_root.join("history-assets"),
                self.app_data_root.join("models"),
                self.app_data_root.join("runtimes"),
                self.app_data_root.join("capability-outputs"),
            ],
        })
    }

    pub fn list_logs(&self) -> Result<Vec<LogDescriptor>, AppError> {
        let log_root = self.log_root();
        if !log_root.exists() {
            return Ok(Vec::new());
        }
        let mut logs = Vec::new();
        for entry in fs::read_dir(&log_root).map_err(file_error)? {
            let entry = entry.map_err(file_error)?;
            let file_type = entry.file_type().map_err(file_error)?;
            if !file_type.is_file() {
                continue;
            }
            let name = entry.file_name().to_string_lossy().into_owned();
            if !valid_log_id(&name) {
                continue;
            }
            let metadata = entry.metadata().map_err(file_error)?;
            let modified_at = metadata
                .modified()
                .ok()
                .map(chrono::DateTime::<chrono::Utc>::from)
                .map(|value| value.to_rfc3339());
            logs.push(LogDescriptor {
                id: name.clone(),
                name,
                bytes: metadata.len(),
                modified_at,
            });
        }
        logs.sort_by(|left, right| left.id.cmp(&right.id));
        Ok(logs)
    }

    pub fn read_log(&self, id: &str, requested_bytes: usize) -> Result<LogTail, AppError> {
        if !valid_log_id(id) {
            return Err(AppError::new(
                "log_id_invalid",
                "日志标识无效。",
                "请从日志列表中重新选择。",
            ));
        }
        let allowed = requested_bytes.clamp(1, MAX_LOG_TAIL_BYTES);
        let path = self.log_root().join(id);
        let metadata = fs::symlink_metadata(&path).map_err(file_error)?;
        if !metadata.file_type().is_file() {
            return Err(AppError::new(
                "log_unavailable",
                "日志文件不可读取。",
                "请刷新日志列表后重试。",
            ));
        }
        let file_len = metadata.len();
        let read_len = usize::try_from(file_len.min(allowed as u64)).unwrap_or(allowed);
        let mut file = fs::File::open(&path).map_err(file_error)?;
        file.seek(SeekFrom::Start(file_len.saturating_sub(read_len as u64)))
            .map_err(file_error)?;
        let mut bytes = vec![0_u8; read_len];
        file.read_exact(&mut bytes).map_err(file_error)?;
        Ok(LogTail {
            id: id.to_string(),
            content: String::from_utf8_lossy(&bytes).into_owned(),
            truncated: file_len > read_len as u64,
        })
    }

    pub fn clear_logs(&self) -> Result<u64, AppError> {
        let mut removed = 0_u64;
        for descriptor in self.list_logs()? {
            let path = self.log_root().join(&descriptor.id);
            fs::remove_file(path).map_err(file_error)?;
            removed = removed.saturating_add(descriptor.bytes);
        }
        Ok(removed)
    }

    pub fn app_data_root(&self) -> &Path {
        &self.app_data_root
    }

    pub fn log_root(&self) -> PathBuf {
        self.app_data_root.join("logs")
    }

    fn cache_root(&self, category: CacheCategory) -> PathBuf {
        match category {
            CacheCategory::TemporaryMedia => self.temporary_media_root.clone(),
            CacheCategory::Screenshots => self.app_data_root.join("cache/screenshots"),
            CacheCategory::TranscriptionIntermediates => {
                self.app_data_root.join("cache/transcription")
            }
            CacheCategory::AiIndex => self.app_data_root.join("cache/ai-index"),
            CacheCategory::All => self.app_data_root.join("cache"),
        }
    }
}

pub fn serialize_note(format: ExportFormat, title: &str, markdown: &str) -> String {
    match format {
        ExportFormat::Markdown => markdown.to_string(),
        ExportFormat::Html => markdown_to_html(title, markdown),
        ExportFormat::Text => markdown_to_text(markdown),
    }
}

fn cache_categories() -> [CacheCategory; 4] {
    [
        CacheCategory::TemporaryMedia,
        CacheCategory::Screenshots,
        CacheCategory::TranscriptionIntermediates,
        CacheCategory::AiIndex,
    ]
}

fn default_true() -> bool {
    true
}

fn directory_usage(root: &Path) -> Result<(u64, u64), AppError> {
    if !root.exists() {
        return Ok((0, 0));
    }
    let mut bytes = 0_u64;
    let mut files = 0_u64;
    for entry in fs::read_dir(root).map_err(file_error)? {
        let entry = entry.map_err(file_error)?;
        let metadata = fs::symlink_metadata(entry.path()).map_err(file_error)?;
        if metadata.file_type().is_symlink() {
            continue;
        }
        if metadata.is_dir() {
            let (nested_bytes, nested_files) = directory_usage(&entry.path())?;
            bytes = bytes.saturating_add(nested_bytes);
            files = files.saturating_add(nested_files);
        } else if metadata.is_file() {
            bytes = bytes.saturating_add(metadata.len());
            files = files.saturating_add(1);
        }
    }
    Ok((bytes, files))
}

fn clear_directory_contents(root: &Path) -> Result<(), AppError> {
    if !root.exists() {
        fs::create_dir_all(root).map_err(file_error)?;
        return Ok(());
    }
    for entry in fs::read_dir(root).map_err(file_error)? {
        let entry = entry.map_err(file_error)?;
        let path = entry.path();
        let metadata = fs::symlink_metadata(&path).map_err(file_error)?;
        if metadata.file_type().is_symlink() || metadata.is_file() {
            fs::remove_file(path).map_err(file_error)?;
        } else if metadata.is_dir() {
            fs::remove_dir_all(path).map_err(file_error)?;
        }
    }
    Ok(())
}

fn valid_log_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 128
        && id.ends_with(".log")
        && !id.contains("..")
        && id
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'-' | b'_'))
}

fn markdown_to_html(title: &str, markdown: &str) -> String {
    let mut body = String::new();
    let mut in_list = false;
    for line in markdown.lines() {
        let trimmed = line.trim();
        if let Some(text) = trimmed.strip_prefix("- ") {
            if !in_list {
                body.push_str("<ul>\n");
                in_list = true;
            }
            body.push_str("<li>");
            body.push_str(&escape_html(text));
            body.push_str("</li>\n");
            continue;
        }
        if in_list {
            body.push_str("</ul>\n");
            in_list = false;
        }
        if trimmed.is_empty() {
            continue;
        }
        let heading_level = trimmed.chars().take_while(|ch| *ch == '#').count();
        if (1..=6).contains(&heading_level)
            && trimmed.as_bytes().get(heading_level) == Some(&b' ')
        {
            let text = trimmed[(heading_level + 1)..].trim();
            body.push_str(&format!(
                "<h{heading_level}>{}</h{heading_level}>\n",
                escape_html(text)
            ));
        } else {
            body.push_str("<p>");
            body.push_str(&escape_html(trimmed));
            body.push_str("</p>\n");
        }
    }
    if in_list {
        body.push_str("</ul>\n");
    }
    format!(
        "<!doctype html>\n<html lang=\"zh-CN\"><head><meta charset=\"utf-8\"><title>{}</title></head><body>\n{body}</body></html>\n",
        escape_html(title)
    )
}

fn markdown_to_text(markdown: &str) -> String {
    markdown
        .lines()
        .map(|line| {
            line.trim()
                .trim_start_matches('#')
                .trim_start()
                .strip_prefix("- ")
                .unwrap_or_else(|| line.trim().trim_start_matches('#').trim_start())
                .replace(['*', '`'], "")
        })
        .collect::<Vec<_>>()
        .join("\n")
}

fn escape_html(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&#39;")
}

fn file_error(error: std::io::Error) -> AppError {
    AppError::new(
        "data_management_io",
        format!("数据管理操作失败: {error}"),
        "请检查应用数据目录权限后重试。",
    )
}
