use video_distiller_lib::domain::{
    AppError, Distillation, DownloadTelemetry, InputSource, KeyEvidence, SecretInput, TaskOptions,
    TaskProgress, TaskStage,
};

#[test]
fn serializes_file_input_and_labels_stage() {
    let source = InputSource::File {
        path: "C:\\clip.mp4".into(),
    };
    let json = serde_json::to_string(&source).unwrap();
    assert_eq!(json, r#"{"kind":"file","path":"C:\\clip.mp4"}"#);
    assert_eq!(TaskStage::Distilling.label(), "核心提炼");
}

#[test]
fn serializes_douyin_url_input() {
    let source = InputSource::DouyinUrl {
        url: "https://v.douyin.com/abc/".into(),
    };
    let json = serde_json::to_string(&source).unwrap();
    assert_eq!(
        json,
        r#"{"kind":"douyin_url","url":"https://v.douyin.com/abc/"}"#
    );
}

#[test]
fn serializes_bilibili_and_youtube_url_inputs() {
    let bilibili = InputSource::BilibiliUrl {
        url: "https://www.bilibili.com/video/BV1xx411c7mD".into(),
    };
    let youtube = InputSource::YoutubeUrl {
        url: "https://www.youtube.com/watch?v=abc123".into(),
    };

    assert_eq!(
        serde_json::to_string(&bilibili).unwrap(),
        r#"{"kind":"bilibili_url","url":"https://www.bilibili.com/video/BV1xx411c7mD"}"#
    );
    assert_eq!(
        serde_json::to_string(&youtube).unwrap(),
        r#"{"kind":"youtube_url","url":"https://www.youtube.com/watch?v=abc123"}"#
    );
}

#[test]
fn all_stages_have_labels() {
    for stage in &[
        TaskStage::Downloading,
        TaskStage::SubtitleFetching,
        TaskStage::PreparingAudio,
        TaskStage::Transcribing,
        TaskStage::Distilling,
        TaskStage::CapturingScreenshots,
        TaskStage::Saving,
        TaskStage::Complete,
    ] {
        let label = stage.label();
        assert!(!label.is_empty(), "Stage {:?} has empty label", stage);
    }
}

#[test]
fn serializes_new_task_stages_as_snake_case() {
    assert_eq!(
        serde_json::to_string(&TaskStage::SubtitleFetching).unwrap(),
        r#""subtitle_fetching""#
    );
    assert_eq!(
        serde_json::to_string(&TaskStage::CapturingScreenshots).unwrap(),
        r#""capturing_screenshots""#
    );
}

#[test]
fn task_progress_serializes_a_bounded_numeric_percentage() {
    let progress = TaskProgress {
        stage: TaskStage::Transcribing,
        message: "正在转写音频...".into(),
        percent: 52,
        download: None,
    };

    assert_eq!(
        serde_json::to_value(progress).unwrap(),
        serde_json::json!({
            "stage": "transcribing",
            "message": "正在转写音频...",
            "percent": 52
        })
    );
}

#[test]
fn task_progress_serializes_optional_download_telemetry_in_camel_case() {
    let progress = TaskProgress {
        stage: TaskStage::Downloading,
        message: "正在下载抖音视频".into(),
        percent: 15,
        download: Some(DownloadTelemetry {
            phase: "downloading".into(),
            percent: Some(37.5),
            downloaded_bytes: 31_457_280,
            total_bytes: Some(83_886_080),
            speed_bytes_per_second: Some(2_097_152),
            eta_seconds: Some(25),
        }),
    };

    assert_eq!(
        serde_json::to_value(progress).unwrap()["download"],
        serde_json::json!({
            "phase": "downloading",
            "percent": 37.5,
            "downloadedBytes": 31_457_280,
            "totalBytes": 83_886_080,
            "speedBytesPerSecond": 2_097_152,
            "etaSeconds": 25
        })
    );
}

#[test]
fn serializes_task_options_with_backward_compatible_defaults() {
    let options = TaskOptions::default();

    assert_eq!(options.note_template, "core_distillation");
    assert!(!options.include_screenshots);
    assert_eq!(options.note_style.as_str(), "minimal");
    assert_eq!(
        serde_json::to_string(&options).unwrap(),
        r#"{"note_template":"core_distillation","include_screenshots":false,"note_style":"minimal"}"#
    );
}

#[test]
fn distillation_serializes_structured_key_evidence() {
    let d = Distillation {
        core_conclusion: "这是一个重要发现".into(),
        key_evidence: vec![KeyEvidence {
            text: "证据一".into(),
            timestamp_seconds: Some(42.5),
            source_url: Some("https://www.bilibili.com/video/BV1xx411c7mD".into()),
            screenshot_path: Some("screenshots/evidence-42.png".into()),
        }],
        implications: vec!["采取行动".into()],
        transcript: None,
    };

    let json = serde_json::to_string(&d).unwrap();
    assert_eq!(
        json,
        r#"{"core_conclusion":"这是一个重要发现","key_evidence":[{"text":"证据一","timestamp_seconds":42.5,"source_url":"https://www.bilibili.com/video/BV1xx411c7mD","screenshot_path":"screenshots/evidence-42.png"}],"implications":["采取行动"]}"#
    );
    assert_eq!(serde_json::from_str::<Distillation>(&json).unwrap(), d);
}

#[test]
fn distillation_serialization_roundtrip() {
    let d = Distillation {
        core_conclusion: "这是一个重要发现".into(),
        key_evidence: vec![KeyEvidence {
            text: "证据一".into(),
            timestamp_seconds: None,
            source_url: None,
            screenshot_path: None,
        }],
        implications: vec!["采取行动".into()],
        transcript: Some("完整转写文本".into()),
    };
    let json = serde_json::to_string(&d).unwrap();
    let parsed: Distillation = serde_json::from_str(&json).unwrap();
    assert_eq!(d, parsed);
    // transcript should only be present when Some
    assert!(json.contains("transcript"));
}

#[test]
fn app_error_has_all_fields() {
    let err = AppError::new("download_failed", "下载失败", "请保存视频后拖入应用处理。");
    assert_eq!(err.code, "download_failed");
    assert_eq!(err.recovery, "请保存视频后拖入应用处理。");
    let json = serde_json::to_string(&err).unwrap();
    assert!(json.contains("download_failed"));
    assert!(json.contains("请保存视频后拖入应用处理。"));
}

#[test]
fn distillation_default_no_transcript() {
    let d = Distillation {
        core_conclusion: "测试".into(),
        key_evidence: vec![KeyEvidence {
            text: "证据".into(),
            timestamp_seconds: None,
            source_url: None,
            screenshot_path: None,
        }],
        implications: vec!["启示".into()],
        transcript: None,
    };
    let json = serde_json::to_string(&d).unwrap();
    assert!(
        !json.contains("transcript"),
        "None transcript should be absent or null: {}",
        json
    );
}

// =========================================================================
//  SecretInput wire-format tests  (Stage 03 Finding 2)
// =========================================================================

/// Frontend sends internally-tagged `type` with camelCase fields; Rust must
/// deserialize `{"type":"bearer","apiKey":"sk-..."}`.
#[test]
fn secret_input_deserializes_bearer_from_frontend_json() {
    let json = r#"{"type":"bearer","apiKey":"sk-test-key"}"#;
    let parsed: SecretInput = serde_json::from_str(json).unwrap();
    assert_eq!(
        parsed,
        SecretInput::Bearer {
            api_key: "sk-test-key".into()
        }
    );
}

/// Frontend sends internally-tagged `type` with camelCase fields for Tencent.
#[test]
fn secret_input_deserializes_tencent_from_frontend_json() {
    let json =
        r#"{"type":"tencent","appId":"1259220000","secretId":"AKIDabc","secretKey":"xyz123"}"#;
    let parsed: SecretInput = serde_json::from_str(json).unwrap();
    assert_eq!(
        parsed,
        SecretInput::Tencent {
            app_id: "1259220000".into(),
            secret_id: "AKIDabc".into(),
            secret_key: "xyz123".into(),
        }
    );
}

/// Rust enum internally uses snake_case fields while wire uses camelCase.
/// The serde tag + rename_all handles the translation.
#[test]
fn secret_input_deserializes_bearer_into_secret_payload() {
    let json = r#"{"type":"bearer","apiKey":"sk-prod-key"}"#;
    let parsed: SecretInput = serde_json::from_str(json).unwrap();
    let payload = parsed.into_secret_payload().unwrap();
    assert_eq!(
        payload,
        video_distiller_lib::credential_store::SecretPayload::Bearer {
            api_key: "sk-prod-key".into(),
        }
    );
}

/// Frontend JSON → SecretInput → SecretPayload round-trip for Tencent.
#[test]
fn secret_input_deserializes_tencent_into_secret_payload() {
    let json =
        r#"{"type":"tencent","appId":"1259220000","secretId":"AKIDabc","secretKey":"xyz123"}"#;
    let parsed: SecretInput = serde_json::from_str(json).unwrap();
    let payload = parsed.into_secret_payload().unwrap();
    let expected = video_distiller_lib::credential_store::SecretPayload::Tencent {
        app_id: "1259220000".into(),
        secret_id: "AKIDabc".into(),
        secret_key: "xyz123".into(),
    };
    assert_eq!(payload, expected);
}

/// The old externally-tagged snake_case format must not deserialize (proving
/// we actually changed the wire format).
#[test]
fn secret_input_rejects_old_externally_tagged_format() {
    let json = r#"{"bearer":{"api_key":"sk-old"}}"#;
    let result: Result<SecretInput, _> = serde_json::from_str(json);
    assert!(
        result.is_err(),
        "Old externally-tagged format should be rejected"
    );
}

/// Empty fields are caught by into_secret_payload, not by serde.
#[test]
fn secret_input_empty_api_key_rejected_by_into() {
    let input = SecretInput::Bearer { api_key: "".into() };
    let result = input.into_secret_payload();
    assert!(result.is_err());
    assert_eq!(result.unwrap_err().code, "invalid_credential");
}
