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
| complete-workbench-capabilities.test.mjs | pass (63 flows) |
| task13-settings-visual-matrix.mjs | pass (119 checks, 98 visual combinations) |

## 视觉矩阵覆盖

98 个视觉组合：
- 3 分辨率 × 2 主题 × 5 页面 = 30
- 3 分辨率 × 2 主题 × 3 转写模式 = 18
- 3 分辨率 × 2 主题 × 7 AI 子模式 = 42
- 8 状态交互 = 8
总计 98 个视觉组合

119 个静态检查（CSS 选择器、状态覆盖、边界隔离、架构验证）

## 尚未完成的内容

- Rust 验证（cargo test/check）尚未在本次返工中运行
- README 中 VITE_SETTINGS_IMPLEMENTATION 说明待更新
- 视觉矩阵为静态分析，未做像素级渲染对比
