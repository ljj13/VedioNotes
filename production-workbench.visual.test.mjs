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
const routeHeadings = {
  home: '把视频变成可回查的知识', create: '新建视频提炼', library: '笔记库',
  qa: 'AI 问答', tasks: '历史任务', settings: '设置',
};
const routeSelectors = {
  home: '.home-workspace', create: '.create-workspace', library: '.library-workspace', qa: '.qa-workspace',
  tasks: '.task-history-workspace', progress: '.progress-workspace', result: '.result-workspace', settings: '.cipher-settings-root',
};
const settingsTopLabels = { appearance: '外观', transcription: '语音转文字', ai: 'AI 接入', data: '数据管理', about: '关于' };
const settingsSubLabels = {
  'transcription-cpu': { label: 'CPU 转写', selector: '[role="tablist"][aria-label="语音转文字模式"]' },
  'transcription-gpu': { label: 'GPU 转写', selector: '[role="tablist"][aria-label="语音转文字模式"]' },
  'transcription-online': { label: '在线转写', selector: '[role="tablist"][aria-label="语音转文字模式"]' },
  'ai-llm': { label: '大语言模型', selector: '[role="tablist"][aria-label="AI 能力"]' },
  'ai-vector': { label: '向量', selector: '[role="tablist"][aria-label="AI 能力"]' },
  'ai-rerank': { label: '重排', selector: '[role="tablist"][aria-label="AI 能力"]' },
  'ai-web': { label: '联网', selector: '[role="tablist"][aria-label="AI 能力"]' },
  'ai-tts': { label: '语音', selector: '[role="tablist"][aria-label="AI 能力"]' },
  'ai-image': { label: '作图', selector: '[role="tablist"][aria-label="AI 能力"]' },
  'ai-agent': { label: '本地智能体', selector: '[role="tablist"][aria-label="AI 能力"]' },
  'data-export': { label: '导出设置', selector: '[role="tablist"][aria-label="数据管理分类"]' },
  'data-cache': { label: '缓存管理', selector: '[role="tablist"][aria-label="数据管理分类"]' },
  'data-logs': { label: '日志管理', selector: '[role="tablist"][aria-label="数据管理分类"]' },
};
const legacyOnlyModes = new Set([
  'settings-data-downloads',
  'settings-appearance-dropdown',
  'settings-data-logs-dropdown',
  'settings-transcription-online-dropdown',
  'settings-transcription-profile-provider-dropdown',
  'settings-ai-profile-discovered-model-dropdown',
  'settings-transcription-online-fallback-dropdown',
  'settings-ai-llm-protocol-disabled',
  'settings-ai-image-size-dropdown',
  'settings-ai-vector-provider-dropdown',
  'settings-ai-rerank-provider-dropdown',
  'settings-ai-web-provider-dropdown',
  'settings-ai-tts-provider-dropdown',
  'settings-ai-image-provider-dropdown',
  'settings-ai-agent-provider-dropdown',
]);
const legacyOnlySelectors = {
  'settings-data-downloads': '[role="tab"]',
  'settings-appearance-dropdown': 'button[aria-label="颜色主题"]',
  'settings-data-logs-dropdown': 'button[aria-label="日志级别"]',
  'settings-transcription-online-dropdown': 'button[aria-label="在线转写服务商"]',
  'settings-transcription-profile-provider-dropdown': 'button[aria-label="服务商"]',
  'settings-ai-profile-discovered-model-dropdown': 'button[aria-label="已发现模型"]',
  'settings-transcription-online-fallback-dropdown': 'button[aria-label="备用转写配置（额度不足时自动切换）"]',
  'settings-ai-llm-protocol-disabled': 'button[aria-label="AI 协议"]',
  'settings-ai-image-size-dropdown': 'button[aria-label="图片尺寸"]',
  'settings-ai-vector-provider-dropdown': 'button[aria-label="向量服务商预设"]',
  'settings-ai-rerank-provider-dropdown': 'button[aria-label="重排服务商预设"]',
  'settings-ai-web-provider-dropdown': 'button[aria-label="联网服务商预设"]',
  'settings-ai-tts-provider-dropdown': 'button[aria-label="语音服务商预设"]',
  'settings-ai-image-provider-dropdown': 'button[aria-label="作图服务商预设"]',
  'settings-ai-agent-provider-dropdown': 'button[aria-label="本地智能体服务商预设"]',
};
const currentDropdownModes = new Set([
  'settings-data-export-dropdown',
  'settings-ai-llm-provider-dropdown',
  'settings-ai-llm-model-dropdown',
  'route-create-note-style-dropdown',
  'route-create-summary-dropdown',
  'route-create-transcription-dropdown',
]);
const lightMode = mode.includes('light');
const collapsedMode = mode.includes('collapsed');
const legacyOnlyMode = legacyOnlyModes.has(mode);
const legacyOnlySelector = legacyOnlySelectors[mode] ?? null;
const legacyOnlyText = mode === 'settings-data-downloads' ? '平台连接' : null;
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

const layoutAudits = [];
const contrastAudits = [];

async function applyAuditTheme(theme) {
  await send('Runtime.evaluate', {
    expression: `(() => {
      document.documentElement.dataset.theme = ${JSON.stringify(theme)};
      document.querySelectorAll('[data-theme]').forEach((element) => element.setAttribute('data-theme', ${JSON.stringify(theme)}));
    })()`,
    returnByValue: true,
  });
  await send('Runtime.evaluate', {
    expression: `(async () => {
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      await new Promise((resolve) => setTimeout(resolve, 240));
      const animations = document.getAnimations().filter((animation) => animation.playState === 'running');
      await Promise.race([
        Promise.allSettled(animations.map((animation) => animation.finished)),
        new Promise((resolve) => setTimeout(resolve, 500)),
      ]);
      return true;
    })()`,
    awaitPromise: true,
    returnByValue: true,
  });
}

async function waitForSelector(selector, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const probe = await send('Runtime.evaluate', {
      expression: `Boolean(document.querySelector(${JSON.stringify(selector)}))`,
      returnByValue: true,
    });
    if (probe.result.value) return true;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return false;
}

async function probeControlContrast(selector, label, theme) {
  const result = await send('Runtime.evaluate', {
    expression: `(() => {
      const element = document.querySelector(${JSON.stringify(selector)});
      if (!element) return { error: 'missing control', selector: ${JSON.stringify(selector)} };
      const parseColor = (value) => {
        const text = String(value).trim().toLowerCase();
        const rgbMatch = text.match(/rgba?\\(([^)]+)\\)/i);
        if (rgbMatch) {
          const parts = rgbMatch[1].split(/[ ,/]+/).filter(Boolean).map(Number);
          if (parts.length < 3 || parts.slice(0, 3).some((part) => !Number.isFinite(part))) return null;
          return { r: parts[0], g: parts[1], b: parts[2], a: parts.length > 3 ? parts[3] : 1 };
        }
        if (text.startsWith('color(srgb')) {
          const [channelText, alphaText] = text.slice('color(srgb'.length, -1).trim().split('/');
          const channels = channelText.trim().split(' ').filter(Boolean).slice(0, 3).map(Number);
          if (channels.length !== 3 || channels.some((part) => !Number.isFinite(part))) return null;
          const alpha = alphaText ? Number(alphaText.trim()) : 1;
          return { r: channels[0] * 255, g: channels[1] * 255, b: channels[2] * 255, a: Number.isFinite(alpha) ? alpha : 1 };
        }
        if (text.startsWith('oklch')) {
          const [channelText, alphaText] = text.slice('oklch('.length, -1).trim().split('/');
          const channels = channelText.trim().split(' ').filter(Boolean);
          if (channels.length < 3) return null;
          const lightness = channels[0].endsWith('%') ? Number(channels[0].slice(0, -1)) / 100 : Number(channels[0]);
          const chroma = Number(channels[1]);
          const hue = Number(channels[2].replace('deg', '')) * Math.PI / 180;
          if (![lightness, chroma, hue].every(Number.isFinite)) return null;
          const aChannel = chroma * Math.cos(hue);
          const bChannel = chroma * Math.sin(hue);
          const lRoot = lightness + 0.3963377774 * aChannel + 0.2158037573 * bChannel;
          const mRoot = lightness - 0.1055613458 * aChannel - 0.0638541728 * bChannel;
          const sRoot = lightness - 0.0894841775 * aChannel - 1.291485548 * bChannel;
          const l = lRoot ** 3;
          const m = mRoot ** 3;
          const s = sRoot ** 3;
          const encode = (linear) => {
            const encoded = linear <= 0.0031308 ? 12.92 * linear : 1.055 * linear ** (1 / 2.4) - 0.055;
            return Math.min(1, Math.max(0, encoded)) * 255;
          };
          const alpha = alphaText ? Number(alphaText.trim()) : 1;
          return {
            r: encode(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
            g: encode(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
            b: encode(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
            a: Number.isFinite(alpha) ? alpha : 1,
          };
        }
        return null;
      };
      const luminance = ({ r, g, b }) => {
        const linear = [r, g, b].map((channel) => {
          const value = channel / 255;
          return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
        });
        return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
      };
      const contrastRatio = (foreground, background) => {
        const first = luminance(foreground);
        const second = luminance(background);
        return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
      };
      const style = getComputedStyle(element);
      const foreground = parseColor(style.color);
      const gradientColors = [...style.backgroundImage.matchAll(/rgba?\\([^)]+\\)/gi)]
        .map((match) => parseColor(match[0]))
        .filter(Boolean);
      let backgrounds = gradientColors;
      if (backgrounds.length === 0) {
        let current = element;
        while (current && backgrounds.length === 0) {
          const background = parseColor(getComputedStyle(current).backgroundColor);
          if (background && background.a > 0.05) backgrounds = [background];
          current = current.parentElement;
        }
      }
      if (!foreground || backgrounds.length === 0) {
        return { error: 'unresolved computed colors', color: style.color, backgroundColor: style.backgroundColor, backgroundImage: style.backgroundImage };
      }
      const ratios = backgrounds.map((background) => contrastRatio(foreground, background));
      const matchedColorRules = [];
      const visitRules = (rules, href) => {
        for (const rule of rules ?? []) {
          if (rule.cssRules) visitRules(rule.cssRules, href);
          if (!rule.selectorText || !rule.style?.color) continue;
          try {
            if (rule.selectorText.split(',').some((selector) => element.matches(selector.trim()))) {
              matchedColorRules.push({ selector: rule.selectorText, color: rule.style.color, priority: rule.style.getPropertyPriority('color'), href });
            }
          } catch {}
        }
      };
      for (const sheet of document.styleSheets) {
        try { visitRules(sheet.cssRules, sheet.href); } catch {}
      }
      return {
        selector: ${JSON.stringify(selector)},
        color: style.color,
        backgroundColor: style.backgroundColor,
        backgroundImage: style.backgroundImage,
        accentContrast: style.getPropertyValue('--accent-contrast').trim(),
        rootTheme: document.documentElement.dataset.theme ?? null,
        hostTheme: element.closest('[data-theme]')?.getAttribute('data-theme') ?? null,
        transitionDuration: style.transitionDuration,
        transitionProperty: style.transitionProperty,
        animations: element.getAnimations().map((animation) => ({
          playState: animation.playState,
          currentTime: animation.currentTime,
          duration: animation.effect?.getTiming?.().duration ?? null,
        })),
        matchedColorRules,
        ratio: Math.min(...ratios),
        ratios,
      };
    })()`,
    returnByValue: true,
  });
  const probe = { label, theme, ...result.result.value };
  contrastAudits.push(probe);
}

async function auditCriticalControlContrast() {
  const originalTheme = lightMode ? 'light' : 'dark';
  for (const theme of ['light', 'dark']) {
    await applyAuditTheme(theme);
    await probeControlContrast('.sidebar-create-action', '新建提炼', theme);

    await send('Runtime.evaluate', { expression: `document.querySelector('.sidebar-nav button[aria-label="首页"]')?.click()`, returnByValue: true });
    assert.equal(await waitForSelector('.home-workspace'), true, `contrast audit must enter Home in ${theme}`);
    await applyAuditTheme(theme);
    await probeControlContrast('.sidebar-nav button[aria-label="首页"]', '侧栏当前项', theme);

    await send('Runtime.evaluate', { expression: `document.querySelector('.sidebar-create-action')?.click()`, returnByValue: true });
    assert.equal(await waitForSelector('.create-workspace'), true, `contrast audit must enter Create in ${theme}`);
    await applyAuditTheme(theme);
    await send('Runtime.evaluate', {
      expression: `(() => {
        const input = document.querySelector('#video-url');
        if (!input) return false;
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
        setter.call(input, 'https://www.youtube.com/watch?v=contrast-audit');
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      })()`,
      returnByValue: true,
    });
    await new Promise((resolve) => setTimeout(resolve, 180));
    await probeControlContrast('.start-button', '开始处理', theme);

    await send('Runtime.evaluate', { expression: `document.querySelector('.sidebar-nav button[aria-label="AI 问答"]')?.click()`, returnByValue: true });
    assert.equal(await waitForSelector('.qa-workspace'), true, `contrast audit must enter Q&A in ${theme}`);
    await applyAuditTheme(theme);
    assert.equal(await waitForSelector('.qa-note-list button'), true, `contrast audit must load a Q&A note in ${theme}`);
    await send('Runtime.evaluate', { expression: `document.querySelector('.qa-note-list button')?.click()`, returnByValue: true });
    assert.equal(await waitForSelector('form[aria-label="提问编辑器"]'), true, `contrast audit must render the Q&A composer in ${theme}`);
    await send('Runtime.evaluate', {
      expression: `(() => {
        const input = document.querySelector('form[aria-label="提问编辑器"] textarea');
        if (!input) return false;
        const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
        setter.call(input, '视觉对比度检查');
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      })()`,
      returnByValue: true,
    });
    await new Promise((resolve) => setTimeout(resolve, 120));
    await probeControlContrast('form[aria-label="提问编辑器"] button[type="submit"]', 'QA 发送按钮', theme);

    await send('Runtime.evaluate', { expression: `document.querySelector('.sidebar-action[aria-label="设置"]')?.click()`, returnByValue: true });
    assert.equal(await waitForSelector('.cipher-settings-root'), true, `contrast audit must enter Settings in ${theme}`);
    await applyAuditTheme(theme);
    await probeControlContrast('.settings-navigation-tabs [role="tab"][aria-selected="true"]', '设置当前页', theme);
    await probeControlContrast('.settings-navigation-tabs [role="tab"]:not([aria-selected="true"])', '设置分类导航', theme);
  }
  await send('Runtime.evaluate', { expression: `document.querySelector('.sidebar-nav button[aria-label="AI 问答"]')?.click()`, returnByValue: true });
  assert.equal(await waitForSelector('.qa-workspace'), true, 'contrast audit must restore the requested Q&A route');
  await applyAuditTheme(originalTheme);
  assert.equal(contrastAudits.length, 12, `contrast audit must collect 6 controls across 2 themes: ${JSON.stringify(contrastAudits)}`);
  const failedContrastAudits = contrastAudits.filter((probe) => probe.error || !Number.isFinite(probe.ratio) || probe.ratio < 4.5);
  assert.equal(failedContrastAudits.length, 0, `critical control contrast must be >= 4.5: ${JSON.stringify(failedContrastAudits)}`);
}

async function auditRouteLayoutAt1280(route) {
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: Math.max(800, height), deviceScaleFactor: 1, mobile: false });
  await new Promise((resolve) => setTimeout(resolve, 220));

  if (route === 'library') {
    await send('Runtime.evaluate', {
      expression: `([...document.querySelectorAll('button')].find((button) => button.textContent.trim() === '向笔记提问'))?.click()`,
      returnByValue: true,
    });
    assert.equal(await waitForSelector('.note-chat-drawer'), true, '1280px Library layout must open the note chat drawer');
  }

  const layoutResult = await send('Runtime.evaluate', {
    expression: `(() => {
      const selectors = ${JSON.stringify(route === 'library'
    ? ['.library-layout.with-chat', '.library-sources', '.library-browser', '.library-note', '.note-chat-drawer']
    : ['.task-history-layout', '.task-table-shell', '.task-detail'])};
      const items = selectors.map((selector) => {
        const element = document.querySelector(selector);
        if (!element) return { selector, missing: true };
        const rect = element.getBoundingClientRect();
        return {
          selector,
          missing: false,
          left: Math.round(rect.left),
          right: Math.round(rect.right),
          scrollWidth: element.scrollWidth,
          clientWidth: element.clientWidth,
          intentionallyScrollable: selector === '.task-table-shell',
        };
      });
      return {
        innerWidth: window.innerWidth,
        documentWidth: document.documentElement.scrollWidth,
        bodyWidth: document.body.scrollWidth,
        items,
      };
    })()`,
    returnByValue: true,
  });
  const audit = {
    name: route === 'library' ? 'libraryWithChat' : 'historyLayout',
    viewport: 1280,
    ...layoutResult.result.value,
  };
  audit.violations = audit.items.filter((item) => item.missing
    || item.left < -1
    || item.right > audit.innerWidth + 1
    || (!item.intentionallyScrollable && item.scrollWidth > item.clientWidth + 1));
  layoutAudits.push(audit);
  assert.ok(audit.documentWidth <= 1280 && audit.bodyWidth <= 1280, `${audit.name} must not create document-level horizontal overflow: ${JSON.stringify(audit)}`);
  assert.equal(audit.violations.length, 0, `${audit.name} containers must remain inside 1280px viewport: ${JSON.stringify(audit.violations)}`);

  if (route === 'library') {
    await send('Runtime.evaluate', { expression: `document.querySelector('.chat-close-button')?.click()`, returnByValue: true });
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 700 });
  await new Promise((resolve) => setTimeout(resolve, 180));
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
      window.__VISUAL_COMMANDS__ = [];
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
        window.__VISUAL_COMMANDS__.push(command);
        if (command === 'plugin:event|listen') { listeners.set(args?.event, args?.handler); return args?.handler; }
        if (command === 'plugin:event|unlisten') { for (const [eventName, id] of listeners.entries()) if (id === args?.eventId) listeners.delete(eventName); return undefined; }
        if (command === 'get_migration_state') return false;
        if (command === 'list_history' || command === 'search_history') return [
          { id: 7, title: '线性代数课程', source: 'https://video.example/watch', noteTemplate: 'core_distillation', noteStyle: 'academic', createdAt: '2026-07-14T10:00:00Z', markdownPath: 'C:/notes/linear.md', transcriptPath: 'C:/notes/linear.txt', thumbnailPath: null, screenshotPaths: [] },
          { id: 8, title: '傅里叶变换与频域直觉', source: 'https://video.example/fourier', noteTemplate: 'core_distillation', noteStyle: 'tutorial', createdAt: '2026-07-13T19:20:00Z', markdownPath: 'C:/notes/fourier.md', transcriptPath: 'C:/notes/fourier.txt', thumbnailPath: null, screenshotPaths: [] }
        ];
        if (command === 'search_library') return {
          entries: [
            { id: 7, title: '线性代数课程', source: 'https://video.example/watch', noteTemplate: 'core_distillation', noteStyle: 'academic', createdAt: '2026-07-14T10:00:00Z', markdownPath: 'C:/notes/linear.md', transcriptPath: 'C:/notes/linear.txt', thumbnailPath: null, screenshotPaths: [], favorite: true, tags: ['数学', '课程'], lastOpenedAt: '2026-07-15T08:00:00Z' },
            { id: 8, title: '傅里叶变换与频域直觉', source: 'https://video.example/fourier', noteTemplate: 'core_distillation', noteStyle: 'tutorial', createdAt: '2026-07-13T19:20:00Z', markdownPath: 'C:/notes/fourier.md', transcriptPath: 'C:/notes/fourier.txt', thumbnailPath: null, screenshotPaths: [], favorite: false, tags: ['信号处理'], lastOpenedAt: '2026-07-14T07:00:00Z' }
          ],
          tags: [{ id: 1, name: '数学', noteCount: 1 }, { id: 2, name: '课程', noteCount: 1 }, { id: 3, name: '信号处理', noteCount: 1 }],
          total: 2
        };
        if (command === 'list_task_records') return [
          { id: 21, taskId: 'visual-task-21', title: '线性代数课程提炼', sourceLabel: 'YouTube', state: 'succeeded', startedAt: '2026-07-15T08:00:00Z', finishedAt: '2026-07-15T08:01:12Z', durationMs: 72000, transcriptionProfileId: 'local-whisper-cpp', transcriptionProfileName: '本地 Whisper', transcriptionModel: 'small', summaryProfileId: 'deepseek-main', summaryProfileName: 'DeepSeek', summaryModel: 'deepseek-chat', compute: 'gpu', noteId: 7, errorCode: null, diagnosticLogId: null },
          { id: 22, taskId: 'visual-task-22', title: '访谈视频提炼', sourceLabel: '本地文件', state: 'failed', startedAt: '2026-07-15T07:00:00Z', finishedAt: '2026-07-15T07:00:38Z', durationMs: 38000, transcriptionProfileId: 'local-whisper-cpp', transcriptionProfileName: '本地 Whisper', transcriptionModel: 'small', summaryProfileId: 'deepseek-main', summaryProfileName: 'DeepSeek', summaryModel: 'deepseek-chat', compute: 'cpu', noteId: null, errorCode: 'transcription_failed', diagnosticLogId: 'app-diagnostics' }
        ];
        if (command === 'mark_note_opened') return { id: 7, title: '线性代数课程', source: 'https://video.example/watch', noteTemplate: 'core_distillation', noteStyle: 'academic', createdAt: '2026-07-14T10:00:00Z', markdownPath: 'C:/notes/linear.md', transcriptPath: 'C:/notes/linear.txt', thumbnailPath: null, screenshotPaths: [], favorite: true, tags: ['数学', '课程'], lastOpenedAt: '2026-07-15T08:00:00Z' };
        if (command === 'get_history_markdown') return '# 线性代数课程\\n\\n## 核心结论\\n\\n向量空间为线性变换提供统一语言。';
        if (command === 'ask_history_note') return [
          { role: 'user', content: args?.question ?? '这篇笔记的核心结论是什么？' },
          { role: 'assistant', content: '向量空间为线性变换提供统一语言，并保留了可回查的证据。' }
        ];
        if (command === 'list_local_models') return ['tiny','base','small','medium','large-v3-turbo'].map((id) => ({ id, state: id === 'small' ? 'ready' : 'not_downloaded', downloadedBytes: id === 'small' ? 1 : 0, totalBytes: 1, isCurrent: id === 'small' }));
        if (command === 'get_cuda_runtime_status') return { state: 'ready', gpuName: 'NVIDIA RTX 4060', version: '12.4', computeMode: 'auto', message: null };
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
        if (command === 'get_summary_provider_catalog') return [
          {
            id: 'openai', displayName: 'OpenAI', description: 'OpenAI 标准协议服务', protocol: 'openai',
            baseUrl: 'https://api.openai.com/v1', npmPackage: 'openai',
            models: [
              { id: 'gpt-4o', name: 'GPT-4o', summaryEligible: true, modalities: {}, capabilities: {}, limit: {}, cost: {} },
              { id: 'gpt-4o-mini', name: 'GPT-4o mini', summaryEligible: true, modalities: {}, capabilities: {}, limit: {}, cost: {} }
            ]
          },
          {
            id: 'anthropic', displayName: 'Anthropic', description: 'Anthropic Messages 协议服务', protocol: 'anthropic',
            baseUrl: 'https://api.anthropic.com', npmPackage: '@anthropic-ai/sdk',
            models: [{ id: 'claude-sonnet-4', name: 'Claude Sonnet 4', summaryEligible: true, modalities: {}, capabilities: {}, limit: {}, cost: {} }]
          }
        ];
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
        if (command === 'get_about_snapshot') return { appVersion: '0.0.1-preview.20260724.super-long-prerelease-channel-windows.x86_64.webview2', tauriVersion: '2.11.5+wry.0.55.1.webview2-custom-protocol', frontendVersion: '19.1.0+typescript.5.x.vite.7', rustVersion: '1.91 stable windows-msvc', appDataDir: '\\\\\\\\server-name-that-is-intentionally-very-long\\VedioNotes\\structured-redacted-logs\\2026\\07\\24\\session_identifier_without_breakpoints_915bf7d76e1e28b87c9477d4fef51d0b', exportDir: 'D:\\\\VedioNotes\\MarkdownOutputs\\one_single_uninterrupted_export_folder_name', logDir: '\\\\\\\\server-name-that-is-intentionally-very-long\\VedioNotes\\structured-redacted-logs\\2026\\07\\24\\session_identifier_without_breakpoints_915bf7d76e1e28b87c9477d4fef51d0b', components: [
          { name: 'whisper_cpp_cuda_runtime_gpu_transcription_sidecar_and_local_model_component', version: 'whisper.cpp-b6414-cuda-12.8-sm_75-sm_86-windows-x86_64.release-portable.sidecar', status: 'not_installed_because_runtime_component_signature_is_missing', license: 'MIT-AND-NVIDIA-CUDA-Toolkit-EULA-component-runtime-distribution-metadata' }, { name: 'frontend_runtime_and_webview2_bridge', version: '19.1.0+webview2.14393.0', status: 'ready', license: 'MIT' }, { name: 'Tauri_runtime_windows_webview_host_component', version: '2.11.5+wry.0.55.1', status: 'installed', license: 'Apache-2.0-OR-MIT' }
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
    const probe = await send('Runtime.evaluate', { expression: `Boolean(document.querySelector('.cipher-settings-root'))`, returnByValue: true });
    if (probe.result.value) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  const settingsReady = await send('Runtime.evaluate', { expression: `Boolean(document.querySelector('.cipher-settings-root'))`, returnByValue: true });
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
      const tab = [...document.querySelectorAll('.settings-tabs [role="tab"]')].find((button) => button.textContent.trim() === destination);
      tab?.click();
      return !!tab;
    })()`,
    returnByValue: true,
  });
  await new Promise((resolve) => setTimeout(resolve, 300));

  const subModeKey = mode.startsWith('settings-transcription-profile')
    ? 'transcription-online'
    : Object.keys(settingsSubLabels).find((key) => mode.startsWith(`settings-${key}`));
  if (subModeKey) {
    const subtab = settingsSubLabels[subModeKey];
    expectedSubtab = subtab.label;
    await send('Runtime.evaluate', {
      expression: `(() => {
        const subtab = ${JSON.stringify(subtab.label)};
        const btn = [...document.querySelectorAll(${JSON.stringify(`${subtab.selector} [role="tab"]`)})]
          .find((button) => button.textContent.trim() === subtab);
        btn?.click();
        return !!btn;
      })()`,
      returnByValue: true,
    });
    await new Promise((resolve) => setTimeout(resolve, 300));
  } else {
    const defaultSubtab = section === 'ai' ? settingsSubLabels['ai-llm']
      : section === 'data' ? settingsSubLabels['data-export']
        : section === 'transcription'
          ? settingsSubLabels[mode.startsWith('settings-sensevoice') ? 'transcription-cpu' : 'transcription-gpu']
          : null;
    expectedSubtab = defaultSubtab?.label ?? null;
  }
  const dropdownLabel = mode === 'settings-data-export-dropdown' ? '默认导出格式'
    : mode === 'settings-ai-llm-provider-dropdown' ? '服务商'
      : mode === 'settings-ai-llm-model-dropdown' ? '模型'
        : null;
  if (dropdownLabel) {
    const dropdownDeadline = Date.now() + 5000;
    let dropdownReady = false;
    while (Date.now() < dropdownDeadline) {
      const probe = await send('Runtime.evaluate', {
        expression: `(() => {
          const label = ${JSON.stringify(dropdownLabel)};
          const root = [...document.querySelectorAll('[data-slot="select"]')]
            .find((select) => select.querySelector('[data-slot="label"]')?.textContent.trim() === label);
          return Boolean(root?.querySelector('[data-slot="select-trigger"]'));
        })()`,
        returnByValue: true,
      });
      if (probe.result.value) { dropdownReady = true; break; }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.equal(dropdownReady, true, `current Cipher Select must render: ${dropdownLabel}`);
    await send('Runtime.evaluate', {
      expression: `(() => {
        const label = ${JSON.stringify(dropdownLabel)};
        const root = [...document.querySelectorAll('[data-slot="select"]')]
          .find((select) => select.querySelector('[data-slot="label"]')?.textContent.trim() === label);
        root?.querySelector('[data-slot="select-trigger"]')?.click();
        return Boolean(root);
      })()`,
      returnByValue: true,
    });
    await new Promise((resolve) => setTimeout(resolve, 200));
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

  const expectedHeading = routeHeadings[route];
  if (expectedHeading) {
    const headingProbe = await send('Runtime.evaluate', {
      expression: `([...document.querySelectorAll('h1')].some((heading) => heading.textContent.trim() === ${JSON.stringify(expectedHeading)}))`,
      returnByValue: true,
    });
    assert.equal(headingProbe.result.value, true, `visual mode ${mode} must render the current ${route} heading: ${expectedHeading}`);
  }

  const expectedContent = route === 'library' || route === 'qa' ? '线性代数课程'
    : route === 'tasks' ? '线性代数课程提炼'
      : null;
  if (expectedContent) {
    const contentDeadline = Date.now() + 5000;
    let contentReady = false;
    while (Date.now() < contentDeadline) {
      const probe = await send('Runtime.evaluate', {
        expression: `document.body.innerText.includes(${JSON.stringify(expectedContent)})`,
        returnByValue: true,
      });
      if (probe.result.value) { contentReady = true; break; }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    if (!contentReady) {
      const diagnostic = await send('Runtime.evaluate', {
        expression: `JSON.stringify({ commands: window.__VISUAL_COMMANDS__, body: document.body.innerText.slice(0, 1400) })`,
        returnByValue: true,
      });
      assert.equal(contentReady, true, `visual mode ${mode} must render populated production data ${expectedContent}: ${diagnostic.result.value}`);
    }
  }

  if (route === 'library') {
    await send('Runtime.evaluate', { expression: `document.querySelector('.library-entry-open')?.click()`, returnByValue: true });
    const readerDeadline = Date.now() + 5000;
    let readerReady = false;
    while (Date.now() < readerDeadline) {
      const probe = await send('Runtime.evaluate', { expression: `Boolean(document.querySelector('.library-note .saved-markdown'))`, returnByValue: true });
      if (probe.result.value) { readerReady = true; break; }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.equal(readerReady, true, 'library visual mode must render the selected safe Markdown reader');
  }

  if (route === 'qa') {
    await send('Runtime.evaluate', { expression: `document.querySelector('.qa-note-list button')?.click()`, returnByValue: true });
    const composerDeadline = Date.now() + 3000;
    let composerReady = false;
    while (Date.now() < composerDeadline) {
      const probe = await send('Runtime.evaluate', { expression: `Boolean(document.querySelector('form[aria-label="提问编辑器"]'))`, returnByValue: true });
      if (probe.result.value) { composerReady = true; break; }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.equal(composerReady, true, 'Q&A visual mode must render the selected-note composer');
  }

  if (route === 'library' || route === 'tasks') await auditRouteLayoutAt1280(route);
  if (route === 'qa') await auditCriticalControlContrast();
}

const inspected = await send('Runtime.evaluate', {
  expression: `(() => {
    const settingsRoot = document.querySelector('.cipher-settings-root');
    const settingsHeader = settingsRoot?.querySelector('.settings-page-header');
    const settingsNavigation = settingsRoot?.querySelector('.settings-navigation-tabs');
    const settingsBody = settingsRoot?.querySelector('.settings-body');
    const rect = (element) => element?.getBoundingClientRect() ?? null;
    const rootRect = rect(settingsRoot);
    const headerRect = rect(settingsHeader);
    const navigationRect = rect(settingsNavigation);
    const settingsBodyRect = rect(settingsBody);
    const railCount = settingsRoot?.querySelectorAll('.settings-navigation-rail, .settings-navigation-heading').length ?? -1;
    const headerTabsOverlap = headerRect && navigationRect
      ? Math.max(0, Math.min(headerRect.bottom, navigationRect.bottom) - Math.max(headerRect.top, navigationRect.top))
      : 0;
    const headerTabsInline = Boolean(
      headerRect && navigationRect
      && headerTabsOverlap >= Math.min(headerRect.height, navigationRect.height) * .6
    );
    const headerTabsStacked = Boolean(headerRect && navigationRect && navigationRect.top >= headerRect.bottom - 2);
    const bodyBelowHeader = Boolean(
      headerRect && navigationRect && settingsBodyRect
      && settingsBodyRect.top >= Math.max(headerRect.bottom, navigationRect.bottom) - 2
    );
    const aboutCards = settingsRoot ? [...settingsRoot.querySelectorAll(
      '.cipher-about-component-card,.cipher-about-version-card,.cipher-about-directory-card,.cipher-about-source-card'
    )] : [];
    const aboutCardOverflowFailures = aboutCards.flatMap((card, index) => {
      const cardRect = card.getBoundingClientRect();
      const ownOverflow = card.scrollWidth > card.clientWidth + 1;
      const escaped = [...card.querySelectorAll('*')].filter((element) => {
        const style = getComputedStyle(element);
        if (style.display === 'none' || style.visibility === 'hidden') return false;
        const elementRect = element.getBoundingClientRect();
        return elementRect.left < cardRect.left - 1 || elementRect.right > cardRect.right + 1;
      });
      return ownOverflow || escaped.length
        ? [{ index, ownOverflow, escaped: escaped.slice(0, 5).map((element) => element.className || element.tagName) }]
        : [];
    });
    const settingsCLayout = {
      rootWidth: rootRect?.width ?? null,
      railCount,
      railAbsent: railCount === 0,
      missingSelectors: [
        !settingsRoot && '.cipher-settings-root',
        !settingsHeader && '.settings-page-header',
        !settingsNavigation && '.settings-navigation-tabs',
        !settingsBody && '.settings-body',
      ].filter(Boolean),
      narrowContainer: Boolean(rootRect && rootRect.width <= 900),
      headerTabsInline,
      headerTabsStacked,
      bodyBelowHeader,
      aboutCardCount: aboutCards.length,
      aboutCardOverflowFailures,
    };

    return JSON.stringify({
    mode: ${JSON.stringify(mode)},
    coverageKind: ${JSON.stringify(legacyOnlyMode ? 'legacy-only-not-applicable-to-cipher' : 'current-cipher')},
    legacyControlMatches: ${JSON.stringify(legacyOnlySelector)} ? [...document.querySelectorAll(${JSON.stringify(legacyOnlySelector)})].filter((element) => !${JSON.stringify(legacyOnlyText)} || element.textContent.trim() === ${JSON.stringify(legacyOnlyText)}).length : null,
    removedSidebarContainers: document.querySelectorAll('.workbench-sidebar .sidebar-brand, .workbench-sidebar .workspace-profile').length,
    removedSidebarTextMatches: [...document.querySelectorAll('.workbench-sidebar *')].filter((element) => ['本地工作区', '隐私模式'].includes(element.textContent.trim())).length,
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
    activeSetting: document.querySelector('.settings-tabs [role="tab"][aria-selected="true"]')?.textContent.trim() ?? null,
    activeSubtab: ([
      ...document.querySelectorAll('[role="tablist"][aria-label="语音转文字模式"] [role="tab"][aria-selected="true"]'),
      ...document.querySelectorAll('[role="tablist"][aria-label="AI 能力"] [role="tab"][aria-selected="true"]'),
      ...document.querySelectorAll('[role="tablist"][aria-label="数据管理分类"] [role="tab"][aria-selected="true"]')
    ][0])?.textContent.trim() ?? null,
    collapsedLabels: [...document.querySelectorAll('.workbench-sidebar .sidebar-label')].map((element) => ({
      maxWidth: getComputedStyle(element).maxWidth,
      opacity: getComputedStyle(element).opacity,
      visibility: getComputedStyle(element).visibility
    })),
    readyDotVisible: document.querySelector('.ready-dot')?.getBoundingClientRect().width > 0,
    keyWidths: [
      '.workbench-sidebar', '.window-top-bar', '.app-main',
      '.home-workspace', '.home-hero', '.home-hero-visual',
      '.create-workspace', '.create-workspace-main', '.create-service-selectors', '.input-panel', '.pipeline-card',
      '.library-layout', '.library-sources', '.library-browser', '.library-note', '.library-inspector',
      '.qa-layout', '.qa-note-picker', '.qa-conversation', '.qa-composer',
      '.task-history-layout', '.task-table-shell', '.task-detail',
      '.cipher-settings-root', '.settings-shell-layout', '.settings-navigation-tabs', '.settings-body'
    ]
      .map((selector) => {
        const element = document.querySelector(selector);
        return element ? {
          selector,
          scrollWidth: element.scrollWidth,
          clientWidth: element.clientWidth,
          intentionallyScrollable: selector === '.task-table-shell' || selector === '.settings-navigation-tabs',
        } : null;
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
        intentionallyScrollable: Boolean(element.closest('[data-slot="tabs-list-container"]'))
      }))
      .filter((item) => item.visible && !item.intentionallyScrollable && (item.right > window.innerWidth + 1 || item.left < -1))
      .slice(0, 12),
    settingsCLayout,
  });
  })()`,
  returnByValue: true,
});
const state = JSON.parse(inspected.result.value);
state.layoutAudits = layoutAudits;
state.contrastAudits = contrastAudits;

assert.ok(state.documentWidth <= state.innerWidth, `document must not scroll horizontally: ${JSON.stringify(state)}`);
assert.ok(state.overflow.length === 0, `elements must remain inside the viewport: ${JSON.stringify(state.overflow)}`);
assert.ok(state.keyWidths.every((item) => item.intentionallyScrollable || item.scrollWidth <= item.clientWidth), `non-scrollable key containers must not scroll horizontally: ${JSON.stringify(state.keyWidths)}`);
assert.equal(state.unlabeledButtons, 0, `interactive icon buttons must have accessible names: ${JSON.stringify(state)}`);
assert.equal(state.theme, lightMode ? 'light' : 'dark', `theme must match visual mode: ${JSON.stringify(state)}`);
if (settingsMode) {
  assert.equal(state.activeSetting, expectedSetting, `settings mode must select the expected top-level tab: ${JSON.stringify(state)}`);
  assert.equal(state.activeSubtab, expectedSubtab, `settings mode must select the expected subtab: ${JSON.stringify(state)}`);
  assert.deepEqual(state.settingsCLayout.missingSelectors, [], `C settings shell selectors must exist: ${JSON.stringify(state.settingsCLayout)}`);
  assert.equal(state.settingsCLayout.railCount, 0, `removed settings rail must stay physically absent: ${JSON.stringify(state.settingsCLayout)}`);
  assert.equal(
    state.settingsCLayout.narrowContainer ? state.settingsCLayout.headerTabsStacked : state.settingsCLayout.headerTabsInline,
    true,
    `C settings header and tabs must use the expected responsive geometry: ${JSON.stringify(state.settingsCLayout)}`,
  );
  assert.equal(state.settingsCLayout.bodyBelowHeader, true, `settings body must stay below the compact header and tabs: ${JSON.stringify(state.settingsCLayout)}`);
  if (expectedSetting === '关于') {
    assert.ok(state.settingsCLayout.aboutCardCount >= 6, `About visual must render all information cards: ${JSON.stringify(state.settingsCLayout)}`);
    assert.equal(state.settingsCLayout.aboutCardOverflowFailures.length, 0, `About cards must contain long text: ${JSON.stringify(state.settingsCLayout)}`);
  }
}
if (currentDropdownModes.has(mode)) assert.ok(state.openListboxes > 0, `current Cipher dropdown mode must keep a listbox open: ${JSON.stringify(state)}`);
if (legacyOnlyMode) {
  assert.equal(state.coverageKind, 'legacy-only-not-applicable-to-cipher');
  assert.equal(state.legacyControlMatches, 0, `legacy-only control must be physically absent, not merely closed: ${JSON.stringify(state)}`);
  assert.equal(state.openListboxes, 0, `legacy-only control must remain absent from the default Cipher implementation: ${JSON.stringify(state)}`);
}
assert.equal(state.removedSidebarContainers, 0, `removed sidebar parent containers must stay deleted: ${JSON.stringify(state)}`);
assert.equal(state.removedSidebarTextMatches, 0, `removed workspace/privacy sidebar text must stay absent: ${JSON.stringify(state)}`);
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
