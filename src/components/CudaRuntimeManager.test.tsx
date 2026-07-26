/**
 *测试文件——测试 CudaRuntimeManager 组件/模块的行为是否符合预期。
 */

import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import CudaRuntimeManager from './CudaRuntimeManager';

const mocks = vi.hoisted(() => ({ listener: vi.fn(), invoke: vi.fn(), unlisten: vi.fn() }));

vi.mock('@tauri-apps/api/core', () => ({ invoke: mocks.invoke }));
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn((_event: string, callback: (event: { payload: unknown }) => void) => {
    mocks.listener.mockImplementation(callback);
    return Promise.resolve(mocks.unlisten);
  }),
}));

const readyStatus = {
  state: 'ready', gpuName: 'NVIDIA RTX Test', version: 'v1.8.3', computeMode: 'auto', message: null,
};

// describe('CudaRuntimeManager', () => {
describe('CudaRuntimeManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.invoke.mockImplementation((command: string) => {
      if (command === 'get_cuda_runtime_status') return Promise.resolve({ ...readyStatus, state: 'not_installed' });
      if (command === 'set_local_compute_mode') return Promise.resolve({ schemaVersion: 1, markdownOutputDir: null, localComputeMode: 'cpu' });
      return Promise.resolve();
    });
  });

  // it('detects without downloading and registers progress befor
  it('detects without downloading and registers progress before explicit download', async () => {
    const { listen } = await import('@tauri-apps/api/event');
    render(<CudaRuntimeManager />);
    expect(await screen.findByText('NVIDIA RTX Test')).toBeTruthy();
    expect(screen.getByText('CPU 转写始终可用')).toBeTruthy();
    expect(mocks.invoke).not.toHaveBeenCalledWith('download_cuda_runtime');

    await userEvent.setup().click(screen.getByRole('button', { name: '下载 CUDA 加速组件' }));
    expect(vi.mocked(listen).mock.invocationCallOrder[0]).toBeLessThan(
      mocks.invoke.mock.invocationCallOrder.find((_, index) => mocks.invoke.mock.calls[index][0] === 'download_cuda_runtime')!,
    );
    expect(mocks.invoke).toHaveBeenCalledWith('download_cuda_runtime');
  });

  // it('shows semantic progress, changes compute mode, and clean
  it('shows semantic progress, changes compute mode, and cleans its listener', async () => {
    const view = render(<CudaRuntimeManager />);
    await screen.findByText('NVIDIA RTX Test');
    act(() => mocks.listener({ payload: { downloadedBytes: 25, totalBytes: 100 } }));
    const progress = await screen.findByRole('progressbar', { name: 'CUDA 组件下载进度' });
    expect(progress.getAttribute('value')).toBe('25');

    await userEvent.setup().click(screen.getByRole('radio', { name: /^仅 CPU/ }));
    expect(mocks.invoke).toHaveBeenCalledWith('set_local_compute_mode', { mode: 'cpu' });
    view.unmount();
    expect(mocks.unlisten).toHaveBeenCalledOnce();
  });

  // it('shows ready/delete state and recoverable errors', async
  it('shows ready/delete state and recoverable errors', async () => {
    mocks.invoke.mockImplementation((command: string) => {
      if (command === 'get_cuda_runtime_status') return Promise.resolve(readyStatus);
      if (command === 'delete_cuda_runtime') return Promise.reject(new Error('busy'));
      return Promise.resolve();
    });
    render(<CudaRuntimeManager />);
    expect(await screen.findByText('CUDA 加速已就绪')).toBeTruthy();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: '删除 CUDA 加速组件' }));
    await user.click(screen.getByRole('button', { name: '确认删除 CUDA 加速组件' }));
    expect((await screen.findByRole('alert')).textContent).toContain('删除失败');
  });

  // it('renders an unavailable GPU state without disabling CPU',
  it('renders an unavailable GPU state without disabling CPU', async () => {
    mocks.invoke.mockResolvedValueOnce({ state: 'unavailable', gpuName: null, version: 'v1.8.3', computeMode: 'auto', message: '未检测到 NVIDIA GPU。' });
    render(<CudaRuntimeManager />);
    expect(await screen.findByText('未检测到 NVIDIA GPU。')).toBeTruthy();
    expect(screen.getByText('CPU 转写始终可用')).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole('button', { name: '下载 CUDA 加速组件' })).toBeNull());
  });
});
