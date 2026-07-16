import { useState } from 'react';
import type { AppError } from '../lib/types';
import { completeMigration } from '../lib/bridge';

interface MigrationNoticeProps {
  onOpenSettings: () => void;
  onMigrationComplete: () => void;
}

export default function MigrationNotice({
  onOpenSettings,
  onMigrationComplete,
}: MigrationNoticeProps) {
  const [completing, setCompleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleComplete = async () => {
    setCompleting(true);
    setError(null);
    try {
      await completeMigration(true);
      onMigrationComplete();
    } catch (e: unknown) {
      const err = e as AppError;
      setError(err.message ?? '迁移完成失败');
    } finally {
      setCompleting(false);
    }
  };

  const handleDismiss = () => {
    // Dismissing without confirming does NOT invoke completeMigration
    onMigrationComplete();
  };

  return (
    <div className="migration-notice" role="alert">
      <div className="migration-notice-content">
        <p className="migration-notice-title">检测到旧版凭据</p>
        <p className="migration-notice-text">
          应用已升级为独立配置档管理。请分别在设置中为转写和总结服务配置 API Key，然后点击下方确认完成迁移。旧凭据仅在此确认后删除。
        </p>
        {error && (
          <p className="migration-notice-error">
            {error} — 请检查设置后再试。
          </p>
        )}
        <div className="migration-notice-actions">
          <button
            className="migration-btn-primary"
            onClick={handleComplete}
            disabled={completing}
            type="button"
          >
            {completing ? '正在完成...' : '我已配置好，确认迁移'}
          </button>
          <button
            className="migration-btn-secondary"
            onClick={onOpenSettings}
            type="button"
          >
            打开设置
          </button>
          <button
            className="migration-btn-dismiss"
            onClick={handleDismiss}
            type="button"
          >
            稍后提醒
          </button>
        </div>
      </div>
    </div>
  );
}
