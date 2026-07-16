// == Stage 00 Spike — Endpoint Normalization Contract =========================
//
// Minimal pure-Rust URL-normalization tests that prove:
//   - Root, trailing root, `/v1`, trailing `/v1`, and full requested endpoint
//     normalise identically.
//   - A known full endpoint resolves a sibling resource.
//   - Custom prefixes and ports are preserved.
//   - Malformed/non-HTTP(S) input is rejected with fixed error text that does
//     not echo the input or query.
//   - Fragments are cleared; queries are preserved only when the input is
//     already the exact requested full endpoint.
//
// No Wiremock, no HTTP, no remote APIs — pure local unit tests.

use video_distiller_lib::providers::endpoint::{resolve_endpoint, resolve_google_generate_content, EndpointKind};
use video_distiller_lib::providers::error::ProviderError;

// =========================================================================
//  1. EndpointKind enum exists with expected variants
// =========================================================================

#[test]
fn endpoint_kind_has_expected_variants() {
    // Compile-time assertion: these must compile without error.
    let _chat = EndpointKind::ChatCompletions;
    let _audio = EndpointKind::AudioTranscriptions;
    let _models = EndpointKind::Models;

    // Verify Debug/Clone/Copy/PartialEq at runtime.
    assert_eq!(
        format!("{:?}", EndpointKind::ChatCompletions),
        "ChatCompletions"
    );
    assert_eq!(
        format!("{:?}", EndpointKind::AudioTranscriptions),
        "AudioTranscriptions"
    );
    assert_eq!(format!("{:?}", EndpointKind::Models), "Models");
}

// =========================================================================
//  2. Root variants normalise identically for each kind
// =========================================================================

#[test]
fn root_and_trailing_root_produce_same_chat_url() {
    let a = resolve_endpoint("http://example.com", EndpointKind::ChatCompletions).unwrap();
    let b = resolve_endpoint("http://example.com/", EndpointKind::ChatCompletions).unwrap();
    assert_eq!(a.as_str(), b.as_str());
    assert_eq!(a.as_str(), "http://example.com/v1/chat/completions");
}

#[test]
fn root_and_trailing_root_produce_same_audio_url() {
    let a = resolve_endpoint("http://example.com", EndpointKind::AudioTranscriptions).unwrap();
    let b = resolve_endpoint("http://example.com/", EndpointKind::AudioTranscriptions).unwrap();
    assert_eq!(a.as_str(), b.as_str());
    assert_eq!(a.as_str(), "http://example.com/v1/audio/transcriptions");
}

#[test]
fn root_and_trailing_root_produce_same_models_url() {
    let a = resolve_endpoint("http://example.com", EndpointKind::Models).unwrap();
    let b = resolve_endpoint("http://example.com/", EndpointKind::Models).unwrap();
    assert_eq!(a.as_str(), b.as_str());
    assert_eq!(a.as_str(), "http://example.com/v1/models");
}

// =========================================================================
//  3. `/v1` and trailing `/v1` normalise identically
// =========================================================================

#[test]
fn v1_and_trailing_v1_produce_same_url() {
    let a = resolve_endpoint("http://example.com/v1", EndpointKind::ChatCompletions).unwrap();
    let b = resolve_endpoint("http://example.com/v1/", EndpointKind::ChatCompletions).unwrap();
    assert_eq!(a.as_str(), b.as_str());
    assert_eq!(a.as_str(), "http://example.com/v1/chat/completions");
}

// =========================================================================
//  4. Full known endpoint normalises the same as root + kind
// =========================================================================

#[test]
fn full_endpoint_normalises_identically_to_root() {
    let from_root = resolve_endpoint("http://example.com", EndpointKind::ChatCompletions).unwrap();
    let from_full = resolve_endpoint(
        "http://example.com/v1/chat/completions",
        EndpointKind::ChatCompletions,
    )
    .unwrap();
    assert_eq!(from_root.as_str(), from_full.as_str());
    assert_eq!(from_full.as_str(), "http://example.com/v1/chat/completions");
}

// =========================================================================
//  5. Sibling resource: `/v1/chat/completions` to `/v1/models`
// =========================================================================

#[test]
fn sibling_resource_from_known_full_endpoint() {
    let url = resolve_endpoint(
        "http://example.com/v1/chat/completions",
        EndpointKind::Models,
    )
    .unwrap();
    assert_eq!(url.as_str(), "http://example.com/v1/models");
}

// =========================================================================
//  6. Custom prefix with port preserved
// =========================================================================

#[test]
fn custom_prefix_with_port_preserved() {
    let url = resolve_endpoint(
        "http://localhost:11434/openai",
        EndpointKind::ChatCompletions,
    )
    .unwrap();
    assert_eq!(
        url.as_str(),
        "http://localhost:11434/openai/v1/chat/completions"
    );
}

#[test]
fn custom_prefix_with_port_preserved_audio() {
    let url = resolve_endpoint(
        "http://localhost:11434/openai",
        EndpointKind::AudioTranscriptions,
    )
    .unwrap();
    assert_eq!(
        url.as_str(),
        "http://localhost:11434/openai/v1/audio/transcriptions"
    );
}

// =========================================================================
//  7. Malformed URL rejection
// =========================================================================

/// Secret marker that must NOT appear in error message or recovery fields.
const SECRET_MARKER: &str = "s3cr3t-api-key-please-dont-leak-me";

#[test]
fn malformed_url_does_not_echo_input() {
    let bad_input = format!("not a url {}", SECRET_MARKER);
    let err = resolve_endpoint(&bad_input, EndpointKind::ChatCompletions).unwrap_err();

    let msg = format!("{}", err);
    assert!(
        !msg.contains(SECRET_MARKER),
        "error message must not contain secret marker: {}",
        msg
    );

    let msg_no_marker = msg.replace(SECRET_MARKER, "");
    assert_eq!(
        msg, msg_no_marker,
        "secret marker appeared in error message"
    );
}

#[test]
fn malformed_url_with_query_does_not_echo_input() {
    let bad_input = format!("://invalid?api_key={}", SECRET_MARKER);
    let err = resolve_endpoint(&bad_input, EndpointKind::Models).unwrap_err();

    let msg = format!("{}", err);
    assert!(
        !msg.contains(SECRET_MARKER),
        "error message must not contain query-embedded API key: {}",
        msg
    );
}

#[test]
fn non_https_scheme_rejected() {
    let err = resolve_endpoint("ftp://example.com/v1", EndpointKind::ChatCompletions).unwrap_err();
    let msg = format!("{}", err);
    // ftp is neither http nor https
    assert!(
        msg.contains("http") || msg.contains("HTTP"),
        "error should mention http/https: {}",
        msg
    );
}

#[test]
fn completely_garbage_input_rejected() {
    let err = resolve_endpoint("not a url at all", EndpointKind::ChatCompletions).unwrap_err();
    let msg = format!("{}", err);
    assert!(
        !msg.contains("not a url at all"),
        "error must not echo input: {}",
        msg
    );
}

// =========================================================================
//  8. Fragment clearing
// =========================================================================

#[test]
fn fragment_cleared_when_not_full_endpoint() {
    let url = resolve_endpoint(
        "http://example.com/v1#section",
        EndpointKind::ChatCompletions,
    )
    .unwrap();
    // No fragment should be present in the resolved URL.
    assert!(
        !url.as_str().contains('#'),
        "fragment must be cleared: {}",
        url
    );
    assert_eq!(url.fragment(), None);
    assert_eq!(url.as_str(), "http://example.com/v1/chat/completions");
}

#[test]
fn fragment_cleared_when_full_endpoint() {
    let url = resolve_endpoint(
        "http://example.com/v1/chat/completions#section",
        EndpointKind::ChatCompletions,
    )
    .unwrap();
    assert!(
        !url.as_str().contains('#'),
        "fragment must be cleared: {}",
        url
    );
    assert_eq!(url.fragment(), None);
    assert_eq!(url.as_str(), "http://example.com/v1/chat/completions");
}

// =========================================================================
//  9. Query string handling
// =========================================================================

#[test]
fn query_preserved_when_input_is_exact_full_endpoint() {
    let url = resolve_endpoint(
        "http://example.com/v1/chat/completions?model=deepseek",
        EndpointKind::ChatCompletions,
    )
    .unwrap();
    assert_eq!(
        url.as_str(),
        "http://example.com/v1/chat/completions?model=deepseek"
    );
}

#[test]
fn query_discarded_for_sibling_resource() {
    let url = resolve_endpoint(
        "http://example.com/v1/chat/completions?model=deepseek",
        EndpointKind::Models,
    )
    .unwrap();
    assert_eq!(url.as_str(), "http://example.com/v1/models");
    assert_eq!(
        url.query(),
        None,
        "query must be discarded for sibling resource"
    );
}

#[test]
fn query_discarded_when_base_has_query_but_not_full_endpoint() {
    let url = resolve_endpoint(
        "http://example.com/v1?api_key=secret",
        EndpointKind::ChatCompletions,
    )
    .unwrap();
    assert_eq!(url.as_str(), "http://example.com/v1/chat/completions");
    assert_eq!(
        url.query(),
        None,
        "query must be discarded when base has query but is not the full requested endpoint"
    );
}

// =========================================================================
//  10. Error type is ProviderError
// =========================================================================

#[test]
fn error_type_is_provider_error() {
    let err = resolve_endpoint("not a url", EndpointKind::ChatCompletions).unwrap_err();
    // Must be a ProviderError (not any other error type).
    let _: &ProviderError = &err;
}

#[test]
fn standard_summary_protocol_endpoints_normalize_root_version_and_full_urls() {
    let cases = [
        (EndpointKind::Responses, "responses"),
        (EndpointKind::AnthropicMessages, "messages"),
    ];
    for (kind, resource) in cases {
        let expected = format!("https://example.com/v1/{resource}");
        for input in [
            "https://example.com",
            "https://example.com/v1",
            expected.as_str(),
        ] {
            assert_eq!(resolve_endpoint(input, kind).unwrap().as_str(), expected);
        }
    }
}

#[test]
fn google_generate_content_normalizes_and_encodes_the_model_segment() {
    let expected = "https://example.com/v1beta/models/gemini%2Ftest:generateContent";
    for input in [
        "https://example.com",
        "https://example.com/v1beta",
        expected,
    ] {
        assert_eq!(
            resolve_google_generate_content(input, "gemini/test")
                .unwrap()
                .as_str(),
            expected
        );
    }
}

#[test]
fn google_generate_content_rejects_empty_model_without_echoing_base_url() {
    let error = resolve_google_generate_content("https://secret.example/v1beta", " ")
        .unwrap_err();
    let rendered = format!("{error}");
    assert!(!rendered.contains("secret.example"));
}