/**
 * WorkbenchShell.tsx — 桌面应用的"外壳布局"组件
 *
 * ===== 文件级别 =====
 *   本文件属于"前端主组件层"——它是 App.tsx 之下最顶层的布局组件。
 *   它不做业务逻辑，只负责"结构"：左侧侧栏 + 右侧内容区。
 *
 *   调用链：App.tsx → WorkbenchShell → 侧栏(WorkbenchSidebar) + 内容区(children)
 *
 * ===== 核心职责 =====
 *   1. 渲染左侧导航侧栏（Logo、导航按钮、服务状态、设置按钮）
 *   2. 渲染内容区域（由 App.tsx 传入的 children——即当前页面的组件）
 *   3. 检测是否运行在 Tauri 桌面环境中（如果是，显示窗口控制按钮）
 *   4. 管理侧栏折叠/展开状态（通过 prop 传递或本地 state）
 *
 * ===== C/C++ 类比 =====
 *   这个组件相当于你的"主窗口 WndProc + 布局代码"：
 *     - 侧栏类似一个停靠在左边的面板
 *     - 内容区类似客户区（client area）
 *     - 窗口控制按钮类似标题栏上的最小化/最大化/关闭按钮
 *   不同之处：CSS 负责布局，不是 Win32 的 RECT + SetWindowPos。
 *
 * ===== 阅读顺序 =====
 *   1. isTauriEnv() 函数——理解代码如何判断运行环境
 *   2. WorkbenchShell 组件——理解整体布局的 JSX 结构
 *   3. 各子组件（WorkbenchSidebar、WindowControls）
 */

import { type ReactNode, useState } from 'react';
// type ReactNode：TS 的"类型导入"——表示任何可以渲染的 React 节点的类型
import type { PrimaryWorkbenchView, WorkbenchNavigationState } from '../lib/workbenchNavigation';
import WorkbenchSidebar from './WorkbenchSidebar';
import WindowControls from './WindowControls';
import appLogo from '../assets/app-logo.png';

/**
 * isTauriEnv：检测当前代码是否运行在 Tauri 桌面环境（而非浏览器中）。
 *
 * 原理：Tauri 会在 window 对象上注入一个全局变量 __TAURI_INTERNALS__。
 *       如果这个变量存在，说明在 Tauri 桌面窗口中运行；
 *       如果不存在（如 Vite dev server 的浏览器），说明不是桌面环境。
 *
 * 类比 C：类似用 #ifdef WIN32 或 dlsym 检查某个符号是否存在。
 *   但这里是在运行时动态检测，不是在编译期。
 *   try/catch 包裹 windows 访问是小心的——某些 SSR（服务端渲染）
 *   环境可能根本没有 window 对象。
 */
function isTauriEnv() {
  try {
    return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
  } catch {
    return false;
  }
}

/**
 * WorkbenchServiceStatus：描述一个服务的就绪状态。
 *   ready  → 服务是否可用
 *   detail → 描述文字（如"腾讯云极速版 · 16k_zh 就绪"）
 */
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

/** WorkbenchShell */
export default function WorkbenchShell({ navigation, onNavigate, onOpenSettings = () => {}, onToggleSidebar, serviceStatus = { ready: false, detail: '正在检查服务' }, theme, children }: Props) {
  const [tauri] = useState(() => isTauriEnv());

  return (
    <>
      {tauri && (
        <div className={`window-top-bar theme-${theme}`} data-theme={theme} data-tauri-drag-region="deep">
          <div className="window-title-identity" aria-label="VedioNotes 应用标题" data-tauri-drag-region="deep">
            <img src={appLogo} alt="VedioNotes" className="window-title-mark" aria-hidden="true" />
            <strong className="window-title-name">VedioNotes</strong>
          </div>
          <div className="window-drag-spacer" data-tauri-drag-region="deep" />
          <WindowControls />
        </div>
      )}
      <div className={`app-container workbench-app concept-workbench theme-${theme} view-${navigation.view}${navigation.sidebarCollapsed ? ' sidebar-collapsed' : ''}${tauri ? ' is-tauri' : ''}`} data-theme={theme}>
        <WorkbenchSidebar navigation={navigation} onNavigate={onNavigate} onOpenSettings={onOpenSettings} onToggleSidebar={onToggleSidebar} serviceStatus={serviceStatus} />
        <div className="workbench-content">
          <main className="app-main">{children}</main>
        </div>
      </div>
    </>
  );
}
