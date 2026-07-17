import { useEffect, useState, type Key } from 'react';
import { Tabs, Card, Checkbox, CheckboxGroup, ProgressBar, Button } from '@heroui/react';
import { Cpu, Gpu, Cloud, ArrowDownToLine, ArrowsRotateLeft, TrashBin, Pause, CircleCheck, CircleExclamation } from '@gravity-ui/icons';
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

const sttLanguageOptions: Array<{ value: SenseVoiceLanguage; label: string }> = [
  { value: 'zh', label: '中文' },
  { value: 'en', label: '英语' },
  { value: 'ja', label: '日语' },
  { value: 'ko', label: '韩语' },
  { value: 'yue', label: '粤语' },
];

const sttModelOptions: Array<{ value: SenseVoiceModelId; label: string; size: string; desc: string }> = [
  { value: 'int8', label: 'int8 量化版', size: '235 MB', desc: '推荐，体积小、速度快' },
  { value: 'float32', label: 'float32 完整版', size: '920 MB', desc: '更高精度，体积较大' },
];

type SttMode = 'cpu' | 'gpu' | 'online';

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

export default function TranscriptionTab({
  preferences,
  onPreferencesChanged,
  onSenseVoiceStatusChanged,
  profiles,
  localModels: initialLocalModels,
}: SettingsEntryProps) {
  const currentMode = preferences.transcriptionMode ?? 'sensevoice_cpu';
  const activeTab: SttMode = currentMode === 'whisper_local' ? 'gpu' : currentMode === 'online_profile' ? 'online' : 'cpu';

  const [senseVoiceStatus, setSenseVoiceStatus] = useState<SenseVoiceStatus | null>(null);
  const [cudaStatus, setCudaStatus] = useState<CudaRuntimeStatus | null>(null);
  const [localModels, setLocalModels] = useState<LocalModelStatus[]>(initialLocalModels);
  const [loading, setLoading] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState<SenseVoiceModelId | null>(null);
  const [confirmDeleteLocal, setConfirmDeleteLocal] = useState<string | null>(null);
  const [confirmDeleteCuda, setConfirmDeleteCuda] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [computeMode, setComputeMode] = useState<LocalComputeMode>(preferences.localComputeMode ?? 'auto');
  const [downloadProgress, setDownloadProgress] = useState<Record<string, number>>({});
  const [active, setActive] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setActive(true);
    Promise.all([
      settingsPlatform.transcription.getSenseVoiceStatus(),
      settingsPlatform.transcription.getCudaRuntimeStatus(),
      settingsPlatform.transcription.listLocalModels(),
    ]).then(([svStatus, cuda, models]) => {
      if (!cancelled) {
        setSenseVoiceStatus(svStatus);
        onSenseVoiceStatusChanged(svStatus);
        setCudaStatus(cuda);
        setLocalModels(models);
        setLoading(false);
      }
    }).catch((e) => {
      if (!cancelled) {
        setError(`加载状态失败: ${e instanceof Error ? e.message : String(e)}`);
        setLoading(false);
      }
    });
    return () => { cancelled = true; setActive(false); };
  }, [onSenseVoiceStatusChanged]);

  const refreshStatus = async () => {
    try {
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
    try {
      const saved = await settingsPlatform.transcription.setLocalComputeMode(mode);
      setComputeMode(mode);
      onPreferencesChanged(saved);
    } catch (e) {
      setError(`切换计算模式失败: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const handleDownloadCuda = async () => {
    setError(null);
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

  return (
    <div className="cipher-stt-tab">
      {error && (
        <div role="alert" className="cipher-error-banner">
          <CircleExclamation width={16} /> {error}
        </div>
      )}

      <Tabs selectedKey={activeTab} onSelectionChange={handleTabChange}>
        <Tabs.ListContainer>
          <Tabs.List aria-label="语音转文字模式">
            <Tabs.Tab id="cpu"><Cpu width={16} height={16} />CPU 转写</Tabs.Tab>
            <Tabs.Tab id="gpu"><Gpu width={16} height={16} />GPU 转写</Tabs.Tab>
            <Tabs.Tab id="online"><Cloud width={16} height={16} />在线转写</Tabs.Tab>
          </Tabs.List>
        </Tabs.ListContainer>

        <Tabs.Panel id="cpu">
          <div className="cipher-stt-section">
            <h3>SenseVoice CPU 模型</h3>
            <p className="cipher-stt-desc">基于 SenseVoice 的本地 CPU 语音识别，无需 GPU。</p>

            {loading && <div role="status">正在加载状态...</div>}

            {!loading && sttModelOptions.map((model) => {
              const modelStatus = senseVoiceStatus?.models?.find((m) => m.id === model.value);
              const isReady = modelStatus?.state === 'ready';
              const isDownloading = modelStatus?.state === 'partial';
              const isActive = selectedModel === model.value;
              const progress = downloadProgress[model.value]
                ?? (modelStatus && modelStatus.totalBytes > 0 ? Math.round((modelStatus.downloadedBytes / modelStatus.totalBytes) * 100) : 0);

              return (
                <Card key={model.value} className="cipher-model-card">
                  <div className="cipher-model-header">
                    <div>
                      <strong>{model.label}</strong>
                      <span className="cipher-model-size">{model.size}</span>
                      <span className="cipher-model-desc">{model.desc}</span>
                    </div>
                    {isActive && <span className="cipher-active-chip"><CircleCheck width={14} />已启用</span>}
                  </div>
                  {modelStatus && (
                    <div className="cipher-model-status">
                      <span>状态：{modelStateLabel(modelStatus.state)}</span>
                      {isDownloading && <ProgressBar value={progress} />}
                      {isDownloading && <span>{progress}%</span>}
                    </div>
                  )}
                  <div className="cipher-model-actions">
                    {!isReady && !isDownloading && (
                      <Button size="sm" variant="primary" onClick={() => handleDownload(model.value)}><ArrowDownToLine width={14} />下载</Button>
                    )}
                    {isDownloading && (
                      <Button size="sm" variant="secondary" onClick={handleCancel}><Pause width={14} />取消下载</Button>
                    )}
                    {isReady && !isActive && (
                      <Button size="sm" variant="primary" onClick={() => handleActivate(model.value)}><CircleCheck width={14} />启用</Button>
                    )}
                    {isReady && (
                      <Button size="sm" variant="danger" onClick={() => setConfirmDelete(model.value)}><TrashBin width={14} />删除</Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={refreshStatus}><ArrowsRotateLeft width={14} />刷新</Button>
                  </div>
                </Card>
              );
            })}

            <div className="cipher-language-section">
              <h4>识别语言</h4>
              <CheckboxGroup
                value={selectedLanguages}
                onChange={(vals) => handleLanguagesChange(vals as unknown as SenseVoiceLanguage[])}
              >
                {sttLanguageOptions.map((lang) => (
                  <Checkbox key={lang.value} value={lang.value}>{lang.label}</Checkbox>
                ))}
              </CheckboxGroup>
            </div>
          </div>
        </Tabs.Panel>

        <Tabs.Panel id="gpu">
          <div className="cipher-stt-section">
            <h3>Whisper GPU 转写</h3>
            <p className="cipher-stt-desc">使用本地 Whisper 模型配合 GPU 加速进行语音识别。</p>

            {/* CUDA Runtime Status */}
            <Card className="cipher-cuda-card">
              <div className="cipher-model-header">
                <div>
                  <strong>CUDA 运行时</strong>
                  <span className="cipher-model-size">{cudaStatus?.version || '未知版本'}</span>
                  <span className="cipher-model-desc">{cudaStatus?.gpuName || '未检测到 GPU'}</span>
                </div>
                <span className="cipher-state-chip">{cudaStatus ? cudaStateLabels[cudaStatus.state] : '加载中'}</span>
              </div>
              {cudaStatus?.state === 'downloading' && (
                <div className="cipher-model-status">
                  <ProgressBar value={downloadProgress.cuda ?? 0} />
                  <span>{downloadProgress.cuda ?? 0}%</span>
                </div>
              )}
              {cudaStatus?.message && (
                <div className="cipher-cuda-message">{cudaStatus.message}</div>
              )}
              <div className="cipher-model-actions">
                {(cudaStatus?.state === 'not_installed' || cudaStatus?.state === 'error' || cudaStatus?.state === 'incompatible') && (
                  <Button size="sm" variant="primary" onClick={handleDownloadCuda}><ArrowDownToLine width={14} />下载 CUDA 运行时</Button>
                )}
                {cudaStatus?.state === 'downloading' && (
                  <Button size="sm" variant="secondary" onClick={refreshStatus}><ArrowsRotateLeft width={14} />刷新</Button>
                )}
                {cudaStatus?.state === 'ready' && (
                  <Button size="sm" variant="danger" onClick={() => setConfirmDeleteCuda(true)}><TrashBin width={14} />删除</Button>
                )}
                <Button size="sm" variant="ghost" onClick={refreshStatus}><ArrowsRotateLeft width={14} />刷新</Button>
              </div>
            </Card>

            {/* Compute Mode */}
            <div className="cipher-compute-mode">
              <h4>计算模式</h4>
              <div className="cipher-compute-options">
                <Button size="sm" variant={computeMode === 'auto' ? 'primary' : 'ghost'} onClick={() => handleComputeModeChange('auto')}>自动</Button>
                <Button size="sm" variant={computeMode === 'cpu' ? 'primary' : 'ghost'} onClick={() => handleComputeModeChange('cpu')}>仅 CPU</Button>
              </div>
            </div>

            {/* Local Whisper Models */}
            <div className="cipher-gpu-models">
              <h4>本地 Whisper 模型</h4>
              {localModels.length === 0 && <p className="cipher-empty-state">暂无已下载的本地模型。</p>}
              {localModels.map((model: LocalModelStatus) => {
                const isReady = model.state === 'ready';
                const isDownloading = model.state === 'downloading';
                const progress = downloadProgress[model.id]
                  ?? (model.totalBytes > 0 ? Math.round((model.downloadedBytes / model.totalBytes) * 100) : 0);
                return (
                  <Card key={model.id} className="cipher-model-card">
                    <div className="cipher-model-header">
                      <div>
                        <strong>{model.id}</strong>
                        <span className="cipher-model-size">{model.totalBytes > 0 ? formatBytes(model.totalBytes) : ''}</span>
                      </div>
                      {model.isCurrent && <span className="cipher-active-chip"><CircleCheck width={14} />当前</span>}
                    </div>
                    <div className="cipher-model-status">
                      <span>状态：{modelStateLabel(model.state)}</span>
                      {model.downloadedBytes > 0 && <span>{formatBytes(model.downloadedBytes)}</span>}
                      {isDownloading && <ProgressBar value={progress} />}
                      {isDownloading && <span>{progress}%</span>}
                    </div>
                    <div className="cipher-model-actions">
                      {!isReady && !isDownloading && (
                        <Button size="sm" variant="primary" onClick={() => handleDownloadLocalModel(model.id)}><ArrowDownToLine width={14} />下载</Button>
                      )}
                      {isDownloading && (
                        <Button size="sm" variant="secondary" onClick={refreshStatus}><Pause width={14} />刷新</Button>
                      )}
                      {isReady && (
                        <Button size="sm" variant="danger" onClick={() => setConfirmDeleteLocal(model.id)}><TrashBin width={14} />删除</Button>
                      )}
                    </div>
                  </Card>
                );
              })}
            </div>
          </div>
        </Tabs.Panel>

        <Tabs.Panel id="online">
          <div className="cipher-stt-section">
            <h3>在线转写服务</h3>
            <p className="cipher-stt-desc">使用云端语音识别服务，需要配置 API 凭证。请在"AI 接入"中管理转写服务商配置。</p>
            {profiles.transcriptionProfiles.length === 0 && <p className="cipher-empty-state">暂无已配置的在线转写服务。</p>}
            {profiles.transcriptionProfiles.map((profile) => (
              <Card key={profile.id} className="cipher-profile-card">
                <div className="cipher-model-header">
                  <div>
                    <strong>{profile.name}</strong>
                    <span className="cipher-model-size">{profile.provider}</span>
                  </div>
                  {profile.enabled && <span className="cipher-active-chip"><CircleCheck width={14} />可用</span>}
                </div>
                <div className="cipher-model-status">
                  <span>模型：{profile.model}</span>
                </div>
              </Card>
            ))}
          </div>
        </Tabs.Panel>
      </Tabs>

      {/* Confirm Delete SenseVoice Model */}
      {confirmDelete && (
        <div className="cipher-confirm-overlay" role="alertdialog" aria-label="确认删除模型">
          <div className="cipher-confirm-dialog">
            <h3>确认删除</h3>
            <p>确定要删除 {confirmDelete} 模型吗？此操作不可撤销。</p>
            <div className="cipher-confirm-actions">
              <Button variant="danger" onClick={() => handleDelete(confirmDelete)}>删除</Button>
              <Button variant="ghost" onClick={() => setConfirmDelete(null)}>取消</Button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Delete Local Model */}
      {confirmDeleteLocal && (
        <div className="cipher-confirm-overlay" role="alertdialog" aria-label="确认删除本地模型">
          <div className="cipher-confirm-dialog">
            <h3>确认删除</h3>
            <p>确定要删除本地模型 {confirmDeleteLocal} 吗？此操作不可撤销。</p>
            <div className="cipher-confirm-actions">
              <Button variant="danger" onClick={() => handleDeleteLocalModel(confirmDeleteLocal)}>删除</Button>
              <Button variant="ghost" onClick={() => setConfirmDeleteLocal(null)}>取消</Button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Delete CUDA Runtime */}
      {confirmDeleteCuda && (
        <div className="cipher-confirm-overlay" role="alertdialog" aria-label="确认删除 CUDA 运行时">
          <div className="cipher-confirm-dialog">
            <h3>确认删除</h3>
            <p>确定要删除 CUDA 运行时吗？GPU 转写将不可用，直到重新安装。</p>
            <div className="cipher-confirm-actions">
              <Button variant="danger" onClick={handleDeleteCuda}>删除</Button>
              <Button variant="ghost" onClick={() => setConfirmDeleteCuda(false)}>取消</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
