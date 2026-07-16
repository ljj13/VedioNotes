import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const outputRoot = path.resolve('outputs', 'complete-parity-task-05');
const profileRoot = path.resolve('outputs', '.visual-profile-task-05');
const port = 9325;
const serverPort = 4175;

await mkdir(outputRoot, { recursive: true });
await mkdir(profileRoot, { recursive: true });

const browser = spawn(edge, [
  '--headless=new', '--disable-gpu', '--disable-extensions', '--disable-background-networking',
  `--remote-debugging-port=${port}`, `--user-data-dir=${profileRoot}`, '--window-size=1440,1000',
  `http://127.0.0.1:${serverPort}/scripts/fixtures/task05.html?view=library`,
], { stdio: 'ignore', windowsHide: true });

try {
  const page = await waitForPage();
  const socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  let nextId = 0;
  const pending = new Map();
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (!message.id) return;
    const waiter = pending.get(message.id);
    if (!waiter) return;
    pending.delete(message.id);
    if (message.error) waiter.reject(new Error(message.error.message));
    else waiter.resolve(message.result);
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });

  await send('Page.enable');
  await send('Runtime.enable');
  await settle(send, '.library-workspace');
  await capture(send, 'library.png', 1440, 1000);
  await clickText(send, '向笔记提问');
  await capture(send, 'library-with-chat.png', 1440, 1000);
  await capture(send, 'library-narrow-chat.png', 760, 1000);
  await navigate(send, `http://127.0.0.1:${serverPort}/scripts/fixtures/task05.html?view=qa`, '.qa-workspace');
  await clickText(send, '格林函数与边值问题：从直觉到推导');
  await capture(send, 'qa.png', 1440, 1000);
  await navigate(send, `http://127.0.0.1:${serverPort}/scripts/fixtures/task05.html?view=tasks`, '.task-history-workspace');
  await capture(send, 'tasks.png', 1440, 1000);
  await capture(send, 'tasks-narrow.png', 760, 1000);
  socket.close();
} finally {
  browser.kill();
}

async function navigate(send, url, selector) {
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url });
  await settle(send, selector);
}

async function settle(send, selector) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const result = await send('Runtime.evaluate', { expression: `Boolean(document.querySelector(${JSON.stringify(selector)}))`, returnByValue: true });
    if (result.result?.value) {
      await send('Runtime.evaluate', { expression: "document.head.insertAdjacentHTML('beforeend', '<style>*{animation:none!important;transition:none!important}</style>')" });
      await delay(700);
      return;
    }
    await delay(100);
  }
  throw new Error(`Fixture did not render ${selector}.`);
}

async function clickText(send, text) {
  await send('Runtime.evaluate', { expression: `[...document.querySelectorAll('button')].find((node) => node.textContent?.includes(${JSON.stringify(text)}))?.click()` });
  await delay(500);
}

async function capture(send, name, width, height) {
  await send('Emulation.setDeviceMetricsOverride', { width: Math.max(320, width - 1), height, deviceScaleFactor: 1, mobile: false });
  await delay(80);
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
  await delay(220);
  const { data } = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false, fromSurface: true });
  await writeFile(path.join(outputRoot, name), Buffer.from(data, 'base64'));
}

async function waitForPage() {
  let lastError;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`);
      const pages = await response.json();
      const page = pages.find((entry) => entry.type === 'page' && entry.url.includes('/scripts/fixtures/task05.html'));
      if (page) return page;
    } catch (error) { lastError = error; }
    await delay(100);
  }
  throw lastError ?? new Error('Headless Edge did not expose the fixture target.');
}

function delay(milliseconds) { return new Promise((resolve) => setTimeout(resolve, milliseconds)); }
