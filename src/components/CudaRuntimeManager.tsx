import { useEffect, useRef, useState } from 'react';
import {
  deleteCudaRuntime,
  downloadCudaRuntime,
  getCudaRuntimeStatus,
  onCudaRuntimeDownloadProgress,
  setLocalComputeMode,
} from '../lib/bridge';
import type { CudaRuntimeDownloadProgress, CudaRuntimeStatus, LocalComputeMode } from '../lib/types';

const stateLabels: Record<CudaRuntimeStatus['state'], string> = {
  unavailable: '未检测到 NVIDIA GPU',
  not_installed: '尚未安装',
  downloading: '正在下载',
  ready: 'CUDA 加速已就绪',
  incompatible: '当前显卡不兼容',
  error: '组件需要修复',
};

export default function CudaRuntimeManager() {
  const [status, setStatus] = useState<CudaRuntimeStatus | null>(null);
  const [progress, setProgress] = useState<CudaRuntimeDownloadProgress | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);
  const listenerReady = useRef<Promise<boolean> | null>(null);

  if (!listenerReady.current) listenerReady.current = Promise.resolve(false);

  const refresh = async () => {
    try {
      const next = await getCudaRuntimeStatus();
      if (mounted.current) setStatus(next);
    } catch {
      if (mounted.current) setError('无法读取 CUDA 加速状态，CPU 转写仍可使用。');
    }
  };

  useEffect(() => {
    mounted.current = true;
    let active = true;
    let cleanup: (() => void) | undefined;
    listenerReady.current = onCudaRuntimeDownloadProgress((next) => {
      if (active) setProgress(next);
    })
      .then((unlisten) => {
        if (active) cleanup = unlisten;
        else unlisten();
        return true;
      })
      .catch(() => {
        if (active) setError('无法监听 CUDA 下载进度，请重试。');
        return false;
      });
    void refresh();
    return () => {
      active = false;
      mounted.current = false;
      cleanup?.();
    };
  }, []);

  const chooseMode = async (mode: LocalComputeMode) => {
    if (!status || busy || status.computeMode === mode) return;
    setError(null);
    setBusy(true);
    try {
      await setLocalComputeMode(mode);
      if (mounted.current) setStatus((current) => current ? { ...current, computeMode: mode } : current);
    } catch {
      if (mounted.current) setError('无法保存计算模式，请重试。');
    } finally {
      if (mounted.current) setBusy(false);
    }
  };

  const download = async () => {
    const listenerAvailable = await listenerReady.current;
    if (!mounted.current) return;
    if (!listenerAvailable) {
      setError('无法监听 CUDA 下载进度，请重试。');
      return;
    }
    setBusy(true);
    setError(null);
    setProgress({ downloadedBytes: 0, totalBytes: 0 });
    try {
      await downloadCudaRuntime();
      if (mounted.current) await refresh();
    } catch {
      if (mounted.current) setError('CUDA 组件下载或校验失败，请检查网络和磁盘空间后重试。');
    } finally {
      if (mounted.current) setBusy(false);
    }
  };

  const remove = async () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await deleteCudaRuntime();
      if (mounted.current) {
        setConfirmDelete(false);
        setProgress(null);
        await refresh();
      }
    } catch {
      if (mounted.current) setError('删除失败；如果任务正在运行，请等待任务结束后重试。');
    } finally {
      if (mounted.current) setBusy(false);
    }
  };

  const percent = progress?.totalBytes
    ? Math.min(100, Math.floor((progress.downloadedBytes / progress.totalBytes) * 100))
    : 0;

  return (
    <section className="cuda-runtime-manager" aria-label="CUDA 加速组件管理" aria-busy={busy}>
      <header className="cuda-runtime-header">
        <div>
          <span className="settings-eyebrow">GPU ACCELERATION</span>
          <h3>CUDA 加速</h3>
          <p>为本地 Whisper 安装可选的官方 CUDA 运行组件；无需 CUDA Toolkit。</p>
        </div>
        {status && <span className={`cuda-runtime-state state-${status.state}`}>{stateLabels[status.state]}</span>}
      </header>

      {error && <div className="cuda-runtime-alert" role="alert">{error}</div>}
      {!status && !error && <p className="cuda-runtime-loading">正在检测显卡与组件状态…</p>}
      {status && (
        <>
          <div className="cuda-runtime-details">
            <div><span>检测到的显卡</span><strong>{status.gpuName ?? '未检测到 NVIDIA GPU'}</strong></div>
            <div><span>组件版本</span><strong>{status.version}</strong></div>
          </div>
          <fieldset className="compute-mode-selector" disabled={busy}>
            <legend>本地转写计算方式</legend>
            <label><input type="radio" name="local-compute-mode" checked={status.computeMode === 'auto'} onChange={() => void chooseMode('auto')} /> <span><strong>自动（CUDA 优先）</strong><small>组件就绪时使用显卡，失败会自动改用 CPU</small></span></label>
            <label><input type="radio" name="local-compute-mode" checked={status.computeMode === 'cpu'} onChange={() => void chooseMode('cpu')} /> <span><strong>仅 CPU</strong><small>始终使用内置 CPU 运行组件</small></span></label>
          </fieldset>
          <p className="cuda-cpu-note"><span aria-hidden="true">✓</span> CPU 转写始终可用</p>
          {status.message && <p className="cuda-runtime-message">{status.message}</p>}
          {(busy || progress) && status.state !== 'ready' && (
            <div className="cuda-download-progress">
              <div><span>CUDA 组件下载进度</span><strong>{percent}%</strong></div>
              <progress aria-label="CUDA 组件下载进度" value={percent} max={100}>{percent}%</progress>
            </div>
          )}
          <div className="cuda-runtime-actions">
            {(status.state === 'not_installed' || status.state === 'error') && (
              <button type="button" className="primary-action" disabled={busy} onClick={() => void download()}>{status.state === 'error' ? '重试下载 CUDA 加速组件' : '下载 CUDA 加速组件'}</button>
            )}
            {status.state === 'ready' && (
              <button type="button" className="secondary-action danger-action" disabled={busy} aria-label={confirmDelete ? '确认删除 CUDA 加速组件' : '删除 CUDA 加速组件'} onClick={() => void remove()}>{confirmDelete ? '确认删除' : '删除组件'}</button>
            )}
          </div>
        </>
      )}
    </section>
  );
}
