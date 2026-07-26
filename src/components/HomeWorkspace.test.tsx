/**
 *测试文件——测试 HomeWorkspace 组件/模块的行为是否符合预期。
 */

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import HomeWorkspace from './HomeWorkspace';

const recentNotes = [
  {
    id: 7,
    title: '真实历史笔记',
    source: 'https://www.bilibili.com/video/BV1',
    noteTemplate: 'core_distillation',
    noteStyle: 'minimal' as const,
    createdAt: '2026-07-15T08:00:00Z',
    markdownPath: 'note.md',
    transcriptPath: 'transcript.txt',
    thumbnailPath: null,
    screenshotPaths: [],
  },
];

// describe('HomeWorkspace', () => {
describe('HomeWorkspace', () => {
  // it('renders real counts and recent-note data supplied by App
  it('renders real counts and recent-note data supplied by App', () => {
    render(
      <HomeWorkspace
        noteCount={12}
        readyLocalModelCount={2}
        recentNotes={recentNotes}
        serviceReady
        serviceDetail="Whisper Small · CPU 就绪"
        onCreate={vi.fn()}
        onOpenLibrary={vi.fn()}
        onOpenTasks={vi.fn()}
      />,
    );

    expect(screen.getByText('12')).toBeTruthy();
    expect(screen.getByText('2')).toBeTruthy();
    expect(screen.getByText('真实历史笔记')).toBeTruthy();
    expect(screen.getByText('Whisper Small · CPU 就绪')).toBeTruthy();
    expect(document.querySelector('.home-hero-visual')).toBeTruthy();
    expect(document.querySelector('.home-service-summary')).toBeTruthy();
  });

  // it('connects all Home actions to real route handlers', () =>
  it('connects all Home actions to real route handlers', () => {
    const onCreate = vi.fn();
    const onOpenLibrary = vi.fn();
    const onOpenTasks = vi.fn();
    render(
      <HomeWorkspace
        noteCount={0}
        readyLocalModelCount={0}
        recentNotes={[]}
        serviceReady={false}
        serviceDetail="正在检查服务"
        onCreate={onCreate}
        onOpenLibrary={onOpenLibrary}
        onOpenTasks={onOpenTasks}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '新建提炼' }));
    fireEvent.click(screen.getByRole('button', { name: '打开笔记库' }));
    fireEvent.click(screen.getByRole('button', { name: '查看历史任务' }));
    expect(onCreate).toHaveBeenCalledTimes(1);
    expect(onOpenLibrary).toHaveBeenCalledTimes(1);
    expect(onOpenTasks).toHaveBeenCalledTimes(1);
  });

  // it('shows an honest empty state instead of sample notes', ()
  it('shows an honest empty state instead of sample notes', () => {
    render(
      <HomeWorkspace
        noteCount={0}
        readyLocalModelCount={0}
        recentNotes={[]}
        serviceReady={false}
        serviceDetail="尚未配置可用服务"
        onCreate={vi.fn()}
        onOpenLibrary={vi.fn()}
        onOpenTasks={vi.fn()}
      />,
    );

    expect(screen.getByText('还没有历史笔记')).toBeTruthy();
    expect(screen.queryByText('低认知冲突为何会迅速演变为公共事件')).toBeNull();
  });
});
