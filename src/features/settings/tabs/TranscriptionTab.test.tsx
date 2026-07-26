/**
 *测试文件——测试 TranscriptionTab 组件/模块的行为是否符合预期。
 */

import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import TranscriptionTab from './TranscriptionTab';
import type { SettingsEntryProps } from '../settingsTypes';

const platformMocks = vi.hoisted(() => ({
  getSenseVoiceStatus: vi.fn(),
  downloadSenseVoice: vi.fn(),
  cancelSenseVoiceDownload: vi.fn(),
  deleteSenseVoice: vi.fn(),
  setSenseVoiceModel: vi.fn(),
  onSenseVoiceDownloadProgress: vi.fn(),
  listLocalModels: vi.fn(),
  getCudaRuntimeStatus: vi.fn(),
  downloadCudaRuntime: vi.fn(),
  deleteCudaRuntime: vi.fn(),
  setLocalComputeMode: vi.fn(),
  downloadLocalModel: vi.fn(),
  deleteLocalModel: vi.fn(),
  onLocalModelDownloadProgress: vi.fn(),
  onCudaRuntimeDownloadProgress: vi.fn(),
}));

const prefMocks = vi.hoisted(() => ({
  saveTranscription: vi.fn(),
}));

vi.mock('../../../platform/settings', () => ({
  settingsPlatform: {
    transcription: platformMocks,
    preferences: prefMocks,
  },
  attachLateSafeListener: vi.fn(),
}));

vi.mock('@tauri-apps/api', () => ({}));

const baseProps: SettingsEntryProps = {
  section: 'transcription',
  profiles: { schemaVersion: 1, activeTranscriptionProfileId: null, activeSummaryProfileId: null, fallbackTranscriptionProfileId: null, migrationRequired: false, transcriptionProfiles: [], summaryProfiles: [] },
  localModels: [],
  preferences: { schemaVersion: 1, markdownOutputDir: null, localComputeMode: 'auto', transcriptionMode: 'sensevoice_cpu', sensevoiceModel: 'int8', sensevoiceLanguages: ['zh'], appearance: { theme: 'system', compactDensity: false, reducedMotion: false } },
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

function makeSenseVoiceStatus(overrides = {}) {
  return {
    state: 'missing' as const,
    selectedModel: 'int8' as const,
    runtimeReady: false,
    tokensReady: [] as unknown[],
    modelPath: null,
    models: [
      { id: 'int8' as const, state: 'missing' as const, downloadedBytes: 0, totalBytes: 0, isSelected: false },
      { id: 'float32' as const, state: 'missing' as const, downloadedBytes: 0, totalBytes: 0, isSelected: false },
    ],
    downloadedBytes: 0,
    totalBytes: 0,
    ...overrides,
  };
}

function makeCudaStatus(overrides = {}) {
  return {
    state: 'unavailable' as const,
    gpuName: null,
    version: '',
    computeMode: 'auto' as const,
    message: null,
    ...overrides,
  };
}

// describe('TranscriptionTab', () => {
describe('TranscriptionTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    platformMocks.getSenseVoiceStatus.mockResolvedValue(makeSenseVoiceStatus());
    platformMocks.getCudaRuntimeStatus.mockResolvedValue(makeCudaStatus());
    platformMocks.listLocalModels.mockResolvedValue([]);
    platformMocks.onSenseVoiceDownloadProgress.mockResolvedValue(() => {});
    platformMocks.onLocalModelDownloadProgress.mockResolvedValue(() => {});
    platformMocks.onCudaRuntimeDownloadProgress.mockResolvedValue(() => {});
    platformMocks.downloadSenseVoice.mockResolvedValue(undefined);
    platformMocks.setLocalComputeMode.mockResolvedValue({ schemaVersion: 1, markdownOutputDir: null, localComputeMode: 'auto', transcriptionMode: 'sensevoice_cpu', sensevoiceModel: 'int8', sensevoiceLanguages: ['zh'], appearance: { theme: 'system', compactDensity: false, reducedMotion: false } });
    prefMocks.saveTranscription.mockResolvedValue({ schemaVersion: 1, markdownOutputDir: null, localComputeMode: 'auto', transcriptionMode: 'sensevoice_cpu', sensevoiceModel: 'int8', sensevoiceLanguages: ['zh'] });
  });

  // it('renders three mode tabs: CPU, GPU, Online', async () =>
  it('renders the compact heading and three mode tabs', async () => {
    render(<TranscriptionTab {...baseProps} />);
    expect(await screen.findByRole('heading', { name: '语音转文字' })).toBeTruthy();
    expect(screen.getByText('根据使用场景选择本地 CPU、本地 GPU 或在线转写模式。')).toBeTruthy();
    expect(screen.getByRole('tab', { name: /CPU 模式/ })).toBeTruthy();
    expect(screen.getByRole('tab', { name: /GPU 模式/ })).toBeTruthy();
    expect(screen.getByRole('tab', { name: /在线模式/ })).toBeTruthy();
  });

  it('renders the CPU model configuration and language picker as two columns', async () => {
    const { container } = render(<TranscriptionTab {...baseProps} />);
    await screen.findByText('SenseVoice 本地模型');

    const layout = container.querySelector('.cipher-transcription-dual-layout');
    expect(layout).toBeTruthy();
    expect(layout?.querySelector('.cipher-transcription-left-panel')).toBeTruthy();
    const languagePanel = layout?.querySelector('.cipher-transcription-right-panel');
    expect(languagePanel).toBeTruthy();
    expect(within(languagePanel as HTMLElement).getByRole('heading', { name: '识别语言' })).toBeTruthy();
    expect(within(languagePanel as HTMLElement).getByText('Chinese')).toBeTruthy();
    expect(within(languagePanel as HTMLElement).getByText('Cantonese')).toBeTruthy();
  });

  it('downloads the model selected in the shared model card', async () => {
    const user = userEvent.setup();
    render(<TranscriptionTab {...baseProps} />);

    await user.click(await screen.findByRole('radio', { name: /float32 完整版/ }));
    await user.click(screen.getByRole('button', { name: /下载模型/ }));

    expect(platformMocks.downloadSenseVoice).toHaveBeenCalledWith('float32');
  });

  // it('CPU tab shows SenseVoice model status and language selec
  it('CPU tab shows SenseVoice model status and language selection', async () => {
    render(<TranscriptionTab {...baseProps} />);
    expect(await screen.findByText(/int8 量化版/)).toBeTruthy();
    expect(screen.getByRole('checkbox', { name: /中文/ })).toBeTruthy();
  });

  // it('renders language checkboxes for all five languages', asy
  it('renders language checkboxes for all five languages', async () => {
    render(<TranscriptionTab {...baseProps} />);
    await screen.findByText(/int8 量化版/);
    expect(screen.getByRole('checkbox', { name: /英语/ })).toBeTruthy();
    expect(screen.getByRole('checkbox', { name: /日语/ })).toBeTruthy();
    expect(screen.getByRole('checkbox', { name: /韩语/ })).toBeTruthy();
    expect(screen.getByRole('checkbox', { name: /粤语/ })).toBeTruthy();
    expect(screen.getByRole('checkbox', { name: /中文/ })).toBeTruthy();
  });

  // it('GPU tab shows CUDA runtime status', async () => {
  it('GPU tab shows CUDA runtime status', async () => {
    const gpuProps = { ...baseProps, preferences: { ...baseProps.preferences, transcriptionMode: 'whisper_local' as const } };
    render(<TranscriptionTab {...gpuProps} />);
    expect(await screen.findByText('CUDA 运行时')).toBeTruthy();
    expect(screen.getByText('暂无已下载的本地模型。')).toBeTruthy();
  });

  // it('shows compute mode buttons', async () => {
  it('shows compute mode buttons', async () => {
    const gpuProps = { ...baseProps, preferences: { ...baseProps.preferences, transcriptionMode: 'whisper_local' as const } };
    render(<TranscriptionTab {...gpuProps} />);
    expect(await screen.findByText('计算模式')).toBeTruthy();
    expect(screen.getByText('自动')).toBeTruthy();
    expect(screen.getByText('仅 CPU')).toBeTruthy();
  });
});
