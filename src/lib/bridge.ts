/**
 * bridge.ts — VedioNotes 前端（TypeScript）与 Rust 后端之间的"桥"
 *
 * ===== 文件级别 =====
 *   本文件属于"前端 lib 层 / Tauri 桥接层"。
 *   它不包含 UI 逻辑，只负责把前端的数据发到 Rust 后端，
 *   以及接收 Rust 后端发过来的事件和通知。
 *
 *   被 import 的位置：App.tsx、各个 React 组件、platform/settings/ 适配层。
 *
 * ===== 核心机制（C/C++ 开发者的视角） =====
 *
 *   整个应用是"前端（React） + 后端（Rust）"的架构。
 *   前端运行在 WebView 里（类似嵌入了一个浏览器），后端是 Rust 编译的原生程序。
 *   前端不能直接调用 Rust 函数——因为前端的 JavaScript 和后端的 Rust
 *   在不同的进程里。Tauri 框架提供了一个跨进程通信的管道：
 *
 *      invoke('命令名', {参数})  ——  类似 RPC（远程过程调用）
 *      listen('事件名', callback) ——  类似注册回调函数
 *
 *   invoke 的工作流程（类比 C 的 socket + 序列化）：
 *     1. TypeScript 将参数序列化为 JSON 字符串
 *     2. JSON 通过 IPC（进程间通信管道）发到 Rust 进程
 *     3. Rust 根据 "命令名" 找到对应的 #[tauri::command] 函数
 *     4. Rust 将 JSON 反序列化为 Rust 结构体，执行函数
 *     5. 返回值被序列化为 JSON，通过 IPC 返回给 TypeScript
 *     6. TypeScript 将 JSON 反序列化，Promise 解析为结果
 *
 *   这和 C 中自己写 socket + msgpack/protobuf 的 IPC 思路类似，
 *   但 Tauri 帮你封装了序列化、路由和错误传递。
 *
 *   listen 的工作流程（类比 C 的回调注册）：
 *     1. TypeScript 调用 listen('事件名', myCallback)
 *     2. Rust 后端在某个时刻发出同名事件
 *     3. myCallback 被调用，参数是 Rust 发来的数据
 *     4. listen 返回一个 UnlistenFn（取消监听的函数），
 *        类似 C 中保存注册 ID 以便之后注销
 *
 *   注意：listen 注册是"持久的"——会一直监听，直到你调用取消函数。
 *   如果一个 React 组件注册了 listen，必须在该组件被销毁时取消监听，
 *   否则会导致内存泄漏和重复回调。
 *
 * ===== async / await / Promise（与 C/C++ 的区别） =====
 *   所有 invoke 返回的都是 Promise<T>。Promise 不是线程——它是
 *   JavaScript 事件循环中的"未来值"：
 *     - C 中你开一个线程，函数异步执行
 *     - JS 中 invoke 返回 Promise，你的代码继续执行，Promise 在未来解析
 *     - await 只是"暂停当前函数的执行，等 Promise 解析后恢复"
 *     - await 不会阻塞主线程——它会挂起这个异步函数，事件循环继续处理别的
 *
 *   类比：Promise 类似 C++ 的 std::future，但它是单线程事件驱动的。
 *
 * ===== 数据类型对应（TypeScript ↔ Rust） =====
 *   import 进来的类型（如 AppPreferences、AppProfiles）
 *   都是 TS 的 interface/type，它们在编译后会被擦除。
 *   但在写代码时，TypeScript 编译器会检查传入 invoke 的参数
 *   是否和 Rust 端期望的形状一致——这就是"类型安全"。
 *
 *   invoke<T>('command', args) 中的 <T> 是 TS 的泛型——
 *   告诉 TypeScript "这个 invoke 的返回值会是什么类型"。
 *   如果 Rust 返回的数据不匹配 <T> 的形状，编译不会报错，
 *   但运行时 JSON 反序列化会失败——和 C 中类型转换不安全的道理类似。
 *
 * ===== 阅读顺序建议 =====
 *   1. 先看前三个函数（getPreferences, setMarkdownOutputDir, getProfiles）
 *      理解 invoke 的语法和参数格式
 *   2. 再看 onTaskProgress / onTaskComplete / onTaskError
 *      理解 listen 事件机制
 *   3. 然后按你关心的功能看对应分组
 *   4. 最后看 capability 测试和 AI 能力执行部分
 */

import { invoke } from '@tauri-apps/api/core';
// invoke 函数：Tauri 自带的核心函数，用来调用 Rust 命令
// 类似 C 中调用一个远程 RPC 函数，但不是通过函数指针，而是通过命令名字符串

import { listen, UnlistenFn } from '@tauri-apps/api/event';
// listen 函数：注册一个事件监听器
// UnlistenFn 类型：取消监听的函数（是一个没有参数的函数，调用它就停止监听）

import type {
  // import type 表示"只导入类型，不导入实际值"——
  // 编译后这些 import 会被完全擦除，不会增加任何运行时代码。
  AboutSnapshot,
  AppError,
  AppearancePreferences,
  AppPreferences,
  AppProfiles,
  CacheCategory,
  CacheClearResult,
  CacheUsage,
  CapabilitySettings,
  CapabilityStatus,
  CapabilityStatusItem,
  CapabilityTestResult,
  CudaRuntimeDownloadProgress,
  CudaRuntimeStatus,
  DistillationResult,
  DownloadCookieStatus,
  DownloadPlatform,
  ExportFormat,
  ExportPreferences,
  HistoryEntry,
  HomeSnapshot,
  ImageConfig,
  InputSource,
  LibraryEntry,
  LibraryQuery,
  LibrarySnapshot,
  LocalAgentConfig,
  LocalAgentDetection,
  LocalAgentResult,
  LocalComputeMode,
  LocalModelDownloadProgress,
  LocalModelStatus,
  LogDescriptor,
  LogLevel,
  LogTail,
  NoteChatTurn,
  ProfileTestResult,
  ProviderFallbackEvent,
  RerankConfig,
  SaveCatalogSummaryProfileInput,
  SearchHit,
  SecretInput,
  SenseVoiceDownloadProgress,
  SenseVoiceLanguage,
  SenseVoiceModelId,
  SenseVoiceStatus,
  SummaryProviderCatalogEntry,
  SummaryProfile,
  TaskOptions,
  TaskProgress,
  TaskRecord,
  TaskRetryRequest,
  TranscriptionMode,
  TranscriptionProfile,
  TtsConfig,
  VectorConfig,
  WebSearchConfig,
  WebSearchResult,
} from './types';

// ================================================================
// 用户偏好（Preferences）—— 对应 Rust 的 get/set_preferences 命令
//
// 类比 C：这里的每个函数 ≈ 对偏好文件的 CRUD 操作，
//         但不在本进程中做 IO，而是委托给 Rust 进程。
//         参数和返回值都经过 JSON 序列化/反序列化。
// ================================================================

/**
 * 从 Rust 读取全部用户偏好。
 *
 * invoke<AppPreferences>('get_preferences') 的意思是：
 *   1. 把命令名 'get_preferences' 发给 Rust
 *   2. Rust 端对应的函数是 #[tauri::command] fn get_preferences(...)
 *      定义在 src-tauri/src/commands.rs 中
 *   3. Rust 返回一个 JSON 对象
 *   4. TypeScript 检查 JSON 是否匹配 AppPreferences 接口的形状
 *   5. 返回 Promise<AppPreferences> —— 调用方需要用 await 获取结果
 *
 * C 类比：类似做一次 socket send + recv，把请求发出去，等结果回来，
 *         但 Tauri 帮你完成了序列化和路由。
 */
export function getPreferences(): Promise<AppPreferences> {
  return invoke<AppPreferences>('get_preferences');
}

/**
 * 修改 Markdown 输出目录。
 * 传 null 表示"恢复使用系统默认目录"。
 *
 * invoke 的第二个参数 { path } 是传给 Rust 的参数对象。
 * 这是一个 JS 对象字面量——类似 C 中传一个结构体的字段。
 * Rust 端对应的函数签名大概是：
 *   fn set_markdown_output_dir(path: Option<String>) -> AppPreferences
 */
export function setMarkdownOutputDir(path: string | null): Promise<AppPreferences> {
  return invoke<AppPreferences>('set_markdown_output_dir', { path });
}

// ================================================================
// AI 服务商配置（Profiles）—— 对应 Rust 的 profile 管理命令
// ================================================================

/** 获取所有已保存的服务商配置（包括当前激活哪个） */
export function getProfiles(): Promise<AppProfiles> {
  return invoke<AppProfiles>('get_profiles');
}

/** 获取 AI 服务商目录（116 个服务商、3926 个模型的工厂数据） */
export function getSummaryProviderCatalog(): Promise<SummaryProviderCatalogEntry[]> {
  return invoke<SummaryProviderCatalogEntry[]>('get_summary_provider_catalog');
}

/**
 * 从目录中选择一个服务商和模型，一步完成"保存 + 激活"。
 *
 * 参数中的 ?? 是 TS 的"空值合并运算符"：
 *   a ?? b   表示：如果 a 不是 null/undefined 就用 a，否则用 b
 * 类似 C++ 的 `a ? a : b` 但只检查 null/undefined。
 */
export function saveAndActivateCatalogSummaryProfile(input: SaveCatalogSummaryProfileInput): Promise<AppProfiles> {
  return invoke<AppProfiles>('save_and_activate_catalog_summary_profile', {
    providerId: input.providerId,
    model: input.model,
    baseUrlOverride: input.baseUrlOverride ?? null,  // `??` 空值合并：没填就用 null
    credential: input.credential ?? null,
  });
}

/** 保存语音识别服务商配置 */
export function saveTranscriptionProfile(profile: TranscriptionProfile, credential?: SecretInput): Promise<AppProfiles> {
  return invoke<AppProfiles>('save_transcription_profile', { profile, credential: credential ?? null });
}

/** 保存 AI 总结服务商配置 */
export function saveSummaryProfile(profile: SummaryProfile, credential?: SecretInput): Promise<AppProfiles> {
  return invoke<AppProfiles>('save_summary_profile', { profile, credential: credential ?? null });
}

/** 删除一个服务商配置（内置标记的不能删） */
export function deleteProfile(profileType: string, profileId: string): Promise<AppProfiles> {
  return invoke<AppProfiles>('delete_profile', { profileType, profileId });
}

/** 激活某个配置 */
export function setActiveProfile(profileType: string, profileId: string): Promise<AppProfiles> {
  return invoke<AppProfiles>('set_active_profile', { profileType, profileId });
}

/** 设置备用转写服务商（主服务挂了自动切到这里） */
export function setFallbackTranscriptionProfile(profileId: string | null): Promise<AppProfiles> {
  return invoke<AppProfiles>('set_fallback_transcription_profile', { profileId });
}

/** 测试一个服务商是否可用（发一条无害请求） */
export function testProfile(profileType: string, profileId: string): Promise<ProfileTestResult> {
  return invoke<ProfileTestResult>('test_profile', { profileType, profileId });
}

/** 从服务商 API 获取可用模型列表 */
export function discoverSummaryModels(profileId: string): Promise<string[]> {
  return invoke<string[]>('discover_summary_models', { profileId });
}

// ================================================================
// 外观 & 关于 — 主题、布局、版本信息
// ================================================================

/** 保存外观偏好（主题、密度、动画），修改后立即生效 */
export function saveAppearancePreferences(appearance: AppearancePreferences): Promise<AppPreferences> {
  return invoke<AppPreferences>('save_appearance_preferences', { appearance });
}

/** 获取"关于"页面需要的应用和组件信息 */
export function getAboutSnapshot(): Promise<AboutSnapshot> {
  return invoke<AboutSnapshot>('get_about_snapshot');
}

/** 打开本地的应用数据文件夹（用系统资源管理器） */
export function openAppDataDirectory(): Promise<void> {
  return invoke<void>('open_app_data_directory');
}

/** 打开导出文件夹 */
export function openExportDirectory(): Promise<void> {
  return invoke<void>('open_export_directory');
}

/** 打开日志文件夹 */
export function openLogDirectory(): Promise<void> {
  return invoke<void>('open_log_directory');
}

/** 打开项目文档（浏览器） */
export function openDocumentation(): Promise<void> {
  return invoke<void>('open_documentation');
}

// ================================================================
// 导出偏好 & 笔记导出
// ================================================================

/** 获取导出偏好（格式、是否包含截图等） */
export function getExportPreferences(): Promise<ExportPreferences> {
  return invoke<ExportPreferences>('get_export_preferences');
}

/** 保存导出偏好 */
export function saveExportPreferences(preferences: ExportPreferences): Promise<ExportPreferences> {
  return invoke<ExportPreferences>('save_export_preferences', { preferences });
}

/** 恢复导出偏好为默认值 */
export function restoreExportPreferences(): Promise<ExportPreferences> {
  return invoke<ExportPreferences>('restore_export_preferences');
}

/** 把一篇笔记导出为指定格式的文件 */
export function exportNote(title: string, markdown: string, format: ExportFormat): Promise<string> {
  return invoke<string>('export_note', { title, markdown, format });
}

// ================================================================
// 缓存 & 日志管理
// ================================================================

/** 获取缓存占用情况（各类缓存分别占多少空间） */
export function getCacheUsage(): Promise<CacheUsage> {
  return invoke<CacheUsage>('get_cache_usage');
}

/** 清理指定类型的缓存（如"临时媒体"、"截图"等） */
export function clearCache(category: CacheCategory): Promise<CacheClearResult> {
  return invoke<CacheClearResult>('clear_cache', { category });
}

/** 列出所有日志文件 */
export function listLogs(): Promise<LogDescriptor[]> {
  return invoke<LogDescriptor[]>('list_logs');
}

/** 读取某个日志文件的末尾内容（用于诊断问题） */
export function readLog(id: string, maxBytes?: number): Promise<LogTail> {
  return invoke<LogTail>('read_log', { id, maxBytes: maxBytes ?? null });
}

/** 修改日志记录级别（debug/info/warning/error） */
export function setLogLevel(level: LogLevel): Promise<LogLevel> {
  return invoke<LogLevel>('set_log_level', { level });
}

/** 清空所有日志 */
export function clearLogs(): Promise<number> {
  return invoke<number>('clear_logs');
}

// ================================================================
// 凭据（API Key）相关 — 只查有无，不读取内容
// ================================================================

/** 检查是否有已保存的 API Key（只返回 true/false，不暴露内容） */
export function checkApiKey(): Promise<boolean> {
  return invoke<boolean>('check_api_key');
}

/** 检查某个服务商配置是否保存了凭据 */
export function hasProfileCredential(profileType: string, profileId: string): Promise<boolean> {
  return invoke<boolean>('has_profile_credential', { profileType, profileId });
}

// ================================================================
// 旧数据迁移
// ================================================================

/** 检查是否需要从旧版本迁移数据 */
export function getMigrationState(): Promise<boolean> {
  return invoke<boolean>('get_migration_state');
}

/** 执行数据迁移（用户确认后） */
export function completeMigration(confirmed: boolean): Promise<AppProfiles> {
  return invoke<AppProfiles>('complete_migration', { confirmed });
}

// ================================================================
// 任务处理—— invokeStartDistillation 是最核心的操作：
//   一个视频进来 → 转写 → AI总结 → 截图 → 保存笔记
//
// onTaskProgress / onTaskComplete / onTaskError 是三个事件监听器：
//   注册时机：在调用 invokeStartDistillation 之前必须注册好
//   原因：Rust 可能一发完 invoke 的响应就开始发事件了
//
// 类比 C：类似先注册信号处理函数 signal(SIGXXX, handler)，
//         然后再启动工作，确保不会漏掉信号。
// 区别：C 的信号是全局的，Tauri 的事件是每个任务独立的（带 taskId）。
// ================================================================

/** 启动一个"视频蒸馏"任务 */
export async function invokeStartDistillation(
  taskId: string,
  input: InputSource,
  transcriptionProfileId: string,
  summaryProfileId: string,
  options: TaskOptions,
): Promise<void> {
  return invoke<void>('start_distillation', {
    taskId,
    source: input,
    transcriptionProfileId,
    summaryProfileId,
    options,
  });
}

/**
 * 监听任务的进度变化。
 *
 * listen('task-progress:taskId', callback) 的意思是：
 *   - 监听一个特定任务（由 taskId 唯一标识）的进度
 *   - 每当 Rust 发出 'task-progress:xxx' 事件，callback 被调用
 *   - callback 的参数是 TaskProgress 类型的对象
 *   - 返回值是 UnlistenFn（一个函数），调用它即可停止监听
 *
 * C 类比：类似在嵌入式系统中注册中断处理函数 ISR，
 *         但不是硬件中断，而是 Rust 进程发出的消息事件。
 *         与 C 回调的明显区别：
 *           - 这是异步的（callback 可能在任何时间被调用）
 *           - 需要手动取消（否则内存泄漏）
 *           - callback 在 JS 事件循环中执行，不是独立的线程
 */
export async function onTaskProgress(taskId: string, callback: (progress: TaskProgress) => void): Promise<UnlistenFn> {
  return listenProgress(taskId, callback);
}

/** 监听任务完成事件——Rust 处理完后通知前端"这是结果" */
export async function onTaskComplete(taskId: string, callback: (result: DistillationResult) => void): Promise<UnlistenFn> {
  return listen(`task-complete:${taskId}`, (event) => callback(event.payload as DistillationResult));
  // 注意模板字符串语法：`task-complete:${taskId}`
  // 这是 JS 的字符串拼接方式，`${}` 会替换为变量值。
  // 类似 C 的 sprintf("task-complete:%s", taskId)
}

/** 监听任务错误事件 */
export function onTaskError(taskId: string, callback: (error: AppError) => void): Promise<UnlistenFn> {
  return listen(`task-error:${taskId}`, (event) => callback(event.payload as AppError));
}

/** 监听服务商切换事件（主服务挂了，自动切到备用） */
export function onProviderFallback(taskId: string, callback: (event: ProviderFallbackEvent) => void): Promise<UnlistenFn> {
  return listen(`provider-fallback:${taskId}`, (event) => callback(event.payload as ProviderFallbackEvent));
}

/** 取消一个正在运行的任务 */
export function cancelDistillation(taskId: string): Promise<void> {
  return invoke<void>('cancel_distillation', { taskId });
}

// ================================================================
// 历史记录 & AI 问答
// ================================================================

export function getHistory(id: number): Promise<HistoryEntry | null> {
  return invoke<HistoryEntry | null>('get_history', { id });
}

export function listHistory(): Promise<HistoryEntry[]> {
  return invoke<HistoryEntry[]>('list_history');
}

export function searchHistory(query: string): Promise<HistoryEntry[]> {
  return invoke<HistoryEntry[]>('search_history', { query });
}

export function deleteHistory(id: number): Promise<void> {
  return invoke<void>('delete_history', { id });
}

/** 对一篇历史笔记向 AI 提问 */
export function askHistoryNote(id: number, question: string): Promise<NoteChatTurn[]> {
  return invoke<NoteChatTurn[]>('ask_history_note', { id, question });
}

/** 获取一篇历史笔记的 Markdown 正文 */
export function getHistoryMarkdown(id: number): Promise<string> {
  return invoke<string>('get_history_markdown', { id });
}

// ================================================================
// 事件监听底层实现
//
// listenProgress 是 onTaskProgress 调用的底层函数。
// 关键规则：这个函数必须在 invokeStartDistillation 之前调用，
//           因为 Rust 可能在任务启动后立即发送第一个进度事件。
//           如果监听还没注册好，第一个事件就会丢失。
// ================================================================

export function listenProgress(taskId: string, callback: (progress: TaskProgress) => void): Promise<UnlistenFn> {
  return listen(`task-progress:${taskId}`, (event) => callback(event.payload as TaskProgress));
}

// ================================================================
// 首页 & 任务记录
// ================================================================

export function getHomeSnapshot(): Promise<HomeSnapshot> {
  return invoke<HomeSnapshot>('get_home_snapshot');
}

export function listTaskRecords(query = ''): Promise<TaskRecord[]> {
  return invoke<TaskRecord[]>('list_task_records', { query });
}

export function retryTaskRecord(id: number): Promise<TaskRetryRequest> {
  return invoke<TaskRetryRequest>('retry_task_record', { id });
}

// ================================================================
// 笔记库（Library）
// ================================================================

/** 搜索笔记库 */
export function searchLibrary(query: LibraryQuery): Promise<LibrarySnapshot> {
  return invoke<LibrarySnapshot>('search_library', { query });
}

/** 收藏/取消收藏一篇笔记 */
export function setNoteFavorite(id: number, favorite: boolean): Promise<LibraryEntry> {
  return invoke<LibraryEntry>('set_note_favorite', { id, favorite });
}

/** 设置一篇笔记的标签 */
export function setNoteTags(id: number, tags: string[]): Promise<LibraryEntry> {
  return invoke<LibraryEntry>('set_note_tags', { id, tags });
}

/** 标记一篇笔记为"已打开"（更新最后打开时间） */
export function markNoteOpened(id: number): Promise<LibraryEntry> {
  return invoke<LibraryEntry>('mark_note_opened', { id });
}

// ================================================================
// 语音识别设置
// ================================================================

/** 保存转写偏好（模式和语言） */
export function setTranscriptionPreferences(mode: TranscriptionMode, languages: SenseVoiceLanguage[]): Promise<AppPreferences> {
  return invoke<AppPreferences>('set_transcription_preferences', {
    transcriptionMode: mode,
    sensevoiceLanguages: languages,
  });
}

// ================================================================
// 本地模型管理（Whisper）
// ================================================================

/** 列出所有本地 Whisper 模型的状态 */
export function listLocalModels(): Promise<LocalModelStatus[]> {
  return invoke<LocalModelStatus[]>('list_local_models');
}

/** 下载一个本地 Whisper 模型 */
export function downloadLocalModel(modelId: string): Promise<void> {
  return invoke<void>('download_local_model', { modelId });
}

/** 删除一个本地 Whisper 模型（删除当前激活的需要确认） */
export function deleteLocalModel(modelId: string, confirmedCurrentDelete: boolean): Promise<void> {
  return invoke<void>('delete_local_model', { modelId, confirmedCurrentDelete });
}

/** 监听本地模型下载进度 */
export function onLocalModelDownloadProgress(callback: (progress: LocalModelDownloadProgress) => void): Promise<UnlistenFn> {
  return listen('local-model-download-progress', (event) => callback(event.payload as LocalModelDownloadProgress));
}

// ================================================================
// CUDA 运行时管理（GPU 加速）
// ================================================================

/** 获取 CUDA 运行时状态（有没有 GPU、是否已安装等） */
export function getCudaRuntimeStatus(): Promise<CudaRuntimeStatus> {
  return invoke<CudaRuntimeStatus>('get_cuda_runtime_status');
}

/** 下载 CUDA 运行时 */
export function downloadCudaRuntime(): Promise<void> {
  return invoke<void>('download_cuda_runtime');
}

/** 删除 CUDA 运行时 */
export function deleteCudaRuntime(): Promise<void> {
  return invoke<void>('delete_cuda_runtime');
}

/** 监听 CUDA 运行时下载进度 */
export function onCudaRuntimeDownloadProgress(callback: (progress: CudaRuntimeDownloadProgress) => void): Promise<UnlistenFn> {
  return listen('cuda-runtime-download-progress', (event) => callback(event.payload as CudaRuntimeDownloadProgress));
}

/** 设置计算模式（自动 / 仅CPU） */
export function setLocalComputeMode(mode: LocalComputeMode): Promise<AppPreferences> {
  return invoke<AppPreferences>('set_local_compute_mode', { mode });
}

// ================================================================
// SenseVoice CPU 语音识别模型
// ================================================================

/** 获取 SenseVoice 语音识别模型的状态 */
export function getSenseVoiceStatus(): Promise<SenseVoiceStatus> {
  return invoke<SenseVoiceStatus>('get_sensevoice_status');
}

/** 下载 SenseVoice 模型 */
export function downloadSenseVoice(modelId: SenseVoiceModelId): Promise<SenseVoiceStatus> {
  return invoke<SenseVoiceStatus>('download_sensevoice', { modelId });
}

/** 取消正在进行的 SenseVoice 下载 */
export function cancelSenseVoiceDownload(): Promise<void> {
  return invoke<void>('cancel_sensevoice_download');
}

/** 删除一个 SenseVoice 模型 */
export function deleteSenseVoice(modelId: SenseVoiceModelId, confirmedSelectedDelete: boolean): Promise<SenseVoiceStatus> {
  return invoke<SenseVoiceStatus>('delete_sensevoice', { modelId, confirmedSelectedDelete });
}

/** 选择/激活一个 SenseVoice 模型 */
export function setSenseVoiceModel(modelId: SenseVoiceModelId): Promise<SenseVoiceStatus> {
  return invoke<SenseVoiceStatus>('set_sensevoice_model', { modelId });
}

/** 监听 SenseVoice 下载进度 */
export function onSenseVoiceDownloadProgress(callback: (progress: SenseVoiceDownloadProgress) => void): Promise<UnlistenFn> {
  return listen('sensevoice-download-progress', (event) => callback(event.payload as SenseVoiceDownloadProgress));
}

// ================================================================
// 下载平台 Cookie 管理
// ================================================================

/** 获取各平台的 Cookie 是否已配置 */
export function getDownloadCookieStatus(): Promise<DownloadCookieStatus> {
  return invoke<DownloadCookieStatus>('get_download_cookie_status');
}

/** 保存某个平台的下载 Cookie */
export function saveDownloadCookie(platform: DownloadPlatform, cookieText: string): Promise<void> {
  return invoke<void>('save_download_cookie', { platform, cookieText });
}

/** 删除某个平台的下载 Cookie */
export function deleteDownloadCookie(platform: DownloadPlatform): Promise<void> {
  return invoke<void>('delete_download_cookie', { platform });
}

// ================================================================
// 诊断日志
// ================================================================

/** 获取诊断日志文件的路径 */
export function getDiagnosticLogPath(): Promise<string> {
  return invoke<string>('get_diagnostic_log_path');
}

// ================================================================
// AI 能力扩展（向量搜索、重排、联网搜索、语音合成、作图、智能体）
// ================================================================

/** 获取所有 AI 能力的配置 */
export function getCapabilitySettings(): Promise<CapabilitySettings> {
  return invoke<CapabilitySettings>('get_capability_settings');
}

/** 获取所有 AI 能力的就绪状态 */
export function getCapabilityStatus(): Promise<CapabilityStatus> {
  return invoke<CapabilityStatus>('get_capability_status');
}

/** 保存向量搜索配置 */
export function saveVectorConfig(config: VectorConfig, credential?: SecretInput): Promise<CapabilityStatusItem> {
  return invoke<CapabilityStatusItem>('save_vector_config', { config, credential: credential ?? null });
}

/** 保存重排（Rerank）配置 */
export function saveRerankConfig(config: RerankConfig, credential?: SecretInput): Promise<CapabilityStatusItem> {
  return invoke<CapabilityStatusItem>('save_rerank_config', { config, credential: credential ?? null });
}

/** 保存联网搜索配置 */
export function saveWebSearchConfig(config: WebSearchConfig, credential?: SecretInput): Promise<CapabilityStatusItem> {
  return invoke<CapabilityStatusItem>('save_web_search_config', { config, credential: credential ?? null });
}

/** 保存语音合成（TTS）配置 */
export function saveTtsConfig(config: TtsConfig, credential?: SecretInput): Promise<CapabilityStatusItem> {
  return invoke<CapabilityStatusItem>('save_tts_config', { config, credential: credential ?? null });
}

/** 保存 AI 作图配置 */
export function saveImageConfig(config: ImageConfig, credential?: SecretInput): Promise<CapabilityStatusItem> {
  return invoke<CapabilityStatusItem>('save_image_config', { config, credential: credential ?? null });
}

/** 保存本地智能体配置 */
export function saveLocalAgentConfig(config: LocalAgentConfig): Promise<CapabilityStatusItem> {
  return invoke<CapabilityStatusItem>('save_local_agent_config', { config });
}

/** 测试向量搜索配置 */
export function testVectorConfig(): Promise<CapabilityTestResult> { return invoke<CapabilityTestResult>('test_vector_config'); }

/** 测试重排配置 */
export function testRerankConfig(): Promise<CapabilityTestResult> { return invoke<CapabilityTestResult>('test_rerank_config'); }

/** 测试联网搜索配置 */
export function testWebSearchConfig(): Promise<CapabilityTestResult> { return invoke<CapabilityTestResult>('test_web_search_config'); }

/** 测试语音合成配置 */
export function testTtsConfig(): Promise<CapabilityTestResult> { return invoke<CapabilityTestResult>('test_tts_config'); }

/** 测试 AI 作图配置 */
export function testImageConfig(): Promise<CapabilityTestResult> { return invoke<CapabilityTestResult>('test_image_config'); }

/** 测试本地智能体配置 */
export function testLocalAgentConfig(): Promise<CapabilityTestResult> { return invoke<CapabilityTestResult>('test_local_agent_config'); }

// ================================================================
// AI 能力执行（实际调用这些能力执行任务）
// ================================================================

/** 将一篇笔记加入向量索引（用于语义搜索） */
export function indexNote(noteId: string, text: string): Promise<void> {
  return invoke<void>('index_note', { noteId, text });
}

/** 语义搜索（根据意思而不是关键词搜索笔记） */
export function semanticSearch(query: string, limit: number): Promise<SearchHit[]> {
  return invoke<SearchHit[]>('semantic_search', { query, limit });
}

/** 执行一次联网搜索 */
export function webSearch(query: string): Promise<WebSearchResult[]> {
  return invoke<WebSearchResult[]>('web_search', { query });
}

/** 把文字合成为语音（TTS） */
export function synthesizeSpeech(text: string): Promise<string> {
  return invoke<string>('synthesize_speech', { text });
}

/** 根据提示词用 AI 生成一张图片 */
export function generateNoteImage(prompt: string): Promise<string> {
  return invoke<string>('generate_note_image', { prompt });
}

/** 检测本地可用的智能体 */
export function detectLocalAgents(): Promise<LocalAgentDetection[]> {
  return invoke<LocalAgentDetection[]>('detect_local_agents');
}

/** 运行本地智能体 */
export function runLocalAgent(prompt: string): Promise<LocalAgentResult> {
  return invoke<LocalAgentResult>('run_local_agent', { prompt });
}

// ================================================================
// 文件操作
// ================================================================

/** 把 Markdown 结果复制到用户指定的路径 */
export function copyMarkdownResult(sourcePath: string, destinationPath: string): Promise<string> {
  return invoke<string>('copy_markdown_result', { sourcePath, destinationPath });
}
