/**
 *测试文件——测试 AppearanceTab 组件/模块的行为是否符合预期。
 */

import { useState } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppPreferences, AppearancePreferences } from '../../../lib/types';
import AppearanceTab from './AppearanceTab';
import type { SettingsEntryProps } from '../settingsTypes';

const platformMocks = vi.hoisted(() => ({
  saveAppearance: vi.fn(),
}));

vi.mock('../../../platform/settings', () => ({
  settingsPlatform: {
    preferences: {
      saveAppearance: platformMocks.saveAppearance,
    },
  },
}));

vi.mock('@tauri-apps/api', () => ({}));

const basePreferences: AppPreferences = {
  schemaVersion: 1,
  markdownOutputDir: null,
  localComputeMode: 'auto',
  appearance: { theme: 'system', compactDensity: false, reducedMotion: false },
  export: {
    format: 'markdown',
    includeScreenshots: true,
    includeSubtitles: true,
    includeSourceMetadata: true,
    includeDiagnosticLog: false,
  },
  logLevel: 'info',
};

function savedPreferences(appearance: AppearancePreferences): AppPreferences {
  return { ...basePreferences, appearance };
}

function deferred(): { promise: Promise<AppPreferences>; resolve: (value: AppPreferences) => void; reject: (reason?: unknown) => void } {
  let resolve!: (value: AppPreferences) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<AppPreferences>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

const baseProps: SettingsEntryProps = {
  section: 'appearance',
  profiles: { schemaVersion: 1, activeTranscriptionProfileId: null, activeSummaryProfileId: null, fallbackTranscriptionProfileId: null, migrationRequired: false, transcriptionProfiles: [], summaryProfiles: [] },
  localModels: [],
  preferences: basePreferences,
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

function Harness() {
  const [preferences, setPreferences] = useState(basePreferences);
  return <AppearanceTab {...baseProps} preferences={preferences} onPreferencesChanged={setPreferences} />;
}

// describe('AppearanceTab', () => {
describe('AppearanceTab', () => {
  beforeEach(() => platformMocks.saveAppearance.mockReset());

  // it('renders appearance heading, theme, density and motion co
  it('renders appearance heading, theme, density and motion controls without WeChat options', () => {
    render(<Harness />);
    expect(screen.getByRole('heading', { name: '外观' })).toBeTruthy();
    expect(screen.queryByText(/微信|回复气泡|关闭到托盘/)).toBeNull();
  });

  // it('applies a theme immediately without a save button', asyn
  it('applies a theme immediately without a save button', async () => {
    platformMocks.saveAppearance.mockResolvedValue(savedPreferences({
      theme: 'light', compactDensity: false, reducedMotion: false,
    }));
    render(<Harness />);

    const user = userEvent.setup();
    await user.click(screen.getByRole('tab', { name: '浅色' }));

    expect(screen.queryByRole('button', { name: '保存外观设置' })).toBeNull();
    await waitFor(() => expect(platformMocks.saveAppearance).toHaveBeenCalledWith({
      theme: 'light', compactDensity: false, reducedMotion: false,
    }));
  });

  // it('serializes rapid changes and rolls the latest failure ba
  it('serializes rapid changes and rolls the latest failure back to the last saved state', async () => {
    const first = deferred();
    const second = deferred();
    platformMocks.saveAppearance
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);
    const onPreferencesChanged = vi.fn();
    render(<AppearanceTab {...baseProps} onPreferencesChanged={onPreferencesChanged} />);

    const user = userEvent.setup();
    // First change — still in flight
    await user.click(screen.getByRole('switch', { name: '紧凑布局' }));
    // Second change — also in flight
    await user.click(screen.getByRole('switch', { name: '减少动画' }));

    // First succeeds with compactDensity: true, reducedMotion: false
    first.resolve(savedPreferences({ theme: 'system', compactDensity: true, reducedMotion: false }));
    // Second fails
    second.reject(new Error('network'));
    await waitFor(() => {
      const lastCall = onPreferencesChanged.mock.calls[onPreferencesChanged.mock.calls.length - 1][0];
      // Rollback to last confirmed: compactDensity true, reducedMotion false
      expect(lastCall.appearance.compactDensity).toBe(true);
      expect(lastCall.appearance.reducedMotion).toBe(false);
    });
  });
});
