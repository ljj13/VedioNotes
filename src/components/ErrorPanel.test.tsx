/**
 *测试文件——测试 ErrorPanel 组件/模块的行为是否符合预期。
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import ErrorPanel from './ErrorPanel';

// describe('ErrorPanel diagnostics recovery', () => {
describe('ErrorPanel diagnostics recovery', () => {
  // it('keeps retry and opens the diagnostic log on demand', asy
  it('keeps retry and opens the diagnostic log on demand', async () => {
    const onRetry = vi.fn();
    const onOpenLog = vi.fn().mockResolvedValue(undefined);
    render(
      <ErrorPanel
        error={{ code: 'local_whisper_output', message: '输出文件不可读取。', recovery: '请重新运行转写。' }}
        onRetry={onRetry}
        onOpenLog={onOpenLog}
      />,
    );

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: '打开日志' }));
    expect(onOpenLog).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: '重试' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  // it('surfaces a safe recovery message when the log cannot be
  it('surfaces a safe recovery message when the log cannot be opened', async () => {
    render(
      <ErrorPanel
        error={{ code: 'failure', message: '处理失败。', recovery: '请重试。' }}
        onRetry={vi.fn()}
        onOpenLog={vi.fn().mockRejectedValue(new Error('private path'))}
      />,
    );

    await userEvent.setup().click(screen.getByRole('button', { name: '打开日志' }));
    expect(await screen.findByText('无法打开日志，请在应用数据目录的 logs 文件夹中查看。')).toBeTruthy();
    expect(screen.queryByText('private path')).toBeNull();
  });
});
