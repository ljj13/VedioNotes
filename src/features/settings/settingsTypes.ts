import type { SettingsSection } from '../../lib/workbenchNavigation';
import type {
  AppPreferences, AppProfiles, LocalModelStatus, SenseVoiceStatus,
} from '../../lib/types';

export interface SettingsEntryProps {
  section: SettingsSection;
  profiles: AppProfiles;
  localModels: LocalModelStatus[];
  preferences: AppPreferences;
  theme: 'light' | 'dark';
  sidebarCollapsed: boolean;
  onSelectSection: (section: SettingsSection) => void;
  onReturn: () => void;
  onProfilesChanged: () => void;
  onModelsChanged: () => void;
  onPreferencesChanged: (preferences: AppPreferences) => void;
  onSenseVoiceStatusChanged: (status: SenseVoiceStatus) => void;
  onToggleTheme: () => void;
  onToggleSidebar: () => void;
}

export type { SettingsSection } from '../../lib/workbenchNavigation';
