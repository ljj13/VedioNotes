/**
 *笔记库页面组件——管理笔记收藏、标签、搜索。
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { CapabilityStatus, LibraryEntry, LibraryQuery, LibrarySnapshot, SearchHit } from '../lib/types';
import {
  deleteHistory,
  getCapabilityStatus,
  getHistoryMarkdown,
  indexNote,
  markNoteOpened,
  runLocalAgent,
  searchLibrary,
  semanticSearch,
  setNoteFavorite,
  setNoteTags,
} from '../lib/bridge';
import { noteStyleLabel } from '../lib/noteStyles';
import NoteChatDrawer from './NoteChatDrawer';
import SafeMarkdown, { isSafeMarkdownUrl } from './SafeMarkdown';

type MarkdownState =
  | { status: 'idle' | 'loading' }
  | { status: 'ready'; content: string }
  | { status: 'error'; message: string };

const EMPTY_SNAPSHOT: LibrarySnapshot = { entries: [], tags: [], total: 0 };

/** LibraryWorkspace */
export default function LibraryWorkspace({ initialSelectedId = null }: { initialSelectedId?: number | null }) {
  const [snapshot, setSnapshot] = useState<LibrarySnapshot>(EMPTY_SNAPSHOT);
  const [query, setQuery] = useState('');
  const [favoriteOnly, setFavoriteOnly] = useState(false);
  const [tag, setTag] = useState<string | null>(null);
  const [selected, setSelected] = useState<LibraryEntry | null>(null);
  const [markdown, setMarkdown] = useState<MarkdownState>({ status: 'idle' });
  const [chatOpen, setChatOpen] = useState(false);
  const [tagDraft, setTagDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [capabilityStatus, setCapabilityStatus] = useState<CapabilityStatus | null>(null);
  const [semanticResults, setSemanticResults] = useState<SearchHit[]>([]);
  const [semanticBusy, setSemanticBusy] = useState(false);
  const [capabilityMessage, setCapabilityMessage] = useState<string | null>(null);
  const [agentAnswer, setAgentAnswer] = useState<string | null>(null);
  const searchSequence = useRef(0);
  const markdownSequence = useRef(0);

  const runSearch = useCallback(async (nextQuery: LibraryQuery) => {
    const sequence = ++searchSequence.current;
    setLoading(true);
    try {
      const result = await searchLibrary(nextQuery);
      if (sequence !== searchSequence.current) return;
      if (!result || !Array.isArray(result.entries) || !Array.isArray(result.tags)) throw new Error('invalid library snapshot');
      setSnapshot(result);
      setError(null);
      setSelected((current) => current ? result.entries.find((entry) => entry.id === current.id) ?? current : null);
    } catch {
      if (sequence === searchSequence.current) setError('笔记库暂时无法读取，请稍后重试。');
    } finally {
      if (sequence === searchSequence.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void runSearch({ text: query.trim(), favorite: favoriteOnly ? true : null, tag, sort: 'newest', limit: 100, offset: 0 });
    }, 220);
    return () => window.clearTimeout(timer);
  }, [favoriteOnly, query, runSearch, tag]);

  useEffect(() => {
    let active = true;
    void getCapabilityStatus().then((next) => { if (active) setCapabilityStatus(next); }).catch(() => { if (active) setCapabilityStatus(null); });
    return () => { active = false; };
  }, []);

  const openEntry = useCallback(async (entry: LibraryEntry) => {
    const sequence = ++markdownSequence.current;
    setSelected(entry);
    setChatOpen(false);
    setTagDraft(entry.tags.join('，'));
    setMarkdown({ status: 'loading' });
    setCapabilityMessage(null);
    setAgentAnswer(null);
    try {
      const [content, opened] = await Promise.all([
        getHistoryMarkdown(entry.id),
        markNoteOpened(entry.id),
      ]);
      if (sequence !== markdownSequence.current) return;
      setSelected(opened);
      setTagDraft(opened.tags.join('，'));
      setMarkdown({ status: 'ready', content });
    } catch {
      if (sequence === markdownSequence.current) setMarkdown({ status: 'error', message: '历史笔记文件不可读取。' });
    }
  }, []);

  useEffect(() => {
    if (!initialSelectedId || selected?.id === initialSelectedId) return;
    const candidate = snapshot.entries.find((entry) => entry.id === initialSelectedId);
    if (candidate) void openEntry(candidate);
  }, [initialSelectedId, openEntry, selected?.id, snapshot.entries]);

  const toggleFavorite = async () => {
    if (!selected) return;
    const updated = await setNoteFavorite(selected.id, !selected.favorite);
    setSelected(updated);
    setSnapshot((current) => ({ ...current, entries: current.entries.map((entry) => entry.id === updated.id ? updated : entry) }));
  };

  const runSemanticSearch = async () => {
    if (!query.trim() || semanticBusy) return;
    setSemanticBusy(true);
    setCapabilityMessage(null);
    try { setSemanticResults(await semanticSearch(query.trim(), 20)); }
    catch { setCapabilityMessage('语义检索失败，请检查向量与重排配置。'); }
    finally { setSemanticBusy(false); }
  };

  const rebuildIndex = async () => {
    if (!selected || markdown.status !== 'ready' || !markdown.content) return;
    setCapabilityMessage(null);
    try { await indexNote(String(selected.id), markdown.content); setCapabilityMessage('当前笔记的向量索引已更新。'); }
    catch { setCapabilityMessage('向量索引更新失败，请检查向量配置。'); }
  };

  const sendToAgent = async () => {
    if (!selected || markdown.status !== 'ready' || !markdown.content) return;
    setCapabilityMessage(null);
    setAgentAnswer(null);
    try {
      const result = await runLocalAgent(`请处理下面这篇笔记，并给出可执行建议。\n\n标题：${selected.title}\n\n${markdown.content}`);
      setAgentAnswer(result.answer);
    } catch { setCapabilityMessage('本地智能体执行失败，请检查可执行文件和参数配置。'); }
  };

  const vectorReady = Boolean(capabilityStatus?.vector.enabled && capabilityStatus.vector.configured && capabilityStatus.vector.credentialReady);
  const agentReady = Boolean(capabilityStatus?.localAgent.enabled && capabilityStatus.localAgent.configured);

  const saveTags = async () => {
    if (!selected) return;
    const tags = tagDraft.split(/[，,]/).map((value) => value.trim()).filter(Boolean);
    const updated = await setNoteTags(selected.id, tags);
    setSelected(updated);
    setTagDraft(updated.tags.join('，'));
    await runSearch({ text: query.trim(), favorite: favoriteOnly ? true : null, tag, sort: 'newest', limit: 100, offset: 0 });
  };

  const removeEntry = async (entry: LibraryEntry) => {
    if (confirmDeleteId !== entry.id) {
      setConfirmDeleteId(entry.id);
      return;
    }
    await deleteHistory(entry.id);
    setConfirmDeleteId(null);
    if (selected?.id === entry.id) {
      setSelected(null);
      setMarkdown({ status: 'idle' });
      setChatOpen(false);
    }
    await runSearch({ text: query.trim(), favorite: favoriteOnly ? true : null, tag, sort: 'newest', limit: 100, offset: 0 });
  };

  return (
    <section className="library-workspace" aria-label="笔记库工作区">
      <header className="workspace-page-header">
        <div><span className="workspace-eyebrow">LIBRARY</span><h1>笔记库</h1><p>检索、收藏、整理并继续追问已保存的结构化笔记。</p></div>
        <span className="workspace-count">{snapshot.total} 篇笔记</span>
      </header>
      <div className={`library-layout ${chatOpen ? 'with-chat' : ''}`}>
        <nav className="library-sources" aria-label="笔记分类">
          <div className="library-column-heading"><span className="workspace-eyebrow">FILTERS</span><strong>笔记分类</strong></div>
          <label className="library-search"><span className="sr-only">搜索笔记</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索笔记" aria-label="搜索笔记" /></label>
          <div className="library-search-tools"><button type="button" className="secondary-action" disabled={!query.trim() || !vectorReady || semanticBusy} title={vectorReady ? '使用已配置的向量/重排能力检索' : '请先在 AI 接入中配置向量能力'} onClick={() => void runSemanticSearch()}>{semanticBusy ? '检索中…' : '语义检索'}</button><span>{vectorReady ? '向量检索已就绪' : '当前使用关键词检索'}</span></div>
          {semanticResults.length > 0 && <section className="library-semantic-results" aria-label="语义检索结果"><strong>语义命中</strong>{semanticResults.map((hit) => <article key={hit.id}><span>{Math.round(hit.score * 100)}%</span><p>{hit.text}</p></article>)}</section>}
          <div className="library-filter-row" aria-label="笔记范围">
            <button type="button" className={!favoriteOnly ? 'active' : ''} aria-pressed={!favoriteOnly} onClick={() => setFavoriteOnly(false)}>全部</button>
            <button type="button" className={favoriteOnly ? 'active' : ''} aria-pressed={favoriteOnly} onClick={() => setFavoriteOnly(true)}>已收藏</button>
          </div>
          {snapshot.tags.length > 0 && <div className="library-tags" aria-label="标签筛选">
            <button type="button" className={tag === null ? 'active' : ''} onClick={() => setTag(null)}>全部标签</button>
            {snapshot.tags.map((item) => <button type="button" key={item.id} className={tag === item.name ? 'active' : ''} onClick={() => setTag(item.name)}>{item.name}<span>{item.noteCount}</span></button>)}
          </div>}
        </nav>
        <aside className="library-browser" aria-label="笔记列表">
          <div className="library-column-heading"><span className="workspace-eyebrow">NOTES</span><strong>笔记列表</strong><small>{snapshot.entries.length} 项</small></div>
          <div className="library-entry-list" aria-live="polite">
            {loading && <p className="library-state">正在读取笔记…</p>}
            {!loading && error && <p className="library-state is-error" role="alert">{error}</p>}
            {!loading && !error && snapshot.entries.length === 0 && <p className="library-state">没有符合条件的笔记。</p>}
            {!loading && snapshot.entries.map((entry) => <article key={entry.id} className={`library-entry ${selected?.id === entry.id ? 'selected' : ''}`}>
              <button type="button" className="library-entry-open" aria-label={`打开笔记 ${entry.title}`} onClick={() => void openEntry(entry)}>
                <strong>{entry.favorite ? '★ ' : ''}{entry.title}</strong><span>{entry.createdAt}</span>
                {entry.tags.length > 0 && <small>{entry.tags.join(' · ')}</small>}
              </button>
              <button type="button" className="library-entry-delete" aria-label={confirmDeleteId === entry.id ? `确认删除 ${entry.title}` : `删除 ${entry.title}`} onClick={() => void removeEntry(entry)}>{confirmDeleteId === entry.id ? '确认' : '删除'}</button>
            </article>)}
          </div>
        </aside>
        <main className="library-note" aria-label="笔记正文">
          {!selected && <div className="library-empty"><strong>选择一篇笔记</strong><span>正文会在这里按 Markdown 格式安全渲染。</span></div>}
          {selected && <>
            <header className="library-note-header">
              <div><span className="workspace-eyebrow">NOTE DETAIL</span><h2>{selected.title}</h2><p>{noteStyleLabel(selected.noteStyle)} · {selected.createdAt}</p></div>
              <div className="library-note-actions">
                <button type="button" aria-pressed={selected.favorite} onClick={() => void toggleFavorite()}>{selected.favorite ? '取消收藏' : '收藏'}</button>
                <button type="button" onClick={() => setChatOpen(true)}>向笔记提问</button>
                <button type="button" disabled={!vectorReady || markdown.status !== 'ready' || !markdown.content} onClick={() => void rebuildIndex()}>建立向量索引</button>
                <button type="button" disabled={!agentReady || markdown.status !== 'ready' || !markdown.content} onClick={() => void sendToAgent()}>发送到本地智能体</button>
                {isSafeMarkdownUrl(selected.source) && <a href={selected.source} target="_blank" rel="noreferrer noopener">原视频</a>}
              </div>
            </header>
            <div className="library-tag-editor">
              <label>标签<input value={tagDraft} onChange={(event) => setTagDraft(event.target.value)} placeholder="用逗号分隔标签" /></label>
              <button type="button" onClick={() => void saveTags()}>保存标签</button>
            </div>
            {markdown.status === 'loading' && <div className="library-markdown-state" role="status">正在读取 Markdown…</div>}
            {markdown.status === 'error' && <div className="library-markdown-state is-error" role="alert">{markdown.message}<button type="button" onClick={() => void openEntry(selected)}>重新读取</button></div>}
            {markdown.status === 'ready' && (markdown.content ? <SafeMarkdown content={markdown.content} /> : <div className="library-markdown-state">这篇笔记没有 Markdown 内容。</div>)}
            {capabilityMessage && <div className="library-capability-message" role="status">{capabilityMessage}</div>}
            {agentAnswer && <section className="library-agent-answer" aria-label="本地智能体结果"><strong>本地智能体结果</strong><p>{agentAnswer}</p></section>}
          </>}
        </main>
        <aside className="library-inspector" aria-label="笔记信息">
          <div className="library-column-heading"><span className="workspace-eyebrow">INFO</span><strong>笔记信息</strong></div>
          {!selected ? <div className="library-inspector-empty">选择笔记后查看来源、风格与标签。</div> : <>
            <div className="library-inspector-title"><span aria-hidden="true">N</span><div><strong>{selected.title}</strong><small>{noteStyleLabel(selected.noteStyle)}</small></div></div>
            <dl className="library-meta-list">
              <div><dt>创建时间</dt><dd>{selected.createdAt}</dd></div>
              <div><dt>来源</dt><dd>{selected.source}</dd></div>
              <div><dt>模板</dt><dd>{selected.noteTemplate}</dd></div>
            </dl>
            <section className="library-inspector-tags" aria-label="当前笔记标签">
              <strong>标签</strong>
              <div>{selected.tags.length > 0 ? selected.tags.map((item) => <span key={item}>{item}</span>) : <small>暂无标签</small>}</div>
            </section>
          </>}
        </aside>
        {selected && chatOpen && <NoteChatDrawer entry={selected} onClose={() => setChatOpen(false)} />}
      </div>
    </section>
  );
}
