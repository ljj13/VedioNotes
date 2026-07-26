//! AI 扩展能力后端——实现向量搜索、重排、联网、语音合成、AI 作图、本地智能体的后端逻辑.

use crate::{
    capability_store::{
        ImageConfig, LocalAgentConfig, RerankConfig, TtsConfig, VectorConfig, WebSearchConfig,
    },
    credential_store::SecretPayload,
    domain::AppError,
    process_utils::hidden_command,
};
use async_trait::async_trait;
use base64::Engine;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    ffi::OsString,
    io::{Read, Write},
    path::{Path, PathBuf},
    process::{Stdio},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
    time::{Duration, Instant},
};

/// MAX CAPABILITY RESPONSE BYTES
pub const MAX_CAPABILITY_RESPONSE_BYTES: usize = 2 * 1024 * 1024;
/// MAX CAPABILITY OUTPUT BYTES
pub const MAX_CAPABILITY_OUTPUT_BYTES: usize = 16 * 1024 * 1024;

#[derive(Debug, Clone, PartialEq)]
/// CapabilityHttpRequest
pub struct CapabilityHttpRequest {
    pub url: String,
    pub bearer_token: Option<String>,
    pub json: Value,
    pub timeout: Duration,
}

#[derive(Debug, Clone, PartialEq, Eq)]
/// CapabilityHttpResponse
pub struct CapabilityHttpResponse {
    pub status: u16,
    pub content_type: String,
    pub body: Vec<u8>,
}

#[async_trait]
/// CapabilityHttpClient
pub trait CapabilityHttpClient: Send + Sync {
    async fn execute(
        &self,
        request: CapabilityHttpRequest,
    ) -> Result<CapabilityHttpResponse, AppError>;
}

#[derive(Debug, Default)]
/// ReqwestCapabilityHttpClient
pub struct ReqwestCapabilityHttpClient;

#[async_trait]
impl CapabilityHttpClient for ReqwestCapabilityHttpClient {
    async fn execute(
        &self,
        request: CapabilityHttpRequest,
    ) -> Result<CapabilityHttpResponse, AppError> {
        validate_http_url(&request.url)?;
        let client = reqwest::Client::builder()
            .connect_timeout(Duration::from_secs(10))
            .timeout(request.timeout)
            .build()
            .map_err(|_| capability_transport_error())?;
        let mut builder = client.post(&request.url).json(&request.json);
        if let Some(token) = request.bearer_token.as_deref() {
            builder = builder.bearer_auth(token);
        }
        let mut response = builder
            .send()
            .await
            .map_err(|_| capability_transport_error())?;
        if response
            .content_length()
            .is_some_and(|length| length > MAX_CAPABILITY_RESPONSE_BYTES as u64)
        {
            return Err(response_too_large());
        }
        let status = response.status().as_u16();
        let content_type = response
            .headers()
            .get(reqwest::header::CONTENT_TYPE)
            .and_then(|value| value.to_str().ok())
            .unwrap_or_default()
            .to_string();
        let mut body = Vec::new();
        while let Some(chunk) = response
            .chunk()
            .await
            .map_err(|_| capability_transport_error())?
        {
            if body.len().saturating_add(chunk.len()) > MAX_CAPABILITY_RESPONSE_BYTES {
                return Err(response_too_large());
            }
            body.extend_from_slice(&chunk);
        }
        Ok(CapabilityHttpResponse {
            status,
            content_type,
            body,
        })
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
/// SearchHit
pub struct SearchHit {
    pub id: String,
    pub score: f64,
    pub text: String,
}

/// VectorClient
pub struct VectorClient {
    http: Arc<dyn CapabilityHttpClient>,
    config: VectorConfig,
    token: String,
}

impl VectorClient {
    /// new
    pub fn new(
        http: Arc<dyn CapabilityHttpClient>,
        config: VectorConfig,
        secret: SecretPayload,
    ) -> Self {
        Self {
            http,
            config,
            token: bearer_token(secret),
        }
    }

    /// search
    pub async fn search(&self, query: &str, limit: usize) -> Result<Vec<SearchHit>, AppError> {
        if query.trim().is_empty() || !(1..=50).contains(&limit) {
            return Err(capability_invalid_request());
        }
        let response = execute_sanitized(
            self.http.as_ref(),
            CapabilityHttpRequest {
                url: self.config.endpoint.clone(),
                bearer_token: Some(self.token.clone()),
                json: json!({
                    "model": self.config.model,
                    "collection": self.config.collection,
                    "query": query,
                    "limit": limit,
                }),
                timeout: Duration::from_secs(30),
            },
        )
        .await?;
        parse_json_response::<SearchEnvelope>(response).map(|envelope| envelope.data)
    }

    /// index
    pub async fn index(&self, id: &str, text: &str) -> Result<(), AppError> {
        if id.trim().is_empty() || text.trim().is_empty() || text.len() > 2_000_000 {
            return Err(capability_invalid_request());
        }
        let response = execute_sanitized(
            self.http.as_ref(),
            CapabilityHttpRequest {
                url: self.config.endpoint.clone(),
                bearer_token: Some(self.token.clone()),
                json: json!({
                    "model": self.config.model,
                    "collection": self.config.collection,
                    "documents": [{ "id": id, "text": text }],
                }),
                timeout: Duration::from_secs(30),
            },
        )
        .await?;
        require_success(response)?;
        Ok(())
    }
}

#[derive(Deserialize)]
struct SearchEnvelope {
    data: Vec<SearchHit>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
/// RankedCandidate
pub struct RankedCandidate {
    pub id: String,
    pub text: String,
    pub score: f64,
}

/// RerankClient
pub struct RerankClient {
    http: Arc<dyn CapabilityHttpClient>,
    config: RerankConfig,
    token: String,
}

impl RerankClient {
    /// new
    pub fn new(
        http: Arc<dyn CapabilityHttpClient>,
        config: RerankConfig,
        secret: SecretPayload,
    ) -> Self {
        Self {
            http,
            config,
            token: bearer_token(secret),
        }
    }

    /// rank
    pub async fn rank(
        &self,
        candidates: &[RankedCandidate],
    ) -> Result<Vec<RankedCandidate>, AppError> {
        if candidates.is_empty() || candidates.len() > 100 {
            return Err(capability_invalid_request());
        }
        let response = execute_sanitized(
            self.http.as_ref(),
            CapabilityHttpRequest {
                url: self.config.endpoint.clone(),
                bearer_token: Some(self.token.clone()),
                json: json!({
                    "model": self.config.model,
                    "documents": candidates.iter().map(|candidate| json!({"id": candidate.id, "text": candidate.text})).collect::<Vec<_>>(),
                }),
                timeout: Duration::from_secs(30),
            },
        )
        .await?;
        let results = parse_json_response::<RerankEnvelope>(response)?.results;
        let mut ranked = Vec::with_capacity(results.len());
        for result in results {
            let source = candidates
                .iter()
                .find(|candidate| candidate.id == result.id)
                .ok_or_else(response_invalid)?;
            ranked.push(RankedCandidate {
                id: source.id.clone(),
                text: source.text.clone(),
                score: result.score,
            });
        }
        ranked.sort_by(|left, right| {
            right
                .score
                .partial_cmp(&left.score)
                .unwrap_or(std::cmp::Ordering::Equal)
        });
        Ok(ranked)
    }
}

#[derive(Deserialize)]
struct RerankEnvelope {
    results: Vec<RerankScore>,
}

#[derive(Deserialize)]
struct RerankScore {
    id: String,
    score: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
/// WebSearchResult
pub struct WebSearchResult {
    pub title: String,
    pub url: String,
    pub snippet: String,
}

/// WebSearchClient
pub struct WebSearchClient {
    http: Arc<dyn CapabilityHttpClient>,
    config: WebSearchConfig,
    token: String,
}

impl WebSearchClient {
    /// new
    pub fn new(
        http: Arc<dyn CapabilityHttpClient>,
        config: WebSearchConfig,
        secret: SecretPayload,
    ) -> Self {
        Self {
            http,
            config,
            token: bearer_token(secret),
        }
    }

    /// search
    pub async fn search(&self, query: &str) -> Result<Vec<WebSearchResult>, AppError> {
        if query.trim().is_empty() {
            return Err(capability_invalid_request());
        }
        let response = execute_sanitized(
            self.http.as_ref(),
            CapabilityHttpRequest {
                url: self.config.endpoint.clone(),
                bearer_token: Some(self.token.clone()),
                json: json!({"query": query, "max_results": self.config.max_results}),
                timeout: Duration::from_secs(30),
            },
        )
        .await?;
        parse_json_response::<WebSearchEnvelope>(response).map(|envelope| envelope.results)
    }
}

#[derive(Deserialize)]
struct WebSearchEnvelope {
    results: Vec<WebSearchResult>,
}

/// TtsClient
pub struct TtsClient {
    http: Arc<dyn CapabilityHttpClient>,
    config: TtsConfig,
    token: String,
}

impl TtsClient {
    /// new
    pub fn new(
        http: Arc<dyn CapabilityHttpClient>,
        config: TtsConfig,
        secret: SecretPayload,
    ) -> Self {
        Self {
            http,
            config,
            token: bearer_token(secret),
        }
    }

    /// synthesize
    pub async fn synthesize(&self, text: &str) -> Result<Vec<u8>, AppError> {
        if text.trim().is_empty() || text.len() > 100_000 {
            return Err(capability_invalid_request());
        }
        let response = execute_sanitized(
            self.http.as_ref(),
            CapabilityHttpRequest {
                url: self.config.endpoint.clone(),
                bearer_token: Some(self.token.clone()),
                json: json!({"model": self.config.model, "voice": self.config.voice, "input": text}),
                timeout: Duration::from_secs(60),
            },
        )
        .await?;
        parse_binary_or_base64(response, "audio/", "audio_base64")
    }
}

/// ImageClient
pub struct ImageClient {
    http: Arc<dyn CapabilityHttpClient>,
    config: ImageConfig,
    token: String,
}

impl ImageClient {
    /// new
    pub fn new(
        http: Arc<dyn CapabilityHttpClient>,
        config: ImageConfig,
        secret: SecretPayload,
    ) -> Self {
        Self {
            http,
            config,
            token: bearer_token(secret),
        }
    }

    /// generate
    pub async fn generate(&self, prompt: &str) -> Result<Vec<u8>, AppError> {
        if prompt.trim().is_empty() || prompt.len() > 100_000 {
            return Err(capability_invalid_request());
        }
        let response = execute_sanitized(
            self.http.as_ref(),
            CapabilityHttpRequest {
                url: self.config.endpoint.clone(),
                bearer_token: Some(self.token.clone()),
                json: json!({"model": self.config.model, "size": self.config.size, "prompt": prompt}),
                timeout: Duration::from_secs(120),
            },
        )
        .await?;
        parse_binary_or_base64(response, "image/", "image_base64")
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
/// LocalAgentRunRequest
pub struct LocalAgentRunRequest {
    pub program: PathBuf,
    pub args: Vec<String>,
    pub stdin: Vec<u8>,
    pub output_dir: PathBuf,
    pub timeout: Duration,
}

#[derive(Debug, Clone, PartialEq, Eq)]
/// LocalAgentProcessOutput
pub struct LocalAgentProcessOutput {
    pub status: i32,
    pub stdout: Vec<u8>,
    pub stderr: Vec<u8>,
}

/// LocalAgentProcessRunner
pub trait LocalAgentProcessRunner: Send + Sync {
    fn run(
        &self,
        request: LocalAgentRunRequest,
        cancel: &AtomicBool,
    ) -> Result<LocalAgentProcessOutput, AppError>;
}

#[derive(Debug, Default)]
/// CommandLocalAgentProcessRunner
pub struct CommandLocalAgentProcessRunner;

impl LocalAgentProcessRunner for CommandLocalAgentProcessRunner {
    fn run(
        &self,
        request: LocalAgentRunRequest,
        cancel: &AtomicBool,
    ) -> Result<LocalAgentProcessOutput, AppError> {
        if cancel.load(Ordering::SeqCst) {
            return Err(capability_cancelled());
        }
        let mut child = hidden_command(&request.program)
            .args(request.args.iter().map(OsString::from))
            .current_dir(&request.output_dir)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|_| local_agent_error())?;
        if let Some(mut stdin) = child.stdin.take() {
            stdin
                .write_all(&request.stdin)
                .map_err(|_| local_agent_error())?;
        }
        let stdout = child.stdout.take().ok_or_else(local_agent_error)?;
        let stderr = child.stderr.take().ok_or_else(local_agent_error)?;
        let stdout_thread = std::thread::spawn(move || read_bounded(stdout));
        let stderr_thread = std::thread::spawn(move || read_bounded(stderr));
        let started = Instant::now();
        let status = loop {
            if cancel.load(Ordering::SeqCst) {
                let _ = child.kill();
                let _ = child.wait();
                return Err(capability_cancelled());
            }
            if started.elapsed() > request.timeout {
                let _ = child.kill();
                let _ = child.wait();
                return Err(capability_timeout());
            }
            if let Some(status) = child.try_wait().map_err(|_| local_agent_error())? {
                break status.code().unwrap_or(-1);
            }
            std::thread::sleep(Duration::from_millis(20));
        };
        let stdout = stdout_thread
            .join()
            .map_err(|_| local_agent_error())??;
        let stderr = stderr_thread
            .join()
            .map_err(|_| local_agent_error())??;
        Ok(LocalAgentProcessOutput {
            status,
            stdout,
            stderr,
        })
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
/// LocalAgentResult
pub struct LocalAgentResult {
    pub answer: String,
}

/// LocalAgentClient
pub struct LocalAgentClient {
    runner: Arc<dyn LocalAgentProcessRunner>,
    config: LocalAgentConfig,
    output_root: PathBuf,
}

impl LocalAgentClient {
    /// new
    pub fn new(
        runner: Arc<dyn LocalAgentProcessRunner>,
        config: LocalAgentConfig,
        output_root: PathBuf,
    ) -> Self {
        Self {
            runner,
            config,
            output_root,
        }
    }

    /// run
    pub fn run(&self, prompt: &str, cancel: &AtomicBool) -> Result<LocalAgentResult, AppError> {
        if prompt.trim().is_empty() || prompt.len() > 1_000_000 {
            return Err(capability_invalid_request());
        }
        let output_dir = self
            .output_root
            .join("local-agent")
            .join(uuid::Uuid::new_v4().to_string());
        std::fs::create_dir_all(&output_dir).map_err(|_| local_agent_error())?;
        let output = self.runner.run(
            LocalAgentRunRequest {
                program: PathBuf::from(&self.config.executable),
                args: self.config.arguments.clone(),
                stdin: prompt.as_bytes().to_vec(),
                output_dir,
                timeout: Duration::from_secs(self.config.timeout_seconds),
            },
            cancel,
        )?;
        if output.status != 0 || output.stdout.len() > MAX_CAPABILITY_RESPONSE_BYTES {
            return Err(local_agent_error());
        }
        serde_json::from_slice(&output.stdout).map_err(|_| response_invalid())
    }
}

/// write capability output
pub fn write_capability_output(
    app_data_root: &Path,
    category: &str,
    extension: &str,
    bytes: &[u8],
) -> Result<PathBuf, AppError> {
    if bytes.is_empty()
        || bytes.len() > MAX_CAPABILITY_OUTPUT_BYTES
        || !category
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || character == '-')
        || !extension.chars().all(|character| character.is_ascii_alphanumeric())
    {
        return Err(capability_invalid_request());
    }
    let directory = app_data_root.join("capability-outputs").join(category);
    std::fs::create_dir_all(&directory).map_err(|_| capability_output_error())?;
    let path = directory.join(format!("{}.{}", uuid::Uuid::new_v4(), extension));
    std::fs::write(&path, bytes).map_err(|_| capability_output_error())?;
    Ok(path)
}

fn parse_json_response<T: for<'de> Deserialize<'de>>(
    response: CapabilityHttpResponse,
) -> Result<T, AppError> {
    require_success(response.clone())?;
    if response.body.len() > MAX_CAPABILITY_RESPONSE_BYTES
        || !response.content_type.to_ascii_lowercase().contains("json")
    {
        return Err(response_invalid());
    }
    serde_json::from_slice(&response.body).map_err(|_| response_invalid())
}

async fn execute_sanitized(
    http: &dyn CapabilityHttpClient,
    request: CapabilityHttpRequest,
) -> Result<CapabilityHttpResponse, AppError> {
    http.execute(request)
        .await
        .map_err(|_| capability_transport_error())
}

fn require_success(response: CapabilityHttpResponse) -> Result<(), AppError> {
    if response.body.len() > MAX_CAPABILITY_RESPONSE_BYTES {
        return Err(response_too_large());
    }
    if !(200..300).contains(&response.status) {
        return Err(capability_provider_error());
    }
    Ok(())
}

fn parse_binary_or_base64(
    response: CapabilityHttpResponse,
    binary_prefix: &str,
    json_field: &str,
) -> Result<Vec<u8>, AppError> {
    require_success(response.clone())?;
    if response.content_type.to_ascii_lowercase().starts_with(binary_prefix) {
        return Ok(response.body);
    }
    if !response.content_type.to_ascii_lowercase().contains("json") {
        return Err(response_invalid());
    }
    let value: Value = serde_json::from_slice(&response.body).map_err(|_| response_invalid())?;
    let encoded = value
        .get(json_field)
        .and_then(Value::as_str)
        .ok_or_else(response_invalid)?;
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(encoded)
        .map_err(|_| response_invalid())?;
    if bytes.is_empty() || bytes.len() > MAX_CAPABILITY_OUTPUT_BYTES {
        return Err(response_invalid());
    }
    Ok(bytes)
}

fn bearer_token(secret: SecretPayload) -> String {
    match secret {
        SecretPayload::Bearer { api_key } => api_key,
        SecretPayload::Tencent { .. } => String::new(),
    }
}

fn validate_http_url(value: &str) -> Result<(), AppError> {
    let url = url::Url::parse(value).map_err(|_| capability_invalid_request())?;
    let host = url.host_str().ok_or_else(capability_invalid_request)?;
    let local = matches!(host, "localhost" | "127.0.0.1" | "::1");
    if url.scheme() != "https" && !(url.scheme() == "http" && local) {
        return Err(capability_invalid_request());
    }
    Ok(())
}

fn read_bounded(mut reader: impl Read) -> Result<Vec<u8>, AppError> {
    let mut output = Vec::new();
    let mut buffer = [0_u8; 8192];
    loop {
        let count = reader.read(&mut buffer).map_err(|_| local_agent_error())?;
        if count == 0 {
            return Ok(output);
        }
        if output.len().saturating_add(count) > MAX_CAPABILITY_RESPONSE_BYTES {
            return Err(response_too_large());
        }
        output.extend_from_slice(&buffer[..count]);
    }
}

fn capability_invalid_request() -> AppError {
    AppError::new(
        "capability_invalid_request",
        "AI 能力请求无效。",
        "请检查输入和能力配置。",
    )
}

fn capability_transport_error() -> AppError {
    AppError::new(
        "capability_transport_error",
        "AI 能力服务暂时不可用。",
        "请检查网络和服务配置后重试。",
    )
}

fn capability_provider_error() -> AppError {
    AppError::new(
        "capability_provider_error",
        "AI 能力服务返回错误。",
        "请检查服务凭据、额度和模型配置。",
    )
}

fn response_invalid() -> AppError {
    AppError::new(
        "capability_response_invalid",
        "AI 能力服务响应无效。",
        "请检查服务兼容性后重试。",
    )
}

fn response_too_large() -> AppError {
    AppError::new(
        "capability_response_too_large",
        "AI 能力服务响应过大。",
        "请缩小请求范围后重试。",
    )
}

fn capability_timeout() -> AppError {
    AppError::new(
        "capability_timeout",
        "AI 能力操作超时。",
        "请缩小任务或稍后重试。",
    )
}

fn capability_cancelled() -> AppError {
    AppError::new(
        "capability_cancelled",
        "AI 能力操作已取消。",
        "可在需要时重新运行。",
    )
}

fn local_agent_error() -> AppError {
    AppError::new(
        "local_agent_error",
        "本地代理执行失败。",
        "请检查本地代理路径和参数。",
    )
}

fn capability_output_error() -> AppError {
    AppError::new(
        "capability_output_error",
        "AI 能力输出无法保存。",
        "请检查应用数据目录权限。",
    )
}
