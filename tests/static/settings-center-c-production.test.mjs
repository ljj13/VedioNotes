import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const read = (path) => readFileSync(resolve(path), 'utf8');

test('production Cipher settings uses the approved C layout and container queries', () => {
  const shell = read('src/features/settings/CipherSettingsShell.tsx');
  const css = read('src/styles/cipher-settings.css');

  assert.match(shell, /settings-shell-layout[\s\S]*settings-page-header[\s\S]*settings-navigation-tabs[\s\S]*settings-body/);
  assert.doesNotMatch(shell, /settings-navigation-rail/);
  assert.doesNotMatch(shell, /settings-navigation-heading/);
  assert.match(css, /\.cipher-settings-root\.settings-page\s*\{[^}]*container-type:\s*inline-size[^}]*container-name:\s*settings-stage/s);
  assert.match(css, /\.cipher-settings-root \.settings-shell-layout\s*\{[^}]*grid-template-areas:\s*['"]header tabs['"]\s*['"]body body['"]/s);
  assert.match(css, /@container settings-stage \(max-width:\s*760px\)/);
  assert.match(css, /@container settings-stage \(max-width:\s*520px\)/);
  assert.match(css, /\.cipher-settings-root \.settings-navigation-tabs\s*\{[^}]*overflow-x:\s*auto/s);
  assert.match(css, /\.cipher-settings-root \.settings-body\s*\{[^}]*grid-area:\s*body/s);
});

test('production About cards use container-based safe wrapping', () => {
  const about = read('src/features/settings/tabs/AboutTab.tsx');
  const css = read('src/styles/cipher-settings.css');

  for (const className of [
    'cipher-about-panel', 'cipher-about-component-grid', 'cipher-about-component-card',
    'cipher-about-version-card', 'cipher-about-directory-grid', 'cipher-about-directory-card',
    'cipher-about-source-card',
  ]) assert.ok(about.includes(className), `AboutTab exposes ${className}`);
  assert.match(css, /@container settings-panel \(max-width:\s*780px\)/);
  assert.match(css, /@container settings-panel \(max-width:\s*700px\)/);
  assert.match(css, /\.cipher-settings-root \.cipher-about-safe-copy[^}]*overflow-wrap:\s*anywhere[^}]*word-break:\s*break-word/s);
  assert.match(about, /snapshot\.appDataDir/);
  assert.match(about, /snapshot\.exportDir/);
  assert.match(about, /snapshot\.logDir/);
});
