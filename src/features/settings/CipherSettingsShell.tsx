/**
 * CipherSettingsShell.tsx — 设置页面的"外壳"组件
 *
 * ===== 文件级别 =====
 *   本文件属于"前端 features/settings 层"，是一个 React 函数组件。
 *   它负责渲染"设置"页面的外层结构：一个顶部选项卡导航 + 内容区域。
 *
 *   调用方：src/features/settings/SettingsEntry.tsx
 *          （它在判断实现版本后，将整个 props 对象传给本组件）
 *
 *   依赖关系：
 *     - 从 @gravity-ui/icons 导入 SVG 图标（用于选项卡标签）
 *     - 从 @heroui/react 导入 ScrollShadow（滚动容器、隐藏滚动条）和 Tabs（选项卡）
 *     - 从 ./tabs/ 导入五个子页面组件（AppearanceTab 等）
 *     - 从 ./settingsTypes 导入 SettingsEntryProps（描述本组件接收的 props 形状）
 *     - 导入三个 CSS 文件用于样式
 *
 * ===== React 组件是什么（C/C++ 开发者的视角） =====
 *   React 组件"看起来"像一个函数，但它不是普通的 C 函数。
 *
 *   本质：组件是一个"输入 props → 输出界面描述"的纯函数概念。
 *   但实践中它有 state（状态）、effects（副作用）等。
 *
 *   关键反直觉事实：
 *     - 组件函数不会只执行一次。每当 props 或内部 state 变化，
 *       React 就会"重新调用"这个函数，生成新的界面描述。
 *     - 这一点和 C 中的 main() 或普通函数完全不同。
 *     - C 中的函数被调用，执行完就结束了。React 组件会被重复调用多次，
 *       每次返回的东西可能不一样。
 *     - 返回的不是 HTML 字符串，而是 React 内部表示的"虚拟 DOM"，
 *       React 框架负责把这些虚拟描述变成真正的浏览器 DOM 操作。
 *
 *   props（类比）：props 是父组件传给子组件的"只读参数对象"。
 *     类似 C 函数接收一个 const struct* 参数：
 *       - 子组件可以读取 props 的任意字段
 *       - 子组件不应该修改 props（React 要求 props 只读）
 *       - 每次渲染时，组件都收到一份新的 props（可能和上次不同）
 *     不同于 C++ 构造函数：构造函数只调用一次，props 每次渲染都可能不同。
 *
 *   JSX：文件中的 HTML 样标签（<div>、<Tabs> 等）不是真正的 HTML。
 *     JSX 是 TypeScript 的语法扩展，编译后变成 JavaScript 函数调用：
 *       例如 <Tabs ...> 编译后变成 React.createElement(Tabs, ...)
 *     React 通过这些函数调用创建"虚拟 DOM 元素"，最终更新浏览器 DOM。
 *
 *   大写标签 vs 小写标签：
 *     - 大写开头（如 <Tabs>、<ScrollShadow>）：表示 React 组件
 *     - 小写开头（如 <div>、<span>）：表示原生 DOM 元素
 *
 * ===== 本文件的组件树结构 =====
 *   SettingsEntry
 *     └─ CipherSettingsShell            ← 本文件
 *          ├─ <Tabs>                     ← HeroUI 第三方组件
 *          │    ├─ Tab("外观")
 *          │    ├─ Tab("语音转文字")
 *          │    ├─ Tab("AI 接入")
 *          │    ├─ Tab("数据管理")
 *          │    └─ Tab("关于")
 *          └─ <ScrollShadow>
 *               ├─ AppearanceTab         ← 根据 activeTab 条件渲染
 *               ├─ TranscriptionTab
 *               ├─ AiAccessTab
 *               ├─ DataManagementTab
 *               └─ AboutTab
 *
 * ===== 渲染流程（用户点了一个选项卡后发生了什么） =====
 *   1. 用户点击选项卡 → HeroUI Tabs 组件内部更新选中状态
 *   2. onSelectionChange 回调被调用 → 执行 selectTab()
 *   3. selectTab() 调用 props.onSelectSection() —— 通知父组件"用户选了新页面"
 *   4. 父组件（SettingsEntry / App）更新它的 state
 *   5. state 变化触发重新渲染 → SettingsEntry 把新的 props.section 传给本组件
 *   6. 本组件函数被重新调用 → activeTab 变了 → 条件渲染显示新的子页面
 *
 *   注意：选项卡切换不是"直接显示/隐藏 div"。
 *         它经历了"事件回调 → 状态变化 → 重新渲染"的完整 React 循环。
 *
 * ===== 阅读顺序建议 =====
 *   1. 先看 tabs 常量数组（第 18-24 行）——理解五个选项卡的定义
 *   2. 看函数签名（第 27 行）——理解 props 的类型
 *   3. 看 return 中的 <Tabs> 区域（第 33-45 行）——理解选项卡的渲染
 *   4. 看条件渲染区域（第 47-52 行）——理解如何根据 activeTab 显示对应页面
 */

import { CircleInfo, HardDrive, Microphone, Palette, Sparkles } from '@gravity-ui/icons';
// 从重力 UI 图标库导入五个 SVG 图标组件

import { ScrollShadow, Tabs, type Key } from '@heroui/react';
import { useEffect, useState } from 'react';
// ScrollShadow：可滚动容器，自带边缘淡出阴影效果，隐藏滚动条
// Tabs：选项卡组件（类似浏览器标签页），管理"选哪个/显示哪个"的逻辑
// type Key：Tabs 组件的选中键类型（实际是 string | number）

import AppearanceTab from './tabs/AppearanceTab';
import TranscriptionTab from './tabs/TranscriptionTab';
import AiAccessTab from './tabs/AiAccessTab';
import DataManagementTab from './tabs/DataManagementTab';
import AboutTab from './tabs/AboutTab';
// 五个设置子页面——每个都是一个独立的 React 函数组件

import type { SettingsEntryProps } from './settingsTypes';
// SettingsEntryProps：描述本组件接收的 props（参数）的类型
// 包含 section（当前选中的选项卡）、theme（颜色主题）、
// 以及各种事件回调（onSelectSection、onReturn 等）

import type { CipherSettingsPageId } from './sourceManifest';
// CipherSettingsPageId：选项卡 ID 的联合类型
// 值为 'appearance' | 'transcription' | 'ai' | 'data' | 'about'

import './styles/tailwind.css';
import './styles/settings.css';
import '../../styles/cipher-settings.css';
// 导入 CSS 样式文件。TS/React 中可以直接 import CSS——
// 构建工具（Vite）会把它们打包进最终产物。

/**
 * tabs 常量——定义了设置页面顶部五个选项卡的配置。
 *
 * Array<{ id: CipherSettingsPageId; label: string; icon: React.ElementType }>
 * 表示"一个数组，数组元素是包含 id、label、icon 三个字段的对象"。
 *
 * TS 泛型 Array<T> 类似 C++ 的 std::vector<T> 但它是类型层面的约束。
 */
const tabs: Array<{ id: CipherSettingsPageId; label: string; icon: React.ElementType }> = [
  { id: 'appearance', label: '外观', icon: Palette },
  { id: 'transcription', label: '语音转文字', icon: Microphone },
  { id: 'ai', label: 'AI 接入', icon: Sparkles },
  { id: 'data', label: '数据管理', icon: HardDrive },
  { id: 'about', label: '关于', icon: CircleInfo },
];

/**
 * CipherSettingsShell — 设置页面的外层容器和选项卡导航
 *
 * export default function：把本函数作为"默认导出"——
 * 其他文件 import 时可以自定义名称（不指定花括号内的名字）。
 * 类似 C 中只有一个 main 函数被链接器找到，但这里名字无所谓。
 *
 * 参数写法 ({ ... }: Type) 是 TS 的"解构赋值"：
 *   等价于先接收整个 props 对象，再从中提取需要的字段。
 *   类似 C 中 void f(struct S *p) { int x = p->x; }，
 *   但 TS 在参数位置就完成了提取。
 */
export default function CipherSettingsShell(props: SettingsEntryProps) {
  // 从 props 中读取"当前应该显示哪个选项卡"。
  // 为什么不是 state？因为这个信息由父组件管理，本组件只负责读取。
  const activeTab = props.section;
  const [mountedTabs, setMountedTabs] = useState<Set<CipherSettingsPageId>>(() => new Set([activeTab]));

  useEffect(() => {
    setMountedTabs((current) => {
      if (current.has(activeTab)) return current;
      const next = new Set(current);
      next.add(activeTab);
      return next;
    });
  }, [activeTab]);

  /**
   * selectTab：用户点击选项卡时的回调函数。
   *
   * (key: Key) => props.onSelectSection(String(key) as SettingsEntryProps['section'])
   *
   *   这是 TS 的"箭头函数"（类似 C 的 lambda）：
   *     (参数) => 返回值
   *     等价于 C++ 的 [](Key key) { return ...; }
   *
   *   String(key)：将 Key 类型转换为 string。
   *   as SettingsEntryProps['section']：TS 的"类型断言"——
   *     告诉编译器"我知道这个值是什么类型"，类似 C 的强制类型转换。
   */
  const selectTab = (key: Key) => {
    const nextTab = String(key) as SettingsEntryProps['section'];
    setMountedTabs((current) => current.has(nextTab) ? current : new Set(current).add(nextTab));
    props.onSelectSection(nextTab);
  };
  const activeTabLabel = tabs.find((tab) => tab.id === activeTab)?.label ?? '设置';

  /**
   * return 后面的 (...) 是 JSX——看起来像 HTML，但不是 HTML。
   * 它会被编译器转换为 React.createElement() 调用链。
   */
  return (
    // <div data-theme={props.theme}>  ：JSX 中用花括号 {} 嵌入 JS 表达式
    // data-theme 是一个 HTML 自定义属性，用于 CSS 切换深色/浅色主题
    <div className="cipher-settings-root settings-page" data-theme={props.theme} role="region" aria-label="设置工作区">
      <div className="settings-shell-layout">
        <header className="settings-page-header">
          <div className="settings-page-header-copy">
            <span className="workspace-eyebrow">SETTINGS</span>
            <h1>设置</h1>
            <p>管理外观、转写、AI 服务、数据与应用信息。</p>
          </div>
          <span className="settings-page-context">当前：{activeTabLabel}</span>
        </header>

        <nav className="settings-navigation-tabs" aria-label="设置分类导航">
          {/* Tabs：来自 HeroUI 的选项卡组件 */}
          {/* selectedKey 控制哪个选项卡是"选中状态" */}
          {/* onSelectionChange 是用户点击不同选项卡时触发的回调 */}
          <Tabs selectedKey={activeTab} onSelectionChange={selectTab} className="settings-tabs">
            <Tabs.ListContainer className="cipher-settings-primary-tab-container">
              {/* aria-label 是"无障碍标签"——屏幕阅读器用 */}
              <Tabs.List aria-label="设置分类" className="cipher-settings-primary-tab-list">
                {/* {tabs.map(...)}  ：JSX 中用花括号嵌入 JS 表达式 */}
                {/* .map() 对数组每个元素执行函数并返回新数组——类似 C 的循环 */}
                {tabs.map((tab) => (
                  // key={tab.id}：React 要求列表项有唯一 key，用于高效更新 DOM
                  <Tabs.Tab key={tab.id} id={tab.id} className="cipher-settings-primary-tab">
                    {/* tab.icon 是 SVG 组件，width/height 控制图标尺寸 */}
                    {/* aria-hidden 告诉屏幕阅读器忽略这个纯装饰元素 */}
                    <tab.icon width={17} height={17} aria-hidden />
                    {tab.label}
                  </Tabs.Tab>
                ))}
              </Tabs.List>
            </Tabs.ListContainer>
          </Tabs>
        </nav>

        {/* ScrollShadow：可滚动容器，内容超出窗口高度时自动出现滚动条 */}
        <ScrollShadow className="settings-body" hideScrollBar size={64}>
          {/* 条件渲染：activeTab === 'appearance' && <.../> */}
          {/* JS 中 && 是"逻辑与"——如果左边的条件为真，就渲染右边的组件 */}
          {/* 这不同于 C 中 && 只返回布尔值：JS 的 && 会返回最后一个"真"值 */}
          {/* {...props} 是 JS 的"展开运算符"——把 props 对象的每个字段展开为子组件的属性 */}
          {/* 类似 C 中手动写 prop1={props.prop1} prop2={props.prop2} ... 但更简洁 */}
          {mountedTabs.has('appearance') && (
            <div className="settings-tab-panel" hidden={activeTab !== 'appearance'} aria-hidden={activeTab !== 'appearance'}>
              <AppearanceTab {...props} />
            </div>
          )}
          {mountedTabs.has('transcription') && (
            <div className="settings-tab-panel" hidden={activeTab !== 'transcription'} aria-hidden={activeTab !== 'transcription'}>
              <TranscriptionTab {...props} />
            </div>
          )}
          {activeTab === 'ai' && <AiAccessTab {...props} />}
          {activeTab === 'data' && <DataManagementTab {...props} />}
          {activeTab === 'about' && <AboutTab {...props} />}
        </ScrollShadow>
      </div>
    </div>
  );
}
