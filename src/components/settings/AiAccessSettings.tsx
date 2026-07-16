import { useEffect, useMemo, useState } from 'react';
import type { AppProfiles, CapabilitySettings, CapabilityStatus, CapabilityStatusItem, SummaryProviderCatalogEntry } from '../../lib/types';
import { getCapabilitySettings, getCapabilityStatus, getSummaryProviderCatalog, saveAndActivateCatalogSummaryProfile } from '../../lib/bridge';
import ProfileManager from '../ProfileManager';
import SearchableCombobox from '../SearchableCombobox';
import ImageSettings from './ImageSettings';
import LocalAgentSettings from './LocalAgentSettings';
import RerankSettings from './RerankSettings';
import TtsSettings from './TtsSettings';
import VectorSettings from './VectorSettings';
import WebSearchSettings from './WebSearchSettings';

type AiMode = 'llm' | 'vector' | 'rerank' | 'web' | 'tts' | 'image' | 'agent';

const aiModes: Array<{ id: AiMode; label: string }> = [
  { id: 'llm', label: '大模型' },
  { id: 'vector', label: '向量' },
  { id: 'rerank', label: '重排' },
  { id: 'web', label: '联网' },
  { id: 'tts', label: '语音' },
  { id: 'image', label: '作图' },
  { id: 'agent', label: '本地智能体' },
];

const protocolLabels: Record<string, string> = {
  'openai-compatible': 'OpenAI Compatible',
  'openai-responses': 'OpenAI Responses',
  anthropic: 'Anthropic Messages',
  google: 'Google Gemini',
};

export default function AiAccessSettings({ profiles, onProfilesChanged }: { profiles: AppProfiles; onProfilesChanged: () => void }) {
  const [mode, setMode] = useState<AiMode>('llm');
  const [showProfiles, setShowProfiles] = useState(false);
  const [createProfileRequest, setCreateProfileRequest] = useState(0);
  const [settings, setSettings] = useState<CapabilitySettings | null>(null);
  const [status, setStatus] = useState<CapabilityStatus | null>(null);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    let active = true;
    void Promise.all([getCapabilitySettings(), getCapabilityStatus()])
      .then(([nextSettings, nextStatus]) => {
        if (!active) return;
        setSettings(nextSettings);
        setStatus(nextStatus);
        setLoadError('');
      })
      .catch(() => {
        if (active) setLoadError('AI 扩展能力配置暂时无法读取，请重试或查看诊断日志。');
      });
    return () => { active = false; };
  }, []);

  const setStatusItem = (key: keyof CapabilityStatus, item: CapabilityStatusItem) => {
    setStatus((current) => current ? { ...current, [key]: item } : current);
  };

  return (
    <section className="settings-feature ai-access-workspace" aria-label="AI 接入设置">
      <header className="ai-access-header">
        <div className="settings-feature-header"><h2>AI 接入配置</h2><p>管理第三方 AI 服务商、模型、API 密钥和扩展能力。</p></div>
        <div className="settings-segments settings-segments-scroll" role="tablist" aria-label="AI 接入类型">
          {aiModes.map((item) => <button key={item.id} type="button" role="tab" aria-selected={mode === item.id} className={mode === item.id ? 'active' : ''} onClick={() => setMode(item.id)}>{item.label}</button>)}
        </div>
      </header>
      {mode === 'llm' && (
        <>
          <div className="ai-preset-actions">
            <button type="button" className="primary-action compact-action" onClick={() => { setShowProfiles(true); setCreateProfileRequest((value) => value + 1); }}>
              <span aria-hidden="true">+</span> 添加预设
            </button>
            <button type="button" className="secondary-action compact-action" aria-expanded={showProfiles} onClick={() => setShowProfiles((value) => !value)}>
              预设管理
            </button>
          </div>
          <LargeModelSettings profiles={profiles} onProfilesChanged={onProfilesChanged} onOpenProfiles={() => setShowProfiles(true)} />
          {showProfiles && <section className="ai-profile-manager" aria-label="总结服务"><ProfileManager profiles={profiles} onProfilesChanged={onProfilesChanged} defaultTab="summary" createRequest={createProfileRequest} /></section>}
        </>
      )}
      {mode !== 'llm' && loadError && <div className="settings-status warning" role="alert">{loadError}</div>}
      {mode !== 'llm' && !settings && !loadError && <div className="settings-status info" role="status">正在读取 AI 扩展能力配置…</div>}
      {settings && mode === 'vector' && <VectorSettings config={settings.vector} status={status?.vector} onChange={(vector) => setSettings({ ...settings, vector })} onStatusChange={(item) => setStatusItem('vector', item)} />}
      {settings && mode === 'rerank' && <RerankSettings config={settings.rerank} status={status?.rerank} onChange={(rerank) => setSettings({ ...settings, rerank })} onStatusChange={(item) => setStatusItem('rerank', item)} />}
      {settings && mode === 'web' && <WebSearchSettings config={settings.webSearch} status={status?.webSearch} onChange={(webSearch) => setSettings({ ...settings, webSearch })} onStatusChange={(item) => setStatusItem('webSearch', item)} />}
      {settings && mode === 'tts' && <TtsSettings config={settings.tts} status={status?.tts} onChange={(tts) => setSettings({ ...settings, tts })} onStatusChange={(item) => setStatusItem('tts', item)} />}
      {settings && mode === 'image' && <ImageSettings config={settings.image} status={status?.image} onChange={(image) => setSettings({ ...settings, image })} onStatusChange={(item) => setStatusItem('image', item)} />}
      {settings && mode === 'agent' && <LocalAgentSettings config={settings.localAgent} status={status?.localAgent} onChange={(localAgent) => setSettings({ ...settings, localAgent })} onStatusChange={(item) => setStatusItem('localAgent', item)} />}
    </section>
  );
}

function LargeModelSettings({ profiles, onProfilesChanged, onOpenProfiles }: { profiles: AppProfiles; onProfilesChanged: () => void; onOpenProfiles: () => void }) {
  const [catalog, setCatalog] = useState<SummaryProviderCatalogEntry[]>([]);
  const [providerId, setProviderId] = useState('');
  const [model, setModel] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [catalogRevision, setCatalogRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const activeProfile = profiles.summaryProfiles.find((profile) => profile.id === profiles.activeSummaryProfileId) ?? profiles.summaryProfiles[0];
  const selectedProvider = catalog.find((provider) => provider.id === providerId);
  const eligibleModels = selectedProvider?.models.filter((entry) => entry.summaryEligible) ?? [];
  const maskedApiKey = apiKey ? `${apiKey.slice(0, 3)}${'*'.repeat(Math.max(4, apiKey.length - 5))}${apiKey.slice(-2)}` : '保持已保存凭据';

  useEffect(() => {
    let active = true;
    setLoading(true);
    void getSummaryProviderCatalog()
      .then((nextCatalog) => {
        if (!active) return;
        const providers = Array.isArray(nextCatalog) ? nextCatalog : [];
        setCatalog(providers);
        const catalogId = activeProfile?.id.startsWith('catalog-') ? activeProfile.id.slice('catalog-'.length) : '';
        const initialProvider = providers.find((provider) => provider.id === catalogId)
          ?? providers.find((provider) => provider.baseUrl.replace(/\/$/, '') === activeProfile?.baseUrl.replace(/\/$/, ''))
          ?? providers[0];
        if (initialProvider) {
          setProviderId(initialProvider.id);
          const activeModel = activeProfile?.model.trim();
          setModel(activeModel || initialProvider.models.find((entry) => entry.summaryEligible)?.id || '');
          setBaseUrl(activeProfile?.id === `catalog-${initialProvider.id}` ? activeProfile.baseUrl : initialProvider.baseUrl);
        }
        setMessage(providers.length ? '' : 'AI 服务商目录为空，请检查应用资源。');
      })
      .catch((cause) => {
        if (active) setMessage(cause instanceof Error ? cause.message : '无法读取 AI 服务商目录。');
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [activeProfile?.baseUrl, activeProfile?.id, activeProfile?.model, catalogRevision]);

  const providerOptions = useMemo(() => catalog.map((provider) => ({
    value: provider.id,
    label: provider.displayName,
    description: `${protocolLabels[provider.protocol] ?? provider.protocol} · ${provider.models.length} 个模型`,
  })), [catalog]);
  const modelOptions = useMemo(() => (selectedProvider?.models ?? []).map((entry) => ({
    value: entry.id,
    label: entry.name || entry.id,
    description: entry.summaryEligible
      ? `${entry.id}${entry.family ? ` · ${entry.family}` : ''}`
      : `${entry.id} · ${entry.summaryIneligibleReason || '不支持文本总结'}`,
    disabled: !entry.summaryEligible,
  })), [selectedProvider]);

  const selectProvider = (nextProviderId: string) => {
    const nextProvider = catalog.find((provider) => provider.id === nextProviderId);
    if (!nextProvider) return;
    setProviderId(nextProvider.id);
    setBaseUrl(nextProvider.baseUrl);
    setModel(nextProvider.models.find((entry) => entry.summaryEligible)?.id ?? '');
    setMessage('');
  };

  const refreshCatalog = () => {
    setMessage('');
    setCatalogRevision((value) => value + 1);
  };

  const save = async () => {
    if (!selectedProvider || !model.trim() || saving) return;
    setSaving(true);
    setMessage('');
    try {
      await saveAndActivateCatalogSummaryProfile({
        providerId: selectedProvider.id,
        model: model.trim(),
        baseUrlOverride: baseUrl.trim() && baseUrl.trim().replace(/\/$/, '') !== selectedProvider.baseUrl.replace(/\/$/, '') ? baseUrl.trim() : undefined,
        credential: apiKey.trim() ? { type: 'bearer', apiKey: apiKey.trim() } : undefined,
      });
      setApiKey('');
      setMessage('服务商与模型已保存并启用。');
      onProfilesChanged();
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : '保存并启用 AI 服务失败。');
    } finally {
      setSaving(false);
    }
  };
  return <div className="settings-two-column llm-layout" role="tabpanel">
    <article className="settings-surface ai-connection-card">
      <div className="settings-card-heading">
        <div><h3>接入参数</h3><p>从内置 models.dev 目录选择服务商与模型，保存后立即设为当前服务。</p></div>
        <div className="provider-avatar provider-avatar-small" aria-hidden="true">{selectedProvider?.displayName.slice(0, 1) ?? '?'}</div>
      </div>
      <div className="settings-form-grid ai-provider-form">
        <label className="settings-field wide"><span>服务商</span><SearchableCombobox label="搜索 AI 服务商" value={providerId} options={providerOptions} onChange={selectProvider} placeholder={loading ? '正在读取服务商目录…' : `搜索 ${catalog.length || 116} 家服务商`} disabled={loading} /></label>
        <label className="settings-field"><span>服务地址</span><input aria-label="AI 服务地址" value={baseUrl} onChange={(event) => setBaseUrl(event.currentTarget.value)} placeholder={selectedProvider?.baseUrl ?? 'https://…'} spellCheck={false} /></label>
        <label className="settings-field"><span>协议</span><div className="readonly-setting" aria-label="AI 协议">{selectedProvider ? protocolLabels[selectedProvider.protocol] ?? selectedProvider.protocol : '—'}</div></label>
        <label className="settings-field wide"><span>API Key</span><div className="input-with-action"><input aria-label="AI API Key" type={showApiKey ? 'text' : 'password'} autoComplete="new-password" value={apiKey} onChange={(event) => setApiKey(event.currentTarget.value)} placeholder="留空保持已保存凭据" /><button type="button" className="field-icon-action" aria-label={showApiKey ? '隐藏 API Key' : '显示 API Key'} onClick={() => setShowApiKey((value) => !value)}>{showApiKey ? '隐藏' : '显示'}</button></div></label>
        <label className="settings-field wide"><span>模型</span><div className="model-field-row"><SearchableCombobox label="搜索或输入 AI 模型" value={model} options={modelOptions} onChange={setModel} allowCustom placeholder={selectedProvider ? `搜索 ${selectedProvider.models.length} 个模型或输入自定义 ID` : '先选择服务商'} disabled={!selectedProvider} /><button type="button" className="field-icon-action model-refresh-action" aria-label="刷新模型列表" disabled={loading} onClick={refreshCatalog}>刷新</button></div></label>
      </div>
      <div className="settings-actions ai-card-footer"><button type="button" className="secondary-action compact-action" onClick={onOpenProfiles}>测试连接</button><button type="button" className="primary-action compact-action" aria-label="保存并启用" disabled={!selectedProvider || !model.trim() || saving || loading} onClick={() => void save()}>{saving ? '保存中…' : '保存当前服务商'}</button></div>
      {message && <div className={`settings-status ${message.includes('已保存') ? 'success' : 'warning'}`} role={message.includes('已保存') ? 'status' : 'alert'}>{message}</div>}
    </article>
    <aside className="provider-side-stack">
      <section className="settings-surface provider-summary">
        <div className="provider-summary-header"><div className="provider-avatar">{selectedProvider?.displayName.slice(0, 1) ?? '?'}</div><div><h3>{selectedProvider?.displayName ?? '未选择服务商'}</h3><p>{selectedProvider?.description || 'OpenAI 兼容接口'}</p></div></div>
        <dl><div><dt>协议</dt><dd>{selectedProvider ? protocolLabels[selectedProvider.protocol] ?? selectedProvider.protocol : '—'}</dd></div><div><dt>模型</dt><dd title={model}>{model || '未选择'}</dd></div><div><dt>密钥</dt><dd>{maskedApiKey}</dd></div><div><dt>可总结模型</dt><dd>{eligibleModels.length}</dd></div><div><dt>地址</dt><dd title={baseUrl}>{baseUrl || '—'}</dd></div></dl>
      </section>
      <div className="settings-status local-save-notice"><strong>本地保存</strong><span>API Key 仅保存在本地。模型刷新与连接测试会向当前服务商发起请求。</span></div>
    </aside>
  </div>;
}
