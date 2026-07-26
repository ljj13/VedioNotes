/** App.test 测试 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../../src/App';

const nativeMediaMocks = vi.hoisted(() => ({
  open: vi.fn(),
  save: vi.fn(),
  onDragDropEvent: vi.fn(),
  unlisten: vi.fn(),
  handler: null as null | ((event: { payload: { type: string; paths?: string[] } }) => void),
}));

const historyMocks = vi.hoisted(() => ({
  entries: [] as Array<Record<string, unknown>>,
  getMarkdown: vi.fn(),
}));

vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: nativeMediaMocks.open,
  save: nativeMediaMocks.save,
}));

vi.mock('@tauri-apps/api/webview', () => ({
  getCurrentWebview: () => ({
    onDragDropEvent: nativeMediaMocks.onDragDropEvent.mockImplementation(
      (handler: typeof nativeMediaMocks.handler) => {
        nativeMediaMocks.handler = handler;
        return Promise.resolve(nativeMediaMocks.unlisten);
      },
    ),
  }),
}));

const MOCK_DISTILLATION = {
  core_conclusion: '这是视频的核心结论',
  key_evidence: [
    { text: '关键依据一' },
    { text: '关键依据二', timestamp_seconds: 30 },
    { text: '关键依据三', screenshot_path: 'screenshots/three.png' },
  ],
  implications: ['采取行动一', '注意边界条件'],
};

const MOCK_RESULT = {
  task_id: 'mock-task-123',
  distillation: MOCK_DISTILLATION,
  saved_path: 'C:\\Users\\test\\Videos\\video-distiller\\video-核心提炼.md',
};

const MOCK_PROFILES = {
  schemaVersion: 1,
  activeTranscriptionProfileId: 'tencent-flash',
  activeSummaryProfileId: 'deepseek-main',
  fallbackTranscriptionProfileId: null,
  transcriptionProfiles: [
    { id: 'tencent-flash', name: '腾讯云极速版', provider: 'tencent_flash', baseUrl: 'https://asr.cloud.tencent.com', model: '16k_zh', enabled: true, builtIn: true },
    { id: 'mimo-asr', name: 'MiMo ASR', provider: 'mimo_asr', baseUrl: 'https://api.xiaomimimo.com', model: 'mimo-v2.5-asr', enabled: true, builtIn: true },
  ],
  summaryProfiles: [
    { id: 'deepseek-main', name: 'DeepSeek', provider: 'deep_seek', baseUrl: 'https://api.deepseek.com', model: 'deepseek-chat', enabled: true, builtIn: true },
  ],
};

const MOCK_HISTORY = {
  id: 7,
  title: '测试历史笔记',
  source: 'https://video.example/watch',
  noteTemplate: 'core_distillation',
  noteStyle: 'minimal',
  createdAt: '2026-07-14 10:00',
  markdownPath: 'C:\\app-data\\history-assets\\7\\note.md',
  transcriptPath: 'C:\\app-data\\history-assets\\7\\transcript.txt',
  thumbnailPath: null,
  screenshotPaths: [],
};

type ListenerEntry = { event: string; handler: (payload: unknown) => void };
let registeredListeners: ListenerEntry[] = [];
let capturedTaskId: string | null = null;

vi.mock('uuid', () => ({
  v4: () => 'uuid-from-mock-789',
}));

// SettingsEntry uses React.lazy() + Suspense to load CipherSettingsShell, but
// vitest's threads pool + jsdom has a timing issue with multi-layer lazy
// imports.  Mock SettingsEntry to synchronously import CipherSettingsShell
// (bypassing lazy()) so the real CipherSettingsShell renders in App tests.
// The cipher DOM is still tested end-to-end; only the async lazy() boundary
// is removed for the test environment.
vi.mock('../../src/features/settings/SettingsEntry', async () => {
  const mod = await import('../../src/features/settings/CipherSettingsShell');
  return { default: mod.default };
});

vi.mock('@tauri-apps/api/core', () => {
  const spy = vi.fn().mockImplementation((cmd: string, args?: Record<string, unknown>) => {
    if (cmd === 'get_profiles') return Promise.resolve(MOCK_PROFILES);
    if (cmd === 'has_profile_credential') return Promise.resolve(true);
    if (cmd === 'set_active_profile') return Promise.resolve(MOCK_PROFILES);
    if (cmd === 'get_preferences') return Promise.resolve({
      schemaVersion: 1,
      markdownOutputDir: null,
      appearance: { theme: 'system', compactDensity: false, reducedMotion: false },
      export: { format: 'markdown', includeScreenshots: true, includeSubtitles: true, includeSourceMetadata: true, includeDiagnosticLog: false },
      logLevel: 'info',
    });
    if (cmd === 'get_export_preferences') return Promise.resolve({ format: 'markdown', includeScreenshots: true, includeSubtitles: true, includeSourceMetadata: true, includeDiagnosticLog: false });
    if (cmd === 'save_export_preferences') return Promise.resolve({ format: 'markdown', includeScreenshots: true, includeSubtitles: true, includeSourceMetadata: true, includeDiagnosticLog: false });
    if (cmd === 'open_export_directory') return Promise.resolve(undefined);
    if (cmd === 'get_cache_usage') return Promise.resolve({ totalBytes: 0, categories: [] });
    if (cmd === 'list_logs') return Promise.resolve([]);
    if (cmd === 'get_sense_voice_status') return Promise.resolve({ state: 'missing', selectedModel: 'int8', runtimeReady: false, tokensReady: false, modelPath: null, models: [], downloadedBytes: 0, totalBytes: 0 });
    if (cmd === 'get_summary_provider_catalog') return Promise.resolve([]);
    if (cmd === 'get_about_snapshot') return Promise.resolve({ appVersion: '0.0.1', tauriVersion: '2', frontendVersion: '19', rustVersion: '1.91', appDataDir: 'C:\\data', exportDir: 'C:\\export', logDir: 'C:\\logs', components: [] });
    if (cmd === 'list_local_models') return Promise.resolve([]);
    if (cmd === 'get_cuda_runtime_status') return Promise.resolve({ state: 'unavailable', version: null, gpuName: null, error: null });
    if (cmd === 'save_appearance_preferences') return Promise.resolve({
      schemaVersion: 1,
      markdownOutputDir: null,
      appearance: args?.appearance,
      export: { format: 'markdown', includeScreenshots: true, includeSubtitles: true, includeSourceMetadata: true, includeDiagnosticLog: false },
      logLevel: 'info',
    });
    if (cmd === 'set_markdown_output_dir') return Promise.resolve({ schemaVersion: 1, markdownOutputDir: args?.path ?? null });
    if (cmd === 'copy_markdown_result') return Promise.resolve(args?.destinationPath);
    if (cmd === 'list_history' || cmd === 'search_history') return Promise.resolve(historyMocks.entries);
    if (cmd === 'search_library') return Promise.resolve({
      entries: historyMocks.entries.map((entry) => ({ ...entry, favorite: false, tags: [], lastOpenedAt: null })),
      tags: [],
      total: historyMocks.entries.length,
    });
    if (cmd === 'get_history') return Promise.resolve(historyMocks.entries.find((entry) => entry.id === args?.id) ?? null);
    if (cmd === 'mark_note_opened') {
      const entry = historyMocks.entries.find((candidate) => candidate.id === args?.id);
      return Promise.resolve(entry ? { ...entry, favorite: false, tags: [], lastOpenedAt: '2026-07-15T09:00:00Z' } : null);
    }
    if (cmd === 'get_history_markdown') return historyMocks.getMarkdown(args?.id);
    if (cmd === 'save_transcription_profile' || cmd === 'save_summary_profile') return Promise.resolve(MOCK_PROFILES);
    if (cmd === 'start_distillation') {
      capturedTaskId = args?.taskId as string;
      // The backend starts work immediately, but listeners are already registered.
      return Promise.resolve(undefined);
    }
    return Promise.resolve(undefined);
  });
  (globalThis as Record<string, unknown>).__appInvokeSpy__ = spy;
  return { invoke: spy, convertFileSrc: (path: string) => `asset://test/${path}` };
});

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn().mockImplementation((event: string, handler: (p: unknown) => void) => {
    const entry: ListenerEntry = { event, handler };
    registeredListeners.push(entry);
    return Promise.resolve(() => {
      registeredListeners = registeredListeners.filter((l) => l !== entry);
    });
  }),
}));

function fireEvent(eventSuffix: string, payload: unknown) {
  for (const l of registeredListeners) {
    if (l.event.endsWith(eventSuffix)) {
      l.handler({ payload });
    }
  }
}

beforeEach(() => {
  registeredListeners = [];
  capturedTaskId = null;
  const spy = (globalThis as Record<string, unknown>).__appInvokeSpy__ as ReturnType<typeof vi.fn> | undefined;
  if (spy) spy.mockClear();
  nativeMediaMocks.open.mockReset();
  nativeMediaMocks.open.mockResolvedValue(null);
  nativeMediaMocks.save.mockReset();
  nativeMediaMocks.save.mockResolvedValue(null);
  nativeMediaMocks.onDragDropEvent.mockClear();
  nativeMediaMocks.unlisten.mockClear();
  nativeMediaMocks.handler = null;
  historyMocks.entries = [];
  historyMocks.getMarkdown.mockReset();
  historyMocks.getMarkdown.mockResolvedValue('# 默认历史内容');
});

async function startTask() {
  const user = userEvent.setup();
  const urlInput = screen.getByLabelText('视频链接');
  await user.type(urlInput, 'https://v.douyin.com/abc/');
  // Wait for credential checks to resolve so button is enabled
  await waitFor(() => {
    expect((screen.getByText('开始提炼') as HTMLButtonElement).disabled).toBe(false);
  });
  await user.click(screen.getByText('开始提炼'));
  // Wait for all 4 listeners to be registered and invoke to be called.
  await waitFor(() => {
    expect(registeredListeners.length).toBe(4);
  });
}

// describe('App UI', () => {
describe('App UI', () => {
  // it('removes the redundant workbench top bar', () => {
  it('removes the redundant workbench top bar', () => {
    render(<App />);
    expect(document.querySelector('.workbench-topbar')).toBeNull();
    expect(screen.queryByRole('heading', { name: '新建提炼' })).toBeNull();
  });

  // it('shows the input panel', () => {
  it('shows the input panel', () => {
    render(<App />);
    expect(screen.getByLabelText('视频链接')).toBeDefined();
    expect(screen.getByText('开始提炼')).toBeDefined();
  });

  // it('disables start button when no input', () => {
  it('disables start button when no input', () => {
    render(<App />);
    const btn = screen.getByText('开始提炼') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  // it('opens the integrated settings workspace', async () => {
  it('opens the integrated settings workspace', async () => {
    render(<App />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: '设置' }));
    // CipherSettingsShell renders a root with five tabs
    await waitFor(() => {
      expect(document.querySelector('.cipher-settings-root')).not.toBeNull();
    }, { timeout: 5_000 });
    expect(screen.queryByRole('dialog', { name: '设置' })).not.toBeInTheDocument();
    for (const label of ['外观', '语音转文字', 'AI 接入', '数据管理', '关于']) {
      expect(screen.getByRole('tab', { name: label })).toBeInTheDocument();
    }
  });

  // it('persists the selected semantic theme without storing cre
  it('persists the selected semantic theme without storing credentials', async () => {
    render(<App />);
    const user = userEvent.setup();
    expect(document.documentElement.dataset.theme).toBe('dark');
    await user.click(screen.getByRole('button', { name: '设置' }));
    // Wait for cipher settings to appear, then navigate to appearance tab
    await waitFor(() => {
      expect(document.querySelector('.cipher-settings-root')).not.toBeNull();
    });
    await user.click(screen.getByText('外观'));
    const lightThemeTab = await screen.findByRole('tab', { name: /浅色/ });
    await user.click(lightThemeTab);
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe('light'));
    expect(screen.queryByRole('button', { name: '保存外观设置' })).not.toBeInTheDocument();
    expect(window.localStorage.getItem('video-distiller-theme')).toBe('light');
    expect(window.localStorage.getItem('api-key')).toBeNull();
  });

  // it('returns to the remembered create view after closing Sett
  it('returns to the remembered create view after closing Settings', async () => {
    render(<App />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: '设置' }));
    await waitFor(() => {
      expect(document.querySelector('.cipher-settings-root')).not.toBeNull();
    });
    await user.click(screen.getByRole('button', { name: '新建提炼' }));
    expect(screen.getByRole('button', { name: '新建提炼' })).toHaveAttribute('aria-current', 'page');
  });
  // it('updates and restores the Markdown output directory from
  it('updates and restores the Markdown output directory from Settings', async () => {
    const { invoke } = await import('@tauri-apps/api/core');
    const dialogMod = await import('@tauri-apps/plugin-dialog');
    const openDialog = vi.mocked(dialogMod.open);
    render(<App />);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: '设置' }));
    await waitFor(() => {
      expect(document.querySelector('.cipher-settings-root')).not.toBeNull();
    });
    // Navigate to data management tab in cipher settings
    const dataTab = await screen.findByRole('tab', { name: /数据管理/ });
    await user.click(dataTab);
    // DataManagementTab is statically loaded; verify its internal navigation.
    const cacheTab = await screen.findByRole('tab', { name: /缓存管理/ });
    expect(cacheTab).toBeTruthy();

    // Wait for "Markdown 输出目录" section to appear
    const markdownDirSection = await screen.findByText('Markdown 输出目录');
    expect(markdownDirSection).toBeTruthy();

    // Click "选择目录" button
    const chooseBtn = screen.getByRole('button', { name: '选择目录' });
    openDialog.mockResolvedValueOnce('D:\\test-export-dir');
    await user.click(chooseBtn);

    // Verify set_markdown_output_dir was called with the selected path
    await waitFor(() => {
      const calls = (invoke as any).mock?.calls ?? [];
      const found = calls.some((c: unknown[]) => c[0] === 'set_markdown_output_dir' && String(c[1]?.path) === 'D:\\test-export-dir');
      expect(found).toBe(true);
    }, { timeout: 5000 });

    // Click "恢复默认" button for markdown output directory
    const restoreBtns = screen.getAllByRole('button', { name: /恢复默认/ });
    // The markdown directory restore button is the last one (after export prefs restore)
    const restoreBtn = restoreBtns[restoreBtns.length - 1];
    await user.click(restoreBtn);

    // Verify set_markdown_output_dir was called with null (restore default)
    await waitFor(() => {
      const calls = (invoke as any).mock?.calls ?? [];
      const found = calls.some((c: unknown[]) => c[0] === 'set_markdown_output_dir' && String(c[1]?.path) === 'null');
      expect(found).toBe(true);
    }, { timeout: 5000 });
  });

  // it('allows typing a URL', async () => {
  it('allows typing a URL', async () => {
    render(<App />);
    const user = userEvent.setup();
    const input = screen.getByLabelText('视频链接');
    await user.type(input, 'https://v.douyin.com/abc/');
    expect((input as HTMLInputElement).value).toBe('https://v.douyin.com/abc/');
  });

  // it('sends listener-generated taskId and profile IDs to backe
  it('sends listener-generated taskId and profile IDs to backend', async () => {
    const { invoke } = await import('@tauri-apps/api/core');
    render(<App />);
    await startTask();

    // The backend must receive profile IDs (not raw base URL/model).
    expect(invoke).toHaveBeenCalledWith(
      'start_distillation',
      expect.objectContaining({
        taskId: 'uuid-from-mock-789',
        source: expect.objectContaining({ kind: 'douyin_url' }),
        transcriptionProfileId: 'tencent-flash',
        summaryProfileId: 'deepseek-main',
      }),
    );
    expect(capturedTaskId).toBe('uuid-from-mock-789');
  });

  // it('preserves the complete Windows path for a selected local
  it('preserves the complete Windows path for a selected local file', async () => {
    const { invoke } = await import('@tauri-apps/api/core');
    const user = userEvent.setup();
    nativeMediaMocks.open.mockResolvedValue('F:\\1.mp4');
    render(<App />);

    await user.click(screen.getByRole('tab', { name: '本地文件' }));
    await user.click(screen.getByLabelText('拖放视频或音频文件，或点击选择'));

    await waitFor(() => {
      expect((screen.getByText('开始提炼') as HTMLButtonElement).disabled).toBe(false);
    });
    await user.click(screen.getByText('开始提炼'));

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith(
        'start_distillation',
        expect.objectContaining({ source: { kind: 'file', path: 'F:\\1.mp4' } }),
      );
    });
  });

  // it('selects a complete path from the native Tauri drop event
  it('selects a complete path from the native Tauri drop event', async () => {
    render(<App />);

    await waitFor(() => expect(nativeMediaMocks.handler).not.toBeNull());
    nativeMediaMocks.handler?.({
      payload: { type: 'drop', paths: ['F:\\voice.m4a'] },
    });

    expect(await screen.findByText('F:\\voice.m4a')).toBeInTheDocument();
    expect(screen.getByText('音频')).toBeInTheDocument();
  });

  // it('registers exactly four listeners before invoking backend
  it('registers exactly four listeners before invoking backend', async () => {
    render(<App />);
    await startTask();

    // Verify all four listener events are registered.
    const events = registeredListeners.map((l) => l.event);
    expect(events.filter((e) => e.includes('task-progress:uuid-from-mock-789'))).toHaveLength(1);
    expect(events.filter((e) => e.includes('task-complete:uuid-from-mock-789'))).toHaveLength(1);
    expect(events.filter((e) => e.includes('task-error:uuid-from-mock-789'))).toHaveLength(1);
    expect(events.filter((e) => e.includes('provider-fallback:uuid-from-mock-789'))).toHaveLength(1);
  });

  // it('does not invoke start_distillation until after all four
  it('does not invoke start_distillation until after all four listeners are registered', async () => {
    const { invoke } = await import('@tauri-apps/api/core');
    const { listen } = await import('@tauri-apps/api/event');

    // Manually-controlled deferred promise for the 4th listener (provider-fallback).
    // The test controls when this resolves — no timers involved.
    let resolveFourthListener!: (value: () => void) => void;
    const fourthListenerPromise = new Promise<() => void>((resolve) => {
      resolveFourthListener = resolve;
    });

    vi.mocked(listen).mockImplementation(
      ((event: string, handler: (p: unknown) => void) => {
        const entry: ListenerEntry = { event, handler };
        registeredListeners.push(entry);
        // For the fallback listener, return the deferred promise.
        if (event.includes('provider-fallback')) {
          return fourthListenerPromise.then((unlistenFn) => {
            return () => {
              registeredListeners = registeredListeners.filter((l) => l !== entry);
              unlistenFn();
            };
          });
        }
        return Promise.resolve(() => {
          registeredListeners = registeredListeners.filter((l) => l !== entry);
        });
      }) as typeof listen,
    );

    render(<App />);
    const user = userEvent.setup();
    const urlInput = screen.getByLabelText('视频链接');
    await user.type(urlInput, 'https://v.douyin.com/test/');

    // Click start — listeners start registering, but 4th listener is deferred.
    await user.click(screen.getByText('开始提炼'));

    // Allow any microtasks to settle — 3 resolve, 1 is still pending.
    // Because App does `await Promise.all([...4 listeners])`, the code cannot
    // reach `invokeStartDistillation` until all four resolve.
    await vi.waitFor(() => {
      // At least 3 listeners are registered; the 4th is pending.
      expect(registeredListeners.length).toBeGreaterThanOrEqual(3);
    });

    // The 4th listener promise is still unresolved, so start_distillation
    // must NOT have been called — Promise.all gates on all 4.
    expect(invoke).not.toHaveBeenCalledWith(
      'start_distillation',
      expect.anything(),
    );

    // Manually resolve the 4th listener (no timer, deterministic).
    resolveFourthListener(() => {
      registeredListeners = registeredListeners.filter(
        (l) => !l.event.includes('provider-fallback'),
      );
    });

    // Now start_distillation MUST have been called.
    await vi.waitFor(() => {
      expect(invoke).toHaveBeenCalledWith(
        'start_distillation',
        expect.objectContaining({
          taskId: 'uuid-from-mock-789',
        }),
      );
    });
  });

  // it('receives progress before completion', async () => {
  it('receives progress before completion', async () => {
    render(<App />);
    await startTask();

    fireEvent('-progress:uuid-from-mock-789', {
      stage: 'transcribing',
      message: '正在转写音频...',
      percent: 52,
    });

    await waitFor(() => {
      expect(screen.getByText('正在转写音频...')).toBeDefined();
    });

    // Completion not yet fired
    expect(screen.queryByText('核心结论')).toBeNull();
  });

  // it('displays three result sections after completion event',
  it('displays three result sections after completion event', async () => {
    render(<App />);
    await startTask();

    fireEvent('-complete:uuid-from-mock-789', MOCK_RESULT);

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 2, name: '核心结论' })).toBeDefined();
    });

    expect(screen.getByRole('heading', { level: 2, name: '关键依据' })).toBeDefined();
    expect(screen.getByRole('heading', { level: 2, name: '启示/行动' })).toBeDefined();
    expect(screen.getByText('这是视频的核心结论')).toBeDefined();
    expect(screen.getByText('关键依据一')).toBeDefined();
    expect(screen.getByText('采取行动一')).toBeDefined();
    expect(screen.getByText(MOCK_RESULT.saved_path)).toBeDefined();
    expect(screen.getByText('提炼新视频')).toBeDefined();
  });

  // it('save as updates the displayed path only after a successf
  it('save as updates the displayed path only after a successful copy', async () => {
    const { invoke } = await import('@tauri-apps/api/core');
    nativeMediaMocks.save.mockResolvedValue('F:\\Notes\\copy.md');
    render(<App />);
    await startTask();
    fireEvent('-complete:uuid-from-mock-789', MOCK_RESULT);

    await userEvent.setup().click(await screen.findByRole('button', { name: '另存为' }));

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith('copy_markdown_result', {
        sourcePath: MOCK_RESULT.saved_path,
        destinationPath: 'F:\\Notes\\copy.md',
      });
      expect(screen.getByText('F:\\Notes\\copy.md')).toBeInTheDocument();
    });
  });

  // it('cancelled save as never invokes the copy command', async
  it('cancelled save as never invokes the copy command', async () => {
    const { invoke } = await import('@tauri-apps/api/core');
    nativeMediaMocks.save.mockResolvedValue(null);
    render(<App />);
    await startTask();
    fireEvent('-complete:uuid-from-mock-789', MOCK_RESULT);

    await userEvent.setup().click(await screen.findByRole('button', { name: '另存为' }));

    expect(invoke).not.toHaveBeenCalledWith('copy_markdown_result', expect.anything());
    expect(screen.getByText(MOCK_RESULT.saved_path)).toBeInTheDocument();
  });

  // it('failed save as keeps the original path and exposes an al
  it('failed save as keeps the original path and exposes an alert', async () => {
    const { invoke } = await import('@tauri-apps/api/core');
    nativeMediaMocks.save.mockResolvedValue('F:\\Notes\\copy.md');
    render(<App />);
    await startTask();
    fireEvent('-complete:uuid-from-mock-789', MOCK_RESULT);
    await screen.findByRole('button', { name: '另存为' });
    (invoke as ReturnType<typeof vi.fn>).mockRejectedValueOnce({
      code: 'copy_failed',
      message: '无法复制 Markdown 文件。',
      recovery: '请选择其他位置。',
    });

    await userEvent.setup().click(screen.getByRole('button', { name: '另存为' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('无法复制 Markdown 文件。');
    expect(screen.getByText(MOCK_RESULT.saved_path)).toBeInTheDocument();
  });

  // it('cancel button uses the live taskId', async () => {
  it('cancel button uses the live taskId', async () => {
    const { invoke } = await import('@tauri-apps/api/core');
    render(<App />);
    await startTask();

    fireEvent('-progress:uuid-from-mock-789', {
      stage: 'downloading',
      message: '正在下载视频...',
      percent: 10,
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '取消任务' })).toBeDefined();
    });

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: '取消任务' }));

    expect(invoke).toHaveBeenCalledWith('cancel_distillation', {
      taskId: 'uuid-from-mock-789',
    });
  });

  // it('keeps elapsed task time when navigating away and back',
  it('keeps elapsed task time when navigating away and back', async () => {
    render(<App />);
    await startTask();
    fireEvent('-progress:uuid-from-mock-789', {
      stage: 'transcribing',
      message: '正在转写音频...',
      percent: 52,
    });

    expect(await screen.findByText('已用时 0:01', {}, { timeout: 2_500 })).toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: '笔记库' }));
    await user.click(screen.getByRole('button', { name: '新建提炼' }));

    expect(screen.getByText(/已用时 0:0[1-9]/)).toBeInTheDocument();
  });

  // it('shows error panel on task-error event', async () => {
  it('shows error panel on task-error event', async () => {
    render(<App />);
    await startTask();

    fireEvent('-error:uuid-from-mock-789', {
      code: 'test_error',
      message: '测试错误消息',
      recovery: '请重试。',
    });

    await waitFor(() => {
      expect(screen.getByText('处理出错')).toBeDefined();
    });
    expect(screen.getByText('测试错误消息')).toBeDefined();
    expect(screen.getByText('请重试。')).toBeDefined();
  });

  // it('shows error when profiles are unavailable at start', asy
  it('shows error when profiles are unavailable at start', async () => {
    const { invoke } = await import('@tauri-apps/api/core');

    const originalImpl = vi.mocked(invoke).getMockImplementation();
    vi.mocked(invoke).mockImplementation((cmd: string, args?: Record<string, unknown>) => {
      if (cmd === 'get_profiles') return Promise.resolve(null);
      if (cmd === 'has_profile_credential') return Promise.resolve(false);
      if (cmd === 'start_distillation') return Promise.resolve(undefined);
      return Promise.resolve(undefined);
    });

    render(<App />);

    // Wait for profiles to be loaded (null)
    await vi.waitFor(() => {
      expect(vi.mocked(invoke)).toHaveBeenCalledWith('get_profiles');
    });

    // When profiles is null, readyToStart is false, so button stays disabled.
    // The start button click is a no-op in this state.
    await waitFor(() => {
      const btn = screen.getByText('开始提炼') as HTMLButtonElement;
      expect(btn.disabled).toBe(true);
    });

    // Restore original mock after test
    vi.mocked(invoke).mockImplementation(originalImpl!);
  });

  // it('shows fallback notice on provider-fallback event', async
  it('shows fallback notice on provider-fallback event', async () => {
    render(<App />);
    await startTask();

    fireEvent('-fallback:uuid-from-mock-789', {
      fromProfileId: 'tencent-flash',
      fromProfileName: '腾讯云极速版',
      toProfileId: 'mimo-asr',
      toProfileName: 'MiMo ASR',
      reason: 'quota_exhausted',
    });

    await waitFor(() => {
      // Text is split across elements (MiMo ASR is in a <strong> tag)
      expect(screen.getByText((content: string) =>
        content.includes('本次任务已自动切换到'),
      )).toBeInTheDocument();
    });
  });

  // it('shows a history Markdown read error and retries through
  it('shows a history Markdown read error and retries through the safe ID command', async () => {
    historyMocks.entries = [MOCK_HISTORY];
    historyMocks.getMarkdown
      .mockRejectedValueOnce({
        code: 'history_asset_unreadable',
        message: '历史笔记文件不可读取。',
        recovery: '请检查应用数据目录权限后重试。',
      })
      .mockResolvedValueOnce('# 重试后的笔记');
    render(<App />);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: '笔记库' }));
    await user.click((await screen.findByText('测试历史笔记')).closest('button') as HTMLButtonElement);
    expect(await screen.findByRole('alert')).toHaveTextContent('历史笔记文件不可读取。');

    await user.click(screen.getByRole('button', { name: '重新读取' }));
    expect(await screen.findByRole('heading', { level: 1, name: '重试后的笔记' })).toBeInTheDocument();
    expect(historyMocks.getMarkdown).toHaveBeenNthCalledWith(1, 7);
    expect(historyMocks.getMarkdown).toHaveBeenNthCalledWith(2, 7);
  });

  // it('places the selected note Q&A inside the history workspac
  it('places the selected note Q&A inside the history workspace', async () => {
    historyMocks.entries = [MOCK_HISTORY];
    render(<App />);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: '笔记库' }));
    await user.click((await screen.findByText('测试历史笔记')).closest('button') as HTMLButtonElement);
    await user.click(await screen.findByRole('button', { name: '向笔记提问' }));

    const workspace = screen.getByRole('region', { name: '笔记库工作区' });
    expect(workspace.contains(await screen.findByRole('complementary', { name: '笔记问答' }))).toBe(true);
  });

  // it('does not let an older Markdown response replace the newe
  it('does not let an older Markdown response replace the newest history selection', async () => {
    const second = { ...MOCK_HISTORY, id: 8, title: '第二篇历史笔记' };
    historyMocks.entries = [MOCK_HISTORY, second];
    const resolvers = new Map<number, (value: string) => void>();
    historyMocks.getMarkdown.mockImplementation((id: number) => new Promise<string>((resolve) => resolvers.set(id, resolve)));
    render(<App />);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: '笔记库' }));
    await user.click((await screen.findByText('测试历史笔记')).closest('button') as HTMLButtonElement);
    await waitFor(() => expect(resolvers.has(7)).toBe(true));
    await user.click(screen.getByText('第二篇历史笔记').closest('button') as HTMLButtonElement);
    await waitFor(() => expect(resolvers.has(8)).toBe(true));

    resolvers.get(8)?.('# 第二篇内容');
    expect(await screen.findByRole('heading', { level: 1, name: '第二篇内容' })).toBeInTheDocument();
    resolvers.get(7)?.('# 过期的第一篇内容');
    await waitFor(() => expect(screen.queryByRole('heading', { level: 1, name: '过期的第一篇内容' })).toBeNull());
  });
});
