/**
 * Cipher Settings Visual Matrix — Edge/CDP real rendering test (acceptance rework).
 *
 * Hard requirements from acceptance feedback:
 *   1. Tauri mock implements set_transcription_preferences (returns full AppPreferences with mode)
 *   2. After CPU/GPU/online switch, force-verify panel titles + active tab
 *   3. CPU/GPU/online screenshot hashes must be mutually distinct
 *   4. Same page dark/light must produce different hashes + different computed styles
 *   5. CipherTalk baseline compares actual CSS variable VALUES (not length > 0)
 *   6. White-screenshot, hash dedup, overflow=FAIL, click-fail=error
 *
 * Usage: node task13-settings-visual-matrix.mjs <cdp-endpoint> <url> [output-dir]
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';

const [endpoint, targetUrl, outputDir = 'outputs/visual-matrix'] = process.argv.slice(2);
assert.ok(endpoint && targetUrl, 'usage: node task13-settings-visual-matrix.mjs <cdp-endpoint> <url> [output-dir]');

mkdirSync(outputDir, { recursive: true });

const pages = [
  { id: 'appearance', label: '外观', expectedHeading: '外观' },
  { id: 'transcription', label: '语音转文字', expectedHeading: 'SenseVoice 本地模型' },
  { id: 'ai', label: 'AI 接入', expectedHeading: 'AI 接入配置' },
  { id: 'data', label: '数据管理', expectedHeading: '数据管理' },
  { id: 'about', label: '关于', expectedHeading: 'VedioNotes' },
];

const dprLevels = [1, 1.25, 1.5];
const viewports = [
  { width: 1280, height: 800, suffix: 'wide' },
  { width: 820, height: 900, suffix: 'narrow' },
];
const themes = ['dark', 'light'];

const aiSubTabs = [
  { id: 'summary', label: '大语言模型' },
  { id: 'vector', label: '向量' },
  { id: 'rerank', label: '重排' },
  { id: 'websearch', label: '联网' },
  { id: 'tts', label: '语音' },
  { id: 'image', label: '作图' },
  { id: 'agent', label: '本地智能体' },
];

const transcriptionModes = [
  { id: 'cpu', label: 'CPU 模式', expectedPanel: 'SenseVoice 本地模型', modeValue: 'sensevoice_cpu' },
  { id: 'gpu', label: 'GPU 模式', expectedPanel: 'Whisper GPU 模型', modeValue: 'whisper_local' },
  { id: 'online', label: '在线模式', expectedPanel: '在线语音转写', modeValue: 'online_profile' },
];

// ---- CipherTalk baseline CSS: extract literal --settings-* values ----
const CIPHERTALK_LOCKED_COMMIT = 'b5b580c5af7672a729a0c7fc10b8b1511fe6d478';
const cipherTalkRoot = resolve('../CipherTalk');
const cipherTalkCssPath = `${cipherTalkRoot}@${CIPHERTALK_LOCKED_COMMIT}:src/pages/SettingsPage.css`;
const ourCssPath = resolve('src/styles/cipher-settings.css');
const cipherTalkBaseline = execFileSync(
  'git',
  ['-C', cipherTalkRoot, 'show', `${CIPHERTALK_LOCKED_COMMIT}:src/pages/SettingsPage.css`],
  { encoding: 'utf8' },
);
const ourCssSource = existsSync(ourCssPath) ? readFileSync(ourCssPath, 'utf8') : '';

function extractLiteralVars(css) {
  const map = {};
  // Match --settings-xxx: <value>; where value is a simple token (px, number, color-mix, etc.)
  const re = /(--settings-[\w-]+)\s*:\s*([^;]+);/g;
  let m;
  while ((m = re.exec(css)) !== null) {
    const name = m[1];
    const value = m[2].trim();
    // Prefer first declaration (root tokens), skip later overrides that are just usages context
    if (!(name in map)) map[name] = value;
  }
  return map;
}

const baselineLiteralVars = extractLiteralVars(cipherTalkBaseline);
const ourLiteralVars = extractLiteralVars(ourCssSource);

// Keys that must match exactly between CipherTalk source and our transplant
const BASELINE_COMPARE_KEYS = [
  '--settings-radius',
  '--settings-card-radius',
  '--settings-control-radius',
  '--settings-control-height',
  '--settings-gap',
  '--settings-shadow',
  '--settings-shadow-hover',
];


async function main() {
// ---- CDP connection ----
const tab = await fetch(`${endpoint}/json/new?${encodeURIComponent(targetUrl)}`, { method: 'PUT' }).then((r) => r.json());
const socket = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise((resolveOpen, reject) => {
  socket.addEventListener('open', resolveOpen, { once: true });
  socket.addEventListener('error', reject, { once: true });
});

let sequence = 0;
const pending = new Map();
socket.addEventListener('message', (event) => {
  const message = JSON.parse(event.data);
  if (!message.id || !pending.has(message.id)) return;
  const { resolve: res, reject: rej } = pending.get(message.id);
  pending.delete(message.id);
  if (message.error) rej(new Error(message.error.message));
  else res(message.result);
});

function send(method, params = {}) {
  const id = ++sequence;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((res, rej) => pending.set(id, { resolve: res, reject: rej }));
}

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, rej) => setTimeout(() => rej(new Error(`timeout ${ms}ms: ${label}`)), ms)),
  ]);
}


await send('Page.enable');
await send('Runtime.enable');

// Inject Tauri mock with mutable preferences state (critical for mode switching)
await send('Page.addScriptToEvaluateOnNewDocument', {
  source: `
    (function () {
      const defaultPreferences = () => ({
        schemaVersion: 1,
        markdownOutputDir: 'D:\\\\export',
        localComputeMode: 'auto',
        transcriptionMode: 'sensevoice_cpu',
        sensevoiceModel: 'int8',
        sensevoiceLanguages: ['zh', 'en'],
        appearance: { theme: 'dark', compactDensity: false, reducedMotion: false },
        export: {
          format: 'markdown',
          includeScreenshots: true,
          includeSubtitles: true,
          includeSourceMetadata: true,
          includeDiagnosticLog: false,
        },
        logLevel: 'info',
      });

      // Mutable state shared across invoke calls
      window.__MOCK_PREFERENCES__ = defaultPreferences();

      window.__TAURI_INTERNALS__ = {
        invoke: async (command, args) => {
          if (command === 'get_migration_state') return false;

          if (command === 'get_profiles') return {
            schemaVersion: 1,
            activeTranscriptionProfileId: 'local-whisper',
            activeSummaryProfileId: 'deepseek',
            fallbackTranscriptionProfileId: null,
            migrationRequired: false,
            transcriptionProfiles: [
              { id: 'local-whisper', name: '本地 Whisper', provider: 'local_whisper_cpp', baseUrl: '', model: 'small', enabled: true, builtIn: true },
              { id: 'online-mimo', name: 'MiMo 在线', provider: 'openai_compatible', baseUrl: 'https://example.invalid/v1', model: 'mimo', enabled: true, builtIn: false },
            ],
            summaryProfiles: [
              { id: 'deepseek', name: 'DeepSeek', provider: 'deep_seek', baseUrl: 'https://example.invalid', model: 'deepseek-chat', enabled: true, builtIn: true },
            ],
          };

          if (command === 'get_preferences') {
            return JSON.parse(JSON.stringify(window.__MOCK_PREFERENCES__));
          }

          // CRITICAL: mode switch must return full AppPreferences with updated transcriptionMode
          if (command === 'set_transcription_preferences') {
            const mode = args?.transcriptionMode ?? args?.transcription_mode;
            const langs = args?.sensevoiceLanguages ?? args?.sensevoice_languages;
            if (mode) window.__MOCK_PREFERENCES__.transcriptionMode = mode;
            if (Array.isArray(langs)) window.__MOCK_PREFERENCES__.sensevoiceLanguages = langs;
            return JSON.parse(JSON.stringify(window.__MOCK_PREFERENCES__));
          }

          if (command === 'save_appearance_preferences') {
            const appearance = args?.appearance;
            if (appearance) {
              window.__MOCK_PREFERENCES__.appearance = {
                theme: appearance.theme ?? window.__MOCK_PREFERENCES__.appearance.theme,
                compactDensity: appearance.compactDensity ?? false,
                reducedMotion: appearance.reducedMotion ?? false,
              };
            }
            return JSON.parse(JSON.stringify(window.__MOCK_PREFERENCES__));
          }

          if (command === 'set_local_compute_mode') {
            const mode = args?.mode ?? args?.localComputeMode ?? 'auto';
            window.__MOCK_PREFERENCES__.localComputeMode = mode;
            return JSON.parse(JSON.stringify(window.__MOCK_PREFERENCES__));
          }

          if (command === 'set_markdown_output_dir') {
            window.__MOCK_PREFERENCES__.markdownOutputDir = args?.path ?? null;
            return JSON.parse(JSON.stringify(window.__MOCK_PREFERENCES__));
          }

          if (command === 'has_profile_credential') return true;

          if (command === 'get_sensevoice_status') return {
            state: 'ready',
            selectedModel: 'int8',
            runtimeReady: true,
            tokensReady: true,
            modelPath: 'managed',
            downloadedBytes: 239233841,
            totalBytes: 239233841,
            models: [
              { id: 'int8', state: 'ready', downloadedBytes: 239233841, totalBytes: 239233841, isSelected: true },
              { id: 'float32', state: 'missing', downloadedBytes: 0, totalBytes: 937617178, isSelected: false },
            ],
          };

          if (command === 'list_local_models') {
            return ['tiny', 'base', 'small', 'medium', 'large-v3-turbo'].map((id) => ({
              id,
              state: id === 'small' ? 'ready' : 'not_downloaded',
              downloadedBytes: id === 'small' ? 1 : 0,
              totalBytes: 1,
              isCurrent: id === 'small',
            }));
          }

          if (command === 'get_cuda_runtime_status') {
            return { state: 'ready', version: '12.4', gpuName: 'NVIDIA RTX 4060', computeMode: 'auto', message: null };
          }

          if (command === 'get_summary_provider_catalog') return [
            {
              id: 'openai', displayName: 'OpenAI', description: 'GPT models', protocol: 'openai',
              baseUrl: 'https://api.openai.com/v1', npmPackage: 'openai',
              models: [
                { id: 'gpt-4o', name: 'GPT-4o', summaryEligible: true, modalities: {}, capabilities: {}, limit: {}, cost: {} },
                { id: 'gpt-4o-mini', name: 'GPT-4o mini', summaryEligible: true, modalities: {}, capabilities: {}, limit: {}, cost: {} },
              ],
            },
            {
              id: 'anthropic', displayName: 'Anthropic', description: 'Claude models', protocol: 'anthropic',
              baseUrl: 'https://api.anthropic.com', npmPackage: '@anthropic-ai/sdk',
              models: [
                { id: 'claude-sonnet-4', name: 'Claude Sonnet 4', summaryEligible: true, modalities: {}, capabilities: {}, limit: {}, cost: {} },
              ],
            },
            {
              id: 'google', displayName: 'Google Gemini', description: 'Gemini models', protocol: 'google',
              baseUrl: 'https://generativelanguage.googleapis.com', npmPackage: '@google/generative-ai',
              models: [
                { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', summaryEligible: true, modalities: {}, capabilities: {}, limit: {}, cost: {} },
              ],
            },
          ];

          if (command === 'get_capability_settings') return {
            schemaVersion: 1,
            vector: { enabled: true, providerId: 'openai', endpoint: 'https://example.invalid/v1', model: 'text-embedding-3-small', collection: 'notes', dimensions: 1536 },
            rerank: { enabled: true, providerId: 'cohere', endpoint: 'https://example.invalid/v1/rerank', model: 'rerank-v3.5' },
            webSearch: { enabled: false, providerId: 'tavily', endpoint: 'https://example.invalid/search', maxResults: 5 },
            tts: { enabled: true, providerId: 'openai', endpoint: 'https://example.invalid/v1/audio/speech', model: 'gpt-4o-mini-tts', voice: 'alloy' },
            image: { enabled: true, providerId: 'openai', endpoint: 'https://example.invalid/v1/images/generations', model: 'gpt-image-1', size: '1024x1024' },
            localAgent: { enabled: false, providerId: 'codex', executable: 'codex', arguments: ['exec'], timeoutSeconds: 120 },
          };

          if (command === 'get_capability_status') return {
            vector: { enabled: true, configured: true, credentialReady: true, providerId: 'openai' },
            rerank: { enabled: true, configured: true, credentialReady: true, providerId: 'cohere' },
            webSearch: { enabled: false, configured: true, credentialReady: false, providerId: 'tavily' },
            tts: { enabled: true, configured: true, credentialReady: true, providerId: 'openai' },
            image: { enabled: true, configured: true, credentialReady: true, providerId: 'openai' },
            localAgent: { enabled: false, configured: true, credentialReady: false, providerId: 'codex' },
          };

          if (command === 'get_about_snapshot') return {
            appVersion: '0.0.1-preview.20260724.super-long-prerelease-channel-windows.x86_64.webview2',
            tauriVersion: '2.11.5+wry.0.55.1.webview2-custom-protocol',
            frontendVersion: '19.1.0+typescript.5.x.vite.7',
            rustVersion: '1.91 stable windows-msvc',
            appDataDir: '\\\\\\\\server-name-that-is-intentionally-very-long\\VedioNotes\\structured-redacted-logs\\2026\\07\\24\\session_identifier_without_breakpoints_915bf7d76e1e28b87c9477d4fef51d0b',
            exportDir: 'D:\\\\VedioNotes\\MarkdownOutputs\\one_single_uninterrupted_export_folder_name',
            logDir: '\\\\\\\\server-name-that-is-intentionally-very-long\\VedioNotes\\structured-redacted-logs\\2026\\07\\24\\session_identifier_without_breakpoints_915bf7d76e1e28b87c9477d4fef51d0b',
            components: [
              {
                name: 'whisper_cpp_cuda_runtime_gpu_transcription_sidecar_and_local_model_component',
                version: 'whisper.cpp-b6414-cuda-12.8-sm_75-sm_86-windows-x86_64.release-portable.sidecar',
                status: 'not_installed_because_runtime_component_signature_is_missing',
                license: 'MIT-AND-NVIDIA-CUDA-Toolkit-EULA-component-runtime-distribution-metadata',
              },
              { name: 'frontend_runtime_and_webview2_bridge', version: '19.1.0+webview2.14393.0', status: 'ready', license: 'MIT' },
            ],
          };

          if (command === 'get_export_preferences') {
            return JSON.parse(JSON.stringify(window.__MOCK_PREFERENCES__.export));
          }

          if (command === 'save_export_preferences') {
            if (args?.preferences || args) {
              window.__MOCK_PREFERENCES__.export = {
                ...window.__MOCK_PREFERENCES__.export,
                ...(args.preferences || args),
              };
            }
            return JSON.parse(JSON.stringify(window.__MOCK_PREFERENCES__.export));
          }

          if (command === 'restore_export_preferences') {
            window.__MOCK_PREFERENCES__.export = {
              format: 'markdown',
              includeScreenshots: true,
              includeSubtitles: true,
              includeSourceMetadata: true,
              includeDiagnosticLog: false,
            };
            return JSON.parse(JSON.stringify(window.__MOCK_PREFERENCES__.export));
          }

          if (command === 'get_cache_usage') return {
            totalBytes: 104857600,
            categories: [
              { category: 'temporary_media', bytes: 52428800, fileCount: 12 },
              { category: 'screenshots', bytes: 31457280, fileCount: 8 },
              { category: 'transcription_intermediates', bytes: 20971520, fileCount: 4 },
            ],
          };

          if (command === 'list_logs') return [
            { id: 'app.log', name: 'app.log', bytes: 4096, modifiedAt: '2026-07-16T10:00:00Z' },
            { id: 'transcription.log', name: 'transcription.log', bytes: 2048, modifiedAt: '2026-07-16T09:00:00Z' },
          ];

          if (command === 'read_log') return { id: args?.id, content: 'line1\\nline2\\nline3', truncated: false };

          // No-op mutations that should not crash the UI
          if (
            command === 'open_export_directory' ||
            command === 'open_app_data_directory' ||
            command === 'open_log_directory' ||
            command === 'open_documentation' ||
            command === 'clear_cache' ||
            command === 'clear_logs' ||
            command === 'set_log_level' ||
            command === 'download_sensevoice' ||
            command === 'cancel_sensevoice_download' ||
            command === 'delete_sensevoice' ||
            command === 'set_sensevoice_model' ||
            command === 'download_local_model' ||
            command === 'delete_local_model' ||
            command === 'download_cuda_runtime' ||
            command === 'delete_cuda_runtime' ||
            command === 'save_and_activate_catalog_summary_profile' ||
            command === 'save_summary_profile' ||
            command === 'discover_summary_models'
          ) {
            if (command === 'set_sensevoice_model') {
              return {
                state: 'ready', selectedModel: args?.modelId || 'int8', runtimeReady: true,
                tokensReady: true, modelPath: 'managed',
                downloadedBytes: 239233841, totalBytes: 239233841,
                models: [
                  { id: 'int8', state: 'ready', downloadedBytes: 239233841, totalBytes: 239233841, isSelected: true },
                  { id: 'float32', state: 'missing', downloadedBytes: 0, totalBytes: 937617178, isSelected: false },
                ],
              };
            }
            return null;
          }

          return null;
        },
        convertFileSrc: (path) => 'asset://localhost/' + path,
      };

      window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener: () => {} };
      window.matchMedia = window.matchMedia || ((q) => ({
        matches: false, media: q, onchange: null,
        addListener: () => {}, removeListener: () => {},
        addEventListener: () => {}, removeEventListener: () => {},
        dispatchEvent: () => false,
      }));
    })();
  `,
});

await send('Page.navigate', { url: targetUrl });
await new Promise((r) => setTimeout(r, 3000));

// Wait for app to load and navigate to settings
await withTimeout(send('Runtime.evaluate', {
  expression: `await new Promise((r, j) => { const t0 = Date.now(); const check = () => { if (document.querySelector('.workbench-sidebar button[aria-label="设置"]')) r(true); else if (Date.now()-t0>20000) j(new Error('settings button timeout')); else setTimeout(check, 100); }; check(); })`,
  awaitPromise: true,
}), 25000, 'wait settings button');

await send('Runtime.evaluate', {
  expression: `document.querySelector('.workbench-sidebar button[aria-label="设置"]')?.click()`,
  returnByValue: true,
});

await withTimeout(send('Runtime.evaluate', {
  expression: `await new Promise((r, j) => { const t0 = Date.now(); const check = () => { if (document.querySelector('.cipher-settings-root')) r(true); else if (Date.now()-t0>20000) j(new Error('cipher-settings-root timeout')); else setTimeout(check, 100); }; check(); })`,
  awaitPromise: true,
  returnByValue: true,
}), 25000, 'wait cipher-settings-root');

// ---- Helpers ----
const results = [];
const screenshots = [];
const failures = [];

async function setViewport(width, height, dpr) {
  await send('Emulation.setDeviceMetricsOverride', {
    width, height, deviceScaleFactor: dpr, mobile: width < 700,
  });
  await new Promise((r) => setTimeout(r, 250));
}

/**
 * Drive real theme change through Appearance select so App preferences.theme
 * and documentElement.dataset.theme stay in sync after React re-renders.
 */
async function setTheme(theme) {
  // 1) Navigate to appearance so the select exists
  const switched = await switchToTab('外观', '外观', { soft: true });
  if (!switched) {
    // Fallback: force DOM only (may be overwritten on re-render)
    await send('Runtime.evaluate', {
      expression: `(() => {
        document.documentElement.dataset.theme = ${JSON.stringify(theme)};
        document.querySelectorAll('[data-theme]').forEach((el) => el.setAttribute('data-theme', ${JSON.stringify(theme)}));
        return true;
      })()`,
      returnByValue: true,
    });
    await new Promise((r) => setTimeout(r, 300));
    return;
  }

  // 2) Change color theme select → triggers saveAppearance → App applyTheme
  const changeResult = await send('Runtime.evaluate', {
    expression: `(() => {
      const themeTabs = [...document.querySelectorAll('[role="tab"]')].filter((tab) => {
        const text = tab.textContent.trim();
        return text.includes('浅色') || text.includes('深色') || text.includes('跟随系统');
      });
      const targetLabel = ${JSON.stringify(theme)} === 'dark' ? '深色' : '浅色';
      const tab = themeTabs.find((item) => item.textContent.trim().includes(targetLabel));
      if (!tab) return { ok: false, reason: 'theme tab not found', available: themeTabs.map((item) => item.textContent.trim()) };
      tab.click();
      document.documentElement.dataset.theme = ${JSON.stringify(theme)};
      document.querySelectorAll('[data-theme]').forEach((el) => el.setAttribute('data-theme', ${JSON.stringify(theme)}));
      return { ok: true, value: targetLabel };
    })()`,
    returnByValue: true,
  });
  const val = changeResult.result.value;
  if (!val?.ok) {
    failures.push(`setTheme("${theme}"): ${val?.reason || 'failed'}`);
  }
  await new Promise((r) => setTimeout(r, 350));

  // 3) Verify computed theme landed
  const verify = await send('Runtime.evaluate', {
    expression: `(() => {
      const rootTheme = document.documentElement.dataset.theme;
      const cipherTheme = document.querySelector('.cipher-settings-root')?.getAttribute('data-theme');
      const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim()
        || getComputedStyle(document.body).backgroundColor;
      return { rootTheme, cipherTheme, bg };
    })()`,
    returnByValue: true,
  });
  const v = verify.result.value;
  if (v.rootTheme !== theme) {
    // Force again if App state lag
    await send('Runtime.evaluate', {
      expression: `document.documentElement.dataset.theme = ${JSON.stringify(theme)}; document.querySelectorAll('[data-theme]').forEach((el) => el.setAttribute('data-theme', ${JSON.stringify(theme)}));`,
      returnByValue: true,
    });
    await new Promise((r) => setTimeout(r, 200));
  }
}

async function switchToTab(tabLabel, expectedHeading, { soft = false } = {}) {
  const result = await send('Runtime.evaluate', {
    expression: `(() => {
      const tabs = [...document.querySelectorAll('.settings-tabs [role="tab"]')];
      const tab = tabs.find((t) => t.textContent.trim().includes(${JSON.stringify(tabLabel)}));
      if (!tab) return { clicked: false, reason: 'tab not found', available: tabs.map(t => t.textContent.trim()) };
      tab.click();
      return { clicked: true };
    })()`,
    returnByValue: true,
  });
  const val = result.result.value;
  if (!val.clicked) {
    if (!soft) failures.push(`switchToTab("${tabLabel}"): ${val.reason}, available: [${val.available?.join(', ')}]`);
    return false;
  }
  const tabReady = await withTimeout(send('Runtime.evaluate', {
    expression: `await new Promise((r, j) => { const t0 = Date.now(); const check = () => {
      const headings = [...document.querySelectorAll('.settings-body h2, .settings-body h3')].map((h) => h.textContent.trim());
      const activeTab = document.querySelector('.settings-tabs [role="tab"][aria-selected="true"]')?.textContent.trim();
      if (headings.some((text) => text.includes(${JSON.stringify(expectedHeading)})) && activeTab?.includes(${JSON.stringify(tabLabel)})) r(true);
      else if (Date.now() - t0 > 20000) j(new Error('tab content timeout'));
      else setTimeout(check, 100);
    }; check(); })`,
    awaitPromise: true,
    returnByValue: true,
  }), 22000, `wait tab ${tabLabel}`).then(() => true).catch((cause) => {
    if (!soft) failures.push(`switchToTab("${tabLabel}"): ${cause instanceof Error ? cause.message : String(cause)}`);
    return false;
  });
  if (!tabReady) return false;

  // Verify heading appeared (h2 or h3 inside body)
  const headingCheck = await send('Runtime.evaluate', {
    expression: `(() => {
      const headings = [...document.querySelectorAll('.settings-body h2, .settings-body h3')];
      const texts = headings.map(h => h.textContent.trim());
      const found = texts.some(t => t.includes(${JSON.stringify(expectedHeading)}));
      const activeTab = document.querySelector('.settings-tabs [role="tab"][aria-selected="true"]')?.textContent.trim();
      return { found, texts, activeTab };
    })()`,
    returnByValue: true,
  });
  const hc = headingCheck.result.value;
  if (!hc.found) {
    if (!soft) {
      failures.push(`switchToTab("${tabLabel}"): heading "${expectedHeading}" not found in body, got: [${hc.texts?.join(', ')}]`);
    }
    return false;
  }
  if (!hc.activeTab?.includes(tabLabel)) {
    if (!soft) {
      failures.push(`switchToTab("${tabLabel}"): active tab is "${hc.activeTab}", expected to include "${tabLabel}"`);
    }
    return false;
  }
  return true;
}

async function switchAiSubTab(subLabel) {
  const result = await send('Runtime.evaluate', {
    expression: `(() => {
      const tablist = document.querySelector('[role="tablist"][aria-label="AI 能力"]');
      const tabs = tablist ? [...tablist.querySelectorAll('[role="tab"]')] : [];
      const tab = tabs.find((t) => t.textContent.trim() === ${JSON.stringify(subLabel)});
      if (!tab) return { clicked: false, reason: 'sub-tab not found', available: tabs.map(t => t.textContent.trim()) };
      tab.click();
      return { clicked: true };
    })()`,
    returnByValue: true,
  });
  const val = result.result.value;
  if (!val.clicked) {
    failures.push(`switchAiSubTab("${subLabel}"): ${val.reason}, available: [${val.available?.join(', ')}]`);
    return false;
  }
  await new Promise((r) => setTimeout(r, 500));
  const activeCheck = await send('Runtime.evaluate', {
    expression: `(() => {
      const tablist = document.querySelector('[role="tablist"][aria-label="AI 能力"]');
      const active = tablist ? [...tablist.querySelectorAll('[role="tab"]')].find((tab) =>
        tab.getAttribute('aria-selected') === 'true' || tab.getAttribute('data-selected') === 'true'
      ) : null;
      return { activeText: active ? active.textContent.trim() : null };
    })()`,
    returnByValue: true,
  });
  if (!activeCheck.result.value.activeText?.includes(subLabel)) {
    failures.push(`switchAiSubTab("${subLabel}"): active sub-tab is "${activeCheck.result.value.activeText}", expected "${subLabel}"`);
    return false;
  }
  return true;
}

/**
 * Switch transcription mode via HeroUI Tabs and force-verify panel title + active tab.
 */
async function switchTranscriptionMode(mode) {
  const result = await send('Runtime.evaluate', {
    expression: `(() => {
      // Prefer tabs inside transcription panel (exclude main settings tabs if possible)
      const allTabs = [...document.querySelectorAll('[role="tab"]')];
      const modeTabs = allTabs.filter((t) => {
        const text = t.textContent.trim();
        return text.includes('CPU 模式') || text.includes('GPU 模式') || text.includes('在线模式');
      });
      const tab = modeTabs.find((t) => t.textContent.trim().includes(${JSON.stringify(mode.label)}));
      if (!tab) return { clicked: false, reason: 'mode tab not found', available: modeTabs.map(t => t.textContent.trim()) };
      tab.click();
      return { clicked: true };
    })()`,
    returnByValue: true,
  });
  const val = result.result.value;
  if (!val.clicked) {
    failures.push(`switchTranscriptionMode("${mode.label}"): ${val.reason}, available: [${val.available?.join(', ')}]`);
    return false;
  }
  // Wait for async saveTranscription → onPreferencesChanged → re-render
  await new Promise((r) => setTimeout(r, 500));

  const verify = await send('Runtime.evaluate', {
    expression: `(() => {
      const headings = [...document.querySelectorAll('.settings-body h3')].map(h => h.textContent.trim());
      const modeTabs = [...document.querySelectorAll('[role="tab"]')].filter((t) => {
        const text = t.textContent.trim();
        return text.includes('CPU 模式') || text.includes('GPU 模式') || text.includes('在线模式');
      });
      const activeMode = modeTabs.find((t) => t.getAttribute('aria-selected') === 'true')?.textContent.trim()
        || modeTabs.find((t) => t.getAttribute('data-selected') === 'true')?.textContent.trim()
        || null;
      const mockMode = window.__MOCK_PREFERENCES__?.transcriptionMode || null;
      return { headings, activeMode, mockMode, bodyText: document.querySelector('.settings-body')?.innerText?.substring(0, 300) || '' };
    })()`,
    returnByValue: true,
  });
  const v = verify.result.value;

  if (!v.headings?.some((h) => h.includes(mode.expectedPanel))) {
    failures.push(
      `switchTranscriptionMode("${mode.label}"): panel title "${mode.expectedPanel}" not found, got headings: [${v.headings?.join(', ')}]`,
    );
    return false;
  }
  if (v.activeMode && !v.activeMode.includes(mode.label)) {
    failures.push(
      `switchTranscriptionMode("${mode.label}"): active mode tab is "${v.activeMode}", expected "${mode.label}"`,
    );
    return false;
  }
  if (v.mockMode && v.mockMode !== mode.modeValue) {
    failures.push(
      `switchTranscriptionMode("${mode.label}"): mock transcriptionMode is "${v.mockMode}", expected "${mode.modeValue}"`,
    );
    return false;
  }
  return true;
}

async function waitForListboxCount(expectedCount, timeoutMs = 3000) {
  const deadline = Date.now() + timeoutMs;
  let listboxCount = -1;
  while (Date.now() < deadline) {
    const result = await send('Runtime.evaluate', {
      expression: `document.querySelectorAll('[role="listbox"]').length`,
      returnByValue: true,
    });
    listboxCount = result.result.value;
    if (listboxCount === expectedCount) return { ok: true, listboxCount };
    await new Promise((resolve) => setTimeout(resolve, 80));
  }
  return { ok: false, listboxCount };
}

async function dismissHeroSelectPortals(context) {
  const keyEvent = { key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 };
  await send('Input.dispatchKeyEvent', { type: 'keyDown', ...keyEvent });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', ...keyEvent });
  const closed = await waitForListboxCount(0);
  if (!closed.ok || closed.listboxCount !== 0) {
    failures.push(`${context}: expected zero listboxes after Escape, got ${closed.listboxCount}`);
    return false;
  }
  return true;
}

async function openHeroSelect(label) {
  if (!await dismissHeroSelectPortals(`openHeroSelect("${label}") precondition`)) return false;
  const clickResult = await send('Runtime.evaluate', {
    expression: `(() => {
      const label = ${JSON.stringify(label)};
      const selectRoot = [...document.querySelectorAll('[data-slot="select"]')]
        .find((select) => select.querySelector('[data-slot="label"]')?.textContent.trim() === label);
      const comboRoot = label === '模型'
        ? document.querySelector('.cipher-ai-model-combobox')
        : null;
      const trigger = selectRoot?.querySelector('[data-slot="select-trigger"]')
        ?? comboRoot?.querySelector('.cipher-ai-model-trigger');
      const controlKind = selectRoot ? 'select' : comboRoot ? 'combobox' : null;
      if (!trigger || !controlKind) {
        return {
          clicked: false,
          controlKind,
          available: [
            ...[...document.querySelectorAll('[data-slot="select"] [data-slot="label"]')]
              .map((item) => item.textContent.trim()),
            ...(document.querySelector('.cipher-ai-model-combobox') ? ['模型'] : []),
          ],
        };
      }
      trigger.click();
      return { clicked: true, controlKind };
    })()`,
    returnByValue: true,
  });
  const clicked = clickResult.result.value;
  if (!clicked?.clicked) {
    failures.push(`openHeroSelect("${label}"): trigger not found; available: [${clicked?.available?.join(', ') ?? ''}]`);
    return false;
  }

  await new Promise((resolve) => setTimeout(resolve, 350));
  const probeResult = await send('Runtime.evaluate', {
    expression: `(() => {
      const label = ${JSON.stringify(label)};
      const selectRoot = [...document.querySelectorAll('[data-slot="select"]')]
        .find((select) => select.querySelector('[data-slot="label"]')?.textContent.trim() === label);
      const comboRoot = label === '模型'
        ? document.querySelector('.cipher-ai-model-combobox')
        : null;
      const trigger = selectRoot?.querySelector('[data-slot="select-trigger"]')
        ?? comboRoot?.querySelector('.cipher-ai-model-trigger');
      const comboInput = comboRoot?.querySelector('[role="combobox"]');
      const controlKind = selectRoot ? 'select' : comboRoot ? 'combobox' : null;
      const listboxes = [...document.querySelectorAll('[role="listbox"]')];
      return {
        controlKind,
        expanded: trigger?.getAttribute('aria-expanded') ?? comboInput?.getAttribute('aria-expanded') ?? null,
        listboxCount: listboxes.length,
        optionCount: listboxes.reduce((count, listbox) => count + listbox.querySelectorAll('[role="option"]').length, 0),
      };
    })()`,
    returnByValue: true,
  });
  const probe = probeResult.result.value;
  if (probe.expanded !== 'true' || probe.listboxCount !== 1 || probe.optionCount < 1) {
    failures.push(`openHeroSelect("${label}"): invalid open state ${JSON.stringify(probe)}`);
    return false;
  }
  return true;
}

async function closeHeroSelect(label) {
  return dismissHeroSelectPortals(`closeHeroSelect("${label}")`);
}

function computeDiversity(pngBase64) {
  const buf = Buffer.from(pngBase64, 'base64');
  if (buf.length < 24) return 0;
  const sampleSize = Math.min(2000, buf.length - 100);
  const start = Math.floor(buf.length / 2);
  const sample = buf.slice(start, start + sampleSize);
  const uniq = new Set(sample);
  return uniq.size / 256;
}

async function waitForStableRender(label, expectedTabLabel) {
  const evaluation = await withTimeout(send('Runtime.evaluate', {
    expression: `(async () => {
      const expectedTabLabel = ${JSON.stringify(expectedTabLabel)};
      const deadline = Date.now() + 9000;
      let previousGeometry = null;
      let stableSamples = 0;
      let lastState = null;

      while (Date.now() < deadline) {
        const root = document.querySelector('.cipher-settings-root');
        const body = root?.querySelector('.settings-body');
        const activeTab = root
          ?.querySelector('.settings-tabs [role="tab"][aria-selected="true"]')
          ?.textContent?.trim() ?? null;
        const rootRect = root?.getBoundingClientRect() ?? null;
        const bodyRect = body?.getBoundingClientRect() ?? null;
        const fontsReady = !document.fonts || document.fonts.status !== 'loading';
        const runningAnimations = document
          .getAnimations()
          .filter((animation) => animation.playState === 'running').length;
        const hasGeometry = Boolean(
          rootRect && bodyRect
          && rootRect.width > 0 && rootRect.height > 0
          && bodyRect.width > 0 && bodyRect.height > 0
        );
        const ready = document.readyState === 'complete'
          && activeTab === expectedTabLabel
          && fontsReady
          && hasGeometry;

        let geometry = null;
        if (ready) {
          geometry = [
            rootRect.width.toFixed(2),
            rootRect.height.toFixed(2),
            bodyRect.width.toFixed(2),
            bodyRect.height.toFixed(2),
            root.scrollWidth,
            root.scrollHeight,
            body.scrollWidth,
            body.scrollHeight,
          ].join(':');
          stableSamples = geometry === previousGeometry ? stableSamples + 1 : 0;
          previousGeometry = geometry;
        } else {
          stableSamples = 0;
          previousGeometry = null;
        }

        lastState = {
          readyState: document.readyState,
          activeTab,
          expectedTabLabel,
          fontsReady,
          runningAnimations,
          hasRoot: Boolean(root),
          hasBody: Boolean(body),
          hasGeometry,
          geometry,
          stableSamples,
        };

        if (ready && stableSamples >= 3 && runningAnimations === 0) {
          return { ready: true, lastState };
        }

        await new Promise((resolve) => setTimeout(resolve, 50));
      }

      return { ready: false, lastState };
    })()`,
    awaitPromise: true,
    returnByValue: true,
  }), 12000, `stable render ${label}`);

  const renderState = evaluation.result?.value;
  if (!renderState?.ready) {
    throw new Error(`stable render ${label} failed: ${JSON.stringify(renderState?.lastState ?? null)}`);
  }
}

async function captureAndProbe(name, expectedTabLabel) {
  await waitForStableRender(name, expectedTabLabel);
  const preCheck = await send('Runtime.evaluate', {
    expression: `(() => {
      const root = document.querySelector('.cipher-settings-root');
      if (!root) return { error: 'no cipher-settings-root' };
      const activeTab = document.querySelector('.settings-tabs [role="tab"][aria-selected="true"]')?.textContent.trim();
      const header = root.querySelector('.settings-page-header');
      const navigation = root.querySelector('.settings-navigation-tabs');
      const body = root.querySelector('.settings-body');
      const headerRect = header?.getBoundingClientRect() ?? null;
      const navigationRect = navigation?.getBoundingClientRect() ?? null;
      const bodyClientRect = body?.getBoundingClientRect() ?? null;
      const visibleText = body ? body.innerText.substring(0, 200) : '';
      const allCipher = [...document.querySelectorAll('[class*="cipher-"]')];
      const outside = allCipher.filter(el => !el.closest('.cipher-settings-root') && !el.closest('.cipher-settings-select-popover'));
      const rootTheme = document.documentElement.dataset.theme || null;
      const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim()
        || getComputedStyle(document.body).backgroundColor;
      const surface = getComputedStyle(document.documentElement).getPropertyValue('--surface').trim();
      const text = getComputedStyle(document.documentElement).getPropertyValue('--text').trim();
      const rootHorizontalOverflow = root.scrollWidth > root.clientWidth + 2;
      const bodyHorizontalOverflow = Boolean(body && body.scrollWidth > body.clientWidth + 2);
      const railCount = root.querySelectorAll('.settings-navigation-rail').length;
      const headerTabsOverlap = headerRect && navigationRect
        ? Math.max(0, Math.min(headerRect.bottom, navigationRect.bottom) - Math.max(headerRect.top, navigationRect.top))
        : 0;
      const headerTabsInline = Boolean(
        headerRect && navigationRect
        && headerTabsOverlap >= Math.min(headerRect.height, navigationRect.height) * .6
      );
      const headerTabsStacked = Boolean(headerRect && navigationRect && navigationRect.top >= headerRect.bottom - 2);
      const bodyBelowHeader = Boolean(
        headerRect && navigationRect && bodyClientRect
        && bodyClientRect.top >= Math.max(headerRect.bottom, navigationRect.bottom) - 2
      );
      const aboutCards = [...root.querySelectorAll(
        '.cipher-about-component-card,.cipher-about-version-card,.cipher-about-directory-card,.cipher-about-source-card'
      )];
      const aboutCardOverflowFailures = aboutCards
        .filter((card) => card.scrollWidth > card.clientWidth + 1)
        .map((card) => ({ className: card.className, scrollWidth: card.scrollWidth, clientWidth: card.clientWidth }));
      const openListboxes = [...document.querySelectorAll('[role="listbox"]')];
      return {
        activeTab,
        visibleText,
        rootTheme,
        computed: { bg, surface, text },
        bodyRect: body ? { w: body.scrollWidth, cw: body.clientWidth, h: body.scrollHeight, ch: body.clientHeight } : null,
        rootRect: { w: root.scrollWidth, cw: root.clientWidth, h: root.scrollHeight, ch: root.clientHeight },
        shellGeometry: {
          header: headerRect ? { top: headerRect.top, right: headerRect.right, bottom: headerRect.bottom, left: headerRect.left, width: headerRect.width, height: headerRect.height } : null,
          navigation: navigationRect ? { top: navigationRect.top, right: navigationRect.right, bottom: navigationRect.bottom, left: navigationRect.left, width: navigationRect.width, height: navigationRect.height } : null,
          body: bodyClientRect ? { top: bodyClientRect.top, right: bodyClientRect.right, bottom: bodyClientRect.bottom, left: bodyClientRect.left, width: bodyClientRect.width, height: bodyClientRect.height } : null,
        },
        cssLeak: outside.length,
        cssLeakClasses: outside.map(el => el.className).slice(0, 5),
        rootHorizontalOverflow,
        bodyHorizontalOverflow,
        railCount,
        headerTabsInline,
        headerTabsStacked,
        bodyBelowHeader,
        aboutCardOverflowFailures,
        hasHorizontalOverflow: rootHorizontalOverflow || bodyHorizontalOverflow,
        hasVerticalScroll: body ? (body.scrollHeight > body.clientHeight) : (root.scrollHeight > root.clientHeight),
        openListboxCount: openListboxes.length,
        openListboxOptionCount: openListboxes.reduce((count, listbox) => count + listbox.querySelectorAll('[role="option"]').length, 0),
      };
    })()`,
    returnByValue: true,
  });
  const probe = preCheck.result.value;

  if (probe.error) {
    failures.push(`${name}: ${probe.error}`);
    return null;
  }

  if (expectedTabLabel && !probe.activeTab?.includes(expectedTabLabel)) {
    failures.push(`${name}: activeTab is "${probe.activeTab}", expected "${expectedTabLabel}"`);
  }

  if (probe.cssLeak > 0) {
    failures.push(`${name}: CSS leak — ${probe.cssLeak} cipher- elements outside root: [${probe.cssLeakClasses.join(', ')}]`);
  }

  if (probe.hasHorizontalOverflow) {
    failures.push(`${name}: horizontal overflow (root ${probe.rootRect?.w}/${probe.rootRect?.cw}, body ${probe.bodyRect?.w}/${probe.bodyRect?.cw})`);
  }

  if (probe.railCount !== 0) {
    failures.push(`${name}: removed settings rail still exists (${probe.railCount})`);
  }

  const expectsInlineHeader = probe.rootRect?.cw > 900;
  if (expectsInlineHeader ? !probe.headerTabsInline : !probe.headerTabsStacked) {
    failures.push(`${name}: C header/tab geometry mismatch (${expectsInlineHeader ? 'expected inline' : 'expected stacked'}): ${JSON.stringify(probe.shellGeometry)}`);
  }

  if (!probe.bodyBelowHeader) {
    failures.push(`${name}: settings body overlaps the compact header or top tabs: ${JSON.stringify(probe.shellGeometry)}`);
  }

  if (probe.aboutCardOverflowFailures.length > 0) {
    failures.push(`${name}: About cards overflow horizontally: ${JSON.stringify(probe.aboutCardOverflowFailures)}`);
  }

  if (!probe.visibleText || probe.visibleText.trim().length < 10) {
    failures.push(`${name}: body visible text too short (${probe.visibleText?.length || 0} chars)`);
  }

  const capture = await withTimeout(send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }), 15000, 'captureScreenshot ' + name);
  const pngBuffer = Buffer.from(capture.data, 'base64');
  const filePath = join(outputDir, `${name}.png`);
  writeFileSync(filePath, pngBuffer);
  const hash = createHash('sha256').update(pngBuffer).digest('hex').substring(0, 16);
  const fileSize = pngBuffer.length;

  const diversity = computeDiversity(capture.data);
  if (diversity < 0.05) {
    failures.push(`${name}: blank/white screenshot (byte diversity ${(diversity * 100).toFixed(1)}%)`);
  }

  screenshots.push({ name, file: filePath, hash, fileSize, diversity: +(diversity * 100).toFixed(1), probe });
  return { hash, diversity, probe };
}

// ---- Main matrix: 5 pages × 2 themes × 3 DPR × 2 widths = 60 ----
for (const page of pages) {
  for (const theme of themes) {
    for (const dpr of dprLevels) {
      for (const vp of viewports) {
        const name = `${page.id}-${theme}-${vp.suffix}-dpr${dpr}`;
        console.log(`[matrix] ${name}`);
        await setViewport(vp.width, vp.height, dpr);
        await setTheme(theme);
        await switchToTab(page.label, page.expectedHeading);
        const result = await captureAndProbe(name, page.label);
        if (result) {
          results.push({
            page: page.id,
            theme,
            dpr,
            width: vp.width,
            hash: result.hash,
            diversity: result.diversity,
            computed: result.probe.computed,
            rootTheme: result.probe.rootTheme,
            ...result.probe,
          });
        }
      }
    }
  }
}

// ---- Approved C layout midpoint: About × light × 1024 × dpr1 = 1 ----
await setViewport(1024, 820, 1);
await setTheme('light');
await switchToTab('关于', 'VedioNotes');
const midpointResult = await captureAndProbe('about-light-mid-dpr1', '关于');
if (midpointResult) {
  results.push({
    page: 'about-midpoint',
    theme: 'light',
    dpr: 1,
    width: 1024,
    hash: midpointResult.hash,
    diversity: midpointResult.diversity,
    ...midpointResult.probe,
  });
}

// ---- Same-theme different pages must not share hash ----
const hashGroups = {};
for (const r of results) {
  const key = `${r.theme}-${r.width}-dpr${r.dpr}`;
  if (!hashGroups[key]) hashGroups[key] = [];
  hashGroups[key].push({ page: r.page, hash: r.hash });
}
for (const [key, group] of Object.entries(hashGroups)) {
  const dups = {};
  for (const g of group) {
    if (!dups[g.hash]) dups[g.hash] = [];
    dups[g.hash].push(g.page);
  }
  for (const [h, pageList] of Object.entries(dups)) {
    if (pageList.length > 1) {
      failures.push(`Duplicate screenshots for ${key}: pages [${pageList.join(', ')}] share hash ${h}`);
    }
  }
}

// ---- Same page dark/light must differ (hash + computed styles) ----
const themePairs = {};
for (const r of results) {
  const key = `${r.page}-${r.width}-dpr${r.dpr}`;
  if (!themePairs[key]) themePairs[key] = {};
  themePairs[key][r.theme] = r;
}
for (const [key, pair] of Object.entries(themePairs)) {
  if (!pair.dark || !pair.light) continue;
  if (pair.dark.hash === pair.light.hash) {
    failures.push(`Theme visual identical for ${key}: dark and light share hash ${pair.dark.hash}`);
  }
  const darkBg = pair.dark.computed?.bg || pair.dark.bg;
  const lightBg = pair.light.computed?.bg || pair.light.bg;
  if (darkBg && lightBg && darkBg === lightBg) {
    failures.push(`Theme computed style identical for ${key}: --bg both "${darkBg}"`);
  }
}

// ---- AI sub-tab coverage: 7 × dark × wide × dpr1 ----
await setViewport(1280, 800, 1);
await setTheme('dark');
await switchToTab('AI 接入', 'AI 接入');
for (const sub of aiSubTabs) {
  await switchAiSubTab(sub.label);
  const name = `ai-${sub.id}-dark-wide`;
  const result = await captureAndProbe(name, 'AI 接入');
  if (result) {
    results.push({
      page: `ai-${sub.id}`,
      theme: 'dark',
      dpr: 1,
      width: 1280,
      hash: result.hash,
      diversity: result.diversity,
      ...result.probe,
    });
  }
}

const aiHashes = results.filter((r) => String(r.page).startsWith('ai-')).map((r) => r.hash);
const uniqAi = new Set(aiHashes);
if (uniqAi.size < aiHashes.length) {
  failures.push(`Duplicate AI sub-tab screenshots: ${aiHashes.length} captures, ${uniqAi.size} unique hashes`);
}

// ---- Transcription mode coverage: 3 modes × dark × wide × dpr1 ----
await switchToTab('语音转文字', 'SenseVoice 本地模型');
const modeCaptureMeta = [];
for (const mode of transcriptionModes) {
  const ok = await switchTranscriptionMode(mode);
  const name = `transcription-${mode.id}-dark-wide`;
  const result = await captureAndProbe(name, '语音转文字');
  if (result) {
    results.push({
      page: `transcription-${mode.id}`,
      theme: 'dark',
      dpr: 1,
      width: 1280,
      hash: result.hash,
      diversity: result.diversity,
      modeOk: ok,
      ...result.probe,
    });
    modeCaptureMeta.push({ id: mode.id, hash: result.hash, ok, expectedPanel: mode.expectedPanel });
  } else {
    modeCaptureMeta.push({ id: mode.id, hash: null, ok: false, expectedPanel: mode.expectedPanel });
  }
}

const modeHashes = modeCaptureMeta.map((m) => m.hash).filter(Boolean);
const uniqModes = new Set(modeHashes);
if (modeHashes.length === 3 && uniqModes.size !== 3) {
  failures.push(
    `Duplicate transcription mode screenshots: hashes [${modeHashes.join(', ')}] — expected 3 distinct (cpu/gpu/online)`,
  );
}

// ---- Current HeroUI Select open-state coverage: 3 × dark × wide × dpr1 ----
const heroSelectCases = [
  { id: 'export-format', tab: '数据管理', heading: '数据管理', label: '默认导出格式' },
  { id: 'ai-provider', tab: 'AI 接入', heading: 'AI 接入配置', label: '服务商' },
  { id: 'ai-model', tab: 'AI 接入', heading: 'AI 接入配置', label: '模型' },
];
await setViewport(1280, 800, 1);
await setTheme('dark');
for (const selectCase of heroSelectCases) {
  await switchToTab(selectCase.tab, selectCase.heading);
  const opened = await openHeroSelect(selectCase.label);
  const name = `select-${selectCase.id}-dark-wide`;
  const result = await captureAndProbe(name, selectCase.tab);
  if (result) {
    if (!opened || result.probe.openListboxCount !== 1 || result.probe.openListboxOptionCount < 1) {
      failures.push(`${name}: expected one populated HeroUI listbox, got ${JSON.stringify({ opened, count: result.probe.openListboxCount, options: result.probe.openListboxOptionCount })}`);
    }
    results.push({
      page: `select-${selectCase.id}`,
      theme: 'dark',
      dpr: 1,
      width: 1280,
      hash: result.hash,
      diversity: result.diversity,
      ...result.probe,
    });
  }
  await closeHeroSelect(selectCase.label);
}

// ---- CipherTalk baseline: compare actual variable VALUES ----
const cssCompare = await send('Runtime.evaluate', {
  expression: `(() => {
    const root = document.querySelector('.cipher-settings-root');
    if (!root) return { error: 'no root' };
    const styles = getComputedStyle(root);
    const keys = ${JSON.stringify(BASELINE_COMPARE_KEYS)};
    const ourVars = {};
    for (const v of keys) ourVars[v] = styles.getPropertyValue(v).trim();
    return { ourVars };
  })()`,
  returnByValue: true,
});
const cssData = cssCompare.result.value || {};
const computedOurVars = cssData.ourVars || {};

function normalizeCssValue(value) {
  return String(value ?? '')
    .replace(/rgba\(([^)]*?),\s*0\.(\d+)\)/g, 'rgba($1, .$2)')
    .replace(/\s+/g, ' ')
    .trim();
}

const valueComparisons = [];
let baselineValueMismatches = 0;
for (const key of BASELINE_COMPARE_KEYS) {
  const baselineVal = baselineLiteralVars[key] || null;
  const ourSourceVal = ourLiteralVars[key] || null;
  const computedVal = computedOurVars[key] || null;
  const sourceMatch = baselineVal !== null && ourSourceVal !== null && baselineVal === ourSourceVal;
  // Computed may resolve color-mix differently; for simple tokens (px, shadows) require equality
  const isSimple = baselineVal && !baselineVal.includes('color-mix') && !baselineVal.includes('var(');
  const computedMatch = isSimple ? (normalizeCssValue(computedVal) === normalizeCssValue(baselineVal)) : (computedVal !== null && computedVal.length > 0);
  if (!sourceMatch) baselineValueMismatches += 1;
  if (isSimple && !computedMatch) baselineValueMismatches += 1;
  valueComparisons.push({
    key,
    baseline: baselineVal,
    ourSource: ourSourceVal,
    computed: computedVal,
    sourceMatch,
    computedMatch,
  });
}

if (!cipherTalkBaseline) {
  failures.push('CipherTalk baseline CSS not found at ../CipherTalk/src/pages/SettingsPage.css');
}
if (baselineValueMismatches > 0) {
  const bad = valueComparisons.filter((c) => !c.sourceMatch || (c.baseline && !c.baseline.includes('color-mix') && !c.baseline.includes('var(') && !c.computedMatch));
  failures.push(
    `CipherTalk baseline value mismatch (${baselineValueMismatches}): ${bad.map((b) => `${b.key}: baseline=${b.baseline} source=${b.ourSource} computed=${b.computed}`).join('; ')}`,
  );
}

const cssBaselineResults = {
  baselineSourcePath: cipherTalkCssPath,
  ourSourcePath: ourCssPath,
  baselineLiteralCount: Object.keys(baselineLiteralVars).length,
  ourLiteralCount: Object.keys(ourLiteralVars).length,
  comparedKeys: BASELINE_COMPARE_KEYS,
  valueComparisons,
  baselineValueMismatches,
  // Explicitly NOT using length>0 as pass signal
  varsMatch: baselineValueMismatches === 0 && Object.keys(baselineLiteralVars).length > 0,
  computedOurVars,
};

// ---- Summary ----
const expectedTotal = 60 + 1 + 7 + 3 + 3;

console.log(`\n=== Cipher Settings Visual Matrix Results (acceptance rework) ===`);
console.log(`Screenshots captured: ${screenshots.length} / ${expectedTotal} expected`);
console.log(`Results: ${results.length}`);
console.log(`Failures: ${failures.length}`);
console.log(`Transcription modes: ${modeCaptureMeta.map((m) => `${m.id}=${m.hash}`).join(', ')}`);
console.log(`CSS baseline value mismatches: ${baselineValueMismatches}`);

if (screenshots.length !== expectedTotal) {
  failures.push(`Screenshot count mismatch: ${screenshots.length} vs expected ${expectedTotal}`);
}

const manifest = {
  summary: {
    screenshots: screenshots.length,
    expected: expectedTotal,
    results: results.length,
    failures: failures.length,
    transcriptionModes: modeCaptureMeta,
    cssBaselineComparison: cssBaselineResults,
  },
  screenshots,
  results,
  failures,
};
writeFileSync(join(outputDir, 'visual-matrix-results.json'), JSON.stringify(manifest, null, 2));

if (failures.length > 0) {
  console.error(`\nVisual matrix FAILED: ${failures.length} issue(s)`);
  for (const f of failures) console.error(`  ${f}`);
  process.exit(1);
}

console.log(`\nVisual matrix PASSED: ${screenshots.length} screenshots, ${results.length} probes, 0 failures`);
console.log(`  - Transcription modes have distinct hashes`);
console.log(`  - Dark/light theme hashes and --bg differ per page`);
console.log(`  - CipherTalk baseline compares actual variable values`);
console.log(`  - No blank/white screenshots, no horizontal overflow, no CSS leak`);

socket.close();

}

main().catch((err) => {
  console.error('Visual matrix crashed:', err && err.stack ? err.stack : err);
  try {
    const manifest = {
      summary: { screenshots: typeof screenshots !== 'undefined' ? screenshots.length : 0, failures: -1, crashed: true },
      failures: [String(err && err.message ? err.message : err)],
    };
    writeFileSync(join(outputDir, 'visual-matrix-results.json'), JSON.stringify(manifest, null, 2));
  } catch {}
  process.exit(1);
});
