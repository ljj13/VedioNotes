# Sidebar Brand and Workspace Removal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the two complete decorative sidebar containers and their dead implementation details while preserving every remaining sidebar control and layout contract.

**Architecture:** Keep the existing React/Tauri shell intact. Make a narrow component-and-CSS deletion in `WorkbenchSidebar`, protected by the existing `WorkbenchShell` DOM and keyboard tests.

**Tech Stack:** React 19, TypeScript 5.8, CSS, Vitest 4, Vite 7, Tauri 2

## Global Constraints

- Do not change the 220px expanded or 88px collapsed sidebar widths.
- Do not modify main content, transcription, AI, data-management, or navigation behavior.
- Remove complete parent containers rather than hiding text or icons.
- Do not modify generated `dist` files directly.
- Do not build MSI or NSIS.

---

### Task 1: Remove the brand and local-workspace sidebar containers

**Files:**
- Modify: `src/components/WorkbenchShell.test.tsx`
- Modify: `src/components/WorkbenchSidebar.tsx`
- Modify: `src/styles/app.css`

**Interfaces:**
- Consumes: `WorkbenchSidebar` props and the existing `WorkbenchShell` DOM contract.
- Produces: unchanged navigation/service/settings/toggle behavior with the two decorative containers absent.

- [x] **Step 1: Write the failing structure and ordering test**

Replace the footer-order test with assertions that `.sidebar-brand`, `.workspace-profile`, their four visible labels, and their reserved positions are absent while navigation, service status, Settings, and toggle remain ordered.

- [x] **Step 2: Verify the test fails for the intended reason**

Run: `npm test -- src/components/WorkbenchShell.test.tsx`

Expected: one failure because `.sidebar-brand` and `.workspace-profile` still exist.

- [x] **Step 3: Remove the minimal production implementation**

Delete both complete JSX parent containers, remove `workspace` from `IconName`, remove its `Icon` branch, and delete only their dedicated CSS. Change `.sidebar-nav` top margin from `20px` to `0`; retain the 220/88px grid columns and `.sidebar-copy` service-status styles.

- [x] **Step 4: Verify focused and full frontend behavior**

Run: `npm test -- src/components/WorkbenchShell.test.tsx`

Expected: all sidebar tests pass.

Run: `npm test`

Expected: all frontend tests pass with zero failures.

- [x] **Step 5: Verify types, production assets, static contracts and Release EXE**

Run: `npm run build`

Expected: TypeScript and Vite exit 0.

Run the existing complete-workbench, production-settings and documentation static checks; then run `npm run tauri -- build --no-bundle` with one Cargo job after closing the old running EXE. Restart the resulting EXE and confirm it responds without a localhost development-server connection.
