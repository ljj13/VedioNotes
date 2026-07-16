use std::collections::VecDeque;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tempfile::tempdir;
use video_distiller_lib::services::download::{
    build_capture_attempts, build_platform_capture_attempts, capture_douyin_with,
    classify_platform_url, validate_douyin_url, AttemptFailureCategory, AttemptOutcome,
    CaptureAttempt, CaptureMethod, CapturePurpose, DownloadExecutor, VideoPlatform,
};

#[test]
fn classifies_only_supported_official_platform_hosts() {
    assert_eq!(
        classify_platform_url("https://www.bilibili.com/video/BV1xx411c7mD"),
        Ok(VideoPlatform::Bilibili)
    );
    assert_eq!(
        classify_platform_url("https://b23.tv/abc123"),
        Ok(VideoPlatform::Bilibili)
    );
    assert_eq!(
        classify_platform_url("https://youtu.be/dQw4w9WgXcQ"),
        Ok(VideoPlatform::Youtube)
    );
    assert_eq!(
        classify_platform_url("https://m.youtube.com/watch?v=abc"),
        Ok(VideoPlatform::Youtube)
    );
    assert_eq!(
        classify_platform_url("https://v.douyin.com/abc123/"),
        Ok(VideoPlatform::Douyin)
    );
}

#[test]
fn rejects_platform_lookalike_hosts() {
    for url in [
        "https://bilibili.com.evil.example/video/BV1xx411c7mD",
        "https://youtube.com.evil.example/watch?v=abc",
        "https://douyin.com.evil.example/abc",
    ] {
        let error = classify_platform_url(url).unwrap_err();
        assert_eq!(error.code, "invalid_url");
        assert_eq!(
            error.recovery,
            "请使用支持平台的分享链接，或选择本地视频/音频。"
        );
    }
}

#[test]
fn rejects_non_douyin_url() {
    let err = validate_douyin_url("https://example.com").unwrap_err();
    assert_eq!(err.code, "invalid_url");
    assert_eq!(err.recovery, "请使用抖音分享链接，或选择本地视频/音频。");
}

#[test]
fn rejects_invalid_url_string() {
    let err = validate_douyin_url("not-a-url").unwrap_err();
    assert_eq!(err.code, "invalid_url");
}

#[test]
fn accepts_douyin_com_url() {
    assert!(validate_douyin_url("https://www.douyin.com/video/123").is_ok());
}

#[test]
fn accepts_iesdouyin_com_url() {
    assert!(validate_douyin_url("https://www.iesdouyin.com/share/123").is_ok());
}

#[test]
fn accepts_short_douyin_url() {
    assert!(validate_douyin_url("https://v.douyin.com/abc123/").is_ok());
}

struct FakeExecutor {
    outcomes: Mutex<VecDeque<AttemptOutcome>>,
    methods: Mutex<Vec<CaptureMethod>>,
    success_path: PathBuf,
}

impl FakeExecutor {
    fn new(outcomes: Vec<AttemptOutcome>, success_path: PathBuf) -> Self {
        Self {
            outcomes: Mutex::new(outcomes.into()),
            methods: Mutex::new(Vec::new()),
            success_path,
        }
    }

    fn methods(&self) -> Vec<CaptureMethod> {
        self.methods.lock().unwrap().clone()
    }
}

impl DownloadExecutor for FakeExecutor {
    fn execute(&self, _executable: &Path, attempt: &CaptureAttempt) -> AttemptOutcome {
        self.methods.lock().unwrap().push(attempt.method);
        let outcome = self.outcomes.lock().unwrap().pop_front().unwrap();
        if outcome.success {
            std::fs::write(&self.success_path, b"fake audio").unwrap();
        }
        outcome
    }
}

fn failed(category: AttemptFailureCategory) -> AttemptOutcome {
    AttemptOutcome {
        success: false,
        exit_code: Some(1),
        category,
    }
}

fn succeeded() -> AttemptOutcome {
    AttemptOutcome {
        success: true,
        exit_code: Some(0),
        category: AttemptFailureCategory::None,
    }
}

#[test]
fn capture_douyin_without_a_manual_cookie_never_reads_browser_profiles() {
    let dir = tempdir().unwrap();
    let output = dir.path().join("source.mp3");
    let fake = FakeExecutor::new(vec![failed(AttemptFailureCategory::AccessDenied)], output);

    let error = capture_douyin_with(
        &fake,
        "yt-dlp.exe".as_ref(),
        "https://v.douyin.com/abc123/",
        dir.path(),
        |_| {},
    )
    .unwrap_err();

    assert_eq!(error.code, "download_failed");
    assert_eq!(fake.methods(), vec![CaptureMethod::Anonymous]);
}

#[test]
fn capture_stops_after_first_success() {
    let dir = tempdir().unwrap();
    let fake = FakeExecutor::new(vec![succeeded()], dir.path().join("source.mp3"));

    capture_douyin_with(
        &fake,
        "yt-dlp.exe".as_ref(),
        "https://www.douyin.com/video/123",
        dir.path(),
        |_| {},
    )
    .unwrap();

    assert_eq!(fake.methods(), vec![CaptureMethod::Anonymous]);
}

#[test]
fn anonymous_capture_arguments_never_name_a_browser_profile() {
    let attempts = build_capture_attempts(Path::new("C:\\work"), "https://v.douyin.com/abc/");
    assert!(attempts[0]
        .args
        .windows(2)
        .any(|x| x == ["--format", "bestaudio/best"]));
    assert!(!attempts[0]
        .args
        .iter()
        .any(|x| x == "--cookies-from-browser"));
    assert_eq!(attempts.len(), 1);
    assert!(!attempts[0].args.iter().any(|x| x == "--cookies"));
    assert!(attempts
        .iter()
        .all(|attempt| !attempt.args.iter().any(|x| x == "--cookies-from-browser")));
    assert!(attempts
        .iter()
        .all(|attempt| attempt.args.iter().any(|x| x == "--extract-audio")));
    assert!(attempts
        .iter()
        .all(|attempt| attempt.args.iter().any(|x| x == "--ignore-config")));
}

#[test]
fn platform_capture_uses_manual_cookie_file_after_anonymous_attempt() {
    let dir = tempdir().unwrap();
    let cookie = dir.path().join("task-cookie.txt");
    let attempts = build_platform_capture_attempts(
        VideoPlatform::Douyin,
        CapturePurpose::Audio,
        dir.path(),
        "https://v.douyin.com/abc/",
        Some(&cookie),
    );

    assert_eq!(
        attempts
            .iter()
            .map(|attempt| attempt.method)
            .collect::<Vec<_>>(),
        vec![CaptureMethod::Anonymous, CaptureMethod::ManualCookie]
    );
    assert!(attempts[1]
        .args
        .windows(2)
        .any(|pair| pair == ["--cookies", cookie.to_string_lossy().as_ref()]));
    assert!(attempts.iter().all(|attempt| !attempt
        .args
        .iter()
        .any(|arg| arg == "--cookies-from-browser")));
}

#[test]
fn final_error_does_not_contain_cookie_or_signed_url_details() {
    let dir = tempdir().unwrap();
    let fake = FakeExecutor::new(
        vec![
            failed(AttemptFailureCategory::AccessDenied),
            failed(AttemptFailureCategory::CookieUnavailable),
            failed(AttemptFailureCategory::BrowserUnavailable),
        ],
        dir.path().join("source.mp3"),
    );

    let error = capture_douyin_with(
        &fake,
        "yt-dlp.exe".as_ref(),
        "https://v.douyin.com/abc/",
        dir.path(),
        |_| {},
    )
    .unwrap_err();

    let displayed = format!("{} {}", error.message, error.recovery);
    assert_eq!(error.code, "download_failed");
    assert!(!displayed.contains("Cookie:"));
    assert!(!displayed.contains("https://"));
    assert!(!displayed.contains("signature="));
}
