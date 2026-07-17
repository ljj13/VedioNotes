import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { settingsPlatform } from '../../../platform/settings';
import AboutTab from './AboutTab';
import type { SettingsEntryProps } from '../settingsTypes';

vi.mock('@tauri-apps/api', () => ({}));

const baseProps: SettingsEntryProps = {
  section: 'about',
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

describe('AboutTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(settingsPlatform.about, 'getAboutSnapshot').mockResolvedValue({ appVersion: '0.0.1', tauriVersion: '2', frontendVersion: '19', rustVersion: '1.91', appDataDir: '', exportDir: '', logDir: '', components: [] } as any);
  });

  it('renders about heading and app name', async () => {
    render(<AboutTab {...baseProps} />);
    expect(await screen.findByText(/关于/)).toBeTruthy();
    expect(screen.getAllByText(/VedioNotes/).length).toBeGreaterThan(0);
  });
});
