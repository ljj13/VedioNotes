import type { ReactNode } from 'react';
import type { HistoryEntry } from '../lib/types';
import { noteStyleLabel } from '../lib/noteStyles';
import SafeMarkdown from './SafeMarkdown';

type Props = {
  library: ReactNode;
  selectedEntry: HistoryEntry | null;
  markdownState: HistoryMarkdownState;
  onRetry: () => void;
  chat?: ReactNode;
};

export type HistoryMarkdownState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; content: string }
  | { status: 'error'; message: string; recovery?: string };

export default function HistoryWorkspace({ library, selectedEntry, markdownState, onRetry, chat }: Props) {
  return (
    <section className="history-workspace" aria-label="历史工作区">
      <header className="history-workspace-header">
        <div>
          <span className="workspace-eyebrow">LIBRARY</span>
          <h1>历史笔记</h1>
          <p>搜索、回看并继续向同一篇笔记提问。</p>
        </div>
      </header>
      <div className={`history-workspace-layout ${chat ? 'with-chat' : ''}`}>
        {library}
        <section className="history-note-card" aria-label="当前笔记">
          {selectedEntry ? (
            <>
              <header>
                <div>
                  <span className="workspace-eyebrow">NOTE DETAIL</span>
                  <h2>{selectedEntry.title}</h2>
                </div>
                <div className="history-note-meta">
                  <a href={selectedEntry.source}>查看原视频</a>
                  <span className="history-style-chip">风格 · {noteStyleLabel(selectedEntry.noteStyle)}</span>
                  <span>{selectedEntry.createdAt}</span>
                </div>
              </header>
              <MarkdownDetail state={markdownState} onRetry={onRetry} />
            </>
          ) : (
            <div className="history-empty-state">
              <span className="history-empty-icon" aria-hidden="true"><DocumentIcon /></span>
              <h2>选择一篇笔记查看详情</h2>
              <p>左侧笔记库支持关键词搜索和安全删除。</p>
            </div>
          )}
        </section>
        {chat}
      </div>
    </section>
  );
}

function MarkdownDetail({ state, onRetry }: { state: HistoryMarkdownState; onRetry: () => void }) {
  if (state.status === 'loading') {
    return <div className="history-detail-state history-detail-loading" role="status" aria-live="polite">正在读取 Markdown…</div>;
  }
  if (state.status === 'error') {
    return (
      <div className="history-detail-state history-detail-error" role="alert">
        <strong>无法读取 Markdown</strong>
        <p>{state.message}</p>
        {state.recovery && <p className="history-detail-recovery">{state.recovery}</p>}
        <button className="history-retry-button" type="button" onClick={onRetry}>重新读取</button>
      </div>
    );
  }
  if (state.status === 'ready') {
    return state.content.length > 0
      ? <SafeMarkdown content={state.content} />
      : <div className="history-detail-state history-detail-empty">这篇笔记暂时没有 Markdown 内容。</div>;
  }
  return null;
}

function DocumentIcon() {
  return <svg viewBox="0 0 24 24"><path d="M6 3h8l4 4v14H6z" /><path d="M14 3v5h5M9 12h6M9 16h6" /></svg>;
}
