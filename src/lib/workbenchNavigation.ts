export type WorkbenchView = 'home' | 'create' | 'progress' | 'result' | 'library' | 'qa' | 'tasks' | 'settings';
export type SettingsSection = 'appearance' | 'transcription' | 'ai' | 'data' | 'about';
export type NonSettingsWorkbenchView = Exclude<WorkbenchView, 'settings'>;
export type PrimaryWorkbenchView = Extract<WorkbenchView, 'home' | 'create' | 'library' | 'qa' | 'tasks'>;

export type WorkbenchNavigationState = {
  view: WorkbenchView;
  settingsSection: SettingsSection;
  returnView: NonSettingsWorkbenchView;
  sidebarCollapsed: boolean;
};

export type WorkbenchNavigationAction =
  | { type: 'open-view'; view: NonSettingsWorkbenchView }
  | { type: 'open-settings'; section?: SettingsSection }
  | { type: 'select-settings-section'; section: SettingsSection }
  | { type: 'return-from-settings' }
  | { type: 'toggle-sidebar' };

export const initialWorkbenchNavigationState: WorkbenchNavigationState = {
  view: 'create',
  settingsSection: 'transcription',
  returnView: 'create',
  sidebarCollapsed: false,
};

const safeReturnView = (view: WorkbenchNavigationState['returnView']): NonSettingsWorkbenchView => (
  view === 'home' || view === 'create' || view === 'progress' || view === 'result' || view === 'library' || view === 'qa' || view === 'tasks'
    ? view
    : 'create'
);

export function workbenchNavigationReducer(
  state: WorkbenchNavigationState,
  action: WorkbenchNavigationAction,
): WorkbenchNavigationState {
  switch (action.type) {
    case 'open-view':
      return { ...state, view: action.view, returnView: action.view };
    case 'open-settings':
      return {
        ...state,
        view: 'settings',
        settingsSection: action.section ?? 'transcription',
        returnView: state.view === 'settings' ? safeReturnView(state.returnView) : state.view,
      };
    case 'select-settings-section':
      return { ...state, settingsSection: action.section };
    case 'return-from-settings': {
      const view = safeReturnView(state.returnView);
      return { ...state, view, returnView: view };
    }
    case 'toggle-sidebar':
      return { ...state, sidebarCollapsed: !state.sidebarCollapsed };
  }
}
