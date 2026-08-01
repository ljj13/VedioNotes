//! 抖音原生音频下载器（Rust）。
//!
//! 默认走签名后的抖音 Web API；请求被风控拦截时由上层降级到 yt-dlp + Cookie。
//! X-Bogus 算法按 Apache-2.0 项目 Douyin_TikTok_Download_API 的实现移植，
//! 具体来源和许可证记录在仓库根目录 `THIRD_PARTY_NOTICES.md`。

use anyhow::{anyhow, Context, Result};
use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use md5::{Digest, Md5};
use rand::{distributions::Alphanumeric, Rng};
use reqwest::header::{
    HeaderMap, HeaderValue, ACCEPT, ACCEPT_LANGUAGE, CONTENT_RANGE, CONTENT_TYPE, COOKIE, RANGE,
    REFERER, USER_AGENT,
};
use serde::Deserialize;
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tokio::io::AsyncWriteExt;

use super::download::{DownloadPhase, DownloadProgress};

const DOUYIN_DOMAIN: &str = "https://www.douyin.com";
const DOUYIN_DETAIL_PATH: &str = "/aweme/v1/web/aweme/detail/";
const USER_AGENT_VALUE: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36";
const MOBILE_USER_AGENT: &str = "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1";
const TTWID_REGISTER_URL: &str = "https://ttwid.bytedance.com/ttwid/union/register/";
const TTWID_REGISTER_BODY: &str = r#"{"region":"cn","aid":1768,"needFid":false,"service":"www.ixigua.com","migrate_info":{"ticket":"","source":"node"},"cbUrlProtocol":"https","union":true}"#;
const API_REQUEST_TIMEOUT: Duration = Duration::from_secs(12);
const MEDIA_CHUNK_IDLE_TIMEOUT: Duration = Duration::from_secs(30);
const PROGRESS_REPORT_INTERVAL: Duration = Duration::from_millis(250);

fn report(
    progress: &mut dyn FnMut(DownloadProgress),
    phase: DownloadPhase,
    message: impl Into<String>,
) {
    progress(DownloadProgress::message(phase, message));
}

fn validate_media_response(status: reqwest::StatusCode, content_type: Option<&str>) -> Result<()> {
    if status != reqwest::StatusCode::OK && status != reqwest::StatusCode::PARTIAL_CONTENT {
        return Err(anyhow!("抖音媒体地址返回 HTTP {status}"));
    }
    let normalized = content_type.unwrap_or("").to_ascii_lowercase();
    if normalized.starts_with("text/html") || normalized.starts_with("application/json") {
        return Err(anyhow!("抖音媒体地址返回了网页或 JSON，而不是媒体文件"));
    }
    if !(normalized.starts_with("video/")
        || normalized.starts_with("audio/")
        || normalized.starts_with("application/octet-stream"))
    {
        return Err(anyhow!("抖音媒体响应类型无法确认"));
    }
    Ok(())
}

fn content_range_total(value: Option<&str>) -> Option<u64> {
    value?
        .rsplit_once('/')
        .and_then(|(_, total)| total.trim().parse::<u64>().ok())
        .filter(|total| *total > 0)
}

fn calculate_download_progress(
    downloaded_bytes: u64,
    total_bytes: Option<u64>,
    elapsed: Duration,
) -> DownloadProgress {
    let elapsed_seconds = elapsed.as_secs_f64();
    let speed = (elapsed_seconds > 0.0)
        .then(|| (downloaded_bytes as f64 / elapsed_seconds).round() as u64)
        .filter(|value| *value > 0);
    let percent = total_bytes
        .filter(|total| *total > 0)
        .map(|total| (downloaded_bytes as f64 * 100.0 / total as f64).clamp(0.0, 100.0));
    let eta_seconds = total_bytes.and_then(|total| {
        speed.filter(|speed| *speed > 0)
            .map(|speed| total.saturating_sub(downloaded_bytes).div_ceil(speed))
    });
    DownloadProgress {
        phase: DownloadPhase::Downloading,
        message: "正在下载抖音媒体...".to_string(),
        percent,
        downloaded_bytes,
        total_bytes,
        speed_bytes_per_second: speed,
        eta_seconds,
    }
}

fn should_attach_cookie(url: &str) -> bool {
    let Ok(parsed) = url::Url::parse(url) else {
        return false;
    };
    let host = parsed.host_str().unwrap_or("").to_ascii_lowercase();
    host == "douyin.com"
        || host.ends_with(".douyin.com")
        || host == "iesdouyin.com"
        || host.ends_with(".iesdouyin.com")
}

fn ensure_not_cancelled(cancelled: &dyn Fn() -> bool) -> Result<()> {
    if cancelled() {
        Err(anyhow!("用户取消下载"))
    } else {
        Ok(())
    }
}

fn unix_timestamp_seconds() -> u32 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as u32
}

fn md5_digest(data: &[u8]) -> [u8; 16] {
    let digest = Md5::digest(data);
    let mut result = [0_u8; 16];
    result.copy_from_slice(&digest);
    result
}

fn rc4(key: &[u8], data: &[u8]) -> Vec<u8> {
    let mut state = (0_u16..=255).map(|value| value as u8).collect::<Vec<_>>();
    let mut j = 0_usize;
    for i in 0..256 {
        j = (j + state[i] as usize + key[i % key.len()] as usize) % 256;
        state.swap(i, j);
    }

    let mut i = 0_usize;
    j = 0;
    data.iter()
        .map(|byte| {
            i = (i + 1) % 256;
            j = (j + state[i] as usize) % 256;
            state.swap(i, j);
            byte ^ state[(state[i] as usize + state[j] as usize) % 256]
        })
        .collect()
}

/// Douyin Web API X-Bogus signer.
struct XBogusGenerator {
    user_agent: String,
}

impl XBogusGenerator {
    const CHARACTER_TABLE: &'static [u8] =
        b"Dkdpgh4ZKsQB80/Mfvw36XI1R25-WUAlEi7NLboqYTOPuzmFjJnryx9HVGcaStCe=";

    fn new(user_agent: impl Into<String>) -> Self {
        Self {
            user_agent: user_agent.into(),
        }
    }

    fn generate(&self, query: &str) -> String {
        self.generate_at(query, unix_timestamp_seconds())
    }

    fn generate_at(&self, query: &str, timestamp: u32) -> String {
        let ua_cipher = rc4(&[0, 1, 12], self.user_agent.as_bytes());
        let ua_md5 = md5_digest(BASE64.encode(ua_cipher).as_bytes());
        let empty_md5 = md5_digest(&md5_digest(b""));
        let query_md5 = md5_digest(&md5_digest(query.as_bytes()));
        let constant = 536_919_696_u32;

        let mut values = vec![
            64,
            0,
            1,
            12,
            query_md5[14],
            query_md5[15],
            empty_md5[14],
            empty_md5[15],
            ua_md5[14],
            ua_md5[15],
        ];
        values.extend_from_slice(&timestamp.to_be_bytes());
        values.extend_from_slice(&constant.to_be_bytes());
        values.push(values.iter().fold(0_u8, |acc, value| acc ^ value));

        let mut interleaved = values.iter().step_by(2).copied().collect::<Vec<_>>();
        interleaved.extend(values.iter().skip(1).step_by(2).copied());
        let order = [
            0, 10, 1, 11, 2, 12, 3, 13, 4, 14, 5, 15, 6, 16, 7, 17, 8, 18, 9,
        ];
        let payload = order
            .iter()
            .map(|index| interleaved[*index])
            .collect::<Vec<_>>();

        let encrypted = rc4(&[255], &payload);
        let mut encoded_input = Vec::with_capacity(21);
        encoded_input.extend_from_slice(&[2, 255]);
        encoded_input.extend_from_slice(&encrypted);

        encoded_input
            .chunks_exact(3)
            .flat_map(|chunk| {
                let value = ((chunk[0] as u32) << 16) | ((chunk[1] as u32) << 8) | chunk[2] as u32;
                [
                    Self::CHARACTER_TABLE[((value & 0xFC0000) >> 18) as usize] as char,
                    Self::CHARACTER_TABLE[((value & 0x03F000) >> 12) as usize] as char,
                    Self::CHARACTER_TABLE[((value & 0x000FC0) >> 6) as usize] as char,
                    Self::CHARACTER_TABLE[(value & 0x00003F) as usize] as char,
                ]
            })
            .collect()
    }
}

fn cookie_value(cookie_header: Option<&str>, name: &str) -> Option<String> {
    cookie_header?.split(';').find_map(|item| {
        let (key, value) = item.trim().split_once('=')?;
        (key.trim() == name && !value.trim().is_empty()).then(|| value.trim().to_string())
    })
}

fn fallback_ms_token() -> String {
    let body = rand::thread_rng()
        .sample_iter(&Alphanumeric)
        .take(182)
        .map(char::from)
        .collect::<String>();
    format!("{body}==")
}

fn detail_query(video_id: &str, aid: &str, ms_token: &str) -> String {
    let params = [
        ("device_platform", "webapp"),
        ("aid", aid),
        ("channel", "channel_pc_web"),
        ("update_version_code", "170400"),
        ("pc_client_type", "1"),
        ("pc_libra_divert", "Windows"),
        ("version_code", "290100"),
        ("version_name", "29.1.0"),
        ("cookie_enabled", "true"),
        ("screen_width", "1536"),
        ("screen_height", "864"),
        ("browser_language", "zh-CN"),
        ("browser_platform", "Win32"),
        ("browser_name", "Chrome"),
        ("browser_version", "139.0.0.0"),
        ("browser_online", "true"),
        ("engine_name", "Blink"),
        ("engine_version", "139.0.0.0"),
        ("os_name", "Windows"),
        ("os_version", "10"),
        ("cpu_core_num", "16"),
        ("device_memory", "8"),
        ("platform", "PC"),
        ("downlink", "10"),
        ("effective_type", "4g"),
        ("round_trip_time", "200"),
        ("support_h265", "1"),
        ("support_dash", "1"),
        ("uifid", ""),
        ("msToken", ms_token),
        ("aweme_id", video_id),
    ];
    let mut serializer = url::form_urlencoded::Serializer::new(String::new());
    for (key, value) in params {
        serializer.append_pair(key, value);
    }
    serializer.finish()
}

#[derive(Debug, Deserialize)]
struct DouyinVideoResponse {
    #[serde(default)]
    aweme_detail: Option<DouyinAwemeDetail>,
    #[serde(default)]
    status_code: i64,
    #[serde(default)]
    status_msg: String,
}

#[derive(Debug, Deserialize)]
struct DouyinAwemeDetail {
    #[serde(default)]
    music: Option<DouyinMusic>,
}

#[derive(Debug, Deserialize)]
struct DouyinMusic {
    #[serde(default)]
    play_url: Option<DouyinPlayUrl>,
}

#[derive(Debug, Deserialize)]
struct DouyinPlayUrl {
    #[serde(default)]
    uri: String,
    #[serde(default)]
    url_list: Vec<String>,
}

impl DouyinAwemeDetail {
    fn audio_url(&self) -> Option<&str> {
        let play_url = self.music.as_ref()?.play_url.as_ref()?;
        play_url
            .url_list
            .iter()
            .find(|url| url.starts_with("http://") || url.starts_with("https://"))
            .map(String::as_str)
            .or_else(|| {
                (play_url.uri.starts_with("http://") || play_url.uri.starts_with("https://"))
                    .then_some(play_url.uri.as_str())
            })
    }
}

fn find_item_list(value: &serde_json::Value, depth: u8) -> Option<&Vec<serde_json::Value>> {
    if depth > 12 {
        return None;
    }
    match value {
        serde_json::Value::Object(object) => {
            if let Some(items) = object
                .get("item_list")
                .and_then(serde_json::Value::as_array)
            {
                return Some(items);
            }
            object
                .values()
                .find_map(|child| find_item_list(child, depth + 1))
        }
        serde_json::Value::Array(items) => items
            .iter()
            .find_map(|child| find_item_list(child, depth + 1)),
        _ => None,
    }
}

fn extract_share_video_url(html: &str) -> Result<String> {
    let marker = "window._ROUTER_DATA";
    let marker_start = html
        .find(marker)
        .ok_or_else(|| anyhow!("抖音分享页没有 ROUTER_DATA"))?;
    let assignment = html[marker_start + marker.len()..]
        .find('=')
        .map(|offset| marker_start + marker.len() + offset + 1)
        .ok_or_else(|| anyhow!("抖音分享页 ROUTER_DATA 格式无效"))?;
    let script_end = html[assignment..]
        .find("</script>")
        .map(|offset| assignment + offset)
        .ok_or_else(|| anyhow!("抖音分享页 ROUTER_DATA 未闭合"))?;
    let raw_json = html[assignment..script_end]
        .trim()
        .trim_end_matches(';')
        .trim();
    let data: serde_json::Value =
        serde_json::from_str(raw_json).context("解析抖音分享页视频数据失败")?;
    let item = find_item_list(&data, 0)
        .and_then(|items| items.first())
        .ok_or_else(|| anyhow!("抖音分享页没有视频条目"))?;
    let play_addr = item
        .get("video")
        .and_then(|video| video.get("play_addr"))
        .ok_or_else(|| anyhow!("抖音分享页没有播放地址"))?;

    if let Some(url) = play_addr
        .get("url_list")
        .and_then(serde_json::Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(serde_json::Value::as_str)
        .find(|url| url.starts_with("http://") || url.starts_with("https://"))
    {
        return Ok(url.to_string());
    }

    let uri = play_addr
        .get("uri")
        .and_then(serde_json::Value::as_str)
        .filter(|uri| !uri.trim().is_empty())
        .ok_or_else(|| anyhow!("抖音分享页播放 URI 为空"))?;
    if uri.starts_with("http://") || uri.starts_with("https://") {
        Ok(uri.to_string())
    } else {
        Ok(format!(
            "https://aweme.snssdk.com/aweme/v1/play/?video_id={}&ratio=720p&line=0",
            urlencoding::encode(uri)
        ))
    }
}

/// Native Douyin downloader with bounded requests and streamed file writes.
pub struct DouyinNativeDownloader {
    client: reqwest::Client,
    signer: XBogusGenerator,
    cookie: Option<String>,
}

impl DouyinNativeDownloader {
    pub fn new(cookie: Option<String>) -> Result<Self> {
        let mut headers = HeaderMap::new();
        headers.insert(USER_AGENT, HeaderValue::from_static(USER_AGENT_VALUE));
        headers.insert(REFERER, HeaderValue::from_static("https://www.douyin.com/"));
        headers.insert(ACCEPT, HeaderValue::from_static("*/*"));
        headers.insert(
            ACCEPT_LANGUAGE,
            HeaderValue::from_static("zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7"),
        );
        if let Some(cookie_value) = cookie.as_deref() {
            HeaderValue::from_str(cookie_value.trim())
                .context("抖音 Cookie 格式错误，无法创建安全请求头")?;
        }

        let client = reqwest::Client::builder()
            .default_headers(headers)
            .cookie_store(true)
            .connect_timeout(Duration::from_secs(5))
            .redirect(reqwest::redirect::Policy::limited(10))
            .build()
            .context("无法初始化抖音 HTTP 客户端")?;

        Ok(Self {
            client,
            signer: XBogusGenerator::new(USER_AGENT_VALUE),
            cookie,
        })
    }

    fn get(&self, url: &str) -> reqwest::RequestBuilder {
        let request = self.client.get(url);
        match self.cookie.as_deref().filter(|_| should_attach_cookie(url)) {
            Some(cookie) => request.header(COOKIE, cookie),
            None => request,
        }
    }

    /// Extract a video ID from canonical, user/modal, or short Douyin links.
    pub async fn extract_video_id(&self, url: &str) -> Result<String> {
        let real_url = if url.contains("v.douyin.com") {
            self.get(url)
                .timeout(Duration::from_secs(10))
                .send()
                .await
                .context("解析抖音短链接超时或失败")?
                .url()
                .to_string()
        } else {
            url.to_string()
        };

        let parsed = url::Url::parse(&real_url).context("抖音链接格式无效")?;
        if let Some(video_id) = parsed.query_pairs().find_map(|(key, value)| {
            ((key == "modal_id" || key == "vid" || key == "aweme_id")
                && value.bytes().all(|byte| byte.is_ascii_digit()))
            .then(|| value.into_owned())
        }) {
            return Ok(video_id);
        }

        let segments = parsed
            .path_segments()
            .into_iter()
            .flatten()
            .collect::<Vec<_>>();
        if let Some(video_id) = segments.windows(2).find_map(|pair| {
            ((pair[0] == "video" || pair[0] == "note")
                && pair[1].bytes().all(|byte| byte.is_ascii_digit()))
            .then(|| pair[1].to_string())
        }) {
            return Ok(video_id);
        }

        Err(anyhow!("无法从抖音链接提取视频编号"))
    }

    async fn initialize_anonymous_session(
        &self,
        progress: &mut (dyn FnMut(DownloadProgress) + Send),
    ) {
        if cookie_value(self.cookie.as_deref(), "ttwid").is_some() {
            return;
        }

        report(progress, DownloadPhase::Resolving, "正在建立抖音匿名会话...");
        if self
            .client
            .post(TTWID_REGISTER_URL)
            .header("Content-Type", "application/json")
            .body(TTWID_REGISTER_BODY)
            .timeout(Duration::from_secs(6))
            .send()
            .await
            .is_err()
        {
            report(
                progress,
                DownloadPhase::Resolving,
                "匿名会话初始化未完成，继续尝试签名接口...",
            );
        }
    }

    async fn resolve_share_page_video(
        &self,
        video_id: &str,
        progress: &mut (dyn FnMut(DownloadProgress) + Send),
    ) -> Result<String> {
        report(
            progress,
            DownloadPhase::Resolving,
            "[router_data] 正在读取抖音公开分享页...",
        );
        let share_url = format!("https://www.iesdouyin.com/share/video/{video_id}/");
        let response = self
            .get(&share_url)
            .header(USER_AGENT, MOBILE_USER_AGENT)
            .header(REFERER, "https://www.douyin.com/")
            .timeout(Duration::from_secs(15))
            .send()
            .await
            .context("请求抖音公开分享页失败")?;
        if !response.status().is_success() {
            return Err(anyhow!("抖音公开分享页返回 HTTP {}", response.status()));
        }
        let html = response.text().await.context("读取抖音公开分享页失败")?;
        extract_share_video_url(&html)
    }

    async fn fetch_video_info(
        &self,
        video_id: &str,
        progress: &mut (dyn FnMut(DownloadProgress) + Send),
    ) -> Result<DouyinAwemeDetail> {
        let ms_token =
            cookie_value(self.cookie.as_deref(), "msToken").unwrap_or_else(fallback_ms_token);
        let attempts = [("6383", 1_u8), ("6383", 2_u8), ("1128", 3_u8)];
        let mut last_error = "抖音接口未返回视频信息".to_string();

        for (aid, attempt) in attempts {
            report(
                progress,
                DownloadPhase::Resolving,
                format!("[legacy_api] 正在请求抖音旧签名接口（第 {attempt}/3 次）..."),
            );
            let query = detail_query(video_id, aid, &ms_token);
            let signature = self.signer.generate(&query);
            let request_url = format!(
                "{DOUYIN_DOMAIN}{DOUYIN_DETAIL_PATH}?{query}&X-Bogus={}",
                urlencoding::encode(&signature)
            );

            match self
                .get(&request_url)
                .timeout(API_REQUEST_TIMEOUT)
                .send()
                .await
            {
                Ok(response) => {
                    let status = response.status();
                    match response.bytes().await {
                        Ok(body) if status.is_success() && !body.is_empty() => {
                            match serde_json::from_slice::<DouyinVideoResponse>(&body) {
                                Ok(payload) => {
                                    if let Some(detail) = payload.aweme_detail {
                                        return Ok(detail);
                                    }
                                    last_error = if payload.status_msg.trim().is_empty() {
                                        format!(
                                            "抖音接口未返回视频信息（状态码 {}）",
                                            payload.status_code
                                        )
                                    } else {
                                        format!("抖音接口拒绝请求：{}", payload.status_msg.trim())
                                    };
                                }
                                Err(_) => {
                                    last_error = "抖音返回了验证页面而不是视频数据".to_string();
                                }
                            }
                        }
                        Ok(_) => {
                            last_error = if status.is_success() {
                                "抖音接口返回空数据（触发风控）".to_string()
                            } else {
                                format!("抖音接口返回 HTTP {status}")
                            };
                        }
                        Err(error) => {
                            last_error = format!("读取抖音接口响应失败：{error}");
                        }
                    }
                }
                Err(error) if error.is_timeout() => {
                    last_error = "抖音接口请求超时".to_string();
                }
                Err(error) => {
                    last_error = format!("抖音接口请求失败：{error}");
                }
            }

            if attempt < 3 {
                let delay = Duration::from_secs(attempt as u64);
                report(
                    progress,
                    DownloadPhase::Resolving,
                    format!("{last_error}，{} 秒后重试...", delay.as_secs()),
                );
                tokio::time::sleep(delay).await;
            }
        }

        Err(anyhow!("{last_error}"))
    }

    async fn stream_to_file(
        &self,
        media_url: &str,
        output_path: &Path,
        media_label: &str,
        cancelled: &(dyn Fn() -> bool + Send + Sync),
        progress: &mut (dyn FnMut(DownloadProgress) + Send),
    ) -> Result<()> {
        let partial_path = PathBuf::from(format!("{}.part", output_path.display()));
        if let Some(parent) = output_path.parent() {
            tokio::fs::create_dir_all(parent).await?;
        }

        let result = async {
            ensure_not_cancelled(cancelled)?;
            let request = self
                .client
                .get(media_url)
                .header(USER_AGENT, MOBILE_USER_AGENT)
                .header(REFERER, "https://www.douyin.com/")
                .header(RANGE, "bytes=0-")
                .send();
            let mut response = tokio::time::timeout(Duration::from_secs(20), request)
                .await
                .map_err(|_| anyhow!("请求抖音媒体地址超时"))?
                .context("请求抖音音频地址失败")?;
            let content_type = response
                .headers()
                .get(CONTENT_TYPE)
                .and_then(|value| value.to_str().ok());
            validate_media_response(response.status(), content_type)?;

            let total = content_range_total(
                response
                    .headers()
                    .get(CONTENT_RANGE)
                    .and_then(|value| value.to_str().ok()),
            )
            .or_else(|| response.content_length());
            let mut file = tokio::fs::File::create(&partial_path).await?;
            let mut downloaded = 0_u64;
            let started = Instant::now();
            let mut last_reported = Instant::now()
                .checked_sub(PROGRESS_REPORT_INTERVAL)
                .unwrap_or_else(Instant::now);
            let mut initial = calculate_download_progress(0, total, Duration::ZERO);
            initial.message = format!("正在下载抖音{media_label}...");
            progress(initial);

            loop {
                ensure_not_cancelled(cancelled)?;
                let next_chunk = tokio::time::timeout(MEDIA_CHUNK_IDLE_TIMEOUT, response.chunk())
                    .await
                    .map_err(|_| anyhow!("抖音媒体下载长时间没有收到数据"))?
                    .context("读取抖音音频数据失败")?;
                let Some(chunk) = next_chunk else {
                    break;
                };
                file.write_all(&chunk).await?;
                downloaded += chunk.len() as u64;
                if last_reported.elapsed() >= PROGRESS_REPORT_INTERVAL {
                    let mut update = calculate_download_progress(downloaded, total, started.elapsed());
                    update.message = format!("正在下载抖音{media_label}...");
                    progress(update);
                    last_reported = Instant::now();
                }
            }
            file.flush().await?;
            drop(file);

            if downloaded == 0 {
                return Err(anyhow!("抖音音频响应为空"));
            }
            if tokio::fs::try_exists(output_path).await.unwrap_or(false) {
                tokio::fs::remove_file(output_path).await?;
            }
            tokio::fs::rename(&partial_path, output_path).await?;
            let mut completed = calculate_download_progress(
                downloaded,
                total.or(Some(downloaded)),
                started.elapsed(),
            );
            completed.percent = Some(100.0);
            completed.message = format!("抖音{media_label}下载完成");
            progress(completed);
            Ok(())
        }
        .await;

        if result.is_err() {
            let _ = tokio::fs::remove_file(&partial_path).await;
        }
        result
    }

    /// Resolve metadata and download the video's audio stream with progress.
    pub async fn download_audio(
        &self,
        video_url: &str,
        output_path: &Path,
        progress: &mut (dyn FnMut(DownloadProgress) + Send),
    ) -> Result<()> {
        report(progress, DownloadPhase::Resolving, "正在解析抖音视频编号...");
        let video_id = self.extract_video_id(video_url).await?;
        self.initialize_anonymous_session(progress).await;
        let detail = self.fetch_video_info(&video_id, progress).await?;
        let audio_url = detail
            .audio_url()
            .ok_or_else(|| anyhow!("抖音视频信息中没有可下载的音频流"))?;
        report(
            progress,
            DownloadPhase::Downloading,
            "视频信息已获取，开始下载音频...",
        );
        self.stream_to_file(audio_url, output_path, "音频", &|| false, progress)
            .await
    }

    /// Download a transcribable source. The public mobile share page is tried
    /// first because it currently works without account cookies; the signed
    /// Web API remains the second native route.
    pub async fn download_source(
        &self,
        video_url: &str,
        work_dir: &Path,
        cancelled: &(dyn Fn() -> bool + Send + Sync),
        progress: &mut (dyn FnMut(DownloadProgress) + Send),
    ) -> Result<PathBuf> {
        ensure_not_cancelled(cancelled)?;
        report(progress, DownloadPhase::Resolving, "正在解析抖音视频编号...");
        let video_id = self.extract_video_id(video_url).await?;

        match self.resolve_share_page_video(&video_id, progress).await {
            Ok(media_url) => {
                report(
                    progress,
                    DownloadPhase::Downloading,
                    "[router_data] 公开分享页解析成功，开始下载视频媒体...",
                );
                let output_path = work_dir.join("source.mp4");
                self.stream_to_file(&media_url, &output_path, "视频", cancelled, progress)
                    .await?;
                return Ok(output_path);
            }
            Err(error) => {
                report(
                    progress,
                    DownloadPhase::Resolving,
                    format!("[router_data] 解析失败：{error}。[legacy_api] 正在尝试旧签名接口..."),
                );
            }
        }

        ensure_not_cancelled(cancelled)?;
        self.initialize_anonymous_session(progress).await;
        let detail = self.fetch_video_info(&video_id, progress).await?;
        let audio_url = detail
            .audio_url()
            .ok_or_else(|| anyhow!("抖音视频信息中没有可下载的音频流"))?;
        report(
            progress,
            DownloadPhase::Downloading,
            "[legacy_api] 解析成功，开始下载音频...",
        );
        let output_path = work_dir.join("source.mp3");
        self.stream_to_file(audio_url, &output_path, "音频", cancelled, progress)
            .await?;
        Ok(output_path)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn x_bogus_signature_has_expected_wire_format() {
        let generator = XBogusGenerator::new(USER_AGENT_VALUE);
        let query = "device_platform=webapp&aid=6383&aweme_id=7663687865578163499";
        let bogus = generator.generate_at(query, 1_721_234_567);

        assert_eq!(bogus.len(), 28);
        assert!(bogus
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'/' | b'+')));
        assert_eq!(bogus, generator.generate_at(query, 1_721_234_567));
    }

    #[test]
    fn fallback_ms_token_matches_web_parameter_shape() {
        let token = fallback_ms_token();
        assert_eq!(token.len(), 184);
        assert!(token.ends_with("=="));
    }

    #[tokio::test]
    async fn extracts_video_id_from_canonical_and_user_modal_urls() {
        let downloader = DouyinNativeDownloader::new(None).expect("client should initialize");
        let urls = [
            "https://www.douyin.com/video/7663687865578163499",
            "https://www.douyin.com/user/MS4wLjABAAAA?modal_id=7663687865578163499",
        ];

        for url in urls {
            let video_id = downloader
                .extract_video_id(url)
                .await
                .expect("supported Douyin URLs must expose the video id");
            assert_eq!(video_id, "7663687865578163499");
        }
    }

    #[test]
    fn detail_query_contains_required_identity_fields() {
        let query = detail_query("7663687865578163499", "6383", "token");
        assert!(query.contains("aweme_id=7663687865578163499"));
        assert!(query.contains("aid=6383"));
        assert!(query.contains("msToken=token"));
        assert!(query.contains("browser_platform=Win32"));
    }

    #[test]
    fn extracts_media_url_from_share_page_router_data() {
        let html = r#"<script>window._ROUTER_DATA = {"loaderData":{"video":{"item_list":[{"video":{"play_addr":{"uri":"video-token","url_list":["https://aweme.snssdk.com/example.mp4"]}}}]}}}</script>"#;
        let media_url = extract_share_video_url(html).expect("share data should be parsed");
        assert_eq!(media_url, "https://aweme.snssdk.com/example.mp4");
    }

    #[test]
    fn accepts_video_media_responses_and_rejects_html_or_json() {
        assert!(validate_media_response(reqwest::StatusCode::OK, Some("video/mp4")).is_ok());
        assert!(validate_media_response(
            reqwest::StatusCode::PARTIAL_CONTENT,
            Some("application/octet-stream")
        )
        .is_ok());
        assert!(validate_media_response(
            reqwest::StatusCode::OK,
            Some("text/html; charset=utf-8")
        )
        .is_err());
        assert!(validate_media_response(
            reqwest::StatusCode::OK,
            Some("application/json")
        )
        .is_err());
    }

    #[test]
    fn progress_math_reports_bytes_speed_percent_and_eta() {
        let progress = calculate_download_progress(
            25 * 1_048_576,
            Some(100 * 1_048_576),
            Duration::from_secs(5),
        );

        assert_eq!(progress.percent, Some(25.0));
        assert_eq!(progress.downloaded_bytes, 25 * 1_048_576);
        assert_eq!(progress.total_bytes, Some(100 * 1_048_576));
        assert_eq!(progress.speed_bytes_per_second, Some(5 * 1_048_576));
        assert_eq!(progress.eta_seconds, Some(15));
    }

    #[test]
    fn cookie_is_only_attached_to_douyin_page_and_api_hosts() {
        assert!(should_attach_cookie("https://www.douyin.com/video/123"));
        assert!(should_attach_cookie(
            "https://www.iesdouyin.com/share/video/123/"
        ));
        assert!(!should_attach_cookie(
            "https://aweme.snssdk.com/aweme/v1/play/"
        ));
        assert!(!should_attach_cookie(
            "https://v5-colda.douyinvod.com/media.mp4"
        ));
    }

    #[tokio::test]
    #[ignore = "requires live Douyin network access"]
    async fn live_downloads_public_douyin_audio_without_hanging() {
        let temp = tempfile::tempdir().expect("temporary directory should be created");
        let downloader = DouyinNativeDownloader::new(None).expect("client should initialize");
        let mut updates = Vec::new();
        let output = downloader
            .download_source(
                "https://www.douyin.com/video/7663687865578163499",
                temp.path(),
                &|| false,
                &mut |update| updates.push(update),
            )
            .await
            .expect("public video media should download");

        assert!(output
            .metadata()
            .map(|meta| meta.len() > 0)
            .unwrap_or(false));
        assert!(updates
            .iter()
            .any(|update| update.message.contains("下载抖音视频")));
        assert!(updates.iter().any(|update| update.downloaded_bytes > 0));
        assert!(updates
            .iter()
            .any(|update| update.speed_bytes_per_second.is_some()));
        assert!(updates
            .iter()
            .any(|update| update.percent == Some(100.0)));
    }
}
