import { useState } from 'react';
import type { CapabilityStatusItem, LocalAgentConfig, LocalAgentDetection } from '../../lib/types';
import { detectLocalAgents, saveLocalAgentConfig, testLocalAgentConfig } from '../../lib/bridge';
import { capabilityError, CapabilityFormShell, type CapabilityFeedback, ProviderFields } from './CapabilitySettingsShared';

export default function LocalAgentSettings({ config, status, onChange, onStatusChange }: { config: LocalAgentConfig; status?: CapabilityStatusItem; onChange: (config: LocalAgentConfig) => void; onStatusChange: (status: CapabilityStatusItem) => void }) {
  const [busy, setBusy] = useState<'save' | 'test' | null>(null);
  const [feedback, setFeedback] = useState<CapabilityFeedback>(null);
  const [detections, setDetections] = useState<LocalAgentDetection[]>([]);
  const save = async () => { setBusy('save'); setFeedback(null); try { const next = await saveLocalAgentConfig(config); onStatusChange(next); setFeedback({ tone: 'success', text: '本地智能体配置已保存。' }); } catch (cause) { setFeedback({ tone: 'warning', text: capabilityError(cause, '本地智能体配置保存失败。') }); } finally { setBusy(null); } };
  const test = async () => { setBusy('test'); setFeedback(null); try { const result = await testLocalAgentConfig(); setFeedback({ tone: result.ok ? 'success' : 'warning', text: result.message }); } catch (cause) { setFeedback({ tone: 'warning', text: capabilityError(cause, '本地智能体配置测试失败。') }); } finally { setBusy(null); } };
  const detect = async () => { setFeedback(null); try { const result = await detectLocalAgents(); setDetections(result); setFeedback({ tone: 'info', text: result.some((item) => item.executableFound) ? '已找到可用的本地智能体。' : '尚未找到已配置的本地智能体可执行文件。' }); } catch (cause) { setFeedback({ tone: 'warning', text: capabilityError(cause, '本地智能体检测失败。') }); } };
  return <CapabilityFormShell title="本地智能体" description="使用固定参数数组启动已配置的本地 CLI；不会通过 shell 执行，也不会后台自主运行。" capabilityName="本地智能体" enabled={config.enabled} status={status} feedback={feedback} busy={busy} saveLabel="保存本地智能体配置" testLabel="测试本地智能体配置" onEnabledChange={(enabled) => onChange({ ...config, enabled })} onSave={() => void save()} onTest={() => void test()} secondaryActions={<button type="button" className="secondary-action" onClick={() => void detect()}>检测本地智能体</button>}>
    <ProviderFields label="本地智能体" providerId={config.providerId} presets={[{ value: 'codex', label: 'Codex CLI' }, { value: 'claude-code', label: 'Claude Code' }, { value: 'opencode', label: 'OpenCode' }]} onChange={(providerId) => onChange({ ...config, providerId })} />
    <label className="settings-field wide"><span>可执行文件绝对路径</span><input aria-label="本地智能体可执行文件" value={config.executable} onChange={(event) => onChange({ ...config, executable: event.target.value })} placeholder="D:\\Tools\\agent.exe" spellCheck={false} /></label>
    <label className="settings-field wide"><span>启动参数（每行一个）</span><textarea aria-label="本地智能体启动参数" value={config.arguments.join('\n')} onChange={(event) => onChange({ ...config, arguments: event.target.value.split(/\r?\n/).filter(Boolean) })} placeholder="--model\nmodel-name" /></label>
    <label className="settings-field"><span>超时时间（秒）</span><input aria-label="本地智能体超时时间" type="number" min="1" max="1800" value={config.timeoutSeconds} onChange={(event) => onChange({ ...config, timeoutSeconds: Number(event.target.value) })} /></label>
    {detections.length > 0 && <div className="settings-field capability-detections" aria-label="本地智能体检测结果">{detections.map((item) => <span key={item.providerId}>{item.providerId} · {item.executableFound ? '可执行文件已找到' : '未找到'}</span>)}</div>}
  </CapabilityFormShell>;
}
