use crate::domain::AppError;
use std::path::{Path, PathBuf};
use std::process::Stdio;

use crate::process_utils::hidden_command;

const DOUYIN_HOSTS: &[&str] = &[
    "douyin.com",
    "www.douyin.com",
    "v.douyin.com",
    "iesdouyin.com",
    "www.iesdouyin.com",
];

const BILIBILI_HOSTS: &[&str] = &["bilibili.com", "b23.tv"];
const YOUTUBE_HOSTS: &[&str] = &["youtube.com", "youtu.be"];

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum VideoPlatform {
    Bilibili,
    Youtube,
    Douyin,
}

fn is_official_host(host: &str, allowed_hosts: &[&str]) -> bool {
    allowed_hosts
        .iter()
        .any(|allowed| host == *allowed || host.ends_with(&format!(".{allowed}")))
}

pub fn classify_platform_url(url: &str) -> Result<VideoPlatform, AppError> {
    let parsed = url::Url::parse(url).map_err(|_| {
        AppError::new(
            "invalid_url",
            "无法解析的链接。",
            "请使用支持平台的分享链接，或选择本地视频/音频。",
        )
    })?;
    let host = parsed.host_str().unwrap_or("").to_ascii_lowercase();

    if is_official_host(&host, BILIBILI_HOSTS) {
        Ok(VideoPlatform::Bilibili)
    } else if is_official_host(&host, YOUTUBE_HOSTS) {
        Ok(VideoPlatform::Youtube)
    } else if is_official_host(&host, DOUYIN_HOSTS) {
        Ok(VideoPlatform::Douyin)
    } else {
        Err(AppError::new(
            "invalid_url",
            format!("不支持的链接: {host}"),
            "请使用支持平台的分享链接，或选择本地视频/音频。",
        ))
    }
}

pub fn validate_douyin_url(url: &str) -> Result<(), AppError> {
    if matches!(classify_platform_url(url), Ok(VideoPlatform::Douyin)) {
        Ok(())
    } else {
        Err(AppError::new(
            "invalid_url",
            "不支持的抖音链接。",
            "请使用抖音分享链接，或选择本地视频/音频。",
        ))
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CaptureMethod {
    Anonymous,
    ManualCookie,
}

impl CaptureMethod {
    fn progress_message(self) -> &'static str {
        match self {
            Self::Anonymous => "正在匿名抓取音频...",
            Self::ManualCookie => "正在使用已保存的手动 Cookie 重试...",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CapturePurpose {
    Audio,
}

#[derive(Debug, Clone)]
pub struct CaptureAttempt {
    pub method: CaptureMethod,
    pub args: Vec<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AttemptFailureCategory {
    None,
    ToolMissing,
    BrowserUnavailable,
    CookieUnavailable,
    AccessDenied,
    NoAudio,
    Unknown,
}

#[derive(Debug, Clone, Copy)]
pub struct AttemptOutcome {
    pub success: bool,
    pub exit_code: Option<i32>,
    pub category: AttemptFailureCategory,
}

pub trait DownloadExecutor {
    fn execute(&self, executable: &Path, attempt: &CaptureAttempt) -> AttemptOutcome;
}

pub struct ProcessDownloadExecutor;

impl DownloadExecutor for ProcessDownloadExecutor {
    fn execute(&self, executable: &Path, attempt: &CaptureAttempt) -> AttemptOutcome {
        let output = hidden_command(executable)
            .args(&attempt.args)
            .stdout(Stdio::null())
            .stderr(Stdio::piped())
            .output();
        match output {
            Ok(output) => AttemptOutcome {
                success: output.status.success(),
                exit_code: output.status.code(),
                category: if output.status.success() {
                    AttemptFailureCategory::None
                } else {
                    classify_failure(&String::from_utf8_lossy(&output.stderr))
                },
            },
            Err(_) => AttemptOutcome {
                success: false,
                exit_code: None,
                category: AttemptFailureCategory::ToolMissing,
            },
        }
    }
}

fn classify_failure(stderr: &str) -> AttemptFailureCategory {
    let lower = stderr.to_ascii_lowercase();
    if lower.contains("could not find") && lower.contains("browser") {
        AttemptFailureCategory::BrowserUnavailable
    } else if lower.contains("cookie") || lower.contains("keyring") || lower.contains("decrypt") {
        AttemptFailureCategory::CookieUnavailable
    } else if lower.contains("login")
        || lower.contains("private")
        || lower.contains("forbidden")
        || lower.contains("403")
    {
        AttemptFailureCategory::AccessDenied
    } else if lower.contains("format") || lower.contains("audio") {
        AttemptFailureCategory::NoAudio
    } else {
        AttemptFailureCategory::Unknown
    }
}

pub fn build_platform_capture_attempts(
    _platform: VideoPlatform,
    purpose: CapturePurpose,
    work_dir: &Path,
    url: &str,
    cookie_file: Option<&Path>,
) -> Vec<CaptureAttempt> {
    let output_template = work_dir
        .join("source.%(ext)s")
        .to_string_lossy()
        .into_owned();
    let methods = std::iter::once((CaptureMethod::Anonymous, None))
        .chain(cookie_file.map(|path| (CaptureMethod::ManualCookie, Some(path))));
    methods
        .map(|method| {
            let (method, cookie_file) = method;
            let mut args = vec![
                "--ignore-config".to_string(),
                "--no-playlist".to_string(),
                "--no-progress".to_string(),
                "--output".to_string(),
                output_template.clone(),
            ];
            match purpose {
                CapturePurpose::Audio => args.extend([
                    "--extract-audio".to_string(),
                    "--audio-format".to_string(),
                    "mp3".to_string(),
                    "--format".to_string(),
                    "bestaudio/best".to_string(),
                ]),
            }
            if let Some(path) = cookie_file {
                args.extend(["--cookies".to_string(), path.to_string_lossy().into_owned()]);
            }
            args.extend(["--".to_string(), url.to_string()]);
            CaptureAttempt { method, args }
        })
        .collect()
}

pub fn build_capture_attempts(work_dir: &Path, url: &str) -> Vec<CaptureAttempt> {
    build_platform_capture_attempts(
        VideoPlatform::Douyin,
        CapturePurpose::Audio,
        work_dir,
        url,
        None,
    )
}

pub fn capture_douyin_with(
    executor: &dyn DownloadExecutor,
    executable: &Path,
    url: &str,
    work_dir: &Path,
    progress: impl FnMut(&str),
) -> Result<PathBuf, AppError> {
    validate_douyin_url(url)?;
    capture_platform_with(
        executor,
        executable,
        VideoPlatform::Douyin,
        url,
        work_dir,
        None,
        progress,
    )
}

pub fn capture_platform_with(
    executor: &dyn DownloadExecutor,
    executable: &Path,
    platform: VideoPlatform,
    url: &str,
    work_dir: &Path,
    cookie_file: Option<&Path>,
    mut progress: impl FnMut(&str),
) -> Result<PathBuf, AppError> {
    classify_platform_url(url)?;
    std::fs::create_dir_all(work_dir).map_err(|_| {
        AppError::new(
            "io_error",
            "无法创建下载目录。",
            "请检查磁盘空间和目录权限。",
        )
    })?;

    let attempts = build_platform_capture_attempts(
        platform,
        CapturePurpose::Audio,
        work_dir,
        url,
        cookie_file,
    );
    let mut categories = Vec::new();
    for attempt in attempts {
        remove_stale_capture_files(work_dir);
        progress(attempt.method.progress_message());
        let outcome = executor.execute(executable, &attempt);
        if outcome.success {
            if let Ok(path) = find_downloaded_file(work_dir) {
                if path.metadata().map(|meta| meta.len() > 0).unwrap_or(false) {
                    return Ok(path);
                }
            }
            categories.push(AttemptFailureCategory::NoAudio);
        } else {
            categories.push(outcome.category);
        }
    }

    let recovery = if categories.contains(&AttemptFailureCategory::ToolMissing) {
        "未找到 yt-dlp，请重新安装应用或检查程序文件。"
    } else if categories.contains(&AttemptFailureCategory::CookieUnavailable) {
        "已保存的 Cookie 不可用，请在下载配置中重新粘贴后重试。"
    } else if categories.contains(&AttemptFailureCategory::AccessDenied) {
        "当前登录状态仍无权访问该内容，请检查链接权限或选择本地媒体。"
    } else if categories.contains(&AttemptFailureCategory::NoAudio) {
        "未找到可转写的音频流，请选择本地视频或音频。"
    } else {
        "请检查链接是否有效，或选择本地视频/音频。"
    };
    Err(AppError::new(
        "download_failed",
        "可用的下载方式均未成功。",
        recovery,
    ))
}

pub fn download_douyin(
    url: &str,
    work_dir: &Path,
    progress: impl FnMut(&str),
) -> Result<PathBuf, AppError> {
    download_platform(url, work_dir, None, progress)
}

pub fn download_platform(
    url: &str,
    work_dir: &Path,
    cookie_file: Option<&Path>,
    progress: impl FnMut(&str),
) -> Result<PathBuf, AppError> {
    let platform = classify_platform_url(url)?;
    let executable = find_yt_dlp();
    capture_platform_with(
        &ProcessDownloadExecutor,
        &executable,
        platform,
        url,
        work_dir,
        cookie_file,
        progress,
    )
}

pub fn find_yt_dlp() -> PathBuf {
    let candidates = [
        "yt-dlp-x86_64-pc-windows-msvc.exe",
        "binaries/yt-dlp-x86_64-pc-windows-msvc.exe",
        "C:\\Users\\commender\\.local\\bin\\yt-dlp.exe",
        "yt-dlp.exe",
    ];
    candidates
        .into_iter()
        .map(PathBuf::from)
        .find(|candidate| candidate.exists())
        .unwrap_or_else(|| PathBuf::from("yt-dlp.exe"))
}

fn remove_stale_capture_files(work_dir: &Path) {
    let Ok(entries) = std::fs::read_dir(work_dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_file() && path.file_stem().and_then(|stem| stem.to_str()) == Some("source") {
            let _ = std::fs::remove_file(path);
        }
    }
}

fn find_downloaded_file(work_dir: &Path) -> Result<PathBuf, AppError> {
    let entries = std::fs::read_dir(work_dir).map_err(|_| {
        AppError::new(
            "io_error",
            "无法读取下载目录。",
            "请检查磁盘空间和目录权限。",
        )
    })?;
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_file() && path.file_stem().and_then(|stem| stem.to_str()) == Some("source") {
            return Ok(path);
        }
    }
    Err(AppError::new(
        "download_failed",
        "抓取结束后未找到音频文件。",
        "请检查链接是否有效，或选择本地媒体。",
    ))
}
