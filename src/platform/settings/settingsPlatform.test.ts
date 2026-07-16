import { beforeEach, describe, expect, it, vi } from 'vitest';

const bridge = vi.hoisted(() => ({
  saveAppearancePreferences: vi.fn(),
  setTranscriptionPreferences: vi.fn(),
  getSenseVoiceStatus: vi.fn(),
  getSummaryProviderCatalog: vi.fn(),
  getCacheUsage: vi.fn(),
  getAboutSnapshot: vi.fn(),
  openAppDataDirectory: vi.fn(),
  openExportDirectory: vi.fn(),
  openLogDirectory: vi.fn(),
  openDocumentation: vi.fn(),
  listLocalModels: vi.fn(),
  downloadLocalModel: vi.fn(),
  deleteLocalModel: vi.fn(),
  getCudaRuntimeStatus: vi.fn(),
  downloadCudaRuntime: vi.fn(),
  deleteCudaRuntime: vi.fn(),
  setLocalComputeMode: vi.fn(),
  downloadSenseVoice: vi.fn(),
  cancelSenseVoiceDownload: vi.fn(),
  deleteSenseVoice: vi.fn(),
  setSenseVoiceModel: vi.fn(),
  saveTranscriptionProfile: vi.fn(),
  deleteProfile: vi.fn(),
  setActiveProfile: vi.fn(),
  setFallbackTranscriptionProfile: vi.fn(),
  testProfile: vi.fn(),
  hasProfileCredential: vi.fn(),
  onLocalModelDownloadProgress: vi.fn(),
  onSenseVoiceDownloadProgress: vi.fn(),
  onCudaRuntimeDownloadProgress: vi.fn(),
  saveAndActivateCatalogSummaryProfile: vi.fn(),
  saveSummaryProfile: vi.fn(),
  discoverSummaryModels: vi.fn(),
  getCapabilitySettings: vi.fn(),
  getCapabilityStatus: vi.fn(),
  saveVectorConfig: vi.fn(),
  saveRerankConfig: vi.fn(),
  saveWebSearchConfig: vi.fn(),
  saveTtsConfig: vi.fn(),
  saveImageConfig: vi.fn(),
  saveLocalAgentConfig: vi.fn(),
  testVectorConfig: vi.fn(),
  testRerankConfig: vi.fn(),
  testWebSearchConfig: vi.fn(),
  testTtsConfig: vi.fn(),
  testImageConfig: vi.fn(),
  testLocalAgentConfig: vi.fn(),
  detectLocalAgents: vi.fn(),
  getExportPreferences: vi.fn(),
  saveExportPreferences: vi.fn(),
  restoreExportPreferences: vi.fn(),
  exportNote: vi.fn(),
  clearCache: vi.fn(),
  listLogs: vi.fn(),
  readLog: vi.fn(),
  setLogLevel: vi.fn(),
  clearLogs: vi.fn(),
}));
vi.mock('../../lib/bridge', () => bridge);

import { settingsPlatform } from './index';
import { attachLateSafeListener } from './events';

describe('settingsPlatform', () => {
  beforeEach(() => vi.clearAllMocks());

  it('forwards typed settings calls to the existing Tauri bridge', async () => {
    bridge.saveAppearancePreferences.mockResolvedValue({ schemaVersion: 1 });
    bridge.getSenseVoiceStatus.mockResolvedValue({ state: 'missing' });
    await settingsPlatform.preferences.saveAppearance({ theme: 'dark', compactDensity: false, reducedMotion: false });
    await settingsPlatform.transcription.getSenseVoiceStatus();
    expect(bridge.saveAppearancePreferences).toHaveBeenCalledTimes(1);
    expect(bridge.getSenseVoiceStatus).toHaveBeenCalledTimes(1);
  });

  it('disposes a listener that resolves after the component becomes inactive', async () => {
    const unlisten = vi.fn();
    let active = true;
    const registration = Promise.resolve(unlisten);
    active = false;
    const attached = await attachLateSafeListener(() => active, registration);
    expect(attached).toBeNull();
    expect(unlisten).toHaveBeenCalledTimes(1);
  });
});
