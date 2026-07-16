import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const outputRoot = path.resolve('outputs', 'complete-parity-task-02');
const profileRoot = path.resolve('outputs', '.visual-profile-task-02');
const port = 9322;

await mkdir(outputRoot, { recursive: true });
await mkdir(profileRoot, { recursive: true });

const browser = spawn(edge, [
  '--headless=new',
  '--disable-gpu',
  '--disable-gpu-compositing',
  '--disable-extensions',
  '--disable-background-networking',
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${profileRoot}`,
  '--window-size=1440,1000',
  'http://127.0.0.1:4173/',
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
  await delay(1400);
  await send('Runtime.evaluate', { expression: "document.head.insertAdjacentHTML('beforeend', '<style>*{animation:none!important;transition:none!important}</style>')" });

  await send('Runtime.evaluate', { expression: "document.documentElement.dataset.theme='light'" });
  await capture(send, 'create-light.png', 1440, 1000);
  await send('Runtime.evaluate', { expression: "document.documentElement.dataset.theme='dark'" });
  await capture(send, 'create-dark.png', 1440, 1000);
  await capture(send, 'create-narrow.png', 760, 1000);
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await send('Runtime.evaluate', { expression: "[...document.querySelectorAll('button')].find((button) => button.getAttribute('aria-label') === '首页')?.click()" });
  await delay(1000);
  await capture(send, 'home.png', 1440, 1000);
  socket.close();
} finally {
  browser.kill();
}

async function capture(send, name, width, height) {
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
  await delay(180);
  const { data } = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false, fromSurface: true });
  await writeFile(path.join(outputRoot, name), Buffer.from(data, 'base64'));
}

async function waitForPage() {
  let lastError;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`);
      const pages = await response.json();
      const page = pages.find((entry) => entry.type === 'page' && entry.url.startsWith('http://127.0.0.1:4173/'));
      if (page) return page;
    } catch (error) {
      lastError = error;
    }
    await delay(100);
  }
  throw lastError ?? new Error('Headless Edge did not expose a page target.');
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
