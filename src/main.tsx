/**
 * VedioNotes 应用的主入口文件
 *
 * 这个文件是 React 应用的"启动器"。它做了两件事：
 *   1. 找到 HTML 中的 `<div id="root">` 容器
 *   2. 把整个 App 组件渲染进去
 *
 * 简单理解：index.html 是一个空盒子，main.tsx 把"整个应用"放进这个盒子里。
 *
 * React.StrictMode 是 React 的开发辅助模式，它会在开发时帮我们发现潜在问题，
 * 比如意外的副作用等。生产环境下不会有额外影响。
 */

import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

// 第一步：获取 HTML 中的根容器（在 index.html 里定义好的 <div id="root"></div>）
const rootElement = document.getElementById("root") as HTMLElement;

// 第二步：在根容器上创建一个 React "根节点"
const root = ReactDOM.createRoot(rootElement);

// 第三步：把 App 组件渲染到这个根节点里
// React.StrictMode 包裹是为了在开发模式下做额外的检查
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
