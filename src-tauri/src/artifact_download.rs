//! 文件下载器——实现带断点续传的 HTTP 文件下载.
//! 用于 AI 模型等大文件.

use crate::domain::AppError;
use sha1::Digest as _;
use std::fs::{File, OpenOptions};
use std::io::{Read, Seek, SeekFrom, Write};
use std::path::{Component, Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
/// ArtifactDigest
pub enum ArtifactDigest {
    Sha1(&'static str),
    Sha256(&'static str),
    /// Git's object id: SHA-1 over `blob <length>\0<content>`.
    GitBlobSha1(&'static str),
}

#[derive(Debug, Clone, Copy)]
/// ArtifactDescriptor
pub struct ArtifactDescriptor {
    pub id: &'static str,
    pub file_name: &'static str,
    pub bytes: u64,
    pub digest: ArtifactDigest,
    pub sources: &'static [&'static str],
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "snake_case")]
/// ArtifactState
pub enum ArtifactState {
    Missing,
    Partial,
    Ready,
    Failed,
    Corrupt,
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
/// ArtifactStatus
pub struct ArtifactStatus {
    pub id: String,
    pub state: ArtifactState,
    pub downloaded_bytes: u64,
    pub total_bytes: u64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ArtifactDownloadErrorKind {
    Transport,
    Cancelled,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
/// ArtifactDownloadError
pub struct ArtifactDownloadError {
    kind: ArtifactDownloadErrorKind,
}

impl ArtifactDownloadError {
    /// transport
    pub fn transport() -> Self {
        Self {
            kind: ArtifactDownloadErrorKind::Transport,
        }
    }

    /// cancelled
    pub fn cancelled() -> Self {
        Self {
            kind: ArtifactDownloadErrorKind::Cancelled,
        }
    }

    fn is_cancelled(self) -> bool {
        self.kind == ArtifactDownloadErrorKind::Cancelled
    }
}

/// ArtifactHttpClient
pub trait ArtifactHttpClient: Send + Sync {
    fn download(
        &self,
        url: &str,
        start_at: u64,
        destination: &Path,
        total_bytes: u64,
        on_progress: &dyn Fn(u64, u64),
        cancel: &AtomicBool,
    ) -> Result<(), ArtifactDownloadError>;
}

/// ReqwestArtifactHttpClient
pub struct ReqwestArtifactHttpClient;

impl ArtifactHttpClient for ReqwestArtifactHttpClient {
    fn download(
        &self,
        url: &str,
        start_at: u64,
        destination: &Path,
        total_bytes: u64,
        on_progress: &dyn Fn(u64, u64),
        cancel: &AtomicBool,
    ) -> Result<(), ArtifactDownloadError> {
        if cancel.load(Ordering::SeqCst) {
            return Err(ArtifactDownloadError::cancelled());
        }
        let client = reqwest::blocking::Client::builder()
            .connect_timeout(std::time::Duration::from_secs(20))
            .timeout(std::time::Duration::from_secs(60 * 30))
            .build()
            .map_err(|_| ArtifactDownloadError::transport())?;
        let mut request = client.get(url);
        if start_at > 0 {
            request = request.header(reqwest::header::RANGE, format!("bytes={start_at}-"));
        }
        let mut response = request
            .send()
            .and_then(reqwest::blocking::Response::error_for_status)
            .map_err(|_| ArtifactDownloadError::transport())?;
        let resumed = start_at > 0 && response.status() == reqwest::StatusCode::PARTIAL_CONTENT;
        let effective_start = if resumed { start_at } else { 0 };
        let mut output = OpenOptions::new()
            .create(true)
            .write(true)
            .append(resumed)
            .truncate(!resumed)
            .open(destination)
            .map_err(|_| ArtifactDownloadError::transport())?;
        let mut downloaded = effective_start;
        let mut buffer = [0_u8; 64 * 1024];
        loop {
            if cancel.load(Ordering::SeqCst) {
                return Err(ArtifactDownloadError::cancelled());
            }
            let count = response
                .read(&mut buffer)
                .map_err(|_| ArtifactDownloadError::transport())?;
            if count == 0 {
                break;
            }
            output
                .write_all(&buffer[..count])
                .map_err(|_| ArtifactDownloadError::transport())?;
            downloaded = downloaded.saturating_add(count as u64);
            on_progress(downloaded.min(total_bytes), total_bytes);
        }
        output
            .flush()
            .and_then(|_| output.sync_all())
            .map_err(|_| ArtifactDownloadError::transport())?;
        Ok(())
    }
}

/// inspect verified artifact
pub fn inspect_verified_artifact(root: &Path, descriptor: &ArtifactDescriptor) -> ArtifactStatus {
    let final_path = root.join(descriptor.file_name);
    let part_path = part_path(root, descriptor);
    let failed_path = failed_path(root, descriptor);
    let (state, downloaded_bytes) = if final_path.is_file() {
        let bytes = final_path.metadata().map(|m| m.len()).unwrap_or(0);
        if verify_file(&final_path, descriptor) {
            (ArtifactState::Ready, descriptor.bytes)
        } else {
            (ArtifactState::Corrupt, bytes)
        }
    } else if failed_path.is_file() {
        (
            ArtifactState::Failed,
            part_path.metadata().map(|m| m.len()).unwrap_or(0),
        )
    } else if part_path.is_file() {
        (
            ArtifactState::Partial,
            part_path.metadata().map(|m| m.len()).unwrap_or(0),
        )
    } else {
        (ArtifactState::Missing, 0)
    };
    ArtifactStatus {
        id: descriptor.id.to_owned(),
        state,
        downloaded_bytes,
        total_bytes: descriptor.bytes,
    }
}

/// download verified artifact
pub fn download_verified_artifact(
    root: &Path,
    descriptor: &ArtifactDescriptor,
    client: &dyn ArtifactHttpClient,
    cancel: &AtomicBool,
    on_progress: &dyn Fn(u64, u64),
) -> Result<ArtifactStatus, AppError> {
    validate_descriptor(descriptor)?;
    std::fs::create_dir_all(root).map_err(artifact_io_error)?;
    let existing = inspect_verified_artifact(root, descriptor);
    if existing.state == ArtifactState::Ready {
        return Ok(existing);
    }
    if cancel.load(Ordering::SeqCst) {
        return Err(cancelled_error());
    }

    let final_path = root.join(descriptor.file_name);
    let part_path = part_path(root, descriptor);
    let failed_path = failed_path(root, descriptor);
    if final_path.exists() {
        remove_owned_file(root, &final_path)?;
    }
    let _ = std::fs::remove_file(&failed_path);

    let mut last_was_digest = false;
    for (index, source) in descriptor.sources.iter().enumerate() {
        if cancel.load(Ordering::SeqCst) {
            write_failure_marker(&failed_path, "cancelled")?;
            return Err(cancelled_error());
        }
        let mut start_at = part_path.metadata().map(|m| m.len()).unwrap_or(0);
        if start_at > descriptor.bytes {
            truncate_file(&part_path)?;
            start_at = 0;
        }
        match client.download(
            source,
            start_at,
            &part_path,
            descriptor.bytes,
            on_progress,
            cancel,
        ) {
            Ok(()) => {
                if cancel.load(Ordering::SeqCst) {
                    write_failure_marker(&failed_path, "cancelled")?;
                    return Err(cancelled_error());
                }
                if verify_file(&part_path, descriptor) {
                    if final_path.exists() {
                        remove_owned_file(root, &final_path)?;
                    }
                    std::fs::rename(&part_path, &final_path).map_err(artifact_io_error)?;
                    let _ = std::fs::remove_file(&failed_path);
                    return Ok(inspect_verified_artifact(root, descriptor));
                }
                last_was_digest = true;
                if index + 1 < descriptor.sources.len() {
                    truncate_file(&part_path)?;
                }
            }
            Err(error) if error.is_cancelled() => {
                write_failure_marker(&failed_path, "cancelled")?;
                return Err(cancelled_error());
            }
            Err(_) => {
                last_was_digest = false;
            }
        }
    }

    write_failure_marker(
        &failed_path,
        if last_was_digest {
            "digest_mismatch"
        } else {
            "source_unavailable"
        },
    )?;
    Err(if last_was_digest {
        AppError::new(
            "artifact_digest_mismatch",
            "下载的组件完整性校验失败。",
            "已保留失败标记；请重试，应用会自动切换下载源。",
        )
    } else {
        AppError::new(
            "artifact_download_failed",
            "组件下载失败。",
            "请检查网络后重试。",
        )
    })
}

/// delete verified artifact
pub fn delete_verified_artifact(
    root: &Path,
    descriptor: &ArtifactDescriptor,
) -> Result<(), AppError> {
    validate_descriptor(descriptor)?;
    if !root.exists() {
        return Ok(());
    }
    for path in [
        root.join(descriptor.file_name),
        part_path(root, descriptor),
        failed_path(root, descriptor),
    ] {
        if path.exists() {
            remove_owned_file(root, &path)?;
        }
    }
    Ok(())
}

fn validate_descriptor(descriptor: &ArtifactDescriptor) -> Result<(), AppError> {
    let path = Path::new(descriptor.file_name);
    if descriptor.id.is_empty()
        || descriptor.bytes == 0
        || descriptor.sources.is_empty()
        || path.components().count() != 1
        || !matches!(path.components().next(), Some(Component::Normal(_)))
    {
        return Err(AppError::new(
            "artifact_manifest_invalid",
            "组件清单无效。",
            "请更新应用后重试。",
        ));
    }
    Ok(())
}

fn verify_file(path: &Path, descriptor: &ArtifactDescriptor) -> bool {
    let Ok(metadata) = path.metadata() else {
        return false;
    };
    if metadata.len() != descriptor.bytes {
        return false;
    }
    match descriptor.digest {
        ArtifactDigest::Sha1(expected) => digest_file::<sha1::Sha1>(path)
            .is_some_and(|actual| actual.eq_ignore_ascii_case(expected)),
        ArtifactDigest::Sha256(expected) => digest_file::<sha2::Sha256>(path)
            .is_some_and(|actual| actual.eq_ignore_ascii_case(expected)),
        ArtifactDigest::GitBlobSha1(expected) => {
            git_blob_sha1(path, descriptor.bytes)
                .is_some_and(|actual| actual.eq_ignore_ascii_case(expected))
        }
    }
}

fn digest_file<D: sha1::Digest + Default>(path: &Path) -> Option<String> {
    let mut file = File::open(path).ok()?;
    let mut digest = D::default();
    let mut buffer = [0_u8; 64 * 1024];
    loop {
        let count = file.read(&mut buffer).ok()?;
        if count == 0 {
            break;
        }
        digest.update(&buffer[..count]);
    }
    let bytes = digest.finalize();
    Some(bytes.iter().map(|byte| format!("{byte:02x}")).collect())
}

fn git_blob_sha1(path: &Path, bytes: u64) -> Option<String> {
    let mut file = File::open(path).ok()?;
    let mut digest = sha1::Sha1::new();
    digest.update(format!("blob {bytes}\0").as_bytes());
    let mut buffer = [0_u8; 64 * 1024];
    loop {
        let count = file.read(&mut buffer).ok()?;
        if count == 0 {
            break;
        }
        digest.update(&buffer[..count]);
    }
    Some(format!("{:x}", digest.finalize()))
}

fn truncate_file(path: &Path) -> Result<(), AppError> {
    let mut file = OpenOptions::new()
        .create(true)
        .write(true)
        .open(path)
        .map_err(artifact_io_error)?;
    file.set_len(0).map_err(artifact_io_error)?;
    file.seek(SeekFrom::Start(0)).map_err(artifact_io_error)?;
    file.sync_all().map_err(artifact_io_error)
}

fn remove_owned_file(root: &Path, path: &Path) -> Result<(), AppError> {
    let canonical_root = std::fs::canonicalize(root).map_err(artifact_io_error)?;
    let canonical_path = std::fs::canonicalize(path).map_err(artifact_io_error)?;
    if !canonical_path.starts_with(&canonical_root) || !canonical_path.is_file() {
        return Err(AppError::new(
            "artifact_path_unsafe",
            "拒绝操作应用目录之外的组件。",
            "请重启应用后重试。",
        ));
    }
    std::fs::remove_file(canonical_path).map_err(artifact_io_error)
}

fn part_path(root: &Path, descriptor: &ArtifactDescriptor) -> PathBuf {
    root.join(format!("{}.part", descriptor.file_name))
}

fn failed_path(root: &Path, descriptor: &ArtifactDescriptor) -> PathBuf {
    root.join(format!("{}.failed", descriptor.file_name))
}

fn write_failure_marker(path: &Path, code: &str) -> Result<(), AppError> {
    std::fs::write(path, code.as_bytes()).map_err(artifact_io_error)
}

fn cancelled_error() -> AppError {
    AppError::new("cancelled", "下载已取消。", "可以稍后继续下载。")
}

fn artifact_io_error(_: std::io::Error) -> AppError {
    AppError::new(
        "artifact_io_error",
        "组件文件操作失败。",
        "请检查磁盘空间和目录权限后重试。",
    )
}
