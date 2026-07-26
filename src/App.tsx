/**
 * App.tsx — VedioNotes 应用的主组件（整个前端应用的"入口点"）
 *
 * ===== 文件级别 =====
 *   本文件属于"前端根组件层"。它是整个 React 应用的最顶层组件——
 *   所有其他组件都是它的子节点。main.tsx 中只有一行 `<App />`，
 *   那一行就把整个应用的 UI 交给了本文件。
 *
 *   调用链：main.tsx → App → WorkbenchShell → 各工作区组件
 *
 * ===== 核心职责 =====
 *   1. 管理全部"全局状态"——主题、当前页面、任务进度、错误等
 *   2. 注册 Rust 后端事件监听器（任务进度、完成、错误、服务商切换）
 *   3. 启动/取消"视频蒸馏"任务
 *   4. 在启动时从 Rust 加载 profiles 和 preferences
 *   5. 根据导航状态渲染对应的页面组件
 *
 * ===== C/C++ 开发者的视角 =====
 *   这个文件和你熟悉的"main 函数 + 全局变量"模式最大的不同：
 *
 *   C 中：
 *     int g_currentView = HOME;  // 全局变量，直接赋值
 *     void setView(int v) { g_currentView = v; }
 *
 *   React 中：
 *     const [view, setView] = useState('idle');  // 状态 + 更新函数
 *     // 你只能通过 setView() 修改 view——不能直接赋值 view = 'xxx'
 *     // 每次调用 setView() 都会触发整个 App 函数重新执行
 *
 *   useState 是 React 的"钩子"（Hook）——一个保存组件状态的机制。
 *   类比 C：如果把 App() 理解成循环被调用的函数，useState 就像
 *   一个"每次循环都记得上次值的静态变量"，但修改它时必须用配套的
 *   setter 函数，否则 React 不知道你改了，就不会重新渲染。
 *
 * ===== 执行流（从启动到显示） =====
 *   1. main.tsx 调用 ReactDOM.createRoot(...).render(<App />)
 *   2. App() 被 React 第一次调用
 *   3. 所有 useState 初始化（theme 从 localStorage 读，其余用默认值）
 *   4. useEffect（第一次渲染后执行）：
 *      - 调用 Rust 获取 profiles、preferences、SenseVoice 状态、本地模型列表
 *      - 注册四个事件监听器（进度、完成、错误、服务商切换）
 *   5. 返回 JSX → React 渲染 WorkbenchShell + 对应的页面组件
 *   6. 用户交互 → setXxx() 更新状态 → App() 被重新调用 → 渲染新 UI
 *
 * ===== 阅读顺序 =====
 *   1. 第 51-80 行：所有 useState 声明——理解全局有哪些状态变量
 *   2. 第 85-145 行：useEffect 启动逻辑——理解应用初始化流程
 *   3. 第 147-175 行：startTask 函数——理解任务启动的完整流程
 *   4. 第 250-320 行：return JSX——理解整体布局结构
 */

import { useState, useEffect, useCallback, useRef, useReducer } from 'react';
// useState：声明一个"状态变量"，返回 [当前值, 更新函数]
// useEffect：在渲染后执行"副作用"（如数据获取、事件注册）
// useCallback：缓存一个函数引用（避免每次渲染都创建新函数）
// useRef：持有一个"贯穿渲染周期的可变引用"
// useReducer：复杂状态的状态机（类似 Redux）

import { v4 as uuidv4 } from 'uuid';
// uuidv4()：生成随机的唯一 ID 字符串

import { openPath } from '@tauri-apps/plugin-opener';
// 调用系统的默认程序打开文件/文件夹（类似 C 中调用 ShellExecute）

import type { AppError, AppPreferences, AppProfiles, Distillation, DistillationResult, HistoryEntry, InputSource, LocalModelStatus, ProviderFallbackEvent, SenseVoiceStatus, TaskOptions, TaskProgress, TaskRetryRequest } from './lib/types';

import {
  invokeStartDistillation,   // 向 Rust 发起"开始蒸馏"命令
  cancelDistillation,        // 取消正在运行的任务
  onTaskProgress,            // 注册任务进度事件监听
  onTaskComplete,            // 注册任务完成事件监听
  onTaskError,               // 注册任务错误事件监听
  onProviderFallback,        // 注册服务商切换事件监听
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

// 导入各页面/功能组件（每个都是独立的 React 函数组件）
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

// 导入导航状态机
import { initialWorkbenchNavigationState, workbenchNavigationReducer } from './lib/workbenchNavigation';
import type { PrimaryWorkbenchView, SettingsSection } from './lib/workbenchNavigation';

import './styles/app.css';
import './styles/concept-workbench.css';

/**
 * AppView：应用所处的"全局阶段"——不是"哪个页面"，而是业务层面的状态。
 *   idle    → 待启动（还没有任务在跑）
 *   running → 任务正在运行中
 *   success → 任务已成功完成
 *   error   → 任务出错了
 */
type AppView = 'idle' | 'running' | 'success' | 'error';

/** App */
function App() {
  // ==========================================================
  // 第一部分：全局状态声明（约 20 个 useState / useReducer）
  //
  // 在 React 中，所有会变化的 UI 数据都必须放在 state 中。
  // 原因：React 只有检测到 state 变化时才会重新渲染。
  //
  // const [变量, 更新函数] = useState(初始值);
  //   类比 C：int x = 0; void setX(int v) { x = v; rerender(); }
  //   但 useState 把"值"和"更新方法"绑在一起返回。
  //
  // useReducer：用于复杂状态的状态机（类似 switch-case 模式），
  //   本文件中导航状态用它（见 workbenchNavigation.ts 的 reducer 函数）。
  // ==========================================================

  // view：当前业务阶段（不是页面，是业务状态）
  const [view, setView] = useState<AppView>('idle');

  // navigation：导航状态（当前页面 + 设置子页面 + 返回目标 + 侧栏折叠）
  // dispatchNavigation 是"发出操作"的函数——类似 C 中向状态机发送事件。
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

/** inputSourceLabel */
function inputSourceLabel(source: InputSource) {
  if (source.kind === 'file') return source.path?.split(/[\\/]/).pop() || '本地媒体文件';
  if (source.kind === 'bilibili_url') return 'Bilibili 公开链接';
  if (source.kind === 'youtube_url') return 'YouTube 公开链接';
  return '抖音公开链接';
}

/** defaultPreferences */
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
