use crate::domain::AppError;
use crate::process_utils::hidden_command;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs::{File, OpenOptions};
use std::io::{BufReader, Read, Write};
use std::path::{Component, Path, PathBuf};
use std::process::Stdio;

pub const CUDA_RUNTIME_VERSION: &str = "v1.8.3";
pub const CUDA_ARCHIVE_FILE_NAME: &str = "whisper-cublas-12.4.0-bin-x64.zip";
pub const CUDA_ARCHIVE_URL: &str = "https://github.com/ggml-org/whisper.cpp/releases/download/v1.8.3/whisper-cublas-12.4.0-bin-x64.zip";
pub const CUDA_ARCHIVE_SHA256: &str =
    "c12a563333d3c3707be70754dc0e87c1cb58aa6333a87055bbcf9b524488dfb0";
pub const CUDA_ARCHIVE_BYTES: u64 = 459_854_042;

const REQUIRED_RUNTIME_FILES: [&str; 12] = [
    "whisper-cli.exe",
    "whisper.dll",
    "ggml.dll",
    "ggml-base.dll",
    "ggml-cpu.dll",
    "ggml-cuda.dll",
    "cudart64_12.dll",
    "cublas64_12.dll",
    "cublasLt64_12.dll",
    "nvblas64_12.dll",
    "nvrtc-builtins64_124.dll",
    "nvrtc64_120_0.dll",
];
const MAX_ARCHIVE_ENTRIES: usize = 1024;
const MAX_EXTRACTED_BYTES: u64 = 4 * 1024 * 1024 * 1024;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum LocalComputeMode {
    #[default]
    Auto,
    Cpu,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum CudaRuntimeState {
    Unavailable,
    NotInstalled,
    Downloading,
    Ready,
    Incompatible,
    Error,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CudaRuntimeStatus {
    pub state: CudaRuntimeState,
    pub gpu_name: Option<String>,
    pub version: String,
    pub compute_mode: LocalComputeMode,
    pub message: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CudaRuntimeDownloadProgress {
    pub downloaded_bytes: u64,
    pub total_bytes: u64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DetectedGpu {
    pub name: String,
    pub compute_capability: (u16, u16),
}

#[derive(Debug, Clone)]
pub struct CudaRuntimeManifest {
    pub version: String,
    pub archive_file_name: String,
    pub url: String,
    pub sha256: String,
    pub expected_files: Vec<String>,
    pub strip_prefix: Option<String>,
}

pub fn production_manifest() -> CudaRuntimeManifest {
    CudaRuntimeManifest {
        version: CUDA_RUNTIME_VERSION.into(),
        archive_file_name: CUDA_ARCHIVE_FILE_NAME.into(),
        url: CUDA_ARCHIVE_URL.into(),
        sha256: CUDA_ARCHIVE_SHA256.into(),
        expected_files: REQUIRED_RUNTIME_FILES.iter().map(|name| (*name).into()).collect(),
        strip_prefix: Some("Release".into()),
    }
}

pub trait CudaProbe: Send + Sync {
    fn detect(&self) -> Result<Option<DetectedGpu>, AppError>;
}

pub struct NvidiaSmiProbe;

impl CudaProbe for NvidiaSmiProbe {
    fn detect(&self) -> Result<Option<DetectedGpu>, AppError> {
        let Some(system_root) = std::env::var_os("SystemRoot") else {
            return Ok(None);
        };
        let executable = PathBuf::from(system_root).join("System32").join("nvidia-smi.exe");
        if !executable.is_file() {
            return Ok(None);
        }
        let output = hidden_command(executable)
            .args([
                "--query-gpu=name,compute_cap",
                "--format=csv,noheader,nounits",
            ])
            .stdin(Stdio::null())
            .stderr(Stdio::null())
            .output()
            .map_err(|_| probe_error())?;
        if !output.status.success() {
            return Ok(None);
        }
        if output.stdout.len() > 4096 {
            return Err(probe_error());
        }
        let text = std::str::from_utf8(&output.stdout).map_err(|_| probe_error())?;
        let Some(line) = text.lines().find(|line| !line.trim().is_empty()) else {
            return Ok(None);
        };
        let (name, capability) = line.split_once(',').ok_or_else(probe_error)?;
        let mut parts = capability.trim().split('.');
        let major = parts.next().and_then(|value| value.parse::<u16>().ok()).ok_or_else(probe_error)?;
        let minor = parts.next().and_then(|value| value.parse::<u16>().ok()).unwrap_or(0);
        let safe_name: String = name
            .trim()
            .chars()
            .filter(|character| !character.is_control())
            .take(120)
            .collect();
        if safe_name.is_empty() {
            return Err(probe_error());
        }
        Ok(Some(DetectedGpu {
            name: safe_name,
            compute_capability: (major, minor),
        }))
    }
}

pub trait CudaHttpClient: Send + Sync {
    fn download(
        &self,
        url: &str,
        start_at: u64,
        destination: &Path,
        on_progress: &dyn Fn(u64, u64),
    ) -> Result<(), ()>;
}

pub struct ReqwestCudaHttpClient;

impl CudaHttpClient for ReqwestCudaHttpClient {
    fn download(
        &self,
        url: &str,
        start_at: u64,
        destination: &Path,
        on_progress: &dyn Fn(u64, u64),
    ) -> Result<(), ()> {
        let client = reqwest::blocking::Client::new();
        let mut request = client.get(url);
        if start_at > 0 {
            request = request.header(reqwest::header::RANGE, format!("bytes={start_at}-"));
        }
        let mut response = request.send().map_err(|_| ())?;
        if !response.status().is_success()
            || (start_at > 0 && response.status() != reqwest::StatusCode::PARTIAL_CONTENT)
        {
            return Err(());
        }
        let total = response
            .content_length()
            .map(|length| length.saturating_add(start_at))
            .unwrap_or(CUDA_ARCHIVE_BYTES);
        let mut output = OpenOptions::new()
            .create(true)
            .append(true)
            .open(destination)
            .map_err(|_| ())?;
        let mut downloaded = start_at;
        let mut buffer = [0_u8; 64 * 1024];
        loop {
            let bytes = response.read(&mut buffer).map_err(|_| ())?;
            if bytes == 0 {
                break;
            }
            output.write_all(&buffer[..bytes]).map_err(|_| ())?;
            downloaded = downloaded.saturating_add(bytes as u64);
            on_progress(downloaded, total);
        }
        output.flush().map_err(|_| ())?;
        Ok(())
    }
}

pub fn cuda_runtime_root(app_data_dir: &Path) -> PathBuf {
    app_data_dir
        .join("runtime")
        .join("whisper.cpp")
        .join("cuda")
        .join(CUDA_RUNTIME_VERSION)
}

pub fn inspect_cuda_runtime(
    root: &Path,
    compute_mode: LocalComputeMode,
    probe: &dyn CudaProbe,
) -> CudaRuntimeStatus {
    let base = |state, gpu_name, message| CudaRuntimeStatus {
        state,
        gpu_name,
        version: CUDA_RUNTIME_VERSION.into(),
        compute_mode,
        message,
    };
    let gpu = match probe.detect() {
        Ok(Some(gpu)) => gpu,
        Ok(None) => {
            return base(
                CudaRuntimeState::Unavailable,
                None,
                Some("未检测到可用的 NVIDIA GPU，CPU 转写仍可使用。".into()),
            )
        }
        Err(_) => {
            return base(
                CudaRuntimeState::Error,
                None,
                Some("无法读取 NVIDIA GPU 状态，CPU 转写仍可使用。".into()),
            )
        }
    };
    if gpu.compute_capability.0 < 5 {
        return base(
            CudaRuntimeState::Incompatible,
            Some(gpu.name),
            Some("此 NVIDIA GPU 与当前 CUDA 组件不兼容，CPU 转写仍可使用。".into()),
        );
    }
    if !root.exists() {
        return base(CudaRuntimeState::NotInstalled, Some(gpu.name), None);
    }
    if runtime_files_ready(root, &production_manifest()) {
        base(CudaRuntimeState::Ready, Some(gpu.name), None)
    } else {
        base(
            CudaRuntimeState::Error,
            Some(gpu.name),
            Some("CUDA 加速组件不完整，请删除后重新下载。".into()),
        )
    }
}

pub fn download_cuda_runtime_with_client(
    root: &Path,
    client: &dyn CudaHttpClient,
    on_progress: impl Fn(u64, u64),
) -> Result<(), AppError> {
    let manifest = production_manifest();
    download_cuda_runtime_for_manifest(root, &manifest, client, on_progress)
}

pub fn download_cuda_runtime_for_manifest(
    root: &Path,
    manifest: &CudaRuntimeManifest,
    client: &dyn CudaHttpClient,
    on_progress: impl Fn(u64, u64),
) -> Result<(), AppError> {
    if runtime_files_ready(root, manifest) {
        return Ok(());
    }
    let parent = root.parent().ok_or_else(download_error)?;
    std::fs::create_dir_all(parent).map_err(|_| download_error())?;
    let part_path = parent.join(format!("{}.part", manifest.archive_file_name));
    let start_at = part_path.metadata().map(|metadata| metadata.len()).unwrap_or(0);
    client
        .download(&manifest.url, start_at, &part_path, &on_progress)
        .map_err(|_| download_error())?;
    if !has_expected_sha256(&part_path, &manifest.sha256)? {
        let _ = std::fs::remove_file(&part_path);
        return Err(hash_error());
    }
    // An explicit retry may replace only this app-owned, incomplete runtime.
    // Keep the old directory until the replacement archive has passed its hash
    // check so a failed or interrupted download never destroys local state.
    if root.exists() {
        std::fs::remove_dir_all(root).map_err(|_| {
            AppError::new(
                "cuda_runtime_replace_failed",
                "无法替换不完整的 CUDA 加速组件。",
                "请确认当前没有转写任务后删除组件并重试。",
            )
        })?;
    }
    install_verified_archive(root, &part_path, manifest)?;
    std::fs::remove_file(part_path).map_err(|_| download_error())?;
    Ok(())
}

pub fn install_verified_archive(
    root: &Path,
    archive_path: &Path,
    manifest: &CudaRuntimeManifest,
) -> Result<(), AppError> {
    if !has_expected_sha256(archive_path, &manifest.sha256)? {
        return Err(hash_error());
    }
    if root.exists() {
        return Err(AppError::new(
            "cuda_runtime_already_installed",
            "CUDA 加速组件目录已存在。",
            "请先删除不完整组件后重试。",
        ));
    }
    let staging = staging_path(root)?;
    if staging.exists() {
        std::fs::remove_dir_all(&staging).map_err(|_| extraction_error())?;
    }
    std::fs::create_dir_all(&staging).map_err(|_| extraction_error())?;

    let extraction = (|| {
        let file = File::open(archive_path).map_err(|_| extraction_error())?;
        let mut archive = zip::ZipArchive::new(file).map_err(|_| extraction_error())?;
        if archive.len() > MAX_ARCHIVE_ENTRIES {
            return Err(unsafe_archive_error());
        }
        let mut extracted_bytes = 0_u64;
        for index in 0..archive.len() {
            let mut entry = archive.by_index(index).map_err(|_| extraction_error())?;
            let enclosed = entry.enclosed_name().ok_or_else(unsafe_archive_error)?.to_path_buf();
            if enclosed
                .components()
                .any(|component| matches!(component, Component::Prefix(_) | Component::RootDir | Component::ParentDir))
            {
                return Err(unsafe_archive_error());
            }
            if entry
                .unix_mode()
                .is_some_and(|mode| matches!(mode & 0o170000, 0o120000 | 0o060000 | 0o020000 | 0o010000))
            {
                return Err(unsafe_archive_error());
            }
            extracted_bytes = extracted_bytes.saturating_add(entry.size());
            if extracted_bytes > MAX_EXTRACTED_BYTES {
                return Err(unsafe_archive_error());
            }
            let relative = if let Some(prefix) = manifest.strip_prefix.as_deref() {
                enclosed
                    .strip_prefix(Path::new(prefix))
                    .map_err(|_| unsafe_archive_error())?
            } else {
                enclosed.as_path()
            };
            if relative.as_os_str().is_empty() {
                continue;
            }
            let destination = staging.join(relative);
            if entry.is_dir() {
                std::fs::create_dir_all(&destination).map_err(|_| extraction_error())?;
                continue;
            }
            if let Some(parent) = destination.parent() {
                std::fs::create_dir_all(parent).map_err(|_| extraction_error())?;
            }
            let mut output = File::create(&destination).map_err(|_| extraction_error())?;
            std::io::copy(&mut entry, &mut output).map_err(|_| extraction_error())?;
            output.flush().map_err(|_| extraction_error())?;
        }
        if !runtime_files_ready(&staging, manifest) {
            return Err(AppError::new(
                "cuda_runtime_incomplete",
                "CUDA 加速组件缺少必要文件。",
                "请重新下载官方组件。",
            ));
        }
        std::fs::rename(&staging, root).map_err(|_| extraction_error())?;
        Ok(())
    })();
    if extraction.is_err() && staging.exists() {
        let _ = std::fs::remove_dir_all(&staging);
    }
    extraction
}

pub fn delete_cuda_runtime(root: &Path, in_use: bool) -> Result<(), AppError> {
    if in_use {
        return Err(AppError::new(
            "cuda_runtime_busy",
            "CUDA 加速组件正在使用中。",
            "请等待当前任务或下载完成后再删除。",
        ));
    }
    if !root.exists() {
        return Ok(());
    }
    std::fs::remove_dir_all(root).map_err(|_| {
        AppError::new(
            "cuda_runtime_delete_failed",
            "CUDA 加速组件删除失败。",
            "请确认当前没有转写任务后重试。",
        )
    })
}

pub fn ready_cuda_cli(root: &Path) -> Option<PathBuf> {
    runtime_files_ready(root, &production_manifest()).then(|| root.join("whisper-cli.exe"))
}

fn runtime_files_ready(root: &Path, manifest: &CudaRuntimeManifest) -> bool {
    manifest.expected_files.iter().all(|name| root.join(name).is_file())
}

fn staging_path(root: &Path) -> Result<PathBuf, AppError> {
    let parent = root.parent().ok_or_else(extraction_error)?;
    let name = root.file_name().and_then(|value| value.to_str()).ok_or_else(extraction_error)?;
    Ok(parent.join(format!("{name}.staging")))
}

fn has_expected_sha256(path: &Path, expected: &str) -> Result<bool, AppError> {
    let file = File::open(path).map_err(|_| download_error())?;
    let mut reader = BufReader::new(file);
    let mut hash = Sha256::new();
    let mut buffer = [0_u8; 64 * 1024];
    loop {
        let bytes = reader.read(&mut buffer).map_err(|_| download_error())?;
        if bytes == 0 {
            break;
        }
        hash.update(&buffer[..bytes]);
    }
    Ok(format!("{:x}", hash.finalize()).eq_ignore_ascii_case(expected))
}

fn probe_error() -> AppError {
    AppError::new(
        "cuda_probe_failed",
        "无法检测 NVIDIA GPU 状态。",
        "CPU 转写仍可使用，请稍后重试检测。",
    )
}

fn download_error() -> AppError {
    AppError::new(
        "cuda_runtime_download_failed",
        "CUDA 加速组件下载失败。",
        "请检查网络和磁盘空间后重试，CPU 转写仍可使用。",
    )
}

fn hash_error() -> AppError {
    AppError::new(
        "cuda_archive_hash_mismatch",
        "CUDA 加速组件完整性校验失败。",
        "已拒绝安装，请重新下载官方组件。",
    )
}

fn extraction_error() -> AppError {
    AppError::new(
        "cuda_archive_extract_failed",
        "CUDA 加速组件解压失败。",
        "请检查磁盘空间后重试。",
    )
}

fn unsafe_archive_error() -> AppError {
    AppError::new(
        "cuda_archive_unsafe",
        "CUDA 加速组件包含不安全路径。",
        "已拒绝安装该组件。",
    )
}
