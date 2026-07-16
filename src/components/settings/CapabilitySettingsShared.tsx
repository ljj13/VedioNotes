import type { ReactNode } from 'react';
import type { CapabilityStatusItem } from '../../lib/types';
import StyledSelect, { type StyledSelectOption } from '../StyledSelect';

export type CapabilityFeedback = {
  tone: 'success' | 'warning' | 'info';
  text: string;
} | null;

export function capabilityError(cause: unknown, fallback: string) {
  return cause instanceof Error && cause.message.trim() ? cause.message : fallback;
}

export function bearerCredential(apiKey: string) {
  const normalized = apiKey.trim();
  return normalized ? { type: 'bearer' as const, apiKey: normalized } : undefined;
}

export function ProviderFields({
  label,
  providerId,
  presets,
  onChange,
}: {
  label: string;
  providerId: string;
  presets: StyledSelectOption[];
  onChange: (providerId: string) => void;
}) {
  const presetValues = new Set(presets.map((option) => option.value));
  const presetValue = presetValues.has(providerId) ? providerId : 'custom';
  const options = [...presets, { value: 'custom', label: '自定义兼容', description: '使用自定义服务商标识和接口地址' }];
  return (
    <>
      <label className="settings-field">
        <span>{label}服务商预设</span>
        <StyledSelect
          label={`${label}服务商预设`}
          value={presetValue}
          options={options}
          onChange={(value) => onChange(value === 'custom' ? (presetValue === 'custom' ? providerId : 'custom') : value)}
        />
      </label>
      <label className="settings-field">
        <span>{label}服务商标识</span>
        <input
          aria-label={`${label}服务商标识`}
          value={providerId}
          onChange={(event) => onChange(event.target.value)}
          placeholder="例如 custom-provider"
          spellCheck={false}
        />
      </label>
    </>
  );
}

export function CapabilityFormShell({
  title,
  description,
  capabilityName,
  enabled,
  status,
  feedback,
  busy,
  saveLabel,
  testLabel,
  onEnabledChange,
  onSave,
  onTest,
  children,
  secondaryActions,
}: {
  title: string;
  description: string;
  capabilityName: string;
  enabled: boolean;
  status?: CapabilityStatusItem;
  feedback: CapabilityFeedback;
  busy: 'save' | 'test' | null;
  saveLabel: string;
  testLabel: string;
  onEnabledChange: (enabled: boolean) => void;
  onSave: () => void;
  onTest: () => void;
  children: ReactNode;
  secondaryActions?: ReactNode;
}) {
  const ready = Boolean(status?.enabled && status.configured && status.credentialReady);
  const statusText = ready ? '已就绪' : status?.enabled ? '配置未完成' : '未启用';
  return (
    <article className="settings-surface capability-settings" role="tabpanel">
      <div className="settings-card-heading capability-heading">
        <div><h3>{title}</h3><p>{description}</p></div>
        <div className="capability-heading-actions">
          <span className={`status-chip ${ready ? 'success' : ''}`}>{statusText}</span>
          <label className="settings-switch">
            <span>启用</span>
            <input
              type="checkbox"
              aria-label={`启用${capabilityName}能力`}
              checked={enabled}
              onChange={(event) => onEnabledChange(event.target.checked)}
            />
          </label>
        </div>
      </div>
      <div className="settings-form-grid">{children}</div>
      <div className="settings-actions capability-actions">
        {secondaryActions}
        <button type="button" className="secondary-action" disabled={busy !== null} onClick={onTest}>
          {busy === 'test' ? '测试中…' : testLabel}
        </button>
        <button type="button" className="primary-action" disabled={busy !== null} onClick={onSave}>
          {busy === 'save' ? '保存中…' : saveLabel}
        </button>
      </div>
      {feedback && <div className={`settings-status ${feedback.tone}`} role={feedback.tone === 'warning' ? 'alert' : 'status'}>{feedback.text}</div>}
    </article>
  );
}
