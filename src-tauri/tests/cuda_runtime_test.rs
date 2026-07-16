use sha2::{Digest, Sha256};
use std::fs::{self, File};
use std::io::Write;
use std::path::Path;
use std::sync::Mutex;
use tempfile::tempdir;
use video_distiller_lib::cuda_runtime::{
    cuda_runtime_root, delete_cuda_runtime, download_cuda_runtime_for_manifest,
    inspect_cuda_runtime, install_verified_archive, CudaHttpClient, CudaProbe,
    CudaRuntimeManifest, CudaRuntimeState, DetectedGpu, LocalComputeMode,
    CUDA_ARCHIVE_SHA256, CUDA_ARCHIVE_URL, CUDA_RUNTIME_VERSION,
};
use video_distiller_lib::domain::AppError;
use zip::write::SimpleFileOptions;

struct FakeProbe(Result<Option<DetectedGpu>, AppError>);

struct FixtureClient {
    bytes: Vec<u8>,
    calls: Mutex<Vec<(String, u64)>>,
}

impl CudaHttpClient for FixtureClient {
    fn download(
        &self,
        url: &str,
        start_at: u64,
        destination: &Path,
        on_progress: &dyn Fn(u64, u64),
    ) -> Result<(), ()> {
        self.calls.lock().unwrap().push((url.to_string(), start_at));
        let mut output = fs::OpenOptions::new().create(true).append(true).open(destination).map_err(|_| ())?;
        output.write_all(&self.bytes[start_at as usize..]).map_err(|_| ())?;
        on_progress(self.bytes.len() as u64, self.bytes.len() as u64);
        Ok(())
    }
}

impl CudaProbe for FakeProbe {
    fn detect(&self) -> Result<Option<DetectedGpu>, AppError> {
        self.0.clone()
    }
}

fn write_zip(path: &Path, entries: &[(&str, &[u8])]) {
    let file = File::create(path).unwrap();
    let mut writer = zip::ZipWriter::new(file);
    for (name, bytes) in entries {
        writer.start_file(*name, SimpleFileOptions::default()).unwrap();
        writer.write_all(bytes).unwrap();
    }
    writer.finish().unwrap();
}

fn fixture_manifest(path: &Path, expected_files: &[&str]) -> CudaRuntimeManifest {
    let bytes = fs::read(path).unwrap();
    CudaRuntimeManifest {
        version: "test".into(),
        archive_file_name: "fixture.zip".into(),
        url: "https://example.invalid/fixture.zip".into(),
        sha256: format!("{:x}", Sha256::digest(bytes)),
        expected_files: expected_files.iter().map(|value| (*value).to_string()).collect(),
        strip_prefix: None,
    }
}

#[test]
fn production_manifest_is_fixed_to_the_reviewed_official_release() {
    assert_eq!(CUDA_RUNTIME_VERSION, "v1.8.3");
    assert_eq!(CUDA_ARCHIVE_SHA256, "c12a563333d3c3707be70754dc0e87c1cb58aa6333a87055bbcf9b524488dfb0");
    assert_eq!(CUDA_ARCHIVE_URL, "https://github.com/ggml-org/whisper.cpp/releases/download/v1.8.3/whisper-cublas-12.4.0-bin-x64.zip");
}

#[test]
fn detection_never_downloads_and_reports_supported_gpu_without_component() {
    let temp = tempdir().unwrap();
    let root = cuda_runtime_root(temp.path());
    let status = inspect_cuda_runtime(
        &root,
        LocalComputeMode::Auto,
        &FakeProbe(Ok(Some(DetectedGpu { name: "NVIDIA RTX Test".into(), compute_capability: (8, 9) }))),
    );

    assert_eq!(status.state, CudaRuntimeState::NotInstalled);
    assert_eq!(status.gpu_name.as_deref(), Some("NVIDIA RTX Test"));
    assert!(!root.exists());
}

#[test]
fn verified_archive_extracts_to_an_atomic_ready_directory() {
    let temp = tempdir().unwrap();
    let archive = temp.path().join("runtime.zip");
    write_zip(&archive, &[("Release/whisper-cli.exe", b"exe"), ("Release/ggml-cuda.dll", b"dll")]);
    let mut manifest = fixture_manifest(&archive, &["whisper-cli.exe", "ggml-cuda.dll"]);
    manifest.strip_prefix = Some("Release".into());
    let root = temp.path().join("installed");

    install_verified_archive(&root, &archive, &manifest).unwrap();

    assert_eq!(fs::read(root.join("whisper-cli.exe")).unwrap(), b"exe");
    assert_eq!(fs::read(root.join("ggml-cuda.dll")).unwrap(), b"dll");
    assert!(!temp.path().join("installed.staging").exists());
}

#[test]
fn hash_mismatch_and_parent_traversal_are_rejected() {
    let temp = tempdir().unwrap();
    let archive = temp.path().join("unsafe.zip");
    write_zip(&archive, &[("../escape.dll", b"bad")]);
    let mut manifest = fixture_manifest(&archive, &["escape.dll"]);
    let root = temp.path().join("runtime");

    manifest.sha256 = "00".repeat(32);
    assert_eq!(install_verified_archive(&root, &archive, &manifest).unwrap_err().code, "cuda_archive_hash_mismatch");
    manifest = fixture_manifest(&archive, &["escape.dll"]);
    assert_eq!(install_verified_archive(&root, &archive, &manifest).unwrap_err().code, "cuda_archive_unsafe");
    assert!(!temp.path().join("escape.dll").exists());
}

#[test]
fn deletion_is_blocked_while_runtime_is_in_use() {
    let temp = tempdir().unwrap();
    let root = temp.path().join("runtime");
    fs::create_dir_all(&root).unwrap();
    fs::write(root.join("whisper-cli.exe"), b"exe").unwrap();

    assert_eq!(delete_cuda_runtime(&root, true).unwrap_err().code, "cuda_runtime_busy");
    assert!(root.exists());
    delete_cuda_runtime(&root, false).unwrap();
    assert!(!root.exists());
}

#[test]
fn component_download_resumes_a_part_file_and_uses_only_manifest_url() {
    let temp = tempdir().unwrap();
    let archive = temp.path().join("source.zip");
    write_zip(&archive, &[("whisper-cli.exe", b"exe"), ("ggml-cuda.dll", b"dll")]);
    let manifest = fixture_manifest(&archive, &["whisper-cli.exe", "ggml-cuda.dll"]);
    let bytes = fs::read(&archive).unwrap();
    let client = FixtureClient { bytes: bytes.clone(), calls: Mutex::new(Vec::new()) };
    let root = temp.path().join("runtime");
    let part = temp.path().join("fixture.zip.part");
    fs::write(&part, &bytes[..12]).unwrap();
    let progress = Mutex::new(Vec::new());

    download_cuda_runtime_for_manifest(&root, &manifest, &client, |downloaded, total| {
        progress.lock().unwrap().push((downloaded, total));
    })
    .unwrap();

    assert_eq!(client.calls.lock().unwrap().as_slice(), &[(manifest.url.clone(), 12)]);
    assert_eq!(progress.lock().unwrap().last(), Some(&(bytes.len() as u64, bytes.len() as u64)));
    assert!(root.join("whisper-cli.exe").is_file());
    assert!(!part.exists());
}

#[test]
fn explicit_retry_replaces_an_incomplete_runtime_only_after_archive_verification() {
    let temp = tempdir().unwrap();
    let archive = temp.path().join("source.zip");
    write_zip(&archive, &[("whisper-cli.exe", b"new-exe"), ("ggml-cuda.dll", b"new-dll")]);
    let manifest = fixture_manifest(&archive, &["whisper-cli.exe", "ggml-cuda.dll"]);
    let bytes = fs::read(&archive).unwrap();
    let client = FixtureClient { bytes, calls: Mutex::new(Vec::new()) };
    let root = temp.path().join("runtime");
    fs::create_dir_all(&root).unwrap();
    fs::write(root.join("broken.partial"), b"old").unwrap();

    download_cuda_runtime_for_manifest(&root, &manifest, &client, |_, _| {}).unwrap();

    assert_eq!(fs::read(root.join("whisper-cli.exe")).unwrap(), b"new-exe");
    assert!(!root.join("broken.partial").exists());
}
