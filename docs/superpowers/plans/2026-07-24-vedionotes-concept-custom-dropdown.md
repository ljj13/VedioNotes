# VedioNotes UI Concept Custom Dropdown Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace all four native HTML selects in the standalone VedioNotes concept with one visually consistent, accessible, keyboard-operable custom dropdown system.

**Architecture:** The single prototype HTML keeps one `state.selectValues` object as the source of truth. A shared `renderCustomSelect()` function creates each combobox/listbox, while event delegation implements open, close, selection, focus movement, click-outside, Escape, and Tab behavior; existing workflows read values through `getDropdownValue()` instead of native `.value`.

**Tech Stack:** HTML5, CSS custom properties, inline SVG, browser-native JavaScript, Node.js source contracts, Microsoft Edge CDP rendering and interaction probes, PowerShell.

## Global Constraints

- Modify only `D:\Project\notes\.codex-research\tauri-react-ui\vedionotes-ui-concept.html` and refresh its two existing render screenshots.
- Do not modify production React, Tauri, Rust, package, lock, build, or test files.
- Replace all four native selects: transcription engine, AI summary model, provider model, and export format.
- Do not introduce a dependency, CDN, external font, external icon, image request, network call, storage call, Tauri API, or filesystem call.
- Preserve the existing routes, mock data, task completion and cancellation flows, Settings sections, responsive breakpoints, themes, density mode, and reduced-motion behavior.
- Use `role="combobox"`, `role="listbox"`, `role="option"`, `aria-expanded`, `aria-controls`, and `aria-selected` correctly.
- Support mouse selection, click-outside, Arrow Up/Down, Home/End, Enter/Space, Escape, and Tab.
- Keep page-level horizontal overflow at zero for 1440×900, 1180×760, and 900×700.

---

### Task 1: Lock the source contract and add the shared dropdown renderer

**Files:**
- Modify: `.codex-research/tauri-react-ui/vedionotes-ui-concept.html`
- Test: inline Node.js source assertions run from `D:\Project\notes`

**Interfaces:**
- Consumes: the existing `state`, `escapeHtml()`, CSS theme tokens, and single-document event delegation.
- Produces: `state.selectValues`, `renderCustomSelect({ id, label, options, value, width })`, `getDropdownValue(id)`, `.custom-select`, `.custom-select-trigger`, `.custom-select-popup`, and `.custom-select-option`.

- [ ] **Step 1: Run a failing source contract proving native controls and missing shared APIs**

```powershell
@'
const fs=require('fs');
const s=fs.readFileSync('.codex-research/tauri-react-ui/vedionotes-ui-concept.html','utf8');
if (/<select\b|<option\b/i.test(s)) throw new Error('native select remains');
for (const value of ['class="custom-select"','role="combobox"','role="listbox"','role="option"','function renderCustomSelect(','function getDropdownValue(','state.selectValues']) {
  if (!s.includes(value)) throw new Error('missing '+value);
}
'@ | node -
```

Expected: exit 1 with `native select remains` before implementation.

- [ ] **Step 2: Add token-driven trigger and popup styling**

Add these component rules near the existing `.field` and `.select-field` rules, then remove `.select-field` from the native field selector groups:

```css
.custom-select { position: relative; width: 100%; min-width: 0; }
.custom-select-trigger {
  display: grid; grid-template-columns: minmax(0,1fr) 18px; align-items: center; gap: 10px;
  width: 100%; min-height: var(--control-height); padding: 0 12px 0 13px;
  border: 1px solid var(--border); border-radius: 11px; color: var(--text-1);
  background: var(--surface-2); text-align: left;
}
.custom-select-trigger[aria-expanded="true"] { border-color: var(--accent); box-shadow: 0 0 0 3px color-mix(in srgb,var(--accent) 13%,transparent); }
.custom-select-trigger svg { color: var(--text-3); transition: transform .16s ease; }
.custom-select-trigger[aria-expanded="true"] svg { transform: rotate(180deg); }
.custom-select-value { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.custom-select-popup {
  position: absolute; z-index: 110; top: calc(100% + 6px); left: 0; right: 0;
  max-height: 248px; margin: 0; padding: 6px; overflow-y: auto; list-style: none;
  border: 1px solid var(--border); border-radius: 12px; background: var(--surface-1); box-shadow: var(--shadow);
}
.custom-select.is-drop-up .custom-select-popup { top: auto; bottom: calc(100% + 6px); }
.custom-select-option {
  display: grid; grid-template-columns: minmax(0,1fr) 18px; align-items: center; gap: 10px;
  width: 100%; min-height: 40px; padding: 8px 10px; border-radius: 9px;
  color: var(--text-2); background: transparent; text-align: left;
}
.custom-select-option:hover, .custom-select-option.is-active { color: var(--text-1); background: var(--surface-2); }
.custom-select-option[aria-selected="true"] { color: var(--accent); background: var(--accent-soft); font-weight: 750; }
.custom-select-check { opacity: 0; }
.custom-select-option[aria-selected="true"] .custom-select-check { opacity: 1; }
```

- [ ] **Step 3: Add selected-value state and the reusable renderer**

Add this contract after `escapeHtml()`:

```js
state.selectValues = {
  'engine-select': 'SenseVoice · CPU',
  'model-select': 'GPT-4.1 Mini',
  'provider-model': 'gpt-4.1-mini',
  'export-format': 'Markdown'
};
state.openSelectId = null;

function renderCustomSelect({ id, label, options, value = state.selectValues[id], width = '100%' }) {
  state.selectValues[id] = options.includes(value) ? value : options[0];
  const listboxId = `${id}-listbox`;
  return `<div class="custom-select" data-select-id="${id}" style="width:${escapeHtml(width)}">
    <button class="custom-select-trigger" id="${id}" type="button" role="combobox" data-select-trigger aria-label="${escapeHtml(label)}" aria-haspopup="listbox" aria-expanded="false" aria-controls="${listboxId}">
      <span class="custom-select-value">${escapeHtml(state.selectValues[id])}</span>
      <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path d="m7 9 5 5 5-5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
    </button>
    <div class="custom-select-popup" id="${listboxId}" role="listbox" aria-label="${escapeHtml(label)}" hidden>
      ${options.map(option => `<button class="custom-select-option" type="button" role="option" data-select-value="${escapeHtml(option)}" aria-selected="${option === state.selectValues[id]}"><span>${escapeHtml(option)}</span><svg class="custom-select-check" width="15" height="15" viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></button>`).join('')}
    </div>
  </div>`;
}

function getDropdownValue(id) { return state.selectValues[id]; }
```

- [ ] **Step 4: Replace the two New Distillation native selects**

Replace each `<select>` with a labeled slot:

```html
<div class="form-group"><span class="group-label">转写引擎</span><div id="engine-select-slot"></div></div>
<div class="form-group"><span class="group-label">AI 摘要模型</span><div id="model-select-slot"></div></div>
```

Add and call this hydration function at initial render:

```js
function renderCreateDropdowns() {
  document.querySelector('#engine-select-slot').innerHTML = renderCustomSelect({ id:'engine-select', label:'转写引擎', options:['SenseVoice · CPU','Whisper Large V3 · GPU','在线转写服务'] });
  document.querySelector('#model-select-slot').innerHTML = renderCustomSelect({ id:'model-select', label:'AI 摘要模型', options:['GPT-4.1 Mini','Claude Sonnet','Gemini 2.5 Flash'] });
}
```

Replace `document.querySelector('#engine-select').value` in `startMockTask()` and `renderHome()` with `getDropdownValue('engine-select')`.

- [ ] **Step 5: Re-run the source contract**

Expected at this intermediate stage: still exit 1 because the two Settings native selects remain, proving Task 2 is required.

### Task 2: Replace dynamic Settings selects and implement unified behavior

**Files:**
- Modify: `.codex-research/tauri-react-ui/vedionotes-ui-concept.html`
- Test: inline Node.js source assertions and Edge CDP interaction probe

**Interfaces:**
- Consumes: `renderCustomSelect()`, `getDropdownValue()`, `state.selectValues`, and Settings render functions.
- Produces: `openDropdown(id, direction)`, `closeDropdown({ restoreFocus })`, `selectDropdownOption(id, value)`, `moveDropdownFocus(id, movement)`, and complete mouse/keyboard event delegation.

- [ ] **Step 1: Add a failing behavior contract**

```powershell
@'
const fs=require('fs');
const s=fs.readFileSync('.codex-research/tauri-react-ui/vedionotes-ui-concept.html','utf8');
for (const value of ['function openDropdown(','function closeDropdown(','function selectDropdownOption(','function moveDropdownFocus(','data-select-trigger','data-select-value','aria-expanded','aria-selected']) {
  if (!s.includes(value)) throw new Error('missing '+value);
}
'@ | node -
```

Expected: exit 1 with `missing function openDropdown(`.

- [ ] **Step 2: Replace provider model and export format selects**

Inside `renderAiSettings()`, replace the provider `<select>` with:

```js
renderCustomSelect({ id:'provider-model', label:'默认模型', options:selected.models, value:state.selectValues['provider-model'] })
```

When a provider button is selected, set its first model only when the previous value is not available:

```js
if (!selected.models.includes(state.selectValues['provider-model'])) state.selectValues['provider-model'] = selected.models[0];
```

Inside `renderDataSettings()`, replace the export `<select>` with:

```js
renderCustomSelect({ id:'export-format', label:'导出格式', options:['Markdown','纯文本','JSON 备份'], width:'170px' })
```

- [ ] **Step 3: Implement open, close, selection, and viewport-aware placement**

```js
function openDropdown(id, direction = 1) {
  if (state.openSelectId && state.openSelectId !== id) closeDropdown({ restoreFocus:false });
  const root = document.querySelector(`[data-select-id="${CSS.escape(id)}"]`);
  if (!root) return;
  const trigger = root.querySelector('[role="combobox"]');
  const popup = root.querySelector('[role="listbox"]');
  popup.hidden = false;
  trigger.setAttribute('aria-expanded','true');
  state.openSelectId = id;
  const roomBelow = innerHeight - trigger.getBoundingClientRect().bottom;
  root.classList.toggle('is-drop-up', roomBelow < Math.min(260, popup.scrollHeight + 12));
  const options = [...popup.querySelectorAll('[role="option"]')];
  const selectedIndex = Math.max(0, options.findIndex(option => option.getAttribute('aria-selected') === 'true'));
  options[Math.max(0, Math.min(options.length - 1, selectedIndex + (direction < 0 ? -1 : 0)))].focus();
}

function closeDropdown({ restoreFocus = false } = {}) {
  const id = state.openSelectId;
  if (!id) return;
  const root = document.querySelector(`[data-select-id="${CSS.escape(id)}"]`);
  if (root) {
    root.querySelector('[role="listbox"]').hidden = true;
    root.querySelector('[role="combobox"]').setAttribute('aria-expanded','false');
    root.classList.remove('is-drop-up');
    if (restoreFocus) root.querySelector('[role="combobox"]').focus();
  }
  state.openSelectId = null;
}

function selectDropdownOption(id, value) {
  state.selectValues[id] = value;
  const root = document.querySelector(`[data-select-id="${CSS.escape(id)}"]`);
  if (root) {
    root.querySelector('.custom-select-value').textContent = value;
    root.querySelectorAll('[role="option"]').forEach(option => option.setAttribute('aria-selected', String(option.dataset.selectValue === value)));
  }
  closeDropdown({ restoreFocus:true });
  announce(`已选择 ${value}`);
}
```

- [ ] **Step 4: Implement keyboard focus movement and delegated events**

```js
function moveDropdownFocus(id, movement) {
  const options = [...document.querySelector(`[data-select-id="${CSS.escape(id)}"]`).querySelectorAll('[role="option"]')];
  const current = Math.max(0, options.indexOf(document.activeElement));
  const next = movement === 'first' ? 0 : movement === 'last' ? options.length - 1 : (current + movement + options.length) % options.length;
  options.forEach(option => option.classList.toggle('is-active', option === options[next]));
  options[next].focus();
}
```

In click delegation:

```js
const selectRoot = event.target.closest('[data-select-id]');
const selectOption = event.target.closest('[data-select-value]');
if (selectOption) selectDropdownOption(selectRoot.dataset.selectId, selectOption.dataset.selectValue);
else if (event.target.closest('[role="combobox"]')) state.openSelectId === selectRoot.dataset.selectId ? closeDropdown() : openDropdown(selectRoot.dataset.selectId);
else if (state.openSelectId) closeDropdown();
```

Replace the existing document-level Escape handler with this unified keyboard handler so the order remains modal → dropdown → task drawer:

```js
document.addEventListener('keydown', event => {
  const trigger = event.target.closest('[data-select-trigger]');
  const option = event.target.closest('[data-select-value]');
  const root = event.target.closest('[data-select-id]');

  if (trigger && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
    event.preventDefault();
    openDropdown(root.dataset.selectId, event.key === 'ArrowUp' ? -1 : 1);
    return;
  }
  if (option) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      moveDropdownFocus(root.dataset.selectId, event.key === 'ArrowDown' ? 1 : -1);
      return;
    }
    if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      moveDropdownFocus(root.dataset.selectId, event.key === 'Home' ? 'first' : 'last');
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      selectDropdownOption(root.dataset.selectId, option.dataset.selectValue);
      return;
    }
    if (event.key === 'Tab') {
      closeDropdown({ restoreFocus:false });
      return;
    }
  }
  if (event.key !== 'Escape') return;
  if (state.modal) closeModal();
  else if (state.openSelectId) closeDropdown({ restoreFocus:true });
  else if (!document.querySelector('#task-drawer').hidden) closeTaskDrawer();
});
```

- [ ] **Step 5: Run the complete source contract**

Run both Task 1 Step 1 and Task 2 Step 1 commands.

Expected: both exit 0, with zero `<select>` and zero `<option>` elements.

### Task 3: Verify all dropdowns visually and behaviorally in Edge

**Files:**
- Modify if a verified defect is found: `.codex-research/tauri-react-ui/vedionotes-ui-concept.html`
- Refresh: `.codex-research/tauri-react-ui/renders/vedionotes-concept-1440x900.png`
- Refresh: `.codex-research/tauri-react-ui/renders/vedionotes-concept-900x700.png`

**Interfaces:**
- Consumes: the complete custom dropdown system.
- Produces: fresh static, visual, geometry, accessibility, keyboard, and regression evidence.

- [ ] **Step 1: Run an Edge CDP failing-to-passing dropdown matrix**

At each relevant route/Settings section, assert:

```js
({
  createComboboxes: document.querySelectorAll('[data-page="create"] [role="combobox"]').length,
  expanded: trigger.getAttribute('aria-expanded'),
  visibleListboxes: [...document.querySelectorAll('[role="listbox"]')].filter(node => !node.hidden).length,
  selectedOptions: listbox.querySelectorAll('[role="option"][aria-selected="true"]').length,
  nativeSelects: document.querySelectorAll('select').length,
  overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
})
```

Expected: New Distillation has 2 comboboxes; AI Access has 1; Data Management has 1; every open listbox has exactly one selected option; native selects and overflow are 0.

- [ ] **Step 2: Verify keyboard behavior with real `KeyboardEvent`s**

For each dropdown, focus the trigger and test:

1. Arrow Down opens it and focuses an option.
2. Arrow Down changes active focus.
3. Home and End reach boundaries.
4. Enter selects and returns focus to the trigger.
5. Escape closes without changing the value and returns focus.
6. Tab closes without trapping focus.
7. Opening a second dropdown closes the first.
8. Clicking outside closes the popup.

Expected: every assertion is `true`, with no `Runtime.exceptionThrown` event.

- [ ] **Step 3: Re-run task and responsive regression probes**

Verify the existing task workflow still completes to 100%, cancellation still yields `cancelled`, all six routes have one visible page, and page overflow remains 0 at 1440×900, 1180×760, and 900×700. Expected sidebar widths remain 220, 200, and 88 pixels respectively.

- [ ] **Step 4: Refresh and inspect final screenshots**

Render the home view at 1440×900 and 900×700, then additionally navigate to New Distillation, open the transcription dropdown, and capture a diagnostic Edge screenshot for visual inspection. Confirm the popup uses themed surfaces, green selected state, inline check icon, consistent radius, and no clipping in both light and dark themes.

- [ ] **Step 5: Run the final offline/security contract**

```powershell
@'
const fs=require('fs');
const s=fs.readFileSync('.codex-research/tauri-react-ui/vedionotes-ui-concept.html','utf8');
const forbidden=[/<select\b|<option\b/i,/<script[^>]+src=/i,/<link[^>]+href=/i,/@tauri-apps/i,/invoke\s*\(/i,/localStorage/i,/sessionStorage/i,/fetch\s*\(/i,/XMLHttpRequest/i];
for (const value of forbidden) if (value.test(s)) throw new Error('forbidden '+value);
new Function(s.match(/<script>([\s\S]*?)<\/script>/)[1]);
console.log('custom dropdown final contract pass');
'@ | node -
```

Expected: `custom dropdown final contract pass`.

- [ ] **Step 6: Open the refreshed prototype for user inspection**

```powershell
$edge='C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
$html=(Resolve-Path '.codex-research\tauri-react-ui\vedionotes-ui-concept.html').Path
Start-Process -FilePath $edge -ArgumentList @('--new-window',$html)
```

Expected: a visible Edge window opens the updated prototype; no project build, npm command, Cargo command, or Tauri process is started.
