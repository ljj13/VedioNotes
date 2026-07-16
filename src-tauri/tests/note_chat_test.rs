use async_trait::async_trait;
use std::sync::{atomic::AtomicBool, Mutex};
use tempfile::tempdir;
use video_distiller_lib::{
    commands::ask_history_note_with_resolver,
    credential_store::SecretPayload,
    domain::{Distillation, NoteStyle},
    history_store::{HistoryEntryInput, HistoryStore},
    note_chat::{ask_note_with, NoteChatTurn},
    profiles::{SummaryProfile, SummaryProviderKind},
    providers::{error::ProviderError, SummaryAdapter},
};

struct FakeSummaryAdapter {
    prompts: Mutex<Vec<String>>,
    answer: String,
}

struct FailingSummaryAdapter;

#[async_trait]
impl SummaryAdapter for FailingSummaryAdapter {
    async fn summarize(
        &self,
        _transcript: &str,
        _style: NoteStyle,
        _profile: &SummaryProfile,
        _secret: &SecretPayload,
        _cancel: &AtomicBool,
    ) -> Result<Distillation, ProviderError> {
        Err(ProviderError::new(
            video_distiller_lib::providers::error::ProviderErrorKind::ProviderError,
            "raw response body api-secret",
            "secret transcript",
        ))
    }
}

#[async_trait]
impl SummaryAdapter for FakeSummaryAdapter {
    async fn summarize(
        &self,
        transcript: &str,
        _style: NoteStyle,
        _profile: &SummaryProfile,
        _secret: &SecretPayload,
        _cancel: &AtomicBool,
    ) -> Result<Distillation, ProviderError> {
        self.prompts.lock().unwrap().push(transcript.to_string());
        Ok(Distillation {
            core_conclusion: self.answer.clone(),
            key_evidence: vec![],
            implications: vec![],
            transcript: None,
        })
    }
}

fn profile() -> SummaryProfile {
    SummaryProfile {
        id: "summary".into(),
        name: "Test".into(),
        provider: SummaryProviderKind::OpenAiCompatible,
        catalog_provider_id: None,
        base_url: "https://example.invalid".into(),
        model: "test".into(),
        enabled: true,
        built_in: false,
    }
}

fn create_note(
    store: &HistoryStore,
    root: &std::path::Path,
    title: &str,
    markdown: &str,
    transcript: &str,
) -> i64 {
    let markdown_path = root.join(format!("{title}.md"));
    let transcript_path = root.join(format!("{title}.txt"));
    std::fs::write(&markdown_path, markdown).unwrap();
    std::fs::write(&transcript_path, transcript).unwrap();
    store
        .create(&HistoryEntryInput {
            title: title.into(),
            source: "https://example.invalid".into(),
            note_template: "core_distillation".into(),
            note_style: NoteStyle::Minimal,
            created_at: "2026-07-13T00:00:00Z".into(),
            markdown_path,
            transcript_path,
            thumbnail_path: None,
            screenshot_paths: vec![],
        })
        .unwrap()
}

#[tokio::test]
async fn asks_only_the_selected_history_notes_stored_markdown_and_transcript() {
    let temp = tempdir().unwrap();
    let store = HistoryStore::open(temp.path().join("history.sqlite")).unwrap();
    let selected = create_note(
        &store,
        temp.path(),
        "selected",
        "# SELECTED_MARKDOWN",
        "SELECTED_TRANSCRIPT",
    );
    create_note(
        &store,
        temp.path(),
        "other",
        "# OTHER_MARKDOWN",
        "OTHER_TRANSCRIPT",
    );
    let adapter = FakeSummaryAdapter {
        prompts: Mutex::new(vec![]),
        answer: "Selected answer".into(),
    };

    let turns = ask_note_with(
        &store,
        selected,
        "What is the point?",
        &adapter,
        &profile(),
        &SecretPayload::Bearer {
            api_key: "not-used".into(),
        },
        &AtomicBool::new(false),
    )
    .await
    .unwrap();

    assert_eq!(
        turns,
        vec![
            NoteChatTurn::user("What is the point?"),
            NoteChatTurn::assistant("Selected answer")
        ]
    );
    let prompt = adapter.prompts.lock().unwrap().pop().unwrap();
    assert!(prompt.contains("SELECTED_MARKDOWN") && prompt.contains("SELECTED_TRANSCRIPT"));
    assert!(!prompt.contains("OTHER_MARKDOWN") && !prompt.contains("OTHER_TRANSCRIPT"));
}

#[tokio::test]
async fn persists_and_returns_turns_per_history_id() {
    let temp = tempdir().unwrap();
    let store = HistoryStore::open(temp.path().join("history.sqlite")).unwrap();
    let note = create_note(&store, temp.path(), "note", "# Note", "Transcript");
    let other = create_note(&store, temp.path(), "other", "# Other", "Other transcript");
    let adapter = FakeSummaryAdapter {
        prompts: Mutex::new(vec![]),
        answer: "Answer".into(),
    };

    ask_note_with(
        &store,
        note,
        "Question",
        &adapter,
        &profile(),
        &SecretPayload::Bearer {
            api_key: "not-used".into(),
        },
        &AtomicBool::new(false),
    )
    .await
    .unwrap();

    assert_eq!(
        store.list_conversation(note).unwrap(),
        vec![
            NoteChatTurn::user("Question"),
            NoteChatTurn::assistant("Answer")
        ]
    );
    assert!(store.list_conversation(other).unwrap().is_empty());
}

#[tokio::test]
async fn missing_note_rejects_without_provider_invocation_and_redacts_sensitive_data() {
    let temp = tempdir().unwrap();
    let store = HistoryStore::open(temp.path().join("history.sqlite")).unwrap();
    let adapter = FakeSummaryAdapter {
        prompts: Mutex::new(vec![]),
        answer: "raw response body secret transcript".into(),
    };

    let error = ask_note_with(
        &store,
        404,
        "secret transcript",
        &adapter,
        &profile(),
        &SecretPayload::Bearer {
            api_key: "api-secret".into(),
        },
        &AtomicBool::new(false),
    )
    .await
    .unwrap_err();

    assert_eq!(error.code, "history_missing");
    assert!(adapter.prompts.lock().unwrap().is_empty());
    let rendered = format!("{} {} {}", error.code, error.message, error.recovery);
    for sensitive in ["secret transcript", "api-secret", "raw response body"] {
        assert!(!rendered.contains(sensitive));
    }
}

#[tokio::test]
async fn command_seam_rejects_missing_note_before_summary_resolution() {
    let temp = tempdir().unwrap();
    let store = HistoryStore::open(temp.path().join("history.sqlite")).unwrap();
    let resolved = Mutex::new(false);

    let error = ask_history_note_with_resolver(&store, 404, "secret transcript", || {
        *resolved.lock().unwrap() = true;
        panic!("credential/provider resolution must not happen")
    })
    .await
    .unwrap_err();

    assert_eq!(error.code, "history_missing");
    assert!(!*resolved.lock().unwrap());
    assert!(
        !format!("{} {} {}", error.code, error.message, error.recovery)
            .contains("secret transcript")
    );
}

#[tokio::test]
async fn command_seam_redacts_provider_failure() {
    let temp = tempdir().unwrap();
    let store = HistoryStore::open(temp.path().join("history.sqlite")).unwrap();
    let note = create_note(
        &store,
        temp.path(),
        "note",
        "# NOTE_SECRET",
        "TRANSCRIPT_SECRET",
    );
    let adapter = FailingSummaryAdapter;

    let error = ask_history_note_with_resolver(&store, note, "QUESTION_SECRET", || {
        Ok((
            &adapter as &dyn SummaryAdapter,
            profile(),
            SecretPayload::Bearer {
                api_key: "API_KEY_SECRET".into(),
            },
        ))
    })
    .await
    .unwrap_err();

    assert_eq!(error.code, "note_chat_failed");
    let rendered = format!("{} {} {}", error.code, error.message, error.recovery);
    for sensitive in [
        "raw response body",
        "api-secret",
        "secret transcript",
        "NOTE_SECRET",
        "TRANSCRIPT_SECRET",
        "QUESTION_SECRET",
        "API_KEY_SECRET",
    ] {
        assert!(!rendered.contains(sensitive));
    }
}
