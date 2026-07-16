import type { WorkbenchView } from './workbenchNavigation';

export type CapabilityMapping = {
  id: string;
  route: WorkbenchView;
  control: string;
  handler: string;
  bridge: string;
  service: string;
  effect: string;
  failure: string;
  tests: readonly string[];
};

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
  effect: `route:${route}`,
  failure: 'No external failure; the reducer accepts only typed routes.',
  tests: ['src/lib/workbenchNavigation.test.ts', 'src/components/WorkbenchShell.test.tsx'],
});
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

export const capabilityContract: readonly CapabilityMapping[] = [
  navigationMapping('shell-home', 'home', '打开首页'),
  navigationMapping('shell-create', 'create', '打开新建提炼'),
  navigationMapping('shell-library', 'library', '打开笔记库'),
  navigationMapping('shell-qa', 'qa', '打开 AI 问答'),
  navigationMapping('shell-tasks', 'tasks', '打开历史任务'),
  {
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
  settingsMapping('settings-appearance', '外观设置', 'save_appearance_preferences', 'preferences.appearance', 'persist:theme,density,reducedMotion', ['src/components/settings/AppearanceSettings.tsx', 'src/components/SettingsWorkspace.test.tsx']),
  settingsMapping('settings-transcription', '语音转文字设置', 'set_transcription_preferences', 'preferences.transcription', 'select:cpu,gpu,online', ['src/components/SettingsWorkspace.test.tsx']),
  settingsMapping('settings-ai', 'AI 接入设置', 'get_capability_settings', 'capability_store', 'configure:llm,vector,rerank,web,tts,image,agent', ['src/components/settings/AiCapabilities.test.tsx']),
  settingsMapping('settings-data', '数据管理设置', 'get_cache_usage', 'data_management', 'manage:export,cache,connections,logs', ['src/components/settings/DataManagementSettings.test.tsx']),
  settingsMapping('settings-about', '关于与目录', 'get_about_snapshot', 'data_management.about_snapshot', 'inspect:versions,paths', ['src/components/settings/AboutSettings.tsx']),
  settingsMapping('sensevoice-status', '读取 SenseVoice 状态', 'get_sensevoice_status', 'sensevoice_models.status', 'render:missing,partial,ready,failed', ['src/components/SenseVoiceManager.test.tsx']),
  settingsMapping('sensevoice-download', '下载 SenseVoice', 'download_sensevoice', 'sensevoice_models.download', 'download:selectedModel', ['src/components/SenseVoiceManager.test.tsx']),
  settingsMapping('sensevoice-cancel', '取消 SenseVoice 下载', 'cancel_sensevoice_download', 'sensevoice_models.cancel', 'cancel:activeDownload', ['src/components/SenseVoiceManager.test.tsx']),
  settingsMapping('sensevoice-delete', '删除 SenseVoice', 'delete_sensevoice', 'sensevoice_models.delete', 'delete:managedModel', ['src/components/SenseVoiceManager.test.tsx']),
  settingsMapping('sensevoice-model', '选择 SenseVoice 模型', 'set_sensevoice_model', 'sensevoice_models.select', 'select:int8,float32', ['src/components/SenseVoiceManager.test.tsx']),
  settingsMapping('ai-vector', '向量服务', 'save_vector_config', 'capability_store.vector', 'save-and-test:vector', ['src/components/settings/AiCapabilities.test.tsx']),
  settingsMapping('ai-rerank', '重排服务', 'save_rerank_config', 'capability_store.rerank', 'save-and-test:rerank', ['src/components/settings/AiCapabilities.test.tsx']),
  settingsMapping('ai-web-search', '联网搜索服务', 'save_web_search_config', 'capability_store.web_search', 'save-and-test:web', ['src/components/settings/AiCapabilities.test.tsx']),
  settingsMapping('ai-tts', '语音合成服务', 'save_tts_config', 'capability_store.tts', 'save-and-test:tts', ['src/components/settings/AiCapabilities.test.tsx']),
  settingsMapping('ai-image', '图像生成服务', 'save_image_config', 'capability_store.image', 'save-and-test:image', ['src/components/settings/AiCapabilities.test.tsx']),
  settingsMapping('ai-local-agent', '本地智能体', 'save_local_agent_config', 'capability_store.local_agent', 'save-test-detect:agent', ['src/components/settings/AiCapabilities.test.tsx']),
  settingsMapping('data-export', '导出设置', 'save_export_preferences', 'data_management.export', 'persist:markdown,html,text', ['src/components/settings/DataManagementSettings.test.tsx']),
  settingsMapping('data-cache', '缓存管理', 'clear_cache', 'data_management.cache', 'clear:fixedCategory', ['src/components/settings/DataManagementSettings.test.tsx']),
  settingsMapping('data-platform-connections', '平台连接', 'get_download_cookie_status', 'download_cookies.presence', 'manage:presenceOnly', ['src/components/DownloadSettings.test.tsx']),
  settingsMapping('data-logs', '日志管理', 'read_log', 'data_management.logs', 'read:validatedId,boundedTail', ['src/components/settings/DataManagementSettings.test.tsx']),
  settingsMapping('appearance-save', '保存外观设置', 'save_appearance_preferences', 'preferences.appearance', 'persist:appearance', ['src/components/settings/AppearanceSettings.tsx']),
  settingsMapping('about-open-paths', '打开应用目录与文档', 'open_app_data_directory', 'data_management.open_fixed_path', 'open:appData,exports,logs,docs', ['src/components/settings/AboutSettings.tsx']),] as const;

