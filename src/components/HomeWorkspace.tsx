/**
 *"首页"组件——应用打开后的主页面。
 * * 显示概览信息（笔记数、任务数、最近的笔记和任务），并提供快速操作入口。
 */

import type { CSSProperties } from 'react';
import type { HistoryEntry } from '../lib/types';

type Props = {
  noteCount: number;
  readyLocalModelCount: number;
  recentNotes: HistoryEntry[];
  serviceReady: boolean;
  serviceDetail: string;
  onCreate: () => void;
  onOpenLibrary: () => void;
  onOpenTasks: () => void;
};

/** ArrowIcon */
function ArrowIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6" /></svg>;
}

/** HomeWorkspace */
export default function HomeWorkspace({
  noteCount,
  readyLocalModelCount,
  recentNotes,
  serviceReady,
  serviceDetail,
  onCreate,
  onOpenLibrary,
  onOpenTasks,
}: Props) {
  return (
    <section className="home-workspace" aria-labelledby="home-title">
      <div className="home-hero">
        <div className="home-hero-copy">
          <span className="workspace-eyebrow">LOCAL AI WORKBENCH</span>
          <h1 id="home-title">把视频变成可回查的知识</h1>
          <p>从公开链接或本地媒体开始，优先获取字幕，再使用本地或在线服务生成结构化笔记。</p>
          <div className="home-actions">
            <button type="button" className="home-primary-action" onClick={onCreate}>新建提炼 <ArrowIcon /></button>
            <button type="button" className="home-secondary-action" onClick={onOpenLibrary}>打开笔记库</button>
          </div>
        </div>
        <aside className="home-status-card home-hero-visual" aria-label="工作区概览">
          <div className="home-visual-stage" aria-hidden="true">
            <span className="home-video-glyph"><PlayIcon /></span>
            <div className="home-waveform">
              {[18, 31, 24, 46, 38, 58, 29, 51, 35, 42, 22, 34].map((height, index) => (
                <span key={`${height}-${index}`} style={{ '--wave-height': `${height}px` } as CSSProperties} />
              ))}
            </div>
            <span className="home-note-sheet"><i /><i /><i /></span>
          </div>
          <div className="home-service-summary">
            <div className="home-status-head"><span>本地工作区</span><span className={serviceReady ? 'home-ready-chip is-ready' : 'home-ready-chip'}>{serviceReady ? '服务正常' : '需要配置'}</span></div>
            <div className="home-metrics">
              <div><strong>{noteCount}</strong><span>篇笔记</span><small>已累计提炼</small></div>
              <div><strong>{readyLocalModelCount}</strong><span>个模型</span><small>本地已就绪</small></div>
            </div>
            <p className="home-service-detail">{serviceDetail}</p>
          </div>
        </aside>
      </div>

      <div className="home-quick-grid" aria-label="快捷入口">
        <button type="button" className="home-quick-card" onClick={onCreate}>
          <span className="home-quick-icon" aria-hidden="true"><CreateIcon /></span><strong>链接或文件提炼</strong><small>识别平台、字幕优先、本地转写兜底</small><ArrowIcon />
        </button>
        <button type="button" className="home-quick-card" onClick={onOpenLibrary}>
          <span className="home-quick-icon" aria-hidden="true"><LibraryIcon /></span><strong>继续阅读</strong><small>打开最近笔记并继续同篇问答</small><ArrowIcon />
        </button>
        <button type="button" className="home-quick-card" onClick={onOpenTasks} aria-label="查看历史任务">
          <span className="home-quick-icon" aria-hidden="true"><HistoryIcon /></span><strong>历史任务</strong><small>查看状态、耗时、引擎和诊断记录</small><ArrowIcon />
        </button>
      </div>

      <section className="home-recent" aria-labelledby="home-recent-title">
        <header><div><span className="workspace-eyebrow">RECENT</span><h2 id="home-recent-title">最近笔记</h2></div><button type="button" onClick={onOpenLibrary}>查看全部 <ArrowIcon /></button></header>
        {recentNotes.length > 0 ? (
          <div className="home-recent-list">
            {recentNotes.slice(0, 3).map((note) => (
              <button type="button" key={note.id} onClick={onOpenLibrary}>
                <span><strong>{note.title}</strong><small>{note.source}</small></span>
                <time dateTime={note.createdAt}>{new Date(note.createdAt).toLocaleDateString('zh-CN')}</time>
              </button>
            ))}
          </div>
        ) : (
          <div className="home-empty"><strong>还没有历史笔记</strong><span>完成第一次视频提炼后，最近笔记会显示在这里。</span></div>
        )}
      </section>
    </section>
  );
}

/** CreateIcon */
function CreateIcon() {
  return <svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" /></svg>;
}

/** LibraryIcon */
function LibraryIcon() {
  return <svg viewBox="0 0 24 24"><path d="M6 4h11a2 2 0 0 1 2 2v14H8a3 3 0 0 1-3-3V5a1 1 0 0 1 1-1Z" /><path d="M8 16h11" /></svg>;
}

/** HistoryIcon */
function HistoryIcon() {
  return <svg viewBox="0 0 24 24"><path d="M4 12a8 8 0 1 0 2.4-5.7L4 8.7" /><path d="M4 4v4.7h4.7M12 8v5l3 2" /></svg>;
}

/** PlayIcon */
function PlayIcon() {
  return <svg viewBox="0 0 24 24"><path d="m9 7 8 5-8 5z" /></svg>;
}
