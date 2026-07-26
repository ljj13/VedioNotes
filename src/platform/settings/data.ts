/**
 * 数据管理适配层——封装缓存查询/清理、日志管理、导出目录设置.
 * 被 DataManagementTab 引用.
 */

import {
  getExportPreferences,
  saveExportPreferences,
  restoreExportPreferences,
  exportNote,
  getCacheUsage,
  clearCache,
  listLogs,
  readLog,
  setLogLevel,
  clearLogs,
  openAppDataDirectory,
  openExportDirectory,
  openLogDirectory,
  openDocumentation,
  getPreferences,
  setMarkdownOutputDir,
} from '../../lib/bridge';
import { open as openDirectoryDialog } from '@tauri-apps/plugin-dialog';

async function chooseExportDirectory(): Promise<string | null> {
  const selected = await openDirectoryDialog({ directory: true, multiple: false });
  if (!selected || Array.isArray(selected)) return null;
  return selected as string;
}

export const dataPlatform = {
  getExportPreferences,
  saveExportPreferences,
  restoreExportPreferences,
  exportNote,
  getCacheUsage,
  clearCache,
  listLogs,
  readLog,
  setLogLevel,
  clearLogs,
  openAppDataDirectory,
  openExportDirectory,
  openLogDirectory,
  openDocumentation,
  getPreferences,
  setMarkdownOutputDir,
  chooseExportDirectory,
} as const;
