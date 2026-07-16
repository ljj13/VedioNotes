# Models.dev Catalog and Instant Appearance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Import CipherTalk's 116 standard-protocol providers and 3,926 model records into a Rust-owned catalog, make every selectable summary provider executable through one of four Rust adapters, and make appearance controls apply and persist immediately.

**Architecture:** A deterministic offline generator creates a committed catalog snapshot. Rust owns catalog resolution, profile protocol identity, transport selection, and safe persistence; React receives typed catalog data and edits provider-specific drafts without coupling provider browsing to active-profile selection. Appearance uses optimistic parent-state updates and a serialized persistence queue.

**Tech Stack:** React 19, TypeScript 5.8, Vitest, Tauri 2, Rust 2021, serde/serde_json, reqwest, wiremock, existing Windows Credential Manager abstraction.

## Global Constraints

- Work in `D:\Project\notes`; this directory is not a Git repository and must not be initialized as one.
- Source catalog is the local file `D:\Project\CipherTalk\electron\assets\models-dev.json`; no network fetch is allowed.
- Import exactly 116 providers using `openai-compatible`, `openai-responses`, `anthropic`, or `google`, retaining exactly 3,926 raw model records.
- Exclude the 20 provider-specific SDK entries from enabled provider choices.
- Keep a separate Custom entry outside the count of 116.
- Never read real credentials or Credential Manager contents during tests or verification.
- Never call real/paid APIs, download media/models, upload, publish, install dependencies, build MSI/NSIS, or run the Release executable.
- Run Cargo offline with `CARGO_BUILD_JOBS=1` and `--jobs 1`.
- Use bounded PowerShell UTF-8 updates only when the packaged `apply_patch` helper remains blocked by Windows ACLs.
- Every task follows RED -> minimal GREEN -> focused regression -> progress checkpoint.

---

### Task 1: Deterministic standard-protocol catalog asset

**Files:**
- Create: `scripts/generate-models-dev-catalog.mjs`
- Create: `src-tauri/assets/models-dev-standard.json`
- Create: `tests/static/models-dev-catalog.test.mjs`
- Modify: `THIRD_PARTY_NOTICES.md`

**Interfaces:**
- Consumes: CipherTalk `models-dev.json` supplied as the generator's first command-line argument.
- Produces: a JSON document with `schemaVersion`, `sourceSha256`, `providerCount`, `modelCount`, and `providers[]`; each provider has `id`, `displayName`, `description`, `protocol`, `baseUrl`, `documentationUrl`, and `models[]`.

- [ ] **Step 1: Write the failing static contract**

Create a test that reads `src-tauri/assets/models-dev-standard.json` and asserts:

```js
assert.equal(catalog.providerCount, 116)
assert.equal(catalog.modelCount, 3926)
assert.deepEqual(new Set(catalog.providers.map(item => item.protocol)), new Set([
  'openai-compatible', 'openai-responses', 'anthropic', 'google'
]))
assert.equal(catalog.providers.some(item => item.id === 'amazon-bedrock'), false)
assert.equal(catalog.providers.some(item => item.id === 'openai'), true)
assert.equal(catalog.providers.some(item => item.id === 'anthropic'), true)
assert.equal(catalog.providers.some(item => item.id === 'google'), true)
```

Run:

```powershell
node tests/static/models-dev-catalog.test.mjs
```

Expected: FAIL because the derived catalog does not exist.

- [ ] **Step 2: Implement the offline generator**

The generator must use this exact protocol mapping:

```js
const protocolByNpm = new Map([
  ['@ai-sdk/openai-compatible', 'openai-compatible'],
  ['@ai-sdk/xai', 'openai-compatible'],
  ['@openrouter/ai-sdk-provider', 'openai-compatible'],
  ['@ai-sdk/openai', 'openai-responses'],
  ['@ai-sdk/anthropic', 'anthropic'],
  ['@ai-sdk/google', 'google'],
])
```

It must normalize empty base URLs with:

```js
const baseUrlFallbacks = {
  openai: 'https://api.openai.com/v1',
  anthropic: 'https://api.anthropic.com',
  google: 'https://generativelanguage.googleapis.com/v1beta',
  xai: 'https://api.x.ai/v1',
}
```

Each model record must preserve its source metadata and add:

```ts
summaryEligible: boolean
summaryIneligibleReason: string | null
```

Eligibility is false when modalities exclude text or the lowercase ID contains `embedding`, `rerank`, `whisper`, `tts`, `transcribe`, `speech`, `moderation`, `dall-e`, or `image`.

Generate with:

```powershell
node scripts/generate-models-dev-catalog.mjs D:\Project\CipherTalk\electron\assets\models-dev.json src-tauri\assets\models-dev-standard.json
```

The generator must throw unless the output is exactly 116 providers and 3,926 model records.

- [ ] **Step 3: Run the static contract**

Run:

```powershell
node tests/static/models-dev-catalog.test.mjs
```

Expected: PASS with `116 providers / 3926 models`.

- [ ] **Step 4: Record provenance**

Add the source path, source SHA-256, derived filtering rule, and license attribution to `THIRD_PARTY_NOTICES.md`. Do not copy CipherTalk branding or executable code.

- [ ] **Step 5: Checkpoint**

Append the generator command, counts, hash, and static-test result to `progress.md`. Mark Task 1 complete only after the test passes.

---

### Task 2: Rust catalog domain and profile compatibility

**Files:**
- Create: `src-tauri/src/provider_catalog.rs`
- Create: `src-tauri/tests/provider_catalog_test.rs`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src-tauri/src/profiles.rs`
- Modify: `src-tauri/src/profile_store.rs`
- Modify: `src-tauri/tests/profile_store_test.rs`
- Modify: `src-tauri/tests/profile_commands_test.rs`

**Interfaces:**
- Produces:

```rust
pub enum SummaryProtocolKind {
    OpenAiCompatible,
    OpenAiResponses,
    Anthropic,
    Google,
}

pub struct SummaryProviderCatalogEntry {
    pub id: String,
    pub display_name: String,
    pub description: String,
    pub protocol: SummaryProtocolKind,
    pub base_url: String,
    pub documentation_url: Option<String>,
    pub models: Vec<SummaryModelCatalogEntry>,
}

pub fn catalog() -> Result<&'static SummaryProviderCatalog, AppError>;
pub fn provider(id: &str) -> Result<&'static SummaryProviderCatalogEntry, AppError>;
```

- Extends `SummaryProfile` with optional `catalog_provider_id` while preserving legacy JSON.

- [ ] **Step 1: Write failing catalog parsing tests**

Tests must assert the exact counts, four protocols, fallback URLs, model eligibility, unknown-provider rejection, and immutable resolution of a known provider's protocol.

Run:

```powershell
$env:CARGO_BUILD_JOBS='1'
G:\Environments\rust\cargo\bin\cargo.exe test --offline --jobs 1 --manifest-path src-tauri\Cargo.toml --test provider_catalog_test
```

Expected: FAIL because `provider_catalog` does not exist.

- [ ] **Step 2: Implement embedded catalog parsing**

Use:

```rust
const CATALOG_JSON: &str = include_str!("../assets/models-dev-standard.json");
static CATALOG: std::sync::OnceLock<Result<SummaryProviderCatalog, String>> = std::sync::OnceLock::new();
```

Deserialize once, validate counts and protocol values, and return redacted `AppError` messages that never include catalog file contents.

- [ ] **Step 3: Write failing legacy-profile compatibility tests**

Tests must deserialize existing profiles containing `deep_seek`, `mimo`, and `open_ai_compatible`, then round-trip new profiles using `open_ai_responses`, `anthropic`, and `google`. Add assertions that missing `catalogProviderId` defaults to `None`.

- [ ] **Step 4: Extend profile types minimally**

Keep the existing `SummaryProviderKind` name for wire compatibility and add variants:

```rust
OpenAiResponses,
Anthropic,
Google,
```

Add:

```rust
#[serde(default)]
pub catalog_provider_id: Option<String>,
```

Map legacy built-ins for display without rewriting credentials:

```text
deep_seek -> deepseek
mimo -> xiaomi
open_ai_compatible without catalogProviderId -> Custom
```

Validation must reject a known catalog provider whose persisted protocol does not equal the Rust catalog protocol.

- [ ] **Step 5: Run focused Rust tests**

Run the catalog, profile-store, and profile-command tests offline/single-job. Expected: all pass.

- [ ] **Step 6: Checkpoint**

Record changed wire fields, compatibility results, and focused test counts in `progress.md`.

---

### Task 3: Four executable summary protocol adapters

**Files:**
- Modify: `src-tauri/src/providers/summary.rs`
- Modify: `src-tauri/src/providers/mod.rs`
- Modify: `src-tauri/src/providers/endpoint.rs`
- Modify: `src-tauri/tests/provider_test.rs`
- Modify: `src-tauri/tests/endpoint_test.rs`

**Interfaces:**
- Consumes: normalized `SummaryProfile`, `SecretPayload::Bearer`, and the existing distillation prompt.
- Produces four `SummaryAdapter` implementations selected by `SummaryProviderKind`.

- [ ] **Step 1: Add failing wire tests for OpenAI Responses**

Wiremock must require:

```text
POST /v1/responses
Authorization: Bearer test-key
```

The request must contain the selected model and normalized system/user content. Test both `output_text` and nested `output[].content[].text` parsing. Verify 401/429/404 and oversized/invalid bodies return redacted errors.

- [ ] **Step 2: Implement `OpenAiResponsesSummaryAdapter`**

Build the protocol body from a shared normalized prompt helper; do not duplicate the style instructions. Parse only bounded response bytes and then pass the extracted text to `parse_distillation`.

- [ ] **Step 3: Add failing Anthropic wire tests**

Require:

```text
POST /v1/messages
x-api-key: test-key
anthropic-version: 2023-06-01
```

Assert `system`, user messages, model, and a bounded `max_tokens`. Parse concatenated text blocks from `content[]`.

- [ ] **Step 4: Implement `AnthropicSummaryAdapter`**

Use the same cancellation and error mapping as the existing adapter. Never include the key or raw body in errors.

- [ ] **Step 5: Add failing Google Gemini wire tests**

Require:

```text
POST /v1beta/models/{url-encoded-model}:generateContent
x-goog-api-key: test-key
```

Assert `systemInstruction`, `contents`, and response parsing from `candidates[0].content.parts[].text`.

- [ ] **Step 6: Implement `GoogleSummaryAdapter`**

Join paths without duplicating `/v1beta`, encode the model path segment, and keep API keys out of URLs.

- [ ] **Step 7: Extend registry and endpoint tests**

Map:

```rust
DeepSeek | Mimo | OpenAiCompatible => OpenAiCompatibleSummaryAdapter
OpenAiResponses => OpenAiResponsesSummaryAdapter
Anthropic => AnthropicSummaryAdapter
Google => GoogleSummaryAdapter
```

Add endpoint tests for root, version-root, and full-endpoint inputs for all four protocols.

- [ ] **Step 8: Run focused Rust tests**

Run `provider_test` and `endpoint_test` offline/single-job. Expected: all pass with no real network calls.

- [ ] **Step 9: Checkpoint**

Record adapter wire contracts and focused test results in `progress.md`.

---

### Task 4: Catalog commands and atomic save-and-activate workflow

**Files:**
- Modify: `src-tauri/src/commands.rs`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src-tauri/tests/profile_commands_test.rs`
- Modify: `src/lib/types.ts`
- Modify: `src/lib/bridge.ts`
- Modify: `tests/static/complete-workbench-capabilities.test.mjs`

**Interfaces:**
- Produces Tauri commands:

```rust
pub fn get_summary_provider_catalog() -> Result<Vec<SummaryProviderCatalogEntry>, AppError>;

pub fn save_and_activate_catalog_summary_profile(
    provider_id: String,
    model: String,
    base_url_override: Option<String>,
    credential: Option<SecretInput>,
    services: State<'_, ManagedServices>,
) -> Result<AppProfiles, AppError>;
```

- [ ] **Step 1: Write failing command tests**

Tests must prove:

- catalog command returns 116 entries;
- known provider protocol is resolved by Rust, not accepted from the caller;
- an eligible model saves and activates a stable `catalog-{providerId}` profile;
- blank credential preserves an existing secret;
- an ineligible imported model is rejected;
- unknown provider is rejected;
- persistence or credential failure leaves the previous active profile unchanged.

- [ ] **Step 2: Implement commands and registration**

`save_and_activate_catalog_summary_profile` must validate first, save credential with compensating rollback, persist the enabled profile, then update the active ID. Reuse existing credential-store and atomic profile-store primitives.

- [ ] **Step 3: Add frontend types and bridges**

Add typed interfaces for catalog providers/models and bridge functions:

```ts
export function getSummaryProviderCatalog(): Promise<SummaryProviderCatalogEntry[]>
export function saveAndActivateCatalogSummaryProfile(input: SaveCatalogSummaryProfileInput): Promise<AppProfiles>
```

- [ ] **Step 4: Extend the static capability audit**

Add exact source-key flows for catalog loading and save-and-activate through React consumer, bridge, invoke name, Rust registration, and command implementation.

- [ ] **Step 5: Run focused command/static tests**

Expected: Rust command tests pass and the static flow count increases without weakening per-component assertions.

- [ ] **Step 6: Checkpoint**

Record command names, rollback behavior, and test results in `progress.md`.

---

### Task 5: Searchable provider/model controls and AI Access workflow

**Files:**
- Create: `src/components/SearchableCombobox.tsx`
- Create: `src/components/SearchableCombobox.test.tsx`
- Create: `src/components/settings/AiAccessSettings.test.tsx`
- Modify: `src/components/settings/AiAccessSettings.tsx`
- Modify: `src/styles.css`
- Modify: `src/App.test.tsx`

**Interfaces:**
- `SearchableCombobox` accepts:

```ts
export type SearchableComboboxOption = {
  value: string
  label: string
  description?: string
  keywords?: string[]
  disabled?: boolean
  disabledReason?: string
}
```

- It provides accessible combobox/listbox semantics, search, keyboard navigation, selected state, disabled explanations, outside-click close, and optional custom value entry.

- [ ] **Step 1: Write failing combobox tests**

Test search filtering, ArrowDown/ArrowUp/Home/End/Enter/Escape, disabled option rejection, accessible naming, custom value entry, and outside-click dismissal.

- [ ] **Step 2: Implement the minimal combobox**

Use React state and existing design tokens. Do not add dependencies. Keep provider and model lists bounded in the DOM by rendering the filtered result set and a result count.

- [ ] **Step 3: Write failing AI Access tests**

Mock the bridge and assert:

- 116 providers plus Custom are searchable;
- selecting Anthropic changes the draft immediately without calling `setActiveProfile`;
- the selected provider's full model list is loaded;
- ineligible records are visible but disabled;
- changing providers restores a saved provider-specific draft;
- `保存并启用` sends provider ID/model/address/optional credential to the atomic command;
- a failed save leaves the previous active summary display intact;
- the existing summary ProfileManager remains available for custom multi-profile management.

- [ ] **Step 4: Replace the mislabeled profile selector**

Load the catalog once, maintain `selectedProviderId` and provider-specific drafts, derive protocol/address/models from the selected catalog entry, and remove the direct `setActiveProfile` call from provider browsing.

Keep API key inputs write-only. Use `hasProfileCredential` for readiness without reading a stored value.

- [ ] **Step 5: Add responsive styling**

Match the approved rounded dropdown surfaces. Ensure long provider/model names wrap or ellipsize without horizontal page overflow at 960×720 and 640×900.

- [ ] **Step 6: Run focused frontend tests**

Run:

```powershell
npm test -- src/components/SearchableCombobox.test.tsx src/components/settings/AiAccessSettings.test.tsx src/App.test.tsx
```

Expected: all pass.

- [ ] **Step 7: Checkpoint**

Record provider count, model count, interaction behavior, and focused test results in `progress.md`.

---

### Task 6: Immediate appearance application and serialized persistence

**Files:**
- Modify: `src/components/settings/AppearanceSettings.tsx`
- Modify: `src/components/settings/DataManagementSettings.test.tsx`
- Modify: `src/components/SettingsWorkspace.test.tsx`

**Interfaces:**
- Each appearance input computes a complete `AppearancePreferences` value and passes it to a serialized auto-save queue.

- [ ] **Step 1: Change tests to the required behavior and verify RED**

Tests must select Light and immediately assert:

```ts
expect(onPreferencesChanged).toHaveBeenCalledWith(
  expect.objectContaining({ appearance: expect.objectContaining({ theme: 'light' }) })
)
expect(bridge.saveAppearancePreferences).toHaveBeenCalledWith(
  expect.objectContaining({ theme: 'light' })
)
expect(screen.queryByRole('button', { name: '保存外观设置' })).toBeNull()
```

Add a rapid two-change test that resolves persistence promises out of order and asserts the final saved/rendered value is the last interaction. Add failure rollback coverage.

- [ ] **Step 2: Implement optimistic auto-apply**

Remove the save button. On every discrete change, immediately call `onPreferencesChanged` with the optimistic complete preferences and enqueue `saveAppearancePreferences(nextAppearance)` after the previous write settles.

Track the last successful value and request sequence. Only the latest relevant failure may roll back the visible preference.

- [ ] **Step 3: Run focused appearance tests**

Run the two settings test files. Expected: all pass and no save button remains.

- [ ] **Step 4: Checkpoint**

Record auto-save ordering and rollback results in `progress.md`.

---

### Task 7: Documentation, visual verification, privacy, and complete regressions

**Files:**
- Modify: `README.md`
- Modify: `THIRD_PARTY_NOTICES.md`
- Modify: `production-workbench.visual.test.mjs`
- Modify: `task12-visual-matrix.mjs` or create a focused follow-up matrix runner if preserving Task 12 evidence is clearer
- Modify: `task_plan.md`
- Modify: `progress.md`
- Create: `outputs/models-dev-catalog-final-report.md`

**Interfaces:**
- Produces final evidence for catalog integrity, four adapters, AI interaction, appearance auto-save, privacy, and build state.

- [ ] **Step 1: Update documentation**

Document fixed snapshot provenance, 116/3,926 counts, four protocols, disabled non-summary model behavior, Custom, credential isolation, live model discovery boundaries, and appearance auto-save.

- [ ] **Step 2: Run all frontend/static tests**

Run:

```powershell
node tests/static/models-dev-catalog.test.mjs
node tests/static/complete-workbench-capabilities.test.mjs
npm test
npm run build
```

Expected: zero failures.

- [ ] **Step 3: Run the complete Rust suite**

Run:

```powershell
$env:CARGO_BUILD_JOBS='1'
G:\Environments\rust\cargo\bin\cargo.exe test --offline --jobs 1 --manifest-path src-tauri\Cargo.toml
```

Expected: exit code 0; the intentionally ignored doc test may remain ignored.

- [ ] **Step 4: Run focused visual cases**

Capture desktop and narrow AI Access with provider dropdown open, model dropdown open, Anthropic selected, Google selected, an ineligible model visible/disabled, light theme immediately applied, and compact/reduced-motion states. Assert no horizontal overflow, unnamed buttons, or duplicate listboxes.

- [ ] **Step 5: Run privacy scan**

Scan source, Rust source/tests, frontend tests, scripts, docs, README, notices, and the derived catalog metadata. Exclude `node_modules`, `target`, `dist`, outputs, screenshots, and visual profiles. Classify test fixtures separately and require zero real credential candidates.

- [ ] **Step 6: Verify debug artifact policy**

Do not build MSI/NSIS. Do not run `video-distiller.exe`. A release EXE rebuild is not required unless the user separately requests it during this debugging phase.

- [ ] **Step 7: Final report and closure**

Write exact commands, counts, warnings, limitations, and file list to `outputs/models-dev-catalog-final-report.md`. Mark the follow-up section in `task_plan.md` complete only after all gates pass.