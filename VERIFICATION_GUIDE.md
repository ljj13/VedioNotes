# 设置页布局验证指南

## 免责声明

我无法直接运行 Windows GUI 应用程序进行截图和实际测量。以下是基于代码分析的验证步骤和可能的问题点。

## 验证步骤

### 1. 启动应用并打开开发者工具

```bash
# 启动应用
D:\Project\notes\src-tauri\target\release\VedioNotes.exe

# 在应用中按 F12 或 Ctrl+Shift+I 打开开发者工具
```

### 2. 打开设置页面

点击左侧边栏的"设置"按钮

### 3. 运行测量脚本（侧边栏展开状态）

在 Console 中粘贴并运行 `tests/measure-settings-layout.js` 的内容

保存输出为 `expanded-measurements.json`

### 4. 收起侧边栏

点击侧边栏底部的收起按钮

### 5. 再次运行测量脚本（侧边栏收起状态）

保存输出为 `collapsed-measurements.json`

### 6. 截图

- 展开状态：另存为 `screenshots/settings-expanded.png`
- 收起状态：另存为 `screenshots/settings-collapsed.png`

### 7. 分析数据

比较两个 JSON 文件中以下元素的 `top` 值：

```
.settings-page-header-copy
.settings-navigation-tabs
.settings-body
```

## 预期结果

### 正确的几何关系

| 元素 | 展开 top | 收起 top | 差值 | 状态 |
|------|----------|----------|------|------|
| settings-page-header-copy | ? | ? | ≤2px | ✓/✗ |
| settings-navigation-tabs | ? | ? | ≤2px | ✓/✗ |
| settings-body | ? | ? | ≤2px | ✓/✗ |

### 允许变化的属性

- `left`: 随主内容整体左移
- `width`: 导航和内容区域变宽
- `clientWidth`: 容器宽度增加

### 不允许变化的属性

- `top`: 差值必须 ≤2px
- `height`: 标题区和导航高度应保持一致
- `display`: 不应该从 grid 切换到 flex 或其他

## 可能的问题点（基于代码分析）

### 问题1: settings-shell-layout 的列宽设置

**当前值:**
```css
grid-template-columns: minmax(220px, 300px) minmax(0, 1fr);
```

**问题:** 如果父容器宽度计算有误，可能导致列宽异常

### 问题2: 容器查询断点

**当前值:**
```css
@container settings-stage (max-width: 760px)
```

**需要验证:**
- 展开状态下 `.cipher-settings-root` 的实际宽度是多少？
- 收起状态下是多少？
- 是否有一个状态命中了 760px 断点而另一个没有？

### 问题3: cipher-settings-root 的 padding

**当前值:**
```css
padding: clamp(16px, 2.3%, 28px);
```

**需要验证:** 这个 padding 在两种状态下是否一致？

### 问题4: app-main 的 padding 被重置

**在 app.css 中:**
```css
.workbench-app.view-settings .app-main { padding: 0; }
```

这可能导致设置页面的布局与其他页面不一致

## 修复建议（待验证后再应用）

如果验证发现问题，可以尝试以下修复：

### 修复A: 确保 Grid 布局稳定

```css
.cipher-settings-root .settings-shell-layout {
  display: grid;
  grid-template-columns: minmax(220px, 300px) minmax(0, 1fr);
  grid-template-rows: auto minmax(0, 1fr);
  grid-template-areas: "header tabs" "body body";
  align-items: start; /* 确保顶部对齐 */
}

.cipher-settings-root .settings-page-header {
  align-self: start; /* 明确指定对齐方式 */
}

.cipher-settings-root .settings-navigation-tabs {
  align-self: start; /* 与 header 保持一致 */
}
```

### 修复B: 调整容器查询断点

根据实际测量值调整，而不是猜测

### 修复C: 移除可能的冲突样式

检查是否有针对 `.sidebar-collapsed` 的特殊设置页样式

## 检查清单

- [ ] 已启动应用
- [ ] 已打开开发者工具
- [ ] 已在展开状态运行测量脚本
- [ ] 已保存展开状态截图
- [ ] 已收起侧边栏
- [ ] 已在收起状态运行测量脚本
- [ ] 已保存收起状态截图
- [ ] 已分析 JSON 数据
- [ ] 已计算 top 差值
- [ ] 已确认问题点

## 报告格式

完成验证后，请提供：

1. 两张截图路径
2. 关键元素的坐标对比表格
3. 容器查询的实际宽度值
4. 命中的 CSS 规则列表
5. 问题描述

只有完成以上验证，才能确定真正的根因并应用正确的修复。
