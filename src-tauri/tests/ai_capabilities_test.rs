use std::{
    path::PathBuf,
    sync::{atomic::AtomicBool, Arc, Mutex},
};

use async_trait::async_trait;
use video_distiller_lib::{
    ai_capabilities::{
        write_capability_output, CapabilityHttpClient, CapabilityHttpRequest, CapabilityHttpResponse, ImageClient, LocalAgentClient,
        LocalAgentProcessOutput, LocalAgentProcessRunner, LocalAgentRunRequest, RankedCandidate,
        RerankClient, SearchHit, TtsClient, VectorClient, WebSearchClient, MAX_CAPABILITY_OUTPUT_BYTES, MAX_CAPABILITY_RESPONSE_BYTES,
    },
    capability_store::{ImageConfig, LocalAgentConfig, RerankConfig, TtsConfig, VectorConfig, WebSearchConfig},
    credential_store::SecretPayload,
    domain::AppError,
};

#[derive(Clone)]
struct ScriptedHttpClient {
    responses: Arc<Mutex<Vec<Result<CapabilityHttpResponse, AppError>>>>,
    requests: Arc<Mutex<Vec<CapabilityHttpRequest>>>,
}

impl ScriptedHttpClient {
    fn new(response: Result<CapabilityHttpResponse, AppError>) -> Self {
        Self {
            responses: Arc::new(Mutex::new(vec![response])),
            requests: Arc::new(Mutex::new(Vec::new())),
        }
    }
}

#[async_trait]
impl CapabilityHttpClient for ScriptedHttpClient {
    async fn execute(&self, request: CapabilityHttpRequest) -> Result<CapabilityHttpResponse, AppError> {
        self.requests.lock().unwrap().push(request);
        self.responses.lock().unwrap().remove(0)
    }
}

fn bearer() -> SecretPayload {
    SecretPayload::Bearer {
        api_key: "secret-value".into(),
    }
}

#[tokio::test]
async fn vector_search_normalizes_payload_and_parses_bounded_hits() {
    let http = ScriptedHttpClient::new(Ok(CapabilityHttpResponse {
        status: 200,
        content_type: "application/json".into(),
        body: br#"{"data":[{"id":"n2","score":0.91,"text":"best"},{"id":"n1","score":0.7,"text":"other"}]}"#.to_vec(),
    }));
    let client = VectorClient::new(
        Arc::new(http.clone()),
        VectorConfig {
            enabled: true,
            provider_id: "custom-vector".into(),
            endpoint: "https://example.test/v1/search".into(),
            model: "embed-small".into(),
            collection: "notes".into(),
            dimensions: None,
        },
        bearer(),
    );

    let hits = client.search("query", 5).await.unwrap();

    assert_eq!(hits, vec![
        SearchHit { id: "n2".into(), score: 0.91, text: "best".into() },
        SearchHit { id: "n1".into(), score: 0.7, text: "other".into() },
    ]);
    let request = http.requests.lock().unwrap().pop().unwrap();
    assert_eq!(request.url, "https://example.test/v1/search");
    assert_eq!(request.bearer_token.as_deref(), Some("secret-value"));
    assert_eq!(request.json["query"], "query");
    assert_eq!(request.json["limit"], 5);
    assert_eq!(request.json["collection"], "notes");
}

#[tokio::test]
async fn reranker_sorts_provider_results_by_score() {
    let http = ScriptedHttpClient::new(Ok(CapabilityHttpResponse {
        status: 200,
        content_type: "application/json".into(),
        body: br#"{"results":[{"id":"second","score":0.2},{"id":"best","score":0.95}]}"#.to_vec(),
    }));
    let client = RerankClient::new(
        Arc::new(http),
        RerankConfig {
            enabled: true,
            provider_id: "rerank".into(),
            endpoint: "https://example.test/v1/rerank".into(),
            model: "rerank-v3".into(),
        },
        bearer(),
    );

    let ranked = client
        .rank(&[
            RankedCandidate { id: "best".into(), text: "A".into(), score: 0.0 },
            RankedCandidate { id: "second".into(), text: "B".into(), score: 0.0 },
        ])
        .await
        .unwrap();

    assert_eq!(ranked[0].id, "best");
    assert_eq!(ranked[0].score, 0.95);
}

#[tokio::test]
async fn malformed_oversized_and_transport_failures_are_redacted() {
    let oversized = ScriptedHttpClient::new(Ok(CapabilityHttpResponse {
        status: 200,
        content_type: "application/json".into(),
        body: vec![b'x'; MAX_CAPABILITY_RESPONSE_BYTES + 1],
    }));
    let config = VectorConfig {
        enabled: true,
        provider_id: "vector".into(),
        endpoint: "https://secret-host.example/v1/search".into(),
        model: "embed".into(),
        collection: "notes".into(),
        dimensions: None,
    };

    let error = VectorClient::new(Arc::new(oversized), config.clone(), bearer())
        .search("query", 5)
        .await
        .unwrap_err();
    let text = format!("{} {} {}", error.code, error.message, error.recovery);
    assert!(!text.contains("secret-value"));
    assert!(!text.contains("secret-host"));

    let malformed = ScriptedHttpClient::new(Ok(CapabilityHttpResponse {
        status: 200,
        content_type: "application/json".into(),
        body: br#"{"data":"wrong"}"#.to_vec(),
    }));
    assert_eq!(
        VectorClient::new(Arc::new(malformed), config, bearer())
            .search("query", 5)
            .await
            .unwrap_err()
            .code,
        "capability_response_invalid"
    );
}

#[tokio::test]
async fn scripted_transport_error_text_is_never_exposed() {
    let http = ScriptedHttpClient::new(Err(AppError::new(
        "raw_transport",
        "secret-value at https://secret-host.example failed",
        "retry with secret-value",
    )));
    let client = VectorClient::new(
        Arc::new(http),
        VectorConfig {
            enabled: true,
            provider_id: "vector".into(),
            endpoint: "https://secret-host.example/v1/search".into(),
            model: "embed".into(),
            collection: "notes".into(),
            dimensions: None,
        },
        bearer(),
    );

    let error = client.search("query", 5).await.unwrap_err();
    let text = format!("{} {} {}", error.code, error.message, error.recovery);
    assert!(!text.contains("secret-value"));
    assert!(!text.contains("secret-host"));
    assert_eq!(error.code, "capability_transport_error");
}

#[tokio::test]
async fn web_tts_and_image_clients_normalize_supported_response_formats() {
    let web_http = ScriptedHttpClient::new(Ok(CapabilityHttpResponse {
        status: 200,
        content_type: "application/json".into(),
        body: br#"{"results":[{"title":"Result","url":"https://example.test/doc","snippet":"Text"}]}"#.to_vec(),
    }));
    let web = WebSearchClient::new(
        Arc::new(web_http),
        WebSearchConfig {
            enabled: true,
            provider_id: "web".into(),
            endpoint: "https://example.test/search".into(),
            max_results: 5,
        },
        bearer(),
    );
    assert_eq!(web.search("query").await.unwrap()[0].title, "Result");

    let tts_http = ScriptedHttpClient::new(Ok(CapabilityHttpResponse {
        status: 200,
        content_type: "application/json".into(),
        body: br#"{"audio_base64":"AQID"}"#.to_vec(),
    }));
    let tts = TtsClient::new(
        Arc::new(tts_http),
        TtsConfig {
            enabled: true,
            provider_id: "tts".into(),
            endpoint: "https://example.test/speech".into(),
            model: "tts-1".into(),
            voice: "alloy".into(),
        },
        bearer(),
    );
    assert_eq!(tts.synthesize("hello").await.unwrap(), vec![1, 2, 3]);

    let image_http = ScriptedHttpClient::new(Ok(CapabilityHttpResponse {
        status: 200,
        content_type: "image/png".into(),
        body: vec![0x89, b'P', b'N', b'G'],
    }));
    let image = ImageClient::new(
        Arc::new(image_http),
        ImageConfig {
            enabled: true,
            provider_id: "image".into(),
            endpoint: "https://example.test/image".into(),
            model: "image-1".into(),
            size: "1024x1024".into(),
        },
        bearer(),
    );
    assert_eq!(image.generate("cover").await.unwrap(), vec![0x89, b'P', b'N', b'G']);
}

#[test]
fn bounded_generated_outputs_are_confined_to_the_app_owned_root() {
    let root = tempfile::tempdir().unwrap();
    let path = write_capability_output(root.path(), "speech", "mp3", b"audio").unwrap();
    assert!(path.starts_with(root.path().join("capability-outputs").join("speech")));
    assert_eq!(std::fs::read(path).unwrap(), b"audio");
    assert_eq!(
        write_capability_output(root.path(), "../outside", "mp3", b"audio")
            .unwrap_err()
            .code,
        "capability_invalid_request"
    );
    assert_eq!(
        write_capability_output(
            root.path(),
            "speech",
            "mp3",
            &vec![0_u8; MAX_CAPABILITY_OUTPUT_BYTES + 1],
        )
        .unwrap_err()
        .code,
        "capability_invalid_request"
    );
}

#[derive(Clone, Default)]
struct FakeAgentRunner {
    requests: Arc<Mutex<Vec<LocalAgentRunRequest>>>,
}

impl LocalAgentProcessRunner for FakeAgentRunner {
    fn run(
        &self,
        request: LocalAgentRunRequest,
        _cancel: &AtomicBool,
    ) -> Result<LocalAgentProcessOutput, AppError> {
        self.requests.lock().unwrap().push(request.clone());
        Ok(LocalAgentProcessOutput {
            status: 0,
            stdout: br#"{"answer":"done"}"#.to_vec(),
            stderr: Vec::new(),
        })
    }
}

#[test]
fn local_agent_uses_fixed_program_and_argument_vector_without_shell() {
    let runner = FakeAgentRunner::default();
    let root = tempfile::tempdir().unwrap();
    let client = LocalAgentClient::new(
        Arc::new(runner.clone()),
        LocalAgentConfig {
            enabled: true,
            provider_id: "codex".into(),
            executable: "C:\\Tools\\codex.exe".into(),
            arguments: vec!["exec".into(), "--json".into()],
            timeout_seconds: 120,
        },
        root.path().to_path_buf(),
    );

    let result = client.run("summarize this", &AtomicBool::new(false)).unwrap();

    assert_eq!(result.answer, "done");
    let request = runner.requests.lock().unwrap().pop().unwrap();
    assert_eq!(request.program, PathBuf::from("C:\\Tools\\codex.exe"));
    assert_eq!(request.args, vec!["exec", "--json"]);
    assert_eq!(request.stdin, b"summarize this");
    assert!(request.output_dir.starts_with(root.path()));
    assert!(!request.args.iter().any(|arg| arg.contains("&&") || arg.contains('|')));
}
