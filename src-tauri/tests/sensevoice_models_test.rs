use std::fs::OpenOptions;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::atomic::AtomicBool;
use std::sync::Mutex;

use tempfile::tempdir;
use video_distiller_lib::artifact_download::{
    delete_verified_artifact, download_verified_artifact, ArtifactDescriptor, ArtifactDigest,
    ArtifactDownloadError, ArtifactHttpClient, ArtifactState,
};
use video_distiller_lib::sensevoice_models::{
    delete_sensevoice_model, download_sensevoice_for_manifest, inspect_sensevoice,
    load_selected_sensevoice_model, save_selected_sensevoice_model, SenseVoiceManifest,
    SenseVoiceModelId,
};

const SOURCES: &[&str] = &[
    "https://huggingface.co/fixture/model",
    "https://modelscope.cn/fixture/model",
];

const FIXTURE: ArtifactDescriptor = ArtifactDescriptor {
    id: "fixture",
    file_name: "fixture.bin",
    bytes: 3,
    digest: ArtifactDigest::Sha256(
        "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    ),
    sources: SOURCES,
};

#[derive(Debug, Clone, PartialEq, Eq)]
struct Request {
    url: String,
    range: Option<u64>,
}

struct ScriptedClient {
    calls: Mutex<Vec<Request>>,
    outcomes: Mutex<Vec<Result<Vec<u8>, ArtifactDownloadError>>>,
}

impl ScriptedClient {
    fn new(outcomes: Vec<Result<Vec<u8>, ArtifactDownloadError>>) -> Self {
        Self {
            calls: Mutex::new(Vec::new()),
            outcomes: Mutex::new(outcomes),
        }
    }

    fn requests(&self) -> Vec<Request> {
        self.calls.lock().unwrap().clone()
    }
}

impl ArtifactHttpClient for ScriptedClient {
    fn download(
        &self,
        url: &str,
        start_at: u64,
        destination: &Path,
        total_bytes: u64,
        on_progress: &dyn Fn(u64, u64),
        cancel: &AtomicBool,
    ) -> Result<(), ArtifactDownloadError> {
        assert!(!cancel.load(std::sync::atomic::Ordering::SeqCst));
        self.calls.lock().unwrap().push(Request {
            url: url.to_owned(),
            range: (start_at > 0).then_some(start_at),
        });
        let bytes = self.outcomes.lock().unwrap().remove(0)?;
        let mut output = OpenOptions::new()
            .create(true)
            .append(start_at > 0)
            .write(true)
            .truncate(start_at == 0)
            .open(destination)
            .unwrap();
        output.write_all(&bytes).unwrap();
        on_progress(start_at + bytes.len() as u64, total_bytes);
        Ok(())
    }
}

#[test]
fn resume_uses_range_and_finishes_with_atomic_rename() {
    let root = tempdir().unwrap();
    std::fs::write(root.path().join("fixture.bin.part"), b"ab").unwrap();
    let client = ScriptedClient::new(vec![Ok(b"c".to_vec())]);

    let status = download_verified_artifact(
        root.path(),
        &FIXTURE,
        &client,
        &AtomicBool::new(false),
        &|_, _| {},
    )
    .unwrap();

    assert_eq!(client.requests()[0].range, Some(2));
    assert_eq!(status.state, ArtifactState::Ready);
    assert_eq!(std::fs::read(root.path().join("fixture.bin")).unwrap(), b"abc");
    assert!(!root.path().join("fixture.bin.part").exists());
}

#[test]
fn source_failure_falls_back_to_modelscope_once() {
    let root = tempdir().unwrap();
    let client = ScriptedClient::new(vec![
        Err(ArtifactDownloadError::transport()),
        Ok(b"abc".to_vec()),
    ]);

    download_verified_artifact(
        root.path(),
        &FIXTURE,
        &client,
        &AtomicBool::new(false),
        &|_, _| {},
    )
    .unwrap();

    let requests = client.requests();
    assert_eq!(requests.len(), 2);
    assert_eq!(requests[0].url, SOURCES[0]);
    assert_eq!(requests[1].url, SOURCES[1]);
}

#[test]
fn digest_mismatch_retains_part_and_failure_marker() {
    let root = tempdir().unwrap();
    let client = ScriptedClient::new(vec![Ok(b"bad".to_vec()), Ok(b"bad".to_vec())]);

    let error = download_verified_artifact(
        root.path(),
        &FIXTURE,
        &client,
        &AtomicBool::new(false),
        &|_, _| {},
    )
    .unwrap_err();

    assert_eq!(error.code, "artifact_digest_mismatch");
    assert_eq!(client.requests().len(), 2);
    assert!(root.path().join("fixture.bin.part").is_file());
    assert!(root.path().join("fixture.bin.failed").is_file());
    assert!(!root.path().join("fixture.bin").exists());
}

#[test]
fn delete_is_confined_to_the_canonical_app_root() {
    let root = tempdir().unwrap();
    let outside = tempdir().unwrap();
    std::fs::write(root.path().join("fixture.bin"), b"abc").unwrap();
    std::fs::write(outside.path().join("keep.bin"), b"keep").unwrap();

    delete_verified_artifact(root.path(), &FIXTURE).unwrap();

    assert!(!root.path().join("fixture.bin").exists());
    assert_eq!(std::fs::read(outside.path().join("keep.bin")).unwrap(), b"keep");
}

fn fixture_descriptor(id: &'static str, file_name: &'static str) -> ArtifactDescriptor {
    ArtifactDescriptor {
        id,
        file_name,
        bytes: 3,
        digest: FIXTURE.digest,
        sources: SOURCES,
    }
}

#[test]
fn complete_manifest_install_is_reported_ready() {
    let root = tempdir().unwrap();
    let manifest = SenseVoiceManifest {
        runtime: fixture_descriptor("runtime", "sherpa-onnx-offline.exe"),
        tokens: fixture_descriptor("tokens", "tokens.txt"),
        int8: fixture_descriptor("int8", "model.int8.onnx"),
        float32: fixture_descriptor("float32", "model.onnx"),
    };
    let client = ScriptedClient::new(vec![
        Ok(b"abc".to_vec()),
        Ok(b"abc".to_vec()),
        Ok(b"abc".to_vec()),
    ]);

    download_sensevoice_for_manifest(
        root.path(),
        SenseVoiceModelId::Int8,
        &manifest,
        &client,
        &AtomicBool::new(false),
        &|_| {},
    )
    .unwrap();

    let installed = inspect_sensevoice(root.path(), SenseVoiceModelId::Int8, &manifest);
    assert_eq!(installed.state, ArtifactState::Ready);
    assert_eq!(installed.model_path, Some(root.path().join("model.int8.onnx")));
    assert_eq!(installed.models.len(), 2);
    assert_eq!(installed.models[0].id, SenseVoiceModelId::Int8);
    assert_eq!(installed.models[0].state, ArtifactState::Ready);
    assert_eq!(installed.models[1].id, SenseVoiceModelId::Float32);
    assert_eq!(installed.models[1].state, ArtifactState::Missing);
}

#[test]
fn production_manifest_uses_fixed_verified_dual_model_sources() {
    let manifest = video_distiller_lib::sensevoice_models::production_manifest();
    assert_eq!(manifest.int8.bytes, 239_233_841);
    assert_eq!(manifest.float32.bytes, 937_617_178);
    assert!(manifest.int8.sources[0].contains("huggingface.co"));
    assert!(manifest.int8.sources[1].contains("modelscope.cn"));
    assert_eq!(manifest.runtime.bytes, 21_775_360);
    assert!(matches!(manifest.runtime.digest, ArtifactDigest::Sha256(_)));
}

#[test]
fn selected_model_is_persisted_atomically_and_defaults_to_int8() {
    let root = tempdir().unwrap();
    assert_eq!(
        load_selected_sensevoice_model(root.path()).unwrap(),
        SenseVoiceModelId::Int8
    );

    save_selected_sensevoice_model(root.path(), SenseVoiceModelId::Float32).unwrap();

    assert_eq!(
        load_selected_sensevoice_model(root.path()).unwrap(),
        SenseVoiceModelId::Float32
    );
    assert!(root.path().join("selection.json").is_file());
}

#[test]
fn deleting_selected_model_requires_confirmation() {
    let root = tempdir().unwrap();
    let manifest = SenseVoiceManifest {
        runtime: fixture_descriptor("runtime", "sherpa-onnx-offline.exe"),
        tokens: fixture_descriptor("tokens", "tokens.txt"),
        int8: fixture_descriptor("int8", "model.int8.onnx"),
        float32: fixture_descriptor("float32", "model.onnx"),
    };
    std::fs::write(root.path().join("model.int8.onnx"), b"abc").unwrap();

    assert!(delete_sensevoice_model(
        root.path(),
        SenseVoiceModelId::Int8,
        SenseVoiceModelId::Int8,
        false,
        &manifest,
    )
    .is_err());
    assert!(root.path().join("model.int8.onnx").is_file());
}

#[allow(dead_code)]
fn _path_is_owned(_: PathBuf) {}
