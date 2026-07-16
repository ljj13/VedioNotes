# CipherTalk Settings Parity Prototype Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the reduced speech/AI settings prototype with a complete SenseVoice CPU flow and select-driven, no-deletion AI configuration forms.

**Architecture:** Keep the prototype as one self-contained HTML document with inline CSS and JavaScript. Strengthen the existing Node structural contract first, then replace only the transcription and AI settings panels while preserving the shell, data-management pages, query navigation, and offline behavior.

**Tech Stack:** HTML5, CSS custom properties, native form controls, inline JavaScript, Node.js `assert` structural tests, Microsoft Edge headless screenshots.

## Global Constraints

- Modify only `.superpowers/brainstorm/ui-proposal-1783996252/content/workbench-ciphertalk-inspired.html` and its structural test; do not touch production React/Tauri code.
- CPU speech-to-text is SenseVoice; GPU is the existing accelerated whisper.cpp concept; online is the third mode.
- All provider/model/service controls required by the design are semantic selects or editable select-like controls.
- No real API call, credential read/write, model/media download, cache/log deletion, CLI launch, local server, external asset, or installer build.
- Preserve the existing light visual tokens, rounded content panel, responsive shell, sidebar behavior, data-management settings, and query-string review contract.
- `D:\Project\notes` is not a Git repository; replace commit steps with an explicit progress-log gate and do not initialize Git.

---

### Task 1: SenseVoice and Three-Mode Transcription Contract

**Files:**
- Modify: `D:\Project\notes\.superpowers\brainstorm\ui-proposal-1783996252\content\workbench-ciphertalk-inspired.structure.test.mjs`
- Modify: `D:\Project\notes\.superpowers\brainstorm\ui-proposal-1783996252\content\workbench-ciphertalk-inspired.html`

**Interfaces:**
- Consumes: existing `setTranscriptionMode(mode, button)` and `data-transcription-mode`/`data-transcription-panel` attributes.
- Produces: `setSenseVoiceModel(model, button)`, `setOnlineSttProvider(provider)`, semantic CPU language checkboxes, and complete online fields.

- [ ] **Step 1: Add failing transcription assertions**

Add exact contracts requiring `SenseVoice 本地模型`, `int8 量化版`, `float32 完整版`, five language checkboxes, GPU Whisper/CUDA controls, four online providers, and labeled provider/language selects. Add negative assertions that CPU does not call itself Whisper.

```js
assert.match(html, /data-transcription-panel="cpu"[\s\S]*SenseVoice 本地模型/)
assert.match(html, /name="sensevoice-model"[\s\S]*value="int8"[\s\S]*value="float32"/)
for (const lang of ['中文', '英语', '日语', '韩语', '粤语']) assert.ok(html.includes(lang))
assert.match(html, /data-transcription-panel="gpu"[\s\S]*Whisper GPU 模型[\s\S]*GPU 检测[\s\S]*CUDA 组件/)
assert.match(html, /<select[^>]+id="onlineSttProvider"/)
for (const provider of ['OpenAI 兼容', '阿里云 / 千问云', '火山豆包', '自定义接口']) assert.ok(html.includes(provider))
for (const field of ['接口 URL', 'API Key', '模型名称', '识别语言', '超时时间', '批量并发数']) assert.ok(html.includes(field))
```

- [ ] **Step 2: Run the contract and verify RED**

Run:

```powershell
node 'D:\Project\notes\.superpowers\brainstorm\ui-proposal-1783996252\content\workbench-ciphertalk-inspired.structure.test.mjs'
```

Expected: FAIL on missing `SenseVoice 本地模型` or missing semantic online provider select.

- [ ] **Step 3: Replace the transcription markup**

Implement three tab panels. CPU uses a SenseVoice model card and language checklist; GPU contains Whisper model selection, GPU detection, CUDA component status, and acceleration switch; online uses provider/language selects and labeled address/key/model/timeout/concurrency fields. Keep every action prototype-only via `showPrototypeNotice`.

- [ ] **Step 4: Add minimal dependent-state JavaScript**

```js
const onlineSttPresets = {
  openai: { url: 'https://api.openai.com/v1', model: 'gpt-4o-mini-transcribe' },
  qwen: { url: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen3-asr-flash' },
  doubao: { url: 'https://openspeech.bytedance.com/api/v3/auc/bigmodel/recognize/flash', model: 'volc.bigasr.auc_turbo' },
  custom: { url: '', model: '' }
}
function setOnlineSttProvider(value) {
  const preset = onlineSttPresets[value]
  document.querySelector('#onlineSttUrl').value = preset.url
  document.querySelector('#onlineSttModel').value = preset.model
}
```

Prevent the last checked CPU language from being cleared and show an `aria-live` prototype message.

- [ ] **Step 5: Run GREEN and log the gate**

Run the structural test again. Expected: PASS. Append the command/result to `D:\Project\notes\progress.md`.

---

### Task 2: Select-Driven Large-Model AI Form

**Files:**
- Modify: `D:\Project\notes\.superpowers\brainstorm\ui-proposal-1783996252\content\workbench-ciphertalk-inspired.structure.test.mjs`
- Modify: `D:\Project\notes\.superpowers\brainstorm\ui-proposal-1783996252\content\workbench-ciphertalk-inspired.html`

**Interfaces:**
- Consumes: `setAiMode`, preset modal/drawer functions, and the seven existing AI panel identifiers.
- Produces: `aiProviderSelect`, `aiProtocolSelect`, `aiModelSelect`, `setAiProvider(value)`, `setAiModel(value)`, provider-specific offline catalog, and updated summary elements.

- [ ] **Step 1: Add failing LLM form assertions**

```js
assert.match(html, /<select[^>]+id="aiProviderSelect"/)
assert.match(html, /<select[^>]+id="aiProtocolSelect"/)
assert.match(html, /<select[^>]+id="aiModelSelect"/)
assert.doesNotMatch(html, /data-ai-panel="llm"[\s\S]*?class="provider-preset-grid"/)
for (const action of ['添加预设', '预设管理', '刷新模型列表', '测试连接', '保存当前服务商']) assert.ok(html.includes(action))
for (const metric of ['上下文', '最大输出', '推理', '工具调用', '结构化输出', '图像输入']) assert.ok(html.includes(metric))
```

- [ ] **Step 2: Run and verify RED**

Expected: FAIL because the main panel still contains provider cards and lacks the three selects.

- [ ] **Step 3: Implement the full two-column form**

Replace the main provider-card grid with a labeled provider select containing DeepSeek, OpenAI, Claude, Gemini, Qwen, Kimi, SiliconFlow, Ollama, and Custom. Add conditional service address, protocol select, masked API-key field with show/hide, model select plus refresh button, capability strip, inline status, test/save actions, and provider summary card.

- [ ] **Step 4: Implement offline provider/model switching**

Define a static catalog object with provider label, protocol, address, models, description, and capability data. `setAiProvider(value)` repopulates the model select and updates conditional fields/summary. `setAiModel(value)` updates the capability strip. No fetch or storage call is allowed.

- [ ] **Step 5: Run GREEN and log the gate**

Run the structural contract. Expected: PASS with the preset drawer/modal still present and the main provider-card grid absent.

---

### Task 3: Restore All Six Non-LLM AI Forms

**Files:**
- Modify: `D:\Project\notes\.superpowers\brainstorm\ui-proposal-1783996252\content\workbench-ciphertalk-inspired.structure.test.mjs`
- Modify: `D:\Project\notes\.superpowers\brainstorm\ui-proposal-1783996252\content\workbench-ciphertalk-inspired.html`

**Interfaces:**
- Consumes: existing AI panel switching.
- Produces: `setTtsProvider(value)`, `setImageProtocol(value)`, `setAgentProvider(value)`, complete semantic field inventory for vector/rerank/web/TTS/image/local agent.

- [ ] **Step 1: Add failing per-panel inventory assertions**

Require these controls:

```js
for (const id of ['embeddingEnabled','embeddingImageEnabled','embeddingImageMode','rerankEnabled','webSearchEnabled','ttsEnabled','ttsProviderSelect','ttsModelSelect','ttsVoiceSelect','imageEnabled','imageProtocolSelect','localAgentEnabled','localAgentSelect']) {
  assert.match(html, new RegExp(`id="${id}"`), `${id} exists`)
}
for (const text of ['向量维度','图片输入格式','请求超时（毫秒）','每次返回结果数','小米MiMo','火山引擎 / 豆包','通义千问 / 百炼','语气/风格指令','图片尺寸','自动探测','当前状态','探测结果']) assert.ok(html.includes(text))
```

- [ ] **Step 2: Run and verify RED**

Expected: FAIL on the first missing enable switch or dropdown.

- [ ] **Step 3: Expand vector, rerank, and web panels**

Implement every field/action from the approved design. Use labeled inputs, switches, native select for image input mode, inline status, test, and save controls.

- [ ] **Step 4: Expand TTS with provider-specific dropdowns**

Use provider, model, and voice selects. Preserve per-provider draft values in an in-memory `ttsDrafts` object. Provider switching changes endpoint/model/voice labels and helper text. Include documentation, enable, API key, instructions, speed, test playback simulation, and save.

- [ ] **Step 5: Expand image and local-agent panels**

Add protocol select and all image fields/actions/preview placeholder. Add local-agent enable/default-agent select, executable/model/timeout, auto-detect simulation, save, summary, safe-run note, and static detection results.

- [ ] **Step 6: Run GREEN and log the gate**

Run the structural contract. Expected: PASS for all seven complete AI modes.

---

### Task 4: Interaction, Responsive Styling, and Final Verification

**Files:**
- Modify: `D:\Project\notes\.superpowers\brainstorm\ui-proposal-1783996252\content\workbench-ciphertalk-inspired.structure.test.mjs`
- Modify: `D:\Project\notes\.superpowers\brainstorm\ui-proposal-1783996252\content\workbench-ciphertalk-inspired.html`
- Create: four PNG screenshots beside the HTML prototype.

**Interfaces:**
- Consumes: all controls produced by Tasks 1–3 and query parameters `page`, `settings`, `sub`.
- Produces: isolated review URLs for transcription modes and AI submodes, keyboard-visible selects, responsive no-overflow layout, and final evidence.

- [ ] **Step 1: Add failing interaction/accessibility assertions**

Require visible labels associated by `for`, select minimum height, focus-visible ring, reduced-motion handling, query-driven `sub=cpu`, `sub=llm`, and `sub=tts`, and no provider-card CSS in the main LLM surface.

- [ ] **Step 2: Run and verify RED**

Expected: FAIL on missing select/focus or transcription sub-query handling.

- [ ] **Step 3: Implement styles and query routing**

Add reusable `.form-field`, `.select-control`, `.form-help`, `.settings-form-card`, `.settings-side-card`, and `.status-message` styles. Keep controls at least 44 px high, add `:focus-visible`, stack two-column forms below 980 px, and preserve reduced motion. Route `settings=transcription&sub=cpu|gpu|online` and `settings=ai&sub=...`.

- [ ] **Step 4: Run automated verification**

Run:

```powershell
node 'D:\Project\notes\.superpowers\brainstorm\ui-proposal-1783996252\content\workbench-ciphertalk-inspired.structure.test.mjs'
```

Extract the inline script to `%TEMP%` and run `node --check`. Scan for iframe, localhost, 127.0.0.1, `file://` literals, external script/link/image/video sources. Expected: all pass.

- [ ] **Step 5: Render four screenshots**

Use installed Edge headless with local `file:///` URLs at 1440×920:

- `settings=transcription&sub=cpu`
- `settings=ai&sub=llm`
- `settings=ai&sub=tts`
- narrow 760×920 `settings=ai&sub=llm`

Save PNGs beside the HTML and verify non-zero size.

- [ ] **Step 6: Visually inspect and repair only proven defects**

Check: no overlap, no clipped dropdown labels, no horizontal document overflow, readable helper text, selected values visible, and all controls reachable. If a defect is found, add a reproducing contract where feasible, apply the minimum CSS/markup repair, and rerun all checks.

- [ ] **Step 7: Open the final local HTML and record completion**

Open the `file:///` AI large-model URL in Edge. Update `task_plan.md`, `findings.md`, and `progress.md` with exact verification output. Do not build production code or installers.
