# Production Settings Integration Plan

**Goal:** Integrate the approved settings prototype into the production React/Tauri application while preserving real backend contracts.

## Task 1 — Prototype Defect Gate

- Add failing contracts for collapsed flex-label removal and custom dropdown styling.
- Collapse label widths/gaps and enhance every prototype settings select.
- Run structural, JavaScript syntax, and compact screenshot checks.

## Task 2 — Production Navigation and Dropdown Foundation

- Add failing reducer and component tests for the five settings destinations.
- Build a reusable accessible `StyledSelect` with custom menu styling.
- Replace the old settings navigation shell and preserve return routing.

## Task 3 — Speech-to-Text Integration

- Add failing tests for CPU/GPU/Online mode switching.
- Present SenseVoice as an unavailable optional component unless a real backend capability reports ready.
- Reuse local Whisper/CUDA managers for GPU and profile management for Online.
- Preserve all five existing Whisper models and Credential Manager behavior.

## Task 4 — AI Access Integration

- Add failing tests for seven AI subtabs and provider/model dropdown behavior.
- Reuse summary profiles for the operational Large Model panel.
- Add complete non-operational capability forms with explicit pipeline-boundary notices; do not fake test or save success.

## Task 5 — Data, Appearance, About, and Responsive Polish

- Integrate existing download/output/log functions.
- Keep appearance preferences and responsive settings tabs.
- Fix collapsed sidebar alignment and reduced-motion transitions.

## Task 6 — Verification

- Run focused tests after each task.
- Run `npm test`, `npm run build`, full Rust tests, privacy scan, and `cargo build --release`.
- Do not build MSI/NSIS.
