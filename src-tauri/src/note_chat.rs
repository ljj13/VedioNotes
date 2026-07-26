//! 笔记问答——基于笔记内容的 AI 问答.
//! AI 只能回答笔记相关的问题.

use crate::{
    credential_store::SecretPayload,
    domain::AppError,
    history_store::HistoryStore,
    profiles::SummaryProfile, providers::SummaryAdapter,
};
use std::sync::atomic::AtomicBool;

pub use crate::history_store::NoteChatTurn;

/// ask note with
pub async fn ask_note_with(
    store: &HistoryStore,
    history_id: i64,
    question: &str,
    adapter: &dyn SummaryAdapter,
    profile: &SummaryProfile,
    secret: &SecretPayload,
    cancel: &AtomicBool,
) -> Result<Vec<NoteChatTurn>, AppError> {
    let entry = store.get(history_id)?.ok_or_else(history_missing)?;
    let markdown =
        std::fs::read_to_string(&entry.markdown_path).map_err(|_| history_storage_error())?;
    let transcript =
        std::fs::read_to_string(&entry.transcript_path).map_err(|_| history_storage_error())?;
    let prompt = build_note_prompt(&markdown, &transcript, question);

    // The installed summary adapter is the sole provider seam. Its validated
    // core conclusion is the concise chat answer; no new credential type or
    // HTTP client is introduced for Q&A.
    let result = adapter
        .summarize(&prompt, entry.note_style, profile, secret, cancel)
        .await
        .map_err(|_| provider_error())?;
    let turns = vec![
        NoteChatTurn::user(question),
        NoteChatTurn::assistant(&result.core_conclusion),
    ];
    store.append_conversation(history_id, &turns)?;
    Ok(turns)
}

fn build_note_prompt(markdown: &str, transcript: &str, question: &str) -> String {
    format!(
        "Answer the question using only the supplied note and transcript. Return a structured distillation response whose core_conclusion is the answer.\n\nNOTE:\n{markdown}\n\nTRANSCRIPT:\n{transcript}\n\nQUESTION:\n{question}"
    )
}

fn history_missing() -> AppError {
    AppError::new(
        "history_missing",
        "历史记录不存在。",
        "请刷新历史列表后重试。",
    )
}

fn history_storage_error() -> AppError {
    AppError::new(
        "history_storage_failed",
        "历史记录存储失败。",
        "请检查磁盘空间和应用数据目录权限。",
    )
}

fn provider_error() -> AppError {
    AppError::new(
        "note_chat_failed",
        "笔记问答暂时不可用。",
        "请检查总结配置后重试。",
    )
}
