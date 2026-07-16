# CipherTalk Settings Parity Prototype Design

**Date:** 2026-07-15  
**Status:** Approved  
**Target:** `.superpowers/brainstorm/ui-proposal-1783996252/content/workbench-ciphertalk-inspired.html`

## Goal

Correct the standalone workbench prototype so its speech-to-text and AI settings follow CipherTalk's actual information architecture and control behavior without copying CipherTalk branding or introducing Electron. The prototype remains a self-contained local HTML file and does not change production React/Tauri code.

## Reference Evidence

The design is based on complete reads of these local CipherTalk files:

- `D:\Project\CipherTalk\src\components\settings\SettingsLayout.tsx`
- `D:\Project\CipherTalk\src\components\settings\tabs\SttTab.tsx`
- `D:\Project\CipherTalk\src\components\ai\AISummarySettings.tsx`
- `D:\Project\CipherTalk\src\components\settings\tabs\EmbeddingTab.tsx`
- `D:\Project\CipherTalk\src\components\settings\tabs\RerankTab.tsx`
- `D:\Project\CipherTalk\src\components\settings\tabs\WebSearchTab.tsx`
- `D:\Project\CipherTalk\src\components\settings\tabs\TtsTab.tsx`
- `D:\Project\CipherTalk\src\components\settings\tabs\ImageGenTab.tsx`
- `D:\Project\CipherTalk\src\components\ai\LocalCodingAgentSettings.tsx`
- `D:\Project\CipherTalk\electron\services\ai\providers\catalog.ts`

## Root Cause

The current prototype copied the seven AI category names but replaced CipherTalk's provider `Select` and model `ComboBox` with nine always-visible provider cards. It also reduced each non-LLM mode to a few generic inputs. The structural test asserted only labels and category presence, so incomplete forms still passed.

## Speech-to-Text

The page keeps three top-level modes with full-width segmented tabs.

### CPU Mode

- Product name: SenseVoice local model.
- Model variants: int8 quantized, 235 MB, recommended; float32, 920 MB, higher precision.
- Model state: ready/not downloaded/checking.
- Actions: download, pause demonstration, clear confirmation, refresh status.
- Recognition languages: Chinese, English, Japanese, Korean, Cantonese, multi-select with at least one selected.
- Layout: model card on the left, language card on the right; stack vertically on narrow windows.

### GPU Mode

- Product name: Whisper GPU model using whisper.cpp.
- Model dropdown or selectable list includes Tiny, Base, Small, Turbo-Q5, Turbo-Q8, Medium, Large-v3-Turbo, and Large-v3.
- GPU detection card shows provider and availability.
- CUDA component card shows installed/not installed, location, download progress demonstration, and download action.
- GPU acceleration switch remains visible with explicit CPU fallback wording.

### Online Mode

- Provider dropdown: OpenAI compatible, Aliyun/Qwen-ASR, Volcano/Doubao fast ASR, custom.
- Fields: endpoint, API key, model, recognition-language dropdown, timeout, concurrency.
- Provider selection updates representative default address/model in the offline prototype.
- Test button reports a prototype-only result and never performs a request.
- Privacy/cost warning remains visible.

## AI Access

Seven submodes remain: Large Model, Vector, Rerank, Web, Speech, Image, Local Agent.

### Large Model

- Main provider control is a labeled dropdown, never a provider-card grid.
- Offline representative providers: DeepSeek, OpenAI, Claude, Gemini, Qwen, Kimi, SiliconFlow, Ollama, and Custom.
- Provider selection updates provider-specific model options, protocol, endpoint, description, and summary without network access.
- Protocol is a dropdown when relevant: OpenAI Responses, OpenAI Compatible, Anthropic, Google Gemini.
- Model is an editable dropdown with representative options and a visual refresh action.
- Fields/actions: conditional endpoint, API key with show/hide, model capability strip, inline model-list status, test connection, save provider.
- Right summary card shows provider, protocol, model, masked key state, and address.
- Add-preset modal and preset-management drawer remain separate from the main provider dropdown.

### Vector

- Enable switch.
- Base URL, API key, embedding model, vector dimension.
- Image-vectorization switch.
- Image-input-format dropdown: Auto, Base64 object, Content Part, Data URL.
- Status, test, and save actions.

### Rerank

- Enable switch.
- Base URL, API key, rerank model, request timeout.
- Fallback explanation, status, test, and save actions.

### Web

- Tavily-specific enable switch.
- API key and maximum results from 1 to 10.
- Explanation of activation conditions, source attribution, free quota, and system proxy.
- Status, test, and save actions.

### Speech (TTS)

- Enable switch and documentation action.
- Provider dropdown: Xiaomi MiMo, Volcano/Doubao, Aliyun Qwen/Bailian.
- Each provider retains a separate offline draft configuration.
- Provider-specific endpoint control.
- Model and voice are dropdown/combobox controls, not plain inputs.
- Fields: API key, endpoint, model/resource ID, voice/speaker, tone/style instructions, speed.
- Status, test playback demonstration, and save actions.

### Image

- Enable switch.
- Protocol dropdown: OpenAI compatible, custom full endpoint, OpenAI official, Google Gemini.
- API key, endpoint, model, optional size, timeout.
- Status, test-generation demonstration, save, and an offline preview placeholder.

### Local Agent

- Enable switch.
- Default-agent dropdown: Codex CLI, Claude Code, OpenCode.
- Executable path, optional model, timeout.
- Automatic-detection demonstration and save.
- Right column: current state, safe-run explanation, and static detection results.
- No executable is launched and no local login state is read.

## Interaction and Accessibility

- Use semantic native `select`, `input`, `button`, `fieldset`, `label`, and progress elements where possible.
- Every input has a persistent visible label and helper text.
- Select/input/button height is at least 44 px.
- Keyboard focus uses a visible accent ring.
- Selected state is conveyed by text and control state, not color alone.
- Dropdown/provider switching updates dependent fields immediately without layout shift.
- Panel transitions use opacity/transform only, 150–300 ms, and respect `prefers-reduced-motion`.
- Narrow layouts stack cards and allow the settings subtab row to scroll without causing document-level horizontal overflow.

## Visual System

- Preserve the existing workbench's light glass sidebar, white rounded main panel, purple accent, typography, 8 px spacing rhythm, and panel radii.
- Do not copy CipherTalk logos, avatar, product name, or unrelated application navigation.
- Do not add external fonts, images, scripts, or network dependencies.

## Prototype Safety

- All model download, delete, test, save, refresh, playback, generation, and agent-detection actions are visual simulations only.
- Do not call real or paid APIs.
- Do not read or persist real credentials.
- Do not download media/models or launch local CLIs.
- Do not delete cache/log data.
- Do not start localhost; the file must work from `file:///`.

## Acceptance Contracts

- Structural test requires CPU SenseVoice and GPU Whisper naming.
- Structural test requires three STT modes and the complete CPU/online field inventory.
- Structural test requires seven AI modes.
- Large-model provider and protocol controls must be semantic selects; the main panel must not contain a provider-card grid.
- TTS must contain provider, model, and voice dropdown controls plus all three providers.
- Every AI mode must contain its documented enable switch/fields/actions.
- Query parameters continue to isolate settings section and submode for screenshots.
- Inline JavaScript parses with Node.
- Offline dependency scan finds no iframe, localhost, external script/link/image/video URL.
- Screenshots are reviewed for CPU, LLM, TTS, and one narrow responsive layout.

## Out of Scope

- Production React/Tauri integration.
- Implementing SenseVoice, provider APIs, model downloads, credential storage, CUDA runtime changes, or CLI execution.
- MSI/NSIS or release executable builds.
- CipherTalk's database decryption, security, memory, plugins, account, or Electron-only features.
