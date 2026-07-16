import type { ReactNode } from 'react';
import type { PrimaryWorkbenchView, WorkbenchNavigationState } from '../lib/workbenchNavigation';
import WorkbenchSidebar from './WorkbenchSidebar';

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
  return (
    <div className={`app-container workbench-app theme-${theme}${navigation.sidebarCollapsed ? ' sidebar-collapsed' : ''}`} data-theme={theme}>
      <WorkbenchSidebar navigation={navigation} onNavigate={onNavigate} onOpenSettings={onOpenSettings} onToggleSidebar={onToggleSidebar} serviceStatus={serviceStatus} />
      <div className="workbench-content">
        <main className="app-main">{children}</main>
      </div>
    </div>
  );
}
