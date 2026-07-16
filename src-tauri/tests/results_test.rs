use tempfile::tempdir;
use video_distiller_lib::domain::{Distillation, KeyEvidence, NoteStyle, TaskOptions};
use video_distiller_lib::services::results::{copy_markdown_file, render_markdown, save_markdown};

fn sample_distillation() -> Distillation {
    Distillation {
        core_conclusion: "短视频平台算法推荐机制的核心是用户兴趣匹配。".into(),
        key_evidence: vec![
            KeyEvidence {
                text: "平台通过用户行为数据构建兴趣画像。".into(),
                timestamp_seconds: None,
                source_url: None,
                screenshot_path: None,
            },
            KeyEvidence {
                text: "推荐系统采用多目标优化模型。".into(),
                timestamp_seconds: None,
                source_url: None,
                screenshot_path: None,
            },
        ],
        implications: vec!["创作者应注重内容标签的准确性。".into()],
        transcript: None,
    }
}

#[test]
fn render_markdown_contains_required_sections() {
    let text = render_markdown(
        "local.mp4",
        "2026-07-11T10:00:00Z",
        &sample_distillation(),
        &TaskOptions::default(),
    );
    assert!(
        text.contains("## 核心结论"),
        "Markdown should contain 核心结论 section"
    );
    assert!(
        text.contains("## 关键依据"),
        "Markdown should contain 关键依据 section"
    );
    assert!(
        text.contains("## 启示/行动"),
        "Markdown should contain 启示/行动 section"
    );
}

#[test]
fn render_markdown_includes_source_and_timestamp() {
    let text = render_markdown(
        "local.mp4",
        "2026-07-11T10:00:00Z",
        &sample_distillation(),
        &TaskOptions::default(),
    );
    assert!(text.contains("local.mp4"), "Should contain source filename");
    assert!(
        text.contains("2026-07-11"),
        "Should contain processing date"
    );
}

#[test]
fn render_markdown_links_bilibili_and_youtube_evidence_but_not_douyin() {
    let mut d = sample_distillation();
    d.key_evidence = vec![
        KeyEvidence {
            text: "Bilibili evidence".into(),
            timestamp_seconds: Some(62.5),
            source_url: Some("https://www.bilibili.com/video/BV1x".into()),
            screenshot_path: None,
        },
        KeyEvidence {
            text: "Youtube evidence".into(),
            timestamp_seconds: Some(3.0),
            source_url: Some("https://www.youtube.com/watch?v=abc".into()),
            screenshot_path: None,
        },
        KeyEvidence {
            text: "Douyin evidence".into(),
            timestamp_seconds: Some(4.0),
            source_url: Some("https://www.douyin.com/video/1".into()),
            screenshot_path: None,
        },
    ];
    let text = render_markdown(
        "source",
        "2026-07-11T10:00:00Z",
        &d,
        &TaskOptions::default(),
    );
    assert!(text.contains("[01:02](https://www.bilibili.com/video/BV1x?t=62)"));
    assert!(text.contains("[00:03](https://www.youtube.com/watch?v=abc&t=3s)"));
    assert!(text.contains("Douyin evidence [00:04]"));
    assert!(!text.contains("douyin.com/video/1?t="));
}

#[test]
fn render_markdown_never_links_lookalike_video_hosts() {
    let mut d = sample_distillation();
    d.key_evidence = vec![
        KeyEvidence {
            text: "Not Bilibili".into(),
            timestamp_seconds: Some(2.0),
            source_url: Some("https://bilibili.com.evil.example/video/BV1x".into()),
            screenshot_path: None,
        },
        KeyEvidence {
            text: "Not YouTube".into(),
            timestamp_seconds: Some(3.0),
            source_url: Some("https://youtube.com.evil.example/watch?v=abc".into()),
            screenshot_path: None,
        },
    ];
    let text = render_markdown(
        "source",
        "2026-07-11T10:00:00Z",
        &d,
        &TaskOptions::default(),
    );
    assert!(text.contains("Not Bilibili [00:02]"));
    assert!(text.contains("Not YouTube [00:03]"));
    assert!(!text.contains("evil.example/video/BV1x?t="));
    assert!(!text.contains("evil.example/watch?v=abc&t="));
}

#[test]
fn render_markdown_no_credentials() {
    let text = render_markdown(
        "local.mp4",
        "2026-07-11T10:00:00Z",
        &sample_distillation(),
        &TaskOptions::default(),
    );
    assert!(!text.contains("sk-"), "Should not contain API key patterns");
}

#[test]
fn render_markdown_with_transcript() {
    let mut d = sample_distillation();
    d.transcript = Some("这是完整的转写文本内容。".into());
    let text = render_markdown(
        "video.mp4",
        "2026-07-11T10:00:00Z",
        &d,
        &TaskOptions::default(),
    );
    assert!(
        text.contains("完整转写"),
        "Should mention transcript section"
    );
    assert!(
        text.contains("这是完整的转写文本内容。"),
        "Should include transcript content"
    );
}

#[test]
fn file_stem_is_safe() {
    let text = render_markdown(
        " 奇怪的/视频:名称*.mp4",
        "2026-07-11T10:00:00Z",
        &sample_distillation(),
        &TaskOptions::default(),
    );
    // Should handle weird characters in filename without crashing
    assert!(text.contains("## 核心结论"));
}

#[test]
fn saved_markdown_records_default_task_template_metadata() {
    let temp = tempdir().unwrap();

    let path = save_markdown(
        "video.mp4",
        "2026-07-11T10:00:00Z",
        &sample_distillation(),
        temp.path(),
        &TaskOptions::default(),
    )
    .unwrap();

    assert!(std::fs::read_to_string(path)
        .unwrap()
        .starts_with("---\ntemplate: core_distillation\nstyle: minimal\n---\n"));
}

#[test]
fn saved_markdown_records_explicit_task_template_metadata() {
    let temp = tempdir().unwrap();
    let options = TaskOptions {
        note_template: "meeting_notes".into(),
        include_screenshots: true,
        note_style: NoteStyle::MeetingMinutes,
        ..TaskOptions::default()
    };

    let path = save_markdown(
        "video.mp4",
        "2026-07-11T10:00:00Z",
        &sample_distillation(),
        temp.path(),
        &options,
    )
    .unwrap();

    assert!(std::fs::read_to_string(path)
        .unwrap()
        .starts_with("---\ntemplate: meeting_notes\nstyle: meeting_minutes\n---\n"));
}

#[test]
fn copy_markdown_file_preserves_exact_bytes() {
    let temp = tempdir().unwrap();
    let source = temp.path().join("source.md");
    let destination = temp.path().join("nested").join("copy.md");
    let bytes = b"# title\r\n\r\nraw markdown bytes\n";
    std::fs::write(&source, bytes).unwrap();
    std::fs::create_dir_all(destination.parent().unwrap()).unwrap();
    std::fs::write(&destination, b"old bytes").unwrap();

    let copied = copy_markdown_file(&source, &destination).unwrap();

    assert_eq!(copied, destination);
    assert_eq!(std::fs::read(destination).unwrap(), bytes);
}

#[test]
fn copy_markdown_file_rejects_non_markdown_source() {
    let temp = tempdir().unwrap();
    let source = temp.path().join("source.txt");
    let destination = temp.path().join("copy.md");
    std::fs::write(&source, b"text").unwrap();

    let error = copy_markdown_file(&source, &destination).unwrap_err();

    assert_eq!(error.code, "invalid_markdown_path");
}

#[test]
fn copy_markdown_file_rejects_non_markdown_destination() {
    let temp = tempdir().unwrap();
    let source = temp.path().join("source.md");
    let destination = temp.path().join("copy.txt");
    std::fs::write(&source, b"markdown").unwrap();

    let error = copy_markdown_file(&source, &destination).unwrap_err();

    assert_eq!(error.code, "invalid_markdown_path");
}
