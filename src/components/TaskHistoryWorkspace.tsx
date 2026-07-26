/**
 *"历史任务"页面组件——展示所有运行过的任务记录。
 * * 包括任务状态、用了什么服务、耗时多久，以及失败任务的重试入口。
 */

import { useEffect, useRef, useState } from 'react';
import type { TaskRecord, TaskRetryRequest } from '../lib/types';
import { listTaskRecords, retryTaskRecord } from '../lib/bridge';

type Props = {
  onRetry: (request: TaskRetryRequest) => void | Promise<void>;
  onOpenNote: (noteId: number) => void;
  onOpenLog: () => void | Promise<void>;
};

const STATE_LABEL: Record<TaskRecord['state'], string> = {
  queued: '等待中', running: '处理中', succeeded: '已完成', failed: '失败', cancelled: '已取消',
};

type StatusFilter = 'all' | TaskRecord['state'];

const STATUS_FILTERS: Array<{ value: StatusFilter; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'queued', label: '等待中' },
  { value: 'running', label: '处理中' },
  { value: 'succeeded', label: '已完成' },
  { value: 'failed', label: '失败' },
  { value: 'cancelled', label: '已取消' },
];

/** TaskHistoryWorkspace */
export default function TaskHistoryWorkspace({ onRetry, onOpenNote, onOpenLog }: Props) {
  const [query, setQuery] = useState('');
  const [records, setRecords] = useState<TaskRecord[]>([]);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryingId, setRetryingId] = useState<number | null>(null);
  const requestSequence = useRef(0);

  useEffect(() => {
    setLoading(true);
    const timer = window.setTimeout(async () => {
      const sequence = ++requestSequence.current;
      try {
        const result = await listTaskRecords(query.trim());
        if (sequence === requestSequence.current) {
          setRecords(result);
          setSelectedId((current) => current !== null && result.some((record) => record.id === current) ? current : result[0]?.id ?? null);
          setError(null);
        }
      } catch {
        if (sequence === requestSequence.current) setError('历史任务暂时无法读取。');
      } finally {
        if (sequence === requestSequence.current) setLoading(false);
      }
    }, 220);
    return () => window.clearTimeout(timer);
  }, [query]);

  const retry = async (record: TaskRecord) => {
    setRetryingId(record.id);
    try {
      await onRetry(await retryTaskRecord(record.id));
    } finally {
      setRetryingId(null);
    }
  };

  const visibleRecords = statusFilter === 'all' ? records : records.filter((record) => record.state === statusFilter);
  const selectedRecord = visibleRecords.find((record) => record.id === selectedId) ?? visibleRecords[0] ?? null;
  const selectStatus = (next: StatusFilter) => {
    setStatusFilter(next);
    const nextVisible = next === 'all' ? records : records.filter((record) => record.state === next);
    setSelectedId(nextVisible[0]?.id ?? null);
  };

  return <section className="task-history-workspace" aria-label="历史任务工作区">
    <header className="workspace-page-header"><div><span className="workspace-eyebrow">TASKS</span><h1>历史任务</h1><p>查看每次处理的状态、耗时、引擎和安全诊断入口。</p></div><label className="task-search"><span className="sr-only">搜索任务</span><input aria-label="搜索任务" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索任务" /></label></header>
    {error && <p className="task-history-error" role="alert">{error}</p>}
    {!loading && <div className="task-history-toolbar">
      <div className="task-status-filters" role="group" aria-label="任务状态">
        {STATUS_FILTERS.map((item) => <button type="button" key={item.value} aria-pressed={statusFilter === item.value} onClick={() => selectStatus(item.value)}>{item.label}</button>)}
      </div>
      <span>{visibleRecords.length} 个任务</span>
    </div>}
    <div className="task-history-layout">
      <div className="task-table-shell">
        <table aria-label="历史任务"><thead><tr><th>任务</th><th>状态</th><th>耗时</th><th>转写</th><th>总结</th><th>操作</th></tr></thead>
          <tbody>{visibleRecords.map((record) => <tr key={record.id} className={selectedRecord?.id === record.id ? 'is-selected' : ''}>
            <td data-label="任务"><button type="button" className="task-row-select" aria-label={`查看任务 ${record.title}`} aria-pressed={selectedRecord?.id === record.id} onClick={() => setSelectedId(record.id)}><strong>{record.title}</strong><small>{record.sourceLabel} · {formatDate(record.startedAt)}</small></button></td>
            <td data-label="状态"><span className={`task-state state-${record.state}`}>{STATE_LABEL[record.state]}</span>{record.errorCode && <small>{record.errorCode}</small>}</td>
            <td data-label="耗时">{formatDuration(record.durationMs)}</td>
            <td data-label="转写"><strong>{record.transcriptionProfileName || '—'}</strong><small>{record.transcriptionModel || record.compute}</small></td>
            <td data-label="总结"><strong>{record.summaryProfileName || '—'}</strong><small>{record.summaryModel || '—'}</small></td>
            <td data-label="操作"><div className="task-actions">
              {record.noteId !== null && <button type="button" onClick={() => onOpenNote(record.noteId!)}>打开笔记</button>}
              {(record.state === 'failed' || record.state === 'cancelled') && <button type="button" aria-label={`重试 ${record.title}`} disabled={retryingId === record.id} onClick={() => void retry(record)}>{retryingId === record.id ? '准备中…' : '重试'}</button>}
              {record.diagnosticLogId && <button type="button" onClick={() => void onOpenLog()}>查看日志</button>}
            </div></td>
          </tr>)}</tbody>
        </table>
        {loading && <div className="task-history-empty">正在读取任务记录…</div>}
        {!loading && visibleRecords.length === 0 && !error && <div className="task-history-empty">还没有符合条件的任务记录。</div>}
      </div>
      <aside className="task-detail" aria-label="任务详情">
        <div className="library-column-heading"><span className="workspace-eyebrow">DETAIL</span><strong>任务详情</strong></div>
        {!selectedRecord ? <div className="task-detail-empty">选择任务后查看执行信息。</div> : <>
          <div className="task-detail-title"><span className={`task-state state-${selectedRecord.state}`}>{STATE_LABEL[selectedRecord.state]}</span><strong>任务：{selectedRecord.title}</strong><small>{selectedRecord.taskId}</small></div>
          <dl>
            <div><dt>来源</dt><dd>{selectedRecord.sourceLabel}</dd></div>
            <div><dt>开始时间</dt><dd>{formatDate(selectedRecord.startedAt)}</dd></div>
            <div><dt>耗时</dt><dd>共 {formatDuration(selectedRecord.durationMs)}</dd></div>
            <div><dt>转写服务</dt><dd>{selectedRecord.transcriptionProfileName || '—'} · {selectedRecord.transcriptionModel || selectedRecord.compute}</dd></div>
            <div><dt>总结服务</dt><dd>{selectedRecord.summaryProfileName || '—'} · {selectedRecord.summaryModel || '—'}</dd></div>
            {selectedRecord.errorCode && <div><dt>错误代码</dt><dd>{selectedRecord.errorCode}</dd></div>}
          </dl>
        </>}
      </aside>
    </div>
  </section>;
}

/** formatDuration */
function formatDuration(value: number | null) {
  if (value === null) return '—';
  const seconds = Math.max(0, Math.round(value / 1000));
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return minutes > 0 ? `${minutes}分${String(remainder).padStart(2, '0')}秒` : `${remainder}秒`;
}

/** formatDate */
function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? value : date.toLocaleString('zh-CN', { hour12: false });
}
