import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  SenseVoiceDownloadProgress,
  SenseVoiceLanguage,
  SenseVoiceModelId,
  SenseVoiceStatus,
} from '../lib/types';
import {
  cancelSenseVoiceDownload,
  deleteSenseVoice,
  downloadSenseVoice,
  getSenseVoiceStatus,
  onSenseVoiceDownloadProgress,
  setSenseVoiceModel,
} from '../lib/bridge';

type Props = {
  languages: SenseVoiceLanguage[];
  onLanguagesChange: (languages: SenseVoiceLanguage[]) => void;
  onStatusChange: (status: SenseVoiceStatus) => void;
};

const LANGUAGE_OPTIONS: Array<{ id: SenseVoiceLanguage; label: string; detail: string }> = [
  { id: 'zh', label: '中文', detail: 'Chinese' },
  { id: 'en', label: '英语', detail: 'English' },
  { id: 'ja', label: '日语', detail: 'Japanese' },
  { id: 'ko', label: '韩语', detail: 'Korean' },
  { id: 'yue', label: '粤语', detail: 'Cantonese' },
];

const MODEL_COPY: Record<SenseVoiceModelId, { title: string; detail: string }> = {
  int8: { title: 'int8 量化版', detail: '约 235 MB · 推荐，体积小、速度快' },
  float32: { title: 'float32 完整版', detail: '约 920 MB · 更高精度、占用更大' },
};

function errorMessage(cause: unknown, fallback: string) {
  if (typeof cause === 'object' && cause && 'message' in cause && typeof cause.message === 'string') return cause.message;
  return fallback;
}

export default function SenseVoiceManager({ languages, onLanguagesChange, onStatusChange }: Props) {
  const [status, setStatus] = useState<SenseVoiceStatus | null>(null);
  const [progress, setProgress] = useState<SenseVoiceDownloadProgress | null>(null);
  const [downloading, setDownloading] = useState<SenseVoiceModelId | null>(null);
  const [pausedModel, setPausedModel] = useState<SenseVoiceModelId | null>(null);
  const [pendingDelete, setPendingDelete] = useState<SenseVoiceModelId | null>(null);
  const [message, setMessage] = useState('');
  const progressUnlisten = useRef<(() => void) | null>(null);
  const listenerPromise = useRef<Promise<void> | null>(null);
  const mounted = useRef(false);

  const applyStatus = useCallback((next: SenseVoiceStatus) => {
    setStatus(next);
    onStatusChange(next);
  }, [onStatusChange]);

  const ensureProgressListener = useCallback(() => {
    if (!listenerPromise.current) {
      listenerPromise.current = onSenseVoiceDownloadProgress((next) => {
        if (!mounted.current) return;
        setProgress(next);
        setDownloading(next.modelId);
        setPausedModel(null);
      }).then((unlisten) => {
        if (!mounted.current) {
          unlisten();
          return;
        }
        progressUnlisten.current = unlisten;
      }).catch((cause) => {
        listenerPromise.current = null;
        throw cause;
      });
    }
    return listenerPromise.current;
  }, []);

  const refresh = useCallback(async () => {
    try {
      applyStatus(await getSenseVoiceStatus());
    } catch (cause) {
      setMessage(errorMessage(cause, '无法读取 SenseVoice 状态，请重试。'));
    }
  }, [applyStatus]);

  useEffect(() => {
    mounted.current = true;
    void refresh();
    void ensureProgressListener().catch(() => {
      if (mounted.current) setMessage('无法监听 SenseVoice 下载进度，请重试。');
    });
    return () => {
      mounted.current = false;
      progressUnlisten.current?.();
      progressUnlisten.current = null;
      listenerPromise.current = null;
    };
  }, [ensureProgressListener, refresh]);

  const install = async (modelId: SenseVoiceModelId) => {
    setMessage('');
    setProgress(null);
    try {
      await ensureProgressListener();
      setDownloading(modelId);
      setPausedModel(null);
      applyStatus(await downloadSenseVoice(modelId));
      setDownloading(null);
      setProgress(null);
    } catch (cause) {
      setDownloading(null);
      if (errorMessage(cause, '').includes('取消')) {
        setPausedModel(modelId);
        setMessage('下载已暂停；再次点击继续时会从现有 .part 文件断点续传。');
      } else {
        setMessage(errorMessage(cause, 'SenseVoice 下载失败，已尝试备用源。请重试。'));
      }
      await refresh();
    }
  };

  const pause = async () => {
    if (!downloading) return;
    await cancelSenseVoiceDownload();
    setPausedModel(downloading);
    setDownloading(null);
    setMessage('正在暂停下载；已完成的数据会保留用于断点续传。');
  };

  const activate = async (modelId: SenseVoiceModelId) => {
    setMessage('');
    try { applyStatus(await setSenseVoiceModel(modelId)); }
    catch (cause) { setMessage(errorMessage(cause, '无法启用该 SenseVoice 模型。')); }
  };

  const remove = async (modelId: SenseVoiceModelId, confirmed: boolean) => {
    setMessage('');
    try {
      applyStatus(await deleteSenseVoice(modelId, confirmed));
      setPendingDelete(null);
    } catch (cause) {
      setMessage(errorMessage(cause, '无法删除该 SenseVoice 模型。'));
    }
  };

  const toggleLanguage = (id: SenseVoiceLanguage) => {
    if (languages.includes(id)) {
      if (languages.length === 1) {
        setMessage('至少保留一种识别语言。');
        return;
      }
      onLanguagesChange(languages.filter((language) => language !== id));
    } else {
      onLanguagesChange([...languages, id]);
    }
  };

  const currentState = status?.state ?? 'missing';
  const stateLabel = currentState === 'ready' ? '已就绪'
    : currentState === 'partial' ? '可继续下载'
      : currentState === 'failed' ? '下载失败'
        : currentState === 'corrupt' ? '校验失败'
          : '未安装';

  return (
    <div className="settings-two-column sensevoice-manager" role="tabpanel">
      <article className="settings-surface sensevoice-card">
        <div className="settings-card-heading">
          <div><h3>SenseVoice 本地模型</h3><p>轻量 CPU 转写组件；仅在明确选择 CPU 模式且无可用字幕时运行。</p></div>
          <span className={`status-chip ${currentState === 'ready' ? 'success' : 'warning'}`}>{stateLabel}</span>
        </div>
        <div className="settings-status info" role="status">
          下载源：Hugging Face；连接失败时自动切换 ModelScope。暂停后再次下载会使用 HTTP Range 断点续传。
        </div>
        {status && (
          <div className="sensevoice-artifact-status" aria-label="SenseVoice 组件状态">
            <span>运行器 <strong>{status.runtimeReady ? '已校验' : '未就绪'}</strong></span>
            <span>词表 <strong>{status.tokensReady ? '已校验' : '未就绪'}</strong></span>
            <span>当前模型 <strong>{status.selectedModel}</strong></span>
          </div>
        )}
        <div className="sensevoice-model-list" aria-label="SenseVoice 模型">
          {(status?.models ?? []).map((model) => {
            const copy = MODEL_COPY[model.id];
            const activeDownload = downloading === model.id;
            const retry = pausedModel === model.id || model.state === 'partial' || model.state === 'failed' || model.state === 'corrupt';
            return (
              <section className={`sensevoice-model-row ${model.isSelected ? 'is-selected' : ''}`} key={model.id}>
                <div><strong>{copy.title}</strong><span>{copy.detail}</span></div>
                <div className="sensevoice-model-actions">
                  {model.state === 'ready' && !model.isSelected && <button type="button" className="secondary-action" onClick={() => activate(model.id)} aria-label={`启用 ${model.id} 模型`}>启用</button>}
                  {model.state === 'ready' && <button type="button" className="ghost-action" onClick={() => model.isSelected ? setPendingDelete(model.id) : void remove(model.id, false)} aria-label={`删除 ${model.id} 模型`}>删除</button>}
                  {model.state !== 'ready' && !activeDownload && <button type="button" className="primary-action" onClick={() => void install(model.id)} aria-label={`${retry ? '继续下载' : '下载'} ${model.id} 模型`}>{retry ? '继续下载' : '一键下载安装'}</button>}
                  {activeDownload && <button type="button" className="secondary-action" onClick={() => void pause()} aria-label="暂停 SenseVoice 下载">暂停</button>}
                </div>
                {pendingDelete === model.id && (
                  <div className="inline-confirm" role="alert">
                    <span>当前模型正在使用，删除后 CPU 模式将不可启动。</span>
                    <button type="button" className="danger-action" onClick={() => void remove(model.id, true)} aria-label={`确认删除 ${model.id} 模型`}>确认删除</button>
                    <button type="button" className="ghost-action" onClick={() => setPendingDelete(null)}>取消</button>
                  </div>
                )}
              </section>
            );
          })}
          {!status && <p className="settings-muted">正在检查组件状态…</p>}
        </div>
        {progress && (
          <div className="sensevoice-progress">
            <div><span>{progress.artifactId}</span><strong>{progress.overallPercent}%</strong></div>
            <progress aria-label="SenseVoice 下载进度" value={progress.overallPercent} max={100} />
          </div>
        )}
        <div className="settings-actions">
          <button type="button" className="secondary-action" onClick={() => { setMessage(''); void refresh(); }}>刷新状态</button>
        </div>
        {message && <div className="settings-status warning" role="status">{message}</div>}
      </article>
      <article className="settings-surface">
        <div className="settings-card-heading"><div><h3>识别语言</h3><p>选择任务可能出现的语言；多选时运行器使用自动识别。</p></div></div>
        <div className="language-checklist">
          {LANGUAGE_OPTIONS.map((language) => (
            <label key={language.id}>
              <input type="checkbox" checked={languages.includes(language.id)} onChange={() => toggleLanguage(language.id)} aria-label={`${language.label} ${language.detail}`} />
              <span><strong>{language.label}</strong><small>{language.detail}</small></span>
            </label>
          ))}
        </div>
      </article>
    </div>
  );
}
