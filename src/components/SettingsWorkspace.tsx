import { useEffect, useState, type ReactNode } from 'react';
import type { AppPreferences, AppProfiles, LocalModelStatus, SenseVoiceLanguage, SenseVoiceStatus, TranscriptionMode, TranscriptionProfile } from '../lib/types';
import type { SettingsSection } from '../lib/workbenchNavigation';
import { setActiveProfile, setTranscriptionPreferences } from '../lib/bridge';
import CudaRuntimeManager from './CudaRuntimeManager';
import LocalModelManager from './LocalModelManager';
import ProfileManager from './ProfileManager';
import StyledSelect from './StyledSelect';
import SettingsNav from './settings/SettingsNav';
import AiAccessSettings from './settings/AiAccessSettings';
import SenseVoiceManager from './SenseVoiceManager';
import DataManagementSettings from './settings/DataManagementSettings';
import AppearanceSettings from './settings/AppearanceSettings';
import AboutSettings from './settings/AboutSettings';

type Props = {
  section: SettingsSection;
  profiles: AppProfiles;
  localModels: LocalModelStatus[];
  preferences: AppPreferences;
  theme: 'light' | 'dark';
  sidebarCollapsed: boolean;
  onSelectSection: (section: SettingsSection) => void;
  onReturn: () => void;
  onProfilesChanged: () => void;
  onModelsChanged: () => void;
  onPreferencesChanged: (preferences: AppPreferences) => void;
  onSenseVoiceStatusChanged: (status: SenseVoiceStatus) => void;
  onToggleTheme: () => void;
  onToggleSidebar: () => void;
};

type TranscriptionTab = 'cpu' | 'gpu' | 'online';

const sections: Array<{ id: SettingsSection; label: string }> = [
  { id: 'appearance', label: '外观' },
  { id: 'transcription', label: '语音转文字' },
  { id: 'ai', label: 'AI 接入' },
  { id: 'data', label: '数据管理' },
  { id: 'about', label: '关于' },
];

const transcriptionModes: Array<{ id: TranscriptionTab; label: string }> = [
  { id: 'cpu', label: 'CPU 模式' },
  { id: 'gpu', label: 'GPU 模式' },
  { id: 'online', label: '在线模式' },
];

function SegmentTabs<T extends string>({
  label,
  value,
  items,
  onChange,
  className = '',
}: {
  label: string;
  value: T;
  items: Array<{ id: T; label: string }>;
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <div className={`settings-segments${className ? ` ${className}` : ''}`} role="tablist" aria-label={label}>
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          role="tab"
          aria-selected={item.id === value}
          className={item.id === value ? 'active' : ''}
          onClick={() => onChange(item.id)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

function StatusNotice({ children, tone = 'info' }: { children: ReactNode; tone?: 'info' | 'warning' | 'success' }) {
  return <div className={`settings-status ${tone}`} role="status">{children}</div>;
}

function SpeechToTextPanel({
  profiles,
  localModels,
  preferences,
  onProfilesChanged,
  onModelsChanged,
  onPreferencesChanged,
  onSenseVoiceStatusChanged,
}: Pick<Props, 'profiles' | 'localModels' | 'preferences' | 'onProfilesChanged' | 'onModelsChanged' | 'onPreferencesChanged' | 'onSenseVoiceStatusChanged'>) {
  const tabFromMode = (value: TranscriptionMode): TranscriptionTab => value === 'sensevoice_cpu' ? 'cpu' : value === 'whisper_local' ? 'gpu' : 'online';
  const modeFromTab = (value: TranscriptionTab): TranscriptionMode => value === 'cpu' ? 'sensevoice_cpu' : value === 'gpu' ? 'whisper_local' : 'online_profile';
  const currentPreferenceMode = preferences.transcriptionMode ?? 'online_profile';
  const currentLanguages = preferences.sensevoiceLanguages ?? ['zh'];
  const [mode, setMode] = useState<TranscriptionTab>(tabFromMode(currentPreferenceMode));
  const [onlineError, setOnlineError] = useState('');
  const localProfile = profiles.transcriptionProfiles.find(
    (profile): profile is TranscriptionProfile => profile.provider === 'local_whisper_cpp',
  );
  const onlineProfiles = profiles.transcriptionProfiles.filter((profile) => profile.provider !== 'local_whisper_cpp');

  const selectOnlineProfile = async (profileId: string) => {
    setOnlineError('');
    try {
      await setActiveProfile('transcription', profileId);
      onProfilesChanged();
    } catch (cause) {
      setOnlineError(cause instanceof Error ? cause.message : '切换在线转写配置失败。');
    }
  };

  useEffect(() => setMode(tabFromMode(currentPreferenceMode)), [currentPreferenceMode]);

  const selectMode = async (next: TranscriptionTab) => {
    setOnlineError('');
    setMode(next);
    try {
      const saved = await setTranscriptionPreferences(modeFromTab(next), currentLanguages);
      if (saved) onPreferencesChanged(saved);
    } catch (cause) {
      setMode(tabFromMode(currentPreferenceMode));
      setOnlineError(cause instanceof Error ? cause.message : '无法保存转写模式。');
    }
  };

  const saveLanguages = async (languages: SenseVoiceLanguage[]) => {
    try {
      const saved = await setTranscriptionPreferences('sensevoice_cpu', languages);
      onPreferencesChanged(saved);
    } catch (cause) {
      setOnlineError(cause instanceof Error ? cause.message : '无法保存识别语言。');
    }
  };

  return (
    <section className="settings-feature" aria-label="语音转文字设置">
      <header className="settings-feature-header"><h2>语音转文字</h2><p>根据使用场景选择本地 CPU、本地 GPU 或在线转写。</p></header>
      <SegmentTabs label="转写模式" value={mode} items={transcriptionModes} onChange={(next) => void selectMode(next)} />

      {mode === 'cpu' && (
        <SenseVoiceManager languages={currentLanguages} onLanguagesChange={(languages) => void saveLanguages(languages)} onStatusChange={onSenseVoiceStatusChanged} />
      )}

      {mode === 'gpu' && (
        <div className="settings-stack" role="tabpanel">
          <StatusNotice tone="success">GPU 模式使用现有 whisper.cpp、模型校验和 CUDA 自动回退后端。</StatusNotice>
          <div className="local-runtime-settings"><LocalModelManager models={localModels} localProfile={localProfile} onModelsChanged={onModelsChanged} onProfilesChanged={onProfilesChanged} /><CudaRuntimeManager /></div>
        </div>
      )}

      {mode === 'online' && (
        <div className="settings-stack" role="tabpanel">
          <article className="settings-surface">
            <div className="settings-card-heading"><div><h3>在线转写配置</h3><p>密钥继续由 Windows Credential Manager 隔离保存。</p></div></div>
            <label className="settings-field"><span>当前服务商</span><StyledSelect label="在线转写服务商" value={onlineProfiles.some((profile) => profile.id === profiles.activeTranscriptionProfileId) ? profiles.activeTranscriptionProfileId ?? '' : ''} placeholder="选择在线转写配置" options={onlineProfiles.map((profile) => ({ value: profile.id, label: profile.name, description: `${profile.provider} · ${profile.model}` }))} onChange={selectOnlineProfile} /></label>
            {onlineError && <StatusNotice tone="warning">{onlineError}</StatusNotice>}
          </article>
          <section aria-label="转写服务"><ProfileManager profiles={profiles} onProfilesChanged={onProfilesChanged} defaultTab="transcription" /></section>
        </div>
      )}
      {onlineError && <StatusNotice tone="warning">{onlineError}</StatusNotice>}
    </section>
  );
}

export default function SettingsWorkspace(props: Props) {
  const selected = sections.find((item) => item.id === props.section) ?? sections[1];
  return (
    <section className="settings-page settings-workspace settings-workspace-v2" aria-label="设置工作区">
      <SettingsNav items={sections} value={props.section} onChange={props.onSelectSection} />
      <button type="button" className="settings-return settings-return-floating" onClick={props.onReturn} aria-label="返回工作台">
        <svg aria-hidden="true" viewBox="0 0 24 24"><path d="m15 18-6-6 6-6" /></svg>
        <span>返回工作台</span>
      </button>
      <div className="settings-body settings-scroll-area">
        <div className="settings-pane-v2 tab-content" aria-label={selected.label}>
          {props.section === 'appearance' && <AppearanceSettings preferences={props.preferences} sidebarCollapsed={props.sidebarCollapsed} onPreferencesChanged={props.onPreferencesChanged} onToggleSidebar={props.onToggleSidebar} />}
          {props.section === 'transcription' && <SpeechToTextPanel {...props} />}
          {props.section === 'ai' && <AiAccessSettings profiles={props.profiles} onProfilesChanged={props.onProfilesChanged} />}
          {props.section === 'data' && <DataManagementSettings initialLogLevel={props.preferences.logLevel ?? 'info'} />}
          {props.section === 'about' && <AboutSettings />}
        </div>
      </div>
    </section>
  );
}
