# Online Transcription Form Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the online transcription profile-card list with a CipherTalk-derived, functional provider configuration form while preserving VedioNotes profile IDs, credential storage, and transcription commands.

**Architecture:** `TranscriptionTab` delegates only its online panel to a focused `OnlineTranscriptionSettings` component. The component edits real `TranscriptionProfile` records through `settingsPlatform.transcription`, keeps unsaved provider drafts isolated by profile ID, and never reads saved credential plaintext. Backward-compatible online runtime options are stored on each transcription profile and consumed by the Rust online adapters where applicable.

**Tech Stack:** React 19, TypeScript, HeroUI, inline Gravity icons, scoped CSS, Tauri 2 invoke bridge, Rust/Serde/Reqwest, Vitest.

## Global Constraints

- Do not modify CPU/GPU UI or local model behavior.
- Exclude `local_whisper_cpp` and all local runtime entries in the online data layer, not with CSS.
- Keep bearer and Tencent credentials in Windows Credential Manager; blank fields preserve saved credentials.
- Do not introduce another UI library or alter Tauri window behavior.
- Preserve existing provider IDs and profile storage compatibility.

---

### Task 1: Lock the online-panel behavior with failing tests

**Files:**
- Modify: `src/features/settings/tabs/TranscriptionTab.test.tsx`

- [ ] Add integration tests proving that online mode renders the provider form, excludes local Whisper/SenseVoice, restores per-provider values, masks credential drafts, clamps timeout/concurrency controls, saves the profile, and invokes the existing profile test command.
- [ ] Run `npm test -- src/features/settings/tabs/TranscriptionTab.test.tsx` and confirm the new assertions fail against the existing card-list implementation.

### Task 2: Add backward-compatible online runtime options

**Files:**
- Modify: `src/lib/types.ts`
- Modify: `src-tauri/src/profiles.rs`
- Modify: `src-tauri/src/providers/transcription.rs`
- Modify: Rust fixtures constructing `TranscriptionProfile`
- Test: `src-tauri/tests/profile_store_test.rs`
- Test: `src-tauri/tests/provider_test.rs`

- [ ] Add failing Rust tests for old JSON defaulting, option validation, and request timeout/language propagation.
- [ ] Add `OnlineTranscriptionOptions` with defaults: `language=auto`, `timeoutMs=60000`, `maxConcurrency=2`; validate language, timeout 5000–300000, and concurrency 1–10.
- [ ] Apply timeout to all online Reqwest clients and language to OpenAI-compatible/MiMo request payloads; keep Tencent engine semantics unchanged.
- [ ] Run the targeted Rust tests and confirm they pass.

### Task 3: Implement the provider configuration form

**Files:**
- Create: `src/features/settings/components/OnlineTranscriptionSettings.tsx`
- Modify: `src/features/settings/tabs/TranscriptionTab.tsx`

- [ ] Build a provider selector from `profiles.transcriptionProfiles.filter(profile => profile.provider !== 'local_whisper_cpp')`.
- [ ] Keep URL/model/options and credential drafts isolated by profile ID and restore them when switching providers.
- [ ] Render bearer API Key or Tencent AppID/SecretID/SecretKey fields according to the real credential type.
- [ ] Save through `saveTranscriptionProfile`, activate through `setActiveProfile`, and test through `testProfile` without logging secrets.
- [ ] Replace only the online `Tabs.Panel` card list with the new component.
- [ ] Re-run the targeted frontend tests until green.

### Task 4: Match the CipherTalk visual structure and responsiveness

**Files:**
- Modify: `src/styles/cipher-settings.css`
- Modify: `tests/static/visual-gate-contracts.test.mjs`
- Modify: `production-workbench.visual.test.mjs` only if the existing renderer needs an online-panel capture mode.

- [ ] Add scoped `cipher-online-stt-*` styles for the 70/30 desktop grid, form fields, steppers, reminder card, single focus treatment, and overflow protection.
- [ ] Collapse the grid and field rows at the existing settings container breakpoints without horizontal scrolling.
- [ ] Add visual-contract assertions for single indicators, scoped focus styles, and responsive collapse.

### Task 5: Verify the implementation and build the application

**Files:**
- No production files beyond tasks 1–4.

- [ ] Run the targeted frontend and Rust tests.
- [ ] Run `npm test`, all static gates, `npm run build`, `cargo check --offline --jobs 1`, and `cargo test --offline --jobs 1`.
- [ ] Render the online panel at desktop and narrow widths and inspect screenshots for overflow, duplicate arrows, or double focus rings.
- [ ] Run `npm run tauri -- build --no-bundle` with the bundled Cargo path and report the generated EXE metadata.
