//! 抖音下载服务 - 带降级策略
//!
//! 默认使用 Rust 原生实现（C 方案），失败时自动降级到 yt-dlp + Cookie（A 方案）

use anyhow::{anyhow, Result};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

use super::douyin_native::DouyinNativeDownloader;

/// 抖音下载策略
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DouyinDownloadStrategy {
    /// Rust 原生实现（默认）
    Native,
    /// yt-dlp + Cookie（降级）
    YtDlpWithCookie,
}

/// 抖音下载结果
#[derive(Debug, Serialize, Deserialize)]
pub struct DouyinDownloadResult {
    pub file_path: String,
    pub strategy_used: String,
}

/// 双策略下载抖音视频
///
/// 默认使用 Rust 原生实现（C 方案）
/// 失败时自动降级到 yt-dlp + Cookie（A 方案）
pub async fn download_douyin_dual_strategy(
    video_url: &str,
    work_dir: PathBuf,
    cookie: Option<String>,
    progress: &mut dyn FnMut(&str),
) -> Result<DouyinDownloadResult> {
    // 策略 C：尝试 Rust 原生下载
    match try_native_download(video_url, &work_dir, cookie, progress).await {
        Ok(file_path) => {
            return Ok(DouyinDownloadResult {
                file_path,
                strategy_used: "native".to_string(),
            });
        }
        Err(native_err) => {
            // 原生下载失败，返回错误让 download.rs 继续 yt-dlp 降级
            // 注意：不能包含 "需要配置 Cookie" 字样，否则会被 download.rs 拦截
            return Err(anyhow!("原生下载失败: {}，将降级到 yt-dlp", native_err));
        }
    }
}

/// 尝试原生下载
async fn try_native_download(
    video_url: &str,
    work_dir: &PathBuf,
    cookie: Option<String>,
    progress: &mut dyn FnMut(&str),
) -> Result<String> {
    tokio::fs::create_dir_all(work_dir).await?;
    let downloader = DouyinNativeDownloader::new(cookie)?;
    let output_path = downloader
        .download_source(video_url, work_dir, progress)
        .await?;

    Ok(output_path.to_string_lossy().to_string())
}
