import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';

const [endpoint, targetUrl, screenshotPath, scenario = 'collapsed'] = process.argv.slice(2);
assert.ok(endpoint && targetUrl && screenshotPath, 'usage: node workbench-preview.visual.test.mjs <cdp-endpoint> <url> <screenshot> [scenario]');

const tab = await fetch(`${endpoint}/json/new?${encodeURIComponent(targetUrl)}`, { method: 'PUT' }).then(response => response.json());
const socket = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true });
  socket.addEventListener('error', reject, { once: true });
});

let sequence = 0;
const pending = new Map();
socket.addEventListener('message', event => {
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
await send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 900, deviceScaleFactor: 1, mobile: false });

const deadline = Date.now() + 10000;
while (Date.now() < deadline) {
  const probe = await send('Runtime.evaluate', {
    expression: `JSON.stringify({ ready: document.readyState, trigger: Boolean(document.getElementById('sidebarTrigger')), source: location.pathname })`,
    returnByValue: true,
  });
  const state = JSON.parse(probe.result.value);
  if (state.ready === 'complete' && state.trigger && state.source.endsWith('/workbench-options.html')) break;
  await new Promise(resolve => setTimeout(resolve, 100));
}

let state;
if (scenario === 'settings-providers') {
  await send('Runtime.evaluate', {
    expression: `openSettings('providers'); new Promise(resolve => setTimeout(resolve, 400))`,
    awaitPromise: true,
    returnByValue: true,
  });
  const inspected = await send('Runtime.evaluate', {
    expression: `JSON.stringify({
      settingsActive: document.body.classList.contains('settings-active'),
      providersActive: document.getElementById('setting-providers').classList.contains('active'),
      blocks: [...document.querySelectorAll('#setting-providers .service-settings-block')].map(block => ({
        id: block.id,
        heading: block.querySelector('h4').textContent.trim(),
        services: [...block.querySelectorAll('.service-settings-title strong')].map(el => el.textContent.trim())
      }))
    })`,
    returnByValue: true,
  });
  state = JSON.parse(inspected.result.value);
  assert.equal(state.settingsActive, true, 'service management keeps the settings context active');
  assert.equal(state.providersActive, true, 'the model and service settings pane is visible');
  assert.deepEqual(state.blocks, [
    { id: 'transcription-services', heading: '转写服务', services: ['本地 Whisper Small', 'MiMo ASR', '腾讯云极速版', '自定义 OpenAI 兼容'] },
    { id: 'summary-services', heading: '总结服务', services: ['DeepSeek V4', 'MiMo V2.5', 'OpenAI 兼容服务'] },
  ]);
} else if (scenario === 'settings-models') {
  await send('Runtime.evaluate', {
    expression: `openSettings('providers'); [...document.querySelectorAll('#setting-providers button')].find(button => button.textContent.trim() === '管理模型').click(); new Promise(resolve => setTimeout(resolve, 400))`,
    awaitPromise: true,
    returnByValue: true,
  });
  const inspected = await send('Runtime.evaluate', {
    expression: `JSON.stringify({
      settingsActive: document.body.classList.contains('settings-active'),
      settingsScreenActive: document.getElementById('screen-settings').classList.contains('active'),
      modelPaneActive: document.getElementById('setting-models').classList.contains('active'),
      modelNavActive: document.querySelector('[data-setting="models"]').classList.contains('active'),
      topLevelModelScreenExists: Boolean(document.getElementById('screen-models')),
      visibleModels: [...document.querySelectorAll('#setting-models .model-top h3')].map(el => el.textContent.trim())
    })`,
    returnByValue: true,
  });
  state = JSON.parse(inspected.result.value);
  assert.equal(state.settingsActive, true, 'model management keeps the settings context active');
  assert.equal(state.settingsScreenActive, true, 'model management remains inside the settings screen');
  assert.equal(state.modelPaneActive, true, 'the local model settings pane is visible');
  assert.equal(state.modelNavActive, true, 'the local model settings navigation item is selected');
  assert.equal(state.topLevelModelScreenExists, false, 'there is no standalone model screen');
  assert.deepEqual(state.visibleModels, ['Tiny', 'Small', 'Large V3 Turbo']);
} else {
  await send('Runtime.evaluate', {
    expression: `document.getElementById('sidebarTrigger').click(); new Promise(resolve => setTimeout(resolve, 400))`,
    awaitPromise: true,
    returnByValue: true,
  });
  const inspected = await send('Runtime.evaluate', {
    expression: `JSON.stringify({
      collapsed: document.body.classList.contains('sidebar-collapsed'),
      triggerLabel: getComputedStyle(document.querySelector('.sidebar-trigger-label')).display,
      navLabels: [...document.querySelectorAll('.nav-item span')].map(el => getComputedStyle(el).display),
      brandCopy: getComputedStyle(document.querySelector('.brand-copy')).display,
      statusText: getComputedStyle(document.querySelector('.engine-status span')).display
    })`,
    returnByValue: true,
  });
  state = JSON.parse(inspected.result.value);
  assert.equal(state.collapsed, true, 'the sidebar entered collapsed state');
  assert.equal(state.triggerLabel, 'none', 'the collapse control label is hidden');
  assert.ok(state.navLabels.every(display => display === 'none'), 'all navigation labels are hidden');
  assert.equal(state.brandCopy, 'none', 'the brand copy is hidden');
  assert.equal(state.statusText, 'none', 'the service status text is hidden while its green light remains');
}

const capture = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
writeFileSync(screenshotPath, Buffer.from(capture.data, 'base64'));
console.log(JSON.stringify(state));
socket.close();
