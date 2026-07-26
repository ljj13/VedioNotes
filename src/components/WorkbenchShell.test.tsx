/**
 *测试文件——测试 WorkbenchShell 组件/模块的行为是否符合预期。
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const windowApi = vi.hoisted(() => ({
  minimize: vi.fn().mockResolvedValue(undefined),
  toggleMaximize: vi.fn().mockResolvedValue(undefined),
  close: vi.fn().mockResolvedValue(undefined),
  isMaximized: vi.fn().mockResolvedValue(false),
  onResized: vi.fn().mockResolvedValue(() => {}),
}));

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => windowApi,
}));

import WorkbenchShell from './WorkbenchShell';

const navigation = {
  view: 'create' as const,
  settingsSection: 'transcription' as const,
  returnView: 'create' as const,
  sidebarCollapsed: false,
};

const baseProps = {
  navigation,
  onNavigate: vi.fn(),
  onToggleSidebar: vi.fn(),
  serviceStatus: { ready: true, detail: 'Whisper · CPU 就绪' },
  theme: 'dark' as const,
  children: <div>主要内容</div>,
};

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  windowApi.isMaximized.mockResolvedValue(false);
  windowApi.onResized.mockResolvedValue(() => {});
  delete (window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
});

// describe('WorkbenchShell', () => {
describe('WorkbenchShell', () => {
  // it('renders expanded navigation; hides window top bar outsid
  it('renders expanded navigation; hides window top bar outside Tauri', () => {
    render(<WorkbenchShell {...baseProps} />);

    expect(document.querySelector('.workbench-app.concept-workbench')).toBeTruthy();
    expect(screen.getByRole('navigation', { name: '主导航' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '首页' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '新建提炼' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '笔记库' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'AI 问答' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '历史任务' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '设置' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '收起侧边栏' })).toBeTruthy();
    expect(document.querySelector('.window-top-bar')).toBeNull(); // hidden outside Tauri
    expect(screen.queryByRole('heading', { name: '新建提炼' })).toBeNull();
    expect(screen.queryByText('视频核心提炼')).toBeNull();
    expect(screen.queryByText('从视频链接或本地媒体提炼可检索笔记')).toBeNull();
  });

  it('promotes Create as the dedicated sidebar action without restoring removed modules', () => {
    render(<WorkbenchShell {...baseProps} />);

    const sidebar = screen.getByRole('complementary');
    const create = screen.getByRole('button', { name: '新建提炼' });
    expect(create.classList.contains('sidebar-create-action')).toBe(true);
    expect(sidebar.querySelector('.sidebar-brand')).toBeNull();
    expect(sidebar.querySelector('.workspace-profile')).toBeNull();
  });

  it('renders the approved identity inside the existing Tauri custom title bar', () => {
    (window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = {};
    render(<WorkbenchShell {...baseProps} />);

    expect(screen.getByLabelText('VedioNotes 应用标题').textContent).toContain('VedioNotes');
    expect(screen.getByText('本地视频提炼工作台')).toBeTruthy();
    expect(document.querySelector('.window-controls')).toBeTruthy();
  });

  it('marks the title identity and blank title-bar space as deep drag regions without marking window buttons', () => {
    (window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = {};
    render(<WorkbenchShell {...baseProps} />);

    const titleBar = document.querySelector('.window-top-bar');
    const identity = document.querySelector('.window-title-identity');
    const spacer = document.querySelector('.window-drag-spacer');
    const controls = document.querySelector('.window-controls');

    expect(titleBar?.getAttribute('data-tauri-drag-region')).toBe('deep');
    expect(identity?.getAttribute('data-tauri-drag-region')).toBe('deep');
    expect(spacer?.getAttribute('data-tauri-drag-region')).toBe('deep');
    controls?.querySelectorAll('button').forEach((button) => {
      expect(button.hasAttribute('data-tauri-drag-region')).toBe(false);
    });
  });

  // it('omits the brand and local workspace while preserving nav
  it('omits the brand and local workspace while preserving navigation and footer controls', () => {
    render(<WorkbenchShell {...baseProps} />);

    const sidebar = screen.getByRole('complementary');
    const navigationElement = screen.getByRole('navigation', { name: '主导航' });
    const status = screen.getByRole('status', { name: '服务正常' });
    const settings = screen.getByRole('button', { name: '设置' });
    const toggle = screen.getByRole('button', { name: '收起侧边栏' });

    expect(sidebar.querySelector('.sidebar-brand')).toBeNull();
    expect(sidebar.querySelector('.workspace-profile')).toBeNull();
    expect(screen.queryByText('视频提炼')).toBeNull();
    expect(screen.queryByText('Workbench')).toBeNull();
    expect(screen.queryByText('本地工作区')).toBeNull();
    expect(screen.queryByText('隐私模式')).toBeNull();
    expect(navigationElement.compareDocumentPosition(status) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(status.compareDocumentPosition(settings) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(settings.compareDocumentPosition(toggle) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  // it('collapses to accessible icon controls while keeping the
  it('collapses to accessible icon controls while keeping the ready dot visible', () => {
    render(<WorkbenchShell {...baseProps} navigation={{ ...navigation, sidebarCollapsed: true }} />);

    const sidebar = document.querySelector('.workbench-sidebar') as HTMLElement;
    expect(document.querySelector('.app-container.workbench-app')?.classList.contains('sidebar-collapsed')).toBe(true);
    const labels = Array.from(sidebar.querySelectorAll('.sidebar-label'));
    expect(labels.length).toBeGreaterThan(0);
    labels.forEach((label) => expect(label.getAttribute('aria-hidden')).toBe('true'));
    expect(screen.getByRole('button', { name: '展开侧边栏' })).toBeTruthy();
    expect(screen.getByRole('status', { name: '服务正常' })).toBeTruthy();
    expect(sidebar.querySelector('.ready-dot')).toBeTruthy();
  });

  // it('keeps sidebar labels mounted across collapse so the tran
  it('keeps sidebar labels mounted across collapse so the transition does not snap', () => {
    const { rerender } = render(<WorkbenchShell {...baseProps} />);
    const homeLabel = screen.getByText('首页');

    rerender(<WorkbenchShell {...baseProps} navigation={{ ...navigation, sidebarCollapsed: true }} />);

    expect(document.body.contains(homeLabel)).toBe(true);
    expect(homeLabel.classList.contains('sidebar-label')).toBe(true);
    expect(homeLabel.getAttribute('aria-hidden')).toBe('true');
  });

  // it('keeps the sidebar toggle in the sidebar and changes its
  it('keeps the sidebar toggle in the sidebar and changes its accessible name', () => {
    const onToggleSidebar = vi.fn();
    const { rerender } = render(<WorkbenchShell {...baseProps} onToggleSidebar={onToggleSidebar} />);
    fireEvent.click(screen.getByRole('button', { name: '收起侧边栏' }));
    expect(onToggleSidebar).toHaveBeenCalledTimes(1);

    rerender(<WorkbenchShell {...baseProps} onToggleSidebar={onToggleSidebar} navigation={{ ...navigation, sidebarCollapsed: true }} />);
    expect(screen.getByRole('complementary').contains(screen.getByRole('button', { name: '展开侧边栏' }))).toBe(true);
  });

  // it('exposes the shell controls in a usable keyboard order',
  it('exposes the shell controls in a usable keyboard order', async () => {
    const onToggleSidebar = vi.fn();
    render(<WorkbenchShell {...baseProps} onToggleSidebar={onToggleSidebar} />);
    const user = userEvent.setup();

    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: '新建提炼' }));
    for (const name of ['首页', '笔记库', 'AI 问答', '历史任务', '设置', '收起侧边栏']) {
      await user.tab();
      expect(document.activeElement).toBe(screen.getByRole('button', { name }));
    }
    await user.keyboard('{Enter}');
    expect(onToggleSidebar).toHaveBeenCalledTimes(1);
  });
});
