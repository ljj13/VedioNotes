/**
 *测试文件——测试 WindowControls 组件/模块的行为是否符合预期。
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const windowApi = vi.hoisted(() => ({
  minimize: vi.fn().mockResolvedValue(undefined),
  toggleMaximize: vi.fn().mockResolvedValue(undefined),
  close: vi.fn().mockResolvedValue(undefined),
  isMaximized: vi.fn().mockResolvedValue(false),
  onResized: vi.fn().mockResolvedValue(() => {}),
}));

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => windowApi,
}));

import WindowControls from './WindowControls';

beforeEach(() => {
  vi.clearAllMocks();
  windowApi.minimize.mockResolvedValue(undefined);
  windowApi.toggleMaximize.mockResolvedValue(undefined);
  windowApi.close.mockResolvedValue(undefined);
  windowApi.isMaximized.mockResolvedValue(false);
  windowApi.onResized.mockResolvedValue(() => {});
});

// describe('WindowControls', () => {
describe('WindowControls', () => {
  // it('calls the Tauri minimize, maximize, and close APIs', asy
  it('calls the Tauri minimize, maximize, and close APIs', async () => {
    render(<WindowControls />);

    fireEvent.click(screen.getByRole('button', { name: '最小化' }));
    fireEvent.click(screen.getByRole('button', { name: '最大化' }));
    fireEvent.click(screen.getByRole('button', { name: '关闭' }));

    expect(windowApi.minimize).toHaveBeenCalledTimes(1);
    expect(windowApi.toggleMaximize).toHaveBeenCalledTimes(1);
    expect(windowApi.close).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(windowApi.isMaximized).toHaveBeenCalled());
  });

  // it('shows the restore action when the window is maximized',
  it('shows the restore action when the window is maximized', async () => {
    windowApi.isMaximized.mockResolvedValue(true);
    render(<WindowControls />);

    expect(await screen.findByRole('button', { name: '还原' })).toBeTruthy();
    expect(screen.getByLabelText('窗口控制').classList.contains('window-controls')).toBe(true);
  });
});
