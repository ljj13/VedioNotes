/**
 *"任务进度"页面组件——当一个任务正在运行时显示在这里。
 * * 显示任务的实时进度百分比、已用时间和当前阶段。
 */

import { useEffect, useState, type ReactNode } from 'react';
import type { TaskProgress } from '../lib/types';
import ProgressPanel from './ProgressPanel';

type Props = {
  progress: TaskProgress | null;
  startedAtMs: number;
  sourceLabel: string;
  serviceDetail: string;
  onCancel: () => void;
  onBackground: () => void;
  onOpenLog: () => void;
  errorContent?: ReactNode;
};

/** ProgressWorkspace */
export default function ProgressWorkspace({
  progress,
  startedAtMs,
  sourceLabel,
  serviceDetail,
  onCancel,
  onBackground,
  onOpenLog,
  errorContent,
}: Props) {
  return (
    <section className="progress-workspace" aria-labelledby="progress-workspace-title">
      <header className="progress-workspace-header">
        <div>
          <span className="workspace-eyebrow">PROCESSING</span>
          <h1 id="progress-workspace-title">正在提炼视频</h1>
          <p>任务会继续运行；切换页面不会重置进度或已用时间。</p>
        </div>
        <div className="progress-workspace-actions">
          <button type="button" className="secondary-action" onClick={onBackground}>后台运行</button>
          <button type="button" className="danger-outline-action" onClick={onCancel}>取消任务</button>
        </div>
      </header>

      <div className="progress-workspace-layout">
        <main>
          {errorContent ?? (
            progress ? (
              <ProgressPanel progress={progress} startedAtMs={startedAtMs} onCancel={onCancel} disabled />
            ) : (
              <div className="progress-awaiting" role="status">
                <span className="progress-awaiting-spinner" aria-hidden="true" />
                <strong>正在建立任务连接</strong>
                <p>监听器已注册，正在等待第一条处理进度。</p>
              </div>
            )
          )}
        </main>
        <aside className="task-context-card" aria-label="任务运行信息">
          <span className="workspace-eyebrow">TASK CONTEXT</span>
          <h2>本次任务</h2>
          <dl>
            <div><dt>来源</dt><dd>{sourceLabel}</dd></div>
            <div><dt>处理服务</dt><dd>{serviceDetail}</dd></div>
            <div><dt>运行策略</dt><dd>字幕优先 · 本地处理兜底</dd></div>
          </dl>
          <button type="button" className="secondary-action log-action" onClick={onOpenLog}><LogIcon />查看运行日志</button>
          <p className="task-context-note">日志只记录经过清理的诊断信息，不写入凭据正文。</p>
        </aside>
      </div>
    </section>
  );
}

type BackgroundTaskPillProps = {
  progress: TaskProgress | null;
  startedAtMs: number;
  completed?: boolean;
  onOpen: () => void;
};

/** BackgroundTaskPill */
export function BackgroundTaskPill({ progress, startedAtMs, completed = false, onOpen }: BackgroundTaskPillProps) {
  const elapsed = useElapsed(startedAtMs);
  const rawPercent = progress?.percent ?? 0;
  const percent = completed ? 100 : Number.isFinite(rawPercent) ? Math.max(0, Math.min(100, Math.round(rawPercent))) : 0;
  return (
    <button type="button" className={`background-task-pill ${completed ? 'is-complete' : ''}`} onClick={onOpen} aria-label={completed ? '处理完成，查看结果' : '查看后台任务进度'}>
      <span className="background-task-orbit" aria-hidden="true" />
      <span><strong>{completed ? '处理完成' : progress?.message ?? '正在准备任务'}</strong><small>{completed ? '结果已就绪' : `${percent}% · ${elapsed}`}</small></span>
      <span className="background-task-open">{completed ? '查看结果' : '查看进度'}</span>
    </button>
  );
}

/** useElapsed */
function useElapsed(startedAtMs: number) {
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    setNowMs(Date.now());
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [startedAtMs]);
  const seconds = Math.max(0, Math.floor((nowMs - startedAtMs) / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

/** LogIcon */
function LogIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h9l3 3v15H6z" /><path d="M15 3v4h4M9 12h6M9 16h6" /></svg>;
}
