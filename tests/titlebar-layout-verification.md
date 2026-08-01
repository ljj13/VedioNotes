# 标题栏和设置页布局验证清单

## 一、上一轮错误判断纠正

### 错误判断
上一轮声称："侧边栏收起后主内容区变宽，可能触发 @container (max-width: 900px)"

### 为什么不成立
- `@container (max-width: 900px)` 只在容器宽度 ≤ 900px 时触发
- 侧边栏从 220px 收起到 88px，主内容区**增加**了 132px 宽度
- 宽度增加不会触发 `max-width` 条件，反而可能退出已触发的查询
- 因此将断点从 900px 改到 720px 是无依据的猜测

### 真正的问题
1. **标题栏布局错误**：Grid 模板为 4 列（品牌、文字、拖动区、按钮），删除文字后只剩 3 个元素，导致按钮错位到中间
2. **设置页布局使用了不合理的列宽比例**：`minmax(560px, 1.44fr)` 设置了过大的最小宽度

## 二、窗口按钮跑到中间的根因

### 根本原因
原标题栏 Grid 布局：
```css
grid-template-columns: minmax(180px, 1fr) auto minmax(180px, 1fr) auto;
```

这是为 4 个元素设计的：
1. 品牌区（1fr）
2. 标题文字（auto）
3. 拖动区（1fr）
4. 窗口按钮（auto）

删除标题文字后只剩 3 个元素，但 Grid 还是 4 列，导致：
- 品牌区占第 1 列
- 拖动区占第 2 列（本应占第 2-3 列）
- 窗口按钮占第 3 列（本应占第 4 列）
- 第 4 列空着

### 修复方案
改为 3 列布局：
```css
grid-template-columns: auto minmax(0, 1fr) auto;
```

- 第 1 列：品牌区（auto，内容宽度）
- 第 2 列：拖动区（1fr，伸展填充）
- 第 3 列：窗口按钮（auto，紧贴右侧）

## 三、本轮修改内容

### 1. 标题栏布局修复（src/styles/concept-workbench.css）

**修改前：**
```css
.window-top-bar {
  display: grid;
  grid-template-columns: minmax(180px, 1fr) auto minmax(180px, 1fr) auto;
}
```

**修改后：**
```css
.window-top-bar {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
}
```

### 2. 拖动区域样式强化（src/styles/concept-workbench.css）

**修改前：**
```css
.window-drag-spacer { min-width: 0; }
```

**修改后：**
```css
.window-drag-spacer {
  flex: 1 1 auto;
  min-width: 0;
  height: 100%;
}
```

### 3. 窗口按钮对齐（src/styles/concept-workbench.css）

**新增：**
```css
.window-controls {
  justify-self: end;
  margin-left: auto;
}
```

### 4. 设置页布局优化（src/styles/cipher-settings.css）

**修改前：**
```css
grid-template-columns: minmax(250px, .56fr) minmax(560px, 1.44fr);
```

**修改后：**
```css
grid-template-columns: minmax(220px, 300px) minmax(0, 1fr);
```

- 左列：固定合理范围（220px-300px）
- 右列：弹性伸展（最小 0，最大 1fr）
- 避免了 560px 的过大最小宽度

### 5. 容器查询断点调整（src/styles/cipher-settings.css）

**调整：** 720px → 760px

**理由：**
- 760px 是基于典型窗口宽度计算的合理断点
- 侧边栏展开（220px）：主内容约 800-1316px（1024-1536 窗口）
- 侧边栏收起（88px）：主内容约 936-1448px
- 760px 断点确保正常桌面窗口下保持横向布局

## 四、验证清单

### 标题栏验证
- [ ] 窗口按钮紧贴窗口右侧边缘
- [ ] 中间没有"本地视频提炼工作台"文字
- [ ] 中间空白区域可以拖动窗口
- [ ] 双击中间空白区域可以最大化/还原
- [ ] 品牌区（图标+VedioNotes）在最左侧
- [ ] 侧边栏展开/收起不影响标题栏布局

### 设置页验证（侧边栏展开）
- [ ] 标题区和导航区横向排列
- [ ] 标题区占左侧约 220-300px
- [ ] 导航区占右侧剩余空间
- [ ] 五项导航居左对齐
- [ ] 没有横向滚动条

### 设置页验证（侧边栏收起）
- [ ] 标题区和导航区仍然横向排列
- [ ] 标题区宽度不变
- [ ] 导航区获得更多空间（+132px）
- [ ] 五项导航没有上下跳动
- [ ] 下方内容卡片位置稳定
- [ ] 没有横向滚动条

### 窗口尺寸验证
- [ ] 1024px 窗口：横向布局正常
- [ ] 1366px 窗口：横向布局正常
- [ ] 1536px 窗口：横向布局正常
- [ ] 最大化窗口：横向布局正常

## 五、测试方法

1. 启动 VedioNotes.exe
2. 打开设置页面
3. 切换侧边栏展开/收起
4. 调整窗口大小
5. 使用浏览器开发者工具测量关键元素
6. 截图对比

## 六、预期结果

### 标题栏结构
```
[图标 VedioNotes]  [           空白拖动区           ]  [- □ ×]
 ← 品牌区固定      ← 伸展填充中间空间                ← 按钮固定右侧
```

### 设置页结构（展开）
```
SETTINGS               外观 语音转文字 AI 接入 数据管理 关于
设置                   ← 五项导航
说明
```

### 设置页结构（收起）
```
SETTINGS               外观 语音转文字 AI 接入 数据管理 关于
设置                   ← 五项导航获得更多空间
说明
```
