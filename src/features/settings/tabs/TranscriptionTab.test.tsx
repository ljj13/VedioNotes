/**
 *测试文件——测试 TranscriptionTab 组件/模块的行为是否符合预期。
 */

import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
  saveTranscriptionProfile: vi.fn(),
  setActiveProfile: vi.fn(),
  onLocalModelDownloadProgress: vi.fn(),
  onCudaRuntimeDownloadProgress: vi.fn(),
  hasProfileCredential: vi.fn(),
  testProfile: vi.fn(),
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
  senseVoiceStatus: makeSenseVoiceStatus(),
  cudaStatus: makeCudaStatus(),
  runtimeStatusLoading: false,
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
    tokensReady: false,
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

// describe('TranscriptionTab', () => {
describe('TranscriptionTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    platformMocks.getSenseVoiceStatus.mockResolvedValue(makeSenseVoiceStatus());
    platformMocks.getCudaRuntimeStatus.mockResolvedValue(makeCudaStatus());
    platformMocks.listLocalModels.mockResolvedValue([]);
    platformMocks.onSenseVoiceDownloadProgress.mockResolvedValue(() => {});
    platformMocks.onLocalModelDownloadProgress.mockResolvedValue(() => {});
    platformMocks.onCudaRuntimeDownloadProgress.mockResolvedValue(() => {});
    platformMocks.downloadSenseVoice.mockResolvedValue(undefined);
    platformMocks.downloadLocalModel.mockResolvedValue(undefined);
    platformMocks.downloadCudaRuntime.mockResolvedValue(undefined);
    platformMocks.saveTranscriptionProfile.mockResolvedValue(baseProps.profiles);
    platformMocks.setActiveProfile.mockResolvedValue(baseProps.profiles);
    platformMocks.hasProfileCredential.mockResolvedValue(false);
    platformMocks.testProfile.mockResolvedValue({ success: true, message: '配置可用', latencyMs: 24 });
    platformMocks.setLocalComputeMode.mockResolvedValue({ schemaVersion: 1, markdownOutputDir: null, localComputeMode: 'auto', transcriptionMode: 'sensevoice_cpu', sensevoiceModel: 'int8', sensevoiceLanguages: ['zh'], appearance: { theme: 'system', compactDensity: false, reducedMotion: false } });
    prefMocks.saveTranscription.mockResolvedValue({ schemaVersion: 1, markdownOutputDir: null, localComputeMode: 'auto', transcriptionMode: 'sensevoice_cpu', sensevoiceModel: 'int8', sensevoiceLanguages: ['zh'] });
  });

  it('does not probe runtime status merely because the tab mounted', async () => {
    render(<TranscriptionTab {...baseProps} />);

    expect(await screen.findByRole('heading', { name: '语音转文字' })).toBeTruthy();
    expect(platformMocks.getSenseVoiceStatus).not.toHaveBeenCalled();
    expect(platformMocks.getCudaRuntimeStatus).not.toHaveBeenCalled();
    expect(platformMocks.listLocalModels).not.toHaveBeenCalled();
  });

  // it('renders three mode tabs: CPU, GPU, Online', async () =>
  it('renders the compact heading and three mode tabs', async () => {
    render(<TranscriptionTab {...baseProps} />);
    expect(await screen.findByRole('heading', { name: '语音转文字' })).toBeTruthy();
    expect(screen.getByText('根据使用场景选择本地 CPU、本地 GPU 或在线转写模式。')).toBeTruthy();
    expect(screen.getByRole('tab', { name: /CPU 模式/ })).toBeTruthy();
    expect(screen.getByRole('tab', { name: /GPU 模式/ })).toBeTruthy();
    expect(screen.getByRole('tab', { name: /在线模式/ })).toBeTruthy();
  });

  it('renders the CPU model configuration and language picker as two columns', async () => {
    const { container } = render(<TranscriptionTab {...baseProps} />);
    await screen.findByText('SenseVoice 本地模型');

    const layout = container.querySelector('.cipher-transcription-dual-layout');
    expect(layout).toBeTruthy();
    expect(layout?.querySelector('.cipher-transcription-left-panel')).toBeTruthy();
    const languagePanel = layout?.querySelector('.cipher-transcription-right-panel');
    expect(languagePanel).toBeTruthy();
    expect(within(languagePanel as HTMLElement).getByRole('heading', { name: '识别语言' })).toBeTruthy();
    expect(within(languagePanel as HTMLElement).getByText('Chinese')).toBeTruthy();
    expect(within(languagePanel as HTMLElement).getByText('Cantonese')).toBeTruthy();
  });

  it('exposes dedicated alignment hooks for the CPU model status chip and alert', async () => {
    const { container } = render(<TranscriptionTab {...baseProps} />);
    await screen.findByText('SenseVoice 本地模型');

    const statusChip = container.querySelector('.cipher-model-status-chip');
    expect(statusChip).toBeTruthy();
    expect(statusChip?.querySelector('.cipher-model-status-chip-icon')).toBeTruthy();
    expect(statusChip?.querySelector('.cipher-model-status-chip-label')?.textContent).toBe('未下载');

    const statusAlert = container.querySelector('.cipher-model-status-alert');
    expect(statusAlert).toBeTruthy();
    expect(statusAlert?.querySelector('.cipher-model-status-alert-indicator')).toBeTruthy();
    expect(statusAlert?.querySelector('.cipher-model-status-alert-content')).toBeTruthy();
    expect(statusAlert?.querySelector('.cipher-model-status-alert-title')).toBeTruthy();
  });

  it('downloads the model selected in the shared model card', async () => {
    const user = userEvent.setup();
    render(<TranscriptionTab {...baseProps} />);

    await user.click(await screen.findByRole('radio', { name: /float32 完整版/ }));
    await user.click(screen.getByRole('button', { name: /下载模型/ }));

    expect(platformMocks.downloadSenseVoice).toHaveBeenCalledWith('float32');
  });

  // it('CPU tab shows SenseVoice model status and language selec
  it('CPU tab shows SenseVoice model status and language selection', async () => {
    render(<TranscriptionTab {...baseProps} />);
    expect(await screen.findByRole('radio', { name: /int8 量化版/ })).toBeTruthy();
    expect(screen.getByRole('checkbox', { name: /中文/ })).toBeTruthy();
  });

  // it('renders language checkboxes for all five languages', asy
  it('renders language checkboxes for all five languages', async () => {
    render(<TranscriptionTab {...baseProps} />);
    await screen.findByRole('radio', { name: /int8 量化版/ });
    expect(screen.getByRole('checkbox', { name: /英语/ })).toBeTruthy();
    expect(screen.getByRole('checkbox', { name: /日语/ })).toBeTruthy();
    expect(screen.getByRole('checkbox', { name: /韩语/ })).toBeTruthy();
    expect(screen.getByRole('checkbox', { name: /粤语/ })).toBeTruthy();
    expect(screen.getByRole('checkbox', { name: /中文/ })).toBeTruthy();
  });

  // it('GPU tab shows CUDA runtime status', async () => {
  it('GPU tab shows CUDA runtime status', async () => {
    const gpuProps = { ...baseProps, preferences: { ...baseProps.preferences, transcriptionMode: 'whisper_local' as const } };
    render(<TranscriptionTab {...gpuProps} />);
    expect(await screen.findByText('GPU 组件')).toBeTruthy();
    expect(screen.getByText('GPU 检测')).toBeTruthy();
  });

  it('exposes dedicated alignment hooks for the GPU model status chip and alert', async () => {
    const gpuProps = { ...baseProps, preferences: { ...baseProps.preferences, transcriptionMode: 'whisper_local' as const } };
    const { container } = render(<TranscriptionTab {...gpuProps} />);
    await screen.findByText('Whisper GPU 模型');

    const statusChip = container.querySelector('.cipher-gpu-model-status-chip');
    expect(statusChip).toBeTruthy();
    expect(statusChip?.querySelector('.cipher-gpu-model-status-chip-icon')).toBeTruthy();
    expect(statusChip?.querySelector('.cipher-gpu-model-status-chip-label')?.textContent).toBe('未下载');

    const statusAlert = container.querySelector('.cipher-gpu-model-status-alert');
    expect(statusAlert).toBeTruthy();
    expect(statusAlert?.querySelector('.cipher-gpu-model-status-alert-indicator')).toBeTruthy();
    expect(statusAlert?.querySelector('.cipher-gpu-model-status-alert-content')).toBeTruthy();
    expect(statusAlert?.querySelector('.cipher-gpu-model-status-alert-title')?.textContent).toBe('模型未下载');
  });

  it('starts the selected Whisper GPU model download and exposes event progress immediately', async () => {
    const user = userEvent.setup();
    const pending: {
      emitProgress?: (progress: { modelId: string; downloadedBytes: number; totalBytes: number }) => void;
      resolveDownload?: () => void;
    } = {};
    platformMocks.listLocalModels.mockResolvedValue([
      { id: 'tiny', state: 'not_downloaded', downloadedBytes: 0, totalBytes: 75_000_000, isCurrent: false },
    ]);
    platformMocks.onLocalModelDownloadProgress.mockImplementation(async (
      listener: (progress: { modelId: string; downloadedBytes: number; totalBytes: number }) => void,
    ) => {
      pending.emitProgress = listener;
      return () => {};
    });
    platformMocks.downloadLocalModel.mockImplementation(() => new Promise<void>((resolve) => {
      pending.resolveDownload = resolve;
    }));
    const gpuProps = { ...baseProps, preferences: { ...baseProps.preferences, transcriptionMode: 'whisper_local' as const } };
    render(<TranscriptionTab {...gpuProps} />);

    await user.click(await screen.findByRole('radio', { name: /Tiny 模型/ }));
    await user.click(screen.getByRole('button', { name: /下载模型/ }));

    expect(platformMocks.downloadLocalModel).toHaveBeenCalledWith('tiny');
    expect(await screen.findByText('Tiny 模型正在下载')).toBeTruthy();
    expect(screen.getByText('0%')).toBeTruthy();

    pending.emitProgress?.({ modelId: 'tiny', downloadedBytes: 30_000_000, totalBytes: 75_000_000 });
    expect(await screen.findByText('40%')).toBeTruthy();

    pending.resolveDownload?.();
  });

  it('persists and activates a ready Whisper model selected in GPU mode', async () => {
    const user = userEvent.setup();
    const localProfile = {
      id: 'local-whisper-cpp',
      name: '本地 Whisper',
      provider: 'local_whisper_cpp' as const,
      baseUrl: '',
      model: 'small',
      enabled: true,
      builtIn: true,
    };
    const readyModels = [
      { id: 'small', state: 'ready' as const, downloadedBytes: 488_000_000, totalBytes: 488_000_000, isCurrent: true },
      { id: 'large-v3-turbo-q8', state: 'ready' as const, downloadedBytes: 835_000_000, totalBytes: 835_000_000, isCurrent: false },
    ];
    platformMocks.listLocalModels.mockResolvedValue(readyModels);
    const onProfilesChanged = vi.fn();
    const gpuProps = {
      ...baseProps,
      profiles: { ...baseProps.profiles, activeTranscriptionProfileId: localProfile.id, transcriptionProfiles: [localProfile] },
      localModels: readyModels,
      preferences: { ...baseProps.preferences, transcriptionMode: 'whisper_local' as const },
      onProfilesChanged,
    };

    render(<TranscriptionTab {...gpuProps} />);
    await user.click(await screen.findByRole('radio', { name: /Turbo-Q8 量化/ }));

    await waitFor(() => expect(platformMocks.saveTranscriptionProfile).toHaveBeenCalledWith({
      ...localProfile,
      model: 'large-v3-turbo-q8',
    }));
    await waitFor(() => {
      expect(platformMocks.setActiveProfile).toHaveBeenCalledWith('transcription', localProfile.id);
      expect(onProfilesChanged).toHaveBeenCalledTimes(1);
    });
  });

  it('uses the detected GPU name for GPU availability and CUDA readiness', async () => {
    const detectedCudaStatus = makeCudaStatus({
      state: 'ready',
      version: '12.8',
      gpuName: 'NVIDIA GeForce RTX 4060 Laptop GPU',
    });
    const gpuProps = { ...baseProps, cudaStatus: detectedCudaStatus, preferences: { ...baseProps.preferences, transcriptionMode: 'whisper_local' as const } };
    const { container } = render(<TranscriptionTab {...gpuProps} />);
    await screen.findByText('GPU 组件');

    const detectionChip = container.querySelector('.cipher-gpu-detection-status-chip');
    expect(detectionChip).toBeTruthy();
    expect(detectionChip?.querySelector('.cipher-gpu-detection-status-chip-icon')).toBeTruthy();
    expect(detectionChip?.querySelector('.cipher-gpu-detection-status-chip-label')?.textContent).toBe('可用');
    expect(within(container.querySelector('.cipher-gpu-overview-card') as HTMLElement)
      .getByText('NVIDIA GeForce RTX 4060 Laptop GPU')).toBeTruthy();

    const cudaChip = container.querySelector('.cipher-cuda-status-chip');
    expect(cudaChip).toBeTruthy();
    expect(cudaChip?.querySelector('.cipher-cuda-status-chip-icon')).toBeTruthy();
    expect(cudaChip?.querySelector('.cipher-cuda-status-chip-label')?.textContent).toBe('已就绪');
  });

  it('groups GPU detection and CPU availability in one compact card', async () => {
    const gpuProps = { ...baseProps, preferences: { ...baseProps.preferences, transcriptionMode: 'whisper_local' as const } };
    const { container } = render(<TranscriptionTab {...gpuProps} />);
    await screen.findByText('GPU 检测');

    const overviewCard = container.querySelector('.cipher-gpu-overview-card');
    expect(overviewCard).toBeTruthy();
    expect(within(overviewCard as HTMLElement).getByText('GPU 检测')).toBeTruthy();
    expect(within(overviewCard as HTMLElement).getByText('当前机器的 GPU 可用性。')).toBeTruthy();
    expect(within(overviewCard as HTMLElement).getByText('CPU')).toBeTruthy();
    expect(within(overviewCard as HTMLElement).getByText('尚未下载可用于 CPU 转写的 Whisper 模型')).toBeTruthy();
  });

  it('places GPU acceleration below the styled GPU component card', async () => {
    const gpuProps = { ...baseProps, cudaStatus: makeCudaStatus({ state: 'not_installed' }), preferences: { ...baseProps.preferences, transcriptionMode: 'whisper_local' as const } };
    const { container } = render(<TranscriptionTab {...gpuProps} />);
    await screen.findByText('GPU 组件');

    const sidebar = container.querySelector('.cipher-gpu-sidebar');
    const cudaCard = sidebar?.querySelector('.cipher-cuda-card');
    const accelerationCard = sidebar?.querySelector('.cipher-gpu-acceleration-card');
    expect(sidebar).toBeTruthy();
    expect(cudaCard).toBeTruthy();
    expect(accelerationCard).toBeTruthy();
    expect(cudaCard?.nextElementSibling).toBe(accelerationCard);

    const requirementAlert = cudaCard?.querySelector('.cipher-cuda-requirement-alert');
    expect(requirementAlert).toBeTruthy();
    expect(within(requirementAlert as HTMLElement).getByText('需要下载 GPU 组件')).toBeTruthy();
    expect(within(cudaCard as HTMLElement).getByRole('button', { name: /下载 GPU 组件/ })).toBeTruthy();
  });

  it('shows CUDA download progress while the command is still running', async () => {
    const user = userEvent.setup();
    const pending: {
      emitProgress?: (progress: { downloadedBytes: number; totalBytes: number }) => void;
      resolveDownload?: () => void;
    } = {};
    platformMocks.onCudaRuntimeDownloadProgress.mockImplementation(async (
      listener: (progress: { downloadedBytes: number; totalBytes: number }) => void,
    ) => {
      pending.emitProgress = listener;
      return () => {};
    });
    platformMocks.downloadCudaRuntime.mockImplementation(() => new Promise<void>((resolve) => {
      pending.resolveDownload = resolve;
    }));
    const gpuProps = { ...baseProps, cudaStatus: makeCudaStatus({ state: 'not_installed' }), preferences: { ...baseProps.preferences, transcriptionMode: 'whisper_local' as const } };
    render(<TranscriptionTab {...gpuProps} />);

    const downloadButton = await screen.findByRole('button', { name: /下载 GPU 组件/ });
    await user.click(downloadButton);

    expect(platformMocks.downloadCudaRuntime).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('下载进度')).toBeTruthy();
    expect(screen.getByText('0%')).toBeTruthy();
    expect((downloadButton as HTMLButtonElement).disabled).toBe(true);

    pending.emitProgress?.({ downloadedBytes: 258_000_000, totalBytes: 645_000_000 });
    expect(await screen.findByText('40%')).toBeTruthy();

    pending.resolveDownload?.();
  });

  it('renders the ready CUDA delete action in the card footer with its danger hook', async () => {
    const gpuProps = { ...baseProps, cudaStatus: makeCudaStatus({ state: 'ready', version: '12.8' }), preferences: { ...baseProps.preferences, transcriptionMode: 'whisper_local' as const } };
    const { container } = render(<TranscriptionTab {...gpuProps} />);
    await screen.findByText('GPU 组件');

    const cudaCard = container.querySelector('.cipher-cuda-card');
    const footer = cudaCard?.querySelector('.cipher-cuda-actions');
    const deleteButton = within(footer as HTMLElement).getByRole('button', { name: /删除/ });
    expect(footer).toBeTruthy();
    expect(deleteButton.classList.contains('cipher-cuda-delete-button')).toBe(true);
    expect(within(cudaCard as HTMLElement).queryByRole('button', { name: /下载 GPU 组件/ })).toBeNull();
  });

  // it('shows compute mode buttons', async () => {
  it('persists the GPU acceleration switch through local compute mode', async () => {
    const user = userEvent.setup();
    platformMocks.setLocalComputeMode.mockImplementation(async (mode: 'auto' | 'cpu') => ({
      ...baseProps.preferences,
      localComputeMode: mode,
    }));
    const gpuProps = { ...baseProps, preferences: { ...baseProps.preferences, transcriptionMode: 'whisper_local' as const } };
    render(<TranscriptionTab {...gpuProps} />);

    expect(await screen.findByText('GPU 加速')).toBeTruthy();
    expect(screen.getByText('启用 Whisper GPU 加速')).toBeTruthy();

    const gpuSwitch = screen.getByRole('switch', { name: '启用 Whisper GPU 加速' });
    expect((gpuSwitch as HTMLInputElement).checked).toBe(true);

    await user.click(gpuSwitch);
    expect(platformMocks.setLocalComputeMode).toHaveBeenLastCalledWith('cpu');
    expect((gpuSwitch as HTMLInputElement).checked).toBe(false);

    await user.click(gpuSwitch);
    expect(platformMocks.setLocalComputeMode).toHaveBeenLastCalledWith('auto');
    expect((gpuSwitch as HTMLInputElement).checked).toBe(true);
    expect(baseProps.onPreferencesChanged).toHaveBeenCalledTimes(2);
  });

  it('keeps the persisted GPU mode and reports an error when saving fails', async () => {
    const user = userEvent.setup();
    platformMocks.setLocalComputeMode.mockRejectedValueOnce(new Error('write failed'));
    const gpuProps = { ...baseProps, preferences: { ...baseProps.preferences, transcriptionMode: 'whisper_local' as const } };
    render(<TranscriptionTab {...gpuProps} />);

    const gpuSwitch = await screen.findByRole('switch', { name: '启用 Whisper GPU 加速' });
    await user.click(gpuSwitch);

    expect(platformMocks.setLocalComputeMode).toHaveBeenCalledWith('cpu');
    expect((gpuSwitch as HTMLInputElement).checked).toBe(true);
    expect(screen.getByText('切换计算模式失败: write failed')).toBeTruthy();
    expect(baseProps.onPreferencesChanged).not.toHaveBeenCalled();
  });

  it('renders a real online provider form and excludes every local transcription profile', async () => {
    const onlineProps = makeOnlineProps();
    render(<TranscriptionTab {...onlineProps} />);

    expect(await screen.findByRole('heading', { name: '在线语音转写' })).toBeTruthy();
    expect(screen.getByLabelText('在线转写提供商')).toBeTruthy();
    expect(screen.getByLabelText('接口 URL')).toBeTruthy();
    expect(screen.getByLabelText('模型名称')).toBeTruthy();
    expect(screen.getByRole('heading', { name: '使用提醒' })).toBeTruthy();
    expect(screen.getByText('注意隐私与费用')).toBeTruthy();
    expect(screen.queryByText('本地 Whisper（whisper.cpp）')).toBeNull();
    expect(screen.queryByText('SenseVoice 本地模型')).toBeNull();
  });

  it('restores the URL and model draft that belongs to each online provider', async () => {
    const user = userEvent.setup();
    render(<TranscriptionTab {...makeOnlineProps()} />);

    const urlInput = await screen.findByLabelText('接口 URL') as HTMLInputElement;
    const modelInput = screen.getByLabelText('模型名称') as HTMLInputElement;
    await user.clear(urlInput);
    await user.type(urlInput, 'https://tencent-draft.example.test');

    await chooseOnlineProvider(user, 'MiMo ASR');
    expect(urlInput.value).toBe('https://api.xiaomimimo.com');
    expect(modelInput.value).toBe('mimo-v2.5-asr');

    await chooseOnlineProvider(user, '腾讯云极速版');
    expect(urlInput.value).toBe('https://tencent-draft.example.test');
    expect(modelInput.value).toBe('16k_zh');
  });

  it('masks a bearer draft, saves it to the existing credential command, and tests the saved profile', async () => {
    const user = userEvent.setup();
    const onlineProps = makeOnlineProps();
    render(<TranscriptionTab {...onlineProps} />);

    await chooseOnlineProvider(user, '自定义 OpenAI 兼容转写');
    const apiKey = screen.getByLabelText('在线转写 API Key') as HTMLInputElement;
    expect(apiKey.type).toBe('password');
    await user.type(apiKey, 'sk-test-online-draft');
    await user.click(screen.getByRole('button', { name: '显示在线转写 API Key' }));
    expect(apiKey.type).toBe('text');

    await user.click(screen.getByRole('button', { name: '测试在线配置' }));
    await waitFor(() => expect(platformMocks.saveTranscriptionProfile).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'custom-openai-asr',
        provider: 'open_ai_compatible',
        baseUrl: 'https://api.openai.com',
        model: 'whisper-1',
        onlineOptions: { language: 'auto', timeoutMs: 60_000, maxConcurrency: 2 },
      }),
      { type: 'bearer', apiKey: 'sk-test-online-draft' },
    ));
    await waitFor(() => expect(platformMocks.setActiveProfile).toHaveBeenCalledWith('transcription', 'custom-openai-asr'));
    await waitFor(() => expect(platformMocks.testProfile).toHaveBeenCalledWith('transcription', 'custom-openai-asr'));
    expect(await screen.findByText('配置可用')).toBeTruthy();
  });

  it('edits language, timeout, and concurrency inside their safe bounds', async () => {
    const user = userEvent.setup();
    render(<TranscriptionTab {...makeOnlineProps('mimo-asr')} />);

    expect(await screen.findByLabelText('识别语言')).toBeTruthy();
    const timeout = screen.getByLabelText('超时时间（毫秒）') as HTMLInputElement;
    const concurrency = screen.getByLabelText('批量并发数') as HTMLInputElement;
    expect(timeout.value.replace(/,/g, '')).toBe('60000');
    expect(concurrency.value).toBe('2');

    await user.clear(timeout);
    await user.type(timeout, '1000');
    await user.tab();
    expect(Number(timeout.value.replace(/,/g, ''))).toBeGreaterThanOrEqual(5000);

    await user.clear(concurrency);
    await user.type(concurrency, '99');
    await user.tab();
    expect(Number(concurrency.value)).toBeLessThanOrEqual(10);
  });
});

function makeOnlineProps(activeProfileId = 'tencent-flash'): SettingsEntryProps {
  return {
    ...baseProps,
    preferences: { ...baseProps.preferences, transcriptionMode: 'online_profile' },
    profiles: {
      ...baseProps.profiles,
      activeTranscriptionProfileId: activeProfileId,
      transcriptionProfiles: [
        { id: 'tencent-flash', name: '腾讯云极速版', provider: 'tencent_flash', baseUrl: 'https://asr.cloud.tencent.com', model: '16k_zh', enabled: true, builtIn: true },
        { id: 'mimo-asr', name: 'MiMo ASR', provider: 'mimo_asr', baseUrl: 'https://api.xiaomimimo.com', model: 'mimo-v2.5-asr', enabled: true, builtIn: true },
        { id: 'custom-openai-asr', name: '自定义 OpenAI 兼容转写', provider: 'open_ai_compatible', baseUrl: 'https://api.openai.com', model: 'whisper-1', enabled: true, builtIn: true },
        { id: 'local-whisper-cpp', name: '本地 Whisper（whisper.cpp）', provider: 'local_whisper_cpp', baseUrl: '', model: 'large-v3-turbo-q8', enabled: true, builtIn: true },
      ],
    },
  };
}

async function chooseOnlineProvider(user: ReturnType<typeof userEvent.setup>, name: string) {
  const trigger = document.querySelector('.cipher-online-stt-provider-trigger') as HTMLElement;
  expect(trigger).toBeTruthy();
  await user.click(trigger);
  await user.click(await screen.findByRole('option', { name: new RegExp(name) }));
}
