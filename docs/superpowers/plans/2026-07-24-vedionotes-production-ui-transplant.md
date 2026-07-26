# VedioNotes six-page production UI transplant implementation plan

> Execute inline against the current dirty `D:\Project\notes` worktree. Existing changes are the baseline. Do not reset, clean, delete, or rewrite unrelated work.

## Objective

Apply the approved VedioNotes desktop concept to the production React UI while preserving every existing Tauri/Rust/platform contract. Complete the task only after focused/full tests, production frontend build, offline Rust verification, and a fresh Tauri Windows `--no-bundle` compile succeed. Do not generate or execute MSI/NSIS installers.

## Non-negotiable boundaries

- No Electron, Python, alternate UI framework, new UI library, or backend rewrite.
- No mock data in production components.
- No direct Tauri calls added to feature UI; retain existing bridge/platform adapters.
- No changes to credential, Cookie, token, path-safety, redaction, or command contracts.
- Do not restore the removed sidebar brand/local-workspace parents.
- Keep default startup at Create; this delivery changes presentation, not startup workflow.
- Keep `src/features/settings` scoped under `.cipher-settings-root` and keep the legacy Settings rollback.
- Reuse all existing custom dropdown components and keep keyboard/listbox behavior.

## Stage 1 — RED concept contracts

### Files

- Modify `src/components/WorkbenchShell.test.tsx`
- Modify `src/components/HomeWorkspace.test.tsx`
- Modify `src/components/CreateWorkspace.test.tsx`
- Modify `src/components/LibraryWorkspace.test.tsx`
- Modify `src/components/QaWorkspace.test.tsx`
- Modify `src/components/TaskHistoryWorkspace.test.tsx`
- Modify `src/features/settings/CipherSettingsShell.test.tsx`
- Add `tests/static/production-ui-concept.structure.test.mjs`

### Tests to add before production edits

1. Shell root exposes `.concept-workbench`; sidebar Create is the dedicated primary action while the removed parents remain absent.
2. Tauri title bar keeps the real `WindowControls` and exposes only the approved VedioNotes title identity.
3. Home has concept hero, quick-action grid, truthful service summary, and real recent/empty states; callback names remain accessible.
4. Create keeps `CreateWorkspaceActionContext`, places real service pickers in the form column, and preserves all four `data-state` workflow steps.
5. Library has explicit source/filter, entry-list, safe reader, and inspector regions without changing bridge calls.
6. QA retains selected-note scope, note picker, turns, separate web results, and composer.
7. History exposes status filters, a selectable record list/table, and a real selected-record detail with existing retry/note/log actions.
8. Settings exposes a page header, left `.settings-tabs` navigation, active tab semantics, one `.settings-body`, five included tabs, and no excluded CipherTalk pages.
9. Static source/CSS gate requires green concept tokens, 220px/88px widths, responsive rules, `.cipher-settings-root` scoping, and zero native HTML `<select>` in production TSX.

### RED command

```powershell
npm test -- --run src/components/WorkbenchShell.test.tsx src/components/HomeWorkspace.test.tsx src/components/CreateWorkspace.test.tsx src/components/LibraryWorkspace.test.tsx src/components/QaWorkspace.test.tsx src/components/TaskHistoryWorkspace.test.tsx src/features/settings/CipherSettingsShell.test.tsx
node tests/static/production-ui-concept.structure.test.mjs
```

Expected: only the newly added concept assertions fail.

## Stage 2 — Shared shell and visual system

### Files

- Modify `src/App.tsx` (import concept CSS and pass only derived navigation callbacks/data if needed)
- Modify `src/components/WorkbenchShell.tsx`
- Modify `src/components/WorkbenchSidebar.tsx`
- Add `src/styles/concept-workbench.css`

### Implementation

- Add `.concept-workbench` to the production shell.
- Extend the already-custom Tauri title bar with a small VedioNotes mark/name and centered product description; retain drag region and `WindowControls` exactly.
- Render Create as the first dedicated sidebar primary action, followed by Home/Library/QA/History; retain service, Settings, and collapse footer.
- Preserve 220px expanded and 88px collapsed geometry and responsive auto-collapse.
- Define the approved green/light/dark tokens, surfaces, cards, controls, focus, hover, pressed, disabled, reduced-motion, and compact-density rules in the new stylesheet.
- Scope page-layout overrides under `.concept-workbench`; do not delete legacy rules from `app.css`.
- Normalize visual treatment of ServicePicker, StyledSelect, SearchableCombobox, and HeroUI listboxes without changing their DOM or callbacks.

### GREEN command

```powershell
npm test -- --run src/components/WorkbenchShell.test.tsx src/components/ServicePicker.test.tsx src/components/StyledSelect.test.tsx
node tests/static/production-ui-concept.structure.test.mjs
```

## Stage 3 — Home and Create

### Files

- Modify `src/components/HomeWorkspace.tsx`
- Modify `src/components/CreateWorkspace.tsx`
- Modify `src/components/InputPanel.tsx` only for semantic wrappers/classes; do not alter task construction
- Modify corresponding three test files

### Home

- Recompose the existing real content into deep-green hero, quick cards, truthful workspace/service summary, and real recent notes.
- Add a QA quick callback only if passed explicitly from App; never hard-code a route or result.
- Do not copy prototype task percentages or fake service tiles.

### Create

- Preserve URL/file tabs, native drop handling, platform recognition, all nine note styles, screenshot option, advanced settings, and start registration.
- Place the real `ProfileSelectors`/`ServicePicker` controls in the main form column and leave the right card as the real workflow preview/status.
- Keep the registered start button and disabled/readiness logic unchanged.
- Do not add a nonfunctional output-directory control; directory management remains in Settings.

### GREEN command

```powershell
npm test -- --run src/components/HomeWorkspace.test.tsx src/components/CreateWorkspace.test.tsx src/components/InputPanel.test.tsx src/components/ProfileManagement.test.tsx src/components/ServicePicker.test.tsx
```

## Stage 4 — Library, QA, and History

### Files

- Modify `src/components/LibraryWorkspace.tsx`
- Modify `src/components/QaWorkspace.tsx`
- Modify `src/components/TaskHistoryWorkspace.tsx`
- Modify their component tests

### Library

- Reorder existing UI into sources/filters, note list, Markdown reader, and selected-note inspector.
- Move existing action controls; do not duplicate or replace handlers.
- Preserve search/Markdown sequence guards, SafeMarkdown, URL filtering, deletion confirmation, tags, chat, vector, and local-agent state.

### QA

- Apply the concept left-picker/right-conversation/composer layout.
- Keep same-note scope and the separation of note answers from web search results.

### History

- Add local status filter state over loaded records and selected-record state.
- Preserve the table semantics or an equally accessible list/table representation.
- Build the right detail card only from `TaskRecord` fields; omit unavailable stage timelines.
- Keep exact retry composition, query debounce, stale-request guard, open-note, and open-log callbacks.

### GREEN command

```powershell
npm test -- --run src/components/LibraryWorkspace.test.tsx src/components/QaWorkspace.test.tsx src/components/TaskHistoryWorkspace.test.tsx src/components/SafeMarkdown.test.tsx
```

## Stage 5 — Five-page Settings shell

### Files

- Modify `src/features/settings/CipherSettingsShell.tsx`
- Modify `src/features/settings/CipherSettingsShell.test.tsx`
- Modify `src/styles/cipher-settings.css`

### Implementation

- Keep HeroUI Tabs and `.settings-tabs [role="tab"]` for current tests and visual tooling.
- Wrap Tabs as the 220px left settings rail; add the approved Settings page heading/status shell.
- Keep exactly one independently scrollable `.settings-body` on the right.
- Do not rewrite Appearance, Transcription, AI, Data, or About business tabs.
- Keep every Settings CSS rule rooted under `.cipher-settings-root`.
- Ensure narrow viewports turn the rail into a compact horizontal/scrollable tab strip without horizontal page overflow.

### GREEN command

```powershell
npm test -- --run src/features/settings/CipherSettingsShell.test.tsx src/features/settings/SettingsEntry.test.tsx src/features/settings/SettingsStyleIsolation.test.tsx src/features/settings/tabs/AppearanceTab.test.tsx src/features/settings/tabs/TranscriptionTab.test.tsx src/features/settings/tabs/AiAccessTab.test.tsx src/features/settings/tabs/DataManagementTab.test.tsx src/features/settings/tabs/AboutTab.test.tsx
node tests/static/production-settings.structure.test.mjs
node tests/static/settings-platform-boundary.test.mjs
node tests/static/ciphertalk-settings-source.test.mjs
```

## Stage 6 — App integration and visual verification

### Files

- Modify `tests/ui/App.test.tsx` only where production DOM legitimately changed; never weaken business assertions
- Add `task14-workbench-visual-matrix.mjs`
- Add `scripts/run-workbench-visual-matrix.ps1`

### Integration assertions

- Default Create startup remains usable.
- All six destinations navigate and expose the correct active control.
- Settings returns/navigates through the existing state machine.
- Starting, backgrounding, cancelling, completing, saving, library loading, note Q&A, and history retry continue to call the same mocked Tauri commands.

### Edge matrix

- Build/preview the production frontend with a deterministic Tauri mock injected before page load.
- Capture Home, Create, Library, QA, History, and one representative Settings page.
- Check 1440×900 and 900×700, light/dark, expanded/compact sidebar.
- Fail on blank image, duplicate route captures, horizontal overflow, missing active navigation, runtime error, or inaccessible custom dropdown.
- Write only to a new `outputs/production-ui-matrix/<timestamp>` directory; do not delete existing outputs.

## Stage 7 — Complete verification and compile

Run serially:

```powershell
npm test
node tests/static/production-ui-concept.structure.test.mjs
node tests/static/complete-workbench-capabilities.test.mjs
node tests/static/production-settings.structure.test.mjs
node tests/static/models-dev-catalog.test.mjs
node tests/static/ai-capability-bridge.test.mjs
node tests/static/settings-platform-boundary.test.mjs
node tests/static/ciphertalk-settings-source.test.mjs
node tests/static/settings-privacy-boundary.test.mjs
npm run build
$env:CARGO_BUILD_JOBS='1'; cargo check --offline --manifest-path src-tauri/Cargo.toml --jobs 1
$env:CARGO_BUILD_JOBS='1'; cargo test --offline --manifest-path src-tauri/Cargo.toml --jobs 1
npm run tauri -- build --no-bundle
```

If Cargo is not on PATH, use the existing installed toolchain path discovered by the build audit; do not install or substitute another compiler.

## Completion evidence

- Exact pass counts for Vitest and static gates.
- `npm run build` output and final dist timestamp.
- Rust check/test exit codes and existing warning summary.
- Tauri command exit code, EXE path, size, timestamp, PE header check, and SHA-256.
- Explicit confirmation that no MSI/NSIS was generated or executed.
- Final dirty-worktree summary limited to files touched by this delivery versus pre-existing baseline.
