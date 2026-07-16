# Sidebar Brand and Workspace Removal Design

## Goal

Remove the complete top-left brand container and bottom-left local-workspace container from the production sidebar without changing navigation, service status, Settings, collapse behavior, sidebar width, or the main content area.

## Confirmed implementation boundary

- `src/components/WorkbenchSidebar.tsx` owns both containers and their inline SVG graphics.
- `src/styles/app.css` owns all related layout, presentation, collapsed-state, and 960px responsive selectors.
- `src/components/WorkbenchShell.test.tsx` owns the sidebar structure, order, collapse, and keyboard-navigation contracts.
- Neither target graphic is an external image asset. The workspace icon branch is target-specific; the brand mark is inline in the removed JSX.

## Required result

- Remove `.sidebar-brand` and all of its children.
- Remove `.workspace-profile` and all of its children.
- Remove the target-only `workspace` icon type and SVG branch.
- Remove target-only CSS selectors while preserving `.sidebar-copy`, which is still used by service status.
- Remove the navigation top margin that previously separated navigation from the brand, so no empty brand-sized gap remains.
- Keep the sidebar widths at 220px expanded and 88px collapsed.
- Preserve the order: navigation, service status, Settings, sidebar toggle.
- Preserve accessible names, keyboard order, and the collapsed ready-status dot.

## Verification

Use a failing sidebar structure test before implementation. Then run the focused sidebar test, the complete frontend suite, `tsc && vite build`, static workbench contracts, and a Tauri `--no-bundle` release build. Do not generate MSI or NSIS.
