use std::path::Path;
use std::sync::Mutex;

use tempfile::tempdir;
use video_distiller_lib::local_models::{
    delete_model, descriptor, download_model_for_descriptor, inspect_models, ready_model_path,
    LocalModelDescriptor, LocalModelError, LocalModelState, ModelHttpClient,
};

const FIXTURE_DESCRIPTOR: LocalModelDescriptor = LocalModelDescriptor {
    id: "tiny",
    file_name: "ggml-tiny.bin",
    bytes: 3,
    sha1: "a9993e364706816aba3e25717850c26c9cd0d89d",
    sha256: None,
    hugging_face_url: "https://fixture.invalid/hugging-face",
    model_scope_url: "https://fixture.invalid/model-scope",
};

const SHA256_FIXTURE_DESCRIPTOR: LocalModelDescriptor = LocalModelDescriptor {
    id: "fixture-sha256",
    file_name: "fixture-sha256.bin",
    bytes: 3,
    sha1: "",
    sha256: Some("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"),
    hugging_face_url: "https://fixture.invalid/hugging-face-sha256",
    model_scope_url: "https://fixture.invalid/model-scope-sha256",
};

struct ScriptedClient {
    calls: Mutex<Vec<String>>,
    outcomes: Mutex<Vec<Result<Vec<u8>, LocalModelError>>>,
}

impl ScriptedClient {
    fn new(outcomes: Vec<Result<Vec<u8>, LocalModelError>>) -> Self {
        Self {
            calls: Mutex::new(Vec::new()),
            outcomes: Mutex::new(outcomes),
        }
    }
}

impl ModelHttpClient for ScriptedClient {
    fn download(
        &self,
        url: &str,
        start_at: u64,
        destination: &Path,
        on_progress: &dyn Fn(u64, u64),
    ) -> Result<(), LocalModelError> {
        self.calls.lock().unwrap().push(url.to_string());
        let outcome = self.outcomes.lock().unwrap().remove(0)?;
        assert_eq!(start_at, 0);
        std::fs::write(destination, &outcome).unwrap();
        on_progress(outcome.len() as u64, FIXTURE_DESCRIPTOR.bytes);
        Ok(())
    }
}

#[test]
fn download_hugging_face_success_never_calls_model_scope() {
    let root = tempdir().unwrap();
    let client = ScriptedClient::new(vec![Ok(b"abc".to_vec())]);

    let status =
        download_model_for_descriptor(root.path(), &FIXTURE_DESCRIPTOR, &client, |_, _| {})
            .unwrap();

    assert_eq!(status.state, LocalModelState::Ready);
    assert_eq!(
        client.calls.lock().unwrap().as_slice(),
        [FIXTURE_DESCRIPTOR.hugging_face_url]
    );
}

#[test]
fn download_accepts_a_complete_sha256_validated_model() {
    let root = tempdir().unwrap();
    let client = ScriptedClient::new(vec![Ok(b"abc".to_vec())]);

    let status =
        download_model_for_descriptor(root.path(), &SHA256_FIXTURE_DESCRIPTOR, &client, |_, _| {})
            .unwrap();

    assert_eq!(status.state, LocalModelState::Ready);
    assert!(root
        .path()
        .join(SHA256_FIXTURE_DESCRIPTOR.file_name)
        .is_file());
}

#[test]
fn download_hf_failure_tries_model_scope_once() {
    let root = tempdir().unwrap();
    let client = ScriptedClient::new(vec![Err(LocalModelError::transport()), Ok(b"abc".to_vec())]);

    download_model_for_descriptor(root.path(), &FIXTURE_DESCRIPTOR, &client, |_, _| {}).unwrap();

    assert_eq!(
        client.calls.lock().unwrap().as_slice(),
        [
            FIXTURE_DESCRIPTOR.hugging_face_url,
            FIXTURE_DESCRIPTOR.model_scope_url,
        ]
    );
}

#[test]
fn download_invalid_digest_leaves_part_file_and_never_marks_ready() {
    let root = tempdir().unwrap();
    let client = ScriptedClient::new(vec![Ok(b"bad".to_vec())]);

    assert!(
        download_model_for_descriptor(root.path(), &FIXTURE_DESCRIPTOR, &client, |_, _| {})
            .is_err()
    );

    assert!(root.path().join("ggml-tiny.bin.part").is_file());
    assert!(!root.path().join(FIXTURE_DESCRIPTOR.file_name).exists());
    let listed = inspect_models(root.path(), None)
        .into_iter()
        .find(|status| status.id == FIXTURE_DESCRIPTOR.id)
        .unwrap();
    assert_eq!(listed.state, LocalModelState::Failed);
}

#[test]
fn deleting_current_model_requires_explicit_confirmation() {
    let root = tempdir().unwrap();
    let client = ScriptedClient::new(vec![Ok(b"abc".to_vec())]);
    download_model_for_descriptor(root.path(), &FIXTURE_DESCRIPTOR, &client, |_, _| {}).unwrap();

    assert!(delete_model(root.path(), &FIXTURE_DESCRIPTOR, true, false).is_err());
    assert!(root.path().join(FIXTURE_DESCRIPTOR.file_name).is_file());
    delete_model(root.path(), &FIXTURE_DESCRIPTOR, true, true).unwrap();
    assert!(!root.path().join(FIXTURE_DESCRIPTOR.file_name).exists());
}

#[test]
fn only_a_complete_sha1_validated_file_is_ready() {
    let root = tempdir().unwrap();
    let tiny = descriptor("tiny").unwrap();

    std::fs::write(root.path().join(tiny.file_name), b"wrong-content").unwrap();

    assert_eq!(
        inspect_models(root.path(), Some("tiny"))[0].state,
        LocalModelState::Corrupt
    );
    assert!(ready_model_path(root.path(), "tiny").is_err());
}

#[test]
fn part_file_never_becomes_selectable() {
    let root = tempdir().unwrap();
    let tiny = descriptor("tiny").unwrap();

    std::fs::write(
        root.path().join(format!("{}.part", tiny.file_name)),
        b"partial",
    )
    .unwrap();

    let status = inspect_models(root.path(), None)
        .into_iter()
        .find(|status| status.id == "tiny")
        .unwrap();
    assert_eq!(status.state, LocalModelState::Downloading);
    assert!(!status.is_current);
}

#[test]
fn registry_exposes_exactly_the_supported_local_model_ids() {
    let root = tempdir().unwrap();
    let ids = inspect_models(root.path(), None)
        .into_iter()
        .map(|status| status.id)
        .collect::<Vec<_>>();

    assert_eq!(
        ids,
        [
            "tiny",
            "base",
            "small",
            "large-v3-turbo-q5",
            "large-v3-turbo-q8",
            "medium",
            "large-v3-turbo",
            "large-v3",
        ]
    );
    let q5 = descriptor("large-v3-turbo-q5").unwrap();
    assert_eq!(q5.file_name, "ggml-large-v3-turbo-q5_0.bin");
    assert_eq!(q5.sha1, "e050f7970618a659205450ad97eb95a18d69c9ee");

    let q8 = descriptor("large-v3-turbo-q8").unwrap();
    assert_eq!(q8.file_name, "ggml-large-v3-turbo-q8_0.bin");
    assert_eq!(
        q8.sha256,
        Some("317eb69c11673c9de1e1f0d459b253999804ec71ac4c23c17ecf5fbe24e259a1")
    );

    let large_v3 = descriptor("large-v3").unwrap();
    assert_eq!(large_v3.file_name, "ggml-large-v3.bin");
    assert_eq!(large_v3.sha1, "ad82bf6a9043ceed055076d0fd39f5f186ff8062");
}
