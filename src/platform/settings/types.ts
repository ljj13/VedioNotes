import type { UnlistenFn } from '@tauri-apps/api/event';
import type {
  AboutSnapshot, AppPreferences, AppProfiles, AppearancePreferences,
  CacheCategory, CacheClearResult, CacheUsage, CapabilitySettings,
  CapabilityStatus, CapabilityStatusItem, CapabilityTestResult,
  CudaRuntimeDownloadProgress, CudaRuntimeStatus, ExportPreferences,
  ImageConfig, LocalAgentConfig, LocalModelDownloadProgress,
  LocalModelStatus, LogDescriptor, LogLevel, LogTail, RerankConfig,
  SaveCatalogSummaryProfileInput, SecretInput, SenseVoiceDownloadProgress,
  SenseVoiceLanguage, SenseVoiceModelId, SenseVoiceStatus,
  SummaryProviderCatalogEntry, TranscriptionMode, TranscriptionProfile,
  TtsConfig, VectorConfig, WebSearchConfig,
} from '../../lib/types';

export type SettingsUnlisten = UnlistenFn;
export type {
  AboutSnapshot, AppPreferences, AppProfiles, AppearancePreferences,
  CacheCategory, CacheClearResult, CacheUsage, CapabilitySettings,
  CapabilityStatus, CapabilityStatusItem, CapabilityTestResult,
  CudaRuntimeDownloadProgress, CudaRuntimeStatus, ExportPreferences,
  ImageConfig, LocalAgentConfig, LocalModelDownloadProgress,
  LocalModelStatus, LogDescriptor, LogLevel, LogTail, RerankConfig,
  SaveCatalogSummaryProfileInput, SecretInput, SenseVoiceDownloadProgress,
  SenseVoiceLanguage, SenseVoiceModelId, SenseVoiceStatus,
  SummaryProviderCatalogEntry, TranscriptionMode, TranscriptionProfile,
  TtsConfig, VectorConfig, WebSearchConfig,
};
