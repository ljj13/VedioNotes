import { invoke } from '@tauri-apps/api/core';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import type {
  AboutSnapshot,
  AppearancePreferences,
  AppError,
  AppPreferences,
  AppProfiles,
  CacheCategory,
  CacheClearResult,
  CacheUsage,
  CapabilitySettings,
  CapabilityStatus,
  CapabilityStatusItem,
  CapabilityTestResult,
  CudaRuntimeDownloadProgress,
  CudaRuntimeStatus,
  DistillationResult,
  DownloadCookieStatus,
  DownloadPlatform,
  ExportFormat,
  ExportPreferences,
  HistoryEntry,
  HomeSnapshot,
  ImageConfig,
  InputSource,
  LibraryEntry,
  LibraryQuery,
  LibrarySnapshot,
  LocalAgentConfig,
  LocalAgentDetection,
  LocalAgentResult,
  LocalComputeMode,
  LocalModelStatus,
  LogDescriptor,
  LogLevel,
  LogTail,
  NoteChatTurn,
  ProfileTestResult,
  ProviderFallbackEvent,
  RerankConfig,
  SaveCatalogSummaryProfileInput,
  SearchHit,
  SecretInput,
  SenseVoiceLanguage,
  SenseVoiceModelId,
  SenseVoiceStatus,
  SummaryProviderCatalogEntry,
  SummaryProfile,
  TaskOptions,
  TaskProgress,
  TaskRecord,
  TaskRetryRequest,
  TranscriptionMode,
  TranscriptionProfile,
  TtsConfig,
  VectorConfig,
  WebSearchConfig,
  WebSearchResult,
  LocalModelDownloadProgress,
  SenseVoiceDownloadProgress,
} from './types';



export function getPreferences(): Promise<AppPreferences> {
  return invoke<AppPreferences>('get_preferences');
}

export function setMarkdownOutputDir(path: string | null): Promise<AppPreferences> {
  return invoke<AppPreferences>('set_markdown_output_dir', { path });
}

export function getProfiles(): Promise<AppProfiles> {
  return invoke<AppProfiles>('get_profiles');
}

export function getSummaryProviderCatalog(): Promise<SummaryProviderCatalogEntry[]> {
  return invoke<SummaryProviderCatalogEntry[]>('get_summary_provider_catalog');
}

export function saveAndActivateCatalogSummaryProfile(input: SaveCatalogSummaryProfileInput): Promise<AppProfiles> {
  return invoke<AppProfiles>('save_and_activate_catalog_summary_profile', {
    providerId: input.providerId,
    model: input.model,
    baseUrlOverride: input.baseUrlOverride ?? null,
    credential: input.credential ?? null,
  });
}

export function saveTranscriptionProfile(profile: TranscriptionProfile, credential?: SecretInput): Promise<AppProfiles> {
  return invoke<AppProfiles>('save_transcription_profile', { profile, credential: credential ?? null });
}

export function deleteProfile(profileType: string, profileId: string): Promise<AppProfiles> {
  return invoke<AppProfiles>('delete_profile', { profileType, profileId });
}

export function setActiveProfile(profileType: string, profileId: string): Promise<AppProfiles> {
  return invoke<AppProfiles>('set_active_profile', { profileType, profileId });
}

export function setFallbackTranscriptionProfile(profileId: string | null): Promise<AppProfiles> {
  return invoke<AppProfiles>('set_fallback_transcription_profile', { profileId });
}

export function testProfile(profileType: string, profileId: string): Promise<ProfileTestResult> {
  return invoke<ProfileTestResult>('test_profile', { profileType, profileId });
}

export function discoverSummaryModels(profileId: string): Promise<string[]> {
  return invoke<string[]>('discover_summary_models', { profileId });
}

export function saveAppearancePreferences(appearance: AppearancePreferences): Promise<AppPreferences> {
  return invoke<AppPreferences>('save_appearance_preferences', { appearance });
}

export function getAboutSnapshot(): Promise<AboutSnapshot> {
  return invoke<AboutSnapshot>('get_about_snapshot');
}

export function openAppDataDirectory(): Promise<void> {
  return invoke<void>('open_app_data_directory');
}

export function openExportDirectory(): Promise<void> {
  return invoke<void>('open_export_directory');
}

export function openLogDirectory(): Promise<void> {
  return invoke<void>('open_log_directory');
}

export function openDocumentation(): Promise<void> {
  return invoke<void>('open_documentation');
}

export function getExportPreferences(): Promise<ExportPreferences> {
  return invoke<ExportPreferences>('get_export_preferences');
}

export function saveExportPreferences(preferences: ExportPreferences): Promise<ExportPreferences> {
  return invoke<ExportPreferences>('save_export_preferences', { preferences });
}

export function restoreExportPreferences(): Promise<ExportPreferences> {
  return invoke<ExportPreferences>('restore_export_preferences');
}

export function exportNote(title: string, markdown: string, format: ExportFormat): Promise<string> {
  return invoke<string>('export_note', { title, markdown, format });
}

export function getCacheUsage(): Promise<CacheUsage> {
  return invoke<CacheUsage>('get_cache_usage');
}

export function clearCache(category: CacheCategory): Promise<CacheClearResult> {
  return invoke<CacheClearResult>('clear_cache', { category });
}

export function listLogs(): Promise<LogDescriptor[]> {
  return invoke<LogDescriptor[]>('list_logs');
}

export function readLog(id: string, maxBytes?: number): Promise<LogTail> {
  return invoke<LogTail>('read_log', { id, maxBytes: maxBytes ?? null });
}

export function setLogLevel(level: LogLevel): Promise<LogLevel> {
  return invoke<LogLevel>('set_log_level', { level });
}

export function clearLogs(): Promise<number> {
  return invoke<number>('clear_logs');
}

export function checkApiKey(): Promise<boolean> {
  return invoke<boolean>('check_api_key');
}

export function hasProfileCredential(profileType: string, profileId: string): Promise<boolean> {
  return invoke<boolean>('has_profile_credential', { profileType, profileId });
}

export function getMigrationState(): Promise<boolean> {
  return invoke<boolean>('get_migration_state');
}

export function completeMigration(confirmed: boolean): Promise<AppProfiles> {
  return invoke<AppProfiles>('complete_migration', { confirmed });
}



export function onLocalModelDownloadProgress(callback: (progress: LocalModelDownloadProgress) => void): Promise<UnlistenFn> {
  return listen('local-model-download-progress', (event) => callback(event.payload as LocalModelDownloadProgress));
}

export function onSenseVoiceDownloadProgress(callback: (progress: SenseVoiceDownloadProgress) => void): Promise<UnlistenFn> {
  return listen('sensevoice-download-progress', (event) => callback(event.payload as SenseVoiceDownloadProgress));
}

export async function invokeStartDistillation(
  taskId: string,
  input: InputSource,
  transcriptionProfileId: string,
  summaryProfileId: string,
  options: TaskOptions,
): Promise<void> {
  return invoke<void>('start_distillation', {
    taskId,
    source: input,
    transcriptionProfileId,
    summaryProfileId,
    options,
  });
}

export async function onTaskProgress(taskId: string, callback: (progress: TaskProgress) => void): Promise<UnlistenFn> {
  return listenProgress(taskId, callback);
}

export async function onTaskComplete(taskId: string, callback: (result: DistillationResult) => void): Promise<UnlistenFn> {
  return listen(`task-complete:${taskId}`, (event) => callback(event.payload as DistillationResult));
}

export function onTaskError(taskId: string, callback: (error: AppError) => void): Promise<UnlistenFn> {
  return listen(`task-error:${taskId}`, (event) => callback(event.payload as AppError));
}

export function onProviderFallback(taskId: string, callback: (event: ProviderFallbackEvent) => void): Promise<UnlistenFn> {
  return listen(`provider-fallback:${taskId}`, (event) => callback(event.payload as ProviderFallbackEvent));
}


export function cancelDistillation(taskId: string): Promise<void> {
  return invoke<void>('cancel_distillation', { taskId });
}

export function getHistory(id: number): Promise<HistoryEntry | null> {
  return invoke<HistoryEntry | null>('get_history', { id });
}

export function listHistory(): Promise<HistoryEntry[]> {
  return invoke<HistoryEntry[]>('list_history');
}

export function searchHistory(query: string): Promise<HistoryEntry[]> {
  return invoke<HistoryEntry[]>('search_history', { query });
}

export function deleteHistory(id: number): Promise<void> {
  return invoke<void>('delete_history', { id });
}

export function askHistoryNote(id: number, question: string): Promise<NoteChatTurn[]> {
  return invoke<NoteChatTurn[]>('ask_history_note', { id, question });
}

export function getHistoryMarkdown(id: number): Promise<string> {
  return invoke<string>('get_history_markdown', { id });
}

export function listenProgress(taskId: string, callback: (progress: TaskProgress) => void): Promise<UnlistenFn> {
  return listen(`task-progress:${taskId}`, (event) => callback(event.payload as TaskProgress));
}

export function setTranscriptionPreferences(mode: TranscriptionMode, languages: SenseVoiceLanguage[]): Promise<AppPreferences> {
  return invoke<AppPreferences>('set_transcription_preferences', {
    transcriptionMode: mode,
    sensevoiceLanguages: languages,
  });
}

export function getHomeSnapshot(): Promise<HomeSnapshot> {
  return invoke<HomeSnapshot>('get_home_snapshot');
}

export function listTaskRecords(query = ''): Promise<TaskRecord[]> {
  return invoke<TaskRecord[]>('list_task_records', { query });
}

export function retryTaskRecord(id: number): Promise<TaskRetryRequest> {
  return invoke<TaskRetryRequest>('retry_task_record', { id });
}

export function searchLibrary(query: LibraryQuery): Promise<LibrarySnapshot> {
  return invoke<LibrarySnapshot>('search_library', { query });
}

export function setNoteFavorite(id: number, favorite: boolean): Promise<LibraryEntry> {
  return invoke<LibraryEntry>('set_note_favorite', { id, favorite });
}

export function setNoteTags(id: number, tags: string[]): Promise<LibraryEntry> {
  return invoke<LibraryEntry>('set_note_tags', { id, tags });
}

export function markNoteOpened(id: number): Promise<LibraryEntry> {
  return invoke<LibraryEntry>('mark_note_opened', { id });
}

export function listLocalModels(): Promise<LocalModelStatus[]> {
  return invoke<LocalModelStatus[]>('list_local_models');
}

export function downloadLocalModel(modelId: string): Promise<void> {
  return invoke<void>('download_local_model', { modelId });
}

export function deleteLocalModel(modelId: string, confirmedCurrentDelete: boolean): Promise<void> {
  return invoke<void>('delete_local_model', { modelId, confirmedCurrentDelete });
}

export function getCudaRuntimeStatus(): Promise<CudaRuntimeStatus> {
  return invoke<CudaRuntimeStatus>('get_cuda_runtime_status');
}

export function setLocalComputeMode(mode: LocalComputeMode): Promise<AppPreferences> {
  return invoke<AppPreferences>('set_local_compute_mode', { mode });
}

export function downloadCudaRuntime(): Promise<void> {
  return invoke<void>('download_cuda_runtime');
}

export function deleteCudaRuntime(): Promise<void> {
  return invoke<void>('delete_cuda_runtime');
}

export function getSenseVoiceStatus(): Promise<SenseVoiceStatus> {
  return invoke<SenseVoiceStatus>('get_sensevoice_status');
}

export function downloadSenseVoice(modelId: SenseVoiceModelId): Promise<SenseVoiceStatus> {
  return invoke<SenseVoiceStatus>('download_sensevoice', { modelId });
}

export function cancelSenseVoiceDownload(): Promise<void> {
  return invoke<void>('cancel_sensevoice_download');
}

export function deleteSenseVoice(modelId: SenseVoiceModelId, confirmedSelectedDelete: boolean): Promise<SenseVoiceStatus> {
  return invoke<SenseVoiceStatus>('delete_sensevoice', { modelId, confirmedSelectedDelete });
}

export function setSenseVoiceModel(modelId: SenseVoiceModelId): Promise<SenseVoiceStatus> {
  return invoke<SenseVoiceStatus>('set_sensevoice_model', { modelId });
}

export function getDownloadCookieStatus(): Promise<DownloadCookieStatus> {
  return invoke<DownloadCookieStatus>('get_download_cookie_status');
}

export function saveDownloadCookie(platform: DownloadPlatform, cookieText: string): Promise<void> {
  return invoke<void>('save_download_cookie', { platform, cookieText });
}

export function deleteDownloadCookie(platform: DownloadPlatform): Promise<void> {
  return invoke<void>('delete_download_cookie', { platform });
}

export function getDiagnosticLogPath(): Promise<string> {
  return invoke<string>('get_diagnostic_log_path');
}

export function getCapabilitySettings(): Promise<CapabilitySettings> {
  return invoke<CapabilitySettings>('get_capability_settings');
}

export function getCapabilityStatus(): Promise<CapabilityStatus> {
  return invoke<CapabilityStatus>('get_capability_status');
}

export function saveVectorConfig(config: VectorConfig, credential?: SecretInput): Promise<CapabilityStatusItem> {
  return invoke<CapabilityStatusItem>('save_vector_config', { config, credential: credential ?? null });
}

export function saveRerankConfig(config: RerankConfig, credential?: SecretInput): Promise<CapabilityStatusItem> {
  return invoke<CapabilityStatusItem>('save_rerank_config', { config, credential: credential ?? null });
}

export function saveWebSearchConfig(config: WebSearchConfig, credential?: SecretInput): Promise<CapabilityStatusItem> {
  return invoke<CapabilityStatusItem>('save_web_search_config', { config, credential: credential ?? null });
}

export function saveTtsConfig(config: TtsConfig, credential?: SecretInput): Promise<CapabilityStatusItem> {
  return invoke<CapabilityStatusItem>('save_tts_config', { config, credential: credential ?? null });
}

export function saveImageConfig(config: ImageConfig, credential?: SecretInput): Promise<CapabilityStatusItem> {
  return invoke<CapabilityStatusItem>('save_image_config', { config, credential: credential ?? null });
}

export function saveLocalAgentConfig(config: LocalAgentConfig): Promise<CapabilityStatusItem> {
  return invoke<CapabilityStatusItem>('save_local_agent_config', { config });
}

export function testVectorConfig(): Promise<CapabilityTestResult> {
  return invoke<CapabilityTestResult>('test_vector_config');
}

export function testRerankConfig(): Promise<CapabilityTestResult> {
  return invoke<CapabilityTestResult>('test_rerank_config');
}

export function testWebSearchConfig(): Promise<CapabilityTestResult> {
  return invoke<CapabilityTestResult>('test_web_search_config');
}

export function testTtsConfig(): Promise<CapabilityTestResult> {
  return invoke<CapabilityTestResult>('test_tts_config');
}

export function testImageConfig(): Promise<CapabilityTestResult> {
  return invoke<CapabilityTestResult>('test_image_config');
}

export function testLocalAgentConfig(): Promise<CapabilityTestResult> {
  return invoke<CapabilityTestResult>('test_local_agent_config');
}

export function indexNote(noteId: string, text: string): Promise<void> {
  return invoke<void>('index_note', { noteId, text });
}

export function semanticSearch(query: string, limit: number): Promise<SearchHit[]> {
  return invoke<SearchHit[]>('semantic_search', { query, limit });
}

export function webSearch(query: string): Promise<WebSearchResult[]> {
  return invoke<WebSearchResult[]>('web_search', { query });
}

export function synthesizeSpeech(text: string): Promise<string> {
  return invoke<string>('synthesize_speech', { text });
}

export function generateNoteImage(prompt: string): Promise<string> {
  return invoke<string>('generate_note_image', { prompt });
}

export function detectLocalAgents(): Promise<LocalAgentDetection[]> {
  return invoke<LocalAgentDetection[]>('detect_local_agents');
}

export function runLocalAgent(prompt: string): Promise<LocalAgentResult> {
  return invoke<LocalAgentResult>('run_local_agent', { prompt });
}

export function copyMarkdownResult(sourcePath: string, destinationPath: string): Promise<string> {
  return invoke<string>('copy_markdown_result', { sourcePath, destinationPath });
}

export function onCudaRuntimeDownloadProgress(callback: (progress: CudaRuntimeDownloadProgress) => void): Promise<UnlistenFn> {
  return listen('cuda-runtime-download-progress', (event) => callback(event.payload as CudaRuntimeDownloadProgress));
}

export function saveSummaryProfile(profile: SummaryProfile, credential?: SecretInput): Promise<AppProfiles> {
  return invoke<AppProfiles>('save_summary_profile', { profile, credential: credential ?? null });
}
