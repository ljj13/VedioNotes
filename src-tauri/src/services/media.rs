//! 媒体服务——音频文件的格式处理.

use crate::{
    domain::AppError, history_store::ScreenshotCapturer, process_utils::hidden_command,
};
use std::path::{Path, PathBuf};

const VIDEO_EXTENSIONS: &[&str] = &["mp4", "mov", "mkv", "webm"];
const AUDIO_EXTENSIONS: &[&str] = &["mp3", "m4a", "wav", "aac", "flac", "ogg", "opus"];

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
/// MediaKind
pub enum MediaKind {
    Video,
    Audio,
}

/// classify media file
pub fn classify_media_file(path: &Path) -> Result<MediaKind, AppError> {
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_lowercase())
        .unwrap_or_default();

    if VIDEO_EXTENSIONS.contains(&ext.as_str()) {
        Ok(MediaKind::Video)
    } else if AUDIO_EXTENSIONS.contains(&ext.as_str()) {
        Ok(MediaKind::Audio)
    } else {
        Err(AppError::new(
            "unsupported_media",
            format!("不支持的文件格式: .{}", ext),
            "请使用支持的视频或音频文件。",
        ))
    }
}

/// Validate that a file extension is supported.
pub fn validate_media_file(path: &Path) -> Result<(), AppError> {
    classify_media_file(path).map(|_| ())
}

/// build ffmpeg audio args
pub fn build_ffmpeg_audio_args(input: &Path, output: &Path) -> Vec<String> {
    let mut args = vec![
        "-y".to_string(),
        "-i".to_string(),
        input.to_string_lossy().into_owned(),
    ];
    if classify_media_file(input) == Ok(MediaKind::Video) {
        args.push("-vn".to_string());
    }
    args.extend([
        "-ac".to_string(),
        "1".to_string(),
        "-ar".to_string(),
        "16000".to_string(),
        "-c:a".to_string(),
        "mp3".to_string(),
        output.to_string_lossy().into_owned(),
    ]);
    args
}

/// Prepare audio from a video file using FFmpeg.
/// Returns the path to the prepared audio file.
pub fn prepare_audio(input: &Path, work_dir: &Path) -> Result<std::path::PathBuf, AppError> {
    if !input.exists() {
        return Err(AppError::new(
            "file_not_found",
            format!("文件不存在: {}", input.display()),
            "请检查文件路径是否正确。",
        ));
    }

    classify_media_file(input)?;

    std::fs::create_dir_all(work_dir).map_err(|_| {
        AppError::new(
            "io_error",
            "无法创建音频处理目录。",
            "请检查磁盘空间和目录权限。",
        )
    })?;

    let stem = input
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("audio");
    let output = work_dir.join(format!("{}.normalized.mp3", stem));

    // Execute FFmpeg: extract mono 16kHz MP3 audio
    let ffmpeg_path = find_ffmpeg();
    let args = build_ffmpeg_audio_args(input, &output);
    let status = hidden_command(&ffmpeg_path)
        .args(&args)
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .status()
        .map_err(|e| {
            AppError::new(
                "ffmpeg_error",
                format!("FFmpeg 执行失败: {}", e),
                "请检查 FFmpeg 安装是否正确。",
            )
        })?;

    if !status.success() {
        // Check if output file was created — if not, likely no audio stream
        if !output.exists() || output.metadata().map(|m| m.len()).unwrap_or(0) == 0 {
            return Err(AppError::new(
                "no_audio",
                "该视频没有可转写的音频。".to_string(),
                "该视频没有可转写的音频。".to_string(),
            ));
        }
    }

    Ok(output)
}

/// Find FFmpeg executable in sidecar paths or PATH.
pub fn find_ffmpeg() -> PathBuf {
    // Check common sidecar locations first
    let candidates = [
        // Sidecar next to executable
        "ffmpeg-x86_64-pc-windows-msvc.exe",
        // Sidecar in binaries directory
        "binaries/ffmpeg-x86_64-pc-windows-msvc.exe",
        // Development: in G:\Environments
        "G:\\Environments\\ffmpeg\\bin\\ffmpeg.exe",
        // Generic fallback
        "ffmpeg.exe",
    ];

    for candidate in &candidates {
        if std::path::Path::new(candidate).exists() {
            return PathBuf::from(candidate);
        }
    }

    // Default fallback — assume on PATH
    PathBuf::from("ffmpeg.exe")
}

/// FfmpegCommandRunner
pub trait FfmpegCommandRunner: Send + Sync {
    fn run(&self, executable: &Path, args: &[String]) -> Result<(), String>;
}

/// SystemFfmpegCommandRunner
pub struct SystemFfmpegCommandRunner;

impl FfmpegCommandRunner for SystemFfmpegCommandRunner {
    fn run(&self, executable: &Path, args: &[String]) -> Result<(), String> {
        let status = hidden_command(executable)
            .args(args)
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .status()
            .map_err(|error| error.to_string())?;
        status
            .success()
            .then_some(())
            .ok_or_else(|| "ffmpeg exited unsuccessfully".into())
    }
}

/// LocalFfmpegScreenshotCapturer
pub struct LocalFfmpegScreenshotCapturer<R = SystemFfmpegCommandRunner> {
    executable: PathBuf,
    runner: R,
}

impl LocalFfmpegScreenshotCapturer<SystemFfmpegCommandRunner> {
    /// production
    pub fn production() -> Self {
        Self::new(find_ffmpeg(), SystemFfmpegCommandRunner)
    }
}

impl<R> LocalFfmpegScreenshotCapturer<R> {
    /// new
    pub fn new(executable: PathBuf, runner: R) -> Self {
        Self { executable, runner }
    }

    /// runner
    pub fn runner(&self) -> &R {
        &self.runner
    }
}

impl<R: FfmpegCommandRunner> ScreenshotCapturer for LocalFfmpegScreenshotCapturer<R> {
    fn capture(&self, source: &Path, seconds: f64, output: &Path) -> Result<(), String> {
        let args = vec![
            "-y".into(),
            "-ss".into(),
            seconds.to_string(),
            "-i".into(),
            source.to_string_lossy().into_owned(),
            "-frames:v".into(),
            "1".into(),
            "-q:v".into(),
            "2".into(),
            output.to_string_lossy().into_owned(),
        ];
        self.runner.run(&self.executable, &args)
    }
}
