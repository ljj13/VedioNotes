/**
 * Vite 环境类型声明
 *
 * 这个文件告诉 TypeScript：import.meta.env 上有哪些 Vite 环境变量可用。
 * 没有这个文件，TypeScript 不认识 import.meta.env.VITE_XXX 这样的写法。
 *
 * VITE_SETTINGS_IMPLEMENTATION 用于切换设置页面的实现版本：
 *   'legacy'  → 旧的设置页面
 *   undefined → 新的 CipherTalk 风格设置页面（默认）
 */
/// <reference types="vite/client" />
