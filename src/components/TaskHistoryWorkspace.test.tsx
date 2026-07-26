/**
 *测试文件——测试 TaskHistoryWorkspace 组件/模块的行为是否符合预期。
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TaskRetryRequest } from '../lib/types';
import TaskHistoryWorkspace from './TaskHistoryWorkspace';

const bridge = vi.hoisted(() => ({ listTaskRecords: vi.fn(), retryTaskRecord: vi.fn() }));
vi.mock('../lib/bridge', () => bridge);

const retry: TaskRetryRequest = {
  source: { kind: 'bilibili_url', url: 'https://www.bilibili.com/video/BV1' },
  options: { note_template: 'core_distillation', include_screenshots: false, note_style: 'minimal' },
  transcriptionProfileId: 'local',
  summaryProfileId: 'summary',
};

// describe('TaskHistoryWorkspace', () => {
describe('TaskHistoryWorkspace', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    bridge.listTaskRecords.mockResolvedValue([{ id: 3, taskId: 'task-3', title: '失败的视频', sourceLabel: 'Bilibili', state: 'failed', startedAt: '2026-07-15T08:00:00Z', finishedAt: '2026-07-15T08:01:04Z', durationMs: 64000, transcriptionProfileId: 'local', transcriptionProfileName: 'SenseVoice', transcriptionModel: 'int8', summaryProfileId: 'summary', summaryProfileName: 'DeepSeek', summaryModel: 'v4', compute: 'cpu', noteId: null, errorCode: 'transcription_failed', diagnosticLogId: 'app-diagnostics' }]);
    bridge.retryTaskRecord.mockResolvedValue(retry);
  });

  // it('shows persisted failure state and returns a typed retry
  it('shows persisted failure state and returns a typed retry draft', async () => {
    const onRetry = vi.fn();
    const user = userEvent.setup();
    render(<TaskHistoryWorkspace onRetry={onRetry} onOpenNote={vi.fn()} onOpenLog={vi.fn()} />);

    const table = await screen.findByRole('table', { name: '历史任务' });
    await screen.findByText('失败的视频');
    expect(table.textContent).toContain('失败');
    expect(table.textContent).toContain('1分04秒');
    expect(screen.getByText('1分04秒').getAttribute('data-label')).toBe('耗时');
    expect(screen.getByText('SenseVoice').closest('td')?.getAttribute('data-label')).toBe('转写');
    await user.click(screen.getByRole('button', { name: '重试 失败的视频' }));
    await waitFor(() => expect(bridge.retryTaskRecord).toHaveBeenCalledWith(3));
    expect(onRetry).toHaveBeenCalledWith(retry);
  });

  it('filters persisted records by explicit status and exposes selected task detail', async () => {
    bridge.listTaskRecords.mockResolvedValue([
      { id: 1, taskId: 'task-1', title: '运行任务', sourceLabel: '本地文件', state: 'running', startedAt: '2026-07-15T08:00:00Z', finishedAt: null, durationMs: null, transcriptionProfileId: 'local', transcriptionProfileName: 'SenseVoice', transcriptionModel: 'int8', summaryProfileId: 'summary', summaryProfileName: 'DeepSeek', summaryModel: 'v4', compute: 'cpu', noteId: null, errorCode: null, diagnosticLogId: null },
      { id: 2, taskId: 'task-2', title: '完成任务', sourceLabel: 'YouTube', state: 'succeeded', startedAt: '2026-07-15T07:00:00Z', finishedAt: '2026-07-15T07:01:00Z', durationMs: 60000, transcriptionProfileId: 'local', transcriptionProfileName: 'Whisper', transcriptionModel: 'small', summaryProfileId: 'summary', summaryProfileName: 'DeepSeek', summaryModel: 'v4', compute: 'gpu', noteId: 9, errorCode: null, diagnosticLogId: null },
      { id: 3, taskId: 'task-3', title: '失败的视频', sourceLabel: 'Bilibili', state: 'failed', startedAt: '2026-07-15T08:00:00Z', finishedAt: '2026-07-15T08:01:04Z', durationMs: 64000, transcriptionProfileId: 'local', transcriptionProfileName: 'SenseVoice', transcriptionModel: 'int8', summaryProfileId: 'summary', summaryProfileName: 'DeepSeek', summaryModel: 'v4', compute: 'cpu', noteId: null, errorCode: 'transcription_failed', diagnosticLogId: 'app-diagnostics' },
    ]);
    const user = userEvent.setup();
    render(<TaskHistoryWorkspace onRetry={vi.fn()} onOpenNote={vi.fn()} onOpenLog={vi.fn()} />);

    const filters = await screen.findByRole('group', { name: '任务状态' });
    expect(screen.getByRole('complementary', { name: '任务详情' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: '失败' }));
    expect(filters.querySelector('[aria-pressed="true"]')?.textContent).toBe('失败');
    expect(screen.getByRole('table', { name: '历史任务' }).textContent).toContain('失败的视频');
    expect(screen.getByRole('table', { name: '历史任务' }).textContent).not.toContain('完成任务');
    expect(screen.getByRole('complementary', { name: '任务详情' }).textContent).toContain('失败的视频');
  });

  it('filters queued records through the waiting-status control', async () => {
    bridge.listTaskRecords.mockResolvedValue([
      { id: 4, taskId: 'task-4', title: '排队任务', sourceLabel: '本地文件', state: 'queued', startedAt: '2026-07-15T09:00:00Z', finishedAt: null, durationMs: null, transcriptionProfileId: 'local', transcriptionProfileName: 'SenseVoice', transcriptionModel: 'int8', summaryProfileId: 'summary', summaryProfileName: 'DeepSeek', summaryModel: 'v4', compute: 'cpu', noteId: null, errorCode: null, diagnosticLogId: null },
      { id: 2, taskId: 'task-2', title: '完成任务', sourceLabel: 'YouTube', state: 'succeeded', startedAt: '2026-07-15T07:00:00Z', finishedAt: '2026-07-15T07:01:00Z', durationMs: 60000, transcriptionProfileId: 'local', transcriptionProfileName: 'Whisper', transcriptionModel: 'small', summaryProfileId: 'summary', summaryProfileName: 'DeepSeek', summaryModel: 'v4', compute: 'gpu', noteId: 9, errorCode: null, diagnosticLogId: null },
    ]);
    const user = userEvent.setup();
    render(<TaskHistoryWorkspace onRetry={vi.fn()} onOpenNote={vi.fn()} onOpenLog={vi.fn()} />);

    await screen.findByText('排队任务');
    await user.click(screen.getByRole('button', { name: '等待中' }));

    const table = screen.getByRole('table', { name: '历史任务' });
    expect(table.textContent).toContain('排队任务');
    expect(table.textContent).not.toContain('完成任务');
  });

  it('exposes the task represented by the detail panel as the pressed row control', async () => {
    bridge.listTaskRecords.mockResolvedValue([
      { id: 1, taskId: 'task-1', title: '运行任务', sourceLabel: '本地文件', state: 'running', startedAt: '2026-07-15T08:00:00Z', finishedAt: null, durationMs: null, transcriptionProfileId: 'local', transcriptionProfileName: 'SenseVoice', transcriptionModel: 'int8', summaryProfileId: 'summary', summaryProfileName: 'DeepSeek', summaryModel: 'v4', compute: 'cpu', noteId: null, errorCode: null, diagnosticLogId: null },
      { id: 2, taskId: 'task-2', title: '完成任务', sourceLabel: 'YouTube', state: 'succeeded', startedAt: '2026-07-15T07:00:00Z', finishedAt: '2026-07-15T07:01:00Z', durationMs: 60000, transcriptionProfileId: 'local', transcriptionProfileName: 'Whisper', transcriptionModel: 'small', summaryProfileId: 'summary', summaryProfileName: 'DeepSeek', summaryModel: 'v4', compute: 'gpu', noteId: 9, errorCode: null, diagnosticLogId: null },
    ]);
    const user = userEvent.setup();
    render(<TaskHistoryWorkspace onRetry={vi.fn()} onOpenNote={vi.fn()} onOpenLog={vi.fn()} />);

    const running = await screen.findByRole('button', { name: '查看任务 运行任务' });
    const completed = screen.getByRole('button', { name: '查看任务 完成任务' });
    expect(running.getAttribute('aria-pressed')).toBe('true');
    expect(completed.getAttribute('aria-pressed')).toBe('false');

    await user.click(completed);
    expect(running.getAttribute('aria-pressed')).toBe('false');
    expect(completed.getAttribute('aria-pressed')).toBe('true');
  });
});
