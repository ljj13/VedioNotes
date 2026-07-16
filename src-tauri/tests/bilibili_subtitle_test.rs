use std::collections::HashMap;
use video_distiller_lib::domain::AppError;
use video_distiller_lib::services::bilibili::{fetch_bilibili_subtitles_with, BilibiliHttpClient};

struct FakeHttp {
    responses: HashMap<String, serde_json::Value>,
}
impl BilibiliHttpClient for FakeHttp {
    fn get_json(&self, url: &str, _cookie: Option<&str>) -> Result<serde_json::Value, AppError> {
        self.responses
            .get(url)
            .cloned()
            .ok_or_else(|| AppError::new("missing_fake", "missing", "missing"))
    }
}

#[test]
fn bilibili_prefers_manual_chinese_and_requested_part() {
    let mut responses = HashMap::new();
    responses.insert(
        "https://api.bilibili.com/x/web-interface/view?bvid=BV1abc&p=2".into(),
        serde_json::json!({"code":0,"data":{"pages":[{"cid":11},{"cid":22}]}}),
    );
    responses.insert(
        "https://api.bilibili.com/x/player/wbi/v2?bvid=BV1abc&cid=22".into(),
        serde_json::json!({"code":0,"data":{"subtitle":{"subtitles":[
            {"lan":"ai-zh","ai_type":1,"subtitle_url":"//subtitle.example/ai"},
            {"lan":"zh-CN","ai_type":0,"subtitle_url":"//subtitle.example/manual"}
        ]}}}),
    );
    responses.insert(
        "https://subtitle.example/manual".into(),
        serde_json::json!({"body":[{"from":1.5,"content":"人工中文"}]}),
    );

    let captions = fetch_bilibili_subtitles_with(
        &FakeHttp { responses },
        "https://www.bilibili.com/video/BV1abc?p=2",
        None,
    )
    .unwrap()
    .unwrap();
    assert_eq!(captions[0].text, "人工中文");
    assert_eq!(captions[0].start_seconds, 1.5);
}
