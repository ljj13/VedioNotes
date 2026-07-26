/** complete-workbench-capabilities.test 测试 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const has = (source, token, message) => assert.ok(source.includes(token), message);

const sources = {
  navigation: read('src/lib/workbenchNavigation.ts'),
  contract: read('src/lib/capabilityContract.ts'),
  types: read('src/lib/types.ts'),
  bridge: read('src/lib/bridge.ts'),
  app: read('src/App.tsx'),
  sidebar: read('src/components/WorkbenchSidebar.tsx'),
  settings: read('src/components/SettingsWorkspace.tsx'),
  aiSettings: read('src/components/settings/AiAccessSettings.tsx'),
  dataSettings: read('src/components/settings/DataManagementSettings.tsx'),
  senseVoice: read('src/components/SenseVoiceManager.tsx'),
  styledSelect: read('src/components/StyledSelect.tsx'),
  searchableCombobox: read('src/components/SearchableCombobox.tsx'),
  profileEditor: read('src/components/ProfileEditor.tsx'),
  profileManager: read('src/components/ProfileManager.tsx'),
  downloadSettings: read('src/components/DownloadSettings.tsx'),
  appearanceSettings: read('src/components/settings/AppearanceSettings.tsx'),
  aboutSettings: read('src/components/settings/AboutSettings.tsx'),
  vectorSettings: read('src/components/settings/VectorSettings.tsx'),
  rerankSettings: read('src/components/settings/RerankSettings.tsx'),
  webSettings: read('src/components/settings/WebSearchSettings.tsx'),
  ttsSettings: read('src/components/settings/TtsSettings.tsx'),
  imageSettings: read('src/components/settings/ImageSettings.tsx'),
  agentSettings: read('src/components/settings/LocalAgentSettings.tsx'),
  library: read('src/components/LibraryWorkspace.tsx'),
  qa: read('src/components/QaWorkspace.tsx'),
  result: read('src/components/ResultWorkspace.tsx'),
  taskHistory: read('src/components/TaskHistoryWorkspace.tsx'),
  rustRegistration: read('src-tauri/src/lib.rs'),
  rustCommands: read('src-tauri/src/commands.rs'),
  credentialStore: read('src-tauri/src/credential_store.rs'),
  cookieStore: read('src-tauri/src/download_cookies.rs'),
  dataManagement: read('src-tauri/src/data_management.rs'),
  capabilityStore: read('src-tauri/src/capability_store.rs'),
  aiCapabilities: read('src-tauri/src/ai_capabilities.rs'),
};

for (const route of ['home', 'create', 'progress', 'result', 'library', 'qa', 'tasks', 'settings']) {
  assert.match(sources.navigation, new RegExp(`['"]${route}['"]`), `navigation declares ${route}`);
}
const componentToCheck = [
  'HomeWorkspace', 'CreateWorkspace', 'ProgressWorkspace', 'ResultWorkspace', 'LibraryWorkspace', 'QaWorkspace', 'TaskHistoryWorkspace', 'SettingsEntry',
];
for (const component of componentToCheck) {
  has(sources.app, component, `App mounts the real ${component}`);
}
for (const label of ['首页', '新建提炼', '笔记库', 'AI 问答', '历史任务', '设置']) {
  has(sources.sidebar, label, `sidebar renders ${label}`);
}
assert.doesNotMatch(sources.sidebar, /sidebar-brand|workspace-profile|本地工作区|隐私模式/, 'sidebar omits the removed brand and local workspace containers');
has(sources.sidebar, '服务正常', 'sidebar renders real service readiness copy');

const expectedContractIds = [
  'settings-appearance', 'settings-transcription', 'settings-ai', 'settings-data', 'settings-about',
  'sensevoice-status', 'sensevoice-download', 'sensevoice-cancel', 'sensevoice-delete', 'sensevoice-model',
  'ai-vector', 'ai-rerank', 'ai-web-search', 'ai-tts', 'ai-image', 'ai-local-agent',
  'data-export', 'data-cache', 'data-platform-connections', 'data-logs', 'appearance-save', 'about-open-paths',
];
for (const id of expectedContractIds) {
  assert.match(sources.contract, new RegExp(`['"]${escapeRegExp(id)}['"]`), `capability contract maps ${id}`);
}
assert.match(sources.contract, /workbenchNavigationReducer/, 'shell interactions map to the real navigation reducer');
assert.doesNotMatch(sources.contract, /prototype|preview|todo|coming soon|not implemented|敬请期待|暂未实现/i, 'capability rows contain no placeholder implementation');

for (const label of ['外观', '语音转文字', 'AI 接入', '数据管理', '关于', 'CPU 模式', 'GPU 模式', '在线模式']) {
  has(sources.settings, label, `Settings exposes ${label}`);
}
for (const label of ['大模型', '向量', '重排', '联网', '语音', '作图', '本地智能体']) {
  has(sources.aiSettings, label, `AI Access exposes ${label}`);
}
for (const label of ['导出设置', '缓存管理', '平台连接', '日志管理']) {
  has(sources.dataSettings, label, `Data Management exposes ${label}`);
}
for (const state of ["'ready'", "'partial'", "'failed'", "'missing'", '已就绪', '可继续下载', '下载失败', '未安装']) {
  has(sources.senseVoice, state, `SenseVoice renders state ${state}`);
}

assert.match(sources.styledSelect, /aria-haspopup="listbox"/i, 'custom selects expose listbox semantics');
assert.match(sources.styledSelect, /aria-expanded=\{open\}/, 'custom selects expose open state');
assert.match(sources.styledSelect, /role="listbox"/, 'custom select popup is a listbox');
assert.match(sources.styledSelect, /role="option"/, 'custom select entries are options');
assert.match(sources.searchableCombobox, /role="combobox"/, 'searchable catalog controls expose combobox semantics');
assert.match(sources.searchableCombobox, /aria-autocomplete="list"/, 'searchable catalog controls expose list autocomplete');
assert.match(sources.searchableCombobox, /role="listbox"/, 'searchable catalog popup is a listbox');
assert.match(sources.searchableCombobox, /role="option"/, 'searchable catalog entries are options');
for (const [key, label] of [
  ['settings', '在线转写服务商'],
  ['dataSettings', '默认导出格式'], ['dataSettings', '日志级别'], ['appearanceSettings', '颜色主题'],
  ['profileEditor', '服务商'], ['profileEditor', '已发现模型'],
]) {
  assert.match(sources[key], new RegExp(`label=["']${escapeRegExp(label)}["']`), `${label} uses the accessible custom dropdown`);
}
has(sources.aiSettings, 'label="搜索 AI 服务商"', 'AI provider uses the searchable catalog combobox');
has(sources.aiSettings, 'label="搜索或输入 AI 模型"', 'AI model uses the searchable/custom catalog combobox');
has(sources.aiSettings, 'aria-label="AI 协议"', 'AI protocol is rendered from the selected provider contract');

const flows = [
  ['start task', 'app', 'invokeStartDistillation', 'start_distillation'],
  ['cancel task', 'app', 'cancelDistillation', 'cancel_distillation'],
  ['task records', 'taskHistory', 'listTaskRecords', 'list_task_records'],
  ['task retry', 'taskHistory', 'retryTaskRecord', 'retry_task_record'],
  ['library search', 'library', 'searchLibrary', 'search_library'],
  ['library favorite', 'library', 'setNoteFavorite', 'set_note_favorite'],
  ['library tags', 'library', 'setNoteTags', 'set_note_tags'],
  ['library opened', 'library', 'markNoteOpened', 'mark_note_opened'],
  ['note Q&A', 'qa', 'askHistoryNote', 'ask_history_note'],
  ['SenseVoice status', 'senseVoice', 'getSenseVoiceStatus', 'get_sensevoice_status'],
  ['SenseVoice download', 'senseVoice', 'downloadSenseVoice', 'download_sensevoice'],
  ['SenseVoice cancel', 'senseVoice', 'cancelSenseVoiceDownload', 'cancel_sensevoice_download'],
  ['SenseVoice delete', 'senseVoice', 'deleteSenseVoice', 'delete_sensevoice'],
  ['SenseVoice model', 'senseVoice', 'setSenseVoiceModel', 'set_sensevoice_model'],
  ['transcription profile save', 'profileEditor', 'saveTranscriptionProfile', 'save_transcription_profile'],
  ['summary profile save', 'profileEditor', 'saveSummaryProfile', 'save_summary_profile'],
  ['summary catalog load', 'aiSettings', 'getSummaryProviderCatalog', 'get_summary_provider_catalog'],
  ['summary catalog atomic save', 'aiSettings', 'saveAndActivateCatalogSummaryProfile', 'save_and_activate_catalog_summary_profile'],
  ['profile model discovery', 'profileEditor', 'discoverSummaryModels', 'discover_summary_models'],
  ['profile test', 'profileManager', 'testProfile', 'test_profile'],
  ['profile delete', 'profileManager', 'deleteProfile', 'delete_profile'],
  ['active profile', 'profileManager', 'setActiveProfile', 'set_active_profile'],
  ['fallback profile', 'profileManager', 'setFallbackTranscriptionProfile', 'set_fallback_transcription_profile'],
  ['credential status', 'profileManager', 'hasProfileCredential', 'has_profile_credential'],
  ['capability settings', 'aiSettings', 'getCapabilitySettings', 'get_capability_settings'],
  ['capability status', 'aiSettings', 'getCapabilityStatus', 'get_capability_status'],
  ['vector save', 'vectorSettings', 'saveVectorConfig', 'save_vector_config'],
  ['vector test', 'vectorSettings', 'testVectorConfig', 'test_vector_config'],
  ['rerank save', 'rerankSettings', 'saveRerankConfig', 'save_rerank_config'],
  ['rerank test', 'rerankSettings', 'testRerankConfig', 'test_rerank_config'],
  ['web provider save', 'webSettings', 'saveWebSearchConfig', 'save_web_search_config'],
  ['web provider test', 'webSettings', 'testWebSearchConfig', 'test_web_search_config'],
  ['TTS save', 'ttsSettings', 'saveTtsConfig', 'save_tts_config'],
  ['TTS test', 'ttsSettings', 'testTtsConfig', 'test_tts_config'],
  ['image save', 'imageSettings', 'saveImageConfig', 'save_image_config'],
  ['image test', 'imageSettings', 'testImageConfig', 'test_image_config'],
  ['agent save', 'agentSettings', 'saveLocalAgentConfig', 'save_local_agent_config'],
  ['agent test', 'agentSettings', 'testLocalAgentConfig', 'test_local_agent_config'],
  ['agent detect', 'agentSettings', 'detectLocalAgents', 'detect_local_agents'],
  ['note index', 'library', 'indexNote', 'index_note'],
  ['semantic search', 'library', 'semanticSearch', 'semantic_search'],
  ['web search consumer', 'qa', 'webSearch', 'web_search'],
  ['speech consumer', 'result', 'synthesizeSpeech', 'synthesize_speech'],
  ['image consumer', 'result', 'generateNoteImage', 'generate_note_image'],
  ['agent consumer', 'library', 'runLocalAgent', 'run_local_agent'],
  ['export preferences load', 'dataSettings', 'getExportPreferences', 'get_export_preferences'],
  ['export preferences save', 'dataSettings', 'saveExportPreferences', 'save_export_preferences'],
  ['export preferences restore', 'dataSettings', 'restoreExportPreferences', 'restore_export_preferences'],
  ['cache usage', 'dataSettings', 'getCacheUsage', 'get_cache_usage'],
  ['cache clear', 'dataSettings', 'clearCache', 'clear_cache'],
  ['logs list', 'dataSettings', 'listLogs', 'list_logs'],
  ['log read', 'dataSettings', 'readLog', 'read_log'],
  ['log level', 'dataSettings', 'setLogLevel', 'set_log_level'],
  ['logs clear', 'dataSettings', 'clearLogs', 'clear_logs'],
  ['Cookie status', 'downloadSettings', 'getDownloadCookieStatus', 'get_download_cookie_status'],
  ['Cookie save', 'downloadSettings', 'saveDownloadCookie', 'save_download_cookie'],
  ['Cookie delete', 'downloadSettings', 'deleteDownloadCookie', 'delete_download_cookie'],
  ['appearance save', 'appearanceSettings', 'saveAppearancePreferences', 'save_appearance_preferences'],
  ['about snapshot', 'aboutSettings', 'getAboutSnapshot', 'get_about_snapshot'],
  ['open app data', 'aboutSettings', 'openAppDataDirectory', 'open_app_data_directory'],
  ['open export directory', 'aboutSettings', 'openExportDirectory', 'open_export_directory'],
  ['open log directory', 'aboutSettings', 'openLogDirectory', 'open_log_directory'],
  ['open documentation', 'aboutSettings', 'openDocumentation', 'open_documentation'],
];
for (const [label, sourceKey, bridgeFunction, command] of flows) {
  assert.match(sources[sourceKey], new RegExp(`\\b${escapeRegExp(bridgeFunction)}\\b`), `${label}: ${sourceKey} consumes ${bridgeFunction}`);
  assert.match(sources.bridge, new RegExp(`export (?:async )?function\\s+${escapeRegExp(bridgeFunction)}\\b`), `${label}: bridge exports ${bridgeFunction}`);
  assert.match(sources.bridge, new RegExp(`invoke(?:<[^;]+?>)?\\(['"]${escapeRegExp(command)}['"]`), `${label}: bridge invokes ${command}`);
  assert.match(sources.rustRegistration, new RegExp(`commands::${escapeRegExp(command)}\\b`), `${label}: Rust registers ${command}`);
  assert.match(sources.rustCommands, new RegExp(`\\bfn\\s+${escapeRegExp(command)}\\b`), `${label}: Rust implements ${command}`);
}

assert.match(sources.bridge, /credential\?: SecretInput/g, 'provider and hosted AI saves use typed secret inputs');
assert.match(sources.types, /export type SecretInput\s*=/, 'frontend defines a dedicated secret transport type');
assert.match(sources.credentialStore, /pub struct KeyringBackend/, 'production provider credentials use the OS credential manager backend');
assert.match(sources.credentialStore, /\[redacted\]/, 'credential debug/display output is redacted');
assert.match(sources.cookieStore, /Settings screens[\s\S]*must use `has`/, 'Settings receives Cookie presence only');
assert.doesNotMatch(sources.rustRegistration, /commands::get_download_cookie\b/, 'no raw Cookie getter is registered to the frontend');
assert.match(sources.dataManagement, /MAX_LOG_TAIL_BYTES: usize = 64 \* 1024/, 'log reads retain the 64 KiB cap');
assert.match(sources.dataManagement, /fn valid_log_id\(/, 'log identifiers are validated');
assert.match(sources.dataManagement, /file_type\(\)\.is_symlink\(\)/, 'cache traversal does not follow symlinks');
assert.match(sources.capabilityStore, /"cmd" \| "cmd\.exe" \| "powershell"[\s\S]*"sh" \| "bash"/, 'local-agent config rejects shell interpreters');
assert.match(sources.capabilityStore, /argument\.contains\("&&"\)[\s\S]*argument\.contains\('\|'\)/, 'local-agent config rejects shell control operators');
assert.match(sources.aiCapabilities, /hidden_command\(&request\.program\)[\s\S]*\.args\(request\.args/, 'local agents use an executable plus fixed argument array');
assert.match(sources.aiCapabilities, /\.stdin\(Stdio::piped\(\)\)/, 'local-agent prompts travel over stdin instead of command arguments');

const productionUi = [sources.app, sources.sidebar, sources.settings, sources.aiSettings, sources.dataSettings, sources.senseVoice, sources.library, sources.qa, sources.result, sources.taskHistory];
for (const source of productionUi) {
  assert.doesNotMatch(source, /\b(?:TODO|FIXME)\b|coming soon|not implemented|prototype only|敬请期待|功能开发中|暂未实现/i, 'production controls contain no placeholder or unfinished marker');
}

console.log(`complete workbench capability structure: pass (${flows.length} frontend-to-Rust flows)`);




