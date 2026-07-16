import type { PrimaryWorkbenchView, WorkbenchNavigationState } from '../lib/workbenchNavigation';
import type { WorkbenchServiceStatus } from './WorkbenchShell';

type Props = {
  navigation: WorkbenchNavigationState;
  onNavigate: (view: PrimaryWorkbenchView) => void;
  onOpenSettings: () => void;
  onToggleSidebar: () => void;
  serviceStatus: WorkbenchServiceStatus;
};

type IconName = 'home' | 'plus' | 'book' | 'chat' | 'history' | 'settings' | 'chevron';

function Icon({ name }: { name: IconName }) {
  if (name === 'home') return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z" /></svg>;
  if (name === 'plus') return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" /></svg>;
  if (name === 'book') return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M5 4.5A2.5 2.5 0 0 1 7.5 2H20v17H7.5A2.5 2.5 0 0 0 5 21.5m0-17v17m0-17H4v17h3.5" /></svg>;
  if (name === 'chat') return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 5.5h16v11H9l-5 4Z" /><path d="M8 9h8M8 13h5" /></svg>;
  if (name === 'history') return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 5v5h5" /><path d="M5.5 9A8 8 0 1 1 4 14" /><path d="M12 8v5l3 2" /></svg>;
  if (name === 'settings') return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="m9.4 3.6.5-1.1h4.2l.5 1.1 1.2.7 1.2-.2 2.1 2.1-.2 1.2.7 1.2 1.1.5v4.2l-1.1.5-.7 1.2.2 1.2-2.1 2.1-1.2-.2-1.2.7-.5 1.1H9.9l-.5-1.1-1.2-.7-1.2.2-2.1-2.1.2-1.2-.7-1.2-1.1-.5V9.1l1.1-.5.7-1.2-.2-1.2L7 4.1l1.2.2 1.2-.7Z" /><circle cx="12" cy="11.2" r="3" /></svg>;
  return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="m9 5 7 7-7 7" /></svg>;
}

const destinations: ReadonlyArray<{ view: PrimaryWorkbenchView; label: string; icon: IconName }> = [
  { view: 'home', label: '首页', icon: 'home' },
  { view: 'create', label: '新建提炼', icon: 'plus' },
  { view: 'library', label: '笔记库', icon: 'book' },
  { view: 'qa', label: 'AI 问答', icon: 'chat' },
  { view: 'tasks', label: '历史任务', icon: 'history' },
];

export default function WorkbenchSidebar({ navigation, onNavigate, onOpenSettings, onToggleSidebar, serviceStatus }: Props) {
  const { sidebarCollapsed, view } = navigation;
  const label = (text: string, className = '') => (
    <span className={`sidebar-label ${className}`.trim()} aria-hidden={sidebarCollapsed}>{text}</span>
  );

  return (
    <aside className={`workbench-sidebar ${sidebarCollapsed ? 'is-collapsed' : ''}`}>
      <nav aria-label="主导航" className="sidebar-nav">
        {destinations.map((item) => (
          <button key={item.view} type="button" className={view === item.view ? 'active' : ''} aria-current={view === item.view ? 'page' : undefined} aria-label={item.label} title={sidebarCollapsed ? item.label : undefined} onClick={() => onNavigate(item.view)}>
            <Icon name={item.icon} />{label(item.label)}
          </button>
        ))}
      </nav>

      <div className="sidebar-footer">
        <span className={`ready-status ${serviceStatus.ready ? 'is-ready' : 'is-checking'}`} role="status" aria-label={serviceStatus.ready ? '服务正常' : '服务检查中'} title={sidebarCollapsed ? serviceStatus.detail : undefined}>
          <span className="ready-dot" aria-hidden="true" />
          <span className="sidebar-label sidebar-copy" aria-hidden={sidebarCollapsed}><strong>{serviceStatus.ready ? '服务正常' : '检查服务'}</strong><small>{serviceStatus.detail}</small></span>
        </span>
        <button type="button" className={view === 'settings' ? 'sidebar-action active' : 'sidebar-action'} aria-current={view === 'settings' ? 'page' : undefined} aria-label="设置" title={sidebarCollapsed ? '设置' : undefined} onClick={() => onOpenSettings()}>
          <Icon name="settings" />{label('设置')}
        </button>
        <button type="button" className="sidebar-toggle sidebar-action" aria-label={sidebarCollapsed ? '展开侧边栏' : '收起侧边栏'} aria-expanded={!sidebarCollapsed} title={sidebarCollapsed ? '展开侧边栏' : undefined} onClick={onToggleSidebar}>
          <Icon name="chevron" />{label(sidebarCollapsed ? '展开侧边栏' : '收起侧边栏')}
        </button>
      </div>
    </aside>
  );
}
