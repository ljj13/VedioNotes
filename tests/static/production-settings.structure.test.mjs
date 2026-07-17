import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const read = (path) => readFileSync(resolve(path), 'utf8')
const settings = read('src/components/SettingsWorkspace.tsx')
const aiSettings = read('src/components/settings/AiAccessSettings.tsx')
const senseVoice = read('src/components/SenseVoiceManager.tsx')
const select = read('src/components/StyledSelect.tsx')
const searchableCombobox = read('src/components/SearchableCombobox.tsx')
const sidebar = read('src/components/WorkbenchSidebar.tsx')
const shell = read('src/components/WorkbenchShell.tsx')
const css = read('src/styles/app.css')
const navigation = read('src/lib/workbenchNavigation.ts')

for (const section of ['appearance', 'transcription', 'ai', 'data', 'about']) {
  assert.match(settings, new RegExp(`id: '${section}'`), `settings section ${section} exists`)
  assert.match(navigation, new RegExp(`'${section}'`), `navigation accepts ${section}`)
}
for (const mode of ['CPU 模式', 'GPU 模式', '在线模式']) assert.ok(settings.includes(mode), `${mode} exists`)
for (const mode of ['大模型', '向量', '重排', '联网', '语音', '作图', '本地智能体']) assert.ok(aiSettings.includes(mode), `${mode} exists`)
assert.ok(senseVoice.includes('SenseVoice 本地模型'), 'CPU mode is SenseVoice')
assert.ok(settings.includes('LocalModelManager'), 'GPU mode keeps local model manager')
assert.ok(settings.includes('CudaRuntimeManager'), 'GPU mode keeps CUDA manager')
assert.ok(aiSettings.includes('ProfileManager'), 'operational provider management stays connected')
assert.ok(settings.includes("setActiveProfile('transcription'"), 'online transcription selection calls the backend')
assert.ok(aiSettings.includes('getSummaryProviderCatalog'), 'summary provider catalog loads from the backend')
assert.ok(aiSettings.includes('saveAndActivateCatalogSummaryProfile'), 'summary provider and model save atomically')
assert.ok(!aiSettings.includes("setActiveProfile('summary'"), 'summary catalog selection remains a draft until save')

assert.match(select, /role="listbox"/, 'finite dropdown renders a listbox')
assert.match(select, /role="option"/, 'finite dropdown renders semantic options')
assert.match(searchableCombobox, /role="combobox"/, 'catalog dropdown renders a searchable combobox')
assert.match(searchableCombobox, /role="listbox"/, 'catalog dropdown renders a semantic listbox')
assert.match(searchableCombobox, /aria-disabled/, 'ineligible catalog models expose disabled state')
for (const key of ['ArrowDown', 'ArrowUp', 'Home', 'End', 'Enter', 'Escape']) assert.ok(select.includes(key), `dropdown supports ${key}`)
assert.match(css, /\.styled-select-menu\s*\{[^}]*border-radius:\s*16px/s, 'dropdown menu has custom rounded styling')
assert.match(css, /\.styled-select-option\[aria-selected='true'\]/, 'selected dropdown option has a visible state')

assert.doesNotMatch(shell, /WorkbenchTopbar/, 'redundant top bar is removed from the production shell')
assert.match(css, /grid-template-columns:\s*220px minmax\(0, 1fr\)/, 'expanded sidebar is 220px')
assert.match(css, /sidebar-collapsed[^}]*grid-template-columns:\s*88px/, 'collapsed sidebar is 88px')
assert.match(css, /is-collapsed \.sidebar-label[^}]*max-width:\s*0/, 'collapsed sidebar removes label width')
assert.match(sidebar, /ready-dot/, 'collapsed sidebar keeps the service status dot')

// ---- Cipher settings structure (new transplant) ----
const cipherEntry = read('src/features/settings/SettingsEntry.tsx')
const cipherShell = read('src/features/settings/CipherSettingsShell.tsx')
const cipherCss = read('src/styles/cipher-settings.css')
const sourceManifest = read('src/features/settings/sourceManifest.ts')

assert.match(cipherEntry, /'legacy' \? 'legacy' : 'cipher'/, 'SettingsEntry defaults to cipher')
assert.match(cipherShell, /cipher-settings-root/, 'CipherSettingsShell uses cipher-settings-root class')
assert.match(cipherShell, /cipher-settings-body/, 'CipherSettingsShell uses cipher-settings-body class')
assert.match(cipherCss, /\.cipher-settings-root\s*\{/, 'cipher-settings.css scopes to .cipher-settings-root')
assert.match(cipherCss, /\.cipher-confirm-overlay/, 'cipher CSS has confirm dialog styles')
assert.match(cipherCss, /\.cipher-error-banner/, 'cipher CSS has error banner')
assert.match(cipherCss, /\.cipher-success-banner/, 'cipher CSS has success banner')
assert.match(cipherCss, /\.cipher-empty-state/, 'cipher CSS has empty state')
assert.ok(cipherCss.includes('@media'), 'cipher CSS has responsive breakpoints')

// Source manifest verifies CipherTalk commit
assert.match(sourceManifest, /b5b580c5af7672a729a0c7fc10b8b1511fe6d478/, 'source manifest locks CipherTalk commit')
assert.match(sourceManifest, /CC BY-NC-SA/, 'source manifest declares CC BY-NC-SA license')

console.log('production settings structure: pass')
