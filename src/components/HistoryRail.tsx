/**
 *历史记录侧栏——在笔记库左侧显示历史笔记列表。
 */

import { useEffect, useState } from 'react';
import type { HistoryEntry } from '../lib/types';
import { deleteHistory, listHistory, searchHistory } from '../lib/bridge';

interface Props { selectedId: number | null; onSelect: (entry: HistoryEntry) => void; }

/** HistoryRail */
export default function HistoryRail({ selectedId, onSelect }: Props) {
  const [open, setOpen] = useState(true); const [query, setQuery] = useState('');
  const [entries, setEntries] = useState<HistoryEntry[]>([]); const [confirmId, setConfirmId] = useState<number | null>(null);
  const reload = async (term = query) => {
    try {
      const result = term.trim() ? await searchHistory(term.trim()) : await listHistory();
      setEntries(Array.isArray(result) ? result : []);
    } catch {
      setEntries([]);
    }
  };
  useEffect(() => { void reload(''); }, []);
  const updateQuery = (value: string) => { setQuery(value); void reload(value); };
  const confirmDelete = async (entry: HistoryEntry) => { if (confirmId !== entry.id) { setConfirmId(entry.id); return; } await deleteHistory(entry.id); setConfirmId(null); await reload(); };
  return <aside className={`history-rail ${open ? '' : 'collapsed'}`} aria-label="历史笔记">
    <button type="button" className="rail-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? '收起历史' : '展开历史'}</button>
    {open && <><label className="sr-only" htmlFor="history-search">搜索历史</label><input id="history-search" aria-label="搜索历史" value={query} onChange={(e) => updateQuery(e.target.value)} placeholder="搜索笔记" />
      <div className="history-list">{entries.map((entry) => <div key={entry.id} className={`history-row ${selectedId === entry.id ? 'selected' : ''}`}>
        <button type="button" className="history-select" onClick={() => onSelect(entry)}><strong>{entry.title}</strong><span>{entry.createdAt}</span></button>
        <button type="button" className="history-delete" aria-label={confirmId === entry.id ? `确认删除 ${entry.title}` : `删除 ${entry.title}`} onClick={() => void confirmDelete(entry)}>{confirmId === entry.id ? '再次确认删除' : '删除'}</button>
      </div>)}</div></>}
  </aside>;
}
