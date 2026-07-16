import { create } from 'zustand';
import type { AppPreferences, AppProfiles, LocalModelStatus } from '../../lib/types';

interface CipherSettingsStore {
  preferences: AppPreferences | null;
  profiles: AppProfiles | null;
  localModels: LocalModelStatus[];
  hydrate: (preferences: AppPreferences, profiles: AppProfiles, localModels: LocalModelStatus[]) => void;
  acceptPreferences: (preferences: AppPreferences) => void;
  reset: () => void;
}

export const useCipherSettingsStore = create<CipherSettingsStore>()((set) => ({
  preferences: null,
  profiles: null,
  localModels: [],
  hydrate: (preferences, profiles, localModels) => set({ preferences, profiles, localModels }),
  acceptPreferences: (preferences) => set({ preferences }),
  reset: () => set({ preferences: null, profiles: null, localModels: [] }),
}));
