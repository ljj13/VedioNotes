import { render, screen } from '@testing-library/react';
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

describe('TranscriptionTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    platformMocks.getSenseVoiceStatus.mockResolvedValue(makeSenseVoiceStatus());
    platformMocks.getCudaRuntimeStatus.mockResolvedValue(makeCudaStatus());
    platformMocks.listLocalModels.mockResolvedValue([]);
    platformMocks.onSenseVoiceDownloadProgress.mockResolvedValue(() => {});
    platformMocks.onLocalModelDownloadProgress.mockResolvedValue(() => {});
    platformMocks.onCudaRuntimeDownloadProgress.mockResolvedValue(() => {});
    platformMocks.setLocalComputeMode.mockResolvedValue({ schemaVersion: 1, markdownOutputDir: null, localComputeMode: 'auto', transcriptionMode: 'sensevoice_cpu', sensevoiceModel: 'int8', sensevoiceLanguages: ['zh'], appearance: { theme: 'system', compactDensity: false, reducedMotion: false } });
    prefMocks.saveTranscription.mockResolvedValue({ schemaVersion: 1, markdownOutputDir: null, localComputeMode: 'auto', transcriptionMode: 'sensevoice_cpu', sensevoiceModel: 'int8', sensevoiceLanguages: ['zh'] });
  });

  it('renders three mode tabs: CPU, GPU, Online', async () => {
    render(<TranscriptionTab {...baseProps} />);
    expect(await screen.findByText('CPU 转写')).toBeTruthy();
    expect(screen.getByText('GPU 转写')).toBeTruthy();
    expect(screen.getByText('在线转写')).toBeTruthy();
  });

  it('CPU tab shows SenseVoice model status and language selection', async () => {
    render(<TranscriptionTab {...baseProps} />);
    expect(await screen.findByText(/int8 量化版/)).toBeTruthy();
    expect(screen.getByText(/中文/)).toBeTruthy();
  });

  it('renders language checkboxes for all five languages', async () => {
    render(<TranscriptionTab {...baseProps} />);
    await screen.findByText(/int8 量化版/);
    expect(screen.getByRole('checkbox', { name: /英语/ })).toBeTruthy();
    expect(screen.getByRole('checkbox', { name: /日语/ })).toBeTruthy();
    expect(screen.getByRole('checkbox', { name: /韩语/ })).toBeTruthy();
    expect(screen.getByRole('checkbox', { name: /粤语/ })).toBeTruthy();
    expect(screen.getByRole('checkbox', { name: /中文/ })).toBeTruthy();
  });

  it('GPU tab shows CUDA runtime status', async () => {
    const gpuProps = { ...baseProps, preferences: { ...baseProps.preferences, transcriptionMode: 'whisper_local' as const } };
    render(<TranscriptionTab {...gpuProps} />);
    expect(await screen.findByText('CUDA 运行时')).toBeTruthy();
    expect(screen.getByText('暂无已下载的本地模型。')).toBeTruthy();
  });

  it('shows compute mode buttons', async () => {
    const gpuProps = { ...baseProps, preferences: { ...baseProps.preferences, transcriptionMode: 'whisper_local' as const } };
    render(<TranscriptionTab {...gpuProps} />);
    expect(await screen.findByText('计算模式')).toBeTruthy();
    expect(screen.getByText('自动')).toBeTruthy();
    expect(screen.getByText('仅 CPU')).toBeTruthy();
  });
});
