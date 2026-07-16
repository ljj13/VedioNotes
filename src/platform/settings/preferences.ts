import { saveAppearancePreferences, setTranscriptionPreferences } from '../../lib/bridge';

export const preferencesPlatform = {
  saveAppearance: saveAppearancePreferences,
  saveTranscription: setTranscriptionPreferences,
} as const;
