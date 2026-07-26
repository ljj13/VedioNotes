/**
 * capabilityContract.ts — AI 能力契约清单
 *
 * ===== 文件级别 =====
 *   本文件不属于"可执行代码"——它是一个静态的"规格表"。
 *   它列出了应用中所有从前端→后端的交互操作，用于验证
 *   前端和后端的接口是否一致。
 *
 *   类比 C：类似一个手工维护的"API 文档表"或"接口契约清单"，
 *   供静态分析脚本（tests/static/complete-workbench-capabilities.test.mjs）
 *   在构建后检查所有能力是否完整实现。
 *
 * ===== 阅读顺序 =====
 *   1. CapabilityMapping（定义一条"能力"的表结构）
 *   2. navigationMapping / settingsMapping（生成记录的辅助函数）
 *   3. capabilityContract（最终的完整清单——实际被验证的部分）
 */

import type { WorkbenchView } from './workbenchNavigation';

/** 一条能力映射——记录一个"从用户操作→后端处理→产生效果"的完整链路 */
export type CapabilityMapping = {
  id: string;
  route: WorkbenchView;       // 在哪个页面触发
  control: string;             // 用户的交互控件是什么
  handler: string;             // 哪个 React 组件处理
  bridge: string;              // 通过桥接层的哪个函数
  service: string;             // Rust 后端的哪个服务/模块
  effect: string;              // 产生的效果
  failure: string;             // 失败时的表现
  tests: readonly string[];    // 覆盖此能力的测试文件
};

/**
 * navigationMapping：为"导航操作"生成一条能力记录。
 *
 * 箭头函数 `(id, route, control) => ({ ... })` ：
 *   (参数) => ({ ... }) 是一个返回对象的箭头函数。
 *   为什么是 `({ ... })` 而不是 `{ ... }`？
 *     因为 `{}` 默认被解析为函数体，不是对象字面量。
 *     加 `()` 包裹告诉 TS 这是一次性返回对象。
 */
const navigationMapping = (
  id: string,
  route: WorkbenchView,
  control: string,
): CapabilityMapping => ({
  id,
  route,
  control,
  handler: 'WorkbenchSidebar.onNavigate',
  bridge: 'local:workbenchNavigationReducer',
  service: 'workbenchNavigationReducer',
  effect: `route:${route}`, // 模板字符串：`route:${route}` → "route:home" 等
  failure: 'No external failure; the reducer accepts only typed routes.',
  tests: ['src/lib/workbenchNavigation.test.ts', 'src/components/WorkbenchShell.test.tsx'],
});

/**
 * settingsMapping：为"设置页中的操作"生成一条能力记录。
 * route 固定为 'settings'，其余字段由调用方指定。
 */
const settingsMapping = (
  id: string,
  control: string,
  bridge: string,
  service: string,
  effect: string,
  tests: readonly string[],
): CapabilityMapping => ({
  id,
  route: 'settings',
  control,
  handler: `SettingsWorkspace:${id}`,
  bridge,
  service,
  effect,
  failure: 'The control keeps its previous value and renders the normalized backend error.',
  tests,
});

/**
 * capabilityContract：完整的"能力清单"。
 *
 * `readonly CapabilityMapping[]` 表示一个只读数组——元素不可修改。
 * 这里的每个元素代表"应用中的一项功能"。
 * 静态检查脚本会读取这个清单，验证每个 bridge/service/effect 是否存在。
 */
export const capabilityContract: readonly CapabilityMapping[] = [
  // ---- 导航能力 ----
  navigationMapping('shell-home', 'home', '打开首页'),
  navigationMapping('shell-create', 'create', '打开新建提炼'),
  navigationMapping('shell-library', 'library', '打开笔记库'),
  navigationMapping('shell-qa', 'qa', '打开 AI 问答'),
  navigationMapping('shell-tasks', 'tasks', '打开历史任务'),
  {
    // `...navigationMapping(...)` —— 展开运算符复制前一个对象的所有字段，
    // 然后覆盖 handler 和 effect。
    ...navigationMapping('shell-settings', 'settings', '打开设置'),
    handler: 'WorkbenchSidebar.onOpenSettings',
    effect: 'route:settings;section:transcription',
  },
  {
    id: 'shell-sidebar-toggle',
    route: 'home',
    control: '折叠或展开侧边栏',
    handler: 'WorkbenchSidebar.onToggleSidebar',
    bridge: 'local:workbenchNavigationReducer',
    service: 'workbenchNavigationReducer',
    effect: 'toggle:sidebarCollapsed',
    failure: 'No external failure; labels remain mounted and accessible.',
    tests: ['src/lib/workbenchNavigation.test.ts', 'src/components/WorkbenchShell.test.tsx'],
  },
  // ---- 设置页中的各项能力 ----
  settingsMapping('settings-appearance', '外观设置', 'save_appearance_preferences', 'preferences.appearance', 'persist:theme,density,reducedMotion', ['src/components/settings/AppearanceSettings.tsx', 'src/components/SettingsWorkspace.test.tsx']),
  settingsMapping('settings-transcription', '语音转文字设置', 'set_transcription_preferences', 'preferences.transcription', 'select:cpu,gpu,online', ['src/components/SettingsWorkspace.test.tsx']),
  settingsMapping('settings-ai', 'AI 接入设置', 'get_capability_settings', 'capability_store', 'configure:llm,vector,rerank,web,tts,image,agent', ['src/components/settings/AiCapabilities.test.tsx']),
  settingsMapping('settings-data', '数据管理设置', 'get_cache_usage', 'data_management', 'manage:export,cache,connections,logs', ['src/components/settings/DataManagementSettings.test.tsx']),
  settingsMapping('settings-about', '关于', 'get_about_snapshot', 'about', 'display:version,components,paths', ['src/components/settings/DataManagementSettings.test.tsx']),
  settingsMapping('sensevoice-status', '读取 SenseVoice 状态', 'get_sensevoice_status', 'sensevoice_models', 'read:model-status', ['src/components/SenseVoiceManager.test.tsx']),
  settingsMapping('sensevoice-download', '下载 SenseVoice 模型', 'download_sensevoice', 'sensevoice_models', 'download:model', ['src/components/SenseVoiceManager.test.tsx']),
  settingsMapping('sensevoice-cancel', '取消 SenseVoice 下载', 'cancel_sensevoice_download', 'sensevoice_models', 'cancel:model-download', ['src/components/SenseVoiceManager.test.tsx']),
  settingsMapping('sensevoice-delete', '删除 SenseVoice 模型', 'delete_sensevoice', 'sensevoice_models', 'delete:model', ['src/components/SenseVoiceManager.test.tsx']),
  settingsMapping('sensevoice-model', '选择 SenseVoice 模型', 'set_sensevoice_model', 'preferences.transcription', 'select:sensevoice-model', ['src/components/SenseVoiceManager.test.tsx']),
  settingsMapping('ai-vector', '向量能力', 'save_vector_config', 'capability_store', 'configure:vector', ['src/features/settings/tabs/AiAccessTab.test.tsx']),
  settingsMapping('ai-rerank', '重排能力', 'save_rerank_config', 'capability_store', 'configure:rerank', ['src/features/settings/tabs/AiAccessTab.test.tsx']),
  settingsMapping('ai-web-search', '联网检索能力', 'save_web_search_config', 'capability_store', 'configure:web-search', ['src/features/settings/tabs/AiAccessTab.test.tsx']),
  settingsMapping('ai-tts', '语音合成能力', 'save_tts_config', 'capability_store', 'configure:tts', ['src/features/settings/tabs/AiAccessTab.test.tsx']),
  settingsMapping('ai-image', '图片生成能力', 'save_image_config', 'capability_store', 'configure:image', ['src/features/settings/tabs/AiAccessTab.test.tsx']),
  settingsMapping('ai-local-agent', '本地智能体能力', 'save_local_agent_config', 'capability_store', 'configure:local-agent', ['src/features/settings/tabs/AiAccessTab.test.tsx']),
  settingsMapping('data-export', '导出偏好', 'save_export_preferences', 'preferences.export', 'persist:export', ['src/features/settings/tabs/DataManagementTab.test.tsx']),
  settingsMapping('data-cache', '缓存管理', 'clear_cache', 'data_management', 'manage:cache', ['src/features/settings/tabs/DataManagementTab.test.tsx']),
  settingsMapping('data-platform-connections', '平台连接', 'get_download_cookie_status', 'download_cookies', 'manage:platform-connections', ['src/components/DownloadSettings.test.tsx']),
  settingsMapping('data-logs', '日志管理', 'list_logs', 'data_management', 'manage:logs', ['src/features/settings/tabs/DataManagementTab.test.tsx']),
  settingsMapping('appearance-save', '保存外观', 'save_appearance_preferences', 'preferences.appearance', 'persist:appearance', ['src/features/settings/tabs/AppearanceTab.test.tsx']),
  settingsMapping('about-open-paths', '打开应用目录', 'open_app_data_directory', 'about', 'open:app-paths', ['src/features/settings/tabs/AboutTab.test.tsx']),
];
