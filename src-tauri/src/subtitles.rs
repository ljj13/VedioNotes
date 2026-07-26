//! 字幕处理流水线——从视频平台获取字幕并进行预处理.

use crate::domain::{AppError, InputSource};
use std::path::{Path, PathBuf};
use std::process::Stdio;

use crate::process_utils::hidden_command;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
/// SourcePlatform
pub enum SourcePlatform {
    Local,
    Douyin,
    Bilibili,
    Youtube,
}

/// source platform
pub fn source_platform(source: &InputSource) -> SourcePlatform {
    match source {
        InputSource::File { .. } => SourcePlatform::Local,
        InputSource::DouyinUrl { .. } => SourcePlatform::Douyin,
        InputSource::BilibiliUrl { .. } => SourcePlatform::Bilibili,
        InputSource::YoutubeUrl { .. } => SourcePlatform::Youtube,
    }
}

#[derive(Debug, Clone, PartialEq)]
/// TimedCaption
pub struct TimedCaption {
    pub start_seconds: f64,
    pub text: String,
}

#[derive(Debug, Clone)]
/// CaptionProcessOutput
pub struct CaptionProcessOutput {
    pub success: bool,
}

/// CaptionProcess
pub trait CaptionProcess {
    fn execute(&self, executable: &Path, args: &[String], work_dir: &Path) -> CaptionProcessOutput;
}

/// ProcessCaptionProcess
pub struct ProcessCaptionProcess;

impl CaptionProcess for ProcessCaptionProcess {
    fn execute(
        &self,
        executable: &Path,
        args: &[String],
        _work_dir: &Path,
    ) -> CaptionProcessOutput {
        CaptionProcessOutput {
            success: hidden_command(executable)
                .args(args)
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .status()
                .map(|status| status.success())
                .unwrap_or(false),
        }
    }
}

/// TranscriptAcquisition
pub struct TranscriptAcquisition {
    pub transcript: String,
    pub captions: Option<Vec<TimedCaption>>,
}

/// fetch timed captions
pub fn fetch_timed_captions(
    url: &str,
    work_dir: &Path,
) -> Result<Option<Vec<TimedCaption>>, AppError> {
    fetch_timed_captions_with(
        &ProcessCaptionProcess,
        &crate::services::download::find_yt_dlp(),
        url,
        work_dir,
    )
}

/// Caption retrieval is strictly optional. Process, I/O, and malformed-caption
/// failures intentionally become `None` so callers take the established media
/// download/ASR route without exposing tool details to the user.
pub fn optional_timed_captions(url: &str, work_dir: &Path) -> Option<Vec<TimedCaption>> {
    optional_timed_captions_with(
        &ProcessCaptionProcess,
        &crate::services::download::find_yt_dlp(),
        url,
        work_dir,
    )
}

/// optional timed captions with
pub fn optional_timed_captions_with(
    process: &dyn CaptionProcess,
    executable: &Path,
    url: &str,
    work_dir: &Path,
) -> Option<Vec<TimedCaption>> {
    fetch_timed_captions_with(process, executable, url, work_dir)
        .ok()
        .flatten()
}

/// fetch timed captions with
pub fn fetch_timed_captions_with(
    process: &dyn CaptionProcess,
    executable: &Path,
    url: &str,
    work_dir: &Path,
) -> Result<Option<Vec<TimedCaption>>, AppError> {
    std::fs::create_dir_all(work_dir).map_err(|_| {
        AppError::new(
            "io_error",
            "无法创建字幕目录。",
            "请检查磁盘空间和目录权限。",
        )
    })?;
    remove_caption_files(work_dir);
    let output = work_dir
        .join("captions.%(ext)s")
        .to_string_lossy()
        .into_owned();
    let args = vec![
        "--ignore-config".into(),
        "--no-playlist".into(),
        "--no-progress".into(),
        "--skip-download".into(),
        "--write-subs".into(),
        "--write-auto-subs".into(),
        "--sub-langs".into(),
        "all".into(),
        "--sub-format".into(),
        "vtt".into(),
        "--output".into(),
        output,
        "--".into(),
        url.into(),
    ];
    if !process.execute(executable, &args, work_dir).success {
        return Ok(None);
    }
    for entry in std::fs::read_dir(work_dir)
        .map_err(|_| AppError::new("io_error", "无法读取字幕目录。", "请检查目录权限。"))?
        .flatten()
    {
        let path = entry.path();
        if path
            .extension()
            .and_then(|x| x.to_str())
            .is_some_and(|x| x.eq_ignore_ascii_case("vtt"))
        {
            let body = std::fs::read_to_string(path).map_err(|_| {
                AppError::new("io_error", "无法读取字幕文件。", "请重试或使用媒体转写。")
            })?;
            let captions = parse_webvtt(&body);
            if !captions.is_empty() {
                return Ok(Some(captions));
            }
        }
    }
    Ok(None)
}

/// acquire transcript with
pub fn acquire_transcript_with(
    source: &InputSource,
    process: &dyn CaptionProcess,
    executable: &Path,
    work_dir: &Path,
    media_and_asr: impl FnOnce() -> Result<String, AppError>,
) -> Result<TranscriptAcquisition, AppError> {
    match source_platform(source) {
        SourcePlatform::Bilibili | SourcePlatform::Youtube => {
            let url = match source {
                InputSource::BilibiliUrl { url } | InputSource::YoutubeUrl { url } => url,
                _ => unreachable!(),
            };
            if let Some(captions) = optional_timed_captions_with(process, executable, url, work_dir)
            {
                let transcript = captions
                    .iter()
                    .map(|caption| caption.text.as_str())
                    .collect::<Vec<_>>()
                    .join("\n");
                return Ok(TranscriptAcquisition {
                    transcript,
                    captions: Some(captions),
                });
            }
        }
        SourcePlatform::Local | SourcePlatform::Douyin => {}
    }
    Ok(TranscriptAcquisition {
        transcript: media_and_asr()?,
        captions: None,
    })
}

/// parse webvtt
pub fn parse_webvtt(body: &str) -> Vec<TimedCaption> {
    let mut captions = Vec::new();
    let mut current_start = None;
    let mut current_text = Vec::new();
    let flush =
        |start: &mut Option<f64>, text: &mut Vec<String>, target: &mut Vec<TimedCaption>| {
            if let Some(seconds) = start.take() {
                let normalized = text
                    .join(" ")
                    .split_whitespace()
                    .collect::<Vec<_>>()
                    .join(" ");
                if !normalized.is_empty() {
                    target.push(TimedCaption {
                        start_seconds: seconds,
                        text: normalized,
                    });
                }
            }
            text.clear();
        };
    for line in body.lines() {
        let trimmed = line.trim();
        if trimmed.contains("-->") {
            flush(&mut current_start, &mut current_text, &mut captions);
            current_start = trimmed.split("-->").next().and_then(parse_timestamp);
        } else if trimmed.is_empty() {
            flush(&mut current_start, &mut current_text, &mut captions);
        } else if current_start.is_some()
            && !trimmed.starts_with("WEBVTT")
            && !trimmed.starts_with("NOTE")
        {
            current_text.push(trimmed.into());
        }
    }
    flush(&mut current_start, &mut current_text, &mut captions);
    captions
}

fn parse_timestamp(value: &str) -> Option<f64> {
    let fields = value.trim().split(':').collect::<Vec<_>>();
    let (hours, minutes, seconds) = match fields.as_slice() {
        [minutes, seconds] => (
            0.0,
            minutes.parse::<f64>().ok()?,
            seconds.replace(',', ".").parse::<f64>().ok()?,
        ),
        [hours, minutes, seconds] => (
            hours.parse::<f64>().ok()?,
            minutes.parse::<f64>().ok()?,
            seconds.replace(',', ".").parse::<f64>().ok()?,
        ),
        _ => return None,
    };
    Some(hours * 3600.0 + minutes * 60.0 + seconds)
}

fn remove_caption_files(work_dir: &Path) {
    if let Ok(entries) = std::fs::read_dir(work_dir) {
        for entry in entries.flatten() {
            let path: PathBuf = entry.path();
            if path
                .file_name()
                .and_then(|x| x.to_str())
                .is_some_and(|x| x.starts_with("captions."))
            {
                let _ = std::fs::remove_file(path);
            }
        }
    }
}
