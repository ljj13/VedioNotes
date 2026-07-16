import type { SettingsUnlisten } from './types';

export async function attachLateSafeListener(
  isActive: () => boolean,
  registration: Promise<SettingsUnlisten>,
): Promise<SettingsUnlisten | null> {
  const unlisten = await registration;
  if (!isActive()) {
    unlisten();
    return null;
  }
  return unlisten;
}
