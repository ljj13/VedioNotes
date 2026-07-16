// Shared types mirroring Rust domain contracts

export type InputSourceKind = 'file' | 'douyin_url' | 'bilibili_url' | 'youtube_url';

export interface InputSource {
  kind: InputSourceKind;
  path?: string;
  url?: string;
}

export type TaskStage =
  | 'downloading'
  | 'subtitle_fetching'
  | 'preparing_audio'
  | 'transcribing'
  | 'distilling'
  | 'capturing_screenshots'
  | 'saving'
  | 'complete';

export interface TaskProgress {
  stage: TaskStage;
  message: string;
  percent: number;
}

export interface Distillation {
  core_conclusion: string;
  key_evidence: KeyEvidence[];
  implications: string[];
  transcript?: string;
}

export type NoteStyle =
  | 'minimal'
  | 'detailed'
  | 'tutorial'
  | 'academic'
  | 'xiaohongshu'
  | 'life_journal'
  | 'task_oriented'
  | 'business'
  | 'meeting_minutes';

export interface TaskOptions {
  note_template: string;
  include_screenshots: boolean;
  note_style: NoteStyle;
  transcription_mode?: TranscriptionMode;
  sensevoice_model?: SenseVoiceModelId;
  sensevoice_languages?: SenseVoiceLanguage[];
}

export interface KeyEvidence {
  text: string;
  timestamp_seconds?: number;
  source_url?: string;
  screenshot_path?: string;
}

export interface HistoryEntry {
  id: number;
  title: string;
  source: string;
  noteTemplate: string;
  noteStyle: NoteStyle;
  createdAt: string;
  markdownPath: string;
  transcriptPath: string;
  thumbnailPath: string | null;
  screenshotPaths: string[];
}

export type TaskRecordState =
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'cancelled';

export interface TaskRecord {
  id: number;
  taskId: string;
  title: string;
  sourceLabel: string;
  state: TaskRecordState;
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  transcriptionProfileId: string;
  transcriptionProfileName: string;
  transcriptionModel: string;
  summaryProfileId: string;
  summaryProfileName: string;
  summaryModel: string;
  compute: string;
  noteId: number | null;
  errorCode: string | null;
  diagnosticLogId: string | null;
}

export interface TaskRetryRequest {
  source: InputSource;
  options: TaskOptions;
  transcriptionProfileId: string;
  summaryProfileId: string;
}

export type LibrarySort = 'newest' | 'recently_opened' | 'title';

export interface LibraryQuery {
  text?: string;
  favorite?: boolean | null;
  tag?: string | null;
  sort?: LibrarySort;
  limit?: number;
  offset?: number;
}

export interface LibraryEntry extends HistoryEntry {
  favorite: boolean;
  tags: string[];
  lastOpenedAt: string | null;
}

export interface LibraryTag {
  id: number;
  name: string;
  noteCount: number;
}

export interface LibrarySnapshot {
  entries: LibraryEntry[];
  tags: LibraryTag[];
  total: number;
}

export interface HomeSnapshot {
  noteCount: number;
  taskCount: number;
  readyLocalModelCount: number;
  recentNotes: LibraryEntry[];
  recentTasks: TaskRecord[];
}

export interface NoteChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface DistillationResult {
  task_id: string;
  distillation: Distillation;
  saved_path: string;
}

export interface AppError {
  code: string;
  message: string;
  recovery: string;
}

export interface AppPreferences {
  schemaVersion: number;
  markdownOutputDir: string | null;
  localComputeMode: LocalComputeMode;
  transcriptionMode?: TranscriptionMode;
  sensevoiceModel?: SenseVoiceModelId;
  sensevoiceLanguages?: SenseVoiceLanguage[];
  appearance?: AppearancePreferences;
  export?: ExportPreferences;
  logLevel?: LogLevel;
}

export type ExportFormat = 'markdown' | 'html' | 'text';

export interface ExportPreferences {
  format: ExportFormat;
  includeScreenshots: boolean;
  includeSubtitles: boolean;
  includeSourceMetadata: boolean;
  includeDiagnosticLog: boolean;
}

export type CacheCategory = 'temporary_media' | 'screenshots' | 'transcription_intermediates' | 'ai_index' | 'all';

export interface CacheUsageItem {
  category: Exclude<CacheCategory, 'all'>;
  bytes: number;
  fileCount: number;
}

export interface CacheUsage {
  totalBytes: number;
  categories: CacheUsageItem[];
}

export interface CacheClearResult {
  category: CacheCategory;
  removedBytes: number;
  removedFiles: number;
  preservedPaths: string[];
}

export interface LogDescriptor {
  id: string;
  name: string;
  bytes: number;
  modifiedAt: string | null;
}

export interface LogTail {
  id: string;
  content: string;
  truncated: boolean;
}

export type LogLevel = 'debug' | 'info' | 'warning' | 'error';
export type AppearanceTheme = 'system' | 'light' | 'dark';

export interface AppearancePreferences {
  theme: AppearanceTheme;
  compactDensity: boolean;
  reducedMotion: boolean;
}

export interface AboutComponent {
  name: string;
  version: string;
  status: string;
  license: string;
}

export interface AboutSnapshot {
  appVersion: string;
  tauriVersion: string;
  frontendVersion: string;
  rustVersion: string;
  appDataDir: string;
  exportDir: string;
  logDir: string;
  components: AboutComponent[];
}

export type LocalComputeMode = 'auto' | 'cpu';
export type TranscriptionMode = 'sensevoice_cpu' | 'whisper_local' | 'online_profile';
export type SenseVoiceModelId = 'int8' | 'float32';
export type SenseVoiceLanguage = 'zh' | 'en' | 'ja' | 'ko' | 'yue';
export type ArtifactState = 'missing' | 'partial' | 'ready' | 'failed' | 'corrupt';

export interface SenseVoiceModelStatus {
  id: SenseVoiceModelId;
  state: ArtifactState;
  downloadedBytes: number;
  totalBytes: number;
  isSelected: boolean;
}

export interface SenseVoiceStatus {
  state: ArtifactState;
  selectedModel: SenseVoiceModelId;
  runtimeReady: boolean;
  tokensReady: boolean;
  modelPath: string | null;
  models: SenseVoiceModelStatus[];
  downloadedBytes: number;
  totalBytes: number;
}

export interface SenseVoiceDownloadProgress {
  modelId: SenseVoiceModelId;
  artifactId: string;
  downloadedBytes: number;
  totalBytes: number;
  overallPercent: number;
}
export type CudaRuntimeState = 'unavailable' | 'not_installed' | 'downloading' | 'ready' | 'incompatible' | 'error';

export interface CudaRuntimeStatus {
  state: CudaRuntimeState;
  gpuName: string | null;
  version: string;
  computeMode: LocalComputeMode;
  message: string | null;
}

export interface CudaRuntimeDownloadProgress {
  downloadedBytes: number;
  totalBytes: number;
}

export type DownloadPlatform = 'bilibili' | 'douyin' | 'youtube';

/** Boolean-only status for manually entered platform Cookies. */
export interface DownloadCookieStatus {
  bilibili: boolean;
  douyin: boolean;
  youtube: boolean;
}

// ============================================================
// Provider Profile types (mirrors Rust `profiles.rs`)
// ============================================================

export type TranscriptionProviderKind =
  | 'tencent_flash'
  | 'mimo_asr'
  | 'open_ai_compatible'
  | 'local_whisper_cpp';

export interface SummaryModelCatalogEntry {
  id: string;
  name: string;
  summaryEligible: boolean;
  summaryIneligibleReason?: string;
  family?: string;
  modalities: unknown;
  capabilities: unknown;
  limit: unknown;
  cost: unknown;
  status?: string;
  releaseDate?: string;
  lastUpdated?: string;
}

export interface SummaryProviderCatalogEntry {
  id: string;
  displayName: string;
  description: string;
  protocol: string;
  baseUrl: string;
  documentationUrl?: string;
  npmPackage: string;
  models: SummaryModelCatalogEntry[];
}

export interface SaveCatalogSummaryProfileInput {
  providerId: string;
  model: string;
  baseUrlOverride?: string;
  credential?: SecretInput;
}

export type SummaryProviderKind =
  | 'deep_seek'
  | 'mimo'
  | 'open_ai_compatible'
  | 'open_ai_responses'
  | 'anthropic'
  | 'google';

export interface TranscriptionProfile {
  id: string;
  name: string;
  provider: TranscriptionProviderKind;
  baseUrl: string;
  model: string;
  enabled: boolean;
  builtIn: boolean;
}

export interface SummaryProfile {
  id: string;
  name: string;
  provider: SummaryProviderKind;
  baseUrl: string;
  model: string;
  enabled: boolean;
  builtIn: boolean;
}

export interface AppProfiles {
  schemaVersion: number;
  activeTranscriptionProfileId: string | null;
  activeSummaryProfileId: string | null;
  fallbackTranscriptionProfileId: string | null;
  migrationRequired: boolean;
  transcriptionProfiles: TranscriptionProfile[];
  summaryProfiles: SummaryProfile[];
}

export type LocalModelState = 'not_downloaded' | 'downloading' | 'ready' | 'corrupt' | 'failed';

export interface LocalModelStatus {
  id: string;
  state: LocalModelState;
  downloadedBytes: number;
  totalBytes: number;
  isCurrent: boolean;
}

export interface LocalModelDownloadProgress {
  modelId: string;
  downloadedBytes: number;
  totalBytes: number;
}

// ============================================================
// Command-related types
// ============================================================

export interface ProfileTestResult {
  success: boolean;
  message: string;
  latencyMs: number | null;
}

export interface ProviderFallbackEvent {
  fromProfileId: string;
  fromProfileName: string;
  toProfileId: string;
  toProfileName: string;
  reason: string;
}

export type SecretInput =
  | { type: 'bearer'; apiKey: string }
  | { type: 'tencent'; appId: string; secretId: string; secretKey: string };

// ============================================================
// Optional AI capability types
// ============================================================

export interface VectorConfig {
  enabled: boolean;
  providerId: string;
  endpoint: string;
  model: string;
  collection: string;
  dimensions: number | null;
}

export interface RerankConfig {
  enabled: boolean;
  providerId: string;
  endpoint: string;
  model: string;
}

export interface WebSearchConfig {
  enabled: boolean;
  providerId: string;
  endpoint: string;
  maxResults: number;
}

export interface TtsConfig {
  enabled: boolean;
  providerId: string;
  endpoint: string;
  model: string;
  voice: string;
}

export interface ImageConfig {
  enabled: boolean;
  providerId: string;
  endpoint: string;
  model: string;
  size: string;
}

export interface LocalAgentConfig {
  enabled: boolean;
  providerId: string;
  executable: string;
  arguments: string[];
  timeoutSeconds: number;
}

export interface CapabilitySettings {
  schemaVersion: number;
  vector: VectorConfig;
  rerank: RerankConfig;
  webSearch: WebSearchConfig;
  tts: TtsConfig;
  image: ImageConfig;
  localAgent: LocalAgentConfig;
}

export interface CapabilityStatusItem {
  enabled: boolean;
  configured: boolean;
  credentialReady: boolean;
  providerId: string;
}

export interface CapabilityStatus {
  vector: CapabilityStatusItem;
  rerank: CapabilityStatusItem;
  webSearch: CapabilityStatusItem;
  tts: CapabilityStatusItem;
  image: CapabilityStatusItem;
  localAgent: CapabilityStatusItem;
}

export interface CapabilityTestResult {
  ok: boolean;
  message: string;
}

export interface SearchHit {
  id: string;
  score: number;
  text: string;
}

export interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
}

export interface LocalAgentDetection {
  providerId: string;
  configured: boolean;
  executableFound: boolean;
}

export interface LocalAgentResult {
  answer: string;
}
