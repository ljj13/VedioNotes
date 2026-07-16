# Models.dev Catalog and Instant Appearance Design

**Date:** 2026-07-16  
**Status:** Approved approach; awaiting written-spec review  
**Target:** `D:\Project\notes`

## 1. Goal

Repair the production AI Access workflow so it behaves as a real provider selector rather than a mislabeled active-profile selector. Import the standard-protocol portion of CipherTalk's current bundled `models-dev.json` snapshot and make every enabled provider choice map to an executable Rust transport. Change Appearance settings to apply and persist immediately without an explicit save button.

This delivery does not call real AI services, read real credentials, download media/models, build MSI/NSIS packages, or run the Release executable.

## 2. Confirmed catalog boundary

The source snapshot is the locally cloned CipherTalk file:

`D:\Project\CipherTalk\electron\assets\models-dev.json`

The source contains 136 providers and 4,968 model records. The application imports only the 116 providers handled by CipherTalk's four standard protocol families:

- `openai-compatible`: 106 providers
- `openai-responses`: 3 providers
- `anthropic`: 6 providers
- `google`: 1 provider

The 20 provider-specific SDK entries are excluded. They require transports or authentication such as Azure deployments, Amazon Bedrock signing, Google Vertex identity, GitLab, SAP AI Core, or gateway-specific contracts. They must not appear as enabled provider choices.

All 3,926 raw model records belonging to the 116 included providers remain in the derived catalog. The UI may mark a model as ineligible for summary execution when its modalities or identifier indicate a non-text function such as embedding, rerank, speech, transcription, image generation, or moderation. Such records remain searchable and inspectable but are disabled in the summary-model selector with an explanation. This preserves the requested complete imported model catalog without offering a control that the summary backend cannot execute.

A separate `Custom` entry remains available. It is not counted as one of the 116 snapshot providers.

## 3. Root causes being corrected

### 3.1 Provider switching

`src/components/settings/AiAccessSettings.tsx` currently labels persisted `SummaryProfile.id` values as service providers. Selecting an item immediately calls `set_active_profile`. Rust only activates profiles with `enabled: true`, so unconfigured built-in profiles fail to switch. The control also has only three hard-coded model catalogs.

Provider selection and active-profile selection are different operations and must be separated.

### 3.2 Catalog migration

`AppProfiles::ensure_builtin_profiles()` currently restores only the local Whisper transcription profile. New summary presets are not added to older installations. This delivery avoids writing 116 inactive records into `profiles.json`; the catalog is static application data and provider profiles are created on demand.

### 3.3 Appearance behavior

`AppearanceSettings.tsx` stores edits locally and invokes `saveAppearancePreferences` only from the explicit save button. `App.tsx` applies theme, density, and reduced-motion settings from parent `preferences`, so no live change occurs until save finishes.

## 4. Architecture

### 4.1 Derived catalog asset

Create a deterministic, project-owned derived snapshot containing only the 116 accepted providers and their 3,926 model records. It stores:

- source snapshot identity and SHA-256
- provider ID, display name, description and documentation URL
- normalized protocol
- normalized default base URL
- model IDs and available model metadata
- derived text-summary eligibility and the reason for an ineligible record

The conversion is deterministic and offline. The committed derived file is sufficient for normal builds; production builds do not depend on the separate CipherTalk clone.

Default base URL normalization follows CipherTalk's behavior, with explicit fallbacks for the four standard entries whose snapshot API field is empty:

- OpenAI: `https://api.openai.com/v1`
- Anthropic: `https://api.anthropic.com`
- Google: `https://generativelanguage.googleapis.com/v1beta`
- xAI: `https://api.x.ai/v1`

No URL is fetched while loading the catalog.

### 4.2 Rust owns the operational catalog

Rust parses the embedded derived catalog and exposes a read-only Tauri command. React never supplies an arbitrary protocol for a known catalog provider. When saving a catalog-backed profile, Rust resolves provider ID to protocol and default address from its own catalog before validating and persisting the profile.

This prevents a frontend mismatch such as displaying Anthropic while persisting an OpenAI-compatible transport.

### 4.3 Summary profile compatibility

The persisted profile remains the execution configuration and credential namespace. Add optional catalog identity plus the required protocol variants while preserving existing version-1 JSON compatibility:

- existing `deep_seek`, `mimo`, and `open_ai_compatible` values continue to deserialize
- new variants represent `openai_responses`, `anthropic`, and `google`
- catalog-backed profiles store `catalogProviderId`
- existing legacy DeepSeek and MiMo profiles are mapped to `deepseek` and `xiaomi` when loaded or displayed
- custom profiles may select any of the four standard protocols and require an explicit base URL when the protocol cannot use a fixed catalog address

A provider profile is created only when the user saves that provider. Its stable credential namespace is based on the profile ID; credentials never enter the catalog or `profiles.json`.

## 5. AI Access interaction

### 5.1 Provider selector

Replace the current active-profile dropdown with a searchable provider combobox backed by the 116-entry Rust catalog plus Custom.

Selecting a provider:

1. immediately changes the visible provider draft;
2. does not call `set_active_profile`;
3. loads an existing saved profile for that catalog provider when present;
4. otherwise loads catalog defaults and the first eligible text model;
5. refreshes protocol, address, model list, capability summary, and credential-readiness display.

Provider search matches display name, provider ID, description, and protocol.

### 5.2 Model selector

Use a searchable, editable combobox. It shows all imported records for the selected provider, including model name, ID, relevant capabilities, context limit, and status when present.

- eligible text-summary models are selectable;
- imported non-summary models remain visible but disabled with a reason;
- custom model IDs are permitted for catalog providers because provider inventories may change after the fixed snapshot;
- changing a model updates only the provider draft until save.

### 5.3 Save and activation

The primary action becomes `保存并启用`.

It performs one bounded workflow:

1. validate provider, protocol, URL and model eligibility;
2. save or update the provider-specific summary profile;
3. save a supplied credential separately, or preserve the existing credential when the secret input is blank;
4. enable the profile;
5. set it as the active summary profile;
6. return updated profiles to React.

Failure at any persistence boundary keeps the previous active profile. Existing credential rollback rules remain in force.

The existing ProfileManager remains available for multiple custom configurations. Catalog provider selection is not replaced by ProfileManager and ProfileManager is not used as the 116-entry provider catalog.

## 6. Four Rust protocol adapters

All adapters consume the same normalized structured distillation prompt and return the same parsed `Distillation` domain object.

### 6.1 OpenAI Compatible

Retain the current `/v1/chat/completions` adapter and Bearer authentication. Continue accepting provider root URLs, `/v1` URLs, and full endpoint URLs without path duplication.

### 6.2 OpenAI Responses

Use the `/v1/responses` contract. Convert the normalized system/user prompt to Responses input and parse supported `output_text` or `output[].content[].text` response shapes. Authentication uses Bearer.

### 6.3 Anthropic

Use `/v1/messages`, `x-api-key`, and a fixed reviewed `anthropic-version` header. Map the system prompt and user content to Anthropic's body and parse text content blocks.

### 6.4 Google Gemini

Use the provider base plus `models/{model}:generateContent`, authenticate with `x-goog-api-key`, map system/user content to Gemini request fields, and parse candidate text parts.

### 6.5 Shared safety behavior

Every adapter:

- checks cancellation before and after network I/O;
- bounds response size before parsing;
- never logs API keys, prompts, transcripts, raw response bodies, or credential-bearing URLs;
- maps authentication, rate limit, missing endpoint, invalid output, timeout, and network failures to existing redacted error categories;
- uses fake HTTP servers in tests only.

## 7. Appearance auto-apply

Remove the explicit `保存外观设置` button.

For theme, compact density, and reduced motion:

1. compute the next complete appearance object;
2. optimistically call the parent preference update so `App.tsx` applies it immediately;
3. queue backend persistence operations in interaction order;
4. on success, use the backend-returned complete preferences as the saved baseline;
5. on failure, roll back only when the failed request is still the latest applicable change;
6. show `正在自动保存`, `已自动保存`, or a redacted failure notice.

Serialized writes prevent an older request from overwriting a later click.

## 8. Tests

### 8.1 RED frontend contracts

Before production edits, tests must demonstrate that:

- the current service control cannot expose 116 catalog providers;
- selecting a provider is incorrectly coupled to `set_active_profile`;
- model options do not come from the selected catalog provider;
- appearance changes do not invoke persistence until the old save button is clicked.

### 8.2 Catalog and migration tests

Verify:

- exactly 116 providers are imported;
- exactly 3,926 raw model records are retained;
- only the four accepted protocols exist;
- the 20 excluded provider IDs are absent;
- URL fallbacks and model eligibility are deterministic;
- existing DeepSeek, MiMo, and custom profiles still load;
- catalog-backed profile identity cannot override its Rust-resolved protocol.

### 8.3 Protocol wire tests

For each protocol, fake-server tests assert exact path, authentication header, request mapping, response parsing, cancellation, output-size bounds, and redacted failures. No real provider is contacted.

### 8.4 Frontend interaction tests

Verify provider search, provider draft switching, saved-draft restoration, model search, disabled non-summary models, custom model entry, save-and-activate sequencing, credential preservation, and failure recovery.

Appearance tests verify immediate parent updates, automatic persistence, ordered rapid changes, success state, and rollback on failure.

### 8.5 Final gates

Run focused tests, the complete frontend suite, TypeScript/Vite production build, single-job offline Rust suite, static capability audit, privacy scan, and targeted desktop/narrow visual cases. Do not build MSI/NSIS and do not run the Release executable.

## 9. Documentation and attribution

Update README with catalog provenance, fixed-snapshot behavior, supported protocols, custom-provider behavior, and the difference between imported catalog models and live model discovery. Update third-party notices for the derived models.dev/CipherTalk catalog data as required by the source license.

## 10. Acceptance criteria

- AI Access lists exactly 116 snapshot providers plus the separate Custom entry.
- The catalog retains all 3,926 model records from those providers.
- Selecting a provider immediately changes the draft without trying to activate an unconfigured profile.
- Every selectable summary model maps to one of the four executable Rust adapters.
- Non-summary records remain inspectable but cannot be activated as a summary model.
- Saving a provider persists its independent configuration/credential namespace and activates it atomically.
- Existing profiles and active selections remain compatible.
- Theme, density, and reduced-motion controls apply immediately and persist automatically without a save button.
- Focused and full verification passes without real API use, credential reads, downloads, MSI/NSIS creation, or Release execution.