# 语音转文字设置页面前端效果迁移

**日期**: 2026-07-26
**任务**: 将 CipherTalk 的"语音转文字"设置页面的前端效果完整迁移到 VedioNotes

## 迁移概述

从 CipherTalk (Electron) 的 `SttTab.tsx` 迁移前端视觉效果到 VedioNotes (Tauri) 的 `TranscriptionTab.tsx`。

## 主要改进

### 1. **组件升级**
- ✅ 使用 HeroUI 的完整 `Card` API（`Card.Header`, `Card.Content`, `Card.Footer`）
- ✅ 使用 `RadioGroup` 和 `Radio` 组件替代原生 HTML `<input type="radio">`
- ✅ 使用 `Checkbox` 和 `CheckboxGroup` 组件替代原生复选框
- ✅ 使用 `Alert` 组件替代自定义错误横幅和状态提示
- ✅ 使用 `AlertDialog` 组件替代自定义确认对话框
- ✅ 使用 `Chip` 组件显示状态标签
- ✅ 使用 `Typography` 组件统一文本样式

### 2. **CPU 模式改进**
- **模型选择**: 使用 `RadioGroup` 提供更好的键盘导航和可访问性
- **模型版本卡片**: 添加图标（`Thunderbolt` for int8, `Layers` for float32）
- **状态显示**: 使用 `Alert` 组件，支持 success/warning/default 状态
- **进度条**: 改进进度条显示，使用 `ProgressBar.Track` 和 `ProgressBar.Fill`
- **语言选择**: 使用 `Checkbox.Control` 和 `Checkbox.Content` 提供更好的结构

### 3. **GPU 模式改进**
- **CUDA 运行时卡片**: 使用 `Card.Header/Content/Footer` 结构
- **状态芯片**: 使用 `Chip` 组件显示状态，支持颜色变化
- **计算模式**: 使用 `Card` 包装，提供更清晰的布局
- **本地模型列表**: 每个模型使用完整的 `Card` 结构，包含状态和操作按钮

### 4. **在线模式改进**
- **空状态**: 使用 `Alert` 组件显示友好的空状态提示
- **配置档卡片**: 使用 `Card` 和 `Chip` 显示配置状态
- **一致性**: 与 CPU/GPU 模式保持视觉一致性

### 5. **确认对话框改进**
- 使用 HeroUI 的 `AlertDialog` 组件
- 支持 `AlertDialog.Icon` 显示警告/危险图标
- 更好的可访问性和键盘导航
- 统一的关闭和确认按钮样式

### 6. **按钮改进**
- 所有按钮从 `onClick` 改为 `onPress`（HeroUI 标准）
- 添加 `type="button"` 防止表单提交
- 图标大小统一为 14px 或 16px
- 使用 `variant` 属性（primary, secondary, outline, danger, tertiary）

## 技术细节

### 导入更新
```typescript
// 新增导入
import {
  Alert,
  AlertDialog,
  Chip,
  Description,
  Label,
  Radio,
  RadioGroup,
  Typography
} from '@heroui/react';

// 新增图标
import { Layers, Thunderbolt } from '@gravity-ui/icons';
```

### 架构保持
- ✅ 保持 `settingsPlatform` 适配器（Tauri 后端通信）
- ✅ 保持现有的状态管理逻辑
- ✅ 保持现有的事件监听器和下载进度处理
- ✅ 不引入 Electron 依赖

### CSS 兼容
- ✅ 复用现有的 `cipher-settings.css` 样式
- ✅ 所有 CSS 类名保持不变
- ✅ 新增的 HeroUI 组件使用内置样式

## 改动统计

```
src/features/settings/tabs/TranscriptionTab.tsx | 533 ++++++++++++++++--------
1 file changed, 348 insertions(+), 185 deletions(-)
```

## 视觉效果对比

### CPU 模式
**之前**: 原生 radio 按钮 + 自定义横幅
**之后**: HeroUI RadioGroup + Alert 组件 + Chip 状态标签

### GPU 模式
**之前**: 简单的 div + 原生按钮
**之后**: Card 结构化布局 + Chip 状态 + 改进的进度条

### 在线模式
**之前**: 基础文本提示
**之后**: Alert 空状态 + Card 配置档显示

### 确认对话框
**之前**: 自定义 overlay + dialog CSS
**之后**: HeroUI AlertDialog 组件

## 测试验证

### 构建测试
```bash
npm run build  # ✅ 通过
```

### 功能测试清单
- [ ] CPU 模式：模型选择和下载
- [ ] CPU 模式：语言多选
- [ ] GPU 模式：CUDA 运行时管理
- [ ] GPU 模式：计算模式切换
- [ ] GPU 模式：本地模型管理
- [ ] 在线模式：配置档显示
- [ ] 所有模式：刷新状态
- [ ] 所有对话框：确认和取消操作
- [ ] 键盘导航和可访问性

## 兼容性

- ✅ **不影响后端**: 所有 Tauri 命令调用保持不变
- ✅ **不影响数据流**: 状态管理和事件监听器逻辑保持不变
- ✅ **向后兼容**: CSS 类名保持不变，现有样式仍然生效
- ✅ **无新依赖**: 所有使用的组件都来自已安装的 `@heroui/react`

## 后续优化建议

1. **响应式优化**: 在小屏幕下测试双栏布局的折叠效果
2. **动画效果**: 添加模态框和状态切换的过渡动画
3. **错误处理**: 为下载失败添加重试机制
4. **加载状态**: 为异步操作添加骨架屏
5. **深色模式**: 测试所有组件在深色主题下的显示效果

## 参考

- **源文件**: `D:\Project\CipherTalk\src\components\settings\tabs\SttTab.tsx` (1094 行)
- **目标文件**: `D:\Project\notes\src\features\settings\tabs\TranscriptionTab.tsx` (现 612 行)
- **备份文件**: `TranscriptionTab.tsx.backup`
- **样式文件**: `src/styles/cipher-settings.css`

## 总结

本次迁移成功将 CipherTalk 中更成熟的前端效果引入到 VedioNotes，同时保持了 Tauri 架构的完整性。所有改进都聚焦于视觉效果和用户体验，没有改变任何业务逻辑或后端交互。
