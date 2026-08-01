//! 本地 Whisper 模型管理——管理本地下载的 GGML 格式语音识别模型文件.

use crate::domain::AppError;
use crate::verified_file_cache::{
    forget_file_verification, remember_file_verification, verify_file_cached,
};
use serde::Serialize;
use sha1::{Digest, Sha1};
use sha2::Sha256;
use std::fs::{File, OpenOptions};
use std::io::{BufReader, Read, Write};
use std::path::{Path, PathBuf};

/// LOCAL WHISPER PROFILE ID
pub const LOCAL_WHISPER_PROFILE_ID: &str = "local-whisper-cpp";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
/// LocalModelState
pub enum LocalModelState {
    NotDownloaded,
    Downloading,
    Ready,
    Corrupt,
    Failed,
}

#[derive(Debug, Clone, Copy)]
/// LocalModelDescriptor
pub struct LocalModelDescriptor {
    pub id: &'static str,
    pub file_name: &'static str,
    pub bytes: u64,
    pub sha1: &'static str,
    pub sha256: Option<&'static str>,
    pub hugging_face_url: &'static str,
    pub model_scope_url: &'static str,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
/// LocalModelStatus
pub struct LocalModelStatus {
    pub id: String,
    pub state: LocalModelState,
    pub downloaded_bytes: u64,
    pub total_bytes: u64,
    pub is_current: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
/// LocalModelDownloadProgress
pub struct LocalModelDownloadProgress {
    pub model_id: String,
    pub downloaded_bytes: u64,
    pub total_bytes: u64,
}

/// A redacted download failure. The concrete HTTP implementation deliberately
/// does not retain request URLs, headers, or filesystem paths in this error.
#[derive(Debug, Clone)]
/// LocalModelError
pub struct LocalModelError;

impl LocalModelError {
    /// transport
    pub fn transport() -> Self {
        Self
    }
}

/// Injectable HTTP seam. Tests provide local scripted clients; production
/// uses `ReqwestModelHttpClient` and never accepts a caller-supplied URL.
pub trait ModelHttpClient: Send + Sync {
    fn download(
        &self,
        url: &str,
        start_at: u64,
        destination: &Path,
        on_progress: &dyn Fn(u64, u64),
    ) -> Result<(), LocalModelError>;
}

/// ReqwestModelHttpClient
pub struct ReqwestModelHttpClient;

impl ModelHttpClient for ReqwestModelHttpClient {
    fn download(
        &self,
        url: &str,
        start_at: u64,
        destination: &Path,
        on_progress: &dyn Fn(u64, u64),
    ) -> Result<(), LocalModelError> {
        let client = reqwest::blocking::Client::new();
        let mut request = client.get(url);
        if start_at > 0 {
            request = request.header(reqwest::header::RANGE, format!("bytes={start_at}-"));
        }
        let mut response = request.send().map_err(|_| LocalModelError)?;
        if !response.status().is_success()
            || (start_at > 0 && response.status() != reqwest::StatusCode::PARTIAL_CONTENT)
        {
            return Err(LocalModelError);
        }

        let total = response
            .content_length()
            .map(|length| length.saturating_add(start_at))
            .unwrap_or(0);
        let mut output = OpenOptions::new()
            .create(true)
            .append(true)
            .open(destination)
            .map_err(|_| LocalModelError)?;
        let mut downloaded = start_at;
        let mut buffer = [0; 64 * 1024];
        loop {
            let read = response.read(&mut buffer).map_err(|_| LocalModelError)?;
            if read == 0 {
                break;
            }
            output
                .write_all(&buffer[..read])
                .map_err(|_| LocalModelError)?;
            downloaded = downloaded.saturating_add(read as u64);
            on_progress(downloaded, total);
        }
        output.flush().map_err(|_| LocalModelError)?;
        Ok(())
    }
}

const MODEL_DESCRIPTORS: [LocalModelDescriptor; 8] = [
    LocalModelDescriptor {
        id: "tiny",
        file_name: "ggml-tiny.bin",
        bytes: 75_000_000,
        sha1: "bd577a113a864445d4c299885e0cb97d4ba92b5f",
        sha256: None,
        hugging_face_url: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin",
        model_scope_url: "https://modelscope.cn/models/AI-ModelScope/whisper.cpp/resolve/master/ggml-tiny.bin",
    },
    LocalModelDescriptor {
        id: "base",
        file_name: "ggml-base.bin",
        bytes: 142_000_000,
        sha1: "465707469ff3a37a2b9b8d8f89f2f99de7299dac",
        sha256: None,
        hugging_face_url: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin",
        model_scope_url: "https://modelscope.cn/models/AI-ModelScope/whisper.cpp/resolve/master/ggml-base.bin",
    },
    LocalModelDescriptor {
        id: "small",
        file_name: "ggml-small.bin",
        bytes: 466_000_000,
        sha1: "55356645c2b361a969dfd0ef2c5a50d530afd8d5",
        sha256: None,
        hugging_face_url: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin",
        model_scope_url: "https://modelscope.cn/models/AI-ModelScope/whisper.cpp/resolve/master/ggml-small.bin",
    },
    LocalModelDescriptor {
        id: "large-v3-turbo-q5",
        file_name: "ggml-large-v3-turbo-q5_0.bin",
        bytes: 574_041_195,
        sha1: "e050f7970618a659205450ad97eb95a18d69c9ee",
        sha256: None,
        hugging_face_url: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo-q5_0.bin",
        model_scope_url: "https://modelscope.cn/models/AI-ModelScope/whisper.cpp/resolve/master/ggml-large-v3-turbo-q5_0.bin",
    },
    LocalModelDescriptor {
        id: "large-v3-turbo-q8",
        file_name: "ggml-large-v3-turbo-q8_0.bin",
        bytes: 874_188_075,
        sha1: "",
        sha256: Some("317eb69c11673c9de1e1f0d459b253999804ec71ac4c23c17ecf5fbe24e259a1"),
        hugging_face_url: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo-q8_0.bin",
        model_scope_url: "https://modelscope.cn/models/AI-ModelScope/whisper.cpp/resolve/master/ggml-large-v3-turbo-q8_0.bin",
    },
    LocalModelDescriptor {
        id: "medium",
        file_name: "ggml-medium.bin",
        bytes: 1_500_000_000,
        sha1: "fd9727b6e1217c2f614f9b698455c4ffd82463b4",
        sha256: None,
        hugging_face_url: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-medium.bin",
        model_scope_url: "https://modelscope.cn/models/AI-ModelScope/whisper.cpp/resolve/master/ggml-medium.bin",
    },
    LocalModelDescriptor {
        id: "large-v3-turbo",
        file_name: "ggml-large-v3-turbo.bin",
        bytes: 1_620_000_000,
        sha1: "4af2b29d7ec73d781377bfd1758ca957a807e941",
        sha256: None,
        hugging_face_url: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo.bin",
        model_scope_url: "https://modelscope.cn/models/AI-ModelScope/whisper.cpp/resolve/master/ggml-large-v3-turbo.bin",
    },
    LocalModelDescriptor {
        id: "large-v3",
        file_name: "ggml-large-v3.bin",
        bytes: 3_095_033_483,
        sha1: "ad82bf6a9043ceed055076d0fd39f5f186ff8062",
        sha256: None,
        hugging_face_url: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3.bin",
        model_scope_url: "https://modelscope.cn/models/AI-ModelScope/whisper.cpp/resolve/master/ggml-large-v3.bin",
    },
];

/// descriptor
pub fn descriptor(id: &str) -> Option<&'static LocalModelDescriptor> {
    MODEL_DESCRIPTORS
        .iter()
        .find(|descriptor| descriptor.id == id)
}

/// local model root
pub fn local_model_root(app_data_dir: &Path) -> PathBuf {
    app_data_dir.join("models").join("whisper.cpp")
}

/// inspect models
pub fn inspect_models(root: &Path, current_id: Option<&str>) -> Vec<LocalModelStatus> {
    MODEL_DESCRIPTORS
        .iter()
        .map(|descriptor| {
            let model_path = root.join(descriptor.file_name);
            let part_path = root.join(format!("{}.part", descriptor.file_name));
            let failure_marker_path = failed_marker_path(root, descriptor);
            let (state, downloaded_bytes) = if model_path.is_file() {
                match has_expected_digest(&model_path, descriptor) {
                    Ok(true) => (LocalModelState::Ready, file_len(&model_path)),
                    Ok(false) | Err(()) => (LocalModelState::Corrupt, file_len(&model_path)),
                }
            } else if part_path.is_file() {
                (
                    if failure_marker_path.is_file() {
                        LocalModelState::Failed
                    } else {
                        LocalModelState::Downloading
                    },
                    file_len(&part_path),
                )
            } else {
                (LocalModelState::NotDownloaded, 0)
            };

            LocalModelStatus {
                id: descriptor.id.into(),
                is_current: current_id == Some(descriptor.id) && state == LocalModelState::Ready,
                state,
                downloaded_bytes,
                total_bytes: descriptor.bytes,
            }
        })
        .collect()
}

/// ready model path
pub fn ready_model_path(root: &Path, model_id: &str) -> Result<PathBuf, AppError> {
    let descriptor = descriptor(model_id).ok_or_else(|| {
        AppError::new(
            "local_model_unknown",
            "未知的本地 Whisper 模型。",
            "请选择受支持的本地模型。",
        )
    })?;
    let model_path = root.join(descriptor.file_name);

    if has_expected_digest(&model_path, descriptor).unwrap_or(false) {
        Ok(model_path)
    } else {
        Err(AppError::new(
            "local_model_not_ready",
            "本地 Whisper 模型尚未准备就绪。",
            "请下载或重新下载该模型。",
        ))
    }
}

/// Download a registry model to its app-data root. Unknown IDs are rejected
/// before the root is created or an HTTP client can be called.
pub fn download_model(
    root: &Path,
    model_id: &str,
    client: &dyn ModelHttpClient,
    on_progress: impl Fn(u64, u64),
) -> Result<LocalModelStatus, AppError> {
    let descriptor = descriptor(model_id).ok_or_else(unknown_model_error)?;
    download_model_for_descriptor(root, descriptor, client, on_progress)
}

/// Descriptor-level seam for deterministic local tests. App commands use
/// `download_model`, which resolves from the fixed registry first.
pub fn download_model_for_descriptor(
    root: &Path,
    descriptor: &LocalModelDescriptor,
    client: &dyn ModelHttpClient,
    on_progress: impl Fn(u64, u64),
) -> Result<LocalModelStatus, AppError> {
    std::fs::create_dir_all(root).map_err(|_| download_error())?;
    let final_path = root.join(descriptor.file_name);
    let part_path = root.join(format!("{}.part", descriptor.file_name));
    let failure_marker_path = failed_marker_path(root, descriptor);

    if has_expected_digest(&final_path, descriptor).unwrap_or(false) {
        return Ok(status_for(
            descriptor,
            LocalModelState::Ready,
            file_len(&final_path),
        ));
    }
    if final_path.exists() {
        return Err(download_error());
    }
    if failure_marker_path.exists() {
        std::fs::remove_file(&failure_marker_path).map_err(|_| download_error())?;
    }

    let transfer = |url: &str| {
        let start_at = file_len(&part_path);
        client.download(url, start_at, &part_path, &on_progress)
    };
    if transfer(descriptor.hugging_face_url).is_err()
        && transfer(descriptor.model_scope_url).is_err()
    {
        mark_failed(&failure_marker_path)?;
        return Err(download_error());
    }

    if !has_expected_digest(&part_path, descriptor).unwrap_or(false) {
        mark_failed(&failure_marker_path)?;
        return Err(download_error());
    }
    std::fs::rename(&part_path, &final_path).map_err(|_| download_error())?;
    forget_file_verification(root, &part_path);
    remember_file_verification(root, &final_path, &expected_digest_key(descriptor), true);
    Ok(status_for(
        descriptor,
        LocalModelState::Ready,
        file_len(&final_path),
    ))
}

/// Delete only a descriptor-owned file within the canonical model root.
/// Current-model deletion requires an explicit confirmation.
pub fn delete_model(
    root: &Path,
    descriptor: &LocalModelDescriptor,
    is_current: bool,
    confirmed_current_delete: bool,
) -> Result<(), AppError> {
    if is_current && !confirmed_current_delete {
        return Err(AppError::new(
            "local_model_current_delete_confirmation_required",
            "当前本地 Whisper 模型需要确认后才能删除。",
            "请确认删除，或先切换到其他已就绪模型。",
        ));
    }
    std::fs::create_dir_all(root).map_err(|_| delete_error())?;
    let canonical_root = root.canonicalize().map_err(|_| delete_error())?;
    for name in [
        descriptor.file_name.to_string(),
        format!("{}.part", descriptor.file_name),
        format!("{}.part.failed", descriptor.file_name),
    ] {
        let path = root.join(name);
        if !path.exists() {
            continue;
        }
        let canonical_path = path.canonicalize().map_err(|_| delete_error())?;
        if canonical_path.parent() != Some(canonical_root.as_path()) {
            return Err(delete_error());
        }
        std::fs::remove_file(canonical_path).map_err(|_| delete_error())?;
        forget_file_verification(root, &path);
    }
    Ok(())
}

fn status_for(
    descriptor: &LocalModelDescriptor,
    state: LocalModelState,
    downloaded_bytes: u64,
) -> LocalModelStatus {
    LocalModelStatus {
        id: descriptor.id.to_string(),
        state,
        downloaded_bytes,
        total_bytes: descriptor.bytes,
        is_current: false,
    }
}

fn unknown_model_error() -> AppError {
    AppError::new(
        "local_model_unknown",
        "未知的本地 Whisper 模型。",
        "请选择受支持的本地模型。",
    )
}

fn download_error() -> AppError {
    AppError::new(
        "local_model_download_failed",
        "本地 Whisper 模型下载或校验失败。",
        "请检查网络和磁盘空间后重试。",
    )
}

fn delete_error() -> AppError {
    AppError::new(
        "local_model_delete_failed",
        "本地 Whisper 模型删除失败。",
        "请确认模型未被占用后重试。",
    )
}

fn failed_marker_path(root: &Path, descriptor: &LocalModelDescriptor) -> PathBuf {
    root.join(format!("{}.part.failed", descriptor.file_name))
}

fn mark_failed(path: &Path) -> Result<(), AppError> {
    std::fs::write(path, []).map_err(|_| download_error())
}

fn file_len(path: &Path) -> u64 {
    path.metadata().map(|metadata| metadata.len()).unwrap_or(0)
}

fn has_expected_sha1(path: &Path, expected_sha1: &str) -> Result<bool, ()> {
    let file = File::open(path).map_err(|_| ())?;
    let mut reader = BufReader::new(file);
    let mut sha1 = Sha1::new();
    let mut buffer = [0; 64 * 1024];

    loop {
        let bytes_read = reader.read(&mut buffer).map_err(|_| ())?;
        if bytes_read == 0 {
            break;
        }
        sha1.update(&buffer[..bytes_read]);
    }

    Ok(format!("{:x}", sha1.finalize()) == expected_sha1)
}

fn has_expected_sha256(path: &Path, expected_sha256: &str) -> Result<bool, ()> {
    let file = File::open(path).map_err(|_| ())?;
    let mut reader = BufReader::new(file);
    let mut sha256 = Sha256::new();
    let mut buffer = [0; 64 * 1024];

    loop {
        let bytes_read = reader.read(&mut buffer).map_err(|_| ())?;
        if bytes_read == 0 {
            break;
        }
        sha256.update(&buffer[..bytes_read]);
    }

    Ok(format!("{:x}", sha256.finalize()) == expected_sha256)
}

fn has_expected_digest(path: &Path, descriptor: &LocalModelDescriptor) -> Result<bool, ()> {
    let root = path.parent().ok_or(())?;
    verify_file_cached(root, path, &expected_digest_key(descriptor), || {
        match descriptor.sha256 {
            Some(expected) => has_expected_sha256(path, expected),
            None => has_expected_sha1(path, descriptor.sha1),
        }
    })
}

fn expected_digest_key(descriptor: &LocalModelDescriptor) -> String {
    match descriptor.sha256 {
        Some(expected) => format!("sha256:{expected}"),
        None => format!("sha1:{}", descriptor.sha1),
    }
}
