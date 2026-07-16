use video_distiller_lib::commands::{select_transcription_route, task_options_or_default, TranscriptionRoute};
use video_distiller_lib::domain::{NoteStyle, SenseVoiceLanguage, TaskOptions, TranscriptionMode};
use video_distiller_lib::sensevoice_models::SenseVoiceModelId;

#[test]
fn omitted_start_request_options_use_domain_defaults() {
    assert_eq!(task_options_or_default(None), TaskOptions::default());
}

#[test]
fn supplied_start_request_options_are_preserved() {
    let options = TaskOptions {
        note_template: "meeting_notes".into(),
        include_screenshots: true,
        note_style: NoteStyle::MeetingMinutes,
        transcription_mode: Some(TranscriptionMode::SensevoiceCpu),
        sensevoice_model: SenseVoiceModelId::Float32,
        sensevoice_languages: vec![SenseVoiceLanguage::Zh, SenseVoiceLanguage::En],
    };

    assert_eq!(task_options_or_default(Some(options.clone())), options);
}

#[test]
fn sensevoice_options_are_a_closed_serialized_contract() {
    let options: TaskOptions = serde_json::from_str(
        r#"{"note_template":"core_distillation","include_screenshots":false,"note_style":"minimal","transcription_mode":"sensevoice_cpu","sensevoice_model":"int8","sensevoice_languages":["zh","en"]}"#,
    )
    .unwrap();

    assert_eq!(options.transcription_mode, Some(TranscriptionMode::SensevoiceCpu));
    assert_eq!(options.sensevoice_model, SenseVoiceModelId::Int8);
    assert_eq!(options.sensevoice_languages, vec![SenseVoiceLanguage::Zh, SenseVoiceLanguage::En]);
    assert!(serde_json::from_str::<TranscriptionMode>(r#""automatic""#).is_err());
}

#[test]
fn legacy_options_preserve_profile_routing() {
    let options: TaskOptions = serde_json::from_str(
        r#"{"note_template":"core_distillation","include_screenshots":false}"#,
    )
    .unwrap();

    assert_eq!(options.transcription_mode, None);
    assert_eq!(options.sensevoice_model, SenseVoiceModelId::Int8);
    assert_eq!(options.sensevoice_languages, vec![SenseVoiceLanguage::Zh]);
}

#[test]
fn captions_always_skip_asr_and_cpu_missing_captions_route_only_to_sensevoice() {
    assert_eq!(
        select_transcription_route(true, Some(TranscriptionMode::SensevoiceCpu)),
        TranscriptionRoute::Captions,
    );
    assert_eq!(
        select_transcription_route(false, Some(TranscriptionMode::SensevoiceCpu)),
        TranscriptionRoute::Sensevoice,
    );
    assert_eq!(
        select_transcription_route(false, Some(TranscriptionMode::WhisperLocal)),
        TranscriptionRoute::Profile,
    );
    assert_eq!(
        select_transcription_route(false, Some(TranscriptionMode::OnlineProfile)),
        TranscriptionRoute::Profile,
    );
}

#[test]
fn legacy_task_options_default_to_minimal_style() {
    let options: TaskOptions = serde_json::from_str(
        r#"{"note_template":"core_distillation","include_screenshots":false}"#,
    )
    .unwrap();

    assert_eq!(options.note_style, NoteStyle::Minimal);
}

#[test]
fn note_style_is_a_closed_nine_value_snake_case_contract() {
    let values: Vec<NoteStyle> = serde_json::from_str(
        r#"["minimal","detailed","tutorial","academic","xiaohongshu","life_journal","task_oriented","business","meeting_minutes"]"#,
    )
    .unwrap();

    assert_eq!(values.len(), 9);
    assert_eq!(values[3].as_str(), "academic");
    assert!(serde_json::from_str::<NoteStyle>(r#""free text""#).is_err());
}
