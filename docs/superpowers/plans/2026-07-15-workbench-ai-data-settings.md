# Workbench AI Access and Data Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the standalone Model Management settings category with complete CipherTalk-inspired AI Access and Data Management interfaces adapted to video distillation.

**Architecture:** Keep the deliverable as one offline HTML file with semantic tab panels and small inline state functions. Extend the existing Node structural test in two red-green cycles: AI access first, then data management.

**Tech Stack:** HTML5, CSS custom properties, inline JavaScript, Node.js `assert`, Microsoft Edge headless screenshots.

## Global Constraints

- Modify only `workbench-ciphertalk-inspired.html` and its structural test; do not change production React/Tauri code.
- Do not read real credentials, call AI services, delete files, or read real logs.
- Adapt CipherTalk's information architecture to video notes; do not copy Electron-specific or WeChat-specific fields.
- Preserve current sidebar, themes, transcription modes, responsive layout, and reduced-motion behavior.
- The project folder has no Git metadata, so no commit or worktree steps apply.

---

### Task 1: Remove standalone Model Management and implement AI Access

**Files:**
- Modify: `D:\Project\notes\.superpowers\brainstorm\ui-proposal-1783996252\content\workbench-ciphertalk-inspired.structure.test.mjs`
- Modify: `D:\Project\notes\.superpowers\brainstorm\ui-proposal-1783996252\content\workbench-ciphertalk-inspired.html`

**Interfaces:**
- Consumes: existing `setSettingsSection(section, trigger)`, `selectChoice(button)`, and `showPrototypeNotice(message)`.
- Produces: `setAiMode(mode, trigger)`, `openPresetDrawer()`, `closePresetDrawer()`, `openPresetModal()`, and `closePresetModal()`.

- [ ] **Step 1: Add failing AI structure assertions**

Add assertions equivalent to:

```js
assert.equal((html.match(/data-settings-section="/g) || []).length, 5)
assert.doesNotMatch(html, /data-settings-section="models"/)
assert.match(html, /data-settings-section="ai"[^>]*>AI 接入</)
for (const mode of ['llm', 'vector', 'rerank', 'web', 'tts', 'image', 'agent']) {
  assert.match(html, new RegExp(`data-ai-mode="${mode}"`))
  assert.match(html, new RegExp(`data-ai-panel="${mode}"`))
}
for (const provider of ['DeepSeek', 'OpenAI', 'Claude', 'Gemini', '通义千问', 'Kimi', 'SiliconFlow', 'Ollama', '自定义兼容']) {
  assert.ok(html.includes(provider))
}
assert.match(html, /function\s+setAiMode\(/)
assert.match(html, /id="presetDrawer"/)
assert.match(html, /id="presetModal"/)
```

- [ ] **Step 2: Run the structural test and verify RED**

Run:

```powershell
node 'D:\Project\notes\.superpowers\brainstorm\ui-proposal-1783996252\content\workbench-ciphertalk-inspired.structure.test.mjs'
```

Expected: FAIL because the old `models` tab remains and the AI modes, presets, drawer, and modal do not exist.

- [ ] **Step 3: Implement AI Access markup and styling**

Replace the `AI 总结` category with `AI 接入`, remove the `模型管理` category and panel, and create seven AI mode buttons and panels. The LLM panel contains provider presets, connection fields, test/save actions, current configuration summary, preset drawer, and three-step preset modal. Other panels expose their relevant base fields and local-only prototype actions.

- [ ] **Step 4: Implement AI interactions**

Add:

```js
function setAiMode(mode, trigger) {
  document.querySelectorAll('[data-ai-mode]').forEach(button => {
    const selected = button.dataset.aiMode === mode
    button.classList.toggle('active', selected)
    button.setAttribute('aria-selected', String(selected))
  })
  document.querySelectorAll('[data-ai-panel]').forEach(panel => panel.classList.toggle('active', panel.dataset.aiPanel === mode))
  if (trigger && trigger.blur) trigger.blur()
}
function openPresetDrawer() { document.getElementById('presetDrawer').classList.add('visible') }
function closePresetDrawer() { document.getElementById('presetDrawer').classList.remove('visible') }
function openPresetModal() { document.getElementById('presetModal').classList.add('visible') }
function closePresetModal() { document.getElementById('presetModal').classList.remove('visible') }
```

- [ ] **Step 5: Run the structural test and verify GREEN**

Expected: the AI assertions pass and the test reaches the existing data-management assertions.

---

### Task 2: Implement Data Management export, cache, and log panels

**Files:**
- Modify: `D:\Project\notes\.superpowers\brainstorm\ui-proposal-1783996252\content\workbench-ciphertalk-inspired.structure.test.mjs`
- Modify: `D:\Project\notes\.superpowers\brainstorm\ui-proposal-1783996252\content\workbench-ciphertalk-inspired.html`

**Interfaces:**
- Consumes: existing settings categories and `showPrototypeNotice(message)`.
- Produces: `setDataMode(mode, trigger)`, `openClearConfirm(title)`, and `closeClearConfirm()`.

- [ ] **Step 1: Add failing data-management assertions**

Add:

```js
for (const mode of ['export', 'cache', 'logs']) {
  assert.match(html, new RegExp(`data-data-mode="${mode}"`))
  assert.match(html, new RegExp(`data-data-panel="${mode}"`))
}
for (const label of ['导出设置', '缓存管理', '日志管理', '临时媒体', '截图缓存', '转写缓存', 'AI 索引', '日志级别', '最近日志']) {
  assert.ok(html.includes(label))
}
assert.match(html, /function\s+setDataMode\(/)
assert.match(html, /id="clearConfirmModal"/)
```

- [ ] **Step 2: Run the structural test and verify RED**

Expected: FAIL because the old Data Management placeholder lacks the three data panels and confirmation modal.

- [ ] **Step 3: Implement the three data panels**

Create a three-button sub-tab. Export provides output directory, format and attached-content choices. Cache provides five size cards and safe prototype clear actions. Logs provides summary, ERROR/WARN/INFO/DEBUG selection, file list and static content preview.

- [ ] **Step 4: Implement data interactions**

Add:

```js
function setDataMode(mode, trigger) {
  document.querySelectorAll('[data-data-mode]').forEach(button => {
    const selected = button.dataset.dataMode === mode
    button.classList.toggle('active', selected)
    button.setAttribute('aria-selected', String(selected))
  })
  document.querySelectorAll('[data-data-panel]').forEach(panel => panel.classList.toggle('active', panel.dataset.dataPanel === mode))
  if (trigger && trigger.blur) trigger.blur()
}
function openClearConfirm(title) {
  document.getElementById('clearConfirmTitle').textContent = title
  document.getElementById('clearConfirmModal').classList.add('visible')
}
function closeClearConfirm() { document.getElementById('clearConfirmModal').classList.remove('visible') }
```

- [ ] **Step 5: Run the structural test and verify GREEN**

Expected: `workbench CipherTalk-inspired structure: pass` and exit code 0.

---

### Task 3: Verify scripts, offline safety, responsive rendering, and interactions

**Files:**
- Verify: `D:\Project\notes\.superpowers\brainstorm\ui-proposal-1783996252\content\workbench-ciphertalk-inspired.html`
- Create screenshots beside the HTML for AI Access, Data Management cache, and Data Management logs.

**Interfaces:**
- Consumes: query parameters `page=settings`, `settings=ai|data`, and `sub=llm|cache|logs` for isolated visual review.
- Produces: screenshots and final verification evidence.

- [ ] **Step 1: Support isolated settings review through query parameters**

After the existing `page` query handling, read `settings` and `sub`; call `setSettingsSection()`, `setAiMode()`, or `setDataMode()` only when the matching panel exists.

- [ ] **Step 2: Run structural, inline JavaScript, and offline dependency checks**

Run the Node structural test, extract the inline script and run `node --check`, then scan for iframe, localhost, external scripts/styles/images/videos. Expected: all checks exit 0.

- [ ] **Step 3: Render three 1440×920 screenshots**

Render:

```text
...?page=settings&settings=ai&sub=llm
...?page=settings&settings=data&sub=cache
...?page=settings&settings=data&sub=logs
```

Confirm the navigation fits, cards do not overlap, drawers are closed initially, and content remains readable.

- [ ] **Step 4: Open the local AI Access page for user review**

Open the file URL in visible Edge. Do not run a local HTTP server.

