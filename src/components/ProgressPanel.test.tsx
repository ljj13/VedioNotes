/**
 *测试文件——测试 ProgressPanel 组件/模块的行为是否符合预期。
 */

import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ProgressPanel from './ProgressPanel';

// describe('ProgressPanel percentage feedback', () => {
describe('ProgressPanel percentage feedback', () => {
  // it('shows a semantic overall progress bar, exact percentage
  it('shows a semantic overall progress bar, exact percentage and elapsed status', () => {
    render(
      <ProgressPanel
        progress={{ stage: 'transcribing', message: '正在转写音频...', percent: 52 }}
        startedAtMs={Date.now() - 20_000}
        onCancel={vi.fn()}
        disabled={false}
      />,
    );

    const bar = screen.getByRole('progressbar', { name: '处理进度' });
    expect(bar.getAttribute('aria-valuenow')).toBe('52');
    expect(screen.getByText('52%')).toBeTruthy();
    expect(screen.getByText(/已用时 0:20/)).toBeTruthy();
    expect(screen.getByText('正在转写音频...')).toBeTruthy();
  });

  // it('clamps an invalid event percentage before rendering it',
  it('clamps an invalid event percentage before rendering it', () => {
    render(
      <ProgressPanel
        progress={{ stage: 'complete', message: '完成', percent: 180 }}
        startedAtMs={Date.now()}
        onCancel={vi.fn()}
        disabled={false}
      />,
    );

    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('100');
    expect(screen.getByText('100%')).toBeTruthy();
  });

  // it('falls back to zero when the backend percentage is not fi
  it('falls back to zero when the backend percentage is not finite', () => {
    render(
      <ProgressPanel
        progress={{ stage: 'transcribing', message: '等待有效进度', percent: Number.NaN }}
        startedAtMs={Date.now()}
        onCancel={vi.fn()}
        disabled={false}
      />,
    );

    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('0');
    expect(screen.getByText('0%')).toBeTruthy();
  });
});
