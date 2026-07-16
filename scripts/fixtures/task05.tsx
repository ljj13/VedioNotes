import React from 'react';
import { createRoot } from 'react-dom/client';
import LibraryWorkspace from '../../src/components/LibraryWorkspace';
import QaWorkspace from '../../src/components/QaWorkspace';
import TaskHistoryWorkspace from '../../src/components/TaskHistoryWorkspace';
import WorkbenchShell from '../../src/components/WorkbenchShell';
import type { WorkbenchNavigationState, WorkbenchView } from '../../src/lib/workbenchNavigation';
import '../../src/styles/app.css';

const params = new URLSearchParams(window.location.search);
const requested = params.get('view');
const view: WorkbenchView = requested === 'qa' || requested === 'tasks' ? requested : 'library';
document.documentElement.dataset.theme = params.get('theme') === 'dark' ? 'dark' : 'light';

const navigation: WorkbenchNavigationState = {
  view,
  settingsSection: 'transcription',
  returnView: 'create',
  sidebarCollapsed: false,
};

function Fixture() {
  const content = view === 'qa'
    ? <QaWorkspace />
    : view === 'tasks'
      ? <TaskHistoryWorkspace onRetry={() => {}} onOpenNote={() => {}} onOpenLog={() => {}} />
      : <LibraryWorkspace initialSelectedId={7} />;

  return <WorkbenchShell
    navigation={navigation}
    onNavigate={() => {}}
    onToggleSidebar={() => {}}
    serviceStatus={{ ready: true, detail: 'Whisper · CUDA 就绪' }}
    theme={document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'}
  >{content}</WorkbenchShell>;
}

createRoot(document.getElementById('root')!).render(<Fixture />);
