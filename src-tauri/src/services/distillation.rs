use crate::domain::{AppError, Distillation, KeyEvidence, NoteStyle};

/// The system prompt for the LLM distillation.
const SYSTEM_PROMPT: &str = "你是视频内容编辑。只提炼真正有信息价值的内容，忽略开场寒暄、营销、重复与空泛修辞。严格输出 JSON 对象：core_conclusion 为核心判断；key_evidence 为关键依据字符串数组；implications 为可执行启示或适用边界字符串数组。不得编造转写中没有的信息，不得把推测写成事实。";

/// Build the chat completion payload for distillation.
pub fn build_distillation_prompt(transcript: &str, style: NoteStyle) -> serde_json::Value {
    let system = format!("{SYSTEM_PROMPT}\n\n{}", style_instruction(style));
    serde_json::json!({
        "system": system,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": format!("请提炼以下视频转写内容：\n\n{}", transcript)}
        ]
    })
}

fn style_instruction(style: NoteStyle) -> &'static str {
    match style {
        NoteStyle::Minimal => "笔记风格：精简。只保留最关键的结论、依据和行动点，措辞简洁、便于快速浏览。",
        NoteStyle::Detailed => "笔记风格：详细。完整呈现重要背景、论证关系、关键依据和适用边界，避免无信息量的扩写。",
        NoteStyle::Tutorial => "笔记风格：教程。按清晰步骤组织学习路径，突出前置条件、关键操作和转写中明确提到的注意事项。",
        NoteStyle::Academic => "笔记风格：学术。使用正式、结构化、术语准确的表达，谨慎区分事实、观点和证据边界。",
        NoteStyle::Xiaohongshu => "笔记风格：小红书。用有吸引力、轻快且便于扫读的表达，可适度使用表情符号，但不得夸大或编造。",
        NoteStyle::LifeJournal => "笔记风格：生活向。使用自然、亲切、有反思感的叙述，所有感受与结论仍须以转写内容为依据。",
        NoteStyle::TaskOriented => "笔记风格：任务导向。突出目标、任务、依赖和下一步；负责人、截止时间只在转写明确说明时记录。",
        NoteStyle::Business => "笔记风格：商业风格。突出管理摘要、决策影响、风险与机会，表达专业直接并保持证据可追溯。",
        NoteStyle::MeetingMinutes => "笔记风格：会议纪要。按议题、决定和行动项组织；负责人和截止时间只在来源明确给出时记录。",
    }
}

/// Return the system prompt constant (for testing).
pub fn system_prompt() -> &'static str {
    SYSTEM_PROMPT
}

/// Parse the LLM response into a Distillation struct.
pub fn parse_distillation(body: &str) -> Result<Distillation, AppError> {
    let parsed: serde_json::Value = serde_json::from_str(body).map_err(|_| {
        AppError::new(
            "invalid_model_output",
            "模型输出不是有效的 JSON。".to_string(),
            "请重试此任务。",
        )
    })?;

    let obj = parsed.as_object().ok_or_else(|| {
        AppError::new(
            "invalid_model_output",
            "模型输出不是有效的 JSON 对象。".to_string(),
            "请重试此任务。",
        )
    })?;

    let core_conclusion = obj
        .get("core_conclusion")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .ok_or_else(|| {
            AppError::new(
                "invalid_model_output",
                "缺少 core_conclusion 字段。".to_string(),
                "请重试此任务。",
            )
        })?;

    let key_evidence = obj
        .get("key_evidence")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|v| {
                    v.as_str().map(|text| KeyEvidence {
                        text: text.to_string(),
                        timestamp_seconds: None,
                        source_url: None,
                        screenshot_path: None,
                    })
                })
                .collect::<Vec<_>>()
        })
        .ok_or_else(|| {
            AppError::new(
                "invalid_model_output",
                "缺少 key_evidence 字段或类型错误。".to_string(),
                "请重试此任务。",
            )
        })?;

    let implications = obj
        .get("implications")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_str().map(|s| s.to_string()))
                .collect::<Vec<_>>()
        })
        .ok_or_else(|| {
            AppError::new(
                "invalid_model_output",
                "缺少 implications 字段或类型错误。".to_string(),
                "请重试此任务。",
            )
        })?;

    Ok(Distillation {
        core_conclusion,
        key_evidence,
        implications,
        transcript: None,
    })
}
