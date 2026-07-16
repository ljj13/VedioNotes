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
    tokensReady: false as const,
    modelPath: null,
    models: [
      { modelId: 'int8' as const, state: 'not_downloaded' as const, progress: 0, downloadedBytes: 0, totalBytes: 0, path: null },
      { modelId: 'float32' as const, state: 'not_downloaded' as const, progress: 0, downloadedBytes: 0, totalBytes: 0, path: null },
    ],
    downloadedBytes: 0,
    totalBytes: 0,
    ...overrides,
  };
}

describe('TranscriptionTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    platformMocks.getSenseVoiceStatus.mockResolvedValue(makeSenseVoiceStatus());
    platformMocks.onSenseVoiceDownloadProgress.mockResolvedValue(() => {});
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
    expect(await screen.findByText(/int8/i)).toBeTruthy();
    expect(screen.getByText(/中文/)).toBeTruthy();
  });

  it('renders language checkboxes for all five languages', async () => {
    render(<TranscriptionTab {...baseProps} />);
    await screen.findByText(/int8/i);
    expect(screen.getByRole('checkbox', { name: /英语/ })).toBeTruthy();
    expect(screen.getByRole('checkbox', { name: /日语/ })).toBeTruthy();
    expect(screen.getByRole('checkbox', { name: /韩语/ })).toBeTruthy();
    expect(screen.getByRole('checkbox', { name: /粤语/ })).toBeTruthy();
    expect(screen.getByRole('checkbox', { name: /中文/ })).toBeTruthy();
  });
});
