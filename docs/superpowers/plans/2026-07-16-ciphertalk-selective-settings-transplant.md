# CipherTalk Selective Settings Transplant Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current VedioNotes Settings visual approximation with a selective source transplant of CipherTalk's five approved Settings pages while preserving every existing Tauri/Rust capability and the legacy Settings rollback path.

**Architecture:** CipherTalk-derived React components live under `src/features/settings` and depend only on a typed `src/platform/settings` compatibility layer. That layer forwards to the existing `src/lib/bridge.ts` Tauri contracts; no transplanted component may call Electron, Node, `invoke`, or `listen` directly.

**Tech Stack:** Tauri 2, React 19.1, TypeScript 5.8, Vite 7, Vitest 4, HeroUI 3.1.0, Tailwind CSS 4.3.0, Gravity UI Icons 2.20.0, Zustand 5.0.11, WebView2/Wry, Rust/Tokio/Reqwest/Rusqlite/Keyring.

## Global Constraints

- Treat `docs/superpowers/specs/2026-07-16-ciphertalk-selective-settings-transplant-design.md` as the sole authoritative specification.
- Read source only from `D:\Project\CipherTalk` at commit `b5b580c5af7672a729a0c7fc10b8b1511fe6d478`.
- Retain only Appearance, Speech-to-Text, AI Access, Data Management, and About.
- Do not import Database Decryption, Security, Memory, Plugins, accounts, WeChat operations, tray, updater, or Electron packaging.
- Keep VedioNotes on Tauri 2 and WebView2/Wry; do not add Electron or expose Node APIs to the Renderer.
- Keep `src/components/SettingsWorkspace.tsx` and its current child components as the rollback implementation through this plan.
- Preserve `decorations: false` and the existing React custom title bar; do not modify window chrome in this plan.
- Preserve the reviewed 116-provider / 3,926-model catalog and all four executable summary protocols.
- Never return stored secrets to React. Credential UI holds only a user-entered draft or credential-presence boolean.
- Do not call real or paid APIs, read real credentials/cookies, download media/models/runtimes, or delete user data during automated tests.
- Do not build or execute MSI/NSIS installers. A no-bundle Tauri executable is a separate opt-in gate and is not run by this plan.
- Use Node/PowerShell only for planning and visual harnesses; do not add Python to the project.
- Run Rust tests offline and serially with `CARGO_BUILD_JOBS=1` and `--jobs 1`; do not run `cargo clean`.
- Add CipherTalk attribution, the applicable license text, and a modification notice before enabling the transplant by default.

## Planned Production File Map

```text
src/features/settings/
├─ SettingsEntry.tsx                 # legacy/cipher rollout boundary
├─ CipherSettingsShell.tsx           # five-tab source-derived shell
├─ settingsStore.ts                  # Zustand runtime snapshot and dirty state
├─ settingsTypes.ts                  # shared props and page IDs
├─ sourceManifest.ts                 # source commit/files/attribution metadata
├─ tabs/
│  ├─ AppearanceTab.tsx
│  ├─ TranscriptionTab.tsx
│  ├─ transcription/
│  │  ├─ SenseVoicePanel.tsx
│  │  ├─ WhisperGpuPanel.tsx
│  │  └─ OnlineTranscriptionPanel.tsx
│  ├─ AiAccessTab.tsx
│  ├─ ai/
│  │  ├─ LargeModelPanel.tsx
│  │  ├─ CapabilityPanelShell.tsx
│  │  ├─ VectorPanel.tsx
│  │  ├─ RerankPanel.tsx
│  │  ├─ WebSearchPanel.tsx
│  │  ├─ TtsPanel.tsx
│  │  ├─ ImagePanel.tsx
│  │  └─ LocalAgentPanel.tsx
│  ├─ DataManagementTab.tsx
│  └─ AboutTab.tsx
├─ ui/
│  ├─ ConfirmDialog.tsx
│  ├─ FloatingSaveButton.tsx
│  ├─ ProgressBar.tsx
│  └─ index.ts
└─ styles/
   ├─ tailwind.css
   └─ settings.css

src/platform/settings/
├─ types.ts
├─ preferences.ts
├─ transcription.ts
├─ ai.ts
├─ data.ts
├─ about.ts
├─ events.ts
└─ index.ts
```

---

### Task 1: Lock the Source, Attribution, and Five-Page Inventory

**Files:**
- Create: `src/features/settings/sourceManifest.ts`
- Create: `tests/static/ciphertalk-settings-source.test.mjs`
- Modify: `THIRD_PARTY_NOTICES.md`
- Create: `docs/licenses/CipherTalk-CC-BY-NC-SA-4.0.txt`
- Modify: `package.json`

**Interfaces:**
- Consumes: local CipherTalk Git checkout and the approved design.
- Produces: `CIPHERTALK_SETTINGS_SOURCE` and `CIPHER_SETTINGS_PAGE_IDS` used by source audits and the shell.

- [ ] **Step 1: Add the failing source-contract test**

Create `tests/static/ciphertalk-settings-source.test.mjs`:

```js
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const sourceRoot = 'D:\\Project\\CipherTalk'
const expectedCommit = 'b5b580c5af7672a729a0c7fc10b8b1511fe6d478'
const actualCommit = execFileSync('git', ['-C', sourceRoot, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
assert.equal(actualCommit, expectedCommit, 'CipherTalk source commit changed')

const sourceFiles = [
  'src/components/settings/SettingsLayout.tsx',
  'src/components/settings/tabs/AppearanceTab.tsx',
  'src/components/settings/tabs/SttTab.tsx',
  'src/components/ai/AISummarySettings.tsx',
  'src/components/settings/tabs/DataManagementTab.tsx',
  'src/components/settings/tabs/AboutTab.tsx',
  'src/pages/SettingsPage.css',
]
for (const file of sourceFiles) assert.ok(existsSync(resolve(sourceRoot, file)), file + ' exists')

const manifest = readFileSync(resolve('src/features/settings/sourceManifest.ts'), 'utf8')
assert.ok(manifest.includes(expectedCommit))
for (const page of ['appearance', 'transcription', 'ai', 'data', 'about']) {
  assert.match(manifest, new RegExp("'" + page + "'"))
}
for (const excluded of ['database', 'security', 'memory', 'plugins']) {
  assert.doesNotMatch(manifest, new RegExp("'" + excluded + "'"))
}
console.log('CipherTalk settings source contract: pass')
```

- [ ] **Step 2: Run the source test and verify RED**

Run:

```powershell
node tests/static/ciphertalk-settings-source.test.mjs
```

Expected: FAIL with `ENOENT` for `src/features/settings/sourceManifest.ts`.

- [ ] **Step 3: Add the exact source manifest**

Create `src/features/settings/sourceManifest.ts`:

```ts
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
```

Copy the complete license text from `D:\Project\CipherTalk\LICENSE` into `docs/licenses/CipherTalk-CC-BY-NC-SA-4.0.txt`. Add a `CipherTalk Settings frontend` section to `THIRD_PARTY_NOTICES.md` naming the source commit, copied page files, modifications, author, repository, and license. Do not alter the user's approved design document.

- [ ] **Step 4: Register the static test**

Add this script to `package.json`:

```json
"test:settings-source": "node tests/static/ciphertalk-settings-source.test.mjs"
```

- [ ] **Step 5: Run GREEN and documentation checks**

Run:

```powershell
npm run test:settings-source
git diff --check
```

Expected: source contract prints `pass`; `git diff --check` exits 0.

- [ ] **Step 6: Commit Task 1**

```powershell
git add package.json THIRD_PARTY_NOTICES.md docs/licenses/CipherTalk-CC-BY-NC-SA-4.0.txt src/features/settings/sourceManifest.ts tests/static/ciphertalk-settings-source.test.mjs
git commit -m "docs: lock CipherTalk settings source"
```

---

### Task 2: Add the Retained UI Dependencies and Isolate Their Styles

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `vite.config.ts`
- Create: `src/features/settings/styles/tailwind.css`
- Create: `src/features/settings/styles/settings.css`
- Create: `src/features/settings/SettingsStyleIsolation.test.tsx`
- Test: `tests/workbench-ui.test.tsx`

**Interfaces:**
- Consumes: React 19.1, Vite 7, the CipherTalk Tailwind/HeroUI entry, and `.cipher-settings-root`.
- Produces: Tailwind/HeroUI compilation limited to the Settings feature plus source-derived page CSS prefixed by the Settings root.

- [ ] **Step 1: Write the failing dependency/style smoke test**

Create `src/features/settings/SettingsStyleIsolation.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { Button, Tabs } from '@heroui/react';
import { Palette } from '@gravity-ui/icons';
import { describe, expect, it } from 'vitest';

describe('Cipher Settings dependency isolation', () => {
  it('renders retained HeroUI and icon primitives only inside the settings root', () => {
    render(
      <div>
        <main data-testid="outside">outside</main>
        <section className="cipher-settings-root" data-testid="settings-root">
          <Tabs aria-label="设置导航">
            <Tabs.ListContainer>
              <Tabs.List aria-label="设置导航">
                <Tabs.Tab id="appearance"><Palette width={16} />外观</Tabs.Tab>
              </Tabs.List>
            </Tabs.ListContainer>
            <Tabs.Panel id="appearance"><Button>保存</Button></Tabs.Panel>
          </Tabs>
        </section>
      </div>,
    );
    expect(screen.getByTestId('settings-root').querySelector('svg')).toBeTruthy();
    expect(screen.getByTestId('outside').className).toBe('');
  });
});
```

- [ ] **Step 2: Run RED**

Run:

```powershell
npm test -- --run src/features/settings/SettingsStyleIsolation.test.tsx
```

Expected: FAIL because `@heroui/react` and `@gravity-ui/icons` cannot be resolved.

- [ ] **Step 3: Install exact locally audited versions**

Run from `D:\Project\notes`:

```powershell
npm install --save-exact @heroui/react@3.1.0 @heroui/styles@3.1.0 @gravity-ui/icons@2.20.0 zustand@5.0.11 framer-motion@12.40.0 marked@17.0.6 dompurify@3.3.1 clsx@2.1.1 tailwind-merge@3.6.0
npm install --save-dev --save-exact tailwindcss@4.3.0 @tailwindcss/vite@4.3.0
```

Do not install Electron, Electron Builder, React Router, CipherTalk AI SDK packages, Sass, or database/native dependencies.

- [ ] **Step 4: Register Tailwind with Vite**

Modify `vite.config.ts` to import `@tailwindcss/vite` and include it before `react()`:

```ts
import tailwindcss from '@tailwindcss/vite';

plugins: [tailwindcss(), react()],
```

Create `src/features/settings/styles/tailwind.css` without global Preflight:

```css
@layer theme, components, utilities;
@import "tailwindcss/theme.css" layer(theme);
@import "tailwindcss/utilities.css" layer(utilities);
@import "@heroui/styles";
@source "../**/*.{ts,tsx}";

@custom-variant dark (&:where(.cipher-settings-root[data-theme="dark"], .cipher-settings-root[data-theme="dark"] *));
```

Create `src/features/settings/styles/settings.css` with the source attribution header and these containment rules before porting page rules:

```css
/* Derived from ILoveBingLu/CipherTalk src/pages/SettingsPage.css
 * source commit: b5b580c5af7672a729a0c7fc10b8b1511fe6d478
 * modified for the VedioNotes five-page Settings subtree.
 */
.cipher-settings-root {
  min-width: 0;
  min-height: 100%;
  color: var(--text);
  background: var(--surface);
  isolation: isolate;
}

.cipher-settings-root *,
.cipher-settings-root *::before,
.cipher-settings-root *::after {
  box-sizing: border-box;
}
```

Every copied selector from `SettingsPage.css` must start with `.cipher-settings-root`, except keyframes and media/container declarations. Do not copy CipherTalk's global `body`, `html`, global reset, font-face, pet, home, database, security, memory, or plugin rules.

- [ ] **Step 5: Run GREEN and non-Settings regression**

Run:

```powershell
npm test -- --run src/features/settings/SettingsStyleIsolation.test.tsx tests/workbench-ui.test.tsx
npm run build
```

Expected: both test files pass; TypeScript/Vite build exits 0. Verify the build output contains a Settings dependency chunk and no Electron module.

- [ ] **Step 6: Commit Task 2**

```powershell
git add package.json package-lock.json vite.config.ts src/features/settings/styles src/features/settings/SettingsStyleIsolation.test.tsx
git commit -m "build: add isolated CipherTalk settings dependencies"
```

---

### Task 3: Create the Typed Settings Platform Adapter

**Files:**
- Create: `src/platform/settings/types.ts`
- Create: `src/platform/settings/preferences.ts`
- Create: `src/platform/settings/transcription.ts`
- Create: `src/platform/settings/ai.ts`
- Create: `src/platform/settings/data.ts`
- Create: `src/platform/settings/about.ts`
- Create: `src/platform/settings/events.ts`
- Create: `src/platform/settings/index.ts`
- Create: `src/platform/settings/settingsPlatform.test.ts`
- Create: `tests/static/settings-platform-boundary.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: existing named exports from `src/lib/bridge.ts` and domain types from `src/lib/types.ts`.
- Produces: `settingsPlatform` and `attachLateSafeListener`; these are the only desktop-facing interfaces allowed in `src/features/settings`.

- [ ] **Step 1: Write forwarding and late-listener RED tests**

Create `src/platform/settings/settingsPlatform.test.ts` with bridge mocks and these assertions:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const bridge = vi.hoisted(() => ({
  saveAppearancePreferences: vi.fn(),
  setTranscriptionPreferences: vi.fn(),
  getSenseVoiceStatus: vi.fn(),
  getSummaryProviderCatalog: vi.fn(),
  getCacheUsage: vi.fn(),
  getAboutSnapshot: vi.fn(),
}));
vi.mock('../../lib/bridge', () => bridge);

import { settingsPlatform } from './index';
import { attachLateSafeListener } from './events';

describe('settingsPlatform', () => {
  beforeEach(() => vi.clearAllMocks());

  it('forwards typed settings calls to the existing Tauri bridge', async () => {
    bridge.saveAppearancePreferences.mockResolvedValue({ schemaVersion: 1 });
    bridge.getSenseVoiceStatus.mockResolvedValue({ state: 'missing' });
    await settingsPlatform.preferences.saveAppearance({ theme: 'dark', compactDensity: false, reducedMotion: false });
    await settingsPlatform.transcription.getSenseVoiceStatus();
    expect(bridge.saveAppearancePreferences).toHaveBeenCalledTimes(1);
    expect(bridge.getSenseVoiceStatus).toHaveBeenCalledTimes(1);
  });

  it('disposes a listener that resolves after the component becomes inactive', async () => {
    const unlisten = vi.fn();
    let active = true;
    const registration = Promise.resolve(unlisten);
    active = false;
    const attached = await attachLateSafeListener(() => active, registration);
    expect(attached).toBeNull();
    expect(unlisten).toHaveBeenCalledTimes(1);
  });
});
```

Create `tests/static/settings-platform-boundary.test.mjs`:

```js
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'

function walk(path) {
  return readdirSync(path).flatMap((name) => {
    const child = join(path, name)
    return statSync(child).isDirectory() ? walk(child) : [child]
  })
}

const root = resolve('src/features/settings')
for (const file of walk(root).filter((path) => /\.(ts|tsx)$/.test(path))) {
  const source = readFileSync(file, 'utf8')
  assert.doesNotMatch(source, /window\.electronAPI/, file + ' uses Electron')
  assert.doesNotMatch(source, /from ['"]node:/, file + ' uses Node')
  assert.doesNotMatch(source, /@tauri-apps\/api/, file + ' imports Tauri directly')
  assert.doesNotMatch(source, /\binvoke\s*\(/, file + ' calls invoke directly')
  assert.doesNotMatch(source, /\blisten\s*\(/, file + ' calls listen directly')
}
console.log('settings platform boundary: pass')
```

- [ ] **Step 2: Run RED**

```powershell
npm test -- --run src/platform/settings/settingsPlatform.test.ts
node tests/static/settings-platform-boundary.test.mjs
```

Expected: Vitest FAIL because `src/platform/settings/index.ts` does not exist; boundary test passes against the current minimal feature directory.

- [ ] **Step 3: Define the platform types**

In `src/platform/settings/types.ts` re-export the exact VedioNotes domain types used by Settings and define:

```ts
import type { UnlistenFn } from '@tauri-apps/api/event';
import type {
  AboutSnapshot, AppPreferences, AppProfiles, AppearancePreferences,
  CacheCategory, CacheClearResult, CacheUsage, CapabilitySettings,
  CapabilityStatus, CapabilityStatusItem, CapabilityTestResult,
  CudaRuntimeDownloadProgress, CudaRuntimeStatus, ExportPreferences,
  ImageConfig, LocalAgentConfig, LocalModelDownloadProgress,
  LocalModelStatus, LogDescriptor, LogLevel, LogTail, RerankConfig,
  SaveCatalogSummaryProfileInput, SecretInput, SenseVoiceDownloadProgress,
  SenseVoiceLanguage, SenseVoiceModelId, SenseVoiceStatus,
  SummaryProviderCatalogEntry, TranscriptionMode, TranscriptionProfile,
  TtsConfig, VectorConfig, WebSearchConfig,
} from '../../lib/types';

export type SettingsUnlisten = UnlistenFn;
export type {
  AboutSnapshot, AppPreferences, AppProfiles, AppearancePreferences,
  CacheCategory, CacheClearResult, CacheUsage, CapabilitySettings,
  CapabilityStatus, CapabilityStatusItem, CapabilityTestResult,
  CudaRuntimeDownloadProgress, CudaRuntimeStatus, ExportPreferences,
  ImageConfig, LocalAgentConfig, LocalModelDownloadProgress,
  LocalModelStatus, LogDescriptor, LogLevel, LogTail, RerankConfig,
  SaveCatalogSummaryProfileInput, SecretInput, SenseVoiceDownloadProgress,
  SenseVoiceLanguage, SenseVoiceModelId, SenseVoiceStatus,
  SummaryProviderCatalogEntry, TranscriptionMode, TranscriptionProfile,
  TtsConfig, VectorConfig, WebSearchConfig,
};
```

- [ ] **Step 4: Implement exact forwarding modules**

Each module imports only `../../lib/bridge`. Export one object per capability:

```ts
// preferences.ts
import { saveAppearancePreferences, setTranscriptionPreferences } from '../../lib/bridge';
export const preferencesPlatform = {
  saveAppearance: saveAppearancePreferences,
  saveTranscription: setTranscriptionPreferences,
};
```

```ts
// events.ts
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
```

`transcription.ts` must forward profile, local-model, SenseVoice, CUDA, preference, and progress-listener bridge functions. `ai.ts` must forward catalog atomic save, profile/preset operations, capability settings/status/save/test operations, and local-agent detection. `data.ts` must forward export/cache/log and registered directory actions. `about.ts` must forward `getAboutSnapshot` and documentation/directory actions.

Export the stable aggregate in `index.ts`:

```ts
import { aboutPlatform } from './about';
import { aiPlatform } from './ai';
import { dataPlatform } from './data';
import { preferencesPlatform } from './preferences';
import { transcriptionPlatform } from './transcription';

export const settingsPlatform = {
  preferences: preferencesPlatform,
  transcription: transcriptionPlatform,
  ai: aiPlatform,
  data: dataPlatform,
  about: aboutPlatform,
} as const;
```

- [ ] **Step 5: Register and run GREEN**

Add:

```json
"test:settings-boundary": "node tests/static/settings-platform-boundary.test.mjs"
```

Run:

```powershell
npm test -- --run src/platform/settings/settingsPlatform.test.ts
npm run test:settings-boundary
npm run build
```

Expected: adapter tests pass, boundary prints `pass`, and TypeScript proves every forwarded signature.

- [ ] **Step 6: Commit Task 3**

```powershell
git add package.json src/platform/settings tests/static/settings-platform-boundary.test.mjs
git commit -m "feat: add typed settings platform adapter"
```

---

### Task 4: Add the Source-Derived Shell, Zustand Store, and Rollback Entry

**Files:**
- Create: `src/features/settings/settingsTypes.ts`
- Create: `src/features/settings/settingsStore.ts`
- Create: `src/features/settings/ui/ConfirmDialog.tsx`
- Create: `src/features/settings/ui/FloatingSaveButton.tsx`
- Create: `src/features/settings/ui/ProgressBar.tsx`
- Create: `src/features/settings/ui/index.ts`
- Create: `src/features/settings/CipherSettingsShell.tsx`
- Create: `src/features/settings/CipherSettingsShell.test.tsx`
- Create: `src/features/settings/SettingsEntry.tsx`
- Create: `src/features/settings/SettingsEntry.test.tsx`
- Modify: `src/components/SettingsWorkspace.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: existing Settings props and `CIPHER_SETTINGS_PAGE_IDS`.
- Produces: `SettingsEntryProps`, `useCipherSettingsStore`, `CipherSettingsShell`, and `SettingsEntry` with a legacy fallback.

- [ ] **Step 1: Write shell and rollout RED tests**

The shell test must assert five icon tabs, active page state, return action, root containment, loading skeleton, and no excluded tabs. The entry test must assert `legacy` renders the existing `SettingsWorkspace` and `cipher` lazy-loads `CipherSettingsShell`.

Use this required prop contract in `settingsTypes.ts`:

```ts
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
```

- [ ] **Step 2: Run RED**

```powershell
npm test -- --run src/features/settings/CipherSettingsShell.test.tsx src/features/settings/SettingsEntry.test.tsx
```

Expected: FAIL because both components are missing.

- [ ] **Step 3: Port the retained shell and shared UI**

Use `D:\Project\CipherTalk\src\components\settings\SettingsLayout.tsx:1345-1475` as the shell render source and the three files under `src/components/settings/ui` as shared-component sources. Preserve the Settings tab DOM, HeroUI Tabs behavior, ScrollShadow, skeleton, icons, focus order, and source CSS classes.

Remove plugin tabs, React Router search-parameter logic, account state, updater state, WeChat actions, and all Electron/config imports. The shell receives all navigation through `SettingsEntryProps`.

Create a Zustand store that subscribes to leaf fields:

```ts
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
```

- [ ] **Step 4: Implement the rollback boundary**

Modify `src/components/SettingsWorkspace.tsx` to import `SettingsEntryProps` and replace its local props declaration with that shared contract; keep its default export and behavior unchanged. `SettingsEntry` accepts an optional implementation override for tests and uses the environment only when the override is absent:

```tsx
import { lazy, Suspense } from 'react';
import LegacySettingsWorkspace from '../../components/SettingsWorkspace';
import type { SettingsEntryProps } from './settingsTypes';

const CipherSettingsShell = lazy(() => import('./CipherSettingsShell'));

export default function SettingsEntry({
  implementation: override,
  ...props
}: SettingsEntryProps & { implementation?: 'legacy' | 'cipher' }) {
  const implementation = override
    ?? (import.meta.env.VITE_SETTINGS_IMPLEMENTATION === 'cipher' ? 'cipher' : 'legacy');
  if (implementation === 'legacy') return <LegacySettingsWorkspace {...props} />;
  return <Suspense fallback={<div role="status">正在加载设置…</div>}><CipherSettingsShell {...props} /></Suspense>;
}
```

Change only the Settings import/mount in `App.tsx` from `SettingsWorkspace` to `SettingsEntry`. Default remains legacy in this task.

- [ ] **Step 5: Run GREEN and rollback regression**

```powershell
npm test -- --run src/features/settings/CipherSettingsShell.test.tsx src/features/settings/SettingsEntry.test.tsx src/components/SettingsWorkspace.test.tsx tests/workbench-ui.test.tsx
npm run build
```

Expected: shell/entry tests pass, all legacy Settings tests still pass, and production build succeeds.

- [ ] **Step 6: Commit Task 4**

```powershell
git add src/App.tsx src/components/SettingsWorkspace.tsx src/features/settings
git commit -m "feat: add CipherTalk settings shell with rollback"
```

---

### Task 5: Transplant Appearance with Immediate Serialized Persistence

**Files:**
- Create: `src/features/settings/tabs/AppearanceTab.tsx`
- Create: `src/features/settings/tabs/AppearanceTab.test.tsx`
- Modify: `src/features/settings/CipherSettingsShell.tsx`
- Modify: `src/features/settings/styles/settings.css`

**Interfaces:**
- Consumes: `settingsPlatform.preferences.saveAppearance` and the shell's appearance/sidebar props.
- Produces: CipherTalk-derived Appearance composition with VedioNotes' optimistic serialized save/rollback contract.

- [ ] **Step 1: Write RED behavior tests**

Port the existing two tests from `src/components/settings/AppearanceSettings.test.tsx` to the new component, replace the bridge mock with a `settingsPlatform` mock, and add assertions for:

```tsx
expect(screen.getByRole('heading', { name: '外观' })).toBeTruthy();
expect(screen.getByRole('radiogroup', { name: '颜色主题' })).toBeTruthy();
expect(screen.getByRole('switch', { name: '紧凑布局' })).toBeTruthy();
expect(screen.getByRole('switch', { name: '减少动画' })).toBeTruthy();
expect(screen.queryByText(/微信|回复气泡|关闭到托盘/)).toBeNull();
```

- [ ] **Step 2: Run RED**

```powershell
npm test -- --run src/features/settings/tabs/AppearanceTab.test.tsx
```

Expected: FAIL because `AppearanceTab.tsx` is missing.

- [ ] **Step 3: Port and adapt the source page**

Use `D:\Project\CipherTalk\src\components\settings\tabs\AppearanceTab.tsx` as the JSX/style source. Keep its HeroUI RadioGroup, Switch, layout cards, labels, icons, responsive classes, and interaction feedback. Remove reply-tile, home-background, quote-style, close-to-tray, hardware-acceleration, avatar, and WeChat-only imports/sections.

Bind the remaining controls to `AppearancePreferences`:

```ts
const defaults: AppearancePreferences = {
  theme: 'system',
  compactDensity: false,
  reducedMotion: false,
};
```

Carry forward the existing queue invariants: optimistic parent update, one in-flight save, monotonically increasing sequence, last-confirmed snapshot, and latest-failure rollback. Use `settingsPlatform.preferences.saveAppearance`, never `src/lib/bridge` directly.

- [ ] **Step 4: Run GREEN and rapid-change regression**

```powershell
npm test -- --run src/features/settings/tabs/AppearanceTab.test.tsx src/components/settings/AppearanceSettings.test.tsx
npm run test:settings-boundary
```

Expected: both old/new appearance suites pass and boundary audit passes.

- [ ] **Step 5: Commit Task 5**

```powershell
git add src/features/settings/tabs/AppearanceTab.tsx src/features/settings/tabs/AppearanceTab.test.tsx src/features/settings/CipherSettingsShell.tsx src/features/settings/styles/settings.css
git commit -m "feat: transplant CipherTalk appearance settings"
```

---

### Task 6: Transplant Speech-to-Text Shell and SenseVoice CPU Flow

**Files:**
- Create: `src/features/settings/tabs/TranscriptionTab.tsx`
- Create: `src/features/settings/tabs/TranscriptionTab.test.tsx`
- Create: `src/features/settings/tabs/transcription/SenseVoicePanel.tsx`
- Create: `src/features/settings/tabs/transcription/SenseVoicePanel.test.tsx`
- Modify: `src/features/settings/CipherSettingsShell.tsx`
- Modify: `src/features/settings/styles/settings.css`

**Interfaces:**
- Consumes: transcription preference/SenseVoice methods and progress event from `settingsPlatform.transcription`.
- Produces: CPU/GPU/Online tab shell and a real SenseVoice lifecycle with safe listener cleanup.

- [ ] **Step 1: Write RED tests for mode persistence and SenseVoice lifecycle**

Required cases:

- three mode tabs with CPU/GPU/Online labels;
- CPU maps to `sensevoice_cpu`;
- int8/float32 status and activate/download/pause/delete/refresh controls;
- zh/en/ja/ko/yue multi-select with at least one language;
- listener registration resolves before download command;
- a listener resolving after unmount is immediately disposed;
- current-model deletion requires confirmation;
- no enabled action is simulated.

Use deferred listener and command promises, then assert:

```ts
expect(callOrder).toEqual(['listen', 'download']);
expect(unlisten).toHaveBeenCalledTimes(1);
expect(platform.downloadSenseVoice).toHaveBeenCalledWith('int8');
expect(platform.saveTranscription).toHaveBeenCalledWith('sensevoice_cpu', ['zh', 'en']);
```

- [ ] **Step 2: Run RED**

```powershell
npm test -- --run src/features/settings/tabs/TranscriptionTab.test.tsx src/features/settings/tabs/transcription/SenseVoicePanel.test.tsx
```

Expected: FAIL because the new transcription files are missing.

- [ ] **Step 3: Port the source mode shell and CPU composition**

Use `D:\Project\CipherTalk\src\components\settings\tabs\SttTab.tsx` as the visible source. Retain HeroUI Tabs, Cards, RadioGroup, CheckboxGroup, AlertDialog, progress presentation, Gravity icons, model/language wording, loading/disabled states, and responsive structure.

Replace all `configService` and `window.electronAPI.stt` calls with `settingsPlatform.transcription`. Use `attachLateSafeListener` when the progress registration resolves. Preserve the existing VedioNotes model/runtime status types and confirmation semantics.

- [ ] **Step 4: Run GREEN and legacy regressions**

```powershell
npm test -- --run src/features/settings/tabs/TranscriptionTab.test.tsx src/features/settings/tabs/transcription/SenseVoicePanel.test.tsx src/components/SenseVoiceManager.test.tsx src/components/SettingsWorkspace.test.tsx
npm run test:settings-boundary
```

Expected: new CPU flow and existing SenseVoice/Settings contracts pass.

- [ ] **Step 5: Commit Task 6**

```powershell
git add src/features/settings/tabs/TranscriptionTab.tsx src/features/settings/tabs/TranscriptionTab.test.tsx src/features/settings/tabs/transcription/SenseVoicePanel.tsx src/features/settings/tabs/transcription/SenseVoicePanel.test.tsx src/features/settings/CipherSettingsShell.tsx src/features/settings/styles/settings.css
git commit -m "feat: transplant CipherTalk SenseVoice settings"
```

---

### Task 7: Complete Whisper GPU and Online Transcription

**Files:**
- Create: `src/features/settings/tabs/transcription/WhisperGpuPanel.tsx`
- Create: `src/features/settings/tabs/transcription/WhisperGpuPanel.test.tsx`
- Create: `src/features/settings/tabs/transcription/OnlineTranscriptionPanel.tsx`
- Create: `src/features/settings/tabs/transcription/OnlineTranscriptionPanel.test.tsx`
- Modify: `src/features/settings/tabs/TranscriptionTab.tsx`
- Modify: `src/features/settings/styles/settings.css`

**Interfaces:**
- Consumes: local model/profile/CUDA methods from `settingsPlatform.transcription`.
- Produces: real Whisper/CUDA lifecycle and source-derived online profile configuration.

- [ ] **Step 1: Write GPU RED tests**

Require all five backend-supported models (`tiny`, `base`, `small`, `medium`, `large-v3-turbo`), ready/current/download/error states, listener-before-download, model activation, current-model delete confirmation, GPU name/state, CUDA install progress, CPU fallback, and CUDA delete confirmation.

- [ ] **Step 2: Write online RED tests**

Require profile selection, provider/endpoint/model presentation, in-memory credential input, profile save/test, active-profile switch after successful save, and no stored credential hydration. Render language/timeout/concurrency source slots as read-only provider capability information unless a real VedioNotes profile field exists; do not make them editable or imply persistence.

Assert:

```tsx
expect(screen.queryByDisplayValue('stored-secret')).toBeNull();
expect(platform.saveTranscriptionProfile).toHaveBeenCalledWith(
  expect.objectContaining({ provider: 'open_ai_compatible', baseUrl: 'https://example.test', model: 'whisper-1' }),
  { type: 'bearer', apiKey: 'new-secret' },
);
```

- [ ] **Step 3: Run RED**

```powershell
npm test -- --run src/features/settings/tabs/transcription/WhisperGpuPanel.test.tsx src/features/settings/tabs/transcription/OnlineTranscriptionPanel.test.tsx
```

Expected: FAIL because both panels are missing.

- [ ] **Step 4: Port/adapt GPU and Online source sections**

Use the GPU and online panel JSX from `SttTab.tsx`. Replace CipherTalk whisper/STT/config calls with VedioNotes platform calls. Do not render CipherTalk model IDs not supported by VedioNotes. Reuse `ProfileManager` only inside the source-derived preset-management region; the main form uses HeroUI fields and the platform adapter.

- [ ] **Step 5: Run GREEN**

```powershell
npm test -- --run src/features/settings/tabs/TranscriptionTab.test.tsx src/features/settings/tabs/transcription/WhisperGpuPanel.test.tsx src/features/settings/tabs/transcription/OnlineTranscriptionPanel.test.tsx src/components/LocalModelManager.test.tsx src/components/CudaRuntimeManager.test.tsx
npm run test:settings-boundary
```

Expected: all new and legacy model/CUDA tests pass.

- [ ] **Step 6: Commit Task 7**

```powershell
git add src/features/settings/tabs/TranscriptionTab.tsx src/features/settings/tabs/transcription src/features/settings/styles/settings.css
git commit -m "feat: transplant Whisper and online transcription settings"
```

---

### Task 8: Transplant AI Access Large-Model Catalog and Presets

**Files:**
- Create: `src/features/settings/tabs/AiAccessTab.tsx`
- Create: `src/features/settings/tabs/AiAccessTab.test.tsx`
- Create: `src/features/settings/tabs/ai/LargeModelPanel.tsx`
- Create: `src/features/settings/tabs/ai/LargeModelPanel.test.tsx`
- Modify: `src/features/settings/CipherSettingsShell.tsx`
- Modify: `src/features/settings/styles/settings.css`

**Interfaces:**
- Consumes: catalog/profile methods from `settingsPlatform.ai` and existing `ProfileManager`.
- Produces: CipherTalk-derived seven-mode AI shell and atomic provider/model save workflow.

- [ ] **Step 1: Write RED catalog tests**

Move the behavioral coverage from `AiAccessSettings.catalog.test.tsx` to the new panel and require:

- searchable provider and model ComboBoxes;
- all four protocol labels;
- ineligible model disabled reason;
- provider/model changes remain drafts;
- API key show/hide without stored-secret hydration;
- refresh reloads the platform catalog;
- atomic save uses `SaveCatalogSummaryProfileInput`;
- preset creation/management drawer remains functional;
- the catalog count is based on the returned 116 providers and never a hard-coded replacement snapshot.

- [ ] **Step 2: Run RED**

```powershell
npm test -- --run src/features/settings/tabs/AiAccessTab.test.tsx src/features/settings/tabs/ai/LargeModelPanel.test.tsx
```

Expected: FAIL because new AI files are missing.

- [ ] **Step 3: Port and adapt CipherTalk AI composition**

Use `D:\Project\CipherTalk\src\components\ai\AISummarySettings.tsx` as the DOM/interaction source. Retain HeroUI ComboBox, Select, Drawer, Modal, Form, Chips, provider summary, capability strip, preset steps, status feedback, icons, and animations.

Remove CipherTalk `configService`, `getAIProviders`, `AIProviderLogo` dependencies that require its app/catalog stack. Feed the existing VedioNotes `SummaryProviderCatalogEntry[]` through `settingsPlatform.ai.getSummaryProviderCatalog`. Keep `ProfileManager` as the real preset editor inside the source-derived drawer.

- [ ] **Step 4: Run GREEN and catalog/static gates**

```powershell
npm test -- --run src/features/settings/tabs/AiAccessTab.test.tsx src/features/settings/tabs/ai/LargeModelPanel.test.tsx src/components/settings/AiAccessSettings.catalog.test.tsx
node tests/static/models-dev-catalog.test.mjs
npm run test:settings-boundary
```

Expected: new/legacy AI tests pass, catalog remains 116/3,926, and boundary passes.

- [ ] **Step 5: Commit Task 8**

```powershell
git add src/features/settings/tabs/AiAccessTab.tsx src/features/settings/tabs/AiAccessTab.test.tsx src/features/settings/tabs/ai/LargeModelPanel.tsx src/features/settings/tabs/ai/LargeModelPanel.test.tsx src/features/settings/CipherSettingsShell.tsx src/features/settings/styles/settings.css
git commit -m "feat: transplant CipherTalk AI provider settings"
```

---

### Task 9: Transplant the Six Auxiliary AI Capability Panels

**Files:**
- Create: `src/features/settings/tabs/ai/CapabilityPanelShell.tsx`
- Create: `src/features/settings/tabs/ai/VectorPanel.tsx`
- Create: `src/features/settings/tabs/ai/RerankPanel.tsx`
- Create: `src/features/settings/tabs/ai/WebSearchPanel.tsx`
- Create: `src/features/settings/tabs/ai/TtsPanel.tsx`
- Create: `src/features/settings/tabs/ai/ImagePanel.tsx`
- Create: `src/features/settings/tabs/ai/LocalAgentPanel.tsx`
- Create: `src/features/settings/tabs/ai/AiCapabilities.test.tsx`
- Modify: `src/features/settings/tabs/AiAccessTab.tsx`
- Modify: `src/features/settings/styles/settings.css`

**Interfaces:**
- Consumes: typed capability settings/status/save/test/detect operations from `settingsPlatform.ai`.
- Produces: complete Vector, Rerank, Web, Speech, Image, and Local Agent forms with honest operational states.

- [ ] **Step 1: Write one RED contract per panel**

In `AiCapabilities.test.tsx` render each subtab with platform mocks and assert its exact typed fields:

```ts
const requiredLabels = {
  vector: ['启用向量检索', '服务地址', '模型', '集合', '向量维度'],
  rerank: ['启用重排', '服务地址', '模型'],
  web: ['启用联网搜索', '服务地址', '最大结果数'],
  tts: ['启用语音合成', '服务地址', '模型', '声音'],
  image: ['启用图片生成', '服务地址', '模型', '图片尺寸'],
  agent: ['启用本地智能体', '可执行文件', '参数', '超时秒数'],
};
```

For every panel test save, test, loading, success, sanitized error, credential-presence, and disabled states. Local Agent additionally tests detection and rejects a relative executable before invoking save.

- [ ] **Step 2: Run RED**

```powershell
npm test -- --run src/features/settings/tabs/ai/AiCapabilities.test.tsx
```

Expected: FAIL on the first missing panel.

- [ ] **Step 3: Port source layouts onto exact VedioNotes types**

Use CipherTalk `EmbeddingTab.tsx`, `RerankTab.tsx`, `WebSearchTab.tsx`, `TtsTab.tsx`, `ImageGenTab.tsx`, and `LocalCodingAgentSettings.tsx` as the respective visible sources. Retain source form hierarchy, controls, providers where compatible, status cards, test/save actions, icons, and responsive layout.

Do not add fields absent from `VectorConfig`, `RerankConfig`, `WebSearchConfig`, `TtsConfig`, `ImageConfig`, or `LocalAgentConfig`. Do not copy CipherTalk provider transports that lack a VedioNotes command.

- [ ] **Step 4: Run GREEN and capability regressions**

```powershell
npm test -- --run src/features/settings/tabs/ai/AiCapabilities.test.tsx src/components/settings/AiCapabilities.test.tsx
node tests/static/ai-capability-bridge.test.mjs
npm run test:settings-boundary
```

Expected: all seven AI modes have real bridge coverage and no direct desktop calls.

- [ ] **Step 5: Commit Task 9**

```powershell
git add src/features/settings/tabs/AiAccessTab.tsx src/features/settings/tabs/ai src/features/settings/styles/settings.css
git commit -m "feat: transplant CipherTalk AI capability settings"
```

---

### Task 10: Transplant Data Management with Enum-Only Destructive Actions

**Files:**
- Create: `src/features/settings/tabs/DataManagementTab.tsx`
- Create: `src/features/settings/tabs/DataManagementTab.test.tsx`
- Modify: `src/features/settings/CipherSettingsShell.tsx`
- Modify: `src/features/settings/styles/settings.css`

**Interfaces:**
- Consumes: export/cache/log/directory methods from `settingsPlatform.data`.
- Produces: source-derived export, cache, and log panels; every deletion uses a typed category or validated log ID.

- [ ] **Step 1: Write RED tests**

Port `DataManagementSettings.test.tsx` coverage and require:

- source-derived Export/Cache/Logs tabs;
- export format/options save and restore;
- cache usage presentation for exactly four app-owned categories;
- confirmation before `clearCache`;
- no path argument in any clear call;
- bounded `readLog(id, 65536)`;
- log level save, log clear confirmation, and registered directory action;
- no CipherTalk images/emojis/accounts/database actions.

Add:

```tsx
expect(platform.clearCache).toHaveBeenCalledWith('temporary_media');
expect(platform.clearCache).not.toHaveBeenCalledWith(expect.stringMatching(/[\\/:]/));
expect(screen.queryByText(/微信|表情包|账号|解密数据库/)).toBeNull();
```

- [ ] **Step 2: Run RED**

```powershell
npm test -- --run src/features/settings/tabs/DataManagementTab.test.tsx
```

Expected: FAIL because the new tab is missing.

- [ ] **Step 3: Port and adapt the source page**

Use `D:\Project\CipherTalk\src\components\settings\tabs\DataManagementTab.tsx` as the layout/dialog source. Keep HeroUI Tabs, Cards, ListBox, ScrollShadow, AlertDialog, typography, status/loading states, and Gravity icons.

Replace every Electron call and CipherTalk cache kind with the exact `dataPlatform` method. Do not pass arbitrary filesystem paths from React. Use `CacheCategory` and `LogDescriptor.id` only.

- [ ] **Step 4: Run GREEN and Rust safety regressions**

```powershell
npm test -- --run src/features/settings/tabs/DataManagementTab.test.tsx src/components/settings/DataManagementSettings.test.tsx
$env:PATH='C:\Users\commender\.rustup\toolchains\stable-x86_64-pc-windows-msvc\bin;' + $env:PATH
$env:CARGO_BUILD_JOBS='1'
cargo test --offline --manifest-path src-tauri/Cargo.toml --test data_management_test --jobs 1
npm run test:settings-boundary
```

Expected: frontend data tests pass; Rust data-management safety tests pass serially.

- [ ] **Step 5: Commit Task 10**

```powershell
git add src/features/settings/tabs/DataManagementTab.tsx src/features/settings/tabs/DataManagementTab.test.tsx src/features/settings/CipherSettingsShell.tsx src/features/settings/styles/settings.css
git commit -m "feat: transplant CipherTalk data settings"
```

---

### Task 11: Transplant About Without Updater or Electron Window Actions

**Files:**
- Create: `src/features/settings/tabs/AboutTab.tsx`
- Create: `src/features/settings/tabs/AboutTab.test.tsx`
- Modify: `src/features/settings/CipherSettingsShell.tsx`
- Modify: `src/features/settings/styles/settings.css`
- Modify: `README.md`
- Modify: `THIRD_PARTY_NOTICES.md`

**Interfaces:**
- Consumes: `AboutSnapshot` and registered directory/documentation actions from `settingsPlatform.about`.
- Produces: VedioNotes-branded source-derived About composition with real runtime metadata and complete attribution.

- [ ] **Step 1: Write RED tests**

Require:

- VedioNotes name/icon/version;
- Tauri, React, Rust, and component metadata from `AboutSnapshot`;
- app data/export/log/documentation actions;
- loading and sanitized error states;
- CipherTalk attribution link;
- no update/check/download action;
- no CipherTalk product links, WeChat copy, Electron agreement window, or `shell.openExternal`.

- [ ] **Step 2: Run RED**

```powershell
npm test -- --run src/features/settings/tabs/AboutTab.test.tsx
```

Expected: FAIL because the new About tab is missing.

- [ ] **Step 3: Port the source composition**

Use `D:\Project\CipherTalk\src\components\settings\tabs\AboutTab.tsx` as the visible composition source. Keep its HeroUI typography, Chips, separators, two-column sections, icon treatment, link buttons, and responsive layout. Replace the updater section with the real VedioNotes component/status inventory. Use `public/app-icon.png` and `AboutSnapshot`.

Do not copy updater types, download progress, force-update copy, agreement window, or Electron shell calls.

- [ ] **Step 4: Complete published attribution**

Update README licensing/derivative section and `THIRD_PARTY_NOTICES.md` so a release consumer can identify:

- CipherTalk project and author;
- source commit;
- five retained source areas;
- that VedioNotes modified the code for Tauri and its own product data;
- CC BY-NC-SA 4.0 license path.

- [ ] **Step 5: Run GREEN and docs/static checks**

```powershell
npm test -- --run src/features/settings/tabs/AboutTab.test.tsx
npm run test:settings-source
npm run test:settings-boundary
node approved-workbench.docs.test.mjs
git diff --check
```

Expected: About, source, boundary, and docs contracts pass.

- [ ] **Step 6: Commit Task 11**

```powershell
git add src/features/settings/tabs/AboutTab.tsx src/features/settings/tabs/AboutTab.test.tsx src/features/settings/CipherSettingsShell.tsx src/features/settings/styles/settings.css README.md THIRD_PARTY_NOTICES.md
git commit -m "feat: transplant CipherTalk about settings"
```

---

### Task 12: Visual Parity, Default Enablement, and Full Release-Readiness Gates

**Files:**
- Modify: `src/features/settings/SettingsEntry.tsx`
- Modify: `src/features/settings/SettingsEntry.test.tsx`
- Modify: `tests/static/production-settings.structure.test.mjs`
- Create: `tests/static/settings-privacy-boundary.test.mjs`
- Modify: `production-workbench.visual.test.mjs`
- Create: `task13-settings-visual-matrix.mjs`
- Create: `outputs/ciphertalk-settings-transplant-review.md`
- Modify: `README.md`
- Modify: `task_plan.md`
- Modify: `findings.md`
- Modify: `progress.md`

**Interfaces:**
- Consumes: all Tasks 1-11, the pinned CipherTalk baseline, existing Edge/CDP visual harness, and legacy rollback.
- Produces: default Cipher Settings, `VITE_SETTINGS_IMPLEMENTATION=legacy` rollback, complete static/visual evidence, and final readiness report.

- [ ] **Step 1: Convert the static Settings audit to the new boundaries**

Update `tests/static/production-settings.structure.test.mjs` to read `src/features/settings` and `src/platform/settings`. It must assert:

- exactly five page IDs;
- all source-derived page files exist;
- source manifest commit is exact;
- AI catalog and all capability panels are present;
- legacy Settings still exists;
- default entry is Cipher and explicit `legacy` override exists;
- no direct Electron/Node/Tauri bridge calls in feature files;
- the old `settings-ciphertalk.css` is not imported by `App.tsx` after default enablement.

Run before changing the default.

Expected: FAIL on the default-entry and old-style-import assertions.

- [ ] **Step 2: Capture the pinned CipherTalk baseline**

From `D:\Project\CipherTalk`, with its existing dependencies:

```powershell
npm run build:mcp
& '.\node_modules\.bin\electron.cmd' --remote-debugging-port=9331 .
```

Open `#/settings?tab=appearance` and capture the five approved pages in light/dark states at 1280×800. Capture STT CPU/GPU/Online and all seven AI modes. Record source commit, viewport, mode, screenshot filename, and SHA-256 in `outputs/ciphertalk-settings-baseline/manifest.json`. Do not edit the CipherTalk checkout.

- [ ] **Step 3: Extend the VedioNotes visual matrix**

Build `task13-settings-visual-matrix.mjs` on the existing Edge/CDP harness. Required cases:

- 1280×800 and maximized 1920×1080;
- scale factors 1, 1.25, and 1.5 through `Emulation.setDeviceMetricsOverride`;
- light/dark;
- five top pages;
- CPU/GPU/Online;
- seven AI modes;
- all open ComboBox/ListBox/Drawer/Modal/AlertDialog states;
- hover, pressed, focus-visible, disabled, loading, success, warning, error, empty, and completed animation;
- 640×900 narrow layout and scrollbar state;
- Home/Create/Library/Q&A/Tasks screenshots before and after loading Settings styles.

For each case record horizontal overflow, unlabeled buttons, active tab, root bounding box, computed font/radius/shadow/gap tokens, and PNG dimensions. Fail on overflow, missing active state, direct body style mutation, or non-Settings geometry drift.

- [ ] **Step 4: Make Cipher Settings the default**

Change `SettingsEntry` resolution to:

```ts
const implementation = override
  ?? (import.meta.env.VITE_SETTINGS_IMPLEMENTATION === 'legacy' ? 'legacy' : 'cipher');
```

In the destructured implementation from Task 4, change only the environment fallback expression from legacy-by-default to Cipher-by-default.

Remove `import './styles/settings-ciphertalk.css';` from `App.tsx`. Keep the old file and legacy components for rollback; the legacy entry may import that stylesheet lazily from its own wrapper if visual rollback requires it.

- [ ] **Step 5: Run focused and static GREEN gates**

```powershell
npm test -- --run src/features/settings src/platform/settings src/components/SettingsWorkspace.test.tsx
npm run test:settings-source
npm run test:settings-boundary
node tests/static/production-settings.structure.test.mjs
node tests/static/models-dev-catalog.test.mjs
node tests/static/ai-capability-bridge.test.mjs
node tests/static/settings-privacy-boundary.test.mjs
```

`settings-privacy-boundary.test.mjs` must scan only `src`, `src-tauri/src`, `src-tauri/tests`, `tests`, `scripts`, `README.md`, `THIRD_PARTY_NOTICES.md`, and `docs/licenses`; skip `node_modules`, `dist`, `target`, `outputs`, screenshots, visual profiles, binaries, lockfiles, and `.env*`. Detect private-key headers, credential-bearing URLs, known cloud access-key formats, and literal credential assignments to names matching `apiKey|accessToken|refreshToken|clientSecret|password|cookie|authorization`. Allow only explicitly enumerated synthetic fixtures. A failure may print `relative-path:line:rule-id` but must never print the matched text or surrounding line.

Expected: all focused/static/privacy gates pass; catalog remains 116/3,926; the privacy test reports zero non-fixture candidates without echoing secrets.

- [ ] **Step 6: Run the full frontend and visual gates**

```powershell
npm test
npm run build
node tests/static/complete-workbench-capabilities.test.mjs
node task13-settings-visual-matrix.mjs
```

Expected: all Vitest files/tests pass, TypeScript/Vite exits 0, capability audit passes, and the visual matrix reports every required case passing.

- [ ] **Step 7: Run serial offline Rust and privacy gates**

```powershell
$env:PATH='C:\Users\commender\.rustup\toolchains\stable-x86_64-pc-windows-msvc\bin;' + $env:PATH
$env:CARGO_BUILD_JOBS='1'
cargo test --offline --manifest-path src-tauri/Cargo.toml --jobs 1
cargo check --offline --manifest-path src-tauri/Cargo.toml --jobs 1
```

The privacy gate is the exact Node command from Step 5; do not replace it with `Get-Content`, `Select-String`, or any command that prints a matching source line.

Expected: Rust exits 0 with only recorded existing test warnings/ignored documentation test; the already-passed privacy gate found zero non-fixture credential candidates.

- [ ] **Step 8: Write the final review report**

`outputs/ciphertalk-settings-transplant-review.md` must contain:

- source commit and copied file inventory;
- dependencies added;
- every Electron API replaced;
- every page/control mapped to a platform method;
- focused/full frontend results;
- static/catalog/capability/privacy results;
- serial Rust results;
- visual case count and baseline comparison;
- documented WebView2 compatibility changes;
- legacy rollback command `$env:VITE_SETTINGS_IMPLEMENTATION='legacy'`;
- confirmation that no MSI/NSIS or no-bundle EXE was built or run.

- [ ] **Step 9: Commit Task 12**

```powershell
git add src/App.tsx src/features/settings/SettingsEntry.tsx src/features/settings/SettingsEntry.test.tsx tests/static/production-settings.structure.test.mjs tests/static/settings-privacy-boundary.test.mjs production-workbench.visual.test.mjs task13-settings-visual-matrix.mjs README.md
git commit -m "feat: enable CipherTalk settings transplant"
```

Do not force-add ignored `outputs` or root planning files unless the user explicitly asks to track generated evidence.

---

## Final Definition of Done

- The default Settings route renders the five source-derived CipherTalk pages.
- `VITE_SETTINGS_IMPLEMENTATION=legacy` restores the old Settings implementation without code changes.
- No file under `src/features/settings` imports Electron, Node built-ins, `@tauri-apps/api`, `src/lib/bridge.ts`, or calls `invoke/listen`.
- Every enabled visible action reaches a real `src/platform/settings` method.
- Appearance rapid changes serialize and latest-failure rollback is tested.
- SenseVoice, Whisper, CUDA, profile, catalog, capability, cache, log, export, and About operations retain their existing safety contracts.
- The provider catalog remains 116 providers / 3,926 models with four executable protocols.
- Stored credentials never rehydrate into React.
- CipherTalk attribution/license/modification notices are present.
- Non-Settings routes show no style or geometry regression.
- Full frontend, build, static, visual, privacy, and serial offline Rust gates pass.
- No installer or release executable is built or executed by this plan.
