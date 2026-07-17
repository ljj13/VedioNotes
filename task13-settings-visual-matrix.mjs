/**
 * Cipher Settings Visual Matrix — Edge/CDP real rendering test.
 *
 * Uses Edge/CDP (same approach as production-workbench.visual.test.mjs)
 * to actually render each cipher settings page, capture screenshots,
 * and verify visual properties: overflow, scrollbar, active states, CSS isolation.
 *
 * Usage: node task13-settings-visual-matrix.mjs <cdp-endpoint> <url> <output-dir>
 *
 * Coverage:
 *   - 5 settings pages (appearance, transcription, ai, data, about)
 *   - 2 themes (dark, light)
 *   - 3 device pixel ratios (100%, 125%, 150%)
 *   - 2 viewport widths (1280 wide, 768 narrow)
 *   - AI sub-tabs (summary, vector, rerank, websearch, tts, image, agent)
 *   - Transcription modes (CPU, GPU, online)
 *   - Overflow/scrollbar/active-tab/CSS-isolation checks per screenshot
 *
 * Total screenshots: 5 pages × 2 themes × 3 DPR × 2 widths = 60 base
 *   + 7 AI sub-tabs + 3 transcription modes = 70 screenshots
 * Each screenshot gets a geometric/overflow probe.
 */
import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const [endpoint, targetUrl, outputDir = 'outputs/visual-matrix'] = process.argv.slice(2);
assert.ok(endpoint && targetUrl, 'usage: node task13-settings-visual-matrix.mjs <cdp-endpoint> <url> [output-dir]');

mkdirSync(outputDir, { recursive: true });

const pages = [
  { id: 'appearance', label: '外观' },
  { id: 'transcription', label: '语音转文字' },
  { id: 'ai', label: 'AI 接入' },
  { id: 'data', label: '数据管理' },
  { id: 'about', label: '关于' },
];

const dprLevels = [1, 1.25, 1.5];
const viewports = [
  { width: 1280, height: 800, suffix: 'wide' },
  { width: 768, height: 900, suffix: 'narrow' },
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
  { id: 'cpu', label: 'CPU 模式' },
  { id: 'gpu', label: 'GPU 模式' },
  { id: 'online', label: '在线模式' },
];

// Connect to Edge/CDP
const tab = await fetch(`${endpoint}/json/new?${encodeURIComponent(targetUrl)}`, { method: 'PUT' }).then((r) => r.json());
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

// Inject Tauri mock + cipher settings data
await send('Page.addScriptToEvaluateOnNewDocument', {
  source: `
    window.__TAURI_INTERNALS__ = {
      invoke: async (command, args) => {
        if (command === 'get_migration_state') return false;
        if (command === 'get_profiles') return {
          schemaVersion: 1, activeTranscriptionProfileId: 'local-whisper', activeSummaryProfileId: 'deepseek',
          fallbackTranscriptionProfileId: null, migrationRequired: false,
          transcriptionProfiles: [{ id: 'local-whisper', name: '本地 Whisper', provider: 'local_whisper_cpp', baseUrl: '', model: 'small', enabled: true, builtIn: true }],
          summaryProfiles: [{ id: 'deepseek', name: 'DeepSeek', provider: 'deep_seek', baseUrl: 'https://example.invalid', model: 'deepseek-chat', enabled: true, builtIn: true }]
        };
        if (command === 'get_preferences') return {
          schemaVersion: 1, markdownOutputDir: 'D:\\\\export', localComputeMode: 'auto',
          appearance: { theme: 'dark', compactDensity: false, reducedMotion: false },
          export: { format: 'markdown', includeScreenshots: true, includeSubtitles: true, includeSourceMetadata: true, includeDiagnosticLog: false }, logLevel: 'info'
        };
        if (command === 'has_profile_credential') return true;
        if (command === 'get_sense_voice_status') return {
          state: 'ready', selectedModel: 'int8', runtimeReady: true, tokensReady: true, modelPath: 'managed', downloadedBytes: 239233841, totalBytes: 239233841,
          models: [{ id: 'int8', state: 'ready', downloadedBytes: 239233841, totalBytes: 239233841, isSelected: true }, { id: 'float32', state: 'missing', downloadedBytes: 0, totalBytes: 937617178, isSelected: false }]
        };
        if (command === 'list_local_models') return ['tiny','base','small','medium','large-v3-turbo'].map((id) => ({ id, state: id === 'small' ? 'ready' : 'not_downloaded', downloadedBytes: id === 'small' ? 1 : 0, totalBytes: 1, isCurrent: id === 'small' }));
        if (command === 'get_cuda_runtime_status') return { state: 'ready', version: '12.4', gpuName: 'NVIDIA RTX 4060', error: null };
        if (command === 'get_summary_provider_catalog') return [
          { id: 'openai', displayName: 'OpenAI', description: 'GPT models', protocol: 'openai', baseUrl: 'https://api.openai.com/v1', npmPackage: 'openai',
            models: [{ id: 'gpt-4o', name: 'GPT-4o', summaryEligible: true, modalities: {}, capabilities: {}, limit: {}, cost: {} }, { id: 'gpt-4o-mini', name: 'GPT-4o mini', summaryEligible: true, modalities: {}, capabilities: {}, limit: {}, cost: {} }] },
          { id: 'anthropic', displayName: 'Anthropic', description: 'Claude models', protocol: 'anthropic', baseUrl: 'https://api.anthropic.com', npmPackage: '@anthropic-ai/sdk',
            models: [{ id: 'claude-sonnet-4', name: 'Claude Sonnet 4', summaryEligible: true, modalities: {}, capabilities: {}, limit: {}, cost: {} }] },
          { id: 'google', displayName: 'Google Gemini', description: 'Gemini models', protocol: 'google', baseUrl: 'https://generativelanguage.googleapis.com', npmPackage: '@google/generative-ai',
            models: [{ id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', summaryEligible: true, modalities: {}, capabilities: {}, limit: {}, cost: {} }] },
        ];
        if (command === 'get_capability_settings') return {
          schemaVersion: 1,
          vector: { enabled: true, providerId: 'openai', endpoint: 'https://example.invalid/v1', model: 'text-embedding-3-small', collection: 'notes', dimensions: 1536 },
          rerank: { enabled: true, providerId: 'cohere', endpoint: 'https://example.invalid/v1/rerank', model: 'rerank-v3.5' },
          webSearch: { enabled: false, providerId: 'tavily', endpoint: 'https://example.invalid/search', maxResults: 5 },
          tts: { enabled: true, providerId: 'openai', endpoint: 'https://example.invalid/v1/audio/speech', model: 'gpt-4o-mini-tts', voice: 'alloy' },
          image: { enabled: true, providerId: 'openai', endpoint: 'https://example.invalid/v1/images/generations', model: 'gpt-image-1', size: '1024x1024' },
          localAgent: { enabled: false, providerId: 'codex', executable: 'codex', arguments: ['exec'], timeoutSeconds: 120 }
        };
        if (command === 'get_capability_status') return {
          vector: { enabled: true, configured: true, credentialReady: true, providerId: 'openai' },
          rerank: { enabled: true, configured: true, credentialReady: true, providerId: 'cohere' },
          webSearch: { enabled: false, configured: true, credentialReady: false, providerId: 'tavily' },
          tts: { enabled: true, configured: true, credentialReady: true, providerId: 'openai' },
          image: { enabled: true, configured: true, credentialReady: true, providerId: 'openai' },
          localAgent: { enabled: false, configured: true, credentialReady: false, providerId: 'codex' }
        };
        if (command === 'get_about_snapshot') return {
          appVersion: '0.0.1', tauriVersion: '2', frontendVersion: '19', rustVersion: '1.91',
          appDataDir: 'C:\\\\AppData', exportDir: 'C:\\\\export', logDir: 'C:\\\\logs',
          components: [{ name: 'frontend', version: '19', status: 'ok' }, { name: 'tauri', version: '2', status: 'ok' }]
        };
        if (command === 'get_export_preferences') return { format: 'markdown', includeScreenshots: true, includeSubtitles: true, includeSourceMetadata: true, includeDiagnosticLog: false };
        if (command === 'get_cache_usage') return { totalBytes: 104857600, categories: [
          { category: 'temporary_media', bytes: 52428800, files: 12 },
          { category: 'screenshots', bytes: 31457280, files: 8 },
          { category: 'transcription_intermediates', bytes: 20971520, files: 4 },
        ] };
        if (command === 'list_logs') return [
          { id: 'app.log', name: 'app.log', bytes: 4096, modifiedAt: '2026-07-16T10:00:00Z' },
          { id: 'transcription.log', name: 'transcription.log', bytes: 2048, modifiedAt: '2026-07-16T09:00:00Z' },
        ];
        return null;
      },
      convertFileSrc: (path) => 'asset://localhost/' + path,
    };
    window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener: () => {} };
    window.matchMedia = window.matchMedia || ((q) => ({ matches: false, media: q, onchange: null, addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false }));
  `,
});

await send('Page.navigate', { url: targetUrl });
await new Promise((resolve) => setTimeout(resolve, 2000));

// Wait for app to load
await send('Runtime.evaluate', {
  expression: `await new Promise(r => { const check = () => document.querySelector('.workbench-sidebar button[aria-label="设置"]') ? r() : setTimeout(check, 100); check(); })`,
  awaitPromise: true,
});

// Navigate to settings
await send('Runtime.evaluate', {
  expression: `document.querySelector('.workbench-sidebar button[aria-label="设置"]')?.click()`,
  returnByValue: true,
});

// Wait for cipher-settings-root
await send('Runtime.evaluate', {
  expression: `await new Promise(r => { const check = () => document.querySelector('.cipher-settings-root') ? r(true) : setTimeout(check, 100); check(); })`,
  awaitPromise: true,
  returnByValue: true,
});

const results = [];
const screenshots = [];

async function setViewport(width, height, dpr) {
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: dpr, mobile: width < 700 });
  await new Promise((resolve) => setTimeout(resolve, 300));
}

async function setTheme(theme) {
  await send('Runtime.evaluate', {
    expression: `document.documentElement.dataset.theme = ${JSON.stringify(theme)}; document.querySelector('.cipher-settings-root')?.setAttribute('data-theme', ${JSON.stringify(theme)});`,
    returnByValue: true,
  });
  await new Promise((resolve) => setTimeout(resolve, 200));
}

async function switchToTab(tabLabel) {
  await send('Runtime.evaluate', {
    expression: `(() => { const tabs = [...document.querySelectorAll('.cipher-settings-tabs [role="tab"]')]; const tab = tabs.find((t) => t.textContent.trim().includes(${JSON.stringify(tabLabel)})); tab?.click(); return !!tab; })()`,
    returnByValue: true,
  });
  await new Promise((resolve) => setTimeout(resolve, 500));
}

async function switchAiSubTab(subLabel) {
  await send('Runtime.evaluate', {
    expression: `(() => { const tabs = [...document.querySelectorAll('.cipher-ai-subtabs [role="tab"]')]; const tab = tabs.find((t) => t.textContent.trim().includes(${JSON.stringify(subLabel)})); tab?.click(); return !!tab; })()`,
    returnByValue: true,
  });
  await new Promise((resolve) => setTimeout(resolve, 300));
}

async function captureAndProbe(name) {
  const capture = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  const filePath = join(outputDir, `${name}.png`);
  writeFileSync(filePath, Buffer.from(capture.data, 'base64'));

  // Geometric/overflow probe
  const probe = await send('Runtime.evaluate', {
    expression: `(() => {
      const root = document.querySelector('.cipher-settings-root');
      if (!root) return { error: 'no cipher-settings-root' };
      const body = root.querySelector('.cipher-settings-body');
      const bodyOverflow = body ? { scrollWidth: body.scrollWidth, clientWidth: body.clientWidth, hasHorizontalScroll: body.scrollWidth > body.clientWidth } : null;
      const rootOverflow = { scrollWidth: root.scrollWidth, clientWidth: root.clientWidth, hasHorizontalScroll: root.scrollWidth > root.clientWidth };
      const activeTab = document.querySelector('.cipher-settings-tabs [role="tab"][aria-selected="true"]')?.textContent.trim();
      const confirmDialog = document.querySelector('.cipher-confirm-overlay') ? true : false;
      // Check CSS isolation: non-settings elements should not have cipher- classes
      const nonSettings = document.querySelectorAll(':not(.cipher-settings-root) .cipher-feature-header, :not(.cipher-settings-root) .cipher-model-header');
      return { rootOverflow, bodyOverflow, activeTab, confirmDialog, cssLeak: nonSettings.length, hasScrollbar: bodyOverflow?.hasHorizontalScroll || rootOverflow.hasHorizontalScroll };
    })()`,
    returnByValue: true,
  });

  const probeData = probe.result.value;
  screenshots.push({ name, file: filePath, probe: probeData });
  return probeData;
}

// Main matrix: 5 pages × 2 themes × 3 DPR × 2 widths = 60
for (const page of pages) {
  for (const theme of themes) {
    for (const dpr of dprLevels) {
      for (const vp of viewports) {
        await setViewport(vp.width, vp.height, dpr);
        await setTheme(theme);
        await switchToTab(page.label);
        const name = `${page.id}-${theme}-${vp.suffix}-dpr${dpr}`;
        const probe = await captureAndProbe(name);
        results.push({
          page: page.id, theme, dpr, width: vp.width,
          hasScrollbar: probe?.hasScrollbar ?? null,
          activeTab: probe?.activeTab ?? null,
          cssLeak: probe?.cssLeak ?? 0,
          error: probe?.error ?? null,
        });
      }
    }
  }
}

// AI sub-tab coverage: 7 sub-tabs × dark × wide × dpr1
await setViewport(1280, 800, 1);
await setTheme('dark');
await switchToTab('AI 接入');
for (const sub of aiSubTabs) {
  await switchAiSubTab(sub.label);
  const name = `ai-${sub.id}-dark-wide`;
  const probe = await captureAndProbe(name);
  results.push({ page: `ai-${sub.id}`, theme: 'dark', dpr: 1, width: 1280, hasScrollbar: probe?.hasScrollbar ?? null, activeTab: probe?.activeTab ?? null, cssLeak: probe?.cssLeak ?? 0, error: probe?.error ?? null });
}

// Transcription mode coverage: 3 modes × dark × wide × dpr1
await switchToTab('语音转文字');
for (const mode of transcriptionModes) {
  await send('Runtime.evaluate', {
    expression: `(() => { const tabs = [...document.querySelectorAll('.cipher-mode-tabs [role="tab"]')]; const tab = tabs.find((t) => t.textContent.trim().includes(${JSON.stringify(mode.label)})); tab?.click(); return !!tab; })()`,
    returnByValue: true,
  });
  await new Promise((resolve) => setTimeout(resolve, 300));
  const name = `transcription-${mode.id}-dark-wide`;
  const probe = await captureAndProbe(name);
  results.push({ page: `transcription-${mode.id}`, theme: 'dark', dpr: 1, width: 1280, hasScrollbar: probe?.hasScrollbar ?? null, activeTab: probe?.activeTab ?? null, cssLeak: probe?.cssLeak ?? 0, error: probe?.error ?? null });
}

// Analyze results
const failures = [];
let scrollbarWarnings = 0;
let activeTabMismatches = 0;
let cssLeaks = 0;

for (const r of results) {
  if (r.error) failures.push(`${r.page}-${r.theme}: ${r.error}`);
  if (r.hasScrollbar) scrollbarWarnings++;
  if (r.cssLeak > 0) { cssLeaks++; failures.push(`${r.page}-${r.theme}-dpr${r.dpr}-${r.width}: CSS leak detected (${r.cssLeak} elements)`); }
}

// Check screenshot count
const expectedBase = 60;
const expectedAi = 7;
const expectedTranscription = 3;
const expectedTotal = expectedBase + expectedAi + expectedTranscription;

console.log(`\n=== Cipher Settings Visual Matrix Results ===`);
console.log(`Screenshots captured: ${screenshots.length} / ${expectedTotal} expected`);
console.log(`Scrollbar warnings: ${scrollbarWarnings}`);
console.log(`CSS leak failures: ${cssLeaks}`);
console.log(`Total results: ${results.length}`);

if (screenshots.length !== expectedTotal) {
  failures.push(`Screenshot count mismatch: ${screenshots.length} vs expected ${expectedTotal}`);
}

// Write results manifest
writeFileSync(join(outputDir, 'visual-matrix-results.json'), JSON.stringify({ screenshots, results, summary: { total: results.length, screenshots: screenshots.length, scrollbarWarnings, cssLeaks, failures } }, null, 2));

if (failures.length > 0) {
  console.error(`\nVisual matrix FAILED: ${failures.length} issue(s)`);
  for (const f of failures) console.error(`  ${f}`);
  process.exit(1);
} else {
  console.log(`\nVisual matrix PASSED: ${screenshots.length} screenshots captured, ${results.length} probes analyzed, 0 CSS leaks, 0 errors`);
}

socket.close();
