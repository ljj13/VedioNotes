import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ProgressWorkspace from './ProgressWorkspace';

describe('ProgressWorkspace', () => {
  it('composes the persisted task timer, semantic percentage and real task actions', () => {
    render(
      <ProgressWorkspace
        progress={{ stage: 'transcribing', message: '正在使用本地模型转写', percent: 68 }}
        startedAtMs={Date.now() - 201_000}
        sourceLabel="Bilibili 公开链接"
        serviceDetail="本地 Whisper · CUDA"
        onCancel={vi.fn()}
        onBackground={vi.fn()}
        onOpenLog={vi.fn()}
      />,
    );

    expect(screen.getByRole('heading', { name: '正在提炼视频' })).toBeTruthy();
    expect(screen.getByRole('progressbar', { name: '处理进度' }).getAttribute('aria-valuenow')).toBe('68');
    expect(screen.getByRole('button', { name: '后台运行' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '取消任务' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '查看运行日志' })).toBeTruthy();
    expect(screen.getAllByText(/3:2[01]/).length).toBeGreaterThanOrEqual(1);
  });
});
