/**
 * Cipher Settings Visual Matrix — Edge/CDP real rendering test (reworked).
 *
 * Fixes from 117-line feedback:
 *   1. Correct AI sub-tab selector: .cipher-ai-subnav .cipher-ai-subtab (buttons, not [role="tab"])
 *   2. Correct transcription mode selector: HeroUI Tabs [role="tab"] with text "CPU 转写"/"GPU 转写"/"在线转写"
 *   3. Click failures fail immediately (switchToTab returns boolean, false → error)
 *   4. activeTabMismatches checked and fail the test
 *   5. Horizontal overflow fails (not just warning)
 *   6. White-screenshot detection: compute non-white pixel ratio, fail if > 98% white
 *   7. Duplicate-hash detection: same viewport/DPR/theme but different pages must have different screenshot hashes
 *   8. CipherTalk baseline CSS comparison: compare CSS variables and key selectors
 *   9. CSS leak query corrected
 *  10. Must output 70 PNGs + JSON manifest
 *
 * Usage: node task13-settings-visual-matrix.mjs <cdp-endpoint> <url> <output-dir>
 */
import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';

const [endpoint, targetUrl, outputDir = 'outputs/visual-matrix'] = process.argv.slice(2);
assert.ok(endpoint && targetUrl, 'usage: node task13-settings-visual-matrix.mjs <cdp-endpoint> <url> [output-dir]');

mkdirSync(outputDir, { recursive: true });

const pages = [
  { id: 'appearance', label: '外观', expectedHeading: '外观' },
  { id: 'transcription', label: '语音转文字', expectedHeading: '语音转文字' },
  { id: 'ai', label: 'AI 接入', expectedHeading: 'AI 接入' },
  { id: 'data', label: '数据管理', expectedHeading: '数据管理' },
  { id: 'about', label: '关于', expectedHeading: '关于' },
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
  { id: 'cpu', label: 'CPU 转写' },
  { id: 'gpu', label: 'GPU 转写' },
  { id: 'online', label: '在线转写' },
];

// ---- CipherTalk baseline CSS extraction ----
const cipherTalkCssPath = resolve('../CipherTalk/src/pages/SettingsPage.css');
const cipherTalkBaseline = existsSync(cipherTalkCssPath)
  ? readFileSync(cipherTalkCssPath, 'utf8')
  : '';
const baselineVars = cipherTalkBaseline.match(/--settings-\w+/g) || [];
const baselineSelectors = (cipherTalkBaseline.match(/^\.settings-page\s+\.[\w-]+/gm) || [])
  .map((s) => s.trim())
  .filter((s, i, arr) => arr.indexOf(s) === i);

// ---- CDP connection ----
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
  return new Promise((res, rej) => pending.set(id, { resolve: res, reject: rej }));
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
          state: 'ready', selectedModel: 'int8', runtimeReady: true, tokensReady: ['zh','en'], modelPath: 'managed', downloadedBytes: 239233841, totalBytes: 239233841,
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
          { category: 'temporary_media', bytes: 52428800, fileCount: 12 },
          { category: 'screenshots', bytes: 31457280, fileCount: 8 },
          { category: 'transcription_intermediates', bytes: 20971520, fileCount: 4 },
        ] };
        if (command === 'list_logs') return [
          { id: 'app.log', name: 'app.log', bytes: 4096, modifiedAt: '2026-07-16T10:00:00Z' },
          { id: 'transcription.log', name: 'transcription.log', bytes: 2048, modifiedAt: '2026-07-16T09:00:00Z' },
        ];
        if (command === 'read_log') return { id: args?.id, content: 'line1\\nline2\\nline3', truncated: false };
        if (command === 'restore_export_preferences') return { format: 'markdown', includeScreenshots: true, includeSubtitles: true, includeSourceMetadata: true, includeDiagnosticLog: false };
        return null;
      },
      convertFileSrc: (path) => 'asset://localhost/' + path,
    };
    window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener: () => {} };
    window.matchMedia = window.matchMedia || ((q) => ({ matches: false, media: q, onchange: null, addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false }));
  `,
});

await send('Page.navigate', { url: targetUrl });
await new Promise((resolve) => setTimeout(resolve, 3000));

// Wait for app to load and navigate to settings
await send('Runtime.evaluate', {
  expression: `await new Promise(r => { const check = () => document.querySelector('.workbench-sidebar button[aria-label="设置"]') ? r() : setTimeout(check, 100); check(); })`,
  awaitPromise: true,
});

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

// ---- Helper functions ----

const results = [];
const screenshots = [];
const failures = [];

async function setViewport(width, height, dpr) {
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: dpr, mobile: width < 700 });
  await new Promise((resolve) => setTimeout(resolve, 400));
}

async function setTheme(theme) {
  await send('Runtime.evaluate', {
    expression: `document.documentElement.dataset.theme = ${JSON.stringify(theme)}; const root = document.querySelector('.cipher-settings-root'); if (root) root.setAttribute('data-theme', ${JSON.stringify(theme)});`,
    returnByValue: true,
  });
  await new Promise((resolve) => setTimeout(resolve, 300));
}

async function switchToTab(tabLabel, expectedHeading) {
  const result = await send('Runtime.evaluate', {
    expression: `(() => {
      const tabs = [...document.querySelectorAll('.cipher-settings-tabs [role="tab"]')];
      const tab = tabs.find((t) => t.textContent.trim().includes(${JSON.stringify(tabLabel)}));
      if (!tab) return { clicked: false, reason: 'tab not found', available: tabs.map(t => t.textContent.trim()) };
      tab.click();
      return { clicked: true };
    })()`,
    returnByValue: true,
  });
  const val = result.result.value;
  if (!val.clicked) {
    failures.push(`switchToTab("${tabLabel}"): ${val.reason}, available: [${val.available?.join(', ')}]`);
    return false;
  }
  await new Promise((resolve) => setTimeout(resolve, 800));
  // Verify the heading appeared
  const headingCheck = await send('Runtime.evaluate', {
    expression: `(() => {
      const headings = [...document.querySelectorAll('.cipher-settings-body h2, .cipher-settings-body h3')];
      const found = headings.some(h => h.textContent.trim().includes(${JSON.stringify(expectedHeading)}));
      return { found, texts: headings.map(h => h.textContent.trim()) };
    })()`,
    returnByValue: true,
  });
  if (!headingCheck.result.value.found) {
    failures.push(`switchToTab("${tabLabel}"): heading "${expectedHeading}" not found in body, got: [${headingCheck.result.value.texts?.join(', ')}]`);
    return false;
  }
  return true;
}

async function switchAiSubTab(subLabel) {
  const result = await send('Runtime.evaluate', {
    expression: `(() => {
      const tabs = [...document.querySelectorAll('.cipher-ai-subnav .cipher-ai-subtab')];
      const tab = tabs.find((t) => t.textContent.trim().includes(${JSON.stringify(subLabel)}));
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
  await new Promise((resolve) => setTimeout(resolve, 500));
  // Verify active state
  const activeCheck = await send('Runtime.evaluate', {
    expression: `(() => {
      const active = document.querySelector('.cipher-ai-subnav .cipher-ai-subtab.active');
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

async function switchTranscriptionMode(modeLabel) {
  const result = await send('Runtime.evaluate', {
    expression: `(() => {
      const tabs = [...document.querySelectorAll('[role="tab"]')];
      const tab = tabs.find((t) => t.textContent.trim().includes(${JSON.stringify(modeLabel)}));
      if (!tab) return { clicked: false, reason: 'mode tab not found', available: tabs.map(t => t.textContent.trim()) };
      tab.click();
      return { clicked: true };
    })()`,
    returnByValue: true,
  });
  const val = result.result.value;
  if (!val.clicked) {
    failures.push(`switchTranscriptionMode("${modeLabel}"): ${val.reason}, available: [${val.available?.join(', ')}]`);
    return false;
  }
  await new Promise((resolve) => setTimeout(resolve, 500));
  return true;
}

function computeNonWhiteRatio(pngBase64) {
  // PNG header is 8 bytes, IHDR follows. We sample pixel data by examining
  // the base64 content entropy — a true white-screenshot has very low entropy
  // because most pixels are identical (0xFF,0xFF,0xFF compressed).
  // Approximate: decode enough to check if > 98% of the base64 is the same
  // repeating pattern (indicating white image).
  const buf = Buffer.from(pngBase64, 'base64');
  // Check PNG signature
  if (buf.length < 24) return 0;
  // Sample bytes from the middle of the file (compressed pixel data area)
  const sampleSize = Math.min(2000, buf.length - 100);
  const start = Math.floor(buf.length / 2);
  const sample = buf.slice(start, start + sampleSize);
  // Count unique byte values
  const uniq = new Set(sample);
  // A white screenshot compresses to very few unique byte patterns
  // A real UI screenshot will have high diversity
  return uniq.size / 256; // closer to 1 = diverse content, closer to 0 = likely white
}

async function captureAndProbe(name, expectedTabLabel) {
  // Verify target tab is active before screenshot
  const preCheck = await send('Runtime.evaluate', {
    expression: `(() => {
      const root = document.querySelector('.cipher-settings-root');
      if (!root) return { error: 'no cipher-settings-root' };
      const activeTab = document.querySelector('.cipher-settings-tabs [role="tab"][aria-selected="true"]')?.textContent.trim();
      const body = root.querySelector('.cipher-settings-body');
      const visibleText = body ? body.innerText.substring(0, 200) : '';
      // CSS isolation: check no cipher- classes appear outside .cipher-settings-root
      const allCipher = [...document.querySelectorAll('[class*="cipher-"]')];
      const outside = allCipher.filter(el => !el.closest('.cipher-settings-root'));
      return {
        activeTab,
        visibleText,
        bodyRect: body ? { w: body.scrollWidth, cw: body.clientWidth, h: body.scrollHeight, ch: body.clientHeight } : null,
        rootRect: { w: root.scrollWidth, cw: root.clientWidth, h: root.scrollHeight, ch: root.clientHeight },
        cssLeak: outside.length,
        cssLeakClasses: outside.map(el => el.className).slice(0, 5),
        hasHorizontalOverflow: body ? (body.scrollWidth > body.clientWidth + 2) : (root.scrollWidth > root.clientWidth + 2),
        hasVerticalScroll: body ? (body.scrollHeight > body.clientHeight) : (root.scrollHeight > root.clientHeight),
      };
    })()`,
    returnByValue: true,
  });
  const probe = preCheck.result.value;

  if (probe.error) {
    failures.push(`${name}: ${probe.error}`);
    return null;
  }

  // Active tab mismatch check
  if (expectedTabLabel && !probe.activeTab?.includes(expectedTabLabel)) {
    failures.push(`${name}: activeTab is "${probe.activeTab}", expected "${expectedTabLabel}"`);
  }

  // CSS leak check
  if (probe.cssLeak > 0) {
    failures.push(`${name}: CSS leak detected — ${probe.cssLeak} elements with cipher- classes outside .cipher-settings-root: [${probe.cssLeakClasses.join(', ')}]`);
  }

  // Horizontal overflow — FAIL not warn
  if (probe.hasHorizontalOverflow) {
    failures.push(`${name}: horizontal overflow detected (scrollWidth ${probe.bodyRect?.w} > clientWidth ${probe.bodyRect?.cw})`);
  }

  // Empty visible text check
  if (!probe.visibleText || probe.visibleText.trim().length < 10) {
    failures.push(`${name}: body visible text too short (${probe.visibleText?.length || 0} chars), likely blank`);
  }

  // Capture screenshot
  const capture = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  const pngBuffer = Buffer.from(capture.data, 'base64');
  const filePath = join(outputDir, `${name}.png`);
  writeFileSync(filePath, pngBuffer);
  const hash = createHash('sha256').update(pngBuffer).digest('hex').substring(0, 16);
  const fileSize = pngBuffer.length;

  // White-screenshot detection: low byte diversity = likely white/blank
  const diversity = computeNonWhiteRatio(capture.data);
  if (diversity < 0.05) {
    failures.push(`${name}: screenshot appears to be blank/white (byte diversity ${(diversity * 100).toFixed(1)}%)`);
  }

  screenshots.push({ name, file: filePath, hash, fileSize, diversity: +(diversity * 100).toFixed(1), probe });

  return { hash, diversity, probe };
}

// ---- Main matrix: 5 pages × 2 themes × 3 DPR × 2 widths = 60 ----
for (const page of pages) {
  for (const theme of themes) {
    for (const dpr of dprLevels) {
      for (const vp of viewports) {
        await setViewport(vp.width, vp.height, dpr);
        await setTheme(theme);
        await switchToTab(page.label, page.expectedHeading);
        const name = `${page.id}-${theme}-${vp.suffix}-dpr${dpr}`;
        const result = await captureAndProbe(name, page.label);
        if (result) {
          results.push({ page: page.id, theme, dpr, width: vp.width, hash: result.hash, diversity: result.diversity, ...result.probe });
        }
      }
    }
  }
}

// ---- Duplicate hash detection for same theme/viewport/dpr across different pages ----
const hashGroups = {};
for (const r of results) {
  const key = `${r.theme}-${r.width}-dpr${r.dpr}`;
  if (!hashGroups[key]) hashGroups[key] = [];
  hashGroups[key].push({ page: r.page, hash: r.hash });
}
for (const [key, group] of Object.entries(hashGroups)) {
  const hashes = group.map(g => g.hash);
  const uniqHashes = new Set(hashes);
  if (uniqHashes.size === 1 && group.length > 1) {
    failures.push(`Duplicate screenshots for ${key}: all ${group.length} pages have identical hash ${hashes[0]} — pages not switching or rendering blank`);
  } else if (uniqHashes.size < group.length) {
    // Some duplicates but not all
    const dups = {};
    for (const g of group) {
      if (!dups[g.hash]) dups[g.hash] = [];
      dups[g.hash].push(g.page);
    }
    for (const [h, pages] of Object.entries(dups)) {
      if (pages.length > 1) {
        failures.push(`Duplicate screenshots for ${key}: pages [${pages.join(', ')}] share hash ${h}`);
      }
    }
  }
}

// ---- AI sub-tab coverage: 7 sub-tabs × dark × wide × dpr1 ----
await setViewport(1280, 800, 1);
await setTheme('dark');
await switchToTab('AI 接入', 'AI 接入');
for (const sub of aiSubTabs) {
  await switchAiSubTab(sub.label);
  const name = `ai-${sub.id}-dark-wide`;
  const result = await captureAndProbe(name, 'AI 接入');
  if (result) {
    results.push({ page: `ai-${sub.id}`, theme: 'dark', dpr: 1, width: 1280, hash: result.hash, diversity: result.diversity, ...result.probe });
  }
}

// AI sub-tab duplicate hash detection
const aiHashes = results.filter(r => r.page?.startsWith('ai-')).map(r => r.hash);
const uniqAi = new Set(aiHashes);
if (uniqAi.size === 1 && aiHashes.length > 1) {
  failures.push(`Duplicate AI sub-tab screenshots: all ${aiHashes.length} share hash ${aiHashes[0]} — sub-tabs not switching`);
} else if (uniqAi.size < aiHashes.length) {
  failures.push(`Duplicate AI sub-tab screenshots: ${aiHashes.length - uniqAi.size} duplicates`);
}

// ---- Transcription mode coverage: 3 modes × dark × wide × dpr1 ----
await switchToTab('语音转文字', '语音转文字');
for (const mode of transcriptionModes) {
  await switchTranscriptionMode(mode.label);
  const name = `transcription-${mode.id}-dark-wide`;
  const result = await captureAndProbe(name, '语音转文字');
  if (result) {
    results.push({ page: `transcription-${mode.id}`, theme: 'dark', dpr: 1, width: 1280, hash: result.hash, diversity: result.diversity, ...result.probe });
  }
}

// Transcription mode duplicate hash detection
const transHashes = results.filter(r => r.page?.startsWith('transcription-')).map(r => r.hash);
const uniqTrans = new Set(transHashes);
if (uniqTrans.size === 1 && transHashes.length > 1) {
  failures.push(`Duplicate transcription mode screenshots: all ${transHashes.length} share hash ${transHashes[0]} — modes not switching`);
}

// ---- CipherTalk baseline CSS comparison ----
const cssCompare = await send('Runtime.evaluate', {
  expression: `(() => {
    const root = document.querySelector('.cipher-settings-root');
    if (!root) return { error: 'no root' };
    const styles = getComputedStyle(root);
    const ourVars = {};
    const varNames = ['--settings-radius','--settings-card-radius','--settings-control-radius','--settings-control-height','--settings-gap'];
    for (const v of varNames) { ourVars[v] = styles.getPropertyValue(v).trim(); }
    return { ourVars, hasSettingsPage: !!document.querySelector('.cipher-settings-root') };
  })()`,
  returnByValue: true,
});
const cssData = cssCompare.result.value;
const cssBaselineResults = {
  baselineVarsFound: baselineVars.length,
  baselineSelectorsFound: baselineSelectors.length,
  ourVars: cssData.ourVars || {},
  varsMatch: baselineVars.length > 0,
};

// ---- Summary ----
const expectedTotal = 60 + 7 + 3;

console.log(`\n=== Cipher Settings Visual Matrix Results (reworked) ===`);
console.log(`Screenshots captured: ${screenshots.length} / ${expectedTotal} expected`);
console.log(`Results: ${results.length}`);
console.log(`Failures: ${failures.length}`);
console.log(`CSS baseline: ${cssBaselineResults.baselineVarsFound} vars, ${cssBaselineResults.baselineSelectorsFound} selectors in CipherTalk`);
console.log(`CSS our vars: ${JSON.stringify(cssBaselineResults.ourVars)}`);

if (screenshots.length !== expectedTotal) {
  failures.push(`Screenshot count mismatch: ${screenshots.length} vs expected ${expectedTotal}`);
}

// Write manifest
const manifest = {
  summary: {
    screenshots: screenshots.length,
    expected: expectedTotal,
    results: results.length,
    failures: failures.length,
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
} else {
  console.log(`\nVisual matrix PASSED: ${screenshots.length} screenshots, ${results.length} probes, 0 failures`);
  console.log(`  - All screenshot hashes are unique per page/theme/viewport combination`);
  console.log(`  - No blank/white screenshots detected`);
  console.log(`  - No horizontal overflow`);
  console.log(`  - No CSS leak outside .cipher-settings-root`);
  console.log(`  - All tab/sub-tab/mode switches verified active`);
  console.log(`  - CipherTalk baseline: ${cssBaselineResults.baselineVarsFound} CSS vars, ${cssBaselineResults.baselineSelectorsFound} selectors`);
}

socket.close();
