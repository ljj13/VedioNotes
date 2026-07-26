/**
 *应用组件——ResultPanel 页面/功能对应的 React UI 组件。
 */

import { useState } from 'react';
import { save } from '@tauri-apps/plugin-dialog';
import { convertFileSrc } from '@tauri-apps/api/core';
import { copyMarkdownResult } from '../lib/bridge';
import type { AppError, Distillation } from '../lib/types';

interface Props {
  distillation: Distillation;
  savedPath: string | null;
  onSavedPathChanged: (path: string) => void;
}

/** ResultPanel */
export default function ResultPanel({
  distillation,
  savedPath,
  onSavedPathChanged,
}: Props) {
  const [savingAs, setSavingAs] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const handleSaveAs = async () => {
    if (!savedPath || savingAs) return;
    setSaveError(null);
    setSavingAs(true);
    try {
      const destination = await save({
        defaultPath: savedPath,
        filters: [{ name: 'Markdown', extensions: ['md'] }],
      });
      if (!destination) return;

      const copiedPath = await copyMarkdownResult(savedPath, destination);
      onSavedPathChanged(copiedPath);
    } catch (reason) {
      const error = reason as Partial<AppError> | Error | null;
      setSaveError(error?.message || '无法复制 Markdown 文件。');
    } finally {
      setSavingAs(false);
    }
  };

  return (
    <div className="result-panel">
      {/* Core conclusion */}
      <section className="result-section" id="result-conclusion">
        <h2 className="section-title">核心结论</h2>
        <p className="section-content">{distillation.core_conclusion}</p>
      </section>

      {/* Key evidence */}
      <section className="result-section" id="result-evidence">
        <h2 className="section-title">关键依据</h2>
        <ul className="evidence-list">
          {distillation.key_evidence.map((item, i) => (
            <li key={i} className="evidence-item"><span>{item.text}</span>{item.timestamp_seconds !== undefined && <Timestamp sourceUrl={item.source_url} seconds={item.timestamp_seconds} />}{item.source_url && <a href={item.source_url} className="evidence-source">来源</a>}{item.screenshot_path && <img src={convertFileSrc(item.screenshot_path)} alt={`${item.text} 截图`} className="evidence-thumbnail" />}</li>
          ))}
        </ul>
      </section>

      {/* Implications */}
      <section className="result-section" id="result-actions">
        <h2 className="section-title">启示/行动</h2>
        <ul className="implications-list">
          {distillation.implications.map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ul>
      </section>

      {/* Transcript (collapsible) */}
      {distillation.transcript && (
        <details className="transcript-details" id="result-transcript">
          <summary>完整转写</summary>
          <pre className="transcript-content">{distillation.transcript}</pre>
        </details>
      )}

      {/* Saved path */}
      {savedPath && (
        <div className="saved-info">
          <span className="saved-status"><CheckIcon />已保存为 Markdown 文件</span>
          <code className="file-path">{savedPath}</code>
          <button
            className="save-as-button"
            type="button"
            onClick={handleSaveAs}
            disabled={savingAs}
          >
            {savingAs ? '正在保存...' : '另存为'}
          </button>
          {saveError && <span role="alert" className="save-as-error">{saveError}</span>}
        </div>
      )}
    </div>
  );
}

/** CheckIcon */
function CheckIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6" /></svg>;
}

/** formatTimestamp */
function formatTimestamp(seconds: number): string { return `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${Math.floor(seconds % 60).toString().padStart(2, '0')}`; }

/** Timestamp */
function Timestamp({ sourceUrl, seconds }: { sourceUrl?: string; seconds: number }) {
  const href = timestampUrl(sourceUrl, seconds);
  return href ? <a href={href} className="evidence-time">{formatTimestamp(seconds)}</a> : <span className="evidence-time">{formatTimestamp(seconds)}</span>;
}

/** timestampUrl */
function timestampUrl(sourceUrl: string | undefined, seconds: number): string | null {
  if (!sourceUrl) return null;
  try {
    const url = new URL(sourceUrl);
    const host = url.hostname.toLowerCase();
    const isBilibili = host === 'bilibili.com' || host.endsWith('.bilibili.com') || host === 'b23.tv';
    const isYouTube = host === 'youtube.com' || host.endsWith('.youtube.com') || host === 'youtu.be';
    if (!isBilibili && !isYouTube) return null;
    url.searchParams.set('t', isYouTube ? `${seconds}s` : String(seconds));
    return url.toString();
  } catch { return null; }
}
