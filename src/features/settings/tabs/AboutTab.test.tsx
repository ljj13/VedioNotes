/**
 *测试文件——测试 AboutTab 组件/模块的行为是否符合预期。
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { settingsPlatform } from '../../../platform/settings';
import AboutTab from './AboutTab';
import type { SettingsEntryProps } from '../settingsTypes';

vi.mock('@tauri-apps/api', () => ({}));

const longStatus = 'not_installed_because_runtime_component_signature_is_missing';
const longPath = String.raw`\\server-name-that-is-intentionally-very-long\VedioNotes\structured-redacted-logs\2026\07\24\session_identifier_without_breakpoints_915bf7d76e1e28b87c9477d4fef51d0b`;

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

// describe('AboutTab', () => {
describe('AboutTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(settingsPlatform.about, 'getAboutSnapshot').mockResolvedValue({
      appVersion: '0.0.1-preview.20260724.super-long-prerelease-channel-windows.x86_64.webview2',
      tauriVersion: '2.11.5+wry.0.55.1.webview2-custom-protocol',
      frontendVersion: '19.1.0+typescript.5.x.vite.7',
      rustVersion: '1.91 stable windows-msvc',
      appDataDir: longPath,
      exportDir: String.raw`D:\VedioNotes\MarkdownOutputs\one_single_uninterrupted_export_folder_name`,
      logDir: longPath,
      components: [{
        name: 'whisper_cpp_cuda_runtime_gpu_transcription_sidecar_and_local_model_component',
        version: 'whisper.cpp-b6414-cuda-12.8-sm_75-sm_86-windows-x86_64.release-portable.sidecar',
        status: longStatus,
        license: 'MIT-AND-NVIDIA-CUDA-Toolkit-EULA-component-runtime-distribution-metadata',
      }],
    } as any);
  });

  // it('renders about heading and app name', async () => {
  it('renders the app identity and runtime section', async () => {
    render(<AboutTab {...baseProps} />);
    expect(await screen.findByRole('heading', { name: 'VedioNotes' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: '运行组件' })).toBeTruthy();
  });

  it('renders long component metadata and all snapshot directories inside safe cards', async () => {
    const { container } = render(<AboutTab {...baseProps} />);
    expect(await screen.findByText(longStatus)).toBeTruthy();
    expect(screen.getAllByText(longPath)).toHaveLength(2);
    expect(container.querySelector('.cipher-about-component-card')).toBeTruthy();
    expect(container.querySelectorAll('.cipher-about-directory-card')).toHaveLength(3);
    expect(container.querySelector('.cipher-about-version-card')).toBeTruthy();
    expect(container.querySelector('.cipher-about-source-card')).toBeTruthy();
  });

  it('keeps the existing documentation and directory actions connected', async () => {
    const user = userEvent.setup();
    const openDocumentation = vi.spyOn(settingsPlatform.about, 'openDocumentation').mockResolvedValue(undefined as never);
    const openAppDataDirectory = vi.spyOn(settingsPlatform.about, 'openAppDataDirectory').mockResolvedValue(undefined as never);
    const openExportDirectory = vi.spyOn(settingsPlatform.about, 'openExportDirectory').mockResolvedValue(undefined as never);
    const openLogDirectory = vi.spyOn(settingsPlatform.about, 'openLogDirectory').mockResolvedValue(undefined as never);

    render(<AboutTab {...baseProps} />);
    await user.click(await screen.findByRole('button', { name: '项目文档' }));
    const directoryButtons = screen.getAllByRole('button', { name: '打开目录' });
    for (const button of directoryButtons) await user.click(button);

    expect(openDocumentation).toHaveBeenCalledTimes(1);
    expect(openAppDataDirectory).toHaveBeenCalledTimes(1);
    expect(openExportDirectory).toHaveBeenCalledTimes(1);
    expect(openLogDirectory).toHaveBeenCalledTimes(1);
  });
});
