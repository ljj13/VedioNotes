/**
 *测试文件——测试 CipherSettingsShell 组件/模块的行为是否符合预期。
 */

import { useState } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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

// describe('CipherSettingsShell', () => {
describe('CipherSettingsShell', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    platformMock.getSenseVoiceStatus.mockResolvedValue({ state: 'missing', selectedModel: 'int8', runtimeReady: false, tokensReady: false, modelPath: null, models: [], downloadedBytes: 0, totalBytes: 0 });
    platformMock.getCudaRuntimeStatus.mockResolvedValue({ state: 'unavailable', gpuName: null, version: '', computeMode: 'auto', message: null });
    platformMock.listLocalModels.mockResolvedValue([]);
  });
  // it('renders five icon tabs with correct labels and active pa
  it('renders five icon tabs with correct labels and active page', async () => {
    render(<CipherSettingsShell {...baseProps} section="ai" />);
    expect(screen.getByText('外观')).toBeTruthy();
    expect(screen.getByText('语音转文字')).toBeTruthy();
    expect(screen.getByText('AI 接入')).toBeTruthy();
    expect(screen.getByText('数据管理')).toBeTruthy();
    expect(screen.getByText('关于')).toBeTruthy();
    expect(await screen.findByText('AI 接入')).toBeTruthy();
  });

  // it('keeps return navigation outside the transplanted CipherT
  it('keeps return navigation outside the transplanted CipherTalk shell', () => {
    render(<CipherSettingsShell {...baseProps} />);
    expect(screen.queryByLabelText('返回工作台')).toBeNull();
  });

  // it('renders root with theme data attribute', () => {
  it('renders root with theme data attribute', () => {
    const { container } = render(<CipherSettingsShell {...baseProps} theme="light" />);
    const root = container.querySelector('.cipher-settings-root');
    expect(root?.getAttribute('data-theme')).toBe('light');
    expect(screen.getByRole('region', { name: '设置工作区' })).toBeTruthy();
    expect(container.querySelector('.settings-page-header')).toBeTruthy();
  });

  it('places the compact heading and five settings tabs in the C layout header row', () => {
    const { container } = render(<CipherSettingsShell {...baseProps} section="ai" />);
    const layout = container.querySelector('.settings-shell-layout');
    expect(layout).toBeTruthy();
    expect(layout?.children[0]?.classList.contains('settings-page-header')).toBe(true);
    expect(layout?.children[1]?.classList.contains('settings-navigation-tabs')).toBe(true);
    expect(layout?.children[2]?.classList.contains('settings-body')).toBe(true);
    expect(container.querySelector('.settings-navigation-rail')).toBeNull();
    expect(container.querySelector('.settings-navigation-heading')).toBeNull();

    const tablist = screen.getByRole('tablist', { name: '设置分类' });
    expect(within(tablist).getAllByRole('tab').map((tab) => tab.textContent?.trim())).toEqual([
      '外观', '语音转文字', 'AI 接入', '数据管理', '关于',
    ]);
    expect(within(tablist).getByRole('tab', { name: 'AI 接入' }).getAttribute('aria-selected')).toBe('true');
    expect(tablist.classList.contains('cipher-settings-primary-tab-list')).toBe(true);
    expect(Array.from(tablist.children).every((tab) => tab.classList.contains('cipher-settings-primary-tab'))).toBe(true);
    expect(container.querySelector('.settings-navigation-tabs .tabs__indicator')).toBeNull();
  });

  it('keeps the existing controlled section change contract', async () => {
    const onSelectSection = vi.fn();
    render(<CipherSettingsShell {...baseProps} section="appearance" onSelectSection={onSelectSection} />);
    await userEvent.click(screen.getByRole('tab', { name: '数据管理' }));
    expect(onSelectSection).toHaveBeenCalledTimes(1);
    expect(onSelectSection).toHaveBeenCalledWith('data');
  });

  it('keeps cached runtime status and model selection without probing again while switching tabs', async () => {
    const q8Model = {
      id: 'large-v3-turbo-q8',
      state: 'ready' as const,
      downloadedBytes: 835_000_000,
      totalBytes: 835_000_000,
      isCurrent: true,
    };
    platformMock.getCudaRuntimeStatus.mockResolvedValue({
      state: 'ready', gpuName: 'NVIDIA GeForce RTX 4060 Laptop GPU', version: '12.8', computeMode: 'auto', message: null,
    });
    platformMock.listLocalModels.mockResolvedValue([q8Model]);

    function Harness() {
      const [section, setSection] = useState<SettingsEntryProps['section']>('transcription');
      return (
        <CipherSettingsShell
          {...baseProps}
          section={section}
          localModels={[q8Model]}
          cudaStatus={{ state: 'ready', gpuName: 'NVIDIA GeForce RTX 4060 Laptop GPU', version: '12.8', computeMode: 'auto', message: null }}
          senseVoiceStatus={{ state: 'missing', selectedModel: 'int8', runtimeReady: false, tokensReady: false, modelPath: null, models: [], downloadedBytes: 0, totalBytes: 0 }}
          runtimeStatusLoading={false}
          preferences={{ ...baseProps.preferences, transcriptionMode: 'whisper_local' }}
          onSelectSection={setSection}
        />
      );
    }

    render(<Harness />);
    const q8Radio = await screen.findByRole('radio', { name: /Turbo-Q8 量化/ });
    expect((q8Radio as HTMLInputElement).checked).toBe(true);
    expect(platformMock.getCudaRuntimeStatus).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('tab', { name: '外观' }));
    await userEvent.click(screen.getByRole('tab', { name: '语音转文字' }));

    expect((screen.getByRole('radio', { name: /Turbo-Q8 量化/ }) as HTMLInputElement).checked).toBe(true);
    expect(platformMock.getSenseVoiceStatus).not.toHaveBeenCalled();
    expect(platformMock.getCudaRuntimeStatus).not.toHaveBeenCalled();
    expect(platformMock.listLocalModels).not.toHaveBeenCalled();
  });

  // it('does not render excluded tabs', () => {
  it('does not render excluded tabs', () => {
    render(<CipherSettingsShell {...baseProps} />);
    expect(screen.queryByText('数据解密')).toBeNull();
    expect(screen.queryByText('安全')).toBeNull();
    expect(screen.queryByText('记忆')).toBeNull();
    expect(screen.queryByText('插件')).toBeNull();
  });

  // it('renders the settings body without a lazy-loading placeho
  it('renders the settings body without a lazy-loading placeholder', () => {
    const { container } = render(<CipherSettingsShell {...baseProps} />);
    expect(container.querySelector('.settings-body')).toBeTruthy();
    expect(screen.getByRole('heading', { name: '外观' })).toBeTruthy();
    expect(screen.queryByLabelText('正在加载设置页面')).toBeNull();
  });
});
