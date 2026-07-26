/**
 *测试文件——测试 LocalModelManager 组件/模块的行为是否符合预期。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LocalModelManager from './LocalModelManager';
import ProfileEditor from './ProfileEditor';
import type { LocalModelStatus } from '../lib/types';

const mocks = vi.hoisted(() => ({ listener: vi.fn(), invoke: vi.fn() }));

vi.mock('@tauri-apps/api/core', () => ({ invoke: mocks.invoke }));
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn((_event: string, callback: (event: { payload: unknown }) => void) => {
    mocks.listener.mockImplementation(callback);
    return Promise.resolve(vi.fn());
  }),
}));

const tiny: LocalModelStatus = {
  id: 'tiny', state: 'not_downloaded', downloadedBytes: 0, totalBytes: 75_000_000, isCurrent: false,
};

// describe('LocalModelManager', () => {
describe('LocalModelManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  // it('does not download anything until the user presses 下载', a
  it('does not download anything until the user presses 下载', async () => {
    render(<LocalModelManager models={[tiny]} onModelsChanged={vi.fn()} />);
    expect(mocks.invoke).not.toHaveBeenCalledWith('download_local_model', expect.anything());
    await userEvent.setup().click(screen.getByRole('button', { name: '下载 tiny' }));
    expect(mocks.invoke).toHaveBeenCalledWith('download_local_model', { modelId: 'tiny' });
  });

  // it('waits for deferred progress-listener registration before
  it('waits for deferred progress-listener registration before downloading', async () => {
    let resolveListen!: (unlisten: () => void) => void;
    const { listen } = await import('@tauri-apps/api/event');
    vi.mocked(listen).mockImplementationOnce(() => new Promise((resolve) => { resolveListen = resolve; }));
    render(<LocalModelManager models={[tiny]} onModelsChanged={vi.fn()} />);
    await userEvent.setup().click(screen.getByRole('button', { name: '下载 tiny' }));
    expect(mocks.invoke).not.toHaveBeenCalledWith('download_local_model', { modelId: 'tiny' });
    resolveListen(vi.fn());
    await waitFor(() => expect(mocks.invoke).toHaveBeenCalledWith('download_local_model', { modelId: 'tiny' }));
  });

  // it('blocks download and shows a retryable error when progres
  it('blocks download and shows a retryable error when progress-listener registration fails', async () => {
    const { listen } = await import('@tauri-apps/api/event');
    vi.mocked(listen).mockRejectedValueOnce(new Error('listener unavailable'));
    render(<LocalModelManager models={[tiny]} onModelsChanged={vi.fn()} />);
    await userEvent.setup().click(screen.getByRole('button', { name: '下载 tiny' }));
    expect(await screen.findByText('无法监听下载进度，请重试。')).toBeTruthy();
    expect(mocks.invoke).not.toHaveBeenCalledWith('download_local_model', { modelId: 'tiny' });
  });

  // it('shows event progress and cleans the subscription on unmo
  it('shows event progress and cleans the subscription on unmount', async () => {
    const unlisten = vi.fn();
    const { listen } = await import('@tauri-apps/api/event');
    vi.mocked(listen).mockImplementationOnce((_event, callback) => {
      mocks.listener.mockImplementation(callback as (event: { payload: unknown }) => void);
      return Promise.resolve(unlisten);
    });
    const view = render(<LocalModelManager models={[{ ...tiny, state: 'downloading' }]} onModelsChanged={vi.fn()} />);
    await waitFor(() => expect(listen).toHaveBeenCalledWith('local-model-download-progress', expect.any(Function)));
    mocks.listener({ payload: { modelId: 'tiny', downloadedBytes: 25, totalBytes: 100 } });
    expect(await screen.findByText('25%')).toBeTruthy();
    view.unmount();
    expect(unlisten).toHaveBeenCalledOnce();
  });

  // it('shows a recoverable source-fallback failure and retries'
  it('shows a recoverable source-fallback failure and retries', async () => {
    mocks.invoke.mockRejectedValueOnce(new Error('本地 Whisper 模型下载失败。请检查网络和磁盘空间后重试。'));
    render(<LocalModelManager models={[{ ...tiny, state: 'failed' }]} onModelsChanged={vi.fn()} />);
    await userEvent.setup().click(screen.getByRole('button', { name: '重试 tiny' }));
    expect(await screen.findByText('下载失败，已尝试备用网址。请检查网络和磁盘空间后重试。')).toBeTruthy();
    expect(mocks.invoke).toHaveBeenLastCalledWith('download_local_model', { modelId: 'tiny' });
  });

  // it('deletes a non-current ready model immediately and confir
  it('deletes a non-current ready model immediately and confirms current deletion', async () => {
    const ready = { ...tiny, state: 'ready' as const };
    const current = { ...tiny, id: 'base', state: 'ready' as const, isCurrent: true };
    render(<LocalModelManager models={[ready, current]} onModelsChanged={vi.fn()} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: '删除 tiny' }));
    expect(mocks.invoke).toHaveBeenCalledWith('delete_local_model', { modelId: 'tiny', confirmedCurrentDelete: false });
    await user.click(screen.getByRole('button', { name: '删除 base' }));
    expect(mocks.invoke).not.toHaveBeenCalledWith('delete_local_model', { modelId: 'base', confirmedCurrentDelete: true });
    await user.click(screen.getByRole('button', { name: '确认删除 base' }));
    expect(mocks.invoke).toHaveBeenCalledWith('delete_local_model', { modelId: 'base', confirmedCurrentDelete: true });
  });

  // it('does not expose endpoint, model, key, or test controls f
  it('does not expose endpoint, model, key, or test controls for local Whisper editing', () => {
    render(<ProfileEditor profileType="transcription" initialState="edit" existingProfile={{ id: 'local-whisper-cpp', name: '本地 Whisper', provider: 'local_whisper_cpp', baseUrl: '', model: 'tiny', enabled: true, builtIn: true }} onSaved={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.queryByLabelText('API 基础地址')).toBeNull();
    expect(screen.queryByLabelText('模型')).toBeNull();
    expect(screen.queryByLabelText('API Key')).toBeNull();
    expect(screen.queryByRole('button', { name: /测试/ })).toBeNull();
  });
});
