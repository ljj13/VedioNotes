# VedioNotes 设置中心 UI 修复 + 抖音下载 C 方案调研报告

## 执行时间
2026-07-25 00:38:31

## 一、C 方案（Rust 原生抖音下载器）可行性调研

### 1.1 发现的开源实现

从 BiliNote 项目中发现完整的 Python 抖音下载器实现：

**核心文件**：
- D:\Project\BiliNote\backend\app\downloaders\douyin_downloader.py (~300 行)
- D:\Project\BiliNote\backend\app\downloaders\douyin_helper\abogus.py (~630 行)

### 1.2 技术实现要点

#### a_bogus 参数生成（核心反爬机制）
抖音 Web API 的 _bogus 参数是一个复杂的混淆算法，包含：
- SM3 国密哈希算法（需要 gmssl 库）
- 多层编码转换（Base64 变种）
- UA Code 计算（浏览器指纹）
- 时间戳处理
- 30+ 个浏览器环境参数

#### Cookie 强制要求
与 Bilibili 不同，抖音**必须**提供有效 Cookie：
- 即使公开视频也需要 Cookie
- yt-dlp 报错：Fresh cookies (not necessarily logged in) are needed

#### 动态参数
- **msToken**：需要实时请求 https://mssdk.bytedance.com/web/report
- **ttwid**：需要请求 https://ttwid.bytedance.com/ttwid/union/register/

### 1.3 Rust 实现难点

| 难点 | 复杂度 | 说明 |
|------|--------|------|
| SM3 哈希移植 | ⭐⭐⭐ | 需要 sm3 crate |
| ABogus 算法移植 | ⭐⭐⭐⭐⭐ | 630 行混淆逻辑 |
| 动态参数管理 | ⭐⭐⭐ | msToken/ttwid HTTP 请求 |
| Cookie 管理 | ⭐⭐ | 已有 cookie_service.rs |
| 反爬对抗 | ⭐⭐⭐⭐⭐ | 算法可能随时失效 |

### 1.4 方案对比

| 方案 | 开发时间 | 维护成本 | 成功率 | 推荐度 |
|------|---------|---------|--------|--------|
| **A. Cookie UI + yt-dlp** | 1-2 天 | 低 | 高 | ⭐⭐⭐⭐⭐ |
| **B. 用户手动操作** | 0 天 | 无 | 中 | ⭐ |
| **C. Rust 原生实现** | 2-3 周 | 极高 | 中 | ⭐⭐ |

### 1.5 最终建议

**优先采用方案 A**（添加 Cookie 管理 UI + yt-dlp），原因：

✅ **后端已完成**：src-tauri/src/services/cookie_service.rs 已实现
✅ **快速上线**：只需添加前端 UI
✅ **用户友好**：提供浏览器 Cookie 导出指南
✅ **长期可维护**：yt-dlp 社区持续更新
⚠️ **C 方案备选**：仅在 yt-dlp 长期失效时考虑

---

## 二、设置中心 UI 修复

### 2.1 修复的问题

#### 问题 1：页面标题区域过高
**修复前**：
- SETTINGS 小标题 + "设置"大标题 + 说明文字占据过多垂直空间
- 顶部留白过大

**修复后**：
- 压缩 .settings-page-header 的 min-height 从 67px → 48px
- 减少 padding 从 5px 2px 10px → 2px 2px 6px
- 标题字体从 clamp(30px, 3.2cqi, 34px) → clamp(24px, 2.8cqi, 28px)
- 说明文字从 12px → 11.5px

#### 问题 2：顶部五项导航选中态双层背景
**修复前**：
- 选中项同时叠加两层背景（浅绿色 + 白色胶囊）
- 不同选项选中后尺寸不一致

**修复后**：
`css
/* 只保留单层白色选中态 */
[role='tab'][aria-selected='true'] {
  color: var(--accent) !important;
  background: #ffffff !important;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}

/* 移除 ::before / ::after 伪元素 */
[role='tab']::before,
[role='tab']::after {
  display: none !important;
}
`

#### 问题 3：关于页面文字溢出
**修复前**：
- 运行组件卡片中状态标签超出边界
- Rust 版本号等长文本撑破卡片
- 标题与状态标签重叠

**修复后**：
`css
/* 卡片内容区域 */
.cipher-about-component-card {
  min-height: 156px;
  padding: 18px 20px;
  display: flex;
  flex-direction: column;
}

/* 标题区域为状态标签预留空间 */
.cipher-about-component-copy {
  flex: 1 1 auto;
  min-width: 0;
  padding-right: 8px;
}

/* 状态标签固定尺寸 */
.cipher-about-component-status {
  flex: 0 0 auto;
  max-width: 130px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 长文本允许换行 */
.cipher-about-version-item dd {
  overflow-wrap: anywhere;
  word-break: break-all;
}
`

#### 问题 4：AI 接入页面双栏布局
**修复前**：
- 左侧表单和右侧摘要挤成一列
- 服务商摘要文字拥挤

**修复后**：
`css
.cipher-ai-split-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(280px, 380px);
  gap: 20px;
  min-width: 0;
}

/* 响应式：窄窗口时变为单列 */
@container settings-panel (max-width: 900px) {
  .cipher-ai-split-layout {
    grid-template-columns: minmax(0, 1fr);
  }
}
`

#### 问题 5：数据管理/语音转文字二级导航
**修复前**：
- 二级导航样式不统一
- 选中态不清晰

**修复后**：
`css
.cipher-data-subnav,
.cipher-transcription-subnav {
  display: flex;
  gap: 6px;
  padding: 4px;
  background: var(--surface-hover);
  border: 1px solid var(--border);
  border-radius: 12px;
}

button[aria-selected='true'] {
  color: var(--accent);
  background: #ffffff;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.06);
}
`

### 2.2 统一的布局约束

#### 所有 Grid/Flex 子项
`css
.cipher-settings-root [class*='-grid'],
.cipher-settings-root [class*='-card'],
.cipher-settings-root [class*='-content'] {
  min-width: 0; /* 防止子元素撑破容器 */
}
`

#### 长文本处理
`css
/* 普通说明文字 */
overflow-wrap: anywhere;
word-break: break-word;
line-height: 1.5;

/* 长 URL/版本号/模型名 */
overflow-wrap: anywhere;
word-break: break-all;
`

#### 卡片统一规范
`css
/* 所有卡片 */
box-sizing: border-box;
min-width: 0;
padding: 16px-20px;
border-radius: var(--settings-card-radius);
border: 1px solid var(--settings-card-border);
`

### 2.3 响应式断点

`css
/* 窄屏：AI 双栏 → 单栏 */
@container settings-panel (max-width: 900px) { ... }

/* 中屏：关于页网格 → 2列 */
@container settings-panel (max-width: 780px) { ... }

/* 小屏：所有网格 → 单列 */
@container settings-panel (max-width: 600px) { ... }
`

### 2.4 修改的文件

| 文件 | 修改内容 |
|------|---------|
| src/styles/cipher-settings.css | 追加 500+ 行修复 CSS |

---

## 三、构建状态

### 3.1 构建命令
`ash
cd D:\Project\notes
npm run tauri build -- --no-bundle
`

**状态**：✅ 已下达构建命令，正在后台执行

### 3.2 预期输出
- D:\Project\notes\src-tauri\target\release\VedioNotes.exe
- FileVersion / ProductVersion: 0.0.1

### 3.3 验证清单

构建完成后需验证：

#### 视觉验证
- [ ] "设置"标题区高度明显降低
- [ ] 顶部五项导航选中态为单层白色胶囊
- [ ] 切换五个分类（外观/语音转文字/AI接入/数据管理/关于）正常
- [ ] 关于页所有卡片文字不溢出
- [ ] AI 接入页双栏布局正常
- [ ] 数据管理/语音转文字二级导航样式统一
- [ ] 窄窗口下布局降级为单列

#### 功能验证
- [ ] 所有设置项保存正常
- [ ] 外观切换立即生效
- [ ] AI 服务商搜索正常
- [ ] 模型下载/删除正常
- [ ] Markdown 输出目录选择正常
- [ ] 关于页"打开目录"按钮正常

#### 技术验证
`ash
npm test                    # 测试通过
npm run build               # 构建通过
cargo check --offline       # Rust 检查通过
`

---

## 四、后续工作

### 4.1 方案 A：添加 Cookie 管理 UI（推荐优先）

需要修改的文件：
1. src/features/settings/tabs/DataManagementTab.tsx
   - 在"数据管理"页添加"下载 Cookie 管理"区域
   - 显示 bilibili/douyin/youtube 的 Cookie 状态
   - 提供粘贴/保存/删除 Cookie 功能

2. src/platform/settings/data.ts
   - 添加 Cookie 平台适配器方法
   - getCookieStatus(platform: string)
   - saveCookie(platform: string, cookie: string)
   - deleteCookie(platform: string)

3. 提供用户指南
   - 如何从浏览器 DevTools 导出 Cookie
   - 抖音 Cookie 格式要求

**预计工作量**：1-2 天

### 4.2 方案 C：Rust 原生抖音下载器（备选）

仅在以下情况考虑：
- yt-dlp 长期无法支持抖音
- Cookie 方案无法满足需求
- 有充足的开发和维护资源

**预计工作量**：2-3 周

---

## 五、技术债务

### 5.1 CSS 文件大小
- cipher-settings.css 现在约 1,500 行
- 建议后续拆分为多个模块文件

### 5.2 HeroUI 下拉框
- 当前使用自定义样式覆盖
- 未来版本可能需要适配 HeroUI 更新

### 5.3 响应式测试
- 当前修复基于 CSS 静态分析
- 建议在多个窗口尺寸下实际测试

---

## 六、参考资料

### BiliNote 抖音下载器
- 仓库：D:\Project\BiliNote
- 核心文件：ackend/app/downloaders/douyin_downloader.py
- ABogus 算法：ackend/app/downloaders/douyin_helper/abogus.py
- 许可证：需确认

### Rust SM3 实现
- crate: sm3 (https://crates.io/crates/sm3)
- 国密 SM3 哈希算法

### yt-dlp
- GitHub: https://github.com/yt-dlp/yt-dlp
- Cookie 文档: https://github.com/yt-dlp/yt-dlp#authentication-options

---

## 七、总结

### 已完成
✅ C 方案可行性调研完成
✅ 推荐采用方案 A（Cookie UI + yt-dlp）
✅ 设置中心 UI 全面修复
✅ 构建命令已下达

### 待验证
⏳ 等待构建完成
⏳ 实际启动应用进行视觉验证
⏳ 功能回归测试

### 下一步
1. 等待构建完成（约 5-10 分钟）
2. 启动 VedioNotes.exe 进行视觉验证
3. 根据验证结果进行微调
4. 确认无误后开始方案 A 的 Cookie UI 开发

---

生成时间：2026-07-25 00:38:31
构建状态：后台执行中
