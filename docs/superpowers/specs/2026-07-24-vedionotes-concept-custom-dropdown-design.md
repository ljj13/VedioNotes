# VedioNotes UI Concept Custom Dropdown Design

## Scope

Replace every native HTML `<select>` in `.codex-research/tauri-react-ui/vedionotes-ui-concept.html` with one shared, self-contained custom dropdown pattern. The change applies only to the standalone concept prototype and does not modify production React, Tauri, Rust, package, lock, build, or test files.

The four dropdowns in scope are:

1. Transcription engine in New Distillation.
2. AI summary model in New Distillation.
3. Provider model in Settings → AI Access.
4. Export format in Settings → Data Management.

## Visual Design

Each control uses the existing VedioNotes semantic tokens, border radius, spacing rhythm, typography, and light/dark theme mappings. The closed trigger is visually consistent with text fields. The open popup is a layered application surface with:

- a clear selected row;
- a right-aligned inline SVG check mark;
- hover, active, focus, and disabled states;
- the existing green accent without introducing another color system;
- a restrained shadow and border that remain legible in both themes;
- a maximum height with internal scrolling for long option lists.

The popup must not use the Windows/WebView2 native option menu. No external UI library, font, icon package, image, or network resource is introduced.

## Component Contract

The standalone HTML exposes one reusable pattern backed by plain JavaScript:

- `.custom-select` owns positioning and width.
- `[data-select-trigger]` uses `role="combobox"`, `aria-haspopup="listbox"`, `aria-expanded`, and `aria-controls`.
- `[role="listbox"]` owns the popup.
- `[role="option"]` exposes `aria-selected` and a stable value.
- `selectDropdownOption(selectId, value)` updates the selected value, trigger label, option states, and any dependent mock state.
- `openDropdown(selectId)` and `closeDropdown(selectId)` manage one open popup at a time.
- `getDropdownValue(selectId)` replaces direct native `.value` reads.

The existing mock workflow remains unchanged apart from reading the transcription engine through `getDropdownValue()`.

## Interaction Design

- Mouse click toggles the popup and selects an option.
- Clicking outside closes the popup without changing the value.
- Escape closes the popup and returns focus to its trigger.
- Arrow Down and Arrow Up open the popup and move active focus.
- Home and End move to the first and last options.
- Enter and Space select the active option.
- Tab closes the popup and continues normal focus order.
- Opening a second dropdown closes the first.
- Re-rendered Settings panels recreate their dropdowns from explicit state, including the currently selected provider model and export format.

## Responsive and Layering Rules

The popup follows its trigger width, stays above cards and sticky panels, and does not create page-level horizontal overflow at 1440×900, 1180×760, or 900×700. When space below the trigger is insufficient, JavaScript may add an upward-opening class based on the current viewport geometry.

## Verification

Verification must prove:

1. The prototype source contains no native `<select>` or `<option>` elements.
2. Exactly four custom comboboxes render in their respective pages.
3. All four expose correct accessible roles, labels, expanded state, selected option state, and keyboard behavior.
4. Mouse selection changes the displayed value and underlying mock state.
5. Click-outside, Escape, Tab, and opening another dropdown close popups correctly.
6. Light and dark themes display the trigger and popup consistently.
7. All six routes remain free of page-level horizontal overflow at the three required viewports.
8. The task completion and cancellation flows still pass after replacing the transcription engine value source.
9. Edge reports no runtime exceptions.

## Non-goals

- No change to the production Settings implementation.
- No replacement of text inputs, search fields, segmented controls, or file/directory buttons.
- No persistence, Tauri call, filesystem access, network access, or real provider/model configuration.
- No unrelated visual redesign.
