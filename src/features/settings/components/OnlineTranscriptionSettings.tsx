import { useEffect, useMemo, useState, type Key } from 'react';
import {
  Alert,
  Button,
  Card,
  Description,
  InputGroup,
  Label,
  ListBox,
  NumberField,
  Select,
  TextField,
} from '@heroui/react';
import { CircleExclamation, Eye, EyeSlash, PlugConnection } from '@gravity-ui/icons';
import type {
  AppProfiles,
  OnlineTranscriptionLanguage,
  OnlineTranscriptionOptions,
  SecretInput,
  TranscriptionProfile,
} from '../../../lib/types';
import { settingsPlatform } from '../../../platform/settings';

interface OnlineTranscriptionSettingsProps {
  profiles: AppProfiles;
  onProfilesChanged: () => void;
}

interface OnlineProfileDraft {
  baseUrl: string;
  model: string;
  options: OnlineTranscriptionOptions;
}

interface CredentialDraft {
  apiKey: string;
  appId: string;
  secretId: string;
  secretKey: string;
}

const DEFAULT_ONLINE_OPTIONS: OnlineTranscriptionOptions = {
  language: 'auto',
  timeoutMs: 60_000,
  maxConcurrency: 2,
};

const languageOptions: Array<{ value: OnlineTranscriptionLanguage; label: string }> = [
  { value: 'auto', label: '自动识别' },
  { value: 'zh', label: '中文' },
  { value: 'en', label: '英语' },
  { value: 'ja', label: '日语' },
  { value: 'ko', label: '韩语' },
  { value: 'yue', label: '粤语' },
];

function profileDraft(profile: TranscriptionProfile): OnlineProfileDraft {
  return {
    baseUrl: profile.baseUrl,
    model: profile.model,
    options: {
      language: profile.onlineOptions?.language ?? DEFAULT_ONLINE_OPTIONS.language,
      timeoutMs: clampNumber(profile.onlineOptions?.timeoutMs, 5_000, 300_000, DEFAULT_ONLINE_OPTIONS.timeoutMs),
      maxConcurrency: clampNumber(profile.onlineOptions?.maxConcurrency, 1, 10, DEFAULT_ONLINE_OPTIONS.maxConcurrency),
    },
  };
}

function emptyCredentialDraft(): CredentialDraft {
  return { apiKey: '', appId: '', secretId: '', secretKey: '' };
}

function clampNumber(value: number | undefined, min: number, max: number, fallback: number): number {
  if (value == null || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
}

function providerCode(profile: TranscriptionProfile): string {
  switch (profile.provider) {
    case 'tencent_flash': return 'tencent_flash';
    case 'mimo_asr': return 'mimo_asr';
    case 'open_ai_compatible': return 'open_ai_compatible';
    default: return profile.provider;
  }
}

function languageLabel(value: OnlineTranscriptionLanguage): string {
  return languageOptions.find((option) => option.value === value)?.label ?? '自动识别';
}

export default function OnlineTranscriptionSettings({ profiles, onProfilesChanged }: OnlineTranscriptionSettingsProps) {
  const onlineProfiles = useMemo(
    () => profiles.transcriptionProfiles.filter((profile) => profile.provider !== 'local_whisper_cpp'),
    [profiles.transcriptionProfiles],
  );
  const initialProfileId = onlineProfiles.some((profile) => profile.id === profiles.activeTranscriptionProfileId)
    ? profiles.activeTranscriptionProfileId
    : onlineProfiles[0]?.id ?? null;
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(initialProfileId);
  const [drafts, setDrafts] = useState<Record<string, OnlineProfileDraft>>(() => Object.fromEntries(
    onlineProfiles.map((profile) => [profile.id, profileDraft(profile)]),
  ));
  const [credentialDrafts, setCredentialDrafts] = useState<Record<string, CredentialDraft>>({});
  const [credentialReady, setCredentialReady] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [busy, setBusy] = useState<'save' | 'test' | null>(null);
  const [feedback, setFeedback] = useState<{ status: 'success' | 'danger'; text: string } | null>(null);

  const selectedProfile = onlineProfiles.find((profile) => profile.id === selectedProfileId) ?? onlineProfiles[0] ?? null;
  const selectedDraft = selectedProfile ? drafts[selectedProfile.id] ?? profileDraft(selectedProfile) : null;
  const credentialDraft = selectedProfile ? credentialDrafts[selectedProfile.id] ?? emptyCredentialDraft() : emptyCredentialDraft();
  const isTencent = selectedProfile?.provider === 'tencent_flash';

  useEffect(() => {
    if (!selectedProfile) {
      setCredentialReady(false);
      return;
    }
    let active = true;
    settingsPlatform.transcription.hasProfileCredential('transcription', selectedProfile.id)
      .then((ready) => { if (active) setCredentialReady(ready); })
      .catch(() => { if (active) setCredentialReady(false); });
    return () => { active = false; };
  }, [selectedProfile]);

  useEffect(() => {
    setDrafts((current) => {
      const additions = onlineProfiles.filter((profile) => !current[profile.id]);
      if (additions.length === 0) return current;
      return {
        ...current,
        ...Object.fromEntries(additions.map((profile) => [profile.id, profileDraft(profile)])),
      };
    });
  }, [onlineProfiles]);

  const updateDraft = (patch: Partial<OnlineProfileDraft>) => {
    if (!selectedProfile || !selectedDraft) return;
    setDrafts((current) => ({
      ...current,
      [selectedProfile.id]: { ...selectedDraft, ...patch },
    }));
    setFeedback(null);
  };

  const updateOptions = (patch: Partial<OnlineTranscriptionOptions>) => {
    if (!selectedDraft) return;
    updateDraft({ options: { ...selectedDraft.options, ...patch } });
  };

  const updateCredential = (patch: Partial<CredentialDraft>) => {
    if (!selectedProfile) return;
    setCredentialDrafts((current) => ({
      ...current,
      [selectedProfile.id]: { ...(current[selectedProfile.id] ?? emptyCredentialDraft()), ...patch },
    }));
    setFeedback(null);
  };

  const selectProvider = (key: Key | null) => {
    if (key == null) return;
    setSelectedProfileId(String(key));
    setShowSecret(false);
    setFeedback(null);
  };

  const buildCredential = (): SecretInput | undefined => {
    if (isTencent) {
      const hasAny = Boolean(credentialDraft.appId || credentialDraft.secretId || credentialDraft.secretKey);
      if (!hasAny) return undefined;
      if (!credentialDraft.appId || !credentialDraft.secretId || !credentialDraft.secretKey) {
        throw new Error('请完整填写 AppID、SecretID 和 SecretKey。');
      }
      return {
        type: 'tencent',
        appId: credentialDraft.appId,
        secretId: credentialDraft.secretId,
        secretKey: credentialDraft.secretKey,
      };
    }
    return credentialDraft.apiKey ? { type: 'bearer', apiKey: credentialDraft.apiKey } : undefined;
  };

  const persistCurrentDraft = async (): Promise<string> => {
    if (!selectedProfile || !selectedDraft) throw new Error('没有可保存的在线转写服务。');
    if (!selectedDraft.baseUrl.trim()) throw new Error('接口 URL 不能为空。');
    if (!selectedDraft.model.trim()) throw new Error('模型名称不能为空。');
    const credential = buildCredential();
    const profile: TranscriptionProfile = {
      ...selectedProfile,
      baseUrl: selectedDraft.baseUrl.trim(),
      model: selectedDraft.model.trim(),
      enabled: true,
      onlineOptions: {
        language: selectedDraft.options.language,
        timeoutMs: clampNumber(selectedDraft.options.timeoutMs, 5_000, 300_000, 60_000),
        maxConcurrency: clampNumber(selectedDraft.options.maxConcurrency, 1, 10, 2),
      },
    };
    await settingsPlatform.transcription.saveTranscriptionProfile(profile, credential);
    await settingsPlatform.transcription.setActiveProfile('transcription', profile.id);
    setCredentialDrafts((current) => ({ ...current, [profile.id]: emptyCredentialDraft() }));
    if (credential) setCredentialReady(true);
    setShowSecret(false);
    onProfilesChanged();
    return profile.id;
  };

  const handleSave = async () => {
    setBusy('save');
    setFeedback(null);
    try {
      await persistCurrentDraft();
      setFeedback({ status: 'success', text: '在线转写配置已保存并启用。' });
    } catch (cause) {
      setFeedback({ status: 'danger', text: cause instanceof Error ? cause.message : '在线转写配置保存失败。' });
    } finally {
      setBusy(null);
    }
  };

  const handleTest = async () => {
    setBusy('test');
    setFeedback(null);
    try {
      const profileId = await persistCurrentDraft();
      const result = await settingsPlatform.transcription.testProfile('transcription', profileId);
      setFeedback({ status: result.success ? 'success' : 'danger', text: result.message });
    } catch (cause) {
      setFeedback({ status: 'danger', text: cause instanceof Error ? cause.message : '在线转写配置测试失败。' });
    } finally {
      setBusy(null);
    }
  };

  if (!selectedProfile || !selectedDraft) {
    return (
      <Card className="cipher-online-stt-empty-card">
        <Card.Header>
          <Card.Title>在线语音转写</Card.Title>
          <Card.Description>当前没有可用的在线转写配置档。</Card.Description>
        </Card.Header>
      </Card>
    );
  }

  return (
    <div className="cipher-online-stt-layout">
      <Card className="cipher-online-stt-form-card">
        <Card.Header className="cipher-online-stt-card-header">
          <Card.Title>在线语音转写</Card.Title>
          <Card.Description>无需下载本地模型，语音数据会发送到配置的第三方服务。</Card.Description>
        </Card.Header>
        <Card.Content className="cipher-online-stt-form-content">
          {feedback && (
            <Alert status={feedback.status} className="cipher-online-stt-feedback">
              <Alert.Indicator />
              <Alert.Content><Alert.Title>{feedback.text}</Alert.Title></Alert.Content>
            </Alert>
          )}

          <Select
            aria-label="在线转写提供商"
            className="cipher-settings-select cipher-online-stt-provider-select"
            selectedKey={selectedProfile.id}
            onSelectionChange={selectProvider}
            variant="secondary"
            fullWidth
          >
            <Label>提供商</Label>
            <Select.Trigger className="cipher-settings-select-trigger cipher-online-stt-provider-trigger">
              <Select.Value>
                <span className="cipher-online-stt-provider-value">
                  <strong>{selectedProfile.name}</strong>
                  <span>{providerCode(selectedProfile)}</span>
                </span>
              </Select.Value>
              <Select.Indicator className="cipher-settings-select-indicator" />
            </Select.Trigger>
            <Select.Popover className="cipher-settings-select-popover cipher-online-stt-provider-popover">
              <ListBox className="cipher-settings-select-listbox">
                {onlineProfiles.map((profile) => (
                  <ListBox.Item key={profile.id} id={profile.id} textValue={`${profile.name} ${providerCode(profile)}`} className="cipher-settings-select-option cipher-online-stt-provider-option">
                    <span className="cipher-online-stt-provider-value">
                      <strong>{profile.name}</strong>
                      <span>{providerCode(profile)}</span>
                    </span>
                    <ListBox.ItemIndicator className="cipher-settings-select-option-indicator" />
                  </ListBox.Item>
                ))}
              </ListBox>
            </Select.Popover>
            <Description>切换服务商会恢复该配置档自己的地址、模型和未保存草稿。</Description>
          </Select>

          <TextField fullWidth value={selectedDraft.baseUrl} onChange={(baseUrl) => updateDraft({ baseUrl })}>
            <Label>接口 URL</Label>
            <InputGroup fullWidth variant="secondary" className="cipher-online-stt-input-group">
              <InputGroup.Input aria-label="接口 URL" placeholder="https://api.example.com/v1" />
            </InputGroup>
            <Description>支持基础 URL；请求路径由当前 provider 的后端适配器按协议补全。</Description>
          </TextField>

          <div className="cipher-online-stt-two-column-fields">
            {isTencent ? (
              <div className="cipher-online-stt-tencent-fields" aria-label="腾讯云凭据">
                <TextField fullWidth value={credentialDraft.appId} onChange={(appId) => updateCredential({ appId })}>
                  <Label>AppID</Label>
                  <InputGroup fullWidth variant="secondary" className="cipher-online-stt-input-group">
                    <InputGroup.Input aria-label="腾讯云 AppID" placeholder={credentialReady ? '已保存，留空保持不变' : '输入腾讯云 AppID'} />
                  </InputGroup>
                </TextField>
                <TextField fullWidth value={credentialDraft.secretId} onChange={(secretId) => updateCredential({ secretId })}>
                  <Label>SecretID</Label>
                  <InputGroup fullWidth variant="secondary" className="cipher-online-stt-input-group">
                    <InputGroup.Input aria-label="腾讯云 SecretID" placeholder={credentialReady ? '已保存，留空保持不变' : '输入腾讯云 SecretID'} />
                  </InputGroup>
                </TextField>
                <TextField fullWidth value={credentialDraft.secretKey} onChange={(secretKey) => updateCredential({ secretKey })}>
                  <Label>SecretKey</Label>
                  <InputGroup fullWidth variant="secondary" className="cipher-online-stt-input-group cipher-online-stt-secret-group">
                    <InputGroup.Input aria-label="腾讯云 SecretKey" type={showSecret ? 'text' : 'password'} placeholder={credentialReady ? '已保存，留空保持不变' : '输入腾讯云 SecretKey'} />
                    <InputGroup.Suffix>
                      <Button type="button" isIconOnly variant="ghost" size="sm" aria-label={showSecret ? '隐藏腾讯云 SecretKey' : '显示腾讯云 SecretKey'} onPress={() => setShowSecret((value) => !value)}>
                        {showSecret ? <EyeSlash width={17} height={17} /> : <Eye width={17} height={17} />}
                      </Button>
                    </InputGroup.Suffix>
                  </InputGroup>
                </TextField>
              </div>
            ) : (
              <TextField fullWidth value={credentialDraft.apiKey} onChange={(apiKey) => updateCredential({ apiKey })}>
                <Label>API Key</Label>
                <InputGroup fullWidth variant="secondary" className="cipher-online-stt-input-group cipher-online-stt-secret-group">
                  <InputGroup.Input aria-label="在线转写 API Key" type={showSecret ? 'text' : 'password'} autoComplete="new-password" spellCheck={false} placeholder={credentialReady ? '已保存，留空保持不变' : '请输入在线 STT API Key'} />
                  <InputGroup.Suffix>
                    <Button type="button" isIconOnly variant="ghost" size="sm" aria-label={showSecret ? '隐藏在线转写 API Key' : '显示在线转写 API Key'} onPress={() => setShowSecret((value) => !value)}>
                      {showSecret ? <EyeSlash width={17} height={17} /> : <Eye width={17} height={17} />}
                    </Button>
                  </InputGroup.Suffix>
                </InputGroup>
                <Description>密钥仅在保存时发送给系统凭据库；留空保持已保存凭据。</Description>
              </TextField>
            )}

            <TextField fullWidth value={selectedDraft.model} onChange={(model) => updateDraft({ model })}>
              <Label>模型名称</Label>
              <InputGroup fullWidth variant="secondary" className="cipher-online-stt-input-group">
                <InputGroup.Input aria-label="模型名称" placeholder="gpt-4o-mini-transcribe" />
              </InputGroup>
              <Description>{isTencent ? '腾讯云使用真实 Flash ASR 引擎类型。' : '只填写当前 provider 支持的语音识别模型。'}</Description>
            </TextField>
          </div>

          <div className="cipher-online-stt-runtime-fields">
            <Select
              aria-label="识别语言"
              selectedKey={selectedDraft.options.language}
              onSelectionChange={(key) => { if (key != null) updateOptions({ language: String(key) as OnlineTranscriptionLanguage }); }}
              variant="secondary"
              fullWidth
              isDisabled={isTencent}
            >
              <Label>识别语言</Label>
              <Select.Trigger className="cipher-settings-select-trigger cipher-online-stt-language-trigger">
                <Select.Value>{languageLabel(selectedDraft.options.language)}</Select.Value>
                <Select.Indicator className="cipher-settings-select-indicator" />
              </Select.Trigger>
              <Select.Popover className="cipher-settings-select-popover">
                <ListBox className="cipher-settings-select-listbox">
                  {languageOptions.map((option) => (
                    <ListBox.Item key={option.value} id={option.value} textValue={option.label} className="cipher-settings-select-option">
                      {option.label}<ListBox.ItemIndicator className="cipher-settings-select-option-indicator" />
                    </ListBox.Item>
                  ))}
                </ListBox>
              </Select.Popover>
              {isTencent && <Description>腾讯云识别语言由模型/引擎类型决定。</Description>}
            </Select>

            <NumberField
              aria-label="超时时间（毫秒）"
              value={selectedDraft.options.timeoutMs}
              minValue={5_000}
              maxValue={300_000}
              step={5_000}
              onChange={(value) => updateOptions({ timeoutMs: clampNumber(value, 5_000, 300_000, 60_000) })}
              fullWidth
              variant="secondary"
            >
              <Label>超时时间（毫秒）</Label>
              <NumberField.Group className="cipher-online-stt-number-group">
                <NumberField.DecrementButton />
                <NumberField.Input />
                <NumberField.IncrementButton />
              </NumberField.Group>
            </NumberField>

            <NumberField
              aria-label="批量并发数"
              value={selectedDraft.options.maxConcurrency}
              minValue={1}
              maxValue={10}
              step={1}
              onChange={(value) => updateOptions({ maxConcurrency: clampNumber(value, 1, 10, 2) })}
              fullWidth
              variant="secondary"
            >
              <Label>批量并发数</Label>
              <NumberField.Group className="cipher-online-stt-number-group">
                <NumberField.DecrementButton />
                <NumberField.Input />
                <NumberField.IncrementButton />
              </NumberField.Group>
            </NumberField>
          </div>
        </Card.Content>
        <Card.Footer className="cipher-online-stt-actions">
          <Button type="button" variant="secondary" onPress={() => void handleTest()} isDisabled={busy !== null}>
            <PlugConnection width={16} height={16} />{busy === 'test' ? '测试中…' : '测试在线配置'}
          </Button>
          <Button type="button" variant="primary" onPress={() => void handleSave()} isDisabled={busy !== null}>
            {busy === 'save' ? '保存中…' : '保存并启用'}
          </Button>
        </Card.Footer>
      </Card>

      <Card className="cipher-online-stt-reminder-card">
        <Card.Header>
          <Card.Title>使用提醒</Card.Title>
          <Card.Description>在线模式不依赖本地模型。</Card.Description>
        </Card.Header>
        <Card.Content>
          <Alert status="warning" className="cipher-online-stt-privacy-alert">
            <Alert.Indicator><CircleExclamation width={18} height={18} /></Alert.Indicator>
            <Alert.Content>
              <Alert.Title>注意隐私与费用</Alert.Title>
              <Alert.Description>语音文件会发送到第三方 STT 服务，识别效果取决于服务商模型、网络状况和接口限流策略。</Alert.Description>
            </Alert.Content>
          </Alert>
        </Card.Content>
      </Card>
    </div>
  );
}
