import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import CipherSettingsShell from './CipherSettingsShell';
import type { SettingsEntryProps } from './settingsTypes';

vi.mock('@tauri-apps/api', () => ({}));

const platformMock = vi.hoisted(() => ({
  getCatalog: vi.fn().mockResolvedValue([]),
  getCapabilitySettings: vi.fn().mockResolvedValue({ schemaVersion: 1, vector: { enabled: false, providerId: '', endpoint: '', model: '', collection: '', dimensions: null }, rerank: { enabled: false, providerId: '', endpoint: '', model: '' }, webSearch: { enabled: false, providerId: '', endpoint: '', maxResults: 10 }, tts: { enabled: false, providerId: '', endpoint: '', model: '', voice: '' }, image: { enabled: false, providerId: '', endpoint: '', model: '', size: '' }, localAgent: { enabled: false, providerId: '', executable: '', arguments: [], timeoutSeconds: 60 } }),
  getCapabilityStatus: vi.fn().mockResolvedValue({ vector: { enabled: false, configured: false, credentialReady: false, providerId: '' }, rerank: { enabled: false, configured: false, credentialReady: false, providerId: '' }, webSearch: { enabled: false, configured: false, credentialReady: false, providerId: '' }, tts: { enabled: false, configured: false, credentialReady: false, providerId: '' }, image: { enabled: false, configured: false, credentialReady: false, providerId: '' }, localAgent: { enabled: false, configured: false, credentialReady: false, providerId: '' } }),
  getCudaRuntimeStatus: vi.fn().mockResolvedValue({ state: 'unavailable', gpuName: null, version: '', computeMode: 'auto', message: null }),
  listLocalModels: vi.fn().mockResolvedValue([]),
  onLocalModelDownloadProgress: vi.fn().mockResolvedValue(() => {}),
  onCudaRuntimeDownloadProgress: vi.fn().mockResolvedValue(() => {}),
  setLocalComputeMode: vi.fn().mockResolvedValue({ schemaVersion: 1, markdownOutputDir: null, localComputeMode: 'auto', transcriptionMode: 'sensevoice_cpu', sensevoiceModel: 'int8', sensevoiceLanguages: ['zh'], appearance: { theme: 'system', compactDensity: false, reducedMotion: false } }),
  getCacheUsage: vi.fn().mockResolvedValue({ totalBytes: 0, categories: [] }),
  listLogs: vi.fn().mockResolvedValue([]),
  getAboutSnapshot: vi.fn().mockResolvedValue({ appVersion: '0.0.1', tauriVersion: '2', frontendVersion: '19', rustVersion: '1.91', appDataDir: '', exportDir: '', logDir: '', components: [] }),
  getSenseVoiceStatus: vi.fn().mockResolvedValue({ state: 'missing', selectedModel: 'int8', runtimeReady: false, tokensReady: false, modelPath: null, models: [], downloadedBytes: 0, totalBytes: 0 }),
  saveTranscription: vi.fn().mockResolvedValue({}),
}));
vi.mock('../../platform/settings', () => ({
  settingsPlatform: { ai: platformMock, data: platformMock, about: platformMock, transcription: platformMock, preferences: platformMock },
  attachLateSafeListener: vi.fn(),
}));

const baseProps: SettingsEntryProps = {
  section: 'appearance',
  profiles: { schemaVersion: 1, activeTranscriptionProfileId: null, activeSummaryProfileId: null, fallbackTranscriptionProfileId: null, migrationRequired: false, transcriptionProfiles: [], summaryProfiles: [] },
  localModels: [],
  preferences: { schemaVersion: 1, markdownOutputDir: null, transcriptionMode: 'online_profile', sensevoiceModel: 'int8', sensevoiceLanguages: ['zh'], localComputeMode: 'auto', appearance: { theme: 'system', compactDensity: false, reducedMotion: false } },
  theme: 'dark',
  sidebarCollapsed: false,
  onSelectSection: vi.fn(),
  onReturn: vi.fn(),
  onProfilesChanged: vi.fn(),
  onModelsChanged: vi.fn(),
  onPreferencesChanged: vi.fn(),
  onSenseVoiceStatusChanged: vi.fn(),
  onToggleTheme: vi.fn(),
  onToggleSidebar: vi.fn(),
};

describe('CipherSettingsShell', () => {
  it('renders five icon tabs with correct labels and active page', async () => {
    render(<CipherSettingsShell {...baseProps} section="ai" />);
    expect(screen.getByText('外观')).toBeTruthy();
    expect(screen.getByText('语音转文字')).toBeTruthy();
    expect(screen.getByText('AI 接入')).toBeTruthy();
    expect(screen.getByText('数据管理')).toBeTruthy();
    expect(screen.getByText('关于')).toBeTruthy();
    expect(await screen.findByText('AI 接入')).toBeTruthy();
  });

  it('calls onReturn when back button is clicked', () => {
    render(<CipherSettingsShell {...baseProps} />);
    const back = screen.getByLabelText('返回工作台');
    back.click();
    expect(baseProps.onReturn).toHaveBeenCalledTimes(1);
  });

  it('renders root with theme data attribute', () => {
    const { container } = render(<CipherSettingsShell {...baseProps} theme="light" />);
    const root = container.querySelector('.cipher-settings-root');
    expect(root?.getAttribute('data-theme')).toBe('light');
  });

  it('does not render excluded tabs', () => {
    render(<CipherSettingsShell {...baseProps} />);
    expect(screen.queryByText('数据解密')).toBeNull();
    expect(screen.queryByText('安全')).toBeNull();
    expect(screen.queryByText('记忆')).toBeNull();
    expect(screen.queryByText('插件')).toBeNull();
  });

  it('shows loading skeleton placeholder', () => {
    const { container } = render(<CipherSettingsShell {...baseProps} />);
    expect(container.querySelector('.cipher-settings-body')).toBeTruthy();
  });
});
