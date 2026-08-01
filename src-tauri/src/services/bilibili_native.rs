//! Bilibili 原生下载器 - 直接调用 Bilibili API，注入风控参数解决 HTTP 412 问题
//!
//! 背景：2026年6月起，Bilibili 的 wbi/playurl 接口要求提供浏览器指纹参数
//! (dm_img_list, dm_img_str, dm_cover_img_str, dm_img_inter, web_location)
//! 否则返回 HTTP 412。当前 yt-dlp 不发送这些参数，导致下载失败。
//!
//! 此模块实现 Rust 原生下载，参考 BiliNote 的 Python 实现。

use crate::domain::AppError;
use crate::process_utils::hidden_command;
use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use rand::Rng;
use reqwest::blocking::Client;
use serde::Deserialize;
use std::collections::HashMap;
use std::fs::File;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::Stdio;

const USER_AGENT: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";

/// 从 Bilibili URL 中提取 BV 号
pub fn extract_bvid(url: &str) -> Result<String, AppError> {
    let parsed = url::Url::parse(url).map_err(|_| {
        AppError::new("invalid_url", "无法解析 Bilibili 链接", "请检查链接格式")
    })?;

    // 支持 https://www.bilibili.com/video/BV1VpEm6BEmd
    // 和 https://b23.tv/xxx (需要重定向)
    let path = parsed.path();
    if let Some(bvid_start) = path.find("BV") {
        let bvid_part = &path[bvid_start..];
        let bvid = bvid_part
            .split('/')
            .next()
            .unwrap_or("")
            .split('?')
            .next()
            .unwrap_or("");
        if bvid.starts_with("BV") && bvid.len() >= 10 {
            return Ok(bvid.to_string());
        }
    }

    Err(AppError::new(
        "invalid_url",
        "无法从链接中提取 BV 号",
        "请使用标准的 Bilibili 视频链接",
    ))
}

/// 构建风控参数（模拟浏览器指纹）
fn build_dm_img_params() -> HashMap<String, String> {
    let mut rng = rand::thread_rng();

    // 生成随机字符串并 base64 编码
    let random_str1: String = (0..rng.gen_range(16..64))
        .map(|_| rng.sample(rand::distributions::Alphanumeric) as char)
        .collect();
    let random_str2: String = (0..rng.gen_range(32..128))
        .map(|_| rng.sample(rand::distributions::Alphanumeric) as char)
        .collect();

    let dm_img_str = BASE64.encode(random_str1.as_bytes());
    let dm_img_str = dm_img_str.trim_end_matches('=').to_string();

    let dm_cover_img_str = BASE64.encode(random_str2.as_bytes());
    let dm_cover_img_str = dm_cover_img_str.trim_end_matches('=').to_string();

    let mut params = HashMap::new();
    params.insert("web_location".to_string(), "1550101".to_string());
    params.insert("dm_img_list".to_string(), "[]".to_string());
    params.insert("dm_img_str".to_string(), dm_img_str);
    params.insert("dm_cover_img_str".to_string(), dm_cover_img_str);
    params.insert(
        "dm_img_inter".to_string(),
        r#"{"ds":[],"wh":[6093,6631,31],"of":[430,760,380]}"#.to_string(),
    );
    params
}

#[derive(Debug, Deserialize)]
struct BiliVideoInfoResponse {
    code: i32,
    message: String,
    data: Option<BiliVideoData>,
}

#[derive(Debug, Deserialize)]
struct BiliVideoData {
    cid: u64,
}

#[derive(Debug, Deserialize)]
struct BiliPlayUrlResponse {
    code: i32,
    message: String,
    data: Option<BiliPlayUrlData>,
}

#[derive(Debug, Deserialize)]
struct BiliPlayUrlData {
    durl: Option<Vec<BiliDurl>>,
    dash: Option<BiliDash>,
}

#[derive(Debug, Deserialize)]
struct BiliDurl {
    url: String,
}

#[derive(Debug, Deserialize)]
struct BiliDash {
    audio: Option<Vec<BiliAudioStream>>,
}

#[derive(Debug, Deserialize)]
struct BiliAudioStream {
    #[serde(rename = "baseUrl")]
    base_url: String,
}

/// 获取视频信息（cid, title 等）
fn get_video_info(client: &Client, bvid: &str) -> Result<BiliVideoData, AppError> {
    let url = format!("https://api.bilibili.com/x/web-interface/view?bvid={}", bvid);

    let response = client
        .get(&url)
        .header("User-Agent", USER_AGENT)
        .header("Referer", "https://www.bilibili.com")
        .send()
        .map_err(|e| {
            AppError::new(
                "network_error",
                format!("无法连接 Bilibili API: {}", e),
                "请检查网络连接",
            )
        })?;

    let info: BiliVideoInfoResponse = response.json().map_err(|e| {
        AppError::new(
            "parse_error",
            format!("解析视频信息失败: {}", e),
            "Bilibili API 返回格式异常",
        )
    })?;

    if info.code != 0 {
        return Err(AppError::new(
            "api_error",
            format!("Bilibili API 错误: {}", info.message),
            "请检查视频链接是否有效",
        ));
    }

    info.data.ok_or_else(|| {
        AppError::new(
            "api_error",
            "视频信息为空",
            "请检查视频是否存在或已被删除",
        )
    })
}

/// 获取播放地址（注入风控参数）
fn get_play_url(
    client: &Client,
    bvid: &str,
    cid: u64,
    cookie: Option<&str>,
) -> Result<String, AppError> {
    let mut params = build_dm_img_params();
    params.insert("bvid".to_string(), bvid.to_string());
    params.insert("cid".to_string(), cid.to_string());
    params.insert("qn".to_string(), "64".to_string()); // 音质
    params.insert("fnval".to_string(), "16".to_string()); // dash 格式

    let mut request = client
        .get("https://api.bilibili.com/x/player/wbi/playurl")
        .query(&params)
        .header("User-Agent", USER_AGENT)
        .header("Referer", "https://www.bilibili.com");

    if let Some(cookie_str) = cookie {
        request = request.header("Cookie", cookie_str);
    }

    let response = request.send().map_err(|e| {
        AppError::new(
            "network_error",
            format!("无法获取播放地址: {}", e),
            "请检查网络连接",
        )
    })?;

    let status = response.status();
    if status.as_u16() == 412 {
        return Err(AppError::new(
            "api_error",
            "Bilibili 返回 412 Precondition Failed",
            "风控参数可能需要更新，请联系开发者",
        ));
    }

    let play_info: BiliPlayUrlResponse = response.json().map_err(|e| {
        AppError::new(
            "parse_error",
            format!("解析播放信息失败: {}", e),
            "Bilibili API 返回格式异常",
        )
    })?;

    if play_info.code != 0 {
        return Err(AppError::new(
            "api_error",
            format!("获取播放地址失败: {}", play_info.message),
            "请检查视频权限或登录状态",
        ));
    }

    let data = play_info.data.ok_or_else(|| {
        AppError::new("api_error", "播放信息为空", "无法获取音频流")
    })?;

    // 优先使用 dash 格式的音频流
    if let Some(dash) = data.dash {
        if let Some(audio_list) = dash.audio {
            if let Some(audio) = audio_list.first() {
                return Ok(audio.base_url.clone());
            }
        }
    }

    // 回退到 durl 格式
    if let Some(durl_list) = data.durl {
        if let Some(durl) = durl_list.first() {
            return Ok(durl.url.clone());
        }
    }

    Err(AppError::new(
        "api_error",
        "未找到可用的音频流",
        "该视频可能无法下载",
    ))
}

/// 下载音频流
fn download_audio_stream(
    client: &Client,
    audio_url: &str,
    output_path: &Path,
) -> Result<(), AppError> {
    let response = client
        .get(audio_url)
        .header("User-Agent", USER_AGENT)
        .header("Referer", "https://www.bilibili.com")
        .send()
        .map_err(|e| {
            AppError::new(
                "network_error",
                format!("下载音频流失败: {}", e),
                "请检查网络连接",
            )
        })?;

    let bytes = response.bytes().map_err(|e| {
        AppError::new(
            "network_error",
            format!("读取音频数据失败: {}", e),
            "下载过程中断",
        )
    })?;

    let mut file = File::create(output_path).map_err(|e| {
        AppError::new(
            "io_error",
            format!("无法创建文件: {}", e),
            "请检查磁盘空间和写入权限",
        )
    })?;

    file.write_all(&bytes).map_err(|e| {
        AppError::new(
            "io_error",
            format!("写入文件失败: {}", e),
            "请检查磁盘空间",
        )
    })?;

    Ok(())
}

/// 使用 FFmpeg 转换为 MP3
fn convert_to_mp3(input_path: &Path, output_path: &Path) -> Result<(), AppError> {
    let ffmpeg_path = crate::services::download::find_yt_dlp()
        .parent()
        .and_then(|p| {
            let ffmpeg = p.join("ffmpeg-x86_64-pc-windows-msvc.exe");
            if ffmpeg.exists() {
                Some(ffmpeg)
            } else {
                None
            }
        })
        .unwrap_or_else(|| PathBuf::from("ffmpeg.exe"));

    let status = hidden_command(&ffmpeg_path)
        .args(&[
            "-i",
            input_path.to_str().unwrap(),
            "-vn",
            "-ar",
            "44100",
            "-ac",
            "2",
            "-b:a",
            "128k",
            "-y",
            output_path.to_str().unwrap(),
        ])
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map_err(|e| {
            AppError::new(
                "tool_error",
                format!("FFmpeg 执行失败: {}", e),
                "请确保 FFmpeg 已正确安装",
            )
        })?;

    if !status.success() {
        return Err(AppError::new(
            "conversion_error",
            "音频转换失败",
            "FFmpeg 转换过程出错",
        ));
    }

    Ok(())
}

/// Bilibili 原生下载（完整流程）
pub fn download_bilibili_native(
    url: &str,
    work_dir: &Path,
    cookie: Option<&str>,
    mut progress: impl FnMut(&str),
) -> Result<PathBuf, AppError> {
    progress("正在解析 Bilibili 视频链接...");
    let bvid = extract_bvid(url)?;

    progress("正在获取视频信息...");
    let client = Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| {
            AppError::new(
                "client_error",
                format!("创建 HTTP 客户端失败: {}", e),
                "网络配置异常",
            )
        })?;

    let video_info = get_video_info(&client, &bvid)?;

    progress("正在获取播放地址（含风控参数）...");
    let audio_url = get_play_url(&client, &bvid, video_info.cid, cookie)?;

    std::fs::create_dir_all(work_dir).map_err(|e| {
        AppError::new(
            "io_error",
            format!("创建工作目录失败: {}", e),
            "请检查磁盘权限",
        )
    })?;

    let temp_audio = work_dir.join("source.m4a");
    progress("正在下载音频流...");
    download_audio_stream(&client, &audio_url, &temp_audio)?;

    let output_mp3 = work_dir.join("source.mp3");
    progress("正在转换为 MP3...");
    convert_to_mp3(&temp_audio, &output_mp3)?;

    // 清理临时文件
    let _ = std::fs::remove_file(&temp_audio);

    if output_mp3.exists() && output_mp3.metadata().map(|m| m.len() > 0).unwrap_or(false) {
        Ok(output_mp3)
    } else {
        Err(AppError::new(
            "download_failed",
            "下载完成但文件无效",
            "请重试或选择本地媒体",
        ))
    }
}
