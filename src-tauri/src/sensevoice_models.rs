//! SenseVoice 模型管理——管理 sherpa-onnx 格式的 CPU 语音识别模型下载和激活.

use crate::artifact_download::{
    delete_verified_artifact, download_verified_artifact, inspect_verified_artifact,
    ArtifactDescriptor, ArtifactDigest, ArtifactHttpClient, ArtifactState,
};
use crate::domain::AppError;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::sync::atomic::AtomicBool;
use std::io::Write;

/// SENSEVOICE RUNTIME VERSION
pub const SENSEVOICE_RUNTIME_VERSION: &str = "v1.13.2";

const RUNTIME_SOURCES: &[&str] = &[
    "https://github.com/k2-fsa/sherpa-onnx/releases/download/v1.13.2/sherpa-onnx-non-streaming-asr-x64-v1.13.2.exe",
];
const INT8_SOURCES: &[&str] = &[
    "https://huggingface.co/csukuangfj/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17/resolve/2365baeacb507f821a0c8120fcee3d484dba7a07/model.int8.onnx",
    "https://modelscope.cn/models/pengzhendong/sherpa-onnx-sense-voice-zh-en-ja-ko-yue/resolve/master/model.int8.onnx",
];
const FLOAT32_SOURCES: &[&str] = &[
    "https://huggingface.co/csukuangfj/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17/resolve/2365baeacb507f821a0c8120fcee3d484dba7a07/model.onnx",
    "https://modelscope.cn/models/pengzhendong/sherpa-onnx-sense-voice-zh-en-ja-ko-yue/resolve/master/model.onnx",
];
const TOKENS_SOURCES: &[&str] = &[
    "https://huggingface.co/csukuangfj/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17/resolve/2365baeacb507f821a0c8120fcee3d484dba7a07/tokens.txt",
    "https://modelscope.cn/models/pengzhendong/sherpa-onnx-sense-voice-zh-en-ja-ko-yue/resolve/master/tokens.txt",
];

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
/// SenseVoiceModelId
pub enum SenseVoiceModelId {
    #[default]
    Int8,
    Float32,
}

impl SenseVoiceModelId {
    /// as str
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Int8 => "int8",
            Self::Float32 => "float32",
        }
    }
}

#[derive(Debug, Clone, Copy)]
/// SenseVoiceManifest
pub struct SenseVoiceManifest {
    pub runtime: ArtifactDescriptor,
    pub tokens: ArtifactDescriptor,
    pub int8: ArtifactDescriptor,
    pub float32: ArtifactDescriptor,
}

impl SenseVoiceManifest {
    /// model
    pub fn model(self, id: SenseVoiceModelId) -> ArtifactDescriptor {
        match id {
            SenseVoiceModelId::Int8 => self.int8,
            SenseVoiceModelId::Float32 => self.float32,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
/// SenseVoiceStatus
pub struct SenseVoiceStatus {
    pub state: ArtifactState,
    pub selected_model: SenseVoiceModelId,
    pub runtime_ready: bool,
    pub tokens_ready: bool,
    pub model_path: Option<PathBuf>,
    pub models: Vec<SenseVoiceModelStatus>,
    pub downloaded_bytes: u64,
    pub total_bytes: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
/// SenseVoiceModelStatus
pub struct SenseVoiceModelStatus {
    pub id: SenseVoiceModelId,
    pub state: ArtifactState,
    pub downloaded_bytes: u64,
    pub total_bytes: u64,
    pub is_selected: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
/// SenseVoiceDownloadProgress
pub struct SenseVoiceDownloadProgress {
    pub model_id: SenseVoiceModelId,
    pub artifact_id: String,
    pub downloaded_bytes: u64,
    pub total_bytes: u64,
    pub overall_percent: u8,
}

#[derive(Debug, Clone, PartialEq, Eq)]
/// SenseVoicePaths
pub struct SenseVoicePaths {
    pub runtime: PathBuf,
    pub model: PathBuf,
    pub tokens: PathBuf,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SenseVoiceSelection {
    schema_version: u32,
    model: SenseVoiceModelId,
}

/// production manifest
pub fn production_manifest() -> SenseVoiceManifest {
    SenseVoiceManifest {
        runtime: ArtifactDescriptor {
            id: "runtime",
            file_name: "sherpa-onnx-offline.exe",
            bytes: 21_775_360,
            digest: ArtifactDigest::Sha256(
                "26e509d63c697ebce84e63ecfd68c3fd10ede173278be89194f923f0b0f5a1b8",
            ),
            sources: RUNTIME_SOURCES,
        },
        tokens: ArtifactDescriptor {
            id: "tokens",
            file_name: "tokens.txt",
            bytes: 315_894,
            digest: ArtifactDigest::GitBlobSha1(
                "2cfc92fc2ff26aaa690b7c01fd96b41109413881",
            ),
            sources: TOKENS_SOURCES,
        },
        int8: ArtifactDescriptor {
            id: "int8",
            file_name: "model.int8.onnx",
            bytes: 239_233_841,
            digest: ArtifactDigest::Sha256(
                "c71f0ce00bec95b07744e116345e33d8cbbe08cef896382cf907bf4b51a2cd51",
            ),
            sources: INT8_SOURCES,
        },
        float32: ArtifactDescriptor {
            id: "float32",
            file_name: "model.onnx",
            bytes: 937_617_178,
            digest: ArtifactDigest::Sha256(
                "977016bd9c79f9eb343430b5cc305e07ab64d5212dff41b0dcfa1694bee9a8cb",
            ),
            sources: FLOAT32_SOURCES,
        },
    }
}

/// sensevoice root
pub fn sensevoice_root(app_data_dir: &Path) -> PathBuf {
    app_data_dir.join("models").join("sensevoice")
}

/// load selected sensevoice model
pub fn load_selected_sensevoice_model(root: &Path) -> Result<SenseVoiceModelId, AppError> {
    let path = root.join("selection.json");
    if !path.exists() {
        return Ok(SenseVoiceModelId::Int8);
    }
    let bytes = std::fs::read(path).map_err(selection_io_error)?;
    let selection: SenseVoiceSelection = serde_json::from_slice(&bytes).map_err(|_| {
        AppError::new(
            "sensevoice_selection_corrupt",
            "SenseVoice 模型选择文件格式无效。",
            "原文件已保留；请在设置中重新选择模型。",
        )
    })?;
    if selection.schema_version != 1 {
        return Err(AppError::new(
            "sensevoice_selection_corrupt",
            "SenseVoice 模型选择版本不受支持。",
            "请更新应用或重新选择模型。",
        ));
    }
    Ok(selection.model)
}

/// save selected sensevoice model
pub fn save_selected_sensevoice_model(
    root: &Path,
    model: SenseVoiceModelId,
) -> Result<(), AppError> {
    std::fs::create_dir_all(root).map_err(selection_io_error)?;
    let bytes = serde_json::to_vec_pretty(&SenseVoiceSelection {
        schema_version: 1,
        model,
    })
    .map_err(|_| selection_io_error(std::io::Error::other("serialize")))?;
    let mut temporary = tempfile::Builder::new()
        .prefix(".sensevoice-selection-")
        .tempfile_in(root)
        .map_err(selection_io_error)?;
    temporary.write_all(&bytes).map_err(selection_io_error)?;
    temporary.flush().map_err(selection_io_error)?;
    temporary.as_file().sync_all().map_err(selection_io_error)?;
    temporary
        .persist(root.join("selection.json"))
        .map_err(|error| selection_io_error(error.error))?;
    Ok(())
}

/// inspect sensevoice
pub fn inspect_sensevoice(
    root: &Path,
    selected_model: SenseVoiceModelId,
    manifest: &SenseVoiceManifest,
) -> SenseVoiceStatus {
    let runtime = inspect_verified_artifact(root, &manifest.runtime);
    let tokens = inspect_verified_artifact(root, &manifest.tokens);
    let models = [SenseVoiceModelId::Int8, SenseVoiceModelId::Float32]
        .into_iter()
        .map(|id| {
            let status = inspect_verified_artifact(root, &manifest.model(id));
            SenseVoiceModelStatus {
                id,
                state: status.state,
                downloaded_bytes: status.downloaded_bytes,
                total_bytes: status.total_bytes,
                is_selected: id == selected_model,
            }
        })
        .collect::<Vec<_>>();
    let model_descriptor = manifest.model(selected_model);
    let model = inspect_verified_artifact(root, &model_descriptor);
    let states = [runtime.state, tokens.state, model.state];
    let state = if states.iter().all(|state| *state == ArtifactState::Ready) {
        ArtifactState::Ready
    } else if states.contains(&ArtifactState::Corrupt) {
        ArtifactState::Corrupt
    } else if states.contains(&ArtifactState::Failed) {
        ArtifactState::Failed
    } else if states.contains(&ArtifactState::Partial) {
        ArtifactState::Partial
    } else {
        ArtifactState::Missing
    };
    let runtime_ready = runtime.state == ArtifactState::Ready;
    let tokens_ready = tokens.state == ArtifactState::Ready;
    let model_ready = model.state == ArtifactState::Ready;
    SenseVoiceStatus {
        state,
        selected_model,
        runtime_ready,
        tokens_ready,
        model_path: model_ready.then(|| root.join(model_descriptor.file_name)),
        models,
        downloaded_bytes: runtime
            .downloaded_bytes
            .saturating_add(tokens.downloaded_bytes)
            .saturating_add(model.downloaded_bytes),
        total_bytes: runtime
            .total_bytes
            .saturating_add(tokens.total_bytes)
            .saturating_add(model.total_bytes),
    }
}

/// download sensevoice for manifest
pub fn download_sensevoice_for_manifest(
    root: &Path,
    model_id: SenseVoiceModelId,
    manifest: &SenseVoiceManifest,
    client: &dyn ArtifactHttpClient,
    cancel: &AtomicBool,
    on_progress: &dyn Fn(SenseVoiceDownloadProgress),
) -> Result<SenseVoiceStatus, AppError> {
    let artifacts = [manifest.runtime, manifest.tokens, manifest.model(model_id)];
    let total = artifacts
        .iter()
        .fold(0_u64, |sum, artifact| sum.saturating_add(artifact.bytes));
    let mut completed = 0_u64;
    for artifact in artifacts {
        let base = completed;
        download_verified_artifact(root, &artifact, client, cancel, &|downloaded, artifact_total| {
            let aggregate = base.saturating_add(downloaded.min(artifact_total));
            on_progress(SenseVoiceDownloadProgress {
                model_id,
                artifact_id: artifact.id.to_owned(),
                downloaded_bytes: aggregate,
                total_bytes: total,
                overall_percent: ((aggregate.saturating_mul(100) / total.max(1)).min(100)) as u8,
            });
        })?;
        completed = completed.saturating_add(artifact.bytes);
    }
    Ok(inspect_sensevoice(root, model_id, manifest))
}

/// ready sensevoice paths
pub fn ready_sensevoice_paths(
    root: &Path,
    model_id: SenseVoiceModelId,
    manifest: &SenseVoiceManifest,
) -> Result<SenseVoicePaths, AppError> {
    let status = inspect_sensevoice(root, model_id, manifest);
    if status.state != ArtifactState::Ready {
        return Err(AppError::new(
            "sensevoice_not_ready",
            "SenseVoice 组件尚未就绪。",
            "请在设置的语音转文字页面完成一键安装。",
        ));
    }
    Ok(SenseVoicePaths {
        runtime: root.join(manifest.runtime.file_name),
        model: root.join(manifest.model(model_id).file_name),
        tokens: root.join(manifest.tokens.file_name),
    })
}

/// delete sensevoice model
pub fn delete_sensevoice_model(
    root: &Path,
    model_id: SenseVoiceModelId,
    selected_model: SenseVoiceModelId,
    confirmed_selected_delete: bool,
    manifest: &SenseVoiceManifest,
) -> Result<(), AppError> {
    if model_id == selected_model && !confirmed_selected_delete {
        return Err(AppError::new(
            "sensevoice_model_selected",
            "当前 SenseVoice 模型正在使用。",
            "确认后才能删除当前模型。",
        ));
    }
    delete_verified_artifact(root, &manifest.model(model_id))
}

fn selection_io_error(_: std::io::Error) -> AppError {
    AppError::new(
        "sensevoice_selection_io_error",
        "无法保存 SenseVoice 模型选择。",
        "请检查磁盘空间和目录权限后重试。",
    )
}
