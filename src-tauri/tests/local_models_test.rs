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
    hugging_face_url: "https://fixture.invalid/hugging-face",
    model_scope_url: "https://fixture.invalid/model-scope",
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

    assert_eq!(ids, ["tiny", "base", "small", "medium", "large-v3-turbo"]);
    let expected_sha1 = [
        ("tiny", "bd577a113a864445d4c299885e0cb97d4ba92b5f"),
        ("base", "465707469ff3a37a2b9b8d8f89f2f99de7299dac"),
        ("small", "55356645c2b361a969dfd0ef2c5a50d530afd8d5"),
        ("medium", "fd9727b6e1217c2f614f9b698455c4ffd82463b4"),
        ("large-v3-turbo", "4af2b29d7ec73d781377bfd1758ca957a807e941"),
    ];
    for id in ids {
        let descriptor = descriptor(&id).unwrap();
        assert_eq!(descriptor.file_name, format!("ggml-{id}.bin"));
        assert_eq!(
            descriptor.sha1,
            expected_sha1
                .iter()
                .find(|(name, _)| *name == id)
                .unwrap()
                .1
        );
    }
}
