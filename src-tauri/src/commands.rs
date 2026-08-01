//! 命令处理器——所有 #[tauri::command] 函数的注册地.
//! 前端 bridge.ts 中的每个 invoke 调用最终都路由到这里.
//! 这是最核心的 Rust 文件.

use crate::credential_store::{
    CapabilityKind, CredentialBackend, CredentialBackendError, CredentialStore, KeyringBackend,
    SecretPayload,
};
use crate::download_cookies::{inspect_douyin_cookie_fields, DownloadCookieStore};
use crate::{
    ai_capabilities::{
        write_capability_output, CommandLocalAgentProcessRunner, ImageClient, LocalAgentClient,
        LocalAgentResult, RankedCandidate, ReqwestCapabilityHttpClient, RerankClient, SearchHit,
        TtsClient, VectorClient, WebSearchClient, WebSearchResult,
    },
    capability_store::{
        CapabilitySettings, CapabilityStore, ImageConfig, LocalAgentConfig, RerankConfig,
        TtsConfig, VectorConfig, WebSearchConfig,
    },
    data_management::{
        serialize_note, AboutComponent, AboutSnapshot, AppearancePreferences, CacheCategory,
        CacheClearResult, CacheUsage, DataManagementService, ExportFormat, ExportPreferences,
        LogDescriptor, LogLevel, LogTail, MAX_LOG_TAIL_BYTES,
    },
    diagnostics::{self, DiagnosticEventKind, DiagnosticLevel, DiagnosticRecord},
    cuda_runtime::{
        cuda_runtime_root, delete_cuda_runtime as remove_cuda_runtime,
        download_cuda_runtime_with_client, inspect_cuda_runtime, CudaRuntimeDownloadProgress,
        ready_cuda_cli, CudaRuntimeState, CudaRuntimeStatus, LocalComputeMode, NvidiaSmiProbe,
        ReqwestCudaHttpClient,
    },
    domain::{
        AppError, Distillation, DistillationResult, DownloadTelemetry, InputSource,
        ProfileTestResult, ProviderFallbackEvent, SecretInput, SenseVoiceLanguage, TaskOptions,
        TaskProgress, TaskStage, TranscriptionMode,
    },
    history_store::{
        capture_evidence_with, HistoryEntry, HistoryEntryInput, HistoryStore, LibraryEntry,
        LibraryQuery, LibrarySnapshot, NoteChatTurn,
    },
    local_models::{
        delete_model, descriptor, download_model, inspect_models, local_model_root,
        LocalModelDownloadProgress, LocalModelState, LocalModelStatus, ReqwestModelHttpClient,
    },
    note_chat::ask_note_with,
    artifact_download::ReqwestArtifactHttpClient,
    preferences::{
        create_task_work_dir, resolve_markdown_output_dir, AppPreferences, PreferencesStore,
    },
    profile_store::ProfileStore,
    profiles::{
        AppProfiles, SummaryProfile, SummaryProviderKind, TranscriptionProfile,
        TranscriptionProviderKind,
    },
    provider_catalog::{
        catalog as summary_catalog, provider as summary_catalog_provider,
        SummaryProtocolKind, SummaryProviderCatalogEntry,
    },
    providers::error::ProviderErrorKind,
    providers::{
        ModelDiscoveryResult, SummaryAdapter, SummaryRegistry, TranscriptionAdapter,
        TranscriptionRegistry,
    },
    services::{
        download::{classify_platform_url, download_platform, DownloadProgress},
        media::{prepare_audio, LocalFfmpegScreenshotCapturer},
        results::{copy_markdown_file, save_markdown},
    },
    sensevoice_models::{
        delete_sensevoice_model, download_sensevoice_for_manifest, inspect_sensevoice,
        load_selected_sensevoice_model, production_manifest as sensevoice_manifest,
        ready_sensevoice_paths, save_selected_sensevoice_model, sensevoice_root,
        SenseVoiceDownloadProgress, SenseVoiceModelId, SenseVoiceStatus,
    },
    subtitles::{optional_timed_captions, source_platform, SourcePlatform, TimedCaption},
    task_store::{HomeSnapshot, TaskRecord, TaskRecordInput, TaskRetryRequest, TaskState, TaskStore},
};
use chrono::Utc;
use serde::Serialize;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU8, Ordering};
use std::sync::Arc;
use std::time::Instant;
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_opener::OpenerExt;

// ---------------------------------------------------------------------------
// Legacy credential helpers (kept for backward compatibility)
// ---------------------------------------------------------------------------

const KEYRING_SERVICE: &str = "video-distiller";
const KEYRING_USER: &str = "api-key";

/// Normalize an optional task request payload to the established defaults.
pub fn task_options_or_default(options: Option<TaskOptions>) -> TaskOptions {
    options.unwrap_or_default()
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
/// TranscriptionRoute
pub enum TranscriptionRoute {
    Captions,
    Sensevoice,
    Profile,
}

/// select transcription route
pub fn select_transcription_route(
    captions_available: bool,
    mode: Option<TranscriptionMode>,
) -> TranscriptionRoute {
    if captions_available {
        TranscriptionRoute::Captions
    } else if mode == Some(TranscriptionMode::SensevoiceCpu) {
        TranscriptionRoute::Sensevoice
    } else {
        TranscriptionRoute::Profile
    }
}

/// Save an API key to Windows Credential Manager (legacy).
pub fn save_api_key(key: &str) -> Result<(), AppError> {
    if key.is_empty() {
        return Err(AppError::new(
            "invalid_key",
            "API Key 不能为空。",
            "请输入有效的 API Key。",
        ));
    }
    let entry = keyring::Entry::new(KEYRING_SERVICE, KEYRING_USER).map_err(|e| {
        AppError::new(
            "credential_error",
            format!("凭据管理器初始化失败: {}", e),
            "请检查系统凭据管理器是否可用。",
        )
    })?;
    entry.set_password(key).map_err(|e| {
        AppError::new(
            "credential_error",
            format!("保存 API Key 失败: {}", e),
            "请检查系统凭据管理器权限。",
        )
    })?;
    Ok(())
}

/// Load an API key from Windows Credential Manager (legacy).
pub fn load_api_key() -> Result<String, AppError> {
    let entry = keyring::Entry::new(KEYRING_SERVICE, KEYRING_USER).map_err(|_| {
        AppError::new(
            "key_not_found",
            "未找到 API Key。",
            "请在设置中输入 API Key。",
        )
    })?;
    entry.get_password().map_err(|_| {
        AppError::new(
            "key_not_found",
            "未找到 API Key。",
            "请在设置中输入 API Key。",
        )
    })
}

// ---------------------------------------------------------------------------
// FallbackEventSink trait and production implementation
// ---------------------------------------------------------------------------

/// Trait for emitting provider-fallback events.
///
/// Production: `TauriFallbackEventSink` uses the Tauri event system.
/// Test: `RecordingEventSink` captures events in a Vec.
pub trait FallbackEventSink: Send + Sync {
    fn emit_fallback(&self, task_id: &str, event: &ProviderFallbackEvent);
}

/// Production implementation that emits via Tauri's event system.
pub struct TauriFallbackEventSink {
    app: AppHandle,
}

impl TauriFallbackEventSink {
    /// new
    pub fn new(app: AppHandle) -> Self {
        Self { app }
    }
}

impl FallbackEventSink for TauriFallbackEventSink {
    fn emit_fallback(&self, task_id: &str, event: &ProviderFallbackEvent) {
        let _ = self
            .app
            .emit(&format!("provider-fallback:{}", task_id), event);
    }
}

/// Test implementation that records events.
pub struct RecordingEventSink {
    pub events: std::sync::Mutex<Vec<(String, ProviderFallbackEvent)>>,
}

impl RecordingEventSink {
    /// new
    pub fn new() -> Self {
        Self {
            events: std::sync::Mutex::new(Vec::new()),
        }
    }
}

impl FallbackEventSink for RecordingEventSink {
    fn emit_fallback(&self, task_id: &str, event: &ProviderFallbackEvent) {
        self.events
            .lock()
            .unwrap()
            .push((task_id.to_string(), event.clone()));
    }
}

// ---------------------------------------------------------------------------
// Production managed services (managed Tauri state)
// ---------------------------------------------------------------------------

/// Production state grouping all managed resources for the profile layer.
///
/// `credential_backend` is stored as a `Box<dyn CredentialBackend>` so tests
/// can inject `InMemoryBackend` while production uses `KeyringBackend`.
pub struct ManagedServices {
    pub profile_path: PathBuf,
    pub preferences_path: PathBuf,
    pub history_path: PathBuf,
    pub capability_path: PathBuf,
    pub transcription_registry: TranscriptionRegistry,
    pub summary_registry: SummaryRegistry,
    credential_backend: Box<dyn CredentialBackend>,
}

impl ManagedServices {
    /// Create a new `ManagedServices` bound to the given profile file path.
    pub fn new(profile_path: PathBuf) -> Self {
        let preferences_path = profile_path.with_file_name("preferences.json");
        let history_path = profile_path.with_file_name("history.sqlite");
        let capability_path = profile_path.with_file_name("capabilities.json");
        Self {
            profile_path,
            preferences_path,
            history_path,
            capability_path,
            transcription_registry: TranscriptionRegistry::new(),
            summary_registry: SummaryRegistry::new(),
            credential_backend: Box::new(KeyringBackend),
        }
    }

    /// Create a `ManagedServices` with a custom credential backend (for tests).
    pub fn new_with_backend(
        profile_path: PathBuf,
        backend: impl CredentialBackend + 'static,
    ) -> Self {
        let preferences_path = profile_path.with_file_name("preferences.json");
        let history_path = profile_path.with_file_name("history.sqlite");
        let capability_path = profile_path.with_file_name("capabilities.json");
        Self {
            profile_path,
            preferences_path,
            history_path,
            capability_path,
            transcription_registry: TranscriptionRegistry::new(),
            summary_registry: SummaryRegistry::new(),
            credential_backend: Box::new(backend),
        }
    }

    /// Create a temporary `ProfileStore` for the managed path.
    pub fn profile_store(&self) -> ProfileStore {
        ProfileStore::new(self.profile_path.clone())
    }

    /// Create a `PreferencesStore` beside the managed profile file.
    pub fn preferences_store(&self) -> PreferencesStore {
        PreferencesStore::new(self.preferences_path.clone())
    }

    /// capability store
    pub fn capability_store(&self) -> CapabilityStore {
        CapabilityStore::new(self.capability_path.clone())
    }

    /// data management service
    pub fn data_management_service(&self) -> Result<DataManagementService, AppError> {
        let app_data_root = self.profile_path.parent().ok_or_else(|| {
            AppError::new(
                "app_data_unavailable",
                "应用数据目录不可用。",
                "请重新启动应用后重试。",
            )
        })?;
        Ok(DataManagementService::new(
            app_data_root,
            std::env::temp_dir().join("video-distiller"),
        ))
    }

    /// capability output root
    pub fn capability_output_root(&self) -> Result<PathBuf, AppError> {
        self.profile_path.parent().map(PathBuf::from).ok_or_else(|| {
            AppError::new(
                "capability_output_unavailable",
                "AI 能力输出目录不可用。",
                "请重启应用后重试。",
            )
        })
    }

    /// The model root is derived solely from the app-data profile location;
    /// callers cannot provide an arbitrary filesystem path.
    pub fn local_model_root(&self) -> Result<PathBuf, AppError> {
        let app_data_dir = self.profile_path.parent().ok_or_else(|| {
            AppError::new(
                "local_model_root_unavailable",
                "本地模型目录不可用。",
                "请重启应用后重试。",
            )
        })?;
        Ok(local_model_root(app_data_dir))
    }

    /// cuda runtime root
    pub fn cuda_runtime_root(&self) -> Result<PathBuf, AppError> {
        let app_data_dir = self.profile_path.parent().ok_or_else(|| {
            AppError::new(
                "cuda_runtime_root_unavailable",
                "CUDA 加速组件目录不可用。",
                "请重启应用后重试，CPU 转写仍可使用。",
            )
        })?;
        Ok(cuda_runtime_root(app_data_dir))
    }

    /// sensevoice root
    pub fn sensevoice_root(&self) -> Result<PathBuf, AppError> {
        let app_data_dir = self.profile_path.parent().ok_or_else(|| {
            AppError::new(
                "sensevoice_root_unavailable",
                "SenseVoice 组件目录不可用。",
                "请重启应用后重试。",
            )
        })?;
        Ok(sensevoice_root(app_data_dir))
    }

    /// Create a `CredentialStore` using the configured backend.
    pub fn credential_store(&self) -> CredentialStore {
        CredentialStore::new_from_box(self.credential_backend.make_clone_box())
    }

    /// Create a separate store for manually entered download Cookies. It uses
    /// the same injectable backend but a different service/account namespace.
    pub fn download_cookie_store(&self) -> DownloadCookieStore {
        DownloadCookieStore::new_from_box(self.credential_backend.make_clone_box())
    }
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
/// DownloadCookieStatus
pub struct DownloadCookieStatus {
    pub bilibili: bool,
    pub douyin: bool,
    pub youtube: bool,
}

fn parse_download_platform(
    value: &str,
) -> Result<crate::services::download::VideoPlatform, AppError> {
    match value {
        "bilibili" => Ok(crate::services::download::VideoPlatform::Bilibili),
        "douyin" => Ok(crate::services::download::VideoPlatform::Douyin),
        "youtube" => Ok(crate::services::download::VideoPlatform::Youtube),
        _ => Err(AppError::new(
            "invalid_platform",
            "不支持的下载平台。",
            "请选择 B站、抖音或 YouTube。",
        )),
    }
}

/// Testable implementation behind the Tauri status command. It intentionally
/// returns booleans only and never reads cookie values into the UI.
pub fn download_cookie_status(
    services: &ManagedServices,
) -> Result<DownloadCookieStatus, AppError> {
    let store = services.download_cookie_store();
    Ok(DownloadCookieStatus {
        bilibili: store.has(crate::services::download::VideoPlatform::Bilibili)?,
        douyin: store.has(crate::services::download::VideoPlatform::Douyin)?,
        youtube: store.has(crate::services::download::VideoPlatform::Youtube)?,
    })
}

/// save download cookie for services
pub fn save_download_cookie_for_services(
    services: &ManagedServices,
    platform: &str,
    cookie: &str,
) -> Result<(), AppError> {
    services
        .download_cookie_store()
        .set(parse_download_platform(platform)?, cookie)
}

/// delete download cookie for services
pub fn delete_download_cookie_for_services(
    services: &ManagedServices,
    platform: &str,
) -> Result<(), AppError> {
    services
        .download_cookie_store()
        .delete(parse_download_platform(platform)?)
}

#[tauri::command]
/// get download cookie status
pub fn get_download_cookie_status(
    services: State<'_, ManagedServices>,
) -> Result<DownloadCookieStatus, AppError> {
    download_cookie_status(&services)
}

#[tauri::command]
/// save download cookie
pub fn save_download_cookie(
    platform: String,
    cookie: String,
    services: State<'_, ManagedServices>,
) -> Result<(), AppError> {
    save_download_cookie_for_services(&services, &platform, &cookie)
}

#[tauri::command]
/// delete download cookie
pub fn delete_download_cookie(
    platform: String,
    services: State<'_, ManagedServices>,
) -> Result<(), AppError> {
    delete_download_cookie_for_services(&services, &platform)
}

/// Return recent completed notes. Storage failures use a redacted app error.
#[tauri::command]
/// get home snapshot
pub fn get_home_snapshot(services: State<'_, ManagedServices>) -> Result<HomeSnapshot, AppError> {
    let history = HistoryStore::open(services.history_path.clone())?;
    let tasks = TaskStore::open(services.history_path.clone())?;
    let mut library_query = LibraryQuery::default();
    library_query.limit = 4;
    let library = history.search_library(&library_query)?;
    let mut recent_tasks = tasks.list_tasks("")?;
    let task_count = recent_tasks.len() as u64;
    recent_tasks.truncate(5);
    let profiles = services.profile_store().load()?;
    let current_model = profiles
        .active_transcription_profile_id
        .as_ref()
        .and_then(|active_id| {
            profiles
                .transcription_profiles
                .iter()
                .find(|profile| &profile.id == active_id && profile.provider == TranscriptionProviderKind::LocalWhisperCpp)
        })
        .map(|profile| profile.model.as_str());
    let ready_local_model_count = inspect_models(&services.local_model_root()?, current_model)
        .into_iter()
        .filter(|model| model.state == LocalModelState::Ready)
        .count() as u64;
    Ok(HomeSnapshot {
        note_count: library.total,
        task_count,
        ready_local_model_count,
        recent_notes: library.entries,
        recent_tasks,
    })
}

#[tauri::command]
/// list task records
pub fn list_task_records(
    services: State<'_, ManagedServices>,
    query: String,
) -> Result<Vec<TaskRecord>, AppError> {
    TaskStore::open(services.history_path.clone())?.list_tasks(&query)
}

#[tauri::command]
/// retry task record
pub fn retry_task_record(
    services: State<'_, ManagedServices>,
    id: i64,
) -> Result<TaskRetryRequest, AppError> {
    TaskStore::open(services.history_path.clone())?.retry_request(id)
}

#[tauri::command]
/// search library
pub fn search_library(
    services: State<'_, ManagedServices>,
    query: LibraryQuery,
) -> Result<LibrarySnapshot, AppError> {
    HistoryStore::open(services.history_path.clone())?.search_library(&query)
}

#[tauri::command]
/// set note favorite
pub fn set_note_favorite(
    services: State<'_, ManagedServices>,
    id: i64,
    favorite: bool,
) -> Result<LibraryEntry, AppError> {
    HistoryStore::open(services.history_path.clone())?.set_favorite(id, favorite)
}

#[tauri::command]
/// set note tags
pub fn set_note_tags(
    services: State<'_, ManagedServices>,
    id: i64,
    tags: Vec<String>,
) -> Result<LibraryEntry, AppError> {
    HistoryStore::open(services.history_path.clone())?.set_tags(id, &tags)
}

#[tauri::command]
/// mark note opened
pub fn mark_note_opened(
    services: State<'_, ManagedServices>,
    id: i64,
) -> Result<LibraryEntry, AppError> {
    HistoryStore::open(services.history_path.clone())?.mark_opened(id)
}

/// Return recent completed notes. Storage failures use a redacted app error.
#[tauri::command]
/// list history
pub fn list_history(services: State<'_, ManagedServices>) -> Result<Vec<HistoryEntry>, AppError> {
    HistoryStore::open(services.history_path.clone())?.list()
}

#[tauri::command]
/// search history
pub fn search_history(
    services: State<'_, ManagedServices>,
    query: String,
) -> Result<Vec<HistoryEntry>, AppError> {
    HistoryStore::open(services.history_path.clone())?.search(&query)
}

#[tauri::command]
/// get history
pub fn get_history(
    services: State<'_, ManagedServices>,
    id: i64,
) -> Result<Option<HistoryEntry>, AppError> {
    HistoryStore::open(services.history_path.clone())?.get(id)
}

/// Return only the Markdown content owned by the selected history row.
/// Accepting an ID instead of a path keeps arbitrary filesystem reads outside
/// the Tauri command surface.
#[tauri::command]
/// get history markdown
pub fn get_history_markdown(
    services: State<'_, ManagedServices>,
    id: i64,
) -> Result<String, AppError> {
    HistoryStore::open(services.history_path.clone())?.read_markdown(id)
}

#[tauri::command]
/// delete history
pub fn delete_history(services: State<'_, ManagedServices>, id: i64) -> Result<(), AppError> {
    HistoryStore::open(services.history_path.clone())?.delete(id)
}

/// Ask about exactly one stored history entry using the already-selected
/// summary profile and its existing credential. This command does not accept a
/// profile or arbitrary file path, preventing cross-note context expansion.
#[tauri::command]
/// ask history note
pub async fn ask_history_note(
    services: State<'_, ManagedServices>,
    id: i64,
    question: String,
) -> Result<Vec<NoteChatTurn>, AppError> {
    let store = HistoryStore::open(services.history_path.clone())?;
    ask_history_note_with_resolver(&store, id, &question, || {
        let profiles = services.profile_store().load()?;
        let active_id = profiles.active_summary_profile_id.ok_or_else(|| {
            AppError::new(
                "profile_not_found",
                "未找到已启用的总结配置档。",
                "请在设置中选择总结配置档。",
            )
        })?;
        let profile = profiles
            .summary_profiles
            .iter()
            .find(|profile| profile.id == active_id && profile.enabled)
            .ok_or_else(|| {
                AppError::new(
                    "profile_not_found",
                    "未找到已启用的总结配置档。",
                    "请在设置中选择总结配置档。",
                )
            })?
            .clone();
        let secret = services.credential_store().get("summary", &active_id)?;
        let adapter = services
            .summary_registry
            .get(&profile.provider)
            .map_err(|error| error.into_app_error())?;
        Ok((adapter, profile, secret))
    })
    .await
}

/// Testable command-policy seam: missing history is rejected before profile,
/// credential, registry, or adapter resolution.
pub async fn ask_history_note_with_resolver<'a, F>(
    store: &HistoryStore,
    id: i64,
    question: &str,
    resolve_summary: F,
) -> Result<Vec<NoteChatTurn>, AppError>
where
    F: FnOnce() -> Result<(&'a dyn SummaryAdapter, SummaryProfile, SecretPayload), AppError>,
{
    if store.get(id)?.is_none() {
        return Err(AppError::new(
            "history_missing",
            "历史记录不存在。",
            "请刷新历史列表后重试。",
        ));
    }
    let (adapter, profile, secret) = resolve_summary()?;
    ask_note_with(
        store,
        id,
        question,
        adapter,
        &profile,
        &secret,
        &AtomicBool::new(false),
    )
    .await
}

// ===========================================================================
//  Tauri Commands — Application preferences and result files
// ===========================================================================

#[tauri::command]
/// get preferences
pub fn get_preferences(services: State<'_, ManagedServices>) -> Result<AppPreferences, AppError> {
    services.preferences_store().load()
}

#[tauri::command]
/// set markdown output dir
pub fn set_markdown_output_dir(
    services: State<'_, ManagedServices>,
    path: Option<String>,
) -> Result<AppPreferences, AppError> {
    let store = services.preferences_store();
    let mut preferences = store.load()?;
    preferences.markdown_output_dir = path.map(|value| value.trim().to_string());
    store.save(&preferences)?;
    Ok(preferences)
}

#[tauri::command]
/// get export preferences
pub fn get_export_preferences(
    services: State<'_, ManagedServices>,
) -> Result<ExportPreferences, AppError> {
    Ok(services.preferences_store().load()?.export)
}

#[tauri::command]
/// save export preferences
pub fn save_export_preferences(
    preferences: ExportPreferences,
    services: State<'_, ManagedServices>,
) -> Result<ExportPreferences, AppError> {
    let store = services.preferences_store();
    let mut app_preferences = store.load()?;
    app_preferences.export = preferences.clone();
    store.save(&app_preferences)?;
    Ok(preferences)
}

#[tauri::command]
/// restore export preferences
pub fn restore_export_preferences(
    services: State<'_, ManagedServices>,
) -> Result<ExportPreferences, AppError> {
    let store = services.preferences_store();
    let mut app_preferences = store.load()?;
    app_preferences.export = ExportPreferences::default();
    store.save(&app_preferences)?;
    Ok(app_preferences.export)
}

#[tauri::command]
/// export note
pub fn export_note(
    title: String,
    markdown: String,
    format: ExportFormat,
    services: State<'_, ManagedServices>,
) -> Result<String, AppError> {
    let preferences = services.preferences_store().load()?;
    let output_root = resolve_markdown_output_dir(&preferences)?;
    let filename = safe_export_filename(&title, format);
    let output_path = output_root.join(filename);
    std::fs::write(&output_path, serialize_note(format, &title, &markdown)).map_err(|error| {
        AppError::new(
            "export_write_failed",
            format!("无法写入导出文件: {error}"),
            "请检查导出目录权限后重试。",
        )
    })?;
    Ok(output_path.to_string_lossy().into_owned())
}

#[tauri::command]
/// get cache usage
pub fn get_cache_usage(services: State<'_, ManagedServices>) -> Result<CacheUsage, AppError> {
    services.data_management_service()?.cache_usage()
}

#[tauri::command]
/// clear cache
pub fn clear_cache(
    category: CacheCategory,
    services: State<'_, ManagedServices>,
) -> Result<CacheClearResult, AppError> {
    services.data_management_service()?.clear_cache(category)
}

#[tauri::command]
/// list logs
pub fn list_logs(
    services: State<'_, ManagedServices>,
) -> Result<Vec<LogDescriptor>, AppError> {
    services.data_management_service()?.list_logs()
}

#[tauri::command]
/// read log
pub fn read_log(
    id: String,
    max_bytes: Option<usize>,
    services: State<'_, ManagedServices>,
) -> Result<LogTail, AppError> {
    services
        .data_management_service()?
        .read_log(&id, max_bytes.unwrap_or(MAX_LOG_TAIL_BYTES))
}

#[tauri::command]
/// set log level
pub fn set_log_level(
    level: LogLevel,
    services: State<'_, ManagedServices>,
) -> Result<LogLevel, AppError> {
    let store = services.preferences_store();
    let mut preferences = store.load()?;
    preferences.log_level = level;
    store.save(&preferences)?;
    Ok(level)
}

#[tauri::command]
/// clear logs
pub fn clear_logs(services: State<'_, ManagedServices>) -> Result<u64, AppError> {
    services.data_management_service()?.clear_logs()
}

#[tauri::command]
/// save appearance preferences
pub fn save_appearance_preferences(
    appearance: AppearancePreferences,
    services: State<'_, ManagedServices>,
) -> Result<AppPreferences, AppError> {
    let store = services.preferences_store();
    let mut preferences = store.load()?;
    preferences.appearance = appearance;
    store.save(&preferences)?;
    Ok(preferences)
}

#[tauri::command]
/// get about snapshot
pub fn get_about_snapshot(
    services: State<'_, ManagedServices>,
) -> Result<AboutSnapshot, AppError> {
    let data = services.data_management_service()?;
    let preferences = services.preferences_store().load()?;
    let export_dir = resolve_markdown_output_dir(&preferences)?;
    let package: serde_json::Value = serde_json::from_str(include_str!("../../package.json"))
        .unwrap_or_default();
    let react_version = package
        .pointer("/dependencies/react")
        .and_then(serde_json::Value::as_str)
        .unwrap_or("unknown")
        .trim_start_matches(['^', '~', '=']);
    let sensevoice_ready = data.app_data_root().join("models/sensevoice").exists();
    let whisper_ready = data.app_data_root().join("models/whisper.cpp").exists();
    Ok(AboutSnapshot {
        app_version: env!("CARGO_PKG_VERSION").to_string(),
        tauri_version: tauri::VERSION.to_string(),
        frontend_version: format!("React {react_version}"),
        rust_version: option_env!("VIDEO_DISTILLER_RUST_VERSION")
            .unwrap_or("Rust version unavailable")
            .to_string(),
        app_data_dir: data.app_data_root().to_string_lossy().into_owned(),
        export_dir: export_dir.to_string_lossy().into_owned(),
        log_dir: data.log_root().to_string_lossy().into_owned(),
        components: vec![
            AboutComponent {
                name: "SenseVoice".to_string(),
                version: format!("{:?}", preferences.sensevoice_model).to_lowercase(),
                status: if sensevoice_ready { "ready" } else { "not_installed" }.to_string(),
                license: "MIT".to_string(),
            },
            AboutComponent {
                name: "whisper.cpp".to_string(),
                version: "bundled runtime".to_string(),
                status: if whisper_ready { "ready" } else { "model_required" }.to_string(),
                license: "MIT".to_string(),
            },
            AboutComponent {
                name: "Tauri".to_string(),
                version: tauri::VERSION.to_string(),
                status: "ready".to_string(),
                license: "Apache-2.0 / MIT".to_string(),
            },
        ],
    })
}

#[tauri::command]
/// open app data directory
pub fn open_app_data_directory(
    app: AppHandle,
    services: State<'_, ManagedServices>,
) -> Result<(), AppError> {
    let data = services.data_management_service()?;
    std::fs::create_dir_all(data.app_data_root()).map_err(open_path_error)?;
    open_registered_path(&app, data.app_data_root())
}

#[tauri::command]
/// open export directory
pub fn open_export_directory(
    app: AppHandle,
    services: State<'_, ManagedServices>,
) -> Result<(), AppError> {
    let preferences = services.preferences_store().load()?;
    let directory = resolve_markdown_output_dir(&preferences)?;
    open_registered_path(&app, &directory)
}

#[tauri::command]
/// open log directory
pub fn open_log_directory(
    app: AppHandle,
    services: State<'_, ManagedServices>,
) -> Result<(), AppError> {
    let directory = services.data_management_service()?.log_root();
    std::fs::create_dir_all(&directory).map_err(open_path_error)?;
    open_registered_path(&app, &directory)
}

#[tauri::command]
/// open documentation
pub fn open_documentation(
    app: AppHandle,
    services: State<'_, ManagedServices>,
) -> Result<(), AppError> {
    let documentation_root = services
        .data_management_service()?
        .app_data_root()
        .join("documentation");
    std::fs::create_dir_all(&documentation_root).map_err(open_path_error)?;
    let readme_path = documentation_root.join("README.md");
    std::fs::write(&readme_path, include_str!("../../README.md")).map_err(open_path_error)?;
    open_registered_path(&app, &readme_path)
}

fn open_registered_path(app: &AppHandle, path: &std::path::Path) -> Result<(), AppError> {
    app.opener()
        .open_path(path.to_string_lossy(), None::<&str>)
        .map_err(|error| {
            AppError::new(
                "open_path_failed",
                format!("无法打开指定位置: {error}"),
                "请在应用数据目录中手动打开该位置。",
            )
        })
}

fn open_path_error(error: std::io::Error) -> AppError {
    AppError::new(
        "open_path_failed",
        format!("无法准备指定位置: {error}"),
        "请检查目录权限后重试。",
    )
}

fn safe_export_filename(title: &str, format: ExportFormat) -> String {
    let mut stem = title
        .trim()
        .chars()
        .filter(|character| character.is_alphanumeric() || matches!(character, ' ' | '-' | '_'))
        .take(80)
        .collect::<String>();
    if stem.is_empty() {
        stem = "video-distiller-note".to_string();
    }
    let extension = match format {
        ExportFormat::Markdown => "md",
        ExportFormat::Html => "html",
        ExportFormat::Text => "txt",
    };
    format!("{stem}.{extension}")
}

#[tauri::command]
/// copy markdown result
pub fn copy_markdown_result(
    source_path: String,
    destination_path: String,
) -> Result<String, AppError> {
    copy_markdown_file(
        std::path::Path::new(&source_path),
        std::path::Path::new(&destination_path),
    )
    .map(|path| path.to_string_lossy().into_owned())
}

// ---------------------------------------------------------------------------
// Cancellation state (unchanged from Stage 00)
// ---------------------------------------------------------------------------

/// Shared application state for cancellation.
pub struct AppState {
    pub cancellation_tokens: std::sync::Mutex<std::collections::HashMap<String, Arc<AtomicBool>>>,
    pub cuda_operation_active: AtomicBool,
    pub sensevoice_operation_active: AtomicBool,
    pub sensevoice_download_cancel: Arc<AtomicBool>,
}

impl AppState {
    /// new
    pub fn new() -> Self {
        Self {
            cancellation_tokens: std::sync::Mutex::new(std::collections::HashMap::new()),
            cuda_operation_active: AtomicBool::new(false),
            sensevoice_operation_active: AtomicBool::new(false),
            sensevoice_download_cancel: Arc::new(AtomicBool::new(false)),
        }
    }
}

// ===========================================================================
//  Tauri Commands — Profile CRUD
// ===========================================================================

/// Return all profiles.
#[tauri::command]
/// get profiles
pub fn get_profiles(services: State<'_, ManagedServices>) -> Result<AppProfiles, AppError> {
    let store = services.profile_store();
    store.load()
}

/// Return the immutable reviewed models.dev provider snapshot.
#[tauri::command]
/// get summary provider catalog
pub fn get_summary_provider_catalog() -> Result<Vec<SummaryProviderCatalogEntry>, AppError> {
    Ok(summary_catalog()?.providers.clone())
}

/// Return registry-backed local model status without touching credentials.
#[tauri::command]
/// list local models
pub fn list_local_models(
    services: State<'_, ManagedServices>,
) -> Result<Vec<LocalModelStatus>, AppError> {
    let profiles = services.profile_store().load()?;
    let current_id = profiles
        .transcription_profiles
        .iter()
        .find(|profile| profile.provider == TranscriptionProviderKind::LocalWhisperCpp)
        .and_then(|profile| (!profile.model.is_empty()).then_some(profile.model.as_str()));
    Ok(inspect_models(&services.local_model_root()?, current_id))
}

/// Download one fixed registry model and emit redacted progress only.
#[tauri::command]
/// download local model
pub async fn download_local_model(
    model_id: String,
    app: AppHandle,
    services: State<'_, ManagedServices>,
) -> Result<(), AppError> {
    // Validate before root creation or any network operation.
    if descriptor(&model_id).is_none() {
        return Err(AppError::new(
            "local_model_unknown",
            "未知的本地 Whisper 模型。",
            "请选择受支持的本地模型。",
        ));
    }
    let root = services.local_model_root()?;
    let event_model_id = model_id.clone();
    tokio::task::spawn_blocking(move || {
        download_model(
            &root,
            &model_id,
            &ReqwestModelHttpClient,
            |downloaded_bytes, total_bytes| {
                let _ = app.emit(
                    "local-model-download-progress",
                    LocalModelDownloadProgress {
                        model_id: event_model_id.clone(),
                        downloaded_bytes,
                        total_bytes,
                    },
                );
            },
        )
        .map(|_| ())
    })
    .await
    .map_err(|_| {
        AppError::new(
            "local_model_download_failed",
            "本地 Whisper 模型下载失败。",
            "请检查网络和磁盘空间后重试。",
        )
    })?
}

/// Delete a fixed model only inside the app-owned model root. Deleting the
/// selected local model requires confirmation and clears that selection.
#[tauri::command]
/// delete local model
pub fn delete_local_model(
    model_id: String,
    confirmed_current_delete: bool,
    services: State<'_, ManagedServices>,
) -> Result<(), AppError> {
    // Validate before any filesystem work.
    let descriptor = descriptor(&model_id).ok_or_else(|| {
        AppError::new(
            "local_model_unknown",
            "未知的本地 Whisper 模型。",
            "请选择受支持的本地模型。",
        )
    })?;
    let profile_store = services.profile_store();
    let mut profiles = profile_store.load()?;
    let local_profile = profiles
        .transcription_profiles
        .iter_mut()
        .find(|profile| profile.provider == TranscriptionProviderKind::LocalWhisperCpp);
    let is_current = local_profile
        .as_ref()
        .is_some_and(|profile| profile.model == model_id);
    delete_model(
        &services.local_model_root()?,
        descriptor,
        is_current,
        confirmed_current_delete,
    )?;
    if is_current {
        if let Some(profile) = local_profile {
            profile.model.clear();
        }
        profile_store.save(&profiles)?;
    }
    Ok(())
}

#[tauri::command]
/// get cuda runtime status
pub fn get_cuda_runtime_status(
    services: State<'_, ManagedServices>,
) -> Result<CudaRuntimeStatus, AppError> {
    let preferences = services.preferences_store().load()?;
    Ok(inspect_cuda_runtime(
        &services.cuda_runtime_root()?,
        preferences.local_compute_mode,
        &NvidiaSmiProbe,
    ))
}

#[tauri::command]
/// set local compute mode
pub fn set_local_compute_mode(
    mode: LocalComputeMode,
    services: State<'_, ManagedServices>,
) -> Result<AppPreferences, AppError> {
    let store = services.preferences_store();
    let mut preferences = store.load()?;
    preferences.local_compute_mode = mode;
    store.save(&preferences)?;
    Ok(preferences)
}

#[tauri::command]
/// set transcription preferences
pub fn set_transcription_preferences(
    transcription_mode: TranscriptionMode,
    sensevoice_languages: Vec<SenseVoiceLanguage>,
    services: State<'_, ManagedServices>,
) -> Result<AppPreferences, AppError> {
    if sensevoice_languages.is_empty() {
        return Err(AppError::new(
            "sensevoice_languages_empty",
            "SenseVoice 至少需要一种识别语言。",
            "请至少选择一种识别语言。",
        ));
    }
    let store = services.preferences_store();
    let mut preferences = store.load()?;
    preferences.transcription_mode = transcription_mode;
    preferences.sensevoice_languages = sensevoice_languages;
    store.save(&preferences)?;
    Ok(preferences)
}

#[tauri::command]
/// download cuda runtime
pub async fn download_cuda_runtime(
    app: AppHandle,
    state: State<'_, AppState>,
    services: State<'_, ManagedServices>,
) -> Result<(), AppError> {
    let preferences = services.preferences_store().load()?;
    let root = services.cuda_runtime_root()?;
    let status = inspect_cuda_runtime(&root, preferences.local_compute_mode, &NvidiaSmiProbe);
    match status.state {
        CudaRuntimeState::Ready => return Ok(()),
        CudaRuntimeState::NotInstalled | CudaRuntimeState::Error => {}
        CudaRuntimeState::Unavailable | CudaRuntimeState::Incompatible => {
            return Err(AppError::new(
                "cuda_runtime_unavailable",
                "当前设备无法安装 CUDA 加速组件。",
                "请继续使用 CPU 转写，或更新 NVIDIA 驱动后重新检测。",
            ));
        }
        CudaRuntimeState::Downloading => {
            return Err(AppError::new(
                "cuda_runtime_busy",
                "CUDA 加速组件正在下载。",
                "请等待当前下载完成。",
            ));
        }
    }
    if state
        .cuda_operation_active
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .is_err()
    {
        return Err(AppError::new(
            "cuda_runtime_busy",
            "CUDA 加速组件操作正在进行。",
            "请等待当前操作完成。",
        ));
    }

    let joined = tokio::task::spawn_blocking(move || {
        download_cuda_runtime_with_client(
            &root,
            &ReqwestCudaHttpClient,
            |downloaded_bytes, total_bytes| {
                let _ = app.emit(
                    "cuda-runtime-download-progress",
                    CudaRuntimeDownloadProgress {
                        downloaded_bytes,
                        total_bytes,
                    },
                );
            },
        )
    })
    .await;
    state.cuda_operation_active.store(false, Ordering::SeqCst);
    joined.map_err(|_| {
        AppError::new(
            "cuda_runtime_download_failed",
            "CUDA 加速组件下载任务异常结束。",
            "请重试，CPU 转写仍可使用。",
        )
    })?
}

#[tauri::command]
/// delete cuda runtime
pub fn delete_cuda_runtime(
    state: State<'_, AppState>,
    services: State<'_, ManagedServices>,
) -> Result<(), AppError> {
    let task_active = !state
        .cancellation_tokens
        .lock()
        .map_err(|_| AppError::new("cuda_runtime_busy", "无法确认任务状态。", "请重启应用后重试。"))?
        .is_empty();
    let in_use = task_active || state.cuda_operation_active.load(Ordering::SeqCst);
    remove_cuda_runtime(&services.cuda_runtime_root()?, in_use)
}

#[tauri::command]
/// get sensevoice status
pub fn get_sensevoice_status(
    services: State<'_, ManagedServices>,
) -> Result<SenseVoiceStatus, AppError> {
    let root = services.sensevoice_root()?;
    let selected = load_selected_sensevoice_model(&root)?;
    Ok(inspect_sensevoice(&root, selected, &sensevoice_manifest()))
}

#[tauri::command]
/// download sensevoice
pub async fn download_sensevoice(
    model_id: SenseVoiceModelId,
    app: AppHandle,
    state: State<'_, AppState>,
    services: State<'_, ManagedServices>,
) -> Result<SenseVoiceStatus, AppError> {
    let root = services.sensevoice_root()?;
    if state
        .sensevoice_operation_active
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .is_err()
    {
        return Err(AppError::new(
            "sensevoice_download_busy",
            "SenseVoice 组件正在下载或删除。",
            "请等待当前操作完成。",
        ));
    }
    state
        .sensevoice_download_cancel
        .store(false, Ordering::SeqCst);
    let manifest = sensevoice_manifest();
    let cancel = state.sensevoice_download_cancel.clone();
    let download_root = root.clone();
    let joined = tokio::task::spawn_blocking(move || {
        download_sensevoice_for_manifest(
            &download_root,
            model_id,
            &manifest,
            &ReqwestArtifactHttpClient,
            &cancel,
            &|progress: SenseVoiceDownloadProgress| {
                let _ = app.emit("sensevoice-download-progress", progress);
            },
        )
    })
    .await;
    let result = joined.map_err(|_| {
        AppError::new(
            "sensevoice_download_failed",
            "SenseVoice 下载任务异常结束。",
            "请重试，现有转写服务仍可使用。",
        )
    })?
    .and_then(|_| {
        save_selected_sensevoice_model(&root, model_id)?;
        let store = services.preferences_store();
        let mut preferences = store.load()?;
        preferences.sensevoice_model = model_id;
        store.save(&preferences)?;
        Ok(inspect_sensevoice(
            &root,
            model_id,
            &sensevoice_manifest(),
        ))
    });
    state
        .sensevoice_operation_active
        .store(false, Ordering::SeqCst);
    state
        .sensevoice_download_cancel
        .store(false, Ordering::SeqCst);
    result
}

#[tauri::command]
/// cancel sensevoice download
pub fn cancel_sensevoice_download(state: State<'_, AppState>) -> Result<(), AppError> {
    if state.sensevoice_operation_active.load(Ordering::SeqCst) {
        state
            .sensevoice_download_cancel
            .store(true, Ordering::SeqCst);
    }
    Ok(())
}

#[tauri::command]
/// delete sensevoice
pub fn delete_sensevoice(
    model_id: SenseVoiceModelId,
    confirmed_selected_delete: bool,
    state: State<'_, AppState>,
    services: State<'_, ManagedServices>,
) -> Result<SenseVoiceStatus, AppError> {
    if state
        .sensevoice_operation_active
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .is_err()
    {
        return Err(AppError::new(
            "sensevoice_busy",
            "SenseVoice 组件正在使用。",
            "请等待当前操作结束后再删除。",
        ));
    }
    let result = (|| {
        if !state
            .cancellation_tokens
            .lock()
            .map_err(|_| {
                AppError::new(
                    "sensevoice_busy",
                    "无法确认 SenseVoice 使用状态。",
                    "请重启应用后重试。",
                )
            })?
            .is_empty()
        {
            return Err(AppError::new(
                "sensevoice_busy",
                "SenseVoice 组件正在使用。",
                "请等待任务结束后再删除。",
            ));
        }
        let root = services.sensevoice_root()?;
        let selected = load_selected_sensevoice_model(&root)?;
        let manifest = sensevoice_manifest();
        delete_sensevoice_model(
            &root,
            model_id,
            selected,
            confirmed_selected_delete,
            &manifest,
        )?;
        Ok(inspect_sensevoice(&root, selected, &manifest))
    })();
    state
        .sensevoice_operation_active
        .store(false, Ordering::SeqCst);
    result
}

#[tauri::command]
/// set sensevoice model
pub fn set_sensevoice_model(
    model_id: SenseVoiceModelId,
    state: State<'_, AppState>,
    services: State<'_, ManagedServices>,
) -> Result<SenseVoiceStatus, AppError> {
    if state
        .sensevoice_operation_active
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .is_err()
    {
        return Err(AppError::new(
            "sensevoice_busy",
            "SenseVoice 组件正在使用。",
            "请等待当前操作结束后再切换模型。",
        ));
    }
    let result = (|| {
        let root = services.sensevoice_root()?;
        let manifest = sensevoice_manifest();
        ready_sensevoice_paths(&root, model_id, &manifest)?;
        save_selected_sensevoice_model(&root, model_id)?;
        let store = services.preferences_store();
        let mut preferences = store.load()?;
        preferences.sensevoice_model = model_id;
        store.save(&preferences)?;
        Ok(inspect_sensevoice(&root, model_id, &manifest))
    })();
    state
        .sensevoice_operation_active
        .store(false, Ordering::SeqCst);
    result
}

/// Check whether a credential exists for a given profile type and ID.
/// Returns `true`/`false` only — never returns secret values.
#[tauri::command]
/// has profile credential
pub fn has_profile_credential(
    services: State<'_, ManagedServices>,
    profile_type: String,
    profile_id: String,
) -> Result<bool, AppError> {
    let cred_store = services.credential_store();
    cred_store.has(&profile_type, &profile_id)
}

/// Read a summary provider bearer credential after an explicit user action.
///
/// This command is intentionally limited to summary profiles and returns no
/// redacted placeholder. Callers must keep the value in transient memory and
/// must never log or persist it.
pub fn reveal_summary_profile_credential_for_services(
    services: &ManagedServices,
    profile_id: &str,
) -> Result<String, AppError> {
    match services.credential_store().get("summary", profile_id)? {
        SecretPayload::Bearer { api_key } => Ok(api_key),
        SecretPayload::Tencent { .. } => Err(AppError::new(
            "credential_type_unsupported",
            "当前凭据类型不支持显示。",
            "请重新输入凭据以替换现有配置。",
        )),
    }
}

#[tauri::command]
/// Reveal one saved summary provider bearer credential.
pub fn reveal_summary_profile_credential(
    services: State<'_, ManagedServices>,
    profile_id: String,
) -> Result<String, AppError> {
    reveal_summary_profile_credential_for_services(&services, &profile_id)
}

/// Save (create or update) a transcription profile with compensating rollback.
///
/// 1. Load profiles, apply mutation, and validate BEFORE credential write.
/// 2. Snapshot old credential (if any) before writing the new one.
/// 3. On JSON save failure, restore the previous credential state (or remove
///    the newly created credential if no previous state existed).
#[tauri::command]
/// save transcription profile
pub fn save_transcription_profile(
    services: State<'_, ManagedServices>,
    profile: TranscriptionProfile,
    credential: Option<SecretInput>,
) -> Result<AppProfiles, AppError> {
    let cred_store = services.credential_store();
    let profile_store = services.profile_store();
    let profile_id = profile.id.clone();

    // 0. Validate the proposed state BEFORE any credential mutation
    let mut profiles = profile_store.load()?;
    upsert_transcription_profile(&mut profiles, profile);
    profiles.validate().map_err(|e| {
        AppError::new(
            "validation_error",
            format!("配置验证失败: {}", e),
            "请检查配置是否正确。",
        )
    })?;

    // 1. If credential provided: snapshot old value, then save new credential
    if let Some(secret_input) = credential {
        let old_cred = match cred_store.get("transcription", &profile_id) {
            Ok(secret) => Some(secret),
            Err(e) if e.code == "credential_missing" => None,
            Err(e) => return Err(e), // backend error — surface it
        };
        let payload = secret_input.into_secret_payload()?;
        cred_store.set("transcription", &profile_id, &payload)?;

        // 2. Save JSON. On failure, rollback credential to previous state.
        match profile_store.save(&profiles) {
            Ok(()) => Ok(profiles),
            Err(json_err) => {
                match rollback_credential(&cred_store, "transcription", &profile_id, old_cred) {
                    Ok(()) => Err(json_err),
                    Err(rollback_err) => Err(AppError::new(
                        "rollback_error",
                        format!(
                            "凭据写入后配置保存失败，且凭据回滚也失败: {}. JSON错误: {}",
                            rollback_err.message, json_err.message
                        ),
                        "请手动在凭据管理器中修复凭据。",
                    )),
                }
            }
        }
    } else {
        // No credential update — just save profiles
        profile_store.save(&profiles)?;
        Ok(profiles)
    }
}

/// Save (create or update) a summary profile with compensating rollback.
#[tauri::command]
/// save summary profile
pub fn save_summary_profile(
    services: State<'_, ManagedServices>,
    profile: SummaryProfile,
    credential: Option<SecretInput>,
) -> Result<AppProfiles, AppError> {
    let cred_store = services.credential_store();
    let profile_store = services.profile_store();
    let profile_id = profile.id.clone();

    // 0. Validate the proposed state BEFORE any credential mutation
    let mut profiles = profile_store.load()?;
    upsert_summary_profile(&mut profiles, profile);
    profiles.validate().map_err(|e| {
        AppError::new(
            "validation_error",
            format!("配置验证失败: {}", e),
            "请检查配置是否正确。",
        )
    })?;

    // 1. If credential provided: snapshot old value, then save new credential
    if let Some(secret_input) = credential {
        let old_cred = match cred_store.get("summary", &profile_id) {
            Ok(secret) => Some(secret),
            Err(e) if e.code == "credential_missing" => None,
            Err(e) => return Err(e), // backend error — surface it
        };
        let payload = secret_input.into_secret_payload()?;
        cred_store.set("summary", &profile_id, &payload)?;

        // 2. Save JSON. On failure, rollback credential to previous state.
        match profile_store.save(&profiles) {
            Ok(()) => Ok(profiles),
            Err(json_err) => {
                match rollback_credential(&cred_store, "summary", &profile_id, old_cred) {
                    Ok(()) => Err(json_err),
                    Err(rollback_err) => Err(AppError::new(
                        "rollback_error",
                        format!(
                            "凭据写入后配置保存失败，且凭据回滚也失败: {}. JSON错误: {}",
                            rollback_err.message, json_err.message
                        ),
                        "请手动在凭据管理器中修复凭据。",
                    )),
                }
            }
        }
    } else {
        profile_store.save(&profiles)?;
        Ok(profiles)
    }
}

/// Save one catalog-backed summary profile and activate it in the same atomic
/// profile document write. Rust resolves the protocol from the embedded
/// provider catalog; callers cannot submit or override it.
#[tauri::command]
/// save and activate catalog summary profile
pub fn save_and_activate_catalog_summary_profile(
    provider_id: String,
    model: String,
    base_url_override: Option<String>,
    credential: Option<SecretInput>,
    services: State<'_, ManagedServices>,
) -> Result<AppProfiles, AppError> {
    save_and_activate_catalog_summary_profile_with_services(
        provider_id,
        model,
        base_url_override,
        credential,
        &services,
    )
}

/// save and activate catalog summary profile with services
pub fn save_and_activate_catalog_summary_profile_with_services(
    provider_id: String,
    model: String,
    base_url_override: Option<String>,
    credential: Option<SecretInput>,
    services: &ManagedServices,
) -> Result<AppProfiles, AppError> {
    let catalog_entry = summary_catalog_provider(&provider_id)?;
    let model = model.trim();
    if model.is_empty() {
        return Err(AppError::new(
            "summary_model_required",
            "AI 模型名称不能为空。",
            "请选择目录模型或输入自定义模型 ID。",
        ));
    }
    if catalog_entry
        .models
        .iter()
        .find(|entry| entry.id == model)
        .is_some_and(|entry| !entry.summary_eligible)
    {
        return Err(AppError::new(
            "summary_model_ineligible",
            "该模型不能用于文本总结。",
            "请选择支持文本输入和文本输出的模型。",
        ));
    }

    let base_url = base_url_override
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or(catalog_entry.base_url.as_str())
        .to_owned();
    let profile_id = format!("catalog-{}", catalog_entry.id);
    let profile = SummaryProfile {
        id: profile_id.clone(),
        name: catalog_entry.display_name.clone(),
        provider: match catalog_entry.protocol {
            SummaryProtocolKind::OpenAiCompatible => SummaryProviderKind::OpenAiCompatible,
            SummaryProtocolKind::OpenAiResponses => SummaryProviderKind::OpenAiResponses,
            SummaryProtocolKind::Anthropic => SummaryProviderKind::Anthropic,
            SummaryProtocolKind::Google => SummaryProviderKind::Google,
        },
        catalog_provider_id: Some(catalog_entry.id.clone()),
        base_url,
        model: model.to_owned(),
        enabled: true,
        built_in: true,
    };

    let profile_store = services.profile_store();
    let credential_store = services.credential_store();
    let mut proposed = profile_store.load()?;
    upsert_summary_profile(&mut proposed, profile);
    proposed.active_summary_profile_id = Some(profile_id.clone());
    proposed.validate().map_err(|_| {
        AppError::new(
            "validation_error",
            "AI 服务配置验证失败。",
            "请检查服务地址和模型名称。",
        )
    })?;

    let old_credential = match credential_store.get("summary", &profile_id) {
        Ok(secret) => Some(secret),
        Err(error) if error.code == "credential_missing" => None,
        Err(error) => return Err(error),
    };
    let new_credential = match credential {
        None => None,
        Some(SecretInput::Bearer { api_key }) if api_key.trim().is_empty() => None,
        Some(SecretInput::Bearer { api_key }) => Some(SecretPayload::Bearer { api_key }),
        Some(SecretInput::Tencent { .. }) => {
            return Err(AppError::new(
                "invalid_credential",
                "总结服务只接受 API Key 凭据。",
                "请填写服务商提供的 API Key。",
            ))
        }
    };
    if new_credential.is_none() && old_credential.is_none() {
        return Err(AppError::new(
            "credential_missing",
            "尚未配置该 AI 服务商的 API Key。",
            "请输入 API Key 后保存并启用。",
        ));
    }

    if let Some(ref payload) = new_credential {
        credential_store.set("summary", &profile_id, payload)?;
    }
    match profile_store.save(&proposed) {
        Ok(()) => Ok(proposed),
        Err(save_error) => {
            if new_credential.is_none() {
                return Err(save_error);
            }
            match rollback_credential(
                &credential_store,
                "summary",
                &profile_id,
                old_credential,
            ) {
                Ok(()) => Err(save_error),
                Err(_) => Err(AppError::new(
                    "rollback_error",
                    "AI 服务配置保存失败，且凭据回滚失败。",
                    "请重新打开设置并检查该服务商配置。",
                )),
            }
        }
    }
}

/// Delete a profile by type and ID with safe ordering and compensating rollback.
///
/// Safety ordering:
/// 1. Validate `profile_type` first.
/// 2. Load the existing profile document.
/// 3. Build and validate the proposed document (post-delete).
/// 4. Snapshot existing credential (propagate backend errors — do not collapse).
/// 5. Delete credential (tolerate NotFound; propagate other backend errors).
/// 6. Save the modified profiles JSON.
/// 7. On JSON save failure, restore credential; if restoration also fails,
///    surface both errors as a combined rollback error.
#[tauri::command]
/// delete profile
pub fn delete_profile(
    services: State<'_, ManagedServices>,
    profile_type: String,
    profile_id: String,
) -> Result<AppProfiles, AppError> {
    let cred_store = services.credential_store();
    let profile_store = services.profile_store();

    // 1. Validate profile_type before any mutation
    match profile_type.as_str() {
        "transcription" | "summary" => {}
        _ => {
            return Err(AppError::new(
                "invalid_profile_type",
                "不支持的配置档类型。",
                "请使用 'transcription' 或 'summary'。",
            ))
        }
    }

    // 2. Load the existing profile document and build+validate proposed state
    let profiles = profile_store.load()?;
    let profile_exists = match profile_type.as_str() {
        "transcription" => profiles
            .transcription_profiles
            .iter()
            .any(|p| p.id == profile_id),
        _ => profiles.summary_profiles.iter().any(|p| p.id == profile_id),
    };
    if !profile_exists {
        return Err(AppError::new(
            "profile_not_found",
            "未找到要删除的配置档。",
            "请检查配置档 ID。",
        ));
    }

    // Build proposed document (before credential mutation)
    let mut proposed = profiles.clone();
    match profile_type.as_str() {
        "transcription" => {
            proposed
                .transcription_profiles
                .retain(|p| p.id != profile_id);
            proposed.active_transcription_profile_id = proposed
                .active_transcription_profile_id
                .as_ref()
                .filter(|id| id.as_str() != profile_id)
                .cloned();
            proposed.fallback_transcription_profile_id = proposed
                .fallback_transcription_profile_id
                .as_ref()
                .filter(|id| id.as_str() != profile_id)
                .cloned();
        }
        "summary" => {
            proposed.summary_profiles.retain(|p| p.id != profile_id);
            proposed.active_summary_profile_id = proposed
                .active_summary_profile_id
                .as_ref()
                .filter(|id| id.as_str() != profile_id)
                .cloned();
        }
        _ => unreachable!(), // already validated above
    }

    // Validate proposed document before credential mutation
    proposed.validate().map_err(|e| {
        AppError::new(
            "validation_error",
            format!("删除后配置无效: {}", e),
            "请检查配置。",
        )
    })?;

    // 3. Snapshot credential — propagate backend errors (don't collapse to None)
    let old_cred = match cred_store.get(&profile_type, &profile_id) {
        Ok(secret) => Some(secret),
        Err(e) if e.code == "credential_missing" => None,
        Err(e) => return Err(e), // backend error — surface it
    };

    // 4. Delete credential (tolerate NotFound; propagate other errors)
    match cred_store.delete(&profile_type, &profile_id) {
        Ok(()) => {}
        Err(e) if e.code == "credential_missing" => {} // NotFound → continue
        Err(e) => return Err(e),                       // backend error — surface it
    }

    // 5. Save the already-validated profiles JSON
    match profile_store.save(&proposed) {
        Ok(()) => Ok(proposed),
        Err(json_err) => {
            // JSON save failed — restore credential and report rollback outcome
            let rollback_result = if let Some(ref old) = old_cred {
                cred_store.set(&profile_type, &profile_id, old)
            } else {
                Ok(())
            };

            match rollback_result {
                Ok(()) => Err(json_err),
                Err(rollback_err) => {
                    // Rollback itself failed — surface combined error
                    Err(AppError::new(
                        "rollback_error",
                        format!(
                            "配置档已删除但无法恢复凭据: {}. JSON错误: {}",
                            rollback_err.message, json_err.message
                        ),
                        "请手动在凭据管理器中修复凭据。",
                    ))
                }
            }
        }
    }
}

/// Set the active profile for a given type.
#[tauri::command]
/// set active profile
pub fn set_active_profile(
    services: State<'_, ManagedServices>,
    profile_type: String,
    profile_id: String,
) -> Result<AppProfiles, AppError> {
    let profile_store = services.profile_store();
    let mut profiles = profile_store.load()?;

    match profile_type.as_str() {
        "transcription" => {
            if !profiles
                .transcription_profiles
                .iter()
                .any(|p| p.id == profile_id && p.enabled)
            {
                return Err(AppError::new(
                    "profile_not_found",
                    "未找到启用的转写配置档。",
                    "请检查配置档 ID 是否正确，或先启用该配置档。",
                ));
            }
            profiles.active_transcription_profile_id = Some(profile_id);
        }
        "summary" => {
            if !profiles
                .summary_profiles
                .iter()
                .any(|p| p.id == profile_id && p.enabled)
            {
                return Err(AppError::new(
                    "profile_not_found",
                    "未找到启用的总结配置档。",
                    "请检查配置档 ID 是否正确，或先启用该配置档。",
                ));
            }
            profiles.active_summary_profile_id = Some(profile_id);
        }
        _ => {
            return Err(AppError::new(
                "invalid_profile_type",
                "不支持的配置档类型。",
                "请使用 'transcription' 或 'summary'。",
            ))
        }
    }

    profile_store.save(&profiles)?;
    Ok(profiles)
}

/// Set the fallback transcription profile (null to clear).
#[tauri::command]
/// set fallback transcription profile
pub fn set_fallback_transcription_profile(
    services: State<'_, ManagedServices>,
    profile_id: Option<String>,
) -> Result<AppProfiles, AppError> {
    let profile_store = services.profile_store();
    let mut profiles = profile_store.load()?;

    profiles.fallback_transcription_profile_id = profile_id;
    profile_store.save(&profiles)?;
    Ok(profiles)
}

/// Test a profile by attempting a lightweight connectivity check.
#[tauri::command]
/// test profile
pub async fn test_profile(
    services: State<'_, ManagedServices>,
    profile_type: String,
    profile_id: String,
) -> Result<ProfileTestResult, AppError> {
    let profile_store = services.profile_store();
    let cred_store = services.credential_store();
    let profiles = profile_store.load()?;

    match profile_type.as_str() {
        "transcription" => {
            let prof = profiles
                .transcription_profiles
                .iter()
                .find(|p| p.id == profile_id)
                .ok_or_else(|| {
                    AppError::new(
                        "profile_not_found",
                        "未找到该转写配置档。",
                        "请检查配置档 ID。",
                    )
                })?;
            // Verify credential exists and parses
            cred_store.get("transcription", &profile_id)?;
            Ok(ProfileTestResult {
                success: true,
                message: format!("配置档「{}」凭据有效。", prof.name),
                latency_ms: None,
            })
        }
        "summary" => {
            let prof = profiles
                .summary_profiles
                .iter()
                .find(|p| p.id == profile_id)
                .ok_or_else(|| {
                    AppError::new(
                        "profile_not_found",
                        "未找到该总结配置档。",
                        "请检查配置档 ID。",
                    )
                })?;
            let secret = cred_store.get("summary", &profile_id)?;
            let cancel = Arc::new(AtomicBool::new(false));

            match services
                .summary_registry
                .discover_models(prof, &secret, &cancel)
                .await
            {
                Ok(_) => Ok(ProfileTestResult {
                    success: true,
                    message: format!("配置档「{}」API 连接正常。", prof.name),
                    latency_ms: None,
                }),
                Err(e) if e.kind == ProviderErrorKind::AuthenticationFailed => {
                    Ok(ProfileTestResult {
                        success: false,
                        message: format!("认证失败: {}", e.message),
                        latency_ms: None,
                    })
                }
                Err(e)
                    if e.kind == ProviderErrorKind::NetworkError
                        || e.kind == ProviderErrorKind::ProviderError =>
                {
                    Ok(ProfileTestResult {
                        success: false,
                        message: format!("连接测试失败: {}", e.message),
                        latency_ms: None,
                    })
                }
                Err(_) => Ok(ProfileTestResult {
                    success: true,
                    message: "凭据有效，但模型发现未返回结果。".into(),
                    latency_ms: None,
                }),
            }
        }
        _ => Err(AppError::new(
            "invalid_profile_type",
            "不支持的配置档类型。",
            "请使用 'transcription' 或 'summary'。",
        )),
    }
}

/// Discover available models for a summary profile.
#[tauri::command]
/// discover summary models
pub async fn discover_summary_models(
    services: State<'_, ManagedServices>,
    profile_id: String,
) -> Result<Vec<String>, AppError> {
    let profile_store = services.profile_store();
    let cred_store = services.credential_store();
    let profiles = profile_store.load()?;
    let cancel = Arc::new(AtomicBool::new(false));

    let prof = profiles
        .summary_profiles
        .iter()
        .find(|p| p.id == profile_id)
        .ok_or_else(|| {
            AppError::new(
                "profile_not_found",
                "未找到该总结配置档。",
                "请检查配置档 ID。",
            )
        })?;

    let secret = cred_store.get("summary", &profile_id)?;

    match services
        .summary_registry
        .discover_models(prof, &secret, &cancel)
        .await
    {
        Ok(ModelDiscoveryResult::Success(models)) => Ok(models),
        Ok(ModelDiscoveryResult::Unsupported) => Err(AppError::new(
            "model_discovery_unsupported",
            "该提供商不支持模型发现。",
            "请手动输入模型名称。",
        )),
        Err(e) => Err(e.into_app_error()),
    }
}

// ===========================================================================
//  Tauri Commands — Task lifecycle
// ===========================================================================

fn task_record_display(source: &InputSource) -> (String, String) {
    match source {
        InputSource::File { path } => {
            let filename = PathBuf::from(path)
                .file_name()
                .and_then(|value| value.to_str())
                .filter(|value| !value.trim().is_empty())
                .unwrap_or("本地文件")
                .to_string();
            (filename.clone(), filename)
        }
        InputSource::BilibiliUrl { url } => ("Bilibili 视频提炼".into(), url.clone()),
        InputSource::YoutubeUrl { url } => ("YouTube 视频提炼".into(), url.clone()),
        InputSource::DouyinUrl { url } => ("抖音视频提炼".into(), url.clone()),
    }
}

/// Start distillation with profile-based configuration.
///
/// The caller provides `transcription_profile_id` and `summary_profile_id`.
/// Profiles and credentials are resolved immediately (fail-fast) and then
/// passed as immutable snapshots to the background pipeline.
///
/// `task_id` is generated by the caller (React) so event listeners are
/// registered **before** any background progress can be emitted.
#[tauri::command]
/// start distillation
pub async fn start_distillation(
    app: AppHandle,
    state: State<'_, AppState>,
    services: State<'_, ManagedServices>,
    task_id: String,
    source: InputSource,
    transcription_profile_id: String,
    summary_profile_id: String,
    options: Option<TaskOptions>,
) -> Result<(), AppError> {
    let options = task_options_or_default(options);
    // --- Resolve and snapshot profiles immediately (fail-fast) ---
    let profile_path = services.profile_path.clone();
    let history_path = services.history_path.clone();

    // Use in-memory backend for credential store so we don't capture State
    let cred_store = services.credential_store();
    let profile_store = services.profile_store();
    let profiles = profile_store.load()?;

    let requested_transcription_profile = || {
        profiles
            .transcription_profiles
            .iter()
            .find(|p| p.id == transcription_profile_id && p.enabled)
            .cloned()
            .ok_or_else(|| {
                AppError::new(
                    "profile_not_found",
                    "未找到或未启用指定的转写配置档。",
                    "请在设置中启用转写配置档。",
                )
            })
    };
    let transcription_profile = match options.transcription_mode {
        Some(TranscriptionMode::SensevoiceCpu) => TranscriptionProfile {
            id: "sensevoice-cpu".into(),
            name: "SenseVoice CPU".into(),
            provider: TranscriptionProviderKind::LocalWhisperCpp,
            base_url: String::new(),
            model: options.sensevoice_model.as_str().into(),
            online_options: Default::default(),
            enabled: true,
            built_in: true,
        },
        Some(TranscriptionMode::WhisperLocal) => profiles
            .transcription_profiles
            .iter()
            .find(|profile| {
                profile.enabled && profile.provider == TranscriptionProviderKind::LocalWhisperCpp
            })
            .cloned()
            .ok_or_else(|| {
                AppError::new(
                    "local_whisper_profile_missing",
                    "本地 Whisper 配置不可用。",
                    "请在设置中启用本地 Whisper 并选择已下载模型。",
                )
            })?,
        Some(TranscriptionMode::OnlineProfile) => {
            let profile = requested_transcription_profile()?;
            if profile.provider == TranscriptionProviderKind::LocalWhisperCpp {
                return Err(AppError::new(
                    "online_transcription_profile_required",
                    "在线模式需要在线转写配置档。",
                    "请在语音转文字设置中选择一个在线服务商。",
                ));
            }
            profile
        }
        None => requested_transcription_profile()?,
    };
    if options.transcription_mode == Some(TranscriptionMode::SensevoiceCpu) {
        if options.sensevoice_languages.is_empty() {
            return Err(AppError::new(
                "sensevoice_languages_empty",
                "SenseVoice 至少需要一种识别语言。",
                "请至少选择一种识别语言。",
            ));
        }
        let root = services.sensevoice_root()?;
        ready_sensevoice_paths(&root, options.sensevoice_model, &sensevoice_manifest())?;
    }

    let summary_profile = profiles
        .summary_profiles
        .iter()
        .find(|p| p.id == summary_profile_id && p.enabled)
        .cloned()
        .ok_or_else(|| {
            AppError::new(
                "profile_not_found",
                "未找到或未启用指定的总结配置档。",
                "请在设置中启用总结配置档。",
            )
        })?;

    // Resolve fallback profile if configured
    let fallback_profile = (options.transcription_mode != Some(TranscriptionMode::SensevoiceCpu))
        .then(|| profiles
        .fallback_transcription_profile_id
        .as_ref()
        .and_then(|fb_id| {
            profiles
                .transcription_profiles
                .iter()
                .find(|p| p.id == *fb_id && p.enabled)
                .cloned()
        })
        .filter(|profile| profile.provider != TranscriptionProviderKind::LocalWhisperCpp))
        .flatten();

    // Resolve credentials
    // Local Whisper never resolves a Credential Manager entry. The adapter
    // ignores this internal marker and has no HTTP or fallback behavior.
    let transcription_secret =
        if options.transcription_mode == Some(TranscriptionMode::SensevoiceCpu)
            || transcription_profile.provider == TranscriptionProviderKind::LocalWhisperCpp
        {
            SecretPayload::Bearer {
                api_key: String::new(),
            }
        } else {
            cred_store.get("transcription", &transcription_profile_id)?
        };
    let summary_secret = cred_store.get("summary", &summary_profile_id)?;

    let fallback_secret = fallback_profile
        .as_ref()
        .and_then(|fp| cred_store.get("transcription", &fp.id).ok());

    // Snapshot output preferences and create an isolated task workspace before
    // spawning so validation errors are returned synchronously to the caller.
    let preferences = services.preferences_store().load()?;
    let markdown_output_dir = resolve_markdown_output_dir(&preferences)?;
    let task_work_dir = create_task_work_dir(&task_id)?;
    let (task_title, source_label) = task_record_display(&source);
    let compute = if options.transcription_mode == Some(TranscriptionMode::SensevoiceCpu) {
        "sensevoice_cpu"
    } else if transcription_profile.provider == TranscriptionProviderKind::LocalWhisperCpp {
        match preferences.local_compute_mode {
            LocalComputeMode::Auto => "auto",
            LocalComputeMode::Cpu => "cpu",
        }
    } else {
        "online"
    };
    let task_record_id = TaskStore::open(history_path.clone())?.insert_task(&TaskRecordInput {
        task_id: task_id.clone(),
        title: task_title,
        source: source.clone(),
        source_label,
        options: options.clone(),
        transcription_profile_id: transcription_profile.id.clone(),
        transcription_profile_name: transcription_profile.name.clone(),
        transcription_model: transcription_profile.model.clone(),
        summary_profile_id: summary_profile.id.clone(),
        summary_profile_name: summary_profile.name.clone(),
        summary_model: summary_profile.model.clone(),
        compute: compute.into(),
        started_at: Utc::now().to_rfc3339(),
        diagnostic_log_id: Some("app-diagnostics".into()),
    })?;

    // --- Register cancellation token ---
    let cancel_flag = Arc::new(AtomicBool::new(false));
    {
        let mut tokens = state.cancellation_tokens.lock().unwrap();
        tokens.insert(task_id.clone(), cancel_flag.clone());
    }

    // --- Spawn pipeline with all owned snapshots ---
    let app_handle = app.clone();
    let tid = task_id.clone();
    diagnostics::record(DiagnosticRecord::task(
        DiagnosticEventKind::TaskStarted,
        task_id.clone(),
    ));

    tauri::async_runtime::spawn(async move {
        let started = Instant::now();
        let result = run_pipeline(
            &app_handle,
            &profile_path,
            &tid,
            &cancel_flag,
            &source,
            &task_work_dir,
            &markdown_output_dir,
            transcription_profile,
            transcription_secret,
            summary_profile,
            summary_secret,
            fallback_profile,
            fallback_secret,
            options.clone(),
        )
        .await;

        match result {
            Ok(mut dr) => {
                // History is a best-effort post-success record. A database or
                // asset problem must never turn a saved Markdown result into a
                // failed distillation.
                let completed_entry =
                    persist_completed_history(&history_path, &task_work_dir, &source, &dr, &options).ok();
                let note_id = completed_entry.as_ref().map(|entry| entry.id);
                if let Some(entry) = completed_entry {
                    let entry_title = entry.title.clone();
                    for (evidence, path) in dr
                        .distillation
                        .key_evidence
                        .iter_mut()
                        .filter(|evidence| evidence.screenshot_path.is_some())
                        .zip(entry.screenshot_paths)
                    {
                        evidence.screenshot_path = Some(path.to_string_lossy().into_owned());
                    }
                    if let Ok(task_store) = TaskStore::open(history_path.clone()) {
                        let _ = task_store.update_title(task_record_id, &entry_title);
                    }
                }
                if let Ok(task_store) = TaskStore::open(history_path.clone()) {
                    let _ = task_store.finish_task(
                        task_record_id,
                        TaskState::Succeeded,
                        None,
                        note_id,
                    );
                }
                let _ = app_handle.emit(&format!("task-complete:{}", tid), &dr);
                let mut record = DiagnosticRecord::task(DiagnosticEventKind::TaskCompleted, &tid);
                record.elapsed_ms = Some(started.elapsed().as_millis().min(u64::MAX as u128) as u64);
                record.percent = Some(100);
                diagnostics::record(record);
            }
            Err(e) => {
                if let Ok(task_store) = TaskStore::open(history_path.clone()) {
                    let state = if e.code == "cancelled" {
                        TaskState::Cancelled
                    } else {
                        TaskState::Failed
                    };
                    let _ = task_store.finish_task(task_record_id, state, Some(&e.code), None);
                }
                let _ = app_handle.emit(&format!("task-error:{}", tid), &e);
                let event = if e.code == "cancelled" {
                    DiagnosticEventKind::TaskCancelled
                } else {
                    DiagnosticEventKind::TaskFailed
                };
                let mut record = DiagnosticRecord::task(event, &tid);
                record.level = if e.code == "cancelled" {
                    DiagnosticLevel::Info
                } else {
                    DiagnosticLevel::Error
                };
                record.elapsed_ms = Some(started.elapsed().as_millis().min(u64::MAX as u128) as u64);
                diagnostics::record(record);
            }
        }

        // History needs task-work screenshots while it copies owned assets;
        // cleanup still always runs and can never mask completion/errors.
        let _ = std::fs::remove_dir_all(&task_work_dir);

        if let Ok(mut tokens) = app_handle.state::<AppState>().cancellation_tokens.lock() {
            tokens.remove(&tid);
        }
    });

    Ok(())
}

/// persist completed history
pub fn persist_completed_history(
    history_path: &std::path::Path,
    task_work_dir: &std::path::Path,
    source: &InputSource,
    result: &DistillationResult,
    options: &TaskOptions,
) -> Result<HistoryEntry, AppError> {
    let transcript_path = task_work_dir.join("history-transcript.txt");
    std::fs::write(
        &transcript_path,
        result
            .distillation
            .transcript
            .as_deref()
            .unwrap_or_default(),
    )
    .map_err(|_| {
        AppError::new(
            "history_storage_failed",
            "历史记录存储失败。",
            "请检查磁盘空间和应用数据目录权限。",
        )
    })?;
    let source_text = match source {
        InputSource::File { path } => path.clone(),
        InputSource::DouyinUrl { url }
        | InputSource::BilibiliUrl { url }
        | InputSource::YoutubeUrl { url } => url.clone(),
    };
    let title = std::path::Path::new(&result.saved_path)
        .file_stem()
        .and_then(|name| name.to_str())
        .unwrap_or("视频核心提炼")
        .to_string();
    let store = HistoryStore::open(history_path.to_path_buf())?;
    let id = store.create(&HistoryEntryInput {
        title,
        source: source_text,
        note_template: options.note_template.clone(),
        note_style: options.note_style,
        created_at: Utc::now().to_rfc3339(),
        markdown_path: PathBuf::from(&result.saved_path),
        transcript_path,
        thumbnail_path: None,
        screenshot_paths: result
            .distillation
            .key_evidence
            .iter()
            .filter_map(|evidence| evidence.screenshot_path.as_ref().map(PathBuf::from))
            .collect(),
    })?;
    store.get(id)?.ok_or_else(|| {
        AppError::new(
            "history_missing",
            "历史记录不存在。",
            "请刷新历史列表后重试。",
        )
    })
}

/// Cancel a running distillation task by its ID.
#[tauri::command]
/// cancel distillation
pub async fn cancel_distillation(
    state: State<'_, AppState>,
    task_id: String,
) -> Result<(), AppError> {
    let tokens = state.cancellation_tokens.lock().unwrap();
    if let Some(flag) = tokens.get(&task_id) {
        flag.store(true, Ordering::SeqCst);
        diagnostics::record(DiagnosticRecord::task(
            DiagnosticEventKind::TaskCancelled,
            task_id,
        ));
    }
    Ok(())
}

#[tauri::command]
/// get diagnostic log path
pub fn get_diagnostic_log_path() -> Result<String, AppError> {
    diagnostics::log_path()
        .map(|path| path.to_string_lossy().into_owned())
        .ok_or_else(|| {
            AppError::new(
                "diagnostic_log_unavailable",
                "诊断日志尚未初始化。",
                "请重新启动应用后重试。",
            )
        })
}

// ===========================================================================
//  Tauri Commands — Legacy API key management (deprecated)
// ===========================================================================

/// Save an API key to Windows Credential Manager.
#[tauri::command]
/// save api key command
pub async fn save_api_key_command(key: String) -> Result<(), AppError> {
    save_api_key(&key)
}

/// Return whether a non-empty API key is stored in the credential vault.
#[tauri::command]
/// check api key
pub async fn check_api_key() -> Result<bool, AppError> {
    match load_api_key() {
        Ok(k) => Ok(!k.is_empty()),
        Err(_) => Ok(false),
    }
}

// ===========================================================================
//  Migration commands and testable seam
// ===========================================================================

// ---------------------------------------------------------------------------
// LegacyCredentialBackend trait — injectable legacy credential storage
// ---------------------------------------------------------------------------

/// Abstraction over the legacy `video-distiller/api-key` credential.
///
/// Production: `KeyringLegacyBackend` uses the system credential manager.
/// Test: `InMemoryLegacyBackend` uses an in-memory boolean + error simulation.
pub trait LegacyCredentialBackend: Send + Sync {
    /// Return whether a legacy credential exists.
    fn has_legacy(&self) -> bool;
    /// Delete the legacy credential.
    ///
    /// Returns `Ok(())` if the credential was deleted or did not exist.
    /// Returns `Err` for system-level backend failures (never `NotFound`).
    fn delete_legacy(&self) -> Result<(), CredentialBackendError>;
}

/// Production legacy backend using `keyring::Entry`.
pub struct KeyringLegacyBackend;

impl LegacyCredentialBackend for KeyringLegacyBackend {
    fn has_legacy(&self) -> bool {
        keyring::Entry::new(KEYRING_SERVICE, KEYRING_USER)
            .and_then(|e| e.get_password())
            .map(|k| !k.is_empty())
            .unwrap_or(false)
    }

    fn delete_legacy(&self) -> Result<(), CredentialBackendError> {
        let entry = match keyring::Entry::new(KEYRING_SERVICE, KEYRING_USER) {
            Ok(e) => e,
            Err(_) => return Ok(()),
        };
        match entry.delete_credential() {
            Ok(()) => Ok(()),
            Err(keyring::Error::NoEntry) => Ok(()),
            Err(_) => Err(CredentialBackendError::Other(
                "删除旧凭据失败，请手动检查凭据管理器。".into(),
            )),
        }
    }
}

/// In-memory legacy backend for testing.
///
/// `has_legacy` returns the configured boolean.
/// `delete_legacy` fails if `fail_delete` is true, simulating a backend error.
#[derive(Clone, Debug)]
/// InMemoryLegacyBackend
pub struct InMemoryLegacyBackend {
    pub has: bool,
    pub fail_delete: bool,
}

impl InMemoryLegacyBackend {
    /// new
    pub fn new() -> Self {
        Self {
            has: false,
            fail_delete: false,
        }
    }

    /// with legacy
    pub fn with_legacy() -> Self {
        Self {
            has: true,
            fail_delete: false,
        }
    }

    /// with failing delete
    pub fn with_failing_delete() -> Self {
        Self {
            has: true,
            fail_delete: true,
        }
    }
}

impl LegacyCredentialBackend for InMemoryLegacyBackend {
    fn has_legacy(&self) -> bool {
        self.has
    }

    fn delete_legacy(&self) -> Result<(), CredentialBackendError> {
        if self.fail_delete {
            Err(CredentialBackendError::Other(
                "simulated legacy credential deletion failure".into(),
            ))
        } else {
            Ok(())
        }
    }
}

/// Reusable data-account name for the legacy credential.
#[allow(dead_code)]
fn legacy_credential_service_and_user() -> (&'static str, &'static str) {
    (KEYRING_SERVICE, KEYRING_USER)
}

// ---------------------------------------------------------------------------
// MigrationService — testable production seam
// ---------------------------------------------------------------------------

/// Run the complete-migration operation atomically.
///
/// # Ordering (from the user's perspective atomic):
///
/// 1. Validate all pre-conditions BEFORE any mutation:
///    - `confirmed` must be `true`, else `migration_confirmation_required`.
///    - Both active profile IDs must be set.
///    - Both active profiles must have credentials stored.
///    - `migration_required` must be `true`; if already `false`, return Ok(idempotent).
///
/// 2. Delete the legacy credential (propagate backend errors except `NotFound`).
///    If deletion fails with a backend/system error, return the error and do NOT
///    persist the state change.
///
/// 3. Persist `migration_required = false` in the profile store.
///    If persistence fails, legacy deletion is already done — but the error
///    is propagated so the caller knows the state is inconsistent. The legacy
///    credential cannot be restored, which is acceptable because it cannot
///    be re-used once both new profiles have credentials.
///
/// # Security
///
/// None of the arguments or return values contain credential data.
/// Errors are redacted — no backend error text leaks into `AppError.message`.
pub fn run_migration(
    profile_store: &ProfileStore,
    cred_store: &CredentialStore,
    legacy_backend: &dyn LegacyCredentialBackend,
    confirmed: bool,
) -> Result<AppProfiles, AppError> {
    // Step 0: Require explicit confirmation
    if !confirmed {
        return Err(AppError::new(
            "migration_confirmation_required",
            "请确认您已完成转写和总结配置，并想要删除旧凭据。",
            "请先分别保存转写和总结的 API Key。",
        ));
    }

    let mut profiles = profile_store.load()?;

    // Step 1: Check if already completed — idempotent, no-op
    if !profiles.migration_required {
        // Already migrated. Return profiles unchanged.
        return Ok(profiles);
    }

    // Step 2: Both active profiles must be configured
    let active_transcription_id = profiles
        .active_transcription_profile_id
        .as_ref()
        .ok_or_else(|| {
            AppError::new(
                "migration_incomplete",
                "请先选择转写配置档。",
                "请在设置中启用并配置转写和总结配置档。",
            )
        })?
        .clone();
    let active_summary_id = profiles
        .active_summary_profile_id
        .as_ref()
        .ok_or_else(|| {
            AppError::new(
                "migration_incomplete",
                "请先选择总结配置档。",
                "请在设置中启用并配置转写和总结配置档。",
            )
        })?
        .clone();

    // Step 3: Both active profiles must have credentials
    let trans_cred = cred_store.has("transcription", &active_transcription_id)?;
    if !trans_cred {
        return Err(AppError::new(
            "migration_incomplete",
            "转写配置档缺少凭据。",
            "请在设置中为转写配置档保存 API Key。",
        ));
    }
    let summ_cred = cred_store.has("summary", &active_summary_id)?;
    if !summ_cred {
        return Err(AppError::new(
            "migration_incomplete",
            "总结配置档缺少凭据。",
            "请在设置中为总结配置档保存 API Key。",
        ));
    }

    // Delete legacy credential FIRST (before persisting state)
    // NotFound is treated as success; all other backend errors propagate
    match legacy_backend.delete_legacy() {
        Ok(()) => {}
        Err(CredentialBackendError::NotFound) => {}
        Err(CredentialBackendError::Other(_detail)) => {
            return Err(AppError::new(
                "migration_deletion_failed",
                "删除旧凭据时发生系统错误。",
                "请检查凭据管理器后重试，或手动删除旧凭据。",
            ));
        }
    }

    // Step 5: Persist migration completion
    profiles.migration_required = false;
    profile_store.save(&profiles)?;

    Ok(profiles)
}

/// Synchronize the persisted one-time migration flag with the presence of the
/// legacy credential. This is the startup seam used by production and tests.
/// It never reads or copies the credential value: the backend exposes only a
/// boolean existence check.
pub fn refresh_migration_state(
    profile_store: &ProfileStore,
    legacy_backend: &dyn LegacyCredentialBackend,
) -> Result<bool, AppError> {
    let mut profiles = profile_store.load()?;
    if legacy_backend.has_legacy() && !profiles.migration_required {
        profiles.migration_required = true;
        profile_store.save(&profiles)?;
    }
    Ok(profiles.migration_required)
}

// ---------------------------------------------------------------------------
// Tauri commands for migration
// ---------------------------------------------------------------------------

/// Check whether the legacy `video-distiller/api-key` credential exists.
///
/// Returns `true` if a legacy API key was found. Never returns the key value or
/// any secret data — only a boolean.
#[tauri::command]
/// check legacy credential
pub async fn check_legacy_credential() -> Result<bool, AppError> {
    let backend = KeyringLegacyBackend;
    Ok(backend.has_legacy())
}

/// Complete the one-time migration from the legacy single API key to per-profile
/// credentials.
///
/// # Safety (enforced by `run_migration`):
///
/// 1. `confirmed` must be `true` from the caller (user clicked confirm).
/// 2. Both active profile IDs must be set.
/// 3. Both active profiles must have credentials stored.
/// 4. Legacy deletion happens BEFORE state persistence.
/// 5. Backend errors propagate — state is NOT marked completed if deletion fails.
///
/// Returns the updated `AppProfiles` on success.
#[tauri::command]
/// complete migration
pub fn complete_migration(
    services: State<'_, ManagedServices>,
    confirmed: bool,
) -> Result<AppProfiles, AppError> {
    let profile_store = services.profile_store();
    let cred_store = services.credential_store();
    let legacy_backend = KeyringLegacyBackend;
    let result = run_migration(&profile_store, &cred_store, &legacy_backend, confirmed);
    result
}

/// Get the current `migration_required` state from the profile store.
/// Returns a boolean only — no secrets or profile data.
#[tauri::command]
/// get migration state
pub fn get_migration_state(services: State<'_, ManagedServices>) -> Result<bool, AppError> {
    let profile_store = services.profile_store();
    let legacy_backend = KeyringLegacyBackend;
    refresh_migration_state(&profile_store, &legacy_backend)
}

// ===========================================================================
//  Fallback Orchestration (testable seam)
// ===========================================================================

/// Configuration for a single transcription call within the fallback orchestrator.
pub struct AdapterCall<'a> {
    pub adapter: &'a dyn TranscriptionAdapter,
    pub profile: &'a TranscriptionProfile,
    pub secret: &'a SecretPayload,
}

/// Run transcription with optional one-shot Tencent-to-non-Tencent fallback.
///
/// # Fallback conditions (ALL must be true, enforced by this function):
///
/// 1. Selected ASR kind is `TencentFlash`.
/// 2. Normalized error kind is `QuotaExhausted` or `BillingUnavailable`.
/// 3. A `fallback` adapter/profile/secret is provided.
/// 4. The fallback profile is NOT `TencentFlash`.
/// 5. The fallback profile differs from the primary profile.
///
/// When fallback triggers:
/// - Emits a `provider-fallback:<taskId>` event via `event_sink`.
/// - Retries exactly once with the same `audio_path` and the fallback adapter.
/// - ONLY after a successful fallback call, persists the fallback as active.
/// - On persistence failure, the error is propagated (active/fallback IDs are
///   left unchanged).
///
/// # Non-fallback errors
///
/// Authentication, network, rate-limit, provider, invalid-response, and
/// cancellation errors are returned immediately without any retry.
///
/// # Fallback failure
///
/// A failed fallback call returns the fallback's error — no second retry,
/// no loop. Active/fallback IDs are left unchanged.
///
/// # Security
///
/// Event payloads contain profile IDs and names only — no credentials,
/// secrets, audio data, or raw provider bodies.
pub async fn transcribe_with_fallback(
    audio_path: &std::path::Path,
    primary: AdapterCall<'_>,
    fallback: Option<AdapterCall<'_>>,
    cancel: &AtomicBool,
    task_id: &str,
    event_sink: &dyn FallbackEventSink,
    store: Option<&ProfileStore>,
) -> Result<String, AppError> {
    // --- Primary transcription ---
    let primary_result = primary
        .adapter
        .transcribe(audio_path, primary.profile, primary.secret, cancel)
        .await;

    match primary_result {
        Ok(transcript) => Ok(transcript),
        Err(provider_err) => {
            // Check fallback eligibility (ALL conditions must hold)
            let is_tencent = primary.profile.provider == TranscriptionProviderKind::TencentFlash;
            let eligible = provider_err.kind.allows_quota_fallback();

            if is_tencent && eligible {
                if let Some(fb) = fallback {
                    // Enforce: fallback is non-Tencent
                    if fb.profile.provider == TranscriptionProviderKind::TencentFlash {
                        return Err(AppError::new(
                            "invalid_fallback",
                            "Fallback profile must not be Tencent Flash.",
                            "Please select a non-Tencent fallback profile.",
                        ));
                    }

                    // Enforce: fallback differs from primary
                    if fb.profile.id == primary.profile.id {
                        return Err(AppError::new(
                            "invalid_fallback",
                            "Fallback profile must differ from the primary profile.",
                            "Please select a different fallback profile.",
                        ));
                    }

                    // Enforce: fallback profile is enabled
                    if !fb.profile.enabled {
                        return Err(AppError::new(
                            "invalid_fallback",
                            "Fallback profile is disabled.",
                            "Please enable the fallback transcription profile.",
                        ));
                    }

                    // Build safe event payload (no credentials, no audio data)
                    let event = ProviderFallbackEvent {
                        from_profile_id: primary.profile.id.clone(),
                        from_profile_name: primary.profile.name.clone(),
                        to_profile_id: fb.profile.id.clone(),
                        to_profile_name: fb.profile.name.clone(),
                        reason: format!("{}", provider_err.kind),
                    };

                    event_sink.emit_fallback(task_id, &event);

                    // Retry exactly once with fallback (no further fallback)
                    let fb_result = fb
                        .adapter
                        .transcribe(audio_path, fb.profile, fb.secret, cancel)
                        .await;

                    return match fb_result {
                        Ok(transcript) => {
                            // ONLY after a successful fallback call, persist
                            // the fallback as active. Propagate persistence
                            // errors rather than silently swallowing them.
                            if let Some(ps) = store {
                                persist_fallback_active(ps, &fb.profile.id)?;
                            }
                            Ok(transcript)
                        }
                        Err(fb_err) => Err(fb_err.into_app_error()),
                    };
                }
            }

            // Not eligible or no fallback configured → return original error
            Err(provider_err.into_app_error())
        }
    }
}

// ===========================================================================
//  Pipeline runner
// ===========================================================================

/// Run the full distillation pipeline with profile-based configuration.
async fn run_pipeline(
    app: &AppHandle,
    profile_path: &PathBuf,
    task_id: &str,
    cancel_flag: &AtomicBool,
    source: &InputSource,
    task_work_dir: &PathBuf,
    markdown_output_dir: &PathBuf,
    transcription_profile: TranscriptionProfile,
    transcription_secret: SecretPayload,
    summary_profile: SummaryProfile,
    summary_secret: SecretPayload,
    fallback_profile: Option<TranscriptionProfile>,
    fallback_secret: Option<SecretPayload>,
    options: TaskOptions,
) -> Result<DistillationResult, AppError> {
    // --- Stage 1: Prefer timed captions for Bilibili and YouTube only. ---
    let captions = match source_platform(source) {
        SourcePlatform::Bilibili | SourcePlatform::Youtube => {
            emit_progress(
                app,
                task_id,
                TaskStage::SubtitleFetching,
                "正在获取字幕...",
                5,
            )?;
            check_cancelled(cancel_flag)?;
            let url = match source {
                InputSource::BilibiliUrl { url } | InputSource::YoutubeUrl { url } => url,
                _ => unreachable!(),
            };
            let direct_bilibili = if source_platform(source) == SourcePlatform::Bilibili {
                let cookie = DownloadCookieStore::production()
                    .get_optional(crate::services::download::VideoPlatform::Bilibili)?;
                crate::services::bilibili::fetch_bilibili_subtitles(url, cookie.as_deref())
                    .ok()
                    .flatten()
            } else {
                None
            };
            direct_bilibili.or_else(|| optional_timed_captions(url, task_work_dir))
        }
        SourcePlatform::Local | SourcePlatform::Douyin => None,
    };

    let source_name = match source {
        InputSource::File { path } => std::path::Path::new(path)
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("video")
            .to_string(),
        InputSource::DouyinUrl { url: _ } => "douyin_video".to_string(),
        InputSource::BilibiliUrl { url: _ } => "bilibili_video".to_string(),
        InputSource::YoutubeUrl { url: _ } => "youtube_video".to_string(),
    };

    let (transcript, source_media_path) = if let Some(captions) = &captions {
        (
            captions
                .iter()
                .map(|caption| caption.text.as_str())
                .collect::<Vec<_>>()
                .join("\n"),
            None,
        )
    } else {
        // Existing local-file and URL media/ASR route, including Douyin.
        let video_path = match source {
            InputSource::DouyinUrl { url }
            | InputSource::BilibiliUrl { url }
            | InputSource::YoutubeUrl { url } => {
                emit_progress(
                    app,
                    task_id,
                    TaskStage::Downloading,
                    "正在下载视频...",
                    10,
                )?;
                check_cancelled(cancel_flag)?;
                let platform = classify_platform_url(url)?;
                let cookie_material = DownloadCookieStore::production()
                    .prepare_download_cookie(platform, task_work_dir)?;
                if platform == crate::services::download::VideoPlatform::Douyin {
                    if let Some(header) = cookie_material.raw_header() {
                        let fields = inspect_douyin_cookie_fields(header);
                        if !(fields.ms_token && fields.ttwid && fields.s_v_web_id) {
                            emit_download_progress(
                                app,
                                task_id,
                                DownloadProgress::message(
                                    crate::services::download::DownloadPhase::Resolving,
                                    "当前抖音 Cookie 会话字段可能不完整；先尝试公开分享页。",
                                ),
                            )?;
                        }
                    }
                }
                download_platform(
                    url,
                    task_work_dir,
                    cookie_material.raw_header(),
                    cookie_material.netscape_file_path(),
                    &|| cancel_flag.load(Ordering::SeqCst),
                    |download| {
                        let _ = emit_download_progress(app, task_id, download);
                    },
                )
                .await?
            }
            InputSource::File { path } => PathBuf::from(path),
        };
        emit_progress(
            app,
            task_id,
            TaskStage::PreparingAudio,
            "正在提取音频...",
            25,
        )?;
        check_cancelled(cancel_flag)?;
        let audio_path = prepare_audio(&video_path, task_work_dir)?;
        emit_progress(
            app,
            task_id,
            TaskStage::Transcribing,
            "正在转写音频...",
            35,
        )?;
        check_cancelled(cancel_flag)?;
        let transcript = if select_transcription_route(false, options.transcription_mode)
            == TranscriptionRoute::Sensevoice
        {
            if options.sensevoice_languages.is_empty() {
                return Err(AppError::new(
                    "sensevoice_languages_empty",
                    "SenseVoice 至少需要一种识别语言。",
                    "请至少选择一种识别语言。",
                ));
            }
            let app_data_dir = app.path().app_data_dir().map_err(|_| {
                AppError::new(
                    "sensevoice_root_unavailable",
                    "SenseVoice 组件目录不可用。",
                    "请重新启动应用后重试。",
                )
            })?;
            let root = sensevoice_root(&app_data_dir);
            let paths = ready_sensevoice_paths(
                &root,
                options.sensevoice_model,
                &sensevoice_manifest(),
            )?;
            let language = if options.sensevoice_languages.len() == 1 {
                options.sensevoice_languages[0].as_str().to_owned()
            } else {
                "auto".to_owned()
            };
            let adapter = crate::providers::sensevoice::SenseVoiceAdapter::new(
                Arc::new(
                    crate::providers::sensevoice::CommandSenseVoiceProcessRunner::default(),
                ),
                paths.runtime,
                paths.model,
                paths.tokens,
            );
            adapter
                .transcribe_with_flag(
                    &audio_path,
                    crate::providers::sensevoice::SenseVoiceOptions {
                        language,
                        ..Default::default()
                    },
                    cancel_flag,
                )?
                .text
        } else {
            let transcription_registry =
                if transcription_profile.provider == TranscriptionProviderKind::LocalWhisperCpp {
                let app_data_dir = app.path().app_data_dir().map_err(|_| {
                    AppError::new(
                        "local_model_root_unavailable",
                        "本地模型目录不可用。",
                        "请重新启动应用后重试。",
                    )
                })?;
                let cli_path = app
                    .path()
                    .resolve("whisper-cli.exe", tauri::path::BaseDirectory::Resource)
                    .map_err(|_| {
                        AppError::new(
                            "local_whisper_binary_unavailable",
                            "本地 Whisper 运行组件不可用。",
                            "请重新安装应用后重试。",
                        )
                    })?;
                let preferences = PreferencesStore::new(
                    profile_path.with_file_name("preferences.json"),
                )
                .load()?;
                let compute_selection = match preferences.local_compute_mode {
                    LocalComputeMode::Auto => {
                        crate::providers::local_whisper::WhisperComputeSelection::Automatic
                    }
                    LocalComputeMode::Cpu => {
                        crate::providers::local_whisper::WhisperComputeSelection::CpuOnly
                    }
                };
                let cuda_root = cuda_runtime_root(&app_data_dir);
                let cuda_status = inspect_cuda_runtime(
                    &cuda_root,
                    preferences.local_compute_mode,
                    &NvidiaSmiProbe,
                );
                let cuda_cli = (compute_selection
                    == crate::providers::local_whisper::WhisperComputeSelection::Automatic
                    && cuda_status.state == CudaRuntimeState::Ready)
                    .then(|| ready_cuda_cli(&cuda_root))
                    .flatten();
                let runtime_paths = crate::providers::local_whisper::WhisperRuntimePaths {
                    cpu_cli: cli_path,
                    cuda_cli,
                };
                let progress_app = app.clone();
                let progress_task_id = task_id.to_string();
                let last_progress = Arc::new(AtomicU8::new(35));
                let progress_guard = last_progress.clone();
                let fallback_app = app.clone();
                let fallback_task_id = task_id.to_string();
                let fallback_progress = last_progress.clone();
                let adapter = crate::providers::local_whisper::LocalWhisperCppAdapter::with_runtime_paths(
                        Arc::new(
                            crate::providers::local_whisper::CommandWhisperProcessRunner::default(),
                        ),
                        crate::local_models::local_model_root(&app_data_dir),
                        runtime_paths,
                        compute_selection,
                    )
                    .with_compute_fallback_reporter(Arc::new(move || {
                        let percent = fallback_progress.load(Ordering::SeqCst);
                        diagnostics::record(DiagnosticRecord {
                            level: DiagnosticLevel::Warning,
                            event: DiagnosticEventKind::LocalComputeFallback,
                            task_id: Some(fallback_task_id.clone()),
                            stage: Some(TaskStage::Transcribing),
                            percent: Some(percent),
                            elapsed_ms: None,
                            exit_code: None,
                            output_exists: None,
                            output_bytes: None,
                        });
                        let _ = fallback_app.emit(
                            &format!("task-progress:{}", fallback_task_id),
                            &TaskProgress {
                                stage: TaskStage::Transcribing,
                                message: "CUDA 不可用，正在改用 CPU 转写…".to_string(),
                                percent,
                                download: None,
                            },
                        );
                    }))
                    .with_progress_reporter(Arc::new(move |whisper_percent| {
                        let overall = crate::providers::local_whisper::map_whisper_to_overall_percent(
                            whisper_percent,
                        );
                        let previous = progress_guard.fetch_max(overall, Ordering::SeqCst);
                        if overall > previous {
                            let _ = emit_progress(
                                &progress_app,
                                &progress_task_id,
                                TaskStage::Transcribing,
                                "正在转写音频...",
                                overall,
                            );
                        }
                    }));
                TranscriptionRegistry::with_local_adapter(adapter)
            } else {
                TranscriptionRegistry::new()
            };
        let primary_adapter = transcription_registry
            .get(&transcription_profile.provider)
            .map_err(|e| e.into_app_error())?;
        let fallback_adapter = fallback_profile
            .as_ref()
            .and_then(|fp| transcription_registry.get(&fp.provider).ok());
        let event_sink = TauriFallbackEventSink::new(app.clone());
        let store = ProfileStore::new(profile_path.clone());
            transcribe_with_fallback(
                &audio_path,
                AdapterCall {
                    adapter: primary_adapter,
                    profile: &transcription_profile,
                    secret: &transcription_secret,
                },
                fallback_adapter
                    .zip(fallback_profile.as_ref())
                    .zip(fallback_secret.as_ref())
                    .map(|((adapter, profile), secret)| AdapterCall {
                        adapter,
                        profile,
                        secret,
                    }),
                cancel_flag,
                task_id,
                &event_sink,
                Some(&store),
            )
            .await?
        };
        (transcript, Some(video_path))
    };

    // --- Stage 4: Distill ---
    emit_progress(
        app,
        task_id,
        TaskStage::Distilling,
        "正在提炼核心内容...",
        75,
    )?;
    check_cancelled(cancel_flag)?;

    let summary_registry = SummaryRegistry::new();
    let summary_adapter = summary_registry
        .get(&summary_profile.provider)
        .map_err(|e| e.into_app_error())?;

    let mut distillation = summary_adapter
        .summarize(
            &transcript,
            options.note_style,
            &summary_profile,
            &summary_secret,
            cancel_flag,
        )
        .await
        .map_err(|e| e.into_app_error())?;
    attach_caption_evidence(&mut distillation, captions.as_deref(), source);

    // Screenshot capture is opt-in and only runs after this task acquired
    // source media. Individual failures are redacted warnings, never a task
    // failure; successful paths are persisted with the evidence/history.
    let capturer = LocalFfmpegScreenshotCapturer::production();
    let warnings = capture_evidence_with(
        &capturer,
        &options,
        source_media_path.as_deref(),
        &mut distillation,
        &task_work_dir.join("screenshots"),
    )?;
    if !warnings.is_empty() {
        let _ = emit_progress(
            app,
            task_id,
            TaskStage::CapturingScreenshots,
            "截图保存失败。",
            88,
        );
    }

    // --- Stage 5: Save ---
    emit_progress(
        app,
        task_id,
        TaskStage::Saving,
        "正在保存结果...",
        94,
    )?;
    check_cancelled(cancel_flag)?;
    let timestamp = Utc::now().to_rfc3339();
    let saved_path = save_markdown(
        &source_name,
        &timestamp,
        &distillation,
        markdown_output_dir,
        &options,
    )?;

    // --- Complete ---
    emit_progress(app, task_id, TaskStage::Complete, "完成", 100)?;

    Ok(DistillationResult {
        task_id: task_id.to_string(),
        distillation,
        saved_path,
    })
}

// ===========================================================================
//  Private helpers
// ===========================================================================

/// Populate only evidence that can be traced directly to a timed caption.
/// The summary adapter remains free to emit high-level evidence without a
/// timestamp; those items deliberately stay unlinked instead of guessing.
fn attach_caption_evidence(
    distillation: &mut Distillation,
    captions: Option<&[TimedCaption]>,
    source: &InputSource,
) {
    let Some(captions) = captions else {
        return;
    };
    let source_url = match source {
        InputSource::BilibiliUrl { url } | InputSource::YoutubeUrl { url } => url.clone(),
        InputSource::File { .. } | InputSource::DouyinUrl { .. } => return,
    };
    for evidence in &mut distillation.key_evidence {
        let evidence_text = evidence.text.trim();
        if let Some(caption) = captions.iter().find(|caption| {
            caption.text.contains(evidence_text) || evidence_text.contains(&caption.text)
        }) {
            evidence.timestamp_seconds = Some(caption.start_seconds);
            evidence.source_url = Some(source_url.clone());
        }
    }
}

fn emit_progress(
    app: &AppHandle,
    task_id: &str,
    stage: TaskStage,
    message: &str,
    percent: u8,
) -> Result<(), AppError> {
    let percent = percent.min(100);
    diagnostics::record(DiagnosticRecord {
        level: DiagnosticLevel::Info,
        event: DiagnosticEventKind::StageChanged,
        task_id: Some(task_id.to_string()),
        stage: Some(stage),
        percent: Some(percent),
        elapsed_ms: None,
        exit_code: None,
        output_exists: None,
        output_bytes: None,
    });
    app.emit(
        &format!("task-progress:{}", task_id),
        &TaskProgress {
            stage,
            message: message.to_string(),
            percent,
            download: None,
        },
    )
    .map_err(|e| AppError::new("emit_error", format!("事件发送失败: {}", e), "请重试。"))
}

fn emit_download_progress(
    app: &AppHandle,
    task_id: &str,
    progress: DownloadProgress,
) -> Result<(), AppError> {
    let overall_percent = progress
        .percent
        .map(|percent| 10.0 + percent.clamp(0.0, 100.0) * 0.14)
        .unwrap_or(10.0)
        .round()
        .clamp(10.0, 24.0) as u8;
    diagnostics::record(DiagnosticRecord {
        level: DiagnosticLevel::Info,
        event: DiagnosticEventKind::StageChanged,
        task_id: Some(task_id.to_string()),
        stage: Some(TaskStage::Downloading),
        percent: Some(overall_percent),
        elapsed_ms: None,
        exit_code: None,
        output_exists: None,
        output_bytes: Some(progress.downloaded_bytes),
    });
    app.emit(
        &format!("task-progress:{task_id}"),
        &TaskProgress {
            stage: TaskStage::Downloading,
            message: progress.message,
            percent: overall_percent,
            download: Some(DownloadTelemetry {
                phase: progress.phase.as_str().to_string(),
                percent: progress.percent,
                downloaded_bytes: progress.downloaded_bytes,
                total_bytes: progress.total_bytes,
                speed_bytes_per_second: progress.speed_bytes_per_second,
                eta_seconds: progress.eta_seconds,
            }),
        },
    )
    .map_err(|error| {
        AppError::new(
            "emit_error",
            format!("下载进度事件发送失败: {error}"),
            "请重试。",
        )
    })
}

fn check_cancelled(flag: &AtomicBool) -> Result<(), AppError> {
    if flag.load(Ordering::SeqCst) {
        return Err(AppError::new(
            "cancelled",
            "任务已取消。",
            "点击开始提炼重新开始。",
        ));
    }
    Ok(())
}

// ===========================================================================
//  Optional AI capabilities
// ===========================================================================

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
/// CapabilityStatusItem
pub struct CapabilityStatusItem {
    pub enabled: bool,
    pub configured: bool,
    pub credential_ready: bool,
    pub provider_id: String,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
/// CapabilityStatus
pub struct CapabilityStatus {
    pub vector: CapabilityStatusItem,
    pub rerank: CapabilityStatusItem,
    pub web_search: CapabilityStatusItem,
    pub tts: CapabilityStatusItem,
    pub image: CapabilityStatusItem,
    pub local_agent: CapabilityStatusItem,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
/// CapabilityTestResult
pub struct CapabilityTestResult {
    pub ok: bool,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
/// LocalAgentDetection
pub struct LocalAgentDetection {
    pub provider_id: String,
    pub configured: bool,
    pub executable_found: bool,
}

/// capability status for services
pub fn capability_status_for_services(
    services: &ManagedServices,
) -> Result<CapabilityStatus, AppError> {
    let settings = services.capability_store().load()?;
    let credentials = services.credential_store();
    Ok(CapabilityStatus {
        vector: remote_status(
            settings.vector.enabled,
            &settings.vector.provider_id,
            !settings.vector.endpoint.trim().is_empty(),
            credentials.has_capability(CapabilityKind::Vector, &settings.vector.provider_id)?,
        ),
        rerank: remote_status(
            settings.rerank.enabled,
            &settings.rerank.provider_id,
            !settings.rerank.endpoint.trim().is_empty(),
            credentials.has_capability(CapabilityKind::Rerank, &settings.rerank.provider_id)?,
        ),
        web_search: remote_status(
            settings.web_search.enabled,
            &settings.web_search.provider_id,
            !settings.web_search.endpoint.trim().is_empty(),
            credentials.has_capability(
                CapabilityKind::WebSearch,
                &settings.web_search.provider_id,
            )?,
        ),
        tts: remote_status(
            settings.tts.enabled,
            &settings.tts.provider_id,
            !settings.tts.endpoint.trim().is_empty(),
            credentials.has_capability(CapabilityKind::Tts, &settings.tts.provider_id)?,
        ),
        image: remote_status(
            settings.image.enabled,
            &settings.image.provider_id,
            !settings.image.endpoint.trim().is_empty(),
            credentials.has_capability(CapabilityKind::Image, &settings.image.provider_id)?,
        ),
        local_agent: CapabilityStatusItem {
            enabled: settings.local_agent.enabled,
            configured: !settings.local_agent.executable.trim().is_empty(),
            credential_ready: true,
            provider_id: settings.local_agent.provider_id,
        },
    })
}

fn remote_status(
    enabled: bool,
    provider_id: &str,
    configured: bool,
    credential_ready: bool,
) -> CapabilityStatusItem {
    CapabilityStatusItem {
        enabled,
        configured,
        credential_ready,
        provider_id: provider_id.to_string(),
    }
}

fn save_capability_secret(
    services: &ManagedServices,
    kind: CapabilityKind,
    provider_id: &str,
    credential: Option<SecretInput>,
) -> Result<(), AppError> {
    if let Some(credential) = credential {
        services.credential_store().set_capability(
            kind,
            provider_id,
            &credential.into_secret_payload()?,
        )?;
    }
    Ok(())
}

/// save vector config for services
pub fn save_vector_config_for_services(
    services: &ManagedServices,
    config: VectorConfig,
    credential: Option<SecretInput>,
) -> Result<CapabilityStatusItem, AppError> {
    let provider_id = config.provider_id.clone();
    services.capability_store().save_vector(config)?;
    save_capability_secret(services, CapabilityKind::Vector, &provider_id, credential)?;
    Ok(capability_status_for_services(services)?.vector)
}

/// save rerank config for services
pub fn save_rerank_config_for_services(
    services: &ManagedServices,
    config: RerankConfig,
    credential: Option<SecretInput>,
) -> Result<CapabilityStatusItem, AppError> {
    let provider_id = config.provider_id.clone();
    services.capability_store().save_rerank(config)?;
    save_capability_secret(services, CapabilityKind::Rerank, &provider_id, credential)?;
    Ok(capability_status_for_services(services)?.rerank)
}

/// save web search config for services
pub fn save_web_search_config_for_services(
    services: &ManagedServices,
    config: WebSearchConfig,
    credential: Option<SecretInput>,
) -> Result<CapabilityStatusItem, AppError> {
    let provider_id = config.provider_id.clone();
    services.capability_store().save_web_search(config)?;
    save_capability_secret(
        services,
        CapabilityKind::WebSearch,
        &provider_id,
        credential,
    )?;
    Ok(capability_status_for_services(services)?.web_search)
}

/// save tts config for services
pub fn save_tts_config_for_services(
    services: &ManagedServices,
    config: TtsConfig,
    credential: Option<SecretInput>,
) -> Result<CapabilityStatusItem, AppError> {
    let provider_id = config.provider_id.clone();
    services.capability_store().save_tts(config)?;
    save_capability_secret(services, CapabilityKind::Tts, &provider_id, credential)?;
    Ok(capability_status_for_services(services)?.tts)
}

/// save image config for services
pub fn save_image_config_for_services(
    services: &ManagedServices,
    config: ImageConfig,
    credential: Option<SecretInput>,
) -> Result<CapabilityStatusItem, AppError> {
    let provider_id = config.provider_id.clone();
    services.capability_store().save_image(config)?;
    save_capability_secret(services, CapabilityKind::Image, &provider_id, credential)?;
    Ok(capability_status_for_services(services)?.image)
}

/// save local agent config for services
pub fn save_local_agent_config_for_services(
    services: &ManagedServices,
    config: LocalAgentConfig,
) -> Result<CapabilityStatusItem, AppError> {
    services.capability_store().save_local_agent(config)?;
    Ok(capability_status_for_services(services)?.local_agent)
}

#[tauri::command]
/// get capability settings
pub fn get_capability_settings(
    services: State<'_, ManagedServices>,
) -> Result<CapabilitySettings, AppError> {
    services.capability_store().load()
}

#[tauri::command]
/// get capability status
pub fn get_capability_status(
    services: State<'_, ManagedServices>,
) -> Result<CapabilityStatus, AppError> {
    capability_status_for_services(&services)
}

#[tauri::command]
/// save vector config
pub fn save_vector_config(
    services: State<'_, ManagedServices>,
    config: VectorConfig,
    credential: Option<SecretInput>,
) -> Result<CapabilityStatusItem, AppError> {
    save_vector_config_for_services(&services, config, credential)
}

#[tauri::command]
/// save rerank config
pub fn save_rerank_config(
    services: State<'_, ManagedServices>,
    config: RerankConfig,
    credential: Option<SecretInput>,
) -> Result<CapabilityStatusItem, AppError> {
    save_rerank_config_for_services(&services, config, credential)
}

#[tauri::command]
/// save web search config
pub fn save_web_search_config(
    services: State<'_, ManagedServices>,
    config: WebSearchConfig,
    credential: Option<SecretInput>,
) -> Result<CapabilityStatusItem, AppError> {
    save_web_search_config_for_services(&services, config, credential)
}

#[tauri::command]
/// save tts config
pub fn save_tts_config(
    services: State<'_, ManagedServices>,
    config: TtsConfig,
    credential: Option<SecretInput>,
) -> Result<CapabilityStatusItem, AppError> {
    save_tts_config_for_services(&services, config, credential)
}

#[tauri::command]
/// save image config
pub fn save_image_config(
    services: State<'_, ManagedServices>,
    config: ImageConfig,
    credential: Option<SecretInput>,
) -> Result<CapabilityStatusItem, AppError> {
    save_image_config_for_services(&services, config, credential)
}

#[tauri::command]
/// save local agent config
pub fn save_local_agent_config(
    services: State<'_, ManagedServices>,
    config: LocalAgentConfig,
) -> Result<CapabilityStatusItem, AppError> {
    save_local_agent_config_for_services(&services, config)
}

fn capability_http() -> Arc<ReqwestCapabilityHttpClient> {
    Arc::new(ReqwestCapabilityHttpClient)
}

fn capability_test_ok(message: &str) -> CapabilityTestResult {
    CapabilityTestResult {
        ok: true,
        message: message.to_string(),
    }
}

#[tauri::command]
/// test vector config
pub async fn test_vector_config(
    services: State<'_, ManagedServices>,
) -> Result<CapabilityTestResult, AppError> {
    semantic_search_inner(&services, "连接测试", 1).await?;
    Ok(capability_test_ok("向量服务连接正常。"))
}

#[tauri::command]
/// test rerank config
pub async fn test_rerank_config(
    services: State<'_, ManagedServices>,
) -> Result<CapabilityTestResult, AppError> {
    let settings = services.capability_store().load()?;
    let secret = services
        .credential_store()
        .get_capability(CapabilityKind::Rerank, &settings.rerank.provider_id)?;
    RerankClient::new(capability_http(), settings.rerank, secret)
        .rank(&[RankedCandidate {
            id: "healthcheck".into(),
            text: "连接测试".into(),
            score: 0.0,
        }])
        .await?;
    Ok(capability_test_ok("重排服务连接正常。"))
}

#[tauri::command]
/// test web search config
pub async fn test_web_search_config(
    services: State<'_, ManagedServices>,
) -> Result<CapabilityTestResult, AppError> {
    web_search_inner(&services, "连接测试").await?;
    Ok(capability_test_ok("联网搜索服务连接正常。"))
}

#[tauri::command]
/// test tts config
pub async fn test_tts_config(
    services: State<'_, ManagedServices>,
) -> Result<CapabilityTestResult, AppError> {
    synthesize_speech_inner(&services, "连接测试").await?;
    Ok(capability_test_ok("语音合成服务连接正常。"))
}

#[tauri::command]
/// test image config
pub async fn test_image_config(
    services: State<'_, ManagedServices>,
) -> Result<CapabilityTestResult, AppError> {
    generate_note_image_inner(&services, "连接测试").await?;
    Ok(capability_test_ok("图像生成服务连接正常。"))
}

#[tauri::command]
/// test local agent config
pub fn test_local_agent_config(
    services: State<'_, ManagedServices>,
) -> Result<CapabilityTestResult, AppError> {
    run_local_agent_inner(&services, "连接测试", &AtomicBool::new(false))?;
    Ok(capability_test_ok("本地代理可正常执行。"))
}

#[tauri::command]
/// index note
pub async fn index_note(
    services: State<'_, ManagedServices>,
    note_id: String,
    text: String,
) -> Result<(), AppError> {
    let settings = services.capability_store().load()?;
    let secret = services
        .credential_store()
        .get_capability(CapabilityKind::Vector, &settings.vector.provider_id)?;
    VectorClient::new(capability_http(), settings.vector, secret)
        .index(&note_id, &text)
        .await
}

async fn semantic_search_inner(
    services: &ManagedServices,
    query: &str,
    limit: usize,
) -> Result<Vec<SearchHit>, AppError> {
    let settings = services.capability_store().load()?;
    let credentials = services.credential_store();
    let vector_secret = credentials
        .get_capability(CapabilityKind::Vector, &settings.vector.provider_id)?;
    let hits = VectorClient::new(capability_http(), settings.vector, vector_secret)
        .search(query, limit)
        .await?;
    if !settings.rerank.enabled || hits.is_empty() {
        return Ok(hits);
    }
    let rerank_secret = credentials
        .get_capability(CapabilityKind::Rerank, &settings.rerank.provider_id)?;
    let ranked = RerankClient::new(capability_http(), settings.rerank, rerank_secret)
        .rank(
            &hits
                .iter()
                .map(|hit| RankedCandidate {
                    id: hit.id.clone(),
                    text: hit.text.clone(),
                    score: hit.score,
                })
                .collect::<Vec<_>>(),
        )
        .await?;
    Ok(ranked
        .into_iter()
        .map(|candidate| SearchHit {
            id: candidate.id,
            score: candidate.score,
            text: candidate.text,
        })
        .collect())
}

#[tauri::command]
/// semantic search
pub async fn semantic_search(
    services: State<'_, ManagedServices>,
    query: String,
    limit: usize,
) -> Result<Vec<SearchHit>, AppError> {
    semantic_search_inner(&services, &query, limit).await
}

async fn web_search_inner(
    services: &ManagedServices,
    query: &str,
) -> Result<Vec<WebSearchResult>, AppError> {
    let settings = services.capability_store().load()?;
    let secret = services.credential_store().get_capability(
        CapabilityKind::WebSearch,
        &settings.web_search.provider_id,
    )?;
    WebSearchClient::new(capability_http(), settings.web_search, secret)
        .search(query)
        .await
}

#[tauri::command]
/// web search
pub async fn web_search(
    services: State<'_, ManagedServices>,
    query: String,
) -> Result<Vec<WebSearchResult>, AppError> {
    web_search_inner(&services, &query).await
}

async fn synthesize_speech_inner(
    services: &ManagedServices,
    text: &str,
) -> Result<String, AppError> {
    let settings = services.capability_store().load()?;
    let secret = services
        .credential_store()
        .get_capability(CapabilityKind::Tts, &settings.tts.provider_id)?;
    let bytes = TtsClient::new(capability_http(), settings.tts, secret)
        .synthesize(text)
        .await?;
    Ok(write_capability_output(
        &services.capability_output_root()?,
        "speech",
        "mp3",
        &bytes,
    )?
    .to_string_lossy()
    .into_owned())
}

#[tauri::command]
/// synthesize speech
pub async fn synthesize_speech(
    services: State<'_, ManagedServices>,
    text: String,
) -> Result<String, AppError> {
    synthesize_speech_inner(&services, &text).await
}

async fn generate_note_image_inner(
    services: &ManagedServices,
    prompt: &str,
) -> Result<String, AppError> {
    let settings = services.capability_store().load()?;
    let secret = services
        .credential_store()
        .get_capability(CapabilityKind::Image, &settings.image.provider_id)?;
    let bytes = ImageClient::new(capability_http(), settings.image, secret)
        .generate(prompt)
        .await?;
    Ok(write_capability_output(
        &services.capability_output_root()?,
        "images",
        "png",
        &bytes,
    )?
    .to_string_lossy()
    .into_owned())
}

#[tauri::command]
/// generate note image
pub async fn generate_note_image(
    services: State<'_, ManagedServices>,
    prompt: String,
) -> Result<String, AppError> {
    generate_note_image_inner(&services, &prompt).await
}

#[tauri::command]
/// detect local agents
pub fn detect_local_agents(
    services: State<'_, ManagedServices>,
) -> Result<Vec<LocalAgentDetection>, AppError> {
    let config = services.capability_store().load()?.local_agent;
    Ok(vec![LocalAgentDetection {
        provider_id: config.provider_id,
        configured: !config.executable.trim().is_empty(),
        executable_found: PathBuf::from(&config.executable).is_file(),
    }])
}

fn run_local_agent_inner(
    services: &ManagedServices,
    prompt: &str,
    cancel: &AtomicBool,
) -> Result<LocalAgentResult, AppError> {
    let config = services.capability_store().load()?.local_agent;
    LocalAgentClient::new(
        Arc::new(CommandLocalAgentProcessRunner),
        config,
        services.capability_output_root()?,
    )
    .run(prompt, cancel)
}

#[tauri::command]
/// run local agent
pub fn run_local_agent(
    services: State<'_, ManagedServices>,
    prompt: String,
) -> Result<LocalAgentResult, AppError> {
    run_local_agent_inner(&services, &prompt, &AtomicBool::new(false))
}

// ===========================================================================
//  Profile list mutation helpers
// ===========================================================================

/// Update or insert a transcription profile.
fn upsert_transcription_profile(profiles: &mut AppProfiles, profile: TranscriptionProfile) {
    if let Some(existing) = profiles
        .transcription_profiles
        .iter_mut()
        .find(|p| p.id == profile.id)
    {
        *existing = profile;
    } else {
        profiles.transcription_profiles.push(profile);
    }
}

/// Update or insert a summary profile.
fn upsert_summary_profile(profiles: &mut AppProfiles, profile: SummaryProfile) {
    if let Some(existing) = profiles
        .summary_profiles
        .iter_mut()
        .find(|p| p.id == profile.id)
    {
        *existing = profile;
    } else {
        profiles.summary_profiles.push(profile);
    }
}

// =========================================================================
//  Compensating rollback helpers
// =========================================================================

/// Rollback a credential to a previous state (or delete if no previous state).
/// Returns an error if the rollback operation itself fails, so callers can
/// surface the combined failure to the user.
pub fn rollback_credential(
    cred_store: &CredentialStore,
    profile_type: &str,
    profile_id: &str,
    old_cred: Option<SecretPayload>,
) -> Result<(), AppError> {
    match old_cred {
        Some(ref old) => {
            cred_store.set(profile_type, profile_id, old)?;
        }
        None => {
            // No previous credential — delete the one we created
            cred_store.delete(profile_type, profile_id)?;
        }
    }
    Ok(())
}

/// Persist the fallback profile as the active transcription profile.
/// Load-save cycles propagate errors rather than ignoring them.
/// After a fallback, the fallback profile ID is preserved in its
/// configured position — the validator permits fallback == active
/// so that the post-switch state is valid without erasing user config.
pub fn persist_fallback_active(
    store: &ProfileStore,
    fallback_profile_id: &str,
) -> Result<(), AppError> {
    let mut profiles = store.load()?;
    profiles.active_transcription_profile_id = Some(fallback_profile_id.to_string());
    // Keep fallback_transcription_profile_id intact — do NOT clear it.
    store.save(&profiles)?;
    Ok(())
}
