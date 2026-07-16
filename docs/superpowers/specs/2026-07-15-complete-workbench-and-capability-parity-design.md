# Complete Workbench and Capability Parity Design

**Date:** 2026-07-15  
**Status:** Approved by the user  
**Visual source of truth:** `.superpowers/brainstorm/ui-proposal-1783996252/content/workbench-ciphertalk-inspired.html`

## 1. Goal

Replace the partial production migration with a complete React/Tauri implementation of the approved CipherTalk-inspired workbench. Visual parity and operational parity are both required:

1. The production shell, sidebar, pages, page hierarchy, spacing, states and responsive behavior match the approved HTML reference.
2. Every enabled interactive control has a real Tauri bridge and Rust implementation, or invokes an existing real application workflow.
3. No production control may display prototype-only success, a fake download, a fake connection test, placeholder task data, or an enabled “coming later” action.
4. SenseVoice becomes a real installable and selectable CPU transcription engine. GPU remains whisper.cpp/CUDA; online transcription remains profile-driven.
5. Transcription and AI providers both support presets and user-defined compatible services without weakening credential isolation.

This is a production replacement of the current partial workbench composition, not another standalone prototype.

## 2. Non-goals and safety boundaries

- Keep Tauri 2 + React 19 + TypeScript + Rust. Do not add Electron.
- Do not replace the existing subtitle-first acquisition, local Whisper, CUDA, Markdown/history, cancellation, diagnostic-log or same-note chat contracts.
- Tests use local fixtures, scripted HTTP clients and in-memory credential backends. Automated verification never calls a paid API or downloads a real media/model payload.
- Real model/runtime downloads occur only after an explicit click in the installed application.
- Stored API keys remain in Windows Credential Manager and are never returned to React.
- During debugging, build only `src-tauri/target/release/video-distiller.exe`; do not produce or run MSI/NSIS unless separately requested.
- This workspace has no Git repository, so the normal spec commit step is not applicable.

## 3. Visual system and shell contract

### 3.1 Window and content frame

- Preserve the current native/custom Windows title bar and real minimize, maximize/restore and close commands.
- App background uses the approved pale layered canvas; dark mode uses matching semantic dark tokens.
- Main content is inset approximately 12 px from the window/sidebar edges and uses a 24–26 px outer radius.
- Cards use a consistent 16–22 px radius; pills use `9999px`.
- Borders are subtle and secondary to background layering. Glass is limited to the sidebar, floating progress, modal/drawer and selected hero surfaces.
- All motion is 150–300 ms and disabled/reduced under `prefers-reduced-motion`.

### 3.2 Sidebar

- Expanded width: 220 px. Collapsed width: 88 px.
- Expanded header contains the approved logo, `视频提炼`, and the secondary product line.
- Main destinations, in order: 首页、新建提炼、笔记库、AI 问答、历史任务.
- Footer contains real service readiness, real active local engine/compute summary, local workspace identity, 设置, and 收起/展开侧栏.
- Collapsed mode hides every text label from layout (`max-width: 0`, zero gaps, hidden overflow), centers fixed-size SVG icons, retains tooltips/accessible names, and shows the green service indicator at bottom-left.
- Use one consistent stroke SVG icon family; do not use text glyphs or emojis as production icons.

### 3.3 Responsive behavior

- Desktop ≥1280 px follows the approved wide layouts.
- Compact desktop/tablet 960–1279 px reduces gutters and secondary columns without horizontal overflow.
- Below 960 px the sidebar becomes the 88 px rail; three-column readers collapse secondary information into drawers.
- Below 720 px page controls stack, tables switch to cards, and all 44 px minimum targets remain reachable.

## 4. Navigation and page contracts

Production navigation expands from `create/history/settings` to:

`home | create | progress | result | library | qa | tasks | settings`

Task execution state remains above routing in `App`, so navigation never resets elapsed time, progress, cancellation or a completed result.

### 4.1 Home

Visual content:

- Greeting/hero with real cumulative note count and ready local-model count.
- Primary actions to create a task and open the library.
- Quick cards for link input, recent reading and task records.
- Recent tasks/notes summary and real service/GPU readiness.

Backend/data:

- Counts and recents come from SQLite history/task queries and local-model inspection.
- Readiness comes from active profile, credential-presence, SenseVoice/Whisper/CUDA runtime inspection.
- No hard-coded sample counts or tasks.

### 4.2 Create

Visual content follows the reference two-column composition:

- Page title and real compute readiness chip.
- Left: link/local-file source, platform detection, six note styles, screenshot option and advanced options.
- Right: active transcription/summary profiles, expected workflow, readiness/errors and primary Start action.

Backend/data:

- Existing source selection, native file dialog, platform routing, cookies, subtitle-first acquisition, note style, screenshots and task start are retained.
- Advanced options expose only actual `TaskOptions` fields. New options require Rust request fields and tests before appearing.
- Custom profiles selected in settings are immediately available in the processing-plan dropdowns.

### 4.3 Progress

- Stage timeline, overall percentage, stage percentage where available, elapsed time, current message, background navigation and cancellation.
- Run summary shows actual engine/model, CPU/GPU device, measured processing speed when derivable, and diagnostic-log status.
- Floating progress pill remains visible on other pages while a task runs and returns to Progress.
- Data comes only from task progress events, persisted task start time, runtime inspection and diagnostic-log commands.

### 4.4 Result

- Three-column reader: generated table of contents, semantically rendered Markdown, and note metadata/summary/keywords/generation information.
- Real actions: section navigation, Save As, copy whole note, export Markdown/HTML/text, save/open in Library and start same-note Q&A.
- TOC is derived from parsed Markdown headings; source/model/style metadata comes from the completed task/history record.

### 4.5 Library

- Left filters: search, all, recent, favorites and tags.
- Middle note list with sort and real metadata.
- Right semantic Markdown reader. Q&A occupies a reserved responsive column/drawer and never covers the note.
- Real operations: full-text search, recent-open tracking, favorite toggle, tag CRUD/filter, delete with confirmation, export and same-note Q&A.
- SQLite receives idempotent migrations for favorites, tags/note-tags, last-opened timestamp and search indexes. Existing history rows remain readable.

### 4.6 AI Q&A

- Dedicated conversation page with note selector, conversation history, citations/evidence and composer.
- Existing same-note Q&A remains the default safety boundary.
- When vector retrieval is enabled and indexed, selection can retrieve relevant passages from user-selected notes; answers expose note/section evidence.
- General web-assisted questions require an explicit Web Search toggle and must not silently send local note content to a search provider.

### 4.7 Task history

- Searchable responsive table/card list with title/source, state, duration, engine and action.
- SQLite task records include queued/running/succeeded/failed/cancelled status, start/end timestamps, profile/model/compute metadata, note ID, redacted error code and diagnostic-log reference.
- Actions open result/note, retry with copied safe task options, cancel an active task, or open the app-owned diagnostic log.
- Failed tasks remain visible even when no note was created.

### 4.8 Settings

- One settings page with the approved pill tab bar: 外观、语音转文字、AI 接入、数据管理、关于.
- Settings is a normal route; it retains sidebar context. No redundant top bar or separate “model management” page.

## 5. Speech-to-Text capability contract

### 5.1 CPU: SenseVoice

Models:

- `int8` recommended model (`model.int8.onnx` + `tokens.txt`).
- `float32` quality model (`model.onnx` + `tokens.txt`).
- Languages: Chinese, English, Japanese, Korean and Cantonese, with at least one selected.

Real one-click lifecycle:

- Inspect, download, pause/cancel, resume, retry, verify, activate and delete.
- UI shows bytes, percent, source/fallback, verification, installed version and recoverable errors.
- Download uses a Rust-owned fixed manifest with Hugging Face first and ModelScope fallback, Range resume, bounded redirects, `.part` files, digest verification and atomic rename.
- Runtime and model are installed only under canonical app-data directories. Delete commands accept fixed manifest IDs, never arbitrary paths.
- Production does not trust the CipherTalk presence/size-only check; every distributed file has a pinned digest and expected size.

Execution:

- Use the official sherpa-onnx Windows runtime through a pinned native sidecar/C API wrapper, not a Node native module and not Electron.
- Bundled FFmpeg produces a temporary 16 kHz mono WAV under the app-owned task directory.
- Rust invokes the sidecar with fixed tokenized arguments, hidden Windows process creation, timeout/cancellation, bounded output capture and redacted errors.
- Parsed text/timestamps enter the existing transcript/evidence pipeline and emit real progress.
- Subtitle-first acquisition still precedes ASR. SenseVoice runs only when CPU mode is selected and ASR is required.

### 5.2 GPU: whisper.cpp

- Reuse five existing Whisper model manifests, CUDA runtime inspection/install/delete, Auto/CPU/GPU compute selection and progress parser.
- Settings presents model, CUDA component status, device information and acceleration selection in the approved layout.
- No duplicate top-level model manager.

### 5.3 Online and custom transcription providers

- Presets: Tencent Flash, MiMo ASR and OpenAI-compatible.
- Custom profile supports display name, compatible provider/protocol, base URL, model, language, timeout and concurrency.
- Credentials are provider-specific and stored in Credential Manager.
- Save, edit, delete, activate and explicit connection test are real Rust commands.
- Connection tests use harmless provider-specific validation where possible; they never run on mount or provider selection.

## 6. AI Access capability contract

Every subtab stores non-secret configuration in a versioned atomic Rust store, secrets in Credential Manager, exposes status, and has a real explicit test. Enabled capabilities must have a real consumer listed below.

### 6.1 Large model

- Presets and custom providers, provider dropdown, conditional base URL, protocol dropdown, API key, model combo box/manual entry, explicit model refresh, capability display, test and save.
- Reuse and re-compose existing summary profile CRUD/model discovery rather than creating a second profile system.
- Provider-specific values remain independent when switching.
- Used by distillation summarization and note Q&A.

### 6.2 Vector embeddings

- Enable, endpoint, API key, model, dimension, image-vector setting/input format, test and save.
- Real backend embeds Markdown chunks, persists index metadata/vectors under app data, reindexes on demand, and powers Library semantic search/Q&A retrieval when enabled.
- A local/no-vector fallback preserves existing same-note behavior.

### 6.3 Rerank

- Enable, endpoint, API key, model, timeout, test and save.
- When enabled and healthy, reranks vector/text candidates before Q&A. On explicit configured fallback, retrieval continues without rerank and records the fallback.

### 6.4 Web search

- Tavily-compatible preset plus custom compatible endpoint, enable, API key, result limit, test and save.
- Used only by explicit web-assisted Q&A. Results are normalized, attributed and never mixed into same-note answers without a visible mode change.

### 6.5 Text-to-speech

- Provider dropdown with independent MiMo, Doubao and Qwen/custom configurations; endpoint, model, voice, instructions, speed, test playback and save.
- Real backend synthesizes only after explicit user action, stores a bounded app-owned preview file, returns a Tauri asset URL and deletes/replaces previews safely.
- Consumer: read selected note/result aloud and test playback.

### 6.6 Image generation

- Protocol/provider, endpoint, API key, model, size, timeout, test and save.
- Real backend generates only after explicit action, validates response type/size, stores output under the note's app-owned asset directory and returns a safe asset URL.
- Consumer: optional note cover/concept image action; it is not silently enabled in task processing.

### 6.7 Local agent

- Enable, Codex/Claude Code/OpenCode/custom executable, model, timeout, detection, test and save.
- Rust resolves only user-configured executable names/paths, launches hidden processes with a fixed non-shell argument vector, bounded stdin/stdout, cancellation and redacted logs.
- Consumer: explicit “send selected note to local agent” action. No background autonomous execution.

## 7. Data Management contract

### 7.1 Export

- Native directory picker; Markdown/HTML/text default format; screenshot/subtitle/source/log attachments.
- Each format has a real serializer and Save/Restore Defaults command.

### 7.2 Cache

- Rust enumerates canonical app-owned cache categories and reports real sizes: temporary media, screenshots, transcription intermediates and AI index.
- Category/all cleanup requires confirmation and accepts an enum, not a frontend path.
- History notes and downloaded models/runtimes are excluded from “cache” unless separately and explicitly deleted.

### 7.3 Logs

- Real log list, size summary, level preference, read-only bounded tail, refresh, open directory and safe clear commands.
- Log viewer never accepts arbitrary paths; it uses a validated log ID under the diagnostic root.

## 8. About and appearance

- Appearance persists light/dark/system theme, optional compact density and reduced-motion preference.
- About reads application version, Tauri/Rust/frontend versions where available, runtime component versions/licenses and app-data/export/log locations.
- Open-folder/documentation actions use registered safe opener commands. Version and component readiness are not hard coded.

## 9. Backend architecture

```text
React pages/components
  -> typed src/lib/bridge.ts commands + Tauri events
    -> Rust commands.rs validation/auth boundary
      -> domain services
         |- task/history/library/search service (SQLite)
         |- profile/capability/preferences stores
         |- credential store (Windows Credential Manager)
         |- model/runtime download manager
         |- SenseVoice / whisper.cpp hidden process adapters
         |- AI provider clients (LLM/vector/rerank/web/TTS/image)
         |- local-agent process adapter
         `- export/cache/log services
      -> sanitized result/event DTOs
  -> React state updates and accessible visual feedback
```

Rules:

- React never reads files, credentials or launches processes directly.
- Rust command inputs are typed IDs/options; filesystem paths are canonicalized and limited to approved roots.
- Provider URL resolution uses the existing normalized endpoint resolver and rejects unsupported schemes.
- Network/process clients are injectable so tests remain offline.
- Listener registration completes before invoking downloads/tasks.
- Cancellation always terminates/waits for child processes and cleans only app-owned temporary files.

## 10. Capability matrix gate

Before implementation, the plan must create a machine-readable/static capability contract with one row per production interaction:

| UI interaction | React handler | Bridge command/event | Rust service | Persistence/side effect | Failure state | Tests |
|---|---|---|---|---|---|---|

A row is acceptable only when all six implementation columns are populated. Static tests fail if an enabled control is marked `prototype`, `preview`, `todo`, `coming soon`, or lacks a command/workflow mapping.

## 11. Migration and compatibility

- Existing profile, credential, preference, model, history and note-chat data migrate in place with safe defaults.
- Existing profile IDs remain valid; custom profiles reappear in the new settings interface.
- Existing notes remain readable after Library schema additions.
- Current local Whisper remains selected when valid; installing SenseVoice does not silently switch engines.
- Old SettingsWorkspace URLs/state resolve to the nearest new tab.

## 12. TDD and staged delivery

1. Freeze capability matrix and visual geometry contracts.
2. Implement shell/navigation and route persistence.
3. Implement Home/Create/Progress/Result.
4. Implement Library/Q&A/Task History and SQLite migrations.
5. Implement full settings shell and restore custom transcription/LLM profiles.
6. Implement SenseVoice manifest/download/runtime/execution.
7. Implement vector/rerank/web/TTS/image/local-agent stores, clients, tests and consumers.
8. Implement export/cache/log/about operations.
9. Run per-page production screenshots against the HTML reference, responsive/accessibility review, frontend/Rust full suites, privacy scan and no-bundle Release EXE build.

Each stage follows RED -> minimal GREEN -> full regression -> independent requirement audit. A stage cannot advance with unmapped enabled controls.

## 13. Acceptance criteria

- Sidebar and all eight routes match the approved HTML hierarchy in expanded/collapsed, light/dark and compact-width screenshots.
- No enabled control is a visual-only placeholder; the capability matrix has complete mappings.
- Home/task/library counts and rows come from real stores, not demo constants.
- Library supports real search/recent/favorite/tag/sort/export/Q&A without content overlap.
- Custom transcription and LLM providers can be created, edited, tested, activated and deleted; keys remain isolated.
- SenseVoice int8/float32 has fake-client-tested dual-source resume, digest verification, install/delete/status and fake-process-tested CPU transcription.
- Vector/rerank/web/TTS/image/local-agent settings have real save/test operations and their stated real consumer actions.
- Cache/log/export controls operate only on canonical app-owned resources.
- All prior frontend/Rust regressions pass, privacy scan passes and a fresh `video-distiller.exe` builds without MSI/NSIS.
