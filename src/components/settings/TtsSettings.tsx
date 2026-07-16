import { useState } from 'react';
import type { CapabilityStatusItem, TtsConfig } from '../../lib/types';
import { saveTtsConfig, testTtsConfig } from '../../lib/bridge';
import { bearerCredential, capabilityError, CapabilityFormShell, type CapabilityFeedback, ProviderFields } from './CapabilitySettingsShared';

export default function TtsSettings({ config, status, onChange, onStatusChange }: { config: TtsConfig; status?: CapabilityStatusItem; onChange: (config: TtsConfig) => void; onStatusChange: (status: CapabilityStatusItem) => void }) {
  const [apiKey, setApiKey] = useState('');
  const [busy, setBusy] = useState<'save' | 'test' | null>(null);
  const [feedback, setFeedback] = useState<CapabilityFeedback>(null);
  const save = async () => { setBusy('save'); setFeedback(null); try { const next = await saveTtsConfig(config, bearerCredential(apiKey)); onStatusChange(next); setApiKey(''); setFeedback({ tone: 'success', text: '语音配置已保存。' }); } catch (cause) { setFeedback({ tone: 'warning', text: capabilityError(cause, '语音配置保存失败。') }); } finally { setBusy(null); } };
  const test = async () => { setBusy('test'); setFeedback(null); try { const result = await testTtsConfig(); setFeedback({ tone: result.ok ? 'success' : 'warning', text: result.message }); } catch (cause) { setFeedback({ tone: 'warning', text: capabilityError(cause, '语音配置测试失败。') }); } finally { setBusy(null); } };
  return <CapabilityFormShell title="文字转语音" description="由用户主动触发笔记朗读；生成文件保存在应用专用目录。" capabilityName="语音" enabled={config.enabled} status={status} feedback={feedback} busy={busy} saveLabel="保存语音配置" testLabel="测试语音配置" onEnabledChange={(enabled) => onChange({ ...config, enabled })} onSave={() => void save()} onTest={() => void test()}>
    <ProviderFields label="语音" providerId={config.providerId} presets={[{ value: 'mimo', label: '小米 MiMo' }, { value: 'doubao', label: '火山引擎 / 豆包' }, { value: 'qwen', label: '阿里云 Qwen / 百炼' }]} onChange={(providerId) => onChange({ ...config, providerId })} />
    <label className="settings-field wide"><span>接口地址</span><input aria-label="语音接口地址" type="url" value={config.endpoint} onChange={(event) => onChange({ ...config, endpoint: event.target.value })} spellCheck={false} /></label>
    <label className="settings-field"><span>模型</span><input aria-label="语音模型" value={config.model} onChange={(event) => onChange({ ...config, model: event.target.value })} /></label>
    <label className="settings-field"><span>声音</span><input aria-label="语音声音" value={config.voice} onChange={(event) => onChange({ ...config, voice: event.target.value })} /></label>
    <label className="settings-field"><span>API Key</span><input aria-label="语音 API Key" type="password" autoComplete="new-password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder={status?.credentialReady ? '已安全保存；留空保持不变' : '输入后保存到系统凭据库'} /></label>
  </CapabilityFormShell>;
}
