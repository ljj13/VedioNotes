import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppPreferences } from '../../lib/types';
import SettingsWorkspace from '../SettingsWorkspace';

const bridge = vi.hoisted(() => ({
  getExportPreferences: vi.fn(), saveExportPreferences: vi.fn(), restoreExportPreferences: vi.fn(),
  getCacheUsage: vi.fn(), clearCache: vi.fn(),
  listLogs: vi.fn(), readLog: vi.fn(), setLogLevel: vi.fn(), clearLogs: vi.fn(), openLogDirectory: vi.fn(),
  saveAppearancePreferences: vi.fn(), getAboutSnapshot: vi.fn(),
  openAppDataDirectory: vi.fn(), openExportDirectory: vi.fn(), openDocumentation: vi.fn(),
  setTranscriptionPreferences: vi.fn(), getDiagnosticLogPath: vi.fn(),
}));
vi.mock('../../lib/bridge', () => bridge);
vi.mock('../ProfileManager', () => ({ default: () => <div /> }));
vi.mock('../LocalModelManager', () => ({ default: () => <div /> }));
vi.mock('../CudaRuntimeManager', () => ({ default: () => <div /> }));
vi.mock('../DownloadSettings', () => ({ default: () => <div aria-label="平台下载设置" /> }));
vi.mock('../OutputSettings', () => ({ default: () => <div aria-label="文件保存设置" /> }));
vi.mock('../SenseVoiceManager', () => ({ default: () => <div /> }));

const preferences: AppPreferences = {
  schemaVersion: 1,
  markdownOutputDir: null,
  localComputeMode: 'auto',
  transcriptionMode: 'online_profile',
  sensevoiceModel: 'int8',
  sensevoiceLanguages: ['zh'],
  appearance: { theme: 'system', compactDensity: false, reducedMotion: false },
  export: { format: 'markdown', includeScreenshots: true, includeSubtitles: true, includeSourceMetadata: true, includeDiagnosticLog: false },
  logLevel: 'info',
};

const baseProps = {
  section: 'data' as const,
  profiles: { schemaVersion: 1, activeTranscriptionProfileId: null, activeSummaryProfileId: null, fallbackTranscriptionProfileId: null, migrationRequired: false, transcriptionProfiles: [], summaryProfiles: [] },
  localModels: [], preferences, theme: 'dark' as const, sidebarCollapsed: false,
  onSelectSection: vi.fn(), onReturn: vi.fn(), onProfilesChanged: vi.fn(), onModelsChanged: vi.fn(),
  onPreferencesChanged: vi.fn(), onSenseVoiceStatusChanged: vi.fn(), onToggleTheme: vi.fn(), onToggleSidebar: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  bridge.getExportPreferences.mockResolvedValue(preferences.export);
  bridge.saveExportPreferences.mockResolvedValue({ ...preferences.export, format: 'html' });
  bridge.restoreExportPreferences.mockResolvedValue(preferences.export);
  bridge.getCacheUsage.mockResolvedValue({ totalBytes: 4096, categories: [{ category: 'temporary_media', bytes: 4096, fileCount: 2 }] });
  bridge.clearCache.mockResolvedValue({ category: 'temporary_media', removedBytes: 4096, removedFiles: 2, preservedPaths: [] });
  bridge.listLogs.mockResolvedValue([{ id: 'video-distiller.log', name: 'video-distiller.log', bytes: 128, modifiedAt: '2026-07-15T12:00:00Z' }]);
  bridge.readLog.mockResolvedValue({ id: 'video-distiller.log', content: '{"event":"app_started"}', truncated: false });
  bridge.setLogLevel.mockResolvedValue('error');
  bridge.clearLogs.mockResolvedValue(128);
  bridge.saveAppearancePreferences.mockResolvedValue({ ...preferences, appearance: { theme: 'light', compactDensity: true, reducedMotion: true } });
  bridge.getAboutSnapshot.mockResolvedValue({
    appVersion: '0.1.0-test', tauriVersion: '2.8.5', frontendVersion: 'React 19.1.1', rustVersion: 'rustc test',
    appDataDir: 'C:/AppData/video-distiller', exportDir: 'D:/Notes', logDir: 'C:/AppData/video-distiller/logs',
    components: [{ name: 'SenseVoice', version: 'int8', status: 'ready', license: 'MIT' }],
  });
});

describe('Task 11 settings parity', () => {
  it('saves export settings and performs confirmed enum-based cache cleanup', async () => {
    const user = userEvent.setup();
    render(<SettingsWorkspace {...baseProps} />);

    await user.click(await screen.findByRole('button', { name: '默认导出格式' }));
    await user.click(screen.getByRole('option', { name: /HTML/ }));
    await user.click(screen.getByRole('button', { name: '保存导出设置' }));
    expect(bridge.saveExportPreferences).toHaveBeenCalledWith(expect.objectContaining({ format: 'html' }));

    await user.click(screen.getByRole('tab', { name: '缓存管理' }));
    expect(await screen.findByText('4.0 KB')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: '清理临时媒体' }));
    await user.click(screen.getByRole('button', { name: '确认清理临时媒体' }));
    await waitFor(() => expect(bridge.clearCache).toHaveBeenCalledWith('temporary_media'));
  });

  it('changes log level, reads a bounded log and opens only the registered log directory action', async () => {
    const user = userEvent.setup();
    render(<SettingsWorkspace {...baseProps} />);
    await user.click(screen.getByRole('tab', { name: '日志管理' }));

    await user.click(await screen.findByRole('button', { name: '日志级别' }));
    await user.click(screen.getByRole('option', { name: /错误/ }));
    await waitFor(() => expect(bridge.setLogLevel).toHaveBeenCalledWith('error'));
    await user.click(screen.getByRole('button', { name: '查看日志 video-distiller.log' }));
    expect(await screen.findByText(/app_started/)).toBeTruthy();
    expect(bridge.readLog).toHaveBeenCalledWith('video-distiller.log', 65536);
    await user.click(screen.getByRole('button', { name: '打开日志目录' }));
    expect(bridge.openLogDirectory).toHaveBeenCalledTimes(1);
  });

  it('persists system/light/dark appearance options and renders backend about metadata', async () => {
    const user = userEvent.setup();
    const onPreferencesChanged = vi.fn();
    const { rerender } = render(<SettingsWorkspace {...baseProps} section="appearance" onPreferencesChanged={onPreferencesChanged} />);
    await user.click(screen.getByRole('button', { name: '颜色主题' }));
    await user.click(screen.getByRole('option', { name: /浅色/ }));
    await waitFor(() => expect(bridge.saveAppearancePreferences).toHaveBeenCalledWith({ theme: 'light', compactDensity: false, reducedMotion: false }));
    expect(screen.queryByRole('button', { name: '保存外观设置' })).toBeNull();
    expect(onPreferencesChanged).toHaveBeenCalled();

    rerender(<SettingsWorkspace {...baseProps} section="about" />);
    expect(await screen.findByText('0.1.0-test')).toBeTruthy();
    expect(screen.getByText('SenseVoice')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: '打开应用数据目录' }));
    expect(bridge.openAppDataDirectory).toHaveBeenCalledTimes(1);
  });
});
