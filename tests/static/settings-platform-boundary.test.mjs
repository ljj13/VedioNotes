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
for (const file of walk(root).filter((path) => /\.(ts|tsx)$/.test(path) && !/\.test\./.test(path))) {
  const source = readFileSync(file, 'utf8')
  assert.doesNotMatch(source, /window\.electronAPI/, file + ' uses Electron')
  assert.doesNotMatch(source, /from ['"]node:/, file + ' uses Node')
  assert.doesNotMatch(source, /@tauri-apps\/api/, file + ' imports Tauri directly')
  assert.doesNotMatch(source, /\binvoke\s*\(/, file + ' calls invoke directly')
  assert.doesNotMatch(source, /\blisten\s*\(/, file + ' calls listen directly')
}
console.log('settings platform boundary: pass')
