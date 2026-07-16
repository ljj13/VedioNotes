// == Summary Provider Adapters ===============================================
//
// Executable adapters for the four standard summary protocols accepted by
// the embedded models.dev catalog. All implementations share prompt
// normalization, bounded response reading, cancellation, redacted HTTP error
// mapping, and Distillation parsing.

use async_trait::async_trait;
use reqwest::{Response, StatusCode};
use std::sync::atomic::{AtomicBool, Ordering};

use crate::credential_store::SecretPayload;
use crate::domain::{Distillation, NoteStyle};
use crate::profiles::SummaryProfile;
use crate::providers::endpoint::{
    resolve_endpoint, resolve_google_generate_content, EndpointKind,
};
use crate::providers::error::{self, ProviderError, ProviderErrorKind};
use crate::providers::SummaryAdapter;

const MAX_SUMMARY_RESPONSE_BYTES: usize = 1024 * 1024;
const ANTHROPIC_VERSION: &str = "2023-06-01";
const ANTHROPIC_MAX_TOKENS: u32 = 4096;

struct NormalizedPrompt {
    system: String,
    user: String,
}

fn normalized_prompt(transcript: &str, style: NoteStyle) -> Result<NormalizedPrompt, ProviderError> {
    let prompt = crate::services::distillation::build_distillation_prompt(transcript, style);
    let system = prompt
        .get("system")
        .and_then(serde_json::Value::as_str)
        .ok_or_else(|| error::err_invalid_response("无法构建总结系统指令。"))?;
    let user = prompt
        .get("messages")
        .and_then(serde_json::Value::as_array)
        .and_then(|messages| {
            messages.iter().find_map(|message| {
                (message.get("role").and_then(serde_json::Value::as_str) == Some("user"))
                    .then(|| message.get("content").and_then(serde_json::Value::as_str))
                    .flatten()
            })
        })
        .ok_or_else(|| error::err_invalid_response("无法构建总结用户指令。"))?;
    Ok(NormalizedPrompt {
        system: system.to_owned(),
        user: user.to_owned(),
    })
}

fn bearer_key(secret: &SecretPayload) -> Result<&str, ProviderError> {
    match secret {
        SecretPayload::Bearer { api_key } if !api_key.trim().is_empty() => Ok(api_key),
        _ => Err(ProviderError::new(
            ProviderErrorKind::AuthenticationFailed,
            "该配置档的凭据不是有效的 API Key。",
            "请在设置中更新 API Key。",
        )),
    }
}

fn ensure_not_cancelled(cancel: &AtomicBool) -> Result<(), ProviderError> {
    if cancel.load(Ordering::SeqCst) {
        Err(error::err_cancelled())
    } else {
        Ok(())
    }
}

fn map_http_status(status: StatusCode) -> Result<(), ProviderError> {
    match status.as_u16() {
        200..=299 => Ok(()),
        401 | 403 => Err(ProviderError::new(
            ProviderErrorKind::AuthenticationFailed,
            "认证失败，请检查 API Key。",
            "请在设置中更新 API Key。",
        )
        .with_http_status(status.as_u16())),
        402 => Err(ProviderError::new(
            ProviderErrorKind::BillingUnavailable,
            "AI 服务账户不可用或余额不足。",
            "请检查账户状态或切换服务商。",
        )
        .with_http_status(status.as_u16())),
        429 => Err(ProviderError::new(
            ProviderErrorKind::RateLimited,
            "请求过于频繁，请稍后重试。",
            "请稍后再试。",
        )
        .with_http_status(status.as_u16())),
        404 => Err(ProviderError::new(
            ProviderErrorKind::ProviderError,
            "总结服务请求端点不存在。",
            "请检查服务商地址、协议以及 /v1 或 /v1beta 路径配置。",
        )
        .with_http_status(status.as_u16())),
        _ => Err(ProviderError::new(
            ProviderErrorKind::ProviderError,
            format!("总结服务返回错误 ({})", status.as_u16()),
            "请检查 API Key 和模型配置是否正确。",
        )
        .with_http_status(status.as_u16())),
    }
}

async fn read_bounded_response(
    mut response: Response,
    cancel: &AtomicBool,
) -> Result<String, ProviderError> {
    ensure_not_cancelled(cancel)?;
    map_http_status(response.status())?;
    if response
        .content_length()
        .is_some_and(|length| length > MAX_SUMMARY_RESPONSE_BYTES as u64)
    {
        return Err(error::err_invalid_response("总结响应超过安全大小限制。"));
    }

    let mut bytes = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(error::err_network)? {
        ensure_not_cancelled(cancel)?;
        if bytes.len().saturating_add(chunk.len()) > MAX_SUMMARY_RESPONSE_BYTES {
            return Err(error::err_invalid_response("总结响应超过安全大小限制。"));
        }
        bytes.extend_from_slice(&chunk);
    }
    String::from_utf8(bytes)
        .map_err(|_| error::err_invalid_response("总结服务返回了无效的文本编码。"))
}

async fn finish_summary(
    response: Response,
    transcript: &str,
    cancel: &AtomicBool,
    extract: fn(&str) -> Result<String, ProviderError>,
) -> Result<Distillation, ProviderError> {
    let body = read_bounded_response(response, cancel).await?;
    let raw_content = extract(&body)?;
    let mut distillation = crate::services::distillation::parse_distillation(&raw_content)
        .map_err(|_| {
            ProviderError::new(
                ProviderErrorKind::InvalidResponse,
                "总结响应缺少 core_conclusion、key_evidence 或 implications 字段。",
                "请重试此任务。",
            )
        })?;
    distillation.transcript = Some(transcript.to_owned());
    Ok(distillation)
}

pub struct OpenAiCompatibleSummaryAdapter;

#[async_trait]
impl SummaryAdapter for OpenAiCompatibleSummaryAdapter {
    async fn summarize(
        &self,
        transcript: &str,
        style: NoteStyle,
        profile: &SummaryProfile,
        secret: &SecretPayload,
        cancel: &AtomicBool,
    ) -> Result<Distillation, ProviderError> {
        ensure_not_cancelled(cancel)?;
        let api_key = bearer_key(secret)?;
        let url = resolve_endpoint(&profile.base_url, EndpointKind::ChatCompletions)?;
        let mut request_body =
            crate::services::distillation::build_distillation_prompt(transcript, style);
        if let Some(object) = request_body.as_object_mut() {
            object.insert("model".into(), profile.model.clone().into());
        }
        ensure_not_cancelled(cancel)?;
        let response = reqwest::Client::new()
            .post(url)
            .header("Authorization", format!("Bearer {api_key}"))
            .json(&request_body)
            .send()
            .await
            .map_err(error::err_network)?;
        finish_summary(response, transcript, cancel, parse_openai_chat_response).await
    }
}

pub struct OpenAiResponsesSummaryAdapter;

#[async_trait]
impl SummaryAdapter for OpenAiResponsesSummaryAdapter {
    async fn summarize(
        &self,
        transcript: &str,
        style: NoteStyle,
        profile: &SummaryProfile,
        secret: &SecretPayload,
        cancel: &AtomicBool,
    ) -> Result<Distillation, ProviderError> {
        ensure_not_cancelled(cancel)?;
        let api_key = bearer_key(secret)?;
        let prompt = normalized_prompt(transcript, style)?;
        let url = resolve_endpoint(&profile.base_url, EndpointKind::Responses)?;
        let body = serde_json::json!({
            "model": profile.model,
            "instructions": prompt.system,
            "input": prompt.user,
        });
        ensure_not_cancelled(cancel)?;
        let response = reqwest::Client::new()
            .post(url)
            .header("Authorization", format!("Bearer {api_key}"))
            .json(&body)
            .send()
            .await
            .map_err(error::err_network)?;
        finish_summary(response, transcript, cancel, parse_openai_responses_response).await
    }
}

pub struct AnthropicSummaryAdapter;

#[async_trait]
impl SummaryAdapter for AnthropicSummaryAdapter {
    async fn summarize(
        &self,
        transcript: &str,
        style: NoteStyle,
        profile: &SummaryProfile,
        secret: &SecretPayload,
        cancel: &AtomicBool,
    ) -> Result<Distillation, ProviderError> {
        ensure_not_cancelled(cancel)?;
        let api_key = bearer_key(secret)?;
        let prompt = normalized_prompt(transcript, style)?;
        let url = resolve_endpoint(&profile.base_url, EndpointKind::AnthropicMessages)?;
        let body = serde_json::json!({
            "model": profile.model,
            "max_tokens": ANTHROPIC_MAX_TOKENS,
            "system": prompt.system,
            "messages": [{"role": "user", "content": prompt.user}],
        });
        ensure_not_cancelled(cancel)?;
        let response = reqwest::Client::new()
            .post(url)
            .header("x-api-key", api_key)
            .header("anthropic-version", ANTHROPIC_VERSION)
            .json(&body)
            .send()
            .await
            .map_err(error::err_network)?;
        finish_summary(response, transcript, cancel, parse_anthropic_response).await
    }
}

pub struct GoogleSummaryAdapter;

#[async_trait]
impl SummaryAdapter for GoogleSummaryAdapter {
    async fn summarize(
        &self,
        transcript: &str,
        style: NoteStyle,
        profile: &SummaryProfile,
        secret: &SecretPayload,
        cancel: &AtomicBool,
    ) -> Result<Distillation, ProviderError> {
        ensure_not_cancelled(cancel)?;
        let api_key = bearer_key(secret)?;
        let prompt = normalized_prompt(transcript, style)?;
        let url = resolve_google_generate_content(&profile.base_url, &profile.model)?;
        let body = serde_json::json!({
            "systemInstruction": {"parts": [{"text": prompt.system}]},
            "contents": [{"role": "user", "parts": [{"text": prompt.user}]}],
        });
        ensure_not_cancelled(cancel)?;
        let response = reqwest::Client::new()
            .post(url)
            .header("x-goog-api-key", api_key)
            .json(&body)
            .send()
            .await
            .map_err(error::err_network)?;
        finish_summary(response, transcript, cancel, parse_google_response).await
    }
}

fn parse_json(body: &str) -> Result<serde_json::Value, ProviderError> {
    serde_json::from_str(body)
        .map_err(|_| error::err_invalid_response("总结服务返回了无效的 JSON 响应。"))
}

fn non_empty_text(text: String, missing_message: &'static str) -> Result<String, ProviderError> {
    if text.trim().is_empty() {
        Err(error::err_invalid_response(missing_message))
    } else {
        Ok(text)
    }
}

fn parse_openai_chat_response(body: &str) -> Result<String, ProviderError> {
    let parsed = parse_json(body)?;
    let content = parsed["choices"][0]["message"]["content"]
        .as_str()
        .ok_or_else(|| error::err_invalid_response("总结响应缺少 choices[0].message.content。"))?;
    non_empty_text(content.to_owned(), "总结结果为空白。")
}

fn parse_openai_responses_response(body: &str) -> Result<String, ProviderError> {
    let parsed = parse_json(body)?;
    if let Some(output_text) = parsed.get("output_text").and_then(serde_json::Value::as_str) {
        return non_empty_text(output_text.to_owned(), "总结结果为空白。");
    }
    let text = parsed
        .get("output")
        .and_then(serde_json::Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|output| output.get("content").and_then(serde_json::Value::as_array))
        .flatten()
        .filter_map(|content| content.get("text").and_then(serde_json::Value::as_str))
        .collect::<Vec<_>>()
        .join("\n");
    non_empty_text(text, "总结响应缺少 output_text 文本。")
}

fn parse_anthropic_response(body: &str) -> Result<String, ProviderError> {
    let parsed = parse_json(body)?;
    let text = parsed
        .get("content")
        .and_then(serde_json::Value::as_array)
        .into_iter()
        .flatten()
        .filter(|block| block.get("type").and_then(serde_json::Value::as_str) == Some("text"))
        .filter_map(|block| block.get("text").and_then(serde_json::Value::as_str))
        .collect::<Vec<_>>()
        .join("\n");
    non_empty_text(text, "Anthropic 响应缺少文本内容。")
}

fn parse_google_response(body: &str) -> Result<String, ProviderError> {
    let parsed = parse_json(body)?;
    let text = parsed
        .get("candidates")
        .and_then(serde_json::Value::as_array)
        .and_then(|candidates| candidates.first())
        .and_then(|candidate| candidate.get("content"))
        .and_then(|content| content.get("parts"))
        .and_then(serde_json::Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|part| part.get("text").and_then(serde_json::Value::as_str))
        .collect::<Vec<_>>()
        .join("\n");
    non_empty_text(text, "Google 响应缺少候选文本。")
}