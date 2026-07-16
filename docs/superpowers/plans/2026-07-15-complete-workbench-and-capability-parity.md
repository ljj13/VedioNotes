# Complete Workbench and Capability Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the partial production UI with the approved complete workbench and ensure every enabled interaction has a tested React-to-Tauri-to-Rust implementation, including real SenseVoice CPU transcription and custom providers.

**Architecture:** React owns presentation and typed interaction state; `src/lib/bridge.ts` is the only frontend boundary to Tauri. Rust commands validate identifiers/options and delegate to focused SQLite stores, provider clients, artifact managers and hidden-process adapters. A machine-readable capability contract and screenshot suite gate every page and control.

**Tech Stack:** Tauri 2, React 19, TypeScript 5.8, Vite/Vitest, Rust 2021, reqwest, rusqlite, Windows Credential Manager, bundled FFmpeg, whisper.cpp, sherpa-onnx SenseVoice sidecar.

## Global Constraints

- Visual source of truth: `.superpowers/brainstorm/ui-proposal-1783996252/content/workbench-ciphertalk-inspired.html`.
- Production routes: `home | create | progress | result | library | qa | tasks | settings`.
- Sidebar is exactly 220 px expanded and 88 px collapsed; main surface keeps an approximately 12 px inset and 24–26 px radius.
- Every enabled control must map to a React handler, bridge command/event, Rust service, side effect/persistence, failure state and test.
- No real/paid API calls, real media/model downloads or real Credential Manager reads occur in automated development verification.
- Real model/runtime downloads occur only after an explicit user click in the application.
- Secrets remain in Windows Credential Manager and are never returned to React.
- Build only `src-tauri/target/release/video-distiller.exe`; do not build or run MSI/NSIS unless explicitly requested.
- The workspace is not a Git repository. Replace commit steps with file-backed checkpoints in `progress.md` and task-specific review evidence under `outputs`.

---

### Task 1: Capability contract, navigation state and shell geometry

**Files:**
- Create: `src/lib/capabilityContract.ts`
- Create: `tests/static/complete-workbench-capabilities.test.mjs`
- Modify: `src/lib/workbenchNavigation.ts`
- Modify: `src/lib/workbenchNavigation.test.ts`
- Modify: `src/components/WorkbenchShell.tsx`
- Modify: `src/components/WorkbenchSidebar.tsx`
- Modify: `src/components/WorkbenchShell.test.tsx`
- Modify: `src/styles/app.css`

**Interfaces:**
- Produces `WorkbenchView = 'home' | 'create' | 'progress' | 'result' | 'library' | 'qa' | 'tasks' | 'settings'`.
- Produces `CAPABILITY_CONTRACT: readonly CapabilityMapping[]`, where `CapabilityMapping` contains `id`, `route`, `control`, `handler`, `bridge`, `service`, `effect`, `failure`, and `tests`.
- Produces sidebar callbacks for every non-transient route; `progress`/`result` are reached from task state and actions.

- [x] **Step 1: Write failing navigation, shell and static capability tests**

```ts
expect(workbenchNavigationReducer(initial, { type: 'open-view', view: 'tasks' }).view).toBe('tasks');
expect(screen.getByRole('navigation', { name: '主导航' })).toHaveTextContent('首页新建提炼笔记库AI 问答历史任务');
expect(CAPABILITY_CONTRACT.every(row => row.handler && row.bridge && row.service && row.failure)).toBe(true);
```

- [x] **Step 2: Run RED tests**

Run: `npm test -- --run src/lib/workbenchNavigation.test.ts src/components/WorkbenchShell.test.tsx && node tests/static/complete-workbench-capabilities.test.mjs`  
Expected: FAIL because routes, sidebar items and contract do not exist.

- [x] **Step 3: Implement typed navigation, capability rows and exact shell geometry**

```ts
export type WorkbenchView = 'home' | 'create' | 'progress' | 'result' | 'library' | 'qa' | 'tasks' | 'settings';
export type PrimaryWorkbenchView = 'home' | 'create' | 'library' | 'qa' | 'tasks';
export type CapabilityMapping = {
  id: string; route: WorkbenchView; control: string; handler: string;
  bridge: string; service: string; effect: string; failure: string; tests: readonly string[];
};
```

Implement the complete icon-only/copy sidebar from the approved reference using consistent inline SVGs. Use CSS variables `--sidebar-expanded: 220px`, `--sidebar-collapsed: 88px`, `--radius-panel: 26px`; collapse label width/gaps as well as opacity.

- [x] **Step 4: Run GREEN and focused visual-structure checks**

Run: `npm test -- --run src/lib/workbenchNavigation.test.ts src/components/WorkbenchShell.test.tsx && node tests/static/complete-workbench-capabilities.test.mjs`  
Expected: all pass; static test rejects `prototype`, `preview`, `coming soon`, `todo` and unmapped enabled controls.

- [x] **Step 5: Record Task 1 evidence**

Append exact commands/counts to `progress.md`; save review to `outputs/complete-parity-task-01-review.md`.

### Task 2: Home and complete Create workspace

**Files:**
- Create: `src/components/HomeWorkspace.tsx`
- Create: `src/components/HomeWorkspace.test.tsx`
- Modify: `src/components/CreateWorkspace.tsx`
- Modify: `src/components/CreateWorkspace.test.tsx`
- Modify: `src/components/InputPanel.tsx`
- Modify: `src/components/InputPanel.test.tsx`
- Modify: `src/App.tsx`
- Modify: `src/styles/app.css`

**Interfaces:**
- Consumes existing `HistoryEntry[]`, `LocalModelStatus[]`, `CudaRuntimeStatus`, `TaskOptions`, `ProfileSelectors` and task-start handler.
- Produces `HomeSnapshot` presentation and approved two-column Create composition without demo constants.

- [x] **Step 1: Add failing tests for real Home metrics and Create hierarchy**

```tsx
render(<HomeWorkspace snapshot={{ noteCount: 2, readyModelCount: 1, recent: [] }} onNavigate={navigate} />);
expect(screen.getByText('2')).toBeInTheDocument();
expect(screen.getByRole('button', { name: '新建提炼' })).toBeInTheDocument();
expect(screen.getByRole('region', { name: '处理方案' })).toBeInTheDocument();
expect(screen.getAllByRole('radio', { name: /精简|详细|教程|学术|会议纪要|小红书/ })).toHaveLength(6);
```

- [x] **Step 2: Run RED**

Run: `npm test -- --run src/components/HomeWorkspace.test.tsx src/components/CreateWorkspace.test.tsx src/components/InputPanel.test.tsx`  
Expected: FAIL because Home and the approved regions do not exist.

- [x] **Step 3: Implement Home and recompose existing real Create controls**

Do not duplicate start logic. `App` supplies counts/readiness and passes the existing `InputPanel` handlers into the new visual sections. Advanced options render only typed `TaskOptions`. Link/local-file, platform status, six styles, screenshots, profile selectors and Start retain current bridge calls.

- [x] **Step 4: Run GREEN and complete frontend regression**

Run: `npm test -- --run src/components/HomeWorkspace.test.tsx src/components/CreateWorkspace.test.tsx src/components/InputPanel.test.tsx && npm test -- --run --silent`  
Expected: focused and full frontend suites pass.

- [x] **Step 5: Save desktop/narrow screenshots and review**

Capture `home`, `create`, `create-dark`, and `create-narrow`; compare sidebar, headings, 65/35 grid, style cards and process card with the HTML reference. Record in `outputs/complete-parity-task-02-review.md`.

### Task 3: Progress and Result workspaces

**Files:**
- Create: `src/components/ProgressWorkspace.tsx`
- Create: `src/components/ProgressWorkspace.test.tsx`
- Create: `src/components/ResultWorkspace.tsx`
- Create: `src/components/ResultWorkspace.test.tsx`
- Modify: `src/components/ProgressPanel.tsx`
- Modify: `src/components/ResultPanel.tsx`
- Modify: `src/App.tsx`
- Modify: `src/styles/app.css`

**Interfaces:**
- Consumes `TaskProgress`, persisted `taskStartedAtMs`, cancellation, diagnostic-log opener, `DistillationResult`, save/copy/export and history selection.
- Produces real floating progress state and semantic result TOC metadata.

- [x] **Step 1: Add failing tests**

```tsx
expect(screen.getByRole('progressbar', { name: '处理进度' }).getAttribute('aria-valuenow')).toBe('68');
expect(screen.getByRole('button', { name: '后台运行' })).toBeInTheDocument();
expect(screen.getByRole('navigation', { name: '文章目录' })).toHaveTextContent('核心结论');
expect(screen.getByRole('button', { name: '复制全文' })).toBeEnabled();
```

- [x] **Step 2: Run RED**

Run: `npm test -- --run src/components/ProgressWorkspace.test.tsx src/components/ResultWorkspace.test.tsx src/components/ProgressPanel.test.tsx`  
Expected: FAIL on missing workspaces and actions.

- [x] **Step 3: Implement compositions using existing task state**

Move no timer into route-local state. Derive TOC from the already parsed SafeMarkdown heading model, show actual engine/device/log state, and keep cancellation/listener-before-invoke semantics unchanged.

- [x] **Step 4: Run GREEN/full regression and visual review**

Run: `npm test -- --run src/components/ProgressWorkspace.test.tsx src/components/ResultWorkspace.test.tsx src/components/ProgressPanel.test.tsx && npm test -- --run --silent`  
Expected: all pass. Capture `progress`, `progress-background-pill`, `result`, and `result-narrow`.

- [x] **Step 5: Record Task 3 evidence**

Save `outputs/complete-parity-task-03-review.md`.

### Task 4: Task records, Library metadata and search backend

**Files:**
- Create: `src-tauri/src/task_store.rs`
- Create: `src-tauri/tests/task_store_test.rs`
- Modify: `src-tauri/src/history_store.rs`
- Modify: `src-tauri/tests/history_store_test.rs`
- Modify: `src-tauri/src/domain.rs`
- Modify: `src-tauri/src/commands.rs`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src/lib/types.ts`
- Modify: `src/lib/bridge.ts`

**Interfaces:**
- Produces `TaskRecord`, `TaskState`, `LibraryQuery`, `LibraryEntry`, `Tag`, `LibrarySnapshot`.
- Produces commands `get_home_snapshot`, `list_task_records`, `retry_task_record`, `search_library`, `set_note_favorite`, `set_note_tags`, and `mark_note_opened`.

- [x] **Step 1: Write RED SQLite migration and command tests**

```rust
let id = store.insert_task(&TaskRecordInput::running("task-1"))?;
store.finish_task(id, TaskState::Failed, Some("local_whisper_output_unreadable"), None)?;
assert_eq!(store.list_tasks("")?[0].state, TaskState::Failed);
store.set_favorite(note_id, true)?;
store.set_tags(note_id, &["数理课程".into()])?;
assert!(store.search_library(&LibraryQuery::tag("数理课程"))?[0].favorite);
```

- [x] **Step 2: Run RED**

Run: `cargo test --offline --manifest-path src-tauri/Cargo.toml --test task_store_test --test history_store_test`  
Expected: FAIL on missing schemas/types.

- [x] **Step 3: Implement idempotent migrations and typed commands**

Use SQLite-owned IDs and `PRAGMA table_info` migrations. Store redacted error codes/log IDs, not secret-bearing messages or arbitrary paths. Keep existing notes/chat foreign-key behavior.

- [x] **Step 4: Run GREEN and full Rust regression**

Run: `cargo test --offline --manifest-path src-tauri/Cargo.toml --test task_store_test --test history_store_test && cargo test --offline --manifest-path src-tauri/Cargo.toml`  
Expected: focused and full Rust suites pass.

- [x] **Step 5: Record Task 4 evidence**

Save schema/compatibility review in `outputs/complete-parity-task-04-review.md`.

### Task 5: Library, dedicated Q&A and Task History frontend

**Files:**
- Create: `src/components/LibraryWorkspace.tsx`
- Create: `src/components/LibraryWorkspace.test.tsx`
- Create: `src/components/QaWorkspace.tsx`
- Create: `src/components/QaWorkspace.test.tsx`
- Create: `src/components/TaskHistoryWorkspace.tsx`
- Create: `src/components/TaskHistoryWorkspace.test.tsx`
- Modify: `src/components/HistoryRail.tsx`
- Modify: `src/components/HistoryWorkspace.tsx`
- Modify: `src/App.tsx`
- Modify: `src/styles/app.css`

**Interfaces:**
- Consumes Task 4 bridge commands and existing `askHistoryNote`.
- Produces three-column Library, note-reserved Q&A layout, dedicated Q&A and searchable task list.

- [x] **Step 1: Write RED interaction tests**

```tsx
await user.click(screen.getByRole('button', { name: '已收藏' }));
expect(searchLibrary).toHaveBeenCalledWith(expect.objectContaining({ favorite: true }));
await user.click(screen.getByRole('button', { name: '向笔记提问' }));
expect(screen.getByRole('complementary', { name: '笔记问答' })).toBeVisible();
expect(screen.getByRole('table', { name: '历史任务' })).toHaveTextContent('失败');
```

- [x] **Step 2: Run RED**

Run: `npm test -- --run src/components/LibraryWorkspace.test.tsx src/components/QaWorkspace.test.tsx src/components/TaskHistoryWorkspace.test.tsx`  
Expected: FAIL because components/routes are absent.

- [x] **Step 3: Implement semantic/responsive workspaces**

Use SafeMarkdown; never inject provider HTML. At wide width reserve Q&A grid space; under the responsive breakpoint use a focus-trapped drawer. Search requests are debounced and stale responses ignored.

- [x] **Step 4: Run GREEN/full regression and visual checks**

Run: `npm test -- --run src/components/LibraryWorkspace.test.tsx src/components/QaWorkspace.test.tsx src/components/TaskHistoryWorkspace.test.tsx && npm test -- --run --silent`  
Expected: all pass. Capture Library open/closed Q&A, dedicated Q&A and task history at desktop/narrow sizes.

- [x] **Step 5: Record Task 5 evidence**

Save `outputs/complete-parity-task-05-review.md`.

### Task 6: Full Settings shell and custom transcription/LLM providers

**Files:**
- Create: `src/components/settings/SettingsNav.tsx`
- Create: `src/components/settings/TranscriptionSettings.tsx`
- Create: `src/components/settings/AiAccessSettings.tsx`
- Create: `src/components/settings/ProviderEditorDialog.tsx`
- Modify: `src/components/SettingsWorkspace.tsx`
- Modify: `src/components/ProfileManager.tsx`
- Modify: `src/components/ProfileEditor.tsx`
- Modify: `src/components/SettingsWorkspace.test.tsx`
- Modify: `src/components/ProfileManagement.test.tsx`
- Modify: `src/styles/app.css`

**Interfaces:**
- Reuses `saveTranscriptionProfile`, `saveSummaryProfile`, `deleteProfile`, `setActiveProfile`, `testProfile`, `discoverSummaryModels`, credential presence and `StyledSelect`.
- Produces settings tabs exactly matching Appearance/STT/AI/Data/About and provider-specific editable forms.

- [x] **Step 1: Add RED tests for custom providers and no hidden legacy capability**

```tsx
await user.click(screen.getByRole('button', { name: '新增转写服务' }));
await user.click(screen.getByRole('button', { name: /服务商/ }));
await user.click(screen.getByRole('option', { name: '自定义兼容' }));
await user.type(screen.getByLabelText('接口地址'), 'https://example.test/v1');
await user.click(screen.getByRole('button', { name: '保存服务' }));
expect(saveTranscriptionProfile).toHaveBeenCalled();
expect(screen.getByRole('button', { name: '新增 AI 服务' })).toBeEnabled();
```

- [x] **Step 2: Run RED**

Run: `npm test -- --run src/components/SettingsWorkspace.test.tsx src/components/ProfileManagement.test.tsx`  
Expected: FAIL because new settings pages hide CRUD.

- [x] **Step 3: Re-compose existing profile capabilities in approved UI**

Keep provider-specific profiles independent. Replace native datalist presentation with `StyledSelect` + editable input while preserving explicit discovery. API key fields accept a replacement but never populate stored secrets.

- [x] **Step 4: Run GREEN/full frontend regression and visual review**

Run: `npm test -- --run src/components/SettingsWorkspace.test.tsx src/components/ProfileManagement.test.tsx src/components/StyledSelect.test.tsx && npm test -- --run --silent`  
Expected: all pass. Capture STT online custom editor and AI custom editor/listbox.

- [x] **Step 5: Record Task 6 evidence**

Save `outputs/complete-parity-task-06-review.md`.

### Task 7: SenseVoice verified artifact manager and hidden process adapter

**Files:**
- Create: `src-tauri/src/artifact_download.rs`
- Create: `src-tauri/src/sensevoice_models.rs`
- Create: `src-tauri/src/providers/sensevoice.rs`
- Create: `src-tauri/tests/sensevoice_models_test.rs`
- Create: `src-tauri/tests/sensevoice_provider_test.rs`
- Modify: `src-tauri/src/local_models.rs`
- Modify: `src-tauri/src/cuda_runtime.rs`
- Modify: `src-tauri/src/providers/mod.rs`
- Modify: `src-tauri/src/commands.rs`
- Modify: `src-tauri/src/lib.rs`

**Interfaces:**
- Produces `SenseVoiceModelId::{Int8,Float32}`, `SenseVoiceStatus`, `SenseVoiceDownloadProgress`, commands `get_sensevoice_status`, `download_sensevoice`, `cancel_sensevoice_download`, `delete_sensevoice`, and `set_sensevoice_model`.
- Produces `SenseVoiceAdapter::transcribe(&Path, SenseVoiceOptions, CancellationToken) -> Result<Transcript, AppError>`.

- [x] **Step 1: Write RED fake-client/fake-process tests**

```rust
assert_eq!(client.requests()[0].range, None);
assert_eq!(client.requests()[1].host(), "modelscope.cn");
assert_eq!(installed.state, ArtifactState::Ready);
assert!(runner.last_spawn().windows_hidden);
assert_eq!(result.text, "开放时间早上九点至下午五点。");
```

Cover Range resume, one fallback only after client/source failure, digest mismatch retention marker, atomic rename, canonical delete, cancellation/kill/wait, timeout, malformed JSON and redacted error output.

- [x] **Step 2: Run RED**

Run: `cargo test --offline --manifest-path src-tauri/Cargo.toml --test sensevoice_models_test --test sensevoice_provider_test`  
Expected: FAIL on missing modules/types.

- [x] **Step 3: Implement generic artifact safety and SenseVoice manifests**

Extract only the tested resume/hash/rename mechanics shared by Whisper/CUDA. Manifests contain fixed Hugging Face/ModelScope URLs, sizes and published LFS/release digests for runtime, `model.int8.onnx`, `model.onnx`, and `tokens.txt`. No command accepts a URL or target path from React.

Invoke the pinned official sherpa-onnx Windows sidecar with model/tokens/language/ITN/input arguments and parse its documented bounded JSON stdout. Use `CREATE_NO_WINDOW`, tokenized args and bounded output.

- [x] **Step 4: Run GREEN plus Whisper/CUDA/full Rust regressions**

Run: `cargo test --offline --manifest-path src-tauri/Cargo.toml --test sensevoice_models_test --test sensevoice_provider_test --test local_models_test --test cuda_runtime_test --test local_whisper_test && cargo test --offline --manifest-path src-tauri/Cargo.toml`  
Expected: all pass with fake clients/runners only.

- [x] **Step 5: Record Task 7 evidence**

Document official manifest sources/digests and fake-only verification in `outputs/complete-parity-task-07-review.md`.

### Task 8: SenseVoice UI and task-pipeline selection

**Files:**
- Create: `src/components/SenseVoiceManager.tsx`
- Create: `src/components/SenseVoiceManager.test.tsx`
- Modify: `src/components/settings/TranscriptionSettings.tsx`
- Modify: `src/components/InputPanel.tsx`
- Modify: `src/lib/types.ts`
- Modify: `src/lib/bridge.ts`
- Modify: `src/App.tsx`
- Modify: `src-tauri/src/domain.rs`
- Modify: `src-tauri/src/commands.rs`
- Modify: `src-tauri/tests/task_options_test.rs`

**Interfaces:**
- Adds `transcriptionMode: 'sensevoice_cpu' | 'whisper_local' | 'online_profile'` and selected SenseVoice model/languages to preferences/task options.
- Consumes Task 7 status/progress commands and emits listener-before-invoke-safe UI updates.

- [x] **Step 1: Write RED UI/pipeline tests**

```tsx
await user.click(screen.getByRole('button', { name: '下载 int8 模型' }));
expect(listen.mock.invocationCallOrder[0]).toBeLessThan(downloadSenseVoice.mock.invocationCallOrder[0]);
expect(screen.getByRole('progressbar', { name: 'SenseVoice 下载进度' })).toBeVisible();
```

Rust test asserts subtitle success skips SenseVoice and missing subtitles with CPU mode invokes only SenseVoice, never Whisper/online fallback.

- [x] **Step 2: Run RED**

Run: `npm test -- --run src/components/SenseVoiceManager.test.tsx && cargo test --offline --manifest-path src-tauri/Cargo.toml --test task_options_test sensevoice`  
Expected: FAIL on missing bridge/options.

- [x] **Step 3: Implement real lifecycle UI and provider routing**

Support install/pause/resume/retry/delete/activate, five language toggles with at least one required, explicit source/fallback/status/errors and no automatic download. Start is blocked with a recovery action if the selected engine is unready.

- [x] **Step 4: Run GREEN/full regressions and settings visual review**

Run: `npm test -- --run src/components/SenseVoiceManager.test.tsx && npm test -- --run --silent && cargo test --offline --manifest-path src-tauri/Cargo.toml`  
Expected: all pass. Capture CPU not-installed/downloading/ready/error states.

- [x] **Step 5: Record Task 8 evidence**

Save `outputs/complete-parity-task-08-review.md`.

### Task 9: Versioned AI capability store, secrets and provider clients

**Files:**
- Create: `src-tauri/src/capability_store.rs`
- Create: `src-tauri/src/ai_capabilities.rs`
- Create: `src-tauri/tests/capability_store_test.rs`
- Create: `src-tauri/tests/ai_capabilities_test.rs`
- Modify: `src-tauri/src/credential_store.rs`
- Modify: `src-tauri/src/commands.rs`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src/lib/types.ts`
- Modify: `src/lib/bridge.ts`

**Interfaces:**
- Produces versioned configs for `VectorConfig`, `RerankConfig`, `WebSearchConfig`, `TtsConfig`, `ImageConfig`, and `LocalAgentConfig`.
- Produces typed save/status/test commands and operational commands `index_note`, `semantic_search`, `web_search`, `synthesize_speech`, `generate_note_image`, `detect_local_agents`, and `run_local_agent`.

- [x] **Step 1: Write RED store/client tests**

```rust
store.save_vector(VectorConfig { enabled: true, endpoint: "https://example.test/v1".into(), ..fixture() })?;
assert!(!serde_json::to_string(&store.load()?)?.contains("secret-value"));
assert_eq!(vector.search("query", 5).await?.len(), 2);
assert_eq!(reranker.rank(&candidates).await?[0].id, "best");
```

Use scripted clients for provider payload/response normalization, timeouts, size limits, malformed responses and redaction. Use fake process runners for local agents.

- [x] **Step 2: Run RED**

Run: `cargo test --offline --manifest-path src-tauri/Cargo.toml --test capability_store_test --test ai_capabilities_test`  
Expected: FAIL on missing modules.

- [x] **Step 3: Implement stores, provider clients and safe consumers**

Persist only non-secrets atomically. Credential account keys are `capability:<kind>:<provider-id>`. Vector/rerank feed explicit retrieval; web search requires explicit mode; TTS/image write bounded app-owned outputs; local agents use non-shell hidden process execution with cancellation.

- [x] **Step 4: Run GREEN/full Rust and privacy regressions**

Run: `cargo test --offline --manifest-path src-tauri/Cargo.toml --test capability_store_test --test ai_capabilities_test --test credential_store_test && cargo test --offline --manifest-path src-tauri/Cargo.toml`  
Expected: all pass; failure text contains no fixture secrets.

- [x] **Step 5: Record Task 9 evidence**

Save `outputs/complete-parity-task-09-review.md`.

### Task 10: Complete AI Access UI and real consumer actions

**Files:**
- Create: `src/components/settings/VectorSettings.tsx`
- Create: `src/components/settings/RerankSettings.tsx`
- Create: `src/components/settings/WebSearchSettings.tsx`
- Create: `src/components/settings/TtsSettings.tsx`
- Create: `src/components/settings/ImageSettings.tsx`
- Create: `src/components/settings/LocalAgentSettings.tsx`
- Create: `src/components/settings/AiCapabilities.test.tsx`
- Modify: `src/components/settings/AiAccessSettings.tsx`
- Modify: `src/components/QaWorkspace.tsx`
- Modify: `src/components/LibraryWorkspace.tsx`
- Modify: `src/components/ResultWorkspace.tsx`
- Modify: `src/styles/app.css`

**Interfaces:**
- Consumes Task 9 bridge functions.
- Produces real save/test/status UI plus semantic search, explicit web Q&A, read-aloud, cover generation and send-to-agent actions.

- [x] **Step 1: Write RED interactions for all seven AI subtabs**

```tsx
for (const tab of ['大模型','向量','重排','联网','语音','作图','本地智能体']) {
  expect(screen.getByRole('tab', { name: tab })).toBeInTheDocument();
}
await user.click(screen.getByRole('button', { name: '测试向量配置' }));
expect(testVectorConfig).toHaveBeenCalledTimes(1);
await user.click(screen.getByRole('button', { name: '朗读当前笔记' }));
expect(synthesizeSpeech).toHaveBeenCalled();
```

- [x] **Step 2: Run RED**

Run: `npm test -- --run src/components/settings/AiCapabilities.test.tsx src/components/QaWorkspace.test.tsx src/components/LibraryWorkspace.test.tsx src/components/ResultWorkspace.test.tsx`  
Expected: FAIL on preview-only/missing controls.

- [x] **Step 3: Implement complete forms and consumers**

All dropdowns use StyledSelect/combobox styling and retain provider-specific values. Test actions display returned latency/status or sanitized failure. Disabled capabilities hide/disable their consumer action with an explanation; enabled configured capabilities execute the bridge.

- [x] **Step 4: Run GREEN/full frontend and visual review**

Run: `npm test -- --run src/components/settings/AiCapabilities.test.tsx src/components/QaWorkspace.test.tsx src/components/LibraryWorkspace.test.tsx src/components/ResultWorkspace.test.tsx && npm test -- --run --silent`  
Expected: all pass. Capture every AI subtab plus provider/model dropdowns.

- [x] **Step 5: Record Task 10 evidence**

Save `outputs/complete-parity-task-10-review.md`.

### Task 11: Export, cache, logs, About and appearance backend parity

**Files:**
- Create: `src-tauri/src/data_management.rs`
- Create: `src-tauri/tests/data_management_test.rs`
- Create: `src/components/settings/DataManagementSettings.tsx`
- Create: `src/components/settings/DataManagementSettings.test.tsx`
- Create: `src/components/settings/AppearanceSettings.tsx`
- Create: `src/components/settings/AboutSettings.tsx`
- Modify: `src-tauri/src/preferences.rs`
- Modify: `src-tauri/src/diagnostics.rs`
- Modify: `src-tauri/src/commands.rs`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src/lib/types.ts`
- Modify: `src/lib/bridge.ts`
- Modify: `src/components/SettingsWorkspace.tsx`

**Interfaces:**
- Produces `ExportPreferences`, `CacheCategory`, `CacheUsage`, `LogDescriptor`, `LogLevel`, `AboutSnapshot` and their typed commands.
- Commands accept enum/IDs, never arbitrary delete/read paths.

- [x] **Step 1: Write RED safe-filesystem and UI tests**

```rust
assert!(service.clear_cache(CacheCategory::TemporaryMedia)?.removed_bytes > 0);
assert!(service.clear_cache(CacheCategory::All)?.preserved_paths.contains(&history_root));
assert_eq!(service.read_log(log_id, 64 * 1024)?.len() <= 64 * 1024, true);
```

Frontend test selects HTML export, changes log level, refreshes sizes, confirms category clear, opens log directory and renders real version values.

- [x] **Step 2: Run RED**

Run: `cargo test --offline --manifest-path src-tauri/Cargo.toml --test data_management_test && npm test -- --run src/components/settings/DataManagementSettings.test.tsx`  
Expected: FAIL on missing commands/components.

- [x] **Step 3: Implement canonical data operations and forms**

Serializers produce Markdown/HTML/text. Cache enumeration follows fixed app-owned roots and excludes notes/models/runtimes. Logs are listed/read by validated ID with bounded tails. Appearance persists system/light/dark, density and reduced motion. About reads package/runtime metadata.

- [x] **Step 4: Run GREEN/full regressions and visual review**

Run: `cargo test --offline --manifest-path src-tauri/Cargo.toml --test data_management_test && npm test -- --run src/components/settings/DataManagementSettings.test.tsx && cargo test --offline --manifest-path src-tauri/Cargo.toml && npm test -- --run --silent`  
Expected: all pass. Capture Appearance, Data export/cache/log and About.

- [x] **Step 5: Record Task 11 evidence**

Save `outputs/complete-parity-task-11-review.md`.

### Task 12: Full capability audit, visual parity and Release EXE gate

**Files:**
- Modify: `production-workbench.visual.test.mjs`
- Modify: `tests/static/complete-workbench-capabilities.test.mjs`
- Modify: `README.md`
- Modify: `THIRD_PARTY_NOTICES.md`
- Modify: `task_plan.md`
- Modify: `findings.md`
- Modify: `progress.md`
- Create: `outputs/complete-workbench-final-report.md`

**Interfaces:**
- Consumes all prior tasks.
- Produces final screenshots, complete capability-matrix audit and fresh `video-distiller.exe` metadata.

- [x] **Step 1: Expand screenshot matrix and static audit**

Cases: all eight routes, expanded/collapsed sidebar, light/dark, 2048×1152, 1280×800, 960×720 and narrow drawer/table-card states; every Settings top tab/subtab; all custom dropdown open states; SenseVoice not-installed/downloading/ready/error.

- [x] **Step 2: Run all static/frontend gates**

Run: `node tests/static/complete-workbench-capabilities.test.mjs && npm test -- --run --silent && npm run build`  
Expected: zero unmapped controls, all frontend tests pass, TypeScript/Vite build exits 0.

- [x] **Step 3: Run Rust, privacy and artifact gates**

Run: `cargo test --offline --manifest-path src-tauri/Cargo.toml`  
Expected: all Rust tests pass.

Run the project privacy scan over source/tests/docs excluding `node_modules`, `target`, `dist` and visual browser profiles for bearer tokens, API-key patterns and private-key headers. Expected: zero findings outside synthetic fixtures.

Run: `npm run tauri -- build --no-bundle`  
Expected: fresh `src-tauri/target/release/video-distiller.exe`, `MZ` header, nonzero SHA-256, no `target/release/bundle` directory and no installer execution.

- [x] **Step 4: Perform requirement-by-requirement and visual review**

For each capability-contract row, record test evidence and inspect its success/failure UI. Compare production/reference screenshots for geometry, navigation, hierarchy, typography, cards, dropdowns, responsive behavior and both themes. Any placeholder, missing route, hidden CRUD, overflow or visual mismatch is `Needs Changes`.

- [x] **Step 5: Update documentation and final report**

Document SenseVoice/sherpa-onnx licenses and opt-in downloads, custom provider security, AI capability consumers, data/cache/log boundaries and no-installer debug workflow. Record commands, counts, screenshot paths, EXE timestamp/size/hash and explicit limitations in `outputs/complete-workbench-final-report.md`.

## Plan self-review coverage

- Spec sections 3–4 (shell/eight routes): Tasks 1–5.
- Spec section 5 (SenseVoice/Whisper/online custom STT): Tasks 6–8.
- Spec section 6 (LLM/vector/rerank/web/TTS/image/local agent): Tasks 6, 9–10.
- Spec sections 7–8 (export/cache/log/appearance/about): Task 11.
- Spec sections 9–11 (backend boundary, capability matrix, migration): Tasks 1, 4, 7, 9, 11.
- Spec sections 12–13 (TDD/acceptance): every task plus Task 12.

