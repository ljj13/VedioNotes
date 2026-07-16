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

export default function TaskHistoryWorkspace({ onRetry, onOpenNote, onOpenLog }: Props) {
  const [query, setQuery] = useState('');
  const [records, setRecords] = useState<TaskRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [retryingId, setRetryingId] = useState<number | null>(null);
  const requestSequence = useRef(0);

  useEffect(() => {
    const timer = window.setTimeout(async () => {
      const sequence = ++requestSequence.current;
      try {
        const result = await listTaskRecords(query.trim());
        if (sequence === requestSequence.current) {
          setRecords(result);
          setError(null);
        }
      } catch {
        if (sequence === requestSequence.current) setError('历史任务暂时无法读取。');
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

  return <section className="task-history-workspace" aria-label="历史任务工作区">
    <header className="workspace-page-header"><div><span className="workspace-eyebrow">TASKS</span><h1>历史任务</h1><p>查看每次处理的状态、耗时、引擎和安全诊断入口。</p></div><label className="task-search"><span className="sr-only">搜索任务</span><input aria-label="搜索任务" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索任务" /></label></header>
    {error && <p className="task-history-error" role="alert">{error}</p>}
    <div className="task-table-shell">
      <table aria-label="历史任务"><thead><tr><th>任务</th><th>状态</th><th>耗时</th><th>转写</th><th>总结</th><th>操作</th></tr></thead>
        <tbody>{records.map((record) => <tr key={record.id}>
          <td data-label="任务"><strong>{record.title}</strong><small>{record.sourceLabel} · {formatDate(record.startedAt)}</small></td>
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
      {records.length === 0 && !error && <div className="task-history-empty">还没有任务记录。</div>}
    </div>
  </section>;
}

function formatDuration(value: number | null) {
  if (value === null) return '—';
  const seconds = Math.max(0, Math.round(value / 1000));
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return minutes > 0 ? `${minutes}分${String(remainder).padStart(2, '0')}秒` : `${remainder}秒`;
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? value : date.toLocaleString('zh-CN', { hour12: false });
}
