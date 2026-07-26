/**
 *"AI 问答"页面组件——允许用户对已选中的笔记向 AI 提问。
 * * 问答限定在选中的那篇笔记范围内，AI 只能基于笔记内容回答。
 */

import { useEffect, useRef, useState } from 'react';
import type { CapabilityStatus, LibraryEntry, NoteChatTurn, WebSearchResult } from '../lib/types';
import { askHistoryNote, getCapabilityStatus, searchLibrary, webSearch } from '../lib/bridge';
import { isSafeMarkdownUrl } from './SafeMarkdown';

/** QaWorkspace */
export default function QaWorkspace() {
  const [query, setQuery] = useState('');
  const [entries, setEntries] = useState<LibraryEntry[]>([]);
  const [selected, setSelected] = useState<LibraryEntry | null>(null);
  const [question, setQuestion] = useState('');
  const [turns, setTurns] = useState<NoteChatTurn[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [capabilityStatus, setCapabilityStatus] = useState<CapabilityStatus | null>(null);
  const [webResults, setWebResults] = useState<WebSearchResult[]>([]);
  const [webSearching, setWebSearching] = useState(false);
  const [webError, setWebError] = useState<string | null>(null);
  const requestSequence = useRef(0);

  useEffect(() => {
    const timer = window.setTimeout(async () => {
      const sequence = ++requestSequence.current;
      try {
        const snapshot = await searchLibrary({ text: query.trim(), sort: 'recently_opened', limit: 100, offset: 0 });
        if (sequence === requestSequence.current) setEntries(snapshot.entries);
      } catch {
        if (sequence === requestSequence.current) setError('暂时无法读取笔记库。');
      }
    }, 220);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    let active = true;
    void getCapabilityStatus().then((next) => { if (active) setCapabilityStatus(next); }).catch(() => { if (active) setCapabilityStatus(null); });
    return () => { active = false; };
  }, []);

  const selectEntry = (entry: LibraryEntry) => {
    setSelected(entry);
    setTurns([]);
    setQuestion('');
    setError(null);
    setWebResults([]);
    setWebError(null);
  };

  const searchWeb = async () => {
    if (!question.trim() || webSearching) return;
    setWebSearching(true);
    setWebError(null);
    try { setWebResults(await webSearch(question.trim())); }
    catch { setWebError('联网检索失败，请检查联网服务配置后重试。'); }
    finally { setWebSearching(false); }
  };

  const webReady = Boolean(capabilityStatus?.webSearch.enabled && capabilityStatus.webSearch.configured && capabilityStatus.webSearch.credentialReady);

  const send = async () => {
    if (!selected || !question.trim() || sending) return;
    setSending(true);
    setError(null);
    try {
      setTurns(await askHistoryNote(selected.id, question.trim()));
      setQuestion('');
    } catch {
      setError('本次问答失败，请检查总结服务后重试。');
    } finally {
      setSending(false);
    }
  };

  return <section className="qa-workspace" aria-label="AI 问答工作区">
    <header className="workspace-page-header"><div><span className="workspace-eyebrow">NOTE Q&amp;A</span><h1>AI 问答</h1><p>回答始终限定在你明确选择的同一篇笔记内。</p></div></header>
    <div className="qa-layout">
      <aside className="qa-note-picker" aria-label="选择问答笔记">
        <label><span className="sr-only">搜索问答笔记</span><input value={query} onChange={(event) => setQuery(event.target.value)} aria-label="搜索问答笔记" placeholder="搜索笔记" /></label>
        <div className="qa-note-list">{entries.map((entry) => <button type="button" key={entry.id} className={selected?.id === entry.id ? 'selected' : ''} aria-label={`选择笔记 ${entry.title}`} onClick={() => selectEntry(entry)}><strong>{entry.title}</strong><span>{entry.createdAt}</span></button>)}</div>
      </aside>
      <main className="qa-conversation" aria-label="问答对话">
        {!selected ? <div className="qa-empty"><strong>先选择一篇笔记</strong><span>只会把所选笔记的正文和转写作为问答依据。</span></div> : <>
          <header><span className="workspace-eyebrow">CURRENT NOTE</span><h2>{selected.title}</h2></header>
          <div className="qa-turns" aria-live="polite">{turns.length === 0 ? <div className="qa-empty"><strong>可以开始提问</strong><span>例如：核心结论是什么？有哪些关键证据？</span></div> : turns.map((turn, index) => <article key={`${turn.role}-${index}`} className={`qa-turn ${turn.role}`}><strong>{turn.role === 'user' ? '你' : '笔记助手'}</strong><p>{turn.content}</p></article>)}</div>
          {webResults.length > 0 && <section className="qa-web-results" aria-label="联网检索结果"><div className="qa-web-results-heading"><strong>联网检索结果</strong><span>这些来源与同篇笔记回答分开显示</span></div>{webResults.map((result) => <article key={`${result.url}-${result.title}`}>{isSafeMarkdownUrl(result.url) ? <a href={result.url} target="_blank" rel="noreferrer noopener">{result.title}</a> : <strong>{result.title}</strong>}<p>{result.snippet}</p></article>)}</section>}
          {error && <p className="qa-error" role="alert">{error}</p>}
          {webError && <p className="qa-error" role="alert">{webError}</p>}
          <form className="qa-composer" aria-label="提问编辑器" onSubmit={(event) => { event.preventDefault(); void send(); }}><label><span className="sr-only">向所选笔记提问</span><textarea aria-label="向所选笔记提问" value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="向这篇笔记提问…" /></label><div className="qa-composer-actions"><button type="button" className="secondary-action" disabled={!question.trim() || !webReady || webSearching} title={webReady ? '从已配置的联网服务获取带来源结果' : '请先在设置的 AI 接入中启用并配置联网服务'} onClick={() => void searchWeb()}>{webSearching ? '检索中…' : '联网检索'}</button><button type="submit" disabled={!question.trim() || sending}>{sending ? '发送中…' : '发送问题'}</button></div></form>
          {!webReady && <p className="qa-capability-hint">联网检索未就绪；默认问答仍只使用当前笔记。</p>}
        </>}
      </main>
    </div>
  </section>;
}
