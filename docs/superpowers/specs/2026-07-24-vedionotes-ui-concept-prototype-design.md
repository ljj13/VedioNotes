# VedioNotes Complete UI Concept Prototype Design

Date: 2026-07-24

## Purpose

Create a standalone interactive HTML prototype that visualizes a coherent future direction for the entire VedioNotes desktop interface. The prototype combines the strongest patterns identified during reference research without copying any source project's brand, assets, component code, or full visual identity.

This artifact is for visual evaluation only. It does not replace, mount inside, or modify the production Tauri/React application.

## Deliverable

One self-contained file:

`D:\Project\notes\.codex-research\tauri-react-ui\vedionotes-ui-concept.html`

The file must:

- use only HTML, CSS, inline SVG, and plain JavaScript;
- require no package installation, build step, server, CDN, font download, or network request;
- embed all mock content and icons needed for the demonstration;
- contain no real credentials, user data, API requests, or Tauri calls;
- open directly in Microsoft Edge or another modern browser;
- remain isolated from `src`, `src-tauri`, manifests, lockfiles, tests, and build outputs.

## Visual Direction

The prototype uses a restrained Windows desktop productivity style:

- rounded desktop shell with a compact custom top bar;
- collapsible left navigation with VedioNotes page labels;
- neutral dark and light themes with semantic surface tokens;
- green for healthy/ready states, amber for active work, red for destructive or failed states;
- 4/8-pixel spacing rhythm, high-contrast typography, thin borders, and modest shadows;
- consistent hand-authored inline SVG icons;
- 150–250 ms transitions limited to navigation, selection, disclosure, and modal behavior;
- no copied project logos, decorative illustrations, stock imagery, or external UI libraries.

The composition draws on these patterns:

- Handy: settings navigation, one-setting-per-row groups, and model lifecycle cards;
- OpenSW: compact and explicit recording/transcription state feedback;
- Jean: dense AI/session workspace, status chips, composer, and background task affordances;
- Tolaria: source list, note list, document body, and property inspector hierarchy;
- Cap: spatial zoning of preview, inspector, transport controls, and timeline only.

## Application Shell

The desktop frame includes:

- a custom title bar with application name and simulated window controls;
- a 220-pixel expanded sidebar and 88-pixel collapsed sidebar;
- navigation for Home, New Distillation, Notes Library, AI Q&A, History, and Settings;
- a persistent service-readiness indicator and sidebar collapse control;
- a content header that changes with the current page;
- a compact task activity control that can reveal the current background job.

The prototype must not restore the removed Workbench brand block or the removed Local Workspace/Privacy Mode block.

## Screens and Interactions

### Home

- welcome/summary heading;
- active task overview with semantic progress;
- recent notes list;
- runtime/service health cards;
- quick actions that navigate to New Distillation, Notes Library, or AI Q&A.

### New Distillation

- URL/file input mode selector;
- source field and file-choice simulation;
- transcription engine, summary model, note style, and output controls;
- primary start action;
- simulated staged progress through download, audio extraction, transcription, AI structuring, and note save;
- cancellable floating task panel with percent and current stage;
- completed result preview with evidence/source chips.

### Notes Library

- Tolaria-inspired four-region layout: category navigation, note list, safe Markdown-like reading surface, and metadata inspector;
- note selection updates the body and metadata without navigation;
- search and category filtering use local mock data;
- the layout collapses progressively on narrower viewports instead of introducing horizontal page scrolling.

### AI Q&A

- conversation list and active conversation content;
- assistant responses with note/source reference chips;
- model/protocol controls;
- bottom composer with attachment and send affordances;
- sending inserts a mock user message followed by a short simulated assistant response;
- background operation state is visible without blocking the conversation.

### History

- task list with running, completed, failed, and cancelled examples;
- filters for all/status/type;
- selecting a task reveals details, stages, timestamps, and available actions;
- color never acts as the only status indicator.

### Settings

- nested navigation for Appearance, Speech-to-Text, AI Access, Data Management, and About;
- Appearance controls immediately change the prototype theme, density, and reduced-motion behavior;
- Speech-to-Text shows CPU/SenseVoice, GPU/Whisper/CUDA, and Online modes plus downloadable model cards;
- AI Access shows searchable mock providers, model selection, protocol information, credential state, and capability chips without storing a key;
- Data Management shows Markdown output directory, export preferences, cache categories, logs, and confirmation-based clearing;
- About shows prototype/version/source information and component health.

## Overlays and Feedback

- Clicking a reference image or visual preview opens an accessible lightbox only where an image exists in the prototype.
- Destructive actions use a confirmation dialog with Cancel as the initial safe focus.
- Toasts announce nonblocking simulated saves and actions through an `aria-live` region.
- Escape closes the topmost dialog or task drawer.
- All icon-only controls have accessible labels and visible keyboard focus.

## Responsive Behavior

- Primary target: 1440 × 900 desktop viewport.
- Secondary checks: 1180 × 760 and 900 × 700.
- At narrower widths, the properties inspector and secondary lists may become drawers or stacked regions.
- The document must not produce page-level horizontal overflow.
- All primary controls retain at least a 44-pixel interactive target.

## Error and Empty States

The prototype includes representative states rather than backend error handling:

- empty note search result;
- offline/unavailable service card;
- failed history task with recovery action;
- no installed model state;
- invalid empty source submission;
- cancelled mock task.

No simulation may call a real service or read local files.

## Validation

Validation must cover:

- HTML loads without console errors in Edge;
- all six primary navigation targets work;
- Settings' five subsections work;
- theme, density, reduced-motion, sidebar, modal, lightbox, mock progress, cancellation, filters, note selection, and AI composer interactions work;
- keyboard focus is visible and Escape behavior works;
- meaningful images and controls have accessible names;
- no external resources or network calls are present;
- no page-level horizontal overflow at the three target viewports;
- screenshots are captured from a real Edge render at 1440 × 900 and at least one narrower viewport;
- production source and application configuration remain unchanged.

## Non-Goals

- Production React implementation or migration.
- Pixel-copying Handy, OpenSW, Jean, Tolaria, Cap, or CipherTalk.
- Connecting Tauri commands, SQLite, model downloads, credentials, file dialogs, or real video playback.
- Replacing the approved production Settings implementation.
- Changing the native/custom title-bar decision in the real application.
- Running Cargo, frontend builds, MSI, NSIS, or the release executable.
