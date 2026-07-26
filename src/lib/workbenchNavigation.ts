/**
 * workbenchNavigation.ts — 工作台导航状态机
 *
 * ===== 文件级别 =====
 *   本文件属于"前端 lib 层"，定义了整个应用的页面导航逻辑。
 *   它完全是纯数据和纯函数，不包含任何 UI 代码。
 *
 *   导入方：App.tsx（作为全局状态管理的一部分）、
 *           WorkbenchShell.tsx（读取当前视图决定显示什么）、
 *           以及各个 React 组件。
 *
 * ===== C/C++ 开发者的视角 =====
 *   这个文件做的事情，本质上就是 C 中的"有限状态机 + 枚举"。
 *   但 TypeScript 的实现方式不同：
 *
 *   在 C 中，你会这样写：
 *     typedef enum { HOME, CREATE, ... } View;
 *     View currentView = CREATE;
 *     void openView(View v) { currentView = v; }
 *
 *   在 TypeScript/React 中，你不能直接修改一个全局变量——因为
 *   React 需要知道状态变了才能重新渲染。所以这里用了一个"reducer"模式：
 *     状态(state) + 动作(action) → 新状态(new state)
 *   类似于 C 的信号处理：收到一个事件，计算出新的系统状态。
 *
 * ===== 阅读顺序 =====
 *   1. WorkbenchView（应用有哪些页面）
 *   2. WorkbenchNavigationState（当前"在哪里"的完整描述）
 *   3. WorkbenchNavigationAction（用户可以做哪些操作）
 *   4. workbenchNavigationReducer（收到操作后如何计算新状态）
 *   5. initialWorkbenchNavigationState（初始状态）
 */

// ---- 页面/视图的枚举定义 ----

/**
 * WorkbenchView：应用目前显示哪一个"工作区页面"。
 *
 * 这是 TS 的 `type`——定义了一组命名的可选字符串值。
 * 类比 C 的 enum，但更灵活：值就是字符串本身，不需要映射到整数。
 *
 * 注意 TS 的 type 编译后会被擦除——运行时你只是个字符串。
 */
export type WorkbenchView = 'home' | 'create' | 'progress' | 'result' | 'library' | 'qa' | 'tasks' | 'settings';

/**
 * SettingsSection：在"设置"页面内部，用户选中的是哪个子页面。
 */
export type SettingsSection = 'appearance' | 'transcription' | 'ai' | 'data' | 'about';

/**
 * NonSettingsWorkbenchView：除了"设置"之外的所有页面。
 *
 * Exclude<WorkbenchView, 'settings'> 是 TS 的"类型工具"：
 *   从 WorkbenchView 的所有取值中排除 'settings'，
 *   得到一个不包含 'settings' 的新类型。
 *
 *   类比 C：如果你有一个 enum 定义，这个操作相当于
 *   用预处理器宏剔除一个枚举值——但 TS 是在类型层面做的。
 */
export type NonSettingsWorkbenchView = Exclude<WorkbenchView, 'settings'>;

/**
 * PrimaryWorkbenchView：主要的几个工作区页面。
 *
 * Extract<WorkbenchView, 'home' | 'create' | ...> 是 TS 的类型工具：
 *   从 WorkbenchView 中只取出列出的那几个值。
 *   效果上相当于"限制只能去这几个页面"的类型约束。
 */
export type PrimaryWorkbenchView = Extract<WorkbenchView, 'home' | 'create' | 'library' | 'qa' | 'tasks'>;

// ---- 状态（state）的定义 ----

/**
 * WorkbenchNavigationState：完整的导航状态——描述"用户现在在哪个页面"。
 *
 * 类比 C 的结构体：
 *   typedef struct {
 *     View view;              // 当前页面
 *     SettingsSection sec;    // 设置页内选中的子页面
 *     View returnView;        // "返回"时回到哪里
 *     bool sidebarCollapsed;  // 侧栏是否折叠
 *   } NavState;
 *
 * TS 的 interface 类似 C 的 struct 声明，但：
 *   - 没有构造函数、没有方法
 *   - 字段之间用 `;` 分隔（和 C 不同，TS 中逗号也可以）
 *   - 编译后类型被擦除，只是一个普通 JS 对象
 */
export type WorkbenchNavigationState = {
  view: WorkbenchView;                        // 当前显示哪个页面
  settingsSection: SettingsSection;            // 设置页内的子页面
  returnView: NonSettingsWorkbenchView;         // 从设置返回时回到哪个页面
  sidebarCollapsed: boolean;                   // 侧栏是否折叠
};

// ---- 动作（action）的定义 ----

/**
 * WorkbenchNavigationAction：用户触发的操作。
 *
 * 注意这里的 `|` 不是"数值的或"，而是"类型层面的或"——
 * 这个 action 可以是以下五种对象中任意一种。
 *
 * 每个对象都有一个 `type` 字段作为"判别标记"，
 * TS 编译器会根据 type 的值自动推导其他字段的存在——
 * 这叫"可辨识联合类型"（discriminated union）。
 *
 * 类比 C：类似用一个 union + enum tag 来区分不同消息类型，
 *   但 TS 的版本是类型安全的——编译器会检查 switch 是否覆盖了所有分支。
 */
export type WorkbenchNavigationAction =
  | { type: 'open-view'; view: NonSettingsWorkbenchView }
  | { type: 'open-settings'; section?: SettingsSection }        // section 可省略（`?` 可选）
  | { type: 'select-settings-section'; section: SettingsSection }
  | { type: 'return-from-settings' }
  | { type: 'toggle-sidebar' };

// ---- 初始状态 ----

/**
 * 应用启动时的默认导航状态。
 *
 * 应用打开后默认显示"创建"页面，设置页默认选"语音转文字"。
 * 类比 C 中初始化全局结构体。
 */
export const initialWorkbenchNavigationState: WorkbenchNavigationState = {
  view: 'create',
  settingsSection: 'transcription',
  returnView: 'create',
  sidebarCollapsed: false,
};

// ---- 辅助函数 ----

/**
 * safeReturnView：确保 returnView 的值是合法的。
 *
 * 当用户在"设置"页面内部切换后关闭设置，returnView 确保回到一个合法页面，
 * 不会回到另一个"设置"页面。
 *
 * WorkbenchNavigationState['returnView'] 是 TS 的"索引访问类型"——
 * 表示"从 WorkbenchNavigationState 类型中取出 returnView 字段的类型"。
 * 类似 C++ 的 decltype(NavState::returnView)。
 */
const safeReturnView = (view: WorkbenchNavigationState['returnView']): NonSettingsWorkbenchView => (
  view === 'home' || view === 'create' || view === 'progress' || view === 'result' || view === 'library' || view === 'qa' || view === 'tasks'
    ? view
    : 'create'  // 兜底：如果 view 的值不在合法范围内，默认回到 create
);

// ---- reducer（状态更新函数） ----

/**
 * workbenchNavigationReducer —— 导航状态机的"转换函数"。
 *
 * 这是整个导航系统的核心。它接收"当前状态"和"用户操作"，
 * 计算出新的状态并返回。
 *
 * 函数签名： (state, action) → newState
 * 这是 React 中常见的"Reducer"模式（类似 Redux）。
 *
 * 类比 C：类似一个大的 switch 语句处理不同的消息类型，
 *   但这里的关键区别是——不修改传入的 state，而是返回一个全新的对象。
 *
 *   在 C 中常见：state->view = newView;  // 直接修改
 *   在 React 中：return { ...state, view: newView };  // 返回新对象
 *
 * `...state` 是 JS/TS 的"展开运算符"——
 * 它把 state 对象的所有字段复制到新对象中，然后你可以覆盖部分字段。
 * 这保证了"不可变更新"——原对象不受影响，适合 React 的渲染检测。
 *
 * 为什么需要不可变更新？
 *   React 通过比较新旧对象的引用（=== 比较）来判断是否需要重新渲染。
 *   如果直接修改原对象，引用不变，React 认为状态没变，就不重新渲染。
 *   所以每次状态变化都必须返回一个全新的对象。
 */
export function workbenchNavigationReducer(
  state: WorkbenchNavigationState,
  action: WorkbenchNavigationAction,
): WorkbenchNavigationState {

  // TS 的 switch 和 C 的 switch 语法几乎一样。
  // 编译器会检查 action.type 的判别联合是否覆盖了所有分支。
  switch (action.type) {
    // 用户点击了侧栏中的一个导航按钮（如"首页"）
    case 'open-view':
      // `...state, view: ..., returnView: ...` ：
      //   复制 state 的所有字段，覆盖 view 和 returnView。
      //   returnView 记录"用户是从哪个页面切换到设置的"——用于"返回"。
      return { ...state, view: action.view, returnView: action.view };

    // 用户点击了侧栏的"设置"按钮
    case 'open-settings':
      return {
        ...state,
        view: 'settings',
        // `action.section ?? 'transcription'` ：
        //   `??` 是 TS 的"空值合并运算符"——
        //   如果 section 不是 null/undefined 就用它，否则用 'transcription'。
        settingsSection: action.section ?? 'transcription',
        // 如果当前已经在设置页，不要更新 returnView（保持原来的返回目标）
        // 否则记录当前的 view 作为返回目标
        returnView: state.view === 'settings'
          ? safeReturnView(state.returnView)
          : state.view,
      };

    // 用户在设置页内部切换了子页面
    case 'select-settings-section':
      return { ...state, settingsSection: action.section };

    // 用户从设置页返回主工作区
    case 'return-from-settings': {
      // 使用 safeReturnView 确保 returnView 合法
      const view = safeReturnView(state.returnView);
      return { ...state, view, returnView: view };
    }

    // 用户切换侧栏折叠/展开
    case 'toggle-sidebar':
      // `!state.sidebarCollapsed` 取反——切换布尔值
      return { ...state, sidebarCollapsed: !state.sidebarCollapsed };
  }
  // 没有 default 分支——TS 编译器利用判别联合类型确保所有 case 被覆盖。
  // 如果漏了某个 action.type，编译器会报错（这是 TS 类型安全的好处）。
}
