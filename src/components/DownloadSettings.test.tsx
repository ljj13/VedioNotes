/**
 *测试文件——测试 DownloadSettings 组件/模块的行为是否符合预期。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DownloadSettings from './DownloadSettings';

const bridge = vi.hoisted(() => ({
  getDownloadCookieStatus: vi.fn(),
  saveDownloadCookie: vi.fn(),
  deleteDownloadCookie: vi.fn(),
}));
vi.mock('../lib/bridge', () => bridge);

// describe('DownloadSettings', () => {
describe('DownloadSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    bridge.getDownloadCookieStatus.mockResolvedValue({ bilibili: true, douyin: false, youtube: false });
    bridge.saveDownloadCookie.mockResolvedValue(undefined);
  });

  // it('shows status only and clears a Cookie after saving a rep
  it('shows status only and clears a Cookie after saving a replacement', async () => {
    render(<DownloadSettings />);
    expect(await screen.findByText('已配置')).toBeTruthy();
    const input = screen.getByLabelText('B站 Cookie');
    expect((input as HTMLInputElement).value).toBe('');
    await userEvent.setup().type(input, 'SESSDATA=test');
    await userEvent.setup().click(screen.getByRole('button', { name: '保存 B站 Cookie' }));
    await waitFor(() => expect(bridge.saveDownloadCookie).toHaveBeenCalledWith('bilibili', 'SESSDATA=test'));
    expect((input as HTMLInputElement).value).toBe('');
  });
});
