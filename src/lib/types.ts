// ============================================================
//  VedioNotes 全局类型定义
//
//  【文件级别】
//    本文件属于"前端 TypeScript lib 层"，定义了整个项目中
//    TypeScript 侧所有共享的数据结构。前后端（React ↔ Rust）
//    之间传递的数据，都是按照这些类型约定来序列化/反序列化的。
//
//    几乎所有前端组件和 bridge.ts 都会 import 本文件的类型。
//
//  【C/C++ 开发者注意】
//    TypeScript 的类型（interface / type）只在编译阶段存在，
//    编译为 JavaScript 后类型信息会被完全擦除——不像 C 的
//    struct 会保留到运行时。这里的 interface 不是 C++ 的
//    虚基类，而是纯静态的"数据形状描述"。
//
//    type   ≈ 给一组值起个名字（enum 的轻量替代，或联合类型）
//    interface ≈ 描述一个对象的字段结构（类似 C struct 声明）
//
//  【阅读顺序建议】
//    1. 先看 InputSource / TaskStage / TaskProgress（任务输入→执行）
//    2. 再看 Distillation / DistillationResult（AI 产出）
//    3. 然后看 TaskRecord / HistoryEntry（数据库持久化）
//    4. 最后看 AppPreferences / AppProfiles（全局配置）
// ============================================================

// ---- 任务输入（用户提供什么视频） ----

/**
 * 用户输入的视频来源类型。
 * type 关键字定义了"字符串字面量联合类型"——变量的值
 * 只能是这四个字符串之一，类似 C 中用 enum 但更轻量。
 */
export type InputSourceKind = 'file' | 'douyin_url' | 'bilibili_url' | 'youtube_url';

/**
 * 描述用户的输入源。
 * interface 定义一个对象的"形状"——它有哪些字段、字段是什么类型。
 * 这里的 `?` 表示"可选属性"：path 和 url 不是必须同时有的。
 * C/C++ 中没有直接对应的概念，但可以理解为"标记为可选的 struct 成员"。
 */
export interface InputSource {
  kind: InputSourceKind;   // 来源种类
  path?: string;            // 只有本地文件才有路径（`?` = 可省略）
  url?: string;             // 只有在线链接才有 URL
}

// ---- 任务生命周期（一个视频进来后经历哪些处理阶段） ----

/**
 * 任务的处理阶段——一个流水线枚举。
 * 这不同于 C/C++ 的 enum：在 TS 中，`type TaskStage = 'xxx' | 'yyy'`
 * 是用 `|`（联合运算符）定义"值只能是这几个字符串"的约束。
 * 注意结尾的 `;` 是 TypeScript 的语法习惯（无实际作用）。
 */
export type TaskStage =
  | 'downloading'           // 下载视频/字幕
  | 'subtitle_fetching'     // 获取字幕
  | 'preparing_audio'       // 准备音频数据
  | 'transcribing'          // 语音转文字（STT）
  | 'distilling'            // AI 总结提炼
  | 'capturing_screenshots' // 可选：截图
  | 'saving'                // 保存到本地
  | 'complete';             // 任务完成

/**
 * 任务的实时进度——前端进度条组件用这个来显示。
 * 这个 interface 对应用途明确的三个字段：
 *   stage   → 当前在第几步
 *   message → 给用户看的文字提示
 *   percent → 0–100 的完成百分比
 */
export interface TaskProgress {
  stage: TaskStage;
  message: string;
  percent: number;
  download?: DownloadTelemetry;
}

/** Real media-download telemetry. Optional for non-download task stages. */
export interface DownloadTelemetry {
  phase: 'resolving' | 'downloading' | 'processing';
  percent?: number;
  downloadedBytes: number;
  totalBytes?: number;
  speedBytesPerSecond?: number;
  etaSeconds?: number;
}

// ---- AI 提炼结果（任务完成后产出什么） ----

/**
 * AI 对视频内容做"蒸馏提炼"后产出的核心结果。
 * Distillation 是从任务流水线拿到的结构化数据。
 *
 * 字段中的 `KeyEvidence[]` 是"KeyEvidence 类型的数组"，
 * TS 中 `Type[]` 等价于 C 的 `Type arr[]` 概念。
 * `transcript?` 中的 `?` 表示字段可选（可能没有转录文本）。
 */
export interface Distillation {
  core_conclusion: string;     // 核心结论（AI 总结的一段话）
  key_evidence: KeyEvidence[]; // 关键依据列表（数组）
  implications: string[];      // 启示/行动建议（数组）
  transcript?: string;         // 原始转录文本（可选字段，`?`）
}

/**
 * 笔记风格——决定 AI 用什么"口吻"来写笔记。
 * 同样是 type + 字符串联合类型（类似 C 的 enum），
 * 但值是九个具体的字符串。
 */
export type NoteStyle =
  | 'minimal'          // 极简
  | 'detailed'         // 详细
  | 'tutorial'         // 教程
  | 'academic'         // 学术
  | 'xiaohongshu'      // 小红书风格
  | 'life_journal'     // 生活记录
  | 'task_oriented'    // 任务导向
  | 'business'         // 商业分析
  | 'meeting_minutes'; // 会议纪要

/**
 * 用户启动任务时的可选配置。
 * 所有字段在创建任务时由前端 UI 收集，然后
 * 通过 bridge.ts → invoke → Rust 命令传入后端。
 */
export interface TaskOptions {
  note_template: string;
  include_screenshots: boolean;
  note_style: NoteStyle;                            // 笔记风格
  transcription_mode?: TranscriptionMode;           // 语音识别模式
  sensevoice_model?: SenseVoiceModelId;             // 模型版本
  sensevoice_languages?: SenseVoiceLanguage[];      // 语言列表（数组）
}

/**
 * 一条"关键依据"——支撑 AI 核心结论的论据。
 * 对应 C 语言概念：存放一段证据文本 + 可选的时间戳/截图路径的结构体。
 */
export interface KeyEvidence {
  text: string;                 // 依据文字
  timestamp_seconds?: number;   // 视频中的时间点（秒，可省略）
  source_url?: string;          // 来源链接（可省略）
  screenshot_path?: string;     // 截图路径（可省略）
}

// ---- 历史记录（已生成笔记的数据库记录） ----

/**
 * 一条历史提取记录——对应 SQLite 数据库中一行。
 * 每次 AI 生成一篇笔记后，会在这里存一条记录供用户之后查看。
 *
 * 字段 `string | null` 表示该字段可以是字符串或 null（无值），
 * TS 的 `| null` 是显式的"可能为空"标记——类似 C++ 的 std::optional 但语法不同。
 */
export interface HistoryEntry {
  id: number;
  title: string;
  source: string;               // 原始视频来源（URL 或文件名）
  noteTemplate: string;
  noteStyle: NoteStyle;
  createdAt: string;            // ISO 时间字符串
  markdownPath: string;         // 生成的 Markdown 笔记文件路径
  transcriptPath: string;       // 转录文本文件路径
  thumbnailPath: string | null; // 缩略图（可能不存在）
  screenshotPaths: string[];    // 截图路径数组
}

// ---- 任务记录（任务历史页面用） ----

/**
 * 任务在数据库里的五种状态。
 * TS 的 type + union 定义了一组命名的可选值。
 */
export type TaskRecordState =
  | 'queued'     // 排队中
  | 'running'    // 正在运行
  | 'succeeded'  // 成功
  | 'failed'     // 失败
  | 'cancelled'; // 用户取消了

/**
 * 一次任务的完整记录——存于 SQLite task_records 表中。
 * 记录了任务从启动到结束的所有元数据。
 */
export interface TaskRecord {
  id: number;
  taskId: string;                         // 任务唯一 ID（UUID）
  title: string;
  sourceLabel: string;                    // 来源标签
  state: TaskRecordState;                 // 当前状态
  startedAt: string;                      // 开始时间（ISO）
  finishedAt: string | null;              // 结束时间（未完成时为 null）
  durationMs: number | null;              // 持续时间（毫秒）
  transcriptionProfileId: string;
  transcriptionProfileName: string;
  transcriptionModel: string;
  summaryProfileId: string;
  summaryProfileName: string;
  summaryModel: string;
  compute: string;                        // 计算模式（CPU/GPU/自动）
  noteId: number | null;                  // 关联的笔记 ID
  errorCode: string | null;               // 失败错误码
  diagnosticLogId: string | null;         // 诊断日志 ID
}

/**
 * 重试失败任务所需的"最小参数集"。
 * 任务失败后，用户点"重试"，后端从这里读取原始参数重建任务。
 */
export interface TaskRetryRequest {
  source: InputSource;
  options: TaskOptions;
  transcriptionProfileId: string;
  summaryProfileId: string;
}

// ---- 笔记库（Library） ----

/** 笔记排序方式 */
export type LibrarySort = 'newest' | 'recently_opened' | 'title';

/**
 * 搜索/过滤笔记时的查询条件。
 * 所有字段都有 `?`——意味着你可以只填一部分条件。
 * 例如只按标签搜而不填关键词。
 */
export interface LibraryQuery {
  text?: string;             // 搜索关键词
  favorite?: boolean | null; // true=只看收藏, false=只看未收藏, null=全部
  tag?: string | null;       // 按标签筛选
  sort?: LibrarySort;
  limit?: number;            // 返回条数上限
  offset?: number;           // 分页偏移（第几页）
}

/**
 * 笔记库中的一篇笔记 = 历史记录 + 收藏/标签信息。
 * `extends HistoryEntry` 表示在 HistoryEntry 的所有字段基础上，
 * 再加下面这三个字段（类似 C++ 的继承，但只继承结构）。
 */
export interface LibraryEntry extends HistoryEntry {
  favorite: boolean;                // 是否收藏
  tags: string[];                   // 标签列表
  lastOpenedAt: string | null;      // 上次打开时间
}

/** 一个标签和它被多少笔记使用 */
export interface LibraryTag {
  id: number;
  name: string;
  noteCount: number;
}

/**
 * 笔记库的一次"快照"——一次性将所有结果从 Rust 返回给前端。
 * 包含符合条件的笔记列表、标签列表和总数。
 */
export interface LibrarySnapshot {
  entries: LibraryEntry[];
  tags: LibraryTag[];
  total: number;
}

// ---- 首页 ----

/** 首页展示的概览信息 */
export interface HomeSnapshot {
  noteCount: number;              // 笔记总数
  taskCount: number;              // 任务总数
  readyLocalModelCount: number;   // 已就绪的本地模型数
  recentNotes: LibraryEntry[];    // 最近打开的笔记
  recentTasks: TaskRecord[];      // 最近的任务
}

// ---- AI 问答 ----

/**
 * AI 问答中的一次对话轮次。
 * role 是 'user' 或 'assistant'——TS 的 type + union
 * 限制 role 只能是这两个字符串之一，防止出错。
 */
export interface NoteChatTurn {
  role: 'user' | 'assistant';  // 谁说的（用户 / AI）
  content: string;              // 消息内容
}

/** 一次 AI "蒸馏"任务完成后返回给前端的结果 */
export interface DistillationResult {
  task_id: string;
  distillation: Distillation;  // 提炼结果内容
  saved_path: string;          // 保存到磁盘的文件路径
}

// ---- 错误处理（统一格式） ----

/**
 * 应用的统一错误格式。
 * 当 Rust 后端发生错误时，错误信息会通过这个格式返回给前端展示。
 */
export interface AppError {
  code: string;      // 错误码（如 "AUTH_FAILED"）
  message: string;   // 人类可读的错误描述
  recovery: string;  // 用户可以如何解决的建议
}

// ---- 用户偏好设置 ----

/**
 * 用户全部偏好设置的集合——对应磁盘上的 `preferences.json`。
 * 注意 `markdownOutputDir` 的类型是 `string | null`：
 *   有值时使用自定义目录，null 时使用系统默认位置。
 */
export interface AppPreferences {
  schemaVersion: number;                     // 配置格式版本号（用于迁移）
  markdownOutputDir: string | null;          // Markdown 输出目录
  localComputeMode: LocalComputeMode;        // CPU/自动
  transcriptionMode?: TranscriptionMode;    // 语音识别模式
  sensevoiceModel?: SenseVoiceModelId;      // 模型版本
  sensevoiceLanguages?: SenseVoiceLanguage[];// 识别语言列表
  appearance?: AppearancePreferences;        // 外观设置
  export?: ExportPreferences;                // 导出设置
  logLevel?: LogLevel;                       // 日志级别
}

// ---- 导出设置 ----

/** 导出格式 */
export type ExportFormat = 'markdown' | 'html' | 'text';

/** 导出偏好——决定生成的笔记被导出成什么格式 */
export interface ExportPreferences {
  format: ExportFormat;
  includeScreenshots: boolean;     // 是否包含截图
  includeSubtitles: boolean;       // 是否包含字幕
  includeSourceMetadata: boolean;  // 是否包含来源元数据
  includeDiagnosticLog: boolean;   // 是否包含诊断日志
}

// ---- 缓存管理 ----

/**
 * 缓存分类。
 * `'all'` 不在 CacheUsageItem 中出现——它只用于 clearCache 调用（清理全部）。
 */
export type CacheCategory = 'temporary_media' | 'screenshots' | 'transcription_intermediates' | 'ai_index' | 'all';

/** 一类缓存的占用情况 */
export interface CacheUsageItem {
  category: Exclude<CacheCategory, 'all'>;  // `Exclude<A,B>` 是 TS 泛型工具：从 A 中排除 B
  bytes: number;
  fileCount: number;
}

/** 所有缓存的占用总览 */
export interface CacheUsage {
  totalBytes: number;
  categories: CacheUsageItem[];
}

/** 清理缓存后的结果报告 */
export interface CacheClearResult {
  category: CacheCategory;
  removedBytes: number;     // 清理的字节数
  removedFiles: number;     // 清理的文件数
  preservedPaths: string[]; // 被保留的路径（没删的）
}

// ---- 日志管理 ----

/** 一个日志文件的描述 */
export interface LogDescriptor {
  id: string;
  name: string;               // 文件名
  bytes: number;              // 文件大小
  modifiedAt: string | null;  // 最后修改时间
}

/** 读取日志文件末尾时返回的结果 */
export interface LogTail {
  id: string;
  content: string;       // 日志文本内容
  truncated: boolean;    // 是否因为太长被截断
}

// ---- 外观设置 ----

/** 日志级别 */
export type LogLevel = 'debug' | 'info' | 'warning' | 'error';

/** 外观主题 */
export type AppearanceTheme = 'system' | 'light' | 'dark';

/** 外观偏好——控制应用的颜色主题、间距和动画 */
export interface AppearancePreferences {
  theme: AppearanceTheme;    // 跟随系统/浅色/深色
  compactDensity: boolean;   // 紧凑布局
  reducedMotion: boolean;    // 减少动画
}

// ---- 关于页 ----

/** 一个运行组件的状态 */
export interface AboutComponent {
  name: string;
  version: string;
  status: string;    // 就绪/已安装/错误
  license: string;   // 开源许可证
}

/** "关于"页面的完整快照 */
export interface AboutSnapshot {
  appVersion: string;      // 应用版本
  tauriVersion: string;    // Tauri 框架版本
  frontendVersion: string; // React 版本
  rustVersion: string;     // Rust 编译工具版本
  appDataDir: string;      // 应用数据目录
  exportDir: string;       // 导出目录
  logDir: string;          // 日志目录
  components: AboutComponent[]; // 各组件状态
}

// ---- 计算模式 & 语音识别 ----

/** 本地计算模式 */
export type LocalComputeMode = 'auto' | 'cpu';

/** 语音识别（STT）的三种模式 */
export type TranscriptionMode = 'sensevoice_cpu' | 'whisper_local' | 'online_profile';

/** SenseVoice 模型的两种精度 */
export type SenseVoiceModelId = 'int8' | 'float32';

/** SenseVoice 支持的识别语言 */
export type SenseVoiceLanguage = 'zh' | 'en' | 'ja' | 'ko' | 'yue';

/** 模型文件的状态 */
export type ArtifactState = 'missing' | 'partial' | 'ready' | 'failed' | 'corrupt';

/** 一个 SenseVoice 模型的状态 */
export interface SenseVoiceModelStatus {
  id: SenseVoiceModelId;
  state: ArtifactState;        // 当前状态
  downloadedBytes: number;     // 已下载字节数
  totalBytes: number;          // 总字节数
  isSelected: boolean;         // 是否当前选中
}

/** SenseVoice 整体状态 */
export interface SenseVoiceStatus {
  state: ArtifactState;
  selectedModel: SenseVoiceModelId;
  runtimeReady: boolean;       // 运行时是否就绪
  tokensReady: boolean;        // 分词器是否就绪
  modelPath: string | null;    // 模型文件路径
  models: SenseVoiceModelStatus[];
  downloadedBytes: number;
  totalBytes: number;
}

/** SenseVoice 下载进度 */
export interface SenseVoiceDownloadProgress {
  modelId: SenseVoiceModelId;
  artifactId: string;
  downloadedBytes: number;
  totalBytes: number;
  overallPercent: number;      // 整体百分比
}

// ---- CUDA / GPU 加速 ----

/** CUDA 运行时状态枚举 */
export type CudaRuntimeState = 'unavailable' | 'not_installed' | 'downloading' | 'ready' | 'incompatible' | 'error';

/** CUDA 运行时状态 */
export interface CudaRuntimeStatus {
  state: CudaRuntimeState;
  gpuName: string | null;     // 检测到的 GPU 名称
  version: string;            // CUDA 版本号
  computeMode: LocalComputeMode;
  message: string | null;     // 给用户的提示信息
}

/** CUDA 运行时下载进度 */
export interface CudaRuntimeDownloadProgress {
  downloadedBytes: number;
  totalBytes: number;
}

// ---- 下载平台 Cookie ----

/** 视频来源平台 */
export type DownloadPlatform = 'bilibili' | 'douyin' | 'youtube';

/** 各平台的 Cookie 是否已配置（仅显示有无，不暴露内容） */
export interface DownloadCookieStatus {
  bilibili: boolean;
  douyin: boolean;
  youtube: boolean;
}

// ============================================================
// AI 服务商 & 模型（与 Rust `profiles.rs` 对应）
// ============================================================

/** 语音识别服务商类型 */
export type TranscriptionProviderKind =
  | 'tencent_flash'     // 腾讯云语音识别
  | 'mimo_asr'          // MiMo 语音识别
  | 'open_ai_compatible'// OpenAI 兼容接口
  | 'local_whisper_cpp';// 本地 Whisper（CPU/GPU）

/** 在线转写识别语言；腾讯云仍以具体 engine/model 的语言能力为准。 */
export type OnlineTranscriptionLanguage = 'auto' | 'zh' | 'en' | 'ja' | 'ko' | 'yue';

/** 每个在线转写配置档的运行参数。 */
export interface OnlineTranscriptionOptions {
  language: OnlineTranscriptionLanguage;
  timeoutMs: number;
  maxConcurrency: number;
}

/** 服务商目录中的一个模型 */
export interface SummaryModelCatalogEntry {
  id: string;
  name: string;
  summaryEligible: boolean;   // 这个模型能否用来做"总结提炼"
  summaryIneligibleReason?: string; // 不能用的原因
  family?: string;
  modalities: unknown;
  capabilities: unknown;
  limit: unknown;
  cost: unknown;
  status?: string;
  releaseDate?: string;
  lastUpdated?: string;
}

/** 服务商目录中的一个服务商（如 OpenAI、Anthropic） */
export interface SummaryProviderCatalogEntry {
  id: string;
  displayName: string;     // 显示名称
  description: string;     // 描述
  protocol: string;        // 协议类型
  baseUrl: string;         // API 基础地址
  documentationUrl?: string;
  npmPackage: string;
  models: SummaryModelCatalogEntry[];
}

/** 保存一个"目录中的模型"到用户配置时需要提交的数据 */
export interface SaveCatalogSummaryProfileInput {
  providerId: string;
  model: string;
  baseUrlOverride?: string;
  credential?: SecretInput; // API 密钥
}

/** AI 总结服务商类型 */
export type SummaryProviderKind =
  | 'deep_seek'
  | 'mimo'
  | 'open_ai_compatible'
  | 'open_ai_responses'
  | 'anthropic'
  | 'google';

/** 一个语音识别配置（用户可创建多个） */
export interface TranscriptionProfile {
  id: string;
  name: string;          // 用户起的名称
  provider: TranscriptionProviderKind;
  baseUrl: string;       // API 地址
  model: string;         // 使用的模型
  enabled: boolean;      // 是否启用
  builtIn: boolean;      // 是否内置（内置的不让删）
  onlineOptions?: OnlineTranscriptionOptions; // 旧配置缺省时由前后端使用安全默认值
}

/** 一个 AI 总结配置 */
export interface SummaryProfile {
  id: string;
  name: string;
  provider: SummaryProviderKind;
  baseUrl: string;
  model: string;
  enabled: boolean;
  builtIn: boolean;
}

/** 所有配置的快照 */
export interface AppProfiles {
  schemaVersion: number;
  activeTranscriptionProfileId: string | null;  // 当前用的语音识别配置
  activeSummaryProfileId: string | null;         // 当前用的AI总结配置
  fallbackTranscriptionProfileId: string | null; // 备用语音识别配置
  migrationRequired: boolean;                    // 是否需要迁移旧配置
  transcriptionProfiles: TranscriptionProfile[];
  summaryProfiles: SummaryProfile[];
}

// ---- 本地 Whisper 模型管理 ----

/** 本地 Whisper 模型的状态 */
export type LocalModelState = 'not_downloaded' | 'downloading' | 'ready' | 'corrupt' | 'failed';

/** 一个本地 Whisper 模型的状态 */
export interface LocalModelStatus {
  id: string;
  state: LocalModelState;
  downloadedBytes: number;
  totalBytes: number;
  isCurrent: boolean;    // 是否当前激活的模型
}

/** 本地模型下载进度 */
export interface LocalModelDownloadProgress {
  modelId: string;
  downloadedBytes: number;
  totalBytes: number;
}

// ============================================================
// 命令相关类型
// ============================================================

/** 测试一个 AI 服务商配置的结果 */
export interface ProfileTestResult {
  success: boolean;
  message: string;
  latencyMs: number | null; // 响应延迟（毫秒）
}

/** 当主服务商不可用时，自动切换到备用服务商的通知 */
export interface ProviderFallbackEvent {
  fromProfileId: string;   // 从哪个配置切换
  fromProfileName: string;
  toProfileId: string;     // 切换到哪个配置
  toProfileName: string;
  reason: string;          // 切换原因
}

/** API 密钥的两种格式 */
export type SecretInput =
  | { type: 'bearer'; apiKey: string }              // Bearer Token（OpenAI/Anthropic等）
  | { type: 'tencent'; appId: string; secretId: string; secretKey: string }; // 腾讯云签名

// ============================================================
// AI 能力（向量搜索、重排、联网搜索、语音合成、作图、本地智能体）
// ============================================================

/** 向量搜索配置 */
export interface VectorCapability {
  enabled: boolean;
  providerId: string;       // 用哪个服务商
  endpoint: string;         // API 地址
  model: string;
  collection: string;
  dimensions: number | null;
}

/** 重排（Rerank）配置 */
export interface RerankCapability {
  enabled: boolean;
  providerId: string;
  endpoint: string;
  model: string;
}

/** 联网搜索配置 */
export interface WebSearchCapability {
  enabled: boolean;
  providerId: string;
  endpoint: string;
  maxResults: number;
}

/** 语音合成（TTS）配置 */
export interface TtsCapability {
  enabled: boolean;
  providerId: string;
  endpoint: string;
  model: string;
  voice: string;           // 声音类型
}

/** AI 作图配置 */
export interface ImageCapability {
  enabled: boolean;
  providerId: string;
  endpoint: string;
  model: string;
  size: string;            // 图片尺寸
}

/** 本地智能体配置 */
export interface LocalAgentCapability {
  enabled: boolean;
  providerId: string;
  executable: string;      // 要运行的程序路径
  arguments: string[];     // 程序参数
  timeoutSeconds: number;  // 超时时间
}

/** 所有 AI 能力的配置快照 */
export interface CapabilitySettings {
  schemaVersion: number;
  vector: VectorCapability;
  rerank: RerankCapability;
  webSearch: WebSearchCapability;
  tts: TtsCapability;
  image: ImageCapability;
  localAgent: LocalAgentCapability;
}

/** 一个能力的就绪状态 */
export interface CapabilityItemStatus {
  enabled: boolean;
  configured: boolean;     // 是否已配置
  credentialReady: boolean;// 凭据是否就绪
  providerId: string;
}

/** 所有能力的就绪状态 */
export interface CapabilityStatus {
  vector: CapabilityItemStatus;
  rerank: CapabilityItemStatus;
  webSearch: CapabilityItemStatus;
  tts: CapabilityItemStatus;
  image: CapabilityItemStatus;
  localAgent: CapabilityItemStatus;
}

/** 本地模型注册信息 */
export interface LocalModelRegistryEntry {
  id: string;
  name: string;
  size: number;            // 模型文件大小
  hash: string;            // SHA256 校验值
  supportedLanguages: string[];
}

// ============================================================
// 别名——为兼容原有代码，以下类型名是上面定义的同义名
// ============================================================

/** VectorConfig = VectorCapability（向量搜索配置的别名） */
export type VectorConfig = VectorCapability;

/** RerankConfig = RerankCapability（重排配置的别名） */
export type RerankConfig = RerankCapability;

/** WebSearchConfig = WebSearchCapability（联网搜索配置的别名） */
export type WebSearchConfig = WebSearchCapability;

/** TtsConfig = TtsCapability（语音合成配置的别名） */
export type TtsConfig = TtsCapability;

/** ImageConfig = ImageCapability（AI作图配置的别名） */
export type ImageConfig = ImageCapability;

/** LocalAgentConfig = LocalAgentCapability（本地智能体配置的别名） */
export type LocalAgentConfig = LocalAgentCapability;

/** CapabilityStatusItem = CapabilityItemStatus（能力就绪状态的别名） */
export type CapabilityStatusItem = CapabilityItemStatus;

/**
 * AI 能力测试连接的结果
 * 调用某个 AI 服务商的测试接口后返回：是否成功以及消息
 */
export interface CapabilityTestResult {
  ok: boolean;       // 测试是否通过
  message: string;   // 测试结果说明
}

/**
 * 语义搜索结果中的一条命中记录
 * 向量搜索后返回：哪篇笔记匹配了你的搜索
 */
export interface SearchHit {
  id: string;       // 笔记 ID
  score: number;    // 匹配分数（越高越相关）
  text: string;     // 匹配到的文本片段
}

/**
 * 联网搜索结果中的一条
 * 从搜索引擎（如 Tavily）返回的结果
 */
export interface WebSearchResult {
  title: string;     // 结果标题
  url: string;       // 结果链接
  snippet: string;   // 结果摘要
}

/**
 * 本地智能体检测结果
 * 扫描本地电脑后发现的可用的 AI 编程助手
 */
export interface LocalAgentDetection {
  providerId: string;         // 智能体 ID
  configured: boolean;        // 是否已配置
  executableFound: boolean;   // 是否找到了可执行文件
}

/**
 * 本地智能体的运行结果
 * 向本地 AI 编程助手发送任务后返回的结果
 */
export interface LocalAgentResult {
  answer: string;   // 智能体的回答内容
}
