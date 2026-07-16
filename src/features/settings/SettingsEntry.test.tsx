import { render, screen, act } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import SettingsEntry from './SettingsEntry';
import type { SettingsEntryProps } from './settingsTypes';

vi.mock('@tauri-apps/api', () => ({}));

vi.mock('../../components/SettingsWorkspace', () => ({
  default: (props: SettingsEntryProps) => <div data-testid="legacy-settings">{props.section}</div>,
}));

vi.mock('./CipherSettingsShell', () => ({
  default: function MockCipherShell(props: SettingsEntryProps) {
    return <div data-testid="cipher-settings" data-section={props.section} />;
  },
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

describe('SettingsEntry', () => {
  it('renders legacy SettingsWorkspace when env override is legacy', () => {
    render(<SettingsEntry {...baseProps} implementation="legacy" />);
    expect(screen.getByTestId('legacy-settings')).toBeTruthy();
  });

  it('renders CipherSettingsShell by default', async () => {
    await act(async () => {
      render(<SettingsEntry {...baseProps} implementation="cipher" section="ai" />);
    });
    expect(screen.getByTestId('cipher-settings')).toBeTruthy();
    expect(screen.getByTestId('cipher-settings').getAttribute('data-section')).toBe('ai');
  });
});
