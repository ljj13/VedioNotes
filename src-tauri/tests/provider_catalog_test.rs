use video_distiller_lib::provider_catalog::{catalog, provider, SummaryProtocolKind};

#[test]
fn embedded_catalog_has_the_reviewed_standard_protocol_boundary() {
    let catalog = catalog().expect("catalog should parse");
    assert_eq!(catalog.provider_count, 116);
    assert_eq!(catalog.model_count, 3926);
    assert_eq!(catalog.providers.len(), 116);
    assert_eq!(catalog.providers.iter().map(|item| item.models.len()).sum::<usize>(), 3926);
    assert!(catalog.providers.iter().all(|item| !item.base_url.trim().is_empty()));
    assert!(catalog.providers.iter().any(|item| item.protocol == SummaryProtocolKind::OpenAiCompatible));
    assert!(catalog.providers.iter().any(|item| item.protocol == SummaryProtocolKind::OpenAiResponses));
    assert!(catalog.providers.iter().any(|item| item.protocol == SummaryProtocolKind::Anthropic));
    assert!(catalog.providers.iter().any(|item| item.protocol == SummaryProtocolKind::Google));
}

#[test]
fn catalog_resolves_fixed_urls_and_excludes_special_sdk_providers() {
    assert_eq!(provider("openai").unwrap().base_url, "https://api.openai.com/v1");
    assert_eq!(provider("anthropic").unwrap().base_url, "https://api.anthropic.com");
    assert_eq!(provider("google").unwrap().base_url, "https://generativelanguage.googleapis.com/v1beta");
    assert_eq!(provider("xai").unwrap().base_url, "https://api.x.ai/v1");
    for id in ["amazon-bedrock", "azure", "google-vertex", "gitlab"] {
        assert!(provider(id).is_err(), "{id} must not be operational");
    }
}

#[test]
fn imported_models_keep_eligibility_without_discarding_non_summary_records() {
    let alibaba = provider("alibaba-cn").unwrap();
    let asr = alibaba.models.iter().find(|model| model.id == "qwen3-asr-flash").unwrap();
    assert!(!asr.summary_eligible);
    assert!(!asr.summary_ineligible_reason.as_deref().unwrap().is_empty());
    let deepseek = provider("deepseek").unwrap();
    assert!(deepseek.models.iter().any(|model| model.id == "deepseek-chat" && model.summary_eligible));
}

#[test]
fn unknown_provider_error_is_redacted() {
    let error = provider("not-a-real-provider").unwrap_err();
    assert_eq!(error.code, "summary_provider_not_found");
    assert!(!error.message.contains("models-dev-standard.json"));
}