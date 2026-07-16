use video_distiller_lib::services::distillation::{
    build_distillation_prompt, parse_distillation, system_prompt,
};
use video_distiller_lib::domain::NoteStyle;

#[test]
fn prompt_includes_instructions() {
    let prompt = system_prompt();
    assert!(
        prompt.contains("忽略"),
        "Prompt should contain Chinese instruction keywords"
    );
    assert!(
        prompt.contains("core_conclusion"),
        "Prompt should mention core_conclusion"
    );
    assert!(
        prompt.contains("key_evidence"),
        "Prompt should mention key_evidence"
    );
    assert!(
        prompt.contains("implications"),
        "Prompt should mention implications"
    );
    // The prompt contains "忽略开场寒暄" (not contiguous "忽略寒暄")
    assert!(prompt.contains("营销"), "Prompt should mention 营销");
    assert!(
        prompt.contains("空泛修辞"),
        "Prompt should mention 空泛修辞"
    );
    assert!(prompt.contains("不得编造"), "Should mention 不得编造");
}

#[test]
fn prompt_json_has_system_message() {
    let payload = build_distillation_prompt("这是一段视频转写文本。", NoteStyle::Minimal);
    let json_str = serde_json::to_string(&payload).unwrap();
    assert!(
        json_str.contains("忽略"),
        "JSON payload should contain the system prompt Chinese text"
    );
    assert!(
        json_str.contains(r#"core_conclusion"#),
        "JSON payload should mention core_conclusion"
    );
    assert!(json_str.contains(r#"user"#), "JSON should have user role");
    assert!(
        json_str.contains("这是一段视频转写文本。"),
        "JSON should contain the user's transcript"
    );
}

#[test]
fn every_note_style_has_a_distinct_grounded_instruction() {
    let cases = [
        (NoteStyle::Minimal, "精简"),
        (NoteStyle::Detailed, "完整"),
        (NoteStyle::Tutorial, "步骤"),
        (NoteStyle::Academic, "学术"),
        (NoteStyle::Xiaohongshu, "小红书"),
        (NoteStyle::LifeJournal, "生活"),
        (NoteStyle::TaskOriented, "任务"),
        (NoteStyle::Business, "商业"),
        (NoteStyle::MeetingMinutes, "会议纪要"),
    ];

    for (style, marker) in cases {
        let payload = build_distillation_prompt("原始转写", style);
        let serialized = serde_json::to_string(&payload).unwrap();
        assert!(serialized.contains(marker), "missing marker for {}", style.as_str());
        assert!(serialized.contains("不得编造"));
        assert!(serialized.contains("core_conclusion"));
        assert!(serialized.contains("原始转写"));
    }
}

#[test]
fn parse_valid_distillation_output() {
    let json =
        r#"{"core_conclusion":"结论","key_evidence":["依据1","依据2"],"implications":["行动1"]}"#;
    let result = parse_distillation(json).unwrap();
    assert_eq!(result.core_conclusion, "结论");
    assert_eq!(result.key_evidence.len(), 2);
    assert_eq!(result.implications.len(), 1);
}

#[test]
fn parse_rejects_missing_field() {
    let json = r#"{"core_conclusion":"结论"}"#;
    let err = parse_distillation(json).unwrap_err();
    assert_eq!(err.code, "invalid_model_output");
    assert_eq!(err.recovery, "请重试此任务。");
}

#[test]
fn parse_rejects_invalid_json() {
    let err = parse_distillation("not json").unwrap_err();
    assert_eq!(err.code, "invalid_model_output");
}

#[test]
fn parse_rejects_wrong_types() {
    let json = r#"{"core_conclusion":"结论","key_evidence":"not_an_array","implications":[]}"#;
    let err = parse_distillation(json).unwrap_err();
    assert_eq!(err.code, "invalid_model_output");
}
