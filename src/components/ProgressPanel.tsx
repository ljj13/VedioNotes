import { useEffect, useState } from 'react';
import { type TaskProgress, type TaskStage } from '../lib/types';

interface Props {
  progress: TaskProgress | null;
  startedAtMs: number;
  onCancel: () => void;
  disabled: boolean;
}

const STAGE_LABELS: Record<TaskStage, string> = {
  downloading: '下载中',
  subtitle_fetching: '获取字幕',
  preparing_audio: '音频准备',
  transcribing: '转写中',
  distilling: '核心提炼',
  capturing_screenshots: '截图中',
  saving: '保存结果',
  complete: '完成',
};

export default function ProgressPanel({ progress, startedAtMs, onCancel, disabled }: Props) {
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    setNowMs(Date.now());
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [startedAtMs]);

  if (!progress) return null;

  const stages: TaskStage[] = [
    'downloading',
    'subtitle_fetching',
    'preparing_audio',
    'transcribing',
    'distilling',
    'capturing_screenshots',
    'saving',
    'complete',
  ];

  const currentIndex = stages.indexOf(progress.stage);
  const percent = normalizePercent(progress.percent);
  const elapsedSeconds = Math.max(0, Math.floor((nowMs - startedAtMs) / 1000));
  const elapsedMinutes = Math.floor(elapsedSeconds / 60);
  const elapsedRemainder = String(elapsedSeconds % 60).padStart(2, '0');

  return (
    <div className="progress-panel" role="status" aria-live="polite">
      <h3>处理进度</h3>

      <div className="progress-overview">
        <div className="progress-overview-copy">
          <strong>{percent}%</strong>
          <span>已用时 {elapsedMinutes}:{elapsedRemainder}</span>
        </div>
        <div
          className="progress-track"
          role="progressbar"
          aria-label="处理进度"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          aria-valuetext={`${percent}%`}
        >
          <span className="progress-fill" style={{ transform: `scaleX(${percent / 100})` }} />
        </div>
      </div>

      <div className="stage-list">
        {stages.map((stage, i) => {
          const isActive = i === currentIndex;
          const isComplete = i < currentIndex;
          return (
            <div
              key={stage}
              className={`stage-item ${isActive ? 'active' : ''} ${isComplete ? 'complete' : ''}`}
            >
              <span className="stage-indicator" aria-hidden="true">
                {isComplete ? <CheckIcon /> : <span className="stage-dot" />}
              </span>
              <span className="stage-label">{STAGE_LABELS[stage]}</span>
              <span className="stage-state">{isComplete ? '已完成' : isActive ? '当前' : '待执行'}</span>
            </div>
          );
        })}
      </div>

      <p className="progress-message">{progress.message}</p>

      {!disabled && currentIndex >= 0 && currentIndex < stages.length - 1 && (
        <button className="cancel-button" onClick={onCancel} type="button">
          取消任务
        </button>
      )}
      <div className="progress-floating-pill" aria-label="任务进度摘要">
        <span className="progress-pill-orbit" aria-hidden="true" />
        <strong>{STAGE_LABELS[progress.stage]}</strong>
        <span>{percent}% · {elapsedMinutes}:{elapsedRemainder}</span>
      </div>
    </div>
  );
}

function CheckIcon() {
  return <svg viewBox="0 0 24 24"><path d="m5 12 4 4L19 6" /></svg>;
}

function normalizePercent(value: number) {
  return Number.isFinite(value) ? Math.max(0, Math.min(100, Math.round(value))) : 0;
}
