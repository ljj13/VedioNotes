import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { vi } from 'vitest';
import type { HistoryEntry } from '../lib/types';
import HistoryWorkspace from './HistoryWorkspace';

const entry: HistoryEntry = {
  id: 7,
  title: '线性代数课程',
  source: 'https://video.example/watch',
  noteTemplate: 'core_distillation',
  noteStyle: 'minimal',
  createdAt: '2026-07-14 10:00',
  markdownPath: 'C:\\notes\\linear.md',
  transcriptPath: 'C:\\notes\\linear.txt',
  thumbnailPath: null,
  screenshotPaths: [],
};

describe('HistoryWorkspace', () => {
  it('keeps the library and empty detail region in one workspace', () => {
    render(<HistoryWorkspace library={<div>可搜索笔记库</div>} selectedEntry={null} markdownState={{ status: 'idle' }} onRetry={() => {}} />);
    expect(screen.getByRole('heading', { name: '历史笔记' })).toBeTruthy();
    expect(screen.getByText('可搜索笔记库')).toBeTruthy();
    expect(screen.getByText('选择一篇笔记查看详情')).toBeTruthy();
  });

  it('renders the selected source and saved Markdown detail', () => {
    render(<HistoryWorkspace library={<div />} selectedEntry={entry} markdownState={{ status: 'ready', content: '# 已保存内容' }} onRetry={() => {}} />);
    expect(screen.getByRole('heading', { name: '线性代数课程' })).toBeTruthy();
    expect(screen.getByRole('link', { name: '查看原视频' }).getAttribute('href')).toBe(entry.source);
    expect(screen.getByText('风格 · 精简')).toBeTruthy();
    expect(screen.getByRole('article')).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1, name: '已保存内容' })).toBeTruthy();
  });

  it('distinguishes loading from an empty but successfully read Markdown file', () => {
    const { rerender } = render(<HistoryWorkspace library={<div />} selectedEntry={entry} markdownState={{ status: 'loading' }} onRetry={() => {}} />);
    expect(screen.getByRole('status').textContent).toContain('正在读取 Markdown');

    rerender(<HistoryWorkspace library={<div />} selectedEntry={entry} markdownState={{ status: 'ready', content: '' }} onRetry={() => {}} />);
    expect(screen.queryByText('正在读取 Markdown…')).toBeNull();
    expect(screen.getByText('这篇笔记暂时没有 Markdown 内容。')).toBeTruthy();
  });

  it('shows a recoverable read error and retries on request', async () => {
    const onRetry = vi.fn();
    render(<HistoryWorkspace library={<div />} selectedEntry={entry} markdownState={{ status: 'error', message: '历史笔记文件不可读取。', recovery: '请检查应用数据目录权限后重试。' }} onRetry={onRetry} />);

    expect(screen.getByRole('alert').textContent).toContain('历史笔记文件不可读取。');
    expect(screen.getByRole('alert').textContent).toContain('请检查应用数据目录权限后重试。');
    await userEvent.setup().click(screen.getByRole('button', { name: '重新读取' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('keeps note Q&A inside the responsive history layout instead of overlaying the note', () => {
    render(
      <HistoryWorkspace
        library={<div>可搜索笔记库</div>}
        selectedEntry={entry}
        markdownState={{ status: 'ready', content: '# 笔记' }}
        onRetry={() => {}}
        chat={<aside aria-label="笔记问答">问答内容</aside>}
      />,
    );

    const workspace = screen.getByRole('region', { name: '历史工作区' });
    const chat = screen.getByRole('complementary', { name: '笔记问答' });
    expect(workspace.contains(chat)).toBe(true);
    expect(chat.parentElement?.classList.contains('with-chat')).toBe(true);
  });
});
