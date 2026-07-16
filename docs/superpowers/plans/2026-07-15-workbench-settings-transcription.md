# Workbench Settings and Transcription Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the redundant workspace topbar and replace the settings prototype with a six-category settings center whose transcription page offers CPU, GPU, and online modes.

**Architecture:** Keep the artifact as one network-independent HTML file with semantic sections and a small inline state controller. Extend the existing structural Node test so layout and interactions are contract-checked before implementation.

**Tech Stack:** HTML5, CSS custom properties, inline JavaScript, Node.js `assert` structural tests, Microsoft Edge headless screenshots.

## Global Constraints

- Modify only the standalone HTML prototype and its structural test; do not change production React/Tauri code.
- Do not call a network service, read credentials, or perform a real model download.
- Preserve the custom Windows titlebar, sidebar, page navigation, light/dark themes, responsive layout, and reduced-motion support.
- The project directory has no Git metadata, so commit steps are intentionally omitted.

---

### Task 1: Lock the approved structure with a failing contract test

**Files:**
- Modify: `D:\Project\notes\.superpowers\brainstorm\ui-proposal-1783996252\content\workbench-ciphertalk-inspired.structure.test.mjs`
- Test: `D:\Project\notes\.superpowers\brainstorm\ui-proposal-1783996252\content\workbench-ciphertalk-inspired.structure.test.mjs`

**Interfaces:**
- Consumes: the complete HTML file as a UTF-8 string.
- Produces: assertions for `settings-tabs`, six setting categories, `transcriptionModes`, three mode panels, `setSettingsSection(section, trigger)`, and `setTranscriptionMode(mode, trigger)`.

- [ ] **Step 1: Write the failing structural assertions**

Add assertions equivalent to:

```js
assert.doesNotMatch(html, /class="topbar"/, 'workspace duplicate topbar is removed')
assert.doesNotMatch(html, /class="model-pill/, 'workspace model pills are removed')
assert.match(html, /class="settings-tabs"[^>]*role="tablist"/, 'settings uses a horizontal category tablist')
for (const category of ['外观', '语音转文字', 'AI 总结', '模型管理', '数据管理', '关于']) {
  assert.ok(html.includes(category), `settings category ${category} exists`)
}
for (const mode of ['cpu', 'gpu', 'online']) {
  assert.match(html, new RegExp(`data-transcription-mode="${mode}"`), `transcription mode ${mode} exists`)
}
assert.match(html, /function\s+setSettingsSection\(/, 'settings category switching is interactive')
assert.match(html, /function\s+setTranscriptionMode\(/, 'transcription mode switching is interactive')
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```powershell
node 'D:\Project\notes\.superpowers\brainstorm\ui-proposal-1783996252\content\workbench-ciphertalk-inspired.structure.test.mjs'
```

Expected: FAIL because the existing HTML still contains `.topbar` and does not yet contain the new settings tablists or mode panels.

---

### Task 2: Implement the redundant main-content topbar（主内容顶栏）removal and three-mode settings center

**Files:**
- Modify: `D:\Project\notes\.superpowers\brainstorm\ui-proposal-1783996252\content\workbench-ciphertalk-inspired.html`
- Test: `D:\Project\notes\.superpowers\brainstorm\ui-proposal-1783996252\content\workbench-ciphertalk-inspired.structure.test.mjs`

**Interfaces:**
- Consumes: `setPage(page, trigger)`, `toggleTheme()`, and semantic buttons with `data-settings-section` / `data-transcription-mode` attributes.
- Produces: `setSettingsSection(section, trigger)` and `setTranscriptionMode(mode, trigger)`; visible state is represented by `.active` and `aria-selected="true"`.

- [ ] **Step 1: Remove the redundant topbar**

Delete the `.topbar`, `.topbar-title`, `.topbar-actions`, `.model-pill`, and obsolete responsive rules. Delete the `<div class="topbar">…</div>` markup. Simplify `setPage()` so it no longer updates `topbarKicker` or `topbarTitle`.

- [ ] **Step 2: Add the settings center styles and responsive rules**

Add styles for:

```css
.settings-tabs { display:flex; gap:6px; padding:6px; overflow-x:auto; border-radius:var(--radius-pill); background:var(--card-background); }
.settings-tab { min-height:44px; flex:1 0 auto; border:0; border-radius:var(--radius-pill); }
.settings-tab.active { background:var(--panel-background); color:var(--text-primary); box-shadow:var(--shadow-sm); }
.settings-panel, .transcription-panel { display:none; }
.settings-panel.active, .transcription-panel.active { display:block; }
.transcription-modes { display:grid; grid-template-columns:repeat(3,1fr); padding:5px; border-radius:var(--radius-pill); background:var(--card-background); }
.transcription-mode { min-height:46px; border:0; border-radius:var(--radius-pill); }
.transcription-mode.active { background:var(--panel-background); box-shadow:var(--shadow-sm); }
.transcription-config { display:grid; grid-template-columns:minmax(0,1.6fr) minmax(260px,.7fr); gap:18px; }
```

At the narrow breakpoint, make `.transcription-config` one column and preserve horizontal scrolling for `.settings-tabs`.

- [ ] **Step 3: Replace the settings markup**

Create a settings tablist with six buttons and content panels. The default “语音转文字” panel contains a second tablist for CPU/GPU/online and three mode panels:

```html
<button class="transcription-mode active" data-transcription-mode="cpu" role="tab" aria-selected="true" onclick="setTranscriptionMode('cpu', this)">CPU 模式</button>
<button class="transcription-mode" data-transcription-mode="gpu" role="tab" aria-selected="false" onclick="setTranscriptionMode('gpu', this)">GPU 模式</button>
<button class="transcription-mode" data-transcription-mode="online" role="tab" aria-selected="false" onclick="setTranscriptionMode('online', this)">在线模式</button>
```

CPU and GPU panels keep model management in Settings. Online fields use non-secret placeholders only. The Appearance panel owns the theme toggle.

- [ ] **Step 4: Add settings interaction functions**

Add:

```js
function setSettingsSection(section, trigger) {
  document.querySelectorAll('[data-settings-section]').forEach(button => {
    const selected = button.dataset.settingsSection === section
    button.classList.toggle('active', selected)
    button.setAttribute('aria-selected', String(selected))
  })
  document.querySelectorAll('[data-settings-panel]').forEach(panel => panel.classList.toggle('active', panel.dataset.settingsPanel === section))
  if (trigger && trigger.blur) trigger.blur()
}

function setTranscriptionMode(mode, trigger) {
  document.querySelectorAll('[data-transcription-mode]').forEach(button => {
    const selected = button.dataset.transcriptionMode === mode
    button.classList.toggle('active', selected)
    button.setAttribute('aria-selected', String(selected))
  })
  document.querySelectorAll('[data-transcription-panel]').forEach(panel => panel.classList.toggle('active', panel.dataset.transcriptionPanel === mode))
  if (trigger && trigger.blur) trigger.blur()
}
```

- [ ] **Step 5: Run the structural and JavaScript checks**

Run the structural test, extract the inline script, and run `node --check`. Expected: both exit 0 and print the structure pass message.

- [ ] **Step 6: Render and inspect settings in Edge**

Render `file:///D:/Project/notes/.superpowers/brainstorm/ui-proposal-1783996252/content/workbench-ciphertalk-inspired.html?page=settings` at 1440×920. Confirm the old topbar is absent, six category tabs fit, CPU/GPU/online modes are visible, and no content overflows.
