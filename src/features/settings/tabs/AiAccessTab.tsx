import { useEffect, useMemo, useState } from 'react';
import { Card, Button } from '@heroui/react';
import { Sparkles, VectorCircle, ArrowRightArrowLeft, Globe, Display, Picture, FaceRobot, CircleCheck, CircleExclamation } from '@gravity-ui/icons';
import { settingsPlatform } from '../../../platform/settings';
import type {
  SummaryProviderCatalogEntry,
  CapabilitySettings,
  CapabilityStatus,
  CapabilityStatusItem,
} from '../../../lib/types';
import type { SettingsEntryProps } from '../settingsTypes';

const PROTOCOL_LABELS: Record<string, string> = {
  openai: 'OpenAI Compatible',
  openai_responses: 'OpenAI Responses',
  anthropic: 'Anthropic Messages',
  google: 'Google Gemini',
};

type SecretDraft = { type: 'bearer'; apiKey: string } | { type: 'tencent'; appId: string; secretId: string; secretKey: string } | null;

type AiSubTab = 'summary' | 'vector' | 'rerank' | 'websearch' | 'tts' | 'image' | 'agent';

const subTabs: Array<{ id: AiSubTab; label: string; icon: React.ElementType }> = [
  { id: 'summary', label: '大语言模型', icon: Sparkles },
  { id: 'vector', label: '向量', icon: VectorCircle },
  { id: 'rerank', label: '重排', icon: ArrowRightArrowLeft },
  { id: 'websearch', label: '联网', icon: Globe },
  { id: 'tts', label: '语音', icon: Display },
  { id: 'image', label: '作图', icon: Picture },
  { id: 'agent', label: '本地智能体', icon: FaceRobot },
];

export default function AiAccessTab({ profiles, onProfilesChanged }: SettingsEntryProps) {
  const [catalog, setCatalog] = useState<SummaryProviderCatalogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null);
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
  const [baseUrlOverride, setBaseUrlOverride] = useState('');
  const [secretDraft, setSecretDraft] = useState<SecretDraft>(null);
  const [credentialSaved, setCredentialSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [activeSubTab, setActiveSubTab] = useState<AiSubTab>('summary');
  const [capSettings, setCapSettings] = useState<CapabilitySettings | null>(null);
  const [capStatus, setCapStatus] = useState<CapabilityStatus | null>(null);
  const [capError, setCapError] = useState<string | null>(null);
  const [capTesting, setCapTesting] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      settingsPlatform.ai.getCatalog(),
      settingsPlatform.ai.getCapabilitySettings(),
      settingsPlatform.ai.getCapabilityStatus(),
    ]).then(([entries, settings, status]) => {
      setCatalog(entries);
      setCapSettings(settings);
      setCapStatus(status);
      setLoading(false);
    }).catch((e) => {
      setError(`加载目录失败: ${e instanceof Error ? e.message : String(e)}`);
      setLoading(false);
    });
  }, []);

  // Filter providers by search — never slice to 20, show all
  const filteredProviders = useMemo(() => {
    if (!search.trim()) return catalog;
    const q = search.toLowerCase();
    return catalog.filter(
      (p) => p.displayName.toLowerCase().includes(q) || p.id.toLowerCase().includes(q) || p.description.toLowerCase().includes(q),
    );
  }, [catalog, search]);

  const selectedProvider = useMemo(
    () => catalog.find((p) => p.id === selectedProviderId) ?? null,
    [catalog, selectedProviderId],
  );

  const selectedModel = useMemo(
    () => selectedProvider?.models.find((m) => m.id === selectedModelId) ?? null,
    [selectedProvider, selectedModelId],
  );

  const handleSelectProvider = (provider: SummaryProviderCatalogEntry) => {
    setSelectedProviderId(provider.id);
    setSelectedModelId(null);
    setBaseUrlOverride('');
    setSecretDraft(null);
    setError(null);
    setSuccess(null);
    // Check if credential already saved
    settingsPlatform.ai.hasCredential("summary", provider.id).then((has) => setCredentialSaved(has)).catch(() => setCredentialSaved(false));
  };

  const handleSave = async () => {
    if (!selectedProviderId || !selectedModelId) {
      setError('请选择服务商和模型');
      return;
    }
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const input = {
        providerId: selectedProviderId,
        model: selectedModelId,
        baseUrlOverride: baseUrlOverride.trim() || undefined,
        credential: secretDraft ?? undefined,
      };
      await settingsPlatform.ai.saveAndActivate(input);
      onProfilesChanged();
      setCredentialSaved(true);
      setSecretDraft(null);
      setSuccess(`已保存并激活 ${selectedProvider?.displayName ?? ''} / ${selectedModel?.name ?? ''}`);
    } catch (e) {
      setError(`保存失败: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSaving(false);
    }
  };

  // Capability settings handlers
  const handleSaveCapability = async (capability: AiSubTab, config: unknown) => {
    setCapError(null);
    try {
      switch (capability) {
        case 'vector': await settingsPlatform.ai.saveVector(config as never); break;
        case 'rerank': await settingsPlatform.ai.saveRerank(config as never); break;
        case 'websearch': await settingsPlatform.ai.saveWebSearch(config as never); break;
        case 'tts': await settingsPlatform.ai.saveTts(config as never); break;
        case 'image': await settingsPlatform.ai.saveImage(config as never); break;
        case 'agent': await settingsPlatform.ai.saveLocalAgent(config as never); break;
        default: return;
      }
      const [settings, status] = await Promise.all([
        settingsPlatform.ai.getCapabilitySettings(),
        settingsPlatform.ai.getCapabilityStatus(),
      ]);
      setCapSettings(settings);
      setCapStatus(status);
    } catch (e) {
      setCapError(`保存失败: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const handleTestCapability = async (capability: AiSubTab) => {
    setCapTesting(capability);
    setCapError(null);
    try {
      switch (capability) {
        case 'vector': await settingsPlatform.ai.testVector(); break;
        case 'rerank': await settingsPlatform.ai.testRerank(); break;
        case 'websearch': await settingsPlatform.ai.testWebSearch(); break;
        case 'tts': await settingsPlatform.ai.testTts(); break;
        case 'image': await settingsPlatform.ai.testImage(); break;
        case 'agent': await settingsPlatform.ai.testLocalAgent(); break;
        default: return;
      }
      const status = await settingsPlatform.ai.getCapabilityStatus();
      setCapStatus(status);
    } catch (e) {
      setCapError(`测试失败: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setCapTesting(null);
    }
  };

  if (loading) {
    return <div role="status">正在加载服务商目录...</div>;
  }

  return (
    <div className="cipher-ai-tab">
      <header className="cipher-feature-header">
        <h2>AI 接入</h2>
        <p>配置大语言模型和 AI 能力服务。</p>
      </header>

      {/* Sub-tab navigation */}
      <nav className="cipher-ai-subnav" aria-label="AI 能力">
        {subTabs.map((tab) => (
          <button
            key={tab.id}
            className={`cipher-ai-subtab ${activeSubTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveSubTab(tab.id)}
            aria-current={activeSubTab === tab.id ? 'page' : undefined}
          >
            <tab.icon width={16} height={16} /> {tab.label}
          </button>
        ))}
      </nav>

      {error && <div role="alert" className="cipher-error-banner"><CircleExclamation width={16} /> {error}</div>}
      {success && <div role="status" className="cipher-success-banner"><CircleCheck width={16} /> {success}</div>}

      {activeSubTab === 'summary' && (
        <div className="cipher-ai-summary-section">
          {/* Already configured profiles */}
          <div className="cipher-ai-profiles">
            <h3>已配置 ({profiles.summaryProfiles.length})</h3>
            {profiles.summaryProfiles.map((profile) => (
              <Card key={profile.id} className="cipher-profile-card">
                <div className="cipher-model-header">
                  <div>
                    <strong>{profile.name}</strong>
                    <span className="cipher-model-size">{PROTOCOL_LABELS[profile.provider] ?? profile.provider}</span>
                  </div>
                  {profile.enabled && <span className="cipher-active-chip"><CircleCheck width={14} />已激活</span>}
                </div>
                <div className="cipher-model-status">
                  <span>模型：{profile.model ?? '未设置'}</span>
                </div>
              </Card>
            ))}
          </div>

          {/* Searchable provider catalog */}
          <div className="cipher-catalog-section">
            <h3>可用服务商 ({catalog.length})</h3>
            <input
              type="search"
              className="cipher-catalog-search"
              placeholder="搜索服务商..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="搜索 AI 服务商"
            />

            <div className="cipher-catalog-list">
              {filteredProviders.map((provider) => (
                <Card
                  key={provider.id}
                  className={`cipher-catalog-card ${selectedProviderId === provider.id ? 'selected' : ''}`}
                  onClick={() => handleSelectProvider(provider)}
                  role="button"
                  tabIndex={0}
                >
                  <div className="cipher-model-header">
                    <div>
                      <strong>{provider.displayName}</strong>
                      <span className="cipher-model-size">{PROTOCOL_LABELS[provider.protocol] ?? provider.protocol}</span>
                    </div>
                    {selectedProviderId === provider.id && <CircleCheck width={14} />}
                  </div>
                  <div className="cipher-model-desc">{provider.description}</div>
                  <div className="cipher-model-mini">{provider.models?.length ?? 0} 个模型</div>
                </Card>
              ))}
              {filteredProviders.length === 0 && <p className="cipher-empty-state">未找到匹配的服务商。</p>}
            </div>
          </div>

          {/* Model selection and credential input */}
          {selectedProvider && (
            <div className="cipher-provider-detail">
              <h3>{selectedProvider.displayName}</h3>
              <p className="cipher-model-desc">{selectedProvider.description}</p>
              <div className="cipher-field">协议：{PROTOCOL_LABELS[selectedProvider.protocol] ?? selectedProvider.protocol}</div>

              {/* Model selection */}
              <div className="cipher-field-group">
                <label htmlFor="ai-model-select">模型</label>
                <select
                  id="ai-model-select"
                  className="cipher-select"
                  value={selectedModelId ?? ''}
                  onChange={(e) => setSelectedModelId(e.target.value || null)}
                >
                  <option value="">请选择模型</option>
                  {selectedProvider.models.map((model) => (
                    <option key={model.id} value={model.id} disabled={!model.summaryEligible}>
                      {model.name}{!model.summaryEligible ? `（${model.summaryIneligibleReason ?? '不支持摘要'}）` : ''}
                    </option>
                  ))}
                </select>
              </div>

              {selectedModel && !selectedModel.summaryEligible && (
                <div role="alert" className="cipher-error-banner">
                  该模型不支持摘要：{selectedModel.summaryIneligibleReason ?? '未知原因'}
                </div>
              )}

              {/* Base URL */}
              <div className="cipher-field-group">
                <label htmlFor="ai-baseurl-input">Base URL</label>
                <input
                  id="ai-baseurl-input"
                  type="text"
                  className="cipher-input"
                  placeholder={selectedProvider.baseUrl}
                  value={baseUrlOverride}
                  onChange={(e) => setBaseUrlOverride(e.target.value)}
                />
              </div>

              {/* Credential status */}
              <div className="cipher-credential-status">
                {credentialSaved ? (
                  <span className="cipher-credential-saved"><CircleCheck width={14} /> 凭据已保存</span>
                ) : (
                  <span className="cipher-credential-missing"><CircleExclamation width={14} /> 凭据未设置</span>
                )}
              </div>

              {/* API Key draft input */}
              <div className="cipher-field-group">
              <label htmlFor="ai-apikey-input">API Key（仅本次输入，不会读取已保存的密钥）</label>
              <input
                id="ai-apikey-input"
                type="password"
                className="cipher-input"
                placeholder="输入 API Key…"
                value={secretDraft?.type === 'bearer' ? secretDraft.apiKey : ''}
                onChange={(e) => setSecretDraft(e.target.value ? { type: 'bearer', apiKey: e.target.value } : null)}
              />
              </div>

              {/* Save and Activate */}
              <Button
                variant="primary"
                onClick={handleSave}
                isDisabled={saving || !selectedModelId || !selectedModel?.summaryEligible}
              >
                {saving ? '保存中…' : '保存并激活'}
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Capability sub-tabs */}
      {activeSubTab !== 'summary' && capSettings && (
        <CapabilityPanel
          capability={activeSubTab}
          settings={capSettings}
          status={capStatus}
          error={capError}
          testing={capTesting}
          onSave={handleSaveCapability}
          onTest={handleTestCapability}
        />
      )}
    </div>
  );
}

function CapabilityPanel({
  capability,
  settings,
  status,
  error,
  testing,
  onSave,
  onTest,
}: {
  capability: AiSubTab;
  settings: CapabilitySettings;
  status: CapabilityStatus | null;
  error: string | null;
  testing: string | null;
  onSave: (cap: AiSubTab, config: unknown) => void;
  onTest: (cap: AiSubTab) => void;
}) {
  const labels: Record<string, string> = {
    vector: '向量搜索',
    rerank: '重排',
    websearch: '联网搜索',
    tts: '语音合成',
    image: '图片生成',
    agent: '本地智能体',
  };

  const configMap: Record<string, unknown> = {
    vector: settings.vector,
    rerank: settings.rerank,
    websearch: settings.webSearch,
    tts: settings.tts,
    image: settings.image,
    agent: settings.localAgent,
  };

  const statusMap: Record<string, CapabilityStatusItem | undefined> = {
    vector: status?.vector,
    rerank: status?.rerank,
    websearch: status?.webSearch,
    tts: status?.tts,
    image: status?.image,
    agent: status?.localAgent,
  };

  const config = configMap[capability] as Record<string, unknown>;
  const statusItem = statusMap[capability];
  const [draft, setDraft] = useState(config);

  useEffect(() => { setDraft(config); }, [JSON.stringify(config)]);

  const handleFieldChange = (field: string, value: unknown) => {
    setDraft((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <div className="cipher-capability-section">
      <h3>{labels[capability]}</h3>

      {statusItem && (
        <div className="cipher-capability-status">
          {statusItem.enabled && <span className="cipher-active-chip"><CircleCheck width={14} />已启用</span>}
          {statusItem.configured && <span className="cipher-active-chip"><CircleCheck width={14} />已配置</span>}
          {statusItem.credentialReady ? (
            <span className="cipher-credential-saved"><CircleCheck width={14} />凭据就绪</span>
          ) : (
            <span className="cipher-credential-missing"><CircleExclamation width={14} />凭据未设置</span>
          )}
        </div>
      )}

      <div className="cipher-field-group">
        <label>
          <input type="checkbox" checked={Boolean(draft.enabled)} onChange={(e) => handleFieldChange('enabled', e.target.checked)} />
          启用
        </label>
      </div>

      <div className="cipher-field-group">
        <label>服务商标识</label>
        <input type="text" value={String(draft.providerId ?? '')} onChange={(e) => handleFieldChange('providerId', e.target.value)} />
      </div>

      <div className="cipher-field-group">
        <label>端点</label>
        <input type="text" value={String(draft.endpoint ?? '')} onChange={(e) => handleFieldChange('endpoint', e.target.value)} />
      </div>

      {'model' in draft && (
        <div className="cipher-field-group">
          <label>模型</label>
          <input type="text" value={String(draft.model ?? '')} onChange={(e) => handleFieldChange('model', e.target.value)} />
        </div>
      )}

      {'collection' in draft && (
        <div className="cipher-field-group">
          <label>集合</label>
          <input type="text" value={String(draft.collection ?? '')} onChange={(e) => handleFieldChange('collection', e.target.value)} />
        </div>
      )}

      {'dimensions' in draft && (
        <div className="cipher-field-group">
          <label>维度</label>
          <input type="number" value={Number(draft.dimensions ?? 0)} onChange={(e) => handleFieldChange('dimensions', e.target.value ? Number(e.target.value) : null)} />
        </div>
      )}

      {'maxResults' in draft && (
        <div className="cipher-field-group">
          <label>最大结果数</label>
          <input type="number" value={Number(draft.maxResults ?? 10)} onChange={(e) => handleFieldChange('maxResults', Number(e.target.value))} />
        </div>
      )}

      {'voice' in draft && (
        <div className="cipher-field-group">
          <label>语音</label>
          <input type="text" value={String(draft.voice ?? '')} onChange={(e) => handleFieldChange('voice', e.target.value)} />
        </div>
      )}

      {'size' in draft && (
        <div className="cipher-field-group">
          <label>尺寸</label>
          <input type="text" value={String(draft.size ?? '')} onChange={(e) => handleFieldChange('size', e.target.value)} />
        </div>
      )}

      {'executable' in draft && (
        <div className="cipher-field-group">
          <label>可执行文件</label>
          <input type="text" value={String(draft.executable ?? '')} onChange={(e) => handleFieldChange('executable', e.target.value)} />
        </div>
      )}

      {'arguments' in draft && (
        <div className="cipher-field-group">
          <label>参数（逗号分隔）</label>
          <input
            type="text"
            value={Array.isArray(draft.arguments) ? (draft.arguments as string[]).join(', ') : ''}
            onChange={(e) => handleFieldChange('arguments', e.target.value.split(',').map((s) => s.trim()).filter(Boolean))}
          />
        </div>
      )}

      {'timeoutSeconds' in draft && (
        <div className="cipher-field-group">
          <label>超时（秒）</label>
          <input type="number" value={Number(draft.timeoutSeconds ?? 60)} onChange={(e) => handleFieldChange('timeoutSeconds', Number(e.target.value))} />
        </div>
      )}

      {error && <div role="alert" className="cipher-error-banner"><CircleExclamation width={16} /> {error}</div>}

      <div className="cipher-model-actions">
        <Button variant="primary" onClick={() => onSave(capability, draft)}>保存</Button>
        <Button variant="ghost" onClick={() => onTest(capability)} isDisabled={testing === capability}>
          {testing === capability ? '测试中…' : '测试连接'}
        </Button>
      </div>
    </div>
  );
}
