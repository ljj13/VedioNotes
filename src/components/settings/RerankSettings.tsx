import { useState } from 'react';
import type { CapabilityStatusItem, RerankConfig } from '../../lib/types';
import { saveRerankConfig, testRerankConfig } from '../../lib/bridge';
import { bearerCredential, capabilityError, CapabilityFormShell, type CapabilityFeedback, ProviderFields } from './CapabilitySettingsShared';

export default function RerankSettings({ config, status, onChange, onStatusChange }: { config: RerankConfig; status?: CapabilityStatusItem; onChange: (config: RerankConfig) => void; onStatusChange: (status: CapabilityStatusItem) => void }) {
  const [apiKey, setApiKey] = useState('');
  const [busy, setBusy] = useState<'save' | 'test' | null>(null);
  const [feedback, setFeedback] = useState<CapabilityFeedback>(null);
  const save = async () => { setBusy('save'); setFeedback(null); try { const next = await saveRerankConfig(config, bearerCredential(apiKey)); onStatusChange(next); setApiKey(''); setFeedback({ tone: 'success', text: '重排配置已保存。' }); } catch (cause) { setFeedback({ tone: 'warning', text: capabilityError(cause, '重排配置保存失败。') }); } finally { setBusy(null); } };
  const test = async () => { setBusy('test'); setFeedback(null); try { const result = await testRerankConfig(); setFeedback({ tone: result.ok ? 'success' : 'warning', text: result.message }); } catch (cause) { setFeedback({ tone: 'warning', text: capabilityError(cause, '重排配置测试失败。') }); } finally { setBusy(null); } };
  return <CapabilityFormShell title="候选重排" description="对语义检索候选片段重新评分；未启用时保留原始检索顺序。" capabilityName="重排" enabled={config.enabled} status={status} feedback={feedback} busy={busy} saveLabel="保存重排配置" testLabel="测试重排配置" onEnabledChange={(enabled) => onChange({ ...config, enabled })} onSave={() => void save()} onTest={() => void test()}>
    <ProviderFields label="重排" providerId={config.providerId} presets={[{ value: 'siliconflow', label: 'SiliconFlow' }, { value: 'cohere-compatible', label: 'Cohere Compatible' }]} onChange={(providerId) => onChange({ ...config, providerId })} />
    <label className="settings-field wide"><span>接口地址</span><input aria-label="重排接口地址" type="url" value={config.endpoint} onChange={(event) => onChange({ ...config, endpoint: event.target.value })} placeholder="https://…/rerank" spellCheck={false} /></label>
    <label className="settings-field"><span>重排模型</span><input aria-label="重排模型" value={config.model} onChange={(event) => onChange({ ...config, model: event.target.value })} /></label>
    <label className="settings-field"><span>API Key</span><input aria-label="重排 API Key" type="password" autoComplete="new-password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder={status?.credentialReady ? '已安全保存；留空保持不变' : '输入后保存到系统凭据库'} /></label>
  </CapabilityFormShell>;
}
