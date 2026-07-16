use tempfile::tempdir;
use video_distiller_lib::domain::{InputSource, NoteStyle, TaskOptions};
use video_distiller_lib::task_store::{TaskRecordInput, TaskState, TaskStore};

#[test]
fn records_failed_tasks_and_returns_only_a_typed_retry_snapshot() {
    let temp = tempdir().unwrap();
    let store = TaskStore::open(temp.path().join("history.sqlite")).unwrap();
    let mut input = TaskRecordInput::running("task-1");
    input.title = "线性代数课程".into();
    input.source = InputSource::BilibiliUrl {
        url: "https://www.bilibili.com/video/BV1safe".into(),
    };
    input.source_label = "Bilibili 公开链接".into();
    input.transcription_profile_id = "local-whisper".into();
    input.transcription_profile_name = "本地 Whisper".into();
    input.transcription_model = "small".into();
    input.summary_profile_id = "deepseek-main".into();
    input.summary_profile_name = "DeepSeek".into();
    input.summary_model = "deepseek-chat".into();
    input.compute = "cuda".into();
    input.options = TaskOptions {
        note_template: "core_distillation".into(),
        include_screenshots: true,
        note_style: NoteStyle::Academic,
        ..TaskOptions::default()
    };

    let id = store.insert_task(&input).unwrap();
    store
        .finish_task(
            id,
            TaskState::Failed,
            Some("local_whisper_output_unreadable"),
            None,
        )
        .unwrap();

    let record = &store.list_tasks("线性代数").unwrap()[0];
    assert_eq!(record.state, TaskState::Failed);
    assert_eq!(record.error_code.as_deref(), Some("local_whisper_output_unreadable"));
    assert!(record.finished_at.is_some());
    assert!(record.duration_ms.is_some());
    assert_eq!(record.diagnostic_log_id.as_deref(), Some("app-diagnostics"));

    let retry = store.retry_request(id).unwrap();
    assert_eq!(retry.source, input.source);
    assert_eq!(retry.options, input.options);
    assert_eq!(retry.transcription_profile_id, "local-whisper");
    assert_eq!(retry.summary_profile_id, "deepseek-main");
}

#[test]
fn task_schema_is_idempotent_and_terminal_state_updates_do_not_store_messages_or_paths() {
    let temp = tempdir().unwrap();
    let database = temp.path().join("history.sqlite");
    let store = TaskStore::open(database.clone()).unwrap();
    let id = store
        .insert_task(&TaskRecordInput::running("task-cancelled"))
        .unwrap();
    store
        .finish_task(id, TaskState::Cancelled, Some("cancelled"), None)
        .unwrap();
    drop(store);

    let reopened = TaskStore::open(database).unwrap();
    let record = reopened.get_task(id).unwrap().unwrap();
    assert_eq!(record.state, TaskState::Cancelled);
    assert_eq!(record.error_code.as_deref(), Some("cancelled"));
    assert!(!record.error_code.as_deref().unwrap().contains('\\'));
    assert!(!record.error_code.as_deref().unwrap().contains('/'));
}
