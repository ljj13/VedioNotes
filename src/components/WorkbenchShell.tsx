import { type ReactNode, useState } from 'react';
import type { PrimaryWorkbenchView, WorkbenchNavigationState } from '../lib/workbenchNavigation';
import WorkbenchSidebar from './WorkbenchSidebar';
import WindowControls from './WindowControls';

function isTauriEnv() {
  try {
    return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
  } catch {
    return false;
  }
}

export type WorkbenchServiceStatus = {
  ready: boolean;
  detail: string;
};

type Props = {
  navigation: WorkbenchNavigationState;
  onNavigate: (view: PrimaryWorkbenchView) => void;
  onOpenSettings?: () => void;
  onToggleSidebar: () => void;
  serviceStatus?: WorkbenchServiceStatus;
  theme: 'light' | 'dark';
  children: ReactNode;
};

export default function WorkbenchShell({ navigation, onNavigate, onOpenSettings = () => {}, onToggleSidebar, serviceStatus = { ready: false, detail: '正在检查服务' }, theme, children }: Props) {
  const [tauri] = useState(() => isTauriEnv());

  return (
    <>
      {tauri && (
        <div className={`window-top-bar theme-${theme}${navigation.sidebarCollapsed ? ' sidebar-collapsed' : ''}`} data-theme={theme} data-tauri-drag-region>
          <div className="window-drag-spacer" />
          <WindowControls />
        </div>
      )}
      <div className={`app-container workbench-app theme-${theme} view-${navigation.view}${navigation.sidebarCollapsed ? ' sidebar-collapsed' : ''}${tauri ? ' is-tauri' : ''}`} data-theme={theme}>
        <WorkbenchSidebar navigation={navigation} onNavigate={onNavigate} onOpenSettings={onOpenSettings} onToggleSidebar={onToggleSidebar} serviceStatus={serviceStatus} />
        <div className="workbench-content">
          <main className="app-main">{children}</main>
        </div>
      </div>
    </>
  );
}
