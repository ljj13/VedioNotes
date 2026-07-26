/**
 *应用组件——ProfileEditor 页面/功能对应的 React UI 组件。
 */

import { useState } from 'react';
import type {
  TranscriptionProfile,
  SummaryProfile,
  SecretInput,
  TranscriptionProviderKind,
  SummaryProviderKind,
} from '../lib/types';
import {
  saveTranscriptionProfile,
  saveSummaryProfile,
  discoverSummaryModels,
} from '../lib/bridge';
import StyledSelect from './StyledSelect';

type ProfileType = 'transcription' | 'summary';

/** ProfileEditorProps */
export interface ProfileEditorProps {
  profileType: ProfileType;
  initialState: 'create' | 'edit';
  existingProfile?: TranscriptionProfile | SummaryProfile;
  onSaved: () => void;
  onCancel: () => void;
}

const TRANSCRIPTION_PRESETS: Array<{
  label: string;
  kind: TranscriptionProviderKind;
  baseUrl: string;
  model: string;
}> = [
  {
    label: '腾讯云极速版',
    kind: 'tencent_flash',
    baseUrl: 'https://asr.cloud.tencent.com',
    model: '16k_zh',
  },
  {
    label: 'MiMo ASR',
    kind: 'mimo_asr',
    baseUrl: 'https://api.xiaomimimo.com',
    model: 'mimo-v2.5-asr',
  },
  {
    label: '自定义 OpenAI 兼容',
    kind: 'open_ai_compatible',
    baseUrl: '',
    model: '',
  },
];

const SUMMARY_PRESETS: Array<{
  label: string;
  kind: SummaryProviderKind;
  baseUrl: string;
  model: string;
}> = [
  {
    label: 'DeepSeek',
    kind: 'deep_seek',
    baseUrl: 'https://api.deepseek.com',
    model: 'deepseek-chat',
  },
  {
    label: 'MiMo',
    kind: 'mimo',
    baseUrl: 'https://api.xiaomimimo.com',
    model: 'mimo-v2.5',
  },
  {
    label: '自定义 OpenAI 兼容',
    kind: 'open_ai_compatible',
    baseUrl: '',
    model: '',
  },
];

/** ProfileEditor */
export default function ProfileEditor({
  profileType,
  initialState,
  existingProfile,
  onSaved,
  onCancel,
}: ProfileEditorProps) {
  // ── State ──────────────────────────────────────────────────────────────────
  const defaultPreset = (profileType === 'transcription' ? TRANSCRIPTION_PRESETS : SUMMARY_PRESETS)[0];
  const existingProvider = existingProfile && 'provider' in existingProfile ? existingProfile.provider : null;
  const [name, setName] = useState(existingProfile?.name ?? defaultPreset.label);
  const [baseUrl, setBaseUrl] = useState(existingProfile?.baseUrl ?? defaultPreset.baseUrl);
  const [model, setModel] = useState(existingProfile?.model ?? defaultPreset.model);
  const [enabled, setEnabled] = useState(existingProfile?.enabled ?? true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Credential fields
  const [selectedPresetKind, setSelectedPresetKind] = useState<string>(existingProvider ?? (profileType === 'transcription' ? 'tencent_flash' : 'deep_seek'));
  const [apiKey, setApiKey] = useState('');
  const [appId, setAppId] = useState('');
  const [secretId, setSecretId] = useState('');
  const [secretKey, setSecretKey] = useState('');

  // Model discovery
  const [discoveredModels, setDiscoveredModels] = useState<string[]>([]);
  const [discovering, setDiscovering] = useState(false);
  const [discoveryError, setDiscoveryError] = useState<string | null>(null);

  const isTencent =
    (existingProfile && 'provider' in existingProfile && existingProfile.provider === 'tencent_flash') ||
    selectedPresetKind === 'tencent_flash';
  const isLocal = profileType === 'transcription' &&
    ((existingProfile && 'provider' in existingProfile && existingProfile.provider === 'local_whisper_cpp') || selectedPresetKind === 'local_whisper_cpp');

  const isBearer =
    !isTencent &&
    ((existingProfile && 'provider' in existingProfile &&
      (existingProfile.provider === 'mimo_asr' ||
        existingProfile.provider === 'deep_seek' ||
        existingProfile.provider === 'mimo' ||
        existingProfile.provider === 'open_ai_compatible')) ||
      selectedPresetKind === 'mimo_asr' ||
      selectedPresetKind === 'deep_seek' ||
      selectedPresetKind === 'mimo' ||
      selectedPresetKind === 'custom');

  // Generate a UUID for new profiles
  const generateId = () =>
    `${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;

  // ── Preset selection ──────────────────────────────────────────────────────
  const handlePresetSelect = (
    label: string,
    kind: string,
    url: string,
    mdl: string,
  ) => {
    setName(label);
    setBaseUrl(url);
    setModel(mdl);
    setSelectedPresetKind(kind);
  };

  const providerOptions = (profileType === 'transcription'
    ? TRANSCRIPTION_PRESETS.map((preset) => ({ value: preset.kind, label: preset.label, description: preset.model }))
    : SUMMARY_PRESETS.map((preset) => ({ value: preset.kind, label: preset.label, description: preset.model })))
    .map((option) => option.value === 'open_ai_compatible' ? { ...option, value: 'custom', label: '自定义兼容' } : option);

  const selectProvider = (kind: string) => {
    if (kind === 'custom') {
      setSelectedPresetKind('custom');
      setName('自定义兼容');
      setBaseUrl('');
      setModel('');
      return;
    }
    const preset = (profileType === 'transcription' ? TRANSCRIPTION_PRESETS : SUMMARY_PRESETS)
      .find((item) => item.kind === kind);
    if (preset) handlePresetSelect(preset.label, preset.kind, preset.baseUrl, preset.model);
  };

  // ── Model discovery (explicit only, never from mount/edit) ─────────────────
  const handleDiscoverModels = async () => {
    if (profileType !== 'summary' || !existingProfile) return;
    setDiscovering(true);
    setDiscoveredModels([]);
    setDiscoveryError(null);
    try {
      const models = await discoverSummaryModels(existingProfile.id);
      setDiscoveredModels(models);
      if (models.length === 0) {
        setDiscoveryError('未发现可用模型，请手动输入。');
      }
    } catch (e: unknown) {
      const msg = (e as { message?: string })?.message ?? '模型发现失败';
      setDiscoveryError(msg);
      setDiscoveredModels([]);
    } finally {
      setDiscovering(false);
    }
  };

  const handleSelectDiscoveredModel = (mdl: string) => {
    setModel(mdl);
  };

  // ── Discover on first mount is REMOVED — explicit action only ──────────────

  // ── Build credential input ────────────────────────────────────────────────
  // Returns: SecretInput | undefined where:
  //   - SecretInput = valid replacement credential
  //   - undefined = no credential change (blank secret fields during edit)
  // Throws on invalid partial Tencent credentials to block save.
  const buildCredential = (): SecretInput | undefined => {
    if (isTencent) {
      if (!appId && !secretId && !secretKey) return undefined; // No credential change
      if (!appId || !secretId || !secretKey) {
        throw new Error('请填写完整的腾讯云凭据。');
      }
      return { type: 'tencent', appId, secretId, secretKey };
    }
    if (isBearer) {
      if (!apiKey) return undefined; // No credential change
      return { type: 'bearer', apiKey };
    }
    return undefined;
  };

  // ── Save ──────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    setSaving(true);
    setError(null);

    try {
      const credential = buildCredential();
      const profileId = existingProfile?.id ?? generateId();

      if (profileType === 'transcription') {
        const kind = selectedPresetKind === 'custom' || (!selectedPresetKind && existingProfile && 'provider' in existingProfile)
          ? (existingProfile as TranscriptionProfile)?.provider ?? 'open_ai_compatible'
          : (selectedPresetKind as TranscriptionProfile['provider']);

        const profile: TranscriptionProfile = {
          id: profileId,
          name: name.trim() || '自定义转写',
          provider: kind as TranscriptionProviderKind,
          baseUrl: isLocal ? '' : baseUrl.trim() || 'https://api.openai.com',
          model: isLocal ? (existingProfile as TranscriptionProfile)?.model ?? '' : model.trim() || 'whisper-1',
          enabled,
          builtIn: existingProfile?.builtIn ?? false,
        };
        await saveTranscriptionProfile(profile, credential);
      } else {
        const kind = selectedPresetKind === 'custom' || (!selectedPresetKind && existingProfile && 'provider' in existingProfile)
          ? (existingProfile as SummaryProfile)?.provider ?? 'open_ai_compatible'
          : (selectedPresetKind as SummaryProfile['provider']);

        const profile: SummaryProfile = {
          id: profileId,
          name: name.trim() || '自定义总结',
          provider: kind as SummaryProviderKind,
          baseUrl: baseUrl.trim() || 'https://api.openai.com',
          model: model.trim() || 'gpt-4o-mini',
          enabled,
          builtIn: existingProfile?.builtIn ?? false,
        };
        await saveSummaryProfile(profile, credential);
      }

      onSaved();
    } catch (e: unknown) {
      const err = e as { message?: string };
      setError(err?.message ?? '保存失败');
    } finally {
      setSaving(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="profile-editor provider-editor" role="region" aria-label={profileType === 'transcription' ? '转写服务编辑器' : 'AI 服务编辑器'}>
        <div className="editor-form">
          <h3>
            {initialState === 'create' ? (profileType === 'transcription' ? '新增转写服务' : '新增 AI 服务') : existingProfile?.name ?? '编辑服务'}
          </h3>

          {error && (
            <div className="editor-error" role="alert">
              {error}
            </div>
          )}

          {!isLocal && <div className="form-group">
            <label htmlFor="editor-provider">服务商</label>
            <StyledSelect label="服务商" value={selectedPresetKind === 'open_ai_compatible' ? 'custom' : selectedPresetKind} options={providerOptions} onChange={selectProvider} />
          </div>}

          {!isLocal && <div className="form-group">
            <label htmlFor="editor-name">服务名称</label>
            <label className="sr-only" htmlFor="editor-name">名称</label>
            <input
              id="editor-name"
              type="text"
              className="settings-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="配置档名称"
            />
          </div>}

          {!isLocal && <div className="form-group">
            <label htmlFor="editor-base-url">接口地址</label>
            <label className="sr-only" htmlFor="editor-base-url">API 基础地址</label>
            <input
              id="editor-base-url"
              type="text"
              className="settings-input"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://api.example.com"
            />
          </div>}

          {!isLocal && <div className="form-group">
            <label htmlFor="editor-model">模型名称</label>
            <label className="sr-only" htmlFor="editor-model">模型</label>
            <div className="model-input-row">
              <input
                id="editor-model"
                type="text"
                className="settings-input"
                aria-label="模型"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder="模型名称"
              />
            </div>
            {profileType === 'summary' && existingProfile && (
              <button
                className="discover-btn"
                onClick={handleDiscoverModels}
                disabled={discovering}
                type="button"
              >
                {discovering ? '发现中...' : '发现模型'}
              </button>
            )}
            {discoveredModels.length > 0 && (
              <StyledSelect label="已发现模型" value={discoveredModels.includes(model) ? model : ''} placeholder="选择已发现模型" options={discoveredModels.map((item) => ({ value: item, label: item }))} onChange={handleSelectDiscoveredModel} />
            )}
            {discoveryError && (
              <div className="discovery-error" role="alert">
                {discoveryError}
              </div>
            )}
          </div>}

          {isTencent && !isLocal && (
            <>
              <div className="form-group">
                <label htmlFor="editor-appid">AppID</label>
                <input
                  id="editor-appid"
                  type="text"
                  className="settings-input"
                  value={appId}
                  onChange={(e) => setAppId(e.target.value)}
                  placeholder="腾讯云 AppID"
                />
              </div>
              <div className="form-group">
                <label htmlFor="editor-secret-id">SecretID</label>
                <input
                  id="editor-secret-id"
                  type="text"
                  className="settings-input"
                  value={secretId}
                  onChange={(e) => setSecretId(e.target.value)}
                  placeholder="SecretID（留空则不修改）"
                />
              </div>
              <div className="form-group">
                <label htmlFor="editor-secret-key">SecretKey</label>
                <input
                  id="editor-secret-key"
                  type="password"
                  className="settings-input"
                  value={secretKey}
                  onChange={(e) => setSecretKey(e.target.value)}
                  placeholder="SecretKey（留空则不修改）"
                />
              </div>
            </>
          )}

          {isBearer && !isLocal && (
            <div className="form-group">
              <label htmlFor="editor-api-key">API Key</label>
              <input
                id="editor-api-key"
                type="password"
                className="settings-input"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="API Key（留空则不修改）"
              />
            </div>
          )}

          <div className="form-group checkbox-group">
            <label>
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
              />
              启用此配置档
            </label>
          </div>

          <div className="editor-actions">
            <button className="cancel-btn" onClick={onCancel} type="button">
              取消
            </button>
            <button
              className="save-btn"
              onClick={handleSave}
              disabled={saving || !name.trim() || (!isLocal && (!baseUrl.trim() || !model.trim()))}
              type="button"
              aria-label="保存服务"
            >
              <span aria-hidden="true">{saving ? '保存中…' : '保存服务'}</span>
              {!saving && <span className="sr-only">保存</span>}
            </button>
          </div>
        </div>
    </div>
  );
}
