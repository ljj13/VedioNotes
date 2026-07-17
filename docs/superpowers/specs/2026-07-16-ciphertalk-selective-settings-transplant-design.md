# CipherTalk Selective Settings Transplant Design

**Date:** 2026-07-16

**Status:** Approved

**Target:** `D:\Project\notes`
**Reference:** `D:\Project\CipherTalk` at commit `b5b580c5af7672a729a0c7fc10b8b1511fe6d478`

## Goal

Replace VedioNotes' current hand-recreated Settings frontend with a selective source transplant of CipherTalk's real Renderer settings implementation. Preserve the visible structure, component behavior, styling, icons, spacing, radii, shadows, responsive behavior, and motion of the retained CipherTalk pages while keeping VedioNotes on Tauri 2, React 19, TypeScript/Vite, WebView2/Wry, and its existing Rust backend.

The retained pages are:

1. Appearance
2. Speech-to-Text
3. AI Access
4. Data Management
5. About

CipherTalk's Database Decryption, Security, Memory, and Plugins pages are outside the transplant scope because they are specific to CipherTalk's WeChat-data product.

## Source and License Boundary

- The source of truth is the local CipherTalk checkout at the exact commit recorded above.
- Transplanted files must record their original path and source commit in a short file header or the repository's attribution document.
- Add the full applicable license text and a modification notice before publishing a build containing transplanted code.
- Do not silently update the transplant from a later CipherTalk commit. Any future update requires a separate source diff and visual/functional regression cycle.

## Chosen Approach

Use a selective source transplant with a Tauri compatibility adapter.

Do not copy CipherTalk's complete `SettingsLayout.tsx` unchanged. That file combines the visible settings shell with account management, WeChat database configuration, updater state, cache operations, and many Electron APIs. Instead, extract the retained shell and five pages while preserving the rendered markup and visual behavior that belong to those pages.

Do not continue the current approach of reproducing CipherTalk with hand-written approximations. The existing production settings components remain available as a rollback implementation until the transplant passes all gates.

## Architecture

```text
CipherTalk-derived React settings UI
              ↓
src/platform/settings typed compatibility layer
              ↓
existing src/lib/bridge.ts contracts
              ↓
Tauri invoke/listen and approved plugins
              ↓
existing Rust commands, stores, Keyring, model/runtime services
```

The React settings components must not import `@tauri-apps/api`, call `invoke` or `listen`, or reference `window.electronAPI`. All desktop operations go through the typed settings platform layer.

## Proposed File Boundaries

```text
src/features/settings/
├─ CipherSettingsShell.tsx
├─ CipherSettingsShell.test.tsx
├─ settingsStore.ts
├─ settingsTypes.ts
├─ tabs/
│  ├─ AppearanceTab.tsx
│  ├─ AppearanceTab.test.tsx
│  ├─ TranscriptionTab.tsx
│  ├─ TranscriptionTab.test.tsx
│  ├─ AiAccessTab.tsx
│  ├─ AiAccessTab.test.tsx
│  ├─ DataManagementTab.tsx
│  ├─ DataManagementTab.test.tsx
│  ├─ AboutTab.tsx
│  └─ AboutTab.test.tsx
├─ ui/
│  ├─ ConfirmDialog.tsx
│  ├─ FloatingSaveButton.tsx
│  ├─ ProgressBar.tsx
│  └─ index.ts
└─ styles/
   ├─ settings.css
   └─ settings-tailwind.css

src/platform/settings/
├─ types.ts
├─ preferences.ts
├─ transcription.ts
├─ ai.ts
├─ data.ts
├─ about.ts
├─ events.ts
└─ index.ts
```

Exact splits may be adjusted during the source audit when a CipherTalk component already has a smaller, stable boundary. Files must remain responsibility-focused; unrelated CipherTalk settings code must not be copied merely to satisfy an import.

## Dependency Policy

The settings transplant may add the dependencies actually used by the retained CipherTalk components, including HeroUI, Tailwind CSS, Gravity UI Icons, Zustand, React Router integration primitives, and the required motion package.

Rules:

- Pin compatible versions rather than using unconstrained upgrades.
- Add only packages reachable from the retained settings dependency graph.
- Do not copy CipherTalk's Electron, database, native WeChat, updater, or unrelated AI SDK dependencies.
- Keep the rest of VedioNotes' UI independent from the new settings stack.
- Scope Tailwind and HeroUI styles under the settings root or use an equivalent containment mechanism so global resets and utility styles do not change Home, Create, Library, Q&A, History, or Result pages.
- Confirm compatibility with VedioNotes' existing React 19 and Vite 7 versions before the first production integration commit.

## Settings Shell

The transplanted shell preserves CipherTalk's Settings page hierarchy:

- tab/navigation rail;
- active-tab indicator;
- scroll-shadow behavior;
- lazy-page loading skeleton;
- content width and spacing;
- responsive tab behavior;
- save/dirty feedback where the source page uses it;
- dialogs, toasts, focus behavior, and reduced-motion handling.

The shell mounts inside VedioNotes' existing workbench content region. It does not replace the application sidebar, custom title bar, or route state outside Settings. The existing `decorations: false` window configuration and React window controls remain unchanged.

The five retained tab labels use the current Chinese product copy. CipherTalk branding, account identity, avatars, WeChat paths, and unrelated application navigation are excluded.

## Page Mapping

### Appearance

Preserve CipherTalk's page composition, cards, controls, option presentation, theme preview, spacing, and interaction states. Bind only to VedioNotes appearance settings that have real meaning, including theme and existing workbench appearance preferences.

CipherTalk-only reply tiles, WeChat home backgrounds, close-to-tray behavior, and other unsupported product controls are not rendered as fake options. If a visually corresponding slot is necessary to preserve the composition, fill it with a real VedioNotes preference agreed by the existing type contract rather than a disabled placeholder.

Appearance changes keep VedioNotes' current optimistic immediate application and serialized persistence behavior. A failed save rolls back to the last persisted state and reports an inline error without leaving the preview and stored value inconsistent.

### Speech-to-Text

Preserve CipherTalk's three-mode presentation and detailed control behavior:

- CPU: SenseVoice model status, int8/float32 selection, download/cancel/delete/refresh, and zh/en/ja/ko/yue selection;
- GPU: local Whisper model selection, GPU detection, CUDA component status and lifecycle, acceleration and CPU fallback messaging;
- Online: provider/profile selection, endpoint/model/language/timeout/concurrency presentation, credential entry, validation, and connection testing where VedioNotes has a real command.

Map the UI to VedioNotes' existing SenseVoice, local Whisper/CUDA, online profile, progress-event, and preference contracts. Preserve listener-before-command registration and immediately dispose a late-resolving listener after unmount.

No model or runtime action is simulated in production. Every visible enabled action must call a real platform method and show loading, success, cancellation, and error states.

### AI Access

Preserve CipherTalk's select/combobox-driven large-model workflow, provider summary, API-key visibility control, model refresh, preset creation/management, capability subtabs, form geometry, and status feedback.

Retain VedioNotes' authoritative catalog and backend behavior:

- 116 standard-protocol providers;
- 3,926 model records;
- OpenAI Compatible, OpenAI Responses, Anthropic Messages, and Google Gemini protocols;
- catalog-backed atomic save and activation;
- Keyring-isolated credentials;
- vector, rerank, web search, TTS, image, and local-agent capability contracts.

CipherTalk's models.dev snapshot is not copied over VedioNotes' reviewed catalog. The transplanted component consumes the existing VedioNotes catalog through the platform adapter.

Saved secrets are never rehydrated into React. The UI may show only credential-presence state or a user-entered draft that exists in memory until save.

### Data Management

Preserve CipherTalk's card layout, dialogs, progress/status presentation, log viewer interactions, directory actions, and destructive-action confirmation behavior.

Map only to app-owned VedioNotes operations:

- export preferences and export directory;
- cache usage and the approved cache categories;
- cache clearing confined to app-owned roots;
- log listing, bounded log tail reads, log level, and clearing;
- opening approved app-owned directories through the platform layer.

The frontend never submits an arbitrary deletion path. Rust remains responsible for mapping enums and validated IDs to app-owned filesystem locations.

### About

Preserve CipherTalk's About-page composition, typography, version cards, component/status presentation, links, and responsive behavior, but use VedioNotes branding, icon, version, repository link, component inventory, and license/attribution information.

Do not copy CipherTalk release-update behavior unless VedioNotes later implements and approves a Tauri updater. This transplant displays only real version/component data returned by VedioNotes.

## State and Persistence

- Use a settings-focused Zustand store derived from CipherTalk's store pattern.
- Hydrate once from typed platform snapshots when Settings mounts.
- Keep transient drafts local to the owning tab where they should not affect other pages.
- Keep persisted application preferences, profile state, capability state, and secrets in their existing Rust-owned stores.
- Serialize overlapping saves to prevent an older result from overwriting a newer appearance or profile selection.
- Dirty state must be field-aware. Navigation either commits according to the approved instant-save rule or prompts only when a page genuinely contains an unsaved draft.
- Rollback uses the last confirmed platform snapshot, never hard-coded defaults.

## Error and Cancellation Behavior

- Platform methods return typed success data or sanitized application errors.
- Components show errors in the same visual location and interaction style as CipherTalk.
- Model/runtime downloads support progress, cancellation, retry, and safe listener cleanup.
- Destructive data/model/runtime actions require explicit confirmation.
- Connection tests and provider failures must not expose API keys, authorization headers, raw cookies, or unbounded response bodies.
- An unavailable optional backend action renders as unavailable with an accurate explanation; it is not silently simulated.

## Rollout and Rollback

- Keep the current `SettingsWorkspace.tsx` implementation during development.
- Mount the transplanted implementation behind an internal build-time or local-development switch.
- Make the new implementation the default only after the five-page visual and functional gates pass.
- Remove the old settings implementation only in a later explicit cleanup task after a stable release checkpoint. The initial transplant plan does not delete it.

## Visual Verification

Before integration, capture the five retained CipherTalk pages from the pinned source at deterministic window sizes and theme states. These screenshots are the visual baseline, not a source for manually redrawing the UI.

The verification matrix includes:

- 1280×800 normal window;
- maximized window;
- Windows 100%, 125%, and 150% display scaling;
- light and dark themes;
- all five top-level pages;
- every Speech-to-Text mode;
- every AI capability subtab;
- closed and open combobox/dropdown states;
- dialogs and confirmation states;
- hover, pressed, focus-visible, disabled, loading, success, warning, error, empty, and completed-animation states;
- narrow layout and scrollbar behavior.

Visual comparison checks geometry and computed styles in addition to screenshots. CSS changes made for WebView2 compatibility must cite the exact Chromium/WebView2 difference, identify the affected rule, and demonstrate equivalent output.

## Test Strategy

1. Source audit tests lock the selected CipherTalk files, imports, tab inventory, Electron/Node call sites, and source commit.
2. Dependency smoke tests prove HeroUI/Tailwind/settings styles render without changing non-Settings routes.
3. Component tests lock the retained shell DOM, navigation, accessible names, focus order, controls, dialogs, and state transitions.
4. Adapter contract tests verify every visible action maps to a typed VedioNotes method and that no component imports Tauri directly.
5. Existing backend and bridge tests remain authoritative for persistence, credentials, model lifecycle, cancellation, logs, cache safety, and capability operations.
6. Visual regression runs against the deterministic matrix above.
7. Full Vitest, TypeScript/Vite, static capability/privacy checks, and single-job offline Rust tests run before enabling the new implementation by default.
8. A Tauri no-bundle development/release executable may be built only when requested by the execution stage. MSI and NSIS are outside this plan unless explicitly authorized.

## Stage Gates

Every implementation stage must report:

- modified and created files;
- CipherTalk source files and commit used;
- Electron APIs removed or adapted;
- visible controls still awaiting a real backend mapping;
- focused tests and exact results;
- full regression state;
- visual evidence produced;
- license/attribution changes;
- rollback status.

No stage may claim complete parity while any enabled visible action is simulated, any secret can be returned to React, or any retained CipherTalk component still calls Electron or Node APIs directly.

## Explicit Non-Goals

- Migrating the rest of CipherTalk's Renderer.
- Adding Database Decryption, Security, Memory, Plugins, accounts, WeChat operations, tray, updater, or Electron packaging.
- Rewriting VedioNotes' Rust backend in Node or Electron.
- Replacing the existing workbench/sidebar/title bar outside Settings.
- Replacing the reviewed provider catalog with CipherTalk's snapshot.
- Building or executing MSI/NSIS installers during the transplant.

## Acceptance Criteria

The design is complete when:

- the five retained pages use CipherTalk-derived source components rather than the current visual approximation;
- their rendered hierarchy and visual states match the pinned CipherTalk baseline within documented WebView2 compatibility tolerances;
- all enabled controls map to real VedioNotes platform methods;
- existing download, transcription, AI, history, library, Q&A, logging, data, and credential behavior remains intact;
- no React component calls Electron, Node, Tauri invoke, or Tauri listen directly;
- non-Settings routes show no layout or style regression;
- license and modification notices are present;
- all required automated and visual gates pass before the new Settings becomes the default.
