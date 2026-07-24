# 设置中心三方案 HTML 预览 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 创建一个离线单文件 VedioNotes 设置中心预览，可在同一内容上切换 A/B/C 三种顶部导航，并证明紧凑标题与“关于”页长文本在常见宽度下不溢出。

**Architecture:** 使用一个 `.settings-concept-root` 独立根节点承载完整桌面 Shell；`data-variant` 控制三套导航布局，`data-active-tab` 控制五页面板，`data-stress` 控制正常与极端长文本。静态 Node 契约测试锁定结构和隔离边界，Edge 负责真实渲染与截图。

**Tech Stack:** 单文件 HTML5、原生 CSS（Grid/Flex/Container Queries）、内联 SVG、原生 JavaScript、Node.js `node:test`、Microsoft Edge。

## Global Constraints

- 不修改 `src/`、`public/`、`src-tauri/`、根 `index.html`、Tauri 配置或安装包。
- 不导入 React、HeroUI、生产 CSS、Tauri API、远程字体、脚本、图片或任何网络资源。
- 不恢复 `.sidebar-brand`、`.workspace-profile`、“本地工作区”或“隐私模式”。
- 不增加 UI 库，不使用 Python，不生成 MSI/NSIS。
- 三种方案必须共享同一内容和状态；默认分类为“关于”。
- 桌面五项横向一整行；窄容器只在导航自身滚动或按方案 C 换行，document/body 不横向溢出。

---

### Task 1: 建立离线预览静态契约（RED）

**Files:**
- Create: `tests/static/settings-center-concept-preview.test.mjs`
- Test target: `.codex-research/tauri-react-ui/vedionotes-settings-center-concept.html`

**Interfaces:**
- Consumes: 设计规格中的变体 ID `a | b | c`、分类 ID `appearance | transcription | ai | data | about`。
- Produces: 一个直接通过 `node` 执行的静态门禁，后续 HTML 必须满足其结构与隔离断言。

- [ ] **Step 1: 写入会因 HTML 尚不存在而失败的测试**

```js
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const previewPath = resolve('.codex-research/tauri-react-ui/vedionotes-settings-center-concept.html');

test('settings center concept is an isolated offline A/B/C preview', () => {
  assert.ok(existsSync(previewPath), `missing ${previewPath}`);
  const html = readFileSync(previewPath, 'utf8');
  for (const variant of ['a', 'b', 'c']) assert.match(html, new RegExp(`data-preview-variant=["']${variant}["']`));
  for (const tab of ['appearance', 'transcription', 'ai', 'data', 'about']) assert.match(html, new RegExp(`data-settings-tab=["']${tab}["']`));
  assert.match(html, /role=["']tablist["']/);
  assert.match(html, /aria-selected/);
  assert.match(html, /overflow-wrap:\s*anywhere/);
  assert.match(html, /word-break:\s*break-word/);
  assert.match(html, /container-type:\s*inline-size/);
  assert.match(html, /function\s+auditLayout\s*\(/);
  assert.match(html, /data-copy=["']stress["']/);
  assert.doesNotMatch(html, /<script\s+[^>]*src=|<link\s+[^>]*rel=["']stylesheet|<(?:script|img|link)\b[^>]*(?:src|href)=["']https?:|@tauri-apps|@heroui/i);
  assert.doesNotMatch(html, /sidebar-brand|workspace-profile|本地工作区|隐私模式|<select\b/i);
});
```

- [ ] **Step 2: 运行 RED 测试**

Run: `node --test tests/static/settings-center-concept-preview.test.mjs`

Expected: FAIL，错误包含 `missing D:\Project\notes\.codex-research\tauri-react-ui\vedionotes-settings-center-concept.html`。

### Task 2: 实现三方案单文件 HTML（GREEN）

**Files:**
- Create: `.codex-research/tauri-react-ui/vedionotes-settings-center-concept.html`
- Test: `tests/static/settings-center-concept-preview.test.mjs`

**Interfaces:**
- Consumes: `data-preview-variant`、`data-settings-tab` 与静态门禁。
- Produces: `state = { variant, tab, stress }`、`renderState()`、`selectTab(id)`、`auditLayout()` 和 `window.__SETTINGS_PREVIEW_AUDIT__`。

- [ ] **Step 1: 创建完整桌面 Shell 与紧凑设置头**

HTML 使用以下稳定层级；主侧栏只包含现有入口和状态/设置/折叠按钮：

```html
<body class="settings-concept-root" data-variant="a" data-active-tab="about" data-stress="false">
  <header class="window-bar">
    <div class="window-identity"><span class="window-mark" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M8 6.5v11l9-5.5-9-5.5Z"/></svg></span><strong>VedioNotes</strong></div>
    <span class="window-caption">本地视频提炼工作台</span>
  </header>
  <div class="app-shell">
    <aside class="app-sidebar" aria-label="应用导航">
      <nav class="app-nav">
        <button type="button"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg><span>新建提炼</span></button>
        <button type="button"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z"/></svg><span>首页</span></button>
        <button type="button"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M5 4.5A2.5 2.5 0 0 1 7.5 2H20v17H7.5A2.5 2.5 0 0 0 5 21.5m0-17v17m0-17H4v17h3.5"/></svg><span>笔记库</span></button>
        <button type="button"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 5.5h16v11H9l-5 4ZM8 9h8M8 13h5"/></svg><span>AI 问答</span></button>
        <button type="button"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 5v5h5M5.5 9A8 8 0 1 1 4 14M12 8v5l3 2"/></svg><span>历史任务</span></button>
      </nav>
      <footer class="app-sidebar-footer"><span role="status"><i class="status-dot" aria-hidden="true"></i>服务正常</span><button type="button" aria-current="page">设置</button><button type="button">收起侧边栏</button></footer>
    </aside>
    <main class="settings-stage" aria-label="设置中心三方案预览">
      <div class="preview-toolbar" aria-label="预览控制">
        <div role="group" aria-label="布局方案"><button type="button" data-preview-variant="a" aria-pressed="true">方案 A · 分段卡片</button><button type="button" data-preview-variant="b" aria-pressed="false">方案 B · 下划线</button><button type="button" data-preview-variant="c" aria-pressed="false">方案 C · 同行标题</button></div>
        <button type="button" data-stress-toggle aria-pressed="false">长文本压力测试</button>
        <span data-audit-badge data-state="pending" role="status">布局检查中</span>
      </div>
      <section class="settings-page" data-layout-root>
        <header class="settings-header"><div><span class="settings-eyebrow">SETTINGS</span><h1 class="settings-title">设置</h1><p>管理外观、转写、AI 服务、数据与应用信息。</p></div><span class="settings-context">当前：关于</span></header>
        <nav class="settings-tabs-shell" aria-label="设置分类">
          <div class="settings-tab-list" role="tablist"><button type="button" class="settings-tab" role="tab" data-settings-tab="appearance" aria-selected="false">外观</button><button type="button" class="settings-tab" role="tab" data-settings-tab="transcription" aria-selected="false">语音转文字</button><button type="button" class="settings-tab" role="tab" data-settings-tab="ai" aria-selected="false">AI 接入</button><button type="button" class="settings-tab" role="tab" data-settings-tab="data" aria-selected="false">数据管理</button><button type="button" class="settings-tab" role="tab" data-settings-tab="about" aria-selected="true">关于</button></div>
        </nav>
        <section class="settings-content">
          <section role="tabpanel" data-settings-panel="appearance" hidden><h2>外观</h2><article class="preview-card">主题、界面密度与减少动画</article></section>
          <section role="tabpanel" data-settings-panel="transcription" hidden><h2>语音转文字</h2><article class="preview-card">SenseVoice、Whisper、CUDA 与在线转写</article></section>
          <section role="tabpanel" data-settings-panel="ai" hidden><h2>AI 接入</h2><article class="preview-card">116 个服务商、3,926 个模型与四种协议</article></section>
          <section role="tabpanel" data-settings-panel="data" hidden><h2>数据管理</h2><article class="preview-card">Markdown 输出、导出、缓存与日志</article></section>
          <section role="tabpanel" data-settings-panel="about"><h2 class="sr-only">关于</h2><div class="about-layout" data-overflow-watch="about-layout"></div></section>
        </section>
      </section>
    </main>
  </div>
</body>
```

- [ ] **Step 2: 使用变体 CSS 实现三种导航，不复制内容 DOM**

关键规则必须实际写入 HTML 的 `<style>`：

```css
.settings-stage { container-type: inline-size; min-width: 0; }
.settings-header { padding: 0 0 12px; }
.settings-title { margin: 2px 0; font-size: clamp(30px, 3.2cqi, 34px); line-height: 1.08; }
.settings-tab-list { display: flex; min-width: max-content; }
[data-variant='a'] .settings-tabs-shell { padding: 7px; border: 1px solid var(--border); border-radius: 16px; background: var(--surface); }
[data-variant='a'] .settings-tab { flex: 1 1 0; min-width: 112px; border-radius: 11px; }
[data-variant='b'] .settings-tabs-shell { border-bottom: 1px solid var(--border); }
[data-variant='b'] .settings-tab[aria-selected='true']::after { content: ''; position: absolute; inset: auto 14px -1px; height: 2px; background: var(--accent); }
[data-variant='c'] .settings-page { grid-template-columns: minmax(220px, .55fr) minmax(560px, 1.45fr); }
[data-variant='c'] .settings-header { grid-column: 1; }
[data-variant='c'] .settings-tabs-shell { grid-column: 2; align-self: center; }
@container (max-width: 760px) {
  [data-variant='c'] .settings-page { grid-template-columns: minmax(0, 1fr); }
  [data-variant='c'] .settings-header,
  [data-variant='c'] .settings-tabs-shell { grid-column: 1; }
  .settings-tabs-shell { overflow-x: auto; }
}
```

- [ ] **Step 3: 实现关于页的正常/压力数据和安全断行**

每个动态文本节点放入 `.safe-copy`，并保留两份只由 `data-stress` 切换的文本：

```css
.safe-copy,
.safe-card,
.safe-card * { min-width: 0; max-width: 100%; overflow-wrap: anywhere; word-break: break-word; }
.component-card { min-height: 132px; display: grid; align-content: start; gap: 12px; }
.component-head { display: flex; flex-wrap: wrap; align-items: flex-start; gap: 10px; }
.component-copy { flex: 1 1 180px; }
.status-chip { flex: 0 1 auto; white-space: normal; line-height: 1.35; }
[data-copy='stress'] { display: none; }
[data-stress='true'] [data-copy='normal'] { display: none; }
[data-stress='true'] [data-copy='stress'] { display: initial; }
```

压力文本至少包含 80 字符 SemVer、连续组件名、`not_installed_because_runtime_component_signature_is_missing`、长 SPDX、64 位 SHA、UNC 路径和长中英说明。

- [ ] **Step 4: 实现五页与预览交互**

```js
const state = { variant: 'a', tab: 'about', stress: false };
const tabOrder = ['appearance', 'transcription', 'ai', 'data', 'about'];

function renderState() {
  document.body.dataset.variant = state.variant;
  document.body.dataset.activeTab = state.tab;
  document.body.dataset.stress = String(state.stress);
  document.querySelectorAll('[data-preview-variant]').forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.previewVariant === state.variant));
  });
  document.querySelectorAll('[data-settings-tab]').forEach((button) => {
    button.setAttribute('aria-selected', String(button.dataset.settingsTab === state.tab));
    button.tabIndex = button.dataset.settingsTab === state.tab ? 0 : -1;
  });
  document.querySelectorAll('[data-settings-panel]').forEach((panel) => {
    panel.hidden = panel.dataset.settingsPanel !== state.tab;
  });
  requestAnimationFrame(auditLayout);
}

function selectTab(id, moveFocus = false) {
  if (!tabOrder.includes(id)) return;
  state.tab = id;
  renderState();
  if (moveFocus) document.querySelector(`[data-settings-tab="${id}"]`)?.focus();
}

const query = new URLSearchParams(location.search);
if (['a', 'b', 'c'].includes(query.get('variant'))) state.variant = query.get('variant');
if (tabOrder.includes(query.get('tab'))) state.tab = query.get('tab');
state.stress = query.get('stress') === '1';

document.querySelectorAll('[data-preview-variant]').forEach((button) => {
  button.addEventListener('click', () => { state.variant = button.dataset.previewVariant; renderState(); });
});
document.querySelector('[data-stress-toggle]').addEventListener('click', () => { state.stress = !state.stress; renderState(); });
document.querySelectorAll('[data-settings-tab]').forEach((button) => {
  button.addEventListener('click', () => selectTab(button.dataset.settingsTab));
  button.addEventListener('keydown', (event) => {
    const index = tabOrder.indexOf(state.tab);
    const next = event.key === 'ArrowRight' ? tabOrder[(index + 1) % tabOrder.length]
      : event.key === 'ArrowLeft' ? tabOrder[(index - 1 + tabOrder.length) % tabOrder.length]
      : event.key === 'Home' ? tabOrder[0]
      : event.key === 'End' ? tabOrder.at(-1)
      : null;
    if (next) { event.preventDefault(); selectTab(next, true); }
  });
});
new ResizeObserver(auditLayout).observe(document.querySelector('[data-layout-root]'));
renderState();
```

点击方案、标签、压力开关时只更新 `state`；标签支持 ArrowLeft/ArrowRight/Home/End。URL 查询参数 `variant`、`tab`、`stress=1` 直接打开指定截图状态。

- [ ] **Step 5: 内置几何审计**

```js
function auditLayout() {
  const candidates = [document.documentElement, document.body, ...document.querySelectorAll('[data-overflow-watch]')];
  const failures = candidates.filter((element) => element.scrollWidth - element.clientWidth > 1);
  const result = { pass: failures.length === 0, failures: failures.map((element) => element.dataset.overflowWatch || element.tagName) };
  document.querySelector('[data-audit-badge]').textContent = result.pass ? '布局检查：无横向溢出' : `布局检查失败：${result.failures.join('、')}`;
  document.querySelector('[data-audit-badge]').dataset.state = result.pass ? 'pass' : 'fail';
  window.__SETTINGS_PREVIEW_AUDIT__ = result;
}
```

- [ ] **Step 6: 运行静态测试并转为 GREEN**

Run: `node --test tests/static/settings-center-concept-preview.test.mjs`

Expected: PASS，1 个测试、0 failures。

### Task 3: Edge 真实渲染与交付

**Files:**
- Create: `outputs/settings-center-concept-preview/a-1280.png`
- Create: `outputs/settings-center-concept-preview/b-1280.png`
- Create: `outputs/settings-center-concept-preview/c-1280.png`
- Create: `outputs/settings-center-concept-preview/a-1024.png`
- Create: `outputs/settings-center-concept-preview/a-820-stress.png`
- Modify: `.planning/settings-center-html-preview/progress.md`

**Interfaces:**
- Consumes: HTML URL 参数和 `window.__SETTINGS_PREVIEW_AUDIT__`。
- Produces: 四张本地截图、可直接打开的 HTML 和验证记录。

- [ ] **Step 1: 验证 HTML 语法与完整静态门禁**

Run:

```powershell
node --test tests/static/settings-center-concept-preview.test.mjs
git -c safe.directory=D:/Project/notes diff --check -- .codex-research/tauri-react-ui/vedionotes-settings-center-concept.html tests/static/settings-center-concept-preview.test.mjs
```

Expected: 测试 PASS，`git diff --check` exit 0。

- [ ] **Step 2: 用 Edge 生成三种桌面方案和一张窄窗压力截图**

使用本机 Edge：

```powershell
$edge='C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
$html='file:///D:/Project/notes/.codex-research/tauri-react-ui/vedionotes-settings-center-concept.html'
& $edge --headless=new --disable-gpu --force-device-scale-factor=1 --window-size=1280,800 --screenshot='outputs/settings-center-concept-preview/a-1280.png' "$html?variant=a&tab=about"
& $edge --headless=new --disable-gpu --force-device-scale-factor=1 --window-size=1280,800 --screenshot='outputs/settings-center-concept-preview/b-1280.png' "$html?variant=b&tab=about"
& $edge --headless=new --disable-gpu --force-device-scale-factor=1 --window-size=1280,800 --screenshot='outputs/settings-center-concept-preview/c-1280.png' "$html?variant=c&tab=about"
& $edge --headless=new --disable-gpu --force-device-scale-factor=1 --window-size=1024,760 --screenshot='outputs/settings-center-concept-preview/a-1024.png' "$html?variant=a&tab=about"
& $edge --headless=new --disable-gpu --force-device-scale-factor=1 --window-size=820,720 --screenshot='outputs/settings-center-concept-preview/a-820-stress.png' "$html?variant=a&tab=about&stress=1"
```

Expected: 五个 PNG 均非白图，标题区紧凑，五项横排，审计徽标显示“无横向溢出”。

- [ ] **Step 3: 逐图检查并修复任何溢出或层级问题**

使用本地图片查看器检查五张 PNG；若任一图失败，先把失败记录写入 `.planning/settings-center-html-preview/task_plan.md`，再做最小 CSS/DOM 修复并重新生成该图。

- [ ] **Step 4: 打开交互式 HTML 给用户**

Run:

```powershell
Start-Process 'D:\Project\notes\.codex-research\tauri-react-ui\vedionotes-settings-center-concept.html'
```

Expected: 默认浏览器显示方案 A + 关于页，用户可切换三方案、五个分类和长文本压力状态。

- [ ] **Step 5: 记录验证并提交本轮源码型交付**

仅提交设计预览和静态测试；`outputs/` 与 `.planning/` 保持为本地证据：

```powershell
git -c safe.directory=D:/Project/notes add -- .codex-research/tauri-react-ui/vedionotes-settings-center-concept.html tests/static/settings-center-concept-preview.test.mjs docs/superpowers/plans/2026-07-24-settings-center-html-preview.md
git -c safe.directory=D:/Project/notes commit -m "feat: add settings center layout previews" -- .codex-research/tauri-react-ui/vedionotes-settings-center-concept.html tests/static/settings-center-concept-preview.test.mjs docs/superpowers/plans/2026-07-24-settings-center-html-preview.md
```

Expected: commit 只包含上述三个文件；生产 `src/`、Rust 和 Tauri 文件均不在提交中。
