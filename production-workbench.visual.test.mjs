import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';

const [endpoint, targetUrl, screenshotPath, widthArg = '1280', heightArg = '720', mode = 'workbench'] = process.argv.slice(2);
assert.ok(endpoint && targetUrl && screenshotPath, 'usage: node production-workbench.visual.test.mjs <cdp-endpoint> <url> <screenshot> [width] [height] [mode]');

const width = Number(widthArg);
const height = Number(heightArg);
assert.ok(Number.isFinite(width) && Number.isFinite(height), 'viewport dimensions must be finite numbers');

const routeModes = {
  workbench: 'create',
  history: 'library',
  'route-home': 'home',
  'route-create': 'create',
  'route-library': 'library',
  'route-qa': 'qa',
  'route-tasks': 'tasks',
  'route-progress': 'progress',
  'route-result': 'result',
  'route-settings': 'settings',
};
const routeLabels = { home: '首页', create: '新建提炼', library: '笔记库', qa: 'AI 问答', tasks: '历史任务' };
const routeSelectors = {
  home: '.home-workspace', create: '.create-workspace', library: '.library-workspace', qa: '.qa-workspace',
  tasks: '.task-history-workspace', progress: '.progress-workspace', result: '.result-workspace', settings: '.settings-workspace',
};
const settingsTopLabels = { appearance: '外观', transcription: '语音转文字', ai: 'AI 接入', data: '数据管理', about: '关于' };
const settingsSubLabels = {
  'transcription-cpu': 'CPU 模式', 'transcription-gpu': 'GPU 模式', 'transcription-online': '在线模式',
  'ai-llm': '大模型', 'ai-vector': '向量', 'ai-rerank': '重排', 'ai-web': '联网', 'ai-tts': '语音', 'ai-image': '作图', 'ai-agent': '本地智能体',
  'data-export': '导出设置', 'data-cache': '缓存管理', 'data-downloads': '平台连接', 'data-logs': '日志管理',
};
const lightMode = mode.includes('light');
const collapsedMode = mode.includes('collapsed');
let expectedSetting = null;
let expectedSubtab = null;

const tab = await fetch(`${endpoint}/json/new?${encodeURIComponent(targetUrl)}`, { method: 'PUT' }).then((response) => response.json());
const socket = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true });
  socket.addEventListener('error', reject, { once: true });
});

let sequence = 0;
const pending = new Map();
socket.addEventListener('message', (event) => {
  const message = JSON.parse(event.data);
  if (!message.id || !pending.has(message.id)) return;
  const { resolve, reject } = pending.get(message.id);
  pending.delete(message.id);
  if (message.error) reject(new Error(message.error.message));
  else resolve(message.result);
});

function send(method, params = {}) {
  const id = ++sequence;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}

await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 700 });

await send('Page.addScriptToEvaluateOnNewDocument', {
    source: `(() => {
      const visualMode = ${JSON.stringify(mode)};
      const callbacks = new Map();
      const listeners = new Map();
      let nextCallbackId = 1;
      const senseVoiceState = visualMode === 'settings-sensevoice-ready' ? 'ready'
        : visualMode === 'settings-sensevoice-error' ? 'failed'
          : visualMode === 'settings-sensevoice-downloading' ? 'partial'
            : 'missing';
      const senseVoiceStatus = {
        state: senseVoiceState,
        selectedModel: 'int8',
        runtimeReady: senseVoiceState === 'ready',
        tokensReady: senseVoiceState === 'ready',
        modelPath: senseVoiceState === 'ready' ? 'managed-model' : null,
        downloadedBytes: senseVoiceState === 'partial' ? 119616920 : senseVoiceState === 'ready' ? 239233841 : 0,
        totalBytes: 239233841,
        models: [
          { id: 'int8', state: senseVoiceState, downloadedBytes: senseVoiceState === 'partial' ? 119616920 : senseVoiceState === 'ready' ? 239233841 : 0, totalBytes: 239233841, isSelected: true },
          { id: 'float32', state: 'missing', downloadedBytes: 0, totalBytes: 937617178, isSelected: false }
        ]
      };
      window.__VISUAL_CALLBACKS__ = callbacks;
      window.__VISUAL_LISTENERS__ = listeners;
      window.__VISUAL_EMIT__ = (prefix, payload) => {
        for (const [eventName, callbackId] of listeners.entries()) {
          if (!eventName.startsWith(prefix)) continue;
          const callback = callbacks.get(callbackId);
          if (callback) callback({ id: callbackId, event: eventName, payload });
        }
      };
      window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener: () => {} };
      window.__TAURI_INTERNALS__ = {
      invoke: async (command, args) => {
        if (command === 'plugin:event|listen') { listeners.set(args?.event, args?.handler); return args?.handler; }
        if (command === 'plugin:event|unlisten') { for (const [eventName, id] of listeners.entries()) if (id === args?.eventId) listeners.delete(eventName); return undefined; }
        if (command === 'get_migration_state') return false;
        if (command === 'list_history' || command === 'search_history') return [
          { id: 7, title: '线性代数课程', source: 'https://video.example/watch', noteTemplate: 'core_distillation', createdAt: '2026-07-14 10:00', markdownPath: 'C:/notes/linear.md', transcriptPath: 'C:/notes/linear.txt', thumbnailPath: null, screenshotPaths: [] },
          { id: 8, title: '傅里叶变换与频域直觉', source: 'https://video.example/fourier', noteTemplate: 'core_distillation', createdAt: '2026-07-13 19:20', markdownPath: 'C:/notes/fourier.md', transcriptPath: 'C:/notes/fourier.txt', thumbnailPath: null, screenshotPaths: [] }
        ];
        if (command === 'list_local_models') return ['tiny','base','small','medium','large-v3-turbo'].map((id) => ({ id, state: id === 'small' ? 'ready' : 'not_downloaded', downloadedBytes: id === 'small' ? 1 : 0, totalBytes: 1, isCurrent: id === 'small' }));
        if (command === 'get_preferences') return {
          schemaVersion: 1, markdownOutputDir: 'D:\\\\Project\\\\notes\\\\export', localComputeMode: 'auto',
          transcriptionMode: visualMode.startsWith('settings-sensevoice') ? 'sensevoice_cpu' : 'whisper_local', sensevoiceModel: 'int8', sensevoiceLanguages: ['zh','en'],
          appearance: { theme: visualMode.includes('light') ? 'light' : 'dark', compactDensity: false, reducedMotion: false },
          export: { format: 'markdown', includeScreenshots: true, includeSubtitles: true, includeSourceMetadata: true, includeDiagnosticLog: false }, logLevel: 'info'
        };
        if (command === 'get_sensevoice_status') return senseVoiceStatus;
        if (command === 'set_transcription_preferences') return { schemaVersion: 1, markdownOutputDir: 'D:\\\\Project\\\\notes\\\\export', localComputeMode: 'auto', transcriptionMode: args?.transcriptionMode ?? 'sensevoice_cpu', sensevoiceModel: 'int8', sensevoiceLanguages: args?.sensevoiceLanguages ?? ['zh','en'] };
        if (command === 'has_profile_credential') return true;
        if (command === 'get_profiles') return {
          schemaVersion: 1,
          activeTranscriptionProfileId: 'local-whisper-cpp',
          activeSummaryProfileId: 'deepseek-main',
          fallbackTranscriptionProfileId: null,
          migrationRequired: false,
          transcriptionProfiles: [
            { id: 'local-whisper-cpp', name: '本地 Whisper', provider: 'local_whisper_cpp', baseUrl: '', model: 'small', enabled: true, builtIn: true },
            { id: 'mimo-asr', name: 'MiMo ASR', provider: 'mimo_asr', baseUrl: 'https://example.invalid', model: 'mimo-v2.5-asr', enabled: true, builtIn: true }
          ],
          summaryProfiles: [
            { id: 'deepseek-main', name: 'DeepSeek', provider: 'deep_seek', baseUrl: 'https://example.invalid', model: 'deepseek-chat', enabled: true, builtIn: true },
            { id: 'mimo-summary', name: 'MiMo Summary', provider: 'mimo', baseUrl: 'https://example.invalid', model: 'mimo-v2.5', enabled: true, builtIn: true }
          ]
        };
        if (command === 'get_capability_settings') return {
          schemaVersion: 1,
          vector: { enabled: true, providerId: 'openai', endpoint: 'https://example.invalid/v1', model: 'text-embedding-3-small', collection: 'video-notes', dimensions: 1536 },
          rerank: { enabled: true, providerId: 'cohere', endpoint: 'https://example.invalid/v1/rerank', model: 'rerank-v3.5' },
          webSearch: { enabled: false, providerId: 'tavily', endpoint: 'https://example.invalid/search', maxResults: 5 },
          tts: { enabled: true, providerId: 'openai', endpoint: 'https://example.invalid/v1/audio/speech', model: 'gpt-4o-mini-tts', voice: 'alloy' },
          image: { enabled: true, providerId: 'openai', endpoint: 'https://example.invalid/v1/images/generations', model: 'gpt-image-1', size: '1024x1024' },
          localAgent: { enabled: false, providerId: 'codex', executable: 'codex', arguments: ['exec'], timeoutSeconds: 120 }
        };
        if (command === 'get_capability_status') {
          const ready = (providerId, enabled = true) => ({ enabled, configured: true, credentialReady: enabled, providerId });
          return { vector: ready('openai'), rerank: ready('cohere'), webSearch: ready('tavily', false), tts: ready('openai'), image: ready('openai'), localAgent: ready('codex', false) };
        }
        if (command === 'discover_summary_models') return ['deepseek-chat', 'deepseek-reasoner', 'visual-discovered-model'];
        if (command === 'get_export_preferences') return { format: 'markdown', includeScreenshots: true, includeSubtitles: true, includeSourceMetadata: true, includeDiagnosticLog: false };
        if (command === 'get_cache_usage') return { totalBytes: 272629760, categories: [
          { category: 'temporary_media', bytes: 188743680, fileCount: 4 }, { category: 'screenshots', bytes: 25165824, fileCount: 18 },
          { category: 'transcription_intermediates', bytes: 50331648, fileCount: 3 }, { category: 'ai_index', bytes: 8388608, fileCount: 2 }
        ] };
        if (command === 'list_logs') return [
          { id: 'video-distiller.log', name: 'video-distiller.log', bytes: 24576, modifiedAt: '2026-07-15T15:40:00Z' },
          { id: 'video-distiller.1.log', name: 'video-distiller.1.log', bytes: 8192, modifiedAt: '2026-07-15T09:20:00Z' }
        ];
        if (command === 'read_log') return { id: args?.id ?? 'video-distiller.log', content: '[INFO] application ready\\n[INFO] task queue idle', truncated: false };
        if (command === 'get_about_snapshot') return { appVersion: '0.1.0', tauriVersion: '2.8.5', frontendVersion: 'React 19.1.1', rustVersion: 'rustc 1.88.0', appDataDir: 'C:/Users/demo/AppData/Roaming/video-distiller', exportDir: 'D:/Project/notes/export', logDir: 'C:/Users/demo/AppData/Roaming/video-distiller/logs', components: [
          { name: 'SenseVoice', version: 'int8', status: 'ready', license: 'MIT' }, { name: 'whisper.cpp', version: 'bundled', status: 'ready', license: 'MIT' }, { name: 'Tauri', version: '2.8.5', status: 'ready', license: 'Apache-2.0 / MIT' }
        ] };
        if (command === 'start_distillation' || command === 'cancel_distillation') return undefined;
        return undefined;
      },
      transformCallback: (callback) => {
        const id = nextCallbackId++;
        callbacks.set(id, callback);
        return id;
      },
      unregisterCallback: (id) => callbacks.delete(id)
    };
    })();`,
});
await send('Page.reload');

const deadline = Date.now() + 10000;
while (Date.now() < deadline) {
  const probe = await send('Runtime.evaluate', {
    expression: `JSON.stringify({ ready: document.readyState, shell: Boolean(document.querySelector('.workbench-app')) })`,
    returnByValue: true,
  });
  const state = JSON.parse(probe.result.value);
  if (state.ready === 'complete' && state.shell) break;
  await new Promise((resolve) => setTimeout(resolve, 100));
}

const settingsMode = mode.startsWith('settings') || mode === 'route-settings';
if (settingsMode) {
  await send('Runtime.evaluate', { expression: `document.querySelector('.workbench-sidebar button[aria-label="设置"]')?.click()`, returnByValue: true });
  const settingsDeadline = Date.now() + 5000;
  while (Date.now() < settingsDeadline) {
    const probe = await send('Runtime.evaluate', { expression: `Boolean(document.querySelector('.settings-workspace'))`, returnByValue: true });
    if (probe.result.value) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  const settingsReady = await send('Runtime.evaluate', { expression: `Boolean(document.querySelector('.settings-workspace') || document.querySelector('.cipher-settings-root'))`, returnByValue: true });
  assert.equal(settingsReady.result.value, true, 'settings visual mode must enter the Settings workspace');

  const section = mode.startsWith('settings-data') ? 'data'
    : mode.startsWith('settings-appearance') ? 'appearance'
      : mode.startsWith('settings-about') ? 'about'
        : mode.startsWith('settings-ai') ? 'ai'
          : 'transcription';
  const destination = settingsTopLabels[section];
  expectedSetting = destination;
  await send('Runtime.evaluate', {
    expression: `(() => {
      const destination = ${JSON.stringify(destination)};
      // Try cipher settings tabs first, fall back to legacy settings-tabs-v2
      let tab = [...document.querySelectorAll('.cipher-settings-tabs [role="tab"]')].find((b) => b.textContent.trim() === destination);
      if (!tab) tab = [...document.querySelectorAll('.settings-tabs-v2 [role="tab"]')].find((b) => b.textContent.trim() === destination);
      tab?.click();
      return !!tab;
    })()`,
    returnByValue: true,
  });
  await new Promise((resolve) => setTimeout(resolve, 180));

  const subModeKey = mode.startsWith('settings-transcription-profile')
    ? 'transcription-online'
    : Object.keys(settingsSubLabels).find((key) => mode.startsWith(`settings-${key}`));
  if (subModeKey) {
    const subtab = settingsSubLabels[subModeKey];
    expectedSubtab = subtab;
    await send('Runtime.evaluate', {
      expression: `(() => {
        const subtab = ${JSON.stringify(subtab)};
        let btn = [...document.querySelectorAll('.cipher-ai-subtabs [role="tab"]')].find((b) => b.textContent.trim() === subtab);
        if (!btn) btn = [...document.querySelectorAll('.cipher-mode-tabs [role="tab"]')].find((b) => b.textContent.trim() === subtab);
        if (!btn) btn = [...document.querySelectorAll('.settings-segments [role="tab"]')].find((b) => b.textContent.trim() === subtab);
        btn?.click();
        return !!btn;
      })()`,
      returnByValue: true,
    });
    await new Promise((resolve) => setTimeout(resolve, 180));
  } else {
    expectedSubtab = section === 'ai' ? '大模型'
      : section === 'data' ? '导出设置'
        : section === 'transcription' ? (mode.startsWith('settings-sensevoice') ? 'CPU 模式' : 'GPU 模式')
          : null;
  }
  if (mode.includes('profile-provider-dropdown')) {
    await send('Runtime.evaluate', { expression: `([...document.querySelectorAll('button')].find((button) => button.textContent.trim() === '新增转写服务'))?.click()`, returnByValue: true });
    await new Promise((resolve) => setTimeout(resolve, 180));
  }
  if (mode.includes('profile-discovered-model-dropdown')) {
    await send('Runtime.evaluate', { expression: `document.querySelector('.profile-manager .edit-btn')?.click()`, returnByValue: true });
    await new Promise((resolve) => setTimeout(resolve, 180));
    await send('Runtime.evaluate', { expression: `([...document.querySelectorAll('button')].find((button) => button.textContent.trim() === '发现模型'))?.click()`, returnByValue: true });
    const discoveryDeadline = Date.now() + 3000;
    while (Date.now() < discoveryDeadline) {
      const probe = await send('Runtime.evaluate', { expression: `Boolean(document.querySelector('button[aria-label="已发现模型"]'))`, returnByValue: true });
      if (probe.result.value) break;
      await new Promise((resolve) => setTimeout(resolve, 80));
    }
  }
  const dropdownLabel = mode.includes('appearance-dropdown') ? '颜色主题'
    : mode.includes('data-export-dropdown') ? '默认导出格式'
      : mode.includes('data-logs-dropdown') ? '日志级别'
        : mode.includes('transcription-online-dropdown') ? '在线转写服务商'
          : mode.includes('ai-llm-provider-dropdown') ? 'AI 服务商'
            : mode.includes('ai-llm-model-dropdown') ? 'AI 模型'
              : mode.includes('ai-image-size-dropdown') ? '图片尺寸'
                : mode.includes('profile-provider-dropdown') ? '服务商'
                  : mode.includes('profile-discovered-model-dropdown') ? '已发现模型'
                    : mode.includes('transcription-online-fallback-dropdown') ? '备用转写配置（额度不足时自动切换）'
                      : mode.includes('ai-vector-provider-dropdown') ? '向量服务商预设'
                        : mode.includes('ai-rerank-provider-dropdown') ? '重排服务商预设'
                          : mode.includes('ai-web-provider-dropdown') ? '联网服务商预设'
                            : mode.includes('ai-tts-provider-dropdown') ? '语音服务商预设'
                              : mode.includes('ai-image-provider-dropdown') ? '作图服务商预设'
                                : mode.includes('ai-agent-provider-dropdown') ? '本地智能体服务商预设'
                                  : null;
  if (dropdownLabel) {
    await send('Runtime.evaluate', { expression: `document.querySelector('button[aria-label=${JSON.stringify(dropdownLabel)}]')?.click()`, returnByValue: true });
    await new Promise((resolve) => setTimeout(resolve, 120));
  }
  if (mode === 'settings-sensevoice-downloading') {
    await send('Runtime.evaluate', {
      expression: `(() => { for (const callback of window.__VISUAL_CALLBACKS__.values()) { try { callback({ id: 1, event: 'sensevoice-download-progress', payload: { modelId: 'int8', artifactId: 'model-int8.onnx', downloadedBytes: 119616920, totalBytes: 239233841, overallPercent: 50 } }); } catch {} } return true; })()`,
      returnByValue: true,
    });
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}
if (lightMode) { await new Promise((resolve) => setTimeout(resolve, 180)); }

if (collapsedMode) {
  await send('Runtime.evaluate', {
    expression: `document.querySelector('.sidebar-toggle')?.click()`,
    returnByValue: true,
  });
  await new Promise((resolve) => setTimeout(resolve, 400));
}

const route = routeModes[mode]
  ?? (mode.startsWith('route-create-') ? 'create' : null)
  ?? (mode.startsWith('route-') ? mode.slice('route-'.length).replace(/-(light|dark|collapsed)$/, '') : null);
if (route && routeLabels[route]) {
  await send('Runtime.evaluate', {
    expression: `document.querySelector('.sidebar-nav button[aria-label=${JSON.stringify(routeLabels[route])}]')?.click()`,
    returnByValue: true,
  });
}

if (mode === 'route-create-note-style-dropdown') {
  const mounted = await send('Runtime.evaluate', {
    expression: `(async () => {
      const ReactModule = await import('/node_modules/.vite/deps/react.js');
      const React = ReactModule.default ?? ReactModule;
      const ReactDomClientModule = await import('/node_modules/.vite/deps/react-dom_client.js');
      const ReactDomClient = ReactDomClientModule.default ?? ReactDomClientModule;
      const { default: NoteStylePicker } = await import('/src/components/NoteStylePicker.tsx');
      const host = document.createElement('div');
      host.id = 'visual-note-style-host';
      Object.assign(host.style, { position: 'fixed', zIndex: '500', top: '76px', right: '24px', width: '360px', padding: '12px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '16px' });
      document.body.append(host);
      ReactDomClient.createRoot(host).render(React.createElement(NoteStylePicker, { value: 'minimal', onChange: () => {} }));
      return true;
    })()`,
    awaitPromise: true,
    returnByValue: true,
  });
  assert.equal(mounted.exceptionDetails, undefined, `NoteStylePicker visual mount failed: ${JSON.stringify(mounted.exceptionDetails)}`);
  const noteStyleDeadline = Date.now() + 3000;
  let noteStyleReady = false;
  while (Date.now() < noteStyleDeadline) {
    const probe = await send('Runtime.evaluate', { expression: `Boolean(document.querySelector('button[aria-label="笔记风格"]'))`, returnByValue: true });
    if (probe.result.value) { noteStyleReady = true; break; }
    await new Promise((resolve) => setTimeout(resolve, 80));
  }
  assert.equal(noteStyleReady, true, 'NoteStylePicker visual mode must mount the production trigger');
  await send('Runtime.evaluate', { expression: `document.querySelector('button[aria-label="笔记风格"]')?.click()`, returnByValue: true });
  await new Promise((resolve) => setTimeout(resolve, 120));
}

if (mode === 'route-create-summary-dropdown' || mode === 'route-create-transcription-dropdown') {
  const pickerLabel = mode.includes('summary') ? '核心总结' : '转写服务';
  const pickerDeadline = Date.now() + 3000;
  while (Date.now() < pickerDeadline) {
    const probe = await send('Runtime.evaluate', { expression: `Boolean(document.querySelector('button[aria-label=${JSON.stringify(pickerLabel)}]:not(:disabled)'))`, returnByValue: true });
    if (probe.result.value) break;
    await new Promise((resolve) => setTimeout(resolve, 80));
  }
  await send('Runtime.evaluate', { expression: `document.querySelector('button[aria-label=${JSON.stringify(pickerLabel)}]')?.click()`, returnByValue: true });
  await new Promise((resolve) => setTimeout(resolve, 120));
}

if (route === 'progress' || route === 'result') {
  await send('Runtime.evaluate', {
    expression: `(() => { const input = document.querySelector('#video-url'); if (!input) return false; const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; setter.call(input, 'https://www.youtube.com/watch?v=visual-audit'); input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`,
    returnByValue: true,
  });
  await new Promise((resolve) => setTimeout(resolve, 100));
  await send('Runtime.evaluate', { expression: `(() => { const button = document.querySelector('.start-button'); if (!button) return false; button.disabled = false; button.click(); return true; })()`, returnByValue: true });
  const listenerDeadline = Date.now() + 5000;
  while (Date.now() < listenerDeadline) {
    const probe = await send('Runtime.evaluate', {
      expression: `Boolean([...window.__VISUAL_LISTENERS__.keys()].some((name) => name.startsWith('task-progress:')))`,
      returnByValue: true,
    });
    if (probe.result.value) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  await send('Runtime.evaluate', {
    expression: `window.__VISUAL_EMIT__('task-progress:', { stage: 'transcribing', message: '正在转写与整理重点', percent: 48 })`,
    returnByValue: true,
  });
  if (route === 'result') {
    await send('Runtime.evaluate', {
      expression: `window.__VISUAL_EMIT__('task-complete:', { task_id: 'visual-task', distillation: { core_conclusion: '结构化提炼已经完成，核心结论与关键证据可直接复查。', key_evidence: [{ text: '关键概念在示例与结论之间形成了清晰映射。', timestamp_seconds: 84 }, { text: '处理链路保留了本地隐私与可追溯的来源信息。', timestamp_seconds: 216 }], implications: ['复习时先看结论，再按时间戳回查依据。', '导出 Markdown 后可继续编辑与归档。'], transcript: '这是用于视觉审计的离线示例转写。' }, saved_path: 'D:/Project/notes/export/visual-audit.md' })`,
      returnByValue: true,
    });
  }
}

if (route) {
  const expectedSelector = routeSelectors[route];
  const routeDeadline = Date.now() + 5000;
  let routeReady = false;
  while (Date.now() < routeDeadline) {
    const probe = await send('Runtime.evaluate', { expression: `Boolean(document.querySelector(${JSON.stringify(expectedSelector)}))`, returnByValue: true });
    if (probe.result.value) { routeReady = true; break; }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  const routeDiagnostic = routeReady ? null : await send('Runtime.evaluate', {
    expression: `JSON.stringify({ input: document.querySelector('#video-url')?.value, startDisabled: document.querySelector('.start-button')?.disabled, listeners: [...(window.__VISUAL_LISTENERS__?.keys?.() ?? [])], body: document.body.innerText.slice(0, 800) })`,
    returnByValue: true,
  });
  assert.equal(routeReady, true, `visual mode ${mode} must navigate to ${route}: ${routeDiagnostic?.result?.value ?? ''}`);
}

const inspected = await send('Runtime.evaluate', {
  expression: `JSON.stringify({
    mode: ${JSON.stringify(mode)},
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
    theme: document.documentElement.dataset.theme,
    openListboxes: document.querySelectorAll('[role="listbox"]').length,
    unlabeledButtons: [...document.querySelectorAll('button')].filter((button) => !button.textContent.trim() && !button.getAttribute('aria-label') && !button.getAttribute('title')).length,
    documentWidth: document.documentElement.scrollWidth,
    bodyWidth: document.body.scrollWidth,
    sidebarWidth: Math.round(document.querySelector('.workbench-sidebar').getBoundingClientRect().width),
    windowScrollY: Math.round(window.scrollY),
    sidebarScrollTop: Math.round(document.querySelector('.workbench-sidebar').scrollTop),
    contentScrollTop: Math.round(document.querySelector('.workbench-content').scrollTop),
    activePrimary: document.querySelector('.sidebar-nav [aria-current="page"]')?.getAttribute('aria-label') ?? null,
    activeSetting: (document.querySelector('.cipher-settings-tabs [role="tab"][aria-selected="true"]') || document.querySelector('.settings-tabs-v2 [role="tab"][aria-selected="true"]'))?.textContent.trim() ?? null,
    activeSubtab: (document.querySelector('.cipher-ai-subtabs [role="tab"][aria-selected="true"]') || document.querySelector('.settings-segments [role="tab"][aria-selected="true"]'))?.textContent.trim() ?? null,
    aiProtocolDisabled: document.querySelector('button[aria-label="AI 协议"]')?.disabled ?? null,
    collapsedLabels: [...document.querySelectorAll('.workbench-sidebar .sidebar-label')].map((element) => ({
      maxWidth: getComputedStyle(element).maxWidth,
      opacity: getComputedStyle(element).opacity,
      visibility: getComputedStyle(element).visibility
    })),
    readyDotVisible: document.querySelector('.ready-dot')?.getBoundingClientRect().width > 0,
    keyWidths: ['.workbench-sidebar', '.workbench-topbar', '.app-main', '.create-workspace', '.input-panel', '.pipeline-card', '.history-workspace', '.history-workspace-layout', '.history-note-card', '.settings-row', '.input-mode-tabs', '.settings-workspace', '.settings-layout', '.settings-pane', '.settings-pane-v2', '.settings-feature', '.settings-surface']
      .map((selector) => {
        const element = document.querySelector(selector);
        return element ? { selector, scrollWidth: element.scrollWidth, clientWidth: element.clientWidth } : null;
      })
      .filter(Boolean),
    overflow: [...document.querySelectorAll('body *')]
      .map((element) => ({
        tag: element.tagName,
        className: typeof element.className === 'string' ? element.className : '',
        left: Math.round(element.getBoundingClientRect().left),
        right: Math.round(element.getBoundingClientRect().right),
        scrollWidth: element.scrollWidth,
        clientWidth: element.clientWidth,
        visible: getComputedStyle(element).visibility !== 'hidden' && getComputedStyle(element).display !== 'none',
        intentionallyScrollable: Boolean(element.closest('.settings-tabs-v2, .settings-segments'))
      }))
      .filter((item) => item.visible && !item.intentionallyScrollable && (item.right > window.innerWidth + 1 || item.left < -1))
      .slice(0, 12)
  })`,
  returnByValue: true,
});
const state = JSON.parse(inspected.result.value);

assert.ok(state.documentWidth <= state.innerWidth, `document must not scroll horizontally: ${JSON.stringify(state)}`);
assert.ok(state.overflow.length === 0, `elements must remain inside the viewport: ${JSON.stringify(state.overflow)}`);
assert.ok(state.keyWidths.every((item) => item.scrollWidth <= item.clientWidth), `key containers must not scroll horizontally: ${JSON.stringify(state.keyWidths)}`);
assert.equal(state.unlabeledButtons, 0, `interactive icon buttons must have accessible names: ${JSON.stringify(state)}`);
assert.equal(state.theme, lightMode ? 'light' : 'dark', `theme must match visual mode: ${JSON.stringify(state)}`);
if (settingsMode) {
  assert.equal(state.activeSetting, expectedSetting, `settings mode must select the expected top-level tab: ${JSON.stringify(state)}`);
  assert.equal(state.activeSubtab, expectedSubtab, `settings mode must select the expected subtab: ${JSON.stringify(state)}`);
}
if (mode.includes('dropdown')) assert.ok(state.openListboxes > 0, `dropdown mode must keep a listbox open: ${JSON.stringify(state)}`);
if (mode === 'settings-ai-llm-protocol-disabled') {
  assert.equal(state.aiProtocolDisabled, true, `AI protocol select must remain disabled: ${JSON.stringify(state)}`);
  assert.equal(state.openListboxes, 0, `disabled AI protocol must not open a listbox: ${JSON.stringify(state)}`);
}
if (collapsedMode) {
  assert.equal(state.sidebarWidth, 88, `collapsed sidebar must be 88px wide: ${JSON.stringify(state)}`);
  assert.ok(state.collapsedLabels.every((label) => label.maxWidth === '0px' && label.opacity === '0' && label.visibility === 'hidden'), `collapsed labels must occupy no visible space: ${JSON.stringify(state.collapsedLabels)}`);
  assert.equal(state.readyDotVisible, true, 'collapsed sidebar keeps the green service indicator visible');
}

const capture = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
writeFileSync(screenshotPath, Buffer.from(capture.data, 'base64'));
console.log(JSON.stringify(state));
socket.close();
await fetch(`${endpoint}/json/close/${tab.id}`).catch(() => undefined);
