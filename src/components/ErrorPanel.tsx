/**
 *错误面板——当任务失败时显示错误信息和重试按钮。
 */

import { useState } from 'react';
import type { AppError } from '../lib/types';

type Props = {
  error: AppError;
  onRetry: () => void;
  onOpenLog: () => Promise<void>;
};

/** ErrorPanel */
export default function ErrorPanel({ error, onRetry, onOpenLog }: Props) {
  const [openingLog, setOpeningLog] = useState(false);
  const [logError, setLogError] = useState(false);

  const handleOpenLog = async () => {
    setOpeningLog(true);
    setLogError(false);
    try {
      await onOpenLog();
    } catch {
      setLogError(true);
    } finally {
      setOpeningLog(false);
    }
  };

  return (
    <div className="error-panel" role="alert">
      <h3>处理出错</h3>
      <p className="error-message">{error.message}</p>
      <p className="error-recovery">{error.recovery}</p>
      {logError && (
        <p className="diagnostic-log-error">
          无法打开日志，请在应用数据目录的 logs 文件夹中查看。
        </p>
      )}
      <div className="error-actions">
        <button className="retry-button" onClick={onRetry} type="button">重试</button>
        <button
          className="open-log-button"
          onClick={handleOpenLog}
          type="button"
          disabled={openingLog}
        >
          {openingLog ? '正在打开...' : '打开日志'}
        </button>
      </div>
    </div>
  );
}
