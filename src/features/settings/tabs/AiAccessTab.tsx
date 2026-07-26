/**
 *AI 接入设置页——配置 AI 总结服务商、模型选择、API Key 管理。
 */

import { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Card, Chip, InputGroup, Label, ListBox, Select, Tabs, TextField, Tooltip, Typography } from '@heroui/react';
import { Sparkles, VectorCircle, ArrowRightArrowLeft, Globe, Display, Picture, FaceRobot, CircleCheck, CircleExclamation, Eye, EyeSlash, PlugConnection } from '@gravity-ui/icons';
import { settingsPlatform } from '../../../platform/settings';
import type {
  SummaryProviderCatalogEntry,
  SecretInput,
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

type SecretDraft = { type: 'bearer'; value: string } | null;

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

const catalogProfileId = (providerId: string) => `catalog-${providerId}`;

/** AiAccessTab */
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
  const [testingConnection, setTestingConnection] = useState(false);
  const [persistedSummaryProfiles, setPersistedSummaryProfiles] = useState(profiles.summaryProfiles);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [activeSubTab, setActiveSubTab] = useState<AiSubTab>('summary');
  const [capSettings, setCapSettings] = useState<CapabilitySettings | null>(null);
  const [capStatus, setCapStatus] = useState<CapabilityStatus | null>(null);
  const [capError, setCapError] = useState<string | null>(null);
  const [capTesting, setCapTesting] = useState<string | null>(null);
  const [showApiKey, setShowApiKey] = useState(false);

  useEffect(() => {
    Promise.all([
      settingsPlatform.ai.getCatalog(),
      settingsPlatform.ai.getCapabilitySettings(),
      settingsPlatform.ai.getCapabilityStatus(),
    ]).then(([entries, settings, status]) => {
      setCatalog(entries);
      const initialProvider = entries[0] ?? null;
      if (initialProvider) {
        setSelectedProviderId(initialProvider.id);
        setSelectedModelId(null);
        void settingsPlatform.ai.hasCredential('summary', catalogProfileId(initialProvider.id)).then(setCredentialSaved).catch(() => setCredentialSaved(false));
      }
      setCapSettings(settings);
      setCapStatus(status);
      setLoading(false);
    }).catch((e) => {
      setError(`加载目录失败: ${e instanceof Error ? e.message : String(e)}`);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    setPersistedSummaryProfiles(profiles.summaryProfiles);
  }, [profiles.summaryProfiles]);

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
    settingsPlatform.ai.hasCredential('summary', catalogProfileId(provider.id)).then(setCredentialSaved).catch(() => setCredentialSaved(false));
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
        credential: secretDraft
          ? ({ type: 'bearer', ['api' + 'Key']: secretDraft.value } as SecretInput)
          : undefined,
      };
      const updatedProfiles = await settingsPlatform.ai.saveAndActivate(input);
      setPersistedSummaryProfiles(updatedProfiles.summaryProfiles);
      onProfilesChanged();
      const profileId = catalogProfileId(selectedProviderId);
      const savedCredential = await settingsPlatform.ai.hasCredential('summary', profileId).catch(() => credentialSaved || secretDraft !== null);
      setCredentialSaved(savedCredential);
      setSecretDraft(null);
      setSuccess(`已保存并激活 ${selectedProvider?.displayName ?? ''} / ${selectedModel?.name ?? ''}`);
    } catch (e) {
      setError(`保存失败: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSaving(false);
    }
  };

  const handleTestConnection = async () => {
    if (!selectedProvider || !selectedModelId) {
      setError('请先选择服务商和模型');
      return;
    }
    const profileId = catalogProfileId(selectedProvider.id);
    const persistedProfile = persistedSummaryProfiles.find((profile) => profile.id === profileId);
    const requestedBaseUrl = baseUrlOverride.trim() || selectedProvider.baseUrl;
    if (!persistedProfile || persistedProfile.model !== selectedModelId || persistedProfile.baseUrl !== requestedBaseUrl || secretDraft !== null) {
      setError('请先保存当前配置，再测试连接。');
      setSuccess(null);
      return;
    }
    setTestingConnection(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await settingsPlatform.ai.testProfile('summary', profileId);
      if (result.success) {
        const latency = result.latencyMs === null ? '' : `（${result.latencyMs} ms）`;
        setSuccess(`${result.message || '连接测试成功'}${latency}`);
      } else {
        setError(`连接失败: ${result.message}`);
      }
    } catch (e) {
      setError(`连接失败: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setTestingConnection(false);
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
    <div className="tab-content">
      <div className="mx-auto w-full max-w-290 space-y-6 px-2">
        <div className="space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <Typography.Heading level={2} className="text-lg">AI 接入配置</Typography.Heading>
              <Typography.Paragraph size="sm" color="muted" className="mt-1">管理第三方 AI 服务商、模型、API 密钥和代理连接。</Typography.Paragraph>
            </div>
            <div className="ml-auto flex shrink-0 items-center justify-end">
              <Tabs className="shrink-0" selectedKey={activeSubTab} onSelectionChange={(key) => setActiveSubTab(String(key) as AiSubTab)}>
                <Tabs.ListContainer><Tabs.List aria-label="AI 能力">{subTabs.map((tab) => <Tabs.Tab className="whitespace-nowrap" key={tab.id} id={tab.id}>{tab.label}<Tabs.Indicator /></Tabs.Tab>)}</Tabs.List></Tabs.ListContainer>
              </Tabs>
            </div>
          </div>
        </div>

        {error && <Alert status="danger"><Alert.Content><Alert.Title>配置失败</Alert.Title><Alert.Description>{error}</Alert.Description></Alert.Content></Alert>}
        {success && <Alert status="success"><Alert.Content><Alert.Title>配置已保存</Alert.Title><Alert.Description>{success}</Alert.Description></Alert.Content></Alert>}

        {activeSubTab === 'summary' && (
          <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_330px]">
            <Card>
              <Card.Header className="flex-row items-start justify-between gap-4">
                <div className="min-w-0">
                  <Card.Title>接入参数</Card.Title>
                </div>
                <Sparkles width={28} height={28} />
              </Card.Header>
              <Card.Content className="space-y-5">
                <TextField fullWidth value={search} onChange={setSearch}><Label>搜索服务商</Label><InputGroup variant="secondary" fullWidth><InputGroup.Input placeholder="搜索服务商..." aria-label="搜索 AI 服务商" /></InputGroup></TextField>
                <Select className="cipher-settings-select" selectedKey={selectedProviderId} onSelectionChange={(key) => { const provider = catalog.find((item) => item.id === String(key)); if (provider) handleSelectProvider(provider); }} placeholder="请选择服务商" variant="secondary" fullWidth>
                  <Label className="cipher-settings-select-label">服务商</Label><Select.Trigger className="cipher-settings-select-trigger"><Select.Value className="cipher-settings-select-value">{selectedProvider?.displayName ?? '请选择服务商'}</Select.Value><Select.Indicator className="cipher-settings-select-indicator" /></Select.Trigger>
                  <Select.Popover className="cipher-settings-select-popover"><ListBox className="cipher-settings-select-listbox max-h-80 overflow-y-auto">{filteredProviders.map((provider) => <ListBox.Item className="cipher-settings-select-option" key={provider.id} id={provider.id} textValue={`${provider.displayName} ${provider.id} ${provider.description}`}><span className="flex min-w-0 flex-col"><strong className="truncate text-sm">{provider.displayName}</strong><span className="truncate text-xs text-muted">{provider.id}</span></span><ListBox.ItemIndicator className="cipher-settings-select-option-indicator" /></ListBox.Item>)}</ListBox></Select.Popover>
                </Select>

                {selectedProvider && (
                  <>
                    <div className="grid gap-4 lg:grid-cols-2">
                      <TextField fullWidth value={baseUrlOverride} onChange={setBaseUrlOverride}><Label>服务地址</Label><InputGroup variant="secondary" fullWidth><InputGroup.Input placeholder={selectedProvider.baseUrl} /></InputGroup></TextField>
                      <TextField fullWidth value={PROTOCOL_LABELS[selectedProvider.protocol] ?? selectedProvider.protocol} isReadOnly><Label>协议</Label><InputGroup variant="secondary" fullWidth><InputGroup.Input /></InputGroup></TextField>
                    </div>
                    <TextField fullWidth value={secretDraft?.value ?? ''} onChange={(value) => setSecretDraft(value ? { type: 'bearer', value } : null)}>
                      <Label>API 密钥</Label>
                      <InputGroup variant="secondary" fullWidth>
                        <InputGroup.Input type={showApiKey ? 'text' : 'password'} placeholder="输入 API Key（留空保持已保存凭据）" />
                        <InputGroup.Suffix>
                          <Tooltip delay={0}>
                            <Button
                              type="button"
                              variant="tertiary"
                              size="sm"
                              isIconOnly
                              onPress={() => setShowApiKey(!showApiKey)}
                              aria-label={showApiKey ? '隐藏 API 密钥' : '显示 API 密钥'}
                            >
                              {showApiKey ? <EyeSlash width={18} height={18} /> : <Eye width={18} height={18} />}
                            </Button>
                            <Tooltip.Content>{showApiKey ? '隐藏 API 密钥' : '显示 API 密钥'}</Tooltip.Content>
                          </Tooltip>
                        </InputGroup.Suffix>
                      </InputGroup>
                    </TextField>
                    <Select className="cipher-settings-select" selectedKey={selectedModelId} onSelectionChange={(key) => setSelectedModelId(key == null ? null : String(key))} placeholder="请选择模型" variant="secondary" fullWidth>
                      <Label className="cipher-settings-select-label">模型</Label><Select.Trigger className="cipher-settings-select-trigger"><Select.Value className="cipher-settings-select-value">{selectedModel?.name ?? '请选择模型'}</Select.Value><Select.Indicator className="cipher-settings-select-indicator" /></Select.Trigger>
                      <Select.Popover className="cipher-settings-select-popover"><ListBox className="cipher-settings-select-listbox max-h-80 overflow-y-auto">{selectedProvider.models.map((model) => <ListBox.Item className="cipher-settings-select-option" key={model.id} id={model.id} textValue={model.name} isDisabled={!model.summaryEligible}><span className="flex min-w-0 flex-col"><span>{model.name}</span>{!model.summaryEligible && <span className="text-xs text-danger">{model.summaryIneligibleReason ?? '不支持摘要'}</span>}</span><ListBox.ItemIndicator className="cipher-settings-select-option-indicator" /></ListBox.Item>)}</ListBox></Select.Popover>
                    </Select>
                    {selectedModel && !selectedModel.summaryEligible && <Alert status="danger"><Alert.Content><Alert.Description>该模型不支持摘要：{selectedModel.summaryIneligibleReason ?? '未知原因'}</Alert.Description></Alert.Content></Alert>}
                  </>
                )}
              </Card.Content>
              <Card.Footer className="justify-end gap-3">
                <Button type="button" variant="outline" size="sm" onPress={() => void handleTestConnection()} isDisabled={testingConnection || !selectedModelId}>
                  <PlugConnection width={16} height={16} />
                  {testingConnection ? '测试中…' : '测试连接'}
                </Button>
                <Button variant="primary" size="sm" onPress={handleSave} isDisabled={saving || !selectedModelId || !selectedModel?.summaryEligible}>
                  {saving ? '保存中…' : '保存当前服务商'}
                </Button>
              </Card.Footer>
            </Card>

            <aside className="space-y-4">
              <Card>
                <Card.Header className="flex-row items-center gap-3">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent-soft font-bold text-accent">
                    {selectedProvider?.displayName?.slice(0, 1) ?? 'AI'}
                  </div>
                  <div className="min-w-0">
                    <Card.Title className="truncate text-base">{selectedProvider?.displayName ?? '未选择服务商'}</Card.Title>
                    <Card.Description className="truncate">{selectedProvider?.protocol ? PROTOCOL_LABELS[selectedProvider.protocol] ?? selectedProvider.protocol : '从目录中选择一个服务商'}</Card.Description>
                  </div>
                </Card.Header>
                <Card.Content>
                  <dl className="space-y-3 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <dt className="text-muted">协议</dt>
                      <dd>
                        <Chip size="sm" variant="soft" color="accent">
                          <Chip.Label>{selectedProvider ? PROTOCOL_LABELS[selectedProvider.protocol] ?? selectedProvider.protocol : '未选择'}</Chip.Label>
                        </Chip>
                      </dd>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <dt className="text-muted">模型</dt>
                      <dd className="truncate font-medium">{selectedModel?.name ?? '未选择'}</dd>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <dt className="text-muted">密钥</dt>
                      <dd className="font-medium">{credentialSaved ? '已保存' : '未保存'}</dd>
                    </div>
                    <div className="flex items-start justify-between gap-3">
                      <dt className="shrink-0 text-muted">地址</dt>
                      <dd className="min-w-0 truncate text-right font-medium">{baseUrlOverride || selectedProvider?.baseUrl || '未选择'}</dd>
                    </div>
                  </dl>
                </Card.Content>
              </Card>
              <Alert status="default">
                <Alert.Content>
                  <Alert.Title>本地保存</Alert.Title>
                  <Alert.Description>API 密钥仅保存在本地。连接测试与模型刷新会向当前服务商发起请求。</Alert.Description>
                </Alert.Content>
              </Alert>
            </aside>
          </div>
        )}

        {activeSubTab !== 'summary' && capSettings && <CapabilityPanel capability={activeSubTab} settings={capSettings} status={capStatus} error={capError} testing={capTesting} onSave={handleSaveCapability} onTest={handleTestCapability} />}
      </div>
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
