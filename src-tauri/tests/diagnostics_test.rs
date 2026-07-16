use video_distiller_lib::diagnostics::{
    DiagnosticEventKind, DiagnosticLevel, DiagnosticLogger, DiagnosticRecord,
};
use video_distiller_lib::domain::TaskStage;

#[test]
fn diagnostics_write_only_structured_sanitized_fields() {
    let root = tempfile::tempdir().unwrap();
    let logger = DiagnosticLogger::with_max_bytes(root.path(), 1024).unwrap();
    logger
        .record(DiagnosticRecord {
            level: DiagnosticLevel::Info,
            event: DiagnosticEventKind::StageChanged,
            task_id: Some("task-123".into()),
            stage: Some(TaskStage::Transcribing),
            percent: Some(52),
            elapsed_ms: Some(4200),
            exit_code: None,
            output_exists: Some(true),
            output_bytes: Some(128),
        })
        .unwrap();

    let text = std::fs::read_to_string(logger.path()).unwrap();
    assert!(text.contains("stage_changed"));
    assert!(text.contains("transcribing"));
    assert!(text.contains("\"percent\":52"));
    for prohibited in ["https://", "Cookie", "Authorization", "transcript", "summary"] {
        assert!(!text.contains(prohibited));
    }
}

#[test]
fn compute_fallback_is_a_whitelisted_sanitized_event() {
    let root = tempfile::tempdir().unwrap();
    let logger = DiagnosticLogger::with_max_bytes(root.path(), 1024).unwrap();
    logger
        .record(DiagnosticRecord {
            level: DiagnosticLevel::Warning,
            event: DiagnosticEventKind::LocalComputeFallback,
            task_id: Some("task-cuda-fallback".into()),
            stage: Some(TaskStage::Transcribing),
            percent: Some(35),
            elapsed_ms: None,
            exit_code: None,
            output_exists: None,
            output_bytes: None,
        })
        .unwrap();

    let text = std::fs::read_to_string(logger.path()).unwrap();
    assert!(text.contains("local_compute_fallback"));
    for prohibited in ["https://", "Cookie", "Authorization", "transcript", "summary"] {
        assert!(!text.contains(prohibited));
    }
}

#[test]
fn diagnostics_reject_unsafe_task_identifiers() {
    let root = tempfile::tempdir().unwrap();
    let logger = DiagnosticLogger::with_max_bytes(root.path(), 1024).unwrap();
    let result = logger.record(DiagnosticRecord {
        level: DiagnosticLevel::Error,
        event: DiagnosticEventKind::TaskFailed,
        task_id: Some("https://example.test/?cookie=secret".into()),
        stage: None,
        percent: None,
        elapsed_ms: None,
        exit_code: None,
        output_exists: None,
        output_bytes: None,
    });

    assert!(result.is_err());
}

#[test]
fn diagnostics_rotate_before_the_size_limit_is_exceeded() {
    let root = tempfile::tempdir().unwrap();
    let logger = DiagnosticLogger::with_max_bytes(root.path(), 180).unwrap();
    for index in 0..6 {
        logger
            .record(DiagnosticRecord {
                level: DiagnosticLevel::Info,
                event: DiagnosticEventKind::StageChanged,
                task_id: Some(format!("task-{index}")),
                stage: Some(TaskStage::Downloading),
                percent: Some(10),
                elapsed_ms: Some(index),
                exit_code: None,
                output_exists: None,
                output_bytes: None,
            })
            .unwrap();
    }

    assert!(logger.path().exists());
    assert!(logger.rotated_path().exists());
}
