import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SenseVoiceManager from './SenseVoiceManager';

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  progress: vi.fn(),
  unlisten: vi.fn(),
}));

vi.mock('@tauri-apps/api/core', () => ({ invoke: mocks.invoke }));
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn((_event: string, callback: (event: { payload: unknown }) => void) => {
    mocks.progress.mockImplementation(callback);
    return Promise.resolve(mocks.unlisten);
  }),
}));

const missingStatus = {
  state: 'missing',
  selectedModel: 'int8',
  runtimeReady: false,
  tokensReady: false,
  modelPath: null,
  downloadedBytes: 0,
  totalBytes: 239_233_841,
  models: [
    { id: 'int8', state: 'missing', downloadedBytes: 0, totalBytes: 239_233_841, isSelected: true },
    { id: 'float32', state: 'missing', downloadedBytes: 0, totalBytes: 937_617_178, isSelected: false },
  ],
} as const;

describe('SenseVoiceManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.invoke.mockImplementation((command: string) => {
      if (command === 'get_sensevoice_status') return Promise.resolve(missingStatus);
      if (command === 'download_sensevoice') return Promise.resolve({ ...missingStatus, state: 'ready', runtimeReady: true, tokensReady: true });
      return Promise.resolve(missingStatus);
    });
  });

  it('does not download automatically and registers progress before an explicit install', async () => {
    const { listen } = await import('@tauri-apps/api/event');
    render(<SenseVoiceManager languages={['zh']} onLanguagesChange={vi.fn()} onStatusChange={vi.fn()} />);
    expect(await screen.findByText('SenseVoice 本地模型')).toBeTruthy();
    expect(mocks.invoke).not.toHaveBeenCalledWith('download_sensevoice', expect.anything());

    await userEvent.setup().click(screen.getByRole('button', { name: '下载 int8 模型' }));

    const downloadOrder = mocks.invoke.mock.invocationCallOrder.find(
      (_, index) => mocks.invoke.mock.calls[index][0] === 'download_sensevoice',
    );
    expect(vi.mocked(listen).mock.invocationCallOrder[0]).toBeLessThan(downloadOrder!);
    expect(mocks.invoke).toHaveBeenCalledWith('download_sensevoice', { modelId: 'int8' });
  });

  it('shows download progress and can pause a resumable download', async () => {
    render(<SenseVoiceManager languages={['zh']} onLanguagesChange={vi.fn()} onStatusChange={vi.fn()} />);
    await screen.findByText('SenseVoice 本地模型');
    await userEvent.setup().click(screen.getByRole('button', { name: '下载 int8 模型' }));
    act(() => mocks.progress({ payload: { modelId: 'int8', artifactId: 'model-int8', downloadedBytes: 50, totalBytes: 100, overallPercent: 50 } }));
    expect((await screen.findByRole('progressbar', { name: 'SenseVoice 下载进度' })).getAttribute('value')).toBe('50');
    await userEvent.setup().click(screen.getByRole('button', { name: '暂停 SenseVoice 下载' }));
    expect(mocks.invoke).toHaveBeenCalledWith('cancel_sensevoice_download');
  });

  it('keeps at least one recognition language selected', async () => {
    const onLanguagesChange = vi.fn();
    render(<SenseVoiceManager languages={['zh']} onLanguagesChange={onLanguagesChange} onStatusChange={vi.fn()} />);
    await screen.findByText('SenseVoice 本地模型');
    const chinese = screen.getByRole('checkbox', { name: /中文/ });
    await userEvent.setup().click(chinese);
    expect(onLanguagesChange).not.toHaveBeenCalled();
    expect(screen.getByText('至少保留一种识别语言。')).toBeTruthy();
  });

  it('activates a ready model and confirms deletion of the selected model', async () => {
    const ready = {
      ...missingStatus,
      state: 'ready' as const, runtimeReady: true, tokensReady: true,
      models: [
        { ...missingStatus.models[0], state: 'ready' as const, isSelected: true },
        { ...missingStatus.models[1], state: 'ready' as const, isSelected: false },
      ],
    };
    mocks.invoke.mockImplementation((command: string) => {
      if (command === 'get_sensevoice_status') return Promise.resolve(ready);
      if (command === 'set_sensevoice_model') return Promise.resolve({ ...ready, selectedModel: 'float32', models: ready.models.map((model) => ({ ...model, isSelected: model.id === 'float32' })) });
      return Promise.resolve(ready);
    });
    render(<SenseVoiceManager languages={['zh']} onLanguagesChange={vi.fn()} onStatusChange={vi.fn()} />);
    await screen.findByText('已就绪');
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: '删除 int8 模型' }));
    expect(mocks.invoke).not.toHaveBeenCalledWith('delete_sensevoice', expect.anything());
    await user.click(screen.getByRole('button', { name: '确认删除 int8 模型' }));
    expect(mocks.invoke).toHaveBeenCalledWith('delete_sensevoice', { modelId: 'int8', confirmedSelectedDelete: true });
    await user.click(screen.getByRole('button', { name: '启用 float32 模型' }));
    expect(mocks.invoke).toHaveBeenCalledWith('set_sensevoice_model', { modelId: 'float32' });
  });

  it('reports the fresh readiness state to the task-start gate', async () => {
    const onStatusChange = vi.fn();
    render(<SenseVoiceManager languages={['zh']} onLanguagesChange={vi.fn()} onStatusChange={onStatusChange} />);
    await waitFor(() => expect(onStatusChange).toHaveBeenCalledWith(expect.objectContaining({ state: 'missing' })));
  });

  it('releases a progress listener that finishes registering after unmount', async () => {
    const { listen } = await import('@tauri-apps/api/event');
    let resolveListener!: (unlisten: () => void) => void;
    const delayedUnlisten = vi.fn();
    vi.mocked(listen).mockImplementationOnce(() => new Promise((resolve) => {
      resolveListener = resolve;
    }));

    const view = render(
      <SenseVoiceManager languages={['zh']} onLanguagesChange={vi.fn()} onStatusChange={vi.fn()} />,
    );
    view.unmount();
    resolveListener(delayedUnlisten);

    await waitFor(() => expect(delayedUnlisten).toHaveBeenCalledTimes(1));
  });
});
