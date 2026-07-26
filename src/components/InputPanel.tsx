/**
 *视频链接输入面板——用户在这里粘贴 B站/抖音/YouTube 链接或选择本地文件。
 * * 这是"新建提炼"流程的第一步。
 */

import { useCallback, useEffect, useState } from 'react';
import type { InputSource, InputSourceKind, NoteStyle, SenseVoiceLanguage, SenseVoiceModelId, TaskOptions, TaskRetryRequest, TranscriptionMode } from '../lib/types';
import { NOTE_STYLE_OPTIONS } from '../lib/noteStyles';
import { useCreateWorkspaceAction } from './CreateWorkspace';
import {
  openLocalMedia,
  classifyLocalMedia,
  subscribeToMediaDrop,
  type LocalMediaSelection,
} from '../lib/localMedia';

interface InputPanelProps {
  onStart: (source: InputSource, options: TaskOptions) => void;
  onOpenSettings: () => void;
  disabled: boolean;
  readyToStart: boolean;
  localModelUnready?: boolean;
  senseVoiceUnready?: boolean;
  transcriptionCredentialUnready?: boolean;
  summaryCredentialUnready?: boolean;
  initialDraft?: TaskRetryRequest | null;
  transcriptionMode?: TranscriptionMode;
  senseVoiceModel?: SenseVoiceModelId;
  senseVoiceLanguages?: SenseVoiceLanguage[];
}

/** InputPanel */
export default function InputPanel({
  onStart,
  onOpenSettings,
  disabled,
  readyToStart,
  localModelUnready = false,
  senseVoiceUnready = false,
  transcriptionCredentialUnready = false,
  summaryCredentialUnready = false,
  initialDraft = null,
  transcriptionMode = 'online_profile',
  senseVoiceModel = 'int8',
  senseVoiceLanguages = ['zh'],
}: InputPanelProps) {
  const registerWorkspaceAction = useCreateWorkspaceAction();
  const [inputMode, setInputMode] = useState<'link' | 'file'>('link');
  const [dragOver, setDragOver] = useState(false);
  const [url, setUrl] = useState('');
  const [selectedMedia, setSelectedMedia] = useState<LocalMediaSelection | null>(null);
  const [selectedFileKind, setSelectedFileKind] = useState<InputSourceKind | null>(null);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [includeScreenshots, setIncludeScreenshots] = useState(false);
  const [noteStyle, setNoteStyle] = useState<NoteStyle>('minimal');

  useEffect(() => {
    if (!initialDraft) return;
    setIncludeScreenshots(initialDraft.options.include_screenshots);
    setNoteStyle(initialDraft.options.note_style);
    if (initialDraft.source.kind === 'file' && initialDraft.source.path) {
      const media = classifyLocalMedia(initialDraft.source.path);
      if (media) selectMedia(media);
      return;
    }
    if (initialDraft.source.url) {
      setInputMode('link');
      setUrl(initialDraft.source.url);
      setSelectedMedia(null);
      setSelectedFileKind(null);
      setMediaError(null);
    }
  }, [initialDraft]);

  const selectMedia = (media: LocalMediaSelection) => {
    // Native drops may arrive while the link tab is active.  Reveal the
    // selected file immediately so the user can review and start it.
    setInputMode('file');
    setSelectedMedia(media);
    setSelectedFileKind('file');
    setMediaError(null);
  };

  useEffect(() => {
    let disposed = false;
    let cleanup: (() => void) | undefined;
    subscribeToMediaDrop((state) => {
      if (disposed) return;
      if (state.type === 'over') setDragOver(true);
      if (state.type === 'leave') setDragOver(false);
      if (state.type === 'selected') {
        setDragOver(false);
        selectMedia(state.media);
      }
      if (state.type === 'error') {
        setDragOver(false);
        setMediaError(state.message);
      }
    }).then((unlisten) => {
      if (disposed) unlisten();
      else cleanup = unlisten;
    }).catch(() => setMediaError('无法启用文件拖放，请点击选择文件。'));
    return () => {
      disposed = true;
      cleanup?.();
    };
  }, []);

  const handleFileSelect = async () => {
    try {
      const media = await openLocalMedia();
      if (media) selectMedia(media);
    } catch {
      setMediaError('无法打开文件选择器，请重试。');
    }
  };

  const handleStart = useCallback(() => {
    const options: TaskOptions = {
      note_template: 'core_distillation',
      include_screenshots: includeScreenshots,
      note_style: noteStyle,
      transcription_mode: transcriptionMode,
      sensevoice_model: senseVoiceModel,
      sensevoice_languages: senseVoiceLanguages,
    };
    if (selectedFileKind === 'file' && selectedMedia) {
      onStart({ kind: 'file', path: selectedMedia.path }, options);
    } else if (url.trim()) {
      onStart({ kind: urlKind(url.trim()), url: url.trim() }, options);
    }
  }, [includeScreenshots, noteStyle, onStart, selectedFileKind, selectedMedia, senseVoiceLanguages, senseVoiceModel, transcriptionMode, url]);

  const canStart = (selectedFileKind === 'file' && selectedMedia !== null) || url.trim().length > 0;
  const recognizedPlatform = platformName(url);
  const readinessMessage = senseVoiceUnready
    ? '请先在设置中一键安装并启用 SenseVoice。'
    : localModelUnready
      ? '请先下载并选择本地 Whisper 模型。'
      : transcriptionCredentialUnready && summaryCredentialUnready
        ? '请先配置转写凭据和总结凭据。'
        : transcriptionCredentialUnready
          ? '请先配置转写凭据。'
          : summaryCredentialUnready
            ? '请先配置总结凭据。'
            : '正在检查转写和总结服务。';

  useEffect(() => {
    if (!registerWorkspaceAction) return;
    registerWorkspaceAction({
      label: disabled ? '处理中...' : '开始提炼',
      disabled: disabled || !canStart || !readyToStart,
      onActivate: handleStart,
    });
    return () => registerWorkspaceAction(null);
  }, [canStart, disabled, handleStart, readyToStart, registerWorkspaceAction]);

  return (
    <div className="input-panel" role="region" aria-label="视频来源">
      <header className="input-panel-header">
        <div>
          <h2>视频来源</h2>
          <p>公开链接优先尝试字幕，本地文件直接进入媒体处理流程。</p>
        </div>
        <div className="input-mode-tabs" role="tablist" aria-label="提炼方式">
          <button type="button" role="tab" aria-selected={inputMode === 'link'} className={inputMode === 'link' ? 'active' : ''} onClick={() => setInputMode('link')}>视频链接</button>
          <button type="button" role="tab" aria-selected={inputMode === 'file'} className={inputMode === 'file' ? 'active' : ''} onClick={() => setInputMode('file')}>本地文件</button>
        </div>
      </header>
      {!readyToStart && (
        <div className="settings-row">
          <div className="warning-banner" role="alert">
            {readinessMessage}
          </div>
          <button className="settings-button" onClick={() => onOpenSettings()} type="button">打开设置</button>
        </div>
      )}

      {inputMode === 'file' && <>
      <div
        className={`drop-zone ${dragOver ? 'drag-over' : ''}`}
        onClick={handleFileSelect}
        role="button"
        tabIndex={0}
        aria-label="拖放视频或音频文件，或点击选择"
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') void handleFileSelect(); }}
      >
        {selectedMedia ? (
          <div className="file-selected">
            <span className="file-icon" aria-hidden="true"><MediaIcon kind={selectedMedia.kind} /></span>
            <span className="media-kind">{selectedMedia.kind === 'audio' ? '音频' : '视频'}</span>
            <span>{selectedMedia.name}</span>
            <span className="media-path">{selectedMedia.path}</span>
          </div>
        ) : (
          <div className="drop-hint">
            <span className="drop-icon" aria-hidden="true"><MediaIcon kind="video" /></span>
            <p>拖放视频或音频到此处</p>
            <p className="sub-hint">或点击选择文件（视频 / 音频）</p>
          </div>
        )}
      </div>
      {mediaError && <div className="warning-banner" role="alert">{mediaError}</div>}
      </>}

      {inputMode === 'link' && <>
      <div className="url-section">
        <label htmlFor="video-url" className="input-label">
          视频链接
        </label>
        <div className="url-input-shell">
          <input
            id="video-url"
            type="text"
            className="url-input"
            placeholder="粘贴 Bilibili、YouTube 或抖音视频链接..."
            value={url}
            onChange={(e) => {
              setUrl(e.target.value);
              if (e.target.value) {
                setSelectedFileKind(urlKind(e.target.value));
              } else if (selectedMedia) {
                setSelectedFileKind('file');
              }
            }}
            disabled={disabled}
          />
          {url && <button type="button" className="clear-url-button" aria-label="清空视频链接" onClick={() => { setUrl(''); setSelectedFileKind(selectedMedia ? 'file' : null); }}><CloseIcon /></button>}
        </div>
        {recognizedPlatform && <div className="platform-hint" role="status"><span aria-hidden="true"><CheckIcon /></span>已识别 {recognizedPlatform} 链接</div>}
      </div>
      </>}

      <fieldset className="note-style-grid">
        <legend>笔记风格</legend>
        {NOTE_STYLE_OPTIONS.map((option) => (
          <label key={option.id} className={noteStyle === option.id ? 'note-style-card is-selected' : 'note-style-card'}>
            <input
              type="radio"
              name="note-style"
              value={option.id}
              checked={noteStyle === option.id}
              onChange={() => setNoteStyle(option.id)}
              disabled={disabled}
            />
            <strong>{option.label}</strong>
            <span>{option.description}</span>
          </label>
        ))}
      </fieldset>

      <div className="task-options-row">
        <label className="task-options-checkbox">
          <input
            type="checkbox"
            checked={includeScreenshots}
            onChange={(event) => setIncludeScreenshots(event.target.checked)}
            disabled={disabled}
          />
          关键截图
        </label>
        <span className="screenshot-hint">自动从重点章节选取关键画面</span>
      </div>

      <details className="advanced-options">
        <summary>高级选项</summary>
        <div>
          <p>转写引擎、总结服务、下载策略和自定义服务商统一在设置中心管理。</p>
          <button type="button" className="settings-button" onClick={() => onOpenSettings()}>打开处理设置</button>
        </div>
      </details>

      {!registerWorkspaceAction && (
        <button
          className="start-button"
          onClick={handleStart}
          disabled={disabled || !canStart || !readyToStart}
          type="button"
        >
          {disabled ? '处理中...' : '开始提炼'}
        </button>
      )}
    </div>
  );
}

/** urlKind */
function urlKind(url: string): InputSourceKind {
  const host = (() => { try { return new URL(url).hostname.toLowerCase(); } catch { return ''; } })();
  if (host.includes('bilibili.com') || host === 'b23.tv') return 'bilibili_url';
  if (host.includes('youtube.com') || host === 'youtu.be') return 'youtube_url';
  return 'douyin_url';
}

/** platformName */
function platformName(url: string): 'Bilibili' | 'YouTube' | '抖音' | null {
  const host = (() => { try { return new URL(url.trim()).hostname.toLowerCase(); } catch { return ''; } })();
  if (host === 'bilibili.com' || host.endsWith('.bilibili.com') || host === 'b23.tv') return 'Bilibili';
  if (host === 'youtube.com' || host.endsWith('.youtube.com') || host === 'youtu.be') return 'YouTube';
  if (host === 'douyin.com' || host.endsWith('.douyin.com') || host === 'iesdouyin.com' || host.endsWith('.iesdouyin.com')) return '抖音';
  return null;
}

/** MediaIcon */
function MediaIcon({ kind }: { kind: 'audio' | 'video' }) {
  return kind === 'audio'
    ? <svg viewBox="0 0 24 24"><path d="M9 18V5l10-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="16" cy="16" r="3" /></svg>
    : <svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="3" /><path d="m10 9 5 3-5 3z" /></svg>;
}

/** CloseIcon */
function CloseIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 7 10 10M17 7 7 17" /></svg>;
}

/** CheckIcon */
function CheckIcon() {
  return <svg viewBox="0 0 24 24"><path d="m5 12 4 4L19 6" /></svg>;
}
