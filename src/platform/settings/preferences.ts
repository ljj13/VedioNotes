/**
 * 偏好设置适配层——封装外观、转录、导出和日志等全局偏好的读写.
 * 被 App.tsx 和各设置组件引用.
 */

import { saveAppearancePreferences, setTranscriptionPreferences } from '../../lib/bridge';

export const preferencesPlatform = {
  saveAppearance: saveAppearancePreferences,
  saveTranscription: setTranscriptionPreferences,
} as const;
