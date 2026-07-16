import { useState } from 'react';
import type { CapabilityStatusItem, VectorConfig } from '../../lib/types';
import { saveVectorConfig, testVectorConfig } from '../../lib/bridge';
import { bearerCredential, capabilityError, CapabilityFormShell, type CapabilityFeedback, ProviderFields } from './CapabilitySettingsShared';

export default function VectorSettings({ config, status, onChange, onStatusChange }: {
  config: VectorConfig;
  status?: CapabilityStatusItem;
  onChange: (config: VectorConfig) => void;
  onStatusChange: (status: CapabilityStatusItem) => void;
}) {
  const [apiKey, setApiKey] = useState('');
  const [busy, setBusy] = useState<'save' | 'test' | null>(null);
  const [feedback, setFeedback] = useState<CapabilityFeedback>(null);
  const save = async () => {
    setBusy('save'); setFeedback(null);
    try {
      const next = await saveVectorConfig(config, bearerCredential(apiKey));
      onStatusChange(next); setApiKey(''); setFeedback({ tone: 'success', text: '向量配置已保存。' });
    } catch (cause) { setFeedback({ tone: 'warning', text: capabilityError(cause, '向量配置保存失败。') }); }
    finally { setBusy(null); }
  };
  const test = async () => {
    setBusy('test'); setFeedback(null);
    try { const result = await testVectorConfig(); setFeedback({ tone: result.ok ? 'success' : 'warning', text: result.message }); }
    catch (cause) { setFeedback({ tone: 'warning', text: capabilityError(cause, '向量配置测试失败。') }); }
    finally { setBusy(null); }
  };
  return <CapabilityFormShell title="向量模型" description="为笔记建立语义索引，并为检索和问答提供候选片段。" capabilityName="向量" enabled={config.enabled} status={status} feedback={feedback} busy={busy} saveLabel="保存向量配置" testLabel="测试向量配置" onEnabledChange={(enabled) => onChange({ ...config, enabled })} onSave={() => void save()} onTest={() => void test()}>
    <ProviderFields label="向量" providerId={config.providerId} presets={[{ value: 'siliconflow', label: 'SiliconFlow' }, { value: 'openai-compatible', label: 'OpenAI Compatible' }, { value: 'ollama', label: 'Ollama', description: '本机或局域网兼容接口' }]} onChange={(providerId) => onChange({ ...config, providerId })} />
    <label className="settings-field wide"><span>接口地址</span><input aria-label="向量接口地址" type="url" value={config.endpoint} onChange={(event) => onChange({ ...config, endpoint: event.target.value })} placeholder="https://…/embeddings" spellCheck={false} /></label>
    <label className="settings-field"><span>嵌入模型</span><input aria-label="向量模型" value={config.model} onChange={(event) => onChange({ ...config, model: event.target.value })} /></label>
    <label className="settings-field"><span>索引集合</span><input aria-label="向量索引集合" value={config.collection} onChange={(event) => onChange({ ...config, collection: event.target.value })} /></label>
    <label className="settings-field"><span>向量维度</span><input aria-label="向量维度" type="number" min="1" max="65535" value={config.dimensions ?? ''} onChange={(event) => onChange({ ...config, dimensions: event.target.value ? Number(event.target.value) : null })} /></label>
    <label className="settings-field"><span>API Key</span><input aria-label="向量 API Key" type="password" autoComplete="new-password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder={status?.credentialReady ? '已安全保存；留空保持不变' : '输入后保存到系统凭据库'} /></label>
  </CapabilityFormShell>;
}
