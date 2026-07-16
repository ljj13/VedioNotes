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
