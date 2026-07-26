/**
 *测试文件——测试 App.local-whisper 组件/模块的行为是否符合预期。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';

const bridge = vi.hoisted(() => ({
  getProfiles: vi.fn(), listLocalModels: vi.fn(), hasProfileCredential: vi.fn(), getMigrationState: vi.fn(),
  getHistory: vi.fn(), listHistory: vi.fn(), searchHistory: vi.fn(),
  getPreferences: vi.fn(), getSenseVoiceStatus: vi.fn(),
  invokeStartDistillation: vi.fn(), cancelDistillation: vi.fn(),
  onTaskProgress: vi.fn(), onTaskComplete: vi.fn(), onTaskError: vi.fn(), onProviderFallback: vi.fn(),
}));
vi.mock('./lib/bridge', () => bridge);
vi.mock('@tauri-apps/api/core', () => ({ convertFileSrc: (path: string) => path }));
vi.mock('@tauri-apps/plugin-dialog', () => ({ open: vi.fn() }));
vi.mock('@tauri-apps/api/webview', () => ({ getCurrentWebview: () => ({ onDragDropEvent: vi.fn().mockResolvedValue(() => {}) }) }));

// describe('stale active local profile', () => {
describe('stale active local profile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    bridge.getMigrationState.mockResolvedValue(false);
    bridge.getHistory.mockResolvedValue(null);
    bridge.listHistory.mockResolvedValue([]);
    bridge.searchHistory.mockResolvedValue([]);
    bridge.hasProfileCredential.mockResolvedValue(true);
    bridge.getPreferences.mockResolvedValue({ schemaVersion: 1, markdownOutputDir: null, localComputeMode: 'auto' });
    bridge.getSenseVoiceStatus.mockResolvedValue(null);
    bridge.getProfiles.mockResolvedValue({
      schemaVersion: 1, activeTranscriptionProfileId: 'local-whisper-cpp', activeSummaryProfileId: 'summary', fallbackTranscriptionProfileId: null, migrationRequired: false,
      transcriptionProfiles: [
        { id: 'local-whisper-cpp', name: '本地 Whisper', provider: 'local_whisper_cpp', baseUrl: '', model: 'tiny', enabled: true, builtIn: true },
        { id: 'online', name: '在线转写', provider: 'mimo_asr', baseUrl: 'https://example.com', model: 'asr', enabled: true, builtIn: true },
      ],
      summaryProfiles: [{ id: 'summary', name: '总结', provider: 'mimo', baseUrl: 'https://example.com', model: 'summary', enabled: true, builtIn: true }],
    });
    bridge.listLocalModels.mockResolvedValue([{ id: 'tiny', state: 'not_downloaded', downloadedBytes: 0, totalBytes: 1, isCurrent: true }]);
  });

  // it('preserves a stale local active id, shows recovery, disab
  it('preserves a stale local active id, shows recovery, disables Start, and does not select online', async () => {
    render(<App />);
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('视频链接'), 'https://v.douyin.com/example');
    await waitFor(() => expect(screen.getByText('请先下载并选择本地 Whisper 模型。')).toBeTruthy());
    expect((screen.getByRole('button', { name: '开始提炼' }) as HTMLButtonElement).disabled).toBe(true);
    const stalePicker = screen.getByRole('button', { name: '转写服务' });
    expect(stalePicker.textContent).toContain('请选择可用配置');
    expect(stalePicker.textContent).not.toContain('在线转写');
    expect(bridge.getProfiles).toHaveBeenCalled();
  });

  // it('enables Start for the active local profile when its sele
  it('enables Start for the active local profile when its selected model is ready without selecting online', async () => {
    bridge.listLocalModels.mockResolvedValue([{ id: 'tiny', state: 'ready', downloadedBytes: 1, totalBytes: 1, isCurrent: true }]);
    render(<App />);
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('视频链接'), 'https://v.douyin.com/example');
    await waitFor(() => expect((screen.getByRole('button', { name: '开始提炼' }) as HTMLButtonElement).disabled).toBe(false));
    const readyPicker = screen.getByRole('button', { name: '转写服务' });
    expect(readyPicker.textContent).toContain('本地 Whisper');
    expect(readyPicker.textContent).not.toContain('在线转写');
    expect(screen.queryByText('请先下载并选择本地 Whisper 模型。')).toBeNull();
  });
});
