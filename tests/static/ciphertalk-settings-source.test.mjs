/** ciphertalk-settings-source.test 测试 */
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
