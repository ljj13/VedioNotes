use std::fs;
use tempfile::tempdir;
use video_distiller_lib::preferences::{
    create_task_work_dir, resolve_markdown_output_dir, AppPreferences, PreferencesStore,
};
use video_distiller_lib::cuda_runtime::LocalComputeMode;
use video_distiller_lib::domain::{SenseVoiceLanguage, TranscriptionMode};
use video_distiller_lib::sensevoice_models::SenseVoiceModelId;

#[test]
fn missing_preferences_file_returns_version_one_defaults() {
    let temp = tempdir().unwrap();
    let store = PreferencesStore::new(temp.path().join("preferences.json"));

    let preferences = store.load().unwrap();

    assert_eq!(preferences.schema_version, 1);
    assert_eq!(preferences.markdown_output_dir, None);
    assert_eq!(preferences.local_compute_mode, LocalComputeMode::Auto);
    assert_eq!(preferences.transcription_mode, TranscriptionMode::OnlineProfile);
    assert_eq!(preferences.sensevoice_model, SenseVoiceModelId::Int8);
    assert_eq!(preferences.sensevoice_languages, vec![SenseVoiceLanguage::Zh]);
}

#[test]
fn legacy_preferences_default_to_automatic_cuda_priority() {
    let preferences: AppPreferences = serde_json::from_str(
        r#"{"schemaVersion":1,"markdownOutputDir":null}"#,
    )
    .unwrap();

    assert_eq!(preferences.local_compute_mode, LocalComputeMode::Auto);
    assert_eq!(preferences.transcription_mode, TranscriptionMode::OnlineProfile);
}

#[test]
fn preferences_round_trip_custom_output_directory() {
    let temp = tempdir().unwrap();
    let output = temp.path().join("markdown");
    let store = PreferencesStore::new(temp.path().join("preferences.json"));
    let preferences = AppPreferences {
        schema_version: 1,
        markdown_output_dir: Some(output.to_string_lossy().into_owned()),
        local_compute_mode: LocalComputeMode::Cpu,
        ..AppPreferences::default()
    };

    store.save(&preferences).unwrap();
    assert!(output.is_dir());
    assert_eq!(store.load().unwrap(), preferences);

    let replacement = AppPreferences {
        schema_version: 1,
        markdown_output_dir: None,
        local_compute_mode: LocalComputeMode::Auto,
        ..AppPreferences::default()
    };
    store.save(&replacement).unwrap();
    assert_eq!(store.load().unwrap(), replacement);
}

#[test]
fn corrupt_preferences_are_preserved_and_rejected() {
    let temp = tempdir().unwrap();
    let path = temp.path().join("preferences.json");
    let bytes = b"{ definitely not json";
    fs::write(&path, bytes).unwrap();
    let store = PreferencesStore::new(&path);

    let error = store.load().unwrap_err();

    assert_eq!(error.code, "preferences_corrupt");
    assert_eq!(fs::read(path).unwrap(), bytes);
}

#[test]
fn saving_rejects_empty_custom_directory() {
    let temp = tempdir().unwrap();
    let store = PreferencesStore::new(temp.path().join("preferences.json"));
    let preferences = AppPreferences {
        schema_version: 1,
        markdown_output_dir: Some("   ".into()),
        local_compute_mode: LocalComputeMode::Auto,
        ..AppPreferences::default()
    };

    let error = store.save(&preferences).unwrap_err();

    assert_eq!(error.code, "invalid_output_directory");
}

#[test]
fn saving_rejects_existing_file_as_output_directory() {
    let temp = tempdir().unwrap();
    let file = temp.path().join("not-a-directory");
    fs::write(&file, b"x").unwrap();
    let store = PreferencesStore::new(temp.path().join("preferences.json"));
    let preferences = AppPreferences {
        schema_version: 1,
        markdown_output_dir: Some(file.to_string_lossy().into_owned()),
        local_compute_mode: LocalComputeMode::Auto,
        ..AppPreferences::default()
    };

    let error = store.save(&preferences).unwrap_err();

    assert_eq!(error.code, "invalid_output_directory");
}

#[test]
fn resolver_uses_custom_directory_and_creates_it() {
    let temp = tempdir().unwrap();
    let output = temp.path().join("nested").join("markdown");
    let preferences = AppPreferences {
        schema_version: 1,
        markdown_output_dir: Some(output.to_string_lossy().into_owned()),
        local_compute_mode: LocalComputeMode::Auto,
        ..AppPreferences::default()
    };

    let resolved = resolve_markdown_output_dir(&preferences).unwrap();

    assert_eq!(resolved, output);
    assert!(resolved.is_dir());
}

#[test]
fn task_work_directory_is_distinct_from_markdown_output() {
    let temp = tempdir().unwrap();
    let output = temp.path().join("markdown");
    let task = create_task_work_dir("test-task-id").unwrap();

    assert_ne!(task, output);
    assert!(task.is_dir());
    std::fs::remove_dir_all(task).unwrap();
}
