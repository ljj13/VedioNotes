/**
 *"新建提炼"页面组件——用户在这里输入视频链接并启动提炼任务。
 * *
 * * 页面上有：
 * *   1. 来源选择区（输入视频链接或选择本地文件）
 * *   2. 处理计划卡片（显示将用哪个转写/总结服务、什么笔记风格）
 * *   3. 处理状态（就绪中、禁止启动等）
 */

import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import type { TaskProgress, TaskStage } from '../lib/types';

type AppView = 'idle' | 'running' | 'success' | 'error';
type PipelineState = 'waiting' | 'current' | 'completed' | 'failed';

type Props = {
  view: AppView;
  progress: TaskProgress | null;
  services?: ReactNode;
  children: ReactNode;
};

/** CreateWorkspaceAction */
export type CreateWorkspaceAction = {
  label: string;
  disabled: boolean;
  onActivate: () => void;
};

type RegisterCreateWorkspaceAction = (action: CreateWorkspaceAction | null) => void;

const CreateWorkspaceActionContext = createContext<RegisterCreateWorkspaceAction | null>(null);

/** useCreateWorkspaceAction */
export function useCreateWorkspaceAction() {
  return useContext(CreateWorkspaceActionContext);
}

const PIPELINE_STEPS = [
  { label: '导入与识别', stages: ['downloading'] as TaskStage[] },
  { label: '获取字幕 / 转写', stages: ['subtitle_fetching', 'preparing_audio', 'transcribing'] as TaskStage[] },
  { label: '核心提炼', stages: ['distilling', 'capturing_screenshots'] as TaskStage[] },
  { label: '保存与索引', stages: ['saving', 'complete'] as TaskStage[] },
];

const STATE_LABELS: Record<PipelineState, string> = {
  waiting: '待执行',
  current: '当前',
  completed: '已完成',
  failed: '失败',
};

/** CreateWorkspace */
export default function CreateWorkspace({ view, progress, services, children }: Props) {
  const [registeredAction, setRegisteredAction] = useState<CreateWorkspaceAction | null>(null);
  const registerAction = useCallback<RegisterCreateWorkspaceAction>((action) => setRegisteredAction(action), []);
  const currentStep = progress ? Math.max(0, PIPELINE_STEPS.findIndex((step) => step.stages.includes(progress.stage))) : 0;
  const stateFor = (index: number): PipelineState => {
    if (view === 'success' || progress?.stage === 'complete') return 'completed';
    if (view === 'error') {
      if (index < currentStep) return 'completed';
      return index === currentStep ? 'failed' : 'waiting';
    }
    if (index < currentStep) return 'completed';
    return index === currentStep ? 'current' : 'waiting';
  };

  return (
    <section className="create-workspace" aria-label="创建提炼">
      <header className="create-workspace-header">
        <div>
          <span className="workspace-eyebrow">CREATE</span>
          <h1>新建视频提炼</h1>
          <p>先选择来源，再确认笔记风格和本次任务使用的处理方案。</p>
        </div>
        <span className={`create-readiness-chip ${view === 'error' ? 'is-error' : ''}`}>
          <span aria-hidden="true" />
          {view === 'running' ? '任务处理中' : view === 'error' ? '需要处理' : '处理服务就绪'}
        </span>
      </header>
      <div className="create-workspace-main">
        {services && <div className="create-service-selectors" aria-label="处理服务">{services}</div>}
        <CreateWorkspaceActionContext.Provider value={registerAction}>{children}</CreateWorkspaceActionContext.Provider>
      </div>
      <aside className="pipeline-card" aria-label="处理流程预览">
        <header className="pipeline-header">
          <div>
            <span className="workspace-eyebrow">PROCESSING PLAN</span>
            <h2>处理方案</h2>
          </div>
          <span className={`pipeline-ready ${view === 'error' ? 'is-error' : ''}`}>
            <span aria-hidden="true" />
            {view === 'running' ? '处理中' : view === 'success' ? '已完成' : view === 'error' ? '需处理' : '就绪'}
          </span>
        </header>
        <ol className="pipeline-list">
          {PIPELINE_STEPS.map((step, index) => {
            const state = stateFor(index);
            return (
              <li key={step.label} data-state={state}>
                <span className="pipeline-index" aria-hidden="true">{state === 'completed' ? <CheckIcon /> : index + 1}</span>
                <span className="pipeline-copy">
                  <strong>{step.label}</strong>
                  <small>{STATE_LABELS[state]}</small>
                </span>
              </li>
            );
          })}
        </ol>
        <div className="pipeline-tip">
          <strong>字幕优先</strong>
          <span>有可用字幕时将跳过语音识别，节省处理时间。</span>
        </div>
        {registeredAction && (
          <button
            className="start-button pipeline-start-button"
            type="button"
            disabled={registeredAction.disabled}
            onClick={registeredAction.onActivate}
          >
            <PlayIcon />
            {registeredAction.label}
          </button>
        )}
      </aside>
    </section>
  );
}

/** CheckIcon */
function CheckIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6" /></svg>;
}

/** PlayIcon */
function PlayIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 7 8 5-8 5z" /></svg>;
}
