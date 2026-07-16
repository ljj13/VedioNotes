import { useState, useCallback, useEffect } from 'react';
import type {
  AppProfiles,
  TranscriptionProfile,
  SummaryProfile,
  ProfileTestResult,
} from '../lib/types';
import {
  testProfile,
  setActiveProfile,
  setFallbackTranscriptionProfile,
  deleteProfile,
  hasProfileCredential,
} from '../lib/bridge';
import ProviderEditorDialog from './settings/ProviderEditorDialog';
import StyledSelect from './StyledSelect';

interface ProfileManagerProps {
  profiles: AppProfiles;
  onProfilesChanged: () => void;
  defaultTab?: 'transcription' | 'summary';
  createRequest?: number;
}

type ManagerTab = 'transcription' | 'summary';

export default function ProfileManager({
  profiles,
  onProfilesChanged,
  defaultTab,
  createRequest = 0,
}: ProfileManagerProps) {
  const tab: ManagerTab = defaultTab ?? 'transcription';
  const [editing, setEditing] = useState<{
    action: 'create' | 'edit';
    profileId?: string;
  } | null>(null);
  const [testStates, setTestStates] = useState<Record<string, ProfileTestResult | 'testing' | null>>({});
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [credentialStates, setCredentialStates] = useState<Record<string, boolean>>({});
  const [credentialErrors, setCredentialErrors] = useState<Record<string, string>>({});
  const [fallbackError, setFallbackError] = useState<string | null>(null);
  const [activeError, setActiveError] = useState<string | null>(null);
  const [testConfirm, setTestConfirm] = useState<{ profileType: string; profileId: string } | null>(null);

  useEffect(() => {
    if (createRequest > 0) setEditing({ action: 'create' });
  }, [createRequest]);

  // Check credential readiness for all profiles in this tab
  useEffect(() => {
    const allProfiles = tab === 'transcription'
      ? profiles.transcriptionProfiles
      : profiles.summaryProfiles;
    for (const p of allProfiles) {
      hasProfileCredential(tab, p.id)
        .then((has) => setCredentialStates((prev) => ({ ...prev, [p.id]: has })))
        .catch((e: unknown) => {
          const msg = (e as { message?: string })?.message ?? '凭据状态查询失败';
          setCredentialStates((prev) => ({ ...prev, [p.id]: false }));
          setCredentialErrors((prev) => ({ ...prev, [p.id]: msg }));
        });
    }
  }, [profiles, tab]);

  const handleTest = useCallback(
    async (profileType: string, profileId: string) => {
      // Show charging warning; require confirmation
      if (!testConfirm || testConfirm.profileType !== profileType || testConfirm.profileId !== profileId) {
        setTestConfirm({ profileType, profileId });
        return;
      }
      setTestConfirm(null);
      setTestStates((prev) => ({ ...prev, [`${profileType}:${profileId}`]: 'testing' }));
      try {
        const result = await testProfile(profileType, profileId);
        setTestStates((prev) => ({
          ...prev,
          [`${profileType}:${profileId}`]: result,
        }));
      } catch (e: unknown) {
        const err = e as { message?: string };
        setTestStates((prev) => ({
          ...prev,
          [`${profileType}:${profileId}`]: {
            success: false,
            message: err?.message ?? '测试失败',
            latencyMs: null,
          },
        }));
      }
    },
    [testConfirm],
  );

  const handleSetActive = useCallback(
    async (profileType: string, profileId: string) => {
      try {
        await setActiveProfile(profileType, profileId);
        onProfilesChanged();
      } catch (e: unknown) {
        const msg = (e as { message?: string })?.message ?? '设为当前失败';
        setActiveError(msg);
      }
    },
    [onProfilesChanged],
  );

  const handleSetFallback = useCallback(
    async (profileId: string | null): Promise<void> => {
      try {
        await setFallbackTranscriptionProfile(profileId);
        onProfilesChanged();
      } catch (e: unknown) {
        const msg = (e as { message?: string })?.message ?? '设置备用配置失败';
        throw new Error(msg);
      }
    },
    [onProfilesChanged],
  );

  const handleDelete = useCallback(
    async (profileType: string, profileId: string) => {
      if (confirmDelete !== profileId) {
        // Check if this is an active profile
        if (profileType === 'transcription' && profiles.activeTranscriptionProfileId === profileId) {
          setDeleteError('此配置档为当前使用的转写配置档。请先切换到其他配置档后再删除。');
          return;
        }
        if (profileType === 'summary' && profiles.activeSummaryProfileId === profileId) {
          setDeleteError('此配置档为当前使用的总结配置档。请先切换到其他配置档后再删除。');
          return;
        }
        setConfirmDelete(profileId);
        return;
      }

      try {
        await deleteProfile(profileType, profileId);
        setConfirmDelete(null);
        setDeleteError(null);
        onProfilesChanged();
      } catch (e: unknown) {
        const err = e as { message?: string };
        setDeleteError(err?.message ?? '删除失败');
      }
    },
    [confirmDelete, profiles, onProfilesChanged],
  );

  const isEditing = editing !== null;

  // Local Whisper is managed only through the model tab so an unready model
  // can never be selected from the generic profile controls.
  const transcriptionProfiles = profiles.transcriptionProfiles.filter((profile) => profile.provider !== 'local_whisper_cpp');
  const summaryProfiles = profiles.summaryProfiles;

  // Render a profile card
  const renderTranscriptionCard = (p: TranscriptionProfile) => {
    const isActive = profiles.activeTranscriptionProfileId === p.id;
    const isFallback = profiles.fallbackTranscriptionProfileId === p.id;
    const testKey = `transcription:${p.id}`;
    const testState = testStates[testKey];

    return (
      <div key={p.id} className={`profile-card ${isActive ? 'active' : ''}`}>
        <div className="card-header">
          <span className="card-name">{p.name}</span>
          <div className="card-badges">
            {isActive && <span className="badge badge-active">当前</span>}
            {isFallback && <span className="badge badge-fallback">备用</span>}
            {!p.enabled && <span className="badge badge-disabled">已禁用</span>}
            {p.builtIn && <span className="badge badge-built-in">预设</span>}
          </div>
        </div>
        <div className="card-details">
          <span className="card-provider">{p.provider}</span>
          <span className="card-model">{p.model}</span>
          <span className={`card-credential-status ${credentialStates[p.id] ? 'credential-ready' : 'credential-missing'}`}>
            {credentialErrors[p.id]
              ? `凭据: ${credentialErrors[p.id]}`
              : credentialStates[p.id]
                ? '凭据已配置'
                : '凭据未配置'}
          </span>
        </div>
        <div className="card-actions">
          <button
            className="card-btn test-btn"
            onClick={() => handleTest('transcription', p.id)}
            disabled={testState === 'testing'}
            type="button"
          >
            {testConfirm?.profileType === 'transcription' && testConfirm?.profileId === p.id
              ? '确认测试（可能产生少量费用）'
              : testState === 'testing'
                ? '测试中...'
                : '测试'}
          </button>
          {!isActive && (
            <button
              className="card-btn active-btn"
              onClick={() => handleSetActive('transcription', p.id)}
              type="button"
            >
              设为当前
            </button>
          )}
          <button
            className="card-btn edit-btn"
            onClick={() => setEditing({ action: 'edit', profileId: p.id })}
            type="button"
          >
            编辑
          </button>
          <button
            className="card-btn delete-btn"
            onClick={() => handleDelete('transcription', p.id)}
            type="button"
          >
            {confirmDelete === p.id ? '确认删除' : '删除'}
          </button>
        </div>
        {testState && testState !== 'testing' && (
          <div
            className={`test-result ${(testState as ProfileTestResult).success ? 'success' : 'failure'}`}
          >
            {(testState as ProfileTestResult).message}
          </div>
        )}
        {isActive && !profiles.fallbackTranscriptionProfileId && (
          <div className="fallback-warning">未配置备用配置档。腾讯云额度耗尽时将无法自动切换。</div>
        )}
      </div>
    );
  };

  const renderSummaryCard = (p: SummaryProfile) => {
    const isActive = profiles.activeSummaryProfileId === p.id;
    const testKey = `summary:${p.id}`;
    const testState = testStates[testKey];

    return (
      <div key={p.id} className={`profile-card ${isActive ? 'active' : ''}`}>
        <div className="card-header">
          <span className="card-name">{p.name}</span>
          <div className="card-badges">
            {isActive && <span className="badge badge-active">当前</span>}
            {!p.enabled && <span className="badge badge-disabled">已禁用</span>}
            {p.builtIn && <span className="badge badge-built-in">预设</span>}
          </div>
        </div>
        <div className="card-details">
          <span className="card-provider">{p.provider}</span>
          <span className="card-model">{p.model}</span>
          <span className={`card-credential-status ${credentialStates[p.id] ? 'credential-ready' : 'credential-missing'}`}>
            {credentialErrors[p.id]
              ? `凭据: ${credentialErrors[p.id]}`
              : credentialStates[p.id]
                ? '凭据已配置'
                : '凭据未配置'}
          </span>
        </div>
        <div className="card-actions">
          <button
            className="card-btn test-btn"
            onClick={() => handleTest('summary', p.id)}
            disabled={testState === 'testing'}
            type="button"
          >
            {testConfirm?.profileType === 'summary' && testConfirm?.profileId === p.id
              ? '确认测试（可能产生少量费用）'
              : testState === 'testing'
                ? '测试中...'
                : '测试'}
          </button>
          {!isActive && (
            <button
              className="card-btn active-btn"
              onClick={() => handleSetActive('summary', p.id)}
              type="button"
            >
              设为当前
            </button>
          )}
          <button
            className="card-btn edit-btn"
            onClick={() => setEditing({ action: 'edit', profileId: p.id })}
            type="button"
          >
            编辑
          </button>
          <button
            className="card-btn delete-btn"
            onClick={() => handleDelete('summary', p.id)}
            type="button"
          >
            {confirmDelete === p.id ? '确认删除' : '删除'}
          </button>
        </div>
        {testState && testState !== 'testing' && (
          <div
            className={`test-result ${(testState as ProfileTestResult).success ? 'success' : 'failure'}`}
          >
            {(testState as ProfileTestResult).message}
          </div>
        )}
      </div>
    );
  };

  if (isEditing) {
    // Find the profile being edited
    let existingProfile: TranscriptionProfile | SummaryProfile | undefined;
    if (editing.profileId) {
      existingProfile =
        tab === 'transcription'
          ? transcriptionProfiles.find((p) => p.id === editing.profileId)
          : summaryProfiles.find((p) => p.id === editing.profileId);
    }

    return (
      <ProviderEditorDialog
        profileType={tab}
        initialState={editing.action}
        existingProfile={existingProfile}
        onSaved={() => {
          setEditing(null);
          onProfilesChanged();
        }}
        onCancel={() => setEditing(null)}
      />
    );
  }

  return (
    <div className="profile-manager">
      {/* Fallback selector for transcription tab */}
      {tab === 'transcription' && (
        <div className="fallback-selector">
          <span className="fallback-selector-label">备用转写配置（额度不足时自动切换）</span>
          <StyledSelect
            label="备用转写配置（额度不足时自动切换）"
            value={profiles.fallbackTranscriptionProfileId ?? ''}
            placeholder="不使用备用"
            options={[
              { value: '', label: '不使用备用' },
              ...transcriptionProfiles
                .filter(
                  (profile) =>
                    profile.enabled &&
                    profile.id !== profiles.activeTranscriptionProfileId &&
                    profile.provider !== 'tencent_flash' &&
                    credentialStates[profile.id],
                )
                .map((profile) => ({ value: profile.id, label: profile.name, description: profile.model })),
            ]}
            onChange={(value) => {
              setFallbackError(null);
              handleSetFallback(value || null).catch((e: unknown) => {
                setFallbackError((e as { message?: string })?.message ?? '设置备用配置失败');
              });
            }}
          />
          {fallbackError && (
            <div className="fallback-error" role="alert">
              {fallbackError}
            </div>
          )}
        </div>
      )}

      {deleteError && (
        <div className="delete-error" role="alert">
          {deleteError}
        </div>
      )}

      {activeError && (
        <div className="active-error" role="alert">
          {activeError}
        </div>
      )}

      <div className="profile-list">
        {tab === 'transcription'
          ? transcriptionProfiles.map(renderTranscriptionCard)
          : summaryProfiles.map(renderSummaryCard)}
      </div>

      <div className="manager-footer">
        <button
          className="add-btn"
          onClick={() => setEditing({ action: 'create' })}
          type="button"
        >
          {tab === 'transcription' ? '新增转写服务' : '新增 AI 服务'}
        </button>
      </div>
    </div>
  );
}
