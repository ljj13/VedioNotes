import { useState, useEffect, useCallback, useRef, useReducer } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { openPath } from '@tauri-apps/plugin-opener';
import type { AppError, AppPreferences, AppProfiles, Distillation, DistillationResult, HistoryEntry, InputSource, LocalModelStatus, ProviderFallbackEvent, SenseVoiceStatus, TaskOptions, TaskProgress, TaskRetryRequest } from './lib/types';
import {
  invokeStartDistillation,
  cancelDistillation,
  onTaskProgress,
  onTaskComplete,
  onTaskError,
  onProviderFallback,
  getProfiles,
  hasProfileCredential,
  getMigrationState,
  listHistory,
  listLocalModels,
  getDiagnosticLogPath,
  setActiveProfile,
  getPreferences,
  getSenseVoiceStatus,
  setTranscriptionPreferences,
} from './lib/bridge';
import InputPanel from './components/InputPanel';
import ProfileSelectors from './components/ProfileSelectors';
import FallbackNotice from './components/FallbackNotice';
import MigrationNotice from './components/MigrationNotice';
import WorkbenchShell from './components/WorkbenchShell';
import SettingsEntry from './features/settings/SettingsEntry';
import CreateWorkspace from './components/CreateWorkspace';
import HomeWorkspace from './components/HomeWorkspace';
import ProgressWorkspace, { BackgroundTaskPill } from './components/ProgressWorkspace';
import ResultWorkspace from './components/ResultWorkspace';
import LibraryWorkspace from './components/LibraryWorkspace';
import QaWorkspace from './components/QaWorkspace';
import TaskHistoryWorkspace from './components/TaskHistoryWorkspace';
import ErrorPanel from './components/ErrorPanel';
import { initialWorkbenchNavigationState, workbenchNavigationReducer } from './lib/workbenchNavigation';
import type { PrimaryWorkbenchView, SettingsSection } from './lib/workbenchNavigation';
import './styles/app.css';
import './styles/settings-ciphertalk.css';

type AppView = 'idle' | 'running' | 'success' | 'error';

function App() {
  const [view, setView] = useState<AppView>('idle');
  const [navigation, dispatchNavigation] = useReducer(workbenchNavigationReducer, initialWorkbenchNavigationState);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const stored = window.localStorage.getItem('video-distiller-theme');
    return stored === 'light' ? 'light' : 'dark';
  });
  const [progress, setProgress] = useState<TaskProgress | null>(null);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [taskStartedAtMs, setTaskStartedAtMs] = useState<number | null>(null);
  const [activeTaskSourceLabel, setActiveTaskSourceLabel] = useState('等待任务来源');
  const [activeTaskServices, setActiveTaskServices] = useState({ transcription: '等待转写服务', summary: '等待总结服务' });
  const [distillation, setDistillation] = useState<Distillation | null>(null);
  const [savedPath, setSavedPath] = useState<string | null>(null);
  const [error, setError] = useState<AppError | null>(null);
  const [profiles, setProfiles] = useState<AppProfiles | null>(null);
  const [preferences, setPreferences] = useState<AppPreferences>({
    schemaVersion: 1,
    markdownOutputDir: null,
    localComputeMode: 'auto',
    appearance: { theme: 'system', compactDensity: false, reducedMotion: false },
    export: { format: 'markdown', includeScreenshots: true, includeSubtitles: true, includeSourceMetadata: true, includeDiagnosticLog: false },
    logLevel: 'info',
  });
  const [senseVoiceStatus, setSenseVoiceStatus] = useState<SenseVoiceStatus | null>(null);
  const [localModels, setLocalModels] = useState<LocalModelStatus[]>([]);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [fallbackEvent, setFallbackEvent] = useState<ProviderFallbackEvent | null>(null);
  const fallbackEventRef = useRef<ProviderFallbackEvent | null>(null);
  const [credentialReadiness, setCredentialReadiness] = useState<Record<string, boolean>>({});
  const [migrationRequired, setMigrationRequired] = useState<boolean | null>(null);
  const [migrationChecking, setMigrationChecking] = useState(true);
  const [historyOverview, setHistoryOverview] = useState<HistoryEntry[]>([]);
  const [libraryInitialId, setLibraryInitialId] = useState<number | null>(null);
  const [retryDraft, setRetryDraft] = useState<TaskRetryRequest | null>(null);
  const unlisteners = useRef<Array<() => void>>([]);
  const taskRunning = useRef(false);
  const taskBackgrounded = useRef(false);

  const reloadProfiles = useCallback(() => {
    Promise.all([getProfiles(), listLocalModels().catch(() => [])])
      .then(([nextProfiles, models]) => { setProfiles(nextProfiles); setLocalModels(Array.isArray(models) ? models : []); })
      .catch((e: AppError) => setProfileError(e.message ?? '配置档加载失败'));
  }, []);

  const reloadTranscriptionPreferences = useCallback(() => {
    const preferencesRequest = typeof getPreferences === 'function'
      ? getPreferences()
      : Promise.resolve(null);
    const senseVoiceRequest = typeof getSenseVoiceStatus === 'function'
      ? getSenseVoiceStatus().catch(() => null)
      : Promise.resolve(null);
    Promise.all([preferencesRequest, senseVoiceRequest])
      .then(([nextPreferences, nextSenseVoiceStatus]) => {
        setPreferences(nextPreferences && typeof nextPreferences.schemaVersion === 'number'
          ? nextPreferences
          : defaultPreferences());
        if (nextSenseVoiceStatus && Array.isArray(nextSenseVoiceStatus.models)) setSenseVoiceStatus(nextSenseVoiceStatus);
      })
      .catch(() => setPreferences(defaultPreferences()));
  }, []);

  const reloadHistoryOverview = useCallback(() => {
    listHistory()
      .then((entries) => setHistoryOverview(Array.isArray(entries) ? entries : []))
      .catch(() => setHistoryOverview([]));
  }, []);

  // Check migration state on startup
  useEffect(() => {
    getMigrationState()
      .then((required) => {
        setMigrationRequired(required);
        setMigrationChecking(false);
      })
      .catch(() => {
        setMigrationRequired(false);
        setMigrationChecking(false);
      });
  }, []);

  // Check credential readiness for the current active profiles
  const checkActiveCredentials = useCallback((p: AppProfiles) => {
    const checks: Promise<void>[] = [];
    if (p.activeTranscriptionProfileId) {
      const active = p.transcriptionProfiles.find((profile) => profile.id === p.activeTranscriptionProfileId);
      if (active?.provider === 'local_whisper_cpp') {
        setCredentialReadiness((prev) => ({ ...prev, activeTranscription: localModels.some((model) => model.id === active.model && model.state === 'ready') }));
      } else {
      checks.push(
        hasProfileCredential('transcription', p.activeTranscriptionProfileId)
          .then((ready) => setCredentialReadiness((prev) => ({ ...prev, activeTranscription: ready })))
          .catch(() => setCredentialReadiness((prev) => ({ ...prev, activeTranscription: false }))),
      );
      }
    } else {
      setCredentialReadiness((prev) => ({ ...prev, activeTranscription: false }));
    }
    if (p.activeSummaryProfileId) {
      checks.push(
        hasProfileCredential('summary', p.activeSummaryProfileId)
          .then((ready) => setCredentialReadiness((prev) => ({ ...prev, activeSummary: ready })))
          .catch(() => setCredentialReadiness((prev) => ({ ...prev, activeSummary: false }))),
      );
    } else {
      setCredentialReadiness((prev) => ({ ...prev, activeSummary: false }));
    }
    return Promise.all(checks);
  }, [localModels]);

  useEffect(() => {
    reloadProfiles();
    reloadTranscriptionPreferences();
    reloadHistoryOverview();
    return () => {
      unlisteners.current.forEach((fn) => fn());
    };
  }, [reloadProfiles, reloadHistoryOverview, reloadTranscriptionPreferences]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem('video-distiller-theme', theme);
  }, [theme]);

  useEffect(() => {
    const appearance = preferences.appearance ?? { theme: 'system', compactDensity: false, reducedMotion: false };
    document.documentElement.dataset.density = appearance.compactDensity ? 'compact' : 'comfortable';
    document.documentElement.dataset.reducedMotion = appearance.reducedMotion ? 'true' : 'false';
    const media = typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-color-scheme: dark)')
      : null;
    const applyTheme = () => setTheme(appearance.theme === 'system' ? (media?.matches === false ? 'light' : 'dark') : appearance.theme);
    applyTheme();
    if (appearance.theme !== 'system' || !media) return;
    media.addEventListener?.('change', applyTheme);
    return () => media.removeEventListener?.('change', applyTheme);
  }, [preferences.appearance]);

  const handleThemeToggle = useCallback(() => {
    setTheme((current) => current === 'dark' ? 'light' : 'dark');
  }, []);

  const handleNavigate = useCallback((nextView: PrimaryWorkbenchView) => {
    if (nextView === 'create' && taskRunning.current) {
      taskBackgrounded.current = false;
      dispatchNavigation({ type: 'open-view', view: 'progress' });
      return;
    }
    if (nextView === 'create' && view !== 'idle') {
      setView('idle');
      setProgress(null);
      setTaskId(null);
      setTaskStartedAtMs(null);
      setDistillation(null);
      setSavedPath(null);
      setError(null);
      taskBackgrounded.current = false;
    }
    dispatchNavigation({ type: 'open-view', view: nextView });
    if (nextView !== 'library') setLibraryInitialId(null);
  }, [view]);

  const handleOpenSettings = useCallback((section: SettingsSection = 'transcription') => {
    dispatchNavigation({ type: 'open-settings', section });
  }, []);

  const handleCloseSettings = useCallback(() => {
    dispatchNavigation({ type: 'return-from-settings' });
  }, []);


  // Check credential readiness whenever profiles change (new active IDs, etc.)
  useEffect(() => {
    if (profiles) {
      checkActiveCredentials(profiles);
    }
  }, [profiles, checkActiveCredentials, localModels]);

  const handleStart = useCallback(async (source: InputSource, options: TaskOptions) => {
    setRetryDraft(null);
    setView('running');
    setProgress(null);
    setTaskStartedAtMs(null);
    setDistillation(null);
    setSavedPath(null);
    setError(null);
    setFallbackEvent(null);
    fallbackEventRef.current = null;
    taskBackgrounded.current = false;

    // 0. Resolve profile IDs — fail fast if no profiles loaded yet
    if (!profiles || !preferences) {
      setError({
        code: 'profiles_unavailable',
        message: '配置档尚未加载，请稍后重试。',
        recovery: '请检查配置文件状态后重试。',
      });
      setView('error');
      return;
    }
    const inferredMode = profiles.transcriptionProfiles.some((profile) => profile.id === profiles.activeTranscriptionProfileId && profile.provider === 'local_whisper_cpp')
      ? 'whisper_local'
      : 'online_profile';
    const transcriptionMode = options.transcription_mode ?? preferences.transcriptionMode ?? inferredMode;
    const normalizedOptions: TaskOptions = {
      ...options,
      transcription_mode: transcriptionMode,
      sensevoice_model: options.sensevoice_model ?? senseVoiceStatus?.selectedModel ?? preferences.sensevoiceModel ?? 'int8',
      sensevoice_languages: options.sensevoice_languages ?? preferences.sensevoiceLanguages ?? ['zh'],
    };
    const localProfile = profiles.transcriptionProfiles.find((profile) => profile.provider === 'local_whisper_cpp' && profile.enabled);
    const activeOnlineProfile = profiles.transcriptionProfiles.find((profile) => profile.id === profiles.activeTranscriptionProfileId && profile.provider !== 'local_whisper_cpp' && profile.enabled);
    const transProfileId = transcriptionMode === 'sensevoice_cpu'
      ? 'sensevoice-cpu'
      : transcriptionMode === 'whisper_local'
        ? localProfile?.id ?? null
        : activeOnlineProfile?.id ?? profiles.activeTranscriptionProfileId ?? null;
    const summProfileId = profiles.activeSummaryProfileId;
    if (!transProfileId || !summProfileId) {
      setError({
        code: 'profile_not_configured',
        message: transcriptionMode === 'sensevoice_cpu' ? '请先启用总结配置档。' : '请先在设置中启用当前模式需要的转写和总结配置档。',
        recovery: '请在语音转文字和 AI 接入设置中完成配置。',
      });
      setView('error');
      return;
    }

    // 1. Generate taskId in React — NO await needed, it's sync.
    const id = uuidv4();
    setTaskId(id);
    const transcription = profiles.transcriptionProfiles.find((profile) => profile.id === transProfileId);
    const summary = profiles.summaryProfiles.find((profile) => profile.id === summProfileId);
    setActiveTaskSourceLabel(inputSourceLabel(source));
    setActiveTaskServices({
      transcription: transcriptionMode === 'sensevoice_cpu'
        ? `SenseVoice CPU · ${normalizedOptions.sensevoice_model}`
        : transcription ? `${transcription.name} · ${transcription.model || '默认模型'}` : '当前转写服务',
      summary: summary ? `${summary.name} · ${summary.model || '默认模型'}` : '当前总结服务',
    });

    // 2. Register ALL FOUR listeners BEFORE invoking the backend.
    try {
      const [un1, un2, un3, un4] = await Promise.all([
        onTaskProgress(id, (p) => { if (taskRunning.current) setProgress(p); }),
        onTaskComplete(id, (result: DistillationResult) => {
          if (!taskRunning.current) return;
          setDistillation(result.distillation);
          setSavedPath(result.saved_path);
          setView('success');
          taskRunning.current = false;
          if (!taskBackgrounded.current) dispatchNavigation({ type: 'open-view', view: 'result' });
          setFallbackEvent(null);
          fallbackEventRef.current = null;
          // Refresh profiles on completion so a persisted fallback switch
          // updates the active selector
          getProfiles()
            .then(setProfiles)
            .catch(() => {});
          reloadHistoryOverview();
        }),
        onTaskError(id, (err: AppError) => {
          if (!taskRunning.current) return;
          setError(err);
          setView('error');
          taskRunning.current = false;
        }),
        onProviderFallback(id, (event) => {
          if (!taskRunning.current) return;
          setFallbackEvent(event);
          fallbackEventRef.current = event;
          // Keep the fallback notice immediate and non-blocking.
          // Profile refresh happens on task completion (below) to ensure
          // the persisted switch is visible.
        }),
      ]);
      unlisteners.current = [un1, un2, un3, un4];
    } catch {
      // If listener registration itself fails, the backend won't be called.
      setView('idle');
      dispatchNavigation({ type: 'open-view', view: 'create' });
      return;
    }

    // 3. Now invoke the backend with the pre-registered taskId and profile IDs.
    setTaskStartedAtMs(Date.now());
    taskRunning.current = true;
    dispatchNavigation({ type: 'open-view', view: 'progress' });
    try {
      await invokeStartDistillation(id, source, transProfileId, summProfileId, normalizedOptions);
    } catch (e: unknown) {
      // The backend command threw synchronously (e.g. missing API key).
      const err = e as AppError;
      setError(err);
      setView('error');
      taskRunning.current = false;
    }
  }, [preferences, profiles, reloadHistoryOverview, senseVoiceStatus]);

  const handleCancel = useCallback(async () => {
    // Invalidate callbacks synchronously: Tauri events can race a pending
    // cancellation command, and must never restore a cancelled task view.
    taskRunning.current = false;
    unlisteners.current.forEach((fn) => fn());
    unlisteners.current = [];
    if (taskId) {
      await cancelDistillation(taskId).catch(() => {});
    }
    setView('idle');
    setProgress(null);
    setTaskId(null);
    setTaskStartedAtMs(null);
    taskBackgrounded.current = false;
    dispatchNavigation({ type: 'open-view', view: 'create' });
  }, [taskId]);

  const handleRetry = useCallback(() => {
    unlisteners.current.forEach((fn) => fn());
    unlisteners.current = [];
    taskRunning.current = false;
    setView('idle');
    setError(null);
    setProgress(null);
    setTaskId(null);
    setTaskStartedAtMs(null);
    setFallbackEvent(null);
    fallbackEventRef.current = null;
    taskBackgrounded.current = false;
    dispatchNavigation({ type: 'open-view', view: 'create' });
  }, []);

  const handleOpenDiagnosticLog = useCallback(async () => {
    const path = await getDiagnosticLogPath();
    await openPath(path);
  }, []);

  const handleDismissFallback = useCallback(() => {
    setFallbackEvent(null);
    fallbackEventRef.current = null;
  }, []);

  const handleOpenSettingsFromFallback = useCallback(() => {
    handleOpenSettings();
  }, [handleOpenSettings]);

  const handleMigrationComplete = useCallback(() => {
    setMigrationRequired(false);
    reloadProfiles();
  }, [reloadProfiles]);

  const handleTaskRetry = useCallback(async (request: TaskRetryRequest) => {
    if (request.options.transcription_mode && request.options.sensevoice_languages?.length) {
      const saved = await setTranscriptionPreferences(
        request.options.transcription_mode,
        request.options.sensevoice_languages,
      );
      setPreferences(saved);
    }
    if (request.options.transcription_mode !== 'sensevoice_cpu') {
      await setActiveProfile('transcription', request.transcriptionProfileId);
    }
    await setActiveProfile('summary', request.summaryProfileId);
    setRetryDraft(request);
    setView('idle');
    setError(null);
    setProgress(null);
    setTaskId(null);
    setTaskStartedAtMs(null);
    taskBackgrounded.current = false;
    dispatchNavigation({ type: 'open-view', view: 'create' });
    reloadProfiles();
  }, [reloadProfiles]);

  const handleOpenTaskNote = useCallback((noteId: number) => {
    setLibraryInitialId(noteId);
    dispatchNavigation({ type: 'open-view', view: 'library' });
  }, []);

  const activeTranscriptionProfile = profiles?.transcriptionProfiles.find((profile) => profile.id === profiles.activeTranscriptionProfileId);
  const localTranscriptionProfile = profiles?.transcriptionProfiles.find((profile) => profile.provider === 'local_whisper_cpp' && profile.enabled);
  const localWhisperReady = Boolean(localTranscriptionProfile && localModels.some((model) => model.id === localTranscriptionProfile.model && model.state === 'ready'));
  const transcriptionMode = preferences?.transcriptionMode
    ?? (activeTranscriptionProfile?.provider === 'local_whisper_cpp' ? 'whisper_local' : 'online_profile');
  const transcriptionReady = transcriptionMode === 'sensevoice_cpu'
    ? senseVoiceStatus?.state === 'ready'
    : transcriptionMode === 'whisper_local'
      ? localWhisperReady
      : Boolean(activeTranscriptionProfile?.provider !== 'local_whisper_cpp' && credentialReadiness.activeTranscription)
        || Boolean(!activeTranscriptionProfile && profiles?.activeTranscriptionProfileId && credentialReadiness.activeTranscription);
  const serviceReady = Boolean(transcriptionReady && credentialReadiness.activeSummary);
  const serviceDetail = transcriptionMode === 'sensevoice_cpu'
    ? `SenseVoice CPU · ${senseVoiceStatus?.selectedModel ?? preferences?.sensevoiceModel ?? 'int8'}${transcriptionReady ? ' 就绪' : ' 未安装'}`
    : transcriptionMode === 'whisper_local'
      ? `本地 Whisper · ${localTranscriptionProfile?.model ?? '未选择模型'}${transcriptionReady ? ' 就绪' : ' 未就绪'}`
      : activeTranscriptionProfile
        ? `${activeTranscriptionProfile.name} · ${activeTranscriptionProfile.model || '默认模型'}${serviceReady ? ' 就绪' : ''}`
        : (profiles ? '尚未选择在线转写服务' : '正在检查服务');
  const readyLocalModelCount = localModels.filter((model) => model.state === 'ready').length;

  return (
    <WorkbenchShell
      navigation={navigation}
      onNavigate={handleNavigate}
      onOpenSettings={handleOpenSettings}
      onToggleSidebar={() => dispatchNavigation({ type: 'toggle-sidebar' })}
      serviceStatus={{ ready: serviceReady, detail: serviceDetail }}
      theme={theme}
    >
      {navigation.view === 'home' && (
        <HomeWorkspace
          noteCount={historyOverview.length}
          readyLocalModelCount={readyLocalModelCount}
          recentNotes={historyOverview}
          serviceReady={serviceReady}
          serviceDetail={serviceDetail}
          onCreate={() => handleNavigate('create')}
          onOpenLibrary={() => handleNavigate('library')}
          onOpenTasks={() => handleNavigate('tasks')}
        />
      )}
      {navigation.view === 'settings' && preferences && (
        <SettingsEntry
          section={navigation.settingsSection}
          profiles={profiles ?? { schemaVersion: 1, activeTranscriptionProfileId: null, activeSummaryProfileId: null, fallbackTranscriptionProfileId: null, migrationRequired: false, transcriptionProfiles: [], summaryProfiles: [] }}
          localModels={localModels}
          preferences={preferences}
          theme={theme}
          sidebarCollapsed={navigation.sidebarCollapsed}
          onSelectSection={(section) => dispatchNavigation({ type: 'select-settings-section', section })}
          onReturn={handleCloseSettings}
          onProfilesChanged={reloadProfiles}
          onModelsChanged={reloadProfiles}
          onPreferencesChanged={setPreferences}
          onSenseVoiceStatusChanged={setSenseVoiceStatus}
          onToggleTheme={handleThemeToggle}
          onToggleSidebar={() => dispatchNavigation({ type: 'toggle-sidebar' })}
        />
      )}
      {navigation.view === 'library' && (
        <LibraryWorkspace initialSelectedId={libraryInitialId} />
      )}
      {navigation.view === 'qa' && <QaWorkspace />}
      {navigation.view === 'tasks' && <TaskHistoryWorkspace onRetry={handleTaskRetry} onOpenNote={handleOpenTaskNote} onOpenLog={handleOpenDiagnosticLog} />}
      {navigation.view === 'create' && (view === 'idle' || (view === 'error' && taskStartedAtMs === null)) && (
        <CreateWorkspace view={view} progress={progress} services={profiles ? <ProfileSelectors profiles={profiles} disabled={false} onProfileChanged={reloadProfiles} localModels={localModels} /> : null}>
          {!migrationChecking && migrationRequired && <MigrationNotice onOpenSettings={handleOpenSettings} onMigrationComplete={handleMigrationComplete} />}
          {view === 'idle' && (
            <>
              {profileError && <div className="warning-banner" role="alert">配置档加载失败: {profileError}</div>}
              {preferences && <InputPanel
                initialDraft={retryDraft}
                onStart={handleStart}
                onOpenSettings={handleOpenSettings}
                disabled={false}
                readyToStart={serviceReady}
                localModelUnready={transcriptionMode === 'whisper_local' && !localWhisperReady}
                senseVoiceUnready={transcriptionMode === 'sensevoice_cpu' && senseVoiceStatus?.state !== 'ready'}
                transcriptionCredentialUnready={transcriptionMode === 'online_profile' && credentialReadiness.activeTranscription === false}
                summaryCredentialUnready={credentialReadiness.activeSummary === false}
                transcriptionMode={transcriptionMode}
                senseVoiceModel={senseVoiceStatus?.selectedModel ?? preferences.sensevoiceModel ?? 'int8'}
                senseVoiceLanguages={preferences.sensevoiceLanguages ?? ['zh']}
              />}
            </>
          )}
          {view === 'error' && error && <ErrorPanel error={error} onRetry={handleRetry} onOpenLog={handleOpenDiagnosticLog} />}
        </CreateWorkspace>
      )}
      {navigation.view === 'progress' && taskStartedAtMs !== null && (
        <ProgressWorkspace
          progress={progress}
          startedAtMs={taskStartedAtMs}
          sourceLabel={activeTaskSourceLabel}
          serviceDetail={`${activeTaskServices.transcription} / ${activeTaskServices.summary}`}
          onCancel={handleCancel}
          onBackground={() => { taskBackgrounded.current = true; handleNavigate('home'); }}
          onOpenLog={handleOpenDiagnosticLog}
          errorContent={view === 'error' && error ? <ErrorPanel error={error} onRetry={handleRetry} onOpenLog={handleOpenDiagnosticLog} /> : undefined}
        />
      )}
      {navigation.view === 'result' && distillation && (
        <ResultWorkspace
          distillation={distillation}
          savedPath={savedPath}
          transcriptionService={activeTaskServices.transcription}
          summaryService={activeTaskServices.summary}
          onSavedPathChanged={setSavedPath}
          onOpenLibrary={() => handleNavigate('library')}
          onNewTask={handleRetry}
        />
      )}
      {fallbackEvent && <FallbackNotice event={fallbackEvent} onDismiss={handleDismissFallback} onOpenSettings={handleOpenSettingsFromFallback} />}
      {taskStartedAtMs !== null && view === 'running' && navigation.view !== 'progress' && (
        <BackgroundTaskPill
          progress={progress}
          startedAtMs={taskStartedAtMs}
          onOpen={() => { taskBackgrounded.current = false; dispatchNavigation({ type: 'open-view', view: 'progress' }); }}
        />
      )}
      {taskStartedAtMs !== null && view === 'success' && distillation && navigation.view !== 'result' && (
        <BackgroundTaskPill
          progress={{ stage: 'complete', message: '处理完成', percent: 100 }}
          startedAtMs={taskStartedAtMs}
          completed
          onOpen={() => { taskBackgrounded.current = false; dispatchNavigation({ type: 'open-view', view: 'result' }); }}
        />
      )}
    </WorkbenchShell>
  );
}

export default App;

function inputSourceLabel(source: InputSource) {
  if (source.kind === 'file') return source.path?.split(/[\\/]/).pop() || '本地媒体文件';
  if (source.kind === 'bilibili_url') return 'Bilibili 公开链接';
  if (source.kind === 'youtube_url') return 'YouTube 公开链接';
  return '抖音公开链接';
}

function defaultPreferences(): AppPreferences {
  return {
    schemaVersion: 1,
    markdownOutputDir: null,
    localComputeMode: 'auto',
    appearance: { theme: 'system', compactDensity: false, reducedMotion: false },
    export: { format: 'markdown', includeScreenshots: true, includeSubtitles: true, includeSourceMetadata: true, includeDiagnosticLog: false },
    logLevel: 'info',
  };
}
