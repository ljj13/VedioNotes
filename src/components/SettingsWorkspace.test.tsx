import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppProfiles, LocalModelStatus } from '../lib/types';
import SettingsWorkspace from './SettingsWorkspace';

vi.mock('./ProfileManager', () => ({
  default: ({ defaultTab }: { defaultTab?: 'transcription' | 'summary' }) => (
    <div aria-label={`${defaultTab} profile manager`}>{defaultTab} profiles</div>
  ),
}));
vi.mock('./LocalModelManager', () => ({
  default: ({ models }: { models?: LocalModelStatus[] }) => <div aria-label="本地模型管理">{models?.length ?? 0} models</div>,
}));
vi.mock('./CudaRuntimeManager', () => ({ default: () => <div aria-label="CUDA 加速组件管理">cuda runtime</div> }));
vi.mock('./DownloadSettings', () => ({ default: () => <div aria-label="平台下载设置">download settings</div> }));
vi.mock('./OutputSettings', () => ({ default: () => <div aria-label="文件保存设置">output settings</div> }));

const profiles: AppProfiles = {
  schemaVersion: 1,
  activeTranscriptionProfileId: 'local-whisper-cpp',
  activeSummaryProfileId: 'deepseek',
  fallbackTranscriptionProfileId: null,
  migrationRequired: false,
  transcriptionProfiles: [
    { id: 'local-whisper-cpp', name: '本地 Whisper', provider: 'local_whisper_cpp', baseUrl: '', model: 'small', enabled: true, builtIn: true },
    { id: 'online-asr', name: '在线转写', provider: 'open_ai_compatible', baseUrl: 'https://example.test', model: 'whisper-1', enabled: true, builtIn: false },
  ],
  summaryProfiles: [
    { id: 'deepseek', name: 'DeepSeek', provider: 'deep_seek', baseUrl: 'https://example.test', model: 'deepseek-chat', enabled: true, builtIn: true },
  ],
};

const models: LocalModelStatus[] = ['tiny', 'base', 'small', 'medium', 'large-v3-turbo'].map((id) => ({
  id,
  state: id === 'small' ? 'ready' : 'not_downloaded',
  downloadedBytes: id === 'small' ? 1 : 0,
  totalBytes: 1,
  isCurrent: id === 'small',
}));

const baseProps = {
  section: 'transcription' as const,
  profiles,
  localModels: models,
  preferences: {
    schemaVersion: 1,
    markdownOutputDir: null,
    localComputeMode: 'auto' as const,
    transcriptionMode: 'sensevoice_cpu' as const,
    sensevoiceModel: 'int8' as const,
    sensevoiceLanguages: ['zh' as const],
  },
  theme: 'dark' as const,
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

beforeEach(() => vi.clearAllMocks());

describe('SettingsWorkspace', () => {
  it('is an integrated workspace with five stable settings destinations', () => {
    render(<SettingsWorkspace {...baseProps} />);

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('region', { name: '设置工作区' })).toBeTruthy();
    for (const label of ['外观', '语音转文字', 'AI 接入', '数据管理', '关于']) {
      expect(screen.getByRole('tab', { name: label })).toBeTruthy();
    }
  });

  it('offers CPU, GPU, and Online transcription modes without mislabeling SenseVoice', () => {
    render(<SettingsWorkspace {...baseProps} />);

    for (const mode of ['CPU 模式', 'GPU 模式', '在线模式']) expect(screen.getByRole('tab', { name: mode })).toBeTruthy();
    expect(screen.getByText('SenseVoice 本地模型')).toBeTruthy();
    expect(screen.getByText('正在检查组件状态…')).toBeTruthy();
  });

  it('keeps all five Whisper models and CUDA inside GPU mode', () => {
    render(<SettingsWorkspace {...baseProps} />);
    fireEvent.click(screen.getByRole('tab', { name: 'GPU 模式' }));
    expect(screen.getByLabelText('本地模型管理').textContent).toContain('5 models');
    expect(screen.getByLabelText('CUDA 加速组件管理')).toBeTruthy();
  });

  it('keeps operational online profiles and large models connected to existing managers', () => {
    const { rerender } = render(<SettingsWorkspace {...baseProps} />);
    fireEvent.click(screen.getByRole('tab', { name: '在线模式' }));
    expect(screen.getByLabelText('transcription profile manager')).toBeTruthy();

    rerender(<SettingsWorkspace {...baseProps} section="ai" />);
    expect(screen.getByRole('tab', { name: '大模型' })).toBeTruthy();
    expect(screen.getByLabelText('summary profile manager')).toBeTruthy();
  });

  it('connects appearance selection and sidebar controls to the live shell state', () => {
    const onToggleSidebar = vi.fn();
    const onPreferencesChanged = vi.fn();
    render(<SettingsWorkspace {...baseProps} section="appearance" onToggleSidebar={onToggleSidebar} onPreferencesChanged={onPreferencesChanged} />);

    fireEvent.click(screen.getByRole('button', { name: '颜色主题' }));
    fireEvent.click(screen.getByRole('option', { name: /浅色/ }));
    expect(onPreferencesChanged).toHaveBeenCalledWith(expect.objectContaining({ appearance: expect.objectContaining({ theme: 'light' }) }));
    expect(screen.queryByRole('button', { name: '保存外观设置' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '折叠侧边栏' }));
    expect(onToggleSidebar).toHaveBeenCalledTimes(1);
  });
});
