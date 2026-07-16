use std::path::{Path, PathBuf};

use tempfile::tempdir;
use video_distiller_lib::commands::persist_completed_history;
use video_distiller_lib::domain::{Distillation, KeyEvidence, NoteStyle, TaskOptions};
use video_distiller_lib::domain::{DistillationResult, InputSource};
use video_distiller_lib::history_store::{
    capture_evidence_with, capture_selected_screenshots, HistoryEntryInput, HistoryStore,
    LibraryQuery, LibrarySort, NoteChatTurn, ScreenshotCapturer,
};

fn entry(markdown: PathBuf, transcript: PathBuf, thumbnail: PathBuf) -> HistoryEntryInput {
    HistoryEntryInput {
        title: "Linear equations".into(),
        source: "https://www.youtube.com/watch?v=linear".into(),
        note_template: "core_distillation".into(),
        note_style: NoteStyle::Minimal,
        created_at: "2026-07-13T10:00:00Z".into(),
        markdown_path: markdown,
        transcript_path: transcript,
        thumbnail_path: Some(thumbnail),
        screenshot_paths: Vec::new(),
    }
}

#[test]
fn deleting_a_note_cascades_its_conversation_before_a_reused_row_id_can_be_read() {
    let temp = tempdir().unwrap();
    let store = HistoryStore::open(temp.path().join("history.sqlite")).unwrap();
    let markdown = temp.path().join("first.md");
    let transcript = temp.path().join("first.txt");
    let thumbnail = temp.path().join("first.jpg");
    for path in [&markdown, &transcript, &thumbnail] {
        std::fs::write(path, "first").unwrap();
    }
    let first = store
        .create(&entry(markdown, transcript, thumbnail))
        .unwrap();
    store
        .append_conversation(
            first,
            &[
                NoteChatTurn::user("old question"),
                NoteChatTurn::assistant("old answer"),
            ],
        )
        .unwrap();

    store.delete(first).unwrap();

    let markdown = temp.path().join("second.md");
    let transcript = temp.path().join("second.txt");
    let thumbnail = temp.path().join("second.jpg");
    for path in [&markdown, &transcript, &thumbnail] {
        std::fs::write(path, "second").unwrap();
    }
    let reused = store
        .create(&entry(markdown, transcript, thumbnail))
        .unwrap();
    assert_eq!(
        reused, first,
        "SQLite may reuse a deleted INTEGER PRIMARY KEY rowid"
    );
    assert!(store.list_conversation(reused).unwrap().is_empty());
}

#[test]
fn creates_and_searches_note_and_transcript_from_a_temporary_database() {
    let temp = tempdir().unwrap();
    let markdown = temp.path().join("note.md");
    let transcript = temp.path().join("transcript.txt");
    let thumbnail = temp.path().join("thumbnail.jpg");
    std::fs::write(&markdown, "# Linear equations\nGaussian elimination").unwrap();
    std::fs::write(&transcript, "The pivot operation solves the system.").unwrap();
    std::fs::write(&thumbnail, "thumbnail").unwrap();
    let store = HistoryStore::open(temp.path().join("history.sqlite")).unwrap();

    let id = store
        .create(&entry(markdown, transcript, thumbnail))
        .unwrap();

    assert_eq!(store.list().unwrap().len(), 1);
    assert_eq!(store.search("pivot").unwrap()[0].id, id);
    assert_eq!(store.get(id).unwrap().unwrap().title, "Linear equations");
    assert_eq!(store.get(id).unwrap().unwrap().note_style, NoteStyle::Minimal);
}

#[test]
fn library_metadata_migrates_idempotently_and_combines_text_favorite_and_tag_filters() {
    let temp = tempdir().unwrap();
    let database = temp.path().join("history.sqlite");
    let markdown = temp.path().join("library.md");
    let transcript = temp.path().join("library.txt");
    let thumbnail = temp.path().join("library.jpg");
    std::fs::write(&markdown, "# Gaussian elimination\n矩阵消元与主元选择").unwrap();
    std::fs::write(&transcript, "The pivot operation solves the linear system.").unwrap();
    std::fs::write(&thumbnail, "thumbnail").unwrap();

    let store = HistoryStore::open(database.clone()).unwrap();
    let id = store.create(&entry(markdown, transcript, thumbnail)).unwrap();
    store.set_favorite(id, true).unwrap();
    store
        .set_tags(id, &[" 数理课程 ".into(), "线性代数".into(), "数理课程".into()])
        .unwrap();
    store.mark_opened(id).unwrap();

    let snapshot = store
        .search_library(&LibraryQuery {
            text: "pivot".into(),
            favorite: Some(true),
            tag: Some("数理课程".into()),
            sort: LibrarySort::RecentlyOpened,
            limit: 20,
            offset: 0,
        })
        .unwrap();
    assert_eq!(snapshot.total, 1);
    assert_eq!(snapshot.entries[0].id, id);
    assert!(snapshot.entries[0].favorite);
    assert_eq!(snapshot.entries[0].tags, vec!["数理课程", "线性代数"]);
    assert!(snapshot.entries[0].last_opened_at.is_some());
    assert_eq!(snapshot.tags.iter().find(|tag| tag.name == "数理课程").unwrap().note_count, 1);

    drop(store);
    let reopened = HistoryStore::open(database).unwrap();
    let entry = reopened.library_entry(id).unwrap().unwrap();
    assert!(entry.favorite);
    assert_eq!(entry.tags, vec!["数理课程", "线性代数"]);
}

#[test]
fn note_style_round_trips_and_legacy_databases_migrate_idempotently() {
    let temp = tempdir().unwrap();
    let database = temp.path().join("history.sqlite");
    let markdown = temp.path().join("legacy.md");
    let transcript = temp.path().join("legacy.txt");
    std::fs::write(&markdown, "# Legacy").unwrap();
    std::fs::write(&transcript, "Legacy transcript").unwrap();
    let connection = rusqlite::Connection::open(&database).unwrap();
    connection
        .execute_batch(
            "CREATE TABLE history_entries (
                id INTEGER PRIMARY KEY,
                title TEXT NOT NULL, source TEXT NOT NULL, note_template TEXT NOT NULL,
                created_at TEXT NOT NULL, markdown_path TEXT NOT NULL, transcript_path TEXT NOT NULL,
                thumbnail_path TEXT
            );",
        )
        .unwrap();
    connection
        .execute(
            "INSERT INTO history_entries (title, source, note_template, created_at, markdown_path, transcript_path, thumbnail_path) VALUES (?1, ?2, ?3, ?4, ?5, ?6, NULL)",
            rusqlite::params!["Legacy", "local.mp4", "core_distillation", "2026-07-14T00:00:00Z", markdown.to_string_lossy(), transcript.to_string_lossy()],
        )
        .unwrap();
    drop(connection);

    let store = HistoryStore::open(database.clone()).unwrap();
    assert_eq!(store.get(1).unwrap().unwrap().note_style, NoteStyle::Minimal);
    drop(store);
    let store = HistoryStore::open(database).unwrap();
    assert_eq!(store.get(1).unwrap().unwrap().note_style, NoteStyle::Minimal);

    let custom_markdown = temp.path().join("academic.md");
    let custom_transcript = temp.path().join("academic.txt");
    let custom_thumbnail = temp.path().join("academic.jpg");
    for path in [&custom_markdown, &custom_transcript, &custom_thumbnail] {
        std::fs::write(path, "custom").unwrap();
    }
    let mut custom = entry(custom_markdown, custom_transcript, custom_thumbnail);
    custom.note_style = NoteStyle::Academic;
    let id = store.create(&custom).unwrap();
    assert_eq!(store.get(id).unwrap().unwrap().note_style, NoteStyle::Academic);
}

#[test]
fn reads_markdown_only_from_the_owned_history_copy() {
    let temp = tempdir().unwrap();
    let markdown = temp.path().join("note.md");
    let transcript = temp.path().join("transcript.txt");
    let thumbnail = temp.path().join("thumbnail.jpg");
    std::fs::write(&markdown, "# Owned note\n\nSafe content").unwrap();
    std::fs::write(&transcript, "transcript").unwrap();
    std::fs::write(&thumbnail, "thumbnail").unwrap();
    let store = HistoryStore::open(temp.path().join("history.sqlite")).unwrap();
    let id = store
        .create(&entry(markdown.clone(), transcript, thumbnail))
        .unwrap();

    std::fs::write(&markdown, "# User file changed").unwrap();

    assert_eq!(
        store.read_markdown(id).unwrap(),
        "# Owned note\n\nSafe content"
    );
}

#[test]
fn markdown_read_rejects_missing_and_non_owned_history_assets() {
    let temp = tempdir().unwrap();
    let markdown = temp.path().join("note.md");
    let transcript = temp.path().join("transcript.txt");
    let thumbnail = temp.path().join("thumbnail.jpg");
    for path in [&markdown, &transcript, &thumbnail] {
        std::fs::write(path, "content").unwrap();
    }
    let database = temp.path().join("history.sqlite");
    let store = HistoryStore::open(database.clone()).unwrap();
    let id = store
        .create(&entry(markdown.clone(), transcript, thumbnail))
        .unwrap();

    let owned = store.get(id).unwrap().unwrap().markdown_path;
    std::fs::remove_file(&owned).unwrap();
    assert_eq!(store.read_markdown(id).unwrap_err().code, "history_asset_missing");

    rusqlite::Connection::open(&database)
        .unwrap()
        .execute(
            "UPDATE history_entries SET markdown_path = ?1 WHERE id = ?2",
            rusqlite::params![markdown.to_string_lossy(), id],
        )
        .unwrap();
    assert_eq!(
        store.read_markdown(id).unwrap_err().code,
        "invalid_history_asset"
    );
    assert_eq!(
        store.read_markdown(i64::MAX).unwrap_err().code,
        "history_missing"
    );
}

#[test]
fn deleting_history_removes_only_owned_note_assets_never_source_media() {
    let temp = tempdir().unwrap();
    let assets = temp.path().join("assets");
    std::fs::create_dir_all(&assets).unwrap();
    let markdown = assets.join("note.md");
    let transcript = assets.join("transcript.txt");
    let thumbnail = assets.join("thumbnail.jpg");
    let screenshot = assets.join("frame.jpg");
    let source_media = temp.path().join("source.mp4");
    for path in [
        &markdown,
        &transcript,
        &thumbnail,
        &screenshot,
        &source_media,
    ] {
        std::fs::write(path, "asset").unwrap();
    }
    let store = HistoryStore::open(temp.path().join("history.sqlite")).unwrap();
    let mut input = entry(markdown.clone(), transcript.clone(), thumbnail.clone());
    input.screenshot_paths.push(screenshot.clone());
    let id = store.create(&input).unwrap();

    store.delete(id).unwrap();

    assert!(
        markdown.exists(),
        "history copies user-owned Markdown before indexing it"
    );
    assert!(transcript.exists());
    assert!(thumbnail.exists());
    assert!(screenshot.exists());
    assert!(
        source_media.exists(),
        "source media is never a history asset"
    );
    assert!(store.get(id).unwrap().is_none());
}

#[test]
fn deletion_refuses_corrupted_paths_outside_the_canonical_history_assets_root() {
    let temp = tempdir().unwrap();
    let markdown = temp.path().join("user-note.md");
    let transcript = temp.path().join("user-transcript.txt");
    let image = temp.path().join("user-image.jpg");
    for path in [&markdown, &transcript, &image] {
        std::fs::write(path, "user asset").unwrap();
    }
    let db = temp.path().join("history.sqlite");
    let store = HistoryStore::open(db.clone()).unwrap();
    let id = store
        .create(&entry(markdown.clone(), transcript.clone(), image.clone()))
        .unwrap();
    let copied = store.get(id).unwrap().unwrap();
    rusqlite::Connection::open(&db)
        .unwrap()
        .execute(
            "UPDATE history_entries SET markdown_path = ?1, thumbnail_path = ?2 WHERE id = ?3",
            rusqlite::params![markdown.to_string_lossy(), image.to_string_lossy(), id],
        )
        .unwrap();

    store.delete(id).unwrap();

    assert!(markdown.exists());
    assert!(image.exists());
    assert!(
        !copied.transcript_path.exists(),
        "owned copied assets are still cleaned up"
    );
}

struct FakeCapturer {
    requested: std::sync::Mutex<Vec<f64>>,
    fail_at: Option<f64>,
}

#[test]
fn evidence_capture_uses_option_only_after_media_is_available_and_attaches_owned_paths() {
    let temp = tempdir().unwrap();
    let source = temp.path().join("source.mp4");
    std::fs::write(&source, "media").unwrap();
    let capturer = FakeCapturer {
        requested: Default::default(),
        fail_at: None,
    };
    let mut distillation = Distillation {
        core_conclusion: "done".into(),
        key_evidence: vec![
            KeyEvidence {
                text: "timed".into(),
                timestamp_seconds: Some(12.0),
                source_url: None,
                screenshot_path: None,
            },
            KeyEvidence {
                text: "untimed".into(),
                timestamp_seconds: None,
                source_url: None,
                screenshot_path: None,
            },
        ],
        implications: vec![],
        transcript: Some("text".into()),
    };

    let skipped = capture_evidence_with(
        &capturer,
        &TaskOptions::default(),
        Some(&source),
        &mut distillation,
        temp.path(),
    )
    .unwrap();
    assert!(skipped.is_empty());
    assert!(capturer.requested.lock().unwrap().is_empty());

    let enabled = TaskOptions {
        note_template: "core_distillation".into(),
        include_screenshots: true,
        note_style: NoteStyle::Minimal,
        ..TaskOptions::default()
    };
    let warnings = capture_evidence_with(
        &capturer,
        &enabled,
        Some(&source),
        &mut distillation,
        temp.path(),
    )
    .unwrap();
    assert!(warnings.is_empty());
    assert_eq!(*capturer.requested.lock().unwrap(), vec![12.0]);
    assert!(distillation.key_evidence[0]
        .screenshot_path
        .as_ref()
        .is_some_and(|path| Path::new(path).is_file()));
    assert!(distillation.key_evidence[1].screenshot_path.is_none());
}

#[test]
fn screenshot_capture_does_not_invoke_a_capturer_when_the_local_media_file_is_missing() {
    let temp = tempdir().unwrap();
    let capturer = FakeCapturer {
        requested: Default::default(),
        fail_at: None,
    };
    let mut distillation = Distillation {
        core_conclusion: "done".into(),
        key_evidence: vec![KeyEvidence {
            text: "timed".into(),
            timestamp_seconds: Some(12.0),
            source_url: None,
            screenshot_path: None,
        }],
        implications: vec![],
        transcript: None,
    };
    let enabled = TaskOptions {
        note_template: "core_distillation".into(),
        include_screenshots: true,
        note_style: NoteStyle::Minimal,
        ..TaskOptions::default()
    };

    let warnings = capture_evidence_with(
        &capturer,
        &enabled,
        Some(&temp.path().join("missing.mp4")),
        &mut distillation,
        temp.path(),
    )
    .unwrap();

    assert!(warnings.is_empty());
    assert!(capturer.requested.lock().unwrap().is_empty());
}

#[test]
fn unusable_screenshot_directory_is_a_redacted_non_fatal_failure_that_keeps_history_usable() {
    let temp = tempdir().unwrap();
    let source = temp.path().join("source.mp4");
    let blocked_output = temp.path().join("not-a-directory");
    std::fs::write(&source, "media").unwrap();
    std::fs::write(&blocked_output, "occupied").unwrap();
    let capturer = FakeCapturer {
        requested: Default::default(),
        fail_at: None,
    };
    let mut distillation = Distillation {
        core_conclusion: "done".into(),
        key_evidence: vec![KeyEvidence {
            text: "timed".into(),
            timestamp_seconds: Some(12.0),
            source_url: None,
            screenshot_path: None,
        }],
        implications: vec![],
        transcript: Some("usable transcript".into()),
    };
    let enabled = TaskOptions {
        note_template: "core_distillation".into(),
        include_screenshots: true,
        note_style: NoteStyle::Minimal,
        ..TaskOptions::default()
    };

    let warnings = capture_evidence_with(
        &capturer,
        &enabled,
        Some(&source),
        &mut distillation,
        &blocked_output,
    )
    .unwrap();

    assert_eq!(warnings, vec!["截图保存失败。"]);
    assert!(capturer.requested.lock().unwrap().is_empty());
    assert!(distillation.key_evidence[0].screenshot_path.is_none());
    let markdown = temp.path().join("completed.md");
    let transcript = temp.path().join("completed.txt");
    let thumbnail = temp.path().join("completed.jpg");
    for path in [&markdown, &transcript, &thumbnail] {
        std::fs::write(path, "complete").unwrap();
    }
    let store = HistoryStore::open(temp.path().join("history.sqlite")).unwrap();
    store
        .create(&entry(markdown, transcript, thumbnail))
        .unwrap();
    assert_eq!(store.list().unwrap().len(), 1);
}

impl ScreenshotCapturer for FakeCapturer {
    fn capture(&self, _source: &Path, seconds: f64, output: &Path) -> Result<(), String> {
        self.requested.lock().unwrap().push(seconds);
        if self.fail_at == Some(seconds) {
            return Err("capture failed: C:\\secret.mp4".into());
        }
        std::fs::write(output, "frame").map_err(|error| error.to_string())
    }
}

#[test]
fn screenshot_capture_is_opt_in_and_individual_failures_leave_prior_assets_usable() {
    let temp = tempdir().unwrap();
    let source = temp.path().join("source.mp4");
    std::fs::write(&source, "media").unwrap();
    let capturer = FakeCapturer {
        requested: Default::default(),
        fail_at: Some(20.0),
    };

    let skipped =
        capture_selected_screenshots(&capturer, false, &source, &[10.0], temp.path()).unwrap();
    assert!(skipped.paths.is_empty());
    assert!(capturer.requested.lock().unwrap().is_empty());

    let captured =
        capture_selected_screenshots(&capturer, true, &source, &[10.0, 20.0], temp.path()).unwrap();
    assert_eq!(*capturer.requested.lock().unwrap(), vec![10.0, 20.0]);
    assert_eq!(captured.paths.len(), 2);
    assert!(captured.paths[0].as_ref().is_some_and(|path| path.exists()));
    assert!(captured.paths[1].is_none());
    assert_eq!(captured.warnings, vec!["截图保存失败。"]);

    let markdown = temp.path().join("completed.md");
    let transcript = temp.path().join("completed.txt");
    let thumbnail = temp.path().join("completed.jpg");
    std::fs::write(&markdown, "# Completed note").unwrap();
    std::fs::write(&transcript, "completed transcript").unwrap();
    std::fs::write(&thumbnail, "thumbnail").unwrap();
    let store = HistoryStore::open(temp.path().join("history.sqlite")).unwrap();
    let mut input = entry(markdown.clone(), transcript, thumbnail);
    input.screenshot_paths = captured.paths.into_iter().flatten().collect();
    store.create(&input).unwrap();
    assert!(
        markdown.exists(),
        "a failed frame cannot discard the Markdown result"
    );
    assert_eq!(
        store.list().unwrap().len(),
        1,
        "a failed frame cannot discard history"
    );
}

#[test]
fn middle_capture_failure_keeps_frame_paths_attached_to_their_own_evidence() {
    let temp = tempdir().unwrap();
    let source = temp.path().join("source.mp4");
    std::fs::write(&source, "media").unwrap();
    let capturer = FakeCapturer {
        requested: Default::default(),
        fail_at: Some(20.0),
    };
    let mut distillation = Distillation {
        core_conclusion: "done".into(),
        key_evidence: vec![10.0, 20.0, 30.0]
            .into_iter()
            .map(|seconds| KeyEvidence {
                text: seconds.to_string(),
                timestamp_seconds: Some(seconds),
                source_url: None,
                screenshot_path: None,
            })
            .collect(),
        implications: vec![],
        transcript: None,
    };
    let enabled = TaskOptions {
        note_template: "core_distillation".into(),
        include_screenshots: true,
        note_style: NoteStyle::Minimal,
        ..TaskOptions::default()
    };

    let warnings = capture_evidence_with(
        &capturer,
        &enabled,
        Some(&source),
        &mut distillation,
        temp.path(),
    )
    .unwrap();

    assert_eq!(warnings, vec!["截图保存失败。"]);
    assert!(distillation.key_evidence[0]
        .screenshot_path
        .as_ref()
        .is_some_and(|path| Path::new(path).is_file()));
    assert!(distillation.key_evidence[1].screenshot_path.is_none());
    assert!(distillation.key_evidence[2]
        .screenshot_path
        .as_ref()
        .is_some_and(|path| Path::new(path).is_file()));
    assert_ne!(
        distillation.key_evidence[0].screenshot_path,
        distillation.key_evidence[2].screenshot_path
    );
}

#[test]
fn history_copies_screenshot_before_task_cleanup_and_keeps_owned_copy_afterward() {
    let temp = tempdir().unwrap();
    let task_work = temp.path().join("task-work");
    std::fs::create_dir_all(&task_work).unwrap();
    let markdown = temp.path().join("result.md");
    let screenshot = task_work.join("frame.jpg");
    std::fs::write(&markdown, "# result").unwrap();
    std::fs::write(&screenshot, "frame").unwrap();
    let result = DistillationResult {
        task_id: "task-1".into(),
        saved_path: markdown.to_string_lossy().into_owned(),
        distillation: Distillation {
            core_conclusion: "done".into(),
            key_evidence: vec![KeyEvidence {
                text: "evidence".into(),
                timestamp_seconds: Some(1.0),
                source_url: None,
                screenshot_path: Some(screenshot.to_string_lossy().into_owned()),
            }],
            implications: vec![],
            transcript: Some("transcript".into()),
        },
    };

    let persisted = persist_completed_history(
        &temp.path().join("history.sqlite"),
        &task_work,
        &InputSource::File {
            path: "source.mp4".into(),
        },
        &result,
        &TaskOptions::default(),
    )
    .unwrap();
    std::fs::remove_dir_all(&task_work).unwrap();

    assert!(!screenshot.exists());
    assert_eq!(persisted.screenshot_paths.len(), 1);
    assert!(
        persisted.screenshot_paths[0].exists(),
        "history copied the frame before cleanup"
    );
}
