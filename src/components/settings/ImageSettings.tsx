import { useState } from 'react';
import type { CapabilityStatusItem, ImageConfig } from '../../lib/types';
import { saveImageConfig, testImageConfig } from '../../lib/bridge';
import StyledSelect from '../StyledSelect';
import { bearerCredential, capabilityError, CapabilityFormShell, type CapabilityFeedback, ProviderFields } from './CapabilitySettingsShared';

export default function ImageSettings({ config, status, onChange, onStatusChange }: { config: ImageConfig; status?: CapabilityStatusItem; onChange: (config: ImageConfig) => void; onStatusChange: (status: CapabilityStatusItem) => void }) {
  const [apiKey, setApiKey] = useState('');
  const [busy, setBusy] = useState<'save' | 'test' | null>(null);
  const [feedback, setFeedback] = useState<CapabilityFeedback>(null);
  const save = async () => { setBusy('save'); setFeedback(null); try { const next = await saveImageConfig(config, bearerCredential(apiKey)); onStatusChange(next); setApiKey(''); setFeedback({ tone: 'success', text: '作图配置已保存。' }); } catch (cause) { setFeedback({ tone: 'warning', text: capabilityError(cause, '作图配置保存失败。') }); } finally { setBusy(null); } };
  const test = async () => { setBusy('test'); setFeedback(null); try { const result = await testImageConfig(); setFeedback({ tone: result.ok ? 'success' : 'warning', text: result.message }); } catch (cause) { setFeedback({ tone: 'warning', text: capabilityError(cause, '作图配置测试失败。') }); } finally { setBusy(null); } };
  return <CapabilityFormShell title="图片生成" description="仅在用户主动操作时生成笔记封面或概念图，不参与默认提炼流程。" capabilityName="作图" enabled={config.enabled} status={status} feedback={feedback} busy={busy} saveLabel="保存作图配置" testLabel="测试作图配置" onEnabledChange={(enabled) => onChange({ ...config, enabled })} onSave={() => void save()} onTest={() => void test()}>
    <ProviderFields label="作图" providerId={config.providerId} presets={[{ value: 'openai', label: 'OpenAI Compatible' }, { value: 'gemini', label: 'Google Gemini' }, { value: 'siliconflow', label: 'SiliconFlow' }]} onChange={(providerId) => onChange({ ...config, providerId })} />
    <label className="settings-field wide"><span>接口地址</span><input aria-label="作图接口地址" type="url" value={config.endpoint} onChange={(event) => onChange({ ...config, endpoint: event.target.value })} spellCheck={false} /></label>
    <label className="settings-field"><span>模型</span><input aria-label="作图模型" value={config.model} onChange={(event) => onChange({ ...config, model: event.target.value })} /></label>
    <label className="settings-field"><span>图片尺寸</span><StyledSelect label="图片尺寸" value={config.size} options={['1024x1024', '1536x1024', '1024x1536'].map((value) => ({ value, label: value }))} onChange={(size) => onChange({ ...config, size })} /></label>
    <label className="settings-field"><span>API Key</span><input aria-label="作图 API Key" type="password" autoComplete="new-password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder={status?.credentialReady ? '已安全保存；留空保持不变' : '输入后保存到系统凭据库'} /></label>
  </CapabilityFormShell>;
}
