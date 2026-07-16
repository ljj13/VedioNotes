// == Provider endpoint normalization =========================================
//
// Pure URL resolution shared by OpenAI-compatible provider adapters.

use url::Url;

use super::error::{ProviderError, ProviderErrorKind};

/// The known endpoint types that can be resolved from a base URL.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EndpointKind {
    ChatCompletions,
    Responses,
    AnthropicMessages,
    AudioTranscriptions,
    Models,
}

impl EndpointKind {
    fn resource_path(self) -> &'static str {
        match self {
            EndpointKind::ChatCompletions => "chat/completions",
            EndpointKind::Responses => "responses",
            EndpointKind::AnthropicMessages => "messages",
            EndpointKind::AudioTranscriptions => "audio/transcriptions",
            EndpointKind::Models => "models",
        }
    }

    fn full_suffix(self) -> String {
        format!("/v1/{}", self.resource_path())
    }
}

/// Resolve a known API endpoint from a provider base URL.
///
/// # Normalisation contract
///
/// - Root (`http://example.com`), trailing root (`http://example.com/`),
///   `/v1` (`http://example.com/v1`), trailing `/v1`
///   (`http://example.com/v1/`), and the full requested endpoint
///   (`http://example.com/v1/chat/completions`) all produce the same result.
/// - Custom prefixes are preserved: `http://localhost:11434/openai` →
///   `http://localhost:11434/openai/v1/chat/completions`.
/// - Fragments are always stripped.
/// - Query strings are preserved only when the input is already the exact
///   requested full endpoint; otherwise discarded.
/// - Malformed or non-HTTP(S) input is rejected with fixed error text that
///   does not echo the input.
///
/// # Errors
///
/// Returns `ProviderError` (kind `ProviderError`) when the base URL is
/// malformed, has a non-HTTP(S) scheme, or a sibling-resolve fails.
pub fn resolve_endpoint(base_url: &str, kind: EndpointKind) -> Result<Url, ProviderError> {
    let mut url = Url::parse(base_url.trim()).map_err(|_| invalid_base_url())?;
    if !matches!(url.scheme(), "http" | "https") || url.host_str().is_none() {
        return Err(invalid_base_url());
    }

    let normalized_path = normalize_path(url.path());
    let requested_suffix = kind.full_suffix();
    let is_exact_requested_endpoint = normalized_path.ends_with(&requested_suffix);

    let api_root = strip_known_resource(&normalized_path)
        .map(|prefix| ensure_v1_root(&prefix))
        .unwrap_or_else(|| ensure_v1_root(&normalized_path));
    let resolved_path = format!("{}/{}", api_root, kind.resource_path());

    url.set_path(&resolved_path);
    url.set_fragment(None);
    if !is_exact_requested_endpoint {
        url.set_query(None);
    }

    Ok(url)
}

/// Resolve Google Gemini's model-scoped `generateContent` endpoint.
///
/// The API key is deliberately kept in a header, never in this URL. The model
/// is encoded as one path segment so custom IDs cannot alter the endpoint path.
pub fn resolve_google_generate_content(
    base_url: &str,
    model: &str,
) -> Result<Url, ProviderError> {
    let model = model.trim();
    if model.is_empty() {
        return Err(ProviderError::new(
            ProviderErrorKind::ProviderError,
            "AI 模型名称不能为空。",
            "请选择或输入一个模型。",
        ));
    }

    let mut url = Url::parse(base_url.trim()).map_err(|_| invalid_base_url())?;
    if !matches!(url.scheme(), "http" | "https") || url.host_str().is_none() {
        return Err(invalid_base_url());
    }

    let normalized_path = normalize_path(url.path());
    let encoded_model = urlencoding::encode(model);
    let resource_path = format!("models/{}:generateContent", encoded_model);
    let full_suffix = format!("/v1beta/{}", resource_path);
    let is_exact_requested_endpoint = normalized_path.ends_with(&full_suffix);
    let prefix = normalized_path
        .strip_suffix(&full_suffix)
        .unwrap_or(&normalized_path);
    let api_root = ensure_version_root(prefix, "v1beta");

    url.set_path(&format!("{}/{}", api_root, resource_path));
    url.set_fragment(None);
    if !is_exact_requested_endpoint {
        url.set_query(None);
    }
    Ok(url)
}

fn normalize_path(path: &str) -> String {
    let trimmed = path.trim_end_matches('/');
    if trimmed.is_empty() {
        String::new()
    } else {
        trimmed.to_string()
    }
}

fn strip_known_resource(path: &str) -> Option<String> {
    [
        EndpointKind::ChatCompletions,
        EndpointKind::Responses,
        EndpointKind::AnthropicMessages,
        EndpointKind::AudioTranscriptions,
        EndpointKind::Models,
    ]
    .into_iter()
    .find_map(|kind| path.strip_suffix(&kind.full_suffix()).map(str::to_string))
}

fn ensure_v1_root(path: &str) -> String {
    ensure_version_root(path, "v1")
}

fn ensure_version_root(path: &str, version: &str) -> String {
    let suffix = format!("/{version}");
    if path.ends_with(&suffix) {
        path.to_string()
    } else if path.is_empty() {
        suffix
    } else {
        format!("{path}/{version}")
    }
}

fn invalid_base_url() -> ProviderError {
    ProviderError::new(
        ProviderErrorKind::ProviderError,
        "API 基础地址无效。",
        "请输入以 http:// 或 https:// 开头的有效地址。",
    )
}
