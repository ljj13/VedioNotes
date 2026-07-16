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

describe('TaskHistoryWorkspace', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    bridge.listTaskRecords.mockResolvedValue([{ id: 3, taskId: 'task-3', title: '失败的视频', sourceLabel: 'Bilibili', state: 'failed', startedAt: '2026-07-15T08:00:00Z', finishedAt: '2026-07-15T08:01:04Z', durationMs: 64000, transcriptionProfileId: 'local', transcriptionProfileName: 'SenseVoice', transcriptionModel: 'int8', summaryProfileId: 'summary', summaryProfileName: 'DeepSeek', summaryModel: 'v4', compute: 'cpu', noteId: null, errorCode: 'transcription_failed', diagnosticLogId: 'app-diagnostics' }]);
    bridge.retryTaskRecord.mockResolvedValue(retry);
  });

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
});
