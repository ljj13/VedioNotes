//! 下载服务——视频/音频文件的下载功能.

use crate::domain::AppError;
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::mpsc;
use std::thread;
use std::time::{Duration, Instant};

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
/// VideoPlatform
pub enum VideoPlatform {
    Bilibili,
    Youtube,
    Douyin,
}

/// Fine-grained media download phase shared by native and sidecar paths.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DownloadPhase {
    Resolving,
    Downloading,
    Processing,
}

impl DownloadPhase {
    /// Stable frontend wire label.
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Resolving => "resolving",
            Self::Downloading => "downloading",
            Self::Processing => "processing",
        }
    }
}

/// Structured progress emitted by a platform downloader.
#[derive(Debug, Clone, PartialEq)]
pub struct DownloadProgress {
    pub phase: DownloadPhase,
    pub message: String,
    pub percent: Option<f64>,
    pub downloaded_bytes: u64,
    pub total_bytes: Option<u64>,
    pub speed_bytes_per_second: Option<u64>,
    pub eta_seconds: Option<u64>,
}

impl DownloadProgress {
    /// A stage message with no measurable media bytes yet.
    pub fn message(phase: DownloadPhase, message: impl Into<String>) -> Self {
        Self {
            phase,
            message: message.into(),
            percent: None,
            downloaded_bytes: 0,
            total_bytes: None,
            speed_bytes_per_second: None,
            eta_seconds: None,
        }
    }
}

fn is_official_host(host: &str, allowed_hosts: &[&str]) -> bool {
    allowed_hosts
        .iter()
        .any(|allowed| host == *allowed || host.ends_with(&format!(".{allowed}")))
}

/// classify platform url
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

/// validate douyin url
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
/// CaptureMethod
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
/// CapturePurpose
pub enum CapturePurpose {
    Audio,
}

#[derive(Debug, Clone)]
/// CaptureAttempt
pub struct CaptureAttempt {
    pub method: CaptureMethod,
    pub args: Vec<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
/// AttemptFailureCategory
pub enum AttemptFailureCategory {
    None,
    Cancelled,
    ToolMissing,
    BrowserUnavailable,
    CookieUnavailable,
    AccessDenied,
    NoAudio,
    Timeout,
    Unknown,
}

#[derive(Debug, Clone, Copy)]
/// AttemptOutcome
pub struct AttemptOutcome {
    pub success: bool,
    pub exit_code: Option<i32>,
    pub category: AttemptFailureCategory,
}

/// DownloadExecutor
pub trait DownloadExecutor {
    fn execute(
        &self,
        executable: &Path,
        attempt: &CaptureAttempt,
        cancelled: &dyn Fn() -> bool,
        progress: &mut dyn FnMut(DownloadProgress),
    ) -> AttemptOutcome;
}

/// ProcessDownloadExecutor
pub struct ProcessDownloadExecutor;

impl DownloadExecutor for ProcessDownloadExecutor {
    fn execute(
        &self,
        executable: &Path,
        attempt: &CaptureAttempt,
        cancelled: &dyn Fn() -> bool,
        progress: &mut dyn FnMut(DownloadProgress),
    ) -> AttemptOutcome {
        if cancelled() {
            return AttemptOutcome {
                success: false,
                exit_code: None,
                category: AttemptFailureCategory::Cancelled,
            };
        }
        let child = hidden_command(executable)
            .args(&attempt.args)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn();
        let Ok(mut child) = child else {
            return AttemptOutcome {
                success: false,
                exit_code: None,
                category: AttemptFailureCategory::ToolMissing,
            };
        };

        #[derive(Clone, Copy)]
        enum PipeSource {
            Stdout,
            Stderr,
        }

        let (sender, receiver) = mpsc::channel::<(PipeSource, String)>();
        let stdout_thread = child.stdout.take().map(|stdout| {
            let sender = sender.clone();
            thread::spawn(move || {
                for line in BufReader::new(stdout).lines().map_while(Result::ok) {
                    let _ = sender.send((PipeSource::Stdout, line));
                }
            })
        });
        let stderr_thread = child.stderr.take().map(|stderr| {
            let sender = sender.clone();
            thread::spawn(move || {
                for line in BufReader::new(stderr).lines().map_while(Result::ok) {
                    let _ = sender.send((PipeSource::Stderr, line));
                }
            })
        });
        drop(sender);

        let mut stderr = String::new();
        let mut last_output = Instant::now();
        loop {
            if cancelled() {
                let _ = child.kill();
                let _ = child.wait();
                return AttemptOutcome {
                    success: false,
                    exit_code: None,
                    category: AttemptFailureCategory::Cancelled,
                };
            }
            match receiver.recv_timeout(Duration::from_millis(100)) {
                Ok((source, line)) => {
                    last_output = Instant::now();
                    if let Some(update) = parse_yt_dlp_progress_line(&line) {
                        progress(update);
                    } else if matches!(source, PipeSource::Stderr) && stderr.len() < 64 * 1024 {
                        stderr.push_str(&line);
                        stderr.push('\n');
                    }
                }
                Err(mpsc::RecvTimeoutError::Timeout) => {}
                Err(mpsc::RecvTimeoutError::Disconnected) => {}
            }
            match child.try_wait() {
                Ok(Some(status)) => {
                    let _ = stdout_thread.map(|handle| handle.join());
                    let _ = stderr_thread.map(|handle| handle.join());
                    for (source, line) in receiver.try_iter() {
                        if let Some(update) = parse_yt_dlp_progress_line(&line) {
                            progress(update);
                        } else if matches!(source, PipeSource::Stderr) && stderr.len() < 64 * 1024 {
                            stderr.push_str(&line);
                            stderr.push('\n');
                        }
                    }
                    return AttemptOutcome {
                        success: status.success(),
                        exit_code: status.code(),
                        category: if status.success() {
                            AttemptFailureCategory::None
                        } else {
                            classify_failure(&stderr)
                        },
                    };
                }
                Ok(None) if last_output.elapsed() >= Duration::from_secs(180) => {
                    let _ = child.kill();
                    let _ = child.wait();
                    return AttemptOutcome {
                        success: false,
                        exit_code: None,
                        category: AttemptFailureCategory::Timeout,
                    };
                }
                Ok(None) => {}
                Err(_) => {
                    return AttemptOutcome {
                        success: false,
                        exit_code: None,
                        category: AttemptFailureCategory::Unknown,
                    };
                }
            }
        }
    }
}

fn parse_optional_number(value: &str) -> Option<f64> {
    let trimmed = value.trim().trim_end_matches('%');
    if trimmed.is_empty() || trimmed.eq_ignore_ascii_case("na") || trimmed.eq_ignore_ascii_case("none") {
        None
    } else {
        trimmed.parse::<f64>().ok().filter(|value| value.is_finite())
    }
}

/// Parse the stable machine-readable line emitted by our yt-dlp template.
pub fn parse_yt_dlp_progress_line(line: &str) -> Option<DownloadProgress> {
    let payload = line.trim().strip_prefix("vedionotes-progress:")?;
    let fields = payload.split('|').collect::<Vec<_>>();
    if fields.len() != 5 {
        return None;
    }
    let downloaded_bytes = parse_optional_number(fields[1])?.max(0.0).round() as u64;
    let total_bytes = parse_optional_number(fields[2]).map(|value| value.max(0.0).round() as u64);
    let speed_bytes_per_second =
        parse_optional_number(fields[3]).map(|value| value.max(0.0).round() as u64);
    let eta_seconds = parse_optional_number(fields[4]).map(|value| value.max(0.0).round() as u64);
    Some(DownloadProgress {
        phase: DownloadPhase::Downloading,
        message: "正在通过 yt-dlp 下载媒体...".to_string(),
        percent: parse_optional_number(fields[0]).map(|value| value.clamp(0.0, 100.0)),
        downloaded_bytes,
        total_bytes,
        speed_bytes_per_second,
        eta_seconds,
    })
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

/// build platform capture attempts
pub fn build_platform_capture_attempts(
    platform: VideoPlatform,
    purpose: CapturePurpose,
    work_dir: &Path,
    url: &str,
    cookie_file: Option<&Path>,
) -> Vec<CaptureAttempt> {
    let capture_url = canonicalize_platform_url(platform, url);
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
                "--newline".to_string(),
                "--progress".to_string(),
                "--progress-template".to_string(),
                "download:vedionotes-progress:%(progress._percent_str)s|%(progress.downloaded_bytes)s|%(progress.total_bytes,progress.total_bytes_estimate)s|%(progress.speed)s|%(progress.eta)s".to_string(),
                "--no-update".to_string(),
                "--socket-timeout".to_string(),
                "15".to_string(),
                "--retries".to_string(),
                "2".to_string(),
                "--fragment-retries".to_string(),
                "2".to_string(),
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
            args.extend(["--".to_string(), capture_url.clone()]);
            CaptureAttempt { method, args }
        })
        .collect()
}

/// build capture attempts
pub fn build_capture_attempts(work_dir: &Path, url: &str) -> Vec<CaptureAttempt> {
    build_platform_capture_attempts(
        VideoPlatform::Douyin,
        CapturePurpose::Audio,
        work_dir,
        url,
        None,
    )
}

/// capture douyin with
pub fn capture_douyin_with(
    executor: &dyn DownloadExecutor,
    executable: &Path,
    url: &str,
    work_dir: &Path,
    progress: impl FnMut(DownloadProgress),
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

/// capture platform with
pub fn capture_platform_with(
    executor: &dyn DownloadExecutor,
    executable: &Path,
    platform: VideoPlatform,
    url: &str,
    work_dir: &Path,
    cookie_file: Option<&Path>,
    progress: impl FnMut(DownloadProgress),
) -> Result<PathBuf, AppError> {
    capture_platform_with_cancel(
        executor,
        executable,
        platform,
        url,
        work_dir,
        cookie_file,
        &|| false,
        progress,
    )
}

fn capture_platform_with_cancel(
    executor: &dyn DownloadExecutor,
    executable: &Path,
    platform: VideoPlatform,
    url: &str,
    work_dir: &Path,
    cookie_file: Option<&Path>,
    cancelled: &dyn Fn() -> bool,
    mut progress: impl FnMut(DownloadProgress),
) -> Result<PathBuf, AppError> {
    classify_platform_url(url)?;
    std::fs::create_dir_all(work_dir).map_err(|_| {
        AppError::new(
            "io_error",
            "无法创建下载目录。",
            "请检查磁盘空间和目录权限。",
        )
    })?;

    let has_cookie_attempt = cookie_file.is_some();
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
        progress(DownloadProgress::message(
            DownloadPhase::Resolving,
            format!("[yt_dlp] {}", attempt.method.progress_message()),
        ));
        let outcome = executor.execute(executable, &attempt, cancelled, &mut progress);
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

    let (code, message, recovery) = if categories.contains(&AttemptFailureCategory::Cancelled) {
        (
            "cancelled",
            "任务已取消。",
            "点击开始提炼可以重新开始。",
        )
    } else if categories.contains(&AttemptFailureCategory::ToolMissing) {
        (
            "download_tool_missing",
            "未找到可用的 yt-dlp 下载工具。",
            "请重新安装应用或检查程序文件。",
        )
    } else if categories.contains(&AttemptFailureCategory::Timeout) {
        (
            "download_timeout",
            "下载工具长时间没有收到数据。",
            "请检查网络后重试；抖音仍失败时请更新 Cookie。",
        )
    } else if categories.contains(&AttemptFailureCategory::CookieUnavailable) {
        if has_cookie_attempt {
            (
                "download_cookie_unavailable",
                "已保存的 Cookie 不可用或已经过期。",
                "请在设置的数据管理中更新对应平台 Cookie 后重试。",
            )
        } else {
            (
                "download_cookie_unavailable",
                "该平台当前要求有效的 Cookie 会话。",
                "请在设置的数据管理中保存最新 Cookie 后重试。",
            )
        }
    } else if categories.contains(&AttemptFailureCategory::BrowserUnavailable) {
        (
            "download_browser_unavailable",
            "下载工具所需的浏览器环境不可用。",
            "请使用手动 Cookie 或选择本地视频/音频。",
        )
    } else if categories.contains(&AttemptFailureCategory::AccessDenied) {
        (
            "download_access_denied",
            "视频平台拒绝了当前下载请求。",
            "请检查链接权限、更新 Cookie，或选择本地媒体。",
        )
    } else if categories.contains(&AttemptFailureCategory::NoAudio) {
        (
            "download_media_missing",
            "没有找到可转写的媒体流。",
            "请检查链接内容，或选择本地视频/音频。",
        )
    } else {
        (
            "download_process_failed",
            "下载进程异常退出。",
            "请检查链接是否有效，或选择本地视频/音频。",
        )
    };
    Err(AppError::new(code, message, recovery))
}

/// download douyin
pub async fn download_douyin(
    url: &str,
    work_dir: &Path,
    progress: impl FnMut(DownloadProgress) + Send,
) -> Result<PathBuf, AppError> {
    download_platform(url, work_dir, None, None, &|| false, progress).await
}

/// download platform
/// download platform - 带原生下载器支持和降级策略
pub async fn download_platform(
    url: &str,
    work_dir: &Path,
    raw_cookie_header: Option<&str>,
    cookie_file: Option<&Path>,
    cancelled: &(dyn Fn() -> bool + Send + Sync),
    mut progress: impl FnMut(DownloadProgress) + Send,
) -> Result<PathBuf, AppError> {
    let platform = classify_platform_url(url)?;

    // Bilibili 优先使用原生下载器（解决 HTTP 412 问题）
    if platform == VideoPlatform::Bilibili {
        progress(DownloadProgress::message(
            DownloadPhase::Resolving,
            "正在使用 Bilibili 原生下载器解析链接...",
        ));

        let mut bilibili_progress = |message: &str| {
            progress(DownloadProgress::message(DownloadPhase::Resolving, message));
        };
        match crate::services::bilibili_native::download_bilibili_native(
            url,
            work_dir,
            raw_cookie_header,
            &mut bilibili_progress,
        ) {
            Ok(path) => return Ok(path),
            Err(e) => {
                progress(DownloadProgress::message(
                    DownloadPhase::Resolving,
                    format!("Bilibili 原生下载器失败：{}，正在回退到 yt-dlp...", e.message),
                ));
                // 继续执行后面的 yt-dlp 逻辑
            }
        }
    }

    // Douyin 优先使用原生下载器（C 方案）
    if platform == VideoPlatform::Douyin {
        progress(DownloadProgress::message(
            DownloadPhase::Resolving,
            "[router_data] 正在解析抖音公开分享页...",
        ));

        let url_owned = canonicalize_platform_url(platform, url);
        let work_dir_owned = work_dir.to_path_buf();

        let native_result = crate::services::douyin::download_douyin_dual_strategy(
            &url_owned,
            work_dir_owned,
            raw_cookie_header.map(ToOwned::to_owned),
            cancelled,
            &mut progress,
        )
        .await;

        match native_result {
            Ok(result) => {
                return Ok(PathBuf::from(result.file_path));
            }
            Err(error) => {
                if cancelled() {
                    return Err(AppError::new(
                        "cancelled",
                        "任务已取消。",
                        "点击开始提炼可以重新开始。",
                    ));
                }
                progress(DownloadProgress::message(
                    DownloadPhase::Resolving,
                    format!("抖音原生直连未成功：{error}。正在尝试 yt-dlp..."),
                ));
            }
        }
    }

    // 其他平台或原生下载失败时使用 yt-dlp
    let executable = find_yt_dlp();
    capture_platform_with_cancel(
        &ProcessDownloadExecutor,
        &executable,
        platform,
        url,
        work_dir,
        cookie_file,
        cancelled,
        progress,
    )
}

/// find yt dlp
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

#[cfg(test)]
mod tests {
    use super::*;

    const DOUYIN_USER_MODAL_URL: &str = "https://www.douyin.com/user/MS4wLjABAAAA3Q6PuNZG82522Zxl4b1V5FUtrCCRDEy5ZNTK8-64XR1ieuO5i7H-R-VBfbpghg9_?from_tab_name=main&modal_id=7663687865578163499&vid=7663687865578163499";

    #[test]
    fn douyin_capture_uses_canonical_video_url_and_bounded_network_options() {
        let attempts = build_platform_capture_attempts(
            VideoPlatform::Douyin,
            CapturePurpose::Audio,
            Path::new("work"),
            DOUYIN_USER_MODAL_URL,
            None,
        );

        assert_eq!(attempts.len(), 1);
        let args = &attempts[0].args;
        assert_eq!(
            args.last().map(String::as_str),
            Some("https://www.douyin.com/video/7663687865578163499")
        );
        assert!(args
            .windows(2)
            .any(|pair| pair == ["--socket-timeout", "15"]));
        assert!(args.windows(2).any(|pair| pair == ["--retries", "2"]));
        assert!(args.iter().any(|arg| arg == "--no-update"));
    }

    #[test]
    fn douyin_capture_keeps_manual_cookie_fallback() {
        let attempts = build_platform_capture_attempts(
            VideoPlatform::Douyin,
            CapturePurpose::Audio,
            Path::new("work"),
            DOUYIN_USER_MODAL_URL,
            Some(Path::new("douyin.cookies.txt")),
        );

        assert_eq!(attempts.len(), 2);
        assert_eq!(attempts[0].method, CaptureMethod::Anonymous);
        assert_eq!(attempts[1].method, CaptureMethod::ManualCookie);
        assert!(attempts[1]
            .args
            .windows(2)
            .any(|pair| pair == ["--cookies", "douyin.cookies.txt"]));
    }
}

fn is_douyin_video_id(value: &str) -> bool {
    (15..=20).contains(&value.len()) && value.bytes().all(|byte| byte.is_ascii_digit())
}

/// Convert Douyin user/modal links into the canonical video URL understood by
/// both the native downloader and yt-dlp. Short links are kept unchanged so
/// the downloader can resolve their redirect itself.
pub fn canonicalize_platform_url(platform: VideoPlatform, url: &str) -> String {
    if platform != VideoPlatform::Douyin {
        return url.to_string();
    }

    let Ok(parsed) = url::Url::parse(url) else {
        return url.to_string();
    };

    let query_id = parsed.query_pairs().find_map(|(key, value)| {
        ((key == "modal_id" || key == "vid" || key == "aweme_id") && is_douyin_video_id(&value))
            .then(|| value.into_owned())
    });
    let segments = parsed
        .path_segments()
        .into_iter()
        .flatten()
        .collect::<Vec<_>>();
    let path_id = segments.windows(2).find_map(|pair| {
        ((pair[0] == "video" || pair[0] == "note") && is_douyin_video_id(pair[1]))
            .then(|| pair[1].to_string())
    });

    query_id
        .or(path_id)
        .map(|video_id| format!("https://www.douyin.com/video/{video_id}"))
        .unwrap_or_else(|| url.to_string())
}
