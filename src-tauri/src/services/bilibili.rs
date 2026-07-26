//! B站服务——B站视频链接解析、字幕获取.

use crate::domain::AppError;
use crate::subtitles::TimedCaption;
use std::time::Duration;

/// BilibiliHttpClient
pub trait BilibiliHttpClient {
    fn get_json(&self, url: &str, cookie: Option<&str>) -> Result<serde_json::Value, AppError>;
}

/// ReqwestBilibiliHttpClient
pub struct ReqwestBilibiliHttpClient;

impl BilibiliHttpClient for ReqwestBilibiliHttpClient {
    fn get_json(&self, url: &str, cookie: Option<&str>) -> Result<serde_json::Value, AppError> {
        let client = reqwest::blocking::Client::builder()
            .timeout(Duration::from_secs(12))
            .user_agent("video-distiller/1.0")
            .build()
            .map_err(|_| unavailable())?;
        let mut request = client
            .get(url)
            .header("Referer", "https://www.bilibili.com");
        if let Some(cookie) = cookie {
            request = request.header("Cookie", cookie);
        }
        request
            .send()
            .and_then(|response| response.error_for_status())
            .map_err(|_| unavailable())?
            .json::<serde_json::Value>()
            .map_err(|_| unavailable())
    }
}

/// fetch bilibili subtitles
pub fn fetch_bilibili_subtitles(
    url: &str,
    cookie: Option<&str>,
) -> Result<Option<Vec<TimedCaption>>, AppError> {
    fetch_bilibili_subtitles_with(&ReqwestBilibiliHttpClient, url, cookie)
}

/// fetch bilibili subtitles with
pub fn fetch_bilibili_subtitles_with(
    client: &dyn BilibiliHttpClient,
    url: &str,
    cookie: Option<&str>,
) -> Result<Option<Vec<TimedCaption>>, AppError> {
    let Some(bvid) = extract_bvid(url) else {
        return Ok(None);
    };
    let p = query_number(url, "p").unwrap_or(1);
    let view_url = format!("https://api.bilibili.com/x/web-interface/view?bvid={bvid}&p={p}");
    let view = client.get_json(&view_url, cookie)?;
    if view["code"].as_i64() != Some(0) {
        return Ok(None);
    }
    let data = &view["data"];
    let cid = data["pages"]
        .as_array()
        .and_then(|pages| pages.get(p.saturating_sub(1)))
        .and_then(|page| page["cid"].as_i64())
        .or_else(|| data["cid"].as_i64());
    let Some(cid) = cid else { return Ok(None) };
    let player_url = format!("https://api.bilibili.com/x/player/wbi/v2?bvid={bvid}&cid={cid}");
    let player = client.get_json(&player_url, cookie)?;
    if player["code"].as_i64() != Some(0) {
        return Ok(None);
    }
    let tracks = player["data"]["subtitle"]["subtitles"]
        .as_array()
        .cloned()
        .unwrap_or_default();
    let Some(track) = tracks
        .iter()
        .find(|track| is_chinese(track) && !is_ai(track))
        .or_else(|| tracks.iter().find(|track| is_chinese(track)))
        .or_else(|| tracks.first())
    else {
        return Ok(None);
    };
    let Some(track_url) = track["subtitle_url"].as_str() else {
        return Ok(None);
    };
    let track_url = if track_url.starts_with("//") {
        format!("https:{track_url}")
    } else {
        track_url.to_string()
    };
    let body = client.get_json(&track_url, cookie)?;
    let captions = body["body"]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|item| {
            let text = item["content"].as_str()?.trim();
            (!text.is_empty()).then(|| TimedCaption {
                start_seconds: item["from"].as_f64().unwrap_or(0.0),
                text: text.to_string(),
            })
        })
        .collect::<Vec<_>>();
    Ok((!captions.is_empty()).then_some(captions))
}

fn extract_bvid(url: &str) -> Option<&str> {
    let marker = url.find("BV")?;
    let value = &url[marker..];
    let end = value
        .find(|character: char| !character.is_ascii_alphanumeric())
        .unwrap_or(value.len());
    (end > 2).then_some(&value[..end])
}
fn query_number(url: &str, name: &str) -> Option<usize> {
    url::Url::parse(url)
        .ok()?
        .query_pairs()
        .find(|(key, _)| key == name)?
        .1
        .parse()
        .ok()
}
fn is_chinese(track: &serde_json::Value) -> bool {
    track["lan"].as_str().is_some_and(|language| {
        language.eq_ignore_ascii_case("ai-zh") || language.to_ascii_lowercase().starts_with("zh")
    })
}
fn is_ai(track: &serde_json::Value) -> bool {
    track["ai_type"].as_bool().unwrap_or(false) || track["ai_type"].as_u64().unwrap_or(0) != 0
}
fn unavailable() -> AppError {
    AppError::new(
        "bilibili_subtitle_unavailable",
        "B站字幕暂时不可用。",
        "将自动尝试其他字幕或音频转写。",
    )
}
