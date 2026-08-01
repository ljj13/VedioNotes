import { useEffect, useRef, useState, type Key } from 'react';
import { Alert, AlertDialog, Button, Card, Checkbox, CheckboxGroup, Chip, Description, Label, ProgressBar, Radio, RadioGroup, Switch, Tabs, Typography } from '@heroui/react';
import { Cpu, Gpu, Cloud, ArrowDownToLine, ArrowsRotateLeft, TrashBin, Pause, CircleCheck, CircleExclamation, Layers, Thunderbolt, TriangleExclamation } from '@gravity-ui/icons';
import { settingsPlatform, attachLateSafeListener } from '../../../platform/settings';
import type {
  SenseVoiceStatus,
  SenseVoiceModelId,
  SenseVoiceLanguage,
  TranscriptionMode,
  LocalModelStatus,
  CudaRuntimeStatus,
  CudaRuntimeState,
  LocalComputeMode,
} from '../../../lib/types';
import type { SettingsEntryProps } from '../settingsTypes';
import OnlineTranscriptionSettings from '../components/OnlineTranscriptionSettings';

const sttLanguageOptions: Array<{ value: SenseVoiceLanguage; label: string; englishLabel: string }> = [
  { value: 'zh', label: '中文', englishLabel: 'Chinese' },
  { value: 'en', label: '英语', englishLabel: 'English' },
  { value: 'ja', label: '日语', englishLabel: 'Japanese' },
  { value: 'ko', label: '韩语', englishLabel: 'Korean' },
  { value: 'yue', label: '粤语', englishLabel: 'Cantonese' },
];

const sttModelOptions: Array<{ value: SenseVoiceModelId; label: string; size: string; desc: string }> = [
  { value: 'int8', label: 'int8 量化版', size: '235 MB', desc: '推荐，体积小、速度快' },
  { value: 'float32', label: 'float32 完整版', size: '920 MB', desc: '更高精度，体积较大' },
];

const whisperModelOptions = [
  { value: 'tiny', label: 'Tiny 模型', size: '75 MB', desc: '最快速度，适合实时场景' },
  { value: 'base', label: 'Base 模型', size: '145 MB', desc: '推荐使用，速度与精度平衡' },
  { value: 'small', label: 'Small 模型', size: '488 MB', desc: '更高精度，适合准确识别' },
  { value: 'large-v3-turbo-q5', label: 'Turbo-Q5 量化', size: '540 MB', desc: '极高精度 + 小体积（推荐）' },
  { value: 'large-v3-turbo-q8', label: 'Turbo-Q8 量化', size: '835 MB', desc: '极高精度 + 高质量量化' },
  { value: 'medium', label: 'Medium 模型', size: '1.5 GB', desc: '最佳精度，需要更多时间' },
  { value: 'large-v3-turbo', label: 'Large-v3-Turbo', size: '1.62 GB', desc: '极高精度 + 快速' },
  { value: 'large-v3', label: 'Large-v3 模型', size: '3.1 GB', desc: '极高精度，专业级识别' }
] as const;

type SttMode = 'cpu' | 'gpu' | 'online';
type WhisperModelType = typeof whisperModelOptions[number]['value'];

function isWhisperModelType(value: string): value is WhisperModelType {
  return whisperModelOptions.some((model) => model.value === value);
}

function preferredWhisperModel(models: LocalModelStatus[]): WhisperModelType {
  const preferred = models.find((model) => model.isCurrent && model.state === 'ready')
    ?? models.find((model) => model.state === 'ready');
  return preferred && isWhisperModelType(preferred.id) ? preferred.id : 'large-v3-turbo-q5';
}

const cudaStateLabels: Record<CudaRuntimeState, string> = {
  unavailable: '不可用',
  not_installed: '未安装',
  downloading: '下载中',
  ready: '已就绪',
  incompatible: '不兼容',
  error: '错误',
};

function modelStateLabel(state: string): string {
  switch (state) {
    case 'not_downloaded': return '未下载';
    case 'downloading': return '下载中';
    case 'ready': return '已就绪';
    case 'corrupt': return '已损坏';
    case 'failed': return '下载失败';
    case 'missing': return '未下载';
    case 'partial': return '下载中';
    default: return state;
  }
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const mb = bytes / (1024 * 1024);
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  return `${(mb / 1024).toFixed(2)} GB`;
}

// Export for potential future use
export { formatBytes };

export default function TranscriptionTab({
  preferences,
  onPreferencesChanged,
  onProfilesChanged,
  onSenseVoiceStatusChanged,
  onRuntimeStatusRefresh,
  profiles,
  localModels: initialLocalModels,
  senseVoiceStatus: initialSenseVoiceStatus = null,
  cudaStatus: initialCudaStatus = null,
  runtimeStatusLoading = false,
  runtimeStatusError = null,
}: SettingsEntryProps) {
  const currentMode = preferences.transcriptionMode ?? 'sensevoice_cpu';
  const activeTab: SttMode = currentMode === 'whisper_local' ? 'gpu' : currentMode === 'online_profile' ? 'online' : 'cpu';

  const [senseVoiceStatus, setSenseVoiceStatus] = useState<SenseVoiceStatus | null>(initialSenseVoiceStatus);
  const [cudaStatus, setCudaStatus] = useState<CudaRuntimeStatus | null>(initialCudaStatus);
  const [localModels, setLocalModels] = useState<LocalModelStatus[]>(initialLocalModels);
  const [confirmDelete, setConfirmDelete] = useState<SenseVoiceModelId | null>(null);
  const [confirmDeleteLocal, setConfirmDeleteLocal] = useState<string | null>(null);
  const [confirmDeleteCuda, setConfirmDeleteCuda] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [computeMode, setComputeMode] = useState<LocalComputeMode>(preferences.localComputeMode ?? 'auto');
  const [downloadProgress, setDownloadProgress] = useState<Record<string, number>>({});
  const [active, setActive] = useState(true);
  const [selectedCpuModel, setSelectedCpuModel] = useState<SenseVoiceModelId>(preferences.sensevoiceModel ?? 'int8');
  const [selectedWhisperModel, setSelectedWhisperModel] = useState<WhisperModelType>(() => preferredWhisperModel(initialLocalModels));
  const whisperSelectionChangedRef = useRef(false);
  const [downloadingLocalModelId, setDownloadingLocalModelId] = useState<string | null>(null);
  const [cudaDownloadActive, setCudaDownloadActive] = useState(false);
  const [savingComputeMode, setSavingComputeMode] = useState(false);

  useEffect(() => {
    setComputeMode(preferences.localComputeMode ?? 'auto');
  }, [preferences.localComputeMode]);

  useEffect(() => {
    setActive(true);
    return () => { setActive(false); };
  }, []);

  useEffect(() => {
    setSenseVoiceStatus(initialSenseVoiceStatus);
  }, [initialSenseVoiceStatus]);

  useEffect(() => {
    setCudaStatus(initialCudaStatus);
  }, [initialCudaStatus]);

  useEffect(() => {
    setLocalModels(initialLocalModels);
    if (!whisperSelectionChangedRef.current) {
      setSelectedWhisperModel(preferredWhisperModel(initialLocalModels));
    }
  }, [initialLocalModels]);

  useEffect(() => {
    if (runtimeStatusError) setError(runtimeStatusError);
  }, [runtimeStatusError]);

  const refreshStatus = async () => {
    try {
      if (onRuntimeStatusRefresh) {
        await onRuntimeStatusRefresh();
        setError(null);
        return;
      }
      const [svStatus, cuda, models] = await Promise.all([
        settingsPlatform.transcription.getSenseVoiceStatus(),
        settingsPlatform.transcription.getCudaRuntimeStatus(),
        settingsPlatform.transcription.listLocalModels(),
      ]);
      setSenseVoiceStatus(svStatus);
      onSenseVoiceStatusChanged(svStatus);
      setCudaStatus(cuda);
      setLocalModels(models);
      setError(null);
    } catch (e) {
      setError(`刷新状态失败: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const handleDownload = async (modelId: SenseVoiceModelId) => {
    setError(null);
    const unlistenReg = settingsPlatform.transcription.onSenseVoiceDownloadProgress((progress) => {
      if (progress.modelId === modelId && progress.totalBytes > 0) {
        const pct = Math.round((progress.downloadedBytes / progress.totalBytes) * 100);
        setDownloadProgress((prev) => ({ ...prev, [modelId]: pct }));
      }
    });
    await attachLateSafeListener(() => active, unlistenReg);
    try {
      await settingsPlatform.transcription.downloadSenseVoice(modelId);
      await refreshStatus();
    } catch (e) {
      setError(`下载失败: ${e instanceof Error ? e.message : String(e)}`);
      await refreshStatus();
    }
  };

  const handleCancel = async () => {
    try {
      await settingsPlatform.transcription.cancelSenseVoiceDownload();
      await refreshStatus();
    } catch (e) {
      setError(`取消下载失败: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const handleDelete = async (modelId: SenseVoiceModelId) => {
    try {
      await settingsPlatform.transcription.deleteSenseVoice(modelId, confirmDelete !== null);
      setConfirmDelete(null);
      await refreshStatus();
    } catch (e) {
      setError(`删除失败: ${e instanceof Error ? e.message : String(e)}`);
      setConfirmDelete(null);
    }
  };

  const handleActivate = async (modelId: SenseVoiceModelId) => {
    try {
      const status = await settingsPlatform.transcription.setSenseVoiceModel(modelId);
      setSenseVoiceStatus(status);
      onSenseVoiceStatusChanged(status);
    } catch (e) {
      setError(`启用模型失败: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const handleLanguagesChange = async (values: SenseVoiceLanguage[]) => {
    const mode: TranscriptionMode = activeTab === 'cpu' ? 'sensevoice_cpu' : activeTab === 'gpu' ? 'whisper_local' : 'online_profile';
    try {
      const saved = await settingsPlatform.preferences.saveTranscription(mode, values);
      if (saved) onPreferencesChanged(saved);
    } catch (e) {
      setError(`保存语言设置失败: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const handleTabChange = (key: Key | null) => {
    const mode: TranscriptionMode = String(key) === 'gpu' ? 'whisper_local' : String(key) === 'online' ? 'online_profile' : 'sensevoice_cpu';
    settingsPlatform.preferences.saveTranscription(mode, selectedLanguages).then((saved) => {
      if (saved) onPreferencesChanged(saved);
    }).catch((e) => {
      setError(`切换模式失败: ${e instanceof Error ? e.message : String(e)}`);
    });
  };

  const handleComputeModeChange = async (mode: LocalComputeMode) => {
    setError(null);
    setSavingComputeMode(true);
    try {
      const saved = await settingsPlatform.transcription.setLocalComputeMode(mode);
      setComputeMode(saved.localComputeMode ?? mode);
      onPreferencesChanged(saved);
    } catch (e) {
      setError(`切换计算模式失败: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSavingComputeMode(false);
    }
  };

  const persistWhisperModelSelection = async (modelId: WhisperModelType) => {
    const model = localModels.find((item) => item.id === modelId);
    if (model?.state !== 'ready') return;
    const localProfile = profiles.transcriptionProfiles.find((profile) => profile.provider === 'local_whisper_cpp');
    if (!localProfile) {
      setError('无法切换模型：本地 Whisper 配置不存在');
      return;
    }
    try {
      await settingsPlatform.transcription.saveTranscriptionProfile({
        ...localProfile,
        model: modelId,
        enabled: true,
      });
      await settingsPlatform.transcription.setActiveProfile('transcription', localProfile.id);
      setLocalModels(await settingsPlatform.transcription.listLocalModels());
      onProfilesChanged();
      setError(null);
    } catch (e) {
      setError(`切换 Whisper 模型失败: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const handleDownloadCuda = async () => {
    setError(null);
    setCudaDownloadActive(true);
    setDownloadProgress((prev) => ({ ...prev, cuda: 0 }));
    const unlistenReg = settingsPlatform.transcription.onCudaRuntimeDownloadProgress((progress) => {
      if (progress.totalBytes > 0) {
        const pct = Math.round((progress.downloadedBytes / progress.totalBytes) * 100);
        setDownloadProgress((prev) => ({ ...prev, cuda: pct }));
      }
    });
    await attachLateSafeListener(() => active, unlistenReg);
    try {
      await settingsPlatform.transcription.downloadCudaRuntime();
      await refreshStatus();
    } catch (e) {
      setError(`CUDA 运行时下载失败: ${e instanceof Error ? e.message : String(e)}`);
      await refreshStatus();
    } finally {
      setCudaDownloadActive(false);
    }
  };

  const handleDeleteCuda = async () => {
    try {
      await settingsPlatform.transcription.deleteCudaRuntime();
      setConfirmDeleteCuda(false);
      await refreshStatus();
    } catch (e) {
      setError(`删除 CUDA 运行时失败: ${e instanceof Error ? e.message : String(e)}`);
      setConfirmDeleteCuda(false);
    }
  };

  const handleDownloadLocalModel = async (modelId: string) => {
    setError(null);
    setDownloadingLocalModelId(modelId);
    setDownloadProgress((prev) => ({ ...prev, [modelId]: 0 }));
    const unlistenReg = settingsPlatform.transcription.onLocalModelDownloadProgress((progress) => {
      if (progress.modelId === modelId && progress.totalBytes > 0) {
        const pct = Math.round((progress.downloadedBytes / progress.totalBytes) * 100);
        setDownloadProgress((prev) => ({ ...prev, [modelId]: pct }));
      }
    });
    await attachLateSafeListener(() => active, unlistenReg);
    try {
      await settingsPlatform.transcription.downloadLocalModel(modelId);
      await refreshStatus();
    } catch (e) {
      setError(`模型下载失败: ${e instanceof Error ? e.message : String(e)}`);
      await refreshStatus();
    } finally {
      setDownloadingLocalModelId(null);
    }
  };

  const handleDeleteLocalModel = async (modelId: string) => {
    try {
      await settingsPlatform.transcription.deleteLocalModel(modelId, confirmDeleteLocal !== null);
      setConfirmDeleteLocal(null);
      await refreshStatus();
    } catch (e) {
      setError(`删除模型失败: ${e instanceof Error ? e.message : String(e)}`);
      setConfirmDeleteLocal(null);
    }
  };

  const selectedModel = senseVoiceStatus?.selectedModel;
  const selectedLanguages = preferences.sensevoiceLanguages ?? ['zh'];
  const selectedCpuOption = sttModelOptions.find((model) => model.value === selectedCpuModel) ?? sttModelOptions[0];
  const selectedCpuStatus = senseVoiceStatus?.models?.find((model) => model.id === selectedCpuModel);
  const selectedCpuIsReady = selectedCpuStatus?.state === 'ready';
  const selectedCpuIsDownloading = selectedCpuStatus?.state === 'partial';
  const selectedCpuIsActive = selectedModel === selectedCpuModel;
  const selectedCpuProgress = downloadProgress[selectedCpuModel]
    ?? (selectedCpuStatus && selectedCpuStatus.totalBytes > 0
      ? Math.round((selectedCpuStatus.downloadedBytes / selectedCpuStatus.totalBytes) * 100)
      : 0);
  const selectedWhisperOption = whisperModelOptions.find((model) => model.value === selectedWhisperModel)
    ?? whisperModelOptions[0];
  const selectedWhisperStatus = localModels.find((model) => model.id === selectedWhisperModel);
  const selectedWhisperIsReady = selectedWhisperStatus?.state === 'ready';
  const selectedWhisperIsDownloading = downloadingLocalModelId === selectedWhisperModel
    || selectedWhisperStatus?.state === 'downloading';
  const selectedWhisperProgress = downloadProgress[selectedWhisperModel]
    ?? (selectedWhisperStatus && selectedWhisperStatus.totalBytes > 0
      ? Math.round((selectedWhisperStatus.downloadedBytes / selectedWhisperStatus.totalBytes) * 100)
      : 0);
  const loading = runtimeStatusLoading;
  const displayedCudaState: CudaRuntimeState | null = cudaDownloadActive
    ? 'downloading'
    : (cudaStatus?.state ?? null);
  const gpuDetected = Boolean(cudaStatus?.gpuName);
  const gpuDetectionLabel = runtimeStatusLoading
    ? '检测中'
    : cudaStatus?.state === 'incompatible'
      ? '不兼容'
      : gpuDetected
        ? '可用'
        : '不可用';
  const gpuDetectionColor = gpuDetected && cudaStatus?.state !== 'incompatible' ? 'success' : 'warning';
  const readyCpuModel = localModels.find((model) => model.isCurrent && model.state === 'ready')
    ?? localModels.find((model) => model.state === 'ready');
  const readyCpuModelLabel = readyCpuModel && isWhisperModelType(readyCpuModel.id)
    ? whisperModelOptions.find((model) => model.value === readyCpuModel.id)?.label
    : readyCpuModel?.id;

  return (
    <div className="cipher-stt-tab cipher-transcription-root">
      {error && (
        <Alert status="danger" className="mb-4">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>错误</Alert.Title>
            <Alert.Description>{error}</Alert.Description>
          </Alert.Content>
        </Alert>
      )}

      <header className="cipher-transcription-header">
        <Typography.Heading level={3} className="cipher-transcription-title">语音转文字</Typography.Heading>
        <Typography.Paragraph size="sm" color="muted" className="cipher-transcription-subtitle">
          根据使用场景选择本地 CPU、本地 GPU 或在线转写模式。
        </Typography.Paragraph>
      </header>

      <Tabs className="cipher-transcription-tabs" selectedKey={activeTab} onSelectionChange={handleTabChange}>
        <Tabs.ListContainer className="cipher-transcription-mode-switcher">
          <Tabs.List aria-label="语音转文字模式" className="cipher-transcription-mode-list">
            <Tabs.Tab id="cpu"><Cpu width={16} height={16} aria-hidden />CPU 模式</Tabs.Tab>
            <Tabs.Tab id="gpu"><Gpu width={16} height={16} aria-hidden />GPU 模式</Tabs.Tab>
            <Tabs.Tab id="online"><Cloud width={16} height={16} aria-hidden />在线模式</Tabs.Tab>
          </Tabs.List>
        </Tabs.ListContainer>

        <Tabs.Panel id="cpu">
          <div className="cipher-transcription-dual-layout">
            <section className="cipher-transcription-left-panel" aria-labelledby="sensevoice-model-title">
              <Card className="cipher-model-config-card">
                <Card.Header className="flex-row items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Card.Title id="sensevoice-model-title">SenseVoice 本地模型</Card.Title>
                    <Card.Description className="cipher-model-config-desc">适合离线使用，支持中文、英语、日语、韩语和粤语。</Card.Description>
                  </div>
                  <Chip
                    size="md"
                    variant="soft"
                    color={selectedCpuIsReady ? 'success' : 'warning'}
                    className="cipher-model-status-chip"
                  >
                    {selectedCpuIsReady
                      ? <CircleCheck width={12} height={12} className="cipher-model-status-chip-icon" />
                      : <CircleExclamation width={12} height={12} className="cipher-model-status-chip-icon" />}
                    <Chip.Label className="cipher-model-status-chip-label">
                      {loading ? '加载中' : modelStateLabel(selectedCpuStatus?.state ?? 'missing')}
                    </Chip.Label>
                  </Chip>
                </Card.Header>

                <Card.Content className="space-y-5">
                  <RadioGroup
                    name="sensevoice-model"
                    value={selectedCpuModel}
                    variant="secondary"
                    onChange={(value) => setSelectedCpuModel(value as typeof selectedCpuModel)}
                    className="cipher-model-version-selector"
                    isDisabled={selectedCpuIsDownloading}
                  >
                    {sttModelOptions.map((model) => (
                      <Radio key={model.value} value={model.value} className="cipher-model-version-option relative">
                        <Radio.Control className="absolute top-4 right-4">
                          <Radio.Indicator />
                        </Radio.Control>
                        <Radio.Content className="pr-8">
                          <div className="flex items-start gap-3">
                            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-default text-foreground">
                              {model.value === 'int8' ? <Thunderbolt width={18} height={18} /> : <Layers width={18} height={18} />}
                            </div>
                            <div className="min-w-0 cipher-model-version-content">
                              <div className="flex flex-wrap items-center gap-2">
                                <Label className="cipher-model-version-title">{model.label}</Label>
                                <Chip size="sm" variant="soft"><Chip.Label>{model.size}</Chip.Label></Chip>
                              </div>
                              <Description className="cipher-model-version-desc">{model.desc}</Description>
                            </div>
                          </div>
                        </Radio.Content>
                      </Radio>
                    ))}
                  </RadioGroup>

                  <Alert
                    status={loading ? 'default' : selectedCpuIsReady ? 'success' : 'warning'}
                    className="cipher-model-status-alert"
                  >
                    <Alert.Indicator className="cipher-model-status-alert-indicator">
                      {loading ? <CircleExclamation width={16} height={16} /> : selectedCpuIsReady ? <CircleCheck width={16} height={16} /> : <TriangleExclamation width={16} height={16} />}
                    </Alert.Indicator>
                    <Alert.Content className="cipher-model-status-alert-content">
                      <Alert.Title className="cipher-model-status-alert-title">
                        {loading
                          ? '正在加载模型状态...'
                          : selectedCpuIsDownloading
                            ? `${selectedCpuOption.label} 正在下载`
                            : selectedCpuIsReady
                              ? `${selectedCpuOption.label}${selectedCpuIsActive ? '已就绪并启用' : '已下载，可立即启用'}`
                              : `${selectedCpuOption.label}未下载`}
                      </Alert.Title>
                      {selectedCpuIsDownloading && (
                        <Alert.Description>
                          <ProgressBar value={selectedCpuProgress} valueLabel={`${selectedCpuProgress}%`}>
                            <ProgressBar.Track>
                              <ProgressBar.Fill />
                            </ProgressBar.Track>
                            <ProgressBar.Output />
                          </ProgressBar>
                        </Alert.Description>
                      )}
                    </Alert.Content>
                  </Alert>
                </Card.Content>

                <Card.Footer className="cipher-model-actions-row flex flex-wrap gap-2">
                  {!loading && !selectedCpuIsReady && !selectedCpuIsDownloading && (
                    <Button type="button" variant="primary" onPress={() => handleDownload(selectedCpuModel)}>
                      <ArrowDownToLine width={16} height={16} />下载模型
                    </Button>
                  )}
                  {selectedCpuIsDownloading && (
                    <Button type="button" variant="secondary" onPress={handleCancel}>
                      <Pause width={16} height={16} />取消下载
                    </Button>
                  )}
                  {selectedCpuIsReady && !selectedCpuIsActive && (
                    <Button type="button" variant="primary" onPress={() => handleActivate(selectedCpuModel)}>
                      <CircleCheck width={16} height={16} />启用模型
                    </Button>
                  )}
                  {selectedCpuIsReady && (
                    <Button type="button" variant="danger" onPress={() => setConfirmDelete(selectedCpuModel)}>
                      <TrashBin width={16} height={16} />删除模型
                    </Button>
                  )}
                  <Button type="button" variant="outline" onPress={refreshStatus}>
                    <ArrowsRotateLeft width={16} height={16} />刷新状态
                  </Button>
                </Card.Footer>
              </Card>
            </section>

            <aside className="cipher-transcription-right-panel" aria-labelledby="sensevoice-language-title">
              <Card className="cipher-language-card">
                <Card.Header>
                  <Card.Title id="sensevoice-language-title">识别语言</Card.Title>
                  <Card.Description className="cipher-language-card-desc">选择需要识别的语言，支持多选。</Card.Description>
                </Card.Header>
                <Card.Content>
                  <CheckboxGroup
                    value={selectedLanguages}
                    onChange={(vals) => handleLanguagesChange(vals as unknown as SenseVoiceLanguage[])}
                    variant="secondary"
                    className="cipher-language-list grid gap-3"
                  >
                    {sttLanguageOptions.map((lang) => {
                      const checked = selectedLanguages.includes(lang.value);
                      return (
                        <Checkbox
                          key={lang.value}
                          value={lang.value}
                          className="cipher-language-item"
                          isDisabled={checked && selectedLanguages.length === 1}
                        >
                          <Checkbox.Control>
                            <Checkbox.Indicator />
                          </Checkbox.Control>
                          <Checkbox.Content>
                            <Label className="cipher-language-item-primary">{lang.label}</Label>
                            <Description className="cipher-language-item-secondary">{lang.englishLabel}</Description>
                          </Checkbox.Content>
                        </Checkbox>
                      );
                    })}
                  </CheckboxGroup>
                </Card.Content>
              </Card>
            </aside>
          </div>
        </Tabs.Panel>

        <Tabs.Panel id="gpu">
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
            <div className="space-y-5">
              {/* Whisper GPU Models */}
              <Card>
                <Card.Header className="flex-row items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Card.Title>Whisper GPU 模型</Card.Title>
                    <Card.Description>使用 Whisper.cpp 进行 GPU 加速识别，适合较大的转写任务。</Card.Description>
                  </div>
                  <Chip
                    size="sm"
                    variant="soft"
                    color={selectedWhisperIsReady ? 'success' : 'warning'}
                    className="cipher-gpu-model-status-chip"
                  >
                    {selectedWhisperIsReady
                      ? <CircleCheck width={12} height={12} className="cipher-gpu-model-status-chip-icon" />
                      : <CircleExclamation width={12} height={12} className="cipher-gpu-model-status-chip-icon" />}
                    <Chip.Label className="cipher-gpu-model-status-chip-label">
                      {loading
                        ? '加载中'
                        : modelStateLabel(selectedWhisperIsDownloading
                          ? 'downloading'
                          : (selectedWhisperStatus?.state ?? 'not_downloaded'))}
                    </Chip.Label>
                  </Chip>
                </Card.Header>
                <Card.Content className="space-y-5">
                  <RadioGroup
                    name="whisper-model"
                    value={selectedWhisperModel}
                    variant="secondary"
                    onChange={(value) => {
                      const modelId = value as WhisperModelType;
                      whisperSelectionChangedRef.current = true;
                      setSelectedWhisperModel(modelId);
                      void persistWhisperModelSelection(modelId);
                    }}
                    isDisabled={downloadingLocalModelId !== null}
                    className="grid gap-3 md:grid-cols-2"
                  >
                    {whisperModelOptions.map((model) => (
                      <Radio key={model.value} value={model.value} className="cipher-model-version-option relative">
                        <Radio.Control className="absolute top-4 right-4">
                          <Radio.Indicator />
                        </Radio.Control>
                        <Radio.Content className="pr-8">
                          <div className="flex items-start gap-3">
                            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-default text-foreground">
                              <Thunderbolt width={18} height={18} />
                            </div>
                            <div className="min-w-0 cipher-model-version-content">
                              <div className="flex flex-wrap items-center gap-2">
                                <Label className="cipher-model-version-title">{model.label}</Label>
                                <Chip size="sm" variant="soft"><Chip.Label>{model.size}</Chip.Label></Chip>
                              </div>
                              <Description className="cipher-model-version-desc">{model.desc}</Description>
                            </div>
                          </div>
                        </Radio.Content>
                      </Radio>
                    ))}
                  </RadioGroup>

                  <Alert
                    status={selectedWhisperIsReady ? 'success' : selectedWhisperIsDownloading ? 'default' : 'warning'}
                    className="cipher-gpu-model-status-alert"
                    aria-live="polite"
                  >
                    <Alert.Indicator className="cipher-gpu-model-status-alert-indicator">
                      {selectedWhisperIsReady
                        ? <CircleCheck width={16} height={16} />
                        : selectedWhisperIsDownloading
                          ? <ArrowDownToLine width={16} height={16} />
                          : <TriangleExclamation width={16} height={16} />}
                    </Alert.Indicator>
                    <Alert.Content className="cipher-gpu-model-status-alert-content">
                      <Alert.Title className="cipher-gpu-model-status-alert-title">
                        {selectedWhisperIsReady
                          ? `${selectedWhisperOption.label}已就绪`
                          : selectedWhisperIsDownloading
                            ? `${selectedWhisperOption.label}正在下载`
                            : selectedWhisperStatus?.state === 'failed'
                              ? '模型下载失败'
                              : '模型未下载'}
                      </Alert.Title>
                      {selectedWhisperIsDownloading && (
                        <Alert.Description>
                          <ProgressBar
                            value={selectedWhisperProgress}
                            valueLabel={`${selectedWhisperProgress}%`}
                            aria-label={`${selectedWhisperOption.label}下载进度`}
                          >
                            <div className="flex items-center justify-between gap-3">
                              <Label>下载进度</Label>
                              <ProgressBar.Output />
                            </div>
                            <ProgressBar.Track>
                              <ProgressBar.Fill />
                            </ProgressBar.Track>
                          </ProgressBar>
                        </Alert.Description>
                      )}
                    </Alert.Content>
                  </Alert>
                </Card.Content>
                <Card.Footer className="flex flex-wrap gap-2">
                  {!selectedWhisperIsReady && (
                    <Button
                      type="button"
                      variant="primary"
                      onPress={() => void handleDownloadLocalModel(selectedWhisperModel)}
                      isDisabled={downloadingLocalModelId !== null}
                    >
                      <ArrowDownToLine width={16} height={16} />
                      {selectedWhisperIsDownloading ? `下载中 ${selectedWhisperProgress}%` : '下载模型'}
                    </Button>
                  )}
                  {selectedWhisperIsReady && (
                    <Button type="button" variant="danger" onPress={() => setConfirmDeleteLocal(selectedWhisperModel)}>
                      <TrashBin width={16} height={16} />删除模型
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    onPress={refreshStatus}
                    isDisabled={downloadingLocalModelId !== null}
                  >
                    <ArrowsRotateLeft width={16} height={16} />刷新状态
                  </Button>
                </Card.Footer>
              </Card>

            </div>

            {/* Right Sidebar */}
            <div className="cipher-gpu-sidebar space-y-5">
              {/* GPU and CPU Availability */}
              <Card className="cipher-gpu-overview-card">
                <Card.Content className="cipher-gpu-overview-content">
                  <section className="cipher-gpu-overview-section" aria-labelledby="gpu-detection-title">
                    <div className="cipher-gpu-overview-heading-row">
                      <Typography.Heading level={4} id="gpu-detection-title" className="cipher-gpu-overview-title">
                        GPU 检测
                      </Typography.Heading>
                      <Chip
                        size="sm"
                        variant="soft"
                        color={gpuDetectionColor}
                        className="cipher-gpu-detection-status-chip"
                      >
                        {gpuDetected && cudaStatus?.state !== 'incompatible'
                          ? <CircleCheck width={12} height={12} className="cipher-gpu-detection-status-chip-icon" />
                          : <CircleExclamation width={12} height={12} className="cipher-gpu-detection-status-chip-icon" />}
                        <Chip.Label className="cipher-gpu-detection-status-chip-label">{gpuDetectionLabel}</Chip.Label>
                      </Chip>
                    </div>
                    <Typography.Paragraph size="sm" color="muted" className="cipher-gpu-overview-description">
                      {cudaStatus?.gpuName ?? cudaStatus?.message ?? '当前机器的 GPU 可用性。'}
                    </Typography.Paragraph>
                  </section>

                  <section className="cipher-gpu-overview-section" aria-labelledby="gpu-cpu-title">
                    <Typography.Heading level={4} id="gpu-cpu-title" className="cipher-gpu-overview-title">
                      CPU
                    </Typography.Heading>
                    <Typography.Paragraph size="sm" color="muted" className="cipher-gpu-overview-description">
                      {readyCpuModelLabel
                        ? `${readyCpuModelLabel}已下载，可用于 CPU 转写`
                        : '尚未下载可用于 CPU 转写的 Whisper 模型'}
                    </Typography.Paragraph>
                  </section>
                </Card.Content>
              </Card>

              {/* GPU Components / CUDA Runtime */}
              <Card className="cipher-cuda-card">
                <Card.Header className="cipher-cuda-card-header flex-row items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Card.Title className="cipher-cuda-card-title">GPU 组件</Card.Title>
                    <Card.Description className="cipher-cuda-card-description">
                      {cudaStatus?.version && <span className="block text-xs">CUDA 运行时组件，约 645 MB。</span>}

                      {!cudaStatus?.version && <span className="block text-xs">CUDA 运行时组件，约 645 MB。</span>}
                    </Card.Description>
                  </div>
                  <Chip
                    size="sm"
                    variant="soft"
                    color={displayedCudaState === 'ready' ? 'success' : 'warning'}
                    className="cipher-cuda-status-chip"
                  >
                    {displayedCudaState === 'ready'
                      ? <CircleCheck width={12} height={12} className="cipher-cuda-status-chip-icon" />
                      : <CircleExclamation width={12} height={12} className="cipher-cuda-status-chip-icon" />}
                    <Chip.Label className="cipher-cuda-status-chip-label">
                      {displayedCudaState ? cudaStateLabels[displayedCudaState] : '未安装'}
                    </Chip.Label>
                  </Chip>
                </Card.Header>
                <Card.Content className="cipher-cuda-card-content space-y-3">
                  {displayedCudaState === 'downloading' && (
                    <ProgressBar
                      value={downloadProgress.cuda ?? 0}
                      valueLabel={`${downloadProgress.cuda ?? 0}%`}
                      aria-label="GPU 组件下载进度"
                      aria-live="polite"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <Label>下载进度</Label>
                        <ProgressBar.Output />
                      </div>
                      <ProgressBar.Track>
                        <ProgressBar.Fill />
                      </ProgressBar.Track>
                    </ProgressBar>
                  )}
                  {cudaStatus?.message && (
                    <Alert status="default" className="cipher-cuda-message-alert">
                      <Alert.Indicator />
                      <Alert.Content>
                        <Alert.Description>{cudaStatus.message}</Alert.Description>
                      </Alert.Content>
                    </Alert>
                  )}
                  {displayedCudaState !== 'ready' && displayedCudaState !== 'downloading' && (
                    <Alert status="default" className="cipher-cuda-requirement-alert">
                      <Alert.Indicator className="cipher-cuda-requirement-indicator">
                        <CircleExclamation width={18} height={18} />
                      </Alert.Indicator>
                      <Alert.Content className="cipher-cuda-requirement-content">
                        <Alert.Title className="cipher-cuda-requirement-title">需要下载 GPU 组件</Alert.Title>
                        <Alert.Description className="cipher-cuda-requirement-description">
                          组件会安装到缓存目录，下载后将暂时被占用。
                        </Alert.Description>
                      </Alert.Content>
                    </Alert>
                  )}
                </Card.Content>
                <Card.Footer className="cipher-cuda-actions cipher-model-actions flex flex-wrap gap-2">
                  {(cudaDownloadActive || cudaStatus?.state === 'not_installed' || cudaStatus?.state === 'error' || cudaStatus?.state === 'incompatible') && (
                    <Button
                      type="button"
                      size="sm"
                      variant="primary"
                      onPress={() => void handleDownloadCuda()}
                      isDisabled={cudaDownloadActive}
                      className="cipher-cuda-download-button w-full"
                    >
                      <ArrowDownToLine width={14} height={14} />
                      {cudaDownloadActive ? `下载中 ${downloadProgress.cuda ?? 0}%` : '下载 GPU 组件'}
                    </Button>
                  )}
                  {cudaStatus?.state === 'ready' && (
                    <Button
                      type="button"
                      size="sm"
                      variant="danger"
                      onPress={() => setConfirmDeleteCuda(true)}
                      className="cipher-cuda-delete-button"
                    >
                      <TrashBin width={14} height={14} />删除
                    </Button>
                  )}
                </Card.Footer>
              </Card>

              {/* GPU Acceleration Switch */}
              <Card className="cipher-gpu-acceleration-card">
                <Card.Header>
                  <Card.Title>GPU 加速</Card.Title>
                  <Card.Description>控制 Whisper 转写是否优先使用 GPU。</Card.Description>
                </Card.Header>
                <Card.Content>
                  <div className="cipher-whisper-gpu-setting-row">
                    <Switch
                      isSelected={computeMode !== 'cpu'}
                      onChange={(selected) => void handleComputeModeChange(selected ? 'auto' : 'cpu')}
                      isDisabled={savingComputeMode}
                      aria-label="启用 Whisper GPU 加速"
                      className="cipher-whisper-gpu-switch"
                    >
                      <Switch.Control className="cipher-whisper-gpu-switch-control">
                        <Switch.Thumb className="cipher-whisper-gpu-switch-thumb" />
                      </Switch.Control>
                    </Switch>
                    <div className="cipher-whisper-gpu-setting-copy">
                      <Label className="cipher-whisper-gpu-setting-label">启用 Whisper GPU 加速</Label>
                      <Description className="cipher-whisper-gpu-setting-description">
                        禁用后将回退到 CPU 执行 Whisper 转写。
                      </Description>
                    </div>
                  </div>
                </Card.Content>
              </Card>
            </div>
          </div>
        </Tabs.Panel>

        <Tabs.Panel id="online">
          <OnlineTranscriptionSettings profiles={profiles} onProfilesChanged={onProfilesChanged} />
        </Tabs.Panel>
      </Tabs>

      {/* Confirm Delete SenseVoice Model */}
      {confirmDelete && (
        <AlertDialog isOpen={true} onOpenChange={(open) => !open && setConfirmDelete(null)}>
          <AlertDialog.Backdrop>
            <AlertDialog.Container>
              <AlertDialog.Dialog className="sm:max-w-105">
                <AlertDialog.CloseTrigger />
                <AlertDialog.Header>
                  <AlertDialog.Icon status="danger" />
                  <AlertDialog.Heading>确认删除</AlertDialog.Heading>
                </AlertDialog.Header>
                <AlertDialog.Body>
                  <Typography.Paragraph>
                    确定要删除 {confirmDelete} 模型吗？此操作不可撤销。
                  </Typography.Paragraph>
                </AlertDialog.Body>
                <AlertDialog.Footer>
                  <Button slot="close" variant="tertiary">取消</Button>
                  <Button slot="close" variant="danger" onPress={() => handleDelete(confirmDelete)}>删除</Button>
                </AlertDialog.Footer>
              </AlertDialog.Dialog>
            </AlertDialog.Container>
          </AlertDialog.Backdrop>
        </AlertDialog>
      )}

      {/* Confirm Delete Local Model */}
      {confirmDeleteLocal && (
        <AlertDialog isOpen={true} onOpenChange={(open) => !open && setConfirmDeleteLocal(null)}>
          <AlertDialog.Backdrop>
            <AlertDialog.Container>
              <AlertDialog.Dialog className="sm:max-w-105">
                <AlertDialog.CloseTrigger />
                <AlertDialog.Header>
                  <AlertDialog.Icon status="danger" />
                  <AlertDialog.Heading>确认删除</AlertDialog.Heading>
                </AlertDialog.Header>
                <AlertDialog.Body>
                  <Typography.Paragraph>
                    确定要删除本地模型 {confirmDeleteLocal} 吗？此操作不可撤销。
                  </Typography.Paragraph>
                </AlertDialog.Body>
                <AlertDialog.Footer>
                  <Button slot="close" variant="tertiary">取消</Button>
                  <Button slot="close" variant="danger" onPress={() => handleDeleteLocalModel(confirmDeleteLocal)}>删除</Button>
                </AlertDialog.Footer>
              </AlertDialog.Dialog>
            </AlertDialog.Container>
          </AlertDialog.Backdrop>
        </AlertDialog>
      )}

      {/* Confirm Delete CUDA Runtime */}
      {confirmDeleteCuda && (
        <AlertDialog isOpen={true} onOpenChange={(open) => !open && setConfirmDeleteCuda(false)}>
          <AlertDialog.Backdrop>
            <AlertDialog.Container>
              <AlertDialog.Dialog className="sm:max-w-105">
                <AlertDialog.CloseTrigger />
                <AlertDialog.Header>
                  <AlertDialog.Icon status="danger" />
                  <AlertDialog.Heading>确认删除</AlertDialog.Heading>
                </AlertDialog.Header>
                <AlertDialog.Body>
                  <Typography.Paragraph>
                    确定要删除 CUDA 运行时吗？GPU 转写将不可用，直到重新安装。
                  </Typography.Paragraph>
                </AlertDialog.Body>
                <AlertDialog.Footer>
                  <Button slot="close" variant="tertiary">取消</Button>
                  <Button slot="close" variant="danger" onPress={handleDeleteCuda}>删除</Button>
                </AlertDialog.Footer>
              </AlertDialog.Dialog>
            </AlertDialog.Container>
          </AlertDialog.Backdrop>
        </AlertDialog>
      )}
    </div>
  );
}
