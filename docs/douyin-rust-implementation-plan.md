# Rust vs C++ 实现抖音下载器可行性对比

## 核心算法：a_bogus 生成

### Python 原始实现依赖
1. gmssl.sm3 - SM3 国密哈希
2. random, re, time, urllib.parse - 标准库

### Rust 实现
✅ sm3 crate - 可用
✅ rand crate - 可用
✅ regex crate - 可用
✅ url crate - 可用
✅ reqwest/tokio - 已在项目中使用
✅ 与现有 Tauri 后端无缝集成

### C++ 实现
⚠️ 需要单独编译为 DLL/动态库
⚠️ 需要 Tauri sidecar 配置
⚠️ 跨进程通信开销
⚠️ SM3 库选择较少
⚠️ 部署复杂度增加

## 结论：选择 Rust

原因：
1. 与现有 Tauri/Rust 后端完美集成
2. Cargo 依赖管理简单
3. 无需额外的构建链
4. 类型安全 + 性能保证
5. 社区 crate 生态完善

## 实施计划

### 阶段 1：Rust ABogus 算法移植（核心）
文件：src-tauri/src/services/douyin_native.rs
依赖：
- sm3 = "0.10"
- rand = "0.8"
- base64 = "0.21"
- hex = "0.4"

### 阶段 2：抖音 API 封装
- 视频 ID 提取
- msToken 生成
- API 请求封装
- 音频/视频下载

### 阶段 3：降级策略
- 原生下载失败 → 自动尝试 yt-dlp + Cookie
- 前端显示降级提示
- 用户可手动切换

预计时间：3-4 天（专注开发）
