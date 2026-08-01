/**
 *AI 接入设置页——配置 AI 总结服务商、模型选择、API Key 管理。
 */

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Alert, Button, Card, Chip, ComboBox, Input, InputGroup, Label, ListBox, Select, Tabs, TextField, Tooltip, Typography } from '@heroui/react';
import {
  ArrowUpRight,
  ArrowsRotateLeft,
  Bulb,
  CircleCheck,
  CircleExclamation,
  CurlyBrackets,
  Display,
  Eye,
  EyeSlash,
  FaceRobot,
  FileText,
  Globe,
  Picture,
  Sparkles,
  Speedometer,
  VectorCircle,
  Wallet,
  Wrench,
  ArrowRightArrowLeft,
} from '@gravity-ui/icons';
import { settingsPlatform } from '../../../platform/settings';
import type {
  SummaryProviderCatalogEntry,
  SummaryModelCatalogEntry,
  SecretInput,
  CapabilitySettings,
  CapabilityStatus,
  CapabilityStatusItem,
} from '../../../lib/types';
import type { SettingsEntryProps } from '../settingsTypes';
import AIProviderLogo from '../components/AIProviderLogo';
import { filterModelsForCategory, mergeRemoteProviderModels } from '../../../lib/aiModelCatalog';
import {
  ensureProviderModelsFresh,
  getProviderModelSnapshot,
  refreshProviderModels,
  subscribeProviderModelRegistry,
} from '../../../platform/settings/aiModelRegistry';

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

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function formatTokenLimit(value: unknown) {
  const amount = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return '';
  return amount >= 1_000 ? `${Math.round(amount / 1_000)}K` : String(amount);
}

function formatModelCost(model: SummaryModelCatalogEntry) {
  const cost = asRecord(model.cost);
  const input = typeof cost.input === 'number' ? cost.input : undefined;
  const output = typeof cost.output === 'number' ? cost.output : undefined;
  if (input === undefined || output === undefined) return '';
  return input === 0 && output === 0 ? '免费' : `$${input}/$${output}`;
}

function modelCapability(model: SummaryModelCatalogEntry, camel: string, snake: string) {
  const capabilities = asRecord(model.capabilities);
  const runtimeModel = model as SummaryModelCatalogEntry & Record<string, unknown>;
  return Boolean(capabilities[camel] ?? capabilities[snake] ?? runtimeModel[camel] ?? runtimeModel[snake]);
}

function modelInputModalities(model: SummaryModelCatalogEntry) {
  const input = asRecord(model.modalities).input;
  return Array.isArray(input) ? input.map(String) : [];
}

function ModelCapabilityStrip({ model, compact = false }: { model: SummaryModelCatalogEntry; compact?: boolean }) {
  const limit = asRecord(model.limit);
  const context = formatTokenLimit(limit.context);
  const output = formatTokenLimit(limit.output);
  const price = formatModelCost(model);
  const inputs = modelInputModalities(model);
  const metrics = [
    { key: 'context', value: context || '--', active: Boolean(context), label: context ? `上下文 ${context}` : '上下文未知', icon: Speedometer },
    { key: 'output', value: output || '--', active: Boolean(output), label: output ? `最大输出 ${output}` : '最大输出未知', icon: ArrowUpRight },
    { key: 'cost', value: price || '--', active: Boolean(price), label: price ? `输入/输出价格 ${price}` : '价格未知', icon: Wallet },
  ];
  const capabilities = [
    { key: 'reasoning', label: '推理', enabled: modelCapability(model, 'reasoning', 'reasoning'), icon: Bulb },
    { key: 'tool', label: '工具调用', enabled: modelCapability(model, 'toolCall', 'tool_call'), icon: Wrench },
    { key: 'structured', label: '结构化输出', enabled: modelCapability(model, 'structuredOutput', 'structured_output'), icon: CurlyBrackets },
    { key: 'image', label: '图像输入', enabled: inputs.includes('image'), icon: Picture },
    { key: 'pdf', label: 'PDF', enabled: inputs.includes('pdf'), icon: FileText },
  ];

  return (
    <div className={`cipher-ai-model-capabilities${compact ? ' cipher-ai-model-capabilities--compact' : ''}`} aria-label="模型能力">
      {metrics.map(({ key, value, active, label, icon: Icon }) => (
        <Tooltip delay={0} key={key}>
          <Chip className={!active ? 'cipher-ai-capability-muted' : ''} color={active ? 'accent' : 'default'} size="md" variant="soft">
            <Icon height={12} width={12} />
            <Chip.Label>{value}</Chip.Label>
          </Chip>
          <Tooltip.Content>{label}</Tooltip.Content>
        </Tooltip>
      ))}
      {capabilities.map(({ key, label, enabled, icon: Icon }) => (
        <Tooltip delay={0} key={key}>
          <Chip className={!enabled ? 'cipher-ai-capability-muted' : ''} color={enabled ? 'success' : 'default'} size="md" variant="soft">
            <Icon height={12} width={12} />
            <Chip.Label>{label}</Chip.Label>
          </Chip>
          <Tooltip.Content>{`${label}：${enabled ? '支持' : '不支持'}`}</Tooltip.Content>
        </Tooltip>
      ))}
    </div>
  );
}

function ModelOptionContent({ model }: { model: SummaryModelCatalogEntry }) {
  return (
    <span className="cipher-ai-model-option-content">
      <strong>{model.name}</strong>
      <ModelCapabilityStrip compact model={model} />
    </span>
  );
}

function ProviderOptionContent({ provider }: { provider: SummaryProviderCatalogEntry }) {
  return (
    <span className="cipher-ai-provider-option-content">
      <AIProviderLogo alt={provider.displayName} providerId={provider.id} size={18} />
      <span className="cipher-ai-provider-option-copy">
        <strong>{provider.displayName}</strong>
        <span>{provider.id}</span>
      </span>
    </span>
  );
}

/** AiAccessTab */
export default function AiAccessTab({ profiles, onProfilesChanged }: SettingsEntryProps) {
  const [catalog, setCatalog] = useState<SummaryProviderCatalogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null);
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
  const [modelInputValue, setModelInputValue] = useState('');
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
  const [revealedStoredApiKey, setRevealedStoredApiKey] = useState<string | null>(null);
  const [loadingStoredApiKey, setLoadingStoredApiKey] = useState(false);
  const revealTimerRef = useRef<number | null>(null);
  const revealRequestRef = useRef(0);

  const clearRevealTimer = useCallback(() => {
    if (revealTimerRef.current !== null) {
      window.clearTimeout(revealTimerRef.current);
      revealTimerRef.current = null;
    }
  }, []);

  const concealStoredApiKey = useCallback(() => {
    revealRequestRef.current += 1;
    clearRevealTimer();
    setRevealedStoredApiKey(null);
    setLoadingStoredApiKey(false);
    setShowApiKey(false);
  }, [clearRevealTimer]);

  useEffect(() => {
    const handleWindowBlur = () => concealStoredApiKey();
    window.addEventListener('blur', handleWindowBlur);
    return () => {
      window.removeEventListener('blur', handleWindowBlur);
      revealRequestRef.current += 1;
      clearRevealTimer();
    };
  }, [clearRevealTimer, concealStoredApiKey]);

  useEffect(() => {
    Promise.all([
      settingsPlatform.ai.getCatalog(),
      settingsPlatform.ai.getCapabilitySettings(),
      settingsPlatform.ai.getCapabilityStatus(),
    ]).then(([entries, settings, status]) => {
      setCatalog(entries);
      const activeProviderId = profiles.activeSummaryProfileId?.replace(/^catalog-/, '') ?? null;
      const initialProvider = entries.find((entry) => entry.id === activeProviderId) ?? entries[0] ?? null;
      if (initialProvider) {
        setSelectedProviderId(initialProvider.id);
        const persistedProfile = profiles.summaryProfiles.find((profile) => profile.id === catalogProfileId(initialProvider.id));
        setSelectedModelId(persistedProfile?.model ?? null);
        setModelInputValue(persistedProfile?.model ?? '');
        setBaseUrlOverride(persistedProfile && persistedProfile.baseUrl !== initialProvider.baseUrl ? persistedProfile.baseUrl : '');
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

  const selectedProvider = useMemo(
    () => catalog.find((p) => p.id === selectedProviderId) ?? null,
    [catalog, selectedProviderId],
  );

  const providerModelSnapshot = useSyncExternalStore(
    subscribeProviderModelRegistry,
    () => getProviderModelSnapshot(selectedProviderId ?? ''),
    () => getProviderModelSnapshot(selectedProviderId ?? ''),
  );
  const remoteModelIds = selectedProviderId ? providerModelSnapshot.modelIds : null;
  const refreshingModels = selectedProviderId ? providerModelSnapshot.status === 'refreshing' : false;

  const modelCandidates = useMemo(() => {
    if (!selectedProvider) return [];
    if (remoteModelIds === null) return selectedProvider.models;
    return mergeRemoteProviderModels(selectedProvider, remoteModelIds);
  }, [remoteModelIds, selectedProvider]);

  const availableModels = useMemo(
    () => filterModelsForCategory(modelCandidates, 'summary'),
    [modelCandidates],
  );

  const selectedModel = useMemo(
    () => selectedProvider?.models.find((model) => model.id === selectedModelId)
      ?? modelCandidates.find((model) => model.id === selectedModelId)
      ?? null,
    [modelCandidates, selectedModelId, selectedProvider],
  );

  const selectedModelIsAvailable = Boolean(
    selectedModelId && availableModels.some((model) => model.id === selectedModelId),
  );
  const selectedModelSelectionIsValid = selectedModelIsAvailable && modelInputValue === selectedModelId;

  const filteredModels = useMemo(() => {
    const normalized = modelInputValue.trim().toLowerCase();
    const query = normalized === selectedModelId?.toLowerCase() ? '' : normalized;
    if (!query) return availableModels;
    return availableModels.filter((model) => (
      model.id.toLowerCase().includes(query) || model.name.toLowerCase().includes(query)
    ));
  }, [availableModels, modelInputValue, selectedModelId]);

  const handleSelectModel = (key: React.Key | null) => {
    const modelId = key == null ? null : String(key);
    setSelectedModelId(modelId);
    setModelInputValue(modelId ?? '');
    setError(null);
  };

  const handleSelectProvider = (provider: SummaryProviderCatalogEntry) => {
    concealStoredApiKey();
    setSelectedProviderId(provider.id);
    setSelectedModelId(null);
    setModelInputValue('');
    setBaseUrlOverride('');
    setSecretDraft(null);
    setError(null);
    setSuccess(null);
    // Check if credential already saved
    settingsPlatform.ai.hasCredential('summary', catalogProfileId(provider.id)).then(setCredentialSaved).catch(() => setCredentialSaved(false));
  };

  const handleApiKeyChange = (value: string) => {
    if (revealedStoredApiKey !== null) {
      revealRequestRef.current += 1;
      clearRevealTimer();
      setRevealedStoredApiKey(null);
    }
    setSecretDraft(value ? { type: 'bearer', value } : null);
  };

  const handleToggleApiKeyVisibility = async () => {
    if (showApiKey) {
      if (revealedStoredApiKey !== null) {
        concealStoredApiKey();
      } else {
        setShowApiKey(false);
      }
      return;
    }

    if (secretDraft || !credentialSaved || !selectedProviderId) {
      setShowApiKey(true);
      return;
    }

    const requestId = revealRequestRef.current + 1;
    revealRequestRef.current = requestId;
    setLoadingStoredApiKey(true);
    setError(null);
    try {
      const apiKey = await settingsPlatform.ai.revealCredential(
        'summary',
        catalogProfileId(selectedProviderId),
      );
      if (revealRequestRef.current !== requestId) return;
      setRevealedStoredApiKey(apiKey);
      setShowApiKey(true);
      clearRevealTimer();
      revealTimerRef.current = window.setTimeout(() => {
        if (revealRequestRef.current === requestId) concealStoredApiKey();
      }, 20_000);
    } catch (e) {
      if (revealRequestRef.current === requestId) {
        setError(`读取已保存凭据失败: ${e instanceof Error ? e.message : String(e)}`);
      }
    } finally {
      if (revealRequestRef.current === requestId) setLoadingStoredApiKey(false);
    }
  };

  useEffect(() => {
    if (!selectedProviderId || !credentialSaved) return;
    const profileId = catalogProfileId(selectedProviderId);
    if (!persistedSummaryProfiles.some((profile) => profile.id === profileId)) return;
    void ensureProviderModelsFresh(selectedProviderId, settingsPlatform.ai.discoverModels).catch(() => {
      // The registry preserves cached IDs and exposes a non-blocking failed state.
    });
  }, [credentialSaved, persistedSummaryProfiles, selectedProviderId]);

  const handleSave = async () => {
    if (!selectedProviderId || !selectedModelId || !selectedModelSelectionIsValid) {
      setError(selectedModelId && !selectedModelIsAvailable
        ? '当前模型已下架或不可用，请重新选择。'
        : '请从可用模型列表中选择模型');
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
      concealStoredApiKey();
      setSuccess(`已保存并激活 ${selectedProvider?.displayName ?? ''} / ${selectedModel?.name ?? ''}`);
    } catch (e) {
      setError(`保存失败: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSaving(false);
    }
  };

  const handleTestConnection = async () => {
    if (!selectedProvider || !selectedModelId || !selectedModelSelectionIsValid) {
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

  const handleRefreshModels = async () => {
    if (!selectedProvider) return;
    const profileId = catalogProfileId(selectedProvider.id);
    const persistedProfile = persistedSummaryProfiles.find((profile) => profile.id === profileId);
    if (!persistedProfile) {
      setError('请先保存当前服务商，再刷新在线模型列表。');
      setSuccess(null);
      return;
    }

    setError(null);
    setSuccess(null);
    try {
      const snapshot = await refreshProviderModels(selectedProvider.id, {
        force: true,
        discover: settingsPlatform.ai.discoverModels,
      });
      setSuccess(`已刷新 ${snapshot.modelIds?.length ?? 0} 个在线模型`);
    } catch (e) {
      setError(`模型列表刷新失败: ${e instanceof Error ? e.message : String(e)}`);
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
            <div className="ml-auto flex shrink-0 items-center justify-end" style={{ width: '600px' }}>
              <Tabs className="shrink-0 w-full" selectedKey={activeSubTab} onSelectionChange={(key) => setActiveSubTab(String(key) as AiSubTab)}>
                <Tabs.ListContainer><Tabs.List aria-label="AI 能力">{subTabs.map((tab) => <Tabs.Tab className="whitespace-nowrap" key={tab.id} id={tab.id}>{tab.label}<Tabs.Indicator /></Tabs.Tab>)}</Tabs.List></Tabs.ListContainer>
              </Tabs>
            </div>
          </div>
        </div>

        {error && <Alert status="danger"><Alert.Content><Alert.Title>配置失败</Alert.Title><Alert.Description>{error}</Alert.Description></Alert.Content></Alert>}
        {success && <Alert status="success"><Alert.Content><Alert.Title>配置已保存</Alert.Title><Alert.Description>{success}</Alert.Description></Alert.Content></Alert>}

        {activeSubTab === 'summary' && (
          <div className="cipher-ai-access-grid">
            <Card className="cipher-ai-connection-card">
              <Card.Header className="cipher-ai-card-header">
                <Card.Title>接入参数</Card.Title>
                {selectedProvider
                  ? <AIProviderLogo alt={selectedProvider.displayName} providerId={selectedProvider.id} size={32} />
                  : <Sparkles className="cipher-ai-provider-logo" height={32} width={32} />}
              </Card.Header>

              <Card.Content className="cipher-ai-form-content">
                <Select className="cipher-settings-select cipher-ai-provider-select" selectedKey={selectedProviderId} onSelectionChange={(key) => { const provider = catalog.find((item) => item.id === String(key)); if (provider) handleSelectProvider(provider); }} placeholder="请选择服务商" variant="secondary" fullWidth>
                  <Label className="cipher-settings-select-label">服务商</Label>
                  <Select.Trigger className="cipher-settings-select-trigger cipher-ai-provider-trigger">
                    <Select.Value className="cipher-settings-select-value">
                      {selectedProvider ? <ProviderOptionContent provider={selectedProvider} /> : '请选择服务商'}
                    </Select.Value>
                    <Select.Indicator className="cipher-settings-select-indicator" />
                  </Select.Trigger>
                  <Select.Popover className="cipher-settings-select-popover cipher-ai-provider-popover">
                    <ListBox className="cipher-settings-select-listbox cipher-ai-provider-list max-h-80 overflow-y-auto">
                      {catalog.map((provider) => (
                        <ListBox.Item className="cipher-settings-select-option cipher-ai-provider-option" key={provider.id} id={provider.id} textValue={`${provider.displayName} ${provider.id} ${provider.description}`}>
                          <ProviderOptionContent provider={provider} />
                          <ListBox.ItemIndicator className="cipher-settings-select-option-indicator" />
                        </ListBox.Item>
                      ))}
                    </ListBox>
                  </Select.Popover>
                </Select>

                {selectedProvider && (
                  <>
                    <TextField className="cipher-ai-api-key-field" fullWidth value={secretDraft?.value ?? revealedStoredApiKey ?? ''} onChange={handleApiKeyChange}>
                      <Label>API 密钥</Label>
                      <InputGroup className="cipher-ai-api-key-input-group" variant="secondary" fullWidth>
                        <InputGroup.Input
                          type={showApiKey ? 'text' : 'password'}
                          autoComplete="off"
                          spellCheck={false}
                          placeholder={credentialSaved && !secretDraft
                            ? '••••••••••••（已保存，留空保持不变）'
                            : '输入 API Key（留空保持已保存凭据）'}
                        />
                        <InputGroup.Suffix>
                          <Tooltip delay={0}>
                            <Button className="cipher-ai-api-key-toggle" type="button" variant="tertiary" size="sm" isIconOnly isDisabled={loadingStoredApiKey} onPress={handleToggleApiKeyVisibility} aria-label={loadingStoredApiKey ? '正在读取 API 密钥' : showApiKey ? '隐藏 API 密钥' : '显示 API 密钥'}>
                              {showApiKey ? <EyeSlash width={18} height={18} /> : <Eye width={18} height={18} />}
                            </Button>
                            <Tooltip.Content>{loadingStoredApiKey ? '正在读取…' : showApiKey ? '隐藏 API 密钥' : '显示 API 密钥'}</Tooltip.Content>
                          </Tooltip>
                        </InputGroup.Suffix>
                      </InputGroup>
                    </TextField>

                    <div className="cipher-ai-model-field">
                      <div className="cipher-ai-model-control-row">
                        <ComboBox
                          className="cipher-ai-model-combobox"
                          selectedKey={selectedModelIsAvailable ? selectedModelId : null}
                          inputValue={modelInputValue}
                          onInputChange={setModelInputValue}
                          onSelectionChange={handleSelectModel}
                          defaultFilter={() => true}
                          menuTrigger="focus"
                          variant="secondary"
                          fullWidth
                        >
                          <Label className="cipher-settings-select-label">模型</Label>
                          <ComboBox.InputGroup className="cipher-ai-model-input-group">
                            <Input className="cipher-ai-model-input" placeholder="输入关键词筛选可用模型" />
                            <ComboBox.Trigger className="cipher-ai-model-trigger" aria-label="展开模型列表" />
                          </ComboBox.InputGroup>
                          <ComboBox.Popover className="cipher-settings-select-popover cipher-ai-model-popover">
                            {filteredModels.length > 0 ? (
                              <ListBox className="cipher-settings-select-listbox cipher-ai-model-list">
                                {filteredModels.map((model) => (
                                  <ListBox.Item aria-label={model.name} className="cipher-settings-select-option cipher-ai-model-option" key={model.id} id={model.id} textValue={model.name}>
                                  <ModelOptionContent model={model} />
                                  <ListBox.ItemIndicator className="cipher-settings-select-option-indicator" />
                                  </ListBox.Item>
                                ))}
                              </ListBox>
                            ) : (
                              <div className="cipher-ai-model-empty" role="status">没有符合条件的可用模型</div>
                            )}
                          </ComboBox.Popover>
                        </ComboBox>
                        <Tooltip delay={0}>
                          <Button className="cipher-ai-model-refresh" type="button" variant="outline" size="sm" isIconOnly onPress={() => void handleRefreshModels()} isDisabled={refreshingModels || !selectedProvider} aria-label="刷新模型列表">
                            <ArrowsRotateLeft className={refreshingModels ? 'cipher-ai-spin' : ''} height={18} width={18} />
                          </Button>
                          <Tooltip.Content>刷新模型列表</Tooltip.Content>
                        </Tooltip>
                      </div>
                      {selectedModel && <ModelCapabilityStrip model={selectedModel} />}
                      <p className="cipher-ai-model-source">
                        {providerModelSnapshot.status === 'refreshing'
                          ? '正在同步在线模型，当前显示缓存'
                          : providerModelSnapshot.status === 'failed'
                            ? '在线同步失败，继续使用缓存'
                            : providerModelSnapshot.source === 'remote'
                              ? '在线模型列表'
                              : providerModelSnapshot.source === 'cache'
                                ? '本地缓存'
                                : '内置模型目录'}
                      </p>
                    </div>

                    {selectedModelId && !selectedModelIsAvailable && <Alert className="cipher-ai-model-unavailable-alert" status="warning"><Alert.Content><Alert.Description>当前模型已下架或不可用，请重新选择。</Alert.Description></Alert.Content></Alert>}
                  </>
                )}
              </Card.Content>

              <Card.Footer className="cipher-ai-card-actions">
                <Button className="cipher-ai-test-button" type="button" variant="outline" size="sm" onPress={() => void handleTestConnection()} isDisabled={testingConnection || !selectedModelSelectionIsValid}>
                  <Sparkles width={16} height={16} />
                  {testingConnection ? '测试中…' : '测试连接'}
                </Button>
                <Button className="cipher-ai-save-button" variant="primary" size="sm" onPress={handleSave} isDisabled={saving || !selectedModelSelectionIsValid}>
                  {saving ? '保存中…' : '保存当前服务商'}
                </Button>
              </Card.Footer>
            </Card>

            <aside className="cipher-ai-summary-column">
              <Card className="cipher-ai-provider-summary-card">
                <Card.Header className="cipher-ai-provider-summary-header">
                  {selectedProvider && <AIProviderLogo alt={selectedProvider.displayName} providerId={selectedProvider.id} size={40} />}
                  <div className="cipher-ai-provider-summary-copy">
                    <Card.Title>{selectedProvider?.displayName ?? '未选择服务商'}</Card.Title>
                    <Card.Description>{selectedProvider?.description ?? '从目录中选择一个服务商'}</Card.Description>
                  </div>
                </Card.Header>
                <Card.Content>
                  <dl className="cipher-ai-provider-facts">
                    <div><dt>协议</dt><dd><Chip size="sm" variant="soft" color="accent"><Chip.Label>{selectedProvider ? PROTOCOL_LABELS[selectedProvider.protocol] ?? selectedProvider.protocol : '未选择'}</Chip.Label></Chip></dd></div>
                    <div><dt>模型</dt><dd>{selectedModel?.name ?? selectedModelId ?? '未选择'}</dd></div>
                    <div><dt>认证</dt><dd>{secretDraft ? '待保存' : credentialSaved ? '已保存' : '未保存'}</dd></div>
                    <div><dt>地址</dt><dd className="cipher-ai-provider-address" title={baseUrlOverride || selectedProvider?.baseUrl}>{baseUrlOverride || selectedProvider?.baseUrl || '未选择'}</dd></div>
                    {selectedProvider?.documentationUrl && (
                      <div><dt>官网</dt><dd><button className="cipher-ai-provider-doc-link" type="button" onClick={() => void settingsPlatform.ai.openExternal(selectedProvider.documentationUrl!)}>注册 / 获取 Key</button></dd></div>
                    )}
                  </dl>
                </Card.Content>
              </Card>

              <Alert className="cipher-ai-local-note" status="default">
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
