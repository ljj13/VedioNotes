import { describe, expect, it } from 'vitest';

import {
  initialWorkbenchNavigationState,
  workbenchNavigationReducer,
  type WorkbenchNavigationState,
} from './workbenchNavigation';

describe('workbench navigation state', () => {
  it('keeps the established create startup while exposing Home as a typed route', () => {
    expect(initialWorkbenchNavigationState).toEqual({
      view: 'create',
      settingsSection: 'transcription',
      returnView: 'create',
      sidebarCollapsed: false,
    });
  });

  it.each(['home', 'create', 'library', 'qa', 'tasks', 'progress', 'result'] as const)(
    'opens the %s route through typed navigation',
    (view) => {
      expect(
        workbenchNavigationReducer(initialWorkbenchNavigationState, {
          type: 'open-view',
          view,
        }),
      ).toMatchObject({ view, returnView: view });
    },
  );

  it('keeps the task route independent from the Library route', () => {
    const library = workbenchNavigationReducer(initialWorkbenchNavigationState, {
      type: 'open-view',
      view: 'library',
    });
    expect(library.view).toBe('library');

    const tasks = workbenchNavigationReducer(library, {
      type: 'open-view',
      view: 'tasks',
    });
    expect(tasks.view).toBe('tasks');
  });

  it('remembers Library when opening Settings', () => {
    const library = workbenchNavigationReducer(initialWorkbenchNavigationState, {
      type: 'open-view',
      view: 'library',
    });

    expect(
      workbenchNavigationReducer(library, { type: 'open-settings' }),
    ).toMatchObject({ view: 'settings', settingsSection: 'transcription', returnView: 'library' });
  });

  it('opens Settings directly at data management without leaving Settings', () => {
    expect(
      workbenchNavigationReducer(initialWorkbenchNavigationState, {
        type: 'open-settings',
        section: 'data',
      }),
    ).toMatchObject({ view: 'settings', settingsSection: 'data', returnView: 'create' });
  });

  it('changes Settings sections without routing to a main view', () => {
    const settings = workbenchNavigationReducer(initialWorkbenchNavigationState, {
      type: 'open-settings',
    });

    expect(
      workbenchNavigationReducer(settings, {
        type: 'select-settings-section',
        section: 'ai',
      }),
    ).toMatchObject({ view: 'settings', settingsSection: 'ai', returnView: 'create' });
  });

  it('returns from Settings to the remembered Q&A view', () => {
    const qa = workbenchNavigationReducer(initialWorkbenchNavigationState, {
      type: 'open-view',
      view: 'qa',
    });
    const settings = workbenchNavigationReducer(qa, { type: 'open-settings' });

    expect(
      workbenchNavigationReducer(settings, { type: 'return-from-settings' }),
    ).toMatchObject({ view: 'qa', returnView: 'qa' });
  });

  it('falls back to Create when a malformed state remembers Settings', () => {
    const malformedState = {
      ...initialWorkbenchNavigationState,
      view: 'settings',
      returnView: 'settings',
    } as unknown as WorkbenchNavigationState;

    expect(
      workbenchNavigationReducer(malformedState, { type: 'return-from-settings' }),
    ).toMatchObject({ view: 'create', returnView: 'create' });
  });

  it('toggles only the sidebar collapsed flag', () => {
    const state = {
      ...initialWorkbenchNavigationState,
      view: 'settings' as const,
      settingsSection: 'appearance' as const,
      returnView: 'tasks' as const,
    };

    expect(workbenchNavigationReducer(state, { type: 'toggle-sidebar' })).toEqual({
      ...state,
      sidebarCollapsed: true,
    });
  });
});
