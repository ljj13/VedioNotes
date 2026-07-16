export const CIPHERTALK_SETTINGS_SOURCE = {
  project: 'ILoveBingLu/CipherTalk',
  localRoot: 'D:\\Project\\CipherTalk',
  commit: 'b5b580c5af7672a729a0c7fc10b8b1511fe6d478',
  license: 'CC BY-NC-SA 4.0',
  modified: true,
  files: [
    'src/components/settings/SettingsLayout.tsx',
    'src/components/settings/tabs/AppearanceTab.tsx',
    'src/components/settings/tabs/SttTab.tsx',
    'src/components/ai/AISummarySettings.tsx',
    'src/components/settings/tabs/DataManagementTab.tsx',
    'src/components/settings/tabs/AboutTab.tsx',
    'src/pages/SettingsPage.css',
  ],
} as const;

export const CIPHER_SETTINGS_PAGE_IDS = [
  'appearance',
  'transcription',
  'ai',
  'data',
  'about',
] as const;

export type CipherSettingsPageId = typeof CIPHER_SETTINGS_PAGE_IDS[number];
