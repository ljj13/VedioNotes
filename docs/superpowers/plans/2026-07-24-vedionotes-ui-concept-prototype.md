# VedioNotes Complete UI Concept Prototype Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build one self-contained, offline, interactive HTML prototype that visualizes a coherent six-destination VedioNotes desktop interface without changing production code.

**Architecture:** The prototype is a single HTML document containing semantic markup, tokenized CSS, inline SVG icons, local mock data, and plain JavaScript. One application-state object drives page routing, sidebar state, theme/density preferences, Settings subsection selection, mock transcription progress, notes, history filters, AI messages, dialogs, task drawer, and toasts; the document performs no network, filesystem, Tauri, or storage calls.

**Tech Stack:** HTML5, CSS custom properties, inline SVG, browser-native JavaScript, Node.js static contract checks, Microsoft Edge headless rendering, PowerShell.

## Global Constraints

- Create `D:\Project\notes\.codex-research\tauri-react-ui\vedionotes-ui-concept.html` as the only runnable artifact.
- Do not modify `src`, `src-tauri`, `package.json`, lockfiles, Tauri configuration, tests, build outputs, or production documentation.
- Do not use Python, npm packages, external scripts, CDNs, web fonts, remote images, real credentials, API calls, Tauri APIs, or local file reads.
- Preserve the real product's navigation labels and do not restore the removed Workbench or Local Workspace/Privacy Mode parent modules.
- Use only HTML, CSS, inline SVG, and plain JavaScript in the artifact.
- Validate at 1440×900, 1180×760, and 900×700 without page-level horizontal overflow.
- Make all primary controls keyboard reachable, maintain visible focus, support Escape dismissal, and respect `prefers-reduced-motion`.

---

### Task 1: Lock the standalone artifact contract and build the semantic shell

**Files:**
- Create: `.codex-research/tauri-react-ui/vedionotes-ui-concept.html`
- Test: inline Node.js assertions executed from `D:\Project\notes`

**Interfaces:**
- Consumes: the approved design in `docs/superpowers/specs/2026-07-24-vedionotes-ui-concept-prototype-design.md`.
- Produces: semantic regions `#app`, `.titlebar`, `.sidebar`, `#main-content`, six `[data-route]` buttons, six `[data-page]` views, `#task-drawer`, `#modal-root`, and `#toast-region`.

- [ ] **Step 1: Run the missing-artifact contract and verify RED**

```powershell
node -e "const fs=require('fs');const p='.codex-research/tauri-react-ui/vedionotes-ui-concept.html';if(!fs.existsSync(p))throw new Error('prototype HTML missing')"
```

Expected: exit 1 with `prototype HTML missing`.

- [ ] **Step 2: Create the document skeleton with all page landmarks**

Create the file with this exact top-level contract and fill each named page with its task-specific content in later tasks:

```html
<!doctype html>
<html lang="zh-CN" data-theme="light" data-density="comfortable">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light dark">
  <title>VedioNotes UI Concept</title>
  <style>/* token, layout, component and responsive rules remain inline */</style>
</head>
<body>
  <a class="skip-link" href="#main-content">跳到主要内容</a>
  <div id="app" class="app-shell">
    <header class="titlebar" aria-label="窗口标题栏"></header>
    <aside class="sidebar" aria-label="主导航"></aside>
    <main id="main-content" tabindex="-1">
      <section data-page="home"></section>
      <section data-page="create" hidden></section>
      <section data-page="library" hidden></section>
      <section data-page="qa" hidden></section>
      <section data-page="history" hidden></section>
      <section data-page="settings" hidden></section>
    </main>
  </div>
  <aside id="task-drawer" hidden></aside>
  <div id="modal-root"></div>
  <div id="toast-region" role="status" aria-live="polite"></div>
  <script>/* all mock data and behavior remain inline */</script>
</body>
</html>
```

- [ ] **Step 3: Run the artifact and landmark contract**

```powershell
node -e "const fs=require('fs');const s=fs.readFileSync('.codex-research/tauri-react-ui/vedionotes-ui-concept.html','utf8');for(const x of ['<!doctype html>','id=\"app\"','class=\"titlebar\"','class=\"sidebar\"','id=\"main-content\"','data-page=\"home\"','data-page=\"create\"','data-page=\"library\"','data-page=\"qa\"','data-page=\"history\"','data-page=\"settings\"','id=\"task-drawer\"','id=\"modal-root\"','id=\"toast-region\"'])if(!s.includes(x))throw new Error('missing '+x);console.log('shell contract pass')"
```

Expected: `shell contract pass`.

- [ ] **Step 4: Commit the isolated shell**

```powershell
git add -- .codex-research/tauri-react-ui/vedionotes-ui-concept.html
git commit -m "feat: scaffold standalone VedioNotes UI concept"
```

### Task 2: Implement the desktop shell, theme system, and navigation

**Files:**
- Modify: `.codex-research/tauri-react-ui/vedionotes-ui-concept.html`
- Test: inline Node.js assertions and browser interaction

**Interfaces:**
- Consumes: Task 1 landmarks.
- Produces: `state.route`, `state.sidebarCollapsed`, `state.theme`, `state.density`, `navigate(route)`, `setTheme(theme)`, `setDensity(density)`, `renderShell()`, and `announce(message)`.

- [ ] **Step 1: Add a failing shell-behavior contract**

```powershell
node -e "const fs=require('fs');const s=fs.readFileSync('.codex-research/tauri-react-ui/vedionotes-ui-concept.html','utf8');for(const x of ['--surface-0','--accent','data-route=\"home\"','data-route=\"create\"','data-route=\"library\"','data-route=\"qa\"','data-route=\"history\"','data-route=\"settings\"','function navigate(','function setTheme(','function setDensity(','aria-label=\"折叠侧边栏\"'])if(!s.includes(x))throw new Error('missing '+x)"
```

Expected: exit 1 because tokenized styling and navigation functions do not exist yet.

- [ ] **Step 2: Add semantic tokens and responsive shell styles**

Define light/dark mappings for `--surface-0`, `--surface-1`, `--surface-2`, `--text-1`, `--text-2`, `--border`, `--accent`, `--accent-soft`, `--success`, `--warning`, `--danger`, `--shadow`, and `--radius`. Use a 4/8-pixel spacing rhythm, 220/88-pixel sidebar widths, visible `:focus-visible`, `min-height: 44px` controls, and transform/opacity-only transitions.

```css
:root { --surface-0:#eef2f3; --surface-1:#ffffff; --surface-2:#f6f8f8; --text-1:#18201e; --text-2:#60706b; --border:#dce4e1; --accent:#1f9d72; --accent-soft:#dff5ec; --success:#17865f; --warning:#b7791f; --danger:#c2414b; --radius:18px; --shadow:0 20px 60px rgba(22,39,34,.12); }
html[data-theme="dark"] { --surface-0:#0d1211; --surface-1:#141a18; --surface-2:#1a211f; --text-1:#edf4f1; --text-2:#9aaba5; --border:#29322f; --accent:#42c994; --accent-soft:#173b2f; --shadow:0 24px 70px rgba(0,0,0,.42); }
:focus-visible { outline:3px solid color-mix(in srgb,var(--accent) 70%,white); outline-offset:3px; }
@media (prefers-reduced-motion: reduce) { *,*::before,*::after { scroll-behavior:auto!important; transition-duration:.01ms!important; animation-duration:.01ms!important; animation-iteration-count:1!important; } }
```

- [ ] **Step 3: Add navigation, active state, title bar, service state, theme and sidebar controls**

Use this state and behavior contract:

```js
const state = { route:'home', sidebarCollapsed:false, theme:'light', density:'comfortable', settingsSection:'appearance', task:null, noteId:'note-1', historyFilter:'all', historyId:'task-1', qaMessages:[] };
function navigate(route){ state.route=route; document.querySelectorAll('[data-page]').forEach(page=>page.hidden=page.dataset.page!==route); document.querySelectorAll('[data-route]').forEach(button=>button.setAttribute('aria-current',button.dataset.route===route?'page':'false')); document.querySelector('#main-content').focus({preventScroll:true}); renderShell(); }
function setTheme(theme){ state.theme=theme; document.documentElement.dataset.theme=theme; renderShell(); announce(`已切换到${theme==='dark'?'深色':'浅色'}主题`); }
function setDensity(density){ state.density=density; document.documentElement.dataset.density=density; announce(`界面密度已设为${density==='compact'?'紧凑':'舒适'}`); }
function announce(message){ document.querySelector('#toast-region').textContent=message; }
```

- [ ] **Step 4: Run the shell contract and manually test keyboard navigation**

Run the Step 1 command again. Expected: exit 0. Then open the file in Edge, Tab through all six navigation buttons, activate each with Enter, toggle the sidebar, switch themes, and confirm visible focus plus one active destination.

- [ ] **Step 5: Commit the shell behavior**

```powershell
git add -- .codex-research/tauri-react-ui/vedionotes-ui-concept.html
git commit -m "feat: add concept shell navigation and themes"
```

### Task 3: Implement Home, New Distillation, task progress, and History

**Files:**
- Modify: `.codex-research/tauri-react-ui/vedionotes-ui-concept.html`
- Test: inline Node.js assertions and browser interaction

**Interfaces:**
- Consumes: `state`, `navigate()`, `announce()`, `renderShell()`.
- Produces: `mockTasks`, `startMockTask()`, `advanceMockTask()`, `cancelMockTask()`, `renderHome()`, `renderCreate()`, `renderHistory()`, `openTaskDrawer()`, and `closeTaskDrawer()`.

- [ ] **Step 1: Add a failing workflow contract**

```powershell
node -e "const fs=require('fs');const s=fs.readFileSync('.codex-research/tauri-react-ui/vedionotes-ui-concept.html','utf8');for(const x of ['id=\"source-input\"','data-input-mode=\"url\"','data-input-mode=\"file\"','id=\"start-task\"','id=\"task-progress\"','下载视频','提取音频','语音转写','AI 结构化','保存笔记','function startMockTask(','function cancelMockTask(','data-history-filter=\"failed\"','data-status=\"cancelled\"'])if(!s.includes(x))throw new Error('missing '+x)"
```

Expected: exit 1.

- [ ] **Step 2: Add Home and New Distillation markup with realistic mock controls**

Home contains the active-task card, three quick actions, recent notes, and four service cards. New Distillation contains URL/file segmented controls, labeled source input, transcription engine, summary provider/model, note style, Markdown output destination, an inline validation region, and one `开始提炼` primary button.

- [ ] **Step 3: Add deterministic staged progress and cancellation**

```js
const taskStages=[['下载视频',14],['提取音频',29],['语音转写',67],['AI 结构化',89],['保存笔记',100]];
function startMockTask(){ const input=document.querySelector('#source-input'); if(!input.value.trim()){ input.setAttribute('aria-invalid','true'); document.querySelector('#source-error').textContent='请输入视频链接或选择本地文件'; input.focus(); return; } state.task={status:'running',stageIndex:0,progress:0}; openTaskDrawer(); advanceMockTask(); }
function advanceMockTask(){ if(!state.task||state.task.status!=='running')return; const [label,target]=taskStages[state.task.stageIndex]; state.task.label=label; state.task.progress=target; renderTaskDrawer(); if(state.task.stageIndex<taskStages.length-1){ state.task.stageIndex+=1; state.task.timer=setTimeout(advanceMockTask,900); }else{ state.task.status='completed'; renderTaskDrawer(); renderHome(); renderHistory(); announce('提炼完成，笔记已保存'); } }
function cancelMockTask(){ if(!state.task)return; clearTimeout(state.task.timer); state.task.status='cancelled'; renderTaskDrawer(); renderHistory(); announce('任务已取消'); }
```

- [ ] **Step 4: Add History filters and detail selection**

Use local records containing `running`, `completed`, `failed`, and `cancelled` status text, timestamps, stages, source type, and recovery action. Filter buttons update `state.historyFilter`; selecting a row updates `state.historyId` and the adjacent detail panel.

- [ ] **Step 5: Run the workflow contract and exercise the state machine**

Run Step 1 again. Expected: exit 0. In Edge verify empty source validation, successful staged progress to 100%, cancellation, task drawer Escape dismissal, History filtering, and failed-task recovery action.

- [ ] **Step 6: Commit the workflow pages**

```powershell
git add -- .codex-research/tauri-react-ui/vedionotes-ui-concept.html
git commit -m "feat: prototype distillation and history workflows"
```

### Task 4: Implement Notes Library and AI Q&A workspaces

**Files:**
- Modify: `.codex-research/tauri-react-ui/vedionotes-ui-concept.html`
- Test: inline Node.js assertions and browser interaction

**Interfaces:**
- Consumes: `state`, `navigate()`, `announce()`.
- Produces: `mockNotes`, `renderLibrary()`, `selectNote(id)`, `filterNotes(query,category)`, `renderQa()`, `sendMockQuestion()`, and `escapeHtml(value)`.

- [ ] **Step 1: Add a failing library/Q&A contract**

```powershell
node -e "const fs=require('fs');const s=fs.readFileSync('.codex-research/tauri-react-ui/vedionotes-ui-concept.html','utf8');for(const x of ['class=\"library-sources\"','class=\"library-list\"','class=\"note-reader\"','class=\"note-inspector\"','id=\"note-search\"','function selectNote(','function filterNotes(','class=\"conversation-list\"','id=\"qa-composer\"','function sendMockQuestion(','class=\"source-chip\"'])if(!s.includes(x))throw new Error('missing '+x)"
```

Expected: exit 1.

- [ ] **Step 2: Add local note data and the four-region library**

Use three notes with different categories, timestamps, tags, source URLs, duration, Markdown-like sections, and related history task IDs. Render source navigation, searchable note list, semantic article body, and properties inspector. Every user-provided mock string must pass through:

```js
function escapeHtml(value){ return String(value).replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char])); }
```

- [ ] **Step 3: Add note selection, category filtering, and empty search state**

`selectNote(id)` updates `state.noteId`, then re-renders only list selection, reader, and inspector. `filterNotes()` performs case-insensitive title/summary/tag matching and displays `没有找到匹配笔记` plus a clear-search button when empty.

- [ ] **Step 4: Add conversation list, sourced answers, controls, and composer behavior**

The active conversation includes a user question, two assistant answer blocks, and source chips tied to the mock notes. `sendMockQuestion()` rejects empty text, appends the escaped user message, sets a visible `正在查找笔记…` state, then appends a deterministic assistant response after 700 ms and announces completion.

- [ ] **Step 5: Run the library/Q&A contract and interaction checks**

Run Step 1 again. Expected: exit 0. In Edge select every note, filter by category, force and clear an empty search, Tab through source chips, send a mock question, and verify the temporary loading state does not block navigation.

- [ ] **Step 6: Commit the knowledge and AI pages**

```powershell
git add -- .codex-research/tauri-react-ui/vedionotes-ui-concept.html
git commit -m "feat: prototype notes library and AI workspace"
```

### Task 5: Implement all five Settings sections and confirmation behavior

**Files:**
- Modify: `.codex-research/tauri-react-ui/vedionotes-ui-concept.html`
- Test: inline Node.js assertions and browser interaction

**Interfaces:**
- Consumes: `state`, `setTheme()`, `setDensity()`, `announce()`.
- Produces: `renderSettings()`, `selectSettingsSection(section)`, `selectTranscriptionMode(mode)`, `toggleModel(modelId)`, `filterProviders(query)`, `openConfirm(options)`, and `closeModal()`.

- [ ] **Step 1: Add a failing Settings contract**

```powershell
node -e "const fs=require('fs');const s=fs.readFileSync('.codex-research/tauri-react-ui/vedionotes-ui-concept.html','utf8');for(const x of ['data-settings-section=\"appearance\"','data-settings-section=\"transcription\"','data-settings-section=\"ai\"','data-settings-section=\"data\"','data-settings-section=\"about\"','SenseVoice','Whisper','CUDA','在线转写','id=\"provider-search\"','Markdown 输出目录','清理缓存','应用版本','function openConfirm(','role=\"dialog\"'])if(!s.includes(x))throw new Error('missing '+x)"
```

Expected: exit 1.

- [ ] **Step 2: Build Settings navigation and Appearance behavior**

Render five labeled subsection buttons and one visible panel. Appearance provides Light/Dark/System theme buttons, Comfortable/Compact density buttons, and a Reduced Motion switch that adds `data-reduced-motion="true"` to `<html>`.

- [ ] **Step 3: Build Speech-to-Text mode cards and model lifecycle cards**

Show CPU/SenseVoice, GPU/Whisper/CUDA, and Online mode selectors. Each model card includes engine, language, size, speed/accuracy text, explicit Installed/Available/Active status, and Download/Delete/Activate actions. Download is simulated with progress; delete always calls `openConfirm()`.

- [ ] **Step 4: Build AI Access, Data Management, and About**

AI Access includes provider search over a small explicit mock list, model combobox, Base URL, password input that never persists, credential status, four protocol chips, and six capability chips. Data Management includes Markdown output directory, export format, cache rows, logs, and confirmation-based clear. About includes version `0.0.1 concept`, source attribution, component health, and safe external repository links.

- [ ] **Step 5: Implement accessible confirmations and Escape handling**

```js
function openConfirm({title,message,confirmLabel,onConfirm}){ state.modal={title,message,confirmLabel,onConfirm}; renderModal(); requestAnimationFrame(()=>document.querySelector('#modal-cancel').focus()); }
function closeModal(){ state.modal=null; document.querySelector('#modal-root').replaceChildren(); }
document.addEventListener('keydown',event=>{ if(event.key!=='Escape')return; if(state.modal)closeModal(); else if(!document.querySelector('#task-drawer').hidden)closeTaskDrawer(); });
```

- [ ] **Step 6: Run the Settings contract and manually verify all five sections**

Run Step 1 again. Expected: exit 0. Verify immediate theme/density/reduced-motion changes, every mode and model action, provider filtering, password non-persistence after rerender, directory/reset simulation, confirmation focus, Cancel, Confirm, and Escape.

- [ ] **Step 7: Commit Settings**

```powershell
git add -- .codex-research/tauri-react-ui/vedionotes-ui-concept.html
git commit -m "feat: prototype complete settings experience"
```

### Task 6: Complete responsive/accessibility rules and perform real Edge validation

**Files:**
- Modify: `.codex-research/tauri-react-ui/vedionotes-ui-concept.html`
- Create: `.codex-research/tauri-react-ui/renders/vedionotes-concept-1440x900.png`
- Create: `.codex-research/tauri-react-ui/renders/vedionotes-concept-900x700.png`
- Test: inline Node.js contract, Edge headless render, DevTools console/geometry probe

**Interfaces:**
- Consumes: the complete prototype.
- Produces: final offline artifact, two representative render captures, and fresh verification evidence.

- [ ] **Step 1: Add a failing final contract for security, accessibility, and responsive behavior**

```powershell
node -e "const fs=require('fs');const s=fs.readFileSync('.codex-research/tauri-react-ui/vedionotes-ui-concept.html','utf8');const required=['@media (max-width: 1180px)','@media (max-width: 900px)','prefers-reduced-motion','aria-live=\"polite\"','aria-label=\"关闭\"','loading=\"lazy\"','function escapeHtml('];for(const x of required)if(!s.includes(x))throw new Error('missing '+x);const forbidden=[/<script[^>]+src=/i,/<link[^>]+href=/i,/https?:\/\/(?!github\.com\/VedioNotes)/i,/@tauri-apps/i,/invoke\s*\(/i,/localStorage/i,/sessionStorage/i,/fetch\s*\(/i,/XMLHttpRequest/i];for(const re of forbidden)if(re.test(s))throw new Error('forbidden '+re);console.log('final static contract pass')"
```

Expected: initially fail until final responsive/accessibility details and all remote strings are removed.

- [ ] **Step 2: Finish narrow-window layout and image/modal semantics**

At 1180 px, collapse secondary inspectors into a toggleable drawer. At 900 px, collapse the primary sidebar to 88 px, stack create/results cards, convert library to list/reader with explicit inspector button, and keep composer/actions visible. Declare aspect ratios for preview surfaces, lazy-load any embedded data image, and ensure no fixed element obscures scroll content.

- [ ] **Step 3: Run the final static contract**

Run Step 1 again. Expected: `final static contract pass`.

- [ ] **Step 4: Render the real HTML in Edge at two viewports**

```powershell
$edge=(Get-Command msedge.exe -ErrorAction SilentlyContinue).Source
if(-not $edge){$edge='C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'}
$html=(Resolve-Path '.codex-research\tauri-react-ui\vedionotes-ui-concept.html').Path
$url='file:///'+($html -replace '\\','/')
New-Item -ItemType Directory -Force '.codex-research\tauri-react-ui\renders' | Out-Null
& $edge --headless=new --disable-gpu --hide-scrollbars --window-size=1440,900 --screenshot=(Resolve-Path '.codex-research\tauri-react-ui').Path+'\renders\vedionotes-concept-1440x900.png' $url
& $edge --headless=new --disable-gpu --hide-scrollbars --window-size=900,700 --screenshot=(Resolve-Path '.codex-research\tauri-react-ui').Path+'\renders\vedionotes-concept-900x700.png' $url
```

Expected: both PNG files exist, exceed 10 KB, and show nonblank UI.

- [ ] **Step 5: Inspect both renders and probe geometry in Edge**

Use the local image viewer to inspect both PNG files. Then connect to a temporary Edge DevTools port or use the existing CDP harness to evaluate:

```js
({
  title: document.title,
  width: document.documentElement.clientWidth,
  scrollWidth: document.documentElement.scrollWidth,
  activeRoute: document.querySelector('[data-route][aria-current="page"]')?.dataset.route,
  visiblePages: [...document.querySelectorAll('[data-page]')].filter(node=>!node.hidden).length,
  unlabeledButtons: [...document.querySelectorAll('button')].filter(button=>!button.textContent.trim()&&!button.getAttribute('aria-label')).length
})
```

Expected at every viewport: `scrollWidth === width`, `activeRoute === "home"`, `visiblePages === 1`, and `unlabeledButtons === 0`.

- [ ] **Step 6: Run the complete interaction checklist**

Verify all six routes, five Settings subsections, sidebar collapse, theme/density/reduced-motion, source validation, full progress and cancel paths, task drawer, History filters/details, note selection/search/empty state, AI send/loading/answer, model actions, provider search, confirmation focus/Escape, and toast announcements. Record any failure before making a completion claim.

- [ ] **Step 7: Commit the final artifact and render evidence**

```powershell
git add -- .codex-research/tauri-react-ui/vedionotes-ui-concept.html .codex-research/tauri-react-ui/renders/vedionotes-concept-1440x900.png .codex-research/tauri-react-ui/renders/vedionotes-concept-900x700.png
git commit -m "test: verify standalone VedioNotes UI concept"
```

- [ ] **Step 8: Open the final prototype for user inspection**

```powershell
$edge=(Get-Command msedge.exe -ErrorAction SilentlyContinue).Source
if(-not $edge){$edge='C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'}
Start-Process -FilePath $edge -ArgumentList (Resolve-Path '.codex-research\tauri-react-ui\vedionotes-ui-concept.html').Path
```

Expected: a visible Edge window opens the interactive prototype; no application build or Tauri process is started.
