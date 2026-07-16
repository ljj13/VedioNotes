import { useEffect, useState } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import {
  getPreferences,
  setMarkdownOutputDir,
} from '../lib/bridge';
import type { AppError, AppPreferences } from '../lib/types';

function errorMessage(error: unknown): string {
  const candidate = error as Partial<AppError> | Error | null;
  return candidate?.message || '保存位置更新失败，请重试。';
}

export default function OutputSettings() {
  const [preferences, setPreferences] = useState<AppPreferences | null>(null);
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    getPreferences()
      .then((value) => {
        if (active) setPreferences(value);
      })
      .catch((reason: unknown) => {
        if (active) setError(errorMessage(reason));
      });
    return () => {
      active = false;
    };
  }, []);

  const chooseDirectory = async () => {
    setError(null);
    setStatus(null);
    setPending(true);
    try {
      const selected = await open({ directory: true, multiple: false });
      if (!selected || Array.isArray(selected)) return;

      const updated = await setMarkdownOutputDir(selected);
      setPreferences(updated);
      setStatus('保存位置已更新，后续任务将使用此文件夹。');
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setPending(false);
    }
  };

  const restoreDefault = async () => {
    setPending(true);
    setError(null);
    setStatus(null);
    try {
      const updated = await setMarkdownOutputDir(null);
      setPreferences(updated);
      setStatus('已恢复系统默认保存位置。');
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="output-settings">
      <h3>Markdown 保存位置</h3>
      <p className="output-settings-hint">
        新任务完成后会自动保存到此处。修改位置不会移动已有文件。
      </p>
      <div className="output-path-card">
        <span className="output-path-label">当前保存位置</span>
        <code className="output-path-value">
          {preferences
            ? preferences.markdownOutputDir || '系统默认：视频\\video-distiller'
            : '正在读取...'}
        </code>
      </div>
      <div className="output-settings-actions">
        <button type="button" onClick={chooseDirectory} disabled={pending}>
          选择文件夹
        </button>
        <button type="button" onClick={restoreDefault} disabled={pending}>
          恢复默认
        </button>
      </div>
      {status && <p role="status" className="output-status">{status}</p>}
      {error && <p role="alert" className="output-error">{error}</p>}
    </div>
  );
}
