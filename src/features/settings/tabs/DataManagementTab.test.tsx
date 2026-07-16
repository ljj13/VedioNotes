import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { settingsPlatform } from '../../../platform/settings';
import DataManagementTab from './DataManagementTab';
import type { SettingsEntryProps } from '../settingsTypes';

vi.mock('@tauri-apps/api', () => ({}));

const baseProps: SettingsEntryProps = {
  section: 'data',
  profiles: { schemaVersion: 1, activeTranscriptionProfileId: null, activeSummaryProfileId: null, fallbackTranscriptionProfileId: null, migrationRequired: false, transcriptionProfiles: [], summaryProfiles: [] },
  localModels: [],
  preferences: { schemaVersion: 1, markdownOutputDir: null, localComputeMode: 'auto', appearance: { theme: 'system', compactDensity: false, reducedMotion: false } },
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

describe('DataManagementTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(settingsPlatform.data, 'getCacheUsage').mockResolvedValue({ totalBytes: 0, categories: [] } as any);
    vi.spyOn(settingsPlatform.data, 'listLogs').mockResolvedValue([]);
  });

  it('renders data management heading', async () => {
    render(<DataManagementTab {...baseProps} />);
    expect(await screen.findByText('数据管理')).toBeTruthy();
  });
});
