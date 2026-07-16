import { aboutPlatform } from './about';
import { aiPlatform } from './ai';
import { dataPlatform } from './data';
import { preferencesPlatform } from './preferences';
import { transcriptionPlatform } from './transcription';

export { attachLateSafeListener } from './events';
export type { SettingsUnlisten } from './types';

export const settingsPlatform = {
  preferences: preferencesPlatform,
  transcription: transcriptionPlatform,
  ai: aiPlatform,
  data: dataPlatform,
  about: aboutPlatform,
} as const;
