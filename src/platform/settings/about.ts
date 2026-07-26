/**
 * 关于页适配层——封装应用版本/组件状态获取和本地目录打开.
 * 被 AboutTab 引用.
 */

import {
  getAboutSnapshot,
  openAppDataDirectory,
  openExportDirectory,
  openLogDirectory,
  openDocumentation,
} from '../../lib/bridge';

export const aboutPlatform = {
  getAboutSnapshot,
  openAppDataDirectory,
  openExportDirectory,
  openLogDirectory,
  openDocumentation,
} as const;
