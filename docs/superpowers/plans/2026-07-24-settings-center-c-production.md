# 设置中心 C 方案生产落地 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将已批准的 C 方案应用到真实 React 设置中心，使紧凑标题与五项分类在桌面同行、窄容器安全拆行，并让 About 全部信息卡片支持长文本而不溢出。

**Architecture:** 保留现有受控 HeroUI Tabs、五个业务 Tab、父级 section 状态和平台适配层。只调整 `CipherSettingsShell` 的 DOM 层级与限定 CSS，并为 `AboutTab` 增加使用现有 `AboutSnapshot` 数据的安全卡片结构；响应式完全依据设置根/内容容器宽度，而不是 viewport。

**Tech Stack:** React 19、TypeScript、HeroUI Tabs/Card/Chip/Button、Gravity UI SVG 图标、原生 CSS container queries、Vitest/Testing Library、Node 静态契约、Edge/CDP。

## Global Constraints

- 不修改应用主导航、窗口控制、Tauri 标题栏/无边框逻辑、路由、保存逻辑、平台适配层、Rust 后端或数据结构。
- 不引入新 UI 库，不重写五个设置业务页，不改变现有浅色/深色主题 token。
- 不恢复 `.sidebar-brand`、`.workspace-profile`、“本地工作区”或“隐私模式”。
- 当前生产文件已有用户未提交改动；必须在当前内容上做最小补丁，不 reset、checkout 或覆盖整文件。
- 因重叠文件包含既有改动，本轮不自动提交生产文件；使用逐文件 diff、测试和最终白名单报告区分本轮内容。
- 项目禁止 Python；所有验证使用 Node、PowerShell、Vitest、Vite 和 Edge。
- 已批准设计来源：`docs/superpowers/specs/2026-07-24-settings-center-html-preview-design.md`；用户最终选择方案 C。

---

### Task 1: C 方案 Shell 拓扑与容器响应式

**Files:**
- Modify: `src/features/settings/CipherSettingsShell.test.tsx`
- Create: `tests/static/settings-center-c-production.test.mjs`
- Modify: `src/features/settings/CipherSettingsShell.tsx`
- Modify: `src/styles/cipher-settings.css`

**Interfaces:**
- Consumes: `SettingsEntryProps.section`、`onSelectSection` 和现有 `tabs` 配置。
- Produces: `.settings-shell-layout` 的 header / top navigation / body 三层结构，保留 `.settings-tabs`、`.settings-body` 稳定选择器并彻底移除旧 `.settings-navigation-rail`。

- [ ] **Step 1: 写 Shell 失败行为测试**

在 `CipherSettingsShell.test.tsx` 导入 `userEvent` 与 `within`，增加以下测试：

```tsx
it('places the compact heading and five settings tabs in the C layout header row', () => {
  const { container } = render(<CipherSettingsShell {...baseProps} section="ai" />);
  const layout = container.querySelector('.settings-shell-layout');
  expect(layout).toBeTruthy();
  expect(layout?.children[0]?.classList.contains('settings-page-header')).toBe(true);
  expect(layout?.children[1]?.classList.contains('settings-navigation-tabs')).toBe(true);
  expect(layout?.children[2]?.classList.contains('settings-body')).toBe(true);
  expect(container.querySelector('.settings-navigation-rail')).toBeNull();
  expect(container.querySelector('.settings-navigation-heading')).toBeNull();

  const tablist = screen.getByRole('tablist', { name: '设置分类' });
  expect(within(tablist).getAllByRole('tab').map((tab) => tab.textContent?.trim())).toEqual([
    '外观', '语音转文字', 'AI 接入', '数据管理', '关于',
  ]);
  expect(within(tablist).getByRole('tab', { name: 'AI 接入' }).getAttribute('aria-selected')).toBe('true');
});

it('keeps the existing controlled section change contract', async () => {
  const onSelectSection = vi.fn();
  render(<CipherSettingsShell {...baseProps} section="appearance" onSelectSection={onSelectSection} />);
  await userEvent.click(screen.getByRole('tab', { name: '数据管理' }));
  expect(onSelectSection).toHaveBeenCalledTimes(1);
  expect(onSelectSection).toHaveBeenCalledWith('data');
});
```

- [ ] **Step 2: 写生产 CSS/源码静态失败契约**

创建 `tests/static/settings-center-c-production.test.mjs`，完整内容：

```js
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const read = (path) => readFileSync(resolve(path), 'utf8');

test('production Cipher settings uses the approved C layout and container queries', () => {
  const shell = read('src/features/settings/CipherSettingsShell.tsx');
  const css = read('src/styles/cipher-settings.css');

  assert.match(shell, /settings-shell-layout[\s\S]*settings-page-header[\s\S]*settings-navigation-tabs[\s\S]*settings-body/);
  assert.doesNotMatch(shell, /settings-navigation-rail/);
  assert.doesNotMatch(shell, /settings-navigation-heading/);
  assert.match(css, /\.cipher-settings-root\.settings-page\s*\{[^}]*container-type:\s*inline-size[^}]*container-name:\s*settings-stage/s);
  assert.match(css, /\.cipher-settings-root \.settings-shell-layout\s*\{[^}]*grid-template-areas:\s*['"]header tabs['"]\s*['"]body body['"]/s);
  assert.match(css, /@container settings-stage \(max-width:\s*900px\)/);
  assert.match(css, /@container settings-stage \(max-width:\s*620px\)/);
  assert.match(css, /\.cipher-settings-root \.settings-navigation-tabs\s*\{[^}]*overflow-x:\s*auto/s);
  assert.match(css, /\.cipher-settings-root \.settings-body\s*\{[^}]*grid-area:\s*body/s);
});
```

- [ ] **Step 3: 运行 RED**

Run:

```powershell
npx vitest run src/features/settings/CipherSettingsShell.test.tsx
node --test tests/static/settings-center-c-production.test.mjs
```

Expected: React 测试因 `.settings-navigation-tabs` 不存在/旧 rail 仍在而失败；静态测试因 container 与 grid area 规则不存在而失败。

- [ ] **Step 4: 最小重排 Shell JSX**

将 `CipherSettingsShell.tsx` 的 return 主体改为以下拓扑；Tabs 配置、`selectedKey`、`onSelectionChange` 和五个条件页面保持原样：

```tsx
<div className="cipher-settings-root settings-page" data-theme={props.theme} role="region" aria-label="设置工作区">
  <div className="settings-shell-layout">
    <header className="settings-page-header">
      <div className="settings-page-header-copy">
        <span className="workspace-eyebrow">SETTINGS</span>
        <h1>设置</h1>
        <p>管理外观、转写、AI 服务、数据与应用信息。</p>
      </div>
      <span className="settings-page-context">当前：{activeTabLabel}</span>
    </header>

    <nav className="settings-navigation-tabs" aria-label="设置分类导航">
      <Tabs selectedKey={activeTab} onSelectionChange={selectTab} className="settings-tabs">
        <Tabs.ListContainer>
          <Tabs.List aria-label="设置分类">
            {tabs.map((tab) => (
              <Tabs.Tab key={tab.id} id={tab.id}>
                <tab.icon width={17} height={17} aria-hidden />
                {tab.label}
                <Tabs.Indicator />
              </Tabs.Tab>
            ))}
          </Tabs.List>
        </Tabs.ListContainer>
      </Tabs>
    </nav>

    <ScrollShadow className="settings-body" hideScrollBar size={64}>
      {activeTab === 'appearance' && <AppearanceTab {...props} />}
      {activeTab === 'transcription' && <TranscriptionTab {...props} />}
      {activeTab === 'ai' && <AiAccessTab {...props} />}
      {activeTab === 'data' && <DataManagementTab {...props} />}
      {activeTab === 'about' && <AboutTab {...props} />}
    </ScrollShadow>
  </div>
</div>
```

- [ ] **Step 5: 实现 C Shell CSS**

在 `cipher-settings.css` 中用以下职责替换旧 Shell/rail/tab/body 规则：

```css
.cipher-settings-root.settings-page {
  container-type: inline-size;
  container-name: settings-stage;
  gap: 0;
  padding: clamp(20px, 2.3vw, 28px);
}

.cipher-settings-root .settings-shell-layout {
  display: grid;
  grid-template-columns: minmax(250px, .56fr) minmax(560px, 1.44fr);
  grid-template-rows: auto minmax(0, 1fr);
  grid-template-areas: "header tabs" "body body";
  gap: 9px 18px;
  flex: 1;
  min-width: 0;
  min-height: 0;
}

.cipher-settings-root .settings-page-header {
  grid-area: header;
  min-width: 0;
  min-height: 67px;
  padding: 5px 2px 10px;
  border-bottom: 0;
}

.cipher-settings-root .settings-page-header h1 {
  margin: 2px 0 1px;
  font-size: clamp(30px, 3.2cqi, 34px);
  font-weight: 720;
  line-height: 1.08;
}

.cipher-settings-root .settings-page-header p { margin: 0; font-size: 12px; line-height: 1.35; }
.cipher-settings-root .settings-page-context { display: none; }

.cipher-settings-root .settings-navigation-tabs {
  grid-area: tabs;
  min-width: 0;
  align-self: center;
  padding: 5px;
  overflow-x: auto;
  overflow-y: hidden;
  border: 1px solid var(--border);
  border-radius: 14px;
  background: var(--surface);
  box-shadow: 0 8px 24px rgba(25, 48, 40, .06);
  scrollbar-width: thin;
}

.cipher-settings-root .settings-navigation-tabs [role='tablist'] {
  width: 100%;
  min-width: 540px;
  display: flex;
  flex-direction: row;
  align-items: stretch;
  gap: 5px;
}

.cipher-settings-root .settings-navigation-tabs [role='tab'] {
  width: auto;
  min-width: 102px;
  min-height: 40px;
  flex: 1 1 0;
  justify-content: center;
  gap: 8px;
  padding: 0 12px;
  border-radius: 9px;
  text-align: center;
}

.cipher-settings-root .settings-body {
  grid-area: body;
  padding: clamp(16px, 2.1cqi, 24px);
}

.cipher-settings-root .settings-body > * { width: 100%; min-width: 0; margin: 0; }
.cipher-settings-root .settings-body > .tab-content { container-type: inline-size; container-name: settings-panel; }

@container settings-stage (max-width: 900px) {
  .cipher-settings-root .settings-shell-layout {
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: auto auto minmax(0, 1fr);
    grid-template-areas: "header" "tabs" "body";
  }
  .cipher-settings-root .settings-page-header { border-bottom: 1px solid var(--border); }
  .cipher-settings-root .settings-page-context { display: inline-flex; }
}

@container settings-stage (max-width: 620px) {
  .cipher-settings-root .settings-navigation-tabs [role='tablist'] { width: max-content; min-width: 570px; }
}
```

删除 `.settings-navigation-rail*` 与 `.settings-navigation-heading*` 规则；从旧 `@media(max-width:768px)` 删除 Shell/header/rail/tab 规则，避免覆盖容器布局。生产源码和 CSS 中均不得残留旧 rail 名称。

- [ ] **Step 6: 运行 Task 1 GREEN**

Run:

```powershell
npx vitest run src/features/settings/CipherSettingsShell.test.tsx
node --test tests/static/settings-center-c-production.test.mjs tests/static/settings-css-isolation.test.mjs
```

Expected: 全部通过，且 CSS isolation 不报告未限定选择器。

---

### Task 2: About 信息卡片与安全断行

**Files:**
- Modify: `src/features/settings/tabs/AboutTab.test.tsx`
- Modify: `src/features/settings/tabs/AboutTab.tsx`
- Modify: `src/styles/cipher-settings.css`
- Modify: `tests/static/settings-center-c-production.test.mjs`

**Interfaces:**
- Consumes: 现有 `AboutSnapshot` 的 app/version/component/path 字段和 `settingsPlatform.about` 的五个现有方法。
- Produces: `.cipher-about-*` 生产类，三个真实目录路径卡片，长状态/版本/许可证/commit/路径安全换行。

- [ ] **Step 1: 写 About 长文本失败测试**

将 About mock 改为包含以下压力数据：

```tsx
const longStatus = 'not_installed_because_runtime_component_signature_is_missing';
const longPath = String.raw`\\server-name-that-is-intentionally-very-long\VedioNotes\structured-redacted-logs\2026\07\24\session_identifier_without_breakpoints_915bf7d76e1e28b87c9477d4fef51d0b`;

vi.spyOn(settingsPlatform.about, 'getAboutSnapshot').mockResolvedValue({
  appVersion: '0.0.1-preview.20260724.super-long-prerelease-channel-windows.x86_64.webview2',
  tauriVersion: '2.11.5+wry.0.55.1.webview2-custom-protocol',
  frontendVersion: '19.1.0+typescript.5.x.vite.7',
  rustVersion: '1.91 stable windows-msvc',
  appDataDir: longPath,
  exportDir: String.raw`D:\VedioNotes\MarkdownOutputs\one_single_uninterrupted_export_folder_name`,
  logDir: longPath,
  components: [{
    name: 'whisper_cpp_cuda_runtime_gpu_transcription_sidecar_and_local_model_component',
    version: 'whisper.cpp-b6414-cuda-12.8-sm_75-sm_86-windows-x86_64.release-portable.sidecar',
    status: longStatus,
    license: 'MIT-AND-NVIDIA-CUDA-Toolkit-EULA-component-runtime-distribution-metadata',
  }],
});
```

增加断言：

```tsx
it('renders long component metadata and all snapshot directories inside safe cards', async () => {
  const { container } = render(<AboutTab {...baseProps} />);
  expect(await screen.findByText(longStatus)).toBeTruthy();
  expect(screen.getAllByText(longPath).length).toBe(2);
  expect(container.querySelector('.cipher-about-component-card')).toBeTruthy();
  expect(container.querySelectorAll('.cipher-about-directory-card')).toHaveLength(3);
  expect(container.querySelector('.cipher-about-version-card')).toBeTruthy();
  expect(container.querySelector('.cipher-about-source-card')).toBeTruthy();
});
```

- [ ] **Step 2: 扩展静态失败契约**

在 `settings-center-c-production.test.mjs` 增加：

```js
test('production About cards use container-based safe wrapping', () => {
  const about = read('src/features/settings/tabs/AboutTab.tsx');
  const css = read('src/styles/cipher-settings.css');
  for (const className of [
    'cipher-about-panel', 'cipher-about-component-grid', 'cipher-about-component-card',
    'cipher-about-version-card', 'cipher-about-directory-grid', 'cipher-about-directory-card',
    'cipher-about-source-card',
  ]) assert.ok(about.includes(className), `AboutTab exposes ${className}`);
  assert.match(css, /@container settings-panel \(max-width:\s*780px\)/);
  assert.match(css, /@container settings-panel \(max-width:\s*700px\)/);
  assert.match(css, /\.cipher-settings-root \.cipher-about-safe-copy[^}]*overflow-wrap:\s*anywhere[^}]*word-break:\s*break-word/s);
  assert.match(about, /snapshot\.appDataDir/);
  assert.match(about, /snapshot\.exportDir/);
  assert.match(about, /snapshot\.logDir/);
});
```

- [ ] **Step 3: 运行 RED**

Run:

```powershell
npx vitest run src/features/settings/tabs/AboutTab.test.tsx
node --test tests/static/settings-center-c-production.test.mjs
```

Expected: 因新 `.cipher-about-*` 卡片和路径文本不存在而失败。

- [ ] **Step 4: 最小重构 About JSX**

保留 loading/error/effect 和所有现有平台调用。将 snapshot 内容组织为：

```text
.cipher-about-panel
├─ .cipher-about-hero
├─ .cipher-about-primary-grid
│  ├─ 运行组件 → .cipher-about-component-grid → component cards
│  └─ .cipher-about-version-card
├─ 相关链接按钮（仍调用 openDocumentation）
├─ .cipher-about-directory-grid（appDataDir/exportDir/logDir + 原 open 回调）
└─ .cipher-about-source-card（commit/license/说明）
```

目录数据在组件中使用现有字段和方法构造：

```tsx
const directories = snapshot ? [
  { id: 'app-data', label: '应用数据目录', path: snapshot.appDataDir, open: settingsPlatform.about.openAppDataDirectory },
  { id: 'export', label: 'Markdown 导出目录', path: snapshot.exportDir, open: settingsPlatform.about.openExportDirectory },
  { id: 'logs', label: '诊断日志目录', path: snapshot.logDir, open: settingsPlatform.about.openLogDirectory },
] : [];
```

每个动态值节点同时使用 `cipher-about-safe-copy`；Chip.Label 使用该类并允许多行。所有 Card/Header/Content 仍用 HeroUI，不新增组件库，不改变打开目录/文档行为。

- [ ] **Step 5: 实现 About CSS 和容器降列**

新增限定规则：

```css
.cipher-settings-root .cipher-about-panel {
  min-width: 0;
  max-width: 100%;
  display: grid;
  gap: 20px;
}

.cipher-settings-root .cipher-about-safe-copy,
.cipher-settings-root .cipher-about-safe-copy * {
  min-width: 0;
  max-width: 100%;
  overflow-wrap: anywhere;
  word-break: break-word;
}

.cipher-settings-root .cipher-about-primary-grid {
  min-width: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(240px, 320px);
  gap: 18px;
  align-items: start;
}

.cipher-settings-root .cipher-about-component-grid {
  min-width: 0;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.cipher-settings-root .cipher-about-component-card { min-width: 0; min-height: 138px; }
.cipher-settings-root .cipher-about-component-head { display: flex; flex-wrap: wrap; align-items: flex-start; gap: 10px; }
.cipher-settings-root .cipher-about-component-copy { flex: 1 1 150px; min-width: 0; line-height: 1.5; }
.cipher-settings-root .cipher-about-component-status { flex: 0 1 auto; max-width: 150px; height: auto; white-space: normal; line-height: 1.35; }
.cipher-settings-root .cipher-about-component-version { font-size: 12px; line-height: 1.5; }

.cipher-settings-root .cipher-about-version-card { min-width: 0; display: grid; gap: 0; padding: 18px; }
.cipher-settings-root .cipher-about-version-list { min-width: 0; display: grid; gap: 0; }
.cipher-settings-root .cipher-about-version-item { min-width: 0; display: grid; grid-template-columns: minmax(84px, .45fr) minmax(0, 1fr); gap: 12px; padding: 10px 0; border-bottom: 1px solid var(--border); }

.cipher-settings-root .cipher-about-directory-grid { min-width: 0; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
.cipher-settings-root .cipher-about-directory-card { min-width: 0; min-height: 150px; }
.cipher-settings-root .cipher-about-directory-path { min-width: 0; font-size: 12px; line-height: 1.55; }

.cipher-settings-root .cipher-about-source-card { min-width: 0; }
.cipher-settings-root .cipher-about-source-row { min-width: 0; display: grid; grid-template-columns: minmax(84px, .25fr) minmax(0, 1fr); gap: 12px; padding: 9px 0; border-top: 1px solid var(--border); }

@container settings-panel (max-width: 780px) {
  .cipher-settings-root .cipher-about-primary-grid { grid-template-columns: minmax(0, 1fr); }
  .cipher-settings-root .cipher-about-version-list { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0 16px; }
  .cipher-settings-root .cipher-about-directory-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

@container settings-panel (max-width: 700px) {
  .cipher-settings-root .cipher-about-component-grid,
  .cipher-settings-root .cipher-about-directory-grid,
  .cipher-settings-root .cipher-about-version-list { grid-template-columns: minmax(0, 1fr); }
}
```

删除当前 JSX 未使用的 `.cipher-about-row*`、`.cipher-attribution-*` 和 `.cipher-component-*` 遗留规则；不删除其他设置页规则。

- [ ] **Step 6: 运行 Task 2 GREEN**

Run:

```powershell
npx vitest run src/features/settings/tabs/AboutTab.test.tsx src/features/settings/CipherSettingsShell.test.tsx
node --test tests/static/settings-center-c-production.test.mjs tests/static/settings-css-isolation.test.mjs tests/static/production-settings.structure.test.mjs
```

Expected: 全部通过；About 长字符串、三个目录路径和四类卡片结构均有测试证据。

---

### Task 3: 视觉门禁升级、真实 Edge 验收与全量回归

**Files:**
- Modify: `production-workbench.visual.test.mjs`
- Modify: `task13-settings-visual-matrix.mjs`
- Modify: `tests/static/visual-gate-contracts.test.mjs`
- Create generated evidence under: `outputs/settings-center-c-production/`
- Modify local planning logs: `.planning/settings-center-c-production/*.md`

**Interfaces:**
- Consumes: 现有 Vite/Tauri bridge mock、`.settings-tabs`、`.settings-navigation-tabs`、`.settings-body` 和新 `.cipher-about-*` DOM。
- Produces: 旧 rail 物理缺席断言、C 行内/堆叠几何探针、About 卡片溢出探针、1280/1024/820 的真实 Edge证据。

- [ ] **Step 1: 先写视觉门禁 RED**

在 `visual-gate-contracts.test.mjs` 增加/更新断言：

```js
assert.match(productionVisual, /\.settings-navigation-tabs/);
assert.doesNotMatch(productionVisual, /'\.settings-navigation-rail'/);
assert.match(settingsVisual, /railCount/);
assert.match(settingsVisual, /headerTabsInline/);
assert.match(settingsVisual, /headerTabsStacked/);
assert.match(settingsVisual, /aboutCardOverflowFailures/);
assert.match(settingsVisual, /not_installed_because_runtime_component_signature_is_missing/);
```

Run: `node --test tests/static/visual-gate-contracts.test.mjs`

Expected: 因当前视觉脚本仍引用旧 rail 且没有 C/About 探针而失败。

- [ ] **Step 2: 最小升级现有视觉脚本**

- `production-workbench.visual.test.mjs` 的宽度/几何选择器移除 `.settings-navigation-rail`，加入 `.settings-navigation-tabs`。
- `task13-settings-visual-matrix.mjs` 的 About mock 使用长组件名、状态、版本、许可证和三条长路径。
- `captureAndProbe()` 增加 `railCount`、header/nav/body rect、`headerTabsInline`、`headerTabsStacked` 和每个可见 About 卡片的 `scrollWidth/clientWidth` 检查；任一 rail、错误布局或卡片溢出加入 failures。
- 每次探测前等待 `document.fonts.ready`、双 `requestAnimationFrame` 和当前动画完成，避免固定延时下的漂移状态。

- [ ] **Step 3: 运行定向静态与单元门禁**

Run:

```powershell
npx vitest run src/features/settings/CipherSettingsShell.test.tsx src/features/settings/tabs/AboutTab.test.tsx tests/ui/App.test.tsx
$files=(Get-ChildItem -LiteralPath 'tests\static' -Filter '*.mjs' | Sort-Object Name).FullName
node --test $files
```

Expected: 0 failures；App 设置分类切换仍调用原状态链。

- [ ] **Step 4: 使用现有 Edge/CDP runner 生成设置矩阵**

Run:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/run-settings-visual-matrix.ps1 -OutputDir outputs/settings-center-c-production/matrix
```

Expected: runner 启动 Vite/Edge，所有页面/主题/DPR/宽度截图非白图，root/body 无横向溢出，五项切换正常。

- [ ] **Step 5: 补充 C 方案精确几何探测**

在 1280、1024、820 三档通过 CDP 读取：

```js
const header = document.querySelector('.settings-page-header').getBoundingClientRect();
const nav = document.querySelector('.settings-navigation-tabs').getBoundingClientRect();
const body = document.querySelector('.settings-body').getBoundingClientRect();
const cards = [...document.querySelectorAll('.cipher-about-component-card,.cipher-about-version-card,.cipher-about-directory-card,.cipher-about-source-card')];
return {
  inlineHeader: Math.abs(header.top - nav.top) <= 8,
  stackedHeader: nav.top >= header.bottom - 2,
  bodyBelowHeader: body.top >= Math.max(header.bottom, nav.bottom) - 2,
  rootOverflow: root.scrollWidth > root.clientWidth + 1,
  bodyOverflow: body.scrollWidth > body.clientWidth + 1,
  cardFailures: cards.filter((card) => card.scrollWidth > card.clientWidth + 1).map((card) => card.className),
};
```

Expected: 1280 `inlineHeader=true`；1024/820 `stackedHeader=true`；三档 `bodyBelowHeader=true`、root/body overflow false、cardFailures 空数组。

- [ ] **Step 6: 视觉复核截图**

检查 C 方案 light/dark、About 1280/1024/820，并确认：标题保持 30–34px；五项桌面单行；窄容器导航在标题下；版本/状态/路径/来源不越界；不出现旧左侧“设置中心”栏。

- [ ] **Step 7: 运行完整验证**

Run:

```powershell
npm test
npm run build
git -c safe.directory=D:/Project/notes diff --check -- src/features/settings/CipherSettingsShell.tsx src/features/settings/CipherSettingsShell.test.tsx src/features/settings/tabs/AboutTab.tsx src/features/settings/tabs/AboutTab.test.tsx src/styles/cipher-settings.css tests/static/settings-center-c-production.test.mjs
```

Expected: Vitest 全部通过；`tsc && vite build` exit 0；diff check 无空白错误。

- [ ] **Step 8: 最终白名单核对**

只报告本轮批准范围内的文件：Shell、About、限定 CSS、直接测试、必要视觉契约和本计划。明确说明工作区其他既有改动未清理、未提交、未推送；不宣称 Rust/Tauri 被修改。
