import { useState } from 'react';
import type { CapabilityStatusItem, WebSearchConfig } from '../../lib/types';
import { saveWebSearchConfig, testWebSearchConfig } from '../../lib/bridge';
import { bearerCredential, capabilityError, CapabilityFormShell, type CapabilityFeedback, ProviderFields } from './CapabilitySettingsShared';

export default function WebSearchSettings({ config, status, onChange, onStatusChange }: { config: WebSearchConfig; status?: CapabilityStatusItem; onChange: (config: WebSearchConfig) => void; onStatusChange: (status: CapabilityStatusItem) => void }) {
  const [apiKey, setApiKey] = useState('');
  const [busy, setBusy] = useState<'save' | 'test' | null>(null);
  const [feedback, setFeedback] = useState<CapabilityFeedback>(null);
  const save = async () => { setBusy('save'); setFeedback(null); try { const next = await saveWebSearchConfig(config, bearerCredential(apiKey)); onStatusChange(next); setApiKey(''); setFeedback({ tone: 'success', text: '联网搜索配置已保存。' }); } catch (cause) { setFeedback({ tone: 'warning', text: capabilityError(cause, '联网搜索配置保存失败。') }); } finally { setBusy(null); } };
  const test = async () => { setBusy('test'); setFeedback(null); try { const result = await testWebSearchConfig(); setFeedback({ tone: result.ok ? 'success' : 'warning', text: result.message }); } catch (cause) { setFeedback({ tone: 'warning', text: capabilityError(cause, '联网搜索配置测试失败。') }); } finally { setBusy(null); } };
  return <CapabilityFormShell title="联网搜索" description="只在用户明确选择联网检索时获取外部来源，不会混入默认同篇笔记问答。" capabilityName="联网" enabled={config.enabled} status={status} feedback={feedback} busy={busy} saveLabel="保存联网配置" testLabel="测试联网配置" onEnabledChange={(enabled) => onChange({ ...config, enabled })} onSave={() => void save()} onTest={() => void test()}>
    <ProviderFields label="联网" providerId={config.providerId} presets={[{ value: 'tavily', label: 'Tavily Compatible' }]} onChange={(providerId) => onChange({ ...config, providerId })} />
    <label className="settings-field wide"><span>接口地址</span><input aria-label="联网接口地址" type="url" value={config.endpoint} onChange={(event) => onChange({ ...config, endpoint: event.target.value })} placeholder="https://api.tavily.com/search" spellCheck={false} /></label>
    <label className="settings-field"><span>最大结果数</span><input aria-label="联网最大结果数" type="number" min="1" max="20" value={config.maxResults} onChange={(event) => onChange({ ...config, maxResults: Number(event.target.value) })} /></label>
    <label className="settings-field"><span>API Key</span><input aria-label="联网 API Key" type="password" autoComplete="new-password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder={status?.credentialReady ? '已安全保存；留空保持不变' : '输入后保存到系统凭据库'} /></label>
  </CapabilityFormShell>;
}
