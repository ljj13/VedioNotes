import { useEffect, useState, type Key } from 'react';
import { Tabs, Card, Checkbox, CheckboxGroup, ProgressBar, Button } from '@heroui/react';
import { Cpu, Gpu, Cloud, ArrowDownToLine, ArrowsRotateLeft, TrashBin, Pause, CircleCheck } from '@gravity-ui/icons';
import { settingsPlatform, attachLateSafeListener } from '../../../platform/settings';
import type { SenseVoiceStatus, SenseVoiceModelId, SenseVoiceLanguage, TranscriptionMode, LocalModelStatus } from '../../../lib/types';
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

function modelStateLabel(state: string): string {
  switch (state) {
    case 'not_downloaded': return '未下载';
    case 'downloading': return '下载中';
    case 'ready': return '已就绪';
    case 'corrupt': return '已损坏';
    case 'failed': return '下载失败';
    default: return state;
  }
}

export default function TranscriptionTab({
  preferences,
  onPreferencesChanged,
  onSenseVoiceStatusChanged,
  profiles,
  localModels,
}: SettingsEntryProps) {
  const currentMode = preferences.transcriptionMode ?? 'sensevoice_cpu';
  const activeTab: SttMode = currentMode === 'whisper_local' ? 'gpu' : currentMode === 'online_profile' ? 'online' : 'cpu';

  const [senseVoiceStatus, setSenseVoiceStatus] = useState<SenseVoiceStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState<SenseVoiceModelId | null>(null);
  const [active, setActive] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setActive(true);
    settingsPlatform.transcription.getSenseVoiceStatus().then((status) => {
      if (!cancelled) {
        setSenseVoiceStatus(status);
        onSenseVoiceStatusChanged(status);
        setLoading(false);
      }
    });
    return () => { cancelled = true; setActive(false); };
  }, [onSenseVoiceStatusChanged]);

  const refreshStatus = async () => {
    const status = await settingsPlatform.transcription.getSenseVoiceStatus();
    setSenseVoiceStatus(status);
    onSenseVoiceStatusChanged(status);
  };

  const handleDownload = async (modelId: SenseVoiceModelId) => {
    const unlistenReg = settingsPlatform.transcription.onSenseVoiceDownloadProgress(async () => {
      const current = await settingsPlatform.transcription.getSenseVoiceStatus();
      setSenseVoiceStatus(current);
    });
    await attachLateSafeListener(() => active, unlistenReg);
    await settingsPlatform.transcription.downloadSenseVoice(modelId);
    await refreshStatus();
  };

  const handleCancel = async () => {
    await settingsPlatform.transcription.cancelSenseVoiceDownload();
    await refreshStatus();
  };

  const handleDelete = async (modelId: SenseVoiceModelId) => {
    await settingsPlatform.transcription.deleteSenseVoice(modelId, confirmDelete !== null);
    setConfirmDelete(null);
    await refreshStatus();
  };

  const handleActivate = async (modelId: SenseVoiceModelId) => {
    const status = await settingsPlatform.transcription.setSenseVoiceModel(modelId);
    setSenseVoiceStatus(status);
    onSenseVoiceStatusChanged(status);
  };

  const handleLanguagesChange = async (values: SenseVoiceLanguage[]) => {
    const mode: TranscriptionMode = activeTab === 'cpu' ? 'sensevoice_cpu' : activeTab === 'gpu' ? 'whisper_local' : 'online_profile';
    const saved = await settingsPlatform.preferences.saveTranscription(mode, values);
    if (saved) onPreferencesChanged(saved);
  };

  const handleTabChange = (key: Key | null) => {
    const mode: TranscriptionMode = String(key) === 'gpu' ? 'whisper_local' : String(key) === 'online' ? 'online_profile' : 'sensevoice_cpu';
    settingsPlatform.preferences.saveTranscription(mode, selectedLanguages).then((saved) => {
      if (saved) onPreferencesChanged(saved);
    });
  };

  const selectedModel = senseVoiceStatus?.selectedModel;
  const selectedLanguages = preferences.sensevoiceLanguages ?? ['zh'];

  return (
    <div className="cipher-stt-tab">
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
              const progress = modelStatus && modelStatus.totalBytes > 0 ? Math.round((modelStatus.downloadedBytes / modelStatus.totalBytes) * 100) : 0;

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
                    </div>
                  )}
                  <div className="cipher-model-actions">
                    {!isReady && !isDownloading && (
                      <Button size="sm" variant="primary" onClick={() => handleDownload(model.value)}><ArrowDownToLine width={14} />下载</Button>
                    )}
                    {isDownloading && (
                      <Button size="sm" variant="secondary" onClick={handleCancel}><Pause width={14} />暂停</Button>
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
            <div className="cipher-gpu-models">
              {localModels.length === 0 && <p>暂无已下载的本地模型。</p>}
              {localModels.map((model: LocalModelStatus) => (
                <Card key={model.id} className="cipher-model-card">
                  <div className="cipher-model-header">
                    <div>
                      <strong>{model.id}</strong>
                      <span className="cipher-model-size">{model.state}</span>
                    </div>
                    {model.isCurrent && <span className="cipher-active-chip"><CircleCheck width={14} />当前</span>}
                  </div>
                </Card>
              ))}
            </div>
          </div>
        </Tabs.Panel>

        <Tabs.Panel id="online">
          <div className="cipher-stt-section">
            <h3>在线转写服务</h3>
            <p className="cipher-stt-desc">使用云端语音识别服务，需要配置 API 凭证。</p>
            {profiles.transcriptionProfiles.length === 0 && <p>暂无已配置的在线转写服务。</p>}
            {profiles.transcriptionProfiles.map((profile) => (
              <Card key={profile.id} className="cipher-profile-card">
                <div><strong>{profile.name}</strong><span>{profile.provider}</span></div>
              </Card>
            ))}
          </div>
        </Tabs.Panel>
      </Tabs>

      {confirmDelete && (
        <div className="cipher-confirm-overlay" role="alertdialog" aria-label="确认删除">
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
    </div>
  );
}
