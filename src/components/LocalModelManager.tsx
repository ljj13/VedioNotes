/**
 *本地 Whisper 模型管理器——下载、删除、查看本地的语音识别模型。
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import type { LocalModelStatus, TranscriptionProfile } from '../lib/types';
import { deleteLocalModel, downloadLocalModel, listLocalModels, onLocalModelDownloadProgress, saveTranscriptionProfile, setActiveProfile } from '../lib/bridge';

const MODELS = [
  ['tiny', '适合快速试用', '约 75 MB'], ['base', '日常短视频', '约 142 MB'],
  ['small', '更好的中文识别', '约 466 MB'], ['medium', '高准确率', '约 1.5 GB'],
  ['large-v3-turbo', '最佳速度与准确率平衡', '约 1.6 GB'],
] as const;

interface Props { models?: LocalModelStatus[]; localProfile?: TranscriptionProfile; onModelsChanged: () => void; onProfilesChanged?: () => void; }

/** LocalModelManager */
export default function LocalModelManager({ models: suppliedModels, localProfile, onModelsChanged, onProfilesChanged }: Props) {
  const [loadedModels, setLoadedModels] = useState<LocalModelStatus[]>([]);
  const [progress, setProgress] = useState<Record<string, { downloadedBytes: number; totalBytes: number }>>({});
  const [downloading, setDownloading] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const listenerReady = useRef<Promise<void> | null>(null);
  const resolveListenerReady = useRef<(() => void) | null>(null);
  const listenerAvailable = useRef(true);
  const mounted = useRef(true);
  if (!listenerReady.current) {
    listenerReady.current = new Promise<void>((resolve) => { resolveListenerReady.current = resolve; });
  }
  const models = suppliedModels ?? loadedModels;

  useEffect(() => {
    if (suppliedModels) return;
    listLocalModels().then(setLoadedModels).catch(() => setError('无法读取本地模型状态，请重试。'));
  }, [suppliedModels]);
  useEffect(() => {
    let active = true; let cleanup: (() => void) | undefined;
    mounted.current = true;
    onLocalModelDownloadProgress((event) => {
      if (!active) return;
      setProgress((old) => ({ ...old, [event.modelId]: event }));
    }).then((unlisten) => { if (active) cleanup = unlisten; else unlisten(); }).catch(() => {
      listenerAvailable.current = false;
      if (active) setError('无法监听下载进度，请重试。');
    }).finally(() => resolveListenerReady.current?.());
    return () => { active = false; mounted.current = false; cleanup?.(); resolveListenerReady.current?.(); };
  }, []);

  const modelById = useMemo(() => new Map(models.map((m) => [m.id, m])), [models]);
  const refresh = () => { onModelsChanged(); if (!suppliedModels) listLocalModels().then(setLoadedModels).catch(() => {}); };
  const download = async (modelId: string) => {
    await listenerReady.current;
    if (!mounted.current) return;
    if (!listenerAvailable.current) {
      setError('无法监听下载进度，请重试。');
      return;
    }
    setError(null); setDownloading((old) => ({ ...old, [modelId]: true }));
    try { await downloadLocalModel(modelId); refresh(); }
    catch { setError('下载失败，已尝试备用网址。请检查网络和磁盘空间后重试。'); }
    finally { setDownloading((old) => ({ ...old, [modelId]: false })); }
  };
  const remove = async (model: LocalModelStatus) => {
    if (model.isCurrent && confirming !== model.id) { setConfirming(model.id); return; }
    try { await deleteLocalModel(model.id, model.isCurrent); setConfirming(null); refresh(); onProfilesChanged?.(); }
    catch { setError('删除失败，请重试。'); }
  };
  const chooseCurrent = async (model: LocalModelStatus) => {
    if (!localProfile || model.state !== 'ready') return;
    await saveTranscriptionProfile({ ...localProfile, enabled: true, model: model.id, baseUrl: '' });
    await setActiveProfile('transcription', localProfile.id);
    onProfilesChanged?.();
  };
  return <section className="local-model-manager" aria-label="本地模型管理">
    <h3>本地 Whisper 模型</h3>
    <p>模型仅在您点击下载后获取；本地转写不需要 API Key。</p>
    {error && <div role="alert">{error}</div>}
    <div className="local-model-list">
      {MODELS.map(([id, use, size]) => {
        const model = modelById.get(id) ?? { id, state: 'not_downloaded' as const, downloadedBytes: 0, totalBytes: 0, isCurrent: false };
        const p = progress[id]; const percent = p?.totalBytes ? Math.floor((p.downloadedBytes / p.totalBytes) * 100) : null;
        return <article key={id} className="local-model-card"><div className="local-model-copy"><strong>{id}</strong><span>{use}</span><small>{size} · {statusText(model.state)}</small>{percent !== null && <span className="model-progress">{percent}%</span>}</div><div className="local-model-actions">
          {model.isCurrent && <span className="cookie-ready">当前</span>}
          {model.state === 'ready' && !model.isCurrent && localProfile && <button type="button" onClick={() => chooseCurrent(model)}>设为当前</button>}
          {(model.state === 'not_downloaded' || model.state === 'corrupt') && <button type="button" disabled={!!downloading[id]} aria-label={`下载 ${id}`} onClick={() => download(id)}>下载</button>}
          {model.state === 'failed' && <button type="button" disabled={!!downloading[id]} aria-label={`重试 ${id}`} onClick={() => download(id)}>重试</button>}
          {model.state === 'downloading' && <span>下载中...</span>}
          {model.state === 'ready' && <button type="button" className="delete-btn" aria-label={`${confirming === id ? '确认删除' : '删除'} ${id}`} onClick={() => remove(model)}>{confirming === id ? '确认删除' : '删除'}</button>}
        </div>
        </article>;
      })}
    </div>
  </section>;
}
/** statusText */
function statusText(state: LocalModelStatus['state']) { return ({ not_downloaded: '未下载', downloading: '下载中', ready: '已就绪', corrupt: '文件损坏', failed: '下载失败' })[state]; }
