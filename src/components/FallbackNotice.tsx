import type { ProviderFallbackEvent } from '../lib/types';

interface FallbackNoticeProps {
  event: ProviderFallbackEvent;
  onDismiss: () => void;
  onOpenSettings: () => void;
}

export default function FallbackNotice({
  event,
  onDismiss,
  onOpenSettings,
}: FallbackNoticeProps) {
  return (
    <div className="fallback-notice" role="status">
      <div className="fallback-notice-content">
        <div className="fallback-icon">⚠️</div>
        <div className="fallback-message">
          <p>
            腾讯 API 额度可能已用完。本次任务已自动切换到{' '}
            <strong>{event.toProfileName}</strong>。
          </p>
        </div>
        <div className="fallback-actions">
          <button
            className="fallback-dismiss-btn"
            onClick={onDismiss}
            type="button"
          >
            知道了
          </button>
          <button
            className="fallback-settings-btn"
            onClick={onOpenSettings}
            type="button"
          >
            打开设置
          </button>
        </div>
      </div>
    </div>
  );
}
