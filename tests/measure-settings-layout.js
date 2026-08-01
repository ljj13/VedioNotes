// 在浏览器 DevTools Console 中运行此脚本
// 用于测量设置页面布局的实际尺寸

function inspect(selector) {
  const element = document.querySelector(selector);
  if (!element) return { selector, missing: true };

  const rect = element.getBoundingClientRect();
  const style = getComputedStyle(element);

  return {
    selector,
    rect: {
      x: Math.round(rect.x * 100) / 100,
      y: Math.round(rect.y * 100) / 100,
      width: Math.round(rect.width * 100) / 100,
      height: Math.round(rect.height * 100) / 100,
      top: Math.round(rect.top * 100) / 100,
      right: Math.round(rect.right * 100) / 100,
      bottom: Math.round(rect.bottom * 100) / 100,
      left: Math.round(rect.left * 100) / 100,
    },
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
    display: style.display,
    position: style.position,
    width: style.width,
    maxWidth: style.maxWidth,
    minWidth: style.minWidth,
    height: style.height,
    margin: style.margin,
    padding: style.padding,
    gridTemplateColumns: style.gridTemplateColumns,
    gridTemplateAreas: style.gridTemplateAreas,
    alignItems: style.alignItems,
    alignSelf: style.alignSelf,
    justifyContent: style.justifyContent,
    transform: style.transform,
    containerType: style.containerType,
    containerName: style.containerName,
  };
}

const selectors = [
  '.app-container.workbench-app',
  '.workbench-sidebar',
  '.workbench-content',
  '.cipher-settings-root',
  '.settings-shell-layout',
  '.settings-page-header',
  '.settings-page-header-copy',
  '.settings-navigation-tabs',
  '.settings-body',
  '.tab-content',
];

console.log('=== 测量开始 ===');
console.log('侧边栏状态:', document.querySelector('.workbench-app').classList.contains('sidebar-collapsed') ? '收起' : '展开');
console.log('');

const results = {};
selectors.forEach(selector => {
  const data = inspect(selector);
  results[selector] = data;
  console.log(selector);
  console.log('  位置:', `x=${data.rect?.x}, y=${data.rect?.y}, top=${data.rect?.top}, left=${data.rect?.left}`);
  console.log('  尺寸:', `width=${data.rect?.width}, height=${data.rect?.height}`);
  console.log('  显示:', `display=${data.display}, position=${data.position}`);
  if (data.gridTemplateColumns) {
    console.log('  Grid列:', data.gridTemplateColumns);
  }
  if (data.containerName) {
    console.log('  容器:', `name=${data.containerName}, type=${data.containerType}`);
  }
  console.log('');
});

console.log('=== JSON 数据 ===');
console.log(JSON.stringify(results, null, 2));
