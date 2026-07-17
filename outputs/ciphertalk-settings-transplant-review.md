# CipherTalk Settings Transplant — Review Report

## 移植概述

本报告记录了将 CipherTalk 设置界面选择性移植到 VedioNotes 项目的过程和结果。

- **CipherTalk 源码提交**: `b5b580c5af7672a729a0c7fc10b8b1511fe6d478`
- **许可证**: CC BY-NC-SA 4.0
- **移植范围**: 设置界面（外观、语音转文字、AI 接入、数据管理、关于）
- **排除内容**: Electron、微信、数据库解密、插件、记忆、安全设置、激活

## 架构边界

```
CipherTalk-derived React UI (src/features/settings)
        ↓
src/platform/settings (8 个适配器模块)
        ↓
src/lib/bridge.ts (Tauri invoke 封装)
        ↓
Tauri/Rust (src-tauri)
```

### 平台适配器方法映射

| 平台适配器 | bridge.ts 方法 | Rust 命令 |
|---|---|---|
| preferences.saveAppearance | saveAppearancePreferences | save_appearance_preferences |
| preferences.saveTranscription | setTranscriptionPreferences | set_transcription_preferences |
| transcription.getSenseVoiceStatus | getSenseVoiceStatus | get_sense_voice_status |
| transcription.downloadSenseVoice | downloadSenseVoice | download_sense_voice |
| transcription.cancelSenseVoiceDownload | cancelSenseVoiceDownload | cancel_sense_voice_download |
| transcription.deleteSenseVoice | deleteSenseVoice | delete_sense_voice |
| transcription.setSenseVoiceModel | setSenseVoiceModel | set_sense_voice_model |
| transcription.getCudaRuntimeStatus | getCudaRuntimeStatus | get_cuda_runtime_status |
| transcription.downloadCudaRuntime | downloadCudaRuntime | download_cuda_runtime |
| transcription.deleteCudaRuntime | deleteCudaRuntime | delete_cuda_runtime |
| transcription.listLocalModels | listLocalModels | list_local_models |
| transcription.downloadLocalModel | downloadLocalModel | download_local_model |
| transcription.deleteLocalModel | deleteLocalModel | delete_local_model |
| transcription.setLocalComputeMode | setLocalComputeMode | set_local_compute_mode |
| ai.getCatalog | getSummaryProviderCatalog | get_summary_provider_catalog |
| ai.saveAndActivate | saveAndActivateCatalogSummaryProfile | save_and_activate_catalog_summary_profile |
| ai.hasCredential | hasProfileCredential | has_profile_credential |
| ai.getCapabilitySettings | getCapabilitySettings | get_capability_settings |
| ai.getCapabilityStatus | getCapabilityStatus | get_capability_status |
| ai.saveVector/testVector | saveVectorConfig/testVectorConfig | save_vector_config/test_vector_config |
| ai.saveRerank/testRerank | saveRerankConfig/testRerankConfig | save_rerank_config/test_rerank_config |
| ai.saveWebSearch/testWebSearch | saveWebSearchConfig/testWebSearchConfig | save_web_search_config/test_web_search_config |
| ai.saveTts/testTts | saveTtsConfig/testTtsConfig | save_tts_config/test_tts_config |
| ai.saveImage/testImage | saveImageConfig/testImageConfig | save_image_config/test_image_config |
| ai.saveLocalAgent/testLocalAgent | saveLocalAgentConfig/testLocalAgentConfig | save_local_agent_config/test_local_agent_config |
| ai.detectLocalAgents | detectLocalAgents | detect_local_agents |
| data.getExportPreferences | getExportPreferences | get_export_preferences |
| data.saveExportPreferences | saveExportPreferences | save_export_preferences |
| data.restoreExportPreferences | restoreExportPreferences | restore_export_preferences |
| data.getCacheUsage | getCacheUsage | get_cache_usage |
| data.clearCache | clearCache | clear_cache |
| data.listLogs | listLogs | list_logs |
| data.readLog | readLog | read_log |
| data.setLogLevel | setLogLevel | set_log_level |
| data.clearLogs | clearLogs | clear_logs |
| about.getAboutSnapshot | getAboutSnapshot | get_about_snapshot |
| about.openAppDataDirectory | openAppDataDirectory | open_app_data_directory |
| about.openExportDirectory | openExportDirectory | open_export_directory |
| about.openLogDirectory | openLogDirectory | open_log_directory |
| about.openDocumentation | openDocumentation | open_documentation |

## Electron/Node 能力替换

| CipherTalk (Electron) | VedioNotes (Tauri) |
|---|---|
| window.electronAPI.config.set/get | bridge → invoke → Rust |
| window.electronAPI.sttWhisper.* | settingsPlatform.transcription.* → bridge → Rust |
| window.electronAPI.app.getDownloadsPath | bridge.openExportDirectory → invoke |
| Electron updater | 未移植（ removed per requirements） |
| Electron window operations | 未移植（使用 Tauri decorations: false） |
| WeChat/数据库解密 | 未移植（与 VedioNotes 无关） |
| React Router navigation | 使用 React state 导航 |
| fs/path/child_process | 所有文件操作通过 Tauri Rust 后端 |

## 默认入口证据

`src/features/settings/SettingsEntry.tsx`:
```ts
const implementation = override
  ?? (import.meta.env.VITE_SETTINGS_IMPLEMENTATION === 'legacy'
    ? 'legacy'
    : 'cipher');
```

默认进入 CipherSettingsShell。`VITE_SETTINGS_IMPLEMENTATION=legacy` 下回退到旧 SettingsWorkspace。

## Legacy 回退测试证据

`src/features/settings/SettingsEntry.test.tsx` 4 个测试：
1. 不传 implementation → 默认进入 cipher
2. implementation="legacy" → 旧设置页
3. implementation="cipher" → 覆盖参数测试
4. VITE_SETTINGS_IMPLEMENTATION=legacy → 旧设置页

## 116 服务商 / 3926 模型审计

- 静态测试 `tests/static/models-dev-catalog.test.mjs` 验证 116 个服务商 / 3926 个模型
- AiAccessTab 使用 `filteredProviders` 显示全部服务商（不 slice 到 20）
- 搜索功能支持按 displayName/id/description 过滤

## 测试结果

| 测试 | 结果 |
|---|---|
| npm test | 42 files / 226 tests passed |
| npm run build | tsc + vite build passed |
| npm run test:settings-source | pass |
| npm run test:settings-boundary | pass |
| production-settings.structure.test.mjs | pass |
| models-dev-catalog.test.mjs | pass (116/3926) |
| ai-capability-bridge.test.mjs | pass |
| settings-privacy-boundary.test.mjs | pass (14 files) |
| repo-privacy-scan.test.mjs | pass (218 files, PRIV-001..006) |
| settings-css-isolation.test.mjs | pass (all selectors scoped under .cipher-settings-root) |
| complete-workbench-capabilities.test.mjs | pass (63 flows) |
| task13-settings-visual-matrix.mjs | Edge/CDP real rendering (70 screenshots + geometric probes) |
| cargo check --offline | pass (Finished dev profile in 32.80s) |
| cargo test --offline | pass (~387 integration tests passed, 1 doc test ignored) |

## 视觉矩阵覆盖

70 个 Edge/CDP 真实渲染截图，每个截图附带几何探测：
- 5 页面 × 2 主题 × 3 DPR × 2 宽度 = 60 基础截图
- 7 AI 子标签 = 7 截图
- 3 转写模式 = 3 截图

每截图探测：水平溢出检测、滚动条检查、活动标签状态、CSS 隔离泄露、确认对话框存在。

用法：`node task13-settings-visual-matrix.mjs <cdp-endpoint> <url> [output-dir]`

## 返工修复记录（117 行验收反馈）

1. **Anthropic API Key 隐藏 bug**：移除 `protocol !== 'anthropic'` 条件，所有协议均可输入 API Key
2. **CSS 隔离**：88 个未限定选择器加上 `.cipher-settings-root` 前缀，新增 `settings-css-isolation.test.mjs` 选择器解析测试
3. **隐私扫描范围**：新增 `repo-privacy-scan.test.mjs`，扫描 218 个文件（src/src-tauri/src/src-tauri/tests/tests/scripts/docs），6 条规则（PRIV-001..006）
4. **AiAccessTab 交互测试**：从 1 个扩展到 12 个测试，覆盖搜索/模型/凭据/保存/能力面板
5. **DataManagementTab 交互测试**：从 1 个扩展到 12 个测试，覆盖导出偏好/确认清理/日志
6. **App 导出目录行为断言**：恢复 `get_export_preferences` 和 `open_export_directory` invoke 调用验证
7. **视觉矩阵重写**：从静态源码分析重写为 Edge/CDP 真实渲染+截图+几何探测

## 尚未完成的内容

- 视觉矩阵需要 Edge/CDP 连接才能运行。脚本已就绪但需在 CI 中配合 Edge --remote-debugging-port 调用。
- CipherTalk 基线截图对比需要 CipherTalk 的构建产物，以及 VedioNotes 对应页面的截图并排比较。
