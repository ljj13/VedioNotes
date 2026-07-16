# Production Settings Integration Design

**Date:** 2026-07-15  
**Status:** Approved through the reviewed standalone prototype and the user's explicit production-integration request.

## Goal

Move the approved CipherTalk-inspired settings information architecture into the existing React/Tauri application without replacing the current Rust processing pipeline or pretending that prototype-only providers are already executable.

## Product Contract

- The settings workspace has exactly five top-level destinations: Appearance, Speech-to-Text, AI Access, Data Management, and About.
- Speech-to-Text has CPU, GPU, and Online modes.
  - CPU presents SenseVoice as an optional component. Until a SenseVoice executable and model are installed and detected, it is explicitly unavailable and cannot become the active task engine.
  - GPU reuses the existing whisper.cpp model manager, CUDA runtime manager, and `local_compute_mode` backend.
  - Online reuses real transcription profiles, readiness checks, Credential Manager isolation, and profile testing.
- AI Access has Large Model, Vector, Rerank, Web, Speech, Image, and Local Agent subtabs.
  - Large Model reuses real summary profiles and the current provider/profile backend.
  - The other six surfaces are capability configuration previews in this delivery. They state that they are not consumed by the video-distillation pipeline and do not expose fake connection success.
- Data Management integrates the existing platform-download, output-directory, and diagnostic-log capabilities. Destructive cache controls stay unavailable until a dedicated safe backend command exists.
- About reports the real application stack and local-processing posture.

## Dropdown Contract

- Native browser dropdown rendering is not used for user-facing settings controls.
- A reusable React `StyledSelect` implements a pill trigger, rounded floating listbox, selected checkmark, outside-click dismissal, and Arrow/Home/End/Enter/Escape keyboard behavior.
- Existing `ServicePicker` remains the richer searchable/grouped picker for active operational profiles. `StyledSelect` serves compact finite option sets.
- Both controls share semantic color, radius, shadow, focus, and reduced-motion tokens.

## Sidebar Repair

- Collapsed labels remain mounted for smooth animation, but their maximum width, opacity, visibility, and gaps collapse to zero.
- SVG icon boxes retain fixed width and centered alignment.
- Readiness remains visible as a green dot in compact mode.

## State and Backend Boundaries

- Existing active transcription/summary profile state remains authoritative in `profiles.json`.
- Existing output and compute preferences remain authoritative in `preferences.json`.
- Secrets remain in Windows Credential Manager and are never returned to React.
- No new provider is marked operational unless a Rust consumer exists.
- SenseVoice is represented by a tested capability/status contract only in this phase; no executable, model, dependency, or package is downloaded automatically.

## Safety

- Tests use mocks and local fixtures only.
- No real API, media/model download, credential read, package install, upload, or installer execution.
- Build only the release executable; MSI/NSIS are excluded unless explicitly requested.

## Acceptance

- Prototype sidebar and custom-dropdown structural checks pass and render cleanly at compact width.
- Production settings navigation exposes the five approved categories and the three/seven submodes.
- Operational settings continue to call the existing Tauri bridges with their original payloads.
- All dropdowns have custom visual menus and keyboard behavior.
- Existing frontend and Rust suites pass, privacy scan passes, and `video-distiller.exe` builds in release mode.
