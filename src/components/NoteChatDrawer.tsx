/**
 *应用组件——NoteChatDrawer 页面/功能对应的 React UI 组件。
 */

import { useEffect, useRef, useState } from 'react';
import type { HistoryEntry, NoteChatTurn } from '../lib/types';
import { askHistoryNote } from '../lib/bridge';

/** NoteChatDrawer */
export default function NoteChatDrawer({ entry, onClose }: { entry: HistoryEntry; onClose: () => void }) {
  const [turns, setTurns] = useState<NoteChatTurn[]>([]); const [question, setQuestion] = useState(''); const [sending, setSending] = useState(false);
  const drawerRef = useRef<HTMLElement>(null);
  const questionRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    questionRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !drawerRef.current) return;
      const focusable = Array.from(drawerRef.current.querySelectorAll<HTMLElement>('button:not(:disabled), textarea:not(:disabled), input:not(:disabled), a[href]'));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);
  const send = async () => { if (!question.trim() || sending) return; setSending(true); try { setTurns(await askHistoryNote(entry.id, question.trim())); setQuestion(''); } finally { setSending(false); } };
  return <aside ref={drawerRef} className="note-chat-drawer" aria-label="笔记问答" role="complementary"><header><div><span className="workspace-eyebrow">NOTE Q&amp;A</span><strong>{entry.title}</strong></div><button className="chat-close-button" type="button" aria-label="关闭笔记问答" onClick={onClose}><CloseIcon /></button></header><div className="chat-turns">{turns.length ? turns.map((turn, index) => <p key={index} className={`chat-${turn.role}`}><b>{turn.role === 'user' ? '你' : '笔记'}：</b>{turn.content}</p>) : <div className="chat-empty"><strong>只基于这篇笔记回答</strong><span>输入问题，快速回查结论与依据。</span></div>}</div><label className="sr-only" htmlFor="note-question">向此笔记提问</label><textarea ref={questionRef} id="note-question" aria-label="向此笔记提问" value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="向这篇笔记提问…" /><button className="chat-send-button" type="button" onClick={() => void send()} disabled={sending || !question.trim()}>{sending ? '发送中...' : '发送问题'}</button></aside>;
}

/** CloseIcon */
function CloseIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 7 10 10M17 7 7 17" /></svg>;
}
