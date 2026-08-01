use std::collections::VecDeque;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tempfile::tempdir;
use video_distiller_lib::services::download::{
    build_capture_attempts, build_platform_capture_attempts, capture_douyin_with,
    classify_platform_url, download_platform, parse_yt_dlp_progress_line, validate_douyin_url,
    AttemptFailureCategory, AttemptOutcome, CaptureAttempt, CaptureMethod, CapturePurpose,
    DownloadExecutor, DownloadProgress, ProcessDownloadExecutor, VideoPlatform,
};

#[tokio::test]
async fn platform_download_is_safe_inside_an_existing_tokio_runtime() {
    let dir = tempdir().unwrap();

    let error = download_platform(
        "https://www.douyin.com/video/123",
        dir.path(),
        None,
        None,
        &|| true,
        |_| {},
    )
    .await
    .unwrap_err();

    assert_eq!(error.code, "cancelled");
}

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
    fn execute(
        &self,
        _executable: &Path,
        attempt: &CaptureAttempt,
        _cancelled: &dyn Fn() -> bool,
        _progress: &mut dyn FnMut(DownloadProgress),
    ) -> AttemptOutcome {
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

    assert_eq!(error.code, "download_access_denied");
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
    assert!(attempts
        .iter()
        .all(|attempt| attempt.args.iter().any(|x| x == "--newline")));
    assert!(attempts
        .iter()
        .all(|attempt| !attempt.args.iter().any(|x| x == "--no-progress")));
}

#[test]
fn parses_machine_readable_yt_dlp_progress_without_localized_text() {
    let update = parse_yt_dlp_progress_line(
        "vedionotes-progress:37.5|31457280|83886080|2097152|25",
    )
    .expect("machine progress line should parse");

    assert_eq!(update.percent, Some(37.5));
    assert_eq!(update.downloaded_bytes, 31_457_280);
    assert_eq!(update.total_bytes, Some(83_886_080));
    assert_eq!(update.speed_bytes_per_second, Some(2_097_152));
    assert_eq!(update.eta_seconds, Some(25));
}

#[test]
fn parses_yt_dlp_progress_with_unknown_totals() {
    let update = parse_yt_dlp_progress_line("vedionotes-progress:NA|1024|NA|NA|NA")
        .expect("unknown optional fields should remain parseable");

    assert_eq!(update.percent, None);
    assert_eq!(update.downloaded_bytes, 1024);
    assert_eq!(update.total_bytes, None);
    assert_eq!(update.speed_bytes_per_second, None);
    assert_eq!(update.eta_seconds, None);
}

#[cfg(windows)]
#[test]
fn process_executor_consumes_stdout_and_stderr_progress_while_process_is_running() {
    let attempt = CaptureAttempt {
        method: CaptureMethod::Anonymous,
        args: vec![
            "-NoProfile".into(),
            "-Command".into(),
            concat!(
                "[Console]::Out.WriteLine('vedionotes-progress:10|10|100|5|18');",
                "[Console]::Error.WriteLine('vedionotes-progress:20|20|100|5|16');",
                "Start-Sleep -Seconds 2"
            )
            .into(),
        ],
    };
    let started = Instant::now();
    let mut updates = Vec::new();
    let outcome = ProcessDownloadExecutor.execute(
        Path::new("powershell.exe"),
        &attempt,
        &|| false,
        &mut |progress| updates.push((started.elapsed(), progress.downloaded_bytes)),
    );

    assert!(outcome.success);
    assert_eq!(
        updates.iter().map(|(_, bytes)| *bytes).collect::<Vec<_>>(),
        vec![10, 20]
    );
    assert!(updates[0].0 < Duration::from_millis(1_500));
}

#[cfg(windows)]
#[test]
fn process_executor_stops_the_sidecar_when_download_is_cancelled() {
    let attempt = CaptureAttempt {
        method: CaptureMethod::Anonymous,
        args: vec![
            "-NoProfile".into(),
            "-Command".into(),
            "Start-Sleep -Seconds 10".into(),
        ],
    };
    let cancelled = AtomicBool::new(true);
    let started = Instant::now();
    let outcome = ProcessDownloadExecutor.execute(
        Path::new("powershell.exe"),
        &attempt,
        &|| cancelled.load(Ordering::SeqCst),
        &mut |_| {},
    );

    assert_eq!(outcome.category, AttemptFailureCategory::Cancelled);
    assert!(started.elapsed() < Duration::from_secs(2));
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
    assert_eq!(error.code, "download_access_denied");
    assert!(!displayed.contains("Cookie:"));
    assert!(!displayed.contains("https://"));
    assert!(!displayed.contains("signature="));
}

#[test]
fn missing_sidecar_and_timeout_return_actionable_error_codes() {
    for (category, expected_code) in [
        (AttemptFailureCategory::ToolMissing, "download_tool_missing"),
        (AttemptFailureCategory::Timeout, "download_timeout"),
    ] {
        let dir = tempdir().unwrap();
        let fake = FakeExecutor::new(vec![failed(category)], dir.path().join("source.mp3"));
        let error = capture_douyin_with(
            &fake,
            "yt-dlp.exe".as_ref(),
            "https://v.douyin.com/abc/",
            dir.path(),
            |_| {},
        )
        .unwrap_err();

        assert_eq!(error.code, expected_code);
    }
}
