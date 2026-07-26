/**
 *应用组件——ProfileSelectors 页面/功能对应的 React UI 组件。
 */

import { useState, useEffect, useCallback } from 'react';
import type { AppProfiles, LocalModelStatus } from '../lib/types';
import { hasProfileCredential, setActiveProfile } from '../lib/bridge';
import ServicePicker, { type ServicePickerOption } from './ServicePicker';

interface ProfileSelectorsProps {
  profiles: AppProfiles | null;
  disabled: boolean;
  onProfileChanged?: () => void;
  localModels?: LocalModelStatus[];
}

/** ProfileSelectors */
export default function ProfileSelectors({
  profiles,
  disabled,
  onProfileChanged,
  localModels = [],
}: ProfileSelectorsProps) {
  const [credentialStates, setCredentialStates] = useState<
    Record<string, boolean>
  >({});
  const [readinessLoading, setReadinessLoading] = useState(true);
  const [readinessErrors, setReadinessErrors] = useState<
    Record<string, string>
  >({});
  const [mutationError, setMutationError] = useState<string | null>(null);

  const checkCredential = useCallback(
    (type: string, id: string) => hasProfileCredential(type, id),
    [],
  );

  // Check credential readiness for all enabled profiles
  useEffect(() => {
    if (!profiles) return;
    let cancelled = false;
    setReadinessLoading(true);
    setMutationError(null);
    setReadinessErrors({});
    setCredentialStates({});
    const allProfiles: Array<{ type: string; id: string }> = [
      ...profiles.transcriptionProfiles
        .filter((p) => p.enabled && p.provider !== 'local_whisper_cpp')
        .map((p) => ({ type: 'transcription' as const, id: p.id })),
      ...profiles.summaryProfiles
        .filter((p) => p.enabled)
        .map((p) => ({ type: 'summary' as const, id: p.id })),
    ];
    if (allProfiles.length === 0) {
      setReadinessLoading(false);
      return;
    }
    let completed = 0;
    for (const p of allProfiles) {
      checkCredential(p.type, p.id)
        .then((has) => {
          if (cancelled) return;
          setCredentialStates((prev) => ({
            ...prev,
            [`${p.type}:${p.id}`]: has,
          }));
        })
        .catch((e: unknown) => {
          if (cancelled) return;
          const msg =
            (e as { message?: string })?.message ?? '凭据状态查询失败';
          setReadinessErrors((prev) => ({
            ...prev,
            [`${p.type}:${p.id}`]: msg,
          }));
        })
        .finally(() => {
          if (cancelled) return;
          completed++;
          if (completed >= allProfiles.length) {
            setReadinessLoading(false);
          }
        });
    }
    return () => {
      cancelled = true;
    };
  }, [profiles, checkCredential]);

  const isCredentialReady = (type: string, id: string): boolean => {
    const local = profiles?.transcriptionProfiles.find((profile) => profile.id === id && profile.provider === 'local_whisper_cpp');
    if (local) return localModels.some((model) => model.id === local.model && model.state === 'ready');
    return credentialStates[`${type}:${id}`] ?? false;
  };

  const hasReadinessError = (type: string, id: string): boolean => {
    return !!readinessErrors[`${type}:${id}`];
  };

  const handleTranscriptionChange = async (id: string) => {
    if (!id || !profiles) return;
    setMutationError(null);
    try {
      await setActiveProfile('transcription', id);
      onProfileChanged?.();
    } catch (e: unknown) {
      const msg =
        (e as { message?: string })?.message ?? '切换转写配置失败';
      setMutationError(msg);
    }
  };

  const handleSummaryChange = async (id: string) => {
    if (!id || !profiles) return;
    setMutationError(null);
    try {
      await setActiveProfile('summary', id);
      onProfileChanged?.();
    } catch (e: unknown) {
      const msg =
        (e as { message?: string })?.message ?? '切换总结配置失败';
      setMutationError(msg);
    }
  };

  if (!profiles) {
    return null;
  }

  const enabledTranscriptionProfiles = profiles.transcriptionProfiles.filter(
    (p) => p.enabled && isCredentialReady('transcription', p.id),
  );
  const enabledSummaryProfiles = profiles.summaryProfiles.filter(
    (p) => p.enabled && isCredentialReady('summary', p.id),
  );

  const activeTranscriptionId = profiles.activeTranscriptionProfileId;
  const activeSummaryId = profiles.activeSummaryProfileId;

  const activeTranscriptionIsReady =
    activeTranscriptionId != null &&
    isCredentialReady('transcription', activeTranscriptionId);
  const activeSummaryIsReady =
    activeSummaryId != null &&
    isCredentialReady('summary', activeSummaryId);

  // Controlled value: empty during loading, active ID only if credential-ready
  const transcriptionValue = readinessLoading
    ? ''
    : activeTranscriptionId != null && activeTranscriptionIsReady
      ? activeTranscriptionId
      : '';

  const summaryValue = readinessLoading
    ? ''
    : activeSummaryId != null && activeSummaryIsReady
      ? activeSummaryId
      : '';

  // Disabled: during task, loading, or when no ready options at all
  const transcriptionDisabled =
    disabled || readinessLoading || enabledTranscriptionProfiles.length === 0;
  const summaryDisabled =
    disabled || readinessLoading || enabledSummaryProfiles.length === 0;

  const transcriptionOptions: ServicePickerOption[] = enabledTranscriptionProfiles.map((profile) => ({
    id: profile.id,
    name: profile.name,
    meta: profile.provider === 'local_whisper_cpp' ? `${profile.model} · whisper.cpp` : profile.model,
    group: profile.provider === 'local_whisper_cpp' ? '本地服务' : profile.builtIn ? '云端服务' : '自定义服务',
  }));
  const summaryOptions: ServicePickerOption[] = enabledSummaryProfiles.map((profile) => ({
    id: profile.id,
    name: profile.name,
    meta: profile.model,
    group: profile.builtIn ? '云端服务' : '自定义服务',
  }));

  // Collect readiness errors for display per category
  const transcriptionReadinessErrors = profiles.transcriptionProfiles
    .filter((p) => hasReadinessError('transcription', p.id))
    .map((p) => readinessErrors[`transcription:${p.id}`]);

  const summaryReadinessErrors = profiles.summaryProfiles
    .filter((p) => hasReadinessError('summary', p.id))
    .map((p) => readinessErrors[`summary:${p.id}`]);

  return (
    <div className="profile-selectors">
      <div className="selector-group">
        <ServicePicker
          label="转写服务"
          prefix="转写"
          value={transcriptionValue}
          options={transcriptionOptions}
          loading={readinessLoading}
          disabled={transcriptionDisabled}
          placeholder="请选择可用配置"
          onSelect={handleTranscriptionChange}
        />
        {transcriptionReadinessErrors.length > 0 && (
          <div className="selector-errors" role="alert">
            {transcriptionReadinessErrors.map((err, i) => (
              <div key={i} className="selector-error-item">
                {err}
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="selector-group">
        <ServicePicker
          label="核心总结"
          prefix="总结"
          value={summaryValue}
          options={summaryOptions}
          loading={readinessLoading}
          disabled={summaryDisabled}
          placeholder="请选择可用配置"
          onSelect={handleSummaryChange}
        />
        {summaryReadinessErrors.length > 0 && (
          <div className="selector-errors" role="alert">
            {summaryReadinessErrors.map((err, i) => (
              <div key={i} className="selector-error-item">
                {err}
              </div>
            ))}
          </div>
        )}
      </div>
      {mutationError && (
        <div className="selector-mutation-error" role="alert">
          {mutationError}
        </div>
      )}
    </div>
  );
}
